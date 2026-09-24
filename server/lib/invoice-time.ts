import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import {
  centerWallTimeToInstant,
  getCenterDateKey,
} from "@shared/center-time";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function nextDateKey(dateKey: string): string {
  const match = DATE_ONLY_PATTERN.exec(dateKey);
  if (!match) throw new Error("Ngày lọc phải theo định dạng YYYY-MM-DD");
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error("Ngày lọc không hợp lệ");
  }
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function normalizeInvoiceInstant(
  value: Date | null | undefined,
  rawValue: unknown,
  timeZone: string,
): Date | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof rawValue === "string" && DATE_ONLY_PATTERN.test(rawValue)) {
    return centerWallTimeToInstant(rawValue, "00:00", timeZone);
  }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error("Thời điểm hóa đơn không hợp lệ");
  }
  return value;
}

export function invoiceBusinessDateOnly(
  value: unknown,
  rawValue: unknown,
  timeZone: string,
): string | null {
  if (typeof rawValue === "string" && DATE_ONLY_PATTERN.test(rawValue)) {
    // Validate the calendar date in the same timezone-aware conversion path
    // used when persisting the invoice instant.
    centerWallTimeToInstant(rawValue, "00:00", timeZone);
    return rawValue;
  }
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return getCenterDateKey(date, timeZone);
}

export function getCenterDayRangeInstants(
  dateFrom: string | undefined,
  dateTo: string | undefined,
  timeZone: string,
): { from?: Date; toExclusive?: Date } {
  return {
    ...(dateFrom ? { from: centerWallTimeToInstant(dateFrom, "00:00", timeZone) } : {}),
    ...(dateTo
      ? { toExclusive: centerWallTimeToInstant(nextDateKey(dateTo), "00:00", timeZone) }
      : {}),
  };
}

export function centerInstantRangeConditions(
  column: SQLWrapper,
  dateFrom: string | undefined,
  dateTo: string | undefined,
  timeZone: string,
): SQL[] {
  const range = getCenterDayRangeInstants(dateFrom, dateTo, timeZone);
  const conditions: SQL[] = [];
  if (range.from) conditions.push(sql`${column} >= ${range.from}`);
  if (range.toExclusive) conditions.push(sql`${column} < ${range.toExclusive}`);
  return conditions;
}