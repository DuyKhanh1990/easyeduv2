import { db, sql } from "./base";

// ── Migration ────────────────────────────────────────────────────────────────

export async function migrateExamSessionsTable(): Promise<void> {
  // No-op: exam_sessions table + indexes are declared in shared/schema.ts
  // Apply via: npm run db:push  or  npx tsx scripts/push-db-direct.ts
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExamSessionRow {
  startedAt: Date;
  expiresAt: Date | null;
  status: string;
}

// ── Operations ───────────────────────────────────────────────────────────────

/**
 * Create or refresh an exam session for a user.
 * ON CONFLICT (user_id, exam_id): resets startedAt, expiresAt and status = 'active'.
 * Safe to call from any pod — idempotent and atomic.
 */
export async function upsertExamSession(
  userId: string,
  examId: string,
  startedAt: Date,
  expiresAt: Date | null,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO exam_sessions (user_id, exam_id, started_at, expires_at, status, created_at, updated_at)
    VALUES (${userId}, ${examId}, ${startedAt}, ${expiresAt}, 'active', NOW(), NOW())
    ON CONFLICT (user_id, exam_id) DO UPDATE SET
      started_at = EXCLUDED.started_at,
      expires_at = EXCLUDED.expires_at,
      status     = 'active',
      updated_at = NOW()
  `);
}

/**
 * Fetch the session for a given user + exam.
 * Returns null if no session exists.
 */
export async function getExamSession(
  userId: string,
  examId: string,
): Promise<ExamSessionRow | null> {
  const result = await db.execute(sql`
    SELECT started_at, expires_at, status
    FROM exam_sessions
    WHERE user_id = ${userId} AND exam_id = ${examId}
    LIMIT 1
  `);
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as any;
  return {
    startedAt: row.started_at,
    expiresAt: row.expires_at ?? null,
    status: row.status,
  };
}

/**
 * Mark session as submitted after a successful exam submission.
 * Idempotent — safe to call multiple times.
 */
export async function markSessionSubmitted(
  userId: string,
  examId: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE exam_sessions
    SET status = 'submitted', updated_at = NOW()
    WHERE user_id = ${userId} AND exam_id = ${examId}
  `);
}
