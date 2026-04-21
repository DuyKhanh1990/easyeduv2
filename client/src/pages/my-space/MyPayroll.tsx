import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, eachDayOfInterval, parseISO, isValid, getDay } from "date-fns";
import {
  ChevronLeft, ChevronRight, Wallet,
  TableProperties, Lock, BookOpen, CheckCircle2, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { calculateTotalSalary } from "@/hooks/use-teacher-salary";
import { Skeleton } from "@/components/ui/skeleton";

/* ─────────────────────── helpers ─────────────────────── */

const WEEKDAY_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

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
  if (n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}tr`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

/* ─────────────────────── mock data ────────────────────── */

type DayEvent = {
  label: string;
  time: string;
  count: number;
};

const MOCK_CALENDAR_EVENTS: Record<number, DayEvent[]> = {
  3: [{ label: "A14", time: "08:30 – 10:00", count: 1 }],
  5: [{ label: "A15", time: "14:00 – 16:00", count: 1 }],
  10: [{ label: "A9", time: "18:00 – 20:00", count: 1 }],
  12: [{ label: "Anh10", time: "14:00 – 16:00", count: 1 }],
  17: [{ label: "A14", time: "08:30 – 10:00", count: 1 }, { label: "A15", time: "14:00 – 16:00", count: 1 }],
  19: [{ label: "A9", time: "18:00 – 20:00", count: 1 }],
  24: [{ label: "Anh10", time: "14:00 – 16:00", count: 1 }],
  26: [{ label: "A14", time: "08:30 – 10:00", count: 1 }],
};

const MOCK_SALARY_DETAIL = {
  luongCB: 0,
  soCong: 8,
  congThuc: 8,
  luongTheoCong: 0,
  phuCap: 0,
  thuong: 0,
  phat: 0,
  luongDungLop: 3_200_000,
  bhxh: 0,
  bhyt: 0,
  thueTNCN: 0,
  tamUng: 500_000,
};

type SalaryRow = {
  className: string;
  goiLuong: string;
  role: string;
  sessions: Record<string, { hours: number } | null>;
  tongSo: string;
  tongLuong: number;
  isPending: boolean;
};

const MOCK_DATE_COLS = [
  "T2 03/03", "T3 04/03", "T4 05/03", "T5 06/03", "T6 07/03",
  "T7 08/03", "CN 09/03", "T2 10/03", "T3 11/03", "T4 12/03",
  "T5 13/03", "T6 14/03", "T7 15/03", "CN 16/03",
];

const MOCK_SALARY_ROWS: SalaryRow[] = [
  {
    className: "A14",
    goiLuong: "200k/h",
    role: "Giáo viên",
    sessions: {
      "T2 03/03": { hours: 1.5 },
      "T2 10/03": { hours: 1.5 },
    },
    tongSo: "3h",
    tongLuong: 600_000,
    isPending: false,
  },
  {
    className: "A15",
    goiLuong: "200k/h",
    role: "Giáo viên",
    sessions: {
      "T5 06/03": { hours: 2 },
      "T5 13/03": { hours: 2 },
    },
    tongSo: "4h",
    tongLuong: 800_000,
    isPending: false,
  },
  {
    className: "A9",
    goiLuong: "Chưa gắn",
    role: "Giáo viên",
    sessions: {
      "T4 05/03": null,
      "T4 12/03": null,
    },
    tongSo: "2 chưa điểm danh",
    tongLuong: 0,
    isPending: true,
  },
  {
    className: "Anh10",
    goiLuong: "150k/buổi",
    role: "Trợ giảng",
    sessions: {
      "T3 04/03": { hours: 2 },
      "T3 11/03": { hours: 2 },
    },
    tongSo: "2 buổi",
    tongLuong: 300_000,
    isPending: false,
  },
];

/* ─────────────────────── Tab 1: Calendar ─────────────── */

function CalendarDay({ day, events, isToday, isWeekend }: {
  day: number;
  events: DayEvent[];
  isToday: boolean;
  isWeekend: boolean;
}) {
  return (
    <div className={cn(
      "min-h-[96px] p-1.5 border-b border-r border-border relative",
      isWeekend && "bg-amber-50/40 dark:bg-amber-900/5",
      isToday && "bg-blue-50/50 dark:bg-blue-900/10",
    )}>
      <span className={cn(
        "inline-flex items-center justify-center w-6 h-6 text-sm font-medium rounded-full",
        isToday
          ? "bg-primary text-primary-foreground"
          : isWeekend
          ? "text-amber-600 dark:text-amber-400"
          : "text-foreground",
      )}>
        {day}
      </span>
      <div className="mt-1 space-y-0.5">
        {events.map((ev, i) => (
          <div key={i} className="rounded px-1.5 py-0.5 bg-primary/10 border border-primary/20">
            <p className="text-[10px] font-semibold text-primary truncate">{ev.label}</p>
            <p className="text-[10px] text-muted-foreground truncate">{ev.time}</p>
            <p className="text-[10px] text-green-600 font-medium">{ev.count} công</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PayrollCalendar({ year, month }: { year: number; month: number }) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDow = getFirstDayOfWeek(year, month);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const totalSalary = MOCK_SALARY_DETAIL.luongCB
    + MOCK_SALARY_DETAIL.luongTheoCong
    + MOCK_SALARY_DETAIL.phuCap
    + MOCK_SALARY_DETAIL.thuong
    - MOCK_SALARY_DETAIL.phat
    + MOCK_SALARY_DETAIL.luongDungLop;

  const thucNhan = totalSalary - MOCK_SALARY_DETAIL.bhxh - MOCK_SALARY_DETAIL.bhyt
    - MOCK_SALARY_DETAIL.thueTNCN - MOCK_SALARY_DETAIL.tamUng;

  const isPublished = false;

  return (
    <div className="flex gap-4">
      {/* Calendar grid */}
      <div className="flex-1 min-w-0 rounded-xl border border-border overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border bg-muted/30">
          {WEEKDAY_SHORT.map((d, i) => (
            <div key={d} className={cn(
              "text-center py-2 text-xs font-semibold tracking-wide",
              i >= 5 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
            )}>
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((day, di) => {
              if (day === null) {
                return <div key={di} className="min-h-[96px] border-b border-r border-border bg-muted/10" />;
              }
              const isToday = isCurrentMonth && day === today.getDate();
              const isWeekend = di >= 5;
              const events = MOCK_CALENDAR_EVENTS[day] ?? [];
              return (
                <CalendarDay key={di} day={day} events={events} isToday={isToday} isWeekend={isWeekend} />
              );
            })}
          </div>
        ))}
      </div>

      {/* Chi tiết lương */}
      <div className="w-[256px] shrink-0 rounded-xl border border-border overflow-hidden self-start">
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Chi tiết lương</h3>
        </div>
        <div className="p-4 space-y-1.5 text-sm">
          {[
            { label: "Lương CB", value: MOCK_SALARY_DETAIL.luongCB, unit: "đ" },
            { label: "Số công", value: MOCK_SALARY_DETAIL.soCong, unit: "" },
            { label: "Công thực", value: MOCK_SALARY_DETAIL.congThuc, unit: "đ" },
            { label: "Lương theo công", value: MOCK_SALARY_DETAIL.luongTheoCong, unit: "đ" },
            { label: "Phụ cấp", value: MOCK_SALARY_DETAIL.phuCap, unit: "đ" },
            { label: "Thưởng", value: MOCK_SALARY_DETAIL.thuong, unit: "đ" },
            { label: "Phạt", value: MOCK_SALARY_DETAIL.phat, unit: "đ" },
            { label: "Lương đứng lớp", value: MOCK_SALARY_DETAIL.luongDungLop, unit: "đ" },
          ].map(({ label, value, unit }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">{label}</span>
              <span className={cn("text-xs font-medium", value === 0 ? "text-muted-foreground" : "text-foreground")}>
                {value === 0 ? (unit ? "0 đ" : "0") : (unit ? formatMoney(value) : value)}
              </span>
            </div>
          ))}

          <div className="border-t border-border pt-1.5 mt-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">TỔNG LƯƠNG</span>
            <span className={cn("text-xs font-bold", totalSalary === 0 ? "text-primary/60" : "text-primary")}>
              {formatMoney(totalSalary)}
            </span>
          </div>

          {[
            { label: "BHXH", value: MOCK_SALARY_DETAIL.bhxh },
            { label: "BHYT", value: MOCK_SALARY_DETAIL.bhyt },
            { label: "Thuế TNCN", value: MOCK_SALARY_DETAIL.thueTNCN },
            { label: "Tạm ứng", value: MOCK_SALARY_DETAIL.tamUng },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">{label}</span>
              <span className={cn("text-xs font-medium", value === 0 ? "text-muted-foreground/60" : "text-red-500")}>
                {value === 0 ? "0 đ" : `- ${formatMoney(value)}`}
              </span>
            </div>
          ))}

          <div className="border-t border-border pt-2 mt-1 flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">THỰC NHẬN</span>
            <span className={cn("text-sm font-bold", thucNhan > 0 ? "text-green-600" : "text-muted-foreground")}>
              {formatMoney(thucNhan)}
            </span>
          </div>
        </div>

        {!isPublished && (
          <div className="mx-4 mb-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2.5">
            <p className="text-[11px] text-amber-700 dark:text-amber-400 text-center leading-relaxed">
              Bảng lương tháng này chưa được công bố hoặc chưa có dữ liệu cấu hình.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────── Tab 2: Bảng đứng lớp ────────── */

const DOW_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

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
  const eligible = sessions.filter((s) => s.isEligible);
  const total = sessions.length;

  if (!pkg) {
    if (total === 0) return { value: "—" };
    const ineligible = total - eligible.length;
    if (ineligible === 0) return { value: "—" };
    return { value: `${ineligible} chưa điểm danh` };
  }

  switch (pkg.type) {
    case "theo-gio":
    case "tong-so-gio": {
      const h = eligible.reduce((s, sess) => s + sess.durationHours, 0);
      const display = Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
      return {
        value: display,
        subtext: eligible.length < total ? `${total - eligible.length} chưa điểm danh` : undefined,
      };
    }
    case "theo-buoi":
    case "tong-so-buoi":
      return {
        value: `${eligible.length} buổi`,
        subtext: eligible.length < total ? `${total - eligible.length} chưa điểm danh` : undefined,
      };
    case "theo-so-hv": {
      const hv = eligible.reduce((s, sess) => s + sess.attendedCount, 0);
      return {
        value: `${hv} hv`,
        subtext: eligible.length < total ? `${total - eligible.length} chưa điểm danh` : undefined,
      };
    }
    default:
      return { value: total > 0 ? `${total} buổi` : "—" };
  }
}

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

  const COL_CLASS = 130;
  const COL_PKG = 120;
  const COL_ROLE = 90;
  const COL_TONG_SO = 90;
  const COL_TONG_LUONG = 110;
  const DATE_COL = 76;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-muted/40 border-b border-border flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-foreground">{meta.salaryTableName}</p>
          <p className="text-[11px] text-muted-foreground">
            {meta.locationName && <span className="mr-2">{meta.locationName}</span>}
            {displayStart} – {displayEnd}
          </p>
        </div>
      </div>

      {/* Scrollable table */}
      <div className="overflow-auto">
        <table
          className="text-sm"
          style={{
            minWidth: `${COL_CLASS + COL_PKG + COL_ROLE + numDateCols * DATE_COL + COL_TONG_SO + COL_TONG_LUONG}px`,
            borderCollapse: "separate",
            borderSpacing: 0,
          }}
        >
          <thead className="sticky top-0 z-20">
            <tr className="bg-muted/30" style={{ boxShadow: "0 1px 0 0 hsl(var(--border))" }}>
              {/* Sticky left: Tên lớp */}
              <th
                className="sticky left-0 z-30 text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap bg-white dark:bg-gray-950"
                style={{ width: COL_CLASS, minWidth: COL_CLASS, boxShadow: "1px 0 0 0 hsl(var(--border))" }}
              >
                Tên lớp
              </th>
              {/* Gói lương */}
              <th
                className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap"
                style={{ width: COL_PKG, minWidth: COL_PKG, boxShadow: "1px 0 0 0 hsl(var(--border))" }}
              >
                Gói lương
              </th>
              {/* Vai trò */}
              <th
                className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap"
                style={{ width: COL_ROLE, minWidth: COL_ROLE, boxShadow: "1px 0 0 0 hsl(var(--border))" }}
              >
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

              {/* Sticky right: Tổng số */}
              <th
                className="sticky right-[110px] z-30 text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap bg-white dark:bg-gray-950"
                style={{ width: COL_TONG_SO, minWidth: COL_TONG_SO, boxShadow: "-1px 0 0 0 hsl(var(--border))" }}
              >
                Tổng số
              </th>
              {/* Sticky right: Tổng lương */}
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
                <tr
                  key={row.classId}
                  className="hover:bg-muted/10 transition-colors bg-background"
                >
                  {/* Tên lớp — sticky left */}
                  <td
                    className="sticky left-0 z-10 px-3 py-2.5 border-b border-border bg-white dark:bg-gray-950 whitespace-nowrap"
                    style={{ boxShadow: "1px 0 0 0 hsl(var(--border))" }}
                  >
                    <div className="flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium text-foreground text-xs">{row.className}</span>
                    </div>
                  </td>

                  {/* Gói lương */}
                  <td
                    className="px-3 py-2.5 border-b border-border whitespace-nowrap text-xs"
                    style={{ boxShadow: "1px 0 0 0 hsl(var(--border))" }}
                  >
                    {pkg
                      ? <span className="text-foreground">{pkg.name}</span>
                      : <span className="text-amber-500 italic text-[11px]">Chưa gắn</span>}
                  </td>

                  {/* Vai trò */}
                  <td
                    className="px-3 py-2.5 border-b border-border whitespace-nowrap"
                    style={{ boxShadow: "1px 0 0 0 hsl(var(--border))" }}
                  >
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                      {row.role}
                    </span>
                  </td>

                  {/* Date cells */}
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

                        return (
                          <td
                            key={date.toISOString()}
                            className={cn(
                              "border-l border-b border-border p-0",
                              session.isEligible
                                ? pkg
                                  ? "bg-green-50 dark:bg-green-900/20"
                                  : "bg-purple-50 dark:bg-purple-900/20"
                                : "bg-orange-50 dark:bg-orange-900/20"
                            )}
                            style={{ height: 44, width: DATE_COL }}
                          >
                            {session.isEligible ? (
                              <div className="flex flex-col items-center justify-center h-full gap-0.5">
                                <span className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
                                  {session.startTime} – {session.endTime}
                                </span>
                                <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 leading-tight">
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
                          className="border-l border-b border-border p-0"
                          style={{ height: 44, width: DATE_COL }}
                        />
                      ))}

                  {/* Tổng số — sticky right */}
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

                  {/* Tổng lương — sticky right */}
                  <td
                    className="sticky right-0 z-10 border-l border-b border-border px-3 py-2.5 text-center whitespace-nowrap text-xs bg-white dark:bg-gray-950"
                    style={{ boxShadow: "-1px 0 0 0 hsl(var(--border))" }}
                  >
                    {totalSalary !== null && totalSalary > 0 ? (
                      <span className="font-semibold text-green-600">{formatMoney(totalSalary)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}

            {/* Grand total row */}
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
                className="sticky right-0 z-10 border-l border-t border-border px-3 py-2.5 text-center text-sm font-bold text-green-600 bg-gray-50 dark:bg-gray-900"
                style={{ boxShadow: "-1px 0 0 0 hsl(var(--border))" }}
              >
                {formatMoney(grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
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

  const monthLabel = `tháng ${String(monthIndex + 1).padStart(2, "0")} ${year}`;

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
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold text-foreground">Bảng lương của tôi</h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={goPrev}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors"
              data-testid="button-prev-month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={goToday}
              className="px-3 h-8 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors"
              data-testid="button-today"
            >
              {monthLabel}
            </button>
            <button
              onClick={goNext}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors"
              data-testid="button-next-month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border gap-0">
          {([
            { key: "tong", label: "Bảng lương tổng", icon: Wallet },
            { key: "dung-lop", label: "Bảng lương đứng lớp", icon: TableProperties },
          ] as { key: Tab; label: string; icon: any }[]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              data-testid={`tab-${key}`}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                tab === key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "tong" && (
          <PayrollCalendar year={year} month={monthIndex} />
        )}
        {tab === "dung-lop" && (
          <SalaryDungLop />
        )}
      </div>
    </DashboardLayout>
  );
}
