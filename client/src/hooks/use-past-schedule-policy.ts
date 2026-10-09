import { useQuery } from "@tanstack/react-query";

export type PastSchedulePolicyResponse = {
  enabled: boolean;
  canRunPast: boolean;
  roleIds?: string[];
};

export function usePastSchedulePolicy(enabled = true) {
  return useQuery<PastSchedulePolicyResponse>({
    queryKey: ["/api/system-settings/past-schedule"],
    queryFn: async () => {
      const response = await fetch("/api/system-settings/past-schedule", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Không thể tải cấu hình chạy lịch học trong quá khứ.");
      }
      return response.json();
    },
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
}
