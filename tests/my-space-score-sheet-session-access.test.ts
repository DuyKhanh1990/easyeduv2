import { describe, expect, it } from "vitest";
import { canStaffViewAssignedScoreSheetAssessment } from "../server/services/my-space-score-sheet-access";

describe("My Space assigned score sheet access", () => {
  it("requires session assignment for teachers to see conversion assessments", () => {
    expect(canStaffViewAssignedScoreSheetAssessment({
      hasConversion: true,
      isSessionTeacher: false,
      isClassManager: false,
    })).toBe(false);
    expect(canStaffViewAssignedScoreSheetAssessment({
      hasConversion: true,
      isSessionTeacher: true,
      isClassManager: false,
    })).toBe(true);
  });

  it("preserves class-manager access to conversion assessments", () => {
    expect(canStaffViewAssignedScoreSheetAssessment({
      hasConversion: true,
      isSessionTeacher: false,
      isClassManager: true,
    })).toBe(true);
  });

  it("does not change class-level visibility for non-conversion assessments", () => {
    expect(canStaffViewAssignedScoreSheetAssessment({
      hasConversion: false,
      isSessionTeacher: false,
      isClassManager: false,
    })).toBe(true);
  });
});
