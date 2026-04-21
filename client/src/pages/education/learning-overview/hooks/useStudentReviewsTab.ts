import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

export interface ReviewItem {
  criteriaId?: string;
  criteriaName: string;
  comment: string;
}

export interface SessionReview {
  id: string;
  studentName: string;
  className: string;
  sessionIndex: number | null;
  sessionDate: string;
  shiftName: string;
  startTime: string | null;
  endTime: string | null;
  reviewData: ReviewItem[];
}

interface ReviewsResponse {
  rows: SessionReview[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 50;
const QUERY_KEY = "/api/learning-overview/session-reviews";

function buildUrl(params: {
  dateFrom?: string; dateTo?: string; search?: string; page: number; pageSize: number;
}): string {
  const q = new URLSearchParams();
  if (params.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params.dateTo) q.set("dateTo", params.dateTo);
  if (params.search) q.set("search", params.search);
  q.set("page", String(params.page));
  q.set("pageSize", String(params.pageSize));
  return `${QUERY_KEY}?${q.toString()}`;
}

export function useStudentReviewsTab(enabled: boolean) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const params = { dateFrom, dateTo, search, page, pageSize };

  const { data, isLoading } = useQuery<ReviewsResponse>({
    queryKey: [QUERY_KEY, params],
    queryFn: async () => {
      const res = await fetch(buildUrl(params));
      if (!res.ok) throw new Error("Lỗi tải nhận xét học viên");
      return res.json();
    },
    enabled,
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
  };
}
