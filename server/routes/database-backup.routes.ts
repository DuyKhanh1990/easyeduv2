import type { Express, Request, Response } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { databaseBackups, databaseRestores } from "@shared/schema";
import {
  BackupAlreadyRunningError,
  BackupConfigurationError,
  startDatabaseBackup,
} from "../services/database-backup.service";
import {
  RestoreAlreadyRunningError,
  RestoreSourceError,
  startDatabaseRestore,
} from "../services/database-restore.service";

const backupIdSchema = z.string().uuid();

function requireSuperAdmin(req: Request, res: Response): boolean {
  if (!req.isSuperAdmin) {
    res.status(403).json({ message: "Chỉ Super Admin được truy cập." });
    return false;
  }
  return true;
}

function parseLimit(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? "20"), 10);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(Math.max(parsed, 1), 100);
}

export function registerDatabaseBackupRoutes(app: Express) {
  app.post("/api/admin/database-backups", async (req, res) => {
    if (!requireSuperAdmin(req, res)) return;

    try {
      const backup = await startDatabaseBackup(req.user?.id ?? null);
      return res.status(202).json(backup);
    } catch (error) {
      if (error instanceof BackupAlreadyRunningError) {
        return res.status(409).json({ message: error.message });
      }
      if (error instanceof BackupConfigurationError) {
        return res.status(503).json({ message: error.message });
      }

      console.error("[DatabaseBackup] Failed to start backup:", error);
      return res.status(500).json({ message: "Không thể khởi chạy backup database." });
    }
  });

  app.get("/api/admin/database-backups", async (req, res) => {
    if (!requireSuperAdmin(req, res)) return;

    try {
      const backups = await db
        .select()
        .from(databaseBackups)
        .orderBy(desc(databaseBackups.requestedAt), desc(databaseBackups.createdAt))
        .limit(parseLimit(req.query.limit));

      return res.json({ data: backups });
    } catch (error) {
      console.error("[DatabaseBackup] Failed to list backups:", error);
      return res.status(500).json({ message: "Không thể tải lịch sử backup database." });
    }
  });

  app.get("/api/admin/database-backups/:id", async (req, res) => {
    if (!requireSuperAdmin(req, res)) return;

    const parsedId = backupIdSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ message: "backupId không hợp lệ." });
    }

    try {
      const [backup] = await db
        .select()
        .from(databaseBackups)
        .where(eq(databaseBackups.id, parsedId.data))
        .limit(1);

      if (!backup) {
        return res.status(404).json({ message: "Không tìm thấy bản backup." });
      }

      return res.json(backup);
    } catch (error) {
      console.error("[DatabaseBackup] Failed to load backup:", error);
      return res.status(500).json({ message: "Không thể tải trạng thái backup database." });
    }
  });

  app.post("/api/admin/database-backups/:id/restore", async (req, res) => {
    if (!requireSuperAdmin(req, res)) return;

    const parsedId = backupIdSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ message: "backupId không hợp lệ." });
    }

    try {
      const restore = await startDatabaseRestore(
        parsedId.data,
        req.user?.id ?? null,
      );
      return res.status(202).json(restore);
    } catch (error) {
      if (error instanceof RestoreAlreadyRunningError) {
        return res.status(409).json({ message: error.message });
      }
      if (error instanceof RestoreSourceError) {
        return res.status(400).json({ message: error.message });
      }
      console.error("[DatabaseRestore] Failed to start restore:", error);
      return res.status(500).json({
        message: "Không thể khởi chạy khôi phục database.",
      });
    }
  });

  app.get("/api/admin/database-restores/:id", async (req, res) => {
    if (!requireSuperAdmin(req, res)) return;

    const parsedId = backupIdSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ message: "restoreId không hợp lệ." });
    }

    try {
      const [restore] = await db
        .select()
        .from(databaseRestores)
        .where(eq(databaseRestores.id, parsedId.data))
        .limit(1);
      if (!restore) {
        return res.status(404).json({ message: "Không tìm thấy lần khôi phục." });
      }
      return res.json(restore);
    } catch (error) {
      console.error("[DatabaseRestore] Failed to load restore:", error);
      return res.status(500).json({
        message: "Không thể tải trạng thái khôi phục database.",
      });
    }
  });
}