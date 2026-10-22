function parseStoredQuantity(value: unknown): number | null {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const text = String(value).trim();
  const numericValue = Number(text);
  if (text !== "" && Number.isFinite(numericValue)) return numericValue;

  const match = /\bSL:\s*(-?\d+(?:\.\d+)?)/i.exec(text);
  if (!match) return null;

  const quantity = Number(match[1]);
  return Number.isFinite(quantity) ? quantity : null;
}

/**
 * Calculate a display-only quantity delta from the before/after values stored
 * in a store receipt audit event. Returns null for fields unrelated to quantity.
 */
export function getStoreAuditQuantityDelta(
  field: string,
  before: unknown,
  after: unknown,
): number | null {
  if (field === "Tổng số lượng") {
    const previousQuantity = parseStoredQuantity(before);
    const nextQuantity = parseStoredQuantity(after);
    return previousQuantity === null || nextQuantity === null
      ? null
      : nextQuantity - previousQuantity;
  }

  if (!field.startsWith("📦")) return null;

  const previousQuantity = parseStoredQuantity(before);
  const nextQuantity = parseStoredQuantity(after);
  return previousQuantity === null || nextQuantity === null
    ? null
    : nextQuantity - previousQuantity;
}

export function formatStoreAuditQuantityDelta(delta: number): string {
  const normalized = Object.is(delta, -0) ? 0 : delta;
  const formatted = normalized.toLocaleString("vi-VN", {
    maximumFractionDigits: 6,
  });
  return normalized > 0 ? `+${formatted}` : formatted;
}
