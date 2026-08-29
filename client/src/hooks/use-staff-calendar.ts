import { useQuery } from "@tanstack/react-query";
import { MyCalendarResponse } from "@/types/my-calendar";

export function useStaffCalendar(month: string) {
  return useQuery<MyCalendarResponse>({
    queryKey: ["/api/my-space/calendar/staff", month],
    queryFn: async () => {
      const res = await fetch(`/api/my-space/calendar/staff?month=${month}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Lỗi tải lịch nhân viên");
      return res.json();
    },
    enabled: !!month,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
}
