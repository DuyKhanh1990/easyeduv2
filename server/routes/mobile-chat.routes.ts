/**
 * mobile-chat.routes.ts
 *
 * API chat dành riêng cho app mobile.
 * Hỗ trợ xác thực qua JWT Bearer token.
 * Tất cả dữ liệu đã được tính sẵn phía server — app không cần tính thêm.
 * Timestamps theo chuẩn ISO 8601.
 *
 * POST /api/mobile/chat/connect                   → Lấy thông tin kết nối Tinode (credentials + server URL)
 * GET  /api/mobile/chat/channels                  → Danh sách kênh lớp học của user
 * GET  /api/mobile/chat/channel/:classId           → Thông tin kênh của một lớp cụ thể
 * PUT  /api/mobile/chat/uid                       → Lưu Tinode UID sau khi mobile đăng nhập vào Tinode
 * GET  /api/mobile/chat/users                     → Tra tên hiển thị theo danh sách Tinode UID
 * GET  /api/mobile/chat/search-users?q=           → Tìm kiếm user để mở chat DM hoặc tạo nhóm
 * POST /api/mobile/chat/p2p/open                  → Mở/chuẩn bị chat riêng 1-1 (tạo group topic DM, trả topicId)
 * GET  /api/mobile/chat/groups                              → Danh sách nhóm chat tuỳ chỉnh của user
 * POST /api/mobile/chat/groups                              → Tạo nhóm chat tuỳ chỉnh mới (hỗ trợ classId tuỳ chọn)
 * GET  /api/mobile/chat/groups/:groupId                    → Chi tiết nhóm + danh sách thành viên
 * PUT  /api/mobile/chat/groups/:groupId                    → Đổi tên nhóm (chỉ người tạo)
 * DELETE /api/mobile/chat/groups/:groupId                  → Xoá nhóm (chỉ người tạo)
 * POST /api/mobile/chat/groups/:groupId/members            → Thêm thành viên vào nhóm
 * DELETE /api/mobile/chat/groups/:groupId/members/:uid    → Xoá thành viên / Tự rời nhóm ("me")
 * GET  /api/mobile/chat/classes/search?q=                 → Tìm kiếm lớp học cho dialog tạo nhóm (chỉ staff)
 * GET  /api/mobile/chat/classes/:classId/members          → Lấy thành viên lớp để auto-fill form tạo nhóm
 * GET  /api/mobile/chat/permissions                       → Quyền chat chi tiết của user hiện tại (tách biệt từng hành động)
 * GET  /api/mobile/chat/topics/:topicId/members           → Lấy thành viên theo Tinode topicId (class-based & custom group)
 * POST /api/mobile/chat/topics/:topicId/members           → Thêm thành viên vào custom group (cần canAddMember)
 * DELETE /api/mobile/chat/topics/:topicId/members/:uid   → Xoá thành viên / Tự rời nhóm (cần canRemoveMember)
 */

import type { Express } from "express";
import { db } from "../db";
import { users, students, staff, staffAssignments, studentClasses, classes, chatGroups, chatGroupMembers, locations } from "@shared/schema";
import { eq, and, inArray, ilike, or, sql, isNull, isNotNull } from "drizzle-orm";

// ─── Helper: xác thực user từ req ──────────────────────────────────────────────

function requireUser(req: any, res: any): string | null {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Unauthorized. Vui lòng đăng nhập và gửi JWT Bearer token trong header Authorization.",
    });
    return null;
  }
  return (req.user as any).id as string;
}

// ─── Helper: tính quyền chat chi tiết cho mobile ──────────────────────────────

/**
 * Trả về object quyền chat với tên rõ ràng, tách biệt từng hành động:
 *   canCreateGroup  — Tạo nhóm chat mới (chỉ staff/admin, không phải học sinh)
 *   canAddMember    — Thêm thành viên vào nhóm (cần quyền "Tạo" trên /chat,
 *                     hoặc là người tạo nhóm — kiểm tra per-group khi gọi API)
 *   canRemoveMember — Xoá thành viên khỏi nhóm (cần quyền "Xoá" trên /chat,
 *                     hoặc là người tạo nhóm — kiểm tra per-group khi gọi API)
 *   canOpenDM       — Mở chat 1-1: staff được DM với bất kỳ ai;
 *                     học sinh chỉ được DM giáo viên của mình (server enforce per-request)
 */
async function getChatPermissions(req: any): Promise<{
  canCreateGroup: boolean;
  canAddMember: boolean;
  canRemoveMember: boolean;
  canOpenDM: boolean;
}> {
  const isSuperAdmin: boolean = req.isSuperAdmin ?? false;
  const isStudent: boolean    = req.isStudent ?? false;

  if (isSuperAdmin) {
    return { canCreateGroup: true, canAddMember: true, canRemoveMember: true, canOpenDM: true };
  }

  if (isStudent) {
    // Học sinh không tạo nhóm, không thêm/xoá thành viên
    // nhưng vẫn được mở DM với giáo viên của mình
    return { canCreateGroup: false, canAddMember: false, canRemoveMember: false, canOpenDM: true };
  }

  // Staff — lấy quyền thực tế từ bảng phân quyền theo route /chat
  let canCreate = false;
  let canDelete = false;
  try {
    const { getEffectivePermissions } = await import("../storage/permissions.storage");
    const roleIds: string[] = req.roleIds || [];
    if (roleIds.length > 0) {
      const perms = await getEffectivePermissions(roleIds, "/chat");
      canCreate = perms.canCreate;
      canDelete = perms.canDelete;
    }
  } catch { /* bỏ qua lỗi, mặc định false */ }

  return {
    canCreateGroup:  true,        // Staff luôn được tạo nhóm (chỉ học sinh mới bị chặn)
    canAddMember:    canCreate,   // Quyền "Tạo" trên /chat → thêm thành viên
    canRemoveMember: canDelete,   // Quyền "Xoá" trên /chat → xoá thành viên
    canOpenDM:       true,        // Staff DM với bất kỳ ai
  };
}

// ─── Helper: kiểm tra quyền truy cập kênh chat ────────────────────────────────

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

// ─── Đăng ký các route ──────────────────────────────────────────────────────────

export function registerMobileChatRoutes(app: Express): void {

  /**
   * POST /api/mobile/chat/connect
   *
   * Trả về thông tin kết nối Tinode để app mobile có thể tự kết nối WebSocket.
   * Bao gồm: server URL, login, password (deterministic từ userId), displayName.
   *
   * Headers:
   *   Authorization: Bearer <jwt_token>
   *
   * Response 200:
   * {
   *   success: true,
   *   data: {
   *     tinodeUrl: string,       // WebSocket URL của Tinode server
   *     apiKey: string,          // API key để kết nối Tinode
   *     login: string,           // Tinode login (deterministic)
   *     password: string,        // Tinode password (deterministic)
   *     displayName: string | null,
   *     generatedAt: string      // ISO 8601
   *   }
   * }
   */
  app.post("/api/mobile/chat/connect", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;

    try {
      const { isTinodeConfigured, getUserCredentials, ensureUserInTinode } = await import("../lib/tinode.service");

      if (!isTinodeConfigured()) {
        return res.status(503).json({
          success: false,
          message: "Tính năng chat chưa được cấu hình trên server.",
        });
      }

      await ensureUserInTinode(userId);

      // Lấy tinodeUid của chính user (sau ensureUserInTinode để chắc chắn đã có)
      const [userWithUid] = await db
        .select({ tinodeUserId: users.tinodeUserId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const ownTinodeUid = userWithUid?.tinodeUserId ?? null;

      // Lấy tên hiển thị
      let displayName: string | null = null;
      const [staffRow] = await db
        .select({ fullName: staff.fullName })
        .from(staff)
        .where(eq(staff.userId, userId))
        .limit(1);

      if (staffRow) {
        displayName = staffRow.fullName;
      } else {
        const [studentRow] = await db
          .select({ fullName: students.fullName })
          .from(students)
          .where(eq(students.userId, userId))
          .limit(1);
        if (studentRow) displayName = studentRow.fullName;
      }

      const creds = await getUserCredentials(userId);

      res.set("Cache-Control", "no-store");
      return res.status(200).json({
        success: true,
        data: {
          tinodeUrl: process.env.TINODE_URL ?? null,
          apiKey: creds.apiKey ?? null,
          login: creds.login,
          password: creds.password,
          displayName,
          tinodeUid: ownTinodeUid,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      console.error("[MobileChat] /connect error:", err);
      return res.status(500).json({
        success: false,
        message: "Lỗi server khi lấy thông tin kết nối chat.",
      });
    }
  });

  /**
   * GET /api/mobile/chat/channels
   *
   * Trả về danh sách kênh chat (theo lớp học) của user hiện tại.
   * Tự động tạo topic Tinode nếu chưa có.
   *
   * Headers:
   *   Authorization: Bearer <jwt_token>
   *
   * Response 200:
   * {
   *   success: true,
   *   data: {
   *     channels: [
   *       {
   *         topicId: string,       // Tinode group topic ID (vd: "grpXXX")
   *         classId: string,
   *         className: string,
   *         createdAt: string      // ISO 8601 — thời điểm API trả dữ liệu
   *       }
   *     ],
   *     total: number,
   *     fetchedAt: string          // ISO 8601
   *   }
   * }
   */
  app.get("/api/mobile/chat/channels", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;

    const isSuperAdmin: boolean        = (req as any).isSuperAdmin ?? false;
    const isStudent: boolean           = (req as any).isStudent ?? false;
    const staffId: string | null       = (req as any).staffId ?? null;
    const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];

    try {
      // Kênh lớp học tự động đã bị tắt — endpoint này không còn trả dữ liệu lớp
      const now = new Date().toISOString();
      res.set("Cache-Control", "no-store");
      return res.status(200).json({
        success: true,
        data: { channels: [], total: 0, fetchedAt: now },
      });
    } catch (err: any) {
      console.error("[MobileChat] /channels error:", err);
      return res.status(500).json({
        success: false,
        message: "Lỗi server khi lấy danh sách kênh chat.",
      });
    }
  });

  /**
   * GET /api/mobile/chat/channel/:classId
   *
   * Lấy thông tin kênh chat của một lớp cụ thể.
   * Kiểm tra quyền truy cập trước khi trả về.
   *
   * Headers:
   *   Authorization: Bearer <jwt_token>
   *
   * Response 200:
   * {
   *   success: true,
   *   data: {
   *     topicId: string,
   *     classId: string,
   *     className: string,
   *     tinodeUrl: string | null,
   *     apiKey: string | null,
   *     fetchedAt: string     // ISO 8601
   *   }
   * }
   */
  app.get("/api/mobile/chat/channel/:classId", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;

    const { classId } = req.params;

    try {
      // Kênh chat theo lớp học đã bị tắt
      return res.status(410).json({
        success: false,
        message: "Kênh chat tự động theo lớp học không còn được hỗ trợ.",
      });
    } catch (err: any) {
      console.error("[MobileChat] /channel/:classId error:", err);
      return res.status(500).json({
        success: false,
        message: "Lỗi server khi lấy thông tin kênh chat.",
      });
    }
  });

  /**
   * PUT /api/mobile/chat/uid
   *
   * Lưu Tinode UID của user (gọi sau khi app đăng nhập thành công vào Tinode).
   *
   * Headers:
   *   Authorization: Bearer <jwt_token>
   *   Content-Type: application/json
   *
   * Body: { "tinodeUid": "usrXXXXXXXXXX" }
   *
   * Response 200:
   * { "success": true, "message": "Đã lưu Tinode UID thành công.", "updatedAt": "..." }
   */
  app.put("/api/mobile/chat/uid", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;

    const { tinodeUid } = req.body;

    if (!tinodeUid || typeof tinodeUid !== "string" || !tinodeUid.startsWith("usr")) {
      return res.status(400).json({
        success: false,
        message: "tinodeUid không hợp lệ. Phải là chuỗi bắt đầu bằng 'usr'.",
      });
    }

    try {
      await db
        .update(users)
        .set({ tinodeUserId: tinodeUid } as any)
        .where(eq(users.id, userId));

      return res.status(200).json({
        success: true,
        message: "Đã lưu Tinode UID thành công.",
        updatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("[MobileChat] /uid error:", err);
      return res.status(500).json({
        success: false,
        message: "Lỗi server khi lưu Tinode UID.",
      });
    }
  });

  /**
   * GET /api/mobile/chat/users?uids=usrAAA,usrBBB
   *
   * Tra tên hiển thị theo danh sách Tinode UID (dùng để hiển thị tin nhắn trong chat).
   *
   * Headers:
   *   Authorization: Bearer <jwt_token>
   *
   * Query params:
   *   uids — danh sách Tinode UID, phân cách bằng dấu phẩy (tối đa 50)
   *
   * Response 200:
   * {
   *   success: true,
   *   data: {
   *     users: [
   *       { tinodeUid: string, displayName: string }
   *     ],
   *     fetchedAt: string   // ISO 8601
   *   }
   * }
   */
  app.get("/api/mobile/chat/users", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;

    const uidsParam = req.query.uids as string;
    if (!uidsParam || !uidsParam.trim()) {
      return res.status(400).json({
        success: false,
        message: "Query param 'uids' là bắt buộc. Ví dụ: ?uids=usrAAA,usrBBB",
      });
    }

    const uids = uidsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (uids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Danh sách uids không hợp lệ.",
      });
    }
    if (uids.length > 50) {
      return res.status(400).json({
        success: false,
        message: "Tối đa 50 UID mỗi lần truy vấn.",
      });
    }

    try {
      const rows = await db
        .select({
          tinodeUserId: users.tinodeUserId,
          staffName:    staff.fullName,
          studentName:  students.fullName,
        })
        .from(users)
        .leftJoin(staff, eq(staff.userId, users.id))
        .leftJoin(students, eq(students.userId, users.id))
        .where(inArray(users.tinodeUserId as any, uids));

      const userList: { tinodeUid: string; displayName: string }[] = [];
      for (const row of rows) {
        if (row.tinodeUserId) {
          const displayName = row.staffName ?? row.studentName ?? row.tinodeUserId;
          userList.push({ tinodeUid: row.tinodeUserId, displayName });
        }
      }

      res.set("Cache-Control", "no-store");
      return res.status(200).json({
        success: true,
        data: {
          users: userList,
          fetchedAt: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      console.error("[MobileChat] /users error:", err);
      return res.status(500).json({
        success: false,
        message: "Lỗi server khi tra cứu tên người dùng.",
      });
    }
  });

  /**
   * GET /api/mobile/chat/search-users?q=<tên>
   *
   * Tìm kiếm user để mở chat DM hoặc thêm vào nhóm.
   * - Học viên: chỉ tìm được giáo viên trong các lớp đang học.
   * - Nhân viên / Admin: tìm tất cả nhân viên và học viên.
   *
   * Headers:
   *   Authorization: Bearer <jwt_token>
   *
   * Query params:
   *   q — từ khoá tìm kiếm (bắt buộc, tối thiểu 1 ký tự)
   *
   * Response 200:
   * {
   *   success: true,
   *   data: {
   *     users: [
   *       {
   *         userId: string,
   *         displayName: string,
   *         role: "staff" | "student",
   *         tinodeLogin: string,
   *         tinodeUid: string | null
   *       }
   *     ]
   *   }
   * }
   */
  app.get("/api/mobile/chat/search-users", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;

    const q = ((req.query.q as string) ?? "").trim();
    if (!q) {
      return res.status(200).json({ success: true, data: { users: [] } });
    }

    const isStudent: boolean = (req as any).isStudent ?? false;

    try {
      const { getTinodeLogin } = await import("../lib/tinode.service");
      const pattern = `%${q}%`;

      let results: { userId: string; displayName: string; role: "staff" | "student"; tinodeLogin: string; tinodeUid: string | null }[] = [];

      if (isStudent) {
        const [studentRow] = await db
          .select({ id: students.id })
          .from(students)
          .where(eq(students.userId, userId))
          .limit(1);

        if (studentRow) {
          const classRows = await db
            .select({ teacherIds: classes.teacherIds })
            .from(classes)
            .innerJoin(studentClasses, eq(studentClasses.classId, classes.id))
            .where(eq(studentClasses.studentId, studentRow.id));

          const teacherStaffIds = Array.from(new Set(classRows.flatMap(c => c.teacherIds ?? [])));

          if (teacherStaffIds.length > 0) {
            const staffRows = await db
              .select({ userId: staff.userId, fullName: staff.fullName })
              .from(staff)
              .where(and(inArray(staff.id, teacherStaffIds), ilike(staff.fullName, pattern)))
              .limit(10);

            const staffUserIds = staffRows.map(r => r.userId).filter((id): id is string => !!id);
            const userRows = staffUserIds.length > 0
              ? await db.select({ id: users.id, tinodeUserId: users.tinodeUserId }).from(users).where(inArray(users.id, staffUserIds))
              : [];
            const uidMap = Object.fromEntries(userRows.map(u => [u.id, u.tinodeUserId ?? null]));

            results = staffRows
              .filter(r => !!r.userId && r.userId !== userId)
              .map(r => ({
                userId:      r.userId!,
                displayName: r.fullName ?? "Giáo viên",
                role:        "staff" as const,
                tinodeLogin: getTinodeLogin(r.userId!),
                tinodeUid:   uidMap[r.userId!] ?? null,
              }));
          }
        }
      } else {
        const [staffRows, studentRows] = await Promise.all([
          db.select({ userId: staff.userId, fullName: staff.fullName }).from(staff).where(ilike(staff.fullName, pattern)).limit(10),
          db.select({ userId: students.userId, fullName: students.fullName }).from(students).where(ilike(students.fullName, pattern)).limit(10),
        ]);

        const allUserIds = [...staffRows.map(r => r.userId), ...studentRows.map(r => r.userId)].filter((id): id is string => !!id);
        const userRows = allUserIds.length > 0
          ? await db.select({ id: users.id, tinodeUserId: users.tinodeUserId }).from(users).where(inArray(users.id, allUserIds))
          : [];
        const uidMap = Object.fromEntries(userRows.map(u => [u.id, u.tinodeUserId ?? null]));

        results = [
          ...staffRows.filter(r => !!r.userId && r.userId !== userId).map(r => ({
            userId: r.userId!, displayName: r.fullName ?? "Nhân viên", role: "staff" as const,
            tinodeLogin: getTinodeLogin(r.userId!), tinodeUid: uidMap[r.userId!] ?? null,
          })),
          ...studentRows.filter(r => !!r.userId && r.userId !== userId).map(r => ({
            userId: r.userId!, displayName: r.fullName ?? "Học viên", role: "student" as const,
            tinodeLogin: getTinodeLogin(r.userId!), tinodeUid: uidMap[r.userId!] ?? null,
          })),
        ];
      }

      return res.status(200).json({ success: true, data: { users: results } });
    } catch (err: any) {
      console.error("[MobileChat] /search-users error:", err);
      return res.status(500).json({ success: false, message: "Lỗi server khi tìm kiếm người dùng." });
    }
  });

  /**
   * POST /api/mobile/chat/p2p/open
   *
   * Mở / chuẩn bị chat riêng (DM) với một user khác.
   * Tạo hoặc tái sử dụng group topic (grp*) dạng DM, lưu vào chat_groups — KHÔNG dùng
   * Tinode P2P (usr*) native nữa (đồng bộ với web: POST /api/chat/p2p/open).
   *
   * Học viên chỉ được mở DM với giáo viên của lớp mình (403 nếu không hợp lệ).
   *
   * Headers:
   *   Authorization: Bearer <jwt_token>
   *   Content-Type: application/json
   *
   * Body: { "targetUserId": "uuid-của-user-kia" }
   *
   * Response 200:
   * {
   *   success: true,
   *   data: {
   *     topicId: string,   // grp* — dùng để subscribe topic qua Tinode SDK
   *     groupId: string,
   *     isNew:   boolean,
   *     name:    string    // Tên hiển thị THẬT của người kia — app PHẢI dùng field này
   *                        // làm tiêu đề màn hình chat, KHÔNG dùng topic.public.fn từ Tinode SDK
   *                        // (fn không phân biệt theo người xem nên có thể sai một chiều).
   *   }
   * }
   */
  app.post("/api/mobile/chat/p2p/open", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;

    const isStudent: boolean = (req as any).isStudent ?? false;
    const { targetUserId } = req.body;
    if (!targetUserId || typeof targetUserId !== "string") {
      return res.status(400).json({ success: false, message: "targetUserId là bắt buộc." });
    }
    if (targetUserId === userId) {
      return res.status(400).json({ success: false, message: "Không thể mở chat với chính mình." });
    }

    try {
      const { isTinodeConfigured, createGroupTopic, addMemberToTopic, ensureUserInTinode, verifyAndSetTopicDefacs } = await import("../lib/tinode.service");

      if (!isTinodeConfigured()) {
        return res.status(503).json({ success: false, message: "Tính năng chat chưa được cấu hình trên server." });
      }

      // ── Authorization — học viên chỉ được DM giáo viên của lớp mình ──────────
      // (Đồng bộ với check tương ứng ở web: POST /api/chat/p2p/open)
      if (isStudent) {
        const [studentRow] = await db
          .select({ id: students.id })
          .from(students).where(eq(students.userId, userId)).limit(1);
        if (!studentRow) return res.status(403).json({ success: false, message: "Không có quyền." });

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
          return res.status(403).json({ success: false, message: "Bạn chỉ có thể nhắn tin với giáo viên của mình." });
        }
      }

      // Kiểm tra user đích tồn tại
      const [targetRow] = await db
        .select({ id: users.id, tinodeUserId: users.tinodeUserId })
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);
      if (!targetRow) {
        return res.status(404).json({ success: false, message: "Không tìm thấy người dùng." });
      }

      // Tên hiển thị thật của người kia (dùng làm tên Tinode topic + trả về cho app hiển thị ngay)
      const [targetStaffName]   = await db.select({ fullName: staff.fullName }).from(staff).where(eq(staff.userId, targetUserId)).limit(1);
      const [targetStudentName] = await db.select({ fullName: students.fullName }).from(students).where(eq(students.userId, targetUserId)).limit(1);
      const targetDisplayName: string = targetStaffName?.fullName ?? targetStudentName?.fullName ?? "Chat";

      const dmKey = `dm_${[userId, targetUserId].sort().join("_")}`;

      // ── Advisory lock theo cặp dmKey — tránh tạo trùng khi bấm nhanh/2 request cùng lúc ──
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${dmKey}))`);

        // Re-check trong lock
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
          // Stale-topic recovery — giống hệt web
          const topicExists = await verifyAndSetTopicDefacs(existingRow.tinode_topic_id);
          if (topicExists) {
            return { topicId: existingRow.tinode_topic_id as string, groupId: existingRow.id as string, isNew: false };
          }
          const newTopicId = await createGroupTopic(targetDisplayName, dmKey);
          if (newTopicId) {
            await tx.execute(sql`UPDATE chat_groups SET tinode_topic_id = ${newTopicId} WHERE id = ${existingRow.id}`);
            console.log(`[MobileChat] Recreated stale DM topic for pair ${dmKey}: ${existingRow.tinode_topic_id} → ${newTopicId}`);
            return { topicId: newTopicId, groupId: existingRow.id as string, isNew: false };
          }
          return { topicId: existingRow.tinode_topic_id as string, groupId: existingRow.id as string, isNew: false };
        }

        // Tạo group topic mới — dùng tên thật của người kia làm public.fn (KHÔNG dùng dmKey nữa)
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

        return { topicId, groupId: group.id as string, isNew: true };
      });

      // Thêm cả 2 user vào Tinode topic (ngoài transaction — gọi Tinode API, không cần rollback DB nếu lỗi)
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
            console.warn(`[MobileChat] P2P addMember skip uid=${uid}:`, e?.message);
          }
        }

        // Subscribe bot để nhận tin nhắn và gửi push
        import("../services/tinode-push.service").then(({ subscribeBotToTopic }) =>
          subscribeBotToTopic(result.topicId).catch(() => {})
        ).catch(() => {});
      }

      return res.status(200).json({
        success: true,
        data: { topicId: result.topicId, groupId: result.groupId, isNew: result.isNew, name: targetDisplayName },
      });
    } catch (err: any) {
      console.error("[MobileChat] /p2p/open error:", err);
      return res.status(500).json({ success: false, message: "Lỗi server khi mở chat riêng." });
    }
  });

  /**
   * GET /api/mobile/chat/groups
   *
   * Danh sách TẤT CẢ nhóm của user (nhóm từ lớp học + nhóm tạo tay), dùng cho tab "Nhóm".
   *
   * Headers:
   *   Authorization: Bearer <jwt_token>
   *
   * Response 200:
   * {
   *   success: true,
   *   data: {
   *     groups: [
   *       {
   *         topicId:     string,         // Tinode topic ID (grpXXX) — dùng để subscribe
   *         name:        string,         // tên nhóm hoặc tên lớp
   *         memberCount: number,
   *         isCreator:   boolean,        // true → hiện nút Đổi tên / Xoá
   *         createdAt:   string          // ISO 8601
   *       }
   *     ],
   *     total: number,
   *     permissions: { canCreate: boolean }
   *   }
   * }
   */
  app.get("/api/mobile/chat/groups", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;

    const isSuperAdmin: boolean        = (req as any).isSuperAdmin ?? false;
    const isStudent: boolean           = (req as any).isStudent ?? false;
    const staffId: string | null       = (req as any).staffId ?? null;
    const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];

    try {
      const { isTinodeConfigured, createClassTopic, ensureTopicDefacs } = await import("../lib/tinode.service");

      // Kênh lớp học tự động đã bị tắt — chỉ còn nhóm tùy chỉnh và DM

      // ── 2. Nhóm tạo tay + DM ───────────────────────────────────────────────
      const memberRows = await db
        .select({ groupId: chatGroupMembers.groupId })
        .from(chatGroupMembers)
        .where(eq(chatGroupMembers.userId, userId));

      const groupIds = memberRows.map(r => r.groupId);
      let customGroups: { topicId: string | null; name: string; memberCount: number; isCreator: boolean; createdAt: string }[] = [];

      if (groupIds.length > 0) {
        const [groupRows, memberCountRows] = await Promise.all([
          db.select().from(chatGroups).where(inArray(chatGroups.id, groupIds)),
          db
            .select({ groupId: chatGroupMembers.groupId, count: sql<number>`count(*)::int` })
            .from(chatGroupMembers)
            .where(inArray(chatGroupMembers.groupId, groupIds))
            .groupBy(chatGroupMembers.groupId),
        ]);
        const countMap = Object.fromEntries(memberCountRows.map(r => [r.groupId, r.count]));

        // Với group là DM (is_direct_message = true), KHÔNG dùng g.name (raw dmKey) —
        // tra tên hiển thị thật của người còn lại, theo góc nhìn của user đang gọi API.
        const dmGroupIds = groupRows.filter((g: any) => g.isDirectMessage).map((g: any) => g.id);
        let dmNameMap: Record<string, string> = {};
        if (dmGroupIds.length > 0) {
          const dmNameRows = await db
            .select({
              groupId:  chatGroups.id,
              staffName:   staff.fullName,
              studentName: students.fullName,
              username:    users.username,
            })
            .from(chatGroups)
            .innerJoin(chatGroupMembers, and(eq(chatGroupMembers.groupId, chatGroups.id), sql`${chatGroupMembers.userId} != ${userId}`))
            .innerJoin(users, eq(users.id, chatGroupMembers.userId))
            .leftJoin(staff, eq(staff.userId, users.id))
            .leftJoin(students, eq(students.userId, users.id))
            .where(inArray(chatGroups.id, dmGroupIds));
          dmNameMap = Object.fromEntries(
            dmNameRows.map(r => [r.groupId, r.staffName ?? r.studentName ?? r.username])
          );
        }

        customGroups = groupRows.map((g: any) => ({
          topicId:     g.tinodeTopicId ?? null,
          name:        g.isDirectMessage ? (dmNameMap[g.id] ?? g.name) : g.name,
          memberCount: countMap[g.id] ?? 0,
          isCreator:   g.createdBy === userId,
          createdAt:   g.createdAt instanceof Date ? g.createdAt.toISOString() : (g.createdAt ?? null),
        }));
      }

      // ── 2. Gộp lại, lọc topicId null ───────────────────────────────────────
      const allGroups = [
        ...customGroups.filter(g => g.topicId !== null),
      ] as { topicId: string; name: string; memberCount: number; isCreator: boolean; createdAt: string }[];

      const permissions = await getChatPermissions(req);

      return res.status(200).json({
        success: true,
        data: {
          groups: allGroups,
          total: allGroups.length,
          permissions,
        },
      });
    } catch (err: any) {
      console.error("[MobileChat] GET /groups error:", err);
      return res.status(500).json({ success: false, message: "Lỗi server khi lấy danh sách nhóm." });
    }
  });

  /**
   * GET /api/mobile/chat/permissions
   *
   * Trả về quyền chat chi tiết, tách biệt từng hành động của user hiện tại.
   * Gọi 1 lần khi khởi động màn hình chat để lưu vào state, không cần gọi lại mỗi lần.
   *
   * Headers:
   *   Authorization: Bearer <jwt_token>
   *
   * Response 200:
   * {
   *   "success": true,
   *   "data": {
   *     "permissions": {
   *       "canCreateGroup":  boolean,  // Tạo nhóm chat mới (false với học sinh)
   *       "canAddMember":    boolean,  // Thêm thành viên vào nhóm (quyền "Tạo" /chat)
   *       "canRemoveMember": boolean,  // Xoá thành viên khỏi nhóm (quyền "Xoá" /chat)
   *       "canOpenDM":       boolean   // Mở chat 1-1; học sinh chỉ được DM GV của mình (server enforce)
   *     }
   *   }
   * }
   *
   * Lưu ý per-group:
   *   Người tạo nhóm (isCreator = true trong GET /groups) luôn có quyền thêm/xoá thành viên
   *   trong nhóm đó, kể cả khi canAddMember/canRemoveMember = false ở đây.
   *   → Mobile nên kết hợp: hiện nút thêm/xoá nếu (canAddMember || isCreator) / (canRemoveMember || isCreator)
   */
  app.get("/api/mobile/chat/permissions", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;

    try {
      const permissions = await getChatPermissions(req);
      return res.status(200).json({ success: true, data: { permissions } });
    } catch (err: any) {
      console.error("[MobileChat] GET /permissions error:", err);
      return res.status(500).json({ success: false, message: "Lỗi server khi lấy quyền chat." });
    }
  });

  /**
   * POST /api/mobile/chat/groups
   *
   * Tạo nhóm chat tuỳ chỉnh mới.
   * Hỗ trợ 2 luồng:
   *  1. Tạo thủ công: truyền name + memberUserIds
   *  2. Tạo từ lớp: truyền classId (tuỳ chọn) → server tự lấy tên lớp nếu không có name,
   *     auto-fill thành viên là giáo viên + phụ trách + học viên active của lớp.
   *
   * Headers:
   *   Authorization: Bearer <jwt_token>
   *   Content-Type: application/json
   *
   * Body:
   * {
   *   "name": "Tên nhóm",                      // bắt buộc
   *   "memberUserIds": ["uuid1", "uuid2"],      // không cần gồm userId của chính mình
   *   "classId": "uuid-lop-hoc"                // tuỳ chọn — tự thêm thành viên từ lớp
   * }
   *
   * Response 200:
   * {
   *   success: true,
   *   data: {
   *     group: {
   *       id: string,
   *       name: string,
   *       topicId: string | null,
   *       createdBy: string,
   *       classId: string | null,
   *       createdAt: string
   *     }
   *   }
   * }
   */
  app.post("/api/mobile/chat/groups", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;

    const isStudent: boolean = (req as any).isStudent ?? false;
    if (isStudent) {
      return res.status(403).json({ success: false, message: "Học sinh và phụ huynh không được phép tạo nhóm chat." });
    }

    const { name, memberUserIds = [], classId } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ success: false, message: "Tên nhóm không được để trống." });
    }
    const validClassId: string | null = classId && typeof classId === "string" ? classId : null;

    try {
      const { isTinodeConfigured, createGroupTopic, addMemberToTopic, ensureUserInTinode } = await import("../lib/tinode.service");

      // Nếu có classId, lấy thêm thành viên từ lớp (giáo viên + phụ trách + học viên active)
      let extraMemberUserIds: string[] = [];
      if (validClassId) {
        const [cls] = await db
          .select({ teacherIds: classes.teacherIds, managerIds: classes.managerIds })
          .from(classes)
          .where(eq(classes.id, validClassId))
          .limit(1);

        if (cls) {
          const allStaffIds = Array.from(new Set([...(cls.teacherIds ?? []), ...(cls.managerIds ?? [])]));
          const staffUserIds: string[] = [];
          if (allStaffIds.length > 0) {
            const staffRows = await db
              .select({ userId: staff.userId })
              .from(staff)
              .where(inArray(staff.id, allStaffIds));
            staffRows.forEach(s => { if (s.userId) staffUserIds.push(s.userId); });
          }

          const studentUserIds: string[] = [];
          const studentRows = await db
            .select({ userId: students.userId })
            .from(students)
            .innerJoin(studentClasses, eq(studentClasses.studentId, students.id))
            .where(and(eq(studentClasses.classId, validClassId), eq(studentClasses.status, "active"), isNotNull(students.userId)));
          studentRows.forEach(s => { if (s.userId) studentUserIds.push(s.userId); });

          extraMemberUserIds = [...staffUserIds, ...studentUserIds];
        }
      }

      const [group] = await db.insert(chatGroups).values({
        name:      name.trim(),
        createdBy: userId,
        ...(validClassId ? { classId: validClassId } : {}),
      }).returning();

      const allMemberIds = Array.from(new Set([userId, ...(memberUserIds as string[]), ...extraMemberUserIds]));
      await db.insert(chatGroupMembers).values(allMemberIds.map(uid => ({ groupId: group.id, userId: uid })));

      // Tinode: tạo topic và thêm thành viên — nếu WS đang ngắt thì bỏ qua, nhóm vẫn được tạo
      let topicId: string | null = null;
      if (isTinodeConfigured()) {
        try {
          topicId = await createGroupTopic(name.trim(), group.id);
          if (topicId) {
            await db.update(chatGroups).set({ tinodeTopicId: topicId } as any).where(eq(chatGroups.id, group.id));
            // Subscribe bot vào topic mới để nhận tin nhắn và gửi push
            import("../services/tinode-push.service").then(({ subscribeBotToTopic }) =>
              subscribeBotToTopic(topicId!).catch(() => {})
            ).catch(() => {});

            const memberRows = await db
              .select({ id: users.id, tinodeUserId: users.tinodeUserId })
              .from(users)
              .where(inArray(users.id, allMemberIds));

            for (const member of memberRows) {
              if (member.id === userId) continue;
              try {
                let tinodeUid = member.tinodeUserId;
                if (!tinodeUid) {
                  const result = await ensureUserInTinode(member.id);
                  tinodeUid = result.tinodeUid;
                  if (tinodeUid) await db.update(users).set({ tinodeUserId: tinodeUid } as any).where(eq(users.id, member.id));
                }
                if (tinodeUid) await addMemberToTopic(topicId, tinodeUid);
              } catch (memberErr: any) {
                console.warn(`[MobileChat] addMember skip uid=${member.id}:`, memberErr?.message);
              }
            }
          }
        } catch (tinodeErr: any) {
          console.warn("[MobileChat] Tinode createGroupTopic failed (nhóm vẫn được tạo):", tinodeErr?.message);
        }
      }

      return res.status(200).json({
        success: true,
        data: {
          group: {
            id:        group.id,
            name:      group.name,
            topicId,
            createdBy: group.createdBy,
            classId:   (group as any).classId ?? null,
            createdAt: group.createdAt instanceof Date ? group.createdAt.toISOString() : (group.createdAt ?? null),
          },
        },
      });
    } catch (err: any) {
      console.error("[MobileChat] POST /groups error:", err);
      return res.status(500).json({ success: false, message: "Lỗi server khi tạo nhóm." });
    }
  });

  /**
   * GET /api/mobile/chat/classes/search?q=<tên hoặc mã lớp>
   *
   * Tìm kiếm lớp học để điền vào form tạo nhóm (chỉ staff).
   * Học viên không thể tạo nhóm nên sẽ nhận về danh sách rỗng.
   *
   * Headers:
   *   Authorization: Bearer <jwt_token>
   *
   * Query params:
   *   q — từ khoá tìm kiếm (tên hoặc mã lớp). Để trống → trả 20 lớp gần nhất.
   *
   * Response 200:
   * {
   *   success: true,
   *   data: {
   *     classes: [
   *       { id: string, name: string, classCode: string }
   *     ]
   *   }
   * }
   */
  app.get("/api/mobile/chat/classes/search", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;

    const q = ((req.query.q as string) ?? "").trim();

    try {
      // Tự tra DB thay vì dùng middleware props — đảm bảo luôn có dữ liệu đúng cho cả JWT và session
      const staffRows = await db
        .select({ staffId: staff.id, locationId: staffAssignments.locationId })
        .from(staff)
        .leftJoin(staffAssignments, eq(staffAssignments.staffId, staff.id))
        .where(eq(staff.userId, userId));

      // Học viên hoặc user không có staff record → không có quyền tạo nhóm
      if (staffRows.length === 0) {
        return res.status(200).json({ success: true, data: { classes: [] } });
      }

      const [userRow] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId)).limit(1);
      const isSuperAdmin = userRow?.username === "admin";
      const staffId = staffRows[0].staffId;
      const allowedLocationIds = staffRows.map(r => r.locationId).filter((id): id is string => !!id);

      if (isSuperAdmin) {
        // Super admin: tìm toàn bộ, chỉ lọc theo từ khoá
        const rows = await db
          .select({ id: classes.id, name: classes.name, classCode: classes.classCode })
          .from(classes)
          .where(q ? or(ilike(classes.name, `%${q}%`), ilike(classes.classCode, `%${q}%`)) : undefined)
          .limit(20);
        return res.status(200).json({ success: true, data: { classes: rows } });
      }

      // Staff thường: chỉ thấy lớp mà họ là GV, quản lý, HOẶC lớp thuộc cơ sở của mình
      const accessConditions: any[] = [
        sql`${staffId}::uuid = ANY(${classes.teacherIds})`,
        sql`${staffId}::uuid = ANY(${classes.managerIds})`,
      ];
      if (allowedLocationIds.length > 0) {
        accessConditions.push(inArray(classes.locationId, allowedLocationIds));
      }

      const accessFilter = or(...accessConditions);
      const searchFilter = q ? or(ilike(classes.name, `%${q}%`), ilike(classes.classCode, `%${q}%`)) : undefined;

      const rows = await db
        .select({ id: classes.id, name: classes.name, classCode: classes.classCode })
        .from(classes)
        .where(searchFilter ? and(searchFilter, accessFilter) : accessFilter)
        .limit(20);

      return res.status(200).json({ success: true, data: { classes: rows } });
    } catch (err: any) {
      console.error("[MobileChat] GET /classes/search error:", err);
      return res.status(500).json({ success: false, message: "Lỗi server khi tìm kiếm lớp." });
    }
  });

  /**
   * GET /api/mobile/chat/classes/:classId/members
   *
   * Lấy danh sách thành viên của một lớp học (giáo viên + phụ trách + học viên active).
   * Dùng để auto-fill form tạo nhóm khi chọn lớp.
   *
   * Headers:
   *   Authorization: Bearer <jwt_token>
   *
   * Response 200:
   * {
   *   success: true,
   *   data: {
   *     members: [
   *       { userId: string, displayName: string, role: "staff" | "student" }
   *     ]
   *   }
   * }
   */
  app.get("/api/mobile/chat/classes/:classId/members", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;

    const { classId } = req.params;
    const isSuperAdmin: boolean  = (req as any).isSuperAdmin ?? false;
    const isStudent: boolean     = (req as any).isStudent ?? false;
    const staffId: string | null = (req as any).staffId ?? null;

    try {
      const [cls] = await db
        .select({ teacherIds: classes.teacherIds, managerIds: classes.managerIds })
        .from(classes)
        .where(eq(classes.id, classId))
        .limit(1);
      if (!cls) return res.status(404).json({ success: false, message: "Không tìm thấy lớp." });

      if (!isSuperAdmin) {
        if (isStudent) {
          const [enrollment] = await db
            .select({ id: students.id })
            .from(students)
            .innerJoin(studentClasses, eq(studentClasses.studentId, students.id))
            .where(and(eq(students.userId, userId), eq(studentClasses.classId, classId), eq(studentClasses.status, "active")))
            .limit(1);
          if (!enrollment) return res.status(403).json({ success: false, message: "Không có quyền xem lớp này." });
        } else if (staffId) {
          const isTeacherOrManager =
            (cls.teacherIds ?? []).includes(staffId) || (cls.managerIds ?? []).includes(staffId);
          if (!isTeacherOrManager) return res.status(403).json({ success: false, message: "Không có quyền xem lớp này." });
        } else {
          return res.status(403).json({ success: false, message: "Không có quyền xem lớp này." });
        }
      }

      const allStaffIds = Array.from(new Set([...(cls.teacherIds ?? []), ...(cls.managerIds ?? [])]));
      const staffMembers: { userId: string; displayName: string; role: "staff" }[] = [];
      if (allStaffIds.length > 0) {
        const staffRows = await db
          .select({ userId: staff.userId, fullName: staff.fullName })
          .from(staff)
          .where(inArray(staff.id, allStaffIds));
        staffRows.forEach(s => {
          if (s.userId) staffMembers.push({ userId: s.userId, displayName: s.fullName ?? "Nhân viên", role: "staff" });
        });
      }

      const studentRows = await db
        .select({ userId: students.userId, fullName: students.fullName })
        .from(students)
        .innerJoin(studentClasses, eq(studentClasses.studentId, students.id))
        .where(and(eq(studentClasses.classId, classId), eq(studentClasses.status, "active"), isNotNull(students.userId)));

      const studentMembers = studentRows.map(s => ({
        userId: s.userId!,
        displayName: s.fullName ?? "Học viên",
        role: "student" as const,
      }));

      const seen = new Set<string>();
      const members = [...staffMembers, ...studentMembers].filter(m => {
        if (seen.has(m.userId)) return false;
        seen.add(m.userId);
        return true;
      });

      return res.status(200).json({ success: true, data: { members } });
    } catch (err: any) {
      console.error("[MobileChat] GET /classes/:classId/members error:", err);
      return res.status(500).json({ success: false, message: "Lỗi server khi lấy thành viên lớp." });
    }
  });

  /**
   * GET /api/mobile/chat/classes/:classId/groups
   *
   * Lấy danh sách nhóm chat đã được tạo từ lớp học này.
   * Dùng để hiển thị cảnh báo trong dialog tạo nhóm ("Lớp này đã có nhóm: X, Y").
   *
   * Headers:
   *   Authorization: Bearer <jwt_token>
   *
   * Response 200:
   * {
   *   success: true,
   *   data: {
   *     groups: [{ id: string, name: string }]
   *   }
   * }
   */
  app.get("/api/mobile/chat/classes/:classId/groups", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;

    const { classId } = req.params;

    try {
      const rows = await db
        .select({ id: chatGroups.id, name: chatGroups.name })
        .from(chatGroups)
        .where(eq((chatGroups as any).classId, classId));

      return res.status(200).json({ success: true, data: { groups: rows } });
    } catch (err: any) {
      console.error("[MobileChat] GET /classes/:classId/groups error:", err);
      return res.status(500).json({ success: false, message: "Lỗi server." });
    }
  });

  /**
   * GET /api/mobile/chat/topics/:topicId/members
   *
   * Lấy toàn bộ thành viên của một topic chat theo Tinode topicId (grp...).
   * Hoạt động với cả class-based topic lẫn custom group / DM group.
   *
   * Headers:
   *   Authorization: Bearer <jwt_token>
   *
   * Path params:
   *   topicId  — Tinode group topic ID, ví dụ "grpOwOiDiLPlCQ"
   *
   * Response 200:
   * {
   *   success: true,
   *   data: {
   *     members: [
   *       {
   *         userId:      string,          // UUID người dùng trong hệ thống
   *         displayName: string,          // Tên hiển thị
   *         role:        "staff" | "student"
   *       }
   *     ]
   *   }
   * }
   *
   * Response 404: topic không tồn tại trong hệ thống.
   */
  app.get("/api/mobile/chat/topics/:topicId/members", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;

    const { topicId } = req.params;

    try {
      // 1. Thử tìm trong chat_groups (custom group hoặc DM)
      const [group] = await db
        .select()
        .from(chatGroups)
        .where(eq(chatGroups.tinodeTopicId, topicId))
        .limit(1);

      if (group) {
        const memberRows = await db
          .select({ userId: chatGroupMembers.userId })
          .from(chatGroupMembers)
          .where(eq(chatGroupMembers.groupId, group.id));

        const userIds = memberRows.map(r => r.userId);
        if (userIds.length === 0) {
          return res.status(200).json({ success: true, data: { members: [] } });
        }

        const [staffRows, studentRows] = await Promise.all([
          db.select({ userId: staff.userId, fullName: staff.fullName })
            .from(staff)
            .where(inArray(staff.userId, userIds)),
          db.select({ userId: students.userId, fullName: students.fullName })
            .from(students)
            .where(inArray(students.userId as any, userIds)),
        ]);

        const staffMap = new Map(staffRows.map(s => [s.userId, s.fullName]));
        const studentMap = new Map(studentRows.map(s => [s.userId!, s.fullName]));

        const members = userIds.map(uid => {
          if (staffMap.has(uid)) return { userId: uid, displayName: staffMap.get(uid) ?? "Nhân viên", role: "staff" as const };
          if (studentMap.has(uid)) return { userId: uid, displayName: studentMap.get(uid) ?? "Học viên", role: "student" as const };
          return { userId: uid, displayName: uid.slice(0, 8), role: "staff" as const };
        });

        return res.status(200).json({ success: true, data: { members } });
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
            if (s.userId) staffMembers.push({ userId: s.userId, displayName: s.fullName ?? "Nhân viên", role: "staff" });
          });
        }

        const studentRows = await db
          .select({ userId: students.userId, fullName: students.fullName })
          .from(students)
          .innerJoin(studentClasses, eq(studentClasses.studentId, students.id))
          .where(and(eq(studentClasses.classId, cls.id), eq(studentClasses.status, "active"), isNotNull(students.userId)));

        const studentMembers = studentRows.map(s => ({
          userId: s.userId!,
          displayName: s.fullName ?? "Học viên",
          role: "student" as const,
        }));

        const seen = new Set<string>();
        const members = [...staffMembers, ...studentMembers].filter(m => {
          if (seen.has(m.userId)) return false;
          seen.add(m.userId);
          return true;
        });

        return res.status(200).json({ success: true, data: { members } });
      }

      // Không tìm thấy topic
      return res.status(404).json({ success: false, message: "Không tìm thấy topic trong hệ thống." });
    } catch (err: any) {
      console.error("[MobileChat] GET /topics/:topicId/members error:", err);
      return res.status(500).json({ success: false, message: "Lỗi server khi lấy thành viên." });
    }
  });

  /**
   * POST /api/mobile/chat/topics/:topicId/members
   *
   * Thêm thành viên vào nhóm chat tuỳ chỉnh.
   * Chỉ áp dụng cho custom group (không áp dụng cho DM hoặc nhóm lớp học).
   *
   * Quyền: isSuperAdmin  HOẶC  người tạo nhóm  HOẶC  staff có quyền "Tạo" trên /chat.
   *
   * Headers:
   *   Authorization: Bearer <jwt_token>
   *   Content-Type: application/json
   *
   * Params:
   *   topicId — Tinode topic ID của nhóm (grp...)
   *
   * Body:
   * {
   *   "memberUserId": "uuid-cua-user-can-them"   // bắt buộc
   * }
   *
   * Response 200:
   * { "success": true }
   *
   * Response 400: Nhóm DM không cho thêm thành viên
   * Response 403: Không có quyền
   * Response 404: Không tìm thấy nhóm
   * Response 409: Thành viên đã có trong nhóm
   */
  app.post("/api/mobile/chat/topics/:topicId/members", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;

    const isSuperAdmin: boolean = (req as any).isSuperAdmin ?? false;
    const { topicId } = req.params;
    const { memberUserId } = req.body;

    if (!memberUserId || typeof memberUserId !== "string") {
      return res.status(400).json({ success: false, message: "memberUserId là bắt buộc." });
    }

    try {
      const checkPerm = async (createdBy?: string | null): Promise<boolean> => {
        if (isSuperAdmin) return true;
        if (createdBy === userId) return true;
        const { getEffectivePermissions } = await import("../storage/permissions.storage");
        const roleIds: string[] = (req as any).roleIds || [];
        if (!roleIds.length) return false;
        const perms = await getEffectivePermissions(roleIds, "/chat");
        return perms.canCreate;
      };

      const [group] = await db.select().from(chatGroups).where(eq(chatGroups.tinodeTopicId, topicId)).limit(1);
      if (!group) return res.status(404).json({ success: false, message: "Không tìm thấy nhóm." });
      if (group.isDirectMessage) return res.status(400).json({ success: false, message: "Không thể thêm thành viên vào tin nhắn trực tiếp." });
      if (!await checkPerm(group.createdBy)) return res.status(403).json({ success: false, message: "Bạn không có quyền thêm thành viên." });

      const [existing] = await db.select().from(chatGroupMembers)
        .where(and(eq(chatGroupMembers.groupId, group.id), eq(chatGroupMembers.userId, memberUserId))).limit(1);
      if (existing) return res.status(409).json({ success: false, message: "Thành viên đã có trong nhóm." });

      await db.insert(chatGroupMembers).values({ groupId: group.id, userId: memberUserId });

      // Thêm vào Tinode
      try {
        const { addMemberToTopic, ensureUserInTinode } = await import("../lib/tinode.service");
        const [userRow] = await db.select({ tinodeUserId: users.tinodeUserId })
          .from(users).where(eq(users.id, memberUserId)).limit(1);
        let tinodeUid = userRow?.tinodeUserId;
        if (!tinodeUid) {
          const result = await ensureUserInTinode(memberUserId);
          tinodeUid = result.tinodeUid;
          if (tinodeUid) await db.update(users).set({ tinodeUserId: tinodeUid } as any).where(eq(users.id, memberUserId));
        }
        if (tinodeUid) await addMemberToTopic(topicId, tinodeUid);
      } catch (e: any) {
        console.warn("[MobileChat] addMemberToTopic failed (thành viên đã được thêm vào DB):", e?.message);
      }

      return res.status(200).json({ success: true });
    } catch (err: any) {
      console.error("[MobileChat] POST /topics/:topicId/members error:", err);
      return res.status(500).json({ success: false, message: "Lỗi server khi thêm thành viên." });
    }
  });

  /**
   * DELETE /api/mobile/chat/topics/:topicId/members/:memberUserId
   *
   * Xoá thành viên khỏi nhóm chat tuỳ chỉnh.
   * Chỉ áp dụng cho custom group (không áp dụng cho DM hoặc nhóm lớp học).
   *
   * Quyền: isSuperAdmin  HOẶC  người tạo nhóm  HOẶC  staff có quyền "Xoá" trên /chat.
   * Người dùng luôn có thể tự xoá mình khỏi nhóm (tự rời nhóm).
   *
   * Headers:
   *   Authorization: Bearer <jwt_token>
   *
   * Params:
   *   topicId      — Tinode topic ID của nhóm (grp...)
   *   memberUserId — userId (UUID) của thành viên cần xoá, hoặc "me" để tự rời nhóm
   *
   * Response 200:
   * { "success": true }
   *
   * Response 400: Nhóm DM không cho xoá thành viên
   * Response 403: Không có quyền
   * Response 404: Không tìm thấy nhóm
   */
  app.delete("/api/mobile/chat/topics/:topicId/members/:memberUserId", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;

    const isSuperAdmin: boolean = (req as any).isSuperAdmin ?? false;
    const { topicId } = req.params;
    // Hỗ trợ "me" để tự rời nhóm
    const memberUserId = req.params.memberUserId === "me" ? userId : req.params.memberUserId;

    try {
      const checkPerm = async (createdBy?: string | null): Promise<boolean> => {
        if (isSuperAdmin) return true;
        if (createdBy === userId) return true;
        if (memberUserId === userId) return true; // Tự rời nhóm luôn được phép
        const { getEffectivePermissions } = await import("../storage/permissions.storage");
        const roleIds: string[] = (req as any).roleIds || [];
        if (!roleIds.length) return false;
        const perms = await getEffectivePermissions(roleIds, "/chat");
        return perms.canDelete;
      };

      const [group] = await db.select().from(chatGroups).where(eq(chatGroups.tinodeTopicId, topicId)).limit(1);
      if (!group) return res.status(404).json({ success: false, message: "Không tìm thấy nhóm." });
      if (group.isDirectMessage) return res.status(400).json({ success: false, message: "Không thể xoá thành viên khỏi tin nhắn trực tiếp." });
      if (!await checkPerm(group.createdBy)) return res.status(403).json({ success: false, message: "Bạn không có quyền xoá thành viên." });

      await db.delete(chatGroupMembers)
        .where(and(eq(chatGroupMembers.groupId, group.id), eq(chatGroupMembers.userId, memberUserId)));

      // Xoá khỏi Tinode
      try {
        const { removeMemberFromTopic } = await import("../lib/tinode.service");
        const [userRow] = await db.select({ tinodeUserId: users.tinodeUserId })
          .from(users).where(eq(users.id, memberUserId)).limit(1);
        if (userRow?.tinodeUserId) await removeMemberFromTopic(topicId, userRow.tinodeUserId);
      } catch (e: any) {
        console.warn("[MobileChat] removeMemberFromTopic failed (đã xoá khỏi DB):", e?.message);
      }

      return res.status(200).json({ success: true });
    } catch (err: any) {
      console.error("[MobileChat] DELETE /topics/:topicId/members/:memberUserId error:", err);
      return res.status(500).json({ success: false, message: "Lỗi server khi xoá thành viên." });
    }
  });
}

// Các endpoint DELETE /groups/:id, POST /groups/:id/members, GET /groups/:id,
// PUT /groups/:id, DELETE /groups/:id/members/:uid đã bị xoá —
