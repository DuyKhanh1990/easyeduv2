import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "./base";
import { assessmentAuditLogs, locations, staff, users } from "@shared/schema";
import type { AssessmentAuditLog, InsertAssessmentAuditLog } from "@shared/schema";

export async function createAssessmentAuditLog(
  data: InsertAssessmentAuditLog,
): Promise<AssessmentAuditLog> {
  const [row] = await db.insert(assessmentAuditLogs).values(data).returning();
  return row;
}

export interface AssessmentAuditLogWithDetails extends AssessmentAuditLog {
  userName: string | null;
  locationName: string | null;
}

export async function getAssessmentAuditLogs(filters: {
  dateFrom?: Date;
  dateTo?: Date;
  scope?: string;
  action?: string;
  allowedLocationIds?: string[];
  isSuperAdmin?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<{ events: AssessmentAuditLogWithDetails[]; total: number }> {
  const conditions = [];
  if (filters.dateFrom) conditions.push(gte(assessmentAuditLogs.createdAt, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(assessmentAuditLogs.createdAt, filters.dateTo));
  if (filters.scope) conditions.push(eq(assessmentAuditLogs.scope, filters.scope));
  if (filters.action) conditions.push(eq(assessmentAuditLogs.action, filters.action));

  if (!filters.isSuperAdmin && filters.allowedLocationIds?.length === 0) {
    return { events: [], total: 0 };
  }
  if (!filters.isSuperAdmin && filters.allowedLocationIds && filters.allowedLocationIds.length > 0) {
    conditions.push(or(
      isNull(assessmentAuditLogs.locationId),
      inArray(assessmentAuditLogs.locationId, filters.allowedLocationIds),
    ));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db
    .select({
      id: assessmentAuditLogs.id,
      scope: assessmentAuditLogs.scope,
      entityType: assessmentAuditLogs.entityType,
      entityId: assessmentAuditLogs.entityId,
      entityCode: assessmentAuditLogs.entityCode,
      entityName: assessmentAuditLogs.entityName,
      action: assessmentAuditLogs.action,
      userId: assessmentAuditLogs.userId,
      locationId: assessmentAuditLogs.locationId,
      oldContent: assessmentAuditLogs.oldContent,
      newContent: assessmentAuditLogs.newContent,
      createdAt: assessmentAuditLogs.createdAt,
      staffName: staff.fullName,
      username: users.username,
      locationName: locations.name,
    })
    .from(assessmentAuditLogs)
    .leftJoin(users, eq(assessmentAuditLogs.userId, users.id))
    .leftJoin(staff, eq(staff.userId, assessmentAuditLogs.userId))
    .leftJoin(locations, eq(assessmentAuditLogs.locationId, locations.id))
    .where(where)
    .orderBy(desc(assessmentAuditLogs.createdAt))
    .limit(filters.limit ?? 100)
    .offset(filters.offset ?? 0);

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(assessmentAuditLogs)
    .where(where);

  return {
    total: Number(countRows[0]?.count ?? 0),
    events: rows.map(row => ({
      ...row,
      userName: row.staffName ?? row.username ?? null,
      locationName: row.locationName ?? null,
    })),
  };
}