import { describe, expect, it } from "vitest";
import {
  getPersonalScheduleCancellationCutoff,
  isPersonalScheduleRegistrationOpen,
} from "./personal-schedule-registration";

describe("personal schedule registration deadlines", () => {
  it("calculates cancellation cutoffs in Bangkok local time", () => {
    const cutoff = getPersonalScheduleCancellationCutoff("2026-11-27", "08:00:00", 4);
    expect(cutoff?.toISOString()).toBe("2026-11-26T21:00:00.000Z");
  });

  it("treats zero cancellation hours as the session start time", () => {
    const cutoff = getPersonalScheduleCancellationCutoff("2026-11-27", "08:00", 0);
    expect(cutoff?.toISOString()).toBe("2026-11-27T01:00:00.000Z");
  });

  it("requires the configured lead time before the session starts", () => {
    const now = Date.parse("2026-11-27T01:00:00.000Z");
    expect(isPersonalScheduleRegistrationOpen("2026-11-27", "12:00", 4, now)).toBe(true);
    expect(isPersonalScheduleRegistrationOpen("2026-11-27", "11:59", 4, now)).toBe(false);
  });
});
