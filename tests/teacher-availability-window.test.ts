import { describe, expect, it } from "vitest";
import { shouldWarnUnavailableTeacher } from "../server/services/conflict-check.service";

describe("teacher availability window warning", () => {
  const registrations = [{
    weekday: 1,
    startTime: "08:00",
    endTime: "12:00",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
  }];

  it("does not warn when the teacher has no active registrations", () => {
    expect(shouldWarnUnavailableTeacher("2027-01-04", 1, "09:00", "10:00", registrations)).toBe(false);
    expect(shouldWarnUnavailableTeacher("2026-03-02", 1, "09:00", "10:00", [])).toBe(false);
  });

  it("allows a session fully contained in the registered time range", () => {
    expect(shouldWarnUnavailableTeacher("2026-03-02", 1, "08:00", "12:00", registrations)).toBe(false);
    expect(shouldWarnUnavailableTeacher("2026-03-02", 1, "09:00", "10:00", registrations)).toBe(false);
  });

  it("warns when an active registration does not cover the weekday or full session time", () => {
    expect(shouldWarnUnavailableTeacher("2026-03-02", 2, "09:00", "10:00", registrations)).toBe(true);
    expect(shouldWarnUnavailableTeacher("2026-03-02", 1, "11:30", "12:30", registrations)).toBe(true);
  });
});
