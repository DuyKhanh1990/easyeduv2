type NumericValue = number | string | null | undefined;

export type ClassTransferPackagePricing = {
  fee?: NumericValue;
  type?: string | null;
  sessions?: NumericValue;
  totalAmount?: NumericValue;
};

export type ClassTransferSourceSession = {
  id: string;
  sessionPrice?: NumericValue;
  packageType?: string | null;
  packageFee?: NumericValue;
  packageFeeType?: string | null;
  packageSessions?: NumericValue;
  packageTotalAmount?: NumericValue;
  transferPriceOverride?: NumericValue;
};

export type ClassTransferInvoiceAllocation = {
  allocationId?: string | null;
  invoiceItemId?: string | null;
  studentSessionId: string;
  allocatedAmount: NumericValue;
  invoiceStatus?: string | null;
  itemPackageType?: string | null;
  itemQuantity?: NumericValue;
  itemSurchargeAmount?: NumericValue;
  sessionOrder?: NumericValue;
  surchargeOnly?: boolean;
};

export type ClassTransferUnallocatedSurchargeItem = {
  invoiceItemId: string;
  invoiceStatus?: string | null;
  itemPackageType?: string | null;
  itemQuantity?: NumericValue;
  itemSurchargeAmount?: NumericValue;
};

export type ClassTransferSurchargeCandidateSession = {
  id: string;
  sessionOrder?: NumericValue;
};

export type ClassTransferSessionAdjustment = {
  studentSessionId: string;
  effectiveAmount: NumericValue;
  appliedSequence: number;
};

export type ClassTransferRoundingMode = "none" | "down" | "up";

function toFiniteNumber(value: NumericValue, fallback = 0): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getClassTransferInvoiceSurchargeShares(
  allocations: ClassTransferInvoiceAllocation[],
): number[] {
  const shares = allocations.map(() => 0);
  const rowsByItem = new Map<string, number[]>();

  allocations.forEach((allocation, index) => {
    if (toFiniteNumber(allocation.itemSurchargeAmount) <= 0) return;
    const itemKey = allocation.invoiceItemId ?? allocation.allocationId;
    if (!itemKey) return;
    const rows = rowsByItem.get(itemKey) ?? [];
    rows.push(index);
    rowsByItem.set(itemKey, rows);
  });

  for (const rowIndexes of rowsByItem.values()) {
    const firstAllocation = allocations[rowIndexes[0]];
    const packageType = String(firstAllocation.itemPackageType ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("vi");
    const isPerSessionPackage = packageType === "buoi";
    const denominator = isPerSessionPackage
      ? Math.max(1, Math.floor(toFiniteNumber(firstAllocation.itemQuantity, 1)))
      : rowIndexes.length;
    const surchargeCents = Math.round(
      Math.max(0, toFiniteNumber(firstAllocation.itemSurchargeAmount)) * 100,
    );
    if (denominator <= 0 || surchargeCents <= 0) continue;

    const orderedIndexes = [...rowIndexes].sort((leftIndex, rightIndex) => {
      const leftOrder = Number(allocations[leftIndex].sessionOrder);
      const rightOrder = Number(allocations[rightIndex].sessionOrder);
      const normalizedLeftOrder = Number.isFinite(leftOrder) ? leftOrder : Number.POSITIVE_INFINITY;
      const normalizedRightOrder = Number.isFinite(rightOrder) ? rightOrder : Number.POSITIVE_INFINITY;
      if (normalizedLeftOrder !== normalizedRightOrder) {
        return normalizedLeftOrder - normalizedRightOrder;
      }
      return String(allocations[leftIndex].allocationId ?? leftIndex)
        .localeCompare(String(allocations[rightIndex].allocationId ?? rightIndex));
    });

    const baseCents = Math.floor(surchargeCents / denominator);
    const remainderCents = surchargeCents - baseCents * denominator;
    orderedIndexes.forEach((allocationIndex, position) => {
      const receivesRemainder = position >= denominator - remainderCents;
      shares[allocationIndex] =
        (baseCents + (receivesRemainder ? 1 : 0)) / 100;
    });
  }

  return shares;
}

export function buildClassTransferSurchargeOnlyAllocations(
  items: ClassTransferUnallocatedSurchargeItem[],
  sessions: ClassTransferSurchargeCandidateSession[],
): ClassTransferInvoiceAllocation[] {
  const orderedSessions = [...sessions].sort((left, right) => {
    const leftOrder = Number(left.sessionOrder);
    const rightOrder = Number(right.sessionOrder);
    const normalizedLeftOrder = Number.isFinite(leftOrder) ? leftOrder : Number.POSITIVE_INFINITY;
    const normalizedRightOrder = Number.isFinite(rightOrder) ? rightOrder : Number.POSITIVE_INFINITY;
    if (normalizedLeftOrder !== normalizedRightOrder) {
      return normalizedLeftOrder - normalizedRightOrder;
    }
    return left.id.localeCompare(right.id);
  });

  return items.flatMap((item) => {
    if (toFiniteNumber(item.itemSurchargeAmount) <= 0) return [];
    const requestedCount = Math.max(1, Math.floor(toFiniteNumber(item.itemQuantity, 1)));
    return orderedSessions.slice(0, requestedCount).map((session) => ({
      allocationId: `${item.invoiceItemId}:${session.id}`,
      invoiceItemId: item.invoiceItemId,
      studentSessionId: session.id,
      allocatedAmount: 0,
      invoiceStatus: item.invoiceStatus,
      itemPackageType: item.itemPackageType,
      itemQuantity: item.itemQuantity,
      itemSurchargeAmount: item.itemSurchargeAmount,
      sessionOrder: session.sessionOrder,
      surchargeOnly: true,
    }));
  });
}

export function getPackageSessionValue(
  session: ClassTransferSourceSession,
  defaultPackage?: ClassTransferPackagePricing,
): number {
  const packageType = String(
    session.packageType
      ?? session.packageFeeType
      ?? defaultPackage?.type
      ?? "",
  )
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi");
  const fee = toFiniteNumber(session.packageFee ?? defaultPackage?.fee);
  const sessionCount = toFiniteNumber(session.packageSessions ?? defaultPackage?.sessions);
  const packageTotal = toFiniteNumber(
    session.packageTotalAmount
      ?? defaultPackage?.totalAmount
      ?? fee,
  );
  const isCoursePackage = packageType === "course" || packageType.includes("khoa");

  return isCoursePackage
    ? sessionCount > 0 ? packageTotal / sessionCount : 0
    : fee;
}

export function calculateClassTransferSourceCredit(input: {
  sessions: ClassTransferSourceSession[];
  allocations?: ClassTransferInvoiceAllocation[];
  adjustments?: ClassTransferSessionAdjustment[];
  defaultPackage?: ClassTransferPackagePricing;
  roundingMode?: ClassTransferRoundingMode;
  excludeSurcharge?: boolean;
}): number {
  const allocationBySession = new Map<string, number>();
  const surchargeBySession = new Map<string, number>();
  const surchargeShares = getClassTransferInvoiceSurchargeShares(input.allocations ?? []);
  for (const [index, allocation] of (input.allocations ?? []).entries()) {
    if (String(allocation.invoiceStatus ?? "").toLowerCase() === "cancelled") continue;
    if (!allocation.surchargeOnly) {
      allocationBySession.set(
        allocation.studentSessionId,
        (allocationBySession.get(allocation.studentSessionId) ?? 0)
          + toFiniteNumber(allocation.allocatedAmount),
      );
    }
    surchargeBySession.set(
      allocation.studentSessionId,
      (surchargeBySession.get(allocation.studentSessionId) ?? 0) + surchargeShares[index],
    );
  }

  const adjustmentBySession = new Map<string, number>();
  for (const adjustment of [...(input.adjustments ?? [])]
    .sort((left, right) => left.appliedSequence - right.appliedSequence)) {
    adjustmentBySession.set(
      adjustment.studentSessionId,
      toFiniteNumber(adjustment.effectiveAmount),
    );
  }

  const sourceCredit = input.sessions.reduce((total, session) => {
    let effectiveAmount: number;
    if (adjustmentBySession.has(session.id)) {
      effectiveAmount = adjustmentBySession.get(session.id) ?? 0;
    } else if (allocationBySession.has(session.id)) {
      effectiveAmount = allocationBySession.get(session.id) ?? 0;
    } else if (session.transferPriceOverride != null) {
      effectiveAmount = toFiniteNumber(session.transferPriceOverride);
    } else if (session.sessionPrice != null) {
      effectiveAmount = toFiniteNumber(session.sessionPrice);
    } else {
      effectiveAmount = getPackageSessionValue(session, input.defaultPackage);
    }
    if (input.excludeSurcharge) {
      effectiveAmount = Math.max(
        0,
        effectiveAmount - (surchargeBySession.get(session.id) ?? 0),
      );
    }
    return total + effectiveAmount;
  }, 0);

  const rounded = input.roundingMode === "down"
    ? Math.floor(sourceCredit)
    : input.roundingMode === "up"
      ? Math.ceil(sourceCredit)
      : sourceCredit;

  return Number(Math.max(0, rounded).toFixed(2));
}

export function calculateClassTransferTargetSessionPrice(
  targetPackage: ClassTransferPackagePricing | null | undefined,
  override?: number,
): number | null {
  if (!targetPackage) return null;

  const sessionCount = toFiniteNumber(targetPackage.sessions);
  const packageTotal = toFiniteNumber(targetPackage.totalAmount ?? targetPackage.fee);
  const isCoursePackage = ["khoá", "khóa"].includes(
    String(targetPackage.type ?? "").toLocaleLowerCase("vi"),
  );
  const basePrice = isCoursePackage && sessionCount > 0
    ? packageTotal / sessionCount
    : toFiniteNumber(targetPackage.fee);

  return Number((override ?? basePrice ?? 0).toFixed(2));
}

type ClassTransferPaidInvoice = {
  classId: string | null;
  paidAmount: NumericValue;
};

type ClassTransferWalletEntry = {
  classId: string | null;
  type: string;
  amount: NumericValue;
};

export function calculateClassFundedAmounts(input: {
  paidInvoices: ClassTransferPaidInvoice[];
  transferWalletEntries: ClassTransferWalletEntry[];
  paidRefundInvoices: ClassTransferPaidInvoice[];
}): Map<string, number> {
  const paidByClass = new Map<string, number>();
  const transferAdjustmentByClass = new Map<string, number>();

  for (const invoice of input.paidInvoices) {
    if (!invoice.classId) continue;
    paidByClass.set(
      invoice.classId,
      (paidByClass.get(invoice.classId) ?? 0) + toFiniteNumber(invoice.paidAmount),
    );
  }

  for (const entry of input.transferWalletEntries) {
    if (!entry.classId) continue;
    const adjustment = toFiniteNumber(entry.amount) * (entry.type === "credit" ? 1 : -1);
    transferAdjustmentByClass.set(
      entry.classId,
      (transferAdjustmentByClass.get(entry.classId) ?? 0) + adjustment,
    );
  }

  for (const refund of input.paidRefundInvoices) {
    if (!refund.classId) continue;
    transferAdjustmentByClass.set(
      refund.classId,
      (transferAdjustmentByClass.get(refund.classId) ?? 0) - toFiniteNumber(refund.paidAmount),
    );
  }

  const classIds = new Set([...paidByClass.keys(), ...transferAdjustmentByClass.keys()]);
  return new Map(
    [...classIds].map((classId) => [
      classId,
      (paidByClass.get(classId) ?? 0) + (transferAdjustmentByClass.get(classId) ?? 0),
    ]),
  );
}