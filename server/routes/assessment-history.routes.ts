import type { Express } from "express";
import { db } from "../db";
import { centerConfig } from "@shared/schema";
import { validateCenterTimeZone } from "@shared/center-time";
import { InvalidCenterDateKeyError } from "../lib/center-date-range";
import { getAssessmentAuditLogs } from "../storage/assessment-audit-log.storage";

export function registerAssessmentHistoryRoutes(app: Express): void {
  app.get("/api/assessments/history", async (req, res) => {
    try {
      const q = req.query as Record<string, string>;
      const [center] = await db.select({ timeZone: centerConfig.timezone }).from(centerConfig).limit(1);
      if (!center) return res.status(503).json({ message: "Chưa cấu hình trung tâm" });
      const scope = ["list", "question-bank", "results"].includes(q.scope) ? q.scope : undefined;
      const action = ["created", "updated", "deleted"].includes(q.action) ? q.action : undefined;
      const limit = Math.min(Math.max(parseInt(q.limit || "100", 10) || 100, 1), 500);
      const offset = Math.max(parseInt(q.offset || "0", 10) || 0, 0);
      const result = await getAssessmentAuditLogs({
        dateFrom: q.dateFrom,
        dateTo: q.dateTo,
        timeZone: validateCenterTimeZone(center.timeZone),
        scope,
        action,
        allowedLocationIds: req.allowedLocationIds,
        isSuperAdmin: req.isSuperAdmin,
        limit,
        offset,
      });

      res.json({
        total: result.total,
        events: result.events.map(event => ({
          id: event.id,
          scope: event.scope,
          entity_type: event.entityType,
          entity_id: event.entityId,
          entity_code: event.entityCode,
          entity_name: event.entityName,
          action: event.action,
          ev_time: event.createdAt,
          old_content: event.oldContent,
          new_content: event.newContent,
          user_name: event.userName,
          location_name: event.locationName,
        })),
      });
    } catch (error: any) {
      console.error("[assessment-history] error:", error);
      if (error instanceof InvalidCenterDateKeyError) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: error.message });
    }
  });
}