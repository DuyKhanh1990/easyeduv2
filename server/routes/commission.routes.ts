import type { Express } from "express";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { commissionConfigs, insertCommissionConfigSchema, locations, staff } from "@shared/schema";
import { getInvoices } from "../storage/finance.storage";

const roleConfigSchema = z.object({
  mode: z.enum(["percent", "amount"]),
  value: z.coerce.number().min(0),
  applicationMode: z.enum(["always", "first_invoice", "subsequent_invoices"]),
});

const allowedRoleKeys = new Set(["sale", "manager", "teacher", "invoice_creator", "commission_assigner"]);
const roleConfigsSchema = z.record(roleConfigSchema).refine(
  value => Object.keys(value).every(key => allowedRoleKeys.has(key)),
  "Vai trò áp dụng không hợp lệ",
);

const clampPercentage = (value: unknown): number => {
  const percentage = Number(value);
  return Number.isFinite(percentage) ? Math.max(0, Math.min(100, percentage)) : 0;
};

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

type CommissionBoardDetail = {
  invoiceId: string;
  invoiceCode: string;
  invoiceType: string;
  customerName: string;
  role: string;
  configName: string;
  status: string;
  businessDate: string;
  revenue: number;
  commissionableRevenue: number;
  rate: number;
  rateMode: "percent" | "amount";
  applicationMode: "always" | "first_invoice" | "subsequent_invoices";
  invoicePercentage: number;
  commission: number;
};

type CommissionBoardRow = {
  locationId: string | null;
  locationName: string;
  staffId: string;
  staffName: string;
  invoiceCount: number;
  totalRevenue: number;
  totalCommission: number;
  details: CommissionBoardDetail[];
};

const commissionPayloadSchema = insertCommissionConfigSchema.extend({
  name: z.string().trim().min(1, "Tên hoa hồng là bắt buộc"),
  locationIds: z.array(z.string().uuid()).min(1, "Vui lòng chọn ít nhất một cơ sở"),
  invoiceTypes: z.array(z.string()).min(1, "Vui lòng chọn ít nhất một loại hóa đơn"),
  invoiceStatuses: z.array(z.enum(["unpaid", "paid"])).min(1, "Vui lòng chọn ít nhất một trạng thái hóa đơn"),
  effectiveFrom: z.string().min(1, "Thời gian áp dụng là bắt buộc"),
  effectiveTo: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  roleConfigs: roleConfigsSchema,
}).omit({ createdBy: true, updatedBy: true });

export function registerCommissionRoutes(app: Express): void {
  app.get("/api/commission-board", async (req, res) => {
    try {
      const query = req.query as Record<string, string | undefined>;
      const dateFrom = query.dateFrom || undefined;
      const dateTo = query.dateTo || undefined;
      if (dateFrom && dateTo && dateFrom > dateTo) {
        return res.status(400).json({ message: "Ngày bắt đầu không được sau ngày kết thúc." });
      }

      const [result, configs] = await Promise.all([
        getInvoices({
          type: "Thu",
          allowedLocationIds: req.allowedLocationIds,
          isSuperAdmin: req.isSuperAdmin,
        }),
        db.select().from(commissionConfigs).orderBy(asc(commissionConfigs.effectiveFrom), asc(commissionConfigs.name)),
      ]);

      const staffIds = new Set<string>();
      for (const invoice of result.data) {
        for (const id of [
          ...(invoice.studentSalesByIds ?? []),
          ...(invoice.studentManagedByIds ?? []),
          ...(invoice.studentTeacherIds ?? []),
          ...(invoice.creatorStaffId ? [invoice.creatorStaffId] : []),
          ...(invoice.commissions ?? []).map((commission: any) => commission.staffId),
        ]) {
          if (id) staffIds.add(id);
        }
      }
       const staffRows = staffIds.size
         ? await db.select({ id: staff.id, fullName: staff.fullName, code: staff.code }).from(staff).where(inArray(staff.id, Array.from(staffIds)))
        : [];
      const staffNameMap = new Map(staffRows.map(person => [person.id, person.fullName || person.code || person.id]));

      const toDateOnly = (value: unknown): string | null => {
        if (!value) return null;
        if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
        const parsed = new Date(value as string | Date);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
      };
      const invoiceBusinessDate = (invoice: any): string | null => (
        invoice.status === "paid" ? toDateOnly(invoice.paidAt) : toDateOnly(invoice.createdAt)
      );
      const isInRange = (value: string, from?: string | null, to?: string | null) => (
        (!from || value >= from) && (!to || value <= to)
      );
       const getRoleStaffIds = (invoice: any, role: string): string[] => {
        switch (role) {
          case "sale": return invoice.studentSalesByIds ?? [];
          case "manager": return invoice.studentManagedByIds ?? [];
          case "teacher": return invoice.studentTeacherIds ?? [];
          case "invoice_creator": return invoice.creatorStaffId ? [invoice.creatorStaffId] : [];
          case "commission_assigner": return (invoice.commissions ?? []).map((commission: any) => commission.staffId);
          default: return [];
        }
      };
       const getRoleAssignments = (invoice: any, role: string): { staffId: string; invoicePercentage: number }[] => {
         if (role === "commission_assigner") {
           const byStaffId = new Map<string, number>();
           for (const commission of invoice.commissions ?? []) {
             if (!commission?.staffId || byStaffId.has(commission.staffId)) continue;
              byStaffId.set(commission.staffId, clampPercentage(commission.percentage));
           }
           return Array.from(byStaffId, ([staffId, invoicePercentage]) => ({ staffId, invoicePercentage }));
         }
         return Array.from(new Set(getRoleStaffIds(invoice, role)))
           .filter(Boolean)
           .map(staffId => ({ staffId, invoicePercentage: 100 }));
       };
      const grouped = new Map<string, CommissionBoardRow>();

      for (const config of configs) {
        const configStatuses = (config.invoiceStatuses ?? []).filter(status => status === "unpaid" || status === "paid");
        if (!configStatuses.length) continue;
        const configRoles = (config.roleConfigs ?? {}) as Record<string, { mode: "percent" | "amount"; value: number; applicationMode: string }>;
        const candidates = result.data
          .map(invoice => ({ invoice, businessDate: invoiceBusinessDate(invoice) }))
          .filter(({ invoice, businessDate }) => (
            !!businessDate &&
            configStatuses.includes(invoice.status) &&
            (config.locationIds ?? []).includes(invoice.locationId) &&
            (config.invoiceTypes ?? []).includes(invoice.category) &&
            isInRange(businessDate!, config.effectiveFrom, config.effectiveTo)
          ))
          .sort((a, b) => (
            a.businessDate!.localeCompare(b.businessDate!) ||
            String(a.invoice.createdAt ?? "").localeCompare(String(b.invoice.createdAt ?? "")) ||
            a.invoice.id.localeCompare(b.invoice.id)
          ));
        const rankByInvoiceId = new Map<string, number>();
        const byStudent = new Map<string, typeof candidates>();
        for (const candidate of candidates) {
          const studentKey = candidate.invoice.studentId ? `student:${candidate.invoice.studentId}` : `invoice:${candidate.invoice.id}`;
          const list = byStudent.get(studentKey) ?? [];
          list.push(candidate);
          byStudent.set(studentKey, list);
        }
        for (const list of byStudent.values()) {
          list.forEach((candidate, index) => rankByInvoiceId.set(candidate.invoice.id, index + 1));
        }

        for (const { invoice, businessDate } of candidates) {
          if (!isInRange(businessDate!, dateFrom, dateTo)) continue;
          const rank = rankByInvoiceId.get(invoice.id) ?? 1;
           const invoiceTotal = Number(invoice.grandTotal ?? 0);
          for (const [role, roleConfig] of Object.entries(configRoles)) {
            if (!roleConfig || !["always", "first_invoice", "subsequent_invoices"].includes(roleConfig.applicationMode)) continue;
            if (roleConfig.applicationMode === "first_invoice" && rank !== 1) continue;
            if (roleConfig.applicationMode === "subsequent_invoices" && rank <= 1) continue;
             for (const { staffId, invoicePercentage } of getRoleAssignments(invoice, role)) {
                // Only "Người Gán hoa hồng" has an invoice-specific split.
                // Other roles represent the full invoice total by definition.
                const appliedInvoicePercentage = role === "commission_assigner" ? invoicePercentage : 100;
                const commissionableRevenue = roundMoney(invoiceTotal * appliedInvoicePercentage / 100);
               const commissionAmount = roleConfig.mode === "amount"
                  ? roundMoney(Number(roleConfig.value || 0) * appliedInvoicePercentage / 100)
                  : roundMoney(commissionableRevenue * Number(roleConfig.value || 0) / 100);
              const key = `${invoice.locationId ?? "unknown"}:${staffId}`;
            const current: CommissionBoardRow = grouped.get(key) ?? {
                locationId: invoice.locationId ?? null,
                locationName: invoice.branch ?? "—",
                staffId,
                staffName: staffNameMap.get(staffId) ?? "Nhân sự không xác định",
                invoiceCount: 0,
                totalRevenue: 0,
                totalCommission: 0,
                details: [],
              };
              current.invoiceCount += 1;
               current.totalRevenue += commissionableRevenue;
              current.totalCommission += commissionAmount;
              current.details.push({
                invoiceId: invoice.id,
                invoiceCode: invoice.code ?? invoice.id.slice(0, 8),
                invoiceType: invoice.category ?? invoice.type ?? "—",
                customerName: invoice.name ?? invoice.subjectName ?? "—",
                role,
                configName: config.name,
                status: invoice.status,
                businessDate: businessDate!,
                 revenue: invoiceTotal,
                 commissionableRevenue,
                rate: Number(roleConfig.value || 0),
                rateMode: roleConfig.mode,
                applicationMode: roleConfig.applicationMode as "always" | "first_invoice" | "subsequent_invoices",
                 invoicePercentage: appliedInvoicePercentage,
                commission: commissionAmount,
              });
              grouped.set(key, current);
            }
          }
        }
      }

      const rows = Array.from(grouped.values())
        .map(row => ({
          ...row,
          totalRevenue: Math.round(row.totalRevenue * 100) / 100,
          totalCommission: Math.round(row.totalCommission * 100) / 100,
          details: row.details.sort((a, b) => a.businessDate.localeCompare(b.businessDate) || a.invoiceCode.localeCompare(b.invoiceCode)),
        }))
        .sort((a, b) => a.locationName.localeCompare(b.locationName) || a.staffName.localeCompare(b.staffName));

      res.json({
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
        rows,
        totals: {
          invoiceCount: rows.reduce((sum, row) => sum + row.invoiceCount, 0),
          totalRevenue: rows.reduce((sum, row) => sum + row.totalRevenue, 0),
          totalCommission: rows.reduce((sum, row) => sum + row.totalCommission, 0),
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Không thể tải bảng hoa hồng." });
    }
  });

  app.get("/api/commission-configs", async (_req, res) => {
    try {
      const rows = await db
        .select({
          id: commissionConfigs.id,
          name: commissionConfigs.name,
          locationIds: commissionConfigs.locationIds,
          invoiceTypes: commissionConfigs.invoiceTypes,
          invoiceStatuses: commissionConfigs.invoiceStatuses,
          effectiveFrom: commissionConfigs.effectiveFrom,
          effectiveTo: commissionConfigs.effectiveTo,
          description: commissionConfigs.description,
          roleConfigs: commissionConfigs.roleConfigs,
          createdAt: commissionConfigs.createdAt,
          updatedAt: commissionConfigs.updatedAt,
        })
        .from(commissionConfigs)
        .orderBy(asc(commissionConfigs.effectiveFrom), asc(commissionConfigs.name));

      const allLocations = await db.select({ id: locations.id, name: locations.name }).from(locations);
      const locationMap = new Map(allLocations.map(location => [location.id, location.name]));
      res.json(rows.map(row => ({
        ...row,
        locationNames: (row.locationIds ?? []).map(id => locationMap.get(id) ?? id),
      })));
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Không thể tải cấu hình hoa hồng." });
    }
  });

  app.post("/api/commission-configs", async (req, res) => {
    try {
      const payload = commissionPayloadSchema.parse(req.body);
      if (payload.effectiveTo && payload.effectiveTo < payload.effectiveFrom) {
        return res.status(400).json({ message: "Ngày kết thúc không được trước ngày bắt đầu." });
      }
      const [created] = await db.insert(commissionConfigs).values(payload).returning();
      res.status(201).json(created);
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.errors[0]?.message || "Dữ liệu không hợp lệ." });
      res.status(500).json({ message: error.message || "Không thể tạo cấu hình hoa hồng." });
    }
  });

  app.patch("/api/commission-configs/:id", async (req, res) => {
    try {
      const payload = commissionPayloadSchema.partial().parse(req.body);
      if (payload.effectiveTo && payload.effectiveFrom && payload.effectiveTo < payload.effectiveFrom) {
        return res.status(400).json({ message: "Ngày kết thúc không được trước ngày bắt đầu." });
      }
      const [updated] = await db.update(commissionConfigs)
        .set({ ...payload, updatedAt: new Date() })
        .where(eq(commissionConfigs.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ message: "Không tìm thấy cấu hình hoa hồng." });
      res.json(updated);
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.errors[0]?.message || "Dữ liệu không hợp lệ." });
      res.status(500).json({ message: error.message || "Không thể cập nhật cấu hình hoa hồng." });
    }
  });

  app.delete("/api/commission-configs/:id", async (req, res) => {
    try {
      await db.delete(commissionConfigs).where(eq(commissionConfigs.id, req.params.id));
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Không thể xóa cấu hình hoa hồng." });
    }
  });
}