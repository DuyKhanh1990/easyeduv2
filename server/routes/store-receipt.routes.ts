import type { Express } from "express";
import { db, pool } from "../db";
import { sql } from "drizzle-orm";
import { eq, asc, desc, ilike, or } from "drizzle-orm";
import { logStockTransaction } from "./store-inventory.routes";
import {
  storeReceipts,
  storeReceiptItems,
  storeInventory,
  storeProducts,
  storeWarehouses,
  locations,
  storeSuppliers,
  invoices,
  invoiceItems,
  invoicePaymentSchedule,
} from "@shared/schema";
import { z } from "zod";
import { createStoreReceiptAuditLog } from "../storage/store-receipt-audit-log.storage";

async function ensureReceiptTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS store_inventory (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES store_products(id) ON DELETE CASCADE,
      warehouse_id UUID NOT NULL REFERENCES store_warehouses(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
      UNIQUE(product_id, warehouse_id)
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS store_receipts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(50) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
      warehouse_id UUID REFERENCES store_warehouses(id) ON DELETE SET NULL,
      date DATE NOT NULL,
      supplier_id UUID REFERENCES store_suppliers(id) ON DELETE SET NULL,
      note TEXT,
      discount DECIMAL(15,2) DEFAULT 0,
      discount_type VARCHAR(10) DEFAULT 'VND',
      surcharge DECIMAL(15,2) DEFAULT 0,
      surcharge_type VARCHAR(10) DEFAULT 'VND',
      has_invoice BOOLEAN DEFAULT FALSE,
      invoice_note TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'completed',
      total_amount DECIMAL(15,2) DEFAULT 0,
      created_by UUID,
      created_by_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS store_receipt_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      receipt_id UUID NOT NULL REFERENCES store_receipts(id) ON DELETE CASCADE,
      product_id UUID REFERENCES store_products(id) ON DELETE SET NULL,
      product_code VARCHAR(100) NOT NULL,
      product_name VARCHAR(255) NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      category_id UUID,
      color_id UUID,
      size_id UUID,
      unit_id UUID,
      cost_price DECIMAL(15,2) DEFAULT 0,
      sale_price DECIMAL(15,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    ALTER TABLE store_receipts ADD COLUMN IF NOT EXISTS invoice_note TEXT
  `);
  await db.execute(sql`
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS store_receipt_id UUID
  `);
  await db.execute(sql`ALTER TABLE store_receipt_items ADD COLUMN IF NOT EXISTS star_price INTEGER DEFAULT 0`);
  await db.execute(sql`ALTER TABLE store_receipt_items ADD COLUMN IF NOT EXISTS total_stars INTEGER DEFAULT 0`);
  // Đảm bảo unique constraint tồn tại — cần thiết cho ON CONFLICT (product_id, warehouse_id)
  // Nếu bảng được tạo từ phiên bản cũ chưa có constraint này thì CREATE TABLE IF NOT EXISTS là no-op,
  // dẫn đến lỗi 42P10 khi tạo phiếu nhập kho trên production.
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'store_inventory_product_warehouse_unique'
        AND conrelid = 'store_inventory'::regclass
      ) THEN
        ALTER TABLE store_inventory
        ADD CONSTRAINT store_inventory_product_warehouse_unique
        UNIQUE (product_id, warehouse_id);
      END IF;
    END $$
  `);
  console.log("[Store] Receipt tables ensured");
}

const receiptItemSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  productCode: z.string().min(1),
  productName: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
  categoryId: z.string().uuid().optional().nullable(),
  colorId: z.string().uuid().optional().nullable(),
  sizeId: z.string().uuid().optional().nullable(),
  unitId: z.string().uuid().optional().nullable(),
  costPrice: z.number().min(0).default(0),
  salePrice: z.number().min(0).default(0),
  starPrice: z.number().int().min(0).default(0),
  totalStars: z.number().int().min(0).default(0),
});

const receiptCreateSchema = z.object({
  code: z.string().min(1, "Mã phiếu không được để trống"),
  name: z.string().min(1, "Tên phiếu không được để trống"),
  locationId: z.string().uuid().optional().nullable(),
  warehouseId: z.string().uuid().optional().nullable(),
  date: z.string().min(1, "Ngày tạo không được để trống"),
  supplierId: z.string().uuid().optional().nullable(),
  note: z.string().optional().nullable(),
  discount: z.number().min(0).default(0),
  discountType: z.enum(["VND", "%"]).default("VND"),
  surcharge: z.number().min(0).default(0),
  surchargeType: z.enum(["VND", "%"]).default("VND"),
  hasInvoice: z.boolean().default(false),
  invoiceNote: z.string().optional().nullable(),
  paidAmount: z.number().min(0).default(0),
  status: z.enum(["draft", "completed"]).default("completed"),
  totalAmount: z.number().min(0).default(0),
  items: z.array(receiptItemSchema).default([]),
});

function buildAutoInvoiceDescription(receiptCode: string, itemCount: number, totalQty: number): string {
  const num = parseInt(receiptCode.replace("PNK-", "")) || 0;
  const numStr = num ? String(num).padStart(2, "0") : "01";
  return `Phiếu nhập kho số ${numStr}, Số sản phẩm: ${itemCount}, Số lượng ${totalQty}`;
}

type ReceiptItemFull = {
  quantity: number;
  productName: string;
  costPrice: number;
};

async function createReceiptInvoice(params: {
  receiptId: string;
  receiptCode: string;
  supplierId: string;
  locationId: string | null | undefined;
  invoiceNote: string | null | undefined;
  discount: number;
  discountType: "VND" | "%";
  surcharge: number;
  surchargeType: "VND" | "%";
  paidAmount: number;
  items: ReceiptItemFull[];
  createdBy: string | null | undefined;
  createdByName: string | null | undefined;
}) {
  const supplier = await db.select().from(storeSuppliers).where(eq(storeSuppliers.id, params.supplierId)).limit(1);
  const supplierName = supplier[0]?.name ?? "Nhà cung cấp";

  const itemCount = params.items.length;
  const totalQty = params.items.reduce((s, i) => s + i.quantity, 0);
  const description = params.invoiceNote?.trim()
    ? params.invoiceNote.trim()
    : buildAutoInvoiceDescription(params.receiptCode, itemCount, totalQty);

  const subtotal = params.items.reduce((s, i) => s + i.quantity * i.costPrice, 0);
  const discountAmt = params.discountType === "VND" ? params.discount : subtotal * params.discount / 100;
  const surchargeAmt = params.surchargeType === "VND" ? params.surcharge : subtotal * params.surcharge / 100;
  const grandTotal = Math.max(0, subtotal - discountAmt + surchargeAmt);

  const paid = Math.min(params.paidAmount, grandTotal);
  const remaining = Math.max(0, grandTotal - paid);
  const invStatus = remaining <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid";

  const nextCodeRow = await db.execute(sql`
    SELECT MAX(CAST(SUBSTRING(code FROM 3) AS INTEGER)) as max_num
    FROM invoices WHERE code ~ '^PC[0-9]+$'
  `);
  const maxNum = (nextCodeRow.rows[0] as any)?.max_num ?? 0;
  const nextCode = `PC${String((parseInt(String(maxNum)) || 0) + 1).padStart(2, "0")}`;

  const [inv] = await db.insert(invoices).values({
    code: nextCode,
    type: "Chi",
    locationId: params.locationId ?? null,
    subjectName: supplierName,
    category: "Kho",
    description,
    totalAmount: String(subtotal),
    totalPromotion: String(discountAmt),
    totalSurcharge: String(surchargeAmt),
    invoicePromotionAmount: String(discountAmt),
    invoiceSurchargeAmount: String(surchargeAmt),
    grandTotal: String(grandTotal),
    paidAmount: String(paid),
    remainingAmount: String(remaining),
    status: invStatus,
    createdBy: params.createdBy ?? null,
    updatedBy: params.createdBy ?? null,
  } as any).returning();

  if (params.items.length > 0) {
    await db.insert(invoiceItems).values(
      params.items.map((item, idx) => ({
        invoiceId: inv.id,
        packageName: item.productName,
        packageType: "Kho",
        unitPrice: String(item.costPrice),
        quantity: item.quantity,
        promotionKeys: [],
        surchargeKeys: [],
        promotionAmount: "0",
        surchargeAmount: "0",
        subtotal: String(item.quantity * item.costPrice),
        category: "Kho",
        sortOrder: idx,
      }))
    );
  }

  await db.execute(sql`
    UPDATE invoices SET store_receipt_id = ${params.receiptId} WHERE id = ${inv.id}
  `);

  // Create payment schedule when partial payment
  if (paid > 0 && remaining > 0) {
    await db.insert(invoicePaymentSchedule).values([
      {
        invoiceId: inv.id,
        label: "ĐỢT 1",
        code: `${nextCode}-1`,
        amount: String(paid),
        dueDate: new Date().toISOString().split("T")[0],
        status: "paid",
        sortOrder: 0,
        paymentMethod: "cash",
      },
      {
        invoiceId: inv.id,
        label: "ĐỢT 2",
        code: `${nextCode}-2`,
        amount: String(remaining),
        dueDate: new Date().toISOString().split("T")[0],
        status: "unpaid",
        sortOrder: 1,
        paymentMethod: "cash",
      },
    ] as any[]);
  }
}

async function updateInventory(warehouseId: string, items: { productId?: string | null; quantity: number }[], op: "add" | "subtract") {
  for (const item of items) {
    if (!item.productId) continue;
    const delta = op === "add" ? item.quantity : -item.quantity;
    await db.execute(sql`
      INSERT INTO store_inventory (product_id, warehouse_id, quantity, updated_at)
      VALUES (${item.productId}, ${warehouseId}, ${Math.max(0, delta)}, NOW())
      ON CONFLICT (product_id, warehouse_id)
      DO UPDATE SET quantity = GREATEST(0, store_inventory.quantity + ${delta}), updated_at = NOW()
    `);
  }
}

export async function registerStoreReceiptRoutes(app: Express) {
  await ensureReceiptTables();

  // ── NEXT CODE ──────────────────────────────────────────────────────────────
  app.get("/api/store/receipts/next-code", async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT MAX(CAST(SUBSTRING(code FROM 5) AS INTEGER)) as max_num
        FROM store_receipts
        WHERE code ~ '^PNK-[0-9]+$'
      `);
      const maxNum = (result.rows[0] as any)?.max_num ?? 0;
      const nextNum = (parseInt(String(maxNum)) || 0) + 1;
      const nextCode = `PNK-${String(nextNum).padStart(2, "0")}`;
      res.json({ code: nextCode, num: nextNum });
    } catch (err) {
      console.error("[Receipt] next-code error:", err);
      res.json({ code: "PNK-01", num: 1 });
    }
  });

  // ── RECEIPT HISTORY TIMELINE ───────────────────────────────────────────────
  app.get("/api/store/receipts/history", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const { allowedLocationIds, isSuperAdmin } = req;
    const { dateFrom, dateTo, locationId, limit: limitStr, offset: offsetStr } = req.query as Record<string, string>;
    const limit  = Math.min(parseInt(limitStr  ?? "100") || 100, 200);
    const offset = parseInt(offsetStr ?? "0") || 0;

    // Location access filter (same as list endpoint)
    const locSnippet = (() => {
      if (locationId && locationId !== "__all__") return `AND r.location_id = '${locationId}'`;
      if (!isSuperAdmin && allowedLocationIds?.length) {
        return `AND (r.location_id IS NULL OR r.location_id = ANY(ARRAY[${allowedLocationIds.map((id: string) => `'${id}'`).join(",")}]::uuid[]))`;
      }
      return "";
    })();
    const dateFilter = (() => {
      const parts: string[] = [];
      if (dateFrom) parts.push(`base.ev_time >= '${dateFrom}'::date`);
      if (dateTo)   parts.push(`base.ev_time <  ('${dateTo}'::date + INTERVAL '1 day')`);
      return parts.length ? "WHERE " + parts.join(" AND ") : "";
    })();

    try {
      // locSnippet dùng alias "r", locSnippetAudit dùng alias "ral"
      const locSnippetAudit = (() => {
        if (locationId && locationId !== "__all__") return `AND ral.location_id = '${locationId}'::uuid`;
        if (!isSuperAdmin && allowedLocationIds?.length) {
          return `AND (ral.location_id IS NULL OR ral.location_id = ANY(ARRAY[${allowedLocationIds.map((id: string) => `'${id}'`).join(",")}]::uuid[]))`;
        }
        return "";
      })();

      const baseUnion = `
        SELECT
          'created'::text      AS ev_type,
          r.created_at         AS ev_time,
          r.id::text           AS receipt_id,
          r.code               AS receipt_code,
          r.name               AS receipt_name,
          r.status,
          r.total_amount::text,
          r.note,
          w.name               AS warehouse_name,
          s.name               AS supplier_name,
          l.name               AS location_name,
          r.created_by_name,
          NULL::text           AS old_content_json,
          NULL::text           AS new_content_json
        FROM store_receipts r
        LEFT JOIN store_warehouses w ON w.id = r.warehouse_id
        LEFT JOIN store_suppliers  s ON s.id = r.supplier_id
        LEFT JOIN locations        l ON l.id = r.location_id
        WHERE 1=1 ${locSnippet}

        UNION ALL

        SELECT
          'completed'::text    AS ev_type,
          r.updated_at         AS ev_time,
          r.id::text, r.code, r.name, r.status,
          r.total_amount::text, r.note,
          w.name, s.name, l.name, r.created_by_name,
          NULL::text, NULL::text
        FROM store_receipts r
        LEFT JOIN store_warehouses w ON w.id = r.warehouse_id
        LEFT JOIN store_suppliers  s ON s.id = r.supplier_id
        LEFT JOIN locations        l ON l.id = r.location_id
        WHERE r.status = 'completed'
          AND r.updated_at IS DISTINCT FROM r.created_at
          ${locSnippet}

        UNION ALL

        SELECT
          'cancelled'::text    AS ev_type,
          r.updated_at         AS ev_time,
          r.id::text, r.code, r.name, r.status,
          r.total_amount::text, r.note,
          w.name, s.name, l.name, r.created_by_name,
          NULL::text, NULL::text
        FROM store_receipts r
        LEFT JOIN store_warehouses w ON w.id = r.warehouse_id
        LEFT JOIN store_suppliers  s ON s.id = r.supplier_id
        LEFT JOIN locations        l ON l.id = r.location_id
        WHERE r.status = 'cancelled'
          AND r.updated_at IS DISTINCT FROM r.created_at
          ${locSnippet}

        UNION ALL

        SELECT
          'edited'::text           AS ev_type,
          ral.created_at           AS ev_time,
          ral.receipt_id,
          ral.receipt_code,
          COALESCE(r.name, ral.receipt_code) AS receipt_name,
          COALESCE(r.status, 'unknown')       AS status,
          COALESCE(r.total_amount::text, '0') AS total_amount,
          r.note,
          w.name                   AS warehouse_name,
          s.name                   AS supplier_name,
          COALESCE(l.name, l2.name) AS location_name,
          ral.user_name            AS created_by_name,
          ral.old_content::text    AS old_content_json,
          ral.new_content::text    AS new_content_json
        FROM store_receipt_audit_logs ral
        LEFT JOIN store_receipts  r  ON r.id::text = ral.receipt_id
        LEFT JOIN store_warehouses w  ON w.id = r.warehouse_id
        LEFT JOIN store_suppliers  s  ON s.id = r.supplier_id
        LEFT JOIN locations        l  ON l.id = r.location_id
        LEFT JOIN locations        l2 ON l2.id = ral.location_id
        WHERE ral.action = 'edited'
          ${locSnippetAudit}

        UNION ALL

        SELECT
          'deleted'::text                           AS ev_type,
          ral.created_at                            AS ev_time,
          ral.receipt_id,
          ral.receipt_code,
          COALESCE(ral.old_content->>'Tên phiếu', ral.receipt_code) AS receipt_name,
          'deleted'                                 AS status,
          COALESCE(ral.old_content->>'Tổng tiền', '0')              AS total_amount,
          ral.old_content->>'Ghi chú'              AS note,
          NULL                                      AS warehouse_name,
          NULL                                      AS supplier_name,
          l.name                                    AS location_name,
          ral.user_name                             AS created_by_name,
          ral.old_content::text                     AS old_content_json,
          NULL::text                                AS new_content_json
        FROM store_receipt_audit_logs ral
        LEFT JOIN locations l ON l.id = ral.location_id
        WHERE ral.action = 'deleted'
          ${locSnippetAudit}
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
      console.error("[Receipt] history error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ── LIST RECEIPTS ──────────────────────────────────────────────────────────
  app.get("/api/store/receipts", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const { allowedLocationIds, isSuperAdmin } = req;
    const locationFilter = (!isSuperAdmin && allowedLocationIds?.length)
      ? sql`AND r.location_id = ANY(ARRAY[${sql.raw(allowedLocationIds.map((id: string) => `'${id}'`).join(','))}]::uuid[])`
      : sql``;
    try {
      const rows = await db.execute(sql`
        SELECT
          r.id, r.code, r.name, r.date, r.status,
          r.has_invoice, r.total_amount, r.note,
          r.discount, r.discount_type, r.surcharge, r.surcharge_type,
          r.created_by, r.created_by_name, r.created_at,
          r.location_id, r.warehouse_id, r.supplier_id,
          l.name AS location_name,
          w.name AS warehouse_name,
          s.name AS supplier_name,
          COUNT(DISTINCT i.id)::int AS item_count,
          COALESCE(SUM(i.quantity), 0)::int AS total_quantity
        FROM store_receipts r
        LEFT JOIN locations l ON l.id = r.location_id
        LEFT JOIN store_warehouses w ON w.id = r.warehouse_id
        LEFT JOIN store_suppliers s ON s.id = r.supplier_id
        LEFT JOIN store_receipt_items i ON i.receipt_id = r.id
        WHERE TRUE ${locationFilter}
        GROUP BY r.id, l.name, w.name, s.name
        ORDER BY r.created_at DESC
      `);
      res.json(rows.rows);
    } catch (err) {
      console.error("[Receipt] GET list error:", err);
      res.status(500).json({ message: "Lỗi khi lấy danh sách phiếu nhập kho" });
    }
  });

  // ── GET RECEIPT DETAIL ─────────────────────────────────────────────────────
  app.get("/api/store/receipts/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const [receipt] = await db.select().from(storeReceipts).where(eq(storeReceipts.id, req.params.id));
      if (!receipt) return res.status(404).json({ message: "Không tìm thấy phiếu" });
      const items = await db.select().from(storeReceiptItems).where(eq(storeReceiptItems.receiptId, req.params.id));
      res.json({ ...receipt, items });
    } catch (err) {
      console.error("[Receipt] GET detail error:", err);
      res.status(500).json({ message: "Lỗi khi lấy chi tiết phiếu" });
    }
  });

  // ── CREATE RECEIPT ─────────────────────────────────────────────────────────
  app.post("/api/store/receipts", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const user = req.user as any;
    try {
      const parsed = receiptCreateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const { items, ...receiptData } = parsed.data;

      const insertData: any = {
        ...receiptData,
        discount: String(receiptData.discount),
        surcharge: String(receiptData.surcharge),
        totalAmount: String(receiptData.totalAmount),
        createdBy: user.id,
        createdByName: user.fullName || user.username,
      };

      const [receipt] = await db.insert(storeReceipts).values(insertData).returning();

      if (items.length > 0) {
        const itemRows = items.map(item => ({
          receiptId: receipt.id,
          productId: item.productId || null,
          productCode: item.productCode,
          productName: item.productName,
          quantity: item.quantity,
          categoryId: item.categoryId || null,
          colorId: item.colorId || null,
          sizeId: item.sizeId || null,
          unitId: item.unitId || null,
          costPrice: String(item.costPrice),
          salePrice: String(item.salePrice),
          starPrice: item.starPrice ?? 0,
          totalStars: item.quantity * (item.starPrice ?? 0),
        }));
        await db.insert(storeReceiptItems).values(itemRows);
      }

      if (receiptData.status === "completed" && receiptData.warehouseId && items.length > 0) {
        await updateInventory(receiptData.warehouseId, items, "add");
        for (const item of items) {
          if (!item.productId) continue;
          await logStockTransaction({
            productId: item.productId,
            warehouseId: receiptData.warehouseId,
            receiptId: receipt.id,
            receiptCode: receipt.code,
            type: "import",
            quantityDelta: item.quantity,
            createdBy: user.id,
            createdByName: user.fullName || user.username,
          });
        }
      }

      if (receiptData.hasInvoice && receiptData.supplierId && receiptData.status === "completed") {
        await createReceiptInvoice({
          receiptId: receipt.id,
          receiptCode: receipt.code,
          supplierId: receiptData.supplierId,
          locationId: receiptData.locationId,
          invoiceNote: receiptData.invoiceNote,
          discount: receiptData.discount,
          discountType: receiptData.discountType,
          surcharge: receiptData.surcharge,
          surchargeType: receiptData.surchargeType,
          paidAmount: receiptData.paidAmount,
          items: items.map(i => ({ quantity: i.quantity, productName: i.productName, costPrice: i.costPrice })),
          createdBy: user.id,
          createdByName: user.fullName || user.username,
        });
      }

      res.status(201).json(receipt);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ message: "Mã phiếu đã tồn tại" });
      console.error("[Receipt] POST error:", err);
      res.status(500).json({ message: "Lỗi khi tạo phiếu nhập kho" });
    }
  });

  // ── UPDATE RECEIPT ─────────────────────────────────────────────────────────
  app.patch("/api/store/receipts/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const parsed = receiptCreateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const { items, ...receiptData } = parsed.data;

      const [existing] = await db.select().from(storeReceipts).where(eq(storeReceipts.id, req.params.id));
      if (!existing) return res.status(404).json({ message: "Không tìm thấy phiếu" });

      if ((existing.status as string) === "cancelled") {
        return res.status(400).json({ message: "Không thể sửa phiếu đã bị hủy" });
      }

      // Kiểm tra hóa đơn liên kết có đang ở trạng thái đã/một phần thanh toán không
      const linkedInvCheck = await db.execute(sql`
        SELECT id, code, status FROM invoices WHERE store_receipt_id = ${req.params.id} LIMIT 1
      `);
      if (linkedInvCheck.rows.length > 0) {
        const inv = linkedInvCheck.rows[0] as any;
        if (inv.status === "paid" || inv.status === "partial") {
          const statusLabel = inv.status === "paid" ? "Đã thanh toán" : "Thanh toán một phần";
          return res.status(409).json({
            message: `Phiếu ${(existing as any).code} có hoá đơn ${inv.code} ${statusLabel}, vui lòng chuyển hoá đơn sang Trạng thái: Chưa thanh toán để thực hiện việc chỉnh sửa`,
            invoiceLocked: true,
            invoiceCode: inv.code,
            invoiceStatus: inv.status,
          });
        }
      }

      const oldItems = await db.select().from(storeReceiptItems).where(eq(storeReceiptItems.receiptId, req.params.id));

      // ── Audit: snapshot trạng thái trước khi sửa ─────────────────────────
      const [auditOldWh, auditOldSup, auditOldLoc] = await Promise.all([
        existing.warehouseId
          ? db.select({ name: storeWarehouses.name }).from(storeWarehouses).where(eq(storeWarehouses.id, existing.warehouseId)).limit(1)
          : Promise.resolve([] as { name: string }[]),
        existing.supplierId
          ? db.select({ name: storeSuppliers.name }).from(storeSuppliers).where(eq(storeSuppliers.id, existing.supplierId)).limit(1)
          : Promise.resolve([] as { name: string }[]),
        existing.locationId
          ? db.select({ name: locations.name }).from(locations).where(eq(locations.id, existing.locationId)).limit(1)
          : Promise.resolve([] as { name: string }[]),
      ]);
      const beforeSnap: Record<string, any> = {
        "Tên phiếu":     (existing as any).name,
        "Trạng thái":    existing.status === "completed" ? "Đã nhập kho" : "Nháp",
        "Tổng tiền":     String(existing.totalAmount ?? "0"),
        "Kho":           (auditOldWh[0] as any)?.name ?? null,
        "Nhà cung cấp":  (auditOldSup[0] as any)?.name ?? null,
        "Cơ sở":         (auditOldLoc[0] as any)?.name ?? null,
        "Chiết khấu":    `${existing.discount ?? 0} ${existing.discountType ?? "VND"}`,
        "Phụ thu":       `${existing.surcharge ?? 0} ${existing.surchargeType ?? "VND"}`,
        "Phiếu chi":     existing.hasInvoice ? "Có" : "Không",
        "Ghi chú":       (existing as any).note ?? null,
        "Số sản phẩm":   oldItems.length,
        "Tổng số lượng": oldItems.reduce((s, i) => s + i.quantity, 0),
      };

      if (existing.status === "completed" && existing.warehouseId) {
        // Build old qty map (aggregate by productId)
        const oldQtyMap: Record<string, { qty: number; name: string }> = {};
        for (const item of oldItems) {
          if (!item.productId) continue;
          if (!oldQtyMap[item.productId]) oldQtyMap[item.productId] = { qty: 0, name: item.productName };
          oldQtyMap[item.productId].qty += item.quantity;
        }

        // Build new qty map
        const newQtyMap: Record<string, number> = {};
        for (const item of items) {
          if (!item.productId) continue;
          newQtyMap[item.productId] = (newQtyMap[item.productId] || 0) + item.quantity;
        }

        // Validate: products with reduced qty must have enough inventory
        const errors: string[] = [];
        for (const [productId, { qty: oldQty, name }] of Object.entries(oldQtyMap)) {
          const newQty = newQtyMap[productId] || 0;
          const delta = newQty - oldQty;
          if (delta < 0) {
            const invRow = await db.execute(sql`
              SELECT GREATEST(0, COALESCE(SUM(quantity_delta), 0))::int AS quantity
              FROM store_stock_transactions
              WHERE product_id = ${productId} AND warehouse_id = ${existing.warehouseId}
            `);
            const currentStock = parseInt(String((invRow.rows[0] as any)?.quantity ?? 0));
            if (currentStock + delta < 0) {
              const usedQty = oldQty - currentStock;
              const minAllowed = usedQty;
              errors.push(`• ${name}: tồn hiện tại ${currentStock}, đã phát sinh ${usedQty} xuất/bán → số lượng nhập tối thiểu: ${minAllowed}`);
            }
          }
        }

        if (errors.length > 0) {
          return res.status(409).json({
            message: `Không thể giảm số lượng nhập do tồn kho không đủ:\n${errors.join("\n")}`,
          });
        }

        // Apply delta-based inventory updates (safe, no subtract-all + add-all)
        const allProductIds = new Set([...Object.keys(oldQtyMap), ...Object.keys(newQtyMap)]);
        const user = req.user as any;
        for (const productId of allProductIds) {
          const oldQty = oldQtyMap[productId]?.qty || 0;
          const newQty = newQtyMap[productId] || 0;
          const delta = newQty - oldQty;
          if (delta !== 0) {
            await db.execute(sql`
              INSERT INTO store_inventory (product_id, warehouse_id, quantity, updated_at)
              VALUES (${productId}, ${existing.warehouseId}, ${Math.max(0, delta)}, NOW())
              ON CONFLICT (product_id, warehouse_id)
              DO UPDATE SET quantity = GREATEST(0, store_inventory.quantity + ${delta}), updated_at = NOW()
            `);
            const productName = oldQtyMap[productId]?.name || items.find((i: any) => i.productId === productId)?.productName || productId;
            const existingCode = (existing as any).code || req.params.id;
            await logStockTransaction({
              productId,
              warehouseId: existing.warehouseId!,
              receiptId: req.params.id,
              receiptCode: existingCode,
              type: "edit_import",
              quantityDelta: delta,
              description: `Sửa ${existingCode}: Nhập cũ: ${oldQty} → Nhập mới: ${newQty}`,
              createdBy: user.id,
              createdByName: user.fullName || user.username,
            });
          }
        }
      } else if (existing.status === "draft" && receiptData.status === "completed" && receiptData.warehouseId) {
        // Draft → Completed: add all items to inventory
        await updateInventory(receiptData.warehouseId, items, "add");
        const user2 = req.user as any;
        for (const item of items) {
          if (!item.productId) continue;
          await logStockTransaction({
            productId: item.productId,
            warehouseId: receiptData.warehouseId,
            receiptId: req.params.id,
            receiptCode: (existing as any).code || req.params.id,
            type: "import",
            quantityDelta: item.quantity,
            createdBy: user2.id,
            createdByName: user2.fullName || user2.username,
          });
        }
      }

      // Save receipt metadata
      const updateData: any = {
        ...receiptData,
        discount: String(receiptData.discount),
        surcharge: String(receiptData.surcharge),
        totalAmount: String(receiptData.totalAmount),
        updatedAt: new Date(),
      };
      const [receipt] = await db.update(storeReceipts).set(updateData).where(eq(storeReceipts.id, req.params.id)).returning();

      // Replace items
      await db.delete(storeReceiptItems).where(eq(storeReceiptItems.receiptId, req.params.id));
      if (items.length > 0) {
        await db.insert(storeReceiptItems).values(items.map(item => ({
          receiptId: receipt.id,
          productId: item.productId || null,
          productCode: item.productCode,
          productName: item.productName,
          quantity: item.quantity,
          categoryId: item.categoryId || null,
          colorId: item.colorId || null,
          sizeId: item.sizeId || null,
          unitId: item.unitId || null,
          costPrice: String(item.costPrice),
          salePrice: String(item.salePrice),
        })));
      }

      // ── Audit: log sửa phiếu ─────────────────────────────────────────────
      try {
        const auditUser = req.user as any;
        const [auditNewWh, auditNewSup, auditNewLoc] = await Promise.all([
          receiptData.warehouseId
            ? db.select({ name: storeWarehouses.name }).from(storeWarehouses).where(eq(storeWarehouses.id, receiptData.warehouseId)).limit(1)
            : Promise.resolve([] as { name: string }[]),
          receiptData.supplierId
            ? db.select({ name: storeSuppliers.name }).from(storeSuppliers).where(eq(storeSuppliers.id, receiptData.supplierId)).limit(1)
            : Promise.resolve([] as { name: string }[]),
          receipt.locationId
            ? db.select({ name: locations.name }).from(locations).where(eq(locations.id, receipt.locationId)).limit(1)
            : Promise.resolve([] as { name: string }[]),
        ]);
        const afterSnap: Record<string, any> = {
          "Tên phiếu":     receipt.name,
          "Trạng thái":    receipt.status === "completed" ? "Đã nhập kho" : "Nháp",
          "Tổng tiền":     String(receipt.totalAmount ?? "0"),
          "Kho":           (auditNewWh[0] as any)?.name ?? null,
          "Nhà cung cấp":  (auditNewSup[0] as any)?.name ?? null,
          "Cơ sở":         (auditNewLoc[0] as any)?.name ?? null,
          "Chiết khấu":    `${receipt.discount ?? 0} ${receipt.discountType ?? "VND"}`,
          "Phụ thu":       `${receipt.surcharge ?? 0} ${receipt.surchargeType ?? "VND"}`,
          "Phiếu chi":     receipt.hasInvoice ? "Có" : "Không",
          "Ghi chú":       receipt.note ?? null,
          "Số sản phẩm":   items.length,
          "Tổng số lượng": items.reduce((s: number, i: any) => s + i.quantity, 0),
        };

        // ── Per-item diff ─────────────────────────────────────────────────────
        // Build maps keyed by productId (fall back to productCode for items without id)
        type ItemKey = string;
        const itemKey = (i: { productId?: string | null; productCode: string }) =>
          i.productId || `code:${i.productCode}`;
        const itemLabel = (i: { productName: string; productCode: string }) =>
          `📦 ${i.productName || i.productCode}`;

        const oldItemMap = new Map<ItemKey, { qty: number; cost: string; label: string }>();
        for (const oi of oldItems) {
          const k = itemKey(oi);
          const prev = oldItemMap.get(k);
          oldItemMap.set(k, {
            qty:   (prev?.qty ?? 0) + oi.quantity,
            cost:  String(oi.costPrice ?? "0"),
            label: itemLabel(oi),
          });
        }

        const newItemMap = new Map<ItemKey, { qty: number; cost: string; label: string }>();
        for (const ni of items) {
          const k = itemKey(ni);
          const prev = newItemMap.get(k);
          newItemMap.set(k, {
            qty:   (prev?.qty ?? 0) + ni.quantity,
            cost:  String(ni.costPrice ?? "0"),
            label: itemLabel(ni),
          });
        }

        const allKeys = new Set([...oldItemMap.keys(), ...newItemMap.keys()]);
        for (const k of allKeys) {
          const o = oldItemMap.get(k);
          const n = newItemMap.get(k);
          const label = o?.label ?? n?.label ?? k;
          const oldVal = o ? `SL: ${o.qty}, Giá: ${o.cost}` : null;
          const newVal = n ? `SL: ${n.qty}, Giá: ${n.cost}` : null;
          if (oldVal !== newVal) {
            beforeSnap[label] = oldVal;
            afterSnap[label]  = newVal;
          }
        }
        // ─────────────────────────────────────────────────────────────────────

        const oldDiff: Record<string, any> = {};
        const newDiff: Record<string, any> = {};
        for (const key of Object.keys(beforeSnap)) {
          if (String(beforeSnap[key] ?? "") !== String(afterSnap[key] ?? "")) {
            oldDiff[key] = beforeSnap[key];
            newDiff[key] = afterSnap[key];
          }
        }
        if (Object.keys(oldDiff).length > 0) {
          await createStoreReceiptAuditLog({
            receiptId:   req.params.id,
            receiptCode: receipt.code,
            action:      "edited",
            userId:      auditUser.id ?? null,
            userName:    auditUser.fullName || auditUser.username,
            locationId:  receipt.locationId ?? null,
            oldContent:  oldDiff,
            newContent:  newDiff,
          });
        }
      } catch (auditErr) {
        console.error("[Receipt] PATCH audit log error:", auditErr);
      }

      // Handle phiếu chi: delete old linked invoice then recreate if needed
      if (existing.hasInvoice || receiptData.hasInvoice) {
        await db.execute(sql`
          DELETE FROM invoices
          WHERE store_receipt_id = ${req.params.id}
        `);
        if (receiptData.hasInvoice && receiptData.supplierId && receiptData.status === "completed") {
          const user = req.user as any;
          await createReceiptInvoice({
            receiptId: receipt.id,
            receiptCode: receipt.code,
            supplierId: receiptData.supplierId,
            locationId: receiptData.locationId,
            invoiceNote: receiptData.invoiceNote,
            discount: receiptData.discount,
            discountType: receiptData.discountType,
            surcharge: receiptData.surcharge,
            surchargeType: receiptData.surchargeType,
            paidAmount: receiptData.paidAmount,
            items: items.map(i => ({ quantity: i.quantity, productName: i.productName, costPrice: i.costPrice })),
            createdBy: user.id,
            createdByName: user.fullName || user.username,
          });
        }
      }

      res.json(receipt);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ message: "Mã phiếu đã tồn tại" });
      console.error("[Receipt] PATCH error:", err);
      res.status(500).json({ message: "Lỗi khi cập nhật phiếu nhập kho" });
    }
  });

  // ── DELETE / CANCEL RECEIPT ────────────────────────────────────────────────
  app.delete("/api/store/receipts/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const [existing] = await db.select().from(storeReceipts).where(eq(storeReceipts.id, req.params.id));
      if (!existing) return res.status(404).json({ message: "Không tìm thấy phiếu" });

      if ((existing.status as string) === "cancelled") {
        return res.status(400).json({ message: "Phiếu đã bị hủy trước đó" });
      }

      // Draft → xóa vật lý, không ảnh hưởng tồn kho
      if (existing.status === "draft") {
        // Audit: snapshot toàn bộ phiếu trước khi xóa vật lý
        try {
          const draftItems = await db.select({
            productName: storeReceiptItems.productName,
            productCode: storeReceiptItems.productCode,
            quantity:    storeReceiptItems.quantity,
            costPrice:   storeReceiptItems.costPrice,
          }).from(storeReceiptItems).where(eq(storeReceiptItems.receiptId, req.params.id));
          const deleteUser = req.user as any;

          // Build per-product rows (aggregated by name+code)
          const itemSnap: Record<string, any> = {};
          const itemAggMap = new Map<string, { qty: number; cost: string }>();
          for (const di of draftItems) {
            const label = `📦 ${di.productName || di.productCode}`;
            const prev = itemAggMap.get(label);
            itemAggMap.set(label, {
              qty:  (prev?.qty ?? 0) + di.quantity,
              cost: String(di.costPrice ?? "0"),
            });
          }
          for (const [label, { qty, cost }] of itemAggMap) {
            itemSnap[label] = `SL: ${qty}, Giá: ${cost}`;
          }

          await createStoreReceiptAuditLog({
            receiptId:   req.params.id,
            receiptCode: (existing as any).code,
            action:      "deleted",
            userId:      deleteUser.id ?? null,
            userName:    deleteUser.fullName || deleteUser.username,
            locationId:  existing.locationId ?? null,
            oldContent: {
              "Tên phiếu":     (existing as any).name,
              "Trạng thái":    "Nháp",
              "Tổng tiền":     String(existing.totalAmount ?? "0"),
              "Ghi chú":       (existing as any).note ?? null,
              "Số sản phẩm":   draftItems.length,
              "Tổng số lượng": draftItems.reduce((s, i) => s + i.quantity, 0),
              ...itemSnap,
            },
            newContent: null,
          });
        } catch (auditErr) {
          console.error("[Receipt] DELETE audit log error:", auditErr);
        }
        await db.delete(storeReceipts).where(eq(storeReceipts.id, req.params.id));
        return res.json({ success: true, action: "deleted" });
      }

      // Completed → kiểm tra hóa đơn đã thanh toán chưa
      if (existing.status === "completed") {
        const linkedInvRow = await db.execute(sql`
          SELECT id, code, status FROM invoices WHERE store_receipt_id = ${req.params.id} LIMIT 1
        `);
        if (linkedInvRow.rows.length > 0) {
          const inv = linkedInvRow.rows[0] as any;
          if (inv.status === "paid" || inv.status === "partial") {
            const statusLabel = inv.status === "paid" ? "Đã thanh toán" : "Thanh toán một phần";
            return res.status(409).json({
              message: `Phiếu ${(existing as any).code} có hoá đơn ${inv.code} ${statusLabel}, vui lòng chuyển hoá đơn sang Trạng thái: Chưa thanh toán để thực hiện việc chỉnh sửa`,
              invoiceLocked: true,
              invoiceCode: inv.code,
              invoiceStatus: inv.status,
            });
          }
          // Hóa đơn chưa thanh toán → xóa hóa đơn
          await db.execute(sql`DELETE FROM invoices WHERE store_receipt_id = ${req.params.id}`);
        }

        // Kiểm tra từng sản phẩm: tồn hiện tại + (-số nhập) >= 0
        const oldItems = await db.select().from(storeReceiptItems).where(eq(storeReceiptItems.receiptId, req.params.id));
        const errors: string[] = [];
        for (const item of oldItems) {
          if (!item.productId) continue;
          const invRow = await db.execute(sql`
            SELECT GREATEST(0, COALESCE(SUM(quantity_delta), 0))::int AS quantity
            FROM store_stock_transactions
            WHERE product_id = ${item.productId} AND warehouse_id = ${existing.warehouseId}
          `);
          const currentStock = parseInt(String((invRow.rows[0] as any)?.quantity ?? 0));
          const delta = -item.quantity;
          if (currentStock + delta < 0) {
            const usedQty = item.quantity - currentStock;
            errors.push(`• ${item.productName}: tồn hiện tại ${currentStock}, số lượng nhập ${item.quantity}, đã phát sinh ${usedQty} xuất/bán`);
          }
        }

        if (errors.length > 0) {
          return res.status(409).json({
            message: `Không thể hủy phiếu nhập kho\n${errors.join("\n")}`,
          });
        }

        // Hoàn trả tồn kho (trừ số lượng đã nhập)
        if (existing.warehouseId && oldItems.length > 0) {
          await updateInventory(
            existing.warehouseId,
            oldItems.map(i => ({ productId: i.productId, quantity: i.quantity })),
            "subtract",
          );
          const cancelUser = req.user as any;
          for (const item of oldItems) {
            if (!item.productId) continue;
            await logStockTransaction({
              productId: item.productId,
              warehouseId: existing.warehouseId,
              receiptId: req.params.id,
              receiptCode: (existing as any).code || req.params.id,
              type: "cancel_import",
              quantityDelta: -item.quantity,
              status: "cancelled",
              description: `Hủy phiếu ${(existing as any).code || req.params.id}`,
              createdBy: cancelUser.id,
              createdByName: cancelUser.fullName || cancelUser.username,
            });
          }
        }

        // Đổi trạng thái → cancelled (không xóa vật lý)
        await db.execute(sql`
          UPDATE store_receipts
          SET status = 'cancelled', has_invoice = FALSE, updated_at = NOW()
          WHERE id = ${req.params.id}
        `);
        return res.json({ success: true, action: "cancelled" });
      }

      return res.status(400).json({ message: "Trạng thái phiếu không hợp lệ" });
    } catch (err) {
      console.error("[Receipt] DELETE error:", err);
      res.status(500).json({ message: "Lỗi khi xử lý phiếu nhập kho" });
    }
  });

  // ── SEARCH PRODUCTS WITH INVENTORY ────────────────────────────────────────
  app.get("/api/store/inventory/search", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { warehouseId, q } = req.query as { warehouseId?: string; q?: string };
      const search = q?.trim() ?? "";

      const rows = await db.execute(sql`
        SELECT
          p.id, p.code, p.name, p.category_id, p.unit_id, p.supplier_id,
          p.cost_price, p.sale_price, p.has_variants, p.status,
          COALESCE(inv.quantity, 0) AS stock
        FROM store_products p
        LEFT JOIN store_inventory inv
          ON inv.product_id = p.id
          AND inv.warehouse_id = ${warehouseId ?? null}
        WHERE p.status = 'active'
          AND (
            ${search} = ''
            OR LOWER(p.name) LIKE ${'%' + search.toLowerCase() + '%'}
            OR LOWER(p.code) LIKE ${'%' + search.toLowerCase() + '%'}
          )
        ORDER BY p.name
        LIMIT 50
      `);
      res.json(rows.rows);
    } catch (err) {
      console.error("[Receipt] inventory search error:", err);
      res.status(500).json({ message: "Lỗi khi tìm sản phẩm" });
    }
  });
}
