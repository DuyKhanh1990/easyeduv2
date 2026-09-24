export const DEFAULT_CENTER_TIME_ZONE = "Asia/Ho_Chi_Minh";

export type CenterDateRange = "all" | "today" | "7d" | "30d" | "thismonth";

export function validateCenterTimeZone(value: unknown): string {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error("Múi giờ Center không hợp lệ");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
  } catch {
    throw new Error("Múi giờ Center phải là tên IANA hợp lệ");
  }
  return value;
}

export function getCenterDateKey(instant: Date, timeZone: string): string {
  if (Number.isNaN(instant.getTime())) throw new Error("Thời điểm không hợp lệ");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: validateCenterTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function formatCenterInstant(
  instant: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  if (Number.isNaN(instant.getTime())) throw new Error("Thời điểm không hợp lệ");
  return new Intl.DateTimeFormat("vi-VN", {
    ...options,
    timeZone: validateCenterTimeZone(timeZone),
  }).format(instant);
}

export function shiftCalendarDateKey(key: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match || !Number.isInteger(days)) throw new Error("Ngày không hợp lệ");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) throw new Error("Ngày không hợp lệ");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isInstantInCenterDateRange(
  instant: Date | null,
  range: CenterDateRange,
  timeZone: string,
  now = new Date(),
): boolean {
  if (!instant || Number.isNaN(instant.getTime())) return false;
  if (range === "all") return true;
  const day = getCenterDateKey(instant, timeZone);
  const today = getCenterDateKey(now, timeZone);
  if (range === "today") return day === today;
  if (range === "7d" || range === "30d") {
    return day >= shiftCalendarDateKey(today, range === "7d" ? -6 : -29) && day <= today;
  }
  return day.slice(0, 7) === today.slice(0, 7) && day <= today;
}