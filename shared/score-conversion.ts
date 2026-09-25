import { z } from "zod";

export const SCORE_CONVERSION_TYPE_KEYS = [
  "starters",
  "movers",
  "flyers",
  "ket",
  "pet",
  "toeic",
  "ielts",
  "custom",
] as const;

export const scoreConversionSectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  minScore: z.number().finite(),
  maxScore: z.number().finite(),
  step: z.number().positive(),
  unit: z.string().trim().min(1).max(40),
}).refine((section) => section.maxScore >= section.minScore, {
  message: "Điểm tối đa phải lớn hơn hoặc bằng điểm tối thiểu.",
  path: ["maxScore"],
});

export const scoreConversionGradeBandSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  minScore: z.number().finite(),
  maxScore: z.number().finite(),
}).refine((band) => band.maxScore >= band.minScore, {
  message: "Điểm tối đa phải lớn hơn hoặc bằng điểm tối thiểu.",
  path: ["maxScore"],
});

export const scoreConversionRuleSchema = z.object({
  method: z.enum(["sum", "average"]),
  minScore: z.number().finite(),
  maxScore: z.number().finite(),
  roundingStep: z.number().positive().nullable(),
  unit: z.string().trim().min(1).max(40),
  description: z.string().trim().max(1000),
  gradeBands: z.array(scoreConversionGradeBandSchema).max(20),
}).refine((rule) => rule.maxScore >= rule.minScore, {
  message: "Điểm tối đa phải lớn hơn hoặc bằng điểm tối thiểu.",
  path: ["maxScore"],
});

export const scoreConversionTemplateInputSchema = z.object({
  name: z.string().trim().min(1).max(255),
  typeKey: z.enum(SCORE_CONVERSION_TYPE_KEYS),
  typeName: z.string().trim().min(1).max(100),
  sections: z.array(scoreConversionSectionSchema).min(1).max(20),
  overallRule: scoreConversionRuleSchema,
});

export const scoreConversionTemplateSchema = scoreConversionTemplateInputSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ScoreConversionTemplateInput = z.infer<typeof scoreConversionTemplateInputSchema>;
export type ScoreConversionTemplate = z.infer<typeof scoreConversionTemplateSchema>;
export type ScoreConversionTypeKey = typeof SCORE_CONVERSION_TYPE_KEYS[number];