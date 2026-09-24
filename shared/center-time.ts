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

/**
 * Resolve a calendar date + wall-clock time in the Center's IANA timezone.
 *
 * Nonexistent times (the spring-forward gap) and ambiguous times (the
 * fall-back overlap) are rejected instead of being interpreted in the
 * browser's timezone or silently normalized by Date.
 */
export function centerWallTimeToInstant(dateKey: string, time: string, timeZone: string): Date {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!dateMatch || !timeMatch) throw new Error("Ngày hoặc giờ lịch không hợp lệ");

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] ?? "0");
  const dateCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    dateCheck.getUTCFullYear() !== year ||
    dateCheck.getUTCMonth() !== month - 1 ||
    dateCheck.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw new Error("Ngày hoặc giờ lịch không hợp lệ");
  }

  const zone = validateCenterTimeZone(timeZone);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, second);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const getWallClockEpoch = (instant: Date): number => {
    const parts = Object.fromEntries(
      formatter.formatToParts(instant).map((part) => [part.type, part.value]),
    );
    return Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
  };
  const sameWallClock = (instant: Date) => getWallClockEpoch(instant) === wallClock;

  // Sampling both sides of the requested wall time captures either offset at
  // a nearby DST transition without relying on the host/browser timezone.
  const offsets = new Set<number>();
  for (const hours of [-48, -24, 0, 24, 48]) {
    const sample = new Date(wallClock + hours * 60 * 60 * 1000);
    offsets.add(getWallClockEpoch(sample) - sample.getTime());
  }

  const candidates = [...offsets]
    .map((offset) => new Date(wallClock - offset))
    .filter(sameWallClock)
    .sort((left, right) => left.getTime() - right.getTime());

  if (candidates.length === 0) {
    throw new Error(`Giờ lịch không tồn tại tại ${zone} do chuyển giờ mùa hè`);
  }
  if (candidates.length > 1) {
    throw new Error(`Giờ lịch không xác định duy nhất tại ${zone} do chuyển giờ mùa hè`);
  }
  return candidates[0];
}

export interface CenterOnlineRule {
  earlyEntryMinutes: number;
  lateEntryMinutes: number;
  earlyEndMinutes: number;
}

export function computeCenterOnlineWindowState(
  sessionDate: string,
  startTime: string,
  endTime: string,
  rule: CenterOnlineRule | null | undefined,
  timeZone: string,
  now = new Date(),
): { canJoin: boolean; canEnd: boolean } {
  if (!rule) return { canJoin: true, canEnd: true };

  try {
    const minuteValues = [rule.earlyEntryMinutes, rule.lateEntryMinutes, rule.earlyEndMinutes];
    if (minuteValues.some((value) => !Number.isFinite(value) || value < 0)) {
      return { canJoin: false, canEnd: false };
    }

    const sessionStart = centerWallTimeToInstant(sessionDate, startTime, timeZone);
    let endDate = sessionDate;
    let sessionEnd = centerWallTimeToInstant(endDate, endTime, timeZone);
    if (sessionEnd.getTime() <= sessionStart.getTime()) {
      endDate = shiftCalendarDateKey(sessionDate, 1);
      sessionEnd = centerWallTimeToInstant(endDate, endTime, timeZone);
    }

    const nowMs = now.getTime();
    const joinFrom = sessionStart.getTime() - rule.earlyEntryMinutes * 60_000;
    const joinUntil = sessionStart.getTime() + rule.lateEntryMinutes * 60_000;
    const endFrom = sessionEnd.getTime() - rule.earlyEndMinutes * 60_000;

    return {
      canJoin: nowMs >= joinFrom && nowMs <= joinUntil,
      canEnd: nowMs >= endFrom,
    };
  } catch {
    // Do not enable attendance/online actions when a local schedule cannot be
    // represented unambiguously as an instant in its Center timezone.
    return { canJoin: false, canEnd: false };
  }
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