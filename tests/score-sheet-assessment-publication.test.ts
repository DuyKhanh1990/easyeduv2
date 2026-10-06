import { describe, expect, it } from "vitest";
import {
  hasScoreSheetAssessmentFeedback,
  isScoreSheetAssessmentStudentPublished,
  withScoreSheetAssessmentStudentPublication,
} from "../shared/score-sheet-assessment-publication";
import { selectScoreSheetAssessmentAttemptSummary } from "../shared/score-sheet-assessment-scoring";

describe("score-sheet assessment individual publication", () => {
  it("treats only an explicit true marker as published", () => {
    expect(isScoreSheetAssessmentStudentPublished(null)).toBe(false);
    expect(isScoreSheetAssessmentStudentPublished({})).toBe(false);
    expect(isScoreSheetAssessmentStudentPublished({
      __scoreSheetPublication: { publishedToStudent: false },
    })).toBe(false);
    expect(isScoreSheetAssessmentStudentPublished({
      __scoreSheetPublication: { publishedToStudent: true },
    })).toBe(true);
  });

  it("preserves the score result while adding an individual publication marker", () => {
    const result = {
      version: 1,
      overallConvertedScore: 86,
      __scoreSheetPublication: { publishedBy: "staff", publishedToStudent: false },
    };

    const published = withScoreSheetAssessmentStudentPublication(result, true);

    expect(published).toEqual({
      version: 1,
      overallConvertedScore: 86,
      __scoreSheetPublication: { publishedBy: "staff", publishedToStudent: true },
    });
    expect(isScoreSheetAssessmentStudentPublished(published)).toBe(true);
  });

  it("can revoke publication without deleting the score", () => {
    const result = withScoreSheetAssessmentStudentPublication({
      version: 1,
      overallConvertedScore: 92,
    }, false);

    expect(result.overallConvertedScore).toBe(92);
    expect(isScoreSheetAssessmentStudentPublished(result)).toBe(false);
  });

  it("counts any written comment or checked evaluation item as feedback", () => {
    expect(hasScoreSheetAssessmentFeedback({}, {})).toBe(false);
    expect(hasScoreSheetAssessmentFeedback({ skill: { reading: "  " } }, {})).toBe(false);
    expect(hasScoreSheetAssessmentFeedback({ skill: { reading: "Nhận xét" } }, {})).toBe(true);
    expect(hasScoreSheetAssessmentFeedback({}, { comment: "Đạt yêu cầu" })).toBe(true);
    expect(hasScoreSheetAssessmentFeedback({}, { criterion: true })).toBe(true);
    expect(hasScoreSheetAssessmentFeedback({}, { criterion: false })).toBe(false);
  });

  it("keeps the configured attempt-selection policy when results contain publication metadata", () => {
    const attempts = [
      {
        attemptNumber: 1,
        result: withScoreSheetAssessmentStudentPublication({
          version: 1,
          skills: [],
          overallRawScore: 80,
          overallConvertedScore: 80,
          gradeBand: null,
          passStatus: "passed",
          inputComplete: true,
          conversionComplete: true,
        }, true),
      },
      {
        attemptNumber: 2,
        result: withScoreSheetAssessmentStudentPublication({
          version: 1,
          skills: [],
          overallRawScore: 65,
          overallConvertedScore: 65,
          gradeBand: null,
          passStatus: "passed",
          inputComplete: true,
          conversionComplete: true,
        }, true),
      },
    ];

    expect(selectScoreSheetAssessmentAttemptSummary(attempts, "latest", true)?.attemptNumber).toBe(2);
    expect(selectScoreSheetAssessmentAttemptSummary(attempts, "highest", true)?.attemptNumber).toBe(1);
  });
});
