import { AlertCircle } from "lucide-react";
import { DueDateBadge } from "./DueDateBadge";
import { STATUS_CONFIG, parseNum, fmtMoney, fmtDate, type InvoiceRow } from "@/types/invoice-types";

export function DebtInvoiceRow({ invoice }: { invoice: InvoiceRow }) {
  const grand = parseNum(invoice.grandTotal);
  const paid = parseNum(invoice.paidAmount);
  const remaining = parseNum(invoice.remainingAmount);
  const statusCfg = STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG.unpaid;
  const isOverdue = invoice.dueDate && new Date(invoice.dueDate) < new Date() && remaining > 0;

  return (
    <tr className="border-b last:border-0 hover:bg-muted/20 transition-colors">
      <td className="px-4 py-2.5 text-xs font-medium text-primary">{invoice.code || "—"}</td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground">{invoice.category || "—"}</td>
      <td className="px-4 py-2.5 text-right text-xs">{fmtMoney(grand)}</td>
      <td className="px-4 py-2.5 text-right text-xs text-green-600">{paid > 0 ? fmtMoney(paid) : <span className="text-muted-foreground">0 đ</span>}</td>
      <td className="px-4 py-2.5 text-right text-xs font-semibold text-red-600">{fmtMoney(remaining)}</td>
      <td className="px-4 py-2.5 text-xs">
        {invoice.dueDate
          ? <span className="flex items-center gap-1">{fmtDate(invoice.dueDate)}{isOverdue && <AlertCircle className="h-3 w-3 text-orange-500" />}</span>
          : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-4 py-2.5"><span className={`text-xs px-2 py-0.5 rounded ${statusCfg.className}`}>{statusCfg.label}</span></td>
      <td className="px-4 py-2.5"><DueDateBadge dueDate={invoice.dueDate} /></td>
    </tr>
  );
}
