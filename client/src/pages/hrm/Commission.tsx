import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Download, Eye, Plus, Pencil, Trash2, Wallet } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useSidebarVisibility } from "@/hooks/use-sidebar-visibility";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { useLocations } from "@/hooks/use-locations";
import { getAuthHeaders } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { downloadXlsx } from "@/lib/excel-utils";

type TabValue = "commission-board" | "commission-config";
type RoleKey = "sale" | "manager" | "teacher" | "invoice_creator" | "commission_assigner";
type RoleConfig = {
  mode: "percent" | "amount";
  value: number;
  applicationMode: "always" | "first_invoice" | "subsequent_invoices";
};
type CommissionConfig = {
  id: string;
  name: string;
  locationIds: string[];
  locationNames: string[];
  invoiceTypes: string[];
  invoiceStatuses: string[];
  effectiveFrom: string;
  effectiveTo: string | null;
  description: string | null;
  roleConfigs: Partial<Record<RoleKey, RoleConfig>>;
};
type CommissionForm = Omit<CommissionConfig, "id" | "locationNames">;
type CommissionBoardDetail = {
  invoiceId: string;
  invoiceCode: string;
  invoiceType: string;
  customerName: string;
  role: RoleKey;
  configName: string;
  status: "unpaid" | "paid";
  businessDate: string;
  revenue: number;
  commissionableRevenue: number;
  rate: number;
  rateMode: "percent" | "amount";
  applicationMode: "always" | "first_invoice" | "subsequent_invoices";
  invoicePercentage: number;
  commission: number;
};
type CommissionBoardRow = {
  locationId: string | null;
  locationName: string;
  staffId: string;
  staffName: string;
  invoiceCount: number;
  totalRevenue: number;
  totalCommission: number;
  details: CommissionBoardDetail[];
};
type CommissionBoardResponse = {
  rows: CommissionBoardRow[];
  totals: { invoiceCount: number; totalRevenue: number; totalCommission: number };
};

const HREF = "/commission";
const ALL_TABS = [
  { value: "commission-board" as TabValue, label: "Bảng hoa hồng", resource: "/commission#commission-board" },
  { value: "commission-config" as TabValue, label: "Cấu hình hoa hồng", resource: "/commission#commission-config" },
];
const EMPTY_FORM: CommissionForm = {
  name: "",
  locationIds: [],
  invoiceTypes: [],
  invoiceStatuses: ["unpaid", "paid"],
  effectiveFrom: new Date().toISOString().slice(0, 10),
  effectiveTo: null,
  description: "",
  roleConfigs: {},
};

const ROLE_OPTIONS: { value: RoleKey; label: string; description: string }[] = [
  { value: "sale", label: "Sale", description: "Gán trong trang CRM" },
  { value: "manager", label: "Phụ trách", description: "Gán trong trang CRM" },
  { value: "teacher", label: "Giáo viên", description: "Gán trong trang CRM" },
  { value: "invoice_creator", label: "Người tạo hóa đơn", description: "Trang hóa đơn" },
  { value: "commission_assigner", label: "Người Gán hoa hồng", description: "Nhân sự được chọn trong hóa đơn" },
];

const INVOICE_STATUS_OPTIONS = [
  { value: "unpaid", label: "Chưa thanh toán" },
  { value: "paid", label: "Đã thanh toán" },
];

const getRoleLabel = (role: RoleKey) => ROLE_OPTIONS.find(option => option.value === role)?.label ?? role;
const getRoleDescription = (role: RoleKey) => ROLE_OPTIONS.find(option => option.value === role)?.description;
const getApplicationModeLabel = (mode: CommissionBoardDetail["applicationMode"]) => (
  mode === "first_invoice"
    ? "Hóa đơn đầu tiên"
    : mode === "subsequent_invoices"
      ? "Hóa đơn thứ 2 trở đi"
      : "Luôn áp dụng"
);
const createRoleConfig = (): RoleConfig => ({ mode: "percent", value: 0, applicationMode: "always" });
const formatMoney = (value: number) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value);
const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const getCurrentMonthRange = () => {
  const now = new Date();
  return {
    from: formatDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: formatDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
};

function getTabFromUrl(): TabValue {
  if (typeof window === "undefined") return "commission-board";
  return new URLSearchParams(window.location.search).get("tab") === "commission-config"
    ? "commission-config"
    : "commission-board";
}

export function Commission() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabValue>(getTabFromUrl);
  const { isSubTabVisible } = useSidebarVisibility();
  const { data: myPerms } = useMyPermissions();
  const { data: locations = [] } = useLocations();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CommissionForm>(EMPTY_FORM);
  const [pendingRoleRows, setPendingRoleRows] = useState(0);
  const currentMonth = getCurrentMonthRange();
  const [boardDateFrom, setBoardDateFrom] = useState(currentMonth.from);
  const [boardDateTo, setBoardDateTo] = useState(currentMonth.to);
  const [selectedBoardRow, setSelectedBoardRow] = useState<CommissionBoardRow | null>(null);
  const { data: incomeCategories = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/finance/transaction-categories", "income"],
    queryFn: async () => {
      const response = await fetch("/api/finance/transaction-categories?type=income", {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error("Không thể tải danh mục thu.");
      return response.json();
    },
    enabled: dialogOpen,
    staleTime: 60_000,
  });
  const { data: configs = [], isLoading: configsLoading } = useQuery<CommissionConfig[]>({
    queryKey: ["/api/commission-configs"],
    queryFn: async () => {
      const response = await fetch("/api/commission-configs", {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error("Không thể tải cấu hình hoa hồng.");
      return response.json();
    },
    enabled: activeTab === "commission-config",
  });
  const { data: boardData, isLoading: boardLoading, isError: boardError } = useQuery<CommissionBoardResponse>({
    queryKey: ["/api/commission-board", boardDateFrom, boardDateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ dateFrom: boardDateFrom, dateTo: boardDateTo });
      const response = await fetch(`/api/commission-board?${params.toString()}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error("Không thể tải bảng hoa hồng.");
      return response.json();
    },
    enabled: activeTab === "commission-board",
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: CommissionForm) => {
      const response = await fetch(editingId ? `/api/commission-configs/${editingId}` : "/api/commission-configs", {
        method: editingId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Không thể lưu cấu hình hoa hồng.");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commission-configs"] });
      setDialogOpen(false);
      toast({ title: editingId ? "Đã cập nhật cấu hình hoa hồng." : "Đã thêm cấu hình hoa hồng." });
    },
    onError: (error: Error) => toast({ title: "Không thể lưu cấu hình", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/commission-configs/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error("Không thể xóa cấu hình hoa hồng.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commission-configs"] });
      toast({ title: "Đã xóa cấu hình hoa hồng." });
    },
    onError: (error: Error) => toast({ title: "Không thể xóa cấu hình", description: error.message, variant: "destructive" }),
  });

  const canAccessTab = (resource: string): boolean => {
    if (!myPerms || myPerms.isSuperAdmin) return true;
    const perm = myPerms.permissions[resource];
    return !!perm && (perm.canView || perm.canViewAll || perm.canCreate || perm.canEdit || perm.canDelete);
  };

  const visibleTabs = ALL_TABS.filter(
    tab => isSubTabVisible(HREF, tab.value) && canAccessTab(tab.resource),
  );

  useEffect(() => {
    const tab = getTabFromUrl();
    if (tab !== activeTab) setActiveTab(tab);
  }, []);

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some(tab => tab.value === activeTab)) {
      handleTabChange(visibleTabs[0].value);
    }
  }, [visibleTabs.map(tab => tab.value).join(","), activeTab]);

  const handleTabChange = (value: string) => {
    const nextTab = value as TabValue;
    setActiveTab(nextTab);
    setLocation(`${HREF}?tab=${nextTab}`);
  };

  const openCreateDialog = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, roleConfigs: { ...EMPTY_FORM.roleConfigs } });
    setPendingRoleRows(0);
    setDialogOpen(true);
  };

  const openEditDialog = (config: CommissionConfig) => {
    setEditingId(config.id);
    setForm({
      name: config.name,
      locationIds: config.locationIds ?? [],
      invoiceTypes: config.invoiceTypes ?? [],
      invoiceStatuses: (config.invoiceStatuses ?? []).filter(status => status === "unpaid" || status === "paid"),
      effectiveFrom: config.effectiveFrom,
      effectiveTo: config.effectiveTo,
      description: config.description ?? "",
      roleConfigs: {
        ...EMPTY_FORM.roleConfigs,
        ...(config.roleConfigs ?? {}),
      },
    });
    setPendingRoleRows(0);
    setDialogOpen(true);
  };

  const updateRole = (role: RoleKey, field: keyof RoleConfig, value: string) => {
    setForm(current => ({
      ...current,
      roleConfigs: {
        ...current.roleConfigs,
        [role]: {
          ...current.roleConfigs[role],
          [field]: field === "value" ? Math.max(0, Number(value) || 0) : value,
        },
      },
    }));
  };

  const submitForm = () => {
    if (!form.name.trim() || form.locationIds.length === 0 || form.invoiceTypes.length === 0 || form.invoiceStatuses.length === 0 || !form.effectiveFrom) {
      toast({ title: "Vui lòng điền đủ thông tin bắt buộc.", variant: "destructive" });
      return;
    }
    saveMutation.mutate({
      ...form,
      name: form.name.trim(),
      effectiveTo: form.effectiveTo || null,
    });
  };

  const downloadCommissionDetails = () => {
    if (!selectedBoardRow || selectedBoardRow.details.length === 0) {
      toast({ title: "Không có dữ liệu chi tiết để tải xuống.", variant: "destructive" });
      return;
    }

    downloadXlsx({
      filename: `chi-tiet-hoa-hong-${selectedBoardRow.staffName}-${boardDateFrom}`,
      sheetName: "Chi tiết hoa hồng",
      title: "Chi tiết hoa hồng",
      subtitle: `${selectedBoardRow.locationName} · ${selectedBoardRow.staffName} · ${boardDateFrom} đến ${boardDateTo}`,
      columns: [
        { header: "Hóa đơn", width: 16 },
        { header: "Loại hóa đơn", width: 16 },
        { header: "Khách hàng", width: 24 },
        { header: "Ngày tính", width: 14 },
        { header: "Vai trò", width: 22 },
        { header: "Cấu hình", width: 24 },
        { header: "Hóa đơn áp dụng", width: 24 },
        { header: "Trạng thái", width: 18 },
        { header: "Doanh thu", width: 16 },
        { header: "Doanh thu HH", width: 18 },
        { header: "Mức hoa hồng", width: 16 },
        { header: "Hoa hồng", width: 16 },
      ],
      rows: selectedBoardRow.details.map(detail => [
        detail.invoiceCode,
        detail.invoiceType,
        detail.customerName,
        detail.businessDate.split("-").reverse().join("/"),
        getRoleLabel(detail.role),
        detail.configName,
        getApplicationModeLabel(detail.applicationMode),
        detail.status === "paid" ? "Đã thanh toán" : "Chưa thanh toán",
        detail.revenue,
        `${formatMoney(detail.commissionableRevenue)}đ (${detail.invoicePercentage}%)`,
        detail.rateMode === "percent" ? `${detail.rate}%` : `${formatMoney(detail.rate)}đ`,
        detail.commission,
      ]),
      summaryRows: [[
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "Tổng hoa hồng",
        "",
        selectedBoardRow.totalCommission,
      ]],
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-orange-500" />
          <h1 className="text-xl font-bold text-foreground">Hoa hồng</h1>
        </div>

        {visibleTabs.length === 0 ? (
          <p className="text-muted-foreground">Tất cả các tab đã bị ẩn. Vui lòng bật lại trong Quản lý module.</p>
        ) : (
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <div className="mb-4 flex flex-wrap gap-2">
              {visibleTabs.map(tab => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => handleTabChange(tab.value)}
                  data-testid={`tab-${tab.value}`}
                  className={cn(
                    "rounded-md border px-3 py-1 text-xs font-medium transition-all",
                    activeTab === tab.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-muted/50",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <TabsContent value="commission-board" className="mt-4">
              <div className="space-y-4">
                <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-800">Bảng hoa hồng</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Tổng hợp hoa hồng theo nhân sự và cơ sở trong khoảng thời gian đã chọn.</p>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="commission-board-from" className="text-xs text-slate-500">Từ ngày</Label>
                      <Input id="commission-board-from" type="date" value={boardDateFrom} onChange={event => setBoardDateFrom(event.target.value)} className="h-9 w-[145px]" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="commission-board-to" className="text-xs text-slate-500">Đến ngày</Label>
                      <Input id="commission-board-to" type="date" value={boardDateTo} onChange={event => setBoardDateTo(event.target.value)} className="h-9 w-[145px]" />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9"
                      onClick={() => {
                        const range = getCurrentMonthRange();
                        setBoardDateFrom(range.from);
                        setBoardDateTo(range.to);
                      }}
                    >
                      Tháng này
                    </Button>
                  </div>
                </div>

                {boardError ? (
                  <Card><CardContent className="py-10 text-center text-sm text-destructive">Không thể tải bảng hoa hồng.</CardContent></Card>
                ) : boardLoading ? (
                  <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Đang tải bảng hoa hồng...</CardContent></Card>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Tổng hóa đơn</p><p className="mt-1 text-xl font-semibold text-slate-800">{boardData?.totals.invoiceCount ?? 0}</p></CardContent></Card>
                      <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Tổng doanh thu</p><p className="mt-1 text-xl font-semibold text-slate-800">{formatMoney(boardData?.totals.totalRevenue ?? 0)}đ</p></CardContent></Card>
                      <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Tổng hoa hồng</p><p className="mt-1 text-xl font-semibold text-orange-600">{formatMoney(boardData?.totals.totalCommission ?? 0)}đ</p></CardContent></Card>
                    </div>
                    <Card className="overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[820px] text-sm">
                          <thead className="bg-slate-50 text-left text-slate-600">
                            <tr>
                              <th className="px-4 py-3 font-medium">Cơ sở</th>
                              <th className="px-4 py-3 font-medium">Tên nhân sự</th>
                              <th className="px-4 py-3 text-right font-medium">Tổng hóa đơn</th>
                              <th className="px-4 py-3 text-right font-medium">Tổng doanh thu</th>
                              <th className="px-4 py-3 text-right font-medium">Hoa hồng</th>
                              <th className="px-4 py-3 text-right font-medium">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(boardData?.rows ?? []).map(row => (
                              <tr key={`${row.locationId ?? "unknown"}:${row.staffId}`} className="hover:bg-slate-50/70">
                                <td className="px-4 py-3">{row.locationName}</td>
                                <td className="px-4 py-3 font-medium text-slate-800">{row.staffName}</td>
                                <td className="px-4 py-3 text-right">{row.invoiceCount}</td>
                                <td className="px-4 py-3 text-right">{formatMoney(row.totalRevenue)}đ</td>
                                <td className="px-4 py-3 text-right font-semibold text-orange-600">{formatMoney(row.totalCommission)}đ</td>
                                <td className="px-4 py-3">
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="gap-1.5"
                                      onClick={() => setSelectedBoardRow(row)}
                                    >
                                      <Eye className="h-4 w-4" /> Chi tiết
                                    </Button>
                                    <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-emerald-600" disabled title="Chức năng chi hoa hồng sẽ được kết nối với phiếu chi">
                                      <Banknote className="h-4 w-4" /> Chi
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {(boardData?.rows ?? []).length === 0 && (
                          <div className="py-12 text-center text-sm text-muted-foreground">Chưa có dữ liệu hoa hồng trong khoảng thời gian này.</div>
                        )}
                      </div>
                    </Card>
                  </>
                )}
              </div>
            </TabsContent>
            <TabsContent value="commission-config" className="mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold">Cấu hình hoa hồng</h2>
                    <p className="text-sm text-muted-foreground">Thiết lập mức hoa hồng theo vai trò nhân sự được gán trên khách hàng.</p>
                  </div>
                  <Button onClick={openCreateDialog} className="gap-2">
                    <Plus className="h-4 w-4" /> Thêm mới
                  </Button>
                </div>

                {configsLoading ? (
                  <p className="text-sm text-muted-foreground">Đang tải cấu hình...</p>
                ) : configs.length === 0 ? (
                  <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Chưa có cấu hình hoa hồng.</CardContent></Card>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                    <table className="w-full min-w-[760px] table-fixed bg-white text-sm">
                      <colgroup>
                        <col className="w-[16%]" />
                        <col className="w-[18%]" />
                        <col className="w-[19%]" />
                        <col className="w-[37%]" />
                        <col className="w-[10%]" />
                      </colgroup>
                      <thead className="bg-slate-50 text-left">
                        <tr>
                          <th className="px-4 py-3 font-medium">Tên hoa hồng</th>
                          <th className="px-4 py-3 font-medium">Cơ sở</th>
                          <th className="px-4 py-3 font-medium">Thời gian áp dụng</th>
                          <th className="px-4 py-3 font-medium">Vai trò áp dụng</th>
                          <th className="w-24 px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {configs.map(config => (
                          <tr key={config.id} className="hover:bg-muted/20">
                            <td className="px-4 py-3 font-medium">{config.name}</td>
                            <td className="px-4 py-3">
                              <div>{config.locationNames?.join(", ") || "—"}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {(config.invoiceTypes ?? []).join(", ") || "Tất cả loại hóa đơn"} · {(config.invoiceStatuses ?? []).map(status => INVOICE_STATUS_OPTIONS.find(option => option.value === status)?.label ?? status).join(", ") || "Tất cả trạng thái"}
                              </div>
                            </td>
                            <td className="px-4 py-3">{config.effectiveFrom}{config.effectiveTo ? ` → ${config.effectiveTo}` : " → Không giới hạn"}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1.5">
                                 {(Object.keys(config.roleConfigs ?? {}) as RoleKey[]).map(role => {
                                  const configValue = config.roleConfigs?.[role];
                                   if (!configValue) return null;
                                  const applicationMode = configValue?.applicationMode === "first_invoice"
                                    ? "HĐ đầu tiên"
                                    : configValue?.applicationMode === "subsequent_invoices"
                                      ? "HĐ thứ 2+"
                                      : "Luôn";
                                   return <span key={role} className="rounded bg-muted px-2 py-1 text-xs">{getRoleLabel(role)}: {configValue.value}{configValue.mode === "amount" ? " VNĐ" : "%"} ({applicationMode})</span>;
                                })}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditDialog(config)} aria-label="Chỉnh sửa"><Pencil className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => { if (window.confirm("Bạn có chắc muốn xóa cấu hình này?")) deleteMutation.mutate(config.id); }} aria-label="Xóa"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
      <Dialog
        open={!!selectedBoardRow}
        onOpenChange={open => {
          if (!open) setSelectedBoardRow(null);
        }}
      >
        <DialogContent className="w-[98vw] max-w-[98vw] max-h-[88vh] overflow-hidden rounded-2xl border-slate-200 bg-slate-50 p-0">
          <DialogHeader className="border-b border-slate-200 bg-white px-6 py-4">
            <div className="flex items-start justify-between gap-4 pr-8">
              <DialogTitle>Chi tiết hoa hồng</DialogTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={downloadCommissionDetails}
                disabled={!selectedBoardRow || selectedBoardRow.details.length === 0}
              >
                <Download className="h-4 w-4" /> Tải xuống
              </Button>
            </div>
            {selectedBoardRow && (
              <p className="text-sm text-muted-foreground">
                {selectedBoardRow.locationName} · {selectedBoardRow.staffName} · {selectedBoardRow.details.length} lượt áp dụng · {formatMoney(selectedBoardRow.totalCommission)}đ
              </p>
            )}
          </DialogHeader>
          <div className="min-h-0 overflow-auto p-4">
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full min-w-[1050px] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Hóa đơn</th>
                    <th className="px-3 py-2 font-medium">Loại</th>
                    <th className="px-3 py-2 font-medium">Khách hàng</th>
                    <th className="px-3 py-2 font-medium">Ngày tính</th>
                    <th className="px-3 py-2 font-medium">Vai trò / cấu hình</th>
                    <th className="px-3 py-2 font-medium">Hóa đơn áp dụng</th>
                    <th className="px-3 py-2 text-right font-medium">Doanh thu</th>
                    <th className="px-3 py-2 text-right font-medium">Doanh thu HH</th>
                    <th className="px-3 py-2 text-right font-medium">Mức HH</th>
                    <th className="px-3 py-2 text-right font-medium">Hoa hồng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(selectedBoardRow?.details ?? []).map((detail, detailIndex) => (
                    <tr key={`${detail.invoiceId}:${detail.configName}:${detail.role}:${detailIndex}`} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2 font-medium">{detail.invoiceCode}</td>
                      <td className="px-3 py-2">{detail.invoiceType}</td>
                      <td className="px-3 py-2">{detail.customerName}</td>
                      <td className="whitespace-nowrap px-3 py-2">{detail.businessDate.split("-").reverse().join("/")}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{getRoleLabel(detail.role)}</div>
                        <div className="max-w-[190px] truncate text-xs text-muted-foreground" title={detail.configName}>{detail.configName}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{getApplicationModeLabel(detail.applicationMode)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(detail.revenue)}đ</td>
                      <td className="px-3 py-2 text-right">
                        <div>{formatMoney(detail.commissionableRevenue)}đ</div>
                        <div className="text-xs text-muted-foreground">({detail.invoicePercentage}%)</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {detail.rateMode === "percent" ? `${detail.rate}%` : `${formatMoney(detail.rate)}đ`}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-orange-600">{formatMoney(detail.commission)}đ</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(selectedBoardRow?.details ?? []).length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">Không có chi tiết hoa hồng.</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] max-w-[95vw] max-h-[90vh] overflow-hidden rounded-2xl border-slate-200 bg-slate-50 p-0 shadow-2xl">
          <DialogHeader className="border-b border-slate-200 bg-white px-6 py-5">
            <DialogTitle>{editingId ? "Chỉnh sửa cấu hình hoa hồng" : "Thêm cấu hình hoa hồng"}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[calc(90vh-145px)] overflow-y-auto px-6 py-5">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="grid content-start gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="commission-name">Tên hoa hồng <span className="text-destructive">*</span></Label>
                <Input id="commission-name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Ví dụ: Hoa hồng tuyển sinh khóa hè" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Cơ sở <span className="text-destructive">*</span></Label>
                <MultiSelect
                  options={locations.map(location => ({ label: location.name, value: location.id }))}
                  defaultValue={form.locationIds}
                  onValueChange={locationIds => setForm({ ...form, locationIds })}
                  placeholder="Chọn một hoặc nhiều cơ sở"
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commission-from">Áp dụng từ <span className="text-destructive">*</span></Label>
                <Input id="commission-from" type="date" value={form.effectiveFrom} onChange={event => setForm({ ...form, effectiveFrom: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commission-to">Đến ngày</Label>
                <Input id="commission-to" type="date" value={form.effectiveTo ?? ""} onChange={event => setForm({ ...form, effectiveTo: event.target.value || null })} />
              </div>
              <div className="space-y-2">
                <Label>Loại hóa đơn áp dụng <span className="text-destructive">*</span></Label>
                <MultiSelect
                   options={[
                     ...incomeCategories.map(category => ({ label: category.name, value: category.name })),
                     ...form.invoiceTypes
                       .filter(type => !incomeCategories.some(category => category.name === type))
                       .map(type => ({ label: type, value: type })),
                   ]}
                  defaultValue={form.invoiceTypes}
                  onValueChange={invoiceTypes => setForm({ ...form, invoiceTypes })}
                  placeholder="Chọn loại hóa đơn"
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label>Trạng thái hóa đơn <span className="text-destructive">*</span></Label>
                <MultiSelect
                  options={INVOICE_STATUS_OPTIONS}
                  defaultValue={form.invoiceStatuses}
                  onValueChange={invoiceStatuses => setForm({ ...form, invoiceStatuses })}
                  placeholder="Chọn trạng thái"
                  className="w-full"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="commission-description">Mô tả</Label>
                <textarea
                  id="commission-description"
                  value={form.description ?? ""}
                  onChange={event => setForm({ ...form, description: event.target.value })}
                  placeholder="Nhập mô tả cho cấu hình hoa hồng"
                  className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              </div>
              <div className="h-fit space-y-4 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/70 to-indigo-50/40 p-5">
                <div>
                  <h3 className="font-semibold text-slate-800">Vai trò áp dụng</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Chọn vai trò cần áp dụng hoa hồng. Sale, Phụ trách và Giáo viên lấy theo nhân sự được gán trên trang CRM.</p>
                </div>
                 {Object.keys(form.roleConfigs).map(roleKey => {
                 const role = roleKey as RoleKey;
                 const roleConfig = form.roleConfigs[role];
                 if (!roleConfig) return null;
                 return (
                    <div key={role} className="rounded-xl border border-white/80 bg-white/80 p-3 shadow-sm">
                      <div className="mb-2">
                        <Label>{getRoleLabel(role)}</Label>
                     </div>
                      <div className="grid items-center gap-3 sm:grid-cols-[minmax(110px,0.8fr)_minmax(220px,2fr)_56px_32px]">
                        <Input type="number" min="0" step="0.01" value={roleConfig.value} onChange={event => updateRole(role, "value", event.target.value)} placeholder="Mức hoa hồng" />
                        <Select value={roleConfig.applicationMode} onValueChange={value => updateRole(role, "applicationMode", value)}>
                          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="always">Luôn áp dụng</SelectItem>
                            <SelectItem value="first_invoice">Áp dụng hóa đơn đầu tiên</SelectItem>
                            <SelectItem value="subsequent_invoices">Áp dụng hóa đơn thứ 2 trở đi</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={roleConfig.mode} onValueChange={value => updateRole(role, "mode", value)}>
                          <SelectTrigger className="w-14 px-2" aria-label="Đơn vị hoa hồng"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percent" aria-label="Phần trăm">%</SelectItem>
                            <SelectItem value="amount" aria-label="Việt Nam đồng">₫</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 justify-self-end text-muted-foreground hover:text-destructive"
                          onClick={() => setForm(current => {
                            const { [role]: _removed, ...remaining } = current.roleConfigs;
                            return { ...current, roleConfigs: remaining };
                          })}
                          aria-label={`Xóa vai trò ${getRoleLabel(role)}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">{getRoleDescription(role)}</p>
                   </div>
                 );
               })}
                {Array.from({ length: pendingRoleRows }).map((_, index) => (
                 <div key={`pending-role-${index}`} className="grid items-center gap-3 rounded-xl border border-dashed border-blue-200 bg-white/60 p-3 sm:grid-cols-[1fr_130px_180px_140px_32px]">
                   <Select
                     value=""
                     onValueChange={value => {
                       setForm(current => ({
                         ...current,
                         roleConfigs: { ...current.roleConfigs, [value as RoleKey]: createRoleConfig() },
                       }));
                       setPendingRoleRows(current => current - 1);
                     }}
                   >
                     <SelectTrigger><SelectValue placeholder="Chọn vai trò" /></SelectTrigger>
                     <SelectContent>
                       {ROLE_OPTIONS.filter(option => !form.roleConfigs[option.value]).map(option => (
                         <SelectItem key={option.value} value={option.value}>
                           <span>{option.label}</span>
                           <span className="ml-2 text-xs text-muted-foreground">({option.description})</span>
                         </SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                   <div className="h-9 rounded-md border border-dashed border-muted-foreground/30" />
                   <div />
                   <div className="h-9 rounded-md border border-dashed border-muted-foreground/30" />
                   <div className="h-9 rounded-md border border-dashed border-muted-foreground/30" />
                 </div>
               ))}
                <div className="flex items-center gap-3">
                 <Button
                   type="button"
                   variant="outline"
                   className="gap-2"
                   disabled={Object.keys(form.roleConfigs).length + pendingRoleRows >= ROLE_OPTIONS.length}
                   onClick={() => setPendingRoleRows(current => current + 1)}
                 >
                   <Plus className="h-4 w-4" /> Thêm vai trò
                 </Button>
                 {Object.keys(form.roleConfigs).length === 0 && pendingRoleRows === 0 && (
                   <span className="text-xs text-muted-foreground">Chưa chọn vai trò nào</span>
                 )}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-slate-200 bg-white px-6 py-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
            <Button onClick={submitForm} disabled={saveMutation.isPending}>{saveMutation.isPending ? "Đang lưu..." : "Lưu cấu hình"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}