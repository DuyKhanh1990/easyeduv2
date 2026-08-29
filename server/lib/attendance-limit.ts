/**
 * attendance-limit.ts
 * Shared logic for enforcing the "giới hạn điểm danh" time-window setting.
 * Used by both the web API (classes.routes.ts) and the mobile API (mobile.routes.ts).
 */

import { db } from "../db";
import { classSessions, shiftTemplates, systemSettings, staffAssignments } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface AttendanceLimitConfig {
  beforeDays: number;
  beforeHours: number;
  beforeMinutes: number;
  afterDays: number;
  afterHours: number;
  afterMinutes: number;
  /** Empty array = applies to ALL roles. Non-empty = only these role IDs are restricted. */
  roleIds: string[];
}

/** Read and parse the attendanceLimit config from system_settings. Returns null if not set. */
export async function getAttendanceLimitConfig(): Promise<AttendanceLimitConfig | null> {
  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, "attendanceLimit"))
    .limit(1);
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as AttendanceLimitConfig;
  } catch {
    return null;
  }
}

/**
 * Fetch all role IDs assigned to a staff member across all locations.
 * Used by mobile routes where req.roleIds is not populated by the web middleware.
 */
export async function getStaffRoleIds(staffId: string): Promise<string[]> {
  const rows = await db
    .select({ roleId: staffAssignments.roleId })
    .from(staffAssignments)
    .where(eq(staffAssignments.staffId, staffId));
  return rows.map((r) => r.roleId).filter((id): id is string => !!id);
}

/**
 * Enforce the attendance time-window for a given class session.
 *
 * @param classSessionId  The class_session UUID to check timing against.
 * @param userRoleIds     The role IDs of the requesting user.
 * @param isSuperAdmin    SuperAdmins bypass the check entirely.
 *
 * Throws an Error (with .status = 403) when the current time is outside the allowed window.
 * Returns silently when: no config, window is zero, or user's role is not restricted.
 */
export async function enforceAttendanceTimeLimit(
  classSessionId: string,
  userRoleIds: string[],
  isSuperAdmin = false
): Promise<void> {
  if (isSuperAdmin) return;

  const config = await getAttendanceLimitConfig();
  if (!config) return;

  // Check role applicability: empty roleIds = all roles; non-empty = only listed roles
  const configRoleIds = config.roleIds ?? [];
  if (configRoleIds.length > 0 && !userRoleIds.some((r) => configRoleIds.includes(r))) return;

  const beforeSec =
    (config.beforeDays ?? 0) * 86400 +
    (config.beforeHours ?? 0) * 3600 +
    (config.beforeMinutes ?? 0) * 60;
  const afterSec =
    (config.afterDays ?? 0) * 86400 +
    (config.afterHours ?? 0) * 3600 +
    (config.afterMinutes ?? 0) * 60;
  if (beforeSec === 0 && afterSec === 0) return;

  const [sessionRow] = await db
    .select({
      sessionDate: classSessions.sessionDate,
      startTime: shiftTemplates.startTime,
    })
    .from(classSessions)
    .leftJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
    .where(eq(classSessions.id, classSessionId))
    .limit(1);

  if (!sessionRow?.sessionDate || !sessionRow?.startTime) return;

  const sessionStart = new Date(`${sessionRow.sessionDate}T${sessionRow.startTime}:00`);
  const earliest = new Date(sessionStart.getTime() - beforeSec * 1000);
  const latest = new Date(sessionStart.getTime() + afterSec * 1000);
  const now = new Date();

  if (now < earliest || now > latest) {
    const fmt = (d: Date) =>
      d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    const err: any = new Error(
      `Vượt quá thời gian điểm danh. Chỉ được phép điểm danh từ ${fmt(earliest)} đến ${fmt(latest)}.`
    );
    err.status = 403;
    throw err;
  }
}
