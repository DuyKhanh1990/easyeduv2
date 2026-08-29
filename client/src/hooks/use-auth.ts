import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { getAuthToken, setAuthToken, clearAuthToken } from "@/lib/queryClient";

export function useAuth() {
  return useQuery({
    queryKey: [api.auth.me.path],
    queryFn: async () => {
      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(api.auth.me.path, {
        credentials: "include",
        headers,
      });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch user");
      return api.auth.me.responses[200].parse(await res.json());
    },
    staleTime: 1000 * 60 * 5,
    // Refetch khi tab được focus lại — phát hiện session hết hạn sau khi ngủ/tắt máy.
    // Nếu server trả 401, queryFn trả null → DashboardLayout redirect về /login ngay.
    refetchOnWindowFocus: true,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (credentials: z.infer<typeof api.auth.login.input>) => {
      const res = await fetch(api.auth.login.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
        credentials: "include",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 403) throw new Error(body.message || "Tài khoản bị vô hiệu hóa");
        if (res.status === 401) throw new Error(body.message || "Tên đăng nhập hoặc mật khẩu không đúng");
        throw new Error("Đăng nhập thất bại");
      }
      return api.auth.login.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      if (data.token) {
        setAuthToken(data.token);
      }
      queryClient.setQueryData([api.auth.me.path], data.user);
      queryClient.invalidateQueries();
      toast({ title: "Chào mừng trở lại", description: "Đăng nhập thành công." });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Đăng nhập thất bại", description: err.message });
    }
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(api.auth.logout.path, {
        method: "POST",
        credentials: "include",
        headers,
      });
      if (!res.ok) throw new Error("Logout failed");
    },
    onSuccess: () => {
      clearAuthToken();
      queryClient.setQueryData([api.auth.me.path], null);
      queryClient.clear();
      // Hard redirect — đảm bảo về trang login trên mọi môi trường (production/dev).
      // Không dùng wouter navigate vì queryClient.clear() gây isLoading flash
      // khiến DashboardLayout hiện spinner thay vì redirect ngay.
      window.location.href = "/login";
    },
  });
}
