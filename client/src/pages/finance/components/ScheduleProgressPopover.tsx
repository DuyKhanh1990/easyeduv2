import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CheckCircle, AlertCircle, CreditCard, X, CalendarDays } from "lucide-react";
import { parseNum, fmtMoney, fmtDate, STATUS_CONFIG, type InvoiceRow, type ScheduleItem } from "@/types/invoice-types";

function ScheduleStatusBadge({ schedule }: { schedule: ScheduleItem }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = schedule.dueDate ? new Date(schedule.dueDate) : null;
  const overdue = schedule.status !== "paid" && due !== null && due < today;

  if (schedule.status === "paid") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700">
        <CheckCircle className="h-3 w-3" /> Đã thanh toán
      </span>
    );
  }
  if (overdue) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600">
        <AlertCircle className="h-3 w-3" /> Quá hạn
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
      ⏳ Chưa thanh toán
    </span>
  );
}

interface Props {
  inv: InvoiceRow;
  children: React.ReactNode;
}

export function ScheduleProgressPopover({ inv, children }: Props) {
  const [open, setOpen] = useState(false);

  const { data: schedules = [], isLoading } = useQuery<ScheduleItem[]>({
    queryKey: ["/api/finance/invoices", inv.id, "payment-schedules"],
    enabled: open,
  });

  const grandTotal  = parseNum(inv.grandTotal);
  const paidAmount  = parseNum(inv.paidAmount);
  const remaining   = parseNum(inv.remainingAmount);
  const hasSchedules = inv.hasSchedules && (inv.scheduleCount ?? 0) > 0;
  const total       = hasSchedules ? (inv.scheduleCount ?? 1) : 1;
  const paidSch     = hasSchedules ? (inv.schedulePaidCount ?? 0) : (remaining === 0 && grandTotal > 0 ? 1 : 0);
  const pct         = total > 0 ? Math.round((paidSch / total) * 100) : 0;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const nextDueRaw  = hasSchedules ? inv.scheduleNextDueDate : inv.dueDate;
  const nextDueDate = nextDueRaw ? new Date(nextDueRaw) : null;
  const allDone     = paidSch === total && grandTotal > 0;

  const topStatus = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.unpaid;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          className="cursor-pointer select-none"
          onClick={() => setOpen(true)}
        >
          {children}
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-[640px] p-0 shadow-xl rounded-xl border overflow-hidden"
        align="center"
        side="bottom"
        sideOffset={8}
        onInteractOutside={() => setOpen(false)}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Hoá đơn</span>
            {inv.code && <span className="font-bold text-sm text-primary">{inv.code}</span>}
            {inv.name && <><span className="text-muted-foreground">•</span><span className="text-sm font-semibold">{inv.name}</span></>}
            {inv.category && <><span className="text-muted-foreground">•</span><span className="text-xs text-muted-foreground">{inv.category}</span></>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${topStatus.className}`}>
              {topStatus.label}
            </span>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-close-schedule-popover"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex gap-0 min-h-[200px]">
          {/* Left: Financial summary */}
          <div className="flex-[2] px-4 py-4 border-r space-y-3">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Tóm tắt tài chính</p>

            {/* 2x2 grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-muted/50 p-2.5">
                <p className="text-[10px] text-muted-foreground mb-0.5">Tổng tiền:</p>
                <p className="text-sm font-bold">{fmtMoney(grandTotal)}</p>
              </div>
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-2.5">
                <p className="text-[10px] text-muted-foreground mb-0.5">Đã thu:</p>
                <p className="text-sm font-bold text-blue-600">{fmtMoney(paidAmount)}</p>
              </div>
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-2.5">
                <p className="text-[10px] text-muted-foreground mb-0.5">Còn nợ:</p>
                <p className="text-sm font-bold text-red-600">{fmtMoney(remaining)}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2.5">
                <p className="text-[10px] text-muted-foreground mb-0.5">Hạn TT gần nhất:</p>
                <p className="text-sm font-bold">{nextDueDate ? fmtDate(nextDueRaw) : "—"}</p>
              </div>
            </div>

            {/* Next due full line */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              <span>Hạn TT gần nhất:</span>
              <span className={`font-semibold ${nextDueDate && nextDueDate < today && !allDone ? "text-red-600" : "text-foreground"}`}>
                {nextDueDate ? fmtDate(nextDueRaw) : "—"}
              </span>
            </div>

            {/* Progress */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Tiến độ: <span className="font-semibold text-foreground">{pct}%</span></span>
                <span className="font-semibold text-muted-foreground">{paidSch} / {total} đợt</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${allDone ? "bg-green-500" : pct > 0 ? "bg-blue-500" : "bg-transparent"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Right: Schedule list */}
          <div className="flex-[3] px-4 py-4 space-y-2">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              Danh sách đợt thanh toán
            </p>

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2].map(i => (
                  <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : schedules.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                Không có đợt thanh toán nào
              </div>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {schedules.map((sch) => {
                  const schDue = sch.dueDate ? new Date(sch.dueDate) : null;
                  const schOverdue = sch.status !== "paid" && schDue !== null && schDue < today;
                  const borderCls = sch.status === "paid"
                    ? "border-green-200 bg-green-50/50 dark:bg-green-950/20"
                    : schOverdue
                    ? "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20"
                    : "border-border bg-card";

                  return (
                    <div key={sch.id} className={`rounded-lg border p-2.5 ${borderCls}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap text-xs">
                          <span className="font-bold">{sch.label}</span>
                          <span className="text-muted-foreground">•</span>
                          <span className="font-semibold text-foreground">{fmtMoney(parseNum(sch.amount))}</span>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-muted-foreground">{fmtDate(sch.dueDate)}</span>
                        </div>
                      </div>
                      <div className="mt-1">
                        <ScheduleStatusBadge schedule={sch} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
