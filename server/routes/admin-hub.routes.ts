import type { Express } from "express";
import { z } from "zod";
import {
  buildAdminHubSnapshot,
  claimAdminHubConnection,
  getAdminHubConnection,
  inferSnapshotUrl,
  syncAdminHubSnapshot,
} from "../services/admin-hub-sync.service";
import { db } from "../db";
import { adminHubConnections } from "@shared/schema";
import { eq } from "drizzle-orm";

function requireSuperAdmin(req: any, res: any): boolean {
  if (!req.isSuperAdmin) {
    res.status(403).json({ message: "Chỉ Super Admin mới có quyền quản lý kết nối Admin Hub." });
    return false;
  }
  return true;
}

export function registerAdminHubRoutes(app: Express): void {
  app.get("/api/admin-hub/connection", async (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    try {
      const connection = await getAdminHubConnection();
      res.json({ connected: Boolean(connection), connection });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin-hub/connection/claim", async (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    try {
      const body = z.object({
        apiUrl: z.string().url(),
        snapshotUrl: z.string().url().optional().or(z.literal("")),
        code: z.string().trim().min(1),
      }).parse(req.body);
      const result = await claimAdminHubConnection({
        apiUrl: body.apiUrl,
        snapshotUrl: body.snapshotUrl || undefined,
        code: body.code,
      });
      res.json({ success: true, ...result });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Thông tin kết nối không hợp lệ.", details: error.errors });
      }
      res.status(502).json({ message: error.message || "Không thể kết nối Admin Hub." });
    }
  });

  app.patch("/api/admin-hub/connection", async (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    try {
      const body = z.object({ snapshotUrl: z.string().url() }).parse(req.body);
      const connection = await getAdminHubConnection();
      if (!connection) return res.status(404).json({ message: "Chưa có kết nối Admin Hub." });
      const [updated] = await db
        .update(adminHubConnections)
        .set({ snapshotUrl: body.snapshotUrl.replace(/\/+$/, ""), updatedAt: new Date() })
        .where(eq(adminHubConnections.id, connection.id))
        .returning({
          id: adminHubConnections.id,
          apiUrl: adminHubConnections.apiUrl,
          snapshotUrl: adminHubConnections.snapshotUrl,
          connectionId: adminHubConnections.connectionId,
          centerCode: adminHubConnections.centerCode,
          isActive: adminHubConnections.isActive,
          lastSyncAt: adminHubConnections.lastSyncAt,
          lastSyncStatus: adminHubConnections.lastSyncStatus,
          lastSyncError: adminHubConnections.lastSyncError,
          updatedAt: adminHubConnections.updatedAt,
        });
      res.json({ success: true, connection: updated });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "URL API nhận snapshot không hợp lệ." });
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin-hub/connection/sync", async (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    try {
      const result = await syncAdminHubSnapshot();
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(502).json({ success: false, message: error.message || "Không thể đồng bộ Admin Hub." });
    }
  });

  app.get("/api/admin-hub/connection/preview", async (req, res) => {
    if (!requireSuperAdmin(req, res)) return;
    try {
      res.json({ success: true, snapshot: await buildAdminHubSnapshot() });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}