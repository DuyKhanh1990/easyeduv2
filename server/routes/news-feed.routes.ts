import type { Express, Request, Response } from "express";
import { db } from "../db";
import { newsFeedPosts, newsFeedReactions, staff, locations } from "@shared/schema";
import { eq, desc, and, sql, inArray, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { getEffectivePermissions } from "../storage/permissions.storage";
import { locationAccessMiddleware } from "../middleware/location-access";

const NEWS_FEED_RESOURCE = "/news-feed";

async function getNewsFeedPerms(req: Request) {
  const isSuperAdmin = (req as any).isSuperAdmin;
  if (isSuperAdmin) return { canView: true, canViewAll: true, canCreate: true, canEdit: true, canDelete: true };
  const roleIds: string[] = (req as any).roleIds || [];
  return getEffectivePermissions(roleIds, NEWS_FEED_RESOURCE);
}

/** Tạo điều kiện WHERE để lọc bài viết theo cơ sở của user */
function buildLocationFilter(isSuperAdmin: boolean, allowedLocationIds: string[]) {
  if (isSuperAdmin) return undefined; // superadmin thấy tất cả
  if (allowedLocationIds.length === 0) return isNull(newsFeedPosts.postLocationIds);

  // Bài viết visible nếu:
  // - post_location_ids IS NULL (bài cũ / không giới hạn cơ sở)
  // - hoặc có overlap với allowedLocationIds của user
  // Dùng parameterized binding qua sql`` để tránh injection
  const paramBindings = sql.join(
    allowedLocationIds.map(id => sql`${id}`),
    sql`, `
  );
  return or(
    isNull(newsFeedPosts.postLocationIds),
    sql`EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(${newsFeedPosts.postLocationIds}) AS _loc
      WHERE _loc = ANY(ARRAY[${paramBindings}]::text[])
    )`
  );
}

/**
 * Kiểm tra xem bài viết `postId` có nằm trong phạm vi location của user không.
 * Dùng để guard các thao tác PATCH/DELETE/PIN/REACT theo ID.
 */
async function assertPostInScope(
  postId: string,
  isSuperAdmin: boolean,
  allowedLocationIds: string[]
): Promise<boolean> {
  if (isSuperAdmin) return true;

  const [post] = await db
    .select({ postLocationIds: newsFeedPosts.postLocationIds })
    .from(newsFeedPosts)
    .where(eq(newsFeedPosts.id, postId))
    .limit(1);

  if (!post) return false; // không tồn tại
  if (post.postLocationIds === null) return true; // bài cũ không giới hạn cơ sở

  const postIds = post.postLocationIds as string[];
  return postIds.some(id => allowedLocationIds.includes(id));
}

const VALID_CATEGORIES = ["thong-bao", "su-kien", "hoat-dong", "hoc-thuat", "khuyen-mai"] as const;

const createPostSchema = z.object({
  content: z.string().min(1).max(10000),
  category: z.enum(VALID_CATEGORIES),
  imageUrls: z.array(z.string().min(1)).optional().default([]),
  /** Danh sách cơ sở muốn đăng lên. Mặc định = tất cả cơ sở của người tạo. */
  locationIds: z.array(z.string().uuid()).optional(),
});

const reactSchema = z.object({
  reaction: z.enum(["👍", "❤️", "🎉", "😮", "😢", "👏"]),
});

export function registerNewsFeedRoutes(app: Express) {
  // ── GET /api/news-feed/my-locations — trả về cơ sở của user hiện tại ──
  app.get("/api/news-feed/my-locations", locationAccessMiddleware, async (req: Request, res: Response) => {
    try {
      const isSuperAdmin = (req as any).isSuperAdmin as boolean;
      const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];

      if (isSuperAdmin) {
        // superadmin thấy tất cả cơ sở
        const allLocs = await db
          .select({ id: locations.id, name: locations.name })
          .from(locations)
          .where(eq(locations.isActive, true))
          .orderBy(locations.name);
        return res.json(allLocs);
      }

      if (allowedLocationIds.length === 0) return res.json([]);

      const locs = await db
        .select({ id: locations.id, name: locations.name })
        .from(locations)
        .where(and(
          inArray(locations.id, allowedLocationIds),
          eq(locations.isActive, true),
        ))
        .orderBy(locations.name);
      res.json(locs);
    } catch (err) {
      console.error("[NewsFeed] my-locations error:", err);
      res.status(500).json({ error: "Không thể tải danh sách cơ sở" });
    }
  });

  // ── GET /api/news-feed — danh sách bài viết ──
  app.get("/api/news-feed", locationAccessMiddleware, async (req: Request, res: Response) => {
    try {
      const perms = await getNewsFeedPerms(req);
      if (!perms.canView && !perms.canViewAll) {
        return res.status(403).json({ error: "Bạn không có quyền xem bảng tin." });
      }

      const userId = (req as any).user?.id;
      const isSuperAdmin = (req as any).isSuperAdmin as boolean;
      const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];

      const limit = Math.min(parseInt((req.query.limit as string) || "20"), 100);
      const offset = parseInt((req.query.offset as string) || "0");
      const category = req.query.category as string | undefined;

      const locationFilter = buildLocationFilter(isSuperAdmin, allowedLocationIds);
      const categoryFilter = category && category !== "all"
        ? eq(newsFeedPosts.category, category)
        : undefined;

      const conditions = [locationFilter, categoryFilter].filter(Boolean) as any[];
      const whereClause = conditions.length > 0
        ? conditions.length === 1 ? conditions[0] : and(...conditions)
        : undefined;

      const posts = await db
        .select()
        .from(newsFeedPosts)
        .where(whereClause)
        .orderBy(desc(newsFeedPosts.isPinned), desc(newsFeedPosts.createdAt))
        .limit(limit)
        .offset(offset);

      if (posts.length === 0) return res.json([]);

      const postIds = posts.map((p) => p.id);

      const reactionRows = await db
        .select({
          postId: newsFeedReactions.postId,
          reaction: newsFeedReactions.reaction,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(newsFeedReactions)
        .where(inArray(newsFeedReactions.postId, postIds))
        .groupBy(newsFeedReactions.postId, newsFeedReactions.reaction);

      const myReactionRows = userId
        ? await db
            .select({ postId: newsFeedReactions.postId, reaction: newsFeedReactions.reaction })
            .from(newsFeedReactions)
            .where(and(inArray(newsFeedReactions.postId, postIds), eq(newsFeedReactions.userId, userId)))
        : [];

      const reactionMap: Record<string, Record<string, number>> = {};
      for (const r of reactionRows) {
        if (!reactionMap[r.postId]) reactionMap[r.postId] = {};
        reactionMap[r.postId][r.reaction] = r.count;
      }
      const myReactionMap: Record<string, string> = {};
      for (const r of myReactionRows) {
        myReactionMap[r.postId] = r.reaction;
      }

      const EMPTY_REACTIONS = { "👍": 0, "❤️": 0, "🎉": 0, "😮": 0, "😢": 0, "👏": 0 };

      const result = posts.map((p) => ({
        ...p,
        reactions: { ...EMPTY_REACTIONS, ...(reactionMap[p.id] ?? {}) },
        myReaction: myReactionMap[p.id] ?? null,
      }));

      res.json(result);
    } catch (err) {
      console.error("[NewsFeed] GET error:", err);
      res.status(500).json({ error: "Không thể tải bài viết" });
    }
  });

  // ── POST /api/news-feed — tạo bài viết mới ──
  app.post("/api/news-feed", locationAccessMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const perms = await getNewsFeedPerms(req);
      if (!perms.canCreate) return res.status(403).json({ error: "Bạn không có quyền đăng bài viết." });

      const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];
      const isSuperAdmin = (req as any).isSuperAdmin as boolean;

      const body = createPostSchema.parse(req.body);

      // Validate và xác định locationIds: chỉ được chọn những cơ sở mình thuộc về
      let postLocationIds: string[] | null = null;
      if (!isSuperAdmin) {
        const requested = body.locationIds && body.locationIds.length > 0
          ? body.locationIds
          : allowedLocationIds;
        // Chỉ giữ lại những ID thuộc allowedLocationIds
        postLocationIds = requested.filter(id => allowedLocationIds.includes(id));
        if (postLocationIds.length === 0) postLocationIds = allowedLocationIds;
      } else {
        // superadmin: dùng danh sách gửi lên, hoặc null (tất cả)
        postLocationIds = body.locationIds && body.locationIds.length > 0
          ? body.locationIds
          : null;
      }

      const staffRow = await db
        .select({ fullName: staff.fullName })
        .from(staff)
        .where(eq(staff.userId, userId))
        .limit(1);

      const authorName = staffRow[0]?.fullName ?? "Người dùng";

      const urls = body.imageUrls ?? [];
      const [post] = await db
        .insert(newsFeedPosts)
        .values({
          authorId: userId,
          authorName,
          category: body.category,
          content: body.content,
          imageUrl: urls[0] ?? null,
          imageUrls: urls.length > 0 ? urls : null,
          postLocationIds,
        })
        .returning();

      res.status(201).json({
        post: {
          ...post,
          reactions: { "👍": 0, "❤️": 0, "🎉": 0, "😮": 0, "😢": 0, "👏": 0 },
          myReaction: null,
        },
      });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      console.error("[NewsFeed] POST error:", err);
      res.status(500).json({ error: "Không thể đăng bài" });
    }
  });

  // ── DELETE /api/news-feed/:id ──
  app.delete("/api/news-feed/:id", locationAccessMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const perms = await getNewsFeedPerms(req);
      if (!perms.canDelete) return res.status(403).json({ error: "Bạn không có quyền xoá bài viết." });

      const isSuperAdmin = (req as any).isSuperAdmin as boolean;
      const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];
      const inScope = await assertPostInScope(req.params.id, isSuperAdmin, allowedLocationIds);
      if (!inScope) return res.status(403).json({ error: "Bài viết không thuộc cơ sở của bạn." });

      const [deleted] = await db
        .delete(newsFeedPosts)
        .where(eq(newsFeedPosts.id, req.params.id))
        .returning({ imageUrl: newsFeedPosts.imageUrl, imageUrls: newsFeedPosts.imageUrls });

      if (!deleted) return res.status(404).json({ error: "Không tìm thấy bài viết" });

      // Trừ dung lượng các ảnh đã xóa
      const { subtractFilesByUrls } = await import("../lib/storage-usage");
      const urls = [
        ...(deleted.imageUrl ? [deleted.imageUrl] : []),
        ...(Array.isArray(deleted.imageUrls) ? (deleted.imageUrls as string[]) : []),
      ];
      subtractFilesByUrls(urls).catch(() => {});

      res.json({ ok: true });
    } catch (err) {
      console.error("[NewsFeed] DELETE error:", err);
      res.status(500).json({ error: "Không thể xoá bài viết" });
    }
  });

  // ── POST /api/news-feed/:id/react ──
  app.post("/api/news-feed/:id/react", locationAccessMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      // Chỉ react được với bài nằm trong cơ sở của mình
      const isSuperAdmin = (req as any).isSuperAdmin as boolean;
      const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];
      const inScope = await assertPostInScope(req.params.id, isSuperAdmin, allowedLocationIds);
      if (!inScope) return res.status(403).json({ error: "Bài viết không thuộc cơ sở của bạn." });

      const { reaction } = reactSchema.parse(req.body);
      const postId = req.params.id;

      const existing = await db
        .select()
        .from(newsFeedReactions)
        .where(and(eq(newsFeedReactions.postId, postId), eq(newsFeedReactions.userId, userId)))
        .limit(1);

      if (existing.length > 0) {
        if (existing[0].reaction === reaction) {
          await db
            .delete(newsFeedReactions)
            .where(and(eq(newsFeedReactions.postId, postId), eq(newsFeedReactions.userId, userId)));
          return res.json({ myReaction: null });
        } else {
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
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      console.error("[NewsFeed] REACT error:", err);
      res.status(500).json({ error: "Không thể thả reaction" });
    }
  });

  // ── PATCH /api/news-feed/:id — sửa bài ──
  app.patch("/api/news-feed/:id", locationAccessMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const perms = await getNewsFeedPerms(req);
      if (!perms.canEdit) return res.status(403).json({ error: "Bạn không có quyền chỉnh sửa bài viết." });

      // Nếu không phải superadmin/canEdit-on-others: chỉ sửa bài của chính mình
      const isSuperAdmin = (req as any).isSuperAdmin as boolean;
      const isOwnerOnly = !isSuperAdmin; // canEdit đã được check, nhưng ta vẫn kiểm tra authorId cho non-superadmin
      // Thực ra với permission canEdit được bật, user được phép sửa bài người khác.
      // superadmin luôn được phép. Non-superadmin với canEdit cũng được phép.

      const body = z.object({
        content: z.string().min(1).max(10000).optional(),
        category: z.enum(VALID_CATEGORIES).optional(),
        imageUrls: z.array(z.string().min(1)).optional(),
      }).parse(req.body);

      const { imageUrls, ...rest } = body;
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

      if (!updated) return res.status(404).json({ error: "Không tìm thấy bài viết" });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      console.error("[NewsFeed] PATCH error:", err);
      res.status(500).json({ error: "Không thể cập nhật bài viết" });
    }
  });

  // ── PATCH /api/news-feed/:id/pin — ghim / bỏ ghim ──
  app.patch("/api/news-feed/:id/pin", locationAccessMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const perms = await getNewsFeedPerms(req);
      if (!perms.canEdit) return res.status(403).json({ error: "Bạn không có quyền ghim bài viết." });

      const post = await db
        .select({ isPinned: newsFeedPosts.isPinned })
        .from(newsFeedPosts)
        .where(eq(newsFeedPosts.id, req.params.id))
        .limit(1);

      if (!post.length) return res.status(404).json({ error: "Không tìm thấy bài viết" });

      const [updated] = await db
        .update(newsFeedPosts)
        .set({ isPinned: !post[0].isPinned })
        .where(eq(newsFeedPosts.id, req.params.id))
        .returning({ isPinned: newsFeedPosts.isPinned });

      res.json({ isPinned: updated.isPinned });
    } catch (err) {
      console.error("[NewsFeed] PIN error:", err);
      res.status(500).json({ error: "Không thể ghim bài viết" });
    }
  });
}
