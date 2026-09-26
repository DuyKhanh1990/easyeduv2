import { describe, expect, it } from "vitest";
import {
  calculateScoreSheetAssessmentAttemptResult,
  type ScoreSheetAssessmentAttemptValues,
} from "../shared/score-sheet-assessment-scoring";
import type { ScoreSheetTemplate } from "../shared/score-sheet-template";
import type { ScoreConversionTemplate } from "../shared/score-conversion";

const conversionId = "11111111-1111-4111-8111-111111111111";
const sectionId = "22222222-2222-4222-8222-222222222222";
const skillId = "33333333-3333-4333-8333-333333333333";
const partId = "44444444-4444-4444-8444-444444444444";
const lowMappingId = "55555555-5555-4555-8555-555555555555";
const highMappingId = "66666666-6666-4666-8666-666666666666";
const gradeBandId = "77777777-7777-4777-8777-777777777777";
const exactPointMappingId = "99999999-9999-4999-8999-999999999999";

const conversionTemplate: ScoreConversionTemplate = {
  id: conversionId,
  typeKey: "custom",
  typeName: "Bài thi mẫu",
  sections: [{
    id: sectionId,
    name: "Listening",
    rawMinScore: 0,
    rawMaxScore: 10,
    rawStep: 1,
    rawUnit: "câu đúng",
    convertedMinScore: 0,
    convertedMaxScore: 200,
    convertedStep: 1,
    convertedUnit: "điểm",
    mappings: [
      { id: lowMappingId, rawFrom: 0, rawTo: 5, internalScore: 40, convertedScore: 100 },
      { id: highMappingId, rawFrom: 5, rawTo: 10, internalScore: 50, convertedScore: 120 },
    ],
  }],
  overallRule: {
    method: "sum",
    formula: "",
    gradeBands: [{
      id: gradeBandId,
      label: "B1",
      minScore: 100,
      maxScore: 150,
    }],
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const template: ScoreSheetTemplate = {
  id: "88888888-8888-4888-8888-888888888888",
  code: "IELTS",
  name: "IELTS",
  scoreConversionTemplateId: conversionId,
  skills: [{
    id: skillId,
    name: "Listening",
    sectionId,
    parts: [{ id: partId, name: "Part 1", rawMaxScore: 10 }],
    partFormula: { method: "sum", formula: "" },
  }],
  overallRule: { method: "sum", formula: "" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function values(score: number | null): ScoreSheetAssessmentAttemptValues {
  return {
    partScores: { [skillId]: { [partId]: score } },
    skillScores: {},
    notes: {},
  };
}

describe("score-sheet assessment scoring", () => {
  it("calculates raw, internal and converted skill scores with a grade band", () => {
    const result = calculateScoreSheetAssessmentAttemptResult({
      template,
      conversionTemplate,
      values: values(4),
    });

    expect(result.skills[0]).toMatchObject({
      rawScore: 4,
      internalScore: 40,
      convertedScore: 100,
      mappingStatus: "available",
    });
    expect(result.overallRawScore).toBe(4);
    expect(result.overallConvertedScore).toBe(100);
    expect(result.gradeBand?.label).toBe("B1");
    expect(result.inputComplete).toBe(true);
    expect(result.conversionComplete).toBe(true);
  });

  it("uses the next range at shared boundaries and includes the final upper bound", () => {
    const boundary = calculateScoreSheetAssessmentAttemptResult({
      template,
      conversionTemplate,
      values: values(5),
    });
    const maximum = calculateScoreSheetAssessmentAttemptResult({
      template,
      conversionTemplate,
      values: values(10),
    });

    expect(boundary.skills[0].convertedScore).toBe(120);
    expect(maximum.skills[0].convertedScore).toBe(120);
  });

  it("prefers an exact-point mapping at the final boundary", () => {
    const conversionWithPoint = {
      ...conversionTemplate,
      sections: [{
        ...conversionTemplate.sections[0],
        mappings: [
          ...conversionTemplate.sections[0].mappings,
          {
            id: exactPointMappingId,
            rawFrom: 10,
            rawTo: 10,
            internalScore: 60,
            convertedScore: 150,
          },
        ],
      }],
    };
    const result = calculateScoreSheetAssessmentAttemptResult({
      template,
      conversionTemplate: conversionWithPoint,
      values: values(10),
    });

    expect(result.skills[0].convertedScore).toBe(150);
  });

  it("does not calculate a skill until all required parts have scores", () => {
    const result = calculateScoreSheetAssessmentAttemptResult({
      template,
      conversionTemplate,
      values: values(null),
    });

    expect(result.skills[0].rawScore).toBeNull();
    expect(result.skills[0].convertedScore).toBeNull();
    expect(result.overallRawScore).toBeNull();
    expect(result.inputComplete).toBe(false);
    expect(result.conversionComplete).toBe(false);
  });

  it("rejects a part score above the configured maximum", () => {
    expect(() => calculateScoreSheetAssessmentAttemptResult({
      template,
      conversionTemplate,
      values: values(11),
    })).toThrow("không được vượt quá 10");
  });
});