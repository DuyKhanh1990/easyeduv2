import { describe, expect, it } from "vitest";
import { normalizeAttendanceDuration } from "@shared/attendance-limit-duration";

describe("normalizeAttendanceDuration", () => {
  it("converts 1500 minutes to one day, one hour, and zero minutes", () => {
    expect(normalizeAttendanceDuration(0, 0, 1500))
      .toEqual({ days: 1, hours: 1, minutes: 0 });
  });

  it("adds overflow minutes to an existing day value without changing total duration", () => {
    expect(normalizeAttendanceDuration(5, 0, 1500))
      .toEqual({ days: 6, hours: 1, minutes: 0 });
  });

  it("leaves already normalized legacy values unchanged", () => {
    expect(normalizeAttendanceDuration(5, 0, 15))
      .toEqual({ days: 5, hours: 0, minutes: 15 });
  });

  it("normalizes hour overflow as well", () => {
    expect(normalizeAttendanceDuration(0, 25, 60))
      .toEqual({ days: 1, hours: 2, minutes: 0 });
  });

  it("leaves negative values unchanged for API validation", () => {
    expect(normalizeAttendanceDuration(0, 0, -1))
      .toEqual({ days: 0, hours: 0, minutes: -1 });
  });
});
