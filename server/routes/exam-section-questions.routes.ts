import type { Express } from "express";
import { z } from "zod";
import {
  getSectionQuestions,
  addQuestionsToSection,
  removeQuestionFromSection,
  getAllSectionsWithQuestions,
} from "../storage/exam-section-questions.storage";
import { getExamIdBySectionId } from "../storage/exam-section.storage";
import { getExamSection } from "../storage/exam-section.storage";
import { getExam } from "../storage/exam.storage";
import { getQuestion } from "../storage/question.storage";
import { examPreviewCache } from "../cache/exam-preview.cache";
import { recordAssessmentAudit } from "../lib/assessment-audit";

// ── helpers ────────────────────────────────────────────────────────────────
function detectFileType(url: string, name?: string | null): "pdf" | "word" | "excel" | "powerpoint" | "image" | "video" | "audio" | "other" {
  const n = (name || url.split("/").pop() || "").toLowerCase();
  if (/\.pdf$/i.test(n)) return "pdf";
  if (/\.(docx?|odt|rtf)$/i.test(n)) return "word";
  if (/\.(xlsx?|ods|csv)$/i.test(n)) return "excel";
  if (/\.(pptx?|odp)$/i.test(n)) return "powerpoint";
  if (/\.(jpe?g|png|gif|webp|svg|bmp|tiff?)$/i.test(n)) return "image";
  if (/\.(mp4|webm|mov|avi|mkv)$/i.test(n)) return "video";
  if (/\.(mp3|wav|ogg|aac|m4a)$/i.test(n)) return "audio";
  return "other";
}

function buildPassageInfo(url: string | null | undefined, name: string | null | undefined, baseUrl: string) {
  if (!url) return null;
  const fileType = detectFileType(url, name);
  const absoluteUrl = url.startsWith("http") ? url : `${baseUrl}${url}`;
  const officeTypes: string[] = ["word", "excel", "powerpoint"];
  return {
    url,
    absoluteUrl,
    name: name || url.split("/").pop() || "file",
    fileType,
    // For Word/Excel/PPT: embed via Microsoft Office Web Viewer (works in webview)
    viewerUrl: officeTypes.includes(fileType)
      ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absoluteUrl)}`
      : null,
    // PDF and images can be shown in webview directly; office files need viewerUrl
    canEmbedDirect: fileType === "pdf" || fileType === "image",
  };
}

function questionName(question: { title?: string | null; content?: string | null } | undefined) {
  return question?.title || question?.content?.replace(/\s+/g, " ").trim().slice(0, 100) || "Câu hỏi";
}

async function recordExamQuestionChange(
  req: any,
  {
    sectionId,
    questionId,
    added,
  }: { sectionId: string; questionId: string; added: boolean },
): Promise<void> {
  const [examId, section, question] = await Promise.all([
    getExamIdBySectionId(sectionId),
    getExamSection(sectionId),
    getQuestion(questionId),
  ]);
  if (!examId) return;

  const exam = await getExam(examId);
  if (!exam) return;

  const details = {
    questionId,
    questionName: questionName(question),
    questionType: question?.type ?? null,
    sectionName: section?.name ?? null,
  };

  await recordAssessmentAudit(req, {
    scope: "list",
    entityType: "exam",
    entityId: exam.id,
    entityCode: exam.code,
    entityName: exam.name,
    action: "updated",
    locationId: exam.locationId,
    oldContent: added
      ? { changeType: "Chưa có trong bài kiểm tra" }
      : { ...details, changeType: "Đang có trong bài kiểm tra" },
    newContent: added
      ? { ...details, changeType: "Đã thêm câu hỏi" }
      : { changeType: "Đã xóa câu hỏi" },
  });
}

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
      await Promise.all(rows.map(row => recordExamQuestionChange(req, {
        sectionId: req.params.sectionId,
        questionId: row.questionId,
        added: true,
      })));

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
      const questionId = req.params.questionId;
      const question = await getQuestion(questionId);
      await removeQuestionFromSection(req.params.sectionId, req.params.questionId);
      if (examId) examPreviewCache.invalidate(examId);
      if (question) {
        await recordExamQuestionChange(req, {
          sectionId: req.params.sectionId,
          questionId,
          added: false,
        });
      }

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

      // Determine base URL for building absolute file URLs
      const proto = (req.headers["x-forwarded-proto"] as string) || "https";
      const host = (req.headers["x-forwarded-host"] as string) || req.headers.host || "";
      const baseUrl = `${proto}://${host}`;

      // Enrich sections + fill_blank/matching questions with structured data for mobile clients
      const enriched = sections.map(section => {
        // ── passage / audio info at section level ──────────────────────────
        const passageInfo = buildPassageInfo(section.readingPassageUrl, section.readingPassageName, baseUrl);
        const audioInfo = section.sessionAudioUrl
          ? { url: section.sessionAudioUrl, name: section.sessionAudioName || section.sessionAudioUrl.split("/").pop() || "audio" }
          : null;

        return {
        ...section,
        passageInfo,
        audioInfo,
        questions: section.questions.map(sq => {
          const q = sq.question;

          // ── fill_blank: add contentParts ──────────────────────────────────
          if (q.type === "fill_blank" && q.content) {
            const parts = q.content.split(/(\{\d+\})/g);
            const contentParts = parts.map(part => {
              const match = part.match(/^\{(\d+)\}$/);
              if (match) {
                return { type: "blank" as const, blankId: match[1], index: parseInt(match[1]) - 1 };
              }
              return { type: "text" as const, text: part };
            });
            return { ...sq, question: { ...q, contentParts } };
          }

          // ── matching: add matchingData ────────────────────────────────────
          if (q.type === "matching" && Array.isArray(q.options) && q.options.length > 0) {
            const pairs = q.options as { id: string; left: { text: string }; right: { text: string } }[];

            // Parse correctAnswer for scorePerPair / shuffleB
            let scorePerPair = 1;
            let shuffleB = true;
            try {
              const ca = typeof q.correctAnswer === "string" ? JSON.parse(q.correctAnswer) : q.correctAnswer;
              if (ca && typeof ca === "object") {
                if (typeof ca.scorePerPair === "number") scorePerPair = ca.scorePerPair;
                if (typeof ca.shuffleB === "boolean") shuffleB = ca.shuffleB;
              }
            } catch {}

            // Build left/right item arrays
            const leftItems = pairs.map(p => ({ id: p.id, text: p.left?.text ?? "" }));
            const rightItems = pairs.map(p => ({ id: p.id, text: p.right?.text ?? "" }));

            // Shuffle right items if shuffleB is true (deterministic shuffle by pair id for consistency)
            const shuffledRight = shuffleB
              ? [...rightItems].sort((a, b) => a.id.localeCompare(b.id) * -1)
              : rightItems;

            // correctPairs: explicit mapping of leftId → rightId for result display
            // leftId === rightId because each pair shares the same id
            // Mobile should store answers as { leftItemId: selectedRightItemId }
            // and check correctness by: answers[leftItemId] === leftItemId
            const correctPairs = pairs.map(p => ({
              leftId: p.id,
              rightId: p.id,
              leftText: p.left?.text ?? "",
              rightText: p.right?.text ?? "",
            }));

            const matchingData = {
              leftItems,
              rightItems: shuffledRight,
              scorePerPair,
              shuffleB,
              correctPairs,
            };

            return { ...sq, question: { ...q, matchingData } };
          }

          return sq;
        }),
        };
      });

      examPreviewCache.set(examId, enriched);
      res.json(enriched);
    } catch (err) {
      console.error("GET /api/exams/:examId/preview error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
