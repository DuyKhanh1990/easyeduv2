import { db, eq, sql, desc } from "./base";
import { questions } from "./base";
import type { Question, InsertQuestion } from "./base";

export async function migrateQuestionsTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS questions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(50) NOT NULL,
        title TEXT,
        content TEXT NOT NULL,
        media_image_url TEXT,
        media_audio_url TEXT,
        options JSONB,
        correct_answer TEXT,
        score NUMERIC(5,2) NOT NULL DEFAULT 1,
        difficulty VARCHAR(20),
        explanation TEXT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log("Migration: questions table ensured");
  } catch (e: any) {
    console.log("Migration questions: already exists or skipped", e.message);
  }
}

export async function getQuestions(): Promise<Question[]> {
  return await db
    .select()
    .from(questions)
    .orderBy(desc(questions.createdAt));
}

export async function getQuestion(id: string): Promise<Question | undefined> {
  const [row] = await db.select().from(questions).where(eq(questions.id, id));
  return row;
}

export async function createQuestion(data: InsertQuestion): Promise<Question> {
  const [row] = await db.insert(questions).values(data).returning();
  return row;
}

export async function updateQuestion(id: string, data: Partial<InsertQuestion>): Promise<Question> {
  const [row] = await db
    .update(questions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(questions.id, id))
    .returning();
  return row;
}

export async function deleteQuestion(id: string): Promise<void> {
  await db.delete(questions).where(eq(questions.id, id));
}

export async function createQuestions(data: InsertQuestion[]): Promise<Question[]> {
  if (data.length === 0) return [];
  const rows = await db.insert(questions).values(data).returning();
  return rows;
}
