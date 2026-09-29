import { describe, expect, it } from "vitest";
import {
  getAssignedTeacherTimeRange,
  getTeacherIdsForTimeRange,
} from "../shared/teacher-time-assignments";

describe("getTeacherIdsForTimeRange", () => {
  it("shows assigned teachers whose intervals overlap the staff member's interval", () => {
    const assignments = [
      { teacherId: "covers-range", startTime: "08:00:00", endTime: "10:00:00" },
      { teacherId: "same-range", startTime: "08:30", endTime: "09:30" },
      { teacherId: "touches-end", startTime: "09:30:00", endTime: "10:00:00" },
      { teacherId: "before-range", startTime: "07:00", endTime: "08:30" },
    ];

    expect(getTeacherIdsForTimeRange(assignments, "08:30:00", "09:30:00")).toEqual([
      "covers-range",
      "same-range",
    ]);
  });

  it("keeps legacy class teachers without interval rows assigned for the full shift", () => {
    const assignments = [
      { teacherId: "partial", startTime: "09:00", endTime: "10:00" },
    ];

    expect(
      getTeacherIdsForTimeRange(assignments, "08:00", "10:00", ["legacy", "partial"]),
    ).toEqual(["partial", "legacy"]);
  });

  it("uses the selected teacher's interval and keeps the configured full shift as fallback", () => {
    const assignments = [
      { teacherId: "teacher-a", startTime: "08:30:00", endTime: "09:30:00" },
    ];

    expect(getAssignedTeacherTimeRange(assignments, "teacher-a", "08:00", "10:00")).toEqual({
      startTime: "08:30",
      endTime: "09:30",
    });
    expect(getAssignedTeacherTimeRange(assignments, "teacher-b", "08:00", "10:00")).toEqual({
      startTime: "08:00",
      endTime: "10:00",
    });
  });
});
