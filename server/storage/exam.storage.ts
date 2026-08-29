import { db, eq, sql, desc, asc, inArray } from "./base";
import { exams, examSections, examSectionQuestions, questions } from "./base";
import type { Exam, InsertExam } from "./base";

export async function migrateExamsTable(): Promise<void> {
  // No-op: exams table + all columns are declared in shared/schema.ts
  // Apply via: npm run db:push  or  npx tsx scripts/push-db-direct.ts
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

const EXAM_SELECT_FIELDS = {
  id: exams.id,
  code: exams.code,
  name: exams.name,
  locationId: exams.locationId,
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
  createdByName: sql<string | null>`s1.full_name`,
  updatedByName: sql<string | null>`s2.full_name`,
} as const;

export async function getExams(allowedLocationIds?: string[]): Promise<ExamWithUsers[]> {
  const whereClause = (allowedLocationIds && allowedLocationIds.length > 0)
    ? sql`(${exams.locationId} IS NULL OR ${exams.locationId} = ANY(ARRAY[${sql.raw(allowedLocationIds.map(id => `'${id}'`).join(','))}]::uuid[]))`
    : undefined;
  const rows = await db
    .select(EXAM_SELECT_FIELDS)
    .from(exams)
    .leftJoin(sql`staff s1`, sql`s1.user_id = ${exams.createdBy}`)
    .leftJoin(sql`staff s2`, sql`s2.user_id = ${exams.updatedBy}`)
    .where(whereClause)
    .orderBy(desc(exams.createdAt));
  return rows as ExamWithUsers[];
}

export async function getExam(id: string): Promise<ExamWithUsers | undefined> {
  const rows = await db
    .select(EXAM_SELECT_FIELDS)
    .from(exams)
    .leftJoin(sql`staff s1`, sql`s1.user_id = ${exams.createdBy}`)
    .leftJoin(sql`staff s2`, sql`s2.user_id = ${exams.updatedBy}`)
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

export type SectionStatEntry = {
  id: string;
  name: string;
  questionTypeCounts: Record<string, number>;
};

export type ExamStatSummary = {
  examId: string;
  sectionCount: number;
  sections: SectionStatEntry[];
};

export async function getExamsBulkStats(): Promise<ExamStatSummary[]> {
  const allSections = await db
    .select({ id: examSections.id, examId: examSections.examId, name: examSections.name, orderIndex: examSections.orderIndex })
    .from(examSections)
    .orderBy(asc(examSections.orderIndex));

  if (allSections.length === 0) return [];

  const allSectionIds = allSections.map((s) => s.id);

  const qRows = await db
    .select({
      sectionId: examSectionQuestions.sectionId,
      type: questions.type,
    })
    .from(examSectionQuestions)
    .innerJoin(questions, eq(examSectionQuestions.questionId, questions.id))
    .where(inArray(examSectionQuestions.sectionId, allSectionIds));

  const typeBySectionMap = new Map<string, Record<string, number>>();
  for (const r of qRows) {
    if (!r.sectionId || !r.type) continue;
    if (!typeBySectionMap.has(r.sectionId)) typeBySectionMap.set(r.sectionId, {});
    const counts = typeBySectionMap.get(r.sectionId)!;
    counts[r.type] = (counts[r.type] ?? 0) + 1;
  }

  const statsMap = new Map<string, ExamStatSummary>();
  for (const sec of allSections) {
    if (!statsMap.has(sec.examId)) {
      statsMap.set(sec.examId, { examId: sec.examId, sectionCount: 0, sections: [] });
    }
    const stat = statsMap.get(sec.examId)!;
    stat.sectionCount++;
    stat.sections.push({
      id: sec.id,
      name: sec.name,
      questionTypeCounts: typeBySectionMap.get(sec.id) ?? {},
    });
  }

  return Array.from(statsMap.values());
}

export async function cloneExam(id: string, userId?: string, overrides: Record<string, any> = {}): Promise<Exam> {
  const original = await getExam(id);
  if (!original) throw new Error("Exam not found");

  const sections = await db
    .select()
    .from(examSections)
    .where(eq(examSections.examId, id))
    .orderBy(asc(examSections.orderIndex));

  const [newExam] = await db
    .insert(exams)
    .values({
      code: overrides.code || null,
      name: overrides.name ?? `${original.name} (Bản sao)`,
      description: overrides.description ?? original.description,
      status: (overrides.status as "draft" | "published") ?? "draft",
      timeLimitMinutes: overrides.timeLimitMinutes !== undefined ? overrides.timeLimitMinutes : original.timeLimitMinutes,
      maxAttempts: overrides.maxAttempts !== undefined ? overrides.maxAttempts : (original.maxAttempts ?? 1),
      passingScore: overrides.passingScore !== undefined ? (overrides.passingScore != null ? String(overrides.passingScore) : null) : original.passingScore,
      showResult: overrides.showResult !== undefined ? overrides.showResult : (original.showResult ?? false),
      createdBy: userId ?? original.createdBy,
      updatedBy: userId ?? original.updatedBy,
    })
    .returning();

  for (const section of sections) {
    const [newSection] = await db
      .insert(examSections)
      .values({
        examId: newExam.id,
        name: section.name,
        type: section.type,
        orderIndex: section.orderIndex,
        readingPassageUrl: section.readingPassageUrl,
        readingPassageName: section.readingPassageName,
        sessionAudioUrl: section.sessionAudioUrl,
        sessionAudioName: section.sessionAudioName,
        aiGradingEnabled: section.aiGradingEnabled,
      })
      .returning();

    const questions = await db
      .select()
      .from(examSectionQuestions)
      .where(eq(examSectionQuestions.sectionId, section.id))
      .orderBy(asc(examSectionQuestions.orderIndex));

    if (questions.length > 0) {
      await db.insert(examSectionQuestions).values(
        questions.map((q, i) => ({
          sectionId: newSection.id,
          questionId: q.questionId,
          orderIndex: i,
        }))
      );
    }
  }

  return newExam;
}
