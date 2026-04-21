import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { InvoiceRow } from "@/types/invoice-types";

const INVOICES_KEY = ["/api/finance/invoices"] as const;

export function useInvoices() {
  const { data: invoices = [], isLoading } = useQuery<InvoiceRow[]>({
    queryKey: INVOICES_KEY,
    staleTime: 0,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/finance/invoices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVOICES_KEY });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ invoiceId, status }: { invoiceId: string; status: string }) =>
      apiRequest("PATCH", `/api/finance/invoices/${invoiceId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVOICES_KEY });
    },
  });

  return {
    invoices,
    isLoading,
    deleteMutation,
    updateStatusMutation,
  };
}
