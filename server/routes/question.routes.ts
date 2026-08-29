import type { Express } from "express";
import { z } from "zod";
import {
  getQuestions,
  getQuestion,
  createQuestion,
  createQuestions,
  updateQuestion,
  deleteQuestion,
} from "../storage/question.storage";
import { insertQuestionSchema } from "@shared/schema";
import { recordAssessmentAudit } from "../lib/assessment-audit";

function questionName(question: { title?: string | null; content?: string | null }) {
  return question.title || question.content?.replace(/\s+/g, " ").trim().slice(0, 100) || "Câu hỏi";
}

export function registerQuestionRoutes(app: Express): void {
  app.get("/api/questions", async (req, res) => {
    try {
      const rows = await getQuestions();
      res.json(rows);
    } catch (err) {
      console.error("GET /api/questions error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/questions/:id", async (req, res) => {
    try {
      const row = await getQuestion(req.params.id);
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err) {
      console.error("GET /api/questions/:id error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/questions", async (req, res) => {
    try {
      const input = insertQuestionSchema.parse(req.body);
      const row = await createQuestion(input);
      await recordAssessmentAudit(req, {
        scope: "question-bank",
        entityType: "question",
        entityId: row.id,
        entityCode: row.type,
        entityName: questionName(row),
        action: "created",
        newContent: row,
      });
      res.status(201).json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      console.error("POST /api/questions error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/questions/:id", async (req, res) => {
    try {
      const input = insertQuestionSchema.partial().parse(req.body);
      const oldRow = await getQuestion(req.params.id);
      const row = await updateQuestion(req.params.id, input);
      if (!row) return res.status(404).json({ message: "Not found" });
      await recordAssessmentAudit(req, {
        scope: "question-bank",
        entityType: "question",
        entityId: row.id,
        entityCode: row.type,
        entityName: questionName(row),
        action: "updated",
        oldContent: oldRow,
        newContent: row,
      });
      res.json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      console.error("PUT /api/questions/:id error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/questions/:id", async (req, res) => {
    try {
      const oldRow = await getQuestion(req.params.id);
      await deleteQuestion(req.params.id);
      if (oldRow) {
        await recordAssessmentAudit(req, {
          scope: "question-bank",
          entityType: "question",
          entityId: oldRow.id,
          entityCode: oldRow.type,
          entityName: questionName(oldRow),
          action: "deleted",
          oldContent: oldRow,
        });
      }
      res.status(204).send();
    } catch (err) {
      console.error("DELETE /api/questions/:id error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/questions/bulk", async (req, res) => {
    try {
      const bulkSchema = z.array(insertQuestionSchema);
      const input = bulkSchema.parse(req.body);
      const rows = await createQuestions(input);
      await Promise.all(rows.map(row => recordAssessmentAudit(req, {
        scope: "question-bank",
        entityType: "question",
        entityId: row.id,
        entityCode: row.type,
        entityName: questionName(row),
        action: "created",
        newContent: row,
      })));
      res.status(201).json({ imported: rows.length, questions: rows });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      console.error("POST /api/questions/bulk error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
