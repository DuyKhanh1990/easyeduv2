import { useQuery } from "@tanstack/react-query";
import { MyCalendarResponse } from "@/types/my-calendar";

export function useStudentCalendar(month: string) {
  return useQuery<MyCalendarResponse>({
    queryKey: ["/api/my-space/calendar/student", month],
    queryFn: async () => {
      const res = await fetch(`/api/my-space/calendar/student?month=${month}`);
      if (!res.ok) throw new Error("Lỗi tải lịch học viên");
      return res.json();
    },
    enabled: !!month,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
}
