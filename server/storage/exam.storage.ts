import { db, eq, sql, desc } from "./base";
import { exams, staff } from "./base";
import type { Exam, InsertExam } from "./base";

export async function migrateExamsTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS exams (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(50) UNIQUE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        time_limit_minutes INTEGER,
        max_attempts INTEGER DEFAULT 1,
        passing_score NUMERIC(5,2),
        show_result BOOLEAN DEFAULT false,
        open_at TIMESTAMP,
        close_at TIMESTAMP,
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log("Migration: exams table ensured");
  } catch (e: any) {
    console.log("Migration exams: already exists or skipped", e.message);
  }

  // Add unique constraint on code if not yet present (for existing tables)
  try {
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'exams_code_unique' AND conrelid = 'exams'::regclass
        ) THEN
          ALTER TABLE exams ADD CONSTRAINT exams_code_unique UNIQUE (code);
        END IF;
      END;
      $$;
    `);
    console.log("Migration: exams.code unique constraint ensured");
  } catch (e: any) {
    console.log("Migration exams unique code: skipped", e.message);
  }
}

export async function isExamCodeTaken(code: string, excludeId?: string): Promise<boolean> {
  const rows = await db
    .select({ id: exams.id })
    .from(exams)
    .where(eq(exams.code, code));
  if (rows.length === 0) return false;
  if (excludeId && rows.length === 1 && rows[0].id === excludeId) return false;
  return true;
}

export type ExamWithUsers = Exam & {
  createdByName: string | null;
  updatedByName: string | null;
};

export async function getExams(): Promise<ExamWithUsers[]> {
  const rows = await db
    .select({
      id: exams.id,
      code: exams.code,
      name: exams.name,
      description: exams.description,
      status: exams.status,
      timeLimitMinutes: exams.timeLimitMinutes,
      maxAttempts: exams.maxAttempts,
      passingScore: exams.passingScore,
      showResult: exams.showResult,
      openAt: exams.openAt,
      closeAt: exams.closeAt,
      createdBy: exams.createdBy,
      updatedBy: exams.updatedBy,
      createdAt: exams.createdAt,
      updatedAt: exams.updatedAt,
      createdByName: sql<string | null>`(SELECT full_name FROM staff WHERE user_id = ${exams.createdBy})`,
      updatedByName: sql<string | null>`(SELECT full_name FROM staff WHERE user_id = ${exams.updatedBy})`,
    })
    .from(exams)
    .orderBy(desc(exams.createdAt));
  return rows as ExamWithUsers[];
}

export async function getExam(id: string): Promise<ExamWithUsers | undefined> {
  const rows = await db
    .select({
      id: exams.id,
      code: exams.code,
      name: exams.name,
      description: exams.description,
      status: exams.status,
      timeLimitMinutes: exams.timeLimitMinutes,
      maxAttempts: exams.maxAttempts,
      passingScore: exams.passingScore,
      showResult: exams.showResult,
      openAt: exams.openAt,
      closeAt: exams.closeAt,
      createdBy: exams.createdBy,
      updatedBy: exams.updatedBy,
      createdAt: exams.createdAt,
      updatedAt: exams.updatedAt,
      createdByName: sql<string | null>`(SELECT full_name FROM staff WHERE user_id = ${exams.createdBy})`,
      updatedByName: sql<string | null>`(SELECT full_name FROM staff WHERE user_id = ${exams.updatedBy})`,
    })
    .from(exams)
    .where(eq(exams.id, id));
  return rows[0] as ExamWithUsers | undefined;
}

export async function createExam(data: InsertExam): Promise<Exam> {
  const [row] = await db.insert(exams).values(data).returning();
  return row;
}

export async function updateExam(id: string, data: Partial<InsertExam>): Promise<Exam> {
  const [row] = await db
    .update(exams)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(exams.id, id))
    .returning();
  return row;
}

export async function deleteExam(id: string): Promise<void> {
  await db.delete(exams).where(eq(exams.id, id));
}
