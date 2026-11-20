import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  ArrowLeft, CalendarIcon, SlidersHorizontal, Download, Search, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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

function fmtMoney(n: number) {
  if (n === 0) return "0";
  return n.toLocaleString("vi-VN");
}

interface SourceItem {
  name: string;
  count: number;
  pct: number;
}

interface StaffRevenueRow {
  staffId: string;
  staffName: string;
  staffCode: string;
  invoiceCount: number;
  expectedRevenue: number;
  actualRevenue: number;
  remainingRevenue: number;
  cancelledRevenue: number;
  sources: SourceItem[];
}

const PAGE_SIZE = 20;

export function DoanhThuNhanSuReport({ onBack }: Props) {
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>(defaultCurrentMonth);
  const [calOpen, setCalOpen]     = useState(false);
  const [search, setSearch]       = useState("");
  const [page, setPage]           = useState(1);

  const dateFrom = dateRange.from ? format(dateRange.from, "yyyy-MM-dd") : undefined;
  const dateTo   = dateRange.to   ? format(dateRange.to,   "yyyy-MM-dd") : undefined;

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo)   p.set("dateTo",   dateTo);
    if (search.trim()) p.set("search", search.trim());
    p.set("limit", "1000");
    return p.toString();
  }, [dateFrom, dateTo, search]);

  const { data: reportData, isLoading, refetch } = useQuery<{ data: StaffRevenueRow[]; total: number }>({
    queryKey: ["/api/finance/staff-revenue-report", qs],
    queryFn: async () => {
      const res = await fetch(`/api/finance/staff-revenue-report?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30_000,
  });

  const rows       = reportData?.data ?? [];
  const totalRows  = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const totalExpected  = rows.reduce((s, r) => s + r.expectedRevenue,  0);
  const totalActual    = rows.reduce((s, r) => s + r.actualRevenue,    0);
  const totalRemaining = rows.reduce((s, r) => s + r.remainingRevenue, 0);
  const totalCancelled = rows.reduce((s, r) => s + r.cancelledRevenue, 0);
  const totalInvoices  = rows.reduce((s, r) => s + r.invoiceCount,     0);

  const dateLabel = dateFrom && dateTo
    ? `${format(new Date(dateFrom), "d/M/yyyy")} - ${format(new Date(dateTo), "d/M/yyyy")}`
    : dateFrom ? `Từ ${format(new Date(dateFrom), "d/M/yyyy")}`
    : dateTo   ? `Đến ${format(new Date(dateTo), "d/M/yyyy")}`
    : "Chọn kỳ";

  function handleDownload() {
    const dataRows = rows.map((r, i) => {
      const srcText = r.sources.map(s => `${s.name}: ${s.count} (${s.pct}%)`).join(", ");
      return [
        i + 1,
        `${r.staffName} (${r.staffCode})`,
        r.invoiceCount,
        r.expectedRevenue,
        r.actualRevenue,
        r.remainingRevenue,
        r.cancelledRevenue,
        srcText || "",
      ];
    });

    downloadXlsx({
      filename: `doanh-thu-nhan-su-${dateFrom ?? "all"}`,
      sheetName: "Doanh thu nhân sự",
      title: "Báo cáo Doanh thu nhân sự",
      subtitle: `Kỳ: ${dateLabel}`,
      columns: [
        { header: "STT",                  width: 5  },
        { header: "Tên nhân sự",          width: 28 },
        { header: "Số hoá đơn",           width: 12 },
        { header: "Tổng Thu dự kiến",     width: 20 },
        { header: "Thực thu",             width: 18 },
        { header: "Còn thiếu",            width: 18 },
        { header: "Hoàn tiền",            width: 18 },
        { header: "Nguồn khách hàng",     width: 35 },
      ],
      rows: dataRows,
      summaryRows: [
        ["Tổng cộng", "", totalInvoices, totalExpected, totalActual, totalRemaining, totalCancelled, ""],
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
        <h2 className="text-base font-semibold">Báo cáo Doanh thu nhân sự</h2>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm nhân sự..."
            className="pl-8 h-9 text-sm"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          {search && (
            <button className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground" onClick={() => { setSearch(""); setPage(1); }}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
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
          { label: "Tổng thu dự kiến", value: totalExpected,  color: "text-blue-700" },
          { label: "Thực thu",         value: totalActual,    color: "text-green-700" },
          { label: "Còn thiếu",        value: totalRemaining, color: "text-red-600" },
          { label: "Hoàn tiền",        value: totalCancelled, color: "text-gray-600" },
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
              <TableHead className="text-white font-semibold text-center w-12">STT</TableHead>
              <TableHead className="text-white font-semibold">Tên nhân sự</TableHead>
              <TableHead className="text-white font-semibold text-center">Số hoá đơn</TableHead>
              <TableHead className="text-white font-semibold text-right">Tổng Thu dự kiến</TableHead>
              <TableHead className="text-white font-semibold text-right">Thực thu</TableHead>
              <TableHead className="text-white font-semibold text-right">Còn thiếu</TableHead>
              <TableHead className="text-white font-semibold text-right">Hoàn tiền</TableHead>
              <TableHead className="text-white font-semibold">Nguồn khách hàng</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                  Không có dữ liệu
                </TableCell>
              </TableRow>
            ) : (
              paged.map((r, idx) => (
                <TableRow key={r.staffId} className="hover:bg-muted/40">
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {(safePage - 1) * PAGE_SIZE + idx + 1}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-sm">{r.staffName}</span>
                      {r.staffCode && (
                        <span className="text-xs text-muted-foreground">{r.staffCode}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-sm tabular-nums">
                    {r.invoiceCount}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {fmtMoney(r.expectedRevenue)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-green-700 font-medium">
                    {fmtMoney(r.actualRevenue)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    <span className={r.remainingRevenue > 0 ? "text-red-600 font-medium" : ""}>
                      {fmtMoney(r.remainingRevenue)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {fmtMoney(r.cancelledRevenue)}
                  </TableCell>
                  <TableCell>
                    {r.sources.length === 0 ? (
                      <span className="text-xs text-muted-foreground italic">—</span>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {r.sources.map((s) => (
                          <span key={s.name} className="text-xs whitespace-nowrap">
                            <span className="font-medium">{s.name}</span>
                            <span className="text-muted-foreground">: {s.count} ({s.pct}%)</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}

            {/* Totals row */}
            {!isLoading && paged.length > 0 && (
              <TableRow className="bg-muted/60 font-semibold border-t-2">
                <TableCell colSpan={2} className="text-sm">Tổng cộng ({totalRows} nhân sự)</TableCell>
                <TableCell className="text-center text-sm tabular-nums">{totalInvoices}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">{fmtMoney(totalExpected)}</TableCell>
                <TableCell className="text-right text-sm tabular-nums text-green-700">{fmtMoney(totalActual)}</TableCell>
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
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, totalRows)} / {totalRows} nhân sự
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹</Button>
            <span className="px-1">{safePage} / {totalPages}</span>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>›</Button>
          </div>
        </div>
      )}
    </div>
  );
}
