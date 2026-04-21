import { db, eq, asc, sql } from "./base";
import { examSections } from "./base";
import type { ExamSection, InsertExamSection } from "./base";

export async function migrateExamSectionsTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS exam_sections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        order_index INTEGER NOT NULL DEFAULT 0,
        reading_passage_url TEXT,
        reading_passage_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log("Migration: exam_sections table ensured");
  } catch (e: any) {
    console.log("Migration exam_sections: already exists or skipped", e.message);
  }
  try {
    await db.execute(sql`ALTER TABLE exam_sections ADD COLUMN IF NOT EXISTS reading_passage_url TEXT`);
    await db.execute(sql`ALTER TABLE exam_sections ADD COLUMN IF NOT EXISTS reading_passage_name VARCHAR(255)`);
    await db.execute(sql`ALTER TABLE exam_sections ADD COLUMN IF NOT EXISTS session_audio_url TEXT`);
    await db.execute(sql`ALTER TABLE exam_sections ADD COLUMN IF NOT EXISTS session_audio_name VARCHAR(255)`);
    await db.execute(sql`ALTER TABLE exam_sections ADD COLUMN IF NOT EXISTS ai_grading_enabled BOOLEAN DEFAULT FALSE`);
    console.log("Migration: exam_sections media columns ensured");
  } catch (e: any) {
    console.log("Migration exam_sections media columns: skipped", e.message);
  }
}

export async function getExamSections(examId: string): Promise<ExamSection[]> {
  return db
    .select()
    .from(examSections)
    .where(eq(examSections.examId, examId))
    .orderBy(asc(examSections.orderIndex), asc(examSections.createdAt));
}

export async function getExamSection(id: string): Promise<ExamSection | undefined> {
  const [row] = await db.select().from(examSections).where(eq(examSections.id, id));
  return row;
}

export async function createExamSection(data: InsertExamSection): Promise<ExamSection> {
  const [row] = await db.insert(examSections).values(data).returning();
  return row;
}

export async function updateExamSection(id: string, data: Partial<InsertExamSection>): Promise<ExamSection | undefined> {
  const [row] = await db
    .update(examSections)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(examSections.id, id))
    .returning();
  return row;
}

export async function deleteExamSection(id: string): Promise<void> {
  await db.delete(examSections).where(eq(examSections.id, id));
}

export async function getExamIdBySectionId(sectionId: string): Promise<string | null> {
  const [row] = await db
    .select({ examId: examSections.examId })
    .from(examSections)
    .where(eq(examSections.id, sectionId));
  return row?.examId ?? null;
}
