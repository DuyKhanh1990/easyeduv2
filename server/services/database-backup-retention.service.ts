import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { databaseBackups } from "@shared/schema";
import { deleteBackupFileFromS3 } from "../lib/s3";

const DEFAULT_RETENTION_COUNT = 4;

function getRetentionCount(): number {
  const configured = Number.parseInt(
    process.env.DATABASE_BACKUP_RETENTION_COUNT || String(DEFAULT_RETENTION_COUNT),
    10,
  );

  if (!Number.isFinite(configured) || configured < 1) {
    console.warn(
      `[DatabaseBackup] DATABASE_BACKUP_RETENTION_COUNT không hợp lệ; dùng ${DEFAULT_RETENTION_COUNT}.`,
    );
    return DEFAULT_RETENTION_COUNT;
  }

  return configured;
}

/**
 * Keeps the newest completed backup artifacts for the current deployment.
 * The database is the source of truth for this deployment; its storage keys
 * already include CENTER_ID on S3.
 */
export async function pruneOldDatabaseBackups(): Promise<{
  kept: number;
  deleted: number;
  failed: number;
}> {
  const retentionCount = getRetentionCount();
  const completedBackups = await db
    .select({
      id: databaseBackups.id,
      storageKey: databaseBackups.storageKey,
      snapshotAt: databaseBackups.snapshotAt,
    })
    .from(databaseBackups)
    .where(
      and(
        eq(databaseBackups.status, "completed"),
        isNotNull(databaseBackups.storageKey),
      ),
    )
    .orderBy(desc(databaseBackups.snapshotAt), desc(databaseBackups.createdAt));

  const staleBackups = completedBackups.slice(retentionCount);
  let deleted = 0;
  let failed = 0;

  for (const backup of staleBackups) {
    if (!backup.storageKey) continue;

    try {
      // Delete the object first. If metadata deletion fails, the next cleanup
      // run can safely retry the idempotent S3 delete before removing metadata.
      await deleteBackupFileFromS3(backup.storageKey);
      await db.delete(databaseBackups).where(eq(databaseBackups.id, backup.id));
      deleted++;
    } catch (error) {
      failed++;
      console.error(
        `[DatabaseBackup] Không thể dọn backup cũ ${backup.id}:`,
        error,
      );
    }
  }

  if (deleted > 0 || failed > 0) {
    console.log(
      `[DatabaseBackup] Retention: giữ ${retentionCount}, đã xóa ${deleted}, lỗi ${failed}.`,
    );
  }

  return {
    kept: Math.min(completedBackups.length, retentionCount),
    deleted,
    failed,
  };
}