import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, STATIC_STALE_TIME } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X, Search, Trash2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Location = { id: string; name: string };
type Warehouse = { id: string; name: string; locationId: string | null };
type Supplier = { id: string; name: string; code: string };
type Category = { id: string; name: string };
type Unit = { id: string; name: string };
type Color = { id: string; name: string };
type Size = { id: string; name: string };

export type ReceiptItem = {
  _key: string;
  productId: string | null;
  productCode: string;
  productName: string;
  quantity: number;
  categoryId: string;
  colorId: string;
  sizeId: string;
  unitId: string;
  costPrice: number;
  salePrice: number;
  starPrice: number;
};

export type ReceiptFormData = {
  code: string;
  name: string;
  locationId: string;
  warehouseId: string;
  date: string;
  supplierId: string;
  note: string;
  discount: number;
  discountType: "VND" | "%";
  surcharge: number;
  surchargeType: "VND" | "%";
  hasInvoice: boolean;
  invoiceNote: string;
  paidAmount: number;
  status: "draft" | "completed";
  items: ReceiptItem[];
};

type FinancePromotion = {
  id: string;
  code: string;
  name: string;
  type: string;
  valueAmount: string | null;
  valueType: string;
  isActive: boolean;
};

type ProductSearchResult = {
  id: string; code: string; name: string;
  cost_price: string | null; sale_price: string | null;
  category_id: string | null; unit_id: string | null;
  stock: number;
};

function fmtVND(n: number) {
  return n.toLocaleString("vi-VN") + " đ";
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

interface Props {
  initialData?: Partial<ReceiptFormData> & { id?: string };
  onClose: () => void;
  onSave: (data: ReceiptFormData, status: "draft" | "completed") => void;
  isSaving: boolean;
}

export function StoreReceiptDialog({ initialData, onClose, onSave, isSaving }: Props) {
  const isEdit = !!initialData?.id;

  const [form, setForm] = useState<ReceiptFormData>({
    code: initialData?.code ?? "",
    name: initialData?.name ?? "",
    locationId: initialData?.locationId ?? "",
    warehouseId: initialData?.warehouseId ?? "",
    date: initialData?.date ?? todayStr(),
    supplierId: initialData?.supplierId ?? "",
    note: initialData?.note ?? "",
    discount: initialData?.discount ?? 0,
    discountType: initialData?.discountType ?? "VND",
    surcharge: initialData?.surcharge ?? 0,
    surchargeType: initialData?.surchargeType ?? "VND",
    hasInvoice: initialData?.hasInvoice ?? false,
    invoiceNote: initialData?.invoiceNote ?? "",
    paidAmount: (initialData as any)?.paidAmount ?? 0,
    status: initialData?.status ?? "completed",
    items: initialData?.items ?? [],
  });

  const [selectedPromoKeys, setSelectedPromoKeys] = useState<string[]>([]);
  const [selectedSurchargeKeys, setSelectedSurchargeKeys] = useState<string[]>([]);
  const [promoOpen, setPromoOpen] = useState(false);
  const [surchargeOpen, setSurchargeOpen] = useState(false);

  const [productSearch, setProductSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const { data: nextCodeData } = useQuery({
    queryKey: ["/api/store/receipts/next-code"],
    queryFn: () => apiRequest("GET", "/api/store/receipts/next-code").then(r => r.json()),
    enabled: !isEdit,
  });

  useEffect(() => {
    if (!isEdit && nextCodeData?.code && !form.code) {
      const code = nextCodeData.code;
      const num = nextCodeData.num;
      setForm(f => ({
        ...f,
        code,
        name: `Phiếu nhập kho số ${String(num).padStart(2, "0")}`,
      }));
    }
  }, [nextCodeData, isEdit]);

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    queryFn: () => apiRequest("GET", "/api/locations").then(r => r.json()),
    staleTime: STATIC_STALE_TIME,
  });

  const { data: allWarehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ["/api/store/warehouses"],
    queryFn: () => apiRequest("GET", "/api/store/warehouses").then(r => r.json()),
    staleTime: STATIC_STALE_TIME,
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/store/suppliers"],
    queryFn: () => apiRequest("GET", "/api/store/suppliers").then(r => r.json()),
    staleTime: STATIC_STALE_TIME,
  });

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

  const { data: colors = [] } = useQuery<Color[]>({
    queryKey: ["/api/store/colors"],
    queryFn: () => apiRequest("GET", "/api/store/colors").then(r => r.json()),
    staleTime: STATIC_STALE_TIME,
  });

  const { data: sizes = [] } = useQuery<Size[]>({
    queryKey: ["/api/store/sizes"],
    queryFn: () => apiRequest("GET", "/api/store/sizes").then(r => r.json()),
    staleTime: STATIC_STALE_TIME,
  });

  const { data: promotionOptions = [] } = useQuery<FinancePromotion[]>({
    queryKey: ["/api/finance/promotions", "promotion"],
    queryFn: () => apiRequest("GET", "/api/finance/promotions?type=promotion").then(r => r.json()),
    staleTime: STATIC_STALE_TIME,
  });

  const { data: surchargeOptions = [] } = useQuery<FinancePromotion[]>({
    queryKey: ["/api/finance/promotions", "surcharge"],
    queryFn: () => apiRequest("GET", "/api/finance/promotions?type=surcharge").then(r => r.json()),
    staleTime: STATIC_STALE_TIME,
  });

  const { data: productResults = [] } = useQuery<ProductSearchResult[]>({
    queryKey: ["/api/store/inventory/search", form.warehouseId, productSearch],
    queryFn: () => apiRequest("GET", `/api/store/inventory/search?warehouseId=${form.warehouseId}&q=${encodeURIComponent(productSearch)}`).then(r => r.json()),
    enabled: searchOpen && !!form.warehouseId,
    staleTime: 5000,
  });

  const warehouses = allWarehouses.filter(w => !form.locationId || w.locationId === form.locationId);

  useEffect(() => {
    if (form.warehouseId && !warehouses.find(w => w.id === form.warehouseId)) {
      setForm(f => ({ ...f, warehouseId: "" }));
    }
  }, [form.locationId]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function openDropdown() {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      width: 320,
      zIndex: 9999,
    });
    setSearchOpen(true);
  }

  function handleCodeChange(code: string) {
    const num = parseInt(code.replace("PNK-", "")) || "";
    const numStr = num ? String(num).padStart(2, "0") : "";
    setForm(f => ({
      ...f,
      code,
      name: numStr ? `Phiếu nhập kho số ${numStr}` : f.name,
    }));
  }

  function addProduct(p: ProductSearchResult) {
    const key = `${p.id}_${Date.now()}`;
    setForm(f => ({
      ...f,
      items: [...f.items, {
        _key: key,
        productId: p.id,
        productCode: p.code,
        productName: p.name,
        quantity: 1,
        categoryId: p.category_id ?? "",
        colorId: "",
        sizeId: "",
        unitId: p.unit_id ?? "",
        costPrice: parseFloat(p.cost_price ?? "0") || 0,
        salePrice: parseFloat(p.sale_price ?? "0") || 0,
        starPrice: (p as any).star_price ?? 0,
      }],
    }));
    setProductSearch("");
    setSearchOpen(false);
  }

  function removeItem(key: string) {
    setForm(f => ({ ...f, items: f.items.filter(i => i._key !== key) }));
  }

  function updateItem(key: string, field: keyof ReceiptItem, value: any) {
    setForm(f => ({
      ...f,
      items: f.items.map(i => i._key === key ? { ...i, [field]: value } : i),
    }));
  }

  const subtotal = form.items.reduce((sum, i) => sum + i.quantity * i.costPrice, 0);

  function calcPromoAmt(keys: string[], options: FinancePromotion[], base: number): number {
    return keys.reduce((sum, key) => {
      const p = options.find(o => o.code === key);
      if (!p || !p.valueAmount) return sum;
      const v = parseFloat(p.valueAmount);
      if (p.valueType === "percent") return sum + base * v / 100;
      return sum + v;
    }, 0);
  }

  const discountAmt = selectedPromoKeys.length > 0
    ? calcPromoAmt(selectedPromoKeys, promotionOptions, subtotal)
    : (form.discountType === "VND" ? form.discount : subtotal * form.discount / 100);

  const surchargeAmt = selectedSurchargeKeys.length > 0
    ? calcPromoAmt(selectedSurchargeKeys, surchargeOptions, subtotal)
    : (form.surchargeType === "VND" ? form.surcharge : subtotal * form.surcharge / 100);

  const total = Math.max(0, subtotal - discountAmt + surchargeAmt);

  function handlePromoToggle(code: string, options: FinancePromotion[], base: number) {
    setSelectedPromoKeys(prev => {
      const next = prev.includes(code) ? prev.filter(k => k !== code) : [...prev, code];
      const amt = calcPromoAmt(next, options, base);
      setForm(f => ({ ...f, discount: amt, discountType: "VND" }));
      return next;
    });
  }

  function handleSurchargeToggle(code: string, options: FinancePromotion[], base: number) {
    setSelectedSurchargeKeys(prev => {
      const next = prev.includes(code) ? prev.filter(k => k !== code) : [...prev, code];
      const amt = calcPromoAmt(next, options, base);
      setForm(f => ({ ...f, surcharge: amt, surchargeType: "VND" }));
      return next;
    });
  }

  function handleSave(status: "draft" | "completed") {
    onSave({ ...form, discount: discountAmt, discountType: "VND", surcharge: surchargeAmt, surchargeType: "VND", status, totalAmount: total } as any, status);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative flex flex-col bg-background w-full h-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold">{isEdit ? "Chỉnh sửa phiếu nhập kho" : "Thêm phiếu nhập kho"}</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => handleSave("draft")} disabled={isSaving} className="h-8 text-xs">
              Lưu nháp
            </Button>
            <Button size="sm" onClick={() => handleSave("completed")} disabled={isSaving} className="h-8 text-xs">
              Lưu phiếu
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} className="h-8 w-8 p-0">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Body — scrollable */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: form */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Row 1 */}
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Cơ sở <span className="text-destructive">*</span></Label>
                <Select value={form.locationId || "none"} onValueChange={v => setForm(f => ({ ...f, locationId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Chọn cơ sở" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Chọn cơ sở —</SelectItem>
                    {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Kho <span className="text-destructive">*</span></Label>
                <Select value={form.warehouseId || "none"} onValueChange={v => setForm(f => ({ ...f, warehouseId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Chọn kho" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Chọn kho —</SelectItem>
                    {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Mã Phiếu</Label>
                <Input value={form.code} onChange={e => handleCodeChange(e.target.value)} className="h-9 text-xs font-mono" placeholder="PNK-01" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Tên Phiếu</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-9 text-xs" placeholder="Phiếu nhập kho số 01" />
              </div>
            </div>

            {/* Row 2 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Ngày tạo</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="h-9 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Ghi chú đơn hàng</Label>
                <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} className="h-9 text-xs" placeholder="Nhập ghi chú đơn hàng..." />
              </div>
            </div>

            {/* Products */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Danh sách sản phẩm</p>
                {/* Search */}
                <div className="relative w-64" ref={searchRef}>
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    ref={inputRef}
                    className="h-8 text-xs pl-8"
                    placeholder="Tìm sản phẩm..."
                    value={productSearch}
                    onChange={e => { setProductSearch(e.target.value); openDropdown(); }}
                    onFocus={() => openDropdown()}
                    onClick={() => openDropdown()}
                    disabled={!form.warehouseId}
                  />
                  {searchOpen && form.warehouseId && (
                    <div style={dropdownStyle} className="bg-popover border border-border rounded-xl shadow-2xl overflow-hidden">
                      <div className="px-3 py-2 border-b border-border">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Search className="w-3.5 h-3.5" />
                          <span className="text-xs">Mã hoặc tên sản phẩm...</span>
                        </div>
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        {productResults.length === 0 ? (
                          <p className="text-center text-xs text-muted-foreground py-6">Không có sản phẩm</p>
                        ) : productResults.map(p => (
                          <button
                            key={p.id}
                            onMouseDown={e => { e.preventDefault(); addProduct(p); }}
                            className="w-full px-3 py-2.5 text-left hover:bg-muted/60 transition-colors border-b border-border/50 last:border-0"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-mono text-primary">{p.code}</p>
                                <p className="text-xs font-medium text-foreground truncate">{p.name}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-[10px] text-muted-foreground">Tồn: {p.stock}</p>
                                <p className="text-xs font-medium text-emerald-600">{parseFloat(p.sale_price ?? "0").toLocaleString("vi-VN")} đ</p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Items table */}
              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-xs border-separate border-spacing-0 table-fixed">
                  <colgroup>
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "8%" }} />
                    {!isEdit && <col style={{ width: "3%" }} />}
                  </colgroup>
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Sản phẩm</th>
                      <th className="text-center px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">SL</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Danh mục</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Màu sắc</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Kích cỡ</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Đơn vị</th>
                      <th className="text-right px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Giá nhập</th>
                      <th className="text-right px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Giá xuất</th>
                      <th className="text-right px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Giá sao ⭐</th>
                      {!isEdit && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="text-center py-8 text-muted-foreground text-xs">
                          Chưa có sản phẩm. Tìm kiếm sản phẩm phía trên để thêm vào.
                        </td>
                      </tr>
                    ) : form.items.map(item => (
                      <tr key={item._key} className="border-t border-border hover:bg-muted/20">
                        <td className="px-3 py-1.5">
                          <div>
                            <p className="text-xs font-medium truncate" title={item.productName}>{item.productName}</p>
                            <p className="font-mono text-[10px] text-primary italic">{item.productCode}</p>
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <Input type="number" min={1} value={item.quantity} onChange={e => updateItem(item._key, "quantity", parseInt(e.target.value) || 1)} className="h-7 text-xs px-2 text-center w-full" />
                        </td>
                        <td className="px-2 py-1.5">
                          <Select value={item.categoryId || "none"} onValueChange={v => updateItem(item._key, "categoryId", v === "none" ? "" : v)}>
                            <SelectTrigger className="h-7 text-xs w-full"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">—</SelectItem>
                              {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5">
                          <Select value={item.colorId || "none"} onValueChange={v => updateItem(item._key, "colorId", v === "none" ? "" : v)}>
                            <SelectTrigger className="h-7 text-xs w-full"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">—</SelectItem>
                              {colors.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5">
                          <Select value={item.sizeId || "none"} onValueChange={v => updateItem(item._key, "sizeId", v === "none" ? "" : v)}>
                            <SelectTrigger className="h-7 text-xs w-full"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">—</SelectItem>
                              {sizes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5">
                          <Select value={item.unitId || "none"} onValueChange={v => updateItem(item._key, "unitId", v === "none" ? "" : v)}>
                            <SelectTrigger className="h-7 text-xs w-full"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">—</SelectItem>
                              {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5">
                          <Input type="number" min={0} value={item.costPrice} onChange={e => updateItem(item._key, "costPrice", parseFloat(e.target.value) || 0)} className="h-7 text-xs px-2 text-right w-full" />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input type="number" min={0} value={item.salePrice} onChange={e => updateItem(item._key, "salePrice", parseFloat(e.target.value) || 0)} className="h-7 text-xs px-2 text-right w-full" />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input type="number" min={0} value={item.starPrice} onChange={e => updateItem(item._key, "starPrice", parseInt(e.target.value) || 0)} className="h-7 text-xs px-2 text-right w-full" />
                        </td>
                        {!isEdit && (
                          <td className="px-2 py-1.5 text-center">
                            <button onClick={() => removeItem(item._key)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right: payment panel */}
          <div className="w-64 shrink-0 border-l border-border bg-muted/20 p-5 overflow-y-auto flex flex-col gap-4">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Thông tin thanh toán</p>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Nhà cung cấp</Label>
              <Select
                value={form.supplierId || "none"}
                onValueChange={v => setForm(f => ({
                  ...f,
                  supplierId: v === "none" ? "" : v,
                  hasInvoice: v === "none" ? false : f.hasInvoice,
                  invoiceNote: v === "none" ? "" : f.invoiceNote,
                }))}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Chọn NCC..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Không chọn —</SelectItem>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Khuyến mãi</Label>
              <Popover open={promoOpen} onOpenChange={setPromoOpen}>
                <PopoverTrigger asChild>
                  <button className="w-full flex items-center justify-between h-8 px-3 rounded-md border border-input bg-background text-xs hover:bg-muted/40 transition-colors">
                    <span className={discountAmt > 0 ? "text-foreground" : "text-muted-foreground"}>
                      {discountAmt > 0 ? `- ${fmtVND(discountAmt)}` : "Chọn khuyến mãi..."}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="start">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-xs font-semibold text-foreground">Chọn khuyến mãi</p>
                  </div>
                  {promotionOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Chưa có khuyến mãi</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto py-1">
                      {promotionOptions.map(p => {
                        const v = parseFloat(p.valueAmount ?? "0");
                        const displayAmt = p.valueType === "percent"
                          ? `-${v}%  (${fmtVND(subtotal * v / 100)})`
                          : `- ${fmtVND(v)}`;
                        return (
                          <label key={p.code} className="flex items-start gap-2.5 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                            <Checkbox
                              checked={selectedPromoKeys.includes(p.code)}
                              onCheckedChange={() => handlePromoToggle(p.code, promotionOptions, subtotal)}
                              className="mt-0.5"
                            />
                            <div>
                              <p className="text-xs font-medium">{p.name}</p>
                              <p className="text-[11px] text-muted-foreground">{displayAmt}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Phụ thu</Label>
              <Popover open={surchargeOpen} onOpenChange={setSurchargeOpen}>
                <PopoverTrigger asChild>
                  <button className="w-full flex items-center justify-between h-8 px-3 rounded-md border border-input bg-background text-xs hover:bg-muted/40 transition-colors">
                    <span className={surchargeAmt > 0 ? "text-foreground" : "text-muted-foreground"}>
                      {surchargeAmt > 0 ? `+ ${fmtVND(surchargeAmt)}` : "Chọn phụ thu..."}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="start">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-xs font-semibold text-foreground">Chọn phụ thu</p>
                  </div>
                  {surchargeOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Chưa có phụ thu</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto py-1">
                      {surchargeOptions.map(p => {
                        const v = parseFloat(p.valueAmount ?? "0");
                        const displayAmt = p.valueType === "percent"
                          ? `+${v}%  (${fmtVND(subtotal * v / 100)})`
                          : `+ ${fmtVND(v)}`;
                        return (
                          <label key={p.code} className="flex items-start gap-2.5 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                            <Checkbox
                              checked={selectedSurchargeKeys.includes(p.code)}
                              onCheckedChange={() => handleSurchargeToggle(p.code, surchargeOptions, subtotal)}
                              className="mt-0.5"
                            />
                            <div>
                              <p className="text-xs font-medium">{p.name}</p>
                              <p className="text-[11px] text-muted-foreground">{displayAmt}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {(() => {
              const hasSupplier = !!form.supplierId;
              const totalQty = form.items.reduce((s, i) => s + i.quantity, 0);
              const receiptNum = form.code ? (parseInt(form.code.replace("PNK-", "")) || "") : "";
              const numStr = receiptNum ? String(receiptNum).padStart(2, "0") : "01";
              const autoDesc = `Phiếu nhập kho số ${numStr}, Số sản phẩm: ${form.items.length}, Số lượng ${totalQty}`;
              return (
                <div className="space-y-2">
                  <div className={cn("flex items-center gap-2", !hasSupplier && "opacity-40 pointer-events-none")}>
                    <Checkbox
                      id="has-invoice"
                      checked={form.hasInvoice}
                      disabled={!hasSupplier}
                      onCheckedChange={v => setForm(f => ({ ...f, hasInvoice: !!v }))}
                    />
                    <Label htmlFor="has-invoice" className="text-xs font-medium cursor-pointer">Xuất hóa đơn (Phiếu chi)</Label>
                  </div>
                  {form.hasInvoice && hasSupplier && (
                    <div className="space-y-1">
                      <Textarea
                        value={form.invoiceNote}
                        onChange={e => setForm(f => ({ ...f, invoiceNote: e.target.value }))}
                        placeholder={autoDesc}
                        className="text-xs min-h-[64px] resize-none"
                        rows={3}
                      />
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        Để trống sẽ dùng mô tả tự động
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="mt-auto border-t border-border pt-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Tổng tiền hàng</span>
                <span className="font-medium tabular-nums">{fmtVND(subtotal)}</span>
              </div>
              {discountAmt > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Khuyến mãi</span>
                  <span className="text-red-500 tabular-nums">- {fmtVND(discountAmt)}</span>
                </div>
              )}
              {surchargeAmt > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Phụ thu</span>
                  <span className="text-orange-500 tabular-nums">+ {fmtVND(surchargeAmt)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm font-bold border-t border-border pt-2">
                <span>Tổng cộng:</span>
                <span className="text-primary tabular-nums">{fmtVND(total)}</span>
              </div>

              {/* Đã thanh toán */}
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-muted-foreground shrink-0">Đã thanh toán</span>
                <Input
                  type="number"
                  min={0}
                  max={total}
                  value={form.paidAmount}
                  onChange={e => setForm(f => ({ ...f, paidAmount: Math.min(total, Math.max(0, parseFloat(e.target.value) || 0)) }))}
                  className="h-7 text-xs text-right font-bold text-blue-600 w-28 border-blue-200 focus-visible:ring-blue-400 ml-2"
                />
              </div>

              {/* Payment status indicator */}
              {(() => {
                const paid = Math.min(form.paidAmount, total);
                const remaining = Math.max(0, total - paid);
                if (total <= 0) return null;
                if (remaining <= 0) {
                  return (
                    <div className="flex items-center justify-between text-xs text-emerald-600">
                      <span>Trạng thái:</span>
                      <span className="font-semibold">Đã thanh toán</span>
                    </div>
                  );
                }
                if (paid > 0) {
                  return (
                    <>
                      <div className="flex items-center justify-between text-xs text-orange-500">
                        <span>Còn lại (Đợt 2):</span>
                        <span className="font-semibold tabular-nums">{fmtVND(remaining)}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">Phiếu chi sẽ tạo 2 đợt thanh toán</div>
                    </>
                  );
                }
                return (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Trạng thái:</span>
                    <span>Chưa thanh toán</span>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
