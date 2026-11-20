import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, endOfMonth, startOfMonth } from "date-fns";
import { vi } from "date-fns/locale";
import {
  ArrowLeft,
  AlertTriangle,
  CalendarIcon,
  Download,
  ExternalLink,
  ListFilter,
  PhoneCall,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadXlsx } from "@/lib/excel-utils";
import { getAuthHeaders } from "@/lib/queryClient";

type Props = {
  onBack: () => void;
  defaultLocationId?: string;
};

type CallHistoryRow = {
  id: string;
  locationId: string;
  locationName: string;
  direction: string;
  status: "answered" | "missed" | "no-answer" | string;
  disposition: string;
  phoneNumber: string;
  customerName: string;
  agentName: string;
  sipUser: string;
  sipNumber: string;
  duration: number;
  answerSeconds: number;
  startedAt: number | null;
  endedAt: number | null;
  createdAt: number | null;
  recordingUrl: string;
  price: number;
};

type CallHistoryResponse = {
  items: CallHistoryRow[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  warnings?: string[];
};

function defaultDateRange() {
  const now = new Date();
  return { from: startOfMonth(now), to: endOfMonth(now) };
}

function formatCallDate(value: number | null) {
  if (!value) return "—";
  try {
    return format(new Date(value), "dd/MM/yyyy HH:mm");
  } catch {
    return "—";
  }
}

function formatDuration(seconds: number) {
  const total = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return minutes > 0 ? `${minutes} phút ${remainder} giây` : `${remainder} giây`;
}

function directionLabel(direction: string) {
  if (direction === "outbound") return { label: "Gọi ra", className: "bg-blue-50 text-blue-700 border-blue-200" };
  if (direction === "inbound") return { label: "Gọi vào", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (direction === "local") return { label: "Nội bộ", className: "bg-violet-50 text-violet-700 border-violet-200" };
  return { label: direction || "Không rõ", className: "bg-slate-50 text-slate-600 border-slate-200" };
}

function statusLabel(status: string) {
  if (status === "answered") return { label: "Đã nghe máy", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (status === "missed") return { label: "Nhỡ cuộc gọi", className: "bg-rose-50 text-rose-700 border-rose-200" };
  return { label: "Không trả lời", className: "bg-amber-50 text-amber-700 border-amber-200" };
}

export function CallHistoryReport({ onBack, defaultLocationId = "all" }: Props) {
  const defaultRange = defaultDateRange();
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>(defaultRange);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [locationId, setLocationId] = useState(defaultLocationId || "all");
  const [direction, setDirection] = useState("all");
  const [answerStatus, setAnswerStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [applied, setApplied] = useState({
    search: "",
    locationId: defaultLocationId || "all",
    direction: "all",
    answerStatus: "all",
    dateFrom: format(defaultRange.from, "yyyy-MM-dd"),
    dateTo: format(defaultRange.to, "yyyy-MM-dd"),
  });

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      size: String(pageSize),
      dateFrom: applied.dateFrom,
      dateTo: applied.dateTo,
      locationId: applied.locationId,
    });
    if (applied.search) params.set("search", applied.search);
    if (applied.direction !== "all") params.set("direction", applied.direction);
    if (applied.answerStatus !== "all") params.set("isAnswer", applied.answerStatus);
    return params.toString();
  }, [applied, page, pageSize]);

  const { data, isLoading, isFetching, isError, refetch } = useQuery<CallHistoryResponse>({
    queryKey: ["/api/call-center/omicall/call-history", queryString],
    queryFn: async () => {
      const response = await fetch(`/api/call-center/omicall/call-history?${queryString}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || "Không thể tải lịch sử cuộc gọi");
      return payload;
    },
    staleTime: 30_000,
  });

  const { data: locations = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/locations"],
    queryFn: async () => {
      const response = await fetch("/api/locations", {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!response.ok) return [];
      return response.json();
    },
    staleTime: 120_000,
  });

  const rows = data?.items || [];
  const summary = useMemo(() => ({
    total: rows.length,
    answered: rows.filter((row) => row.status === "answered").length,
    missed: rows.filter((row) => row.status !== "answered").length,
    duration: rows.reduce((sum, row) => sum + (Number(row.duration) || 0), 0),
  }), [rows]);

  const dateLabel = dateRange.from && dateRange.to
    ? `${format(dateRange.from, "d MMM yyyy", { locale: vi })} – ${format(dateRange.to, "d MMM yyyy", { locale: vi })}`
    : "Chọn khoảng thời gian";

  function applyFilters() {
    setPage(1);
    setFilterOpen(false);
    setApplied({
      search: search.trim(),
      locationId,
      direction,
      answerStatus,
      dateFrom: dateRange.from ? format(dateRange.from, "yyyy-MM-dd") : "",
      dateTo: dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : "",
    });
  }

  function resetFilters() {
    const nextRange = defaultDateRange();
    setSearch("");
    setLocationId(defaultLocationId || "all");
    setDirection("all");
    setAnswerStatus("all");
    setDateRange(nextRange);
    setPage(1);
    setFilterOpen(false);
    setApplied({
      search: "",
      locationId: defaultLocationId || "all",
      direction: "all",
      answerStatus: "all",
      dateFrom: format(nextRange.from, "yyyy-MM-dd"),
      dateTo: format(nextRange.to, "yyyy-MM-dd"),
    });
  }

  function downloadReport() {
    downloadXlsx({
      filename: `lich-su-cuoc-goi-${applied.dateFrom || "tat-ca"}`,
      sheetName: "Lịch sử cuộc gọi",
      title: "Báo cáo Lịch sử cuộc gọi",
      subtitle: `${applied.dateFrom || "Tất cả"} – ${applied.dateTo || "Tất cả"}`,
      columns: [
        { header: "STT", width: 6 },
        { header: "Thời gian", width: 20 },
        { header: "Cơ sở", width: 22 },
        { header: "Hướng gọi", width: 14 },
        { header: "Trạng thái", width: 18 },
        { header: "Khách hàng", width: 26 },
        { header: "Số điện thoại", width: 18 },
        { header: "Nhân viên", width: 24 },
        { header: "Máy lẻ", width: 12 },
        { header: "Thời lượng", width: 18 },
        { header: "Đầu số", width: 18 },
      ],
      rows: rows.map((row, index) => [
        index + 1,
        formatCallDate(row.startedAt || row.createdAt),
        row.locationName,
        directionLabel(row.direction).label,
        statusLabel(row.status).label,
        row.customerName || "—",
        row.phoneNumber || "—",
        row.agentName || "—",
        row.sipUser || "—",
        formatDuration(row.duration),
        row.sipNumber || "—",
      ]),
    });
  }

  const loading = isLoading || isFetching;
  const warnings = data?.warnings || [];

  return (
    <div className="space-y-4 mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={onBack} aria-label="Quay lại">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="relative min-w-[210px] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && applyFilters()}
            placeholder="Tìm tên, số điện thoại..."
            className="h-9 pl-9 text-sm"
          />
        </div>

        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9 gap-2 text-sm font-normal whitespace-nowrap">
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="range"
              selected={{ from: dateRange.from, to: dateRange.to }}
              onSelect={(range) => {
                setDateRange({ from: range?.from, to: range?.to });
                if (range?.from && range?.to) setCalendarOpen(false);
              }}
              numberOfMonths={2}
              locale={vi}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9 gap-1.5 text-sm">
              <ListFilter className="h-3.5 w-3.5" />
              Bộ lọc
              {(locationId !== "all" || direction !== "all" || answerStatus !== "all") && (
                <span className="ml-0.5 rounded-full bg-[#1e3a5f] px-1.5 text-[10px] leading-4 text-white">
                  {[locationId !== "all", direction !== "all", answerStatus !== "all"].filter(Boolean).length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[280px] space-y-3">
            <div>
              <p className="text-sm font-semibold">Bộ lọc cuộc gọi</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Chọn điều kiện rồi bấm Lọc để áp dụng.</p>
            </div>
            <div className="space-y-2.5">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Cơ sở</label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Cơ sở" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả cơ sở</SelectItem>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Hướng gọi</label>
                <Select value={direction} onValueChange={setDirection}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Hướng gọi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả hướng</SelectItem>
                    <SelectItem value="outbound">Gọi ra</SelectItem>
                    <SelectItem value="inbound">Gọi vào</SelectItem>
                    <SelectItem value="local">Nội bộ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Trạng thái</label>
                <Select value={answerStatus} onValueChange={setAnswerStatus}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả trạng thái</SelectItem>
                    <SelectItem value="answered">Đã nghe máy</SelectItem>
                    <SelectItem value="missed">Chưa nghe máy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t pt-3">
              <Button variant="outline" className="h-8 text-xs" onClick={resetFilters}>Đặt lại</Button>
              <Button className="h-8 bg-[#1e3a5f] text-xs hover:bg-[#16305a]" onClick={applyFilters}>Lọc</Button>
            </div>
          </PopoverContent>
        </Popover>

        {warnings.length > 0 && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-amber-300 bg-amber-50 text-amber-600 transition-colors hover:bg-amber-100"
                  aria-label="Xem cảnh báo lấy lịch sử cuộc gọi"
                >
                  <AlertTriangle className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="end"
                className="max-w-[460px] whitespace-pre-wrap border-amber-200 bg-amber-50 text-xs text-amber-900 shadow-md"
              >
                {warnings.join("\n")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => void refetch()} title="Tải lại">
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
        <Button variant="outline" className="h-9 gap-1.5" onClick={downloadReport} disabled={rows.length === 0}>
          <Download className="h-3.5 w-3.5" /> Excel
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Cuộc gọi trong trang", value: summary.total, color: "text-blue-600" },
          { label: "Đã nghe máy", value: summary.answered, color: "text-emerald-600" },
          { label: "Chưa nghe máy", value: summary.missed, color: "text-rose-600" },
          { label: "Tổng thời lượng", value: formatDuration(summary.duration), color: "text-violet-600" },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-border/70 bg-card px-4 py-3 shadow-sm">
            <p className="text-[11px] text-muted-foreground">{card.label}</p>
            <p className={`mt-1 text-lg font-bold tabular-nums ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
        {isError ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 px-4 text-center">
            <PhoneCall className="h-8 w-8 text-rose-400" />
            <p className="text-sm font-medium text-rose-600">Không thể tải lịch sử cuộc gọi</p>
            <p className="text-xs text-muted-foreground">Kiểm tra cấu hình Call History URL và API Key Omicall.</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>Thử lại</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Thời gian</TableHead>
                  <TableHead className="whitespace-nowrap">Cơ sở</TableHead>
                  <TableHead>Hướng</TableHead>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead>Số điện thoại</TableHead>
                  <TableHead>Nhân viên</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Thời lượng</TableHead>
                  <TableHead>Ghi âm</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={index}>
                      {Array.from({ length: 9 }).map((__, cell) => (
                        <TableCell key={cell}><Skeleton className="h-4 w-full max-w-[130px]" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-48 text-center text-sm text-muted-foreground">
                      Chưa có lịch sử cuộc gọi trong khoảng thời gian này
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const direction = directionLabel(row.direction);
                    const status = statusLabel(row.status);
                    return (
                      <TableRow key={`${row.locationId}-${row.id}`}>
                        <TableCell className="whitespace-nowrap text-xs">{formatCallDate(row.startedAt || row.createdAt)}</TableCell>
                        <TableCell className="max-w-[150px] truncate text-xs" title={row.locationName}>{row.locationName}</TableCell>
                        <TableCell>
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${direction.className}`}>
                            {direction.label}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate text-xs font-medium" title={row.customerName || undefined}>
                          {row.customerName || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{row.phoneNumber || "—"}</TableCell>
                        <TableCell className="max-w-[150px] truncate text-xs" title={row.agentName || undefined}>
                          {row.agentName || (row.sipUser ? `Máy lẻ ${row.sipUser}` : "—")}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${status.className}`}>
                            {status.label}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{formatDuration(row.duration)}</TableCell>
                        <TableCell>
                          {row.recordingUrl ? (
                            <div className="flex items-center gap-1.5">
                              <audio
                                controls
                                preload="none"
                                src={row.recordingUrl}
                                className="h-8 w-[180px]"
                                aria-label={`Nghe ghi âm cuộc gọi ${row.phoneNumber || ""}`}
                              />
                              <a
                                href={row.recordingUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-muted-foreground hover:text-foreground"
                                title="Mở/tải file ghi âm"
                                aria-label="Mở hoặc tải file ghi âm"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
        {!isError && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
            <span>
              Tổng {Number(data?.totalItems || 0).toLocaleString("vi-VN")} cuộc gọi
              {data?.totalPages ? ` · Trang ${page}/${data.totalPages}` : ""}
            </span>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap">Hiển thị</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-7 w-[74px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                </SelectContent>
              </Select>
              <span className="whitespace-nowrap">cuộc gọi/trang</span>
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>
                Trang trước
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={!data?.hasNext || loading} onClick={() => setPage((value) => value + 1)}>
                Trang sau
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}