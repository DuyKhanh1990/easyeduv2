import { useInvoiceSchedules } from "@/hooks/use-invoice-schedules";
import { AlertCircle } from "lucide-react";
import { DueDateBadge } from "./DueDateBadge";
import { STATUS_CONFIG, parseNum, fmtMoney, fmtDate, DEBT_ROW_COLS, type InvoiceRow } from "@/types/invoice-types";

export function DebtScheduleLoader({ invoice }: { invoice: InvoiceRow }) {
  const { schedules, isLoading } = useInvoiceSchedules(invoice.id);
  const unpaid = schedules.filter(s => s.status !== "paid");

  if (isLoading) {
    return (
      <tr>
        <td colSpan={DEBT_ROW_COLS} className="px-4 py-2 text-center">
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <div className="h-3 w-3 animate-spin rounded-full border border-blue-500 border-t-transparent" />
            Đang tải đợt...
          </div>
        </td>
      </tr>
    );
  }

  return (
    <>
      {unpaid.map(s => {
        const amount = parseNum(s.amount);
        const isOverdue = s.dueDate && new Date(s.dueDate) < new Date();
        return (
          <tr key={s.id} className="border-b last:border-0 hover:bg-blue-50/30 transition-colors">
            <td className="px-4 py-2.5 text-xs font-medium text-primary">
              <div className="flex items-baseline gap-1.5">
                <span>{s.code ?? s.label}</span>
                {s.code && <span className="text-[10px] text-muted-foreground">{s.label.toLowerCase()}</span>}
              </div>
            </td>
            <td className="px-4 py-2.5 text-xs text-muted-foreground">{invoice.category || "—"}</td>
            <td className="px-4 py-2.5 text-right text-xs">{fmtMoney(amount)}</td>
            <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">0 đ</td>
            <td className="px-4 py-2.5 text-right text-xs font-semibold text-red-600">{fmtMoney(amount)}</td>
            <td className="px-4 py-2.5 text-xs">
              {s.dueDate
                ? <span className="flex items-center gap-1">{fmtDate(s.dueDate)}{isOverdue && <AlertCircle className="h-3 w-3 text-orange-500" />}</span>
                : <span className="text-muted-foreground">—</span>}
            </td>
            <td className="px-4 py-2.5"><span className={`text-xs px-2 py-0.5 rounded ${STATUS_CONFIG.unpaid.className}`}>Chưa thanh toán</span></td>
            <td className="px-4 py-2.5"><DueDateBadge dueDate={s.dueDate} /></td>
          </tr>
        );
      })}
    </>
  );
}
