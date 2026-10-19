import { describe, expect, it } from "vitest";
import {
  buildStockQuantityMaps,
  buildWarehouseStockMovements,
} from "../server/lib/store-stock-quantity-maps";

describe("buildStockQuantityMaps", () => {
  it("produces no stock movement when a receipt quantity is unchanged", () => {
    const { oldQtyMap, newQtyMap } = buildStockQuantityMaps(
      [{ productId: "ta", productCode: "TA", productName: "Truyện Ants", quantity: 46 }],
      [{ productId: "ta", productCode: "TA", productName: "Truyện Ants", quantity: 46 }],
    );

    expect(newQtyMap.ta - oldQtyMap.ta.qty).toBe(0);
  });

  it("records only the difference when a quantity changes", () => {
    const { oldQtyMap, newQtyMap } = buildStockQuantityMaps(
      [{ productId: "ta", productCode: "TA", quantity: 46 }],
      [{ productId: "ta", productCode: "TA", quantity: 50 }],
    );

    expect(newQtyMap.ta - oldQtyMap.ta.qty).toBe(4);
  });

  it("matches a legacy old line without product ID by its unique product code", () => {
    const { oldQtyMap, newQtyMap } = buildStockQuantityMaps(
      [{ productCode: "TA", productName: "Truyện Ants", quantity: 46 }],
      [{ productId: "ta", productCode: "TA", productName: "Truyện Ants", quantity: 46 }],
    );

    expect(oldQtyMap.ta.qty).toBe(46);
    expect(newQtyMap.ta - oldQtyMap.ta.qty).toBe(0);
  });

  it("fails closed when a legacy item could match multiple products", () => {
    expect(() => buildStockQuantityMaps(
      [{ productCode: "TA", quantity: 46 }],
      [
        { productId: "ta-a", productCode: "TA", quantity: 30, colorId: "red" },
        { productId: "ta-b", productCode: "TA", quantity: 16, colorId: "blue" },
      ],
    )).toThrow("Không thể xác định duy nhất sản phẩm cũ TA");
  });

  it("tracks removal of one product and addition of another separately", () => {
    const { oldQtyMap, newQtyMap } = buildStockQuantityMaps(
      [{ productId: "old", productCode: "OLD", quantity: 5 }],
      [{ productId: "new", productCode: "NEW", quantity: 7 }],
    );

    expect((newQtyMap.old ?? 0) - oldQtyMap.old.qty).toBe(-5);
    expect(newQtyMap.new - (oldQtyMap.new?.qty ?? 0)).toBe(7);
  });

  it("records only the import difference in the same warehouse", () => {
    const { oldQtyMap, newQtyMap } = buildStockQuantityMaps(
      [{ productId: "ta", productCode: "TA", quantity: 46 }],
      [{ productId: "ta", productCode: "TA", quantity: 50 }],
    );

    expect(buildWarehouseStockMovements(oldQtyMap, newQtyMap, "wh-a", "wh-a", 1)).toEqual([
      { productId: "ta", warehouseId: "wh-a", quantityDelta: 4 },
    ]);
  });

  it("creates no warehouse movement when the quantity is unchanged", () => {
    const { oldQtyMap, newQtyMap } = buildStockQuantityMaps(
      [{ productId: "ta", productCode: "TA", quantity: 46 }],
      [{ productId: "ta", productCode: "TA", quantity: 46 }],
    );

    expect(buildWarehouseStockMovements(oldQtyMap, newQtyMap, "wh-a", "wh-a", 1)).toEqual([]);
  });

  it("reverses old warehouse and posts new warehouse quantities when moving a receipt", () => {
    const { oldQtyMap, newQtyMap } = buildStockQuantityMaps(
      [{ productId: "ta", productCode: "TA", quantity: 46 }],
      [{ productId: "ta", productCode: "TA", quantity: 50 }],
    );

    expect(buildWarehouseStockMovements(oldQtyMap, newQtyMap, "wh-a", "wh-b", 1)).toEqual([
      { productId: "ta", warehouseId: "wh-a", quantityDelta: -46 },
      { productId: "ta", warehouseId: "wh-b", quantityDelta: 50 },
    ]);
  });

  it("reverses an issue from its old warehouse and deducts it from the new one", () => {
    const { oldQtyMap, newQtyMap } = buildStockQuantityMaps(
      [{ productId: "ta", productCode: "TA", quantity: 10 }],
      [{ productId: "ta", productCode: "TA", quantity: 12 }],
    );

    expect(buildWarehouseStockMovements(oldQtyMap, newQtyMap, "wh-a", "wh-b", -1)).toEqual([
      { productId: "ta", warehouseId: "wh-a", quantityDelta: 10 },
      { productId: "ta", warehouseId: "wh-b", quantityDelta: -12 },
    ]);
  });
});
