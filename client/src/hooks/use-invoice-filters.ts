import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { InvoiceQueryParams } from "./use-invoices";

export type SortKey =
  | "branch" | "code" | "settleCode" | "type" | "name" | "category"
  | "totalAmount" | "totalPromotion" | "totalSurcharge" | "grandTotal"
  | "description" | "status" | "dueDate" | "createdAt" | "updatedAt" | "commission" | "paidAt";

export interface InvoiceFilters {
  branches: string[];
  types: string[];
  categories: string[];
  classes: string[];
  creators: string[];
  payers: string[];
  commissions: string[];
  paymentMethods: string[];
}

export const DEFAULT_FILTERS: InvoiceFilters = {
  branches: [], types: [], categories: [], classes: [],
  creators: [], payers: [], commissions: [], paymentMethods: [],
};

export const hasActiveFilters = (f: InvoiceFilters) =>
  Object.values(f).some(arr => arr.length > 0);

function defaultCurrentMonth(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from, to };
}

const TAB_FILTERS = new Set(["unpaid", "paid", "debt"]);

export function useInvoiceFilters(activeTab: string) {
  const [search, setSearchRaw]               = useState("");
  const [dateRange, setDateRangeRaw]         = useState<{ from?: Date; to?: Date }>(defaultCurrentMonth);
  const [calendarOpen, setCalendarOpen]      = useState(false);
  const [paidAtRange, setPaidAtRangeRaw]     = useState<{ from?: Date; to?: Date }>({});
  const [paidAtCalendarOpen, setPaidAtCalendarOpen] = useState(false);
  const [sortKey, setSortKey]                = useState<SortKey>("createdAt");
  const [sortDir, setSortDir]                = useState<"asc" | "desc">("desc");
  const [filters, setFiltersRaw]             = useState<InvoiceFilters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen]          = useState(false);
  const [page, setPage]                      = useState(1);
  const [pageSize, setPageSizeRaw]           = useState(20);

  const resetPage = useCallback(() => setPage(1), []);

  const setSearch = useCallback((v: string) => { setSearchRaw(v); resetPage(); }, [resetPage]);
  const setDateRange = useCallback((v: { from?: Date; to?: Date }) => { setDateRangeRaw(v); resetPage(); }, [resetPage]);
  const setPaidAtRange = useCallback((v: { from?: Date; to?: Date }) => {
    setPaidAtRangeRaw(v);
    if (v.from || v.to) setDateRangeRaw({});
    resetPage();
  }, [resetPage]);
  const setFilters = useCallback((v: InvoiceFilters | ((prev: InvoiceFilters) => InvoiceFilters)) => {
    setFiltersRaw(v);
    resetPage();
  }, [resetPage]);
  const setPageSize = useCallback((n: number) => { setPageSizeRaw(n); setPage(1); }, []);

  useEffect(() => { resetPage(); }, [activeTab, resetPage]);

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
    resetPage();
  }, [sortKey, resetPage]);

  const dateFrom = dateRange.from ? format(dateRange.from, "yyyy-MM-dd") : undefined;
  const dateTo   = dateRange.to   ? format(dateRange.to,   "yyyy-MM-dd") : undefined;
  const isDebtTab = activeTab === "debt";

  const paidAtFrom = paidAtRange.from ? format(paidAtRange.from, "yyyy-MM-dd") : undefined;
  const paidAtTo   = paidAtRange.to   ? format(paidAtRange.to,   "yyyy-MM-dd") : undefined;
  const hasPaidAtFilter = !!(paidAtFrom || paidAtTo);

  const { data: filterOptionsData } = useQuery<Record<string, string[]>>({
    queryKey: ["/api/finance/invoices/filter-options", isDebtTab ? "dueDate" : "createdAt", dateFrom, dateTo],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (isDebtTab) {
        if (dateFrom) p.set("dueDateFrom", dateFrom);
        if (dateTo)   p.set("dueDateTo", dateTo);
      } else {
        if (dateFrom) p.set("dateFrom", dateFrom);
        if (dateTo)   p.set("dateTo", dateTo);
      }
      const res = await fetch(`/api/finance/invoices/filter-options?${p}`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 60_000,
  });

  const filterOptions = {
    branches:       filterOptionsData?.locationNames       ?? [],
    types:          ["Thu", "Chi"],
    categories:     filterOptionsData?.categories          ?? [],
    classes:        filterOptionsData?.classNames          ?? [],
    creators:       filterOptionsData?.creatorNames        ?? [],
    payers:         filterOptionsData?.payerNames          ?? [],
    commissions:    filterOptionsData?.commissionStaffNames ?? [],
    paymentMethods: filterOptionsData?.paymentMethods      ?? [],
  };

  const queryParams: InvoiceQueryParams = {
    tabFilter:            TAB_FILTERS.has(activeTab) ? activeTab : undefined,
    types:                filters.types.length       ? filters.types       : undefined,
    locationNames:        filters.branches.length    ? filters.branches    : undefined,
    categories:           filters.categories.length  ? filters.categories  : undefined,
    classNames:           filters.classes.length     ? filters.classes     : undefined,
    creatorNames:         filters.creators.length    ? filters.creators    : undefined,
    payerNames:           filters.payers.length      ? filters.payers      : undefined,
    commissionStaffNames: filters.commissions.length ? filters.commissions : undefined,
    paymentMethods:       filters.paymentMethods.length ? filters.paymentMethods : undefined,
    search:               search || undefined,
    dateFrom:             hasPaidAtFilter || isDebtTab ? undefined : dateFrom,
    dateTo:               hasPaidAtFilter || isDebtTab ? undefined : dateTo,
    dueDateFrom:          hasPaidAtFilter || !isDebtTab ? undefined : dateFrom,
    dueDateTo:            hasPaidAtFilter || !isDebtTab ? undefined : dateTo,
    paidAtFrom:           hasPaidAtFilter ? paidAtFrom : undefined,
    paidAtTo:             hasPaidAtFilter ? paidAtTo   : undefined,
    sortKey:              sortKey || undefined,
    sortDir:              sortDir || undefined,
    page,
    limit:                pageSize,
  };

  return {
    search, setSearch,
    dateRange, setDateRange,
    calendarOpen, setCalendarOpen,
    paidAtRange, setPaidAtRange,
    paidAtCalendarOpen, setPaidAtCalendarOpen,
    filterOpen, setFilterOpen,
    sortKey, sortDir, handleSort,
    filters, setFilters,
    filterOptions,
    page, setPage,
    pageSize, setPageSize,
    queryParams,
  };
}
