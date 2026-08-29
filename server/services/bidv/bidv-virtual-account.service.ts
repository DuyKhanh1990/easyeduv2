/**
 * BIDV Virtual Account Service
 *
 * ensureVirtualAccount         — VA cũ: 1 học viên = 1 VA (backward compat)
 * ensureInvoiceVirtualAccount  — VA mới: 1 hóa đơn = 1 VA (format 8-digit suffix)
 */

import { db } from "../../db";
import { bidvVirtualAccounts, bidvLocationConfigs, students, invoices, invoicePaymentSchedule } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

function studentCodeToSuffix(code: string): string {
  const numeric = code.replace(/\D/g, "");
  if (!numeric) {
    const hash = code.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return String(hash % 1_000_000).padStart(6, "0");
  }
  return numeric.slice(-6).padStart(6, "0");
}

export async function ensureVirtualAccount(
  studentId: string,
  locationId: string,
): Promise<{ vaCode: string; isNew: boolean }> {
  const [existing] = await db
    .select()
    .from(bidvVirtualAccounts)
    .where(eq(bidvVirtualAccounts.studentId, studentId))
    .limit(1);

  if (existing) {
    return { vaCode: existing.vaCode, isNew: false };
  }

  const [student] = await db
    .select({ code: students.code })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);

  if (!student) throw new Error(`Student ${studentId} not found`);

  const [locCfg] = await db
    .select({ vaPrefix: bidvLocationConfigs.vaPrefix })
    .from(bidvLocationConfigs)
    .where(eq(bidvLocationConfigs.locationId, locationId))
    .limit(1);

  const prefix = (locCfg?.vaPrefix ?? "VA").toUpperCase();
  const suffix = studentCodeToSuffix(student.code);
  const vaCode = `${prefix}${suffix}`;

  await db.insert(bidvVirtualAccounts).values({
    studentId,
    locationId,
    vaCode,
    status: "active",
  });

  return { vaCode, isNew: true };
}

// ── ensureInvoiceVirtualAccount ─────────────────────────────────────────────
// Mỗi invoice có đúng 1 VA riêng.
// Suffix = 8-digit padded sequence từ bidv_invoice_va_seq (global).
// Lazy: chỉ tạo khi lần đầu mở QR của invoice đó.
export async function ensureInvoiceVirtualAccount(
  invoiceId: string,
  locationId: string,
): Promise<{ vaCode: string; isNew: boolean }> {
  // 1. Đã có VA cho invoice này chưa? — filter type='invoice' để không lấy nhầm schedule VA
  const [existing] = await db
    .select()
    .from(bidvVirtualAccounts)
    .where(and(eq(bidvVirtualAccounts.invoiceId, invoiceId), eq(bidvVirtualAccounts.type, "invoice")))
    .limit(1);

  if (existing) {
    return { vaCode: existing.vaCode, isNew: false };
  }

  // 2. Lấy thông tin invoice (studentId để trace)
  const [inv] = await db
    .select({ studentId: invoices.studentId, locationId: invoices.locationId })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  if (!inv) throw new Error(`Invoice ${invoiceId} not found`);

  // 3. Lấy vaPrefix của location
  const targetLocationId = locationId || inv.locationId;
  const [locCfg] = await db
    .select({ vaPrefix: bidvLocationConfigs.vaPrefix })
    .from(bidvLocationConfigs)
    .where(eq(bidvLocationConfigs.locationId, targetLocationId!))
    .limit(1);

  const prefix = (locCfg?.vaPrefix ?? "VA").toUpperCase();

  // 4. Lấy số thứ tự từ global sequence → 8-digit suffix
  const seqResult = await db.execute(sql`SELECT nextval('bidv_invoice_va_seq') AS seq`);
  const seqRows = (seqResult as any).rows ?? seqResult;
  const seqNum = parseInt(String(seqRows[0]?.seq ?? "1"), 10);
  const suffix = String(seqNum).padStart(8, "0");
  const vaCode = `${prefix}${suffix}`;

  // 5. Insert VA mới với type='invoice'
  // Dùng ON CONFLICT DO NOTHING để handle race condition:
  // nếu request song song đã insert trước → SELECT lại row đã tồn tại
  try {
    await db.insert(bidvVirtualAccounts).values({
      invoiceId,
      studentId: inv.studentId ?? null,
      locationId: targetLocationId!,
      vaCode,
      type: "invoice",
      status: "active",
    });
    return { vaCode, isNew: true };
  } catch (err: any) {
    // Unique constraint violation (race condition) → re-SELECT winner row
    if (err?.code === "23505") {
      const [winner] = await db
        .select()
        .from(bidvVirtualAccounts)
        .where(eq(bidvVirtualAccounts.invoiceId, invoiceId))
        .limit(1);
      if (winner) return { vaCode: winner.vaCode, isNew: false };
    }
    throw err;
  }
}

// ── ensureScheduleVirtualAccount ─────────────────────────────────────────────
// Mỗi đợt thanh toán (installment) có đúng 1 VA riêng.
// Lazy: chỉ tạo khi lần đầu mở QR của đợt đó.
export async function ensureScheduleVirtualAccount(
  scheduleId: string,
  locationId: string,
): Promise<{ vaCode: string; isNew: boolean }> {
  // 1. Đã có VA cho schedule này chưa?
  const [existing] = await db
    .select()
    .from(bidvVirtualAccounts)
    .where(eq(bidvVirtualAccounts.scheduleId, scheduleId))
    .limit(1);

  if (existing) return { vaCode: existing.vaCode, isNew: false };

  // 2. Lấy schedule + invoice để lấy studentId
  const [sched] = await db
    .select({ invoiceId: invoicePaymentSchedule.invoiceId })
    .from(invoicePaymentSchedule)
    .where(eq(invoicePaymentSchedule.id, scheduleId))
    .limit(1);

  if (!sched) throw new Error(`Schedule ${scheduleId} not found`);

  const [inv] = await db
    .select({ studentId: invoices.studentId, locationId: invoices.locationId })
    .from(invoices)
    .where(eq(invoices.id, sched.invoiceId))
    .limit(1);

  // 3. Lấy vaPrefix của location
  const targetLocationId = locationId || inv?.locationId;
  const [locCfg] = await db
    .select({ vaPrefix: bidvLocationConfigs.vaPrefix })
    .from(bidvLocationConfigs)
    .where(eq(bidvLocationConfigs.locationId, targetLocationId!))
    .limit(1);

  const prefix = (locCfg?.vaPrefix ?? "VA").toUpperCase();
  const seqResult = await db.execute(sql`SELECT nextval('bidv_invoice_va_seq') AS seq`);
  const seqRows = (seqResult as any).rows ?? seqResult;
  const seqNum = parseInt(String(seqRows[0]?.seq ?? "1"), 10);
  const vaCode = `${prefix}${String(seqNum).padStart(8, "0")}`;

  try {
    // KHÔNG set invoiceId — unique index trên invoice_id chỉ cho 1 VA/invoice,
    // schedule VA không cần lưu invoiceId (tìm qua scheduleId → invoicePaymentSchedule.invoiceId)
    await db.insert(bidvVirtualAccounts).values({
      scheduleId,
      invoiceId: null,
      studentId: inv?.studentId ?? null,
      locationId: targetLocationId!,
      vaCode,
      type: "schedule",
      status: "active",
    });
    return { vaCode, isNew: true };
  } catch (err: any) {
    if (err?.code === "23505") {
      const [winner] = await db.select().from(bidvVirtualAccounts)
        .where(eq(bidvVirtualAccounts.scheduleId, scheduleId)).limit(1);
      if (winner) return { vaCode: winner.vaCode, isNew: false };
    }
    throw err;
  }
}

export async function getVirtualAccountByStudentId(studentId: string) {
  const [va] = await db
    .select()
    .from(bidvVirtualAccounts)
    .where(eq(bidvVirtualAccounts.studentId, studentId))
    .limit(1);
  return va ?? null;
}

export async function getVirtualAccountByVaCode(vaCode: string) {
  const [va] = await db
    .select()
    .from(bidvVirtualAccounts)
    .where(eq(bidvVirtualAccounts.vaCode, vaCode))
    .limit(1);
  return va ?? null;
}
