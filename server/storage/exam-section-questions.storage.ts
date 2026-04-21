import { db, eq, asc, sql, inArray } from "./base";
import { examSectionQuestions, questions, examSections } from "./base";
import type { ExamSectionQuestion, InsertExamSectionQuestion, Question, ExamSection } from "./base";

export async function migrateExamSectionQuestionsTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS exam_section_questions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        section_id UUID NOT NULL REFERENCES exam_sections(id) ON DELETE CASCADE,
        question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        order_index INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log("Migration: exam_section_questions table ensured");
  } catch (e: any) {
    console.log("Migration exam_section_questions: already exists or skipped", e.message);
  }
}

export type SectionQuestionWithDetails = ExamSectionQuestion & {
  question: Question;
};

export async function getSectionQuestions(sectionId: string): Promise<SectionQuestionWithDetails[]> {
  const rows = await db
    .select()
    .from(examSectionQuestions)
    .innerJoin(questions, eq(examSectionQuestions.questionId, questions.id))
    .where(eq(examSectionQuestions.sectionId, sectionId))
    .orderBy(asc(examSectionQuestions.orderIndex), asc(examSectionQuestions.createdAt));

  return rows.map(r => ({
    ...r.exam_section_questions,
    question: r.questions,
  }));
}

export async function addQuestionsToSection(sectionId: string, questionIds: string[]): Promise<ExamSectionQuestion[]> {
  const existing = await db
    .select({ questionId: examSectionQuestions.questionId })
    .from(examSectionQuestions)
    .where(eq(examSectionQuestions.sectionId, sectionId));

  const existingIds = new Set(existing.map(r => r.questionId));
  const newIds = questionIds.filter(id => !existingIds.has(id));

  if (newIds.length === 0) return [];

  const countRow = await db
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(examSectionQuestions)
    .where(eq(examSectionQuestions.sectionId, sectionId));
  const startIndex = Number(countRow[0]?.cnt ?? 0);

  const rows = await db
    .insert(examSectionQuestions)
    .values(newIds.map((questionId, i) => ({
      sectionId,
      questionId,
      orderIndex: startIndex + i,
    })))
    .returning();

  return rows;
}

export async function removeQuestionFromSection(sectionId: string, questionId: string): Promise<void> {
  await db
    .delete(examSectionQuestions)
    .where(
      sql`${examSectionQuestions.sectionId} = ${sectionId} AND ${examSectionQuestions.questionId} = ${questionId}`
    );
}

export type SectionWithQuestions = ExamSection & {
  questions: SectionQuestionWithDetails[];
};

export async function getAllSectionsWithQuestions(examId: string): Promise<SectionWithQuestions[]> {
  const sections = await db
    .select()
    .from(examSections)
    .where(eq(examSections.examId, examId))
    .orderBy(asc(examSections.orderIndex), asc(examSections.createdAt));

  const result: SectionWithQuestions[] = [];
  for (const section of sections) {
    const qs = await getSectionQuestions(section.id);
    result.push({ ...section, questions: qs });
  }
  return result;
}
