import { describe, expect, it } from "vitest";
import {
  calculateScoreSheetAssessmentAttemptResult,
  type ScoreSheetAssessmentAttemptValues,
} from "../shared/score-sheet-assessment-scoring";
import type { ScoreSheetTemplate } from "../shared/score-sheet-template";
import {
  SCORE_CONVERSION_DEFAULT_GRADE_BAND_COLOR,
  scoreConversionTemplateSchema,
  type ScoreConversionTemplate,
} from "../shared/score-conversion";

const conversionId = "11111111-1111-4111-8111-111111111111";
const sectionId = "22222222-2222-4222-8222-222222222222";
const skillId = "33333333-3333-4333-8333-333333333333";
const partId = "44444444-4444-4444-8444-444444444444";
const secondPartId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
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
      color: "#16A34A",
      minScore: 100,
      maxScore: 150,
    }],
    passThreshold: {
      enabled: false,
      minScore: 0,
      maxScore: 0,
      scoreSource: "overallConvertedScore",
    },
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
    rawMaxScore: 10,
    color: "#2563EB",
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
    expect(result.gradeBand?.color).toBe("#16A34A");
    expect(result.inputComplete).toBe(true);
    expect(result.conversionComplete).toBe(true);
  });

  it("uses classification thresholds owned by the score sheet template", () => {
    const scoreSheetTemplate: ScoreSheetTemplate = {
      ...template,
      gradeBands: [{
        id: gradeBandId,
        label: "A2",
        color: "#DC2626",
        minScore: 90,
        maxScore: 110,
      }],
      passThreshold: {
        enabled: true,
        minScore: 100,
        maxScore: 110,
        scoreSource: "overallConvertedScore",
      },
    };

    const result = calculateScoreSheetAssessmentAttemptResult({
      template: scoreSheetTemplate,
      conversionTemplate,
      values: values(4),
    });

    expect(result.gradeBand).toMatchObject({ label: "A2", color: "#DC2626" });
    expect(result.passStatus).toBe("passed");
  });

  it("classifies manual score sheets against the raw total", () => {
    const manualTemplate: ScoreSheetTemplate = {
      ...template,
      scoreConversionTemplateId: null,
      skills: [{
        ...template.skills[0],
        sectionId: null,
      }],
      gradeBands: [{
        id: gradeBandId,
        label: "Đạt",
        color: "#16A34A",
        minScore: 4,
        maxScore: 10,
      }],
      passThreshold: {
        enabled: true,
        minScore: 4,
        maxScore: 10,
        scoreSource: "overallRawScore",
      },
    };

    const result = calculateScoreSheetAssessmentAttemptResult({
      template: manualTemplate,
      conversionTemplate: null,
      values: values(4),
    });

    expect(result.overallRawScore).toBe(4);
    expect(result.gradeBand?.label).toBe("Đạt");
    expect(result.passStatus).toBe("passed");
  });

  it("defaults the color for existing grade bands that were saved before colors were added", () => {
    const existingTemplate = scoreConversionTemplateSchema.parse({
      ...conversionTemplate,
      overallRule: {
        method: conversionTemplate.overallRule.method,
        formula: conversionTemplate.overallRule.formula,
        gradeBands: conversionTemplate.overallRule.gradeBands.map(
          ({ id, label, minScore, maxScore }) => ({ id, label, minScore, maxScore }),
        ),
      },
    });

    expect(existingTemplate.overallRule.gradeBands[0].color)
      .toBe(SCORE_CONVERSION_DEFAULT_GRADE_BAND_COLOR);
    expect(existingTemplate.overallRule.passThreshold.enabled).toBe(false);
  });

  it("classifies students at or above the raw-score minimum, including scores above the entered range", () => {
    const passingTemplate: ScoreConversionTemplate = {
      ...conversionTemplate,
      overallRule: {
        ...conversionTemplate.overallRule,
        passThreshold: {
          enabled: true,
          minScore: 4,
          maxScore: 4,
          scoreSource: "overallRawScore",
        },
      },
    };
    const passingResult = calculateScoreSheetAssessmentAttemptResult({
      template,
      conversionTemplate: passingTemplate,
      values: values(4),
    });
    const higherThanEnteredRangeResult = calculateScoreSheetAssessmentAttemptResult({
      template,
      conversionTemplate: passingTemplate,
      values: values(10),
    });
    const failingResult = calculateScoreSheetAssessmentAttemptResult({
      template,
      conversionTemplate: {
        ...passingTemplate,
        overallRule: {
          ...passingTemplate.overallRule,
          passThreshold: {
            ...passingTemplate.overallRule.passThreshold,
            minScore: 5,
            maxScore: 10,
          },
        },
      },
      values: values(4),
    });

    expect(passingResult.passStatus).toBe("passed");
    expect(higherThanEnteredRangeResult.passStatus).toBe("passed");
    expect(failingResult.passStatus).toBe("failed");
  });

  it("classifies converted scores at or above the minimum and leaves incomplete scores unclassified", () => {
    const convertedThresholdTemplate: ScoreConversionTemplate = {
      ...conversionTemplate,
      overallRule: {
        ...conversionTemplate.overallRule,
        passThreshold: {
          enabled: true,
          minScore: 100,
          maxScore: 100,
          scoreSource: "overallConvertedScore",
        },
      },
    };
    const completeResult = calculateScoreSheetAssessmentAttemptResult({
      template,
      conversionTemplate: convertedThresholdTemplate,
      values: values(4),
    });
    const aboveRangeResult = calculateScoreSheetAssessmentAttemptResult({
      template,
      conversionTemplate: convertedThresholdTemplate,
      values: values(10),
    });
    const incompleteResult = calculateScoreSheetAssessmentAttemptResult({
      template,
      conversionTemplate: convertedThresholdTemplate,
      values: values(null),
    });

    expect(completeResult.passStatus).toBe("passed");
    expect(aboveRangeResult.overallConvertedScore).toBe(120);
    expect(aboveRangeResult.passStatus).toBe("passed");
    expect(incompleteResult.passStatus).toBeNull();
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

  it("includes an upper bound when the next range begins after it", () => {
    const conversionWithSeparatedRanges = {
      ...conversionTemplate,
      sections: [{
        ...conversionTemplate.sections[0],
        mappings: [
          { ...conversionTemplate.sections[0].mappings[0], rawTo: 4 },
          { ...conversionTemplate.sections[0].mappings[1], rawFrom: 5 },
        ],
      }],
    };
    const result = calculateScoreSheetAssessmentAttemptResult({
      template,
      conversionTemplate: conversionWithSeparatedRanges,
      values: values(4),
    });

    expect(result.skills[0].rawScore).toBe(4);
    expect(result.skills[0].convertedScore).toBe(100);
    expect(result.skills[0].mappingStatus).toBe("available");
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

  it("rejects a calculated skill score above its parent maximum", () => {
    const multiPartTemplate: ScoreSheetTemplate = {
      ...template,
      skills: [{
        ...template.skills[0],
        rawMaxScore: 10,
        parts: [
          { id: partId, name: "Part 1", rawMaxScore: 5 },
          { id: secondPartId, name: "Part 2", rawMaxScore: 5 },
        ],
        partFormula: { method: "custom", formula: "=[Part 1] * 3 + [Part 2]" },
      }],
    };

    expect(() => calculateScoreSheetAssessmentAttemptResult({
      template: multiPartTemplate,
      conversionTemplate,
      values: {
        partScores: { [skillId]: { [partId]: 5, [secondPartId]: 5 } },
        skillScores: {},
        notes: {},
      },
    })).toThrow("không được vượt quá 10");
  });

  it("limits direct skill scores by the configured parent maximum", () => {
    const directTemplate: ScoreSheetTemplate = {
      ...template,
      scoreConversionTemplateId: null,
      skills: [{
        id: skillId,
        name: "Writing",
        sectionId: null,
        parts: [],
        partFormula: { method: "sum", formula: "" },
        rawMaxScore: 5,
        color: "#2563EB",
      }],
    };

    expect(() => calculateScoreSheetAssessmentAttemptResult({
      template: directTemplate,
      conversionTemplate: null,
      values: {
        partScores: {},
        skillScores: { [skillId]: 6 },
        notes: {},
      },
    })).toThrow("không được vượt quá 5");
  });
});
