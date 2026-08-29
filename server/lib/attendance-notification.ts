import { db } from "../db";
import { studentSessions, classSessions, classes, students, staff, shiftTemplates, centerConfig, exams, sessionContents, studentSessionContents } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { sendNotification, sendNotificationToMany } from "./notification";
import { notificationService } from "../application/notification/services/NotificationService";

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

async function resolveActorName(actorUserId: string | null | undefined): Promise<string> {
  if (!actorUserId) return "hệ thống";
  try {
    const [actorStaff] = await db
      .select({ fullName: staff.fullName })
      .from(staff)
      .where(eq(staff.userId, actorUserId))
      .limit(1);
    if (actorStaff?.fullName) return actorStaff.fullName;
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
    .select({ userId: students.userId, fullName: students.fullName })
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
      teacherIds: classSessions.teacherIds,
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

  let teacherName = "";
  const firstTeacherId = csRow?.teacherIds?.[0];
  if (firstTeacherId) {
    try {
      const [teacherRow] = await db
        .select({ fullName: staff.fullName })
        .from(staff)
        .where(eq(staff.id, firstTeacherId))
        .limit(1);
      teacherName = teacherRow?.fullName ?? "";
    } catch { /* ignore */ }
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
    studentId: ss.studentId,
    studentName: student?.fullName ?? "",
    classId: ss.classId,
    classSessionId: ss.classSessionId,
    className,
    sessionLabel,
    weekdayLabel,
    dateLabel,
    timeLabel,
    teacherName,
    rawSessionDate: csRow?.sessionDate ?? null,
  };
}

export async function sendAttendanceNotification(
  studentSessionId: string,
  newStatus: string,
  actorUserId: string | null | undefined,
): Promise<void> {
  try {
    const ctx = await resolveSessionContext(studentSessionId);
    if (!ctx) return;

    const actorLabel = await resolveActorLabel(actorUserId);
    const actorName = await resolveActorName(actorUserId);
    const statusLabel = ATTENDANCE_STATUS_LABELS[newStatus] ?? newStatus;

    // In-app notification — chỉ gửi nếu học viên có user account
    if (ctx.userId) {
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
        referenceDate: ctx.rawSessionDate ?? undefined,
        referenceId: ctx.classId ?? undefined,
        referenceType: "class",
        deeplink: {
          screen: "Calendar",
          params: {
            ...(ctx.rawSessionDate ? { date: ctx.rawSessionDate } : {}),
            ...(ctx.classSessionId ? { sessionId: ctx.classSessionId } : {}),
            ...(ctx.classId ? { classId: ctx.classId } : {}),
          },
        },
      });
    }

    // Notification Engine — luôn chạy nếu có studentId, không phụ thuộc userId
    if (ctx.studentId) {
      try {
        const [center] = await db.select({ id: centerConfig.id }).from(centerConfig).limit(1);
        if (center?.id) {
          const sessionDate = [ctx.weekdayLabel, ctx.dateLabel].filter(Boolean).join(" ");
          await notificationService.send({
            centerId: center.id,
            studentId: ctx.studentId,
            type: "attendance_result",
            data: {
              studentName: ctx.studentName,
              attendanceStatus: statusLabel,
              className: ctx.className,
              sessionDate,
              teacherName: ctx.teacherName || actorName,
              _rawDate: ctx.rawSessionDate,
            },
          });
        }
      } catch (znsErr) {
        console.error("[AttendanceNotification] Notification engine error:", znsErr);
      }
    }
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
    const actorName = await resolveActorName(actorUserId);
    const sessionDate = [weekdayLabel, dateLabel].filter(Boolean).join(" ");
    const [center] = await db.select({ id: centerConfig.id }).from(centerConfig).limit(1);

    for (const studentId of uniqueStudentIds) {
      try {
        const [student] = await db
          .select({ userId: students.userId })
          .from(students)
          .where(eq(students.id, studentId))
          .limit(1);

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

        if (student?.userId) {
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
            referenceDate: csRow.sessionDate ?? undefined,
            referenceId: csRow.classId ?? undefined,
            referenceType: "class",
            deeplink: {
              screen: "Assignments",
              params: {
                ...(csRow.sessionDate ? { date: csRow.sessionDate } : {}),
                ...(csRow.classId ? { classId: csRow.classId } : {}),
              },
            },
          });
        }

        // Notification Engine (ZNS)
        if (center?.id) {
          await notificationService.send({
            centerId: center.id,
            studentId,
            type: "session_content",
            data: {
              teacherName: actorName,
              className,
              sessionDate,
              contentList: contentLine,
              _rawDate: csRow.sessionDate ?? null,
            },
          });
        }
      } catch (innerErr) {
        console.error("[ContentNotification] Error for student", studentId, innerErr);
      }
    }
  } catch (err) {
    console.error("[ContentNotification] Error:", err);
  }
}

export async function sendExamScoreNotification(params: {
  studentId: string | null | undefined;
  examId: string;
  score?: string | null;
  adjustedScore?: string | null;
  partScores?: Array<{ correct: number; total: number; score?: number }> | null;
  comment?: string | null;
}): Promise<void> {
  if (!params.studentId) return;
  try {
    const [center] = await db.select({ id: centerConfig.id }).from(centerConfig).limit(1);
    if (!center?.id) return;

    const [examRow] = await db
      .select({ name: exams.name })
      .from(exams)
      .where(eq(exams.id, params.examId))
      .limit(1);
    const examName = examRow?.name ?? "";

    const totalScore = params.adjustedScore ?? params.score ?? "—";
    let correctCount = 0;
    let wrongCount = 0;
    if (params.partScores?.length) {
      for (const p of params.partScores) {
        correctCount += p.correct ?? 0;
        wrongCount += (p.total - p.correct) ?? 0;
      }
    }

    const comment = params.comment ? stripHtml(params.comment) : "";

    await notificationService.send({
      centerId: center.id,
      studentId: params.studentId,
      type: "exam_score",
      data: {
        examName,
        totalScore: String(totalScore),
        correctCount: String(correctCount),
        wrongCount: String(wrongCount),
        ...(comment ? { comment } : {}),
      },
    });
  } catch (err) {
    console.error("[ExamScoreNotification] Error:", err);
  }
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

export async function sendHomeworkScoreNotification(
  studentSessionContentId: string,
  score: string | null | undefined,
  gradingComment: string | null | undefined,
  actorUserId: string | null | undefined,
): Promise<void> {
  try {
    const [center] = await db.select({ id: centerConfig.id }).from(centerConfig).limit(1);
    if (!center?.id) return;

    // Lookup studentSessionContent → sessionContent → classSession → class + shift
    const [ssc] = await db
      .select({ sessionContentId: studentSessionContents.sessionContentId, studentId: studentSessionContents.studentId })
      .from(studentSessionContents)
      .where(eq(studentSessionContents.id, studentSessionContentId))
      .limit(1);
    if (!ssc) return;

    const [sc] = await db
      .select({ classSessionId: sessionContents.classSessionId, title: sessionContents.title, contentType: sessionContents.contentType })
      .from(sessionContents)
      .where(eq(sessionContents.id, ssc.sessionContentId))
      .limit(1);
    if (!sc) return;

    const [csRow] = await db
      .select({ sessionDate: classSessions.sessionDate, weekday: classSessions.weekday, shiftTemplateId: classSessions.shiftTemplateId, classId: classSessions.classId })
      .from(classSessions)
      .where(eq(classSessions.id, sc.classSessionId))
      .limit(1);
    if (!csRow) return;

    const [cls] = await db
      .select({ classCode: classes.classCode, name: classes.name })
      .from(classes)
      .where(eq(classes.id, csRow.classId))
      .limit(1);
    const className = cls?.classCode || cls?.name || "";

    let startTime = "";
    if (csRow.shiftTemplateId) {
      const [shift] = await db
        .select({ startTime: shiftTemplates.startTime })
        .from(shiftTemplates)
        .where(eq(shiftTemplates.id, csRow.shiftTemplateId))
        .limit(1);
      startTime = shift?.startTime ?? "";
    }

    const weekdayLabel = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][csRow.weekday ?? 0] || "";
    const dateLabel = csRow.sessionDate ? formatDate(csRow.sessionDate) : "";
    const sessionDate = [weekdayLabel, dateLabel, startTime].filter(Boolean).join(" ");

    const teacherName = await resolveActorName(actorUserId);
    const comment = gradingComment ? stripHtml(gradingComment) : "";

    await notificationService.send({
      centerId: center.id,
      studentId: ssc.studentId,
      type: "homework_score",
      data: {
        homeworkName: sc.title,
        score: score ?? "—",
        className,
        sessionDate,
        teacherName,
        _rawDate: csRow.sessionDate ?? null,
        ...(comment ? { comment } : {}),
      },
    });
  } catch (err) {
    console.error("[HomeworkScoreNotification] Error:", err);
  }
}

export async function sendReviewNotification(
  studentSessionIds: string[],
  actorUserId: string | null | undefined,
): Promise<void> {
  if (!studentSessionIds.length) return;
  try {
    const actorLabel = await resolveActorLabel(actorUserId);
    const actorName = await resolveActorName(actorUserId);
    const [center] = await db.select({ id: centerConfig.id }).from(centerConfig).limit(1);

    for (const ssId of studentSessionIds) {
      try {
        const ctx = await resolveSessionContext(ssId);
        if (!ctx) continue;

        const sessionDate = [ctx.weekdayLabel, ctx.dateLabel, ctx.timeLabel].filter(Boolean).join(" ");

        // In-app notification — chỉ gửi nếu học viên có user account
        if (ctx.userId) {
          const parts = [
            `Giáo viên ${actorLabel} vừa Nhận xét học viên`,
            `Lớp ${ctx.className}`,
            ctx.sessionLabel,
            sessionDate,
          ].filter(Boolean);

          await sendNotification({
            userId: ctx.userId,
            title: "Thông báo nhận xét",
            content: parts.join(", "),
            category: "review",
            referenceDate: ctx.rawSessionDate ?? undefined,
            referenceId: ctx.classId ?? undefined,
            referenceType: "class",
            deeplink: {
              screen: "Calendar",
              params: {
                ...(ctx.rawSessionDate ? { date: ctx.rawSessionDate } : {}),
                ...(ctx.classSessionId ? { sessionId: ctx.classSessionId } : {}),
                ...(ctx.classId ? { classId: ctx.classId } : {}),
              },
            },
          });
        }

        // Notification Engine — luôn chạy nếu có studentId (theo công thức chuẩn hóa)
        if (ctx.studentId && center?.id) {
          await notificationService.send({
            centerId: center.id,
            studentId: ctx.studentId,
            type: "teacher_feedback",
            data: {
              studentName: ctx.studentName,
              className: ctx.className,
              sessionDate,
              teacherName: actorName,
              _rawDate: ctx.rawSessionDate,
              action: {
                type: "OPEN_FEEDBACK",
                targetId: ssId,
              },
            },
          });
        }
      } catch (innerErr) {
        console.error("[ReviewNotification] Error for session", ssId, innerErr);
      }
    }
  } catch (err) {
    console.error("[ReviewNotification] Error:", err);
  }
}
