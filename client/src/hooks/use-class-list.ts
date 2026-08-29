import { useState, useEffect, useMemo } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useClasses } from "@/hooks/use-classes";
import type { ClassesPage } from "@/hooks/use-classes";

const PAGE_SIZE_OPTIONS = [20, 30, 50, 100] as const;
export type PageSizeOption = typeof PAGE_SIZE_OPTIONS[number];
export { PAGE_SIZE_OPTIONS };

export function useClassList() {
  // ---------------------------------------------------------------------------
  // Raw state declarations (must come first)
  // ---------------------------------------------------------------------------
  const [searchTerm, setSearchTermRaw] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [locationFilter, setLocationFilterRaw] = useState("all");
  const [statusFilter, setStatusFilterRaw] = useState("all");

  // ---------------------------------------------------------------------------
  // Pagination state
  // ---------------------------------------------------------------------------
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState<PageSizeOption>(20);

  // ---------------------------------------------------------------------------
  // Wrapper setters that reset page
  // ---------------------------------------------------------------------------
  const setSearchTerm = (v: string) => {
    setSearchTermRaw(v);
    setPage(1);
  };

  const setLocationFilter = (v: string) => {
    setLocationFilterRaw(v);
    setPage(1);
  };

  const setStatusFilter = (v: string) => {
    setStatusFilterRaw(v);
    setPage(1);
  };

  const setPageSize = (size: PageSizeOption) => {
    setPageSizeRaw(size);
    setPage(1);
  };

  // ---------------------------------------------------------------------------
  // View mode — persisted to localStorage
  // ---------------------------------------------------------------------------
  const [viewMode, setViewMode] = useState<"card" | "table">(() => {
    return (localStorage.getItem("classViewMode") as "card" | "table") || "card";
  });

  useEffect(() => {
    localStorage.setItem("classViewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 250);

    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  // ---------------------------------------------------------------------------
  // Selection state — resets when view mode changes
  // ---------------------------------------------------------------------------
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedIds(new Set());
  }, [viewMode]);

  // ---------------------------------------------------------------------------
  // Edit dialog state
  // ---------------------------------------------------------------------------
  const [editClassId, setEditClassId] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Delete state
  // ---------------------------------------------------------------------------
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; isActive?: boolean; hasAttendance?: boolean } | null>(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [deleteInvoiceCount, setDeleteInvoiceCount] = useState(0);

  // ---------------------------------------------------------------------------
  // Data fetching — server-side paginated
  // ---------------------------------------------------------------------------
  const { data: pageResult, isLoading } = useClasses(locationFilter, {
    view: "list",
    page,
    pageSize,
    search: debouncedSearch || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });

  const classesPage = pageResult as ClassesPage | undefined;
  const classes = classesPage?.data ?? [];
  const total = classesPage?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // ---------------------------------------------------------------------------
  // Derived: today (stable reference)
  // ---------------------------------------------------------------------------
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // ---------------------------------------------------------------------------
  // Status computation (for display in cards/rows)
  // ---------------------------------------------------------------------------
  function getComputedStatus(cls: any): "recruiting" | "active" | "closed" | "force_closed" {
    // Manually closed by admin overrides everything
    if (cls.status === "closed") return "force_closed";
    const start = new Date(cls.startDate);
    const end = new Date(cls.endDate);
    if (today < start) return "recruiting";
    if (today > end) return "closed";
    return "active";
  }

  // filteredClasses is the server-returned page
  const filteredClasses = classes;

  // ---------------------------------------------------------------------------
  // Selection helpers
  // ---------------------------------------------------------------------------
  const allFilteredIds = filteredClasses?.map((c: any) => c.id) || [];
  const isAllSelected = allFilteredIds.length > 0 && allFilteredIds.every((id: string) => selectedIds.has(id));
  const isSomeSelected = allFilteredIds.some((id: string) => selectedIds.has(id));

  const toggleAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(allFilteredIds));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const openEdit = (id: string) => {
    setEditClassId(id);
    setIsEditOpen(true);
  };

  const closeEdit = () => {
    setIsEditOpen(false);
    setEditClassId(null);
  };

  const openDelete = async (id: string, name: string, isActive?: boolean, hasAttendance?: boolean) => {
    setDeleteInvoiceCount(0);
    setDeleteTarget({ id, name, isActive, hasAttendance });
    try {
      const res = await apiRequest("POST", "/api/classes/check-invoices", { ids: [id] });
      const data = await res.json();
      setDeleteInvoiceCount(data.count ?? 0);
    } catch {}
  };

  const openBulkDelete = async () => {
    setDeleteInvoiceCount(0);
    setIsBulkDeleteOpen(true);
    try {
      const res = await apiRequest("POST", "/api/classes/check-invoices", { ids: Array.from(selectedIds) });
      const data = await res.json();
      setDeleteInvoiceCount(data.count ?? 0);
    } catch {}
  };

  return {
    // Filter
    searchTerm, setSearchTerm,
    locationFilter, setLocationFilter,
    statusFilter, setStatusFilter,
    // View
    viewMode, setViewMode,
    // Pagination
    page, setPage,
    pageSize, setPageSize,
    total, totalPages,
    // Data
    classes, isLoading,
    // Selection
    selectedIds, setSelectedIds,
    isAllSelected, isSomeSelected,
    toggleAll, toggleOne,
    // Edit dialog
    editClassId,
    isEditOpen, setIsEditOpen,
    openEdit, closeEdit,
    // Delete dialog
    deleteTarget, setDeleteTarget,
    isBulkDeleteOpen, setIsBulkDeleteOpen,
    deleteInvoiceCount, setDeleteInvoiceCount,
    openDelete, openBulkDelete,
    // Derived
    filteredClasses,
    getComputedStatus,
  };
}
