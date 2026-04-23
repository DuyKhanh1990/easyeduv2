/**
 * mobile-chat.routes.ts
 *
 * API chat dành riêng cho app mobile.
 * Hỗ trợ xác thực qua JWT Bearer token.
 * Tất cả dữ liệu đã được tính sẵn phía server — app không cần tính thêm.
 * Timestamps theo chuẩn ISO 8601.
 *
 * POST /api/mobile/chat/connect         → Lấy thông tin kết nối Tinode (credentials + server URL)
 * GET  /api/mobile/chat/channels        → Danh sách kênh chat của user (đã tính sẵn tên, topicId)
 * GET  /api/mobile/chat/channel/:classId → Thông tin kênh của một lớp cụ thể
 * PUT  /api/mobile/chat/uid             → Lưu Tinode UID sau khi mobile đăng nhập vào Tinode
 * GET  /api/mobile/chat/users           → Tra tên hiển thị theo danh sách Tinode UID
 */

import type { Express } from "express";
import { db } from "../db";
import { users, students, staff, studentClasses, classes } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";

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
    const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];

    try {
      const { isTinodeConfigured, createClassTopic, ensureTopicDefacs } = await import("../lib/tinode.service");

      if (!isTinodeConfigured()) {
        return res.status(200).json({
          success: true,
          data: { channels: [], total: 0, fetchedAt: new Date().toISOString() },
        });
      }

      // Lấy danh sách lớp phù hợp
      let classRows: { id: string; name: string; locationId: string; tinodeTopicId: string | null }[] = [];

      if (isStudent) {
        const [studentRow] = await db
          .select({ id: students.id })
          .from(students)
          .where(eq(students.userId, userId))
          .limit(1);

        if (studentRow) {
          classRows = await db
            .select({ id: classes.id, name: classes.name, locationId: classes.locationId, tinodeTopicId: classes.tinodeTopicId })
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

      // Đảm bảo mỗi lớp có Tinode topic
      const results = await Promise.allSettled(
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
            ensureTopicDefacs(topicId).catch(() => {});
          }

          if (!topicId) return null;

          return {
            topicId,
            classId: cls.id,
            className: cls.name,
          };
        })
      );

      const now = new Date().toISOString();
      const channels = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value !== null)
        .map((r) => ({ ...r.value, createdAt: now }));

      res.set("Cache-Control", "no-store");
      return res.status(200).json({
        success: true,
        data: {
          channels,
          total: channels.length,
          fetchedAt: now,
        },
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
      const { isTinodeConfigured, createClassTopic, getUserCredentials, ensureUserInTinode } = await import("../lib/tinode.service");

      if (!isTinodeConfigured()) {
        return res.status(503).json({
          success: false,
          message: "Tính năng chat chưa được cấu hình trên server.",
        });
      }

      const [cls] = await db
        .select({ id: classes.id, name: classes.name, locationId: classes.locationId, tinodeTopicId: classes.tinodeTopicId })
        .from(classes)
        .where(eq(classes.id, classId))
        .limit(1);

      if (!cls) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy lớp học với ID đã cung cấp.",
        });
      }

      const allowed = await checkClassAccess({
        userId,
        classId,
        locationId:         cls.locationId,
        isSuperAdmin:       (req as any).isSuperAdmin ?? false,
        isStudent:          (req as any).isStudent ?? false,
        allowedLocationIds: (req as any).allowedLocationIds ?? [],
      });

      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền truy cập kênh chat của lớp này.",
        });
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
        return res.status(502).json({
          success: false,
          message: "Không thể khởi tạo kênh chat. Vui lòng thử lại sau.",
        });
      }

      await ensureUserInTinode(userId);
      const creds = await getUserCredentials(userId);
      return res.status(200).json({
        success: true,
        data: {
          topicId,
          classId: cls.id,
          className: cls.name,
          tinodeUrl: process.env.TINODE_URL ?? null,
          apiKey: creds.apiKey ?? null,
          fetchedAt: new Date().toISOString(),
        },
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
}
