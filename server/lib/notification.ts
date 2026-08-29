import nodemailer from "nodemailer";
import { db } from "../storage/base";
import { notifications } from "@shared/schema";
import { emitToUser } from "./ws-hub";
import { pushService } from "../services/push.service";

export interface NotificationDeeplink {
  /** Tên màn hình mobile cần mở, ví dụ "Calendar", "Invoices", "StaffTasks", "Chat" */
  screen: string;
  /** Tham số kèm theo, ví dụ { date, sessionId, classId, invoiceId, topicId } */
  params?: Record<string, string>;
}

export interface SendNotificationOptions {
  userId: string;
  title: string;
  content: string;
  category?: string;
  referenceId?: string;
  referenceType?: string;
  referenceDate?: string; // YYYY-MM-DD of the related session/event
  /**
   * Đích điều hướng khai rõ ngay lúc tạo notification — nguồn chính cho cả
   * REST list (deeplink field) và push payload (data.screen/data.params).
   * Không set → mobile.routes.ts fallback sang resolveDeeplink() suy luận
   * từ category/referenceType (giữ tương thích với notification cũ).
   */
  deeplink?: NotificationDeeplink;
  email?: string;
  /**
   * Có gửi Expo Push hay không. Mặc định: true.
   * Đặt false cho notification nội bộ / log hệ thống không cần push.
   */
  sendPush?: boolean;
}

async function saveNotification(opts: SendNotificationOptions) {
  const [row] = await db.insert(notifications).values({
    userId: opts.userId,
    title: opts.title,
    content: opts.content,
    type: "in-app",
    category: opts.category ?? "general",
    referenceId: opts.referenceId,
    referenceType: opts.referenceType,
    referenceDate: opts.referenceDate ?? null,
    deeplink: opts.deeplink ?? null,
    isRead: false,
    createdAt: new Date(),
  }).returning();
  return row;
}

/** Bulk INSERT nhiều notifications trong 1 roundtrip DB */
async function saveNotificationsMany(allOpts: SendNotificationOptions[]) {
  if (allOpts.length === 0) return [];
  const now = new Date();
  return db.insert(notifications).values(
    allOpts.map((opts) => ({
      userId: opts.userId,
      title: opts.title,
      content: opts.content,
      type: "in-app" as const,
      category: opts.category ?? "general",
      referenceId: opts.referenceId,
      referenceType: opts.referenceType,
      referenceDate: opts.referenceDate ?? null,
      deeplink: opts.deeplink ?? null,
      isRead: false,
      createdAt: now,
    })),
  ).returning();
}

function emitRealtime(userId: string, notification: object) {
  emitToUser(userId, { type: "notification", data: notification });
}

async function sendEmail(to: string, subject: string, content: string) {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.log("[Notification] SMTP not configured, skipping email to", to);
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port: port ? parseInt(port) : 587,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || user,
    to,
    subject,
    text: content,
    html: `<p>${content.replace(/\n/g, "<br>")}</p>`,
  });
}

export async function sendNotification(opts: SendNotificationOptions) {
  const saved = await saveNotification(opts);
  emitRealtime(opts.userId, saved);
  if (opts.email) {
    sendEmail(opts.email, opts.title, opts.content).catch((err) => {
      console.error("[Notification] Email send error:", err.message);
    });
  }
  // Fire-and-forget push — chỉ gửi nếu sendPush !== false
  // Lỗi push không bao giờ ảnh hưởng caller hoặc transaction chính
  if (opts.sendPush !== false) {
    void pushService.send(opts.userId, {
      title: opts.title,
      body: opts.content,
      data: {
        // Legacy mobile format: { type, referenceId, date } — giữ để tương thích
        // với client cũ chưa đọc screen/params.
        type: opts.category ?? "general",
        referenceId: opts.referenceId ?? null,
        referenceType: opts.referenceType ?? null,
        date: opts.referenceDate ?? null,
        // Dạng mới — mobile đọc trước nếu có, bỏ qua field legacy phía trên.
        ...(opts.deeplink ? { screen: opts.deeplink.screen, params: opts.deeplink.params ?? {} } : {}),
      },
    });
  }
  return saved;
}

export async function sendNotificationToMany(userIds: string[], opts: Omit<SendNotificationOptions, "userId">) {
  if (userIds.length === 0) return [];

  // 1. Bulk INSERT — 1 roundtrip thay vì N
  const allOpts = userIds.map((uid) => ({ ...opts, userId: uid }));
  const saved = await saveNotificationsMany(allOpts);

  // 2. Emit realtime per-user (WebSocket, không có DB)
  for (const row of saved) {
    emitRealtime(row.userId, row);
  }

  // 3. Email nếu có (fire-and-forget, giữ nguyên như cũ)
  if (opts.email) {
    sendEmail(opts.email, opts.title, opts.content).catch((err) => {
      console.error("[Notification] Email send error:", err.message);
    });
  }

  // 4. Bulk push — 1 SELECT tokens + 1 Expo batch call thay vì N lần send()
  if (opts.sendPush !== false) {
    void pushService.sendToMany(userIds, {
      title: opts.title,
      body: opts.content,
      data: {
        type: opts.category ?? "general",
        referenceId: opts.referenceId ?? null,
        referenceType: opts.referenceType ?? null,
        date: opts.referenceDate ?? null,
        ...(opts.deeplink
          ? { screen: opts.deeplink.screen, params: opts.deeplink.params ?? {} }
          : {}),
      },
    });
  }

  return saved;
}
