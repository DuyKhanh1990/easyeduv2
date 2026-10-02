import type { Express } from "express";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { commissionConfigs, insertCommissionConfigSchema, locations } from "@shared/schema";
import { getCommissionBoardRows } from "../services/commission-board.service";

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

const commissionPayloadSchema = insertCommissionConfigSchema.extend({
  name: z.string().trim().min(1, "Tên hoa hồng là bắt buộc"),
  locationIds: z.array(z.string().uuid()).min(1, "Vui lòng chọn ít nhất một cơ sở"),
  invoiceTypes: z.array(z.string()).min(1, "Vui lòng chọn ít nhất một loại hóa đơn"),
  invoiceStatuses: z.array(z.enum(["unpaid", "paid", "confirmed"])).min(1, "Vui lòng chọn ít nhất một trạng thái hóa đơn"),
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

      const rows = await getCommissionBoardRows({
        dateFrom,
        dateTo,
        allowedLocationIds: req.allowedLocationIds,
        isSuperAdmin: req.isSuperAdmin,
      });

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