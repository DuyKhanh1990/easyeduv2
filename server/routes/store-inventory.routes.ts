import type { Express } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

async function ensureInventoryExtTables() {
  // Reservations table (giữ chỗ)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS store_inventory_reservations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id VARCHAR(100) NOT NULL,
      product_id UUID NOT NULL,
      warehouse_id UUID NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      UNIQUE (session_id, product_id, warehouse_id)
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_reservations_expires ON store_inventory_reservations(expires_at)
  `);

  // Reservation config table (cấu hình thời gian giữ chỗ)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS store_reservation_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      session_minutes INTEGER NOT NULL DEFAULT 5,
      draft_minutes INTEGER NOT NULL DEFAULT 1440
    )
  `);
  await db.execute(sql`
    INSERT INTO store_reservation_config (id, session_minutes, draft_minutes)
    VALUES (1, 5, 1440)
    ON CONFLICT (id) DO NOTHING
  `);

  // Stock transactions table (lịch sử biến động kho — source of truth)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS store_stock_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL,
      warehouse_id UUID NOT NULL,
      receipt_id UUID,
      receipt_code VARCHAR(50),
      type VARCHAR(50) NOT NULL,
      quantity_delta INTEGER NOT NULL,
      status VARCHAR(50) DEFAULT 'completed',
      description TEXT,
      created_by UUID,
      created_by_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_sst_product_warehouse ON store_stock_transactions(product_id, warehouse_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_sst_receipt_id ON store_stock_transactions(receipt_id)
  `);

  // ── MIGRATION: populate transactions from existing completed receipts ────────
  await db.execute(sql`
    INSERT INTO store_stock_transactions
      (product_id, warehouse_id, receipt_id, receipt_code, type, quantity_delta, status, created_by, created_by_name, created_at)
    SELECT
      ri.product_id, sr.warehouse_id, sr.id, sr.code,
      'import', ri.quantity, 'completed',
      sr.created_by, sr.created_by_name, sr.created_at
    FROM store_receipt_items ri
    JOIN store_receipts sr ON sr.id = ri.receipt_id
    WHERE sr.status = 'completed'
      AND ri.product_id IS NOT NULL
      AND sr.warehouse_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM store_stock_transactions t
        WHERE t.receipt_id = sr.id AND t.product_id = ri.product_id
          AND t.type = 'import'
      )
  `);

  await db.execute(sql`
    INSERT INTO store_stock_transactions
      (product_id, warehouse_id, receipt_id, receipt_code, type, quantity_delta, status, created_by, created_by_name, created_at)
    SELECT
      ii.product_id, ir.warehouse_id, ir.id, ir.code,
      'export', -ii.quantity, 'completed',
      ir.created_by, ir.created_by_name, ir.created_at
    FROM store_issue_receipt_items ii
    JOIN store_issue_receipts ir ON ir.id = ii.receipt_id
    WHERE ir.status = 'completed'
      AND ii.product_id IS NOT NULL
      AND ir.warehouse_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM store_stock_transactions t
        WHERE t.receipt_id = ir.id AND t.product_id = ii.product_id
          AND t.type = 'export'
      )
  `);

  // ── RECOMPUTE store_inventory.quantity from store_stock_transactions (includes transfers) ───
  // Dùng store_stock_transactions làm nguồn sự thật duy nhất — bao gồm nhập/xuất/chuyển kho
  await db.execute(sql`
    UPDATE store_inventory si
    SET
      quantity = GREATEST(0, COALESCE((
        SELECT SUM(t.quantity_delta)
        FROM store_stock_transactions t
        WHERE t.product_id = si.product_id
          AND t.warehouse_id = si.warehouse_id
      ), 0)),
      updated_at = NOW()
  `);

  console.log("[Store] Inventory ext tables ensured");
}

export async function cleanupExpiredReservations() {
  await db.execute(sql`DELETE FROM store_inventory_reservations WHERE expires_at < NOW()`);
}

async function getReservationConfig(): Promise<{ sessionMinutes: number; draftMinutes: number }> {
  try {
    const rows = await db.execute(sql`SELECT session_minutes, draft_minutes FROM store_reservation_config LIMIT 1`);
    const row = rows.rows[0] as any;
    return {
      sessionMinutes: Math.max(1, parseInt(String(row?.session_minutes ?? 5))),
      draftMinutes: Math.max(1, parseInt(String(row?.draft_minutes ?? 1440))),
    };
  } catch {
    return { sessionMinutes: 5, draftMinutes: 1440 };
  }
}

// ── LOG STOCK TRANSACTION ───────────────────────────────────────────────────────
export async function logStockTransaction(params: {
  productId: string;
  warehouseId: string;
  receiptId: string;
  receiptCode: string;
  type: "import" | "export" | "edit_import" | "edit_export" | "cancel_import" | "cancel_export";
  quantityDelta: number;
  status?: string;
  description?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt?: string | null;
}) {
  try {
    if (params.createdAt) {
      await db.execute(sql`
        INSERT INTO store_stock_transactions
          (product_id, warehouse_id, receipt_id, receipt_code, type, quantity_delta, status, description, created_by, created_by_name, created_at)
        VALUES
          (${params.productId}, ${params.warehouseId}, ${params.receiptId}, ${params.receiptCode},
           ${params.type}, ${params.quantityDelta}, ${params.status ?? "completed"},
           ${params.description ?? null}, ${params.createdBy ?? null}, ${params.createdByName ?? null},
           ${params.createdAt})
      `);
    } else {
      await db.execute(sql`
        INSERT INTO store_stock_transactions
          (product_id, warehouse_id, receipt_id, receipt_code, type, quantity_delta, status, description, created_by, created_by_name)
        VALUES
          (${params.productId}, ${params.warehouseId}, ${params.receiptId}, ${params.receiptCode},
           ${params.type}, ${params.quantityDelta}, ${params.status ?? "completed"},
           ${params.description ?? null}, ${params.createdBy ?? null}, ${params.createdByName ?? null})
      `);
    }
  } catch (err) {
    console.error("[StockTransaction] log error:", err);
  }
}

export async function registerStoreInventoryRoutes(app: Express) {
  await ensureInventoryExtTables();

  // ── LIST INVENTORY ──────────────────────────────────────────────────────────
  app.get("/api/store/reservation-config", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    res.json(await getReservationConfig());
  });

  app.put("/api/store/reservation-config", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const sessionMinutes = Math.max(1, parseInt(String(req.body.sessionMinutes ?? 5)));
    const draftMinutes = Math.max(1, parseInt(String(req.body.draftMinutes ?? 1440)));
    try {
      await db.execute(sql`
        UPDATE store_reservation_config
        SET session_minutes = ${sessionMinutes}, draft_minutes = ${draftMinutes}
        WHERE id = 1
      `);
      res.json({ sessionMinutes, draftMinutes });
    } catch (err) {
      console.error("[ReservationConfig] PUT error:", err);
      res.status(500).json({ message: "Lỗi khi lưu cấu hình" });
    }
  });

  app.get("/api/store/inventory", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    await cleanupExpiredReservations();
    const { q, warehouseId, status } = req.query as { q?: string; warehouseId?: string; status?: string };
    const cfg = await getReservationConfig();
    const draftCutoff = new Date(Date.now() - cfg.draftMinutes * 60 * 1000).toISOString();
    try {
      const rows = await db.execute(sql`
        SELECT
          sp.id                           AS product_id,
          sp.code,
          sp.name,
          COALESCE(sp.cost_price, 0)      AS cost_price,
          sw.id                           AS warehouse_id,
          sw.name                         AS warehouse_name,
          COALESCE(sw.min_stock, 0)       AS min_stock,
          COALESCE((
            SELECT SUM(t.quantity_delta)
            FROM store_stock_transactions t
            WHERE t.product_id = sp.id AND t.warehouse_id = sw.id
          ), 0)::int                      AS actual_stock,
          COALESCE((
            SELECT SUM(t.quantity_delta)
            FROM store_stock_transactions t
            WHERE t.product_id = sp.id AND t.warehouse_id = sw.id
              AND t.quantity_delta > 0
          ), 0)::int                      AS total_import,
          COALESCE((
            SELECT SUM(-t.quantity_delta)
            FROM store_stock_transactions t
            WHERE t.product_id = sp.id AND t.warehouse_id = sw.id
              AND t.quantity_delta < 0
          ), 0)::int                      AS total_export,
          (
            COALESCE((
              SELECT SUM(r.quantity)
              FROM store_inventory_reservations r
              WHERE r.product_id = sp.id
                AND r.warehouse_id = sw.id
                AND r.expires_at > NOW()
            ), 0)
            +
            COALESCE((
              SELECT SUM(ii.quantity)
              FROM store_issue_receipt_items ii
              JOIN store_issue_receipts ir ON ir.id = ii.receipt_id
              WHERE ii.product_id = sp.id
                AND ir.warehouse_id = sw.id
                AND ir.status = 'draft'
                AND ir.updated_at > ${draftCutoff}
            ), 0)
          )::int                          AS reserved_qty,
          si.updated_at
        FROM store_products sp
        JOIN store_inventory si ON si.product_id = sp.id
        JOIN store_warehouses sw ON sw.id = si.warehouse_id
        WHERE TRUE
          AND ${q ? sql`(sp.name ILIKE ${'%' + q + '%'} OR sp.code ILIKE ${'%' + q + '%'})` : sql`TRUE`}
          AND ${warehouseId ? sql`sw.id = ${warehouseId}` : sql`TRUE`}
          AND ${(!req.isSuperAdmin && req.allowedLocationIds?.length) ? sql`sw.location_id = ANY(ARRAY[${sql.raw(req.allowedLocationIds.map((id: string) => `'${id}'`).join(','))}]::uuid[])` : sql`TRUE`}
        ORDER BY sp.name, sw.name
      `);

      let data = (rows.rows as any[]).map(r => {
        const actual = Math.max(0, parseInt(String(r.actual_stock ?? 0)));
        const reserved = Math.min(parseInt(String(r.reserved_qty ?? 0)), actual);
        const available = Math.max(0, actual - reserved);
        const minStock = parseInt(String(r.min_stock ?? 0));
        const statusVal = actual <= 0 ? "out" : actual <= minStock ? "low" : "ok";
        return {
          productId: r.product_id,
          code: r.code,
          name: r.name,
          costPrice: parseFloat(String(r.cost_price ?? 0)) || 0,
          warehouseId: r.warehouse_id,
          warehouseName: r.warehouse_name || "N/A",
          totalImport: parseInt(String(r.total_import ?? 0)),
          totalExport: parseInt(String(r.total_export ?? 0)),
          actualStock: actual,
          reservedQty: reserved,
          availableQty: available,
          status: statusVal,
          updatedAt: r.updated_at,
        };
      });

      if (status === "out") data = data.filter(d => d.status === "out");
      else if (status === "low") data = data.filter(d => d.status === "low");
      else if (status === "ok") data = data.filter(d => d.status === "ok");

      const dateFrom = String(req.query.dateFrom ?? "").trim();
      const dateTo = String(req.query.dateTo ?? "").trim();
      if (dateFrom) {
        const from = new Date(dateFrom + "T00:00:00");
        data = data.filter(d => d.updatedAt && new Date(d.updatedAt) >= from);
      }
      if (dateTo) {
        const to = new Date(dateTo + "T23:59:59");
        data = data.filter(d => d.updatedAt && new Date(d.updatedAt) <= to);
      }

      const total = data.length;
      const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
      const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "20"))));
      const paged = data.slice((page - 1) * pageSize, page * pageSize);

      res.json({ data: paged, total });
    } catch (err) {
      console.error("[Inventory] GET list error:", err);
      res.status(500).json({ message: "Lỗi khi lấy danh sách tồn kho" });
    }
  });

  // ── INVENTORY HISTORY ───────────────────────────────────────────────────────
  app.get("/api/store/inventory/:productId/history", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const { productId } = req.params;
    const { warehouseId } = req.query as { warehouseId?: string };
    try {
      const rows = await db.execute(sql`
        SELECT
          t.created_at    AS time,
          t.receipt_code,
          t.type,
          t.quantity_delta,
          t.status,
          t.description,
          t.created_by_name AS created_by
        FROM store_stock_transactions t
        WHERE t.product_id = ${productId}
          AND ${warehouseId ? sql`t.warehouse_id = ${warehouseId}` : sql`TRUE`}
        ORDER BY t.created_at DESC
        LIMIT 200
      `);
      res.json(rows.rows);
    } catch (err) {
      console.error("[Inventory] GET history error:", err);
      res.status(500).json({ message: "Lỗi khi lấy lịch sử tồn kho" });
    }
  });

  // ── RESERVATIONS ────────────────────────────────────────────────────────────

  app.post("/api/store/reservations", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    await cleanupExpiredReservations();
    const { sessionId, productId, warehouseId, quantity } = req.body;
    if (!sessionId || !productId || !warehouseId || typeof quantity !== "number") {
      return res.status(400).json({ message: "Thiếu thông tin giữ chỗ" });
    }
    try {
      const cfg = await getReservationConfig();
      const expiresAt = new Date(Date.now() + cfg.sessionMinutes * 60 * 1000).toISOString();
      await db.execute(sql`
        INSERT INTO store_inventory_reservations
          (session_id, product_id, warehouse_id, quantity, expires_at)
        VALUES
          (${sessionId}, ${productId}, ${warehouseId}, ${quantity}, ${expiresAt})
        ON CONFLICT (session_id, product_id, warehouse_id)
        DO UPDATE SET quantity = ${quantity}, expires_at = ${expiresAt}
      `);
      res.json({ success: true });
    } catch (err) {
      console.error("[Inventory] POST reservation error:", err);
      res.status(500).json({ message: "Lỗi khi giữ chỗ sản phẩm" });
    }
  });

  app.delete("/api/store/reservations/:sessionId", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      await db.execute(sql`
        DELETE FROM store_inventory_reservations WHERE session_id = ${req.params.sessionId}
      `);
      res.json({ success: true });
    } catch (err) {
      console.error("[Inventory] DELETE session reservations error:", err);
      res.status(500).json({ message: "Lỗi khi hủy giữ chỗ" });
    }
  });

  app.delete("/api/store/reservations/:sessionId/:productId/:warehouseId", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      await db.execute(sql`
        DELETE FROM store_inventory_reservations
        WHERE session_id   = ${req.params.sessionId}
          AND product_id   = ${req.params.productId}
          AND warehouse_id = ${req.params.warehouseId}
      `);
      res.json({ success: true });
    } catch (err) {
      console.error("[Inventory] DELETE product reservation error:", err);
      res.status(500).json({ message: "Lỗi khi hủy giữ chỗ sản phẩm" });
    }
  });
}
