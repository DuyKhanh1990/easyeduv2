import type { Express } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { logStockTransaction } from "./store-inventory.routes";
import { createStoreIssueReceiptAuditLog } from "../storage/store-issue-receipt-audit-log.storage";
import {
  invoices,
  invoiceItems,
  invoicePaymentSchedule,
} from "@shared/schema";
import { z } from "zod";

async function ensureIssueReceiptTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS store_issue_receipts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(50) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
      warehouse_id UUID REFERENCES store_warehouses(id) ON DELETE SET NULL,
      date DATE NOT NULL,
      recipient_name VARCHAR(255),
      note TEXT,
      discount DECIMAL(15,2) DEFAULT 0,
      discount_type VARCHAR(10) DEFAULT 'VND',
      surcharge DECIMAL(15,2) DEFAULT 0,
      surcharge_type VARCHAR(10) DEFAULT 'VND',
      has_invoice BOOLEAN DEFAULT FALSE,
      invoice_note TEXT,
      paid_amount DECIMAL(15,2) DEFAULT 0,
      status VARCHAR(50) NOT NULL DEFAULT 'completed',
      total_amount DECIMAL(15,2) DEFAULT 0,
      created_by UUID,
      created_by_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS store_issue_receipt_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      receipt_id UUID NOT NULL REFERENCES store_issue_receipts(id) ON DELETE CASCADE,
      product_id UUID REFERENCES store_products(id) ON DELETE SET NULL,
      product_code VARCHAR(100) NOT NULL,
      product_name VARCHAR(255) NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_id UUID,
      unit_name VARCHAR(100),
      sale_price DECIMAL(15,2) DEFAULT 0,
      stock_before INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS store_issue_receipt_id UUID
  `);
  // Ensure "Kho" income transaction category exists (used by auto-generated invoices from xuất kho)
  await db.execute(sql`
    INSERT INTO finance_transaction_categories (name, type, is_default, is_active)
    SELECT 'Kho', 'income', false, true
    WHERE NOT EXISTS (
      SELECT 1 FROM finance_transaction_categories WHERE name = 'Kho' AND type = 'income'
    )
  `);
  await db.execute(sql`ALTER TABLE store_issue_receipt_items ADD COLUMN IF NOT EXISTS price_type VARCHAR(10) DEFAULT 'money'`);
  await db.execute(sql`ALTER TABLE store_issue_receipt_items ADD COLUMN IF NOT EXISTS star_price INTEGER DEFAULT 0`);
  await db.execute(sql`ALTER TABLE store_issue_receipt_items ADD COLUMN IF NOT EXISTS total_stars INTEGER DEFAULT 0`);
  await db.execute(sql`ALTER TABLE store_issue_receipts ADD COLUMN IF NOT EXISTS recipient_id UUID`);
  await db.execute(sql`ALTER TABLE store_issue_receipts ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS student_star_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID NOT NULL,
      delta INTEGER NOT NULL,
      reason TEXT,
      receipt_id UUID,
      receipt_code VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  console.log("[Store] Issue receipt tables ensured");
}

const issueItemSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  productCode: z.string().min(1),
  productName: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
  unitId: z.string().uuid().optional().nullable(),
  unitName: z.string().optional().nullable(),
  salePrice: z.number().min(0).default(0),
  stockBefore: z.number().int().min(0).default(0),
  priceType: z.enum(["money", "star"]).default("money"),
  starPrice: z.number().int().min(0).default(0),
  totalStars: z.number().int().min(0).default(0),
});

const issueCreateSchema = z.object({
  code: z.string().min(1, "Mã phiếu không được để trống"),
  name: z.string().min(1, "Tên phiếu không được để trống"),
  locationId: z.string().uuid().optional().nullable(),
  warehouseId: z.string().uuid().optional().nullable(),
  date: z.string().min(1, "Ngày xuất không được để trống"),
  recipientName: z.string().optional().nullable(),
  recipientId: z.string().uuid().optional().nullable(),
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
  sessionId: z.string().optional().nullable(),
  items: z.array(issueItemSchema).default([]),
});

async function getStudentStarBalance(studentId: string): Promise<{ earned: number; spent: number; available: number }> {
  const earnedRow = await db.execute(sql`
    SELECT COALESCE(SUM((rating_val)::numeric), 0)::int AS total_earned
    FROM student_sessions ss,
         jsonb_each(ss.review_data) AS teacher_entry(teacher_key, teacher_data),
         jsonb_each(teacher_data->'criteriaRatings') AS rating_entry(criteria_key, rating_val)
    WHERE ss.student_id = ${studentId}
      AND ss.review_data IS NOT NULL
      AND jsonb_typeof(ss.review_data) = 'object'
      AND (rating_val)::text ~ '^[0-9]+(\.[0-9]+)?$'
  `);
  const earned = Number((earnedRow.rows[0] as any)?.total_earned ?? 0);

  const spentRow = await db.execute(sql`
    SELECT COALESCE(SUM(ABS(delta)), 0)::int AS total_spent
    FROM student_star_transactions
    WHERE student_id = ${studentId} AND delta < 0
  `);
  const spent = Number((spentRow.rows[0] as any)?.total_spent ?? 0);
  return { earned, spent, available: Math.max(0, earned - spent) };
}

async function deductStudentStars(studentId: string, stars: number, receiptId: string, receiptCode: string) {
  await db.execute(sql`
    INSERT INTO student_star_transactions (student_id, delta, reason, receipt_id, receipt_code)
    VALUES (${studentId}, ${-stars}, ${'Xuất kho ' + receiptCode}, ${receiptId}, ${receiptCode})
  `);
}

async function refundStudentStars(studentId: string, stars: number, receiptId: string, receiptCode: string) {
  await db.execute(sql`
    INSERT INTO student_star_transactions (student_id, delta, reason, receipt_id, receipt_code)
    VALUES (${studentId}, ${stars}, ${'Hoàn sao hủy phiếu ' + receiptCode}, ${receiptId}, ${receiptCode})
  `);
}

async function validateAndDecreaseInventory(
  warehouseId: string,
  items: { productId?: string | null; quantity: number; productName: string }[],
  sessionId?: string | null,
  receiptId?: string | null,
): Promise<string[]> {
  const errors: string[] = [];
  const sid = sessionId && sessionId.trim() ? sessionId.trim() : "__none__";
  const rid = receiptId && receiptId.trim() ? receiptId.trim() : null;
  for (const item of items) {
    if (!item.productId) continue;
    const invRow = await db.execute(sql`
      SELECT GREATEST(0,
        COALESCE((
          SELECT SUM(t.quantity_delta)
          FROM store_stock_transactions t
          WHERE t.product_id = ${item.productId} AND t.warehouse_id = ${warehouseId}
        ), 0)
        - COALESCE((
          SELECT SUM(r.quantity)
          FROM store_inventory_reservations r
          WHERE r.product_id = ${item.productId}
            AND r.warehouse_id = ${warehouseId}
            AND r.expires_at > NOW()
            AND r.session_id != ${sid}
        ), 0)
        - COALESCE((
          SELECT SUM(ii.quantity)
          FROM store_issue_receipt_items ii
          JOIN store_issue_receipts ir ON ir.id = ii.receipt_id
          WHERE ii.product_id = ${item.productId}
            AND ir.warehouse_id = ${warehouseId}
            AND ir.status = 'draft'
            ${rid ? sql`AND ir.id != ${rid}::uuid` : sql``}
        ), 0)
      ) AS available
    `);
    const row = invRow.rows[0] as any;
    const available = parseInt(String(row?.available ?? 0));
    if (available < item.quantity) {
      errors.push(`• ${item.productName}: khả dụng ${available}, yêu cầu xuất ${item.quantity}`);
    }
  }
  return errors;
}

async function decreaseInventory(
  warehouseId: string,
  items: { productId?: string | null; quantity: number }[],
) {
  for (const item of items) {
    if (!item.productId) continue;
    await db.execute(sql`
      INSERT INTO store_inventory (product_id, warehouse_id, quantity, updated_at)
      VALUES (${item.productId}, ${warehouseId}, 0, NOW())
      ON CONFLICT (product_id, warehouse_id)
      DO UPDATE SET quantity = GREATEST(0, store_inventory.quantity - ${item.quantity}), updated_at = NOW()
    `);
  }
}

async function increaseInventory(
  warehouseId: string,
  items: { productId?: string | null; quantity: number }[],
) {
  for (const item of items) {
    if (!item.productId) continue;
    await db.execute(sql`
      INSERT INTO store_inventory (product_id, warehouse_id, quantity, updated_at)
      VALUES (${item.productId}, ${warehouseId}, ${item.quantity}, NOW())
      ON CONFLICT (product_id, warehouse_id)
      DO UPDATE SET quantity = store_inventory.quantity + ${item.quantity}, updated_at = NOW()
    `);
  }
}

async function createIssueInvoice(params: {
  receiptId: string;
  receiptCode: string;
  recipientName: string | null | undefined;
  recipientId: string | null | undefined;
  locationId: string | null | undefined;
  invoiceNote: string | null | undefined;
  discount: number;
  discountType: "VND" | "%";
  surcharge: number;
  surchargeType: "VND" | "%";
  paidAmount: number;
  items: { quantity: number; productName: string; salePrice: number }[];
  createdBy: string | null | undefined;
  createdByName: string | null | undefined;
}) {
  const subjectName = params.recipientName?.trim() || "Người nhận hàng";
  const num = parseInt(params.receiptCode.replace("PXK-", "")) || 0;
  const numStr = num ? String(num).padStart(2, "0") : "01";
  const itemListStr = params.items
    .map(i => `${i.productName} SL:${i.quantity}`)
    .join("; ");
  const autoDescription = `Hoá đơn Phiếu xuất kho số ${numStr} bao gồm: ${itemListStr}`;
  const description = params.invoiceNote?.trim()
    ? params.invoiceNote.trim()
    : autoDescription;

  const subtotal = params.items.reduce((s, i) => s + i.quantity * i.salePrice, 0);
  const discountAmt = params.discountType === "VND" ? params.discount : subtotal * params.discount / 100;
  const surchargeAmt = params.surchargeType === "VND" ? params.surcharge : subtotal * params.surcharge / 100;
  const grandTotal = Math.max(0, subtotal - discountAmt + surchargeAmt);

  const paid = Math.min(params.paidAmount, grandTotal);
  const remaining = Math.max(0, grandTotal - paid);
  const invStatus = remaining <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid";

  const nextCodeRow = await db.execute(sql`
    SELECT MAX(CAST(SUBSTRING(code FROM 3) AS INTEGER)) as max_num
    FROM invoices WHERE code ~ '^PT[0-9]+$'
  `);
  const maxNum = (nextCodeRow.rows[0] as any)?.max_num ?? 0;
  const nextCode = `PT${String((parseInt(String(maxNum)) || 0) + 1).padStart(2, "0")}`;

  const [inv] = await db.insert(invoices).values({
    code: nextCode,
    type: "Thu",
    locationId: params.locationId ?? null,
    studentId: params.recipientId ?? null,
    subjectName,
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
        unitPrice: String(item.salePrice),
        quantity: item.quantity,
        promotionKeys: [],
        surchargeKeys: [],
        promotionAmount: "0",
        surchargeAmount: "0",
        subtotal: String(item.quantity * item.salePrice),
        category: "Kho",
        sortOrder: idx,
      }))
    );
  }

  await db.execute(sql`
    UPDATE invoices SET store_issue_receipt_id = ${params.receiptId} WHERE id = ${inv.id}
  `);

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

export async function createIssueReceiptsForInvoice(params: {
  invoiceId: string;
  invoiceCode: string;
  locationId: string | null | undefined;
  userId: string | null | undefined;
  userName: string | null | undefined;
  recipientName?: string | null;
  items: Array<{
    storeProductId: string;
    storeProductCode: string;
    productName: string;
    warehouseId: string;
    quantity: number;
    salePrice: number;
    unitId?: string | null;
    unitName?: string | null;
  }>;
}): Promise<string[]> {
  const byWarehouse = new Map<string, typeof params.items>();
  for (const item of params.items) {
    if (!byWarehouse.has(item.warehouseId)) byWarehouse.set(item.warehouseId, []);
    byWarehouse.get(item.warehouseId)!.push(item);
  }

  const receiptIds: string[] = [];

  for (const [warehouseId, warehouseItems] of byWarehouse) {
    const errors = await validateAndDecreaseInventory(
      warehouseId,
      warehouseItems.map(i => ({ productId: i.storeProductId, quantity: i.quantity, productName: i.productName })),
    );
    if (errors.length > 0) {
      throw new Error("Không đủ tồn kho:\n" + errors.join("\n"));
    }

    const nextCodeRow = await db.execute(sql`
      SELECT MAX(CAST(SUBSTRING(code FROM 5) AS INTEGER)) AS max_num
      FROM store_issue_receipts WHERE code ~ '^PXK-[0-9]+$'
    `);
    const maxNum = (nextCodeRow.rows[0] as any)?.max_num ?? 0;
    const code = `PXK-${String((parseInt(String(maxNum)) || 0) + 1).padStart(2, "0")}`;

    const totalAmount = warehouseItems.reduce((s, i) => s + i.quantity * i.salePrice, 0);

    const receiptResult = await db.execute(sql`
      INSERT INTO store_issue_receipts (
        code, name, location_id, warehouse_id, date,
        invoice_id, status, total_amount, created_by, created_by_name,
        recipient_name, has_invoice
      ) VALUES (
        ${code},
        ${"Xuất kho " + params.invoiceCode},
        ${params.locationId ?? null},
        ${warehouseId},
        CURRENT_DATE,
        ${params.invoiceId},
        'completed',
        ${totalAmount},
        ${params.userId ?? null},
        ${params.userName ?? null},
        ${params.recipientName ?? null},
        true
      )
      RETURNING id
    `);
    const receiptId = (receiptResult.rows[0] as any).id as string;

    for (const item of warehouseItems) {
      const stockRow = await db.execute(sql`
        SELECT COALESCE(SUM(quantity_delta), 0)::int AS stock
        FROM store_stock_transactions
        WHERE product_id = ${item.storeProductId} AND warehouse_id = ${warehouseId}
      `);
      const stockBefore = Number((stockRow.rows[0] as any)?.stock ?? 0);

      await db.execute(sql`
        INSERT INTO store_issue_receipt_items (
          receipt_id, product_id, product_code, product_name,
          quantity, unit_id, unit_name, sale_price, stock_before
        ) VALUES (
          ${receiptId}, ${item.storeProductId}, ${item.storeProductCode},
          ${item.productName}, ${item.quantity},
          ${item.unitId ?? null}, ${item.unitName ?? null},
          ${item.salePrice}, ${stockBefore}
        )
      `);

      await logStockTransaction({
        productId: item.storeProductId,
        warehouseId,
        receiptId,
        receiptCode: code,
        type: "export",
        quantityDelta: -item.quantity,
        status: "completed",
        description: `Xuất kho phiếu thu ${params.invoiceCode}`,
        createdBy: params.userId ?? null,
        createdByName: params.userName ?? null,
      });
    }

    receiptIds.push(receiptId);
  }

  return receiptIds;
}

export async function cancelIssueReceiptForInvoice(receiptId: string, userId: string | null | undefined, userName: string | null | undefined): Promise<void> {
  const existingRow = await db.execute(sql`SELECT * FROM store_issue_receipts WHERE id = ${receiptId}`);
  const existing = existingRow.rows[0] as any;
  if (!existing || existing.status === "cancelled") return;

  const itemsRow = await db.execute(sql`SELECT * FROM store_issue_receipt_items WHERE receipt_id = ${receiptId}`);
  const items = itemsRow.rows as any[];

  if (existing.warehouse_id && items.length > 0) {
    await increaseInventory(
      existing.warehouse_id,
      items.map(i => ({ productId: i.product_id, quantity: i.quantity })),
    );
    for (const item of items) {
      if (!item.product_id) continue;
      await logStockTransaction({
        productId: item.product_id,
        warehouseId: existing.warehouse_id,
        receiptId,
        receiptCode: existing.code || receiptId,
        type: "cancel_export",
        quantityDelta: item.quantity,
        status: "cancelled",
        description: `Hủy phiếu ${existing.code || receiptId} khi xóa phiếu thu`,
        createdBy: userId ?? null,
        createdByName: userName ?? null,
      });
    }
  }

  await db.execute(sql`
    UPDATE store_issue_receipts
    SET status = 'cancelled', has_invoice = FALSE, updated_at = NOW()
    WHERE id = ${receiptId}
  `);
}

export async function registerStoreIssueReceiptRoutes(app: Express) {
  await ensureIssueReceiptTables();

  // ── STAR BALANCE ───────────────────────────────────────────────────────────
  app.get("/api/students/:id/star-balance", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const balance = await getStudentStarBalance(req.params.id);
      res.json(balance);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  // ── NEXT CODE ──────────────────────────────────────────────────────────────
  app.get("/api/store/issue-receipts/next-code", async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT MAX(CAST(SUBSTRING(code FROM 5) AS INTEGER)) as max_num
        FROM store_issue_receipts
        WHERE code ~ '^PXK-[0-9]+$'
      `);
      const maxNum = (result.rows[0] as any)?.max_num ?? 0;
      const nextNum = (parseInt(String(maxNum)) || 0) + 1;
      const nextCode = `PXK-${String(nextNum).padStart(2, "0")}`;
      res.json({ code: nextCode, num: nextNum });
    } catch (err) {
      console.error("[IssueReceipt] next-code error:", err);
      res.json({ code: "PXK-01", num: 1 });
    }
  });

  // ── LIST ───────────────────────────────────────────────────────────────────
  app.get("/api/store/issue-receipts", async (req, res) => {
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
          r.recipient_name, r.paid_amount,
          r.created_by, r.created_by_name, r.created_at,
          r.location_id, r.warehouse_id,
          l.name AS location_name,
          w.name AS warehouse_name,
          COUNT(DISTINCT i.id)::int AS item_count,
          COALESCE(SUM(i.quantity), 0)::int AS total_quantity
        FROM store_issue_receipts r
        LEFT JOIN locations l ON l.id = r.location_id
        LEFT JOIN store_warehouses w ON w.id = r.warehouse_id
        LEFT JOIN store_issue_receipt_items i ON i.receipt_id = r.id
        WHERE TRUE ${locationFilter}
        GROUP BY r.id, l.name, w.name
        ORDER BY r.created_at DESC
      `);
      res.json(rows.rows);
    } catch (err) {
      console.error("[IssueReceipt] GET list error:", err);
      res.status(500).json({ message: "Lỗi khi lấy danh sách phiếu xuất kho" });
    }
  });

  // ── HISTORY ────────────────────────────────────────────────────────────────
  app.get("/api/store/issue-receipts/history", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const { allowedLocationIds, isSuperAdmin } = req;
    const { dateFrom, dateTo, locationId, limit = "100", offset = "0" } = req.query as Record<string, string>;

    const locFilter = (() => {
      if (locationId && locationId !== "__all__") return `AND r.location_id = '${locationId}'`;
      if (!isSuperAdmin && allowedLocationIds?.length) {
        return `AND (r.location_id IS NULL OR r.location_id = ANY(ARRAY[${allowedLocationIds.map((id: string) => `'${id}'`).join(",")}]::uuid[]))`;
      }
      return "";
    })();
    const userLocFilter = ""; // merged into locFilter above
    const auditLocFilter = (() => {
      if (locationId && locationId !== "__all__") return `AND ral.location_id = '${locationId}'::uuid`;
      if (!isSuperAdmin && allowedLocationIds?.length) {
        return `AND (ral.location_id IS NULL OR ral.location_id = ANY(ARRAY[${allowedLocationIds.map((id: string) => `'${id}'`).join(",")}]::uuid[]))`;
      }
      return "";
    })();
    const dateFilter = (() => {
      const parts: string[] = [];
      if (dateFrom) parts.push(`base.ev_time >= '${dateFrom}'::date`);
      if (dateTo)   parts.push(`base.ev_time <  ('${dateTo}'::date + INTERVAL '1 day')`);
      return parts.length ? "AND " + parts.join(" AND ") : "";
    })();

    try {
      const baseUnion = `
          -- created
          SELECT
            'created'::text                           AS ev_type,
            r.created_at                              AS ev_time,
            r.id::text                                AS receipt_id,
            r.code                                    AS receipt_code,
            r.name                                    AS receipt_name,
            r.status,
            r.total_amount::text                      AS total_amount,
            r.note,
            w.name                                    AS warehouse_name,
            r.recipient_name                          AS supplier_name,
            l.name                                    AS location_name,
            r.created_by_name,
            NULL::text                                AS old_content_json,
            NULL::text                                AS new_content_json
          FROM store_issue_receipts r
          LEFT JOIN store_warehouses w ON w.id = r.warehouse_id
          LEFT JOIN locations l ON l.id = r.location_id
          WHERE 1=1 ${locFilter}

          UNION ALL

          -- completed (phiếu đã xuất kho)
          SELECT
            'completed'::text,
            r.updated_at,
            r.id::text, r.code, r.name, r.status,
            r.total_amount::text, r.note,
            w.name, r.recipient_name, l.name, r.created_by_name,
            NULL::text, NULL::text
          FROM store_issue_receipts r
          LEFT JOIN store_warehouses w ON w.id = r.warehouse_id
          LEFT JOIN locations l ON l.id = r.location_id
          WHERE r.status = 'completed'
            AND r.updated_at IS DISTINCT FROM r.created_at
            ${locFilter}

          UNION ALL

          -- cancelled
          SELECT
            'cancelled'::text,
            r.updated_at,
            r.id::text, r.code, r.name, r.status,
            r.total_amount::text, r.note,
            w.name, r.recipient_name, l.name, r.created_by_name,
            NULL::text, NULL::text
          FROM store_issue_receipts r
          LEFT JOIN store_warehouses w ON w.id = r.warehouse_id
          LEFT JOIN locations l ON l.id = r.location_id
          WHERE r.status = 'cancelled'
            AND r.updated_at IS DISTINCT FROM r.created_at
            ${locFilter}

          UNION ALL

          -- edited
          SELECT
            'edited'::text,
            ral.created_at,
            ral.receipt_id,
            ral.receipt_code,
            COALESCE(r.name, ral.receipt_code)        AS receipt_name,
            COALESCE(r.status, 'unknown')             AS status,
            COALESCE(r.total_amount::text, '0')       AS total_amount,
            r.note,
            w.name                                    AS warehouse_name,
            r.recipient_name                          AS supplier_name,
            COALESCE(l.name, l2.name)                 AS location_name,
            ral.user_name                             AS created_by_name,
            ral.old_content::text                     AS old_content_json,
            ral.new_content::text                     AS new_content_json
          FROM store_issue_receipt_audit_logs ral
          LEFT JOIN store_issue_receipts r  ON r.id::text = ral.receipt_id
          LEFT JOIN store_warehouses w      ON w.id = r.warehouse_id
          LEFT JOIN locations l             ON l.id = r.location_id
          LEFT JOIN locations l2            ON l2.id = ral.location_id
          WHERE ral.action = 'edited'
            ${auditLocFilter}

          UNION ALL

          -- deleted
          SELECT
            'deleted'::text,
            ral.created_at,
            ral.receipt_id,
            ral.receipt_code,
            COALESCE(ral.old_content->>'Tên phiếu', ral.receipt_code),
            'deleted'                                 AS status,
            COALESCE(ral.old_content->>'Tổng tiền', '0'),
            ral.old_content->>'Ghi chú',
            ral.old_content->>'Kho',
            ral.old_content->>'Người nhận',
            l.name                                    AS location_name,
            ral.user_name                             AS created_by_name,
            ral.old_content::text                     AS old_content_json,
            NULL::text                                AS new_content_json
          FROM store_issue_receipt_audit_logs ral
          LEFT JOIN locations l ON l.id = ral.location_id
          WHERE ral.action = 'deleted'
            ${auditLocFilter}
      `;

      const dateWhere = dateFilter ? `WHERE ${dateFilter.replace(/^AND /, "")}` : "";

      const query = `
        SELECT * FROM (${baseUnion}) base
        ${dateWhere}
        ORDER BY ev_time DESC
        LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
      `;

      const countQuery = `
        SELECT COUNT(*) AS total FROM (${baseUnion}) base
        ${dateWhere}
      `;

      const [rows, countRows] = await Promise.all([
        db.execute(sql.raw(query)),
        db.execute(sql.raw(countQuery)),
      ]);

      res.json({
        events: rows.rows,
        total: parseInt(String((countRows.rows[0] as any)?.total ?? 0)),
      });
    } catch (err) {
      console.error("[IssueReceipt] history error:", err);
      res.status(500).json({ message: "Lỗi khi lấy lịch sử phiếu xuất kho" });
    }
  });

  // ── GET DETAIL ─────────────────────────────────────────────────────────────
  app.get("/api/store/issue-receipts/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const receiptResult = await db.execute(sql`
        SELECT r.*, l.name AS location_name, w.name AS warehouse_name
        FROM store_issue_receipts r
        LEFT JOIN locations l ON l.id = r.location_id
        LEFT JOIN store_warehouses w ON w.id = r.warehouse_id
        WHERE r.id = ${req.params.id}
      `);
      const receipt = receiptResult.rows[0];
      if (!receipt) return res.status(404).json({ message: "Không tìm thấy phiếu" });

      const items = await db.execute(sql`
        SELECT i.*, sp.code AS product_code_ref, u.name AS unit_name_ref,
          COALESCE(inv.quantity, 0) AS current_stock
        FROM store_issue_receipt_items i
        LEFT JOIN store_products sp ON sp.id = i.product_id
        LEFT JOIN store_units u ON u.id = i.unit_id
        LEFT JOIN store_inventory inv ON inv.product_id = i.product_id
          AND inv.warehouse_id = (SELECT warehouse_id FROM store_issue_receipts WHERE id = ${req.params.id})
        WHERE i.receipt_id = ${req.params.id}
        ORDER BY i.created_at
      `);

      const r = receipt as any;
      res.json({
        id: r.id,
        code: r.code,
        name: r.name,
        locationId: r.location_id,
        warehouseId: r.warehouse_id,
        date: r.date,
        recipientName: r.recipient_name,
        note: r.note,
        discount: r.discount,
        discountType: r.discount_type,
        surcharge: r.surcharge,
        surchargeType: r.surcharge_type,
        hasInvoice: r.has_invoice,
        invoiceNote: r.invoice_note,
        paidAmount: r.paid_amount,
        status: r.status,
        totalAmount: r.total_amount,
        createdByName: r.created_by_name,
        items: (items.rows as any[]).map(i => ({
          id: i.id,
          productId: i.product_id,
          productCode: i.product_code,
          productName: i.product_name,
          quantity: i.quantity,
          unitId: i.unit_id,
          unitName: i.unit_name || i.unit_name_ref,
          salePrice: i.sale_price,
          stockBefore: i.stock_before,
          currentStock: i.current_stock,
          priceType: i.price_type ?? "money",
          starPrice: i.star_price ?? 0,
          totalStars: i.total_stars ?? 0,
        })),
      });
    } catch (err) {
      console.error("[IssueReceipt] GET detail error:", err);
      res.status(500).json({ message: "Lỗi khi lấy chi tiết phiếu" });
    }
  });

  // ── CREATE ─────────────────────────────────────────────────────────────────
  app.post("/api/store/issue-receipts", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const user = req.user as any;
    try {
      const parsed = issueCreateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const { items, sessionId, ...receiptData } = parsed.data;

      if (receiptData.status === "completed" && receiptData.warehouseId && items.length > 0) {
        const errors = await validateAndDecreaseInventory(receiptData.warehouseId, items, sessionId);
        if (errors.length > 0) {
          return res.status(409).json({
            message: `Tồn kho không đủ để xuất:\n${errors.join("\n")}`,
          });
        }
      }

      // Validate star balance if there are star-priced items and a recipient student
      if (receiptData.status === "completed" && receiptData.recipientId) {
        const totalStarsNeeded = items
          .filter(i => i.priceType === "star")
          .reduce((sum, i) => sum + i.quantity * (i.starPrice ?? 0), 0);
        if (totalStarsNeeded > 0) {
          const balance = await getStudentStarBalance(receiptData.recipientId);
          if (balance.available < totalStarsNeeded) {
            return res.status(409).json({
              message: `Học viên không đủ sao. Cần ${totalStarsNeeded} sao, hiện có ${balance.available} sao.`,
              starInsufficient: true,
              required: totalStarsNeeded,
              available: balance.available,
            });
          }
        }
      }

      const insertResult = await db.execute(sql`
        INSERT INTO store_issue_receipts (
          code, name, location_id, warehouse_id, date, recipient_name, recipient_id, note,
          discount, discount_type, surcharge, surcharge_type,
          has_invoice, invoice_note, paid_amount, status, total_amount,
          created_by, created_by_name
        ) VALUES (
          ${receiptData.code}, ${receiptData.name},
          ${receiptData.locationId ?? null}, ${receiptData.warehouseId ?? null},
          ${receiptData.date}, ${receiptData.recipientName ?? null}, ${receiptData.recipientId ?? null},
          ${receiptData.note ?? null},
          ${receiptData.discount}, ${receiptData.discountType},
          ${receiptData.surcharge}, ${receiptData.surchargeType},
          ${receiptData.hasInvoice}, ${receiptData.invoiceNote ?? null},
          ${receiptData.paidAmount}, ${receiptData.status}, ${receiptData.totalAmount},
          ${user.id}, ${user.fullName || user.username}
        ) RETURNING *
      `);

      const r = insertResult.rows[0] as any;

      if (items.length > 0) {
        for (const item of items) {
          await db.execute(sql`
            INSERT INTO store_issue_receipt_items (
              receipt_id, product_id, product_code, product_name,
              quantity, unit_id, unit_name, sale_price, stock_before,
              price_type, star_price, total_stars
            ) VALUES (
              ${r.id}, ${item.productId ?? null}, ${item.productCode}, ${item.productName},
              ${item.quantity}, ${item.unitId ?? null}, ${item.unitName ?? null},
              ${item.salePrice}, ${item.stockBefore},
              ${item.priceType ?? "money"}, ${item.starPrice ?? 0},
              ${item.priceType === "star" ? item.quantity * (item.starPrice ?? 0) : 0}
            )
          `);
        }
      }

      if (receiptData.status === "completed" && receiptData.warehouseId && items.length > 0) {
        await decreaseInventory(receiptData.warehouseId, items);
        for (const item of items) {
          if (!item.productId) continue;
          await logStockTransaction({
            productId: item.productId,
            warehouseId: receiptData.warehouseId,
            receiptId: r.id,
            receiptCode: r.code,
            type: "export",
            quantityDelta: -item.quantity,
            createdBy: user.id,
            createdByName: user.fullName || user.username,
          });
        }
      }

      // Deduct stars from student if applicable
      if (receiptData.status === "completed" && receiptData.recipientId) {
        const totalStarsNeeded = items
          .filter(i => i.priceType === "star")
          .reduce((sum, i) => sum + i.quantity * (i.starPrice ?? 0), 0);
        if (totalStarsNeeded > 0) {
          await deductStudentStars(receiptData.recipientId, totalStarsNeeded, r.id, r.code);
        }
      }

      // Release session reservations after successful save
      if (sessionId) {
        try {
          await db.execute(sql`
            DELETE FROM store_inventory_reservations WHERE session_id = ${sessionId}
          `);
        } catch (_) {}
      }

      if (receiptData.hasInvoice && receiptData.status === "completed") {
        await createIssueInvoice({
          receiptId: r.id,
          receiptCode: r.code,
          recipientName: receiptData.recipientName,
          recipientId: receiptData.recipientId ?? null,
          locationId: receiptData.locationId,
          invoiceNote: receiptData.invoiceNote,
          discount: receiptData.discount,
          discountType: receiptData.discountType,
          surcharge: receiptData.surcharge,
          surchargeType: receiptData.surchargeType,
          paidAmount: receiptData.paidAmount,
          items: items.map(i => ({ quantity: i.quantity, productName: i.productName, salePrice: i.priceType === "star" ? 0 : i.salePrice })),
          createdBy: user.id,
          createdByName: user.fullName || user.username,
        });

        await db.execute(sql`
          UPDATE store_issue_receipts SET has_invoice = TRUE WHERE id = ${r.id}
        `);
      }

      res.status(201).json(r);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ message: "Mã phiếu đã tồn tại" });
      console.error("[IssueReceipt] POST error:", err);
      res.status(500).json({ message: "Lỗi khi tạo phiếu xuất kho" });
    }
  });

  // ── UPDATE ─────────────────────────────────────────────────────────────────
  app.patch("/api/store/issue-receipts/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const user = req.user as any;
    try {
      const parsed = issueCreateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const { items, ...receiptData } = parsed.data;

      const existingRow = await db.execute(sql`
        SELECT * FROM store_issue_receipts WHERE id = ${req.params.id}
      `);
      const existing = existingRow.rows[0] as any;
      if (!existing) return res.status(404).json({ message: "Không tìm thấy phiếu" });

      if (existing.status === "cancelled") {
        return res.status(400).json({ message: "Không thể sửa phiếu đã bị hủy" });
      }

      // Kiểm tra hóa đơn liên kết có đang ở trạng thái đã/một phần thanh toán không
      const linkedInvCheck = await db.execute(sql`
        SELECT id, code, status FROM invoices WHERE store_issue_receipt_id = ${req.params.id} LIMIT 1
      `);
      if (linkedInvCheck.rows.length > 0) {
        const inv = linkedInvCheck.rows[0] as any;
        if (inv.status === "paid" || inv.status === "partial") {
          const statusLabel = inv.status === "paid" ? "Đã thanh toán" : "Thanh toán một phần";
          return res.status(409).json({
            message: `Phiếu ${existing.code} có hoá đơn ${inv.code} ${statusLabel}, vui lòng chuyển hoá đơn sang Trạng thái: Chưa thanh toán để thực hiện việc chỉnh sửa`,
            invoiceLocked: true,
            invoiceCode: inv.code,
            invoiceStatus: inv.status,
          });
        }
      }

      const oldItemsRow = await db.execute(sql`
        SELECT * FROM store_issue_receipt_items WHERE receipt_id = ${req.params.id}
      `);
      const oldItems = oldItemsRow.rows as any[];

      // ── Audit: snapshot before edit ───────────────────────────────────────
      const [auditOldWh, auditOldLoc] = await Promise.all([
        existing.warehouse_id
          ? db.execute(sql`SELECT name FROM store_warehouses WHERE id = ${existing.warehouse_id} LIMIT 1`)
          : Promise.resolve({ rows: [] }),
        existing.location_id
          ? db.execute(sql`SELECT name FROM locations WHERE id = ${existing.location_id} LIMIT 1`)
          : Promise.resolve({ rows: [] }),
      ]);
      const issueBeforeSnap: Record<string, any> = {
        "Tên phiếu":     existing.name,
        "Trạng thái":    existing.status === "completed" ? "Đã xuất kho" : "Nháp",
        "Tổng tiền":     String(existing.total_amount ?? "0"),
        "Kho":           (auditOldWh.rows[0] as any)?.name ?? null,
        "Người nhận":    existing.recipient_name ?? null,
        "Cơ sở":         (auditOldLoc.rows[0] as any)?.name ?? null,
        "Chiết khấu":    `${existing.discount ?? 0} ${existing.discount_type ?? "VND"}`,
        "Phụ thu":       `${existing.surcharge ?? 0} ${existing.surcharge_type ?? "VND"}`,
        "Phiếu thu":     existing.has_invoice ? "Có" : "Không",
        "Ghi chú":       existing.note ?? null,
        "Số sản phẩm":   oldItems.length,
        "Tổng số lượng": oldItems.reduce((s: number, i: any) => s + i.quantity, 0),
      };
      // ─────────────────────────────────────────────────────────────────────

      if (existing.status === "completed" && existing.warehouse_id) {
        const oldQtyMap: Record<string, { qty: number; name: string }> = {};
        for (const item of oldItems) {
          if (!item.product_id) continue;
          if (!oldQtyMap[item.product_id]) oldQtyMap[item.product_id] = { qty: 0, name: item.product_name };
          oldQtyMap[item.product_id].qty += item.quantity;
        }

        const newQtyMap: Record<string, number> = {};
        for (const item of items) {
          if (!item.productId) continue;
          newQtyMap[item.productId] = (newQtyMap[item.productId] || 0) + item.quantity;
        }

        const errors: string[] = [];
        for (const [productId, { qty: oldQty, name }] of Object.entries(oldQtyMap)) {
          const newQty = newQtyMap[productId] || 0;
          const delta = newQty - oldQty;
          if (delta > 0) {
            const invRow = await db.execute(sql`
              SELECT GREATEST(0, COALESCE(SUM(quantity_delta), 0))::int AS quantity
              FROM store_stock_transactions
              WHERE product_id = ${productId} AND warehouse_id = ${existing.warehouse_id}
            `);
            const currentStock = parseInt(String((invRow.rows[0] as any)?.quantity ?? 0));
            if (currentStock < delta) {
              errors.push(`• ${name}: tồn hiện tại ${currentStock}, cần thêm ${delta}`);
            }
          }
        }

        for (const [productId, newQty] of Object.entries(newQtyMap)) {
          if (!oldQtyMap[productId]) {
            const invRow = await db.execute(sql`
              SELECT GREATEST(0, COALESCE(SUM(quantity_delta), 0))::int AS quantity
              FROM store_stock_transactions
              WHERE product_id = ${productId} AND warehouse_id = ${existing.warehouse_id}
            `);
            const currentStock = parseInt(String((invRow.rows[0] as any)?.quantity ?? 0));
            const matchItem = items.find(i => i.productId === productId);
            const name = matchItem?.productName ?? "Sản phẩm";
            if (currentStock < newQty) {
              errors.push(`• ${name}: tồn hiện tại ${currentStock}, yêu cầu xuất ${newQty}`);
            }
          }
        }

        if (errors.length > 0) {
          return res.status(409).json({
            message: `Tồn kho không đủ để xuất:\n${errors.join("\n")}`,
          });
        }

        const allProductIds = new Set([...Object.keys(oldQtyMap), ...Object.keys(newQtyMap)]);
        const editUser = req.user as any;
        for (const productId of allProductIds) {
          const oldQty = oldQtyMap[productId]?.qty || 0;
          const newQty = newQtyMap[productId] || 0;
          const delta = newQty - oldQty;
          if (delta !== 0) {
            await db.execute(sql`
              INSERT INTO store_inventory (product_id, warehouse_id, quantity, updated_at)
              VALUES (${productId}, ${existing.warehouse_id}, 0, NOW())
              ON CONFLICT (product_id, warehouse_id)
              DO UPDATE SET quantity = GREATEST(0, store_inventory.quantity - ${delta}), updated_at = NOW()
            `);
            const existingCode = existing.code || req.params.id;
            await logStockTransaction({
              productId,
              warehouseId: existing.warehouse_id,
              receiptId: req.params.id,
              receiptCode: existingCode,
              type: "edit_export",
              quantityDelta: -delta,
              description: `Sửa ${existingCode}: Xuất cũ: ${oldQty} → Xuất mới: ${newQty}`,
              createdBy: editUser.id,
              createdByName: editUser.fullName || editUser.username,
            });
          }
        }
      } else if (existing.status === "draft" && receiptData.status === "completed" && receiptData.warehouseId) {
        const errors = await validateAndDecreaseInventory(receiptData.warehouseId, items, null, req.params.id);
        if (errors.length > 0) {
          return res.status(409).json({ message: `Tồn kho không đủ:\n${errors.join("\n")}` });
        }
        await decreaseInventory(receiptData.warehouseId, items);
        const draftUser = req.user as any;
        for (const item of items) {
          if (!item.productId) continue;
          await logStockTransaction({
            productId: item.productId,
            warehouseId: receiptData.warehouseId,
            receiptId: req.params.id,
            receiptCode: existing.code || req.params.id,
            type: "export",
            quantityDelta: -item.quantity,
            createdBy: draftUser.id,
            createdByName: draftUser.fullName || draftUser.username,
          });
        }
      }

      await db.execute(sql`
        UPDATE store_issue_receipts SET
          code = ${receiptData.code},
          name = ${receiptData.name},
          location_id = ${receiptData.locationId ?? null},
          warehouse_id = ${receiptData.warehouseId ?? null},
          date = ${receiptData.date},
          recipient_name = ${receiptData.recipientName ?? null},
          note = ${receiptData.note ?? null},
          discount = ${receiptData.discount},
          discount_type = ${receiptData.discountType},
          surcharge = ${receiptData.surcharge},
          surcharge_type = ${receiptData.surchargeType},
          has_invoice = ${receiptData.hasInvoice},
          invoice_note = ${receiptData.invoiceNote ?? null},
          paid_amount = ${receiptData.paidAmount},
          status = ${receiptData.status},
          total_amount = ${receiptData.totalAmount},
          updated_at = NOW()
        WHERE id = ${req.params.id}
      `);

      await db.execute(sql`DELETE FROM store_issue_receipt_items WHERE receipt_id = ${req.params.id}`);
      for (const item of items) {
        await db.execute(sql`
          INSERT INTO store_issue_receipt_items (
            receipt_id, product_id, product_code, product_name,
            quantity, unit_id, unit_name, sale_price, stock_before,
            price_type, star_price, total_stars
          ) VALUES (
            ${req.params.id}, ${item.productId ?? null}, ${item.productCode}, ${item.productName},
            ${item.quantity}, ${item.unitId ?? null}, ${item.unitName ?? null},
            ${item.salePrice}, ${item.stockBefore},
            ${item.priceType ?? "money"}, ${item.starPrice ?? 0},
            ${item.priceType === "star" ? item.quantity * (item.starPrice ?? 0) : 0}
          )
        `);
      }

      // ── Audit: log sửa phiếu ─────────────────────────────────────────────
      try {
        const [auditNewWh, auditNewLoc] = await Promise.all([
          receiptData.warehouseId
            ? db.execute(sql`SELECT name FROM store_warehouses WHERE id = ${receiptData.warehouseId} LIMIT 1`)
            : Promise.resolve({ rows: [] }),
          receiptData.locationId
            ? db.execute(sql`SELECT name FROM locations WHERE id = ${receiptData.locationId} LIMIT 1`)
            : Promise.resolve({ rows: [] }),
        ]);
        const issueAfterSnap: Record<string, any> = {
          "Tên phiếu":     receiptData.name,
          "Trạng thái":    receiptData.status === "completed" ? "Đã xuất kho" : "Nháp",
          "Tổng tiền":     String(receiptData.totalAmount ?? "0"),
          "Kho":           (auditNewWh.rows[0] as any)?.name ?? null,
          "Người nhận":    receiptData.recipientName ?? null,
          "Cơ sở":         (auditNewLoc.rows[0] as any)?.name ?? null,
          "Chiết khấu":    `${receiptData.discount ?? 0} ${receiptData.discountType ?? "VND"}`,
          "Phụ thu":       `${receiptData.surcharge ?? 0} ${receiptData.surchargeType ?? "VND"}`,
          "Phiếu thu":     receiptData.hasInvoice ? "Có" : "Không",
          "Ghi chú":       receiptData.note ?? null,
          "Số sản phẩm":   items.length,
          "Tổng số lượng": items.reduce((s: number, i: any) => s + i.quantity, 0),
        };

        // Per-item diff
        type IItemKey = string;
        const iItemKey = (i: { productId?: string | null; productCode: string }) =>
          i.productId || `code:${i.productCode}`;
        const iItemLabel = (i: { productName: string; productCode: string }) =>
          `📦 ${i.productName || i.productCode}`;

        const oldIssueItemMap = new Map<IItemKey, { qty: number; price: string; label: string }>();
        for (const oi of oldItems as any[]) {
          const k = iItemKey({ productId: oi.product_id, productCode: oi.product_code });
          const prev = oldIssueItemMap.get(k);
          oldIssueItemMap.set(k, {
            qty:   (prev?.qty ?? 0) + oi.quantity,
            price: String(oi.sale_price ?? "0"),
            label: iItemLabel({ productName: oi.product_name, productCode: oi.product_code }),
          });
        }

        const newIssueItemMap = new Map<IItemKey, { qty: number; price: string; label: string }>();
        for (const ni of items) {
          const k = iItemKey(ni);
          const prev = newIssueItemMap.get(k);
          newIssueItemMap.set(k, {
            qty:   (prev?.qty ?? 0) + ni.quantity,
            price: String(ni.salePrice ?? "0"),
            label: iItemLabel(ni),
          });
        }

        const allIssueKeys = new Set([...oldIssueItemMap.keys(), ...newIssueItemMap.keys()]);
        for (const k of allIssueKeys) {
          const o = oldIssueItemMap.get(k);
          const n = newIssueItemMap.get(k);
          const label = o?.label ?? n?.label ?? k;
          const oldVal = o ? `SL: ${o.qty}, Giá: ${o.price}` : null;
          const newVal = n ? `SL: ${n.qty}, Giá: ${n.price}` : null;
          if (oldVal !== newVal) {
            issueBeforeSnap[label] = oldVal;
            issueAfterSnap[label]  = newVal;
          }
        }

        const oldIssueDiff: Record<string, any> = {};
        const newIssueDiff: Record<string, any> = {};
        for (const key of Object.keys(issueBeforeSnap)) {
          if (String(issueBeforeSnap[key] ?? "") !== String(issueAfterSnap[key] ?? "")) {
            oldIssueDiff[key] = issueBeforeSnap[key];
            newIssueDiff[key] = issueAfterSnap[key];
          }
        }
        if (Object.keys(oldIssueDiff).length > 0) {
          await createStoreIssueReceiptAuditLog({
            receiptId:   req.params.id,
            receiptCode: receiptData.code,
            action:      "edited",
            userId:      user.id ?? null,
            userName:    user.fullName || user.username,
            locationId:  receiptData.locationId ?? null,
            oldContent:  oldIssueDiff,
            newContent:  newIssueDiff,
          });
        }
      } catch (auditErr) {
        console.error("[IssueReceipt] PATCH audit log error:", auditErr);
      }
      // ─────────────────────────────────────────────────────────────────────

      if (existing.has_invoice || receiptData.hasInvoice) {
        await db.execute(sql`DELETE FROM invoices WHERE store_issue_receipt_id = ${req.params.id}`);
        if (receiptData.hasInvoice && receiptData.status === "completed") {
          await createIssueInvoice({
            receiptId: req.params.id,
            receiptCode: receiptData.code,
            recipientName: receiptData.recipientName,
            recipientId: receiptData.recipientId ?? null,
            locationId: receiptData.locationId,
            invoiceNote: receiptData.invoiceNote,
            discount: receiptData.discount,
            discountType: receiptData.discountType,
            surcharge: receiptData.surcharge,
            surchargeType: receiptData.surchargeType,
            paidAmount: receiptData.paidAmount,
            items: items.map(i => ({ quantity: i.quantity, productName: i.productName, salePrice: i.priceType === "star" ? 0 : i.salePrice })),
            createdBy: user.id,
            createdByName: user.fullName || user.username,
          });
          await db.execute(sql`
            UPDATE store_issue_receipts SET has_invoice = TRUE WHERE id = ${req.params.id}
          `);
        }
      }

      const updatedRow = await db.execute(sql`SELECT * FROM store_issue_receipts WHERE id = ${req.params.id}`);
      res.json(updatedRow.rows[0]);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ message: "Mã phiếu đã tồn tại" });
      console.error("[IssueReceipt] PATCH error:", err);
      res.status(500).json({ message: "Lỗi khi cập nhật phiếu xuất kho" });
    }
  });

  // ── DELETE / CANCEL ────────────────────────────────────────────────────────
  app.delete("/api/store/issue-receipts/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const existingRow = await db.execute(sql`
        SELECT * FROM store_issue_receipts WHERE id = ${req.params.id}
      `);
      const existing = existingRow.rows[0] as any;
      if (!existing) return res.status(404).json({ message: "Không tìm thấy phiếu" });

      if (existing.status === "cancelled") {
        return res.status(400).json({ message: "Phiếu đã bị hủy trước đó" });
      }

      // Draft → xóa vật lý, không cần hoàn tồn (draft không ảnh hưởng tồn kho)
      if (existing.status === "draft") {
        // Audit: snapshot trước khi xóa
        try {
          const draftItemsRow = await db.execute(sql`
            SELECT product_name, product_code, quantity, sale_price
            FROM store_issue_receipt_items WHERE receipt_id = ${req.params.id}
          `);
          const draftItems = draftItemsRow.rows as any[];
          const deleteUser = req.user as any;

          const itemSnap: Record<string, any> = {};
          const itemAggMap = new Map<string, { qty: number; price: string }>();
          for (const di of draftItems) {
            const label = `📦 ${di.product_name || di.product_code}`;
            const prev = itemAggMap.get(label);
            itemAggMap.set(label, { qty: (prev?.qty ?? 0) + di.quantity, price: String(di.sale_price ?? "0") });
          }
          for (const [label, { qty, price }] of itemAggMap) {
            itemSnap[label] = `SL: ${qty}, Giá: ${price}`;
          }

          const [delWh, delLoc] = await Promise.all([
            existing.warehouse_id
              ? db.execute(sql`SELECT name FROM store_warehouses WHERE id = ${existing.warehouse_id} LIMIT 1`)
              : Promise.resolve({ rows: [] }),
            existing.location_id
              ? db.execute(sql`SELECT name FROM locations WHERE id = ${existing.location_id} LIMIT 1`)
              : Promise.resolve({ rows: [] }),
          ]);

          await createStoreIssueReceiptAuditLog({
            receiptId:   req.params.id,
            receiptCode: existing.code,
            action:      "deleted",
            userId:      deleteUser.id ?? null,
            userName:    deleteUser.fullName || deleteUser.username,
            locationId:  existing.location_id ?? null,
            oldContent: {
              "Tên phiếu":     existing.name,
              "Trạng thái":    "Nháp",
              "Tổng tiền":     String(existing.total_amount ?? "0"),
              "Kho":           (delWh.rows[0] as any)?.name ?? null,
              "Người nhận":    existing.recipient_name ?? null,
              "Cơ sở":         (delLoc.rows[0] as any)?.name ?? null,
              "Ghi chú":       existing.note ?? null,
              "Số sản phẩm":   draftItems.length,
              "Tổng số lượng": draftItems.reduce((s: number, i: any) => s + i.quantity, 0),
              ...itemSnap,
            },
            newContent: null,
          });
        } catch (auditErr) {
          console.error("[IssueReceipt] DELETE audit log error:", auditErr);
        }

        await db.execute(sql`DELETE FROM invoices WHERE store_issue_receipt_id = ${req.params.id}`);
        await db.execute(sql`DELETE FROM store_issue_receipt_items WHERE receipt_id = ${req.params.id}`);
        await db.execute(sql`DELETE FROM store_issue_receipts WHERE id = ${req.params.id}`);
        return res.json({ success: true, action: "deleted" });
      }

      // Completed → kiểm tra xem đã phát sinh hóa đơn có thanh toán chưa
      if (existing.status === "completed") {
        const linkedInvRow = await db.execute(sql`
          SELECT id, code, status FROM invoices WHERE store_issue_receipt_id = ${req.params.id} LIMIT 1
        `);
        if (linkedInvRow.rows.length > 0) {
          const inv = linkedInvRow.rows[0] as any;
          if (inv.status === "paid" || inv.status === "partial") {
            const statusLabel = inv.status === "paid" ? "Đã thanh toán" : "Thanh toán một phần";
            return res.status(409).json({
              message: `Phiếu ${existing.code} có hoá đơn ${inv.code} ${statusLabel}, vui lòng chuyển hoá đơn sang Trạng thái: Chưa thanh toán để thực hiện việc chỉnh sửa`,
              invoiceLocked: true,
              invoiceCode: inv.code,
              invoiceStatus: inv.status,
            });
          }
          // Hóa đơn chưa thanh toán → xóa hóa đơn
          await db.execute(sql`DELETE FROM invoices WHERE store_issue_receipt_id = ${req.params.id}`);
        }

        // Hoàn trả tồn kho
        const itemsRow = await db.execute(sql`
          SELECT * FROM store_issue_receipt_items WHERE receipt_id = ${req.params.id}
        `);
        const items = itemsRow.rows as any[];
        if (existing.warehouse_id && items.length > 0) {
          await increaseInventory(
            existing.warehouse_id,
            items.map(i => ({ productId: i.product_id, quantity: i.quantity })),
          );
          const cancelUser = req.user as any;
          for (const item of items) {
            if (!item.product_id) continue;
            await logStockTransaction({
              productId: item.product_id,
              warehouseId: existing.warehouse_id,
              receiptId: req.params.id,
              receiptCode: existing.code || req.params.id,
              type: "cancel_export",
              quantityDelta: item.quantity,
              status: "cancelled",
              description: `Hủy phiếu ${existing.code || req.params.id}`,
              createdBy: cancelUser.id,
              createdByName: cancelUser.fullName || cancelUser.username,
            });
          }
        }

        // Hoàn sao nếu có trừ sao trước đó
        const starDeductRow = await db.execute(sql`
          SELECT student_id, ABS(delta) AS stars
          FROM student_star_transactions
          WHERE receipt_id = ${req.params.id} AND delta < 0
          LIMIT 1
        `);
        if (starDeductRow.rows.length > 0) {
          const sd = starDeductRow.rows[0] as any;
          await refundStudentStars(sd.student_id, Number(sd.stars), req.params.id, existing.code || req.params.id);
        }

        // Đổi trạng thái → cancelled (không xóa vật lý)
        await db.execute(sql`
          UPDATE store_issue_receipts
          SET status = 'cancelled', has_invoice = FALSE, updated_at = NOW()
          WHERE id = ${req.params.id}
        `);
        return res.json({ success: true, action: "cancelled" });
      }

      return res.status(400).json({ message: "Trạng thái phiếu không hợp lệ" });
    } catch (err) {
      console.error("[IssueReceipt] DELETE error:", err);
      res.status(500).json({ message: "Lỗi khi xử lý phiếu xuất kho" });
    }
  });

  // ── INVENTORY SEARCH (for issue receipts — only shows products with stock > 0) ──
  // Accepts warehouseId (single warehouse) OR locationId (all warehouses of a location)
  app.get("/api/store/issue-inventory/search", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const { warehouseId, locationId, q, sessionId, receiptId } = req.query as {
      warehouseId?: string; locationId?: string; q?: string; sessionId?: string; receiptId?: string;
    };
    const sid = sessionId && sessionId.trim() ? sessionId.trim() : "__none__";
    const rid = receiptId && receiptId.trim() ? receiptId.trim() : null;
    const draftExcludeFilter = rid ? sql`AND ir.id != ${rid}::uuid` : sql``;

    try {
      if (locationId && locationId.trim()) {
        // Search all warehouses for a given location — used by invoice Kho picker
        const lid = locationId.trim();
        const rows = await db.execute(sql`
          SELECT sub.*
          FROM (
            SELECT
              sp.id, sp.code, sp.name,
              sp.cost_price, sp.sale_price,
              sp.star_price,
              sp.category_id, sp.unit_id,
              u.name AS unit_name,
              sw.id AS warehouse_id,
              sw.name AS warehouse_name,
              GREATEST(0,
                COALESCE((
                  SELECT SUM(t.quantity_delta)
                  FROM store_stock_transactions t
                  WHERE t.product_id = sp.id AND t.warehouse_id = sw.id
                ), 0)
                - COALESCE((
                  SELECT SUM(r.quantity)
                  FROM store_inventory_reservations r
                  WHERE r.product_id = sp.id
                    AND r.warehouse_id = sw.id
                    AND r.expires_at > NOW()
                    AND r.session_id != ${sid}
                ), 0)
                - COALESCE((
                  SELECT SUM(ii.quantity)
                  FROM store_issue_receipt_items ii
                  JOIN store_issue_receipts ir ON ir.id = ii.receipt_id
                  WHERE ii.product_id = sp.id
                    AND ir.warehouse_id = sw.id
                    AND ir.status = 'draft'
                    ${draftExcludeFilter}
                ), 0)
              ) AS stock
            FROM store_products sp
            CROSS JOIN store_warehouses sw
            LEFT JOIN store_units u ON u.id = sp.unit_id
            WHERE sw.location_id = ${lid}
              AND ${q ? sql`(sp.name ILIKE ${'%' + q + '%'} OR sp.code ILIKE ${'%' + q + '%'})` : sql`TRUE`}
          ) sub
          WHERE sub.stock > 0
          ORDER BY sub.name, sub.warehouse_name
          LIMIT 50
        `);
        return res.json(rows.rows);
      }

      // Single warehouse search (original behaviour)
      const wid = warehouseId ?? "";
      const rows = await db.execute(sql`
        SELECT sub.*
        FROM (
          SELECT
            sp.id, sp.code, sp.name,
            sp.cost_price, sp.sale_price,
            sp.star_price,
            sp.category_id, sp.unit_id,
            u.name AS unit_name,
            GREATEST(0,
              COALESCE((
                SELECT SUM(t.quantity_delta)
                FROM store_stock_transactions t
                WHERE t.product_id = sp.id AND t.warehouse_id = ${wid}
              ), 0)
              - COALESCE((
                SELECT SUM(r.quantity)
                FROM store_inventory_reservations r
                WHERE r.product_id = sp.id
                  AND r.warehouse_id = ${wid}
                  AND r.expires_at > NOW()
                  AND r.session_id != ${sid}
              ), 0)
              - COALESCE((
                SELECT SUM(ii.quantity)
                FROM store_issue_receipt_items ii
                JOIN store_issue_receipts ir ON ir.id = ii.receipt_id
                WHERE ii.product_id = sp.id
                  AND ir.warehouse_id = ${wid}
                  AND ir.status = 'draft'
                  ${draftExcludeFilter}
              ), 0)
            ) AS stock
          FROM store_products sp
          LEFT JOIN store_inventory inv
            ON inv.product_id = sp.id AND inv.warehouse_id = ${wid}
          LEFT JOIN store_units u ON u.id = sp.unit_id
          WHERE ${q ? sql`(sp.name ILIKE ${'%' + q + '%'} OR sp.code ILIKE ${'%' + q + '%'})` : sql`TRUE`}
        ) sub
        WHERE sub.stock > 0
        ORDER BY sub.name
        LIMIT 50
      `);
      res.json(rows.rows);
    } catch (err) {
      console.error("[IssueReceipt] inventory search error:", err);
      res.status(500).json({ message: "Lỗi tìm kiếm sản phẩm" });
    }
  });
}
