import { db } from "../db";
import { classSessions, classes, shiftTemplates, staff, classrooms } from "@shared/schema";
import { and, inArray, ne, eq, gte, lte, sql } from "drizzle-orm";

export type ConflictType = "room" | "teacher";

export interface ConflictItem {
  type: ConflictType;
  sessionDate: string;
  shiftName: string;
  shiftTime: string;
  resourceName: string;
  conflictClassName: string;
  conflictClassCode: string;
}

export interface SessionInput {
  sessionDate: string;
  shiftTemplateId: string | null | undefined;
  roomId?: string | null;
  teacherIds?: string[] | null;
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

export async function checkScheduleConflicts(
  sessions: SessionInput[],
  excludeClassId?: string | null,
): Promise<ConflictItem[]> {
  const valid = sessions.filter(s => s.shiftTemplateId);
  if (!valid.length) return [];

  const dates = [...new Set(valid.map(s => s.sessionDate))];
  const roomIds = [...new Set(valid.map(s => s.roomId).filter((r): r is string => !!r && r !== NULL_ROOM))];
  const teacherIds = [...new Set(valid.flatMap(s => s.teacherIds || []))];

  if (!roomIds.length && !teacherIds.length) return [];

  // Fetch our shift time info
  const ourShiftIds = [...new Set(valid.map(s => s.shiftTemplateId!))];
  const ourShifts = await db
    .select({ id: shiftTemplates.id, name: shiftTemplates.name, startTime: shiftTemplates.startTime, endTime: shiftTemplates.endTime })
    .from(shiftTemplates)
    .where(inArray(shiftTemplates.id, ourShiftIds));
  const ourShiftMap = new Map(ourShifts.map(s => [s.id, s]));

  // Use date range to fetch other sessions (simpler than ANY array)
  const sortedDates = [...dates].sort();
  const minDate = sortedDates[0];
  const maxDate = sortedDates[sortedDates.length - 1];

  const conds: any[] = [
    gte(classSessions.sessionDate, minDate),
    lte(classSessions.sessionDate, maxDate),
  ];
  if (excludeClassId) conds.push(ne(classSessions.classId, excludeClassId));

  const otherSessions = await db
    .select({
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
  if (!relevantOther.length) return [];

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

  // Teacher names
  const teacherNameMap = new Map<string, string>();
  if (teacherIds.length) {
    const tRows = await db.select({ id: staff.id, fullName: staff.fullName }).from(staff).where(inArray(staff.id, teacherIds));
    tRows.forEach(t => teacherNameMap.set(t.id, t.fullName ?? t.id));
  }

  const conflicts: ConflictItem[] = [];
  const seen = new Set<string>();

  for (const our of valid) {
    const shift = ourShiftMap.get(our.shiftTemplateId!);
    if (!shift) continue;
    const shiftTime = `${(shift.startTime ?? "").slice(0, 5)} - ${(shift.endTime ?? "").slice(0, 5)}`;

    for (const other of relevantOther) {
      if (other.sessionDate !== our.sessionDate) continue;
      if (!overlaps(shift.startTime, shift.endTime, other.shiftStart, other.shiftEnd)) continue;

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

      // Teacher conflict
      for (const tid of (our.teacherIds || [])) {
        if ((other.teacherIds || []).includes(tid)) {
          const key = `teacher|${our.sessionDate}|${tid}|${other.classId}`;
          if (!seen.has(key)) {
            seen.add(key);
            conflicts.push({
              type: "teacher",
              sessionDate: our.sessionDate,
              shiftName: shift.name ?? "",
              shiftTime,
              resourceName: teacherNameMap.get(tid) ?? tid,
              conflictClassName,
              conflictClassCode,
            });
          }
        }
      }
    }
  }

  return conflicts;
}
