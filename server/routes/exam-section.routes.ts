import type { Express } from "express";
import { z } from "zod";
import {
  getExamSections,
  getExamSection,
  createExamSection,
  updateExamSection,
  deleteExamSection,
  getExamIdBySectionId,
} from "../storage/exam-section.storage";
import { insertExamSectionSchema } from "@shared/schema";
import { examPreviewCache } from "../cache/exam-preview.cache";

export function registerExamSectionRoutes(app: Express): void {
  app.get("/api/exams/:examId/sections", async (req, res) => {
    try {
      const rows = await getExamSections(req.params.examId);
      res.json(rows);
    } catch (err) {
      console.error("GET /api/exams/:examId/sections error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/exams/:examId/sections", async (req, res) => {
    try {
      const input = insertExamSectionSchema.parse({
        ...req.body,
        examId: req.params.examId,
      });
      const row = await createExamSection(input);
      examPreviewCache.invalidate(req.params.examId);
      res.status(201).json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      console.error("POST /api/exams/:examId/sections error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/exams/:examId/sections/:id", async (req, res) => {
    try {
      const input = insertExamSectionSchema.partial().parse(req.body);
      const row = await updateExamSection(req.params.id, input);
      if (!row) return res.status(404).json({ message: "Not found" });
      examPreviewCache.invalidate(req.params.examId);
      res.json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      console.error("PUT /api/exams/:examId/sections/:id error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/exams/:examId/sections/:id", async (req, res) => {
    try {
      await deleteExamSection(req.params.id);
      examPreviewCache.invalidate(req.params.examId);
      res.status(204).end();
    } catch (err) {
      console.error("DELETE /api/exams/:examId/sections/:id error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
