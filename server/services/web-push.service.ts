/**
 * WebPushService — gửi Web Push đến tất cả trình duyệt đã đăng ký của user.
 *
 * VAPID keys dùng chung giữa các center deployments nhưng subscription luôn
 * được lọc theo center_config.id + userId để tenant không bị lẫn dữ liệu.
 *
 * Mọi lỗi push đều được bắt và log; lỗi gửi push không làm hỏng nghiệp vụ chính.
 */

import webpush from "web-push";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { centerConfig, webPushSubscriptions } from "@shared/schema";

export interface WebPushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  url?: string;
}

type StoredSubscription = {
  id: string;
  userId: string;
  centerId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

class WebPushService {
  private configured = false;
  private configurationChecked = false;

  private configure(): boolean {
    if (this.configurationChecked) return this.configured;
    this.configurationChecked = true;

    const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    if (!publicKey || !privateKey) {
      console.warn("[WebPush] VAPID keys are not configured — browser push disabled.");
      return false;
    }

    try {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT?.trim() || "https://app.easyedu.vn",
        publicKey,
        privateKey,
      );
      this.configured = true;
      console.log("[WebPush] VAPID configured.");
      return true;
    } catch (error: any) {
      console.error("[WebPush] Invalid VAPID configuration:", error?.message || error);
      return false;
    }
  }

  isEnabled(): boolean {
    return this.configure();
  }

  getPublicKey(): string | null {
    return this.configure() ? process.env.VAPID_PUBLIC_KEY!.trim() : null;
  }

  private async getCenterId(): Promise<string | null> {
    const [center] = await db
      .select({ id: centerConfig.id })
      .from(centerConfig)
      .limit(1);
    return center?.id ?? null;
  }

  private async getSubscriptions(
    userIds: string[],
    centerId: string,
  ): Promise<StoredSubscription[]> {
    if (userIds.length === 0) return [];
    return db
      .select({
        id: webPushSubscriptions.id,
        userId: webPushSubscriptions.userId,
        centerId: webPushSubscriptions.centerId,
        endpoint: webPushSubscriptions.endpoint,
        p256dh: webPushSubscriptions.p256dh,
        auth: webPushSubscriptions.auth,
      })
      .from(webPushSubscriptions)
      .where(and(
        eq(webPushSubscriptions.centerId, centerId),
        inArray(webPushSubscriptions.userId, userIds),
      ));
  }

  private async removeSubscription(subscription: StoredSubscription): Promise<void> {
    await db
      .delete(webPushSubscriptions)
      .where(and(
        eq(webPushSubscriptions.id, subscription.id),
        eq(webPushSubscriptions.centerId, subscription.centerId),
      ));
  }

  private async sendToSubscriptions(
    subscriptions: StoredSubscription[],
    payload: WebPushPayload,
  ): Promise<void> {
    const serializedPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      ...(payload.url ? { url: payload.url } : {}),
    });

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            serializedPayload,
          );
        } catch (error: any) {
          const statusCode = error?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            try {
              await this.removeSubscription(subscription);
              console.log("[WebPush] Removed expired subscription", {
                userId: subscription.userId,
                statusCode,
              });
            } catch (removeError: any) {
              console.error("[WebPush] Failed to remove expired subscription:", removeError?.message || removeError);
            }
            return;
          }

          console.error("[WebPush] Send failed:", {
            userId: subscription.userId,
            statusCode,
            message: error?.message || String(error),
          });
        }
      }),
    );
  }

  async send(userId: string, payload: WebPushPayload): Promise<void> {
    await this.sendToMany([userId], payload);
  }

  async sendToMany(userIds: string[], payload: WebPushPayload): Promise<void> {
    try {
      if (!this.configure()) return;

      const centerId = await this.getCenterId();
      if (!centerId) {
        console.warn("[WebPush] No center_config row; skipping browser push.");
        return;
      }

      const subscriptions = await this.getSubscriptions([...new Set(userIds)], centerId);
      if (subscriptions.length === 0) return;

      await this.sendToSubscriptions(subscriptions, payload);
    } catch (error: any) {
      console.error("[WebPush] sendToMany error:", error?.message || error);
    }
  }

  async saveSubscription(params: {
    userId: string;
    centerId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }): Promise<void> {
    await db
      .insert(webPushSubscriptions)
      .values({
        userId: params.userId,
        centerId: params.centerId,
        endpoint: params.endpoint,
        p256dh: params.p256dh,
        auth: params.auth,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [webPushSubscriptions.centerId, webPushSubscriptions.endpoint],
        set: {
          userId: params.userId,
          p256dh: params.p256dh,
          auth: params.auth,
          updatedAt: new Date(),
        },
      });
  }

  async deleteSubscription(params: {
    userId: string;
    centerId: string;
    endpoint?: string;
  }): Promise<void> {
    const conditions = [
      eq(webPushSubscriptions.userId, params.userId),
      eq(webPushSubscriptions.centerId, params.centerId),
    ];
    if (params.endpoint) {
      conditions.push(eq(webPushSubscriptions.endpoint, params.endpoint));
    }

    await db.delete(webPushSubscriptions).where(and(...conditions));
  }
}

export const webPushService = new WebPushService();