import { db } from "../../../storage/base";
import { notificationTemplates } from "@shared/schema";
import { eq } from "drizzle-orm";
import { channelResolver } from "./ChannelResolver";
import { notificationRepository } from "../../../infrastructure/notification/repositories/NotificationRepository";
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

    // Lookup OA recipient state; all outbound automation stays on the OA channel.
    const studentChannel = await notificationRepository.getStudentChannel(
      dto.studentId,
      dto.centerId
    );

    const channel = await channelResolver.resolve({
      zaloUserId: studentChannel?.zaloUserId ?? null,
      isFollowed: studentChannel?.isFollowed ?? false,
      hasInteracted: studentChannel?.hasInteracted ?? false,
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
    }
  }
}

export const notificationService = new NotificationService();
