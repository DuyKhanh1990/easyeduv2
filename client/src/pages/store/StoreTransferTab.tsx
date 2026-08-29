import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Settings, Trash2, Eye, ArrowRightLeft, Search, SlidersHorizontal, X, FileDown, History, AlignJustify } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StoreTransferDialog, type TransferFormData } from "./StoreTransferDialog";
import { exportChuyenKho } from "./storeExportUtils";
import { StoreDateRangePicker, type DateRange } from "./StoreDateRangePicker";
import { StoreTransferHistoryTab } from "./StoreTransferHistoryTab";
import { useLocations } from "@/hooks/use-locations";
import { cn } from "@/lib/utils";
import { HistoryDialog } from "@/components/common/HistoryDialog";

type TransferRow = {
  id: string;
  code: string;
  date: string;
  status: string;
  note: string | null;
  from_warehouse_id: string;
  to_warehouse_id: string;
  from_warehouse_name: string | null;
  to_warehouse_name: string | null;
  created_by_name: string | null;
  item_count: number;
  total_quantity: number;
  created_at: string;
};

type Warehouse = { id: string; name: string };

const PAGE_SIZE_OPTIONS = [20, 30, 50, 100];

function fmtDate(dateStr: string) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtDay(dateStr: string) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "draft") return <Badge className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.5 border-0">NHÁP</Badge>;
  if (status === "transferring") return <Badge className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 border-0">ĐANG CHUYỂN</Badge>;
  if (status === "completed") return <Badge className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 border-0">HOÀN THÀNH</Badge>;
  if (status === "cancelled") return <Badge className="bg-red-100 text-red-600 text-[10px] px-1.5 py-0.5 border-0">ĐÃ HỦY</Badge>;
  return <Badge className="text-[10px] px-1.5 py-0.5 border-0">{status}</Badge>;
}

function Pagination({ page, totalPages, total, pageSize, onPage, onPageSize }: {
  page: number; totalPages: number; total: number; pageSize: number;
  onPage: (p: number) => void; onPageSize: (n: number) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
      <div className="flex items-center gap-3">
        <span>Hiển thị {start}–{end} / {total} phiếu</span>
        <Select value={String(pageSize)} onValueChange={v => onPageSize(Number(v))}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map(n => (
              <SelectItem key={n} value={String(n)}>{n} dòng / trang</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium disabled:opacity-40 hover:bg-muted/50 transition-colors"
          >← Trước</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
            .reduce<(number | "…")[]>((acc, n, i, arr) => {
              if (i > 0 && arr[i - 1] !== n - 1) acc.push("…");
              acc.push(n);
              return acc;
            }, [])
            .map((item, i) =>
              item === "…"
                ? <span key={`e-${i}`} className="px-2 py-1.5 text-xs">…</span>
                : <button
                    key={item}
                    onClick={() => onPage(item as number)}
                    className={cn("px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                      page === item ? "bg-primary border-primary text-primary-foreground" : "border-border hover:bg-muted/50"
                    )}
                  >{item}</button>
            )}
          <button
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium disabled:opacity-40 hover:bg-muted/50 transition-colors"
          >Tiếp →</button>
        </div>
      )}
    </div>
  );
}

export function StoreTransferTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activeSubTab, setActiveSubTab] = useState<"list" | "history">("list");
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const { data: locationsList } = useLocations();
  const locationOptions = (locationsList ?? []).map((l: any) => ({ value: l.id, label: l.name }));

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showDialog, setShowDialog] = useState(false);
  const [editData, setEditData] = useState<(Partial<TransferFormData> & { id?: string; status?: string }) | undefined>(undefined);
  const [confirmAction, setConfirmAction] = useState<{ type: "transfer" | "cancel"; row: TransferRow } | null>(null);

  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [filterFromWarehouse, setFilterFromWarehouse] = useState("all");
  const [filterToWarehouse, setFilterToWarehouse] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => { setPage(1); }, [search, dateRange, filterFromWarehouse, filterToWarehouse, filterStatus]);

  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ["/api/store/warehouses"],
    queryFn: () => apiRequest("GET", "/api/store/warehouses").then(r => r.json()),
    staleTime: 60000,
  });

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (search.trim()) params.set("search", search.trim());
  if (dateRange.from) params.set("dateFrom", dateRange.from.toISOString().slice(0, 10));
  if (dateRange.to) params.set("dateTo", dateRange.to.toISOString().slice(0, 10));
  if (filterFromWarehouse !== "all") params.set("fromWarehouseId", filterFromWarehouse);
  if (filterToWarehouse !== "all") params.set("toWarehouseId", filterToWarehouse);
  if (filterStatus !== "all") params.set("status", filterStatus);

  const queryKey = ["/api/store/transfers", page, pageSize, search, dateRange, filterFromWarehouse, filterToWarehouse, filterStatus];
  const { data: resp, isLoading } = useQuery<{ data: TransferRow[]; total: number }>({
    queryKey,
    queryFn: () => apiRequest("GET", `/api/store/transfers?${params.toString()}`).then(r => r.json()),
    retry: 2,
    retryDelay: 1500,
  });

  const transfers = resp?.data ?? [];
  const total = resp?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const activeFilterCount = [filterFromWarehouse, filterToWarehouse, filterStatus].filter(v => v !== "all").length;
  const hasActiveFilter = !!search.trim() || !!dateRange.from || activeFilterCount > 0;

  function handleReset() {
    setSearch("");
    setDateRange({});
    setFilterFromWarehouse("all");
    setFilterToWarehouse("all");
    setFilterStatus("all");
  }

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/store/transfers"] });

  function handlePageSize(n: number) { setPageSize(n); setPage(1); }

  function showError(e: any, fallback = "Lỗi") {
    const msg: string = e?.message || fallback;
    const lines = msg.split("\n");
    toast({
      variant: "destructive",
      title: lines[0],
      description: lines.length > 1 ? (
        <ul className="mt-1 space-y-0.5 text-xs list-none">
          {lines.slice(1).map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      ) as any : undefined,
      duration: 6000,
    });
  }

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/store/transfers", body).then(r => r.json()),
    onSuccess: () => { toast({ title: "Đã tạo phiếu chuyển kho" }); invalidate(); setShowDialog(false); },
    onError: (e: any) => showError(e, "Lỗi khi tạo phiếu"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => apiRequest("PATCH", `/api/store/transfers/${id}`, body).then(r => r.json()),
    onSuccess: () => { toast({ title: "Đã cập nhật phiếu chuyển kho" }); invalidate(); setShowDialog(false); setEditData(undefined); },
    onError: (e: any) => showError(e, "Lỗi khi cập nhật phiếu"),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "transfer" | "cancel" }) =>
      apiRequest("POST", `/api/store/transfers/${id}/${action}`).then(r => r.json()),
    onSuccess: (data: any, vars) => {
      const messages: Record<string, string> = {
        transfer: "Chuyển kho hoàn tất! Tồn kho đã được cập nhật.",
        cancel: data?.action === "deleted" ? "Đã xóa phiếu nháp." : "Đã hủy phiếu. Tồn kho nguồn đã được hoàn trả.",
      };
      toast({ title: messages[vars.action] });
      invalidate();
      setConfirmAction(null);
    },
    onError: (e: any) => { showError(e, "Lỗi thao tác"); setConfirmAction(null); },
  });

  const [isTransferring, setIsTransferring] = useState(false);
  const isSaving = createMutation.isPending || updateMutation.isPending || isTransferring;

  async function handleSave(data: TransferFormData, saveAndTransfer: boolean) {
    const body = {
      code: data.code,
      date: data.date,
      fromLocationId: data.fromLocationId || null,
      fromWarehouseId: data.fromWarehouseId,
      toLocationId: data.toLocationId || null,
      toWarehouseId: data.toWarehouseId,
      note: data.note || null,
      hasReceiptIncome: data.hasReceiptIncome,
      hasReceiptExpense: data.hasReceiptExpense,
      items: data.items.map(i => ({
        productId: i.productId,
        productCode: i.productCode,
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: i.unitPrice ?? 0,
      })),
    };

    if (saveAndTransfer) {
      setIsTransferring(true);
      try {
        let transferId: string;
        let justCreated = false;
        if (editData?.id) {
          await apiRequest("PATCH", `/api/store/transfers/${editData.id}`, body).then(r => r.json());
          transferId = editData.id;
        } else {
          const created = await apiRequest("POST", "/api/store/transfers", body).then(r => r.json());
          transferId = created.id;
          justCreated = true;
        }
        try {
          await apiRequest("POST", `/api/store/transfers/${transferId}/transfer`).then(r => r.json());
        } catch (transferErr: any) {
          // Nếu vừa tạo draft mà /transfer thất bại, xóa draft đó đi
          // để user có thể retry mà không bị "Mã phiếu đã tồn tại"
          if (justCreated) {
            try {
              await apiRequest("POST", `/api/store/transfers/${transferId}/cancel`);
            } catch {
              // bỏ qua lỗi khi xóa draft
            }
          }
          throw transferErr;
        }
        toast({ title: "Chuyển kho hoàn tất! Tồn kho đã được cập nhật." });
        invalidate();
        setShowDialog(false);
        setEditData(undefined);
      } catch (e: any) {
        showError(e, "Lỗi khi chuyển kho");
      } finally {
        setIsTransferring(false);
      }
    } else {
      if (editData?.id) {
        updateMutation.mutate({ id: editData.id, body });
      } else {
        createMutation.mutate(body);
      }
    }
  }

  async function openView(row: TransferRow) {
    try {
      const detail = await apiRequest("GET", `/api/store/transfers/${row.id}`).then(r => r.json());
      setEditData({
        id: detail.id,
        status: detail.status,
        code: detail.code,
        date: detail.date?.slice(0, 10) ?? "",
        fromLocationId: detail.from_location_id ?? "",
        fromWarehouseId: detail.from_warehouse_id,
        toLocationId: detail.to_location_id ?? "",
        toWarehouseId: detail.to_warehouse_id,
        note: detail.note ?? "",
        hasReceiptIncome: detail.has_receipt_income ?? false,
        hasReceiptExpense: detail.has_receipt_expense ?? false,
        items: (detail.items ?? []).map((item: any) => ({
          _key: item.id,
          productId: item.product_id,
          productCode: item.product_code,
          productName: item.product_name,
          quantity: item.quantity,
          unitPrice: parseFloat(item.unit_price ?? "0") || 0,
          currentStock: 0,
        })),
      });
      setShowDialog(true);
    } catch {
      toast({ variant: "destructive", title: "Lỗi khi tải phiếu" });
    }
  }

  const confirmLabels: Record<string, { title: string; desc: string; action: string; variant?: "destructive" }> = {
    transfer: {
      title: "Xác nhận chuyển kho?",
      desc: "Tồn kho nguồn sẽ bị trừ và kho đích sẽ được cộng ngay. Hành động không thể hoàn tác.",
      action: "Xác nhận chuyển",
    },
    cancel: {
      title: "Xóa phiếu nháp?",
      desc: "Phiếu nháp sẽ bị xóa vĩnh viễn.",
      action: "Xóa",
      variant: "destructive",
    },
  };

  const ca = confirmAction ? confirmLabels[confirmAction.type] : null;

  return (
    <div className="flex flex-col h-full">
      {/* Subtab navigation */}
      <div className="flex items-center gap-0 px-5 border-b border-border shrink-0">
        <button
          onClick={() => setActiveSubTab("list")}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeSubTab === "list"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <AlignJustify className="h-3.5 w-3.5" />
          Danh sách
        </button>
        <button
          onClick={() => setHistoryDialogOpen(true)}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            historyDialogOpen
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <History className="h-3.5 w-3.5" />
          Lịch sử
        </button>
      </div>

      {/* History subtab */}
      {activeSubTab === "history" ? (
        <StoreTransferHistoryTab locationOptions={locationOptions} />
      ) : (
      <>
      {/* Header (list) */}
      <div className="px-5 pt-3 pb-3 shrink-0 border-b border-border">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Tìm mã phiếu, kho nguồn, kho đích..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>

          <StoreDateRangePicker value={dateRange} onChange={setDateRange} />

          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 gap-2 text-sm font-normal relative whitespace-nowrap">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Bộ lọc
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Bộ lọc</span>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground px-2"
                  onClick={() => { setFilterFromWarehouse("all"); setFilterToWarehouse("all"); setFilterStatus("all"); }}>
                  <X className="h-3 w-3 mr-1" /> Xoá bộ lọc
                </Button>
              </div>
              <Separator />
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Kho nguồn</label>
                <Select value={filterFromWarehouse} onValueChange={setFilterFromWarehouse}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Tất cả kho nguồn" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả kho nguồn</SelectItem>
                    {warehouses.map(w => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Kho đích</label>
                <Select value={filterToWarehouse} onValueChange={setFilterToWarehouse}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Tất cả kho đích" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả kho đích</SelectItem>
                    {warehouses.map(w => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Trạng thái</label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Tất cả trạng thái" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả trạng thái</SelectItem>
                    <SelectItem value="draft">Nháp</SelectItem>
                    <SelectItem value="transferring">Đang chuyển</SelectItem>
                    <SelectItem value="completed">Hoàn thành</SelectItem>
                    <SelectItem value="cancelled">Đã hủy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>

          {hasActiveFilter && (
            <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground" onClick={handleReset}>
              <X className="h-3.5 w-3.5 mr-1" /> Xóa tất cả
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1.5 h-9 text-xs"
              onClick={() => exportChuyenKho(transfers, toast)}
            >
              <FileDown className="w-3.5 h-3.5" /> Tải xuống
            </Button>
            <Button
              size="sm"
              onClick={() => { setEditData(undefined); setShowDialog(true); }}
              className="flex items-center gap-1.5 h-9 bg-indigo-600 hover:bg-indigo-700"
            >
              <Plus className="w-3.5 h-3.5" /> Tạo phiếu chuyển kho
            </Button>
          </div>
        </div>
      </div>

      {/* Table - scrollable area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
      <div className="border border-border rounded-xl overflow-x-auto">
        <table className="text-xs border-separate border-spacing-0 w-full" style={{ minWidth: 900 }}>
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Ngày tạo</th>
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Mã phiếu</th>
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Ngày CK</th>
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Kho nguồn</th>
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Kho đích</th>
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Trạng thái</th>
              <th className="text-center px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">SP</th>
              <th className="text-center px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">SL</th>
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Người tạo</th>
              <th className="text-center px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={10} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">Đang tải...</span>
                  </div>
                </td>
              </tr>
            ) : transfers.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-12 text-muted-foreground text-sm">
                  {hasActiveFilter
                    ? "Không tìm thấy phiếu nào phù hợp với bộ lọc."
                    : <>Chưa có phiếu chuyển kho nào. Nhấn <span className="font-medium text-foreground">Tạo phiếu chuyển kho</span> để bắt đầu.</>}
                </td>
              </tr>
            ) : transfers.map(r => (
              <tr key={r.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{fmtDate(r.created_at)}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <span className="font-mono font-medium text-indigo-600">{r.code}</span>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{fmtDay(r.date)}</td>
                <td className="px-4 py-2.5 whitespace-nowrap max-w-[180px] truncate" title={r.from_warehouse_name ?? ""}>{r.from_warehouse_name ?? "—"}</td>
                <td className="px-4 py-2.5 whitespace-nowrap max-w-[180px] truncate" title={r.to_warehouse_name ?? ""}>{r.to_warehouse_name ?? "—"}</td>
                <td className="px-4 py-2.5 whitespace-nowrap"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-2.5 text-center tabular-nums">{r.item_count}</td>
                <td className="px-4 py-2.5 text-center tabular-nums font-medium">{r.total_quantity}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{r.created_by_name ?? "—"}</td>
                <td className="px-4 py-2.5 text-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44 text-xs">
                      <DropdownMenuItem className="gap-2 text-xs cursor-pointer" onClick={() => openView(r)}>
                        <Eye className="w-3.5 h-3.5" />
                        {r.status === "draft" ? "Sửa" : "Xem chi tiết"}
                      </DropdownMenuItem>

                      {r.status === "draft" && (
                        <DropdownMenuItem
                          className="gap-2 text-xs cursor-pointer text-indigo-700 focus:text-indigo-700"
                          onClick={() => setConfirmAction({ type: "transfer", row: r })}
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" /> Xác nhận chuyển
                        </DropdownMenuItem>
                      )}

                      {r.status === "draft" && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="gap-2 text-xs cursor-pointer text-destructive focus:text-destructive"
                            onClick={() => setConfirmAction({ type: "cancel", row: r })}
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Xóa nháp
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>

      {/* Footer / Pagination */}
      <div className="px-5 py-3 shrink-0 border-t border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">NHÁP</span>
          <span>→ Xác nhận chuyển (⚙) hoặc "Lưu và chuyển" trong dialog →</span>
          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">HOÀN THÀNH</span>
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={handlePageSize}
        />
      </div>

      </>
      )}

      {showDialog && (
        <StoreTransferDialog
          initialData={editData}
          onClose={() => { setShowDialog(false); setEditData(undefined); }}
          onSave={handleSave}
          isSaving={isSaving}
        />
      )}

      <AlertDialog open={!!confirmAction} onOpenChange={o => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ca?.title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1.5 text-sm text-muted-foreground">
                <p>Phiếu <span className="font-semibold text-foreground">{confirmAction?.row.code}</span></p>
                <p>{ca?.desc}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Không</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAction && actionMutation.mutate({ id: confirmAction.row.id, action: confirmAction.type })}
              className={confirmAction?.type === "cancel" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {actionMutation.isPending ? "Đang xử lý..." : ca?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <HistoryDialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen} title="Lịch sử chuyển kho">
        <StoreTransferHistoryTab locationOptions={locationOptions} />
      </HistoryDialog>
    </div>
  );
}
