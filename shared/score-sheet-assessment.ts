import { z } from "zod";
import { scoreConversionTemplateSchema } from "./score-conversion";
import {
  scoreSheetScoringPolicySchema,
  scoreSheetTemplateSchema,
} from "./score-sheet-template";

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

export const scoreSheetAssessmentInputSchema = scoreSheetAssessmentInputFieldsSchema;

export const scoreSheetAssessmentSchema = scoreSheetAssessmentInputFieldsSchema.extend({
  id: z.string().uuid(),
  // Non-null values are retained for older assessments created with a fixed deadline.
  scoreDeadlineAt: localDateTimeSchema.nullable().default(null),
  attemptCount: z.number().int().min(1).max(100),
  scoringPolicy: scoreSheetAssessmentScoringPolicySchema,
  templateSnapshot: scoreSheetTemplateSchema,
  conversionTemplateSnapshot: scoreConversionTemplateSchema.nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ScoreSheetAssessmentInput = z.infer<typeof scoreSheetAssessmentInputSchema>;
export type ScoreSheetAssessment = z.infer<typeof scoreSheetAssessmentSchema>;

export function resolveScoreSheetAssessmentDeadlineAt(
  assessment: {
    scoreDeadlineAt?: string | null;
    templateSnapshot: { scoreDeadlineOffsetMinutes: number };
  },
  sessionDate: string | Date | null | undefined,
  sessionStartTime: string | null | undefined,
): string | null {
  if (assessment.scoreDeadlineAt) return assessment.scoreDeadlineAt;

  const offsetMinutes = assessment.templateSnapshot.scoreDeadlineOffsetMinutes;
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