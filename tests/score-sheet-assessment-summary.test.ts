import { describe, expect, it } from "vitest";
import { selectScoreSheetAssessmentAttemptSummary } from "../shared/score-sheet-assessment-scoring";

function result(
  score: number,
  inputComplete: boolean,
  overrides: {
    gradeBand?: { id: string; label: string; color: string; minScore: number; maxScore: number } | null;
    gradeBandOverrideId?: string | null;
    passStatus?: "passed" | "failed" | null;
    passStatusOverride?: "passed" | "failed" | null;
  } = {},
) {
  return {
    version: 1 as const,
    skills: [],
    overallRawScore: score,
    overallConvertedScore: score,
    gradeBand: overrides.gradeBand ?? null,
    gradeBandOverrideId: overrides.gradeBandOverrideId ?? null,
    passStatus: overrides.passStatus ?? null,
    passStatusOverride: overrides.passStatusOverride ?? null,
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

  it("keeps the selected attempt's manually overridden classification and result", () => {
    const attempts = [
      {
        attemptNumber: 1,
        result: result(80, true, {
          gradeBand: {
            id: "11111111-1111-4111-8111-111111111111",
            label: "Đậu có điều kiện",
            color: "#2563EB",
            minScore: 0,
            maxScore: 100,
          },
          gradeBandOverrideId: "11111111-1111-4111-8111-111111111111",
          passStatus: "failed",
          passStatusOverride: "failed",
        }),
      },
      {
        attemptNumber: 2,
        result: result(65, true, {
          gradeBand: {
            id: "22222222-2222-4222-8222-222222222222",
            label: "Đạt",
            color: "#16A34A",
            minScore: 0,
            maxScore: 100,
          },
          passStatus: "passed",
        }),
      },
    ];

    const highestSummary = selectScoreSheetAssessmentAttemptSummary(attempts, "highest", true);
    const latestSummary = selectScoreSheetAssessmentAttemptSummary(attempts, "latest", true);

    expect(highestSummary?.attemptNumber).toBe(1);
    expect(highestSummary?.result.gradeBand?.label).toBe("Đậu có điều kiện");
    expect(highestSummary?.result.gradeBandOverrideId).toBe("11111111-1111-4111-8111-111111111111");
    expect(highestSummary?.result.passStatus).toBe("failed");
    expect(highestSummary?.result.passStatusOverride).toBe("failed");

    expect(latestSummary?.attemptNumber).toBe(2);
    expect(latestSummary?.result.gradeBand?.label).toBe("Đạt");
    expect(latestSummary?.result.passStatus).toBe("passed");
  });

  it("returns no summary when there are no attempts", () => {
    expect(selectScoreSheetAssessmentAttemptSummary([], "latest", true)).toBeNull();
  });
});