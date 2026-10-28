import type { Express } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { eq, asc, ilike, inArray, desc } from "drizzle-orm";
import {
  storeWarehouses,
  storeSuppliers,
  storeCategories,
  storeUnits,
  storeColors,
  storeSizes,
  storeProducts,
  activityLogs,
  users,
  staff,
} from "@shared/schema";
import { z } from "zod";

async function hasProductInventoryHistory(productId: string, productCode: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT (
      EXISTS (SELECT 1 FROM store_stock_transactions WHERE product_id = ${productId}::uuid)
      OR EXISTS (SELECT 1 FROM store_inventory WHERE product_id = ${productId}::uuid AND quantity <> 0)
      OR EXISTS (
        SELECT 1 FROM store_receipt_items
        WHERE product_id = ${productId}::uuid OR product_code = ${productCode}
      )
      OR EXISTS (
        SELECT 1 FROM store_issue_receipt_items
        WHERE product_id = ${productId}::uuid OR product_code = ${productCode}
      )
      OR EXISTS (
        SELECT 1 FROM store_transfer_items
        WHERE product_id = ${productId}::uuid OR product_code = ${productCode}
      )
    ) AS has_history
  `);
  return Boolean((result.rows[0] as any)?.has_history);
}

async function productAuditSnapshot(row: any, executor: any = db) {
  const [category, unit, supplier] = await Promise.all([
    row.categoryId
      ? executor.select({ name: storeCategories.name }).from(storeCategories).where(eq(storeCategories.id, row.categoryId)).limit(1)
      : [],
    row.unitId
      ? executor.select({ name: storeUnits.name }).from(storeUnits).where(eq(storeUnits.id, row.unitId)).limit(1)
      : [],
    row.supplierId
      ? executor.select({ name: storeSuppliers.name }).from(storeSuppliers).where(eq(storeSuppliers.id, row.supplierId)).limit(1)
      : [],
  ]);
  return {
    "Mã sản phẩm": row.code,
    "Tên sản phẩm": row.name,
    "Danh mục": category[0]?.name ?? null,
    "Đơn vị": unit[0]?.name ?? null,
    "Nhà cung cấp": supplier[0]?.name ?? null,
    "Giá nhập": row.costPrice == null ? null : String(row.costPrice),
    "Giá bán": row.salePrice == null ? null : String(row.salePrice),
    "Giá sao": row.starPrice ?? null,
    "Mô tả": row.description ?? null,
    "URL hình ảnh": row.imageUrl ?? null,
    "Có biến thể": row.hasVariants ? "Có" : "Không",
    "Trạng thái": row.status === "active" ? "Đang bán" : "Ngừng bán",
  };
}

async function ensureStoreTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS store_warehouses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(50) NOT NULL,
      name VARCHAR(255) NOT NULL,
      location_id UUID,
      address TEXT,
      min_stock INTEGER DEFAULT 0,
      max_stock INTEGER,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS store_suppliers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(50) NOT NULL,
      name VARCHAR(255) NOT NULL,
      contact_person VARCHAR(255),
      phone VARCHAR(50),
      email VARCHAR(255),
      address TEXT,
      tax_code VARCHAR(50),
      note TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS store_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS store_units (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS store_colors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      hex VARCHAR(20) DEFAULT '#ffffff',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS store_sizes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS store_products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(100) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      category_id UUID REFERENCES store_categories(id) ON DELETE SET NULL,
      unit_id UUID REFERENCES store_units(id) ON DELETE SET NULL,
      supplier_id UUID REFERENCES store_suppliers(id) ON DELETE SET NULL,
      cost_price DECIMAL(15,2) DEFAULT 0,
      sale_price DECIMAL(15,2) DEFAULT 0,
      description TEXT,
      image_url TEXT,
      has_variants BOOLEAN DEFAULT FALSE,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`ALTER TABLE store_products ADD COLUMN IF NOT EXISTS star_price INTEGER`);
  console.log("[Store] Tables ensured");
}

// ── Schemas ──────────────────────────────────────────────────────────────────
const warehouseCreateSchema = z.object({
  code: z.string().min(1, "Mã kho không được để trống"),
  name: z.string().min(1, "Tên kho không được để trống"),
  locationId: z.string().uuid().optional().nullable(),
  address: z.string().optional().nullable(),
  minStock: z.number().int().min(0).optional().nullable(),
  maxStock: z.number().int().min(0).optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
});

const supplierCreateSchema = z.object({
  code: z.string().min(1, "Mã NCC không được để trống"),
  name: z.string().min(1, "Tên nhà cung cấp không được để trống"),
  contactPerson: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  address: z.string().optional().nullable(),
  taxCode: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
});

const categoryCreateSchema = z.object({
  name: z.string().min(1, "Tên danh mục không được để trống"),
  description: z.string().optional().nullable(),
});

const unitCreateSchema = z.object({
  name: z.string().min(1, "Tên đơn vị không được để trống"),
});

const colorCreateSchema = z.object({
  name: z.string().min(1, "Tên màu không được để trống"),
  hex: z.string().optional().nullable(),
});

const sizeCreateSchema = z.object({
  name: z.string().min(1, "Tên kích cỡ không được để trống"),
});

const productCreateSchema = z.object({
  code: z.string().min(1, "Mã sản phẩm không được để trống"),
  name: z.string().min(1, "Tên sản phẩm không được để trống"),
  categoryId: z.string().uuid().optional().nullable(),
  unitId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  costPrice: z.number().min(0).optional().nullable(),
  salePrice: z.number().min(0).optional().nullable(),
  starPrice: z.number().int().min(0).optional().nullable(),
  description: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  hasVariants: z.boolean().default(false),
  status: z.enum(["active", "inactive"]).default("active"),
});

export async function registerStoreRoutes(app: Express) {
  await ensureStoreTables();

  // ── WAREHOUSES ────────────────────────────────────────────────────────────
  app.get("/api/store/warehouses", async (req, res) => {
    try {
      const { allowedLocationIds, isSuperAdmin } = req;
      let rows;
      if (isSuperAdmin || !allowedLocationIds?.length) {
        rows = await db.select().from(storeWarehouses).orderBy(asc(storeWarehouses.createdAt));
      } else {
        rows = await db.select().from(storeWarehouses)
          .where(inArray(storeWarehouses.locationId, allowedLocationIds))
          .orderBy(asc(storeWarehouses.createdAt));
      }
      res.json(rows);
    } catch (err) {
      console.error("[Store] GET warehouses:", err);
      res.status(500).json({ message: "Lỗi khi lấy danh sách kho" });
    }
  });

  app.post("/api/store/warehouses", async (req, res) => {
    try {
      const parsed = warehouseCreateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      // Auto-assign locationId from user's primary location if client didn't send one
      const data: any = { ...parsed.data };
      if (!data.locationId) {
        const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];
        if (allowedLocationIds.length > 0) data.locationId = allowedLocationIds[0];
      }
      const [row] = await db.insert(storeWarehouses).values(data).returning();
      res.status(201).json(row);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ message: "Mã kho đã tồn tại" });
      console.error("[Store] POST warehouse:", err);
      res.status(500).json({ message: "Lỗi khi tạo kho" });
    }
  });

  app.patch("/api/store/warehouses/:id", async (req, res) => {
    try {
      const parsed = warehouseCreateSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const [row] = await db.update(storeWarehouses).set({ ...parsed.data, updatedAt: new Date() }).where(eq(storeWarehouses.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ message: "Không tìm thấy kho" });
      res.json(row);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ message: "Mã kho đã tồn tại" });
      console.error("[Store] PATCH warehouse:", err);
      res.status(500).json({ message: "Lỗi khi cập nhật kho" });
    }
  });

  app.delete("/api/store/warehouses/:id", async (req, res) => {
    try {
      await db.delete(storeWarehouses).where(eq(storeWarehouses.id, req.params.id));
      res.json({ message: "Đã xoá kho" });
    } catch (err) {
      console.error("[Store] DELETE warehouse:", err);
      res.status(500).json({ message: "Lỗi khi xoá kho" });
    }
  });

  // ── SUPPLIERS ─────────────────────────────────────────────────────────────
  app.get("/api/store/suppliers", async (req, res) => {
    try {
      const rows = await db.select().from(storeSuppliers).orderBy(asc(storeSuppliers.createdAt));
      res.json(rows);
    } catch (err) {
      console.error("[Store] GET suppliers:", err);
      res.status(500).json({ message: "Lỗi khi lấy danh sách NCC" });
    }
  });

  app.post("/api/store/suppliers", async (req, res) => {
    try {
      const parsed = supplierCreateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const data = { ...parsed.data, email: parsed.data.email || null };
      const [row] = await db.insert(storeSuppliers).values(data).returning();
      res.status(201).json(row);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ message: "Mã NCC đã tồn tại" });
      console.error("[Store] POST supplier:", err);
      res.status(500).json({ message: "Lỗi khi tạo nhà cung cấp" });
    }
  });

  app.patch("/api/store/suppliers/:id", async (req, res) => {
    try {
      const parsed = supplierCreateSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const data = { ...parsed.data, email: parsed.data.email || null };
      const [row] = await db.update(storeSuppliers).set({ ...data, updatedAt: new Date() }).where(eq(storeSuppliers.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ message: "Không tìm thấy NCC" });
      res.json(row);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ message: "Mã NCC đã tồn tại" });
      console.error("[Store] PATCH supplier:", err);
      res.status(500).json({ message: "Lỗi khi cập nhật NCC" });
    }
  });

  app.delete("/api/store/suppliers/:id", async (req, res) => {
    try {
      await db.delete(storeSuppliers).where(eq(storeSuppliers.id, req.params.id));
      res.json({ message: "Đã xoá nhà cung cấp" });
    } catch (err) {
      console.error("[Store] DELETE supplier:", err);
      res.status(500).json({ message: "Lỗi khi xoá NCC" });
    }
  });

  // ── CATEGORIES ────────────────────────────────────────────────────────────
  app.get("/api/store/categories", async (req, res) => {
    try {
      const rows = await db.select().from(storeCategories).orderBy(asc(storeCategories.name));
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi lấy danh mục" });
    }
  });

  app.post("/api/store/categories", async (req, res) => {
    try {
      const parsed = categoryCreateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const [row] = await db.insert(storeCategories).values(parsed.data).returning();
      res.status(201).json(row);
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi tạo danh mục" });
    }
  });

  app.patch("/api/store/categories/:id", async (req, res) => {
    try {
      const parsed = categoryCreateSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const [row] = await db.update(storeCategories).set({ ...parsed.data, updatedAt: new Date() }).where(eq(storeCategories.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ message: "Không tìm thấy danh mục" });
      res.json(row);
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi cập nhật danh mục" });
    }
  });

  app.delete("/api/store/categories/:id", async (req, res) => {
    try {
      await db.delete(storeCategories).where(eq(storeCategories.id, req.params.id));
      res.json({ message: "Đã xoá danh mục" });
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi xoá danh mục" });
    }
  });

  // ── UNITS ─────────────────────────────────────────────────────────────────
  app.get("/api/store/units", async (req, res) => {
    try {
      const rows = await db.select().from(storeUnits).orderBy(asc(storeUnits.name));
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi lấy đơn vị" });
    }
  });

  app.post("/api/store/units", async (req, res) => {
    try {
      const parsed = unitCreateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const [row] = await db.insert(storeUnits).values(parsed.data).returning();
      res.status(201).json(row);
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi tạo đơn vị" });
    }
  });

  app.patch("/api/store/units/:id", async (req, res) => {
    try {
      const parsed = unitCreateSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const [row] = await db.update(storeUnits).set({ ...parsed.data, updatedAt: new Date() }).where(eq(storeUnits.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ message: "Không tìm thấy đơn vị" });
      res.json(row);
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi cập nhật đơn vị" });
    }
  });

  app.delete("/api/store/units/:id", async (req, res) => {
    try {
      await db.delete(storeUnits).where(eq(storeUnits.id, req.params.id));
      res.json({ message: "Đã xoá đơn vị" });
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi xoá đơn vị" });
    }
  });

  // ── COLORS ────────────────────────────────────────────────────────────────
  app.get("/api/store/colors", async (req, res) => {
    try {
      const rows = await db.select().from(storeColors).orderBy(asc(storeColors.name));
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi lấy màu sắc" });
    }
  });

  app.post("/api/store/colors", async (req, res) => {
    try {
      const parsed = colorCreateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const [row] = await db.insert(storeColors).values(parsed.data).returning();
      res.status(201).json(row);
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi tạo màu" });
    }
  });

  app.patch("/api/store/colors/:id", async (req, res) => {
    try {
      const parsed = colorCreateSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const [row] = await db.update(storeColors).set({ ...parsed.data, updatedAt: new Date() }).where(eq(storeColors.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ message: "Không tìm thấy màu" });
      res.json(row);
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi cập nhật màu" });
    }
  });

  app.delete("/api/store/colors/:id", async (req, res) => {
    try {
      await db.delete(storeColors).where(eq(storeColors.id, req.params.id));
      res.json({ message: "Đã xoá màu" });
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi xoá màu" });
    }
  });

  // ── SIZES ─────────────────────────────────────────────────────────────────
  app.get("/api/store/sizes", async (req, res) => {
    try {
      const rows = await db.select().from(storeSizes).orderBy(asc(storeSizes.name));
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi lấy kích cỡ" });
    }
  });

  app.post("/api/store/sizes", async (req, res) => {
    try {
      const parsed = sizeCreateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const [row] = await db.insert(storeSizes).values(parsed.data).returning();
      res.status(201).json(row);
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi tạo kích cỡ" });
    }
  });

  app.patch("/api/store/sizes/:id", async (req, res) => {
    try {
      const parsed = sizeCreateSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const [row] = await db.update(storeSizes).set({ ...parsed.data, updatedAt: new Date() }).where(eq(storeSizes.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ message: "Không tìm thấy kích cỡ" });
      res.json(row);
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi cập nhật kích cỡ" });
    }
  });

  app.delete("/api/store/sizes/:id", async (req, res) => {
    try {
      await db.delete(storeSizes).where(eq(storeSizes.id, req.params.id));
      res.json({ message: "Đã xoá kích cỡ" });
    } catch (err) {
      res.status(500).json({ message: "Lỗi khi xoá kích cỡ" });
    }
  });

  // ── PRODUCTS ──────────────────────────────────────────────────────────────
  app.get("/api/store/products", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
      const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "20"))));
      const offset = (page - 1) * pageSize;
      const q = String(req.query.q ?? "").trim();
      const categoryId = String(req.query.categoryId ?? "").trim();
      const status = String(req.query.status ?? "").trim();

      const conditions: any[] = [];
      if (q) conditions.push(sql`(${storeProducts.name} ILIKE ${'%' + q + '%'} OR ${storeProducts.code} ILIKE ${'%' + q + '%'})`);
      if (categoryId) conditions.push(sql`${storeProducts.categoryId} = ${categoryId}::uuid`);
      if (status) conditions.push(sql`${storeProducts.status} = ${status}`);

      const whereSQL = conditions.length > 0 ? sql.join(conditions, sql` AND `) : sql`1=1`;

      const [countRows, rows] = await Promise.all([
        db.execute(sql`SELECT COUNT(*)::int AS total FROM store_products WHERE ${whereSQL}`),
        db.execute(sql`
          SELECT store_products.*,
            (
              EXISTS (SELECT 1 FROM store_stock_transactions t WHERE t.product_id = store_products.id)
              OR EXISTS (
                SELECT 1 FROM store_inventory i
                WHERE i.product_id = store_products.id AND i.quantity <> 0
              )
              OR EXISTS (
                SELECT 1 FROM store_receipt_items ri
                WHERE ri.product_id = store_products.id OR ri.product_code = store_products.code
              )
              OR EXISTS (
                SELECT 1 FROM store_issue_receipt_items ii
                WHERE ii.product_id = store_products.id OR ii.product_code = store_products.code
              )
              OR EXISTS (
                SELECT 1 FROM store_transfer_items ti
                WHERE ti.product_id = store_products.id OR ti.product_code = store_products.code
              )
            ) AS has_inventory_history
          FROM store_products
          WHERE ${whereSQL}
          ORDER BY created_at ASC
          LIMIT ${pageSize} OFFSET ${offset}
        `),
      ]);

      const total = (countRows.rows[0] as any)?.total ?? 0;
      const data = (rows.rows as any[]).map(r => ({
        id: r.id,
        code: r.code,
        name: r.name,
        categoryId: r.category_id,
        unitId: r.unit_id,
        supplierId: r.supplier_id,
        costPrice: r.cost_price,
        salePrice: r.sale_price,
        starPrice: r.star_price,
        description: r.description,
        imageUrl: r.image_url,
        hasVariants: r.has_variants,
        status: r.status,
        hasInventoryHistory: Boolean(r.has_inventory_history),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
      res.json({ data, total });
    } catch (err) {
      console.error("[Store] GET products:", err);
      res.status(500).json({ message: "Lỗi khi lấy danh sách sản phẩm" });
    }
  });

  app.get("/api/store/products/history", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
      const pageSize = Math.min(200, Math.max(1, Number.parseInt(String(req.query.pageSize ?? "50"), 10) || 50));
      const actions = ["store.product.created", "store.product.updated", "store.product.deleted"];
      const where = inArray(activityLogs.action, actions);
      const [totalResult, events] = await Promise.all([
        db.select({ total: sql<number>`count(*)::int` }).from(activityLogs).where(where),
        db.select({
          id: activityLogs.id,
          action: activityLogs.action,
          oldContent: activityLogs.oldContent,
          newContent: activityLogs.newContent,
          createdAt: activityLogs.createdAt,
          userName: sql<string | null>`COALESCE(${staff.fullName}, ${users.username})`,
        })
          .from(activityLogs)
          .leftJoin(users, eq(activityLogs.userId, users.id))
          .leftJoin(staff, eq(staff.userId, activityLogs.userId))
          .where(where)
          .orderBy(desc(activityLogs.createdAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
      ]);
      res.json({ events, total: Number(totalResult[0]?.total ?? 0) });
    } catch (err) {
      console.error("[Store] GET product history:", err);
      res.status(500).json({ message: "Lỗi khi lấy nhật ký sản phẩm" });
    }
  });

  app.post("/api/store/products", async (req, res) => {
    try {
      const parsed = productCreateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const data = {
        ...parsed.data,
        costPrice: parsed.data.costPrice != null ? String(parsed.data.costPrice) : "0",
        salePrice: parsed.data.salePrice != null ? String(parsed.data.salePrice) : "0",
      };
      const actor = (req as any).user;
      const [row] = await db.transaction(async tx => {
        const [created] = await tx.insert(storeProducts).values(data).returning();
        await tx.insert(activityLogs).values({
          userId: actor?.id ?? null,
          action: "store.product.created",
          newContent: JSON.stringify(await productAuditSnapshot(created, tx)),
        });
        return [created];
      });
      res.status(201).json(row);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ message: "Mã sản phẩm đã tồn tại" });
      console.error("[Store] POST product:", err);
      res.status(500).json({ message: "Lỗi khi tạo sản phẩm" });
    }
  });

  app.patch("/api/store/products/:id", async (req, res) => {
    try {
      const parsed = productCreateSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const [existing] = await db
        .select()
        .from(storeProducts)
        .where(eq(storeProducts.id, req.params.id))
        .limit(1);
      if (!existing) return res.status(404).json({ message: "Không tìm thấy sản phẩm" });
      if (await hasProductInventoryHistory(existing.id, existing.code)) {
        return res.status(409).json({
          message: "Sản phẩm đã có phiếu hoặc phát sinh tồn kho, không thể sửa. Nếu cần mã mới, hãy tạo sản phẩm mới.",
        });
      }
      const data: any = { ...parsed.data, updatedAt: new Date() };
      if (parsed.data.costPrice != null) data.costPrice = String(parsed.data.costPrice);
      if (parsed.data.salePrice != null) data.salePrice = String(parsed.data.salePrice);
      const actor = (req as any).user;
      const [row] = await db.transaction(async tx => {
        const [updated] = await tx.update(storeProducts).set(data).where(eq(storeProducts.id, req.params.id)).returning();
        if (!updated) return [null];
        await tx.insert(activityLogs).values({
          userId: actor?.id ?? null,
          action: "store.product.updated",
          oldContent: JSON.stringify(await productAuditSnapshot(existing, tx)),
          newContent: JSON.stringify(await productAuditSnapshot(updated, tx)),
        });
        return [updated];
      });
      if (!row) return res.status(404).json({ message: "Không tìm thấy sản phẩm" });
      res.json(row);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ message: "Mã sản phẩm đã tồn tại" });
      console.error("[Store] PATCH product:", err);
      res.status(500).json({ message: "Lỗi khi cập nhật sản phẩm" });
    }
  });

  app.delete("/api/store/products/:id", async (req, res) => {
    try {
      const [existing] = await db
        .select()
        .from(storeProducts)
        .where(eq(storeProducts.id, req.params.id))
        .limit(1);
      if (!existing) return res.status(404).json({ message: "Không tìm thấy sản phẩm" });
      if (await hasProductInventoryHistory(existing.id, existing.code)) {
        return res.status(409).json({
          message: "Sản phẩm đã có phiếu hoặc phát sinh tồn kho, không thể xoá.",
        });
      }
      const actor = (req as any).user;
      await db.transaction(async tx => {
        await tx.delete(storeProducts).where(eq(storeProducts.id, req.params.id));
        await tx.insert(activityLogs).values({
          userId: actor?.id ?? null,
          action: "store.product.deleted",
          oldContent: JSON.stringify(await productAuditSnapshot(existing, tx)),
        });
      });
      res.json({ message: "Đã xoá sản phẩm" });
    } catch (err) {
      console.error("[Store] DELETE product:", err);
      res.status(500).json({ message: "Lỗi khi xoá sản phẩm" });
    }
  });
}
