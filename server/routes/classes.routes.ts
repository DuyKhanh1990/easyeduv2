import type { Express } from "express";
import { storage } from "../storage";
import { createActivityLog, getActivityLogs } from "../storage/activity-log.storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { db } from "../db";
import { classSessions, studentSessions, students, classes, studentClasses, staff, staffAssignments, studentLocations, classGradeBooks, classGradeBookScores, classGradeBookStudentComments, users, scoreSheets, scoreSheetItems, scoreCategories, locations, invoiceSessionAllocations, sessionContents, studentSessionContents, shiftTemplates, invoices } from "@shared/schema";
import { eq, and, sql, inArray, avg, between, gte, desc, asc } from "drizzle-orm";
import { sendAttendanceNotification, sendReviewNotification, sendContentNotification } from "../lib/attendance-notification";
import { sendNotificationToMany } from "../lib/notification";

async function resolveStaffFullName(userId: string | undefined | null): Promise<string | null> {
  if (!userId) return null;
  const [row] = await db.select({ fullName: staff.fullName }).from(staff).where(eq(staff.userId, userId)).limit(1);
  return row?.fullName ?? null;
}

const SCHEDULE_WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function formatScheduleDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}/${m}/${y.slice(2)}`;
}

async function resolveStaffUserIds(staffIds: string[]): Promise<string[]> {
  if (!staffIds.length) return [];
  const rows = await db.select({ userId: staff.userId }).from(staff).where(inArray(staff.id, staffIds));
  return rows.map(r => r.userId).filter(Boolean) as string[];
}

async function resolveEnrolledStudentUserIds(classId: string): Promise<string[]> {
  const scs = await db.select({ studentId: studentClasses.studentId }).from(studentClasses).where(eq(studentClasses.classId, classId));
  if (!scs.length) return [];
  const studentIds = scs.map(s => s.studentId);
  const rows = await db.select({ userId: students.userId }).from(students).where(inArray(students.id, studentIds));
  return rows.map(r => r.userId).filter(Boolean) as string[];
}

async function resolveStudentUserIdsInSessionRange(classId: string, fromIndex: number, toIndex: number): Promise<string[]> {
  const sessions = await db.select({ id: classSessions.id }).from(classSessions).where(and(
    eq(classSessions.classId, classId),
    between(classSessions.sessionIndex, fromIndex, toIndex),
  ));
  if (!sessions.length) return [];
  const sessionIds = sessions.map(s => s.id);
  const sRows = await db.selectDistinct({ studentId: studentSessions.studentId }).from(studentSessions).where(inArray(studentSessions.classSessionId, sessionIds));
  if (!sRows.length) return [];
  const studentIds = sRows.map(r => r.studentId).filter(Boolean) as string[];
  const uRows = await db.select({ userId: students.userId }).from(students).where(inArray(students.id, studentIds));
  return uRows.map(r => r.userId).filter(Boolean) as string[];
}

type CycleTeacherInfo = { name: string; code: string };
type CycleSessionInfo = { sessionIndex: number | null; weekday: number; sessionDate: string; startTime: string | null; teachers: CycleTeacherInfo[] };

async function fetchSessionsWithTeachers(classId: string, fromIndex: number, toIndex: number): Promise<CycleSessionInfo[]> {
  const rows = await db.select({
    sessionIndex: classSessions.sessionIndex,
    weekday: classSessions.weekday,
    sessionDate: classSessions.sessionDate,
    startTime: shiftTemplates.startTime,
    teacherIds: classSessions.teacherIds,
  }).from(classSessions)
    .leftJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
    .where(and(eq(classSessions.classId, classId), between(classSessions.sessionIndex, fromIndex, toIndex)))
    .orderBy(asc(classSessions.sessionIndex));

  const allIds = new Set<string>();
  for (const r of rows) { (r.teacherIds ?? []).forEach(id => allIds.add(id)); }
  const staffMap = new Map<string, CycleTeacherInfo>();
  if (allIds.size > 0) {
    const staffRows = await db.select({ id: staff.id, fullName: staff.fullName, code: staff.code })
      .from(staff).where(inArray(staff.id, [...allIds]));
    for (const s of staffRows) staffMap.set(s.id, { name: s.fullName ?? "", code: s.code ?? "" });
  }

  return rows.map(s => ({
    sessionIndex: s.sessionIndex,
    weekday: s.weekday,
    sessionDate: s.sessionDate,
    startTime: s.startTime ?? null,
    teachers: (s.teacherIds ?? []).map(id => staffMap.get(id)).filter(Boolean) as CycleTeacherInfo[],
  }));
}

async function sendGradeBookPublishedNotification(
  classId: string,
  _gradeBookId: string,
  title: string,
  creatorUserId: string | null,
  studentIds: string[]
): Promise<void> {
  const uniqueStudentIds = [...new Set(studentIds)].filter(Boolean);
  if (!uniqueStudentIds.length) return;

  const [classRow] = await db.select({ name: classes.name, classCode: classes.classCode })
    .from(classes).where(eq(classes.id, classId)).limit(1);
  const classLabel = classRow ? `${classRow.name}` : "";

  let teacherLabel = "Giáo viên";
  if (creatorUserId) {
    const [staffRow] = await db.select({ fullName: staff.fullName, code: staff.code })
      .from(staff).where(eq(staff.userId, creatorUserId)).limit(1);
    if (staffRow) teacherLabel = `Giáo viên: ${staffRow.fullName} (${staffRow.code})`;
  }

  const studentUserIds = await db.select({ userId: students.userId })
    .from(students).where(inArray(students.id, uniqueStudentIds));
  const recipientUserIds = studentUserIds.map(r => r.userId).filter(Boolean) as string[];
  if (!recipientUserIds.length) return;

  await sendNotificationToMany(recipientUserIds, {
    title: "Thông báo bảng điểm",
    content: `${teacherLabel} vừa gửi Bảng điểm: ${title}, Lớp ${classLabel}`,
    category: "schedule",
    referenceId: classId,
    referenceType: "class",
  });
}

async function sendTeacherAssignedNotification(
  cls: { id: string; name: string },
  scheduleConfig: any[],
  teachersConfig: any[]
): Promise<void> {
  if (!teachersConfig?.length) return;

  const weekdayLabels: Record<number, string> = { 0: "CN", 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7" };

  const weekdays: number[] = [...new Set(scheduleConfig.map((c: any) => Number(c.weekday)))].sort();
  const chuKy = weekdays.map(w => weekdayLabels[w] ?? `T${w}`).join(",");

  const allShiftTemplateIds = new Set<string>();
  for (const tc of teachersConfig) {
    if (tc.mode === "specific" && tc.shift_keys?.length) {
      for (const key of tc.shift_keys) {
        const [wdStr, idxStr] = key.split("_shift");
        const wd = Number(wdStr);
        const idx = Number(idxStr);
        const dayConfig = scheduleConfig.find((c: any) => Number(c.weekday) === wd);
        const shift = dayConfig?.shifts?.[idx];
        const tplId = shift?.shift_template_id || shift?.shiftTemplateId;
        if (tplId) allShiftTemplateIds.add(tplId);
      }
    }
  }

  const shiftTemplateMap = new Map<string, { name: string; startTime: string; endTime: string }>();
  if (allShiftTemplateIds.size > 0) {
    const rows = await db.select({ id: shiftTemplates.id, name: shiftTemplates.name, startTime: shiftTemplates.startTime, endTime: shiftTemplates.endTime })
      .from(shiftTemplates).where(inArray(shiftTemplates.id, [...allShiftTemplateIds]));
    rows.forEach(r => shiftTemplateMap.set(r.id, { name: r.name, startTime: r.startTime, endTime: r.endTime }));
  }

  const teacherIds = [...new Set(teachersConfig.map((tc: any) => tc.teacher_id).filter(Boolean))];
  if (!teacherIds.length) return;

  const staffRows = await db.select({ id: staff.id, userId: staff.userId }).from(staff).where(inArray(staff.id, teacherIds));
  const staffMap = new Map(staffRows.map(r => [r.id, r.userId]));

  for (const tc of teachersConfig) {
    if (!tc.teacher_id) continue;
    const userId = staffMap.get(tc.teacher_id);
    if (!userId) continue;

    let caDayLabel: string;
    if (tc.mode === "all") {
      caDayLabel = "Tất cả các buổi";
    } else {
      const parts: string[] = [];
      for (const key of (tc.shift_keys || [])) {
        const [wdStr, idxStr] = key.split("_shift");
        const wd = Number(wdStr);
        const idx = Number(idxStr);
        const dayConfig = scheduleConfig.find((c: any) => Number(c.weekday) === wd);
        const shift = dayConfig?.shifts?.[idx];
        const tplId = shift?.shift_template_id || shift?.shiftTemplateId;
        const tpl = tplId ? shiftTemplateMap.get(tplId) : undefined;
        const dayLabel = weekdayLabels[wd] ?? `T${wd}`;
        if (tpl) {
          parts.push(`${dayLabel} ${tpl.name} (${tpl.startTime} - ${tpl.endTime})`);
        } else {
          parts.push(`${dayLabel} ca ${idx + 1}`);
        }
      }
      caDayLabel = parts.join(", ") || "Tất cả các buổi";
    }

    await sendNotificationToMany([userId], {
      title: "Thông báo lịch dạy",
      content: `Bạn vừa được xếp lịch dạy lớp ${cls.name}, Chu kỳ: ${chuKy}, Ca dạy: ${caDayLabel}`,
      category: "schedule",
      referenceType: "class",
      referenceId: cls.id,
    });
  }
}

async function getAllowedLocationIds(req: any): Promise<string[] | null> {
  const user = req.user as any;
  if (!user) return [];
  if (user.username === "admin") return null;
  const [staffRecord] = await db.select({ id: staff.id }).from(staff).where(eq(staff.userId, user.id));
  if (!staffRecord) return [];
  const assignments = await db.select({ locationId: staffAssignments.locationId }).from(staffAssignments).where(eq(staffAssignments.staffId, staffRecord.id));
  return assignments.map(a => a.locationId);
}

// ─── Activity Log Helpers ────────────────────────────────────────────────────

const WD_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

async function getClassForLog(id: string): Promise<any | null> {
  const [cls] = await db
    .select({
      id: classes.id,
      name: classes.name,
      classCode: classes.classCode,
      locationId: classes.locationId,
      weekdays: classes.weekdays,
      teacherIds: classes.teacherIds,
      shiftTemplateIds: classes.shiftTemplateIds,
      startDate: classes.startDate,
      endDate: classes.endDate,
      status: classes.status,
      maxStudents: classes.maxStudents,
    })
    .from(classes)
    .where(eq(classes.id, id))
    .limit(1);

  if (!cls) return null;

  let locationName = "";
  if (cls.locationId) {
    const [loc] = await db.select({ name: locations.name }).from(locations).where(eq(locations.id, cls.locationId)).limit(1);
    locationName = loc?.name ?? "";
  }

  let teachers: { fullName: string; code: string }[] = [];
  if (cls.teacherIds && cls.teacherIds.length > 0) {
    teachers = await db.select({ fullName: staff.fullName, code: staff.code }).from(staff).where(inArray(staff.id, cls.teacherIds));
  }

  let shifts: { name: string; startTime: string | null; endTime: string | null }[] = [];
  if (cls.shiftTemplateIds && cls.shiftTemplateIds.length > 0) {
    shifts = await db.select({ name: shiftTemplates.name, startTime: shiftTemplates.startTime, endTime: shiftTemplates.endTime }).from(shiftTemplates).where(inArray(shiftTemplates.id, cls.shiftTemplateIds));
  }

  return { ...cls, locationName, teachers, shifts };
}

function fmtShifts(arr: { name: string; startTime?: string | null; endTime?: string | null }[]): string {
  return arr.map(s => `${s.name}${s.startTime && s.endTime ? ` (${s.startTime} - ${s.endTime})` : ""}`).join(", ");
}

function fmtTeachers(arr: { fullName: string; code?: string }[]): string {
  return arr.map(t => `${t.fullName}${t.code ? ` (${t.code})` : ""}`).join(", ");
}

function fmtWeekdays(wds: number[]): string {
  const sorted = [...wds].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
  return sorted.map(d => WD_LABELS[d]).join(", ");
}

function buildClassSummary(cls: any): string {
  const lines: string[] = [`Lớp ${cls.name} (${cls.classCode})`];
  if (cls.locationName) lines.push(`Cơ sở: ${cls.locationName}`);
  if (cls.weekdays && cls.weekdays.length > 0) lines.push(`Chu kỳ: ${fmtWeekdays(cls.weekdays)}`);
  if (cls.shifts && cls.shifts.length > 0) lines.push(`Ca học: ${fmtShifts(cls.shifts)}`);
  if (cls.teachers && cls.teachers.length > 0) lines.push(`Giáo viên: ${fmtTeachers(cls.teachers)}`);
  return lines.join("\n");
}

async function buildClassEditDiff(
  oldCls: any,
  body: any
): Promise<{ oldContent: string; newContent: string } | null> {
  const header = `Lớp ${oldCls.name} (${oldCls.classCode})`;
  const oldLines: string[] = [header];
  const newLines: string[] = [header];

  if (body.name !== undefined && body.name !== oldCls.name) {
    oldLines.push(`Tên lớp: ${oldCls.name}`);
    newLines.push(`Tên lớp: ${body.name}`);
  }
  if (body.classCode !== undefined && body.classCode !== oldCls.classCode) {
    oldLines.push(`Mã lớp: ${oldCls.classCode}`);
    newLines.push(`Mã lớp: ${body.classCode}`);
  }
  if (body.locationId !== undefined && body.locationId !== oldCls.locationId) {
    let newLocName = body.locationId;
    const [loc] = await db.select({ name: locations.name }).from(locations).where(eq(locations.id, body.locationId)).limit(1);
    newLocName = loc?.name ?? body.locationId;
    oldLines.push(`Cơ sở: ${oldCls.locationName}`);
    newLines.push(`Cơ sở: ${newLocName}`);
  }
  if (body.weekdays !== undefined) {
    const oldWd = [...(oldCls.weekdays || [])].sort().join(",");
    const newWd = [...(body.weekdays || [])].map(Number).sort().join(",");
    if (oldWd !== newWd) {
      oldLines.push(`Chu kỳ: ${fmtWeekdays(oldCls.weekdays || [])}`);
      newLines.push(`Chu kỳ: ${fmtWeekdays(body.weekdays.map(Number))}`);
    }
  }
  if (body.shiftTemplateIds !== undefined) {
    const oldIds = [...(oldCls.shiftTemplateIds || [])].sort().join(",");
    const newIds = [...(body.shiftTemplateIds || [])].sort().join(",");
    if (oldIds !== newIds) {
      let newShifts: any[] = [];
      if (body.shiftTemplateIds.length > 0) {
        newShifts = await db.select({ name: shiftTemplates.name, startTime: shiftTemplates.startTime, endTime: shiftTemplates.endTime }).from(shiftTemplates).where(inArray(shiftTemplates.id, body.shiftTemplateIds));
      }
      oldLines.push(`Ca học: ${fmtShifts(oldCls.shifts || [])}`);
      newLines.push(`Ca học: ${fmtShifts(newShifts)}`);
    }
  }
  if (body.teacherIds !== undefined) {
    const oldIds = [...(oldCls.teacherIds || [])].sort().join(",");
    const newIds = [...(body.teacherIds || [])].sort().join(",");
    if (oldIds !== newIds) {
      let newTeachers: any[] = [];
      if (body.teacherIds.length > 0) {
        newTeachers = await db.select({ fullName: staff.fullName, code: staff.code }).from(staff).where(inArray(staff.id, body.teacherIds));
      }
      oldLines.push(`Giáo viên: ${fmtTeachers(oldCls.teachers || [])}`);
      newLines.push(`Giáo viên: ${fmtTeachers(newTeachers)}`);
    }
  }
  if (body.startDate !== undefined && body.startDate !== oldCls.startDate) {
    oldLines.push(`Ngày bắt đầu: ${oldCls.startDate || "—"}`);
    newLines.push(`Ngày bắt đầu: ${body.startDate}`);
  }
  if (body.endDate !== undefined && body.endDate !== oldCls.endDate) {
    oldLines.push(`Ngày kết thúc: ${oldCls.endDate || "—"}`);
    newLines.push(`Ngày kết thúc: ${body.endDate}`);
  }
  if (body.status !== undefined && body.status !== oldCls.status) {
    oldLines.push(`Trạng thái: ${oldCls.status || "—"}`);
    newLines.push(`Trạng thái: ${body.status}`);
  }
  if (body.maxStudents !== undefined && body.maxStudents !== oldCls.maxStudents) {
    oldLines.push(`Sĩ số: ${oldCls.maxStudents ?? "—"}`);
    newLines.push(`Sĩ số: ${body.maxStudents}`);
  }

  if (oldLines.length === 1) return null; // Only header, nothing changed
  return { oldContent: oldLines.join("\n"), newContent: newLines.join("\n") };
}

async function getUserLocationId(req: any): Promise<string | null> {
  const user = req.user as any;
  if (!user) return null;
  const [staffRecord] = await db.select({ id: staff.id }).from(staff).where(eq(staff.userId, user.id)).limit(1);
  if (!staffRecord) return null;
  const [assignment] = await db.select({ locationId: staffAssignments.locationId }).from(staffAssignments).where(eq(staffAssignments.staffId, staffRecord.id)).limit(1);
  return assignment?.locationId ?? null;
}

async function getSessionInfoForLog(classSessionId: string): Promise<{ index: number | null; date: string; dayOfWeek: string; startTime: string; endTime: string } | null> {
  try {
    const [row] = await db
      .select({
        sessionIndex: classSessions.sessionIndex,
        sessionDate: classSessions.sessionDate,
        startTime: shiftTemplates.startTime,
        endTime: shiftTemplates.endTime,
      })
      .from(classSessions)
      .leftJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
      .where(eq(classSessions.id, classSessionId))
      .limit(1);
    if (!row) return null;
    const d = new Date(row.sessionDate);
    const day = d.getDay();
    const dayOfWeek = day === 0 ? "CN" : `T${day + 1}`;
    const dd = d.getDate();
    const mm = d.getMonth() + 1;
    const yyyy = d.getFullYear();
    return {
      index: row.sessionIndex,
      date: `${dd}/${mm}/${yyyy}`,
      dayOfWeek,
      startTime: (row.startTime ?? "").slice(0, 5),
      endTime: (row.endTime ?? "").slice(0, 5),
    };
  } catch {
    return null;
  }
}

function buildContentWithSession(
  items: { title: string; type: string }[],
  sessionInfo: { index: number | null; date: string; dayOfWeek: string; startTime: string; endTime: string } | null
): string {
  return JSON.stringify({ session: sessionInfo, items });
}

const deleteSessionsSchema = z.object({
  classId: z.string().uuid(),
  sessionId: z.string().uuid(),
  deleteType: z.enum(["single", "next", "all"]),
  mode: z.enum(["force", "skip_attended"])
});

export function registerClassesRoutes(app: Express): void {
  // Makeup
  app.post(api.classes.makeup.path, async (req, res) => {
    try {
      await storage.makeupClassStudents(req.params.id, req.body, (req.user as any).id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Check class code uniqueness
  app.get("/api/classes/check-code", async (req, res) => {
    const code = (req.query.code as string || "").trim();
    if (!code) return res.json({ exists: false });
    const [existing] = await db.select({ id: classes.id }).from(classes).where(eq(classes.classCode, code));
    res.json({ exists: !!existing });
  });

  // Classes - GET
  app.get(api.classes.list.path, async (req, res) => {
    const locationId = req.query.locationId as string | undefined;
    const minimal = req.query.minimal === "true";
    const view = req.query.view as string | undefined;
    const allowedLocationIds = await getAllowedLocationIds(req);
    if (minimal) {
      const results = await storage.getClassesMinimal(locationId, allowedLocationIds);
      return res.json(results);
    }
    if (view === "list") {
      const results = await storage.getClassesList(locationId, allowedLocationIds);
      return res.json(results);
    }
    const results = await storage.getClasses(locationId, allowedLocationIds);
    res.json(results);
  });

  // Classes ending soon - must be BEFORE /api/classes/:id to avoid route conflict
  app.get(api.classes.endingSoon.path, async (req, res) => {
    try {
      const {
        page = "1", pageSize = "20", search = "",
        classes: classesParam, maxRemaining, dateFrom = "", dateTo = "", statusFilter = "",
      } = req.query as Record<string, string | string[]>;

      const pageNum = Math.max(1, parseInt(String(page)));
      const pageSizeNum = Math.min(50, Math.max(20, parseInt(String(pageSize))));
      const offsetNum = (pageNum - 1) * pageSizeNum;
      const selectedClasses = classesParam
        ? (Array.isArray(classesParam) ? classesParam : [classesParam]) as string[]
        : [] as string[];

      const allowedLocationIds = req.allowedLocationIds;
      const isSuperAdmin = req.isSuperAdmin;

      if (!isSuperAdmin && allowedLocationIds && allowedLocationIds.length === 0) {
        return res.json({ data: [], total: 0, page: pageNum, pageSize: pageSizeNum, availableClasses: [] });
      }

      const today = new Date().toISOString().split("T")[0];

      let locationClause = sql`1=1`;
      if (!isSuperAdmin && allowedLocationIds && allowedLocationIds.length > 0) {
        locationClause = sql`c.location_id = ANY(${allowedLocationIds}::uuid[])`;
      }

      const searchStr = String(search);
      let searchCond = sql``;
      if (searchStr) {
        const like = `%${searchStr}%`;
        searchCond = sql`AND (b.class_code ILIKE ${like} OR b.class_name ILIKE ${like})`;
      }
      let classCond = sql``;
      if (selectedClasses.length > 0) {
        classCond = sql`AND b.class_code = ANY(ARRAY[${sql.join(selectedClasses.map((c) => sql`${c}`), sql`, `)}])`;
      }
      let maxRemainingCond = sql``;
      if (maxRemaining) {
        maxRemainingCond = sql`AND b.remaining_sessions <= ${parseInt(String(maxRemaining))}`;
      }
      let dateFromCond = sql``;
      if (dateFrom) dateFromCond = sql`AND b.end_date >= ${String(dateFrom)}::date`;
      let dateToCond = sql``;
      if (dateTo) dateToCond = sql`AND b.end_date <= ${String(dateTo)}::date`;
      let statusCond = sql``;
      if (statusFilter === "ending-soon") {
        statusCond = sql`AND b.end_date >= ${today}::date AND b.remaining_sessions < 5`;
      } else if (statusFilter === "active") {
        statusCond = sql`AND b.end_date >= ${today}::date AND b.remaining_sessions >= 5`;
      } else if (statusFilter === "ended") {
        statusCond = sql`AND b.end_date < ${today}::date`;
      }

      const result = await db.execute(sql`
        WITH base AS (
          SELECT
            c.id,
            c.class_code,
            c.name AS class_name,
            c.weekdays,
            c.teacher_ids,
            c.end_date,
            l.name AS location_name,
            (
              SELECT COUNT(*)::int FROM class_sessions cs
              WHERE cs.class_id = c.id AND cs.session_date >= ${today}::date AND cs.status != 'cancelled'
            ) AS remaining_sessions
          FROM classes c
          INNER JOIN locations l ON c.location_id = l.id
          WHERE c.status IN ('active', 'planning')
            AND c.end_date IS NOT NULL
            AND ${locationClause}
            AND (
              SELECT COUNT(*)::int FROM class_sessions cs
              WHERE cs.class_id = c.id AND cs.session_date >= ${today}::date AND cs.status != 'cancelled'
            ) <= 10
        )
        SELECT
          b.id,
          b.class_code AS "classCode",
          b.class_name AS "className",
          b.weekdays,
          b.teacher_ids AS "teacherIds",
          b.end_date AS "endDate",
          b.location_name AS "locationName",
          b.remaining_sessions AS "remainingSessions",
          CASE WHEN b.end_date < ${today}::date THEN 2 WHEN b.remaining_sessions < 5 THEN 0 ELSE 1 END AS status_priority,
          COUNT(*) OVER() AS total_count
        FROM base b
        WHERE 1=1
          ${searchCond}
          ${classCond}
          ${maxRemainingCond}
          ${dateFromCond}
          ${dateToCond}
          ${statusCond}
        ORDER BY status_priority ASC, b.remaining_sessions ASC, b.end_date ASC
        LIMIT ${pageSizeNum} OFFSET ${offsetNum}
      `);

      const classesResult = await db.execute(sql`
        SELECT DISTINCT c.class_code, c.name AS class_name
        FROM classes c
        WHERE c.status IN ('active', 'planning') AND c.end_date IS NOT NULL
          AND ${locationClause}
          AND (
            SELECT COUNT(*)::int FROM class_sessions cs
            WHERE cs.class_id = c.id AND cs.session_date >= ${today}::date AND cs.status != 'cancelled'
          ) <= 10
        ORDER BY c.class_code
      `);

      const allStaff = await db.select({ id: staff.id, fullName: staff.fullName }).from(staff);
      const staffMap = new Map(allStaff.map((s) => [s.id, s.fullName]));

      const rows = result.rows as any[];
      const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
      const data = rows.map(({ status_priority, total_count, ...rest }) => ({
        ...rest,
        teacherNames: Array.isArray(rest.teacherIds)
          ? rest.teacherIds.map((id: string) => staffMap.get(id) || "").filter(Boolean).join(", ")
          : "",
      }));
      const availableClasses = (classesResult.rows as any[]).map((r) => ({
        code: r.class_code,
        label: r.class_name || r.class_code,
      }));

      res.json({ data, total, page: pageNum, pageSize: pageSizeNum, availableClasses });
    } catch (err: any) {
      console.error("Classes ending soon error:", err);
      res.status(400).json({ message: err.message || "Lỗi khi tải dữ liệu" });
    }
  });

  // ── GET /api/classes/format-summary ────────────────────────────────────────
  // Trả về tổng số lớp học và phân bố theo hình thức (online/offline)
  // Query params: locationId (optional)
  app.get("/api/classes/format-summary", async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const isSuperAdmin = (req as any).isSuperAdmin ?? false;
      const allowedLocationIds = await getAllowedLocationIds(req);
      const locationId = typeof req.query.locationId === "string" ? req.query.locationId : undefined;

      const summary = await storage.getClassFormatSummary({ isSuperAdmin, allowedLocationIds, locationId });
      res.json(summary);
    } catch (err: any) {
      console.error("Class format summary error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải tổng số lớp học" });
    }
  });

  // ── GET /api/classes/status-summary ────────────────────────────────────────
  // Trả về số lượng lớp học theo từng trạng thái (planning, recruiting, active, closed)
  // Query params: locationId (optional)
  app.get("/api/classes/status-summary", async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const isSuperAdmin = (req as any).isSuperAdmin ?? false;
      const allowedLocationIds = await getAllowedLocationIds(req);
      const locationId = typeof req.query.locationId === "string" ? req.query.locationId : undefined;

      const summary = await storage.getClassStatusSummary({ isSuperAdmin, allowedLocationIds, locationId });
      res.json(summary);
    } catch (err: any) {
      console.error("Class status summary error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải trạng thái lớp học" });
    }
  });

  app.get(api.classes.get.path, async (req, res) => {
    const cls = await storage.getClass(req.params.id);
    if (!cls) return res.status(404).json({ message: "Not found" });
    res.json(cls);
  });

  app.get(api.classes.assignInfo.path, async (req, res) => {
    const info = await storage.getClassAssignInfo(req.params.id);
    if (!info) return res.status(404).json({ message: "Not found" });
    res.json(info);
  });

  app.get(api.classes.waitingStudents.path, async (req, res) => {
    const studentList = await storage.getClassStudents(req.params.id, "waiting");
    res.json(studentList);
  });

  app.get(api.classes.activeStudents.path, async (req, res) => {
    const studentList = await storage.getClassStudents(req.params.id, "active");
    res.json(studentList);
  });

  app.get(api.classes.availableStudents.path, async (req, res) => {
    const searchTerm = req.query.searchTerm as string;
    const studentList = await storage.getAvailableStudentsForClass(req.params.id, searchTerm);
    res.json(studentList);
  });

  app.post(api.classes.addStudents.path, async (req, res) => {
    const { studentIds } = req.body;
    const classId = req.params.id;
    await storage.addClassStudents(classId, studentIds, (req.user as any).id);
    res.status(201).json({ success: true });

    // Fire-and-forget: lazy create topic + add học viên vào Tinode topic
    (async () => {
      try {
        const { createClassTopic, addMemberToTopic } = await import("../lib/tinode.service");
        const cls = await storage.getClass(classId);
        if (!cls?.locationId) return;

        // Get or create the class topic
        let topicId: string | null = cls.tinodeTopicId ?? null;
        if (!topicId) {
          topicId = await createClassTopic(cls.name, cls.locationId, cls.id);
          if (topicId) {
            await db.update(classes).set({ tinodeTopicId: topicId } as any).where(eq(classes.id, classId));
          }
        }

        if (!topicId || !studentIds?.length) return;

        const studentRows = await db
          .select({ tinodeUserId: users.tinodeUserId })
          .from(students)
          .innerJoin(users, eq(students.userId, users.id))
          .where(inArray(students.id, studentIds));

        await Promise.allSettled(
          studentRows
            .filter(r => r.tinodeUserId)
            .map(r => addMemberToTopic(topicId!, r.tinodeUserId!))
        );
      } catch (err) {
        console.error("[Tinode] addStudents channel sync failed:", err);
      }
    })();
  });

  app.post(api.classes.scheduleStudents.path, async (req, res) => {
    try {
      const { configs, classScheduleConfig } = req.body;
      const userId = (req.user as any)?.id;
      const classId = req.params.id;

      // If classScheduleConfig is provided, generate class sessions first (one-step flow)
      if (classScheduleConfig) {
        const existingSessions = await storage.getClassSessions(classId);
        if (!existingSessions || existingSessions.length === 0) {
          await storage.updateClass(classId, {
            ...classScheduleConfig,
            regenerateSessions: true,
          });
        }
      }

      await storage.scheduleClassStudents(classId, configs, userId);
      res.status(200).json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể xếp lịch cho học viên" });
    }
  });

  app.get(api.classes.sessions.path, async (req, res) => {
    const sessions = await storage.getClassSessions(req.params.id);
    res.json(sessions);
  });

  app.get(api.classes.studentSessions.path, async (req, res) => {
    const sessions = await storage.getStudentSessionsForClass(req.params.id, req.params.studentId);
    res.json(sessions);
  });

  // GET /api/classes/:classId/student-allocated-fees?fromOrder=N&toOrder=N
  // Returns average allocatedAmount per session per student in the given session index range.
  // Falls back to session_price when no invoice allocation exists yet (provisional).
  app.get("/api/classes/:classId/student-allocated-fees", async (req, res) => {
    try {
      const { classId } = req.params;
      const fromOrder = req.query.fromOrder ? parseInt(req.query.fromOrder as string) : null;
      const toOrder = req.query.toOrder ? parseInt(req.query.toOrder as string) : null;

      const rows = await db.execute(sql`
        SELECT
          ss.student_id AS "studentId",
          ROUND(
            COALESCE(
              AVG(isa.allocated_amount),
              AVG(ss.session_price)
            )::numeric, 2
          ) AS "avgAllocatedAmount"
        FROM student_sessions ss
        JOIN class_sessions cs ON cs.id = ss.class_session_id
        LEFT JOIN invoice_session_allocations isa ON isa.student_session_id = ss.id
        WHERE ss.class_id = ${classId}
          ${fromOrder !== null && toOrder !== null
            ? sql`AND cs.session_index BETWEEN ${fromOrder} AND ${toOrder}`
            : sql``}
        GROUP BY ss.student_id
      `);

      const result: Record<string, string> = {};
      for (const row of rows.rows as any[]) {
        result[row.studentId] = row.avgAllocatedAmount ?? "0";
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/classes/:classId/invoice-summary
  // Returns aggregated invoice info per student for the given class.
  app.get("/api/classes/:classId/invoice-summary", async (req, res) => {
    try {
      const { classId } = req.params;
      const rows = await db
        .select({
          studentId: invoices.studentId,
          grandTotal: sql<string>`COALESCE(SUM(${invoices.grandTotal}),0)`,
          paidAmount: sql<string>`COALESCE(SUM(${invoices.paidAmount}),0)`,
          remainingAmount: sql<string>`COALESCE(SUM(${invoices.remainingAmount}),0)`,
          count: sql<number>`COUNT(*)::int`,
          statuses: sql<string[]>`ARRAY_AGG(DISTINCT ${invoices.status})`,
        })
        .from(invoices)
        .where(and(eq(invoices.classId, classId), sql`${invoices.status} <> 'cancelled'`))
        .groupBy(invoices.studentId);

      const statusPriority: Record<string, number> = { debt: 4, unpaid: 3, partial: 2, paid: 1 };
      const result = rows.map((r) => {
        const worstStatus = (r.statuses ?? []).sort((a, b) => (statusPriority[b] ?? 0) - (statusPriority[a] ?? 0))[0] ?? "unpaid";
        return {
          studentId: r.studentId,
          grandTotal: parseFloat(r.grandTotal),
          paidAmount: parseFloat(r.paidAmount),
          remainingAmount: parseFloat(r.remainingAmount),
          count: r.count,
          status: worstStatus,
        };
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Transfer class (legacy + current endpoint)
  app.post("/api/students/transfer-class", async (req, res) => {
    try {
      const transferSchema = z.object({
        studentId: z.string().uuid(),
        fromClassId: z.string().uuid(),
        toClassId: z.string().uuid(),
        fromSessionIndex: z.number().int().min(1),
        toSessionIndex: z.number().int().min(1),
        transferCount: z.number().int().min(1),
      });

      const data = transferSchema.parse(req.body);
      await storage.transferStudentClass({
        ...data,
        userId: (req.user as any).id
      });
      res.json({ success: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(400).json({ message: err.message || "Không thể chuyển lớp" });
    }
  });

  app.post(api.students.transferClass.path, async (req, res) => {
    try {
      const data = api.students.transferClass.input.parse(req.body);
      await storage.transferStudentClass({
        ...data,
        userId: (req.user as any).id
      });
      res.json({ success: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(400).json({ message: err.message || "Không thể chuyển lớp" });
    }
  });

  // Class Sessions - student sessions
  app.get(api.classSessions.studentSessions.path, async (req, res) => {
    const sessions = await storage.getStudentSessionsByClassSession(req.params.id);
    res.json(sessions);
  });

  // GET /api/classes/:classId/all-student-sessions
  // Returns all student sessions for the class (used for attendance overview tab)
  app.get("/api/classes/:classId/all-student-sessions", async (req, res) => {
    try {
      const { classId } = req.params;
      const { db: baseDb, eq: baseEq, studentSessions: baseSs, students: baseStudents } = await import("../storage/base");
      const rows = await baseDb
        .select({
          id: baseSs.id,
          classSessionId: baseSs.classSessionId,
          studentId: baseSs.studentId,
          attendanceStatus: baseSs.attendanceStatus,
          studentName: baseStudents.fullName,
          studentCode: baseStudents.code,
        })
        .from(baseSs)
        .innerJoin(baseStudents, baseEq(baseSs.studentId, baseStudents.id))
        .where(baseEq(baseSs.classId, classId));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Lỗi khi lấy dữ liệu điểm danh" });
    }
  });

  // Get all student sessions for a specific student in a specific class
  app.get("/api/classes/:classId/student/:studentId/sessions", async (req, res) => {
    try {
      const { classId, studentId } = req.params;
      const { db: baseDb, eq: baseEq, and: baseAnd, asc: baseAsc, studentSessions: baseSs, classSessions: baseCs } = await import("../storage/base");
      const rows = await baseDb
        .select({
          id: baseSs.id,
          classSessionId: baseSs.classSessionId,
          sessionOrder: baseSs.sessionOrder,
          attendanceStatus: baseSs.attendanceStatus,
          sessionDate: baseCs.sessionDate,
          weekday: baseCs.weekday,
        })
        .from(baseSs)
        .innerJoin(baseCs, baseEq(baseSs.classSessionId, baseCs.id))
        .where(baseAnd(baseEq(baseSs.classId, classId), baseEq(baseSs.studentId, studentId)))
        .orderBy(baseAsc(baseCs.sessionDate));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Lỗi khi lấy danh sách buổi học" });
    }
  });

  app.post("/api/class-sessions/:sessionId/add-students", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { studentIds } = req.body;
      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        return res.status(400).json({ message: "Thiếu danh sách học viên" });
      }
      const { db: baseDb, eq: baseEq, and: baseAnd, classSessions: baseSessions, studentClasses: baseSc, studentSessions: baseSs } = await import("../storage/base");
      const [session] = await baseDb.select().from(baseSessions).where(baseEq(baseSessions.id, sessionId));
      if (!session) return res.status(404).json({ message: "Không tìm thấy buổi học" });

      for (const studentId of studentIds) {
        const [existing] = await baseDb.select({ id: baseSs.id }).from(baseSs)
          .where(baseAnd(baseEq(baseSs.classSessionId, sessionId), baseEq(baseSs.studentId, studentId)));
        if (existing) continue;

        const [sc] = await baseDb.select().from(baseSc)
          .where(baseAnd(baseEq(baseSc.classId, session.classId), baseEq(baseSc.studentId, studentId)));
        if (!sc) continue;

        await baseDb.insert(baseSs).values({
          studentId,
          classId: session.classId,
          studentClassId: sc.id,
          classSessionId: sessionId,
          status: "scheduled",
          attendanceStatus: "pending",
        });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Lỗi khi thêm học viên vào buổi học" });
    }
  });

  // Change student cycle from a specific session onwards
  app.post("/api/student-classes/:id/change-cycle", async (req, res) => {
    try {
      const { id } = req.params;
      const { fromSessionOrder, weekdays, mode } = req.body;
      if (!fromSessionOrder || !weekdays || !mode) {
        return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
      }
      const result = await storage.changeStudentCycle({
        studentClassId: id,
        fromSessionOrder: parseInt(String(fromSessionOrder)),
        weekdays,
        mode,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Lỗi khi thay đổi chu kỳ" });
    }
  });

  // Bulk change cycle for multiple students at once from a specific session
  app.post("/api/class-sessions/:sessionId/bulk-change-cycle", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { students, mode } = req.body as {
        students: Array<{ studentClassId: string; weekdays: number[] | null }>;
        mode: "all" | "unattended_only";
      };
      if (!students || !Array.isArray(students) || students.length === 0) {
        return res.status(400).json({ message: "Thiếu danh sách học viên" });
      }
      // Fetch sessionOrder for each studentClassId at this classSessionId
      const studentClassIds = students.map((s) => s.studentClassId);
      const sessionRows = await db
        .select({
          studentClassId: studentSessions.studentClassId,
          sessionOrder: studentSessions.sessionOrder,
        })
        .from(studentSessions)
        .where(
          and(
            eq(studentSessions.classSessionId, sessionId),
            inArray(studentSessions.studentClassId, studentClassIds)
          )
        );
      const orderMap: Record<string, number> = {};
      for (const row of sessionRows) {
        if (row.studentClassId) orderMap[row.studentClassId] = row.sessionOrder ?? 1;
      }
      const results: Array<{ studentClassId: string; deleted: number; created: number; warning?: string; error?: string }> = [];
      for (const s of students) {
        const fromSessionOrder = orderMap[s.studentClassId];
        if (!fromSessionOrder) {
          results.push({ studentClassId: s.studentClassId, deleted: 0, created: 0, warning: "Không tìm thấy buổi học" });
          continue;
        }
        try {
          const result = await storage.changeStudentCycle({
            studentClassId: s.studentClassId,
            fromSessionOrder,
            weekdays: s.weekdays ?? [],
            mode: mode ?? "unattended_only",
          });
          results.push({ studentClassId: s.studentClassId, ...result });
        } catch (err: any) {
          results.push({ studentClassId: s.studentClassId, deleted: 0, created: 0, error: err.message });
        }
      }
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Lỗi khi đổi chu kỳ hàng loạt" });
    }
  });

  // Update student class scheduled weekdays (cycle)
  app.patch("/api/student-classes/:id/weekdays", async (req, res) => {
    try {
      const { id } = req.params;
      const { weekdays } = req.body;
      const { db: baseDb, eq: baseEq, studentClasses: baseSc } = await import("../storage/base");
      await baseDb.update(baseSc)
        .set({ scheduledWeekdays: weekdays ?? null, updatedAt: new Date() })
        .where(baseEq(baseSc.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Lỗi khi cập nhật chu kỳ" });
    }
  });

  // Attendance updates
  app.patch(api.studentSessions.updateAttendance.path, async (req, res) => {
    try {
      const { status, note } = req.body;
      const userId = (req as any).user?.id ?? null;
      const userFullName = await resolveStaffFullName(userId);
      await storage.updateStudentAttendance(req.params.id, status, note, userId, userFullName);
      sendAttendanceNotification(req.params.id, status, userId).catch(console.error);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post(api.studentSessions.attendance.path, async (req, res) => {
    try {
      const { student_session_id, attendance_status, attendance_note } = req.body;
      const userId = (req as any).user?.id ?? null;
      const userFullName = await resolveStaffFullName(userId);

      // Pre-fetch for activity log
      let attendanceLogData: any = null;
      try {
        const [ss] = await db.select({
          classSessionId: studentSessions.classSessionId,
          studentId: studentSessions.studentId,
          classId: studentSessions.classId,
          oldStatus: studentSessions.attendanceStatus,
        }).from(studentSessions).where(eq(studentSessions.id, student_session_id)).limit(1);

        if (ss) {
          const [studentRow] = await db.select({ fullName: students.fullName, code: students.code })
            .from(students).where(eq(students.id, ss.studentId)).limit(1);
          const [csRow] = await db.select({
            sessionIndex: classSessions.sessionIndex,
            weekday: classSessions.weekday,
            sessionDate: classSessions.sessionDate,
            startTime: shiftTemplates.startTime,
          }).from(classSessions)
            .leftJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
            .where(eq(classSessions.id, ss.classSessionId)).limit(1);

          attendanceLogData = {
            classId: ss.classId,
            session: { index: csRow?.sessionIndex, weekday: csRow?.weekday, sessionDate: csRow?.sessionDate, startTime: csRow?.startTime ?? null },
            students: [{ name: studentRow?.fullName ?? "", code: studentRow?.code ?? "", oldStatus: ss.oldStatus ?? "scheduled", newStatus: attendance_status }],
          };
        }
      } catch (logPrefetchErr) {
        console.error("[Attendance] Pre-fetch log error:", logPrefetchErr);
      }

      await storage.updateStudentAttendance(student_session_id, attendance_status, attendance_note, userId, userFullName);
      sendAttendanceNotification(student_session_id, attendance_status, userId).catch(console.error);

      // Create activity log
      if (attendanceLogData && userId) {
        try {
          const [locRow] = await db.select({ locationId: classes.locationId })
            .from(classes).where(eq(classes.id, attendanceLogData.classId)).limit(1);
          const { session, students: studs } = attendanceLogData;
          await createActivityLog({
            userId,
            locationId: locRow?.locationId ?? null,
            classId: attendanceLogData.classId,
            action: "Điểm danh",
            oldContent: null,
            newContent: JSON.stringify({ session, students: studs }),
          });
        } catch (logErr) {
          console.error("[Attendance] Activity log error:", logErr);
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post(api.studentSessions.bulkAttendance.path, async (req, res) => {
    try {
      const { session_id, students: studentList } = req.body;
      const userId = (req as any).user?.id ?? null;
      const userFullName = await resolveStaffFullName(userId);

      // Pre-fetch for activity log
      let bulkLogData: any = null;
      try {
        if (Array.isArray(studentList) && studentList.length > 0) {
          const studentSessionIds = studentList.map((s: any) => s.studentSessionId);
          const ssRows = await db.select({
            id: studentSessions.id,
            studentId: studentSessions.studentId,
            classId: studentSessions.classId,
            oldStatus: studentSessions.attendanceStatus,
          }).from(studentSessions).where(inArray(studentSessions.id, studentSessionIds));

          const allStudentIds = [...new Set(ssRows.map(r => r.studentId).filter(Boolean))] as string[];
          const studentInfoMap = new Map<string, { fullName: string; code: string }>();
          if (allStudentIds.length > 0) {
            const sRows = await db.select({ id: students.id, fullName: students.fullName, code: students.code })
              .from(students).where(inArray(students.id, allStudentIds));
            for (const s of sRows) studentInfoMap.set(s.id, { fullName: s.fullName ?? "", code: s.code ?? "" });
          }

          const [csRow] = await db.select({
            sessionIndex: classSessions.sessionIndex,
            weekday: classSessions.weekday,
            sessionDate: classSessions.sessionDate,
            startTime: shiftTemplates.startTime,
            classId: classSessions.classId,
          }).from(classSessions)
            .leftJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
            .where(eq(classSessions.id, session_id)).limit(1);

          const ssMap = new Map(ssRows.map(r => [r.id, r]));
          const studentChanges = studentList.map((s: any) => {
            const ss = ssMap.get(s.studentSessionId);
            const info = ss ? studentInfoMap.get(ss.studentId) : null;
            return {
              name: info?.fullName ?? "",
              code: info?.code ?? "",
              oldStatus: ss?.oldStatus ?? "scheduled",
              newStatus: s.attendanceStatus,
            };
          });

          bulkLogData = {
            classId: csRow?.classId ?? ssRows[0]?.classId,
            session: { index: csRow?.sessionIndex, weekday: csRow?.weekday, sessionDate: csRow?.sessionDate, startTime: csRow?.startTime ?? null },
            students: studentChanges,
          };
        }
      } catch (logPrefetchErr) {
        console.error("[BulkAttendance] Pre-fetch log error:", logPrefetchErr);
      }

      await storage.bulkUpdateAttendance(session_id, studentList, userId, userFullName);
      for (const s of (studentList ?? [])) {
        sendAttendanceNotification(s.studentSessionId, s.attendanceStatus, userId).catch(console.error);
      }

      // Create activity log
      if (bulkLogData && userId) {
        try {
          const [locRow] = await db.select({ locationId: classes.locationId })
            .from(classes).where(eq(classes.id, bulkLogData.classId)).limit(1);
          const { session, students: studs } = bulkLogData;
          await createActivityLog({
            userId,
            locationId: locRow?.locationId ?? null,
            classId: bulkLogData.classId,
            action: "Điểm danh hàng loạt",
            oldContent: null,
            newContent: JSON.stringify({ session, students: studs }),
          });
        } catch (logErr) {
          console.error("[BulkAttendance] Activity log error:", logErr);
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post(api.studentSessions.review.path, async (req, res) => {
    try {
      const { studentSessionIds, reviewData, published } = req.body;
      if (!Array.isArray(studentSessionIds) || studentSessionIds.length === 0) {
        return res.status(400).json({ message: "studentSessionIds required" });
      }
      await db.update(studentSessions)
        .set({ reviewData, reviewPublished: !!published, updatedAt: new Date() })
        .where(inArray(studentSessions.id, studentSessionIds));
      if (published) {
        const userId = (req as any).user?.id ?? null;
        sendReviewNotification(studentSessionIds, userId).catch(console.error);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post(api.studentSessions.tuitionPackage.path, async (req, res) => {
    try {
      const { student_class_ids, package_id, from_session_order, to_session_order } = req.body;
      if (!student_class_ids || !Array.isArray(student_class_ids) || student_class_ids.length === 0) {
        return res.status(400).json({ message: "Vui lòng chọn ít nhất một học viên" });
      }
      if (!package_id) {
        return res.status(400).json({ message: "Vui lòng chọn gói học phí" });
      }
      if (from_session_order === undefined || to_session_order === undefined) {
        return res.status(400).json({ message: "Vui lòng chọn khoảng buổi học" });
      }
      if (isNaN(from_session_order) || isNaN(to_session_order)) {
        return res.status(400).json({ message: "Khoảng buổi học không hợp lệ" });
      }
      const result = await storage.updateStudentTuitionPackage(student_class_ids, package_id, from_session_order, to_session_order);
      res.json({ success: true, warning: result.warning });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get(api.classSessions.students.path, async (req, res) => {
    try {
      const sessions = await storage.getStudentSessionsByClassSession(req.params.id);
      const results = sessions.map(ss => ({
        student_session_id: ss.id,
        student_id: ss.studentId,
        student_name: ss.student?.fullName,
        student_code: ss.student?.code,
        attendance_status: ss.attendanceStatus,
        attendance_note: ss.attendanceNote
      }));
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Change Teacher
  app.post(api.classes.changeTeacher.path, async (req, res) => {
    try {
      const { newTeacherIds, fromSessionId, toSessionId } = req.body;
      const classId = req.params.id;
      const userId = (req.user as any)?.id ?? null;

      if (!newTeacherIds || !Array.isArray(newTeacherIds) || newTeacherIds.length === 0) {
        return res.status(400).json({ message: "Vui lòng chọn ít nhất một giáo viên" });
      }

      // Pre-fetch class info for log
      const [classInfo] = await db.select({ locationId: classes.locationId })
        .from(classes).where(eq(classes.id, classId)).limit(1);

      // Get date range from the two session IDs
      const [[fromSess], [toSess]] = await Promise.all([
        db.select({ sessionDate: classSessions.sessionDate }).from(classSessions).where(eq(classSessions.id, fromSessionId)).limit(1),
        db.select({ sessionDate: classSessions.sessionDate }).from(classSessions).where(eq(classSessions.id, toSessionId)).limit(1),
      ]);

      // Fetch sessions in range with start time
      let sessionsInRange: { id: string; sessionIndex: number | null; weekday: number; sessionDate: string; teacherIds: string[] | null; startTime: string | null }[] = [];
      if (fromSess?.sessionDate && toSess?.sessionDate) {
        sessionsInRange = await db.select({
          id: classSessions.id,
          sessionIndex: classSessions.sessionIndex,
          weekday: classSessions.weekday,
          sessionDate: classSessions.sessionDate,
          teacherIds: classSessions.teacherIds,
          startTime: shiftTemplates.startTime,
        })
          .from(classSessions)
          .leftJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
          .where(and(
            eq(classSessions.classId, classId),
            sql`${classSessions.sessionDate} BETWEEN ${fromSess.sessionDate} AND ${toSess.sessionDate}`,
          ))
          .orderBy(asc(classSessions.sessionIndex));
      }

      // Collect all staff IDs (old + new) and look up names
      const allStaffIds = [...new Set([
        ...sessionsInRange.flatMap(s => s.teacherIds ?? []),
        ...newTeacherIds,
      ])];
      const teacherRows = allStaffIds.length > 0
        ? await db.select({ id: staff.id, fullName: staff.fullName, code: staff.code })
            .from(staff).where(inArray(staff.id, allStaffIds))
        : [];
      const teacherMap = new Map(teacherRows.map(t => [t.id, t]));

      const toTeacherEntry = (tid: string) => {
        const t = teacherMap.get(tid);
        return { id: tid, name: t?.fullName ?? tid, code: t?.code ?? "" };
      };

      const oldContent = sessionsInRange.map(s => ({
        sessionIndex: s.sessionIndex,
        weekday: s.weekday,
        sessionDate: s.sessionDate,
        startTime: s.startTime ?? null,
        teachers: (s.teacherIds ?? []).map(toTeacherEntry),
      }));

      const newTeacherList = newTeacherIds.map(toTeacherEntry);
      const newContent = sessionsInRange.map(s => ({
        sessionIndex: s.sessionIndex,
        weekday: s.weekday,
        sessionDate: s.sessionDate,
        startTime: s.startTime ?? null,
        teachers: newTeacherList,
      }));

      const teacherId = newTeacherIds[0];

      await storage.changeTeacher({
        classId,
        newTeacherId: teacherId,
        fromSessionId,
        toSessionId,
      });

      // Create activity log
      try {
        await createActivityLog({
          userId,
          locationId: classInfo?.locationId ?? null,
          classId,
          action: "Đổi giáo viên",
          oldContent: JSON.stringify(oldContent),
          newContent: JSON.stringify(newContent),
        });
      } catch (logErr) {
        console.error("[ChangeTeacher] Activity log error:", logErr);
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Change teacher error:", err);
      res.status(400).json({ message: err.message || "Không thể đổi giáo viên" });
    }
  });

  // Check attendance before delete
  app.post(api.classes.checkAttendanceBeforeDelete.path, async (req, res) => {
    try {
      const { classId, sessionId, deleteType } = req.body;

      let sessionIds: string[] = [];
      if (deleteType === "single") {
        sessionIds = [sessionId];
      } else {
        const selectedSession = await storage.getClassSession(sessionId);
        if (!selectedSession) return res.status(404).json({ message: "Không tìm thấy buổi học" });

        const allSessions = await storage.getClassSessions(classId);
        if (deleteType === "next") {
          sessionIds = allSessions
            .filter(s => (s.sessionIndex || 0) >= (selectedSession.sessionIndex || 0))
            .map(s => s.id);
        } else if (deleteType === "all") {
          sessionIds = allSessions.map(s => s.id);
        }
      }

      const hasAttended = await storage.checkSessionsAttendance(sessionIds);
      res.json({ hasAttended });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Delete sessions
  app.post(api.classes.deleteSessions.path, async (req, res) => {
    try {
      const validatedData = deleteSessionsSchema.parse(req.body);
      const userId = (req.user as any)?.id ?? null;

      // --- Pre-fetch before deletion ---
      const [classInfo] = await db.select({
        name: classes.name,
        classCode: classes.classCode,
        locationId: classes.locationId,
        managerIds: classes.managerIds,
        teacherIds: classes.teacherIds,
      }).from(classes).where(eq(classes.id, validatedData.classId)).limit(1);

      const [fromSession] = await db.select({
        sessionIndex: classSessions.sessionIndex,
        sessionDate: classSessions.sessionDate,
        weekday: classSessions.weekday,
      }).from(classSessions).where(eq(classSessions.id, validatedData.sessionId)).limit(1);

      // For "next" type, also find the last session in the range
      let toSession: typeof fromSession | null = null;
      if (validatedData.deleteType === "next" && fromSession?.sessionIndex != null) {
        const [last] = await db.select({
          sessionIndex: classSessions.sessionIndex,
          sessionDate: classSessions.sessionDate,
          weekday: classSessions.weekday,
        }).from(classSessions)
          .where(and(
            eq(classSessions.classId, validatedData.classId),
            gte(classSessions.sessionIndex, fromSession.sessionIndex),
          ))
          .orderBy(desc(classSessions.sessionIndex))
          .limit(1);
        toSession = last ?? null;
      }

      // Pre-fetch sessions for activity log
      type SessionLogEntry = { sessionIndex: number | null; sessionDate: string; weekday: number; startTime: string | null };
      const sessionLogBaseQuery = db.select({
        id: classSessions.id,
        sessionIndex: classSessions.sessionIndex,
        sessionDate: classSessions.sessionDate,
        weekday: classSessions.weekday,
        startTime: shiftTemplates.startTime,
      })
        .from(classSessions)
        .leftJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id));

      // All sessions before deletion (for oldContent)
      const allSessionsBeforeDelete = await sessionLogBaseQuery
        .where(eq(classSessions.classId, validatedData.classId))
        .orderBy(asc(classSessions.sessionIndex));

      // Only the sessions that will be deleted (for newContent)
      let deletedSessionsLog: SessionLogEntry[] = [];
      if (validatedData.deleteType === "single") {
        deletedSessionsLog = allSessionsBeforeDelete.filter(s => s.id === validatedData.sessionId);
      } else if (validatedData.deleteType === "next" && fromSession?.sessionIndex != null) {
        deletedSessionsLog = allSessionsBeforeDelete.filter(s => (s.sessionIndex ?? 0) >= (fromSession.sessionIndex ?? 0));
      } else if (validatedData.deleteType === "all") {
        deletedSessionsLog = allSessionsBeforeDelete;
      }

      // Perform deletion
      await storage.deleteClassSessions(
        validatedData.classId,
        validatedData.sessionId,
        validatedData.deleteType,
        validatedData.mode
      );

      // --- Create activity log ---
      try {
        const toEntry = (s: typeof allSessionsBeforeDelete[0]): SessionLogEntry => ({
          sessionIndex: s.sessionIndex,
          weekday: s.weekday,
          sessionDate: s.sessionDate,
          startTime: s.startTime ?? null,
        });
        await createActivityLog({
          userId,
          locationId: classInfo?.locationId ?? null,
          classId: validatedData.classId,
          action: "Xoá lịch",
          oldContent: JSON.stringify(allSessionsBeforeDelete.map(toEntry)),
          newContent: JSON.stringify(deletedSessionsLog.map(toEntry)),
        });
      } catch (logErr) {
        console.error("[DeleteSessions] Activity log error:", logErr);
      }

      // --- Send notification after deletion ---
      if (classInfo) {
        try {
          const staffIds = [
            ...(classInfo.managerIds ?? []),
            ...(classInfo.teacherIds ?? []),
          ].filter(Boolean);

          const staffUserIds = await resolveStaffUserIds(staffIds);

          if (staffUserIds.length > 0 && fromSession) {
            const wd1 = SCHEDULE_WEEKDAY_LABELS[fromSession.weekday ?? 0] ?? "";
            const d1 = formatScheduleDate(fromSession.sessionDate);
            const idx1 = fromSession.sessionIndex;

            let content = "";
            if (validatedData.deleteType === "single") {
              content = `Lịch học Lớp ${classInfo.name}, Buổi ${idx1}, ${wd1} ${d1} được xoá`;
            } else if (validatedData.deleteType === "next" && toSession) {
              const wd2 = SCHEDULE_WEEKDAY_LABELS[toSession.weekday ?? 0] ?? "";
              const d2 = formatScheduleDate(toSession.sessionDate);
              const idx2 = toSession.sessionIndex;
              content = `Lịch học Lớp ${classInfo.name}, được xoá từ Buổi ${idx1}, ${wd1} ${d1} - Buổi ${idx2}, ${wd2} ${d2}`;
            } else {
              content = `Toàn bộ Lịch học Lớp ${classInfo.name} vừa được xoá`;
            }

            await sendNotificationToMany(staffUserIds, {
              title: "Thông báo lịch học",
              content,
              category: "schedule",
              referenceId: validatedData.classId,
              referenceType: "class",
            });
          }
        } catch (notiErr) {
          console.error("[DeleteSessions] Notification error:", notiErr);
        }
      }

      res.json({ message: "Thành công" });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  // Update cycle
  app.post(api.classes.updateCycle.path, async (req, res) => {
    try {
      const { fromSessionId, toSessionId, weekdays, weekdayConfigs, reason } = req.body;
      const classId = req.params.id;
      const userId = (req.user as any).id;

      // Pre-fetch data before update for notifications
      const [fromSession] = await db.select({
        sessionIndex: classSessions.sessionIndex,
        sessionDate: classSessions.sessionDate,
        weekday: classSessions.weekday,
      }).from(classSessions).where(eq(classSessions.id, fromSessionId)).limit(1);

      const [toSession] = await db.select({
        sessionIndex: classSessions.sessionIndex,
        sessionDate: classSessions.sessionDate,
        weekday: classSessions.weekday,
      }).from(classSessions).where(eq(classSessions.id, toSessionId)).limit(1);

      // Collect existing teachers and weekdays in the range before update
      let oldTeacherIdsSet = new Set<string>();
      let oldWeekdaySet = new Set<number>();
      let studentUserIdsInRange: string[] = [];

      if (fromSession && toSession) {
        const fromIndex = fromSession.sessionIndex ?? 0;
        const toIndex = toSession.sessionIndex ?? 0;

        const sessionsInRange = await db.select({
          teacherIds: classSessions.teacherIds,
          weekday: classSessions.weekday,
        }).from(classSessions).where(and(
          eq(classSessions.classId, classId),
          between(classSessions.sessionIndex, fromIndex, toIndex),
        ));

        for (const s of sessionsInRange) {
          (s.teacherIds ?? []).forEach(id => oldTeacherIdsSet.add(id));
          if (s.weekday != null) oldWeekdaySet.add(s.weekday);
        }

        studentUserIdsInRange = await resolveStudentUserIdsInSessionRange(classId, fromIndex, toIndex);
      }

      // Pre-fetch sessions for activity log (before update)
      type CycleTeacherEntry = { name: string; code: string };
      type CycleSessionLogEntry = { sessionIndex: number | null; weekday: number; sessionDate: string; startTime: string | null; teachers: CycleTeacherEntry[] };

      async function resolveCycleTeachers(teacherIdsList: (string[] | null)[]): Promise<Map<string, CycleTeacherEntry>> {
        const allIds = new Set<string>();
        for (const ids of teacherIdsList) { (ids ?? []).forEach(id => allIds.add(id)); }
        if (allIds.size === 0) return new Map();
        const staffRows = await db.select({ id: staff.id, fullName: staff.fullName, code: staff.code })
          .from(staff).where(inArray(staff.id, [...allIds]));
        return new Map(staffRows.map(r => [r.id, { name: r.fullName ?? "", code: r.code ?? "" }]));
      }

      let sessionsBeforeUpdate: CycleSessionLogEntry[] = [];
      if (fromSession && toSession) {
        const fi = fromSession.sessionIndex ?? 0;
        const ti = toSession.sessionIndex ?? 0;
        const rows = await db.select({
          sessionIndex: classSessions.sessionIndex,
          weekday: classSessions.weekday,
          sessionDate: classSessions.sessionDate,
          startTime: shiftTemplates.startTime,
          teacherIds: classSessions.teacherIds,
        }).from(classSessions)
          .leftJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
          .where(and(eq(classSessions.classId, classId), between(classSessions.sessionIndex, fi, ti)))
          .orderBy(asc(classSessions.sessionIndex));
        const teacherMap = await resolveCycleTeachers(rows.map(r => r.teacherIds));
        sessionsBeforeUpdate = rows.map(s => ({
          sessionIndex: s.sessionIndex,
          weekday: s.weekday,
          sessionDate: s.sessionDate,
          startTime: s.startTime ?? null,
          teachers: (s.teacherIds ?? []).map(id => teacherMap.get(id)).filter(Boolean) as CycleTeacherEntry[],
        }));
      }

      await storage.updateClassCycle(classId, {
        fromSessionId,
        toSessionId,
        weekdays,
        weekdayConfigs,
        reason,
        userId,
      });

      // Post-fetch new sessions for activity log (after update) and log
      if (fromSession && toSession) {
        const fi = fromSession.sessionIndex ?? 0;
        const ti = toSession.sessionIndex ?? 0;
        try {
          const newRows = await db.select({
            sessionIndex: classSessions.sessionIndex,
            weekday: classSessions.weekday,
            sessionDate: classSessions.sessionDate,
            startTime: shiftTemplates.startTime,
            teacherIds: classSessions.teacherIds,
          }).from(classSessions)
            .leftJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
            .where(and(eq(classSessions.classId, classId), between(classSessions.sessionIndex, fi, ti)))
            .orderBy(asc(classSessions.sessionIndex));
          const newTeacherMap = await resolveCycleTeachers(newRows.map(r => r.teacherIds));
          const sessionsAfterUpdate: CycleSessionLogEntry[] = newRows.map(s => ({
            sessionIndex: s.sessionIndex,
            weekday: s.weekday,
            sessionDate: s.sessionDate,
            startTime: s.startTime ?? null,
            teachers: (s.teacherIds ?? []).map(id => newTeacherMap.get(id)).filter(Boolean) as CycleTeacherEntry[],
          }));
          const [cycleClassInfo] = await db.select({ locationId: classes.locationId })
            .from(classes).where(eq(classes.id, classId)).limit(1);
          await createActivityLog({
            userId,
            locationId: cycleClassInfo?.locationId ?? null,
            classId,
            action: "Cập nhật chu kỳ",
            oldContent: JSON.stringify(sessionsBeforeUpdate),
            newContent: JSON.stringify(sessionsAfterUpdate),
          });
        } catch (logErr) {
          console.error("[UpdateCycle] Activity log error:", logErr);
        }
      }

      // Send notifications after successful update
      if (fromSession && toSession) {
        try {
          const [classInfo] = await db.select({
            name: classes.name,
            classCode: classes.classCode,
            managerIds: classes.managerIds,
          }).from(classes).where(eq(classes.id, classId)).limit(1);

          if (classInfo) {
            const className = classInfo.name ?? "";
            const classCode = classInfo.classCode ?? "";
            const managerIds: string[] = classInfo.managerIds ?? [];

            const fromIdx = fromSession.sessionIndex ?? 1;
            const toIdx = toSession.sessionIndex ?? 1;
            const fromWd = SCHEDULE_WEEKDAY_LABELS[fromSession.weekday ?? 0] ?? "";
            const toWd = SCHEDULE_WEEKDAY_LABELS[toSession.weekday ?? 0] ?? "";
            const fromDate = formatScheduleDate(fromSession.sessionDate);
            const toDate = formatScheduleDate(toSession.sessionDate);

            // Format weekday lists
            const sortOrder = [0, 1, 2, 3, 4, 5, 6];
            const oldWdLabels = sortOrder.filter(d => oldWeekdaySet.has(d)).map(d => SCHEDULE_WEEKDAY_LABELS[d]);
            const newWdArr: number[] = Array.isArray(weekdays) ? weekdays : [];
            const newWdLabels = sortOrder.filter(d => newWdArr.includes(d)).map(d => SCHEDULE_WEEKDAY_LABELS[d]);

            const rangeLabel = `Từ buổi ${fromIdx}, ${fromWd} ${fromDate} - Buổi ${toIdx}, ${toWd} ${toDate}`;
            const generalContent = `Lớp ${className} (${classCode}) vừa được cập nhật thay đổi chu kỳ học từ ${oldWdLabels.join(",")} sang ${newWdLabels.join(",")} ${rangeLabel}`;

            // Collect all new teacher IDs from weekdayConfigs
            const newAllTeacherIds = new Set<string>();
            if (weekdayConfigs && typeof weekdayConfigs === "object") {
              for (const cfg of Object.values(weekdayConfigs) as any[]) {
                if (Array.isArray(cfg?.teacherIds)) {
                  cfg.teacherIds.forEach((id: string) => newAllTeacherIds.add(id));
                }
              }
            }

            // TH1: existing teachers (were in sessions) that are still in new config + managers + students
            const continuedTeacherIds = [...oldTeacherIdsSet].filter(id => newAllTeacherIds.has(id));
            const th1StaffIds = [...new Set([...continuedTeacherIds, ...managerIds])];
            const th1UserIds = await resolveStaffUserIds(th1StaffIds);
            const generalRecipients = [...new Set([...th1UserIds, ...studentUserIdsInRange])];
            if (generalRecipients.length > 0) {
              await sendNotificationToMany(generalRecipients, {
                title: "Thông báo cập nhật chu kỳ học",
                content: generalContent,
                category: "schedule",
                referenceId: classId,
                referenceType: "class",
              });
            }

            // TH2: newly added teachers in the range
            const newlyAddedTeacherIds = [...newAllTeacherIds].filter(id => !oldTeacherIdsSet.has(id));
            const th2UserIds = await resolveStaffUserIds(newlyAddedTeacherIds);
            if (th2UserIds.length > 0) {
              await sendNotificationToMany(th2UserIds, {
                title: "Thông báo xếp lịch dạy",
                content: `Bạn vừa được xếp lịch dạy cho lớp ${className} (${classCode}) trong khoảng thời gian lịch: ${rangeLabel}`,
                category: "schedule",
                referenceId: classId,
                referenceType: "class",
              });
            }
          }
        } catch (notiErr) {
          console.error("[UpdateCycle] Notification error:", notiErr);
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Update cycle error:", err);
      res.status(400).json({ message: err.message || "Không thể cập nhật chu kỳ" });
    }
  });

  // Cancel sessions
  app.post(api.classes.cancelSessions.path, async (req, res) => {
    try {
      const { fromSessionId, toSessionId, reason } = req.body;
      const classId = req.params.id;
      const userId = (req.user as any).id;

      await storage.cancelClassSessions({
        classId,
        fromSessionId,
        toSessionId,
        reason,
        userId
      });

      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể hủy buổi học" });
    }
  });

  // Check attendance for exclusion
  app.post(api.classes.checkAttendanceForExclusion.path, async (req, res) => {
    try {
      const { classId, fromSessionId, toSessionId } = req.body;
      if (!classId || !fromSessionId || !toSessionId) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const fromSession = await storage.getClassSession(fromSessionId);
      const toSession = await storage.getClassSession(toSessionId);

      if (!fromSession || !toSession) {
        return res.status(404).json({ message: "Session not found" });
      }

      const fromIndex = fromSession.sessionIndex || 0;
      const toIndex = toSession.sessionIndex || 0;

      const sessions = await db.select()
        .from(classSessions)
        .where(and(
          eq(classSessions.classId, classId),
          sql`${classSessions.sessionIndex} BETWEEN ${fromIndex} AND ${toIndex}`
        ));

      const sessionIds = sessions.map(s => s.id);

      let hasAttendance = false;
      if (sessionIds.length > 0) {
        const attendedCount = await db.select({ count: sql<number>`count(*)` })
          .from(studentSessions)
          .where(and(
            inArray(studentSessions.classSessionId, sessionIds),
            sql`${studentSessions.attendanceStatus} IS NOT NULL AND ${studentSessions.attendanceStatus} != 'pending'`
          ));
        hasAttendance = (attendedCount[0]?.count || 0) > 0;
      }

      res.json({ hasAttendance });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Exclude sessions
  app.post(api.classes.excludeSessions.path, async (req, res) => {
    try {
      const { classId, fromSessionId, toSessionId, reason } = req.body;
      const userId = (req.user as any).id;

      // Pre-fetch session data before exclusion for notifications
      const [fromSession] = await db.select({
        sessionIndex: classSessions.sessionIndex,
        sessionDate: classSessions.sessionDate,
        weekday: classSessions.weekday,
      }).from(classSessions).where(eq(classSessions.id, fromSessionId)).limit(1);

      const [toSession] = await db.select({
        sessionIndex: classSessions.sessionIndex,
        sessionDate: classSessions.sessionDate,
        weekday: classSessions.weekday,
      }).from(classSessions).where(eq(classSessions.id, toSessionId)).limit(1);

      let oldTeacherIdsSet = new Set<string>();
      let studentUserIdsInRange: string[] = [];

      if (fromSession && toSession) {
        const fromIndex = fromSession.sessionIndex ?? 0;
        const toIndex = toSession.sessionIndex ?? 0;

        const sessionsInRange = await db.select({
          teacherIds: classSessions.teacherIds,
        }).from(classSessions).where(and(
          eq(classSessions.classId, classId),
          between(classSessions.sessionIndex, fromIndex, toIndex),
        ));

        for (const s of sessionsInRange) {
          (s.teacherIds ?? []).forEach(id => oldTeacherIdsSet.add(id));
        }

        studentUserIdsInRange = await resolveStudentUserIdsInSessionRange(classId, fromIndex, toIndex);
      }

      // Pre-fetch sessions for activity log (before exclusion)
      let excludeSessionsBefore: CycleSessionInfo[] = [];
      if (fromSession && toSession) {
        const fi = fromSession.sessionIndex ?? 0;
        const ti = toSession.sessionIndex ?? 0;
        excludeSessionsBefore = await fetchSessionsWithTeachers(classId, fi, ti);
      }

      await storage.excludeClassSessions({
        classId,
        fromSessionId,
        toSessionId,
        reason,
        userId
      });

      // Post-fetch sessions for activity log (after exclusion) and log
      if (fromSession && toSession) {
        const fi = fromSession.sessionIndex ?? 0;
        const ti = toSession.sessionIndex ?? 0;
        try {
          const excludeSessionsAfter = await fetchSessionsWithTeachers(classId, fi, ti);
          const [exClassInfo] = await db.select({ locationId: classes.locationId })
            .from(classes).where(eq(classes.id, classId)).limit(1);
          await createActivityLog({
            userId,
            locationId: exClassInfo?.locationId ?? null,
            classId,
            action: "Loại trừ ngày",
            oldContent: JSON.stringify(excludeSessionsBefore),
            newContent: JSON.stringify(excludeSessionsAfter),
          });
        } catch (logErr) {
          console.error("[ExcludeSessions] Activity log error:", logErr);
        }
      }

      // Send notifications after successful exclusion
      if (fromSession && toSession) {
        try {
          const [classInfo] = await db.select({
            name: classes.name,
            classCode: classes.classCode,
            managerIds: classes.managerIds,
          }).from(classes).where(eq(classes.id, classId)).limit(1);

          if (classInfo) {
            const className = classInfo.name ?? "";
            const classCode = classInfo.classCode ?? "";
            const managerIds: string[] = classInfo.managerIds ?? [];

            const fromIdx = fromSession.sessionIndex ?? 1;
            const toIdx = toSession.sessionIndex ?? 1;
            const fromWd = SCHEDULE_WEEKDAY_LABELS[fromSession.weekday ?? 0] ?? "";
            const toWd = SCHEDULE_WEEKDAY_LABELS[toSession.weekday ?? 0] ?? "";
            const fromDate = formatScheduleDate(fromSession.sessionDate);
            const toDate = formatScheduleDate(toSession.sessionDate);

            const rangeLabel = `Từ buổi ${fromIdx}, ${fromWd} ${fromDate} - Buổi ${toIdx}, ${toWd} ${toDate}`;
            const content = `Lớp ${className} (${classCode}) vừa được cập nhật loại trừ lịch học ${rangeLabel}. Lý do: ${reason ?? ""}`;

            const teacherStaffIds = [...oldTeacherIdsSet];
            const staffUserIds = await resolveStaffUserIds([...new Set([...teacherStaffIds, ...managerIds])]);
            const allRecipients = [...new Set([...staffUserIds, ...studentUserIdsInRange])];

            if (allRecipients.length > 0) {
              await sendNotificationToMany(allRecipients, {
                title: "Thông báo loại trừ lịch học",
                content,
                category: "schedule",
                referenceId: classId,
                referenceType: "class",
              });
            }
          }
        } catch (notiErr) {
          console.error("[ExcludeSessions] Notification error:", notiErr);
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể loại trừ buổi học" });
    }
  });

  // Get exclusions
  app.get(api.classes.exclusions.path, async (req, res) => {
    try {
      const exclusions = await storage.getClassExclusions(req.params.id);
      res.json(exclusions);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể lấy danh sách loại trừ" });
    }
  });

  // Schedule (calendar view)
  app.get("/api/schedule", async (req, res) => {
    try {
      const { from, to, teacherId, locationId } = req.query as Record<string, string>;
      if (!from || !to) return res.status(400).json({ message: "from and to are required" });

      const allowedLocationIds = await getAllowedLocationIds(req);

      // If user has no access to any location, return empty
      if (allowedLocationIds !== null && allowedLocationIds.length === 0) {
        return res.json([]);
      }

      // Determine effective location filter
      let effectiveLocationId: string | undefined = locationId;
      if (locationId && allowedLocationIds !== null && !allowedLocationIds.includes(locationId)) {
        return res.json([]);
      }

      const { db: baseDb, eq: baseEq, and: baseAnd, sql: baseSql, classSessions: baseSessions, classes: baseClasses, shiftTemplates: baseShifts, locations, staff, studentSessions: baseSs, inArray: baseInArray, sessionContents: baseContents } = await import("../storage/base");
      const { classrooms } = await import("@shared/schema");

      const locationConditions = [];
      if (effectiveLocationId) {
        locationConditions.push(baseEq(baseClasses.locationId, effectiveLocationId));
      } else if (allowedLocationIds !== null && allowedLocationIds.length > 0) {
        locationConditions.push(baseInArray(baseClasses.locationId, allowedLocationIds));
      }

      const sessions = await baseDb.select({
        id: baseSessions.id,
        classId: baseSessions.classId,
        classCode: baseClasses.classCode,
        className: baseClasses.name,
        locationId: baseClasses.locationId,
        locationName: locations.name,
        sessionDate: baseSessions.sessionDate,
        weekday: baseSessions.weekday,
        sessionIndex: baseSessions.sessionIndex,
        status: baseSessions.status,
        teacherIds: baseSessions.teacherIds,
        roomId: baseSessions.roomId,
        roomName: classrooms.name,
        shiftStart: baseShifts.startTime,
        shiftEnd: baseShifts.endTime,
        shiftName: baseShifts.name,
        learningFormat: baseSessions.learningFormat,
        classColor: baseClasses.color,
      })
      .from(baseSessions)
      .innerJoin(baseClasses, baseEq(baseSessions.classId, baseClasses.id))
      .innerJoin(locations, baseEq(baseClasses.locationId, locations.id))
      .innerJoin(baseShifts, baseEq(baseSessions.shiftTemplateId, baseShifts.id))
      .leftJoin(classrooms, baseEq(baseSessions.roomId, classrooms.id))
      .where(baseAnd(
        baseSql`${baseSessions.sessionDate} BETWEEN ${from} AND ${to}`,
        ...locationConditions,
      ))
      .orderBy(baseSessions.sessionDate, baseShifts.startTime);

      const allStaff = await baseDb.select({ id: staff.id, fullName: staff.fullName }).from(staff);
      const staffMap = new Map(allStaff.map(s => [s.id, s.fullName]));

      const totalSessionsMap = new Map<string, number>();
      const classTotals = await baseDb.select({
        classId: baseSessions.classId,
        total: baseSql<number>`COUNT(*)::int`,
      }).from(baseSessions).groupBy(baseSessions.classId);
      classTotals.forEach(c => totalSessionsMap.set(c.classId, c.total));

      const sessionIds = sessions.map(s => s.id);
      const enrolledCountMap = new Map<string, number>();
      if (sessionIds.length > 0) {
        const counts = await baseDb.select({
          classSessionId: baseSs.classSessionId,
          count: baseSql<number>`COUNT(*)::int`,
        }).from(baseSs)
          .where(baseSql`${baseSs.classSessionId} = ANY(ARRAY[${baseSql.join(sessionIds.map(id => baseSql`${id}::uuid`), baseSql`, `)}])`)
          .groupBy(baseSs.classSessionId);
        counts.forEach(c => enrolledCountMap.set(c.classSessionId, c.count));
      }

      // Fetch session contents (lessons, homework, tests, curriculum) for all sessions
      type ContentRow = { classSessionId: string; contentType: string; title: string };
      const contentsMap = new Map<string, ContentRow[]>();
      if (sessionIds.length > 0) {
        const contents = await baseDb.select({
          classSessionId: baseContents.classSessionId,
          contentType: baseContents.contentType,
          title: baseContents.title,
        }).from(baseContents)
          .where(baseSql`${baseContents.classSessionId} = ANY(ARRAY[${baseSql.join(sessionIds.map(id => baseSql`${id}::uuid`), baseSql`, `)}])`);
        contents.forEach(c => {
          if (!contentsMap.has(c.classSessionId)) contentsMap.set(c.classSessionId, []);
          contentsMap.get(c.classSessionId)!.push(c);
        });
      }

      const enriched = sessions
        .filter(s => {
          if (teacherId) {
            return s.teacherIds?.includes(teacherId) ?? false;
          }
          return true;
        })
        .map(s => {
          const contents = contentsMap.get(s.id) || [];
          return {
            ...s,
            teachers: (s.teacherIds || []).map(id => staffMap.get(id) || "").filter(Boolean),
            totalSessions: totalSessionsMap.get(s.classId) || 0,
            enrolledCount: enrolledCountMap.get(s.id) || 0,
            classColor: s.classColor || null,
            lessons: contents.filter(c => c.contentType === "lesson" || c.contentType === "Bài học").map(c => c.title),
            homeworks: contents.filter(c => c.contentType === "homework" || c.contentType === "Bài tập về nhà").map(c => c.title),
            tests: contents.filter(c => c.contentType === "test" || c.contentType === "Bài kiểm tra").map(c => c.title),
            curriculums: contents.filter(c => c.contentType === "curriculum" || c.contentType === "Giáo trình").map(c => c.title),
          };
        });

      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Update class session
  app.patch(api.classSessions.update.path, async (req, res) => {
    try {
      const sessionId = req.params.id;

      // Fetch existing session before update for notification comparison + activity log
      const [existingSession] = await db.select({
        classId: classSessions.classId,
        sessionIndex: classSessions.sessionIndex,
        sessionDate: classSessions.sessionDate,
        weekday: classSessions.weekday,
        teacherIds: classSessions.teacherIds,
        shiftTemplateId: classSessions.shiftTemplateId,
      }).from(classSessions).where(eq(classSessions.id, sessionId)).limit(1);

      const result = await storage.updateClassSession(sessionId, {
        ...req.body,
        changedBy: (req.user as any).id
      });

      // Send notifications after successful update
      if (existingSession) {
        try {
          const classId = existingSession.classId;
          const [classInfo] = await db.select({
            name: classes.name,
            classCode: classes.classCode,
            managerIds: classes.managerIds,
          }).from(classes).where(eq(classes.id, classId)).limit(1);

          if (classInfo) {
            const oldTeacherIds: string[] = existingSession.teacherIds ?? [];
            const newTeacherIds: string[] = Array.isArray(req.body.teacherIds) ? req.body.teacherIds : [];

            // Compute labels
            const sessionIdx = existingSession.sessionIndex ?? 1;
            const oldDate = existingSession.sessionDate ?? "";
            const oldWd = SCHEDULE_WEEKDAY_LABELS[existingSession.weekday ?? 0] ?? "";
            const oldDateLabel = formatScheduleDate(oldDate);

            const newDate: string = req.body.sessionDate ?? oldDate;
            const newWdIndex = newDate ? new Date(newDate).getDay() : (existingSession.weekday ?? 0);
            const newWd = SCHEDULE_WEEKDAY_LABELS[newWdIndex] ?? "";
            const newDateLabel = formatScheduleDate(newDate);

            const className = classInfo.name ?? "";
            const classCode = classInfo.classCode ?? "";
            const managerIds: string[] = classInfo.managerIds ?? [];

            // TH1: teachers who were already assigned and are still assigned => notify them + managers
            const continuedTeacherIds = oldTeacherIds.filter(id => newTeacherIds.includes(id));
            const th1StaffIds = [...new Set([...continuedTeacherIds, ...managerIds])];
            const th1UserIds = await resolveStaffUserIds(th1StaffIds);
            if (th1UserIds.length > 0) {
              await sendNotificationToMany(th1UserIds, {
                title: "Thông báo cập nhật lịch học",
                content: `Buổi ${sessionIdx}, ${oldWd} ${oldDateLabel} của lớp ${className} (${classCode}), đã được cập nhật sang ${newWd} ${newDateLabel}`,
                category: "schedule",
                referenceId: classId,
                referenceType: "class",
              });
            }

            // TH2: newly assigned teachers => notify with different message
            const newlyAddedTeacherIds = newTeacherIds.filter(id => !oldTeacherIds.includes(id));
            const th2UserIds = await resolveStaffUserIds(newlyAddedTeacherIds);
            if (th2UserIds.length > 0) {
              await sendNotificationToMany(th2UserIds, {
                title: "Thông báo xếp lịch dạy",
                content: `Bạn vừa được xếp lịch dạy lớp ${className} (${classCode}), Buổi ${sessionIdx} : ${newWd} ${newDateLabel}`,
                category: "schedule",
                referenceId: classId,
                referenceType: "class",
              });
            }
          }
        } catch (notiErr) {
          console.error("[UpdateSession] Notification error:", notiErr);
        }
      }

      res.json(result);

      // Activity log for session update (fire-and-forget)
      if (existingSession) {
        (async () => {
          try {
            const userId = (req.user as any)?.id ?? null;
            const userLocId = await getUserLocationId(req);
            const classId = existingSession.classId;

            const oldTeacherIds: string[] = existingSession.teacherIds ?? [];
            const newTeacherIds: string[] = Array.isArray(req.body.teacherIds) ? req.body.teacherIds : oldTeacherIds;
            const oldShiftId = existingSession.shiftTemplateId;
            const newShiftId = req.body.shiftTemplateId ?? oldShiftId;
            const oldDateRaw = existingSession.sessionDate ?? "";
            const newDateRaw = req.body.sessionDate ?? oldDateRaw;

            // Fetch shift template names
            const shiftIds = [...new Set([oldShiftId, newShiftId].filter(Boolean))];
            const shifts = shiftIds.length > 0
              ? await db.select({ id: shiftTemplates.id, name: shiftTemplates.name, startTime: shiftTemplates.startTime, endTime: shiftTemplates.endTime })
                  .from(shiftTemplates).where(inArray(shiftTemplates.id, shiftIds))
              : [];
            const shiftMap = new Map(shifts.map(s => [s.id, s]));

            // Fetch teacher names
            const allTeacherIds = [...new Set([...oldTeacherIds, ...newTeacherIds])];
            const teachers = allTeacherIds.length > 0
              ? await db.select({ id: staff.id, fullName: staff.fullName, code: staff.code }).from(staff).where(inArray(staff.id, allTeacherIds))
              : [];
            const teacherMap = new Map(teachers.map(t => [t.id, t]));

            const fmtDate = (raw: string) => {
              if (!raw) return "";
              const d = new Date(raw);
              const day = d.getDay();
              const wd = day === 0 ? "CN" : `T${day + 1}`;
              return `${wd}, ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
            };
            const fmtShift = (id: string) => {
              const s = shiftMap.get(id);
              if (!s) return id;
              return `${s.name} (${(s.startTime ?? "").slice(0, 5)} - ${(s.endTime ?? "").slice(0, 5)})`;
            };
            const fmtTeachers = (ids: string[]) =>
              ids.map(id => {
                const t = teacherMap.get(id);
                return t ? `${t.fullName}${t.code ? ` (${t.code})` : ""}` : id;
              }).join(", ") || "—";

            const oldDateFmt = fmtDate(oldDateRaw);
            const newDateFmt = fmtDate(newDateRaw);
            const oldShiftFmt = fmtShift(oldShiftId);
            const newShiftFmt = fmtShift(newShiftId);
            const oldTeacherFmt = fmtTeachers(oldTeacherIds);
            const newTeacherFmt = fmtTeachers(newTeacherIds);

            type LogField = { label: string; oldValue: string; newValue: string; changed: boolean };
            const fields: LogField[] = [
              { label: "Ngày học", oldValue: oldDateFmt, newValue: newDateFmt, changed: oldDateFmt !== newDateFmt },
              { label: "Ca học", oldValue: oldShiftFmt, newValue: newShiftFmt, changed: oldShiftFmt !== newShiftFmt },
              { label: "Giáo viên", oldValue: oldTeacherFmt, newValue: newTeacherFmt, changed: oldTeacherFmt !== newTeacherFmt },
            ];

            const sessionIdx = existingSession.sessionIndex ?? null;
            const oldPayload = JSON.stringify({ sessionIndex: sessionIdx, fields: fields.map(f => ({ label: f.label, value: f.oldValue, changed: false })) });
            const newPayload = JSON.stringify({ sessionIndex: sessionIdx, fields: fields.map(f => ({ label: f.label, value: f.newValue, changed: f.changed })) });

            createActivityLog({
              userId,
              locationId: userLocId ?? null,
              classId,
              action: "Cập nhật buổi",
              oldContent: oldPayload,
              newContent: newPayload,
            }).catch(() => {});
          } catch (logErr) {
            console.error("[UpdateSession] Activity log error:", logErr);
          }
        })();
      }
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể cập nhật buổi học" });
    }
  });

  // Extend students
  app.post(api.classes.extendStudents.path, async (req, res) => {
    try {
      const classId = req.params.id;
      const { studentIds, mode, numSessions, endDate, cycleMode, specificShiftIds, extensionName, autoInvoice, perStudent } = req.body;

      // Snapshot max session index BEFORE extension to detect new sessions afterwards
      const [maxIdxRow] = await db
        .select({ maxIdx: sql<number>`MAX(${classSessions.sessionIndex})` })
        .from(classSessions)
        .where(eq(classSessions.classId, classId));
      const oldMaxIdx = maxIdxRow?.maxIdx ?? 0;

      await storage.extendStudentSessions({
        classId,
        studentIds,
        mode,
        numSessions,
        endDate,
        cycleMode,
        specificShiftIds,
        extensionName,
        autoInvoice,
        perStudent,
        userId: (req.user as any).id
      });
      res.json({ success: true });

      // Fire-and-forget activity log
      (async () => {
        try {
          const userId = (req.user as any)?.id ?? null;
          const userLocId = await getUserLocationId(req);

          // Get class location for log
          const [clsInfo] = await db.select({ locationId: classes.locationId }).from(classes).where(eq(classes.id, classId));

          // Query newly created class sessions (index > oldMaxIdx)
          const newSessions = await db
            .select({
              sessionIndex: classSessions.sessionIndex,
              weekday: classSessions.weekday,
              sessionDate: classSessions.sessionDate,
              shiftTemplateId: classSessions.shiftTemplateId,
              startTime: shiftTemplates.startTime,
            })
            .from(classSessions)
            .leftJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
            .where(and(
              eq(classSessions.classId, classId),
              sql`${classSessions.sessionIndex} > ${oldMaxIdx}`
            ))
            .orderBy(asc(classSessions.sessionIndex));

          // Query student names and codes for the extended students
          const safeStudentIds: string[] = Array.isArray(studentIds) ? studentIds : [];
          const studentMap: Record<string, { name: string; code: string }> = {};
          if (safeStudentIds.length > 0) {
            const studentRows = await db
              .select({ id: students.id, fullName: students.fullName, studentCode: students.studentCode })
              .from(students)
              .where(inArray(students.id, safeStudentIds));
            for (const s of studentRows) {
              studentMap[s.id] = { name: s.fullName ?? "", code: s.studentCode ?? "" };
            }
          }

          // Build per-student autoInvoice info from perStudent array
          const perStudentMap: Record<string, boolean> = {};
          for (const ps of Array.isArray(perStudent) ? perStudent : []) {
            if (ps && ps.studentId) {
              perStudentMap[ps.studentId] = typeof ps.autoInvoice === "boolean" ? ps.autoInvoice : !!autoInvoice;
            }
          }

          const logStudents = safeStudentIds.map((sid: string) => ({
            name: studentMap[sid]?.name ?? "",
            code: studentMap[sid]?.code ?? "",
            autoInvoice: sid in perStudentMap ? perStudentMap[sid] : !!autoInvoice,
          }));

          const logSessions = newSessions.map((s) => ({
            sessionIndex: s.sessionIndex,
            weekday: s.weekday,
            sessionDate: s.sessionDate,
            startTime: s.startTime ?? null,
          }));

          const extensionType = (numSessions && numSessions > 0) ? "sessions" : "date";

          const newContent = JSON.stringify({
            mode: mode ?? "class",
            extensionType,
            numSessions: numSessions ?? null,
            endDate: endDate ?? null,
            cycleMode: cycleMode ?? "all",
            specificShiftIds: Array.isArray(specificShiftIds) ? specificShiftIds : [],
            extensionName: extensionName ?? null,
            sessions: logSessions,
            students: logStudents,
          });

          await createActivityLog({
            userId,
            locationId: userLocId ?? clsInfo?.locationId ?? null,
            classId,
            action: "Gia hạn",
            oldContent: null,
            newContent,
          });
        } catch (logErr) {
          console.error("[ExtendStudents] Activity log error:", logErr);
        }
      })();
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Classes - CRUD
  app.post(api.classes.create.path, async (req, res) => {
    try {
      console.log("Creating class with body:", JSON.stringify(req.body, null, 2));
      const cls = await storage.createClass(req.body);
      res.status(201).json(cls);

      const scheduleConfig = req.body.schedule_config || [];
      const teachersConfig = req.body.teachers_config || [];
      if (teachersConfig.length > 0) {
        sendTeacherAssignedNotification(
          { id: cls.id, name: cls.name },
          scheduleConfig,
          teachersConfig
        ).catch(err => console.error("[TeacherAssignNotify] error:", err));
      }

      // Activity log
      getClassForLog(cls.id).then(async (clsData) => {
        if (!clsData) return;
        const userId = (req.user as any)?.id ?? null;
        const userLocId = await getUserLocationId(req);
        const newContent = buildClassSummary(clsData);
        createActivityLog({
          userId,
          locationId: userLocId ?? clsData.locationId,
          classId: cls.id,
          action: "Thêm mới lớp",
          oldContent: null,
          newContent,
        }).catch(() => {});
      }).catch(() => {});
    } catch (err: any) {
      console.error("Create class error details:", err);
      if (err.message && err.message.includes("classes_class_code_key")) {
        return res.status(400).json({ message: "Mã lớp này đã tồn tại. Vui lòng chọn mã lớp khác." });
      }
      res.status(400).json({
        message: err.message || "Không thể tạo lớp học",
        details: err.stack
      });
    }
  });

  app.patch(api.classes.update.path, async (req, res) => {
    try {
      const classId = req.params.id;
      const oldCls = await getClassForLog(classId);
      const cls = await storage.updateClass(classId, req.body);
      res.json(cls);

      // Activity log (fire-and-forget)
      if (oldCls) {
        const userId = (req.user as any)?.id ?? null;
        getUserLocationId(req).then(async (userLocId) => {
          const diff = await buildClassEditDiff(oldCls, req.body);
          if (!diff) return;
          createActivityLog({
            userId,
            locationId: userLocId ?? oldCls.locationId,
            classId,
            action: "Chỉnh sửa lớp",
            oldContent: diff.oldContent,
            newContent: diff.newContent,
          }).catch(() => {});
        }).catch(() => {});
      }
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể cập nhật lớp học" });
    }
  });

  app.post("/api/classes/check-invoices", async (req, res) => {
    try {
      const { ids } = req.body as { ids: string[] };
      if (!Array.isArray(ids) || ids.length === 0) return res.json({ count: 0 });
      const count = await storage.countClassInvoices(ids);
      res.json({ count });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể kiểm tra hoá đơn" });
    }
  });

  app.delete(api.classes.bulkDelete.path, async (req, res) => {
    try {
      const { ids } = req.body as { ids: string[] };
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "Danh sách id không hợp lệ" });

      // Fetch class info before deleting for logs
      const clsDataList = await Promise.all(ids.map(id => getClassForLog(id)));
      const userId = (req.user as any)?.id ?? null;
      const userLocId = await getUserLocationId(req);

      await storage.deleteClasses(ids);
      res.status(204).send();

      // Activity logs (fire-and-forget)
      for (const clsData of clsDataList) {
        if (!clsData) continue;
        const oldContent = `Lớp ${clsData.name} (${clsData.classCode}) thuộc cơ sở ${clsData.locationName}`;
        const newContent = `Lớp ${clsData.name} (${clsData.classCode}) thuộc cơ sở ${clsData.locationName} vừa được xoá ra khỏi hệ thống`;
        createActivityLog({
          userId,
          locationId: userLocId ?? clsData.locationId,
          classId: null,
          action: "Xoá lớp",
          oldContent,
          newContent,
        }).catch(() => {});
      }
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể xóa lớp học" });
    }
  });

  app.delete(api.classes.delete.path, async (req, res) => {
    try {
      const classId = req.params.id;
      const clsData = await getClassForLog(classId);
      const userId = (req.user as any)?.id ?? null;
      const userLocId = await getUserLocationId(req);

      await storage.deleteClass(classId);
      res.status(204).send();

      // Activity log (fire-and-forget)
      if (clsData) {
        const oldContent = `Lớp ${clsData.name} (${clsData.classCode}) thuộc cơ sở ${clsData.locationName}`;
        const newContent = `Lớp ${clsData.name} (${clsData.classCode}) thuộc cơ sở ${clsData.locationName} vừa được xoá ra khỏi hệ thống`;
        createActivityLog({
          userId,
          locationId: userLocId ?? clsData.locationId,
          classId: null,
          action: "Xoá lớp",
          oldContent,
          newContent,
        }).catch(() => {});
      }
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể xóa lớp học" });
    }
  });

  // Students ending soon - must be BEFORE /api/student-classes to avoid route conflict
  app.get(api.studentClasses.endingSoon.path, async (req, res) => {
    try {
      const {
        page = "1", pageSize = "20", search = "",
        classes: classesParam, maxRemaining, dateFrom = "", dateTo = "", statusFilter = "",
      } = req.query as Record<string, string | string[]>;

      const pageNum = Math.max(1, parseInt(String(page)));
      const pageSizeNum = Math.min(50, Math.max(20, parseInt(String(pageSize))));
      const offsetNum = (pageNum - 1) * pageSizeNum;
      const selectedClasses = classesParam
        ? (Array.isArray(classesParam) ? classesParam : [classesParam]) as string[]
        : [] as string[];

      const allowedLocationIds = req.allowedLocationIds;
      const isSuperAdmin = req.isSuperAdmin;

      if (!isSuperAdmin && allowedLocationIds && allowedLocationIds.length === 0) {
        return res.json({ data: [], total: 0, page: pageNum, pageSize: pageSizeNum, availableClasses: [] });
      }

      const today = new Date().toISOString().split("T")[0];

      let locationClause = sql`1=1`;
      if (!isSuperAdmin && allowedLocationIds && allowedLocationIds.length > 0) {
        locationClause = sql`EXISTS (
          SELECT 1 FROM student_locations sl
          WHERE sl.student_id = sc.student_id
            AND sl.location_id = ANY(${allowedLocationIds}::uuid[])
        )`;
      }

      const searchStr = String(search);
      let searchCond = sql``;
      if (searchStr) {
        const like = `%${searchStr}%`;
        searchCond = sql`AND (b.student_code ILIKE ${like} OR b.student_name ILIKE ${like})`;
      }
      let classCond = sql``;
      if (selectedClasses.length > 0) {
        classCond = sql`AND b.class_code = ANY(ARRAY[${sql.join(selectedClasses.map((c) => sql`${c}`), sql`, `)}])`;
      }
      let maxRemainingCond = sql``;
      if (maxRemaining) {
        maxRemainingCond = sql`AND b.remaining_sessions <= ${parseInt(String(maxRemaining))}`;
      }
      let dateFromCond = sql``;
      if (dateFrom) dateFromCond = sql`AND b.end_date >= ${String(dateFrom)}::date`;
      let dateToCond = sql``;
      if (dateTo) dateToCond = sql`AND b.end_date <= ${String(dateTo)}::date`;
      let statusCond = sql``;
      if (statusFilter === "ending-soon") {
        statusCond = sql`AND b.end_date >= ${today}::date AND b.remaining_sessions < 5`;
      } else if (statusFilter === "active") {
        statusCond = sql`AND b.end_date >= ${today}::date AND b.remaining_sessions >= 5`;
      } else if (statusFilter === "ended") {
        statusCond = sql`AND b.end_date < ${today}::date`;
      }

      const result = await db.execute(sql`
        WITH base AS (
          SELECT
            sc.id,
            sc.student_id,
            sc.class_id,
            sc.status,
            sc.start_date,
            sc.end_date,
            sc.student_status,
            sc.total_sessions,
            sc.attended_sessions,
            (
              SELECT COUNT(*)::int
              FROM student_sessions ss
              INNER JOIN class_sessions cs ON ss.class_session_id = cs.id
              WHERE ss.student_class_id = sc.id
                AND cs.session_date >= ${today}::date
                AND cs.status != 'cancelled'
            ) AS remaining_sessions,
            s.code AS student_code,
            s.full_name AS student_name,
            s.phone AS student_phone,
            s.email AS student_email,
            c.class_code,
            c.name AS class_name
          FROM student_classes sc
          INNER JOIN students s ON sc.student_id = s.id
          INNER JOIN classes c ON sc.class_id = c.id
          WHERE sc.status = 'active'
            AND sc.end_date IS NOT NULL
            AND ${locationClause}
            AND (
              SELECT COUNT(*)::int
              FROM student_sessions ss
              INNER JOIN class_sessions cs ON ss.class_session_id = cs.id
              WHERE ss.student_class_id = sc.id
                AND cs.session_date >= ${today}::date
                AND cs.status != 'cancelled'
            ) <= 10
        )
        SELECT
          b.id,
          b.student_id AS "studentId",
          b.class_id AS "classId",
          b.status,
          b.start_date AS "startDate",
          b.end_date AS "endDate",
          b.student_status AS "studentStatus",
          b.total_sessions AS "totalSessions",
          b.attended_sessions AS "attendedSessions",
          b.remaining_sessions AS "remainingSessions",
          b.student_code AS "studentCode",
          b.student_name AS "studentName",
          b.student_phone AS "studentPhone",
          b.student_email AS "studentEmail",
          b.class_code AS "classCode",
          b.class_name AS "className",
          CASE WHEN b.end_date < ${today}::date THEN 2 WHEN b.remaining_sessions < 5 THEN 0 ELSE 1 END AS status_priority,
          COUNT(*) OVER() AS total_count
        FROM base b
        WHERE 1=1
          ${searchCond}
          ${classCond}
          ${maxRemainingCond}
          ${dateFromCond}
          ${dateToCond}
          ${statusCond}
        ORDER BY status_priority ASC, b.remaining_sessions ASC, b.end_date ASC
        LIMIT ${pageSizeNum} OFFSET ${offsetNum}
      `);

      const classesResult = await db.execute(sql`
        SELECT DISTINCT c.class_code, c.name AS class_name
        FROM student_classes sc
        INNER JOIN classes c ON sc.class_id = c.id
        WHERE sc.status = 'active'
          AND sc.end_date IS NOT NULL
          AND ${locationClause}
          AND (
            SELECT COUNT(*)::int
            FROM student_sessions ss
            INNER JOIN class_sessions cs ON ss.class_session_id = cs.id
            WHERE ss.student_class_id = sc.id
              AND cs.session_date >= ${today}::date
              AND cs.status != 'cancelled'
          ) <= 10
        ORDER BY c.class_code
      `);

      const rows = result.rows as any[];
      const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
      const data = rows.map(({ status_priority, total_count, ...rest }) => rest);
      const availableClasses = (classesResult.rows as any[]).map((r) => ({
        code: r.class_code,
        label: r.class_name || r.class_code,
      }));

      res.json({ data, total, page: pageNum, pageSize: pageSizeNum, availableClasses });
    } catch (err: any) {
      console.error("Students ending soon error:", err);
      res.status(400).json({ message: err.message || "Lỗi khi tải dữ liệu" });
    }
  });

  // Student Classes - learning overview
  app.get(api.studentClasses.studentClassList.path, async (req, res) => {
    try {
      const allowedLocationIds = req.allowedLocationIds;
      const isSuperAdmin = req.isSuperAdmin;

      if (!isSuperAdmin && allowedLocationIds && allowedLocationIds.length === 0) {
        return res.json([]);
      }

      const conditions: any[] = [];
      if (!isSuperAdmin && allowedLocationIds && allowedLocationIds.length > 0) {
        conditions.push(sql`EXISTS (SELECT 1 FROM ${studentLocations} WHERE ${studentLocations.studentId} = ${students.id} AND ${studentLocations.locationId} IN ${allowedLocationIds})`);
      }

      const results = await db
        .select({
          id: studentClasses.id,
          studentId: studentClasses.studentId,
          classId: studentClasses.classId,
          status: studentClasses.status,
          startDate: studentClasses.startDate,
          endDate: studentClasses.endDate,
          studentStatus: studentClasses.studentStatus,
          totalSessions: studentClasses.totalSessions,
          attendedSessions: studentClasses.attendedSessions,
          remainingSessions: studentClasses.remainingSessions,
          studentCode: students.code,
          studentName: students.fullName,
          studentPhone: students.phone,
          studentEmail: students.email,
          classCode: classes.classCode,
          className: classes.name,
        })
        .from(studentClasses)
        .innerJoin(students, eq(studentClasses.studentId, students.id))
        .innerJoin(classes, eq(studentClasses.classId, classes.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(students.code, classes.classCode);

      res.json(results);
    } catch (err: any) {
      console.error("Student classes error:", err);
      res.status(400).json({ message: err.message || "Lỗi khi tải dữ liệu" });
    }
  });

  // Remove students from sessions
  app.post(api.students.removeFromSessions.path, async (req, res) => {
    try {
      const result = await storage.removeStudentFromSessions(req.body);
      res.json({ success: true, hasAttendedSessions: result.hasAttendedSessions });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể kiểm tra buổi học" });
    }
  });

  app.post(api.students.removeFromSessionsConfirm.path, async (req, res) => {
    try {
      const { studentIds, studentClassId, fromSessionOrder, toSessionOrder, deleteOnlyUnattended } = req.body;

      // --- Pre-fetch before removal for notification ---
      let notificationClosure: (() => Promise<void>) | null = null;
      try {
        const [sc] = await db.select({ classId: studentClasses.classId })
          .from(studentClasses).where(eq(studentClasses.id, studentClassId)).limit(1);

        if (sc) {
          const classId = sc.classId;

          const [classInfo] = await db.select({
            name: classes.name,
            managerIds: classes.managerIds,
            teacherIds: classes.teacherIds,
          }).from(classes).where(eq(classes.id, classId)).limit(1);

          // Look up from/to class sessions directly by sessionIndex
          const [fromCS] = await db.select({
            sessionIndex: classSessions.sessionIndex,
            sessionDate: classSessions.sessionDate,
            weekday: classSessions.weekday,
          }).from(classSessions)
            .where(and(
              eq(classSessions.classId, classId),
              eq(classSessions.sessionIndex, fromSessionOrder),
            )).limit(1);

          const [toCS] = await db.select({
            sessionIndex: classSessions.sessionIndex,
            sessionDate: classSessions.sessionDate,
            weekday: classSessions.weekday,
          }).from(classSessions)
            .where(and(
              eq(classSessions.classId, classId),
              eq(classSessions.sessionIndex, toSessionOrder),
            )).limit(1);

          // Resolve students info
          const studentRows = await db.select({ id: students.id, userId: students.userId, fullName: students.fullName, code: students.code })
            .from(students).where(inArray(students.id, studentIds));

          const staffIds = [
            ...(classInfo?.managerIds ?? []),
            ...(classInfo?.teacherIds ?? []),
          ].filter(Boolean);

          const staffUserIds = await resolveStaffUserIds(staffIds);
          const className = classInfo?.name ?? "";

          notificationClosure = async () => {
            for (const student of studentRows) {
              try {
                const recipientUserIds = [...new Set([...staffUserIds])];
                if (!recipientUserIds.length) continue;

                const wd1 = SCHEDULE_WEEKDAY_LABELS[fromCS?.weekday ?? 0] ?? "";
                const d1 = formatScheduleDate(fromCS?.sessionDate);
                const idx1 = fromCS?.sessionIndex ?? fromSessionOrder;
                const wd2 = SCHEDULE_WEEKDAY_LABELS[toCS?.weekday ?? 0] ?? "";
                const d2 = formatScheduleDate(toCS?.sessionDate);
                const idx2 = toCS?.sessionIndex ?? toSessionOrder;

                const rangeLabel = idx1 === idx2
                  ? `Buổi ${idx1}, ${wd1} ${d1}`
                  : `Buổi ${idx1}, ${wd1} ${d1} - Buổi ${idx2}, ${wd2} ${d2}`;

                const content = `Học viên: ${student.fullName} (${student.code}) vừa được xoá ra khỏi Lớp ${className}, từ ${rangeLabel}`;

                await sendNotificationToMany(recipientUserIds, {
                  title: "Thông báo lịch học",
                  content,
                  category: "schedule",
                  referenceId: classId,
                  referenceType: "class",
                });
              } catch (innerErr) {
                console.error("[RemoveStudentNotify] Error for student", student.id, innerErr);
              }
            }
          };
        }
      } catch (preFetchErr) {
        console.error("[RemoveStudentNotify] Pre-fetch error:", preFetchErr);
      }

      await storage.removeStudentFromSessionsConfirm(req.body);

      if (notificationClosure) {
        notificationClosure().catch(err => console.error("[RemoveStudentNotify] Post-confirm error:", err));
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể xoá học viên khỏi buổi học" });
    }
  });

  // Session Contents
  app.get(api.classSessions.contents.path, async (req, res) => {
    try {
      const contents = await storage.getSessionContents(req.params.classSessionId);
      res.json(contents);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể lấy nội dung buổi học" });
    }
  });

  app.post(api.classSessions.createContent.path, async (req, res) => {
    try {
      const { insertSessionContentSchema } = await import("@shared/schema");
      const classSessionId = req.params.classSessionId;
      const skipLog = req.query.skipLog === "true";
      const existingContents = skipLog ? [] : await storage.getSessionContents(classSessionId);
      const input = insertSessionContentSchema.parse({
        ...req.body,
        classSessionId,
        displayOrder: req.body.displayOrder || 0
      });
      const content = await storage.createSessionContent(input);
      res.status(201).json(content);

      if (!skipLog) {
        (async () => {
          try {
            const session = await storage.getClassSession(classSessionId);
            if (!session) return;
            const userId = (req.user as any)?.id ?? null;
            const userLocId = await getUserLocationId(req);
            const sessionInfo = await getSessionInfoForLog(classSessionId);
            const oldList = existingContents.map(c => ({ title: c.title, type: c.contentType }));
            const newItem = [{ title: content.title, type: content.contentType }];
            createActivityLog({
              userId,
              locationId: userLocId ?? null,
              classId: session.classId,
              action: "Thêm Nội dung",
              oldContent: oldList.length > 0 ? buildContentWithSession(oldList, sessionInfo) : null,
              newContent: buildContentWithSession(newItem, sessionInfo),
            }).catch(() => {});
          } catch {}
        })();
      }
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        console.error("Validation errors:", err.errors);
        return res.status(400).json(err.errors);
      }
      console.error("Create content error:", err);
      res.status(400).json({ message: err.message || "Không thể tạo nội dung buổi học" });
    }
  });

  app.delete(api.classSessions.deleteContent.path, async (req, res) => {
    try {
      const classSessionId = req.params.classSessionId;
      const contents = await storage.getSessionContents(classSessionId);
      for (const content of contents) {
        await storage.deleteSessionContent(content.id);
      }
      res.status(204).send();
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể xoá nội dung buổi học" });
    }
  });

  app.delete("/api/class-sessions/:classSessionId/contents/:contentId", async (req, res) => {
    try {
      const { classSessionId, contentId } = req.params;
      const skipLog = req.query.skipLog === "true";
      const existingContents = skipLog ? [] : await storage.getSessionContents(classSessionId);
      const deletedItem = skipLog ? null : existingContents.find(c => c.id === contentId);
      await storage.deleteSessionContent(contentId);
      res.status(204).send();

      if (!skipLog && deletedItem) {
        (async () => {
          try {
            const session = await storage.getClassSession(classSessionId);
            if (!session) return;
            const userId = (req.user as any)?.id ?? null;
            const userLocId = await getUserLocationId(req);
            const sessionInfo = await getSessionInfoForLog(classSessionId);
            const oldList = existingContents.map(c => ({ title: c.title, type: c.contentType }));
            const removedItem = [{ title: deletedItem.title, type: deletedItem.contentType }];
            createActivityLog({
              userId,
              locationId: userLocId ?? null,
              classId: session.classId,
              action: "Xoá Nội dung",
              oldContent: buildContentWithSession(oldList, sessionInfo),
              newContent: buildContentWithSession(removedItem, sessionInfo),
            }).catch(() => {});
          } catch {}
        })();
      }
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể xoá nội dung" });
    }
  });

  // Batch content change log endpoint — called once after all adds/deletes to create one unified log entry
  app.post("/api/class-sessions/:classSessionId/log-content-changes", async (req, res) => {
    try {
      const { classSessionId } = req.params;
      const { added = [], deleted = [], existingBefore = [] } = req.body as {
        added: { title: string; type: string }[];
        deleted: { title: string; type: string }[];
        existingBefore: { title: string; type: string }[];
      };

      if (added.length === 0 && deleted.length === 0) return res.json({ ok: true });

      const session = await storage.getClassSession(classSessionId);
      if (!session) return res.json({ ok: true });

      const userId = (req.user as any)?.id ?? null;
      const userLocId = await getUserLocationId(req);
      const sessionInfo = await getSessionInfoForLog(classSessionId);

      if (added.length > 0) {
        await createActivityLog({
          userId,
          locationId: userLocId ?? null,
          classId: session.classId,
          action: "Thêm Nội dung",
          oldContent: existingBefore.length > 0 ? buildContentWithSession(existingBefore, sessionInfo) : null,
          newContent: buildContentWithSession(added, sessionInfo),
        });
      }

      if (deleted.length > 0) {
        await createActivityLog({
          userId,
          locationId: userLocId ?? null,
          classId: session.classId,
          action: "Xoá Nội dung",
          oldContent: buildContentWithSession(existingBefore, sessionInfo),
          newContent: buildContentWithSession(deleted, sessionInfo),
        });
      }

      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể ghi nhật ký" });
    }
  });

  // GET personal student contents for a session
  app.get("/api/class-sessions/:classSessionId/student-contents", async (req, res) => {
    try {
      const { classSessionId } = req.params;

      // Get all session content records for this session
      const allContents = await db.select().from(sessionContents).where(eq(sessionContents.classSessionId, classSessionId));
      if (allContents.length === 0) return res.json([]);

      const contentIds = allContents.map((c) => c.id);

      // Get all student links
      const links = await db.select().from(studentSessionContents).where(inArray(studentSessionContents.sessionContentId, contentIds));

      const result = links.map((link) => {
        const content = allContents.find((c) => c.id === link.sessionContentId);
        return {
          studentSessionContentId: link.id,
          sessionContentId: link.sessionContentId,
          studentId: link.studentId,
          contentType: content?.contentType ?? "",
          title: content?.title ?? "",
          description: content?.description ?? null,
          resourceUrl: content?.resourceUrl ?? null,
        };
      });

      res.json(result);
    } catch (err: any) {
      console.error("GET student-contents error:", err);
      res.status(400).json({ message: err.message || "Không thể lấy nội dung học viên" });
    }
  });

  // Personal student content: create session content then link to student
  app.post("/api/class-sessions/:classSessionId/student-contents", async (req, res) => {
    try {
      const { classSessionId } = req.params;
      const { studentId, contentType, title, description, resourceUrl } = req.body;
      if (!studentId || !contentType || !title) {
        return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
      }
      const { db, eq, and, studentSessionContents } = await import("../storage/base");
      // Create a session content record first
      const sessionContent = await storage.createSessionContent({
        classSessionId,
        contentType,
        title,
        description: description || null,
        resourceUrl: resourceUrl || null,
        displayOrder: 0,
      });
      // Link it to the student
      const [record] = await db
        .insert(studentSessionContents)
        .values({ sessionContentId: sessionContent.id, studentId })
        .returning();
      res.status(201).json({ ...record, sessionContent });
    } catch (err: any) {
      console.error("Create student content error:", err);
      res.status(400).json({ message: err.message || "Không thể tạo nội dung học viên" });
    }
  });

  // Notify students about content assignment
  app.post("/api/class-sessions/:classSessionId/notify-content", async (req, res) => {
    try {
      const { classSessionId } = req.params;
      const { contents } = req.body as { contents: { contentType: string; title: string }[] };
      if (!Array.isArray(contents) || contents.length === 0) {
        return res.status(400).json({ message: "Không có nội dung để thông báo" });
      }
      const actorUserId = (req as any).user?.id;
      sendContentNotification(classSessionId, contents, actorUserId).catch(() => {});
      res.status(200).json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể gửi thông báo" });
    }
  });

  // Apply Program / Criteria to session range
  app.post("/api/classes/:classId/apply-program", async (req, res) => {
    try {
      const { classId } = req.params;
      const { programId, fromSessionIndex, toSessionIndex } = req.body;
      if (!programId || fromSessionIndex == null || toSessionIndex == null) {
        return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
      }
      const { db: baseDb, eq: baseEq, and: baseAnd, sql: baseSql, classSessions: baseSessions } = await import("../storage/base");
      const sessions = await baseDb
        .select({ id: baseSessions.id, sessionIndex: baseSessions.sessionIndex })
        .from(baseSessions)
        .where(
          baseAnd(
            baseEq(baseSessions.classId, classId),
            baseSql`${baseSessions.sessionIndex} BETWEEN ${fromSessionIndex} AND ${toSessionIndex}`
          )
        )
        .orderBy(baseSessions.sessionIndex);
      if (sessions.length === 0) {
        return res.status(400).json({ message: "Không có buổi học trong khoảng đã chọn" });
      }
      const programContents = await storage.getCourseProgramContents(programId);
      const sortedContents = programContents.sort((a, b) => parseFloat(String(a.sessionNumber)) - parseFloat(String(b.sessionNumber)));

      // Group contents by session number (1-based)
      const contentsBySessionNum: Record<number, typeof sortedContents> = {};
      for (const pc of sortedContents) {
        const sn = Math.round(parseFloat(String(pc.sessionNumber)));
        if (!contentsBySessionNum[sn]) contentsBySessionNum[sn] = [];
        contentsBySessionNum[sn].push(pc);
      }

      for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i];
        await baseDb.update(baseSessions).set({ programId }).where(baseEq(baseSessions.id, session.id));

        // Delete all existing contents for this session
        const existingContents = await storage.getSessionContents(session.id);
        for (const ec of existingContents) {
          await storage.deleteSessionContent(ec.id);
        }

        // Session at position i (0-based) maps to program session number i+1
        const programSessionNum = i + 1;
        const contentsForSession = contentsBySessionNum[programSessionNum] || [];
        for (let j = 0; j < contentsForSession.length; j++) {
          const pc = contentsForSession[j];
          await storage.createSessionContent({
            classSessionId: session.id,
            contentType: pc.type || "curriculum",
            title: pc.title,
            description: pc.content || null,
            resourceUrl: pc.id,
            displayOrder: j,
          });
        }
      }
      res.json({ message: "Áp dụng chương trình thành công", sessionsUpdated: sessions.length });
    } catch (err: any) {
      console.error("Apply program error:", err);
      res.status(500).json({ message: err.message || "Không thể áp dụng chương trình" });
    }
  });

  app.post("/api/classes/:classId/apply-criteria", async (req, res) => {
    try {
      const { classId } = req.params;
      const { criteriaId, fromSessionIndex, toSessionIndex } = req.body;
      if (!criteriaId || fromSessionIndex == null || toSessionIndex == null) {
        return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
      }
      const { db: baseDb, eq: baseEq, and: baseAnd, sql: baseSql, classSessions: baseSessions } = await import("../storage/base");
      const sessions = await baseDb
        .select({ id: baseSessions.id, evaluationCriteriaIds: baseSessions.evaluationCriteriaIds })
        .from(baseSessions)
        .where(
          baseAnd(
            baseEq(baseSessions.classId, classId),
            baseSql`${baseSessions.sessionIndex} BETWEEN ${fromSessionIndex} AND ${toSessionIndex}`
          )
        );
      for (const session of sessions) {
        await baseDb.update(baseSessions).set({ evaluationCriteriaIds: [criteriaId] }).where(baseEq(baseSessions.id, session.id));
      }
      res.json({ message: "Áp dụng tiêu chí thành công" });
    } catch (err: any) {
      console.error("Apply criteria error:", err);
      res.status(500).json({ message: err.message || "Không thể áp dụng tiêu chí" });
    }
  });

  app.post("/api/classes/:classId/apply-score-sheet", async (req, res) => {
    try {
      const { classId } = req.params;
      const { scoreSheetId, fromSessionIndex, toSessionIndex } = req.body;
      if (!scoreSheetId || fromSessionIndex == null || toSessionIndex == null) {
        return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
      }
      const { db: baseDb, eq: baseEq, and: baseAnd, sql: baseSql, classSessions: baseSessions } = await import("../storage/base");
      const sessions = await baseDb
        .select({ id: baseSessions.id })
        .from(baseSessions)
        .where(
          baseAnd(
            baseEq(baseSessions.classId, classId),
            baseSql`${baseSessions.sessionIndex} BETWEEN ${fromSessionIndex} AND ${toSessionIndex}`
          )
        );
      for (const session of sessions) {
        await baseDb.update(baseSessions).set({ scoreSheetId }).where(baseEq(baseSessions.id, session.id));
      }
      res.json({ message: "Áp dụng bảng điểm thành công" });
    } catch (err: any) {
      console.error("Apply score sheet error:", err);
      res.status(500).json({ message: err.message || "Không thể áp dụng bảng điểm" });
    }
  });

  // ============================================================
  // GRADE BOOKS (Sổ điểm lớp)
  // ============================================================

  app.get("/api/classes/:classId/grade-books", async (req, res) => {
    try {
      const { classId } = req.params;
      const result = await db.execute(sql`
        SELECT 
          gb.id,
          gb.class_id,
          gb.title,
          gb.score_sheet_id,
          gb.session_id,
          gb.published,
          gb.created_by,
          gb.updated_by,
          gb.created_at,
          gb.updated_at,
          ss.name AS score_sheet_name,
          COALESCE(cs.full_name, cu.username) AS created_by_name,
          COALESCE(us.full_name, uu.username) AS updated_by_name
        FROM class_grade_books gb
        LEFT JOIN score_sheets ss ON ss.id = gb.score_sheet_id
        LEFT JOIN users cu ON cu.id = gb.created_by
        LEFT JOIN staff cs ON cs.user_id = gb.created_by
        LEFT JOIN users uu ON uu.id = gb.updated_by
        LEFT JOIN staff us ON us.user_id = gb.updated_by
        WHERE gb.class_id = ${classId}
        ORDER BY gb.created_at DESC
      `);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/classes/:classId/grade-books", async (req, res) => {
    try {
      const { classId } = req.params;
      const userId = (req.user as any)?.id;
      const body = z.object({
        title: z.string().min(1),
        scoreSheetId: z.string().uuid(),
        sessionId: z.string().uuid().nullable().optional(),
        published: z.boolean().optional().default(false),
        studentComments: z.record(z.string()).optional().default({}),
        scores: z.array(z.object({
          studentId: z.string().uuid(),
          categoryId: z.string().uuid(),
          score: z.string().nullable().optional(),
        })).optional().default([]),
      }).parse(req.body);

      const [book] = await db.insert(classGradeBooks).values({
        classId,
        title: body.title,
        scoreSheetId: body.scoreSheetId,
        sessionId: body.sessionId || null,
        published: body.published ?? false,
        createdBy: userId || null,
        updatedBy: userId || null,
      }).returning();

      if (body.scores.length > 0) {
        await db.insert(classGradeBookScores).values(
          body.scores.map(s => ({
            gradeBookId: book.id,
            studentId: s.studentId,
            categoryId: s.categoryId,
            score: s.score || null,
          }))
        );
      }

      const commentEntries = Object.entries(body.studentComments || {}).filter(([, c]) => c?.trim());
      if (commentEntries.length > 0) {
        await db.insert(classGradeBookStudentComments).values(
          commentEntries.map(([studentId, comment]) => ({
            gradeBookId: book.id,
            studentId,
            comment: comment.trim(),
          }))
        );
      }

      res.status(201).json(book);

      if (body.published) {
        sendGradeBookPublishedNotification(classId, book.id, body.title, userId, body.scores.map(s => s.studentId))
          .catch(err => console.error("[GradeBookNotify] POST error:", err));
      }
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/classes/:classId/grade-books/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const scores = await db
        .select()
        .from(classGradeBookScores)
        .where(eq(classGradeBookScores.gradeBookId, id));
      const commentRows = await db
        .select()
        .from(classGradeBookStudentComments)
        .where(eq(classGradeBookStudentComments.gradeBookId, id));
      const studentComments: Record<string, string> = {};
      commentRows.forEach(row => { studentComments[row.studentId] = row.comment; });
      res.json({ scores, studentComments });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/classes/:classId/grade-books/:id", async (req, res) => {
    try {
      const { classId, id } = req.params;
      const userId = (req.user as any)?.id;
      const body = z.object({
        title: z.string().min(1).optional(),
        scoreSheetId: z.string().uuid().optional(),
        sessionId: z.string().uuid().nullable().optional(),
        published: z.boolean().optional(),
        studentComments: z.record(z.string()).optional(),
        scores: z.array(z.object({
          studentId: z.string().uuid(),
          categoryId: z.string().uuid(),
          score: z.string().nullable().optional(),
        })).optional(),
      }).parse(req.body);

      // Fetch current state before update to detect publish transition
      const [existing] = await db.select({ published: classGradeBooks.published, title: classGradeBooks.title, classId: classGradeBooks.classId })
        .from(classGradeBooks).where(eq(classGradeBooks.id, id)).limit(1);
      const wasPublished = existing?.published ?? false;

      const updateData: any = { updatedBy: userId, updatedAt: new Date() };
      if (body.title) updateData.title = body.title;
      if (body.scoreSheetId) updateData.scoreSheetId = body.scoreSheetId;
      if ('sessionId' in body) updateData.sessionId = body.sessionId;
      if ('published' in body) updateData.published = body.published;

      const [updated] = await db.update(classGradeBooks)
        .set(updateData)
        .where(eq(classGradeBooks.id, id))
        .returning();

      if (body.scores) {
        await db.delete(classGradeBookScores).where(eq(classGradeBookScores.gradeBookId, id));
        if (body.scores.length > 0) {
          await db.insert(classGradeBookScores).values(
            body.scores.map(s => ({
              gradeBookId: id,
              studentId: s.studentId,
              categoryId: s.categoryId,
              score: s.score || null,
            }))
          );
        }
      }

      if (body.studentComments !== undefined) {
        await db.delete(classGradeBookStudentComments).where(eq(classGradeBookStudentComments.gradeBookId, id));
        const commentEntries = Object.entries(body.studentComments).filter(([, c]) => c?.trim());
        if (commentEntries.length > 0) {
          await db.insert(classGradeBookStudentComments).values(
            commentEntries.map(([studentId, comment]) => ({
              gradeBookId: id,
              studentId,
              comment: comment.trim(),
            }))
          );
        }
      }

      res.json(updated);

      // Send notification only when transitioning from unpublished → published
      const nowPublished = 'published' in body ? body.published : wasPublished;
      if (nowPublished && !wasPublished) {
        const resolvedTitle = body.title ?? existing?.title ?? "";
        const resolvedClassId = existing?.classId ?? classId;
        // Get student IDs from the updated scores (or re-query if scores not in this request)
        let studentIds: string[] = [];
        if (body.scores) {
          studentIds = [...new Set(body.scores.map(s => s.studentId))];
        } else {
          const scoreRows = await db.select({ studentId: classGradeBookScores.studentId })
            .from(classGradeBookScores).where(eq(classGradeBookScores.gradeBookId, id));
          studentIds = [...new Set(scoreRows.map(r => r.studentId))];
        }
        sendGradeBookPublishedNotification(resolvedClassId, id, resolvedTitle, userId, studentIds)
          .catch(err => console.error("[GradeBookNotify] PUT error:", err));
      }
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/classes/:classId/grade-books/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await db.delete(classGradeBooks).where(eq(classGradeBooks.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Student Session Contents (Personalized content for individual students)
  app.post(api.classSessions.createStudentContent.path, async (req, res) => {
    try {
      const { insertStudentSessionContentSchema } = await import("@shared/schema");
      const input = insertStudentSessionContentSchema.parse(req.body);
      const content = await storage.createStudentSessionContent(input);
      res.status(201).json(content);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(400).json({ message: err.message || "Không thể tạo nội dung cá nhân" });
    }
  });

  // GET /api/learning-overview/grade-books
  app.get("/api/learning-overview/grade-books", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page || "1")));
      const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || "20"))));
      const offset = (page - 1) * pageSize;
      const search = String(req.query.search || "").trim();
      const locationId = String(req.query.locationId || "").trim();
      const publishedFilter = req.query.published;

      let whereClauses = sql`1=1`;
      if (search) whereClauses = sql`${whereClauses} AND (gb.title ILIKE ${'%' + search + '%'} OR c.name ILIKE ${'%' + search + '%'})`;
      if (locationId) whereClauses = sql`${whereClauses} AND c.location_id = ${locationId}::uuid`;
      if (publishedFilter === "true") whereClauses = sql`${whereClauses} AND gb.published = TRUE`;
      else if (publishedFilter === "false") whereClauses = sql`${whereClauses} AND gb.published = FALSE`;

      const [countRow] = (await db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM class_grade_books gb
        JOIN classes c ON c.id = gb.class_id
        WHERE ${whereClauses}
      `)).rows as any[];

      const rows = (await db.execute(sql`
        SELECT
          gb.id,
          gb.class_id,
          gb.title,
          gb.published,
          gb.created_at,
          gb.updated_at,
          c.name AS class_name,
          l.name AS location_name,
          ss.name AS score_sheet_name,
          COALESCE(cs.full_name, cu.username) AS created_by_name,
          COALESCE(us.full_name, uu.username) AS updated_by_name
        FROM class_grade_books gb
        JOIN classes c ON c.id = gb.class_id
        LEFT JOIN locations l ON l.id = c.location_id
        LEFT JOIN score_sheets ss ON ss.id = gb.score_sheet_id
        LEFT JOIN users cu ON cu.id = gb.created_by
        LEFT JOIN staff cs ON cs.user_id = gb.created_by
        LEFT JOIN users uu ON uu.id = gb.updated_by
        LEFT JOIN staff us ON us.user_id = gb.updated_by
        WHERE ${whereClauses}
        ORDER BY gb.created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `)).rows as any[];

      const locationRows = (await db.execute(sql`
        SELECT DISTINCT l.id, l.name FROM locations l
        JOIN classes c ON c.location_id = l.id
        JOIN class_grade_books gb ON gb.class_id = c.id
        ORDER BY l.name
      `)).rows as any[];

      res.json({
        data: rows.map((r) => ({
          id: r.id,
          classId: r.class_id,
          title: r.title,
          published: r.published,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          className: r.class_name,
          locationName: r.location_name || "—",
          scoreSheetName: r.score_sheet_name || "—",
          createdByName: r.created_by_name || "—",
          updatedByName: r.updated_by_name || "—",
        })),
        total: countRow?.total ?? 0,
        page,
        pageSize,
        locations: locationRows.map((l) => ({ id: l.id, name: l.name })),
      });
    } catch (err: any) {
      console.error("Grade books overview error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải bảng điểm" });
    }
  });

  // GET /api/learning-overview/cho-bu-bao-luu
  app.get("/api/learning-overview/cho-bu-bao-luu", async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT
          ss.id,
          s.full_name AS student_name,
          s.code AS student_code,
          c.id AS class_id,
          c.name AS class_name,
          cs.session_index,
          cs.session_date,
          st.name AS shift_name,
          st.start_time,
          st.end_time,
          ss.attendance_status,
          (
            SELECT string_agg(sf.full_name, ', ')
            FROM staff sf
            WHERE sf.id = ANY(cs.teacher_ids)
          ) AS teacher_names
        FROM student_sessions ss
        JOIN students s ON s.id = ss.student_id
        JOIN classes c ON c.id = ss.class_id
        JOIN class_sessions cs ON cs.id = ss.class_session_id
        LEFT JOIN shift_templates st ON st.id = cs.shift_template_id
        WHERE ss.attendance_status IN ('makeup_wait', 'paused')
        ORDER BY c.name, cs.session_date DESC, s.full_name
      `);

      // Group by class
      const classMap = new Map<string, { classId: string; className: string; rows: any[] }>();
      for (const row of result.rows as any[]) {
        if (!classMap.has(row.class_id)) {
          classMap.set(row.class_id, { classId: row.class_id, className: row.class_name, rows: [] });
        }
        classMap.get(row.class_id)!.rows.push({
          id: row.id,
          studentName: row.student_name,
          studentCode: row.student_code,
          sessionIndex: row.session_index,
          sessionDate: row.session_date,
          shiftName: row.shift_name || "—",
          startTime: row.start_time || null,
          endTime: row.end_time || null,
          attendanceStatus: row.attendance_status,
          teacherNames: row.teacher_names || "—",
        });
      }

      const classes = Array.from(classMap.values()).map((cls) => ({
        ...cls,
        totalSessions: cls.rows.length,
      }));

      res.json(classes);
    } catch (err: any) {
      console.error("Cho bu bao luu error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải dữ liệu" });
    }
  });

  // ─── Activity Logs ────────────────────────────────────────────────────────
  app.get("/api/activity-logs", async (req, res) => {
    try {
      const classId = req.query.classId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 200;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const logs = await getActivityLogs({ classId, limit, offset });
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Lỗi khi tải nhật ký" });
    }
  });

  app.post("/api/activity-logs", async (req, res) => {
    try {
      const userId = (req.user as any)?.id ?? null;
      const body = z.object({
        locationId: z.string().uuid().optional().nullable(),
        classId: z.string().uuid().optional().nullable(),
        action: z.string().min(1),
        oldContent: z.string().optional().nullable(),
        newContent: z.string().optional().nullable(),
      }).parse(req.body);
      const log = await createActivityLog({ userId, ...body });
      res.status(201).json(log);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Lỗi khi tạo nhật ký" });
    }
  });
}

export { createActivityLog };
