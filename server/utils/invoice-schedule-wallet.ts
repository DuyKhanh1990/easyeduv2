type ScheduleRow = {
  id: string;
  amount: string | number | null;
  sortOrder?: number | null;
};

function cents(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function overlap(start: number, end: number, rangeStart: number, rangeEnd: number): number {
  return Math.max(0, Math.min(end, rangeEnd) - Math.max(start, rangeStart));
}

/**
 * Assigns each child installment a stable share of the invoice's wallet
 * categories. The parent invoice is only used to calculate the category totals;
 * each returned amount belongs to one schedule row.
 */
export function allocateInvoiceWalletAmountsToSchedules(
  grandTotal: number,
  items: Array<{ category?: string | null; subtotal?: string | number | null }>,
  schedules: ScheduleRow[],
): Map<string, { tuition: number; deposit: number }> {
  const totalCents = Math.max(0, cents(grandTotal));
  const nonTuitionCents = (items ?? []).reduce((sum, item) =>
    (item.category ?? "").trim() === "Học phí" ? sum : sum + cents(item.subtotal), 0);
  const tuitionCents = Math.max(0, totalCents - nonTuitionCents);
  const depositCents = (items ?? []).reduce((sum, item) =>
    (item.category ?? "").trim() === "Đặt cọc" ? sum + cents(item.subtotal) : sum, 0);

  const result = new Map<string, { tuition: number; deposit: number }>();
  let cursor = 0;
  const ordered = [...schedules].sort((a, b) =>
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id));

  for (const schedule of ordered) {
    const start = cursor;
    const end = start + Math.max(0, cents(schedule.amount));
    const tuition = overlap(start, end, 0, Math.min(totalCents, tuitionCents));
    const depositStart = Math.min(totalCents, tuitionCents);
    const deposit = overlap(
      start,
      end,
      depositStart,
      Math.min(totalCents, depositStart + depositCents),
    );
    result.set(schedule.id, { tuition: tuition / 100, deposit: deposit / 100 });
    cursor = end;
  }

  return result;
}
