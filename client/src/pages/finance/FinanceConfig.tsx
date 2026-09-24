import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, STATIC_STALE_TIME } from "@/lib/queryClient";
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
  Percent, DollarSign, Lock, Loader2, Bell, BellRing, Clock, Save, Search, Eye,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import type { FinanceTransactionCategory, FinancePromotion, FinanceVoucher } from "@shared/schema";
import { FinancePromotionDialog } from "./components/FinancePromotionDialog";

type ConfigTabPerm = { canAdd: boolean; canEdit: boolean; canDelete: boolean };

const FINANCE_CONFIG_HREF = "/finance-config";

function getTabFromUrl(): string {
  if (typeof window === "undefined") return "promotions";
  return new URLSearchParams(window.location.search).get("tab") || "promotions";
}

const FINANCE_TABS = [
  { value: "promotions", label: "Khuyến mãi/Phụ thu" },
  { value: "categories", label: "Danh mục Thu Chi" },
  { value: "voucher", label: "Voucher" },
  { value: "debt-reminder", label: "Nhắc công nợ" },
];

function buildTabPerm(data: import("@/hooks/use-my-permissions").MyPermissionsResult | null | undefined, tabValue: string): ConfigTabPerm {
  if (!data) return { canAdd: false, canEdit: false, canDelete: false };
  if (data.isSuperAdmin) return { canAdd: true, canEdit: true, canDelete: true };
  const key = `${FINANCE_CONFIG_HREF}#${tabValue}`;
  const p = data.permissions[key];
  if (!p) return { canAdd: false, canEdit: false, canDelete: false };
  return { canAdd: p.canCreate, canEdit: p.canEdit, canDelete: p.canDelete };
}

function canViewTab(data: import("@/hooks/use-my-permissions").MyPermissionsResult | null | undefined, tabValue: string): boolean {
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
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState(getTabFromUrl);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setLocation(`/finance-config?tab=${value}`);
  };

  useEffect(() => {
    if (!visibleTabs.find(t => t.value === activeTab) && visibleTabs.length > 0) {
      handleTabChange(visibleTabs[0].value);
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

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <div className="flex flex-wrap gap-2 mb-4">
            {visibleTabs.map(t => (
              <button
                key={t.value}
                onClick={() => handleTabChange(t.value)}
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

           {isSubTabVisible(FINANCE_CONFIG_HREF, "voucher") && canViewTab(myPerms, "voucher") && (
             <TabsContent value="voucher" className="mt-4">
               <VoucherTab perm={buildTabPerm(myPerms, "voucher")} />
             </TabsContent>
           )}

          {isSubTabVisible(FINANCE_CONFIG_HREF, "debt-reminder") && canViewTab(myPerms, "debt-reminder") && (
            <TabsContent value="debt-reminder" className="mt-4">
              <DebtReminderTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

// ==================== PROMOTIONS TAB ====================

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
    staleTime: STATIC_STALE_TIME,
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

       <FinancePromotionDialog open={addOpen} onClose={() => setAddOpen(false)} onSave={data => createMutation.mutate(data)} title={dialogTitle} isSaving={createMutation.isPending} />
      {editItem && (
         <FinancePromotionDialog open={!!editItem} onClose={() => setEditItem(null)} onSave={data => updateMutation.mutate({ id: editItem.id, data })} initial={editItem} title={`Chỉnh sửa ${title}`} isSaving={updateMutation.isPending} />
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
  const [addOpen, setAddOpen] = useState(false);
  const [inputVal, setInputVal] = useState("");

  const { data: items = [], isLoading } = useQuery<FinanceTransactionCategory[]>({
    queryKey: ["/api/finance/transaction-categories", catType],
    queryFn: () => fetch(`/api/finance/transaction-categories?type=${catType}`).then(r => r.json()),
    staleTime: STATIC_STALE_TIME,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => apiRequest("POST", "/api/finance/transaction-categories", { name, type: catType, isDefault: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/transaction-categories", catType] });
      setInputVal("");
      setAddOpen(false);
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
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
          {canAdd && (
            <Button size="sm" onClick={() => setAddOpen(true)} data-testid={`button-open-add-${catType}`}>
              <Plus className="h-4 w-4 mr-1" />
              Thêm mới
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-4 flex-1 overflow-hidden">
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
      <Dialog open={addOpen} onOpenChange={value => { if (!value && !createMutation.isPending) setAddOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Thêm {title.toLowerCase()}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 py-2">
            <label className="text-sm font-medium">Tên danh mục</label>
            <Input
              placeholder={`Tên ${title.toLowerCase()}...`}
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
              data-testid={`input-${catType}`}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={createMutation.isPending}>
              Huỷ
            </Button>
            <Button onClick={handleAdd} disabled={!inputVal.trim() || createMutation.isPending} data-testid={`button-add-${catType}`}>
              {createMutation.isPending ? "Đang lưu..." : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function getVoucherStatus(voucher: FinanceVoucher): "active" | "expiring" | "expired" {
  const today = new Date().toISOString().slice(0, 10);
  if (!voucher.isActive) return "expired";
  if (voucher.endDate && voucher.endDate < today) return "expired";
  // Số lượng đã hết → hết hạn trước thời hạn
  if (voucher.quantity !== null && voucher.usedCount >= voucher.quantity) return "expired";
  if (voucher.endDate) {
    const end = new Date(voucher.endDate + "T00:00:00");
    const diffDays = (end.getTime() - Date.now()) / 86_400_000;
    if (diffDays <= 5) return "expiring";
  }
  return "active";
}

function VoucherStatusBadge({ voucher }: { voucher: FinanceVoucher }) {
  const status = getVoucherStatus(voucher);
  if (status === "expired")
    return <Badge variant="secondary" className="text-red-600 bg-red-50 border-red-200">Hết hạn</Badge>;
  if (status === "expiring")
    return <Badge variant="secondary" className="text-orange-600 bg-orange-50 border-orange-200">Sắp hết hạn</Badge>;
  return <Badge className="bg-green-600 hover:bg-green-700 text-white">Đang hoạt động</Badge>;
}

function VoucherTab({ perm }: { perm: ConfigTabPerm }) {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<FinanceVoucher | null>(null);
  const [viewUsagesVoucher, setViewUsagesVoucher] = useState<FinanceVoucher | null>(null);
  const [usagesPage, setUsagesPage] = useState(1);
  const [usagesLimit, setUsagesLimit] = useState<20 | 30 | 50>(20);
  const [usagesSearchInput, setUsagesSearchInput] = useState("");
  const [usagesSearch, setUsagesSearch] = useState("");
  const [usagesStatus, setUsagesStatus] = useState<"all" | "used" | "unused">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAudienceStudents, setSelectedAudienceStudents] = useState<Array<{
    id: string;
    fullName: string;
    code: string;
    phone: string | null;
  }>>([]);
  const [listSearch, setListSearch] = useState("");
  const [form, setForm] = useState({
    code: "",
    name: "",
    audience: "all" as "all" | "specific" | "birthday",
    birthdayMode: "exact" as "exact" | "month",
    startDate: "",
    endDate: "",
    value: "",
    valueType: "percent" as "percent" | "vnd",
    quantityMode: "unlimited" as "unlimited" | "limited",
    quantity: "",
    usageLimit: "once" as "once" | "multiple",
  });

  const resetForm = () => {
    setForm({
      code: "",
      name: "",
      audience: "all",
      birthdayMode: "exact",
      startDate: "",
      endDate: "",
      value: "",
      valueType: "percent",
      quantityMode: "unlimited",
      quantity: "",
      usageLimit: "once",
    });
    setSearchTerm("");
    setSelectedAudienceStudents([]);
  };

  const openAddDialog = () => {
    setEditingVoucher(null);
    resetForm();
    setAddOpen(true);
  };

  const openEditDialog = (voucher: FinanceVoucher) => {
    setEditingVoucher(voucher);
    setForm({
      code: voucher.code,
      name: voucher.name,
      audience: voucher.audience as "all" | "specific" | "birthday",
      birthdayMode: (voucher.birthdayMode ?? "exact") as "exact" | "month",
      startDate: voucher.startDate ?? "",
      endDate: voucher.endDate ?? "",
      value: String(Number(voucher.valueAmount)),
      valueType: voucher.valueType as "percent" | "vnd",
      quantityMode: voucher.quantity == null ? "unlimited" : "limited",
      quantity: voucher.quantity != null ? String(voucher.quantity) : "",
      usageLimit: voucher.usageLimit as "once" | "multiple",
    });
    setSelectedAudienceStudents([]);
    setSearchTerm("");
    setAddOpen(true);
  };

  const { data: vouchers = [], isLoading } = useQuery<FinanceVoucher[]>({
    queryKey: ["/api/finance/vouchers", listSearch],
    queryFn: () => fetch(`/api/finance/vouchers${listSearch.trim() ? `?search=${encodeURIComponent(listSearch.trim())}` : ""}`, {
      credentials: "include",
    }).then(r => r.json()),
    staleTime: STATIC_STALE_TIME,
  });

  const { data: audienceSearchData, isFetching: isSearchingAudience } = useQuery<{
    students: Array<{
      id: string;
      fullName: string;
      code: string;
      phone: string | null;
    }>;
  }>({
    queryKey: ["/api/students", "voucher-audience", searchTerm.trim()],
    queryFn: () => fetch(
      `/api/students?minimal=true&limit=20&searchTerm=${encodeURIComponent(searchTerm.trim())}`,
      { credentials: "include" },
    ).then(async response => {
      if (!response.ok) throw new Error("Không thể tìm kiếm đối tượng áp dụng.");
      return response.json();
    }),
    enabled: addOpen && form.audience === "specific" && searchTerm.trim().length > 0,
    staleTime: 30_000,
  });

  const audienceSearchResults = audienceSearchData?.students ?? [];
  const selectedAudienceIds = new Set(selectedAudienceStudents.map(student => student.id));

  // Load audience students when editing a "specific" voucher
  const { data: editAudienceStudents } = useQuery<Array<{ id: string; fullName: string; code: string; phone: string | null }>>({
    queryKey: ["/api/finance/vouchers/audience-students", editingVoucher?.id],
    queryFn: () => fetch(`/api/finance/vouchers/${editingVoucher!.id}/audience-students`, { credentials: "include" }).then(r => r.json()),
    enabled: !!editingVoucher && editingVoucher.audience === "specific",
    staleTime: 0,
  });

  useEffect(() => {
    if (editAudienceStudents) setSelectedAudienceStudents(editAudienceStudents);
  }, [editAudienceStudents]);

  // Usages modal query
  const { data: usagesData, isLoading: usagesLoading } = useQuery<{
    data: Array<{ studentId: string; studentName: string; studentCode: string; usedAt: string | null; invoiceId: string | null }>;
    total: number;
    voucher: FinanceVoucher | null;
  }>({
    queryKey: ["/api/finance/vouchers/usages", viewUsagesVoucher?.id, usagesPage, usagesLimit, usagesSearch, usagesStatus],
    queryFn: () => fetch(
      `/api/finance/vouchers/${viewUsagesVoucher!.id}/usages?page=${usagesPage}&limit=${usagesLimit}&search=${encodeURIComponent(usagesSearch)}&status=${usagesStatus}`,
      { credentials: "include" },
    ).then(r => r.json()),
    enabled: !!viewUsagesVoucher,
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/finance/vouchers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/vouchers"] });
      setAddOpen(false);
      resetForm();
      toast({ title: "Đã thêm voucher" });
    },
    onError: (error: any) => toast({
      title: "Không thể thêm voucher",
      description: error.message,
      variant: "destructive",
    }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/finance/vouchers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/vouchers"] });
      setAddOpen(false);
      setEditingVoucher(null);
      resetForm();
      toast({ title: "Đã cập nhật voucher" });
    },
    onError: (error: any) => toast({
      title: "Không thể cập nhật voucher",
      description: error.message,
      variant: "destructive",
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/finance/vouchers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/vouchers"] });
      toast({ title: "Đã xoá voucher" });
    },
    onError: (error: any) => toast({
      title: "Không thể xoá voucher",
      description: error.message,
      variant: "destructive",
    }),
  });

  const handleSave = () => {
    const valueAmount = Number(form.value);
    const quantity = form.quantityMode === "limited" ? Number(form.quantity) : null;
    if (!form.code.trim() || !form.name.trim() || !Number.isFinite(valueAmount) || valueAmount <= 0) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng nhập mã, tên và giá trị voucher hợp lệ.",
        variant: "destructive",
      });
      return;
    }
    if (form.valueType === "percent" && valueAmount > 100) {
      toast({
        title: "Giá trị không hợp lệ",
        description: "Voucher phần trăm không được lớn hơn 100%.",
        variant: "destructive",
      });
      return;
    }
    if (form.quantityMode === "limited" && (!Number.isInteger(quantity) || quantity! < 1)) {
      toast({
        title: "Số lượng không hợp lệ",
        description: "Số lượng voucher phải là số nguyên lớn hơn 0.",
        variant: "destructive",
      });
      return;
    }
    if (form.audience === "specific" && selectedAudienceStudents.length === 0) {
      toast({
        title: "Chưa chọn đối tượng",
        description: "Vui lòng tìm và chọn ít nhất một học viên.",
        variant: "destructive",
      });
      return;
    }
    const payload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      audience: form.audience,
      birthdayMode: form.audience === "birthday" ? form.birthdayMode : null,
      audienceStudentIds: form.audience === "specific"
        ? selectedAudienceStudents.map(student => student.id)
        : null,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      valueAmount: String(valueAmount),
      valueType: form.valueType,
      quantity,
      usageLimit: form.usageLimit,
    };
    if (editingVoucher) {
      updateMutation.mutate({ id: editingVoucher.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const formatValue = (voucher: FinanceVoucher) =>
    `${Number(voucher.valueAmount).toLocaleString("vi-VN")}${voucher.valueType === "percent" ? "%" : " đ"}`;

  const formatAudience = (voucher: FinanceVoucher) => {
    if (voucher.audience === "birthday") {
      return voucher.birthdayMode === "month" ? "Sinh nhật trong tháng" : "Đúng ngày sinh nhật";
    }
    if (voucher.audience === "specific") return "Đối tượng chỉ định";
    return "Tất cả học viên";
  };

  return (
    <Card className="flex min-h-[400px] flex-col overflow-hidden">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Tag className="h-4 w-4 text-purple-600" />
            Voucher
          </CardTitle>
          <div className="flex items-center gap-2">
            <Input
              className="h-8 w-44"
              placeholder="Tìm voucher..."
              value={listSearch}
              onChange={e => setListSearch(e.target.value)}
              data-testid="input-search-voucher"
            />
            {perm.canAdd && (
              <Button size="sm" onClick={openAddDialog} data-testid="button-open-add-voucher">
                <Plus className="h-4 w-4 mr-1" />
                Thêm mới
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : vouchers.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <Tag className="h-9 w-9 opacity-30" />
            <p className="text-sm">Chưa có cấu hình voucher</p>
          </div>
        ) : (
          <ul className="divide-y">
            {vouchers.map(voucher => (
              <li key={voucher.id} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-purple-700">{voucher.code}</span>
                    <VoucherStatusBadge voucher={voucher} />
                  </div>
                  <p className="truncate text-sm font-medium">{voucher.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatAudience(voucher)} · {voucher.quantity == null ? "Không giới hạn" : `${voucher.quantity} lượt`} ·
                    {" "}{voucher.usageLimit === "once" ? "Mỗi người 1 lần" : "Nhiều lần"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-emerald-700">{formatValue(voucher)}</p>
                    <p className="text-xs text-muted-foreground">
                      {voucher.startDate || "Không giới hạn"} → {voucher.endDate || "Không giới hạn"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-blue-600"
                      onClick={() => {
                        setViewUsagesVoucher(voucher);
                        setUsagesPage(1);
                        setUsagesSearchInput("");
                        setUsagesSearch("");
                        setUsagesStatus("all");
                      }}
                      aria-label={`Xem danh sách học viên voucher ${voucher.code}`}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {perm.canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => openEditDialog(voucher)}
                        aria-label={`Sửa voucher ${voucher.code}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {perm.canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-red-600"
                        onClick={() => {
                          if (confirm(`Xoá voucher "${voucher.code}"?`)) deleteMutation.mutate(voucher.id);
                        }}
                        disabled={deleteMutation.isPending}
                        aria-label={`Xoá voucher ${voucher.code}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setEditingVoucher(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVoucher ? `Sửa Voucher · ${editingVoucher.code}` : "Thêm Voucher"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Mã Voucher <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="VD: WELCOME2026"
                  value={form.code}
                  onChange={e => setForm(current => ({ ...current, code: e.target.value }))}
                  data-testid="input-voucher-code"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Tên Voucher <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="Nhập tên voucher..."
                  value={form.name}
                  onChange={e => setForm(current => ({ ...current, name: e.target.value }))}
                  data-testid="input-voucher-name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Đối tượng áp dụng</label>
              <Select
                value={form.audience}
                onValueChange={value => setForm(current => ({
                  ...current,
                  audience: value as typeof current.audience,
                }))}
              >
                <SelectTrigger data-testid="select-voucher-audience">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="specific">Chỉ định đối tượng</SelectItem>
                  <SelectItem value="birthday">Sinh nhật</SelectItem>
                </SelectContent>
              </Select>

              {form.audience === "specific" && (
                <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Tìm tên khách hàng để chọn..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      data-testid="input-voucher-customer-search"
                    />
                  </div>
                  {selectedAudienceStudents.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedAudienceStudents.map(student => (
                        <button
                          key={student.id}
                          type="button"
                          className="rounded-full bg-primary/10 px-3 py-1 text-left text-xs text-primary hover:bg-primary/20"
                          onClick={() => setSelectedAudienceStudents(current =>
                            current.filter(item => item.id !== student.id)
                          )}
                          aria-label={`Bỏ chọn ${student.fullName}`}
                        >
                          {student.fullName} <span className="opacity-70">×</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="max-h-48 overflow-y-auto rounded-md border bg-background">
                    {!searchTerm.trim() ? (
                      <p className="px-3 py-5 text-center text-sm text-muted-foreground">
                        Nhập tên hoặc mã học viên để tìm và chọn nhiều đối tượng.
                      </p>
                    ) : isSearchingAudience ? (
                      <div className="flex items-center justify-center gap-2 px-3 py-5 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Đang tìm kiếm...
                      </div>
                    ) : audienceSearchResults.length === 0 ? (
                      <p className="px-3 py-5 text-center text-sm text-muted-foreground">
                        Không tìm thấy học viên phù hợp.
                      </p>
                    ) : (
                      <div className="divide-y">
                        {audienceSearchResults.map(student => {
                          const isSelected = selectedAudienceIds.has(student.id);
                          return (
                            <button
                              key={student.id}
                              type="button"
                              disabled={isSelected}
                              className={cn(
                                "flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors",
                                isSelected ? "cursor-default bg-primary/5" : "hover:bg-muted/50",
                              )}
                              onClick={() => {
                                if (!isSelected) {
                                  setSelectedAudienceStudents(current => [...current, student]);
                                }
                              }}
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium">{student.fullName}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {student.code}{student.phone ? ` · ${student.phone}` : ""}
                                </span>
                              </span>
                              <span className="shrink-0 text-xs text-primary">
                                {isSelected ? "Đã chọn" : "Chọn"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {form.audience === "birthday" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm(current => ({ ...current, birthdayMode: "exact" }))}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      form.birthdayMode === "exact"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted/50"
                    )}
                    data-testid="button-voucher-birthday-exact"
                  >
                    <span className="font-medium block">Đúng ngày/tháng</span>
                    <span className="text-xs text-muted-foreground">Áp dụng đúng ngày sinh</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(current => ({ ...current, birthdayMode: "month" }))}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      form.birthdayMode === "month"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted/50"
                    )}
                    data-testid="button-voucher-birthday-month"
                  >
                    <span className="font-medium block">Trong tháng</span>
                    <span className="text-xs text-muted-foreground">Áp dụng trong tháng sinh</span>
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Thời gian áp dụng</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Từ ngày</label>
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={e => setForm(current => ({ ...current, startDate: e.target.value }))}
                    data-testid="input-voucher-start-date"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Đến ngày</label>
                  <Input
                    type="date"
                    value={form.endDate}
                    onChange={e => setForm(current => ({ ...current, endDate: e.target.value }))}
                    data-testid="input-voucher-end-date"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Giá trị</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="0"
                    placeholder="Nhập giá trị..."
                    value={form.value}
                    onChange={e => setForm(current => ({ ...current, value: e.target.value }))}
                    className="flex-1"
                    data-testid="input-voucher-value"
                  />
                  <Select
                    value={form.valueType}
                    onValueChange={value => setForm(current => ({
                      ...current,
                      valueType: value as typeof current.valueType,
                    }))}
                  >
                    <SelectTrigger className="w-24" data-testid="select-voucher-value-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">%</SelectItem>
                      <SelectItem value="vnd">VNĐ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Số lượng</label>
                <div className="flex gap-2">
                  <Select
                    value={form.quantityMode}
                    onValueChange={value => setForm(current => ({
                      ...current,
                      quantityMode: value as typeof current.quantityMode,
                    }))}
                  >
                    <SelectTrigger className="flex-1" data-testid="select-voucher-quantity-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unlimited">Không giới hạn</SelectItem>
                      <SelectItem value="limited">Nhập số lượng</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.quantityMode === "limited" && (
                    <Input
                      type="number"
                      min="1"
                      placeholder="Số lượng"
                      value={form.quantity}
                      onChange={e => setForm(current => ({ ...current, quantity: e.target.value }))}
                      className="w-32"
                      data-testid="input-voucher-quantity"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Giới hạn sử dụng</label>
              <Select
                value={form.usageLimit}
                onValueChange={value => setForm(current => ({
                  ...current,
                  usageLimit: value as typeof current.usageLimit,
                }))}
              >
                <SelectTrigger data-testid="select-voucher-usage-limit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">1 lần</SelectItem>
                  <SelectItem value="multiple">Nhiều lần</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); setEditingVoucher(null); }}>
              Huỷ
            </Button>
            <Button
              onClick={handleSave}
              disabled={(createMutation.isPending || updateMutation.isPending) || !form.code.trim() || !form.name.trim() || !form.value}
              data-testid="button-save-voucher"
            >
              {(createMutation.isPending || updateMutation.isPending)
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : editingVoucher ? "Cập nhật" : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Usages modal */}
      <Dialog open={!!viewUsagesVoucher} onOpenChange={(open) => { if (!open) setViewUsagesVoucher(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-blue-600" />
              Danh sách học viên – Voucher {viewUsagesVoucher?.code}
              {viewUsagesVoucher && <VoucherStatusBadge voucher={viewUsagesVoucher} />}
            </DialogTitle>
          </DialogHeader>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8 h-9"
                placeholder="Tìm tên hoặc mã học viên..."
                value={usagesSearchInput}
                onChange={e => setUsagesSearchInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") { setUsagesSearch(usagesSearchInput); setUsagesPage(1); }
                }}
              />
            </div>
            <Button variant="secondary" size="sm" onClick={() => { setUsagesSearch(usagesSearchInput); setUsagesPage(1); }}>
              Tìm
            </Button>
            <Select value={usagesStatus} onValueChange={v => { setUsagesStatus(v as any); setUsagesPage(1); }}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả tình trạng</SelectItem>
                <SelectItem value="used">Đã sử dụng</SelectItem>
                <SelectItem value="unused">Chưa sử dụng</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(usagesLimit)} onValueChange={v => { setUsagesLimit(Number(v) as 20 | 30 | 50); setUsagesPage(1); }}>
              <SelectTrigger className="h-9 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20 / trang</SelectItem>
                <SelectItem value="30">30 / trang</SelectItem>
                <SelectItem value="50">50 / trang</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto rounded-md border mt-1">
            {usagesLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !usagesData || usagesData.data.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
                <Eye className="h-8 w-8 opacity-20 mb-2" />
                Không có học viên nào phù hợp
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Tên (mã)</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Thời gian áp dụng</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Tình trạng</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Trạng thái Voucher</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {usagesData.data.map((row, i) => (
                    <tr key={`${row.studentId}-${i}`} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <span className="font-medium">{row.studentName}</span>
                        <span className="ml-1.5 text-xs text-muted-foreground">({row.studentCode})</span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {row.usedAt
                          ? new Date(row.usedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {row.usedAt
                          ? <Badge className="bg-green-600 text-white text-xs">Đã sử dụng</Badge>
                          : <Badge variant="secondary" className="text-xs">Chưa sử dụng</Badge>}
                      </td>
                      <td className="px-4 py-2.5">
                        {viewUsagesVoucher && <VoucherStatusBadge voucher={viewUsagesVoucher} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {usagesData && usagesData.total > 0 && (
            <div className="flex items-center justify-between pt-2 text-sm text-muted-foreground">
              <span>
                {((usagesPage - 1) * usagesLimit) + 1}–{Math.min(usagesPage * usagesLimit, usagesData.total)} / {usagesData.total} học viên
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={usagesPage <= 1}
                  onClick={() => setUsagesPage(p => p - 1)}
                >
                  ← Trước
                </Button>
                <span className="px-3 text-sm">
                  Trang {usagesPage} / {Math.ceil(usagesData.total / usagesLimit)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={usagesPage >= Math.ceil(usagesData.total / usagesLimit)}
                  onClick={() => setUsagesPage(p => p + 1)}
                >
                  Sau →
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ==================== DEBT REMINDER TAB ====================

interface ReminderRule {
  id: string;
  days: string;
  time: string;
  cycle: "once" | "daily";
  enabled: boolean;
}

function makeRule(): ReminderRule {
  return { id: Math.random().toString(36).slice(2), days: "", time: "08:00", cycle: "once", enabled: false };
}

function ReminderRuleRow({
  rule,
  onChange,
  label,
  disabled = false,
}: {
  rule: ReminderRule;
  onChange: (r: ReminderRule) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn("grid grid-cols-3 gap-4 p-4 rounded-lg border bg-background transition-opacity", disabled && "pointer-events-none opacity-50")}>
      {/* Số ngày */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={365}
            placeholder="Nhập số ngày"
            value={rule.days}
            onChange={e => onChange({ ...rule, days: e.target.value })}
            className="h-9 text-sm"
            disabled={disabled}
          />
          <span className="text-sm text-muted-foreground whitespace-nowrap">ngày</span>
        </div>
      </div>

      {/* Giờ gửi */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Thời gian gửi
        </label>
        <Input
          type="time"
          value={rule.time}
          onChange={e => onChange({ ...rule, time: e.target.value })}
          className="h-9 text-sm"
          disabled={disabled}
        />
      </div>

      {/* Chu kỳ */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Chu kỳ</label>
        <Select value={rule.cycle} onValueChange={v => onChange({ ...rule, cycle: v as "once" | "daily" })} disabled={disabled}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="once">1 lần</SelectItem>
            <SelectItem value="daily">Hàng ngày</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function DebtReminderTab() {
  const { toast } = useToast();

  const { data: savedConfig, isLoading } = useQuery<any>({
    queryKey: ["/api/notification/debt-reminder-config"],
    staleTime: STATIC_STALE_TIME,
  });

  const [beforeRule, setBeforeRule] = useState<ReminderRule>(() => makeRule());
  const [afterRule, setAfterRule] = useState<ReminderRule>(() => makeRule());
  const [initialised, setInitialised] = useState(false);

  // Khi config load xong từ server thì điền vào state
  useEffect(() => {
    if (savedConfig && !initialised) {
      if (savedConfig.before) {
        setBeforeRule({
          id: "before",
          days: String(savedConfig.before.days ?? ""),
          time: savedConfig.before.time ?? "08:00",
          cycle: savedConfig.before.cycle ?? "once",
          enabled: savedConfig.before.enabled ?? false,
        });
      }
      if (savedConfig.after) {
        setAfterRule({
          id: "after",
          days: String(savedConfig.after.days ?? ""),
          time: savedConfig.after.time ?? "08:00",
          cycle: savedConfig.after.cycle ?? "once",
          enabled: savedConfig.after.enabled ?? false,
        });
      }
      setInitialised(true);
    }
  }, [savedConfig, initialised]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/notification/debt-reminder-config", {
        before: {
          days: parseInt(beforeRule.days) || 0,
          time: beforeRule.time,
          cycle: beforeRule.cycle,
          enabled: beforeRule.enabled,
        },
        after: {
          days: parseInt(afterRule.days) || 1,
          time: afterRule.time,
          cycle: afterRule.cycle,
          enabled: afterRule.enabled,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notification/debt-reminder-config"] });
      toast({ title: "Đã lưu cấu hình nhắc công nợ" });
    },
    onError: (e: any) =>
      toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleSave = () => saveMutation.mutate();

  return (
    <div className="max-w-2xl space-y-6">

      {/* Nhắc trước khi đến hạn */}
      <Card className={beforeRule.enabled ? "" : "opacity-75"}>
        <CardHeader className="pb-3 border-b border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-500" />
              Báo công nợ trước khi đến hạn
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {beforeRule.enabled ? "Đang bật" : "Đang tắt"}
              </span>
              <Switch
                checked={beforeRule.enabled}
                onCheckedChange={v => setBeforeRule(r => ({ ...r, enabled: v }))}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground pt-1">
            Gửi thông báo nhắc học viên trước khi hoá đơn đến hạn thanh toán.
          </p>
        </CardHeader>
        <CardContent className="pt-4">
          <ReminderRuleRow
            rule={beforeRule}
            label="Số ngày báo trước"
            onChange={setBeforeRule}
            disabled={!beforeRule.enabled}
          />
        </CardContent>
      </Card>

      {/* Nhắc sau khi quá hạn */}
      <Card className={afterRule.enabled ? "" : "opacity-75"}>
        <CardHeader className="pb-3 border-b border-l-4 border-l-red-500">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <BellRing className="h-4 w-4 text-red-500" />
              Báo công nợ quá hạn
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {afterRule.enabled ? "Đang bật" : "Đang tắt"}
              </span>
              <Switch
                checked={afterRule.enabled}
                onCheckedChange={v => setAfterRule(r => ({ ...r, enabled: v }))}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground pt-1">
            Gửi thông báo nhắc học viên sau khi hoá đơn đã quá hạn thanh toán.
          </p>
        </CardHeader>
        <CardContent className="pt-4">
          <ReminderRuleRow
            rule={afterRule}
            label="Số ngày sau hạn"
            onChange={setAfterRule}
            disabled={!afterRule.enabled}
          />
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} className="gap-2">
          <Save className="h-4 w-4" />
          Lưu cấu hình
        </Button>
      </div>
    </div>
  );
}
