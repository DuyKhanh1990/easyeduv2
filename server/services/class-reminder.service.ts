import { db } from "../db";
import { classSessions, classes, studentClasses, shiftTemplates, students, centerConfig } from "@shared/schema";
import { eq, and, sql as rawSql } from "drizzle-orm";
import { notificationService } from "../application/notification/services/NotificationService";

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

const sentSessionIds = new Set<string>();

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function nowVietnam(): Date {
  return new Date(Date.now() + VN_OFFSET_MS);
}

function formatDate(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [, m, d] = parts;
  return `${d}/${m}`;
}

async function runClassReminder(): Promise<void> {
  try {
    const vnNow = nowVietnam();

    const vnReminder = new Date(vnNow.getTime() + 15 * 60 * 1000);
    const hh = String(vnReminder.getUTCHours()).padStart(2, "0");
    const mm = String(vnReminder.getUTCMinutes()).padStart(2, "0");
    const targetTime = `${hh}:${mm}`;

    const todayVN = [
      String(vnNow.getUTCFullYear()),
      String(vnNow.getUTCMonth() + 1).padStart(2, "0"),
      String(vnNow.getUTCDate()).padStart(2, "0"),
    ].join("-");

    const sessions = await db
      .select({
        sessionId: classSessions.id,
        classId: classSessions.classId,
        sessionDate: classSessions.sessionDate,
        weekday: classSessions.weekday,
        startTime: shiftTemplates.startTime,
        className: classes.name,
      })
      .from(classSessions)
      .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .where(
        and(
          eq(classSessions.sessionDate, todayVN),
          eq(classSessions.status, "scheduled"),
          rawSql`LEFT(${shiftTemplates.startTime}, 5) = ${targetTime}`
        )
      );

    if (sessions.length === 0) return;

    const [center] = await db.select({ id: centerConfig.id }).from(centerConfig).limit(1);
    const centerId = center?.id ?? "00000000-0000-0000-0000-000000000000";

    for (const session of sessions) {
      if (sentSessionIds.has(session.sessionId)) continue;
      sentSessionIds.add(session.sessionId);

      const activeStudents = await db
        .select({
          studentId: studentClasses.studentId,
          studentName: students.fullName,
        })
        .from(studentClasses)
        .innerJoin(students, eq(studentClasses.studentId, students.id))
        .where(
          and(
            eq(studentClasses.classId, session.classId),
            eq(studentClasses.status, "active")
          )
        );

      if (activeStudents.length === 0) {
        console.log(`[ClassReminder] Lớp "${session.className}" không có học viên active`);
        continue;
      }

      const startTime = session.startTime.slice(0, 5);
      const weekdayLabel = WEEKDAY_LABELS[(session.weekday ?? 1) % 7] ?? "";
      const dateLabel = formatDate(session.sessionDate);

      for (const student of activeStudents) {
        notificationService
          .send({
            type: "attendance_reminder",
            studentId: student.studentId,
            centerId,
            data: {
              studentName: student.studentName ?? "",
              className: session.className ?? "",
              time: startTime,
              sessionDate: `${weekdayLabel} ${dateLabel}`.trim(),
            },
          })
          .catch((err) => console.error("[ClassReminder] Lỗi gửi noti:", err));
      }

      console.log(
        `[ClassReminder] Nhắc nhở ${activeStudents.length} HV, lớp "${session.className}", ca ${startTime} (${dateLabel}) — VN date: ${todayVN}, target: ${targetTime}`
      );
    }
  } catch (err) {
    console.error("[ClassReminder] Lỗi cron:", err);
  }
}

export function startClassReminderCron(): void {
  runClassReminder();
  setInterval(runClassReminder, 60 * 1000);
  console.log("[ClassReminder] Cron đã khởi động (interval: 1 phút)");
}
