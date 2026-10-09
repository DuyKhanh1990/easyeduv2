import { describe, expect, it } from "vitest";
import {
  resolveManualScoreSheetAssessmentDeadlineAt,
  resolveScoreSheetAssessmentDeadlineAt,
} from "../shared/score-sheet-assessment";

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

  it("uses the current linked template offset for a relative deadline", () => {
    const assessment = {
      scoreDeadlineAt: null,
      templateSnapshot: { scoreDeadlineOffsetMinutes: 6 * 60 },
    };

    expect(
      resolveScoreSheetAssessmentDeadlineAt(
        assessment,
        "2026-09-30",
        "05:05:00",
        30 * 60,
      ),
    ).toBe("2026-10-01T11:05");
  });

  it("recalculates a stale fixed deadline when the linked template has a current offset", () => {
    const assessment = {
      scoreDeadlineAt: "2026-09-30T11:05",
      templateSnapshot: { scoreDeadlineOffsetMinutes: 6 * 60 },
    };

    expect(
      resolveScoreSheetAssessmentDeadlineAt(
        assessment,
        "2026-09-30",
        "05:05:00",
        30 * 60,
      ),
    ).toBe("2026-10-01T11:05");
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

  it("calculates a manual assessment deadline from its exam date and the current template", () => {
    const assessment = {
      scoreDeadlineAt: null,
      templateSnapshot: { scoreDeadlineOffsetMinutes: 6 * 60 },
    };

    expect(resolveManualScoreSheetAssessmentDeadlineAt(
      assessment,
      "2026-10-08T18:30:00.000Z",
      24 * 60,
    )).toBe("2026-10-10T00:00");
  });

  it("returns null when a manual assessment has no valid exam date", () => {
    const assessment = {
      scoreDeadlineAt: null,
      templateSnapshot: { scoreDeadlineOffsetMinutes: 60 },
    };

    expect(resolveManualScoreSheetAssessmentDeadlineAt(assessment, "invalid-date"))
      .toBeNull();
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