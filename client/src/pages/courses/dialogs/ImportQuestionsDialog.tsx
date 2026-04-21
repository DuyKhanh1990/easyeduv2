import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Upload, FileSpreadsheet, FileText, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const QUESTION_TYPES = [
  { value: "single_choice", label: "Câu hỏi trắc nghiệm" },
  { value: "multiple_choice", label: "Câu hỏi có nhiều lựa chọn" },
  { value: "fill_blank", label: "Câu hỏi điền vào chỗ trống" },
  { value: "essay", label: "Câu hỏi tự luận" },
  { value: "matching", label: "Câu hỏi nối" },
];

type ParseError = { row: number; message: string };
type ParsedQuestion = {
  type: string;
  title: string | null;
  content: string;
  options: any[];
  correctAnswer: string;
  score: string;
  difficulty: string | null;
  explanation: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeAnswerList(raw: string): string[] {
  return raw
    .toUpperCase()
    .split(/[,;\s]+/)
    .map(s => s.trim())
    .filter(s => /^[A-H]$/.test(s));
}

// ─── Excel parsers ────────────────────────────────────────────────────────────

function parseSingleChoiceRow(
  row: (string | number | undefined)[],
  rowIndex: number
): { question?: ParsedQuestion; error?: ParseError } {
  const get = (i: number) => String(row[i] ?? "").trim();

  const content = get(1);
  if (!content) return { error: { row: rowIndex, message: "Thiếu nội dung câu hỏi" } };

  const optA = get(2);
  const optB = get(3);
  if (!optA || !optB) return { error: { row: rowIndex, message: "Thiếu đáp án A hoặc B (bắt buộc)" } };

  const correctAnswerRaw = get(6).toUpperCase();
  if (!correctAnswerRaw) return { error: { row: rowIndex, message: "Thiếu đáp án đúng" } };

  const builtOptions: { id: string; text: string }[] = [];
  const optC = get(4);
  const optD = get(5);
  if (optA) builtOptions.push({ id: "A", text: optA });
  if (optB) builtOptions.push({ id: "B", text: optB });
  if (optC) builtOptions.push({ id: "C", text: optC });
  if (optD) builtOptions.push({ id: "D", text: optD });

  if (!builtOptions.find(o => o.id === correctAnswerRaw)) {
    return { error: { row: rowIndex, message: `Đáp án đúng "${correctAnswerRaw}" không khớp với các đáp án đã nhập` } };
  }

  const scoreRaw = get(7);
  const score =
    scoreRaw && !isNaN(Number(scoreRaw)) && Number(scoreRaw) > 0
      ? String(Number(scoreRaw))
      : "1";

  const difficultyRaw = get(8).toLowerCase();
  const difficulty = ["easy", "medium", "hard"].includes(difficultyRaw) ? difficultyRaw : null;

  return {
    question: {
      type: "single_choice",
      title: get(0) || null,
      content,
      options: builtOptions,
      correctAnswer: correctAnswerRaw,
      score,
      difficulty,
      explanation: get(9) || null,
    },
  };
}

function parseMultipleChoiceRow(
  row: (string | number | undefined)[],
  rowIndex: number
): { question?: ParsedQuestion; error?: ParseError } {
  const get = (i: number) => String(row[i] ?? "").trim();

  const content = get(1);
  if (!content) return { error: { row: rowIndex, message: "Thiếu nội dung câu hỏi" } };

  const optA = get(2);
  const optB = get(3);
  if (!optA || !optB) return { error: { row: rowIndex, message: "Thiếu đáp án A hoặc B (bắt buộc)" } };

  const builtOptions: { id: string; text: string }[] = [];
  const optC = get(4);
  const optD = get(5);
  if (optA) builtOptions.push({ id: "A", text: optA });
  if (optB) builtOptions.push({ id: "B", text: optB });
  if (optC) builtOptions.push({ id: "C", text: optC });
  if (optD) builtOptions.push({ id: "D", text: optD });

  const correctAnswersRaw = get(6);
  if (!correctAnswersRaw) return { error: { row: rowIndex, message: "Thiếu đáp án đúng (vd: A,B)" } };

  const correctList = normalizeAnswerList(correctAnswersRaw);
  if (correctList.length === 0) {
    return { error: { row: rowIndex, message: `Đáp án đúng "${correctAnswersRaw}" không hợp lệ (vd: A,B hoặc A,C,D)` } };
  }

  const invalidAnswers = correctList.filter(id => !builtOptions.find(o => o.id === id));
  if (invalidAnswers.length > 0) {
    return { error: { row: rowIndex, message: `Đáp án đúng "${invalidAnswers.join(",")}" không khớp với các đáp án đã nhập` } };
  }

  const scoreRaw = get(7);
  const score =
    scoreRaw && !isNaN(Number(scoreRaw)) && Number(scoreRaw) > 0
      ? String(Number(scoreRaw))
      : "1";

  const difficultyRaw = get(8).toLowerCase();
  const difficulty = ["easy", "medium", "hard"].includes(difficultyRaw) ? difficultyRaw : null;

  return {
    question: {
      type: "multiple_choice",
      title: get(0) || null,
      content,
      options: builtOptions,
      correctAnswer: correctList.sort().join(","),
      score,
      difficulty,
      explanation: get(9) || null,
    },
  };
}

// ─── Fill blank helpers ───────────────────────────────────────────────────────

const MAX_FILL_BLANKS = 6;

function extractFillBlankKeys(content: string): string[] {
  const matches = [...content.matchAll(/\{(\d+)\}/g)];
  const unique = [...new Set(matches.map(m => m[1]))];
  return unique.sort((a, b) => Number(a) - Number(b));
}

function parsePipeAnswers(raw: string): string[] {
  return raw.split("|").map(s => s.trim()).filter(Boolean);
}

function parseFillBlankExcelRow(
  row: (string | number | undefined)[],
  rowIndex: number,
  explanationColIndex: number
): { question?: ParsedQuestion; error?: ParseError } {
  const get = (i: number) => String(row[i] ?? "").trim();

  const content = get(0);
  if (!content) return { error: { row: rowIndex, message: "Thiếu nội dung câu hỏi (cột question)" } };

  const blankKeys = extractFillBlankKeys(content);
  if (blankKeys.length === 0) {
    return { error: { row: rowIndex, message: `Nội dung câu hỏi không có ô trống {1}, {2}... (cột question)` } };
  }

  const blanks: { id: string; answers: string[]; score: number }[] = [];

  for (let i = 0; i < blankKeys.length; i++) {
    const key = blankKeys[i];
    const answersRaw = get(1 + i * 2);
    const scoreRaw = get(2 + i * 2);

    if (!answersRaw) {
      return { error: { row: rowIndex, message: `Ô trống {${key}}: thiếu đáp án (cột blank_${key}_answers)` } };
    }

    const answers = parsePipeAnswers(answersRaw);
    if (answers.length === 0) {
      return { error: { row: rowIndex, message: `Ô trống {${key}}: đáp án không hợp lệ` } };
    }

    const scoreNum = parseFloat(scoreRaw);
    const score = !isNaN(scoreNum) && scoreNum > 0 ? scoreNum : 1;

    blanks.push({ id: key, answers, score });
  }

  const totalScore = blanks.reduce((s, b) => s + b.score, 0);
  const correctAnswer = blanks.map(b => `{${b.id}}: ${b.answers[0]}`).join("; ");
  const explanation = get(explanationColIndex) || null;

  return {
    question: {
      type: "fill_blank",
      title: null,
      content,
      options: blanks,
      correctAnswer,
      score: String(totalScore),
      difficulty: null,
      explanation,
    },
  };
}

function parseFillBlankWordBlock(
  block: string,
  questionNum: number
): { question?: ParsedQuestion; error?: ParseError } {
  const lines = block.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  if (!lines.length) return { error: { row: questionNum, message: `Câu ${questionNum}: khối trống` } };

  const firstLine = lines[0];
  const contentMatch = firstLine.match(/^Câu\s+\d+\s*:\s*(.+)/i);
  if (!contentMatch) {
    return { error: { row: questionNum, message: `Câu ${questionNum}: không đọc được nội dung` } };
  }
  const content = contentMatch[1].trim();

  const blankKeys = extractFillBlankKeys(content);
  if (blankKeys.length === 0) {
    return { error: { row: questionNum, message: `Câu ${questionNum}: nội dung không có ô trống {1}, {2}...` } };
  }

  const blankMap: Record<string, { answers: string[]; score: number }> = {};
  let explanation: string | null = null;
  let currentBlankKey: string | null = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    const blankHeaderMatch = line.match(/^Ô\s+(\d+)\s*:/i);
    if (blankHeaderMatch) {
      currentBlankKey = blankHeaderMatch[1];
      if (!blankMap[currentBlankKey]) blankMap[currentBlankKey] = { answers: [], score: 1 };
      continue;
    }

    const answerMatch = line.match(/^Đáp\s+án\s*:\s*(.+)/i);
    if (answerMatch && currentBlankKey) {
      blankMap[currentBlankKey].answers = parsePipeAnswers(answerMatch[1]);
      continue;
    }

    const scoreMatch = line.match(/^Điểm\s*:\s*(\d+(?:\.\d+)?)/i);
    if (scoreMatch && currentBlankKey) {
      const s = parseFloat(scoreMatch[1]);
      if (!isNaN(s) && s > 0) blankMap[currentBlankKey].score = s;
      continue;
    }

    const explMatch = line.match(/^Giải\s+thích\s*:\s*(.*)/i);
    if (explMatch) {
      explanation = explMatch[1].trim() || null;
      currentBlankKey = null;
      continue;
    }
  }

  const blanks: { id: string; answers: string[]; score: number }[] = [];
  for (const key of blankKeys) {
    const blankData = blankMap[key];
    if (!blankData || blankData.answers.length === 0) {
      return { error: { row: questionNum, message: `Câu ${questionNum}: ô trống {${key}} thiếu đáp án` } };
    }
    blanks.push({ id: key, answers: blankData.answers, score: blankData.score });
  }

  const totalScore = blanks.reduce((s, b) => s + b.score, 0);
  const correctAnswer = blanks.map(b => `{${b.id}}: ${b.answers[0]}`).join("; ");

  return {
    question: {
      type: "fill_blank",
      title: null,
      content,
      options: blanks,
      correctAnswer,
      score: String(totalScore),
      difficulty: null,
      explanation,
    },
  };
}

function parseExcelFile(file: File, questionType: string): Promise<{ questions: ParsedQuestion[]; errors: ParseError[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<(string | number | undefined)[]>(sheet, { header: 1, defval: "" });

        if (rows.length < 2) {
          return resolve({ questions: [], errors: [{ row: 0, message: "File không có dữ liệu (cần ít nhất 1 hàng dữ liệu sau hàng tiêu đề)" }] });
        }

        const questions: ParsedQuestion[] = [];
        const errors: ParseError[] = [];

        if (questionType === "fill_blank") {
          const headerRow = rows[0].map(h => String(h ?? "").toLowerCase().trim());
          const explanationColIndex = headerRow.lastIndexOf("explanation") >= 0
            ? headerRow.lastIndexOf("explanation")
            : 1 + MAX_FILL_BLANKS * 2;

          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.every(cell => !String(cell ?? "").trim())) continue;
            const result = parseFillBlankExcelRow(row, i + 1, explanationColIndex);
            if (result.question) questions.push(result.question);
            if (result.error) errors.push(result.error);
          }
        } else if (questionType === "matching") {
          const headerRow = rows[0].map(h => String(h ?? "").toLowerCase().trim());
          const colIdx = (names: string[]) => {
            for (const n of names) {
              const idx = headerRow.indexOf(n);
              if (idx >= 0) return idx;
            }
            return -1;
          };
          const iCau = colIdx(["câu_hỏi", "cau_hoi", "question"]);
          const iLT  = colIdx(["văn_bản_trái", "van_ban_trai", "left_text"]);
          const iLI  = colIdx(["hình_ảnh_trái", "hinh_anh_trai", "left_image"]);
          const iRT  = colIdx(["văn_bản_phải", "van_ban_phai", "right_text"]);
          const iRI  = colIdx(["hình_ảnh_phải", "hinh_anh_phai", "right_image"]);
          const iScore = colIdx(["điểm", "diem", "score"]);

          const get = (row: (string | number | undefined)[], i: number) =>
            i >= 0 ? String(row[i] ?? "").trim() : "";

          const grouped: Record<string, { rows: (string | number | undefined)[][]; rowNums: number[] }> = {};
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.every(cell => !String(cell ?? "").trim())) continue;
            const key = get(row, iCau);
            if (!key) { errors.push({ row: i + 1, message: `Thiếu tên câu hỏi` }); continue; }
            if (!grouped[key]) grouped[key] = { rows: [], rowNums: [] };
            grouped[key].rows.push(row);
            grouped[key].rowNums.push(i + 1);
          }

          let questionNum = 0;
          for (const [questionText, { rows: gRows, rowNums }] of Object.entries(grouped)) {
            questionNum++;
            const pairs: { id: string; left: { text: string; imageUrl: string }; right: { text: string; imageUrl: string } }[] = [];
            let scorePerPair = 1;
            let hasError = false;

            for (let k = 0; k < gRows.length; k++) {
              const r = gRows[k];
              const lt = get(r, iLT);
              const li = get(r, iLI);
              const rt = get(r, iRT);
              const ri = get(r, iRI);

              if (!lt && !li) { errors.push({ row: rowNums[k], message: `Cột trái (văn bản hoặc hình ảnh) không được trống` }); hasError = true; continue; }
              if (!rt && !ri) { errors.push({ row: rowNums[k], message: `Cột phải (văn bản hoặc hình ảnh) không được trống` }); hasError = true; continue; }

              if (k === 0 && iScore >= 0) {
                const sv = parseFloat(get(r, iScore));
                if (!isNaN(sv) && sv > 0) scorePerPair = sv;
              }

              pairs.push({
                id: `pair-${questionNum}-${k + 1}`,
                left: { text: lt, imageUrl: li },
                right: { text: rt, imageUrl: ri },
              });
            }

            if (hasError) continue;
            if (pairs.length < 2) { errors.push({ row: rowNums[0], message: `"${questionText}": cần ít nhất 2 cặp nối (hiện có ${pairs.length})` }); continue; }

            questions.push({
              type: "matching",
              title: null,
              content: questionText,
              options: pairs,
              correctAnswer: JSON.stringify({ scorePerPair, shuffleB: false }),
              score: String(pairs.length * scorePerPair),
              difficulty: null,
              explanation: null,
            });
          }
        } else if (questionType === "essay") {
          const headerRow = rows[0].map(h => String(h ?? "").toLowerCase().trim());
          const colIdx = (names: string[]) => {
            for (const n of names) { const i = headerRow.indexOf(n); if (i >= 0) return i; }
            return -1;
          };
          const iContent  = colIdx(["câu hỏi", "cau hoi", "question", "câu_hỏi", "nội dung"]);
          const iMin      = colIdx(["từ tối thiểu", "tu toi thieu", "min_words", "so tu toi thieu", "số từ tối thiểu"]);
          const iMax      = colIdx(["từ tối đa", "tu toi da", "max_words", "so tu toi da", "số từ tối đa"]);
          const iScore    = colIdx(["điểm", "diem", "score"]);

          const get = (row: (string | number | undefined)[], i: number) =>
            i >= 0 ? String(row[i] ?? "").trim() : "";

          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.every(cell => !String(cell ?? "").trim())) continue;
            const content = iContent >= 0 ? get(row, iContent) : get(row, 0);
            if (!content) { errors.push({ row: i + 1, message: "Thiếu nội dung câu hỏi" }); continue; }
            const minWords = Math.max(0, parseInt(get(row, iMin) || "50") || 50);
            const maxWords = Math.max(minWords, parseInt(get(row, iMax) || "200") || 200);
            const scoreVal = parseFloat(get(row, iScore) || "5") || 5;
            questions.push({
              type: "essay",
              title: null,
              content,
              options: [],
              correctAnswer: JSON.stringify({ minWords, maxWords }),
              score: String(scoreVal),
              difficulty: null,
              explanation: null,
            });
          }
        } else {
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.every(cell => !String(cell ?? "").trim())) continue;

            let result: { question?: ParsedQuestion; error?: ParseError };
            if (questionType === "multiple_choice") {
              result = parseMultipleChoiceRow(row, i + 1);
            } else {
              result = parseSingleChoiceRow(row, i + 1);
            }

            if (result.question) questions.push(result.question);
            if (result.error) errors.push(result.error);
          }
        }

        resolve({ questions, errors });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ─── Word (.docx) parser ──────────────────────────────────────────────────────

function parseWordText(text: string, questionType: string): { questions: ParsedQuestion[]; errors: ParseError[] } {
  const questions: ParsedQuestion[] = [];
  const errors: ParseError[] = [];

  const blocks = text.split(/(?=Câu\s+\d+\s*:)/i).map(b => b.trim()).filter(Boolean);

  if (questionType === "fill_blank") {
    blocks.forEach((block, blockIdx) => {
      const result = parseFillBlankWordBlock(block, blockIdx + 1);
      if (result.question) questions.push(result.question);
      if (result.error) errors.push(result.error);
    });
    return { questions, errors };
  }

  if (questionType === "matching") {
    blocks.forEach((block, blockIdx) => {
      const questionNum = blockIdx + 1;
      const lines = block.split("\n").map(l => l.trim()).filter(l => l.length > 0);
      if (!lines.length) return;

      const firstLine = lines[0];
      const contentMatch = firstLine.match(/^Câu\s+\d+\s*:\s*(.+)/i);
      if (!contentMatch) {
        errors.push({ row: questionNum, message: `Không đọc được tiêu đề câu hỏi` });
        return;
      }
      const questionText = contentMatch[1].trim();

      const leftItems: { text: string; imageUrl: string }[] = [];
      const rightItems: { text: string; imageUrl: string }[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const leftMatch = line.match(/^(\d+)\.\s*(.+)/);
        if (leftMatch) {
          const raw = leftMatch[2].trim();
          const parts = raw.split("|").map(p => p.trim());
          const text = parts.filter(p => !p.startsWith("http")).join(" ").trim();
          const imageUrl = parts.find(p => p.startsWith("http")) ?? "";
          leftItems.push({ text, imageUrl });
          continue;
        }
        const rightMatch = line.match(/^([A-Z])\.\s*(.+)/i);
        if (rightMatch) {
          const raw = rightMatch[2].trim();
          const parts = raw.split("|").map(p => p.trim());
          const text = parts.filter(p => !p.startsWith("http")).join(" ").trim();
          const imageUrl = parts.find(p => p.startsWith("http")) ?? "";
          rightItems.push({ text, imageUrl });
          continue;
        }
      }

      if (leftItems.length < 2 || rightItems.length < 2) {
        errors.push({ row: questionNum, message: `Cần ít nhất 2 cặp nối (dùng số 1,2... cho cột trái và chữ A,B... cho cột phải)` });
        return;
      }
      if (leftItems.length !== rightItems.length) {
        errors.push({ row: questionNum, message: `Số cặp trái (${leftItems.length}) và phải (${rightItems.length}) không khớp` });
        return;
      }

      const pairs = leftItems.map((l, k) => ({
        id: `pair-${questionNum}-${k + 1}`,
        left: l,
        right: rightItems[k],
      }));

      questions.push({
        type: "matching",
        title: null,
        content: questionText,
        options: pairs,
        correctAnswer: JSON.stringify({ scorePerPair: 1, shuffleB: false }),
        score: String(pairs.length),
        difficulty: null,
        explanation: null,
      });
    });
    return { questions, errors };
  }

  const isMultiple = questionType === "multiple_choice";

  blocks.forEach((block, blockIdx) => {
    const questionNum = blockIdx + 1;
    const lines = block.split("\n").map(l => l.trim()).filter(l => l.length > 0);

    if (!lines.length) return;

    const firstLine = lines[0];
    const contentMatch = firstLine.match(/^Câu\s+\d+\s*:\s*(.+)/i);
    if (!contentMatch) {
      errors.push({ row: questionNum, message: `Không đọc được nội dung câu hỏi ${questionNum}` });
      return;
    }
    const content = contentMatch[1].trim();

    const builtOptions: { id: string; text: string }[] = [];
    let correctAnswerRaw = "";
    let score = "1";
    let explanation: string | null = null;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      const optMatch = line.match(/^([A-H])\.\s*(.+)/i);
      if (optMatch) {
        builtOptions.push({ id: optMatch[1].toUpperCase(), text: optMatch[2].trim() });
        continue;
      }

      const answerMatch = line.match(/^Đáp\s+án\s*:\s*([A-H][,;\s A-H]*)/i);
      if (answerMatch) {
        correctAnswerRaw = answerMatch[1].trim();
        continue;
      }

      const scoreMatch = line.match(/^Điểm\s*:\s*(\d+(?:\.\d+)?)/i);
      if (scoreMatch) {
        const s = parseFloat(scoreMatch[1]);
        if (!isNaN(s) && s > 0) score = String(s);
        continue;
      }

      const explMatch = line.match(/^Giải\s+thích\s*:\s*(.*)/i);
      if (explMatch) {
        explanation = explMatch[1].trim() || null;
        continue;
      }
    }

    if (!content) {
      errors.push({ row: questionNum, message: `Câu ${questionNum}: thiếu nội dung` });
      return;
    }
    if (builtOptions.length < 2) {
      errors.push({ row: questionNum, message: `Câu ${questionNum}: cần ít nhất 2 đáp án (A, B)` });
      return;
    }
    if (!correctAnswerRaw) {
      errors.push({ row: questionNum, message: `Câu ${questionNum}: thiếu đáp án đúng` });
      return;
    }

    if (isMultiple) {
      const correctList = normalizeAnswerList(correctAnswerRaw);
      if (correctList.length === 0) {
        errors.push({ row: questionNum, message: `Câu ${questionNum}: đáp án đúng "${correctAnswerRaw}" không hợp lệ` });
        return;
      }
      const invalidAnswers = correctList.filter(id => !builtOptions.find(o => o.id === id));
      if (invalidAnswers.length > 0) {
        errors.push({ row: questionNum, message: `Câu ${questionNum}: đáp án "${invalidAnswers.join(",")}" không khớp` });
        return;
      }
      questions.push({
        type: "multiple_choice",
        title: null,
        content,
        options: builtOptions,
        correctAnswer: correctList.sort().join(","),
        score,
        difficulty: null,
        explanation,
      });
    } else {
      const singleAnswer = correctAnswerRaw.toUpperCase().trim();
      if (!builtOptions.find(o => o.id === singleAnswer)) {
        errors.push({ row: questionNum, message: `Câu ${questionNum}: đáp án đúng "${singleAnswer}" không khớp` });
        return;
      }
      questions.push({
        type: "single_choice",
        title: null,
        content,
        options: builtOptions,
        correctAnswer: singleAnswer,
        score,
        difficulty: null,
        explanation,
      });
    }
  });

  return { questions, errors };
}

async function parseWordFile(file: File, questionType: string): Promise<{ questions: ParsedQuestion[]; errors: ParseError[] }> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return parseWordText(result.value, questionType);
}

// ─── Main parse dispatcher ────────────────────────────────────────────────────

async function parseFile(file: File, questionType: string): Promise<{ questions: ParsedQuestion[]; errors: ParseError[] }> {
  const isWord = /\.(docx?)$/i.test(file.name);
  if (isWord) {
    return parseWordFile(file, questionType);
  }
  return parseExcelFile(file, questionType);
}

// ─── Sample file generators – single choice ───────────────────────────────────

function downloadExcelSample() {
  const headers = ["Tiêu đề", "Nội dung câu hỏi", "Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D", "Đáp án đúng", "Điểm", "Độ khó", "Giải thích"];
  const example = ["Câu hỏi 1", "Thủ đô của Việt Nam là?", "Hà Nội", "Hồ Chí Minh", "Đà Nẵng", "Huế", "A", 1, "easy", "Hà Nội là thủ đô của Việt Nam"];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Câu hỏi");
  XLSX.writeFile(wb, "mau_cau_hoi_trac_nghiem.csv");
}

async function downloadWordSample() {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: "Câu 1: Thủ đô của Việt Nam là?", bold: true })], spacing: { after: 120 } }),
          new Paragraph({ children: [new TextRun("A. Hà Nội")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("B. Hồ Chí Minh")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("C. Đà Nẵng")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("D. Huế")], spacing: { after: 120 } }),
          new Paragraph({ children: [new TextRun("Đáp án: A")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Điểm: 1")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Giải thích: Hà Nội là thủ đô của Việt Nam")], spacing: { after: 240 } }),

          new Paragraph({ children: [new TextRun({ text: "Câu 2: She ___ to school every day", bold: true })], spacing: { after: 120 } }),
          new Paragraph({ children: [new TextRun("A. go")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("B. goes")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("C. going")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("D. gone")], spacing: { after: 120 } }),
          new Paragraph({ children: [new TextRun("Đáp án: B")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Điểm: 2")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Giải thích: ")], spacing: { after: 240 } }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "mau_cau_hoi_trac_nghiem.docx";
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Sample file generators – multiple choice ─────────────────────────────────

function downloadExcelSampleMultipleChoice() {
  const headers = ["Tiêu đề", "Nội dung câu hỏi", "Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D", "Đáp án đúng (nhiều, vd: A,B)", "Điểm", "Độ khó", "Giải thích"];
  const examples = [
    ["Câu 1", "Những thành phố nào là thủ đô của các nước ASEAN?", "Bangkok", "Hà Nội", "Tokyo", "Jakarta", "A,B,D", 2, "medium", "Bangkok (Thái Lan), Hà Nội (VN), Jakarta (Indonesia)"],
    ["", "Các ngôn ngữ lập trình nào thuộc nhóm hướng đối tượng?", "Java", "C", "Python", "Assembly", "A,C", 1, "easy", "Java và Python là ngôn ngữ hướng đối tượng"],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Câu hỏi");
  XLSX.writeFile(wb, "mau_cau_hoi_nhieu_lua_chon.csv");
}

async function downloadWordSampleMultipleChoice() {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: "Câu 1: Những thành phố nào là thủ đô của các nước ASEAN?", bold: true })], spacing: { after: 120 } }),
          new Paragraph({ children: [new TextRun("A. Bangkok")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("B. Hà Nội")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("C. Tokyo")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("D. Jakarta")], spacing: { after: 120 } }),
          new Paragraph({ children: [new TextRun("Đáp án: A,B,D")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Điểm: 2")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Giải thích: Bangkok (Thái Lan), Hà Nội (Việt Nam), Jakarta (Indonesia)")], spacing: { after: 240 } }),

          new Paragraph({ children: [new TextRun({ text: "Câu 2: Các ngôn ngữ lập trình nào thuộc nhóm hướng đối tượng?", bold: true })], spacing: { after: 120 } }),
          new Paragraph({ children: [new TextRun("A. Java")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("B. C")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("C. Python")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("D. Assembly")], spacing: { after: 120 } }),
          new Paragraph({ children: [new TextRun("Đáp án: A,C")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Điểm: 1")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Giải thích: Java và Python là ngôn ngữ lập trình hướng đối tượng")], spacing: { after: 240 } }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "mau_cau_hoi_nhieu_lua_chon.docx";
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Sample file generators – fill blank ─────────────────────────────────────

function downloadExcelSampleFillBlank() {
  const headers = [
    "question",
    "blank_1_answers", "blank_1_score",
    "blank_2_answers", "blank_2_score",
    "explanation",
  ];
  const examples = [
    [
      "Hà Nội là thủ đô của {1} và có dân số {2}",
      "Việt Nam|Vietnam", 1,
      "8 triệu|8000000", 2,
      "Thông tin cơ bản về Hà Nội",
    ],
    [
      "Việt Nam có thủ đô là {1}",
      "Hà Nội|Ha Noi", 1,
      "", "",
      "Câu đơn 1 ô trống",
    ],
    [
      "2 + 2 = {1}",
      "4|four", 1,
      "", "",
      "Toán cơ bản",
    ],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Câu hỏi");
  XLSX.writeFile(wb, "mau_cau_hoi_dien_cho_trong.csv");
}

async function downloadWordSampleFillBlank() {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: "Câu 1: Hà Nội là thủ đô của {1} và có dân số {2}", bold: true })], spacing: { after: 100 } }),
          new Paragraph({ children: [new TextRun("Ô 1:")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Đáp án: Việt Nam | Vietnam")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Điểm: 1")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Ô 2:")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Đáp án: 8 triệu | 8000000")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Điểm: 2")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Giải thích: Thông tin cơ bản về Hà Nội")], spacing: { after: 240 } }),

          new Paragraph({ children: [new TextRun({ text: "Câu 2: Việt Nam có thủ đô là {1}", bold: true })], spacing: { after: 100 } }),
          new Paragraph({ children: [new TextRun("Ô 1:")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Đáp án: Hà Nội | Ha Noi")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Điểm: 1")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Giải thích: ")], spacing: { after: 240 } }),

          new Paragraph({ children: [new TextRun({ text: "Câu 3: 2 + 2 = {1}", bold: true })], spacing: { after: 100 } }),
          new Paragraph({ children: [new TextRun("Ô 1:")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Đáp án: 4 | four")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Điểm: 1")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Giải thích: ")], spacing: { after: 240 } }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "mau_cau_hoi_dien_cho_trong.docx";
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Sample file generators – matching ────────────────────────────────────────

function downloadExcelSampleMatching() {
  const headers = ["câu_hỏi", "văn_bản_trái", "hình_ảnh_trái", "văn_bản_phải", "hình_ảnh_phải", "điểm"];
  const examples = [
    ["Nối đúng con vật với nghĩa", "Dog", "https://res.cloudinary.com/demo/image/upload/sample.jpg", "Con chó", "", 1],
    ["Nối đúng con vật với nghĩa", "Cat", "https://res.cloudinary.com/demo/image/upload/sample.jpg", "Con mèo", "", ""],
    ["Nối đúng hình với từ", "", "https://res.cloudinary.com/demo/image/upload/sample.jpg", "Apple", "", 1],
    ["Nối đúng hình với từ", "", "https://res.cloudinary.com/demo/image/upload/sample.jpg", "Banana", "", ""],
    ["Nối đúng quốc kỳ", "Việt Nam", "https://res.cloudinary.com/demo/image/upload/sample.jpg", "", "https://res.cloudinary.com/demo/image/upload/sample.jpg", 2],
    ["Nối đúng quốc kỳ", "Nhật Bản", "https://res.cloudinary.com/demo/image/upload/sample.jpg", "", "https://res.cloudinary.com/demo/image/upload/sample.jpg", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Câu hỏi nối");
  XLSX.writeFile(wb, "mau_cau_hoi_noi.csv");
}

async function downloadWordSampleMatching() {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: "Câu 1: Nối đúng con vật với nghĩa", bold: true })], spacing: { after: 120 } }),
          new Paragraph({ children: [new TextRun("")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("1. Dog | https://res.cloudinary.com/demo/image/upload/sample.jpg")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("A. Con chó")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("2. Cat | https://res.cloudinary.com/demo/image/upload/sample.jpg")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("B. Con mèo")], spacing: { after: 240 } }),

          new Paragraph({ children: [new TextRun({ text: "Câu 2: Nối hình với từ", bold: true })], spacing: { after: 120 } }),
          new Paragraph({ children: [new TextRun("")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("1. https://res.cloudinary.com/demo/image/upload/sample.jpg")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("A. Apple")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("2. https://res.cloudinary.com/demo/image/upload/sample.jpg")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("B. Banana")], spacing: { after: 240 } }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "mau_cau_hoi_noi.docx";
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Sample file generators – essay ───────────────────────────────────────────

function downloadExcelSampleEssay() {
  const headers = ["Câu hỏi", "Từ tối thiểu", "Từ tối đa", "Điểm"];
  const examples = [
    ["Hãy mô tả về thành phố bạn yêu thích", 50, 200, 5],
    ["Viết đoạn văn về gia đình bạn", 30, 150, 4],
    ["Describe your favorite teacher", 40, 180, 5],
    ["Viết về một ngày đáng nhớ của bạn", 60, 250, 6],
    ["What is your dream job and why?", 50, 200, 5],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Câu hỏi tự luận");
  XLSX.writeFile(wb, "mau_cau_hoi_tu_luan.xlsx");
}

async function downloadWordSampleEssay() {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: "Câu 1: Hãy mô tả về thành phố bạn yêu thích", bold: true })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Số từ tối thiểu: 50")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Số từ tối đa: 200")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Điểm: 5")], spacing: { after: 240 } }),

          new Paragraph({ children: [new TextRun({ text: "Câu 2: Viết đoạn văn về gia đình bạn", bold: true })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Số từ tối thiểu: 30")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Số từ tối đa: 150")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Điểm: 4")], spacing: { after: 240 } }),

          new Paragraph({ children: [new TextRun({ text: "Câu 3: Describe your favorite teacher", bold: true })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Số từ tối thiểu: 40")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Số từ tối đa: 180")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Điểm: 5")], spacing: { after: 240 } }),

          new Paragraph({ children: [new TextRun({ text: "Câu 4: Viết về một ngày đáng nhớ của bạn", bold: true })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Số từ tối thiểu: 60")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Số từ tối đa: 250")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Điểm: 6")], spacing: { after: 240 } }),

          new Paragraph({ children: [new TextRun({ text: "Câu 5: What is your dream job and why?", bold: true })], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Số từ tối thiểu: 50")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Số từ tối đa: 200")], spacing: { after: 60 } }),
          new Paragraph({ children: [new TextRun("Điểm: 5")], spacing: { after: 240 } }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "mau_cau_hoi_tu_luan.docx";
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Shared sample section component ─────────────────────────────────────────

interface SampleSectionProps {
  questionType: string;
}

function SampleSection({ questionType }: SampleSectionProps) {
  const isSingle = questionType === "single_choice";
  const isMultiple = questionType === "multiple_choice";
  const isFillBlank = questionType === "fill_blank";
  const isMatching = questionType === "matching";
  const isEssay = questionType === "essay";

  if (!isSingle && !isMultiple && !isFillBlank && !isMatching && !isEssay) return null;

  const excelOnClick = isFillBlank
    ? downloadExcelSampleFillBlank
    : isMatching
    ? downloadExcelSampleMatching
    : isEssay
    ? downloadExcelSampleEssay
    : isSingle
    ? downloadExcelSample
    : downloadExcelSampleMultipleChoice;

  const wordOnClick = isFillBlank
    ? downloadWordSampleFillBlank
    : isMatching
    ? downloadWordSampleMatching
    : isEssay
    ? downloadWordSampleEssay
    : isSingle
    ? downloadWordSample
    : downloadWordSampleMultipleChoice;

  const excelDesc = isFillBlank
    ? `Mỗi câu hỏi 1 hàng. Cột "question" chứa nội dung có {1}, {2}. Cột "blank_N_answers" ghi nhiều đáp án cách nhau bằng "|". Cột "blank_N_score" là điểm.`
    : isMatching
    ? `Mỗi dòng = 1 cặp nối. Cột "câu_hỏi" là tên câu hỏi. Cột trái/phải có thể dùng text, URL ảnh, hoặc cả hai. Cột "điểm" là điểm/cặp (chỉ cần điền ở dòng đầu tiên của mỗi câu).`
    : isEssay
    ? `Mỗi câu hỏi 1 hàng. Cột "Câu hỏi" là nội dung câu hỏi, "Từ tối thiểu" và "Từ tối đa" giới hạn số từ, cột "Điểm" là điểm số.`
    : isSingle
    ? "Mỗi câu hỏi 1 hàng. Các cột: Tiêu đề, Nội dung, A, B, C, D, Đáp án đúng, Điểm, Độ khó, Giải thích."
    : "Mỗi câu hỏi 1 hàng. Cột Đáp án đúng ghi nhiều đáp án cách nhau bằng dấu phẩy, vd: A,B hoặc A,C,D.";

  const wordDesc = isFillBlank
    ? `Mỗi câu bắt đầu bằng "Câu N: nội dung". Mỗi ô trống dùng "Ô N:", "Đáp án: X | Y" (nhiều đáp án cách bằng |), "Điểm: N". Kết thúc bằng "Giải thích:".`
    : isMatching
    ? `"Câu X:" bắt buộc. 1,2,3... là cột trái; A,B,C... là cột phải. Dùng "|" để phân cách text và image URL. Có thể chỉ có image hoặc chỉ text.`
    : isEssay
    ? `Mỗi câu bắt đầu bằng "Câu N: nội dung câu hỏi". Tiếp theo ghi "Số từ tối thiểu: N", "Số từ tối đa: N", "Điểm: N".`
    : isSingle
    ? `Mỗi câu bắt đầu bằng "Câu N:". Đáp án A. B. C. D., ghi "Đáp án:", "Điểm:", "Giải thích:".`
    : `Mỗi câu bắt đầu bằng "Câu N:". Ghi "Đáp án: A,B" (nhiều đáp án cách bởi dấu phẩy), "Điểm:", "Giải thích:".`;

  const excelColumns = isFillBlank
    ? ["question (*)", "blank_1_answers (*)", "blank_1_score", "blank_2_answers", "blank_2_score", "explanation"]
    : isMatching
    ? ["câu_hỏi (*)", "văn_bản_trái", "hình_ảnh_trái", "văn_bản_phải", "hình_ảnh_phải", "điểm"]
    : isEssay
    ? ["Câu hỏi (*)", "Từ tối thiểu", "Từ tối đa", "Điểm"]
    : isSingle
    ? ["Tiêu đề", "Nội dung (*)", "Đáp án A (*)", "Đáp án B (*)", "Đáp án C", "Đáp án D", "Đáp án đúng (*)", "Điểm", "Độ khó", "Giải thích"]
    : ["Tiêu đề", "Nội dung (*)", "Đáp án A (*)", "Đáp án B (*)", "Đáp án C", "Đáp án D", "Đáp án đúng (*) vd: A,B", "Điểm", "Độ khó", "Giải thích"];

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tải về file mẫu</p>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border bg-background p-3 space-y-2">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-green-600 shrink-0" />
            <div>
              <p className="text-xs font-semibold">Excel / CSV</p>
              <p className="text-xs text-muted-foreground">.xlsx, .csv</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{excelDesc}</p>
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 text-green-700 border-green-200 hover:bg-green-50 text-xs"
            onClick={excelOnClick}
            data-testid="btn-download-excel-sample"
          >
            <Download className="w-3.5 h-3.5" />
            {isEssay ? "Tải file Excel mẫu" : "Tải file CSV mẫu"}
          </Button>
        </div>

        <div className="rounded-md border bg-background p-3 space-y-2">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600 shrink-0" />
            <div>
              <p className="text-xs font-semibold">Word</p>
              <p className="text-xs text-muted-foreground">.docx</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{wordDesc}</p>
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50 text-xs"
            onClick={wordOnClick}
            data-testid="btn-download-word-sample"
          >
            <Download className="w-3.5 h-3.5" />
            Tải file Word mẫu
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          {isFillBlank ? "Cấu trúc cột Excel (dấu * là bắt buộc):" : "Cột Excel (dấu * là bắt buộc):"}
        </p>
        <div className="flex flex-wrap gap-1">
          {excelColumns.map((col, i) => (
            <span key={i} className={cn(
              "inline-block px-1.5 py-0.5 rounded text-xs border",
              col.includes("*") ? "bg-primary/10 border-primary/20 text-primary font-medium" : "bg-background border-border text-muted-foreground"
            )}>
              {col}
            </span>
          ))}
        </div>
        {isFillBlank && (
          <p className="text-xs text-muted-foreground mt-1">
            Nhiều đáp án chấp nhận dùng <code className="bg-muted px-1 rounded font-mono">|</code> (pipe). Ví dụ: <code className="bg-muted px-1 rounded font-mono">Việt Nam|Vietnam</code>
          </p>
        )}
        {isMatching && (
          <p className="text-xs text-muted-foreground mt-1">
            Mỗi dòng là 1 cặp nối. <code className="bg-muted px-1 rounded font-mono">văn_bản_trái</code> / <code className="bg-muted px-1 rounded font-mono">văn_bản_phải</code> là text, <code className="bg-muted px-1 rounded font-mono">hình_ảnh_trái</code> / <code className="bg-muted px-1 rounded font-mono">hình_ảnh_phải</code> là URL ảnh. Cột <code className="bg-muted px-1 rounded font-mono">điểm</code> là điểm/cặp, chỉ cần điền ở dòng đầu tiên.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ImportQuestionsDialogProps {
  open: boolean;
  onClose: () => void;
  onQuestionsImported?: (questionIds: string[]) => void;
}

export function ImportQuestionsDialog({ open, onClose, onQuestionsImported }: ImportQuestionsDialogProps) {
  const { toast } = useToast();
  const [questionType, setQuestionType] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [parsedCount, setParsedCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMutation = useMutation({
    mutationFn: async (questions: ParsedQuestion[]) => {
      const res = await apiRequest("POST", "/api/questions/bulk", questions);
      return res.json() as Promise<{ imported: number; questions: { id: string }[] }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      toast({ title: `Nhập thành công ${data.imported} câu hỏi` });
      if (onQuestionsImported && data.questions?.length) {
        onQuestionsImported(data.questions.map(q => q.id));
      }
      handleClose();
    },
    onError: () => {
      toast({ title: "Lỗi khi nhập câu hỏi vào hệ thống", variant: "destructive" });
    },
  });

  function handleClose() {
    setQuestionType("");
    setSelectedFile(null);
    setIsDragOver(false);
    setParseErrors([]);
    setParsedCount(null);
    onClose();
  }

  async function runParse(file: File, type: string) {
    setIsParsing(true);
    try {
      const result = await parseFile(file, type);
      setParseErrors(result.errors);
      setParsedCount(result.questions.length);
    } catch {
      toast({ title: "Không thể đọc file. Vui lòng kiểm tra định dạng.", variant: "destructive" });
    } finally {
      setIsParsing(false);
    }
  }

  async function handleFileSelect(file: File) {
    if (!/\.(xlsx|xls|csv|docx?)$/i.test(file.name)) {
      toast({ title: "Chỉ hỗ trợ .xlsx, .xls, .csv, .doc, .docx", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
    setParseErrors([]);
    setParsedCount(null);
    if (questionType) await runParse(file, questionType);
  }

  async function handleTypeChange(type: string) {
    setQuestionType(type);
    setParseErrors([]);
    setParsedCount(null);
    if (selectedFile) await runParse(selectedFile, type);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }

  function handleRemoveFile() {
    setSelectedFile(null);
    setParseErrors([]);
    setParsedCount(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleImport() {
    if (!selectedFile || !questionType) return;
    setIsParsing(true);
    try {
      const result = await parseFile(selectedFile, questionType);
      if (result.questions.length === 0) {
        toast({ title: "Không có câu hỏi hợp lệ để nhập", variant: "destructive" });
        setParseErrors(result.errors);
        setParsedCount(0);
        return;
      }
      setParseErrors(result.errors);
      setParsedCount(result.questions.length);
      importMutation.mutate(result.questions);
    } catch {
      toast({ title: "Lỗi đọc file", variant: "destructive" });
    } finally {
      setIsParsing(false);
    }
  }

  const isLoading = isParsing || importMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Tải lên câu hỏi</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Question type */}
          <div className="space-y-1.5">
            <Label htmlFor="import-question-type" className="text-sm font-medium">
              Chọn loại câu hỏi <span className="text-destructive">*</span>
            </Label>
            <Select value={questionType} onValueChange={handleTypeChange}>
              <SelectTrigger id="import-question-type" data-testid="select-import-question-type">
                <SelectValue placeholder="-- Chọn loại câu hỏi --" />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_TYPES.map(qt => (
                  <SelectItem key={qt.value} value={qt.value} disabled={qt.disabled} data-testid={`option-import-type-${qt.value}`}>
                    <span className={cn(qt.disabled && "text-muted-foreground")}>
                      {qt.label}{qt.disabled && " (sắp ra mắt)"}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sample file download section */}
          <SampleSection questionType={questionType} />

          {/* File upload */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Chọn file import <span className="text-destructive">*</span>
            </Label>

            {selectedFile ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
                  {/\.(docx?)$/i.test(selectedFile.name)
                    ? <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                    : <FileSpreadsheet className="w-5 h-5 text-green-600 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                      {isParsing && " · Đang đọc file..."}
                      {!isParsing && parsedCount !== null && (
                        <span className={cn("ml-1 font-medium", parsedCount > 0 ? "text-green-600" : "text-destructive")}>
                          · {parsedCount} câu hỏi hợp lệ
                        </span>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={handleRemoveFile}
                    data-testid="btn-remove-file"
                    disabled={isLoading}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                {/* Parse result */}
                {!isParsing && parsedCount !== null && (
                  <div className={cn(
                    "rounded-lg border p-3 space-y-1.5",
                    parseErrors.length === 0
                      ? "border-green-200 bg-green-50 dark:bg-green-950/20"
                      : parsedCount > 0
                        ? "border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20"
                        : "border-destructive/20 bg-destructive/5"
                  )}>
                    {parsedCount > 0 && (
                      <div className="flex items-center gap-1.5 text-green-700 dark:text-green-400">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-xs font-medium">{parsedCount} câu hỏi sẵn sàng để nhập</span>
                      </div>
                    )}
                    {parseErrors.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-yellow-700 dark:text-yellow-400">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span className="text-xs font-medium">{parseErrors.length} mục bị lỗi (sẽ bỏ qua)</span>
                        </div>
                        <div className="max-h-24 overflow-y-auto space-y-0.5">
                          {parseErrors.slice(0, 5).map((err, i) => (
                            <p key={i} className="text-xs text-muted-foreground pl-5">
                              Câu {err.row}: {err.message}
                            </p>
                          ))}
                          {parseErrors.length > 5 && (
                            <p className="text-xs text-muted-foreground pl-5">... và {parseErrors.length - 5} lỗi khác</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                data-testid="drop-zone-import"
                className={cn(
                  "flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors",
                  isDragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/30"
                )}
              >
                <Upload className={cn("w-8 h-8", isDragOver ? "text-primary" : "text-muted-foreground")} />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    Kéo thả file vào đây hoặc{" "}
                    <span className="text-primary underline underline-offset-2">chọn file</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Hỗ trợ: .xlsx, .xls, .csv, .docx</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.doc,.docx"
                  className="hidden"
                  onChange={handleInputChange}
                  data-testid="input-import-file"
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={handleClose} disabled={isLoading} data-testid="btn-cancel-import">
              Hủy
            </Button>
            <Button
              disabled={!questionType || !selectedFile || isLoading || parsedCount === 0}
              onClick={handleImport}
              data-testid="btn-confirm-import"
              className="gap-2"
            >
              {importMutation.isPending ? (
                "Đang nhập..."
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Tải lên {parsedCount !== null && parsedCount > 0 ? `(${parsedCount} câu)` : ""}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
