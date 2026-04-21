import { format, getDay } from "date-fns";
import { DollarSign, CheckCircle2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { TeacherSalaryDetailRow } from "@/hooks/use-teacher-salary";
import { calculateTotalSalary } from "@/hooks/use-teacher-salary";
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
  packageMap: Map<string, TeacherSalaryPackage>;
  rowPaidAmounts: Record<string, number>;
  publishedRows: Set<string>;
  isLoading: boolean;
  onToggleRow: (key: string) => void;
  onToggleAll: () => void;
  onSetPackage: (key: string, value: string) => void;
  onPayRow?: (row: TableRow, totalSalary: number) => void;
};

const stickyLeftBase = "bg-white dark:bg-gray-950";
const stickyRightBase = "bg-white dark:bg-gray-950";

function formatAmount(amount: number): string {
  if (amount === 0) return "0";
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}tr`;
  if (amount >= 1_000) return `${Math.round(amount / 1_000)}k`;
  return String(amount);
}

function computeTongSo(
  row: TableRow,
  pkg: TeacherSalaryPackage | null | undefined
): { value: string; subtext?: string } {
  const sessions = row.sessions ?? [];
  const eligibleSessions = sessions.filter((s) => s.isEligible);
  const totalSessions = sessions.length;

  if (!pkg) {
    if (totalSessions === 0) return { value: "—" };
    const ineligibleCount = totalSessions - eligibleSessions.length;
    if (ineligibleCount === 0) return { value: "—" };
    return { value: `${ineligibleCount} chưa điểm danh` };
  }

  switch (pkg.type) {
    case "theo-gio":
    case "tong-so-gio": {
      const totalHours = eligibleSessions.reduce((sum, s) => sum + s.durationHours, 0);
      const display = Number.isInteger(totalHours)
        ? `${totalHours}h`
        : `${totalHours.toFixed(1)}h`;
      return {
        value: display,
        subtext: eligibleSessions.length < totalSessions
          ? `${totalSessions - eligibleSessions.length} chưa điểm danh`
          : undefined,
      };
    }
    case "theo-buoi":
    case "tong-so-buoi": {
      return {
        value: `${eligibleSessions.length} buổi`,
        subtext: eligibleSessions.length < totalSessions
          ? `${totalSessions - eligibleSessions.length} chưa điểm danh`
          : undefined,
      };
    }
    case "theo-so-hv": {
      const totalHV = eligibleSessions.reduce((sum, s) => sum + s.attendedCount, 0);
      return {
        value: `${totalHV} hv`,
        subtext: eligibleSessions.length < totalSessions
          ? `${totalSessions - eligibleSessions.length} chưa điểm danh`
          : undefined,
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
  packageMap,
  rowPaidAmounts,
  publishedRows,
  isLoading,
  onToggleRow,
  onToggleAll,
  onSetPackage,
  onPayRow,
}: Props) {
  const numDateCols = dateRange.length > 0 ? dateRange.length : 8;

  const getSessionForDate = (row: TableRow, date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return row.sessions?.find((s) => s.sessionDate.slice(0, 10) === dateStr) ?? null;
  };

  const dateSet = (sessionDates: string[], date: Date): boolean => {
    const dateStr = format(date, "yyyy-MM-dd");
    return sessionDates.some((d) => d.slice(0, 10) === dateStr);
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-6 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
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
        <thead className="sticky top-0 z-20">
          <tr
            className="bg-white dark:bg-gray-950"
            style={{ boxShadow: "0 1px 0 0 #e5e7eb" }}
          >
            <th
              className={cn("sticky z-30 text-left px-3 py-3", stickyLeftBase)}
              style={{ left: 0, width: COL_CHECKBOX, minWidth: COL_CHECKBOX, boxShadow: "1px 0 0 0 #e5e7eb" }}
            >
              <Checkbox
                checked={selectedRows.length === rows.length && rows.length > 0}
                onCheckedChange={onToggleAll}
                data-testid="checkbox-select-all"
              />
            </th>
            <th
              className={cn("sticky z-30 text-left px-3 py-3 font-medium text-muted-foreground whitespace-nowrap", stickyLeftBase)}
              style={{ left: LEFT_TEACHER, width: COL_TEACHER, minWidth: COL_TEACHER, boxShadow: "1px 0 0 0 #e5e7eb" }}
            >
              Giáo viên
            </th>
            <th
              className={cn("sticky z-30 text-left px-3 py-3 font-medium text-muted-foreground whitespace-nowrap", stickyLeftBase)}
              style={{ left: LEFT_CLASS, width: COL_CLASS, minWidth: COL_CLASS, boxShadow: "1px 0 0 0 #e5e7eb" }}
            >
              Tên lịch
            </th>

            <th
              className={cn("sticky z-30 text-left px-3 py-3 font-medium text-muted-foreground whitespace-nowrap", stickyLeftBase)}
              style={{ left: LEFT_GOI_LUONG, width: COL_GOI_LUONG, minWidth: COL_GOI_LUONG, boxShadow: "1px 0 0 0 #e5e7eb" }}
            >
              Gói lương
            </th>
            <th className="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap" style={{ minWidth: 110 }}>
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
                        "px-0 py-2 text-center font-medium whitespace-nowrap border-l",
                        isWeekend ? "text-red-500" : "text-muted-foreground"
                      )}
                      style={{ width: 80, minWidth: 80 }}
                    >
                      <div className="text-xs font-semibold">{label} {dayStr}</div>
                    </th>
                  );
                })
              : Array.from({ length: 8 }).map((_, i) => (
                  <th
                    key={i}
                    className="px-0 py-2 text-center font-medium whitespace-nowrap border-l text-muted-foreground"
                    style={{ width: 80, minWidth: 80 }}
                  >
                    <div className="text-xs font-semibold">--/--</div>
                  </th>
                ))}

            <th
              className={cn("sticky z-30 text-center px-3 py-3 font-medium text-muted-foreground whitespace-nowrap", stickyRightBase)}
              style={{ right: RIGHT_TONG_SO, width: COL_TONG_SO, minWidth: COL_TONG_SO, boxShadow: "-1px 0 0 0 #e5e7eb" }}
            >
              Tổng số
            </th>
            <th
              className={cn("sticky z-30 text-center px-3 py-3 font-medium text-muted-foreground whitespace-nowrap", stickyRightBase)}
              style={{ right: RIGHT_TONG_LUONG, width: COL_TONG_LUONG, minWidth: COL_TONG_LUONG, boxShadow: "-1px 0 0 0 #e5e7eb" }}
            >
              Tổng lương
            </th>
            <th
              className={cn("sticky z-30 text-center px-3 py-3 font-medium text-muted-foreground whitespace-nowrap", stickyRightBase)}
              style={{ right: RIGHT_CHI, width: COL_CHI, minWidth: COL_CHI, boxShadow: "-1px 0 0 0 #e5e7eb" }}
            >
              Chi lương
            </th>
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={6 + numDateCols}
                className="h-40 text-center text-muted-foreground text-sm"
              >
                Không có giáo viên nào có lịch dạy trong khoảng thời gian này.
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const isSelected = selectedRows.includes(row.rowKey);
              const pkgId = rowPackages[row.rowKey] ?? "";
              const pkg = pkgId ? packageMap.get(pkgId) : null;
              const isUnassigned = !pkgId;
              const totalSessions = (row.sessions ?? []).length;

              const totalSalary = pkg ? calculateTotalSalary(row, pkg as any) : 0;
              const tongSo = computeTongSo(row, pkg);
              const paidAmount = rowPaidAmounts[row.rowKey] ?? 0;
              const isFullyPaid = totalSalary > 0 && paidAmount >= totalSalary;
              const isPartiallyPaid = paidAmount > 0 && paidAmount < totalSalary;

              const rowBg = isSelected ? "bg-blue-50 dark:bg-blue-950/20" : "bg-white dark:bg-gray-950";
              const rowHover = isSelected ? "" : "hover:bg-gray-50 dark:hover:bg-gray-900/40";
              const stickyLeftBg = isSelected ? "bg-blue-50 dark:bg-blue-950/20" : stickyLeftBase;
              const stickyRightBg = isSelected ? "bg-blue-50 dark:bg-blue-950/20" : stickyRightBase;

              return (
                <tr
                  key={row.rowKey}
                  className={cn("transition-colors", rowBg, rowHover)}
                  data-testid={`row-teacher-${row.rowKey}`}
                >
                  <td
                    className={cn("sticky z-10 px-3 py-2.5 border-b border-gray-100 dark:border-gray-800", stickyLeftBg)}
                    style={{ left: 0, width: COL_CHECKBOX, boxShadow: "1px 0 0 0 #e5e7eb" }}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleRow(row.rowKey)}
                      data-testid={`checkbox-row-${row.rowKey}`}
                    />
                  </td>
                  <td
                    className={cn("sticky z-10 px-3 py-2.5 whitespace-nowrap font-medium text-foreground border-b border-gray-100 dark:border-gray-800", stickyLeftBg)}
                    style={{ left: LEFT_TEACHER, width: COL_TEACHER, boxShadow: "1px 0 0 0 #e5e7eb" }}
                  >
                    <div className="flex items-center gap-1">
                      <div className="truncate max-w-[120px]" title={row.teacherName}>
                        {row.teacherName}
                      </div>
                      {publishedRows.has(row.rowKey) && (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" title="Đã công bố" />
                      )}
                    </div>
                    {row.teacherCode && (
                      <div className="text-[10px] text-muted-foreground">{row.teacherCode}</div>
                    )}
                  </td>
                  <td
                    className={cn("sticky z-10 px-3 py-2.5 whitespace-nowrap text-foreground border-b border-gray-100 dark:border-gray-800", stickyLeftBg)}
                    style={{ left: LEFT_CLASS, width: COL_CLASS, boxShadow: "1px 0 0 0 #e5e7eb" }}
                  >
                    <div className="truncate max-w-[110px]" title={row.className}>
                      {row.className}
                    </div>
                  </td>

                  <td
                    className={cn("sticky z-10 px-2 py-1.5 whitespace-nowrap border-b border-gray-100 dark:border-gray-800", stickyLeftBg)}
                    style={{ left: LEFT_GOI_LUONG, width: COL_GOI_LUONG, boxShadow: "1px 0 0 0 #e5e7eb" }}
                  >
                    <Select
                      value={pkgId || "none"}
                      onValueChange={(val) => onSetPackage(row.rowKey, val)}
                    >
                      <SelectTrigger
                        className={cn(
                          "h-7 w-full text-xs border rounded px-2",
                          isUnassigned
                            ? "text-muted-foreground italic border-dashed"
                            : "text-foreground border-border"
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

                  <td className="px-3 py-2.5 whitespace-nowrap border-b border-gray-100 dark:border-gray-800">
                    <Badge variant="outline" className="text-xs font-normal px-2">
                      {row.role}
                    </Badge>
                  </td>

                  {dateRange.length > 0
                    ? dateRange.map((date) => {
                        const session = getSessionForDate(row, date);
                        if (!session) {
                          return (
                            <td
                              key={date.toISOString()}
                              className="border-l border-b border-gray-100 dark:border-gray-800 p-0"
                              style={{ height: 44, width: 80 }}
                              data-testid={`cell-session-${row.rowKey}-${format(date, "yyyy-MM-dd")}`}
                            />
                          );
                        }

                        const isEligible = session.isEligible;
                        const dh = session.durationHours;
                        const durationLabel = Number.isInteger(dh) ? `${dh}h` : `${dh.toFixed(1)}h`;

                        return (
                          <td
                            key={date.toISOString()}
                            className={cn(
                              "border-l border-b border-gray-100 dark:border-gray-800 p-0",
                              isEligible
                                ? pkg
                                  ? "bg-green-50 dark:bg-green-900/20"
                                  : "bg-purple-100 dark:bg-purple-900/30"
                                : "bg-orange-50 dark:bg-orange-900/20"
                            )}
                            style={{ height: 44, width: 80 }}
                            data-testid={`cell-session-${row.rowKey}-${format(date, "yyyy-MM-dd")}`}
                          >
                            {isEligible ? (
                              <div className="flex flex-col items-center justify-center h-full gap-0.5">
                                <span className="text-[10px] text-gray-600 dark:text-gray-400 leading-tight">
                                  {session.startTime} - {session.endTime}
                                </span>
                                <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300 leading-tight">
                                  {durationLabel}
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
                          className="border-l border-b border-gray-100 dark:border-gray-800 p-0"
                          style={{ height: 44, width: 80 }}
                        />
                      ))}

                  <td
                    className={cn("sticky z-10 border-l border-b border-gray-100 dark:border-gray-800 px-3 py-2.5 text-center whitespace-nowrap text-sm", stickyRightBg)}
                    style={{ right: RIGHT_TONG_SO, width: COL_TONG_SO }}
                  >
                    {tongSo.value === "—" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div>
                        <span className={cn("font-medium", isUnassigned ? "text-[11px] text-orange-500" : "text-foreground")}>
                          {tongSo.value}
                        </span>
                        {tongSo.subtext && (
                          <div className="text-[10px] text-orange-500">
                            {tongSo.subtext}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td
                    className={cn("sticky z-10 border-l border-b border-gray-100 dark:border-gray-800 px-3 py-2.5 text-center whitespace-nowrap text-sm", stickyRightBg)}
                    style={{ right: RIGHT_TONG_LUONG, width: COL_TONG_LUONG }}
                  >
                    {pkg && totalSalary > 0 ? (
                      <span className="font-semibold text-green-700 dark:text-green-400">
                        {totalSalary.toLocaleString("vi-VN")}đ
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td
                    className={cn("sticky z-10 border-l border-b border-gray-100 dark:border-gray-800 px-2 py-2.5 text-center", stickyRightBg)}
                    style={{ right: RIGHT_CHI, width: COL_CHI }}
                  >
                    {isFullyPaid ? (
                      <div
                        className="flex items-center justify-center gap-1 h-7 px-2 text-xs text-green-600 font-medium"
                        data-testid={`status-paid-${row.rowKey}`}
                      >
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-[11px]">Đã chi</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-0.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className={cn(
                            "h-7 px-2.5 text-xs gap-1",
                            isPartiallyPaid
                              ? "border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400"
                              : "border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800 dark:border-green-700 dark:text-green-400"
                          )}
                          disabled={isUnassigned || totalSessions === 0 || totalSalary <= 0}
                          onClick={() => onPayRow?.(row, totalSalary)}
                          data-testid={`button-pay-${row.rowKey}`}
                        >
                          <DollarSign className="h-3 w-3" />
                          {isPartiallyPaid ? "Chi thêm" : "Chi"}
                        </Button>
                        {isPartiallyPaid && (
                          <span className="text-[9px] text-orange-500 leading-tight">
                            Còn {(totalSalary - paidAmount).toLocaleString("vi-VN")}đ
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
