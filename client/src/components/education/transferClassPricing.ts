export type TransferSourceSessionPricing = {
  sessionPrice?: string | number | null;
  sessionSource?: string | null;
  feePackage?: { fee?: string | number | null } | null;
  pricing?: {
    hasInvoiceAllocation?: boolean;
    hasPackageAdjustment?: boolean;
  } | null;
};

export function hasExistingSessionTuition(
  sessions: TransferSourceSessionPricing[],
  fallbackPackageFee: string | number | null | undefined,
): boolean {
  return sessions.some((session) => {
    if (
      session.pricing?.hasInvoiceAllocation
      || session.pricing?.hasPackageAdjustment
      || session.sessionSource === "transfer"
    ) {
      return true;
    }

    if (session.sessionPrice == null) return false;
    const storedPrice = Number(session.sessionPrice);
    const packageFee = Number(fallbackPackageFee ?? session.feePackage?.fee);
    return Number.isFinite(storedPrice)
      && Number.isFinite(packageFee)
      && Math.abs(storedPrice - packageFee) > 0.01;
  });
}

export function calculatePerSessionTransferTotal(
  perSessionFee: number,
  transferCount: number,
): number {
  return Math.max(0, Number(perSessionFee) || 0) * Math.max(0, Number(transferCount) || 0);
}

export function calculateFirstSessionPriceAfterDiscount(
  netTotal: number,
  registeredSessionCount: number,
): number {
  if (registeredSessionCount <= 0) return 0;
  return Number((Math.max(0, Number(netTotal) || 0) / registeredSessionCount).toFixed(2));
}