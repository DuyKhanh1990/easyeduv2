import { useState } from "react";
import { Users, UserCheck, GraduationCap, TrendingUp, BookOpen, Activity, UserPlus, CheckCircle2, XCircle, BookOpenCheck, Clock, PauseCircle, CalendarClock, UserX, Network, Megaphone, Building2, UserSquare2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useQuery } from "@tanstack/react-query";
import { useLocationFilter } from "@/hooks/use-location-filter";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  ComposedChart, Line, PieChart, Pie, FunnelChart, Funnel, LabelList
} from "recharts";

const stats = [
  { title: "Tổng Học Viên", value: "2,543", change: "+12%", icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
  { title: "Học Viên Đang Học", value: "1,892", change: "+5%", icon: UserCheck, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { title: "Lớp Học Đang Mở", value: "145", change: "0%", icon: GraduationCap, color: "text-violet-500", bg: "bg-violet-500/10" },
  { title: "Doanh Thu Tháng", value: "1.2 Tỷ", change: "+18%", icon: TrendingUp, color: "text-amber-500", bg: "bg-amber-500/10" },
];

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

const MONTHS_OPTIONS = [
  { value: "1", label: "Tháng này" },
  { value: "3", label: "3 tháng gần đây" },
  { value: "6", label: "6 tháng gần đây" },
  { value: "12", label: "12 tháng gần đây" },
];

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
          <span className="text-muted-foreground truncate">Học viên</span>
          <span className="ml-auto font-semibold text-foreground whitespace-nowrap" data-testid="text-hoc-vien">
            {hocVien} <span className="text-muted-foreground font-normal">({hocVienPct}%)</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: "#8b5cf6" }} />
          <span className="text-muted-foreground truncate">Phụ huynh</span>
          <span className="ml-auto font-semibold text-foreground whitespace-nowrap" data-testid="text-phu-huynh">
            {phuHuynh} <span className="text-muted-foreground font-normal">({phuHuynhPct}%)</span>
          </span>
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
          <span className="text-muted-foreground truncate">Hoạt động</span>
          <span className="ml-auto font-semibold text-foreground whitespace-nowrap" data-testid="text-active-accounts">
            {active} <span className="text-muted-foreground font-normal">({activePct}%)</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-sm bg-muted shrink-0" />
          <span className="text-muted-foreground truncate">Không HĐ</span>
          <span className="ml-auto font-semibold text-foreground whitespace-nowrap" data-testid="text-inactive-accounts">
            {inactive} <span className="text-muted-foreground font-normal">({inactivePct}%)</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Card 3: Trạng thái học tập — funnel chart ─────────────────────────────────
function LearningStatusFunnel({
  dangHoc, choLich, baoLuu, daNghi, chuaCoLich, total,
}: { dangHoc: number; choLich: number; baoLuu: number; daNghi: number; chuaCoLich: number; total: number }) {
  const safeTotal = Math.max(total, 1);
  const pct = (n: number) => Math.round((n / safeTotal) * 100);
  // Funnel needs values in descending order to render the classic pyramid.
  // We sort by count so it always renders cleanly regardless of which status
  // happens to be largest in this center.
  const items = [
    { key: "dangHoc",    label: "Đang học",     value: dangHoc,    fill: "#8b5cf6", testId: "status-dang-hoc" },
    { key: "choLich",    label: "Chờ đến lịch", value: choLich,    fill: "#3b82f6", testId: "status-cho-lich" },
    { key: "baoLuu",     label: "Bảo lưu",      value: baoLuu,     fill: "#f59e0b", testId: "status-bao-luu" },
    { key: "daNghi",     label: "Đã nghỉ",      value: daNghi,     fill: "#f43f5e", testId: "status-da-nghi" },
    { key: "chuaCoLich", label: "Chưa có lịch", value: chuaCoLich, fill: "#94a3b8", testId: "status-chua-co-lich" },
  ];
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const hasData = sorted.some((s) => s.value > 0);
  // Funnel needs strictly positive values to render trapezoids, so when a
  // segment is zero we substitute a tiny sliver and remember the real value.
  const funnelData = sorted.map((s) => ({
    name: s.label,
    value: s.value > 0 ? s.value : 0.001,
    realValue: s.value,
    fill: s.fill,
  }));
  return (
    <div data-testid="chart-learning-funnel">
      <div className="w-full h-[140px]">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <FunnelChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
              <Tooltip
                content={({ active, payload }: any) =>
                  active && payload?.length ? (
                    <div className="bg-background border border-border rounded-lg px-3 py-2 shadow-lg text-sm">
                      <p className="font-semibold text-foreground mb-1">{payload[0].payload.name}</p>
                      <p className="text-muted-foreground">
                        Học viên: <span className="font-bold text-foreground">{payload[0].payload.realValue}</span>
                      </p>
                      <p className="text-muted-foreground">
                        Tỷ lệ: <span className="font-bold text-emerald-500">{pct(payload[0].payload.realValue)}%</span>
                      </p>
                    </div>
                  ) : null
                }
              />
              <Funnel
                dataKey="value"
                data={funnelData}
                isAnimationActive
                animationBegin={100}
                animationDuration={1100}
                stroke="hsl(var(--background))"
                strokeWidth={2}
              >
                <LabelList
                  position="center"
                  fill="#fff"
                  stroke="none"
                  fontSize={12}
                  fontWeight={700}
                  dataKey="realValue"
                />
                <LabelList
                  position="right"
                  fill="hsl(var(--muted-foreground))"
                  stroke="none"
                  fontSize={10}
                  dataKey="name"
                />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground/50 gap-1.5">
            <BookOpenCheck className="w-6 h-6" />
            <p className="text-xs">Chưa có dữ liệu</p>
          </div>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        {items.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: s.fill }} />
            <span className="text-muted-foreground truncate">{s.label}</span>
            <span className="ml-auto font-semibold text-foreground" data-testid={s.testId}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Dashboard() {
  const { locationId } = useLocationFilter();
  const [chartMonths, setChartMonths] = useState("1");

  const locationParam = locationId && locationId !== "all" ? `?locationId=${locationId}` : "";
  const monthsParam = chartMonths ? `months=${chartMonths}` : "";
  const chartParam = locationParam
    ? `${locationParam}&${monthsParam}`
    : `?${monthsParam}`;

  const { data: customerSummary, isLoading: loadingCustomer } = useQuery<{
    total: number;
    hocVien: number;
    hocVienPct: number;
    phuHuynh: number;
    phuHuynhPct: number;
    active: number;
    activePct: number;
    inactive: number;
  }>({ queryKey: ["/api/students/customer-summary", locationId], queryFn: () =>
    fetch(`/api/students/customer-summary${locationParam}`, { credentials: "include" }).then(r => r.json())
  });

  const { data: learningStatus, isLoading: loadingStatus } = useQuery<{
    dangHoc: number; baoLuu: number; choLich: number; daNghi: number; chuaCoLich: number; total: number;
  }>({ queryKey: ["/api/students/learning-status-summary", locationId], queryFn: () =>
    fetch(`/api/students/learning-status-summary${locationParam}`, { credentials: "include" }).then(r => r.json())
  });

  const { data: newCustomers, isLoading: loadingNewCustomers } = useQuery<{
    today: number;
    thisMonth: number;
  }>({ queryKey: ["/api/students/new-customers-summary", locationId], queryFn: () =>
    fetch(`/api/students/new-customers-summary${locationParam}`, { credentials: "include" }).then(r => r.json())
  });

  const { data: bySource, isLoading: loadingBySource } = useQuery<{ name: string; count: number; pct: number }[]>({
    queryKey: ["/api/students/by-source", locationId, chartMonths],
    queryFn: () => fetch(`/api/students/by-source${chartParam}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: byRelationship, isLoading: loadingByRelationship } = useQuery<{ name: string; count: number; color?: string }[]>({
    queryKey: ["/api/students/by-relationship", locationId, chartMonths],
    queryFn: () => fetch(`/api/students/by-relationship${chartParam}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: byLocation, isLoading: loadingByLocation } = useQuery<{ name: string; count: number; pct: number }[]>({
    queryKey: ["/api/students/by-location", locationId, chartMonths],
    queryFn: () => fetch(`/api/students/by-location${chartParam}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: byStaff, isLoading: loadingByStaff } = useQuery<{ name: string; count: number; pct: number }[]>({
    queryKey: ["/api/students/by-staff", locationId, chartMonths],
    queryFn: () => fetch(`/api/students/by-staff${chartParam}`, { credentials: "include" }).then(r => r.json()),
  });

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
        <div>
          <h1 className="text-3xl font-bold text-foreground font-display">Tổng quan hệ thống</h1>
          <p className="text-muted-foreground mt-1">Cập nhật tình hình hoạt động của các cơ sở hôm nay.</p>
        </div>

        <Tabs defaultValue="khach-hang">
          <TabsList>
            <TabsTrigger value="khach-hang" data-testid="tab-khach-hang">KHÁCH HÀNG</TabsTrigger>
            <TabsTrigger value="dao-tao" data-testid="tab-dao-tao">ĐÀO TẠO</TabsTrigger>
            <TabsTrigger value="tai-chinh" data-testid="tab-tai-chinh">TÀI CHÍNH</TabsTrigger>
          </TabsList>
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

              {/* Card 3: Trạng thái học tập — Funnel */}
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
                    <LearningStatusFunnel
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

            </div>

            {/* Charts section */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-muted-foreground">Phân tích học viên</h3>
                <Select value={chartMonths} onValueChange={setChartMonths}>
                  <SelectTrigger className="w-44 h-8 text-xs" data-testid="select-chart-months">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Khách hàng mới */}
                <Card className="border-none shadow-lg shadow-black/5" data-testid="card-khach-hang-moi">
                  <CardHeader className="pb-2 pt-5 px-5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
                        <UserPlus className="w-4 h-4 text-amber-500" />
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
          <TabsContent value="dao-tao" />
          <TabsContent value="tai-chinh" />
        </Tabs>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, i) => (
            <Card key={i} className="border-none shadow-lg shadow-black/5 hover:-translate-y-1 transition-transform duration-300">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${stat.bg}`}>
                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                  <span className={`text-sm font-semibold ${stat.change.startsWith('+') ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                    {stat.change}
                  </span>
                </div>
                <div className="mt-6">
                  <h3 className="text-muted-foreground font-medium text-sm">{stat.title}</h3>
                  <p className="text-3xl font-bold font-display mt-1 text-foreground">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="col-span-1 lg:col-span-2 border-none shadow-lg shadow-black/5">
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle className="text-lg font-display flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Biểu đồ Tăng trưởng
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 h-[300px] flex items-center justify-center text-muted-foreground border-dashed border-2 border-border/50 rounded-xl m-6 bg-muted/20">
              <div className="text-center">
                <Activity className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
                <p>Khu vực hiển thị biểu đồ</p>
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-1 border-none shadow-lg shadow-black/5">
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle className="text-lg font-display flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                Lịch học sắp tới
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/50">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="p-4 hover:bg-muted/50 transition-colors flex items-start gap-4">
                    <div className="w-12 h-12 bg-primary/5 rounded-xl flex flex-col items-center justify-center text-primary flex-shrink-0">
                      <span className="text-xs font-semibold">T2</span>
                      <span className="text-lg font-bold leading-tight">15</span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">Lớp Tiếng Anh Giao Tiếp {i}</h4>
                      <p className="text-sm text-muted-foreground mt-0.5">18:00 - 19:30 • Cơ sở Quận 1</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
