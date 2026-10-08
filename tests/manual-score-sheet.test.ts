import { describe, expect, it } from "vitest";
import { scoreSheetAssessmentInputSchema } from "../shared/score-sheet-assessment";

const templateId = "10000000-0000-4000-8000-000000000001";
const classId = "10000000-0000-4000-8000-000000000002";
const studentId = "10000000-0000-4000-8000-000000000003";
const otherStudentId = "10000000-0000-4000-8000-000000000004";

const baseInput = {
  code: "MAN-TEST",
  name: "Manual assessment",
  scoreSheetTemplateId: templateId,
  creationMode: "manual" as const,
};

describe("manual score-sheet assessment input", () => {
  it("accepts both class and individual student selection within the shared assessment schema", () => {
    expect(scoreSheetAssessmentInputSchema.safeParse({
      ...baseInput,
      manualSelectionMode: "class",
      manualClassId: classId,
      manualStudentIds: [studentId],
      initialScoresByStudent: { [studentId]: {} },
    }).success).toBe(true);

    expect(scoreSheetAssessmentInputSchema.safeParse({
      ...baseInput,
      manualSelectionMode: "students",
      manualClassId: null,
      manualStudentIds: [studentId],
    }).success).toBe(true);
  });

  it("rejects empty or inconsistent selection, duplicates, and scores for unselected students", () => {
    expect(scoreSheetAssessmentInputSchema.safeParse({
      ...baseInput,
      manualSelectionMode: "class",
      manualClassId: classId,
      manualStudentIds: [],
    }).success).toBe(false);

    expect(scoreSheetAssessmentInputSchema.safeParse({
      ...baseInput,
      manualSelectionMode: "class",
      manualClassId: null,
      manualStudentIds: [studentId],
    }).success).toBe(false);

    expect(scoreSheetAssessmentInputSchema.safeParse({
      ...baseInput,
      manualSelectionMode: "students",
      manualClassId: classId,
      manualStudentIds: [studentId],
    }).success).toBe(false);

    expect(scoreSheetAssessmentInputSchema.safeParse({
      ...baseInput,
      manualSelectionMode: "students",
      manualClassId: null,
      manualStudentIds: [studentId, studentId],
    }).success).toBe(false);

    expect(scoreSheetAssessmentInputSchema.safeParse({
      ...baseInput,
      manualSelectionMode: "students",
      manualClassId: null,
      manualStudentIds: [studentId],
      initialScoresByStudent: { [otherStudentId]: {} },
    }).success).toBe(false);
  });
});
