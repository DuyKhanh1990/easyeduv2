import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, STATIC_STALE_TIME } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Trash2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Location = { id: string; name: string };
type Warehouse = { id: string; name: string; locationId: string | null };

type TransferItem = {
  _key: string;
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  currentStock: number;
};

export type TransferFormData = {
  code: string;
  date: string;
  fromLocationId: string;
  fromWarehouseId: string;
  toLocationId: string;
  toWarehouseId: string;
  note: string;
  hasReceiptIncome: boolean;
  hasReceiptExpense: boolean;
  items: TransferItem[];
};

type InventoryItem = {
  productId: string;
  code: string;
  name: string;
  warehouseId: string;
  actualStock: number;
  costPrice?: number;
};

interface Props {
  initialData?: Partial<TransferFormData> & { id?: string; status?: string };
  onClose: () => void;
  onSave: (data: TransferFormData, saveAndTransfer: boolean) => void;
  isSaving: boolean;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function StoreTransferDialog({ initialData, onClose, onSave, isSaving }: Props) {
  const isEdit = !!initialData?.id;
  const isReadOnly = isEdit && initialData?.status !== "draft";

  const [form, setForm] = useState<TransferFormData>({
    code: initialData?.code ?? "",
    date: initialData?.date ?? todayStr(),
    fromLocationId: initialData?.fromLocationId ?? "",
    fromWarehouseId: initialData?.fromWarehouseId ?? "",
    toLocationId: initialData?.toLocationId ?? "",
    toWarehouseId: initialData?.toWarehouseId ?? "",
    note: initialData?.note ?? "",
    hasReceiptIncome: initialData?.hasReceiptIncome ?? false,
    hasReceiptExpense: initialData?.hasReceiptExpense ?? false,
    items: initialData?.items ?? [],
  });

  const [productSearch, setProductSearch] = useState("");
  const [productDropOpen, setProductDropOpen] = useState(false);

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

  const { data: nextCode } = useQuery<{ code: string }>({
    queryKey: ["/api/store/transfers/next-code"],
    queryFn: () => apiRequest("GET", "/api/store/transfers/next-code").then(r => r.json()),
    enabled: !isEdit,
  });

  useEffect(() => {
    if (!isEdit && nextCode?.code) {
      setForm(f => ({ ...f, code: nextCode.code }));
    }
  }, [nextCode, isEdit]);

  const { data: inventoryResp } = useQuery<{ data: InventoryItem[]; total: number } | InventoryItem[]>({
    queryKey: ["/api/store/inventory", { q: productSearch, warehouseId: form.fromWarehouseId }],
    queryFn: () =>
      apiRequest("GET", `/api/store/inventory?q=${encodeURIComponent(productSearch)}&warehouseId=${form.fromWarehouseId}`)
        .then(r => r.json()),
    enabled: productDropOpen && !!form.fromWarehouseId,
  });
  const inventoryRaw: InventoryItem[] = Array.isArray(inventoryResp) ? inventoryResp : (inventoryResp?.data ?? []);

  // Sort: stock > 0 first (top 10), then stock = 0 greyed at bottom
  const inventoryPositive = inventoryRaw.filter(i => i.actualStock > 0);
  const inventoryZero = inventoryRaw.filter(i => i.actualStock <= 0);
  const inventoryDisplay = [
    ...inventoryPositive.slice(0, productSearch ? inventoryPositive.length : 10),
    ...inventoryZero,
  ];

  const fromWarehouses = allWarehouses.filter(w =>
    form.fromLocationId ? w.locationId === form.fromLocationId : true
  );
  const toWarehouses = allWarehouses.filter(w =>
    form.toLocationId ? w.locationId === form.toLocationId : true
  );

  function addItem(inv: InventoryItem) {
    if (inv.actualStock <= 0) return;
    const exists = form.items.find(i => i.productId === inv.productId);
    if (exists) return;
    setForm(f => ({
      ...f,
      items: [
        ...f.items,
        {
          _key: crypto.randomUUID(),
          productId: inv.productId,
          productCode: inv.code,
          productName: inv.name,
          quantity: 1,
          unitPrice: inv.costPrice ?? 0,
          currentStock: inv.actualStock,
        },
      ],
    }));
    setProductSearch("");
  }

  function removeItem(key: string) {
    setForm(f => ({ ...f, items: f.items.filter(i => i._key !== key) }));
  }

  function updateQty(key: string, qty: number) {
    setForm(f => ({
      ...f,
      items: f.items.map(i => i._key === key ? { ...i, quantity: Math.max(1, qty) } : i),
    }));
  }

  function updateUnitPrice(key: string, price: number) {
    setForm(f => ({
      ...f,
      items: f.items.map(i => i._key === key ? { ...i, unitPrice: Math.max(0, price) } : i),
    }));
  }

  const fromWarehouse = allWarehouses.find(w => w.id === form.fromWarehouseId);
  const toWarehouse = allWarehouses.find(w => w.id === form.toWarehouseId);
  const fromLocation = locations.find(l => l.id === form.fromLocationId);
  const toLocation = locations.find(l => l.id === form.toLocationId);
  const totalQty = form.items.reduce((s, i) => s + i.quantity, 0);
  const totalAmount = form.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  function fmtCurrency(n: number) {
    return n.toLocaleString("vi-VN") + "đ";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 py-2">
      <div className="bg-background rounded-2xl shadow-2xl w-full h-[98vh] flex flex-col" style={{ maxWidth: 900 }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-sm font-semibold">
              {isEdit ? (isReadOnly ? "Chi tiết phiếu chuyển kho" : "Sửa phiếu chuyển kho") : "Tạo phiếu chuyển kho"}
            </h2>
            {isReadOnly && (
              <p className="text-xs text-amber-600 mt-0.5">
                Phiếu đã được xác nhận — chỉ đọc. Nếu cần thay đổi, hãy hủy và tạo mới.
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Mã phiếu + Ngày */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Mã phiếu</Label>
              <Input
                className="h-8 text-xs font-mono"
                value={form.code}
                onChange={e => !isReadOnly && setForm(f => ({ ...f, code: e.target.value }))}
                readOnly={isReadOnly}
                placeholder="CK000001"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Ngày chuyển</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={form.date}
                onChange={e => !isReadOnly && setForm(f => ({ ...f, date: e.target.value }))}
                readOnly={isReadOnly}
              />
            </div>
          </div>

          {/* Kho nguồn + Kho đích */}
          <div className="grid grid-cols-2 gap-4">
            {/* LEFT: Kho nguồn */}
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-100/70 border-b border-indigo-200">
                <div className="w-2 h-2 rounded-full bg-indigo-500" />
                <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Kho nguồn</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Cơ sở <span className="text-destructive">*</span></Label>
                  {isReadOnly ? (
                    <ReadOnlyField value={fromLocation?.name ?? "—"} />
                  ) : (
                    <Select
                      value={form.fromLocationId}
                      onValueChange={val => setForm(f => ({ ...f, fromLocationId: val, fromWarehouseId: "", items: [] }))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Chọn cơ sở" />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.map(l => (
                          <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Kho <span className="text-destructive">*</span></Label>
                  {isReadOnly ? (
                    <ReadOnlyField value={fromWarehouse?.name ?? "—"} />
                  ) : (
                    <Select
                      value={form.fromWarehouseId}
                      onValueChange={val => setForm(f => ({ ...f, fromWarehouseId: val, items: [] }))}
                      disabled={!form.fromLocationId}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder={form.fromLocationId ? "Chọn kho" : "Chọn cơ sở trước"} />
                      </SelectTrigger>
                      <SelectContent>
                        {fromWarehouses
                          .filter(w => w.id !== form.toWarehouseId)
                          .map(w => (
                            <SelectItem key={w.id} value={w.id} className="text-xs">{w.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {!isReadOnly && (
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox
                      id="has-income"
                      checked={form.hasReceiptIncome}
                      onCheckedChange={v => setForm(f => ({ ...f, hasReceiptIncome: !!v }))}
                    />
                    <label htmlFor="has-income" className="text-xs cursor-pointer select-none">
                      Xuất phiếu thu cho cơ sở nguồn
                    </label>
                  </div>
                )}
                {isReadOnly && form.hasReceiptIncome && (
                  <div className="text-xs text-emerald-600 font-medium">✓ Xuất phiếu thu</div>
                )}
              </div>
            </div>

            {/* RIGHT: Kho đích */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-100/70 border-b border-emerald-200">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Kho đích</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Cơ sở <span className="text-destructive">*</span></Label>
                  {isReadOnly ? (
                    <ReadOnlyField value={toLocation?.name ?? "—"} />
                  ) : (
                    <Select
                      value={form.toLocationId}
                      onValueChange={val => setForm(f => ({ ...f, toLocationId: val, toWarehouseId: "" }))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Chọn cơ sở" />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.map(l => (
                          <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Kho <span className="text-destructive">*</span></Label>
                  {isReadOnly ? (
                    <ReadOnlyField value={toWarehouse?.name ?? "—"} />
                  ) : (
                    <Select
                      value={form.toWarehouseId}
                      onValueChange={val => setForm(f => ({ ...f, toWarehouseId: val }))}
                      disabled={!form.toLocationId}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder={form.toLocationId ? "Chọn kho" : "Chọn cơ sở trước"} />
                      </SelectTrigger>
                      <SelectContent>
                        {toWarehouses
                          .filter(w => w.id !== form.fromWarehouseId)
                          .map(w => (
                            <SelectItem key={w.id} value={w.id} className="text-xs">{w.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {!isReadOnly && (
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox
                      id="has-expense"
                      checked={form.hasReceiptExpense}
                      onCheckedChange={v => setForm(f => ({ ...f, hasReceiptExpense: !!v }))}
                    />
                    <label htmlFor="has-expense" className="text-xs cursor-pointer select-none">
                      Xuất phiếu chi cho cơ sở đích
                    </label>
                  </div>
                )}
                {isReadOnly && form.hasReceiptExpense && (
                  <div className="text-xs text-blue-600 font-medium">✓ Xuất phiếu chi</div>
                )}
              </div>
            </div>
          </div>

          {/* Ghi chú */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Ghi chú</Label>
            <Textarea
              className="text-xs resize-none h-14"
              placeholder="Ghi chú thêm..."
              value={form.note}
              onChange={e => !isReadOnly && setForm(f => ({ ...f, note: e.target.value }))}
              readOnly={isReadOnly}
            />
          </div>

          {/* Danh sách sản phẩm */}
          <div className="space-y-2 flex-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Danh sách sản phẩm</Label>
              <span className="text-xs text-muted-foreground">
                {form.items.length} sản phẩm · {totalQty} cái
                {totalAmount > 0 && <> · <span className="font-semibold text-foreground">{fmtCurrency(totalAmount)}</span></>}
              </span>
            </div>

            {!isReadOnly && (
              <div className="relative">
                <div
                  className={cn(
                    "flex items-center gap-2 px-3 h-8 border border-border rounded-lg text-xs cursor-text",
                    !form.fromWarehouseId && "opacity-50 pointer-events-none bg-muted/30"
                  )}
                  onClick={() => form.fromWarehouseId && setProductDropOpen(true)}
                >
                  <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <input
                    className="flex-1 outline-none bg-transparent text-xs placeholder:text-muted-foreground"
                    placeholder={form.fromWarehouseId ? "Tìm sản phẩm từ kho nguồn..." : "Chọn kho nguồn trước"}
                    value={productSearch}
                    onChange={e => { setProductSearch(e.target.value); setProductDropOpen(true); }}
                    onFocus={() => form.fromWarehouseId && setProductDropOpen(true)}
                    disabled={!form.fromWarehouseId}
                  />
                  {productSearch && (
                    <button onClick={() => setProductSearch("")} className="text-muted-foreground hover:text-foreground">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {productDropOpen && form.fromWarehouseId && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setProductDropOpen(false)} />
                    <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-background border border-border rounded-xl shadow-lg overflow-hidden">
                      <div className="max-h-64 overflow-y-auto">
                        {inventoryDisplay.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-6 text-center">
                            {productSearch ? "Không tìm thấy sản phẩm" : "Kho chưa có hàng tồn"}
                          </p>
                        ) : (
                          <>
                            {inventoryPositive.slice(0, productSearch ? inventoryPositive.length : 10).map(inv => {
                              const alreadyAdded = form.items.some(i => i.productId === inv.productId);
                              return (
                                <button
                                  key={inv.productId}
                                  className={cn(
                                    "w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/50 transition-colors text-left",
                                    alreadyAdded && "opacity-50"
                                  )}
                                  onClick={() => { addItem(inv); setProductDropOpen(false); }}
                                  disabled={alreadyAdded}
                                >
                                  <div>
                                    <p className="font-medium">{inv.name}</p>
                                    <p className="text-muted-foreground font-mono text-[10px]">{inv.code}</p>
                                  </div>
                                  <div className="text-right ml-2 shrink-0">
                                    <span className="font-semibold text-emerald-600">Tồn: {inv.actualStock}</span>
                                    {alreadyAdded && <p className="text-[10px] text-muted-foreground">Đã thêm</p>}
                                  </div>
                                </button>
                              );
                            })}
                            {inventoryZero.length > 0 && (
                              <>
                                <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground bg-muted/30 border-t border-border">
                                  Hết hàng — không thể chọn
                                </div>
                                {inventoryZero.map(inv => (
                                  <div
                                    key={inv.productId}
                                    className="flex items-center justify-between px-3 py-2 text-xs opacity-35 cursor-not-allowed"
                                  >
                                    <div>
                                      <p className="font-medium">{inv.name}</p>
                                      <p className="text-muted-foreground font-mono text-[10px]">{inv.code}</p>
                                    </div>
                                    <span className="font-semibold text-red-500 shrink-0 ml-2">Tồn: 0</span>
                                  </div>
                                ))}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Items table */}
            {form.items.length > 0 ? (
              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Sản phẩm</th>
                      <th className="text-center px-3 py-2 font-semibold text-muted-foreground w-16">Tồn kho</th>
                      <th className="text-center px-3 py-2 font-semibold text-muted-foreground w-24">Số lượng</th>
                      <th className="text-right px-3 py-2 font-semibold text-muted-foreground w-32">Đơn giá</th>
                      <th className="text-right px-3 py-2 font-semibold text-muted-foreground w-28">Thành tiền</th>
                      {!isReadOnly && <th className="w-8" />}
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map(item => (
                      <tr key={item._key} className="border-t border-border hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2">
                          <p className="font-medium">{item.productName}</p>
                          <p className="text-muted-foreground font-mono text-[10px]">{item.productCode}</p>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={cn(
                            "font-medium tabular-nums",
                            item.currentStock <= 0 ? "text-red-500" : item.currentStock < item.quantity ? "text-amber-600" : "text-emerald-600"
                          )}>
                            {item.currentStock}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {isReadOnly ? (
                            <div className="text-center font-semibold tabular-nums">{item.quantity}</div>
                          ) : (
                            <Input
                              type="number"
                              min={1}
                              className="h-7 text-xs text-center w-full"
                              value={item.quantity}
                              onChange={e => updateQty(item._key, parseInt(e.target.value) || 1)}
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isReadOnly ? (
                            <div className="text-right tabular-nums">{fmtCurrency(item.unitPrice)}</div>
                          ) : (
                            <Input
                              type="number"
                              min={0}
                              className="h-7 text-xs text-right w-full"
                              value={item.unitPrice}
                              onChange={e => updateUnitPrice(item._key, parseFloat(e.target.value) || 0)}
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {fmtCurrency(item.quantity * item.unitPrice)}
                        </td>
                        {!isReadOnly && (
                          <td className="px-2 py-2 text-center">
                            <button
                              onClick={() => removeItem(item._key)}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  {totalAmount > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/30">
                        <td colSpan={4} className="px-3 py-2 text-right font-semibold text-muted-foreground">
                          Tổng cộng
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-foreground tabular-nums">
                          {fmtCurrency(totalAmount)}
                        </td>
                        {!isReadOnly && <td />}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            ) : (
              <div className="text-center py-10 text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                {!isReadOnly ? (
                  form.fromWarehouseId ? "Tìm và thêm sản phẩm từ kho nguồn ở trên." : "Chọn kho nguồn để tìm sản phẩm."
                ) : "Không có sản phẩm."}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
          <div className="text-xs text-muted-foreground">
            {form.items.length > 0 && (
              <span>{form.items.length} sản phẩm · tổng <span className="font-semibold text-foreground">{totalQty}</span> cái</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
              {isReadOnly ? "Đóng" : "Huỷ"}
            </Button>
            {!isReadOnly && (() => {
              const canSubmit = !isSaving && !!form.fromWarehouseId && !!form.toWarehouseId && form.fromWarehouseId !== form.toWarehouseId && form.items.length > 0;
              return (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSave(form, false)}
                    disabled={!canSubmit}
                    className="h-8 text-xs"
                  >
                    {isSaving ? "Đang lưu..." : "Nháp"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => onSave(form, true)}
                    disabled={!canSubmit}
                    className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700"
                  >
                    {isSaving ? "Đang xử lý..." : "Lưu và chuyển"}
                  </Button>
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReadOnlyField({ value }: { value: string }) {
  return (
    <div className="h-8 flex items-center px-3 text-xs border border-border rounded-md bg-muted/30 text-foreground">
      {value}
    </div>
  );
}
