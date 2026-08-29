import { useEffect, useState } from "react";
import type { DateRange } from "react-day-picker";
import { useLocation } from "wouter";
import { getAuthHeaders } from "@/lib/queryClient";
import { ThuChiReport } from "./reports/ThuChiReport";
import { PhanBoReport } from "./reports/PhanBoReport";
import { DoanhThuLopHocReport } from "./reports/DoanhThuLopHocReport";
import { DoanhThuNhanSuReport } from "./reports/DoanhThuNhanSuReport";
import { PhanBoHocPhiReport } from "./reports/PhanBoHocPhiReport";
import { ThoiGianGiangDayReport } from "./reports/ThoiGianGiangDayReport";
import { HocVienMoiReport } from "./reports/HocVienMoiReport";
import { ChuyenDoiReport } from "./reports/ChuyenDoiReport";
import { CallHistoryReport } from "./reports/CallHistoryReport";
import { Redirect } from "wouter";
import { useMyPermissions, canAccessItem } from "@/hooks/use-my-permissions";
import { useSidebarVisibility } from "@/hooks/use-sidebar-visibility";
import { navigation } from "@/lib/sidebar-navigation";
import { Users, TrendingUp, UserPlus, CheckCircle2, BookOpenCheck, Network, Megaphone, Building2, UserSquare2, Receipt, Wallet, Banknote, AlertCircle, PieChart as PieChartIcon, FileText, CalendarDays, PhoneCall } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useQuery } from "@tanstack/react-query";
import { useLocationFilter } from "@/hooks/use-location-filter";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  ComposedChart, Line, PieChart, Pie
} from "recharts";

function MiniBar({ pct, colorClass }: { pct: number; colorClass: string }) {
  return (
    <div className="h-1 rounded-full bg-muted overflow-hidden mt-1">
      <div
        className={`h-full rounded-full transition-all duration-700 ${colorClass}`}
        style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
      />
    </div>
  );
}

const SOURCE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#f97316", "#84cc16"];

type SplitAccent = "violet" | "emerald" | "rose" | "orange" | "amber" | "blue";
const SPLIT_ACCENT_MAP: Record<SplitAccent, { text: string; barFrom: string; barTo: string }> = {
  violet:  { text: "text-violet-600",  barFrom: "from-violet-400",  barTo: "to-violet-500" },
  emerald: { text: "text-emerald-600", barFrom: "from-emerald-400", barTo: "to-emerald-500" },
  rose:    { text: "text-rose-600",    barFrom: "from-rose-400",    barTo: "to-rose-500" },
  orange:  { text: "text-orange-600",  barFrom: "from-orange-400",  barTo: "to-orange-500" },
  amber:   { text: "text-amber-600",   barFrom: "from-amber-400",   barTo: "to-amber-500" },
  blue:    { text: "text-blue-600",    barFrom: "from-blue-400",    barTo: "to-blue-500" },
};

function SplitMoneyHalf({
  label, amount, pct, accent, testIdAmount, testIdPct,
}: {
  label: string; amount: number; pct: number; accent: SplitAccent; testIdAmount?: string; testIdPct?: string;
}) {
  const a = SPLIT_ACCENT_MAP[accent];
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex items-baseline justify-between gap-2">
        <p className={`text-base md:text-lg font-bold font-display leading-tight tabular-nums ${a.text}`} data-testid={testIdAmount}>
          {amount.toLocaleString("vi-VN")}
          <span className="text-[11px] text-muted-foreground font-medium ml-0.5">₫</span>
        </p>
        <span className={`text-[11px] font-semibold tabular-nums ${a.text}`} data-testid={testIdPct}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${a.barFrom} ${a.barTo} transition-all duration-1000`}
          style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
        />
      </div>
    </div>
  );
}

function SplitMoneyRows({
  top, bottom,
}: {
  top: { label: string; amount: number; accent: SplitAccent; testIdAmount?: string; testIdPct?: string };
  bottom: { label: string; amount: number; accent: SplitAccent; testIdAmount?: string; testIdPct?: string };
}) {
  const total = top.amount + bottom.amount;
  const topPct    = total > 0 ? Math.round((top.amount    / total) * 100) : 0;
  const bottomPct = total > 0 ? Math.round((bottom.amount / total) * 100) : 0;
  return (
    <div className="space-y-3">
      <SplitMoneyHalf {...top}    pct={topPct} />
      <div className="border-t border-border/50" />
      <SplitMoneyHalf {...bottom} pct={bottomPct} />
    </div>
  );
}

function CategoryAllocationDonut({
  categories, total, accentColor, emptyLabel,
}: {
  categories: { name: string; amount: number; pct: number }[];
  total: number;
  accentColor: string;
  emptyLabel: string;
}) {
  const hasData = categories.length > 0 && total > 0;
  const data = hasData
    ? categories.map((c, i) => ({ ...c, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }))
    : [{ name: emptyLabel, amount: 1, pct: 0, color: "hsl(var(--muted))" }];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4 items-center">
      <div className="relative w-full h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={56}
              outerRadius={82}
              paddingAngle={hasData ? 2 : 0}
              dataKey="amount"
              stroke="none"
              isAnimationActive
              animationBegin={100}
              animationDuration={1100}
            >
              {data.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} />
              ))}
            </Pie>
            {hasData && (
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const p: any = payload[0].payload;
                    return (
                      <div className="bg-background border border-border rounded-lg px-3 py-2 shadow-lg text-sm">
                        <p className="font-semibold text-foreground mb-1">{p.name}</p>
                        <p className="text-muted-foreground">
                          Số tiền: <span className="font-bold text-foreground tabular-nums">{Number(p.amount).toLocaleString("vi-VN")} ₫</span>
                        </p>
                        <p className="text-muted-foreground">
                          Tỷ lệ: <span className="font-bold tabular-nums" style={{ color: accentColor }}>{p.pct}%</span>
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Tổng</span>
          <span className="text-base font-bold font-display text-foreground leading-tight tabular-nums">
            {total.toLocaleString("vi-VN")}
          </span>
          <span className="text-[10px] text-muted-foreground">₫</span>
        </div>
      </div>
      <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
        {hasData ? (
          data.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: c.color }} />
              <span className="text-foreground truncate flex-1" title={c.name}>{c.name}</span>
              <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                {Number(c.amount).toLocaleString("vi-VN")} ₫
              </span>
              <span className="font-semibold tabular-nums whitespace-nowrap min-w-[44px] text-right" style={{ color: accentColor }}>
                {c.pct}%
              </span>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground italic">Chưa có dữ liệu</p>
        )}
      </div>
    </div>
  );
}

type DateFilterKey = "today" | "week" | "month" | "3months" | "6months" | "year" | "custom";

const DATE_FILTER_OPTIONS: { key: DateFilterKey; label: string }[] = [
  { key: "today",   label: "Hôm nay" },
  { key: "week",    label: "Tuần này" },
  { key: "month",   label: "Tháng này" },
  { key: "3months", label: "3 tháng" },
  { key: "6months", label: "6 tháng" },
  { key: "year",    label: "Năm nay" },
  { key: "custom",  label: "Tuỳ chọn" },
];

function computeDateRange(key: DateFilterKey, customRange?: DateRange): { dateFrom: string; dateTo: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = new Date();
  const todayStr = fmt(now);
  switch (key) {
    case "today":   return { dateFrom: todayStr, dateTo: todayStr };
    case "week": {
      const dow = now.getDay();
      const mon = new Date(now);
      mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
      return { dateFrom: fmt(mon), dateTo: todayStr };
    }
    case "month":
      return { dateFrom: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), dateTo: todayStr };
    case "3months": {
      const from = new Date(now);
      from.setMonth(from.getMonth() - 3);
      return { dateFrom: fmt(from), dateTo: todayStr };
    }
    case "6months": {
      const from = new Date(now);
      from.setMonth(from.getMonth() - 6);
      return { dateFrom: fmt(from), dateTo: todayStr };
    }
    case "year":
      return { dateFrom: `${now.getFullYear()}-01-01`, dateTo: todayStr };
    case "custom":
      if (customRange?.from && customRange?.to) {
        return { dateFrom: fmt(customRange.from), dateTo: fmt(customRange.to) };
      }
      return { dateFrom: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), dateTo: todayStr };
  }
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    const countEntry = payload.find((p: any) => p.dataKey === "count");
    const pctEntry = payload.find((p: any) => p.dataKey === "pct");
    return (
      <div className="bg-background border border-border rounded-lg px-3 py-2 shadow-lg text-sm">
        <p className="font-semibold text-foreground mb-1">{label}</p>
        {countEntry && <p className="text-muted-foreground">Học viên: <span className="font-bold text-foreground">{countEntry.value}</span></p>}
        {pctEntry && <p className="text-muted-foreground">Tỷ lệ: <span className="font-bold text-emerald-500">{pctEntry.value}%</span></p>}
        {!pctEntry && !countEntry && <p className="text-muted-foreground">Học viên: <span className="font-bold text-foreground">{payload[0].value}</span></p>}
      </div>
    );
  }
  return null;
}

// ── Card 1: Tổng khách hàng — donut chart ─────────────────────────────────────
function CustomerDonut({
  total, hocVien, hocVienPct, phuHuynh, phuHuynhPct,
}: { total: number; hocVien: number; hocVienPct: number; phuHuynh: number; phuHuynhPct: number }) {
  // Recharts Pie won't render anything when every value is 0, so seed a single
  // gray slice so the empty-state still looks like a donut, not a blank card.
  const hasData = hocVien + phuHuynh > 0;
  const data = hasData
    ? [
        { name: "Học viên", value: hocVien, color: "#3b82f6" },
        { name: "Phụ huynh", value: phuHuynh, color: "#8b5cf6" },
      ]
    : [{ name: "Chưa có dữ liệu", value: 1, color: "hsl(var(--muted))" }];
  return (
    <div data-testid="chart-customer-donut">
      <div className="relative w-full h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={44}
              outerRadius={64}
              paddingAngle={hasData ? 3 : 0}
              dataKey="value"
              stroke="none"
              isAnimationActive
              animationBegin={100}
              animationDuration={1100}
            >
              {data.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} />
              ))}
            </Pie>
            {hasData && <Tooltip content={<CustomTooltip />} />}
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Tổng</span>
          <span className="text-2xl font-bold font-display text-foreground leading-tight" data-testid="text-total-customers">
            {total}
          </span>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: "#3b82f6" }} />
          <span className="text-muted-foreground shrink-0">Học viên</span>
          <span className="font-semibold text-foreground whitespace-nowrap tabular-nums" data-testid="text-hoc-vien">
            {hocVien}
          </span>
          <span className="text-muted-foreground tabular-nums">({hocVienPct}%)</span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: "#8b5cf6" }} />
          <span className="text-muted-foreground shrink-0">Phụ huynh</span>
          <span className="font-semibold text-foreground whitespace-nowrap tabular-nums" data-testid="text-phu-huynh">
            {phuHuynh}
          </span>
          <span className="text-muted-foreground tabular-nums">({phuHuynhPct}%)</span>
        </div>
      </div>
    </div>
  );
}

// ── Card 2: Trạng thái tài khoản — half-donut gauge ───────────────────────────
function AccountStatusGauge({
  active, inactive, activePct, inactivePct,
}: { active: number; inactive: number; activePct: number; inactivePct: number }) {
  const hasData = active + inactive > 0;
  // Half-donut: full ring is 180° → rendered as two slices, the rest is the
  // muted "track" so the colored segment reads as a gauge needle level.
  const data = hasData
    ? [
        { name: "Hoạt động", value: active, color: "#10b981" },
        { name: "Không hoạt động", value: inactive, color: "hsl(var(--muted))" },
      ]
    : [{ name: "Chưa có dữ liệu", value: 1, color: "hsl(var(--muted))" }];
  return (
    <div data-testid="chart-account-gauge">
      <div className="relative w-full h-[110px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="92%"
              startAngle={180}
              endAngle={0}
              innerRadius={62}
              outerRadius={88}
              paddingAngle={hasData ? 1 : 0}
              dataKey="value"
              stroke="none"
              cornerRadius={4}
              isAnimationActive
              animationBegin={100}
              animationDuration={1100}
            >
              {data.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} />
              ))}
            </Pie>
            {hasData && <Tooltip content={<CustomTooltip />} />}
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-x-0 bottom-1 flex flex-col items-center justify-end pointer-events-none">
          <span className="text-2xl font-bold font-display text-emerald-600 leading-none">
            {hasData ? `${activePct}%` : "—"}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Hoạt động</span>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-sm bg-emerald-500 shrink-0" />
          <span className="text-muted-foreground shrink-0">Hoạt động</span>
          <span className="font-semibold text-foreground whitespace-nowrap tabular-nums" data-testid="text-active-accounts">
            {active}
          </span>
          <span className="text-muted-foreground tabular-nums">({activePct}%)</span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-sm bg-muted shrink-0" />
          <span className="text-muted-foreground shrink-0">Không HĐ</span>
          <span className="font-semibold text-foreground whitespace-nowrap tabular-nums" data-testid="text-inactive-accounts">
            {inactive}
          </span>
          <span className="text-muted-foreground tabular-nums">({inactivePct}%)</span>
        </div>
      </div>
    </div>
  );
}

// ── Generic horizontal-bar chart (reusable) ───────────────────────────────────
function HorizontalBars({
  items, total, testId,
}: {
  items: { key: string; label: string; value: number; fill: string; testId?: string }[];
  total: number;
  testId?: string;
}) {
  const safeTotal = Math.max(total, 1);
  // Bar widths are scaled to the largest value so the longest bar fills the
  // track. Empty bars stay at 0 so they don't masquerade as a tiny value.
  const max = Math.max(...items.map((s) => s.value), 1);
  // Trigger CSS width transition on mount so bars grow from 0 → target.
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="space-y-3.5" data-testid={testId}>
      {items.map((s) => {
        const pctVal = Math.round((s.value / safeTotal) * 100);
        const barPct = Math.round((s.value / max) * 100);
        return (
          <div
            key={s.key}
            className="grid grid-cols-[100px_1fr_32px_40px] items-center gap-2.5 text-[11px]"
            data-testid={`row-${s.key}`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: s.fill }} />
              <span className="text-muted-foreground whitespace-nowrap">{s.label}</span>
            </div>
            <div className="h-[25px] rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-[1100ms] ease-out"
                style={{
                  width: animated && s.value > 0 ? `${Math.max(barPct, 3)}%` : "0%",
                  background: s.fill,
                }}
              />
            </div>
            <span className="text-right font-semibold text-foreground tabular-nums" data-testid={s.testId}>
              {s.value}
            </span>
            <span className="text-right text-muted-foreground tabular-nums">{pctVal}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Generic column + line chart (count as bars, percentage as line) ──────────
function ColumnLineChart({
  data, barKey, lineKey, barColor, lineColor, barName, lineName, valueSuffix, lineSuffix, height,
}: {
  data: { label: string; [k: string]: any }[];
  barKey: string;
  lineKey: string;
  barColor: string;
  lineColor: string;
  barName: string;
  lineName: string;
  valueSuffix?: string;
  lineSuffix?: string;
  height?: number;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="h-[260px] flex items-center justify-center text-xs text-muted-foreground">
        Chưa có dữ liệu
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height ?? 260}>
      <ComposedChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
        <YAxis yAxisId="left"  tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
        <Tooltip
          contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
          formatter={(value: any, name: string) => {
            if (name === lineName) return [`${value}${lineSuffix ?? "%"}`, name];
            return [`${value}${valueSuffix ?? ""}`, name];
          }}
        />
        <Bar  yAxisId="left"  dataKey={barKey}  name={barName}  fill={barColor}  radius={[6, 6, 0, 0]} maxBarSize={36} />
        <Line yAxisId="right" dataKey={lineKey} name={lineName} stroke={lineColor} strokeWidth={2} dot={{ r: 3, fill: lineColor }} activeDot={{ r: 5 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── Card 3: Trạng thái học tập — horizontal bars ──────────────────────────────
function LearningStatusBars({
  dangHoc, choLich, baoLuu, daNghi, chuaCoLich, total,
}: { dangHoc: number; choLich: number; baoLuu: number; daNghi: number; chuaCoLich: number; total: number }) {
  const items = [
    { key: "dangHoc",    label: "Đang học",     value: dangHoc,    fill: "#8b5cf6", testId: "status-dang-hoc" },
    { key: "choLich",    label: "Chờ đến lịch", value: choLich,    fill: "#3b82f6", testId: "status-cho-lich" },
    { key: "baoLuu",     label: "Bảo lưu",      value: baoLuu,     fill: "#f59e0b", testId: "status-bao-luu" },
    { key: "daNghi",     label: "Đã nghỉ",      value: daNghi,     fill: "#f43f5e", testId: "status-da-nghi" },
    { key: "chuaCoLich", label: "Chưa có lịch", value: chuaCoLich, fill: "#94a3b8", testId: "status-chua-co-lich" },
  ];
  return <HorizontalBars items={items} total={total} testId="chart-learning-bars" />;
}

// ── Class Status (Đào tạo) — horizontal bars ──────────────────────────────────
function ClassStatusBars({
  planning, recruiting, active, closed, total,
}: { planning: number; recruiting: number; active: number; closed: number; total: number }) {
  const items = [
    { key: "active",     label: "Đang hoạt động", value: active,     fill: "#10b981", testId: "class-status-active" },
    { key: "recruiting", label: "Đang tuyển sinh", value: recruiting, fill: "#3b82f6", testId: "class-status-recruiting" },
    { key: "planning",   label: "Lên kế hoạch",   value: planning,   fill: "#f59e0b", testId: "class-status-planning" },
    { key: "closed",     label: "Đã đóng",        value: closed,     fill: "#94a3b8", testId: "class-status-closed" },
  ];
  return <HorizontalBars items={items} total={total} testId="chart-class-status-bars" />;
}

// ── Class Format (Đào tạo) — donut chart ──────────────────────────────────────
function ClassFormatDonut({
  total, offline, offlinePct, online, onlinePct,
}: { total: number; offline: number; offlinePct: number; online: number; onlinePct: number }) {
  const hasData = offline + online > 0;
  const data = hasData
    ? [
        { name: "Offline", value: offline, color: "#3b82f6" },
        { name: "Online",  value: online,  color: "#8b5cf6" },
      ]
    : [{ name: "Chưa có dữ liệu", value: 1, color: "hsl(var(--muted))" }];
  return (
    <div data-testid="chart-class-format-donut">
      <div className="relative w-full h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={44}
              outerRadius={64}
              paddingAngle={hasData ? 3 : 0}
              dataKey="value"
              stroke="none"
              isAnimationActive
              animationBegin={100}
              animationDuration={1100}
            >
              {data.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} />
              ))}
            </Pie>
            {hasData && <Tooltip content={<CustomTooltip />} />}
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Tổng</span>
          <span className="text-2xl font-bold font-display text-foreground leading-tight" data-testid="text-total-classes">
            {total}
          </span>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: "#3b82f6" }} />
          <span className="text-muted-foreground shrink-0">Offline</span>
          <span className="font-semibold text-foreground whitespace-nowrap tabular-nums" data-testid="text-classes-offline">
            {offline}
          </span>
          <span className="text-muted-foreground tabular-nums">({offlinePct}%)</span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: "#8b5cf6" }} />
          <span className="text-muted-foreground shrink-0">Online</span>
          <span className="font-semibold text-foreground whitespace-nowrap tabular-nums" data-testid="text-classes-online">
            {online}
          </span>
          <span className="text-muted-foreground tabular-nums">({onlinePct}%)</span>
        </div>
      </div>
    </div>
  );
}

const DASHBOARD_TABS = [
  { value: "khach-hang", label: "KHÁCH HÀNG", testId: "tab-khach-hang" },
  { value: "dao-tao",    label: "ĐÀO TẠO",    testId: "tab-dao-tao" },
  { value: "tai-chinh",  label: "TÀI CHÍNH",  testId: "tab-tai-chinh" },
  { value: "bao-cao",    label: "BÁO CÁO",    testId: "tab-bao-cao" },
];

const ALL_REPORTS = [
  { value: "thu-chi",             name: "Báo cáo Thu - Chi",       desc: "Tổng hợp thu chi theo kỳ, danh mục và cơ sở",              color: "emerald" },
  { value: "phan-bo",             name: "Phân bổ Thu - Chi",       desc: "So sánh danh mục thu chi giữa kỳ hiện tại và kỳ trước",    color: "blue" },
  { value: "doanh-thu-lop-hoc",  name: "Doanh thu lớp học",       desc: "Tổng hợp doanh thu theo từng lớp học",                     color: "violet" },
  { value: "doanh-thu-nhan-su",  name: "Doanh thu nhân sự",       desc: "Doanh thu hoa hồng theo từng nhân sự",                     color: "orange" },
  { value: "phan-bo-hoc-phi",    name: "Phân bổ học phí",         desc: "Học phí thực học theo học viên và từng tháng",             color: "amber" },
  { value: "thoi-gian-giang-day", name: "Thời gian giảng dạy",    desc: "Thống kê thời gian giảng dạy theo giáo viên",             color: "cyan" },
  { value: "hoc-vien-moi",       name: "Báo cáo Học viên mới",   desc: "Thống kê học viên / phụ huynh được tạo mới theo kỳ",      color: "sky" },
  { value: "chuyen-doi",         name: "Báo cáo Chuyển đổi",     desc: "Thống kê học viên được chuyển đổi theo mối quan hệ",      color: "indigo" },
  { value: "lich-su-cuoc-goi",   name: "Lịch sử cuộc gọi",       desc: "Theo dõi cuộc gọi vào, gọi ra và ghi âm qua Omicall",       color: "red" },
] as const;

type ReportValue = typeof ALL_REPORTS[number]["value"];

export function Dashboard() {
  const { data: myPerms, isError: permsError } = useMyPermissions();
  const { locationId } = useLocationFilter();
  const [dateFilter, setDateFilter] = useState<DateFilterKey>("month");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [customOpen, setCustomOpen] = useState(false);
  const [activeReport, setActiveReport] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const isAuthed = !!getAuthHeaders().Authorization;
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("tab") || "khach-hang";
    }
    return "khach-hang";
  });

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setLocation(`/?tab=${value}`);
  };

  // Staggered query loading — prevents DB connection storm on startup.
  // Priority 1 (0 ms): KPI summary cards — customer/status/new
  // Priority 2 (600 ms): chart/analytics queries
  const [p2Ready, setP2Ready] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setP2Ready(true), 600);
    return () => clearTimeout(t);
  }, []);

  const isSuperAdmin = myPerms?.isSuperAdmin ?? false;
  const permsLoaded = !!myPerms;
  const { isSubTabVisible } = useSidebarVisibility();

  const hasDashTabPerm = (tabValue: string): boolean => {
    if (!isSubTabVisible("/", tabValue)) return false;
    if (!permsLoaded) return true;
    if (isSuperAdmin) return true;
    const perm = myPerms?.permissions[`/#${tabValue}`];
    return !!(perm?.canView || perm?.canViewAll);
  };

  const hasDashReportPerm = (reportValue: string): boolean => {
    if (!permsLoaded) return true;
    if (isSuperAdmin) return true;
    const perm = myPerms?.permissions[`/#bao-cao/${reportValue}`];
    return !!(perm?.canView || perm?.canViewAll);
  };

  const visibleTabs = DASHBOARD_TABS.filter(t => hasDashTabPerm(t.value));
  const visibleReports = ALL_REPORTS.filter(r => hasDashReportPerm(r.value));

  useEffect(() => {
    if (permsLoaded && visibleTabs.length > 0 && !visibleTabs.find(t => t.value === activeTab)) {
      handleTabChange(visibleTabs[0].value);
    }
  }, [permsLoaded, isSuperAdmin, visibleTabs.map(t => t.value).join(",")]);

  useEffect(() => {
    if (activeReport && !visibleReports.find(r => r.value === activeReport)) {
      setActiveReport(null);
    }
  }, [permsLoaded, isSuperAdmin]);

  const locationParam = locationId && locationId !== "all" ? `?locationId=${locationId}` : "";
  const dateRange = computeDateRange(dateFilter, customRange);
  const baseParams = [
    locationId && locationId !== "all" ? `locationId=${locationId}` : "",
    `dateFrom=${dateRange.dateFrom}`,
    `dateTo=${dateRange.dateTo}`,
  ].filter(Boolean).join("&");
  const dateParam = `?${baseParams}`;

  // Gộp 8 summary API thành 1 request duy nhất để giảm DB round trips
  const { data: dashboardSummary, isLoading: loadingDashboard } = useQuery<{
    customerSummary: { total: number; hocVien: number; hocVienPct: number; phuHuynh: number; phuHuynhPct: number; active: number; activePct: number; inactive: number };
    learningStatus: { dangHoc: number; baoLuu: number; choLich: number; daNghi: number; chuaCoLich: number; total: number };
    newCustomers: { today: number; thisMonth: number };
    bySource: { name: string; count: number; pct: number }[];
    byRelationship: { name: string; count: number; color?: string }[];
    byLocation: { name: string; count: number; pct: number }[];
    byStaff: { name: string; count: number; pct: number }[];
    monthlyCounts: { monthKey: string; label: string; count: number; growthPct: number }[];
  }>({
    queryKey: ["/api/students/dashboard-summary", locationId, dateRange.dateFrom, dateRange.dateTo],
    enabled: isAuthed && activeTab === "khach-hang",
    queryFn: () => {
      const params = new URLSearchParams();
      if (locationId && locationId !== "all") params.set("locationId", locationId);
      params.set("dateFrom", dateRange.dateFrom);
      params.set("dateTo", dateRange.dateTo);
      return fetch(`/api/students/dashboard-summary?${params}`, { credentials: "include", headers: getAuthHeaders() }).then(r => r.json());
    },
    staleTime: 2 * 60 * 1000,
  });

  const customerSummary = dashboardSummary?.customerSummary;
  const learningStatus = dashboardSummary?.learningStatus;
  const newCustomers = dashboardSummary?.newCustomers;
  const bySource = dashboardSummary?.bySource ?? [];
  const byRelationship = dashboardSummary?.byRelationship ?? [];
  const byLocation = dashboardSummary?.byLocation ?? [];
  const byStaff = dashboardSummary?.byStaff ?? [];
  const monthlyCounts = dashboardSummary?.monthlyCounts ?? [];
  const loadingCustomer = loadingDashboard;
  const loadingStatus = loadingDashboard;
  const loadingNewCustomers = loadingDashboard;
  const loadingBySource = loadingDashboard;
  const loadingByRelationship = loadingDashboard;
  const loadingByLocation = loadingDashboard;
  const loadingByStaff = loadingDashboard;
  const loadingMonthly = loadingDashboard;

  // Đào tạo tab — Tổng số lớp học (offline / online)
  const { data: classFormat, isLoading: loadingClassFormat } = useQuery<{
    total: number; offline: number; offlinePct: number; online: number; onlinePct: number;
  }>({ queryKey: ["/api/classes/format-summary", locationId], enabled: isAuthed && activeTab === "dao-tao", queryFn: () =>
    fetch(`/api/classes/format-summary${locationParam}`, { credentials: "include" }).then(r => r.json())
  });

  // Đào tạo tab — Trạng thái lớp học
  const { data: classStatus, isLoading: loadingClassStatus } = useQuery<{
    planning: number; recruiting: number; active: number; closed: number; total: number;
  }>({ queryKey: ["/api/classes/status-summary", locationId], enabled: isAuthed && activeTab === "dao-tao", queryFn: () =>
    fetch(`/api/classes/status-summary${locationParam}`, { credentials: "include" }).then(r => r.json())
  });

  // Đào tạo tab — Lớp học mới (hôm nay / tháng này)
  const { data: newClasses, isLoading: loadingNewClasses } = useQuery<{
    today: number; thisMonth: number;
  }>({ queryKey: ["/api/classes/new-summary", locationId], enabled: isAuthed && activeTab === "dao-tao", queryFn: () =>
    fetch(`/api/classes/new-summary${locationParam}`, { credentials: "include" }).then(r => r.json())
  });

  // Đào tạo — Tổng số lớp theo cơ sở
  const { data: classesByLoc, isLoading: loadingClassesByLoc } = useQuery<{ name: string; count: number; pct: number }[]>({
    queryKey: ["/api/classes/by-location", locationId, dateRange.dateFrom, dateRange.dateTo],
    enabled: isAuthed && activeTab === "dao-tao",
    queryFn: () => fetch(`/api/classes/by-location${dateParam}`, { credentials: "include" }).then(r => r.json()),
  });

  // Đào tạo — Tỷ lệ điểm danh 6 tháng gần nhất (trend chart — cố định 6 tháng)
  const { data: monthlyAttendance, isLoading: loadingMonthlyAttendance } = useQuery<{ monthKey: string; label: string; total: number; present: number; rate: number }[]>({
    queryKey: ["/api/classes/monthly-attendance", locationId],
    enabled: isAuthed && activeTab === "dao-tao",
    queryFn: () => fetch(`/api/classes/monthly-attendance?months=6${locationParam ? `&${locationParam.slice(1)}` : ""}`, { credentials: "include" }).then(r => r.json()),
  });

  // Đào tạo — Tổng số lớp giáo viên
  const { data: classesByTeacher, isLoading: loadingClassesByTeacher } = useQuery<{ name: string; count: number; pct: number }[]>({
    queryKey: ["/api/classes/by-teacher", locationId, dateRange.dateFrom, dateRange.dateTo],
    enabled: isAuthed && activeTab === "dao-tao",
    queryFn: () => fetch(`/api/classes/by-teacher${dateParam}`, { credentials: "include" }).then(r => r.json()),
  });

  // Đào tạo — Tổng số ca dạy giáo viên
  const { data: sessionsByTeacher, isLoading: loadingSessionsByTeacher } = useQuery<{ name: string; count: number; pct: number }[]>({
    queryKey: ["/api/classes/sessions-by-teacher", locationId, dateRange.dateFrom, dateRange.dateTo],
    enabled: isAuthed && activeTab === "dao-tao",
    queryFn: () => fetch(`/api/classes/sessions-by-teacher${dateParam}`, { credentials: "include" }).then(r => r.json()),
  });

  // Tài chính — Tổng quan hoá đơn
  const { data: invoiceSummary, isLoading: loadingInvoiceSummary } = useQuery<{
    totalCount: number;
    byStatus: { unpaid: number; partial: number; paid: number; debt: number; cancelled: number };
    totalRevenue: number;
    actualCollected: number;
    debtAmount: number;
    expectedIncome: number;
    expectedExpense: number;
    actualIncome: number;
    actualExpense: number;
    debtIncome: number;
    debtExpense: number;
  }>({
    queryKey: ["/api/finance/invoices/summary", locationId, dateRange.dateFrom, dateRange.dateTo],
    enabled: isAuthed && activeTab === "tai-chinh",
    queryFn: () => fetch(`/api/finance/invoices/summary${dateParam}`, { credentials: "include" }).then(r => r.json()),
  });

  // Tài chính — Phân bổ thu/chi theo danh mục
  const { data: invoicesByCategory, isLoading: loadingInvoicesByCategory } = useQuery<{
    income: { categories: { name: string; amount: number; pct: number }[]; total: number };
    expense: { categories: { name: string; amount: number; pct: number }[]; total: number };
  }>({
    queryKey: ["/api/finance/invoices/by-category", locationId, dateRange.dateFrom, dateRange.dateTo],
    enabled: isAuthed && activeTab === "tai-chinh",
    queryFn: () => fetch(`/api/finance/invoices/by-category${dateParam}`, { credentials: "include" }).then(r => r.json()),
  });

  // Tài chính — Doanh thu thực theo cơ sở
  const { data: revenueByLocation, isLoading: loadingRevenueByLocation } = useQuery<{
    rows: { locationId: string | null; locationName: string; totalIncome: number; totalExpense: number; profit: number }[];
    totals: { totalIncome: number; totalExpense: number; profit: number };
  }>({
    queryKey: ["/api/finance/revenue/by-location", locationId, dateRange.dateFrom, dateRange.dateTo],
    enabled: isAuthed && activeTab === "tai-chinh",
    queryFn: () => fetch(`/api/finance/revenue/by-location${dateParam}`, { credentials: "include" }).then(r => r.json()),
  });

  // Tài chính — Công nợ khách hàng
  const { data: customerDebt, isLoading: loadingCustomerDebt } = useQuery<{
    totalDebtAmount: number;
    totalCount: number;
    byStatus: { key: string; label: string; count: number; amount: number; pct: number }[];
  }>({
    queryKey: ["/api/finance/customers/debt-summary", locationId, dateRange.dateFrom, dateRange.dateTo],
    enabled: isAuthed && activeTab === "tai-chinh",
    queryFn: () => fetch(`/api/finance/customers/debt-summary${dateParam}`, { credentials: "include" }).then(r => r.json()),
  });

  if (permsError || !myPerms) {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }
  if (myPerms.isStudent) return <Redirect to="/my-space/calendar" />;

  // Staff without any Dashboard tab permission → redirect to first accessible page
  if (!isSuperAdmin && visibleTabs.length === 0) {
    const systemDeptNames = myPerms.systemDepartmentNames ?? [];
    const isInSystemDept = systemDeptNames.length > 0;
    let firstRoute = "";
    for (const entry of navigation) {
      if (firstRoute) break;
      if ("href" in entry) {
        if (entry.href === "/" || entry.href === "/chat" || entry.href === "/zalo") continue;
        if (canAccessItem(myPerms, entry.href)) { firstRoute = entry.href; break; }
      } else if ("module" in entry) {
        for (const item of entry.items) {
          const isMySpace = entry.module === "MY SPACE";
          if (isMySpace) {
            if (isInSystemDept && ["/my-space/calendar", "/my-space/assignments", "/my-space/score-sheet"].includes(item.href)) {
              firstRoute = item.href; break;
            }
            continue;
          }
          const accessible = item.subTabs && item.subTabs.length > 0
            ? item.subTabs.some(tab => canAccessItem(myPerms, `${item.href}#${tab.value}`))
            : canAccessItem(myPerms, item.href);
          if (accessible) { firstRoute = item.href; break; }
        }
      }
    }
    return <Redirect to={firstRoute || "/my-space/calendar"} />;
  }

  const activePct = customerSummary && customerSummary.total > 0
    ? Math.round((customerSummary.active / customerSummary.total) * 100)
    : 100;

  const inactivePct = customerSummary && customerSummary.total > 0
    ? Math.round((customerSummary.inactive / customerSummary.total) * 100)
    : 0;

  const lsTotal = learningStatus?.total || 1;
  const pct = (n: number) => Math.round((n / lsTotal) * 100);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <div className="flex gap-2 flex-wrap mb-1">
            {visibleTabs.map(tab => (
              <Button
                key={tab.value}
                data-testid={tab.testId}
                onClick={() => handleTabChange(tab.value)}
                className={activeTab === tab.value
                  ? "bg-[#1e3a5f] hover:bg-[#16305a] text-white font-semibold px-5"
                  : "bg-white border border-[#1e3a5f]/40 text-[#1e3a5f] hover:bg-[#1e3a5f]/5 hover:border-[#1e3a5f] font-semibold px-5"}
              >
                {tab.label}
              </Button>
            ))}
          </div>
          {/* Global date filter bar */}
          <div className="flex items-center gap-1.5 flex-wrap mt-3 mb-0 border-b border-border/50 pb-3">
            <span className="text-xs text-muted-foreground font-medium mr-1 shrink-0">Khoảng thời gian:</span>
            {DATE_FILTER_OPTIONS.map(opt =>
              opt.key === "custom" ? (
                <Popover key="custom" open={customOpen} onOpenChange={setCustomOpen}>
                  <PopoverTrigger asChild>
                    <button
                      onClick={() => { setDateFilter("custom"); setCustomOpen(true); }}
                      className={cn(
                        "inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-medium border transition-all",
                        dateFilter === "custom"
                          ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                          : "bg-white text-[#1e3a5f] border-[#1e3a5f]/30 hover:border-[#1e3a5f] hover:bg-[#1e3a5f]/5"
                      )}
                    >
                      <CalendarDays className="w-3.5 h-3.5" />
                      {dateFilter === "custom" && customRange?.from && customRange?.to
                        ? `${customRange.from.getDate().toString().padStart(2,"0")}/${(customRange.from.getMonth()+1).toString().padStart(2,"0")} – ${customRange.to.getDate().toString().padStart(2,"0")}/${(customRange.to.getMonth()+1).toString().padStart(2,"0")}`
                        : "Tuỳ chọn"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={customRange}
                      onSelect={(range) => {
                        setCustomRange(range);
                        if (range?.from && range?.to) {
                          setDateFilter("custom");
                          setCustomOpen(false);
                        }
                      }}
                      numberOfMonths={2}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              ) : (
                <button
                  key={opt.key}
                  onClick={() => setDateFilter(opt.key)}
                  className={cn(
                    "h-7 px-3 rounded-full text-xs font-medium border transition-all",
                    dateFilter === opt.key
                      ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                      : "bg-white text-[#1e3a5f] border-[#1e3a5f]/30 hover:border-[#1e3a5f] hover:bg-[#1e3a5f]/5"
                  )}
                >
                  {opt.label}
                </button>
              )
            )}
          </div>
          <TabsContent value="khach-hang">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">

              {/* Card 1: Tổng Khách hàng — Donut chart */}
              <Card className="border-none shadow-lg shadow-black/5" data-testid="card-tong-khach-hang">
                <CardHeader className="pb-2 pt-5 px-5">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-blue-500" />
                    </div>
                    <CardTitle className="text-sm font-semibold text-muted-foreground">Tổng Khách hàng</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {loadingCustomer ? (
                    <div className="space-y-2 mt-1">
                      <Skeleton className="h-32 w-full" />
                    </div>
                  ) : (
                    <CustomerDonut
                      total={customerSummary?.total ?? 0}
                      hocVien={customerSummary?.hocVien ?? 0}
                      hocVienPct={customerSummary?.hocVienPct ?? 0}
                      phuHuynh={customerSummary?.phuHuynh ?? 0}
                      phuHuynhPct={customerSummary?.phuHuynhPct ?? 0}
                    />
                  )}
                </CardContent>
              </Card>

              {/* Card 2: Trạng thái tài khoản — Half-donut gauge */}
              <Card className="border-none shadow-lg shadow-black/5" data-testid="card-trang-thai-tai-khoan">
                <CardHeader className="pb-2 pt-5 px-5">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    </div>
                    <CardTitle className="text-sm font-semibold text-muted-foreground">Trạng thái tài khoản</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {loadingCustomer ? (
                    <div className="space-y-2 mt-1">
                      <Skeleton className="h-32 w-full" />
                    </div>
                  ) : (
                    <AccountStatusGauge
                      active={customerSummary?.active ?? 0}
                      inactive={customerSummary?.inactive ?? 0}
                      activePct={activePct}
                      inactivePct={inactivePct}
                    />
                  )}
                </CardContent>
              </Card>

              {/* Card 3: Khách hàng mới — moved from analytics row */}
              <Card className="border-none shadow-lg shadow-black/5" data-testid="card-khach-hang-moi">
                <CardHeader className="pb-2 pt-5 px-5">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
                      <UserPlus className="w-5 h-5 text-amber-500" />
                    </div>
                    <CardTitle className="text-sm font-semibold text-muted-foreground">Khách hàng mới</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {loadingNewCustomers ? (
                    <div className="space-y-3 mt-1">
                      <Skeleton className="h-20 w-full" />
                      <Skeleton className="h-20 w-full" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-xl bg-amber-500/5 border border-amber-500/15 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 rounded-full bg-amber-500/15 flex items-center justify-center">
                            <UserPlus className="w-4 h-4 text-amber-500" />
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Hôm nay</p>
                            <p className="text-2xl font-bold font-display text-amber-600 leading-tight" data-testid="text-new-today">
                              +{newCustomers?.today ?? 0}
                            </p>
                          </div>
                        </div>
                        <span className="text-[11px] text-muted-foreground" data-testid="text-new-today-count">
                          {(newCustomers?.thisMonth ?? 0) > 0
                            ? `${Math.round(((newCustomers?.today ?? 0) / (newCustomers?.thisMonth ?? 1)) * 100)}% tháng này`
                            : "—"}
                        </span>
                      </div>
                      <div className="rounded-xl bg-muted/40 border border-border/60 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                            <TrendingUp className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Tháng này</p>
                            <p className="text-2xl font-bold font-display text-foreground leading-tight" data-testid="text-new-month-count">
                              +{newCustomers?.thisMonth ?? 0}
                            </p>
                          </div>
                        </div>
                        <span className="text-[11px] text-muted-foreground">Tổng dồn</span>
                      </div>
                      <div className="pt-1">
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-1000"
                            style={{
                              width: `${(newCustomers?.thisMonth ?? 0) > 0
                                ? Math.min(Math.round(((newCustomers?.today ?? 0) / (newCustomers?.thisMonth ?? 1)) * 100), 100)
                                : 0}%`,
                            }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1.5 text-center">Đóng góp của hôm nay vào tổng tháng</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

            </div>

            {/* Row 2: Trạng thái học tập + slot trống (sẽ thêm sau) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <Card className="border-none shadow-lg shadow-black/5" data-testid="card-trang-thai-hoc-tap">
                <CardHeader className="pb-2 pt-5 px-5">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
                      <BookOpenCheck className="w-5 h-5 text-violet-500" />
                    </div>
                    <CardTitle className="text-sm font-semibold text-muted-foreground">Trạng thái học tập</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {loadingStatus ? (
                    <div className="space-y-2 mt-1">
                      <Skeleton className="h-32 w-full" />
                    </div>
                  ) : (
                    <LearningStatusBars
                      dangHoc={learningStatus?.dangHoc ?? 0}
                      choLich={learningStatus?.choLich ?? 0}
                      baoLuu={learningStatus?.baoLuu ?? 0}
                      daNghi={learningStatus?.daNghi ?? 0}
                      chuaCoLich={learningStatus?.chuaCoLich ?? 0}
                      total={lsTotal}
                    />
                  )}
                </CardContent>
              </Card>

              {/* Số lượng học viên theo tháng — combo bar (count) + line (growth %) */}
              <Card className="border-none shadow-lg shadow-black/5" data-testid="card-monthly-students">
                <CardHeader className="pb-2 pt-5 px-5">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-sky-500" />
                    </div>
                    <CardTitle className="text-sm font-semibold text-muted-foreground">Số lượng học viên theo tháng</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-3 pb-5">
                  {loadingMonthly ? (
                    <div className="h-[230px] flex items-center justify-center">
                      <Skeleton className="w-full h-48" />
                    </div>
                  ) : !monthlyCounts || monthlyCounts.length === 0 ? (
                    <div className="h-[230px] flex flex-col items-center justify-center text-muted-foreground/50 gap-2">
                      <TrendingUp className="w-8 h-8" />
                      <p className="text-sm">Chưa có dữ liệu</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={230}>
                      <ComposedChart data={monthlyCounts} margin={{ top: 12, right: 36, left: -20, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                        <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#10b981" }} tickLine={false} axisLine={false} unit="%" />
                        <Tooltip
                          content={({ active, payload, label }: any) =>
                            active && payload?.length ? (
                              <div className="bg-background border border-border rounded-lg px-3 py-2 shadow-lg text-sm">
                                <p className="font-semibold text-foreground mb-1">Tháng {label}</p>
                                <p className="text-muted-foreground">
                                  Học viên mới: <span className="font-bold text-sky-600">{payload[0]?.payload?.count ?? 0}</span>
                                </p>
                                <p className="text-muted-foreground">
                                  Tăng trưởng:{" "}
                                  <span className={`font-bold ${(payload[0]?.payload?.growthPct ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                                    {(payload[0]?.payload?.growthPct ?? 0) > 0 ? "+" : ""}{payload[0]?.payload?.growthPct ?? 0}%
                                  </span>
                                </p>
                              </div>
                            ) : null
                          }
                          cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
                        />
                        <Bar yAxisId="left" dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={42} />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="growthPct"
                          stroke="#10b981"
                          strokeWidth={2}
                          dot={{ fill: "#10b981", r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Charts section */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-muted-foreground">Phân tích học viên</h3>
                <span className="text-xs text-muted-foreground">
                  {dateRange.dateFrom} – {dateRange.dateTo}
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* By Source */}
                <Card className="border-none shadow-lg shadow-black/5" data-testid="card-chart-by-source">
                  <CardHeader className="pb-2 pt-5 px-5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
                        <Megaphone className="w-4 h-4 text-blue-500" />
                      </div>
                      <CardTitle className="text-sm font-semibold text-muted-foreground">Học viên theo Nguồn khách hàng</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="px-3 pb-5">
                    {loadingBySource ? (
                      <div className="h-52 flex items-center justify-center">
                        <Skeleton className="w-full h-44" />
                      </div>
                    ) : !bySource || bySource.length === 0 ? (
                      <div className="h-52 flex flex-col items-center justify-center text-muted-foreground/50 gap-2">
                        <Megaphone className="w-8 h-8" />
                        <p className="text-sm">Chưa có dữ liệu</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={210}>
                        <ComposedChart data={bySource} margin={{ top: 8, right: 36, left: -20, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                          <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#3b82f6" }} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
                          <Bar yAxisId="left" dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                            {(bySource || []).map((_, idx) => (
                              <Cell key={idx} fill={SOURCE_COLORS[idx % SOURCE_COLORS.length]} />
                            ))}
                          </Bar>
                          <Line yAxisId="right" type="monotone" dataKey="pct" stroke="#3b82f6" strokeWidth={2} dot={{ fill: "#3b82f6", r: 3 }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                {/* Right: by Relationship */}
                <Card className="border-none shadow-lg shadow-black/5" data-testid="card-chart-by-relationship">
                  <CardHeader className="pb-2 pt-5 px-5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center">
                        <Network className="w-4 h-4 text-violet-500" />
                      </div>
                      <CardTitle className="text-sm font-semibold text-muted-foreground">Học viên theo Mối quan hệ</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="px-3 pb-5">
                    {loadingByRelationship ? (
                      <div className="h-52 flex items-center justify-center">
                        <Skeleton className="w-full h-44" />
                      </div>
                    ) : !byRelationship || byRelationship.length === 0 ? (
                      <div className="h-52 flex flex-col items-center justify-center text-muted-foreground/50 gap-2">
                        <Network className="w-8 h-8" />
                        <p className="text-sm">Chưa có dữ liệu</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={210}>
                        <BarChart data={byRelationship} margin={{ top: 8, right: 8, left: -20, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                            tickLine={false}
                            axisLine={false}
                            allowDecimals={false}
                          />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
                          <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                            {(byRelationship || []).map((entry, idx) => (
                              <Cell key={idx} fill={entry.color || SOURCE_COLORS[idx % SOURCE_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Row 2: by Location + by Staff */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">

                {/* Left: by Location */}
                <Card className="border-none shadow-lg shadow-black/5" data-testid="card-chart-by-location">
                  <CardHeader className="pb-2 pt-5 px-5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-emerald-500" />
                      </div>
                      <CardTitle className="text-sm font-semibold text-muted-foreground">Học viên theo Cơ sở</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="px-3 pb-5">
                    {loadingByLocation ? (
                      <div className="h-52 flex items-center justify-center">
                        <Skeleton className="w-full h-44" />
                      </div>
                    ) : !byLocation || byLocation.length === 0 ? (
                      <div className="h-52 flex flex-col items-center justify-center text-muted-foreground/50 gap-2">
                        <Building2 className="w-8 h-8" />
                        <p className="text-sm">Chưa có dữ liệu</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={210}>
                        <ComposedChart data={byLocation} margin={{ top: 8, right: 36, left: -20, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                          <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#10b981" }} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
                          <Bar yAxisId="left" dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                            {(byLocation || []).map((_, idx) => (
                              <Cell key={idx} fill={SOURCE_COLORS[idx % SOURCE_COLORS.length]} />
                            ))}
                          </Bar>
                          <Line yAxisId="right" type="monotone" dataKey="pct" stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981", r: 3 }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                {/* Right: by Staff */}
                <Card className="border-none shadow-lg shadow-black/5" data-testid="card-chart-by-staff">
                  <CardHeader className="pb-2 pt-5 px-5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
                        <UserSquare2 className="w-4 h-4 text-amber-500" />
                      </div>
                      <CardTitle className="text-sm font-semibold text-muted-foreground">Học viên theo Nhân sự</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="px-3 pb-5">
                    {loadingByStaff ? (
                      <div className="h-52 flex items-center justify-center">
                        <Skeleton className="w-full h-44" />
                      </div>
                    ) : !byStaff || byStaff.length === 0 ? (
                      <div className="h-52 flex flex-col items-center justify-center text-muted-foreground/50 gap-2">
                        <UserSquare2 className="w-8 h-8" />
                        <p className="text-sm">Chưa có dữ liệu</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={210}>
                        <ComposedChart data={byStaff} margin={{ top: 8, right: 36, left: -20, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                          <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#f59e0b" }} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
                          <Bar yAxisId="left" dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                            {(byStaff || []).map((_, idx) => (
                              <Cell key={idx} fill={SOURCE_COLORS[idx % SOURCE_COLORS.length]} />
                            ))}
                          </Bar>
                          <Line yAxisId="right" type="monotone" dataKey="pct" stroke="#f59e0b" strokeWidth={2} dot={{ fill: "#f59e0b", r: 3 }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

              </div>
            </div>
          </TabsContent>
          <TabsContent value="dao-tao">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
              {/* Card 1: Tổng số lớp học — Donut chart (offline / online) */}
              <Card className="border-none shadow-lg shadow-black/5" data-testid="card-tong-so-lop-hoc">
                <CardHeader className="pb-2 pt-5 px-5">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-blue-500" />
                    </div>
                    <CardTitle className="text-sm font-semibold text-muted-foreground">Tổng số lớp học</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {loadingClassFormat ? (
                    <div className="space-y-2 mt-1">
                      <Skeleton className="h-32 w-full" />
                    </div>
                  ) : (
                    <ClassFormatDonut
                      total={classFormat?.total ?? 0}
                      offline={classFormat?.offline ?? 0}
                      offlinePct={classFormat?.offlinePct ?? 0}
                      online={classFormat?.online ?? 0}
                      onlinePct={classFormat?.onlinePct ?? 0}
                    />
                  )}
                </CardContent>
              </Card>

              {/* Card 2: Trạng thái lớp học — horizontal bars */}
              <Card className="border-none shadow-lg shadow-black/5" data-testid="card-trang-thai-lop-hoc">
                <CardHeader className="pb-2 pt-5 px-5">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
                      <BookOpenCheck className="w-5 h-5 text-violet-500" />
                    </div>
                    <CardTitle className="text-sm font-semibold text-muted-foreground">Trạng thái lớp học</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {loadingClassStatus ? (
                    <div className="space-y-2 mt-1">
                      <Skeleton className="h-32 w-full" />
                    </div>
                  ) : (
                    <ClassStatusBars
                      planning={classStatus?.planning ?? 0}
                      recruiting={classStatus?.recruiting ?? 0}
                      active={classStatus?.active ?? 0}
                      closed={classStatus?.closed ?? 0}
                      total={classStatus?.total ?? 0}
                    />
                  )}
                </CardContent>
              </Card>

              {/* Card 3: Lớp học mới (giống Khách hàng mới) */}
              <Card className="border-none shadow-lg shadow-black/5" data-testid="card-lop-hoc-moi">
                <CardHeader className="pb-2 pt-5 px-5">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
                      <UserPlus className="w-5 h-5 text-amber-500" />
                    </div>
                    <CardTitle className="text-sm font-semibold text-muted-foreground">Lớp học mới</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {loadingNewClasses ? (
                    <div className="space-y-3 mt-1">
                      <Skeleton className="h-20 w-full" />
                      <Skeleton className="h-20 w-full" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-xl bg-amber-500/5 border border-amber-500/15 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 rounded-full bg-amber-500/15 flex items-center justify-center">
                            <UserPlus className="w-4 h-4 text-amber-500" />
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Hôm nay</p>
                            <p className="text-2xl font-bold font-display text-amber-600 leading-tight" data-testid="text-new-class-today">
                              +{newClasses?.today ?? 0}
                            </p>
                          </div>
                        </div>
                        <span className="text-[11px] text-muted-foreground" data-testid="text-new-class-today-pct">
                          {(newClasses?.thisMonth ?? 0) > 0
                            ? `${Math.round(((newClasses?.today ?? 0) / (newClasses?.thisMonth ?? 1)) * 100)}% tháng này`
                            : "—"}
                        </span>
                      </div>
                      <div className="rounded-xl bg-muted/40 border border-border/60 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                            <TrendingUp className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Tháng này</p>
                            <p className="text-2xl font-bold font-display text-foreground leading-tight" data-testid="text-new-class-month-count">
                              +{newClasses?.thisMonth ?? 0}
                            </p>
                          </div>
                        </div>
                        <span className="text-[11px] text-muted-foreground">Tổng dồn</span>
                      </div>
                      <div className="pt-1">
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-1000"
                            style={{
                              width: `${(newClasses?.thisMonth ?? 0) > 0
                                ? Math.min(Math.round(((newClasses?.today ?? 0) / (newClasses?.thisMonth ?? 1)) * 100), 100)
                                : 0}%`,
                            }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1.5 text-center">Đóng góp của hôm nay vào tổng tháng</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Row 2: Tổng số lớp theo cơ sở + Tỷ lệ điểm danh theo tháng */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <Card className="border-none shadow-lg shadow-black/5" data-testid="card-lop-theo-co-so">
                <CardHeader className="pb-2 pt-5 px-5">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-blue-500" />
                    </div>
                    <CardTitle className="text-sm font-semibold text-muted-foreground">Tổng số lớp theo cơ sở</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {loadingClassesByLoc ? (
                    <Skeleton className="h-[260px] w-full" />
                  ) : (
                    <ColumnLineChart
                      data={(classesByLoc ?? []).map(d => ({ label: d.name, count: d.count, pct: d.pct }))}
                      barKey="count" lineKey="pct"
                      barColor="#3b82f6" lineColor="#f59e0b"
                      barName="Số lớp" lineName="% chiếm"
                    />
                  )}
                </CardContent>
              </Card>

              <Card className="border-none shadow-lg shadow-black/5" data-testid="card-ty-le-diem-danh">
                <CardHeader className="pb-2 pt-5 px-5">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    </div>
                    <CardTitle className="text-sm font-semibold text-muted-foreground">Tỷ lệ điểm danh theo tháng</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {loadingMonthlyAttendance ? (
                    <Skeleton className="h-[260px] w-full" />
                  ) : (
                    <ColumnLineChart
                      data={(monthlyAttendance ?? []).map(d => ({ label: d.label, total: d.total, rate: d.rate }))}
                      barKey="total" lineKey="rate"
                      barColor="#10b981" lineColor="#f59e0b"
                      barName="Tổng buổi" lineName="Tỷ lệ điểm danh"
                    />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Row 3: Tổng số lớp giáo viên + Tổng số ca dạy giáo viên */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <Card className="border-none shadow-lg shadow-black/5" data-testid="card-lop-giao-vien">
                <CardHeader className="pb-2 pt-5 px-5">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
                      <UserSquare2 className="w-5 h-5 text-violet-500" />
                    </div>
                    <CardTitle className="text-sm font-semibold text-muted-foreground">Tổng số lớp giáo viên</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {loadingClassesByTeacher ? (
                    <Skeleton className="h-32 w-full" />
                  ) : (classesByTeacher ?? []).length === 0 ? (
                    <div className="h-[120px] flex items-center justify-center text-xs text-muted-foreground">Chưa có dữ liệu</div>
                  ) : (
                    <HorizontalBars
                      items={(classesByTeacher ?? []).map((t, i) => ({
                        key: `teacher-cls-${i}`,
                        label: t.name,
                        value: t.count,
                        fill: ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#f43f5e", "#06b6d4", "#a855f7", "#ec4899"][i % 8],
                        testId: `teacher-cls-${i}`,
                      }))}
                      total={(classesByTeacher ?? []).reduce((s, t) => s + t.count, 0)}
                      testId="chart-classes-by-teacher"
                    />
                  )}
                </CardContent>
              </Card>

              <Card className="border-none shadow-lg shadow-black/5" data-testid="card-ca-day-giao-vien">
                <CardHeader className="pb-2 pt-5 px-5">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
                      <BookOpenCheck className="w-5 h-5 text-amber-500" />
                    </div>
                    <CardTitle className="text-sm font-semibold text-muted-foreground">Tổng số ca dạy giáo viên</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {loadingSessionsByTeacher ? (
                    <Skeleton className="h-32 w-full" />
                  ) : (sessionsByTeacher ?? []).length === 0 ? (
                    <div className="h-[120px] flex items-center justify-center text-xs text-muted-foreground">Chưa có dữ liệu</div>
                  ) : (
                    <HorizontalBars
                      items={(sessionsByTeacher ?? []).map((t, i) => ({
                        key: `teacher-ses-${i}`,
                        label: t.name,
                        value: t.count,
                        fill: ["#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#f43f5e", "#06b6d4", "#a855f7", "#ec4899"][i % 8],
                        testId: `teacher-ses-${i}`,
                      }))}
                      total={(sessionsByTeacher ?? []).reduce((s, t) => s + t.count, 0)}
                      testId="chart-sessions-by-teacher"
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          <TabsContent value="tai-chinh">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">

              {/* Card 1: Tổng hoá đơn */}
              <Card className="border-none shadow-lg shadow-black/5" data-testid="card-tong-hoa-don">
                <CardHeader className="pb-2 pt-5 px-5">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <Receipt className="w-5 h-5 text-blue-500" />
                    </div>
                    <CardTitle className="text-sm font-semibold text-muted-foreground">Tổng hoá đơn</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {loadingInvoiceSummary ? (
                    <div className="space-y-2 mt-1">
                      <Skeleton className="h-32 w-full" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Số lượng</p>
                        <p className="text-3xl font-bold font-display text-foreground leading-tight" data-testid="text-invoice-total-count">
                          {invoiceSummary?.totalCount ?? 0}
                        </p>
                      </div>
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="w-2 h-2 rounded-sm bg-emerald-500" />
                            Đã thanh toán
                          </span>
                          <span className="font-semibold text-foreground tabular-nums" data-testid="text-invoice-paid-count">
                            {invoiceSummary?.byStatus.paid ?? 0}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="w-2 h-2 rounded-sm bg-amber-500" />
                            Thanh toán 1 phần
                          </span>
                          <span className="font-semibold text-foreground tabular-nums" data-testid="text-invoice-partial-count">
                            {invoiceSummary?.byStatus.partial ?? 0}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="w-2 h-2 rounded-sm bg-rose-500" />
                            Chưa thanh toán
                          </span>
                          <span className="font-semibold text-foreground tabular-nums" data-testid="text-invoice-unpaid-count">
                            {(invoiceSummary?.byStatus.unpaid ?? 0) + (invoiceSummary?.byStatus.debt ?? 0)}
                          </span>
                        </div>
                        {(invoiceSummary?.byStatus.cancelled ?? 0) > 0 && (
                          <div className="flex items-center justify-between text-[12px]">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <span className="w-2 h-2 rounded-sm bg-muted-foreground/60" />
                              Đã huỷ
                            </span>
                            <span className="font-semibold text-foreground tabular-nums" data-testid="text-invoice-cancelled-count">
                              {invoiceSummary?.byStatus.cancelled ?? 0}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Card 2: Tổng doanh thu (Tổng thu/chi dự kiến) */}
              <Card className="border-none shadow-lg shadow-black/5" data-testid="card-tong-doanh-thu">
                <CardHeader className="pb-2 pt-5 px-5">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
                      <Wallet className="w-5 h-5 text-violet-500" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {loadingInvoiceSummary ? (
                    <Skeleton className="h-32 w-full" />
                  ) : (
                    <SplitMoneyRows
                      top={{
                        label: "Tổng thu dự kiến",
                        amount: invoiceSummary?.expectedIncome ?? 0,
                        accent: "violet",
                        testIdAmount: "text-expected-income",
                        testIdPct: "text-expected-income-pct",
                      }}
                      bottom={{
                        label: "Tổng chi dự kiến",
                        amount: invoiceSummary?.expectedExpense ?? 0,
                        accent: "orange",
                        testIdAmount: "text-expected-expense",
                        testIdPct: "text-expected-expense-pct",
                      }}
                    />
                  )}
                </CardContent>
              </Card>

              {/* Card 3: Thực thu / Thực chi */}
              <Card className="border-none shadow-lg shadow-black/5" data-testid="card-thuc-thu">
                <CardHeader className="pb-2 pt-5 px-5">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <Banknote className="w-5 h-5 text-emerald-500" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {loadingInvoiceSummary ? (
                    <Skeleton className="h-32 w-full" />
                  ) : (
                    <SplitMoneyRows
                      top={{
                        label: "Thực thu",
                        amount: invoiceSummary?.actualIncome ?? 0,
                        accent: "emerald",
                        testIdAmount: "text-actual-income",
                        testIdPct: "text-actual-income-pct",
                      }}
                      bottom={{
                        label: "Thực chi",
                        amount: invoiceSummary?.actualExpense ?? 0,
                        accent: "orange",
                        testIdAmount: "text-actual-expense",
                        testIdPct: "text-actual-expense-pct",
                      }}
                    />
                  )}
                </CardContent>
              </Card>

              {/* Card 4: Công nợ (Thu nợ / Chi nợ) */}
              <Card className="border-none shadow-lg shadow-black/5" data-testid="card-cong-no">
                <CardHeader className="pb-2 pt-5 px-5">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-rose-500" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {loadingInvoiceSummary ? (
                    <Skeleton className="h-32 w-full" />
                  ) : (
                    <SplitMoneyRows
                      top={{
                        label: "Thu nợ",
                        amount: invoiceSummary?.debtIncome ?? 0,
                        accent: "rose",
                        testIdAmount: "text-debt-income",
                        testIdPct: "text-debt-income-pct",
                      }}
                      bottom={{
                        label: "Chi nợ",
                        amount: invoiceSummary?.debtExpense ?? 0,
                        accent: "orange",
                        testIdAmount: "text-debt-expense",
                        testIdPct: "text-debt-expense-pct",
                      }}
                    />
                  )}
                </CardContent>
              </Card>

            </div>

            {/* Hàng 2: Biểu đồ phân bổ thu / chi theo danh mục */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              {/* Phân bổ thu */}
              <Card className="border-none shadow-lg shadow-black/5" data-testid="card-phan-bo-thu">
                <CardHeader className="pb-2 pt-5 px-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                        <PieChartIcon className="w-5 h-5 text-emerald-500" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold text-muted-foreground">Phân bổ thu</CardTitle>
                        <p className="text-[11px] text-muted-foreground/80">Theo danh mục thu</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tổng thực thu</p>
                      <p className="text-base font-bold font-display text-emerald-600 leading-tight tabular-nums" data-testid="text-phan-bo-thu-total">
                        {(invoicesByCategory?.income?.total ?? 0).toLocaleString("vi-VN")}<span className="text-xs text-muted-foreground font-medium ml-0.5">₫</span>
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5 pt-2">
                  {loadingInvoicesByCategory ? (
                    <Skeleton className="h-[180px] w-full" />
                  ) : (
                    <CategoryAllocationDonut
                      categories={invoicesByCategory?.income?.categories ?? []}
                      total={invoicesByCategory?.income?.total ?? 0}
                      accentColor="#10b981"
                      emptyLabel="Chưa có dữ liệu"
                    />
                  )}
                </CardContent>
              </Card>

              {/* Phân bổ chi */}
              <Card className="border-none shadow-lg shadow-black/5" data-testid="card-phan-bo-chi">
                <CardHeader className="pb-2 pt-5 px-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
                        <PieChartIcon className="w-5 h-5 text-orange-500" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold text-muted-foreground">Phân bổ chi</CardTitle>
                        <p className="text-[11px] text-muted-foreground/80">Theo danh mục chi</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tổng đã chi</p>
                      <p className="text-base font-bold font-display text-orange-600 leading-tight tabular-nums" data-testid="text-phan-bo-chi-total">
                        {(invoicesByCategory?.expense?.total ?? 0).toLocaleString("vi-VN")}<span className="text-xs text-muted-foreground font-medium ml-0.5">₫</span>
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5 pt-2">
                  {loadingInvoicesByCategory ? (
                    <Skeleton className="h-[180px] w-full" />
                  ) : (
                    <CategoryAllocationDonut
                      categories={invoicesByCategory?.expense?.categories ?? []}
                      total={invoicesByCategory?.expense?.total ?? 0}
                      accentColor="#f97316"
                      emptyLabel="Chưa có dữ liệu"
                    />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Hàng 3: Doanh thu thực theo cơ sở + Công nợ khách hàng */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              {/* Doanh thu thực theo cơ sở */}
              <Card className="border-none shadow-lg shadow-black/5" data-testid="card-revenue-by-location">
                <CardHeader className="pb-2 pt-5 px-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-indigo-500" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold text-muted-foreground">Doanh thu thực theo cơ sở</CardTitle>
                        <p className="text-[11px] text-muted-foreground/80">Tổng thu — Tổng chi — Lợi nhuận</p>
                      </div>
                    </div>
                    {revenueByLocation && (
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Lợi nhuận</p>
                        <p className={`text-base font-bold font-display leading-tight tabular-nums ${(revenueByLocation.totals?.profit ?? 0) >= 0 ? "text-indigo-600" : "text-rose-600"}`} data-testid="text-revenue-total-profit">
                          {(revenueByLocation.totals?.profit ?? 0).toLocaleString("vi-VN")}<span className="text-xs text-muted-foreground font-medium ml-0.5">₫</span>
                        </p>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5 pt-2">
                  {loadingRevenueByLocation ? (
                    <Skeleton className="h-[260px] w-full" />
                  ) : (revenueByLocation?.rows?.length ?? 0) === 0 ? (
                    <div className="h-[260px] flex items-center justify-center text-xs text-muted-foreground italic">
                      Chưa có dữ liệu
                    </div>
                  ) : (
                    <>
                      <div className="h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={revenueByLocation!.rows.map(r => ({
                              label: r.locationName,
                              "Tổng thu": r.totalIncome,
                              "Tổng chi": r.totalExpense,
                              "Lợi nhuận": r.profit,
                            }))}
                            margin={{ top: 10, right: 10, left: 0, bottom: 4 }}
                            barCategoryGap="20%"
                            barGap={4}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis
                              dataKey="label"
                              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                              axisLine={{ stroke: "hsl(var(--border))" }}
                              tickLine={false}
                              interval={0}
                            />
                            <YAxis
                              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(v: number) => {
                                if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
                                if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                                if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
                                return String(v);
                              }}
                            />
                            <Tooltip
                              cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                              content={({ active, payload, label }) => {
                                if (active && payload && payload.length) {
                                  return (
                                    <div className="bg-background border border-border rounded-lg px-3 py-2 shadow-lg text-xs space-y-1">
                                      <p className="font-semibold text-foreground mb-1">{label}</p>
                                      {payload.map((p: any) => (
                                        <p key={p.dataKey} className="flex items-center gap-2">
                                          <span className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
                                          <span className="text-muted-foreground">{p.dataKey}:</span>
                                          <span className="font-bold text-foreground tabular-nums ml-auto">
                                            {Number(p.value).toLocaleString("vi-VN")} ₫
                                          </span>
                                        </p>
                                      ))}
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Bar dataKey="Tổng thu"   fill="#10b981" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={1100} />
                            <Bar dataKey="Tổng chi"   fill="#f97316" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={1100} />
                            <Bar dataKey="Lợi nhuận"  fill="#6366f1" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={1100} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />Tổng thu</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500" />Tổng chi</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />Lợi nhuận</span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Công nợ khách hàng */}
              <Card className="border-none shadow-lg shadow-black/5" data-testid="card-customer-debt">
                <CardHeader className="pb-2 pt-5 px-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center">
                        <AlertCircle className="w-5 h-5 text-rose-500" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold text-muted-foreground">Công nợ khách hàng</CardTitle>
                        <p className="text-[11px] text-muted-foreground/80">Theo tình trạng thanh toán</p>
                      </div>
                    </div>
                    {customerDebt && (
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tổng nợ</p>
                        <p className="text-base font-bold font-display text-rose-600 leading-tight tabular-nums" data-testid="text-customer-debt-total">
                          {(customerDebt.totalDebtAmount ?? 0).toLocaleString("vi-VN")}<span className="text-xs text-muted-foreground font-medium ml-0.5">₫</span>
                        </p>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5 pt-3">
                  {loadingCustomerDebt ? (
                    <Skeleton className="h-[260px] w-full" />
                  ) : (customerDebt?.totalCount ?? 0) === 0 ? (
                    <div className="h-[260px] flex items-center justify-center text-xs text-muted-foreground italic">
                      Chưa có công nợ
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <HorizontalBars
                        items={(customerDebt?.byStatus ?? []).map(s => ({
                          key: s.key,
                          label: s.label,
                          value: s.count,
                          fill: s.key === "overdue" ? "#ef4444"
                              : s.key === "dueSoon" ? "#f59e0b"
                              : s.key === "inTerm"  ? "#10b981"
                              : "#94a3b8",
                          testId: `debt-status-${s.key}`,
                        }))}
                        total={customerDebt?.totalCount ?? 0}
                        testId="chart-customer-debt-bars"
                      />
                      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-border/50">
                        {(customerDebt?.byStatus ?? []).map(s => (
                          <div key={s.key} className="flex items-center justify-between text-[11px]" data-testid={`debt-amount-${s.key}`}>
                            <span className="text-muted-foreground truncate">{s.label}</span>
                            <span className="font-semibold text-foreground tabular-nums whitespace-nowrap">
                              {s.amount.toLocaleString("vi-VN")} ₫
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="bao-cao">
            {activeReport === "thu-chi" ? (
              <ThuChiReport onBack={() => setActiveReport(null)} />
            ) : activeReport === "phan-bo" ? (
              <PhanBoReport onBack={() => setActiveReport(null)} />
            ) : activeReport === "doanh-thu-lop-hoc" ? (
              <DoanhThuLopHocReport onBack={() => setActiveReport(null)} />
            ) : activeReport === "doanh-thu-nhan-su" ? (
              <DoanhThuNhanSuReport onBack={() => setActiveReport(null)} />
            ) : activeReport === "phan-bo-hoc-phi" ? (
              <PhanBoHocPhiReport onBack={() => setActiveReport(null)} />
            ) : activeReport === "thoi-gian-giang-day" ? (
              <ThoiGianGiangDayReport onBack={() => setActiveReport(null)} />
            ) : activeReport === "hoc-vien-moi" ? (
              <HocVienMoiReport onBack={() => setActiveReport(null)} />
            ) : activeReport === "chuyen-doi" ? (
              <ChuyenDoiReport onBack={() => setActiveReport(null)} />
            ) : activeReport === "lich-su-cuoc-goi" ? (
              <CallHistoryReport
                onBack={() => setActiveReport(null)}
                defaultLocationId={locationId || "all"}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
                {visibleReports.map(report => {
                  const colorMap: Record<string, { border: string; bg: string; bgHover: string; icon: string; text: string }> = {
                    emerald: { border: "hover:border-emerald-400/60", bg: "bg-emerald-500/10", bgHover: "group-hover:bg-emerald-500/20", icon: "text-emerald-600", text: "text-emerald-600" },
                    blue:    { border: "hover:border-blue-400/60",    bg: "bg-blue-500/10",    bgHover: "group-hover:bg-blue-500/20",    icon: "text-blue-600",    text: "text-blue-600" },
                    violet:  { border: "hover:border-violet-400/60",  bg: "bg-violet-500/10",  bgHover: "group-hover:bg-violet-500/20",  icon: "text-violet-600",  text: "text-violet-600" },
                    orange:  { border: "hover:border-orange-400/60",  bg: "bg-orange-500/10",  bgHover: "group-hover:bg-orange-500/20",  icon: "text-orange-600",  text: "text-orange-600" },
                    red:     { border: "hover:border-red-400/60",     bg: "bg-red-500/10",     bgHover: "group-hover:bg-red-500/20",     icon: "text-red-600",     text: "text-red-600" },
                    amber:   { border: "hover:border-amber-400/60",   bg: "bg-amber-500/10",   bgHover: "group-hover:bg-amber-500/20",   icon: "text-amber-600",   text: "text-amber-600" },
                    cyan:    { border: "hover:border-cyan-400/60",    bg: "bg-cyan-500/10",    bgHover: "group-hover:bg-cyan-500/20",    icon: "text-cyan-600",    text: "text-cyan-600" },
                    sky:     { border: "hover:border-sky-400/60",     bg: "bg-sky-500/10",     bgHover: "group-hover:bg-sky-500/20",     icon: "text-sky-600",     text: "text-sky-600" },
                    indigo:  { border: "hover:border-indigo-400/60",  bg: "bg-indigo-500/10",  bgHover: "group-hover:bg-indigo-500/20",  icon: "text-indigo-600",  text: "text-indigo-600" },
                  };
                  const c = colorMap[report.color] ?? colorMap.emerald;
                  const ReportIcon = (report.value === "hoc-vien-moi") ? UserPlus
                    : (report.value === "chuyen-doi") ? TrendingUp
                    : (report.value === "lich-su-cuoc-goi") ? PhoneCall
                    : FileText;
                  return (
                    <div
                      key={report.value}
                      className={`border border-border rounded-xl p-5 bg-card shadow-sm hover:shadow-md ${c.border} transition-all cursor-pointer group`}
                      onClick={() => setActiveReport(report.value)}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center shrink-0 ${c.bgHover} transition-colors`}>
                          <ReportIcon className={`w-5 h-5 ${c.icon}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground leading-snug">{report.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{report.desc}</p>
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between">
                        <span className={`text-[11px] ${c.text} font-medium`}>Xem báo cáo</span>
                        <span className={`text-[11px] ${c.text} font-medium opacity-0 group-hover:opacity-100 transition-opacity`}>→</span>
                      </div>
                    </div>
                  );
                })}
                {visibleReports.length === 0 && (
                  <div className="col-span-full py-10 text-center text-sm text-muted-foreground italic">
                    Bạn không có quyền xem báo cáo nào.
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
