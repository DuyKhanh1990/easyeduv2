import { describe, expect, it } from "vitest";
import { summarizeSchedulePromotions } from "./schedulePromotionSummary";

describe("summarizeSchedulePromotions", () => {
  it("leaves installment-only surcharges on the existing path when there is no installment promotion", () => {
    expect(summarizeSchedulePromotions([
      { promotionAmount: 0, surchargeAmount: 25 },
      { promotionAmount: "0", surchargeAmount: "10" },
    ])).toEqual({
      hasPromotion: false,
      promotionTotal: 0,
      surchargeTotal: 0,
    });
  });

  it("aggregates only the child adjustments when at least one installment has a promotion", () => {
    expect(summarizeSchedulePromotions([
      { promotionAmount: 100, surchargeAmount: 10 },
      { promotionAmount: "25.5", surchargeAmount: "4.5" },
      { promotionAmount: 0, surchargeAmount: 50 },
    ])).toEqual({
      hasPromotion: true,
      promotionTotal: 125.5,
      surchargeTotal: 64.5,
    });
  });
});
