import { useQuery } from "@tanstack/react-query";

export type AutoInvoicePolicyResponse = {
  defaultEnabled: boolean;
  canOverride: boolean;
  roleIds?: string[];
};

export function useAutoInvoicePolicy(enabled: boolean) {
  return useQuery<AutoInvoicePolicyResponse>({
    queryKey: ["/api/system-settings/auto-invoice"],
    queryFn: async () => {
      const response = await fetch("/api/system-settings/auto-invoice", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Không thể tải cấu hình hóa đơn tự động.");
      }
      return response.json();
    },
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
}
