/**
 * Tạo các DB index cần thiết nếu chưa có.
 * Chạy tự động mỗi lần deploy (build step).
 * An toàn: dùng IF NOT EXISTS nên chạy nhiều lần không bị lỗi.
 */
import { Pool } from "pg";

const connectionString = process.env.APP_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error("[ensure-indexes] APP_DATABASE_URL / DATABASE_URL không được set. Bỏ qua.");
  process.exit(0);
}

const pool = new Pool({ connectionString, max: 1 });

const INDEXES: { sql: string; name: string }[] = [
  {
    name: "tasks_subject_ids_gin_idx",
    sql: `CREATE INDEX IF NOT EXISTS tasks_subject_ids_gin_idx ON tasks USING GIN (subject_ids)`,
  },
  {
    name: "student_sessions_student_class_id_idx",
    sql: `CREATE INDEX IF NOT EXISTS student_sessions_student_class_id_idx ON student_sessions (student_class_id)`,
  },
  {
    name: "student_sessions_student_class_session_idx",
    sql: `CREATE INDEX IF NOT EXISTS student_sessions_student_class_session_idx ON student_sessions (student_class_id, class_session_id)`,
  },
  // Composite index cho getStudentClasses CTE: WHERE student_id = ? AND class_id IN (?)
  {
    name: "student_sessions_student_id_class_id_idx",
    sql: `CREATE INDEX IF NOT EXISTS student_sessions_student_id_class_id_idx ON student_sessions (student_id, class_id)`,
  },
  // student_classes filter theo student_id
  {
    name: "student_classes_student_id_idx",
    sql: `CREATE INDEX IF NOT EXISTS student_classes_student_id_idx ON student_classes (student_id)`,
  },
  // invoice_session_allocations join theo student_session_id
  {
    name: "invoice_session_allocations_student_session_id_idx",
    sql: `CREATE INDEX IF NOT EXISTS invoice_session_allocations_student_session_id_idx ON invoice_session_allocations (student_session_id)`,
  },
];

async function ensureIndexes() {
  const client = await pool.connect();
  try {
    for (const idx of INDEXES) {
      await client.query(idx.sql);
      console.log(`[ensure-indexes] ✅ ${idx.name}`);
    }
    console.log("[ensure-indexes] Tất cả index đã sẵn sàng.");
  } finally {
    client.release();
    await pool.end();
  }
}

ensureIndexes().catch((err) => {
  console.error("[ensure-indexes] Lỗi:", err);
  process.exit(1);
});
