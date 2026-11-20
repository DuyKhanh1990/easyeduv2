import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import { STATUS_CONFIG } from "@/types/invoice-types";

interface UpdateStatusMutation {
  mutate: (
    vars: { invoiceId: string; status: string },
    options?: { onSuccess?: () => void; onError?: (err: Error) => void }
  ) => void;
  isPending: boolean;
}

export function InvoiceStatusDropdown({
  invoiceId,
  currentStatus,
  allowedStatuses,
  updateStatusMutation,
}: {
  invoiceId: string;
  currentStatus: string;
  allowedStatuses: readonly string[];
  updateStatusMutation: UpdateStatusMutation;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { t } = useLanguage();
  const statusOptions = (["unpaid", "paid", "confirmed"] as const).filter(value => allowedStatuses.includes(value)).map(value => ({
    value,
    label: value === "paid" ? t("finance.paidStatus") : value === "confirmed" ? t("finance.tab.confirmed") : t("finance.unpaidStatus"),
    className: STATUS_CONFIG[value].className,
  }));
  const current = statusOptions.find(o => o.value === currentStatus) ?? {
    value: currentStatus,
    label: currentStatus === "paid" ? t("finance.paidStatus") : currentStatus === "confirmed" ? t("finance.tab.confirmed") : t("finance.unpaidStatus"),
    className: STATUS_CONFIG[currentStatus]?.className ?? STATUS_CONFIG.unpaid.className,
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium cursor-pointer hover:opacity-80 transition-opacity ${current.className}`}
          data-testid={`status-badge-${invoiceId}`}
        >
          {current.label}
          <ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        <div className="space-y-0.5">
          {statusOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() =>
                updateStatusMutation.mutate(
                  { invoiceId, status: opt.value },
                  {
                    onSuccess: () => setOpen(false),
                    onError: () => toast({ title: t("finance.updateError"), variant: "destructive" }),
                  }
                )
              }
              disabled={updateStatusMutation.isPending}
              className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors flex items-center gap-2 ${opt.value === currentStatus ? "font-semibold" : ""}`}
              data-testid={`status-option-${opt.value}-${invoiceId}`}
            >
              <span className={`w-2 h-2 rounded-full ${opt.value === "paid" ? "bg-green-500" : opt.value === "confirmed" ? "bg-blue-700" : opt.value === "unpaid" ? "bg-yellow-500" : opt.value === "partial" ? "bg-orange-500" : opt.value === "debt" ? "bg-red-500" : "bg-gray-400"}`} />
              {opt.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
