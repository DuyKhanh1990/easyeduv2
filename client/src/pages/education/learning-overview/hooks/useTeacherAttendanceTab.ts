import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/queryClient";

export interface TeacherAttendanceRow {
  sessionId: string;
  sessionDate: string;
  weekday: number;
  classId: string;
  className: string;
  startTime: string;
  endTime: string;
  staffId: string;
  teacherName: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  note: string;
}

interface TeacherAttendanceResponse {
  rows: TeacherAttendanceRow[];
  total: number;
  page: number;
  pageSize: number;
}

const QUERY_KEY = "/api/learning-overview/teacher-attendance";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function buildUrl(params: {
  dateFrom: string;
  dateTo: string;
  search: string;
  page: number;
  pageSize: number;
}): string {
  const q = new URLSearchParams();
  if (params.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params.dateTo) q.set("dateTo", params.dateTo);
  if (params.search) q.set("search", params.search);
  q.set("page", String(params.page));
  q.set("pageSize", String(params.pageSize));
  return `${QUERY_KEY}?${q.toString()}`;
}

export function useTeacherAttendanceTab(enabled: boolean) {
  const qc = useQueryClient();
  const today = todayStr();

  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const params = { dateFrom, dateTo, search, page, pageSize };

  const { data, isLoading } = useQuery<TeacherAttendanceResponse>({
    queryKey: [QUERY_KEY, params],
    queryFn: async () => {
      const res = await fetch(buildUrl(params));
      if (!res.ok) throw new Error("Lỗi tải dữ liệu chấm công");
      return res.json();
    },
    enabled,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: {
      sessionId: string;
      staffId: string;
      checkInAt: string | null;
      checkOutAt: string | null;
      note: string;
    }) => {
      const res = await fetch(
        `/api/learning-overview/teacher-attendance/${payload.sessionId}/${payload.staffId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            checkInAt: payload.checkInAt,
            checkOutAt: payload.checkOutAt,
            note: payload.note,
          }),
        }
      );
      if (!res.ok) throw new Error("Lỗi khi lưu chấm công");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });

  function handleFilters(patch: { dateFrom?: string; dateTo?: string; search?: string }) {
    if (patch.dateFrom !== undefined) setDateFrom(patch.dateFrom);
    if (patch.dateTo !== undefined) setDateTo(patch.dateTo);
    if (patch.search !== undefined) setSearch(patch.search);
    setPage(1);
  }

  return {
    rows: data?.rows ?? [],
    total: data?.total ?? 0,
    isLoading,
    page,
    pageSize,
    setPage,
    setPageSize: (n: number) => { setPageSize(n); setPage(1); },
    filters: { dateFrom, dateTo, search },
    onFiltersChange: handleFilters,
    saveMutation,
  };
}
