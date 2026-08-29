import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StudentClassData } from "../types";

export type StudentsEndingFilters = {
  search: string;
  selectedClasses: string[];
  maxRemaining: string;
  dateFrom: string;
  dateTo: string;
  statusFilter: "" | "active" | "ending-soon" | "ended";
};

type StudentsEndingResponse = {
  data: StudentClassData[];
  total: number;
  page: number;
  pageSize: number;
  availableClasses: { code: string; label: string }[];
};

function buildUrl(filters: StudentsEndingFilters, page: number, pageSize: number): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    search: filters.search,
    maxRemaining: filters.maxRemaining,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    statusFilter: filters.statusFilter,
  });
  filters.selectedClasses.forEach((c) => params.append("classes", c));
  return `/api/student-classes/ending-soon?${params}`;
}

export function useStudentsEndingTab(enabled: boolean) {
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(20);
  const [filters, setFiltersState] = useState<StudentsEndingFilters>({
    search: "",
    selectedClasses: [],
    maxRemaining: "",
    dateFrom: "",
    dateTo: "",
    statusFilter: "",
  });

  const setFilters = (fn: (prev: StudentsEndingFilters) => StudentsEndingFilters) => {
    setFiltersState(fn);
    setPageState(1);
  };

  const setPage = (p: number) => setPageState(p);
  const setPageSize = (s: number) => { setPageSizeState(s); setPageState(1); };

  const { data: response, isLoading } = useQuery<StudentsEndingResponse>({
    queryKey: ["/api/student-classes/ending-soon", page, pageSize, filters],
    queryFn: async () => {
      const res = await fetch(buildUrl(filters, page, pageSize));
      if (!res.ok) throw new Error("Failed to fetch students ending soon");
      return res.json();
    },
    enabled,
  });

  return {
    data: response?.data ?? [],
    total: response?.total ?? 0,
    page,
    pageSize,
    setPage,
    setPageSize,
    isLoading,
    filters,
    setFilters,
    availableClasses: response?.availableClasses ?? [],
  };
}
