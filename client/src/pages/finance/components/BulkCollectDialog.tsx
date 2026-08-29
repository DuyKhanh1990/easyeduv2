import { useState, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Merge, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type InvoiceRow, type ScheduleItem, STATUS_CONFIG, parseNum, fmtMoney } from "@/types/invoice-types";
import { format } from "date-fns";
import type { BulkCollectPrintData } from "./BulkCollectPrintPreview";

export type { BulkCollectPrintData };

interface BulkCollectDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (printData: BulkCollectPrintData) => void;
  initialInvoices: InvoiceRow[];
  initialSchedules?: Map<string, ScheduleItem>;
  invoiceType: "Thu" | "Chi";
}

const PAYMENT_METHODS = [
  { value: "cash",     label: "Tiền mặt" },
  { value: "transfer", label: "Chuyển khoản" },
  { value: "other",    label: "Khác" },
];

export function BulkCollectDialog({
  open,
  onClose,
  onSuccess,
  initialInvoices,
  initialSchedules,
  invoiceType,
}: BulkCollectDialogProps) {
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    () => new Set(initialInvoices.map(inv => inv.id))
  );
  const [checkedScheduleIds, setCheckedScheduleIds] = useState<Set<string>>(
    () => new Set(initialSchedules?.keys() ?? [])
  );
  const [paymentDate, setPaymentDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  );
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [collectorName, setCollectorName] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const allSchedules = useMemo(
    () => Array.from(initialSchedules?.values() ?? []),
    [initialSchedules]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialInvoices;
    return initialInvoices.filter(inv =>
      (inv.code ?? "").toLowerCase().includes(q) ||
      (inv.description ?? "").toLowerCase().includes(q) ||
      (inv.name ?? "").toLowerCase().includes(q)
    );
  }, [initialInvoices, search]);

  const filteredSchedules = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allSchedules;
    return allSchedules.filter(s =>
      (s.code ?? "").toLowerCase().includes(q) ||
      (s.label ?? "").toLowerCase().includes(q)
    );
  }, [allSchedules, search]);

  const checkedInvoices = useMemo(
    () => initialInvoices.filter(inv => checkedIds.has(inv.id)),
    [initialInvoices, checkedIds]
  );

  const checkedSchedules = useMemo(
    () => allSchedules.filter(s => checkedScheduleIds.has(s.id)),
    [allSchedules, checkedScheduleIds]
  );

  const totalAmount = useMemo(() => {
    const invTotal = checkedInvoices.reduce((sum, inv) => sum + parseNum(inv.grandTotal), 0);
    const schedTotal = checkedSchedules.reduce((sum, s) => sum + parseNum(s.amount), 0);
    return invTotal + schedTotal;
  }, [checkedInvoices, checkedSchedules]);

  const alreadyPaidCount = useMemo(
    () =>
      initialInvoices.filter(inv => inv.status === "paid").length +
      allSchedules.filter(s => s.status === "paid").length,
    [initialInvoices, allSchedules]
  );

  const notPaidCount = useMemo(
    () =>
      initialInvoices.filter(inv => inv.status !== "paid").length +
      allSchedules.filter(s => s.status !== "paid").length,
    [initialInvoices, allSchedules]
  );

  const toggleOne = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSchedule = (id: string) => {
    setCheckedScheduleIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const collectMutation = useMutation({
    mutationFn: async () => {
      const unpaidInvoices = checkedInvoices.filter(inv => inv.status !== "paid");
      const unpaidSchedules = checkedSchedules.filter(s => s.status !== "paid");
      const ids = unpaidInvoices.map(inv => inv.id);
      const scheduleIds = unpaidSchedules.map(s => s.id);
      if (ids.length === 0 && scheduleIds.length === 0)
        throw new Error("Không có hoá đơn nào cần thu");
      const res = await apiRequest("POST", "/api/finance/invoices/bulk-collect", {
        ids,
        scheduleIds,
        paymentDate,
        paymentMethod,
        collectorName: collectorName.trim() || undefined,
        note: note.trim() || undefined,
      });
      const apiData = await res.json();
      return {
        ...apiData,
        _print: {
          items: [
            ...unpaidInvoices.map(inv => ({
              code: inv.code ?? "",
              description: inv.description || "",
              amount: parseNum(inv.grandTotal),
              isSchedule: false as const,
            })),
            ...unpaidSchedules.map(s => ({
              code: s.code ?? "",
              description: s.label || "",
              amount: parseNum(s.amount),
              isSchedule: true as const,
            })),
          ],
          paymentDate,
          paymentMethod,
          collectorName: collectorName.trim(),
          note: note.trim(),
        },
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
      const { ok, failed } = data.summary ?? {};
      toast({
        title: `Gộp phiếu ${invoiceType === "Thu" ? "thu" : "chi"} thành công`,
        description: `Đã xử lý ${ok ?? 0} phiếu${failed > 0 ? `, thất bại ${failed} phiếu` : ""}.`,
        variant: failed > 0 ? "destructive" : "default",
      });
      const printItems = data._print?.items ?? [];
      const printData: BulkCollectPrintData = {
        items: printItems,
        paymentDate: data._print?.paymentDate ?? paymentDate,
        paymentMethod: data._print?.paymentMethod ?? paymentMethod,
        collectorName: data._print?.collectorName ?? collectorName.trim(),
        note: data._print?.note ?? note.trim(),
        invoiceType,
        totalAmount: printItems.reduce((sum: number, i: { amount: number }) => sum + i.amount, 0),
        customerName: initialInvoices[0]?.name ?? "",
      };
      onSuccess(printData);
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: "Lỗi gộp phiếu",
        description: err?.message ?? "Vui lòng thử lại",
        variant: "destructive",
      });
    },
  });

  const isPending = collectMutation.isPending;

  const uncheckedInvoicesToPay = checkedInvoices.filter(inv => inv.status !== "paid");
  const uncheckedSchedulesToPay = checkedSchedules.filter(s => s.status !== "paid");
  const uncheckedToPay = uncheckedInvoicesToPay.length + uncheckedSchedulesToPay.length;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Merge className="h-5 w-5 text-purple-600" />
            Gộp phiếu {invoiceType === "Thu" ? "thu" : "chi"}
          </DialogTitle>

          <div className="grid grid-cols-4 gap-3 mt-3">
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-foreground">
                {initialInvoices.length + allSchedules.length}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Tổng phiếu</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{alreadyPaidCount}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Đã thanh toán</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-amber-600">{notPaidCount}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Chưa thanh toán</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-purple-700">{uncheckedToPay}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Sẽ thu gộp</div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* Left panel - Invoice list */}
          <div className="flex flex-col w-1/2 border-r min-h-0">
            <div className="px-4 py-3 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Tìm kiếm phiếu..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <tr className="border-b">
                    <th className="p-2 w-8"></th>
                    <th className="p-2 text-left font-semibold text-muted-foreground">Mã phiếu</th>
                    <th className="p-2 text-left font-semibold text-muted-foreground">Mô tả</th>
                    <th className="p-2 text-right font-semibold text-muted-foreground">Số tiền</th>
                    <th className="p-2 text-center font-semibold text-muted-foreground">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(inv => {
                    const isChecked = checkedIds.has(inv.id);
                    const isPaid = inv.status === "paid";
                    const cfg = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG["unpaid"];
                    return (
                      <tr
                        key={inv.id}
                        className={`border-b transition-colors ${isChecked ? "bg-purple-50/60" : "hover:bg-muted/30"} ${isPaid ? "opacity-50" : ""}`}
                      >
                        <td className="p-2 text-center">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => toggleOne(inv.id)}
                            disabled={isPaid}
                          />
                        </td>
                        <td className="p-2 font-mono font-medium text-purple-700 whitespace-nowrap">
                          {inv.code ?? "—"}
                        </td>
                        <td className="p-2 text-muted-foreground max-w-[140px]">
                          <span className="line-clamp-2">{inv.description || inv.name || "—"}</span>
                        </td>
                        <td className="p-2 text-right font-semibold whitespace-nowrap">
                          {fmtMoney(parseNum(inv.grandTotal))}
                        </td>
                        <td className="p-2 text-center">
                          <Badge className={`text-[10px] px-1.5 py-0 ${cfg.className}`}>
                            {cfg.label}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredSchedules.map(s => {
                    const isChecked = checkedScheduleIds.has(s.id);
                    const isPaid = s.status === "paid";
                    const cfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG["unpaid"];
                    return (
                      <tr
                        key={s.id}
                        className={`border-b transition-colors ${isChecked ? "bg-purple-50/60" : "hover:bg-muted/30"} ${isPaid ? "opacity-50" : ""}`}
                      >
                        <td className="p-2 text-center">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => toggleSchedule(s.id)}
                            disabled={isPaid}
                          />
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          <span className="font-mono font-medium text-purple-700">{s.code ?? "—"}</span>
                          <span className="ml-1.5 text-[10px] text-blue-600 bg-blue-50 border border-blue-100 px-1 py-0.5 rounded">đợt</span>
                        </td>
                        <td className="p-2 text-muted-foreground max-w-[140px]">
                          <span className="line-clamp-2">{s.label || "—"}</span>
                        </td>
                        <td className="p-2 text-right font-semibold whitespace-nowrap">
                          {fmtMoney(parseNum(s.amount))}
                        </td>
                        <td className="p-2 text-center">
                          <Badge className={`text-[10px] px-1.5 py-0 ${cfg.className}`}>
                            {cfg.label}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && filteredSchedules.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground">
                        Không tìm thấy phiếu nào
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right panel - Payment form */}
          <div className="flex flex-col w-1/2 min-h-0 overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* Total summary */}
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                  Tổng tiền sau khi gộp
                </div>
                <div className="text-3xl font-bold text-purple-700">
                  {fmtMoney(totalAmount)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {uncheckedToPay} phiếu {invoiceType === "Thu" ? "thu" : "chi"} sẽ được gộp
                </div>
              </div>

              {/* Invoice breakdown */}
              {(checkedInvoices.length > 0 || checkedSchedules.length > 0) && (
                <div className="rounded-lg border overflow-hidden">
                  <div className="px-3 py-2 bg-muted/50 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Chi tiết phiếu được chọn
                  </div>
                  <div className="divide-y max-h-40 overflow-y-auto">
                    {checkedInvoices.map(inv => (
                      <div key={inv.id} className="px-3 py-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={() => toggleOne(inv.id)}
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            disabled={inv.status === "paid"}
                          >
                            <X className="h-3 w-3" />
                          </button>
                          <span className="font-mono text-xs text-purple-700 shrink-0">
                            {inv.code ?? "—"}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">
                            {inv.description || inv.name || ""}
                          </span>
                        </div>
                        <span className="text-xs font-semibold shrink-0">
                          {fmtMoney(parseNum(inv.grandTotal))}
                        </span>
                      </div>
                    ))}
                    {checkedSchedules.map(s => (
                      <div key={s.id} className="px-3 py-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={() => toggleSchedule(s.id)}
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            disabled={s.status === "paid"}
                          >
                            <X className="h-3 w-3" />
                          </button>
                          <span className="font-mono text-xs text-purple-700 shrink-0">
                            {s.code ?? "—"}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">
                            {s.label || ""}
                          </span>
                          <span className="text-[10px] text-blue-600 bg-blue-50 border border-blue-100 px-1 py-0.5 rounded shrink-0">đợt</span>
                        </div>
                        <span className="text-xs font-semibold shrink-0">
                          {fmtMoney(parseNum(s.amount))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment form */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1">
                  Thông tin thanh toán
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Ngày {invoiceType === "Thu" ? "thu" : "chi"}</label>
                  <Input
                    type="date"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Hình thức thanh toán</label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Chọn hình thức..." />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map(m => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Người {invoiceType === "Thu" ? "thu" : "chi"} <span className="text-muted-foreground font-normal">(tuỳ chọn)</span>
                  </label>
                  <Input
                    placeholder="Nhập tên người thu..."
                    value={collectorName}
                    onChange={e => setCollectorName(e.target.value)}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Ghi chú <span className="text-muted-foreground font-normal">(tuỳ chọn)</span>
                  </label>
                  <Textarea
                    placeholder="Nhập ghi chú cho các phiếu..."
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    className="h-20 resize-none text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t shrink-0 flex items-center justify-between gap-4 bg-muted/30">
          <div className="text-sm text-muted-foreground">
            Đã chọn <span className="font-semibold text-foreground">{uncheckedToPay}</span> phiếu
            {" · "}
            Tổng <span className="font-semibold text-purple-700">{fmtMoney(totalAmount)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Hủy
            </Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700 gap-2"
              disabled={isPending || uncheckedToPay === 0}
              onClick={() => collectMutation.mutate()}
            >
              <Merge className="h-4 w-4" />
              {isPending ? "Đang xử lý..." : `Gộp & in Phiếu ${invoiceType === "Thu" ? "thu" : "chi"}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
