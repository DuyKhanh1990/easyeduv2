import { and, desc, eq, ilike, sql } from "./base";
import { db } from "../db";
import { activityLogs, staff, users } from "@shared/schema";
import { createActivityLog } from "./activity-log.storage";

export type CrmConfigAuditAction = "created" | "updated" | "deleted";

export async function createCrmConfigAuditLog(data: {
  userId: string | null;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  action: CrmConfigAuditAction;
  oldContent?: unknown;
  newContent?: unknown;
}) {
  return createActivityLog({
    userId: data.userId,
    locationId: null,
    classId: null,
    action: `crm_config.${data.entityType}.${data.action}`,
    oldContent: data.oldContent == null ? null : JSON.stringify(data.oldContent),
    newContent: data.newContent == null ? null : JSON.stringify(data.newContent),
  });
}

export async function getCrmConfigAuditLogs(filters?: {
  dateFrom?: string;
  dateTo?: string;
  entityType?: string;
  action?: CrmConfigAuditAction;
  limit?: number;
  offset?: number;
}) {
  const conditions = [ilike(activityLogs.action, "crm_config.%")];
  if (filters?.dateFrom) conditions.push(sql`DATE(${activityLogs.createdAt}) >= ${filters.dateFrom}` as any);
  if (filters?.dateTo) conditions.push(sql`DATE(${activityLogs.createdAt}) <= ${filters.dateTo}` as any);
  if (filters?.entityType) conditions.push(ilike(activityLogs.action, `crm_config.${filters.entityType}.%`));
  if (filters?.action) {
    conditions.push(
      filters.entityType
        ? eq(activityLogs.action, `crm_config.${filters.entityType}.${filters.action}`)
        : ilike(activityLogs.action, `crm_config.%.${filters.action}`),
    );
  }

  const where = and(...conditions);
  const [rows, countRows] = await Promise.all([
    dbSelect(where, filters?.limit ?? 100, filters?.offset ?? 0),
    dbCount(where),
  ]);

  return { events: rows, total: Number(countRows ?? 0) };
}

async function dbSelect(where: any, limit: number, offset: number) {
  const rows = await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      oldContent: activityLogs.oldContent,
      newContent: activityLogs.newContent,
      createdAt: activityLogs.createdAt,
      userName: staff.fullName,
      username: users.username,
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .leftJoin(staff, eq(staff.userId, activityLogs.userId))
    .where(where)
    .orderBy(desc(activityLogs.createdAt))
    .limit(Math.min(Math.max(limit, 1), 500))
    .offset(Math.max(offset, 0));

  return rows.map(row => {
    const match = row.action.match(/^crm_config\.([^.]+)\.(created|updated|deleted)$/);
    return {
      id: row.id,
      entityType: match?.[1] ?? "unknown",
      action: match?.[2] ?? "updated",
      oldContent: row.oldContent,
      newContent: row.newContent,
      createdAt: row.createdAt,
      userName: row.userName ?? row.username ?? null,
    };
  });
}

async function dbCount(where: any) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(activityLogs)
    .where(where);
  return count;
}