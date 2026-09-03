import type { Express } from "express";
import { storage } from "../storage";
import { distributeInvoiceFeeToSessions } from "../storage/invoice-session-allocation.storage";
import { createWalletEntry, getNetWalletAmountByInvoiceAndCategory } from "../storage/wallet.storage";
import { saveInvoiceCommissions, getInvoiceFilterOptions, getNextLocationCode, getAvailableFinanceVouchers } from "../storage/finance.storage";
import { createInvoiceAuditLog } from "../storage/invoice-audit-log.storage";
import { createIssueReceiptsForInvoice, cancelIssueReceiptForInvoice } from "./store-issue-receipt.routes";

import { z } from "zod";
import {
  insertInvoiceSchema,
  insertInvoiceItemSchema,
  insertInvoicePaymentScheduleSchema,
  insertFinanceVoucherSchema,
} from "@shared/schema";
import { db, pool } from "../db";
import { staff, classes, invoices, invoicePaymentSchedule, students, classSessions, centerConfig } from "@shared/schema";
import { eq, asc, sql, and, isNotNull, gte, lte, inArray } from "drizzle-orm";
import { sendNotificationToMany } from "../lib/notification";
import { ensureVirtualAccount } from "../services/bidv/bidv-virtual-account.service";
import { notificationService } from "../application/notification/services/NotificationService";
import { resolveInvoiceRecipientUserIds, sendInvoicePaidNotification } from "../lib/invoice-notification";

async function generateNextSettleCode(locationId?: string | null): Promise<string> {
  return getNextLocationCode(locationId, "KT");
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
  note?: string | null,
  invoiceStatus?: string | null,
): Promise<void> {
  const recipientUserIds = new Set<string>();

  if (extraRecipientUserId) {
    // Staff-targeted invoice: notify only the staff member the invoice concerns,
    // not the creator/admin.
    recipientUserIds.add(extraRecipientUserId);
  } else {
    if (studentId) {
      const [studentRow] = await db.select({ userId: students.userId })
        .from(students).where(eq(students.id, studentId)).limit(1);
      if (studentRow?.userId) recipientUserIds.add(studentRow.userId);
    }
    if (creatorUserId) recipientUserIds.add(creatorUserId);
  }

  const amount = parseFloat(grandTotal ?? "0");
  const formattedAmount = amount.toLocaleString("vi-VN") + " đ";
  const code = invoiceCode ?? "—";

  if (recipientUserIds.size) {
    await sendNotificationToMany([...recipientUserIds], {
      title: "Thông báo hoá đơn mới",
      content: `Hoá đơn ${code} đã được tạo, số tiền: ${formattedAmount}`,
      category: "finance",
      referenceType: "invoice",
      referenceId: invoiceId,
      deeplink: {
        screen: "Invoices",
        params: { invoiceId },
      },
    });
  }

  if (studentId) {
    try {
      const [center] = await db.select({ id: centerConfig.id }).from(centerConfig).limit(1);
      const centerId = center?.id ?? "00000000-0000-0000-0000-000000000000";
      const statusLabel = STATUS_LABEL[invoiceStatus ?? ""] ?? invoiceStatus ?? "Chưa thanh toán";
      await notificationService.send({
        type: "invoice_created",
        studentId,
        centerId,
        data: {
          invoiceCode: code,
          amount: formattedAmount,
          status: statusLabel,
          note: note ?? "",
        },
      });
    } catch (err) {
      console.error("[InvoiceNotify] notificationService.send invoice_created error:", err);
    }
  }
}

// resolveInvoiceRecipientUserIds và sendInvoicePaidNotification đã được chuyển sang
// server/lib/invoice-notification.ts và import ở trên.

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

const invoiceItemBodySchema = insertInvoiceItemSchema.omit({ invoiceId: true }).partial({ invoiceId: true }).extend({
  storeProductId: z.string().uuid().optional().nullable(),
  storeProductCode: z.string().optional().nullable(),
  warehouseId: z.string().uuid().optional().nullable(),
  warehouseName: z.string().optional().nullable(),
  unitId: z.string().uuid().optional().nullable(),
  unitName: z.string().optional().nullable(),
});
const invoiceScheduleBodySchema = insertInvoicePaymentScheduleSchema.omit({ invoiceId: true }).partial({ invoiceId: true });

const createInvoiceBodySchema = insertInvoiceSchema.extend({
  createdAt: z.coerce.date().optional(),
  paidAt: z.coerce.date().nullable().optional(),
  items: z.array(invoiceItemBodySchema).optional().default([]),
  paymentSchedule: z.array(invoiceScheduleBodySchema).optional().default([]),
}).omit({ createdBy: true, updatedBy: true });

const updateInvoiceBodySchema = insertInvoiceSchema.partial().extend({
  items: z.array(invoiceItemBodySchema).optional(),
  paymentSchedule: z.array(invoiceScheduleBodySchema).optional(),
  createdAt: z.coerce.date().optional(),
  paidAt: z.coerce.date().nullable().optional(),
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

const INVOICE_RESOURCE = "/invoices";

async function getInvoicePermissions(req: any) {
  if (req.isSuperAdmin) {
    return { canView: true, canViewAll: true, canCreate: true, canEdit: true, canDelete: true };
  }
  return storage.getEffectivePermissions(req.roleIds || [], INVOICE_RESOURCE);
}

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

  // Vouchers
  app.get("/api/finance/vouchers", async (req, res) => {
    try {
      const searchTerm = typeof req.query.search === "string" ? req.query.search : undefined;
      const data = await storage.getFinanceVouchers(searchTerm);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/finance/vouchers/available", async (req, res) => {
    try {
      const studentId = typeof req.query.studentId === "string" ? req.query.studentId : "";
      const asOfDate = typeof req.query.asOfDate === "string" ? req.query.asOfDate : undefined;
      if (!studentId) return res.json([]);
      const data = await getAvailableFinanceVouchers(studentId, asOfDate);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/finance/vouchers", async (req, res) => {
    try {
      const userId = (req.user as any)?.id ?? null;
      const parsed = insertFinanceVoucherSchema.safeParse({
        ...req.body,
        createdBy: userId,
      });
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.issues.map(issue => issue.message).join(", "),
        });
      }
      const data = await storage.createFinanceVoucher(parsed.data);
      res.status(201).json(data);
    } catch (err: any) {
      const message = err?.code === "23505"
        ? "Mã voucher đã tồn tại."
        : err.message;
      res.status(400).json({ message });
    }
  });

  app.patch("/api/finance/vouchers/:id", async (req, res) => {
    try {
      const data = await storage.updateFinanceVoucher(req.params.id, req.body);
      res.json(data);
    } catch (err: any) {
      const message = err?.code === "23505" ? "Mã voucher đã tồn tại." : err.message;
      res.status(400).json({ message });
    }
  });

  app.delete("/api/finance/vouchers/:id", async (req, res) => {
    try {
      await storage.deleteFinanceVoucher(req.params.id);
      res.status(204).send();
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/finance/vouchers/:id/usages", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const status = typeof req.query.status === "string" ? req.query.status : "all";
      const result = await storage.getFinanceVoucherUsages(req.params.id, { page, limit, search, status });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/finance/vouchers/:id/audience-students", async (req, res) => {
    try {
      const data = await storage.getFinanceVoucherAudienceStudents(req.params.id);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
      const q = req.query as Record<string, any>;
      const getArr = (v: any): string[] | undefined => {
        if (!v) return undefined;
        const a = Array.isArray(v) ? v : [v];
        return a.length > 0 ? a : undefined;
      };
      const data = await storage.getInvoices({
        tabFilter:              q.tabFilter as string | undefined,
        type:                   q.type as string | undefined,
        types:                  getArr(q.types),
        locationId:             q.locationId as string | undefined,
        locationNames:          getArr(q.locationNames),
        search:                 q.search as string | undefined,
        dateFrom:               q.dateFrom as string | undefined,
        dateTo:                 q.dateTo as string | undefined,
        dueDateFrom:            q.dueDateFrom as string | undefined,
        dueDateTo:              q.dueDateTo as string | undefined,
        paidAtFrom:             q.paidAtFrom as string | undefined,
        paidAtTo:               q.paidAtTo as string | undefined,
        salaryTableId:          q.salaryTableId as string | undefined,
        categories:             getArr(q.categories),
        classNames:             getArr(q.classNames),
        creatorNames:           getArr(q.creatorNames),
        payerNames:             getArr(q.payerNames),
        commissionStaffNames:   getArr(q.commissionStaffNames),
        paymentMethods:         getArr(q.paymentMethods),
        sortKey:                q.sortKey as string | undefined,
        sortDir:                q.sortDir as "asc" | "desc" | undefined,
        page:                   q.page   ? parseInt(q.page as string)  : undefined,
        limit:                  q.limit  ? parseInt(q.limit as string) : undefined,
        includeTabCounts:       q.includeTabCounts === "true",
        allowedLocationIds:     req.allowedLocationIds,
        isSuperAdmin:           req.isSuperAdmin,
      });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/finance/invoices/filter-options", async (req, res) => {
    try {
       const { dateFrom, dateTo, dueDateFrom, dueDateTo } = req.query as Record<string, string>;
       const data = await getInvoiceFilterOptions({ dateFrom, dateTo, dueDateFrom, dueDateTo, allowedLocationIds: req.allowedLocationIds, isSuperAdmin: req.isSuperAdmin });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/finance/invoices/summary", async (req, res) => {
    try {
      const q = req.query as Record<string, any>;
      const getArr = (v: any): string[] | undefined => {
        if (!v) return undefined;
        const a = Array.isArray(v) ? v : [v];
        return a.length > 0 ? a : undefined;
      };
      const data = await storage.getInvoicesSummary({
        locationId: q.locationId as string | undefined,
        locationNames: getArr(q.locationNames),
        search: q.search as string | undefined,
        dateFrom: q.dateFrom as string | undefined,
        dateTo: q.dateTo as string | undefined,
        dueDateFrom: q.dueDateFrom as string | undefined,
        dueDateTo: q.dueDateTo as string | undefined,
        paidAtFrom: q.paidAtFrom as string | undefined,
        paidAtTo: q.paidAtTo as string | undefined,
        categories: getArr(q.categories),
        classNames: getArr(q.classNames),
        creatorNames: getArr(q.creatorNames),
        payerNames: getArr(q.payerNames),
        commissionStaffNames: getArr(q.commissionStaffNames),
        paymentMethods: getArr(q.paymentMethods),
        allowedLocationIds: req.allowedLocationIds,
        isSuperAdmin: req.isSuperAdmin,
      });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/finance/invoices/by-category", async (req, res) => {
    try {
      const { locationId, dateFrom, dateTo } = req.query as Record<string, string>;
      const data = await storage.getInvoicesByCategory({ locationId, dateFrom, dateTo, allowedLocationIds: req.allowedLocationIds, isSuperAdmin: req.isSuperAdmin });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/finance/revenue/by-location", async (req, res) => {
    try {
      const { locationId, dateFrom, dateTo } = req.query as Record<string, string>;
      const data = await storage.getRevenueByLocation({ locationId, dateFrom, dateTo, allowedLocationIds: req.allowedLocationIds, isSuperAdmin: req.isSuperAdmin });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/finance/customers/debt-summary", async (req, res) => {
    try {
      const { locationId, dateFrom, dateTo } = req.query as Record<string, string>;
      const data = await storage.getCustomerDebtSummary({ locationId, dateFrom, dateTo, allowedLocationIds: req.allowedLocationIds, isSuperAdmin: req.isSuperAdmin });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── GET /api/finance/invoices/overdue-by-students ──────────────────────────
  // Trả về công nợ nhóm theo studentId theo các trạng thái của Tab Công nợ.
  // Dùng cùng logic với getCustomerDebtSummary (scheduleNextDueDate || dueDate).
  // Query param: studentIds — danh sách UUID cách nhau bằng dấu phẩy
  // Response: Record<studentId, { id, code, dueDate, daysOverdue, remainingAmount, debtStatus }[]>
  //   debtStatus: "overdue" | "dueSoon" | "inTerm" | "noDue"
  app.get("/api/finance/invoices/overdue-by-students", async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const rawIds = typeof req.query.studentIds === "string" ? req.query.studentIds : "";
      const studentIds = rawIds.split(",").map(s => s.trim()).filter(Boolean);
      if (studentIds.length === 0) return res.json({});

      // Query duy nhất: join invoices + schedules, tính nextDueDate và remaining theo logic của getCustomerDebtSummary
      const uuidList = sql.join(studentIds.map(id => sql`${id}::uuid`), sql`, `);
      const rows = await db.execute(sql`
        SELECT
          i.id,
          i.code,
          i.student_id,
          i.due_date,
          i.remaining_amount::numeric                                                                      AS remaining_raw,
          i.grand_total::numeric                                                                           AS grand_total,
          COUNT(ps.id)::int                                                                                AS sched_total,
          SUM(CASE WHEN ps.status = 'paid' THEN 1 ELSE 0 END)::int                                       AS sched_paid_count,
          COALESCE(SUM(CASE WHEN ps.status = 'paid' THEN ps.amount::numeric ELSE 0 END), 0)              AS sched_paid_sum,
          MIN(CASE WHEN ps.status != 'paid' THEN ps.due_date END)                                         AS sched_next_due
        FROM invoices i
        LEFT JOIN invoice_payment_schedule ps ON ps.invoice_id = i.id
        WHERE i.type = 'Thu'
          AND i.status NOT IN ('paid', 'cancelled')
          AND i.student_id IN (${uuidList})
        GROUP BY i.id, i.code, i.student_id, i.due_date, i.remaining_amount, i.grand_total
        ORDER BY i.due_date ASC NULLS LAST
      `);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const in7days = new Date(today);
      in7days.setDate(in7days.getDate() + 7);

      const map: Record<string, { id: string; code: string; dueDate: string | null; daysOverdue: number; remainingAmount: number; debtStatus: string }[]> = {};

      for (const row of rows.rows as any[]) {
        const sid = row.student_id as string;
        if (!sid) continue;

        const schedTotal = Number(row.sched_total ?? 0);
        const schedPaidCount = Number(row.sched_paid_count ?? 0);
        const schedPaidSum = parseFloat(row.sched_paid_sum ?? "0");
        const grand = parseFloat(row.grand_total ?? "0");

        // Nếu có lịch và đã trả hết lịch → bỏ qua
        if (schedTotal > 0 && schedPaidCount >= schedTotal) continue;

        // Tính remaining: ưu tiên grand - schedPaidSum nếu có lịch, không thì dùng remaining_raw
        const remaining = schedTotal > 0
          ? Math.max(0, grand - schedPaidSum)
          : parseFloat(row.remaining_raw ?? "0");
        if (remaining <= 0) continue;

        // dueDate: ưu tiên sched_next_due, sau đó due_date của invoice
        const dueRaw: string | null = row.sched_next_due
          ? row.sched_next_due.toString().slice(0, 10)
          : row.due_date ? row.due_date.toString().slice(0, 10) : null;

        let debtStatus: string;
        let daysOverdue = 0;
        if (!dueRaw) {
          debtStatus = "noDue";
        } else {
          const due = new Date(dueRaw);
          due.setHours(0, 0, 0, 0);
          if (due < today) {
            debtStatus = "overdue";
            daysOverdue = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
          } else if (due <= in7days) {
            debtStatus = "dueSoon";
          } else {
            debtStatus = "inTerm";
          }
        }

        if (!map[sid]) map[sid] = [];
        map[sid].push({
          id: row.id as string,
          code: (row.code as string) ?? (row.id as string).slice(0, 8),
          dueDate: dueRaw,
          daysOverdue,
          remainingAmount: remaining,
          debtStatus,
        });
      }
      return res.json(map);
    } catch (err: any) {
      console.error("[overdue-by-students] error:", err);
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Invoice history / activity timeline ──────────────────────────────────
  app.get("/api/finance/invoices/history", async (req, res) => {
    try {
      const q = req.query as Record<string, string>;
      const dateFrom   = q.dateFrom   || null;
      const dateTo     = q.dateTo     || null;
      const locationId = q.locationId || null;
      const limit      = Math.min(parseInt(q.limit  || "200"), 500);
      const offset     = parseInt(q.offset || "0");
      const allowedIds  = req.allowedLocationIds;
      const isSuperAdmin = req.isSuperAdmin;

      if (!isSuperAdmin && allowedIds && allowedIds.length === 0)
        return res.json({ events: [], total: 0 });

      // Shared location filter snippet (injected into each UNION branch)
      const locSnippet = (() => {
        const parts: string[] = [];
        if (locationId) parts.push(`l.id = '${locationId.replace(/'/g,"''")}'`);
        if (!isSuperAdmin && allowedIds && allowedIds.length > 0) {
          const ids = allowedIds.map(id => `'${id}'`).join(",");
          parts.push(`(l.id IS NULL OR l.id = ANY(ARRAY[${ids}]::uuid[]))`);
        }
        return parts.length ? "AND " + parts.join(" AND ") : "";
      })();

      // Outer date filter on the merged result
      const dateFilter = (() => {
        const parts: string[] = [];
        if (dateFrom) parts.push(`ev_time >= '${dateFrom}'`);
        if (dateTo)   parts.push(`ev_time <  '${dateTo}T23:59:59'`);
        return parts.length ? "WHERE " + parts.join(" AND ") : "";
      })();

      const baseUnion = `
        SELECT
          'created'::text   AS ev_type,
          i.created_at      AS ev_time,
          i.id::text        AS invoice_id,
          i.code            AS invoice_code,
          i.type            AS invoice_type,
          COALESCE(s.full_name, i.subject_name) AS subject_name,
          i.grand_total::text,
          i.grand_total::text AS amount,
          i.payment_method,
          l.name            AS location_name,
          COALESCE(st.full_name, u.username) AS created_by_name,
          NULL::text        AS schedule_label,
          NULL::text        AS schedule_code,
          i.settle_code,
          NULL::text        AS old_content_json,
          NULL::text        AS new_content_json
        FROM invoices i
        LEFT JOIN locations l ON i.location_id = l.id
        LEFT JOIN users     u ON i.created_by  = u.id
        LEFT JOIN staff    st ON st.user_id     = i.created_by
        LEFT JOIN students  s ON i.student_id   = s.id
        WHERE 1=1 ${locSnippet}

        UNION ALL

        SELECT
          'paid'::text      AS ev_type,
          i.paid_at         AS ev_time,
          i.id::text, i.code, i.type,
          COALESCE(s.full_name, i.subject_name),
          i.grand_total::text,
          i.paid_amount::text AS amount,
          i.payment_method,
          l.name,
          COALESCE(st.full_name, u.username),
          NULL::text, NULL::text, i.settle_code,
          NULL::text, NULL::text
        FROM invoices i
        LEFT JOIN locations l ON i.location_id = l.id
        LEFT JOIN users     u ON i.created_by  = u.id
        LEFT JOIN staff    st ON st.user_id     = i.created_by
        LEFT JOIN students  s ON i.student_id   = s.id
        WHERE i.paid_at IS NOT NULL AND i.paid_at <> i.created_at ${locSnippet}

        UNION ALL

        SELECT
          'schedule_paid'::text AS ev_type,
          ps.paid_at         AS ev_time,
          i.id::text, i.code, i.type,
          COALESCE(s.full_name, i.subject_name),
          i.grand_total::text,
          ps.amount::text    AS amount,
          ps.payment_method,
          l.name,
          COALESCE(st.full_name, u.username),
          ps.label, ps.code, ps.settle_code,
          NULL::text, NULL::text
        FROM invoice_payment_schedule ps
        JOIN invoices i    ON ps.invoice_id = i.id
        LEFT JOIN locations l ON i.location_id = l.id
        LEFT JOIN users     u ON i.created_by  = u.id
        LEFT JOIN staff    st ON st.user_id     = i.created_by
        LEFT JOIN students  s ON i.student_id   = s.id
        WHERE ps.paid_at IS NOT NULL ${locSnippet}

        UNION ALL

        SELECT
          al.action                    AS ev_type,
          al.created_at                AS ev_time,
          al.invoice_id::text          AS invoice_id,
          al.invoice_code              AS invoice_code,
          al.invoice_type              AS invoice_type,
          al.subject_name              AS subject_name,
          al.grand_total::text         AS grand_total,
          al.grand_total::text         AS amount,
          NULL::text                   AS payment_method,
          l.name                       AS location_name,
          COALESCE(st.full_name, u.username) AS created_by_name,
          NULL::text                   AS schedule_label,
          NULL::text                   AS schedule_code,
          NULL::text                   AS settle_code,
          al.old_content::text         AS old_content_json,
          al.new_content::text         AS new_content_json
        FROM invoice_audit_logs al
        LEFT JOIN locations l  ON al.location_id = l.id
        LEFT JOIN users     u  ON al.user_id      = u.id
        LEFT JOIN staff    st  ON st.user_id       = al.user_id
        WHERE 1=1
          ${locSnippet.replace(/\bl\.id\b/g, "al.location_id")}
      `;

      const [countResult, dataResult] = await Promise.all([
        pool.query(`SELECT COUNT(*) AS cnt FROM (${baseUnion}) base ${dateFilter}`),
        pool.query(
          `SELECT * FROM (${baseUnion}) base ${dateFilter} ORDER BY ev_time DESC LIMIT $1 OFFSET $2`,
          [limit, offset]
        ),
      ]);

      res.json({
        events: dataResult.rows,
        total: parseInt(countResult.rows[0]?.cnt ?? "0"),
      });
    } catch (err: any) {
      console.error("[invoice-history]", err);
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

  // Shared core: create one invoice + all side effects (wallet, fee distribution, settle code).
  // Used by both single POST and bulk POST endpoints.
  async function createOneInvoiceWithSideEffects(
    payload: z.infer<typeof createInvoiceBodySchema>,
    userId: string | undefined,
  ): Promise<{ data: any; staffRecipientUserId: string | null }> {
    let validatedStudentId = payload.studentId ?? null;
    let resolvedSubjectName = payload.subjectName ?? null;
    let staffRecipientUserId: string | null = null;
    if (validatedStudentId) {
      const [studentCheck] = await db.select({ id: students.id }).from(students).where(eq(students.id, validatedStudentId)).limit(1);
      if (!studentCheck) {
        const [staffCheck] = await db.select({ fullName: staff.fullName, code: staff.code, userId: staff.userId }).from(staff).where(eq(staff.id, validatedStudentId)).limit(1);
        if (staffCheck) {
          if (!resolvedSubjectName) resolvedSubjectName = `[${staffCheck.code ?? ""}] ${staffCheck.fullName}`.trim();
          staffRecipientUserId = staffCheck.userId ?? null;
        }
        validatedStudentId = null;
      }
    }
    // Client currently sends studentId: null + a pre-formatted "[CODE] Full Name" subjectName
    // when the "Tên" field is a staff member (not a student). Fall back to resolving the
    // staff recipient from that code so the invoice still notifies the correct person.
    if (!staffRecipientUserId && !validatedStudentId && resolvedSubjectName) {
      const match = resolvedSubjectName.match(/^\[([^\]]+)\]/);
      if (match) {
        const [staffCheck] = await db.select({ userId: staff.userId }).from(staff).where(eq(staff.code, match[1])).limit(1);
        if (staffCheck?.userId) staffRecipientUserId = staffCheck.userId;
      }
    }

    const data = await storage.createInvoice({ ...payload, studentId: validatedStudentId, subjectName: resolvedSubjectName, createdBy: userId, updatedBy: userId });
    if (data.studentId && data.classId && data.category === "Học phí") {
      await distributeInvoiceFeeToSessions(data.id, data.studentId, data.classId);
    }
    // Auto-provision BIDV Virtual Account for student (fire-and-forget)
    if (data.studentId && data.locationId && data.type === "Thu") {
      ensureVirtualAccount(data.studentId, data.locationId).catch((err) =>
        console.warn("[BIDV] ensureVirtualAccount failed (non-critical):", err?.message),
      );
    }
    if (data.studentId && data.status === "paid" && data.type === "Thu") {
      const grandTotal = parseFloat(data.grandTotal ?? "0");
      const creationItems = payload.items ?? [];
      const hocPhiAmount = computeHocPhiWalletAmount(grandTotal, creationItems);
      const depositAmount = computeDepositWalletAmount(creationItems);
      const [creatorName, className] = await Promise.all([
        resolveCreatorName(userId),
        resolveClassName(data.classId),
      ]);
      if (hocPhiAmount > 0) {
        await createWalletEntry({
          studentId: data.studentId, invoiceId: data.id, type: "credit", amount: hocPhiAmount, category: "Học phí",
          action: walletActionFor("Học phí", "credit", data.code, "paid"),
          classId: data.classId, className, invoiceCode: data.code,
          invoiceDescription: data.note || data.description, createdBy: userId, createdByName: creatorName,
        });
      }
      if (depositAmount > 0) {
        await createWalletEntry({
          studentId: data.studentId, invoiceId: data.id, type: "credit", amount: depositAmount, category: "Đặt cọc",
          action: walletActionFor("Đặt cọc", "credit", data.code, "paid"),
          classId: data.classId, className, invoiceCode: data.code,
          invoiceDescription: data.note || data.description, createdBy: userId, createdByName: creatorName,
        });
      }
    }
    const deductionAmt = parseFloat(data.deduction ?? "0") || 0;
    if (data.studentId && deductionAmt > 0) {
      const creatorName = await resolveCreatorName(userId);
      const fmtAmt = deductionAmt.toLocaleString("vi-VN") + " đ";
      await createWalletEntry({
        studentId: data.studentId, invoiceId: data.id, type: "debit", amount: deductionAmt, category: "Đặt cọc",
        action: `Trừ tiền đặt cọc do thanh toán hoá đơn ${data.code ?? ""}: ${fmtAmt}`,
        classId: data.classId, invoiceCode: data.code,
        invoiceDescription: data.note || data.description, createdBy: userId, createdByName: creatorName,
      });
      const hocPhiSubtotal = (payload.items ?? []).reduce((sum: number, item: any) => {
        if (item.category === "Học phí") return sum + (parseFloat(item.subtotal) || 0);
        return sum;
      }, 0);
      const hocPhiDeduction = Math.min(deductionAmt, hocPhiSubtotal);
      if (hocPhiDeduction > 0) {
        const fmtHocPhi = hocPhiDeduction.toLocaleString("vi-VN") + " đ";
        await createWalletEntry({
          studentId: data.studentId, invoiceId: data.id, type: "credit", amount: hocPhiDeduction, category: "Học phí",
          action: `Chuyển tiền từ ví đặt cọc sang Ví học phí do thanh toán hoá đơn ${data.code ?? ""}, Tiền học phí: ${fmtHocPhi}`,
          classId: data.classId, invoiceCode: data.code,
          invoiceDescription: data.note || data.description, createdBy: userId, createdByName: creatorName,
        });
      }
    }
    if (data.status === "paid" && !(payload.paymentSchedule?.length ?? 0)) {
      const kode = await generateNextSettleCode(data.locationId);
      await db.update(invoices).set({ settleCode: kode }).where(eq(invoices.id, data.id));
      (data as any).settleCode = kode;
    }

    // Auto-create phiếu xuất kho for Kho items
    const khoItems = (payload.items ?? []).filter((item: any) => item.storeProductId && item.warehouseId);
    if (khoItems.length > 0) {
      try {
        const creatorName = await resolveCreatorName(userId);
        let recipientName: string | null = (data as any).subjectName ?? null;
        if (!recipientName && (data as any).studentId) {
          const [studentRow] = await db.select({ code: students.code, fullName: students.fullName })
            .from(students).where(eq(students.id, (data as any).studentId)).limit(1);
          if (studentRow) recipientName = `[${studentRow.code}] ${studentRow.fullName}`;
        }
        await createIssueReceiptsForInvoice({
          invoiceId: data.id,
          invoiceCode: data.code ?? "",
          locationId: data.locationId,
          userId: userId ?? null,
          userName: creatorName,
          recipientName,
          items: khoItems.map((item: any) => ({
            storeProductId: item.storeProductId!,
            storeProductCode: item.storeProductCode ?? item.packageName ?? "",
            productName: item.packageName ?? "",
            warehouseId: item.warehouseId!,
            quantity: typeof item.quantity === "number" ? item.quantity : parseInt(String(item.quantity)) || 1,
            salePrice: typeof item.unitPrice === "number" ? item.unitPrice : parseFloat(String(item.unitPrice)) || 0,
            unitId: item.unitId ?? null,
            unitName: item.unitName ?? null,
          })),
        });
      } catch (err: any) {
        console.error("[Invoice] Auto-create phiếu xuất kho failed:", err?.message);
        throw new Error(`Tạo phiếu thu thành công nhưng không tạo được phiếu xuất kho: ${err?.message}`);
      }
    }

    return { data, staffRecipientUserId };
  }

  app.post("/api/finance/invoices", async (req, res) => {
    try {
      const invPerms = await getInvoicePermissions(req);
      if (!invPerms.canCreate) return res.status(403).json({ message: "Bạn không có quyền tạo hoá đơn." });
      const rawCommissions: { staffId: string; percentage: number }[] = Array.isArray(req.body?.commissions) ? req.body.commissions : [];
      const parsed = createInvoiceBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.errors });
      }
      const userId = (req as any).user?.id;
      const { data, staffRecipientUserId } = await createOneInvoiceWithSideEffects(parsed.data, userId);
      if (rawCommissions.length > 0) {
        await saveInvoiceCommissions(data.id, rawCommissions);
      }
      (data as any).commissions = rawCommissions;
      res.status(201).json(data);

      sendInvoiceCreatedNotification(data.code, data.grandTotal, data.studentId, userId, data.id, staffRecipientUserId, data.note ?? data.description ?? null, data.status)
        .catch(err => console.error("[InvoiceNotify] POST error:", err));
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Bulk creation: accepts { invoices: [...] }, processes per-row with try/catch (partial mode).
  // Cap at 350 rows to match the dialog's hard cap.
  app.post("/api/finance/invoices/bulk", async (req, res) => {
    try {
      const invPerms = await getInvoicePermissions(req);
      if (!invPerms.canCreate) return res.status(403).json({ message: "Bạn không có quyền tạo hoá đơn." });
      const body = req.body ?? {};
      const list = Array.isArray(body.invoices) ? body.invoices : null;
      if (!list) return res.status(400).json({ message: "Body phải có field 'invoices' là mảng" });
      if (list.length === 0) return res.status(400).json({ message: "Mảng rỗng" });
      if (list.length > 350) return res.status(400).json({ message: `Tối đa 350 hoá đơn/lần (đang có ${list.length})` });

      const userId = (req as any).user?.id;
      const results: Array<{ index: number; ok: boolean; id?: string; code?: string; error?: string }> = [];
      const notifyJobs: Array<() => Promise<void>> = [];

      for (let i = 0; i < list.length; i++) {
        const row = list[i];
        const parsed = createInvoiceBodySchema.safeParse(row);
        if (!parsed.success) {
          const firstErr = parsed.error.errors[0];
          results.push({
            index: i,
            ok: false,
            error: firstErr ? `${firstErr.path.join(".") || "?"}: ${firstErr.message}` : "Dữ liệu không hợp lệ",
          });
          continue;
        }
        try {
          const { data, staffRecipientUserId } = await createOneInvoiceWithSideEffects(parsed.data, userId);
          results.push({ index: i, ok: true, id: data.id, code: data.code });
          notifyJobs.push(() =>
            sendInvoiceCreatedNotification(data.code, data.grandTotal, data.studentId, userId, data.id, staffRecipientUserId, data.note ?? data.description ?? null, data.status)
              .catch(err => console.error("[InvoiceNotify] BULK error:", err))
          );
        } catch (err: any) {
          results.push({ index: i, ok: false, error: err?.message ?? "Lỗi không xác định" });
        }
      }

      const summary = {
        total: results.length,
        ok: results.filter(r => r.ok).length,
        failed: results.filter(r => !r.ok).length,
      };
      res.status(200).json({ results, summary });

      // Fire notifications after responding so client doesn't wait.
      Promise.allSettled(notifyJobs.map(j => j())).catch(() => {});
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/finance/invoices/:id", async (req, res) => {
    try {
      const invPerms = await getInvoicePermissions(req);
      if (!invPerms.canEdit) {
        return res.status(403).json({ message: "Bạn không có quyền sửa hoá đơn." });
      }
      const rawCommissions: { staffId: string; percentage: number }[] | null = Array.isArray(req.body?.commissions) ? req.body.commissions : null;
      const parsed = updateInvoiceBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.errors });
      }
      const userId = (req as any).user?.id;
      const before = await storage.getInvoice(req.params.id);
      const dateOnly = (value: unknown): string | null => {
        if (!value) return null;
        const date = value instanceof Date ? value : new Date(value as string);
        return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
      };
      const effectiveCreatedAt = dateOnly(parsed.data.createdAt ?? before?.createdAt);
      const effectivePaidAt = dateOnly(parsed.data.paidAt !== undefined ? parsed.data.paidAt : before?.paidAt);
      if (effectiveCreatedAt && effectivePaidAt && effectivePaidAt < effectiveCreatedAt) {
        return res.status(400).json({ message: "Ngày thanh toán không được trước ngày tạo." });
      }

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

      if (patchData.status === "paid" && before?.status !== "paid") {
        if (userId) patchData.paidBy = userId;
        patchData.paidAt = new Date();
      } else if (patchData.status && patchData.status !== "paid" && before?.status === "paid") {
        patchData.paidBy = null;
        patchData.paidAt = null;
      }

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
          const kode = await generateNextSettleCode(data.locationId);
          await db.update(invoices).set({ settleCode: kode }).where(eq(invoices.id, data.id));
          (data as any).settleCode = kode;
          // Send paid notification when invoice fully paid via direct PATCH
          const recipientIds = await resolveInvoiceRecipientUserIds(data);
          sendInvoicePaidNotification(data.code, data.grandTotal, recipientIds, data.id, null, data.studentId, data.note ?? data.description ?? null).catch(() => {});
        } else if (!hasSchedules && prevPaid && !nowPaid && before?.settleCode) {
          await db.update(invoices).set({ settleCode: null }).where(eq(invoices.id, data.id));
          (data as any).settleCode = null;
        }
      }

      // Send notification whenever paidAmount increases (partial or full via schedules)
      // Skip only when already handled above: full-paid transition without schedules
      {
        const prevAmountPaid = parseFloat(String(before?.paidAmount ?? "0")) || 0;
        const newAmountPaid = parseFloat(String(data.paidAmount ?? "0")) || 0;
        const hasSchedulesNow = (data.paymentSchedule ?? []).length > 0;
        const isNoScheduleFullPaid = !hasSchedulesNow && data.status === "paid" && before?.status !== "paid";
        if (!isNoScheduleFullPaid && newAmountPaid > prevAmountPaid && newAmountPaid > 0) {
          const paymentDelta = newAmountPaid - prevAmountPaid;
          const recipientIds = await resolveInvoiceRecipientUserIds(data);
          sendInvoicePaidNotification(data.code, paymentDelta, recipientIds, data.id, null, data.studentId, data.note ?? data.description ?? null).catch(() => {});
        }
      }

      if (rawCommissions !== null) {
        await saveInvoiceCommissions(req.params.id, rawCommissions);
        (data as any).commissions = rawCommissions;
      }

      // ── Audit log ───────────────────────────────────────────────────────────
      // Skip logging when this PATCH is purely the "mark paid" transition — that
      // event is already captured in the history timeline via invoices.paid_at.
      const isStatusToPaid = parsed.data.status === "paid" && before?.status !== "paid";
      if (!isStatusToPaid) {
        const isUnpayTransition = parsed.data.status && parsed.data.status !== "paid" && before?.status === "paid";
        const auditAction = isUnpayTransition ? "Huỷ thanh toán hoá đơn" : "Sửa hoá đơn";
        // Build field-level diff — only store fields that actually changed
        const AUDIT_COMPARE_FIELDS = [
          "type", "subjectName", "category", "status",
          "grandTotal", "paidAmount", "remainingAmount",
          "paymentMethod", "dueDate", "note", "description",
          "locationId", "classId", "createdAt", "paidAt",
        ];
        const oldSnap: Record<string, any> = {};
        const newSnap: Record<string, any> = {};
        for (const field of AUDIT_COMPARE_FIELDS) {
          const bv = before?.[field] != null ? String(before[field]) : "";
          const dv = (data as any)[field] != null ? String((data as any)[field]) : "";
          if (bv !== dv) {
            if (field === "locationId") {
              oldSnap.locationId = before?.[field] ?? null;
              oldSnap.locationName = (before as any)?.locationName ?? null;
              newSnap.locationId = (data as any)[field] ?? null;
              // locationName for new value may not be available — leave for display to resolve
            } else if (field === "classId") {
              oldSnap.classId = before?.[field] ?? null;
              oldSnap.className = (before as any)?.className ?? null;
              newSnap.classId = (data as any)[field] ?? null;
            } else {
              oldSnap[field] = before?.[field] ?? null;
              newSnap[field] = (data as any)[field] ?? null;
            }
          }
        }
        createInvoiceAuditLog({
          invoiceId:   data.id,
          invoiceCode: data.code ?? null,
          invoiceType: data.type ?? null,
          subjectName: (data as any).subjectName ?? (before as any)?.subjectName ?? null,
          grandTotal:  data.grandTotal ?? null,
          action:      auditAction,
          userId:      userId ?? null,
          locationId:  (data as any).locationId ?? (before as any)?.locationId ?? null,
          oldContent:  Object.keys(oldSnap).length ? oldSnap : before ? { status: before.status, grandTotal: before.grandTotal } : null,
          newContent:  Object.keys(newSnap).length ? newSnap : { status: data.status, grandTotal: data.grandTotal },
        }).catch(() => {});
      }

      res.json(data);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Returns linked phiếu xuất kho for an invoice (used by delete dialog warning)
  app.get("/api/finance/invoices/:id/linked-store-receipts", async (req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT id, code, status FROM store_issue_receipts
        WHERE invoice_id = ${req.params.id}
        ORDER BY created_at ASC
      `);
      res.json(rows.rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/finance/invoices/:id", async (req, res) => {
    try {
      const invPerms = await getInvoicePermissions(req);
      if (!invPerms.canDelete) return res.status(403).json({ message: "Bạn không có quyền xóa hoá đơn." });
      const inv = await storage.getInvoice(req.params.id);
      if (!inv) return res.status(404).json({ message: "Không tìm thấy hoá đơn" });

      if (inv.status === "paid" || inv.status === "partial") {
        const statusLabel = inv.status === "paid" ? "Đã thanh toán" : "Thanh toán một phần";
        return res.status(409).json({
          message: `Hoá đơn ${inv.code} đang ở trạng thái ${statusLabel}. Vui lòng chuyển về Chưa thanh toán trước khi xoá.`,
          invoiceStatus: inv.status,
        });
      }

      // Cancel linked phiếu xuất kho (restores inventory)
      const linkedRows = await db.execute(sql`
        SELECT id, code FROM store_issue_receipts
        WHERE invoice_id = ${req.params.id} AND status != 'cancelled'
      `);
      const userId = (req as any).user?.id ?? null;
      const userName = (req as any).user?.fullName ?? (req as any).user?.username ?? null;
      for (const row of linkedRows.rows as any[]) {
        await cancelIssueReceiptForInvoice(row.id, userId, userName);
      }

      await storage.deleteInvoice(req.params.id);

      // ── Audit log ───────────────────────────────────────────────────────────
      createInvoiceAuditLog({
        invoiceId:   inv.id,
        invoiceCode: inv.code ?? null,
        invoiceType: inv.type ?? null,
        subjectName: (inv as any).subjectName ?? null,
        grandTotal:  inv.grandTotal ?? null,
        action:      "Xoá hoá đơn",
        userId:      userId ?? null,
        locationId:  inv.locationId ?? null,
        oldContent:  { status: inv.status, grandTotal: inv.grandTotal },
        newContent:  null,
      }).catch(() => {});

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
          let parentLocId: string | null = null;
          if (scheduleBefore.invoiceId) {
            const [pinv] = await db.select({ locationId: invoices.locationId }).from(invoices).where(eq(invoices.id, scheduleBefore.invoiceId)).limit(1);
            parentLocId = pinv?.locationId ?? null;
          }
          const kode = await generateNextSettleCode(parentLocId);
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
                invoice.studentId,
                invoice.note ?? invoice.description ?? null,
              );
            }
          }
        } else if (prevPaid && !nowPaid && scheduleBefore.settleCode) {
          await db.update(invoicePaymentSchedule).set({ settleCode: null }).where(eq(invoicePaymentSchedule.id, req.params.id));
          (updated as any).settleCode = null;
        }

        // Sync invoice-level paidBy/paidAt based on schedule completion
        if (scheduleBefore.invoiceId) {
          const allSchedules = await db
            .select({ id: invoicePaymentSchedule.id, status: invoicePaymentSchedule.status })
            .from(invoicePaymentSchedule)
            .where(eq(invoicePaymentSchedule.invoiceId, scheduleBefore.invoiceId));

          const allPaid = allSchedules.length > 0 && allSchedules.every(s =>
            s.id === req.params.id ? status === "paid" : s.status === "paid"
          );

          if (allPaid && userId) {
            await db.update(invoices)
              .set({ paidBy: userId, paidAt: new Date() })
              .where(eq(invoices.id, scheduleBefore.invoiceId));
          } else if (!allPaid) {
            await db.update(invoices)
              .set({ paidBy: null, paidAt: null })
              .where(eq(invoices.id, scheduleBefore.invoiceId));
          }
        }
      }

      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // ── BULK COLLECT (Gộp phiếu thu/chi) ──────────────────────────────────────
  app.post("/api/finance/invoices/bulk-collect", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const userId = (req as any).user?.id;
      const { ids, scheduleIds, paymentDate, paymentMethod, collectorName, note } = req.body ?? {};

      const invoiceIds: string[] = Array.isArray(ids) ? ids : [];
      const schedIds: string[] = Array.isArray(scheduleIds) ? scheduleIds : [];

      if (invoiceIds.length === 0 && schedIds.length === 0) {
        return res.status(400).json({ message: "Vui lòng chọn ít nhất một hoá đơn" });
      }

      const results: { id: string; ok: boolean; code?: string; error?: string }[] = [];

      for (const id of invoiceIds) {
        try {
          const before = await storage.getInvoice(id);
          if (!before) { results.push({ id, ok: false, error: "Không tìm thấy hoá đơn" }); continue; }
          if (before.status === "paid") { results.push({ id, ok: true, code: before.code ?? undefined }); continue; }

          const grandTotal = parseFloat(before.grandTotal ?? "0");
          const paidAt = paymentDate ? new Date(paymentDate) : new Date();

          // Update invoice to paid
          await db.update(invoices).set({
            status: "paid",
            paidAmount: grandTotal.toFixed(2),
            remainingAmount: "0",
            paidBy: userId ?? null,
            paidAt,
            paymentMethod: paymentMethod ?? null,
            note: note ? (before.note ? before.note + " | " + note : note) : before.note,
            updatedAt: new Date(),
          }).where(eq(invoices.id, id));

          // Mark all payment schedules as paid
          const schedules = await db.select().from(invoicePaymentSchedule).where(eq(invoicePaymentSchedule.invoiceId, id));
          for (const s of schedules) {
            if (s.status !== "paid") {
              await db.update(invoicePaymentSchedule).set({
                status: "paid",
                paidAt,
                paymentMethod: paymentMethod ?? null,
              } as any).where(eq(invoicePaymentSchedule.id, s.id));
            }
          }

          // Wallet credit logic for Thu invoices with studentId (no schedules)
          if (before.studentId && before.type === "Thu") {
            const hasSchedules = schedules.length > 0;
            if (!hasSchedules) {
              const items = before.items ?? [];
              const hocPhiAmt = computeHocPhiWalletAmount(grandTotal, items);
              const depositAmt = computeDepositWalletAmount(items);
              const [creatorName, className] = await Promise.all([
                resolveCreatorName(userId),
                resolveClassName(before.classId),
              ]);
              for (const [cat, amt] of [["Học phí", hocPhiAmt], ["Đặt cọc", depositAmt]] as [string, number][]) {
                if (amt <= 0) continue;
                const existingNet = await getNetWalletAmountByInvoiceAndCategory(before.id, cat);
                const toCredit = Math.max(0, amt - existingNet);
                if (toCredit > 0) {
                  await createWalletEntry({
                    studentId: before.studentId,
                    invoiceId: before.id,
                    type: "credit",
                    amount: toCredit,
                    category: cat,
                    action: `Thu ${cat} - Gộp phiếu`,
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
          }

          // Generate settle code
          const kode = await generateNextSettleCode(before.locationId);
          await db.update(invoices).set({ settleCode: kode }).where(eq(invoices.id, id));

          results.push({ id, ok: true, code: before.code ?? undefined });
        } catch (err: any) {
          results.push({ id, ok: false, error: err?.message ?? "Lỗi không xác định" });
        }
      }

      // ── Process individual payment schedule installments (đợt) ──────────────
      for (const schedId of schedIds) {
        try {
          const [scheduleBefore] = await db
            .select()
            .from(invoicePaymentSchedule)
            .where(eq(invoicePaymentSchedule.id, schedId))
            .limit(1);

          if (!scheduleBefore) {
            results.push({ id: schedId, ok: false, error: "Không tìm thấy đợt thanh toán" });
            continue;
          }
          if (scheduleBefore.status === "paid") {
            results.push({ id: schedId, ok: true, code: scheduleBefore.code ?? undefined });
            continue;
          }

          const paidAt = paymentDate ? new Date(paymentDate) : new Date();

          await db.update(invoicePaymentSchedule).set({
            status: "paid",
            paidAt,
            paymentMethod: paymentMethod ?? null,
          } as any).where(eq(invoicePaymentSchedule.id, schedId));

          // Assign settle code
          let schedLocId: string | null = null;
          if (scheduleBefore.invoiceId) {
            const [pinv] = await db.select({ locationId: invoices.locationId }).from(invoices).where(eq(invoices.id, scheduleBefore.invoiceId)).limit(1);
            schedLocId = pinv?.locationId ?? null;
          }
          const schedKode = await generateNextSettleCode(schedLocId);
          await db.update(invoicePaymentSchedule)
            .set({ settleCode: schedKode } as any)
            .where(eq(invoicePaymentSchedule.id, schedId));

          // Wallet credit if applicable
          if (scheduleBefore.invoiceId) {
            const invoice = await storage.getInvoice(scheduleBefore.invoiceId);
            if (invoice && invoice.studentId && invoice.type === "Thu") {
              const grandTotal = parseFloat(invoice.grandTotal ?? "0");
              const invoiceItems = invoice.items ?? [];
              const totalHocPhi = computeHocPhiWalletAmount(grandTotal, invoiceItems);
              const totalDeposit = computeDepositWalletAmount(invoiceItems);
              const grandWalletTotal = totalHocPhi + totalDeposit;

              if (grandWalletTotal > 0) {
                const allSchedules = await db
                  .select()
                  .from(invoicePaymentSchedule)
                  .where(eq(invoicePaymentSchedule.invoiceId, scheduleBefore.invoiceId))
                  .orderBy(asc(invoicePaymentSchedule.sortOrder));
                const otherPaidSchedules = allSchedules.filter(
                  (s) => s.id !== schedId && s.status === "paid"
                );
                const alreadyPaidFromOthers = otherPaidSchedules.reduce(
                  (sum, s) => sum + (parseFloat(s.amount ?? "0") || 0),
                  0
                );
                const scheduleAmt = parseFloat(scheduleBefore.amount ?? "0") || 0;
                const scheduleLabel = scheduleBefore.label ?? scheduleBefore.code ?? schedId;
                const [creatorName, className] = await Promise.all([
                  resolveCreatorName(userId),
                  resolveClassName(invoice.classId),
                ]);

                for (const [cat, catTotal] of [["Học phí", totalHocPhi], ["Đặt cọc", totalDeposit]] as [string, number][]) {
                  if (catTotal <= 0) continue;
                  const remaining = Math.max(0, catTotal - alreadyPaidFromOthers);
                  const thisAmt = Math.min(scheduleAmt, remaining);
                  if (thisAmt > 0) {
                    await createWalletEntry({
                      studentId: invoice.studentId,
                      invoiceId: invoice.id,
                      type: "credit",
                      amount: thisAmt,
                      category: cat,
                      action: `Cộng tiền vào tài khoản ${cat === "Học phí" ? "học phí" : "đặt cọc"} do thanh toán ${scheduleLabel} (hoá đơn ${invoice.code ?? ""}) - Gộp phiếu`,
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

          results.push({ id: schedId, ok: true, code: scheduleBefore.code ?? undefined });
        } catch (err: any) {
          results.push({ id: schedId, ok: false, error: err?.message ?? "Lỗi không xác định" });
        }
      }

      const ok = results.filter(r => r.ok).length;
      const failed = results.filter(r => !r.ok).length;
      res.json({ results, summary: { total: results.length, ok, failed } });
    } catch (err: any) {
      res.status(500).json({ message: err?.message ?? "Lỗi server" });
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
      const updated = await storage.updateInvoiceStatus(req.params.id, status, userId);

      if (before && before.studentId && before.type === "Thu") {
        const prevPaid = before.status === "paid";
        const nowPaid = status === "paid";
        const hasSchedules = (before.paymentSchedule ?? []).length > 0;
        if (prevPaid !== nowPaid) {
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
            if (hasSchedules) {
              // Invoice has schedules: only create wallet entry if no entry exists yet
              // (admin directly marking paid, bypassing per-schedule flow)
              const existingNet = await getNetWalletAmountByInvoiceAndCategory(before.id, cat);
              if (nowPaid && existingNet >= amt) continue; // already credited
              if (!nowPaid && existingNet <= 0) continue;  // nothing to debit
            }
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
          const kode = await generateNextSettleCode(before.locationId);
          await db.update(invoices).set({ settleCode: kode }).where(eq(invoices.id, before.id));

          // Send paid notification for main invoice
          const recipientIds = await resolveInvoiceRecipientUserIds(before);
          await sendInvoicePaidNotification(
            before.code,
            before.grandTotal,
            recipientIds,
            before.id,
            null,
            before.studentId,
            before.note ?? before.description ?? null,
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

      const recipientIds = await resolveInvoiceRecipientUserIds(result);
      sendInvoicePaidNotification(
        result.code,
        amountPaid,
        recipientIds,
        result.id,
        null,
        result.studentId,
        result.note ?? result.description ?? null,
      ).catch(err => console.error("[InvoiceNotify] append-salary-payment error:", err));
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
      const scheduleCount = req.query.scheduleCount != null ? Number(req.query.scheduleCount) : null;
      const template = await storage.getDefaultInvoicePrintTemplate(req.params.invoiceType, isNaN(scheduleCount as number) ? null : scheduleCount);
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
        scope: z.string().default("general"),
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
        scope: z.string().optional(),
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

  // GET /api/finance/class-revenue-report
  // Returns invoice totals grouped by class.
  // Date range filters on class session dates (sessionDate) — shows all classes that
  // have at least one session in the selected period (including those with no invoices).
  // Invoice sums cover ALL invoices for the class, not limited to the date range.
  app.get("/api/finance/class-revenue-report", async (req, res) => {
    try {
      const {
        search,
        dateFrom,
        dateTo,
        locationId,
        page = "1",
        limit = "1000",
      } = req.query as Record<string, string>;

      // Build parameterized query using the pg pool directly
      const params: string[] = [];
      const sessionWhereParts: string[] = [];
      if (dateFrom) { params.push(dateFrom); sessionWhereParts.push(`cs_filter.session_date >= $${params.length}`); }
      if (dateTo)   { params.push(dateTo);   sessionWhereParts.push(`cs_filter.session_date <= $${params.length}`); }
      const sessionWhere = sessionWhereParts.length ? `WHERE ${sessionWhereParts.join(" AND ")}` : "";

      const queryText = `
        SELECT
          c.id           AS class_id,
          c.name         AS class_name,
          c.location_id,
          COALESCE(SUM(CASE WHEN i.status <> 'cancelled' THEN i.grand_total::numeric     ELSE 0 END), 0) AS grand_total,
          COALESCE(SUM(CASE WHEN i.status <> 'cancelled' THEN i.paid_amount::numeric     ELSE 0 END), 0) AS paid_amount,
          COALESCE(SUM(CASE WHEN i.status <> 'cancelled' THEN i.remaining_amount::numeric ELSE 0 END), 0) AS remaining_amount,
          COALESCE(SUM(CASE WHEN i.status  = 'cancelled' THEN i.grand_total::numeric     ELSE 0 END), 0) AS cancelled_amount
        FROM classes c
        INNER JOIN (
          SELECT DISTINCT cs_filter.class_id
          FROM class_sessions cs_filter
          ${sessionWhere}
        ) active_classes ON active_classes.class_id = c.id
        LEFT JOIN invoices i ON i.class_id = c.id
        GROUP BY c.id, c.name, c.location_id
        ORDER BY c.name ASC
      `;

      const result = await pool.query(queryText, params);
      const rows: any[] = result.rows;

      // Apply search and location filters in JS
      let filtered = rows;
      if (search && search.trim()) {
        const q = search.toLowerCase();
        filtered = filtered.filter((r: any) => (r.class_name ?? "").toLowerCase().includes(q));
      }
      if (locationId && locationId !== "all") {
        filtered = filtered.filter((r: any) => r.location_id === locationId);
      }

      const total    = filtered.length;
      const pageNum  = Math.max(1, parseInt(page,  10));
      const limitNum = Math.max(1, parseInt(limit, 10));
      const paged    = filtered.slice((pageNum - 1) * limitNum, pageNum * limitNum);

      res.json({
        data: paged.map((r: any) => ({
          classId:         r.class_id,
          className:       r.class_name ?? "(Không tên)",
          grandTotal:      parseFloat(r.grand_total)      || 0,
          paidAmount:      parseFloat(r.paid_amount)      || 0,
          remainingAmount: parseFloat(r.remaining_amount) || 0,
          cancelledAmount: parseFloat(r.cancelled_amount) || 0,
        })),
        total,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TUITION ALLOCATION REPORT (Phân bổ học phí)
  // Per-student, per-month breakdown of actual tuition from deducts_fee sessions
  // ─────────────────────────────────────────────────────────────────────────
  app.get("/api/finance/phan-bo-hoc-phi", async (req, res) => {
    try {
      const {
        search,
        locationId,
        dateFrom,
        dateTo,
        page  = "1",
        limit = "1000",
      } = req.query as Record<string, string>;

      // Build parameterized WHERE clause
      const params: any[] = [];
      const whereParts: string[] = [
        "ss.status IN ('scheduled','attended')",
        "afr.deducts_fee = true",
      ];
      if (dateFrom) { params.push(dateFrom); whereParts.push(`cs.session_date >= $${params.length}`); }
      if (dateTo)   { params.push(dateTo);   whereParts.push(`cs.session_date <= $${params.length}`); }
      if (locationId) { params.push(locationId); whereParts.push(`sl.location_id = $${params.length}`); }
      const whereClause = whereParts.join(" AND ");

      const mainQuery = `
        SELECT
          s.id                 AS student_id,
          COALESCE(l.name, 'Không xác định') AS location_name,
          sl.location_id,
          s.code               AS student_code,
          s.full_name,
          s.relationship,
          s.phone,
          s.email,
          s.teacher_ids,
          s.sales_by_ids,
          LEFT(cs.session_date::text, 7) AS ym,
          COALESCE(SUM(ss.session_price::numeric), 0) AS tuition,
          COALESCE(SUM(
            CASE WHEN isa.id IS NOT NULL AND COALESCE(inv_cnt.cnt, 0) > 0
              THEN i.total_promotion::numeric / inv_cnt.cnt
              ELSE 0
            END
          ), 0) AS promotion
        FROM student_sessions ss
        JOIN students s ON s.id = ss.student_id
        JOIN class_sessions cs ON cs.id = ss.class_session_id
        JOIN attendance_fee_rules afr
          ON afr.attendance_status = ss.attendance_status AND afr.deducts_fee = true
        LEFT JOIN (
          SELECT DISTINCT ON (student_id) student_id, location_id
          FROM student_locations ORDER BY student_id, created_at ASC
        ) sl ON sl.student_id = s.id
        LEFT JOIN locations l ON l.id = sl.location_id
        LEFT JOIN invoice_session_allocations isa ON isa.student_session_id = ss.id
        LEFT JOIN invoices i ON i.id = isa.invoice_id
        LEFT JOIN (
          SELECT invoice_id, COUNT(*)::numeric AS cnt
          FROM invoice_session_allocations GROUP BY invoice_id
        ) inv_cnt ON inv_cnt.invoice_id = isa.invoice_id
        WHERE ${whereClause}
        GROUP BY s.id, l.name, sl.location_id, s.code, s.full_name,
                 s.relationship, s.phone, s.email, s.teacher_ids, s.sales_by_ids, ym
        ORDER BY s.full_name, ym
      `;

      const [mainResult, staffResult] = await Promise.all([
        pool.query(mainQuery, params),
        pool.query("SELECT id, full_name FROM staff"),
      ]);

      // Build staff id → name map
      const staffMap: Record<string, string> = {};
      for (const s of staffResult.rows) {
        staffMap[s.id] = s.full_name ?? "";
      }

      // Group rows by student
      const studentMap: Record<string, any> = {};
      const monthSet = new Set<string>();

      for (const r of mainResult.rows) {
        const ym: string = r.ym;
        monthSet.add(ym);

        if (!studentMap[r.student_id]) {
          const teacherNames = ((r.teacher_ids as string[]) || [])
            .map((id) => staffMap[id] || "").filter(Boolean);
          const salesNames = ((r.sales_by_ids as string[]) || [])
            .map((id) => staffMap[id] || "").filter(Boolean);

          studentMap[r.student_id] = {
            studentId:    r.student_id,
            locationName: r.location_name  ?? "—",
            locationId:   r.location_id    ?? null,
            studentCode:  r.student_code   ?? "",
            studentName:  r.full_name      ?? "",
            relationship: r.relationship   ?? "",
            phone:        r.phone          ?? "",
            email:        r.email          ?? "",
            teachers:     teacherNames,
            salesStaff:   salesNames,
            months:       {} as Record<string, { tuition: number; promotion: number }>,
            totalTuition: 0,
            totalPromotion: 0,
          };
        }

        const tuition   = parseFloat(r.tuition)   || 0;
        const promotion = parseFloat(r.promotion)  || 0;
        studentMap[r.student_id].months[ym] = { tuition, promotion };
        studentMap[r.student_id].totalTuition   += tuition;
        studentMap[r.student_id].totalPromotion += promotion;
      }

      let rows: any[] = Object.values(studentMap);

      // Apply search filter in JS (after grouping)
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        rows = rows.filter(r =>
          r.studentName.toLowerCase().includes(q) ||
          r.studentCode.toLowerCase().includes(q),
        );
      }

      const months  = Array.from(monthSet).sort();
      const total   = rows.length;
      const pageNum = Math.max(1, parseInt(page)  || 1);
      const limitNum= Math.min(1000, Math.max(1, parseInt(limit) || 1000));
      const paged   = rows.slice((pageNum - 1) * limitNum, pageNum * limitNum);

      res.json({ data: paged, months, total });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // STAFF REVENUE REPORT
  // Revenue = invoice.grandTotal * commission.percentage / 100 per staff member
  // Date range filters on invoice.created_at
  // ─────────────────────────────────────────────────────────────────────────
  app.get("/api/finance/staff-revenue-report", async (req, res) => {
    try {
      const {
        search,
        dateFrom,
        dateTo,
        page = "1",
        limit = "1000",
      } = req.query as Record<string, string>;

      // Build date WHERE clause for invoices
      const params: any[] = [];
      const dateWhereParts: string[] = [];
      if (dateFrom) { params.push(dateFrom); dateWhereParts.push(`i.created_at::date >= $${params.length}`); }
      if (dateTo)   { params.push(dateTo);   dateWhereParts.push(`i.created_at::date <= $${params.length}`); }
      const dateWhere = dateWhereParts.length ? `AND ${dateWhereParts.join(" AND ")}` : "";

      // Main aggregation query: one row per staff member
      const mainQuery = `
        SELECT
          s.id          AS staff_id,
          s.full_name   AS staff_name,
          s.code        AS staff_code,
          COUNT(DISTINCT ic.invoice_id) AS invoice_count,
          COALESCE(SUM(CASE WHEN i.status <> 'cancelled'
            THEN i.grand_total::numeric * ic.percentage::numeric / 100 ELSE 0 END), 0) AS expected_revenue,
          COALESCE(SUM(CASE WHEN i.status <> 'cancelled'
            THEN i.paid_amount::numeric * ic.percentage::numeric / 100 ELSE 0 END), 0) AS actual_revenue,
          COALESCE(SUM(CASE WHEN i.status <> 'cancelled'
            THEN i.remaining_amount::numeric * ic.percentage::numeric / 100 ELSE 0 END), 0) AS remaining_revenue,
          COALESCE(SUM(CASE WHEN i.status = 'cancelled'
            THEN i.grand_total::numeric * ic.percentage::numeric / 100 ELSE 0 END), 0) AS cancelled_revenue
        FROM invoice_commissions ic
        JOIN invoices i ON i.id = ic.invoice_id ${dateWhere}
        JOIN staff s ON s.id = ic.staff_id
        GROUP BY s.id, s.full_name, s.code
        ORDER BY s.full_name ASC
      `;

      // Customer source counts per staff
      const sourceQuery = `
        SELECT
          ic.staff_id,
          cs.name   AS source_name,
          COUNT(DISTINCT i.student_id) AS student_count
        FROM invoice_commissions ic
        JOIN invoices i ON i.id = ic.invoice_id AND i.status <> 'cancelled' ${dateWhere}
        JOIN students st ON st.id = i.student_id
        JOIN crm_customer_sources cs ON cs.id = ANY(st.customer_source_ids)
        GROUP BY ic.staff_id, cs.name
        ORDER BY ic.staff_id, student_count DESC
      `;

      const [mainResult, sourceResult] = await Promise.all([
        pool.query(mainQuery, params),
        pool.query(sourceQuery, params),
      ]);

      // Build a map: staffId → [{name, count}]
      const sourceMap: Record<string, { name: string; count: number }[]> = {};
      for (const row of sourceResult.rows) {
        if (!sourceMap[row.staff_id]) sourceMap[row.staff_id] = [];
        sourceMap[row.staff_id].push({ name: row.source_name, count: parseInt(row.student_count) || 0 });
      }

      // Compose final rows
      let rows = mainResult.rows.map((r) => {
        const srcList = sourceMap[r.staff_id] ?? [];
        const totalStudents = srcList.reduce((s, x) => s + x.count, 0);
        return {
          staffId:         r.staff_id,
          staffName:       r.staff_name ?? "(Không tên)",
          staffCode:       r.staff_code ?? "",
          invoiceCount:    parseInt(r.invoice_count) || 0,
          expectedRevenue: parseFloat(r.expected_revenue) || 0,
          actualRevenue:   parseFloat(r.actual_revenue)   || 0,
          remainingRevenue:parseFloat(r.remaining_revenue)|| 0,
          cancelledRevenue:parseFloat(r.cancelled_revenue)|| 0,
          sources: srcList.map((s) => ({
            name:  s.name,
            count: s.count,
            pct:   totalStudents > 0 ? Math.round((s.count / totalStudents) * 100) : 0,
          })),
        };
      });

      // Apply search filter
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        rows = rows.filter(r =>
          r.staffName.toLowerCase().includes(q) ||
          r.staffCode.toLowerCase().includes(q),
        );
      }

      const total = rows.length;
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(1000, Math.max(1, parseInt(limit) || 1000));
      const paged = rows.slice((pageNum - 1) * limitNum, pageNum * limitNum);

      res.json({ data: paged, total });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEACHING TIME REPORT (Báo cáo Thời gian giảng dạy)
  // Groups class sessions by teacher → class with planned vs actual hours.
  // "Actual" = sessions where at least 1 student has been marked (attendanceStatus != 'pending')
  // ─────────────────────────────────────────────────────────────────────────
  app.get("/api/reports/teaching-time", async (req, res) => {
    try {
      const {
        dateFrom,
        dateTo,
        teacherId,
        locationId,
        search,
        limit = "2000",
        page = "1",
      } = req.query as Record<string, string>;

      const params: any[] = [];
      const whereParts: string[] = ["cs.status <> 'cancelled'"];

      if (dateFrom) { params.push(dateFrom); whereParts.push(`cs.session_date >= $${params.length}`); }
      if (dateTo)   { params.push(dateTo);   whereParts.push(`cs.session_date <= $${params.length}`); }

      const whereClause = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

      const queryText = `
        SELECT
          sf.id                                          AS teacher_id,
          sf.full_name                                   AS teacher_name,
          sf.code                                        AS teacher_code,
          c.id                                           AS class_id,
          c.name                                         AS class_name,
          c.class_code,
          c.location_id,
          COALESCE(cp.name, co.name, '')                 AS program_name,
          COUNT(DISTINCT cs.id)::int                     AS session_count,
          COALESCE(SUM(
            GREATEST(0, EXTRACT(EPOCH FROM (st.end_time::time - st.start_time::time)) / 60)
          ), 0)::int                                     AS total_minutes,
          COALESCE(SUM(
            CASE WHEN EXISTS (
              SELECT 1 FROM student_sessions ss
              WHERE ss.class_session_id = cs.id
                AND ss.attendance_status <> 'pending'
            ) THEN GREATEST(0, EXTRACT(EPOCH FROM (st.end_time::time - st.start_time::time)) / 60)
            ELSE 0 END
          ), 0)::int                                     AS actual_minutes
        FROM class_sessions cs
        JOIN shift_templates st ON st.id = cs.shift_template_id
        JOIN classes c ON c.id = cs.class_id
        JOIN staff sf ON sf.id = ANY(cs.teacher_ids)
        LEFT JOIN course_programs cp ON cp.id = c.program_id
        LEFT JOIN courses co ON co.id = c.course_id
        ${whereClause}
        GROUP BY sf.id, sf.full_name, sf.code, c.id, c.name, c.class_code, c.location_id, cp.name, co.name
        ORDER BY sf.full_name, c.name
      `;

      const result = await pool.query(queryText, params);
      let rows: any[] = result.rows;

      if (teacherId && teacherId !== "all") {
        rows = rows.filter((r: any) => r.teacher_id === teacherId);
      }
      if (locationId && locationId !== "all") {
        rows = rows.filter((r: any) => r.location_id === locationId);
      }
      if (search && search.trim()) {
        const q = search.toLowerCase();
        rows = rows.filter((r: any) =>
          (r.teacher_name ?? "").toLowerCase().includes(q) ||
          (r.class_name ?? "").toLowerCase().includes(q) ||
          (r.class_code ?? "").toLowerCase().includes(q),
        );
      }

      const total    = rows.length;
      const pageNum  = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(2000, Math.max(1, parseInt(limit, 10) || 2000));
      const paged    = rows.slice((pageNum - 1) * limitNum, pageNum * limitNum);

      res.json({
        data: paged.map((r: any) => ({
          teacherId:      r.teacher_id,
          teacherName:    r.teacher_name ?? "(Không tên)",
          teacherCode:    r.teacher_code ?? "",
          classId:        r.class_id,
          className:      r.class_name ?? "(Không tên)",
          classCode:      r.class_code ?? "",
          locationId:     r.location_id,
          programName:    r.program_name ?? "",
          sessionCount:   r.session_count,
          totalMinutes:   r.total_minutes,
          actualMinutes:  r.actual_minutes,
          remainMinutes:  Math.max(0, r.total_minutes - r.actual_minutes),
        })),
        total,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/finance/invoices/bulk-assign-commission", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const { ids, commissions } = req.body ?? {};
      const invoiceIds: string[] = Array.isArray(ids) ? ids : [];
      const comms: { staffId: string; percentage: number }[] = Array.isArray(commissions) ? commissions : [];
      if (invoiceIds.length === 0) {
        return res.status(400).json({ message: "Vui lòng chọn ít nhất một hoá đơn" });
      }
      const results: { id: string; ok: boolean; error?: string }[] = [];
      for (const id of invoiceIds) {
        try {
          await saveInvoiceCommissions(id, comms);
          results.push({ id, ok: true });
        } catch (err: any) {
          results.push({ id, ok: false, error: err.message });
        }
      }
      const ok = results.filter(r => r.ok).length;
      const failed = results.filter(r => !r.ok).length;
      res.json({ results, summary: { ok, failed } });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
