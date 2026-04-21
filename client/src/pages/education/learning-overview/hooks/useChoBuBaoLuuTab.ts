import { useQuery } from "@tanstack/react-query";

export interface ChoBuBaoLuuRow {
  id: string;
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

export function useChoBuBaoLuuTab(enabled: boolean) {
  const { data = [], isLoading } = useQuery<ClassGroup[]>({
    queryKey: ["/api/learning-overview/cho-bu-bao-luu"],
    queryFn: async () => {
      const res = await fetch("/api/learning-overview/cho-bu-bao-luu");
      if (!res.ok) throw new Error("Lỗi tải dữ liệu Chờ bù - Bảo lưu");
      return res.json();
    },
    enabled,
  });

  return { data, isLoading };
}
