import { z } from "zod";
import { validateScoreConversionFormula } from "./score-conversion-formula";

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

export const scoreSheetTemplateSkillSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().max(120).default(""),
  sectionId: z.string().uuid().nullable().default(null),
  parts: z.array(scoreSheetTemplatePartSchema).max(100),
  partFormula: scoreSheetTemplatePartFormulaSchema.default({ method: "sum", formula: "" }),
}).superRefine((skill, context) => {
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
}

export const scoreSheetTemplateInputSchema = scoreSheetTemplateBaseSchema.superRefine(validateScoreSheetTemplate);

export const scoreSheetTemplateSchema = scoreSheetTemplateBaseSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).superRefine(validateScoreSheetTemplate);

export type ScoreSheetTemplateInput = z.infer<typeof scoreSheetTemplateInputSchema>;
export type ScoreSheetTemplate = z.infer<typeof scoreSheetTemplateSchema>;