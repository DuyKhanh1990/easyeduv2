import { db, eq, sql, desc, inArray } from "./base";
import { examSubmissions, examSectionQuestions, examSections, questions } from "./base";
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
  // Table + columns declared in shared/schema.ts — apply via push-db-direct.ts
  // Keeping performance indexes (not declared in schema)
  try {
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_exam_submissions_exam_id ON exam_submissions(exam_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_exam_submissions_student_id ON exam_submissions(student_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_exam_submissions_submitted_at ON exam_submissions(submitted_at DESC)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_exam_submissions_exam_student ON exam_submissions(exam_id, student_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_exam_submissions_exam_class ON exam_submissions(exam_id, class_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_esq_section_id ON exam_section_questions(section_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_esq_section_order ON exam_section_questions(section_id, order_index)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_exam_sections_exam_id ON exam_sections(exam_id)`);
    console.log("Migration: exam indexes ensured");
  } catch (e: any) {
    console.log("Migration exam indexes: skipped", e.message);
  }
}

// ── Backend scoring helpers ──────────────────────────────────────────────────
// Parse multi-choice correct answers stored as "A,B,C" or JSON array
function parseMultipleChoiceAnswers(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.map(s => String(s).trim().toUpperCase());
  } catch {}
  return trimmed.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
}

// Parse fill-blank correct answers from options array or legacy string format
function parseFillBlankAnswers(raw: string | null | undefined, options: unknown): string[] {
  if (Array.isArray(options) && options.length > 0 && (options[0] as any).answers) {
    const blanks = options as { id: string; answers: string[]; score: number }[];
    return [...blanks].sort((a, b) => Number(a.id) - Number(b.id)).map(b => b.answers?.[0]?.trim() ?? "");
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw.trim());
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {}
  return raw.split(";").map(s => {
    const colonIdx = s.indexOf(": ");
    return colonIdx >= 0 ? s.substring(colonIdx + 2).trim() : s.trim();
  }).filter(Boolean);
}

function calcFillBlankEarned(q: { score: unknown; correctAnswer?: string | null; options?: unknown }, a: unknown): number {
  const given = ((a as string) || "").split("|||");
  if (Array.isArray(q.options) && q.options.length > 0 && (q.options[0] as any).answers !== undefined) {
    const blanks = q.options as { id: string; answers: string[]; score: number }[];
    const sorted = [...blanks].sort((ba, bb) => Number(ba.id) - Number(bb.id));
    let earned = 0;
    sorted.forEach((blank, i) => {
      const givenVal = (given[i] || "").trim().toLowerCase();
      if (!givenVal) return;
      if (blank.answers.some(ans => ans.trim().toLowerCase() === givenVal)) earned += parseFloat(String(blank.score)) || 0;
    });
    return earned;
  }
  const scoreVal = parseFloat(String(q.score)) || 0;
  const correct = parseFillBlankAnswers(q.correctAnswer, q.options);
  const allOk = correct.every((c, i) => c.trim().toLowerCase() === (given[i] || "").trim().toLowerCase());
  return allOk ? scoreVal : 0;
}

export type BackendScoringResult = {
  score: string;
  partScores: Array<{ partName: string; correct: number; total: number; score: number }>;
};

/** Fetch sections/questions for an exam and compute score from raw answers on the server side. */
export async function computeExamScore(
  examId: string,
  answers: Record<string, unknown>,
): Promise<BackendScoringResult> {
  const sections = await db
    .select()
    .from(examSections)
    .where(eq(examSections.examId, examId));

  if (sections.length === 0) return { score: "0.00", partScores: [] };

  const sectionIds = sections.map(s => s.id);

  const sqRows = await db
    .select({ sqId: examSectionQuestions.id, sectionId: examSectionQuestions.sectionId, q: questions })
    .from(examSectionQuestions)
    .innerJoin(questions, eq(examSectionQuestions.questionId, questions.id))
    .where(inArray(examSectionQuestions.sectionId, sectionIds));

  const sectionMap = new Map(sections.map(s => [s.id, s]));
  const bySectionId = new Map<string, typeof sqRows>();
  for (const r of sqRows) {
    if (!bySectionId.has(r.sectionId)) bySectionId.set(r.sectionId, []);
    bySectionId.get(r.sectionId)!.push(r);
  }

  let totalEarned = 0;
  const partScores: BackendScoringResult["partScores"] = [];

  for (const [idx, section] of sections.entries()) {
    const sqs = bySectionId.get(section.id) ?? [];
    let partEarned = 0;
    let partCorrect = 0;

    for (const { sqId, q } of sqs) {
      const scoreVal = parseFloat(String(q.score)) || 0;
      const a = answers[sqId];
      if (!a) continue;

      if (q.type === "single_choice") {
        if (a === q.correctAnswer) { partEarned += scoreVal; partCorrect++; }
      } else if (q.type === "multiple_choice") {
        const correct = parseMultipleChoiceAnswers(q.correctAnswer);
        const given = ((a as string[]) || []).map(s => String(s).trim().toUpperCase());
        if (correct.length > 0 && correct.length === given.length && correct.every(c => given.includes(c))) {
          partEarned += scoreVal; partCorrect++;
        }
      } else if (q.type === "fill_blank") {
        const earned = calcFillBlankEarned(q, a);
        partEarned += earned;
        if (earned > 0) partCorrect++;
      }
    }

    totalEarned += partEarned;
    partScores.push({
      partName: `Part ${idx + 1}: ${section.name}`,
      correct: partCorrect,
      total: sqs.length,
      score: partEarned,
    });
  }

  return { score: totalEarned.toFixed(2), partScores };
}

export type ExamSubmissionWithDetails = ExamSubmission & {
  examName: string | null;
  examCode: string | null;
  examPassingScore: string | null;
  className: string | null;
  classCode: string | null;
  classLocationId: string | null;
  hasAIGrading: boolean;
};

const SUBMISSION_SELECT_FIELDS = {
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
  startedAt: examSubmissions.startedAt,
  expiresAt: examSubmissions.expiresAt,
  submittedAt: examSubmissions.submittedAt,
  createdAt: examSubmissions.createdAt,
  updatedAt: examSubmissions.updatedAt,
  examName: sql<string | null>`e.name`,
  examCode: sql<string | null>`e.code`,
  examPassingScore: sql<string | null>`e.passing_score::text`,
  className: sql<string | null>`c.name`,
  classCode: sql<string | null>`c.class_code`,
  classLocationId: sql<string | null>`c.location_id::text`,
  hasAIGrading: sql<boolean>`COALESCE(es_agg.has_ai, false)`,
} as const;

export async function getExamSubmissions(): Promise<ExamSubmissionWithDetails[]> {
  const rows = await db
    .select(SUBMISSION_SELECT_FIELDS)
    .from(examSubmissions)
    .leftJoin(sql`exams e`, sql`e.id = ${examSubmissions.examId}`)
    .leftJoin(sql`classes c`, sql`c.id = ${examSubmissions.classId}`)
    .leftJoin(
      sql`(SELECT exam_id, bool_or(ai_grading_enabled) AS has_ai FROM exam_sections GROUP BY exam_id) es_agg`,
      sql`es_agg.exam_id = ${examSubmissions.examId}`,
    )
    .orderBy(desc(examSubmissions.submittedAt));
  return rows as ExamSubmissionWithDetails[];
}

export async function getExamSubmission(id: string): Promise<ExamSubmissionWithDetails | undefined> {
  const rows = await db
    .select(SUBMISSION_SELECT_FIELDS)
    .from(examSubmissions)
    .leftJoin(sql`exams e`, sql`e.id = ${examSubmissions.examId}`)
    .leftJoin(sql`classes c`, sql`c.id = ${examSubmissions.classId}`)
    .leftJoin(
      sql`(SELECT exam_id, bool_or(ai_grading_enabled) AS has_ai FROM exam_sections GROUP BY exam_id) es_agg`,
      sql`es_agg.exam_id = ${examSubmissions.examId}`,
    )
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
