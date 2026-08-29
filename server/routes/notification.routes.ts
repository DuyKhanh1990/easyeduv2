import type { Express, Request, Response } from "express";
import { db } from "../storage/base";
import { notifications, students, notificationTemplates, centerNotificationTemplates, centerNotificationSettings, centerConfig } from "@shared/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { pool } from "../db";
import { notificationService } from "../application/notification/services/NotificationService";
import { notificationRepository } from "../infrastructure/notification/repositories/NotificationRepository";
import { sendNotification } from "../lib/notification";

async function ensureZnsSettingsTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_templates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code varchar(100) UNIQUE NOT NULL,
      name varchar(255),
      channel varchar(50),
      variables jsonb,
      enabled boolean DEFAULT true,
      created_at timestamp DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS center_notification_settings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      center_id uuid UNIQUE NOT NULL,
      attendance_enabled boolean DEFAULT true,
      class_changed_enabled boolean DEFAULT true,
      tuition_enabled boolean DEFAULT true,
      attendance_result_enabled boolean DEFAULT true,
      zalo_enabled boolean DEFAULT false,
      sms_enabled boolean DEFAULT false,
      email_enabled boolean DEFAULT false,
      channel_priority varchar(50) DEFAULT 'AUTO',
      created_at timestamp DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS student_notification_channels (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id uuid NOT NULL,
      center_id uuid NOT NULL,
      zalo_user_id text,
      is_followed boolean DEFAULT false,
      has_interacted boolean DEFAULT false,
      preferred_channel varchar(50) DEFAULT 'AUTO',
      created_at timestamp DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS notification_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      center_id uuid,
      student_id uuid,
      type varchar(100),
      channel varchar(50),
      status varchar(50),
      payload jsonb,
      created_at timestamp DEFAULT now()
    );
  `);
  await pool.query(`
    ALTER TABLE center_notification_settings
      ADD COLUMN IF NOT EXISTS channel_priority varchar(50) DEFAULT 'AUTO';
  `);
  await pool.query(`
    ALTER TABLE center_notification_settings
      ADD COLUMN IF NOT EXISTS debt_reminder_config jsonb;
  `);
  await pool.query(`
    ALTER TABLE notification_logs
      ADD COLUMN IF NOT EXISTS error_message text;
  `);
  await pool.query(`
    ALTER TABLE notification_logs
      ADD COLUMN IF NOT EXISTS reason varchar(100);
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'student_notification_channels'
          AND constraint_name = 'student_notification_channels_student_center_uniq'
      ) THEN
        ALTER TABLE student_notification_channels
          ADD CONSTRAINT student_notification_channels_student_center_uniq
          UNIQUE (student_id, center_id);
      END IF;
    END
    $$;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS center_notification_templates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      center_id uuid NOT NULL,
      location_id uuid,
      template_code varchar(100) NOT NULL,
      zns_template_id varchar(100),
      is_enabled boolean NOT NULL DEFAULT true,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now(),
      UNIQUE (center_id, template_code)
    );
  `);
  await pool.query(`
    INSERT INTO notification_templates (code, name, channel, variables) VALUES
      ('attendance_reminder', 'Nhắc lịch học', 'zalo', '["studentName","className","time","teacher","centerName"]'),
      ('class_changed', 'Đổi lịch học', 'zalo', '["studentName","className","newTime"]'),
      ('tuition_due', 'Nhắc học phí', 'zalo', '["studentName","amount","deadline"]'),
      ('attendance_result', 'Kết quả điểm danh', 'zalo', '["studentName","attendanceStatus","className","sessionDate","teacherName"]'),
      ('schedule_update_session', 'Cập nhật buổi học', 'zalo', '["className","oldWeekday","oldDate","oldTime","newWeekday","newDate","newTime"]'),
      ('schedule_cancel_session', 'Huỷ buổi học', 'zalo', '["className","weekday","date","time","reason"]'),
      ('schedule_update_cycle', 'Cập nhật chu kỳ lịch học', 'zalo', '["className","newWeekdays","fromWeekday","fromDate","fromTime","reason"]'),
      ('schedule_exclude_dates', 'Loại trừ ngày học', 'zalo', '["className","fromWeekday","fromDate","fromTime","toWeekday","toDate","toTime","reason"]'),
      ('invoice_created', 'Tạo hoá đơn', 'zalo', '["invoiceCode","amount","status","note"]'),
      ('invoice_paid', 'Thanh toán hoá đơn', 'zalo', '["invoiceCode","amount","note"]'),
      ('teacher_feedback', 'Nhận xét giáo viên', 'zalo', '["studentName","className","sessionDate","teacherName","action"]'),
      ('score_sheet', 'Bảng điểm', 'zalo', '["sheetName","className","studentName","totalScore","comment"]'),
      ('session_content', 'Giao nội dung buổi học', 'zalo', '["teacherName","className","sessionDate","contentList"]'),
      ('exam_score', 'Điểm kiểm tra online', 'zalo', '["examName","totalScore","correctCount","wrongCount","comment"]'),
      ('homework_score', 'Điểm BTVN', 'zalo', '["homeworkName","score","comment","className","sessionDate","teacherName"]'),
      ('debt_reminder_before', 'Nhắc công nợ trước hạn', 'zalo', '["amount","deadline","daysLabel"]'),
      ('debt_reminder_after', 'Nhắc công nợ quá hạn', 'zalo', '["amount","deadline","daysLabel"]')
    ON CONFLICT (code) DO UPDATE SET
      variables = EXCLUDED.variables;
  `);
  console.log("Migration: notification_templates, center_notification_settings, student_notification_channels, notification_logs ensured");
}

// Lấy tất cả userId cần truy vấn noti:
// - Với phụ huynh: gộp userId của phụ huynh + userId của các học viên liên kết
// - Với tài khoản khác: chỉ userId của chính họ
async function getRelevantUserIds(userId: string): Promise<string[]> {
  const [parentStudent] = await db
    .select({ id: students.id, type: students.type })
    .from(students)
    .where(and(eq(students.userId, userId), eq(students.type, "Phụ huynh")))
    .limit(1);

  if (!parentStudent) return [userId];

  // Tìm các học viên có parentIds chứa ID của phụ huynh này
  const linkedStudents = await db
    .select({ userId: students.userId })
    .from(students)
    .where(sql`${students.parentIds} @> ARRAY[${parentStudent.id}]::uuid[]`);

  const linkedUserIds = linkedStudents
    .map((s) => s.userId)
    .filter((id): id is string => !!id);

  return [userId, ...linkedUserIds];
}

export function registerNotificationRoutes(app: Express) {
  ensureZnsSettingsTables().catch(err => console.error("[ZNS] migration error:", err));

  // ─── GET /api/notification/zns-settings ──────────────────────────────────────
  app.get("/api/notification/zns-settings", async (req: Request, res: Response) => {
    try {
      const [center] = await db.select().from(centerConfig).limit(1);
      if (!center) return res.json({
        attendanceEnabled: true, classChangedEnabled: true,
        tuitionEnabled: true, attendanceResultEnabled: true,
        zaloEnabled: false, smsEnabled: false, emailEnabled: false,
        channelPriority: "AUTO",
      });
      const [settings] = await db.select().from(centerNotificationSettings)
        .where(eq(centerNotificationSettings.centerId, center.id)).limit(1);
      if (!settings) {
        const [created] = await db.insert(centerNotificationSettings)
          .values({ centerId: center.id }).returning();
        return res.json({
          attendanceEnabled: created.attendanceEnabled,
          classChangedEnabled: created.classChangedEnabled,
          tuitionEnabled: created.tuitionEnabled,
          attendanceResultEnabled: created.attendanceResultEnabled,
          zaloEnabled: created.zaloEnabled,
          smsEnabled: created.smsEnabled,
          emailEnabled: created.emailEnabled,
          channelPriority: created.channelPriority ?? "AUTO",
        });
      }
      return res.json({
        attendanceEnabled: settings.attendanceEnabled,
        classChangedEnabled: settings.classChangedEnabled,
        tuitionEnabled: settings.tuitionEnabled,
        attendanceResultEnabled: settings.attendanceResultEnabled,
        zaloEnabled: settings.zaloEnabled,
        smsEnabled: settings.smsEnabled,
        emailEnabled: settings.emailEnabled,
        channelPriority: settings.channelPriority ?? "AUTO",
      });
    } catch (err: any) {
      console.error("[ZNS] GET settings error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── PUT /api/notification/zns-settings ──────────────────────────────────────
  app.put("/api/notification/zns-settings", async (req: Request, res: Response) => {
    try {
      const [center] = await db.select().from(centerConfig).limit(1);
      if (!center) return res.status(400).json({ error: "Không tìm thấy cấu hình trung tâm" });
      const {
        attendanceEnabled, classChangedEnabled, tuitionEnabled,
        attendanceResultEnabled, zaloEnabled, smsEnabled, emailEnabled,
        channelPriority,
      } = req.body;
      const vals = {
        attendanceEnabled: attendanceEnabled ?? true,
        classChangedEnabled: classChangedEnabled ?? true,
        tuitionEnabled: tuitionEnabled ?? true,
        attendanceResultEnabled: attendanceResultEnabled ?? true,
        zaloEnabled: zaloEnabled ?? false,
        smsEnabled: smsEnabled ?? false,
        emailEnabled: emailEnabled ?? false,
        channelPriority: channelPriority ?? "AUTO",
      };
      const [existing] = await db.select().from(centerNotificationSettings)
        .where(eq(centerNotificationSettings.centerId, center.id)).limit(1);
      if (existing) {
        await db.update(centerNotificationSettings).set(vals)
          .where(eq(centerNotificationSettings.centerId, center.id));
      } else {
        await db.insert(centerNotificationSettings).values({ centerId: center.id, ...vals });
      }
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[ZNS] PUT settings error:", err);
      return res.status(500).json({ error: err.message });
    }
  });


  // ─── GET /api/notification/debt-reminder-config ──────────────────────────────
  app.get("/api/notification/debt-reminder-config", async (req: Request, res: Response) => {
    try {
      const result = await pool.query(`
        SELECT debt_reminder_config FROM center_notification_settings LIMIT 1
      `);
      const raw = result.rows[0]?.debt_reminder_config;
      return res.json(raw ?? null);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── PUT /api/notification/debt-reminder-config ──────────────────────────────
  app.put("/api/notification/debt-reminder-config", async (req: Request, res: Response) => {
    try {
      const [center] = await db.select().from(centerConfig).limit(1);
      if (!center) return res.status(400).json({ error: "Không tìm thấy cấu hình trung tâm" });
      const config = req.body;
      const [existing] = await db.select({ id: centerNotificationSettings.id })
        .from(centerNotificationSettings)
        .where(eq(centerNotificationSettings.centerId, center.id)).limit(1);
      if (existing) {
        await pool.query(
          `UPDATE center_notification_settings SET debt_reminder_config = $1::jsonb WHERE center_id = $2`,
          [JSON.stringify(config), center.id],
        );
      } else {
        await pool.query(
          `INSERT INTO center_notification_settings (center_id, debt_reminder_config) VALUES ($1, $2::jsonb)`,
          [center.id, JSON.stringify(config)],
        );
      }
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── GET /api/notification/templates ─────────────────────────────────────────
  // Trả về danh sách tất cả template gốc (code, name, variables)
  app.get("/api/notification/templates", async (req: Request, res: Response) => {
    try {
      const rows = await db.select().from(notificationTemplates).orderBy(notificationTemplates.code);
      return res.json(rows);
    } catch (err: any) {
      console.error("[ZNS] GET templates error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── GET /api/notification/center-templates ───────────────────────────────────
  // Lấy tất cả cấu hình ZNS template của trung tâm hiện tại
  app.get("/api/notification/center-templates", async (req: Request, res: Response) => {
    try {
      const [center] = await db.select().from(centerConfig).limit(1);
      if (!center) return res.json([]);
      const rows = await db
        .select()
        .from(centerNotificationTemplates)
        .where(eq(centerNotificationTemplates.centerId, center.id))
        .orderBy(centerNotificationTemplates.templateCode);
      return res.json(rows);
    } catch (err: any) {
      console.error("[ZNS] GET center-templates error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── PUT /api/notification/center-templates/:code ─────────────────────────────
  // Upsert cấu hình ZNS template cho trung tâm (znsTemplateId, locationId, isEnabled)
  app.put("/api/notification/center-templates/:code", async (req: Request, res: Response) => {
    try {
      const { code } = req.params;
      const { znsTemplateId, locationId, isEnabled } = req.body;
      const [center] = await db.select().from(centerConfig).limit(1);
      if (!center) return res.status(400).json({ error: "Không tìm thấy cấu hình trung tâm" });

      const [existing] = await db
        .select({ id: centerNotificationTemplates.id })
        .from(centerNotificationTemplates)
        .where(
          and(
            eq(centerNotificationTemplates.centerId, center.id),
            eq(centerNotificationTemplates.templateCode, code)
          )
        )
        .limit(1);

      const vals = {
        znsTemplateId: znsTemplateId ?? null,
        locationId: locationId ?? null,
        isEnabled: isEnabled ?? true,
        updatedAt: new Date(),
      };

      if (existing) {
        await db
          .update(centerNotificationTemplates)
          .set(vals)
          .where(eq(centerNotificationTemplates.id, existing.id));
      } else {
        await db.insert(centerNotificationTemplates).values({
          centerId: center.id,
          templateCode: code,
          ...vals,
        });
      }
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[ZNS] PUT center-templates error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── GET /api/notifications/logs ─────────────────────────────────────────────
  app.get("/api/notifications/logs", async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const type = (req.query.type as string) || undefined;
      const status = (req.query.status as string) || undefined;
      const result = await notificationRepository.getLogs({ page, limit, type, status });
      return res.json(result);
    } catch (err: any) {
      console.error("[NotificationLogs] GET error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/notifications/reminder — tạo thông báo nhắc nội bộ cho user ──
  app.post("/api/notifications/reminder", async (req: Request, res: Response) => {
    try {
      const user = req.user as { id: string } | undefined;
      if (!user) return res.sendStatus(401);
      const { title, content, referenceId, referenceType } = req.body;
      if (!title || !content) return res.status(400).json({ error: "title và content là bắt buộc" });
      // Dùng sendNotification thay vì db.insert trực tiếp để:
      // 1. Emit WebSocket real-time đến web client
      // 2. Gửi Expo Push đến mobile (nếu user đã đăng ký push token)
      const created = await sendNotification({
        userId: user.id,
        title,
        content,
        category: "task",
        referenceId: referenceId ?? undefined,
        referenceType: referenceType ?? "task",
        deeplink: {
          screen: "StaffTasks",
          params: referenceId ? { taskId: referenceId } : {},
        },
      });
      return res.json(created);
    } catch (err: any) {
      console.error("[NotificationReminder] error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/notifications/test ────────────────────────────────────────────
  app.post("/api/notifications/test", async (req: Request, res: Response) => {
    try {
      const { centerId, studentId, type, data } = req.body;
      if (!centerId || !studentId || !type) {
        return res.status(400).json({ error: "centerId, studentId và type là bắt buộc" });
      }
      await notificationService.send({ centerId, studentId, type, data: data ?? {} });
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[NotificationTest] error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/notifications", async (req: Request, res: Response) => {
    const user = req.user as { id: string } | undefined;
    if (!user) return res.sendStatus(401);

    const userIds = await getRelevantUserIds(user.id);

    const rows = await db
      .select()
      .from(notifications)
      .where(inArray(notifications.userId, userIds))
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    res.json(rows);
  });

  app.get("/api/notifications/unread-count", async (req: Request, res: Response) => {
    const user = req.user as { id: string } | undefined;
    if (!user) return res.sendStatus(401);

    const userIds = await getRelevantUserIds(user.id);

    const rows = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(inArray(notifications.userId, userIds), eq(notifications.isRead, false)));

    res.json({ count: rows.length });
  });

  app.patch("/api/notifications/:id/read", async (req: Request, res: Response) => {
    const user = req.user as { id: string } | undefined;
    if (!user) return res.sendStatus(401);

    const userIds = await getRelevantUserIds(user.id);

    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, req.params.id), inArray(notifications.userId, userIds)));

    res.json({ success: true });
  });

  app.patch("/api/notifications/read-all", async (req: Request, res: Response) => {
    const user = req.user as { id: string } | undefined;
    if (!user) return res.sendStatus(401);

    const userIds = await getRelevantUserIds(user.id);

    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(inArray(notifications.userId, userIds), eq(notifications.isRead, false)));

    res.json({ success: true });
  });

  app.delete("/api/notifications/:id", async (req: Request, res: Response) => {
    const user = req.user as { id: string } | undefined;
    if (!user) return res.sendStatus(401);

    const userIds = await getRelevantUserIds(user.id);

    await db
      .delete(notifications)
      .where(and(eq(notifications.id, req.params.id), inArray(notifications.userId, userIds)));

    res.json({ success: true });
  });

  // ─── POST /api/notifications/send — CRM entry point ─────────────────────────
  // Nhận studentId + template, tự động lookup centerId và routing OA/ZNS
  app.post("/api/notifications/send", async (req: Request, res: Response) => {
    try {
      const { studentId, template, data } = req.body;

      if (!studentId || !template) {
        return res.status(400).json({ error: "studentId và template là bắt buộc" });
      }

      const [center] = await db.select().from(centerConfig).limit(1);
      if (!center) {
        return res.status(400).json({ error: "Chưa cấu hình trung tâm" });
      }

      await notificationService.send({
        centerId: center.id,
        studentId,
        type: template,
        data: data ?? {},
      });

      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[NotificationSend] error:", err);
      return res.status(500).json({ error: err.message });
    }
  });
}
