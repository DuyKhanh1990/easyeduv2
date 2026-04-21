import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useSidebarVisibility } from "@/hooks/use-sidebar-visibility";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Settings2, Plus, Trash2, Pencil, Tag, TrendingUp, TrendingDown,
  Percent, DollarSign, Lock, Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { FinanceTransactionCategory, FinancePromotion } from "@shared/schema";

type ConfigTabPerm = { canAdd: boolean; canEdit: boolean; canDelete: boolean };

const FINANCE_CONFIG_HREF = "/finance-config";
const FINANCE_TABS = [
  { value: "promotions", label: "Khuyến mãi/Phụ thu" },
  { value: "categories", label: "Danh mục Thu Chi" },
];

function buildTabPerm(data: import("@/hooks/use-my-permissions").MyPermissionsResult | undefined, tabValue: string): ConfigTabPerm {
  if (!data) return { canAdd: false, canEdit: false, canDelete: false };
  if (data.isSuperAdmin) return { canAdd: true, canEdit: true, canDelete: true };
  const key = `${FINANCE_CONFIG_HREF}#${tabValue}`;
  const p = data.permissions[key];
  if (!p) return { canAdd: false, canEdit: false, canDelete: false };
  return { canAdd: p.canCreate, canEdit: p.canEdit, canDelete: p.canDelete };
}

function canViewTab(data: import("@/hooks/use-my-permissions").MyPermissionsResult | undefined, tabValue: string): boolean {
  if (!data) return true;
  if (data.isSuperAdmin) return true;
  const key = `${FINANCE_CONFIG_HREF}#${tabValue}`;
  const p = data.permissions[key];
  if (!p) return false;
  return p.canView || p.canViewAll;
}

export default function FinanceConfig() {
  const { isSubTabVisible } = useSidebarVisibility();
  const { data: myPerms } = useMyPermissions();
  const visibleTabs = FINANCE_TABS.filter(t => isSubTabVisible(FINANCE_CONFIG_HREF, t.value) && canViewTab(myPerms, t.value));
  const [activeTab, setActiveTab] = useState(() => visibleTabs[0]?.value || "promotions");

  useEffect(() => {
    if (!visibleTabs.find(t => t.value === activeTab) && visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0].value);
    }
  }, [visibleTabs.map(t => t.value).join(",")]);

  if (visibleTabs.length === 0) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-2">
            <Settings2 className="h-8 w-8 text-purple-600" />
            Cấu hình tài chính
          </h1>
          <p className="text-muted-foreground">Tất cả các tab đã bị ẩn. Vui lòng bật lại trong Quản lý module.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-2">
            <Settings2 className="h-8 w-8 text-purple-600" />
            Cấu hình tài chính
          </h1>
          <p className="text-muted-foreground">Quản lý các danh mục cấu hình cho module tài chính</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex flex-wrap gap-2 mb-4">
            {visibleTabs.map(t => (
              <button
                key={t.value}
                onClick={() => setActiveTab(t.value)}
                className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all", activeTab === t.value ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}
              >{t.label}</button>
            ))}
          </div>

          {isSubTabVisible(FINANCE_CONFIG_HREF, "promotions") && canViewTab(myPerms, "promotions") && (
            <TabsContent value="promotions" className="mt-4">
              <PromotionsTab perm={buildTabPerm(myPerms, "promotions")} />
            </TabsContent>
          )}

          {isSubTabVisible(FINANCE_CONFIG_HREF, "categories") && canViewTab(myPerms, "categories") && (
            <TabsContent value="categories" className="mt-4">
              <CategoriesTab perm={buildTabPerm(myPerms, "categories")} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

// ==================== PROMOTIONS TAB ====================

const emptyPromoForm = () => ({
  code: "", name: "", valueAmount: "", valueType: "percent" as "percent" | "vnd",
  quantity: "", fromDate: "", toDate: ""
});

function PromoDialog({
  open, onClose, onSave, initial, title
}: {
  open: boolean;
  onClose: () => void;
  onSave: (item: any) => void;
  initial?: Partial<FinancePromotion>;
  title: string;
}) {
  const [form, setForm] = useState(() => initial
    ? {
        code: initial.code ?? "",
        name: initial.name ?? "",
        valueAmount: initial.valueAmount ?? "",
        valueType: (initial.valueType ?? "percent") as "percent" | "vnd",
        quantity: initial.quantity ? String(initial.quantity) : "",
        fromDate: initial.fromDate ?? "",
        toDate: initial.toDate ?? "",
      }
    : emptyPromoForm()
  );

  const handleSave = () => {
    if (!form.code.trim() || !form.name.trim()) return;
    onSave({
      code: form.code,
      name: form.name,
      valueAmount: form.valueAmount || null,
      valueType: form.valueType,
      quantity: form.quantity ? parseInt(form.quantity) : null,
      fromDate: form.fromDate || null,
      toDate: form.toDate || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Mã <span className="text-red-500">*</span></label>
              <Input
                placeholder="VD: KM001"
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                data-testid="input-promo-code"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Tên <span className="text-red-500">*</span></label>
              <Input
                placeholder="Tên khuyến mãi/phụ thu..."
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                data-testid="input-promo-name"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Giá trị</label>
            <div className="flex gap-2">
              <Input
                placeholder="Nhập giá trị..."
                value={form.valueAmount}
                onChange={e => setForm(f => ({ ...f, valueAmount: e.target.value }))}
                className="flex-1"
                data-testid="input-promo-value"
              />
              <Select value={form.valueType} onValueChange={v => setForm(f => ({ ...f, valueType: v as "percent" | "vnd" }))}>
                <SelectTrigger className="w-24" data-testid="select-promo-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">%</SelectItem>
                  <SelectItem value="vnd">VNĐ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Số lượng</label>
            <Input
              type="number"
              placeholder="Số lượng áp dụng..."
              value={form.quantity}
              onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
              data-testid="input-promo-quantity"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Thời gian áp dụng</label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Từ ngày</label>
                <Input type="date" value={form.fromDate} onChange={e => setForm(f => ({ ...f, fromDate: e.target.value }))} data-testid="input-promo-from" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Đến ngày</label>
                <Input type="date" value={form.toDate} onChange={e => setForm(f => ({ ...f, toDate: e.target.value }))} data-testid="input-promo-to" />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Huỷ</Button>
          <Button onClick={handleSave} disabled={!form.code.trim() || !form.name.trim()} data-testid="button-save-promo">
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PromoPanel({
  promoType, title, icon, accentColor, badgeLabel, badgeClass, dialogTitle, perm
}: {
  promoType: "promotion" | "surcharge";
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  badgeLabel: string;
  badgeClass: string;
  dialogTitle: string;
  perm?: ConfigTabPerm;
}) {
  const canAdd = perm?.canAdd ?? true;
  const canEdit = perm?.canEdit ?? true;
  const canDelete = perm?.canDelete ?? true;
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<FinancePromotion | null>(null);

  const { data: items = [], isLoading } = useQuery<FinancePromotion[]>({
    queryKey: ["/api/finance/promotions", promoType],
    queryFn: () => fetch(`/api/finance/promotions?type=${promoType}`).then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/finance/promotions", { ...data, type: promoType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/promotions", promoType] });
      setAddOpen(false);
      toast({ title: `Đã thêm ${title.toLowerCase()}` });
    },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PUT", `/api/finance/promotions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/promotions", promoType] });
      setEditItem(null);
      toast({ title: "Đã cập nhật" });
    },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/finance/promotions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/promotions", promoType] });
      toast({ title: "Đã xoá" });
    },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  return (
    <Card className="flex-1 flex flex-col overflow-hidden">
      <CardHeader className={`flex-shrink-0 pb-3 border-b border-l-4 ${accentColor}`}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
          {canAdd && (
            <Button size="sm" onClick={() => setAddOpen(true)} data-testid={`button-add-${promoType}`}>
              <Plus className="h-4 w-4 mr-1" />
              Thêm mới
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <Tag className="h-8 w-8 opacity-30" />
            <p className="text-sm">Chưa có dữ liệu</p>
          </div>
        ) : (
          <ul className="divide-y">
            {items.map(item => (
              <li key={item.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors" data-testid={`item-${promoType}-${item.id}`}>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono">{item.code}</span>
                    <Badge className={`text-xs ${badgeClass}`}>{badgeLabel}</Badge>
                  </div>
                  <span className="text-sm font-medium truncate">{item.name}</span>
                  <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
                    {item.valueAmount && (
                      <span>Giá trị: {item.valueAmount}{item.valueType === "percent" ? "%" : " VNĐ"}</span>
                    )}
                    {item.quantity && <span>SL: {item.quantity}</span>}
                    {item.fromDate && item.toDate && (
                      <span>{item.fromDate} → {item.toDate}</span>
                    )}
                  </div>
                </div>
                {(canEdit || canDelete) && (
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    {canEdit && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-blue-600" onClick={() => setEditItem(item)} data-testid={`button-edit-${promoType}-${item.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={() => deleteMutation.mutate(item.id)} data-testid={`button-delete-${promoType}-${item.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <PromoDialog open={addOpen} onClose={() => setAddOpen(false)} onSave={data => createMutation.mutate(data)} title={dialogTitle} />
      {editItem && (
        <PromoDialog open={!!editItem} onClose={() => setEditItem(null)} onSave={data => updateMutation.mutate({ id: editItem.id, data })} initial={editItem} title={`Chỉnh sửa ${title}`} />
      )}
    </Card>
  );
}

function PromotionsTab({ perm }: { perm?: ConfigTabPerm }) {
  return (
    <div className="flex gap-4 h-[calc(100vh-260px)] min-h-[400px]">
      <PromoPanel
        promoType="promotion"
        title="Khuyến mãi"
        icon={<Percent className="h-4 w-4 text-green-600" />}
        accentColor="border-l-green-500"
        badgeLabel="Khuyến mãi"
        badgeClass="bg-green-100 text-green-700 hover:bg-green-100"
        dialogTitle="Thêm khuyến mãi"
        perm={perm}
      />
      <PromoPanel
        promoType="surcharge"
        title="Phụ thu"
        icon={<DollarSign className="h-4 w-4 text-orange-600" />}
        accentColor="border-l-orange-500"
        badgeLabel="Phụ thu"
        badgeClass="bg-orange-100 text-orange-700 hover:bg-orange-100"
        dialogTitle="Thêm phụ thu"
        perm={perm}
      />
    </div>
  );
}

// ==================== CATEGORIES TAB ====================

function CategoryPanel({
  catType, title, icon, accentColor, badgeLabel, badgeClass, perm
}: {
  catType: "income" | "expense";
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  badgeLabel: string;
  badgeClass: string;
  perm?: ConfigTabPerm;
}) {
  const canAdd = perm?.canAdd ?? true;
  const canDelete = perm?.canDelete ?? true;
  const { toast } = useToast();
  const [inputVal, setInputVal] = useState("");

  const { data: items = [], isLoading } = useQuery<FinanceTransactionCategory[]>({
    queryKey: ["/api/finance/transaction-categories", catType],
    queryFn: () => fetch(`/api/finance/transaction-categories?type=${catType}`).then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => apiRequest("POST", "/api/finance/transaction-categories", { name, type: catType, isDefault: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/transaction-categories", catType] });
      setInputVal("");
      toast({ title: "Đã thêm danh mục" });
    },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/finance/transaction-categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/transaction-categories", catType] });
      toast({ title: "Đã xoá danh mục" });
    },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  const handleAdd = () => {
    if (!inputVal.trim()) return;
    createMutation.mutate(inputVal.trim());
  };

  return (
    <Card className="flex-1 flex flex-col overflow-hidden">
      <CardHeader className={`flex-shrink-0 pb-3 border-b border-l-4 ${accentColor}`}>
        <CardTitle className="text-base flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-4 flex-1 overflow-hidden">
        {canAdd && (
          <div className="flex gap-2">
            <Input
              placeholder={`Tên ${title.toLowerCase()}...`}
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
              data-testid={`input-${catType}`}
            />
            <Button size="sm" onClick={handleAdd} disabled={!inputVal.trim() || createMutation.isPending} data-testid={`button-add-${catType}`}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <p className="text-sm">Chưa có dữ liệu</p>
            </div>
          ) : (
            <ul className="divide-y rounded-md border">
              {items.map(item => (
                <li key={item.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/40 transition-colors" data-testid={`item-${catType}-${item.id}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    {item.isDefault && <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                    <span className="text-sm font-medium truncate">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <Badge className={`text-xs ${badgeClass}`}>{badgeLabel}</Badge>
                    {canDelete && (
                      item.isDefault ? (
                        <span className="h-6 w-6 inline-flex items-center justify-center text-muted-foreground/30" title="Không thể xoá danh mục mặc định">
                          <Lock className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive" onClick={() => deleteMutation.mutate(item.id)} data-testid={`button-delete-${catType}-${item.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CategoriesTab({ perm }: { perm?: ConfigTabPerm }) {
  return (
    <div className="flex gap-4 h-[calc(100vh-260px)] min-h-[400px]">
      <CategoryPanel
        catType="income"
        title="Danh mục Thu"
        icon={<TrendingUp className="h-4 w-4 text-blue-600" />}
        accentColor="border-l-blue-500"
        badgeLabel="Thu"
        badgeClass="bg-blue-100 text-blue-700 hover:bg-blue-100"
        perm={perm}
      />
      <CategoryPanel
        catType="expense"
        title="Danh mục Chi"
        icon={<TrendingDown className="h-4 w-4 text-red-600" />}
        accentColor="border-l-red-500"
        badgeLabel="Chi"
        badgeClass="bg-red-100 text-red-700 hover:bg-red-100"
        perm={perm}
      />
    </div>
  );
}
