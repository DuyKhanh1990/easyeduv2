const VIETNAM_OFFSET_HOURS = 7;

type StoredWallClockParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

function readStoredWallClockParts(value: string | Date): StoredWallClockParts | null {
  const text = value instanceof Date ? value.toISOString() : String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?/.exec(text);
  if (!match) return null;

  const parts: StoredWallClockParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? 0),
    minute: Number(match[5] ?? 0),
    second: Number(match[6] ?? 0),
    millisecond: Number((match[7] ?? "0").padEnd(3, "0")),
  };
  const check = new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  ));
  if (
    check.getUTCFullYear() !== parts.year
    || check.getUTCMonth() !== parts.month - 1
    || check.getUTCDate() !== parts.day
    || check.getUTCHours() !== parts.hour
    || check.getUTCMinutes() !== parts.minute
    || check.getUTCSeconds() !== parts.second
  ) return null;
  return parts;
}

/**
 * Parses a PostgreSQL TIMESTAMP WITHOUT TIME ZONE that stores Vietnam
 * wall-clock time. The server currently serializes these values with a
 * synthetic Z, so the ISO components must be preserved rather than shifted.
 */
export function parseStoredVietnamTimestamp(value: string | Date): Date | null {
  const parts = readStoredWallClockParts(value);
  if (!parts) return null;
  return new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour - VIETNAM_OFFSET_HOURS,
    parts.minute,
    parts.second,
    parts.millisecond,
  ));
}

export function storedVietnamTimestampSortValue(value: string | Date): number {
  const parts = readStoredWallClockParts(value);
  if (!parts) return Number.NaN;
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
}

export function getStoredVietnamDateKey(value: string | Date): string {
  const parts = readStoredWallClockParts(value);
  if (!parts) return "";
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function formatStoredVietnamTimestamp(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
): string {
  if (!value) return "—";
  const instant = parseStoredVietnamTimestamp(value);
  if (!instant) return String(value);
  return new Intl.DateTimeFormat("vi-VN", {
    ...options,
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(instant);
}

export function getVietnamTodayKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}