import { describe, expect, it } from "vitest";
import { getBidvRequestDate } from "@shared/bidv-reconciliation";

describe("BIDV T-1 reconciliation date", () => {
  it("requests the next calendar date for a normal day", () => {
    expect(getBidvRequestDate("2026-08-07")).toBe("2026-08-08");
  });

  it("handles month and year boundaries", () => {
    expect(getBidvRequestDate("2026-08-31")).toBe("2026-09-01");
    expect(getBidvRequestDate("2026-12-31")).toBe("2027-01-01");
  });

  it("rejects invalid dates", () => {
    expect(() => getBidvRequestDate("2026-02-30")).toThrow();
  });
});