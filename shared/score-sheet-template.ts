import { z } from "zod";
import { validateScoreConversionFormula } from "./score-conversion-formula";
import {
  scoreConversionGradeBandSchema,
  scoreConversionPassThresholdSchema,
} from "./score-conversion";

export const scoreSheetTemplatePartSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  rawMaxScore: z.number().finite().nonnegative(),
});

export const scoreSheetTemplatePartFormulaSchema = z.object({
  method: z.enum(["sum", "average", "custom"]).default("sum"),
  formula: z.string().trim().max(1000).default(""),
});

export const scoreSheetTemplateOverallRuleSchema = z.object({
  method: z.enum(["sum", "average", "custom"]),
  formula: z.string().trim().max(1000).default(""),
});

export const SCORE_SHEET_SKILL_COLORS = [
  "#2563EB",
  "#7C3AED",
  "#DB2777",
  "#EA580C",
  "#059669",
  "#0891B2",
  "#4F46E5",
  "#64748B",
] as const;
export const DEFAULT_SCORE_SHEET_SKILL_COLOR = SCORE_SHEET_SKILL_COLORS[0];
export const scoreSheetSkillColorSchema = z.enum(SCORE_SHEET_SKILL_COLORS);

export const scoreSheetScoringPolicySchema = z.enum(["highest", "latest"]);

export const scoreSheetTemplateSkillSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().max(120).default(""),
  sectionId: z.string().uuid().nullable().default(null),
  parts: z.array(scoreSheetTemplatePartSchema).max(100),
  partFormula: scoreSheetTemplatePartFormulaSchema.default({ method: "sum", formula: "" }),
  rawMaxScore: z.number().finite().nonnegative().optional(),
  color: scoreSheetSkillColorSchema.default(DEFAULT_SCORE_SHEET_SKILL_COLOR),
}).transform((skill) => ({
  ...skill,
  rawMaxScore: skill.rawMaxScore
    ?? skill.parts.reduce((total, part) => total + part.rawMaxScore, 0),
})).superRefine((skill, context) => {
  const partsRawMaxTotal = skill.parts.reduce((total, part) => total + part.rawMaxScore, 0);
  if (partsRawMaxTotal > skill.rawMaxScore + 1e-9) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Tổng điểm thô tối đa của các part (${partsRawMaxTotal}) không được vượt quá điểm tối đa của kỹ năng (${skill.rawMaxScore}).`,
      path: ["parts"],
    });
  }

  if (skill.parts.length === 0 || skill.partFormula.method !== "custom") return;
  const formulaError = validateScoreConversionFormula(
    skill.partFormula.formula,
    skill.parts.map((part) => part.name),
  );
  if (formulaError) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: formulaError,
      path: ["partFormula", "formula"],
    });
  }
});

const scoreSheetTemplateBaseSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  scoreConversionTemplateId: z.string().uuid().nullable(),
  skills: z.array(scoreSheetTemplateSkillSchema).max(20),
  overallRule: scoreSheetTemplateOverallRuleSchema.optional(),
  gradeBands: z.array(scoreConversionGradeBandSchema).max(20).optional(),
  passThreshold: scoreConversionPassThresholdSchema.optional(),
  scoreDeadlineOffsetMinutes: z.number().int().min(0).max((10 * 365 * 24 + 23) * 60).default(1440),
  attemptCount: z.number().int().min(1).max(100).default(1),
  scoringPolicy: scoreSheetScoringPolicySchema.default("highest"),
  evaluationCriteriaIds: z.array(z.string().uuid()).max(100).default([]),
});

function validateScoreSheetTemplate(
  template: z.infer<typeof scoreSheetTemplateBaseSchema>,
  context: z.RefinementCtx,
) {
  const sectionIds = template.skills.map((skill) => skill.sectionId).filter(Boolean);
  if (new Set(sectionIds).size !== sectionIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Mỗi kỹ năng chỉ được cấu hình một lần.",
      path: ["skills"],
    });
  }

  if (!template.scoreConversionTemplateId) {
    const normalizedNames = template.skills.map((skill) => skill.name.trim().toLocaleLowerCase());
    if (template.skills.some((skill) => !skill.name.trim())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Nhập tên cho tất cả kỹ năng tự tạo.",
        path: ["skills"],
      });
    }
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Tên các kỹ năng tự tạo phải khác nhau.",
        path: ["skills"],
      });
    }
    if (template.skills.some((skill) => skill.sectionId !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Kỹ năng tự tạo không được liên kết với section của bảng quy đổi.",
        path: ["skills"],
      });
    }
    if (template.skills.some((skill) => !skill.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Mỗi kỹ năng tự tạo phải có mã định danh.",
        path: ["skills"],
      });
    }
  }

  if (template.overallRule?.method === "custom" && template.skills.length > 0) {
    const formulaError = validateScoreConversionFormula(
      template.overallRule.formula,
      template.skills.map((skill) => skill.name),
    );
    if (formulaError) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: formulaError,
        path: ["overallRule", "formula"],
      });
    }
  }

  if (
    template.passThreshold?.enabled
    && template.passThreshold.maxScore < template.passThreshold.minScore
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Điểm đến ngưỡng Đạt phải lớn hơn hoặc bằng điểm từ.",
      path: ["passThreshold", "maxScore"],
    });
  }
}

export const scoreSheetTemplateInputSchema = scoreSheetTemplateBaseSchema.superRefine(validateScoreSheetTemplate);

export const scoreSheetTemplateSchema = scoreSheetTemplateBaseSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).superRefine(validateScoreSheetTemplate);

export type ScoreSheetTemplateInput = z.infer<typeof scoreSheetTemplateInputSchema>;
export type ScoreSheetTemplate = z.infer<typeof scoreSheetTemplateSchema>;