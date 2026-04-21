import { useQuery } from "@tanstack/react-query";
import { MyCalendarSession } from "@/types/my-calendar";

export function useStudentSessionDetail(classSessionId: string | null, studentId?: string | null) {
  return useQuery<MyCalendarSession>({
    queryKey: ["/api/my-space/calendar/student/session", classSessionId, studentId ?? null],
    queryFn: async () => {
      const url = studentId
        ? `/api/my-space/calendar/student/session/${classSessionId}?studentId=${studentId}`
        : `/api/my-space/calendar/student/session/${classSessionId}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Lỗi tải chi tiết buổi học");
      return res.json();
    },
    enabled: !!classSessionId,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}
