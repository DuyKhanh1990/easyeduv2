import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MyAssignmentsResponse } from "@/types/my-assignments";

function toMonthStr(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function toDateStr(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildUrl(params: { month?: string; dateFrom?: string; dateTo?: string }): string {
  const query = new URLSearchParams();
  if (params.month) query.set("month", params.month);
  if (params.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params.dateTo) query.set("dateTo", params.dateTo);
  return `/api/learning-overview/assignments${query.toString() ? "?" + query.toString() : ""}`;
}

const QUERY_KEY = "/api/learning-overview/assignments";

export function useAssignmentsTab(enabled: boolean) {
  const today = new Date();
  const todayStr = toDateStr(today);

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  // Default both date filters to today
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);

  const monthStr = toMonthStr(year, month);
  // Always use date range (defaults to today, so it always has values)
  const params = { dateFrom, dateTo };

  const { data, isLoading } = useQuery<MyAssignmentsResponse>({
    queryKey: [QUERY_KEY, params],
    queryFn: async () => {
      const res = await fetch(buildUrl(params));
      if (!res.ok) throw new Error("Lỗi tải bài tập");
      return res.json();
    },
    enabled,
  });

  const goToPrevMonth = () => {
    const d = new Date(year, month - 1, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    const from = toDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
    const to = toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    setDateFrom(from);
    setDateTo(to);
  };

  const goToNextMonth = () => {
    const d = new Date(year, month + 1, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    const from = toDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
    const to = toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    setDateFrom(from);
    setDateTo(to);
  };

  const goToToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setDateFrom(todayStr);
    setDateTo(todayStr);
  };

  const handleDateRangeChange = (from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
    if (from) {
      const d = new Date(from);
      setYear(d.getFullYear());
      setMonth(d.getMonth());
    }
  };

  return {
    rows: data?.rows ?? [],
    month: data?.month ?? monthStr,
    isLoading,
    year,
    monthIndex: month,
    onPrevMonth: goToPrevMonth,
    onNextMonth: goToNextMonth,
    onToday: goToToday,
    onDateRangeChange: handleDateRangeChange,
  };
}
