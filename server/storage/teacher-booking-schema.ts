import { pool } from "../db";

let checkedAt = 0;
let cachedReady = false;
const CACHE_TTL_MS = 15_000;

export async function teacherBookingSchemaIsReady(): Promise<boolean> {
  if (Date.now() - checkedAt < CACHE_TTL_MS) return cachedReady;
  const result = await pool.query<{ ready: boolean }>(`
    SELECT
      to_regclass('teacher_booking_batches') IS NOT NULL
      AND to_regclass('teacher_booking_slots') IS NOT NULL
      AND to_regclass('teacher_booking_class_series') IS NOT NULL AS ready
  `);
  cachedReady = Boolean(result.rows[0]?.ready);
  checkedAt = Date.now();
  return cachedReady;
}
