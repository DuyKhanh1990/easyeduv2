import type { Express } from "express";
import { storage } from "../storage";
import { createActivityLog, getActivityLogs } from "../storage/activity-log.storage";
import { getClassFormatSummary, getClassStatusSummary, getNewClassesSummary, getClassesByLocationSummary, getMonthlyAttendanceRate, getClassesByTeacherSummary, getSessionsByTeacherSummary } from "../storage/class.storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { db, pool } from "../db";
import { classSessions, studentSessions, students, classes, studentClasses, staff, staffAssignments, studentLocations, classGradeBooks, classGradeBookScores, classGradeBookStudentComments, users, scoreSheets, scoreSheetItems, scoreCategories, locations, invoiceSessionAllocations, sessionContents, studentSessionContents, shiftTemplates, invoices, courseFeePackages, evaluationCriteria, courseProgramContents, examSubmissions, centerConfig, publicHolidays } from "@shared/schema";
import { eq, and, sql, inArray, avg, between, gte, lte, gt, desc, asc, or, ilike, isNotNull, ne } from "drizzle-orm";
import { sendAttendanceNotification, sendReviewNotification, sendContentNotification } from "../lib/attendance-notification";
import { enforceAttendanceTimeLimit, getStaffRoleIds } from "../lib/attendance-limit";
import { sendNotificationToMany } from "../lib/notification";
import { emitToUser } from "../lib/ws-hub";
import { sendUpdateSessionNotification, sendCancelSessionNotification, sendUpdateCycleNotification, sendExcludeDatesNotification } from "../lib/schedule-notification";
import { notificationService } from "../application/notification/services/NotificationService";

async function resolveStaffFullName(userId: string | undefined | null): Promise<string | null> {
  if (!userId) return null;
  const [row] = await db.select({ fullName: staff.fullName }).from(staff).where(eq(staff.userId, userId)).limit(1);
  return row?.fullName ?? null;
}

/** Thin wrapper: resolves roleIds from req then delegates to the shared enforcer. */
async function checkAttendanceLimitForSession(classSessionId: string, req: any): Promise<void> {
  const userRoleIds: string[] = req.roleIds ?? [];
  await enforceAttendanceTimeLimit(classSessionId, userRoleIds, req.isSuperAdmin ?? false);
}

const CLASSES_RESOURCE = "/classes";

async function getClassPermissions(req: any) {
  if (req.isSuperAdmin) {
    return { canView: true, canViewAll: true, canCreate: true, canEdit: true, canDelete: true };
  }
  return storage.getEffectivePermissions(req.roleIds || [], CLASSES_RESOURCE);
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

/**
 * Fire-and-forget: push "calendar_updated" qua WebSocket đến tất cả giáo viên
 * và học viên của một lớp để client tự invalidate cache lịch cá nhân.
 * Không bao giờ throw — mọi lỗi được nuốt im lặng.
 */
async function emitCalendarUpdateForClass(classId: string): Promise<void> {
  try {
    const [classData] = await db
      .select({ teacherIds: classes.teacherIds })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    // Gom teacher IDs từ class + từ các sessions (sessions có thể có GV khác với class default)
    const sessionTeacherRows = await db
      .select({ teacherIds: classSessions.teacherIds })
      .from(classSessions)
      .where(and(eq(classSessions.classId, classId), sql`${classSessions.status} != 'cancelled'`))
      .limit(100);

    const allStaffIds = [
      ...(classData?.teacherIds ?? []),
      ...sessionTeacherRows.flatMap(s => s.teacherIds ?? []),
    ];
    const uniqueStaffIds = [...new Set(allStaffIds)];

    const [staffUserIds, studentUserIds] = await Promise.all([
      uniqueStaffIds.length > 0 ? resolveStaffUserIds(uniqueStaffIds) : Promise.resolve([]),
      resolveEnrolledStudentUserIds(classId),
    ]);

    const allUserIds = [...new Set([...staffUserIds, ...studentUserIds])];
    const payload = { type: "calendar_updated" };
    for (const uid of allUserIds) emitToUser(uid, payload);
  } catch {
    // fire-and-forget — không bao giờ ảnh hưởng đến response chính
  }
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

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function sendGradeBookPublishedNotification(
  classId: string,
  gradeBookId: string,
  title: string,
  creatorUserId: string | null,
  studentIds: string[]
): Promise<void> {
  const uniqueStudentIds = [...new Set(studentIds)].filter(Boolean);
  if (!uniqueStudentIds.length) return;

  const [classRow] = await db.select({ name: classes.name, classCode: classes.classCode })
    .from(classes).where(eq(classes.id, classId)).limit(1);
  const className = classRow?.classCode || classRow?.name || "";

  let teacherLabel = "Giáo viên";
  if (creatorUserId) {
    const [staffRow] = await db.select({ fullName: staff.fullName, code: staff.code })
      .from(staff).where(eq(staff.userId, creatorUserId)).limit(1);
    if (staffRow) teacherLabel = `Giáo viên: ${staffRow.fullName} (${staffRow.code})`;
  }

  const studentRows = await db
    .select({ id: students.id, userId: students.userId, fullName: students.fullName })
    .from(students).where(inArray(students.id, uniqueStudentIds));

  const recipientUserIds = studentRows.map(r => r.userId).filter(Boolean) as string[];
  if (recipientUserIds.length > 0) {
    await sendNotificationToMany(recipientUserIds, {
      title: "Thông báo bảng điểm",
      content: `${teacherLabel} vừa gửi Bảng điểm: ${title}, Lớp ${className}`,
      category: "schedule",
      referenceId: classId,
      referenceType: "score_sheet",
      deeplink: {
        screen: "ScoreSheet",
        params: { classId },
      },
    });
  }

  // Notification Engine — per student with individual score
  try {
    const [center] = await db.select({ id: centerConfig.id }).from(centerConfig).limit(1);
    if (!center?.id) return;

    // Get the gradeBook's scoreSheetId to find formula-based (computed) categories
    const [gradeBookRow] = await db
      .select({ scoreSheetId: classGradeBooks.scoreSheetId })
      .from(classGradeBooks)
      .where(eq(classGradeBooks.id, gradeBookId))
      .limit(1);

    // Find categoryIds that are truly computed (e.g. "tong") — exclude from sum
    // Mirror the frontend logic: a category is computed only if it has a non-empty formula
    // that is NOT a self-reference like "= code" or "=code"
    const formulaCategoryIds = new Set<string>();
    if (gradeBookRow?.scoreSheetId) {
      const sheetItems = await db
        .select({
          categoryId: scoreSheetItems.categoryId,
          formula: scoreSheetItems.formula,
          categoryCode: scoreCategories.code,
        })
        .from(scoreSheetItems)
        .leftJoin(scoreCategories, eq(scoreSheetItems.categoryId, scoreCategories.id))
        .where(eq(scoreSheetItems.scoreSheetId, gradeBookRow.scoreSheetId));
      for (const item of sheetItems) {
        const f = (item.formula || "").trim();
        const code = item.categoryCode || "";
        const isSelfRef = f === `= ${code}` || f === `=${code}`;
        if (f && !isSelfRef) {
          formulaCategoryIds.add(item.categoryId);
        }
      }
    }

    // Query all scores for this grade book, excluding formula/computed categories
    const allScores = await db
      .select({ studentId: classGradeBookScores.studentId, categoryId: classGradeBookScores.categoryId, score: classGradeBookScores.score })
      .from(classGradeBookScores)
      .where(eq(classGradeBookScores.gradeBookId, gradeBookId));

    const scoreSumByStudent = new Map<string, number>();
    for (const row of allScores) {
      if (formulaCategoryIds.has(row.categoryId)) continue; // skip computed categories
      const num = parseFloat(row.score ?? "");
      if (!isNaN(num)) {
        scoreSumByStudent.set(row.studentId, (scoreSumByStudent.get(row.studentId) ?? 0) + num);
      }
    }

    // Query student comments
    const commentRows = await db
      .select({ studentId: classGradeBookStudentComments.studentId, comment: classGradeBookStudentComments.comment })
      .from(classGradeBookStudentComments)
      .where(eq(classGradeBookStudentComments.gradeBookId, gradeBookId));
    const commentByStudent = new Map<string, string>();
    for (const row of commentRows) {
      commentByStudent.set(row.studentId, row.comment);
    }

    for (const student of studentRows) {
      const totalScore = scoreSumByStudent.has(student.id)
        ? String(scoreSumByStudent.get(student.id))
        : "—";

      const comment = stripHtml(commentByStudent.get(student.id) ?? "");

      await notificationService.send({
        centerId: center.id,
        studentId: student.id,
        type: "score_sheet",
        data: {
          sheetName: title,
          className,
          studentName: student.fullName ?? "",
          totalScore,
          ...(comment ? { comment } : {}),
        },
      });
    }
  } catch (err) {
    console.error("[GradeBookNotify] Notification Engine error:", err);
  }
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

  // Lấy buổi học đầu tiên từ hôm nay trở đi để deeplink Calendar mở đúng ngày.
  // Nếu không có buổi nào sắp tới (lớp chưa tạo session) thì fallback về buổi sớm nhất.
  const today = new Date().toISOString().slice(0, 10);
  const [firstUpcoming] = await db
    .select({ sessionDate: classSessions.sessionDate })
    .from(classSessions)
    .where(and(eq(classSessions.classId, cls.id), gte(classSessions.sessionDate, today)))
    .orderBy(asc(classSessions.sessionDate))
    .limit(1);
  let firstSessionDate: string | undefined = firstUpcoming?.sessionDate ?? undefined;
  if (!firstSessionDate) {
    const [earliest] = await db
      .select({ sessionDate: classSessions.sessionDate })
      .from(classSessions)
      .where(eq(classSessions.classId, cls.id))
      .orderBy(asc(classSessions.sessionDate))
      .limit(1);
    firstSessionDate = earliest?.sessionDate ?? undefined;
  }

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
      referenceDate: firstSessionDate,
      deeplink: {
        screen: "Calendar",
        params: {
          classId: cls.id,
          ...(firstSessionDate ? { date: firstSessionDate } : {}),
        },
      },
    });
  }
}

async function getAllowedLocationIds(req: any): Promise<string[] | null> {
  const user = req.user as any;
  if (!user) return [];
  if (user.username === "admin") return null;
  // Single LEFT JOIN replaces previous 2-query pattern (SELECT staff + SELECT assignments)
  const rows = await db
    .select({ locationId: staffAssignments.locationId })
    .from(staff)
    .leftJoin(staffAssignments, eq(staffAssignments.staffId, staff.id))
    .where(eq(staff.userId, user.id));
  if (!rows.length) return [];
  return rows.map(r => r.locationId).filter((id): id is string => !!id);
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
  // Single LEFT JOIN replaces previous 2-query pattern (SELECT staff + SELECT assignments)
  const [row] = await db
    .select({ locationId: staffAssignments.locationId })
    .from(staff)
    .leftJoin(staffAssignments, eq(staffAssignments.staffId, staff.id))
    .where(eq(staff.userId, user.id))
    .limit(1);
  return row?.locationId ?? null;
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
  mode: z.enum(["force", "skip_attended"]),
  orphanAction: z.enum(["remove", "waiting"]).optional().default("remove"),
});

export function registerClassesRoutes(app: Express): void {
  // Makeup
  app.post(api.classes.makeup.path, async (req, res) => {
    const classId = req.params.id;
    const userId = (req.user as any).id;
    try {
      await storage.makeupClassStudents(classId, req.body, userId);

      // ── Activity log ──────────────────────────────────────────────────────
      try {
        const { option, subOption, selectedTargetSessionId, selectedTargetClassId, students } = req.body;

        const [clsInfo] = await db.select({ name: classes.name, classCode: classes.classCode, locationId: classes.locationId })
          .from(classes).where(eq(classes.id, classId));

        let targetCS: { sessionIndex: number | null; sessionDate: string; weekday: number | null; shiftTemplateId: string | null } | null = null;
        if (selectedTargetSessionId && (option === "current_class" || option === "other_class")) {
          const [ts] = await db.select({
            sessionIndex: classSessions.sessionIndex,
            sessionDate: classSessions.sessionDate,
            weekday: classSessions.weekday,
            shiftTemplateId: classSessions.shiftTemplateId,
          }).from(classSessions).where(eq(classSessions.id, selectedTargetSessionId));
          targetCS = ts ?? null;
        }

        let targetClsInfo: { name: string; classCode: string | null } | null = null;
        if (option === "other_class" && selectedTargetClassId) {
          const [tc] = await db.select({ name: classes.name, classCode: classes.classCode })
            .from(classes).where(eq(classes.id, selectedTargetClassId));
          targetClsInfo = tc ?? null;
        }

        let targetStartTime: string | null = null;
        if (targetCS?.shiftTemplateId) {
          const [st] = await db.select({ startTime: shiftTemplates.startTime })
            .from(shiftTemplates).where(eq(shiftTemplates.id, targetCS.shiftTemplateId));
          targetStartTime = st?.startTime ?? null;
        }

        const userLocId = await getUserLocationId(req);

        const logStudents = await Promise.all((students || []).map(async (s: any) => {
          const studentName = s.student?.fullName || s.fullName || s.name || "";
          const studentCode = s.student?.studentCode || s.studentCode || s.code || "";

          let fromSessionIndex: number | null = s.sessionIndex ?? null;
          let fromSessionDate: string = s.sessionDate || "";
          let fromWeekday: number = fromSessionDate ? new Date(fromSessionDate).getDay() : 0;
          const fromStartTime: string | null = s.startTime || null;

          if (s.classSessionId) {
            const [origCS] = await db.select({
              sessionIndex: classSessions.sessionIndex,
              sessionDate: classSessions.sessionDate,
              weekday: classSessions.weekday,
            }).from(classSessions).where(eq(classSessions.id, s.classSessionId));
            if (origCS) {
              fromSessionIndex = origCS.sessionIndex ?? fromSessionIndex;
              fromSessionDate = origCS.sessionDate || fromSessionDate;
              fromWeekday = origCS.weekday ?? new Date(origCS.sessionDate).getDay();
            }
          }

          const toSession = targetCS ? {
            sessionIndex: targetCS.sessionIndex ?? null,
            sessionDate: targetCS.sessionDate,
            weekday: targetCS.weekday ?? (targetCS.sessionDate ? new Date(targetCS.sessionDate).getDay() : 0),
            startTime: targetStartTime,
            className: option === "other_class" ? (targetClsInfo?.name || "") : (clsInfo?.name || ""),
            classCode: option === "other_class" ? (targetClsInfo?.classCode || "") : (clsInfo?.classCode || ""),
          } : null;

          return {
            name: studentName,
            code: studentCode,
            fromSession: {
              sessionIndex: fromSessionIndex,
              sessionDate: fromSessionDate,
              weekday: fromWeekday,
              startTime: fromStartTime,
              className: clsInfo?.name || "",
              classCode: clsInfo?.classCode || "",
            },
            toSession,
          };
        }));

        const newContent = JSON.stringify({
          option,
          subOption: subOption || null,
          students: logStudents,
        });

        await createActivityLog({
          userId,
          locationId: userLocId ?? clsInfo?.locationId ?? null,
          classId,
          action: "Xếp bù",
          oldContent: null,
          newContent,
        });
      } catch (logErr) {
        console.error("[MakeupClassStudents] Activity log error:", logErr);
      }

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
      try {
        const page = parseInt((req.query.page as string) || "1", 10);
        const pageSize = parseInt((req.query.pageSize as string) || "20", 10);
        const search = (req.query.search as string) || undefined;
        const status = (req.query.status as string) || undefined;
        const results = await storage.getClassesListPaginated({ locationId, allowedLocationIds, search, status, page, pageSize });
        return res.json(results);
      } catch (err: any) {
        console.error("[getClassesListPaginated] error:", err);
        return res.status(500).json({ message: err.message || "Lỗi server" });
      }
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
        locationClause = sql`c.location_id = ANY(ARRAY[${sql.raw(allowedLocationIds.map(id => `'${id}'`).join(','))}]::uuid[])`;
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
            (
              SELECT MAX(cs_end.session_date)
              FROM class_sessions cs_end
              WHERE cs_end.class_id = c.id
                AND cs_end.status != 'cancelled'
            ) AS end_date,
            l.name AS location_name,
            (
              SELECT COUNT(*)::int FROM class_sessions cs
              WHERE cs.class_id = c.id AND cs.session_date >= ${today}::date AND cs.status != 'cancelled'
            ) AS remaining_sessions
          FROM classes c
          INNER JOIN locations l ON c.location_id = l.id
          WHERE c.status IN ('active', 'planning')
            AND ${locationClause}
            AND EXISTS (
              SELECT 1
              FROM class_sessions cs_scheduled
              WHERE cs_scheduled.class_id = c.id
                AND cs_scheduled.status != 'cancelled'
            )
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
        WHERE c.status IN ('active', 'planning')
          AND ${locationClause}
          AND EXISTS (
            SELECT 1
            FROM class_sessions cs_scheduled
            WHERE cs_scheduled.class_id = c.id
              AND cs_scheduled.status != 'cancelled'
          )
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

      const summary = await getClassFormatSummary({ isSuperAdmin, allowedLocationIds, locationId });
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

      const summary = await getClassStatusSummary({ isSuperAdmin, allowedLocationIds, locationId });
      res.json(summary);
    } catch (err: any) {
      console.error("Class status summary error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải trạng thái lớp học" });
    }
  });

  // ── GET /api/classes/by-location ──────────────────────────────────────────
  app.get("/api/classes/by-location", async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const isSuperAdmin = (req as any).isSuperAdmin ?? false;
      const allowedLocationIds = await getAllowedLocationIds(req);
      const locationId = typeof req.query.locationId === "string" ? req.query.locationId : undefined;
      const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined;
      const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : undefined;
      const data = await getClassesByLocationSummary({ isSuperAdmin, allowedLocationIds, locationId, dateFrom, dateTo });
      res.json(data);
    } catch (err: any) {
      console.error("Classes by location error:", err);
      res.status(500).json({ message: err.message || "Lỗi" });
    }
  });

  // ── GET /api/classes/monthly-attendance ────────────────────────────────────
  app.get("/api/classes/monthly-attendance", async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const isSuperAdmin = (req as any).isSuperAdmin ?? false;
      const allowedLocationIds = await getAllowedLocationIds(req);
      const locationId = typeof req.query.locationId === "string" ? req.query.locationId : undefined;
      const months = req.query.months ? parseInt(String(req.query.months), 10) : 6;
      const data = await getMonthlyAttendanceRate({ isSuperAdmin, allowedLocationIds, locationId, months });
      res.json(data);
    } catch (err: any) {
      console.error("Monthly attendance rate error:", err);
      res.status(500).json({ message: err.message || "Lỗi" });
    }
  });

  // ── GET /api/classes/by-teacher ────────────────────────────────────────────
  app.get("/api/classes/by-teacher", async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const isSuperAdmin = (req as any).isSuperAdmin ?? false;
      const allowedLocationIds = await getAllowedLocationIds(req);
      const locationId = typeof req.query.locationId === "string" ? req.query.locationId : undefined;
      const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined;
      const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : undefined;
      const data = await getClassesByTeacherSummary({ isSuperAdmin, allowedLocationIds, locationId, dateFrom, dateTo });
      res.json(data);
    } catch (err: any) {
      console.error("Classes by teacher error:", err);
      res.status(500).json({ message: err.message || "Lỗi" });
    }
  });

  // ── GET /api/classes/sessions-by-teacher ───────────────────────────────────
  app.get("/api/classes/sessions-by-teacher", async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const isSuperAdmin = (req as any).isSuperAdmin ?? false;
      const allowedLocationIds = await getAllowedLocationIds(req);
      const locationId = typeof req.query.locationId === "string" ? req.query.locationId : undefined;
      const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined;
      const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : undefined;
      const data = await getSessionsByTeacherSummary({ isSuperAdmin, allowedLocationIds, locationId, dateFrom, dateTo });
      res.json(data);
    } catch (err: any) {
      console.error("Sessions by teacher error:", err);
      res.status(500).json({ message: err.message || "Lỗi" });
    }
  });

  // ── GET /api/classes/new-summary ──────────────────────────────────────────
  // Trả về số lớp học mới được tạo trong hôm nay và trong tháng hiện tại
  // Query params: locationId (optional)
  app.get("/api/classes/new-summary", async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const isSuperAdmin = (req as any).isSuperAdmin ?? false;
      const allowedLocationIds = await getAllowedLocationIds(req);
      const locationId = typeof req.query.locationId === "string" ? req.query.locationId : undefined;

      const summary = await getNewClassesSummary({ isSuperAdmin, allowedLocationIds, locationId });
      res.json(summary);
    } catch (err: any) {
      console.error("New classes summary error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải lớp học mới" });
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
    const { studentIds, status } = req.body;
    const classId = req.params.id;
    await storage.addClassStudents(classId, studentIds, (req.user as any).id, status);
    res.status(201).json({ success: true });

    // Fire-and-forget: sync newly-active students to class-linked custom chat groups
    if (status === "active" && Array.isArray(studentIds) && studentIds.length > 0) {
      (async () => {
        try {
          const { syncStudentsToClassChatGroups } = await import("../lib/chat-sync");
          await syncStudentsToClassChatGroups(classId, studentIds);
        } catch (err) {
          console.error("[ChatSync] addClassStudents trigger:", err);
        }
      })();
    }
  });

  app.delete("/api/classes/:id/waiting-students/:studentClassId", async (req, res) => {
    try {
      const { id: classId, studentClassId } = req.params;
      const [sc] = await db
        .select({ id: studentClasses.id, status: studentClasses.status })
        .from(studentClasses)
        .where(and(eq(studentClasses.id, studentClassId), eq(studentClasses.classId, classId)));
      if (!sc) return res.status(404).json({ message: "Không tìm thấy học viên trong lớp" });
      if (sc.status !== "waiting") return res.status(400).json({ message: "Chỉ có thể xoá học viên đang chờ" });
      await db.delete(studentClasses).where(eq(studentClasses.id, studentClassId));
      res.json({ success: true });
    } catch (err: any) {
      console.error("Remove waiting student error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi xoá học viên" });
    }
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

      // Fire-and-forget: sync all newly-active students to class-linked custom chat groups
      (async () => {
        try {
          const { syncAllActiveStudentsToChatGroups } = await import("../lib/chat-sync");
          await syncAllActiveStudentsToChatGroups(classId);
        } catch (err) {
          console.error("[ChatSync] scheduleStudents trigger:", err);
        }
      })();
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
      const userId = (req.user as any).id;
      await storage.transferStudentClass({ ...data, userId });

      // ── Activity log ──────────────────────────────────────────────────────
      try {
        const { studentId, fromClassId, toClassId, fromSessionIndex, toSessionIndex, transferCount } = data;
        const [studentInfo] = await db.select({ fullName: students.fullName, code: students.code })
          .from(students).where(eq(students.id, studentId)).limit(1);
        const [fromClassInfo] = await db.select({ name: classes.name, classCode: classes.classCode, locationId: classes.locationId })
          .from(classes).where(eq(classes.id, fromClassId)).limit(1);
        const [toClassInfo] = await db.select({ name: classes.name, classCode: classes.classCode })
          .from(classes).where(eq(classes.id, toClassId)).limit(1);
        const fromSessions = await db.select({ sessionIndex: classSessions.sessionIndex, sessionDate: classSessions.sessionDate, weekday: classSessions.weekday })
          .from(classSessions).where(and(eq(classSessions.classId, fromClassId), sql`${classSessions.sessionIndex} >= ${fromSessionIndex}`))
          .orderBy(asc(classSessions.sessionIndex)).limit(transferCount);
        const toSessions = await db.select({ sessionIndex: classSessions.sessionIndex, sessionDate: classSessions.sessionDate, weekday: classSessions.weekday })
          .from(classSessions).where(and(eq(classSessions.classId, toClassId), sql`${classSessions.sessionIndex} >= ${toSessionIndex}`))
          .orderBy(asc(classSessions.sessionIndex)).limit(transferCount);
        const sessionPairs = fromSessions.map((fs, i) => ({
          fromSessionIndex: fs.sessionIndex,
          fromSessionDate: fs.sessionDate,
          fromWeekday: fs.weekday ?? (fs.sessionDate ? new Date(fs.sessionDate).getDay() : 0),
          toSessionIndex: toSessions[i]?.sessionIndex ?? null,
          toSessionDate: toSessions[i]?.sessionDate ?? "",
          toWeekday: toSessions[i]?.weekday ?? (toSessions[i]?.sessionDate ? new Date(toSessions[i].sessionDate).getDay() : 0),
        }));
        const userLocId = await getUserLocationId(req);
        await createActivityLog({
          userId,
          locationId: userLocId ?? fromClassInfo?.locationId ?? null,
          classId: fromClassId,
          action: "Chuyển lớp",
          oldContent: null,
          newContent: JSON.stringify({
            student: { name: studentInfo?.fullName ?? "", code: studentInfo?.code ?? "" },
            fromClass: { name: fromClassInfo?.name ?? "", classCode: fromClassInfo?.classCode ?? "" },
            toClass: { name: toClassInfo?.name ?? "", classCode: toClassInfo?.classCode ?? "" },
            fromSessionIndex, toSessionIndex, transferCount,
            sessions: sessionPairs,
          }),
        });
      } catch (logErr) { console.error("[Activity log] Chuyển lớp:", logErr); }

      res.json({ success: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(400).json({ message: err.message || "Không thể chuyển lớp" });
    }
  });

  app.post(api.students.transferClass.path, async (req, res) => {
    try {
      const data = api.students.transferClass.input.parse(req.body);
      const userId = (req.user as any).id;
      await storage.transferStudentClass({ ...data, userId });

      // ── Activity log ──────────────────────────────────────────────────────
      try {
        const { studentId, fromClassId, toClassId, fromSessionIndex, toSessionIndex, transferCount } = data;
        const [studentInfo] = await db.select({ fullName: students.fullName, code: students.code })
          .from(students).where(eq(students.id, studentId)).limit(1);
        const [fromClassInfo] = await db.select({ name: classes.name, classCode: classes.classCode, locationId: classes.locationId })
          .from(classes).where(eq(classes.id, fromClassId)).limit(1);
        const [toClassInfo] = await db.select({ name: classes.name, classCode: classes.classCode })
          .from(classes).where(eq(classes.id, toClassId)).limit(1);
        const fromSessions = await db.select({ sessionIndex: classSessions.sessionIndex, sessionDate: classSessions.sessionDate, weekday: classSessions.weekday })
          .from(classSessions).where(and(eq(classSessions.classId, fromClassId), sql`${classSessions.sessionIndex} >= ${fromSessionIndex}`))
          .orderBy(asc(classSessions.sessionIndex)).limit(transferCount);
        const toSessions = await db.select({ sessionIndex: classSessions.sessionIndex, sessionDate: classSessions.sessionDate, weekday: classSessions.weekday })
          .from(classSessions).where(and(eq(classSessions.classId, toClassId), sql`${classSessions.sessionIndex} >= ${toSessionIndex}`))
          .orderBy(asc(classSessions.sessionIndex)).limit(transferCount);
        const sessionPairs = fromSessions.map((fs, i) => ({
          fromSessionIndex: fs.sessionIndex,
          fromSessionDate: fs.sessionDate,
          fromWeekday: fs.weekday ?? (fs.sessionDate ? new Date(fs.sessionDate).getDay() : 0),
          toSessionIndex: toSessions[i]?.sessionIndex ?? null,
          toSessionDate: toSessions[i]?.sessionDate ?? "",
          toWeekday: toSessions[i]?.weekday ?? (toSessions[i]?.sessionDate ? new Date(toSessions[i].sessionDate).getDay() : 0),
        }));
        const userLocId = await getUserLocationId(req);
        await createActivityLog({
          userId,
          locationId: userLocId ?? fromClassInfo?.locationId ?? null,
          classId: fromClassId,
          action: "Chuyển lớp",
          oldContent: null,
          newContent: JSON.stringify({
            student: { name: studentInfo?.fullName ?? "", code: studentInfo?.code ?? "" },
            fromClass: { name: fromClassInfo?.name ?? "", classCode: fromClassInfo?.classCode ?? "" },
            toClass: { name: toClassInfo?.name ?? "", classCode: toClassInfo?.classCode ?? "" },
            fromSessionIndex, toSessionIndex, transferCount,
            sessions: sessionPairs,
          }),
        });
      } catch (logErr) { console.error("[Activity log] Chuyển lớp:", logErr); }

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

  // GET /api/classes/:classId/enrolled-students
  // Returns all enrolled students (waiting + active) with invoice summaries — used by revenue report.
  app.get("/api/classes/:classId/enrolled-students", async (req, res) => {
    try {
      const { classId } = req.params;

      const enrollments = await db
        .select({
          id:                studentClasses.id,
          studentId:         studentClasses.studentId,
          enrollmentStatus:  studentClasses.status,
          startDate:         studentClasses.startDate,
          endDate:           studentClasses.endDate,
          totalSessions:     studentClasses.totalSessions,
          attendedSessions:  studentClasses.attendedSessions,
          remainingSessions: studentClasses.remainingSessions,
          fullName:          students.fullName,
          code:              students.code,
        })
        .from(studentClasses)
        .leftJoin(students, eq(studentClasses.studentId, students.id))
        .where(and(
          eq(studentClasses.classId, classId),
          inArray(studentClasses.status, ["waiting", "active"]),
        ));

      const invRows = await db
        .select({
          studentId:       invoices.studentId,
          grandTotal:      sql<string>`COALESCE(SUM(${invoices.grandTotal}::numeric), 0)`,
          paidAmount:      sql<string>`COALESCE(SUM(${invoices.paidAmount}::numeric), 0)`,
          remainingAmount: sql<string>`COALESCE(SUM(${invoices.remainingAmount}::numeric), 0)`,
          statuses:        sql<string[]>`ARRAY_AGG(DISTINCT ${invoices.status})`,
        })
        .from(invoices)
        .where(and(eq(invoices.classId, classId), sql`${invoices.status} <> 'cancelled'`))
        .groupBy(invoices.studentId);

      const invMap = Object.fromEntries(invRows.map(r => [r.studentId ?? "", r]));
      const statusPriority: Record<string, number> = { debt: 4, unpaid: 3, partial: 2, paid: 1 };

      const result = enrollments.map(e => {
        const inv = invMap[e.studentId ?? ""];
        const statuses: string[] = inv?.statuses ?? [];
        const worstStatus = [...statuses].sort(
          (a, b) => (statusPriority[b] ?? 0) - (statusPriority[a] ?? 0),
        )[0] ?? "unpaid";
        return {
          id:                e.id,
          studentId:         e.studentId,
          fullName:          e.fullName,
          code:              e.code,
          enrollmentStatus:  e.enrollmentStatus,
          startDate:         e.startDate,
          endDate:           e.endDate,
          totalSessions:     e.totalSessions,
          attendedSessions:  e.attendedSessions,
          remainingSessions: e.remainingSessions,
          invoice: inv ? {
            grandTotal:      parseFloat(inv.grandTotal),
            paidAmount:      parseFloat(inv.paidAmount),
            remainingAmount: parseFloat(inv.remainingAmount),
            status:          worstStatus,
          } : null,
        };
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
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

  // POST /api/classes/:classId/students/sessions-batch
  // Batch: lấy existing sessions cho nhiều học viên cùng lúc — thay thế N lần GET /student/:id/sessions
  app.post("/api/classes/:classId/students/sessions-batch", async (req, res) => {
    try {
      const { classId } = req.params;
      const { studentIds } = req.body as { studentIds: string[] };
      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        return res.json({});
      }
      const { db: baseDb, eq: baseEq, and: baseAnd, asc: baseAsc, inArray: baseIn, studentSessions: baseSs, classSessions: baseCs } = await import("../storage/base");
      const rows = await baseDb
        .select({
          id: baseSs.id,
          studentId: baseSs.studentId,
          classSessionId: baseSs.classSessionId,
          sessionOrder: baseSs.sessionOrder,
          attendanceStatus: baseSs.attendanceStatus,
          sessionDate: baseCs.sessionDate,
          weekday: baseCs.weekday,
        })
        .from(baseSs)
        .innerJoin(baseCs, baseEq(baseSs.classSessionId, baseCs.id))
        .where(baseAnd(baseEq(baseSs.classId, classId), baseIn(baseSs.studentId, studentIds)))
        .orderBy(baseAsc(baseCs.sessionDate));

      // Group by studentId
      const result: Record<string, typeof rows> = {};
      for (const row of rows) {
        if (!result[row.studentId]) result[row.studentId] = [];
        result[row.studentId].push(row);
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Lỗi khi lấy danh sách buổi học batch" });
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
      const userId = (req as any).user?.id ?? null;

      // Pre-fetch data for activity log
      let logMeta: { classId: string; locationId: string | null; studentName: string; studentCode: string; oldWeekdays: number[] | null } | null = null;
      try {
        const [scRow] = await db
          .select({ classId: studentClasses.classId, studentId: studentClasses.studentId, scheduledWeekdays: studentClasses.scheduledWeekdays })
          .from(studentClasses).where(eq(studentClasses.id, id)).limit(1);
        if (scRow) {
          const [studentRow] = await db.select({ fullName: students.fullName, code: students.code })
            .from(students).where(eq(students.id, scRow.studentId)).limit(1);
          const [clsRow] = await db.select({ locationId: classes.locationId })
            .from(classes).where(eq(classes.id, scRow.classId)).limit(1);
          logMeta = {
            classId: scRow.classId,
            locationId: clsRow?.locationId ?? null,
            studentName: studentRow?.fullName ?? "",
            studentCode: studentRow?.code ?? "",
            oldWeekdays: scRow.scheduledWeekdays as number[] | null,
          };
        }
      } catch (prefetchErr) {
        console.error("[ChangeCycle] Pre-fetch log error:", prefetchErr);
      }

      const result = await storage.changeStudentCycle({
        studentClassId: id,
        fromSessionOrder: parseInt(String(fromSessionOrder)),
        weekdays,
        mode,
      });

      if (logMeta && userId) {
        try {
          const formatDays = (days: number[] | null) =>
            !days || days.length === 0 ? "Tất cả" : days.sort((a, b) => a - b).map((w) => SCHEDULE_WEEKDAY_LABELS[w] ?? w).join(", ");
          await createActivityLog({
            userId,
            locationId: logMeta.locationId,
            classId: logMeta.classId,
            action: "Đổi chu kỳ",
            oldContent: JSON.stringify({ weekdays: formatDays(logMeta.oldWeekdays) }),
            newContent: JSON.stringify({
              student: { name: logMeta.studentName, code: logMeta.studentCode },
              fromSessionOrder,
              oldWeekdays: formatDays(logMeta.oldWeekdays),
              newWeekdays: formatDays(weekdays),
              mode,
              deleted: result.deleted,
              created: result.created,
            }),
          });
        } catch (logErr) {
          console.error("[ChangeCycle] Activity log error:", logErr);
        }
      }

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
      const userId = (req as any).user?.id ?? null;

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

      // Pre-fetch student info and old weekdays for logging
      type BulkLogItem = { studentName: string; studentCode: string; oldWeekdays: number[] | null; newWeekdays: number[] | null; fromSessionOrder: number; classId: string; locationId: string | null };
      const bulkLogItems: BulkLogItem[] = [];
      let sharedClassId: string | null = null;
      let sharedLocationId: string | null = null;
      if (userId) {
        try {
          const scRows = await db
            .select({ id: studentClasses.id, classId: studentClasses.classId, studentId: studentClasses.studentId, scheduledWeekdays: studentClasses.scheduledWeekdays })
            .from(studentClasses).where(inArray(studentClasses.id, studentClassIds));
          const allStudentIds = scRows.map(r => r.studentId).filter(Boolean) as string[];
          const studentInfoMap = new Map<string, { fullName: string; code: string }>();
          if (allStudentIds.length > 0) {
            const sRows = await db.select({ id: students.id, fullName: students.fullName, code: students.code })
              .from(students).where(inArray(students.id, allStudentIds));
            for (const s of sRows) studentInfoMap.set(s.id, { fullName: s.fullName ?? "", code: s.code ?? "" });
          }
          if (scRows.length > 0) {
            sharedClassId = scRows[0].classId;
            const [clsRow] = await db.select({ locationId: classes.locationId })
              .from(classes).where(eq(classes.id, sharedClassId)).limit(1);
            sharedLocationId = clsRow?.locationId ?? null;
          }
          for (const scRow of scRows) {
            const studentInput = students.find(s => s.studentClassId === scRow.id);
            const sInfo = studentInfoMap.get(scRow.studentId ?? "");
            bulkLogItems.push({
              studentName: sInfo?.fullName ?? "",
              studentCode: sInfo?.code ?? "",
              oldWeekdays: scRow.scheduledWeekdays as number[] | null,
              newWeekdays: studentInput?.weekdays ?? null,
              fromSessionOrder: orderMap[scRow.id] ?? 0,
              classId: scRow.classId,
              locationId: sharedLocationId,
            });
          }
        } catch (prefetchErr) {
          console.error("[BulkChangeCycle] Pre-fetch log error:", prefetchErr);
        }
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

      if (userId && bulkLogItems.length > 0 && sharedClassId) {
        try {
          const formatDays = (days: number[] | null) =>
            !days || days.length === 0 ? "Tất cả" : days.sort((a, b) => a - b).map((w) => SCHEDULE_WEEKDAY_LABELS[w] ?? w).join(", ");
          const succeededIds = new Set(results.filter(r => !r.error).map(r => r.studentClassId));
          const logStudents = bulkLogItems
            .filter(item => {
              const sc = students.find(s => {
                const scRow = bulkLogItems.find(b => b.studentName === item.studentName && b.studentCode === item.studentCode);
                return !!scRow;
              });
              return true;
            })
            .map(item => ({
              name: item.studentName,
              code: item.studentCode,
              fromSessionOrder: item.fromSessionOrder,
              oldWeekdays: formatDays(item.oldWeekdays),
              newWeekdays: formatDays(item.newWeekdays),
            }));
          await createActivityLog({
            userId,
            locationId: sharedLocationId,
            classId: sharedClassId,
            action: "Đổi chu kỳ",
            oldContent: null,
            newContent: JSON.stringify({
              mode,
              students: logStudents,
              totalDeleted: results.reduce((sum, r) => sum + (r.deleted ?? 0), 0),
              totalCreated: results.reduce((sum, r) => sum + (r.created ?? 0), 0),
            }),
          });
        } catch (logErr) {
          console.error("[BulkChangeCycle] Activity log error:", logErr);
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
      const { status, note, attendance_status, attendance_note } = req.body;
      const effectiveStatus = status ?? attendance_status;
      const effectiveNote = note ?? attendance_note;
      const userId = (req as any).user?.id ?? null;
      const userFullName = await resolveStaffFullName(userId);

      // Enforce attendance time limit
      const [ssForLimit] = await db.select({ classSessionId: studentSessions.classSessionId })
        .from(studentSessions).where(eq(studentSessions.id, req.params.id)).limit(1);
      if (ssForLimit) await checkAttendanceLimitForSession(ssForLimit.classSessionId, req);

      const { statusChanged } = await storage.updateStudentAttendance(req.params.id, effectiveStatus, effectiveNote, userId, userFullName);
      if (statusChanged) sendAttendanceNotification(req.params.id, effectiveStatus, userId).catch(console.error);
      res.json({ success: true });
    } catch (err: any) {
      res.status(err.status ?? 400).json({ message: err.message });
    }
  });

  app.post(api.studentSessions.attendance.path, async (req, res) => {
    try {
      const { student_session_id, attendance_status, attendance_note } = req.body;
      const userId = (req as any).user?.id ?? null;
      const userFullName = await resolveStaffFullName(userId);

      // Enforce attendance time limit
      const [ssForLimit] = await db.select({ classSessionId: studentSessions.classSessionId })
        .from(studentSessions).where(eq(studentSessions.id, student_session_id)).limit(1);
      if (ssForLimit) await checkAttendanceLimitForSession(ssForLimit.classSessionId, req);

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

      const { statusChanged: attendanceChanged } = await storage.updateStudentAttendance(student_session_id, attendance_status, attendance_note, userId, userFullName);
      if (attendanceChanged) sendAttendanceNotification(student_session_id, attendance_status, userId).catch(console.error);

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
      res.status(err.status ?? 400).json({ message: err.message });
    }
  });

  app.post(api.studentSessions.bulkAttendance.path, async (req, res) => {
    try {
      const { session_id, students: studentList } = req.body;
      const userId = (req as any).user?.id ?? null;
      const userFullName = await resolveStaffFullName(userId);

      // Enforce attendance time limit (session_id is the classSessionId directly)
      await checkAttendanceLimitForSession(session_id, req);

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
      res.status(err.status ?? 400).json({ message: err.message });
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
      const userId = (req as any).user?.id ?? null;
      if (published) {
        sendReviewNotification(studentSessionIds, userId).catch(console.error);
      }
      res.json({ success: true });
      // Activity log (fire-and-forget)
      try {
        const rows = await db.select({
          studentName: students.fullName,
          studentCode: students.code,
          sessionIndex: classSessions.sessionIndex,
          sessionDate: classSessions.sessionDate,
          weekday: classSessions.weekday,
          classId: classSessions.classId,
        }).from(studentSessions)
          .innerJoin(students, eq(studentSessions.studentId, students.id))
          .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
          .where(inArray(studentSessions.id, studentSessionIds));
        if (rows.length > 0) {
          const logClassId = rows[0].classId;
          const [classInfo] = await db.select({ locationId: classes.locationId })
            .from(classes).where(eq(classes.id, logClassId)).limit(1);
          const seen = new Set<string>();
          const uniqueStudents = rows.filter(r => {
            const key = `${r.studentName}||${r.studentCode}`;
            if (seen.has(key)) return false;
            seen.add(key); return true;
          });
          createActivityLog({
            userId,
            locationId: classInfo?.locationId ?? null,
            classId: logClassId,
            action: "Nhận xét học viên",
            oldContent: null,
            newContent: JSON.stringify({
              published: !!published,
              students: uniqueStudents.map(r => ({
                name: r.studentName ?? "",
                code: r.studentCode ?? "",
                sessionIndex: r.sessionIndex,
                sessionDate: r.sessionDate,
                weekday: r.weekday,
              })),
            }),
          }).catch(console.error);
        }
      } catch (logErr) {
        console.error("[Review] Activity log error:", logErr);
      }
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

      // ── Pre-fetch for activity log (before update) ──────────────────────
      let logPreData: {
        classId: string; className: string; classCode: string; locationId: string | null;
        newPkg: { name: string; type: string; fee: number; sessions: number | null; sessionPrice: number } | null;
        studentsLog: Array<{ name: string; code: string; studentClassId: string; oldPackageName: string | null; oldPackageType: string | null; oldSessionPrice: number | null; sessionCount: number }>;
      } | null = null;
      try {
        const scRows = await db.select({
          id: studentClasses.id, classId: studentClasses.classId,
          studentId: studentClasses.studentId, studentName: students.fullName, studentCode: students.code,
        }).from(studentClasses).innerJoin(students, eq(studentClasses.studentId, students.id))
          .where(inArray(studentClasses.id, student_class_ids));

        const logClassId = scRows[0]?.classId ?? null;
        let className = "", classCode = "", classLocationId: string | null = null;
        if (logClassId) {
          const [ci] = await db.select({ name: classes.name, classCode: classes.classCode, locationId: classes.locationId })
            .from(classes).where(eq(classes.id, logClassId)).limit(1);
          className = ci?.name ?? ""; classCode = ci?.classCode ?? ""; classLocationId = ci?.locationId ?? null;
        }

        const oldSessions = await db.select({
          studentClassId: studentSessions.studentClassId, packageId: studentSessions.packageId,
          packageType: studentSessions.packageType, sessionPrice: studentSessions.sessionPrice,
        }).from(studentSessions).innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
          .where(and(
            inArray(studentSessions.studentClassId, student_class_ids),
            sql`${classSessions.sessionIndex} >= ${from_session_order}`,
            sql`${classSessions.sessionIndex} <= ${to_session_order}`,
          )).orderBy(asc(classSessions.sessionIndex));

        const distinctOldPkgIds = [...new Set(oldSessions.map(s => s.packageId).filter(Boolean))] as string[];
        const oldPkgsRows = distinctOldPkgIds.length > 0
          ? await db.select({ id: courseFeePackages.id, name: courseFeePackages.name, type: courseFeePackages.type })
              .from(courseFeePackages).where(inArray(courseFeePackages.id, distinctOldPkgIds))
          : [];
        const oldPkgMap = Object.fromEntries(oldPkgsRows.map(p => [p.id, p]));

        const perSC: Record<string, { packageId: string | null; packageType: string | null; sessionPrice: string | null; sessionCount: number }> = {};
        for (const s of oldSessions) {
          if (!s.studentClassId) continue;
          if (!perSC[s.studentClassId]) perSC[s.studentClassId] = { packageId: s.packageId, packageType: s.packageType, sessionPrice: s.sessionPrice, sessionCount: 0 };
          perSC[s.studentClassId].sessionCount++;
        }

        const [newPkgRow] = await db.select({ name: courseFeePackages.name, type: courseFeePackages.type, fee: courseFeePackages.fee, sessions: courseFeePackages.sessions })
          .from(courseFeePackages).where(eq(courseFeePackages.id, package_id)).limit(1);
        let newSessionPrice = 0;
        if (newPkgRow) {
          newSessionPrice = newPkgRow.type === "buổi"
            ? Number(newPkgRow.fee)
            : Number(newPkgRow.fee) / Math.max(Number(newPkgRow.sessions), 1);
        }

        logPreData = {
          classId: logClassId ?? "", className, classCode, locationId: classLocationId,
          newPkg: newPkgRow ? { name: newPkgRow.name, type: newPkgRow.type, fee: Number(newPkgRow.fee), sessions: newPkgRow.sessions != null ? Number(newPkgRow.sessions) : null, sessionPrice: newSessionPrice } : null,
          studentsLog: scRows.map(sc => {
            const old = perSC[sc.id];
            const oldPkg = old?.packageId ? oldPkgMap[old.packageId] : null;
            return {
              name: sc.studentName, code: sc.studentCode ?? "", studentClassId: sc.id,
              oldPackageName: oldPkg?.name ?? null, oldPackageType: old?.packageType ?? null,
              oldSessionPrice: old?.sessionPrice != null ? Number(old.sessionPrice) : null,
              sessionCount: old?.sessionCount ?? 0,
            };
          }),
        };
      } catch (preErr) { console.error("[Activity log pre-fetch] Đổi gói học phí:", preErr); }

      const result = await storage.updateStudentTuitionPackage(student_class_ids, package_id, from_session_order, to_session_order);

      // ── Activity log (after update) ────────────────────────────────────
      if (logPreData) {
        try {
          const userId = (req.user as any)?.id ?? null;
          const userLocId = await getUserLocationId(req);
          await createActivityLog({
            userId,
            locationId: userLocId ?? logPreData.locationId ?? null,
            classId: logPreData.classId || null,
            action: "Đổi gói học phí",
            oldContent: null,
            newContent: JSON.stringify({
              newPackage: logPreData.newPkg,
              fromSessionIndex: from_session_order,
              toSessionIndex: to_session_order,
              className: logPreData.className,
              classCode: logPreData.classCode,
              students: logPreData.studentsLog,
            }),
          });
        } catch (logErr) { console.error("[Activity log] Đổi gói học phí:", logErr); }
      }

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

      await storage.changeTeacher({
        classId,
        newTeacherIds,
        fromSessionId,
        toSessionId,
      });

      // Check schedule conflicts for new teacher assignments
      let changeTeacherConflicts: any[] = [];
      try {
        const { checkScheduleConflicts } = await import("../services/conflict-check.service");
        if (fromSess?.sessionDate && toSess?.sessionDate) {
          const sessForCheck = await db.select({
            sessionDate: classSessions.sessionDate,
            shiftTemplateId: classSessions.shiftTemplateId,
            roomId: classSessions.roomId,
            teacherIds: classSessions.teacherIds,
          }).from(classSessions).where(and(
            eq(classSessions.classId, classId),
            sql`${classSessions.sessionDate} BETWEEN ${fromSess.sessionDate} AND ${toSess.sessionDate}`,
          ));
          changeTeacherConflicts = await checkScheduleConflicts(sessForCheck, classId);
        }
      } catch (ce) {
        console.error("[ConflictCheck] change-teacher:", ce);
      }

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

      res.json({ success: true, conflicts: changeTeacherConflicts });
      emitCalendarUpdateForClass(classId).catch(() => {});
    } catch (err: any) {
      console.error("Change teacher error:", err);
      res.status(400).json({ message: err.message || "Không thể đổi giáo viên" });
    }
  });

  // Check attendance before delete
  app.post(api.classes.checkAttendanceBeforeDelete.path, async (req, res) => {
    try {
      const { classId, sessionId, deleteType, mode = "force" } = req.body;

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
      let effectiveSessionIds = sessionIds;
      if (mode === "skip_attended" && sessionIds.length > 0) {
        const attendedRows = await db
          .selectDistinct({ classSessionId: studentSessions.classSessionId })
          .from(studentSessions)
          .where(and(
            inArray(studentSessions.classSessionId, sessionIds),
            sql`${studentSessions.attendanceStatus} != 'pending'`,
          ));
        const attendedIds = new Set(attendedRows.map((row) => row.classSessionId));
        effectiveSessionIds = sessionIds.filter((id) => !attendedIds.has(id));
      }

      const enrolled = await db
        .select({
          studentClassId: studentClasses.id,
          studentId: studentClasses.studentId,
          studentName: students.fullName,
        })
        .from(studentClasses)
        .innerJoin(students, eq(students.id, studentClasses.studentId))
        .where(eq(studentClasses.classId, classId));

      const orphanedStudents = [];
      if (enrolled.length > 0 && effectiveSessionIds.length > 0) {
        const remaining = await db
          .select({
            studentClassId: studentSessions.studentClassId,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(studentSessions)
          .where(and(
            inArray(studentSessions.studentClassId, enrolled.map((s) => s.studentClassId)),
            sql`${studentSessions.classSessionId} NOT IN (${sql.join(effectiveSessionIds.map((id) => sql`${id}::uuid`), sql`, `)})`,
          ))
          .groupBy(studentSessions.studentClassId);
        const remainingMap = new Map(remaining.map((row) => [row.studentClassId, row.count]));
        orphanedStudents.push(
          ...enrolled
            .filter((student) => !remainingMap.has(student.studentClassId))
            .map((student) => ({
              studentClassId: student.studentClassId,
              studentId: student.studentId,
              studentName: student.studentName,
            })),
        );
      }

      res.json({ hasAttended, orphanedStudents });
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
        validatedData.mode,
        validatedData.orphanAction
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
              referenceDate: fromSession.sessionDate ?? undefined,
              deeplink: {
                screen: "Calendar",
                params: {
                  classId: validatedData.classId,
                  ...(fromSession.sessionDate ? { date: fromSession.sessionDate } : {}),
                },
              },
            });
          }
        } catch (notiErr) {
          console.error("[DeleteSessions] Notification error:", notiErr);
        }
      }

      res.json({ message: "Thành công" });
      emitCalendarUpdateForClass(validatedData.classId).catch(() => {});
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
      const clsPerms = await getClassPermissions(req);
      if (!clsPerms.canEdit) {
        return res.status(403).json({ message: "Bạn không có quyền chỉnh sửa lớp học." });
      }

      const { fromSessionId, toSessionId, startDate, weekdays, weekdayConfigs, reason } = req.body;
      const classId = req.params.id;
      const userId = (req.user as any).id;

      // Pre-fetch data before update for notifications
      const [fromSession] = await db.select({
        sessionIndex: classSessions.sessionIndex,
        sessionDate: classSessions.sessionDate,
        weekday: classSessions.weekday,
        shiftTemplateId: classSessions.shiftTemplateId,
      }).from(classSessions).where(and(
        eq(classSessions.id, fromSessionId),
        eq(classSessions.classId, classId),
      )).limit(1);

      const [toSession] = toSessionId
        ? await db.select({
            sessionIndex: classSessions.sessionIndex,
            sessionDate: classSessions.sessionDate,
            weekday: classSessions.weekday,
          }).from(classSessions).where(and(
            eq(classSessions.id, toSessionId),
            eq(classSessions.classId, classId),
          )).limit(1)
        : await db.select({
            sessionIndex: classSessions.sessionIndex,
            sessionDate: classSessions.sessionDate,
            weekday: classSessions.weekday,
          }).from(classSessions)
            .where(eq(classSessions.classId, classId))
            .orderBy(desc(classSessions.sessionIndex))
            .limit(1);

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
        startDate,
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

            // Tìm ngày đầu tiên của chu kỳ MỚI (sessions đã được tái tạo sau updateClassCycle)
            let newCycleFirstDate: string | undefined = fromSession.sessionDate ?? undefined;
            if (fromSession.sessionDate) {
              const [firstNewRow] = await db
                .select({ sessionDate: classSessions.sessionDate })
                .from(classSessions)
                .where(and(
                  eq(classSessions.classId, classId),
                  gte(classSessions.sessionDate, fromSession.sessionDate),
                ))
                .orderBy(asc(classSessions.sessionDate))
                .limit(1);
              if (firstNewRow?.sessionDate) newCycleFirstDate = firstNewRow.sessionDate;
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
                referenceDate: newCycleFirstDate,
                deeplink: {
                  screen: "Calendar",
                  params: {
                    classId,
                    ...(newCycleFirstDate ? { date: newCycleFirstDate } : {}),
                  },
                },
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
                referenceDate: newCycleFirstDate,
                deeplink: {
                  screen: "Calendar",
                  params: {
                    classId,
                    ...(newCycleFirstDate ? { date: newCycleFirstDate } : {}),
                  },
                },
              });
            }

            // Notification Engine — dùng fromSession đã pre-fetch trước khi sessions bị tái tạo
            const newWeekdaysArr: number[] = Array.isArray(weekdays) ? weekdays : [];
            sendUpdateCycleNotification({
              classId,
              fromWeekday: fromSession.weekday ?? 0,
              fromDate: fromSession.sessionDate ?? "",
              fromShiftTemplateId: fromSession.shiftTemplateId ?? null,
              newWeekdays: newWeekdaysArr,
              reason: reason ?? "",
            }).catch(err => console.error("[UpdateCycle] NotificationEngine error:", err));
          }
        } catch (notiErr) {
          console.error("[UpdateCycle] Notification error:", notiErr);
        }
      }

      let updateCycleConflicts: any[] = [];
      try {
        const { checkScheduleConflicts } = await import("../services/conflict-check.service");
        if (fromSession && toSession) {
          const fi = fromSession.sessionIndex ?? 0;
          const ti = toSession.sessionIndex ?? 0;
          const sessForCheck = await db.select({
            sessionDate: classSessions.sessionDate,
            shiftTemplateId: classSessions.shiftTemplateId,
            roomId: classSessions.roomId,
            teacherIds: classSessions.teacherIds,
          }).from(classSessions).where(and(
            eq(classSessions.classId, classId),
            between(classSessions.sessionIndex, fi, ti),
          ));
          updateCycleConflicts = await checkScheduleConflicts(sessForCheck, classId);
        }
      } catch (ce) {
        console.error("[ConflictCheck] update-cycle:", ce);
      }

      res.json({ success: true, conflicts: updateCycleConflicts });
      emitCalendarUpdateForClass(classId).catch(() => {});
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

      // Pre-fetch session info trước khi hủy (session bị cancelled nhưng ID vẫn còn)
      const [cancelFromSession] = await db.select({
        weekday: classSessions.weekday,
        sessionDate: classSessions.sessionDate,
        shiftTemplateId: classSessions.shiftTemplateId,
      }).from(classSessions).where(eq(classSessions.id, fromSessionId)).limit(1);

      await storage.cancelClassSessions({
        classId,
        fromSessionId,
        toSessionId,
        reason,
        userId
      });

      // Notification Engine
      if (cancelFromSession) {
        sendCancelSessionNotification({
          classId,
          weekday: cancelFromSession.weekday ?? 0,
          sessionDate: cancelFromSession.sessionDate ?? "",
          shiftTemplateId: cancelFromSession.shiftTemplateId,
          reason: reason ?? "",
        }).catch(err => console.error("[CancelSession] NotificationEngine error:", err));
      }

      res.json({ success: true });
      emitCalendarUpdateForClass(classId).catch(() => {});
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể hủy buổi học" });
    }
  });

  // Check attendance for exclusion
  app.post(api.classes.checkAttendanceForExclusion.path, async (req, res) => {
    try {
      const { classId } = req.body;
      if (!classId) return res.status(400).json({ message: "Missing classId" });

      // Support both multi-range and legacy single-range
      const ranges: { fromSessionId: string; toSessionId: string }[] = Array.isArray(req.body.ranges)
        ? req.body.ranges
        : [{ fromSessionId: req.body.fromSessionId, toSessionId: req.body.toSessionId }];

      if (ranges.length === 0 || ranges.some(r => !r.fromSessionId || !r.toSessionId)) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const allSessionIds: string[] = [];
      for (const range of ranges) {
        const fromSession = await storage.getClassSession(range.fromSessionId);
        const toSession   = await storage.getClassSession(range.toSessionId);
        if (!fromSession || !toSession) return res.status(404).json({ message: "Session not found" });

        const fromIndex = fromSession.sessionIndex || 0;
        const toIndex   = toSession.sessionIndex   || 0;
        const sessions  = await db.select({ id: classSessions.id })
          .from(classSessions)
          .where(and(
            eq(classSessions.classId, classId),
            sql`${classSessions.sessionIndex} BETWEEN ${Math.min(fromIndex, toIndex)} AND ${Math.max(fromIndex, toIndex)}`
          ));
        allSessionIds.push(...sessions.map(s => s.id));
      }

      let hasAttendance = false;
      if (allSessionIds.length > 0) {
        const attendedCount = await db.select({ count: sql<number>`count(*)` })
          .from(studentSessions)
          .where(and(
            inArray(studentSessions.classSessionId, allSessionIds),
            sql`${studentSessions.attendanceStatus} IS NOT NULL AND ${studentSessions.attendanceStatus} != 'pending'`
          ));
        hasAttendance = (attendedCount[0]?.count || 0) > 0;
      }

      res.json({ hasAttendance });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Exclude sessions (supports multi-range via ranges[])
  app.post(api.classes.excludeSessions.path, async (req, res) => {
    try {
      const { classId, reason } = req.body;
      const userId = (req.user as any).id;

      // Support both multi-range and legacy single-range
      const inputRanges: { fromSessionId: string; toSessionId: string }[] = Array.isArray(req.body.ranges)
        ? req.body.ranges
        : [{ fromSessionId: req.body.fromSessionId, toSessionId: req.body.toSessionId }];

      if (!classId || inputRanges.length === 0 || inputRanges.some(r => !r.fromSessionId || !r.toSessionId)) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Resolve sessionIndex for each range so we can sort descending (process last range first)
      const resolvedRanges: { fromSessionId: string; toSessionId: string; fromIndex: number; toIndex: number }[] = [];
      for (const range of inputRanges) {
        const [fromSession] = await db.select({ sessionIndex: classSessions.sessionIndex })
          .from(classSessions).where(eq(classSessions.id, range.fromSessionId)).limit(1);
        const [toSession] = await db.select({ sessionIndex: classSessions.sessionIndex })
          .from(classSessions).where(eq(classSessions.id, range.toSessionId)).limit(1);
        if (!fromSession || !toSession) return res.status(404).json({ message: "Session not found" });
        resolvedRanges.push({
          fromSessionId: range.fromSessionId,
          toSessionId: range.toSessionId,
          fromIndex: Math.min(fromSession.sessionIndex ?? 0, toSession.sessionIndex ?? 0),
          toIndex:   Math.max(fromSession.sessionIndex ?? 0, toSession.sessionIndex ?? 0),
        });
      }

      // Validate no overlapping ranges
      const sorted = [...resolvedRanges].sort((a, b) => a.fromIndex - b.fromIndex);
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].toIndex >= sorted[i + 1].fromIndex) {
          return res.status(400).json({ message: "Các khoảng loại trừ không được chồng chéo nhau" });
        }
      }

      // Collect pre-exclusion data for notifications and activity log
      const oldTeacherIdsSet = new Set<string>();
      const allStudentUserIds: string[] = [];
      let excludeSessionsBefore: CycleSessionInfo[] = [];

      for (const r of resolvedRanges) {
        const sessionsInRange = await db.select({ teacherIds: classSessions.teacherIds })
          .from(classSessions).where(and(
            eq(classSessions.classId, classId),
            between(classSessions.sessionIndex, r.fromIndex, r.toIndex),
          ));
        for (const s of sessionsInRange) {
          (s.teacherIds ?? []).forEach(id => oldTeacherIdsSet.add(id));
        }
        const stuIds = await resolveStudentUserIdsInSessionRange(classId, r.fromIndex, r.toIndex);
        allStudentUserIds.push(...stuIds);
        const beforeSessions = await fetchSessionsWithTeachers(classId, r.fromIndex, r.toIndex);
        excludeSessionsBefore.push(...beforeSessions);
      }

      // Pre-fetch first/last session data TRƯỚC KHI xóa (excludeClassSessions sẽ DELETE sessions)
      const firstSortedRange = sorted[0];
      const lastSortedRange = sorted[sorted.length - 1];
      let excludeFromSession: { weekday: number | null; sessionDate: string; shiftTemplateId: string | null } | null = null;
      let excludeToSession: { weekday: number | null; sessionDate: string; shiftTemplateId: string | null } | null = null;
      if (firstSortedRange) {
        const [r] = await db.select({
          weekday: classSessions.weekday,
          sessionDate: classSessions.sessionDate,
          shiftTemplateId: classSessions.shiftTemplateId,
        }).from(classSessions).where(eq(classSessions.id, firstSortedRange.fromSessionId)).limit(1);
        if (r) excludeFromSession = r;
      }
      if (lastSortedRange) {
        const [r] = await db.select({
          weekday: classSessions.weekday,
          sessionDate: classSessions.sessionDate,
          shiftTemplateId: classSessions.shiftTemplateId,
        }).from(classSessions).where(eq(classSessions.id, lastSortedRange.toSessionId)).limit(1);
        if (r) excludeToSession = r;
      }

      // Process ranges in REVERSE order (highest sessionIndex first).
      // This ensures each earlier range's indices are unaffected when we process it next.
      const descRanges = [...resolvedRanges].sort((a, b) => b.fromIndex - a.fromIndex);
      for (const r of descRanges) {
        await storage.excludeClassSessions({
          classId,
          fromSessionId: r.fromSessionId,
          toSessionId:   r.toSessionId,
          reason,
          userId,
          weekdays: Array.isArray(req.body.weekdays) ? req.body.weekdays : undefined,
        });
      }

      // Activity log
      try {
        const [exClassInfo] = await db.select({ locationId: classes.locationId })
          .from(classes).where(eq(classes.id, classId)).limit(1);
        await createActivityLog({
          userId,
          locationId: exClassInfo?.locationId ?? null,
          classId,
          action: "Loại trừ ngày",
          oldContent: JSON.stringify(excludeSessionsBefore),
          newContent: JSON.stringify([]),
        });
      } catch (logErr) {
        console.error("[ExcludeSessions] Activity log error:", logErr);
      }

      // Notifications
      try {
        const [classInfo] = await db.select({
          name: classes.name,
          classCode: classes.classCode,
          managerIds: classes.managerIds,
        }).from(classes).where(eq(classes.id, classId)).limit(1);

        if (classInfo) {
          const rangeLabels = sorted.map(r => `Buổi ${r.fromIndex}–${r.toIndex}`).join(", ");
          const content = `Lớp ${classInfo.name ?? ""} (${classInfo.classCode ?? ""}) vừa được cập nhật loại trừ lịch học: ${rangeLabels}. Lý do: ${reason ?? ""}`;
          const staffUserIds = await resolveStaffUserIds([...new Set([...oldTeacherIdsSet, ...(classInfo.managerIds ?? [])])]);
          const allRecipients = [...new Set([...staffUserIds, ...allStudentUserIds])];

          // Tìm buổi học đầu tiên SAU khoảng loại trừ → route học viên đến "buổi tiếp theo"
          let nextSessionAfterExclusion: string | undefined = undefined;
          if (excludeToSession?.sessionDate) {
            const [nextRow] = await db
              .select({ sessionDate: classSessions.sessionDate })
              .from(classSessions)
              .where(and(
                eq(classSessions.classId, classId),
                gt(classSessions.sessionDate, excludeToSession.sessionDate),
              ))
              .orderBy(asc(classSessions.sessionDate))
              .limit(1);
            nextSessionAfterExclusion = nextRow?.sessionDate ?? excludeFromSession?.sessionDate ?? undefined;
          }

          if (allRecipients.length > 0) {
            await sendNotificationToMany(allRecipients, {
              title: "Thông báo loại trừ lịch học",
              content,
              category: "schedule",
              referenceId: classId,
              referenceType: "class",
              referenceDate: nextSessionAfterExclusion,
              deeplink: {
                screen: "Calendar",
                params: {
                  classId,
                  ...(nextSessionAfterExclusion ? { date: nextSessionAfterExclusion } : {}),
                },
              },
            });
          }

          // Notification Engine — dùng data đã pre-fetch trước khi sessions bị xóa
          if (excludeFromSession && excludeToSession) {
            sendExcludeDatesNotification({
              classId,
              fromWeekday: excludeFromSession.weekday ?? 0,
              fromDate: excludeFromSession.sessionDate ?? "",
              fromShiftTemplateId: excludeFromSession.shiftTemplateId,
              toWeekday: excludeToSession.weekday ?? 0,
              toDate: excludeToSession.sessionDate ?? "",
              toShiftTemplateId: excludeToSession.shiftTemplateId,
              reason: reason ?? "",
            }).catch(err => console.error("[ExcludeSessions] NotificationEngine error:", err));
          }
        }
      } catch (notiErr) {
        console.error("[ExcludeSessions] Notification error:", notiErr);
      }

      res.json({ success: true });
      emitCalendarUpdateForClass(classId).catch(() => {});
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

  // Detect distinct weekday-cycle patterns for a class
  app.get(api.classes.cycles.path, async (req, res) => {
    try {
      const cycles = await storage.getClassCycles(req.params.id);
      res.json(cycles);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể lấy thông tin chu kỳ" });
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

      // Fetch test sessions in the same date range
      let testSessionQuery = `
        SELECT ts.id, ts.title, ts.location_id, ts.test_date::text AS test_date, ts.time_start, ts.time_end,
               ts.teacher_ids, ts.student_ids, l.name AS location_name
        FROM test_sessions ts
        LEFT JOIN locations l ON l.id = ts.location_id
        WHERE ts.test_date BETWEEN $1::date AND $2::date
      `;
      const testQueryParams: any[] = [from, to];

      if (effectiveLocationId) {
        testQueryParams.push(effectiveLocationId);
        testSessionQuery += ` AND ts.location_id = $${testQueryParams.length}::uuid`;
      } else if (allowedLocationIds !== null && allowedLocationIds.length > 0) {
        testQueryParams.push(allowedLocationIds);
        testSessionQuery += ` AND ts.location_id = ANY($${testQueryParams.length}::uuid[])`;
      }

      if (teacherId) {
        testQueryParams.push([teacherId]);
        testSessionQuery += ` AND ts.teacher_ids @> $${testQueryParams.length}::uuid[]`;
      }

      testSessionQuery += ` ORDER BY ts.test_date, ts.time_start`;

      const testResult = await pool.query(testSessionQuery, testQueryParams);
      const testRows = testResult.rows as any[];

      const testSessions = testRows.map((ts) => {
        const weekday = new Date(ts.test_date + "T00:00:00").getDay();
        return {
          id: ts.id,
          classId: ts.id,
          classCode: "TEST",
          className: ts.title,
          locationId: ts.location_id || "",
          locationName: ts.location_name || "",
          sessionDate: ts.test_date,
          weekday,
          sessionIndex: 1,
          totalSessions: 1,
          enrolledCount: (ts.student_ids || []).length,
          status: "scheduled",
          teachers: (ts.teacher_ids || []).map((id: string) => staffMap.get(id) || "").filter(Boolean),
          teacherIds: ts.teacher_ids || [],
          shiftStart: ts.time_start || "",
          shiftEnd: ts.time_end || "",
          shiftName: "Lớp TEST",
          learningFormat: "offline",
          classColor: "#f59e0b",
          roomName: null,
          lessons: [],
          homeworks: [],
          tests: [ts.title],
          curriculums: [],
          isTestSession: true,
        };
      });

      res.json([...enriched, ...testSessions]);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Bulk holiday application ────────────────────────────────────────────
  // Helper: group contiguous sessions (by sessionIndex) into ranges
  function groupIntoContiguousRanges(
    sessions: { id: string; sessionIndex: number }[]
  ): { fromSessionId: string; toSessionId: string; fromIndex: number; toIndex: number }[] {
    if (sessions.length === 0) return [];
    const sorted = [...sessions].sort((a, b) => a.sessionIndex - b.sessionIndex);
    const ranges: { fromSessionId: string; toSessionId: string; fromIndex: number; toIndex: number }[] = [];
    let rangeStart = sorted[0];
    let prev = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const curr = sorted[i];
      if (curr.sessionIndex === prev.sessionIndex + 1) {
        prev = curr;
      } else {
        ranges.push({ fromSessionId: rangeStart.id, toSessionId: prev.id, fromIndex: rangeStart.sessionIndex, toIndex: prev.sessionIndex });
        rangeStart = curr;
        prev = curr;
      }
    }
    ranges.push({ fromSessionId: rangeStart.id, toSessionId: prev.id, fromIndex: rangeStart.sessionIndex, toIndex: prev.sessionIndex });
    return ranges;
  }

  // Helper: compute which classes/sessions would be affected by the selected holidays
  async function computeHolidayBulkPlan(opts: {
    locationIds?: string[];
    teacherIds?: string[];
    holidayIds?: string[];
  }) {
    const { locationIds, teacherIds, holidayIds } = opts;

    // 1. Resolve holidays
    const holidayRows = (holidayIds && holidayIds.length > 0)
      ? await db.select({ id: publicHolidays.id, name: publicHolidays.name, startDate: publicHolidays.startDate, endDate: publicHolidays.endDate })
          .from(publicHolidays).where(inArray(publicHolidays.id, holidayIds))
      : await db.select({ id: publicHolidays.id, name: publicHolidays.name, startDate: publicHolidays.startDate, endDate: publicHolidays.endDate })
          .from(publicHolidays);

    if (holidayRows.length === 0) return { holidays: [], classes: [], totalSessions: 0 };

    // 2. Resolve active classes (and optionally filter by location)
    // Include planning/recruiting/active — same as /api/schedule which shows all non-closed classes
    const classConditions: any[] = [inArray(classes.status, ["planning", "recruiting", "active"])];
    if (locationIds && locationIds.length > 0) classConditions.push(inArray(classes.locationId, locationIds));

    const activeClasses = await db.select({ id: classes.id, name: classes.name, classCode: classes.classCode })
      .from(classes).where(and(...classConditions));

    if (activeClasses.length === 0) return { holidays: holidayRows, classes: [], totalSessions: 0 };
    const activeClassIds = activeClasses.map(c => c.id);

    // 3. Find all scheduled sessions in any holiday date range for these classes.
    //    Include past sessions: schedules can be created or corrected retroactively.
    //    Build a big OR of date ranges so we only hit the DB once.
    const dateConditions = holidayRows.map(h =>
      and(
        gte(classSessions.sessionDate, h.startDate),
        lte(classSessions.sessionDate, h.endDate)
      )
    );
    const allMatchingSessions = await db.select({
      id: classSessions.id,
      classId: classSessions.classId,
      sessionIndex: classSessions.sessionIndex,
      sessionDate: classSessions.sessionDate,
      teacherIds: classSessions.teacherIds,
    }).from(classSessions).where(and(
      inArray(classSessions.classId, activeClassIds),
      eq(classSessions.status, "scheduled"),    // only sessions not already attended/cancelled
      isNotNull(classSessions.sessionIndex),    // skip sessions missing sessionIndex (would map to 0 and cause wrong exclusion)
      or(...dateConditions)
    ));

    // 4. Filter by teacherIds (if specified) and group by class
    const classSessionMap = new Map<string, { id: string; sessionIndex: number }[]>();
    for (const session of allMatchingSessions) {
      // sessionIndex is guaranteed non-null by the query filter above
      if (session.sessionIndex == null) continue;
      if (teacherIds && teacherIds.length > 0) {
        const sessionTeachers = session.teacherIds ?? [];
        if (!teacherIds.some(tid => sessionTeachers.includes(tid))) continue;
      }
      if (!classSessionMap.has(session.classId)) classSessionMap.set(session.classId, []);
      classSessionMap.get(session.classId)!.push({ id: session.id, sessionIndex: session.sessionIndex });
    }

    // 5. Build ranges per class
    const classResults = [];
    for (const [classId, sessions] of classSessionMap) {
      const classInfo = activeClasses.find(c => c.id === classId)!;
      const ranges = groupIntoContiguousRanges(sessions);
      classResults.push({
        classId,
        className: classInfo.name ?? classInfo.classCode ?? classId,
        ranges,
        totalSessions: sessions.length,
      });
    }

    return {
      holidays: holidayRows,
      classes: classResults,
      totalSessions: classResults.reduce((s, c) => s + c.totalSessions, 0),
    };
  }

  // POST /api/schedule/preview-apply-holidays — dry-run, returns what WOULD be affected
  app.post("/api/schedule/preview-apply-holidays", async (req, res) => {
    try {
      const { locationIds, teacherIds, holidayIds } = req.body;
      if (!holidayIds || holidayIds.length === 0) {
        return res.status(400).json({ message: "Chưa chọn ngày nghỉ lễ" });
      }
      const plan = await computeHolidayBulkPlan({ locationIds, teacherIds, holidayIds });
      res.json(plan);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // POST /api/schedule/apply-holidays — actually applies the bulk exclusion
  app.post("/api/schedule/apply-holidays", async (req, res) => {
    try {
      const { locationIds, teacherIds, holidayIds } = req.body;
      const userId = (req.user as any).id;

      if (!holidayIds || holidayIds.length === 0) {
        return res.status(400).json({ message: "Chưa chọn ngày nghỉ lễ" });
      }

      const plan = await computeHolidayBulkPlan({ locationIds, teacherIds, holidayIds });

      const results: { classId: string; className: string; excluded: number; error?: string }[] = [];

      for (const classItem of plan.classes) {
        try {
          // Process ranges in REVERSE order (descending sessionIndex) so earlier indexes are unaffected.
          // Pass skipRecalculate=true to avoid redundant per-range recalculation;
          // we run a single recalculation per class after all ranges are done.
          const descRanges = [...classItem.ranges].sort((a, b) => b.fromIndex - a.fromIndex);
          for (const range of descRanges) {
            await storage.excludeClassSessions({
              classId: classItem.classId,
              fromSessionId: range.fromSessionId,
              toSessionId: range.toSessionId,
              reason: "Nghỉ lễ",
              userId,
              skipRecalculate: true,
            });
          }

          // Recalculate once per class after ALL ranges have been applied.
          // This guarantees stats reflect the final DB state, not intermediate states.
          const studentsInClass = await db
            .select({ id: studentClasses.id })
            .from(studentClasses)
            .where(eq(studentClasses.classId, classItem.classId));
          if (studentsInClass.length > 0) {
            for (const sc of studentsInClass) {
              await storage.recalculateStudentClass(sc.id);
            }
          } else {
            // No students — just sync class date range from sessions
            await db.execute(sql`
              UPDATE classes
              SET start_date = sub.s, end_date = sub.e, updated_at = NOW()
              FROM (
                SELECT MIN(session_date) AS s, MAX(session_date) AS e
                FROM class_sessions
                WHERE class_id = ${classItem.classId}
              ) sub
              WHERE id = ${classItem.classId}
            `);
          }

          results.push({ classId: classItem.classId, className: classItem.className, excluded: classItem.totalSessions });
        } catch (err: any) {
          results.push({ classId: classItem.classId, className: classItem.className, excluded: 0, error: err.message });
        }
      }

      const successCount = results.filter(r => !r.error).length;
      const failedItems = results.filter(r => r.error);

      // Activity log
      try {
        await createActivityLog({
          userId,
          locationId: null,
          classId: null,
          action: "Cập nhật nghỉ lễ hàng loạt",
          oldContent: JSON.stringify({ holidayIds }),
          newContent: JSON.stringify({ processed: successCount, failed: failedItems.length }),
        });
      } catch (_) { /* non-fatal */ }

      res.json({
        success: successCount,
        failed: failedItems.length,
        results,
      });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
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
                referenceDate: (req.body.sessionDate ?? existingSession.sessionDate) || undefined,
                deeplink: {
                  screen: "Calendar",
                  params: {
                    classId,
                    sessionId,
                    ...((req.body.sessionDate ?? existingSession.sessionDate) ? { date: (req.body.sessionDate ?? existingSession.sessionDate) } : {}),
                  },
                },
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
                referenceDate: (req.body.sessionDate ?? existingSession.sessionDate) || undefined,
                deeplink: {
                  screen: "Calendar",
                  params: {
                    classId,
                    sessionId,
                    ...((req.body.sessionDate ?? existingSession.sessionDate) ? { date: (req.body.sessionDate ?? existingSession.sessionDate) } : {}),
                  },
                },
              });
            }

            // Chuông trong app + push mobile cho học viên đang học buổi này —
            // nổ với MỌI thay đổi buổi học (giáo viên, phòng, ngày, ca…)
            try {
              const affectedStudentRows = await db
                .select({ userId: students.userId })
                .from(studentSessions)
                .innerJoin(students, eq(studentSessions.studentId, students.id))
                .where(
                  and(
                    eq(studentSessions.classSessionId, sessionId),
                    ne(studentSessions.status, "cancelled"),
                  )
                );
              const affectedStudentUserIds = Array.from(
                new Set(affectedStudentRows.map(r => r.userId).filter((id): id is string => !!id))
              );
              if (affectedStudentUserIds.length > 0) {
                await sendNotificationToMany(affectedStudentUserIds, {
                  title: "Thông báo cập nhật lịch học",
                  content: `Buổi ${sessionIdx}, ${oldWd} ${oldDateLabel} của lớp ${className} (${classCode}), đã được cập nhật sang ${newWd} ${newDateLabel}`,
                  category: "schedule",
                  referenceId: classId,
                  referenceType: "class",
                  referenceDate: (req.body.sessionDate ?? existingSession.sessionDate) || undefined,
                  deeplink: {
                    screen: "Calendar",
                    params: {
                      classId,
                      sessionId,
                      ...((req.body.sessionDate ?? existingSession.sessionDate) ? { date: (req.body.sessionDate ?? existingSession.sessionDate) } : {}),
                    },
                  },
                });
              }
            } catch (studentNotiErr) {
              console.error("[UpdateSession] Student bell notification error:", studentNotiErr);
            }

            // Notification Engine — schedule_update_session (kênh Zalo OA/ZNS, chỉ gửi khi ngày/ca thay đổi)
            const _dateChanged =
              req.body.sessionDate && req.body.sessionDate !== existingSession.sessionDate;
            const _shiftChanged =
              req.body.shiftTemplateId &&
              req.body.shiftTemplateId !== existingSession.shiftTemplateId;
            if (_dateChanged || _shiftChanged) {
              sendUpdateSessionNotification({
                classId,
                oldSessionDate: existingSession.sessionDate ?? "",
                oldWeekday: existingSession.weekday ?? 0,
                oldShiftTemplateId: existingSession.shiftTemplateId ?? null,
                newSessionDate: req.body.sessionDate ?? existingSession.sessionDate ?? "",
                newShiftTemplateId: req.body.shiftTemplateId ?? existingSession.shiftTemplateId ?? null,
              }).catch(err => console.error("[UpdateSession] NotificationEngine error:", err));
            }
          }
        } catch (notiErr) {
          console.error("[UpdateSession] Notification error:", notiErr);
        }
      }

      let updateSessionConflicts: any[] = [];
      try {
        const { checkScheduleConflicts } = await import("../services/conflict-check.service");
        const [updatedSess] = await db
          .select({
            sessionDate: classSessions.sessionDate,
            shiftTemplateId: classSessions.shiftTemplateId,
            roomId: classSessions.roomId,
            teacherIds: classSessions.teacherIds,
          })
          .from(classSessions)
          .where(eq(classSessions.id, sessionId))
          .limit(1);
        if (updatedSess) {
          updateSessionConflicts = await checkScheduleConflicts([updatedSess], existingSession?.classId);
        }
      } catch (ce) {
        console.error("[ConflictCheck] update-session:", ce);
      }

      res.json({ ...(result ?? {}), conflicts: updateSessionConflicts });
      if (existingSession) emitCalendarUpdateForClass(existingSession.classId).catch(() => {});

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
      const { studentIds, mode, numSessions, endDate, cycleMode, specificShiftIds, extensionName, autoInvoice, perStudent, useStudentCycle } = req.body;

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
        overrideClassWeekdays: Array.isArray(req.body.overrideClassWeekdays) ? req.body.overrideClassWeekdays : undefined,
        useStudentCycle: !!useStudentCycle,
        perStudent,
        userId: (req.user as any).id
      });

      // Activity log — runs synchronously before responding so it is never silently dropped
      try {
        const userId = (req.user as any)?.id ?? null;
        const userLocId = await getUserLocationId(req);

        const clsInfoResult = await db.execute(sql`SELECT location_id AS "locationId" FROM classes WHERE id = ${classId} LIMIT 1`);
        const clsInfo = (clsInfoResult.rows[0] ?? null) as { locationId: string } | null;

        // Use raw SQL to avoid Drizzle ORM orderSelectedFields bug with 3-table joins
        const newSessionsResult = await db.execute(sql`
          SELECT cs.session_index AS "sessionIndex", cs.weekday, cs.session_date AS "sessionDate", st.start_time AS "startTime"
          FROM class_sessions cs
          LEFT JOIN shift_templates st ON cs.shift_template_id = st.id
          WHERE cs.class_id = ${classId} AND cs.session_index > ${oldMaxIdx}
          ORDER BY cs.session_index ASC
        `);
        const newSessions = newSessionsResult.rows as Array<{ sessionIndex: number; weekday: number; sessionDate: string; startTime: string | null }>;

        const safeStudentIds: string[] = Array.isArray(studentIds) ? studentIds : [];
        const studentMap: Record<string, { name: string; code: string }> = {};
        if (safeStudentIds.length > 0) {
          const studentRows = await db
            .select({ id: students.id, fullName: students.fullName, code: students.code })
            .from(students)
            .where(inArray(students.id, safeStudentIds));
          for (const s of studentRows) {
            studentMap[s.id] = { name: s.fullName ?? "", code: s.code ?? "" };
          }
        }

        const perStudentMap: Record<string, boolean> = {};
        for (const ps of Array.isArray(perStudent) ? perStudent : []) {
          if (ps && ps.studentId) {
            perStudentMap[ps.studentId] = typeof ps.autoInvoice === "boolean" ? ps.autoInvoice : !!autoInvoice;
          }
        }

        const logSessions = newSessions.map((s) => ({
          sessionIndex: s.sessionIndex,
          weekday: s.weekday,
          sessionDate: s.sessionDate,
          startTime: s.startTime ?? null,
        }));

        const logStudents = await Promise.all(safeStudentIds.map(async (sid: string) => {
          const lastBeforeResult = await db.execute(sql`
            SELECT cs.session_index AS "sessionIndex", cs.weekday, cs.session_date AS "sessionDate", st.start_time AS "startTime"
            FROM student_sessions ss
            INNER JOIN class_sessions cs ON ss.class_session_id = cs.id
            LEFT JOIN shift_templates st ON cs.shift_template_id = st.id
            WHERE ss.student_id = ${sid} AND ss.class_id = ${classId} AND cs.session_index <= ${oldMaxIdx}
            ORDER BY cs.session_index DESC
            LIMIT 1
          `);
          const lastBefore = (lastBeforeResult.rows[0] ?? null) as { sessionIndex: number; weekday: number; sessionDate: string; startTime: string | null } | null;

          const afterRowsResult = await db.execute(sql`
            SELECT cs.session_index AS "sessionIndex", cs.weekday, cs.session_date AS "sessionDate", st.start_time AS "startTime"
            FROM student_sessions ss
            INNER JOIN class_sessions cs ON ss.class_session_id = cs.id
            LEFT JOIN shift_templates st ON cs.shift_template_id = st.id
            WHERE ss.student_id = ${sid} AND ss.class_id = ${classId} AND cs.session_index > ${oldMaxIdx}
            ORDER BY cs.session_index ASC
          `);
          const afterRows = afterRowsResult.rows as Array<{ sessionIndex: number; weekday: number; sessionDate: string; startTime: string | null }>;

          return {
            name: studentMap[sid]?.name ?? "",
            code: studentMap[sid]?.code ?? "",
            autoInvoice: sid in perStudentMap ? perStudentMap[sid] : !!autoInvoice,
            fromSession: lastBefore
              ? { sessionIndex: lastBefore.sessionIndex, weekday: lastBefore.weekday, sessionDate: lastBefore.sessionDate, startTime: lastBefore.startTime ?? null }
              : null,
            toSessions: afterRows.map(s => ({
              sessionIndex: s.sessionIndex,
              weekday: s.weekday,
              sessionDate: s.sessionDate,
              startTime: s.startTime ?? null,
            })),
          };
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

      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // ─── Conflict pre-check endpoints (dry-run, no save) ─────────────────────

  app.post("/api/classes/preview-conflicts", async (req, res) => {
    try {
      const { checkScheduleConflicts } = await import("../services/conflict-check.service");
      const scheduleConfig: any[] = req.body.schedule_config || [];
      const teachersConfig: any[] = req.body.teachers_config || [];
      const skipHolidays: boolean = req.body.skipHolidays === true;
      const endType: string = req.body.endType || "date";
      const sessionCount: number = endType === "sessions" ? Number(req.body.sessionCount) : 0;
      const sessions: any[] = [];

      // Load holidays if needed
      let holidays: { startDate: string; endDate: string }[] = [];
      if (skipHolidays) {
        holidays = await db.select({ startDate: publicHolidays.startDate, endDate: publicHolidays.endDate }).from(publicHolidays);
      }
      const inHoliday = (dateStr: string) => skipHolidays && holidays.some(h => dateStr >= h.startDate && dateStr <= h.endDate);

      const buildSessions = (dayConfig: any, d: Date) => {
        const dateStr = new Date(d).toISOString().split("T")[0];
        if (inHoliday(dateStr)) return;
        const weekday = d.getDay();
        for (let i = 0; i < (dayConfig.shifts || []).length; i++) {
          const shift = dayConfig.shifts[i];
          if (!shift.shift_template_id && !shift.shiftTemplateId) continue;
          const shiftKey = `${weekday}_shift${i}`;
          const teacherIds: string[] = teachersConfig
            .filter((tc: any) => tc.teacher_id && (tc.mode === "all" || (tc.mode === "specific" && (tc.shift_keys?.includes(shiftKey) || tc.shiftKeys?.includes(shiftKey)))))
            .map((tc: any) => tc.teacher_id);
          sessions.push({
            sessionDate: dateStr,
            shiftTemplateId: shift.shift_template_id || shift.shiftTemplateId,
            roomId: shift.room_id || shift.roomId || null,
            teacherIds: teacherIds.length > 0 ? teacherIds : null,
          });
        }
      };

      if (endType === "sessions") {
        const start = new Date(req.body.startDate);
        const maxDate = new Date(start);
        maxDate.setFullYear(maxDate.getFullYear() + 5);
        for (let d = new Date(start); d <= maxDate && sessions.length < sessionCount; d.setDate(d.getDate() + 1)) {
          const dayConfig = scheduleConfig.find((c: any) => Number(c.weekday) === d.getDay());
          if (dayConfig) buildSessions(dayConfig, d);
          if (sessions.length > sessionCount) sessions.length = sessionCount;
        }
      } else {
        const start = new Date(req.body.startDate);
        const end = new Date(req.body.endDate);
        if (skipHolidays) {
          // Compute target session count from date range (without holiday skip)
          let targetCount = 0;
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dayConfig = scheduleConfig.find((c: any) => Number(c.weekday) === d.getDay());
            if (dayConfig?.shifts) {
              for (const shift of dayConfig.shifts) {
                if (shift.shift_template_id || shift.shiftTemplateId) targetCount++;
              }
            }
          }
          const maxDate = new Date(start);
          maxDate.setFullYear(maxDate.getFullYear() + 5);
          for (let d = new Date(start); d <= maxDate && sessions.length < targetCount; d.setDate(d.getDate() + 1)) {
            const dayConfig = scheduleConfig.find((c: any) => Number(c.weekday) === d.getDay());
            if (dayConfig) buildSessions(dayConfig, d);
            if (sessions.length > targetCount) sessions.length = targetCount;
          }
        } else {
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dayConfig = scheduleConfig.find((c: any) => Number(c.weekday) === d.getDay());
            if (dayConfig) buildSessions(dayConfig, d);
          }
        }
      }

      const conflicts = sessions.length > 0 ? await checkScheduleConflicts(sessions, null) : [];
      res.json({ conflicts });
    } catch {
      res.json({ conflicts: [] });
    }
  });

  app.post("/api/class-sessions/:id/preview-conflicts", async (req, res) => {
    try {
      const { checkScheduleConflicts } = await import("../services/conflict-check.service");
      const [existing] = await db.select({
        classId: classSessions.classId,
        sessionDate: classSessions.sessionDate,
        shiftTemplateId: classSessions.shiftTemplateId,
        roomId: classSessions.roomId,
        teacherIds: classSessions.teacherIds,
      }).from(classSessions).where(eq(classSessions.id, req.params.id)).limit(1);
      if (!existing) return res.json({ conflicts: [] });
      const preview = {
        sessionDate: req.body.sessionDate ?? existing.sessionDate,
        shiftTemplateId: req.body.shiftTemplateId ?? existing.shiftTemplateId,
        roomId: req.body.roomId ?? existing.roomId,
        teacherIds: req.body.teacherIds ?? existing.teacherIds,
      };
      const conflicts = await checkScheduleConflicts([preview], existing.classId);
      res.json({ conflicts });
    } catch {
      res.json({ conflicts: [] });
    }
  });

  app.post("/api/classes/:id/preview-teacher-conflicts", async (req, res) => {
    try {
      const { checkScheduleConflicts } = await import("../services/conflict-check.service");
      const classId = req.params.id;
      const { newTeacherIds, fromSessionId, toSessionId } = req.body;
      const [[fromSess], [toSess]] = await Promise.all([
        db.select({ sessionDate: classSessions.sessionDate }).from(classSessions).where(eq(classSessions.id, fromSessionId)).limit(1),
        db.select({ sessionDate: classSessions.sessionDate }).from(classSessions).where(eq(classSessions.id, toSessionId)).limit(1),
      ]);
      if (!fromSess?.sessionDate || !toSess?.sessionDate) return res.json({ conflicts: [] });
      const sessForCheck = await db.select({
        sessionDate: classSessions.sessionDate,
        shiftTemplateId: classSessions.shiftTemplateId,
        roomId: classSessions.roomId,
      }).from(classSessions).where(and(
        eq(classSessions.classId, classId),
        sql`${classSessions.sessionDate} BETWEEN ${fromSess.sessionDate} AND ${toSess.sessionDate}`,
      ));
      const previewSessions = sessForCheck.map(s => ({ ...s, teacherIds: newTeacherIds }));
      const conflicts = await checkScheduleConflicts(previewSessions, classId);
      res.json({ conflicts });
    } catch {
      res.json({ conflicts: [] });
    }
  });

  // Preview conflicts for exclude-sessions (compensating sessions at end of schedule)
  app.post("/api/classes/preview-exclude-conflicts", async (req, res) => {
    try {
      const { checkScheduleConflicts } = await import("../services/conflict-check.service");
      const { classId, ranges } = req.body as {
        classId: string;
        ranges: { fromSessionId: string; toSessionId: string }[];
      };
      if (!classId || !ranges?.length) return res.json({ conflicts: [] });

      // Fetch all sessions for this class sorted by sessionIndex
      const allSessions = await db
        .select({
          id: classSessions.id,
          sessionIndex: classSessions.sessionIndex,
          sessionDate: classSessions.sessionDate,
          weekday: classSessions.weekday,
          shiftTemplateId: classSessions.shiftTemplateId,
          roomId: classSessions.roomId,
          teacherIds: classSessions.teacherIds,
        })
        .from(classSessions)
        .where(eq(classSessions.classId, classId))
        .orderBy(asc(classSessions.sessionIndex));

      if (!allSessions.length) return res.json({ conflicts: [] });

      // Resolve each range to sessionIndex bounds
      const resolvedRanges: { fromIndex: number; toIndex: number }[] = [];
      for (const r of ranges) {
        const fromSess = allSessions.find(s => s.id === r.fromSessionId);
        const toSess = allSessions.find(s => s.id === r.toSessionId);
        if (!fromSess || !toSess) continue;
        const fi = Math.min(fromSess.sessionIndex ?? 0, toSess.sessionIndex ?? 0);
        const ti = Math.max(fromSess.sessionIndex ?? 0, toSess.sessionIndex ?? 0);
        resolvedRanges.push({ fromIndex: fi, toIndex: ti });
      }
      if (!resolvedRanges.length) return res.json({ conflicts: [] });

      const excludedIndexes = new Set<number>();
      let totalShiftCount = 0;
      for (const r of resolvedRanges) {
        for (let i = r.fromIndex; i <= r.toIndex; i++) excludedIndexes.add(i);
        totalShiftCount += r.toIndex - r.fromIndex + 1;
      }

      // Find last remaining session (not excluded)
      const remainingSessions = allSessions.filter(s => !excludedIndexes.has(s.sessionIndex ?? -1));
      if (!remainingSessions.length) return res.json({ conflicts: [] });
      const lastRemaining = remainingSessions[remainingSessions.length - 1];

      // Get weekdays for compensating sessions from class cycleHistory or weekdays column
      const [classRow] = await db
        .select({ weekdays: classes.weekdays, cycleHistory: classes.cycleHistory })
        .from(classes)
        .where(eq(classes.id, classId))
        .limit(1);

      let compWeekdays: number[] = [];
      const history = classRow?.cycleHistory as Array<{ fromSessionIndex: number; weekdays: number[] }> | null;
      if (history && Array.isArray(history) && history.length > 0) {
        const last = [...history].sort((a, b) => b.fromSessionIndex - a.fromSessionIndex)[0];
        if (last.weekdays.length > 0) compWeekdays = last.weekdays;
      }
      if (!compWeekdays.length) compWeekdays = classRow?.weekdays ?? [];
      if (!compWeekdays.length) return res.json({ conflicts: [] });

      // Determine starting date for compensating sessions
      // Same logic as excludeClassSessions: max(lastRemainingDate, lastExcludedDate)
      const lastExcluded = allSessions.filter(s => excludedIndexes.has(s.sessionIndex ?? -1)).pop();
      const lastRemainingDate = new Date(lastRemaining.sessionDate + "T00:00:00");
      const lastExcludedDate = lastExcluded ? new Date(lastExcluded.sessionDate + "T00:00:00") : lastRemainingDate;
      let currentDate = lastRemainingDate > lastExcludedDate ? new Date(lastRemainingDate) : new Date(lastExcludedDate);

      // Project compensating session dates (same loop as excludeClassSessions)
      const previewSessions = [];
      for (let i = 0; i < totalShiftCount; i++) {
        do {
          currentDate.setDate(currentDate.getDate() + 1);
        } while (!compWeekdays.includes(currentDate.getDay()));

        previewSessions.push({
          sessionDate: currentDate.toISOString().split("T")[0],
          shiftTemplateId: lastRemaining.shiftTemplateId,
          roomId: lastRemaining.roomId,
          teacherIds: lastRemaining.teacherIds || [],
        });
      }

      const conflicts = await checkScheduleConflicts(previewSessions, classId);
      res.json({ conflicts });
    } catch (err) {
      console.error("[preview-exclude-conflicts]", err);
      res.json({ conflicts: [] });
    }
  });

  app.post("/api/classes/:id/preview-cycle-conflicts", async (req, res) => {
    try {
      const { checkScheduleConflicts } = await import("../services/conflict-check.service");
      const classId = req.params.id;
      const { fromSessionId, toSessionId, startDate, weekdays, weekdayConfigs } = req.body;

      const [[fromSess], [toSess]] = await Promise.all([
        db.select({ sessionIndex: classSessions.sessionIndex, sessionDate: classSessions.sessionDate })
          .from(classSessions).where(and(
            eq(classSessions.id, fromSessionId),
            eq(classSessions.classId, classId),
          )).limit(1),
        toSessionId
          ? db.select({ sessionIndex: classSessions.sessionIndex })
              .from(classSessions).where(and(
                eq(classSessions.id, toSessionId),
                eq(classSessions.classId, classId),
              )).limit(1)
          : db.select({ sessionIndex: classSessions.sessionIndex })
              .from(classSessions)
              .where(eq(classSessions.classId, classId))
              .orderBy(desc(classSessions.sessionIndex))
              .limit(1),
      ]);
      if (!fromSess || !toSess) return res.json({ conflicts: [] });

      const fi = fromSess.sessionIndex ?? 0;
      const ti = toSess.sessionIndex ?? 9999;

      // Use the explicit weekdays list; fall back to keys of weekdayConfigs
      const weekdaysList: number[] = Array.isArray(weekdays) && weekdays.length > 0
        ? weekdays.map(Number)
        : Object.keys(weekdayConfigs ?? {}).map(Number);

      if (!weekdaysList.length) return res.json({ conflicts: [] });

      // Simulate the EXACT same date-projection logic as the actual updateCycle
      // so we check conflicts against the future dates, not the current DB dates
      const previewSessions: { sessionDate: string; shiftTemplateId: string; roomId: string | null; teacherIds: string[] }[] = [];
      const previewStartDate =
        typeof startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(startDate)
          ? startDate
          : fromSess.sessionDate;
      const cur = new Date(previewStartDate + "T00:00:00");
      const formatDateOnly = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };

      for (let i = fi; i <= ti; i++) {
        while (!weekdaysList.includes(cur.getDay())) {
          cur.setDate(cur.getDate() + 1);
        }
        const wd = cur.getDay();
        const cfg = weekdayConfigs?.[wd];
        if (cfg?.shiftTemplateId) {
          previewSessions.push({
            sessionDate: formatDateOnly(cur),
            shiftTemplateId: cfg.shiftTemplateId,
            roomId: cfg.roomId || null,
            teacherIds: cfg.teacherIds || [],
          });
        }
        cur.setDate(cur.getDate() + 1);
      }

      const conflicts = await checkScheduleConflicts(previewSessions, classId);
      res.json({ conflicts });
    } catch {
      res.json({ conflicts: [] });
    }
  });

  // Classes - CRUD
  app.post(api.classes.create.path, async (req, res) => {
    try {
      const clsPerms = await getClassPermissions(req);
      if (!clsPerms.canCreate) return res.status(403).json({ message: "Bạn không có quyền tạo lớp học." });
      console.log("Creating class with body:", JSON.stringify(req.body, null, 2));
      const cls = await storage.createClass(req.body);

      let conflicts: any[] = [];
      try {
        const { checkScheduleConflicts } = await import("../services/conflict-check.service");
        const generated = await db.select({
          sessionDate: classSessions.sessionDate,
          shiftTemplateId: classSessions.shiftTemplateId,
          roomId: classSessions.roomId,
          teacherIds: classSessions.teacherIds,
        }).from(classSessions).where(eq(classSessions.classId, cls.id));
        console.log(`[ConflictCheck] create: ${generated.length} sessions, sample:`, JSON.stringify(generated.slice(0, 2)));
        conflicts = await checkScheduleConflicts(generated, cls.id);
        console.log(`[ConflictCheck] create: ${conflicts.length} conflicts found`);
      } catch (ce) {
        console.error("[ConflictCheck] create:", ce);
      }

      res.status(201).json({ ...cls, conflicts });

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
      const clsPerms = await getClassPermissions(req);
      if (!clsPerms.canEdit) return res.status(403).json({ message: "Bạn không có quyền chỉnh sửa lớp học." });
      const classId = req.params.id;
      const oldCls = await getClassForLog(classId);
      const cls = await storage.updateClass(classId, req.body);
      res.json(cls);

      const userId = (req.user as any)?.id ?? null;

      // Detect online link update → dedicated log entry
      if ("onlineLink" in req.body && Object.keys(req.body).length === 1) {
        const oldLink = oldCls?.onlineLink ?? null;
        const newLink = req.body.onlineLink ?? null;
        getUserLocationId(req).then(async (userLocId) => {
          createActivityLog({
            userId,
            locationId: userLocId ?? oldCls?.locationId ?? null,
            classId,
            action: "Gán link online",
            oldContent: oldLink,
            newContent: JSON.stringify({
              link: newLink,
              className: oldCls?.name ?? "",
              classCode: oldCls?.classCode ?? "",
            }),
          }).catch(() => {});
        }).catch(() => {});
        return;
      }

      // General class edit log (fire-and-forget)
      if (oldCls) {
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
      const clsPerms = await getClassPermissions(req);
      if (!clsPerms.canDelete) return res.status(403).json({ message: "Bạn không có quyền xóa lớp học." });
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
      const clsPerms = await getClassPermissions(req);
      if (!clsPerms.canDelete) return res.status(403).json({ message: "Bạn không có quyền xóa lớp học." });
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
        studentIds: studentIdsParam,
      } = req.query as Record<string, string | string[]>;

      const pageNum = Math.max(1, parseInt(String(page)));
      const pageSizeNum = Math.min(50, Math.max(20, parseInt(String(pageSize))));
      const offsetNum = (pageNum - 1) * pageSizeNum;
      const selectedClasses = classesParam
        ? (Array.isArray(classesParam) ? classesParam : [classesParam]) as string[]
        : [] as string[];
      const filterStudentIds = studentIdsParam
        ? String(studentIdsParam).split(",").map((s) => s.trim()).filter(Boolean)
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
            AND sl.location_id = ANY(ARRAY[${sql.raw(allowedLocationIds.map(id => `'${id}'`).join(','))}]::uuid[])
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

      let studentIdsCond = sql``;
      if (filterStudentIds.length > 0) {
        studentIdsCond = sql`AND b.student_id = ANY(ARRAY[${sql.join(filterStudentIds.map((id) => sql`${id}::uuid`), sql`, `)}])`;
      }
      const result = await db.execute(sql`
        WITH base AS (
          SELECT
            sc.id,
            sc.student_id,
            sc.class_id,
            sc.status,
            sc.start_date,
            (SELECT MAX(cs_act.session_date)
             FROM student_sessions ss_act
             INNER JOIN class_sessions cs_act ON ss_act.class_session_id = cs_act.id
             WHERE (ss_act.student_class_id = sc.id
                OR (ss_act.student_class_id IS NULL AND ss_act.student_id = sc.student_id AND ss_act.class_id = sc.class_id))
               AND cs_act.status != 'cancelled'
            ) AS end_date,
            sc.student_status,
            sc.total_sessions,
            sc.attended_sessions,
            (
              SELECT COUNT(*)::int
              FROM student_sessions ss
              INNER JOIN class_sessions cs ON ss.class_session_id = cs.id
              WHERE (ss.student_class_id = sc.id
                OR (ss.student_class_id IS NULL AND ss.student_id = sc.student_id AND ss.class_id = sc.class_id))
                AND cs.session_date >= ${today}::date
                AND cs.status != 'cancelled'
            ) AS remaining_sessions,
            s.code AS student_code,
            s.full_name AS student_name,
            s.phone AS student_phone,
            s.email AS student_email,
            s.account_status,
            c.class_code,
            c.name AS class_name
          FROM student_classes sc
          INNER JOIN students s ON sc.student_id = s.id
          INNER JOIN classes c ON sc.class_id = c.id
          WHERE sc.status = 'active'
            AND ${locationClause}
            AND EXISTS (
              SELECT 1
              FROM student_sessions ss_scheduled
              INNER JOIN class_sessions cs_scheduled ON ss_scheduled.class_session_id = cs_scheduled.id
              WHERE (ss_scheduled.student_class_id = sc.id
                OR (ss_scheduled.student_class_id IS NULL AND ss_scheduled.student_id = sc.student_id AND ss_scheduled.class_id = sc.class_id))
                AND cs_scheduled.status != 'cancelled'
            )
            AND (
              SELECT COUNT(*)::int
              FROM student_sessions ss
              INNER JOIN class_sessions cs ON ss.class_session_id = cs.id
              WHERE (ss.student_class_id = sc.id
                OR (ss.student_class_id IS NULL AND ss.student_id = sc.student_id AND ss.class_id = sc.class_id))
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
          b.account_status AS "accountStatus",
          b.class_code AS "classCode",
          b.class_name AS "className",
          CASE WHEN b.end_date < ${today}::date THEN 2 WHEN b.remaining_sessions < 5 THEN 0 ELSE 1 END AS status_priority,
          CASE WHEN b.account_status = 'Không hoạt động' THEN 1 ELSE 0 END AS account_rank,
          COUNT(*) OVER() AS total_count
        FROM base b
        WHERE 1=1
          ${searchCond}
          ${classCond}
          ${maxRemainingCond}
          ${dateFromCond}
          ${dateToCond}
          ${statusCond}
          ${studentIdsCond}
        ORDER BY account_rank ASC, status_priority ASC, b.remaining_sessions ASC, b.end_date ASC
        LIMIT ${pageSizeNum} OFFSET ${offsetNum}
      `);

      const classesResult = await db.execute(sql`
        SELECT DISTINCT c.class_code, c.name AS class_name
        FROM student_classes sc
        INNER JOIN classes c ON sc.class_id = c.id
        WHERE sc.status = 'active'
          AND ${locationClause}
          AND EXISTS (
            SELECT 1
            FROM student_sessions ss_scheduled
            INNER JOIN class_sessions cs_scheduled ON ss_scheduled.class_session_id = cs_scheduled.id
            WHERE (ss_scheduled.student_class_id = sc.id
              OR (ss_scheduled.student_class_id IS NULL AND ss_scheduled.student_id = sc.student_id AND ss_scheduled.class_id = sc.class_id))
              AND cs_scheduled.status != 'cancelled'
          )
          AND (
            SELECT COUNT(*)::int
            FROM student_sessions ss
            INNER JOIN class_sessions cs ON ss.class_session_id = cs.id
            WHERE (ss.student_class_id = sc.id
              OR (ss.student_class_id IS NULL AND ss.student_id = sc.student_id AND ss.class_id = sc.class_id))
              AND cs.session_date >= ${today}::date
              AND cs.status != 'cancelled'
          ) <= 10
        ORDER BY c.class_code
      `);

      const rows = result.rows as any[];
      const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
      const data = rows.map(({ status_priority, account_rank, total_count, ...rest }) => rest);
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

  // Student Classes - learning overview (server-side paginated)
  app.get(api.studentClasses.studentClassList.path, async (req, res) => {
    try {
      const allowedLocationIds = req.allowedLocationIds;
      const isSuperAdmin = req.isSuperAdmin;

      if (!isSuperAdmin && allowedLocationIds && allowedLocationIds.length === 0) {
        return res.json({ data: [], total: 0, page: 1, pageSize: 20, availableClasses: [] });
      }

      const page = Math.max(1, parseInt(String(req.query.page || "1")));
      const pageSize = Math.min(50, Math.max(20, parseInt(String(req.query.pageSize || "20"))));
      const offset = (page - 1) * pageSize;
      const search = String(req.query.search || "").trim();
      const maxRemainingRaw = req.query.maxRemaining ? parseInt(String(req.query.maxRemaining)) : null;
      const startFrom = req.query.startFrom ? String(req.query.startFrom) : null;
      const startTo = req.query.startTo ? String(req.query.startTo) : null;
      const endFrom = req.query.endFrom ? String(req.query.endFrom) : null;
      const endTo = req.query.endTo ? String(req.query.endTo) : null;
      const selectedClasses: string[] = req.query.selectedClasses
        ? (Array.isArray(req.query.selectedClasses) ? req.query.selectedClasses : [req.query.selectedClasses]) as string[]
        : [];
      const selectedStatuses: string[] = req.query.selectedStatuses
        ? (Array.isArray(req.query.selectedStatuses) ? req.query.selectedStatuses : [req.query.selectedStatuses]) as string[]
        : [];

      let locationCond = sql`1=1`;
      if (!isSuperAdmin && allowedLocationIds && allowedLocationIds.length > 0) {
        locationCond = sql`EXISTS (SELECT 1 FROM student_locations sl WHERE sl.student_id = s.id AND sl.location_id = ANY(ARRAY[${sql.raw(allowedLocationIds.map(id => `'${id}'`).join(','))}]::uuid[]))`;
      }

      let searchCond = sql``;
      if (search) {
        const like = `%${search}%`;
        searchCond = sql`AND (s.code ILIKE ${like} OR s.full_name ILIKE ${like})`;
      }

      let classCond = sql``;
      if (selectedClasses.length > 0) {
        classCond = sql`AND COALESCE(c.class_code, c.name) = ANY(ARRAY[${sql.join(selectedClasses.map((cls) => sql`${cls}`), sql`, `)}])`;
      }

      let remainingCond = sql``;
      if (maxRemainingRaw !== null && !isNaN(maxRemainingRaw)) {
        remainingCond = sql`AND sc.remaining_sessions <= ${maxRemainingRaw}`;
      }

      let startFromCond = sql``;
      if (startFrom) startFromCond = sql`AND sc.start_date >= ${startFrom}::date`;
      let startToCond = sql``;
      if (startTo) startToCond = sql`AND sc.start_date <= ${startTo}::date`;
      let endFromCond = sql``;
      if (endFrom) endFromCond = sql`AND sc.end_date >= ${endFrom}::date`;
      let endToCond = sql``;
      if (endTo) endToCond = sql`AND sc.end_date <= ${endTo}::date`;

      let statusCond = sql``;
      if (selectedStatuses.length > 0) {
        const parts: any[] = [];
        if (selectedStatuses.includes("waiting")) parts.push(sql`(sc.start_date IS NULL AND sc.end_date IS NULL)`);
        if (selectedStatuses.includes("upcoming")) parts.push(sql`(sc.start_date IS NOT NULL AND sc.start_date > CURRENT_DATE)`);
        if (selectedStatuses.includes("ended")) parts.push(sql`(sc.end_date IS NOT NULL AND sc.end_date < CURRENT_DATE)`);
        if (selectedStatuses.includes("active")) parts.push(sql`(NOT (sc.start_date IS NULL AND sc.end_date IS NULL) AND NOT (sc.start_date IS NOT NULL AND sc.start_date > CURRENT_DATE) AND NOT (sc.end_date IS NOT NULL AND sc.end_date < CURRENT_DATE))`);
        if (parts.length > 0) statusCond = sql`AND (${sql.join(parts, sql` OR `)})`;
      }

      const upperBound = offset + pageSize;

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
            (
              SELECT COUNT(*)::int
              FROM student_sessions ss_total
              WHERE ss_total.student_id = sc.student_id
                AND ss_total.class_id = sc.class_id
            ) AS total_sessions,
            sc.attended_sessions,
            sc.remaining_sessions,
            s.code AS student_code,
            s.full_name AS student_name,
            s.phone AS student_phone,
            s.email AS student_email,
            s.account_status,
            COALESCE(c.class_code, c.name) AS class_code_display,
            c.name AS class_name
          FROM student_classes sc
          INNER JOIN students s ON sc.student_id = s.id
          INNER JOIN classes c ON sc.class_id = c.id
          WHERE ${locationCond}
            ${searchCond}
            ${classCond}
            ${remainingCond}
            ${startFromCond}
            ${startToCond}
            ${endFromCond}
            ${endToCond}
            ${statusCond}
        ),
        distinct_students AS (
          SELECT DISTINCT student_id, student_code, student_name, account_status
          FROM base
        ),
        paginated_students AS (
          SELECT *,
            COUNT(*) OVER() AS total_count,
            ROW_NUMBER() OVER(ORDER BY CASE WHEN account_status = 'Không hoạt động' THEN 1 ELSE 0 END, student_code) AS row_num
          FROM distinct_students
        ),
        selected AS (
          SELECT * FROM paginated_students
          WHERE row_num > ${offset} AND row_num <= ${upperBound}
        )
        SELECT
          sel.student_id, sel.student_code, sel.student_name, sel.account_status,
          sel.total_count, sel.row_num,
          b.id AS sc_id, b.class_id, b.status, b.start_date, b.end_date, b.student_status,
          b.total_sessions, b.attended_sessions, b.remaining_sessions,
          b.student_phone, b.student_email, b.class_code_display, b.class_name
        FROM selected sel
        JOIN base b ON b.student_id = sel.student_id
        ORDER BY sel.row_num, b.class_code_display
      `);

      const rows = result.rows as any[];
      const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;

      // Match the fee-package tab's package-level schedule numbers to each
      // student/class row. Invoice totals are aggregated separately from
      // invoice items so an invoice with multiple packages is not counted
      // more than once.
      const selectedStudentIds = [...new Set(rows.map((row) => String(row.student_id)))];
      const selectedClassIds = [...new Set(rows.map((row) => String(row.class_id)))];
      const packagesByClass = new Map<string, any[]>();
      const invoiceSummaryByClass = new Map<string, any>();
      const statusPriority: Record<string, number> = { debt: 4, unpaid: 3, partial: 2, paid: 1 };

      if (selectedStudentIds.length > 0 && selectedClassIds.length > 0) {
        const [invoicePackageResult, scheduledPackageResult, classInvoiceResult] = await Promise.all([
          db.execute(sql`
            SELECT
              i.student_id AS "studentId",
              i.class_id AS "classId",
              ii.package_id AS "packageId",
              ii.package_name AS "packageName",
              SUM(ii.quantity)::int AS "registeredSessions",
              SUM(
                CASE
                  WHEN COALESCE(i.grand_total, 0) > 0
                    AND (
                      SELECT COALESCE(SUM(ii2.subtotal), 0)
                      FROM invoice_items ii2
                      WHERE ii2.invoice_id = i.id
                    ) > 0
                    THEN COALESCE(ii.subtotal, 0) * COALESCE(i.grand_total, 0) / (
                      SELECT COALESCE(SUM(ii2.subtotal), 0)
                      FROM invoice_items ii2
                      WHERE ii2.invoice_id = i.id
                    )
                  ELSE COALESCE(ii.subtotal, 0)
                END
              )::numeric AS "invoiceTotal",
              SUM(
                CASE
                  WHEN COALESCE(i.grand_total, 0) > 0
                    AND (
                      SELECT COALESCE(SUM(ii2.subtotal), 0)
                      FROM invoice_items ii2
                      WHERE ii2.invoice_id = i.id
                    ) > 0
                    THEN COALESCE(ii.subtotal, 0) * COALESCE(i.paid_amount, 0) / (
                      SELECT COALESCE(SUM(ii2.subtotal), 0)
                      FROM invoice_items ii2
                      WHERE ii2.invoice_id = i.id
                    )
                  ELSE 0
                END
              )::numeric AS "paidAmount",
              COUNT(DISTINCT i.id)::int AS "invoiceCount",
              ARRAY_AGG(DISTINCT i.code ORDER BY i.code) FILTER (WHERE i.code IS NOT NULL) AS "invoiceCodes"
            FROM invoices i
            INNER JOIN invoice_items ii ON ii.invoice_id = i.id
            WHERE i.status <> 'cancelled'
              AND ii.package_id IS NOT NULL
              AND i.student_id = ANY(ARRAY[
                ${sql.join(selectedStudentIds.map((id) => sql`${id}::uuid`), sql`, `)}
              ])
              AND i.class_id = ANY(ARRAY[
                ${sql.join(selectedClassIds.map((id) => sql`${id}::uuid`), sql`, `)}
              ])
            GROUP BY i.student_id, i.class_id, ii.package_id, ii.package_name
          `),
          db.execute(sql`
            SELECT
              ss.student_id AS "studentId",
              ss.class_id AS "classId",
              ss.package_id AS "packageId",
              MAX(cfp.name) AS "packageName",
              COUNT(*)::int AS "scheduledSessions"
            FROM student_sessions ss
            LEFT JOIN course_fee_packages cfp ON cfp.id = ss.package_id
            WHERE ss.package_id IS NOT NULL
              AND ss.student_id = ANY(ARRAY[
                ${sql.join(selectedStudentIds.map((id) => sql`${id}::uuid`), sql`, `)}
              ])
              AND ss.class_id = ANY(ARRAY[
                ${sql.join(selectedClassIds.map((id) => sql`${id}::uuid`), sql`, `)}
              ])
            GROUP BY ss.student_id, ss.class_id, ss.package_id
          `),
          db.execute(sql`
            SELECT
              i.student_id AS "studentId",
              i.class_id AS "classId",
              COALESCE(SUM(i.grand_total), 0)::numeric AS "grandTotal",
              COALESCE(SUM(i.paid_amount), 0)::numeric AS "paidAmount",
              COALESCE(SUM(i.remaining_amount), 0)::numeric AS "remainingAmount",
              COUNT(*)::int AS "count",
              ARRAY_AGG(DISTINCT i.status) AS "statuses",
              ARRAY_AGG(DISTINCT i.code ORDER BY i.code) FILTER (WHERE i.code IS NOT NULL) AS "invoiceCodes"
            FROM invoices i
            WHERE i.status <> 'cancelled'
              AND i.student_id = ANY(ARRAY[
                ${sql.join(selectedStudentIds.map((id) => sql`${id}::uuid`), sql`, `)}
              ])
              AND i.class_id = ANY(ARRAY[
                ${sql.join(selectedClassIds.map((id) => sql`${id}::uuid`), sql`, `)}
              ])
            GROUP BY i.student_id, i.class_id
          `),
        ]);

        const scheduledByPackage = new Map<string, number>();
        const scheduledPackageNames = new Map<string, string>();
        for (const row of scheduledPackageResult.rows as any[]) {
          const key = `${row.studentId}|${row.classId}|${row.packageId}`;
          scheduledByPackage.set(key, Number(row.scheduledSessions || 0));
          if (row.packageName) scheduledPackageNames.set(key, String(row.packageName));
        }

        for (const row of classInvoiceResult.rows as any[]) {
          const statuses = Array.isArray(row.statuses) ? row.statuses : [];
          const status = [...statuses].sort(
            (a, b) => (statusPriority[b] ?? 0) - (statusPriority[a] ?? 0),
          )[0] ?? "unpaid";
          invoiceSummaryByClass.set(`${row.studentId}|${row.classId}`, {
            grandTotal: Number(row.grandTotal || 0),
            paidAmount: Number(row.paidAmount || 0),
            remainingAmount: Number(row.remainingAmount || 0),
            count: Number(row.count || 0),
            status,
            invoiceCodes: Array.isArray(row.invoiceCodes)
              ? row.invoiceCodes.filter((code: unknown): code is string => typeof code === "string" && code.length > 0)
              : [],
          });
        }

        for (const row of invoicePackageResult.rows as any[]) {
          const registeredSessions = Number(row.registeredSessions || 0);
          const invoiceTotal = Number(row.invoiceTotal || 0);
          const paidAmount = Number(row.paidAmount || 0);
          const scheduledSessions = scheduledByPackage.get(
            `${row.studentId}|${row.classId}|${row.packageId}`,
          ) ?? 0;
          const packageData = {
            packageId: row.packageId,
            name: row.packageName,
            registeredSessions,
            invoiceTotal,
            paidAmount,
            paymentRate: invoiceTotal > 0 ? paidAmount / invoiceTotal : 0,
            invoiceCount: Number(row.invoiceCount || 0),
            invoiceCodes: Array.isArray(row.invoiceCodes)
              ? row.invoiceCodes.filter((code: unknown): code is string => typeof code === "string" && code.length > 0)
              : [],
            scheduledSessions,
            remainingUnscheduled: registeredSessions - scheduledSessions,
            scheduleRate: registeredSessions > 0 ? scheduledSessions / registeredSessions : 0,
          };
          const key = `${row.studentId}|${row.classId}`;
          packagesByClass.set(key, [...(packagesByClass.get(key) ?? []), packageData]);
        }

        // A package can be assigned directly to a student's class sessions
        // before (or without) an invoice item being created. Keep those
        // schedule-only packages visible and merge them with invoice packages
        // when they share the same package ID.
        for (const row of scheduledPackageResult.rows as any[]) {
          const classKey = `${row.studentId}|${row.classId}`;
          const existingPackages = packagesByClass.get(classKey) ?? [];
          if (existingPackages.some((pkg) => pkg.packageId === row.packageId)) continue;

          const scheduleKey = `${classKey}|${row.packageId}`;
          const scheduledSessions = scheduledByPackage.get(scheduleKey) ?? 0;
          packagesByClass.set(classKey, [
            ...existingPackages,
            {
              packageId: row.packageId,
              name: scheduledPackageNames.get(scheduleKey) ?? String(row.packageName || ""),
              registeredSessions: null,
              invoiceTotal: 0,
              paidAmount: 0,
              paymentRate: 0,
              invoiceCount: 0,
              invoiceCodes: [],
              scheduledSessions,
              remainingUnscheduled: null,
              scheduleRate: null,
            },
          ]);
        }
      }

      const studentMap = new Map<string, any>();
      for (const row of rows) {
        if (!studentMap.has(row.student_id)) {
          studentMap.set(row.student_id, {
            studentId: row.student_id,
            studentCode: row.student_code,
            studentName: row.student_name,
            accountStatus: row.account_status,
            rowNum: parseInt(row.row_num),
            classes: [],
          });
        }
        studentMap.get(row.student_id)!.classes.push({
          id: row.sc_id,
          studentId: row.student_id,
          classId: row.class_id,
          status: row.status,
          startDate: row.start_date,
          endDate: row.end_date,
          studentStatus: row.student_status,
          totalSessions: row.total_sessions,
          attendedSessions: row.attended_sessions,
          remainingSessions: row.remaining_sessions,
          studentCode: row.student_code,
          studentName: row.student_name,
          studentPhone: row.student_phone,
          studentEmail: row.student_email,
          accountStatus: row.account_status,
          classCode: row.class_code_display,
          className: row.class_name,
          tuitionPackages: packagesByClass.get(`${row.student_id}|${row.class_id}`) ?? [],
            invoiceSummary: invoiceSummaryByClass.get(`${row.student_id}|${row.class_id}`) ?? null,
        });
      }

      const data = Array.from(studentMap.values())
        .sort((a, b) => a.rowNum - b.rowNum)
        .map(({ rowNum, ...rest }) => rest);

      const availableClassesRes = await db.execute(sql`
        SELECT DISTINCT COALESCE(c.class_code, c.name) AS code, COALESCE(c.name, c.class_code) AS label
        FROM student_classes sc
        INNER JOIN classes c ON sc.class_id = c.id
        ORDER BY COALESCE(c.class_code, c.name)
      `);
      const availableClasses = (availableClassesRes.rows as any[]).map((r: any) => ({ code: r.code, label: r.label }));

      res.json({ data, total, page, pageSize, availableClasses });
    } catch (err: any) {
      console.error("Student classes error:", err);
      res.status(400).json({ message: err.message || "Lỗi khi tải dữ liệu" });
    }
  });

  // Remove students from sessions
  app.post(api.students.removeFromSessions.path, async (req, res) => {
    try {
      const result = await storage.removeStudentFromSessions(req.body);
      res.json({
        success: true,
        hasAttendedSessions: result.hasAttendedSessions,
        orphanedStudents: result.orphanedStudents,
      });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể kiểm tra buổi học" });
    }
  });

  app.post(api.students.removeFromSessionsConfirm.path, async (req, res) => {
    try {
      const { studentIds, studentClassId, fromSessionOrder, toSessionOrder, deleteOnlyUnattended, orphanAction } = req.body;

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
                  referenceDate: fromCS?.sessionDate ?? undefined,
                  deeplink: {
                    screen: "Calendar",
                    params: {
                      classId,
                      ...(fromCS?.sessionDate ? { date: fromCS.sessionDate } : {}),
                    },
                  },
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

      // Pre-fetch for activity log (before removal)
      let removeLogData: { classId: string; locationId: string | null; className: string; classCode: string; students: { name: string; code: string }[]; fromSessionIndex: number; toSessionIndex: number; deleteOnlyUnattended: boolean } | null = null;
      try {
        const [sc2] = await db.select({ classId: studentClasses.classId })
          .from(studentClasses).where(eq(studentClasses.id, studentClassId)).limit(1);
        if (sc2) {
          const [ci] = await db.select({ name: classes.name, classCode: classes.classCode, locationId: classes.locationId })
            .from(classes).where(eq(classes.id, sc2.classId)).limit(1);
          const stRows = await db.select({ fullName: students.fullName, code: students.code })
            .from(students).where(inArray(students.id, studentIds));
          removeLogData = {
            classId: sc2.classId,
            locationId: ci?.locationId ?? null,
            className: ci?.name ?? "",
            classCode: ci?.classCode ?? "",
            students: stRows.map(s => ({ name: s.fullName ?? "", code: s.code ?? "" })),
            fromSessionIndex: fromSessionOrder,
            toSessionIndex: toSessionOrder,
            deleteOnlyUnattended: !!deleteOnlyUnattended,
          };
        }
      } catch (logPreErr) {
        console.error("[RemoveStudentLog] Pre-fetch error:", logPreErr);
      }

      await storage.removeStudentFromSessionsConfirm({ ...req.body, orphanAction: orphanAction ?? "keep" });

      if (notificationClosure) {
        notificationClosure().catch(err => console.error("[RemoveStudentNotify] Post-confirm error:", err));
      }

      // Activity log (fire-and-forget)
      if (removeLogData) {
        const userId = (req as any).user?.id ?? null;
        createActivityLog({
          userId,
          locationId: removeLogData.locationId,
          classId: removeLogData.classId,
          action: "Xoá học viên khỏi buổi",
          oldContent: null,
          newContent: JSON.stringify({
            students: removeLogData.students,
            fromSessionIndex: removeLogData.fromSessionIndex,
            toSessionIndex: removeLogData.toSessionIndex,
            deleteOnlyUnattended: removeLogData.deleteOnlyUnattended,
            className: removeLogData.className,
            classCode: removeLogData.classCode,
          }),
        }).catch(console.error);
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

  app.get("/api/class-sessions/:classSessionId/session-info", async (req, res) => {
    try {
      const { classSessionId } = req.params;
      const info = await getSessionInfoForLog(classSessionId);
      if (!info) return res.status(404).json({ message: "Không tìm thấy buổi học" });
      const [row2] = await db
        .select({ sessionDate: classSessions.sessionDate })
        .from(classSessions)
        .where(eq(classSessions.id, classSessionId))
        .limit(1);
      const rawDate = row2?.sessionDate ? new Date(row2.sessionDate) : null;
      const sessionDateISO = rawDate
        ? `${rawDate.getFullYear()}-${String(rawDate.getMonth() + 1).padStart(2, "0")}-${String(rawDate.getDate()).padStart(2, "0")}`
        : null;
      res.json({
        sessionDate: info.date,
        sessionDateISO,
        endTime: info.endTime,
        startTime: info.startTime,
      });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
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
        displayOrder: req.body.displayOrder || 0,
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
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

  app.patch("/api/class-sessions/:classSessionId/contents/:contentId", async (req, res) => {
    try {
      const { contentId } = req.params;
      const { dueDate } = req.body;
      const updated = await storage.updateSessionContent(contentId, {
        dueDate: dueDate ? new Date(dueDate) : null,
      });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể cập nhật nội dung" });
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
      const { dueDate } = req.body;
      // Create a session content record first
      const sessionContent = await storage.createSessionContent({
        classSessionId,
        contentType,
        title,
        description: description || null,
        resourceUrl: resourceUrl || null,
        displayOrder: 0,
        dueDate: dueDate ? new Date(dueDate) : null,
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
      // Activity log (fire-and-forget)
      try {
        const userId = (req as any).user?.id ?? null;
        const [criteriaRow] = await db.select({ name: evaluationCriteria.name })
          .from(evaluationCriteria).where(eq(evaluationCriteria.id, criteriaId)).limit(1);
        const [classInfo] = await db.select({ locationId: classes.locationId })
          .from(classes).where(eq(classes.id, classId)).limit(1);
        createActivityLog({
          userId,
          locationId: classInfo?.locationId ?? null,
          classId,
          action: "Gán tiêu chí",
          oldContent: null,
          newContent: JSON.stringify({
            criteriaId,
            criteriaName: criteriaRow?.name ?? criteriaId,
            fromSessionIndex,
            toSessionIndex,
            sessionCount: sessions.length,
          }),
        }).catch(console.error);
      } catch (logErr) {
        console.error("[ApplyCriteria] Activity log error:", logErr);
      }
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
      // Activity log (fire-and-forget)
      try {
        const userId = (req as any).user?.id ?? null;
        const [sheetRow] = await db.select({ name: scoreSheets.name })
          .from(scoreSheets).where(eq(scoreSheets.id, scoreSheetId)).limit(1);
        const [classInfo] = await db.select({ locationId: classes.locationId })
          .from(classes).where(eq(classes.id, classId)).limit(1);
        createActivityLog({
          userId,
          locationId: classInfo?.locationId ?? null,
          classId,
          action: "Gán bảng điểm",
          oldContent: null,
          newContent: JSON.stringify({
            scoreSheetId,
            scoreSheetName: sheetRow?.name ?? scoreSheetId,
            fromSessionIndex,
            toSessionIndex,
            sessionCount: sessions.length,
          }),
        }).catch(console.error);
      } catch (logErr) {
        console.error("[ApplyScoreSheet] Activity log error:", logErr);
      }
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
          gb.excluded_student_ids,
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
        excludedStudentIds: z.array(z.string().uuid()).optional().default([]),
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
        excludedStudentIds: body.excludedStudentIds,
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
      const [book] = await db
        .select({ excludedStudentIds: classGradeBooks.excludedStudentIds })
        .from(classGradeBooks)
        .where(eq(classGradeBooks.id, id))
        .limit(1);
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
      res.json({ scores, studentComments, excludedStudentIds: book?.excludedStudentIds || [] });
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
        excludedStudentIds: z.array(z.string().uuid()).optional(),
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

      // Validate: cannot publish if no scores and no comments
      if (body.published === true) {
        const hasScoresInPayload = body.scores && body.scores.length > 0;
        const hasCommentsInPayload = body.studentComments && Object.values(body.studentComments).some(c => c?.trim());
        if (!hasScoresInPayload && !hasCommentsInPayload) {
          return res.status(400).json({ message: "Cần nhập ít nhất một điểm hoặc nhận xét trước khi công bố bảng điểm" });
        }
      }

      const updateData: any = { updatedBy: userId, updatedAt: new Date() };
      if (body.title) updateData.title = body.title;
      if (body.scoreSheetId) updateData.scoreSheetId = body.scoreSheetId;
      if ('sessionId' in body) updateData.sessionId = body.sessionId;
      if ('published' in body) updateData.published = body.published;
      if ('excludedStudentIds' in body) updateData.excludedStudentIds = body.excludedStudentIds;

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
          gb.score_sheet_id,
          gb.session_id,
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
          scoreSheetId: r.score_sheet_id || null,
          sessionId: r.session_id || null,
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

  // GET /api/learning-overview/cho-bu-bao-luu (server-side paginated by class)
  app.get("/api/learning-overview/cho-bu-bao-luu", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page || "1")));
      const pageSize = Math.min(50, Math.max(20, parseInt(String(req.query.pageSize || "20"))));
      const offset = (page - 1) * pageSize;
      const upperBound = offset + pageSize;

      const result = await db.execute(sql`
        WITH class_list AS (
          SELECT DISTINCT c.id AS class_id, c.name AS class_name
          FROM student_sessions ss
          JOIN classes c ON c.id = ss.class_id
          WHERE ss.attendance_status IN ('makeup_wait', 'paused')
        ),
        paginated_classes AS (
          SELECT *,
            COUNT(*) OVER() AS total_count,
            ROW_NUMBER() OVER(ORDER BY class_name) AS row_num
          FROM class_list
        ),
        selected_classes AS (
          SELECT * FROM paginated_classes
          WHERE row_num > ${offset} AND row_num <= ${upperBound}
        )
        SELECT
          ss.id,
          s.id AS student_id,
          s.full_name AS student_name,
          s.code AS student_code,
          s.account_status,
          sc.class_id,
          sc.class_name,
          sc.total_count,
          sc.row_num,
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
        JOIN selected_classes sc ON sc.class_id = ss.class_id
        JOIN class_sessions cs ON cs.id = ss.class_session_id
        LEFT JOIN shift_templates st ON st.id = cs.shift_template_id
        WHERE ss.attendance_status IN ('makeup_wait', 'paused')
        ORDER BY sc.row_num, CASE WHEN s.account_status = 'Không hoạt động' THEN 1 ELSE 0 END, cs.session_date DESC, s.full_name
      `);

      const rows = result.rows as any[];
      const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;

      const classMap = new Map<string, { classId: string; className: string; rowNum: number; rows: any[] }>();
      for (const row of rows) {
        if (!classMap.has(row.class_id)) {
          classMap.set(row.class_id, { classId: row.class_id, className: row.class_name, rowNum: parseInt(row.row_num), rows: [] });
        }
        classMap.get(row.class_id)!.rows.push({
          id: row.id,
          studentId: row.student_id,
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

      const data = Array.from(classMap.values())
        .sort((a, b) => a.rowNum - b.rowNum)
        .map(({ rowNum, ...cls }) => ({ ...cls, totalSessions: cls.rows.length }));

      res.json({ data, total, page, pageSize });
    } catch (err: any) {
      console.error("Cho bu bao luu error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải dữ liệu" });
    }
  });

  // ─── Teacher Attendance (Chấm công giáo viên) ────────────────────────────
  app.get("/api/learning-overview/teacher-attendance", async (req, res) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const dateFrom = String(req.query.dateFrom || today);
      const dateTo = String(req.query.dateTo || today);
      const search = String(req.query.search || "").trim();
      const page = Math.max(1, parseInt(String(req.query.page || "1")));
      const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize || "50"))));
      const offset = (page - 1) * pageSize;

      const searchSql = search
        ? sql`AND (sf.full_name ILIKE ${'%' + search + '%'} OR c.name ILIKE ${'%' + search + '%'})`
        : sql``;

      const [countRow] = (await db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM class_sessions cs
        JOIN classes c ON c.id = cs.class_id
        JOIN shift_templates st ON st.id = cs.shift_template_id
        JOIN staff sf ON sf.id = ANY(cs.teacher_ids)
        WHERE cs.session_date BETWEEN ${dateFrom}::date AND ${dateTo}::date
          AND cs.status != 'cancelled'
          ${searchSql}
      `)).rows as any[];

      const rows = (await db.execute(sql`
        SELECT
          cs.id AS session_id,
          cs.session_date,
          cs.weekday,
          c.id AS class_id,
          c.name AS class_name,
          st.start_time,
          st.end_time,
          sf.id AS staff_id,
          sf.full_name AS teacher_name,
          ta.check_in_at,
          ta.check_out_at,
          ta.note
        FROM class_sessions cs
        JOIN classes c ON c.id = cs.class_id
        JOIN shift_templates st ON st.id = cs.shift_template_id
        JOIN staff sf ON sf.id = ANY(cs.teacher_ids)
        LEFT JOIN teacher_attendance ta ON ta.class_session_id = cs.id AND ta.staff_id = sf.id
        WHERE cs.session_date BETWEEN ${dateFrom}::date AND ${dateTo}::date
          AND cs.status != 'cancelled'
          ${searchSql}
        ORDER BY cs.session_date ASC, st.start_time ASC, sf.full_name ASC
        LIMIT ${pageSize} OFFSET ${offset}
      `)).rows as any[];

      res.json({
        rows: rows.map((r: any) => ({
          sessionId: r.session_id,
          sessionDate: r.session_date,
          weekday: r.weekday,
          classId: r.class_id,
          className: r.class_name,
          startTime: r.start_time,
          endTime: r.end_time,
          staffId: r.staff_id,
          teacherName: r.teacher_name,
          checkInAt: r.check_in_at ? new Date(r.check_in_at).toISOString() : null,
          checkOutAt: r.check_out_at ? new Date(r.check_out_at).toISOString() : null,
          note: r.note || "",
        })),
        total: countRow?.total ?? 0,
        page,
        pageSize,
      });
    } catch (err: any) {
      console.error("Teacher attendance overview error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải dữ liệu chấm công" });
    }
  });

  app.put("/api/learning-overview/teacher-attendance/:sessionId/:staffId", async (req, res) => {
    try {
      const { sessionId, staffId } = req.params;
      const body = z.object({
        checkInAt: z.string().nullable().optional(),
        checkOutAt: z.string().nullable().optional(),
        note: z.string().optional(),
      }).parse(req.body);

      const checkIn = body.checkInAt ? new Date(body.checkInAt) : null;
      const checkOut = body.checkOutAt ? new Date(body.checkOutAt) : null;

      await db.execute(sql`
        INSERT INTO teacher_attendance (class_session_id, staff_id, check_in_at, check_out_at, note, updated_at)
        VALUES (
          ${sessionId}::uuid,
          ${staffId}::uuid,
          ${checkIn},
          ${checkOut},
          ${body.note ?? null},
          NOW()
        )
        ON CONFLICT (class_session_id, staff_id) DO UPDATE SET
          check_in_at = EXCLUDED.check_in_at,
          check_out_at = EXCLUDED.check_out_at,
          note = EXCLUDED.note,
          updated_at = NOW()
      `);

      res.json({ success: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message || "Lỗi khi lưu chấm công" });
    }
  });

  // GET /api/learning-overview/assignments
  // Admin view: all homework + exam assignments across all classes (no teacher filter)
  app.get("/api/learning-overview/assignments", async (req, res) => {
    try {
      const { month, dateFrom: qDateFrom, dateTo: qDateTo } = req.query as {
        month?: string; dateFrom?: string; dateTo?: string;
      };

      let dateFrom: string;
      let dateTo: string;
      let monthStr: string;

      if (qDateFrom && qDateTo) {
        dateFrom = qDateFrom;
        dateTo = qDateTo;
        monthStr = qDateFrom.substring(0, 7);
      } else {
        const now = new Date();
        const target = month ? new Date(`${month}-01`) : new Date(now.getFullYear(), now.getMonth(), 1);
        const y = target.getFullYear();
        const m = target.getMonth();
        const lastDay = new Date(y, m + 1, 0).getDate();
        dateFrom = `${y}-${String(m + 1).padStart(2, "0")}-01`;
        dateTo = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        monthStr = `${y}-${String(m + 1).padStart(2, "0")}`;
      }

      const allowedLocationIds = await getAllowedLocationIds(req);

      // Homework rows
      const hwConditions: any[] = [
        inArray(sessionContents.contentType, ["homework", "Bài tập về nhà"]),
        gte(classSessions.sessionDate, dateFrom),
        lte(classSessions.sessionDate, dateTo),
      ];
      if (allowedLocationIds !== null && allowedLocationIds.length > 0) {
        hwConditions.push(inArray(classes.locationId, allowedLocationIds));
      }

      const hwRows = await db
        .select({
          classSessionId: classSessions.id,
          sessionDate: classSessions.sessionDate,
          weekday: classSessions.weekday,
          sessionIndex: classSessions.sessionIndex,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
          className: classes.name,
          classCode: classes.classCode,
          homeworkId: sessionContents.id,
          generalTitle: sessionContents.title,
          generalDescription: sessionContents.description,
          studentId: studentSessions.studentId,
          personalTitle: studentSessionContents.customTitle,
          personalDescription: studentSessionContents.customDescription,
          submissionStatus: studentSessionContents.status,
          submissionContent: studentSessionContents.submissionContent,
          submissionAttachments: studentSessionContents.submissionAttachments,
          studentSessionContentId: studentSessionContents.id,
          score: studentSessionContents.score,
          gradingComment: studentSessionContents.gradingComment,
          programAttachments: courseProgramContents.attachments,
        })
        .from(classSessions)
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .innerJoin(sessionContents, and(
          eq(sessionContents.classSessionId, classSessions.id),
          inArray(sessionContents.contentType, ["homework", "Bài tập về nhà"])
        ))
        .innerJoin(studentSessions, eq(studentSessions.classSessionId, classSessions.id))
        .leftJoin(studentSessionContents, and(
          eq(studentSessionContents.sessionContentId, sessionContents.id),
          eq(studentSessionContents.studentId, studentSessions.studentId)
        ))
        .leftJoin(courseProgramContents, sql`${sessionContents.resourceUrl} = ${courseProgramContents.id}::text`)
        .where(and(...hwConditions))
        .orderBy(classSessions.sessionDate, shiftTemplates.startTime);

      // Exam rows
      const examConditions: any[] = [
        inArray(sessionContents.contentType, ["Bài kiểm tra", "exam"]),
        gte(classSessions.sessionDate, dateFrom),
        lte(classSessions.sessionDate, dateTo),
      ];
      if (allowedLocationIds !== null && allowedLocationIds.length > 0) {
        examConditions.push(inArray(classes.locationId, allowedLocationIds));
      }

      const examRawRows = await db
        .select({
          classSessionId: classSessions.id,
          classId: classes.id,
          sessionDate: classSessions.sessionDate,
          weekday: classSessions.weekday,
          sessionIndex: classSessions.sessionIndex,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
          className: classes.name,
          classCode: classes.classCode,
          examContentId: sessionContents.id,
          examTitle: sessionContents.title,
          examResourceUrl: sessionContents.resourceUrl,
          studentId: studentSessions.studentId,
          submissionId: examSubmissions.id,
          submissionScore: examSubmissions.adjustedScore,
          submissionComment: examSubmissions.comment,
        })
        .from(classSessions)
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .innerJoin(sessionContents, and(
          eq(sessionContents.classSessionId, classSessions.id),
          inArray(sessionContents.contentType, ["Bài kiểm tra", "exam"])
        ))
        .innerJoin(studentSessions, eq(studentSessions.classSessionId, classSessions.id))
        .leftJoin(examSubmissions, and(
          sql`${examSubmissions.examId}::text = ${sessionContents.resourceUrl}`,
          eq(examSubmissions.studentId, studentSessions.studentId),
          sql`(${examSubmissions.classId} = ${classes.id} OR ${examSubmissions.classId} IS NULL)`
        ))
        .where(and(...examConditions))
        .orderBy(classSessions.sessionDate, shiftTemplates.startTime);

      // Batch-fetch student names
      const allStudentIds = [
        ...new Set([...hwRows.map(r => r.studentId), ...examRawRows.map(r => r.studentId)])
      ].filter(Boolean) as string[];
      const studentRows = allStudentIds.length
        ? await db.select({ id: students.id, fullName: students.fullName, code: students.code })
            .from(students).where(inArray(students.id, allStudentIds))
        : [];
      const studentNameMap = new Map<string, string>(
        studentRows.map(s => [s.id, s.fullName || s.code || s.id])
      );

      function parseHomeworkAttachments(raw: Array<string | { name: string; url: string }> | null): { name: string; url: string }[] {
        if (!raw || raw.length === 0) return [];
        return raw.map((entry) => {
          if (typeof entry !== "string") return { name: (entry as any).name ?? "", url: (entry as any).url ?? "" };
          const sep = entry.indexOf("||");
          if (sep === -1) return { name: entry, url: entry };
          return { name: entry.substring(0, sep), url: entry.substring(sep + 2) };
        });
      }

      const homeworkResult: any[] = hwRows.map(r => ({
        classSessionId: r.classSessionId,
        className: r.className,
        classCode: r.classCode,
        sessionDate: r.sessionDate,
        weekday: r.weekday,
        startTime: r.startTime,
        endTime: r.endTime,
        sessionIndex: r.sessionIndex,
        studentId: r.studentId,
        studentName: studentNameMap.get(r.studentId) ?? r.studentId,
        itemType: "BTVN" as const,
        homeworkId: r.homeworkId,
        homeworkTitle: r.personalTitle || r.generalTitle,
        homeworkDescription: r.personalDescription || r.generalDescription,
        isPersonalized: !!(r.personalTitle || r.personalDescription),
        submissionStatus: (r.submissionStatus === "submitted" ? "submitted" : "pending") as "submitted" | "pending",
        submissionContent: r.submissionContent ?? null,
        submissionAttachments: parseHomeworkAttachments(r.submissionAttachments as string[] | null),
        homeworkAttachments: parseHomeworkAttachments(r.programAttachments as string[] | null),
        studentSessionContentId: r.studentSessionContentId ?? null,
        score: r.score ?? null,
        comment: r.gradingComment ?? null,
        examId: null,
      }));

      // Deduplicate exam rows
      const examDeduped = new Map<string, typeof examRawRows[0]>();
      for (const r of examRawRows) {
        const key = `${r.classSessionId}:${r.examContentId}:${r.studentId}`;
        const existing = examDeduped.get(key);
        if (!existing) {
          examDeduped.set(key, r);
        } else if (r.submissionId && !existing.submissionId) {
          examDeduped.set(key, r);
        }
      }

      const examResult: any[] = [...examDeduped.values()].map(r => ({
        classSessionId: r.classSessionId,
        classId: r.classId,
        className: r.className,
        classCode: r.classCode,
        sessionDate: r.sessionDate,
        weekday: r.weekday,
        startTime: r.startTime,
        endTime: r.endTime,
        sessionIndex: r.sessionIndex,
        studentId: r.studentId,
        studentName: studentNameMap.get(r.studentId) ?? r.studentId,
        itemType: "Bài kiểm tra" as const,
        homeworkId: r.examContentId,
        homeworkTitle: r.examTitle,
        homeworkDescription: null,
        homeworkAttachments: [],
        isPersonalized: false,
        submissionStatus: r.submissionId ? "submitted" as const : "pending" as const,
        submissionContent: null,
        submissionAttachments: [],
        studentSessionContentId: null,
        score: r.submissionScore ?? null,
        comment: r.submissionComment ?? null,
        examId: r.examResourceUrl || r.examContentId,
        submissionId: r.submissionId ?? null,
      }));

      const result = [...homeworkResult, ...examResult].sort((a, b) => {
        const dateCmp = String(a.sessionDate).localeCompare(String(b.sessionDate));
        if (dateCmp !== 0) return dateCmp;
        return String(a.startTime).localeCompare(String(b.startTime));
      });

      res.json({ rows: result, month: monthStr });
    } catch (err: any) {
      console.error("Learning overview assignments error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải bài tập" });
    }
  });

  // ─── Activity Logs ────────────────────────────────────────────────────────
  app.get("/api/activity-logs", async (req, res) => {
    try {
      const classId = req.query.classId as string | undefined;
      const scope = req.query.scope === "education-config" ? "education-config" as const
        : req.query.scope === "settings" ? "settings" as const : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 200;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const logs = await getActivityLogs({
        classId,
        onlyClassLogs: !classId && !scope,
        scope,
        limit,
        offset,
      });
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

  // ---------------------------------------------------------------------------
  // POST /api/classes/:id/close
  // Xóa tất cả buổi học từ closeDate trở đi, đổi trạng thái lớp → "closed"
  // ---------------------------------------------------------------------------
  app.post(api.classes.close.path, async (req, res) => {
    try {
      const classId = req.params.id;
      const userId = (req.user as any)?.id ?? null;
      const { closeDate } = req.body as { closeDate?: string };
      if (!closeDate) return res.status(400).json({ message: "Thiếu closeDate" });

      // Lấy thông tin lớp
      const [cls] = await db.select({
        name: classes.name,
        classCode: classes.classCode,
        locationId: classes.locationId,
        managerIds: classes.managerIds,
        teacherIds: classes.teacherIds,
      }).from(classes).where(eq(classes.id, classId)).limit(1);
      if (!cls) return res.status(404).json({ message: "Không tìm thấy lớp" });

      // Đếm số buổi sẽ bị xóa (để trả về cho client)
      const toDelete = await db.select({ id: classSessions.id })
        .from(classSessions)
        .where(and(
          eq(classSessions.classId, classId),
          gte(classSessions.sessionDate, closeDate),
        ));

      // Xóa hẳn các buổi học từ closeDate trở đi (phải xóa student_sessions trước do FK)
      if (toDelete.length > 0) {
        const deleteIds = toDelete.map(s => s.id);
        // 1. Xóa student_sessions liên quan
        await db.delete(studentSessions).where(inArray(studentSessions.classSessionId, deleteIds));
        // 2. Xóa class_sessions
        await db.delete(classSessions).where(inArray(classSessions.id, deleteIds));
      }

      // Đổi trạng thái lớp → "closed"
      await db.update(classes)
        .set({ status: "closed", updatedAt: new Date() })
        .where(eq(classes.id, classId));

      // Activity log
      await createActivityLog({
        userId,
        locationId: cls.locationId ?? null,
        classId,
        action: "close_class",
        oldContent: null,
        newContent: `Đóng lớp từ ngày ${closeDate}. Đã xóa ${toDelete.length} buổi học từ ngày này trở đi.`,
      });

      emitCalendarUpdateForClass(classId).catch(() => {});
      res.json({ success: true, deletedCount: toDelete.length });
    } catch (err: any) {
      console.error("[CloseClass]", err);
      res.status(500).json({ message: err.message || "Không thể đóng lớp" });
    }
  });
}

export { createActivityLog };
