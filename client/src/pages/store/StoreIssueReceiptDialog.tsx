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
import { useToast } from "@/hooks/use-toast";

type Location = { id: string; name: string };
type Warehouse = { id: string; name: string; locationId: string | null };
type Unit = { id: string; name: string };

export type IssueReceiptItem = {
  _key: string;
  productId: string | null;
  productCode: string;
  productName: string;
  quantity: number;
  unitId: string;
  unitName: string;
  salePrice: number;
  stockBefore: number;
  priceType: "money" | "star";
  starPrice: number;
};

export type IssueReceiptFormData = {
  code: string;
  name: string;
  locationId: string;
  warehouseId: string;
  date: string;
  recipientName: string;
  recipientId: string;
  note: string;
  discount: number;
  discountType: "VND" | "%";
  surcharge: number;
  surchargeType: "VND" | "%";
  hasInvoice: boolean;
  invoiceNote: string;
  paidAmount: number;
  status: "draft" | "completed";
  sessionId?: string;
  items: IssueReceiptItem[];
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

type InventorySearchResult = {
  id: string;
  code: string;
  name: string;
  cost_price: string | null;
  sale_price: string | null;
  unit_id: string | null;
  unit_name: string | null;
  stock: number;
};

type PersonResult = {
  id: string;
  code: string;
  fullName: string;
  type?: string;
  entityType?: string;
  accountStatus?: string;
};

function fmtVND(n: number) {
  return n.toLocaleString("vi-VN") + " đ";
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

interface Props {
  initialData?: Partial<IssueReceiptFormData> & { id?: string };
  onClose: () => void;
  onSave: (data: IssueReceiptFormData, status: "draft" | "completed") => void;
  isSaving: boolean;
}

export function StoreIssueReceiptDialog({ initialData, onClose, onSave, isSaving }: Props) {
  const isEdit = !!initialData?.id;
  const { toast } = useToast();

  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prevWarehouseRef = useRef<string>("");

  const [form, setForm] = useState<IssueReceiptFormData>({
    code: initialData?.code ?? "",
    name: initialData?.name ?? "",
    locationId: initialData?.locationId ?? "",
    warehouseId: initialData?.warehouseId ?? "",
    date: initialData?.date ?? todayStr(),
    recipientName: initialData?.recipientName ?? "",
    recipientId: (initialData as any)?.recipientId ?? "",
    note: initialData?.note ?? "",
    discount: initialData?.discount ?? 0,
    discountType: initialData?.discountType ?? "VND",
    surcharge: initialData?.surcharge ?? 0,
    surchargeType: initialData?.surchargeType ?? "VND",
    hasInvoice: initialData?.hasInvoice ?? true,
    invoiceNote: initialData?.invoiceNote ?? "",
    paidAmount: (initialData as any)?.paidAmount ?? 0,
    status: initialData?.status ?? "completed",
    items: initialData?.items ?? [],
  });

  const [selectedPromoKeys, setSelectedPromoKeys] = useState<string[]>([]);
  const [selectedSurchargeKeys, setSelectedSurchargeKeys] = useState<string[]>([]);
  const [promoOpen, setPromoOpen] = useState(false);
  const [surchargeOpen, setSurchargeOpen] = useState(false);

  // Product search
  const [productSearch, setProductSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  // Recipient (person) picker
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState("");

  const { data: nextCodeData } = useQuery({
    queryKey: ["/api/store/issue-receipts/next-code"],
    queryFn: () => apiRequest("GET", "/api/store/issue-receipts/next-code").then(r => r.json()),
    enabled: !isEdit,
    staleTime: 0,
    gcTime: 0,
  });

  useEffect(() => {
    if (!isEdit && nextCodeData?.code && !form.code) {
      const code = nextCodeData.code;
      const num = nextCodeData.num;
      setForm(f => ({
        ...f,
        code,
        name: `Phiếu xuất kho số ${String(num).padStart(2, "0")}`,
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

  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ["/api/store/units"],
    queryFn: () => apiRequest("GET", "/api/store/units").then(r => r.json()),
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

  const { data: productResults = [] } = useQuery<InventorySearchResult[]>({
    queryKey: ["/api/store/issue-inventory/search", form.warehouseId, productSearch, sessionIdRef.current, initialData?.id],
    queryFn: () => {
      const params = new URLSearchParams({
        warehouseId: form.warehouseId,
        q: productSearch,
        sessionId: sessionIdRef.current,
      });
      if (initialData?.id) params.set("receiptId", initialData.id);
      return apiRequest("GET", `/api/store/issue-inventory/search?${params.toString()}`).then(r => r.json());
    },
    enabled: searchOpen && !!form.warehouseId,
    staleTime: 5000,
  });

  // Total stars needed from star-priced items
  const totalStarsNeeded = form.items
    .filter(i => (i.priceType ?? "money") === "star")
    .reduce((sum, i) => sum + i.quantity * (i.starPrice ?? 0), 0);

  // Star balance for selected recipient (only students have an id)
  const { data: starBalance } = useQuery<{ earned: number; spent: number; available: number }>({
    queryKey: ["/api/students/star-balance", form.recipientId],
    queryFn: () => apiRequest("GET", `/api/students/${form.recipientId}/star-balance`).then(r => r.json()),
    enabled: !!form.recipientId && totalStarsNeeded > 0,
    staleTime: 0,
    gcTime: 0,
  });

  const hasInsufficientStars = !!form.recipientId && totalStarsNeeded > 0 && !!starBalance && starBalance.available < totalStarsNeeded;

  // Person search (students + staff)
  const { data: personResults = [] } = useQuery<PersonResult[]>({
    queryKey: ["/api/invoice/search-students", recipientSearch],
    queryFn: () => {
      const params = new URLSearchParams();
      if (recipientSearch) params.set("searchTerm", recipientSearch);
      return apiRequest("GET", `/api/invoice/search-students?${params}`).then(r => r.json());
    },
    enabled: recipientPickerOpen,
    staleTime: 5000,
  });

  const students = (personResults as any[]).filter(s => s.entityType !== "staff").sort((a: any, b: any) => {
    const aActive = a.accountStatus !== "Không hoạt động";
    const bActive = b.accountStatus !== "Không hoạt động";
    if (aActive === bActive) return 0;
    return aActive ? -1 : 1;
  });
  const staffList = (personResults as any[]).filter(s => s.entityType === "staff");

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

  // Release all reservations for this session when dialog unmounts
  useEffect(() => {
    return () => {
      apiRequest("DELETE", `/api/store/reservations/${sessionIdRef.current}`).catch(() => {});
    };
  }, []);

  // When warehouse changes, release old reservations then re-sync
  useEffect(() => {
    if (prevWarehouseRef.current && prevWarehouseRef.current !== form.warehouseId) {
      apiRequest("DELETE", `/api/store/reservations/${sessionIdRef.current}`).catch(() => {});
    }
    prevWarehouseRef.current = form.warehouseId;
  }, [form.warehouseId]);

  // Debounced sync: upsert reservations for current items
  useEffect(() => {
    if (!form.warehouseId) return;
    const itemsWithProduct = form.items.filter(i => i.productId);
    if (itemsWithProduct.length === 0) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      itemsWithProduct.forEach(item => {
        apiRequest("POST", "/api/store/reservations", {
          sessionId: sessionIdRef.current,
          productId: item.productId,
          warehouseId: form.warehouseId,
          quantity: item.quantity,
        }).catch(() => {});
      });
    }, 600);
    return () => clearTimeout(debounceRef.current);
  }, [form.items, form.warehouseId]);

  function openProductDropdown() {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      width: 340,
      zIndex: 9999,
    });
    setSearchOpen(true);
  }

  function handleCodeChange(code: string) {
    const num = parseInt(code.replace("PXK-", "")) || "";
    const numStr = num ? String(num).padStart(2, "0") : "";
    setForm(f => ({
      ...f,
      code,
      name: numStr ? `Phiếu xuất kho số ${numStr}` : f.name,
    }));
  }

  function addProduct(p: InventorySearchResult) {
    const key = `${p.id}_${Date.now()}`;
    setForm(f => ({
      ...f,
      items: [...f.items, {
        _key: key,
        productId: p.id,
        productCode: p.code,
        productName: p.name,
        quantity: 1,
        unitId: p.unit_id ?? "",
        unitName: p.unit_name ?? "",
        salePrice: parseFloat(p.sale_price ?? "0") || 0,
        stockBefore: p.stock,
        priceType: "money" as const,
        starPrice: (p as any).star_price ?? 0,
      }],
    }));
    setProductSearch("");
    setSearchOpen(false);
  }

  function removeItem(key: string) {
    const item = form.items.find(i => i._key === key);
    if (item?.productId && form.warehouseId) {
      apiRequest("DELETE", `/api/store/reservations/${sessionIdRef.current}/${item.productId}/${form.warehouseId}`)
        .catch(() => {});
    }
    setForm(f => ({ ...f, items: f.items.filter(i => i._key !== key) }));
  }

  function updateItem(key: string, field: keyof IssueReceiptItem, value: any) {
    setForm(f => ({
      ...f,
      items: f.items.map(i => i._key === key ? { ...i, [field]: value } : i),
    }));
  }

  const subtotal = form.items.reduce((sum, i) =>
    (i.priceType ?? "money") === "money" ? sum + i.quantity * i.salePrice : sum, 0);

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
    if (!form.recipientName.trim()) {
      toast({ variant: "destructive", title: "Vui lòng chọn Người nhận hàng trước khi lưu" });
      return;
    }
    if (status === "completed" && hasInsufficientStars) {
      toast({ variant: "destructive", title: `Học viên không đủ sao. Cần ${totalStarsNeeded} ⭐, hiện có ${starBalance?.available ?? 0} ⭐` });
      return;
    }
    onSave(
      { ...form, discount: discountAmt, discountType: "VND", surcharge: surchargeAmt, surchargeType: "VND", status, sessionId: sessionIdRef.current } as IssueReceiptFormData,
      status,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative flex flex-col bg-background w-full h-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold">{isEdit ? "Chỉnh sửa phiếu xuất kho" : "Thêm phiếu xuất kho"}</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => handleSave("draft")} disabled={isSaving} className="h-8 text-xs">
              Lưu nháp
            </Button>
            <Button size="sm" onClick={() => handleSave("completed")} disabled={isSaving} className="h-8 text-xs bg-orange-500 hover:bg-orange-600">
              Lưu phiếu xuất
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} className="h-8 w-8 p-0">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: form + products + ghi chú */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Row 1: Cơ sở, Kho xuất, Mã phiếu, Ngày xuất */}
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
                <Label className="text-xs font-medium">Kho xuất <span className="text-destructive">*</span></Label>
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
                <Input value={form.code} onChange={e => handleCodeChange(e.target.value)} className="h-9 text-xs font-mono" placeholder="PXK-01" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Ngày xuất</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="h-9 text-xs" />
              </div>
            </div>

            {/* Products section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Sản phẩm xuất kho</p>
                <div className="relative w-72" ref={searchRef}>
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    ref={inputRef}
                    className="h-8 text-xs pl-8"
                    placeholder="Tìm sản phẩm trong kho..."
                    value={productSearch}
                    onChange={e => { setProductSearch(e.target.value); openProductDropdown(); }}
                    onFocus={() => openProductDropdown()}
                    onClick={() => openProductDropdown()}
                    disabled={!form.warehouseId}
                  />
                  {!form.warehouseId && (
                    <p className="absolute -bottom-4 left-0 text-[10px] text-muted-foreground">Chọn kho xuất trước</p>
                  )}
                  {searchOpen && form.warehouseId && (
                    <div style={dropdownStyle} className="bg-popover border border-border rounded-xl shadow-2xl overflow-hidden">
                      <div className="px-3 py-2 border-b border-border">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Search className="w-3.5 h-3.5" />
                          <span className="text-xs">Chỉ hiện sản phẩm còn tồn kho</span>
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
                                <p className="text-[10px] text-emerald-600 font-medium">Khả dụng: {p.stock}</p>
                                <p className="text-xs text-muted-foreground">{parseFloat(p.sale_price ?? "0").toLocaleString("vi-VN")} đ</p>
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
                <table className="w-full text-xs border-separate border-spacing-0">
                  <colgroup>
                    <col style={{ width: "28%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "4%" }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Sản phẩm</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">ĐVT</th>
                      <th className="text-center px-3 py-2 font-semibold text-muted-foreground">Khả dụng</th>
                      <th className="text-center px-3 py-2 font-semibold text-muted-foreground">Số lượng</th>
                      <th className="text-center px-3 py-2 font-semibold text-muted-foreground">Loại</th>
                      <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Đơn giá</th>
                      <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Thành tiền</th>
                      {!isEdit && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-8 text-muted-foreground text-xs">
                          Chưa có sản phẩm. Tìm kiếm sản phẩm phía trên để thêm vào.
                        </td>
                      </tr>
                    ) : form.items.map(item => (
                      <tr key={item._key} className="border-t border-border hover:bg-muted/20">
                        <td className="px-2 py-1.5">
                          <div>
                            <p className="font-mono text-[10px] text-primary">{item.productCode}</p>
                            <p className="text-xs font-medium truncate" title={item.productName}>{item.productName}</p>
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <Select
                            value={item.unitId || "none"}
                            onValueChange={v => {
                              const unit = units.find(u => u.id === v);
                              updateItem(item._key, "unitId", v === "none" ? "" : v);
                              if (unit) updateItem(item._key, "unitName", unit.name);
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs w-full"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">—</SelectItem>
                              {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <span className={cn(
                            "text-xs font-medium tabular-nums",
                            item.stockBefore < item.quantity ? "text-red-500" : "text-emerald-600"
                          )}>
                            {item.stockBefore}
                          </span>
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            min={1}
                            max={item.stockBefore}
                            value={item.quantity}
                            onChange={e => updateItem(item._key, "quantity", parseInt(e.target.value) || 1)}
                            className={cn(
                              "h-7 text-xs px-2 text-center w-full",
                              item.quantity > item.stockBefore && "border-red-400 focus:ring-red-400"
                            )}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Select
                            value={item.priceType ?? "money"}
                            onValueChange={v => updateItem(item._key, "priceType", v as "money" | "star")}
                          >
                            <SelectTrigger className="h-7 text-xs w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="money">💵 Tiền</SelectItem>
                              <SelectItem value="star">⭐ Sao</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5">
                          {(item.priceType ?? "money") === "money" ? (
                            <Input
                              type="number"
                              min={0}
                              value={item.salePrice}
                              onChange={e => updateItem(item._key, "salePrice", parseFloat(e.target.value) || 0)}
                              className="h-7 text-xs px-2 text-right w-full"
                            />
                          ) : (
                            <Input
                              type="number"
                              min={0}
                              value={item.starPrice ?? 0}
                              onChange={e => updateItem(item._key, "starPrice", parseInt(e.target.value) || 0)}
                              className="h-7 text-xs px-2 text-right w-full"
                            />
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-medium text-xs">
                          {(item.priceType ?? "money") === "money"
                            ? fmtVND(item.quantity * item.salePrice)
                            : <span className="text-amber-600">⭐ {item.quantity * (item.starPrice ?? 0)}</span>
                          }
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

            {/* Ghi chú — moved to left panel */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Ghi chú</Label>
              <Textarea
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                className="text-xs min-h-[64px] resize-none"
                rows={3}
                placeholder="Ghi chú phiếu xuất..."
              />
            </div>
          </div>

          {/* Right: payment panel */}
          <div className="w-72 shrink-0 border-l border-border bg-muted/20 p-5 overflow-y-auto flex flex-col gap-4">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Thông tin phiếu</p>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Tên phiếu</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="h-9 text-xs"
                placeholder="Phiếu xuất kho số 01"
              />
            </div>

            {/* Người nhận hàng — popover student/staff picker */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Người nhận hàng <span className="text-destructive">*</span></Label>
              <Popover open={recipientPickerOpen} onOpenChange={setRecipientPickerOpen}>
                <PopoverTrigger asChild>
                  <button className="w-full h-9 flex items-center justify-between px-3 rounded-md border border-input bg-background text-xs hover:border-orange-400 transition-colors text-left">
                    <span className={form.recipientName ? "text-foreground truncate" : "text-muted-foreground"}>
                      {form.recipientName || "Chọn người nhận..."}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-1" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2" align="start" side="bottom">
                  {/* Search input */}
                  <div className="mb-2 relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="h-8 text-xs pl-7"
                      placeholder="Tìm tên, mã..."
                      value={recipientSearch}
                      onChange={e => setRecipientSearch(e.target.value)}
                      autoFocus
                    />
                  </div>

                  {/* Results list */}
                  <div className="max-h-52 overflow-y-auto space-y-0.5">
                    {personResults.length === 0 ? (
                      <p className="text-xs text-center text-muted-foreground py-4">
                        {recipientSearch ? "Không tìm thấy" : "Nhập tên để tìm kiếm"}
                      </p>
                    ) : (
                      <>
                        {students.length > 0 && (
                          <>
                            <p className="text-[10px] font-medium text-muted-foreground px-2 py-1">Học viên / Phụ huynh</p>
                            {students.map((s: any) => {
                              const isInactive = s.accountStatus === "Không hoạt động";
                              const displayName = `[${s.code}] ${s.fullName}`;
                              return (
                                <button
                                  key={s.id}
                                  disabled={isInactive}
                                  className={cn(
                                    "w-full text-left px-2 py-1.5 rounded text-xs transition-colors",
                                    isInactive ? "opacity-40 cursor-not-allowed" : "hover:bg-muted/60 cursor-pointer",
                                    form.recipientName === displayName && "bg-orange-50 text-orange-700"
                                  )}
                                  onClick={() => {
                                    if (isInactive) return;
                                    setForm(f => ({ ...f, recipientName: displayName, recipientId: s.id }));
                                    setRecipientPickerOpen(false);
                                    setRecipientSearch("");
                                  }}
                                >
                                  <span className="inline-flex items-center gap-1.5 flex-wrap">
                                    <span className="font-mono text-muted-foreground">[{s.code}]</span>
                                    <span>{s.fullName}</span>
                                    {s.type && <span className="text-[10px] text-muted-foreground">({s.type})</span>}
                                    {isInactive && <span className="text-amber-500 text-[10px] font-medium">⚠ Không HĐ</span>}
                                  </span>
                                </button>
                              );
                            })}
                          </>
                        )}
                        {staffList.length > 0 && (
                          <>
                            <div className="border-t my-1" />
                            <p className="text-[10px] font-medium text-muted-foreground px-2 py-1">Nhân viên</p>
                            {staffList.map((s: any) => {
                              const displayName = `[${s.code}] ${s.fullName}`;
                              return (
                                <button
                                  key={s.id}
                                  className={cn(
                                    "w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/60 transition-colors",
                                    form.recipientName === displayName && "bg-blue-50 text-blue-700"
                                  )}
                                  onClick={() => {
                                    setForm(f => ({ ...f, recipientName: displayName, recipientId: "" }));
                                    setRecipientPickerOpen(false);
                                    setRecipientSearch("");
                                  }}
                                >
                                  <span className="font-mono text-muted-foreground">[{s.code}]</span>{" "}
                                  {s.fullName}
                                  <span className="ml-1 text-[10px] text-blue-500">(Nhân viên)</span>
                                </button>
                              );
                            })}
                          </>
                        )}
                      </>
                    )}
                  </div>

                  {/* Manual text input fallback */}
                  <div className="mt-2 pt-2 border-t">
                    <p className="text-[10px] text-muted-foreground mb-1">Hoặc nhập tên thủ công:</p>
                    <Input
                      className="h-7 text-xs"
                      placeholder="Tên người nhận khác..."
                      value={form.recipientName}
                      onChange={e => setForm(f => ({ ...f, recipientName: e.target.value, recipientId: "" }))}
                    />
                  </div>
                </PopoverContent>
              </Popover>

              {/* Star balance warning */}
              {form.recipientId && totalStarsNeeded > 0 && starBalance && (
                hasInsufficientStars ? (
                  <p className="text-[11px] text-red-500 font-medium mt-1">
                    ⭐ Số sao {starBalance.available} không đủ (cần {totalStarsNeeded} sao) — không thể xuất phiếu
                  </p>
                ) : (
                  <p className="text-[11px] text-emerald-600 mt-1">
                    ⭐ Số sao khả dụng: {starBalance.available} (sau khi xuất còn {starBalance.available - totalStarsNeeded})
                  </p>
                )
              )}
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
                    <p className="text-xs font-semibold">Chọn khuyến mãi</p>
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
                    <p className="text-xs font-semibold">Chọn phụ thu</p>
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

            {/* Invoice checkbox — default ON */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="has-invoice-issue"
                  checked={form.hasInvoice}
                  onCheckedChange={v => setForm(f => ({ ...f, hasInvoice: !!v }))}
                />
                <Label htmlFor="has-invoice-issue" className="text-xs font-medium cursor-pointer">Xuất hóa đơn (Phiếu thu)</Label>
              </div>
              {form.hasInvoice && (
                <div className="space-y-1">
                  <Textarea
                    value={form.invoiceNote}
                    onChange={e => setForm(f => ({ ...f, invoiceNote: e.target.value }))}
                    placeholder={(() => {
                      const num = parseInt(form.code.replace("PXK-", "")) || 0;
                      const numStr = num ? String(num).padStart(2, "0") : "01";
                      const itemListStr = form.items.length > 0
                        ? form.items.map(i => `${i.productName} SL:${i.quantity}`).join("; ")
                        : "...";
                      return `Hoá đơn Phiếu xuất kho số ${numStr} bao gồm: ${itemListStr}`;
                    })()}
                    className="text-xs min-h-[60px] resize-none"
                    rows={3}
                  />
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="mt-auto border-t border-border pt-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Thành tiền</span>
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
                <span>TỔNG TIỀN:</span>
                <span className="text-orange-600 tabular-nums">{fmtVND(total)}</span>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-muted-foreground shrink-0">Đã thanh toán</span>
                <Input
                  type="number"
                  min={0}
                  max={total}
                  value={form.paidAmount}
                  onChange={e => setForm(f => ({ ...f, paidAmount: parseFloat(e.target.value) || 0 }))}
                  className="h-7 text-xs text-right w-28 tabular-nums"
                />
              </div>
              {total > 0 && form.paidAmount < total && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Còn lại</span>
                  <span className="text-destructive tabular-nums font-medium">
                    {fmtVND(Math.max(0, total - form.paidAmount))}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
