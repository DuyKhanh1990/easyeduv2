import type { Express } from "express";
import { z } from "zod";
import {
  getSectionQuestions,
  addQuestionsToSection,
  removeQuestionFromSection,
  getAllSectionsWithQuestions,
} from "../storage/exam-section-questions.storage";
import { getExamIdBySectionId } from "../storage/exam-section.storage";
import { examPreviewCache } from "../cache/exam-preview.cache";

export function registerExamSectionQuestionRoutes(app: Express): void {
  app.get("/api/exam-sections/:sectionId/questions", async (req, res) => {
    try {
      const rows = await getSectionQuestions(req.params.sectionId);
      res.json(rows);
    } catch (err) {
      console.error("GET /api/exam-sections/:sectionId/questions error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/exam-sections/:sectionId/questions", async (req, res) => {
    try {
      const schema = z.object({ questionIds: z.array(z.string().uuid()) });
      const { questionIds } = schema.parse(req.body);
      const rows = await addQuestionsToSection(req.params.sectionId, questionIds);

      const examId = await getExamIdBySectionId(req.params.sectionId);
      if (examId) examPreviewCache.invalidate(examId);

      res.status(201).json(rows);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      console.error("POST /api/exam-sections/:sectionId/questions error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/exam-sections/:sectionId/questions/:questionId", async (req, res) => {
    try {
      const examId = await getExamIdBySectionId(req.params.sectionId);
      await removeQuestionFromSection(req.params.sectionId, req.params.questionId);
      if (examId) examPreviewCache.invalidate(examId);

      res.status(204).end();
    } catch (err) {
      console.error("DELETE /api/exam-sections/:sectionId/questions/:questionId error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/exams/:examId/preview", async (req, res) => {
    try {
      const { examId } = req.params;

      const cached = examPreviewCache.get(examId);
      if (cached) return res.json(cached);

      const sections = await getAllSectionsWithQuestions(examId);
      examPreviewCache.set(examId, sections);
      res.json(sections);
    } catch (err) {
      console.error("GET /api/exams/:examId/preview error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
