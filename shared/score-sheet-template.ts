import { z } from "zod";

export const scoreSheetTemplatePartSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  rawMaxScore: z.number().finite().nonnegative(),
});

export const scoreSheetTemplateSkillSchema = z.object({
  sectionId: z.string().uuid(),
  parts: z.array(scoreSheetTemplatePartSchema).max(100),
});

const scoreSheetTemplateBaseSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  scoreConversionTemplateId: z.string().uuid().nullable(),
  skills: z.array(scoreSheetTemplateSkillSchema).max(20),
});

function validateScoreSheetTemplate(
  template: z.infer<typeof scoreSheetTemplateBaseSchema>,
  context: z.RefinementCtx,
) {
  const sectionIds = new Set(template.skills.map((skill) => skill.sectionId));
  if (sectionIds.size !== template.skills.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Mỗi kỹ năng chỉ được cấu hình một lần.",
      path: ["skills"],
    });
  }
  if (!template.scoreConversionTemplateId && template.skills.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Chọn bảng quy đổi trước khi cấu hình kỹ năng.",
      path: ["scoreConversionTemplateId"],
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