import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, STATIC_STALE_TIME } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Package, ImageOff, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE_OPTIONS = [20, 30, 50, 100];

type Product = {
  id: string;
  code: string;
  name: string;
  categoryId: string | null;
  unitId: string | null;
  supplierId: string | null;
  costPrice: string | null;
  salePrice: string | null;
  starPrice: number | null;
  description: string | null;
  imageUrl: string | null;
  hasVariants: boolean | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type Category = { id: string; name: string };
type Unit = { id: string; name: string };
type Supplier = { id: string; name: string; code: string };

const EMPTY_FORM = {
  code: "",
  name: "",
  categoryId: "",
  unitId: "",
  supplierId: "",
  costPrice: "",
  salePrice: "",
  starPrice: "",
  description: "",
  imageUrl: "",
  hasVariants: false,
  status: "active" as "active" | "inactive",
};

function fmt(val: string | null | undefined) {
  if (!val || val === "0") return "—";
  const n = parseFloat(val);
  return isNaN(n) ? "—" : n.toLocaleString("vi-VN") + " đ";
}

export function StoreProductTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [openDialog, setOpenDialog] = useState(false);
  const [editItem, setEditItem] = useState<Product | null>(null);
  const [deleteItem, setDeleteItem] = useState<Product | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  useEffect(() => { setPage(1); }, [search]);

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (search.trim()) params.set("q", search.trim());

  const { data: resp, isLoading } = useQuery<{ data: Product[]; total: number }>({
    queryKey: ["/api/store/products", page, pageSize, search],
    queryFn: () => apiRequest("GET", `/api/store/products?${params.toString()}`).then(r => r.json()),
    staleTime: STATIC_STALE_TIME,
    retry: 2,
    retryDelay: 1500,
  });

  const products = resp?.data ?? [];
  const total = resp?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function handlePageSize(n: number) { setPageSize(n); setPage(1); }

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/store/categories"],
    queryFn: () => apiRequest("GET", "/api/store/categories").then(r => r.json()),
    staleTime: STATIC_STALE_TIME,
  });

  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ["/api/store/units"],
    queryFn: () => apiRequest("GET", "/api/store/units").then(r => r.json()),
    staleTime: STATIC_STALE_TIME,
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/store/suppliers"],
    queryFn: () => apiRequest("GET", "/api/store/suppliers").then(r => r.json()),
    staleTime: STATIC_STALE_TIME,
  });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["/api/store/products"] }); setPage(1); };

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/store/products", body).then(r => r.json()),
    onSuccess: () => { toast({ title: "Đã thêm sản phẩm" }); invalidate(); setOpenDialog(false); },
    onError: (e: any) => toast({ variant: "destructive", title: "Lỗi", description: e.message }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      apiRequest("PATCH", `/api/store/products/${id}`, body).then(r => r.json()),
    onSuccess: () => { toast({ title: "Đã cập nhật sản phẩm" }); invalidate(); setOpenDialog(false); },
    onError: (e: any) => toast({ variant: "destructive", title: "Lỗi", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/store/products/${id}`),
    onSuccess: () => { toast({ title: "Đã xoá sản phẩm" }); invalidate(); setDeleteItem(null); },
    onError: (e: any) => toast({ variant: "destructive", title: "Lỗi", description: e.message }),
  });

  function openAdd() {
    setEditItem(null);
    setForm({ ...EMPTY_FORM });
    setOpenDialog(true);
  }

  function openEdit(p: Product) {
    setEditItem(p);
    setForm({
      code: p.code,
      name: p.name,
      categoryId: p.categoryId ?? "",
      unitId: p.unitId ?? "",
      supplierId: p.supplierId ?? "",
      costPrice: p.costPrice ? parseFloat(p.costPrice).toString() : "",
      salePrice: p.salePrice ? parseFloat(p.salePrice).toString() : "",
      starPrice: p.starPrice != null ? String(p.starPrice) : "",
      description: p.description ?? "",
      imageUrl: p.imageUrl ?? "",
      hasVariants: p.hasVariants ?? false,
      status: (p.status as "active" | "inactive") ?? "active",
    });
    setOpenDialog(true);
  }

  function handleSubmit() {
    const body = {
      code: form.code.trim(),
      name: form.name.trim(),
      categoryId: form.categoryId || null,
      unitId: form.unitId || null,
      supplierId: form.supplierId || null,
      costPrice: form.costPrice ? parseFloat(form.costPrice) : 0,
      salePrice: form.salePrice ? parseFloat(form.salePrice) : 0,
      starPrice: form.starPrice ? parseInt(form.starPrice) : 0,
      description: form.description || null,
      imageUrl: form.imageUrl || null,
      hasVariants: form.hasVariants,
      status: form.status,
    };
    if (!body.code) return toast({ variant: "destructive", title: "Mã sản phẩm không được để trống" });
    if (!body.name) return toast({ variant: "destructive", title: "Tên sản phẩm không được để trống" });

    if (editItem) {
      updateMutation.mutate({ id: editItem.id, body });
    } else {
      createMutation.mutate(body);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 shrink-0 space-y-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Danh sách sản phẩm</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {search.trim() ? `${total} kết quả tìm kiếm` : `${total} sản phẩm`}
            </p>
          </div>
          <Button size="sm" onClick={openAdd} className="flex items-center gap-1.5 h-8">
            <Plus className="w-3.5 h-3.5" /> Thêm mới sản phẩm
          </Button>
        </div>
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Tìm mã hoặc tên sản phẩm..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>

      {/* Table - scrollable area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
      <div className="border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground w-10">#</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">Mã SP</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">Tên sản phẩm</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">Danh mục</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">Đơn vị</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">Giá nhập</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">Giá bán</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">Giá sao ⭐</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">Trạng thái</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground w-24">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={10} className="text-center py-12 text-muted-foreground text-sm">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Đang tải...
                  </div>
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-12 text-muted-foreground text-sm">
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-4 rounded-2xl bg-muted/40">
                      <Package className="w-8 h-8 opacity-40" />
                    </div>
                    <p>Chưa có sản phẩm nào. Nhấn <span className="font-medium text-foreground">Thêm mới sản phẩm</span> để bắt đầu.</p>
                  </div>
                </td>
              </tr>
            ) : products.map((p, idx) => {
              const catName = categories.find(c => c.id === p.categoryId)?.name;
              const unitName = units.find(u => u.id === p.unitId)?.name;
              return (
                <tr key={p.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{idx + 1}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-7 h-7 rounded object-cover border border-border shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded bg-muted flex items-center justify-center shrink-0">
                          <ImageOff className="w-3.5 h-3.5 text-muted-foreground/50" />
                        </div>
                      )}
                      <span className="font-mono text-xs font-medium text-primary">{p.code}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-medium max-w-[200px]">
                    <div className="truncate">{p.name}</div>
                    {p.hasVariants && <span className="text-[10px] text-violet-600 font-medium">Có biến thể</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{catName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{unitName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums">{fmt(p.costPrice)}</td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums font-medium text-emerald-600">{fmt(p.salePrice)}</td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums font-medium text-amber-600">
                    {p.starPrice ? `⭐ ${p.starPrice}` : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={p.status === "active" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0.5">
                      {p.status === "active" ? "Đang bán" : "Ngừng bán"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteItem(p)}
                        className="p-1.5 rounded-md hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>

      {/* Footer / Pagination */}
      <div className="px-5 py-3 shrink-0 border-t border-border">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="text-xs">Hiển thị {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total} sản phẩm</span>
            <Select value={String(pageSize)} onValueChange={v => handlePageSize(Number(v))}>
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
                onClick={() => setPage(p => p - 1)}
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
                        onClick={() => setPage(item as number)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                          page === item ? "bg-primary border-primary text-primary-foreground" : "border-border hover:bg-muted/50"
                        )}
                      >{item}</button>
                )}
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium disabled:opacity-40 hover:bg-muted/50 transition-colors"
              >Tiếp →</button>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? "Chỉnh sửa sản phẩm" : "Thêm mới sản phẩm"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Thông tin cơ bản</p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Mã sản phẩm <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="VD: TOAN001"
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Tên sản phẩm <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="VD: Toán lớp 1 tập 1"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Danh mục</Label>
                <Select value={form.categoryId || "none"} onValueChange={v => setForm(f => ({ ...f, categoryId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Chọn danh mục..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Không chọn —</SelectItem>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Đơn vị</Label>
                <Select value={form.unitId || "none"} onValueChange={v => setForm(f => ({ ...f, unitId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Chọn đơn vị..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Không chọn —</SelectItem>
                    {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Nhà cung cấp mặc định</Label>
              <Select value={form.supplierId || "none"} onValueChange={v => setForm(f => ({ ...f, supplierId: v === "none" ? "" : v }))}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Chọn nhà cung cấp..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Không chọn —</SelectItem>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Giá nhập mặc định (đ)</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={form.costPrice}
                  onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Giá bán (đ)</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={form.salePrice}
                  onChange={e => setForm(f => ({ ...f, salePrice: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Giá sao (⭐)</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={form.starPrice}
                  onChange={e => setForm(f => ({ ...f, starPrice: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Mô tả</Label>
              <Textarea
                placeholder="Mô tả sản phẩm..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                className="resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">URL Hình ảnh</Label>
              <Input
                placeholder="https://..."
                value={form.imageUrl}
                onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                className="h-9"
              />
              {form.imageUrl && (
                <img src={form.imageUrl} alt="preview" className="mt-2 h-20 w-20 object-cover rounded-lg border border-border" onError={e => (e.currentTarget.style.display = "none")} />
              )}
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2.5">
                <Switch
                  id="has-variants"
                  checked={form.hasVariants}
                  onCheckedChange={v => setForm(f => ({ ...f, hasVariants: v }))}
                />
                <Label htmlFor="has-variants" className="text-xs font-medium cursor-pointer">Có biến thể</Label>
              </div>

              <div className="flex items-center gap-2.5">
                <Label className="text-xs font-medium">Trạng thái</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as "active" | "inactive" }))}>
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Đang bán</SelectItem>
                    <SelectItem value="inactive">Ngừng bán</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)} disabled={isPending}>Huỷ</Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Đang lưu..." : editItem ? "Cập nhật" : "Thêm sản phẩm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteItem} onOpenChange={o => !o && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá sản phẩm?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xoá sản phẩm <span className="font-semibold">{deleteItem?.name}</span>? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
