import type { Express } from "express";
import { storage } from "../storage";
import { distributeInvoiceFeeToSessions } from "../storage/invoice-session-allocation.storage";
import { createWalletEntry, getNetWalletAmountByInvoiceAndCategory } from "../storage/wallet.storage";
import { z } from "zod";
import { insertInvoiceSchema, insertInvoiceItemSchema, insertInvoicePaymentScheduleSchema } from "@shared/schema";
import { db } from "../storage/base";
import { staff, classes, invoices, invoicePaymentSchedule, students } from "@shared/schema";
import { eq, asc, sql } from "drizzle-orm";
import { sendNotificationToMany } from "../lib/notification";

async function generateNextSettleCode(): Promise<string> {
  const result = await db.execute(sql`
    SELECT COALESCE(
      MAX(NULLIF(regexp_replace(settle_code, '[^0-9]', '', 'g'), '')::int),
      0
    ) AS mx
    FROM (
      SELECT settle_code FROM invoices WHERE settle_code ~ '^KT[0-9]+'
      UNION ALL
      SELECT settle_code FROM invoice_payment_schedule WHERE settle_code ~ '^KT[0-9]+'
    ) t
  `);
  const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
  const mx = Number((rows[0] as any)?.mx ?? 0);
  return `KT${String(mx + 1).padStart(2, '0')}`;
}

async function resolveCreatorName(userId: string | undefined | null): Promise<string | null> {
  if (!userId) return null;
  const [row] = await db.select({ fullName: staff.fullName }).from(staff).where(eq(staff.userId, userId)).limit(1);
  return row?.fullName ?? null;
}

async function resolveClassName(classId: string | undefined | null): Promise<string | null> {
  if (!classId) return null;
  const [row] = await db.select({ name: classes.name }).from(classes).where(eq(classes.id, classId)).limit(1);
  return row?.name ?? null;
}

async function sendInvoiceCreatedNotification(
  invoiceCode: string | null | undefined,
  grandTotal: string | null | undefined,
  studentId: string | null | undefined,
  creatorUserId: string | null | undefined,
  invoiceId: string,
  extraRecipientUserId?: string | null,
): Promise<void> {
  const recipientUserIds = new Set<string>();

  if (studentId) {
    const [studentRow] = await db.select({ userId: students.userId })
      .from(students).where(eq(students.id, studentId)).limit(1);
    if (studentRow?.userId) recipientUserIds.add(studentRow.userId);
  }

  if (extraRecipientUserId) recipientUserIds.add(extraRecipientUserId);
  if (creatorUserId) recipientUserIds.add(creatorUserId);

  if (!recipientUserIds.size) return;

  const amount = parseFloat(grandTotal ?? "0");
  const formattedAmount = amount.toLocaleString("vi-VN") + " đ";
  const code = invoiceCode ?? "—";

  await sendNotificationToMany([...recipientUserIds], {
    title: "Thông báo hoá đơn mới",
    content: `Hoá đơn ${code} đã được tạo, số tiền: ${formattedAmount}`,
    category: "finance",
    referenceType: "invoice",
    referenceId: invoiceId,
  });
}

async function resolveInvoiceRecipientUserIds(invoice: any): Promise<string[]> {
  const recipientUserIds = new Set<string>();
  if (invoice.studentId) {
    const [row] = await db.select({ userId: students.userId }).from(students).where(eq(students.id, invoice.studentId)).limit(1);
    if (row?.userId) recipientUserIds.add(row.userId);
  } else if (invoice.subjectName) {
    const match = (invoice.subjectName as string).match(/^\[([^\]]+)\]/);
    if (match) {
      const [row] = await db.select({ userId: staff.userId }).from(staff).where(eq(staff.code, match[1])).limit(1);
      if (row?.userId) recipientUserIds.add(row.userId);
    }
  }
  return [...recipientUserIds];
}

async function sendInvoicePaidNotification(
  invoiceCode: string | null | undefined,
  amount: string | number | null | undefined,
  recipientUserIds: string[],
  invoiceId: string,
  scheduleLabel?: string | null,
): Promise<void> {
  if (!recipientUserIds.length) return;
  const formattedAmount = parseFloat(String(amount ?? "0")).toLocaleString("vi-VN") + " đ";
  const invoiceRef = scheduleLabel
    ? `Hoá đơn ${invoiceCode ?? "—"} (${scheduleLabel})`
    : `Hoá đơn ${invoiceCode ?? "—"}`;
  await sendNotificationToMany(recipientUserIds, {
    title: "Thông báo thanh toán",
    content: `${invoiceRef} vừa được chuyển: Đã thanh toán số tiền: ${formattedAmount}`,
    category: "finance",
    referenceType: "invoice",
    referenceId: invoiceId,
  });
}

const STATUS_LABEL: Record<string, string> = {
  paid: "Đã thanh toán",
  unpaid: "Chưa thanh toán",
  partial: "Thanh toán một phần",
  debt: "Công nợ",
  cancelled: "Đã huỷ",
};

function walletActionFor(
  category: string | null | undefined,
  type: "credit" | "debit",
  invoiceCode?: string | null,
  newStatus?: string | null,
): string {
  const cat = (category ?? "").trim();
  let base: string;
  if (type === "credit") {
    if (cat === "Học phí") base = "Cộng tiền vào tài khoản học phí";
    else if (cat === "Đặt cọc") base = "Cộng tiền vào tài khoản đặt cọc";
    else base = "Cộng tiền";
  } else {
    if (cat === "Học phí") base = "Trừ tiền từ tài khoản học phí";
    else if (cat === "Đặt cọc") base = "Trừ tiền từ tài khoản đặt cọc";
    else base = "Trừ tiền";
  }
  if (invoiceCode && newStatus) {
    const statusLabel = STATUS_LABEL[newStatus] ?? newStatus;
    return `${base} do hoá đơn ${invoiceCode} chuyển trạng thái: ${statusLabel}`;
  }
  return base;
}

function computeHocPhiWalletAmount(grandTotal: number, items: any[]): number {
  const nonHocPhiTotal = (items ?? []).reduce((sum: number, item: any) => {
    if ((item.category ?? "").trim() !== "Học phí") return sum + (parseFloat(item.subtotal) || 0);
    return sum;
  }, 0);
  return Math.max(0, grandTotal - nonHocPhiTotal);
}

function computeDepositWalletAmount(items: any[]): number {
  return (items ?? []).reduce((sum: number, item: any) => {
    if ((item.category ?? "").trim() === "Đặt cọc") return sum + (parseFloat(item.subtotal) || 0);
    return sum;
  }, 0);
}

const invoiceItemBodySchema = insertInvoiceItemSchema.omit({ invoiceId: true }).partial({ invoiceId: true });
const invoiceScheduleBodySchema = insertInvoicePaymentScheduleSchema.omit({ invoiceId: true }).partial({ invoiceId: true });

const createInvoiceBodySchema = insertInvoiceSchema.extend({
  items: z.array(invoiceItemBodySchema).optional().default([]),
  paymentSchedule: z.array(invoiceScheduleBodySchema).optional().default([]),
}).omit({ createdBy: true, updatedBy: true });

const updateInvoiceBodySchema = insertInvoiceSchema.partial().extend({
  items: z.array(invoiceItemBodySchema).optional(),
  paymentSchedule: z.array(invoiceScheduleBodySchema).optional(),
}).omit({ createdBy: true, updatedBy: true });

const updateScheduleBodySchema = z.object({
  amount: z.union([z.number(), z.string().transform(v => Number(v))]).optional(),
  dueDate: z.string().nullable().optional(),
});

const splitScheduleBodySchema = z.object({
  splitAmount: z.union([z.number().positive(), z.string().transform(v => {
    const n = Number(v);
    if (isNaN(n) || n <= 0) throw new Error("splitAmount phải là số dương");
    return n;
  })]),
});

export function registerFinanceRoutes(app: Express): void {
  // Transaction Categories
  app.get("/api/finance/transaction-categories", async (req, res) => {
    try {
      const type = req.query.type as string | undefined;
      const data = await storage.getFinanceTransactionCategories(type);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/finance/transaction-categories", async (req, res) => {
    try {
      const data = await storage.createFinanceTransactionCategory(req.body);
      res.status(201).json(data);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.put("/api/finance/transaction-categories/:id", async (req, res) => {
    try {
      const data = await storage.updateFinanceTransactionCategory(req.params.id, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/finance/transaction-categories/:id", async (req, res) => {
    try {
      await storage.deleteFinanceTransactionCategory(req.params.id);
      res.status(204).send();
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Promotions & Surcharges
  app.get("/api/finance/promotions", async (req, res) => {
    try {
      const type = req.query.type as string | undefined;
      const data = await storage.getFinancePromotions(type);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/finance/promotions", async (req, res) => {
    try {
      const data = await storage.createFinancePromotion(req.body);
      res.status(201).json(data);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.put("/api/finance/promotions/:id", async (req, res) => {
    try {
      const data = await storage.updateFinancePromotion(req.params.id, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/finance/promotions/:id", async (req, res) => {
    try {
      await storage.deleteFinancePromotion(req.params.id);
      res.status(204).send();
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Invoices
  app.get("/api/invoice/search-students", async (req, res) => {
    try {
      const locationId = req.query.locationId as string | undefined;
      const searchTerm = req.query.searchTerm as string | undefined;
      const limit = parseInt(req.query.limit as string) || 20;
      const allowedLocationIds = req.allowedLocationIds;
      const isSuperAdmin = req.isSuperAdmin;
      const results = await storage.searchInvoiceSubjects({ locationId, searchTerm, limit, allowedLocationIds: isSuperAdmin ? null : allowedLocationIds });
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/finance/invoices", async (req, res) => {
    try {
      const { status, type, locationId, search, dateFrom, dateTo, salaryTableId } = req.query as Record<string, string>;
      const data = await storage.getInvoices({ status, type, locationId, search, dateFrom, dateTo, salaryTableId, allowedLocationIds: req.allowedLocationIds, isSuperAdmin: req.isSuperAdmin });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/finance/invoices/:id", async (req, res) => {
    try {
      const data = await storage.getInvoice(req.params.id);
      if (!data) return res.status(404).json({ message: "Không tìm thấy phiếu" });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/finance/invoices", async (req, res) => {
    try {
      const parsed = createInvoiceBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.errors });
      }
      const userId = (req as any).user?.id;

      // Validate studentId: must exist in students table, otherwise null it out
      let validatedStudentId = parsed.data.studentId ?? null;
      let resolvedSubjectName = parsed.data.subjectName ?? null;
      let staffRecipientUserId: string | null = null;
      if (validatedStudentId) {
        const [studentCheck] = await db.select({ id: students.id }).from(students).where(eq(students.id, validatedStudentId)).limit(1);
        if (!studentCheck) {
          // Could be a staff ID - look up staff name and userId
          const [staffCheck] = await db.select({ fullName: staff.fullName, code: staff.code, userId: staff.userId }).from(staff).where(eq(staff.id, validatedStudentId)).limit(1);
          if (staffCheck) {
            if (!resolvedSubjectName) resolvedSubjectName = `[${staffCheck.code ?? ""}] ${staffCheck.fullName}`.trim();
            staffRecipientUserId = staffCheck.userId ?? null;
          }
          validatedStudentId = null;
        }
      }

      const data = await storage.createInvoice({ ...parsed.data, studentId: validatedStudentId, subjectName: resolvedSubjectName, createdBy: userId, updatedBy: userId });
      if (data.studentId && data.classId && data.category === "Học phí") {
        await distributeInvoiceFeeToSessions(data.id, data.studentId, data.classId);
      }
      if (data.studentId && data.status === "paid" && data.type === "Thu") {
        const grandTotal = parseFloat(data.grandTotal ?? "0");
        const creationItems = parsed.data.items ?? [];
        const hocPhiAmount = computeHocPhiWalletAmount(grandTotal, creationItems);
        const depositAmount = computeDepositWalletAmount(creationItems);
        const [creatorName, className] = await Promise.all([
          resolveCreatorName(userId),
          resolveClassName(data.classId),
        ]);
        if (hocPhiAmount > 0) {
          await createWalletEntry({
            studentId: data.studentId,
            invoiceId: data.id,
            type: "credit",
            amount: hocPhiAmount,
            category: "Học phí",
            action: walletActionFor("Học phí", "credit", data.code, "paid"),
            classId: data.classId,
            className,
            invoiceCode: data.code,
            invoiceDescription: data.note || data.description,
            createdBy: userId,
            createdByName: creatorName,
          });
        }
        if (depositAmount > 0) {
          await createWalletEntry({
            studentId: data.studentId,
            invoiceId: data.id,
            type: "credit",
            amount: depositAmount,
            category: "Đặt cọc",
            action: walletActionFor("Đặt cọc", "credit", data.code, "paid"),
            classId: data.classId,
            className,
            invoiceCode: data.code,
            invoiceDescription: data.note || data.description,
            createdBy: userId,
            createdByName: creatorName,
          });
        }
      }
      // Deduct deposit if deduction > 0 (any category)
      const deductionAmt = parseFloat(data.deduction ?? "0") || 0;
      if (data.studentId && deductionAmt > 0) {
        const creatorName = await resolveCreatorName(userId);
        const fmtAmt = deductionAmt.toLocaleString("vi-VN") + " đ";
        // 1. Debit full deduction from "Đặt cọc"
        await createWalletEntry({
          studentId: data.studentId,
          invoiceId: data.id,
          type: "debit",
          amount: deductionAmt,
          category: "Đặt cọc",
          action: `Trừ tiền đặt cọc do thanh toán hoá đơn ${data.code ?? ""}: ${fmtAmt}`,
          classId: data.classId,
          invoiceCode: data.code,
          invoiceDescription: data.note || data.description,
          createdBy: userId,
          createdByName: creatorName,
        });
        // 2. Credit "Học phí" wallet with the Học phí portion of the deduction
        const hocPhiSubtotal = (parsed.data.items ?? []).reduce((sum: number, item: any) => {
          if (item.category === "Học phí") return sum + (parseFloat(item.subtotal) || 0);
          return sum;
        }, 0);
        const hocPhiDeduction = Math.min(deductionAmt, hocPhiSubtotal);
        if (hocPhiDeduction > 0) {
          const fmtHocPhi = hocPhiDeduction.toLocaleString("vi-VN") + " đ";
          await createWalletEntry({
            studentId: data.studentId,
            invoiceId: data.id,
            type: "credit",
            amount: hocPhiDeduction,
            category: "Học phí",
            action: `Chuyển tiền từ ví đặt cọc sang Ví học phí do thanh toán hoá đơn ${data.code ?? ""}, Tiền học phí: ${fmtHocPhi}`,
            classId: data.classId,
            invoiceCode: data.code,
            invoiceDescription: data.note || data.description,
            createdBy: userId,
            createdByName: creatorName,
          });
        }
      }
      // Assign settle code when invoice is paid at creation and has no payment schedules
      if (data.status === "paid" && !(parsed.data.paymentSchedule?.length > 0)) {
        const kode = await generateNextSettleCode();
        await db.update(invoices).set({ settleCode: kode }).where(eq(invoices.id, data.id));
        (data as any).settleCode = kode;
      }
      res.status(201).json(data);

      sendInvoiceCreatedNotification(data.code, data.grandTotal, data.studentId, userId, data.id, staffRecipientUserId)
        .catch(err => console.error("[InvoiceNotify] POST error:", err));
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/finance/invoices/:id", async (req, res) => {
    try {
      const parsed = updateInvoiceBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.errors });
      }
      const userId = (req as any).user?.id;
      const before = await storage.getInvoice(req.params.id);

      // Validate studentId: must exist in students table, otherwise null it out
      let validatedStudentId = parsed.data.studentId !== undefined ? (parsed.data.studentId ?? null) : undefined;
      let resolvedSubjectName = parsed.data.subjectName !== undefined ? (parsed.data.subjectName ?? null) : undefined;
      if (validatedStudentId) {
        const [studentCheck] = await db.select({ id: students.id }).from(students).where(eq(students.id, validatedStudentId)).limit(1);
        if (!studentCheck) {
          if (!resolvedSubjectName) {
            const [staffCheck] = await db.select({ fullName: staff.fullName, code: staff.code }).from(staff).where(eq(staff.id, validatedStudentId)).limit(1);
            if (staffCheck) resolvedSubjectName = `[${staffCheck.code ?? ""}] ${staffCheck.fullName}`.trim();
          }
          validatedStudentId = null;
        }
      }

      const patchData: any = { ...parsed.data, updatedBy: userId };
      if (validatedStudentId !== undefined) patchData.studentId = validatedStudentId;
      if (resolvedSubjectName !== undefined) patchData.subjectName = resolvedSubjectName;

      const data = await storage.updateInvoice(req.params.id, patchData);
      if (data.studentId && data.classId && data.category === "Học phí") {
        await distributeInvoiceFeeToSessions(data.id, data.studentId, data.classId);
      }
      // Handle wallet credit/debit when invoice status transitions to/from "paid"
      if (data.studentId && data.type === "Thu") {
        const prevPaid = before?.status === "paid";
        const nowPaid = data.status === "paid";
        const hasSchedules = (data.paymentSchedule ?? []).length > 0;

        if (prevPaid !== nowPaid && !hasSchedules) {
          const grandTotal = parseFloat(data.grandTotal ?? "0");
          const items = data.items ?? [];
          const totalHocPhi = computeHocPhiWalletAmount(grandTotal, items);
          const totalDeposit = computeDepositWalletAmount(items);
          const [creatorName, className] = await Promise.all([
            resolveCreatorName(userId),
            resolveClassName(data.classId),
          ]);

          for (const [cat, totalAmt] of [["Học phí", totalHocPhi], ["Đặt cọc", totalDeposit]] as [string, number][]) {
            if (totalAmt <= 0) continue;
            const existingNet = await getNetWalletAmountByInvoiceAndCategory(data.id, cat);
            if (nowPaid) {
              const toCredit = Math.max(0, totalAmt - existingNet);
              if (toCredit > 0) {
                await createWalletEntry({
                  studentId: data.studentId,
                  invoiceId: data.id,
                  type: "credit",
                  amount: toCredit,
                  category: cat,
                  action: walletActionFor(cat, "credit", data.code, data.status),
                  classId: data.classId,
                  className,
                  invoiceCode: data.code,
                  invoiceDescription: data.note || data.description,
                  createdBy: userId,
                  createdByName: creatorName,
                });
              }
            } else {
              if (existingNet > 0) {
                await createWalletEntry({
                  studentId: data.studentId,
                  invoiceId: data.id,
                  type: "debit",
                  amount: existingNet,
                  category: cat,
                  action: walletActionFor(cat, "debit", data.code, data.status),
                  classId: data.classId,
                  className,
                  invoiceCode: data.code,
                  invoiceDescription: data.note || data.description,
                  createdBy: userId,
                  createdByName: creatorName,
                });
              }
            }
          }
        }
      }

      // Handle deduction change for any invoice category
      if (data.studentId) {
        const oldDed = parseFloat(before?.deduction ?? "0") || 0;
        const newDed = parseFloat(data.deduction ?? "0") || 0;
        if (oldDed !== newDed) {
          const creatorName = await resolveCreatorName(userId);
          // Get the net Học phí amount credited for this invoice (to reverse accurately across multiple edits)
          const existingHocPhiCreditTotal = await getNetWalletAmountByInvoiceAndCategory(data.id, "Học phí");

          const newHocPhiSubtotal = (parsed.data.items ?? []).reduce((sum: number, item: any) => {
            if (item.category === "Học phí") return sum + (parseFloat(item.subtotal) || 0);
            return sum;
          }, 0);
          const newHocPhiDed = Math.min(newDed, newHocPhiSubtotal);

          // Reverse old deduction if any
          if (oldDed > 0) {
            const fmtOld = oldDed.toLocaleString("vi-VN") + " đ";
            await createWalletEntry({
              studentId: data.studentId,
              invoiceId: data.id,
              type: "credit",
              amount: oldDed,
              category: "Đặt cọc",
              action: `Hoàn tiền vào tài khoản Đặt cọc do điều chỉnh hoá đơn ${data.code ?? ""}: ${fmtOld}`,
              classId: data.classId,
              invoiceCode: data.code,
              invoiceDescription: data.note || data.description,
              createdBy: userId,
              createdByName: creatorName,
            });
            // Reverse all prior Học phí credits for this invoice
            if (existingHocPhiCreditTotal > 0) {
              const fmtOldHP = existingHocPhiCreditTotal.toLocaleString("vi-VN") + " đ";
              await createWalletEntry({
                studentId: data.studentId,
                invoiceId: data.id,
                type: "debit",
                amount: existingHocPhiCreditTotal,
                category: "Học phí",
                action: `Hoàn tiền từ Ví học phí về ví đặt cọc do điều chỉnh hoá đơn ${data.code ?? ""}: ${fmtOldHP}`,
                classId: data.classId,
                invoiceCode: data.code,
                invoiceDescription: data.note || data.description,
                createdBy: userId,
                createdByName: creatorName,
              });
            }
          }
          // Apply new deduction if any
          if (newDed > 0) {
            const fmtNew = newDed.toLocaleString("vi-VN") + " đ";
            await createWalletEntry({
              studentId: data.studentId,
              invoiceId: data.id,
              type: "debit",
              amount: newDed,
              category: "Đặt cọc",
              action: `Trừ tiền đặt cọc do thanh toán hoá đơn ${data.code ?? ""}: ${fmtNew}`,
              classId: data.classId,
              invoiceCode: data.code,
              invoiceDescription: data.note || data.description,
              createdBy: userId,
              createdByName: creatorName,
            });
            if (newHocPhiDed > 0) {
              const fmtNewHP = newHocPhiDed.toLocaleString("vi-VN") + " đ";
              await createWalletEntry({
                studentId: data.studentId,
                invoiceId: data.id,
                type: "credit",
                amount: newHocPhiDed,
                category: "Học phí",
                action: `Chuyển tiền từ ví đặt cọc sang Ví học phí do thanh toán hoá đơn ${data.code ?? ""}, Tiền học phí: ${fmtNewHP}`,
                classId: data.classId,
                invoiceCode: data.code,
                invoiceDescription: data.note || data.description,
                createdBy: userId,
                createdByName: creatorName,
              });
            }
          }
        }
      }
      // Assign/clear settle code based on paid status transition (no schedules)
      {
        const prevPaid = before?.status === "paid";
        const nowPaid = data.status === "paid";
        const hasSchedules = (data.paymentSchedule ?? []).length > 0;
        if (!hasSchedules && !prevPaid && nowPaid) {
          const kode = await generateNextSettleCode();
          await db.update(invoices).set({ settleCode: kode }).where(eq(invoices.id, data.id));
          (data as any).settleCode = kode;
        } else if (!hasSchedules && prevPaid && !nowPaid && before?.settleCode) {
          await db.update(invoices).set({ settleCode: null }).where(eq(invoices.id, data.id));
          (data as any).settleCode = null;
        }
      }
      res.json(data);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/finance/invoices/:id", async (req, res) => {
    try {
      await storage.deleteInvoice(req.params.id);
      res.status(204).send();
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/finance/invoices/:id/allocate-sessions", async (req, res) => {
    try {
      const inv = await storage.getInvoice(req.params.id);
      if (!inv) return res.status(404).json({ message: "Không tìm thấy hoá đơn" });
      if (!inv.studentId || !inv.classId) {
        return res.status(400).json({ message: "Hoá đơn không có học viên hoặc lớp học" });
      }
      const allocations = await distributeInvoiceFeeToSessions(inv.id, inv.studentId, inv.classId);
      res.json({ allocated: allocations.length, allocations });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/finance/invoices/:id/payment-schedules", async (req, res) => {
    try {
      const schedules = await storage.getInvoicePaymentSchedules(req.params.id);
      res.json(schedules);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/finance/invoice-schedules/:id/split", async (req, res) => {
    try {
      const parsed = splitScheduleBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "splitAmount không hợp lệ", errors: parsed.error.errors });
      }
      const result = await storage.splitInvoiceSchedule(req.params.id, Number(parsed.data.splitAmount));
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/finance/invoice-schedules/:id", async (req, res) => {
    try {
      const parsed = updateScheduleBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.errors });
      }
      const { amount, dueDate } = parsed.data;
      const data: Record<string, unknown> = {};
      if (amount !== undefined) data.amount = Number(amount);
      if (dueDate !== undefined) data.dueDate = dueDate;
      const updated = await storage.updateInvoiceSchedule(req.params.id, data as any);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/finance/invoice-schedules/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      if (!status || !["unpaid", "paid"].includes(status)) {
        return res.status(400).json({ message: "Trạng thái không hợp lệ" });
      }
      const userId = (req as any).user?.id;

      // Fetch schedule before update to know its invoiceId, amount, and previous status
      const [scheduleBefore] = await db
        .select()
        .from(invoicePaymentSchedule)
        .where(eq(invoicePaymentSchedule.id, req.params.id))
        .limit(1);

      const updated = await storage.updateInvoiceScheduleStatus(req.params.id, status);

      // Create wallet entry for Học phí if applicable
      if (scheduleBefore && scheduleBefore.invoiceId) {
        const prevPaid = scheduleBefore.status === "paid";
        const nowPaid = status === "paid";
        if (prevPaid !== nowPaid) {
          const invoice = await storage.getInvoice(scheduleBefore.invoiceId);
          if (invoice && invoice.studentId && invoice.type === "Thu") {
            const grandTotal = parseFloat(invoice.grandTotal ?? "0");
            const invoiceItems = invoice.items ?? [];
            const totalHocPhi = computeHocPhiWalletAmount(grandTotal, invoiceItems);
            const totalDeposit = computeDepositWalletAmount(invoiceItems);
            const grandWalletTotal = totalHocPhi + totalDeposit;

            if (grandWalletTotal > 0) {
              // Get all OTHER schedules for this invoice (excluding the current one)
              const allSchedules = await db
                .select()
                .from(invoicePaymentSchedule)
                .where(eq(invoicePaymentSchedule.invoiceId, scheduleBefore.invoiceId))
                .orderBy(asc(invoicePaymentSchedule.sortOrder));
              const otherPaidSchedules = allSchedules.filter(
                (s) => s.id !== req.params.id && s.status === "paid"
              );
              const alreadyPaidFromOthers = otherPaidSchedules.reduce(
                (sum, s) => sum + (parseFloat(s.amount ?? "0") || 0),
                0
              );
              const scheduleAmt = parseFloat(scheduleBefore.amount ?? "0") || 0;
              const [creatorName, className] = await Promise.all([
                resolveCreatorName(userId),
                resolveClassName(invoice.classId),
              ]);
              const scheduleLabel = scheduleBefore.label ?? scheduleBefore.code ?? req.params.id;

              for (const [cat, catTotal] of [["Học phí", totalHocPhi], ["Đặt cọc", totalDeposit]] as [string, number][]) {
                if (catTotal <= 0) continue;
                const remaining = Math.max(0, catTotal - alreadyPaidFromOthers);
                const thisAmt = Math.min(scheduleAmt, remaining);
                if (thisAmt > 0) {
                  await createWalletEntry({
                    studentId: invoice.studentId,
                    invoiceId: invoice.id,
                    type: nowPaid ? "credit" : "debit",
                    amount: thisAmt,
                    category: cat,
                    action: nowPaid
                      ? `Cộng tiền vào tài khoản ${cat === "Học phí" ? "học phí" : "đặt cọc"} do thanh toán ${scheduleLabel} (hoá đơn ${invoice.code ?? ""})`
                      : `Hoàn tiền ${cat === "Học phí" ? "học phí" : "đặt cọc"} do huỷ thanh toán ${scheduleLabel} (hoá đơn ${invoice.code ?? ""})`,
                    classId: invoice.classId,
                    className,
                    invoiceCode: invoice.code,
                    invoiceDescription: invoice.note || invoice.description,
                    createdBy: userId,
                    createdByName: creatorName,
                  });
                }
              }
            }
          }
        }
      }

      // Assign/clear settle code on schedule installment paid status change
      if (scheduleBefore) {
        const prevPaid = scheduleBefore.status === "paid";
        const nowPaid = status === "paid";
        if (!prevPaid && nowPaid) {
          const kode = await generateNextSettleCode();
          await db.update(invoicePaymentSchedule).set({ settleCode: kode }).where(eq(invoicePaymentSchedule.id, req.params.id));
          (updated as any).settleCode = kode;

          // Send paid notification for this schedule installment
          if (scheduleBefore.invoiceId) {
            const invoice = await storage.getInvoice(scheduleBefore.invoiceId);
            if (invoice) {
              const scheduleLabel = scheduleBefore.label ?? scheduleBefore.code ?? null;
              const recipientIds = await resolveInvoiceRecipientUserIds(invoice);
              await sendInvoicePaidNotification(
                invoice.code,
                scheduleBefore.amount,
                recipientIds,
                invoice.id,
                scheduleLabel,
              );
            }
          }
        } else if (prevPaid && !nowPaid && scheduleBefore.settleCode) {
          await db.update(invoicePaymentSchedule).set({ settleCode: null }).where(eq(invoicePaymentSchedule.id, req.params.id));
          (updated as any).settleCode = null;
        }
      }

      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/finance/invoices/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      if (!status || !["unpaid", "partial", "paid", "debt", "cancelled"].includes(status)) {
        return res.status(400).json({ message: "Trạng thái không hợp lệ" });
      }
      const userId = (req as any).user?.id;
      const before = await storage.getInvoice(req.params.id);
      const updated = await storage.updateInvoiceStatus(req.params.id, status);

      if (before && before.studentId && before.type === "Thu") {
        const prevPaid = before.status === "paid";
        const nowPaid = status === "paid";
        // If the invoice has payment schedules, wallet entries are handled per-schedule
        const hasSchedules = (before.paymentSchedule ?? []).length > 0;
        if (!hasSchedules && prevPaid !== nowPaid) {
          const grandTotal = parseFloat(before.grandTotal ?? "0");
          const items = before.items ?? [];
          const hocPhiAmount = computeHocPhiWalletAmount(grandTotal, items);
          const depositAmount = computeDepositWalletAmount(items);
          const [creatorName, className] = await Promise.all([
            resolveCreatorName(userId),
            resolveClassName(before.classId),
          ]);

          for (const [cat, amt] of [["Học phí", hocPhiAmount], ["Đặt cọc", depositAmount]] as [string, number][]) {
            if (amt <= 0) continue;
            await createWalletEntry({
              studentId: before.studentId,
              invoiceId: before.id,
              type: nowPaid ? "credit" : "debit",
              amount: amt,
              category: cat,
              action: walletActionFor(cat, nowPaid ? "credit" : "debit", before.code, status),
              classId: before.classId,
              className,
              invoiceCode: before.code,
              invoiceDescription: before.note || before.description,
              createdBy: userId,
              createdByName: creatorName,
            });
          }
        }
      }

      // Assign/clear settle code on invoice paid status transition (no schedules)
      if (before) {
        const prevPaid = before.status === "paid";
        const nowPaid = status === "paid";
        const hasSchedules = (before.paymentSchedule ?? []).length > 0;
        if (!hasSchedules && !prevPaid && nowPaid) {
          const kode = await generateNextSettleCode();
          await db.update(invoices).set({ settleCode: kode }).where(eq(invoices.id, before.id));

          // Send paid notification for main invoice
          const recipientIds = await resolveInvoiceRecipientUserIds(before);
          await sendInvoicePaidNotification(
            before.code,
            before.grandTotal,
            recipientIds,
            before.id,
          );
        } else if (!hasSchedules && prevPaid && !nowPaid && before.settleCode) {
          await db.update(invoices).set({ settleCode: null }).where(eq(invoices.id, before.id));
        }
      }

      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/finance/invoice-schedules/:id", async (req, res) => {
    try {
      await storage.deleteInvoiceSchedule(req.params.id);
      res.status(204).send();
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/finance/invoices/:id/append-salary-payment", async (req, res) => {
    try {
      const amountPaid = Number(req.body.amountPaid);
      if (!amountPaid || amountPaid <= 0) {
        return res.status(400).json({ message: "amountPaid phải là số dương" });
      }
      const result = await storage.appendSalaryPayment(req.params.id, amountPaid);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // ── Invoice Print Templates ──
  app.get("/api/finance/invoice-print-templates", async (req, res) => {
    try {
      const templates = await storage.getInvoicePrintTemplates();
      res.json(templates);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/finance/invoice-print-templates/default/:invoiceType", async (req, res) => {
    try {
      const template = await storage.getDefaultInvoicePrintTemplate(req.params.invoiceType);
      if (!template) return res.status(404).json({ message: "Chưa có mẫu mặc định cho loại này" });
      res.json(template);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/finance/invoice-print-templates/:id", async (req, res) => {
    try {
      const template = await storage.getInvoicePrintTemplate(req.params.id);
      if (!template) return res.status(404).json({ message: "Không tìm thấy mẫu hoá đơn" });
      res.json(template);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/finance/invoice-print-templates", async (req, res) => {
    try {
      const body = z.object({
        name: z.string().min(1),
        pageSize: z.string().default("A4"),
        invoiceType: z.string().default("Thu"),
        html: z.string().default(""),
      }).parse(req.body);
      const createdBy = (req.user as any)?.id ?? null;
      const template = await storage.createInvoicePrintTemplate({ ...body, createdBy });
      res.status(201).json(template);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/finance/invoice-print-templates/:id", async (req, res) => {
    try {
      const body = z.object({
        name: z.string().min(1).optional(),
        pageSize: z.string().optional(),
        orientation: z.string().optional(),
        invoiceType: z.string().optional(),
        html: z.string().optional(),
      }).parse(req.body);
      const template = await storage.updateInvoicePrintTemplate(req.params.id, body);
      res.json(template);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/finance/invoice-print-templates/:id/set-default", async (req, res) => {
    try {
      const { invoiceType } = z.object({ invoiceType: z.string() }).parse(req.body);
      const template = await storage.setDefaultInvoicePrintTemplate(req.params.id, invoiceType);
      res.json(template);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/finance/invoice-print-templates/:id/unset-default", async (req, res) => {
    try {
      const template = await storage.unsetDefaultInvoicePrintTemplate(req.params.id);
      res.json(template);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/finance/invoice-print-templates/:id", async (req, res) => {
    try {
      await storage.deleteInvoicePrintTemplate(req.params.id);
      res.status(204).send();
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });
}
