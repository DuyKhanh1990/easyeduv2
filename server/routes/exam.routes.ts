import type { Express } from "express";
import { z } from "zod";
import { getExams, getExam, createExam, updateExam, deleteExam, isExamCodeTaken, getExamsBulkStats, cloneExam } from "../storage/exam.storage";
import { insertExamSchema } from "@shared/schema";
import { examPreviewCache } from "../cache/exam-preview.cache";
import { recordAssessmentAudit } from "../lib/assessment-audit";

export function registerExamRoutes(app: Express): void {
  // GET /api/exams — cached 60s in-memory (keyed by user's location scope)
  app.get("/api/exams", async (req, res) => {
    try {
      const { allowedLocationIds, isSuperAdmin } = req;
      const locationFilter = isSuperAdmin ? undefined : allowedLocationIds;
      // Only use cache for superAdmin (global view); per-location results skip cache
      if (!locationFilter?.length) {
        const cached = examPreviewCache.getList<Awaited<ReturnType<typeof getExams>>>();
        if (cached) {
          res.setHeader("X-Cache", "HIT");
          return res.json(cached);
        }
        const rows = await getExams(undefined);
        examPreviewCache.setList(rows);
        res.setHeader("X-Cache", "MISS");
        return res.json(rows);
      }
      const rows = await getExams(locationFilter);
      res.setHeader("X-Cache", "BYPASS");
      return res.json(rows);
    } catch (err) {
      console.error("GET /api/exams error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/exams/stats", async (req, res) => {
    try {
      const stats = await getExamsBulkStats();
      res.json(stats);
    } catch (err) {
      console.error("GET /api/exams/stats error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/exams/:id/clone", async (req, res) => {
    try {
      const user = req.user as any;
      const overrides = req.body ?? {};

      if (overrides.code) {
        const taken = await isExamCodeTaken(overrides.code);
        if (taken) {
          return res.status(409).json({ message: `Mã bài kiểm tra "${overrides.code}" đã tồn tại. Vui lòng chọn mã khác.` });
        }
      }

      const newExam = await cloneExam(req.params.id, user?.id, overrides);
      examPreviewCache.invalidateList();
      await recordAssessmentAudit(req, {
        scope: "list",
        entityType: "exam",
        entityId: newExam.id,
        entityCode: newExam.code,
        entityName: newExam.name,
        action: "created",
        locationId: newExam.locationId,
        newContent: newExam,
      });
      res.status(201).json(newExam);
    } catch (err: any) {
      if (err?.message === "Exam not found") return res.status(404).json({ message: "Not found" });
      console.error("POST /api/exams/:id/clone error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/exams/:id", async (req, res) => {
    try {
      const row = await getExam(req.params.id);
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err) {
      console.error("GET /api/exams/:id error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/exams", async (req, res) => {
    try {
      const user = req.user as any;
      const input = insertExamSchema.parse({ ...req.body, createdBy: user?.id, updatedBy: user?.id });

      if (input.code) {
        const taken = await isExamCodeTaken(input.code);
        if (taken) {
          return res.status(409).json({ message: `Mã bài kiểm tra "${input.code}" đã tồn tại. Vui lòng chọn mã khác.` });
        }
      }

      const row = await createExam(input);
      examPreviewCache.invalidateList();
      await recordAssessmentAudit(req, {
        scope: "list",
        entityType: "exam",
        entityId: row.id,
        entityCode: row.code,
        entityName: row.name,
        action: "created",
        locationId: row.locationId,
        newContent: row,
      });
      res.status(201).json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      console.error("POST /api/exams error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/exams/:id", async (req, res) => {
    try {
      const user = req.user as any;
      const input = insertExamSchema.partial().parse({ ...req.body, updatedBy: user?.id });

      if (input.code) {
        const taken = await isExamCodeTaken(input.code, req.params.id);
        if (taken) {
          return res.status(409).json({ message: `Mã bài kiểm tra "${input.code}" đã tồn tại. Vui lòng chọn mã khác.` });
        }
      }

      const oldRow = await getExam(req.params.id);
      const row = await updateExam(req.params.id, input);
      if (!row) return res.status(404).json({ message: "Not found" });
      examPreviewCache.invalidate(req.params.id);
      await recordAssessmentAudit(req, {
        scope: "list",
        entityType: "exam",
        entityId: row.id,
        entityCode: row.code,
        entityName: row.name,
        action: "updated",
        locationId: row.locationId,
        oldContent: oldRow,
        newContent: row,
      });
      res.json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      console.error("PUT /api/exams/:id error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/exams/:id", async (req, res) => {
    try {
      const oldRow = await getExam(req.params.id);
      await deleteExam(req.params.id);
      examPreviewCache.invalidate(req.params.id);
      if (oldRow) {
        await recordAssessmentAudit(req, {
          scope: "list",
          entityType: "exam",
          entityId: oldRow.id,
          entityCode: oldRow.code,
          entityName: oldRow.name,
          action: "deleted",
          locationId: oldRow.locationId,
          oldContent: oldRow,
        });
      }
      res.status(204).end();
    } catch (err) {
      console.error("DELETE /api/exams/:id error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
