import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Clock, X, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { StoreDateRangePicker, type DateRange } from "./StoreDateRangePicker";
import { exportTonKho, type InventoryRow as ExportInventoryRow } from "./storeExportUtils";

type InventoryRow = {
  productId: string;
  code: string;
  name: string;
  warehouseId: string;
  warehouseName: string;
  totalImport: number;
  totalExport: number;
  actualStock: number;
  reservedQty: number;
  availableQty: number;
  status: "ok" | "low" | "out";
  updatedAt: string | null;
};

type HistoryRow = {
  time: string;
  receipt_code: string;
  type: string;
  quantity_delta: number;
  status: string;
  description: string | null;
  created_by: string | null;
};

type Warehouse = { id: string; name: string };

type DetailPopupProps = {
  row: InventoryRow;
  onClose: () => void;
};

function fmtDateTime(dateStr: string | null) {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function statusLabel(s: string) {
  if (s === "completed") return "Hoàn thành";
  if (s === "draft") return "Nháp";
  if (s === "cancelled") return "Đã hủy";
  return s;
}

function statusBadgeClass(s: string) {
  if (s === "completed") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (s === "draft") return "bg-amber-100 text-amber-700 border-amber-200";
  if (s === "cancelled") return "bg-red-100 text-red-700 border-red-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

function txTypeLabel(type: string) {
  switch (type) {
    case "import": return "Nhập kho";
    case "export": return "Xuất kho";
    case "edit_import": return "Sửa nhập kho";
    case "edit_export": return "Sửa xuất kho";
    case "cancel_import": return "Hủy nhập kho";
    case "cancel_export": return "Hủy xuất kho";
    default: return type;
  }
}

function txTypeBadgeClass(type: string) {
  switch (type) {
    case "import": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "export": return "bg-orange-50 text-orange-700 border-orange-200";
    case "edit_import": return "bg-blue-50 text-blue-700 border-blue-200";
    case "edit_export": return "bg-blue-50 text-blue-700 border-blue-200";
    case "cancel_import": return "bg-red-50 text-red-700 border-red-200";
    case "cancel_export": return "bg-red-50 text-red-700 border-red-200";
    default: return "bg-gray-100 text-gray-600 border-gray-200";
  }
}

function DetailPopup({ row, onClose }: DetailPopupProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const { data: history = [], isLoading } = useQuery<HistoryRow[]>({
    queryKey: ["/api/store/inventory", row.productId, "history", row.warehouseId],
    queryFn: () =>
      apiRequest("GET", `/api/store/inventory/${row.productId}/history?warehouseId=${row.warehouseId}`)
        .then(r => r.json()),
    staleTime: 15000,
  });

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-[95vw] h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
          <Clock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          <h2 className="font-semibold text-base flex-1 truncate">
            Chi tiết tồn kho: {row.name}{" "}
            <span className="text-muted-foreground font-normal">({row.code})</span>
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-muted transition-colors text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stat cards */}
        <div className="px-6 pt-4 pb-2 grid grid-cols-5 gap-3">
          <StatCard label="TỔNG NHẬP" value={row.totalImport} colorClass="bg-emerald-50 text-emerald-700 border-emerald-100" />
          <StatCard label="ĐÃ XUẤT" value={row.totalExport} colorClass="bg-gray-50 text-gray-700 border-gray-100" />
          <StatCard label="TỒN KHO" value={row.actualStock} colorClass="bg-blue-50 text-blue-700 border-blue-100" />
          <StatCard label="GIỮ CHỖ" value={row.reservedQty} colorClass="bg-amber-50 text-amber-600 border-amber-100" />
          <StatCard label="KHẢ DỤNG" value={row.availableQty} colorClass="bg-indigo-50 text-indigo-700 border-indigo-100" />
        </div>

        {/* History */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase mb-3 mt-2">
            Lịch sử biến động kho
          </p>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground font-medium">
                <th className="text-left pb-2 font-medium">Thời gian</th>
                <th className="text-left pb-2 font-medium">Mã phiếu</th>
                <th className="text-left pb-2 font-medium">Loại</th>
                <th className="text-right pb-2 font-medium">Số lượng</th>
                <th className="text-left pb-2 pl-3 font-medium">Trạng thái</th>
                <th className="text-left pb-2 pl-3 font-medium">Mô tả</th>
                <th className="text-left pb-2 pl-3 font-medium">Người tạo</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted-foreground text-sm">
                    Đang tải...
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground text-sm">
                    Chưa có lịch sử giao dịch
                  </td>
                </tr>
              ) : (
                history.map((h, i) => {
                  const delta = h.quantity_delta ?? 0;
                  const isPositive = delta > 0;
                  return (
                    <tr key={i} className="border-t border-border/50">
                      <td className="py-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDateTime(h.time)}</td>
                      <td className="py-2 font-mono text-xs font-medium">{h.receipt_code}</td>
                      <td className="py-2 whitespace-nowrap">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border",
                          txTypeBadgeClass(h.type)
                        )}>
                          {txTypeLabel(h.type)}
                        </span>
                      </td>
                      <td className="py-2 text-right font-medium tabular-nums">
                        <span className={isPositive ? "text-emerald-600" : "text-red-600"}>
                          {isPositive ? "+" : ""}{delta}
                        </span>
                      </td>
                      <td className="py-2 pl-3">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border",
                          statusBadgeClass(h.status)
                        )}>
                          {statusLabel(h.status)}
                        </span>
                      </td>
                      <td className="py-2 pl-3 text-xs text-muted-foreground max-w-[160px] truncate" title={h.description || ""}>
                        {h.description || "—"}
                      </td>
                      <td className="py-2 pl-3 text-xs text-muted-foreground whitespace-nowrap">{h.created_by || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <div className={cn("rounded-xl border p-3 flex flex-col items-center gap-1", colorClass)}>
      <span className="text-[10px] font-bold tracking-wide uppercase opacity-70">{label}</span>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
    </div>
  );
}

const STATUS_OPTIONS = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "ok", label: "Còn hàng" },
  { value: "low", label: "Sắp hết" },
  { value: "out", label: "Hết hàng" },
];

const PAGE_SIZE_OPTIONS = [20, 30, 50, 100];

export function StoreInventoryTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [detailRow, setDetailRow] = useState<InventoryRow | null>(null);

  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ["/api/store/warehouses"],
    queryFn: () => apiRequest("GET", "/api/store/warehouses").then(r => r.json()),
    staleTime: 60000,
  });

  const params = new URLSearchParams();
  if (search.trim()) params.set("q", search.trim());
  if (warehouseFilter !== "all") params.set("warehouseId", warehouseFilter);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (dateRange.from) params.set("dateFrom", dateRange.from.toISOString().slice(0, 10));
  if (dateRange.to) params.set("dateTo", dateRange.to.toISOString().slice(0, 10));
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));

  const { data: resp, isLoading, refetch } = useQuery<{ data: InventoryRow[]; total: number }>({
    queryKey: ["/api/store/inventory", search, warehouseFilter, statusFilter, dateRange, page, pageSize],
    queryFn: () =>
      apiRequest("GET", `/api/store/inventory?${params.toString()}`).then(r => r.json()),
    staleTime: 15000,
    refetchInterval: 30000,
    retry: 2,
    retryDelay: 1500,
  });

  const paged = resp?.data ?? [];
  const total = resp?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => { setPage(1); }, [search, warehouseFilter, statusFilter, dateRange]);

  function handlePageSize(n: number) { setPageSize(n); setPage(1); }

  function inventoryStatusBadge(status: string) {
    if (status === "ok") return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border bg-emerald-100 text-emerald-700 border-emerald-200">Còn hàng</span>;
    if (status === "low") return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border bg-amber-100 text-amber-700 border-amber-200">Sắp hết</span>;
    return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border bg-red-100 text-red-700 border-red-200">Hết hàng</span>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header + Filters */}
      <div className="px-5 pt-3 pb-3 shrink-0 border-b border-border">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Input
              placeholder="Mã hoặc tên sản phẩm..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" strokeWidth="2" />
              <path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>

          <StoreDateRangePicker value={dateRange} onChange={r => { setDateRange(r); setPage(1); }} placeholder="Lọc theo ngày cập nhật" />

          <Select value={warehouseFilter} onValueChange={v => { setWarehouseFilter(v); setPage(1); }}>
            <SelectTrigger className="h-9 text-sm w-[160px]">
              <SelectValue placeholder="Tất cả kho" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả kho</SelectItem>
              {warehouses.map(w => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="h-9 text-sm w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(pageSize)} onValueChange={v => handlePageSize(Number(v))}>
            <SelectTrigger className="h-9 text-sm w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map(n => (
                <SelectItem key={n} value={String(n)}>{n} dòng / trang</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1.5 h-9 text-xs"
              onClick={() => exportTonKho(
                paged as ExportInventoryRow[],
                async () => {
                  const p = new URLSearchParams();
                  if (search) p.set("search", search);
                  if (warehouseFilter !== "all") p.set("warehouseId", warehouseFilter);
                  if (statusFilter !== "all") p.set("status", statusFilter);
                  p.set("page", "1");
                  p.set("pageSize", "9999");
                  const r = await fetch(`/api/store/inventory?${p}`, { credentials: "include" });
                  const json = await r.json();
                  return (json.data ?? []) as ExportInventoryRow[];
                },
                toast,
              )}
            >
              <FileDown className="w-3.5 h-3.5" /> Tải xuống
            </Button>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 h-9 hover:bg-muted/50 transition-colors"
            >
              <Clock className="w-3.5 h-3.5" /> Làm mới
            </button>
          </div>
        </div>
      </div>

      {/* Table - scrollable area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border text-xs text-muted-foreground font-medium">
              <th className="text-left px-4 py-3">Mã SP</th>
              <th className="text-left px-4 py-3">Tên sản phẩm</th>
              <th className="text-left px-4 py-3">Kho</th>
              <th className="text-right px-4 py-3">Tổng nhập</th>
              <th className="text-right px-4 py-3">Đã xuất</th>
              <th className="text-right px-4 py-3">Tồn thực tế</th>
              <th className="text-right px-4 py-3">Đã giữ chỗ</th>
              <th className="text-right px-4 py-3">Khả dụng</th>
              <th className="text-center px-4 py-3">Trạng thái</th>
              <th className="text-right px-4 py-3">Cập nhật</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={10} className="py-16 text-center text-muted-foreground">
                  Đang tải dữ liệu...
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-16 text-center text-muted-foreground">
                  Không có dữ liệu tồn kho
                </td>
              </tr>
            ) : (
              paged.map((row, i) => (
                <tr
                  key={`${row.productId}-${row.warehouseId}`}
                  className={cn("border-b border-border/60 hover:bg-muted/20 transition-colors", i % 2 === 0 ? "" : "bg-muted/10")}
                >
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.code}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setDetailRow(row)}
                      className="font-medium text-foreground hover:text-primary hover:underline text-left transition-colors"
                    >
                      {row.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.warehouseName}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-600">{row.totalImport}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.totalExport}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold">{row.actualStock}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-amber-500">{row.reservedQty}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-blue-600">{row.availableQty}</td>
                  <td className="px-4 py-3 text-center">{inventoryStatusBadge(row.status)}</td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDateTime(row.updatedAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </div>

      {/* Footer / Pagination */}
      <div className="px-5 py-3 shrink-0 border-t border-border">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="text-xs">
            Hiển thị {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total} sản phẩm
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium disabled:opacity-40 hover:bg-muted/50 transition-colors"
              >
                ← Trước
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                .reduce<(number | "…")[]>((acc, n, i, arr) => {
                  if (i > 0 && arr[i - 1] !== n - 1) acc.push("…");
                  acc.push(n);
                  return acc;
                }, [])
                .map((item, i) =>
                  item === "…" ? (
                    <span key={`ellipsis-${i}`} className="px-2 py-1.5 text-xs">…</span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setPage(item as number)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                        page === item
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-border hover:bg-muted/50"
                      )}
                    >
                      {item}
                    </button>
                  )
                )
              }
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium disabled:opacity-40 hover:bg-muted/50 transition-colors"
              >
                Tiếp →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Detail popup */}
      {detailRow && (
        <DetailPopup row={detailRow} onClose={() => setDetailRow(null)} />
      )}
    </div>
  );
}
