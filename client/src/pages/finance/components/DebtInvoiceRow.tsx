import { AlertCircle } from "lucide-react";
import { DueDateBadge } from "./DueDateBadge";
import { STATUS_CONFIG, parseNum, fmtMoney, fmtDate, type InvoiceRow } from "@/types/invoice-types";
import { useLanguage } from "@/hooks/use-language";

export function DebtInvoiceRow({ invoice }: { invoice: InvoiceRow }) {
  const { t } = useLanguage();
  const grand = parseNum(invoice.grandTotal);
  const remaining = parseNum(invoice.remainingAmount);
  const statusCfg = STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG.unpaid;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = invoice.dueDate ? new Date(invoice.dueDate) : null;
  due?.setHours(0, 0, 0, 0);
  const isOverdue = !!due && due < today && remaining > 0;
  const statusLabelKey = {
    paid: "finance.paidStatus",
    confirmed: "finance.tab.confirmed",
    unpaid: "finance.unpaidStatus",
    debt: "finance.tab.debt",
    partial: "finance.partialPayment",
    cancelled: "finance.statusCancelled",
  }[invoice.status] ?? "finance.unpaidStatus";

  return (
    <tr className="border-b last:border-0 hover:bg-muted/20 transition-colors">
      <td className="px-4 py-2.5 text-xs font-medium text-primary">{invoice.code || "—"}</td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground">{invoice.category || "—"}</td>
      <td className="px-4 py-2.5 text-right text-xs">{fmtMoney(grand)}</td>
      <td className="px-4 py-2.5 text-right text-xs font-semibold text-red-600">{fmtMoney(remaining)}</td>
      <td className="px-4 py-2.5 text-xs">
        {invoice.dueDate
          ? <span className="flex items-center gap-1">{fmtDate(invoice.dueDate)}{isOverdue && <AlertCircle className="h-3 w-3 text-orange-500" />}</span>
          : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-4 py-2.5"><span className={`inline-flex items-center whitespace-nowrap text-[11px] px-1.5 py-0.5 rounded ${statusCfg.className}`}>{t(statusLabelKey)}</span></td>
      <td className="px-4 py-2.5"><DueDateBadge dueDate={invoice.dueDate} /></td>
    </tr>
  );
}
