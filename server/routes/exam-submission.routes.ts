import type { Express } from "express";
import { z } from "zod";
import {
  getExamSubmissions,
  getExamSubmission,
  createExamSubmission,
  updateExamSubmission,
  deleteExamSubmission,
  resolveSubmitterByUserId,
} from "../storage/exam-submission.storage";
import { insertExamSubmissionSchema } from "@shared/schema";
import { db } from "../db";
import { examSubmissions, exams, examSections } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { triggerAsyncEssayGrading } from "./ai.routes";

export function registerExamSubmissionRoutes(app: Express): void {
  // Get current user's attempt count for a specific exam
  app.get("/api/exams/:examId/my-attempt-count", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const { examId } = req.params;

      // Get maxAttempts from exam
      const [exam] = await db
        .select({ maxAttempts: exams.maxAttempts })
        .from(exams)
        .where(eq(exams.id, examId))
        .limit(1);

      if (!exam) return res.status(404).json({ message: "Exam not found" });

      // Resolve student ID
      const submitter = await resolveSubmitterByUserId(user.id, user.username);

      if (!submitter.studentId) {
        return res.json({ count: 0, maxAttempts: exam.maxAttempts });
      }

      // Count submissions
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(examSubmissions)
        .where(and(
          eq(examSubmissions.examId, examId),
          eq(examSubmissions.studentId, submitter.studentId)
        ));

      res.json({ count: result?.count ?? 0, maxAttempts: exam.maxAttempts });
    } catch (err) {
      console.error("GET /api/exams/:examId/my-attempt-count error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/exam-submissions", async (req, res) => {
    try {
      const rows = await getExamSubmissions();
      res.json(rows);
    } catch (err) {
      console.error("GET /api/exam-submissions error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/exam-submissions/:id", async (req, res) => {
    try {
      const row = await getExamSubmission(req.params.id);
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err) {
      console.error("GET /api/exam-submissions/:id error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/exam-submissions", async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user?.id;

      const submitter = userId
        ? await resolveSubmitterByUserId(userId, user.username)
        : { name: null, code: null, studentId: null };

      const bodyWithDates = {
        ...req.body,
        ...(req.body.submittedAt ? { submittedAt: new Date(req.body.submittedAt) } : {}),
      };

      const input = insertExamSubmissionSchema.parse({
        ...bodyWithDates,
        studentName: submitter.name ?? req.body.studentName,
        studentCode: submitter.code ?? req.body.studentCode,
        ...(submitter.studentId ? { studentId: submitter.studentId } : {}),
      });

      const row = await createExamSubmission(input);
      res.status(201).json(row);

      // Trigger async AI essay grading if any sections have aiGradingEnabled
      Promise.resolve().then(async () => {
        try {
          const aiSections = await db
            .select({ id: examSections.id })
            .from(examSections)
            .where(and(eq(examSections.examId, row.examId), eq(examSections.aiGradingEnabled, true)));
          if (aiSections.length > 0) {
            await triggerAsyncEssayGrading(row.id, row.examId);
          }
        } catch {}
      });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      console.error("POST /api/exam-submissions error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/exam-submissions/:id", async (req, res) => {
    try {
      const patchSchema = z.object({
        adjustedScore: z.string().nullable().optional(),
        comment: z.string().nullable().optional(),
        aiGradingResults: z.record(z.any()).nullable().optional(),
      });
      const input = patchSchema.parse(req.body);
      const row = await updateExamSubmission(req.params.id, input as any);
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      console.error("PATCH /api/exam-submissions/:id error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/exam-submissions/:id", async (req, res) => {
    try {
      await deleteExamSubmission(req.params.id);
      res.status(204).end();
    } catch (err) {
      console.error("DELETE /api/exam-submissions/:id error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
