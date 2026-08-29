import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  ArrowLeft, CalendarIcon, SlidersHorizontal, Download, Search, X, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

function fmtMoney(n: number) {
  if (n === 0) return "0";
  return n.toLocaleString("vi-VN");
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy"); } catch { return String(d); }
}

const PAGE_SIZE = 20;

interface ClassRevenueRow {
  classId: string | null;
  className: string;
  grandTotal: number;
  paidAmount: number;
  remainingAmount: number;
  cancelledAmount: number;
}

interface EnrolledStudent {
  id: string;
  studentId: string | null;
  fullName: string | null;
  code: string | null;
  enrollmentStatus: string;
  startDate: string | null;
  endDate: string | null;
  totalSessions: number | null;
  invoice: {
    grandTotal: number;
    paidAmount: number;
    remainingAmount: number;
    status: string;
  } | null;
}

function StudentListDialog({
  classId,
  className,
  open,
  onClose,
}: {
  classId: string;
  className: string;
  open: boolean;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: students = [], isLoading } = useQuery<EnrolledStudent[]>({
    queryKey: [`/api/classes/${classId}/enrolled-students`],
    queryFn: async () => {
      const res = await fetch(`/api/classes/${classId}/enrolled-students`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: open && !!classId,
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return students;
    const q = search.toLowerCase();
    return students.filter(s =>
      (s.fullName ?? "").toLowerCase().includes(q) ||
      (s.code ?? "").toLowerCase().includes(q),
    );
  }, [students, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function getStatusBadge(s: EnrolledStudent) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = s.startDate ? new Date(s.startDate) : null;
    const end   = s.endDate   ? new Date(s.endDate)   : null;
    if (!start && !end)
      return <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200 text-xs">Chưa xếp lịch</Badge>;
    if (start && today < start)
      return <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-200 text-xs">Chờ đến lịch</Badge>;
    if (end && today > end)
      return <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-xs">Đã kết thúc</Badge>;
    return <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 text-xs">Đang học</Badge>;
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-base font-semibold">
            Danh sách học viên — {className}
          </DialogTitle>
        </DialogHeader>

        <div className="relative shrink-0 mb-3">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo tên / mã học viên..."
            className="pl-8 h-9 text-sm"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        <div className="flex-1 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#1e3a5f]">
                <TableHead className="text-white font-semibold">Tên</TableHead>
                <TableHead className="text-white font-semibold">Tình trạng</TableHead>
                <TableHead className="text-white font-semibold">Bắt đầu</TableHead>
                <TableHead className="text-white font-semibold">Kết thúc</TableHead>
                <TableHead className="text-white font-semibold text-center">Số buổi</TableHead>
                <TableHead className="text-white font-semibold">Hoá đơn</TableHead>
                <TableHead className="text-white font-semibold">Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                    {search ? "Không tìm thấy học viên phù hợp" : "Không có học viên nào"}
                  </TableCell>
                </TableRow>
              ) : (
                paged.map((s) => (
                  <TableRow key={s.id} className="hover:bg-muted/40">
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-sm">{s.fullName ?? "—"}</span>
                        {s.code && (
                          <span className="text-xs text-muted-foreground">{s.code}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {s.enrollmentStatus === "waiting" ? (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs whitespace-nowrap">
                          Học viên chờ
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs whitespace-nowrap">
                          Chính thức
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{fmtDate(s.startDate)}</TableCell>
                    <TableCell className="text-sm">{fmtDate(s.endDate)}</TableCell>
                    <TableCell className="text-center text-sm">{s.totalSessions ?? 0}</TableCell>
                    <TableCell>
                      {s.invoice ? (() => {
                        const pct = s.invoice.grandTotal > 0
                          ? Math.round((s.invoice.paidAmount / s.invoice.grandTotal) * 100)
                          : 0;
                        const pctColor =
                          pct >= 100 ? "text-green-700 font-semibold" :
                          pct > 0    ? "text-yellow-700 font-semibold" :
                                       "text-red-600 font-semibold";
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium">
                              {fmtMoney(s.invoice.paidAmount)} / {fmtMoney(s.invoice.grandTotal)}
                            </span>
                            <span className={`text-[11px] ${pctColor}`}>{pct}% đã thanh toán</span>
                          </div>
                        );
                      })() : (
                        <span className="text-muted-foreground text-xs italic">Chưa có</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(s)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {filtered.length > 0 && (
          <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground shrink-0">
            <span>
              {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} / {filtered.length} học viên
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹</Button>
              <span className="px-1">{safePage} / {totalPages}</span>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>›</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DoanhThuLopHocReport({ onBack }: Props) {
  const [dateRange, setDateRange]   = useState<{ from?: Date; to?: Date }>(defaultCurrentMonth);
  const [calOpen, setCalOpen]       = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch]         = useState("");
  const [filterLocation, setFilterLocation] = useState<string>("all");
  const [page, setPage]             = useState(1);

  const [viewClass, setViewClass] = useState<{ classId: string; className: string } | null>(null);

  const dateFrom = dateRange.from ? format(dateRange.from, "yyyy-MM-dd") : undefined;
  const dateTo   = dateRange.to   ? format(dateRange.to,   "yyyy-MM-dd") : undefined;

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo)   p.set("dateTo",   dateTo);
    if (search.trim()) p.set("search", search.trim());
    if (filterLocation !== "all") p.set("locationId", filterLocation);
    p.set("limit", "1000");
    return p.toString();
  }, [dateFrom, dateTo, search, filterLocation]);

  const { data: reportData, isLoading, refetch } = useQuery<{ data: ClassRevenueRow[]; total: number }>({
    queryKey: ["/api/finance/class-revenue-report", qs],
    queryFn: async () => {
      const res = await fetch(`/api/finance/class-revenue-report?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
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

  const rows       = reportData?.data ?? [];
  const totalRows  = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const totalGrand     = rows.reduce((s, r) => s + r.grandTotal,      0);
  const totalPaid      = rows.reduce((s, r) => s + r.paidAmount,      0);
  const totalRemaining = rows.reduce((s, r) => s + r.remainingAmount, 0);
  const totalCancelled = rows.reduce((s, r) => s + r.cancelledAmount, 0);

  const activeFilterCount = [filterLocation !== "all"].filter(Boolean).length;

  const dateLabel = dateFrom && dateTo
    ? `${format(new Date(dateFrom), "d/M/yyyy")} - ${format(new Date(dateTo), "d/M/yyyy")}`
    : dateFrom ? `Từ ${format(new Date(dateFrom), "d/M/yyyy")}`
    : dateTo   ? `Đến ${format(new Date(dateTo), "d/M/yyyy")}`
    : "Chọn kỳ";

  function handleDownload() {
    const dataRows = rows.map(r => [
      r.className,
      r.grandTotal,
      r.paidAmount,
      r.remainingAmount,
      r.cancelledAmount,
    ]);

    downloadXlsx({
      filename: `doanh-thu-lop-hoc-${dateFrom ?? "all"}`,
      sheetName: "Doanh thu lớp học",
      title: "Báo cáo Doanh thu lớp học",
      subtitle: `Kỳ: ${dateLabel}`,
      columns: [
        { header: "Lớp học",           width: 32 },
        { header: "Số tiền phải thu",  width: 20 },
        { header: "Đã thanh toán",     width: 18 },
        { header: "Tiền còn thiếu",    width: 18 },
        { header: "Tiền hoàn",         width: 18 },
      ],
      rows: dataRows,
      summaryRows: [
        ["Tổng cộng", totalGrand, totalPaid, totalRemaining, totalCancelled],
      ],
    });
  }

  return (
    <div className="space-y-4 mt-2">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-base font-semibold">Báo cáo Doanh thu lớp học</h2>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm lớp học..."
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
              <Button size="sm" className="h-7 text-xs"
                onClick={() => setCalOpen(false)}>
                Xong
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Filter */}
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={`h-9 gap-1.5 text-sm ${activeFilterCount > 0 ? "border-indigo-400 text-indigo-700 bg-indigo-50" : ""}`}>
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
                onClick={() => { setFilterLocation("all"); setPage(1); }}
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

        {/* Download */}
        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm" onClick={handleDownload}>
          <Download className="h-3.5 w-3.5" />
          Tải xuống
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Tổng phải thu",   value: totalGrand,     color: "text-blue-700" },
          { label: "Đã thanh toán",   value: totalPaid,      color: "text-green-700" },
          { label: "Còn thiếu",       value: totalRemaining, color: "text-red-600" },
          { label: "Tiền hoàn",       value: totalCancelled, color: "text-gray-600" },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border bg-card px-4 py-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">{c.label}</p>
            <p className={`text-base font-bold tabular-nums ${c.color}`}>
              {isLoading ? <Skeleton className="h-5 w-24" /> : `${fmtMoney(c.value)} ₫`}
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#1e3a5f] hover:bg-[#1e3a5f]">
              <TableHead className="text-white font-semibold">Lớp học</TableHead>
              <TableHead className="text-white font-semibold text-right">Số tiền phải thu</TableHead>
              <TableHead className="text-white font-semibold text-right">Đã thanh toán</TableHead>
              <TableHead className="text-white font-semibold text-right">Tiền còn thiếu</TableHead>
              <TableHead className="text-white font-semibold text-right">Tiền hoàn</TableHead>
              <TableHead className="text-white font-semibold text-center">Danh sách</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                  Không có dữ liệu
                </TableCell>
              </TableRow>
            ) : (
              paged.map((r) => (
                <TableRow key={r.classId ?? r.className} className="hover:bg-muted/40">
                  <TableCell className="font-medium text-blue-700 hover:underline cursor-pointer text-sm">
                    {r.className}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {fmtMoney(r.grandTotal)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {fmtMoney(r.paidAmount)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    <span className={r.remainingAmount > 0 ? "text-red-600 font-medium" : ""}>
                      {fmtMoney(r.remainingAmount)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {fmtMoney(r.cancelledAmount)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      title="Xem danh sách học viên"
                      onClick={() => r.classId && setViewClass({ classId: r.classId, className: r.className })}
                      disabled={!r.classId}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}

            {/* Totals row */}
            {!isLoading && paged.length > 0 && (
              <TableRow className="bg-muted/60 font-semibold border-t-2">
                <TableCell className="text-sm">Tổng cộng ({totalRows} lớp)</TableCell>
                <TableCell className="text-right text-sm tabular-nums">{fmtMoney(totalGrand)}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">{fmtMoney(totalPaid)}</TableCell>
                <TableCell className="text-right text-sm tabular-nums text-red-600">{fmtMoney(totalRemaining)}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">{fmtMoney(totalCancelled)}</TableCell>
                <TableCell />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalRows > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, totalRows)} / {totalRows} lớp
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹</Button>
            <span className="px-1">{safePage} / {totalPages}</span>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>›</Button>
          </div>
        </div>
      )}

      {/* Student list dialog */}
      {viewClass && (
        <StudentListDialog
          classId={viewClass.classId}
          className={viewClass.className}
          open={!!viewClass}
          onClose={() => setViewClass(null)}
        />
      )}
    </div>
  );
}
