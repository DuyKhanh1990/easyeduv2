/**
 * BIDV Webhook Service
 * Xử lý 2 endpoint BIDV gọi vào:
 *   POST /api/bidv/getbill  — BIDV hỏi danh sách bill của khách hàng
 *   POST /api/bidv/paybill  — BIDV thông báo khách hàng đã chuyển tiền
 *
 * Response format theo tài liệu BIDV v1.0:
 *   result_code / result_desc
 */

import { db } from "../../db";
import {
  bidvVirtualAccounts,
  bidvLocationConfigs,
  bidvTransactions,
  invoices,
  invoicePaymentSchedule,
  students,
  studentWalletTransactions,
} from "@shared/schema";
import { eq, and, inArray, sql, asc } from "drizzle-orm";
import { decrypt } from "../crypto.service";
import { getNextLocationCode } from "../../storage/finance.storage";
import { emitToAll } from "../../lib/ws-hub";
import { resolveInvoiceRecipientUserIds, sendInvoicePaidNotification } from "../../lib/invoice-notification";

// ─── BIDV result codes (3 chữ số theo tài liệu) ───────────────────────────
const RC_OK           = "000";   // Thành công
const RC_MISSING      = "001";   // Thiếu tham số
const RC_CHECKSUM     = "004";   // Checksum không hợp lệ
const RC_NO_SERVICE   = "006";   // Service ID không đúng/không tồn tại
const RC_NO_CUSTOMER  = "011";   // Mã khách hàng không đúng/không tồn tại
const RC_NO_BILLS     = "012";   // Khách hàng không có hóa đơn
const RC_NO_BILL      = "021";   // Mã hóa đơn không tồn tại
const RC_AMT_MISMATCH = "022";   // Số tiền gửi lên không đúng
const RC_ALREADY_PAID = "023";   // Hóa đơn đã gạch nợ rồi
const RC_ERROR        = "031";   // Có lỗi phát sinh từ hệ thống

// ─── Helper: generate next settle code per location ───────────────────────
async function nextSettleCode(locationId?: string | null): Promise<string> {
  return getNextLocationCode(locationId, "KT");
}

// ─── getbill ───────────────────────────────────────────────────────────────
export interface GetBillRequest {
  customerId: string;
  vaCode: string;
  merchantId?: string;
}

export interface GetBillResponse {
  result_code: string;
  result_desc: string;
  customer_id?: string;
  customer_name?: string;
  customer_addr?: string;
  bill_id?: string;
  type?: string;
  total_amount?: string;
  data?: Array<{
    period: string;
    data: Array<{
      bill_id: string;
      amount: string;
      remark: string;
    }>;
  }>;
}

export async function processGetBill(req: GetBillRequest): Promise<GetBillResponse> {
  const { vaCode, customerId } = req;

  // Tìm Virtual Account
  const [va] = await db
    .select()
    .from(bidvVirtualAccounts)
    .where(eq(bidvVirtualAccounts.vaCode, vaCode))
    .limit(1);

  if (!va) {
    console.warn(`[BIDV_GETBILL] vaCode=${vaCode} ERROR: VA not found → resultCode=011`);
    return { result_code: RC_NO_CUSTOMER, result_desc: "Mã khách hàng không đúng/ không tồn tại" };
  }

  console.log(`[BIDV_GETBILL] vaType=${va.type} invoiceId=${va.invoiceId ?? "null"} studentId=${va.studentId ?? "null"}`);

  // ── Branch: Invoice VA / Schedule VA / Student VA ──────────────────────────
  if (va.type === "schedule") {
    return processGetBillScheduleVA(va, customerId);
  }
  if (va.type === "invoice") {
    return processGetBillInvoiceVA(va, customerId);
  }
  return processGetBillStudentVA(va, customerId);
}

// ── GetBill: Schedule VA — trả đúng 1 đợt thanh toán gắn với VA này ──────────
async function processGetBillScheduleVA(
  va: { scheduleId?: string | null; vaCode: string; studentId: string | null; invoiceId: string | null },
  customerId: string,
): Promise<GetBillResponse> {
  if (!va.scheduleId) {
    console.error(`[BIDV_GETBILL] vaCode=${va.vaCode} ERROR: schedule VA has no scheduleId → resultCode=031`);
    return { result_code: RC_ERROR, result_desc: "Có lỗi phát sinh từ hệ thống" };
  }

  const [sched] = await db
    .select({
      id: invoicePaymentSchedule.id,
      invoiceId: invoicePaymentSchedule.invoiceId,
      code: invoicePaymentSchedule.code,
      label: invoicePaymentSchedule.label,
      amount: invoicePaymentSchedule.amount,
      dueDate: invoicePaymentSchedule.dueDate,
      status: invoicePaymentSchedule.status,
    })
    .from(invoicePaymentSchedule)
    .where(eq(invoicePaymentSchedule.id, va.scheduleId))
    .limit(1);

  if (!sched) {
    console.warn(`[BIDV_GETBILL] vaCode=${va.vaCode} scheduleId=${va.scheduleId} ERROR: schedule not found → resultCode=011`);
    return { result_code: RC_NO_CUSTOMER, result_desc: "Mã khách hàng không đúng/ không tồn tại" };
  }

  if (sched.status === "paid") {
    console.warn(`[BIDV_GETBILL] scheduleId=${sched.id} already paid → resultCode=012`);
    return { result_code: RC_NO_BILLS, result_desc: "Khách hàng không có hóa đơn" };
  }

  // Lấy tên học viên từ invoice cha
  const [inv] = await db
    .select({ studentId: invoices.studentId, subjectName: invoices.subjectName, code: invoices.code })
    .from(invoices)
    .where(eq(invoices.id, sched.invoiceId))
    .limit(1);

  const resolvedStudentId = inv?.studentId ?? va.studentId;
  let customerName = "";
  if (resolvedStudentId) {
    const [student] = await db.select({ fullName: students.fullName }).from(students).where(eq(students.id, resolvedStudentId)).limit(1);
    customerName = student?.fullName ?? "";
  }
  if (!customerName && inv?.subjectName) {
    customerName = inv.subjectName.replace(/^\[[^\]]+\]\s*/, "").trim();
  }

  const amount = Math.round(parseFloat(sched.amount ?? "0"));
  const billId = sched.code ?? sched.label;
  const period = sched.dueDate
    ? (() => { const d = new Date(sched.dueDate); return `Đợt ${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; })()
    : (sched.label ?? billId);
  const remark = `${inv?.code ?? ""} - ${sched.label}`;

  console.log(`[BIDV_GETBILL] scheduleId=${sched.id} label=${sched.label} amount=${amount} customerName="${customerName}"`);

  return {
    result_code: RC_OK,
    result_desc: "success",
    customer_id: customerId,
    customer_name: customerName,
    customer_addr: "",
    bill_id: billId,
    type: "1",
    total_amount: String(amount),
    data: [{ period, data: [{ bill_id: billId, amount: String(amount), remark }] }],
  };
}

// ── GetBill: Invoice VA — trả đúng 1 hóa đơn gắn với VA này ─────────────────
async function processGetBillInvoiceVA(
  va: { invoiceId: string | null; vaCode: string; studentId: string | null },
  customerId: string,
): Promise<GetBillResponse> {
  if (!va.invoiceId) {
    console.error(`[BIDV_GETBILL] vaCode=${va.vaCode} ERROR: invoice VA has no invoiceId → resultCode=031`);
    return { result_code: RC_ERROR, result_desc: "Có lỗi phát sinh từ hệ thống" };
  }

  const [inv] = await db
    .select({
      id: invoices.id,
      code: invoices.code,
      description: invoices.description,
      note: invoices.note,
      grandTotal: invoices.grandTotal,
      remainingAmount: invoices.remainingAmount,
      dueDate: invoices.dueDate,
      status: invoices.status,
      studentId: invoices.studentId,
      subjectName: invoices.subjectName,
    })
    .from(invoices)
    .where(eq(invoices.id, va.invoiceId))
    .limit(1);

  if (!inv) {
    console.warn(`[BIDV_GETBILL] vaCode=${va.vaCode} invoiceId=${va.invoiceId} ERROR: invoice not found → resultCode=011`);
    return { result_code: RC_NO_CUSTOMER, result_desc: "Mã khách hàng không đúng/ không tồn tại" };
  }

  console.log(`[BIDV_GETBILL] invoiceCode=${inv.code} invoiceStatus=${inv.status} amount=${Math.round(parseFloat(inv.remainingAmount ?? inv.grandTotal ?? "0"))}`);

  // Invoice đã thanh toán hoặc hủy → không còn công nợ
  if (inv.status === "paid" || inv.status === "cancelled") {
    console.warn(`[BIDV_GETBILL] invoiceCode=${inv.code} invoiceStatus=${inv.status} ERROR: invoice paid/cancelled → resultCode=012`);
    return { result_code: RC_NO_BILLS, result_desc: "Khách hàng không có hóa đơn" };
  }

  // Lấy tên học viên: ưu tiên studentId trên invoice, fallback về studentId trên VA,
  // cuối cùng fallback về subject_name trên invoice (dạng "[CODE] Tên" hoặc "Tên")
  const resolvedStudentId = inv.studentId ?? va.studentId;
  let customerName = "";
  if (resolvedStudentId) {
    const [student] = await db
      .select({ fullName: students.fullName })
      .from(students)
      .where(eq(students.id, resolvedStudentId))
      .limit(1);
    customerName = student?.fullName ?? "";
  }
  // Fallback: subject_name từ invoice (strip "[CODE] " prefix nếu có)
  if (!customerName && inv.subjectName) {
    customerName = inv.subjectName.replace(/^\[[^\]]+\]\s*/, "").trim();
  }
  console.log(`[BIDV_GETBILL] invoiceCode=${inv.code} customerName="${customerName}" (studentId=${resolvedStudentId ?? "null"} subjectName=${inv.subjectName ?? "null"})`);

  const amount = Math.round(parseFloat(inv.remainingAmount ?? inv.grandTotal ?? "0"));

  let period: string;
  if (inv.dueDate) {
    const d = new Date(inv.dueDate);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    period = `Hóa đơn tháng ${mm}/${yyyy}`;
  } else {
    period = inv.description || `Hóa đơn ${inv.code ?? inv.id}`;
  }

  const remark = inv.description || inv.note || `Hóa đơn ${inv.code ?? inv.id}`;
  const billId = inv.code ?? inv.id;

  return {
    result_code: RC_OK,
    result_desc: "success",
    customer_id: customerId,
    customer_name: customerName,
    customer_addr: "",
    bill_id: billId,
    type: "1",
    total_amount: String(amount),
    data: [{ period, data: [{ bill_id: billId, amount: String(amount), remark }] }],
  };
}

// ── GetBill: Student VA — trả toàn bộ công nợ của học viên (backward compat) ─
async function processGetBillStudentVA(
  va: { studentId: string | null; vaCode: string },
  customerId: string,
): Promise<GetBillResponse> {
  if (!va.studentId) {
    console.warn(`[BIDV_GETBILL] vaCode=${va.vaCode} ERROR: student VA has no studentId → resultCode=011`);
    return { result_code: RC_NO_CUSTOMER, result_desc: "Mã khách hàng không đúng/ không tồn tại" };
  }

  const [student] = await db
    .select({ id: students.id, fullName: students.fullName })
    .from(students)
    .where(eq(students.id, va.studentId))
    .limit(1);

  if (!student) {
    console.warn(`[BIDV_GETBILL] vaCode=${va.vaCode} studentId=${va.studentId} ERROR: student not found → resultCode=011`);
    return { result_code: RC_NO_CUSTOMER, result_desc: "Mã khách hàng không đúng/ không tồn tại" };
  }

  console.log(`[BIDV_GETBILL] studentId=${student.id} studentName=${student.fullName}`);

  const unpaidInvoices = await db
    .select({
      id: invoices.id,
      code: invoices.code,
      description: invoices.description,
      note: invoices.note,
      grandTotal: invoices.grandTotal,
      remainingAmount: invoices.remainingAmount,
      dueDate: invoices.dueDate,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.studentId, student.id),
        eq(invoices.type, "Thu"),
        inArray(invoices.status, ["unpaid", "partial", "debt"]),
      ),
    )
    .orderBy(asc(invoices.createdAt))
    .limit(20);

  if (unpaidInvoices.length === 0) {
    console.warn(`[BIDV_GETBILL] studentId=${student.id} WARN: no unpaid invoices → resultCode=012`);
    return { result_code: RC_NO_BILLS, result_desc: "Khách hàng không có hóa đơn" };
  }

  console.log(`[BIDV_GETBILL] studentId=${student.id} unpaidInvoiceCount=${unpaidInvoices.length} codes=${unpaidInvoices.map(i => i.code).join(",")}`);

  let totalAmount = 0;
  const data: GetBillResponse["data"] = unpaidInvoices.map((inv) => {
    const amount = Math.round(parseFloat(inv.remainingAmount ?? inv.grandTotal ?? "0"));
    totalAmount += amount;

    let period: string;
    if (inv.dueDate) {
      const d = new Date(inv.dueDate);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      period = `Hóa đơn tháng ${mm}/${yyyy}`;
    } else {
      period = inv.description || `Hóa đơn ${inv.code ?? inv.id}`;
    }

    const remark = inv.description || inv.note || `Hóa đơn ${inv.code ?? inv.id}`;
    return { period, data: [{ bill_id: inv.code ?? inv.id, amount: String(amount), remark }] };
  });

  const firstBillId = unpaidInvoices[0]?.code ?? unpaidInvoices[0]?.id ?? va.vaCode;

  return {
    result_code: RC_OK,
    result_desc: "success",
    customer_id: customerId,
    customer_name: student.fullName,
    customer_addr: "",
    bill_id: firstBillId,
    type: "1",
    total_amount: String(totalAmount),
    data,
  };
}

// ─── paybill ───────────────────────────────────────────────────────────────
export interface PayBillRequest {
  vaCode: string;
  billCode?: string;
  amount: number;
  transactionId?: string;
  paymentTime?: string;
  senderName?: string;
  senderAccount?: string;
  merchantId?: string;
}

// ── PayBill: Schedule VA — gạch nợ 1 đợt, cập nhật invoice cha ──────────────
async function processPayBillScheduleVA(
  va: { scheduleId?: string | null; vaCode: string; invoiceId: string | null; studentId: string | null; locationId: string },
  req: { vaCode: string; billCode?: string; amount: number; transactionId?: string },
): Promise<PayBillResponse> {
  const { vaCode, amount, transactionId } = req;

  if (!va.scheduleId) {
    console.error(`[BIDV_PAYBILL] vaCode=${vaCode} ERROR: schedule VA has no scheduleId → resultCode=031`);
    return { result_code: RC_ERROR, result_desc: "Có lỗi phát sinh từ hệ thống" };
  }

  // 1. Lấy schedule để validate amount trước khi update
  const [schedCheck] = await db
    .select({ amount: invoicePaymentSchedule.amount, status: invoicePaymentSchedule.status })
    .from(invoicePaymentSchedule)
    .where(eq(invoicePaymentSchedule.id, va.scheduleId))
    .limit(1);

  if (!schedCheck) {
    return { result_code: RC_NO_BILL, result_desc: "Mã hóa đơn không tồn tại" };
  }

  const schedAmount = Math.round(parseFloat(String(schedCheck.amount ?? "0")));
  if (schedAmount !== Math.round(amount)) {
    console.warn(`[BIDV_PAYBILL] schedule=${va.scheduleId} ERROR: amount mismatch schedAmount=${schedAmount} sentAmount=${Math.round(amount)} → resultCode=022`);
    return { result_code: RC_AMT_MISMATCH, result_desc: "Số tiền gửi lên không đúng với số tiền trong hóa đơn" };
  }

  // 2. Atomic update schedule: chỉ thành công nếu chưa paid
  const updatedSchedule = await db.execute(sql`
    UPDATE invoice_payment_schedule
    SET status = 'paid', paid_at = NOW()
    WHERE id = ${va.scheduleId} AND status != 'paid'
    RETURNING id, invoice_id, label, code, amount
  `);

  const schedRows = (updatedSchedule as any).rows ?? [];
  if (schedRows.length === 0) {
    console.warn(`[BIDV_PAYBILL] scheduleId=${va.scheduleId} already paid → resultCode=023`);
    return { result_code: RC_ALREADY_PAID, result_desc: "Đợt thanh toán đã gạch nợ rồi" };
  }

  const schedRow = schedRows[0];
  const invoiceId = String(schedRow.invoice_id);
  const paymentNote = transactionId ? `BIDV VA: ${vaCode} | TxID: ${transactionId}` : `BIDV VA: ${vaCode}`;

  try {
    // 3. Settle code cho đợt
    const settleCode = await getNextLocationCode(va.locationId, "KT");
    await db.execute(sql`UPDATE invoice_payment_schedule SET settle_code = ${settleCode} WHERE id = ${va.scheduleId}`);

    // 4. Recalculate parent invoice status
    const allSchedsResult = await db.execute(sql`
      SELECT status, amount FROM invoice_payment_schedule WHERE invoice_id = ${invoiceId}
    `);
    const allSchedRows: any[] = (allSchedsResult as any).rows ?? [];
    const allPaid = allSchedRows.every((r) => r.status === "paid");
    const totalPaid = allSchedRows
      .filter((r) => r.status === "paid")
      .reduce((sum, r) => sum + parseFloat(String(r.amount ?? "0")), 0);

    const [parentInv] = await db
      .select({ grandTotal: invoices.grandTotal, studentId: invoices.studentId, code: invoices.code })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    const grandTotal = parseFloat(String(parentInv?.grandTotal ?? "0"));
    const remainingAmount = Math.max(0, grandTotal - totalPaid);

    if (allPaid) {
      await db.execute(sql`
        UPDATE invoices SET
          status = 'paid', paid_amount = grand_total, remaining_amount = '0',
          paid_at = NOW(), payment_method = 'transfer', payment_note = ${paymentNote}
        WHERE id = ${invoiceId} AND status != 'paid'
      `);
      // Settle code cho invoice cha
      const invSettleCode = await getNextLocationCode(va.locationId, "KT");
      await db.execute(sql`UPDATE invoices SET settle_code = ${invSettleCode} WHERE id = ${invoiceId}`);
    } else {
      await db.execute(sql`
        UPDATE invoices SET
          status = 'partial',
          paid_amount = ${String(totalPaid)},
          remaining_amount = ${String(remainingAmount)}
        WHERE id = ${invoiceId}
      `);
    }

    // 5. Idempotency log
    if (transactionId) {
      try {
        await db.insert(bidvTransactions).values({
          transactionId,
          vaCode,
          invoiceId,
          amount: String(Math.round(amount)),
          status: "processed",
        });
      } catch (logErr: any) {
        if (logErr?.code !== "23505") {
          console.error(`[BIDV paybill schedule] WARN: idempotency log failed txId=${transactionId}`, logErr);
        }
      }
    }

    // 6. Wallet entry nếu toàn bộ hóa đơn đã paid
    if (allPaid && parentInv?.studentId && grandTotal > 0) {
      await db.insert(studentWalletTransactions).values({
        studentId: parentInv.studentId,
        invoiceId,
        type: "credit",
        amount: String(grandTotal),
        category: "Học phí",
        action: `Thanh toán qua BIDV Virtual Account ${vaCode}${transactionId ? ` (TxID: ${transactionId})` : ""}`,
        invoiceCode: parentInv.code ?? "",
        invoiceDescription: "",
      } as any);
    }

    console.log(`[BIDV paybill] Schedule ${schedRow.code ?? schedRow.label} → paid | invoiceId=${invoiceId} | allPaid=${allPaid} | VA: ${vaCode}`);

    // Real-time update + push notification (fire-and-forget, không ảnh hưởng response BIDV)
    emitToAll({ type: "invoice_updated" });
    resolveInvoiceRecipientUserIds({ studentId: parentInv?.studentId ?? null, subjectName: null })
      .then((ids) => sendInvoicePaidNotification(
        parentInv?.code, schedAmount, ids, invoiceId,
        schedRow.code ?? schedRow.label,
        parentInv?.studentId ?? null, null,
      ))
      .catch((err) => console.error("[BIDV paybill schedule] notification error (non-fatal):", err));

    return { result_code: RC_OK, result_desc: "success" };
  } catch (err: any) {
    console.error("[BIDV paybill schedule] post-update error:", err);
    return { result_code: RC_ERROR, result_desc: "Có lỗi phát sinh từ hệ thống" };
  }
}

export interface PayBillResponse {
  result_code: string;
  result_desc: string;
}

export async function processPayBill(req: PayBillRequest): Promise<PayBillResponse> {
  const { vaCode, billCode, amount, transactionId } = req;

  // ── Idempotency check — trans_id đã xử lý chưa? ────────────────────────
  if (transactionId) {
    const [existing] = await db
      .select({ id: bidvTransactions.id })
      .from(bidvTransactions)
      .where(eq(bidvTransactions.transactionId, transactionId))
      .limit(1);

    if (existing) {
      console.warn(`[BIDV_PAYBILL] transId=${transactionId} ERROR: duplicate transId already processed → resultCode=023`);
      return { result_code: RC_ALREADY_PAID, result_desc: "Hóa đơn đã gạch nợ rồi (mỗi hóa đơn chỉ gạch nợ 1 lần)" };
    }
  }

  // ── Tìm Virtual Account ─────────────────────────────────────────────────
  const [va] = await db
    .select()
    .from(bidvVirtualAccounts)
    .where(eq(bidvVirtualAccounts.vaCode, vaCode))
    .limit(1);

  if (!va) {
    console.warn(`[BIDV_PAYBILL] vaCode=${vaCode} ERROR: VA not found → resultCode=011`);
    return { result_code: RC_NO_CUSTOMER, result_desc: "Mã khách hàng không đúng/ không tồn tại" };
  }

  console.log(`[BIDV_PAYBILL] vaType=${va.type} invoiceId=${va.invoiceId ?? "null"} studentId=${va.studentId ?? "null"}`);

  // ── Branch: Schedule VA ──────────────────────────────────────────────────
  if (va.type === "schedule") {
    return processPayBillScheduleVA(va, { vaCode, billCode, amount, transactionId });
  }

  // ── Tìm invoice — branch theo va.type ───────────────────────────────────
  let invoiceId: string | null = null;

  if (va.type === "invoice") {
    // Invoice VA: nguồn sự thật là va.invoiceId — KHÔNG dùng billCode để lookup
    if (!va.invoiceId) {
      console.error(`[BIDV_PAYBILL] vaCode=${vaCode} ERROR: invoice VA has no invoiceId → resultCode=031`);
      return { result_code: RC_ERROR, result_desc: "Có lỗi phát sinh từ hệ thống" };
    }

    console.log(`[BIDV_PAYBILL] vaType=invoice invoiceId=${va.invoiceId}`);

    const [inv] = await db
      .select({
        id: invoices.id,
        code: invoices.code,
        status: invoices.status,
        grandTotal: invoices.grandTotal,
        remainingAmount: invoices.remainingAmount,
      })
      .from(invoices)
      .where(eq(invoices.id, va.invoiceId))
      .limit(1);

    if (!inv) {
      console.warn(`[BIDV_PAYBILL] invoiceId=${va.invoiceId} ERROR: invoice not found → resultCode=021`);
      return { result_code: RC_NO_BILL, result_desc: "Mã hóa đơn không tồn tại" };
    }

    // Validate amount so sánh với remaining
    const invoiceAmount = Math.round(parseFloat(inv.remainingAmount ?? inv.grandTotal ?? "0"));

    console.log(`[BIDV_PAYBILL] invoiceCode=${inv.code} requestBillId=${billCode ?? ""} amount=${Math.round(amount)}`);

    if (invoiceAmount !== Math.round(amount)) {
      console.warn(`[BIDV_PAYBILL] invoiceCode=${inv.code} ERROR: amount mismatch invoiceAmount=${invoiceAmount} sentAmount=${Math.round(amount)} → resultCode=022`);
      return { result_code: RC_AMT_MISMATCH, result_desc: "Số tiền gửi lên không đúng với số tiền trong hóa đơn" };
    }

    // bill_id BIDV gửi lên: chỉ dùng để log/cảnh báo, không lookup
    if (billCode && inv.code && billCode !== inv.code) {
      console.warn(`[BIDV_PAYBILL] invoiceCode=${inv.code} requestBillId=${billCode} WARN: bill_id mismatch (non-fatal) — sử dụng invoice từ VA mapping`);
    }

    invoiceId = inv.id;
  } else {
    // Student VA (backward compat): tìm invoice theo billCode + amount
    let billFoundButAmountMismatch = false;

    if (billCode && va.studentId) {
      const [inv] = await db
        .select({
          id: invoices.id,
          status: invoices.status,
          grandTotal: invoices.grandTotal,
          remainingAmount: invoices.remainingAmount,
        })
        .from(invoices)
        .where(and(eq(invoices.studentId, va.studentId), eq(invoices.code, billCode)))
        .limit(1);

      if (inv) {
        const invoiceAmount = Math.round(parseFloat(inv.remainingAmount ?? inv.grandTotal ?? "0"));
        if (invoiceAmount !== Math.round(amount)) {
          billFoundButAmountMismatch = true;
        } else {
          invoiceId = inv.id;
        }
      }
    }

    if (!invoiceId && !billFoundButAmountMismatch && va.studentId) {
      const [matched] = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(
          and(
            eq(invoices.studentId, va.studentId),
            eq(invoices.type, "Thu"),
            inArray(invoices.status, ["unpaid", "partial", "debt"]),
            sql`ROUND(CAST(COALESCE(${invoices.remainingAmount}, ${invoices.grandTotal}, '0') AS NUMERIC)) = ${Math.round(amount)}`,
          ),
        )
        .orderBy(asc(invoices.createdAt))
        .limit(1);

      if (matched) invoiceId = matched.id;
    }

    if (billFoundButAmountMismatch) {
      console.log(`[BIDV paybill] Amount mismatch for billCode=${billCode} amount=${amount}`);
      return { result_code: RC_AMT_MISMATCH, result_desc: "Số tiền gửi lên không đúng với số tiền trong hóa đơn" };
    }

    if (!invoiceId) {
      console.log(`[BIDV paybill] No matching invoice — VA: ${vaCode}, amount: ${amount}, billCode: ${billCode}`);
      return { result_code: RC_NO_BILL, result_desc: "Mã hóa đơn không tồn tại" };
    }
  }

  // ── Atomic update — chỉ thành công nếu status != 'paid' ─────────────────
  const paymentNote = transactionId
    ? `BIDV VA: ${vaCode} | TxID: ${transactionId}`
    : `BIDV VA: ${vaCode}`;

  const updated = await db.execute(sql`
    UPDATE invoices
    SET
      status = 'paid',
      paid_amount = grand_total,
      remaining_amount = '0',
      paid_at = NOW(),
      payment_method = 'transfer',
      payment_note = ${paymentNote}
    WHERE id = ${invoiceId}
      AND status != 'paid'
    RETURNING id, code, student_id, grand_total
  `);

  const rows = (updated as any).rows ?? [];

  if (rows.length === 0) {
    console.warn(`[BIDV_PAYBILL] invoiceId=${invoiceId} ERROR: invoice already paid (atomic update returned 0 rows) → resultCode=023`);
    return { result_code: RC_ALREADY_PAID, result_desc: "Hóa đơn đã gạch nợ rồi (mỗi hóa đơn chỉ gạch nợ 1 lần)" };
  }

  const paidInvoice = rows[0];

  try {
    const now = new Date();
    const grandTotal = parseFloat(String(paidInvoice.grand_total ?? "0"));

    // Lưu transactionId vào bảng idempotency log
    if (transactionId) {
      try {
        await db.insert(bidvTransactions).values({
          transactionId,
          vaCode,
          invoiceId: paidInvoice.id,
          amount: String(Math.round(amount)),
          status: "processed",
        });
      } catch (logErr: any) {
        if (logErr?.code === "23505") {
          // Duplicate key — concurrent request đã insert trước, bình thường
          console.warn(`[BIDV paybill] transactionId insert conflict (concurrent): ${transactionId}`);
        } else {
          // Lỗi DB thật — log rõ để không che giấu sự cố hạ tầng
          // Invoice đã paid thành công nên không throw, nhưng phải ghi lại
          console.error(`[BIDV paybill] WARN: failed to insert idempotency log for transactionId=${transactionId} — invoice already marked paid`, logErr);
        }
      }
    }

    // Mark schedule items paid
    await db
      .update(invoicePaymentSchedule)
      .set({ status: "paid", paidAt: now })
      .where(eq(invoicePaymentSchedule.invoiceId, paidInvoice.id));

    // Generate và gán settle code (per-location)
    const settleCode = await nextSettleCode(va.locationId);
    await db
      .update(invoices)
      .set({ settleCode } as any)
      .where(eq(invoices.id, paidInvoice.id));

    // Tạo wallet credit entry
    if (paidInvoice.student_id && grandTotal > 0) {
      await db.insert(studentWalletTransactions).values({
        studentId: paidInvoice.student_id,
        invoiceId: paidInvoice.id,
        type: "credit",
        amount: String(grandTotal),
        category: "Học phí",
        action: `Thanh toán qua BIDV Virtual Account ${vaCode}${transactionId ? ` (TxID: ${transactionId})` : ""}`,
        invoiceCode: paidInvoice.code ?? "",
        invoiceDescription: "",
      } as any);
    }

    console.log(`[BIDV paybill] Invoice ${paidInvoice.code} → paid | VA: ${vaCode} | amount: ${amount} | txId: ${transactionId}`);

    // Real-time update + push notification (fire-and-forget, không ảnh hưởng response BIDV)
    emitToAll({ type: "invoice_updated" });
    resolveInvoiceRecipientUserIds({ studentId: paidInvoice.student_id, subjectName: null })
      .then((ids) => sendInvoicePaidNotification(
        paidInvoice.code, paidInvoice.grand_total, ids, paidInvoice.id,
        null, paidInvoice.student_id, null,
      ))
      .catch((err) => console.error("[BIDV paybill] notification error (non-fatal):", err));

    return { result_code: RC_OK, result_desc: "success" };
  } catch (err: any) {
    console.error("[BIDV paybill] post-update error:", err);
    return { result_code: RC_ERROR, result_desc: "Có lỗi phát sinh từ hệ thống" };
  }
}

// ─── Validate merchantId từ location config ────────────────────────────────
export async function validateWebhookCredentials(
  merchantId: string | undefined,
  locationId: string,
): Promise<boolean> {
  if (!merchantId) return true;
  try {
    const [cfg] = await db
      .select({ merchantId: bidvLocationConfigs.merchantId })
      .from(bidvLocationConfigs)
      .where(eq(bidvLocationConfigs.locationId, locationId))
      .limit(1);
    if (!cfg?.merchantId) return true;
    const savedMerchantId = decrypt(cfg.merchantId);
    return savedMerchantId === merchantId;
  } catch {
    return true;
  }
}
