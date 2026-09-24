import { and, desc, eq, gte, isNull, lte, or, inArray, sql } from "drizzle-orm";
import { db } from "./base";
import { courseAuditLogs, locations, staff, users } from "@shared/schema";
import type { InsertCourseAuditLog } from "@shared/schema";

export async function createCourseAuditLog(data: InsertCourseAuditLog) {
  const [row] = await db.insert(courseAuditLogs).values(data).returning();
  return row;
}

export interface CourseAuditLogWithDetails {
  id: string;
  scope: string;
  entityType: string;
  entityId: string | null;
  entityCode: string | null;
  entityName: string | null;
  action: string;
  userId: string | null;
  locationId: string | null;
  oldContent: unknown;
  newContent: unknown;
  createdAt: Date;
  userName: string | null;
  locationName: string | null;
}

export async function getCourseAuditLogs(filters: {
  dateFrom?: Date;
  dateTo?: Date;
  scope?: string;
  action?: string;
  allowedLocationIds?: string[];
  isSuperAdmin?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<{ events: CourseAuditLogWithDetails[]; total: number }> {
  const conditions = [];
  if (filters.dateFrom) conditions.push(gte(courseAuditLogs.createdAt, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(courseAuditLogs.createdAt, filters.dateTo));
  if (filters.scope) conditions.push(eq(courseAuditLogs.scope, filters.scope));
  if (filters.action) conditions.push(eq(courseAuditLogs.action, filters.action));
  if (!filters.isSuperAdmin && filters.allowedLocationIds?.length === 0) {
    return { events: [], total: 0 };
  }
  if (!filters.isSuperAdmin && filters.allowedLocationIds && filters.allowedLocationIds.length > 0) {
    conditions.push(or(
      isNull(courseAuditLogs.locationId),
      inArray(courseAuditLogs.locationId, filters.allowedLocationIds),
    ));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db
    .select({
      id: courseAuditLogs.id,
      scope: courseAuditLogs.scope,
      entityType: courseAuditLogs.entityType,
      entityId: courseAuditLogs.entityId,
      entityCode: courseAuditLogs.entityCode,
      entityName: courseAuditLogs.entityName,
      action: courseAuditLogs.action,
      userId: courseAuditLogs.userId,
      locationId: courseAuditLogs.locationId,
      oldContent: courseAuditLogs.oldContent,
      newContent: courseAuditLogs.newContent,
      createdAt: courseAuditLogs.createdAt,
      staffName: staff.fullName,
      username: users.username,
      locationName: locations.name,
    })
    .from(courseAuditLogs)
    .leftJoin(users, eq(courseAuditLogs.userId, users.id))
    .leftJoin(staff, eq(staff.userId, courseAuditLogs.userId))
    .leftJoin(locations, eq(courseAuditLogs.locationId, locations.id))
    .where(where)
    .orderBy(desc(courseAuditLogs.createdAt))
    .limit(filters.limit ?? 100)
    .offset(filters.offset ?? 0);

  const countQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(courseAuditLogs)
    .$dynamic();
  const countedRows = await countQuery.where(where);
  const total = Number(countedRows[0]?.count ?? 0);

  return {
    events: rows.map(row => ({
      ...row,
      userName: row.staffName ?? row.username ?? null,
      locationName: row.locationName ?? null,
    })),
    total,
  };
}