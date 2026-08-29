import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CheckCircle, AlertCircle, X, CalendarDays, Printer, Scissors,
  Trash2, QrCode, FileSignature, CalendarIcon, Download,
} from "lucide-react";
import { parseNum, fmtMoney, fmtDate, STATUS_CONFIG, EINVOICE_STATUS_CONFIG, type InvoiceRow, type ScheduleItem } from "@/types/invoice-types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SplitScheduleDialog } from "./SplitScheduleDialog";
import { ScheduleQRDialog } from "./ScheduleRows";
import { InvoicePrintPreview } from "../InvoicePrintPreview";

/* ─── Status badge (display only) ────────────────────────── */
function StatusLabel({ status, dueDate }: { status: string; dueDate?: string | null }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = dueDate ? new Date(dueDate) : null;
  const overdue = status !== "paid" && due !== null && due < today;
  if (status === "paid") return <span className="text-green-700 flex items-center gap-1"><CheckCircle className="h-3 w-3" />Đã thanh toán</span>;
  if (overdue) return <span className="text-amber-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" />Quá hạn</span>;
  return <span className="text-muted-foreground flex items-center gap-1">⏳ Chưa thanh toán</span>;
}

interface Props { inv: InvoiceRow; children: React.ReactNode; }

export function ScheduleProgressPopover({ inv, children }: Props) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  /* Dialog targets */
  const [deleteTarget, setDeleteTarget]   = useState<ScheduleItem | null>(null);
  const [splitTarget, setSplitTarget]     = useState<ScheduleItem | null>(null);
  const [qrTarget, setQrTarget]           = useState<ScheduleItem | null>(null);
  const [printTarget, setPrintTarget]     = useState<ScheduleItem | null>(null);
  const [signTarget, setSignTarget]       = useState<ScheduleItem | null>(null);
  const [signConfirmed, setSignConfirmed] = useState(false);

  /* Inline UI state */
  const [calOpenId, setCalOpenId] = useState<string | null>(null);

  /* Data */
  const { data: schedules = [], isLoading } = useQuery<ScheduleItem[]>({
    queryKey: ["/api/finance/invoices", inv.id, "payment-schedules"],
    enabled: open,
  });

  /* Mutations */
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices", inv.id, "payment-schedules"] });
    queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
  };
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/finance/invoice-schedules/${id}`),
    onSuccess: invalidate,
  });
  const updateStatusMutation = useMutation({
    mutationFn: ({ scheduleId, status }: { scheduleId: string; status: string }) =>
      apiRequest("PATCH", `/api/finance/invoice-schedules/${scheduleId}/status`, { status }),
    onSuccess: invalidate,
  });
  const updateDueDateMutation = useMutation({
    mutationFn: ({ scheduleId, dueDate }: { scheduleId: string; dueDate: string }) =>
      apiRequest("PATCH", `/api/finance/invoice-schedules/${scheduleId}`, { dueDate }),
    onSuccess: () => { invalidate(); setCalOpenId(null); },
  });
  const updateInvoiceMutation = useMutation({
    mutationFn: ({ status }: { status: string }) => {
      const isPaid = status === "paid";
      return apiRequest("PATCH", `/api/finance/invoices/${inv.id}`, {
        status,
        paidAmount: isPaid ? String(grandTotal) : "0",
        remainingAmount: isPaid ? "0" : String(grandTotal),
      });
    },
    onSuccess: invalidate,
  });
  const updateInvoiceDueDateMutation = useMutation({
    mutationFn: (dueDate: string) =>
      apiRequest("PATCH", `/api/finance/invoices/${inv.id}`, { dueDate }),
    onSuccess: () => { invalidate(); setCalOpenId(null); },
  });
  const signMutation = useMutation({
    mutationFn: ({ scheduleId, isPublish }: { scheduleId: string; isPublish: boolean }) =>
      apiRequest("POST", "/api/einvoice/sign-schedules", { scheduleIds: [scheduleId], isPublish }),
    onSuccess: () => {
      invalidate();
      setSignTarget(null);
      setSignConfirmed(false);
      toast({ title: "Gửi ký số thành công" });
    },
    onError: (err: any) => toast({ title: "Lỗi gửi ký số", description: err.message, variant: "destructive" }),
  });

  /* Derived */
  const grandTotal   = parseNum(inv.grandTotal);
  const paidAmount   = parseNum(inv.paidAmount);
  const remaining    = parseNum(inv.remainingAmount);
  const hasSchedules = inv.hasSchedules && (inv.scheduleCount ?? 0) > 0;
  const total        = hasSchedules ? (inv.scheduleCount ?? 1) : 1;
  const paidSch      = hasSchedules ? (inv.schedulePaidCount ?? 0) : (remaining === 0 && grandTotal > 0 ? 1 : 0);
  const pct          = total > 0 ? Math.round((paidSch / total) * 100) : 0;
  const today        = new Date(); today.setHours(0, 0, 0, 0);
  const nextDueRaw   = hasSchedules ? inv.scheduleNextDueDate : inv.dueDate;
  const nextDueDate  = nextDueRaw ? new Date(nextDueRaw) : null;
  const allDone      = paidSch === total && grandTotal > 0;
  const topStatus    = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.unpaid;
  const invoiceRef   = { id: inv.id, code: inv.code, name: inv.name, branch: inv.branch, dueDate: inv.dueDate };
  const singleSchedule: ScheduleItem = {
    id: `invoice-${inv.id}-single`,
    label: "ĐỢT 1",
    code: inv.code,
    amount: String(grandTotal),
    status: remaining === 0 && grandTotal > 0 ? "paid" : "unpaid",
    dueDate: inv.dueDate,
    sortOrder: 0,
    paidAt: inv.paidAt,
    einvoiceStatus: inv.einvoiceStatus,
    einvoiceFkey: inv.einvoiceFkey,
    einvoiceMaTraCuu: inv.einvoiceMaTraCuu,
    einvoiceMessage: inv.einvoiceMessage,
    einvoiceUpdatedAt: inv.einvoiceUpdatedAt,
    isSynthetic: true,
  };
  const displaySchedules = schedules.length > 0 ? schedules : [singleSchedule];

  /* Build schedule-as-invoice for print */
  const buildScheduleAsInvoice = (s: ScheduleItem) => {
    const amount = parseNum(s.amount);
    const isPaid = s.status === "paid";
    const invAny = inv as any;
    return {
      id: s.id,
      code: `${inv.code ?? ""}/${s.code ?? s.label}`,
      type: inv.type,
      subjectName: inv.name ?? null,
      grandTotal: String(amount),
      paidAmount: isPaid ? String(amount) : "0",
      remainingAmount: isPaid ? "0" : String(amount),
      createdAt: typeof inv.createdAt === "string" ? inv.createdAt : new Date(inv.createdAt).toISOString(),
      paymentMethod: s.paymentMethod ?? invAny.paymentMethod ?? null,
      note: invAny.note ?? null,
      description: invAny.description ?? null,
      category: invAny.category ?? null,
      items: (Array.isArray(invAny.items) && invAny.items.length > 0)
        ? invAny.items
        : [{
            packageName: `${invAny.category ?? inv.name ?? "Học phí"} — ${s.label}`,
            name: `${invAny.category ?? inv.name ?? "Học phí"} — ${s.label}`,
            unitPrice: amount,
            price: amount,
            quantity: 1,
          }],
      parentInvoice: {
        code: inv.code ?? null,
        grandTotal: invAny.grandTotal ?? null,
        paidAmount: invAny.paidAmount ?? null,
        remainingAmount: invAny.remainingAmount ?? null,
        totalAmount: invAny.totalAmount ?? null,
        totalPromotion: invAny.totalPromotion ?? null,
        totalSurcharge: invAny.totalSurcharge ?? null,
        deduction: invAny.deduction ?? null,
      },
      // Ngân hàng — kế thừa từ hoá đơn gốc nếu có
      locationBankAccounts: invAny.locationBankAccounts ?? null,
      appliedBankAccount: invAny.appliedBankAccount ?? null,
    };
  };

  return (
    <>
      {/* Trigger */}
      <div className="cursor-pointer select-none" onClick={() => setOpen(true)}>
        {children}
      </div>

      {/* Main dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[860px] w-full p-0 gap-0 overflow-hidden rounded-xl">
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/40">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Hoá đơn</span>
              {inv.code  && <span className="font-bold text-sm text-primary">{inv.code}</span>}
              {inv.name  && <><span className="text-muted-foreground">•</span><span className="text-sm font-semibold">{inv.name}</span></>}
              {inv.category && <><span className="text-muted-foreground">•</span><span className="text-xs text-muted-foreground">{inv.category}</span></>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${topStatus.className}`}>{topStatus.label}</span>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="flex gap-0 max-h-[75vh]">
            {/* Left: summary */}
            <div className="w-[300px] shrink-0 px-5 py-4 border-r space-y-3 overflow-y-auto">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Tóm tắt tài chính</p>
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
                  <p className="text-[10px] text-muted-foreground mb-0.5">Hạn TT:</p>
                  <p className="text-sm font-bold">{nextDueDate ? fmtDate(nextDueRaw) : "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                <span className={`font-semibold ${nextDueDate && nextDueDate < today && !allDone ? "text-red-600" : "text-foreground"}`}>
                  {nextDueDate ? fmtDate(nextDueRaw) : "—"}
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Tiến độ: <span className="font-semibold text-foreground">{pct}%</span></span>
                  <span className="font-semibold text-muted-foreground">{paidSch} / {total} đợt</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${allDone ? "bg-green-500" : pct > 0 ? "bg-blue-500" : "bg-transparent"}`}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>

            {/* Right: schedule list */}
            <div className="flex-1 px-5 py-4 space-y-2 min-w-0 overflow-y-auto">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                Danh sách đợt thanh toán
              </p>

              {isLoading ? (
                <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>
              ) : (
                <div className="space-y-2 pr-1">
                  {displaySchedules.map((sch) => {
                    const schDue     = sch.dueDate ? new Date(sch.dueDate) : null;
                    const schOverdue = sch.status !== "paid" && schDue !== null && schDue < today;
                    const isPaid     = sch.status === "paid";
                    const canDelete  = !sch.isSynthetic && !isPaid && displaySchedules.length > 1;
                    const canSign    = !sch.isSynthetic && isPaid && sch.einvoiceStatus !== "published";
                    const isSigned   = sch.einvoiceStatus === "published";
                    const isStatusPending = sch.isSynthetic
                      ? updateInvoiceMutation.isPending
                      : updateStatusMutation.isPending;

                    const borderCls = isPaid
                      ? "border-green-200 bg-green-50/50 dark:bg-green-950/20"
                      : schOverdue
                      ? "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20"
                      : "border-border bg-card";

                    const isCalOpen = calOpenId === sch.id;

                    return (
                      <div key={sch.id} className={`rounded-lg border p-3 ${borderCls}`}>

                        {/* Row 1: label + amount + date | ký số checkbox */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap text-xs">
                            <span className="font-bold text-sm">{sch.label}</span>
                            <span className="text-muted-foreground">•</span>
                            <span className="font-semibold">{fmtMoney(parseNum(sch.amount))}</span>
                            <span className="text-muted-foreground">•</span>
                            {/* ── Clickable due date ── */}
                            <button
                              disabled={isPaid}
                              onClick={() => setCalOpenId(isCalOpen ? null : sch.id)}
                              className={`inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors
                                ${!isPaid ? "hover:bg-blue-100 hover:text-blue-700 cursor-pointer text-muted-foreground" : "text-muted-foreground cursor-default"}`}
                              title={!isPaid ? "Bấm để đổi hạn thanh toán" : undefined}
                            >
                              <CalendarIcon className="h-3 w-3" />
                              {fmtDate(sch.dueDate)}
                            </button>
                          </div>

                          {/* Ký số checkbox + einvoice status */}
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <div
                              className="flex items-center gap-2"
                              title={
                                isSigned   ? "Đã phát hành hoá đơn điện tử" :
                                canSign    ? "Bấm để gửi ký số" :
                                "Chỉ đợt đã thanh toán mới gửi được"
                              }
                            >
                              {/* Einvoice status badge */}
                              {(() => {
                                const key = sch.einvoiceStatus ?? "none";
                                const st  = EINVOICE_STATUS_CONFIG[key] ?? EINVOICE_STATUS_CONFIG.none;
                                return (
                                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${st.className}`}>
                                    {st.label}
                                  </span>
                                );
                              })()}
                              <span className="text-[10px] text-muted-foreground">Ký số</span>
                              <Checkbox
                                checked={isSigned}
                                disabled={!canSign && !isSigned}
                                onCheckedChange={() => { if (canSign) { setSignConfirmed(false); setSignTarget(sch); } }}
                                className={canSign ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}
                              />
                            </div>
                            {/* PDF download link — shown when signed */}
                              {isSigned && !sch.isSynthetic && (
                              <button
                                onClick={() => window.open(`/api/einvoice/schedule-pdf/${sch.id}`, "_blank", "noopener,noreferrer")}
                                className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                                title="Tải PDF hoá đơn đã ký số"
                              >
                                <Download className="h-3 w-3" />
                                Tải PDF
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Inline calendar for due date */}
                        {isCalOpen && (
                          <div className="mt-2 rounded-lg border bg-background shadow-md inline-block">
                            <Calendar
                              mode="single"
                              selected={sch.dueDate ? new Date(sch.dueDate) : undefined}
                              onSelect={(date) => {
                                if (date) {
                                  const dueDate = format(date, "yyyy-MM-dd");
                                  if (sch.isSynthetic) {
                                    updateInvoiceDueDateMutation.mutate(dueDate);
                                  } else {
                                    updateDueDateMutation.mutate({ scheduleId: sch.id, dueDate });
                                  }
                                }
                              }}
                              locale={vi}
                              disabled={sch.isSynthetic
                                ? updateInvoiceDueDateMutation.isPending
                                : updateDueDateMutation.isPending}
                            />
                          </div>
                        )}

                        {/* Row 2: status select dropdown */}
                        <div className="mt-1.5">
                          <select
                            value={sch.status}
                              disabled={isPaid || isStatusPending}
                            onChange={(e) => {
                                if (sch.isSynthetic) {
                                  updateInvoiceMutation.mutate({ status: e.target.value });
                                } else {
                                  updateStatusMutation.mutate({ scheduleId: sch.id, status: e.target.value });
                                }
                            }}
                            className={`text-[11px] font-medium px-2 py-0.5 rounded border cursor-pointer transition-colors outline-none
                              ${isPaid
                                ? "border-green-200 bg-green-100 text-green-700 cursor-default"
                                : sch.status === "paid"
                                ? "border-green-200 bg-green-100 text-green-700"
                                : "border-yellow-200 bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                              }`}
                          >
                            <option value="paid">✓ Đã thanh toán</option>
                            <option value="unpaid">⏳ Chưa thanh toán</option>
                          </select>
                        </div>

                        {/* Row 3: action buttons */}
                        <div className="mt-1.5 flex items-center gap-0.5">
                          <button
                            onClick={() => { setPrintTarget(sch); }}
                            className="p-1 rounded hover:bg-black/5 text-muted-foreground hover:text-blue-600 transition-colors"
                            title="In hoá đơn"
                          ><Printer className="h-3.5 w-3.5" /></button>

                          {!isPaid && !sch.isSynthetic && (
                            <button
                              onClick={() => setSplitTarget(sch)}
                              className="p-1 rounded hover:bg-black/5 text-muted-foreground hover:text-blue-600 transition-colors"
                              title="Tách đợt"
                            ><Scissors className="h-3.5 w-3.5" /></button>
                          )}

                          {canDelete && (
                            <button
                              onClick={() => setDeleteTarget(sch)}
                              className="p-1 rounded hover:bg-black/5 text-muted-foreground hover:text-red-600 transition-colors"
                              title="Xoá đợt"
                            ><Trash2 className="h-3.5 w-3.5" /></button>
                          )}

                          {!isPaid && !sch.isSynthetic && (
                            <button
                              onClick={() => setQrTarget(sch)}
                              className="p-1 rounded hover:bg-black/5 text-muted-foreground hover:text-purple-600 transition-colors"
                              title="Mã QR thanh toán"
                            ><QrCode className="h-3.5 w-3.5" /></button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Print preview ── */}
      {printTarget && (
        <InvoicePrintPreview
          invoice={buildScheduleAsInvoice(printTarget)}
          skipFetch
          titleSuffix={`(${printTarget.label})`}
          onClose={() => setPrintTarget(null)}
        />
      )}

      {splitTarget && (
        <SplitScheduleDialog
          scheduleId={splitTarget.id}
          label={splitTarget.label}
          amount={parseNum(splitTarget.amount)}
          invoiceId={inv.id}
          onClose={() => setSplitTarget(null)}
        />
      )}

      {deleteTarget && (
        <Dialog open onOpenChange={() => setDeleteTarget(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-4 w-4" /> Xoá đợt thanh toán
              </DialogTitle>
            </DialogHeader>
            <div className="py-3 space-y-3">
              <p className="text-sm">Bạn chắc chắn muốn xoá đợt <span className="font-semibold">{deleteTarget.label}</span>?</p>
              <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-xs text-yellow-800 space-y-1">
                <p className="font-semibold">Lưu ý nghiệp vụ:</p>
                <p>Số tiền <span className="font-semibold">{fmtMoney(parseNum(deleteTarget.amount))}</span> sẽ được cộng vào đợt cuối để tổng không đổi.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>Huỷ</Button>
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate(deleteTarget.id, {
                  onSuccess: () => { setDeleteTarget(null); toast({ title: "Đã xoá đợt" }); },
                  onError: (err: any) => toast({ title: "Lỗi xoá", description: err.message, variant: "destructive" }),
                })}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Đang xoá..." : "Xác nhận xoá"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {qrTarget && (
        <ScheduleQRDialog schedule={qrTarget} invoice={invoiceRef} onClose={() => setQrTarget(null)} />
      )}

      {/* ── Ký số confirmation dialog ── */}
      {signTarget && (
        <Dialog open onOpenChange={() => { setSignTarget(null); setSignConfirmed(false); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <FileSignature className="h-5 w-5 text-purple-600" />
                Xác nhận phát hành hóa đơn điện tử
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 text-sm">
              <p>
                Bạn đang chọn <span className="font-semibold text-purple-700">1</span> hóa đơn để ký số và gửi lên cơ quan Thuế.
              </p>

              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800 text-xs leading-relaxed">
                <div className="font-semibold mb-1">Lưu ý:</div>
                Hóa đơn sau khi ký số sẽ không thể sửa đổi hoặc xóa bỏ một cách thông thường.
                Vui lòng đảm bảo các thông tin học viên và số tiền đã chính xác 100%.
              </div>

              <label className="flex items-start gap-2 cursor-pointer select-none">
                <Checkbox
                  checked={signConfirmed}
                  onCheckedChange={(v) => setSignConfirmed(!!v)}
                  className="mt-0.5"
                />
                <span>Tôi đã kiểm tra kỹ và chịu trách nhiệm với dữ liệu này.</span>
              </label>

              <div className="border-t pt-3 space-y-1.5 text-xs italic text-muted-foreground">
                <div className="font-medium not-italic text-foreground mb-1">Giải thích:</div>
                <div>
                  <span className="not-italic font-semibold text-emerald-700">Đồng ý:</span>{" "}
                  Hóa đơn sẽ được ký số và gửi lên Thuế ngay lập tức. Không thể sửa sau khi ký.
                </div>
                <div>
                  <span className="not-italic font-semibold text-amber-700">Gửi nháp:</span>{" "}
                  Dữ liệu chỉ gửi sang Mắt Bão để kiểm tra, chưa có giá trị pháp lý. Có thể xóa/sửa dễ dàng.
                </div>
                <div>
                  <span className="not-italic font-semibold text-gray-700">Hủy bỏ:</span>{" "}
                  Đóng cửa sổ và không làm gì cả.
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => { setSignTarget(null); setSignConfirmed(false); }}
                disabled={signMutation.isPending}
              >
                Hủy bỏ
              </Button>
              <Button
                variant="outline"
                className="border-amber-300 text-amber-700 hover:bg-amber-50"
                disabled={!signConfirmed || signMutation.isPending}
                onClick={() => signMutation.mutate({ scheduleId: signTarget.id, isPublish: false })}
              >
                Gửi nháp
              </Button>
              <Button
                className="bg-purple-600 hover:bg-purple-700"
                disabled={!signConfirmed || signMutation.isPending}
                onClick={() => signMutation.mutate({ scheduleId: signTarget.id, isPublish: true })}
              >
                {signMutation.isPending ? "Đang xử lý..." : "Đồng ý"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
