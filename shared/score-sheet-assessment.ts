import { z } from "zod";
import { scoreSheetTemplateSchema } from "./score-sheet-template";

export const scoreSheetAssessmentScoringPolicySchema = z.enum(["highest", "latest"]);

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

const scoreSheetAssessmentFieldsSchema = z.object({
  code: z.string().trim().min(1, "Nhập mã bảng điểm.").max(40),
  name: z.string().trim().min(1, "Nhập tên bảng điểm.").max(120),
  scoreSheetTemplateId: z.string().uuid("Chọn bảng điểm mẫu áp dụng."),
  scoreDeadlineAt: localDateTimeSchema,
  attemptCount: z.number().int().min(1, "Số lần chấm bài phải từ 1 trở lên."),
  scoringPolicy: scoreSheetAssessmentScoringPolicySchema,
});

export const scoreSheetAssessmentInputSchema = scoreSheetAssessmentFieldsSchema;

export const scoreSheetAssessmentSchema = scoreSheetAssessmentFieldsSchema.extend({
  id: z.string().uuid(),
  templateSnapshot: scoreSheetTemplateSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ScoreSheetAssessmentInput = z.infer<typeof scoreSheetAssessmentInputSchema>;
export type ScoreSheetAssessment = z.infer<typeof scoreSheetAssessmentSchema>;