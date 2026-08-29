import type { Express } from "express";
import { db } from "../db";
import { newsFeedPosts, newsFeedReactions, staff, students, studentLocations } from "@shared/schema";
import { eq, desc, and, sql, inArray, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { getEffectivePermissions } from "../storage/permissions.storage";

const NEWS_FEED_RESOURCE = "/news-feed";

const VALID_REACTIONS = ["👍", "❤️", "🎉", "😮", "😢", "👏"] as const;
type Reaction = (typeof VALID_REACTIONS)[number];
const EMPTY_REACTIONS: Record<Reaction, number> = {
  "👍": 0, "❤️": 0, "🎉": 0, "😮": 0, "😢": 0, "👏": 0,
};

/* ─── Permission resolver ──────────────────────────────────── */

async function resolveNewsFeedPerms(req: any) {
  const isSuperAdmin: boolean = req.isSuperAdmin ?? false;
  const roleIds: string[] = req.roleIds ?? [];
  const myUserId: string | null = (req.user as any)?.id ?? null;
  let myLocationIds: string[] = req.allowedLocationIds ?? [];

  if (isSuperAdmin) {
    return {
      isSuperAdmin: true,
      canView: true,
      canViewAll: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      myUserId,
      myLocationIds,
    };
  }

  // Student / parent: không có roleIds → cấp canView mặc định
  // Nếu allowedLocationIds chưa được set (route không qua locationAccessMiddleware),
  // ta tự tra studentLocations từ DB.
  if (roleIds.length === 0 && myUserId) {
    const [studentRecord] = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.userId, myUserId))
      .limit(1);

    if (studentRecord) {
      // Lấy cơ sở nếu chưa có (route không dùng locationAccessMiddleware)
      if (myLocationIds.length === 0) {
        const locRows = await db
          .select({ locationId: studentLocations.locationId })
          .from(studentLocations)
          .where(eq(studentLocations.studentId, studentRecord.id));
        myLocationIds = locRows.map(r => r.locationId);
      }
      return {
        isSuperAdmin: false,
        canView: true,
        canViewAll: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        myUserId,
        myLocationIds,
      };
    }
  }

  const raw = await getEffectivePermissions(roleIds, NEWS_FEED_RESOURCE);
  return {
    isSuperAdmin: false,
    canView: raw.canView,
    canViewAll: raw.canViewAll,
    canCreate: raw.canCreate,
    canEdit: raw.canEdit,
    canDelete: raw.canDelete,
    myUserId,
    myLocationIds,
  };
}

/* ─── Location-scope WHERE clause ──────────────────────────── */
/**
 * Bài viết visible nếu thuộc cơ sở của user, xét cả 2 cột:
 *   - locationId  (cũ / mobile-created): UUID đơn
 *   - postLocationIds (mới / web-created): jsonb array
 *   - Cả hai đều NULL → bài toàn hệ thống, ai cũng thấy
 * isSuperAdmin: không lọc — xem tất cả.
 */
function buildLocationFilter(perms: Awaited<ReturnType<typeof resolveNewsFeedPerms>>) {
  if (perms.isSuperAdmin) return undefined; // no filter
  if (!perms.canView && !perms.canViewAll) return sql`false`; // blocked

  // Không có cơ sở nào → chỉ thấy bài toàn hệ thống (cả hai cột đều null)
  if (perms.myLocationIds.length === 0) {
    return and(
      isNull(newsFeedPosts.locationId),
      isNull(newsFeedPosts.postLocationIds),
    );
  }

  const paramBindings = sql.join(
    perms.myLocationIds.map(id => sql`${id}`),
    sql`, `,
  );

  return or(
    // Bài toàn hệ thống (cả hai cột đều null)
    and(isNull(newsFeedPosts.locationId), isNull(newsFeedPosts.postLocationIds)),
    // Bài gán theo locationId đơn (mobile/cũ)
    inArray(newsFeedPosts.locationId, perms.myLocationIds),
    // Bài gán theo postLocationIds jsonb (web/mới)
    sql`EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(${newsFeedPosts.postLocationIds}) AS _loc
      WHERE _loc = ANY(ARRAY[${paramBindings}]::text[])
    )`,
  );
}

/* ─── Reaction aggregation helper ──────────────────────────── */

async function enrichWithReactions(posts: any[], myUserId: string | null) {
  if (posts.length === 0) return [];
  const ids = posts.map((p) => p.id);

  const [reactionRows, myRows] = await Promise.all([
    db
      .select({
        postId: newsFeedReactions.postId,
        reaction: newsFeedReactions.reaction,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(newsFeedReactions)
      .where(inArray(newsFeedReactions.postId, ids))
      .groupBy(newsFeedReactions.postId, newsFeedReactions.reaction),
    myUserId
      ? db
          .select({ postId: newsFeedReactions.postId, reaction: newsFeedReactions.reaction })
          .from(newsFeedReactions)
          .where(and(inArray(newsFeedReactions.postId, ids), eq(newsFeedReactions.userId, myUserId)))
      : Promise.resolve([]),
  ]);

  const totals: Record<string, Record<string, number>> = {};
  for (const r of reactionRows) {
    if (!totals[r.postId]) totals[r.postId] = {};
    totals[r.postId][r.reaction] = r.count;
  }
  const mine: Record<string, string> = {};
  for (const r of myRows) mine[r.postId] = r.reaction;

  return posts.map((p) => ({
    ...p,
    reactions: { ...EMPTY_REACTIONS, ...(totals[p.id] ?? {}) },
    myReaction: mine[p.id] ?? null,
  }));
}

/* ─── Zod schemas ──────────────────────────────────────────── */

const VALID_CATEGORIES = ["thong-bao", "su-kien", "hoat-dong", "hoc-thuat", "khuyen-mai"] as const;

const createPostSchema = z.object({
  content: z.string().min(1, "Nội dung không được để trống").max(10000),
  category: z.enum(VALID_CATEGORIES),
  imageUrls: z.array(z.string().url()).optional().default([]),
  locationId: z.string().uuid().nullable().optional(),
});

const editPostSchema = z.object({
  content: z.string().min(1).max(10000).optional(),
  category: z.enum(VALID_CATEGORIES).optional(),
  imageUrls: z.array(z.string().url()).optional(),
});

const reactSchema = z.object({
  reaction: z.enum(VALID_REACTIONS),
});

/* ─── Routes ───────────────────────────────────────────────── */

export function registerMobileNewsFeedRoutes(app: Express) {

  /**
   * GET /api/mobile/news-feed
   *
   * Danh sách bài viết, lọc theo cơ sở của user.
   * Query params:
   *   category  — "thong-bao" | "su-kien" | "hoat-dong" | "hoc-thuat"
   *   limit     — số bài mỗi trang (mặc định 20, tối đa 100)
   *   offset    — bỏ qua N bài đầu
   *
   * Response:
   * {
   *   permissions: { canView, canViewAll, canCreate, canEdit, canDelete },
   *   posts: [
   *     {
   *       id, authorId, authorName, authorRole, category, content,
   *       imageUrl, imageUrls, isPinned, locationId, createdAt, updatedAt,
   *       reactions: { "👍": n, ... },
   *       myReaction: "👍" | null
   *     }
   *   ],
   *   total: number,
   *   limit: number,
   *   offset: number
   * }
   */
  app.get("/api/mobile/news-feed", async (req, res) => {
    try {
      const perms = await resolveNewsFeedPerms(req);
      if (!perms.canView && !perms.canViewAll && !perms.isSuperAdmin) {
        return res.status(403).json({ message: "Bạn không có quyền xem bảng tin." });
      }

      const limit = Math.min(parseInt((req.query.limit as string) || "20", 10), 100);
      const offset = parseInt((req.query.offset as string) || "0", 10);
      const category = req.query.category as string | undefined;

      const locationFilter = buildLocationFilter(perms);

      const catFilter =
        category && category !== "all"
          ? eq(newsFeedPosts.category, category)
          : undefined;

      const whereClause =
        locationFilter && catFilter
          ? and(locationFilter, catFilter)
          : locationFilter ?? catFilter;

      const [posts, countRow] = await Promise.all([
        db
          .select()
          .from(newsFeedPosts)
          .where(whereClause)
          .orderBy(desc(newsFeedPosts.isPinned), desc(newsFeedPosts.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`cast(count(*) as int)` })
          .from(newsFeedPosts)
          .where(whereClause),
      ]);

      const enriched = await enrichWithReactions(posts, perms.myUserId);

      return res.json({
        permissions: {
          canView: perms.canView,
          canViewAll: perms.canViewAll,
          canCreate: perms.canCreate,
          canEdit: perms.canEdit,
          canDelete: perms.canDelete,
        },
        posts: enriched,
        total: countRow[0]?.count ?? 0,
        limit,
        offset,
      });
    } catch (err: any) {
      console.error("[MobileNewsFeed] List error:", err);
      return res.status(500).json({ message: "Lỗi khi tải bảng tin." });
    }
  });

  /**
   * GET /api/mobile/news-feed/pinned
   *
   * Lấy tối đa 3 bài đang được ghim trong phạm vi cơ sở của user.
   * Đặt trước /:id để tránh Express match "pinned" như post ID.
   *
   * Response: { permissions: {...}, posts: [...] }
   */
  app.get("/api/mobile/news-feed/pinned", async (req, res) => {
    try {
      const perms = await resolveNewsFeedPerms(req);
      if (!perms.canView && !perms.canViewAll && !perms.isSuperAdmin) {
        return res.status(403).json({ message: "Bạn không có quyền xem bảng tin." });
      }

      const locationFilter = buildLocationFilter(perms);
      const whereClause = locationFilter
        ? and(locationFilter, eq(newsFeedPosts.isPinned, true))
        : eq(newsFeedPosts.isPinned, true);

      const posts = await db
        .select()
        .from(newsFeedPosts)
        .where(whereClause)
        .orderBy(desc(newsFeedPosts.createdAt))
        .limit(3);

      const enriched = await enrichWithReactions(posts, perms.myUserId);

      return res.json({
        permissions: {
          canView: perms.canView,
          canViewAll: perms.canViewAll,
          canCreate: perms.canCreate,
          canEdit: perms.canEdit,
          canDelete: perms.canDelete,
        },
        posts: enriched,
      });
    } catch (err: any) {
      console.error("[MobileNewsFeed] Pinned error:", err);
      return res.status(500).json({ message: "Lỗi khi tải bài ghim." });
    }
  });

  /**
   * GET /api/mobile/news-feed/:id
   *
   * Chi tiết một bài viết.
   *
   * Response: { permissions: { canEdit, canDelete }, post: {...} }
   */
  app.get("/api/mobile/news-feed/:id", async (req, res) => {
    try {
      const perms = await resolveNewsFeedPerms(req);
      if (!perms.canView && !perms.canViewAll && !perms.isSuperAdmin) {
        return res.status(403).json({ message: "Bạn không có quyền xem bảng tin." });
      }

      const [post] = await db
        .select()
        .from(newsFeedPosts)
        .where(eq(newsFeedPosts.id, req.params.id))
        .limit(1);

      if (!post) return res.status(404).json({ message: "Không tìm thấy bài viết." });

      // Check location scope (non-superadmin)
      if (!perms.isSuperAdmin && post.locationId) {
        const allowed =
          perms.myLocationIds.length === 0 ||
          perms.myLocationIds.includes(post.locationId);
        if (!allowed) return res.status(403).json({ message: "Bạn không có quyền xem bài viết này." });
      }

      const [enriched] = await enrichWithReactions([post], perms.myUserId);

      return res.json({
        permissions: {
          canEdit: perms.canEdit,
          canDelete: perms.canDelete,
          isOwner: post.authorId === perms.myUserId,
        },
        post: enriched,
      });
    } catch (err: any) {
      console.error("[MobileNewsFeed] Detail error:", err);
      return res.status(500).json({ message: "Lỗi khi tải bài viết." });
    }
  });

  /**
   * POST /api/mobile/news-feed
   *
   * Đăng bài viết mới. Yêu cầu canCreate.
   *
   * Body: { content, category, imageUrls?, locationId? }
   * Response: { post: {...} }
   */
  app.post("/api/mobile/news-feed", async (req, res) => {
    try {
      const perms = await resolveNewsFeedPerms(req);
      if (!perms.canCreate) {
        return res.status(403).json({ message: "Bạn không có quyền đăng bài viết." });
      }

      const parsed = createPostSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const userId = perms.myUserId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      // Resolve author name
      const [staffRow] = await db
        .select({ fullName: staff.fullName })
        .from(staff)
        .where(eq(staff.userId, userId))
        .limit(1);

      const authorName = staffRow?.fullName ?? (req.user as any)?.username ?? "Người dùng";
      const urls = parsed.data.imageUrls ?? [];

      const [post] = await db
        .insert(newsFeedPosts)
        .values({
          authorId: userId,
          authorName,
          category: parsed.data.category,
          content: parsed.data.content,
          imageUrl: urls[0] ?? null,
          imageUrls: urls.length > 0 ? urls : null,
          locationId: parsed.data.locationId ?? null,
        })
        .returning();

      return res.status(201).json({
        post: {
          ...post,
          reactions: { ...EMPTY_REACTIONS },
          myReaction: null,
        },
      });
    } catch (err: any) {
      console.error("[MobileNewsFeed] Create error:", err);
      return res.status(500).json({ message: "Lỗi khi đăng bài viết." });
    }
  });

  /**
   * PATCH /api/mobile/news-feed/:id
   *
   * Chỉnh sửa bài viết. Yêu cầu canEdit + là tác giả.
   *
   * Body: { content?, category?, imageUrls? }
   * Response: { post: {...} }
   */
  app.patch("/api/mobile/news-feed/:id", async (req, res) => {
    try {
      const perms = await resolveNewsFeedPerms(req);
      if (!perms.canEdit) {
        return res.status(403).json({ message: "Bạn không có quyền chỉnh sửa bài viết." });
      }

      const [existing] = await db
        .select()
        .from(newsFeedPosts)
        .where(eq(newsFeedPosts.id, req.params.id))
        .limit(1);

      if (!existing) return res.status(404).json({ message: "Không tìm thấy bài viết." });
      if (!perms.isSuperAdmin && existing.authorId !== perms.myUserId) {
        return res.status(403).json({ message: "Bạn chỉ có thể sửa bài viết của mình." });
      }

      const parsed = editPostSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const { imageUrls, ...rest } = parsed.data;
      const setData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
      if (imageUrls !== undefined) {
        setData.imageUrls = imageUrls.length > 0 ? imageUrls : null;
        setData.imageUrl = imageUrls[0] ?? null;
      }

      const [updated] = await db
        .update(newsFeedPosts)
        .set(setData as any)
        .where(eq(newsFeedPosts.id, req.params.id))
        .returning();

      const [enriched] = await enrichWithReactions([updated], perms.myUserId);

      return res.json({ post: enriched });
    } catch (err: any) {
      console.error("[MobileNewsFeed] Edit error:", err);
      return res.status(500).json({ message: "Lỗi khi chỉnh sửa bài viết." });
    }
  });

  /**
   * DELETE /api/mobile/news-feed/:id
   *
   * Xoá bài viết. Yêu cầu canDelete + là tác giả (trừ superAdmin).
   *
   * Response: { message: "Đã xoá bài viết." }
   */
  app.delete("/api/mobile/news-feed/:id", async (req, res) => {
    try {
      const perms = await resolveNewsFeedPerms(req);
      if (!perms.canDelete) {
        return res.status(403).json({ message: "Bạn không có quyền xoá bài viết." });
      }

      const [existing] = await db
        .select()
        .from(newsFeedPosts)
        .where(eq(newsFeedPosts.id, req.params.id))
        .limit(1);

      if (!existing) return res.status(404).json({ message: "Không tìm thấy bài viết." });
      if (!perms.isSuperAdmin && existing.authorId !== perms.myUserId) {
        return res.status(403).json({ message: "Bạn chỉ có thể xoá bài viết của mình." });
      }

      await db.delete(newsFeedPosts).where(eq(newsFeedPosts.id, req.params.id));
      return res.json({ message: "Đã xoá bài viết." });
    } catch (err: any) {
      console.error("[MobileNewsFeed] Delete error:", err);
      return res.status(500).json({ message: "Lỗi khi xoá bài viết." });
    }
  });

  /**
   * POST /api/mobile/news-feed/:id/react
   *
   * Thả / rút cảm xúc. Thả cùng loại lần 2 = rút. Yêu cầu canView.
   *
   * Body: { reaction: "👍" | "❤️" | "🎉" | "😮" | "😢" | "👏" }
   * Response: { myReaction: "👍" | null }
   */
  app.post("/api/mobile/news-feed/:id/react", async (req, res) => {
    try {
      const perms = await resolveNewsFeedPerms(req);
      if (!perms.canView && !perms.canViewAll && !perms.isSuperAdmin) {
        return res.status(403).json({ message: "Bạn không có quyền thả cảm xúc." });
      }

      const userId = perms.myUserId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const parsed = reactSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const { reaction } = parsed.data;
      const postId = req.params.id;

      const [existing] = await db
        .select()
        .from(newsFeedReactions)
        .where(and(eq(newsFeedReactions.postId, postId), eq(newsFeedReactions.userId, userId)))
        .limit(1);

      if (existing) {
        if (existing.reaction === reaction) {
          // Toggle off
          await db
            .delete(newsFeedReactions)
            .where(and(eq(newsFeedReactions.postId, postId), eq(newsFeedReactions.userId, userId)));
          return res.json({ myReaction: null });
        } else {
          // Change reaction
          await db
            .update(newsFeedReactions)
            .set({ reaction })
            .where(and(eq(newsFeedReactions.postId, postId), eq(newsFeedReactions.userId, userId)));
          return res.json({ myReaction: reaction });
        }
      } else {
        await db.insert(newsFeedReactions).values({ postId, userId, reaction });
        return res.json({ myReaction: reaction });
      }
    } catch (err: any) {
      console.error("[MobileNewsFeed] React error:", err);
      return res.status(500).json({ message: "Lỗi khi thả cảm xúc." });
    }
  });

  /**
   * PATCH /api/mobile/news-feed/:id/pin
   *
   * Ghim / bỏ ghim bài viết. Yêu cầu canEdit.
   *
   * Response: { isPinned: boolean }
   */
  app.patch("/api/mobile/news-feed/:id/pin", async (req, res) => {
    try {
      const perms = await resolveNewsFeedPerms(req);
      if (!perms.canEdit) {
        return res.status(403).json({ message: "Bạn không có quyền ghim bài viết." });
      }

      const [post] = await db
        .select({ id: newsFeedPosts.id, isPinned: newsFeedPosts.isPinned })
        .from(newsFeedPosts)
        .where(eq(newsFeedPosts.id, req.params.id))
        .limit(1);

      if (!post) return res.status(404).json({ message: "Không tìm thấy bài viết." });

      const [updated] = await db
        .update(newsFeedPosts)
        .set({ isPinned: !post.isPinned, updatedAt: new Date() })
        .where(eq(newsFeedPosts.id, req.params.id))
        .returning({ isPinned: newsFeedPosts.isPinned });

      return res.json({ isPinned: updated.isPinned });
    } catch (err: any) {
      console.error("[MobileNewsFeed] Pin error:", err);
      return res.status(500).json({ message: "Lỗi khi ghim bài viết." });
    }
  });
}
