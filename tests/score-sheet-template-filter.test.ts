import { describe, expect, it } from "vitest";
import { getConversionScoreSheetFilterId } from "../client/src/lib/scoreSheetFilter";

describe("conversion score-sheet filters", () => {
  it("groups assessment instances from the same template under one filter", () => {
    expect(getConversionScoreSheetFilterId({
      assessmentId: "assessment-one",
      scoreSheetTemplateId: "template-ket-1",
    })).toBe(getConversionScoreSheetFilterId({
      assessmentId: "assessment-two",
      scoreSheetTemplateId: "template-ket-1",
    }));
  });

  it("keeps assessments from different templates on separate filters", () => {
    expect(getConversionScoreSheetFilterId({
      assessmentId: "assessment-one",
      scoreSheetTemplateId: "template-ket-1",
    })).not.toBe(getConversionScoreSheetFilterId({
      assessmentId: "assessment-two",
      scoreSheetTemplateId: "template-ielts",
    }));
  });

  it("falls back to the assessment identity when a template ID is unavailable", () => {
    expect(getConversionScoreSheetFilterId({ assessmentId: "assessment-one" }))
      .toBe("conversion:assessment-one");
  });
});
