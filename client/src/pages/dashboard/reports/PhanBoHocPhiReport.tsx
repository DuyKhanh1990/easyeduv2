import { useState, useMemo, useEffect, useCallback } from "react";
import { StudentNameLink } from "@/components/ui/StudentNameLink";
import { useQuery } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/queryClient";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  ArrowLeft, CalendarIcon, Download, Search, X, ChevronLeft, ChevronRight, RefreshCw, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
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

function fmtYm(ym: string) {
  const [y, m] = ym.split("-");
  return `${y}-${m}`;
}

interface MonthData { tuition: number; promotion: number; }
interface StudentRow {
  studentId: string;
  locationName: string;
  locationId: string | null;
  studentCode: string;
  studentName: string;
  relationship: string;
  phone: string;
  email: string;
  teachers: string[];
  salesStaff: string[];
  months: Record<string, MonthData>;
  totalTuition: number;
  totalPromotion: number;
}
interface ReportData { data: StudentRow[]; months: string[]; total: number; }

const PAGE_SIZE = 20;

async function fetchReport(qs: string): Promise<ReportData> {
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`/api/finance/phan-bo-hoc-phi?${qs}`, {
    credentials: "include",
    headers,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `HTTP ${res.status}`);
  }
  return res.json();
}

export function PhanBoHocPhiReport({ onBack }: Props) {
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>(defaultCurrentMonth);
  const [calOpen, setCalOpen]     = useState(false);
  const [localSearch, setLocalSearch] = useState("");
  const [filterLocation, setFilterLocation] = useState("all");
  const [page, setPage]           = useState(1);

  // Report data managed with plain state (no TanStack Query caching issues)
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading]   = useState(false);
  const [isError, setIsError]       = useState(false);
  const [errorMsg, setErrorMsg]     = useState("");

  const dateFrom = dateRange.from ? format(dateRange.from, "yyyy-MM-dd") : undefined;
  const dateTo   = dateRange.to   ? format(dateRange.to,   "yyyy-MM-dd") : undefined;

  const dateLabel = dateFrom && dateTo
    ? `${format(new Date(dateFrom + "T00:00:00"), "d/M/yyyy")} - ${format(new Date(dateTo + "T00:00:00"), "d/M/yyyy")}`
    : dateFrom ? `Từ ${format(new Date(dateFrom + "T00:00:00"), "d/M/yyyy")}`
    : dateTo   ? `Đến ${format(new Date(dateTo + "T00:00:00"), "d/M/yyyy")}`
    : "Chọn kỳ";

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo)   p.set("dateTo",   dateTo);
    if (filterLocation !== "all") p.set("locationId", filterLocation);
    p.set("limit", "1000");
    return p.toString();
  }, [dateFrom, dateTo, filterLocation]);

  const load = useCallback(async (queryString: string) => {
    setIsLoading(true);
    setIsError(false);
    setErrorMsg("");
    try {
      const data = await fetchReport(queryString);
      setReportData(data);
    } catch (err: any) {
      setIsError(true);
      setErrorMsg(err?.message ?? "Lỗi không xác định");
      console.error("[PhanBoHocPhi] fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-load on mount and whenever qs changes
  useEffect(() => {
    load(qs);
  }, [qs, load]);

  // Locations for filter dropdown — simple cached query, always works
  const { data: locationsData = [] } = useQuery<any[]>({
    queryKey: ["/api/locations"],
    staleTime: 120_000,
  });

  const months = reportData?.months ?? [];

  const allRows = useMemo(() => {
    const rows = reportData?.data ?? [];
    if (!localSearch.trim()) return rows;
    const q = localSearch.trim().toLowerCase();
    return rows.filter(r =>
      r.studentName.toLowerCase().includes(q) ||
      r.studentCode.toLowerCase().includes(q),
    );
  }, [reportData, localSearch]);

  const totalRows  = allRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = allRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const grandTotalTuition   = allRows.reduce((s, r) => s + r.totalTuition, 0);
  const grandTotalPromotion = allRows.reduce((s, r) => s + r.totalPromotion, 0);

  function handleDownload() {
    if (!reportData?.data.length) return;
    const rows = reportData.data;

    const monthCols = months.flatMap(ym => [
      { header: `${fmtYm(ym)} HP`, width: 14 },
      { header: `${fmtYm(ym)} KM`, width: 14 },
    ]);

    const dataRows = rows.map(r => {
      const monthVals = months.flatMap(ym => {
        const m = r.months[ym];
        return [m ? m.tuition : 0, m ? m.promotion : 0];
      });
      return [
        r.locationName,
        r.studentCode,
        r.studentName,
        r.relationship || "",
        r.phone || "",
        r.email || "",
        r.teachers.join(", "),
        r.salesStaff.join(", "),
        ...monthVals,
        r.totalTuition + r.totalPromotion,
      ];
    });

    const sumMonthVals = months.flatMap(ym => {
      const t = rows.reduce((s, r) => s + (r.months[ym]?.tuition   || 0), 0);
      const p = rows.reduce((s, r) => s + (r.months[ym]?.promotion || 0), 0);
      return [t, p];
    });

    downloadXlsx({
      filename: `phan-bo-hoc-phi-${dateFrom ?? "all"}`,
      sheetName: "Phân bổ học phí",
      title: "Báo cáo Phân bổ học phí",
      subtitle: `Kỳ: ${dateLabel}`,
      columns: [
        { header: "Cơ sở",         width: 16 },
        { header: "Mã học sinh",   width: 14 },
        { header: "Họ và tên",     width: 26 },
        { header: "Mối quan hệ",   width: 16 },
        { header: "Phone",         width: 14 },
        { header: "Email",         width: 22 },
        { header: "Giáo viên",     width: 26 },
        { header: "NVKD",          width: 22 },
        ...monthCols,
        { header: "Tổng cộng",     width: 16 },
      ],
      rows: dataRows,
      summaryRows: [
        ["Tổng cộng", "", "", "", "", "", "", "", ...sumMonthVals, grandTotalTuition + grandTotalPromotion],
      ],
    });
  }

  const hdrBase  = "bg-[#1e3a5f] text-white text-xs font-semibold px-2 py-2 whitespace-nowrap border-r border-blue-800/40";
  const cellBase = "text-xs px-2 py-2 border-b border-border whitespace-nowrap";
  const fixedCols = 8;
  const totalColCount = fixedCols + months.length * 2 + 1;

  return (
    <div className="space-y-3 mt-2">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-base font-semibold">Báo cáo Phân bổ học phí</h2>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Tiêu đề"
            className="pl-8 h-9 text-sm"
            value={localSearch}
            onChange={(e) => { setLocalSearch(e.target.value); setPage(1); }}
          />
          {localSearch && (
            <button className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
              onClick={() => { setLocalSearch(""); setPage(1); }}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Select value={filterLocation} onValueChange={(v) => { setFilterLocation(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[160px] text-sm">
            <SelectValue placeholder="Cơ sở" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả cơ sở</SelectItem>
            {locationsData.map((loc: any) => (
              <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm font-normal min-w-[190px]">
              <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-xs text-muted-foreground mr-0.5">Khoảng thời gian</span>
              <span className="text-xs font-medium">{dateLabel}</span>
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
                onClick={() => { setDateRange({}); setCalOpen(false); }}>
                Xoá lọc
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={() => setCalOpen(false)}>Xong</Button>
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex items-center gap-2 ml-auto">
          <Button
            size="sm"
            className="h-9 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4"
            disabled={isLoading}
            onClick={() => { setPage(1); load(qs); }}
          >
            {isLoading ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
            Xem báo cáo
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm"
            disabled={!reportData?.data?.length}
            onClick={handleDownload}>
            <Download className="h-3.5 w-3.5" />
            Tải xuống
          </Button>
        </div>
      </div>

      {/* Error state */}
      {isError && !isLoading && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            Không thể tải dữ liệu{errorMsg ? ` (${errorMsg})` : ""}. Vui lòng nhấn{" "}
            <strong>Xem báo cáo</strong> để thử lại.
          </span>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border overflow-auto" style={{ maxHeight: "70vh" }}>
        <table
          className="w-full border-collapse text-left"
          style={{ minWidth: `${Math.max(900, 900 + months.length * 180)}px` }}
        >
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={hdrBase}>Cơ sở</th>
              <th className={hdrBase}>Mã học sinh</th>
              <th className={hdrBase}>Họ và tên</th>
              <th className={hdrBase}>Mối quan hệ</th>
              <th className={hdrBase}>Phone</th>
              <th className={hdrBase}>Thư điện tử</th>
              <th className={hdrBase}>Giáo viên</th>
              <th className={hdrBase}>Nhân viên kinh doanh</th>
              {months.map((ym) => (
                <>
                  <th key={`${ym}-t`} className={`${hdrBase} text-right min-w-[110px]`}>
                    {fmtYm(ym)}<br/>
                    <span className="font-normal opacity-80">Học phí</span>
                  </th>
                  <th key={`${ym}-p`} className={`${hdrBase} text-right min-w-[100px]`}>
                    {fmtYm(ym)}<br/>
                    <span className="font-normal opacity-80">Khuyến mãi</span>
                  </th>
                </>
              ))}
              <th className={`${hdrBase} text-right min-w-[110px]`}>Tổng cộng</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  {Array.from({ length: Math.max(totalColCount, fixedCols + 1) }).map((_, j) => (
                    <td key={j} className="px-2 py-2">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={totalColCount} className="text-center py-12 text-muted-foreground text-sm">
                  {isError ? "Lỗi tải dữ liệu — nhấn Xem báo cáo để thử lại" : "Không có dữ liệu phù hợp với bộ lọc"}
                </td>
              </tr>
            ) : (
              <>
                {paged.map((r) => (
                  <tr key={r.studentId} className="hover:bg-muted/30 border-b border-border">
                    <td className={cellBase}>{r.locationName}</td>
                    <td className={`${cellBase} text-blue-700 font-medium`}>{r.studentCode}</td>
                    <td className={`${cellBase} font-medium`}><StudentNameLink studentId={r.studentId} name={r.studentName} /></td>
                    <td className={cellBase}>{r.relationship || "—"}</td>
                    <td className={cellBase}>{r.phone || "—"}</td>
                    <td className={`${cellBase} text-blue-600`}>{r.email || "—"}</td>
                    <td className={cellBase}>{r.teachers.join(", ") || "—"}</td>
                    <td className={cellBase}>{r.salesStaff.join(", ") || "—"}</td>
                    {months.map((ym) => {
                      const m = r.months[ym];
                      return (
                        <>
                          <td key={`${r.studentId}-${ym}-t`} className={`${cellBase} text-right tabular-nums`}>
                            {m?.tuition
                              ? fmtMoney(m.tuition)
                              : <span className="text-muted-foreground/40">0</span>}
                          </td>
                          <td key={`${r.studentId}-${ym}-p`} className={`${cellBase} text-right tabular-nums text-blue-600`}>
                            {m?.promotion
                              ? fmtMoney(m.promotion)
                              : <span className="text-muted-foreground/40">0</span>}
                          </td>
                        </>
                      );
                    })}
                    <td className={`${cellBase} text-right tabular-nums font-semibold`}>
                      {fmtMoney(r.totalTuition + r.totalPromotion)}
                    </td>
                  </tr>
                ))}

                {/* Totals row */}
                <tr className="bg-muted/60 font-semibold border-t-2 sticky bottom-0">
                  <td className={`${cellBase} font-semibold`} colSpan={fixedCols}>
                    Tổng cộng ({totalRows} học sinh)
                  </td>
                  {months.map((ym) => {
                    const t = allRows.reduce((s, r) => s + (r.months[ym]?.tuition   || 0), 0);
                    const p = allRows.reduce((s, r) => s + (r.months[ym]?.promotion || 0), 0);
                    return (
                      <>
                        <td key={`sum-${ym}-t`} className={`${cellBase} text-right tabular-nums`}>{fmtMoney(t)}</td>
                        <td key={`sum-${ym}-p`} className={`${cellBase} text-right tabular-nums text-blue-600`}>{fmtMoney(p)}</td>
                      </>
                    );
                  })}
                  <td className={`${cellBase} text-right tabular-nums`}>
                    {fmtMoney(grandTotalTuition + grandTotalPromotion)}
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalRows > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, totalRows)} / {totalRows} học sinh
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
              disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="px-1">{safePage} / {totalPages}</span>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
              disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
