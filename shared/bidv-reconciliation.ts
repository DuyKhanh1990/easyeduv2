function parseDateParts(value: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Ngày không hợp lệ: ${value}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Ngày không hợp lệ: ${value}`);
  }
  return [year, month, day];
}

/**
 * BIDV reconciliation is T-1: requesting D+1 returns transactions for D.
 * This uses UTC calendar arithmetic so the result is not affected by the
 * server/browser timezone.
 */
export function getBidvRequestDate(reconcileDate: string): string {
  const [year, month, day] = parseDateParts(reconcileDate);
  const requestDate = new Date(Date.UTC(year, month - 1, day + 1));
  return [
    requestDate.getUTCFullYear(),
    String(requestDate.getUTCMonth() + 1).padStart(2, "0"),
    String(requestDate.getUTCDate()).padStart(2, "0"),
  ].join("-");
}