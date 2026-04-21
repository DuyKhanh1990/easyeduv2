import type { Express } from "express";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { getDecryptedApiKey } from "./ai-settings.routes";
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
  } else {
    if (useCustomKey) {
      const genai = new GoogleGenAI({ apiKey: customApiKey! });
      const response = await genai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `${systemPrompt}\n\n${userMessage}`,
      });
      return response.text || "";
    } else {
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
  }
}

async function getAvailableProvider(): Promise<string | null> {
  const customOpenAI = await getDecryptedApiKey("openai");
  if (customOpenAI) return "openai";
  const customGemini = await getDecryptedApiKey("gemini");
  if (customGemini) return "gemini";
  if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY) return "openai";
  if (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) return "gemini";
  return null;
}

export async function triggerAsyncEssayGrading(submissionId: string, examId: string): Promise<void> {
  try {
    const provider = await getAvailableProvider();
    if (!provider) return;

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
    const gradingResults: Record<string, any> = {};

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
        if (!studentAnswer || String(studentAnswer).trim().length === 0) continue;

        const maxScore = parseFloat(String(q.score)) || 5;
        const rubric = q.explanation || "";

        const systemPrompt = `Bạn là giáo viên chấm bài tự luận chuyên nghiệp. Hãy chấm bài làm của học sinh và trả về JSON với định dạng chính xác sau (không có markdown, không có \`\`\`json):
{
  "suggestedScore": <số điểm từ 0 đến ${maxScore}, có thể là số thập phân>,
  "feedback": "<nhận xét tổng quan ngắn gọn bằng tiếng Việt>",
  "strengths": "<điểm mạnh của bài làm>",
  "weaknesses": "<điểm còn thiếu hoặc cần cải thiện>"
}

Chỉ trả về JSON, không có text nào khác.`;

        const userMessage = `ĐỀ BÀI: ${q.content}

${rubric ? `RUBRIC / ĐÁP ÁN GỢI Ý CỦA GIÁO VIÊN:\n${rubric}\n\n` : ""}ĐIỂM TỐI ĐA: ${maxScore}

BÀI LÀM CỦA HỌC SINH:
${studentAnswer}`;

        try {
          const rawOutput = await callAI(provider, systemPrompt, userMessage);
          const cleaned = rawOutput.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
          const result = JSON.parse(cleaned);
          gradingResults[sq.id] = {
            questionId: q.id,
            suggestedScore: Math.min(Math.max(parseFloat(String(result.suggestedScore)) || 0, 0), maxScore),
            maxScore,
            feedback: result.feedback || "",
            strengths: result.strengths || "",
            weaknesses: result.weaknesses || "",
            status: "pending",
            gradedAt: new Date().toISOString(),
          };
        } catch (err) {
          console.error(`[AI Essay Grading] Failed to grade question ${q.id}:`, err);
        }
      }
    }

    await updateExamSubmission(submissionId, {
      aiGradingResults: Object.keys(gradingResults).length > 0 ? gradingResults : {},
    });
  } catch (err) {
    console.error("[AI Essay Grading] Async grading error:", err);
  }
}

export function registerAIRoutes(app: Express) {
  app.post("/api/ai/generate-questions", async (req, res) => {
    try {
      const { provider, prompt, questionType, count = 5, difficulty = "medium" } = req.body;

      if (!provider || !prompt || !questionType) {
        return res.status(400).json({ message: "Thiếu thông tin: provider, prompt, questionType" });
      }
      if (!["openai", "gemini"].includes(provider)) {
        return res.status(400).json({ message: "provider phải là 'openai' hoặc 'gemini'" });
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

      const provider = reqProvider || await getAvailableProvider();
      if (!provider) return res.status(400).json({ message: "Chưa cấu hình AI. Vui lòng thêm API key trong Tài khoản AI." });

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
      const cleaned = rawOutput.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      const result = JSON.parse(cleaned);

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
}
