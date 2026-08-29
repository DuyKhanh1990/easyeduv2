/**
 * ClassBellReminder — nhắc lịch học/dạy trước 15 phút.
 *
 * Cron chạy mỗi 60 giây:
 *  1. Tính targetTime = giờ VN hiện tại + 15 phút (làm tròn xuống phút).
 *  2. Tìm các buổi học hôm nay (giờ VN) có start_time == targetTime, status = scheduled.
 *  3. Với mỗi buổi, gửi noti cho học viên và giáo viên chưa nhận trong ngày hôm nay.
 *  4. Dedupe: tra bảng notifications — nếu đã gửi cho cặp (sessionId, userId) kể từ
 *     đầu ngày VN thì bỏ qua, tránh gửi trùng dù cron bị restart hay chạy lại.
 */

import { db } from "../db";
import {
  classSessions,
  classes,
  shiftTemplates,
  students,
  staff,
  notifications,
  studentSessions,
} from "@shared/schema";
import { eq, and, sql as rawSql, inArray } from "drizzle-orm";
import { sendNotification } from "../lib/notification";

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7

/** Trả về Date mà getUTC*() phản ánh giờ địa phương Việt Nam */
function nowVN(): Date {
  return new Date(Date.now() + VN_OFFSET_MS);
}

/** Lấy chuỗi "YYYY-MM-DD" theo múi giờ Việt Nam */
function todayStringVN(vnNow: Date): string {
  const y = vnNow.getUTCFullYear();
  const m = String(vnNow.getUTCMonth() + 1).padStart(2, "0");
  const d = String(vnNow.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Lấy "HH:MM" của một Date (đã được điều chỉnh sang VN bởi nowVN()) */
function hhMM(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** Timestamp UTC của 00:00 VN hôm nay (để làm mốc dedupe trong ngày) */
function startOfTodayVN_UTC(vnNow: Date): Date {
  // vnNow.getUTC* = VN local; ngược lại: 00:00 VN = hôm nay UTC - 7h
  const todayStr = todayStringVN(vnNow);
  return new Date(`${todayStr}T00:00:00+07:00`);
}

async function runClassBellReminder(): Promise<void> {
  try {
    const vnNow = nowVN();

    // Target: các buổi bắt đầu đúng "bây giờ + 15 phút"
    const targetDate = new Date(vnNow.getTime() + 15 * 60 * 1000);
    const targetTime = hhMM(targetDate); // VD: "13:15"
    const todayVN = todayStringVN(vnNow);   // VD: "2026-07-23"

    // ── 1. Tìm buổi học khớp giờ ─────────────────────────────────────────────
    const sessions = await db
      .select({
        sessionId: classSessions.id,
        classId:   classSessions.classId,
        sessionDate: classSessions.sessionDate,
        weekday:   classSessions.weekday,
        startTime: shiftTemplates.startTime,
        className: classes.name,
        teacherIds: classSessions.teacherIds,
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

    // ── 2. Dedupe: ai đã nhận notification cho session này HÔM NAY? ──────────
    const sessionIds = sessions.map((s) => s.sessionId);
    const dayStart = startOfTodayVN_UTC(vnNow);

    // Lấy các noti đã gửi hôm nay cho những session này, kèm cả content để trích start_time.
    // Dedup key = "sessionId:userId:HH:MM" — nếu giờ bắt đầu thay đổi, key khác → gửi lại.
    const sentRows = await db
      .select({
        referenceId: notifications.referenceId,
        userId:      notifications.userId,
        content:     notifications.content,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.referenceType, "class_session"),
          inArray(notifications.referenceId, sessionIds),
          rawSql`${notifications.createdAt} >= ${dayStart}`
        )
      );

    // Trích giờ bắt đầu từ content "... lúc HH:MM, ..."
    const timeInContent = (content: string | null): string => {
      const m = (content ?? "").match(/lúc (\d{2}:\d{2})/);
      return m ? m[1] : "";
    };

    const sentPairs = new Set(
      sentRows
        .filter((r) => r.referenceId && r.userId)
        .map((r) => `${r.referenceId}:${r.userId}:${timeInContent(r.content)}`)
    );

    // ── 3. Gửi noti cho từng buổi ─────────────────────────────────────────────
    for (const session of sessions) {
      const startTime  = session.startTime.slice(0, 5);
      const dayLabel   = WEEKDAY_LABELS[(session.weekday ?? 1) % 7] ?? "";
      const [, mm, dd] = session.sessionDate.split("-");
      const dateLabel  = `${dd}/${mm}`;
      const className  = session.className ?? "";

      const notifBase = {
        category:      "class",
        referenceId:   session.sessionId,
        referenceType: "class_session",
        deeplink: {
          screen: "Calendar",
          params: {
            date:      session.sessionDate,
            sessionId: session.sessionId,
            classId:   session.classId,
          },
        },
      } as const;

      // ── Học viên ─────────────────────────────────────────────────────────────
      const studentsInSession = await db
        .select({
          studentName: students.fullName,
          userId: students.userId,
        })
        .from(studentSessions)
        .innerJoin(students, eq(studentSessions.studentId, students.id))
        .where(
          and(
            eq(studentSessions.classSessionId, session.sessionId),
            rawSql`${studentSessions.status} != 'cancelled'`
          )
        );

      const noAppStudents = studentsInSession.filter((s) => !s.userId).length;
      let studentsSent = 0;

      for (const s of studentsInSession) {
        if (!s.userId) continue;
        if (sentPairs.has(`${session.sessionId}:${s.userId}:${startTime}`)) continue;
        await sendNotification({
          ...notifBase,
          userId:  s.userId,
          title:   "Nhắc lịch học",
          content: `Lớp ${className} bắt đầu lúc ${startTime}, ${dayLabel} ${dateLabel}`,
        });
        sentPairs.add(`${session.sessionId}:${s.userId}:${startTime}`);
        studentsSent++;
      }

      // ── Giáo viên ─────────────────────────────────────────────────────────────
      const teacherStaffIds = (session.teacherIds ?? []).filter(Boolean) as string[];
      let teachersSent = 0;

      if (teacherStaffIds.length > 0) {
        const teacherRows = await db
          .select({ userId: staff.userId })
          .from(staff)
          .where(inArray(staff.id, teacherStaffIds));

        for (const t of teacherRows) {
          if (!t.userId) continue;
          if (sentPairs.has(`${session.sessionId}:${t.userId}:${startTime}`)) continue;
          await sendNotification({
            ...notifBase,
            userId:  t.userId,
            title:   "Nhắc lịch dạy",
            content: `Lớp ${className} bắt đầu lúc ${startTime}, ${dayLabel} ${dateLabel}`,
          });
          sentPairs.add(`${session.sessionId}:${t.userId}:${startTime}`);
          teachersSent++;
        }
      }

      console.log(
        `[ClassBellReminder] ✓ Lớp "${className}" ca ${startTime} ${dayLabel} ${dateLabel}` +
        ` — đã gửi: ${studentsSent} HV, ${teachersSent} GV` +
        (noAppStudents ? ` | bỏ qua ${noAppStudents} HV chưa cài app` : "")
      );
    }
  } catch (err) {
    console.error("[ClassBellReminder] Lỗi:", err);
  }
}

export function startClassBellReminderCron(): void {
  runClassBellReminder();
  setInterval(runClassBellReminder, 60 * 1000);
  console.log("[ClassBellReminder] Cron đã khởi động — nhắc lịch trước 15 phút, interval: 1 phút");
}
