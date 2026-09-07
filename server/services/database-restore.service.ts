import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "../db";
import {
  databaseBackups,
  databaseRestores,
  type DatabaseBackup,
  type DatabaseRestore,
} from "@shared/schema";
import { downloadBackupFileFromS3ToDisk } from "../lib/s3";
import {
  BACKUP_LOCK_KEY,
  BackupAlreadyRunningError,
  createPostgresEnvironment,
  getDatabaseBackupFilePath,
  getDatabaseUrl,
  startDatabaseBackup,
} from "./database-backup.service";
import { MUTATION_BARRIER_LOCK_KEY } from "./database-mutation-permit.service";
import { pruneOldDatabaseBackups } from "./database-backup-retention.service";

const RESTORE_LOCK_KEY = "easyedu:database-restore";
const MAX_ERROR_LENGTH = 2_000;
const BACKUP_POLL_MS = 5_000;
const BACKUP_TIMEOUT_MS = 6 * 60 * 60 * 1000;
const MAINTENANCE_CACHE_MS = 1_000;
const FINALIZATION_RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000, 60_000];
const FINALIZATION_SWEEP_MS = 60_000;
let maintenanceCache = {
  value: false,
  expiresAt: 0,
};
const finalizationRetryTimers = new Map<string, NodeJS.Timeout>();
const outcomeVerificationTimers = new Map<string, NodeJS.Timeout>();
let finalizationSweepStarted = false;

async function markRestoreCompleted(restoreId: string): Promise<void> {
  await db
    .update(databaseRestores)
    .set({
      status: "completed",
      progressPercent: 100,
      progressMessage:
        "Khôi phục hoàn tất. Backup dự phòng được giữ trong 3 ngày.",
      errorMessage: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(databaseRestores.id, restoreId),
        eq(databaseRestores.status, "finalizing"),
      ),
    );
  maintenanceCache.expiresAt = 0;
}

function scheduleRestoreFinalizationRetry(
  restoreId: string,
  attempt = 0,
): void {
  if (finalizationRetryTimers.has(restoreId)) return;
  const delay =
    FINALIZATION_RETRY_DELAYS_MS[
      Math.min(attempt, FINALIZATION_RETRY_DELAYS_MS.length - 1)
    ];
  const timer = setTimeout(async () => {
    finalizationRetryTimers.delete(restoreId);
    try {
      await markRestoreCompleted(restoreId);
      console.log(
        `[DatabaseRestore] Đã hoàn tất trạng thái restore ${restoreId} sau retry.`,
      );
    } catch (error) {
      if (attempt + 1 < FINALIZATION_RETRY_DELAYS_MS.length) {
        scheduleRestoreFinalizationRetry(restoreId, attempt + 1);
      } else {
        console.error(
          `[DatabaseRestore] Hết lượt retry nhanh cho restore ${restoreId}; recovery định kỳ sẽ tiếp tục thử.`,
          error,
        );
      }
    }
  }, delay);
  timer.unref();
  finalizationRetryTimers.set(restoreId, timer);
}

async function resolveRestoreOutcomeAfterError(
  restoreId: string,
  originalError: unknown,
): Promise<void> {
  const [row] = await db
    .select({ status: databaseRestores.status })
    .from(databaseRestores)
    .where(eq(databaseRestores.id, restoreId))
    .limit(1);

  if (!row) return;
  if (row.status === "completed") {
    maintenanceCache.expiresAt = 0;
    return;
  }
  if (row.status === "finalizing") {
    try {
      await markRestoreCompleted(restoreId);
    } catch {
      scheduleRestoreFinalizationRetry(restoreId);
    }
    return;
  }

  await updateRestore(restoreId, {
    status: "failed",
    progressMessage:
      "Khôi phục thất bại; database được giữ nguyên nhờ restore transaction.",
    errorMessage: getErrorMessage(originalError),
    completedAt: new Date(),
  });
  maintenanceCache.expiresAt = 0;
}

function scheduleRestoreOutcomeVerification(
  restoreId: string,
  originalError: unknown,
  attempt = 0,
): void {
  if (outcomeVerificationTimers.has(restoreId)) return;
  const delay =
    FINALIZATION_RETRY_DELAYS_MS[
      Math.min(attempt, FINALIZATION_RETRY_DELAYS_MS.length - 1)
    ];
  const timer = setTimeout(async () => {
    outcomeVerificationTimers.delete(restoreId);
    try {
      await resolveRestoreOutcomeAfterError(restoreId, originalError);
    } catch (error) {
      if (attempt + 1 === FINALIZATION_RETRY_DELAYS_MS.length) {
        console.error(
          `[DatabaseRestore] Chưa xác minh được kết quả restore ${restoreId}; tiếp tục giữ bảo trì và retry mỗi phút.`,
          error,
        );
      }
      scheduleRestoreOutcomeVerification(restoreId, originalError, attempt + 1);
    }
  }, delay);
  timer.unref();
  outcomeVerificationTimers.set(restoreId, timer);
}

async function recoverFinalizingDatabaseRestores(): Promise<void> {
  const rows = await db
    .select({ id: databaseRestores.id })
    .from(databaseRestores)
    .where(eq(databaseRestores.status, "finalizing"));
  for (const row of rows) {
    try {
      await markRestoreCompleted(row.id);
    } catch (error) {
      console.error(
        `[DatabaseRestore] Recovery định kỳ chưa thể hoàn tất restore ${row.id}:`,
        error,
      );
    }
  }
}

export function startDatabaseRestoreFinalizationRecovery(): void {
  if (finalizationSweepStarted) return;
  finalizationSweepStarted = true;
  const timer = setInterval(() => {
    void recoverFinalizingDatabaseRestores();
  }, FINALIZATION_SWEEP_MS);
  timer.unref();
}

export async function isDatabaseRestoreInProgress(
  forceRefresh = false,
): Promise<boolean> {
  if (!forceRefresh && maintenanceCache.expiresAt > Date.now()) {
    return maintenanceCache.value;
  }
  const [activeRestore] = await db
    .select({ id: databaseRestores.id })
    .from(databaseRestores)
    .where(
      inArray(databaseRestores.status, ["queued", "running", "finalizing"]),
    )
    .limit(1);
  maintenanceCache = {
    value: Boolean(activeRestore),
    expiresAt: Date.now() + MAINTENANCE_CACHE_MS,
  };
  return maintenanceCache.value;
}

export class RestoreAlreadyRunningError extends Error {
  constructor() {
    super("Một lần khôi phục database khác đang chạy.");
    this.name = "RestoreAlreadyRunningError";
  }
}

export class RestoreSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestoreSourceError";
  }
}

function getErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(
    0,
    MAX_ERROR_LENGTH,
  );
}

async function updateRestore(
  restoreId: string,
  values: Partial<typeof databaseRestores.$inferInsert>,
): Promise<void> {
  await db
    .update(databaseRestores)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(databaseRestores.id, restoreId));
}

async function waitForBackup(backupId: string): Promise<DatabaseBackup> {
  const deadline = Date.now() + BACKUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const [backup] = await db
      .select()
      .from(databaseBackups)
      .where(eq(databaseBackups.id, backupId))
      .limit(1);

    if (!backup) throw new Error("Không tìm thấy backup dự phòng.");
    if (backup.status === "completed") return backup;
    if (backup.status === "failed") {
      throw new Error(
        backup.errorMessage || "Không thể tạo backup dự phòng trước khi khôi phục.",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, BACKUP_POLL_MS));
  }
  throw new Error("Backup dự phòng chạy quá thời gian cho phép.");
}

async function runCommand(params: {
  command: string;
  args: string[];
  environment?: NodeJS.ProcessEnv;
  fallbackError: string;
}): Promise<void> {
  const { command, args, environment, fallbackError } = params;
  const stderrChunks: string[] = [];
  const child = spawn(command, args, {
    env: environment,
    stdio: ["ignore", "ignore", "pipe"],
  });

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
    throw new Error(
      stderrChunks.join("").trim() || `${fallbackError} (mã ${exitCode}).`,
    );
  }
}

async function prepareRestoreSql(
  restoreId: string,
  dumpPath: string,
  restoreListPath: string,
  restoreSqlPath: string,
): Promise<void> {
  await runCommand({
    command: "pg_restore",
    args: [
      "--format=custom",
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-privileges",
      `--use-list=${restoreListPath}`,
      `--file=${restoreSqlPath}`,
      dumpPath,
    ],
    fallbackError: "Không thể chuẩn bị nội dung khôi phục",
  });

  // This completion marker is executed by psql in the exact same transaction
  // as the restored data. A crash can no longer leave restored data reported
  // as failed, or a completed marker without restored data.
  await fs.appendFile(
    restoreSqlPath,
    `
UPDATE public.database_restores
SET status = 'finalizing',
    progress_percent = 95,
    progress_message = 'Dữ liệu đã khôi phục; đang hoàn tất chế độ bảo trì.',
    completed_at = transaction_timestamp(),
    updated_at = transaction_timestamp()
WHERE id = '${restoreId}'::uuid;
`,
    "utf8",
  );
}

async function executeRestoreSql(
  restoreSqlPath: string,
  databaseUrl: string,
): Promise<void> {
  const postgresEnvironment = createPostgresEnvironment(databaseUrl);
  if (!postgresEnvironment.PGDATABASE) {
    throw new Error("Không xác định được tên database cần khôi phục.");
  }
  postgresEnvironment.PGOPTIONS = [
    postgresEnvironment.PGOPTIONS,
    "-c default_transaction_read_only=off",
  ]
    .filter(Boolean)
    .join(" ");
  await runCommand({
    command: "psql",
    args: [
      "--single-transaction",
      "--set=ON_ERROR_STOP=1",
      `--dbname=${postgresEnvironment.PGDATABASE}`,
      `--file=${restoreSqlPath}`,
    ],
    environment: postgresEnvironment,
    fallbackError: "Không thể khôi phục database",
  });
}

async function createFilteredRestoreList(
  dumpPath: string,
  restoreListPath: string,
): Promise<void> {
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: string[] = [];
  const child = spawn("pg_restore", ["--list", dumpPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
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
    throw new Error(
      stderrChunks.join("").trim() ||
        `Không thể đọc danh sách nội dung backup (mã ${exitCode}).`,
    );
  }

  const excludedTablePattern = /database_(?:backups|restores)/;
  const filteredLines = Buffer.concat(stdoutChunks)
    .toString("utf8")
    .split("\n")
    .filter((line) => !excludedTablePattern.test(line));

  await fs.writeFile(restoreListPath, filteredLines.join("\n"), "utf8");
}

async function assertMetadataHasNoExternalForeignKeys(
  client: import("pg").PoolClient,
): Promise<void> {
  const result = await client.query<{
    table_name: string;
    constraint_name: string;
  }>(`
    SELECT source_table.relname AS table_name, constraint_row.conname AS constraint_name
    FROM pg_constraint constraint_row
    JOIN pg_class source_table ON source_table.oid = constraint_row.conrelid
    JOIN pg_namespace source_schema ON source_schema.oid = source_table.relnamespace
    JOIN pg_class target_table ON target_table.oid = constraint_row.confrelid
    WHERE constraint_row.contype = 'f'
      AND source_schema.nspname = 'public'
      AND source_table.relname IN ('database_backups', 'database_restores')
      AND target_table.relname NOT IN ('database_backups', 'database_restores')
  `);

  if (result.rows.length > 0) {
    throw new Error(
      `Database chưa sẵn sàng để restore: còn foreign key metadata ${result.rows
        .map((row) => `${row.table_name}.${row.constraint_name}`)
        .join(", ")}.`,
    );
  }
}

async function executeRestore(params: {
  restore: DatabaseRestore;
  sourceBackup: DatabaseBackup;
  requestedBy: string | null;
  restoreLockClient: import("pg").PoolClient;
}): Promise<void> {
  const { restore, sourceBackup, requestedBy, restoreLockClient } = params;
  const dumpPath = getDatabaseBackupFilePath(`restore-${restore.id}`);
  const restoreListPath = `${dumpPath}.list`;
  const restoreSqlPath = `${dumpPath}.sql`;
  let backupOperationLockHeld = false;
  let mutationBarrierHeld = false;
  let restoreCommitted = false;

  try {
    await updateRestore(restore.id, {
      status: "running",
      progressPercent: 5,
      progressMessage:
        "Đã bật chế độ bảo trì; đang chờ các thao tác ghi hiện tại hoàn tất.",
      startedAt: new Date(),
    });
    await restoreLockClient.query("SELECT pg_advisory_lock(hashtext($1))", [
      MUTATION_BARRIER_LOCK_KEY,
    ]);
    mutationBarrierHeld = true;

    await updateRestore(restore.id, {
      progressPercent: 15,
      progressMessage: "Đang tải và kiểm tra file backup đã chọn.",
    });

    await fs.mkdir(path.dirname(dumpPath), { recursive: true });
    await downloadBackupFileFromS3ToDisk(sourceBackup.storageKey!, dumpPath);
    const stats = await fs.stat(dumpPath);
    if (!stats.isFile() || stats.size <= 0) {
      throw new Error("File backup tải về không hợp lệ.");
    }
    await createFilteredRestoreList(dumpPath, restoreListPath);
    await prepareRestoreSql(
      restore.id,
      dumpPath,
      restoreListPath,
      restoreSqlPath,
    );

    await updateRestore(restore.id, {
      progressPercent: 30,
      progressMessage:
        "Các tác vụ ghi đã dừng; đang tạo backup dự phòng.",
    });

    let safetyBackup: DatabaseBackup;
    try {
      safetyBackup = await startDatabaseBackup(requestedBy, "pre_restore");
    } catch (error) {
      if (error instanceof BackupAlreadyRunningError) {
        throw new Error(
          "Đang có backup khác chạy; chưa thể tạo backup dự phòng để khôi phục.",
        );
      }
      throw error;
    }

    await updateRestore(restore.id, {
      safetyBackupId: safetyBackup.id,
      progressPercent: 40,
      progressMessage: "Đang chờ backup dự phòng hoàn tất.",
    });
    safetyBackup = await waitForBackup(safetyBackup.id);

    // Wait for any backup operation to finish, then block new backups for the
    // entire pg_restore transaction.
    await restoreLockClient.query("SELECT pg_advisory_lock(hashtext($1))", [
      BACKUP_LOCK_KEY,
    ]);
    backupOperationLockHeld = true;
    await assertMetadataHasNoExternalForeignKeys(restoreLockClient);

    await updateRestore(restore.id, {
      progressPercent: 70,
      progressMessage: "Backup dự phòng hoàn tất; đang khôi phục database.",
    });
    await executeRestoreSql(restoreSqlPath, getDatabaseUrl());
    restoreCommitted = true;
    await restoreLockClient.query(
      `
        UPDATE database_restores
        SET status = 'completed',
            progress_percent = 100,
            progress_message = 'Khôi phục hoàn tất. Backup dự phòng được giữ trong 3 ngày.',
            error_message = NULL,
            completed_at = COALESCE(completed_at, transaction_timestamp()),
            updated_at = transaction_timestamp()
        WHERE id = $1
      `,
      [restore.id],
    );

    await pruneOldDatabaseBackups().catch((error) => {
      console.error(
        "[DatabaseRestore] Restore thành công nhưng retention thất bại:",
        error,
      );
    });
  } catch (error) {
    if (restoreCommitted) {
      console.error(
        "[DatabaseRestore] Dữ liệu đã commit nhưng cleanup chưa hoàn tất:",
        error,
      );
      await restoreLockClient
        .query(
          `
            UPDATE database_restores
            SET status = $2,
                progress_percent = $3,
                progress_message = $4,
                error_message = $5,
                updated_at = transaction_timestamp()
            WHERE id = $1
          `,
          [
            restore.id,
            "finalizing",
            95,
            "Dữ liệu đã khôi phục; cần hoàn tất trạng thái bảo trì.",
            getErrorMessage(error),
          ],
        )
        .catch((updateError) => {
          console.error(
            "[DatabaseRestore] Không thể ghi trạng thái finalizing:",
            updateError,
          );
        });
      scheduleRestoreFinalizationRetry(restore.id);
    } else {
      try {
        await resolveRestoreOutcomeAfterError(restore.id, error);
      } catch (verificationError) {
        console.error(
          "[DatabaseRestore] Chưa thể xác minh restore đã commit hay rollback; tiếp tục giữ bảo trì:",
          verificationError,
        );
        scheduleRestoreOutcomeVerification(restore.id, error);
      }
    }
  } finally {
    await fs.rm(dumpPath, { force: true }).catch(() => undefined);
    await fs.rm(restoreListPath, { force: true }).catch(() => undefined);
    await fs.rm(restoreSqlPath, { force: true }).catch(() => undefined);
    if (backupOperationLockHeld) {
      await restoreLockClient
        .query("SELECT pg_advisory_unlock(hashtext($1))", [BACKUP_LOCK_KEY])
        .catch(() => undefined);
    }
    if (mutationBarrierHeld) {
      await restoreLockClient
        .query("SELECT pg_advisory_unlock(hashtext($1))", [
          MUTATION_BARRIER_LOCK_KEY,
        ])
        .catch(() => undefined);
    }
    await restoreLockClient
      .query("SELECT pg_advisory_unlock(hashtext($1))", [RESTORE_LOCK_KEY])
      .catch(() => undefined);
    restoreLockClient.release();
    maintenanceCache.expiresAt = 0;
  }
}

export async function startDatabaseRestore(
  sourceBackupId: string,
  requestedBy?: string | null,
): Promise<DatabaseRestore> {
  const [sourceBackup] = await db
    .select()
    .from(databaseBackups)
    .where(eq(databaseBackups.id, sourceBackupId))
    .limit(1);

  if (
    !sourceBackup ||
    sourceBackup.status !== "completed" ||
    !sourceBackup.storageKey
  ) {
    throw new RestoreSourceError(
      "Chỉ có thể khôi phục từ một file backup đã hoàn tất.",
    );
  }

  const restoreLockClient = await pool.connect();
  try {
    const lockResult = await restoreLockClient.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
      [RESTORE_LOCK_KEY],
    );
    if (!lockResult.rows[0]?.acquired) {
      throw new RestoreAlreadyRunningError();
    }

    const [restore] = await db
      .insert(databaseRestores)
      .values({
        sourceBackupId,
        status: "queued",
        progressMessage: "Đang chuẩn bị khôi phục database.",
        requestedBy: requestedBy ?? null,
      })
      .returning();

    maintenanceCache = {
      value: true,
      expiresAt: Date.now() + MAINTENANCE_CACHE_MS,
    };
    void executeRestore({
      restore,
      sourceBackup,
      requestedBy: requestedBy ?? null,
      restoreLockClient,
    });
    return restore;
  } catch (error) {
    restoreLockClient.release();
    throw error;
  }
}

/**
 * A crashed worker releases its advisory lock and PostgreSQL rolls back the
 * single restore transaction. On startup, mark only orphaned jobs as failed.
 */
export async function recoverInterruptedDatabaseRestores(): Promise<void> {
  const client = await pool.connect();
  try {
    const lockResult = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
      [RESTORE_LOCK_KEY],
    );
    if (!lockResult.rows[0]?.acquired) return;

    await db
      .update(databaseRestores)
      .set({
        status: "completed",
        progressPercent: 100,
        progressMessage:
          "Khôi phục hoàn tất; chế độ bảo trì đã được phục hồi sau khi tiến trình khởi động lại.",
        errorMessage: null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(databaseRestores.status, "finalizing"));

    await db
      .update(databaseRestores)
      .set({
        status: "failed",
        progressMessage:
          "Lần khôi phục trước bị gián đoạn; transaction đã được PostgreSQL rollback.",
        errorMessage: "Tiến trình khôi phục bị dừng trước khi hoàn tất.",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(inArray(databaseRestores.status, ["queued", "running"]));
    maintenanceCache.expiresAt = 0;

    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [
      RESTORE_LOCK_KEY,
    ]);
  } finally {
    client.release();
  }
}