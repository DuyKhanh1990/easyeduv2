import dotenv from "dotenv";

// Preserve Replit-managed secrets before dotenv can override them.
// PGHOST is injected by Replit's database provisioning — if it's present,
// the Replit DATABASE_URL secret is already in process.env and must win.
const replitDbUrl = process.env.DATABASE_URL;
const replitPgHost = process.env.PGHOST;

dotenv.config({ override: false });

// If Replit had a DATABASE_URL before dotenv ran, restore it.
if (replitDbUrl && replitPgHost) {
  process.env.DATABASE_URL = replitDbUrl;
}
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { captureError } from "./lib/monitoring";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

const ALLOWED_ORIGINS = [
  process.env.CENTER_PUBLIC_URL,
  // Replit dev proxy — allow any *.replit.dev / *.pike.replit.dev origin
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // Same-origin requests (no Origin header) are always allowed
    if (!origin) return callback(null, true);
    // Explicitly listed origins
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // Replit preview / dev proxy domains
    if (/^https:\/\/[^/]+\.replit\.dev$/.test(origin)) return callback(null, true);
    if (/^https:\/\/[^/]+\.pike\.replit\.dev$/.test(origin)) return callback(null, true);
    // Allow localhost / 127.0.0.1 in development
    if (process.env.NODE_ENV !== "production" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
    return callback(new Error(`CORS: origin not allowed — ${origin}`), false);
  },
  credentials: true,
}));

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Tắt ETag cho tất cả API routes để tránh 304 Not Modified với stale data
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

const SENSITIVE_PATHS = [
  "/api/auth/login",
  "/api/mobile/auth/login",
  "/api/call-center/omicall/sdk-credentials",
];
const LOG_BODY_MAX = process.env.NODE_ENV === "production" ? 300 : Infinity;

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      const isSensitive = SENSITIVE_PATHS.some((p) => path === p || path.startsWith(p));
      if (capturedJsonResponse && !isSensitive) {
        const body = JSON.stringify(capturedJsonResponse);
        logLine += ` :: ${isFinite(LOG_BODY_MAX) && body.length > LOG_BODY_MAX ? body.slice(0, LOG_BODY_MAX) + "…" : body}`;
      }
      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  // One-time Omicall backfill: split legacy "extension|password" values
  // into the dedicated encrypted password column. This is data migration only;
  // the column itself is defined in shared/schema.ts and applied by db:push.
  try {
    const { db, eq, sql, staffAssignments } = await import("./storage/base");
    const { encrypt } = await import("./lib/encryption");
    const legacyRows = await db
      .select({
        id: staffAssignments.id,
        extension: staffAssignments.omicallExtension,
      })
      .from(staffAssignments)
      .where(sql`${staffAssignments.omicallExtension} LIKE '%|%'`);

    let migrated = 0;
    for (const row of legacyRows) {
      const extension = row.extension || "";
      const separatorIndex = extension.indexOf("|");
      if (separatorIndex < 0) continue;
      const cleanExtension = extension.slice(0, separatorIndex).trim();
      const password = extension.slice(separatorIndex + 1).trim();
      await db
        .update(staffAssignments)
        .set({
          omicallExtension: cleanExtension || null,
          omicallPasswordEncrypted: password ? encrypt(password) : null,
        })
        .where(eq(staffAssignments.id, row.id));
      migrated++;
    }
    if (migrated > 0) {
      console.log(`[Omicall] Đã tách ${migrated} cấu hình máy lẻ legacy thành các trường riêng`);
    }
  } catch (err) {
    console.warn("[Omicall] Legacy credential backfill skipped:", (err as any)?.message || err);
  }

  // ============================================================
  // SCHEMA CHANGE RULE — đọc trước khi thêm bất cứ thứ gì vào đây
  // ============================================================
  // Block này CHỈ dùng cho:
  //   ✅ App startup (routes, services, WS)
  //   ✅ Seeds (dữ liệu mặc định lần đầu)
  //   ✅ One-time data backfills (di chuyển data, không phải tạo cột)
  //   ✅ Service initialization (Tinode, cache, v.v.)
  //
  // KHÔNG được dùng cho:
  //   ❌ ALTER TABLE ... ADD COLUMN
  //   ❌ CREATE TABLE IF NOT EXISTS
  //   ❌ Bất kỳ DDL nào dù có bọc IF NOT EXISTS
  //
  // Nếu cần thêm bảng/cột mới:
  //   1. Cập nhật shared/schema.ts
  //   2. Chạy: npm run db:push  (hoặc drizzle-kit generate + migrate)
  //   3. KHÔNG thêm gì vào file này
  //
  // Xem thêm: replit.md > Schema Change Rule
  // ============================================================

  // Start Tinode admin WebSocket connection eagerly at server start
  try {
    const { tinodeAdmin } = await import("./lib/tinode-admin");
    tinodeAdmin.connect();
    // Khởi động push listener sau khi bot connect — lắng nghe tin nhắn chat
    const { startTinodePushListener } = await import("./services/tinode-push.service");
    startTinodePushListener();
  } catch (err) {
    console.warn("[Tinode] Admin WS startup failed:", err);
  }

  // Auto checkout job: tự động ghi giờ ra cho giáo viên quên bấm "Kết thúc học online"
  try {
    const { startAutoCheckoutJob } = await import("./jobs/auto-checkout-teacher");
    startAutoCheckoutJob();
  } catch (err) {
    console.warn("[AutoCheckout] Job startup failed:", err);
  }

  // Ensure crm_pipeline_groups table + new crm_relationships columns exist in production DB
  try {
    const { storage: migrationStorage } = await import("./storage");
    await migrationStorage.migrateCrmPipelineGroupsSchema();
  } catch (err) {
    console.error("Migration crm_pipeline_groups schema failed:", err);
  }

  // Migrate pipelineStage names → relationshipIds UUIDs
  try {
    const { storage: migrationStorage } = await import("./storage");
    await migrationStorage.migratePipelineStageToRelationshipIds();
  } catch (err) {
    console.error("Migration pipelineStage→relationshipIds failed:", err);
  }

  // Migrate content library schema (make programId/sessionNumber nullable, add createdBy)
  try {
    const { storage: migrationStorage } = await import("./storage");
    await migrationStorage.migrateContentLibrarySchema();
  } catch (err) {
    console.error("Migration content library schema failed:", err);
  }

  // Migrate session contents: backfill resourceUrl for records where it is null
  try {
    const { db, eq, isNull, and, sql: baseSql, sessionContents, classSessions, courseProgramContents } = await import("./storage/base");
    const nullContents = await db
      .select({
        id: sessionContents.id,
        title: sessionContents.title,
        contentType: sessionContents.contentType,
        classSessionId: sessionContents.classSessionId,
        programId: classSessions.programId,
      })
      .from(sessionContents)
      .innerJoin(classSessions, eq(sessionContents.classSessionId, classSessions.id))
      .where(and(isNull(sessionContents.resourceUrl), baseSql`${classSessions.programId} IS NOT NULL`));

    let fixed = 0;
    for (const sc of nullContents) {
      if (!sc.programId) continue;
      const matches = await db
        .select({ id: courseProgramContents.id })
        .from(courseProgramContents)
        .where(and(
          eq(courseProgramContents.programId, sc.programId),
          eq(courseProgramContents.title, sc.title),
          eq(courseProgramContents.type, sc.contentType),
        ))
        .limit(1);
      if (matches.length > 0) {
        await db.update(sessionContents).set({ resourceUrl: matches[0].id }).where(eq(sessionContents.id, sc.id));
        fixed++;
      }
    }
    if (fixed > 0) console.log(`Migration: backfilled resourceUrl for ${fixed} session content records`);
  } catch (err) {
    console.error("Migration session content resourceUrl backfill failed:", err);
  }

  // Auto-init center config — race-condition safe cho horizontal scaling
  // Pattern: INSERT ... ON CONFLICT (singleton_key) DO NOTHING → SELECT
  // Dù có N instance khởi động cùng lúc, PostgreSQL đảm bảo chỉ 1 row tồn tại
  try {
    const { db: cfgDb, sql: rawSql } = await import("./storage/base");
    const { centerConfig } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    const centerUrl = process.env.CENTER_PUBLIC_URL ||
      (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : "");

    // Bước 1: INSERT nếu chưa có — safe với nhiều instance đồng thời
    // UNIQUE(singleton_key) → chỉ 1 INSERT thành công, các instance khác DO NOTHING
    await cfgDb.execute(rawSql`
      INSERT INTO center_config (center_url, singleton_key)
      VALUES (${centerUrl}, 'default')
      ON CONFLICT (singleton_key) DO NOTHING
    `);

    // Bước 2: Đọc lại row duy nhất — tất cả instance đều lấy cùng 1 UUID
    const [center] = await cfgDb.select().from(centerConfig).limit(1);
    if (!center) throw new Error("center_config: insert succeeded nhưng không đọc được row");

    // Bước 3: Cập nhật centerUrl nếu thay đổi (domain mới, server chuyển)
    if (centerUrl && center.centerUrl !== centerUrl) {
      await cfgDb.update(centerConfig)
        .set({ centerUrl, updatedAt: new Date() })
        .where(eq(centerConfig.id, center.id));
    }

    // Bước 4: Upsert vào center_registry — idempotent, nhiều instance OK
    const activeUrl = (centerUrl && center.centerUrl !== centerUrl) ? centerUrl : center.centerUrl;
    await cfgDb.execute(rawSql`
      INSERT INTO center_registry (center_id, center_url, description, is_active)
      VALUES (${center.id}, ${activeUrl}, 'Auto-registered on startup', true)
      ON CONFLICT (center_id) DO UPDATE
        SET center_url = EXCLUDED.center_url, updated_at = NOW()
    `);

    console.log(`[CenterConfig] Center UUID: ${center.id} | url: ${activeUrl}`);
  } catch (err) {
    console.error("[CenterConfig] Init failed:", err);
  }

  // Seed default finance transaction categories
  try {
    const { db: seedDb } = await import("./storage/base");
    const { financeTransactionCategories } = await import("@shared/schema");
    const { eq, and } = await import("drizzle-orm");

    const defaultCategories = [
      { name: "Đặt cọc", type: "income" },
      { name: "Học phí", type: "income" },
      { name: "Kho", type: "income" },
      { name: "Chuyển lớp", type: "income" },
      { name: "Lương", type: "expense" },
      { name: "Kho", type: "expense" },
      { name: "Hoàn tiền", type: "expense" },
    ];

    for (const cat of defaultCategories) {
      const existing = await seedDb
        .select({ id: financeTransactionCategories.id })
        .from(financeTransactionCategories)
        .where(and(eq(financeTransactionCategories.name, cat.name), eq(financeTransactionCategories.type, cat.type)))
        .limit(1);
      if (existing.length === 0) {
        await seedDb.insert(financeTransactionCategories).values({ name: cat.name, type: cat.type as "income" | "expense", isDefault: true, isActive: true });
        console.log(`Seeded default ${cat.type} category: ${cat.name}`);
      }
    }
  } catch (err) {
    console.error("Failed to seed default finance categories:", err);
  }

  // Ensure questions table
  try {
    const { migrateQuestionsTable } = await import("./storage/question.storage");
    await migrateQuestionsTable();
  } catch (err) {
    console.error("Migration questions table failed:", err);
  }

  // Ensure exams table
  try {
    const { migrateExamsTable } = await import("./storage/exam.storage");
    await migrateExamsTable();
  } catch (err) {
    console.error("Migration exams table failed:", err);
  }

  // Ensure session_contents.due_date column
  try {
    const { migrateSessionContents } = await import("./storage/session-content.storage");
    await migrateSessionContents();
  } catch (err) {
    console.error("Migration session_contents failed:", err);
  }

  // Ensure exam_sections table
  try {
    const { migrateExamSectionsTable } = await import("./storage/exam-section.storage");
    await migrateExamSectionsTable();
  } catch (err) {
    console.error("Migration exam_sections table failed:", err);
  }

  // Ensure exam_section_questions table
  try {
    const { migrateExamSectionQuestionsTable } = await import("./storage/exam-section-questions.storage");
    await migrateExamSectionQuestionsTable();
  } catch (err) {
    console.error("Migration exam_section_questions table failed:", err);
  }

  // Ensure exam_submissions table
  try {
    const { migrateExamSubmissionsTable } = await import("./storage/exam-submission.storage");
    await migrateExamSubmissionsTable();
  } catch (err) {
    console.error("Migration exam_submissions table failed:", err);
  }

  // Ensure exam_sessions table (PostgreSQL-backed, Kubernetes-safe session tracking)
  try {
    const { migrateExamSessionsTable } = await import("./storage/exam-session.storage");
    await migrateExamSessionsTable();
  } catch (err) {
    console.error("Migration exam_sessions table failed:", err);
  }

  // Backfill: synchronise classes.start_date/end_date with actual schedule
  // (one-shot — no schema change, but data may be stale on rows created before
  // the recalculateClass cascade was added).
  try {
    const { db: migDb } = await import("./storage/base");
    const result: any = await migDb.execute(`
      WITH derived AS (
        SELECT
          c.id AS class_id,
          COALESCE(
            (SELECT MIN(sc.start_date) FROM student_classes sc WHERE sc.class_id = c.id),
            (SELECT MIN(cs.session_date) FROM class_sessions cs WHERE cs.class_id = c.id)
          ) AS new_start,
          COALESCE(
            (SELECT MAX(sc.end_date) FROM student_classes sc WHERE sc.class_id = c.id),
            (SELECT MAX(cs.session_date) FROM class_sessions cs WHERE cs.class_id = c.id)
          ) AS new_end
        FROM classes c
      )
      UPDATE classes c
         SET start_date = d.new_start,
             end_date   = d.new_end,
             updated_at = NOW()
        FROM derived d
       WHERE c.id = d.class_id
         AND (
              c.start_date IS DISTINCT FROM d.new_start
           OR c.end_date   IS DISTINCT FROM d.new_end
         )
    `);
    const fixed = (result as any).rowCount ?? 0;
    if (fixed > 0) console.log(`Migration: synced classes.start/end_date for ${fixed} classes`);
  } catch (err) {
    console.error("Migration classes start/end backfill failed:", err);
  }

  // ── Tables/columns above are declared in shared/schema.ts ──────────────────
  // Apply to a new DB with: npx tsx scripts/push-db-direct.ts
  //
  // Keeping below: constraint changes, sequences, and unique indexes that are
  // not representable in Drizzle schema (partial indexes, sequences).

  // Migration: bidv_virtual_accounts — constraint & sequence (columns now in schema.ts)
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute("ALTER TABLE bidv_virtual_accounts ALTER COLUMN student_id DROP NOT NULL" as any);
    await migDb.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_bidv_va_invoice_id ON bidv_virtual_accounts(invoice_id) WHERE invoice_id IS NOT NULL" as any);
    await migDb.execute("CREATE SEQUENCE IF NOT EXISTS bidv_invoice_va_seq START 1" as any);
    console.log("Migration: bidv_virtual_accounts invoice VA ensured");
  } catch (err) {
    console.error("Migration bidv_virtual_accounts invoice VA failed:", err);
  }

  // Migration: bidv_virtual_accounts.schedule_id — BIDV VA cho từng đợt thanh toán
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`ALTER TABLE bidv_virtual_accounts ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES invoice_payment_schedule(id) ON DELETE SET NULL` as any);
    await migDb.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bidv_va_schedule_id ON bidv_virtual_accounts(schedule_id) WHERE schedule_id IS NOT NULL` as any);
    console.log("Migration: bidv_virtual_accounts.schedule_id ensured");
  } catch (err) {
    console.error("Migration bidv_virtual_accounts.schedule_id failed:", err);
  }

  // Migration: invoice_code_sequences — per-location atomic counters (thay thế global sequences)
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`
      CREATE TABLE IF NOT EXISTS invoice_code_sequences (
        key TEXT PRIMARY KEY,
        current_value INTEGER NOT NULL DEFAULT 0
      )
    ` as any);
    // Giữ lại global sequences cũ (backward compat, không dùng nữa)
    await migDb.execute("CREATE SEQUENCE IF NOT EXISTS invoice_pt_seq START 1" as any);
    await migDb.execute("CREATE SEQUENCE IF NOT EXISTS invoice_pc_seq START 1" as any);
    console.log("Migration: invoice_code_sequences ensured");
  } catch (err) {
    console.error("Migration invoice_code_sequences failed:", err);
  }

  // Unique indexes: tinode IDs (tránh duplicate, tăng tốc lookup)
  // Bước 1: xoá duplicate trước để tránh unique index bị fail
  try {
    const { db: migDb } = await import("./storage/base");
    // Null-out duplicate tinode_user_id (giữ lại bản updated_at mới nhất)
    await migDb.execute(`
      UPDATE users SET tinode_user_id = NULL
      WHERE tinode_user_id IS NOT NULL
        AND id NOT IN (
          SELECT DISTINCT ON (tinode_user_id) id FROM users
          WHERE tinode_user_id IS NOT NULL
          ORDER BY tinode_user_id, updated_at DESC NULLS LAST
        )
    ` as any);
    // Null-out duplicate chat_groups.tinode_topic_id
    await migDb.execute(`
      UPDATE chat_groups SET tinode_topic_id = NULL
      WHERE tinode_topic_id IS NOT NULL
        AND id NOT IN (
          SELECT DISTINCT ON (tinode_topic_id) id FROM chat_groups
          WHERE tinode_topic_id IS NOT NULL
          ORDER BY tinode_topic_id, created_at DESC NULLS LAST
        )
    ` as any);

    // Bước 2: tạo unique indexes sau khi đã clean data
    // Dùng tên mới cho unique index (tránh conflict với non-unique index cũ cùng tên)
    // Partial index WHERE IS NOT NULL: PostgreSQL cho phép nhiều NULL, chỉ enforce unique cho non-null
    await migDb.execute("DROP INDEX IF EXISTS users_tinode_user_id_idx" as any);
    await migDb.execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS users_tinode_user_id_uidx ON users(tinode_user_id) WHERE tinode_user_id IS NOT NULL" as any
    );
    await migDb.execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS classes_tinode_topic_id_uidx ON classes(tinode_topic_id) WHERE tinode_topic_id IS NOT NULL" as any
    );
    await migDb.execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS chat_groups_tinode_topic_id_uidx ON chat_groups(tinode_topic_id) WHERE tinode_topic_id IS NOT NULL" as any
    );
    console.log("Migration: tinode unique indexes ensured");
  } catch (err) {
    console.error("Migration tinode unique indexes failed:", err);
  }

  // Index: student_locations (tăng tốc EXISTS queries trên bảng này)
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute("CREATE INDEX IF NOT EXISTS student_locations_student_id_idx ON student_locations(student_id)" as any);
    await migDb.execute("CREATE INDEX IF NOT EXISTS student_locations_location_id_idx ON student_locations(location_id)" as any);
    console.log("Migration: student_locations indexes ensured");
  } catch (err) {
    console.error("Migration student_locations indexes failed:", err);
  }

  // Index: performance indexes (chuyển từ build-time sang runtime để đảm bảo luôn được tạo khi deploy)
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute("CREATE INDEX IF NOT EXISTS tasks_subject_ids_gin_idx ON tasks USING GIN (subject_ids)" as any);
    await migDb.execute("CREATE INDEX IF NOT EXISTS student_sessions_student_class_id_idx ON student_sessions (student_class_id)" as any);
    await migDb.execute("CREATE INDEX IF NOT EXISTS student_sessions_student_class_session_idx ON student_sessions (student_class_id, class_session_id)" as any);
    console.log("Migration: performance indexes ensured");
  } catch (err) {
    console.error("Migration performance indexes failed:", err);
  }

  // leave_requests, staff_attendances, salary_sheets, salary_sheet_employees
  // notifications.reference_date — all declared in shared/schema.ts
  // Apply via: npx tsx scripts/push-db-direct.ts

  // Migration: so_cong column type INTEGER → NUMERIC (to preserve decimals like 8.97)
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'salary_sheet_employees'
            AND column_name = 'so_cong'
            AND data_type = 'integer'
        ) THEN
          ALTER TABLE salary_sheet_employees
            ALTER COLUMN so_cong TYPE NUMERIC USING so_cong::NUMERIC;
        END IF;
      END $$
    ` as any);
    console.log("Migration: so_cong column type ensured as NUMERIC");
  } catch (err) {
    console.error("Migration so_cong type failed:", err);
  }

  // Migration: cong_thuc column type INTEGER → NUMERIC
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'salary_sheet_employees'
            AND column_name = 'cong_thuc'
            AND data_type = 'integer'
        ) THEN
          ALTER TABLE salary_sheet_employees
            ALTER COLUMN cong_thuc TYPE NUMERIC USING cong_thuc::NUMERIC;
        END IF;
      END $$
    ` as any);
    console.log("Migration: cong_thuc column type ensured as NUMERIC");
  } catch (err) {
    console.error("Migration cong_thuc type failed:", err);
  }

  // staff_hr_salary_configs, salary_allowance_types, salary_default_configs
  // — all declared in shared/schema.ts
  // Apply via: npx tsx scripts/push-db-direct.ts

  // Migration: chat_groups.is_direct_message column (chat 1-1 dùng group topic)
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`
      ALTER TABLE chat_groups
        ADD COLUMN IF NOT EXISTS is_direct_message BOOLEAN NOT NULL DEFAULT FALSE
    ` as any);
    console.log("Migration: chat_groups.is_direct_message ensured");
  } catch (err) {
    console.error("Migration chat_groups.is_direct_message failed:", err);
  }

  // Migration: seed canView=true for /tasks#list for all roles that don't have it yet
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`
      INSERT INTO role_permissions (id, role_id, resource, can_view, can_view_all, can_create, can_edit, can_delete, updated_at)
      SELECT
        gen_random_uuid(),
        r.id,
        '/tasks#list',
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        now()
      FROM roles r
      INNER JOIN departments d ON d.id = r.department_id
      WHERE d.name != 'Phòng Khách hàng'
        AND NOT EXISTS (
          SELECT 1 FROM role_permissions rp
          WHERE rp.role_id = r.id AND rp.resource = '/tasks#list'
        )
    ` as any);
    console.log("Migration: /tasks#list canView default seeded for all roles");
  } catch (err) {
    console.error("Migration /tasks#list seed failed:", err);
  }

  // Migration: seed canView=true for /news-feed for all roles
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`
      INSERT INTO role_permissions (id, role_id, resource, can_view, can_view_all, can_create, can_edit, can_delete, updated_at)
      SELECT
        gen_random_uuid(),
        r.id,
        '/news-feed',
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        now()
      FROM roles r
      WHERE NOT EXISTS (
        SELECT 1 FROM role_permissions rp
        WHERE rp.role_id = r.id AND rp.resource = '/news-feed'
      )
    ` as any);
    console.log("Migration: /news-feed canView default seeded for all roles");
  } catch (err) {
    console.error("Migration /news-feed seed failed:", err);
  }

  // crm_registration_form_fields — cấu hình trường hiển thị trên form đăng ký
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`
      CREATE TABLE IF NOT EXISTS crm_registration_form_fields (
        field_key   VARCHAR(100) PRIMARY KEY,
        is_visible  BOOLEAN NOT NULL DEFAULT FALSE,
        is_required BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at  TIMESTAMP NOT NULL DEFAULT now()
      );
      ALTER TABLE crm_registration_form_fields
        ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT FALSE
    ` as any);
    console.log("Migration: crm_registration_form_fields table ensured");
  } catch (err) {
    console.error("Migration crm_registration_form_fields failed:", err);
  }

  // invoice_audit_logs — declared in shared/schema.ts; also create via migration below
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`
      CREATE TABLE IF NOT EXISTS invoice_audit_logs (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id   UUID,
        invoice_code VARCHAR(50),
        invoice_type VARCHAR(20),
        subject_name TEXT,
        grand_total  NUMERIC(15,2),
        action       VARCHAR(100) NOT NULL,
        user_id      UUID REFERENCES users(id),
        location_id  UUID REFERENCES locations(id),
        old_content  JSONB,
        new_content  JSONB,
        created_at   TIMESTAMP NOT NULL DEFAULT now()
      )
    ` as any);
    await migDb.execute("CREATE INDEX IF NOT EXISTS invoice_audit_logs_invoice_id_idx ON invoice_audit_logs(invoice_id)" as any);
    await migDb.execute("CREATE INDEX IF NOT EXISTS invoice_audit_logs_created_at_idx ON invoice_audit_logs(created_at DESC)" as any);
    await migDb.execute("CREATE INDEX IF NOT EXISTS invoice_audit_logs_location_id_idx ON invoice_audit_logs(location_id)" as any);
    console.log("Migration: invoice_audit_logs table ensured");
  } catch (err) {
    console.error("Migration invoice_audit_logs failed:", err);
  }

  // store_receipt_audit_logs — lịch sử sửa/xóa phiếu nhập kho
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`
      CREATE TABLE IF NOT EXISTS store_receipt_audit_logs (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        receipt_id   TEXT,
        receipt_code VARCHAR(50),
        action       VARCHAR(50) NOT NULL,
        user_id      UUID REFERENCES users(id),
        user_name    VARCHAR(255),
        location_id  UUID REFERENCES locations(id),
        old_content  JSONB,
        new_content  JSONB,
        created_at   TIMESTAMP NOT NULL DEFAULT now()
      )
    ` as any);
    await migDb.execute("CREATE INDEX IF NOT EXISTS store_receipt_audit_logs_receipt_id_idx ON store_receipt_audit_logs(receipt_id)" as any);
    await migDb.execute("CREATE INDEX IF NOT EXISTS store_receipt_audit_logs_created_at_idx ON store_receipt_audit_logs(created_at DESC)" as any);
    await migDb.execute("CREATE INDEX IF NOT EXISTS store_receipt_audit_logs_location_id_idx ON store_receipt_audit_logs(location_id)" as any);
    console.log("Migration: store_receipt_audit_logs table ensured");
  } catch (err) {
    console.error("Migration store_receipt_audit_logs failed:", err);
  }

  // store_issue_receipt_audit_logs — lịch sử sửa/xóa phiếu xuất kho
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`
      CREATE TABLE IF NOT EXISTS store_issue_receipt_audit_logs (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        receipt_id   TEXT,
        receipt_code VARCHAR(50),
        action       VARCHAR(50) NOT NULL,
        user_id      UUID REFERENCES users(id),
        user_name    VARCHAR(255),
        location_id  UUID REFERENCES locations(id),
        old_content  JSONB,
        new_content  JSONB,
        created_at   TIMESTAMP NOT NULL DEFAULT now()
      )
    ` as any);
    await migDb.execute("CREATE INDEX IF NOT EXISTS store_issue_receipt_audit_logs_receipt_id_idx ON store_issue_receipt_audit_logs(receipt_id)" as any);
    await migDb.execute("CREATE INDEX IF NOT EXISTS store_issue_receipt_audit_logs_created_at_idx ON store_issue_receipt_audit_logs(created_at DESC)" as any);
    await migDb.execute("CREATE INDEX IF NOT EXISTS store_issue_receipt_audit_logs_location_id_idx ON store_issue_receipt_audit_logs(location_id)" as any);
    console.log("Migration: store_issue_receipt_audit_logs table ensured");
  } catch (err) {
    console.error("Migration store_issue_receipt_audit_logs failed:", err);
  }

  // facebook_page_routes — multi-center Facebook webhook routing table
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`
      CREATE TABLE IF NOT EXISTS facebook_page_routes (
        page_id     VARCHAR(100) PRIMARY KEY,
        center_id   VARCHAR(100) NOT NULL,
        center_url  TEXT NOT NULL,
        connected_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at  TIMESTAMP NOT NULL DEFAULT now(),
        is_active   BOOLEAN NOT NULL DEFAULT true
      )
    ` as any);
    console.log("Migration: facebook_page_routes table ensured");
  } catch (err) {
    console.error("Migration facebook_page_routes failed:", err);
  }

  // facebook_conversations.student_id — liên kết học viên với hội thoại FB
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`
      ALTER TABLE facebook_conversations
        ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES students(id) ON DELETE SET NULL
    ` as any);
    console.log("Migration: facebook_conversations.student_id ensured");
  } catch (err) {
    console.error("Migration facebook_conversations.student_id failed:", err);
  }

  // news_feed_posts, news_feed_reactions, push_tokens — declared in shared/schema.ts
  // Apply via: npx tsx scripts/push-db-direct.ts

  // Seed default departments and roles
  try {
    const { storage } = await import("./storage");
    const depts = await storage.getDepartments([], true);
    if (depts.length === 0) {
      console.log("Seeding default departments and roles...");
      const deptCustomer = await storage.createDepartment({
        name: "Phòng Khách hàng",
        isSystem: true,
      });

      await storage.createRole({ name: "Học viên", departmentId: deptCustomer.id, isSystem: true });
      await storage.createRole({ name: "Phụ huynh", departmentId: deptCustomer.id, isSystem: true });

      const deptTraining = await storage.createDepartment({
        name: "Phòng Đào tạo",
        isSystem: true,
      });

      await storage.createRole({ name: "Giáo viên", departmentId: deptTraining.id, isSystem: true });
      await storage.createRole({ name: "Trợ giảng", departmentId: deptTraining.id, isSystem: true });
      console.log("Default departments and roles seeded.");
    }
  } catch (error) {
    console.error("Failed to seed default data:", error);
  }

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    captureError(err, {
      request: {
        method: req.method,
        path: req.path,
        statusCode: status,
        userId: (req.user as any)?.id,
        ip: req.ip,
      },
    });

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  const listenOptions: any = {
    port,
    host: "0.0.0.0",
  };
  
  // reusePort is not supported on Windows
  if (process.platform !== "win32") {
    listenOptions.reusePort = true;
  }
  
  httpServer.listen(
    listenOptions,
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
