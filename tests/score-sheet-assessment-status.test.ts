import { describe, expect, it } from "vitest";
import {
  resolveScoreSheetAssessmentDeadlineStatus,
  resolveScoreSheetAssessmentStatus,
} from "../shared/score-sheet-assessment-status";

const baseAssessment = {
  examDate: "2026-09-30",
  scoreDeadlineAt: "2026-10-01T11:05",
  studentCount: 2,
  enteredStudentCount: 0,
  completedStudentCount: 0,
  published: false,
};

describe("score-sheet assessment status", () => {
  it("marks the deadline date and time as within deadline until the exact cutoff", () => {
    expect(resolveScoreSheetAssessmentDeadlineStatus(
      "2026-10-01T11:05",
      Date.UTC(2026, 9, 1, 11, 5),
    )).toBe("within_deadline");
    expect(resolveScoreSheetAssessmentDeadlineStatus(
      "2026-10-01T11:05",
      Date.UTC(2026, 9, 1, 11, 6),
    )).toBe("overdue");
  });

  it("returns no deadline status when a deadline is missing or invalid", () => {
    expect(resolveScoreSheetAssessmentDeadlineStatus(null, Date.UTC(2026, 9, 1, 11, 5)))
      .toBeNull();
    expect(resolveScoreSheetAssessmentDeadlineStatus("bad-date", Date.UTC(2026, 9, 1, 11, 5)))
      .toBeNull();
  });

  it("marks an assessment as not started before its exam date", () => {
    expect(resolveScoreSheetAssessmentStatus(
      baseAssessment,
      Date.UTC(2026, 8, 29, 23, 59),
    )).toBe("not_started");
  });

  it("marks an ungraded assessment as in progress from exam date through deadline", () => {
    expect(resolveScoreSheetAssessmentStatus(
      baseAssessment,
      Date.UTC(2026, 8, 30, 0, 0),
    )).toBe("in_progress");
    expect(resolveScoreSheetAssessmentStatus(
      baseAssessment,
      Date.UTC(2026, 9, 1, 11, 5),
    )).toBe("in_progress");
  });

  it("prioritizes processing when scoring has started but is incomplete", () => {
    expect(resolveScoreSheetAssessmentStatus({
      ...baseAssessment,
      enteredStudentCount: 1,
    }, Date.UTC(2026, 8, 30, 12, 0))).toBe("processing");
  });

  it("keeps fully graded but unpublished assessments in processing", () => {
    expect(resolveScoreSheetAssessmentStatus({
      ...baseAssessment,
      enteredStudentCount: 2,
      completedStudentCount: 2,
    }, Date.UTC(2026, 8, 30, 12, 0))).toBe("processing");
  });

  it("marks a fully graded and published assessment as completed", () => {
    expect(resolveScoreSheetAssessmentStatus({
      ...baseAssessment,
      enteredStudentCount: 2,
      completedStudentCount: 2,
      published: true,
    }, Date.UTC(2026, 8, 29, 12, 0))).toBe("completed");
  });

  it("marks a fully graded assessment as completed when every student is individually published", () => {
    expect(resolveScoreSheetAssessmentStatus({
      ...baseAssessment,
      enteredStudentCount: 2,
      completedStudentCount: 2,
      allStudentsIndividuallyPublished: true,
    }, Date.UTC(2026, 8, 29, 12, 0))).toBe("completed");
  });

  it("keeps a fully graded assessment processing while any student remains unpublished", () => {
    expect(resolveScoreSheetAssessmentStatus({
      ...baseAssessment,
      enteredStudentCount: 2,
      completedStudentCount: 2,
      allStudentsIndividuallyPublished: false,
    }, Date.UTC(2026, 8, 30, 12, 0))).toBe("processing");
  });

  it("keeps an assessment processing when a student is published but still lacks a complete score", () => {
    expect(resolveScoreSheetAssessmentStatus({
      ...baseAssessment,
      enteredStudentCount: 2,
      completedStudentCount: 1,
      allStudentsIndividuallyPublished: true,
    }, Date.UTC(2026, 8, 30, 12, 0))).toBe("processing");
  });

  it("leaves overdue assessments without grades unlabelled for a separate status column", () => {
    expect(resolveScoreSheetAssessmentStatus(
      baseAssessment,
      Date.UTC(2026, 9, 1, 11, 6),
    )).toBeNull();
  });

  it("keeps overdue assessments with started scoring in processing", () => {
    expect(resolveScoreSheetAssessmentStatus({
      ...baseAssessment,
      enteredStudentCount: 1,
    }, Date.UTC(2026, 9, 2, 12, 0))).toBe("processing");
  });
});