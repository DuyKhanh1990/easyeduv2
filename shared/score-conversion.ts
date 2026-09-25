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

export const scoreConversionMappingSchema = z.object({
  id: z.string().uuid(),
  rawFrom: z.number().finite(),
  rawTo: z.number().finite(),
  convertedScore: z.number().finite(),
}).refine((mapping) => mapping.rawTo >= mapping.rawFrom, {
  message: "Điểm thô đến phải lớn hơn hoặc bằng điểm thô từ.",
  path: ["rawTo"],
});

export const scoreConversionSectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  rawMinScore: z.number().finite(),
  rawMaxScore: z.number().finite(),
  rawStep: z.number().positive(),
  rawUnit: z.string().trim().min(1).max(40),
  convertedMinScore: z.number().finite(),
  convertedMaxScore: z.number().finite(),
  convertedStep: z.number().positive(),
  convertedUnit: z.string().trim().min(1).max(40),
  mappings: z.array(scoreConversionMappingSchema).max(500),
}).superRefine((section, context) => {
  if (section.rawMaxScore < section.rawMinScore) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Điểm thô tối đa phải lớn hơn hoặc bằng điểm tối thiểu.",
      path: ["rawMaxScore"],
    });
  }
  if (section.convertedMaxScore < section.convertedMinScore) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Điểm quy đổi tối đa phải lớn hơn hoặc bằng điểm tối thiểu.",
      path: ["convertedMaxScore"],
    });
  }

  const orderedMappings = section.mappings
    .map((mapping, index) => ({ mapping, index }))
    .sort((a, b) => a.mapping.rawFrom - b.mapping.rawFrom);
  for (const { mapping, index } of orderedMappings) {
    if (mapping.rawFrom < section.rawMinScore || mapping.rawTo > section.rawMaxScore) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Khoảng điểm thô phải nằm trong giới hạn của phần thi.",
        path: ["mappings", index, "rawFrom"],
      });
    }
    if (mapping.convertedScore < section.convertedMinScore || mapping.convertedScore > section.convertedMaxScore) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Điểm quy đổi phải nằm trong giới hạn của phần thi.",
        path: ["mappings", index, "convertedScore"],
      });
    }
  }
  for (let index = 1; index < orderedMappings.length; index += 1) {
    if (orderedMappings[index].mapping.rawFrom <= orderedMappings[index - 1].mapping.rawTo) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Các khoảng điểm thô không được chồng lấn.",
        path: ["mappings", orderedMappings[index].index, "rawFrom"],
      });
    }
  }
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

export const legacyScoreConversionTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(255),
  typeKey: z.enum(SCORE_CONVERSION_TYPE_KEYS),
  typeName: z.string().trim().min(1).max(100),
  sections: z.array(z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    minScore: z.number().finite(),
    maxScore: z.number().finite(),
    step: z.number().positive(),
    unit: z.string().trim().min(1).max(40),
  })),
  overallRule: scoreConversionRuleSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ScoreConversionTemplateInput = z.infer<typeof scoreConversionTemplateInputSchema>;
export type ScoreConversionTemplate = z.infer<typeof scoreConversionTemplateSchema>;
export type ScoreConversionTypeKey = typeof SCORE_CONVERSION_TYPE_KEYS[number];