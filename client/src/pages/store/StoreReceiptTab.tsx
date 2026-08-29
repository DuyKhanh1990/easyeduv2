import { useState, useMemo, useEffect } from "react";
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
import { Plus, Settings, Trash2, Eye, Pencil, Search, SlidersHorizontal, X, FileDown, History } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StoreReceiptDialog, type ReceiptFormData } from "./StoreReceiptDialog";
import { exportNhapKho } from "./storeExportUtils";
import { StoreReceiptPrintDialog } from "./StoreReceiptPrintDialog";
import { StoreDateRangePicker, type DateRange } from "./StoreDateRangePicker";
import { StoreReceiptHistoryTab } from "./StoreReceiptHistoryTab";
import { useLocations } from "@/hooks/use-locations";
import { HistoryDialog } from "@/components/common/HistoryDialog";

type ReceiptRow = {
  id: string;
  code: string;
  name: string;
  date: string;
  status: string;
  has_invoice: boolean;
  total_amount: string;
  location_id: string | null;
  warehouse_id: string | null;
  supplier_id: string | null;
  location_name: string | null;
  warehouse_name: string | null;
  supplier_name: string | null;
  created_by_name: string | null;
  item_count: number;
  total_quantity: number;
  created_at: string;
};

function fmtVND(val: string | number | null | undefined) {
  if (val == null) return "0 đ";
  const n = typeof val === "string" ? parseFloat(val) : val;
  return isNaN(n) ? "0 đ" : n.toLocaleString("vi-VN") + " đ";
}

function fmtDate(dateStr: string) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function StoreReceiptTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activeSubTab, setActiveSubTab] = useState<"list" | "history">("list");
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const { data: locationsList } = useLocations();
  const locationOptions = (locationsList ?? []).map((l: any) => ({ value: l.id, label: l.name }));

  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<ReceiptFormData> & { id?: string } | undefined>(undefined);
  const [deleteItem, setDeleteItem] = useState<ReceiptRow | null>(null);
  const [viewRow, setViewRow] = useState<ReceiptRow | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [invoiceLockedMsg, setInvoiceLockedMsg] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [filterLocation, setFilterLocation] = useState("all");
  const [filterWarehouse, setFilterWarehouse] = useState("all");
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);

  const { data: receipts = [], isLoading } = useQuery<ReceiptRow[]>({
    queryKey: ["/api/store/receipts"],
    queryFn: () => apiRequest("GET", "/api/store/receipts").then(r => r.json()),
  });

  const uniqueLocations = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of receipts) {
      if (r.location_id && r.location_name) seen.set(r.location_id, r.location_name);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [receipts]);

  const uniqueWarehouses = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of receipts) {
      if (r.warehouse_id && r.warehouse_name) seen.set(r.warehouse_id, r.warehouse_name);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [receipts]);

  const uniqueSuppliers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of receipts) {
      if (r.supplier_id && r.supplier_name) seen.set(r.supplier_id, r.supplier_name);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [receipts]);

  const filtered = useMemo(() => {
    let result = receipts;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.supplier_name?.toLowerCase().includes(q)) ||
        (r.warehouse_name?.toLowerCase().includes(q)) ||
        (r.location_name?.toLowerCase().includes(q)) ||
        (r.created_by_name?.toLowerCase().includes(q))
      );
    }

    if (dateRange.from) {
      const from = new Date(dateRange.from);
      from.setHours(0, 0, 0, 0);
      result = result.filter(r => new Date(r.created_at) >= from);
    }
    if (dateRange.to) {
      const to = new Date(dateRange.to);
      to.setHours(23, 59, 59, 999);
      result = result.filter(r => new Date(r.created_at) <= to);
    }

    if (filterLocation !== "all") result = result.filter(r => r.location_id === filterLocation);
    if (filterWarehouse !== "all") result = result.filter(r => r.warehouse_id === filterWarehouse);
    if (filterSupplier !== "all") result = result.filter(r => r.supplier_id === filterSupplier);
    if (filterStatus !== "all") result = result.filter(r => r.status === filterStatus);

    return result;
  }, [receipts, search, dateRange, filterLocation, filterWarehouse, filterSupplier, filterStatus]);

  useEffect(() => { setPage(1); }, [search, dateRange, filterLocation, filterWarehouse, filterSupplier, filterStatus]);

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIdx = (page - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalItems);
  const paginatedReceipts = filtered.slice(startIdx, endIdx);

  const activeFilterCount = [filterLocation, filterWarehouse, filterSupplier, filterStatus].filter(v => v !== "all").length;
  const hasActiveFilter = !!search.trim() || !!dateRange.from || activeFilterCount > 0;

  function handleReset() {
    setSearch("");
    setDateRange({});
    setFilterLocation("all");
    setFilterWarehouse("all");
    setFilterSupplier("all");
    setFilterStatus("all");
  }

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/store/receipts"] });

  function showError(e: any, fallback = "Lỗi") {
    if (e?.invoiceLocked) {
      setInvoiceLockedMsg(e.message);
      return;
    }
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
    });
  }

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/store/receipts", body).then(r => r.json()),
    onSuccess: () => { toast({ title: "Đã tạo phiếu nhập kho" }); invalidate(); setShowDialog(false); },
    onError: (e: any) => showError(e),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => apiRequest("PATCH", `/api/store/receipts/${id}`, body).then(r => r.json()),
    onSuccess: () => { toast({ title: "Đã cập nhật phiếu nhập kho" }); invalidate(); setShowDialog(false); setEditId(null); },
    onError: (e: any) => showError(e),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/store/receipts/${id}`).then(r => r.json()),
    onSuccess: (data: any) => {
      if (data?.action === "cancelled") {
        toast({ title: "Đã hủy phiếu nhập kho", description: "Tồn kho đã được trừ lại" });
      } else {
        toast({ title: "Đã xoá phiếu nhập kho" });
      }
      invalidate();
      setDeleteItem(null);
    },
    onError: (e: any) => {
      setDeleteItem(null);
      showError(e);
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function toNullOrUUID(v: string | null | undefined) {
    return v && v.trim() !== "" ? v : null;
  }

  function sanitizeBody(data: ReceiptFormData, status: "draft" | "completed") {
    return {
      code: data.code,
      name: data.name,
      locationId: toNullOrUUID(data.locationId),
      warehouseId: toNullOrUUID(data.warehouseId),
      date: data.date,
      supplierId: toNullOrUUID(data.supplierId),
      note: data.note || null,
      discount: data.discount,
      discountType: data.discountType,
      surcharge: data.surcharge,
      surchargeType: data.surchargeType,
      hasInvoice: data.hasInvoice,
      invoiceNote: data.invoiceNote || null,
      paidAmount: (data as any).paidAmount ?? 0,
      status,
      totalAmount: data.items.reduce((sum, i) => {
        const sub = i.quantity * i.costPrice;
        const disc = data.discountType === "VND" ? data.discount : sub * data.discount / 100;
        const sur = data.surchargeType === "VND" ? data.surcharge : sub * data.surcharge / 100;
        return sum + sub - disc + sur;
      }, 0),
      items: data.items.map(({ _key, ...rest }) => ({
        ...rest,
        productId: toNullOrUUID(rest.productId),
        categoryId: toNullOrUUID(rest.categoryId),
        colorId: toNullOrUUID(rest.colorId),
        sizeId: toNullOrUUID(rest.sizeId),
        unitId: toNullOrUUID(rest.unitId),
      })),
    };
  }

  function handleSave(data: ReceiptFormData, status: "draft" | "completed") {
    const body = sanitizeBody(data, status);
    if (editId) {
      updateMutation.mutate({ id: editId, body });
    } else {
      createMutation.mutate(body);
    }
  }

  async function openEdit(row: ReceiptRow) {
    try {
      const detail = await apiRequest("GET", `/api/store/receipts/${row.id}`).then(r => r.json());
      setEditData({
        id: detail.id,
        code: detail.code,
        name: detail.name,
        locationId: detail.locationId ?? "",
        warehouseId: detail.warehouseId ?? "",
        date: detail.date ?? "",
        supplierId: detail.supplierId ?? "",
        note: detail.note ?? "",
        discount: parseFloat(detail.discount ?? "0"),
        discountType: detail.discountType ?? "VND",
        surcharge: parseFloat(detail.surcharge ?? "0"),
        surchargeType: detail.surchargeType ?? "VND",
        hasInvoice: detail.hasInvoice ?? false,
        invoiceNote: detail.invoiceNote ?? "",
        status: detail.status,
        items: (detail.items ?? []).map((item: any, idx: number) => ({
          _key: `edit_${idx}`,
          productId: item.productId,
          productCode: item.productCode,
          productName: item.productName,
          quantity: item.quantity,
          categoryId: item.categoryId ?? "",
          colorId: item.colorId ?? "",
          sizeId: item.sizeId ?? "",
          unitId: item.unitId ?? "",
          costPrice: parseFloat(item.costPrice ?? "0"),
          salePrice: parseFloat(item.salePrice ?? "0"),
          starPrice: item.starPrice ?? 0,
        })),
      });
      setEditId(row.id);
      setShowDialog(true);
    } catch {
      toast({ variant: "destructive", title: "Lỗi khi tải phiếu" });
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab nav */}
      <div className="px-5 pt-3 pb-0 shrink-0 flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setActiveSubTab("list")}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeSubTab === "list"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
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

      {/* History sub-tab */}
      {activeSubTab === "history" ? (
        <StoreReceiptHistoryTab locationOptions={locationOptions} />
      ) : (
      <>
      {/* Header (list sub-tab) */}
      <div className="px-5 pt-3 pb-3 shrink-0 border-b border-border">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Tìm mã, tên, kho, nhà cung cấp..."
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
                  onClick={() => { setFilterLocation("all"); setFilterWarehouse("all"); setFilterSupplier("all"); setFilterStatus("all"); }}>
                  <X className="h-3 w-3 mr-1" /> Xoá bộ lọc
                </Button>
              </div>
              <Separator />
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Cơ sở</label>
                <Select value={filterLocation} onValueChange={setFilterLocation}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Tất cả cơ sở" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả cơ sở</SelectItem>
                    {uniqueLocations.map(loc => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Kho</label>
                <Select value={filterWarehouse} onValueChange={setFilterWarehouse}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Tất cả kho" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả kho</SelectItem>
                    {uniqueWarehouses.map(w => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Nhà cung cấp</label>
                <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Tất cả NCC" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả nhà cung cấp</SelectItem>
                    {uniqueSuppliers.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
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
                    <SelectItem value="completed">Nhập kho</SelectItem>
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
              onClick={() => exportNhapKho(filtered, toast)}
            >
              <FileDown className="w-3.5 h-3.5" /> Tải xuống
            </Button>
            <Button
              size="sm"
              onClick={() => { setEditData(undefined); setEditId(null); setShowDialog(true); }}
              className="flex items-center gap-1.5 h-9"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm phiếu nhập kho
            </Button>
          </div>
        </div>
      </div>

      {/* Table - scrollable area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
      <div className="border border-border rounded-xl overflow-x-auto">
        <table className="text-xs border-separate border-spacing-0 w-full" style={{ minWidth: 1080 }}>
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Ngày tạo</th>
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Cơ sở</th>
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Mã Phiếu</th>
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Tên phiếu</th>
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Kho</th>
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Trạng thái</th>
              <th className="text-center px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Số SP</th>
              <th className="text-center px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">SL</th>
              <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Tổng tiền</th>
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Nhà cung cấp</th>
              <th className="text-center px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Hoá đơn</th>
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Người tạo</th>
              <th className="sticky right-0 z-10 bg-gray-50 text-center px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap border-l border-border">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={13} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">Đang tải...</span>
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={13} className="text-center py-12 text-muted-foreground text-sm">
                  {hasActiveFilter
                    ? "Không tìm thấy phiếu nào phù hợp với bộ lọc."
                    : "Chưa có phiếu nhập kho nào. Nhấn "}
                  {!hasActiveFilter && <span className="font-medium text-foreground">Thêm phiếu nhập kho</span>}
                  {!hasActiveFilter && " để bắt đầu."}
                </td>
              </tr>
            ) : paginatedReceipts.map(r => (
              <tr key={r.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{fmtDate(r.created_at)}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{r.location_name ?? "—"}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <span className="font-mono font-medium text-primary">{r.code}</span>
                </td>
                <td className="px-4 py-2.5 max-w-[180px] truncate whitespace-nowrap" title={r.name}>{r.name}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{r.warehouse_name ?? "—"}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <Badge
                    className={
                      r.status === "completed"
                        ? "bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 border-0"
                        : r.status === "cancelled"
                        ? "bg-red-100 text-red-600 text-[10px] px-1.5 py-0.5 border-0"
                        : "bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 border-0"
                    }
                  >
                    {r.status === "completed" ? "NHẬP KHO" : r.status === "cancelled" ? "ĐÃ HỦY" : "NHÁP"}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-center tabular-nums">{r.item_count}</td>
                <td className="px-4 py-2.5 text-center tabular-nums font-medium">{r.total_quantity}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium whitespace-nowrap">{fmtVND(r.total_amount)}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{r.supplier_name ?? "—"}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`font-medium ${r.has_invoice ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {r.has_invoice ? "CÓ" : "—"}
                  </span>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">{r.created_by_name ?? "—"}</td>
                <td className="sticky right-0 z-10 bg-white border-l border-border px-4 py-2.5 text-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36 text-xs">
                      <DropdownMenuItem className="gap-2 text-xs cursor-pointer" onClick={() => setViewRow(r)}>
                        <Eye className="w-3.5 h-3.5" /> Xem
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2 text-xs cursor-pointer"
                        disabled={r.status === "cancelled"}
                        onClick={() => r.status !== "cancelled" && openEdit(r)}
                      >
                        <Pencil className="w-3.5 h-3.5" /> Sửa
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="gap-2 text-xs cursor-pointer text-destructive focus:text-destructive"
                        disabled={r.status === "cancelled"}
                        onClick={() => r.status !== "cancelled" && setDeleteItem(r)}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> {r.status === "completed" ? "Hủy" : "Xoá"}
                      </DropdownMenuItem>
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
      <div className="px-5 py-3 shrink-0 border-t border-border">
        {totalItems > 0 ? (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Hiển thị {startIdx + 1}–{endIdx} trong {totalItems} phiếu
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Hiện:</span>
              <select
                className="text-xs border border-border rounded px-1.5 py-1 bg-background"
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              >
                <option value={20}>20</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <button
                className="text-xs px-2.5 py-1 border border-border rounded hover:bg-muted disabled:opacity-40 transition-colors"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >‹ Trước</button>
              <span className="text-xs text-muted-foreground tabular-nums">{page} / {totalPages}</span>
              <button
                className="text-xs px-2.5 py-1 border border-border rounded hover:bg-muted disabled:opacity-40 transition-colors"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >Sau ›</button>
            </div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            {isLoading ? "Đang tải..." : hasActiveFilter ? "Không có kết quả phù hợp" : "Không có dữ liệu"}
          </span>
        )}
      </div>

      {showDialog && (
        <StoreReceiptDialog
          initialData={editData}
          onClose={() => { setShowDialog(false); setEditId(null); setEditData(undefined); }}
          onSave={handleSave}
          isSaving={isSaving}
        />
      )}

      <AlertDialog open={!!deleteItem} onOpenChange={o => !o && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteItem?.status === "completed" ? "Hủy phiếu nhập kho?" : "Xoá phiếu nhập kho?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1.5 text-sm text-muted-foreground">
                {deleteItem?.status === "completed" ? (
                  <>
                    <p>Phiếu <span className="font-semibold text-foreground">{deleteItem?.code}</span> sẽ bị hủy.</p>
                    <ul className="list-disc list-inside space-y-0.5 text-xs">
                      <li>Tồn kho sẽ được trừ lại (hoàn tác nhập)</li>
                      <li>Hóa đơn liên kết (chưa thanh toán) sẽ bị xóa</li>
                      <li>Nếu đã có xuất/bán vượt tồn, thao tác sẽ bị chặn</li>
                      <li>Nếu hóa đơn đã có thanh toán, thao tác sẽ bị chặn</li>
                    </ul>
                  </>
                ) : (
                  <p>Phiếu <span className="font-semibold text-foreground">{deleteItem?.code}</span> sẽ bị xoá vĩnh viễn. Hành động không thể hoàn tác.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Không</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteItem?.status === "completed" ? "Hủy phiếu" : "Xoá"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!invoiceLockedMsg} onOpenChange={o => !o && setInvoiceLockedMsg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-amber-600">⚠️ Không thể thực hiện</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm text-foreground mt-2">
                {invoiceLockedMsg}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setInvoiceLockedMsg(null)}>Đã hiểu</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {viewRow && (
        <StoreReceiptPrintDialog
          type="import"
          id={viewRow.id}
          warehouseName={viewRow.warehouse_name}
          supplierName={viewRow.supplier_name}
          locationName={viewRow.location_name}
          createdByName={viewRow.created_by_name}
          onClose={() => setViewRow(null)}
        />
      )}
      <HistoryDialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen} title="Lịch sử phiếu nhập kho">
        <StoreReceiptHistoryTab locationOptions={locationOptions} />
      </HistoryDialog>
      </>
      )}
    </div>
  );
}
