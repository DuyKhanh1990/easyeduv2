import { describe, expect, it } from "vitest";
import { isValidScheduleDateRange } from "../../server/routes/classes.routes";

describe("schedule date-range validation", () => {
  it("accepts real, ordered YYYY-MM-DD calendar dates", () => {
    expect(isValidScheduleDateRange("2024-02-29", "2024-03-01")).toBe(true);
    expect(isValidScheduleDateRange("2026-09-24", "2026-09-24")).toBe(true);
  });

  it("rejects malformed dates, impossible days, non-string inputs, and reversed ranges", () => {
    expect(isValidScheduleDateRange("2025-02-29", "2025-03-01")).toBe(false);
    expect(isValidScheduleDateRange("2026-13-01", "2026-13-02")).toBe(false);
    expect(isValidScheduleDateRange("2026-09-24T00:00:00Z", "2026-09-25")).toBe(false);
    expect(isValidScheduleDateRange(undefined, "2026-09-25")).toBe(false);
    expect(isValidScheduleDateRange("2026-09-25", "2026-09-24")).toBe(false);
  });
});