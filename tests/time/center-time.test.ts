import { describe, expect, it } from "vitest";
import {
  formatCenterInstant,
  getCenterDateKey,
  isInstantInCenterDateRange,
  shiftCalendarDateKey,
  validateCenterTimeZone,
} from "@shared/center-time";
import { parseStoredVietnamTimestamp } from "../../client/src/lib/vietnam-time";

describe("center time and legacy Vietnam timestamps", () => {
  it("converts a legacy synthetic-Z wall clock exactly once", () => {
    const created = parseStoredVietnamTimestamp("2026-09-24T11:52:58.444Z");
    expect(created?.toISOString()).toBe("2026-09-24T04:52:58.444Z");
    const label = formatCenterInstant(created!, "Asia/Ho_Chi_Minh", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    expect(label).toContain("24/09/2026");
    expect(label).toContain("11:52");

    // The same row's updated_at was written by a JS Date (already UTC-naive).
    const updated = new Date("2026-09-24T04:53:26.792Z");
    expect(formatCenterInstant(updated, "Asia/Ho_Chi_Minh", {
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    })).toContain("11:53");
  });

  it("uses the center's day rather than the browser or server day", () => {
    const instant = new Date("2026-09-24T17:30:00.000Z");
    expect(getCenterDateKey(instant, "Asia/Ho_Chi_Minh")).toBe("2026-09-25");
    expect(getCenterDateKey(instant, "UTC")).toBe("2026-09-24");

    const now = new Date("2026-09-24T17:35:00.000Z");
    const previousCenterDay = new Date("2026-09-24T16:30:00.000Z");
    expect(isInstantInCenterDateRange(previousCenterDay, "today", "Asia/Ho_Chi_Minh", now)).toBe(false);
    expect(isInstantInCenterDateRange(previousCenterDay, "today", "UTC", now)).toBe(true);
    expect(isInstantInCenterDateRange(previousCenterDay, "7d", "Asia/Ho_Chi_Minh", now)).toBe(true);
  });

  it("shifts calendar dates without the device's timezone or DST arithmetic", () => {
    expect(shiftCalendarDateKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftCalendarDateKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(() => shiftCalendarDateKey("2026-02-30", 1)).toThrow();
  });

  it("rejects invalid center zones instead of silently using the device zone", () => {
    expect(validateCenterTimeZone("Asia/Ho_Chi_Minh")).toBe("Asia/Ho_Chi_Minh");
    expect(() => validateCenterTimeZone("Not/A_Time_Zone")).toThrow();
    expect(() => validateCenterTimeZone(" Asia/Ho_Chi_Minh ")).toThrow();
  });
});