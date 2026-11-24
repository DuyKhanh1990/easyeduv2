import { db } from "../db";
import {
  classSessions, classSessionTeacherAssignments, classes, shiftTemplates, staff, classrooms,
  teacherAvailability, teacherAvailabilityWindows,
} from "@shared/schema";
import { and, inArray, ne, eq, gte, lte, or, isNull } from "drizzle-orm";

export type ConflictType = "room" | "teacher" | "availability";

export interface ConflictItem {
  type: ConflictType;
  sessionDate: string;
  shiftName: string;
  shiftTime: string;
  resourceName: string;
  conflictClassName: string;
  conflictClassCode: string;
  reason?: string;
}

export interface SessionInput {
  sessionDate: string;
  shiftTemplateId: string | null | undefined;
  locationId?: string | null;
  roomId?: string | null;
  teacherIds?: string[] | null;
  teacherTimeAssignments?: Array<{
    teacherId: string;
    startTime: string;
    endTime: string;
  }>;
}

const NULL_ROOM = "00000000-0000-0000-0000-000000000000";

function toMin(t: string | null | undefined): number {
  if (!t) return -1;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function overlaps(s1: string | null, e1: string | null, s2: string | null, e2: string | null): boolean {
  const a = toMin(s1), b = toMin(e1), c = toMin(s2), d = toMin(e2);
  if (a < 0 || b < 0 || c < 0 || d < 0) return false;
  return a < d && b > c;
}

export interface TeacherAvailabilityEntry {
  weekday: number;
  startTime: string;
  endTime: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export function shouldWarnUnavailableTeacher(
  sessionDate: string,
  weekday: number,
  assignedStartTime: string,
  assignedEndTime: string,
  registrations: TeacherAvailabilityEntry[],
): boolean {
  const active = registrations.filter((registration) =>
    (!registration.effectiveFrom || sessionDate >= registration.effectiveFrom) &&
    (!registration.effectiveTo || sessionDate <= registration.effectiveTo),
  );
  if (active.length === 0) return false;

  const assignedStart = toMin(assignedStartTime);
  const assignedEnd = toMin(assignedEndTime);
  return !active.some((registration) =>
    registration.weekday === weekday &&
    toMin(registration.startTime) <= assignedStart &&
    toMin(registration.endTime) >= assignedEnd,
  );
}

export async function checkScheduleConflicts(
  sessions: SessionInput[],
  excludeClassId?: string | null,
): Promise<ConflictItem[]> {
  const valid = sessions.filter(s => s.shiftTemplateId);
  if (!valid.length) return [];

  const dates = [...new Set(valid.map(s => s.sessionDate))];
  const roomIds = [...new Set(valid.map(s => s.roomId).filter((r): r is string => !!r && r !== NULL_ROOM))];
  const teacherIds = [...new Set(valid.flatMap(s => [
    ...(s.teacherIds || []),
    ...(s.teacherTimeAssignments || []).map((assignment) => assignment.teacherId),
  ]))];

  if (!roomIds.length && !teacherIds.length) return [];

  // Fetch our shift time info
  const ourShiftIds = [...new Set(valid.map(s => s.shiftTemplateId!))];
  const ourShifts = await db
    .select({ id: shiftTemplates.id, name: shiftTemplates.name, startTime: shiftTemplates.startTime, endTime: shiftTemplates.endTime })
    .from(shiftTemplates)
    .where(inArray(shiftTemplates.id, ourShiftIds));
  const ourShiftMap = new Map(ourShifts.map(s => [s.id, s]));

  const sortedDates = [...dates].sort();
  const minDate = sortedDates[0];
  const maxDate = sortedDates[sortedDates.length - 1];

  let classLocationId: string | null = null;
  if (excludeClassId) {
    const [classRow] = await db
      .select({ locationId: classes.locationId })
      .from(classes)
      .where(eq(classes.id, excludeClassId))
      .limit(1);
    classLocationId = classRow?.locationId ?? null;
  }
  const sessionsWithLocation = valid.map((session) => ({
    ...session,
    locationId: session.locationId ?? classLocationId,
  }));
  const locationIds = [...new Set(sessionsWithLocation.map((session) => session.locationId).filter((id): id is string => !!id))];

  const teacherNameMap = new Map<string, string>();
  if (teacherIds.length) {
    const tRows = await db.select({ id: staff.id, fullName: staff.fullName }).from(staff).where(inArray(staff.id, teacherIds));
    tRows.forEach(t => teacherNameMap.set(t.id, t.fullName ?? t.id));
  }

  const availabilityByTeacherLocation = new Map<string, Array<{
    weekday: number;
    startTime: string;
    endTime: string;
    effectiveFrom: string | null;
    effectiveTo: string | null;
  }>>();
  if (teacherIds.length && locationIds.length) {
    const dateRange = and(
      or(isNull(teacherAvailability.effectiveFrom), lte(teacherAvailability.effectiveFrom, maxDate)),
      or(isNull(teacherAvailability.effectiveTo), gte(teacherAvailability.effectiveTo, minDate)),
    );
    const [legacyRows, windowRows] = await Promise.all([
      db
        .select({
          teacherId: teacherAvailability.teacherId,
          locationId: teacherAvailability.locationId,
          weekday: teacherAvailability.weekday,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
          effectiveFrom: teacherAvailability.effectiveFrom,
          effectiveTo: teacherAvailability.effectiveTo,
        })
        .from(teacherAvailability)
        .leftJoin(shiftTemplates, eq(teacherAvailability.shiftTemplateId, shiftTemplates.id))
        .where(and(
          inArray(teacherAvailability.teacherId, teacherIds),
          inArray(teacherAvailability.locationId, locationIds),
          dateRange,
        )),
      db
        .select({
          teacherId: teacherAvailabilityWindows.teacherId,
          locationId: teacherAvailabilityWindows.locationId,
          weekday: teacherAvailabilityWindows.weekday,
          startTime: teacherAvailabilityWindows.startTime,
          endTime: teacherAvailabilityWindows.endTime,
          effectiveFrom: teacherAvailabilityWindows.effectiveFrom,
          effectiveTo: teacherAvailabilityWindows.effectiveTo,
        })
        .from(teacherAvailabilityWindows)
        .where(and(
          inArray(teacherAvailabilityWindows.teacherId, teacherIds),
          inArray(teacherAvailabilityWindows.locationId, locationIds),
          or(isNull(teacherAvailabilityWindows.effectiveFrom), lte(teacherAvailabilityWindows.effectiveFrom, maxDate)),
          or(isNull(teacherAvailabilityWindows.effectiveTo), gte(teacherAvailabilityWindows.effectiveTo, minDate)),
        )),
    ]);
    for (const row of [...legacyRows, ...windowRows]) {
      if (!row.startTime || !row.endTime) continue;
      const key = `${row.teacherId}:${row.locationId}`;
      const current = availabilityByTeacherLocation.get(key) ?? [];
      current.push({
        weekday: Number(row.weekday),
        startTime: String(row.startTime),
        endTime: String(row.endTime),
        effectiveFrom: row.effectiveFrom ? String(row.effectiveFrom).slice(0, 10) : null,
        effectiveTo: row.effectiveTo ? String(row.effectiveTo).slice(0, 10) : null,
      });
      availabilityByTeacherLocation.set(key, current);
    }
  }

  const conflicts: ConflictItem[] = [];
  const seen = new Set<string>();
  for (const our of sessionsWithLocation) {
    const shift = ourShiftMap.get(our.shiftTemplateId!);
    if (!shift || !our.locationId) continue;
    const assignedIntervals = our.teacherTimeAssignments?.length
      ? our.teacherTimeAssignments
      : (our.teacherIds || []).map((teacherId) => ({
          teacherId,
          startTime: String(shift.startTime ?? ""),
          endTime: String(shift.endTime ?? ""),
        }));
    const sessionWeekday = new Date(`${our.sessionDate}T00:00:00.000Z`).getUTCDay();
    for (const assignment of assignedIntervals) {
      const registrationKey = `${assignment.teacherId}:${our.locationId}`;
      const registrations = availabilityByTeacherLocation.get(registrationKey) ?? [];
      if (!shouldWarnUnavailableTeacher(
        our.sessionDate,
        sessionWeekday,
        assignment.startTime,
        assignment.endTime,
        registrations,
      )) continue;

      const key = `availability|${our.sessionDate}|${assignment.teacherId}|${our.shiftTemplateId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      conflicts.push({
        type: "availability",
        sessionDate: our.sessionDate,
        shiftName: shift.name ?? "",
        shiftTime: `${assignment.startTime.slice(0, 5)} - ${assignment.endTime.slice(0, 5)}`,
        resourceName: teacherNameMap.get(assignment.teacherId) ?? assignment.teacherId,
        conflictClassName: "Không nằm trọn trong khoảng giờ rảnh đã đăng ký",
        conflictClassCode: "",
        reason: "Giáo viên không có thời gian khả dụng",
      });
    }
  }

  // Use date range to fetch other sessions (simpler than ANY array)
  const conds: any[] = [
    gte(classSessions.sessionDate, minDate),
    lte(classSessions.sessionDate, maxDate),
  ];
  if (excludeClassId) conds.push(ne(classSessions.classId, excludeClassId));

  const otherSessions = await db
    .select({
      id: classSessions.id,
      classId: classSessions.classId,
      sessionDate: classSessions.sessionDate,
      roomId: classSessions.roomId,
      teacherIds: classSessions.teacherIds,
      shiftStart: shiftTemplates.startTime,
      shiftEnd: shiftTemplates.endTime,
    })
    .from(classSessions)
    .leftJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
    .where(and(...conds));

  // Filter to only sessions on our exact dates
  const relevantOther = otherSessions.filter(s => dates.includes(s.sessionDate));
  if (!relevantOther.length) return conflicts;

  const otherSessionIds = relevantOther.map((session) => session.id);
  const existingTeacherAssignments = await db
    .select({
      classSessionId: classSessionTeacherAssignments.classSessionId,
      teacherId: classSessionTeacherAssignments.teacherId,
      startTime: classSessionTeacherAssignments.startTime,
      endTime: classSessionTeacherAssignments.endTime,
    })
    .from(classSessionTeacherAssignments)
    .where(inArray(classSessionTeacherAssignments.classSessionId, otherSessionIds));
  const assignmentMap = new Map<string, { startTime: string; endTime: string }>();
  for (const assignment of existingTeacherAssignments) {
    assignmentMap.set(`${assignment.classSessionId}:${assignment.teacherId}`, {
      startTime: String(assignment.startTime),
      endTime: String(assignment.endTime),
    });
  }

  // Enrich with class info
  const otherClassIds = [...new Set(relevantOther.map(s => s.classId).filter(Boolean) as string[])];
  const classRows = otherClassIds.length
    ? await db.select({ id: classes.id, name: classes.name, classCode: classes.classCode }).from(classes).where(inArray(classes.id, otherClassIds))
    : [];
  const classMap = new Map(classRows.map(c => [c.id, c]));

  // Room names
  const roomNameMap = new Map<string, string>();
  if (roomIds.length) {
    const roomRows = await db.select({ id: classrooms.id, name: classrooms.name }).from(classrooms).where(inArray(classrooms.id, roomIds));
    roomRows.forEach(r => roomNameMap.set(r.id, r.name));
  }

  for (const our of valid) {
    const shift = ourShiftMap.get(our.shiftTemplateId!);
    if (!shift) continue;
    const shiftTime = `${(shift.startTime ?? "").slice(0, 5)} - ${(shift.endTime ?? "").slice(0, 5)}`;

    for (const other of relevantOther) {
      if (other.sessionDate !== our.sessionDate) continue;
      const baseShiftsOverlap = overlaps(shift.startTime, shift.endTime, other.shiftStart, other.shiftEnd);
      if (!baseShiftsOverlap) continue;

      const cls = classMap.get(other.classId ?? "");
      const conflictClassName = cls?.name ?? "Lớp khác";
      const conflictClassCode = cls?.classCode ?? "";

      // Room conflict
      if (our.roomId && our.roomId !== NULL_ROOM && other.roomId === our.roomId) {
        const key = `room|${our.sessionDate}|${our.roomId}|${other.classId}`;
        if (!seen.has(key)) {
          seen.add(key);
          conflicts.push({
            type: "room",
            sessionDate: our.sessionDate,
            shiftName: shift.name ?? "",
            shiftTime,
            resourceName: roomNameMap.get(our.roomId) ?? our.roomId,
            conflictClassName,
            conflictClassCode,
          });
        }
      }

      // Teacher conflicts use assigned sub-intervals when present. Legacy
      // sessions without rows continue to occupy their complete shift.
      const ourAssignments = our.teacherTimeAssignments?.length
        ? our.teacherTimeAssignments
        : (our.teacherIds || []).map((teacherId) => ({
            teacherId,
            startTime: String(shift.startTime ?? ""),
            endTime: String(shift.endTime ?? ""),
          }));
      for (const assignment of ourAssignments) {
        const tid = assignment.teacherId;
        if (!(other.teacherIds || []).includes(tid)) continue;
        const otherAssignment = assignmentMap.get(`${other.id}:${tid}`);
        const otherStart = otherAssignment?.startTime ?? String(other.shiftStart ?? "");
        const otherEnd = otherAssignment?.endTime ?? String(other.shiftEnd ?? "");
        if (!overlaps(assignment.startTime, assignment.endTime, otherStart, otherEnd)) continue;

          const key = `teacher|${our.sessionDate}|${tid}|${other.classId}`;
          if (!seen.has(key)) {
            seen.add(key);
            conflicts.push({
              type: "teacher",
              sessionDate: our.sessionDate,
              shiftName: shift.name ?? "",
              shiftTime: `${assignment.startTime.slice(0, 5)} - ${assignment.endTime.slice(0, 5)}`,
              resourceName: teacherNameMap.get(tid) ?? tid,
              conflictClassName,
              conflictClassCode,
            });
          }
      }
    }
  }

  return conflicts;
}
