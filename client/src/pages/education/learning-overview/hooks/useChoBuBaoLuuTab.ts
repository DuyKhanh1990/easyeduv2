import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

export type ChoBuBaoLuuFilters = {
  search: string;
  dateFrom: string;
  dateTo: string;
  classIds: string[];
  teacherIds: string[];
};

export interface ChoBuBaoLuuRow {
  id: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  sessionIndex: number | null;
  sessionDate: string;
  shiftName: string;
  startTime: string | null;
  endTime: string | null;
  attendanceStatus: "makeup_wait" | "paused";
  teacherNames: string;
}

export interface ClassGroup {
  classId: string;
  className: string;
  totalSessions: number;
  rows: ChoBuBaoLuuRow[];
}

export interface ChoBuBaoLuuResponse {
  data: ClassGroup[];
  total: number;
  page: number;
  pageSize: number;
  availableClasses: { id: string; label: string }[];
  availableTeachers: { id: string; label: string }[];
}

export function getDefaultChoBuBaoLuuDateRange() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const toInputValue = (date: Date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

  return {
    dateFrom: toInputValue(firstDay),
    dateTo: toInputValue(lastDay),
  };
}

export function useChoBuBaoLuuTab(enabled: boolean) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const defaultDateRange = getDefaultChoBuBaoLuuDateRange();
  const [filters, setFiltersState] = useState<ChoBuBaoLuuFilters>({
    search: "",
    dateFrom: defaultDateRange.dateFrom,
    dateTo: defaultDateRange.dateTo,
    classIds: [],
    teacherIds: [],
  });

  const setFilters = (patch: Partial<ChoBuBaoLuuFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const { data: response, isLoading } = useQuery<ChoBuBaoLuuResponse>({
    queryKey: ["/api/learning-overview/cho-bu-bao-luu", page, pageSize, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        search: filters.search,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      });
      filters.classIds.forEach((id) => params.append("classes", id));
      filters.teacherIds.forEach((id) => params.append("teachers", id));
      const res = await fetch(`/api/learning-overview/cho-bu-bao-luu?${params.toString()}`);
      if (!res.ok) throw new Error("Lỗi tải dữ liệu Chờ bù - Bảo lưu");
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
    setPageSize: (size: number) => { setPageSize(size); setPage(1); },
    filters,
    setFilters,
    availableClasses: response?.availableClasses ?? [],
    availableTeachers: response?.availableTeachers ?? [],
    isLoading,
  };
}
