import { cn } from "@/lib/utils";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useLocations, useCreateLocation, useUpdateLocation, useDeleteLocation } from "@/hooks/use-locations";
import { useDepartments, useCreateDepartment, useUpdateDepartment, useDeleteDepartment, useCreateRole, useUpdateRole, useDeleteRole } from "@/hooks/use-departments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Building, ShieldCheck, Plus, Loader2, Edit2, Trash2, Users, QrCode, Image as ImageIcon, LayoutGrid, UserCog, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, Bot, Eye, EyeOff, CheckCircle2, XCircle, Trash, CreditCard, Plug, Power, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertLocationSchema, insertDepartmentSchema, insertRoleSchema } from "@shared/schema";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { navigation } from "@/lib/sidebar-navigation";
import { useSidebarVisibility } from "@/hooks/use-sidebar-visibility";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import type { MyPermissionsResult } from "@/hooks/use-my-permissions";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SETTINGS_HREF = "/settings";
type SettingsTabPerm = { canAdd: boolean; canEdit: boolean; canDelete: boolean };

function buildSettingsTabPerm(data: MyPermissionsResult | undefined, tabValue: string): SettingsTabPerm {
  if (!data || data.isSuperAdmin) return { canAdd: true, canEdit: true, canDelete: true };
  const perm = data.permissions[`${SETTINGS_HREF}#${tabValue}`];
  if (!perm) return { canAdd: false, canEdit: false, canDelete: false };
  return { canAdd: perm.canCreate, canEdit: perm.canEdit, canDelete: perm.canDelete };
}

function canViewSettingsTab(data: MyPermissionsResult | undefined, tabValue: string): boolean {
  if (!data || data.isSuperAdmin) return true;
  const perm = data.permissions[`${SETTINGS_HREF}#${tabValue}`];
  return !!(perm?.canView || perm?.canViewAll);
}

export function Settings() {
  const { data: locations, isLoading: locationsLoading } = useLocations();
  const createLocation = useCreateLocation();
  const updateLocation = useUpdateLocation();
  const deleteLocation = useDeleteLocation();

  const { data: departments, isLoading: deptsLoading } = useDepartments();
  const createDept = useCreateDepartment();
  const updateDept = useUpdateDepartment();
  const deleteDept = useDeleteDepartment();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  const { data: myPerms } = useMyPermissions();
  const locPerm = buildSettingsTabPerm(myPerms, "locations");
  const deptPerm = buildSettingsTabPerm(myPerms, "departments");
  const canViewLoc = canViewSettingsTab(myPerms, "locations");
  const canViewDept = canViewSettingsTab(myPerms, "departments");
  const canViewPermTab = canViewSettingsTab(myPerms, "permissions");
  const permTabRaw = !myPerms ? { canViewAll: true, canCreate: true, canEdit: true }
    : myPerms.isSuperAdmin ? { canViewAll: true, canCreate: true, canEdit: true }
    : {
        canViewAll: !!(myPerms.permissions[`${SETTINGS_HREF}#permissions`]?.canViewAll),
        canCreate: !!(myPerms.permissions[`${SETTINGS_HREF}#permissions`]?.canCreate),
        canEdit: !!(myPerms.permissions[`${SETTINGS_HREF}#permissions`]?.canEdit),
      };
  const defaultSettingsTab = canViewLoc ? "locations" : canViewDept ? "departments" : canViewPermTab ? "permissions" : myPerms?.isSuperAdmin ? "system" : "locations";
  const [settingsTab, setSettingsTab] = useState(defaultSettingsTab);
  const [systemTab, setSystemTab] = useState("modules");

  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);

  useEffect(() => {
    if (departments && departments.length > 0 && !selectedDeptId) {
      setSelectedDeptId(departments[0].id);
    }
  }, [departments, selectedDeptId]);

  const selectedDept = departments?.find(d => d.id === selectedDeptId);

  const { toast } = useToast();
  const [locDialogOpen, setLocDialogOpen] = useState(false);
  const [editingLoc, setEditingLoc] = useState<any>(null);
  const [bankPopupOpen, setBankPopupOpen] = useState(false);
  const [bankForm, setBankForm] = useState({ bankName: "", bankAccount: "", accountHolder: "" });
  const [editingBankIdx, setEditingBankIdx] = useState<number | null>(null);
  const [banks, setBanks] = useState<{ bankName: string; bankAccount: string; accountHolder: string }[]>([]);

  const [deptDialogOpen, setDeptDialogOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<any>(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);

  const hasMainLocation = locations?.some((loc) => loc.isMain);

  const locForm = useForm({
    resolver: zodResolver(insertLocationSchema),
    defaultValues: {
      name: "",
      code: "",
      address: "",
      phone: "",
      email: "",
      logoUrl: "",
      paymentQrUrl: "",
      bankName: "",
      bankAccount: "",
      accountHolder: "",
      useCenterBank: true,
      isMain: false,
      isActive: true,
    },
  });

  useEffect(() => {
    if (editingLoc) {
      locForm.reset({
        name: editingLoc.name,
        code: editingLoc.code,
        address: editingLoc.address || "",
        phone: editingLoc.phone || "",
        email: editingLoc.email || "",
        logoUrl: editingLoc.logoUrl || "",
        paymentQrUrl: editingLoc.paymentQrUrl || "",
        bankName: editingLoc.bankName || "",
        bankAccount: editingLoc.bankAccount || "",
        accountHolder: editingLoc.accountHolder || "",
        useCenterBank: editingLoc.useCenterBank !== false,
        isMain: editingLoc.isMain,
        isActive: editingLoc.isActive,
      });
      try {
        const parsed = editingLoc.bankAccounts ? JSON.parse(editingLoc.bankAccounts) : [];
        setBanks(Array.isArray(parsed) ? parsed : []);
      } catch {
        setBanks([]);
      }
    } else {
      locForm.reset({
        name: "",
        code: "",
        address: "",
        phone: "",
        email: "",
        logoUrl: "",
        paymentQrUrl: "",
        bankName: "",
        bankAccount: "",
        accountHolder: "",
        useCenterBank: true,
        isMain: false,
        isActive: true,
      });
      setBanks([]);
    }
  }, [editingLoc]);

  const onLocSubmit = async (data: any) => {
    try {
      const payload = { ...data, bankAccounts: JSON.stringify(banks) };
      if (editingLoc) {
        await updateLocation.mutateAsync({ id: editingLoc.id, data: payload });
        toast({ title: "Thành công", description: "Đã cập nhật cơ sở." });
      } else {
        await createLocation.mutateAsync(payload);
        toast({ title: "Thành công", description: "Đã thêm cơ sở mới." });
      }
      setLocDialogOpen(false);
      setEditingLoc(null);
      setBanks([]);
    } catch (error: any) {
      toast({ title: "Lỗi", description: error.message || "Thao tác thất bại.", variant: "destructive" });
    }
  };

  const handleDelLoc = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xoá cơ sở này?")) return;
    try {
      await deleteLocation.mutateAsync(id);
      toast({ title: "Thành công", description: "Đã xoá cơ sở." });
    } catch (error: any) {
      toast({ title: "Lỗi", description: error.message, variant: "destructive" });
    }
  };

  const deptForm = useForm({
    resolver: zodResolver(insertDepartmentSchema),
    defaultValues: { name: "", description: "" }
  });

  const onDeptSubmit = async (data: any) => {
    try {
      if (editingDept) {
        // We need an update mutation for departments, but let's check if it exists
        // Based on use-departments.ts (assuming it follows the pattern)
        // If not, I should check the hook.
        await updateDept.mutateAsync({ id: editingDept.id, data });
        toast({ title: "Thành công", description: "Đã cập nhật phòng ban." });
      } else {
        await createDept.mutateAsync(data);
        toast({ title: "Thành công", description: "Đã thêm phòng ban." });
      }
      setDeptDialogOpen(false);
      setEditingDept(null);
      deptForm.reset();
    } catch (error: any) {
      toast({ title: "Lỗi", description: error.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    if (editingDept) {
      deptForm.reset({ name: editingDept.name, description: editingDept.description || "" });
    } else {
      deptForm.reset({ name: "", description: "" });
    }
  }, [editingDept, deptForm]);

  const roleForm = useForm({
    resolver: zodResolver(insertRoleSchema),
    defaultValues: { name: "", description: "", departmentId: "" }
  });

  // Update roleForm departmentId when selectedDeptId changes
  useEffect(() => {
    if (selectedDeptId) {
      roleForm.setValue("departmentId", selectedDeptId);
    }
  }, [selectedDeptId, roleForm]);

  const onRoleSubmit = async (data: any) => {
    try {
      if (editingRole) {
        await updateRole.mutateAsync({ id: editingRole.id, data });
        toast({ title: "Thành công", description: "Đã cập nhật vai trò." });
      } else {
        await createRole.mutateAsync(data);
        toast({ title: "Thành công", description: "Đã thêm vai trò." });
      }
      setRoleDialogOpen(false);
      setEditingRole(null);
      roleForm.reset({ name: "", description: "", departmentId: selectedDeptId || "" });
    } catch (error: any) {
      toast({ title: "Lỗi", description: error.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    if (editingRole) {
      roleForm.reset({ 
        name: editingRole.name, 
        description: editingRole.description || "",
        departmentId: editingRole.departmentId
      });
    } else {
      roleForm.reset({ name: "", description: "", departmentId: selectedDeptId || "" });
    }
  }, [editingRole, roleForm, selectedDeptId]);

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-foreground font-display">Cấu hình hệ thống</h1>

        <Tabs value={settingsTab} onValueChange={setSettingsTab} className="w-full">
          <div className="flex flex-wrap gap-2 mb-4">
            {canViewLoc && <button onClick={() => setSettingsTab("locations")} className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all", settingsTab === "locations" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}>Cơ sở</button>}
            {canViewDept && <button onClick={() => setSettingsTab("departments")} className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all", settingsTab === "departments" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}>Phòng ban & Vai trò</button>}
            {myPerms?.isSuperAdmin && <button onClick={() => setSettingsTab("system")} className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all", settingsTab === "system" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}>Quản lý hệ thống</button>}
            {canViewPermTab && <button onClick={() => setSettingsTab("permissions")} className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all", settingsTab === "permissions" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}>Quản lý phân quyền</button>}
            {myPerms?.isSuperAdmin && <button onClick={() => setSettingsTab("ai-accounts")} className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-1", settingsTab === "ai-accounts" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}><Bot className="w-3 h-3" />Tài khoản AI</button>}
            {myPerms?.isSuperAdmin && <button onClick={() => setSettingsTab("providers")} className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all", settingsTab === "providers" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}>Kết nối nhà cung cấp</button>}
          </div>

          <TabsContent value="locations">
            {/* ... locations content ... */}
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Danh sách Cơ sở</h2>
              <Dialog open={locDialogOpen} onOpenChange={(val) => { setLocDialogOpen(val); if(!val) setEditingLoc(null); }}>
                {locPerm.canAdd && (
                  <DialogTrigger asChild>
                    <Button data-testid="button-add-location">
                      <Plus className="w-4 h-4 mr-2" />
                      Thêm cơ sở
                    </Button>
                  </DialogTrigger>
                )}
                <DialogContent className="w-[95vw] max-w-[95vw] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingLoc ? "Sửa cơ sở" : "Thêm cơ sở mới"}</DialogTitle>
                    <DialogDescription>Nhập thông tin chi tiết cho cơ sở.</DialogDescription>
                  </DialogHeader>

                  <Form {...locForm}>
                    <form onSubmit={locForm.handleSubmit(onLocSubmit)}>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                        {/* ===== LEFT: Basic Info ===== */}
                        <div className="space-y-4">
                          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide border-b pb-2">Thông tin cơ bản</h3>
                          <div className="grid grid-cols-2 gap-4">
                            <FormField control={locForm.control} name="name" render={({ field }) => (
                              <FormItem><FormLabel>Tên cơ sở *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={locForm.control} name="code" render={({ field }) => (
                              <FormItem><FormLabel>Mã cơ sở *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <FormField control={locForm.control} name="phone" render={({ field }) => (
                              <FormItem><FormLabel>Số điện thoại</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={locForm.control} name="email" render={({ field }) => (
                              <FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                            )} />
                          </div>
                          <FormField control={locForm.control} name="address" render={({ field }) => (
                            <FormItem><FormLabel>Địa chỉ</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <div className="grid grid-cols-2 gap-4">
                            <FormField control={locForm.control} name="paymentQrUrl" render={({ field }) => (
                              <FormItem>
                                <FormLabel className="flex items-center gap-1"><QrCode className="w-4 h-4" /> Link QR Thanh toán</FormLabel>
                                <FormControl><Input placeholder="https://..." {...field} value={field.value || ""} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                            {locForm.watch("isMain") && (
                              <FormField control={locForm.control} name="logoUrl" render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="flex items-center gap-1"><ImageIcon className="w-4 h-4" /> Link Logo trung tâm</FormLabel>
                                  <FormControl><Input placeholder="https://..." {...field} value={field.value || ""} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )} />
                            )}
                          </div>
                          <FormField control={locForm.control} name="isMain" render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                              <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={hasMainLocation && !field.value && !editingLoc?.isMain} /></FormControl>
                              <div className="space-y-1 leading-none"><FormLabel>Cơ sở chính</FormLabel><p className="text-sm text-muted-foreground">Chỉ được phép có một cơ sở chính duy nhất.</p></div>
                            </FormItem>
                          )} />
                        </div>

                        {/* ===== RIGHT: Bank Info ===== */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between border-b pb-2">
                            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Thông tin ngân hàng</h3>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1.5"
                              data-testid="button-open-bank-popup"
                              onClick={() => {
                                setBankForm({ bankName: "", bankAccount: "", accountHolder: "" });
                                setEditingBankIdx(null);
                                setBankPopupOpen(true);
                              }}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Thêm mới ngân hàng
                            </Button>
                          </div>

                          {/* Bank cards list */}
                          {banks.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm border-2 border-dashed rounded-lg gap-2">
                              <Building className="w-8 h-8 opacity-30" />
                              <p>Chưa có thông tin ngân hàng</p>
                              <p className="text-xs opacity-70">Nhấn "Thêm mới ngân hàng" để cấu hình</p>
                            </div>
                          ) : (
                            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                              {banks.map((bank, idx) => (
                                <div key={idx} className="bg-muted/30 rounded-lg p-3 border flex items-start justify-between gap-2 group" data-testid={`card-bank-${idx}`}>
                                  <div className="space-y-0.5 text-sm flex-1 min-w-0">
                                    <div className="flex gap-2">
                                      <span className="text-muted-foreground w-[90px] shrink-0">Ngân hàng:</span>
                                      <span className="font-semibold truncate">{bank.bankName || "—"}</span>
                                    </div>
                                    <div className="flex gap-2">
                                      <span className="text-muted-foreground w-[90px] shrink-0">Số tài khoản:</span>
                                      <span className="font-mono font-medium truncate">{bank.bankAccount || "—"}</span>
                                    </div>
                                    <div className="flex gap-2">
                                      <span className="text-muted-foreground w-[90px] shrink-0">Chủ tài khoản:</span>
                                      <span className="font-medium uppercase truncate">{bank.accountHolder || "—"}</span>
                                    </div>
                                  </div>
                                  <div className="flex gap-1 shrink-0">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 hover:text-primary"
                                      data-testid={`button-edit-bank-${idx}`}
                                      onClick={() => {
                                        setBankForm({ bankName: bank.bankName, bankAccount: bank.bankAccount, accountHolder: bank.accountHolder });
                                        setEditingBankIdx(idx);
                                        setBankPopupOpen(true);
                                      }}
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 hover:text-destructive"
                                      data-testid={`button-delete-bank-${idx}`}
                                      onClick={() => setBanks(prev => prev.filter((_, i) => i !== idx))}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-6 flex justify-end">
                        <Button type="submit" size="sm" className="px-8" disabled={createLocation.isPending || updateLocation.isPending} data-testid="button-submit-location">
                          {(createLocation.isPending || updateLocation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          {editingLoc ? "Cập nhật" : "Lưu cơ sở"}
                        </Button>
                      </div>
                    </form>
                  </Form>

                  {/* Bank Info Popup */}
                  <Dialog open={bankPopupOpen} onOpenChange={setBankPopupOpen}>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <Building className="w-4 h-4 text-primary" />
                          {editingBankIdx !== null ? "Chỉnh sửa ngân hàng" : "Thêm mới ngân hàng"}
                        </DialogTitle>
                        <DialogDescription>Nhập thông tin tài khoản ngân hàng.</DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4 py-2">
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Ngân hàng</label>
                          <input
                            list="bank-list-options-popup"
                            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                            placeholder="Nhập hoặc chọn ngân hàng..."
                            value={bankForm.bankName}
                            onChange={e => setBankForm(f => ({ ...f, bankName: e.target.value }))}
                            data-testid="popup-input-bank-name"
                          />
                          <datalist id="bank-list-options-popup">
                            <option value="MB Bank" />
                            <option value="Vietcombank" />
                            <option value="ACB" />
                            <option value="Techcombank" />
                            <option value="BIDV" />
                            <option value="VPBank" />
                            <option value="TPBank" />
                            <option value="Sacombank" />
                            <option value="VietinBank" />
                            <option value="Agribank" />
                          </datalist>
                          <p className="text-xs text-muted-foreground mt-1">Có thể nhập tự do nếu không có trong danh sách</p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-1.5">Số tài khoản</label>
                          <input
                            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                            placeholder="Nhập số tài khoản..."
                            value={bankForm.bankAccount}
                            onChange={e => setBankForm(f => ({ ...f, bankAccount: e.target.value }))}
                            data-testid="popup-input-bank-account"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-1.5">Chủ tài khoản</label>
                          <input
                            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                            placeholder="Nhập tên chủ tài khoản..."
                            value={bankForm.accountHolder}
                            onChange={e => setBankForm(f => ({ ...f, accountHolder: e.target.value }))}
                            data-testid="popup-input-account-holder"
                          />
                        </div>

                        {/* Preview */}
                        {(bankForm.bankName || bankForm.bankAccount || bankForm.accountHolder) && (
                          <div className="bg-muted/40 rounded-lg p-3 border space-y-1 text-sm">
                            <p className="text-xs text-muted-foreground font-medium uppercase mb-1.5">Xem trước</p>
                            <div className="flex gap-2"><span className="text-muted-foreground min-w-[110px]">Ngân hàng:</span><span className="font-medium">{bankForm.bankName || "—"}</span></div>
                            <div className="flex gap-2"><span className="text-muted-foreground min-w-[110px]">Số tài khoản:</span><span className="font-mono font-medium">{bankForm.bankAccount || "—"}</span></div>
                            <div className="flex gap-2"><span className="text-muted-foreground min-w-[110px]">Chủ tài khoản:</span><span className="font-medium uppercase">{bankForm.accountHolder || "—"}</span></div>
                          </div>
                        )}

                        <div className="flex justify-end gap-2 pt-2">
                          <Button variant="outline" size="sm" onClick={() => setBankPopupOpen(false)}>Huỷ</Button>
                          <Button
                            size="sm"
                            data-testid="popup-button-save-bank"
                            onClick={() => {
                              if (!bankForm.bankName) return;
                              if (editingBankIdx !== null) {
                                setBanks(prev => prev.map((b, i) => i === editingBankIdx ? { ...bankForm } : b));
                              } else {
                                setBanks(prev => [...prev, { ...bankForm }]);
                              }
                              setBankPopupOpen(false);
                              setEditingBankIdx(null);
                            }}
                          >
                            {editingBankIdx !== null ? "Lưu thay đổi" : "Thêm ngân hàng"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-4">
              {locationsLoading ? <div className="text-center py-8">Đang tải...</div> : locations?.map((loc) => (
                <Card key={loc.id} className="hover-elevate">
                  <CardContent className="flex items-center justify-between p-6">
                    <div className="flex gap-4 items-start">
                      <div className="bg-primary/10 p-3 rounded-full"><Building className="w-6 h-6 text-primary" /></div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="font-bold text-lg">{loc.name}</h3>
                          {loc.isMain && <Badge>Cơ sở chính</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">{loc.address}</p>
                        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                          {loc.phone && <span>Tel: {loc.phone}</span>}
                          {loc.email && <span>Email: {loc.email}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {locPerm.canEdit && <Button variant="outline" size="icon" onClick={() => { setEditingLoc(loc); setLocDialogOpen(true); }}><Edit2 className="w-4 h-4" /></Button>}
                      {locPerm.canDelete && <Button variant="outline" size="icon" className="text-destructive" onClick={() => handleDelLoc(loc.id)}><Trash2 className="w-4 h-4" /></Button>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="departments">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Left Column: Departments */}
              <div className="md:col-span-5 space-y-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between py-4">
                    <CardTitle className="text-lg font-semibold">Danh sách Phòng ban</CardTitle>
                    <Dialog open={deptDialogOpen} onOpenChange={(val) => { setDeptDialogOpen(val); if(!val) setEditingDept(null); }}>
                      {deptPerm.canAdd && (
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Plus className="w-4 h-4 mr-1" />
                            Thêm
                          </Button>
                        </DialogTrigger>
                      )}
                      <DialogContent>
                        <DialogHeader><DialogTitle>{editingDept ? "Sửa phòng ban" : "Thêm phòng ban mới"}</DialogTitle></DialogHeader>
                        <Form {...deptForm}>
                          <form onSubmit={deptForm.handleSubmit(onDeptSubmit)} className="space-y-4">
                            <FormField control={deptForm.control} name="name" render={({ field }) => (
                              <FormItem><FormLabel>Tên phòng ban *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <Button type="submit" className="w-full">{editingDept ? "Cập nhật" : "Lưu phòng ban"}</Button>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {deptsLoading ? (
                        <div className="p-4 text-center text-muted-foreground">Đang tải...</div>
                      ) : (
                        departments?.map((dept) => (
                          <div
                            key={dept.id}
                            className={`group flex items-center justify-between p-4 cursor-pointer transition-colors hover:bg-muted/50 ${selectedDeptId === dept.id ? 'bg-primary/5 border-r-2 border-primary' : ''}`}
                            onClick={() => setSelectedDeptId(dept.id)}
                          >
                            <div className="flex items-center gap-3">
                              <Users className={`w-5 h-5 ${selectedDeptId === dept.id ? 'text-primary' : 'text-muted-foreground'}`} />
                              <span className={`font-medium ${selectedDeptId === dept.id ? 'text-primary' : 'text-foreground'}`}>
                                {dept.name}
                              </span>
                              {dept.isSystem && <Badge variant="secondary" className="text-[10px] h-4 px-1">Mặc định</Badge>}
                            </div>
                            <div className="flex items-center gap-1">
                              {!dept.isSystem ? (
                                <>
                                  {deptPerm.canEdit && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingDept(dept);
                                        setDeptDialogOpen(true);
                                      }}
                                      data-testid={`button-edit-dept-${dept.id}`}
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </Button>
                                  )}
                                  {deptPerm.canDelete && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm("Xoá phòng ban này sẽ xoá tất cả vai trò liên quan?")) {
                                          deleteDept.mutate(dept.id);
                                          if (selectedDeptId === dept.id) setSelectedDeptId(null);
                                        }
                                      }}
                                      data-testid={`button-delete-dept-${dept.id}`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  )}
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground/50 px-2">🔒</span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: Roles */}
              <div className="md:col-span-7 space-y-4">
                {selectedDept ? (
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between py-4">
                      <div>
                        <CardTitle className="text-lg font-semibold">Vai trò: {selectedDept.name}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">Quản lý các chức danh trong phòng ban này</p>
                      </div>
                      <Dialog open={roleDialogOpen} onOpenChange={(val) => { setRoleDialogOpen(val); if(!val) setEditingRole(null); }}>
                        {deptPerm.canAdd && (
                          <DialogTrigger asChild>
                            <Button size="sm">
                              <Plus className="w-4 h-4 mr-1" />
                              Thêm vai trò
                            </Button>
                          </DialogTrigger>
                        )}
                        <DialogContent>
                          <DialogHeader><DialogTitle>{editingRole ? "Sửa vai trò" : `Thêm vai trò mới vào ${selectedDept.name}`}</DialogTitle></DialogHeader>
                          <Form {...roleForm}>
                            <form onSubmit={roleForm.handleSubmit(onRoleSubmit)} className="space-y-4">
                              <FormField control={roleForm.control} name="name" render={({ field }) => (
                                <FormItem><FormLabel>Tên vai trò *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <Button type="submit" className="w-full">{editingRole ? "Cập nhật" : "Lưu vai trò"}</Button>
                            </form>
                          </Form>
                        </DialogContent>
                      </Dialog>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {selectedDept.roles.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                            Chưa có vai trò nào được tạo.
                          </div>
                        ) : (
                          selectedDept.roles.map(role => (
                            <div key={role.id} className="group flex items-center justify-between p-3 bg-muted/30 rounded-lg border hover:border-primary/50 transition-colors">
                              <div className="flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                                <span>{role.name}</span>
                                {role.isSystem && <Badge variant="secondary" className="text-[10px] h-4 px-1">Mặc định</Badge>}
                              </div>
                              <div className="flex items-center gap-1">
                                {!role.isSystem ? (
                                  <>
                                    {deptPerm.canEdit && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => {
                                          setEditingRole(role);
                                          setRoleDialogOpen(true);
                                        }}
                                        data-testid={`button-edit-role-${role.id}`}
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </Button>
                                    )}
                                    {deptPerm.canDelete && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => {
                                          if (confirm("Bạn có chắc muốn xoá vai trò này?")) {
                                            deleteRole.mutate(role.id);
                                          }
                                        }}
                                        data-testid={`button-delete-role-${role.id}`}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-xs text-muted-foreground/50 px-2">🔒</span>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center p-12 text-muted-foreground bg-muted/20 border-2 border-dashed rounded-xl">
                    <Users className="w-12 h-12 mb-4 opacity-20" />
                    <p>Chọn một phòng ban để xem và quản lý vai trò</p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="system">
            <Tabs value={systemTab} onValueChange={setSystemTab} className="w-full">
              <div className="flex flex-wrap gap-2 mb-4">
                <button onClick={() => setSystemTab("modules")} className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-1.5", systemTab === "modules" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}>
                  <LayoutGrid className="w-3.5 h-3.5" />Quản lý module
                </button>
                <button onClick={() => setSystemTab("hrm-accounts")} className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-1.5", systemTab === "hrm-accounts" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}>
                  <UserCog className="w-3.5 h-3.5" />Quản lý số lượng tài khoản HRM
                </button>
              </div>

              <TabsContent value="modules">
                <ModulesManager />
              </TabsContent>

              <TabsContent value="hrm-accounts">
                <HrmAccountsManager />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="permissions">
            <PermissionsManager
              canViewAll={permTabRaw.canViewAll}
              canCreate={permTabRaw.canCreate}
              canEdit={permTabRaw.canEdit}
            />
          </TabsContent>

          <TabsContent value="ai-accounts">
            <AIAccountsManager />
          </TabsContent>

          <TabsContent value="providers">
            <ProvidersSection />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function ModulesManager() {
  const { isModuleVisible, isItemVisible, isSubTabVisible, toggleModule, toggleItem, toggleSubTab } = useSidebarVisibility();
  const [expandedModules, setExpandedModules] = useState<string[]>(() =>
    navigation.filter(e => "module" in e).map(e => (e as any).module)
  );
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const toggleExpandModule = (moduleName: string) => {
    setExpandedModules(prev =>
      prev.includes(moduleName) ? prev.filter(m => m !== moduleName) : [...prev, moduleName]
    );
  };

  const toggleExpandItem = (href: string) => {
    setExpandedItems(prev =>
      prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href]
    );
  };

  const modules = navigation.filter((e): e is Extract<typeof navigation[number], { module: string }> => "module" in e);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-4">
        Bật/tắt các module, mục con và tab trong menu điều hướng. Ẩn module lớn sẽ ẩn toàn bộ bên trong.
      </p>
      {modules.map(mod => {
        const modVisible = isModuleVisible(mod.module);
        const isExpanded = expandedModules.includes(mod.module);

        return (
          <Card key={mod.module} className={cn("transition-all", !modVisible && "opacity-60")}>
            <CardContent className="p-0">
              {/* Module header row */}
              <div className="flex items-center justify-between px-5 py-4">
                <button
                  className="flex items-center gap-3 flex-1 text-left"
                  onClick={() => toggleExpandModule(mod.module)}
                >
                  <div className={cn("p-2 rounded-lg", modVisible ? "bg-primary/10" : "bg-muted")}>
                    <mod.icon className={cn("w-5 h-5", modVisible ? "text-primary" : "text-muted-foreground")} />
                  </div>
                  <span className={cn("font-semibold text-sm uppercase tracking-wider", mod.color, !modVisible && "opacity-50")}>
                    {mod.module}
                  </span>
                  <span className="text-xs text-muted-foreground ml-1">({mod.items.length} mục)</span>
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-muted-foreground ml-1" />
                    : <ChevronRight className="w-4 h-4 text-muted-foreground ml-1" />
                  }
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => toggleModule(mod.module)}
                  data-testid={`button-toggle-module-${mod.module}`}
                  title={modVisible ? "Ẩn module" : "Hiện module"}
                >
                  {modVisible
                    ? <ToggleRight className="w-7 h-7 text-primary" />
                    : <ToggleLeft className="w-7 h-7 text-muted-foreground" />
                  }
                </Button>
              </div>

              {/* Items list */}
              {isExpanded && (
                <div className="border-t divide-y mx-0">
                  {mod.items.map(item => {
                    const itemVisible = isItemVisible(item.href, mod.module);
                    const disabledByParent = !modVisible;
                    const hasSubTabs = item.subTabs && item.subTabs.length > 0;
                    const itemExpanded = expandedItems.includes(item.href);

                    return (
                      <div key={item.href}>
                        {/* Item row */}
                        <div
                          className={cn(
                            "flex items-center justify-between px-5 py-3 bg-muted/20 transition-all",
                            (!itemVisible || disabledByParent) && "opacity-50"
                          )}
                        >
                          <div className="flex items-center gap-3 pl-8 flex-1">
                            {hasSubTabs ? (
                              <button
                                className="flex items-center gap-2 flex-1 text-left"
                                onClick={() => toggleExpandItem(item.href)}
                              >
                                <item.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                                <span className="text-sm text-foreground">{item.name}</span>
                                <span className="text-xs text-muted-foreground ml-1">({item.subTabs!.length} tab)</span>
                                {itemExpanded
                                  ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                  : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                }
                              </button>
                            ) : (
                              <div className="flex items-center gap-2 flex-1">
                                <item.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                                <span className="text-sm text-foreground">{item.name}</span>
                              </div>
                            )}
                            {disabledByParent && (
                              <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">Ẩn theo module</Badge>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => !disabledByParent && toggleItem(item.href)}
                            disabled={disabledByParent}
                            data-testid={`button-toggle-item-${item.href.replace(/\//g, "-")}`}
                            title={itemVisible ? "Ẩn mục này" : "Hiện mục này"}
                          >
                            {itemVisible
                              ? <ToggleRight className={cn("w-6 h-6", disabledByParent ? "text-muted-foreground" : "text-primary")} />
                              : <ToggleLeft className="w-6 h-6 text-muted-foreground" />
                            }
                          </Button>
                        </div>

                        {/* Sub-tabs list */}
                        {hasSubTabs && itemExpanded && (
                          <div className="divide-y border-t bg-muted/10">
                            {item.subTabs!.map(sub => {
                              const subVisible = isSubTabVisible(item.href, sub.value, mod.module);
                              const subDisabled = disabledByParent || !itemVisible;

                              return (
                                <div
                                  key={sub.value}
                                  className={cn(
                                    "flex items-center justify-between px-5 py-2.5 transition-all",
                                    (!subVisible || subDisabled) && "opacity-50"
                                  )}
                                >
                                  <div className="flex items-center gap-2 pl-16">
                                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                                    <span className="text-sm text-muted-foreground">{sub.name}</span>
                                    {subDisabled && (
                                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">Ẩn theo mục cha</Badge>
                                    )}
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0"
                                    onClick={() => !subDisabled && toggleSubTab(item.href, sub.value)}
                                    disabled={subDisabled}
                                    data-testid={`button-toggle-subtab-${item.href.replace(/\//g, "-")}-${sub.value}`}
                                    title={subVisible ? "Ẩn tab này" : "Hiện tab này"}
                                  >
                                    {subVisible
                                      ? <ToggleRight className={cn("w-5 h-5", subDisabled ? "text-muted-foreground" : "text-primary")} />
                                      : <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                                    }
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function HrmAccountsManager() {
  const { toast } = useToast();
  const [limitInput, setLimitInput] = useState<string>("");

  const { data, isLoading } = useQuery<{ limit: number; activeStaffCount: number }>({
    queryKey: ["/api/system-settings/staff-limit"],
  });

  useEffect(() => {
    if (data) {
      setLimitInput(String(data.limit));
    }
  }, [data]);

  const updateLimit = useMutation({
    mutationFn: async (limit: number) => {
      await apiRequest("PUT", "/api/system-settings/staff-limit", { limit });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-settings/staff-limit"] });
      toast({ title: "Thành công", description: "Đã cập nhật giới hạn tài khoản nhân sự." });
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message || "Không thể cập nhật giới hạn.", variant: "destructive" });
    },
  });

  const handleUpdate = () => {
    const val = parseInt(limitInput, 10);
    if (isNaN(val) || val < 1) {
      toast({ title: "Lỗi", description: "Số lượng phải là số nguyên dương.", variant: "destructive" });
      return;
    }
    updateLimit.mutate(val);
  };

  const activeCount = data?.activeStaffCount ?? 0;
  const limit = data?.limit ?? 10;
  const percentage = Math.min(100, Math.round((activeCount / limit) * 100));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="font-semibold text-base mb-1">Giới hạn tài khoản nhân sự</h3>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Đang tải...</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Số lượng tài khoản nhân sự hiện tại:{" "}
                  <span className="font-semibold text-primary" data-testid="text-active-staff-count">{activeCount}</span>
                  {" / "}
                  <span className="font-semibold" data-testid="text-staff-limit">{limit}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Input
                className="w-24 text-center"
                type="number"
                min={1}
                value={limitInput}
                onChange={e => setLimitInput(e.target.value)}
                data-testid="input-staff-limit"
              />
              <Button
                onClick={handleUpdate}
                disabled={updateLimit.isPending}
                data-testid="button-update-staff-limit"
              >
                {updateLimit.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Cập nhật giới hạn
              </Button>
            </div>
          </div>
          <Progress value={percentage} className="h-2" data-testid="progress-staff-limit" />
          <p className="text-xs text-muted-foreground italic">
            * Tài khoản nhân sự bao gồm tất cả các vai trò ngoại trừ &quot;Học viên&quot; và &quot;Phụ huynh&quot;.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

const PERM_COLS = [
  { key: "canView", label: "Xem" },
  { key: "canViewAll", label: "Xem all" },
  { key: "canCreate", label: "Thêm" },
  { key: "canEdit", label: "Sửa" },
  { key: "canDelete", label: "Xoá" },
] as const;

type PermKey = typeof PERM_COLS[number]["key"];

type PermMap = Record<string, {
  canView: boolean;
  canViewAll: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}>;

function defaultPerm() {
  return { canView: false, canViewAll: false, canCreate: false, canEdit: false, canDelete: false };
}

const READ_ONLY_RESOURCES = new Set(["/learning-overview"]);
const NO_EDIT_DELETE_RESOURCES = new Set(["/attendance"]);
const NO_DELETE_RESOURCES = new Set([`${SETTINGS_HREF}#permissions`]);

type PermissionsManagerProps = {
  canViewAll: boolean;
  canCreate: boolean;
  canEdit: boolean;
};

function PermissionsManager({ canViewAll, canCreate, canEdit }: PermissionsManagerProps) {
  const { toast } = useToast();
  const { data: departments } = useDepartments();
  const { data: myPerms } = useMyPermissions();

  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<string[]>([]);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [localPerms, setLocalPerms] = useState<PermMap>({});

  const displayedDepts = canViewAll
    ? departments
    : departments?.filter(d => myPerms?.departmentNames?.includes(d.name));

  useEffect(() => {
    if (displayedDepts && displayedDepts.length > 0 && !selectedDeptId) {
      const first = displayedDepts[0];
      setSelectedDeptId(first.id);
      if (first.roles && first.roles.length > 0) {
        setSelectedRoleId(first.roles[0].id);
      }
    }
  }, [displayedDepts, selectedDeptId]);

  const selectedDept = displayedDepts?.find(d => d.id === selectedDeptId);
  const roles = selectedDept?.roles ?? [];

  const { data: fetchedPerms, isLoading: permsLoading } = useQuery<{ roleId: string; resource: string; canView: boolean; canViewAll: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }[]>({
    queryKey: ["/api/role-permissions", selectedRoleId],
    enabled: !!selectedRoleId,
    queryFn: async () => {
      const res = await fetch(`/api/role-permissions?roleId=${selectedRoleId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch permissions");
      return res.json();
    },
  });

  useEffect(() => {
    if (fetchedPerms) {
      const map: PermMap = {};
      fetchedPerms.forEach(p => {
        map[p.resource] = { canView: p.canView, canViewAll: p.canViewAll, canCreate: p.canCreate, canEdit: p.canEdit, canDelete: p.canDelete };
      });
      setLocalPerms(map);
    } else {
      setLocalPerms({});
    }
  }, [fetchedPerms, selectedRoleId]);

  const savePerm = useMutation({
    mutationFn: async ({ resource, perms }: { resource: string; perms: PermMap[string] }) => {
      const res = await fetch("/api/role-permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ roleId: selectedRoleId, resource, ...perms }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/role-permissions", selectedRoleId] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-permissions"] });
    },
    onError: () => {
      toast({ title: "Lỗi", description: "Không thể lưu quyền.", variant: "destructive" });
    },
  });

  const handleToggle = (resource: string, permKey: PermKey) => {
    if (!selectedRoleId) return;
    const current = localPerms[resource] ?? defaultPerm();
    const toggling = !current[permKey];
    if (toggling && !canCreate) {
      toast({ title: "Không có quyền", description: "Bạn không có quyền cấp thêm quyền.", variant: "destructive" });
      return;
    }
    if (!toggling && !canEdit) {
      toast({ title: "Không có quyền", description: "Bạn không có quyền thu hồi quyền.", variant: "destructive" });
      return;
    }
    if (READ_ONLY_RESOURCES.has(resource) && (permKey === "canCreate" || permKey === "canEdit" || permKey === "canDelete")) {
      toast({ title: "Trang chỉ đọc", description: "Trang này chỉ hỗ trợ quyền Xem và Xem all.", variant: "destructive" });
      return;
    }
    if (NO_EDIT_DELETE_RESOURCES.has(resource) && (permKey === "canEdit" || permKey === "canDelete")) {
      toast({ title: "Không khả dụng", description: "Trang này không hỗ trợ quyền Sửa và Xoá.", variant: "destructive" });
      return;
    }
    let updated = { ...current, [permKey]: toggling };

    if (toggling) {
      if (permKey === "canDelete") {
        if (!updated.canView && !updated.canViewAll) {
          toast({ title: "Yêu cầu quyền Xem", description: "Phải tích ít nhất một trong hai quyền Xem hoặc Xem all trước khi bật quyền Xoá.", variant: "destructive" });
          return;
        }
        updated.canCreate = true;
        updated.canEdit = true;
      } else if (permKey === "canEdit") {
        if (!updated.canView && !updated.canViewAll) {
          toast({ title: "Yêu cầu quyền Xem", description: "Phải tích ít nhất một trong hai quyền Xem hoặc Xem all trước khi bật quyền Sửa.", variant: "destructive" });
          return;
        }
        updated.canCreate = true;
      } else if (permKey === "canCreate") {
        if (!updated.canView && !updated.canViewAll) {
          toast({ title: "Yêu cầu quyền Xem", description: "Phải tích ít nhất một trong hai quyền Xem hoặc Xem all trước khi bật quyền Thêm.", variant: "destructive" });
          return;
        }
      }
    } else {
      if (permKey === "canView" || permKey === "canViewAll") {
        const willHaveView = permKey === "canView" ? updated.canViewAll : updated.canView;
        if (!willHaveView) {
          updated.canCreate = false;
          updated.canEdit = false;
          updated.canDelete = false;
        }
      } else if (permKey === "canCreate") {
        updated.canEdit = false;
        updated.canDelete = false;
      } else if (permKey === "canEdit") {
        updated.canDelete = false;
      }
    }

    setLocalPerms(prev => ({ ...prev, [resource]: updated }));
    savePerm.mutate({ resource, perms: updated });
  };

  const getResourcePerm = (resource: string): PermMap[string] => localPerms[resource] ?? defaultPerm();

  const modules = navigation.filter((e): e is Extract<typeof navigation[number], { module: string }> => "module" in e);

  const getAllowedKeysForResource = (resource: string, hasSubTabs: boolean): PermKey[] => {
    if (hasSubTabs) return [];
    return PERM_COLS.map(c => c.key).filter(k => {
      if (READ_ONLY_RESOURCES.has(resource) && (k === "canCreate" || k === "canEdit" || k === "canDelete")) return false;
      if (NO_EDIT_DELETE_RESOURCES.has(resource) && (k === "canEdit" || k === "canDelete")) return false;
      if (NO_DELETE_RESOURCES.has(resource) && k === "canDelete") return false;
      return true;
    });
  };

  const getAllowedKeysForSubResource = (resource: string): PermKey[] => {
    return PERM_COLS.map(c => c.key).filter(k => {
      if (NO_DELETE_RESOURCES.has(resource) && k === "canDelete") return false;
      return true;
    });
  };

  const getModuleResources = (mod: typeof modules[number]): { resource: string; allowedKeys: PermKey[] }[] => {
    const list: { resource: string; allowedKeys: PermKey[] }[] = [];
    for (const item of mod.items) {
      const hasSubTabs = !!(item.subTabs && item.subTabs.length > 0);
      if (hasSubTabs) {
        for (const sub of item.subTabs!) {
          const subResource = `${item.href}#${sub.value}`;
          list.push({ resource: subResource, allowedKeys: getAllowedKeysForSubResource(subResource) });
        }
      } else {
        list.push({ resource: item.href, allowedKeys: getAllowedKeysForResource(item.href, false) });
      }
    }
    return list;
  };

  const isModuleAllChecked = (mod: typeof modules[number]): boolean => {
    const resources = getModuleResources(mod);
    if (resources.length === 0) return false;
    return resources.every(({ resource, allowedKeys }) => {
      if (allowedKeys.length === 0) return true;
      const perm = getResourcePerm(resource);
      return allowedKeys.every(k => perm[k]);
    });
  };

  const handleToggleModuleAll = (mod: typeof modules[number]) => {
    if (!selectedRoleId) return;
    const allChecked = isModuleAllChecked(mod);
    const value = !allChecked;
    if (value && !canCreate) {
      toast({ title: "Không có quyền", description: "Bạn không có quyền cấp thêm quyền.", variant: "destructive" });
      return;
    }
    if (!value && !canEdit) {
      toast({ title: "Không có quyền", description: "Bạn không có quyền thu hồi quyền.", variant: "destructive" });
      return;
    }
    const resources = getModuleResources(mod);
    const updates: PermMap = {};
    for (const { resource, allowedKeys } of resources) {
      const current = localPerms[resource] ?? defaultPerm();
      const updated = { ...current };
      for (const col of PERM_COLS) {
        updated[col.key] = value && allowedKeys.includes(col.key);
      }
      updates[resource] = updated;
    }
    setLocalPerms(prev => ({ ...prev, ...updates }));
    for (const [resource, perms] of Object.entries(updates)) {
      savePerm.mutate({ resource, perms });
    }
  };

  const handleSelectDept = (deptId: string) => {
    setSelectedDeptId(deptId);
    const dept = displayedDepts?.find(d => d.id === deptId);
    if (dept && dept.roles && dept.roles.length > 0) {
      setSelectedRoleId(dept.roles[0].id);
    } else {
      setSelectedRoleId(null);
    }
    setLocalPerms({});
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Chọn Phòng ban → Vai trò để thiết lập quyền truy cập cho từng tính năng trong hệ thống.
      </p>

      {/* Department selector */}
      <div className="flex flex-wrap gap-2">
        {displayedDepts?.map(dept => (
          <button
            key={dept.id}
            data-testid={`button-dept-${dept.id}`}
            onClick={() => handleSelectDept(dept.id)}
            className={cn(
              "px-4 py-1.5 rounded-lg border text-sm font-medium transition-all",
              selectedDeptId === dept.id
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background text-foreground border-border hover:border-primary/50 hover:bg-muted"
            )}
          >
            {dept.name}
          </button>
        ))}
        {(!displayedDepts || displayedDepts.length === 0) && (
          <p className="text-sm text-muted-foreground italic">Chưa có phòng ban nào. Hãy tạo ở tab Phòng ban & Vai trò.</p>
        )}
      </div>

      {/* Role selector */}
      {selectedDeptId && (
        <div className="flex flex-wrap gap-2">
          {roles.length === 0 && (
            <p className="text-sm text-muted-foreground italic">Phòng ban này chưa có vai trò nào.</p>
          )}
          {roles.map(role => (
            <button
              key={role.id}
              data-testid={`button-role-${role.id}`}
              onClick={() => { setSelectedRoleId(role.id); setLocalPerms({}); }}
              className={cn(
                "px-4 py-1.5 rounded-lg border text-sm transition-all",
                selectedRoleId === role.id
                  ? "bg-orange-500 text-white border-orange-500 font-semibold shadow-sm"
                  : "bg-background text-foreground border-border hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/20"
              )}
            >
              {role.name}
            </button>
          ))}
        </div>
      )}

      {/* Permissions grid */}
      {selectedRoleId && (
        <div className="space-y-3 mt-2">
          {permsLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Đang tải quyền...
            </div>
          )}
          {!permsLoading && modules.map(mod => {
            const isExpanded = expandedModules.includes(mod.module);
            return (
              <Card key={mod.module}>
                <CardContent className="p-0">
                  {/* Module header */}
                  <div className="flex items-center px-5 py-4 border-b border-border/50">
                    <button
                      className="flex items-center gap-3 flex-1 text-left"
                      onClick={() => setExpandedModules(prev =>
                        prev.includes(mod.module) ? prev.filter(m => m !== mod.module) : [...prev, mod.module]
                      )}
                    >
                      <div className="p-2 rounded-lg bg-primary/10">
                        <mod.icon className="w-5 h-5 text-primary" />
                      </div>
                      <span className={cn("font-semibold text-sm uppercase tracking-wider", mod.color)}>
                        {mod.module}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">({mod.items.length} mục)</span>
                      {isExpanded
                        ? <ChevronDown className="w-4 h-4 text-muted-foreground ml-1" />
                        : <ChevronRight className="w-4 h-4 text-muted-foreground ml-1" />
                      }
                    </button>
                    {/* "All" quick-tick checkbox */}
                    <div
                      className="flex items-center gap-1.5 mr-4 px-2 py-1 rounded-md hover:bg-muted/50 cursor-pointer select-none"
                      onClick={(e) => { e.stopPropagation(); handleToggleModuleAll(mod); }}
                      title="Tích chọn nhanh tất cả quyền trong nhóm này"
                    >
                      <Checkbox
                        data-testid={`perm-module-all-${mod.module}`}
                        checked={isModuleAllChecked(mod)}
                        onCheckedChange={() => handleToggleModuleAll(mod)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4"
                      />
                      <span className="text-xs font-semibold text-muted-foreground">All</span>
                    </div>
                    {/* Permission column headers */}
                    <div className="flex items-center gap-0">
                      {PERM_COLS.map(col => (
                        <div key={col.key} className="w-20 text-center text-xs font-semibold text-muted-foreground">
                          {col.label}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Items */}
                  {isExpanded && (
                    <div className="divide-y">
                      {mod.items.map(item => {
                        const hasSubTabs = item.subTabs && item.subTabs.length > 0;
                        const itemExpanded = expandedItems.includes(item.href);
                        const itemPerms = getResourcePerm(item.href);

                        return (
                          <div key={item.href}>
                            {/* Item row */}
                            <div className="flex items-center px-5 py-3 bg-muted/20 hover:bg-muted/30 transition-colors">
                              <div className="flex items-center gap-3 pl-8 flex-1">
                                {hasSubTabs ? (
                                  <button
                                    className="flex items-center gap-2 text-left"
                                    onClick={() => setExpandedItems(prev =>
                                      prev.includes(item.href) ? prev.filter(h => h !== item.href) : [...prev, item.href]
                                    )}
                                  >
                                    <item.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                                    <span className="text-sm text-foreground">{item.name}</span>
                                    <span className="text-xs text-muted-foreground ml-1">({item.subTabs!.length} tab)</span>
                                    {itemExpanded
                                      ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                      : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                    }
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <item.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                                    <span className="text-sm text-foreground">{item.name}</span>
                                  </div>
                                )}
                              </div>
                              {/* Permission checkboxes for item — hidden for parent rows that have sub-tabs */}
                              <div className="flex items-center gap-0 shrink-0">
                                {hasSubTabs ? (
                                  PERM_COLS.map(col => (
                                    <div key={col.key} className="w-20 flex justify-center">
                                      <span className="text-xs text-muted-foreground/30 select-none">—</span>
                                    </div>
                                  ))
                                ) : (
                                  PERM_COLS.map(col => {
                                    const isWritePerm = col.key === "canCreate" || col.key === "canEdit" || col.key === "canDelete";
                                    const isReadOnly = READ_ONLY_RESOURCES.has(item.href) && isWritePerm;
                                    const isNoEditDelete = NO_EDIT_DELETE_RESOURCES.has(item.href) && (col.key === "canEdit" || col.key === "canDelete");
                                    const isNoDelete = NO_DELETE_RESOURCES.has(item.href) && col.key === "canDelete";
                                    const isDisabled = isReadOnly || isNoEditDelete || isNoDelete;
                                    return (
                                      <div key={col.key} className="w-20 flex justify-center">
                                        <Checkbox
                                          data-testid={`perm-${item.href.replace(/\//g, "-")}-${col.key}`}
                                          checked={isDisabled ? false : itemPerms[col.key]}
                                          onCheckedChange={() => handleToggle(item.href, col.key)}
                                          disabled={isDisabled}
                                          className={cn("w-4 h-4", isDisabled && "opacity-25 cursor-not-allowed")}
                                        />
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>

                            {/* Sub-tab rows */}
                            {hasSubTabs && itemExpanded && (
                              <div className="divide-y bg-muted/10">
                                {item.subTabs!.map(sub => {
                                  const subResource = `${item.href}#${sub.value}`;
                                  const subPerms = getResourcePerm(subResource);
                                  return (
                                    <div key={sub.value} className="flex items-center px-5 py-2.5 hover:bg-muted/20 transition-colors">
                                      <div className="flex items-center gap-2 pl-16 flex-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                                        <span className="text-sm text-muted-foreground">{sub.name}</span>
                                      </div>
                                      <div className="flex items-center gap-0 shrink-0">
                                        {PERM_COLS.map(col => {
                                          const isNoDelete = NO_DELETE_RESOURCES.has(subResource) && col.key === "canDelete";
                                          return (
                                            <div key={col.key} className="w-20 flex justify-center">
                                              <Checkbox
                                                data-testid={`perm-${item.href.replace(/\//g, "-")}-${sub.value}-${col.key}`}
                                                checked={isNoDelete ? false : subPerms[col.key]}
                                                onCheckedChange={() => handleToggle(subResource, col.key)}
                                                disabled={isNoDelete}
                                                className={cn("w-4 h-4", isNoDelete && "opacity-25 cursor-not-allowed")}
                                              />
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!selectedRoleId && selectedDeptId && roles.length > 0 && (
        <div className="text-sm text-muted-foreground italic py-4">Chọn một vai trò để xem và thiết lập quyền.</div>
      )}
    </div>
  );
}

type ProviderKey = "openai" | "gemini";

const AI_PROVIDERS: { value: ProviderKey; label: string; icon: string; placeholder: string; hint: string }[] = [
  { value: "openai", label: "OpenAI (ChatGPT)", icon: "🤖", placeholder: "sk-proj-...", hint: "Lấy tại: platform.openai.com → API Keys" },
  { value: "gemini", label: "Google Gemini", icon: "✨", placeholder: "AIza...", hint: "Lấy tại: aistudio.google.com → Get API key" },
];

function AIProviderCard({
  provider,
  configured,
  onSaved,
  onDeleted,
}: {
  provider: typeof AI_PROVIDERS[0];
  configured: boolean;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ai-settings", { provider: provider.value, apiKey }),
    onSuccess: () => {
      toast({ title: "Thành công", description: `Đã lưu API key ${provider.label}.` });
      setApiKey("");
      setTestStatus("idle");
      setTestMessage("");
      onSaved();
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message || "Không thể lưu.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/ai-settings/${provider.value}`),
    onSuccess: () => {
      toast({ title: "Đã xóa", description: `Đã xóa API key ${provider.label}.` });
      onDeleted();
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message || "Không thể xóa.", variant: "destructive" });
    },
  });

  const handleTest = async () => {
    if (!apiKey.trim()) {
      toast({ title: "Lỗi", description: "Vui lòng nhập API key trước khi kiểm tra.", variant: "destructive" });
      return;
    }
    setTestStatus("testing");
    setTestMessage("");
    try {
      const res = await apiRequest("POST", "/api/ai-settings/test", { provider: provider.value, apiKey: apiKey.trim() });
      const data = await res.json();
      if (data.success) {
        setTestStatus("success");
        setTestMessage(data.message || "API key hợp lệ!");
      } else {
        setTestStatus("error");
        setTestMessage(data.message || "API key không hợp lệ.");
      }
    } catch (err: any) {
      setTestStatus("error");
      setTestMessage(err.message || "Không thể kết nối để kiểm tra.");
    }
  };

  const handleSave = () => {
    if (!apiKey.trim()) {
      toast({ title: "Lỗi", description: "Vui lòng nhập API key.", variant: "destructive" });
      return;
    }
    if (testStatus !== "success") {
      toast({ title: "Cần kiểm tra trước", description: "Bấm 'Kiểm tra' để xác nhận API key hợp lệ trước khi lưu.", variant: "destructive" });
      return;
    }
    saveMutation.mutate();
  };

  return (
    <Card className={configured ? "border-green-200 dark:border-green-800" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="text-lg">{provider.icon}</span>
            {provider.label}
          </CardTitle>
          {configured ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-3.5 h-3.5" />Đã cấu hình
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:bg-destructive/10"
                onClick={() => { if (confirm(`Xóa API key ${provider.label}?`)) deleteMutation.mutate(); }}
                disabled={deleteMutation.isPending}
                data-testid={`button-delete-ai-${provider.value}`}
              >
                {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash className="w-3.5 h-3.5" />}
              </Button>
            </div>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <XCircle className="w-3.5 h-3.5" />Chưa cấu hình
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {configured && (
          <p className="text-xs text-muted-foreground bg-green-50 dark:bg-green-950/30 rounded-md px-3 py-2">
            API key đã được lưu và mã hóa. Nhập key mới bên dưới nếu muốn cập nhật.
          </p>
        )}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            {configured ? "Cập nhật API Key" : "Nhập API Key"}
          </label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setTestStatus("idle"); setTestMessage(""); }}
              placeholder={provider.placeholder}
              className="w-full px-3 py-2 pr-10 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              data-testid={`input-ai-key-${provider.value}`}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{provider.hint}</p>
        </div>

        {testStatus !== "idle" && (
          <div className={cn("flex items-center gap-2 text-xs p-2.5 rounded-md",
            testStatus === "success" ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400" :
            testStatus === "error" ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400" :
            "bg-muted text-muted-foreground"
          )}>
            {testStatus === "testing" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {testStatus === "success" && <CheckCircle2 className="w-3.5 h-3.5" />}
            {testStatus === "error" && <XCircle className="w-3.5 h-3.5" />}
            {testStatus === "testing" ? "Đang kiểm tra..." : testMessage}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testStatus === "testing" || !apiKey.trim()}
            data-testid={`button-test-ai-${provider.value}`}
          >
            {testStatus === "testing" && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Kiểm tra
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saveMutation.isPending || testStatus !== "success"}
            data-testid={`button-save-ai-${provider.value}`}
          >
            {saveMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            {configured ? "Cập nhật" : "Lưu key"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AIAccountsManager() {
  const { data: configuredProviders, isLoading, refetch } = useQuery<{ openai: boolean; gemini: boolean }>({
    queryKey: ["/api/ai-settings"],
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Tài khoản AI</h2>
        <p className="text-sm text-muted-foreground">
          Cấu hình API key riêng của trung tâm để sử dụng AI tạo câu hỏi. Chi phí sẽ tính vào tài khoản AI của trung tâm thay vì Replit.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />Đang tải cấu hình...
        </div>
      ) : (
        <div className="space-y-4">
          {AI_PROVIDERS.map((p) => (
            <AIProviderCard
              key={p.value}
              provider={p}
              configured={!!configuredProviders?.[p.value]}
              onSaved={() => refetch()}
              onDeleted={() => refetch()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Payment Gateway Config ───────────────────────────────────────────────────

const PAYMENT_PROVIDERS = [
  {
    id: "payos",
    name: "PayOS",
    fields: [
      { key: "clientId", label: "Client ID" },
      { key: "apiKey", label: "API Key" },
      { key: "checksumKey", label: "Checksum Key" },
    ],
  },
  {
    id: "momo",
    name: "MoMo",
    fields: [
      { key: "partnerCode", label: "Partner Code" },
      { key: "accessKey", label: "Access Key" },
      { key: "secretKey", label: "Secret Key" },
    ],
  },
  {
    id: "vnpay",
    name: "VNPay",
    fields: [
      { key: "tmnCode", label: "TMN Code" },
      { key: "hashSecret", label: "Hash Secret" },
      { key: "returnUrl", label: "Return URL" },
    ],
  },
];

type BankAccount = { bankName: string; bankAccount: string; accountHolder: string };

type Gateway = {
  provider: string;
  name: string;
  isActive: boolean;
  credentials: Record<string, string>;
  locationId?: string | null;
  appliedBankAccount?: BankAccount | null;
};

function maskValue(val: string) {
  if (!val || val.length < 4) return "****";
  return "****" + val.slice(-3);
}

function ProvidersSection() {
  const [activeTab, setActiveTab] = useState<"payment" | "einvoice">("payment");
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <button
          className={`px-3 py-1 rounded-md border text-xs font-medium ${activeTab === "payment" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-accent"}`}
          onClick={() => setActiveTab("payment")}
          data-testid="tab-payment-gateway"
        >
          Cổng thanh toán
        </button>
        <button
          className={`px-3 py-1 rounded-md border text-xs font-medium ${activeTab === "einvoice" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-accent"}`}
          onClick={() => setActiveTab("einvoice")}
          data-testid="tab-einvoice"
        >
          Hoá đơn điện tử
        </button>
      </div>
      {activeTab === "payment" ? <PaymentGatewayConfig /> : <EInvoiceConfig />}
    </div>
  );
}

const EINVOICE_PROVIDERS = [
  { id: "matbao", name: "Mắt Bão" },
];

type EInvoiceTemplate = { khmsHDon: string; khhDon: string; name: string; remaining: number | null };
type EInvoiceConfigDto = { baseUrl: string; mst: string; username: string; hasPassword: boolean; khhDon: string; khmsHDon: string };

function templateValue(t: { khmsHDon: string; khhDon: string }): string {
  return `${t.khmsHDon}|${t.khhDon}`;
}

function EInvoiceConfig() {
  const [selectedProviderId, setSelectedProviderId] = useState<string>(EINVOICE_PROVIDERS[0].id);
  const [form, setForm] = useState({
    baseUrl: "https://demo-api-hddt.matbao.in:11443",
    taxCode: "",
    username: "",
    password: "",
    templateId: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [templates, setTemplates] = useState<EInvoiceTemplate[]>([]);
  const { toast } = useToast();

  const { data: savedCfg } = useQuery<EInvoiceConfigDto>({
    queryKey: ["/api/einvoice/config"],
  });

  useEffect(() => {
    if (!savedCfg) return;
    setForm(p => ({
      ...p,
      baseUrl: savedCfg.baseUrl || p.baseUrl,
      taxCode: savedCfg.mst || "",
      username: savedCfg.username || "",
      password: savedCfg.hasPassword ? "********" : "",
      templateId: savedCfg.khmsHDon && savedCfg.khhDon ? `${savedCfg.khmsHDon}|${savedCfg.khhDon}` : "",
    }));
  }, [savedCfg]);

  // Hợp nhất danh sách mẫu với mẫu đã lưu để Select luôn hiển thị giá trị đã chọn,
  // ngay cả khi chưa bấm "Kiểm tra kết nối" để tải lại danh sách từ Mắt Bão.
  const templatesForSelect: EInvoiceTemplate[] = (() => {
    const list = [...templates];
    if (savedCfg?.khhDon && savedCfg?.khmsHDon) {
      const exists = list.some(t => t.khhDon === savedCfg.khhDon && t.khmsHDon === savedCfg.khmsHDon);
      if (!exists) {
        list.unshift({ khmsHDon: savedCfg.khmsHDon, khhDon: savedCfg.khhDon, name: "Mẫu đã lưu", remaining: null });
      }
    }
    return list;
  })();

  const testMutation = useMutation({
    mutationFn: async () => {
      const passwordToSend = form.password === "********" ? "" : form.password;
      if (!passwordToSend && !savedCfg?.hasPassword) {
        throw new Error("Vui lòng nhập mật khẩu");
      }
      const res = await apiRequest("POST", "/api/einvoice/test-connection", {
        baseUrl: form.baseUrl,
        mst: form.taxCode,
        username: form.username,
        password: passwordToSend || "__USE_SAVED__",
      });
      return (await res.json()) as { ok: boolean; templates: EInvoiceTemplate[]; message?: string };
    },
    onMutate: () => setTestStatus("testing"),
    onSuccess: (data) => {
      setTestStatus("success");
      setTemplates(data.templates || []);
      toast({
        title: "Kết nối thành công",
        description: `Đã tải ${data.templates?.length ?? 0} mẫu hoá đơn từ Mắt Bão.`,
      });
      // Nếu mẫu đang chọn không còn trong list thì reset
      if (form.templateId && !data.templates?.some(t => templateValue(t) === form.templateId)) {
        setForm(p => ({ ...p, templateId: "" }));
      }
    },
    onError: (err: any) => {
      setTestStatus("error");
      toast({
        title: "Kết nối thất bại",
        description: err?.message || "Không đăng nhập được Mắt Bão",
        variant: "destructive",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.templateId) throw new Error("Vui lòng chọn Mẫu hoá đơn (bấm 'Kiểm tra kết nối' trước nếu chưa có).");
      const [khmsHDon, khhDon] = form.templateId.split("|");
      const passwordToSend = form.password === "********" ? "" : form.password;
      const res = await apiRequest("POST", "/api/einvoice/config", {
        baseUrl: form.baseUrl,
        mst: form.taxCode,
        username: form.username,
        password: passwordToSend,
        khhDon,
        khmsHDon,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Đã lưu cấu hình", description: "Cấu hình hoá đơn điện tử Mắt Bão đã được lưu." });
      queryClient.invalidateQueries({ queryKey: ["/api/einvoice/config"] });
    },
    onError: (err: any) => {
      toast({ title: "Lưu thất bại", description: err?.message || "Không lưu được cấu hình", variant: "destructive" });
    },
  });

  const selectedProvider = EINVOICE_PROVIDERS.find(p => p.id === selectedProviderId)!;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
      {/* Left sidebar: Providers */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Nhà cung cấp</CardTitle>
        </CardHeader>
        <CardContent className="p-2 space-y-1">
          {EINVOICE_PROVIDERS.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedProviderId(p.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${selectedProviderId === p.id ? "bg-primary text-primary-foreground" : "hover:bg-accent text-foreground"}`}
              data-testid={`provider-einvoice-${p.id}`}
            >
              {p.name}
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Right: Configuration */}
      <Card>
        <CardHeader className="py-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Cấu hình Hệ thống — {selectedProvider.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Base URL</label>
            <Input
              value={form.baseUrl}
              onChange={e => setForm(p => ({ ...p, baseUrl: e.target.value }))}
              placeholder="https://demo-api-hddt.matbao.in:11443"
              data-testid="input-einvoice-base-url"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Mã số thuế (MST)</label>
            <Input
              value={form.taxCode}
              onChange={e => setForm(p => ({ ...p, taxCode: e.target.value }))}
              placeholder="VD: 0302712571-999"
              data-testid="input-einvoice-tax-code"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Tên đăng nhập</label>
              <Input
                value={form.username}
                onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                placeholder="Nhập tên đăng nhập"
                data-testid="input-einvoice-username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Mật khẩu</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="Nhập mật khẩu"
                  className="pr-9"
                  data-testid="input-einvoice-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => testMutation.mutate()}
              disabled={testStatus === "testing"}
              data-testid="button-test-einvoice-connection"
            >
              {testStatus === "testing" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FlaskConical className="h-4 w-4 mr-1.5" />}
              Kiểm tra kết nối
            </Button>
            {testStatus === "success" && (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 border-none" data-testid="status-test-success">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Thành công
              </Badge>
            )}
            {testStatus === "error" && (
              <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100 border-none" data-testid="status-test-error">
                <XCircle className="h-3 w-3 mr-1" /> Thất bại
              </Badge>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Mẫu hoá đơn</label>
            <Select value={form.templateId} onValueChange={v => setForm(p => ({ ...p, templateId: v }))}>
              <SelectTrigger data-testid="select-einvoice-template">
                <SelectValue placeholder={templatesForSelect.length === 0 ? "Bấm 'Kiểm tra kết nối' để tải danh sách mẫu" : "Chọn mẫu hoá đơn"} />
              </SelectTrigger>
              <SelectContent>
                {templatesForSelect.length === 0 ? (
                  <SelectItem value="__none__" disabled>Chưa có mẫu hoá đơn</SelectItem>
                ) : (
                  templatesForSelect.map(t => {
                    const v = templateValue(t);
                    const label = `KHMS=${t.khmsHDon} • KH=${t.khhDon}${t.name ? ` — ${t.name}` : ""}${t.remaining != null ? ` (còn ${t.remaining})` : ""}`;
                    return (
                      <SelectItem key={v} value={v} data-testid={`option-template-${v}`}>{label}</SelectItem>
                    );
                  })
                )}
              </SelectContent>
            </Select>
            {savedCfg?.khhDon && savedCfg?.khmsHDon && templates.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Bấm "Kiểm tra kết nối" để tải lại danh sách mẫu mới nhất từ Mắt Bão.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              data-testid="button-save-einvoice"
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Lưu cấu hình
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PaymentGatewayConfig() {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [activeProvider, setActiveProvider] = useState("payos");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [selectedProvider, setSelectedProvider] = useState("payos");
  const [form, setForm] = useState<Record<string, string>>({});
  const [activateNow, setActivateNow] = useState(true);
  const [showCreds, setShowCreds] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [selectedBankAccount, setSelectedBankAccount] = useState<BankAccount | null>(null);
  const { toast } = useToast();
  const { data: locations } = useLocations();

  const getLocationBanks = (locId: string): BankAccount[] => {
    const loc = (locations || []).find((l: any) => l.id === locId);
    if (!loc) return [];
    const banks: BankAccount[] = [];
    if ((loc as any).bankAccounts) {
      try { banks.push(...JSON.parse((loc as any).bankAccounts)); } catch {}
    }
    if (banks.length === 0 && (loc as any).bankName) {
      banks.push({ bankName: (loc as any).bankName, bankAccount: (loc as any).bankAccount || "", accountHolder: (loc as any).accountHolder || "" });
    }
    return banks;
  };

  const getLocationName = (locId: string) =>
    (locations || []).find((l: any) => l.id === locId)?.name || "—";

  const openAdd = () => {
    setSelectedProvider(activeProvider);
    setForm({});
    setActivateNow(true);
    setSelectedLocationId("");
    setSelectedBankAccount(null);
    setAddOpen(true);
  };

  const openEditDialog = (idx: number) => {
    const gw = gateways[idx];
    setEditIdx(idx);
    setSelectedProvider(gw.provider);
    setForm({ ...gw.credentials });
    setActivateNow(gw.isActive);
    setSelectedLocationId(gw.locationId || "");
    setSelectedBankAccount(gw.appliedBankAccount || null);
    setShowCreds(false);
    setEditOpen(true);
  };

  const handleSave = (isEdit: boolean) => {
    const prov = PAYMENT_PROVIDERS.find(p => p.id === selectedProvider)!;
    const entry: Gateway = {
      provider: selectedProvider,
      name: prov.name,
      isActive: activateNow,
      credentials: { ...form },
      locationId: selectedLocationId || null,
      appliedBankAccount: selectedBankAccount,
    };
    if (isEdit && editIdx !== null) {
      setGateways(prev => prev.map((g, i) => i === editIdx ? entry : g));
      setEditOpen(false);
      toast({ title: "Thành công", description: `Đã cập nhật cấu hình ${prov.name}.` });
    } else {
      setGateways(prev => [...prev, entry]);
      setAddOpen(false);
      toast({ title: "Thành công", description: `Đã thêm cấu hình ${prov.name}.` });
    }
  };

  const handleToggle = (idx: number) => {
    setGateways(prev => prev.map((g, i) => i === idx ? { ...g, isActive: !g.isActive } : g));
    if (editIdx === idx) setActivateNow(v => !v);
  };

  const handleDelete = (idx: number) => {
    setGateways(prev => prev.filter((_, i) => i !== idx));
  };

  const currentProvConf = PAYMENT_PROVIDERS.find(p => p.id === selectedProvider)!;
  const providerRows = gateways.filter(g => g.provider === activeProvider);

  const GatewayForm = () => (
    <div className="space-y-4 py-1">
      <div className="space-y-3">
        {currentProvConf.fields.map(f => (
          <div key={f.key}>
            <label className="block text-sm font-medium mb-1.5">{f.label}</label>
            <Input
              placeholder={`Nhập ${f.label}...`}
              value={form[f.key] || ""}
              onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
              data-testid={`input-gateway-${f.key}`}
            />
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium">Cơ sở áp dụng</label>
        <Select
          value={selectedLocationId || "__none__"}
          onValueChange={val => {
            const id = val === "__none__" ? "" : val;
            setSelectedLocationId(id);
            setSelectedBankAccount(null);
          }}
        >
          <SelectTrigger data-testid="select-gateway-location">
            <SelectValue placeholder="Chọn cơ sở..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">-- Không chọn --</SelectItem>
            {(locations || []).map((loc: any) => (
              <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedLocationId && (() => {
        const banks = getLocationBanks(selectedLocationId);
        if (banks.length === 0) return (
          <p className="text-xs text-muted-foreground">Cơ sở này chưa cấu hình ngân hàng.</p>
        );
        return (
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">Ngân hàng áp dụng nhận tiền</label>
            <Select
              value={selectedBankAccount ? selectedBankAccount.bankAccount : "__none__"}
              onValueChange={val => {
                setSelectedBankAccount(banks.find(b => b.bankAccount === val) || null);
              }}
            >
              <SelectTrigger data-testid="select-gateway-bank">
                <SelectValue placeholder="Chọn ngân hàng..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">-- Không chọn --</SelectItem>
                {banks.map((b, i) => (
                  <SelectItem key={i} value={b.bankAccount}>
                    {b.bankName} — {b.bankAccount} ({b.accountHolder})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })()}

      <label className="flex items-center gap-2 cursor-pointer pt-1">
        <input
          type="checkbox"
          checked={activateNow}
          onChange={e => setActivateNow(e.target.checked)}
          className="accent-primary w-4 h-4"
        />
        <span className="text-sm">Kích hoạt ngay</span>
      </label>
    </div>
  );

  const editingGw = editIdx !== null ? gateways[editIdx] : null;
  const editingProvConf = editingGw ? PAYMENT_PROVIDERS.find(p => p.id === editingGw.provider) : null;

  return (
    <div className="border rounded-lg overflow-hidden bg-background" style={{ minHeight: 340 }}>
      <div className="grid" style={{ gridTemplateColumns: "200px 1fr" }}>
        {/* LEFT: Provider list */}
        <div className="border-r flex flex-col">
          <div className="px-4 py-2.5 bg-muted/40 border-b">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nhà cung cấp</span>
          </div>
          <div className="flex-1 p-2 space-y-1">
            {PAYMENT_PROVIDERS.map(p => {
              const count = gateways.filter(g => g.provider === p.id).length;
              return (
                <button
                  key={p.id}
                  onClick={() => setActiveProvider(p.id)}
                  data-testid={`button-provider-${p.id}`}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-md text-sm text-left transition-all",
                    activeProvider === p.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-muted/60 text-foreground"
                  )}
                >
                  <span>{p.name}</span>
                  {count > 0 && (
                    <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-semibold">{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Table view */}
        <div className="flex flex-col">
          <div className="px-4 py-2.5 bg-muted/40 border-b flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {PAYMENT_PROVIDERS.find(p => p.id === activeProvider)?.name}
            </span>
          </div>

          {providerRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 py-14 gap-3 text-muted-foreground">
              <Plug className="w-9 h-9 opacity-20" />
              <p className="text-sm">Chưa có cấu hình nào cho nhà cung cấp này</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/20">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Cơ sở</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Ngân hàng</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Trạng thái</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {providerRows.map((gw, rowIdx) => {
                    const realIdx = gateways.findIndex((g, i) => g.provider === activeProvider
                      ? (gateways.filter((x, j) => x.provider === activeProvider && j < i).length) === rowIdx && gateways[i] === g
                      : false
                    );
                    const globalIdx = gateways.indexOf(gw);
                    return (
                      <tr key={globalIdx} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium">
                          {gw.locationId ? getLocationName(gw.locationId) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {gw.appliedBankAccount
                            ? <span className="font-medium text-foreground">{gw.appliedBankAccount.bankName}</span>
                            : <span>—</span>
                          }
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border",
                            gw.isActive
                              ? "border-green-500/30 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
                              : "border-muted text-muted-foreground bg-muted/30"
                          )}>
                            <span className={cn("w-1.5 h-1.5 rounded-full", gw.isActive ? "bg-green-500" : "bg-muted-foreground/40")} />
                            {gw.isActive ? "Hoạt động" : "Tắt"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-xs gap-1"
                              onClick={() => openEditDialog(globalIdx)}
                              data-testid={`button-edit-gateway-${globalIdx}`}
                            >
                              <Edit2 className="w-3 h-3" />
                              Sửa
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                              onClick={() => handleDelete(globalIdx)}
                              data-testid={`button-delete-gateway-${globalIdx}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="p-3 border-t mt-auto">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={openAdd} data-testid="button-add-gateway">
              <Plus className="w-3.5 h-3.5" />
              Thêm cổng thanh toán
            </Button>
          </div>
        </div>
      </div>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              Thêm cổng thanh toán
            </DialogTitle>
            <DialogDescription>Nhập thông tin kết nối cho {currentProvConf?.name}.</DialogDescription>
          </DialogHeader>
          <GatewayForm />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>Huỷ</Button>
            <Button size="sm" onClick={() => handleSave(false)} data-testid="button-save-gateway-add">Lưu</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-primary" />
              Chỉnh sửa {editingGw?.name}
            </DialogTitle>
            <DialogDescription>Cập nhật thông tin kết nối cổng thanh toán.</DialogDescription>
          </DialogHeader>

          <GatewayForm />

          {/* Thông tin kết nối hiện tại */}
          {editingProvConf && (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Thông tin kết nối hiện tại</span>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  onClick={() => setShowCreds(v => !v)}
                  data-testid="button-toggle-show-creds"
                >
                  {showCreds ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showCreds ? "Ẩn" : "Hiện"}
                </button>
              </div>
              <div className="divide-y text-sm">
                {editingProvConf.fields.map(f => (
                  <div key={f.key} className="flex items-center px-3 py-2 gap-3">
                    <span className="text-muted-foreground w-28 shrink-0 text-xs">{f.label}:</span>
                    <span className="font-mono text-xs font-medium">
                      {showCreds ? (form[f.key] || "—") : maskValue(form[f.key] || "")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              data-testid="button-test-gateway"
              onClick={() => toast({ title: "Kiểm tra kết nối", description: `Đang test ${editingGw?.name}...` })}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              Test kết nối
            </Button>
            {editIdx !== null && (
              <Button
                size="sm"
                variant="outline"
                className={cn("gap-1.5 text-xs", gateways[editIdx]?.isActive ? "text-destructive hover:text-destructive" : "text-green-600 hover:text-green-600")}
                data-testid="button-toggle-gateway"
                onClick={() => editIdx !== null && handleToggle(editIdx)}
              >
                <Power className="w-3.5 h-3.5" />
                {gateways[editIdx]?.isActive ? "Tắt" : "Bật"}
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(false)}>Huỷ</Button>
              <Button size="sm" onClick={() => handleSave(true)} data-testid="button-save-gateway-edit">Lưu thay đổi</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
