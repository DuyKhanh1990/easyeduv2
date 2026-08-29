/**
 * InAppNotificationService — luồng thống nhất để tạo thông báo nội bộ.
 *
 * Luồng:
 *   InAppNotificationService.create(...)
 *     → INSERT notifications (lưu DB)
 *     → emitToUser via WebSocket (realtime)
 *     → void PushService.send(...)  ← fire-and-forget, không throw
 *
 * Quy tắc:
 * - Tất cả nghiệp vụ (điểm danh, lịch học, học phí, task...) chỉ gọi service này.
 * - Không gọi PushService trực tiếp ở từng nơi.
 * - Thêm nghiệp vụ mới → push được gửi tự động, không cần nhớ thêm gì.
 */

import { sendNotification, sendNotificationToMany, type NotificationDeeplink } from "../lib/notification";
import { pushService } from "./push.service";

/** Enum type chuẩn để Mobile deeplink đúng màn hình */
export type NotificationType =
  | "attendance"   // Điểm danh → màn hình lịch học / điểm danh
  | "schedule"     // Lịch học thay đổi / huỷ
  | "invoice"      // Học phí mới / đã thanh toán
  | "tuition_due"  // Nhắc học phí đến hạn
  | "task"         // Task / bài tập được giao
  | "news_feed"    // Bài viết mới trên bảng tin
  | "chat"         // Tin nhắn mới
  | "leave"        // Đơn nghỉ được duyệt
  | "general";     // Thông báo chung

export interface CreateNotificationOptions {
  userId: string;
  title: string;
  content: string;
  /** Dùng để deeplink — Mobile đọc type để mở đúng màn hình */
  type?: NotificationType;
  referenceId?: string;
  referenceType?: string;
  referenceDate?: string; // YYYY-MM-DD
  /** Đích điều hướng khai rõ ngay lúc tạo — xem NotificationDeeplink trong lib/notification.ts */
  deeplink?: NotificationDeeplink;
  /**
   * Có gửi Expo Push hay không. Mặc định: true.
   * Đặt false cho các notification nội bộ / log hệ thống không cần push.
   * Ví dụ: cập nhật trạng thái tự động, audit log, thông báo kỹ thuật.
   */
  sendPush?: boolean;
}

class InAppNotificationService {
  /**
   * Tạo thông báo cho một user.
   * Tự động gửi push fire-and-forget — caller không cần làm gì thêm.
   */
  async create(opts: CreateNotificationOptions) {
    // 1. Lưu DB + emit WebSocket
    const saved = await sendNotification({
      userId: opts.userId,
      title: opts.title,
      content: opts.content,
      category: opts.type ?? "general",
      referenceId: opts.referenceId,
      referenceType: opts.referenceType,
      referenceDate: opts.referenceDate,
      deeplink: opts.deeplink,
      sendPush: opts.sendPush,
    });

    return saved;
  }

  /**
   * Tạo thông báo cho nhiều user cùng lúc.
   * Dùng bulk INSERT + batch push — 1 DB roundtrip thay vì N.
   */
  async createForMany(
    userIds: string[],
    opts: Omit<CreateNotificationOptions, "userId">,
  ) {
    return sendNotificationToMany(userIds, {
      title: opts.title,
      content: opts.content,
      category: opts.type ?? "general",
      referenceId: opts.referenceId,
      referenceType: opts.referenceType,
      referenceDate: opts.referenceDate,
      deeplink: opts.deeplink,
      sendPush: opts.sendPush,
    });
  }
}

export const inAppNotificationService = new InAppNotificationService();
