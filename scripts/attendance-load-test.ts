import { and, desc, eq, isNotNull, lte, ne } from "drizzle-orm";
import { classSessions, studentSessions } from "../shared/schema";
import { db, pool } from "../server/db";
import { bulkUpdateAttendance } from "../server/storage/attendance.storage";

const REQUEST_COUNT = 10;
const ROWS_PER_REQUEST = 1;
const STABLE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

type CandidateRow = {
  classId: string;
  classSessionId: string;
  studentSessionId: string;
  attendanceStatus: string;
};

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function errorKind(error: unknown): string {
  const value = error as { code?: unknown; message?: unknown };
  const message = typeof value?.message === "string" ? value.message.toLowerCase() : "";
  if (/too many clients|remaining connection slots/.test(message)) return "connection_limit";
  if (/timeout|timed out/.test(message)) return "timeout";
  if (typeof value?.code === "string") return value.code;
  return "request_failed";
}

async function main(): Promise<void> {
  const stableBefore = new Date(Date.now() - STABLE_DAYS * DAY_MS);
  const sessionDateCutoff = stableBefore.toISOString().slice(0, 10);
  const candidates = await db
    .select({
      classId: classSessions.classId,
      classSessionId: studentSessions.classSessionId,
      studentSessionId: studentSessions.id,
      attendanceStatus: studentSessions.attendanceStatus,
    })
    .from(studentSessions)
    .innerJoin(classSessions, eq(classSessions.id, studentSessions.classSessionId))
    .where(and(
      lte(classSessions.sessionDate, sessionDateCutoff),
      ne(classSessions.status, "cancelled"),
      isNotNull(studentSessions.attendanceStatus),
      ne(studentSessions.attendanceStatus, "pending"),
      lte(studentSessions.updatedAt, stableBefore),
    ))
    .orderBy(desc(classSessions.sessionDate), desc(studentSessions.updatedAt))
    .limit(10_000);

  const byClass = new Map<string, Map<string, CandidateRow[]>>();
  for (const row of candidates) {
    if (!row.attendanceStatus) continue;
    let sessions = byClass.get(row.classId);
    if (!sessions) {
      sessions = new Map();
      byClass.set(row.classId, sessions);
    }
    let sessionRows = sessions.get(row.classSessionId);
    if (!sessionRows) {
      sessionRows = [];
      sessions.set(row.classSessionId, sessionRows);
    }
    if (sessionRows.length < ROWS_PER_REQUEST) {
      sessionRows.push({
        classId: row.classId,
        classSessionId: row.classSessionId,
        studentSessionId: row.studentSessionId,
        attendanceStatus: row.attendanceStatus,
      });
    }
  }

  const batches: CandidateRow[][] = [];
  for (const sessions of byClass.values()) {
    const eligible = [...sessions.values()].find((rows) => rows.length === ROWS_PER_REQUEST);
    if (!eligible) continue;
    batches.push(eligible);
    if (batches.length === REQUEST_COUNT) break;
  }

  if (batches.length < REQUEST_COUNT) {
    console.log(
      `[AttendanceLoadTest] ABORT: found ${batches.length} eligible classes; ` +
      `${REQUEST_COUNT} required. No attendance rows were written.`,
    );
    return;
  }

  let maxActive = 0;
  let maxWaiting = 0;
  let maxTotal = 0;
  const samplePool = () => {
    maxActive = Math.max(maxActive, pool.totalCount - pool.idleCount);
    maxWaiting = Math.max(maxWaiting, pool.waitingCount);
    maxTotal = Math.max(maxTotal, pool.totalCount);
  };
  const sampler = setInterval(samplePool, 5);
  samplePool();

  const allStartedAt = performance.now();
  const results = await Promise.all(batches.map(async (rows) => {
    const startedAt = performance.now();
    try {
      const changed = await bulkUpdateAttendance(
        rows[0].classSessionId,
        rows.map((row) => ({
          studentSessionId: row.studentSessionId,
          attendanceStatus: row.attendanceStatus,
        })),
        null,
        null,
      );
      return {
        durationMs: performance.now() - startedAt,
        changedRows: changed.length,
        error: null,
      };
    } catch (error) {
      return {
        durationMs: performance.now() - startedAt,
        changedRows: 0,
        error: errorKind(error),
      };
    }
  }));
  const totalDurationMs = performance.now() - allStartedAt;
  samplePool();
  clearInterval(sampler);

  const durations = results.map((result) => result.durationMs);
  const failures = results.filter((result) => result.error !== null);
  const changedRows = results.reduce((sum, result) => sum + result.changedRows, 0);
  const errorCounts = new Map<string, number>();
  for (const failure of failures) {
    const kind = failure.error ?? "request_failed";
    errorCounts.set(kind, (errorCounts.get(kind) ?? 0) + 1);
  }

  console.log(
    `[AttendanceLoadTest] requests=${results.length} rowsPerRequest=${ROWS_PER_REQUEST} ` +
    `poolMax=${pool.options.max} totalMs=${Math.round(totalDurationMs)}`,
  );
  console.log(
    `[AttendanceLoadTest] latencyMs p50=${Math.round(percentile(durations, 0.50))} ` +
    `p95=${Math.round(percentile(durations, 0.95))} p99=${Math.round(percentile(durations, 0.99))} ` +
    `max=${Math.round(Math.max(...durations))}`,
  );
  console.log(
    `[AttendanceLoadTest] poolHighWater active=${maxActive} waiting=${maxWaiting} total=${maxTotal} ` +
    `failures=${failures.length} unexpectedStatusChanges=${changedRows}`,
  );
  if (errorCounts.size > 0) {
    console.log(`[AttendanceLoadTest] errorKinds=${JSON.stringify(Object.fromEntries(errorCounts))}`);
  }
  if (failures.length > 0 || changedRows > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(`[AttendanceLoadTest] Preflight failed: ${errorKind(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });