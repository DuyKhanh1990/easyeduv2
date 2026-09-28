import { describe, expect, it } from "vitest";
import { resolveScoreSheetAssessmentDeadlineAt } from "../shared/score-sheet-assessment";

describe("score-sheet assessment deadlines", () => {
  it("calculates a relative deadline from the assigned session start", () => {
    const assessment = {
      scoreDeadlineAt: null,
      templateSnapshot: { scoreDeadlineOffsetMinutes: 25 * 60 },
    };

    expect(
      resolveScoreSheetAssessmentDeadlineAt(assessment, "2026-09-28", "09:30:00"),
    ).toBe("2026-09-29T10:30");
  });

  it("preserves an existing fixed deadline", () => {
    const assessment = {
      scoreDeadlineAt: "2026-09-30T16:45",
      templateSnapshot: { scoreDeadlineOffsetMinutes: 25 * 60 },
    };

    expect(
      resolveScoreSheetAssessmentDeadlineAt(assessment, "2026-09-28", "09:30:00"),
    ).toBe("2026-09-30T16:45");
  });

  it("uses the start of the session date when a shift time is unavailable", () => {
    const assessment = {
      scoreDeadlineAt: null,
      templateSnapshot: { scoreDeadlineOffsetMinutes: 60 },
    };

    expect(resolveScoreSheetAssessmentDeadlineAt(assessment, "2026-09-28", null))
      .toBe("2026-09-28T01:00");
  });

  it("returns null for an invalid session date", () => {
    const assessment = {
      scoreDeadlineAt: null,
      templateSnapshot: { scoreDeadlineOffsetMinutes: 60 },
    };

    expect(resolveScoreSheetAssessmentDeadlineAt(assessment, "not-a-date", "09:30"))
      .toBeNull();
  });
});