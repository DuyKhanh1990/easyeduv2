/**
 * PushService — gửi Expo Push Notification đến tất cả thiết bị active của user.
 *
 * Nguyên tắc:
 * - Gửi tất cả thiết bị (không chỉ máy mới nhất).
 * - Token invalid → soft delete (isActive = false), không xoá record.
 * - Mọi lỗi đều được bắt và log, không bao giờ throw ra ngoài.
 */

import { db } from "../db";
import { pushTokens } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import {
  sendExpoPushNotifications,
  extractInvalidTokens,
  type ExpoPushMessage,
} from "../lib/expo-push";

export interface PushPayload {
  title: string;
  body: string;
  /**
   * Deeplink data.
   * - Dạng mới (ưu tiên): { screen, params } — mobile đọc thẳng, không cần đoán.
   * - Dạng cũ (fallback): { type, referenceId, referenceType, date } — mobile tự suy luận màn hình.
   */
  data?: {
    type?: string;
    referenceId?: string | null;
    referenceType?: string | null;
    screen?: string;
    params?: Record<string, string>;
    [key: string]: unknown;
  };
}

class PushService {
  /**
   * Gửi push đến tất cả thiết bị active của một user.
   * Fire-and-forget — caller không cần await.
   */
  async send(userId: string, payload: PushPayload): Promise<void> {
    try {
      const tokenRows = await db
        .select({ pushToken: pushTokens.pushToken })
        .from(pushTokens)
        .where(and(eq(pushTokens.userId, userId), eq(pushTokens.isActive, true)));

      if (tokenRows.length === 0) return;

      const messages: ExpoPushMessage[] = tokenRows.map((r) => ({
        to: r.pushToken,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        sound: "default",
        priority: "high",
        channelId: "default", // Android 8+: phải khớp với kênh app đã tạo sẵn, không có → noti bị drop
      }));

      // Retry 1 lần với lỗi network/tạm thời (HTTP 5xx, timeout).
      // Không retry lỗi token invalid (DeviceNotRegistered) — những đó xử lý bằng soft delete.
      let tickets = await sendExpoPushNotifications(messages);
      const allFailed = tickets.every((t) => t.status === "error");
      if (allFailed && messages.length > 0) {
        console.warn(`[PushService] Retry lần 1 cho user ${userId}...`);
        await new Promise((r) => setTimeout(r, 2000));
        tickets = await sendExpoPushNotifications(messages);
      }

      // Token bị Expo thu hồi → soft delete
      const invalidTokens = extractInvalidTokens(messages, tickets);
      if (invalidTokens.length > 0) {
        await Promise.all(
          invalidTokens.map((token) =>
            db
              .update(pushTokens)
              .set({ isActive: false, updatedAt: new Date() })
              .where(eq(pushTokens.pushToken, token)),
          ),
        );
        console.log(
          `[PushService] Deactivated ${invalidTokens.length} invalid token(s) for user ${userId}`,
        );
      }

      // Log kết quả để debug vận hành
      const failed = tickets.filter((t) => t.status === "error");
      if (failed.length > 0) {
        console.error("[PushService] Gửi thất bại sau retry:", {
          userId,
          tokens: messages.map((m) => m.to),
          errors: failed.map((t) => ({ message: t.message, detail: t.details?.error })),
        });
      }
    } catch (err: any) {
      // Không bao giờ throw — push lỗi không được ảnh hưởng transaction chính
      console.error("[PushService] send error:", { userId, error: err.message });
    }
  }

  /**
   * Gửi push đến nhiều users cùng lúc.
   * 1 SELECT batch token + 1 Expo batch call thay vì N lần send().
   * Fire-and-forget — caller không cần await.
   */
  async sendToMany(userIds: string[], payload: PushPayload): Promise<void> {
    try {
      if (userIds.length === 0) return;

      // 1 query lấy toàn bộ token của tất cả users
      const tokenRows = await db
        .select({ pushToken: pushTokens.pushToken, userId: pushTokens.userId })
        .from(pushTokens)
        .where(and(inArray(pushTokens.userId, userIds), eq(pushTokens.isActive, true)));

      if (tokenRows.length === 0) return;

      const messages: ExpoPushMessage[] = tokenRows.map((r) => ({
        to: r.pushToken,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        sound: "default",
        priority: "high",
        channelId: "default",
      }));

      // Gửi 1 batch Expo call
      let tickets = await sendExpoPushNotifications(messages);
      const allFailed = tickets.every((t) => t.status === "error");
      if (allFailed && messages.length > 0) {
        console.warn(`[PushService] sendToMany: Retry lần 1 (${userIds.length} users)...`);
        await new Promise((r) => setTimeout(r, 2000));
        tickets = await sendExpoPushNotifications(messages);
      }

      // Soft delete token invalid
      const invalidTokens = extractInvalidTokens(messages, tickets);
      if (invalidTokens.length > 0) {
        await Promise.all(
          invalidTokens.map((token) =>
            db
              .update(pushTokens)
              .set({ isActive: false, updatedAt: new Date() })
              .where(eq(pushTokens.pushToken, token)),
          ),
        );
        console.log(`[PushService] sendToMany: Deactivated ${invalidTokens.length} invalid token(s)`);
      }

      const failed = tickets.filter((t) => t.status === "error");
      if (failed.length > 0) {
        console.error("[PushService] sendToMany: Gửi thất bại sau retry:", {
          users: userIds.length,
          errors: failed.map((t) => ({ message: t.message, detail: t.details?.error })),
        });
      }
    } catch (err: any) {
      console.error("[PushService] sendToMany error:", err.message);
    }
  }

  /** Soft delete một token cụ thể (dùng khi logout trên 1 thiết bị). */
  async deactivateToken(pushToken: string): Promise<void> {
    await db
      .update(pushTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(pushTokens.pushToken, pushToken));
  }

  /**
   * Soft delete token cụ thể, chỉ khi token đó thuộc userId đang logout.
   * Tránh user A vô tình/cố ý deactivate token của user B.
   */
  async deactivateTokenForUser(pushToken: string, userId: string): Promise<void> {
    await db
      .update(pushTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(pushTokens.pushToken, pushToken), eq(pushTokens.userId, userId)));
  }

  /** Soft delete toàn bộ token của một user (dùng khi logout trên tất cả thiết bị). */
  async deactivateAllForUser(userId: string): Promise<void> {
    await db
      .update(pushTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(pushTokens.userId, userId));
  }
}

export const pushService = new PushService();
