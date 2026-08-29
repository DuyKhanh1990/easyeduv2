/**
 * Debt Reminder Service
 * Chạy mỗi phút, gửi thông báo công nợ:
 *  - Chuông nội bộ (bell icon) + Expo Push (điện thoại)  → qua sendNotification()
 *  - Zalo OA / ZNS                                        → qua notificationService.send()
 *
 * ── Logic cửa sổ ngày ────────────────────────────────────────────────────────
 *  Trước hạn  (before): window = [dueDate - days, dueDate - 1]
 *    daily → gửi mỗi ngày trong window
 *    once  → gửi 1 lần vào ngày gần nhất trong window (tính từ hôm nay)
 *
 *  Quá hạn (after):  window = [dueDate + 1, dueDate + days]
 *    daily → gửi mỗi ngày trong window
 *    once  → gửi 1 lần vào ngày gần nhất trong window (tính từ hôm nay)
 *
 *  Ví dụ: dueDate = 15/7, days = 5
 *    before → [10/7, 11/7, 12/7, 13/7, 14/7]
 *    after  → [16/7, 17/7, 18/7, 19/7, 20/7]
 */

import { db } from "../db";
import { pool } from "../db";
import {
  invoicePaymentSchedule,
  invoices,
  students,
  centerConfig,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { sendNotification } from "../lib/notification";
import { notificationService } from "../application/notification/services/NotificationService";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DebtReminderRule {
  days: number;         // số ngày trong window trước/sau hạn
  time: string;         // "HH:MM" (24h)
  cycle: "once" | "daily";
  enabled: boolean;
}

export interface DebtReminderConfig {
  before: DebtReminderRule;
  after: DebtReminderRule;
}

export const DEFAULT_DEBT_REMINDER_CONFIG: DebtReminderConfig = {
  before: { days: 3, time: "08:00", cycle: "once",  enabled: false },
  after:  { days: 1, time: "08:00", cycle: "once",  enabled: false },
};

// ─── Dedup DB cho "daily" ─────────────────────────────────────────────────────
// Dùng bảng notifications để kiểm tra đã gửi trong ngày VN chưa (không mất state khi restart).

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, "0"); }

/** Trả về ngày hôm nay theo giờ Việt Nam (UTC+7), dạng "YYYY-MM-DD" */
function todayStr() {
  const vn = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return vn.toISOString().slice(0, 10);
}

/** Trả về giờ hiện tại theo giờ Việt Nam (UTC+7), dạng "HH:MM" */
function nowHHMM() {
  const vn = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return `${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())}`;
}

/** Trả về "YYYY-MM-DD" sau khi cộng/trừ n ngày */
function shiftDate(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Trả về số ngày chênh lệch (a - b), dương khi a sau b */
function diffDays(a: string, b: string): number {
  return Math.round(
    (new Date(a + "T00:00:00Z").getTime() - new Date(b + "T00:00:00Z").getTime())
    / 86_400_000,
  );
}

function fmtAmount(val: string | number | null): string {
  if (!val) return "0";
  return Number(val).toLocaleString("vi-VN") + "đ";
}

/** "2026-07-20" → "20/7/2026" */
function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${parseInt(d)}/${parseInt(m)}/${y}`;
}

/** "2026-07-20" → "20/7" */
function fmtDateShort(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${parseInt(d)}/${parseInt(m)}`;
}

// ─── Config loader ────────────────────────────────────────────────────────────

export async function getDebtReminderConfig(): Promise<DebtReminderConfig> {
  try {
    const result = await pool.query(`
      SELECT debt_reminder_config FROM center_notification_settings LIMIT 1
    `);
    const raw = result.rows[0]?.debt_reminder_config;
    if (!raw) return DEFAULT_DEBT_REMINDER_CONFIG;
    return { ...DEFAULT_DEBT_REMINDER_CONFIG, ...raw } as DebtReminderConfig;
  } catch {
    return DEFAULT_DEBT_REMINDER_CONFIG;
  }
}

// ─── "Once" persistent dedup (DB) ────────────────────────────────────────────
// Bảng lưu lịch sử gửi 1 lần để không gửi lại nếu server restart

export async function ensureOnceSentTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS debt_reminder_once_sent (
      center_id    TEXT        NOT NULL,
      schedule_id  TEXT        NOT NULL,
      rule_type    TEXT        NOT NULL,  -- 'before' | 'after'
      window_start TEXT        NOT NULL,  -- ngày bắt đầu window "YYYY-MM-DD"
      sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (center_id, schedule_id, rule_type, window_start)
    )
  `);
}

async function isOnceSent(
  centerId:    string,
  scheduleId:  string,
  ruleType:    "before" | "after",
  windowStart: string,
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM debt_reminder_once_sent
     WHERE center_id=$1 AND schedule_id=$2 AND rule_type=$3 AND window_start=$4`,
    [centerId, scheduleId, ruleType, windowStart],
  );
  return r.rowCount! > 0;
}

async function markOnceSent(
  centerId:    string,
  scheduleId:  string,
  ruleType:    "before" | "after",
  windowStart: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO debt_reminder_once_sent (center_id, schedule_id, rule_type, window_start)
     VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
    [centerId, scheduleId, ruleType, windowStart],
  );
}

// ─── Core sender ──────────────────────────────────────────────────────────────

interface ReminderTarget {
  scheduleId:  string;
  invoiceId:   string;
  invoiceCode: string | null;
  description: string | null;
  category:    string | null;
  amount:      string | number | null;
  dueDate:     string;           // "YYYY-MM-DD"
  studentId:   string;
  userId:      string | null;
}

/** Kiểm tra DB: đã gửi noti "daily" cho invoice này hôm nay chưa? */
async function isDailyAlreadySent(
  invoiceId: string,
  userId:    string | null,
  kind:      "before" | "after",
  today:     string,   // "YYYY-MM-DD" VN
): Promise<boolean> {
  if (!userId) return false;  // không có user → không có noti bell nào
  // 00:00 VN = 17:00 UTC hôm qua
  const dayStartUTC = new Date(`${today}T00:00:00+07:00`).toISOString();
  const kindTitle = kind === "before" ? "Hoá đơn sắp đến hạn" : "Hoá đơn quá hạn";
  const r = await pool.query(
    `SELECT 1 FROM notifications
     WHERE user_id = $1
       AND reference_type = 'invoice'
       AND reference_id   = $2
       AND title          = $3
       AND created_at    >= $4
     LIMIT 1`,
    [userId, invoiceId, kindTitle, dayStartUTC],
  );
  return r.rowCount! > 0;
}

async function fireReminder(
  centerId: string,
  target:   ReminderTarget,
  kind:     "before" | "after",
  today:    string,
) {

  const code    = target.invoiceCode ?? "—";
  const amount  = fmtAmount(target.amount);
  const dueDisp = fmtDate(target.dueDate);
  const content = target.description
    ?? (target.category ? `Hoá đơn ${target.category}` : "Hoá đơn học phí");

  // Title ngắn gọn làm header, content chứa toàn bộ chi tiết
  const headerTitle = kind === "before" ? "Hoá đơn sắp đến hạn" : "Hoá đơn quá hạn";

  let detailLine: string;
  if (kind === "before") {
    const daysLeft = diffDays(target.dueDate, today);
    detailLine = daysLeft === 0
      ? `Hoá đơn ${code}: ${amount}. Hôm nay là hạn thanh toán ${dueDisp}`
      : `Hoá đơn ${code}: ${amount}. Còn ${daysLeft} ngày nữa đến hạn thanh toán ${dueDisp}`;
  } else {
    const daysOver = diffDays(today, target.dueDate);
    detailLine = `Hoá đơn ${code}: ${amount}. Hạn thanh toán ${dueDisp} đã quá hạn ${daysOver} ngày`;
  }

  // content = chi tiết + danh mục (hiển thị dưới header title)
  const fullContent = `${detailLine}\n${content}`;

  // 1️⃣ Chuông nội bộ + Expo Push (chỉ khi học viên có tài khoản)
  if (target.userId) {
    sendNotification({
      userId:        target.userId,
      title:         headerTitle,
      content:       fullContent,
      category:      "finance",
      referenceId:   target.invoiceId,
      referenceType: "invoice",
      deeplink:      { screen: "Invoices", params: { invoiceId: target.invoiceId } },
    }).catch((err) =>
      console.error(`[DebtReminder] sendNotification lỗi scheduleId=${target.scheduleId}:`, err),
    );
  }

  // 2️⃣ Zalo OA / ZNS
  notificationService
    .send({
      centerId,
      studentId: target.studentId,
      type:      kind === "before" ? "debt_reminder_before" : "debt_reminder_after",
      data: {
        invoiceCode: code,
        amount,
        deadline:   fmtDateShort(target.dueDate),
        daysLabel:  kind === "before"
          ? `còn ${diffDays(target.dueDate, today)} ngày nữa`
          : `quá hạn ${diffDays(today, target.dueDate)} ngày`,
      },
    })
    .catch((err) =>
      console.error(`[DebtReminder] Zalo lỗi scheduleId=${target.scheduleId}:`, err),
    );
}

// ─── Main cron ────────────────────────────────────────────────────────────────

async function runDebtReminder(): Promise<void> {
  try {
    const today = todayStr();
    const now    = nowHHMM();
    const config = await getDebtReminderConfig();

    // Dùng >= để bắt kịp nếu server restart sau giờ gửi trong cùng ngày.
    // DB dedup bên dưới đảm bảo không gửi 2 lần trong cùng ngày.
    const needBefore = config.before.enabled && now >= config.before.time;
    const needAfter  = config.after.enabled  && now >= config.after.time;
    if (!needBefore && !needAfter) return;

    const [center] = await db.select({ id: centerConfig.id }).from(centerConfig).limit(1);
    if (!center?.id) return;

    // Join đầy đủ: schedule → invoice → student (lấy userId)
    const rows = await db
      .select({
        scheduleId:  invoicePaymentSchedule.id,
        invoiceId:   invoices.id,
        invoiceCode: invoices.code,
        description: invoices.description,
        category:    invoices.category,
        amount:      invoicePaymentSchedule.amount,
        dueDate:     invoicePaymentSchedule.dueDate,
        studentId:   invoices.studentId,
        userId:      students.userId,
      })
      .from(invoicePaymentSchedule)
      .innerJoin(invoices, eq(invoicePaymentSchedule.invoiceId, invoices.id))
      .innerJoin(students, eq(invoices.studentId, students.id))
      .where(
        and(
          eq(invoicePaymentSchedule.status, "unpaid"),
          eq(invoices.type, "Thu"),
          sql`${invoicePaymentSchedule.dueDate} IS NOT NULL`,
        ),
      );

    if (rows.length === 0) return;

    let cntBefore = 0, cntAfter = 0;

    for (const row of rows) {
      if (!row.studentId || !row.dueDate) continue;

      const target: ReminderTarget = {
        scheduleId:  row.scheduleId,
        invoiceId:   row.invoiceId,
        invoiceCode: row.invoiceCode,
        description: row.description,
        category:    row.category,
        amount:      row.amount,
        dueDate:     row.dueDate,
        studentId:   row.studentId,
        userId:      row.userId ?? null,
      };

      // ── TRƯỚC HẠN ────────────────────────────────────────────────────────
      // Window: [dueDate - days, dueDate - 1]
      // VD: dueDate=15/7, days=5 → window=[10/7, 14/7]
      if (needBefore) {
        const bf          = config.before;
        const windowStart = shiftDate(row.dueDate, -bf.days);       // dueDate - days
        const windowEnd   = shiftDate(row.dueDate, -1);             // dueDate - 1
        const inWindow    = today >= windowStart && today <= windowEnd;

        if (inWindow) {
          if (bf.cycle === "daily") {
            // Gửi mỗi ngày trong window — dedup bằng DB để không gửi 2 lần trong cùng ngày
            const alreadySent = await isDailyAlreadySent(target.invoiceId, target.userId, "before", today);
            if (!alreadySent) {
              await fireReminder(center.id, target, "before", today);
              cntBefore++;
            }
          } else {
            // "once": gửi 1 lần duy nhất — dedup bằng bảng once_sent
            const alreadySent = await isOnceSent(center.id, row.scheduleId, "before", windowStart);
            if (!alreadySent) {
              await fireReminder(center.id, target, "before", today);
              await markOnceSent(center.id, row.scheduleId, "before", windowStart);
              cntBefore++;
            }
          }
        }
      }

      // ── QUÁ HẠN ──────────────────────────────────────────────────────────
      // Window: [dueDate + 1, dueDate + days]
      // VD: dueDate=15/7, days=5 → window=[16/7, 20/7]
      if (needAfter) {
        const af          = config.after;
        const windowStart = shiftDate(row.dueDate, 1);              // dueDate + 1
        const windowEnd   = shiftDate(row.dueDate, af.days > 0 ? af.days : 1);  // dueDate + days
        const inWindow    = today >= windowStart && today <= windowEnd;

        if (inWindow) {
          if (af.cycle === "daily") {
            // Gửi mỗi ngày trong window — dedup bằng DB để không gửi 2 lần trong cùng ngày
            const alreadySent = await isDailyAlreadySent(target.invoiceId, target.userId, "after", today);
            if (!alreadySent) {
              await fireReminder(center.id, target, "after", today);
              cntAfter++;
            }
          } else {
            // "once": gửi 1 lần duy nhất (ngày gần nhất trong window = hôm nay nếu đang trong window)
            const alreadySent = await isOnceSent(center.id, row.scheduleId, "after", windowStart);
            if (!alreadySent) {
              await fireReminder(center.id, target, "after", today, `A:${row.scheduleId}:once:${windowStart}`);
              await markOnceSent(center.id, row.scheduleId, "after", windowStart);
              cntAfter++;
            }
          }
        }
      }
    }

    if (cntBefore + cntAfter > 0) {
      console.log(`[DebtReminder] Đã gửi: ${cntBefore} báo trước, ${cntAfter} báo quá hạn`);
    }
  } catch (err) {
    console.error("[DebtReminder] Lỗi cron:", err);
  }
}

export function startDebtReminderCron(): void {
  // Tạo bảng dedup "once" nếu chưa có
  ensureOnceSentTable().catch((err) =>
    console.error("[DebtReminder] Không tạo được bảng once_sent:", err),
  );

  setInterval(runDebtReminder, 60 * 1000);
  console.log("[DebtReminder] Cron đã khởi động (interval: 1 phút)");
}
