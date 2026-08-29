/**
 * chat.routes.ts
 *
 * Các API endpoint phục vụ tính năng chat (Tinode).
 *
 * GET  /api/chat/credentials   → trả credentials để browser tự kết nối WebSocket Tinode
 * GET  /api/chat/my-channels   → danh sách topic ID cho từng lớp của user
 * GET  /api/chat/channel/:id   → tenant check + lazy-create topic + trả topic ID
 * PUT  /api/chat/my-uid        → lưu Tinode UID cho user hiện tại
 * GET  /api/chat/user-names    → tra tên hiển thị theo danh sách Tinode UID
 */

import type { Express } from "express";
import { db } from "../db";
import { users, students, staff, studentClasses, classes, chatGroups, chatGroupMembers } from "@shared/schema";
import { eq, and, inArray, ilike, or, sql, isNotNull } from "drizzle-orm";
import { storage } from "../storage";
import multer from "multer";

// Cache chỉ cho bước ensureUserInTinode (idempotent, tốn ~400ms mỗi lần).
// Không cache login/password/token — chỉ đánh dấu "đã ensure rồi".
const ensureUserCache = new Map<string, number>(); // userId → expiresAt
const ENSURE_CACHE_TTL = 5 * 60 * 1000;

// Cache tên hiển thị theo Tinode UID (bao gồm cả kết quả rỗng).
// uid → { name: string | null, expiresAt: number }
const userNameCache = new Map<string, { name: string | null; expiresAt: number }>();
const USER_NAME_CACHE_TTL = 10 * 60 * 1000; // 10 phút

async function ensureUserCached(userId: string): Promise<void> {
  const expiresAt = ensureUserCache.get(userId) ?? 0;
  if (Date.now() < expiresAt) return;
  const { ensureUserInTinode } = await import("../lib/tinode.service");
  await ensureUserInTinode(userId);
  ensureUserCache.set(userId, Date.now() + ENSURE_CACHE_TTL);
}

export function registerChatRoutes(app: Express): void {

  // ─── GET /api/chat/credentials ───────────────────────────────────────────────
  app.get("/api/chat/credentials", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const userId = (req.user as any).id;

    try {
      const { isTinodeConfigured, getUserCredentials } = await import("../lib/tinode.service");
      if (!isTinodeConfigured()) {
        return res.status(503).json({ message: "Tính năng chat chưa được cấu hình" });
      }

      // Chỉ cache bước gọi Tinode API (idempotent), không cache credentials
      await ensureUserCached(userId);

      // Lấy tên hiển thị từ staff hoặc students
      let displayName: string | null = null;
      const [staffRow] = await db.select({ fullName: staff.fullName })
        .from(staff).where(eq(staff.userId, userId)).limit(1);
      if (staffRow) {
        displayName = staffRow.fullName;
      } else {
        const [studentRow] = await db.select({ fullName: students.fullName })
          .from(students).where(eq(students.userId, userId)).limit(1);
        if (studentRow) displayName = studentRow.fullName;
      }

      const creds = await getUserCredentials(userId);
      const isStudent = (req as any).isStudent ?? false;
      return res.json({ ...creds, displayName, isStudent });
    } catch (err: any) {
      console.error("[Chat] /api/chat/credentials error:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  });

  // ─── GET /api/chat/my-channels ───────────────────────────────────────────────
  /**
   * Trả về danh sách topic của các nhóm chat tùy chỉnh và DM của user.
   * Không còn bao gồm kênh lớp học tự động.
   */
  app.get("/api/chat/my-channels", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const userId = (req.user as any).id;

    try {
      const { isTinodeConfigured } = await import("../lib/tinode.service");

      if (!isTinodeConfigured()) {
        return res.json({ channels: [] });
      }

      // ── Custom chat groups ─────────────────────────────────────────────────
      const memberRows = await db
        .select({ groupId: chatGroupMembers.groupId })
        .from(chatGroupMembers)
        .where(eq(chatGroupMembers.userId, userId));

      const groupIds = memberRows.map(r => r.groupId);
      const customGroups = groupIds.length > 0
        ? await db.select().from(chatGroups).where(inArray(chatGroups.id, groupIds))
        : [];

      const groupChannels = customGroups
        .filter(g => !!g.tinodeTopicId && !g.isDirectMessage)
        .map(g => ({ topicId: g.tinodeTopicId!, className: g.name, classId: null, groupId: g.id, isCustomGroup: true, isDirectMessage: false }));

      // ── Also include DM (direct message) channels ────────────────────────────
      const dmRows = await db.execute(sql`
        SELECT g.id, g.tinode_topic_id,
               COALESCE(s.full_name, st.full_name, u.username) AS other_name
        FROM chat_groups g
        INNER JOIN chat_group_members m1 ON m1.group_id = g.id AND m1.user_id = ${userId}
        INNER JOIN chat_group_members m2 ON m2.group_id = g.id AND m2.user_id != ${userId}
        INNER JOIN users u ON u.id = m2.user_id
        LEFT JOIN staff s ON s.user_id = u.id
        LEFT JOIN students st ON st.user_id = u.id
        WHERE g.is_direct_message = TRUE AND g.tinode_topic_id IS NOT NULL
      `);
      const dmChannels = ((dmRows as any).rows ?? (dmRows as any) ?? [])
        .filter((r: any) => !!r.tinode_topic_id)
        .map((r: any) => ({
          topicId: r.tinode_topic_id as string,
          className: r.other_name as string ?? r.tinode_topic_id,
          classId: null,
          groupId: r.id as string,
          isCustomGroup: false,
          isDirectMessage: true,
        }));

      res.set("Cache-Control", "no-store");
      return res.json({
        channels: [
          ...groupChannels,
          ...dmChannels,
        ],
      });
    } catch (err: any) {
      console.error("[Chat] /api/chat/my-channels error:", err);
      return res.json({ channels: [] });
    }
  });

  // ─── PUT /api/chat/my-uid ────────────────────────────────────────────────────
  app.put("/api/chat/my-uid", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const userId = (req.user as any).id;
    const { tinodeUid } = req.body;
    if (!tinodeUid || typeof tinodeUid !== "string") {
      return res.status(400).json({ message: "tinodeUid required" });
    }
    try {
      await db.update(users)
        .set({ tinodeUserId: tinodeUid } as any)
        .where(eq(users.id, userId));
      // Xoá cache null cho UID mới này — nếu trước đây user chưa có UID và bị cache là null,
      // giờ cần xoá để các client khác fetch lại được tên thật.
      userNameCache.delete(tinodeUid);
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[Chat] /api/chat/my-uid error:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  });

  // ─── GET /api/chat/user-names ─────────────────────────────────────────────────
  app.get("/api/chat/user-names", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const uidsParam = req.query.uids as string;
    if (!uidsParam) return res.json({ names: {} });

    const uids = uidsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (uids.length === 0) return res.json({ names: {} });

    try {
      const now = Date.now();
      const names: Record<string, string> = {};
      const uncachedUids: string[] = [];

      // Kiểm tra cache trước
      for (const uid of uids) {
        const cached = userNameCache.get(uid);
        if (cached && now < cached.expiresAt) {
          if (cached.name) names[uid] = cached.name;
        } else {
          uncachedUids.push(uid);
        }
      }

      // Chỉ query DB cho UID chưa có trong cache
      if (uncachedUids.length > 0) {
        const rows = await db
          .select({
            tinodeUserId: users.tinodeUserId,
            staffName: staff.fullName,
            studentName: students.fullName,
          })
          .from(users)
          .leftJoin(staff, eq(staff.userId, users.id))
          .leftJoin(students, eq(students.userId, users.id))
          .where(inArray(users.tinodeUserId as any, uncachedUids));

        const foundUids = new Set<string>();
        for (const row of rows) {
          if (row.tinodeUserId) {
            const displayName = row.staffName ?? row.studentName ?? null;
            userNameCache.set(row.tinodeUserId, { name: displayName, expiresAt: now + USER_NAME_CACHE_TTL });
            if (displayName) names[row.tinodeUserId] = displayName;
            foundUids.add(row.tinodeUserId);
          }
        }
        // Cache cả kết quả rỗng để tránh re-query
        for (const uid of uncachedUids) {
          if (!foundUids.has(uid)) {
            userNameCache.set(uid, { name: null, expiresAt: now + USER_NAME_CACHE_TTL });
          }
        }
      }

      res.set("Cache-Control", "private, max-age=300");
      return res.json({ names });
    } catch (err: any) {
      console.error("[Chat] /api/chat/user-names error:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  });

  // ─── GET /api/chat/search-users ──────────────────────────────────────────────
  /**
   * Tìm kiếm học viên / nhân viên để mở chat P2P.
   * ?q=tên (tối thiểu 1 ký tự)
   * Trả về: [ { userId, displayName, role, tinodeLogin } ]
   */
  app.get("/api/chat/search-users", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const q = (req.query.q as string ?? "").trim();
    if (!q) return res.json({ users: [] });

    const userId = (req.user as any).id;
    const isStudent = (req as any).isStudent ?? false;

    try {
      const { getTinodeLogin } = await import("../lib/tinode.service");

      const pattern = `%${q}%`;

      let staffRows: { userId: string | null; fullName: string | null }[] = [];

      if (isStudent) {
        // Học viên / Phụ huynh: chỉ tìm giáo viên trong các lớp mình đang học
        const [studentRow] = await db
          .select({ id: students.id })
          .from(students)
          .where(eq(students.userId, userId))
          .limit(1);

        if (studentRow) {
          // Lấy tất cả teacherIds từ các lớp học viên đang tham gia
          const classRows = await db
            .select({ teacherIds: classes.teacherIds })
            .from(classes)
            .innerJoin(studentClasses, eq(studentClasses.classId, classes.id))
            .where(eq(studentClasses.studentId, studentRow.id));

          const teacherStaffIds = Array.from(
            new Set(classRows.flatMap(c => c.teacherIds ?? []))
          );

          if (teacherStaffIds.length > 0) {
            staffRows = await db
              .select({ userId: staff.userId, fullName: staff.fullName })
              .from(staff)
              .where(and(
                inArray(staff.id, teacherStaffIds),
                ilike(staff.fullName, pattern)
              ))
              .limit(10);
          }
        }

        // Học viên / Phụ huynh không tìm được học viên / phụ huynh khác
        const allUserIds = staffRows.map(r => r.userId).filter((id): id is string => !!id);
        const userRows = allUserIds.length > 0
          ? await db
              .select({ id: users.id, tinodeUserId: users.tinodeUserId })
              .from(users)
              .where(inArray(users.id, allUserIds))
          : [];
        const uidMap = Object.fromEntries(userRows.map(u => [u.id, u.tinodeUserId ?? null]));

        const results = staffRows
          .filter(r => !!r.userId && r.userId !== userId)
          .map(r => ({
            userId:      r.userId!,
            displayName: r.fullName ?? "Giáo viên",
            role:        "staff" as const,
            tinodeLogin: getTinodeLogin(r.userId!),
            tinodeUid:   uidMap[r.userId!] ?? null,
          }));

        return res.json({ users: results });
      }

      // Nhân viên / Admin: tìm tất cả nhân viên và học viên như cũ
      staffRows = await db
        .select({ userId: staff.userId, fullName: staff.fullName })
        .from(staff)
        .where(ilike(staff.fullName, pattern))
        .limit(10);

      const studentRows = await db
        .select({ userId: students.userId, fullName: students.fullName })
        .from(students)
        .where(and(ilike(students.fullName, pattern)))
        .limit(10);

      const allUserIds = [
        ...staffRows.map(r => r.userId),
        ...studentRows.map(r => r.userId),
      ].filter((id): id is string => !!id);

      const userRows = allUserIds.length > 0
        ? await db
            .select({ id: users.id, tinodeUserId: users.tinodeUserId })
            .from(users)
            .where(inArray(users.id, allUserIds))
        : [];

      const uidMap = Object.fromEntries(
        userRows.map(u => [u.id, u.tinodeUserId ?? null])
      );

      const results = [
        ...staffRows
          .filter(r => !!r.userId)
          .map(r => ({
            userId:      r.userId!,
            displayName: r.fullName ?? "Nhân viên",
            role:        "staff" as const,
            tinodeLogin: getTinodeLogin(r.userId!),
            tinodeUid:   uidMap[r.userId!] ?? null,
          })),
        ...studentRows
          .filter(r => !!r.userId)
          .map(r => ({
            userId:      r.userId!,
            displayName: r.fullName ?? "Học viên",
            role:        "student" as const,
            tinodeLogin: getTinodeLogin(r.userId!),
            tinodeUid:   uidMap[r.userId!] ?? null,
          })),
      ];

      const me = (req.user as any).id;
      const filtered = results.filter(r => r.userId !== me);

      return res.json({ users: filtered });
    } catch (err: any) {
      console.error("[Chat] /api/chat/search-users error:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  });

  // ─── POST /api/chat/p2p/open ──────────────────────────────────────────────────
  /**
   * Mở / chuẩn bị chat riêng (DM) với một user khác.
   * Body: { targetUserId: string }
   * Tạo hoặc tái sử dụng group topic (grp*) dạng DM, lưu vào chat_groups.
   * Trả về: { topicId, groupId, isNew }
   */
  app.post("/api/chat/p2p/open", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const userId = (req.user as any).id;
    const isStudent: boolean = (req as any).isStudent ?? false;
    const { targetUserId } = req.body;
    if (!targetUserId || typeof targetUserId !== "string") {
      return res.status(400).json({ message: "targetUserId required" });
    }
    if (targetUserId === userId) {
      return res.status(400).json({ message: "Không thể mở chat với chính mình." });
    }

    try {
      const { isTinodeConfigured, createGroupTopic, addMemberToTopic, ensureUserInTinode, verifyAndSetTopicDefacs } = await import("../lib/tinode.service");

      if (!isTinodeConfigured()) {
        return res.status(503).json({ message: "Tính năng chat chưa được cấu hình" });
      }

      // ── Fix 1: Authorization — học viên chỉ được DM giáo viên của lớp mình ─────
      if (isStudent) {
        const [studentRow] = await db
          .select({ id: students.id })
          .from(students).where(eq(students.userId, userId)).limit(1);
        if (!studentRow) return res.status(403).json({ message: "Không có quyền." });

        const classRows = await db
          .select({ teacherIds: classes.teacherIds })
          .from(classes)
          .innerJoin(studentClasses, eq(studentClasses.classId, classes.id))
          .where(eq(studentClasses.studentId, studentRow.id));

        const allowedStaffIds = new Set(classRows.flatMap(c => c.teacherIds ?? []));

        const [targetStaff] = await db
          .select({ id: staff.id })
          .from(staff).where(eq(staff.userId, targetUserId)).limit(1);

        if (!targetStaff || !allowedStaffIds.has(targetStaff.id)) {
          return res.status(403).json({ message: "Bạn chỉ có thể nhắn tin với giáo viên của mình." });
        }
      }

      // Kiểm tra user đích tồn tại + lấy display name
      const [targetRow] = await db
        .select({ id: users.id, tinodeUserId: users.tinodeUserId })
        .from(users).where(eq(users.id, targetUserId)).limit(1);
      if (!targetRow) {
        return res.status(404).json({ message: "Không tìm thấy người dùng." });
      }

      // Tên hiển thị của người kia — dùng làm tên Tinode topic
      const [targetStaffName] = await db.select({ fullName: staff.fullName }).from(staff).where(eq(staff.userId, targetUserId)).limit(1);
      const [targetStudentName] = await db.select({ fullName: students.fullName }).from(students).where(eq(students.userId, targetUserId)).limit(1);
      const targetDisplayName: string = targetStaffName?.fullName ?? targetStudentName?.fullName ?? "Chat";

      const dmKey = `dm_${[userId, targetUserId].sort().join("_")}`;

      // ── Fix 2+3: Transaction + stale-topic recovery ───────────────────────────
      // Use advisory lock keyed on the deterministic pair to prevent race condition.
      const result = await db.transaction(async (tx) => {
        // Lock this specific pair for the duration of the transaction
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${dmKey}))`);

        // Re-check inside the lock
        const existing = await tx.execute(sql`
          SELECT g.id, g.tinode_topic_id
          FROM chat_groups g
          INNER JOIN chat_group_members m1 ON m1.group_id = g.id AND m1.user_id = ${userId}
          INNER JOIN chat_group_members m2 ON m2.group_id = g.id AND m2.user_id = ${targetUserId}
          WHERE g.is_direct_message = TRUE
          LIMIT 1
        `);
        const existingRow = (existing as any).rows?.[0] ?? (existing as any)[0] ?? null;

        if (existingRow?.tinode_topic_id) {
          // Fix 2: Verify the Tinode topic still exists (stale recovery)
          const topicExists = await verifyAndSetTopicDefacs(existingRow.tinode_topic_id);
          if (topicExists) {
            return { topicId: existingRow.tinode_topic_id as string, groupId: existingRow.id as string, isNew: false };
          }
          // Stale — recreate Tinode topic, update DB
          const newTopicId = await createGroupTopic(targetDisplayName, dmKey);
          if (newTopicId) {
            await tx.execute(sql`
              UPDATE chat_groups SET tinode_topic_id = ${newTopicId} WHERE id = ${existingRow.id}
            `);
            console.log(`[Chat] Recreated stale DM topic for pair ${dmKey}: ${existingRow.tinode_topic_id} → ${newTopicId}`);
            return { topicId: newTopicId, groupId: existingRow.id as string, isNew: false };
          }
          return { topicId: existingRow.tinode_topic_id as string, groupId: existingRow.id as string, isNew: false };
        }

        // Create new Tinode topic + DB record (inside the lock → no duplicate)
        const topicId = await createGroupTopic(targetDisplayName, dmKey);
        if (!topicId) throw new Error("Không thể tạo kênh chat Tinode");

        const [group] = await tx.insert(chatGroups).values({
          name:            dmKey,
          createdBy:       userId,
          isDirectMessage: true,
          tinodeTopicId:   topicId,
        } as any).returning();

        await tx.insert(chatGroupMembers).values([
          { groupId: group.id, userId },
          { groupId: group.id, userId: targetUserId },
        ]);

        return { topicId, groupId: group.id, isNew: true };
      });

      // Add both users to the Tinode topic (outside transaction — network call)
      if (result.isNew) {
        for (const uid of [userId, targetUserId]) {
          try {
            let tinodeUid = uid === targetUserId ? targetRow.tinodeUserId : null;
            if (!tinodeUid) {
              const r = await ensureUserInTinode(uid);
              tinodeUid = r.tinodeUid;
              if (tinodeUid) await db.update(users).set({ tinodeUserId: tinodeUid } as any).where(eq(users.id, uid));
            }
            if (tinodeUid) await addMemberToTopic(result.topicId, tinodeUid);
          } catch (e: any) {
            console.warn(`[Chat] P2P addMember skip uid=${uid}:`, e?.message);
          }
        }
        import("../services/tinode-push.service").then(({ subscribeBotToTopic }) =>
          subscribeBotToTopic(result.topicId).catch(() => {})
        ).catch(() => {});
      }

      return res.json(result);
    } catch (err: any) {
      console.error("[Chat] /api/chat/p2p/open error:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  });

  // ─── POST /api/chat/groups ────────────────────────────────────────────────────
  // ─── GET /api/chat/classes/search ───────────────────────────────────────────
  /**
   * Tìm lớp học để điền vào form tạo nhóm.
   * Trả về danh sách lớp theo phân quyền người dùng.
   * Query: ?q=<tên hoặc mã lớp>
   */
  app.get("/api/chat/classes/search", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const q = ((req.query.q as string) ?? "").trim();
    const isSuperAdmin = (req as any).isSuperAdmin ?? false;
    const isStudent   = (req as any).isStudent ?? false;
    const staffId: string | null = (req as any).staffId ?? null;
    const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];

    // Default-deny: học sinh không tìm lớp; user không có staffId cũng không có quyền
    if (isStudent) return res.json({ classes: [] });
    if (!isSuperAdmin && !staffId) return res.json({ classes: [] });

    try {
      const conditions: any[] = [];
      if (q) {
        conditions.push(or(ilike(classes.name, `%${q}%`), ilike(classes.classCode, `%${q}%`)));
      }
      if (!isSuperAdmin && staffId) {
        if (allowedLocationIds.length > 0) {
          conditions.push(inArray(classes.locationId, allowedLocationIds));
        }
      }

      const rows = await db
        .select({ id: classes.id, name: classes.name, classCode: classes.classCode })
        .from(classes)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .limit(20);

      return res.json({ classes: rows });
    } catch (err: any) {
      console.error("[Chat] /api/chat/classes/search error:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  });

  // ─── GET /api/chat/classes/:classId/members ──────────────────────────────────
  /**
   * Lấy danh sách thành viên của một lớp học (giáo viên + phụ trách + học viên chính thức).
   * Dùng để auto-fill form tạo nhóm khi chọn lớp.
   */
  app.get("/api/chat/classes/:classId/members", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const { classId } = req.params;
    const isSuperAdmin = (req as any).isSuperAdmin ?? false;
    const isStudent   = (req as any).isStudent ?? false;
    const staffId: string | null = (req as any).staffId ?? null;
    const userId = (req.user as any).id;

    try {
      const [cls] = await db
        .select({ teacherIds: classes.teacherIds, managerIds: classes.managerIds })
        .from(classes)
        .where(eq(classes.id, classId))
        .limit(1);
      if (!cls) return res.status(404).json({ message: "Không tìm thấy lớp" });

      // Authorization: superAdmin xem được tất cả; staff phải là giáo viên/phụ trách;
      // học sinh phải đang học lớp này
      if (!isSuperAdmin) {
        if (isStudent) {
          const [enrollment] = await db
            .select({ id: students.id })
            .from(students)
            .innerJoin(studentClasses, eq(studentClasses.studentId, students.id))
            .where(and(eq(students.userId, userId), eq(studentClasses.classId, classId), eq(studentClasses.status, "active")))
            .limit(1);
          if (!enrollment) return res.status(403).json({ message: "Không có quyền xem lớp này" });
        } else if (staffId) {
          const isTeacherOrManager =
            (cls.teacherIds ?? []).includes(staffId) ||
            (cls.managerIds ?? []).includes(staffId);
          if (!isTeacherOrManager) return res.status(403).json({ message: "Không có quyền xem lớp này" });
        } else {
          return res.status(403).json({ message: "Không có quyền xem lớp này" });
        }
      }

      // Resolve staff (teachers + managers) → userId + displayName
      const allStaffIds = Array.from(new Set([...(cls.teacherIds ?? []), ...(cls.managerIds ?? [])]));
      const staffMembers: { userId: string; displayName: string; role: "staff" }[] = [];
      if (allStaffIds.length > 0) {
        const staffRows = await db
          .select({ userId: staff.userId, fullName: staff.fullName })
          .from(staff)
          .where(inArray(staff.id, allStaffIds));
        staffRows.forEach(s => {
          if (s.userId) staffMembers.push({ userId: s.userId, displayName: s.fullName, role: "staff" });
        });
      }

      // Active students → userId + displayName
      const studentRows = await db
        .select({ userId: students.userId, fullName: students.fullName })
        .from(students)
        .innerJoin(studentClasses, eq(studentClasses.studentId, students.id))
        .where(and(
          eq(studentClasses.classId, classId),
          eq(studentClasses.status, "active"),
          isNotNull(students.userId),
        ));
      const studentMembers = studentRows.map(s => ({
        userId: s.userId!,
        displayName: s.fullName,
        role: "student" as const,
      }));

      // Dedup by userId
      const seen = new Set<string>();
      const members = [...staffMembers, ...studentMembers].filter(m => {
        if (seen.has(m.userId)) return false;
        seen.add(m.userId);
        return true;
      });

      return res.json({ members });
    } catch (err: any) {
      console.error("[Chat] /api/chat/classes/:classId/members error:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  });

  // ─── GET /api/chat/classes/:classId/groups ───────────────────────────────────
  /**
   * Kiểm tra xem lớp học đã có nhóm chat tuỳ chỉnh nào chưa.
   * Dùng để hiển thị cảnh báo trong form tạo nhóm.
   */
  app.get("/api/chat/classes/:classId/groups", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const { classId } = req.params;
    const isSuperAdmin = (req as any).isSuperAdmin ?? false;
    const isStudent   = (req as any).isStudent ?? false;
    const staffId: string | null = (req as any).staffId ?? null;
    const userId = (req.user as any).id;

    try {
      // Authorization: superAdmin xem được tất cả; staff phải là giáo viên/phụ trách;
      // học sinh phải đang học lớp này
      if (!isSuperAdmin) {
        const [cls] = await db
          .select({ teacherIds: classes.teacherIds, managerIds: classes.managerIds })
          .from(classes)
          .where(eq(classes.id, classId))
          .limit(1);
        if (!cls) return res.status(404).json({ message: "Không tìm thấy lớp" });

        if (isStudent) {
          const [enrollment] = await db
            .select({ id: students.id })
            .from(students)
            .innerJoin(studentClasses, eq(studentClasses.studentId, students.id))
            .where(and(eq(students.userId, userId), eq(studentClasses.classId, classId), eq(studentClasses.status, "active")))
            .limit(1);
          if (!enrollment) return res.status(403).json({ message: "Không có quyền xem lớp này" });
        } else if (staffId) {
          const isTeacherOrManager =
            (cls.teacherIds ?? []).includes(staffId) ||
            (cls.managerIds ?? []).includes(staffId);
          if (!isTeacherOrManager) return res.status(403).json({ message: "Không có quyền xem lớp này" });
        } else {
          return res.status(403).json({ message: "Không có quyền xem lớp này" });
        }
      }

      const groups = await db
        .select({ id: chatGroups.id, name: chatGroups.name })
        .from(chatGroups)
        .where(eq(chatGroups.classId, classId));
      return res.json({ groups });
    } catch (err: any) {
      console.error("[Chat] /api/chat/classes/:classId/groups error:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  });

  // ─── POST /api/chat/groups ────────────────────────────────────────────────────
  /**
   * Tạo nhóm chat tuỳ chỉnh mới.
   * Body: { name: string, memberUserIds?: string[], classId?: string }
   */
  app.post("/api/chat/groups", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const isStudent = (req as any).isStudent ?? false;
    if (isStudent) return res.status(403).json({ message: "Học sinh và phụ huynh không được phép tạo nhóm chat." });
    const userId = (req.user as any).id;
    const { name, memberUserIds = [], classId } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Tên nhóm không được để trống" });
    }
    const validClassId = classId && typeof classId === "string" ? classId : null;

    try {
      const { isTinodeConfigured, createGroupTopic, addMemberToTopic, ensureUserInTinode } = await import("../lib/tinode.service");

      // 1. Tạo bản ghi nhóm trong DB (kèm classId nếu có)
      const [group] = await db.insert(chatGroups).values({
        name: name.trim(),
        createdBy: userId,
        ...(validClassId ? { classId: validClassId } : {}),
      }).returning();

      // 2. Tạo Tinode topic
      let topicId: string | null = null;
      if (isTinodeConfigured()) {
        topicId = await createGroupTopic(name.trim(), group.id);
        if (topicId) {
          await db.update(chatGroups)
            .set({ tinodeTopicId: topicId } as any)
            .where(eq(chatGroups.id, group.id));
        }
      }

      // 3. Thêm người tạo + các thành viên vào DB
      const allMemberIds = Array.from(new Set([userId, ...memberUserIds]));
      await db.insert(chatGroupMembers).values(
        allMemberIds.map(uid => ({ groupId: group.id, userId: uid }))
      );

      // 4. Thêm thành viên vào Tinode topic
      if (topicId && isTinodeConfigured()) {
        const memberRows = await db
          .select({ tinodeUserId: users.tinodeUserId, id: users.id })
          .from(users)
          .where(inArray(users.id, allMemberIds));

        for (const member of memberRows) {
          if (member.id === userId) continue; // creator already subscribed
          let tinodeUid = member.tinodeUserId;
          if (!tinodeUid) {
            const result = await ensureUserInTinode(member.id);
            tinodeUid = result.tinodeUid;
            if (tinodeUid) {
              await db.update(users).set({ tinodeUserId: tinodeUid } as any).where(eq(users.id, member.id));
            }
          }
          if (tinodeUid) {
            await addMemberToTopic(topicId, tinodeUid);
          }
        }
      }

      return res.json({ group: { ...group, tinodeTopicId: topicId } });
    } catch (err: any) {
      console.error("[Chat] POST /api/chat/groups error:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  });

  // ─── GET /api/chat/groups ─────────────────────────────────────────────────────
  /**
   * Lấy danh sách nhóm chat tuỳ chỉnh của user hiện tại.
   */
  app.get("/api/chat/groups", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const userId = (req.user as any).id;

    try {
      const memberRows = await db
        .select({ groupId: chatGroupMembers.groupId })
        .from(chatGroupMembers)
        .where(eq(chatGroupMembers.userId, userId));

      const groupIds = memberRows.map(r => r.groupId);
      if (groupIds.length === 0) return res.json({ groups: [] });

      const groups = await db
        .select()
        .from(chatGroups)
        .where(inArray(chatGroups.id, groupIds));

      return res.json({ groups });
    } catch (err: any) {
      console.error("[Chat] GET /api/chat/groups error:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  });

  // ─── DELETE /api/chat/groups/:groupId ────────────────────────────────────────
  app.delete("/api/chat/groups/:groupId", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const userId = (req.user as any).id;
    const { groupId } = req.params;

    try {
      const [group] = await db
        .select()
        .from(chatGroups)
        .where(eq(chatGroups.id, groupId))
        .limit(1);

      if (!group) return res.status(404).json({ message: "Không tìm thấy nhóm" });
      if (group.createdBy !== userId) return res.status(403).json({ message: "Chỉ người tạo nhóm mới có thể xoá" });

      await db.delete(chatGroups).where(eq(chatGroups.id, groupId));

      // Xóa topic trên Tinode + invalidate cache để push notification không còn gửi ra
      if (group.tinodeTopicId) {
        const [{ deleteTopic }, { invalidateTopicMetaCache }] = await Promise.all([
          import("../lib/tinode.service"),
          import("../services/tinode-push.service"),
        ]);
        invalidateTopicMetaCache(group.tinodeTopicId);
        // Fire-and-forget — không block response nếu Tinode chậm/offline
        deleteTopic(group.tinodeTopicId).catch(() => {});
      }

      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[Chat] DELETE /api/chat/groups error:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  });

  // ─── POST /api/chat/groups/:groupId/members ──────────────────────────────────
  app.post("/api/chat/groups/:groupId/members", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const userId = (req.user as any).id;
    const { groupId } = req.params;
    const { memberUserId } = req.body;

    if (!memberUserId) return res.status(400).json({ message: "memberUserId required" });

    try {
      const [group] = await db.select().from(chatGroups).where(eq(chatGroups.id, groupId)).limit(1);
      if (!group) return res.status(404).json({ message: "Không tìm thấy nhóm" });
      if (group.createdBy !== userId) return res.status(403).json({ message: "Không có quyền" });

      await db.insert(chatGroupMembers).values({ groupId, userId: memberUserId });

      if (group.tinodeTopicId) {
        const { addMemberToTopic, ensureUserInTinode } = await import("../lib/tinode.service");
        const [userRow] = await db.select({ tinodeUserId: users.tinodeUserId }).from(users).where(eq(users.id, memberUserId)).limit(1);
        let tinodeUid = userRow?.tinodeUserId;
        if (!tinodeUid) {
          const result = await ensureUserInTinode(memberUserId);
          tinodeUid = result.tinodeUid;
        }
        if (tinodeUid) await addMemberToTopic(group.tinodeTopicId, tinodeUid);
      }

      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[Chat] POST /api/chat/groups/:id/members error:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  });

  // ─── GET /api/chat/topics/:topicId/members ────────────────────────────────────
  /**
   * Lấy toàn bộ thành viên của một group topic (class-based hoặc custom).
   * Nhận Tinode topicId (grp...), tra cứu cả bảng classes lẫn chat_groups.
   * Trả về: { members: [{ userId, displayName, role }] }
   */
  app.get("/api/chat/topics/:topicId/members", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const { topicId } = req.params;

    try {
      // 1. Thử tìm trong chat_groups (custom group hoặc DM)
      const [group] = await db
        .select()
        .from(chatGroups)
        .where(eq(chatGroups.tinodeTopicId, topicId))
        .limit(1);

      if (group) {
        // Lấy tất cả userId trong nhóm
        const memberRows = await db
          .select({ userId: chatGroupMembers.userId })
          .from(chatGroupMembers)
          .where(eq(chatGroupMembers.groupId, group.id));

        const userIds = memberRows.map(r => r.userId);
        if (userIds.length === 0) return res.json({ members: [] });

        // Lấy displayName từ staff/students
        const staffRows = await db
          .select({ userId: staff.userId, fullName: staff.fullName })
          .from(staff)
          .where(inArray(staff.userId, userIds));

        const studentRows = await db
          .select({ userId: students.userId, fullName: students.fullName })
          .from(students)
          .where(inArray(students.userId as any, userIds));

        const staffMap = new Map(staffRows.map(s => [s.userId, s.fullName]));
        const studentMap = new Map(studentRows.map(s => [s.userId!, s.fullName]));

        const members = userIds.map(uid => {
          if (staffMap.has(uid)) return { userId: uid, displayName: staffMap.get(uid)!, role: "staff" as const };
          if (studentMap.has(uid)) return { userId: uid, displayName: studentMap.get(uid)!, role: "student" as const };
          return { userId: uid, displayName: uid.slice(0, 8), role: "staff" as const };
        });

        return res.json({ members, isGroup: !group.isDirectMessage, isCustomGroup: !group.isDirectMessage, groupId: group.id });
      }

      // 2. Thử tìm trong classes (class-based topic)
      const [cls] = await db
        .select({ id: classes.id, teacherIds: classes.teacherIds, managerIds: classes.managerIds })
        .from(classes)
        .where(eq(classes.tinodeTopicId as any, topicId))
        .limit(1);

      if (cls) {
        const allStaffIds = Array.from(new Set([...(cls.teacherIds ?? []), ...(cls.managerIds ?? [])]));
        const staffMembers: { userId: string; displayName: string; role: "staff" }[] = [];
        if (allStaffIds.length > 0) {
          const staffRows = await db
            .select({ userId: staff.userId, fullName: staff.fullName })
            .from(staff)
            .where(inArray(staff.id, allStaffIds));
          staffRows.forEach(s => {
            if (s.userId) staffMembers.push({ userId: s.userId, displayName: s.fullName, role: "staff" });
          });
        }

        const studentRows = await db
          .select({ userId: students.userId, fullName: students.fullName })
          .from(students)
          .innerJoin(studentClasses, eq(studentClasses.studentId, students.id))
          .where(and(eq(studentClasses.classId, cls.id), eq(studentClasses.status, "active"), isNotNull(students.userId)));

        const studentMembers = studentRows.map(s => ({ userId: s.userId!, displayName: s.fullName, role: "student" as const }));

        const seen = new Set<string>();
        const members = [...staffMembers, ...studentMembers].filter(m => {
          if (seen.has(m.userId)) return false;
          seen.add(m.userId);
          return true;
        });
        return res.json({ members, isGroup: true });
      }

      return res.json({ members: [], isGroup: false });
    } catch (err: any) {
      console.error("[Chat] GET /api/chat/topics/:topicId/members error:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  });

  // ─── POST /api/chat/topics/:topicId/members ─────────────────────────────────
  /**
   * Thêm thành viên vào nhóm chat bằng tinode topic ID.
   * Yêu cầu: canCreate trên /chat HOẶC là người tạo nhóm.
   */
  app.post("/api/chat/topics/:topicId/members", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const userId = (req.user as any).id;
    const isSuperAdmin = (req.user as any).isSuperAdmin;
    const { topicId } = req.params;
    const { memberUserId } = req.body;
    if (!memberUserId) return res.status(400).json({ message: "memberUserId required" });

    try {
      const checkPerm = async (createdBy?: string | null) => {
        if (isSuperAdmin) return true;
        if (createdBy === userId) return true;
        const { getEffectivePermissions } = await import("../storage/permissions.storage");
        const roleIds: string[] = (req as any).roleIds || [];
        if (!roleIds.length) return false;
        const perms = await getEffectivePermissions(roleIds, "/chat");
        return perms.canCreate;
      };

      const addToTinode = async (tid: string) => {
        const { addMemberToTopic, ensureUserInTinode } = await import("../lib/tinode.service");
        const [userRow] = await db.select({ tinodeUserId: users.tinodeUserId }).from(users).where(eq(users.id, memberUserId)).limit(1);
        let tinodeUid = userRow?.tinodeUserId;
        if (!tinodeUid) {
          const result = await ensureUserInTinode(memberUserId);
          tinodeUid = result.tinodeUid;
        }
        if (tinodeUid) await addMemberToTopic(tid, tinodeUid);
      };

      // Tìm trong chat_groups trước (custom group hoặc DM)
      const [group] = await db.select().from(chatGroups).where(eq(chatGroups.tinodeTopicId, topicId)).limit(1);
      if (group) {
        if (group.isDirectMessage) return res.status(400).json({ message: "Không thể thêm thành viên vào tin nhắn trực tiếp" });
        if (!await checkPerm(group.createdBy)) return res.status(403).json({ message: "Bạn không có quyền thêm thành viên" });

        const [existing] = await db.select().from(chatGroupMembers)
          .where(and(eq(chatGroupMembers.groupId, group.id), eq(chatGroupMembers.userId, memberUserId))).limit(1);
        if (existing) return res.status(409).json({ message: "Thành viên đã có trong nhóm" });

        await db.insert(chatGroupMembers).values({ groupId: group.id, userId: memberUserId });
        await addToTinode(topicId);
        return res.json({ ok: true });
      }

      // Fallback: tìm trong classes (nhóm lớp học) → chỉ thêm vào Tinode
      const [cls] = await db.select({ id: classes.id }).from(classes)
        .where(eq(classes.tinodeTopicId as any, topicId)).limit(1);
      if (!cls) return res.status(404).json({ message: "Không tìm thấy nhóm" });

      if (!await checkPerm(null)) return res.status(403).json({ message: "Bạn không có quyền thêm thành viên" });
      await addToTinode(topicId);
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[Chat] POST /api/chat/topics/:topicId/members error:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  });

  // ─── DELETE /api/chat/topics/:topicId/members/:memberUserId ──────────────────
  /**
   * Xoá thành viên khỏi nhóm chat bằng tinode topic ID.
   * Yêu cầu: canDelete trên /chat HOẶC là người tạo nhóm.
   */
  app.delete("/api/chat/topics/:topicId/members/:memberUserId", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const userId = (req.user as any).id;
    const isSuperAdmin = (req.user as any).isSuperAdmin;
    const { topicId, memberUserId } = req.params;

    try {
      const checkPerm = async (createdBy?: string | null) => {
        if (isSuperAdmin) return true;
        if (createdBy === userId) return true;
        const { getEffectivePermissions } = await import("../storage/permissions.storage");
        const roleIds: string[] = (req as any).roleIds || [];
        if (!roleIds.length) return false;
        const perms = await getEffectivePermissions(roleIds, "/chat");
        return perms.canDelete;
      };

      const removeFromTinode = async (tid: string) => {
        try {
          const { removeMemberFromTopic } = await import("../lib/tinode.service");
          const [userRow] = await db.select({ tinodeUserId: users.tinodeUserId }).from(users).where(eq(users.id, memberUserId)).limit(1);
          if (userRow?.tinodeUserId) await removeMemberFromTopic(tid, userRow.tinodeUserId);
        } catch (e: any) {
          console.warn("[Chat] Remove from Tinode failed:", e?.message);
        }
      };

      // Tìm trong chat_groups trước
      const [group] = await db.select().from(chatGroups).where(eq(chatGroups.tinodeTopicId, topicId)).limit(1);
      if (group) {
        if (group.isDirectMessage) return res.status(400).json({ message: "Không thể xoá thành viên khỏi tin nhắn trực tiếp" });
        if (!await checkPerm(group.createdBy)) return res.status(403).json({ message: "Bạn không có quyền xoá thành viên" });

        await db.delete(chatGroupMembers)
          .where(and(eq(chatGroupMembers.groupId, group.id), eq(chatGroupMembers.userId, memberUserId)));
        await removeFromTinode(topicId);
        return res.json({ ok: true });
      }

      // Fallback: tìm trong classes → chỉ xoá khỏi Tinode
      const [cls] = await db.select({ id: classes.id }).from(classes)
        .where(eq(classes.tinodeTopicId as any, topicId)).limit(1);
      if (!cls) return res.status(404).json({ message: "Không tìm thấy nhóm" });

      if (!await checkPerm(null)) return res.status(403).json({ message: "Bạn không có quyền xoá thành viên" });
      await removeFromTinode(topicId);
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[Chat] DELETE /api/chat/topics/:topicId/members error:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  });

  // ─── GET /api/chat/channel/:classId ──────────────────────────────────────────
  /**
   * Tenant-check rồi lazy-create topic cho lớp.
   * Trả về { topicId, className, tinodeUrl }.
   */
  app.get("/api/chat/channel/:classId", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const userId    = (req.user as any).id;
    const { classId } = req.params;

    try {
      const { isTinodeConfigured, createClassTopic } = await import("../lib/tinode.service");

      if (!isTinodeConfigured()) {
        return res.status(503).json({ message: "Tính năng chat chưa được cấu hình" });
      }

      const [cls] = await db
        .select({
          id:            classes.id,
          name:          classes.name,
          locationId:    classes.locationId,
          tinodeTopicId: classes.tinodeTopicId,
        })
        .from(classes)
        .where(eq(classes.id, classId))
        .limit(1);

      if (!cls) return res.status(404).json({ message: "Không tìm thấy lớp học" });

      const allowed = await checkClassAccess({
        userId,
        classId,
        locationId:         cls.locationId,
        isSuperAdmin:       (req as any).isSuperAdmin ?? false,
        isStudent:          (req as any).isStudent ?? false,
        allowedLocationIds: (req as any).allowedLocationIds ?? [],
      });

      if (!allowed) {
        return res.status(403).json({ message: "Bạn không có quyền truy cập nhóm chat này" });
      }

      let topicId = cls.tinodeTopicId;
      if (!topicId) {
        topicId = await createClassTopic(cls.name, cls.locationId, cls.id);
        if (topicId) {
          await db
            .update(classes)
            .set({ tinodeTopicId: topicId } as any)
            .where(eq(classes.id, cls.id));
          // Subscribe bot ngay để nhận tin nhắn mà không cần chờ server restart
          import("../services/tinode-push.service").then(({ subscribeBotToTopic }) =>
            subscribeBotToTopic(topicId!).catch(() => {})
          ).catch(() => {});
        }
      }

      if (!topicId) {
        return res.status(502).json({ message: "Không thể khởi tạo kênh chat" });
      }

      return res.json({
        topicId,
        className:  cls.name,
        tinodeUrl:  process.env.TINODE_URL ?? null,
      });
    } catch (err: any) {
      console.error("[Chat] /api/chat/channel error:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  });

  // ─── POST /api/chat/upload-file ──────────────────────────────────────────────
  /**
   * Upload file lên S3 rồi trả về URL — tránh CORS khi gọi Tinode trực tiếp từ browser.
   * Dùng diskStorage để ghi file ra /tmp trước, sau đó stream lên S3 (không buffer vào RAM).
   * Cách này tránh OOM khi upload file MP4 / video lớn.
   */
  const chatDiskStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, "/tmp"),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      cb(null, `chat_${Date.now()}_${safeName}`);
    },
  });
  const uploadMiddleware = multer({
    storage: chatDiskStorage,
    limits: { fileSize: 200 * 1024 * 1024 },
  }).single("file");

  app.post("/api/chat/upload-file", (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    uploadMiddleware(req, res, async (err) => {
      if (err) {
        console.error("[Chat] upload-file multer error:", err);
        return res.status(400).json({ message: "Lỗi xử lý file", detail: err.message });
      }

      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ message: "Không có file nào được gửi" });

      // Multer parses multipart filenames as latin1; decode back to UTF-8 for Vietnamese support
      const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");

      try {
        const { uploadFileToS3FromDisk } = await import("../lib/s3");
        const s3Url = await uploadFileToS3FromDisk(file.path, file.size, originalName, file.mimetype);
        console.log("[Chat] S3 upload success:", s3Url);
        // Cộng dồn dung lượng
        const { addS3Bytes, recordFileUpload } = await import("../lib/storage-usage");
        addS3Bytes(file.size).catch(() => {});
        recordFileUpload(s3Url, file.size).catch(() => {});
        return res.json({ ref: s3Url, mime: file.mimetype, name: originalName, size: file.size });
      } catch (uploadErr: any) {
        console.error("[Chat] S3 upload error:", uploadErr);
        return res.status(500).json({ message: "Lỗi server khi upload file lên S3" });
      } finally {
        // Xoá file tạm trên disk sau khi upload xong (dù thành công hay thất bại)
        import("fs").then(({ unlink }) =>
          unlink(file.path, (e) => { if (e) console.warn("[Chat] cleanup tmp file failed:", e.message); })
        ).catch(() => {});
      }
    });
  });

  // ─── GET /api/chat/file ──────────────────────────────────────────────────────
  /**
   * Proxy file download from Tinode to avoid CORS issues when displaying
   * images or downloading attachments uploaded via /api/chat/upload-file.
   * Usage: /api/chat/file?path=/v0/file/s/ABC123
   */
  app.get("/api/chat/file", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const filePath = req.query.path as string | undefined;
    if (!filePath || !filePath.startsWith("/v0/file/s/")) {
      return res.status(400).json({ message: "Invalid file path" });
    }

    const TINODE_URL = process.env.TINODE_URL?.replace(/\/$/, "");
    const TINODE_API_KEY = process.env.TINODE_API_KEY;

    if (!TINODE_URL || !TINODE_API_KEY) {
      return res.status(503).json({ message: "Chat chưa được cấu hình" });
    }

    try {
      const userId = (req.user as any).id;
      const { getUserCredentials } = await import("../lib/tinode.service");
      const creds = getUserCredentials(userId);
      const secret = Buffer.from(`${creds.login}:${creds.password}`).toString("base64");

      const tinodeRes = await fetch(`${TINODE_URL}${filePath}?apikey=${TINODE_API_KEY}`, {
        headers: {
          "X-Tinode-APIKey": TINODE_API_KEY,
          "Authorization": `Basic ${secret}`,
        },
      });
      if (!tinodeRes.ok) {
        console.error("[Chat] file proxy Tinode error:", tinodeRes.status, filePath);
        return res.status(tinodeRes.status).json({ message: "Không thể tải file từ Tinode" });
      }

      const contentType = tinodeRes.headers.get("content-type") ?? "application/octet-stream";
      const contentDisposition = tinodeRes.headers.get("content-disposition");

      res.setHeader("Content-Type", contentType);
      if (contentDisposition) res.setHeader("Content-Disposition", contentDisposition);
      res.setHeader("Cache-Control", "private, max-age=3600");

      const buffer = await tinodeRes.arrayBuffer();
      return res.send(Buffer.from(buffer));
    } catch (err: any) {
      console.error("[Chat] file proxy error:", err);
      return res.status(500).json({ message: "Lỗi server khi tải file" });
    }
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function checkClassAccess(opts: {
  userId: string;
  classId: string;
  locationId: string;
  isSuperAdmin: boolean;
  isStudent: boolean;
  allowedLocationIds: string[];
}): Promise<boolean> {
  if (opts.isSuperAdmin) return true;

  if (!opts.isStudent) {
    return opts.allowedLocationIds.includes(opts.locationId);
  }

  const [studentRow] = await db
    .select({ id: students.id })
    .from(students)
    .where(eq(students.userId, opts.userId))
    .limit(1);

  if (!studentRow) return false;

  const [enrollment] = await db
    .select({ id: studentClasses.id })
    .from(studentClasses)
    .where(and(
      eq(studentClasses.studentId, studentRow.id),
      eq(studentClasses.classId, opts.classId)
    ))
    .limit(1);

  return !!enrollment;
}
