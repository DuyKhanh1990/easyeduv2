import type { DateRange } from "./StoreDateRangePicker";

export interface StoreReceiptListFilters {
  search: string;
  dateRange: DateRange;
  locationId: string;
  warehouseId: string;
  supplierId?: string;
  status: string;
  productCodes: string[];
  productNames: string[];
}

function toDateTimeBound(date: Date | undefined, endOfDay: boolean): string | undefined {
  if (!date) return undefined;
  const bound = new Date(date);
  if (endOfDay) bound.setHours(23, 59, 59, 999);
  else bound.setHours(0, 0, 0, 0);
  return bound.toISOString();
}

export function buildStoreReceiptListUrl(
  endpoint: string,
  filters: StoreReceiptListFilters,
  page?: number,
  pageSize?: number,
  exportAll = false,
): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  const dateFrom = toDateTimeBound(filters.dateRange.from, false);
  const dateTo = toDateTimeBound(filters.dateRange.to, true);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  if (filters.locationId !== "all") params.set("locationId", filters.locationId);
  if (filters.warehouseId !== "all") params.set("warehouseId", filters.warehouseId);
  if (filters.supplierId && filters.supplierId !== "all") params.set("supplierId", filters.supplierId);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.productCodes.length) params.set("productCodes", JSON.stringify(filters.productCodes));
  if (filters.productNames.length) params.set("productNames", JSON.stringify(filters.productNames));
  if (exportAll) {
    params.set("exportAll", "true");
  } else {
    params.set("limit", String(pageSize ?? 20));
    params.set("offset", String(((page ?? 1) - 1) * (pageSize ?? 20)));
  }
  return `${endpoint}?${params.toString()}`;
}
