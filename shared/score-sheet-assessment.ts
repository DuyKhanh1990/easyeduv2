import { z } from "zod";
import { scoreConversionTemplateSchema } from "./score-conversion";
import {
  scoreSheetScoringPolicySchema,
  scoreSheetTemplateSchema,
} from "./score-sheet-template";
import { scoreSheetAssessmentAttemptValuesSchema } from "./score-sheet-assessment-scoring";

export const scoreSheetAssessmentScoringPolicySchema = scoreSheetScoringPolicySchema;

const localDateTimeSchema = z.string().refine((value) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return false;
  const [, year, month, day, hour, minute] = match.map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
    && parsed.getUTCHours() === hour
    && parsed.getUTCMinutes() === minute;
}, "Nhập ngày và giờ hợp lệ.");

const scoreSheetAssessmentInputFieldsSchema = z.object({
  code: z.string().trim().min(1, "Nhập mã bảng điểm.").max(40),
  name: z.string().trim().min(1, "Nhập tên bảng điểm.").max(120),
  scoreSheetTemplateId: z.string().uuid("Chọn bảng điểm mẫu áp dụng."),
});

const scoreSheetAssessmentCreationFieldsSchema = z.object({
  creationMode: z.enum(["session", "manual"]).default("session"),
  manualSelectionMode: z.enum(["class", "students"]).nullable().default(null),
  manualClassId: z.string().uuid().nullable().default(null),
  manualStudentIds: z.array(z.string().uuid()).max(500).default([]),
});

const manualScoreSheetValidation = (
  value: {
    creationMode: "session" | "manual";
    manualSelectionMode: "class" | "students" | null;
    manualClassId: string | null;
    manualStudentIds: string[];
    initialScoresByStudent?: Record<string, unknown>;
  },
  context: z.RefinementCtx,
) => {
  if (value.creationMode !== "manual") return;
  if (!value.manualSelectionMode || value.manualStudentIds.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Chọn ít nhất một học viên để tạo bảng điểm thủ công.",
      path: ["manualStudentIds"],
    });
  }
  if (new Set(value.manualStudentIds).size !== value.manualStudentIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Học viên bị trùng trong bảng điểm.",
      path: ["manualStudentIds"],
    });
  }
  if (value.manualSelectionMode === "class" && !value.manualClassId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Chọn lớp trước khi tạo bảng điểm.",
      path: ["manualClassId"],
    });
  }
  if (value.manualSelectionMode === "students" && value.manualClassId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Không chọn lớp khi nhập học viên riêng lẻ.",
      path: ["manualClassId"],
    });
  }
  const selectedIds = new Set(value.manualStudentIds);
  if (
    value.initialScoresByStudent
    && Object.keys(value.initialScoresByStudent).some((studentId) => !selectedIds.has(studentId))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Có điểm thuộc học viên không nằm trong danh sách đã chọn.",
      path: ["initialScoresByStudent"],
    });
  }
};

export const scoreSheetAssessmentInputSchema = scoreSheetAssessmentInputFieldsSchema
  .merge(scoreSheetAssessmentCreationFieldsSchema)
  .extend({
    initialScoresByStudent: z.record(
      z.string().uuid(),
      scoreSheetAssessmentAttemptValuesSchema,
    ).default({}),
  })
  .superRefine(manualScoreSheetValidation);

export const scoreSheetAssessmentSchema = scoreSheetAssessmentInputFieldsSchema
  .merge(scoreSheetAssessmentCreationFieldsSchema)
  .extend({
  id: z.string().uuid(),
  // Non-null values are retained for older assessments created with a fixed deadline.
  scoreDeadlineAt: localDateTimeSchema.nullable().default(null),
  attemptCount: z.number().int().min(1).max(100),
  scoringPolicy: scoreSheetAssessmentScoringPolicySchema,
  templateSnapshot: scoreSheetTemplateSchema,
  conversionTemplateSnapshot: scoreConversionTemplateSchema.nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdByName: z.string().trim().min(1).max(120).nullable().default(null),
  })
  .superRefine(manualScoreSheetValidation);

export type ScoreSheetAssessmentInput = z.input<typeof scoreSheetAssessmentInputSchema>;
export type ParsedScoreSheetAssessmentInput = z.infer<typeof scoreSheetAssessmentInputSchema>;
export type ScoreSheetAssessment = z.infer<typeof scoreSheetAssessmentSchema>;

export function resolveScoreSheetAssessmentDeadlineAt(
  assessment: {
    scoreDeadlineAt?: string | null;
    templateSnapshot: { scoreDeadlineOffsetMinutes: number };
  },
  sessionDate: string | Date | null | undefined,
  sessionStartTime: string | null | undefined,
  currentTemplateOffsetMinutes?: number | null,
): string | null {
  // A linked live template owns relative deadlines. Fixed dates remain a
  // compatibility path for assessments whose template is no longer available.
  if (currentTemplateOffsetMinutes == null && assessment.scoreDeadlineAt) {
    return assessment.scoreDeadlineAt;
  }

  const offsetMinutes = currentTemplateOffsetMinutes
    ?? assessment.templateSnapshot.scoreDeadlineOffsetMinutes;
  if (!Number.isSafeInteger(offsetMinutes) || offsetMinutes < 0 || sessionDate == null) return null;

  const dateKey = sessionDate instanceof Date
    ? sessionDate.toISOString().slice(0, 10)
    : String(sessionDate).slice(0, 10);
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!dateMatch) return null;

  const timeMatch = /^(\d{1,2}):(\d{2})/.exec(sessionStartTime ?? "");
  const hour = timeMatch ? Number(timeMatch[1]) : 0;
  const minute = timeMatch ? Number(timeMatch[2]) : 0;
  const [, yearText, monthText, dayText] = dateMatch;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (
    hour > 23
    || minute > 59
    || new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== dateKey
  ) return null;

  const deadline = new Date(Date.UTC(year, month - 1, day, hour, minute));
  deadline.setUTCMinutes(deadline.getUTCMinutes() + offsetMinutes);
  return deadline.toISOString().slice(0, 16);
}

export function resolveManualScoreSheetAssessmentDeadlineAt(
  assessment: {
    scoreDeadlineAt?: string | null;
    templateSnapshot: { scoreDeadlineOffsetMinutes: number };
  },
  examAt: string | Date | null | undefined,
  currentTemplateOffsetMinutes?: number | null,
): string | null {
  if (examAt == null) return null;
  const parsedExamAt = examAt instanceof Date ? examAt : new Date(examAt);
  if (Number.isNaN(parsedExamAt.getTime())) return null;

  const dateParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(parsedExamAt)
      .map(({ type, value }) => [type, value]),
  ) as Record<string, string>;
  const examDate = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;

  // Manual assessments have a date but no class-session start time, so the
  // configured relative deadline starts at midnight on the exam date.
  return resolveScoreSheetAssessmentDeadlineAt(
    assessment,
    examDate,
    null,
    currentTemplateOffsetMinutes,
  );
}