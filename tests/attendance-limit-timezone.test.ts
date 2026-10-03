import { describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({ db: {} }));

import { formatAttendanceLimitDateTime } from "../server/lib/attendance-limit";

describe("attendance limit date formatting", () => {
  it("shows the Bangkok wall-clock date and time across a multi-day window", () => {
    expect(formatAttendanceLimitDateTime(new Date("2026-10-04T04:20:00.000Z")))
      .toBe("04/10/2026 11:20");
    expect(formatAttendanceLimitDateTime(new Date("2026-10-10T03:20:00.000Z")))
      .toBe("10/10/2026 10:20");
  });
});