import { useState, useMemo } from "react";
import { parseNum } from "@/types/invoice-types";
import type { InvoiceRow } from "@/types/invoice-types";

export type SortKey =
  | "branch" | "code" | "settleCode" | "type" | "name" | "category"
  | "totalAmount" | "totalPromotion" | "totalSurcharge" | "grandTotal"
  | "description" | "status" | "dueDate" | "createdAt" | "updatedAt" | "commission";

const NUMERIC_SORT_KEYS = new Set<SortKey>([
  "totalAmount", "totalPromotion", "totalSurcharge", "grandTotal", "commission",
]);
const DATE_SORT_KEYS = new Set<SortKey>(["dueDate", "createdAt", "updatedAt"]);

export function useInvoiceFilters(rawInvoices: InvoiceRow[], activeTab: string) {
  const [search, setSearch]             = useState("");
  const [dateRange, setDateRange]       = useState<{ from?: Date; to?: Date }>({});
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [sortKey, setSortKey]           = useState<SortKey>("createdAt");
  const [sortDir, setSortDir]           = useState<"asc" | "desc">("desc");
  const [filters, setFilters]           = useState<{ type?: string; branch?: string }>({});

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    return rawInvoices
      .filter(inv => {
        if (activeTab === "unpaid"  && inv.status !== "unpaid")  return false;
        if (activeTab === "partial" && inv.status !== "partial") return false;
        if (activeTab === "paid"    && inv.status !== "paid")    return false;
        if (activeTab === "debt"    && parseNum(inv.remainingAmount) <= 0) return false;
        if (filters.type   && inv.type   !== filters.type)   return false;
        if (filters.branch && inv.branch !== filters.branch) return false;
        if (dateRange.from || dateRange.to) {
          const invDate = inv.createdAt ? new Date(inv.createdAt) : null;
          if (!invDate) return false;
          if (dateRange.from && invDate < dateRange.from) return false;
          if (dateRange.to) {
            const toEnd = new Date(dateRange.to);
            toEnd.setHours(23, 59, 59, 999);
            if (invDate > toEnd) return false;
          }
        }
        if (search) {
          const q = search.toLowerCase();
          return (
            (inv.name ?? "").toLowerCase().includes(q) ||
            (inv.code ?? "").toLowerCase().includes(q) ||
            (inv.category ?? "").toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        const av = (a as any)[sortKey];
        const bv = (b as any)[sortKey];
        let cmp: number;
        if (NUMERIC_SORT_KEYS.has(sortKey)) {
          cmp = parseNum(av) - parseNum(bv);
        } else if (DATE_SORT_KEYS.has(sortKey)) {
          cmp = (av ? new Date(av).getTime() : 0) - (bv ? new Date(bv).getTime() : 0);
        } else {
          cmp = String(av ?? "").localeCompare(String(bv ?? ""), "vi");
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [rawInvoices, activeTab, filters, search, dateRange, sortKey, sortDir]);

  return {
    search, setSearch,
    dateRange, setDateRange,
    calendarOpen, setCalendarOpen,
    sortKey, sortDir, handleSort,
    filters, setFilters,
    filtered,
  };
}
