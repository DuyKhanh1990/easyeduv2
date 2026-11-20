import { useQuery } from "@tanstack/react-query";

export type SessionReviewPublicationPolicyResponse = {
  defaultPublished: boolean;
  canToggle: boolean;
  deniedRoleIds?: string[];
};

export function useSessionReviewPublicationPolicy(enabled = true) {
  return useQuery<SessionReviewPublicationPolicyResponse>({
    queryKey: ["/api/system-settings/session-review-publication"],
    queryFn: async () => {
      const response = await fetch("/api/system-settings/session-review-publication", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Không thể tải cấu hình công bố nhận xét học viên.");
      }
      return response.json();
    },
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
}
