import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Plus, Trash2, Check, X, AlertCircle, FileText,
  Clock, CheckCircle2, XCircle, Filter, ChevronLeft,
  ChevronRight, CalendarDays, Timer, Umbrella, Gift, Wallet,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageGuideButton } from "@/components/guides/PageGuideDialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { cn } from "@/lib/utils";
import { ThuongPhatTab } from "./ThuongPhatTab";
import { TamUngTab } from "./TamUngTab";

const LEAVE_TYPES = [
  { value: "nghi_phep", label: "Nghỉ phép", icon: Umbrella, color: "bg-violet-100 text-violet-700 border-violet-200" },
  { value: "nghi_co_luong", label: "Nghỉ phép năm", icon: CalendarDays, color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "tang_ca", label: "Tăng ca", icon: Timer, color: "bg-amber-100 text-amber-700 border-amber-200" },
];

const STATUS_OPTIONS = [
  { value: "pending", label: "Chờ duyệt", color: "bg-yellow-100 text-yellow-700 border-yellow-200", dot: "bg-yellow-400" },
  { value: "approved", label: "Đã duyệt", color: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  { value: "rejected", label: "Từ chối", color: "bg-red-100 text-red-600 border-red-200", dot: "bg-red-500" },
];

const PAGE_SIZES = [20, 30, 50];

type MainTab = "don-tu" | "thuong-phat" | "tam-ung";

function getTypeInfo(type: string) {
  return LEAVE_TYPES.find((t) => t.value === type) ?? { label: type, icon: FileText, color: "bg-gray-100 text-gray-600 border-gray-200" };
}
function getStatusInfo(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status) ?? { label: status, color: "bg-gray-100 text-gray-600 border-gray-200", dot: "bg-gray-400" };
}
function calcHours(fromDate: string, toDate: string): string {
  if (!fromDate || !toDate) return "0";
  const from = new Date(fromDate);
  const to = new Date(toDate);
  const days = Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000)) + 1;
  return String(days * 8);
}
function calcOTHours(timeFrom: string, timeTo: string): number {
  if (!timeFrom || !timeTo) return 0;
  const [fh, fm] = timeFrom.split(":").map(Number);
  const [th, tm] = timeTo.split(":").map(Number);
  const mins = (th * 60 + tm) - (fh * 60 + fm);
  if (mins <= 0) return 0;
  return parseFloat((mins / 60).toFixed(2));
}

export function DonTuPage() {
  const { toast } = useToast();
  const { data: myPerms } = useMyPermissions();
  const donTuPerm = myPerms?.permissions?.["/don-tu"];
  const isSuperAdmin = myPerms?.isSuperAdmin ?? false;
  const canCreate = isSuperAdmin || !!donTuPerm?.canCreate;
  const canEdit = isSuperAdmin || !!donTuPerm?.canEdit;
  const canDelete = isSuperAdmin || !!donTuPerm?.canDelete;

  // ── Main tab ──────────────────────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState<MainTab>("don-tu");

  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [createOpen, setCreateOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<{ id: string } | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const [form, setForm] = useState({
    staffId: "",
    type: "nghi_phep",
    fromDate: format(new Date(), "yyyy-MM-dd"),
    toDate: format(new Date(), "yyyy-MM-dd"),
    overtimeFrom: "17:00",
    overtimeTo: "19:00",
    reason: "",
  });

  const { data: leaveRequests = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/leave-requests", filterType, filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterType !== "all") params.append("type", filterType);
      if (filterStatus !== "all") params.append("status", filterStatus);
      const res = await fetch(`/api/leave-requests?${params.toString()}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: staff = [] } = useQuery<any[]>({
    queryKey: ["/api/staff", "minimal"],
    queryFn: async () => {
      const res = await fetch(`/api/staff?minimal=true`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: shiftAssignments = [] } = useQuery<any[]>({
    queryKey: ["/api/shift-assignments"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/leave-requests", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-requests"] });
      toast({ title: "Thành công", description: "Đã tạo đơn từ mới" });
      setCreateOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err?.message || "Không thể tạo đơn từ", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/leave-requests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-requests"] });
      toast({ title: "Đã xoá", description: "Đơn từ đã được xoá" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, adminNote }: { id: string; status: string; adminNote?: string }) =>
      apiRequest("PATCH", `/api/leave-requests/${id}/status`, { status, adminNote }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-requests"] });
      toast({ title: "Cập nhật trạng thái thành công" });
    },
  });

  function resetForm() {
    setForm({
      staffId: "",
      type: "nghi_phep",
      fromDate: format(new Date(), "yyyy-MM-dd"),
      toDate: format(new Date(), "yyyy-MM-dd"),
      overtimeFrom: "17:00",
      overtimeTo: "19:00",
      reason: "",
    });
  }

  function getStaffName(staffId: string) {
    const s = (staff as any[]).find((x) => x.id === staffId);
    return s ? `${s.code ?? ""} ${s.fullName}`.trim() : staffId;
  }

  function hasShiftOnDate(staffId: string, dateStr: string): boolean {
    if (!staffId || !dateStr) return true;
    const date = new Date(dateStr);
    const dowKey = String(date.getDay());
    const ymd = dateStr;
    const staffObj = (staff as any[]).find((x) => x.id === staffId);
    if (!staffObj) return true;
    for (const a of (shiftAssignments as any[])) {
      const sAssignments: any[] = staffObj.assignments || [];
      let matches = false;
      if (a.targetType === "staff") matches = staffObj.id === a.targetId;
      else if (a.targetType === "department")
        matches = sAssignments.some((sa: any) => sa.departmentId === a.targetId && (!a.locationId || sa.locationId === a.locationId));
      else if (a.targetType === "role")
        matches = sAssignments.some((sa: any) => sa.roleId === a.targetId && (!a.locationId || sa.locationId === a.locationId));
      if (!matches) continue;
      if (a.effectiveFrom && ymd < a.effectiveFrom) continue;
      if (a.effectiveTo && ymd > a.effectiveTo) continue;
      if (a.byWeekday) {
        const list: string[] = (a.weekdaySchedule && a.weekdaySchedule[dowKey]) || [];
        if (list.length > 0) return true;
      } else if (a.shiftTemplateId) {
        return true;
      }
    }
    return false;
  }

  const shiftWarning =
    form.staffId &&
    (!hasShiftOnDate(form.staffId, form.fromDate) || !hasShiftOnDate(form.staffId, form.toDate));

  function handleSubmit() {
    if (!form.staffId) {
      toast({ title: "Lỗi", description: "Vui lòng chọn nhân sự", variant: "destructive" });
      return;
    }
    if (form.type === "tang_ca") {
      const otHours = calcOTHours(form.overtimeFrom, form.overtimeTo);
      if (otHours <= 0) {
        toast({ title: "Lỗi", description: "Thời gian tăng ca không hợp lệ", variant: "destructive" });
        return;
      }
      createMutation.mutate({
        staffId: form.staffId,
        type: form.type,
        fromDate: form.fromDate,
        toDate: form.fromDate,
        hours: String(otHours),
        overtimeFrom: form.overtimeFrom,
        overtimeTo: form.overtimeTo,
        reason: form.reason,
      });
    } else {
      createMutation.mutate({ ...form, hours: calcHours(form.fromDate, form.toDate) });
    }
  }

  function openRejectDialog(id: string) {
    setRejectTarget({ id });
    setRejectNote("");
    setRejectOpen(true);
  }

  function handleRejectConfirm() {
    if (!rejectTarget) return;
    statusMutation.mutate({ id: rejectTarget.id, status: "rejected", adminNote: rejectNote });
    setRejectOpen(false);
  }

  const totalItems = leaveRequests.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginated = useMemo(
    () => leaveRequests.slice((page - 1) * pageSize, page * pageSize),
    [leaveRequests, page, pageSize]
  );

  function handleFilterChange(setter: (v: string) => void) {
    return (v: string) => { setter(v); setPage(1); };
  }

  const countPending = leaveRequests.filter((r: any) => r.status === "pending").length;
  const countApproved = leaveRequests.filter((r: any) => r.status === "approved").length;
  const countRejected = leaveRequests.filter((r: any) => r.status === "rejected").length;

  const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-400 transition-colors bg-gray-50 focus:bg-white";

  return (
    <DashboardLayout fullscreen>
      <div className="flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-gray-950">

        {/* ── NEUTRAL HEADER ── */}
        <div className="shrink-0 bg-slate-600 shadow-lg px-6 pt-4 pb-0">
          {/* ── TAB BAR ── */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              {/* Đơn từ tab */}
              <button
                onClick={() => setMainTab("don-tu")}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-medium transition-all",
                  mainTab === "don-tu"
                    ? "bg-white text-slate-700 shadow-sm"
                    : "bg-white/10 text-slate-200 hover:bg-white/20"
                )}
              >
                <FileText className="h-4 w-4" />
                Đơn từ
              </button>

              {/* Thưởng/Phạt tab */}
              <button
                onClick={() => setMainTab("thuong-phat")}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-medium transition-all",
                  mainTab === "thuong-phat"
                    ? "bg-white text-slate-700 shadow-sm"
                    : "bg-white/10 text-slate-200 hover:bg-white/20"
                )}
              >
                <Gift className="h-4 w-4" />
                Thưởng / Phạt
              </button>

              {/* Tạm ứng tab */}
              <button
                onClick={() => setMainTab("tam-ung")}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-medium transition-all",
                  mainTab === "tam-ung"
                    ? "bg-white text-slate-700 shadow-sm"
                    : "bg-white/10 text-slate-200 hover:bg-white/20"
                )}
              >
                <Wallet className="h-4 w-4" />
                Tạm ứng
              </button>
            </div>

            <PageGuideButton pageTitle="Đơn từ" className="shrink-0" />
          </div>
        </div>

        {/* ── THƯỞNG/PHẠT TAB CONTENT ── */}
        {mainTab === "thuong-phat" && (
          <div className="flex-1 overflow-hidden pt-3">
            <ThuongPhatTab canCreate={canCreate} canDelete={canDelete} />
          </div>
        )}

        {mainTab === "tam-ung" && (
          <div className="flex-1 overflow-hidden pt-3">
            <TamUngTab canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} />
          </div>
        )}

        {/* ── ĐƠN TỪ TAB CONTENT ── */}
        {mainTab === "don-tu" && (
          <div className="flex-1 flex flex-col overflow-hidden mx-5 mb-4 bg-white dark:bg-gray-950 rounded-b-xl rounded-tr-xl border border-slate-200 dark:border-gray-800 shadow-sm">

            {/* Filters bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-gray-800 shrink-0 bg-slate-50/50 dark:bg-gray-900/50 flex-wrap gap-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Status filter chips */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleFilterChange(setFilterStatus)("all")}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                      filterStatus === "all"
                        ? "bg-violet-600 text-white border-violet-600"
                        : "bg-white text-slate-500 border-slate-200 hover:border-violet-300 hover:text-violet-600"
                    )}
                  >
                    Tất cả <span className="font-bold">{totalItems}</span>
                  </button>
                  <button
                    onClick={() => handleFilterChange(setFilterStatus)("pending")}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                      filterStatus === "pending"
                        ? "bg-yellow-400 text-white border-yellow-400"
                        : "bg-white text-slate-500 border-slate-200 hover:border-yellow-300 hover:text-yellow-600"
                    )}
                  >
                    <Clock className="h-3 w-3" />
                    Chờ duyệt <span className="font-bold">{countPending}</span>
                  </button>
                  <button
                    onClick={() => handleFilterChange(setFilterStatus)("approved")}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                      filterStatus === "approved"
                        ? "bg-emerald-500 text-white border-emerald-500"
                        : "bg-white text-slate-500 border-slate-200 hover:border-emerald-300 hover:text-emerald-600"
                    )}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Đã duyệt <span className="font-bold">{countApproved}</span>
                  </button>
                  <button
                    onClick={() => handleFilterChange(setFilterStatus)("rejected")}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                      filterStatus === "rejected"
                        ? "bg-red-500 text-white border-red-500"
                        : "bg-white text-slate-500 border-slate-200 hover:border-red-300 hover:text-red-500"
                    )}
                  >
                    <XCircle className="h-3 w-3" />
                    Từ chối <span className="font-bold">{countRejected}</span>
                  </button>
                </div>

                <div className="w-px h-5 bg-slate-200 mx-1" />

                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Filter className="h-3.5 w-3.5" />
                  <span className="font-semibold uppercase tracking-wide">Lọc:</span>
                </div>
                <Select value={filterType} onValueChange={handleFilterChange(setFilterType)}>
                  <SelectTrigger className="w-44 h-8 text-xs bg-white dark:bg-gray-900 border-slate-200 hover:border-violet-300 transition-colors">
                    <SelectValue placeholder="Tất cả loại đơn" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả loại đơn</SelectItem>
                    {LEAVE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 font-medium">{totalItems} đơn từ</span>
                {canCreate && (
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
                    onClick={() => { resetForm(); setCreateOpen(true); }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tạo đơn
                  </Button>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto relative">
              <table className="w-full border-collapse" style={{ minWidth: 960 }}>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-100 dark:bg-slate-900" style={{ boxShadow: "0 1px 0 0 #e2e8f0" }}>
                    <th className="sticky left-0 z-20 bg-slate-100 dark:bg-slate-900 text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap w-48 min-w-[180px]"
                      style={{ boxShadow: "1px 0 0 0 #e2e8f0" }}>
                      Nhân sự
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap w-36">Loại đơn</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap w-28">Từ ngày</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap w-32">Đến ngày / Ca</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap w-20">Số giờ</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap w-28">Trạng thái</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-64">Lý do / Ghi chú</th>
                    <th className="sticky right-0 z-20 bg-slate-100 dark:bg-slate-900 text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap w-24"
                      style={{ boxShadow: "-1px 0 0 0 #e2e8f0" }}>
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="text-center py-16">
                        <div className="flex flex-col items-center gap-2 text-slate-400">
                          <div className="w-8 h-8 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
                          <span className="text-sm">Đang tải dữ liệu...</span>
                        </div>
                      </td>
                    </tr>
                  ) : paginated.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-16">
                        <div className="flex flex-col items-center gap-2 text-slate-400">
                          <FileText className="w-10 h-10 opacity-30" />
                          <p className="text-sm font-medium">Không có đơn từ nào</p>
                          <p className="text-xs opacity-60">Thử thay đổi bộ lọc hoặc tạo đơn mới</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginated.map((r: any, idx: number) => {
                      const si = getStatusInfo(r.status);
                      const ti = getTypeInfo(r.type);
                      const TypeIcon = ti.icon;
                      const isEven = idx % 2 === 0;
                      const rowBg = isEven ? "bg-white dark:bg-gray-950" : "bg-slate-50/60 dark:bg-gray-900/40";
                      const stickyBg = isEven ? "bg-white dark:bg-gray-950" : "bg-slate-50 dark:bg-gray-900";
                      return (
                        <tr
                          key={r.id}
                          className={cn("group transition-colors hover:bg-violet-50/40 dark:hover:bg-violet-950/20", rowBg)}
                        >
                          <td
                            className={cn("sticky left-0 z-10 px-4 py-3 whitespace-nowrap border-b border-slate-100 dark:border-gray-800 group-hover:bg-violet-50/40", stickyBg)}
                            style={{ boxShadow: "1px 0 0 0 #e2e8f0" }}
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                                <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase">
                                  {getStaffName(r.staffId).charAt(0)}
                                </span>
                              </div>
                              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[130px]">
                                {getStaffName(r.staffId)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap border-b border-slate-100 dark:border-gray-800">
                            <span className={cn(
                              "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border",
                              ti.color
                            )}>
                              <TypeIcon className="h-3 w-3" />
                              {ti.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap border-b border-slate-100 dark:border-gray-800 text-xs text-slate-600 dark:text-slate-300 font-medium">
                            {r.fromDate ? format(new Date(r.fromDate), "dd/MM/yyyy") : "—"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap border-b border-slate-100 dark:border-gray-800 text-xs text-slate-600 dark:text-slate-300 font-medium">
                            {r.type === "tang_ca"
                              ? (r.overtimeFrom && r.overtimeTo
                                ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded text-amber-700 font-semibold">
                                    <Timer className="h-3 w-3" />{r.overtimeFrom} – {r.overtimeTo}
                                  </span>
                                : "—")
                              : (r.toDate ? format(new Date(r.toDate), "dd/MM/yyyy") : "—")}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap border-b border-slate-100 dark:border-gray-800 text-center">
                            {r.hours
                              ? <span className="inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-full text-xs font-bold text-slate-600 dark:text-slate-300">
                                  {r.type === "tang_ca" ? `${r.hours}h` : `${r.hours}`}
                                </span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap border-b border-slate-100 dark:border-gray-800">
                            <span className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border",
                              si.color
                            )}>
                              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", si.dot)} />
                              {si.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 border-b border-slate-100 dark:border-gray-800 max-w-[250px]">
                            {r.reason
                              ? <p className="text-xs text-slate-600 dark:text-slate-300 truncate" title={r.reason}>{r.reason}</p>
                              : <span className="text-slate-300 text-xs">—</span>}
                            {r.status === "rejected" && r.adminNote && (
                              <p className="text-[10px] text-red-500 italic mt-0.5 truncate" title={r.adminNote}>
                                ↳ {r.adminNote}
                              </p>
                            )}
                          </td>
                          <td
                            className={cn("sticky right-0 z-10 px-4 py-3 border-b border-slate-100 dark:border-gray-800 text-center group-hover:bg-violet-50/40", stickyBg)}
                            style={{ boxShadow: "-1px 0 0 0 #e2e8f0" }}
                          >
                            <div className="flex items-center justify-center gap-1">
                              {canEdit && r.status === "pending" && (
                                <>
                                  <button
                                    title="Duyệt"
                                    className="w-7 h-7 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-600 flex items-center justify-center transition-colors"
                                    onClick={() => statusMutation.mutate({ id: r.id, status: "approved" })}
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    title="Từ chối"
                                    className="w-7 h-7 rounded-lg bg-red-100 hover:bg-red-200 text-red-500 flex items-center justify-center transition-colors"
                                    onClick={() => openRejectDialog(r.id)}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                              {canDelete && (
                                <button
                                  title="Xoá"
                                  className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors"
                                  onClick={() => { if (confirm("Xoá đơn từ này?")) deleteMutation.mutate(r.id); }}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 dark:border-gray-800 shrink-0 bg-slate-50/50 dark:bg-gray-900/50">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Hiển thị</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}
                >
                  <SelectTrigger className="w-16 h-7 text-xs bg-white dark:bg-gray-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map((s) => (
                      <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>bản ghi</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  className="w-7 h-7 rounded-lg border border-slate-200 dark:border-gray-700 text-slate-500 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-600 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-slate-500 min-w-[80px] text-center font-medium">
                  Trang {page} / {totalPages}
                </span>
                <button
                  className="w-7 h-7 rounded-lg border border-slate-200 dark:border-gray-700 text-slate-500 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-600 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── CREATE DIALOG ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
                <Plus className="h-4 w-4 text-violet-600" />
              </div>
              Tạo đơn mới
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Nhân sự</Label>
              <Select value={form.staffId} onValueChange={(v) => setForm((f) => ({ ...f, staffId: v }))}>
                <SelectTrigger className="border-slate-200 focus:ring-violet-500">
                  <SelectValue placeholder="Chọn nhân sự..." />
                </SelectTrigger>
                <SelectContent>
                  {(staff as any[]).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code ? `${s.code} ${s.fullName}` : s.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Loại đơn</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger className="border-slate-200 focus:ring-violet-500"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.type === "tang_ca" ? (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Ngày tăng ca</Label>
                  <input
                    type="date"
                    className={inputClass}
                    value={form.fromDate}
                    onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value, toDate: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Từ</Label>
                    <input type="time" className={inputClass} value={form.overtimeFrom}
                      onChange={(e) => setForm((f) => ({ ...f, overtimeFrom: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Đến</Label>
                    <input type="time" className={inputClass} value={form.overtimeTo}
                      onChange={(e) => setForm((f) => ({ ...f, overtimeTo: e.target.value }))} />
                  </div>
                </div>
                {(() => {
                  const h = calcOTHours(form.overtimeFrom, form.overtimeTo);
                  return (
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 rounded-lg border border-amber-200">
                      <Timer className="h-4 w-4 text-amber-600 shrink-0" />
                      <span className="text-sm text-amber-700 font-medium">Tổng giờ tăng ca:</span>
                      <span className="text-sm font-bold text-amber-800">{h > 0 ? `${h} giờ` : "—"}</span>
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Từ ngày</Label>
                  <input type="date" className={inputClass} value={form.fromDate}
                    onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Đến ngày</Label>
                  <input type="date" className={inputClass} value={form.toDate}
                    onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))} />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Lý do</Label>
              <Textarea
                placeholder="Nhập lý do..."
                className="resize-none text-sm border-slate-200 focus:ring-violet-500"
                rows={3}
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>

            {shiftWarning && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
                <span className="text-xs">
                  Nhân sự này chưa được phân ca vào ngày:{" "}
                  <strong>
                    {!hasShiftOnDate(form.staffId, form.fromDate)
                      ? format(new Date(form.fromDate), "dd/MM/yyyy")
                      : format(new Date(form.toDate), "dd/MM/yyyy")}
                  </strong>
                  . Vui lòng chọn ngày đã được phân ca.
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>Hủy</Button>
            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
              onClick={handleSubmit}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Đang tạo..." : "Tạo đơn"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── REJECT DIALOG ── */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
                <XCircle className="h-4 w-4 text-red-500" />
              </div>
              Từ chối đơn từ
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Lý do từ chối</Label>
            <Textarea
              placeholder="Nhập lý do từ chối..."
              className="resize-none text-sm border-slate-200"
              rows={4}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRejectOpen(false)}>Hủy</Button>
            <Button
              size="sm"
              variant="destructive"
              className="gap-1.5"
              onClick={handleRejectConfirm}
              disabled={statusMutation.isPending}
            >
              <XCircle className="h-3.5 w-3.5" />
              Xác nhận từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
