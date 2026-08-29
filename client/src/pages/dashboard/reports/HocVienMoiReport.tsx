import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  ArrowLeft, CalendarIcon, Download, Eye, X, SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { downloadXlsx } from "@/lib/excel-utils";

interface Props {
  onBack: () => void;
}

interface StaffRef {
  code: string;
  fullName: string;
}

interface ParentRef {
  id: string;
  code: string | null;
  fullName: string | null;
}

interface ClassDetail {
  className: string;
  startDate: string | null;
  endDate: string | null;
  totalSessions: number;
  attendedSessions: number;
  remainingSessions: number;
}

interface NewStudentRow {
  id: string;
  code: string;
  fullName: string;
  type: string | null;
  location: { name: string } | null;
  relationshipList: string[];
  sourceList: string[];
  parents: ParentRef[];
  teacherList: StaffRef[];
  salesByList: StaffRef[];
  managedByList: StaffRef[];
  classDetails: ClassDetail[];
  createdAt: string;
  socialLink: string | null;
}

function defaultCurrentMonth() {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
  };
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return format(new Date(d), "yyyy-MM-dd HH:mm");
  } catch {
    return String(d);
  }
}

function ClassDetailsCell({ details }: { details: ClassDetail[] }) {
  if (!details || details.length === 0) return <span className="text-muted-foreground">-</span>;
  return (
    <div className="flex flex-col gap-1 min-w-[220px]">
      {details.map((detail, idx) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const start = detail.startDate ? new Date(detail.startDate) : null;
        const end = detail.endDate ? new Date(detail.endDate) : null;
        let computedLabel: string;
        let statusColor: string;
        if (!start && !end) {
          computedLabel = "waiting";
          statusColor = "bg-gray-100 text-gray-800";
        } else if (start && today < start) {
          computedLabel = "Chờ đến lịch";
          statusColor = "bg-purple-100 text-purple-800";
        } else if (end && today > end) {
          computedLabel = "Đã kết thúc";
          statusColor = "bg-red-100 text-red-800";
        } else {
          computedLabel = "Đang học";
          statusColor = "bg-green-100 text-green-800";
        }
        return (
          <TooltipProvider key={idx}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-xs flex items-center gap-1.5 cursor-help hover:opacity-75 transition-opacity">
                  <span className="font-semibold">{detail.className}</span>
                  <Badge variant="outline" className={`border-none text-[10px] px-1.5 h-4 ${statusColor}`}>
                    {computedLabel}
                  </Badge>
                  <span className="text-gray-600 whitespace-nowrap">
                    <span className="text-blue-700 font-semibold">{detail.totalSessions}</span>
                    {" | "}
                    <span className="text-green-700 font-semibold">{detail.attendedSessions}</span>
                    {" | "}
                    <span className="text-orange-600 font-semibold">{detail.remainingSessions}</span>
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="bg-slate-900 text-white text-xs p-2">
                <div className="font-semibold">{detail.className} — {computedLabel}</div>
                <div className="mt-1 space-y-0.5">
                  <div>Tổng: <span className="text-blue-300">{detail.totalSessions}</span></div>
                  <div>Đã học: <span className="text-green-300">{detail.attendedSessions}</span></div>
                  <div>Còn lại: <span className="text-orange-300">{detail.remainingSessions}</span></div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}

export function HocVienMoiReport({ onBack }: Props) {
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>(defaultCurrentMonth);
  const [calOpen, setCalOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterLocation, setFilterLocation] = useState("all");
  const [filterRelationship, setFilterRelationship] = useState("all");
  const [filterSales, setFilterSales] = useState("all");
  const [filterManager, setFilterManager] = useState("all");

  const [applied, setApplied] = useState<{
    search: string;
    locationId: string;
    relationshipName: string;
    salesId: string;
    managerId: string;
    dateFrom?: string;
    dateTo?: string;
  }>(() => {
    const def = defaultCurrentMonth();
    return {
      search: "",
      locationId: "all",
      relationshipName: "all",
      salesId: "all",
      managerId: "all",
      dateFrom: format(def.from, "yyyy-MM-dd"),
      dateTo: format(def.to, "yyyy-MM-dd"),
    };
  });

  const dateLabel = dateRange.from && dateRange.to
    ? `${format(dateRange.from, "d MMMM, yyyy", { locale: vi })} - ${format(dateRange.to, "d MMMM, yyyy", { locale: vi })}`
    : dateRange.from
      ? `Từ ${format(dateRange.from, "d/M/yyyy")}`
      : "Chọn khoảng thời gian";

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (applied.search) p.set("search", applied.search);
    if (applied.locationId !== "all") p.set("locationId", applied.locationId);
    if (applied.relationshipName !== "all") p.set("relationshipName", applied.relationshipName);
    if (applied.salesId !== "all") p.set("salesIds", applied.salesId);
    if (applied.managerId !== "all") p.set("managerIds", applied.managerId);
    if (applied.dateFrom) p.set("dateFrom", applied.dateFrom);
    if (applied.dateTo) p.set("dateTo", applied.dateTo);
    return p.toString();
  }, [applied]);

  const { data: reportData, isLoading, isFetching, refetch } = useQuery<{ data: NewStudentRow[]; total: number }>({
    queryKey: ["/api/students/new-students-report", qs],
    queryFn: async () => {
      const res = await fetch(`/api/students/new-students-report?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load report");
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: locationsData = [] } = useQuery<any[]>({
    queryKey: ["/api/locations"],
    queryFn: async () => {
      const res = await fetch("/api/locations", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 120_000,
  });

  const { data: relationshipsData = [] } = useQuery<any[]>({
    queryKey: ["/api/crm/relationships"],
    queryFn: async () => {
      const res = await fetch("/api/crm/relationships", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 120_000,
  });

  const { data: staffData = [] } = useQuery<any[]>({
    queryKey: ["/api/staff", "minimal"],
    queryFn: async () => {
      const res = await fetch("/api/staff?minimal=true", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 120_000,
  });

  const rows = reportData?.data ?? [];

  function handleApply() {
    const nextApplied = {
      search,
      locationId: filterLocation,
      relationshipName: filterRelationship,
      salesId: filterSales,
      managerId: filterManager,
      dateFrom: dateRange.from ? format(dateRange.from, "yyyy-MM-dd") : undefined,
      dateTo: dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : undefined,
    };
    const hasChanges = Object.keys(nextApplied).some(
      key => nextApplied[key as keyof typeof nextApplied] !== applied[key as keyof typeof applied],
    );
    setApplied(nextApplied);
    if (!hasChanges) void refetch();
  }

  function handleReset() {
    const def = defaultCurrentMonth();
    setSearch("");
    setFilterLocation("all");
    setFilterRelationship("all");
    setFilterSales("all");
    setFilterManager("all");
    setDateRange(def);
    setApplied({
      search: "",
      locationId: "all",
      relationshipName: "all",
      salesId: "all",
      managerId: "all",
      dateFrom: format(def.from, "yyyy-MM-dd"),
      dateTo: format(def.to, "yyyy-MM-dd"),
    });
  }

  function handleDownload() {
    const appliedDateLabel = applied.dateFrom && applied.dateTo
      ? `${applied.dateFrom} → ${applied.dateTo}`
      : "Tất cả";

    const dataRows = rows.map((r, i) => [
      i + 1,
      r.code ?? "",
      r.fullName ?? "",
      r.relationshipList.join(", ") || "",
      r.sourceList.join(", ") || "",
      r.parents.map(p => [p.code, p.fullName].filter(Boolean).join(" ")).join(", ") || "",
      r.teacherList.map(t => `${t.code} - ${t.fullName}`).join(", ") || "",
      r.salesByList.map(t => `${t.code} - ${t.fullName}`).join(", ") || "",
      r.managedByList.map(t => `${t.code} - ${t.fullName}`).join(", ") || "",
      r.classDetails.map(c => c.className).join(", ") || "",
      fmtDate(r.createdAt),
      r.socialLink ?? "",
    ]);

    downloadXlsx({
      filename: `bao-cao-hoc-vien-moi-${applied.dateFrom ?? "all"}`,
      sheetName: "Học viên mới",
      title: "Báo cáo Học viên mới",
      subtitle: `Ngày tạo: ${appliedDateLabel}`,
      columns: [
        { header: "STT",                  width: 5  },
        { header: "Mã học viên",          width: 14 },
        { header: "Họ và tên",            width: 26 },
        { header: "Mối quan hệ",          width: 16 },
        { header: "Nguồn khách hàng",     width: 18 },
        { header: "Phụ huynh",            width: 26 },
        { header: "Giáo viên phụ trách",  width: 28 },
        { header: "Sales reference",      width: 28 },
        { header: "Managers reference",   width: 28 },
        { header: "Lớp học",              width: 32 },
        { header: "Ngày tạo",             width: 20 },
        { header: "Facebook",             width: 30 },
      ],
      rows: dataRows,
    });
  }

  const loading = isLoading || isFetching;

  return (
    <div className="space-y-4 mt-2">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-base font-semibold">Báo cáo Học viên mới</h2>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Input
            placeholder="Tìm theo tên, mã học viên..."
            className="h-9 text-sm pl-3 pr-3"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleApply()}
          />
        </div>

        {/* Date range */}
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9 justify-start gap-2 text-sm font-normal whitespace-nowrap">
              <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
              <span>{dateLabel}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="range"
              selected={{ from: dateRange.from, to: dateRange.to }}
              onSelect={r => {
                setDateRange({ from: r?.from, to: r?.to });
                if (r?.from && r?.to) setCalOpen(false);
              }}
              locale={vi}
              numberOfMonths={2}
              initialFocus
            />
            <div className="flex justify-between gap-2 p-2 border-t">
              <Button
                variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
                onClick={() => { setDateRange({}); setCalOpen(false); }}
              >
                <X className="h-3 w-3 mr-1" /> Xoá
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={() => setCalOpen(false)}>Xong</Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Bộ lọc popover */}
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9 gap-2 text-sm font-normal relative">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Bộ lọc
              {(filterLocation !== "all" || filterRelationship !== "all" || filterSales !== "all" || filterManager !== "all") && (
                <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-bold">
                  {[filterLocation, filterRelationship, filterSales, filterManager].filter(v => v !== "all").length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Bộ lọc</span>
              <Button
                variant="ghost" size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground px-2"
                onClick={() => {
                  setFilterLocation("all");
                  setFilterRelationship("all");
                  setFilterSales("all");
                  setFilterManager("all");
                }}
              >
                <X className="h-3 w-3 mr-1" /> Xoá bộ lọc
              </Button>
            </div>
            <Separator />

            {/* Cơ sở */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Cơ sở</label>
              <Select value={filterLocation} onValueChange={setFilterLocation}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Cơ sở" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả cơ sở</SelectItem>
                  {locationsData.map((loc: any) => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Mối quan hệ */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Mối quan hệ</label>
              <Select value={filterRelationship} onValueChange={setFilterRelationship}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Mối quan hệ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  {relationshipsData.filter((r: any) => !r.isParentGroup).map((r: any) => (
                    <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Nhân viên kinh doanh */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Nhân viên kinh doanh</label>
              <Select value={filterSales} onValueChange={setFilterSales}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Nhân viên kinh doanh" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  {[...staffData].sort((a: any, b: any) => {
                    const aActive = a.status !== "Không hoạt động";
                    const bActive = b.status !== "Không hoạt động";
                    if (aActive === bActive) return 0;
                    return aActive ? -1 : 1;
                  }).map((s: any) => {
                    const isInactive = s.status === "Không hoạt động";
                    return (
                      <SelectItem key={s.id} value={s.id} disabled={isInactive} className={isInactive ? "opacity-40" : ""}>
                        <span className="flex items-center gap-1.5">
                          <span>{s.code} - {s.fullName}</span>
                          {isInactive && <span className="text-amber-500 text-[10px] font-medium">⚠ Không hoạt động</span>}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Quản lý */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Quản lý</label>
              <Select value={filterManager} onValueChange={setFilterManager}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Quản lý" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  {[...staffData].sort((a: any, b: any) => {
                    const aActive = a.status !== "Không hoạt động";
                    const bActive = b.status !== "Không hoạt động";
                    if (aActive === bActive) return 0;
                    return aActive ? -1 : 1;
                  }).map((s: any) => {
                    const isInactive = s.status === "Không hoạt động";
                    return (
                      <SelectItem key={s.id} value={s.id} disabled={isInactive} className={isInactive ? "opacity-40" : ""}>
                        <span className="flex items-center gap-1.5">
                          <span>{s.code} - {s.fullName}</span>
                          {isInactive && <span className="text-amber-500 text-[10px] font-medium">⚠ Không hoạt động</span>}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="pt-1">
              <Button
                className="w-full h-9 bg-[#1e3a5f] hover:bg-[#16305a] text-sm gap-1.5"
                disabled={loading}
                onClick={() => { handleApply(); setFilterOpen(false); }}
              >
                <Eye className="h-3.5 w-3.5" />
                Xem báo cáo
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Tải xuống */}
        <Button variant="outline" className="h-9 gap-2 text-sm font-normal" onClick={handleDownload}>
          <Download className="h-3.5 w-3.5" />
          Tải xuống
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#1e3a5f] hover:bg-[#1e3a5f]">
                <TableHead className="text-white font-semibold text-center w-12">STT</TableHead>
                <TableHead className="text-white font-semibold min-w-[180px]">Họ và tên</TableHead>
                <TableHead className="text-white font-semibold min-w-[120px]">Mối quan hệ</TableHead>
                <TableHead className="text-white font-semibold min-w-[140px]">Nguồn khách hàng</TableHead>
                <TableHead className="text-white font-semibold min-w-[160px]">Phụ huynh</TableHead>
                <TableHead className="text-white font-semibold min-w-[160px]">Giáo viên phụ trách</TableHead>
                <TableHead className="text-white font-semibold min-w-[180px]">Sales reference</TableHead>
                <TableHead className="text-white font-semibold min-w-[200px]">Managers reference</TableHead>
                <TableHead className="text-white font-semibold min-w-[240px]">Lớp học</TableHead>
                <TableHead className="text-white font-semibold min-w-[140px]">Ngày tạo</TableHead>
                <TableHead className="text-white font-semibold min-w-[140px]">Facebook</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Total row */}
              {!loading && (
                <TableRow className="bg-muted/40 border-b-2">
                  <TableCell className="text-center font-semibold text-sm">Tổng cộng</TableCell>
                  <TableCell colSpan={10} className="font-semibold text-sm text-right pr-4">
                    {rows.length}
                  </TableCell>
                </TableRow>
              )}

              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 11 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-12 text-muted-foreground text-sm">
                    Không có dữ liệu. Điều chỉnh bộ lọc và nhấn <strong>Xem báo cáo</strong>.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r, idx) => (
                  <TableRow key={r.id} className="hover:bg-muted/40 align-top">
                    <TableCell className="text-center text-sm text-muted-foreground">{idx + 1}</TableCell>

                    {/* Họ và tên */}
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-blue-600 font-medium">{r.code}</span>
                        <span className="text-sm font-medium">{r.fullName ?? "—"}</span>
                      </div>
                    </TableCell>

                    {/* Mối quan hệ */}
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.relationshipList.length > 0
                          ? r.relationshipList.map((rel, i) => (
                            <Badge key={i} variant="outline" className="text-[10px] px-1.5 h-5 border-none bg-blue-50 text-blue-700">
                              {rel}
                            </Badge>
                          ))
                          : <span className="text-muted-foreground text-xs">—</span>
                        }
                      </div>
                    </TableCell>

                    {/* Nguồn khách hàng */}
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.sourceList.length > 0
                          ? r.sourceList.map((src, i) => (
                            <Badge key={i} variant="outline" className="text-[10px] px-1.5 h-5 border-none bg-emerald-50 text-emerald-700">
                              {src}
                            </Badge>
                          ))
                          : <span className="text-muted-foreground text-xs">—</span>
                        }
                      </div>
                    </TableCell>

                    {/* Phụ huynh */}
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        {r.parents.length > 0
                          ? r.parents.map((p, i) => (
                            <div key={i} className="text-xs">
                              <span className="text-blue-600 font-medium">{p.code}</span>
                              {" — "}
                              <span>{p.fullName}</span>
                            </div>
                          ))
                          : <span className="text-muted-foreground text-xs">—</span>
                        }
                      </div>
                    </TableCell>

                    {/* Giáo viên phụ trách */}
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        {r.teacherList.length > 0
                          ? r.teacherList.map((t, i) => (
                            <span key={i} className="text-xs">{t.code} - {t.fullName}</span>
                          ))
                          : <span className="text-muted-foreground text-xs">—</span>
                        }
                      </div>
                    </TableCell>

                    {/* Sales reference */}
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        {r.salesByList.length > 0
                          ? r.salesByList.map((t, i) => (
                            <span key={i} className="text-xs">{t.code} - {t.fullName}</span>
                          ))
                          : <span className="text-muted-foreground text-xs">—</span>
                        }
                      </div>
                    </TableCell>

                    {/* Managers reference */}
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        {r.managedByList.length > 0
                          ? r.managedByList.map((t, i) => (
                            <span key={i} className="text-xs">{t.code} - {t.fullName}</span>
                          ))
                          : <span className="text-muted-foreground text-xs">—</span>
                        }
                      </div>
                    </TableCell>

                    {/* Lớp học */}
                    <TableCell>
                      <ClassDetailsCell details={r.classDetails} />
                    </TableCell>

                    {/* Ngày tạo */}
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {fmtDate(r.createdAt)}
                    </TableCell>

                    {/* Facebook */}
                    <TableCell>
                      {r.socialLink ? (
                        <a
                          href={r.socialLink.startsWith("http") ? r.socialLink : `https://${r.socialLink}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline truncate max-w-[130px] block"
                        >
                          {r.socialLink}
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
