type StockItemLike = {
  productId?: string | null;
  product_id?: string | null;
  productCode?: string | null;
  product_code?: string | null;
  productName?: string | null;
  product_name?: string | null;
  quantity: number | string | null;
  categoryId?: string | null;
  category_id?: string | null;
  colorId?: string | null;
  color_id?: string | null;
  sizeId?: string | null;
  size_id?: string | null;
  unitId?: string | null;
  unit_id?: string | null;
};

export type StockQuantityMap = {
  oldQtyMap: Record<string, { qty: number; name: string }>;
  newQtyMap: Record<string, number>;
};

export type WarehouseStockMovement = {
  productId: string;
  warehouseId: string;
  quantityDelta: number;
};

export class StockQuantityMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockQuantityMappingError";
  }
}

function readField(
  item: StockItemLike,
  camelKey: keyof StockItemLike,
  snakeKey: keyof StockItemLike,
): string | null {
  const value = item[camelKey] ?? item[snakeKey];
  return value == null || value === "" ? null : String(value);
}

function productCodeKey(item: StockItemLike): string | null {
  return readField(item, "productCode", "product_code")?.trim().toUpperCase() ?? null;
}

function variantDimensions(item: StockItemLike): string[] {
  return [
    readField(item, "categoryId", "category_id") ?? "",
    readField(item, "colorId", "color_id") ?? "",
    readField(item, "sizeId", "size_id") ?? "",
    readField(item, "unitId", "unit_id") ?? "",
  ];
}

function quantity(item: StockItemLike): number {
  const value = Number(item.quantity ?? 0);
  if (!Number.isFinite(value)) {
    throw new Error("Stock item quantity must be a finite number");
  }
  return value;
}

/**
 * Aggregate old and new receipt/issue lines by product ID.
 *
 * Older lines may have no product_id. They can be matched to a new product
 * only when product code and variant dimensions identify exactly one product.
 * Ambiguous matches fail closed instead of silently treating the old quantity
 * as zero and posting the full new quantity again.
 */
export function buildStockQuantityMaps(
  oldItems: StockItemLike[],
  newItems: StockItemLike[],
): StockQuantityMap {
  const oldQtyMap: StockQuantityMap["oldQtyMap"] = {};
  const newQtyMap: StockQuantityMap["newQtyMap"] = {};
  const newItemsByCode = new Map<string, StockItemLike[]>();

  for (const item of newItems) {
    const productId = readField(item, "productId", "product_id");
    if (!productId) continue;

    newQtyMap[productId] = (newQtyMap[productId] ?? 0) + quantity(item);
    const code = productCodeKey(item);
    if (code) {
      const candidates = newItemsByCode.get(code) ?? [];
      candidates.push(item);
      newItemsByCode.set(code, candidates);
    }
  }

  for (const item of oldItems) {
    let productId = readField(item, "productId", "product_id");
    if (!productId) {
      const code = productCodeKey(item);
      const oldDimensions = variantDimensions(item);
      const matchingIds = new Set(
        (code ? newItemsByCode.get(code) ?? [] : [])
          .filter((candidate) => {
            const candidateDimensions = variantDimensions(candidate);
            return oldDimensions.every((dimension, index) =>
              !dimension || dimension === candidateDimensions[index],
            );
          })
          .map((candidate) => readField(candidate, "productId", "product_id"))
          .filter((id): id is string => Boolean(id)),
      );
      if (matchingIds && matchingIds.size > 1) {
        throw new StockQuantityMappingError(
          `Không thể xác định duy nhất sản phẩm cũ ${code ?? "không rõ mã"}; vui lòng kiểm tra dòng phiếu trước khi lưu.`,
        );
      }
      productId = matchingIds?.values().next().value ?? null;
    }
    if (!productId) continue;

    const name = readField(item, "productName", "product_name") ?? productId;
    const previous = oldQtyMap[productId];
    oldQtyMap[productId] = {
      qty: (previous?.qty ?? 0) + quantity(item),
      name: previous?.name ?? name,
    };
  }

  return { oldQtyMap, newQtyMap };
}

export function buildWarehouseStockMovements(
  oldQtyMap: StockQuantityMap["oldQtyMap"],
  newQtyMap: StockQuantityMap["newQtyMap"],
  oldWarehouseId: string,
  newWarehouseId: string,
  stockDirection: 1 | -1,
): WarehouseStockMovement[] {
  const movements: WarehouseStockMovement[] = [];
  const productIds = new Set([...Object.keys(oldQtyMap), ...Object.keys(newQtyMap)]);

  for (const productId of productIds) {
    const oldQty = oldQtyMap[productId]?.qty ?? 0;
    const newQty = newQtyMap[productId] ?? 0;
    if (oldWarehouseId === newWarehouseId) {
      const quantityDelta = (newQty - oldQty) * stockDirection;
      if (quantityDelta !== 0) movements.push({ productId, warehouseId: oldWarehouseId, quantityDelta });
      continue;
    }

    const oldWarehouseDelta = -oldQty * stockDirection;
    const newWarehouseDelta = newQty * stockDirection;
    if (oldWarehouseDelta !== 0) movements.push({ productId, warehouseId: oldWarehouseId, quantityDelta: oldWarehouseDelta });
    if (newWarehouseDelta !== 0) movements.push({ productId, warehouseId: newWarehouseId, quantityDelta: newWarehouseDelta });
  }

  return movements;
}
