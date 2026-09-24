import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import {
  Wallet, Plus, Eye, Trash2, FileSpreadsheet, Users, X,
  CheckCircle2, Clock, FileText, Search, Filter, ChevronRight,
  Building2, CalendarDays, StickyNote, Banknote, RotateCcw,
  AlertCircle, TrendingUp, BadgeCheck, Download, Loader2,
  Pencil, Settings2, UserCheck, Shield, Percent, DollarSign,
  Lock, LockOpen,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MultiSelect } from "@/components/ui/multi-select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { HRSalaryPaymentDialog, type HRPaymentInfo } from "./HRSalaryPaymentDialog";

type TabValue = "salary-sheets" | "staff-config" | "default-config";

const TABS = [
  { value: "salary-sheets" as TabValue, label: "Bảng tổng lương", icon: FileSpreadsheet },
  { value: "staff-config" as TabValue, label: "Cấu hình Lương nhân sự", icon: Users },
  { value: "default-config" as TabValue, label: "Cấu hình mặc định", icon: Shield },
];

function getTabFromUrl(): TabValue {
  if (typeof window === "undefined") return "salary-sheets";
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  if (tab === "staff-config") return "staff-config";
  if (tab === "default-config") return "default-config";
  return "salary-sheets";
}

function fmtMoney(n: number) {
  return n.toLocaleString("vi-VN") + "đ";
}

// ─── Types ────────────────────────────────────────────────────────────────────
type SheetStatus = "draft" | "locked";

interface SalarySheet {
  id: string;
  code: string;
  locationId: string;
  locationName: string;
  fromDate: string;
  toDate: string;
  note: string;
  status: SheetStatus;
  createdAt: string;
  totalStaff: number;
  totalDaChi: number;
  totalThucNhan: number;
}

interface EmployeeRow {
  id: string;
  stt: number;
  maNV: string;
  hoTen: string;
  coSo: string;
  vaiTro: string;
  soCong: number;
  luongCB: number;
  congThuc: number;
  luongTheoCong: number;
  phuCap: number;
  thuong: number;
  phat: number;
  luongDungLop: number;
  tongLuong: number;
  bhxh: number;
  bhyt: number;
  bhtn: number;
  thueTNCN: number;
  tamUng: number;
  thucNhan: number;
  daChi: boolean;
}

function mapEmployee(e: any, idx: number): EmployeeRow {
  return {
    id: e.id,
    stt: idx + 1,
    maNV: e.staffCode ?? "",
    hoTen: e.staffName ?? "",
    coSo: e.locationName ?? "",
    vaiTro: e.roleName ?? "Nhân viên",
    soCong: Number(e.soCong ?? 0),
    luongCB: parseFloat(e.luongCB ?? "0"),
    congThuc: Number(e.congThuc ?? 0),
    luongTheoCong: parseFloat(e.luongTheoCong ?? "0"),
    phuCap: parseFloat(e.phuCap ?? "0"),
    thuong: parseFloat(e.thuong ?? "0"),
    phat: parseFloat(e.phat ?? "0"),
    luongDungLop: parseFloat(e.luongDungLop ?? "0"),
    tongLuong: parseFloat(e.tongLuong ?? "0"),
    bhxh: parseFloat(e.bhxh ?? "0"),
    bhyt: parseFloat(e.bhyt ?? "0"),
    bhtn: parseFloat(e.bhtn ?? "0"),
    thueTNCN: parseFloat(e.thueTNCN ?? "0"),
    tamUng: parseFloat(e.tamUng ?? "0"),
    thucNhan: parseFloat(e.thucNhan ?? "0"),
    daChi: Boolean(e.daChi),
  };
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: SheetStatus }) {
  if (status === "locked") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="h-3 w-3" /> Đã chốt
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      <Clock className="h-3 w-3" /> Nháp
    </span>
  );
}

// ─── Create modal ─────────────────────────────────────────────────────────────
interface CreateModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (sheet: SalarySheet) => void;
}

function CreateSalarySheetModal({ open, onOpenChange, onCreated }: CreateModalProps) {
  const { data: locations = [] } = useQuery<any[]>({
    queryKey: ["/api/locations"],
    enabled: open,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth(), 0);

  const [locationId, setLocationId] = useState("");
  const [fromDate, setFromDate] = useState(format(firstOfMonth, "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(lastOfMonth, "yyyy-MM-dd"));
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useMutation({
    mutationFn: async (data: { locationId: string; fromDate: string; toDate: string; note: string }) => {
      const res = await apiRequest("POST", "/api/salary-sheets", data);
      return res.json();
    },
    onSuccess: (sheet: SalarySheet) => {
      queryClient.invalidateQueries({ queryKey: ["/api/salary-sheets"] });
      onCreated(sheet);
      onOpenChange(false);
      setLocationId("");
      setFromDate(format(firstOfMonth, "yyyy-MM-dd"));
      setToDate(format(lastOfMonth, "yyyy-MM-dd"));
      setNote("");
      setErrors({});
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!locationId) e.locationId = "Vui lòng chọn cơ sở";
    if (!fromDate) e.fromDate = "Vui lòng chọn ngày bắt đầu";
    if (!toDate) e.toDate = "Vui lòng chọn ngày kết thúc";
    if (fromDate && toDate && fromDate > toDate) e.toDate = "Ngày kết thúc phải sau ngày bắt đầu";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    createMutation.mutate({ locationId, fromDate, toDate, note });
  };

  const saving = createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center">
                <FileSpreadsheet className="h-4 w-4 text-white" />
              </div>
              <DialogTitle className="text-base font-bold text-white">
                Tạo mới bảng lương
              </DialogTitle>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="h-7 w-7 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <X className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              Cơ sở <span className="text-red-500">*</span>
            </Label>
            <Select value={locationId} onValueChange={v => { setLocationId(v); setErrors(e => ({ ...e, locationId: "" })); }}>
              <SelectTrigger className={cn("h-10", errors.locationId && "border-red-400 focus:ring-red-400")}>
                <SelectValue placeholder="Chọn cơ sở" />
              </SelectTrigger>
              <SelectContent>
                {locations.length === 0 && (
                  <SelectItem value="_none" disabled>Đang tải...</SelectItem>
                )}
                {locations.map((loc: any) => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.locationId && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.locationId}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                Từ ngày <span className="text-red-500">*</span>
              </Label>
              <Input
                type="date"
                value={fromDate}
                onChange={e => { setFromDate(e.target.value); setErrors(err => ({ ...err, fromDate: "" })); }}
                className={cn("h-10", errors.fromDate && "border-red-400")}
              />
              {errors.fromDate && <p className="text-xs text-red-500">{errors.fromDate}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                Đến ngày <span className="text-red-500">*</span>
              </Label>
              <Input
                type="date"
                value={toDate}
                onChange={e => { setToDate(e.target.value); setErrors(err => ({ ...err, toDate: "" })); }}
                className={cn("h-10", errors.toDate && "border-red-400")}
              />
              {errors.toDate && <p className="text-xs text-red-500">{errors.toDate}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1">
              <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
              Ghi chú
            </Label>
            <Textarea
              placeholder="Ghi chú (tùy chọn)"
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              className="resize-none text-sm"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-gray-50/80 flex items-center justify-end gap-2.5">
          <Button variant="outline" size="sm" className="h-9 px-4" onClick={() => onOpenChange(false)} disabled={saving}>
            Hủy
          </Button>
          <Button
            size="sm"
            className="h-9 px-5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />Đang lưu...</span>
            ) : (
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" />Lưu bảng lương</span>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail dialog ────────────────────────────────────────────────────────────
interface DetailProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sheet: SalarySheet | null;
}

function SalarySheetDetailDialog({ open, onOpenChange, sheet }: DetailProps) {
  const [search, setSearch] = useState("");
  const [paymentInfo, setPaymentInfo] = useState<HRPaymentInfo | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: myPerms } = useMyPermissions();
  const sheetPerm = myPerms?.permissions?.["/tong-luong#salary-sheets"];
  const isSuperAdmin = myPerms?.isSuperAdmin ?? false;
  const canEdit = isSuperAdmin || !!sheetPerm?.canEdit;

  const { data: rawEmployees = [], isLoading: loadingEmps, refetch } = useQuery<any[]>({
    queryKey: ["/api/salary-sheets", sheet?.id, "employees"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/salary-sheets/${sheet!.id}/employees`);
      return res.json();
    },
    enabled: open && !!sheet?.id,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/salary-sheets/${sheet!.id}/employees/generate`);
      return res.json();
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/salary-sheets"] });
      toast({ title: "Thành công", description: "Đã tạo danh sách nhân viên từ cơ sở" });
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  const lockMutation = useMutation({
    mutationFn: async (newStatus: "locked" | "draft") => {
      const res = await apiRequest("PATCH", `/api/salary-sheets/${sheet!.id}/status`, { status: newStatus });
      return res.json();
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/salary-sheets"] });
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  const openPayDialog = (row: EmployeeRow) => {
    if (!sheet) return;
    const period = `${format(new Date(sheet.fromDate), "d/M/yyyy")} – ${format(new Date(sheet.toDate), "d/M/yyyy")}`;
    setPaymentInfo({
      empId: row.id,
      staffCode: row.maNV,
      staffName: row.hoTen,
      roleName: row.vaiTro,
      thucNhan: row.thucNhan,
      sheetId: sheet.id,
      sheetCode: sheet.code,
      sheetPeriod: period,
      locationId: sheet.locationId,
    });
  };

  if (!sheet) return null;

  const rows: EmployeeRow[] = rawEmployees.map(mapEmployee).filter(r =>
    r.hoTen.toLowerCase().includes(search.toLowerCase()) ||
    r.maNV.toLowerCase().includes(search.toLowerCase())
  );

  const totalThucNhan = rows.reduce((s, r) => s + r.thucNhan, 0);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen m-0 p-0 flex flex-col gap-0 overflow-hidden rounded-none" style={{ position: "fixed", top: 0, left: 0, transform: "none" }}>
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 pt-4 pb-3 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="h-7 w-7 rounded-md bg-white/15 flex items-center justify-center">
                  <FileSpreadsheet className="h-4 w-4 text-white" />
                </div>
                <DialogTitle className="text-base font-bold text-white">
                  Chi tiết bảng lương: {sheet.code}
                </DialogTitle>
                <StatusBadge status={sheet.status} />
              </div>
              <p className="text-xs text-slate-300 pl-9">
                <span className="font-medium text-slate-200">{sheet.locationName}</span>
                {" · "}Kỳ lương: {format(new Date(sheet.fromDate), "d/M/yyyy")} – {format(new Date(sheet.toDate), "d/M/yyyy")}
                {sheet.note && <span className="ml-2 italic text-slate-400">• {sheet.note}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canEdit && sheet.status === "draft" && (
                <Button
                  size="sm"
                  className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                >
                  {generateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
                  Tạo chi tiết lương
                </Button>
              )}
              {canEdit && (sheet.status === "draft" ? (
                <Button
                  size="sm"
                  className="h-8 gap-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white border-0"
                  onClick={() => lockMutation.mutate("locked")}
                  disabled={lockMutation.isPending}
                >
                  {lockMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                  Chốt bảng lương
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="h-8 gap-1.5 text-xs bg-white/15 hover:bg-white/25 text-white border-0"
                  onClick={() => lockMutation.mutate("draft")}
                  disabled={lockMutation.isPending}
                >
                  {lockMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LockOpen className="h-3.5 w-3.5" />}
                  Mở lại
                </Button>
              ))}
              <button
                onClick={() => onOpenChange(false)}
                className="h-7 w-7 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X className="h-4 w-4 text-white" />
              </button>
            </div>
          </div>

          {/* Summary chips */}
          <div className="flex items-center gap-2 mt-3 pl-9">
            {[
              { label: "Nhân sự", value: `${rawEmployees.length} người`, color: "bg-blue-500/20 text-blue-200" },
              { label: "Tổng thực nhận", value: fmtMoney(totalThucNhan), color: "bg-violet-500/20 text-violet-200" },
              { label: "Đã chi lương", value: `${rawEmployees.filter((r: any) => r.daChi).length}/${rawEmployees.length}`, color: "bg-emerald-500/20 text-emerald-200" },
            ].map(c => (
              <span key={c.label} className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium", c.color)}>
                <span className="opacity-70">{c.label}:</span> {c.value}
              </span>
            ))}
          </div>
        </div>

        {/* Filter bar */}
        <div className="px-5 py-2.5 border-b bg-muted/30 shrink-0 flex items-center gap-3">
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Tìm nhân viên..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs w-full"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {rows.length} nhân viên
          </span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto min-h-0">
          {loadingEmps ? (
            <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-5 w-5 animate-spin" />
              Đang tải dữ liệu...
            </div>
          ) : (
            <table className="w-max min-w-full border-collapse text-xs">
              <thead className="sticky top-0 z-20">
                <tr className="bg-slate-50 border-b-2 border-slate-200">
                  {[
                    { label: "STT", w: "w-10 text-center" },
                    { label: "Mã NV", w: "min-w-[90px]" },
                    { label: "Họ và tên", w: "min-w-[140px]" },
                    { label: "Cơ sở", w: "min-w-[100px]" },
                    { label: "Vai trò", w: "min-w-[110px]" },
                    { label: "Số công", w: "min-w-[75px] text-center" },
                    { label: "Lương CB", w: "min-w-[110px] text-right" },
                    { label: "Công thực", w: "min-w-[80px] text-center" },
                    { label: "Lương theo công", w: "min-w-[130px] text-right" },
                    { label: "Phụ cấp", w: "min-w-[90px] text-right" },
                    { label: "Thưởng", w: "min-w-[90px] text-right" },
                    { label: "Phạt", w: "min-w-[90px] text-right" },
                    { label: "Lương đứng lớp", w: "min-w-[120px] text-right" },
                    { label: "Tổng lương", w: "min-w-[110px] text-right font-semibold" },
                    { label: "BHXH", w: "min-w-[90px] text-right" },
                    { label: "BHYT", w: "min-w-[80px] text-right" },
                    { label: "BHTN", w: "min-w-[80px] text-right" },
                    { label: "Thuế TNCN", w: "min-w-[90px] text-right" },
                    { label: "Tạm ứng", w: "min-w-[90px] text-right" },
                    { label: "Thực nhận", w: "min-w-[110px] text-right font-semibold" },
                    { label: "Chi lương", w: "min-w-[85px] text-center sticky right-0 bg-slate-50" },
                  ].map((h, i) => (
                    <th key={i} className={cn(
                      "px-3 py-2.5 text-left text-[11px] font-semibold text-slate-600 whitespace-nowrap border-r border-slate-200 last:border-r-0",
                      h.w,
                      i === 20 && "shadow-[-4px_0_8px_rgba(0,0,0,0.06)]"
                    )}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={21} className="px-5 py-10 text-center text-muted-foreground text-sm">
                      {rawEmployees.length === 0
                        ? 'Chưa có nhân viên. Bấm "Tạo chi tiết lương" để tự động thêm nhân viên từ cơ sở.'
                        : "Không tìm thấy nhân viên nào"}
                    </td>
                  </tr>
                ) : rows.map((row, idx) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-slate-100 transition-colors hover:bg-violet-50/40",
                      idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                    )}
                  >
                    <td className="px-3 py-2 text-center text-muted-foreground border-r border-slate-100">{row.stt}</td>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-violet-700 border-r border-slate-100 whitespace-nowrap">{row.maNV}</td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap border-r border-slate-100">{row.hoTen}</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap border-r border-slate-100">{row.coSo}</td>
                    <td className="px-3 py-2 border-r border-slate-100">
                      <span className={cn(
                        "inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium",
                        row.vaiTro === "Giáo viên" ? "bg-blue-50 text-blue-700" :
                        row.vaiTro === "Trợ giảng" ? "bg-cyan-50 text-cyan-700" :
                        row.vaiTro === "Trưởng phòng" ? "bg-purple-50 text-purple-700" :
                        "bg-gray-100 text-gray-600"
                      )}>
                        {row.vaiTro}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center border-r border-slate-100">{parseFloat(String(row.soCong ?? 0)) % 1 === 0 ? Number(row.soCong) : parseFloat(Number(row.soCong).toFixed(2))}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap border-r border-slate-100 tabular-nums">{fmtMoney(row.luongCB)}</td>
                    <td className="px-3 py-2 text-center border-r border-slate-100 font-medium">{row.congThuc}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap border-r border-slate-100 tabular-nums">{fmtMoney(row.luongTheoCong)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap border-r border-slate-100 tabular-nums text-slate-600">
                      {row.phuCap > 0 ? <span className="text-green-600">+{fmtMoney(row.phuCap)}</span> : <span className="text-muted-foreground">0đ</span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap border-r border-slate-100 tabular-nums">
                      {row.thuong > 0 ? <span className="text-green-600">+{fmtMoney(row.thuong)}</span> : <span className="text-muted-foreground">+0đ</span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap border-r border-slate-100 tabular-nums">
                      {row.phat > 0 ? <span className="text-red-500">-{fmtMoney(row.phat)}</span> : <span className="text-muted-foreground">-0đ</span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap border-r border-slate-100 tabular-nums">
                      {row.luongDungLop > 0 ? <span className="text-indigo-600 font-medium">{fmtMoney(row.luongDungLop)}</span> : <span className="text-muted-foreground">0đ</span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap border-r border-slate-100 font-semibold tabular-nums">
                      {row.tongLuong > 0 ? fmtMoney(row.tongLuong) : <span className="text-muted-foreground">0đ</span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap border-r border-slate-100 text-red-500 tabular-nums">-{fmtMoney(row.bhxh)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap border-r border-slate-100 text-red-500 tabular-nums">-{fmtMoney(row.bhyt)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap border-r border-slate-100 text-red-500 tabular-nums">-{fmtMoney(row.bhtn)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap border-r border-slate-100 tabular-nums">
                      {row.thueTNCN > 0 ? <span className="text-red-500">-{fmtMoney(row.thueTNCN)}</span> : <span className="text-muted-foreground">0đ</span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap border-r border-slate-100 tabular-nums">
                      {row.tamUng > 0 ? <span className="text-amber-600">-{fmtMoney(row.tamUng)}</span> : <span className="text-muted-foreground">0đ</span>}
                    </td>
                    <td className={cn(
                      "px-3 py-2 text-right whitespace-nowrap border-r border-slate-100 font-bold tabular-nums",
                      row.thucNhan < 0 ? "text-red-600" : "text-emerald-700"
                    )}>
                      {row.thucNhan < 0 ? `-${fmtMoney(Math.abs(row.thucNhan))}` : fmtMoney(row.thucNhan)}
                    </td>
                    <td className="px-3 py-2 text-center sticky right-0 bg-white border-l border-slate-100 shadow-[-4px_0_8px_rgba(0,0,0,0.04)]">
                      {row.daChi ? (
                        <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-100 text-emerald-600">
                          <BadgeCheck className="h-4 w-4" />
                        </span>
                      ) : row.thucNhan === 0 ? (
                        <Button
                          size="sm"
                          className="h-7 px-2.5 text-[10px] gap-1 rounded-md border-0"
                          variant="outline"
                          disabled
                        >
                          <Banknote className="h-3 w-3" />
                          Chi
                        </Button>
                      ) : row.thucNhan > 0 ? (
                        <Button
                          size="sm"
                          className="h-7 px-2.5 text-[10px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white border-0 rounded-md"
                          onClick={() => canEdit && openPayDialog(row)}
                          disabled={!canEdit}
                        >
                          <Banknote className="h-3 w-3" />
                          Chi
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="h-7 px-2.5 text-[10px] gap-1 bg-rose-600 hover:bg-rose-700 text-white border-0 rounded-md"
                          onClick={() => canEdit && openPayDialog(row)}
                          disabled={!canEdit}
                        >
                          <Banknote className="h-3 w-3" />
                          Thu
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>

              {rows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-300 font-semibold">
                    <td colSpan={5} className="px-3 py-2.5 text-sm text-slate-700 border-r border-slate-200">Tổng cộng</td>
                    <td className="px-3 py-2.5 text-center border-r border-slate-200">—</td>
                    <td className="px-3 py-2.5 text-right border-r border-slate-200 tabular-nums">{fmtMoney(rows.reduce((s, r) => s + r.luongCB, 0))}</td>
                    <td className="px-3 py-2.5 text-center border-r border-slate-200">—</td>
                    <td className="px-3 py-2.5 text-right border-r border-slate-200 tabular-nums">{fmtMoney(rows.reduce((s, r) => s + r.luongTheoCong, 0))}</td>
                    <td className="px-3 py-2.5 text-right text-green-600 border-r border-slate-200 tabular-nums">+{fmtMoney(rows.reduce((s, r) => s + r.phuCap, 0))}</td>
                    <td className="px-3 py-2.5 text-right text-green-600 border-r border-slate-200 tabular-nums">+{fmtMoney(rows.reduce((s, r) => s + r.thuong, 0))}</td>
                    <td className="px-3 py-2.5 text-right text-red-500 border-r border-slate-200 tabular-nums">-{fmtMoney(rows.reduce((s, r) => s + r.phat, 0))}</td>
                    <td className="px-3 py-2.5 text-right text-indigo-600 border-r border-slate-200 tabular-nums">{fmtMoney(rows.reduce((s, r) => s + r.luongDungLop, 0))}</td>
                    <td className="px-3 py-2.5 text-right border-r border-slate-200 tabular-nums">{fmtMoney(rows.reduce((s, r) => s + r.tongLuong, 0))}</td>
                    <td className="px-3 py-2.5 text-right text-red-500 border-r border-slate-200 tabular-nums">-{fmtMoney(rows.reduce((s, r) => s + r.bhxh, 0))}</td>
                    <td className="px-3 py-2.5 text-right text-red-500 border-r border-slate-200 tabular-nums">-{fmtMoney(rows.reduce((s, r) => s + r.bhyt, 0))}</td>
                    <td className="px-3 py-2.5 text-right text-red-500 border-r border-slate-200 tabular-nums">-{fmtMoney(rows.reduce((s, r) => s + r.bhtn, 0))}</td>
                    <td className="px-3 py-2.5 text-right border-r border-slate-200 tabular-nums">{fmtMoney(rows.reduce((s, r) => s + r.thueTNCN, 0))}</td>
                    <td className="px-3 py-2.5 text-right text-amber-600 border-r border-slate-200 tabular-nums">-{fmtMoney(rows.reduce((s, r) => s + r.tamUng, 0))}</td>
                    <td className={cn(
                      "px-3 py-2.5 text-right border-r border-slate-200 tabular-nums",
                      totalThucNhan < 0 ? "text-red-600" : "text-emerald-700"
                    )}>
                      {totalThucNhan < 0 ? `-${fmtMoney(Math.abs(totalThucNhan))}` : fmtMoney(totalThucNhan)}
                    </td>
                    <td className="px-3 py-2.5 sticky right-0 bg-slate-100 border-l border-slate-200 shadow-[-4px_0_8px_rgba(0,0,0,0.04)]" />
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>

    <HRSalaryPaymentDialog
      open={!!paymentInfo}
      onClose={() => setPaymentInfo(null)}
      info={paymentInfo}
      onPaid={() => {
        refetch();
        queryClient.invalidateQueries({ queryKey: ["/api/salary-sheets"] });
        setPaymentInfo(null);
      }}
    />
    </>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────
interface DeleteConfirmProps {
  open: boolean;
  sheetCode: string;
  onConfirm: () => void;
  onCancel: () => void;
  deleting?: boolean;
}
function DeleteConfirm({ open, sheetCode, onConfirm, onCancel, deleting }: DeleteConfirmProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá bảng lương?</AlertDialogTitle>
          <AlertDialogDescription>
            Bạn chắc chắn muốn xoá bảng lương <strong>{sheetCode}</strong>? Hành động này không thể hoàn tác.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={deleting}>Huỷ</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700 text-white"
            disabled={deleting}
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Xoá
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Tab 1: Bảng tổng lương ───────────────────────────────────────────────────
function SalarySheetsTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: myPerms } = useMyPermissions();
  const sheetPerm = myPerms?.permissions?.["/tong-luong#salary-sheets"];
  const isSuperAdmin = myPerms?.isSuperAdmin ?? false;
  const canCreate = isSuperAdmin || !!sheetPerm?.canCreate;
  const canDelete = isSuperAdmin || !!sheetPerm?.canDelete;

  const { data: sheets = [], isLoading } = useQuery<SalarySheet[]>({
    queryKey: ["/api/salary-sheets"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/salary-sheets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/salary-sheets"] });
      setDeleteTarget(null);
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [detailSheet, setDetailSheet] = useState<SalarySheet | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SalarySheet | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | SheetStatus>("all");

  const filtered = sheets.filter(s => {
    const matchSearch = s.code.toLowerCase().includes(search.toLowerCase()) ||
      (s.locationName ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || s.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const handleCreated = (sheet: SalarySheet) => {
    setDetailSheet(sheet);
    setDetailOpen(true);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id);
  };

  const totalDraft = sheets.filter(s => s.status === "draft").length;
  const totalLocked = sheets.filter(s => s.status === "locked").length;

  return (
    <>
      <div className="space-y-4">
        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              label: "Tổng bảng lương", value: sheets.length,
              icon: FileSpreadsheet, color: "from-violet-500 to-indigo-600",
              sub: "Tất cả kỳ lương"
            },
            {
              label: "Đang soạn thảo", value: totalDraft,
              icon: Clock, color: "from-amber-400 to-orange-500",
              sub: "Chưa chốt"
            },
            {
              label: "Đã chốt", value: totalLocked,
              icon: CheckCircle2, color: "from-emerald-500 to-teal-600",
              sub: "Hoàn tất"
            },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 hover:shadow-md transition-shadow">
              <div className={cn("h-10 w-10 rounded-xl bg-gradient-to-br flex items-center justify-center shrink-0", card.color)}>
                <card.icon className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{card.value}</p>
                <p className="text-xs text-muted-foreground">{card.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Main table card */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Tìm bảng lương, cơ sở..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>

              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                {(["all", "draft", "locked"] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setFilterStatus(v)}
                    className={cn(
                      "px-3 py-1.5 font-medium transition-colors",
                      filterStatus === v ? "bg-violet-600 text-white" : "text-muted-foreground hover:bg-gray-50"
                    )}
                  >
                    {v === "all" ? "Tất cả" : v === "draft" ? "Nháp" : "Đã chốt"}
                  </button>
                ))}
              </div>
            </div>

            {canCreate && (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-sm bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-0 shadow-sm"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Tạo mới bảng lương
            </Button>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-5 w-5 animate-spin" />
                Đang tải dữ liệu...
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 w-32">Mã bảng lương</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Cơ sở</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Kỳ lương</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Nhân sự</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Tổng thực nhận</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Trạng thái</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Ngày tạo</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-14 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <FileSpreadsheet className="h-10 w-10 text-muted-foreground/30" />
                          <p className="text-sm text-muted-foreground">
                            {search || filterStatus !== "all"
                              ? "Không tìm thấy kết quả phù hợp"
                              : 'Chưa có bảng lương nào. Bấm "+ Tạo mới bảng lương" để bắt đầu.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : filtered.map((sheet) => (
                    <tr
                      key={sheet.id}
                      className="border-b border-gray-50 hover:bg-violet-50/30 transition-colors cursor-pointer group"
                      onClick={() => { setDetailSheet(sheet); setDetailOpen(true); }}
                    >
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-sm font-bold text-violet-700 group-hover:text-violet-800">
                          {sheet.code}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="flex items-center gap-1.5 text-sm">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {sheet.locationName}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(sheet.fromDate), "d/M/yyyy")} – {format(new Date(sheet.toDate), "d/M/yyyy")}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {sheet.totalStaff > 0 ? (
                          <span className="font-medium">{sheet.totalStaff} người</span>
                        ) : (
                          <span className="text-muted-foreground text-xs italic">Chưa có</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {sheet.totalThucNhan > 0 ? (
                          <span className="font-semibold text-emerald-700">{fmtMoney(sheet.totalThucNhan)}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs italic">Chưa tính</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={sheet.status} />
                      </td>
                      <td className="px-5 py-3.5 text-sm text-muted-foreground">
                        {format(new Date(sheet.createdAt), "dd/MM/yyyy")}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-violet-600 hover:bg-violet-50"
                            title="Xem chi tiết"
                            onClick={() => { setDetailSheet(sheet); setDetailOpen(true); }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {canDelete && sheet.status === "draft" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                              title="Xoá"
                              onClick={() => setDeleteTarget(sheet)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-violet-400 transition-colors" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {filtered.length > 0 && (
            <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50/50 text-xs text-muted-foreground">
              Hiển thị {filtered.length}/{sheets.length} bảng lương
            </div>
          )}
        </div>
      </div>

      <CreateSalarySheetModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />

      <SalarySheetDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        sheet={detailSheet}
      />

      <DeleteConfirm
        open={!!deleteTarget}
        sheetCode={deleteTarget?.code ?? ""}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        deleting={deleteMutation.isPending}
      />
    </>
  );
}

// ─── Tab 2: Cấu hình Lương nhân sự ───────────────────────────────────────────
interface PhuCapItem { name: string; amount: number; applyType?: "fixed_month" | "per_day"; }
interface HrConfig {
  id: string;
  staffId: string;
  locationId: string | null;
  locationName: string | null;
  roleName: string | null;
  luongCB: string;
  phuCap: PhuCapItem[];
  bhxhBase: string;
  bhxhPercent: string;
  bhytBase: string;
  bhytPercent: string;
  bhtnPercent: string;
  thueTNCNMode: "none" | "fixed";
  thueTNCNAmount: string; // when mode=fixed: stores number of dependents (integer string)
}
interface StaffItem { id: string; code: string; fullName: string; configCount: number; assignmentPairs: AssignmentPair[]; }
interface SalaryRow { locationIds: string[]; roleNames: string[]; luongCB: string; }
interface AssignmentPair { locationId: string; locationName: string; roleName: string; }

const DEFAULT_SALARY_ROW: SalaryRow = { locationIds: [], roleNames: [], luongCB: "" };

const DEFAULT_FORM = {
  salaryRows: [{ ...DEFAULT_SALARY_ROW }] as SalaryRow[],
  phuCap: [] as PhuCapItem[],
  bhBase: "",
  bhxhPercent: "8",
  bhytPercent: "1.5",
  bhtnPercent: "1",
  thueTNCNMode: "none" as "none" | "fixed",
  thueTNCNAmount: "",
};

function HrConfigModal({
  open, onOpenChange, staffId, config, locations, assignmentPairs, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  staffId: string;
  config: HrConfig | null;
  locations: { id: string; name: string }[];
  assignmentPairs: AssignmentPair[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ ...DEFAULT_FORM, salaryRows: [{ ...DEFAULT_SALARY_ROW }] });
  const [newPhuCapId, setNewPhuCapId] = useState("");
  const [newPhuCapAmount, setNewPhuCapAmount] = useState("");

  // Quick-add phụ cấp mới từ dropdown
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddApplyType, setQuickAddApplyType] = useState<"fixed_month" | "per_day">("fixed_month");

  const quickAddMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/salary-allowance-types", { name: quickAddName.trim(), applyType: quickAddApplyType }).then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/salary-allowance-types"] });
      setNewPhuCapId(data.id);
      setQuickAddOpen(false);
      setQuickAddName("");
      setQuickAddApplyType("fixed_month");
      toast({ title: "Đã thêm loại phụ cấp mới" });
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  // Fetch allowance types from default config
  const { data: allowanceTypes = [] } = useQuery<AllowanceTypeItem[]>({
    queryKey: ["/api/salary-allowance-types"],
    queryFn: () => apiRequest("GET", "/api/salary-allowance-types").then(r => r.json()),
    enabled: open,
  });

  // Fetch global default config (insurance % and tax deduction amounts)
  const { data: defaultCfg } = useQuery({
    queryKey: ["/api/salary-default-config"],
    queryFn: () => apiRequest("GET", "/api/salary-default-config").then(r => r.json()),
  });

  const defBhxh = String(defaultCfg?.bhxhPercent ?? "8");
  const defBhyt = String(defaultCfg?.bhytPercent ?? "1.5");
  const defBhtn = String(defaultCfg?.bhtnPercent ?? "1");
  const defGiamTruBanThan = parseFloat(String(defaultCfg?.giamTruBanThan ?? "15500000")) || 15500000;
  const defGiamTruNPT = parseFloat(String(defaultCfg?.giamTruNguoiPhuThuoc ?? "6200000")) || 6200000;

  // Populate form on open — pre-fill from assignmentPairs directly (no async needed)
  useEffect(() => {
    if (!open) return;
    if (config) {
      setForm({
        salaryRows: [{
          locationIds: config.locationId ? [config.locationId] : [],
          roleNames: config.roleName ? [config.roleName] : [],
          luongCB: config.luongCB ?? "",
        }],
        phuCap: Array.isArray(config.phuCap) ? config.phuCap : [],
        bhBase: config.bhxhBase ?? "",
        bhxhPercent: config.bhxhPercent ?? defBhxh,
        bhytPercent: config.bhytPercent ?? defBhyt,
        bhtnPercent: config.bhtnPercent ?? defBhtn,
        thueTNCNMode: (config.thueTNCNMode as "none" | "fixed") ?? "none",
        thueTNCNAmount: config.thueTNCNAmount ?? "",
      });
    } else {
      setNewPhuCapId("");
      setNewPhuCapAmount("");
      // Pre-fill: one row with ALL assigned locations and ALL assigned roles selected
      const prefillLocationIds = Array.from(new Set(assignmentPairs.map(p => p.locationId).filter(Boolean)));
      const prefillRoleNames = Array.from(new Set(assignmentPairs.map(p => p.roleName).filter(Boolean)));
      setForm({
        ...DEFAULT_FORM,
        // Pre-fill insurance % from global default config
        bhxhPercent: defBhxh,
        bhytPercent: defBhyt,
        bhtnPercent: defBhtn,
        salaryRows: [{ locationIds: prefillLocationIds, roleNames: prefillRoleNames, luongCB: "" }],
      });
    }
  }, [open, config?.id, staffId, defBhxh, defBhyt, defBhtn]);

  const updateRowField = (index: number, field: "luongCB", value: string) => {
    setForm(f => ({
      ...f,
      salaryRows: f.salaryRows.map((r, i) => i === index ? { ...r, [field]: value } : r),
    }));
  };
  const updateRowMulti = (index: number, field: "locationIds" | "roleNames", value: string[]) => {
    setForm(f => ({
      ...f,
      salaryRows: f.salaryRows.map((r, i) => i === index ? { ...r, [field]: value } : r),
    }));
  };

  const addRow = () => setForm(f => ({ ...f, salaryRows: [...f.salaryRows, { ...DEFAULT_SALARY_ROW }] }));
  const removeRow = (index: number) => setForm(f => ({ ...f, salaryRows: f.salaryRows.filter((_, i) => i !== index) }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const sharedBase = parseFloat(form.bhBase) || 0;
      const shared = {
        phuCap: form.phuCap,
        bhxhBase: sharedBase,
        bhxhPercent: parseFloat(form.bhxhPercent) || 8,
        bhytBase: sharedBase,
        bhytPercent: parseFloat(form.bhytPercent) || 1.5,
        bhtnPercent: parseFloat(form.bhtnPercent) || 1,
        thueTNCNMode: form.thueTNCNMode,
        thueTNCNAmount: parseFloat(form.thueTNCNAmount) || 0,
      };
      if (config) {
        // Edit: update single existing config (take first selection from multiselect)
        const row = form.salaryRows[0];
        const body = {
          staffId,
          locationId: row.locationIds[0] || null,
          roleName: row.roleNames[0] || null,
          luongCB: parseFloat(row.luongCB) || 0,
          ...shared,
        };
        const res = await apiRequest("PATCH", `/api/staff-hr-salary-configs/${config.id}`, body);
        if (!res.ok) { const err = await res.json(); throw new Error(err.message); }
        return res.json();
      } else {
        // Add: one config per location per row.
        // Roles are NOT expanded — selecting multiple roles in one row means
        // "this salary applies to all selected roles together" (roleName = null).
        // To have per-role configs, user must add separate rows with one role each.
        const validRows = form.salaryRows.filter(r => r.luongCB);
        if (validRows.length === 0) throw new Error("Vui lòng nhập lương cơ bản cho ít nhất một dòng");
        const expandedRows = validRows.flatMap(r => {
          const locs = r.locationIds.length > 0 ? r.locationIds : [null];
          // Exactly 1 role → use that role. 0 or multiple → null (all roles)
          const roleName = r.roleNames.length === 1 ? r.roleNames[0] : null;
          return locs.map(loc => ({
            locationId: loc,
            roleName,
            luongCB: parseFloat(r.luongCB) || 0,
          }));
        });
        const body = { staffId, rows: expandedRows, shared };
        const res = await apiRequest("POST", "/api/staff-hr-salary-configs/batch", body);
        if (!res.ok) { const err = await res.json(); throw new Error(err.message); }
        return res.json();
      }
    },
    onSuccess: () => {
      toast({ title: "Thành công", description: config ? "Đã cập nhật cấu hình" : "Đã thêm cấu hình" });
      onSaved();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  const addPhuCap = () => {
    if (!newPhuCapId) {
      toast({ title: "Vui lòng chọn loại phụ cấp", variant: "destructive" });
      return;
    }
    const selected = allowanceTypes.find(a => a.id === newPhuCapId);
    if (!selected) return;
    // Prevent duplicate
    if (form.phuCap.some(p => p.name === selected.name)) {
      toast({ title: "Phụ cấp này đã được thêm", variant: "destructive" });
      return;
    }
    setForm(f => ({
      ...f,
      phuCap: [...f.phuCap, { name: selected.name, amount: parseFloat(newPhuCapAmount) || 0, applyType: selected.applyType }],
    }));
    setNewPhuCapId(""); setNewPhuCapAmount("");
  };
  const removePhuCap = (i: number) =>
    setForm(f => ({ ...f, phuCap: f.phuCap.filter((_, idx) => idx !== i) }));

  const totalPhuCap = form.phuCap.reduce((s, p) => s + (p.amount || 0), 0);
  // Options for multiselects
  const locationOptions = locations.map(l => ({ value: l.id, label: l.name }));
  const staffRoleOptions = Array.from(new Set(assignmentPairs.map(p => p.roleName).filter(Boolean)))
    .map(name => ({ value: name, label: name }));
  // Fallback: if no role options from assignments, let user type freely → handled in UI
  const hasRoleOptions = staffRoleOptions.length > 0;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[80vw] max-w-[80vw] p-0 overflow-hidden gap-0">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center">
                <Settings2 className="h-4 w-4 text-white" />
              </div>
              <DialogTitle className="text-base font-bold text-white">
                {config ? "Chỉnh sửa cấu hình lương" : "Thêm cấu hình lương nhân sự"}
              </DialogTitle>
            </div>
            <button onClick={() => onOpenChange(false)} className="h-7 w-7 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
              <X className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[76vh] overflow-y-auto">

          {/* ── Cấu hình lương card ── */}
          <div className="rounded-xl border-2 border-violet-200 bg-violet-50/30 p-4 space-y-3">
            <p className="text-xs font-bold text-violet-700 uppercase tracking-wide flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" /> Cấu hình lương
            </p>

            {/* Salary rows */}
            <div className="space-y-3">
              {form.salaryRows.map((row, idx) => (
                <div key={idx} className="border border-violet-100 rounded-lg p-3 bg-white">
                  <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
                    {/* Cơ sở */}
                    <div>
                      <p className="text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-1 flex items-center gap-1">
                        <Building2 className="h-3 w-3" /> Cơ sở
                      </p>
                      <MultiSelect
                        key={`loc-${staffId}-${idx}-${open}`}
                        options={locationOptions}
                        onValueChange={v => updateRowMulti(idx, "locationIds", v)}
                        defaultValue={row.locationIds}
                        placeholder="Chọn cơ sở..."
                        maxCount={2}
                        modalPopover
                      />
                    </div>

                    {/* Vai trò */}
                    <div>
                      <p className="text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-1 flex items-center gap-1">
                        <UserCheck className="h-3 w-3" /> Vai trò
                      </p>
                      {hasRoleOptions ? (
                        <MultiSelect
                          key={`role-${staffId}-${idx}-${open}`}
                          options={staffRoleOptions}
                          onValueChange={v => updateRowMulti(idx, "roleNames", v)}
                          defaultValue={row.roleNames}
                          placeholder="Chọn vai trò..."
                          maxCount={2}
                          modalPopover
                        />
                      ) : (
                        <Input
                          className="h-9 text-sm"
                          placeholder="VD: Giáo viên..."
                          value={row.roleNames[0] ?? ""}
                          onChange={e => updateRowMulti(idx, "roleNames", e.target.value ? [e.target.value] : [])}
                        />
                      )}
                    </div>

                    {/* Lương cơ bản */}
                    <div>
                      <p className="text-[10px] font-semibold text-slate-900 uppercase tracking-wide mb-1 flex items-center gap-1">
                        <DollarSign className="h-3 w-3" /> Lương cơ bản (VNĐ)
                      </p>
                      <div className="relative">
                        <Input
                          type="number"
                          className="h-9 text-sm pr-10"
                          placeholder="VD: 10000000"
                          value={row.luongCB}
                          onChange={e => updateRowField(idx, "luongCB", e.target.value)}
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-medium">VNĐ</span>
                      </div>
                      {row.luongCB && !isNaN(parseFloat(row.luongCB)) && (
                        <p className="text-xs text-violet-600 font-medium mt-0.5">
                          ≈ {parseFloat(row.luongCB).toLocaleString("vi-VN")}đ
                        </p>
                      )}
                    </div>

                    {/* Nút xoá */}
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      disabled={form.salaryRows.length === 1}
                      className={cn(
                        "h-9 w-9 rounded-lg flex items-center justify-center transition-colors flex-shrink-0",
                        form.salaryRows.length === 1
                          ? "text-slate-300 cursor-not-allowed"
                          : "text-red-400 hover:bg-red-50 hover:text-red-600"
                      )}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add row button — only in add mode */}
            {!config && (
              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-800 mt-1 transition-colors"
              >
                <div className="h-5 w-5 rounded-full border-2 border-violet-400 flex items-center justify-center">
                  <Plus className="h-3 w-3" />
                </div>
                Thêm gói lương
              </button>
            )}
          </div>

          {/* ── Phụ cấp ── */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1">
              <Plus className="h-3 w-3" /> Các khoản phụ cấp
              {totalPhuCap > 0 && (
                <span className="ml-1 text-emerald-600 normal-case font-normal">
                  (+{totalPhuCap.toLocaleString("vi-VN")}đ)
                </span>
              )}
            </Label>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              {form.phuCap.length === 0 ? (
                <p className="px-4 py-3 text-xs text-muted-foreground text-center">Chưa có khoản phụ cấp nào</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {form.phuCap.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2">
                      <span className="flex-1 text-sm font-medium">{p.name}</span>
                      {p.applyType && (
                        <span className={cn(
                          "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium shrink-0",
                          p.applyType === "fixed_month" ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"
                        )}>
                          {p.applyType === "fixed_month" ? "Cố định" : "Theo ngày"}
                        </span>
                      )}
                      <span className="text-sm text-emerald-600 font-semibold tabular-nums shrink-0">+{p.amount.toLocaleString("vi-VN")}đ</span>
                      <button onClick={() => removePhuCap(i)} className="h-5 w-5 rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors shrink-0">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/80 border-t border-slate-100">
                <Select value={newPhuCapId} onValueChange={(v) => {
                  if (v === "__new__") { setQuickAddOpen(true); }
                  else { setNewPhuCapId(v); }
                }}>
                  <SelectTrigger className="h-7 text-xs flex-1">
                    <SelectValue placeholder={allowanceTypes.length === 0 ? "Chưa có loại phụ cấp nào" : "Chọn loại phụ cấp..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {allowanceTypes
                      .filter(a => !form.phuCap.some(p => p.name === a.name))
                      .map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          <span className="flex items-center gap-2">
                            {a.name}
                            <span className={cn(
                              "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium",
                              a.applyType === "fixed_month" ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"
                            )}>
                              {a.applyType === "fixed_month" ? "Cố định" : "Theo ngày"}
                            </span>
                          </span>
                        </SelectItem>
                      ))
                    }
                    <SelectItem value="__new__" className="text-violet-600 font-medium border-t border-gray-100 mt-1 pt-1">
                      <span className="flex items-center gap-1.5">
                        <Plus className="h-3 w-3" /> Thêm loại phụ cấp mới
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  className="h-7 text-xs w-28"
                  placeholder="Số tiền"
                  value={newPhuCapAmount}
                  onChange={e => setNewPhuCapAmount(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addPhuCap()}
                />
                <Button
                  size="sm"
                  className="h-7 px-2.5 text-xs gap-1 bg-violet-600 hover:bg-violet-700 text-white"
                  onClick={addPhuCap}
                  type="button"
                  disabled={allowanceTypes.length === 0}
                >
                  <Plus className="h-3 w-3" /> Thêm
                </Button>
              </div>
              {allowanceTypes.length === 0 && (
                <p className="px-3 py-1.5 text-[10px] text-amber-600 bg-amber-50 border-t border-amber-100">
                  Vào <strong>Cấu hình mặc định</strong> để thêm danh mục phụ thu trước.
                </p>
              )}
            </div>
          </div>

          {/* ── Bảo hiểm ── */}
          <div className="space-y-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50/40">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <Shield className="h-3.5 w-3.5 text-indigo-500" /> Bảo hiểm
              </p>
              <span className="text-[10px] text-indigo-500 italic">Tỷ lệ % lấy từ Cấu hình mặc định</span>
            </div>
            {/* Mức đóng chung */}
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold text-slate-900 uppercase tracking-wide">Mức đóng (VNĐ)</Label>
              <div className="relative max-w-xs">
                <Input
                  type="number"
                  className="h-8 text-xs pr-10"
                  placeholder="0"
                  value={form.bhBase}
                  onChange={e => setForm(f => ({ ...f, bhBase: e.target.value }))}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">VNĐ</span>
              </div>
            </div>
            {/* 3 thẻ */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Bảo hiểm xã hội", key: "bhxhPercent" as const, color: "text-indigo-600", defPct: defBhxh },
                { label: "Bảo hiểm y tế",   key: "bhytPercent" as const, color: "text-emerald-600", defPct: defBhyt },
                { label: "BH Thất nghiệp",  key: "bhtnPercent" as const, color: "text-amber-600",   defPct: defBhtn },
              ].map(({ label, key, color, defPct }) => {
                const pct = parseFloat(form[key] || defPct) || 0;
                const base = parseFloat(form.bhBase) || 0;
                const computed = Math.round(base * pct / 100);
                return (
                  <div key={key} className="rounded-lg border border-slate-200 bg-white p-3 space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-700">{label}</p>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-slate-500 uppercase tracking-wide">Tỷ lệ (%)</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          className="h-8 text-xs pr-6"
                          value={form[key]}
                          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
                      </div>
                    </div>
                    {base > 0 && (
                      <p className={cn("text-[10px] font-medium", color)}>
                        = {computed.toLocaleString("vi-VN")}đ
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Thuế TNCN ── */}
          <div className="space-y-2.5 p-3.5 rounded-xl border border-slate-200 bg-slate-50/40">
            <p className="text-xs font-semibold text-slate-700 flex items-center gap-1">
              <Percent className="h-3 w-3 text-amber-500" /> Thuế thu nhập cá nhân
            </p>
            <RadioGroup
              value={form.thueTNCNMode}
              onValueChange={v => setForm(f => ({ ...f, thueTNCNMode: v as "none" | "fixed", thueTNCNAmount: "" }))}
              className="flex items-center gap-6"
            >
              {[
                { value: "none",  label: "Không tính" },
                { value: "fixed", label: "Theo Quy định" },
              ].map(opt => (
                <div key={opt.value} className="flex items-center gap-2">
                  <RadioGroupItem value={opt.value} id={`tncn-${opt.value}`} />
                  <Label htmlFor={`tncn-${opt.value}`} className="text-sm cursor-pointer">{opt.label}</Label>
                </div>
              ))}
            </RadioGroup>

            {form.thueTNCNMode === "fixed" && (
              <div className="mt-2 space-y-3 rounded-lg border border-amber-100 bg-amber-50/40 p-3">
                {/* Giảm trừ bản thân — read-only from defaultConfig */}
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-600 w-48 shrink-0">Giảm trừ bản thân</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded px-2.5 py-1 tabular-nums">
                      {defGiamTruBanThan.toLocaleString("vi-VN")}đ
                    </span>
                    <span className="text-[10px] text-muted-foreground italic">/ tháng (từ Cấu hình mặc định)</span>
                  </div>
                </div>

                {/* Giảm trừ người phụ thuộc — editable count */}
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-600 w-48 shrink-0">Giảm trừ người phụ thuộc</span>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        className="h-8 text-xs w-20 text-center"
                        placeholder="0"
                        value={form.thueTNCNAmount}
                        onChange={e => setForm(f => ({ ...f, thueTNCNAmount: e.target.value }))}
                      />
                    </div>
                    <span className="text-xs text-slate-500">người</span>
                    {parseFloat(form.thueTNCNAmount) > 0 && (
                      <span className="text-xs font-semibold text-amber-700 tabular-nums">
                        = {(Math.round(parseFloat(form.thueTNCNAmount)) * defGiamTruNPT).toLocaleString("vi-VN")}đ/tháng
                      </span>
                    )}
                  </div>
                </div>

                {/* Summary */}
                {(() => {
                  const npt = Math.max(0, Math.round(parseFloat(form.thueTNCNAmount) || 0));
                  const total = defGiamTruBanThan + npt * defGiamTruNPT;
                  return (
                    <div className="text-[10px] text-amber-700 font-medium border-t border-amber-100 pt-2">
                      Tổng giảm trừ: {defGiamTruBanThan.toLocaleString("vi-VN")}đ
                      {npt > 0 && ` + ${npt} × ${defGiamTruNPT.toLocaleString("vi-VN")}đ`}
                      {" = "}<span className="font-bold">{total.toLocaleString("vi-VN")}đ/tháng</span>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50/80 flex items-center justify-end gap-2.5">
          <Button variant="outline" size="sm" className="h-9 px-4" onClick={() => onOpenChange(false)} disabled={saveMutation.isPending}>
            Hủy
          </Button>
          <Button
            size="sm"
            className="h-9 px-5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
            Lưu cấu hình
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Quick-add phụ cấp mới */}
    <Dialog open={quickAddOpen} onOpenChange={(v) => { setQuickAddOpen(v); if (!v) { setQuickAddName(""); setQuickAddApplyType("fixed_month"); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Plus className="h-4 w-4 text-violet-600" /> Thêm loại phụ cấp mới
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Tên phụ cấp <span className="text-red-500">*</span></Label>
            <Input
              placeholder="VD: Xăng xe, Điện thoại, Ăn trưa..."
              value={quickAddName}
              onChange={e => setQuickAddName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && quickAddName.trim() && quickAddMutation.mutate()}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Loại hình áp dụng</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setQuickAddApplyType("fixed_month")}
                className={cn(
                  "flex flex-col items-start p-3 rounded-lg border text-left transition-colors",
                  quickAddApplyType === "fixed_month" ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:bg-gray-50"
                )}
              >
                <span className="text-xs font-semibold text-gray-800">Cố định tháng</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">Hưởng đủ dù làm ít ngày</span>
              </button>
              <button
                type="button"
                onClick={() => setQuickAddApplyType("per_day")}
                className={cn(
                  "flex flex-col items-start p-3 rounded-lg border text-left transition-colors",
                  quickAddApplyType === "per_day" ? "border-orange-400 bg-orange-50" : "border-gray-200 hover:bg-gray-50"
                )}
              >
                <span className="text-xs font-semibold text-gray-800">Chia theo ngày</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">Tính theo công thực tế</span>
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setQuickAddOpen(false)} disabled={quickAddMutation.isPending}>
              Huỷ
            </Button>
            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => quickAddMutation.mutate()}
              disabled={!quickAddName.trim() || quickAddMutation.isPending}
            >
              {quickAddMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
              Thêm
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

function StaffSalaryConfigTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: myPerms } = useMyPermissions();
  const staffCfgPerm = myPerms?.permissions?.["/tong-luong#staff-config"];
  const isSuperAdmin = myPerms?.isSuperAdmin ?? false;
  const canCreate = isSuperAdmin || !!staffCfgPerm?.canCreate;
  const canEdit = isSuperAdmin || !!staffCfgPerm?.canEdit;
  const canDelete = isSuperAdmin || !!staffCfgPerm?.canDelete;
  const [search, setSearch] = useState("");
  const [selectedStaff, setSelectedStaff] = useState<StaffItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<HrConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: staffList = [], isLoading: loadingStaff } = useQuery<StaffItem[]>({
    queryKey: ["/api/staff-hr-salary-configs/staff-list"],
  });

  const { data: locations = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/locations"],
  });

  const { data: configs = [], isLoading: loadingConfigs, refetch: refetchConfigs } = useQuery<HrConfig[]>({
    queryKey: ["/api/staff-hr-salary-configs", selectedStaff?.id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/staff-hr-salary-configs?staffId=${selectedStaff!.id}`);
      const data = await res.json();
      return data.map((c: any) => ({
        ...c,
        phuCap: Array.isArray(c.phu_cap ?? c.phuCap) ? (c.phu_cap ?? c.phuCap) : [],
        luongCB: String(c.luong_cb ?? c.luongCB ?? 0),
        bhxhBase: String(c.bhxh_base ?? c.bhxhBase ?? 0),
        bhxhPercent: String(c.bhxh_percent ?? c.bhxhPercent ?? 8),
        bhytBase: String(c.bhyt_base ?? c.bhytBase ?? 0),
        bhytPercent: String(c.bhyt_percent ?? c.bhytPercent ?? 1.5),
        bhtnPercent: String(c.bhtn_percent ?? c.bhtnPercent ?? 1),
        thueTNCNMode: c.thue_tncn_mode ?? c.thueTNCNMode ?? "none",
        thueTNCNAmount: String(c.thue_tncn_amount ?? c.thueTNCNAmount ?? 0),
        locationId: c.location_id ?? c.locationId ?? null,
        locationName: c.locationName ?? null,
        roleName: c.role_name ?? c.roleName ?? null,
      }));
    },
    enabled: !!selectedStaff,
  });

  const handleSaved = () => {
    refetchConfigs();
    queryClient.invalidateQueries({ queryKey: ["/api/staff-hr-salary-configs/staff-list"] });
    setEditingConfig(null);
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await apiRequest("DELETE", `/api/staff-hr-salary-configs/${id}`);
      refetchConfigs();
      queryClient.invalidateQueries({ queryKey: ["/api/staff-hr-salary-configs/staff-list"] });
      toast({ title: "Đã xoá cấu hình" });
    } catch (err: any) {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const filteredStaff = staffList.filter(s =>
    s.fullName.toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => { setEditingConfig(null); setModalOpen(true); };
  const openEdit = (c: HrConfig) => { setEditingConfig(c); setModalOpen(true); };

  // Computed from config for display
  const getComputedBhxh = (c: HrConfig) => Math.round(parseFloat(c.bhxhBase) * parseFloat(c.bhxhPercent) / 100);
  const getComputedBhyt = (c: HrConfig) => Math.round(parseFloat(c.bhytBase) * parseFloat(c.bhytPercent) / 100);
  const getComputedBhtn = (c: HrConfig) => Math.round(parseFloat(c.bhxhBase) * parseFloat(c.bhtnPercent ?? "1") / 100);
  const getTotalPhuCap = (c: HrConfig) => c.phuCap.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="flex gap-4 min-h-[600px]">
      {/* ── Left panel: Staff list ──────────────────────────────────── */}
      <div className="w-64 shrink-0 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
        <div className="px-3 pt-3.5 pb-2.5 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Tìm nhân sự..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingStaff ? (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground text-xs">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải...
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">Không tìm thấy nhân sự</div>
          ) : (
            filteredStaff.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedStaff(s)}
                className={cn(
                  "w-full text-left px-3 py-2.5 border-b border-gray-50 transition-colors flex items-center gap-2.5 group",
                  selectedStaff?.id === s.id
                    ? "bg-violet-600 text-white"
                    : "hover:bg-violet-50/60"
                )}
              >
                <div className={cn(
                  "h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                  selectedStaff?.id === s.id ? "bg-white/20 text-white" : "bg-violet-100 text-violet-700"
                )}>
                  {s.fullName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-xs font-semibold truncate", selectedStaff?.id === s.id ? "text-white" : "text-foreground")}>
                    {s.fullName}
                  </p>
                  <p className={cn("text-[10px] truncate", selectedStaff?.id === s.id ? "text-white/70" : "text-muted-foreground")}>
                    {s.code}
                  </p>
                </div>
                {s.configCount > 0 && (
                  <span className={cn(
                    "text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0",
                    selectedStaff?.id === s.id ? "bg-white/20 text-white" : "bg-violet-100 text-violet-600"
                  )}>
                    {s.configCount}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Right panel: Config detail ──────────────────────────────── */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
        {!selectedStaff ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <div className="h-14 w-14 rounded-2xl bg-violet-50 flex items-center justify-center">
              <Users className="h-7 w-7 text-violet-300" />
            </div>
            <p className="text-sm font-medium">Chọn nhân sự để xem cấu hình lương</p>
            <p className="text-xs text-muted-foreground/60">Danh sách nhân sự ở bên trái</p>
          </div>
        ) : (
          <>
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gradient-to-r from-violet-50 to-indigo-50">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold">
                  {selectedStaff.fullName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-foreground">{selectedStaff.fullName}</h2>
                  <p className="text-xs text-muted-foreground">{selectedStaff.code}</p>
                </div>
              </div>
              {canCreate && (
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-0 shadow-sm"
                onClick={openAdd}
              >
                <Plus className="h-3.5 w-3.5" /> Thêm cấu hình
              </Button>
              )}
            </div>

            {/* Config table */}
            <div className="flex-1 overflow-auto">
              {loadingConfigs ? (
                <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-5 w-5 animate-spin" /> Đang tải...
                </div>
              ) : configs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="h-12 w-12 rounded-xl bg-slate-50 flex items-center justify-center">
                    <Settings2 className="h-6 w-6 text-slate-300" />
                  </div>
                  <p className="text-sm text-muted-foreground">Chưa có cấu hình lương</p>
                  {canCreate && (
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={openAdd}>
                    <Plus className="h-3.5 w-3.5" /> Thêm cấu hình đầu tiên
                  </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-max min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-100">
                      {["Cơ sở", "Vai trò", "Lương CB", "Phụ cấp", "BHXH", "BHYT", "BHTN", "Thao tác"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {configs.map((c, i) => {
                      const phuCap = getTotalPhuCap(c);
                      const bhxh = getComputedBhxh(c);
                      const bhyt = getComputedBhyt(c);
                      const bhtn = getComputedBhtn(c);
                      const tncnAmount = c.thueTNCNMode === "fixed" ? parseFloat(c.thueTNCNAmount) : 0;
                      return (
                        <tr
                          key={c.id}
                          className={cn(
                            "border-b border-gray-50 hover:bg-violet-50/30 transition-colors",
                            i % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                          )}
                        >
                          <td className="px-4 py-3">
                            {c.locationName ? (
                              <span className="flex items-center gap-1.5 text-xs">
                                <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                                {c.locationName}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">— Tất cả —</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {c.roleName ? (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-violet-50 text-violet-700">
                                {c.roleName}
                              </span>
                            ) : (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 italic">
                                Tất cả vai trò
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-semibold text-xs tabular-nums text-slate-800">
                            {parseFloat(c.luongCB).toLocaleString("vi-VN")}đ
                          </td>
                          <td className="px-4 py-3">
                            {phuCap > 0 ? (
                              <span className="text-xs text-emerald-600 font-medium tabular-nums">
                                +{phuCap.toLocaleString("vi-VN")}đ
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">0đ</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs">
                              <span className="text-red-500 font-medium tabular-nums">
                                {bhxh.toLocaleString("vi-VN")}đ
                              </span>
                              <span className="text-muted-foreground ml-1">({c.bhxhPercent}%)</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs">
                              <span className="text-red-500 font-medium tabular-nums">
                                {bhyt.toLocaleString("vi-VN")}đ
                              </span>
                              <span className="text-muted-foreground ml-1">({c.bhytPercent}%)</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs">
                              <span className="text-red-500 font-medium tabular-nums">
                                {bhtn.toLocaleString("vi-VN")}đ
                              </span>
                              <span className="text-muted-foreground ml-1">({c.bhtnPercent ?? "1"}%)</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {canEdit && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-violet-600 hover:bg-violet-50"
                                onClick={() => openEdit(c)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              )}
                              {canDelete && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                                onClick={() => setDeleteTarget(c.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {selectedStaff && (
        <HrConfigModal
          open={modalOpen}
          onOpenChange={v => { setModalOpen(v); if (!v) setEditingConfig(null); }}
          staffId={selectedStaff.id}
          config={editingConfig}
          locations={locations}
          assignmentPairs={selectedStaff.assignmentPairs ?? []}
          onSaved={handleSaved}
        />
      )}

      <AlertDialog open={!!deleteTarget}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá cấu hình lương?</AlertDialogTitle>
            <AlertDialogDescription>Hành động này không thể hoàn tác.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)} disabled={deleting}>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleting}
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Default Salary Config Tab ────────────────────────────────────────────────
interface TaxBracket {
  bac: number;
  from: number;
  to: number | null;
  rate: string;
}

const DEFAULT_TAX_BRACKETS: TaxBracket[] = [
  { bac: 1, from: 0,          to: 10000000,  rate: "5"  },
  { bac: 2, from: 10000000,   to: 30000000,  rate: "10" },
  { bac: 3, from: 30000000,   to: 60000000,  rate: "20" },
  { bac: 4, from: 60000000,   to: 100000000, rate: "30" },
  { bac: 5, from: 100000000,  to: null,      rate: "35" },
];

function fmtRange(from: number, to: number | null): string {
  if (from === 0 && to != null) return `Đến ${(to / 1_000_000).toLocaleString("vi-VN")} triệu đồng`;
  if (to == null) return `Trên ${(from / 1_000_000).toLocaleString("vi-VN")} triệu đồng`;
  return `Trên ${(from / 1_000_000).toLocaleString("vi-VN")} đến ${(to / 1_000_000).toLocaleString("vi-VN")} triệu đồng`;
}

function DefaultSalaryConfigTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: myPerms } = useMyPermissions();
  const defCfgPerm = myPerms?.permissions?.["/tong-luong#default-config"];
  const isSuperAdmin = myPerms?.isSuperAdmin ?? false;
  const canEdit = isSuperAdmin || !!defCfgPerm?.canEdit;

  const { data, isLoading } = useQuery({
    queryKey: ["/api/salary-default-config"],
    queryFn: () => apiRequest("GET", "/api/salary-default-config").then(r => r.json()),
  });

  const [bhxhPercent, setBhxhPercent] = useState("8");
  const [bhytPercent, setBhytPercent] = useState("1.5");
  const [bhtnPercent, setBhtnPercent] = useState("1");
  const [giamTruBanThan, setGiamTruBanThan] = useState("15500000");
  const [giamTruNguoiPhuThuoc, setGiamTruNguoiPhuThuoc] = useState("6200000");
  const [taxBrackets, setTaxBrackets] = useState<TaxBracket[]>(DEFAULT_TAX_BRACKETS);
  const [dirty, setDirty] = useState(false);

  // Sync state when data loads
  useEffect(() => {
    if (!data) return;
    setBhxhPercent(String(data.bhxhPercent ?? "8"));
    setBhytPercent(String(data.bhytPercent ?? "1.5"));
    setBhtnPercent(String(data.bhtnPercent ?? "1"));
    setGiamTruBanThan(String(data.giamTruBanThan ?? "15500000"));
    setGiamTruNguoiPhuThuoc(String(data.giamTruNguoiPhuThuoc ?? "6200000"));
    setTaxBrackets(
      Array.isArray(data.taxBrackets) && data.taxBrackets.length > 0
        ? data.taxBrackets
        : DEFAULT_TAX_BRACKETS
    );
    setDirty(false);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/salary-default-config", {
        bhxhPercent,
        bhytPercent,
        bhtnPercent,
        giamTruBanThan,
        giamTruNguoiPhuThuoc,
        taxBrackets,
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/salary-default-config"] });
      setDirty(false);
      toast({ title: "Đã lưu cấu hình mặc định" });
    },
    onError: (err: any) => {
      toast({ title: "Lỗi lưu cấu hình", description: err.message, variant: "destructive" });
    },
  });

  function updateBracketRate(bac: number, value: string) {
    setTaxBrackets(prev => prev.map(b => b.bac === bac ? { ...b, rate: value } : b));
    setDirty(true);
  }

  const saveButton = canEdit && (
    <div className="flex items-center gap-3 pt-2">
      <Button
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending || !dirty}
        className="bg-violet-600 hover:bg-violet-700 text-white"
      >
        {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BadgeCheck className="h-4 w-4 mr-2" />}
        Lưu cấu hình
      </Button>
      {!dirty && !saveMutation.isPending && (
        <span className="text-xs text-green-600 flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5" /> Đã lưu
        </span>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <Tabs defaultValue="insurance" className="w-full">
      <TabsList className="mb-4 bg-gray-100 p-1 rounded-lg h-auto gap-1">
        <TabsTrigger value="insurance" className="flex items-center gap-1.5 text-sm rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
          <Shield className="h-3.5 w-3.5" /> Bảo hiểm
        </TabsTrigger>
        <TabsTrigger value="tax" className="flex items-center gap-1.5 text-sm rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
          <TrendingUp className="h-3.5 w-3.5" /> Thuế TNCN
        </TabsTrigger>
        <TabsTrigger value="allowance" className="flex items-center gap-1.5 text-sm rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
          <Banknote className="h-3.5 w-3.5" /> Phụ cấp
        </TabsTrigger>
      </TabsList>

      {/* ── Bảo hiểm ── */}
      <TabsContent value="insurance" className="mt-0">
        <div className="space-y-6 max-w-2xl">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-violet-50 border-b border-violet-100">
              <Shield className="h-4 w-4 text-violet-600" />
              <span className="text-sm font-semibold text-violet-700">Bảo hiểm (trích từ lương người lao động)</span>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-4">
                <Label className="w-52 shrink-0 text-sm font-medium text-gray-700">BHXH (Bảo hiểm xã hội)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={bhxhPercent}
                    onChange={e => { setBhxhPercent(e.target.value); setDirty(true); }}
                    className="w-28 text-right"
                  />
                  <Percent className="h-4 w-4 text-gray-400" />
                </div>
                <span className="text-xs text-muted-foreground">(Quy định nhà nước: 8%)</span>
              </div>
              <div className="flex items-center gap-4">
                <Label className="w-52 shrink-0 text-sm font-medium text-gray-700">BHYT (Bảo hiểm y tế)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={bhytPercent}
                    onChange={e => { setBhytPercent(e.target.value); setDirty(true); }}
                    className="w-28 text-right"
                  />
                  <Percent className="h-4 w-4 text-gray-400" />
                </div>
                <span className="text-xs text-muted-foreground">(Quy định nhà nước: 1.5%)</span>
              </div>
              <div className="flex items-center gap-4">
                <Label className="w-52 shrink-0 text-sm font-medium text-gray-700">BHTN (Bảo hiểm thất nghiệp)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={bhtnPercent}
                    onChange={e => { setBhtnPercent(e.target.value); setDirty(true); }}
                    className="w-28 text-right"
                  />
                  <Percent className="h-4 w-4 text-gray-400" />
                </div>
                <span className="text-xs text-muted-foreground">(Quy định nhà nước: 1%)</span>
              </div>
            </div>
          </div>
          {saveButton}
        </div>
      </TabsContent>

      {/* ── Thuế TNCN ── */}
      <TabsContent value="tax" className="mt-0">
        <div className="space-y-6 max-w-2xl">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-amber-50 border-b border-amber-100">
              <TrendingUp className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-700">Thuế thu nhập cá nhân (TNCN)</span>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-4">
                <Label className="w-52 shrink-0 text-sm font-medium text-gray-700">Giảm trừ bản thân</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    step={100000}
                    value={giamTruBanThan}
                    onChange={e => { setGiamTruBanThan(e.target.value); setDirty(true); }}
                    className="w-40 text-right"
                  />
                  <span className="text-sm text-gray-500">đ/tháng</span>
                </div>
                <span className="text-xs text-muted-foreground">(Hiện hành: 15.500.000đ)</span>
              </div>
              <div className="flex items-center gap-4">
                <Label className="w-52 shrink-0 text-sm font-medium text-gray-700">Giảm trừ người phụ thuộc</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    step={100000}
                    value={giamTruNguoiPhuThuoc}
                    onChange={e => { setGiamTruNguoiPhuThuoc(e.target.value); setDirty(true); }}
                    className="w-40 text-right"
                  />
                  <span className="text-sm text-gray-500">đ/người/tháng</span>
                </div>
                <span className="text-xs text-muted-foreground">(Hiện hành: 6.200.000đ/người)</span>
              </div>

              <div className="mt-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">Bậc nộp thuế (thuế suất có thể chỉnh sửa thủ công)</p>
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-600 w-14">Bậc</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Thu nhập tính thuế/tháng</th>
                        <th className="px-4 py-2.5 text-center font-semibold text-gray-600 w-32">Thuế suất (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taxBrackets.map((b, idx) => (
                        <tr key={b.bac} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                          <td className="px-4 py-2 font-medium text-gray-700">{b.bac}</td>
                          <td className="px-4 py-2 text-gray-600">{fmtRange(b.from, b.to)}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center justify-center gap-1">
                              <Input
                                type="text"
                                value={b.rate}
                                onChange={e => updateBracketRate(b.bac, e.target.value)}
                                className="w-16 text-center h-8 text-sm"
                              />
                              <span className="text-gray-500 text-xs">%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  * Các mức thu nhập theo bảng biểu thuế lũy tiến từng phần (Điều 22 Luật Thuế TNCN). Có thể sửa thuế suất nếu có thay đổi pháp luật.
                </p>
              </div>
            </div>
          </div>
          {saveButton}
        </div>
      </TabsContent>

      {/* ── Phụ cấp ── */}
      <TabsContent value="allowance" className="mt-0">
        <div className="max-w-2xl">
          <AllowanceTypesCard />
        </div>
      </TabsContent>
    </Tabs>
  );
}

// ─── Allowance Types Card ──────────────────────────────────────────────────────
interface AllowanceTypeItem {
  id: string;
  name: string;
  applyType: "fixed_month" | "per_day";
}

const APPLY_TYPE_LABELS: Record<string, string> = {
  fixed_month: "Cố định tháng",
  per_day: "Chia đều theo ngày",
};

function AllowanceTypesCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery<AllowanceTypeItem[]>({
    queryKey: ["/api/salary-allowance-types"],
    queryFn: () => apiRequest("GET", "/api/salary-allowance-types").then(r => r.json()),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newApplyType, setNewApplyType] = useState<"fixed_month" | "per_day">("fixed_month");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/salary-allowance-types", { name: newName, applyType: newApplyType }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/salary-allowance-types"] });
      setDialogOpen(false);
      setNewName("");
      setNewApplyType("fixed_month");
      toast({ title: "Đã thêm loại phụ cấp" });
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/salary-allowance-types/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/salary-allowance-types"] });
      setDeleteId(null);
      toast({ title: "Đã xoá loại phụ cấp" });
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 bg-emerald-50 border-b border-emerald-100">
          <div className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-700">Danh mục Phụ cấp</span>
          </div>
          <Button
            size="sm"
            onClick={() => setDialogOpen(true)}
            className="h-7 gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus className="h-3.5 w-3.5" /> Thêm
          </Button>
        </div>

        <div className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              Chưa có loại phụ cấp nào. Nhấn <strong>Thêm</strong> để tạo mới.
            </div>
          ) : (
            <div className="rounded-lg border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500">Tên phụ cấp</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500">Loại hình áp dụng</th>
                    <th className="px-4 py-2.5 w-12" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                      <td className="px-4 py-2.5 font-medium text-gray-800">{item.name}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium",
                          item.applyType === "fixed_month"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-orange-50 text-orange-700"
                        )}>
                          {APPLY_TYPE_LABELS[item.applyType]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                          onClick={() => setDeleteId(item.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-3">
            * <strong>Cố định tháng:</strong> nhân sự hưởng đủ phụ cấp dù làm ít ngày hơn trong tháng.<br />
            * <strong>Chia đều theo ngày:</strong> phụ cấp ÷ tổng công × công thực của nhân sự.
          </p>
        </div>
      </div>

      {/* Add dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) { setNewName(""); setNewApplyType("fixed_month"); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-emerald-600" /> Thêm loại phụ cấp
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Tên phụ cấp <span className="text-red-500">*</span></Label>
              <Input
                placeholder="VD: Xăng xe, Điện thoại, Ăn trưa..."
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && newName.trim() && createMutation.mutate()}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Loại hình áp dụng</Label>
              <RadioGroup
                value={newApplyType}
                onValueChange={v => setNewApplyType(v as "fixed_month" | "per_day")}
                className="space-y-3"
              >
                <div className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                  newApplyType === "fixed_month" ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:bg-gray-50"
                )}
                  onClick={() => setNewApplyType("fixed_month")}
                >
                  <RadioGroupItem value="fixed_month" id="at-fixed" className="mt-0.5" />
                  <div>
                    <Label htmlFor="at-fixed" className="text-sm font-medium cursor-pointer">Cố định tháng</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Nhân sự hưởng đủ phụ cấp trong tháng dù làm ít ngày hơn</p>
                  </div>
                </div>
                <div className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                  newApplyType === "per_day" ? "border-orange-400 bg-orange-50" : "border-gray-200 hover:bg-gray-50"
                )}
                  onClick={() => setNewApplyType("per_day")}
                >
                  <RadioGroupItem value="per_day" id="at-perday" className="mt-0.5" />
                  <div>
                    <Label htmlFor="at-perday" className="text-sm font-medium cursor-pointer">Chia đều theo ngày</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Phụ cấp ÷ tổng công × công thực của nhân sự trong tháng</p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={createMutation.isPending}>
                Huỷ
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => createMutation.mutate()}
                disabled={!newName.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Thêm
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá loại phụ thu?</AlertDialogTitle>
            <AlertDialogDescription>Hành động này không thể hoàn tác.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteId(null)} disabled={deleteMutation.isPending}>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteMutation.isPending}
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TongLuong() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabValue>(getTabFromUrl);

  const handleTabChange = (value: TabValue) => {
    setActiveTab(value);
    setLocation(`/tong-luong?tab=${value}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <Wallet className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Tổng lương</h1>
            <p className="text-xs text-muted-foreground">Quản lý bảng lương và cấu hình lương nhân sự</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={v => handleTabChange(v as TabValue)}>
          <div className="flex flex-wrap gap-2 mb-4">
            {TABS.map(t => (
              <button
                key={t.value}
                onClick={() => handleTabChange(t.value)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  activeTab === t.value
                    ? "bg-violet-600 text-white shadow-sm"
                    : "bg-white border border-gray-200 text-muted-foreground hover:bg-gray-50"
                )}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>

          <TabsContent value="salary-sheets" className="mt-0">
            <SalarySheetsTab />
          </TabsContent>
          <TabsContent value="staff-config" className="mt-0">
            <StaffSalaryConfigTab />
          </TabsContent>
          <TabsContent value="default-config" className="mt-0">
            <DefaultSalaryConfigTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
