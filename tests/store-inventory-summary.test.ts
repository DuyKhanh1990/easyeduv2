import { describe, expect, it } from "vitest";
import { calculateStoreInventoryTotals } from "../client/src/pages/store/storeInventorySummary";

describe("store inventory summary totals", () => {
  it("nets a cancelled export against exports, not imports", () => {
    const totals = calculateStoreInventoryTotals({
      import_qty: 332,
      export_qty: -332,
      cancel_export_qty: 1,
    });

    expect(totals).toEqual({ totalImportQty: 332, totalExportQty: -331 });
    expect(totals.totalImportQty + totals.totalExportQty).toBe(1);
  });

  it("nets a cancelled import against imports, not exports", () => {
    const totals = calculateStoreInventoryTotals({
      import_qty: 332,
      export_qty: -331,
      cancel_import_qty: -1,
    });

    expect(totals).toEqual({ totalImportQty: 331, totalExportQty: -331 });
    expect(totals.totalImportQty + totals.totalExportQty).toBe(0);
  });

  it("reconciles transfers and signed adjustments to the stock delta", () => {
    const totals = calculateStoreInventoryTotals({
      import_qty: 12,
      export_qty: -9,
      transfer_in_qty: 4,
      transfer_out_qty: -2,
      adjustment_in_qty: 3,
      adjustment_out_qty: -5,
      cancel_export_qty: 1,
      cancel_import_qty: -2,
    });

    expect(totals.totalImportQty).toBe(17);
    expect(totals.totalExportQty).toBe(-15);
    expect(totals.totalImportQty + totals.totalExportQty).toBe(2);
  });
});
