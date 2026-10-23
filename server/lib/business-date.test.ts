import { describe, expect, it } from "vitest";
import { getBusinessDateString } from "./business-date";

describe("getBusinessDateString", () => {
  it("uses the Vietnam calendar date instead of the UTC date near midnight", () => {
    expect(getBusinessDateString(new Date("2026-10-22T17:30:00.000Z"))).toBe("2026-10-23");
  });

  it("keeps the Vietnam date when UTC and local dates already match", () => {
    expect(getBusinessDateString(new Date("2026-10-23T03:00:00.000Z"))).toBe("2026-10-23");
  });
});
