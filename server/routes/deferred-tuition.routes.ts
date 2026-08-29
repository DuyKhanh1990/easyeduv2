import type { Express } from "express";
import { getDeferredTuition } from "../storage/deferred-tuition.storage";

export function registerDeferredTuitionRoutes(app: Express): void {
  app.get("/api/finance/deferred-tuition", async (req, res) => {
    try {
      const { studentIds, classIds, month, page, pageSize } = req.query;

      const parseIds = (val: unknown): string[] | undefined => {
        if (!val) return undefined;
        if (Array.isArray(val)) return (val as string[]).filter(Boolean);
        if (typeof val === "string") return val.split(",").filter(Boolean);
        return undefined;
      };

      const parsedPage     = typeof page     === "string" && page     ? Math.max(1, parseInt(page, 10))     : 1;
      const parsedPageSize = typeof pageSize === "string" && pageSize ? Math.min(100, Math.max(1, parseInt(pageSize, 10))) : 20;

      const result = await getDeferredTuition({
        studentIds: parseIds(studentIds),
        classIds:   parseIds(classIds),
        month:      typeof month === "string" && month ? month : undefined,
        page:       parsedPage,
        pageSize:   parsedPageSize,
      });

      res.json(result);
    } catch (err) {
      console.error("[deferred-tuition]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
