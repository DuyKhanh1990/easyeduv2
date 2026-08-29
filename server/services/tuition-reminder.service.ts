import { db } from "../db";
import { invoicePaymentSchedule, invoices, students, centerConfig } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { notificationService } from "../application/notification/services/NotificationService";

const notifiedScheduleIds = new Set<string>();
let lastResetDate = "";

function getTodayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getTomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatAmount(val: string | number | null): string {
  if (!val) return "0";
  return Number(val).toLocaleString("vi-VN") + " đ";
}

function formatDeadline(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [, m, d] = parts;
  return `${d}/${m}`;
}

async function runTuitionReminder(): Promise<void> {
  try {
    const today = getTodayStr();
    if (today !== lastResetDate) {
      notifiedScheduleIds.clear();
      lastResetDate = today;
    }

    const tomorrow = getTomorrowStr();

    const [center] = await db.select({ id: centerConfig.id }).from(centerConfig).limit(1);
    if (!center?.id) return;

    const rows = await db
      .select({
        scheduleId: invoicePaymentSchedule.id,
        scheduleAmount: invoicePaymentSchedule.amount,
        dueDate: invoicePaymentSchedule.dueDate,
        studentId: invoices.studentId,
        studentName: students.fullName,
      })
      .from(invoicePaymentSchedule)
      .innerJoin(invoices, eq(invoicePaymentSchedule.invoiceId, invoices.id))
      .innerJoin(students, eq(invoices.studentId, students.id))
      .where(
        and(
          eq(invoicePaymentSchedule.status, "unpaid"),
          sql`${invoicePaymentSchedule.dueDate}::text = ${tomorrow}`,
          eq(invoices.type, "Thu"),
        ),
      );

    if (rows.length === 0) return;

    for (const row of rows) {
      if (!row.studentId || notifiedScheduleIds.has(row.scheduleId)) continue;
      notifiedScheduleIds.add(row.scheduleId);

      await notificationService
        .send({
          centerId: center.id,
          studentId: row.studentId,
          type: "tuition_due",
          data: {
            studentName: row.studentName ?? "",
            amount: formatAmount(row.scheduleAmount),
            deadline: row.dueDate ? formatDeadline(row.dueDate) : "",
          },
        })
        .catch((err) => console.error("[TuitionReminder] Lỗi gửi noti scheduleId:", row.scheduleId, err));
    }

    console.log(`[TuitionReminder] Đã kiểm tra ${rows.length} đợt đến hạn ngày ${tomorrow}`);
  } catch (err) {
    console.error("[TuitionReminder] Lỗi cron:", err);
  }
}

export function startTuitionReminderCron(): void {
  runTuitionReminder();
  setInterval(runTuitionReminder, 60 * 60 * 1000);
  console.log("[TuitionReminder] Cron đã khởi động (interval: 1 giờ)");
}
