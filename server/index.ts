import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(cors({
  origin: true,
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

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

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
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  // Start Tinode admin WebSocket connection eagerly at server start
  try {
    const { tinodeAdmin } = await import("./lib/tinode-admin");
    tinodeAdmin.connect();
  } catch (err) {
    console.warn("[Tinode] Admin WS startup failed:", err);
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

  // Migrate classes: add score_sheet_id column if not exists
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`ALTER TABLE classes ADD COLUMN IF NOT EXISTS score_sheet_id UUID REFERENCES score_sheets(id) ON DELETE SET NULL`);
    console.log("Migration: classes.score_sheet_id column ensured");
  } catch (err) {
    console.error("Migration classes.score_sheet_id failed:", err);
  }

  // Migrate grade books: add published column if not exists
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`ALTER TABLE class_grade_books ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT FALSE`);
    console.log("Migration: class_grade_books.published column ensured");
  } catch (err) {
    console.error("Migration class_grade_books.published failed:", err);
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

  // Create student_wallet_transactions table
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`
      CREATE TABLE IF NOT EXISTS student_wallet_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
        type VARCHAR(10) NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        category VARCHAR(100),
        action VARCHAR(255) NOT NULL,
        class_id UUID,
        class_name VARCHAR(255),
        invoice_code VARCHAR(50),
        invoice_description TEXT,
        created_by UUID REFERENCES users(id),
        created_by_name VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log("Migration: student_wallet_transactions table ensured");
  } catch (err) {
    console.error("Migration student_wallet_transactions failed:", err);
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

  // Migrate locations: add bank info columns
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100)`);
    await migDb.execute(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS bank_account VARCHAR(50)`);
    await migDb.execute(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS account_holder VARCHAR(255)`);
    await migDb.execute(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS use_center_bank BOOLEAN DEFAULT TRUE`);
    await migDb.execute(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS bank_accounts TEXT`);
    console.log("Migration: locations bank info columns ensured");
  } catch (err) {
    console.error("Migration locations bank info failed:", err);
  }

  // Migrate: create task_comments table
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`
      CREATE TABLE IF NOT EXISTS task_comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        author_id UUID REFERENCES users(id),
        author_name VARCHAR(200) NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log("Migration: task_comments table ensured");
  } catch (err) {
    console.error("Migration task_comments failed:", err);
  }

  // Migrate: add category column to invoice_items
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS category VARCHAR(100)`);
    console.log("Migration: invoice_items.category column ensured");
  } catch (err) {
    console.error("Migration invoice_items.category failed:", err);
  }

  // Migrate: add invoice-level promotion/surcharge columns
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_promotion_keys TEXT[] DEFAULT '{}'::text[]`);
    await migDb.execute(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_surcharge_keys TEXT[] DEFAULT '{}'::text[]`);
    await migDb.execute(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_promotion_amount DECIMAL(15,2) NOT NULL DEFAULT 0`);
    await migDb.execute(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_surcharge_amount DECIMAL(15,2) NOT NULL DEFAULT 0`);
    console.log("Migration: invoices invoice-level promo/surcharge columns ensured");
  } catch (err) {
    console.error("Migration invoices invoice-level promo/surcharge failed:", err);
  }

  // Migrate: add scheduled_weekdays column to student_classes
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`ALTER TABLE student_classes ADD COLUMN IF NOT EXISTS scheduled_weekdays INTEGER[]`);
    console.log("Migration: student_classes.scheduled_weekdays column ensured");
  } catch (err) {
    console.error("Migration student_classes.scheduled_weekdays failed:", err);
  }

  // Migrate: add cycle_history column to student_classes
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`ALTER TABLE student_classes ADD COLUMN IF NOT EXISTS cycle_history JSONB`);
    console.log("Migration: student_classes.cycle_history column ensured");
  } catch (err) {
    console.error("Migration student_classes.cycle_history failed:", err);
  }

  // Migrate: create notifications table
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        type VARCHAR(50) NOT NULL DEFAULT 'in-app',
        category VARCHAR(100) DEFAULT 'general',
        reference_id UUID,
        reference_type VARCHAR(50),
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log("Migration: notifications table ensured");
  } catch (err) {
    console.error("Migration notifications table failed:", err);
  }

  // Migrate: add created_by to task_statuses and task_levels
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`ALTER TABLE task_statuses ADD COLUMN IF NOT EXISTS created_by VARCHAR(255)`);
    await migDb.execute(`ALTER TABLE task_levels ADD COLUMN IF NOT EXISTS created_by VARCHAR(255)`);
    console.log("Migration: task_statuses/task_levels.created_by columns ensured");
  } catch (err) {
    console.error("Migration task created_by failed:", err);
  }

  // Migrate: add parent_ids column to students
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_ids UUID[]`);
    console.log("Migration: students.parent_ids column ensured");
  } catch (err) {
    console.error("Migration students.parent_ids failed:", err);
  }

  // Migrate: add avatar_url column to students
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`ALTER TABLE students ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
    console.log("Migration: students.avatar_url column ensured");
  } catch (err) {
    console.error("Migration students.avatar_url failed:", err);
  }

  // Migrate: Tinode integration
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tinode_user_id VARCHAR(100)`);
    await migDb.execute(`ALTER TABLE users DROP COLUMN IF EXISTS tinode_token`);
    await migDb.execute(`ALTER TABLE classes ADD COLUMN IF NOT EXISTS tinode_topic_id VARCHAR(100)`);
    console.log("Migration: Tinode — users.tinode_user_id ensured, classes.tinode_topic_id ensured");
  } catch (err) {
    console.error("Migration Tinode columns failed:", err);
  }

  // Migrate: chat_groups and chat_group_members tables
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`
      CREATE TABLE IF NOT EXISTS chat_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL,
        tinode_topic_id VARCHAR(100),
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await migDb.execute(`
      CREATE TABLE IF NOT EXISTS chat_group_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id UUID NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log("Migration: chat_groups and chat_group_members tables ensured");
  } catch (err) {
    console.error("Migration chat_groups failed:", err);
  }

  // Migrate: create customer_activity_logs table
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`
      CREATE TABLE IF NOT EXISTS customer_activity_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID REFERENCES students(id) ON DELETE SET NULL,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        user_name VARCHAR(255),
        action VARCHAR(50) NOT NULL,
        old_data JSONB,
        new_data JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log("Migration: customer_activity_logs table ensured");
  } catch (err) {
    console.error("Migration customer_activity_logs failed:", err);
  }

  // Migrate: create student_relationship_history table
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`
      CREATE TABLE IF NOT EXISTS student_relationship_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        from_relationship_id UUID REFERENCES crm_relationships(id) ON DELETE SET NULL,
        from_relationship_name VARCHAR(255),
        to_relationship_id UUID REFERENCES crm_relationships(id) ON DELETE SET NULL,
        to_relationship_name VARCHAR(255),
        changed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        changed_by_name VARCHAR(255),
        note TEXT,
        changed_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await migDb.execute(`
      CREATE INDEX IF NOT EXISTS idx_srh_student_id ON student_relationship_history(student_id)
    `);
    await migDb.execute(`
      CREATE INDEX IF NOT EXISTS idx_srh_changed_at ON student_relationship_history(changed_at)
    `);
    console.log("Migration: student_relationship_history table ensured");
  } catch (err) {
    console.error("Migration student_relationship_history failed:", err);
  }

  // Migrate: create crm_required_fields table (per-field "required" flag for customer form)
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`
      CREATE TABLE IF NOT EXISTS crm_required_fields (
        field_key VARCHAR(100) PRIMARY KEY,
        is_required BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log("Migration: crm_required_fields table ensured");
  } catch (err) {
    console.error("Migration crm_required_fields failed:", err);
  }

  // Migrate: create crm_custom_fields table + students.custom_fields jsonb column
  try {
    const { db: migDb } = await import("./storage/base");
    await migDb.execute(`
      CREATE TABLE IF NOT EXISTS crm_custom_fields (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        label VARCHAR(255) NOT NULL,
        field_type VARCHAR(20) NOT NULL DEFAULT 'text',
        options TEXT[],
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await migDb.execute(`ALTER TABLE students ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb`);
    console.log("Migration: crm_custom_fields table & students.custom_fields ensured");
  } catch (err) {
    console.error("Migration crm_custom_fields failed:", err);
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

  // Seed default departments and roles
  try {
    const { storage } = await import("./storage");
    const depts = await storage.getDepartments();
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

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

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
