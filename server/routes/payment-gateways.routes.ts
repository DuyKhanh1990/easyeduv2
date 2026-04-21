import type { Express } from "express";
import { db } from "../db";
import { paymentGateways } from "@shared/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const SUPPORTED_PROVIDERS = ["payos", "momo", "vnpay", "zalopay"] as const;

const bankAccountSchema = z.object({
  bankName: z.string(),
  bankAccount: z.string(),
  accountHolder: z.string(),
}).nullable().optional();

const upsertSchema = z.object({
  provider: z.enum(SUPPORTED_PROVIDERS),
  displayName: z.string().min(1, "Tên hiển thị không được để trống"),
  isActive: z.boolean().optional().default(false),
  credentials: z.record(z.string(), z.string()).default({}),
  locationId: z.string().uuid().nullable().optional(),
  appliedBankAccount: bankAccountSchema,
});

const updateSchema = z.object({
  displayName: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  credentials: z.record(z.string(), z.string()).optional(),
  locationId: z.string().uuid().nullable().optional(),
  appliedBankAccount: bankAccountSchema,
});

function maskCredentials(credentials: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (typeof value === "string" && value.length > 4) {
      masked[key] = "*".repeat(value.length - 4) + value.slice(-4);
    } else {
      masked[key] = "****";
    }
  }
  return masked;
}

export function registerPaymentGatewayRoutes(app: Express) {
  // GET /api/payment-gateways — danh sách tất cả cổng (ẩn credentials)
  app.get("/api/payment-gateways", async (req, res) => {
    try {
      const rows = await db.select().from(paymentGateways).orderBy(paymentGateways.createdAt);
      const result = rows.map((row) => ({
        ...row,
        credentials: maskCredentials(row.credentials as Record<string, string>),
      }));
      return res.json(result);
    } catch (err: any) {
      console.error("[PaymentGateways] GET list error:", err);
      return res.status(500).json({ message: "Lỗi khi lấy danh sách cổng thanh toán" });
    }
  });

  // GET /api/payment-gateways/:id — chi tiết 1 cổng (trả về credentials đầy đủ để edit)
  app.get("/api/payment-gateways/:id", async (req, res) => {
    try {
      const rows = await db.select().from(paymentGateways).where(eq(paymentGateways.id, req.params.id));
      if (rows.length === 0) return res.status(404).json({ message: "Không tìm thấy cổng thanh toán" });
      return res.json(rows[0]);
    } catch (err: any) {
      console.error("[PaymentGateways] GET one error:", err);
      return res.status(500).json({ message: "Lỗi khi lấy thông tin cổng thanh toán" });
    }
  });

  // POST /api/payment-gateways — tạo mới (hoặc upsert theo provider)
  app.post("/api/payment-gateways", async (req, res) => {
    try {
      const parsed = upsertSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

      const { provider, displayName, isActive, credentials } = parsed.data;

      const existing = await db.select().from(paymentGateways).where(eq(paymentGateways.provider, provider));
      if (existing.length > 0) {
        const [updated] = await db
          .update(paymentGateways)
          .set({ displayName, isActive, credentials, updatedAt: new Date() })
          .where(eq(paymentGateways.provider, provider))
          .returning();
        return res.json(updated);
      }

      const [created] = await db
        .insert(paymentGateways)
        .values({ provider, displayName, isActive: isActive ?? false, credentials })
        .returning();
      return res.status(201).json(created);
    } catch (err: any) {
      console.error("[PaymentGateways] POST error:", err);
      return res.status(500).json({ message: "Lỗi khi lưu cổng thanh toán" });
    }
  });

  // PUT /api/payment-gateways/:id — cập nhật theo id
  app.put("/api/payment-gateways/:id", async (req, res) => {
    try {
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

      const rows = await db.select().from(paymentGateways).where(eq(paymentGateways.id, req.params.id));
      if (rows.length === 0) return res.status(404).json({ message: "Không tìm thấy cổng thanh toán" });

      const [updated] = await db
        .update(paymentGateways)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(paymentGateways.id, req.params.id))
        .returning();
      return res.json(updated);
    } catch (err: any) {
      console.error("[PaymentGateways] PUT error:", err);
      return res.status(500).json({ message: "Lỗi khi cập nhật cổng thanh toán" });
    }
  });

  // PATCH /api/payment-gateways/:id/toggle — bật/tắt nhanh
  app.patch("/api/payment-gateways/:id/toggle", async (req, res) => {
    try {
      const rows = await db.select().from(paymentGateways).where(eq(paymentGateways.id, req.params.id));
      if (rows.length === 0) return res.status(404).json({ message: "Không tìm thấy cổng thanh toán" });

      const [updated] = await db
        .update(paymentGateways)
        .set({ isActive: !rows[0].isActive, updatedAt: new Date() })
        .where(eq(paymentGateways.id, req.params.id))
        .returning();
      return res.json(updated);
    } catch (err: any) {
      console.error("[PaymentGateways] PATCH toggle error:", err);
      return res.status(500).json({ message: "Lỗi khi thay đổi trạng thái cổng thanh toán" });
    }
  });

  // DELETE /api/payment-gateways/:id — xóa cổng thanh toán
  app.delete("/api/payment-gateways/:id", async (req, res) => {
    try {
      const rows = await db.select().from(paymentGateways).where(eq(paymentGateways.id, req.params.id));
      if (rows.length === 0) return res.status(404).json({ message: "Không tìm thấy cổng thanh toán" });

      await db.delete(paymentGateways).where(eq(paymentGateways.id, req.params.id));
      return res.status(204).send();
    } catch (err: any) {
      console.error("[PaymentGateways] DELETE error:", err);
      return res.status(500).json({ message: "Lỗi khi xóa cổng thanh toán" });
    }
  });
}
