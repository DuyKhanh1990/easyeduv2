import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";

interface UpdateStatusMutation {
  mutate: (
    vars: { scheduleId: string; status: string },
    options?: { onSuccess?: () => void; onError?: (err: Error) => void }
  ) => void;
  isPending: boolean;
}

export function ScheduleStatusDropdown({
  scheduleId,
  currentStatus,
  updateStatusMutation,
}: {
  scheduleId: string;
  currentStatus: string;
  updateStatusMutation: UpdateStatusMutation;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const isPaid = currentStatus === "paid";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium cursor-pointer hover:opacity-80 transition-opacity whitespace-nowrap ${isPaid ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}
          data-testid={`schedule-status-${scheduleId}`}
        >
          {isPaid ? "Đã thanh toán" : "Chưa thanh toán"}
          <ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1" align="start">
        <div className="space-y-0.5">
          {(["unpaid", "paid"] as const).map(status => (
            <button
              key={status}
              onClick={() =>
                updateStatusMutation.mutate(
                  { scheduleId, status },
                  {
                    onSuccess: () => setOpen(false),
                    onError: () => toast({ title: "Lỗi cập nhật trạng thái", variant: "destructive" }),
                  }
                )
              }
              disabled={updateStatusMutation.isPending}
              className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors flex items-center gap-2 ${currentStatus === status ? "font-semibold" : ""}`}
              data-testid={`schedule-status-${status}-${scheduleId}`}
            >
              <span className={`w-2 h-2 rounded-full ${status === "paid" ? "bg-green-500" : "bg-yellow-500"}`} />
              {status === "paid" ? "Đã thanh toán" : "Chưa thanh toán"}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
