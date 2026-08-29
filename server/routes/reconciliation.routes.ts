import type { Express } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { bidvReconciliationSessions } from "@shared/schema";
import {
  getReconciliationConfig,
  getReconciliationFile,
  getReconciliationSession,
  listReconciliationRecords,
  listReconciliationSessions,
  requestBidvReconciliation,
  resolveReconciliationServiceId,
} from "../services/bidv/bidv-reconciliation.service";

function canAccessLocation(req: Express.Request, locationId?: string | null) {
  return Boolean(
    req.isSuperAdmin ||
    !locationId ||
    (req.allowedLocationIds?.length > 0 && req.allowedLocationIds.includes(locationId)),
  );
}

export function registerReconciliationRoutes(app: Express) {
  app.get("/api/reconciliation/bidv/config", async (_req, res) => {
    try {
      return res.json(await getReconciliationConfig());
    } catch (error: any) {
      return res.status(400).json({ message: error?.message || "Thiếu cấu hình BIDV" });
    }
  });

  app.get("/api/reconciliation/bidv/sessions", async (req, res) => {
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(10, Number.parseInt(String(req.query.pageSize ?? "25"), 10) || 25));
    const locationId = typeof req.query.locationId === "string" ? req.query.locationId : null;
    if (!canAccessLocation(req, locationId)) return res.status(403).json({ message: "Bạn không có quyền xem cơ sở này" });
    return res.json(await listReconciliationSessions({ page, pageSize, locationId }));
  });

  app.post("/api/reconciliation/bidv/sessions", async (req, res) => {
    const parsed = z.object({
      reconcileDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày đối soát không hợp lệ"),
      locationId: z.string().uuid().nullable().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Ngày đối soát không hợp lệ" });
    const { reconcileDate, locationId = null } = parsed.data;
    if (!canAccessLocation(req, locationId)) return res.status(403).json({ message: "Bạn không có quyền tạo phiên cho cơ sở này" });
    if (!locationId) {
      return res.status(400).json({ message: "Vui lòng chọn cơ sở trước khi lấy file đối soát BIDV" });
    }

    try {
      const serviceId = await resolveReconciliationServiceId(locationId);
      if (!serviceId) {
        return res.status(400).json({ message: "Cơ sở chưa cấu hình Service ID đối soát BIDV" });
      }
      const config = await getReconciliationConfig();
      const [existing] = await db.select().from(bidvReconciliationSessions).where(and(
        eq(bidvReconciliationSessions.providerId, config.providerId),
        eq(bidvReconciliationSessions.reconcileDate, reconcileDate),
        eq(bidvReconciliationSessions.fileType, "1"),
      )).limit(1);
      if (existing) {
        if (existing.status === "failed") {
          return res.status(409).json({ message: "Ngày này đã có phiên lỗi. Hãy dùng thao tác thử lại.", session: existing });
        }
        return res.json({ session: existing, existing: true });
      }
      const [session] = await db.insert(bidvReconciliationSessions).values({
        providerId: config.providerId,
        serviceId,
        locationId,
        reconcileDate,
        fileType: "1",
        requestType: "1",
        requestedBy: (req.user as any)?.id ?? null,
      }).returning();
      void requestBidvReconciliation({
        sessionId: session.id,
        reconcileDate,
        serviceId,
        locationId,
        requestedBy: (req.user as any)?.id ?? null,
      }).catch((error) => console.error("[BIDV_RECONCILIATION] request failed:", error?.message));
      return res.status(202).json({ session, existing: false });
    } catch (error: any) {
      if (error?.code === "23505") {
        const config = await getReconciliationConfig();
        const [existing] = await db.select().from(bidvReconciliationSessions).where(and(
          eq(bidvReconciliationSessions.providerId, config.providerId),
          eq(bidvReconciliationSessions.reconcileDate, reconcileDate),
          eq(bidvReconciliationSessions.fileType, "1"),
        )).limit(1);
        return res.json({ session: existing, existing: true });
      }
      return res.status(400).json({ message: error?.message || "Không thể tạo phiên đối soát" });
    }
  });

  app.post("/api/reconciliation/bidv/sessions/:id/retry", async (req, res) => {
    const [session] = await db.select().from(bidvReconciliationSessions)
      .where(eq(bidvReconciliationSessions.id, req.params.id)).limit(1);
    if (!session) return res.status(404).json({ message: "Không tìm thấy phiên đối soát" });
    const parsed = z.object({
      locationId: z.string().uuid().nullable().optional(),
    }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "Cơ sở retry không hợp lệ" });
    const retryLocationId = parsed.data.locationId ?? session.locationId;
    if (!canAccessLocation(req, retryLocationId)) return res.status(403).json({ message: "Bạn không có quyền retry phiên này" });
    if (session.status !== "failed") return res.status(409).json({ message: "Chỉ có thể retry phiên lỗi" });
    if (!retryLocationId) {
      return res.status(400).json({ message: "Vui lòng chọn cơ sở để retry phiên đối soát BIDV" });
    }
    const serviceId = await resolveReconciliationServiceId(retryLocationId);
    if (!serviceId) return res.status(400).json({ message: "Cơ sở chưa cấu hình Service ID đối soát BIDV" });
    void requestBidvReconciliation({
      sessionId: session.id,
      reconcileDate: session.reconcileDate,
      serviceId,
      locationId: retryLocationId,
      requestedBy: (req.user as any)?.id ?? null,
    }).catch((error) => console.error("[BIDV_RECONCILIATION] retry failed:", error?.message));
    return res.status(202).json({ message: "Đã đưa phiên vào hàng đợi retry" });
  });

  app.post("/api/reconciliation/bidv/sessions/:id/refresh", async (req, res) => {
    const [session] = await db.select().from(bidvReconciliationSessions)
      .where(eq(bidvReconciliationSessions.id, req.params.id)).limit(1);
    if (!session) return res.status(404).json({ message: "Không tìm thấy phiên đối soát" });
    if (!canAccessLocation(req, session.locationId)) {
      return res.status(403).json({ message: "Bạn không có quyền cập nhật phiên đối soát này" });
    }
    if (session.status === "queued" || session.status === "running") {
      return res.status(409).json({ message: "Phiên này đang được cập nhật, vui lòng chờ hoàn tất" });
    }
    if (!session.locationId) {
      return res.status(400).json({ message: "Phiên đối soát chưa được gắn cơ sở" });
    }

    try {
      const serviceId = await resolveReconciliationServiceId(session.locationId);
      if (!serviceId) {
        return res.status(400).json({ message: "Cơ sở chưa cấu hình Service ID đối soát BIDV" });
      }
      void requestBidvReconciliation({
        sessionId: session.id,
        reconcileDate: session.reconcileDate,
        serviceId,
        locationId: session.locationId,
        requestedBy: (req.user as any)?.id ?? null,
        replaceExisting: true,
        forceRefresh: true,
      }).catch((error) => console.error("[BIDV_RECONCILIATION] refresh failed:", error?.message));
      return res.status(202).json({ message: "Đã đưa phiên vào hàng đợi cập nhật" });
    } catch (error: any) {
      return res.status(400).json({ message: error?.message || "Không thể cập nhật file đối soát" });
    }
  });

  app.get("/api/reconciliation/bidv/sessions/:id", async (req, res) => {
    const result = await getReconciliationSession(req.params.id);
    if (!result) return res.status(404).json({ message: "Không tìm thấy phiên đối soát" });
    if (!canAccessLocation(req, result.session.locationId)) return res.status(403).json({ message: "Bạn không có quyền xem phiên này" });
    return res.json(result);
  });

  app.get("/api/reconciliation/bidv/sessions/:id/records", async (req, res) => {
    const result = await getReconciliationSession(req.params.id);
    if (!result) return res.status(404).json({ message: "Không tìm thấy phiên đối soát" });
    if (!canAccessLocation(req, result.session.locationId)) return res.status(403).json({ message: "Bạn không có quyền xem phiên này" });
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(10, Number.parseInt(String(req.query.pageSize ?? "25"), 10) || 25));
    return res.json(await listReconciliationRecords(req.params.id, page, pageSize));
  });

  app.get("/api/reconciliation/bidv/sessions/:id/file", async (req, res) => {
    const result = await getReconciliationSession(req.params.id);
    if (!result) return res.status(404).json({ message: "Không tìm thấy phiên đối soát" });
    if (!canAccessLocation(req, result.session.locationId)) {
      return res.status(403).json({ message: "Bạn không có quyền xem file đối soát này" });
    }
    const file = await getReconciliationFile(req.params.id);
    if (!file) return res.status(404).json({ message: "Phiên này chưa có file đối soát" });

    const fileName = (file.fileName || `bidv-reconciliation-${result.session.reconcileDate}.txt`)
      .replace(/["\r\n]/g, "_");
    res.setHeader("Content-Type", `${file.mimeType || "text/plain"}; charset=utf-8`);
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    return res.send(file.rawContent);
  });
}