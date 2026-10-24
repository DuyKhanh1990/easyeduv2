import { describe, expect, it } from "vitest";
import { calculateHrBasePay } from "./hr-salary-calculation";

describe("calculateHrBasePay", () => {
  it("keeps the existing fixed-pay calculation", () => {
    expect(calculateHrBasePay({
      payType: "fixed",
      rate: 10_000_000,
      workedHours: 20,
      scheduledUnits: 22,
      actualUnits: 18.5,
    })).toBe(Math.round((10_000_000 / 22) * 18.5));
  });

  it("calculates hourly pay from actual recorded hours", () => {
    expect(calculateHrBasePay({
      payType: "hourly",
      rate: 50_000,
      workedHours: 7.5,
      scheduledUnits: 22,
      actualUnits: 18.5,
    })).toBe(375_000);
  });

  it("does not produce negative hourly pay", () => {
    expect(calculateHrBasePay({
      payType: "hourly",
      rate: 50_000,
      workedHours: -1,
      scheduledUnits: 0,
      actualUnits: 0,
    })).toBe(0);
  });
});
