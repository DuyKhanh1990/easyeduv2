import type { Express } from "express";
import { z } from "zod";
import { getExams, getExam, createExam, updateExam, deleteExam, isExamCodeTaken } from "../storage/exam.storage";
import { insertExamSchema } from "@shared/schema";
import { examPreviewCache } from "../cache/exam-preview.cache";

export function registerExamRoutes(app: Express): void {
  app.get("/api/exams", async (req, res) => {
    try {
      const rows = await getExams();
      res.json(rows);
    } catch (err) {
      console.error("GET /api/exams error:", err);
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

      const row = await updateExam(req.params.id, input);
      if (!row) return res.status(404).json({ message: "Not found" });
      examPreviewCache.invalidate(req.params.id);
      res.json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      console.error("PUT /api/exams/:id error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/exams/:id", async (req, res) => {
    try {
      await deleteExam(req.params.id);
      examPreviewCache.invalidate(req.params.id);
      res.status(204).end();
    } catch (err) {
      console.error("DELETE /api/exams/:id error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
