import { describe, expect, it } from "vitest";
import { keepLatestResultPerStudent } from "../client/src/pages/education/score-conversion/student-results";

describe("keepLatestResultPerStudent", () => {
  it("keeps each student's latest exam date within the supplied filtered results", () => {
    const results = [
      { studentId: "a", examDate: "2026-10-01", sessionIndex: 1, passStatus: "passed" },
      { studentId: "b", examDate: "2026-10-02", sessionIndex: 1, passStatus: "passed" },
      { studentId: "a", examDate: "2026-10-04", sessionIndex: 2, passStatus: "passed" },
      { studentId: "a", examDate: "2026-10-03", sessionIndex: 3, passStatus: "failed" },
    ];

    const passedResults = results.filter((result) => result.passStatus === "passed");
    expect(keepLatestResultPerStudent(passedResults)).toEqual([
      results[1],
      results[2],
    ]);
  });

  it("uses the higher session index to break ties on the same exam date", () => {
    const results = [
      { studentId: "a", examDate: "2026-10-04", sessionIndex: 1 },
      { studentId: "a", examDate: "2026-10-04", sessionIndex: 3 },
    ];

    expect(keepLatestResultPerStudent(results)).toEqual([results[1]]);
  });
});
