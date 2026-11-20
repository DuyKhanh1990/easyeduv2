import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  ArrowLeft, CalendarIcon, SlidersHorizontal, Download, Search, X, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { downloadXlsx } from "@/lib/excel-utils";

interface Props {
  onBack: () => void;
}

function defaultCurrentMonth() {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to:   new Date(now.getFullYear(), now.getMonth() + 1, 0),
  };
}

function fmtDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return "0";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} giờ ${m} phút`;
  if (h > 0) return `${h} giờ`;
  return `${m} phút`;
}

interface TeachingTimeRow {
  teacherId:     string;
  teacherName:   string;
  teacherCode:   string;
  classId:       string;
  className:     string;
  classCode:     string;
  locationId:    string;
  programName:   string;
  sessionCount:  number;
  totalMinutes:  number;
  actualMinutes: number;
  remainMinutes: number;
}

interface TeacherGroup {
  teacherId:     string;
  teacherName:   string;
  teacherCode:   string;
  rows:          TeachingTimeRow[];
  totalSessions: number;
  totalMinutes:  number;
  actualMinutes: number;
  remainMinutes: number;
}

const PAGE_SIZE = 50;

export function ThoiGianGiangDayReport({ onBack }: Props) {
  const [dateRange, setDateRange]   = useState<{ from?: Date; to?: Date }>(defaultCurrentMonth);
  const [calOpen, setCalOpen]       = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch]         = useState("");
  const [filterTeacher, setFilterTeacher]   = useState<string>("all");
  const [filterLocation, setFilterLocation] = useState<string>("all");
  const [page, setPage]             = useState(1);

  const dateFrom = dateRange.from ? format(dateRange.from, "yyyy-MM-dd") : undefined;
  const dateTo   = dateRange.to   ? format(dateRange.to,   "yyyy-MM-dd") : undefined;

  const dateLabel = dateFrom && dateTo
    ? `${format(new Date(dateFrom), "d/M/yyyy")} - ${format(new Date(dateTo), "d/M/yyyy")}`
    : dateFrom ? `Từ ${format(new Date(dateFrom), "d/M/yyyy")}`
    : dateTo   ? `Đến ${format(new Date(dateTo), "d/M/yyyy")}`
    : "Chọn kỳ";

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo)   p.set("dateTo",   dateTo);
    if (search.trim()) p.set("search", search.trim());
    if (filterTeacher  !== "all") p.set("teacherId",  filterTeacher);
    if (filterLocation !== "all") p.set("locationId", filterLocation);
    p.set("limit", "2000");
    return p.toString();
  }, [dateFrom, dateTo, search, filterTeacher, filterLocation]);

  const { data: reportData, isLoading, refetch } = useQuery<{ data: TeachingTimeRow[]; total: number }>({
    queryKey: ["/api/reports/teaching-time", qs],
    queryFn: async () => {
      const res = await fetch(`/api/reports/teaching-time?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30_000,
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

  const { data: locationsData = [] } = useQuery<any[]>({
    queryKey: ["/api/locations"],
    queryFn: async () => {
      const res = await fetch("/api/locations", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 120_000,
  });

  const rows = reportData?.data ?? [];

  const teacherGroups = useMemo<TeacherGroup[]>(() => {
    const map = new Map<string, TeacherGroup>();
    for (const r of rows) {
      if (!map.has(r.teacherId)) {
        map.set(r.teacherId, {
          teacherId:     r.teacherId,
          teacherName:   r.teacherName,
          teacherCode:   r.teacherCode,
          rows:          [],
          totalSessions: 0,
          totalMinutes:  0,
          actualMinutes: 0,
          remainMinutes: 0,
        });
      }
      const g = map.get(r.teacherId)!;
      g.rows.push(r);
      g.totalSessions += r.sessionCount;
      g.totalMinutes  += r.totalMinutes;
      g.actualMinutes += r.actualMinutes;
      g.remainMinutes += r.remainMinutes;
    }
    return Array.from(map.values());
  }, [rows]);

  const totalPages = Math.max(1, Math.ceil(teacherGroups.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const pagedGroups = teacherGroups.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const grandTotalSessions = teacherGroups.reduce((s, g) => s + g.totalSessions, 0);
  const grandTotalMinutes  = teacherGroups.reduce((s, g) => s + g.totalMinutes,  0);
  const grandActualMinutes = teacherGroups.reduce((s, g) => s + g.actualMinutes, 0);
  const grandRemainMinutes = teacherGroups.reduce((s, g) => s + g.remainMinutes, 0);

  const activeFilterCount = [
    filterTeacher  !== "all",
    filterLocation !== "all",
  ].filter(Boolean).length;

  function handleDownload() {
    const dataRows: (string | number)[][] = [];
    let stt = 0;
    for (const g of teacherGroups) {
      stt++;
      const teacherLabel = g.teacherCode ? `${g.teacherCode} - ${g.teacherName}` : g.teacherName;
      dataRows.push([stt, teacherLabel, "Tổng cộng", "", g.totalSessions, fmtDuration(g.totalMinutes), fmtDuration(g.actualMinutes), fmtDuration(g.remainMinutes)]);
      for (const r of g.rows) {
        dataRows.push(["", "", r.className, r.programName, r.sessionCount, fmtDuration(r.totalMinutes), fmtDuration(r.actualMinutes), fmtDuration(r.remainMinutes)]);
      }
    }

    downloadXlsx({
      filename: `thoi-gian-giang-day-${dateFrom ?? "all"}`,
      sheetName: "TG giảng dạy",
      title: "Báo cáo Thời gian giảng dạy",
      subtitle: `Kỳ: ${dateLabel}`,
      columns: [
        { header: "STT",               width: 5  },
        { header: "Giáo viên",         width: 28 },
        { header: "Lịch - Lớp học",    width: 28 },
        { header: "Lộ trình học",      width: 22 },
        { header: "Số buổi học",       width: 12 },
        { header: "TG dự kiến",        width: 16 },
        { header: "TG thực tế",        width: 16 },
        { header: "TG còn lại",        width: 16 },
      ],
      rows: dataRows,
      summaryRows: [
        ["Tổng cộng", "", "", "", grandTotalSessions, fmtDuration(grandTotalMinutes), fmtDuration(grandActualMinutes), fmtDuration(grandRemainMinutes)],
      ],
    });
  }

  return (
    <div className="space-y-4 mt-2">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-base font-semibold">Báo cáo Thời gian giảng dạy</h2>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm giáo viên / lớp học..."
            className="pl-8 h-9 text-sm"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        {/* Date range */}
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm font-normal">
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="range"
              selected={{ from: dateRange.from, to: dateRange.to }}
              onSelect={(r) => {
                setDateRange({ from: r?.from, to: r?.to });
                if (r?.from && r?.to) { setCalOpen(false); setPage(1); }
              }}
              locale={vi}
              numberOfMonths={2}
              initialFocus
            />
            <div className="flex justify-end gap-2 p-2 border-t">
              <Button variant="ghost" size="sm" className="h-7 text-xs"
                onClick={() => { setDateRange({}); setCalOpen(false); setPage(1); }}>
                Xoá lọc
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={() => setCalOpen(false)}>
                Xong
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Filters */}
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline" size="sm"
              className={`h-9 gap-1.5 text-sm ${activeFilterCount > 0 ? "border-indigo-400 text-indigo-700 bg-indigo-50" : ""}`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Bộ lọc
              {activeFilterCount > 0 && (
                <span className="ml-0.5 rounded-full bg-indigo-600 text-white text-[10px] w-4 h-4 flex items-center justify-center font-bold">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-3 space-y-3">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Bộ lọc</p>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Giáo viên</label>
              <Select value={filterTeacher} onValueChange={(v) => { setFilterTeacher(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Tất cả giáo viên" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả giáo viên</SelectItem>
                  {staffData
                    .filter((s: any) => s.type === "teacher" || s.roles?.includes("teacher"))
                    .map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.code ? `${s.code} - ` : ""}{s.fullName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Cơ sở</label>
              <Select value={filterLocation} onValueChange={(v) => { setFilterLocation(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Tất cả cơ sở" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả cơ sở</SelectItem>
                  {locationsData.map((loc: any) => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {activeFilterCount > 0 && (
              <Button
                variant="ghost" size="sm" className="h-7 text-xs w-full text-red-500 hover:text-red-600"
                onClick={() => { setFilterTeacher("all"); setFilterLocation("all"); setPage(1); }}
              >
                <X className="h-3 w-3 mr-1" /> Xoá tất cả bộ lọc
              </Button>
            )}
          </PopoverContent>
        </Popover>

        <Button
          size="sm"
          className="h-9 gap-2 bg-blue-600 hover:bg-blue-700 text-white"
          disabled={isLoading}
          onClick={() => refetch()}
        >
          Xem báo cáo
        </Button>

        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm" onClick={handleDownload}>
          <Download className="h-3.5 w-3.5" />
          Tải xuống
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Số buổi học",          value: grandTotalSessions,  display: `${grandTotalSessions} buổi`, color: "text-blue-700" },
          { label: "Thời gian dự kiến",    value: grandTotalMinutes,   display: fmtDuration(grandTotalMinutes),  color: "text-indigo-700" },
          { label: "Thời gian thực tế",    value: grandActualMinutes,  display: fmtDuration(grandActualMinutes), color: "text-green-700" },
          { label: "Thời gian còn lại",    value: grandRemainMinutes,  display: fmtDuration(grandRemainMinutes), color: "text-amber-700" },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border bg-card px-4 py-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">{c.label}</p>
            <p className={`text-base font-bold tabular-nums ${c.color}`}>
              {isLoading ? <Skeleton className="h-5 w-24" /> : c.display}
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#1e3a5f] hover:bg-[#1e3a5f]">
              <TableHead className="text-white font-semibold w-12 text-center">STT</TableHead>
              <TableHead className="text-white font-semibold">Giáo viên</TableHead>
              <TableHead className="text-white font-semibold">Lịch học - Lớp học</TableHead>
              <TableHead className="text-white font-semibold">Lộ trình học</TableHead>
              <TableHead className="text-white font-semibold text-center">Số buổi học</TableHead>
              <TableHead className="text-white font-semibold">Thời gian dự kiến</TableHead>
              <TableHead className="text-white font-semibold">Thời gian thực tế</TableHead>
              <TableHead className="text-white font-semibold">Thời gian còn lại</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : pagedGroups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                  Không có dữ liệu
                </TableCell>
              </TableRow>
            ) : (
              <>
                {pagedGroups.map((g, idx) => (
                  <>
                    {/* Teacher summary row */}
                    <TableRow key={`teacher-${g.teacherId}`} className="bg-blue-50/60 hover:bg-blue-50">
                      <TableCell className="text-center font-semibold text-sm text-[#1e3a5f]">
                        {(safePage - 1) * PAGE_SIZE + idx + 1}
                      </TableCell>
                      <TableCell className="font-semibold text-sm text-[#1e3a5f]">
                        <div className="flex flex-col gap-0.5">
                          {g.teacherCode && (
                            <span className="text-xs text-muted-foreground font-normal">{g.teacherCode}</span>
                          )}
                          <span>{g.teacherName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold text-sm text-[#1e3a5f]">Tổng cộng</TableCell>
                      <TableCell />
                      <TableCell className="text-center font-semibold text-sm">{g.totalSessions}</TableCell>
                      <TableCell className="text-sm font-semibold">{fmtDuration(g.totalMinutes)}</TableCell>
                      <TableCell className="text-sm font-semibold text-green-700">{fmtDuration(g.actualMinutes)}</TableCell>
                      <TableCell className="text-sm font-semibold text-amber-700">{fmtDuration(g.remainMinutes)}</TableCell>
                    </TableRow>

                    {/* Class rows */}
                    {g.rows.map((r) => (
                      <TableRow key={`class-${r.classId}`} className="hover:bg-muted/40">
                        <TableCell />
                        <TableCell />
                        <TableCell className="text-sm">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-blue-700 font-medium">{r.className}</span>
                            {r.classCode && (
                              <span className="text-xs text-muted-foreground">{r.classCode}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.programName || "—"}</TableCell>
                        <TableCell className="text-center text-sm">{r.sessionCount}</TableCell>
                        <TableCell className="text-sm">{fmtDuration(r.totalMinutes)}</TableCell>
                        <TableCell className="text-sm text-green-700">{fmtDuration(r.actualMinutes)}</TableCell>
                        <TableCell className="text-sm text-amber-700">{fmtDuration(r.remainMinutes)}</TableCell>
                      </TableRow>
                    ))}
                  </>
                ))}

                {/* Grand total row */}
                <TableRow className="bg-muted/60 font-semibold border-t-2">
                  <TableCell colSpan={4} className="text-sm">
                    Tổng cộng ({teacherGroups.length} giáo viên)
                  </TableCell>
                  <TableCell className="text-center text-sm">{grandTotalSessions}</TableCell>
                  <TableCell className="text-sm">{fmtDuration(grandTotalMinutes)}</TableCell>
                  <TableCell className="text-sm text-green-700">{fmtDuration(grandActualMinutes)}</TableCell>
                  <TableCell className="text-sm text-amber-700">{fmtDuration(grandRemainMinutes)}</TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {teacherGroups.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, teacherGroups.length)} / {teacherGroups.length} giáo viên
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹</Button>
            <span className="px-1">{safePage} / {totalPages}</span>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>›</Button>
          </div>
        </div>
      )}

      {/* Info note */}
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <Clock className="h-3 w-3 shrink-0" />
        Thời gian thực tế: số buổi giáo viên đã đi dạy và có điểm danh cho ít nhất 1 học viên.
      </p>
    </div>
  );
}
