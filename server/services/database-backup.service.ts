import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { db, pool } from "../db";
import { databaseBackups, type DatabaseBackup } from "@shared/schema";
import { eq } from "drizzle-orm";
import { uploadBackupFileToS3FromDisk } from "../lib/s3";

export const BACKUP_LOCK_KEY = "easyedu:database-backup";
const DEFAULT_BACKUP_DIR = path.join(os.tmpdir(), "easyedu-database-backups");
const MAX_ERROR_LENGTH = 2_000;

export class BackupAlreadyRunningError extends Error {
  constructor() {
    super("Một backup database khác đang chạy.");
    this.name = "BackupAlreadyRunningError";
  }
}

export class BackupConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupConfigurationError";
  }
}

export type DatabaseBackupType = "manual" | "scheduled" | "pre_restore";

export function getDatabaseUrl(): string {
  const value = (process.env.APP_DATABASE_URL || process.env.DATABASE_URL || "").trim();
  if (!value) {
    throw new BackupConfigurationError(
      "Chưa cấu hình APP_DATABASE_URL hoặc DATABASE_URL cho database hiện tại.",
    );
  }
  return value;
}

function getBackupDirectory(): string {
  return path.resolve(process.env.BACKUP_DIR?.trim() || DEFAULT_BACKUP_DIR);
}

function getCenterId(): string {
  const value = (process.env.CENTER_ID || "").trim();
  if (!value) {
    throw new BackupConfigurationError(
      "Chưa cấu hình CENTER_ID cho deployment hiện tại.",
    );
  }
  return value;
}

/**
 * Passes the connection details to pg_dump through libpq environment variables
 * instead of putting the full URL (and its password) in the child arguments.
 */
export function createPostgresEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new BackupConfigurationError("DATABASE_URL không hợp lệ.");
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new BackupConfigurationError("DATABASE_URL phải là kết nối PostgreSQL.");
  }

  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.APP_DATABASE_URL;
  delete env.DATABASE_URL;

  env.PGHOST = parsed.hostname;
  if (parsed.port) env.PGPORT = parsed.port;
  if (parsed.username) env.PGUSER = decodeURIComponent(parsed.username);
  if (parsed.password) env.PGPASSWORD = decodeURIComponent(parsed.password);
  if (parsed.pathname && parsed.pathname !== "/") {
    env.PGDATABASE = decodeURIComponent(parsed.pathname.slice(1));
  }

  const sslMode = parsed.searchParams.get("sslmode");
  if (sslMode) env.PGSSLMODE = sslMode;

  return env;
}

function getErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.slice(0, MAX_ERROR_LENGTH);
}

async function updateBackup(
  backupId: string,
  values: Partial<typeof databaseBackups.$inferInsert>,
): Promise<void> {
  await db
    .update(databaseBackups)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(databaseBackups.id, backupId));
}

async function runPgDump(params: {
  backup: DatabaseBackup;
  databaseUrl: string;
  snapshotName: string;
  snapshotClient: import("pg").PoolClient;
  lockClient: import("pg").PoolClient;
}): Promise<void> {
  const { backup, databaseUrl, snapshotName, snapshotClient, lockClient } = params;
  const outputPath = path.join(getBackupDirectory(), `${backup.id}.dump`);
  let dumpSucceeded = false;

  try {
    await fs.mkdir(getBackupDirectory(), { recursive: true });
    await updateBackup(backup.id, {
      progressMessage: "Đang tạo file backup từ snapshot read-only.",
    });

    const stderrChunks: string[] = [];
    const child = spawn(
      "pg_dump",
      [
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "--snapshot",
        snapshotName,
        "--file",
        outputPath,
      ],
      {
        env: createPostgresEnvironment(databaseUrl),
        stdio: ["ignore", "ignore", "pipe"],
      },
    );

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderrChunks.join("").length < MAX_ERROR_LENGTH) {
        stderrChunks.push(chunk.toString());
      }
    });

    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? 1));
    });

    if (exitCode !== 0) {
      const detail = stderrChunks.join("").trim();
      throw new Error(detail || `pg_dump kết thúc với mã lỗi ${exitCode}.`);
    }

    const fileStats = await fs.stat(outputPath);
    if (!fileStats.isFile() || fileStats.size <= 0) {
      throw new Error("pg_dump không tạo được file backup hợp lệ.");
    }

    await updateBackup(backup.id, {
      progressPercent: 50,
      progressMessage: "Đang tải file backup riêng tư lên S3.",
    });
    const storageKey = await uploadBackupFileToS3FromDisk(
      outputPath,
      fileStats.size,
      getCenterId(),
      backup.id,
    );

    dumpSucceeded = true;
    await updateBackup(backup.id, {
      status: "completed",
      progressPercent: 100,
      progressMessage: "Backup hoàn tất và đã lưu trên storage.",
      storageKey,
      fileSizeBytes: String(fileStats.size),
      completedAt: new Date(),
    });
    await fs.rm(outputPath, { force: true });
  } catch (error) {
    try {
      await fs.rm(outputPath, { force: true });
    } catch {
      // Do not mask the original backup error with cleanup errors.
    }

    await updateBackup(backup.id, {
      status: "failed",
      progressMessage: "Backup thất bại.",
      errorMessage: getErrorMessage(error),
      completedAt: new Date(),
    });
  } finally {
    try {
      if (dumpSucceeded) {
        await snapshotClient.query("COMMIT");
      } else {
        await snapshotClient.query("ROLLBACK");
      }
    } catch {
      // The dump result is already recorded; always release the connections.
    } finally {
      snapshotClient.release();
    }

    try {
      await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [BACKUP_LOCK_KEY]);
    } catch {
      // The database releases the session-level lock when the connection closes.
    } finally {
      lockClient.release();
    }
  }
}

/**
 * Starts one asynchronous backup for the database configured by the current
 * deployment. The returned row is created before pg_dump starts; callers can
 * poll it for status without waiting for the dump to finish.
 *
 * The exported PostgreSQL snapshot is held open until pg_dump finishes, so the
 * dump represents one consistent, read-only point in time.
 */
export async function startDatabaseBackup(
  requestedBy?: string | null,
  backupType: DatabaseBackupType = "manual",
): Promise<DatabaseBackup> {
  const databaseUrl = getDatabaseUrl();
  const lockClient = await pool.connect();

  try {
    const lockResult = await lockClient.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
      [BACKUP_LOCK_KEY],
    );

    if (!lockResult.rows[0]?.acquired) {
      throw new BackupAlreadyRunningError();
    }

    const snapshotClient = await pool.connect();
    try {
      await snapshotClient.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const snapshotResult = await snapshotClient.query<{
        snapshot_name: string;
        snapshot_at: Date;
      }>(
        "SELECT pg_export_snapshot() AS snapshot_name, transaction_timestamp() AS snapshot_at",
      );

      const snapshot = snapshotResult.rows[0];
      if (!snapshot?.snapshot_name || !snapshot.snapshot_at) {
        throw new Error("Không lấy được snapshot time từ PostgreSQL.");
      }

      const [backup] = await db
        .insert(databaseBackups)
        .values({
          backupType,
          snapshotAt: new Date(snapshot.snapshot_at),
          status: "running",
          progressPercent: 0,
          progressMessage: "Đã tạo snapshot read-only; đang khởi chạy pg_dump.",
          requestedBy: requestedBy ?? null,
          startedAt: new Date(),
        })
        .returning();

      void runPgDump({
        backup,
        databaseUrl,
        snapshotName: snapshot.snapshot_name,
        snapshotClient,
        lockClient,
      });

      return backup;
    } catch (error) {
      try {
        await snapshotClient.query("ROLLBACK");
      } catch {
        // Ignore rollback failures while handling the original error.
      }
      snapshotClient.release();
      throw error;
    }
  } catch (error) {
    lockClient.release();
    throw error;
  }
}

/**
 * Deterministic staging path used by the next storage step to upload the dump.
 */
export function getDatabaseBackupFilePath(backupId: string): string {
  return path.join(getBackupDirectory(), `${backupId}.dump`);
}