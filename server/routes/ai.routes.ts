import type { Express } from "express";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { getDecryptedApiKey, getGradingMode } from "./ai-settings.routes";
import { db } from "../db";
import { examSections, examSectionQuestions, questions, examSubmissions } from "@shared/schema";
import { eq, and, asc } from "drizzle-orm";
import { updateExamSubmission } from "../storage/exam-submission.storage";

const QUESTION_TYPE_INSTRUCTIONS: Record<string, string> = {
  single_choice: `Tạo câu hỏi trắc nghiệm một đáp án đúng. Mỗi câu hỏi có:
- "content": nội dung câu hỏi
- "options": mảng 4 đối tượng [{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}]
- "correctAnswer": một trong "A", "B", "C", "D"
- "explanation": giải thích đáp án đúng`,

  multiple_choice: `Tạo câu hỏi có nhiều đáp án đúng. Mỗi câu hỏi có:
- "content": nội dung câu hỏi
- "options": mảng 4 đối tượng [{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}]
- "correctAnswer": chuỗi các đáp án đúng phân cách bằng dấu phẩy, ví dụ "A,C" hoặc "A,B,D"
- "explanation": giải thích các đáp án đúng`,

  fill_blank: `Tạo câu hỏi điền vào chỗ trống. Mỗi câu hỏi có:
- "content": nội dung câu hỏi với {1}, {2}, ... đánh dấu chỗ trống, ví dụ "Thủ đô Việt Nam là {1} và có dân số khoảng {2} triệu người."
- "options": mảng đối tượng cho mỗi chỗ trống [{"id":"1","score":1,"answers":["đáp án1","đáp án đồng nghĩa"]}, ...]
- "correctAnswer": chuỗi tóm tắt ví dụ "{1}: Hà Nội; {2}: 8"
- "explanation": giải thích`,

  essay: `Tạo câu hỏi tự luận. Mỗi câu hỏi có:
- "content": nội dung câu hỏi/đề tự luận
- "explanation": gợi ý đáp án hoặc hướng dẫn chấm điểm
- "options": null
- "correctAnswer": null`,

  matching: `Tạo câu hỏi nối (matching). Mỗi câu hỏi có:
- "content": mô tả yêu cầu nối
- "options": mảng cặp nối [{"id":"pair-1","left":{"text":"..."},"right":{"text":"..."}},...] tối thiểu 4 cặp
- "correctAnswer": chuỗi JSON ví dụ "{\"scorePerPair\":1,\"shuffleB\":true}"
- "explanation": giải thích`,
};

function buildSystemPrompt(questionType: string, count: number, difficulty: string): string {
  const typeInstruction = QUESTION_TYPE_INSTRUCTIONS[questionType] || QUESTION_TYPE_INSTRUCTIONS.single_choice;
  const difficultyLabel = difficulty === "easy" ? "Dễ" : difficulty === "medium" ? "Trung bình" : "Khó";

  return `Bạn là chuyên gia ra đề thi giáo dục. Hãy tạo đúng ${count} câu hỏi loại "${questionType}" với độ khó "${difficultyLabel}".

${typeInstruction}

Trả về CHÍNH XÁC một JSON array (không có markdown, không có \`\`\`json). Mỗi phần tử trong array là một object câu hỏi với các trường:
{
  "type": "${questionType}",
  "title": null,
  "content": "...",
  "options": ...,
  "correctAnswer": "...",
  "score": 1,
  "difficulty": "${difficulty}",
  "explanation": "..."
}

Chỉ trả về JSON array, không có text nào khác.`;
}

function parseAIResponse(raw: string): any[] {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return [parsed];
    return [];
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return [];
  }
}

function parseAIObject(raw: string): Record<string, any> {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {}

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    const parsed = JSON.parse(match[0]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  }

  throw new Error("AI không trả về JSON chấm bài hợp lệ");
}

async function callAI(provider: string, systemPrompt: string, userMessage: string): Promise<string> {
  const customApiKey = await getDecryptedApiKey(provider);
  const useCustomKey = !!customApiKey;

  if (provider === "openai") {
    const apiKey = useCustomKey ? customApiKey! : process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const baseURL = useCustomKey ? undefined : process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    const openai = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
    const response = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });
    return response.choices[0]?.message?.content || "";
  }

  if (provider === "gemini") {
    if (useCustomKey) {
      const genai = new GoogleGenAI({ apiKey: customApiKey! });
      const response = await genai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `${systemPrompt}\n\n${userMessage}`,
      });
      return response.text || "";
    }

    const geminiBaseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    if (!geminiBaseUrl) throw new Error("Gemini chưa được cấu hình");
    const genai = new GoogleGenAI({
      apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
      httpOptions: { apiVersion: "", baseUrl: geminiBaseUrl },
    });
    const response = await genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `${systemPrompt}\n\n${userMessage}`,
    });
    return response.text || "";
  }

  if (provider === "groq") {
    if (!customApiKey) throw new Error("Groq chưa được cấu hình");
    const groq = new OpenAI({
      apiKey: customApiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });
    const response = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      max_tokens: 2048,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });
    return response.choices[0]?.message?.content || "";
  }

  throw new Error(`AI provider không được hỗ trợ: ${provider}`);
}

async function getAvailableProvider(): Promise<string | null> {
  const customOpenAI = await getDecryptedApiKey("openai");
  if (customOpenAI) return "openai";
  const customGemini = await getDecryptedApiKey("gemini");
  if (customGemini) return "gemini";
  const customGroq = await getDecryptedApiKey("groq");
  if (customGroq) return "groq";
  if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY) return "openai";
  if (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) return "gemini";
  return null;
}

// ─── Concurrency limiter (global across all submissions) ─────────────────────
const MAX_CONCURRENT_AI_CALLS = 6;

class Semaphore {
  private queue: Array<() => void> = [];
  private running = 0;

  constructor(private readonly max: number) {}

  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const attempt = () => {
        if (this.running < this.max) {
          this.running++;
          resolve(() => {
            this.running--;
            if (this.queue.length > 0) this.queue.shift()!();
          });
        } else {
          this.queue.push(attempt);
        }
      };
      attempt();
    });
  }
}

const aiSemaphore = new Semaphore(MAX_CONCURRENT_AI_CALLS);

// ─── Per-submission write serializer (prevents race conditions on DB writes) ──
const submissionWriteLocks = new Map<string, Promise<void>>();

function enqueueWrite(submissionId: string, fn: () => Promise<void>): Promise<void> {
  const prev = submissionWriteLocks.get(submissionId) ?? Promise.resolve();
  const next = prev.then(fn).catch((err) => {
    console.error(`[AI Essay Grading] Write error for submission ${submissionId}:`, err);
  });
  submissionWriteLocks.set(submissionId, next);
  return next;
}

// ─── AI call helpers ──────────────────────────────────────────────────────────
async function callAIWithTimeout(
  provider: string,
  systemPrompt: string,
  userMessage: string,
  timeoutMs = 45_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`AI call timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    callAI(provider, systemPrompt, userMessage)
      .then((r) => { clearTimeout(timer); resolve(r); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

function extractRetryDelayMs(err: unknown): number {
  try {
    const msg = String((err as any)?.message || "");
    // Gemini returns retryDelay like "retryDelay":"7s" or "6.98s"
    const match = msg.match(/"retryDelay"\s*:\s*"([\d.]+)s"/);
    if (match) return Math.ceil(parseFloat(match[1])) * 1000 + 1000;
  } catch {}
  return 15_000;
}

function isRateLimitError(err: unknown): boolean {
  const msg = String((err as any)?.message || "");
  return msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("rate limit") || msg.includes("quota");
}

// Phân biệt daily quota hết (không thể retry ngay) với per-minute rate limit (có thể retry sau vài giây)
function isDailyQuotaExhausted(err: unknown): boolean {
  const msg = String((err as any)?.message || "");
  return (
    msg.includes("PerDay") ||
    msg.includes("per_day") ||
    msg.includes("GenerateRequestsPerDayPerProject") ||
    msg.includes("free_tier_requests") ||
    msg.includes("free tier") ||
    // retryDelay >= 30s thường là daily quota (per-minute limit chỉ cần vài giây)
    (() => {
      const match = msg.match(/"retryDelay"\s*:\s*"([\d.]+)s"/);
      return match ? parseFloat(match[1]) >= 30 : false;
    })()
  );
}

async function callAIWithRetry(
  provider: string,
  systemPrompt: string,
  userMessage: string,
  maxRetries = 3,
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callAIWithTimeout(provider, systemPrompt, userMessage);
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        const isRateLimit = isRateLimitError(err);
        // Nếu là daily quota hết, không retry — sẽ tiếp tục thất bại
        if (isRateLimit && isDailyQuotaExhausted(err)) {
          console.warn(
            `[AI Essay Grading] Daily quota exhausted — skipping retries.`,
          );
          break;
        }
        const delayMs = isRateLimit ? extractRetryDelayMs(err) : 3000;
        console.warn(
          `[AI Essay Grading] Attempt ${attempt + 1} failed${isRateLimit ? " (rate limit)" : ""}, retrying in ${delayMs}ms…`,
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

// ─── Incremental result saver ─────────────────────────────────────────────────
async function savePartialGradingResult(
  submissionId: string,
  sqId: string,
  value: Record<string, any>,
): Promise<void> {
  return enqueueWrite(submissionId, async () => {
    const [row] = await db
      .select({ aiGradingResults: examSubmissions.aiGradingResults })
      .from(examSubmissions)
      .where(eq(examSubmissions.id, submissionId))
      .limit(1);
    const current = (row?.aiGradingResults as Record<string, any>) ?? {};
    current[sqId] = value;
    await updateExamSubmission(submissionId, { aiGradingResults: current });
  });
}

// ─── Per-task grader (shared by both parallel and sequential paths) ───────────
type GradingTask = {
  sqId: string;
  questionId: string;
  content: string;
  score: unknown;
  explanation: string | null;
  studentAnswer: string;
};

async function gradeOneTask(
  submissionId: string,
  task: GradingTask,
  provider: string,
): Promise<void> {
  const release = await aiSemaphore.acquire();
  const startedAt = new Date();
  const startedAtMs = startedAt.getTime();
  try {
    const maxScore = parseFloat(String(task.score)) || 5;
    const rubric = task.explanation || "";

    const systemPrompt =
      `Bạn là giáo viên chấm bài tự luận chuyên nghiệp. Hãy chấm bài làm của học sinh và trả về JSON với định dạng chính xác sau (không có markdown, không có \`\`\`json):\n` +
      `{\n` +
      `  "suggestedScore": <số điểm từ 0 đến ${maxScore}, có thể là số thập phân>,\n` +
      `  "feedback": "<nhận xét tổng quan ngắn gọn bằng tiếng Việt>",\n` +
      `  "strengths": "<điểm mạnh của bài làm>",\n` +
      `  "weaknesses": "<điểm còn thiếu hoặc cần cải thiện>"\n` +
      `}\n\nChỉ trả về JSON, không có text nào khác.`;

    const userMessage =
      `ĐỀ BÀI: ${task.content}\n\n` +
      (rubric ? `RUBRIC / ĐÁP ÁN GỢI Ý CỦA GIÁO VIÊN:\n${rubric}\n\n` : "") +
      `ĐIỂM TỐI ĐA: ${maxScore}\n\nBÀI LÀM CỦA HỌC SINH:\n${task.studentAnswer}`;

    const rawOutput = await callAIWithRetry(provider, systemPrompt, userMessage);
    const cleaned = rawOutput
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let result: Record<string, any>;
    try {
      result = JSON.parse(cleaned);
    } catch {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error(`AI returned non-JSON response: ${cleaned.slice(0, 200)}`);
      result = JSON.parse(jsonMatch[0]);
    }

    await savePartialGradingResult(submissionId, task.sqId, {
      questionId: task.questionId,
      suggestedScore: Math.min(
        Math.max(parseFloat(String(result.suggestedScore)) || 0, 0),
        maxScore,
      ),
      maxScore,
      feedback: result.feedback || "",
      strengths: result.strengths || "",
      weaknesses: result.weaknesses || "",
      status: "pending",
      gradedAt: new Date().toISOString(),
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAtMs,
      provider,
    });

    console.log(`[AI Essay Grading] ✓ Question ${task.questionId} graded for submission ${submissionId}`);
  } catch (err) {
    console.error(`[AI Essay Grading] ✗ Failed question ${task.questionId} for submission ${submissionId}:`, err);
    const errorReason = isDailyQuotaExhausted(err) ? "daily_quota" : isRateLimitError(err) ? "rate_limit" : "unknown";
    await savePartialGradingResult(submissionId, task.sqId, {
      questionId: task.questionId,
      suggestedScore: null,
      maxScore: parseFloat(String(task.score)) || 5,
      feedback: "",
      strengths: "",
      weaknesses: "",
      status: "error",
      errorReason,
      gradedAt: new Date().toISOString(),
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAtMs,
      provider,
    }).catch(() => {});
  } finally {
    release();
  }
}

// ─── Main grading entry point ─────────────────────────────────────────────────
// retryErrorsOnly=true: chỉ chấm lại câu có status "error"/"pending", bỏ qua "accepted"/"adjusted"
export async function triggerAsyncEssayGrading(
  submissionId: string,
  examId: string,
  retryErrorsOnly = false,
): Promise<void> {
  try {
    const { gradingProvider: configuredProvider } = await getGradingMode();
    const provider = configuredProvider || await getAvailableProvider();
    if (!provider) {
      console.warn("[AI Essay Grading] No AI provider configured.");
      return;
    }
    if (configuredProvider) {
      console.log(`[AI Essay Grading] Using configured provider: ${configuredProvider}`);
    }

    const [submission] = await db
      .select()
      .from(examSubmissions)
      .where(eq(examSubmissions.id, submissionId))
      .limit(1);
    if (!submission) return;

    const sections = await db
      .select()
      .from(examSections)
      .where(and(eq(examSections.examId, examId), eq(examSections.aiGradingEnabled, true)));

    if (sections.length === 0) {
      await updateExamSubmission(submissionId, { aiGradingResults: {} });
      return;
    }

    const answers = (submission.answers as Record<string, any>) || {};
    const existingResults = (submission.aiGradingResults as Record<string, any>) ?? {};

    // Collect all essay questions across sections
    const allTasks: GradingTask[] = [];
    for (const section of sections) {
      const sectionQs = await db
        .select()
        .from(examSectionQuestions)
        .innerJoin(questions, eq(examSectionQuestions.questionId, questions.id))
        .where(eq(examSectionQuestions.sectionId, section.id))
        .orderBy(asc(examSectionQuestions.orderIndex));

      for (const row of sectionQs) {
        const sq = row.exam_section_questions;
        const q = row.questions;
        if (q.type !== "essay") continue;
        const studentAnswer = answers[sq.id];
        const answerStr = studentAnswer != null ? String(studentAnswer) : null;
        const isEmpty = !answerStr || answerStr.trim().length === 0;
        if (isEmpty) continue;
        allTasks.push({
          sqId: sq.id,
          questionId: q.id,
          content: q.content,
          score: q.score,
          explanation: q.explanation,
          studentAnswer: answerStr!,
        });
      }
    }

    if (allTasks.length === 0) {
      await updateExamSubmission(submissionId, { aiGradingResults: {} });
      return;
    }

    // Filter: if retryErrorsOnly, skip already accepted/adjusted questions
    const tasks = retryErrorsOnly
      ? allTasks.filter((t) => {
          const existing = existingResults[t.sqId];
          return !existing || (existing.status !== "accepted" && existing.status !== "adjusted");
        })
      : allTasks;

    if (tasks.length === 0) {
      console.log(`[AI Essay Grading] No tasks to (re)grade for submission ${submissionId}`);
      return;
    }

    // Pre-save all tasks as "pending" so the dialog always shows all questions from the start
    const preSaveResults = { ...existingResults };
    for (const task of tasks) {
      preSaveResults[task.sqId] = {
        questionId: task.questionId,
        suggestedScore: null,
        maxScore: parseFloat(String(task.score)) || 5,
        feedback: "",
        strengths: "",
        weaknesses: "",
        status: "pending",
        gradedAt: null,
      };
    }
    await updateExamSubmission(submissionId, { aiGradingResults: preSaveResults });

    console.log(
      `[AI Essay Grading] Submission ${submissionId}: ${tasks.length} task(s) to grade` +
      (retryErrorsOnly ? " (retry errors only)" : ""),
    );

    // Check grading mode setting
    const { parallelMode } = await getGradingMode();

    if (parallelMode) {
      console.log(`[AI Essay Grading] Grading ${tasks.length} task(s) in PARALLEL mode`);
      await Promise.all(tasks.map((task) => gradeOneTask(submissionId, task, provider)));
    } else {
      const MIN_INTERVAL_MS = 13_000;
      console.log(`[AI Essay Grading] Grading ${tasks.length} task(s) sequentially (${MIN_INTERVAL_MS}ms gap)`);
      for (let taskIdx = 0; taskIdx < tasks.length; taskIdx++) {
        const taskStart = Date.now();
        await gradeOneTask(submissionId, tasks[taskIdx], provider);
        if (taskIdx < tasks.length - 1) {
          const elapsed = Date.now() - taskStart;
          const wait = MIN_INTERVAL_MS - elapsed;
          if (wait > 0) {
            console.log(`[AI Essay Grading] Rate-limit guard: waiting ${wait}ms before next question`);
            await new Promise((r) => setTimeout(r, wait));
          }
        }
      }
    }

    submissionWriteLocks.delete(submissionId);
    console.log(`[AI Essay Grading] Completed all tasks for submission ${submissionId}`);
  } catch (err) {
    console.error("[AI Essay Grading] Outer error:", err);
    submissionWriteLocks.delete(submissionId);
  }
}

export function registerAIRoutes(app: Express) {
  app.post("/api/ai/generate-questions", async (req, res) => {
    try {
      const { provider, prompt, questionType, count = 5, difficulty = "medium" } = req.body;

      if (!provider || !prompt || !questionType) {
        return res.status(400).json({ message: "Thiếu thông tin: provider, prompt, questionType" });
      }
      if (!["openai", "gemini", "groq"].includes(provider)) {
        return res.status(400).json({ message: "provider phải là 'openai', 'gemini' hoặc 'groq'" });
      }

      const systemPrompt = buildSystemPrompt(questionType, count, difficulty);
      const userMessage = `Chủ đề/Yêu cầu: ${prompt}`;

      const rawOutput = await callAI(provider, systemPrompt, userMessage);
      const qs = parseAIResponse(rawOutput);
      if (qs.length === 0) {
        return res.status(500).json({ message: "AI không trả về câu hỏi hợp lệ. Vui lòng thử lại." });
      }

      res.json({ questions: qs });
    } catch (err: any) {
      console.error("[AI Generate Questions] Error:", err);
      const msg = err?.message || "Lỗi khi tạo câu hỏi bằng AI";
      res.status(500).json({ message: msg });
    }
  });

  app.post("/api/ai/grade-essay", async (req, res) => {
    try {
      const { questionContent, rubric, studentAnswer, maxScore, provider: reqProvider } = req.body;
      if (!questionContent || !studentAnswer) {
        return res.status(400).json({ message: "Thiếu thông tin bài làm" });
      }

      const { gradingProvider: configuredProvider } = await getGradingMode();
      const provider = reqProvider || configuredProvider || await getAvailableProvider();
      if (!provider) return res.status(400).json({ message: "Chưa cấu hình AI. Vui lòng thêm API key trong Tài khoản AI." });
      if (!["openai", "gemini", "groq"].includes(provider)) {
        return res.status(400).json({ message: "provider chấm bài không được hỗ trợ" });
      }

      const maxPts = parseFloat(String(maxScore)) || 5;
      const systemPrompt = `Bạn là giáo viên chấm bài tự luận chuyên nghiệp. Hãy chấm bài làm của học sinh và trả về JSON với định dạng chính xác sau (không có markdown):
{
  "suggestedScore": <số điểm từ 0 đến ${maxPts}>,
  "feedback": "<nhận xét tổng quan ngắn gọn bằng tiếng Việt>",
  "strengths": "<điểm mạnh>",
  "weaknesses": "<điểm cần cải thiện>"
}

Chỉ trả về JSON.`;

      const userMessage = `ĐỀ BÀI: ${questionContent}
${rubric ? `\nRUBRIC / ĐÁP ÁN GỢI Ý:\n${rubric}\n` : ""}
ĐIỂM TỐI ĐA: ${maxPts}

BÀI LÀM:
${studentAnswer}`;

      const rawOutput = await callAI(provider, systemPrompt, userMessage);
      const result = parseAIObject(rawOutput);

      res.json({
        suggestedScore: Math.min(Math.max(parseFloat(String(result.suggestedScore)) || 0, 0), maxPts),
        feedback: result.feedback || "",
        strengths: result.strengths || "",
        weaknesses: result.weaknesses || "",
      });
    } catch (err: any) {
      console.error("[AI Grade Essay] Error:", err);
      res.status(500).json({ message: err?.message || "Lỗi khi chấm bài bằng AI" });
    }
  });

  app.post("/api/ai/grade-submission/:submissionId", async (req, res) => {
    try {
      const { submissionId } = req.params;
      const [submission] = await db
        .select({ examId: examSubmissions.examId })
        .from(examSubmissions)
        .where(eq(examSubmissions.id, submissionId))
        .limit(1);
      if (!submission) return res.status(404).json({ message: "Không tìm thấy bài làm" });

      res.json({ message: "Đang chấm bài bằng AI..." });
      Promise.resolve().then(() => triggerAsyncEssayGrading(submissionId, submission.examId));
    } catch (err: any) {
      console.error("[AI Grade Submission] Error:", err);
      res.status(500).json({ message: err?.message || "Lỗi" });
    }
  });

  // Retry: chỉ chấm lại các câu đang lỗi/pending, giữ nguyên câu đã accepted/adjusted
  app.post("/api/ai/grade-submission/:submissionId/retry", async (req, res) => {
    try {
      const { submissionId } = req.params;
      const [submission] = await db
        .select({ examId: examSubmissions.examId })
        .from(examSubmissions)
        .where(eq(examSubmissions.id, submissionId))
        .limit(1);
      if (!submission) return res.status(404).json({ message: "Không tìm thấy bài làm" });

      res.json({ message: "Đang chấm lại các câu lỗi bằng AI..." });
      Promise.resolve().then(() => triggerAsyncEssayGrading(submissionId, submission.examId, true));
    } catch (err: any) {
      console.error("[AI Grade Submission Retry] Error:", err);
      res.status(500).json({ message: err?.message || "Lỗi" });
    }
  });
}
