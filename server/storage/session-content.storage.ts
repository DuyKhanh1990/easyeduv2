import {
  db,
  eq, and, inArray, sql,
  sessionContents, studentSessionContents,
} from "./base";

import type {
  SessionContent, InsertSessionContent,
  StudentSessionContent, InsertStudentSessionContent,
} from "./base";

// ---------------------------------------------------------------------------
// getSessionContents — returns COMMON content (not purely personal-assigned content)
// Personal-assigned content = studentSessionContents with status IS NULL (no submission yet)
// Content with submitted/graded status (student submission) is still shown as common content
// ---------------------------------------------------------------------------
export async function getSessionContents(classSessionId: string): Promise<SessionContent[]> {
  const personalIds = db
    .select({ id: studentSessionContents.sessionContentId })
    .from(studentSessionContents)
    .where(sql`${studentSessionContents.status} IS NULL`);

  return await db.select()
    .from(sessionContents)
    .where(
      and(
        eq(sessionContents.classSessionId, classSessionId),
        sql`${sessionContents.id} NOT IN (${personalIds})`
      )
    )
    .orderBy(sessionContents.displayOrder);
}

// ---------------------------------------------------------------------------
// createSessionContent
// ---------------------------------------------------------------------------
export async function createSessionContent(content: InsertSessionContent): Promise<SessionContent> {
  const [newContent] = await db.insert(sessionContents).values(content).returning();
  return newContent;
}

// ---------------------------------------------------------------------------
// updateSessionContent
// ---------------------------------------------------------------------------
export async function updateSessionContent(id: string, updates: Partial<InsertSessionContent>): Promise<SessionContent> {
  const [updated] = await db.update(sessionContents).set(updates).where(eq(sessionContents.id, id)).returning();
  return updated;
}

// ---------------------------------------------------------------------------
// deleteSessionContent
// ---------------------------------------------------------------------------
export async function deleteSessionContent(id: string): Promise<void> {
  await db.delete(sessionContents).where(eq(sessionContents.id, id));
}

// ---------------------------------------------------------------------------
// getStudentSessionContents
// ---------------------------------------------------------------------------
export async function getStudentSessionContents(studentId: string, sessionIds?: string[]): Promise<StudentSessionContent[]> {
  if (sessionIds && sessionIds.length > 0) {
    return await db.select()
      .from(studentSessionContents)
      .where(and(
        eq(studentSessionContents.studentId, studentId),
        inArray(studentSessionContents.sessionContentId, sessionIds),
      ));
  }
  return await db.select()
    .from(studentSessionContents)
    .where(eq(studentSessionContents.studentId, studentId));
}

// ---------------------------------------------------------------------------
// createStudentSessionContent
// ---------------------------------------------------------------------------
export async function createStudentSessionContent(content: InsertStudentSessionContent): Promise<StudentSessionContent> {
  const [newContent] = await db.insert(studentSessionContents).values(content).returning();
  return newContent;
}

// ---------------------------------------------------------------------------
// updateStudentSessionContent
// ---------------------------------------------------------------------------
export async function updateStudentSessionContent(id: string, updates: Partial<InsertStudentSessionContent>): Promise<StudentSessionContent> {
  const [updated] = await db.update(studentSessionContents).set(updates).where(eq(studentSessionContents.id, id)).returning();
  return updated;
}

// ---------------------------------------------------------------------------
// deleteStudentSessionContent
// ---------------------------------------------------------------------------
export async function deleteStudentSessionContent(id: string): Promise<void> {
  await db.delete(studentSessionContents).where(eq(studentSessionContents.id, id));
}
