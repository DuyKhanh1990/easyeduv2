import { db, eq, desc } from "./base";
import { activityLogs, staff, locations, users, classes } from "@shared/schema";
import type { InsertActivityLog, ActivityLog } from "@shared/schema";

export async function createActivityLog(data: InsertActivityLog): Promise<ActivityLog> {
  const [row] = await db.insert(activityLogs).values(data).returning();
  return row;
}

export interface ActivityLogWithDetails extends ActivityLog {
  userName: string | null;
  locationName: string | null;
  className: string | null;
  classCode: string | null;
}

export async function getActivityLogs(filters?: {
  classId?: string;
  limit?: number;
  offset?: number;
}): Promise<ActivityLogWithDetails[]> {
  const rows = await db
    .select({
      id: activityLogs.id,
      userId: activityLogs.userId,
      locationId: activityLogs.locationId,
      classId: activityLogs.classId,
      action: activityLogs.action,
      oldContent: activityLogs.oldContent,
      newContent: activityLogs.newContent,
      createdAt: activityLogs.createdAt,
      staffName: staff.fullName,
      locationName: locations.name,
      username: users.username,
      className: classes.name,
      classCode: classes.classCode,
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .leftJoin(staff, eq(staff.userId, activityLogs.userId))
    .leftJoin(locations, eq(activityLogs.locationId, locations.id))
    .leftJoin(classes, eq(activityLogs.classId, classes.id))
    .where(filters?.classId ? eq(activityLogs.classId, filters.classId) : undefined)
    .orderBy(desc(activityLogs.createdAt))
    .limit(filters?.limit ?? 100)
    .offset(filters?.offset ?? 0);

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    locationId: r.locationId,
    classId: r.classId,
    action: r.action,
    oldContent: r.oldContent,
    newContent: r.newContent,
    createdAt: r.createdAt,
    userName: r.staffName ?? r.username ?? null,
    locationName: r.locationName ?? null,
    className: r.className ?? null,
    classCode: r.classCode ?? null,
  }));
}
