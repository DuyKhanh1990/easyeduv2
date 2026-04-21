import { useQuery } from "@tanstack/react-query";

export function useMySpaceUserType() {
  return useQuery<{ userType: "student" | "staff" | null; reason?: string }>({
    queryKey: ["/api/my-space/user-type"],
    queryFn: async () => {
      const res = await fetch("/api/my-space/user-type");
      if (!res.ok) throw new Error("Không thể xác định loại tài khoản");
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
  });
}
