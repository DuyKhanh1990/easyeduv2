import { useQuery } from "@tanstack/react-query";
import { MyAssignmentsResponse } from "@/types/my-assignments";

export function useStaffAssignments(params: { month?: string; dateFrom?: string; dateTo?: string }) {
  const query = new URLSearchParams();
  if (params.month) query.set("month", params.month);
  if (params.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params.dateTo) query.set("dateTo", params.dateTo);
  const queryStr = query.toString();

  return useQuery<MyAssignmentsResponse>({
    queryKey: ["/api/my-space/assignments/staff", params],
    queryFn: async () => {
      const res = await fetch(`/api/my-space/assignments/staff${queryStr ? "?" + queryStr : ""}`);
      if (!res.ok) throw new Error("Lỗi tải bài tập nhân viên");
      return res.json();
    },
  });
}
