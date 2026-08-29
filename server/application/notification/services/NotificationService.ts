import { db } from "../../../storage/base";
import { notificationTemplates, centerNotificationSettings, centerConfig } from "@shared/schema";
import { eq } from "drizzle-orm";
import { channelResolver } from "./ChannelResolver";
import { notificationRepository } from "../../../infrastructure/notification/repositories/NotificationRepository";
import { znsChannel } from "../../../infrastructure/notification/channels/ZNSChannel";
import { oaChannel } from "../../../infrastructure/notification/channels/OAChannel";
import { NotificationChannel } from "../../../domain/notification/types/NotificationChannel";
import type { SendNotificationDto } from "../dto/SendNotificationDto";

export class NotificationService {
  async send(dto: SendNotificationDto): Promise<void> {
    const template = await db
      .select()
      .from(notificationTemplates)
      .where(eq(notificationTemplates.code, dto.type))
      .limit(1)
      .then((r) => r[0] ?? null);

    const [center] = await db.select().from(centerConfig).limit(1);
    const settings = center
      ? await db
          .select()
          .from(centerNotificationSettings)
          .where(eq(centerNotificationSettings.centerId, center.id))
          .limit(1)
          .then((r) => r[0] ?? null)
      : null;

    // Lookup kênh Zalo của học viên để routing channel
    const studentChannel = await notificationRepository.getStudentChannel(
      dto.studentId,
      dto.centerId
    );

    const channel = await channelResolver.resolve({
      zaloUserId: studentChannel?.zaloUserId ?? null,
      isFollowed: studentChannel?.isFollowed ?? false,
      hasInteracted: studentChannel?.hasInteracted ?? false,
      channelPriority: settings?.channelPriority ?? "AUTO",
    });

    console.log("[NotificationService] send", {
      type: dto.type,
      studentId: dto.studentId,
      centerId: dto.centerId,
      channel,
      zaloUserId: studentChannel?.zaloUserId ?? null,
      isFollowed: studentChannel?.isFollowed ?? false,
      variables: template?.variables ?? [],
    });

    const logId = await notificationRepository.createLog({
      centerId: dto.centerId,
      studentId: dto.studentId,
      type: dto.type,
      channel,
      status: "PENDING",
      payload: dto.data,
    });

    if (channel === NotificationChannel.OA) {
      try {
        await oaChannel.send({
          logId,
          studentId: dto.studentId,
          centerId: dto.centerId,
          type: dto.type,
          data: dto.data,
        });
      } catch (err: any) {
        console.error("[NotificationService] OA send failed", {
          logId,
          error: err.message,
        });
      }
    } else if (channel === NotificationChannel.ZNS) {
      try {
        await znsChannel.send({
          logId,
          studentId: dto.studentId,
          centerId: dto.centerId,
          type: dto.type,
          data: dto.data,
        });
      } catch (err: any) {
        console.error("[NotificationService] ZNS send failed", {
          logId,
          error: err.message,
        });
      }
    }
  }
}

export const notificationService = new NotificationService();
