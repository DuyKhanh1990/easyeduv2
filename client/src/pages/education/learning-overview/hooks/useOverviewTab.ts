import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GroupedStudent } from "../types";

export type OverviewFilters = {
  search: string;
  startFrom: string;
  startTo: string;
  endFrom: string;
  endTo: string;
  selectedClasses: string[];
  maxRemaining: string;
  selectedStatuses: string[];
};

export interface OverviewResponse {
  data: GroupedStudent[];
  total: number;
  page: number;
  pageSize: number;
  availableClasses: { code: string; label: string }[];
}

export function useOverviewTab(enabled: boolean) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<OverviewFilters>({
    search: "",
    startFrom: "",
    startTo: "",
    endFrom: "",
    endTo: "",
    selectedClasses: [],
    maxRemaining: "",
    selectedStatuses: [],
  });

  const queryParams = new URLSearchParams();
  queryParams.set("page", String(page));
  queryParams.set("pageSize", String(pageSize));
  if (filters.search) queryParams.set("search", filters.search);
  if (filters.maxRemaining) queryParams.set("maxRemaining", filters.maxRemaining);
  if (filters.startFrom) queryParams.set("startFrom", filters.startFrom);
  if (filters.startTo) queryParams.set("startTo", filters.startTo);
  if (filters.endFrom) queryParams.set("endFrom", filters.endFrom);
  if (filters.endTo) queryParams.set("endTo", filters.endTo);
  filters.selectedClasses.forEach((c) => queryParams.append("selectedClasses", c));
  filters.selectedStatuses.forEach((s) => queryParams.append("selectedStatuses", s));

  const { data: response, isLoading } = useQuery<OverviewResponse>({
    queryKey: ["/api/student-classes", page, pageSize, filters],
    queryFn: async () => {
      const res = await fetch(`/api/student-classes?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Lỗi tải dữ liệu học viên");
      return res.json();
    },
    enabled,
  });

  const students = response?.data ?? [];
  const total = response?.total ?? 0;
  const availableClasses = response?.availableClasses ?? [];
  const totalClassRows = students.reduce((sum, s) => sum + s.classes.length, 0);

  const handleFiltersChange = (patch: Partial<OverviewFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  return {
    students,
    totalClassRows,
    total,
    page,
    pageSize,
    setPage,
    setPageSize: (size: number) => { setPageSize(size); setPage(1); },
    isLoading,
    filters,
    setFilters: handleFiltersChange,
    availableClasses,
  };
}
