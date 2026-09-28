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
};

export type ClassTransferInvoiceAllocation = {
  studentSessionId: string;
  allocatedAmount: NumericValue;
  invoiceStatus?: string | null;
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

function getPackageSessionValue(
  session: ClassTransferSourceSession,
  defaultPackage?: ClassTransferPackagePricing,
): number {
  const packageType = String(
    session.packageType
      ?? session.packageFeeType
      ?? defaultPackage?.type
      ?? "",
  ).toLocaleLowerCase("vi");
  const fee = toFiniteNumber(session.packageFee ?? defaultPackage?.fee);
  const sessionCount = toFiniteNumber(session.packageSessions ?? defaultPackage?.sessions);
  const packageTotal = toFiniteNumber(
    session.packageTotalAmount
      ?? defaultPackage?.totalAmount
      ?? fee,
  );
  const isCoursePackage = packageType === "course" || packageType.includes("kho");

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
}): number {
  const allocationBySession = new Map<string, number>();
  for (const allocation of input.allocations ?? []) {
    if (String(allocation.invoiceStatus ?? "").toLowerCase() === "cancelled") continue;
    allocationBySession.set(
      allocation.studentSessionId,
      (allocationBySession.get(allocation.studentSessionId) ?? 0)
        + toFiniteNumber(allocation.allocatedAmount),
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
    if (adjustmentBySession.has(session.id)) {
      return total + (adjustmentBySession.get(session.id) ?? 0);
    }
    if (allocationBySession.has(session.id)) {
      return total + (allocationBySession.get(session.id) ?? 0);
    }
    if (session.sessionPrice != null) {
      return total + toFiniteNumber(session.sessionPrice);
    }
    return total + getPackageSessionValue(session, input.defaultPackage);
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