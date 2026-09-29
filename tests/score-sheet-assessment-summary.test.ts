import { describe, expect, it } from "vitest";
import { selectScoreSheetAssessmentAttemptSummary } from "../shared/score-sheet-assessment-scoring";

function result(score: number, inputComplete: boolean) {
  return {
    version: 1 as const,
    skills: [],
    overallRawScore: score,
    overallConvertedScore: score,
    gradeBand: null,
    inputComplete,
    conversionComplete: inputComplete,
  };
}

describe("score-sheet assessment attempt summary", () => {
  it("uses the selected latest attempt's input status", () => {
    const summary = selectScoreSheetAssessmentAttemptSummary([
      { attemptNumber: 1, result: result(80, true) },
      { attemptNumber: 2, result: result(40, false) },
    ], "latest", true);

    expect(summary?.attemptNumber).toBe(2);
    expect(summary?.result.inputComplete).toBe(false);
  });

  it("uses the selected highest-score attempt's input status", () => {
    const summary = selectScoreSheetAssessmentAttemptSummary([
      { attemptNumber: 1, result: result(80, true) },
      { attemptNumber: 2, result: result(100, false) },
    ], "highest", true);

    expect(summary?.attemptNumber).toBe(2);
    expect(summary?.result.inputComplete).toBe(false);
  });

  it("returns no summary when there are no attempts", () => {
    expect(selectScoreSheetAssessmentAttemptSummary([], "latest", true)).toBeNull();
  });
});