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

export const QR_ATTENDANCE_DISPLAY_MINUTES = 15;

export interface AttendanceTimingWindow {
  sessionDate: string;
  startTime: string;
  endTime: string;
  sessionStart: Date;
  sessionEnd: Date;
  displayFrom: Date;
  attendanceOpenAt: Date;
  attendanceLatestAt: Date;
  isVisible: boolean;
  canAttend: boolean;
}

function secondsToMinutes(seconds: number): number {
  return Math.floor(seconds / 60);
}

function getSessionDateTime(sessionDate: string, time: string): Date {
  const [year, month, day] = sessionDate.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  // Schedules are stored as Bangkok wall-clock times while the Node process
  // runs in UTC. Keep attendance windows aligned with the center's displayed
  // schedule instead of interpreting 08:00 as 08:00 UTC.
  return new Date(Date.UTC(year, month - 1, day, hour - 7, minute, 0));
}

/**
 * Computes the QR display and attendance windows using the same role-scoped
 * attendance-limit setting enforced by attendance mutations.
 *
 * The QR has a separate minimum 15-minute display window so teachers can see
 * an upcoming class even when they cannot check in yet.
 */
export async function getAttendanceTimingWindow(
  classSessionId: string,
  userRoleIds: string[],
  isSuperAdmin = false,
  now = new Date(),
): Promise<AttendanceTimingWindow | null> {
  const [sessionRow] = await db
    .select({
      sessionDate: classSessions.sessionDate,
      startTime: shiftTemplates.startTime,
      endTime: shiftTemplates.endTime,
    })
    .from(classSessions)
    .leftJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
    .where(eq(classSessions.id, classSessionId))
    .limit(1);

  if (!sessionRow?.sessionDate || !sessionRow.startTime || !sessionRow.endTime) return null;

  const sessionStart = getSessionDateTime(sessionRow.sessionDate, sessionRow.startTime);
  const sessionEnd = getSessionDateTime(sessionRow.sessionDate, sessionRow.endTime);
  const config = await getAttendanceLimitConfig();
  const configRoleIds = config?.roleIds ?? [];
  const roleIsRestricted =
    !isSuperAdmin &&
    !!config &&
    (configRoleIds.length === 0 || userRoleIds.some((roleId) => configRoleIds.includes(roleId)));

  const beforeSec = roleIsRestricted
    ? (config?.beforeDays ?? 0) * 86400 + (config?.beforeHours ?? 0) * 3600 + (config?.beforeMinutes ?? 0) * 60
    : 0;
  const afterSec = roleIsRestricted
    ? (config?.afterDays ?? 0) * 86400 + (config?.afterHours ?? 0) * 3600 + (config?.afterMinutes ?? 0) * 60
    : 0;

  // A staff member without an early-attendance allowance can still see the
  // class in the default QR preview window, but the button opens at start.
  const attendanceOpenAt = beforeSec > 0 ? new Date(sessionStart.getTime() - beforeSec * 1000) : sessionStart;
  // Keep this aligned with enforceAttendanceTimeLimit for restricted roles.
  // With no restriction, the scheduled class interval remains the safe QR window.
  const attendanceLatestAt = roleIsRestricted
    ? (afterSec > 0 ? new Date(sessionStart.getTime() + afterSec * 1000) : sessionStart)
    : sessionEnd;
  const displayMinutes = Math.max(
    QR_ATTENDANCE_DISPLAY_MINUTES,
    secondsToMinutes(beforeSec),
  );
  const displayFrom = new Date(sessionStart.getTime() - displayMinutes * 60_000);

  return {
    sessionDate: sessionRow.sessionDate,
    startTime: sessionRow.startTime,
    endTime: sessionRow.endTime,
    sessionStart,
    sessionEnd,
    displayFrom,
    attendanceOpenAt,
    attendanceLatestAt,
    isVisible: now >= displayFrom && now <= attendanceLatestAt,
    canAttend: now >= attendanceOpenAt && now <= attendanceLatestAt,
  };
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
      endTime: shiftTemplates.endTime,
    })
    .from(classSessions)
    .leftJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
    .where(eq(classSessions.id, classSessionId))
    .limit(1);

  if (!sessionRow?.sessionDate || !sessionRow?.startTime || !sessionRow?.endTime) return;

  const sessionStart = getSessionDateTime(sessionRow.sessionDate, sessionRow.startTime);
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
