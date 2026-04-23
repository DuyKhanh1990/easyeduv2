import type { Express } from "express";
import { z } from "zod";
import { db, eq, inArray } from "../storage/base";
import { invoices, invoiceItems, students } from "../storage/base";
import { financePromotions } from "@shared/schema";
import { matbao, type MatBaoAdjustment } from "../lib/matbao.service";

const signSchema = z.object({
  invoiceIds: z.array(z.string().uuid()).min(1),
  isPublish: z.boolean(),
});

const configSchema = z.object({
  baseUrl: z.string().url(),
  mst: z.string().min(1),
  username: z.string().min(1),
  password: z.string().optional().default(""),
  khhDon: z.string().default(""),
  khmsHDon: z.string().default(""),
});

const testSchema = z.object({
  baseUrl: z.string().url(),
  mst: z.string().min(1),
  username: z.string().min(1),
  password: z.string().optional().default(""),
});

export function registerEInvoiceRoutes(app: Express) {
  // GET /api/einvoice/config — Lấy cấu hình hiện tại (ẩn password)
  app.get("/api/einvoice/config", async (_req, res) => {
    try {
      const cfg = await matbao.getConfig();
      res.json({
        baseUrl: cfg.baseUrl,
        mst: cfg.mst,
        username: cfg.username,
        hasPassword: Boolean(cfg.password),
        khhDon: cfg.khhDon,
        khmsHDon: cfg.khmsHDon,
      });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Lỗi đọc cấu hình" });
    }
  });

  // POST /api/einvoice/config — Lưu cấu hình
  app.post("/api/einvoice/config", async (req, res) => {
    const parsed = configSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.errors });
    }
    try {
      let { password } = parsed.data;
      if (!password) {
        const cur = await matbao.getConfig();
        if (!cur.password) {
          return res.status(400).json({ message: "Vui lòng nhập mật khẩu" });
        }
        password = cur.password;
      }
      await matbao.saveConfig({ ...parsed.data, password });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Lỗi lưu cấu hình" });
    }
  });

  // POST /api/einvoice/test-connection — Kiểm tra đăng nhập + tải mẫu hoá đơn
  app.post("/api/einvoice/test-connection", async (req, res) => {
    const parsed = testSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.errors });
    }
    try {
      const templates = await matbao.fetchTemplates({ creds: parsed.data });
      res.json({
        ok: true,
        templates: templates.map((t: any) => ({
          khmsHDon: String(t.khmshDon ?? t.KHMSHDon ?? ""),
          khhDon: String(t.khhDon ?? t.KHHDon ?? ""),
          name: t.thDon ?? t.THDon ?? "",
          remaining: t.cLai ?? t.CLai ?? null,
        })),
      });
    } catch (err: any) {
      res.status(400).json({ ok: false, message: err?.message || "Kết nối thất bại" });
    }
  });

  // POST /api/einvoice/sign — Gửi danh sách hoá đơn sang Mắt Bão
  app.post("/api/einvoice/sign", async (req, res) => {
    if (!(await matbao.isConfigured())) {
      return res.status(500).json({
        message: "Hệ thống chưa cấu hình kết nối Mắt Bão. Vui lòng vào Cấu hình hệ thống → Hoá đơn điện tử.",
      });
    }

    const parsed = signSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dữ liệu gửi không hợp lệ", errors: parsed.error.errors });
    }
    const { invoiceIds, isPublish } = parsed.data;

    const invRows = await db
      .select({
        invoice: invoices,
        studentName: students.fullName,
        studentEmail: students.email,
        studentPhone: students.phone,
      })
      .from(invoices)
      .leftJoin(students, eq(invoices.studentId, students.id))
      .where(inArray(invoices.id, invoiceIds));

    const itemsRows = await db
      .select()
      .from(invoiceItems)
      .where(inArray(invoiceItems.invoiceId, invoiceIds));

    const itemsByInv = new Map<string, typeof itemsRows>();
    for (const it of itemsRows) {
      const arr = itemsByInv.get(it.invoiceId) ?? [];
      arr.push(it);
      itemsByInv.set(it.invoiceId, arr);
    }

    // Lookup tên KM/Phụ thu theo code
    const promoCodes = new Set<string>();
    for (const it of itemsRows) {
      (it.promotionKeys ?? []).forEach(k => k && promoCodes.add(k));
      (it.surchargeKeys ?? []).forEach(k => k && promoCodes.add(k));
    }
    const promoRows = promoCodes.size > 0
      ? await db.select().from(financePromotions).where(inArray(financePromotions.id, Array.from(promoCodes)))
      : [];
    const promoByCode = new Map(promoRows.map(p => [p.id, p]));

    const results: Array<{ invoiceId: string; success: boolean; fkey?: string; message: string }> = [];

    for (const r of invRows) {
      const inv = r.invoice;
      const studentName = r.studentName || inv.subjectName || "Khách lẻ";
      const items = itemsByInv.get(inv.id) ?? [];

      // Helper tính phân bổ amount theo danh sách KM/PT đã match
      const distributeAdjustments = (
        keys: string[] | null | undefined,
        type: "promotion" | "surcharge",
        totalAmount: number,
        baseAmount: number,
      ): MatBaoAdjustment[] => {
        const codes = (keys ?? []).filter(Boolean);
        if (codes.length === 0 || totalAmount <= 0) return [];
        const matched = codes
          .map(c => promoByCode.get(c))
          .filter((p): p is NonNullable<typeof p> => Boolean(p) && p!.type === type);
        if (matched.length === 0) {
          return [{ name: type === "promotion" ? "Khuyến mãi" : "Phụ thu", amount: Math.round(totalAmount) }];
        }
        const result: MatBaoAdjustment[] = matched.map(p => {
          const v = parseFloat(p.valueAmount ?? "0");
          const amt = p.valueType === "vnd"
            ? v
            : (baseAmount * v) / 100;
          return { name: p.name, amount: Math.max(0, Math.round(amt)) };
        });
        // Hiệu chỉnh dòng cuối để tổng khớp totalAmount
        const sum = result.reduce((s, r) => s + r.amount, 0);
        const diff = Math.round(totalAmount) - sum;
        if (diff !== 0 && result.length > 0) {
          result[result.length - 1].amount = Math.max(0, result[result.length - 1].amount + diff);
        }
        return result.filter(r => r.amount > 0);
      };

      const matbaoItems = items.length > 0
        ? items.map(it => {
            const price = parseFloat(it.unitPrice ?? "0");
            const qty = it.quantity ?? 1;
            const base = price * qty;
            return {
              name: it.packageName,
              price,
              quantity: qty,
              unit: it.packageType === "buổi" ? "Buổi" : "Khóa",
              promotions: distributeAdjustments(it.promotionKeys, "promotion", parseFloat(it.promotionAmount ?? "0"), base),
              surcharges: distributeAdjustments(it.surchargeKeys, "surcharge", parseFloat(it.surchargeAmount ?? "0"), base),
            };
          })
        : [{
            name: inv.category || inv.description || "Học phí",
            price: parseFloat(inv.grandTotal ?? "0"),
            quantity: 1,
            unit: "Khóa",
          }];

      try {
        const out = await matbao.processInvoice(
          {
            studentName,
            email: r.studentEmail,
            phone: r.studentPhone,
            items: matbaoItems,
          },
          isPublish,
        );

        const newStatus = isPublish ? "published" : "draft";
        await db.update(invoices)
          .set({
            einvoiceStatus: newStatus,
            einvoiceFkey: out.fkey,
            einvoiceMaTraCuu: out.maTraCuu,
            einvoiceMessage: out.message,
            einvoiceUpdatedAt: new Date(),
          })
          .where(eq(invoices.id, inv.id));

        results.push({ invoiceId: inv.id, success: true, fkey: out.fkey, message: out.message });
      } catch (err: any) {
        const msg = err?.message ?? "Lỗi không xác định";
        await db.update(invoices)
          .set({
            einvoiceMessage: msg,
            einvoiceUpdatedAt: new Date(),
          })
          .where(eq(invoices.id, inv.id));
        results.push({ invoiceId: inv.id, success: false, message: msg });
      }
    }

    const okCount = results.filter(r => r.success).length;
    res.json({
      total: results.length,
      success: okCount,
      failed: results.length - okCount,
      results,
    });
  });

  // GET /api/einvoice/pdf/:invoiceId — Tải PDF nháp / đã ký từ Mắt Bão
  app.get("/api/einvoice/pdf/:invoiceId", async (req, res) => {
    const invoiceId = req.params.invoiceId;
    try {
      const rows = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
      const inv = rows[0];
      if (!inv) return res.status(404).json({ message: "Không tìm thấy hoá đơn" });
      if (!inv.einvoiceFkey) {
        return res.status(400).json({ message: "Hoá đơn chưa được gửi sang Mắt Bão" });
      }
      const pdf = await matbao.downloadInvoicePdf({
        maSoHDon: inv.einvoiceFkey,
        maTraCuu: inv.einvoiceMaTraCuu,
      });
      const isDraft = inv.einvoiceStatus === "draft";
      const filename = `${isDraft ? "nhap" : "hoadon"}-${inv.code || invoiceId}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      res.setHeader("Cache-Control", "no-store");
      res.send(pdf);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Lỗi tải PDF" });
    }
  });
}
