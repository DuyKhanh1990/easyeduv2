import { db } from "../../../storage/base";
import { students, centerNotificationTemplates, zaloOaConfigs } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { decrypt } from "../../../lib/encryption";
import type { INotificationChannel, ChannelPayload } from "./INotificationChannel";
import { notificationRepository } from "../repositories/NotificationRepository";

const ZNS_API_URL = "https://business.openapi.zalo.me/message/template";

export class ZNSChannel implements INotificationChannel {
  async send(payload: ChannelPayload): Promise<void> {
    const { logId, studentId, centerId, type, data } = payload;

    try {
      const centerTemplate = await this.resolveCenterTemplate(centerId, type);
      if (!centerTemplate?.znsTemplateId) {
        console.warn(
          `[ZNSChannel] Bỏ qua: chưa cấu hình zns_template_id cho loại "${type}" tại center "${centerId}"`
        );
        await notificationRepository.updateLogStatus(logId, "SKIPPED", {
          reason: "missing_template",
          errorMessage: `Chưa cấu hình zns_template_id cho loại "${type}"`,
        });
        return;
      }

      const phone = await this.resolvePhone(studentId);
      if (!phone) {
        console.warn(`[ZNSChannel] Bỏ qua: học viên ${studentId} không có số điện thoại`);
        await notificationRepository.updateLogStatus(logId, "SKIPPED", {
          reason: "missing_phone",
          errorMessage: `Học viên ${studentId} không có số điện thoại`,
        });
        return;
      }

      const accessToken = await this.resolveAccessToken(centerTemplate.locationId ?? null);
      if (!accessToken) {
        console.warn(`[ZNSChannel] Bỏ qua: không có Zalo OA nào đang kết nối`);
        await notificationRepository.updateLogStatus(logId, "SKIPPED", {
          reason: "zns_disabled",
          errorMessage: "Không có Zalo OA nào đang kết nối để gửi ZNS",
        });
        return;
      }

      const normalizedPhone = this.normalizePhone(phone);

      const body = {
        phone: normalizedPhone,
        template_id: centerTemplate.znsTemplateId,
        template_data: data,
        tracking_id: logId,
      };

      console.log("[ZNSChannel] Gửi ZNS", {
        logId,
        phone: normalizedPhone,
        templateId: centerTemplate.znsTemplateId,
        type,
        centerId,
      });

      const res = await fetch(ZNS_API_URL, {
        method: "POST",
        headers: {
          "access_token": accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const result = await res.json() as any;

      if (result.error !== 0) {
        throw new Error(
          `Zalo ZNS API lỗi ${result.error}: ${result.message ?? JSON.stringify(result)}`
        );
      }

      console.log("[ZNSChannel] Gửi thành công", { logId, msgId: result.data?.msg_id });
      await notificationRepository.updateLogStatus(logId, "SENT");
    } catch (err: any) {
      const errorMessage: string =
        err.response?.data
          ? JSON.stringify(err.response.data)
          : (err.message ?? "Unknown error");
      console.error("[ZNSChannel] Gửi thất bại", { logId, type, centerId, error: errorMessage });
      await notificationRepository.updateLogStatus(logId, "FAILED", {
        reason: "zalo_api_error",
        errorMessage,
      });
      throw err;
    }
  }

  private async resolveCenterTemplate(centerId: string, type: string) {
    const [row] = await db
      .select({
        znsTemplateId: centerNotificationTemplates.znsTemplateId,
        locationId: centerNotificationTemplates.locationId,
        isEnabled: centerNotificationTemplates.isEnabled,
      })
      .from(centerNotificationTemplates)
      .where(
        and(
          eq(centerNotificationTemplates.centerId, centerId),
          eq(centerNotificationTemplates.templateCode, type)
        )
      )
      .limit(1);

    if (!row || !row.isEnabled) return null;
    return row;
  }

  private async resolvePhone(studentId: string): Promise<string | null> {
    const [student] = await db
      .select({ phone: students.phone, parentPhone: students.parentPhone })
      .from(students)
      .where(eq(students.id, studentId))
      .limit(1);

    if (!student) return null;
    return student.phone || student.parentPhone || null;
  }

  private async resolveAccessToken(locationId: string | null): Promise<string | null> {
    const conditions = locationId
      ? and(eq(zaloOaConfigs.locationId, locationId), eq(zaloOaConfigs.isConnected, true))
      : eq(zaloOaConfigs.isConnected, true);

    const [config] = await db
      .select({ accessTokenEncrypted: zaloOaConfigs.accessTokenEncrypted })
      .from(zaloOaConfigs)
      .where(conditions)
      .limit(1);

    if (!config?.accessTokenEncrypted) return null;

    try {
      return decrypt(config.accessTokenEncrypted);
    } catch {
      return null;
    }
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    if (digits.startsWith("0")) {
      return "84" + digits.slice(1);
    }
    if (digits.startsWith("84")) {
      return digits;
    }
    return digits;
  }
}

export const znsChannel = new ZNSChannel();
