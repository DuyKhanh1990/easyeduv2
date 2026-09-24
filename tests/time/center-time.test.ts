import { describe, expect, it } from "vitest";
import {
  formatCenterInstant,
  getCenterDateKey,
  isInstantInCenterDateRange,
  shiftCalendarDateKey,
  validateCenterTimeZone,
} from "@shared/center-time";
import {
  formatStoredVietnamTimestamp,
  parseStoredVietnamTimestamp,
} from "../../client/src/lib/vietnam-time";

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

  it("demonstrates the different legacy display behavior of DB-default and JS-Date values", () => {
    const options: Intl.DateTimeFormatOptions = {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    };

    // Representative development rows from database_backups:
    // requested_at is DB-default Vietnam wall time; started_at is a JS Date
    // whose UTC clock components were stored in a legacy-naive column.
    const requestedAtRaw = "2026-09-24T00:29:59.997Z";
    const startedAtRaw = "2026-09-23T17:30:00.007Z";

    expect(formatStoredVietnamTimestamp(requestedAtRaw, options))
      .toContain("24/09/2026");
    expect(formatStoredVietnamTimestamp(requestedAtRaw, options))
      .toContain("00:29");

    // This shows the current legacy helper cannot be applied to both sources.
    expect(formatStoredVietnamTimestamp(startedAtRaw, options))
      .toContain("23/09/2026");
    expect(formatStoredVietnamTimestamp(startedAtRaw, options))
      .toContain("17:30");

    // After source-aware conversion, both display in the Center's local time.
    expect(formatCenterInstant(
      new Date("2026-09-23T17:29:59.997Z"),
      "Asia/Ho_Chi_Minh",
      options,
    )).toContain("24/09/2026");
    expect(formatCenterInstant(
      new Date("2026-09-23T17:30:00.007Z"),
      "Asia/Ho_Chi_Minh",
      options,
    )).toContain("00:30");
  });

  it("keeps task creation times unchanged in the Center after the grouped migration", () => {
    const options: Intl.DateTimeFormatOptions = {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    };
    const samples = [
      {
        field: "tasks.created_at",
        legacy: "2026-04-04T09:29:51.953Z",
        instant: "2026-04-04T02:29:51.953Z",
        clock: "09:29",
      },
      {
        field: "task_comments.created_at",
        legacy: "2026-04-04T09:30:08.641Z",
        instant: "2026-04-04T02:30:08.641Z",
        clock: "09:30",
      },
    ];

    for (const sample of samples) {
      const legacyInstant = parseStoredVietnamTimestamp(sample.legacy);
      const migratedInstant = new Date(sample.instant);
      expect(legacyInstant?.getTime(), sample.field).toBe(migratedInstant.getTime());
      expect(formatStoredVietnamTimestamp(sample.legacy, options), sample.field)
        .toContain(sample.clock);
      expect(formatCenterInstant(migratedInstant, "Asia/Ho_Chi_Minh", options), sample.field)
        .toContain(sample.clock);
    }
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