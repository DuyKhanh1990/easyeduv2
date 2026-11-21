import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import { STATUS_CONFIG } from "@/types/invoice-types";
import {
  InvoicePaymentStatusDialog,
  type InvoicePaymentStatusDetails,
} from "./InvoicePaymentStatusDialog";
import { ConfirmReturnToUnpaidDialog } from "./ConfirmReturnToUnpaidDialog";

interface UpdateStatusMutation {
  mutate: (
    vars: { invoiceId: string; status: string } & Partial<InvoicePaymentStatusDetails>,
    options?: { onSuccess?: () => void; onError?: (err: Error) => void }
  ) => void;
  isPending: boolean;
}

export function InvoiceStatusDropdown({
  invoiceId,
  currentStatus,
  allowedStatuses,
  updateStatusMutation,
  initialAccount,
  initialCounterAccount,
  locationId,
  initialAppliedBankAccount,
}: {
  invoiceId: string;
  currentStatus: string;
  allowedStatuses: readonly string[];
  updateStatusMutation: UpdateStatusMutation;
  initialAccount?: string | null;
  initialCounterAccount?: string | null;
  locationId?: string | null;
  initialAppliedBankAccount?: InvoicePaymentStatusDetails["appliedBankAccount"];
}) {
  const [open, setOpen] = useState(false);
  const [quickPaymentOpen, setQuickPaymentOpen] = useState(false);
  const [returnToUnpaidConfirmOpen, setReturnToUnpaidConfirmOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
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

  const selectStatus = (status: string) => {
    setOpen(false);
    if (currentStatus === "unpaid" && (status === "paid" || status === "confirmed")) {
      setPendingStatus(status);
      setQuickPaymentOpen(true);
      return;
    }
    if ((currentStatus === "paid" || currentStatus === "confirmed") && status === "unpaid") {
      setReturnToUnpaidConfirmOpen(true);
      return;
    }
    updateStatusMutation.mutate(
      { invoiceId, status },
      {
        onSuccess: () => setOpen(false),
        onError: () => toast({ title: t("finance.updateError"), variant: "destructive" }),
      },
    );
  };

  return (
    <>
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
                onClick={() => selectStatus(opt.value)}
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
      <InvoicePaymentStatusDialog
        open={quickPaymentOpen}
        onOpenChange={open => {
          setQuickPaymentOpen(open);
          if (!open) setPendingStatus(null);
        }}
        isPending={updateStatusMutation.isPending}
        title="Thông tin thu/chi hóa đơn"
        initialAccount={initialAccount}
        initialCounterAccount={initialCounterAccount}
        locationId={locationId}
        initialAppliedBankAccount={initialAppliedBankAccount}
        onConfirm={details => {
          if (!pendingStatus) return;
          updateStatusMutation.mutate(
            { invoiceId, status: pendingStatus, ...details },
            {
              onSuccess: () => {
                setQuickPaymentOpen(false);
                setPendingStatus(null);
              },
              onError: () => toast({ title: t("finance.updateError"), variant: "destructive" }),
            },
          );
        }}
      />
      <ConfirmReturnToUnpaidDialog
        open={returnToUnpaidConfirmOpen}
        onOpenChange={setReturnToUnpaidConfirmOpen}
        isPending={updateStatusMutation.isPending}
        onConfirm={() => updateStatusMutation.mutate(
          { invoiceId, status: "unpaid" },
          {
            onSuccess: () => setReturnToUnpaidConfirmOpen(false),
            onError: () => toast({ title: t("finance.updateError"), variant: "destructive" }),
          },
        )}
      />
    </>
  );
}
