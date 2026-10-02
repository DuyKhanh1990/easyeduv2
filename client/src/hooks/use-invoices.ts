import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getAuthHeaders } from "@/lib/queryClient";

export interface InvoiceQueryParams {
  tabFilter?: string;
  types?: string[];
  locationNames?: string[];
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  paidAtFrom?: string;
  paidAtTo?: string;
  categories?: string[];
  classNames?: string[];
  creatorNames?: string[];
  payerNames?: string[];
  commissionStaffNames?: string[];
  paymentMethods?: string[];
  sortKey?: string;
  sortDir?: "asc" | "desc";
  page?: number;
  limit?: number;
}

function buildQS(params: InvoiceQueryParams): string {
  const p = new URLSearchParams();
  if (params.tabFilter)  p.set("tabFilter",  params.tabFilter);
  if (params.search)     p.set("search",     params.search);
  if (params.dateFrom)    p.set("dateFrom",    params.dateFrom);
  if (params.dateTo)      p.set("dateTo",      params.dateTo);
  if (params.dueDateFrom) p.set("dueDateFrom", params.dueDateFrom);
  if (params.dueDateTo)   p.set("dueDateTo",   params.dueDateTo);
  if (params.paidAtFrom)  p.set("paidAtFrom",  params.paidAtFrom);
  if (params.paidAtTo)    p.set("paidAtTo",    params.paidAtTo);
  if (params.sortKey)    p.set("sortKey",    params.sortKey);
  if (params.sortDir)    p.set("sortDir",    params.sortDir);
  if (params.page)       p.set("page",       String(params.page));
  if (params.limit)      p.set("limit",      String(params.limit));
  p.set("includeTabCounts", "true");
  params.types?.forEach(v               => p.append("types",               v));
  params.locationNames?.forEach(v       => p.append("locationNames",       v));
  params.categories?.forEach(v          => p.append("categories",          v));
  params.classNames?.forEach(v          => p.append("classNames",          v));
  params.creatorNames?.forEach(v        => p.append("creatorNames",        v));
  params.payerNames?.forEach(v          => p.append("payerNames",          v));
  params.commissionStaffNames?.forEach(v=> p.append("commissionStaffNames",v));
  params.paymentMethods?.forEach(v      => p.append("paymentMethods",      v));
  return p.toString();
}

export async function fetchAllInvoicesForExport(queryParams: InvoiceQueryParams = {}): Promise<any[]> {
  const params = new URLSearchParams(buildQS(queryParams));
  params.delete("page");
  params.delete("limit");
  params.delete("includeTabCounts");

  const listKey = queryParams.tabFilter === "debt" ? BASE_KEY : MANAGED_KEY;
  const res = await fetch(`${listKey}?${params.toString()}`, {
    credentials: "include",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch invoices for export");

  const result = await res.json() as { data?: any[] };
  if (!Array.isArray(result.data)) throw new Error("Invalid invoice export response");
  return result.data;
}

export interface InvoiceSummary {
  expectedIncome: number;
  actualIncome: number;
  expectedExpense: number;
  actualExpense: number;
}

function shiftDateByMonth(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(year, month - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return formatDate(target);
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Builds the immediately preceding month range while preserving the
 * currently selected date span and all non-date filters.
 */
export function getPreviousInvoicePeriodParams(
  params: InvoiceQueryParams,
): InvoiceQueryParams | null {
  const dateRanges = [
    ["dateFrom", "dateTo"],
    ["dueDateFrom", "dueDateTo"],
    ["paidAtFrom", "paidAtTo"],
  ] as const;

  const activeRange = dateRanges.find(([from, to]) => params[from] || params[to]);
  if (!activeRange) return null;

  const [fromKey, toKey] = activeRange;
  return {
    ...params,
    dateFrom: undefined,
    dateTo: undefined,
    dueDateFrom: undefined,
    dueDateTo: undefined,
    paidAtFrom: undefined,
    paidAtTo: undefined,
    [fromKey]: params[fromKey] ? shiftDateByMonth(params[fromKey]!, -1) : undefined,
    [toKey]: params[toKey] ? shiftDateByMonth(params[toKey]!, -1) : undefined,
    page: undefined,
    limit: undefined,
    sortKey: undefined,
    sortDir: undefined,
  };
}

function buildSummaryQS(params: InvoiceQueryParams): string {
  const p = new URLSearchParams();
  if (params.search)    p.set("search", params.search);
  if (params.dateFrom)  p.set("dateFrom", params.dateFrom);
  if (params.dateTo)    p.set("dateTo", params.dateTo);
  if (params.dueDateFrom) p.set("dueDateFrom", params.dueDateFrom);
  if (params.dueDateTo)   p.set("dueDateTo", params.dueDateTo);
  if (params.paidAtFrom) p.set("paidAtFrom", params.paidAtFrom);
  if (params.paidAtTo)   p.set("paidAtTo", params.paidAtTo);
  params.locationNames?.forEach(v => p.append("locationNames", v));
  params.categories?.forEach(v => p.append("categories", v));
  params.classNames?.forEach(v => p.append("classNames", v));
  params.creatorNames?.forEach(v => p.append("creatorNames", v));
  params.payerNames?.forEach(v => p.append("payerNames", v));
  params.commissionStaffNames?.forEach(v => p.append("commissionStaffNames", v));
  params.paymentMethods?.forEach(v => p.append("paymentMethods", v));
  return p.toString();
}

const BASE_KEY = "/api/finance/invoices";
const SUMMARY_KEY = "/api/finance/invoices/summary";
const MANAGED_KEY = "/api/finance/invoices/managed";
const MANAGED_SUMMARY_KEY = "/api/finance/invoices/managed/summary";

export function useInvoiceSummary(
  queryParams: InvoiceQueryParams = {},
  options: { enabled?: boolean; staleTime?: number } = {},
) {
  const qs = buildSummaryQS(queryParams);
  const summaryKey = queryParams.tabFilter === "debt" ? SUMMARY_KEY : MANAGED_SUMMARY_KEY;
  const { data, isLoading } = useQuery<InvoiceSummary>({
    queryKey: [summaryKey, qs],
    queryFn: async () => {
      const res = await fetch(`${summaryKey}?${qs}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch invoice summary");
      return res.json();
    },
    staleTime: options.staleTime ?? 0,
    enabled: options.enabled ?? true,
  });

  return { summary: data, isLoading };
}

export function useInvoices(queryParams: InvoiceQueryParams = {}) {
  const qs = buildQS(queryParams);
  const listKey = queryParams.tabFilter === "debt" ? BASE_KEY : MANAGED_KEY;
  const queryKey = listKey === MANAGED_KEY
    ? [BASE_KEY, "managed", qs]
    : [BASE_KEY, qs];

  const { data, isLoading } = useQuery<{
    data: any[];
    total: number;
    parentTotal: number;
    tabCounts: Record<string, number>;
    rowPage?: { invoiceId: string; scheduleId: string | null }[];
  }>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`${listKey}?${qs}`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch invoices");
      return res.json();
    },
    staleTime: 0,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/finance/invoices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [BASE_KEY] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ invoiceId, status }: { invoiceId: string; status: string }) =>
      apiRequest("PATCH", `/api/finance/invoices/${invoiceId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [BASE_KEY] });
    },
  });

  return {
    invoices:            data?.data       ?? [],
    total:               data?.total      ?? 0,
    parentTotal:         data?.parentTotal ?? data?.total ?? 0,
    tabCounts:           data?.tabCounts  ?? { all: 0, unpaid: 0, partial: 0, paid: 0, confirmed: 0, debt: 0 },
    rowPage:             data?.rowPage,
    isLoading,
    deleteMutation,
    updateStatusMutation,
  };
}
