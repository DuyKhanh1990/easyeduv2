import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, eachDayOfInterval, parseISO, isValid, getDay } from "date-fns";
import {
  ChevronLeft, ChevronRight, Wallet,
  TableProperties, Lock, BookOpen, CheckCircle2, AlertCircle,
  Clock, Zap, TrendingUp, BadgeCheck, CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { calculateTotalSalary } from "@/hooks/use-teacher-salary";
import { Skeleton } from "@/components/ui/skeleton";

/* ─────────────────────── helpers ─────────────────────── */

const WEEKDAY_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const DOW_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

function formatMoney(n: number) {
  return n.toLocaleString("vi-VN") + "đ";
}

function formatMoneyShort(n: number) {
  if (n === 0) return "0đ";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}tr`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${n}đ`;
}

/* ─────────────────────── Attendance types ─────────────── */

type AttendanceDay = {
  workDate: string;
  timeIn: string | null;
  timeOut: string | null;
  tongCong: number;
  workedHours: number;
};

type HrSummary = {
  sheetId: string;
  sheetName: string;
  sheetMonth: string;
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
};

/* ─────────────────────── AttStatus helpers ─────────────── */

type AttStatus = "ok" | "late" | "overtime" | "half";

function getAttStatus(tongCong: number, workedHours: number): AttStatus | null {
  if (tongCong <= 0) return null;
  if (tongCong >= 1) {
    if (workedHours > 0 && tongCong > 1.01) return "overtime";
    return "ok";
  }
  if (tongCong >= 0.5) return "half";
  return "late";
}

const STATUS_CONFIG: Record<AttStatus, {
  label: string;
  badgeClass: string;
  dotClass: string;
  bgClass: string;
  textClass: string;
  icon: any;
}> = {
  ok: {
    label: "Đủ công",
    badgeClass: "bg-emerald-500",
    dotClass: "bg-emerald-400",
    bgClass: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800",
    textClass: "text-emerald-700 dark:text-emerald-400",
    icon: CheckCircle2,
  },
  overtime: {
    label: "Tăng ca",
    badgeClass: "bg-violet-500",
    dotClass: "bg-violet-400",
    bgClass: "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800",
    textClass: "text-violet-700 dark:text-violet-400",
    icon: Zap,
  },
  half: {
    label: "Nửa công",
    badgeClass: "bg-amber-500",
    dotClass: "bg-amber-400",
    bgClass: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
    textClass: "text-amber-700 dark:text-amber-400",
    icon: Clock,
  },
  late: {
    label: "Thiếu giờ",
    badgeClass: "bg-rose-500",
    dotClass: "bg-rose-400",
    bgClass: "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800",
    textClass: "text-rose-600 dark:text-rose-400",
    icon: AlertCircle,
  },
};

/* ─────────────────────── Calendar Day ─────────────────── */

function CalendarDay({
  day, att, isToday, isWeekend,
}: {
  day: number;
  att: AttendanceDay | null;
  isToday: boolean;
  isWeekend: boolean;
}) {
  const status = att ? getAttStatus(att.tongCong, att.workedHours) : null;
  const cfg = status ? STATUS_CONFIG[status] : null;

  return (
    <div className={cn(
      "min-h-[90px] p-1.5 border-b border-r border-border/60 relative transition-colors",
      isWeekend && "bg-slate-50/60 dark:bg-slate-900/20",
      isToday && "bg-blue-50/70 dark:bg-blue-950/20",
      att && cfg && cn("", cfg.bgClass, "border-b border-r"),
    )}>
      {/* Day number */}
      <span className={cn(
        "inline-flex items-center justify-center w-6 h-6 text-xs font-semibold rounded-full leading-none",
        isToday
          ? "bg-primary text-white shadow-sm"
          : isWeekend
          ? "text-amber-600 dark:text-amber-400"
          : "text-foreground",
      )}>
        {day}
      </span>

      {/* Attendance info */}
      {att && cfg && att.tongCong > 0 && (
        <div className="mt-1 space-y-0.5">
          {/* Số công badge */}
          <div className={cn(
            "flex items-center justify-center gap-0.5 rounded-md py-0.5 px-1",
            cfg.badgeClass,
          )}>
            <span className="text-[13px] font-bold leading-none text-white">
              {att.tongCong % 1 === 0 ? att.tongCong.toFixed(0) : att.tongCong.toFixed(1)}
            </span>
            <span className="text-[9px] font-medium text-white/90">công</span>
          </div>
          {/* Time range */}
          {att.timeIn && att.timeOut && (
            <p className={cn("text-[9px] text-center leading-none", cfg.textClass)}>
              {att.timeIn.slice(0, 5)}–{att.timeOut.slice(0, 5)}
            </p>
          )}
          {/* Status label */}
          <div className={cn("flex items-center justify-center gap-0.5", cfg.textClass)}>
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dotClass)} />
            <span className="text-[9px] font-medium">{cfg.label}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── Salary Card ─────────────────── */

function SalaryCard({
  label, value, unit = "đ", accent = false, deduct = false, highlight = false,
}: {
  label: string;
  value: number;
  unit?: string;
  accent?: boolean;
  deduct?: boolean;
  highlight?: boolean;
}) {
  const display = unit === "đ"
    ? value === 0 ? "—" : formatMoney(value)
    : value === 0 ? "—" : String(value);

  return (
    <div className={cn(
      "flex items-center justify-between py-1",
      highlight && "py-1.5",
    )}>
      <span className={cn(
        "text-xs",
        highlight ? "font-semibold text-foreground" : "text-muted-foreground",
      )}>
        {label}
      </span>
      <span className={cn(
        "text-xs font-semibold tabular-nums",
        highlight && "text-sm font-bold",
        value === 0 ? "text-muted-foreground/50" : deduct ? "text-rose-500" : accent ? "text-primary" : "text-foreground",
      )}>
        {deduct && value > 0 ? `− ${formatMoney(value)}` : display}
      </span>
    </div>
  );
}

/* ─────────────────────── Attendance Stats ─────────────── */

function AttendanceStats({ rows }: { rows: AttendanceDay[] }) {
  const total = rows.reduce((s, r) => s + r.tongCong, 0);
  const days = rows.length;
  const overtime = rows.filter(r => getAttStatus(r.tongCong, r.workedHours) === "overtime").length;
  const late = rows.filter(r => {
    const s = getAttStatus(r.tongCong, r.workedHours);
    return s === "late" || s === "half";
  }).length;

  const stats = [
    { label: "Tổng công", value: total % 1 === 0 ? total.toFixed(0) : total.toFixed(2), unit: "công", color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800", icon: BadgeCheck },
    { label: "Ngày làm", value: String(days), unit: "ngày", color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800", icon: CalendarDays },
    { label: "Tăng ca", value: String(overtime), unit: "ngày", color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800", icon: Zap },
    { label: "Thiếu giờ", value: String(late), unit: "ngày", color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800", icon: Clock },
  ];

  return (
    <div className="grid grid-cols-4 gap-2.5 mb-4">
      {stats.map(({ label, value, unit, color, bg, icon: Icon }) => (
        <div key={label} className={cn("rounded-xl border p-3 flex flex-col gap-1", bg)}>
          <div className="flex items-center gap-1.5">
            <Icon className={cn("w-3.5 h-3.5 shrink-0", color)} />
            <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
          </div>
          <div className="flex items-end gap-1">
            <span className={cn("text-xl font-bold leading-none", color)}>{value}</span>
            <span className={cn("text-[10px] pb-0.5", color)}>{unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────── Payroll Calendar ─────────────── */

function PayrollCalendar({ year, month }: { year: number; month: number }) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDow = getFirstDayOfWeek(year, month);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const monthParam = String(month + 1);
  const yearParam = String(year);

  const { data: attendanceRows = [], isLoading: attLoading } = useQuery<AttendanceDay[]>({
    queryKey: ["/api/my-space/payroll/attendance", monthParam, yearParam],
    queryFn: async () => {
      const r = await fetch(`/api/my-space/payroll/attendance?month=${monthParam}&year=${yearParam}`, {
        credentials: "include",
      });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: hrSummary, isLoading: hrLoading } = useQuery<HrSummary | null>({
    queryKey: ["/api/my-space/payroll/hr-summary", monthParam, yearParam],
    queryFn: async () => {
      const r = await fetch(`/api/my-space/payroll/hr-summary?month=${monthParam}&year=${yearParam}`, {
        credentials: "include",
      });
      if (!r.ok) return null;
      const d = await r.json();
      return d;
    },
  });

  const attMap = useMemo(() => {
    const m: Record<string, AttendanceDay> = {};
    for (const row of attendanceRows) {
      const d = row.workDate.slice(8, 10);
      m[String(parseInt(d, 10))] = row;
    }
    return m;
  }, [attendanceRows]);

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const hasHr = !!hrSummary;
  const thucNhan = hrSummary?.thucNhan ?? 0;
  const tongLuong = hrSummary?.tongLuong ?? 0;

  const isLoading = attLoading || hrLoading;

  return (
    <div className="space-y-4">
      {/* Attendance stats */}
      {isLoading ? (
        <div className="grid grid-cols-4 gap-2.5 mb-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : (
        <AttendanceStats rows={attendanceRows} />
      )}

      <div className="flex gap-4">
        {/* Calendar grid */}
        <div className="flex-1 min-w-0 rounded-xl border border-border/70 overflow-hidden shadow-sm">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-border/60 bg-gradient-to-b from-muted/50 to-muted/20">
            {WEEKDAY_SHORT.map((d, i) => (
              <div key={d} className={cn(
                "text-center py-2.5 text-xs font-bold tracking-wide",
                i >= 5 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
              )}>
                {d}
              </div>
            ))}
          </div>

          {/* Calendar weeks */}
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
            </div>
          ) : (
            weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7">
                {week.map((day, di) => {
                  if (day === null) {
                    return <div key={di} className="min-h-[90px] border-b border-r border-border/60 bg-muted/5" />;
                  }
                  const isToday = isCurrentMonth && day === today.getDate();
                  const isWeekend = di >= 5;
                  const att = attMap[String(day)] ?? null;
                  return (
                    <CalendarDay key={di} day={day} att={att} isToday={isToday} isWeekend={isWeekend} />
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Salary detail panel */}
        <div className="w-[268px] shrink-0 self-start space-y-3">
          {/* Header card */}
          <div className={cn(
            "rounded-xl border overflow-hidden shadow-sm",
            hasHr
              ? "border-emerald-200 dark:border-emerald-800"
              : "border-border",
          )}>
            <div className={cn(
              "px-4 py-3 border-b flex items-center gap-2",
              hasHr
                ? "bg-gradient-to-r from-emerald-500 to-teal-500 border-emerald-600"
                : "bg-gradient-to-r from-muted/60 to-muted/30 border-border",
            )}>
              <Wallet className={cn("w-4 h-4 shrink-0", hasHr ? "text-white" : "text-muted-foreground")} />
              <div>
                <h3 className={cn("text-sm font-bold", hasHr ? "text-white" : "text-foreground")}>
                  Bảng tổng lương
                </h3>
                {hrSummary?.sheetName && (
                  <p className="text-[10px] text-emerald-100 truncate">{hrSummary.sheetName}</p>
                )}
              </div>
            </div>

            {isLoading ? (
              <div className="p-4 space-y-2">
                {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            ) : hasHr ? (
              <div className="p-4 space-y-0.5">
                {/* Thu nhập */}
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Thu nhập</p>
                <SalaryCard label="Lương cơ bản" value={hrSummary!.luongCB} />
                <SalaryCard label="Số công" value={hrSummary!.soCong} unit="" />
                <SalaryCard label="Công thức" value={hrSummary!.congThuc} unit="" />
                <SalaryCard label="Lương theo công" value={hrSummary!.luongTheoCong} />
                <SalaryCard label="Phụ cấp" value={hrSummary!.phuCap} />
                <SalaryCard label="Thưởng" value={hrSummary!.thuong} />
                <SalaryCard label="Phạt" value={hrSummary!.phat} deduct />
                {hrSummary!.luongDungLop > 0 && (
                  <SalaryCard label="Lương đứng lớp" value={hrSummary!.luongDungLop} />
                )}

                {/* Tổng lương */}
                <div className="border-t border-border/50 pt-2 mt-2">
                  <SalaryCard label="TỔNG LƯƠNG" value={tongLuong} accent highlight />
                </div>

                {/* Khấu trừ — luôn hiển thị đủ các mục */}
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 mt-3">Khấu trừ</p>
                <SalaryCard label="BHXH" value={hrSummary!.bhxh} deduct />
                <SalaryCard label="BHYT" value={hrSummary!.bhyt} deduct />
                <SalaryCard label="BHTN" value={hrSummary!.bhtn} deduct />
                <SalaryCard label="Thuế TNCN" value={hrSummary!.thueTNCN} deduct />
                <SalaryCard label="Tạm ứng" value={hrSummary!.tamUng} deduct />

                {/* Thực nhận */}
                <div className={cn(
                  "border-t border-border/50 pt-2 mt-2 rounded-lg px-3 py-2.5 -mx-1",
                  thucNhan > 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-muted/20",
                )}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">THỰC NHẬN</span>
                    <span className={cn(
                      "text-base font-extrabold tabular-nums",
                      thucNhan > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                    )}>
                      {formatMoney(thucNhan)}
                    </span>
                  </div>
                  {hrSummary!.daChi && (
                    <div className="flex items-center gap-1 mt-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      <span className="text-[10px] text-emerald-600 font-medium">Đã chi trả</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4">
                <div className="flex flex-col items-center gap-2.5 py-4">
                  <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Lock className="w-4.5 h-4.5 text-amber-500" />
                  </div>
                  <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
                    Bảng lương tháng này chưa được công bố hoặc chưa có dữ liệu.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Quick legend */}
          <div className="rounded-xl border border-border/60 p-3 bg-muted/10">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Chú thích</p>
            <div className="space-y-1.5">
              {(Object.entries(STATUS_CONFIG) as [AttStatus, typeof STATUS_CONFIG[AttStatus]][]).map(([key, cfg]) => {
                const Icon = cfg.icon;
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", cfg.badgeClass)} />
                    <span className="text-[10px] text-muted-foreground">{cfg.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── Tab 2: Bảng đứng lớp ────────── */

type SessionInfo = {
  sessionDate: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  attendedCount: number;
  isEligible: boolean;
};

type PublishedPayrollRow = {
  salaryTableId: string;
  salaryTableName: string;
  startDate: string;
  endDate: string;
  locationName: string | null;
  classId: string;
  className: string;
  role: string;
  packageId: string | null;
  sessions: SessionInfo[];
  sessionDates: string[];
};

function computeTongSoTeacher(
  sessions: SessionInfo[],
  pkg: any | null | undefined
): { value: string; subtext?: string } {
  const total = sessions.length;

  const attendedSessions = sessions.filter(
    (s) => (s as any).attendanceCoefficient !== null && (s as any).attendanceCoefficient !== undefined
  );
  const eligibleSessions = sessions.filter(
    (s) => ((s as any).attendanceCoefficient === null || (s as any).attendanceCoefficient === undefined) && s.isEligible
  );
  const countedSessions = [...attendedSessions, ...eligibleSessions];

  if (!pkg) {
    if (total === 0) return { value: "—" };
    const uncounted = total - countedSessions.length;
    if (uncounted === 0) return { value: "—" };
    return { value: `${uncounted} chưa điểm danh` };
  }

  switch (pkg.type) {
    case "theo-gio":
    case "tong-so-gio": {
      const h = sessions.reduce((sum, s) => {
        const coeff = (s as any).attendanceCoefficient;
        if (coeff !== null && coeff !== undefined) return sum + s.durationHours * coeff;
        return s.isEligible ? sum + s.durationHours : sum;
      }, 0);
      const display = Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
      const uncounted = total - countedSessions.length;
      return {
        value: display,
        subtext: uncounted > 0 ? `${uncounted} chưa điểm danh` : undefined,
      };
    }
    case "theo-buoi":
    case "tong-so-buoi": {
      const sessionCount = sessions.reduce((sum, s) => {
        const coeff = (s as any).attendanceCoefficient;
        if (coeff !== null && coeff !== undefined) return coeff > 0 ? sum + 1 : sum;
        return s.isEligible ? sum + 1 : sum;
      }, 0);
      const uncounted = total - countedSessions.length;
      return {
        value: `${sessionCount} buổi`,
        subtext: uncounted > 0 ? `${uncounted} chưa điểm danh` : undefined,
      };
    }
    case "theo-so-hv": {
      const hv = countedSessions.reduce((sum, s) => sum + s.attendedCount, 0);
      const uncounted = total - countedSessions.length;
      return {
        value: `${hv} hv`,
        subtext: uncounted > 0 ? `${uncounted} chưa điểm danh` : undefined,
      };
    }
    default:
      return { value: total > 0 ? `${total} buổi` : "—" };
  }
}

const COL_CLASS = 130;
const COL_PKG = 120;
const COL_ROLE = 90;
const COL_TONG_SO = 90;
const COL_TONG_LUONG = 110;
const DATE_COL = 76;

function SalaryTableGrid({
  meta,
  rows,
  packageMap,
}: {
  meta: PublishedPayrollRow;
  rows: PublishedPayrollRow[];
  packageMap: Map<string, any>;
}) {
  const dateRange = useMemo(() => {
    try {
      const start = meta.startDate ? parseISO(meta.startDate) : null;
      const end = meta.endDate ? parseISO(meta.endDate) : null;
      if (!start || !end || !isValid(start) || !isValid(end)) return [];
      return eachDayOfInterval({ start, end });
    } catch {
      return [];
    }
  }, [meta.startDate, meta.endDate]);

  const grandTotal = rows.reduce((sum, row) => {
    if (!row.packageId) return sum;
    const pkg = packageMap.get(row.packageId);
    if (!pkg) return sum;
    return sum + calculateTotalSalary(row as any, pkg);
  }, 0);

  const displayStart = meta.startDate
    ? new Date(meta.startDate).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "";
  const displayEnd = meta.endDate
    ? new Date(meta.endDate).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "";

  const numDateCols = dateRange.length > 0 ? dateRange.length : 8;

  return (
    <>
      {/* Group info header — scrolls with content, not sticky */}
      <div className="px-4 py-2.5 bg-muted/40 border-b border-border flex items-center gap-2 shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{meta.salaryTableName}</p>
          <p className="text-[11px] text-muted-foreground">
            {meta.locationName && <span className="mr-2">{meta.locationName}</span>}
            {displayStart} – {displayEnd}
          </p>
        </div>
        {grandTotal > 0 && (
          <div className="ml-auto flex items-center gap-1.5 bg-emerald-500 text-white rounded-full px-3 py-0.5">
            <TrendingUp className="w-3 h-3" />
            <span className="text-xs font-bold">{formatMoneyShort(grandTotal)}</span>
          </div>
        )}
      </div>

      {/* Table — no overflow wrapper; parent scroll container handles both axes */}
      <table
          className="text-sm"
          style={{
            minWidth: `${COL_CLASS + COL_PKG + COL_ROLE + numDateCols * DATE_COL + COL_TONG_SO + COL_TONG_LUONG}px`,
            borderCollapse: "separate",
            borderSpacing: 0,
          }}
        >
          <thead className="sticky top-0 z-20">
            <tr className="bg-muted/40" style={{ boxShadow: "0 1px 0 0 hsl(var(--border))" }}>
              <th
                className="sticky left-0 z-30 text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap bg-white dark:bg-gray-950"
                style={{ width: COL_CLASS, minWidth: COL_CLASS, boxShadow: "1px 0 0 0 hsl(var(--border))" }}
              >
                Tên lớp
              </th>
              <th
                className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap"
                style={{ width: COL_PKG, minWidth: COL_PKG, boxShadow: "1px 0 0 0 hsl(var(--border))" }}
              >
                Gói lương
              </th>
              <th
                className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap"
                style={{ width: COL_ROLE, minWidth: COL_ROLE, boxShadow: "1px 0 0 0 hsl(var(--border))" }}
              >
                Vai trò
              </th>

              {dateRange.length > 0
                ? dateRange.map((date) => {
                    const dow = getDay(date);
                    const label = DOW_LABELS[dow];
                    const dayStr = format(date, "dd/MM");
                    const isWeekend = dow === 0 || dow === 6;
                    return (
                      <th
                        key={date.toISOString()}
                        className={cn(
                          "px-0 py-2 text-center text-xs font-semibold whitespace-nowrap border-l border-border",
                          isWeekend ? "text-red-500" : "text-muted-foreground"
                        )}
                        style={{ width: DATE_COL, minWidth: DATE_COL }}
                      >
                        <div className="text-[10px] font-semibold">{label} {dayStr}</div>
                      </th>
                    );
                  })
                : Array.from({ length: 8 }).map((_, i) => (
                    <th
                      key={i}
                      className="px-0 py-2 text-center text-xs font-semibold whitespace-nowrap border-l border-border text-muted-foreground"
                      style={{ width: DATE_COL, minWidth: DATE_COL }}
                    >
                      <div className="text-[10px]">--/--</div>
                    </th>
                  ))}

              <th
                className="sticky right-[110px] z-30 text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap bg-white dark:bg-gray-950"
                style={{ width: COL_TONG_SO, minWidth: COL_TONG_SO, boxShadow: "-1px 0 0 0 hsl(var(--border))" }}
              >
                Tổng số
              </th>
              <th
                className="sticky right-0 z-30 text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap bg-white dark:bg-gray-950"
                style={{ width: COL_TONG_LUONG, minWidth: COL_TONG_LUONG, boxShadow: "-1px 0 0 0 hsl(var(--border))" }}
              >
                Tổng lương
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const pkg = row.packageId ? packageMap.get(row.packageId) : null;
              const totalSalary = pkg ? calculateTotalSalary(row as any, pkg) : null;
              const tongSo = computeTongSoTeacher(row.sessions, pkg);
              const isUnassigned = !row.packageId;

              return (
                <tr key={row.classId} className="hover:bg-muted/10 transition-colors bg-background">
                  <td
                    className="sticky left-0 z-10 px-3 py-2.5 border-b border-border bg-white dark:bg-gray-950 whitespace-nowrap"
                    style={{ boxShadow: "1px 0 0 0 hsl(var(--border))" }}
                  >
                    <div className="flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium text-foreground text-xs">{row.className}</span>
                    </div>
                  </td>

                  <td
                    className="px-3 py-2.5 border-b border-border whitespace-nowrap text-xs"
                    style={{ boxShadow: "1px 0 0 0 hsl(var(--border))" }}
                  >
                    {pkg
                      ? <span className="text-foreground">{pkg.name}</span>
                      : <span className="text-amber-500 italic text-[11px]">Chưa gắn</span>}
                  </td>

                  <td
                    className="px-3 py-2.5 border-b border-border whitespace-nowrap"
                    style={{ boxShadow: "1px 0 0 0 hsl(var(--border))" }}
                  >
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                      {row.role}
                    </span>
                  </td>

                  {dateRange.length > 0
                    ? dateRange.map((date) => {
                        const dateStr = format(date, "yyyy-MM-dd");
                        const session = row.sessions.find(
                          (s) => s.sessionDate.slice(0, 10) === dateStr
                        ) ?? null;

                        if (!session) {
                          return (
                            <td
                              key={date.toISOString()}
                              className="border-l border-b border-border p-0"
                              style={{ height: 44, width: DATE_COL }}
                            />
                          );
                        }

                        const dh = session.durationHours;
                        const durationLabel = Number.isInteger(dh)
                          ? `${dh}h`
                          : `${dh.toFixed(1)}h`;

                        const hasTeacherAttendance =
                          (session as any).attendanceCoefficient !== null &&
                          (session as any).attendanceCoefficient !== undefined;
                        const isCounted = hasTeacherAttendance || session.isEligible;

                        return (
                          <td
                            key={date.toISOString()}
                            className={cn(
                              "border-l border-b border-border p-0",
                              isCounted
                                ? pkg
                                  ? "bg-emerald-50 dark:bg-emerald-900/20"
                                  : "bg-purple-50 dark:bg-purple-900/20"
                                : "bg-orange-50 dark:bg-orange-900/20"
                            )}
                            style={{ height: 44, width: DATE_COL }}
                          >
                            {isCounted ? (
                              <div className="flex flex-col items-center justify-center h-full gap-0.5">
                                <span className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
                                  {session.startTime} – {session.endTime}
                                </span>
                                <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 leading-tight">
                                  {hasTeacherAttendance
                                    ? `×${(session as any).attendanceCoefficient}`
                                    : durationLabel}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center h-full">
                                <span className="text-[10px] text-orange-400">—</span>
                              </div>
                            )}
                          </td>
                        );
                      })
                    : Array.from({ length: 8 }).map((_, i) => (
                        <td
                          key={i}
                          className="border-l border-b border-border p-0"
                          style={{ height: 44, width: DATE_COL }}
                        />
                      ))}

                  <td
                    className="sticky right-[110px] z-10 border-l border-b border-border px-3 py-2.5 text-center whitespace-nowrap text-xs bg-white dark:bg-gray-950"
                    style={{ boxShadow: "-1px 0 0 0 hsl(var(--border))" }}
                  >
                    {tongSo.value === "—" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div>
                        <span className={cn("font-medium", isUnassigned ? "text-[11px] text-orange-500" : "text-foreground")}>
                          {tongSo.value}
                        </span>
                        {tongSo.subtext && (
                          <div className="text-[10px] text-orange-500">{tongSo.subtext}</div>
                        )}
                      </div>
                    )}
                  </td>

                  <td
                    className="sticky right-0 z-10 border-l border-b border-border px-3 py-2.5 text-center whitespace-nowrap text-xs bg-white dark:bg-gray-950"
                    style={{ boxShadow: "-1px 0 0 0 hsl(var(--border))" }}
                  >
                    {totalSalary !== null && totalSalary > 0 ? (
                      <span className="font-semibold text-emerald-600">{formatMoney(totalSalary)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}

            <tr className="bg-gray-50 dark:bg-gray-900 font-semibold">
              <td
                colSpan={3 + numDateCols}
                className="sticky left-0 px-4 py-2.5 text-xs text-right text-foreground border-t border-border bg-gray-50 dark:bg-gray-900"
              >
                Tổng cộng
              </td>
              <td
                className="sticky right-[110px] z-10 border-l border-t border-border px-3 py-2.5 text-center text-xs bg-gray-50 dark:bg-gray-900"
                style={{ boxShadow: "-1px 0 0 0 hsl(var(--border))" }}
              />
              <td
                className="sticky right-0 z-10 border-l border-t border-border px-3 py-2.5 text-center text-sm font-bold text-emerald-600 bg-gray-50 dark:bg-gray-900"
                style={{ boxShadow: "-1px 0 0 0 hsl(var(--border))" }}
              >
                {formatMoney(grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
    </>
  );
}

function SalaryDungLop() {
  const { data: publishedRows = [], isLoading, isError } = useQuery<PublishedPayrollRow[]>({
    queryKey: ["/api/my-space/payroll/published-rows"],
  });

  const { data: packages = [] } = useQuery<any[]>({
    queryKey: ["/api/teacher-salary-packages"],
    enabled: publishedRows.length > 0,
  });

  const packageMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of packages) m.set(p.id, p);
    return m;
  }, [packages]);

  const grouped = useMemo(() => {
    const g = new Map<string, { meta: PublishedPayrollRow; rows: PublishedPayrollRow[] }>();
    for (const row of publishedRows) {
      if (!g.has(row.salaryTableId)) {
        g.set(row.salaryTableId, { meta: row, rows: [] });
      }
      g.get(row.salaryTableId)!.rows.push(row);
    }
    return Array.from(g.values());
  }, [publishedRows]);

  if (isLoading) {
    return (
      <div className="space-y-3 py-6">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-sm text-muted-foreground">Lỗi khi tải bảng lương. Vui lòng thử lại.</p>
      </div>
    );
  }

  if (publishedRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <Lock className="w-6 h-6 text-amber-500" />
        </div>
        <div className="text-center max-w-sm">
          <p className="text-sm font-semibold text-foreground mb-1">Bảng lương chưa được công bố</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Bộ phận kế toán chưa công bố bảng lương đứng lớp cho tháng này. Vui lòng quay lại sau.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(({ meta, rows }) => (
        <SalaryTableGrid
          key={meta.salaryTableId}
          meta={meta}
          rows={rows}
          packageMap={packageMap}
        />
      ))}
    </div>
  );
}

/* ─────────────────────── Main page ────────────────────── */

type Tab = "tong" | "dung-lop";

export default function MyPayroll() {
  const [tab, setTab] = useState<Tab>("tong");

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());

  const monthLabel = `Tháng ${String(monthIndex + 1).padStart(2, "0")}/${year}`;

  const goPrev = () => {
    if (monthIndex === 0) { setYear(y => y - 1); setMonthIndex(11); }
    else setMonthIndex(m => m - 1);
  };
  const goNext = () => {
    if (monthIndex === 11) { setYear(y => y + 1); setMonthIndex(0); }
    else setMonthIndex(m => m + 1);
  };
  const goToday = () => { setYear(now.getFullYear()); setMonthIndex(now.getMonth()); };

  return (
    <DashboardLayout fullscreen>
      <div className="flex flex-col h-full bg-background">
        {/* Sticky header + tabs */}
        <div className="shrink-0 bg-background border-b border-border">
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
                <Wallet className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground leading-tight">Bảng lương của tôi</h1>
                <p className="text-xs text-muted-foreground">Chấm công & lương tổng hợp</p>
              </div>
            </div>

            {/* Month navigator */}
            <div className="flex items-center gap-1.5 bg-muted/40 rounded-xl p-1 border border-border/60">
              <button
                onClick={goPrev}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-background hover:shadow-sm transition-all"
              >
                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              </button>
              <button
                onClick={goToday}
                className="px-3 h-7 text-xs font-semibold text-foreground hover:bg-background hover:shadow-sm rounded-lg transition-all min-w-[110px] text-center"
              >
                {monthLabel}
              </button>
              <button
                onClick={goNext}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-background hover:shadow-sm transition-all"
              >
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 px-6">
            {([
              { key: "tong", label: "Bảng lương tổng", icon: Wallet },
              { key: "dung-lop", label: "Bảng lương đứng lớp", icon: TableProperties },
            ] as { key: Tab; label: string; icon: any }[]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all",
                  tab === key
                    ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Content area — fills remaining height */}
        <div className="flex-1 overflow-hidden">
          {tab === "tong" && (
            <div className="h-full overflow-auto px-6 py-5">
              <PayrollCalendar year={year} month={monthIndex} />
            </div>
          )}
          {tab === "dung-lop" && (
            <div className="h-full overflow-auto px-6 py-4">
              <SalaryDungLop />
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
