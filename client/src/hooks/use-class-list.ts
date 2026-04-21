import { useState, useEffect, useMemo } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useClasses } from "@/hooks/use-classes";

export function useClassList() {
  // ---------------------------------------------------------------------------
  // Filter state
  // ---------------------------------------------------------------------------
  const [searchTerm, setSearchTerm] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // ---------------------------------------------------------------------------
  // View mode — persisted to localStorage
  // ---------------------------------------------------------------------------
  const [viewMode, setViewMode] = useState<"card" | "table">(() => {
    return (localStorage.getItem("classViewMode") as "card" | "table") || "card";
  });

  useEffect(() => {
    localStorage.setItem("classViewMode", viewMode);
  }, [viewMode]);

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
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [deleteInvoiceCount, setDeleteInvoiceCount] = useState(0);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------
  const { data: classes, isLoading } = useClasses(locationFilter, { view: "list" });

  // ---------------------------------------------------------------------------
  // Derived: today (stable reference)
  // ---------------------------------------------------------------------------
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function getComputedStatus(cls: any): "recruiting" | "active" | "closed" {
    const start = new Date(cls.startDate);
    const end = new Date(cls.endDate);
    if (today < start) return "recruiting";
    if (today > end) return "closed";
    return "active";
  }

  // ---------------------------------------------------------------------------
  // Filtered list
  // ---------------------------------------------------------------------------
  const filteredClasses = classes?.filter(cls => {
    const matchesSearch =
      cls.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cls.classCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (cls.teachers?.some((t: any) => t.fullName?.toLowerCase().includes(searchTerm.toLowerCase())) || false);

    if (statusFilter !== "all") {
      return matchesSearch && getComputedStatus(cls) === statusFilter;
    }
    return matchesSearch;
  });

  // ---------------------------------------------------------------------------
  // Selection helpers
  // ---------------------------------------------------------------------------
  const allFilteredIds = filteredClasses?.map(c => c.id) || [];
  const isAllSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedIds.has(id));
  const isSomeSelected = allFilteredIds.some(id => selectedIds.has(id));

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

  const openDelete = async (id: string, name: string) => {
    setDeleteInvoiceCount(0);
    setDeleteTarget({ id, name });
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
