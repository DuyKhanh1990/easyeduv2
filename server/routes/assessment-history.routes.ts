import type { Express } from "express";
import { getAssessmentAuditLogs } from "../storage/assessment-audit-log.storage";

function getDateBoundary(dateKey: string, dayOffset = 0): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return undefined;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year
    || calendarDate.getUTCMonth() !== month - 1
    || calendarDate.getUTCDate() !== day
  ) return undefined;

  const boundary = new Date(Date.UTC(year, month - 1, day + dayOffset));
  return boundary.toISOString().slice(0, -1).replace("T", " ");
}

export function registerAssessmentHistoryRoutes(app: Express): void {
  app.get("/api/assessments/history", async (req, res) => {
    try {
      const q = req.query as Record<string, string>;
      const dateFrom = q.dateFrom ? getDateBoundary(q.dateFrom) : undefined;
      const dateTo = q.dateTo ? getDateBoundary(q.dateTo, 1) : undefined;
      if ((q.dateFrom && !dateFrom) || (q.dateTo && !dateTo)) {
        return res.status(400).json({ message: "Date filters must use a valid YYYY-MM-DD date" });
      }
      const scope = ["list", "question-bank", "results"].includes(q.scope) ? q.scope : undefined;
      const action = ["created", "updated", "deleted"].includes(q.action) ? q.action : undefined;
      const limit = Math.min(Math.max(parseInt(q.limit || "100", 10) || 100, 1), 500);
      const offset = Math.max(parseInt(q.offset || "0", 10) || 0, 0);
      const result = await getAssessmentAuditLogs({
        dateFrom,
        dateTo,
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
      res.status(500).json({ message: error.message });
    }
  });
}