import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { databaseBackups } from "@shared/schema";
import { pruneOldDatabaseBackups } from "./database-backup-retention.service";
import {
  BackupAlreadyRunningError,
  startDatabaseBackup,
} from "./database-backup.service";

const DEFAULT_SCHEDULE_TIME = "00:30";
const DEFAULT_TIME_ZONE = "Asia/Bangkok";
const RETRY_AFTER_LOCK_CONFLICT_MS = 10 * 60 * 1000;
const BACKUP_COMPLETION_POLL_MS = 5 * 1000;
const BACKUP_COMPLETION_TIMEOUT_MS = 6 * 60 * 60 * 1000;

type LocalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

let scheduledTimer: NodeJS.Timeout | null = null;

function getTimeZone(): string {
  const configured = process.env.DATABASE_BACKUP_TIMEZONE?.trim();
  const timeZone = configured || DEFAULT_TIME_ZONE;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return timeZone;
  } catch {
    console.warn(
      `[DatabaseBackup] Múi giờ "${timeZone}" không hợp lệ; dùng ${DEFAULT_TIME_ZONE}.`,
    );
    return DEFAULT_TIME_ZONE;
  }
}

function getScheduleTime(): { hour: number; minute: number; label: string } {
  const configured = process.env.DATABASE_BACKUP_SCHEDULE_TIME?.trim() || DEFAULT_SCHEDULE_TIME;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(configured);

  if (!match) {
    console.warn(
      `[DatabaseBackup] Giờ chạy "${configured}" không hợp lệ; dùng ${DEFAULT_SCHEDULE_TIME}.`,
    );
    return { hour: 0, minute: 30, label: DEFAULT_SCHEDULE_TIME };
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
    label: configured,
  };
}

function getLocalDateTimeParts(date: Date, timeZone: string): LocalDateTimeParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
  };
}

function getLocalDateKey(date: Date, timeZone: string): string {
  const parts = getLocalDateTimeParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/**
 * Converts a wall-clock date/time in the configured timezone to a Date.
 * The small adjustment loop also handles timezones whose UTC offset is not
 * represented by the machine's local timezone.
 */
function localPartsToUtc(parts: LocalDateTimeParts, timeZone: string): Date {
  let candidate = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute),
  );

  for (let attempt = 0; attempt < 3; attempt++) {
    const actual = getLocalDateTimeParts(candidate, timeZone);
    const targetMillis = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
    );
    const actualMillis = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
    );
    candidate = new Date(candidate.getTime() + targetMillis - actualMillis);
  }

  return candidate;
}

function addLocalDay(parts: LocalDateTimeParts): LocalDateTimeParts {
  const nextDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  return {
    year: nextDay.getUTCFullYear(),
    month: nextDay.getUTCMonth() + 1,
    day: nextDay.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
  };
}

function getNextRunAt(
  now: Date,
  timeZone: string,
  hour: number,
  minute: number,
): Date {
  const localNow = getLocalDateTimeParts(now, timeZone);
  let nextLocalRun = {
    ...localNow,
    hour,
    minute,
  };
  let nextRun = localPartsToUtc(nextLocalRun, timeZone);

  if (nextRun.getTime() <= now.getTime()) {
    nextLocalRun = addLocalDay(nextLocalRun);
    nextRun = localPartsToUtc(nextLocalRun, timeZone);
  }

  return nextRun;
}

async function hasScheduledBackupToday(
  todayKey: string,
  timeZone: string,
): Promise<boolean> {
  const [latestScheduled] = await db
    .select({ snapshotAt: databaseBackups.snapshotAt })
    .from(databaseBackups)
    .where(eq(databaseBackups.backupType, "scheduled"))
    .orderBy(desc(databaseBackups.snapshotAt))
    .limit(1);

  return Boolean(
    latestScheduled &&
      getLocalDateKey(latestScheduled.snapshotAt, timeZone) === todayKey,
  );
}

function scheduleNextRun(timeZone: string, hour: number, minute: number): void {
  if (scheduledTimer) clearTimeout(scheduledTimer);

  const nextRun = getNextRunAt(new Date(), timeZone, hour, minute);
  const delay = Math.max(1_000, nextRun.getTime() - Date.now());

  scheduledTimer = setTimeout(() => {
    scheduledTimer = null;
    void runScheduledBackup({ timeZone, hour, minute });
  }, delay);
  scheduledTimer.unref();

  console.log(
    `[DatabaseBackup] Backup tự động tiếp theo: ${nextRun.toISOString()} (${timeZone}, ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}).`,
  );
}

function scheduleRetry(timeZone: string, hour: number, minute: number): void {
  if (scheduledTimer) clearTimeout(scheduledTimer);

  scheduledTimer = setTimeout(() => {
    scheduledTimer = null;
    void runScheduledBackup({ timeZone, hour, minute });
  }, RETRY_AFTER_LOCK_CONFLICT_MS);
  scheduledTimer.unref();

  console.log(
    "[DatabaseBackup] Backup đang bận; scheduler sẽ thử lại sau 10 phút.",
  );
}

async function runScheduledBackup(params: {
  timeZone: string;
  hour: number;
  minute: number;
}): Promise<void> {
  const { timeZone, hour, minute } = params;
  const todayKey = getLocalDateKey(new Date(), timeZone);

  try {
    if (await hasScheduledBackupToday(todayKey, timeZone)) {
      console.log(
        `[DatabaseBackup] Đã có backup tự động cho ngày ${todayKey}; bỏ qua lần chạy trùng.`,
      );
      scheduleNextRun(timeZone, hour, minute);
      return;
    }

    const backup = await startDatabaseBackup(null, "scheduled");
    console.log(
      `[DatabaseBackup] Đã khởi chạy backup tự động ${backup.id} cho ngày ${todayKey}.`,
    );
    void waitForBackupAndPrune(backup.id);
    scheduleNextRun(timeZone, hour, minute);
  } catch (error) {
    if (error instanceof BackupAlreadyRunningError) {
      scheduleRetry(timeZone, hour, minute);
      return;
    }

    console.error("[DatabaseBackup] Backup tự động thất bại khi khởi chạy:", error);
    scheduleNextRun(timeZone, hour, minute);
  }
}

async function waitForBackupAndPrune(backupId: string): Promise<void> {
  const deadline = Date.now() + BACKUP_COMPLETION_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const [backup] = await db
        .select({
          status: databaseBackups.status,
          progressMessage: databaseBackups.progressMessage,
        })
        .from(databaseBackups)
        .where(eq(databaseBackups.id, backupId))
        .limit(1);

      if (!backup) {
        console.warn(
          `[DatabaseBackup] Không tìm thấy metadata cho backup tự động ${backupId}; bỏ qua retention.`,
        );
        return;
      }

      if (backup.status === "failed") {
        console.warn(
          `[DatabaseBackup] Backup tự động ${backupId} thất bại; không chạy retention.`,
        );
        return;
      }

      if (backup.status === "completed") {
        await pruneOldDatabaseBackups();
        return;
      }
    } catch (error) {
      console.error(
        `[DatabaseBackup] Lỗi theo dõi backup tự động ${backupId}:`,
        error,
      );
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, BACKUP_COMPLETION_POLL_MS));
  }

  console.warn(
    `[DatabaseBackup] Backup tự động ${backupId} chạy quá thời gian chờ; retention sẽ chạy ở lần tự động kế tiếp.`,
  );
}

export function startDatabaseBackupScheduler(): void {
  if (scheduledTimer) return;

  const timeZone = getTimeZone();
  const { hour, minute, label } = getScheduleTime();

  console.log(
    `[DatabaseBackup] Scheduler đã khởi động: mỗi ngày lúc ${label} (${timeZone}).`,
  );
  scheduleNextRun(timeZone, hour, minute);
}