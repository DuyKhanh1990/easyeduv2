export type StoreInventorySummaryData = Partial<Record<
  | "import_qty"
  | "export_qty"
  | "transfer_in_qty"
  | "transfer_out_qty"
  | "cancel_export_qty"
  | "cancel_import_qty"
  | "adjustment_in_qty"
  | "adjustment_out_qty",
  number | string | null
>>;

function quantity(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculateStoreInventoryTotals(summary: StoreInventorySummaryData) {
  return {
    // Cancellation deltas are already signed: cancel_import is negative.
    totalImportQty:
      quantity(summary.import_qty) +
      quantity(summary.transfer_in_qty) +
      quantity(summary.adjustment_in_qty) +
      quantity(summary.cancel_import_qty),
    // Export and adjustment-out deltas are negative; cancel_export is positive.
    totalExportQty:
      quantity(summary.export_qty) +
      quantity(summary.transfer_out_qty) +
      quantity(summary.adjustment_out_qty) +
      quantity(summary.cancel_export_qty),
  };
}
