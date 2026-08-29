import { useState, useMemo, useEffect } from "react";
import {
  Eye, CreditCard, ChevronDown, ChevronLeft, ChevronRight, X, Check, Calendar, TableProperties, Receipt, RefreshCw,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  useDeferredTuition,
  type DeferredStudentSummary,
  type DeferredClassSummary,
} from "@/hooks/use-deferred-tuition";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function clsAttendedAmount(sessions: { deductsFee: boolean; price: number }[]) {
  return sessions.filter(s => s.deductsFee).reduce((sum, s) => sum + (s.price ?? 0), 0);
}

function clsChargeableCount(sessions: { deductsFee: boolean }[]) {
  return sessions.filter(s => s.deductsFee).length;
}

// ─── Formatters ────────────────────────────────────────────────────────────────

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(n);

const fmtMonth = (ym: string) => {
  const [y, m] = ym.split("-");
  return `Tháng ${parseInt(m, 10)}/${y}`;
};

const fmtDate = (iso: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getChargeableSessions(cls: DeferredClassSummary) {
  return cls.sessions.filter(session => session.deductsFee && session.price > 0);
}

interface DeferredTuitionReceiptDialogProps {
  open: boolean;
  student: DeferredStudentSummary | null;
  cls: DeferredClassSummary | null;
  selectedMonth: string;
  onClose: () => void;
}

function DeferredTuitionReceiptDialog({
  open,
  student,
  cls,
  selectedMonth,
  onClose,
}: DeferredTuitionReceiptDialogProps) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const chargeableSessions = useMemo(
    () => (cls ? getChargeableSessions(cls) : []),
    [cls],
  );
  const groupedItems = useMemo(() => {
    const groups = new Map<string, {
      packageId: string | null;
      packageName: string;
      unitPrice: number;
      quantity: number;
      subtotal: number;
    }>();

    for (const session of chargeableSessions) {
      const packageName = session.packageName ?? "Buổi học";
      const key = `${session.packageId ?? packageName}:${session.price}`;
      const current = groups.get(key);
      if (current) {
        current.quantity += 1;
        current.subtotal += session.price;
      } else {
        groups.set(key, {
          packageId: session.packageId,
          packageName,
          unitPrice: session.price,
          quantity: 1,
          subtotal: session.price,
        });
      }
    }

    return Array.from(groups.values());
  }, [chargeableSessions]);
  const total = groupedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const parsedAmount = parseInt(amount.replace(/\D/g, ""), 10) || 0;
  const monthLabel = selectedMonth ? fmtMonth(selectedMonth) : "Học phí trả sau";

  const buildDescription = () =>
    `Thu học phí trả sau - ${student?.studentName ?? ""} - ${cls?.className ?? ""} - ${monthLabel}`;

  useEffect(() => {
    if (open && student && cls) {
      setAmount(String(total));
      setDescription(buildDescription());
    }
  }, [open, student, cls, selectedMonth, total]);

  const createInvoiceMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/finance/invoices", body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Tạo phiếu thu thành công" });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/deferred-tuition"] });
      onClose();
    },
    onError: (err: Error) => {
      toast({
        title: "Lỗi khi tạo phiếu thu",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleConfirm = () => {
    if (!student || !cls) return;
    if (parsedAmount > total) {
      toast({
        title: "Số tiền thu không được vượt quá tổng học phí",
        description: `Tối đa ${fmtMoney(total)}`,
        variant: "destructive",
      });
      return;
    }

    const desc = description.trim() || buildDescription();
    const remainingAmount = Math.max(0, total - parsedAmount);
    const status = parsedAmount >= total ? "paid" : parsedAmount > 0 ? "partial" : "unpaid";
    const paymentSchedule = parsedAmount > 0 && parsedAmount < total
      ? [
          {
            label: "ĐỢT 1",
            amount: String(parsedAmount),
            dueDate: new Date().toISOString().split("T")[0],
            status: "paid",
          },
          {
            label: "ĐỢT 2",
            amount: String(remainingAmount),
            dueDate: null,
            status: "unpaid",
          },
        ]
      : [];

    createInvoiceMutation.mutate({
      type: "Thu",
      locationId: cls.locationId,
      studentId: student.studentId,
      subjectName: student.studentName,
      classId: cls.classId,
      category: "Học phí",
      account: "111",
      counterAccount: "511",
      totalAmount: String(total),
      totalPromotion: "0",
      totalSurcharge: "0",
      grandTotal: String(total),
      paidAmount: String(parsedAmount),
      remainingAmount: String(remainingAmount),
      paymentNote: `DEFERRED_TUITION:${selectedMonth}`,
      description: desc,
      note: desc,
      status,
      items: groupedItems.map(item => ({
        packageName: item.packageName,
        packageId: item.packageId,
        // Deferred tuition is collected per attended session, so the
        // invoice editor calculates unit price × quantity correctly.
        packageType: "buổi",
        unitPrice: String(item.unitPrice),
        quantity: item.quantity,
        promotionKeys: [],
        surchargeKeys: [],
        promotionAmount: "0",
        surchargeAmount: "0",
        subtotal: String(item.subtotal),
        category: "Học phí",
      })),
      paymentSchedule,
    });
  };

  const isPending = createInvoiceMutation.isPending;

  if (!student || !cls) return null;

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Receipt className="h-4 w-4 text-rose-600" />
            Tạo phiếu thu học phí
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Học viên:</span>
              <span className="text-right font-medium">{student.studentName}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Lớp:</span>
              <span className="text-right">{cls.className}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Thời gian:</span>
              <span className="text-right">{monthLabel}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Tổng học phí:</span>
              <span className="font-semibold text-rose-600">{fmtMoney(total)}</span>
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Mô tả phiếu</label>
              <Textarea
                value={description}
                onChange={event => setDescription(event.target.value)}
                className="text-sm resize-none min-h-[60px]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Số tiền thu <span className="font-normal">(có thể bỏ trống)</span>
              </label>
              <Input
                type="text"
                inputMode="numeric"
                value={parsedAmount > 0 ? parsedAmount.toLocaleString("vi-VN") : ""}
                onChange={event => setAmount(event.target.value.replace(/\D/g, ""))}
                placeholder="Nhập số tiền..."
                className="h-9 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Để trống để tạo phiếu thu chưa thanh toán.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Hủy
          </Button>
          <Button
            size="sm"
            className="gap-1.5 bg-rose-600 text-white hover:bg-rose-700"
            onClick={handleConfirm}
            disabled={isPending}
          >
            <Receipt className="h-3.5 w-3.5" />
            {isPending ? "Đang xử lý..." : "Tạo phiếu thu"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const SHORT_MONTHS = [
  "Thg1","Thg2","Thg3","Thg4","Thg5","Thg6",
  "Thg7","Thg8","Thg9","Thg10","Thg11","Thg12",
];

// ─── MonthPicker ───────────────────────────────────────────────────────────────

interface MonthPickerProps {
  value: string;
  onChange: (ym: string) => void;
}

function MonthPicker({ value, onChange }: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const currentYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const [pickerYear, setPickerYear] = useState<number>(() =>
    value ? parseInt(value.split("-")[0], 10) : today.getFullYear()
  );

  const displayValue = value
    ? `${value.split("-")[1]}/${value.split("-")[0]}`
    : "";

  const selectedMonthNum = value && value.split("-")[0] === String(pickerYear)
    ? parseInt(value.split("-")[1], 10)
    : null;

  const handleSelect = (month: number) => {
    onChange(`${pickerYear}-${String(month).padStart(2, "0")}`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative h-9 flex items-center border border-input rounded-md bg-background px-3 cursor-pointer hover:bg-accent transition-colors min-w-[140px]">
          <span className="text-xs text-muted-foreground absolute -top-2 left-2 bg-background px-1 leading-none">
            Chọn tháng năm
          </span>
          <span className="text-sm flex-1">{displayValue}</span>
          <Calendar className="h-4 w-4 text-muted-foreground ml-2 shrink-0" />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setPickerYear(y => y - 1)}
            className="p-1 rounded hover:bg-accent transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold">
            {selectedMonthNum ? `Tháng ${selectedMonthNum} ` : ""}Năm {pickerYear}
          </span>
          <button
            onClick={() => setPickerYear(y => y + 1)}
            className="p-1 rounded hover:bg-accent transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {SHORT_MONTHS.map((label, idx) => {
            const monthNum = idx + 1;
            const ym = `${pickerYear}-${String(monthNum).padStart(2, "0")}`;
            const isSelected = value === ym;
            const isCurrent = currentYM === ym;
            return (
              <button
                key={monthNum}
                onClick={() => handleSelect(monthNum)}
                className={[
                  "rounded py-2 text-sm transition-colors",
                  isSelected
                    ? "bg-purple-600 text-white font-semibold"
                    : isCurrent
                    ? "font-bold text-purple-700 hover:bg-accent"
                    : "hover:bg-accent text-foreground",
                ].join(" ")}
              >
                {label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── MultiSelect ───────────────────────────────────────────────────────────────

interface MultiSelectProps {
  options: { id: string; name: string }[];
  selected: string[];
  onChange: (val: string[]) => void;
  placeholder: string;
}

function MultiSelect({ options, selected, onChange, placeholder }: MultiSelectProps) {
  const [open, setOpen] = useState(false);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);

  const selectedNames = options.filter(o => selected.includes(o.id)).map(o => o.name);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 min-w-[180px] max-w-[260px] justify-between font-normal"
        >
          <span className="truncate text-left">
            {selected.length === 0
              ? placeholder
              : selected.length === 1
              ? selectedNames[0]
              : `${selected.length} đã chọn`}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Tìm kiếm..." />
          <CommandList>
            <CommandEmpty>Không tìm thấy.</CommandEmpty>
            <CommandGroup>
              {options.map(opt => (
                <CommandItem key={opt.id} value={opt.name} onSelect={() => toggle(opt.id)}>
                  <Check
                    className={`mr-2 h-4 w-4 ${selected.includes(opt.id) ? "opacity-100" : "opacity-0"}`}
                  />
                  <span className="truncate">{opt.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── ClassDetailDialog ─────────────────────────────────────────────────────────

interface ClassDetailDialogProps {
  student: DeferredStudentSummary | null;
  cls: DeferredClassSummary | null;
  selectedMonth: string;
  onClose: () => void;
}

const SESSION_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending:      { label: "Chưa điểm danh", className: "bg-gray-50 text-gray-600 border-gray-200" },
  scheduled:    { label: "Chưa điểm danh", className: "bg-gray-50 text-gray-600 border-gray-200" },
  present:      { label: "Có học",         className: "bg-green-50 text-green-700 border-green-200" },
  attended:     { label: "Có học",         className: "bg-green-50 text-green-700 border-green-200" },
  absent:       { label: "Nghỉ học",       className: "bg-red-50 text-red-700 border-red-200" },
  makeup_wait:  { label: "Nghỉ chờ bù",   className: "bg-orange-50 text-orange-700 border-orange-200" },
  makeup_done:  { label: "Đã học bù",     className: "bg-blue-50 text-blue-700 border-blue-200" },
};

function ClassDetailDialog({ student, cls, selectedMonth, onClose }: ClassDetailDialogProps) {
  if (!student || !cls) return null;
  const unpaidCount = cls.sessions.filter(s => !s.isPaid).length;
  const attendedSessions = cls.sessions.filter(s => s.deductsFee);
  const attendedCount = attendedSessions.length;
  const attendedTotal = attendedSessions.reduce((sum, s) => sum + (s.price ?? 0), 0);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            {cls.className}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              — {student.studentName}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Lịch học{selectedMonth ? ` — ${fmtMonth(selectedMonth)}` : ""}
            </span>
            {unpaidCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 font-medium">
                {unpaidCount} buổi chưa thanh toán
              </span>
            )}
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-8">#</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Ngày học</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Trạng thái</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Gói học phí</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Học phí</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Đã học</th>
                </tr>
              </thead>
              <tbody>
                {cls.sessions.map((s, i) => {
                  const statusCfg = SESSION_STATUS_LABEL[s.status ?? ""] ?? { label: s.status ?? "—", className: "bg-gray-50 text-gray-600 border-gray-200" };
                  return (
                    <tr key={s.sessionId} className="border-t hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 text-muted-foreground text-xs">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{fmtDate(s.date)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusCfg.className}`}>
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {s.packageName ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-purple-700">
                        {s.price > 0 ? fmtMoney(s.price) : "—"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {s.deductsFee
                          ? <span className="text-green-600 font-bold text-base leading-none">✓</span>
                          : <span className="text-muted-foreground text-base leading-none">—</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t bg-muted/20">
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-sm font-semibold">
                    Tổng ({attendedCount} buổi)
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-purple-700">
                    {fmtMoney(attendedTotal)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── StudentSummaryDialog ──────────────────────────────────────────────────────

interface StudentSummaryDialogProps {
  student: DeferredStudentSummary | null;
  selectedMonth: string;
  onClose: () => void;
}

const SUMMARY_STATUS_STYLE: Record<string, { label: string; color: string }> = {
  present:     { label: "Có học",          color: "text-green-600" },
  attended:    { label: "Có học",          color: "text-green-600" },
  absent:      { label: "Nghỉ học",        color: "text-red-500" },
  makeup_wait: { label: "Nghỉ chờ bù",    color: "text-orange-500" },
  makeup_done: { label: "Đã học bù",      color: "text-blue-500" },
  pending:     { label: "Chưa điểm danh", color: "text-gray-400" },
  scheduled:   { label: "Chưa điểm danh", color: "text-gray-400" },
};

function StudentSummaryDialog({ student, selectedMonth, onClose }: StudentSummaryDialogProps) {
  if (!student) return null;

  const allDates = useMemo(() => {
    const set = new Set<string>();
    student.classes.forEach(cls => cls.sessions.forEach(s => set.add(s.date)));
    return Array.from(set).sort();
  }, [student]);

  const totalSessions = student.classes.reduce((sum, cls) => sum + cls.sessions.length, 0);
  const totalDeducts  = student.classes.reduce(
    (sum, cls) => sum + cls.sessions.filter(s => s.deductsFee).length, 0
  );
  const totalAmount = student.classes.reduce(
    (sum, cls) => sum + clsAttendedAmount(cls.sessions), 0
  );

  // Right-sticky column widths (px) — keep in sync with min-w below
  const W_HOCPHI   = 120;
  const W_DAHOC    = 80;
  const W_TONGBUOI = 90;

  const stickyRight = {
    tongBuoi: { position: "sticky" as const, right: W_DAHOC + W_HOCPHI, background: "#fff", zIndex: 20, minWidth: W_TONGBUOI },
    daHoc:    { position: "sticky" as const, right: W_HOCPHI,           background: "#fff", zIndex: 20, minWidth: W_DAHOC },
    hocPhi:   { position: "sticky" as const, right: 0,                  background: "#fff", zIndex: 20, minWidth: W_HOCPHI },
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        className="p-0 overflow-hidden rounded-2xl flex flex-col"
        style={{ width: "98vw", maxWidth: "98vw", height: "90vh", maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 bg-gray-100 border-b">
          <div>
            <h2 className="text-slate-800 font-semibold text-base leading-tight">{student.studentName}</h2>
            <p className="text-slate-500 text-xs mt-0.5">
              Tổng hợp buổi học{selectedMonth ? ` — ${fmtMonth(selectedMonth)}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 transition-colors rounded-md p-1 hover:bg-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable table area */}
        <div className="flex-1 overflow-auto" style={{ position: "relative" }}>
          <table className="border-collapse text-sm" style={{ width: "max-content", minWidth: "100%" }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, zIndex: 30, background: "#fff" }}>
                {/* Left sticky: class name */}
                <th
                  className="text-left px-3 py-3 text-xs font-semibold text-slate-500 border-b border-r"
                  style={{ position: "sticky", left: 0, background: "#fff", zIndex: 31, minWidth: 120, whiteSpace: "nowrap" }}
                >
                  Lớp \ Ngày học
                </th>
                {/* Date columns */}
                {allDates.map(date => (
                  <th
                    key={date}
                    className="px-2 py-3 text-center text-xs font-medium text-slate-500 border-b border-r"
                    style={{ minWidth: 110, background: "#fff" }}
                  >
                    {fmtDate(date)}
                  </th>
                ))}
                {/* Right sticky columns */}
                <th
                  className="px-3 py-3 text-center text-xs font-semibold text-slate-600 border-b border-l border-r"
                  style={stickyRight.tongBuoi}
                >
                  Tổng buổi
                </th>
                <th
                  className="px-3 py-3 text-center text-xs font-semibold text-orange-600 border-b border-r"
                  style={stickyRight.daHoc}
                >
                  Đã học
                </th>
                <th
                  className="px-3 py-3 text-center text-xs font-semibold text-purple-700 border-b"
                  style={stickyRight.hocPhi}
                >
                  Học phí
                </th>
              </tr>
            </thead>

            <tbody>
              {student.classes.map((cls, ci) => {
                const sessionByDate = new Map(cls.sessions.map(s => [s.date, s]));
                const deductsCount = cls.sessions.filter(s => s.deductsFee).length;
                const attendedAmt = clsAttendedAmount(cls.sessions);
                const rowBg = ci % 2 === 0 ? "#fff" : "#f8fafc";
                return (
                  <tr key={cls.classId}>
                    {/* Left sticky */}
                    <td
                      className="px-3 py-3 font-semibold text-sm border-b border-r"
                      style={{ position: "sticky", left: 0, background: rowBg, zIndex: 10, whiteSpace: "nowrap" }}
                    >
                      {cls.className}
                    </td>
                    {/* Date cells */}
                    {allDates.map(date => {
                      const s = sessionByDate.get(date);
                      if (!s) return (
                        <td key={date} className="px-2 py-3 text-center border-b border-r" style={{ background: rowBg }}>
                          <span className="text-slate-300 text-xs">—</span>
                        </td>
                      );
                      const st = SUMMARY_STATUS_STYLE[s.status ?? ""] ?? { label: s.status ?? "—", color: "text-slate-400" };
                      const cellBg = s.deductsFee ? "#f0fdf4" : rowBg;
                      return (
                        <td key={date} className="px-2 py-3 text-center border-b border-r" style={{ background: cellBg }}>
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={`text-xs font-medium ${st.color}`}>{st.label}</span>
                            {s.packageName && (
                              <span className="text-[10px] text-slate-400 leading-tight">{s.packageName}</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    {/* Right sticky cells */}
                    <td
                      className="px-3 py-3 text-center border-b border-l border-r"
                      style={{ ...stickyRight.tongBuoi, background: rowBg }}
                    >
                      <span className="font-semibold text-sm">{cls.sessions.length}</span>
                    </td>
                    <td
                      className="px-3 py-3 text-center border-b border-r"
                      style={{ ...stickyRight.daHoc, background: rowBg }}
                    >
                      <span className="font-bold text-orange-600">{deductsCount}</span>
                    </td>
                    <td
                      className="px-3 py-3 text-center border-b"
                      style={{ ...stickyRight.hocPhi, background: rowBg }}
                    >
                      <span className="font-semibold text-purple-700">
                        {attendedAmt > 0 ? fmtMoney(attendedAmt) : "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Sticky bottom footer */}
            <tfoot>
              <tr style={{ position: "sticky", bottom: 0, zIndex: 30, background: "#fff" }}>
                <td
                  className="px-3 py-3 font-bold text-sm border-t border-r uppercase tracking-wide text-slate-500"
                  style={{ position: "sticky", left: 0, background: "#fff", zIndex: 31 }}
                >
                  Tổng
                </td>
                {allDates.map(date => (
                  <td key={date} className="border-t border-r" style={{ background: "#fff" }} />
                ))}
                <td
                  className="px-3 py-3 text-center border-t border-l border-r"
                  style={{ ...stickyRight.tongBuoi, background: "#fff" }}
                >
                  <span className="font-bold text-sm">{totalSessions}</span>
                </td>
                <td
                  className="px-3 py-3 text-center border-t border-r"
                  style={{ ...stickyRight.daHoc, background: "#fff" }}
                >
                  <span className="font-bold text-orange-600">{totalDeducts}</span>
                </td>
                <td
                  className="px-3 py-3 text-center border-t"
                  style={{ ...stickyRight.hocPhi, background: "#fff" }}
                >
                  <span className="font-bold text-purple-700">{fmtMoney(totalAmount)}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── StudentCard ───────────────────────────────────────────────────────────────

interface StudentCardProps {
  student: DeferredStudentSummary;
  selectedMonth: string;
  onViewDetail: (student: DeferredStudentSummary, cls: DeferredClassSummary) => void;
  onViewSummary: (student: DeferredStudentSummary) => void;
  onCreateReceipt: (student: DeferredStudentSummary, cls: DeferredClassSummary) => void;
}

function StudentCard({ student, selectedMonth, onViewDetail, onViewSummary, onCreateReceipt }: StudentCardProps) {
  const initial = student.studentName.charAt(0).toUpperCase();
  const studentAttendedTotal = student.classes.reduce(
    (sum, cls) => sum + clsAttendedAmount(cls.sessions), 0
  );

  return (
    <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-bold shrink-0 select-none">
            {initial}
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sm leading-tight">{student.studentName}</span>
            <span className="text-xs text-muted-foreground">
              {student.totalSessions} buổi chưa thanh toán
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-purple-100 text-purple-700 border-purple-200 font-semibold text-sm px-3">
            {fmtMoney(studentAttendedTotal)}
          </Badge>
          <button
            onClick={() => onViewSummary(student)}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-purple-100 text-purple-400 hover:text-purple-700 transition-colors"
            title="Xem bảng tổng hợp"
          >
            <TableProperties className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Classes table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] table-fixed text-sm">
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[24%]" />
            <col className="w-[18%]" />
            <col className="w-[14%]" />
           <col className="w-[12%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead>
            <tr className="border-b bg-muted/10">
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Tên lớp</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">
                Số buổi{selectedMonth ? ` (${fmtMonth(selectedMonth)})` : ""}
              </th>
              <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">
                Số buổi tính phí
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Tổng tiền</th>
               <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Đã thu</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Hóa đơn</th>
            </tr>
          </thead>
          <tbody>
            {student.classes.map(cls => {
              const attended = clsAttendedAmount(cls.sessions);
              const hasReceipt = cls.hasReceipt;
              return (
              <tr key={cls.classId} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                <td className="truncate px-4 py-2.5 font-medium">{cls.className}</td>
                 <td className="px-4 py-2.5 text-center">
                   <div className="inline-flex items-center justify-center gap-1.5">
                     <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-xs font-semibold border border-purple-200">
                       {cls.totalSessions} buổi
                     </span>
                     <button
                       onClick={() => onViewDetail(student, cls)}
                       className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                       title="Xem lịch học chi tiết"
                     >
                       <Eye className="h-4 w-4" />
                     </button>
                   </div>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 text-xs font-semibold border border-orange-200">
                    {clsChargeableCount(cls.sessions)} buổi
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-purple-700">
                  {attended > 0 ? fmtMoney(attended) : "—"}
                </td>
                 <td className="px-4 py-2.5 text-right font-semibold">
                   {cls.receiptPaidAmount > 0 ? (
                     <span className="text-green-600">{fmtMoney(cls.receiptPaidAmount)}</span>
                   ) : (
                     <span className="text-muted-foreground">0 ₫</span>
                   )}
                 </td>
                 <td className="px-4 py-2.5 text-center">
                   <button
                     onClick={() => onCreateReceipt(student, cls)}
                      disabled={attended <= 0 || hasReceipt}
                      className={hasReceipt
                         ? "inline-flex items-center justify-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 py-1.5 text-xs font-medium text-green-700 disabled:cursor-not-allowed"
                        : "inline-flex items-center justify-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"}
                      title={hasReceipt
                        ? "Đã tạo phiếu thu cho tháng này"
                        : attended > 0
                        ? "Tạo phiếu thu học phí"
                        : "Không có buổi tính phí"}
                   >
                     <Receipt className="h-3.5 w-3.5" />
                       {hasReceipt ? "Đã tạo" : "Phiếu thu"}
                   </button>
                 </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── DeferredTuitionTab ────────────────────────────────────────────────────────

export function DeferredTuitionTab() {
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [detailStudent, setDetailStudent] = useState<DeferredStudentSummary | null>(null);
  const [detailClass, setDetailClass] = useState<DeferredClassSummary | null>(null);
  const [summaryStudent, setSummaryStudent] = useState<DeferredStudentSummary | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<{
    student: DeferredStudentSummary;
    cls: DeferredClassSummary;
  } | null>(null);

  const { data, isLoading, isFetching, refetch } = useDeferredTuition({
    studentIds: selectedStudentIds.length ? selectedStudentIds : undefined,
    classIds: selectedClassIds.length ? selectedClassIds : undefined,
    month: selectedMonth || undefined,
    page,
    pageSize,
  });

  const students = data?.students ?? [];
  const allStudents = data?.allStudents ?? [];
  const allClasses = data?.allClasses ?? [];
  const total = data?.total ?? 0;

  const hasActiveFilters = selectedStudentIds.length > 0 || selectedClassIds.length > 0;

  const clearFilters = () => {
    setSelectedStudentIds([]);
    setSelectedClassIds([]);
    setSelectedMonth(getCurrentMonth());
    setPage(1);
  };

  const totalAmount = useMemo(
    () => students.reduce(
      (s, st) => s + st.classes.reduce((cs, cls) => cs + clsAttendedAmount(cls.sessions), 0),
      0
    ),
    [students]
  );

  const handleViewDetail = (student: DeferredStudentSummary, cls: DeferredClassSummary) => {
    setDetailStudent(student);
    setDetailClass(cls);
  };

  const handleCloseDetail = () => {
    setDetailStudent(null);
    setDetailClass(null);
  };

  const handleViewSummary = (student: DeferredStudentSummary) => {
    setSummaryStudent(student);
  };

  const handleCloseSummary = () => {
    setSummaryStudent(null);
  };

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelect
          options={allStudents}
          selected={selectedStudentIds}
          onChange={v => { setSelectedStudentIds(v); setPage(1); }}
          placeholder="Lọc theo học viên"
        />
        <MultiSelect
          options={allClasses}
          selected={selectedClassIds}
          onChange={v => { setSelectedClassIds(v); setPage(1); }}
          placeholder="Lọc theo lớp"
        />
        <MonthPicker value={selectedMonth} onChange={v => { setSelectedMonth(v); setPage(1); }} />

        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5"
          onClick={() => refetch()}
          disabled={isFetching}
          title="Tải lại dữ liệu học phí trả sau"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Cập nhật
        </Button>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1 text-muted-foreground"
            onClick={clearFilters}
          >
            <X className="h-3.5 w-3.5" /> Xoá lọc
          </Button>
        )}

        {!isLoading && total > 0 && (
          <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
            <span>{total} học viên</span>
            <span className="text-purple-700 font-semibold">{fmtMoney(totalAmount)}</span>
          </div>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center gap-2 py-20 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
          <p className="text-sm">Đang tải dữ liệu...</p>
        </div>
      ) : students.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-20 text-muted-foreground">
          <CreditCard className="h-12 w-12 opacity-20" />
          <p className="text-sm font-medium">Không có học phí trả sau nào</p>
          <p className="text-xs">
            {selectedMonth
              ? `Không có dữ liệu cho ${fmtMonth(selectedMonth)}.`
              : "Tất cả học phí đã được thanh toán."}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto space-y-3 min-h-0">
          {students.map(student => (
            <StudentCard
              key={student.studentId}
              student={student}
              selectedMonth={selectedMonth}
              onViewDetail={handleViewDetail}
              onViewSummary={handleViewSummary}
              onCreateReceipt={(student, cls) => setReceiptTarget({ student, cls })}
            />
          ))}
        </div>
      )}

      {/* Pagination footer */}
      {!isLoading && students.length > 0 && (
        <div className="shrink-0 flex items-center justify-between text-sm text-muted-foreground pt-1">
          <div className="flex items-center gap-2">
            <span>{total} học viên</span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="h-7 rounded border border-input bg-background px-2 text-xs"
            >
              {[20, 30, 50, 100].map(n => <option key={n} value={n}>{n} / trang</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button className="h-7 w-7 rounded border border-input bg-background text-xs disabled:opacity-50" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
            <button className="h-7 w-7 rounded border border-input bg-background text-xs disabled:opacity-50" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
            <span className="px-2 text-xs">Trang {page} / {Math.max(1, Math.ceil(total / pageSize))}</span>
            <button className="h-7 w-7 rounded border border-input bg-background text-xs disabled:opacity-50" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(p => p + 1)}>›</button>
            <button className="h-7 w-7 rounded border border-input bg-background text-xs disabled:opacity-50" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(Math.ceil(total / pageSize))}>»</button>
          </div>
        </div>
      )}

      <ClassDetailDialog
        student={detailStudent}
        cls={detailClass}
        selectedMonth={selectedMonth}
        onClose={handleCloseDetail}
      />

      <StudentSummaryDialog
        student={summaryStudent}
        selectedMonth={selectedMonth}
        onClose={handleCloseSummary}
      />

      <DeferredTuitionReceiptDialog
        open={receiptTarget !== null}
        student={receiptTarget?.student ?? null}
        cls={receiptTarget?.cls ?? null}
        selectedMonth={selectedMonth}
        onClose={() => setReceiptTarget(null)}
      />
    </div>
  );
}
