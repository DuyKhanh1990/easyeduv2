import type { Express } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { invoices, invoiceItems } from "@shared/schema";
import { getNextLocationCode } from "../storage/finance.storage";
import { z } from "zod";

async function ensureTransferAuditLogTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS store_transfer_audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      transfer_id TEXT NOT NULL,
      transfer_code VARCHAR(50) NOT NULL,
      action VARCHAR(20) NOT NULL,
      user_id UUID,
      user_name VARCHAR(255),
      from_location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
      old_content JSONB,
      new_content JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_transfer_audit_logs_transfer_id ON store_transfer_audit_logs(transfer_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_transfer_audit_logs_created_at ON store_transfer_audit_logs(created_at DESC)`);
  console.log("[Store] Transfer audit log table ensured");
}

async function createTransferAuditLog(params: {
  transferId: string;
  transferCode: string;
  action: string;
  userId: string | null;
  userName: string;
  fromLocationId?: string | null;
  oldContent?: Record<string, any> | null;
  newContent?: Record<string, any> | null;
}) {
  await db.execute(sql`
    INSERT INTO store_transfer_audit_logs
      (transfer_id, transfer_code, action, user_id, user_name, from_location_id, old_content, new_content)
    VALUES
      (${params.transferId}, ${params.transferCode}, ${params.action},
       ${params.userId ?? null}, ${params.userName},
       ${params.fromLocationId ?? null},
       ${params.oldContent ? JSON.stringify(params.oldContent) : null}::jsonb,
       ${params.newContent ? JSON.stringify(params.newContent) : null}::jsonb)
  `);
}

async function ensureTransferTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS store_transfers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(50) NOT NULL UNIQUE,
      date DATE NOT NULL,
      from_location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
      from_warehouse_id UUID NOT NULL REFERENCES store_warehouses(id) ON DELETE RESTRICT,
      to_location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
      to_warehouse_id UUID NOT NULL REFERENCES store_warehouses(id) ON DELETE RESTRICT,
      note TEXT,
      has_receipt_income BOOLEAN NOT NULL DEFAULT FALSE,
      has_receipt_expense BOOLEAN NOT NULL DEFAULT FALSE,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      created_by UUID,
      created_by_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  // Migrations for existing tables
  await db.execute(sql`ALTER TABLE store_transfers ADD COLUMN IF NOT EXISTS from_location_id UUID REFERENCES locations(id) ON DELETE SET NULL`);
  await db.execute(sql`ALTER TABLE store_transfers ADD COLUMN IF NOT EXISTS to_location_id UUID REFERENCES locations(id) ON DELETE SET NULL`);
  await db.execute(sql`ALTER TABLE store_transfers ADD COLUMN IF NOT EXISTS has_receipt_income BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE store_transfers ADD COLUMN IF NOT EXISTS has_receipt_expense BOOLEAN NOT NULL DEFAULT FALSE`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS store_transfer_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      transfer_id UUID NOT NULL REFERENCES store_transfers(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES store_products(id) ON DELETE RESTRICT,
      product_code VARCHAR(100) NOT NULL,
      product_name VARCHAR(255) NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_store_transfers_status ON store_transfers(status)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_store_transfer_items_transfer ON store_transfer_items(transfer_id)`);
  await db.execute(sql`ALTER TABLE store_transfer_items ADD COLUMN IF NOT EXISTS unit_price NUMERIC(15,2) NOT NULL DEFAULT 0`);

  // Seed "Kho Nội bộ" categories for Thu and Chi
  await db.execute(sql`
    INSERT INTO finance_transaction_categories (name, type, is_default, is_active)
    SELECT 'Kho Nội bộ', 'income', false, true
    WHERE NOT EXISTS (
      SELECT 1 FROM finance_transaction_categories WHERE name = 'Kho Nội bộ' AND type = 'income'
    )
  `);
  await db.execute(sql`
    INSERT INTO finance_transaction_categories (name, type, is_default, is_active)
    SELECT 'Kho Nội bộ', 'expense', false, true
    WHERE NOT EXISTS (
      SELECT 1 FROM finance_transaction_categories WHERE name = 'Kho Nội bộ' AND type = 'expense'
    )
  `);

  console.log("[Store] Transfer tables ensured");
}

// ── INVOICE HELPERS ──────────────────────────────────────────────────────────

async function createTransferIncomeInvoice(params: {
  transferId: string;
  transferCode: string;
  locationId: string | null | undefined;
  items: { productName: string; quantity: number; unitPrice: number }[];
  createdBy: string | null;
  createdByName: string | null;
}) {
  const nextCode = await getNextLocationCode(params.locationId, "PT");

  const grandTotal = params.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const itemListStr = params.items.map(i => `${i.productName} SL:${i.quantity}`).join("; ");
  const description = `Phiếu thu chuyển kho nội bộ ${params.transferCode}: ${itemListStr}`;

  const [inv] = await db.insert(invoices).values({
    code: nextCode,
    type: "Thu",
    locationId: params.locationId ?? null,
    subjectName: "Kho nội bộ",
    category: "Kho Nội bộ",
    description,
    totalAmount: String(grandTotal),
    totalPromotion: "0",
    totalSurcharge: "0",
    invoicePromotionAmount: "0",
    invoiceSurchargeAmount: "0",
    grandTotal: String(grandTotal),
    paidAmount: String(grandTotal),
    remainingAmount: "0",
    status: "paid",
    createdBy: params.createdBy ?? null,
    updatedBy: params.createdBy ?? null,
  } as any).returning();

  if (params.items.length > 0) {
    await db.insert(invoiceItems).values(
      params.items.map((item, idx) => ({
        invoiceId: inv.id,
        packageName: item.productName,
        packageType: "Kho",
        unitPrice: String(item.unitPrice),
        quantity: item.quantity,
        promotionKeys: [],
        surchargeKeys: [],
        promotionAmount: "0",
        surchargeAmount: "0",
        subtotal: String(item.quantity * item.unitPrice),
        category: "Kho Nội bộ",
        sortOrder: idx,
      }))
    );
  }

  await db.execute(sql`
    UPDATE invoices SET store_transfer_id = ${params.transferId} WHERE id = ${inv.id}
  `);
}

async function createTransferExpenseInvoice(params: {
  transferId: string;
  transferCode: string;
  locationId: string | null | undefined;
  items: { productName: string; quantity: number; unitPrice: number }[];
  createdBy: string | null;
  createdByName: string | null;
}) {
  const nextCode = await getNextLocationCode(params.locationId, "PC");

  const grandTotal = params.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const itemListStr = params.items.map(i => `${i.productName} SL:${i.quantity}`).join("; ");
  const description = `Phiếu chi chuyển kho nội bộ ${params.transferCode}: ${itemListStr}`;

  const [inv] = await db.insert(invoices).values({
    code: nextCode,
    type: "Chi",
    locationId: params.locationId ?? null,
    subjectName: "Kho nội bộ",
    category: "Kho Nội bộ",
    description,
    totalAmount: String(grandTotal),
    totalPromotion: "0",
    totalSurcharge: "0",
    invoicePromotionAmount: "0",
    invoiceSurchargeAmount: "0",
    grandTotal: String(grandTotal),
    paidAmount: String(grandTotal),
    remainingAmount: "0",
    status: "paid",
    createdBy: params.createdBy ?? null,
    updatedBy: params.createdBy ?? null,
  } as any).returning();

  if (params.items.length > 0) {
    await db.insert(invoiceItems).values(
      params.items.map((item, idx) => ({
        invoiceId: inv.id,
        packageName: item.productName,
        packageType: "Kho",
        unitPrice: String(item.unitPrice),
        quantity: item.quantity,
        promotionKeys: [],
        surchargeKeys: [],
        promotionAmount: "0",
        surchargeAmount: "0",
        subtotal: String(item.quantity * item.unitPrice),
        category: "Kho Nội bộ",
        sortOrder: idx,
      }))
    );
  }

  await db.execute(sql`
    UPDATE invoices SET store_transfer_id = ${params.transferId} WHERE id = ${inv.id}
  `);
}

// ── SCHEMA ───────────────────────────────────────────────────────────────────

const transferItemSchema = z.object({
  productId: z.string().uuid(),
  productCode: z.string().min(1),
  productName: z.string().min(1),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0).default(0),
});

const transferCreateSchema = z.object({
  code: z.string().min(1, "Mã phiếu không được để trống"),
  date: z.string().min(1, "Ngày chuyển không được để trống"),
  fromLocationId: z.string().uuid().optional().nullable(),
  fromWarehouseId: z.string().uuid("Kho nguồn không hợp lệ"),
  toLocationId: z.string().uuid().optional().nullable(),
  toWarehouseId: z.string().uuid("Kho đích không hợp lệ"),
  note: z.string().optional().nullable(),
  hasReceiptIncome: z.boolean().default(false),
  hasReceiptExpense: z.boolean().default(false),
  items: z.array(transferItemSchema).min(1, "Phiếu phải có ít nhất 1 sản phẩm"),
});

export async function registerStoreTransferRoutes(app: Express) {
  await ensureTransferTables();
  await ensureTransferAuditLogTable();

  // Ensure invoices has store_transfer_id column
  await db.execute(sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS store_transfer_id UUID`);

  // ── NEXT CODE ──────────────────────────────────────────────────────────────
  app.get("/api/store/transfers/next-code", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const result = await db.execute(sql`
        SELECT MAX(CAST(SUBSTRING(code FROM 3) AS INTEGER)) as max_num
        FROM store_transfers WHERE code ~ '^CK[0-9]+$'
      `);
      const maxNum = (result.rows[0] as any)?.max_num ?? 0;
      const nextNum = (parseInt(String(maxNum)) || 0) + 1;
      res.json({ code: `CK${String(nextNum).padStart(6, "0")}` });
    } catch (err) {
      console.error("[Transfer] next-code error:", err);
      res.json({ code: "CK000001" });
    }
  });

  // ── HISTORY ────────────────────────────────────────────────────────────────
  app.get("/api/store/transfers/history", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const { allowedLocationIds, isSuperAdmin } = req;
    const { dateFrom, dateTo, locationId, limit = "100", offset = "0" } = req.query as Record<string, string>;

    const locFilter = (() => {
      if (locationId && locationId !== "__all__") return `AND (t.from_location_id = '${locationId}' OR t.to_location_id = '${locationId}')`;
      if (!isSuperAdmin && allowedLocationIds?.length) {
        const ids = allowedLocationIds.map((id: string) => `'${id}'`).join(",");
        return `AND (t.from_location_id IS NULL OR t.from_location_id = ANY(ARRAY[${ids}]::uuid[]) OR t.to_location_id IS NULL OR t.to_location_id = ANY(ARRAY[${ids}]::uuid[]))`;
      }
      return "";
    })();
    const auditLocFilter = (() => {
      if (locationId && locationId !== "__all__") return `AND al.from_location_id = '${locationId}'::uuid`;
      if (!isSuperAdmin && allowedLocationIds?.length) {
        const ids = allowedLocationIds.map((id: string) => `'${id}'`).join(",");
        return `AND (al.from_location_id IS NULL OR al.from_location_id = ANY(ARRAY[${ids}]::uuid[]))`;
      }
      return "";
    })();
    const dateFilter = (() => {
      const parts: string[] = [];
      if (dateFrom) parts.push(`base.ev_time >= '${dateFrom}'::date`);
      if (dateTo)   parts.push(`base.ev_time <  ('${dateTo}'::date + INTERVAL '1 day')`);
      return parts.length ? parts.join(" AND ") : "";
    })();

    try {
      const baseUnion = `
        -- created
        SELECT
          'created'::text                     AS ev_type,
          t.created_at                        AS ev_time,
          t.id::text                          AS transfer_id,
          t.code                              AS transfer_code,
          t.status,
          t.note,
          fw.name                             AS from_warehouse_name,
          tw.name                             AS to_warehouse_name,
          fl.name                             AS from_location_name,
          tl.name                             AS to_location_name,
          t.created_by_name,
          NULL::text                          AS old_content_json,
          NULL::text                          AS new_content_json
        FROM store_transfers t
        LEFT JOIN store_warehouses fw ON fw.id = t.from_warehouse_id
        LEFT JOIN store_warehouses tw ON tw.id = t.to_warehouse_id
        LEFT JOIN locations fl ON fl.id = t.from_location_id
        LEFT JOIN locations tl ON tl.id = t.to_location_id
        WHERE 1=1 ${locFilter}

        UNION ALL

        -- completed
        SELECT
          'completed'::text,
          t.updated_at,
          t.id::text, t.code, t.status, t.note,
          fw.name, tw.name, fl.name, tl.name, t.created_by_name,
          NULL::text, NULL::text
        FROM store_transfers t
        LEFT JOIN store_warehouses fw ON fw.id = t.from_warehouse_id
        LEFT JOIN store_warehouses tw ON tw.id = t.to_warehouse_id
        LEFT JOIN locations fl ON fl.id = t.from_location_id
        LEFT JOIN locations tl ON tl.id = t.to_location_id
        WHERE t.status = 'completed' AND t.updated_at IS DISTINCT FROM t.created_at
        ${locFilter}

        UNION ALL

        -- cancelled
        SELECT
          'cancelled'::text,
          t.updated_at,
          t.id::text, t.code, t.status, t.note,
          fw.name, tw.name, fl.name, tl.name, t.created_by_name,
          NULL::text, NULL::text
        FROM store_transfers t
        LEFT JOIN store_warehouses fw ON fw.id = t.from_warehouse_id
        LEFT JOIN store_warehouses tw ON tw.id = t.to_warehouse_id
        LEFT JOIN locations fl ON fl.id = t.from_location_id
        LEFT JOIN locations tl ON tl.id = t.to_location_id
        WHERE t.status = 'cancelled' AND t.updated_at IS DISTINCT FROM t.created_at
        ${locFilter}

        UNION ALL

        -- confirmed (draft → transferring)
        SELECT
          'confirmed'::text,
          al.created_at,
          al.transfer_id,
          al.transfer_code,
          'transferring'                      AS status,
          NULL::text                          AS note,
          fw.name                             AS from_warehouse_name,
          tw.name                             AS to_warehouse_name,
          fl.name                             AS from_location_name,
          NULL::text                          AS to_location_name,
          al.user_name                        AS created_by_name,
          al.old_content::text,
          al.new_content::text
        FROM store_transfer_audit_logs al
        LEFT JOIN store_transfers t   ON t.id::text = al.transfer_id
        LEFT JOIN store_warehouses fw ON fw.id = t.from_warehouse_id
        LEFT JOIN store_warehouses tw ON tw.id = t.to_warehouse_id
        LEFT JOIN locations fl        ON fl.id = al.from_location_id
        WHERE al.action = 'confirmed' ${auditLocFilter}

        UNION ALL

        -- edited
        SELECT
          'edited'::text,
          al.created_at,
          al.transfer_id,
          al.transfer_code,
          COALESCE(t.status, 'draft')         AS status,
          t.note,
          fw.name, tw.name,
          COALESCE(fl.name, fl2.name),
          tl.name,
          al.user_name,
          al.old_content::text,
          al.new_content::text
        FROM store_transfer_audit_logs al
        LEFT JOIN store_transfers t   ON t.id::text = al.transfer_id
        LEFT JOIN store_warehouses fw ON fw.id = t.from_warehouse_id
        LEFT JOIN store_warehouses tw ON tw.id = t.to_warehouse_id
        LEFT JOIN locations fl        ON fl.id = t.from_location_id
        LEFT JOIN locations fl2       ON fl2.id = al.from_location_id
        LEFT JOIN locations tl        ON tl.id = t.to_location_id
        WHERE al.action = 'edited' ${auditLocFilter}

        UNION ALL

        -- deleted
        SELECT
          'deleted'::text,
          al.created_at,
          al.transfer_id,
          al.transfer_code,
          'deleted'                           AS status,
          NULL::text                          AS note,
          NULL::text, NULL::text,
          fl.name                             AS from_location_name,
          NULL::text,
          al.user_name,
          al.old_content::text,
          NULL::text
        FROM store_transfer_audit_logs al
        LEFT JOIN locations fl ON fl.id = al.from_location_id
        WHERE al.action = 'deleted' ${auditLocFilter}
      `;

      const dateWhere = dateFilter ? `WHERE ${dateFilter}` : "";
      const [rows, countRows] = await Promise.all([
        db.execute(sql.raw(`SELECT * FROM (${baseUnion}) base ${dateWhere} ORDER BY ev_time DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`)),
        db.execute(sql.raw(`SELECT COUNT(*) AS total FROM (${baseUnion}) base ${dateWhere}`)),
      ]);

      res.json({
        events: rows.rows,
        total: parseInt(String((countRows.rows[0] as any)?.total ?? 0)),
      });
    } catch (err) {
      console.error("[Transfer] history error:", err);
      res.status(500).json({ message: "Lỗi khi lấy lịch sử phiếu chuyển kho" });
    }
  });

  // ── LIST ───────────────────────────────────────────────────────────────────
  app.get("/api/store/transfers", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
      const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "20"))));
      const offset = (page - 1) * pageSize;

      const search = String(req.query.search ?? "").trim();
      const dateFrom = String(req.query.dateFrom ?? "").trim();
      const dateTo = String(req.query.dateTo ?? "").trim();
      const fromWarehouseId = String(req.query.fromWarehouseId ?? "").trim();
      const toWarehouseId = String(req.query.toWarehouseId ?? "").trim();
      const status = String(req.query.status ?? "").trim();

      const { allowedLocationIds, isSuperAdmin } = req;
      const conds: ReturnType<typeof sql>[] = [sql`1=1`];
      if (!isSuperAdmin && allowedLocationIds?.length) {
        conds.push(sql`(t.from_location_id = ANY(ARRAY[${sql.raw(allowedLocationIds.map(id => `'${id}'`).join(','))}]::uuid[]) OR t.to_location_id = ANY(ARRAY[${sql.raw(allowedLocationIds.map(id => `'${id}'`).join(','))}]::uuid[]))`);
      }
      if (search) conds.push(sql`(t.code ILIKE ${'%' + search + '%'} OR fw.name ILIKE ${'%' + search + '%'} OR tw.name ILIKE ${'%' + search + '%'})`);
      if (dateFrom) conds.push(sql`t.created_at::date >= ${dateFrom}::date`);
      if (dateTo) conds.push(sql`t.created_at::date <= ${dateTo}::date`);
      if (fromWarehouseId) conds.push(sql`t.from_warehouse_id = ${fromWarehouseId}::uuid`);
      if (toWarehouseId) conds.push(sql`t.to_warehouse_id = ${toWarehouseId}::uuid`);
      if (status) conds.push(sql`t.status = ${status}`);
      const whereSQL = sql.join(conds, sql` AND `);

      const [countRow, rows] = await Promise.all([
        db.execute(sql`
          SELECT COUNT(*)::int AS total
          FROM store_transfers t
          LEFT JOIN store_warehouses fw ON fw.id = t.from_warehouse_id
          LEFT JOIN store_warehouses tw ON tw.id = t.to_warehouse_id
          WHERE ${whereSQL}
        `),
        db.execute(sql`
          SELECT
            t.id, t.code, t.date, t.status, t.note,
            t.from_location_id, t.from_warehouse_id,
            t.to_location_id, t.to_warehouse_id,
            t.has_receipt_income, t.has_receipt_expense,
            t.created_by, t.created_by_name, t.created_at,
            fl.name AS from_location_name,
            fw.name AS from_warehouse_name,
            tl.name AS to_location_name,
            tw.name AS to_warehouse_name,
            COUNT(DISTINCT ti.id)::int AS item_count,
            COALESCE(SUM(ti.quantity), 0)::int AS total_quantity
          FROM store_transfers t
          LEFT JOIN locations fl ON fl.id = t.from_location_id
          LEFT JOIN store_warehouses fw ON fw.id = t.from_warehouse_id
          LEFT JOIN locations tl ON tl.id = t.to_location_id
          LEFT JOIN store_warehouses tw ON tw.id = t.to_warehouse_id
          LEFT JOIN store_transfer_items ti ON ti.transfer_id = t.id
          WHERE ${whereSQL}
          GROUP BY t.id, fl.name, fw.name, tl.name, tw.name
          ORDER BY t.created_at DESC
          LIMIT ${pageSize} OFFSET ${offset}
        `),
      ]);

      const total = (countRow.rows[0] as any)?.total ?? 0;
      res.json({ data: rows.rows, total });
    } catch (err) {
      console.error("[Transfer] GET list error:", err);
      res.status(500).json({ message: "Lỗi khi lấy danh sách phiếu chuyển kho" });
    }
  });

  // ── GET DETAIL ─────────────────────────────────────────────────────────────
  app.get("/api/store/transfers/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const transferRows = await db.execute(sql`
        SELECT t.*,
          fl.name AS from_location_name,
          fw.name AS from_warehouse_name,
          tl.name AS to_location_name,
          tw.name AS to_warehouse_name
        FROM store_transfers t
        LEFT JOIN locations fl ON fl.id = t.from_location_id
        LEFT JOIN store_warehouses fw ON fw.id = t.from_warehouse_id
        LEFT JOIN locations tl ON tl.id = t.to_location_id
        LEFT JOIN store_warehouses tw ON tw.id = t.to_warehouse_id
        WHERE t.id = ${req.params.id}
      `);
      const transfer = transferRows.rows[0] as any;
      if (!transfer) return res.status(404).json({ message: "Không tìm thấy phiếu" });

      const itemRows = await db.execute(sql`
        SELECT ti.*
        FROM store_transfer_items ti
        WHERE ti.transfer_id = ${req.params.id}
        ORDER BY ti.created_at ASC
      `);
      res.json({ ...transfer, items: itemRows.rows });
    } catch (err) {
      console.error("[Transfer] GET detail error:", err);
      res.status(500).json({ message: "Lỗi khi lấy chi tiết phiếu" });
    }
  });

  // ── CREATE (draft) ─────────────────────────────────────────────────────────
  app.post("/api/store/transfers", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const user = req.user as any;
    const parsed = transferCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
    const data = parsed.data;

    if (data.fromWarehouseId === data.toWarehouseId) {
      return res.status(400).json({ message: "Kho nguồn và kho đích không được trùng nhau" });
    }
    const ids = data.items.map(i => i.productId);
    if (new Set(ids).size !== ids.length) {
      return res.status(400).json({ message: "Danh sách sản phẩm bị trùng, mỗi sản phẩm chỉ được xuất hiện 1 lần" });
    }

    try {
      const result = await db.execute(sql`
        INSERT INTO store_transfers
          (code, date, from_location_id, from_warehouse_id, to_location_id, to_warehouse_id,
           note, has_receipt_income, has_receipt_expense, status, created_by, created_by_name)
        VALUES
          (${data.code}, ${data.date}, ${data.fromLocationId ?? null}, ${data.fromWarehouseId},
           ${data.toLocationId ?? null}, ${data.toWarehouseId},
           ${data.note ?? null}, ${data.hasReceiptIncome}, ${data.hasReceiptExpense},
           'draft', ${user.id}, ${user.fullName || user.username})
        RETURNING *
      `);
      const newTransfer = result.rows[0] as any;

      for (const item of data.items) {
        await db.execute(sql`
          INSERT INTO store_transfer_items (transfer_id, product_id, product_code, product_name, quantity, unit_price)
          VALUES (${newTransfer.id}, ${item.productId}, ${item.productCode}, ${item.productName}, ${item.quantity}, ${item.unitPrice ?? 0})
        `);
      }

      res.status(201).json(newTransfer);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ message: "Mã phiếu đã tồn tại" });
      console.error("[Transfer] POST error:", err);
      res.status(500).json({ message: "Lỗi khi tạo phiếu chuyển kho" });
    }
  });

  // ── UPDATE (only draft) ────────────────────────────────────────────────────
  app.patch("/api/store/transfers/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const parsed = transferCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
    const data = parsed.data;

    if (data.fromWarehouseId === data.toWarehouseId) {
      return res.status(400).json({ message: "Kho nguồn và kho đích không được trùng nhau" });
    }
    const ids = data.items.map(i => i.productId);
    if (new Set(ids).size !== ids.length) {
      return res.status(400).json({ message: "Danh sách sản phẩm bị trùng, mỗi sản phẩm chỉ được xuất hiện 1 lần" });
    }

    try {
      const existing = await db.execute(sql`SELECT * FROM store_transfers WHERE id = ${req.params.id}`);
      const transfer = existing.rows[0] as any;
      if (!transfer) return res.status(404).json({ message: "Không tìm thấy phiếu" });
      if (transfer.status !== "draft") {
        return res.status(400).json({ message: "Chỉ có thể sửa phiếu ở trạng thái Nháp. Nếu cần thay đổi, hãy hủy phiếu và tạo mới." });
      }

      await db.execute(sql`
        UPDATE store_transfers SET
          code = ${data.code}, date = ${data.date},
          from_location_id = ${data.fromLocationId ?? null}, from_warehouse_id = ${data.fromWarehouseId},
          to_location_id = ${data.toLocationId ?? null}, to_warehouse_id = ${data.toWarehouseId},
          note = ${data.note ?? null},
          has_receipt_income = ${data.hasReceiptIncome}, has_receipt_expense = ${data.hasReceiptExpense},
          updated_at = NOW()
        WHERE id = ${req.params.id}
      `);

      // ── Audit: snapshot trước khi sửa ──────────────────────────────────────
      const patchUser = req.user as any;
      const [patchOldFromWh, patchOldToWh] = await Promise.all([
        db.execute(sql`SELECT name FROM store_warehouses WHERE id = ${transfer.from_warehouse_id} LIMIT 1`),
        db.execute(sql`SELECT name FROM store_warehouses WHERE id = ${transfer.to_warehouse_id} LIMIT 1`),
      ]);
      const patchOldItems = await db.execute(sql`SELECT product_name, quantity FROM store_transfer_items WHERE transfer_id = ${req.params.id}`);
      const beforeSnap: Record<string, any> = {
        "Mã phiếu":    transfer.code,
        "Kho nguồn":   (patchOldFromWh.rows[0] as any)?.name ?? null,
        "Kho đích":    (patchOldToWh.rows[0] as any)?.name ?? null,
        "Ghi chú":     transfer.note ?? null,
        "Số sản phẩm": patchOldItems.rows.length,
        "Tổng số lượng": (patchOldItems.rows as any[]).reduce((s, i) => s + i.quantity, 0),
      };
      for (const oi of patchOldItems.rows as any[]) {
        beforeSnap[`📦 ${oi.product_name}`] = `SL: ${oi.quantity}`;
      }
      // ─────────────────────────────────────────────────────────────────────

      await db.execute(sql`DELETE FROM store_transfer_items WHERE transfer_id = ${req.params.id}`);
      for (const item of data.items) {
        await db.execute(sql`
          INSERT INTO store_transfer_items (transfer_id, product_id, product_code, product_name, quantity, unit_price)
          VALUES (${req.params.id}, ${item.productId}, ${item.productCode}, ${item.productName}, ${item.quantity}, ${item.unitPrice ?? 0})
        `);
      }

      const updated = await db.execute(sql`SELECT * FROM store_transfers WHERE id = ${req.params.id}`);
      const updatedTransfer = updated.rows[0] as any;

      // ── Audit: ghi lại thay đổi ───────────────────────────────────────────
      try {
        const [patchNewFromWh, patchNewToWh] = await Promise.all([
          db.execute(sql`SELECT name FROM store_warehouses WHERE id = ${data.fromWarehouseId} LIMIT 1`),
          db.execute(sql`SELECT name FROM store_warehouses WHERE id = ${data.toWarehouseId} LIMIT 1`),
        ]);
        const afterSnap: Record<string, any> = {
          "Mã phiếu":    data.code,
          "Kho nguồn":   (patchNewFromWh.rows[0] as any)?.name ?? null,
          "Kho đích":    (patchNewToWh.rows[0] as any)?.name ?? null,
          "Ghi chú":     data.note ?? null,
          "Số sản phẩm": data.items.length,
          "Tổng số lượng": data.items.reduce((s, i) => s + i.quantity, 0),
        };
        for (const ni of data.items) {
          afterSnap[`📦 ${ni.productName}`] = `SL: ${ni.quantity}`;
        }
        const oldDiff: Record<string, any> = {};
        const newDiff: Record<string, any> = {};
        const allKeys = new Set([...Object.keys(beforeSnap), ...Object.keys(afterSnap)]);
        for (const k of allKeys) {
          if (String(beforeSnap[k] ?? "") !== String(afterSnap[k] ?? "")) {
            oldDiff[k] = beforeSnap[k] ?? null;
            newDiff[k] = afterSnap[k] ?? null;
          }
        }
        if (Object.keys(oldDiff).length > 0) {
          await createTransferAuditLog({
            transferId: req.params.id,
            transferCode: data.code,
            action: "edited",
            userId: patchUser.id ?? null,
            userName: patchUser.fullName || patchUser.username,
            fromLocationId: data.fromLocationId ?? null,
            oldContent: oldDiff,
            newContent: newDiff,
          });
        }
      } catch (auditErr) {
        console.error("[Transfer] PATCH audit log error:", auditErr);
      }
      // ─────────────────────────────────────────────────────────────────────

      res.json(updatedTransfer);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ message: "Mã phiếu đã tồn tại" });
      console.error("[Transfer] PATCH error:", err);
      res.status(500).json({ message: "Lỗi khi cập nhật phiếu chuyển kho" });
    }
  });

  // ── CONFIRM (draft → transferring): xuất khỏi kho nguồn ──────────────────
  app.post("/api/store/transfers/:id/confirm", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const user = req.user as any;
    try {
      const existing = await db.execute(sql`SELECT * FROM store_transfers WHERE id = ${req.params.id}`);
      const transfer = existing.rows[0] as any;
      if (!transfer) return res.status(404).json({ message: "Không tìm thấy phiếu" });
      if (transfer.status !== "draft") {
        return res.status(400).json({ message: "Chỉ có thể xác nhận phiếu ở trạng thái Nháp" });
      }

      const itemRows = await db.execute(sql`SELECT * FROM store_transfer_items WHERE transfer_id = ${req.params.id}`);
      const items = itemRows.rows as any[];

      // Kiểm tra tồn kho nguồn (dùng store_stock_transactions để nhất quán với màn hình tồn kho)
      const errors: string[] = [];
      for (const item of items) {
        const stockRow = await db.execute(sql`
          SELECT COALESCE(SUM(quantity_delta), 0)::int AS actual_stock
          FROM store_stock_transactions
          WHERE product_id = ${item.product_id} AND warehouse_id = ${transfer.from_warehouse_id}
        `);
        const currentStock = Math.max(0, parseInt(String((stockRow.rows[0] as any)?.actual_stock ?? 0)));
        if (currentStock < item.quantity) {
          errors.push(`${item.product_name}:\n  Tồn hiện tại: ${currentStock}\n  Số lượng yêu cầu chuyển: ${item.quantity}`);
        }
      }
      if (errors.length > 0) {
        return res.status(409).json({ message: `Không đủ tồn kho để chuyển:\n${errors.join("\n")}` });
      }

      // Trừ tồn kho nguồn + sinh TRANSFER_OUT
      for (const item of items) {
        const qty = parseInt(String(item.quantity));
        await db.execute(sql`
          INSERT INTO store_inventory (product_id, warehouse_id, quantity, updated_at)
          VALUES (${item.product_id}, ${transfer.from_warehouse_id}, ${-qty}::int, NOW())
          ON CONFLICT (product_id, warehouse_id)
          DO UPDATE SET quantity = GREATEST(0, store_inventory.quantity - ${qty}::int), updated_at = NOW()
        `);
        await db.execute(sql`
          INSERT INTO store_stock_transactions
            (product_id, warehouse_id, receipt_id, receipt_code, type, quantity_delta, status, description, created_by, created_by_name)
          VALUES
            (${item.product_id}, ${transfer.from_warehouse_id}, ${transfer.id}, ${transfer.code},
             'transfer_out', ${-item.quantity}, 'completed',
             ${'Chuyển kho ' + transfer.code + ': Xuất khỏi kho nguồn'},
             ${user.id}, ${user.fullName || user.username})
        `);
      }

      // Xuất phiếu thu cho cơ sở nguồn (nếu được chọn)
      if (transfer.has_receipt_income) {
        try {
          await createTransferIncomeInvoice({
            transferId: transfer.id,
            transferCode: transfer.code,
            locationId: transfer.from_location_id,
            items: items.map(i => ({ productName: i.product_name, quantity: i.quantity, unitPrice: parseFloat(String(i.unit_price ?? 0)) })),
            createdBy: user.id,
            createdByName: user.fullName || user.username,
          });
        } catch (invErr) {
          console.error("[Transfer] Income invoice creation failed:", invErr);
        }
      }

      await db.execute(sql`
        UPDATE store_transfers SET status = 'transferring', updated_at = NOW() WHERE id = ${transfer.id}
      `);

      // Audit: ghi lại sự kiện xác nhận chuyển kho
      try {
        await createTransferAuditLog({
          transferId: transfer.id,
          transferCode: transfer.code,
          action: "confirmed",
          userId: user.id ?? null,
          userName: user.fullName || user.username,
          fromLocationId: transfer.from_location_id ?? null,
          oldContent: { "Trạng thái": "Nháp", "Số SP": items.length, "Tổng SL": items.reduce((s: number, i: any) => s + i.quantity, 0) },
          newContent: { "Trạng thái": "Đang chuyển" },
        });
      } catch (auditErr) { console.error("[Transfer] confirm audit error:", auditErr); }

      res.json({ success: true, message: "Đã xác nhận xuất kho. Đang chuyển hàng." });
    } catch (err) {
      console.error("[Transfer] confirm error:", err);
      res.status(500).json({ message: "Lỗi khi xác nhận chuyển kho" });
    }
  });

  // ── COMPLETE (transferring → completed): nhập vào kho đích ────────────────
  app.post("/api/store/transfers/:id/complete", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const user = req.user as any;
    try {
      const existing = await db.execute(sql`SELECT * FROM store_transfers WHERE id = ${req.params.id}`);
      const transfer = existing.rows[0] as any;
      if (!transfer) return res.status(404).json({ message: "Không tìm thấy phiếu" });
      if (transfer.status !== "transferring") {
        return res.status(400).json({ message: "Phiếu phải ở trạng thái Đang chuyển mới có thể xác nhận hoàn thành" });
      }

      const itemRows = await db.execute(sql`SELECT * FROM store_transfer_items WHERE transfer_id = ${req.params.id}`);
      const items = itemRows.rows as any[];

      // Cộng tồn kho đích + sinh TRANSFER_IN
      for (const item of items) {
        await db.execute(sql`
          INSERT INTO store_inventory (product_id, warehouse_id, quantity, updated_at)
          VALUES (${item.product_id}, ${transfer.to_warehouse_id}, ${item.quantity}, NOW())
          ON CONFLICT (product_id, warehouse_id)
          DO UPDATE SET quantity = GREATEST(0, store_inventory.quantity + ${item.quantity}), updated_at = NOW()
        `);
        await db.execute(sql`
          INSERT INTO store_stock_transactions
            (product_id, warehouse_id, receipt_id, receipt_code, type, quantity_delta, status, description, created_by, created_by_name)
          VALUES
            (${item.product_id}, ${transfer.to_warehouse_id}, ${transfer.id}, ${transfer.code},
             'transfer_in', ${item.quantity}, 'completed',
             ${'Chuyển kho ' + transfer.code + ': Nhập vào kho đích'},
             ${user.id}, ${user.fullName || user.username})
        `);
      }

      // Xuất phiếu chi cho cơ sở đích (nếu được chọn)
      if (transfer.has_receipt_expense) {
        try {
          await createTransferExpenseInvoice({
            transferId: transfer.id,
            transferCode: transfer.code,
            locationId: transfer.to_location_id,
            items: items.map(i => ({ productName: i.product_name, quantity: i.quantity, unitPrice: parseFloat(String(i.unit_price ?? 0)) })),
            createdBy: user.id,
            createdByName: user.fullName || user.username,
          });
        } catch (invErr) {
          console.error("[Transfer] Expense invoice creation failed:", invErr);
        }
      }

      await db.execute(sql`
        UPDATE store_transfers SET status = 'completed', updated_at = NOW() WHERE id = ${transfer.id}
      `);

      res.json({ success: true, message: "Hoàn thành chuyển kho. Kho đích đã được cập nhật." });
    } catch (err) {
      console.error("[Transfer] complete error:", err);
      res.status(500).json({ message: "Lỗi khi hoàn thành chuyển kho" });
    }
  });

  // ── TRANSFER (gộp confirm + complete trong 1 bước) ────────────────────────
  app.post("/api/store/transfers/:id/transfer", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const user = req.user as any;
    try {
      const existing = await db.execute(sql`SELECT * FROM store_transfers WHERE id = ${req.params.id}`);
      const transfer = existing.rows[0] as any;
      if (!transfer) return res.status(404).json({ message: "Không tìm thấy phiếu" });
      if (transfer.status !== "draft") {
        return res.status(400).json({ message: "Chỉ có thể chuyển kho từ phiếu ở trạng thái Nháp" });
      }

      const itemRows = await db.execute(sql`SELECT * FROM store_transfer_items WHERE transfer_id = ${req.params.id}`);
      const items = itemRows.rows as any[];

      // Kiểm tra tồn kho nguồn (dùng store_stock_transactions để nhất quán với màn hình tồn kho)
      const errors: string[] = [];
      for (const item of items) {
        const stockRow = await db.execute(sql`
          SELECT COALESCE(SUM(quantity_delta), 0)::int AS actual_stock
          FROM store_stock_transactions
          WHERE product_id = ${item.product_id} AND warehouse_id = ${transfer.from_warehouse_id}
        `);
        const currentStock = Math.max(0, parseInt(String((stockRow.rows[0] as any)?.actual_stock ?? 0)));
        if (currentStock < item.quantity) {
          errors.push(`${item.product_name}:\n  Tồn hiện tại: ${currentStock}\n  Số lượng yêu cầu: ${item.quantity}`);
        }
      }
      if (errors.length > 0) {
        return res.status(409).json({ message: `Không đủ tồn kho để chuyển:\n${errors.join("\n")}` });
      }

      // Trừ kho nguồn (transfer_out)
      for (const item of items) {
        const qty = parseInt(String(item.quantity));
        await db.execute(sql`
          INSERT INTO store_inventory (product_id, warehouse_id, quantity, updated_at)
          VALUES (${item.product_id}, ${transfer.from_warehouse_id}, ${-qty}::int, NOW())
          ON CONFLICT (product_id, warehouse_id)
          DO UPDATE SET quantity = GREATEST(0, store_inventory.quantity - ${qty}::int), updated_at = NOW()
        `);
        await db.execute(sql`
          INSERT INTO store_stock_transactions
            (product_id, warehouse_id, receipt_id, receipt_code, type, quantity_delta, status, description, created_by, created_by_name)
          VALUES
            (${item.product_id}, ${transfer.from_warehouse_id}, ${transfer.id}, ${transfer.code},
             'transfer_out', ${-item.quantity}, 'completed',
             ${'Chuyển kho ' + transfer.code + ': Xuất khỏi kho nguồn'},
             ${user.id}, ${user.fullName || user.username})
        `);
      }

      // Cộng kho đích (transfer_in)
      for (const item of items) {
        await db.execute(sql`
          INSERT INTO store_inventory (product_id, warehouse_id, quantity, updated_at)
          VALUES (${item.product_id}, ${transfer.to_warehouse_id}, ${item.quantity}, NOW())
          ON CONFLICT (product_id, warehouse_id)
          DO UPDATE SET quantity = GREATEST(0, store_inventory.quantity + ${item.quantity}), updated_at = NOW()
        `);
        await db.execute(sql`
          INSERT INTO store_stock_transactions
            (product_id, warehouse_id, receipt_id, receipt_code, type, quantity_delta, status, description, created_by, created_by_name)
          VALUES
            (${item.product_id}, ${transfer.to_warehouse_id}, ${transfer.id}, ${transfer.code},
             'transfer_in', ${item.quantity}, 'completed',
             ${'Chuyển kho ' + transfer.code + ': Nhập vào kho đích'},
             ${user.id}, ${user.fullName || user.username})
        `);
      }

      // Phiếu thu (cơ sở nguồn)
      if (transfer.has_receipt_income) {
        try {
          await createTransferIncomeInvoice({
            transferId: transfer.id,
            transferCode: transfer.code,
            locationId: transfer.from_location_id,
            items: items.map(i => ({ productName: i.product_name, quantity: i.quantity, unitPrice: parseFloat(String(i.unit_price ?? 0)) })),
            createdBy: user.id,
            createdByName: user.fullName || user.username,
          });
        } catch (e) { console.error("[Transfer] Income invoice error:", e); }
      }

      // Phiếu chi (cơ sở đích)
      if (transfer.has_receipt_expense) {
        try {
          await createTransferExpenseInvoice({
            transferId: transfer.id,
            transferCode: transfer.code,
            locationId: transfer.to_location_id,
            items: items.map(i => ({ productName: i.product_name, quantity: i.quantity, unitPrice: parseFloat(String(i.unit_price ?? 0)) })),
            createdBy: user.id,
            createdByName: user.fullName || user.username,
          });
        } catch (e) { console.error("[Transfer] Expense invoice error:", e); }
      }

      await db.execute(sql`
        UPDATE store_transfers SET status = 'completed', updated_at = NOW() WHERE id = ${transfer.id}
      `);

      res.json({ success: true, message: "Chuyển kho hoàn tất. Tồn kho đã được cập nhật." });
    } catch (err) {
      console.error("[Transfer] transfer error:", err);
      res.status(500).json({ message: "Lỗi khi thực hiện chuyển kho" });
    }
  });

  // ── CANCEL ─────────────────────────────────────────────────────────────────
  app.post("/api/store/transfers/:id/cancel", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const user = req.user as any;
    try {
      const existing = await db.execute(sql`SELECT * FROM store_transfers WHERE id = ${req.params.id}`);
      const transfer = existing.rows[0] as any;
      if (!transfer) return res.status(404).json({ message: "Không tìm thấy phiếu" });

      if (transfer.status === "completed") {
        return res.status(400).json({
          message: "Phiếu đã hoàn tất nhận hàng, không thể hủy. Nếu cần xử lý sai, hãy tạo phiếu chuyển ngược.",
        });
      }
      if (transfer.status === "cancelled") {
        return res.status(400).json({ message: "Phiếu đã bị hủy trước đó" });
      }

      if (transfer.status === "draft") {
        // Audit: ghi lại trước khi xóa
        try {
          const [delFromWh, delToWh] = await Promise.all([
            db.execute(sql`SELECT name FROM store_warehouses WHERE id = ${transfer.from_warehouse_id} LIMIT 1`),
            db.execute(sql`SELECT name FROM store_warehouses WHERE id = ${transfer.to_warehouse_id} LIMIT 1`),
          ]);
          const delItemsRow = await db.execute(sql`SELECT product_name, quantity FROM store_transfer_items WHERE transfer_id = ${transfer.id}`);
          const delItems = delItemsRow.rows as any[];
          const delSnap: Record<string, any> = {
            "Mã phiếu":      transfer.code,
            "Trạng thái":    "Nháp",
            "Kho nguồn":     (delFromWh.rows[0] as any)?.name ?? null,
            "Kho đích":      (delToWh.rows[0] as any)?.name ?? null,
            "Ghi chú":       transfer.note ?? null,
            "Số sản phẩm":   delItems.length,
            "Tổng số lượng": delItems.reduce((s, i) => s + i.quantity, 0),
          };
          for (const di of delItems) delSnap[`📦 ${di.product_name}`] = `SL: ${di.quantity}`;
          await createTransferAuditLog({
            transferId: transfer.id,
            transferCode: transfer.code,
            action: "deleted",
            userId: user.id ?? null,
            userName: user.fullName || user.username,
            fromLocationId: transfer.from_location_id ?? null,
            oldContent: delSnap,
            newContent: null,
          });
        } catch (auditErr) { console.error("[Transfer] delete audit error:", auditErr); }

        await db.execute(sql`DELETE FROM store_transfers WHERE id = ${transfer.id}`);
        return res.json({ success: true, action: "deleted", message: "Đã xóa phiếu nháp" });
      }

      // transferring → hoàn lại tồn kho nguồn + xóa phiếu thu nếu có
      const itemRows = await db.execute(sql`SELECT * FROM store_transfer_items WHERE transfer_id = ${req.params.id}`);
      const items = itemRows.rows as any[];

      for (const item of items) {
        await db.execute(sql`
          INSERT INTO store_inventory (product_id, warehouse_id, quantity, updated_at)
          VALUES (${item.product_id}, ${transfer.from_warehouse_id}, ${item.quantity}, NOW())
          ON CONFLICT (product_id, warehouse_id)
          DO UPDATE SET quantity = GREATEST(0, store_inventory.quantity + ${item.quantity}), updated_at = NOW()
        `);
        await db.execute(sql`
          INSERT INTO store_stock_transactions
            (product_id, warehouse_id, receipt_id, receipt_code, type, quantity_delta, status, description, created_by, created_by_name)
          VALUES
            (${item.product_id}, ${transfer.from_warehouse_id}, ${transfer.id}, ${transfer.code},
             'transfer_cancel', ${item.quantity}, 'completed',
             ${'Hủy phiếu chuyển kho ' + transfer.code + ': Hoàn trả về kho nguồn'},
             ${user.id}, ${user.fullName || user.username})
        `);
      }

      // Xóa phiếu thu đã tạo (nếu có)
      await db.execute(sql`DELETE FROM invoices WHERE store_transfer_id = ${transfer.id}`);

      await db.execute(sql`
        UPDATE store_transfers SET status = 'cancelled', updated_at = NOW() WHERE id = ${transfer.id}
      `);

      res.json({ success: true, action: "cancelled", message: "Đã hủy phiếu. Tồn kho nguồn đã được hoàn trả." });
    } catch (err) {
      console.error("[Transfer] cancel error:", err);
      res.status(500).json({ message: "Lỗi khi hủy phiếu chuyển kho" });
    }
  });
}
