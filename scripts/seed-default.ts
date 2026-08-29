/**
 * Seed dữ liệu mặc định vào DB mới (sau khi đã push schema)
 *
 * Dữ liệu được seed:
 *  - 1 cơ sở chính (location MAIN)
 *  - Phòng ban + vai trò hệ thống (Khách hàng, Đào tạo)
 *  - Tài khoản super admin (username: admin / admin123)
 *  - Danh mục tài chính mặc định
 *  - 15 mẫu thông báo Zalo mặc định
 *  - Cấu hình trung tâm (center_config)
 *
 * Chạy:
 *   TARGET_DB_URL="postgresql://user:pass@host:5432/dbname" npx tsx scripts/seed-default.ts
 *
 * Idempotent — chạy nhiều lần không bị trùng dữ liệu.
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and } from "drizzle-orm";
import * as schema from "../shared/schema";
import { scryptSync, randomBytes } from "crypto";

const TARGET_URL =
  process.env.TARGET_DB_URL ||
  process.env.APP_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!TARGET_URL) {
  console.error("❌ Cần set TARGET_DB_URL hoặc APP_DATABASE_URL");
  process.exit(1);
}

const pool = new Pool({ connectionString: TARGET_URL, max: 3 });
const db = drizzle(pool, { schema });

// ---------- helpers ----------

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const buf = scryptSync(password, salt, 64) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function upsertIf<T extends Record<string, any>>(
  label: string,
  checkFn: () => Promise<boolean>,
  insertFn: () => Promise<T>,
): Promise<T | null> {
  const exists = await checkFn();
  if (exists) {
    console.log(`  [SKIP] ${label} đã tồn tại`);
    return null;
  }
  const result = await insertFn();
  console.log(`  [OK]   ${label} đã tạo`);
  return result;
}

// ---------- main ----------

async function main() {
  console.log("[seed] Kết nối DB...");
  const client = await pool.connect();
  const { rows } = await client.query("SELECT current_database()");
  client.release();
  console.log(`[seed] ✅ DB = ${rows[0].current_database}\n`);

  // ── 1. Cơ sở chính ──────────────────────────────────────────────────────────
  console.log("── 1. Location (cơ sở chính) ──");
  const [existingLoc] = await db
    .select()
    .from(schema.locations)
    .where(eq(schema.locations.code, "MAIN"));

  let mainLocationId = existingLoc?.id;

  if (!existingLoc) {
    const [loc] = await db
      .insert(schema.locations)
      .values({
        name: "Cơ sở chính",
        code: "MAIN",
        address: "123 Đường ABC, Quận XYZ, TP.HCM",
        phone: "0123456789",
        isMain: true,
        isActive: true,
      })
      .returning();
    mainLocationId = loc.id;
    console.log("  [OK]   Cơ sở chính đã tạo");
  } else {
    console.log("  [SKIP] Cơ sở chính đã tồn tại");
  }

  // ── 2. Phòng ban + Vai trò hệ thống ─────────────────────────────────────────
  console.log("\n── 2. Departments & Roles ──");

  let deptCustomer = (
    await db
      .select()
      .from(schema.departments)
      .where(eq(schema.departments.name, "Phòng Khách hàng"))
  )[0];

  if (!deptCustomer) {
    [deptCustomer] = await db
      .insert(schema.departments)
      .values({ name: "Phòng Khách hàng", isSystem: true })
      .returning();
    console.log("  [OK]   Phòng Khách hàng đã tạo");

    await db.insert(schema.roles).values([
      { name: "Học viên", departmentId: deptCustomer.id, isSystem: true },
      { name: "Phụ huynh", departmentId: deptCustomer.id, isSystem: true },
    ]);
    console.log("  [OK]   Vai trò: Học viên, Phụ huynh");
  } else {
    console.log("  [SKIP] Phòng Khách hàng đã tồn tại");
  }

  let deptTraining = (
    await db
      .select()
      .from(schema.departments)
      .where(eq(schema.departments.name, "Phòng Đào tạo"))
  )[0];

  if (!deptTraining) {
    [deptTraining] = await db
      .insert(schema.departments)
      .values({ name: "Phòng Đào tạo", isSystem: true })
      .returning();
    console.log("  [OK]   Phòng Đào tạo đã tạo");

    await db.insert(schema.roles).values([
      { name: "Giáo viên", departmentId: deptTraining.id, isSystem: true },
      { name: "Trợ giảng", departmentId: deptTraining.id, isSystem: true },
    ]);
    console.log("  [OK]   Vai trò: Giáo viên, Trợ giảng");
  } else {
    console.log("  [SKIP] Phòng Đào tạo đã tồn tại");
  }

  // ── 3. Super Admin ───────────────────────────────────────────────────────────
  console.log("\n── 3. Super Admin ──");

  const [existingAdmin] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, "admin"));

  if (!existingAdmin) {
    const passwordHash = hashPassword("admin123");
    const [adminUser] = await db
      .insert(schema.users)
      .values({ username: "admin", passwordHash, isActive: true })
      .returning();
    console.log("  [OK]   User 'admin' đã tạo (pass: admin123)");

    const [adminStaff] = await db
      .insert(schema.staff)
      .values({
        userId: adminUser.id,
        fullName: "System Administrator",
        code: "ADMIN-01",
        status: "Hoạt động",
      })
      .returning();
    console.log("  [OK]   Staff ADMIN-01 đã tạo");

    if (mainLocationId) {
      await db.insert(schema.staffAssignments).values({
        staffId: adminStaff.id,
        locationId: mainLocationId,
      });
      console.log("  [OK]   Admin gán vào Cơ sở chính");
    }
  } else {
    console.log("  [SKIP] User 'admin' đã tồn tại");
  }

  // ── 4. Danh mục tài chính mặc định ──────────────────────────────────────────
  console.log("\n── 4. Finance categories ──");

  const defaultCategories = [
    { name: "Đặt cọc", type: "income" },
    { name: "Học phí", type: "income" },
    { name: "Kho", type: "income" },
    { name: "Chuyển lớp", type: "income" },
    { name: "Lương", type: "expense" },
    { name: "Kho", type: "expense" },
    { name: "Hoàn tiền", type: "expense" },
  ] as const;

  for (const cat of defaultCategories) {
    const existing = await db
      .select({ id: schema.financeTransactionCategories.id })
      .from(schema.financeTransactionCategories)
      .where(
        and(
          eq(schema.financeTransactionCategories.name, cat.name),
          eq(schema.financeTransactionCategories.type, cat.type),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.financeTransactionCategories).values({
        name: cat.name,
        type: cat.type,
        isDefault: true,
        isActive: true,
      });
      console.log(`  [OK]   ${cat.type}: ${cat.name}`);
    } else {
      console.log(`  [SKIP] ${cat.type}: ${cat.name}`);
    }
  }

  // ── 5. Mẫu thông báo Zalo ────────────────────────────────────────────────────
  console.log("\n── 5. Notification templates ──");

  const defaultTemplates = [
    { code: "attendance_reminder", name: "Nhắc lịch học", channel: "zalo" },
    { code: "attendance_result", name: "Kết quả điểm danh", channel: "zalo" },
    { code: "class_changed", name: "Đổi lịch học", channel: "zalo" },
    { code: "exam_score", name: "Điểm kiểm tra online", channel: "zalo" },
    { code: "homework_score", name: "Điểm BTVN", channel: "zalo" },
    { code: "invoice_created", name: "Tạo hoá đơn", channel: "zalo" },
    { code: "invoice_paid", name: "Thanh toán hoá đơn", channel: "zalo" },
    { code: "schedule_cancel_session", name: "Huỷ buổi học", channel: "zalo" },
    { code: "schedule_exclude_dates", name: "Loại trừ ngày học", channel: "zalo" },
    { code: "schedule_update_cycle", name: "Cập nhật chu kỳ lịch học", channel: "zalo" },
    { code: "schedule_update_session", name: "Cập nhật buổi học", channel: "zalo" },
    { code: "score_sheet", name: "Bảng điểm", channel: "zalo" },
    { code: "session_content", name: "Giao nội dung buổi học", channel: "zalo" },
    { code: "teacher_feedback", name: "Nhận xét giáo viên", channel: "zalo" },
    { code: "tuition_due", name: "Nhắc học phí", channel: "zalo" },
  ];

  for (const tmpl of defaultTemplates) {
    const existing = await db
      .select({ id: schema.notificationTemplates.id })
      .from(schema.notificationTemplates)
      .where(eq(schema.notificationTemplates.code, tmpl.code))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.notificationTemplates).values({
        code: tmpl.code,
        name: tmpl.name,
        channel: tmpl.channel,
        enabled: true,
      });
      console.log(`  [OK]   ${tmpl.code}`);
    } else {
      console.log(`  [SKIP] ${tmpl.code}`);
    }
  }

  // ── 6. Center config ─────────────────────────────────────────────────────────
  console.log("\n── 6. Center config ──");

  const raw = await pool.query(
    "SELECT id FROM center_config WHERE singleton_key = 'default' LIMIT 1"
  );

  if (raw.rows.length === 0) {
    await pool.query(
      "INSERT INTO center_config (center_url, singleton_key) VALUES ($1, 'default') ON CONFLICT (singleton_key) DO NOTHING",
      [""]
    );
    console.log("  [OK]   center_config đã tạo");
  } else {
    console.log("  [SKIP] center_config đã tồn tại");
  }

  // ── 7. center_registry ───────────────────────────────────────────────────────
  console.log("\n── 7. center_registry table ──");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS center_registry (
      center_id VARCHAR(100) PRIMARY KEY,
      center_url TEXT NOT NULL DEFAULT '',
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      registered_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  console.log("  [OK]   center_registry đã sẵn sàng");

  // ── Done ─────────────────────────────────────────────────────────────────────
  console.log("\n[seed] ✅ Seed dữ liệu mặc định hoàn tất!");
  console.log("       Tài khoản đăng nhập: admin / admin123\n");

  await pool.end();
}

main().catch((e) => {
  console.error("[seed] ❌ Lỗi:", e.message || e);
  process.exit(1);
});
