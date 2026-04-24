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
import { eq, and, inArray, ilike, or } from "drizzle-orm";
import { storage } from "../storage";
import multer from "multer";

export function registerChatRoutes(app: Express): void {

  // ─── GET /api/chat/credentials ───────────────────────────────────────────────
  app.get("/api/chat/credentials", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const userId = (req.user as any).id;

    try {
      const { isTinodeConfigured, getUserCredentials, ensureUserInTinode } = await import("../lib/tinode.service");
      if (!isTinodeConfigured()) {
        return res.status(503).json({ message: "Tính năng chat chưa được cấu hình" });
      }

      await ensureUserInTinode(userId);

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
      res.set("Cache-Control", "no-store");
      return res.json({ ...creds, displayName, isStudent });
    } catch (err: any) {
      console.error("[Chat] /api/chat/credentials error:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  });

  // ─── GET /api/chat/my-channels ───────────────────────────────────────────────
  /**
   * Trả về danh sách topic (grpXXX hoặc null) của các lớp user đang tham gia.
   * Nếu topic chưa được tạo (tinode_topic_id IS NULL), gọi Tinode để tạo và lưu.
   */
  app.get("/api/chat/my-channels", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const userId              = (req.user as any).id;
    const isSuperAdmin        = (req as any).isSuperAdmin ?? false;
    const isStudent           = (req as any).isStudent ?? false;
    const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];

    try {
      const { isTinodeConfigured, createClassTopic, ensureTopicDefacs } = await import("../lib/tinode.service");

      if (!isTinodeConfigured()) {
        return res.json({ channels: [] });
      }

      // ── Fetch relevant classes ──────────────────────────────────────────────
      let classRows: { id: string; name: string; locationId: string; tinodeTopicId: string | null }[] = [];

      if (isStudent) {
        const [studentRow] = await db
          .select({ id: students.id })
          .from(students)
          .where(eq(students.userId, userId))
          .limit(1);

        if (studentRow) {
          classRows = await db
            .select({
              id:             classes.id,
              name:           classes.name,
              locationId:     classes.locationId,
              tinodeTopicId:  classes.tinodeTopicId,
            })
            .from(classes)
            .innerJoin(studentClasses, eq(studentClasses.classId, classes.id))
            .where(eq(studentClasses.studentId, studentRow.id))
            .limit(30);
        }
      } else if (isSuperAdmin || allowedLocationIds.length === 0) {
        classRows = await db
          .select({ id: classes.id, name: classes.name, locationId: classes.locationId, tinodeTopicId: classes.tinodeTopicId })
          .from(classes)
          .limit(30);
      } else {
        classRows = await db
          .select({ id: classes.id, name: classes.name, locationId: classes.locationId, tinodeTopicId: classes.tinodeTopicId })
          .from(classes)
          .where(inArray(classes.locationId, allowedLocationIds))
          .limit(30);
      }

      // ── Ensure each class has a Tinode topic ────────────────────────────────
      const channelResults = await Promise.allSettled(
        classRows.map(async (cls) => {
          let topicId = cls.tinodeTopicId;

          if (!topicId) {
            topicId = await createClassTopic(cls.name, cls.locationId, cls.id);
            if (topicId) {
              await db
                .update(classes)
                .set({ tinodeTopicId: topicId } as any)
                .where(eq(classes.id, cls.id));
            }
          } else {
            // Đảm bảo topic cũ cho phép authenticated users join
            ensureTopicDefacs(topicId).catch(() => {});
          }

          return { topicId, className: cls.name, classId: cls.id };
        })
      );

      const channels = channelResults
        .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && !!r.value.topicId)
        .map((r) => r.value);

      // ── Also include custom chat groups ─────────────────────────────────────
      const memberRows = await db
        .select({ groupId: chatGroupMembers.groupId })
        .from(chatGroupMembers)
        .where(eq(chatGroupMembers.userId, userId));

      const groupIds = memberRows.map(r => r.groupId);
      const customGroups = groupIds.length > 0
        ? await db.select().from(chatGroups).where(inArray(chatGroups.id, groupIds))
        : [];

      const groupChannels = customGroups
        .filter(g => !!g.tinodeTopicId)
        .map(g => ({ topicId: g.tinodeTopicId!, className: g.name, classId: null, groupId: g.id, isCustomGroup: true }));

      res.set("Cache-Control", "no-store");
      return res.json({ channels: [...channels.map(c => ({ ...c, isCustomGroup: false })), ...groupChannels] });
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
      const rows = await db
        .select({
          tinodeUserId: users.tinodeUserId,
          staffName: staff.fullName,
          studentName: students.fullName,
        })
        .from(users)
        .leftJoin(staff, eq(staff.userId, users.id))
        .leftJoin(students, eq(students.userId, users.id))
        .where(inArray(users.tinodeUserId as any, uids));

      const names: Record<string, string> = {};
      for (const row of rows) {
        if (row.tinodeUserId) {
          const displayName = row.staffName ?? row.studentName ?? null;
          if (displayName) names[row.tinodeUserId] = displayName;
        }
      }
      res.set("Cache-Control", "no-store");
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
   * Mở / chuẩn bị P2P chat với một user khác.
   * Body: { targetUserId: string }
   * Đảm bảo user đó có tài khoản Tinode (tạo nếu chưa có).
   * Trả về: { tinodeLogin, tinodeUid } để frontend subscribe P2P topic.
   */
  app.post("/api/chat/p2p/open", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const { targetUserId } = req.body;
    if (!targetUserId || typeof targetUserId !== "string") {
      return res.status(400).json({ message: "targetUserId required" });
    }

    try {
      const { isTinodeConfigured, ensureUserInTinode } = await import("../lib/tinode.service");

      if (!isTinodeConfigured()) {
        return res.status(503).json({ message: "Tính năng chat chưa được cấu hình" });
      }

      // Kiểm tra UID trong DB trước
      const [userRow] = await db
        .select({ tinodeUserId: users.tinodeUserId })
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);

      let tinodeUid: string | null = userRow?.tinodeUserId ?? null;
      let tinodeLogin: string;

      if (tinodeUid) {
        const { getTinodeLogin } = await import("../lib/tinode.service");
        tinodeLogin = getTinodeLogin(targetUserId);
      } else {
        // Đảm bảo tài khoản Tinode tồn tại (tạo nếu chưa có)
        const result = await ensureUserInTinode(targetUserId);
        tinodeLogin = result.tinodeLogin;
        tinodeUid   = result.tinodeUid;

        // Nếu vừa tạo xong, lưu UID vào DB
        if (tinodeUid) {
          await db
            .update(users)
            .set({ tinodeUserId: tinodeUid } as any)
            .where(eq(users.id, targetUserId));
        }
      }

      return res.json({ tinodeLogin, tinodeUid });
    } catch (err: any) {
      console.error("[Chat] /api/chat/p2p/open error:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  });

  // ─── POST /api/chat/groups ────────────────────────────────────────────────────
  /**
   * Tạo nhóm chat tuỳ chỉnh mới.
   * Body: { name: string, memberUserIds: string[] }
   */
  app.post("/api/chat/groups", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const userId = (req.user as any).id;
    const { name, memberUserIds = [] } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Tên nhóm không được để trống" });
    }

    try {
      const { isTinodeConfigured, createGroupTopic, addMemberToTopic, ensureUserInTinode } = await import("../lib/tinode.service");

      // 1. Tạo bản ghi nhóm trong DB
      const [group] = await db.insert(chatGroups).values({
        name: name.trim(),
        createdBy: userId,
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
   * Proxy file upload to Tinode's large-file API to avoid CORS issues.
   * Browser → our backend → Tinode /v0/file/u/
   * Returns: { ref: "https://s3.../...", mime, name, size }
   */
  const uploadMiddleware = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } }).single("file");

  app.post("/api/chat/upload-file", (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    uploadMiddleware(req, res, async (err) => {
      if (err) {
        console.error("[Chat] upload-file multer error:", err);
        return res.status(400).json({ message: "Lỗi xử lý file", detail: err.message });
      }

      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ message: "Không có file nào được gửi" });

      try {
        const { uploadFileToS3 } = await import("../lib/s3");
        const s3Url = await uploadFileToS3(file.buffer, file.originalname, file.mimetype);
        console.log("[Chat] S3 upload success:", s3Url);
        return res.json({ ref: s3Url, mime: file.mimetype, name: file.originalname, size: file.size });
      } catch (uploadErr: any) {
        console.error("[Chat] S3 upload error:", uploadErr);
        return res.status(500).json({ message: "Lỗi server khi upload file lên S3" });
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
