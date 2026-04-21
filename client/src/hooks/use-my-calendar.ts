import { useQuery } from "@tanstack/react-query";
import { MyCalendarResponse } from "@/types/my-calendar";

export function useMyCalendar(month: string) {
  return useQuery<MyCalendarResponse>({
    queryKey: ["/api/my-space/calendar", month],
    queryFn: async () => {
      const res = await fetch(`/api/my-space/calendar?month=${month}`);
      if (!res.ok) throw new Error("Lỗi tải lịch cá nhân");
      return res.json();
    },
    enabled: !!month,
  });
}
