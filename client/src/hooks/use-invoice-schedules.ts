import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ScheduleItem } from "@/types/invoice-types";

export function useInvoiceSchedules(invoiceId: string) {
  const schedulesKey = ["/api/finance/invoices", invoiceId, "payment-schedules"] as const;
  const invoicesKey = ["/api/finance/invoices"] as const;

  const { data: schedules = [], isLoading } = useQuery<ScheduleItem[]>({
    queryKey: schedulesKey,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: schedulesKey });
    queryClient.invalidateQueries({ queryKey: invoicesKey });
  };

  const deleteMutation = useMutation({
    mutationFn: (scheduleId: string) =>
      apiRequest("DELETE", `/api/finance/invoice-schedules/${scheduleId}`),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      scheduleId,
      amount,
      dueDate,
    }: {
      scheduleId: string;
      amount?: number;
      dueDate?: string | null;
    }) =>
      apiRequest("PATCH", `/api/finance/invoice-schedules/${scheduleId}`, {
        amount,
        dueDate,
      }),
    onSuccess: invalidate,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({
      scheduleId,
      status,
    }: {
      scheduleId: string;
      status: string;
    }) =>
      apiRequest("PATCH", `/api/finance/invoice-schedules/${scheduleId}/status`, { status }),
    onSuccess: invalidate,
  });

  const splitMutation = useMutation({
    mutationFn: ({
      scheduleId,
      splitAmount,
    }: {
      scheduleId: string;
      splitAmount: number;
    }) =>
      apiRequest("POST", `/api/finance/invoice-schedules/${scheduleId}/split`, { splitAmount }),
    onSuccess: invalidate,
  });

  return {
    schedules,
    isLoading,
    deleteMutation,
    updateMutation,
    updateStatusMutation,
    splitMutation,
  };
}
