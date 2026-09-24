import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "./base";
import { assessmentAuditLogs, locations, staff, users } from "@shared/schema";
import type { AssessmentAuditLog, InsertAssessmentAuditLog } from "@shared/schema";
import { centerDateRangeConditions } from "../lib/center-date-range";

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
  dateFrom?: string;
  dateTo?: string;
  timeZone?: string;
  scope?: string;
  action?: string;
  allowedLocationIds?: string[];
  isSuperAdmin?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<{ events: AssessmentAuditLogWithDetails[]; total: number }> {
  const conditions = [];
  conditions.push(...centerDateRangeConditions(
    assessmentAuditLogs.createdAt,
    filters.dateFrom,
    filters.dateTo,
    filters.timeZone,
  ));
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
    .orderBy(desc(assessmentAuditLogs.createdAt), desc(assessmentAuditLogs.id))
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