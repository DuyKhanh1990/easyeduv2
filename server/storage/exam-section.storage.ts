import { db, eq, asc, sql } from "./base";
import { examSections } from "./base";
import type { ExamSection, InsertExamSection } from "./base";

export async function migrateExamSectionsTable(): Promise<void> {
  // No-op: exam_sections and all columns are declared in shared/schema.ts
  // Apply via: npm run db:push  or  npx tsx scripts/push-db-direct.ts
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
