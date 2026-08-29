import { useQuery, useQueryClient } from "@tanstack/react-query";

export function useMySpaceUserType() {
  const queryClient = useQueryClient();

  return useQuery<{ userType: "student" | "staff" | null; reason?: string }>({
    queryKey: ["/api/my-space/user-type"],
    queryFn: async () => {
      const res = await fetch("/api/my-space/user-type");

      if (res.status === 401) {
        // Session hết hạn — xoá cache auth ngay để DashboardLayout redirect về /login.
        // Không throw để tránh flash "Tài khoản chưa được liên kết..." trước khi redirect.
        queryClient.setQueryData(["/api/auth/me"], null);
        return { userType: null, reason: "unauthorized" };
      }

      if (!res.ok) throw new Error("Không thể xác định loại tài khoản");
      return res.json();
    },
    staleTime: 60_000,
    // Không retry khi 401 (session hết hạn không phải lỗi tạm thời).
    // Với lỗi khác (5xx…) thì retry 2 lần bình thường.
    retry: (failureCount, error) => {
      if ((error as any)?.message?.startsWith("401")) return false;
      return failureCount < 2;
    },
    retryDelay: 1500,
    refetchOnWindowFocus: true,
  });
}
