import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

/**
 * Shows "Có Voucher chưa sử dụng" hint when the given student has available vouchers.
 * Designed to be placed right after a <PopoverTrigger> in promotion-selector cells.
 */
export function VoucherHint({
  studentId,
  asOfDate,
  enabled = true,
}: {
  studentId: string | null | undefined;
  asOfDate?: string;
  enabled?: boolean;
}) {
  const { data: vouchers = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/vouchers/available", studentId, asOfDate],
    queryFn: () => {
      const params = new URLSearchParams({ studentId: studentId! });
      if (asOfDate) params.set("asOfDate", asOfDate);
      return apiRequest("GET", `/api/finance/vouchers/available?${params}`).then(r => r.json());
    },
    enabled: enabled && Boolean(studentId),
    staleTime: 30_000,
  });

  if (!vouchers.length) return null;
  return (
    <span className="mt-0.5 block text-[9px] leading-tight text-red-500">
      Có Voucher chưa sử dụng
    </span>
  );
}
