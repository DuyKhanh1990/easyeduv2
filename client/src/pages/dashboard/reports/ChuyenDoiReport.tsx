import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { vi } from "date-fns/locale";
import {
  ArrowLeft, CalendarIcon, Download, X, SlidersHorizontal, Users, ChevronDown, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { downloadXlsx } from "@/lib/excel-utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  onBack: () => void;
}

interface StudentRef {
  id: string;
  code: string;
  fullName: string;
}

interface TransitionGroup {
  fromRelationshipName: string | null;
  count: number;
  students: StudentRef[];
}

interface RelGroup {
  toRelationshipName: string;
  totalCount: number;
  pct: number;
  transitions: TransitionGroup[];
}

interface ReportData {
  total: number;
  allStudents: StudentRef[];
  groups: RelGroup[];
}

function defaultCurrentMonth() {
  const now = new Date();
  return {
    from: startOfMonth(now),
    to: endOfMonth(now),
  };
}

export function ChuyenDoiReport({ onBack }: Props) {
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>(defaultCurrentMonth);
  const [calOpen, setCalOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterLocation, setFilterLocation] = useState("all");
  const [filterSales, setFilterSales] = useState("all");
  const [filterManager, setFilterManager] = useState("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [studentDialog, setStudentDialog] = useState<{ title: string; students: StudentRef[] } | null>(null);

  const [applied, setApplied] = useState<{
    search: string;
    locationId: string;
    salesId: string;
    managerId: string;
    dateFrom: string;
    dateTo: string;
  }>(() => {
    const def = defaultCurrentMonth();
    return {
      search: "",
      locationId: "all",
      salesId: "all",
      managerId: "all",
      dateFrom: format(def.from, "yyyy-MM-dd"),
      dateTo: format(def.to, "yyyy-MM-dd"),
    };
  });

  const dateLabel = dateRange.from && dateRange.to
    ? `${format(dateRange.from, "d/M/yyyy")} - ${format(dateRange.to, "d/M/yyyy")}`
    : dateRange.from
      ? `Từ ${format(dateRange.from, "d/M/yyyy")}`
      : "Chọn khoảng thời gian";

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (applied.search) p.set("search", applied.search);
    if (applied.locationId !== "all") p.set("locationId", applied.locationId);
    if (applied.salesId !== "all") p.set("salesId", applied.salesId);
    if (applied.managerId !== "all") p.set("managerId", applied.managerId);
    if (applied.dateFrom) p.set("dateFrom", applied.dateFrom);
    if (applied.dateTo) p.set("dateTo", applied.dateTo);
    return p.toString();
  }, [applied]);

  const { data: reportData, isLoading, isFetching, refetch } = useQuery<ReportData>({
    queryKey: ["/api/students/conversion-report", qs],
    queryFn: async () => {
      const res = await fetch(`/api/students/conversion-report?${qs}`, { credentials: "include" });
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

  const { data: staffData = [] } = useQuery<any[]>({
    queryKey: ["/api/staff", "minimal"],
    queryFn: async () => {
      const res = await fetch("/api/staff?minimal=true", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 120_000,
  });

  function handleApply() {
    const nextApplied = {
      search,
      locationId: filterLocation,
      salesId: filterSales,
      managerId: filterManager,
      dateFrom: dateRange.from ? format(dateRange.from, "yyyy-MM-dd") : applied.dateFrom,
      dateTo: dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : applied.dateTo,
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
    setFilterSales("all");
    setFilterManager("all");
    setDateRange(def);
  }

  function toggleGroup(name: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function openStudents(title: string, students: StudentRef[]) {
    setStudentDialog({ title, students });
  }

  function handleDownload() {
    const exportGroups = reportData?.groups ?? [];
    const total = reportData?.total ?? 0;

    const dataRows: (string | number)[][] = [];
    dataRows.push(["Tổng", total, "100%"]);
    for (const g of exportGroups) {
      dataRows.push([g.toRelationshipName, g.totalCount, `${g.pct.toFixed(2)}%`]);
      for (const t of g.transitions) {
        const from = t.fromRelationshipName ?? "Mới tạo";
        dataRows.push([`  ${from} ► ${g.toRelationshipName}`, t.count, ""]);
        for (const s of t.students) {
          dataRows.push([`    ${s.code} - ${s.fullName}`, "", ""]);
        }
      }
    }

    downloadXlsx({
      filename: `bao-cao-chuyen-doi-${applied.dateFrom}`,
      sheetName: "Chuyển đổi",
      title: "Báo cáo Chuyển đổi",
      subtitle: `Kỳ: ${applied.dateFrom} → ${applied.dateTo}`,
      columns: [
        { header: "Mối quan hệ", width: 40 },
        { header: "Số lượng",    width: 14 },
        { header: "%",           width: 12 },
      ],
      rows: dataRows,
    });
  }

  const loading = isLoading || isFetching;
  const activeFilterCount = [filterLocation, filterSales, filterManager].filter(v => v !== "all").length;

  return (
    <div className="space-y-4 mt-2">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-base font-semibold">Báo cáo Chuyển đổi</h2>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Input
            placeholder="Tìm theo tên, mã học viên..."
            className="h-9 text-sm"
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
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
                onClick={() => { setDateRange(defaultCurrentMonth()); setCalOpen(false); }}>
                <X className="h-3 w-3 mr-1" /> Đặt lại
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={() => setCalOpen(false)}>Xong</Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Bộ lọc */}
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9 gap-2 text-sm font-normal relative">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Bộ lọc
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-bold">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Bộ lọc</span>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground px-2"
                onClick={() => { setFilterLocation("all"); setFilterSales("all"); setFilterManager("all"); }}>
                <X className="h-3 w-3 mr-1" /> Xoá bộ lọc
              </Button>
            </div>
            <Separator />
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Cơ sở</label>
              <Select value={filterLocation} onValueChange={setFilterLocation}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Cơ sở" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả cơ sở</SelectItem>
                  {locationsData.map((loc: any) => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Nhân viên kinh doanh</label>
              <Select value={filterSales} onValueChange={setFilterSales}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Nhân viên kinh doanh" /></SelectTrigger>
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
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Quản lý</label>
              <Select value={filterManager} onValueChange={setFilterManager}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Quản lý" /></SelectTrigger>
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
              <Button className="w-full h-9 bg-[#1e3a5f] hover:bg-[#16305a] text-sm gap-1.5"
                onClick={() => { handleApply(); setFilterOpen(false); }}>
                Áp dụng
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Tải xuống */}
        <Button variant="outline" className="h-9 gap-2 text-sm font-normal" onClick={handleDownload}>
          <Download className="h-3.5 w-3.5" />
          Tải xuống
        </Button>

        {/* Apply button (outside filter) */}
        <Button
          className="h-9 bg-[#1e3a5f] hover:bg-[#16305a] text-sm gap-1.5"
          disabled={loading}
          onClick={handleApply}
        >
          Xem báo cáo
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#1e3a5f] hover:bg-[#1e3a5f]">
                <TableHead className="text-white font-semibold min-w-[280px]">Mối quan hệ</TableHead>
                <TableHead className="text-white font-semibold w-28 text-center">Học viên</TableHead>
                <TableHead className="text-white font-semibold w-28 text-center">Số lượng</TableHead>
                <TableHead className="text-white font-semibold w-24 text-center">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Tổng row */}
              {!loading && reportData && (
                <TableRow className="bg-muted/50 border-b-2 font-semibold">
                  <TableCell className="text-sm font-semibold">Tổng</TableCell>
                  <TableCell className="text-center">
                    {reportData.allStudents.length > 0 && (
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 w-7 p-0 hover:bg-blue-50"
                        onClick={() => openStudents("Tất cả học viên chuyển đổi", reportData.allStudents)}
                      >
                        <Users className="h-4 w-4 text-blue-600" />
                      </Button>
                    )}
                  </TableCell>
                  <TableCell className="text-center font-bold text-base">{reportData.total}</TableCell>
                  <TableCell className="text-center text-muted-foreground">100%</TableCell>
                </TableRow>
              )}

              {/* Loading skeleton */}
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 4 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}

              {/* Empty state */}
              {!loading && reportData && reportData.groups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12 text-muted-foreground text-sm">
                    Không có dữ liệu trong khoảng thời gian này.
                  </TableCell>
                </TableRow>
              )}

              {/* Groups */}
              {!loading && reportData && reportData.groups.map(group => {
                const isExpanded = expandedGroups.has(group.toRelationshipName);
                return (
                  <>
                    {/* Group header row */}
                    <TableRow
                      key={`group-${group.toRelationshipName}`}
                      className="bg-blue-50/60 hover:bg-blue-50 cursor-pointer"
                      onClick={() => toggleGroup(group.toRelationshipName)}
                    >
                      <TableCell className="font-semibold text-sm">
                        <div className="flex items-center gap-2">
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          }
                          <Badge className="bg-[#1e3a5f] text-white border-none text-xs font-medium px-2 py-0.5">
                            {group.toRelationshipName}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 w-7 p-0 hover:bg-blue-100"
                          onClick={e => { e.stopPropagation(); openStudents(`Học viên → ${group.toRelationshipName}`, group.transitions.flatMap(t => t.students)); }}
                        >
                          <Users className="h-4 w-4 text-blue-600" />
                        </Button>
                      </TableCell>
                      <TableCell className="text-center font-semibold">{group.totalCount}</TableCell>
                      <TableCell className="text-center text-muted-foreground text-sm">
                        {group.pct > 0 ? `${group.pct.toFixed(2)}%` : "—"}
                      </TableCell>
                    </TableRow>

                    {/* Transition sub-rows */}
                    {isExpanded && group.transitions.map((t, ti) => {
                      const fromLabel = t.fromRelationshipName ?? "Mới tạo";
                      return (
                        <TableRow
                          key={`trans-${group.toRelationshipName}-${ti}`}
                          className="hover:bg-muted/30"
                        >
                          <TableCell className="text-sm text-muted-foreground pl-10">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="text-blue-700 font-medium">{fromLabel}</span>
                              <span className="text-muted-foreground">►</span>
                              <span className="text-[#1e3a5f] font-medium">{group.toRelationshipName}</span>
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 px-2 gap-1 text-xs hover:bg-blue-50"
                              onClick={() => openStudents(`${fromLabel} → ${group.toRelationshipName}`, t.students)}
                            >
                              <Users className="h-3.5 w-3.5 text-blue-600" />
                              <span className="text-blue-600 font-medium">{t.count}</span>
                            </Button>
                          </TableCell>
                          <TableCell className="text-center text-sm">{t.count}</TableCell>
                          <TableCell className="text-center text-muted-foreground text-sm">—</TableCell>
                        </TableRow>
                      );
                    })}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Student list dialog */}
      <Dialog open={!!studentDialog} onOpenChange={() => setStudentDialog(null)}>
        <DialogContent className="max-w-md max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">{studentDialog?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 mt-2">
            {studentDialog?.students.map((s, i) => (
              <div key={s.id + i} className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
                <span className="text-xs text-muted-foreground w-7 text-right shrink-0">{i + 1}.</span>
                <span className="text-xs text-blue-600 font-medium shrink-0">{s.code}</span>
                <span className="text-sm">{s.fullName ?? "—"}</span>
              </div>
            ))}
            {!studentDialog?.students.length && (
              <p className="text-sm text-muted-foreground text-center py-4">Không có học viên.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
