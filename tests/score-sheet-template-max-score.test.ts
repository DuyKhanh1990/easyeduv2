import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCORE_SHEET_SKILL_COLOR,
  scoreSheetTemplateInputSchema,
} from "../shared/score-sheet-template";

const skillId = "33333333-3333-4333-8333-333333333333";
const firstPartId = "44444444-4444-4444-8444-444444444444";
const secondPartId = "55555555-5555-4555-8555-555555555555";

function templateInput(parentMaximum?: number) {
  return {
    code: "TEST",
    name: "Bảng điểm kiểm tra",
    scoreConversionTemplateId: null,
    skills: [{
      id: skillId,
      name: "Reading",
      sectionId: null,
      ...(parentMaximum === undefined ? {} : { rawMaxScore: parentMaximum }),
      parts: [
        { id: firstPartId, name: "Part 1", rawMaxScore: 10 },
        { id: secondPartId, name: "Part 2", rawMaxScore: 20 },
      ],
      partFormula: { method: "sum", formula: "" },
    }],
  };
}

describe("score-sheet skill raw maximum", () => {
  it("defaults a legacy parent maximum to the sum of its part maximums", () => {
    const parsed = scoreSheetTemplateInputSchema.parse(templateInput());

    expect(parsed.skills[0].rawMaxScore).toBe(30);
    expect(parsed.skills[0].color).toBe(DEFAULT_SCORE_SHEET_SKILL_COLOR);
  });

  it("rejects part maximums whose total exceeds the parent skill maximum", () => {
    const result = scoreSheetTemplateInputSchema.safeParse(templateInput(25));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) =>
        issue.message.includes("không được vượt quá điểm tối đa của kỹ năng"),
      )).toBe(true);
    }
  });
});
