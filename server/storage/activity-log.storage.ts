import { db, eq, desc, and, inArray, isNull, isNotNull, ilike, or, sql } from "./base";
import { activityLogs, staff, locations, users, classes, roles, departments } from "@shared/schema";
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
  onlyClassLogs?: boolean;
  scope?: "education-config" | "settings";
  limit?: number;
  offset?: number;
}): Promise<ActivityLogWithDetails[]> {
  const where = filters?.classId
    ? eq(activityLogs.classId, filters.classId)
    : filters?.scope === "education-config"
      ? ilike(activityLogs.action, "education_config.%")
      : filters?.scope === "settings"
        ? ilike(activityLogs.action, "settings.%")
    : filters?.onlyClassLogs
      ? isNotNull(activityLogs.classId)
      : undefined;

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
    .where(where)
    .orderBy(desc(activityLogs.createdAt))
    .limit(filters?.limit ?? 100)
    .offset(filters?.offset ?? 0);

  const attendanceRoleIds = Array.from(new Set(rows
    .filter(r => r.action.includes("attendance_limit") || r.action.includes("attendance_fee"))
    .flatMap(r => [r.oldContent, r.newContent])
    .flatMap(raw => {
      try {
        const parsed = raw ? JSON.parse(raw) : {};
        return Array.isArray(parsed.roleIds) ? parsed.roleIds : [];
      } catch {
        return [];
      }
    })));
  const attendanceRoles = attendanceRoleIds.length
    ? await db.select({ id: roles.id, name: roles.name }).from(roles).where(inArray(roles.id, attendanceRoleIds))
    : [];
  const permissionRoleIds = Array.from(new Set(rows
    .filter(r => r.action === "settings.permission.updated")
    .flatMap(r => [r.oldContent, r.newContent])
    .flatMap(raw => {
      try {
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed.roleId ? [parsed.roleId] : [];
      } catch {
        return [];
      }
    })));
  const permissionRoles = permissionRoleIds.length
    ? await db.select({
        id: roles.id,
        name: roles.name,
        departmentName: departments.name,
      }).from(roles).leftJoin(departments, eq(roles.departmentId, departments.id))
        .where(inArray(roles.id, permissionRoleIds))
    : [];
  const enrichPermissionContent = (action: string, raw: string | null) => {
    if (action !== "settings.permission.updated" || !raw) return raw;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.roleId || (parsed.roleName && parsed.departmentName)) return raw;
      const role = permissionRoles.find(item => item.id === parsed.roleId);
      return JSON.stringify({
        ...parsed,
        roleName: parsed.roleName ?? role?.name ?? null,
        departmentName: parsed.departmentName ?? role?.departmentName ?? null,
      });
    } catch {
      return raw;
    }
  };
  const enrichAttendanceContent = (action: string, raw: string | null) => {
    if (!raw || (!action.includes("attendance_limit") && !action.includes("attendance_fee"))) return raw;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.roleIds)) return raw;
      return JSON.stringify({
        ...parsed,
        roleNames: parsed.roleIds.map((id: string) => attendanceRoles.find(role => role.id === id)?.name).filter(Boolean),
      });
    } catch {
      return raw;
    }
  };

  const scoreSheetPreviousContent = (index: number, row: typeof rows[number]) => {
    if (!row.action.includes("score_sheet") || !row.oldContent) return row.oldContent;
    try {
      const oldValue = JSON.parse(row.oldContent);
      if (Array.isArray(oldValue.items) && oldValue.items.length > 0) return row.oldContent;
      const name = oldValue.name;
      const previous = rows.slice(index + 1).find(candidate => {
        if (!candidate.action.includes("score_sheet") || !candidate.newContent) return false;
        try {
          const value = JSON.parse(candidate.newContent);
          return value.name === name && Array.isArray(value.items) && value.items.length > 0;
        } catch {
          return false;
        }
      });
      return previous?.newContent ?? row.oldContent;
    } catch {
      return row.oldContent;
    }
  };

  return rows.map((r, index) => ({
    id: r.id,
    userId: r.userId,
    locationId: r.locationId,
    classId: r.classId,
    action: r.action,
    oldContent: enrichPermissionContent(r.action, enrichAttendanceContent(r.action, scoreSheetPreviousContent(index, r))),
    newContent: enrichPermissionContent(r.action, enrichAttendanceContent(r.action, r.newContent)),
    createdAt: r.createdAt,
    userName: r.staffName ?? r.username ?? null,
    locationName: r.locationName ?? null,
    className: r.className ?? null,
    classCode: r.classCode ?? null,
  }));
}

export interface StaffHistoryEvent {
  id: string;
  action: string;
  staffId: string | null;
  staffCode: string | null;
  staffName: string | null;
  userName: string | null;
  locationName: string | null;
  locationId: string | null;
  oldContent: string | null;
  newContent: string | null;
  createdAt: Date;
}

export async function getStaffHistory(filters?: {
  dateFrom?: string | null;
  dateTo?: string | null;
  locationId?: string | null;
  allowedLocationIds?: string[];
  isSuperAdmin?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ events: StaffHistoryEvent[]; total: number }> {
  const actions = ["staff.created", "staff.updated", "staff.deleted"];
  const conditions = [inArray(activityLogs.action, actions)];
  if (filters?.dateFrom) conditions.push(sql`DATE(${activityLogs.createdAt}) >= ${filters.dateFrom}` as any);
  if (filters?.dateTo) conditions.push(sql`DATE(${activityLogs.createdAt}) <= ${filters.dateTo}` as any);
  if (filters?.locationId) conditions.push(eq(activityLogs.locationId, filters.locationId));
  if (!filters?.isSuperAdmin && filters?.allowedLocationIds?.length) {
    conditions.push(or(isNull(activityLogs.locationId), inArray(activityLogs.locationId, filters.allowedLocationIds)) as any);
  } else if (!filters?.isSuperAdmin && filters?.allowedLocationIds) {
    return { events: [], total: 0 };
  }

  const where = and(...conditions);
  const rows = await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      locationId: activityLogs.locationId,
      oldContent: activityLogs.oldContent,
      newContent: activityLogs.newContent,
      createdAt: activityLogs.createdAt,
      userName: staff.fullName,
      username: users.username,
      locationName: locations.name,
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .leftJoin(staff, eq(staff.userId, activityLogs.userId))
    .leftJoin(locations, eq(activityLogs.locationId, locations.id))
    .where(where)
    .orderBy(desc(activityLogs.createdAt))
    .limit(filters?.limit ?? 100)
    .offset(filters?.offset ?? 0);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(activityLogs)
    .where(where);

  return {
    events: rows.map(row => {
      const snapshot = row.newContent || row.oldContent;
      let parsed: any = {};
      try { parsed = snapshot ? JSON.parse(snapshot) : {}; } catch { /* keep empty */ }
      return {
        id: row.id,
        action: row.action,
        staffId: parsed.staffId ?? null,
        staffCode: parsed.code ?? null,
        staffName: parsed.fullName ?? null,
        userName: row.userName ?? row.username ?? null,
        locationName: row.locationName ?? null,
        locationId: row.locationId,
        oldContent: row.oldContent,
        newContent: row.newContent,
        createdAt: row.createdAt,
      };
    }),
    total: Number(count ?? 0),
  };
}
