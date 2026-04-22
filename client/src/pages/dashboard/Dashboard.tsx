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
  ComposedChart, Line
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

  const { data: bySource, isLoading: loadingBySource } = useQuery<{ name: string; count: number }[]>({
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mt-4">

              {/* Card 1: Tổng Khách hàng */}
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
                      <Skeleton className="h-8 w-20 mb-3" />
                      {[1,2].map(i => <Skeleton key={i} className="h-4 w-full" />)}
                    </div>
                  ) : (
                    <>
                      <p className="text-3xl font-bold font-display text-foreground mb-3" data-testid="text-total-customers">
                        {customerSummary?.total ?? 0}
                      </p>
                      <div className="space-y-2 text-sm">
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground flex items-center gap-1.5"><UserCheck className="w-3.5 h-3.5" /> Học viên</span>
                            <span className="font-semibold text-foreground" data-testid="text-hoc-vien">
                              {customerSummary?.hocVien ?? 0}{" "}
                              <span className="text-blue-500 font-normal">({customerSummary?.hocVienPct ?? 0}%)</span>
                            </span>
                          </div>
                          <MiniBar pct={customerSummary?.hocVienPct ?? 0} colorClass="bg-blue-500" />
                        </div>
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Phụ huynh</span>
                            <span className="font-semibold text-foreground" data-testid="text-phu-huynh">
                              {customerSummary?.phuHuynh ?? 0}{" "}
                              <span className="text-violet-500 font-normal">({customerSummary?.phuHuynhPct ?? 0}%)</span>
                            </span>
                          </div>
                          <MiniBar pct={customerSummary?.phuHuynhPct ?? 0} colorClass="bg-violet-500" />
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Card 2: Trạng thái tài khoản */}
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
                      {[1,2].map(i => <Skeleton key={i} className="h-4 w-full" />)}
                    </div>
                  ) : (
                    <div className="space-y-2 text-sm mt-1">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Hoạt động
                          </span>
                          <span className="font-semibold text-foreground" data-testid="text-active-accounts">
                            {customerSummary?.active ?? 0}{" "}
                            <span className="text-emerald-500 font-normal">({activePct}%)</span>
                          </span>
                        </div>
                        <MiniBar pct={activePct} colorClass="bg-emerald-500" />
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <XCircle className="w-3.5 h-3.5 text-rose-400" /> Không hoạt động
                          </span>
                          <span className="font-semibold text-foreground" data-testid="text-inactive-accounts">
                            {customerSummary?.inactive ?? 0}{" "}
                            <span className="text-rose-400 font-normal">({inactivePct}%)</span>
                          </span>
                        </div>
                        <MiniBar pct={inactivePct} colorClass="bg-rose-400" />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Card 3: Trạng thái học tập */}
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
                      {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-4 w-full" />)}
                    </div>
                  ) : (
                    <div className="space-y-2 text-sm mt-1">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1.5"><BookOpenCheck className="w-3.5 h-3.5 text-violet-500" /> Đang học</span>
                          <span className="font-semibold text-violet-600" data-testid="status-dang-hoc">{learningStatus?.dangHoc ?? 0}</span>
                        </div>
                        <MiniBar pct={pct(learningStatus?.dangHoc ?? 0)} colorClass="bg-violet-500" />
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5 text-blue-500" /> Chờ đến lịch</span>
                          <span className="font-semibold text-blue-600" data-testid="status-cho-lich">{learningStatus?.choLich ?? 0}</span>
                        </div>
                        <MiniBar pct={pct(learningStatus?.choLich ?? 0)} colorClass="bg-blue-500" />
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1.5"><PauseCircle className="w-3.5 h-3.5 text-amber-500" /> Bảo lưu</span>
                          <span className="font-semibold text-amber-600" data-testid="status-bao-luu">{learningStatus?.baoLuu ?? 0}</span>
                        </div>
                        <MiniBar pct={pct(learningStatus?.baoLuu ?? 0)} colorClass="bg-amber-500" />
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1.5"><UserX className="w-3.5 h-3.5 text-rose-400" /> Đã nghỉ</span>
                          <span className="font-semibold text-rose-500" data-testid="status-da-nghi">{learningStatus?.daNghi ?? 0}</span>
                        </div>
                        <MiniBar pct={pct(learningStatus?.daNghi ?? 0)} colorClass="bg-rose-400" />
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-muted-foreground" /> Chưa có lịch</span>
                          <span className="font-semibold text-muted-foreground" data-testid="status-chua-co-lich">{learningStatus?.chuaCoLich ?? 0}</span>
                        </div>
                        <MiniBar pct={pct(learningStatus?.chuaCoLich ?? 0)} colorClass="bg-slate-400" />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Card 4: Khách hàng mới */}
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
                    <div className="space-y-2 mt-1">
                      <Skeleton className="h-8 w-20 mb-3" />
                      {[1,2].map(i => <Skeleton key={i} className="h-4 w-full" />)}
                    </div>
                  ) : (
                    <>
                      <p className="text-3xl font-bold font-display text-foreground mb-3" data-testid="text-new-today">
                        {newCustomers?.today ?? 0}
                      </p>
                      <div className="space-y-2 text-sm">
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Hôm nay</span>
                            <span className="font-semibold text-amber-500" data-testid="text-new-today-count">
                              +{newCustomers?.today ?? 0}
                            </span>
                          </div>
                          <MiniBar
                            pct={(newCustomers?.thisMonth ?? 0) > 0
                              ? Math.round(((newCustomers?.today ?? 0) / (newCustomers?.thisMonth ?? 1)) * 100)
                              : 0}
                            colorClass="bg-amber-500"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Tháng này</span>
                            <span className="font-semibold text-amber-400" data-testid="text-new-month-count">
                              +{newCustomers?.thisMonth ?? 0}
                            </span>
                          </div>
                          <MiniBar pct={100} colorClass="bg-amber-400" />
                        </div>
                      </div>
                    </>
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

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left: by Source */}
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
                        <BarChart data={bySource} margin={{ top: 8, right: 8, left: -20, bottom: 4 }}>
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
                            {(bySource || []).map((_, idx) => (
                              <Cell key={idx} fill={SOURCE_COLORS[idx % SOURCE_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
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
