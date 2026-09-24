import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { validateCenterTimeZone } from "@shared/center-time";

export class InvalidCenterDateKeyError extends Error {}

function validateDateKey(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InvalidCenterDateKeyError("Ngày lọc phải theo định dạng YYYY-MM-DD");
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new InvalidCenterDateKeyError("Ngày lọc không hợp lệ");
  }
  return value;
}

export function centerDateRangeConditions(
  column: SQLWrapper,
  dateFrom?: string | null,
  dateTo?: string | null,
  timeZone?: string | null,
): SQL[] {
  if (!dateFrom && !dateTo) return [];
  if (!timeZone) throw new Error("Chưa cấu hình múi giờ của trung tâm");

  const validatedTimeZone = validateCenterTimeZone(timeZone);
  const conditions: SQL[] = [];

  if (dateFrom) {
    const startDate = validateDateKey(dateFrom);
    conditions.push(sql`${column} >= (${startDate}::date::timestamp AT TIME ZONE ${validatedTimeZone})`);
  }
  if (dateTo) {
    const endDate = validateDateKey(dateTo);
    conditions.push(sql`${column} < ((${endDate}::date + 1)::timestamp AT TIME ZONE ${validatedTimeZone})`);
  }

  return conditions;
}