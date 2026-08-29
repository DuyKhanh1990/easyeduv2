import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  Plus, Trash2, Gift, AlertTriangle, Search,
  ChevronLeft, ChevronRight, CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const PAGE_SIZES = [20, 30, 50];

function formatVND(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount) + " ₫";
}

interface StaffReward {
  id: string;
  staffId: string;
  type: "reward" | "penalty";
  date: string;
  amount: number;
  reason?: string;
  createdAt: string;
}

interface Staff {
  id: string;
  fullName: string;
  code?: string;
}

interface ThuongPhatTabProps {
  canCreate?: boolean;
  canDelete?: boolean;
}

export function ThuongPhatTab({ canCreate = false, canDelete = false }: ThuongPhatTabProps) {
  const { toast } = useToast();

  // ── Dialog state ─────────────────────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [rewardType, setRewardType] = useState<"reward" | "penalty">("reward");
  const [form, setForm] = useState({
    staffId: "",
    date: format(new Date(), "yyyy-MM-dd"),
    amount: "",
    reason: "",
  });
  const [staffSearch, setStaffSearch] = useState("");
  const [staffDropdownOpen, setStaffDropdownOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // ── Filter / pagination ───────────────────────────────────────────────────────
  const [filterType, setFilterType] = useState<"all" | "reward" | "penalty">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // ── Data ─────────────────────────────────────────────────────────────────────
  const { data: records = [], isLoading } = useQuery<StaffReward[]>({
    queryKey: ["/api/staff-rewards", filterType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterType !== "all") params.append("type", filterType);
      const res = await fetch(`/api/staff-rewards?${params.toString()}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: staff = [] } = useQuery<Staff[]>({
    queryKey: ["/api/staff", "minimal"],
    queryFn: async () => {
      const res = await fetch("/api/staff?minimal=true", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const filteredStaff = useMemo(() => {
    if (!staffSearch.trim()) return staff as Staff[];
    const q = staffSearch.toLowerCase();
    return (staff as Staff[]).filter(
      (s) => s.fullName.toLowerCase().includes(q) || (s.code ?? "").toLowerCase().includes(q)
    );
  }, [staff, staffSearch]);

  const selectedStaff = (staff as Staff[]).find((s) => s.id === form.staffId);

  function getStaffName(staffId: string) {
    const s = (staff as Staff[]).find((x) => x.id === staffId);
    return s ? `${s.code ? s.code + " " : ""}${s.fullName}` : staffId;
  }

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/staff-rewards", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-rewards"] });
      toast({ title: "Thành công", description: `Đã tạo phiếu ${rewardType === "reward" ? "thưởng" : "phạt"} thành công` });
      setOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err?.message || "Không thể tạo phiếu", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/staff-rewards/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-rewards"] });
      toast({ title: "Đã xoá" });
    },
  });

  function resetForm() {
    setForm({ staffId: "", date: format(new Date(), "yyyy-MM-dd"), amount: "", reason: "" });
    setStaffSearch("");
    setRewardType("reward");
  }

  function handleSubmit() {
    if (!form.staffId) {
      toast({ title: "Lỗi", description: "Vui lòng chọn nhân viên", variant: "destructive" });
      return;
    }
    const amount = parseInt(form.amount.replace(/\D/g, ""), 10);
    if (!amount || amount <= 0) {
      toast({ title: "Lỗi", description: "Số tiền phải lớn hơn 0", variant: "destructive" });
      return;
    }
    if (!form.date) {
      toast({ title: "Lỗi", description: "Vui lòng chọn ngày", variant: "destructive" });
      return;
    }
    createMutation.mutate({ staffId: form.staffId, type: rewardType, date: form.date, amount, reason: form.reason });
  }

  // Pagination
  const totalItems = records.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginated = useMemo(
    () => records.slice((page - 1) * pageSize, page * pageSize),
    [records, page, pageSize]
  );
  const countReward = records.filter((r) => r.type === "reward").length;
  const countPenalty = records.filter((r) => r.type === "penalty").length;
  const totalRewardAmt = records.filter((r) => r.type === "reward").reduce((s, r) => s + r.amount, 0);
  const totalPenaltyAmt = records.filter((r) => r.type === "penalty").reduce((s, r) => s + r.amount, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Summary strip ── */}
      <div className="shrink-0 px-5 pt-3 pb-0">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <button
            onClick={() => { setFilterType(filterType === "reward" ? "all" : "reward"); setPage(1); }}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all",
              filterType === "reward"
                ? "bg-emerald-50 border-emerald-200 shadow-sm"
                : "bg-white border-slate-200 hover:border-emerald-200 hover:bg-emerald-50/40"
            )}
          >
            <div className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
              filterType === "reward" ? "bg-emerald-100" : "bg-slate-100"
            )}>
              <Gift className={cn("h-4 w-4", filterType === "reward" ? "text-emerald-600" : "text-slate-400")} />
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Thưởng</p>
              <p className="text-sm font-bold text-emerald-700">{formatVND(totalRewardAmt)}</p>
              <p className="text-[10px] text-slate-400">{countReward} phiếu</p>
            </div>
          </button>

          <button
            onClick={() => { setFilterType(filterType === "penalty" ? "all" : "penalty"); setPage(1); }}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all",
              filterType === "penalty"
                ? "bg-red-50 border-red-200 shadow-sm"
                : "bg-white border-slate-200 hover:border-red-200 hover:bg-red-50/40"
            )}
          >
            <div className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
              filterType === "penalty" ? "bg-red-100" : "bg-slate-100"
            )}>
              <AlertTriangle className={cn("h-4 w-4", filterType === "penalty" ? "text-red-500" : "text-slate-400")} />
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Phạt</p>
              <p className="text-sm font-bold text-red-600">{formatVND(totalPenaltyAmt)}</p>
              <p className="text-[10px] text-slate-400">{countPenalty} phiếu</p>
            </div>
          </button>
        </div>
      </div>

      {/* ── Add button + table card ── */}
      <div className="flex-1 flex flex-col overflow-hidden mx-5 mb-4 bg-white dark:bg-gray-950 rounded-xl border border-slate-200 dark:border-gray-800 shadow-sm">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 shrink-0 bg-slate-50/50">
          <div className="flex items-center gap-2">
            {(["all", "reward", "penalty"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setFilterType(t); setPage(1); }}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-all border",
                  filterType === t
                    ? t === "reward"
                      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                      : t === "penalty"
                      ? "bg-red-100 text-red-600 border-red-200"
                      : "bg-violet-100 text-violet-700 border-violet-200"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                )}
              >
                {t === "all" ? "Tất cả" : t === "reward" ? "Thưởng" : "Phạt"}
              </button>
            ))}
          </div>
          {canCreate && (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => { resetForm(); setOpen(true); }}
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm mới
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse" style={{ minWidth: 640 }}>
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-100 dark:bg-slate-900" style={{ boxShadow: "0 1px 0 0 #e2e8f0" }}>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-48">Nhân viên</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Loại</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Ngày</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-36">Số tiền</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Lý do</th>
                {canDelete && (
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-16"></th>
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <div className="w-8 h-8 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
                      <span className="text-sm">Đang tải...</span>
                    </div>
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <Gift className="w-10 h-10 opacity-25" />
                      <p className="text-sm font-medium">Chưa có phiếu thưởng / phạt</p>
                      <p className="text-xs opacity-60">Nhấn "Thêm mới" để tạo phiếu đầu tiên</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginated.map((r, idx) => {
                  const isEven = idx % 2 === 0;
                  const rowBg = isEven ? "bg-white" : "bg-slate-50/60";
                  const isReward = r.type === "reward";
                  return (
                    <tr key={r.id} className={cn("group hover:bg-violet-50/30 transition-colors", rowBg)}>
                      <td className="px-4 py-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-bold text-violet-600 uppercase">
                              {getStaffName(r.staffId).charAt(0)}
                            </span>
                          </div>
                          <span className="text-xs font-semibold text-slate-700 truncate max-w-[150px]">
                            {getStaffName(r.staffId)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 border-b border-slate-100 text-center">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border",
                          isReward
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-red-50 text-red-600 border-red-200"
                        )}>
                          {isReward ? <Gift className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                          {isReward ? "Thưởng" : "Phạt"}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-b border-slate-100 text-xs text-slate-600 font-medium">
                        {r.date ? format(new Date(r.date), "dd/MM/yyyy") : "—"}
                      </td>
                      <td className="px-4 py-3 border-b border-slate-100 text-right">
                        <span className={cn(
                          "text-sm font-bold",
                          isReward ? "text-emerald-700" : "text-red-600"
                        )}>
                          {isReward ? "+" : "-"}{formatVND(r.amount)}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-b border-slate-100 max-w-xs">
                        {r.reason
                          ? <p className="text-xs text-slate-600 truncate" title={r.reason}>{r.reason}</p>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      {canDelete && (
                        <td className="px-4 py-3 border-b border-slate-100 text-center">
                          <button
                            title="Xoá"
                            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors mx-auto opacity-0 group-hover:opacity-100"
                            onClick={() => { if (confirm("Xoá phiếu này?")) deleteMutation.mutate(r.id); }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 shrink-0 bg-slate-50/50">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Hiển thị</span>
            <select
              className="border border-slate-200 rounded-md text-xs px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            >
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span>bản ghi</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-violet-50 hover:border-violet-300 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-slate-500 min-w-[80px] text-center font-medium">
              Trang {page} / {totalPages}
            </span>
            <button
              className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-violet-50 hover:border-violet-300 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── CREATE DIALOG ── */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
            <DialogTitle className="flex items-center gap-2.5 text-base">
              <div className={cn(
                "w-8 h-8 rounded-xl flex items-center justify-center",
                rewardType === "reward" ? "bg-emerald-100" : "bg-red-100"
              )}>
                {rewardType === "reward"
                  ? <Gift className="h-4 w-4 text-emerald-600" />
                  : <AlertTriangle className="h-4 w-4 text-red-500" />}
              </div>
              Tạo phiếu {rewardType === "reward" ? "thưởng" : "phạt"}
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 py-5 space-y-5">
            {/* ── Type toggle ── */}
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setRewardType("reward")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                  rewardType === "reward"
                    ? "bg-white text-emerald-700 shadow-sm border border-emerald-100"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Gift className="h-4 w-4" />
                Thưởng
              </button>
              <button
                type="button"
                onClick={() => setRewardType("penalty")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                  rewardType === "penalty"
                    ? "bg-white text-red-600 shadow-sm border border-red-100"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                <AlertTriangle className="h-4 w-4" />
                Phạt
              </button>
            </div>

            {/* ── Staff picker with search ── */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Nhân viên <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setStaffDropdownOpen((v) => !v)}
                  className={cn(
                    "w-full flex items-center justify-between border rounded-xl px-3 py-2.5 text-sm transition-all text-left",
                    staffDropdownOpen
                      ? "border-violet-400 ring-2 ring-violet-100 bg-white"
                      : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                  )}
                >
                  <span className={selectedStaff ? "text-slate-800 font-medium" : "text-slate-400"}>
                    {selectedStaff
                      ? `${selectedStaff.code ? selectedStaff.code + " · " : ""}${selectedStaff.fullName}`
                      : "Chọn nhân viên..."}
                  </span>
                  <Search className="h-4 w-4 text-slate-400 shrink-0" />
                </button>

                {staffDropdownOpen && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                    <div className="p-2 border-b border-slate-100">
                      <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded-lg">
                        <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <input
                          autoFocus
                          className="flex-1 text-sm bg-transparent outline-none placeholder:text-slate-400"
                          placeholder="Tìm theo tên hoặc mã..."
                          value={staffSearch}
                          onChange={(e) => setStaffSearch(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="max-h-44 overflow-y-auto">
                      {filteredStaff.length === 0 ? (
                        <p className="px-4 py-3 text-xs text-slate-400 text-center">Không tìm thấy nhân viên</p>
                      ) : (
                        filteredStaff.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setForm((f) => ({ ...f, staffId: s.id }));
                              setStaffDropdownOpen(false);
                              setStaffSearch("");
                            }}
                            className={cn(
                              "w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-violet-50 transition-colors",
                              form.staffId === s.id && "bg-violet-50 font-semibold text-violet-700"
                            )}
                          >
                            <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                              <span className="text-[10px] font-bold text-violet-600 uppercase">
                                {s.fullName.charAt(0)}
                              </span>
                            </div>
                            <div>
                              <span className="font-medium text-slate-800">{s.fullName}</span>
                              {s.code && <span className="ml-2 text-xs text-slate-400">{s.code}</span>}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Date + Amount ── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Ngày <span className="text-red-500">*</span>
                </Label>
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 hover:bg-white hover:border-slate-300 transition-all text-left"
                    >
                      <CalendarDays className="h-4 w-4 text-slate-400 shrink-0" />
                      <span className={form.date ? "text-slate-800 font-medium" : "text-slate-400"}>
                        {form.date
                          ? format(new Date(form.date), "dd/MM/yyyy", { locale: vi })
                          : "Chọn ngày"}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.date ? new Date(form.date) : undefined}
                      onSelect={(d) => {
                        if (d) {
                          setForm((f) => ({ ...f, date: format(d, "yyyy-MM-dd") }));
                          setCalendarOpen(false);
                        }
                      }}
                      locale={vi}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Số tiền (₫) <span className="text-red-500">*</span>
                </Label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 transition-all font-medium"
                  placeholder="0"
                  value={form.amount}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, "");
                    const formatted = raw ? new Intl.NumberFormat("vi-VN").format(Number(raw)) : "";
                    setForm((f) => ({ ...f, amount: formatted }));
                  }}
                />
              </div>
            </div>

            {/* ── Reason ── */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Lý do</Label>
              <Textarea
                placeholder="Nhập lý do thưởng / phạt..."
                className="resize-none text-sm border-slate-200 rounded-xl focus:ring-violet-400 focus:border-violet-400 bg-slate-50 focus:bg-white"
                rows={3}
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-slate-50/50">
            <Button variant="outline" size="sm" onClick={() => { setOpen(false); resetForm(); }}>
              Hủy
            </Button>
            <Button
              size="sm"
              className={cn(
                "gap-1.5 text-white min-w-[100px]",
                rewardType === "reward"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-red-500 hover:bg-red-600"
              )}
              onClick={handleSubmit}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Đang lưu..." : `Tạo phiếu ${rewardType === "reward" ? "thưởng" : "phạt"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
