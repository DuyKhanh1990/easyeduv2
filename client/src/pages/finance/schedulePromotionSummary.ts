export interface SchedulePromotionEntry {
  promotionAmount?: number | string | null;
  surchargeAmount?: number | string | null;
}

export function summarizeSchedulePromotions(entries: SchedulePromotionEntry[]) {
  const promotionTotal = entries.reduce(
    (sum, entry) => sum + (Number(entry.promotionAmount) || 0),
    0,
  );
  if (promotionTotal <= 0) {
    return { hasPromotion: false, promotionTotal: 0, surchargeTotal: 0 };
  }

  return {
    hasPromotion: true,
    promotionTotal,
    surchargeTotal: entries.reduce(
      (sum, entry) => sum + (Number(entry.surchargeAmount) || 0),
      0,
    ),
  };
}
