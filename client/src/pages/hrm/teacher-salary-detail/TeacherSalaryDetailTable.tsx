import { useState } from "react";
import { format, getDay } from "date-fns";
import { DollarSign, CheckCircle2, Package, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { TeacherSalaryDetailRow } from "@/hooks/use-teacher-salary";
import { calculateTotalSalary, calculateSessionSalary } from "@/hooks/use-teacher-salary";
import type { TeacherSalaryPackage } from "@/hooks/use-teacher-salary-packages";
import {
  DOW_LABELS,
  COL_CHECKBOX,
  COL_TEACHER,
  COL_CLASS,
  COL_GOI_LUONG,
  LEFT_TEACHER,
  LEFT_CLASS,
  LEFT_GOI_LUONG,
  COL_CHI,
  COL_TONG_LUONG,
  COL_TONG_SO,
  RIGHT_CHI,
  RIGHT_TONG_LUONG,
  RIGHT_TONG_SO,
} from "./types";

type TableRow = TeacherSalaryDetailRow & { rowKey: string };

type Props = {
  rows: TableRow[];
  dateRange: Date[];
  selectedRows: string[];
  rowPackages: Record<string, string>;
  sessionPackages: Record<string, string>;
  packageMap: Map<string, TeacherSalaryPackage>;
  rowPaidAmounts: Record<string, number>;
  publishedRows: Set<string>;
  isLoading: boolean;
  onToggleRow: (key: string) => void;
  onToggleAll: () => void;
  onSetPackage: (key: string, value: string) => void;
  onSetSessionPackage: (teacherId: string, sessionId: string, packageId: string | null) => void;
  onPayRow?: (row: TableRow, totalSalary: number) => void;
};

const TH_STICKY_LEFT = "bg-slate-100 dark:bg-slate-900";
const TH_STICKY_RIGHT = "bg-slate-100 dark:bg-slate-900";

function formatAmount(amount: number): string {
  if (amount === 0) return "0";
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}tr`;
  if (amount >= 1_000) return `${Math.round(amount / 1_000)}k`;
  return String(amount);
}

function formatVND(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(amount)) + " đ";
}

function isoToTimeStr(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.substring(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function computeTongSo(
  row: TableRow,
  pkg: TeacherSalaryPackage | null | undefined
): { value: string; subtext?: string } {
  const sessions = row.sessions ?? [];
  const totalSessions = sessions.length;

  const attendedSessions = sessions.filter((s) => s.attendanceCoefficient !== null && s.attendanceCoefficient !== undefined);
  const eligibleSessions = sessions.filter((s) => (s.attendanceCoefficient === null || s.attendanceCoefficient === undefined) && s.isEligible);
  const countedSessions = [...attendedSessions, ...eligibleSessions];

  if (!pkg) {
    if (totalSessions === 0) return { value: "—" };
    const uncounted = totalSessions - countedSessions.length;
    if (uncounted === 0) return { value: "—" };
    return { value: `${uncounted} chưa điểm danh` };
  }

  switch (pkg.type) {
    case "theo-gio":
    case "tong-so-gio": {
      const totalHours = sessions.reduce((sum, s) => {
        const coeff = s.attendanceCoefficient;
        if (coeff !== null && coeff !== undefined) return sum + s.durationHours * coeff;
        return s.isEligible ? sum + s.durationHours : sum;
      }, 0);
      const display = Number.isInteger(totalHours)
        ? `${totalHours}h`
        : `${totalHours.toFixed(1)}h`;
      const uncounted = totalSessions - countedSessions.length;
      return {
        value: display,
        subtext: uncounted > 0 ? `${uncounted} chưa ĐD` : undefined,
      };
    }
    case "theo-buoi":
    case "tong-so-buoi": {
      const sessionCount = sessions.reduce((sum, s) => {
        const coeff = s.attendanceCoefficient;
        if (coeff !== null && coeff !== undefined) return coeff > 0 ? sum + 1 : sum;
        return s.isEligible ? sum + 1 : sum;
      }, 0);
      const uncounted = totalSessions - countedSessions.length;
      return {
        value: `${sessionCount} buổi`,
        subtext: uncounted > 0 ? `${uncounted} chưa ĐD` : undefined,
      };
    }
    case "theo-so-hv": {
      const totalHV = countedSessions.reduce((sum, s) => sum + s.attendedCount, 0);
      const uncounted = totalSessions - countedSessions.length;
      return {
        value: `${totalHV} hv`,
        subtext: uncounted > 0 ? `${uncounted} chưa ĐD` : undefined,
      };
    }
    default:
      return { value: totalSessions > 0 ? `${totalSessions} buổi` : "—" };
  }
}

export function TeacherSalaryDetailTable({
  rows,
  dateRange,
  selectedRows,
  rowPackages,
  sessionPackages,
  packageMap,
  rowPaidAmounts,
  publishedRows,
  isLoading,
  onToggleRow,
  onToggleAll,
  onSetPackage,
  onSetSessionPackage,
  onPayRow,
}: Props) {
  const [openPopover, setOpenPopover] = useState<string | null>(null);
  const numDateCols = dateRange.length > 0 ? dateRange.length : 8;

  const getSessionForDate = (row: TableRow, date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return row.sessions?.find((s) => s.sessionDate.slice(0, 10) === dateStr) ?? null;
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-6 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <table
        className="text-sm"
        style={{
          minWidth: `${COL_CHECKBOX + COL_TEACHER + COL_CLASS + COL_GOI_LUONG + 110 + numDateCols * 80 + COL_TONG_SO + COL_TONG_LUONG + COL_CHI}px`,
          borderCollapse: "separate",
          borderSpacing: 0,
        }}
      >
        {/* ── THEAD ── */}
        <thead className="sticky top-0 z-20">
          <tr className="bg-slate-100 dark:bg-slate-900" style={{ boxShadow: "0 1px 0 0 #e2e8f0" }}>
            {/* Checkbox */}
            <th
              className={cn("sticky z-30 text-left px-3 py-3", TH_STICKY_LEFT)}
              style={{ left: 0, width: COL_CHECKBOX, minWidth: COL_CHECKBOX, boxShadow: "1px 0 0 0 #e2e8f0" }}
            >
              <Checkbox
                checked={selectedRows.length === rows.length && rows.length > 0}
                onCheckedChange={onToggleAll}
                data-testid="checkbox-select-all"
                className="border-slate-400 data-[state=checked]:bg-indigo-500 data-[state=checked]:border-indigo-500"
              />
            </th>
            {/* Giáo viên */}
            <th
              className={cn("sticky z-30 text-left px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap", TH_STICKY_LEFT)}
              style={{ left: LEFT_TEACHER, width: COL_TEACHER, minWidth: COL_TEACHER, boxShadow: "1px 0 0 0 #e2e8f0" }}
            >
              Giáo viên
            </th>
            {/* Tên lịch */}
            <th
              className={cn("sticky z-30 text-left px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap", TH_STICKY_LEFT)}
              style={{ left: LEFT_CLASS, width: COL_CLASS, minWidth: COL_CLASS, boxShadow: "1px 0 0 0 #e2e8f0" }}
            >
              Tên lịch
            </th>
            {/* Gói lương */}
            <th
              className={cn("sticky z-30 text-left px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap", TH_STICKY_LEFT)}
              style={{ left: LEFT_GOI_LUONG, width: COL_GOI_LUONG, minWidth: COL_GOI_LUONG, boxShadow: "1px 0 0 0 #e2e8f0" }}
            >
              Gói lương
            </th>
            {/* Vai trò */}
            <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap" style={{ minWidth: 110 }}>
              Vai trò
            </th>

            {/* Date columns */}
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
                        "px-0 py-2 text-center text-[10px] font-semibold whitespace-nowrap border-l border-slate-200 dark:border-slate-700",
                        isWeekend ? "text-rose-500" : "text-slate-500 dark:text-slate-400"
                      )}
                      style={{ width: 80, minWidth: 80 }}
                    >
                      <div className="font-bold">{label}</div>
                      <div className="opacity-75">{dayStr}</div>
                    </th>
                  );
                })
              : Array.from({ length: 8 }).map((_, i) => (
                  <th
                    key={i}
                    className="px-0 py-2 text-center text-[10px] font-semibold whitespace-nowrap border-l border-slate-200 dark:border-slate-700 text-slate-400"
                    style={{ width: 80, minWidth: 80 }}
                  >
                    --/--
                  </th>
                ))}

            {/* Tổng số */}
            <th
              className={cn("sticky z-30 text-center px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap", TH_STICKY_RIGHT)}
              style={{ right: RIGHT_TONG_SO, width: COL_TONG_SO, minWidth: COL_TONG_SO, boxShadow: "-1px 0 0 0 #e2e8f0" }}
            >
              Tổng số
            </th>
            {/* Tổng lương */}
            <th
              className={cn("sticky z-30 text-center px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap", TH_STICKY_RIGHT)}
              style={{ right: RIGHT_TONG_LUONG, width: COL_TONG_LUONG, minWidth: COL_TONG_LUONG, boxShadow: "-1px 0 0 0 #e2e8f0" }}
            >
              Tổng lương
            </th>
            {/* Chi lương */}
            <th
              className={cn("sticky z-30 text-center px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap", TH_STICKY_RIGHT)}
              style={{ right: RIGHT_CHI, width: COL_CHI, minWidth: COL_CHI, boxShadow: "-1px 0 0 0 #e2e8f0" }}
            >
              Chi lương
            </th>
          </tr>
        </thead>

        {/* ── TBODY ── */}
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={6 + numDateCols}
                className="h-48 text-center"
              >
                <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                  <Banknote className="h-10 w-10 opacity-30" />
                  <p className="text-sm font-medium">Không có giáo viên nào có lịch dạy</p>
                  <p className="text-xs opacity-60">trong khoảng thời gian này</p>
                </div>
              </td>
            </tr>
          ) : (
            rows.map((row, rowIdx) => {
              const isSelected = selectedRows.includes(row.rowKey);
              const pkgId = rowPackages[row.rowKey] ?? "";
              const pkg = pkgId ? packageMap.get(pkgId) : null;
              const isUnassigned = !pkgId;
              const totalSessions = (row.sessions ?? []).length;

              const totalSalary = (() => {
                if (!pkg) return 0;
                if (pkg.type === "tong-so-gio" || pkg.type === "tong-so-buoi") {
                  return calculateTotalSalary(row, pkg as any);
                }
                return row.sessions.reduce((sum, s) => {
                  const sessKey = `${row.teacherId}::${s.sessionId}`;
                  const overridePkgId = sessionPackages[sessKey];
                  const effectivePkg = overridePkgId ? packageMap.get(overridePkgId) : (pkg as any);
                  if (!effectivePkg) return sum;
                  return sum + (calculateSessionSalary(s, effectivePkg) ?? 0);
                }, 0);
              })();
              const tongSo = computeTongSo(row, pkg);
              const paidAmount = rowPaidAmounts[row.rowKey] ?? 0;
              const isFullyPaid = totalSalary > 0 && paidAmount >= totalSalary;
              const isPartiallyPaid = paidAmount > 0 && paidAmount < totalSalary;

              const isEvenRow = rowIdx % 2 === 0;
              const rowBase = isSelected
                ? "bg-indigo-50 dark:bg-indigo-950/30"
                : isEvenRow
                  ? "bg-white dark:bg-gray-950"
                  : "bg-slate-50/60 dark:bg-gray-900/40";
              const rowHover = isSelected ? "" : "hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20";
              const stickyBg = isSelected
                ? "bg-indigo-50 dark:bg-indigo-950/30"
                : isEvenRow
                  ? "bg-white dark:bg-gray-950"
                  : "bg-slate-50 dark:bg-gray-900";

              return (
                <tr
                  key={row.rowKey}
                  className={cn("transition-colors group", rowBase, rowHover)}
                  data-testid={`row-teacher-${row.rowKey}`}
                >
                  {/* Checkbox */}
                  <td
                    className={cn("sticky z-10 px-3 py-2.5 border-b border-slate-100 dark:border-gray-800", stickyBg)}
                    style={{ left: 0, width: COL_CHECKBOX, boxShadow: "1px 0 0 0 #e2e8f0" }}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleRow(row.rowKey)}
                      data-testid={`checkbox-row-${row.rowKey}`}
                      className="data-[state=checked]:bg-indigo-500 data-[state=checked]:border-indigo-500"
                    />
                  </td>

                  {/* Giáo viên */}
                  <td
                    className={cn("sticky z-10 px-3 py-2.5 whitespace-nowrap border-b border-slate-100 dark:border-gray-800", stickyBg)}
                    style={{ left: LEFT_TEACHER, width: COL_TEACHER, boxShadow: "1px 0 0 0 #e2e8f0" }}
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="truncate max-w-[115px] font-semibold text-slate-800 dark:text-slate-200 text-xs leading-tight" title={row.teacherName}>
                        {row.teacherName}
                      </div>
                      {publishedRows.has(row.rowKey) && (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" title="Đã công bố" />
                      )}
                    </div>
                    {row.teacherCode && (
                      <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{row.teacherCode}</div>
                    )}
                  </td>

                  {/* Tên lịch */}
                  <td
                    className={cn("sticky z-10 px-3 py-2.5 whitespace-nowrap border-b border-slate-100 dark:border-gray-800", stickyBg)}
                    style={{ left: LEFT_CLASS, width: COL_CLASS, boxShadow: "1px 0 0 0 #e2e8f0" }}
                  >
                    <div className="truncate max-w-[110px] text-xs text-slate-700 dark:text-slate-300 font-medium" title={row.className}>
                      {row.className}
                    </div>
                  </td>

                  {/* Gói lương */}
                  <td
                    className={cn("sticky z-10 px-2 py-1.5 whitespace-nowrap border-b border-slate-100 dark:border-gray-800", stickyBg)}
                    style={{ left: LEFT_GOI_LUONG, width: COL_GOI_LUONG, boxShadow: "1px 0 0 0 #e2e8f0" }}
                  >
                    <Select
                      value={pkgId || "none"}
                      onValueChange={(val) => onSetPackage(row.rowKey, val)}
                    >
                      <SelectTrigger
                        className={cn(
                          "h-7 w-full text-[11px] border rounded-md px-2 transition-colors",
                          isUnassigned
                            ? "text-orange-500 italic border-orange-200 bg-orange-50/50 dark:border-orange-800 dark:bg-orange-950/20 border-dashed"
                            : "text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-900"
                        )}
                        data-testid={`select-package-${row.rowKey}`}
                      >
                        <SelectValue placeholder="Chưa gắn" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          <span className="text-muted-foreground italic">Chưa gắn</span>
                        </SelectItem>
                        {Array.from(packageMap.values()).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>

                  {/* Vai trò */}
                  <td className="px-3 py-2.5 whitespace-nowrap border-b border-slate-100 dark:border-gray-800">
                    <Badge
                      variant="outline"
                      className="text-[10px] font-medium px-2 py-0.5 border-indigo-200 text-indigo-700 bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:bg-indigo-950/30"
                    >
                      {row.role}
                    </Badge>
                  </td>

                  {/* Session cells */}
                  {dateRange.length > 0
                    ? dateRange.map((date) => {
                        const session = getSessionForDate(row, date);
                        if (!session) {
                          return (
                            <td
                              key={date.toISOString()}
                              className="border-l border-b border-slate-100 dark:border-gray-800 p-0"
                              style={{ height: 48, width: 80 }}
                              data-testid={`cell-session-${row.rowKey}-${format(date, "yyyy-MM-dd")}`}
                            />
                          );
                        }

                        const isEligible = session.isEligible;
                        const coeff = session.attendanceCoefficient;
                        const hasAttendance = coeff !== null && coeff !== undefined;
                        const dh = session.durationHours;
                        const durationLabel = Number.isInteger(dh) ? `${dh}h` : `${dh.toFixed(1)}h`;
                        const isCounted = hasAttendance || isEligible;

                        const sessKey = `${row.teacherId}::${session.sessionId}`;
                        const sessionOverridePkgId = sessionPackages[sessKey];
                        const effectivePkg = sessionOverridePkgId
                          ? (packageMap.get(sessionOverridePkgId) ?? pkg)
                          : pkg;
                        const hasOverride = !!sessionOverridePkgId;

                        const popoverKey = `${row.rowKey}::${session.sessionId}`;
                        const isPopoverOpen = openPopover === popoverKey;

                        const checkIn = isoToTimeStr(session.checkInAt);
                        const checkOut = isoToTimeStr(session.checkOutAt);
                        let minuteDiff: number | null = null;
                        if (checkIn && checkOut) {
                          const scheduled = timeToMinutes(session.endTime) - timeToMinutes(session.startTime);
                          const actual = timeToMinutes(checkOut) - timeToMinutes(checkIn);
                          minuteDiff = actual - scheduled;
                        }
                        const sessionSalary = effectivePkg ? calculateSessionSalary(session, effectivePkg as any) : null;

                        // Cell background color scheme
                        const cellBg = hasAttendance
                          ? "bg-blue-100/80 dark:bg-blue-900/30"
                          : isEligible
                            ? effectivePkg
                              ? "bg-emerald-100/70 dark:bg-emerald-900/25"
                              : "bg-violet-100/70 dark:bg-violet-900/25"
                            : "bg-amber-50 dark:bg-amber-900/15";

                        return (
                          <td
                            key={date.toISOString()}
                            className={cn("border-l border-b border-slate-100 dark:border-gray-800 p-0", cellBg)}
                            style={{ height: 48, width: 80 }}
                            data-testid={`cell-session-${row.rowKey}-${format(date, "yyyy-MM-dd")}`}
                          >
                            <Popover
                              open={isPopoverOpen}
                              onOpenChange={(open) => setOpenPopover(open ? popoverKey : null)}
                            >
                              <TooltipProvider>
                                <Tooltip delayDuration={300}>
                                  <TooltipTrigger asChild>
                                    <PopoverTrigger asChild>
                                      {isCounted ? (
                                        <div className={cn(
                                          "flex flex-col items-center justify-center h-full gap-0.5 cursor-pointer select-none relative",
                                          isPopoverOpen && "ring-2 ring-indigo-400 ring-inset rounded-sm"
                                        )}>
                                          {hasOverride && (
                                            <Package className="absolute top-0.5 right-0.5 h-2.5 w-2.5 text-violet-500" />
                                          )}
                                          <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight font-medium">
                                            {session.startTime.substring(0, 5)} – {session.endTime.substring(0, 5)}
                                          </span>
                                          {hasAttendance ? (
                                            <span className={cn(
                                              "text-[12px] font-bold leading-tight",
                                              coeff! < 1 ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400"
                                            )}>
                                              ×{coeff!.toFixed(2)}
                                            </span>
                                          ) : (
                                            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 leading-tight">
                                              {durationLabel}
                                            </span>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-center h-full cursor-pointer select-none">
                                          <span className="text-[11px] text-amber-400 font-medium">—</span>
                                        </div>
                                      )}
                                    </PopoverTrigger>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="top"
                                    className="p-0 w-72 text-xs shadow-xl border border-border bg-white dark:bg-gray-950"
                                  >
                                    <div className="px-3 py-2.5 space-y-1.5">
                                      <div className="font-semibold text-foreground text-[11px] border-b border-border pb-1.5 mb-1.5">
                                        Chi tiết buổi dạy
                                      </div>
                                      <div className="flex justify-between gap-2">
                                        <span className="text-muted-foreground">Ca học</span>
                                        <span className="font-medium text-foreground">
                                          {session.startTime.substring(0, 5)} – {session.endTime.substring(0, 5)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between gap-2">
                                        <span className="text-muted-foreground">Số giờ</span>
                                        <span className="font-medium text-foreground">
                                          {Number.isInteger(session.durationHours)
                                            ? `${session.durationHours}h`
                                            : `${session.durationHours.toFixed(1)}h`}
                                        </span>
                                      </div>
                                      {hasAttendance && (
                                        <div className="flex justify-between gap-2">
                                          <span className="text-muted-foreground">Giờ vào / ra</span>
                                          <span className="font-medium text-foreground">
                                            {checkIn ?? "—"} – {checkOut ?? "—"}
                                            {minuteDiff !== null && minuteDiff !== 0 && (
                                              <span className={cn("ml-1 text-[10px]", minuteDiff < 0 ? "text-red-500" : "text-green-600")}>
                                                ({minuteDiff < 0 ? `Thiếu ${-minuteDiff}p` : `Thêm ${minuteDiff}p`})
                                              </span>
                                            )}
                                          </span>
                                        </div>
                                      )}
                                      <div className="flex justify-between gap-2">
                                        <span className="text-muted-foreground">Hệ số lương</span>
                                        <span className={cn("font-semibold", hasAttendance ? (coeff! < 1 ? "text-amber-500" : "text-blue-600") : "text-muted-foreground")}>
                                          {hasAttendance ? `×${coeff!.toFixed(2)}` : "—"}
                                        </span>
                                      </div>
                                      <div className="flex justify-between gap-2">
                                        <span className="text-muted-foreground">Gói lương</span>
                                        <span className="font-medium text-foreground truncate max-w-[120px]" title={effectivePkg?.name}>
                                          {hasOverride
                                            ? <span className="text-violet-600">{effectivePkg?.name ?? "—"} <span className="text-[9px]">(riêng)</span></span>
                                            : (effectivePkg?.name ?? <span className="italic text-muted-foreground">Chưa gắn</span>)}
                                        </span>
                                      </div>
                                      {sessionSalary !== null && effectivePkg && (
                                        <div className="border-t border-border pt-1.5 mt-1 space-y-1">
                                          {effectivePkg.type === "theo-gio" && (
                                            <div className="text-[10px] text-muted-foreground text-right">
                                              {Number.isInteger(session.durationHours)
                                                ? `${session.durationHours}h`
                                                : `${session.durationHours.toFixed(1)}h`}
                                              {" × "}
                                              {Number(effectivePkg.unitPrice || 0).toLocaleString("vi-VN")}đ/h
                                              {hasAttendance && coeff !== 1 && ` × ${coeff!.toFixed(2)}`}
                                            </div>
                                          )}
                                          {effectivePkg.type === "theo-buoi" && hasAttendance && coeff !== 1 && (
                                            <div className="text-[10px] text-muted-foreground text-right">
                                              {Number(effectivePkg.unitPrice || 0).toLocaleString("vi-VN")}đ/buổi
                                              {` × ${coeff!.toFixed(2)}`}
                                            </div>
                                          )}
                                          <div className="flex justify-between gap-2">
                                            <span className="text-muted-foreground">Thành tiền</span>
                                            <span className="font-bold text-emerald-600">{formatVND(sessionSalary)}</span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              <PopoverContent
                                side="top"
                                align="center"
                                className="w-64 p-0 shadow-xl bg-white dark:bg-gray-950"
                                onOpenAutoFocus={(e) => e.preventDefault()}
                              >
                                <div className="px-4 py-3 space-y-3">
                                  <div className="font-semibold text-sm text-foreground border-b border-border pb-2">
                                    Gói lương buổi dạy
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">
                                      {session.startTime.substring(0, 5)} – {session.endTime.substring(0, 5)}
                                    </span>
                                    <span className="font-medium text-foreground">
                                      {Number.isInteger(session.durationHours)
                                        ? `${session.durationHours}h`
                                        : `${session.durationHours.toFixed(1)}h`}
                                      {hasAttendance && (
                                        <span className={cn("ml-1.5 font-semibold", coeff! < 1 ? "text-amber-500" : "text-blue-600")}>
                                          ×{coeff!.toFixed(2)}
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-foreground">Chọn gói lương</label>
                                    <Select
                                      value={sessionOverridePkgId || pkgId || "none"}
                                      onValueChange={(val) => {
                                        if (val === pkgId || val === "use-row") {
                                          onSetSessionPackage(row.teacherId, session.sessionId, null);
                                        } else {
                                          onSetSessionPackage(row.teacherId, session.sessionId, val === "none" ? null : val);
                                        }
                                      }}
                                    >
                                      <SelectTrigger className="h-8 w-full text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="none">
                                          <span className="text-muted-foreground italic">Chưa gắn</span>
                                        </SelectItem>
                                        {Array.from(packageMap.values()).map((p) => (
                                          <SelectItem key={p.id} value={p.id}>
                                            <span className={p.id === pkgId ? "text-muted-foreground" : ""}>
                                              {p.name}
                                              {p.id === pkgId && " (mặc định)"}
                                            </span>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    {hasOverride && (
                                      <button
                                        className="text-[11px] text-violet-600 hover:underline mt-1"
                                        onClick={() => onSetSessionPackage(row.teacherId, session.sessionId, null)}
                                      >
                                        Xóa override (dùng gói mặc định)
                                      </button>
                                    )}
                                  </div>
                                  {sessionSalary !== null && effectivePkg && (
                                    <div className="pt-2 border-t border-border space-y-1">
                                      {effectivePkg.type === "theo-gio" && (
                                        <div className="text-[11px] text-muted-foreground text-center">
                                          {Number.isInteger(session.durationHours)
                                            ? `${session.durationHours}h`
                                            : `${session.durationHours.toFixed(1)}h`}
                                          {" × "}
                                          {Number(effectivePkg.unitPrice || 0).toLocaleString("vi-VN")}đ/h
                                          {hasAttendance && coeff !== 1 && ` × ${coeff!.toFixed(2)}`}
                                          {" = "}
                                          <span className="font-semibold text-emerald-600">{formatVND(sessionSalary)}</span>
                                        </div>
                                      )}
                                      {effectivePkg.type === "theo-buoi" && (
                                        <div className="text-[11px] text-muted-foreground text-center">
                                          {Number(effectivePkg.unitPrice || 0).toLocaleString("vi-VN")}đ/buổi
                                          {hasAttendance && coeff !== 1 && ` × ${coeff!.toFixed(2)}`}
                                          {" = "}
                                          <span className="font-semibold text-emerald-600">{formatVND(sessionSalary)}</span>
                                        </div>
                                      )}
                                      <div className="flex justify-between items-center text-sm">
                                        <span className="text-muted-foreground text-xs">Thành tiền</span>
                                        <span className="font-bold text-emerald-600">{formatVND(sessionSalary)}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </PopoverContent>
                            </Popover>
                          </td>
                        );
                      })
                    : Array.from({ length: 8 }).map((_, i) => (
                        <td
                          key={i}
                          className="border-l border-b border-slate-100 dark:border-gray-800 p-0"
                          style={{ height: 48, width: 80 }}
                        />
                      ))}

                  {/* Tổng số */}
                  <td
                    className={cn("sticky z-10 border-l border-b border-slate-100 dark:border-gray-800 px-3 py-2.5 text-center whitespace-nowrap", stickyBg)}
                    style={{ right: RIGHT_TONG_SO, width: COL_TONG_SO }}
                  >
                    {tongSo.value === "—" ? (
                      <span className="text-slate-300 dark:text-slate-600 text-sm">—</span>
                    ) : (
                      <div>
                        <span className={cn(
                          "font-semibold text-xs",
                          isUnassigned ? "text-orange-500" : "text-slate-700 dark:text-slate-200"
                        )}>
                          {tongSo.value}
                        </span>
                        {tongSo.subtext && (
                          <div className="text-[9px] text-orange-500 mt-0.5 font-medium">
                            {tongSo.subtext}
                          </div>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Tổng lương */}
                  <td
                    className={cn("sticky z-10 border-l border-b border-slate-100 dark:border-gray-800 px-3 py-2.5 text-center whitespace-nowrap", stickyBg)}
                    style={{ right: RIGHT_TONG_LUONG, width: COL_TONG_LUONG }}
                  >
                    {pkg && totalSalary > 0 ? (
                      <span className="font-bold text-xs text-emerald-700 dark:text-emerald-400">
                        {formatAmount(totalSalary)}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600 text-sm">—</span>
                    )}
                  </td>

                  {/* Chi lương */}
                  <td
                    className={cn("sticky z-10 border-l border-b border-slate-100 dark:border-gray-800 px-2 py-2.5 text-center", stickyBg)}
                    style={{ right: RIGHT_CHI, width: COL_CHI }}
                  >
                    {isFullyPaid ? (
                      <div
                        className="flex flex-col items-center justify-center gap-0.5"
                        data-testid={`status-paid-${row.rowKey}`}
                      >
                        <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="text-[10px] font-semibold">Đã chi</span>
                        </div>
                        <span className="text-[9px] text-emerald-500">{formatAmount(paidAmount)}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-0.5">
                        <Button
                          size="sm"
                          className={cn(
                            "h-7 px-2.5 text-[11px] gap-1 font-semibold border-0 shadow-sm",
                            isPartiallyPaid
                              ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-400"
                              : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400"
                          )}
                          disabled={isUnassigned || totalSessions === 0 || totalSalary <= 0}
                          onClick={() => onPayRow?.(row, totalSalary)}
                          data-testid={`button-pay-${row.rowKey}`}
                        >
                          <DollarSign className="h-3 w-3" />
                          {isPartiallyPaid ? "Chi thêm" : "Chi"}
                        </Button>
                        {isPartiallyPaid && (
                          <span className="text-[9px] text-amber-500 font-medium leading-tight">
                            Còn {formatAmount(totalSalary - paidAmount)}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
