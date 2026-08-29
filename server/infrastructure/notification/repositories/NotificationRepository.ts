import { db } from "../../../storage/base";
import {
  centerNotificationSettings,
  studentNotificationChannels,
  notificationLogs,
  centerConfig,
  students,
} from "@shared/schema";
import { eq, and, desc, count } from "drizzle-orm";
import type { NotificationChannel } from "../../../domain/notification/types/NotificationChannel";

export interface CreateLogDto {
  centerId: string;
  studentId: string;
  type: string;
  channel: NotificationChannel;
  status: "PENDING" | "SENT" | "FAILED";
  payload: Record<string, unknown>;
}

export interface GetLogsFilter {
  page?: number;
  limit?: number;
  type?: string;
  status?: string;
}

export class NotificationRepository {
  async getCenterSettings(centerId: string) {
    return db
      .select()
      .from(centerNotificationSettings)
      .where(eq(centerNotificationSettings.centerId, centerId))
      .limit(1)
      .then((r) => r[0] ?? null);
  }

  async upsertCenterSettings(
    centerId: string,
    values: Partial<typeof centerNotificationSettings.$inferInsert>
  ) {
    const existing = await this.getCenterSettings(centerId);
    if (existing) {
      await db
        .update(centerNotificationSettings)
        .set(values)
        .where(eq(centerNotificationSettings.centerId, centerId));
    } else {
      await db
        .insert(centerNotificationSettings)
        .values({ centerId, ...values });
    }
  }

  async getStudentChannel(studentId: string, centerId: string) {
    return db
      .select()
      .from(studentNotificationChannels)
      .where(
        and(
          eq(studentNotificationChannels.studentId, studentId),
          eq(studentNotificationChannels.centerId, centerId)
        )
      )
      .limit(1)
      .then((r) => r[0] ?? null);
  }

  async getCenterId(): Promise<string | null> {
    const [center] = await db.select().from(centerConfig).limit(1);
    return center?.id ?? null;
  }

  async createLog(dto: CreateLogDto): Promise<string> {
    const [row] = await db
      .insert(notificationLogs)
      .values({
        centerId: dto.centerId,
        studentId: dto.studentId,
        type: dto.type,
        channel: dto.channel,
        status: dto.status,
        payload: dto.payload,
      })
      .returning({ id: notificationLogs.id });
    return row.id;
  }

  async updateLogStatus(
    id: string,
    status: "SENT" | "FAILED" | "SKIPPED",
    options?: { reason?: string; errorMessage?: string }
  ): Promise<void> {
    await db
      .update(notificationLogs)
      .set({
        status,
        ...(options?.errorMessage !== undefined ? { errorMessage: options.errorMessage } : {}),
        ...(options?.reason !== undefined ? { reason: options.reason } : {}),
      })
      .where(eq(notificationLogs.id, id));
  }

  async getLogs(filter: GetLogsFilter = {}) {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
    const offset = (page - 1) * limit;

    const rows = await db
      .select({
        id: notificationLogs.id,
        centerId: notificationLogs.centerId,
        studentId: notificationLogs.studentId,
        type: notificationLogs.type,
        channel: notificationLogs.channel,
        status: notificationLogs.status,
        payload: notificationLogs.payload,
        errorMessage: notificationLogs.errorMessage,
        reason: notificationLogs.reason,
        createdAt: notificationLogs.createdAt,
        studentName: students.fullName,
        studentCode: students.code,
      })
      .from(notificationLogs)
      .leftJoin(students, eq(students.id, notificationLogs.studentId))
      .where(
        and(
          filter.type ? eq(notificationLogs.type, filter.type) : undefined,
          filter.status ? eq(notificationLogs.status, filter.status) : undefined
        )
      )
      .orderBy(desc(notificationLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: count() })
      .from(notificationLogs)
      .where(
        and(
          filter.type ? eq(notificationLogs.type, filter.type) : undefined,
          filter.status ? eq(notificationLogs.status, filter.status) : undefined
        )
      );

    return { rows, total, page, limit };
  }
}

export const notificationRepository = new NotificationRepository();
