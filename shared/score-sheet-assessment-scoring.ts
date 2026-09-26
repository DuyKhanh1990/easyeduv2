import { z } from "zod";
import {
  scoreConversionTemplateSchema,
  type ScoreConversionTemplate,
} from "./score-conversion";
import { evaluateScoreConversionFormula } from "./score-conversion-formula";
import {
  scoreSheetTemplateSchema,
  type ScoreSheetTemplate,
} from "./score-sheet-template";

const nullableScoreSchema = z.number().finite().nonnegative().nullable();

export const scoreSheetAssessmentAttemptValuesSchema = z.object({
  partScores: z.record(
    z.string(),
    z.record(z.string(), nullableScoreSchema),
  ).default({}),
  skillScores: z.record(z.string(), nullableScoreSchema).default({}),
  notes: z.record(
    z.string(),
    z.record(z.string(), z.string().max(1000)),
  ).default({}),
}).strict();

export const scoreSheetAssessmentAttemptResultSchema = z.object({
  version: z.literal(1),
  skills: z.array(z.object({
    skillId: z.string(),
    sectionId: z.string().uuid().nullable(),
    name: z.string(),
    rawScore: nullableScoreSchema,
    internalScore: z.number().finite().nullable(),
    convertedScore: z.number().finite().nullable(),
    mappingStatus: z.enum(["not_applicable", "available", "no_mapping"]),
  })),
  overallRawScore: z.number().finite().nullable(),
  overallConvertedScore: z.number().finite().nullable(),
  gradeBand: z.object({
    id: z.string().uuid(),
    label: z.string(),
    minScore: z.number().finite(),
    maxScore: z.number().finite(),
  }).nullable(),
  inputComplete: z.boolean(),
  conversionComplete: z.boolean(),
});

export type ScoreSheetAssessmentAttemptValues = z.infer<typeof scoreSheetAssessmentAttemptValuesSchema>;
export type ScoreSheetAssessmentAttemptResult = z.infer<typeof scoreSheetAssessmentAttemptResultSchema>;

type ScoreSheetSkill = ScoreSheetTemplate["skills"][number];

function getSkillId(skill: ScoreSheetSkill, index: number): string {
  const id = skill.id ?? skill.sectionId;
  if (!id) throw new Error(`Kỹ năng thứ ${index + 1} chưa có mã định danh.`);
  return id;
}

function aggregateScores(
  rule: { method: "sum" | "average" | "custom"; formula?: string },
  values: Array<{ name: string; score: number | null }>,
): number | null {
  if (values.length === 0 || values.some(({ score }) => score === null)) return null;
  const scores = values.map(({ score }) => score as number);

  if (rule.method === "sum") return roundScore(scores.reduce((total, score) => total + score, 0));
  if (rule.method === "average") {
    return roundScore(scores.reduce((total, score) => total + score, 0) / scores.length);
  }

  const scoreByName = new Map(values.map(({ name, score }) => [name, score as number]));
  return roundScore(evaluateScoreConversionFormula(rule.formula ?? "", scoreByName));
}

function roundScore(value: number): number {
  return Number(value.toFixed(2));
}

function findConversionMapping(
  section: ScoreConversionTemplate["sections"][number],
  rawScore: number,
) {
  const mappings = [...section.mappings].sort((a, b) => a.rawFrom - b.rawFrom || a.rawTo - b.rawTo);
  if (mappings.length === 0) return null;

  return mappings.find((mapping, index) => {
    if (mapping.rawFrom === mapping.rawTo) return rawScore === mapping.rawFrom;
    return rawScore >= mapping.rawFrom
      && (rawScore < mapping.rawTo
        || (index === mappings.length - 1 && rawScore === mapping.rawTo));
  }) ?? null;
}

function validateAttemptValues(
  template: ScoreSheetTemplate,
  conversionTemplate: ScoreConversionTemplate | null,
  values: ScoreSheetAssessmentAttemptValues,
): void {
  const skillIds = new Set<string>();
  const skillsById = new Map<string, ScoreSheetSkill>();
  const conversionSectionsById = new Map(
    (conversionTemplate?.sections ?? []).map((section) => [section.id, section]),
  );

  template.skills.forEach((skill, index) => {
    const skillId = getSkillId(skill, index);
    if (skillIds.has(skillId)) throw new Error("Mã kỹ năng bị trùng trong bảng điểm.");
    skillIds.add(skillId);
    skillsById.set(skillId, skill);
  });

  for (const [skillId, partScores] of Object.entries(values.partScores)) {
    const skill = skillsById.get(skillId);
    if (!skill) throw new Error("Dữ liệu điểm có kỹ năng không thuộc bảng điểm này.");
    if (skill.parts.length === 0) throw new Error(`Kỹ năng “${skill.name || "không tên"}” không có phần điểm con.`);

    const allowedPartIds = new Set(skill.parts.map((part) => part.id));
    for (const [partId, score] of Object.entries(partScores)) {
      const part = skill.parts.find((item) => item.id === partId);
      if (!allowedPartIds.has(partId) || !part) {
        throw new Error("Dữ liệu điểm có phần thi không thuộc kỹ năng này.");
      }
      if (score !== null && score > part.rawMaxScore) {
        throw new Error(`Điểm của “${part.name}” không được vượt quá ${part.rawMaxScore}.`);
      }
    }
  }

  for (const [skillId, score] of Object.entries(values.skillScores)) {
    const skill = skillsById.get(skillId);
    if (!skill) throw new Error("Dữ liệu điểm có kỹ năng không thuộc bảng điểm này.");
    if (skill.parts.length > 0) {
      throw new Error(`Kỹ năng “${skill.name || "không tên"}” cần nhập điểm theo từng phần.`);
    }
    const section = skill.sectionId ? conversionSectionsById.get(skill.sectionId) : null;
    if (score !== null && section && score > section.rawMaxScore) {
      throw new Error(`Điểm của “${skill.name || section.name}” không được vượt quá ${section.rawMaxScore}.`);
    }
  }

  for (const [skillId, partNotes] of Object.entries(values.notes)) {
    const skill = skillsById.get(skillId);
    if (!skill) throw new Error("Ghi chú có kỹ năng không thuộc bảng điểm này.");
    const allowedNoteIds = new Set(["_skill", ...skill.parts.map((part) => part.id)]);
    if (Object.keys(partNotes).some((partId) => !allowedNoteIds.has(partId))) {
      throw new Error("Ghi chú có phần thi không thuộc kỹ năng này.");
    }
  }
}

export function calculateScoreSheetAssessmentAttemptResult(args: {
  template: ScoreSheetTemplate;
  conversionTemplate: ScoreConversionTemplate | null;
  values: ScoreSheetAssessmentAttemptValues;
}): ScoreSheetAssessmentAttemptResult {
  const template = scoreSheetTemplateSchema.parse(args.template);
  const conversionTemplate = args.conversionTemplate
    ? scoreConversionTemplateSchema.parse(args.conversionTemplate)
    : null;
  const values = scoreSheetAssessmentAttemptValuesSchema.parse(args.values);
  validateAttemptValues(template, conversionTemplate, values);

  const conversionSectionsById = new Map(
    (conversionTemplate?.sections ?? []).map((section) => [section.id, section]),
  );
  const skillResults = template.skills.map((skill, index) => {
    const skillId = getSkillId(skill, index);
    let rawScore: number | null = null;

    if (skill.parts.length === 0) {
      rawScore = values.skillScores[skillId] ?? null;
    } else {
      const partScores = values.partScores[skillId] ?? {};
      const completeParts = skill.parts.every((part) =>
        typeof partScores[part.id] === "number",
      );
      if (completeParts) {
        const scores = skill.parts.map((part) => partScores[part.id] as number);
        if (skill.partFormula.method === "sum") {
          rawScore = roundScore(scores.reduce((total, score) => total + score, 0));
        } else if (skill.partFormula.method === "average") {
          rawScore = roundScore(scores.reduce((total, score) => total + score, 0) / scores.length);
        } else {
          const scoreByPartName = new Map(
            skill.parts.map((part) => [part.name, partScores[part.id] as number]),
          );
          rawScore = roundScore(evaluateScoreConversionFormula(
            skill.partFormula.formula,
            scoreByPartName,
          ));
        }
      }
    }

    const sectionId = skill.sectionId ?? null;
    if (!conversionTemplate || !sectionId) {
      return {
        skillId,
        sectionId,
        name: skill.name || conversionSectionsById.get(sectionId ?? "")?.name || "Kỹ năng",
        rawScore,
        internalScore: null,
        convertedScore: null,
        mappingStatus: "not_applicable" as const,
      };
    }

    const section = conversionSectionsById.get(sectionId);
    const mapping = section && rawScore !== null
      ? findConversionMapping(section, rawScore)
      : null;
    return {
      skillId,
      sectionId,
      name: skill.name || section?.name || "Kỹ năng",
      rawScore,
      internalScore: mapping?.internalScore ?? null,
      convertedScore: mapping?.convertedScore ?? null,
      mappingStatus: !section ? "no_mapping" as const
        : rawScore === null ? "not_applicable" as const
          : mapping ? "available" as const : "no_mapping" as const,
    };
  });

  const skillResultsById = new Map(skillResults.map((result) => [result.sectionId, result]));
  const overallRawScore = template.skills.length > 0
    ? aggregateScores(
      template.overallRule ?? { method: "sum", formula: "" },
      skillResults.map((result) => ({ name: result.name, score: result.rawScore })),
    )
    : null;

  const overallConvertedScore = conversionTemplate
    ? aggregateScores(
      conversionTemplate.overallRule,
      conversionTemplate.sections.map((section) => ({
        name: section.name,
        score: skillResultsById.get(section.id)?.convertedScore ?? null,
      })),
    )
    : null;

  const gradeBand = conversionTemplate && overallConvertedScore !== null
    ? conversionTemplate.overallRule.gradeBands.find((band) =>
      overallConvertedScore >= band.minScore && overallConvertedScore <= band.maxScore,
    ) ?? null
    : null;
  const inputComplete = skillResults.length > 0
    && skillResults.every((result) => result.rawScore !== null);
  const conversionComplete = !conversionTemplate
    || (conversionTemplate.sections.length > 0
      && conversionTemplate.sections.every((section) =>
        skillResultsById.get(section.id)?.convertedScore !== null
        && skillResultsById.get(section.id)?.convertedScore !== undefined,
      ));

  return scoreSheetAssessmentAttemptResultSchema.parse({
    version: 1,
    skills: skillResults,
    overallRawScore,
    overallConvertedScore,
    gradeBand: gradeBand ? {
      id: gradeBand.id,
      label: gradeBand.label,
      minScore: gradeBand.minScore,
      maxScore: gradeBand.maxScore,
    } : null,
    inputComplete,
    conversionComplete,
  });
}