import { describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({ db: {} }));

import {
  isWithinAttendanceTimeLimit,
  isWithinMinuteRange,
  shouldApplyAttendanceLimit,
} from "../server/lib/attendance-limit";

describe("attendance limit role scope", () => {
  it("does not apply to any role when none are selected", () => {
    expect(shouldApplyAttendanceLimit([], ["teacher-role"])).toBe(false);
  });

  it("applies when a user has at least one selected role", () => {
    expect(shouldApplyAttendanceLimit(
      ["teacher-role", "manager-role"],
      ["teacher-role", "other-role"],
    )).toBe(true);
  });

  it("does not apply to a user with no selected role", () => {
    expect(shouldApplyAttendanceLimit(["teacher-role"], ["other-role"])).toBe(false);
  });

  it("always bypasses the limit for Super Admin", () => {
    expect(shouldApplyAttendanceLimit(["teacher-role"], ["teacher-role"], true)).toBe(false);
  });
});

describe("attendance limit time window", () => {
  const start = new Date("2026-10-12T03:00:00.000Z");

  it("allows the scheduled start minute when both limits are zero", () => {
    expect(isWithinAttendanceTimeLimit(start, start, 0, 0)).toBe(true);
    expect(isWithinAttendanceTimeLimit(
      new Date(start.getTime() + 1),
      start,
      0,
      0,
    )).toBe(true);
    expect(isWithinAttendanceTimeLimit(
      new Date(start.getTime() + 59_999),
      start,
      0,
      0,
    )).toBe(true);
    expect(isWithinAttendanceTimeLimit(
      new Date(start.getTime() + 60_000),
      start,
      0,
      0,
    )).toBe(false);
    expect(isWithinAttendanceTimeLimit(
      new Date(start.getTime() - 1),
      start,
      0,
      0,
    )).toBe(false);
  });

  it("compares configured bounds using hour/minute precision", () => {
    expect(isWithinAttendanceTimeLimit(
      new Date(start.getTime() - 1),
      start,
      60,
      60,
    )).toBe(true);
    expect(isWithinAttendanceTimeLimit(
      new Date(start.getTime() + 119_999),
      start,
      60,
      60,
    )).toBe(true);
    expect(isWithinAttendanceTimeLimit(
      new Date(start.getTime() + 120_000),
      start,
      60,
      60,
    )).toBe(false);
  });

  it("compares the QR visibility range at minute precision too", () => {
    const start = new Date("2026-10-12T03:00:00.000Z");
    expect(isWithinMinuteRange(
      new Date(start.getTime() + 59_999),
      start,
      start,
    )).toBe(true);
    expect(isWithinMinuteRange(
      new Date(start.getTime() + 60_000),
      start,
      start,
    )).toBe(false);
  });
});
