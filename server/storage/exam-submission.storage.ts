import { db, eq, sql, desc } from "./base";
import { examSubmissions } from "./base";
import type { ExamSubmission, InsertExamSubmission } from "@shared/schema";

export type SubmitterInfo = {
  name: string | null;
  code: string | null;
  studentId: string | null;
};

export async function resolveSubmitterByUserId(
  userId: string,
  fallbackUsername?: string,
): Promise<SubmitterInfo> {
  const staffRows = await db.execute(
    sql`SELECT full_name, code FROM staff WHERE user_id = ${userId} LIMIT 1`,
  );
  if (staffRows.rows.length > 0) {
    const row = staffRows.rows[0] as any;
    return {
      name: row.full_name || fallbackUsername || null,
      code: row.code || null,
      studentId: null,
    };
  }

  const studentRows = await db.execute(
    sql`SELECT full_name, code, id FROM students WHERE user_id = ${userId} LIMIT 1`,
  );
  if (studentRows.rows.length > 0) {
    const row = studentRows.rows[0] as any;
    return {
      name: row.full_name || fallbackUsername || null,
      code: row.code || null,
      studentId: row.id || null,
    };
  }

  return { name: fallbackUsername || null, code: null, studentId: null };
}

export async function migrateExamSubmissionsTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS exam_submissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
        student_id UUID REFERENCES students(id) ON DELETE SET NULL,
        student_name VARCHAR(255),
        student_code VARCHAR(50),
        class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
        answers JSONB NOT NULL DEFAULT '{}',
        score NUMERIC(5,2),
        adjusted_score NUMERIC(5,2),
        comment TEXT,
        part_scores JSONB,
        time_taken_seconds INTEGER,
        submitted_at TIMESTAMP DEFAULT NOW() NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log("Migration: exam_submissions table ensured");
  } catch (e: any) {
    console.log("Migration exam_submissions: already exists or skipped", e.message);
  }
  try {
    await db.execute(sql`ALTER TABLE exam_submissions ADD COLUMN IF NOT EXISTS ai_grading_results JSONB`);
    console.log("Migration: ai_grading_results column ensured");
  } catch (e: any) {
    console.log("Migration ai_grading_results column: skipped", e.message);
  }
}

export type ExamSubmissionWithDetails = ExamSubmission & {
  examName: string | null;
  examCode: string | null;
  examPassingScore: string | null;
  className: string | null;
  classCode: string | null;
  hasAIGrading: boolean;
};

export async function getExamSubmissions(): Promise<ExamSubmissionWithDetails[]> {
  const rows = await db
    .select({
      id: examSubmissions.id,
      examId: examSubmissions.examId,
      studentId: examSubmissions.studentId,
      studentName: examSubmissions.studentName,
      studentCode: examSubmissions.studentCode,
      classId: examSubmissions.classId,
      answers: examSubmissions.answers,
      score: examSubmissions.score,
      adjustedScore: examSubmissions.adjustedScore,
      comment: examSubmissions.comment,
      partScores: examSubmissions.partScores,
      aiGradingResults: examSubmissions.aiGradingResults,
      timeTakenSeconds: examSubmissions.timeTakenSeconds,
      submittedAt: examSubmissions.submittedAt,
      createdAt: examSubmissions.createdAt,
      updatedAt: examSubmissions.updatedAt,
      examName: sql<string | null>`(SELECT name FROM exams WHERE id = ${examSubmissions.examId})`,
      examCode: sql<string | null>`(SELECT code FROM exams WHERE id = ${examSubmissions.examId})`,
      examPassingScore: sql<string | null>`(SELECT passing_score::text FROM exams WHERE id = ${examSubmissions.examId})`,
      className: sql<string | null>`(SELECT name FROM classes WHERE id = ${examSubmissions.classId})`,
      classCode: sql<string | null>`(SELECT class_code FROM classes WHERE id = ${examSubmissions.classId})`,
      hasAIGrading: sql<boolean>`EXISTS (SELECT 1 FROM exam_sections WHERE exam_id = ${examSubmissions.examId} AND ai_grading_enabled = true)`,
    })
    .from(examSubmissions)
    .orderBy(desc(examSubmissions.submittedAt));
  return rows as ExamSubmissionWithDetails[];
}

export async function getExamSubmission(id: string): Promise<ExamSubmissionWithDetails | undefined> {
  const rows = await db
    .select({
      id: examSubmissions.id,
      examId: examSubmissions.examId,
      studentId: examSubmissions.studentId,
      studentName: examSubmissions.studentName,
      studentCode: examSubmissions.studentCode,
      classId: examSubmissions.classId,
      answers: examSubmissions.answers,
      score: examSubmissions.score,
      adjustedScore: examSubmissions.adjustedScore,
      comment: examSubmissions.comment,
      partScores: examSubmissions.partScores,
      aiGradingResults: examSubmissions.aiGradingResults,
      timeTakenSeconds: examSubmissions.timeTakenSeconds,
      submittedAt: examSubmissions.submittedAt,
      createdAt: examSubmissions.createdAt,
      updatedAt: examSubmissions.updatedAt,
      examName: sql<string | null>`(SELECT name FROM exams WHERE id = ${examSubmissions.examId})`,
      examCode: sql<string | null>`(SELECT code FROM exams WHERE id = ${examSubmissions.examId})`,
      examPassingScore: sql<string | null>`(SELECT passing_score::text FROM exams WHERE id = ${examSubmissions.examId})`,
      className: sql<string | null>`(SELECT name FROM classes WHERE id = ${examSubmissions.classId})`,
      classCode: sql<string | null>`(SELECT class_code FROM classes WHERE id = ${examSubmissions.classId})`,
      hasAIGrading: sql<boolean>`EXISTS (SELECT 1 FROM exam_sections WHERE exam_id = ${examSubmissions.examId} AND ai_grading_enabled = true)`,
    })
    .from(examSubmissions)
    .where(eq(examSubmissions.id, id));
  return rows[0] as ExamSubmissionWithDetails | undefined;
}

export async function createExamSubmission(data: InsertExamSubmission): Promise<ExamSubmission> {
  const [row] = await db.insert(examSubmissions).values(data).returning();
  return row;
}

export async function updateExamSubmission(id: string, data: Partial<Pick<ExamSubmission, "adjustedScore" | "comment" | "aiGradingResults">>): Promise<ExamSubmission> {
  const [row] = await db
    .update(examSubmissions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(examSubmissions.id, id))
    .returning();
  return row;
}

export async function deleteExamSubmission(id: string): Promise<void> {
  await db.delete(examSubmissions).where(eq(examSubmissions.id, id));
}
