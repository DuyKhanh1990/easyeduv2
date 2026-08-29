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

export interface InvoiceSummary {
  expectedIncome: number;
  actualIncome: number;
  expectedExpense: number;
  actualExpense: number;
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

export function useInvoiceSummary(queryParams: InvoiceQueryParams = {}) {
  const qs = buildSummaryQS(queryParams);
  const { data, isLoading } = useQuery<InvoiceSummary>({
    queryKey: [SUMMARY_KEY, qs],
    queryFn: async () => {
      const res = await fetch(`${SUMMARY_KEY}?${qs}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch invoice summary");
      return res.json();
    },
    staleTime: 0,
  });

  return { summary: data, isLoading };
}

export function useInvoices(queryParams: InvoiceQueryParams = {}) {
  const qs = buildQS(queryParams);
  const queryKey = [BASE_KEY, qs];

  const { data, isLoading } = useQuery<{ data: any[]; total: number; tabCounts: Record<string, number> }>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`${BASE_KEY}?${qs}`, { credentials: "include", headers: getAuthHeaders() });
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
    tabCounts:           data?.tabCounts  ?? { all: 0, unpaid: 0, partial: 0, paid: 0, debt: 0 },
    isLoading,
    deleteMutation,
    updateStatusMutation,
  };
}
