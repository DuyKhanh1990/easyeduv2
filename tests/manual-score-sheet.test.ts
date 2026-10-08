import { describe, expect, it } from "vitest";
import { manualScoreSheetPayloadSchema } from "../shared/manual-score-sheet";

const templateId = "10000000-0000-4000-8000-000000000001";
const classId = "10000000-0000-4000-8000-000000000002";
const studentId = "10000000-0000-4000-8000-000000000003";

describe("manual score-sheet payload", () => {
  it("accepts a class roster and an individual student selection", () => {
    expect(manualScoreSheetPayloadSchema.safeParse({
      templateId,
      selectionMode: "class",
      classId,
      studentIds: [studentId],
      scoresByStudent: {},
    }).success).toBe(true);

    expect(manualScoreSheetPayloadSchema.safeParse({
      templateId,
      selectionMode: "students",
      classId: null,
      studentIds: [studentId],
      scoresByStudent: {},
    }).success).toBe(true);
  });

  it("rejects inconsistent selection scope, duplicate students, and scores for unselected students", () => {
    expect(manualScoreSheetPayloadSchema.safeParse({
      templateId,
      selectionMode: "class",
      classId: null,
      studentIds: [studentId],
      scoresByStudent: {},
    }).success).toBe(false);

    expect(manualScoreSheetPayloadSchema.safeParse({
      templateId,
      selectionMode: "students",
      classId,
      studentIds: [studentId],
      scoresByStudent: {},
    }).success).toBe(false);

    expect(manualScoreSheetPayloadSchema.safeParse({
      templateId,
      selectionMode: "students",
      classId: null,
      studentIds: [studentId, studentId],
      scoresByStudent: {},
    }).success).toBe(false);

    expect(manualScoreSheetPayloadSchema.safeParse({
      templateId,
      selectionMode: "students",
      classId: null,
      studentIds: [studentId],
      scoresByStudent: {
        "10000000-0000-4000-8000-000000000004": {},
      },
    }).success).toBe(false);
  });
});
