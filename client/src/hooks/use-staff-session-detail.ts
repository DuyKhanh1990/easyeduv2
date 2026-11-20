import { useQuery } from "@tanstack/react-query";
import { MyCalendarSession } from "@/types/my-calendar";

export function useStaffSessionDetail(classSessionId: string | null) {
  return useQuery<MyCalendarSession>({
    queryKey: ["/api/my-space/calendar/staff/session", classSessionId],
    queryFn: async () => {
      const res = await fetch(`/api/my-space/calendar/staff/session/${classSessionId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Lỗi tải chi tiết buổi dạy");
      return res.json();
    },
    enabled: !!classSessionId,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}
