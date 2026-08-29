import { db, eq, asc, sql, inArray } from "./base";
import { examSectionQuestions, questions, examSections } from "./base";
import type { ExamSectionQuestion, InsertExamSectionQuestion, Question, ExamSection } from "./base";

export async function migrateExamSectionQuestionsTable(): Promise<void> {
  // No-op: exam_section_questions is declared in shared/schema.ts
  // Apply via: npm run db:push  or  npx tsx scripts/push-db-direct.ts
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

  if (sections.length === 0) return [];

  const sectionIds = sections.map(s => s.id);

  const rows = await db
    .select()
    .from(examSectionQuestions)
    .innerJoin(questions, eq(examSectionQuestions.questionId, questions.id))
    .where(inArray(examSectionQuestions.sectionId, sectionIds))
    .orderBy(asc(examSectionQuestions.orderIndex), asc(examSectionQuestions.createdAt));

  const questionsBySectionId = new Map<string, SectionQuestionWithDetails[]>();
  for (const r of rows) {
    const entry = { ...r.exam_section_questions, question: r.questions };
    if (!questionsBySectionId.has(r.exam_section_questions.sectionId)) {
      questionsBySectionId.set(r.exam_section_questions.sectionId, []);
    }
    questionsBySectionId.get(r.exam_section_questions.sectionId)!.push(entry);
  }

  return sections.map(section => ({
    ...section,
    questions: questionsBySectionId.get(section.id) ?? [],
  }));
}
