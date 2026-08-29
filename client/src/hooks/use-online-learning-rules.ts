import { useQuery } from "@tanstack/react-query";
import { OnlineRuleConfig } from "@/types/my-calendar";
import { STATIC_STALE_TIME, getAuthHeaders } from "@/lib/queryClient";

export function useOnlineLearningRules() {
  return useQuery<OnlineRuleConfig[]>({
    queryKey: ["/api/online-learning-rules"],
    queryFn: async () => {
      const res = await fetch("/api/online-learning-rules", { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Lỗi tải cấu hình học online");
      return res.json();
    },
    staleTime: STATIC_STALE_TIME,
  });
}
