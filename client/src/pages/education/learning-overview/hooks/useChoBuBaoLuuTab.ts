import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

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
}

export function useChoBuBaoLuuTab(enabled: boolean) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data: response, isLoading } = useQuery<ChoBuBaoLuuResponse>({
    queryKey: ["/api/learning-overview/cho-bu-bao-luu", page, pageSize],
    queryFn: async () => {
      const res = await fetch(`/api/learning-overview/cho-bu-bao-luu?page=${page}&pageSize=${pageSize}`);
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
    isLoading,
  };
}
