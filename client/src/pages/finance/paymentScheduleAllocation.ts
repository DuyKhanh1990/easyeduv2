export interface InstallmentAllocation {
  id: string;
  status: string;
  amount: number;
  isAuto?: boolean;
}

const isSettled = (status: string) => status === "paid" || status === "confirmed";

export function rebalanceUnpaidInstallments<T extends InstallmentAllocation>(
  entries: T[],
  difference: number,
): T[] {
  if (Math.abs(difference) < 0.01) return entries;

  const autoIndex = entries.findIndex(entry => entry.isAuto && !isSettled(entry.status));
  if (difference > 0) {
    let targetIndex = autoIndex;
    if (targetIndex < 0) {
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        if (!isSettled(entries[index].status)) {
          targetIndex = index;
          break;
        }
      }
    }
    if (targetIndex < 0) return entries;
    return entries.map((entry, index) =>
      index === targetIndex ? { ...entry, amount: entry.amount + difference } : entry
    );
  }

  let excess = Math.abs(difference);
  const next = entries.map(entry => ({ ...entry }));
  const candidateIndexes = [
    ...(autoIndex >= 0 ? [autoIndex] : []),
    ...next
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry, index }) => !isSettled(entry.status) && index !== autoIndex)
      .map(({ index }) => index)
      .reverse(),
  ];
  for (const index of candidateIndexes) {
    if (excess <= 0) break;
    const reduction = Math.min(next[index].amount, excess);
    next[index].amount -= reduction;
    excess -= reduction;
  }
  if (excess > 0.01) return entries;
  return next.filter(entry => !(entry.isAuto && !isSettled(entry.status) && entry.amount <= 0));
}
