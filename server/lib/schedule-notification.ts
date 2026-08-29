import { db } from "../db";
import { classes, studentSessions, students, shiftTemplates, centerConfig } from "@shared/schema";
import { eq, and, ne } from "drizzle-orm";
import { notificationService } from "../application/notification/services/NotificationService";
import { NotificationTypes } from "../domain/notification/types/NotificationTypes";

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

async function getCenterId(): Promise<string | null> {
  const [center] = await db.select({ id: centerConfig.id }).from(centerConfig).limit(1);
  return center?.id ?? null;
}

async function getActiveStudentIds(classId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ studentId: studentSessions.studentId })
    .from(studentSessions)
    .where(and(eq(studentSessions.classId, classId), ne(studentSessions.status, "cancelled")));
  return rows.map((r) => r.studentId);
}

async function getActiveStudentsWithNames(
  classId: string
): Promise<{ studentId: string; studentName: string }[]> {
  const rows = await db
    .selectDistinct({
      studentId: studentSessions.studentId,
      studentName: students.fullName,
    })
    .from(studentSessions)
    .innerJoin(students, eq(studentSessions.studentId, students.id))
    .where(and(eq(studentSessions.classId, classId), ne(studentSessions.status, "cancelled")));
  return rows.map((r) => ({ studentId: r.studentId, studentName: r.studentName ?? "" }));
}

function buildTimeLabel(weekday: number | null, dateStr: string, startTime: string): string {
  const wd = weekday !== null ? (WEEKDAY_LABELS[weekday] ?? "") : "";
  const dateParts = dateStr ? dateStr.split("-") : [];
  const dateLabel =
    dateParts.length === 3
      ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0].slice(2)}`
      : dateStr;
  const time = startTime ? startTime.slice(0, 5) : "";
  return [wd, dateLabel, time].filter(Boolean).join(" ");
}

async function getClassCode(classId: string): Promise<string> {
  const [cls] = await db
    .select({ classCode: classes.classCode, name: classes.name })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);
  return cls?.classCode || cls?.name || "Lớp học";
}

async function getShiftStartTime(shiftTemplateId: string | null | undefined): Promise<string> {
  if (!shiftTemplateId) return "";
  const [shift] = await db
    .select({ startTime: shiftTemplates.startTime })
    .from(shiftTemplates)
    .where(eq(shiftTemplates.id, shiftTemplateId))
    .limit(1);
  return shift?.startTime ? shift.startTime.slice(0, 5) : "";
}

async function sendToAllStudents(
  classId: string,
  centerId: string,
  type: string,
  data: Record<string, unknown>,
): Promise<void> {
  const studentIds = await getActiveStudentIds(classId);
  for (const studentId of studentIds) {
    await notificationService.send({ centerId, studentId, type, data });
  }
}

export async function sendClassChangedNotification(params: {
  classId: string;
  oldSessionDate: string;
  oldWeekday: number;
  oldShiftTemplateId: string | null | undefined;
  newSessionDate: string;
  newShiftTemplateId: string | null | undefined;
}): Promise<void> {
  try {
    const centerId = await getCenterId();
    if (!centerId) return;

    const className = await getClassCode(params.classId);
    const activeStudents = await getActiveStudentsWithNames(params.classId);
    if (activeStudents.length === 0) return;

    const oldShiftRow = params.oldShiftTemplateId
      ? await db
          .select({ startTime: shiftTemplates.startTime })
          .from(shiftTemplates)
          .where(eq(shiftTemplates.id, params.oldShiftTemplateId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : null;

    const newShiftRow = params.newShiftTemplateId
      ? await db
          .select({ startTime: shiftTemplates.startTime })
          .from(shiftTemplates)
          .where(eq(shiftTemplates.id, params.newShiftTemplateId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : null;

    const oldStartTime = oldShiftRow?.startTime ?? "";
    const newStartTime = newShiftRow?.startTime ?? oldStartTime;

    const oldTime = buildTimeLabel(params.oldWeekday, params.oldSessionDate, oldStartTime);

    const newDateForWeekday = params.newSessionDate || params.oldSessionDate;
    const newWeekday = newDateForWeekday
      ? new Date(newDateForWeekday).getDay()
      : params.oldWeekday;
    const newTime = buildTimeLabel(
      newWeekday,
      params.newSessionDate || params.oldSessionDate,
      newStartTime
    );

    for (const { studentId, studentName } of activeStudents) {
      await notificationService
        .send({
          centerId,
          studentId,
          type: NotificationTypes.CLASS_CHANGED,
          data: {
            title: "Lịch học đã thay đổi",
            summary: "Buổi học có lịch mới",
            studentName,
            className,
            oldTime,
            newTime,
            _rawDate: params.newSessionDate || params.oldSessionDate,
            action: {
              type: "OPEN_CLASS",
              targetId: params.classId,
            },
          },
        })
        .catch((err) =>
          console.error("[ClassChanged] Lỗi gửi noti studentId:", studentId, err)
        );
    }

    console.log(
      `[ClassChanged] Đã notify ${activeStudents.length} học viên lớp "${className}" oldTime="${oldTime}" → newTime="${newTime}"`
    );
  } catch (err) {
    console.error("[ScheduleNotification] sendClassChangedNotification error:", err);
  }
}

export async function sendUpdateSessionNotification(params: {
  classId: string;
  oldSessionDate: string;
  oldWeekday: number;
  oldShiftTemplateId: string | null | undefined;
  newSessionDate: string;
  newShiftTemplateId: string | null | undefined;
}): Promise<void> {
  try {
    const centerId = await getCenterId();
    if (!centerId) return;
    const className = await getClassCode(params.classId);
    const oldTime = await getShiftStartTime(params.oldShiftTemplateId);
    const newTime = await getShiftStartTime(params.newShiftTemplateId);
    const oldWd = WEEKDAY_LABELS[params.oldWeekday] ?? "";
    const oldDate = formatDate(params.oldSessionDate);
    const newWdIndex = params.newSessionDate ? new Date(params.newSessionDate).getDay() : params.oldWeekday;
    const newWd = WEEKDAY_LABELS[newWdIndex] ?? "";
    const newDate = formatDate(params.newSessionDate);

    await sendToAllStudents(params.classId, centerId, "schedule_update_session", {
      className,
      oldWeekday: oldWd,
      oldDate,
      oldTime,
      newWeekday: newWd,
      newDate,
      newTime,
      _rawDate: params.newSessionDate || params.oldSessionDate,
    });
  } catch (err) {
    console.error("[ScheduleNotification] sendUpdateSessionNotification error:", err);
  }
}

export async function sendCancelSessionNotification(params: {
  classId: string;
  weekday: number;
  sessionDate: string;
  shiftTemplateId: string | null | undefined;
  reason: string;
}): Promise<void> {
  try {
    const centerId = await getCenterId();
    if (!centerId) return;
    const className = await getClassCode(params.classId);
    const time = await getShiftStartTime(params.shiftTemplateId);

    await sendToAllStudents(params.classId, centerId, "schedule_cancel_session", {
      className,
      weekday: WEEKDAY_LABELS[params.weekday] ?? "",
      date: formatDate(params.sessionDate),
      time,
      reason: params.reason ?? "",
      _rawDate: params.sessionDate,
    });
  } catch (err) {
    console.error("[ScheduleNotification] sendCancelSessionNotification error:", err);
  }
}

export async function sendUpdateCycleNotification(params: {
  classId: string;
  fromWeekday: number;
  fromDate: string;
  fromShiftTemplateId: string | null | undefined;
  newWeekdays: number[];
  reason: string;
}): Promise<void> {
  try {
    const centerId = await getCenterId();
    if (!centerId) return;
    const className = await getClassCode(params.classId);
    const fromTime = await getShiftStartTime(params.fromShiftTemplateId);
    const newWdLabels = params.newWeekdays.map((d) => WEEKDAY_LABELS[d] ?? "").filter(Boolean).join(", ");

    await sendToAllStudents(params.classId, centerId, "schedule_update_cycle", {
      className,
      newWeekdays: newWdLabels,
      fromWeekday: WEEKDAY_LABELS[params.fromWeekday] ?? "",
      fromDate: formatDate(params.fromDate),
      fromTime,
      reason: params.reason ?? "",
      _rawDate: params.fromDate,
    });
  } catch (err) {
    console.error("[ScheduleNotification] sendUpdateCycleNotification error:", err);
  }
}

export async function sendExcludeDatesNotification(params: {
  classId: string;
  fromWeekday: number;
  fromDate: string;
  fromShiftTemplateId: string | null | undefined;
  toWeekday: number;
  toDate: string;
  toShiftTemplateId: string | null | undefined;
  reason: string;
}): Promise<void> {
  try {
    const centerId = await getCenterId();
    if (!centerId) return;
    const className = await getClassCode(params.classId);
    const fromTime = await getShiftStartTime(params.fromShiftTemplateId);
    const toTime = await getShiftStartTime(params.toShiftTemplateId);

    await sendToAllStudents(params.classId, centerId, "schedule_exclude_dates", {
      className,
      fromWeekday: WEEKDAY_LABELS[params.fromWeekday] ?? "",
      fromDate: formatDate(params.fromDate),
      fromTime,
      toWeekday: WEEKDAY_LABELS[params.toWeekday] ?? "",
      toDate: formatDate(params.toDate),
      toTime,
      reason: params.reason ?? "",
      _rawDate: params.fromDate,
    });
  } catch (err) {
    console.error("[ScheduleNotification] sendExcludeDatesNotification error:", err);
  }
}
