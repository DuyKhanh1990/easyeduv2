import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import { STATUS_CONFIG } from "@/types/invoice-types";

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
  const currentLabel = STATUS_CONFIG[currentStatus]?.label ?? STATUS_CONFIG.unpaid.label;
  const currentClass = STATUS_CONFIG[currentStatus]?.className ?? STATUS_CONFIG.unpaid.className;
  const statusOptions = ["unpaid", "paid", "confirmed"] as const;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium cursor-pointer hover:opacity-80 transition-opacity whitespace-nowrap ${currentClass}`}
          data-testid={`schedule-status-${scheduleId}`}
        >
          {currentLabel}
          <ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1" align="start">
        <div className="space-y-0.5">
          {statusOptions.map(status => (
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
              <span className={`w-2 h-2 rounded-full ${status === "paid" ? "bg-green-500" : status === "confirmed" ? "bg-blue-700" : "bg-yellow-500"}`} />
              {STATUS_CONFIG[status].label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
