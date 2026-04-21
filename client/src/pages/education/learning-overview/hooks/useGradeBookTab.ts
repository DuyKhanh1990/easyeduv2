import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { GradeBookRow, GradeBookListResponse, GradeBookFilters } from "../types";

function buildUrl(filters: GradeBookFilters, page: number, pageSize: number): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    search: filters.search,
    locationId: filters.locationId,
    published: filters.published,
  });
  return `/api/learning-overview/grade-books?${params}`;
}

const QUERY_KEY = "/api/learning-overview/grade-books";

export function useGradeBookTab(enabled: boolean) {
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(20);
  const [filters, setFiltersState] = useState<GradeBookFilters>({
    search: "",
    locationId: "",
    published: "",
  });

  const setFilters = (fn: (prev: GradeBookFilters) => GradeBookFilters) => {
    setFiltersState(fn);
    setPageState(1);
  };

  const setPage = (p: number) => setPageState(p);
  const setPageSize = (s: number) => { setPageSizeState(s); setPageState(1); };

  const { data: response, isLoading } = useQuery<GradeBookListResponse>({
    queryKey: [QUERY_KEY, page, pageSize, filters],
    queryFn: async () => {
      const res = await fetch(buildUrl(filters, page, pageSize));
      if (!res.ok) throw new Error("Lỗi tải bảng điểm");
      return res.json();
    },
    enabled,
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ classId, id }: { classId: string; id: string }) => {
      await apiRequest("DELETE", `/api/classes/${classId}/grade-books/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ classId, id, data }: { classId: string; id: string; data: Partial<Pick<GradeBookRow, "title" | "published">> }) => {
      await apiRequest("PUT", `/api/classes/${classId}/grade-books/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
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
    locations: response?.locations ?? [],
    deleteMutation,
    updateMutation,
  };
}
