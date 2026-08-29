import type { Express } from "express";
import { z } from "zod";
import {
  getExamSubmissions,
  getExamSubmission,
  createExamSubmission,
  updateExamSubmission,
  deleteExamSubmission,
  resolveSubmitterByUserId,
  computeExamScore,
} from "../storage/exam-submission.storage";
import {
  upsertExamSession,
  getExamSession,
  markSessionSubmitted,
} from "../storage/exam-session.storage";
import { insertExamSubmissionSchema } from "@shared/schema";
import { db } from "../db";
import { examSubmissions, exams, examSections } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { triggerAsyncEssayGrading } from "./ai.routes";
import { sendExamScoreNotification } from "../lib/attendance-notification";
import { recordAssessmentAudit } from "../lib/assessment-audit";

// ── P0: Rate limit + double-submit prevention ────────────────────────────────
// These are intentionally in-memory: they guard against accidental duplicate
// HTTP requests within the same rolling window on the same pod. They are NOT
// session state — losing them on restart / across pods is acceptable because
// each submit attempt is independently validated against the DB.
//
// Key: userId (or IP for guests). Value: timestamp of last successful submit.
const submitRateLimit = new Map<string, number>();
// Key: `${userId}:${examId}`. Tracks requests currently in-flight on this pod.
const pendingSubmits = new Set<string>();

export function registerExamSubmissionRoutes(app: Express): void {
  // ── Start exam session (PostgreSQL-backed, Kubernetes-safe) ───────────────
  app.post("/api/exams/:examId/start-session", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const { examId } = req.params;

      const [exam] = await db
        .select({ timeLimitMinutes: exams.timeLimitMinutes })
        .from(exams)
        .where(eq(exams.id, examId))
        .limit(1);

      if (!exam) return res.status(404).json({ message: "Exam not found" });

      const now = new Date();
      const expiresAt = (exam.timeLimitMinutes && exam.timeLimitMinutes > 0)
        ? new Date(now.getTime() + exam.timeLimitMinutes * 60 * 1000)
        : null;

      // Persist session to PostgreSQL — works across pods and pod restarts
      await upsertExamSession(user.id, examId, now, expiresAt);

      res.json({
        startedAt: now.toISOString(),
        expiresAt: expiresAt?.toISOString() ?? null,
      });
    } catch (err) {
      console.error("POST /api/exams/:examId/start-session error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Attempt count for current user ───────────────────────────────────────
  app.get("/api/exams/:examId/my-attempt-count", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const { examId } = req.params;
      const classId = req.query.classId as string | undefined;

      const [exam] = await db
        .select({ maxAttempts: exams.maxAttempts })
        .from(exams)
        .where(eq(exams.id, examId))
        .limit(1);

      if (!exam) return res.status(404).json({ message: "Exam not found" });

      const submitter = await resolveSubmitterByUserId(user.id, user.username);

      if (!submitter.studentId) {
        return res.json({ count: 0, maxAttempts: exam.maxAttempts });
      }

      const conditions = [
        eq(examSubmissions.examId, examId),
        eq(examSubmissions.studentId, submitter.studentId),
      ] as any[];
      if (classId) {
        conditions.push(eq(examSubmissions.classId, classId));
      }
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(examSubmissions)
        .where(and(...conditions));

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
    const user = req.user as any;
    const userId: string | undefined = user?.id;
    const examId: string | undefined = req.body?.examId;

    // ── P0: Rate limit — 1 submit per 5 seconds per user ──────────────────
    const rateLimitKey = userId ?? (req.ip ?? "unknown");
    const lastSubmitMs = submitRateLimit.get(rateLimitKey) ?? 0;
    if (Date.now() - lastSubmitMs < 5_000) {
      return res.status(429).json({
        message: "Vui lòng chờ vài giây trước khi nộp bài lại.",
      });
    }

    // ── P0: Double-submit prevention — block concurrent same-exam submits ──
    const pendingKey = `${userId ?? rateLimitKey}:${examId}`;
    if (pendingSubmits.has(pendingKey)) {
      return res.status(409).json({
        message: "Bài thi đang được xử lý. Vui lòng chờ.",
      });
    }
    pendingSubmits.add(pendingKey);

    try {
      // ── Time validation from PostgreSQL session ────────────────────────
      let sessionStartedAt: Date | undefined;
      let sessionExpiresAt: Date | undefined;

      if (userId && examId) {
        const session = await getExamSession(userId, examId);
        if (session?.expiresAt) {
          const GRACE_MS = 60_000; // 60s grace period for network latency
          if (Date.now() > new Date(session.expiresAt).getTime() + GRACE_MS) {
            pendingSubmits.delete(pendingKey);
            return res.status(422).json({
              message: "Thời gian làm bài đã hết. Bài nộp không được chấp nhận.",
            });
          }
          sessionExpiresAt = new Date(session.expiresAt);
        }
        if (session?.startedAt) {
          sessionStartedAt = new Date(session.startedAt);
        }
      }

      // ── Core: resolve submitter + compute score in parallel ─────────────
      const [submitter, scoring] = await Promise.all([
        userId
          ? resolveSubmitterByUserId(userId, user.username)
          : Promise.resolve({ name: null, code: null, studentId: null }),
        computeExamScore(req.body.examId, req.body.answers ?? {}),
      ]);

      const bodyWithDates = {
        ...req.body,
        ...(req.body.submittedAt ? { submittedAt: new Date(req.body.submittedAt) } : {}),
      };

      const input = insertExamSubmissionSchema.parse({
        ...bodyWithDates,
        studentName: submitter.name ?? req.body.studentName,
        studentCode: submitter.code ?? req.body.studentCode,
        ...(submitter.studentId ? { studentId: submitter.studentId } : {}),
        score: scoring.score,
        adjustedScore: scoring.score,
        partScores: scoring.partScores,
        ...(sessionStartedAt ? { startedAt: sessionStartedAt } : {}),
        ...(sessionExpiresAt ? { expiresAt: sessionExpiresAt } : {}),
      });

      const row = await createExamSubmission(input);
      const [examMeta] = await db
        .select({ name: exams.name, code: exams.code, locationId: exams.locationId })
        .from(exams)
        .where(eq(exams.id, row.examId))
        .limit(1);
      await recordAssessmentAudit(req, {
        scope: "results",
        entityType: "submission",
        entityId: row.id,
        entityCode: examMeta?.code,
        entityName: `${row.studentName || "Học viên"} — ${examMeta?.name || "Bài kiểm tra"}`,
        action: "created",
        locationId: examMeta?.locationId,
        newContent: row,
      });

      // Mark rate limit timestamp after successful save
      submitRateLimit.set(rateLimitKey, Date.now());

      // Mark session as submitted in PostgreSQL
      if (userId && examId) {
        markSessionSubmitted(userId, examId).catch(() => {});
      }

      res.status(201).json(row);

      // Post-submit background tasks (fire-and-forget)
      setImmediate(() => {
        sendExamScoreNotification({
          studentId: row.studentId,
          examId: row.examId,
          score: row.score,
          partScores: row.partScores as any,
        }).catch(() => {});

        db.select({ id: examSections.id })
          .from(examSections)
          .where(and(eq(examSections.examId, row.examId), eq(examSections.aiGradingEnabled, true)))
          .then(aiSections => {
            if (aiSections.length > 0) {
              triggerAsyncEssayGrading(row.id, row.examId).catch(() => {});
            }
          })
          .catch(() => {});
      });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      console.error("POST /api/exam-submissions error:", err);
      res.status(500).json({ message: "Internal server error" });
    } finally {
      pendingSubmits.delete(pendingKey);
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
      const oldRow = await getExamSubmission(req.params.id);
      const row = await updateExamSubmission(req.params.id, input as any);
      if (!row) return res.status(404).json({ message: "Not found" });
      const [examMeta] = await db
        .select({ name: exams.name, code: exams.code, locationId: exams.locationId })
        .from(exams)
        .where(eq(exams.id, row.examId))
        .limit(1);
      await recordAssessmentAudit(req, {
        scope: "results",
        entityType: "submission",
        entityId: row.id,
        entityCode: examMeta?.code,
        entityName: `${row.studentName || "Học viên"} — ${examMeta?.name || "Bài kiểm tra"}`,
        action: "updated",
        locationId: examMeta?.locationId,
        oldContent: oldRow,
        newContent: row,
      });
      res.json(row);

      sendExamScoreNotification({
        studentId: row.studentId,
        examId: row.examId,
        score: row.score,
        adjustedScore: row.adjustedScore,
        partScores: row.partScores as any,
        comment: row.comment,
      }).catch(() => {});
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      console.error("PATCH /api/exam-submissions/:id error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/exam-submissions/:id", async (req, res) => {
    try {
      const oldRow = await getExamSubmission(req.params.id);
      await deleteExamSubmission(req.params.id);
      if (oldRow) {
        const [examMeta] = await db
          .select({ name: exams.name, code: exams.code, locationId: exams.locationId })
          .from(exams)
          .where(eq(exams.id, oldRow.examId))
          .limit(1);
        await recordAssessmentAudit(req, {
          scope: "results",
          entityType: "submission",
          entityId: oldRow.id,
          entityCode: examMeta?.code,
          entityName: `${oldRow.studentName || "Học viên"} — ${examMeta?.name || "Bài kiểm tra"}`,
          action: "deleted",
          locationId: examMeta?.locationId,
          oldContent: oldRow,
        });
      }
      res.status(204).end();
    } catch (err) {
      console.error("DELETE /api/exam-submissions/:id error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
