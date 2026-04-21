import { db } from "../db";
import { studentSessions, classSessions, classes, students, staff, shiftTemplates } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { sendNotification, sendNotificationToMany } from "./notification";

const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  present: "Có học",
  absent: "Vắng",
  makeup_wait: "Chờ học bù",
  makeup_done: "Đã học bù",
  cancelled: "Huỷ",
  pending: "Chưa điểm danh",
};

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function formatDate(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}/${m}/${y.slice(2)}`;
}

async function resolveActorLabel(actorUserId: string | null | undefined): Promise<string> {
  if (!actorUserId) return "hệ thống";
  try {
    const [actorStaff] = await db
      .select({ fullName: staff.fullName, code: staff.code })
      .from(staff)
      .where(eq(staff.userId, actorUserId))
      .limit(1);
    if (actorStaff) return `${actorStaff.fullName} (${actorStaff.code})`;
  } catch { /* ignore */ }
  return "hệ thống";
}

async function resolveSessionContext(studentSessionId: string) {
  const [ss] = await db
    .select({
      studentId: studentSessions.studentId,
      classId: studentSessions.classId,
      classSessionId: studentSessions.classSessionId,
      sessionOrder: studentSessions.sessionOrder,
    })
    .from(studentSessions)
    .where(eq(studentSessions.id, studentSessionId))
    .limit(1);

  if (!ss) return null;

  const [student] = await db
    .select({ userId: students.userId })
    .from(students)
    .where(eq(students.id, ss.studentId))
    .limit(1);

  const [cls] = await db
    .select({ classCode: classes.classCode })
    .from(classes)
    .where(eq(classes.id, ss.classId))
    .limit(1);

  const [csRow] = await db
    .select({
      sessionIndex: classSessions.sessionIndex,
      sessionDate: classSessions.sessionDate,
      weekday: classSessions.weekday,
      shiftTemplateId: classSessions.shiftTemplateId,
    })
    .from(classSessions)
    .where(eq(classSessions.id, ss.classSessionId))
    .limit(1);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(studentSessions)
    .where(and(eq(studentSessions.studentId, ss.studentId), eq(studentSessions.classId, ss.classId)));

  let startTime = "";
  let endTime = "";
  if (csRow?.shiftTemplateId) {
    const [shift] = await db
      .select({ startTime: shiftTemplates.startTime, endTime: shiftTemplates.endTime })
      .from(shiftTemplates)
      .where(eq(shiftTemplates.id, csRow.shiftTemplateId))
      .limit(1);
    startTime = shift?.startTime ?? "";
    endTime = shift?.endTime ?? "";
  }

  const totalSessions = countRow?.total ?? 0;
  const sessionOrder = ss.sessionOrder ?? csRow?.sessionIndex ?? 1;
  const className = cls?.classCode || "Lớp học";
  const weekdayLabel = WEEKDAY_LABELS[csRow?.weekday ?? 0] || "";
  const dateLabel = csRow?.sessionDate ? formatDate(csRow.sessionDate) : "";
  const sessionLabel = totalSessions > 0
    ? `Buổi ${sessionOrder}/${totalSessions}`
    : `Buổi ${sessionOrder}`;
  const timeLabel = startTime && endTime ? `${startTime} - ${endTime}` : "";

  return {
    userId: student?.userId ?? null,
    className,
    sessionLabel,
    weekdayLabel,
    dateLabel,
    timeLabel,
  };
}

export async function sendAttendanceNotification(
  studentSessionId: string,
  newStatus: string,
  actorUserId: string | null | undefined,
): Promise<void> {
  try {
    const ctx = await resolveSessionContext(studentSessionId);
    if (!ctx?.userId) return;

    const actorLabel = await resolveActorLabel(actorUserId);
    const statusLabel = ATTENDANCE_STATUS_LABELS[newStatus] ?? newStatus;

    const parts = [
      `Giáo viên ${actorLabel} vừa Điểm danh: ${statusLabel}`,
      `Lớp ${ctx.className}`,
      ctx.sessionLabel,
      [ctx.weekdayLabel, ctx.dateLabel, ctx.timeLabel].filter(Boolean).join(" "),
    ].filter(Boolean);

    await sendNotification({
      userId: ctx.userId,
      title: "Thông báo điểm danh",
      content: parts.join(", "),
      category: "attendance",
    });
  } catch (err) {
    console.error("[AttendanceNotification] Error:", err);
  }
}

const CONTENT_TYPE_SHORT: Record<string, string> = {
  "Bài học": "Bài học",
  "Bài tập về nhà": "BTVN",
  "Giáo trình": "Giáo trình",
  "Bài kiểm tra": "Bài kiểm tra",
};

export async function sendContentNotification(
  classSessionId: string,
  contents: { contentType: string; title: string }[],
  actorUserId: string | null | undefined,
): Promise<void> {
  if (!contents.length) return;
  try {
    const actorLabel = await resolveActorLabel(actorUserId);

    const [csRow] = await db
      .select({
        sessionIndex: classSessions.sessionIndex,
        sessionDate: classSessions.sessionDate,
        weekday: classSessions.weekday,
        shiftTemplateId: classSessions.shiftTemplateId,
        classId: classSessions.classId,
      })
      .from(classSessions)
      .where(eq(classSessions.id, classSessionId))
      .limit(1);

    if (!csRow) return;

    const [cls] = await db
      .select({ classCode: classes.classCode })
      .from(classes)
      .where(eq(classes.id, csRow.classId))
      .limit(1);
    const className = cls?.classCode || "Lớp học";

    let startTime = "";
    let endTime = "";
    if (csRow.shiftTemplateId) {
      const [shift] = await db
        .select({ startTime: shiftTemplates.startTime, endTime: shiftTemplates.endTime })
        .from(shiftTemplates)
        .where(eq(shiftTemplates.id, csRow.shiftTemplateId))
        .limit(1);
      startTime = shift?.startTime ?? "";
      endTime = shift?.endTime ?? "";
    }

    const weekdayLabel = WEEKDAY_LABELS[csRow.weekday ?? 0] || "";
    const dateLabel = csRow.sessionDate ? formatDate(csRow.sessionDate) : "";
    const timeLabel = startTime && endTime ? `${startTime} - ${endTime}` : "";

    const allStudentSessions = await db
      .select({
        studentId: studentSessions.studentId,
        sessionOrder: studentSessions.sessionOrder,
        classId: studentSessions.classId,
      })
      .from(studentSessions)
      .where(eq(studentSessions.classSessionId, classSessionId));

    if (!allStudentSessions.length) return;

    const contentLine = contents
      .map((c) => `${CONTENT_TYPE_SHORT[c.contentType] ?? c.contentType}: ${c.title}`)
      .join(", ");

    const uniqueStudentIds = [...new Set(allStudentSessions.map((ss) => ss.studentId))];

    for (const studentId of uniqueStudentIds) {
      try {
        const [student] = await db
          .select({ userId: students.userId })
          .from(students)
          .where(eq(students.id, studentId))
          .limit(1);

        if (!student?.userId) continue;

        const ss = allStudentSessions.find((s) => s.studentId === studentId);
        const [countRow] = await db
          .select({ total: sql<number>`count(*)::int` })
          .from(studentSessions)
          .where(and(eq(studentSessions.studentId, studentId), eq(studentSessions.classId, csRow.classId)));
        const totalSessions = countRow?.total ?? 0;
        const sessionOrder = ss?.sessionOrder ?? csRow.sessionIndex ?? 1;
        const sessionLabel = totalSessions > 0
          ? `Buổi ${sessionOrder}/${totalSessions}`
          : `Buổi ${sessionOrder}`;

        const header = [
          `Giáo viên ${actorLabel} vừa Giao nội dung`,
          `Lớp ${className}`,
          sessionLabel,
          [weekdayLabel, dateLabel, timeLabel].filter(Boolean).join(" "),
        ].filter(Boolean).join(", ");

        const content = `${header}\nbao gồm: ${contentLine}`;

        await sendNotification({
          userId: student.userId,
          title: "Thông báo giao nội dung",
          content,
          category: "content",
        });
      } catch (innerErr) {
        console.error("[ContentNotification] Error for student", studentId, innerErr);
      }
    }
  } catch (err) {
    console.error("[ContentNotification] Error:", err);
  }
}

export async function sendReviewNotification(
  studentSessionIds: string[],
  actorUserId: string | null | undefined,
): Promise<void> {
  if (!studentSessionIds.length) return;
  try {
    const actorLabel = await resolveActorLabel(actorUserId);

    for (const ssId of studentSessionIds) {
      try {
        const ctx = await resolveSessionContext(ssId);
        if (!ctx?.userId) continue;

        const parts = [
          `Giáo viên ${actorLabel} vừa Nhận xét học viên`,
          `Lớp ${ctx.className}`,
          ctx.sessionLabel,
          [ctx.weekdayLabel, ctx.dateLabel, ctx.timeLabel].filter(Boolean).join(" "),
        ].filter(Boolean);

        await sendNotification({
          userId: ctx.userId,
          title: "Thông báo nhận xét",
          content: parts.join(", "),
          category: "review",
        });
      } catch (innerErr) {
        console.error("[ReviewNotification] Error for session", ssId, innerErr);
      }
    }
  } catch (err) {
    console.error("[ReviewNotification] Error:", err);
  }
}
