import { describe, expect, it } from "vitest";
import {
  keepLatestResultPerStudent,
  matchesStudentPassStatus,
} from "../client/src/pages/education/score-conversion/student-results";

describe("matchesStudentPassStatus", () => {
  it("keeps all results, including unclassified results, when no outcome filter is selected", () => {
    expect(matchesStudentPassStatus(null, [])).toBe(true);
    expect(matchesStudentPassStatus("passed", [])).toBe(true);
    expect(matchesStudentPassStatus("failed", [])).toBe(true);
  });

  it("applies one or more supplemental outcome filters", () => {
    expect(matchesStudentPassStatus("passed", ["passed"])).toBe(true);
    expect(matchesStudentPassStatus("failed", ["passed"])).toBe(false);
    expect(matchesStudentPassStatus("failed", ["passed", "failed"])).toBe(true);
    expect(matchesStudentPassStatus(null, ["passed", "failed"])).toBe(false);
  });
});

describe("keepLatestResultPerStudent", () => {
  it("keeps the latest completed result per student, falling back past newer incomplete results", () => {
    const results = [
      { studentId: "a", examDate: "2026-10-01", sessionIndex: 1, status: "complete" as const, passStatus: "passed" },
      { studentId: "b", examDate: "2026-10-02", sessionIndex: 1, status: "complete" as const, passStatus: "passed" },
      { studentId: "a", examDate: "2026-10-04", sessionIndex: 2, status: "not_entered" as const, passStatus: null },
      { studentId: "a", examDate: "2026-10-03", sessionIndex: 3, status: "complete" as const, passStatus: "failed" },
    ];

    expect(keepLatestResultPerStudent(results)).toEqual([
      results[1],
      results[3],
    ]);
  });

  it("omits students without a completed result and breaks date ties by session index", () => {
    const results = [
      { studentId: "a", examDate: "2026-10-04", sessionIndex: 1, status: "complete" as const },
      { studentId: "a", examDate: "2026-10-04", sessionIndex: 3, status: "complete" as const },
      { studentId: "b", examDate: "2026-10-05", sessionIndex: 1, status: "in_progress" as const },
    ];

    expect(keepLatestResultPerStudent(results)).toEqual([results[1]]);
  });
});
