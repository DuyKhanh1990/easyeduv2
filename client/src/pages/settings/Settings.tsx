import { cn } from "@/lib/utils";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useLocations, useCreateLocation, useUpdateLocation, useDeleteLocation } from "@/hooks/use-locations";
import { useDepartments, useCreateDepartment, useUpdateDepartment, useDeleteDepartment, useCreateRole, useUpdateRole, useDeleteRole } from "@/hooks/use-departments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Building, ShieldCheck, Plus, Loader2, Edit2, Trash2, Users, QrCode, Image as ImageIcon, LayoutGrid, UserCog, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, Bot, Eye, EyeOff, CheckCircle2, XCircle, Trash, CreditCard, Plug, Power, FlaskConical, Camera, Upload, Server, AlertCircle, CalendarDays, Download, Search } from "lucide-react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { navigation } from "@/lib/sidebar-navigation";
import { useSidebarVisibility } from "@/hooks/use-sidebar-visibility";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import type { MyPermissionsResult } from "@/hooks/use-my-permissions";
import { DOWNLOAD_FILES_RESOURCE } from "@/hooks/use-can-download-files";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getAuthHeaders } from "@/lib/queryClient";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EducationConfigHistoryTab } from "@/pages/education/EducationConfigHistoryTab";

const SETTINGS_HREF = "/settings";
const SETTINGS_HISTORY_RESOURCES = {
  location: "Cơ sở",
  department: "Phòng ban & Vai trò",
  permission: "Quản lý phân quyền",
  holiday: "Ngày nghỉ lễ",
};
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
  const canViewHolidays = canViewSettingsTab(myPerms, "holidays");
  const holidayPerm = buildSettingsTabPerm(myPerms, "holidays");
  const permTabRaw = !myPerms ? { canViewAll: true, canCreate: true, canEdit: true }
    : myPerms.isSuperAdmin ? { canViewAll: true, canCreate: true, canEdit: true }
    : {
        canViewAll: !!(myPerms.permissions[`${SETTINGS_HREF}#permissions`]?.canViewAll),
        canCreate: !!(myPerms.permissions[`${SETTINGS_HREF}#permissions`]?.canCreate),
        canEdit: !!(myPerms.permissions[`${SETTINGS_HREF}#permissions`]?.canEdit),
      };
  const defaultSettingsTab = canViewLoc ? "locations" : canViewDept ? "departments" : canViewPermTab ? "permissions" : myPerms?.isSuperAdmin ? "system" : "locations";
  const [, setLocation] = useLocation();
  const [settingsTab, setSettingsTab] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("tab") || defaultSettingsTab;
    }
    return defaultSettingsTab;
  });

  const handleSettingsTabChange = (value: string) => {
    setSettingsTab(value);
    setLocation(`/settings?tab=${value}`);
  };
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
  const [locDeleteTarget, setLocDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [locDeleteInUse, setLocDeleteInUse] = useState(false);
  const [locDeleteChecking, setLocDeleteChecking] = useState(false);
  const [bankPopupOpen, setBankPopupOpen] = useState(false);
  const [bankForm, setBankForm] = useState({ bankName: "", bankAccount: "", accountHolder: "", qrUrl: "" });
  const [editingBankIdx, setEditingBankIdx] = useState<number | null>(null);
  const [banks, setBanks] = useState<{ bankName: string; bankAccount: string; accountHolder: string; qrUrl?: string }[]>([]);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingBankQr, setUploadingBankQr] = useState(false);
  const bankQrInputRef = useRef<HTMLInputElement>(null);

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

  const handleLogoUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Chỉ chấp nhận file ảnh", variant: "destructive" });
      return;
    }
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("files", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd, headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const url = data.files?.[0]?.url;
      if (url) locForm.setValue("logoUrl", url);
    } catch {
      toast({ title: "Tải ảnh lên thất bại", variant: "destructive" });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleBankQrUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Chỉ chấp nhận file ảnh", variant: "destructive" });
      return;
    }
    setUploadingBankQr(true);
    try {
      const fd = new FormData();
      fd.append("files", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd, headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const url = data.files?.[0]?.url;
      if (url) setBankForm(f => ({ ...f, qrUrl: url }));
    } catch {
      toast({ title: "Tải ảnh lên thất bại", variant: "destructive" });
    } finally {
      setUploadingBankQr(false);
    }
  };

  const handleDelLoc = async (id: string, name: string) => {
    setLocDeleteChecking(true);
    let inUse = false;
    try {
      const res = await fetch(`/api/locations/${id}/usage`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        inUse = !!data.inUse;
      }
    } catch {
      // network error — default to safe (inUse=false, confirmation dialog)
    } finally {
      setLocDeleteChecking(false);
    }
    setLocDeleteInUse(inUse);
    setLocDeleteTarget({ id, name });
  };

  const handleConfirmDelLoc = async () => {
    if (!locDeleteTarget) return;
    try {
      await deleteLocation.mutateAsync(locDeleteTarget.id);
      toast({ title: "Thành công", description: `Đã xoá cơ sở "${locDeleteTarget.name}".` });
    } catch (error: any) {
      toast({ title: "Lỗi", description: error.message, variant: "destructive" });
    } finally {
      setLocDeleteTarget(null);
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
      <div className="space-y-4 max-w-6xl mx-auto">

        <Tabs value={settingsTab} onValueChange={handleSettingsTabChange} className="w-full">
          <div className="flex flex-wrap gap-2 mb-4 sticky top-0 z-10 bg-[#ECEEF4] py-2 -mx-1 px-1">
            {canViewLoc && <button onClick={() => handleSettingsTabChange("locations")} className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all", settingsTab === "locations" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}>Cơ sở</button>}
            {canViewDept && <button onClick={() => handleSettingsTabChange("departments")} className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all", settingsTab === "departments" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}>Phòng ban & Vai trò</button>}
            {myPerms?.isSuperAdmin && <button onClick={() => handleSettingsTabChange("system")} className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all", settingsTab === "system" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}>Quản lý hệ thống</button>}
            {canViewPermTab && <button onClick={() => handleSettingsTabChange("permissions")} className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all", settingsTab === "permissions" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}>Quản lý phân quyền</button>}
            {myPerms?.isSuperAdmin && <button onClick={() => handleSettingsTabChange("ai-accounts")} className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-1", settingsTab === "ai-accounts" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}><Bot className="w-3 h-3" />Tài khoản AI</button>}
            {myPerms?.isSuperAdmin && <button onClick={() => handleSettingsTabChange("providers")} className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all", settingsTab === "providers" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}>Kết nối nhà cung cấp</button>}
            {canViewHolidays && <button onClick={() => handleSettingsTabChange("holidays")} className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-1", settingsTab === "holidays" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}><CalendarDays className="w-3 h-3" />Ngày nghỉ lễ</button>}
             {myPerms?.isSuperAdmin && <button onClick={() => handleSettingsTabChange("history")} className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all", settingsTab === "history" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}>Lịch sử</button>}
            {settingsTab === "permissions" && (
              <div className="basis-full mt-1 flex flex-wrap items-center gap-x-8 gap-y-1 font-['Roboto'] text-[11px] leading-4">
                <div>
                  <span className="text-blue-600">Xem:</span>{" "}
                  <span className="text-black">xem dữ liệu mình tạo ra hoặc mình được phụ trách tùy module.</span>
                </div>
                <div>
                  <span className="text-blue-600">Xem all:</span>{" "}
                  <span className="text-black">xem được dữ liệu của người khác tạo ra thường là cùng cơ sở.</span>
                </div>
              </div>
            )}
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
                          {locForm.watch("isMain") && (
                            <div className="space-y-2">
                              <label className="text-sm font-medium flex items-center gap-1"><ImageIcon className="w-4 h-4" /> Logo trung tâm</label>
                              <div className="flex items-center gap-4">
                                <div
                                  onClick={() => !uploadingLogo && logoInputRef.current?.click()}
                                  className="relative w-20 h-20 rounded-xl border-2 border-dashed border-border bg-white cursor-pointer hover:border-primary/60 hover:bg-muted/50 transition-colors flex items-center justify-center overflow-hidden group shrink-0"
                                >
                                  {locForm.watch("logoUrl") ? (
                                    <>
                                      <img src={locForm.watch("logoUrl")} alt="logo" className="w-full h-full object-contain rounded-xl" />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                                        <Camera className="w-4 h-4 text-white" />
                                      </div>
                                    </>
                                  ) : uploadingLogo ? (
                                    <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                                  ) : (
                                    <div className="flex flex-col items-center gap-1 text-muted-foreground">
                                      <Camera className="w-5 h-5" />
                                      <span className="text-[10px]">Tải ảnh</span>
                                    </div>
                                  )}
                                </div>
                                {locForm.watch("logoUrl") && (
                                  <Button type="button" variant="ghost" size="sm" className="text-destructive text-xs h-7" onClick={() => locForm.setValue("logoUrl", "")}>Xoá logo</Button>
                                )}
                              </div>
                              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ""; }} />
                            </div>
                          )}
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
                                setBankForm({ bankName: "", bankAccount: "", accountHolder: "", qrUrl: "" });
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
                                        setBankForm({ bankName: bank.bankName, bankAccount: bank.bankAccount, accountHolder: bank.accountHolder, qrUrl: bank.qrUrl || "" });
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

                      <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
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

                        <div>
                          <label className="block text-sm font-medium mb-1.5 flex items-center gap-1"><QrCode className="w-4 h-4" /> Mã QR ngân hàng</label>
                          <div className="flex items-center gap-3">
                            <div
                              onClick={() => !uploadingBankQr && bankQrInputRef.current?.click()}
                              className="relative w-20 h-20 rounded-xl border-2 border-dashed border-border bg-white cursor-pointer hover:border-primary/60 hover:bg-muted/50 transition-colors flex items-center justify-center overflow-hidden group shrink-0"
                            >
                              {bankForm.qrUrl ? (
                                <>
                                  <img src={bankForm.qrUrl} alt="QR" className="w-full h-full object-contain rounded-xl" />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                                    <Camera className="w-4 h-4 text-white" />
                                  </div>
                                </>
                              ) : uploadingBankQr ? (
                                <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                              ) : (
                                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                                  <QrCode className="w-5 h-5" />
                                  <span className="text-[10px]">Tải ảnh</span>
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              <p>Tải lên ảnh mã QR thanh toán</p>
                              <p>của tài khoản ngân hàng này</p>
                              {bankForm.qrUrl && (
                                <button type="button" className="text-destructive mt-1 hover:underline" onClick={() => setBankForm(f => ({ ...f, qrUrl: "" }))}>Xoá ảnh</button>
                              )}
                            </div>
                          </div>
                          <input ref={bankQrInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBankQrUpload(f); e.target.value = ""; }} />
                        </div>

                        {/* Preview */}
                        {(bankForm.bankName || bankForm.bankAccount || bankForm.accountHolder) && (
                          <div className="bg-muted/40 rounded-lg p-3 border space-y-1 text-sm">
                            <p className="text-xs text-muted-foreground font-medium uppercase mb-1.5">Xem trước</p>
                            <div className="flex gap-2"><span className="text-muted-foreground min-w-[110px]">Ngân hàng:</span><span className="font-medium">{bankForm.bankName || "—"}</span></div>
                            <div className="flex gap-2"><span className="text-muted-foreground min-w-[110px]">Số tài khoản:</span><span className="font-mono font-medium">{bankForm.bankAccount || "—"}</span></div>
                            <div className="flex gap-2"><span className="text-muted-foreground min-w-[110px]">Chủ tài khoản:</span><span className="font-medium uppercase">{bankForm.accountHolder || "—"}</span></div>
                            {bankForm.qrUrl && <div className="pt-1"><img src={bankForm.qrUrl} alt="QR" className="w-16 h-16 object-contain rounded border" /></div>}
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
                      {locPerm.canDelete && <Button variant="outline" size="icon" className="text-destructive" disabled={locDeleteChecking} onClick={() => handleDelLoc(loc.id, loc.name)}><Trash2 className="w-4 h-4" /></Button>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Location delete confirmation / blocking dialog */}
          <AlertDialog open={!!locDeleteTarget} onOpenChange={(open) => { if (!open) setLocDeleteTarget(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {locDeleteInUse ? "Không thể xóa cơ sở" : `Xóa cơ sở "${locDeleteTarget?.name}"?`}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {locDeleteInUse
                    ? `Cơ sở "${locDeleteTarget?.name}" đang được gán với dữ liệu trên hệ thống (nhân viên, lớp học, học viên…), không thể xóa được. Hãy gỡ toàn bộ dữ liệu liên quan trước khi xóa cơ sở.`
                    : `Bạn có chắc chắn muốn xóa cơ sở "${locDeleteTarget?.name}" ra khỏi hệ thống? Khi xóa xong sẽ không hoàn tác lại được.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{locDeleteInUse ? "Đóng" : "Huỷ"}</AlertDialogCancel>
                {(!locDeleteInUse || myPerms?.isSuperAdmin) && (
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleConfirmDelLoc}
                    disabled={deleteLocation.isPending}
                  >
                    {deleteLocation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                    {locDeleteInUse ? "Vẫn xóa (Admin)" : "Xóa"}
                  </AlertDialogAction>
                )}
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

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
            {myPerms && !myPerms.isSuperAdmin ? (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                Bạn không có quyền truy cập trang này.
              </div>
            ) : (
              <Tabs value={systemTab} onValueChange={setSystemTab} className="w-full">
                <div className="flex flex-wrap gap-2 mb-4">
                  <button onClick={() => setSystemTab("modules")} className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-1.5", systemTab === "modules" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}>
                    <LayoutGrid className="w-3.5 h-3.5" />Quản lý module
                  </button>
                  <button onClick={() => setSystemTab("hrm-accounts")} className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-1.5", systemTab === "hrm-accounts" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}>
                    <UserCog className="w-3.5 h-3.5" />Quản lý số lượng tài khoản HRM
                  </button>
                  <button onClick={() => setSystemTab("storage")} className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-1.5", systemTab === "storage" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}>
                    <Server className="w-3.5 h-3.5" />Quản lý dung lượng sử dụng
                  </button>
                </div>

                <TabsContent value="modules">
                  <ModulesManager />
                </TabsContent>

                <TabsContent value="hrm-accounts">
                  <HrmAccountsManager />
                </TabsContent>

                <TabsContent value="storage">
                  <StorageManager />
                </TabsContent>
              </Tabs>
            )}
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

          <TabsContent value="holidays">
            <HolidaysManager canAdd={holidayPerm.canAdd} canEdit={holidayPerm.canEdit} canDelete={holidayPerm.canDelete} />
          </TabsContent>
          <TabsContent value="history">
            <EducationConfigHistoryTab scope="settings" resourceOptions={SETTINGS_HISTORY_RESOURCES} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function ModulesManager() {
  const { isModuleVisible, isItemVisible, isSubTabVisible, isSubTabItemVisible, toggleModule, toggleItem, toggleSubTab, toggleSubTabItem } = useSidebarVisibility();
  const [expandedModules, setExpandedModules] = useState<string[]>(() =>
    navigation.filter(e => "module" in e).map(e => (e as any).module)
  );
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [expandedSubTabs, setExpandedSubTabs] = useState<string[]>([]);

  const toggleExpandSubTab = (href: string, tabValue: string) => {
    const key = `${href}:${tabValue}`;
    setExpandedSubTabs(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };
  const [standaloneExpanded, setStandaloneExpanded] = useState(true);

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

  const standaloneItems = navigation.filter((e): e is Extract<typeof navigation[number], { href: string }> => "href" in e);
  const modules = navigation.filter((e): e is Extract<typeof navigation[number], { module: string }> => "module" in e);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-4">
        Bật/tắt các module, mục con và tab trong menu điều hướng. Ẩn module lớn sẽ ẩn toàn bộ bên trong.
      </p>

      {/* ── TRANG CHÍNH card ── */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-5 py-4">
            <button
              className="flex items-center gap-3 flex-1 text-left"
              onClick={() => setStandaloneExpanded(v => !v)}
            >
              <div className="p-2 rounded-lg bg-primary/10">
                <LayoutGrid className="w-5 h-5 text-primary" />
              </div>
              <span className="font-semibold text-sm uppercase tracking-wider text-slate-600 dark:text-slate-400">
                TRANG CHÍNH
              </span>
              <span className="text-xs text-muted-foreground ml-1">({standaloneItems.length} mục)</span>
              {standaloneExpanded
                ? <ChevronDown className="w-4 h-4 text-muted-foreground ml-1" />
                : <ChevronRight className="w-4 h-4 text-muted-foreground ml-1" />
              }
            </button>
          </div>

          {standaloneExpanded && (
            <div className="border-t divide-y mx-0">
              {standaloneItems.map(item => {
                const itemVisible = isItemVisible(item.href);
                const hasSubTabs = item.subTabs && item.subTabs.length > 0;
                const itemExpanded = expandedItems.includes(item.href);

                return (
                  <div key={item.href}>
                    <div className={cn("flex items-center justify-between px-5 py-3 bg-muted/20 transition-all", !itemVisible && "opacity-50")}>
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
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => toggleItem(item.href)}
                        title={itemVisible ? "Ẩn mục này" : "Hiện mục này"}
                      >
                        {itemVisible
                          ? <ToggleRight className="w-6 h-6 text-primary" />
                          : <ToggleLeft className="w-6 h-6 text-muted-foreground" />
                        }
                      </Button>
                    </div>

                    {hasSubTabs && itemExpanded && (
                      <div className="divide-y border-t bg-muted/10">
                        {item.subTabs!.map(sub => {
                          const subVisible = isSubTabVisible(item.href, sub.value);
                          const subDisabled = !itemVisible;
                          const hasSubItems = sub.subItems && sub.subItems.length > 0;
                          const subTabKey = `${item.href}:${sub.value}`;
                          const subTabExpanded = expandedSubTabs.includes(subTabKey);

                          return (
                            <div key={sub.value}>
                              <div
                                className={cn(
                                  "flex items-center justify-between px-5 py-2.5 transition-all",
                                  (!subVisible || subDisabled) && "opacity-50"
                                )}
                              >
                                <div className="flex items-center gap-2 pl-16">
                                  {hasSubItems ? (
                                    <button
                                      className="flex items-center gap-2 text-left"
                                      onClick={() => !subDisabled && toggleExpandSubTab(item.href, sub.value)}
                                    >
                                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                                      <span className="text-sm text-muted-foreground">{sub.name}</span>
                                      <span className="text-xs text-muted-foreground ml-1">({sub.subItems!.length})</span>
                                      {subTabExpanded
                                        ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
                                        : <ChevronRight className="w-3 h-3 text-muted-foreground" />
                                      }
                                    </button>
                                  ) : (
                                    <>
                                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                                      <span className="text-sm text-muted-foreground">{sub.name}</span>
                                    </>
                                  )}
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
                                  title={subVisible ? "Ẩn tab này" : "Hiện tab này"}
                                >
                                  {subVisible
                                    ? <ToggleRight className={cn("w-5 h-5", subDisabled ? "text-muted-foreground" : "text-primary")} />
                                    : <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                                  }
                                </Button>
                              </div>
                              {hasSubItems && subTabExpanded && (
                                <div className="divide-y border-t bg-muted/5">
                                  {sub.subItems!.map(si => {
                                    const siVisible = isSubTabItemVisible(item.href, sub.value, si.value);
                                    const siDisabled = subDisabled || !subVisible;
                                    return (
                                      <div
                                        key={si.value}
                                        className={cn(
                                          "flex items-center justify-between px-5 py-2 transition-all",
                                          (!siVisible || siDisabled) && "opacity-50"
                                        )}
                                      >
                                        <div className="flex items-center gap-2 pl-24">
                                          <div className="w-1 h-1 rounded-full bg-muted-foreground/30 shrink-0" />
                                          <span className="text-sm text-muted-foreground">{si.name}</span>
                                          {siDisabled && (
                                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">Ẩn theo tab cha</Badge>
                                          )}
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 shrink-0"
                                          onClick={() => !siDisabled && toggleSubTabItem(item.href, sub.value, si.value)}
                                          disabled={siDisabled}
                                          title={siVisible ? "Ẩn mục này" : "Hiện mục này"}
                                        >
                                          {siVisible
                                            ? <ToggleRight className={cn("w-4 h-4", siDisabled ? "text-muted-foreground" : "text-primary")} />
                                            : <ToggleLeft className="w-4 h-4 text-muted-foreground" />
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
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
                              const hasSubItems = sub.subItems && sub.subItems.length > 0;
                              const subTabKey = `${item.href}:${sub.value}`;
                              const subTabExpanded = expandedSubTabs.includes(subTabKey);

                              return (
                                <div key={sub.value}>
                                  <div
                                    className={cn(
                                      "flex items-center justify-between px-5 py-2.5 transition-all",
                                      (!subVisible || subDisabled) && "opacity-50"
                                    )}
                                  >
                                    <div className="flex items-center gap-2 pl-16">
                                      {hasSubItems ? (
                                        <button
                                          className="flex items-center gap-2 text-left"
                                          onClick={() => !subDisabled && toggleExpandSubTab(item.href, sub.value)}
                                        >
                                          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                                          <span className="text-sm text-muted-foreground">{sub.name}</span>
                                          <span className="text-xs text-muted-foreground ml-1">({sub.subItems!.length})</span>
                                          {subTabExpanded
                                            ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
                                            : <ChevronRight className="w-3 h-3 text-muted-foreground" />
                                          }
                                        </button>
                                      ) : (
                                        <>
                                          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                                          <span className="text-sm text-muted-foreground">{sub.name}</span>
                                        </>
                                      )}
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
                                  {hasSubItems && subTabExpanded && (
                                    <div className="divide-y border-t bg-muted/5">
                                      {sub.subItems!.map(si => {
                                        const siVisible = isSubTabItemVisible(item.href, sub.value, si.value, mod.module);
                                        const siDisabled = subDisabled || !subVisible;
                                        return (
                                          <div
                                            key={si.value}
                                            className={cn(
                                              "flex items-center justify-between px-5 py-2 transition-all",
                                              (!siVisible || siDisabled) && "opacity-50"
                                            )}
                                          >
                                            <div className="flex items-center gap-2 pl-24">
                                              <div className="w-1 h-1 rounded-full bg-muted-foreground/30 shrink-0" />
                                              <span className="text-sm text-muted-foreground">{si.name}</span>
                                              {siDisabled && (
                                                <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">Ẩn theo tab cha</Badge>
                                              )}
                                            </div>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-6 w-6 shrink-0"
                                              onClick={() => !siDisabled && toggleSubTabItem(item.href, sub.value, si.value)}
                                              disabled={siDisabled}
                                              data-testid={`button-toggle-subitem-${item.href.replace(/\//g, "-")}-${sub.value}-${si.value}`}
                                              title={siVisible ? "Ẩn mục này" : "Hiện mục này"}
                                            >
                                              {siVisible
                                                ? <ToggleRight className={cn("w-4 h-4", siDisabled ? "text-muted-foreground" : "text-primary")} />
                                                : <ToggleLeft className="w-4 h-4 text-muted-foreground" />
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

// ─── StorageManager ───────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 0.01) return `${gb.toFixed(3)} GB`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 0.01) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${Math.round(kb)} KB`;
}

function StorageManager() {
  const { toast } = useToast();
  const [quotaInput, setQuotaInput] = useState<string>("");

  const { data, isLoading, refetch } = useQuery<{
    quotaGb: number;
    s3UsedBytes: number;
    dbSizeBytes: number;
  }>({
    queryKey: ["/api/system-settings/storage"],
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data) setQuotaInput(String(data.quotaGb));
  }, [data]);

  const updateQuota = useMutation({
    mutationFn: async (quotaGb: number) => {
      await apiRequest("PUT", "/api/system-settings/storage-quota", { quotaGb });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-settings/storage"] });
      toast({ title: "Thành công", description: "Đã cập nhật giới hạn dung lượng." });
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message || "Không thể cập nhật.", variant: "destructive" });
    },
  });

  const handleSaveQuota = () => {
    const val = parseFloat(quotaInput);
    if (isNaN(val) || val <= 0) {
      toast({ title: "Lỗi", description: "Dung lượng phải là số dương (đơn vị GB).", variant: "destructive" });
      return;
    }
    updateQuota.mutate(val);
  };

  const quotaGb = data?.quotaGb ?? 10;
  const s3Bytes = data?.s3UsedBytes ?? 0;
  const dbBytes = data?.dbSizeBytes ?? 0;
  const totalBytes = s3Bytes + dbBytes;
  const quotaBytes = quotaGb * 1024 * 1024 * 1024;
  const usagePercent = Math.min(100, Math.round((totalBytes / quotaBytes) * 100));
  const isOverQuota = totalBytes > quotaBytes;

  return (
    <div className="space-y-4">
      {/* Cấu hình giới hạn */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h3 className="font-semibold text-base mb-1">Tổng dung lượng được sử dụng</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Đặt giới hạn dung lượng tối đa cho trung tâm (tính theo GB). Hệ thống sẽ cảnh báo khi vượt ngưỡng.
            </p>
            <div className="flex items-center gap-2 max-w-xs">
              <Input
                type="number"
                min={0.1}
                step={0.5}
                value={quotaInput}
                onChange={(e) => setQuotaInput(e.target.value)}
                placeholder="VD: 10"
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">GB</span>
              <Button
                size="sm"
                onClick={handleSaveQuota}
                disabled={updateQuota.isPending}
              >
                {updateQuota.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Lưu"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Thống kê dung lượng */}
      <Card>
        <CardContent className="p-6 space-y-5">
          <h3 className="font-semibold text-base">Thống kê dung lượng hiện tại</h3>

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Đang tải...
            </div>
          ) : (
            <>
              {/* Dung lượng hệ thống */}
              <div className="flex items-start justify-between gap-4 py-3 border-b">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-md bg-blue-50 flex items-center justify-center shrink-0">
                    <Server className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Dung lượng hệ thống</p>
                    <p className="text-xs text-muted-foreground">Dữ liệu nhập vào hệ thống (học viên, lớp học, hóa đơn...)</p>
                  </div>
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0">{formatBytes(dbBytes)}</span>
              </div>

              {/* Dung lượng file upload */}
              <div className="flex items-start justify-between gap-4 py-3 border-b">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-md bg-orange-50 flex items-center justify-center shrink-0">
                    <Upload className="w-4 h-4 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Dung lượng file upload</p>
                    <p className="text-xs text-muted-foreground">Tài liệu, hình ảnh, video đã tải lên S3</p>
                  </div>
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0">{formatBytes(s3Bytes)}</span>
              </div>

              {/* Tổng + thanh tiến trình */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Tổng dung lượng sử dụng</span>
                  <span className={cn("text-sm font-bold tabular-nums", isOverQuota ? "text-destructive" : "text-foreground")}>
                    {formatBytes(totalBytes)} / {quotaGb} GB
                  </span>
                </div>
                <div className="relative h-3 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      isOverQuota ? "bg-destructive" : usagePercent >= 80 ? "bg-orange-500" : "bg-primary"
                    )}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{usagePercent}% đã sử dụng</span>
                  <span className="text-xs text-muted-foreground">Còn lại: {formatBytes(Math.max(0, quotaBytes - totalBytes))}</span>
                </div>

                {isOverQuota && (
                  <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive mt-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <p className="text-sm font-medium">
                      Dung lượng đã vượt quá giới hạn {quotaGb} GB. Vui lòng nâng cấp gói hoặc xóa bớt dữ liệu.
                    </p>
                  </div>
                )}
                {!isOverQuota && usagePercent >= 80 && (
                  <div className="flex items-center gap-2 p-3 rounded-md bg-orange-50 border border-orange-200 text-orange-700 mt-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <p className="text-sm font-medium">
                      Dung lượng sắp đầy ({usagePercent}%). Cần chú ý quản lý dữ liệu.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const PERM_COLS = [
  { key: "canView", label: "Xem" },
  { key: "canViewAll", label: "Xem all" },
  { key: "canCreate", label: "Thêm" },
  { key: "canEdit", label: "Sửa" },
  { key: "canDelete", label: "Xoá" },
] as const;

const VIEW_ONLY_COLS = [
  { key: "canView" as const, label: "Xem" },
];

const DASHBOARD_REPORTS = [
  { value: "thu-chi", name: "Báo cáo Thu - Chi" },
  { value: "phan-bo", name: "Phân bổ Thu - Chi" },
  { value: "doanh-thu-lop-hoc", name: "Doanh thu lớp học" },
  { value: "doanh-thu-nhan-su", name: "Doanh thu nhân sự" },
  { value: "phan-bo-hoc-phi", name: "Phân bổ học phí" },
  { value: "thoi-gian-giang-day", name: "Thời gian giảng dạy" },
  { value: "hoc-vien-moi", name: "Báo cáo Học viên mới" },
  { value: "chuyen-doi", name: "Báo cáo Chuyển đổi" },
  { value: "lich-su-cuoc-goi", name: "Lịch sử cuộc gọi" },
];

type PermKey = typeof PERM_COLS[number]["key"];

type PermMap = Record<string, {
  canView: boolean;
  canViewAll: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}>;

type RolePermissionRecord = {
  roleId: string;
  resource: string;
  canView: boolean;
  canViewAll: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

function defaultPerm(resource?: string, deptName?: string) {
  if (resource === "/tasks#list" && deptName !== "Phòng Khách hàng") {
    return { canView: true, canViewAll: false, canCreate: false, canEdit: false, canDelete: false };
  }
  if (resource === "/news-feed") {
    return { canView: true, canViewAll: false, canCreate: false, canEdit: false, canDelete: false };
  }
  return { canView: false, canViewAll: false, canCreate: false, canEdit: false, canDelete: false };
}

// /chat cho phép canView + canCreate + canDelete (không có canViewAll, canEdit)
const CHAT_ALLOWED_PERM_KEYS = new Set<PermKey>(["canView", "canCreate", "canDelete"]);

const READ_ONLY_RESOURCES = new Set([
  "/learning-overview", "/shifts#board", "/", "/zalo",
  "/#khach-hang", "/#dao-tao", "/#tai-chinh", "/#bao-cao",
  "/#bao-cao/thu-chi", "/#bao-cao/phan-bo", "/#bao-cao/doanh-thu-lop-hoc",
  "/#bao-cao/doanh-thu-nhan-su", "/#bao-cao/phan-bo-hoc-phi",
  "/#bao-cao/thoi-gian-giang-day", "/#bao-cao/hoc-vien-moi", "/#bao-cao/chuyen-doi",
  "/#bao-cao/lich-su-cuoc-goi",
]);
const NO_EDIT_DELETE_RESOURCES = new Set(["/attendance"]);
const NO_DELETE_RESOURCES = new Set([`${SETTINGS_HREF}#permissions`]);
const NO_CREATE_RESOURCES = new Set(["/assessments#results"]);
const VIEW_ONLY_RESOURCES = new Set(["/my-space/invoices", "/my-space/payroll"]);
const EDIT_ONLY_RESOURCES = new Set(["/customers/crm-config#required-info"]);

const PERM_DESCRIPTIONS: Record<string, string> = {
  // Standalone
  "/": "Xem: nhân sự có quyền truy cập trang Dashboard tổng quan hệ thống.",
  "/chat": "Xem: nhân sự có quyền truy cập và sử dụng tính năng nhắn tin nội bộ. Thêm: nhân sự có quyền thêm thành viên vào nhóm chat. Xoá: nhân sự có quyền xoá thành viên khỏi nhóm chat.",
  "/zalo": "Xem: nhân sự có quyền truy cập và quản lý trang Zalo OA kết nối.",
  "/news-feed": "Xem / Xem all: nhân sự xem bài viết thuộc cơ sở mình. Thêm: được đăng bài viết mới. Sửa: được chỉnh sửa bài viết, ghim và bỏ ghim. Xoá: được xoá bài viết.",
  // Dashboard tabs
  "/#khach-hang": "Xem / Xem all: nhân sự có quyền xem tab Khách hàng trong Dashboard. Bỏ tích để ẩn tab.",
  "/#dao-tao": "Xem / Xem all: nhân sự có quyền xem tab Đào tạo trong Dashboard. Bỏ tích để ẩn tab.",
  "/#tai-chinh": "Xem / Xem all: nhân sự có quyền xem tab Tài chính trong Dashboard. Bỏ tích để ẩn tab.",
  "/#bao-cao": "Xem / Xem all: nhân sự có quyền xem tab Báo cáo trong Dashboard. Bỏ tích để ẩn tab.",
  // Dashboard reports
  "/#bao-cao/thu-chi": "Xem / Xem all: nhân sự có quyền xem báo cáo Thu - Chi.",
  "/#bao-cao/phan-bo": "Xem / Xem all: nhân sự có quyền xem báo cáo Phân bổ Thu - Chi.",
  "/#bao-cao/doanh-thu-lop-hoc": "Xem / Xem all: nhân sự có quyền xem báo cáo Doanh thu lớp học.",
  "/#bao-cao/doanh-thu-nhan-su": "Xem / Xem all: nhân sự có quyền xem báo cáo Doanh thu nhân sự.",
  "/#bao-cao/phan-bo-hoc-phi": "Xem / Xem all: nhân sự có quyền xem báo cáo Phân bổ học phí.",
  "/#bao-cao/thoi-gian-giang-day": "Xem / Xem all: nhân sự có quyền xem báo cáo Thời gian giảng dạy.",
  "/#bao-cao/hoc-vien-moi": "Xem / Xem all: nhân sự có quyền xem báo cáo Học viên mới.",
  "/#bao-cao/chuyen-doi": "Xem / Xem all: nhân sự có quyền xem báo cáo Chuyển đổi.",
  "/#bao-cao/lich-su-cuoc-goi": "Xem / Xem all: nhân sự có quyền xem báo cáo lịch sử cuộc gọi Omicall.",
  // MY SPACE
  "/my-space/calendar": "Lịch cá nhân luôn hiển thị mặc định cho tất cả nhân sự trong phòng ban hệ thống.",
  "/my-space/assignments": "Bài tập luôn hiển thị mặc định cho tất cả nhân sự và học viên trong phòng ban hệ thống.",
  "/my-space/score-sheet": "Bảng điểm luôn hiển thị mặc định cho tất cả nhân sự và học viên trong phòng ban hệ thống.",
  "/my-space/invoices": "Xem: học viên / nhân sự có quyền xem hoá đơn của bản thân. Bỏ tích quyền Xem để ẩn tab Hoá đơn của tôi.",
  "/my-space/payroll": "Xem: nhân sự có quyền xem bảng lương cá nhân của mình. Bỏ tích quyền Xem để ẩn tab Bảng lương của tôi.",
  // CÔNG VIỆC
  "/tasks#list": "Xem luôn bật mặc định cho tất cả nhân sự. Xem all: nhân sự có quyền xem tất cả công việc thuộc cơ sở. Thêm: nhân sự có quyền tạo mới công việc.",
  "/tasks#config": "Xem: nhân sự có quyền xem cấu hình công việc. Xem all: nhân sự có quyền xem tất cả cấu hình. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá loại công việc, trạng thái và mức độ ưu tiên.",
  // CRM
  "/customers": "Xem: nhân sự có quyền xem khách hàng do mình phụ trách. Xem all: nhân sự có quyền xem tất cả khách hàng thuộc cơ sở. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá thông tin khách hàng.",
  "/customers/crm-config#relationships": "Xem: nhân sự có quyền xem mối quan hệ do mình tạo. Xem all: nhân sự có quyền xem tất cả mối quan hệ. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá danh sách mối quan hệ khách hàng.",
  "/customers/crm-config#reject-reasons": "Xem: nhân sự có quyền xem danh sách lý do từ chối. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá lý do từ chối tiếp nhận khách hàng.",
  "/customers/crm-config#sources": "Xem: nhân sự có quyền xem danh sách nguồn khách hàng. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá nguồn tiếp cận khách hàng (Facebook, Zalo, v.v.).",
  "/customers/crm-config#additional-info": "Xem: nhân sự có quyền xem trường thông tin bổ sung. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá trường thông tin tùy chỉnh trong hồ sơ khách hàng.",
  "/customers/crm-config#required-info": "Sửa: nhân sự có quyền xem tab Thông tin bắt buộc và tích chọn các trường bắt buộc khi tạo khách hàng mới.",
  // HRM
  "/staff": "Xem: nhân sự có quyền xem hồ sơ nhân sự do mình quản lý. Xem all: nhân sự có quyền xem tất cả hồ sơ nhân sự thuộc cơ sở. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá hồ sơ nhân sự.",
  "/shifts#register": "Xem: nhân sự có quyền xem đăng ký ca dạy của bản thân. Xem all: nhân sự có quyền xem đăng ký ca của tất cả nhân sự. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá đăng ký ca dạy.",
  "/shifts#board": "Xem / Xem all: nhân sự có quyền xem bảng phân công ca làm việc của toàn bộ nhân sự (chỉ đọc, không chỉnh sửa).",
  "/shifts#assign": "Xem: nhân sự có quyền xem lịch phân ca. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá phân công ca làm việc cho nhân sự.",
  "/shifts#config": "Xem: nhân sự có quyền xem danh sách ca làm việc. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá cấu hình ca làm việc trong hệ thống.",
  "/teacher-salary#salary-tables": "Xem: nhân sự có quyền xem bảng lương đứng lớp của bản thân. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá bảng lương đứng lớp.",
  "/teacher-salary#salary-packages": "Xem: nhân sự có quyền xem danh sách gói lương. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá các gói lương đứng lớp.",
  "/teacher-salary#staff-config": "Xem: nhân sự có quyền xem cấu hình lương theo nhân sự. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá cấu hình gói lương riêng cho từng giáo viên / trợ giảng.",
  // EDUCATION
  "/learning-overview#overview": "Xem / Xem all: nhân sự có quyền xem tổng quan tình trạng học tập của học viên (chỉ đọc, không chỉnh sửa).",
  "/learning-overview#students-ending": "Xem / Xem all: nhân sự có quyền xem danh sách học viên sắp hết lịch học (chỉ đọc, không chỉnh sửa).",
  "/learning-overview#classes-ending": "Xem / Xem all: nhân sự có quyền xem danh sách lớp học sắp kết thúc (chỉ đọc, không chỉnh sửa).",
  "/learning-overview#cho-bu-bao-luu": "Xem / Xem all: nhân sự có quyền xem danh sách học viên chờ bù và bảo lưu (chỉ đọc, không chỉnh sửa).",
  "/learning-overview#bang-diem": "Xem / Xem all: nhân sự có quyền xem bảng điểm tổng hợp của tất cả học viên (chỉ đọc, không chỉnh sửa).",
  "/learning-overview#bai-tap-ve-nha": "Xem / Xem all: nhân sự có quyền xem danh sách bài tập về nhà theo lớp (chỉ đọc, không chỉnh sửa).",
  "/learning-overview#nhan-xet-hoc-vien": "Xem / Xem all: nhân sự có quyền xem nhận xét học viên theo buổi học (chỉ đọc, không chỉnh sửa).",
  "/learning-overview#cham-cong-giao-vien": "Xem / Xem all: nhân sự có quyền xem chấm công giáo viên theo buổi dạy (chỉ đọc, không chỉnh sửa).",
  "/learning-overview#xin-nghi": "Xem: nhân sự có quyền xem và tạo đơn xin nghỉ cho học viên theo cơ sở, học viên và lịch học được chọn.",
  "/classes": "Xem: nhân sự có quyền xem lớp học mình phụ trách. Xem all: nhân sự có quyền xem tất cả lớp học thuộc cơ sở. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá lớp học, phân công giáo viên và học viên.",
  "/schedule": "Xem: nhân sự có quyền xem lịch học. Xem all: nhân sự có quyền xem tất cả lịch. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá lịch học của các lớp.",
  "/attendance": "Xem: nhân sự có quyền xem điểm danh buổi học mình phụ trách. Xem all: nhân sự có quyền xem tất cả điểm danh. Thêm / Sửa: nhân sự có quyền thêm mới và chỉnh sửa điểm danh học viên.",
  "/courses#courses": "Xem: nhân sự có quyền xem danh sách khoá học. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá nội dung khoá học.",
  "/courses#programs": "Xem: nhân sự có quyền xem chương trình học. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá chương trình học và phân bổ nội dung.",
  "/courses#library": "Xem: nhân sự có quyền xem thư viện nội dung. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá tài liệu, bài giảng trong thư viện.",
  "/assessments#list": "Xem: nhân sự có quyền xem danh sách bài kiểm tra. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá bài kiểm tra.",
  "/assessments#question-bank": "Xem: nhân sự có quyền xem ngân hàng câu hỏi. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá câu hỏi theo chủ đề và bộ môn.",
  "/assessments#results": "Xem / Xem all: nhân sự có quyền xem kết quả bài làm của học viên (chỉ đọc, không thêm mới hoặc xoá).",
  "/education-config#classrooms": "Xem: nhân sự có quyền xem danh sách phòng học. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá phòng học tại các cơ sở.",
  "/education-config#subjects": "Xem: nhân sự có quyền xem danh sách bộ môn. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá danh mục bộ môn giảng dạy.",
  "/education-config#evaluation": "Xem: nhân sự có quyền xem tiêu chí đánh giá. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá bộ tiêu chí đánh giá học viên.",
  "/education-config#shifts": "Xem: nhân sự có quyền xem ca học. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá ca học trong ngày.",
  "/education-config#attendance-fee": "Xem: nhân sự có quyền xem quy tắc trừ học phí. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá cấu hình trừ học phí khi học viên vắng mặt.",
  "/education-config#score-sheets": "Xem: nhân sự có quyền xem bảng điểm mẫu. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá mẫu bảng điểm.",
  "/education-config#online-learning": "Xem: nhân sự có quyền xem cấu hình học online. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá cấu hình nền tảng học trực tuyến.",
  // STORE (KHO)
  "/store#nhap-kho": "Xem: nhân sự có quyền xem phiếu nhập kho. Xem all: nhân sự có quyền xem tất cả phiếu nhập kho thuộc cơ sở. Thêm / Sửa / Xoá: nhân sự có quyền tạo, chỉnh sửa và xoá phiếu nhập hàng vào kho.",
  "/store#xuat-kho": "Xem: nhân sự có quyền xem phiếu xuất kho. Xem all: nhân sự có quyền xem tất cả phiếu xuất. Thêm / Sửa / Xoá: nhân sự có quyền tạo, chỉnh sửa và xoá phiếu xuất hàng khỏi kho.",
  "/store#chuyen-kho": "Xem: nhân sự có quyền xem phiếu chuyển kho. Xem all: nhân sự có quyền xem tất cả phiếu chuyển. Thêm / Sửa / Xoá: nhân sự có quyền tạo, chỉnh sửa và xoá phiếu điều chuyển hàng giữa các kho.",
  "/store#ton-kho": "Xem / Xem all: nhân sự có quyền xem báo cáo tồn kho theo sản phẩm và cơ sở (chỉ đọc, không chỉnh sửa).",
  "/store#san-pham": "Xem: nhân sự có quyền xem danh sách sản phẩm. Xem all: nhân sự có quyền xem tất cả sản phẩm. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá thông tin sản phẩm trong kho.",
  "/store#cau-hinh": "Xem: nhân sự có quyền xem cấu hình kho. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá cấu hình danh mục, đơn vị tính và các thiết lập kho hàng.",
  // CRM - Notification logs
  "/notification-logs": "Xem: nhân sự có quyền xem lịch sử thông báo liên quan đến khách hàng của mình. Xem all: nhân sự có quyền xem tất cả lịch sử thông báo thuộc cơ sở.",
  // FINANCE
  "/invoices": "Xem: nhân sự có quyền xem hoá đơn liên quan đến mình. Xem all: nhân sự có quyền xem tất cả hoá đơn thuộc cơ sở. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá hoá đơn học phí.",
  "/finance-config#promotions": "Xem: nhân sự có quyền xem danh sách khuyến mãi / phụ thu. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá chương trình khuyến mãi và khoản phụ thu.",
  "/finance-config#categories": "Xem: nhân sự có quyền xem danh mục thu chi. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá danh mục thu và chi trong hệ thống tài chính.",
  "/finance-config#voucher": "Xem: nhân sự có quyền xem cấu hình voucher. Xem all: nhân sự có quyền xem tất cả cấu hình voucher.",
  // SETTING
  "/settings#locations": "Xem: nhân sự có quyền xem danh sách cơ sở. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: quản trị viên có quyền thêm mới, chỉnh sửa và xoá thông tin cơ sở.",
  "/settings#departments": "Xem: nhân sự có quyền xem danh sách phòng ban và vai trò. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: quản trị viên có quyền thêm mới, chỉnh sửa và xoá phòng ban và vai trò nhân sự.",
  "/settings#system": "Xem: nhân sự có quyền xem cấu hình hệ thống. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: quản trị viên có quyền thêm mới, chỉnh sửa và xoá các thông số cấu hình hệ thống.",
  "/settings#permissions": "Xem: nhân sự có quyền xem phân quyền các vai trò. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa: quản trị viên có quyền cấp và thu hồi quyền truy cập cho từng vai trò (không thể xoá bản ghi quyền).",
  "/settings#ai-accounts": "Xem: nhân sự có quyền xem danh sách tài khoản AI. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: quản trị viên có quyền thêm mới, chỉnh sửa và xoá tài khoản AI (OpenAI, Gemini) trong hệ thống.",
  "/settings#providers": "Xem: nhân sự có quyền xem danh sách kết nối nhà cung cấp. Xem all: nhân sự có quyền xem tất cả. Thêm / Sửa / Xoá: quản trị viên có quyền thêm mới, chỉnh sửa và xoá kết nối các nhà cung cấp dịch vụ bên ngoài.",
  "/settings#holidays": "Xem / Xem all: nhân sự có quyền xem danh sách ngày nghỉ lễ. Thêm / Sửa / Xoá: quản trị viên có quyền thêm mới, chỉnh sửa và xoá các ngày nghỉ lễ trong năm.",
  // HRM CONTINUED
  "/don-tu": "Xem: nhân sự có quyền xem đơn từ của bản thân. Xem all: nhân sự có quyền xem tất cả đơn từ thuộc cơ sở. Thêm: nhân sự có quyền tạo đơn mới. Sửa: nhân sự có quyền duyệt hoặc từ chối đơn từ. Xoá: nhân sự có quyền xoá đơn từ.",
  "/cham-cong": "Xem: nhân sự có quyền xem bảng chấm công của bản thân. Xem all: nhân sự có quyền xem bảng chấm công của tất cả nhân sự. Sửa: nhân sự có quyền tải lên file chấm công và chấm công hàng loạt.",
  "/tong-luong#salary-sheets": "Xem / Xem all: nhân sự có quyền xem danh sách bảng lương. Thêm: nhân sự có quyền tạo bảng lương mới. Sửa: nhân sự có quyền chốt / mở lại bảng lương và chi lương. Xoá: nhân sự có quyền xoá bảng lương nháp.",
  "/tong-luong#staff-config": "Xem / Xem all: nhân sự có quyền xem cấu hình lương nhân sự. Thêm / Sửa / Xoá: nhân sự có quyền thêm mới, chỉnh sửa và xoá cấu hình lương riêng cho từng nhân sự.",
  "/tong-luong#default-config": "Xem: nhân sự có quyền xem cấu hình lương mặc định. Sửa: nhân sự có quyền chỉnh sửa các thông số cấu hình lương mặc định và bảng thuế TNCN.",
};

type PermissionsManagerProps = {
  canViewAll: boolean;
  canCreate: boolean;
  canEdit: boolean;
};

function PermissionsManager({ canViewAll, canCreate, canEdit }: PermissionsManagerProps) {
  const { toast } = useToast();
  const { data: departments } = useDepartments();
  const { data: myPerms } = useMyPermissions();
  const { isModuleVisible, isItemVisible, isSubTabVisible, isSubTabItemVisible } = useSidebarVisibility();

  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<string[]>([]);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [localPerms, setLocalPerms] = useState<PermMap>({});
  const [permissionSearch, setPermissionSearch] = useState("");
  const pendingPermissionUpdates = useRef<Record<string, { roleId: string; perms: PermMap[string] }>>({});
  const permissionSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const permissionSessionId = useRef<string | null>(null);

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
  const selectedRole = roles.find(r => r.id === selectedRoleId);
  const STUDENT_SYSTEM_ROLE_NAMES = ["Học viên", "Phụ huynh"];
  const STUDENT_DEFAULT_RESOURCES = new Set(["/my-space/calendar", "/my-space/assignments", "/my-space/score-sheet"]);
  const isStudentSystemRole = selectedDept?.isSystem === true && STUDENT_SYSTEM_ROLE_NAMES.includes(selectedRole?.name ?? "");

  const { data: fetchedPerms, isLoading: permsLoading } = useQuery<RolePermissionRecord[]>({
    queryKey: ["/api/role-permissions", selectedRoleId],
    enabled: !!selectedRoleId,
    queryFn: async () => {
      const res = await fetch(`/api/role-permissions?roleId=${selectedRoleId}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch permissions");
      return res.json();
    },
  });

  // localPerms chỉ lưu các thay đổi OPTIMISTIC (người dùng vừa click).
  // Khi selectedRoleId thay đổi, xoá overlay để không còn thay đổi tạm từ role cũ.
  // Dữ liệu thực được đọc trực tiếp từ fetchedPerms trong getResourcePerm — không cần sync.
  useEffect(() => {
    setLocalPerms({});
  }, [selectedRoleId]);

  const savePerms = useMutation({
    mutationFn: async ({ roleId, sessionId, updates }: { roleId: string; sessionId: string; updates: Record<string, PermMap[string]> }) => {
      const permissions = Object.entries(updates).map(([resource, perms]) => {
        // VIEW_ONLY / EDIT_ONLY resources always persist only their supported flags.
        const effectivePerms = VIEW_ONLY_RESOURCES.has(resource)
          ? { canView: perms.canView, canViewAll: false, canCreate: false, canEdit: false, canDelete: false }
          : EDIT_ONLY_RESOURCES.has(resource)
          ? { canView: false, canViewAll: false, canCreate: false, canEdit: perms.canEdit, canDelete: false }
          : perms;
        return { resource, ...effectivePerms };
      });
      const res = await fetch("/api/role-permissions/batch", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ roleId, sessionId, permissions }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json() as Promise<RolePermissionRecord[]>;
    },
    onSuccess: (savedPermissions) => {
      const roleId = savedPermissions[0]?.roleId;
      if (!roleId) return;
      queryClient.setQueryData<RolePermissionRecord[]>(["/api/role-permissions", roleId], current => {
        const permissions = [...(current ?? [])];
        for (const saved of savedPermissions) {
          const index = permissions.findIndex(permission => permission.resource === saved.resource);
          if (index === -1) permissions.push(saved);
          else permissions[index] = saved;
        }
        return permissions;
      });
      setLocalPerms(prev => {
        const next = { ...prev };
        for (const saved of savedPermissions) delete next[saved.resource];
        return next;
      });
      // Đánh dấu my-permissions đã cũ nhưng không refetch ngay sau từng checkbox.
      queryClient.invalidateQueries({
        queryKey: ["/api/my-permissions"],
        refetchType: "none",
      });
    },
    onError: () => {
      toast({ title: "Lỗi", description: "Không thể lưu quyền.", variant: "destructive" });
    },
  });

  const flushPermissionUpdates = () => {
    if (permissionSaveTimer.current) {
      clearTimeout(permissionSaveTimer.current);
      permissionSaveTimer.current = null;
    }
    const pending = pendingPermissionUpdates.current;
    pendingPermissionUpdates.current = {};
    const byRole = new Map<string, Record<string, PermMap[string]>>();
    for (const [resource, update] of Object.entries(pending)) {
      const roleUpdates = byRole.get(update.roleId) ?? {};
      roleUpdates[resource] = update.perms;
      byRole.set(update.roleId, roleUpdates);
    }
    for (const [roleId, updates] of byRole) {
      const sessionId = permissionSessionId.current ?? crypto.randomUUID();
      permissionSessionId.current = sessionId;
      savePerms.mutate({ roleId, sessionId, updates });
    }
  };

  const queuePermissionUpdate = (resource: string, perms: PermMap[string]) => {
    if (!selectedRoleId) return;
    if (!permissionSessionId.current) permissionSessionId.current = crypto.randomUUID();
    pendingPermissionUpdates.current[resource] = { roleId: selectedRoleId, perms };
    if (permissionSaveTimer.current) clearTimeout(permissionSaveTimer.current);
    permissionSaveTimer.current = setTimeout(flushPermissionUpdates, 600);
  };

  const handleToggle = (resource: string, permKey: PermKey) => {
    if (!selectedRoleId) return;
    const current = getResourcePerm(resource);
    const toggling = !current[permKey];
    if (toggling && !canCreate) {
      toast({ title: "Không có quyền", description: "Bạn không có quyền cấp thêm quyền.", variant: "destructive" });
      return;
    }
    if (!toggling && !canEdit) {
      toast({ title: "Không có quyền", description: "Bạn không có quyền thu hồi quyền.", variant: "destructive" });
      return;
    }
    if (VIEW_ONLY_RESOURCES.has(resource) && permKey !== "canView") {
      toast({ title: "Chỉ hỗ trợ quyền Xem", description: "Trang này chỉ hỗ trợ quyền Xem.", variant: "destructive" });
      return;
    }
    if (EDIT_ONLY_RESOURCES.has(resource) && permKey !== "canEdit") {
      toast({ title: "Chỉ hỗ trợ quyền Sửa", description: "Tính năng này chỉ hỗ trợ quyền Sửa.", variant: "destructive" });
      return;
    }
    if (resource === "/chat" && !CHAT_ALLOWED_PERM_KEYS.has(permKey)) {
      toast({ title: "Không khả dụng", description: "Chat chỉ hỗ trợ quyền Xem, Thêm (thêm thành viên) và Xoá (xoá thành viên).", variant: "destructive" });
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
    if (NO_CREATE_RESOURCES.has(resource) && permKey === "canCreate") {
      toast({ title: "Không khả dụng", description: "Trang này không hỗ trợ quyền Thêm.", variant: "destructive" });
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
    queuePermissionUpdate(resource, updated);
  };

  // localPerms = overlay optimistic; fetchedPerms = dữ liệu gốc từ server/cache.
  // Khi remount, localPerms rỗng nhưng fetchedPerms có cache → vẫn hiển thị đúng.
  const getResourcePerm = (resource: string): PermMap[string] => {
    if (resource in localPerms) return localPerms[resource];
    const fromServer = fetchedPerms?.find(p => p.resource === resource);
    if (fromServer) return { canView: fromServer.canView, canViewAll: fromServer.canViewAll, canCreate: fromServer.canCreate, canEdit: fromServer.canEdit, canDelete: fromServer.canDelete };
    return defaultPerm(resource, selectedDept?.name);
  };

  const modules = navigation
    .filter((e): e is Extract<typeof navigation[number], { module: string }> => "module" in e)
    .filter(mod => isModuleVisible(mod.module))
    .map(mod => ({
      ...mod,
      items: mod.items
        .filter(item => isItemVisible(item.href, mod.module))
        .map(item => ({
          ...item,
          subTabs: item.subTabs
            ?.filter(sub => isSubTabVisible(item.href, sub.value, mod.module))
            .map(sub => ({
              ...sub,
              subItems: sub.subItems?.filter(subItem =>
                isSubTabItemVisible(item.href, sub.value, subItem.value, mod.module)
              ),
            })),
        })),
    }));
  const standaloneItems = navigation
    .filter((e): e is Extract<typeof navigation[number], { href: string }> => "href" in e)
    .filter(item => isItemVisible(item.href))
    .map(item => ({
      ...item,
      subTabs: item.subTabs
        ?.filter(sub => isSubTabVisible(item.href, sub.value))
        .map(sub => ({
          ...sub,
          subItems: sub.subItems?.filter(subItem =>
            isSubTabItemVisible(item.href, sub.value, subItem.value)
          ),
        })),
    }));

  const hasAnyPermForResource = (resource: string): boolean => {
    if (!myPerms || myPerms.isSuperAdmin) return true;
    const p = myPerms.permissions[resource];
    return !!(p?.canView || p?.canViewAll || p?.canCreate || p?.canEdit || p?.canDelete);
  };

  const navItemHasPerm = (item: { href: string; subTabs?: { value: string }[] }): boolean => {
    if (!myPerms || myPerms.isSuperAdmin) return true;
    if (item.subTabs && item.subTabs.length > 0) {
      return item.subTabs.some(sub => hasAnyPermForResource(`${item.href}#${sub.value}`));
    }
    return hasAnyPermForResource(item.href);
  };

  const normalizedPermissionSearch = permissionSearch.trim().toLocaleLowerCase();
  const matchesPermission = (name: string, resource: string) => {
    if (!normalizedPermissionSearch) return true;
    return `${name} ${resource} ${PERM_DESCRIPTIONS[resource] ?? ""}`
      .toLocaleLowerCase()
      .includes(normalizedPermissionSearch);
  };

  const itemMatchesPermission = (item: { name: string; href: string; subTabs?: { value: string; name: string }[] }) =>
    !normalizedPermissionSearch ||
    matchesPermission(item.name, item.href) ||
    (item.subTabs ?? []).some(sub => matchesPermission(sub.name, `${item.href}#${sub.value}`)) ||
    (item.href === "/" && DASHBOARD_REPORTS.some(report =>
      matchesPermission(report.name, `/#bao-cao/${report.value}`)
    ));

  const getPermittedSubTabs = (item: { name: string; href: string; subTabs?: { value: string; name: string }[] }) => {
    const permitted = (!myPerms || myPerms.isSuperAdmin)
      ? (item.subTabs ?? [])
      : (item.subTabs ?? []).filter(sub => hasAnyPermForResource(`${item.href}#${sub.value}`));
    if (!normalizedPermissionSearch || matchesPermission(item.name, item.href)) return permitted;
    return permitted.filter(sub => matchesPermission(sub.name, `${item.href}#${sub.value}`));
  };

  const filteredModules = (!myPerms || myPerms.isSuperAdmin) ? modules : modules
    .map(mod => ({ ...mod, items: mod.items.filter(item => navItemHasPerm(item)) }))
    .filter(mod => mod.items.length > 0);

  const filteredStandaloneItems = (!myPerms || myPerms.isSuperAdmin)
    ? standaloneItems
    : standaloneItems.filter(item => navItemHasPerm(item));

  const permissionFilteredModules = filteredModules
    .map(mod => ({
      ...mod,
      items: mod.items.filter(item => itemMatchesPermission(item)),
    }))
    .filter(mod => mod.items.length > 0);

  const permissionFilteredStandaloneItems = filteredStandaloneItems.filter(item => itemMatchesPermission(item));

  const getAllowedKeysForResource = (resource: string, hasSubTabs: boolean): PermKey[] => {
    if (hasSubTabs) return [];
    return PERM_COLS.map(c => c.key).filter(k => {
      if (VIEW_ONLY_RESOURCES.has(resource) && k !== "canView") return false;
      if (READ_ONLY_RESOURCES.has(resource) && (k === "canCreate" || k === "canEdit" || k === "canDelete")) return false;
      if (NO_EDIT_DELETE_RESOURCES.has(resource) && (k === "canEdit" || k === "canDelete")) return false;
      if (NO_DELETE_RESOURCES.has(resource) && k === "canDelete") return false;
      return true;
    });
  };

  const getAllowedKeysForSubResource = (resource: string): PermKey[] => {
    return PERM_COLS.map(c => c.key).filter(k => {
      if (NO_DELETE_RESOURCES.has(resource) && k === "canDelete") return false;
      if (NO_CREATE_RESOURCES.has(resource) && k === "canCreate") return false;
      if (EDIT_ONLY_RESOURCES.has(resource) && k !== "canEdit") return false;
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
      const current = getResourcePerm(resource);
      const updated = { ...current };
      for (const col of PERM_COLS) {
        updated[col.key] = value && allowedKeys.includes(col.key);
      }
      updates[resource] = updated;
    }
    setLocalPerms(prev => ({ ...prev, ...updates }));
    for (const [resource, perms] of Object.entries(updates)) {
      queuePermissionUpdate(resource, perms);
    }
  };

  const handleSelectDept = (deptId: string) => {
    flushPermissionUpdates();
    permissionSessionId.current = crypto.randomUUID();
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
    <div className="flex border rounded-xl overflow-hidden bg-background h-[calc(100vh-160px)]">
      {/* Left sidebar: Departments + Roles */}
      <div className="w-56 shrink-0 border-r bg-muted/20 flex flex-col">
        <div className="px-4 py-3 border-b bg-muted/30">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Phòng ban & Vai trò</p>
          <p className="text-xs text-muted-foreground mt-0.5">Chọn vai trò để phân quyền</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {(!displayedDepts || displayedDepts.length === 0) && (
            <p className="text-sm text-muted-foreground italic p-4">Chưa có phòng ban nào. Hãy tạo ở tab Phòng ban & Vai trò.</p>
          )}
          {displayedDepts?.map(dept => (
            <div key={dept.id}>
              <button
                data-testid={`button-dept-${dept.id}`}
                onClick={() => handleSelectDept(dept.id)}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-2.5 text-sm font-semibold text-left transition-colors border-b border-border/40 hover:bg-muted/30",
                  selectedDeptId === dept.id
                    ? "text-orange-500"
                    : "text-foreground"
                )}
              >
                {selectedDeptId === dept.id
                  ? <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                  : <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                }
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{dept.name}</span>
              </button>
              {selectedDeptId === dept.id && (
                <div className="bg-muted/10">
                  {dept.roles.length === 0 && (
                    <p className="text-xs text-muted-foreground italic pl-10 py-2">Chưa có vai trò nào.</p>
                  )}
                  {dept.roles.map((role, idx) => (
                    <button
                      key={role.id}
                      data-testid={`button-role-${role.id}`}
                      onClick={() => { flushPermissionUpdates(); permissionSessionId.current = crypto.randomUUID(); setSelectedRoleId(role.id); setLocalPerms({}); }}
                      className={cn(
                        "flex items-center gap-2 w-[calc(100%-0.5rem)] mx-1 pr-3 py-1.5 text-xs text-left transition-colors rounded-md",
                        selectedRoleId === role.id
                          ? "border border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                          : cn(
                              "border border-transparent text-foreground hover:bg-muted/30",
                              idx < dept.roles.length - 1 ? "border-b-border/10" : ""
                            ),
                      )}
                    >
                      <div className="flex items-center shrink-0 pl-4" style={{ width: "2.25rem" }}>
                        <div className="w-px h-3 bg-border/60 mr-1" />
                        <div className="w-1.5 h-px bg-border/60" />
                      </div>
                      <UserCog className="w-3 h-3 shrink-0 opacity-70" />
                      <span className="truncate font-medium">{role.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right: Permissions grid */}
      <div className="flex-1 min-w-0 overflow-y-auto p-4">
        {!selectedDeptId && (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground italic">
            Chọn một phòng ban và vai trò bên trái để thiết lập quyền.
          </div>
        )}
        {selectedDeptId && selectedDept && (
          <>
            <div className="mb-3">
              <div className="relative max-w-xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={permissionSearch}
                  onChange={(event) => setPermissionSearch(event.target.value)}
                  placeholder="Tìm quyền theo tên, key hoặc mô tả..."
                  aria-label="Tìm kiếm quyền"
                  className="pl-9 h-9 bg-background"
                />
              </div>
              {normalizedPermissionSearch && permissionFilteredModules.length === 0 && permissionFilteredStandaloneItems.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Không tìm thấy quyền phù hợp với “{permissionSearch}”.
                </p>
              )}
            </div>
            {selectedRoleId && (
              <div className="space-y-3 mt-2">
          {permsLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Đang tải quyền...
            </div>
          )}
          {!permsLoading && permissionFilteredStandaloneItems.length > 0 && (
            <Card>
              <CardContent className="p-0">
                {/* Header — TRANG CHÍNH */}
                <div className="flex items-center px-5 py-4 border-b border-border/50">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <LayoutGrid className="w-5 h-5 text-primary" />
                    </div>
                    <span className="font-semibold text-sm uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      TRANG CHÍNH
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">({standaloneItems.length} mục)</span>
                  </div>
                  <div className="flex items-center gap-0">
                    {PERM_COLS.map(col => (
                      <div key={col.key} className="w-20 text-center text-xs font-semibold text-muted-foreground">
                        {col.label}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="divide-y">
                  {/* ── Dashboard – expandable ── */}
                  {permissionFilteredStandaloneItems.filter(i => i.href === "/").map(dashItem => {
                    const isDashExpanded = !!normalizedPermissionSearch || expandedItems.includes("/");
                    const isBaoCaoExpanded = !!normalizedPermissionSearch || expandedItems.includes("/#bao-cao");
                    const dashboardSubTabs = (dashItem.subTabs ?? []).filter(sub =>
                      !normalizedPermissionSearch ||
                      matchesPermission(dashItem.name, dashItem.href) ||
                      matchesPermission(sub.name, `/#${sub.value}`) ||
                      (sub.value === "bao-cao" && DASHBOARD_REPORTS.some(report =>
                        matchesPermission(report.name, `/#bao-cao/${report.value}`)
                      ))
                    );
                    return (
                      <div key="/">
                        {/* Dashboard header row */}
                        <div className="flex items-center px-5 py-3 bg-muted/20 hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-2 pl-8 flex-1">
                            <button
                              className="flex items-center gap-2 text-left"
                              onClick={() => setExpandedItems(prev =>
                                prev.includes("/") ? prev.filter(h => h !== "/") : [...prev, "/"]
                              )}
                            >
                              <dashItem.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                              <span className="text-sm text-foreground">{dashItem.name}</span>
                              <span className="text-xs text-muted-foreground ml-1">(4 tab)</span>
                              {isDashExpanded
                                ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                              }
                            </button>
                          </div>
                          <div className="flex items-center gap-0 shrink-0">
                            {VIEW_ONLY_COLS.map(col => (
                              <div key={col.key} className="w-20 flex justify-center">
                                <span className="text-xs text-muted-foreground/30 select-none">—</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Dashboard sub-tabs */}
                            {isDashExpanded && dashboardSubTabs.length > 0 && (
                          <div className="divide-y bg-muted/10">
                            {dashboardSubTabs.map(sub => {
                              if (sub.value === "bao-cao") {
                                const baoCaoResource = "/#bao-cao";
                                const baoCaoPerms = getResourcePerm(baoCaoResource);
                                return (
                                  <div key="bao-cao">
                                    {/* BÁO CÁO row — expandable */}
                                    <div className="flex items-center px-5 py-2.5 hover:bg-muted/20 transition-colors">
                                      <div className="flex items-center gap-2 pl-16 flex-1">
                                        <button
                                          className="flex items-center gap-2 text-left"
                                          onClick={() => setExpandedItems(prev =>
                                            prev.includes("/#bao-cao")
                                              ? prev.filter(h => h !== "/#bao-cao")
                                              : [...prev, "/#bao-cao"]
                                          )}
                                        >
                                          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                                          <span className="text-sm text-muted-foreground">{sub.name}</span>
                                          <span className="text-xs text-muted-foreground ml-1">({DASHBOARD_REPORTS.length} báo cáo)</span>
                                          {isBaoCaoExpanded
                                            ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
                                            : <ChevronRight className="w-3 h-3 text-muted-foreground" />
                                          }
                                        </button>
                                      </div>
                                      <div className="flex items-center gap-0 shrink-0">
                                        {VIEW_ONLY_COLS.map(col => (
                                          <div key={col.key} className="w-20 flex justify-center">
                                            <Checkbox
                                              data-testid={`perm-dashboard-bao-cao-${col.key}`}
                                              checked={baoCaoPerms[col.key]}
                                              onCheckedChange={() => handleToggle(baoCaoResource, col.key)}
                                              className="w-4 h-4"
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                    {PERM_DESCRIPTIONS[baoCaoResource] && (
                                      <div className="px-5 pb-2 pl-24 -mt-1">
                                        <p className="text-[11px] text-muted-foreground/65 italic leading-relaxed">{PERM_DESCRIPTIONS[baoCaoResource]}</p>
                                      </div>
                                    )}

                                    {/* Individual reports */}
                                    {isBaoCaoExpanded && (
                                      <div className="divide-y bg-muted/5">
                                        {DASHBOARD_REPORTS.filter(report =>
                                          !normalizedPermissionSearch ||
                                          matchesPermission(report.name, `/#bao-cao/${report.value}`) ||
                                          matchesPermission("Báo cáo", "/#bao-cao") ||
                                          matchesPermission(dashItem.name, dashItem.href)
                                        ).map(report => {
                                          const reportResource = `/#bao-cao/${report.value}`;
                                          const reportPerms = getResourcePerm(reportResource);
                                          return (
                                            <div key={report.value}>
                                              <div className="flex items-center px-5 py-2 hover:bg-muted/20 transition-colors">
                                                <div className="flex items-center gap-2 pl-24 flex-1">
                                                  <div className="w-1 h-1 rounded-full bg-muted-foreground/30 shrink-0" />
                                                  <span className="text-sm text-muted-foreground">{report.name}</span>
                                                </div>
                                                <div className="flex items-center gap-0 shrink-0">
                                                  {VIEW_ONLY_COLS.map(col => (
                                                    <div key={col.key} className="w-20 flex justify-center">
                                                      <Checkbox
                                                        data-testid={`perm-dashboard-${report.value}-${col.key}`}
                                                        checked={reportPerms[col.key]}
                                                        onCheckedChange={() => handleToggle(reportResource, col.key)}
                                                        className="w-4 h-4"
                                                      />
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              // Regular sub-tabs: khach-hang, dao-tao, tai-chinh
                              const subResource = `/#${sub.value}`;
                              const subPerms = getResourcePerm(subResource);
                              return (
                                <div key={sub.value}>
                                  <div className="flex items-center px-5 py-2.5 hover:bg-muted/20 transition-colors">
                                    <div className="flex items-center gap-2 pl-16 flex-1">
                                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                                      <span className="text-sm text-muted-foreground">{sub.name}</span>
                                    </div>
                                    <div className="flex items-center gap-0 shrink-0">
                                      {VIEW_ONLY_COLS.map(col => (
                                        <div key={col.key} className="w-20 flex justify-center">
                                          <Checkbox
                                            data-testid={`perm-dashboard-${sub.value}-${col.key}`}
                                            checked={subPerms[col.key]}
                                            onCheckedChange={() => handleToggle(subResource, col.key)}
                                            className="w-4 h-4"
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  {PERM_DESCRIPTIONS[subResource] && (
                                    <div className="px-5 pb-2 pl-24 -mt-1">
                                      <p className="text-[11px] text-muted-foreground/65 italic leading-relaxed">{PERM_DESCRIPTIONS[subResource]}</p>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* ── Các trang chính khác (Chat, Zalo OA, Bảng tin…) ── */}
                  {permissionFilteredStandaloneItems.filter(i => i.href !== "/").map(item => {
                    const itemPerms = getResourcePerm(item.href);
                    // Xác định cột nào được phép cho từng trang
                    const allowedKeys: Set<PermKey> =
                      item.href === "/chat"
                        ? CHAT_ALLOWED_PERM_KEYS
                        : READ_ONLY_RESOURCES.has(item.href)
                          ? new Set(["canView" as PermKey])
                          : new Set(PERM_COLS.map(c => c.key));
                    return (
                      <div key={item.href}>
                        <div className="flex items-center px-5 py-3 bg-muted/20 hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-2 pl-8 flex-1">
                            <item.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="text-sm text-foreground">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-0 shrink-0">
                            {PERM_COLS.map(col => (
                              <div key={col.key} className="w-20 flex justify-center">
                                {allowedKeys.has(col.key) ? (
                                  <Checkbox
                                    data-testid={`perm-standalone-${item.href.replace(/\//g, "-")}-${col.key}`}
                                    checked={itemPerms[col.key]}
                                    onCheckedChange={() => handleToggle(item.href, col.key)}
                                    className="w-4 h-4"
                                  />
                                ) : (
                                  <span className="text-xs text-muted-foreground/30 select-none">—</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                        {PERM_DESCRIPTIONS[item.href] && (
                          <div className="px-5 pb-2.5 pt-0 pl-[4.5rem]">
                            <p className="text-[11px] text-muted-foreground/65 italic leading-relaxed">{PERM_DESCRIPTIONS[item.href]}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
          {!permsLoading && permissionFilteredModules.map(mod => {
            const isExpanded = !!normalizedPermissionSearch || expandedModules.includes(mod.module);
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
                        // Ẩn hàng Bảng lương cho role học viên/phụ huynh (không có bảng lương)
                        if (isStudentSystemRole && item.href === "/my-space/payroll") return null;

                        const permittedSubTabs = getPermittedSubTabs(item);
                        const hasSubTabs = permittedSubTabs.length > 0;
                        const itemExpanded = !!normalizedPermissionSearch || expandedItems.includes(item.href);
                        const itemPerms = getResourcePerm(item.href);

                        // Với role học viên/phụ huynh, 3 trang mặc định luôn được bật và không sửa được
                        const isStudentDefaultLocked = isStudentSystemRole && STUDENT_DEFAULT_RESOURCES.has(item.href);

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
                                    <span className="text-xs text-muted-foreground ml-1">({permittedSubTabs.length} tab)</span>
                                    {itemExpanded
                                      ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                      : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                    }
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <item.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                                    <span className="text-sm text-foreground">{item.name}</span>
                                    {isStudentDefaultLocked && (
                                      <span className="text-xs text-muted-foreground italic">(mặc định)</span>
                                    )}
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
                                ) : isStudentDefaultLocked ? (
                                  // 3 trang mặc định của học viên: luôn tích hết, không sửa được
                                  PERM_COLS.map(col => (
                                    <div key={col.key} className="w-20 flex justify-center">
                                      <Checkbox
                                        checked={true}
                                        disabled={true}
                                        className="w-4 h-4 opacity-40 cursor-not-allowed"
                                      />
                                    </div>
                                  ))
                                ) : (
                                  PERM_COLS.map(col => {
                                    const isViewOnly = VIEW_ONLY_RESOURCES.has(item.href);
                                    if (isViewOnly && col.key !== "canView") {
                                      return <div key={col.key} className="w-20 flex justify-center"><span className="text-xs text-muted-foreground/30 select-none">—</span></div>;
                                    }
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

                            {/* Item description */}
                            {!hasSubTabs && PERM_DESCRIPTIONS[item.href] && (
                              <div className="px-5 pb-2.5 pt-0 pl-[4.5rem]">
                                <p className="text-[11px] text-muted-foreground/65 italic leading-relaxed">{PERM_DESCRIPTIONS[item.href]}</p>
                              </div>
                            )}

                            {/* Sub-tab rows */}
                            {hasSubTabs && itemExpanded && (
                              <div className="divide-y bg-muted/10">
                                {permittedSubTabs.map(sub => {
                                  const subResource = `${item.href}#${sub.value}`;
                                  const subPerms = getResourcePerm(subResource);
                                  const subDesc = PERM_DESCRIPTIONS[subResource];
                                  return (
                                    <div key={sub.value}>
                                      <div className="flex items-center px-5 py-2.5 hover:bg-muted/20 transition-colors">
                                        <div className="flex items-center gap-2 pl-16 flex-1">
                                          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                                          <span className="text-sm text-muted-foreground">{sub.name}</span>
                                        </div>
                                        <div className="flex items-center gap-0 shrink-0">
                                          {PERM_COLS.map(col => {
                                            const isNoDelete = NO_DELETE_RESOURCES.has(subResource) && col.key === "canDelete";
                                            const isNoCreate = NO_CREATE_RESOURCES.has(subResource) && col.key === "canCreate";
                                            const isEditOnly = EDIT_ONLY_RESOURCES.has(subResource) && col.key !== "canEdit";
                                            if (isEditOnly) {
                                              return <div key={col.key} className="w-20 flex justify-center"><span className="text-xs text-muted-foreground/30 select-none">—</span></div>;
                                            }
                                            const isSubDisabled = isNoDelete || isNoCreate;
                                            return (
                                              <div key={col.key} className="w-20 flex justify-center">
                                                <Checkbox
                                                  data-testid={`perm-${item.href.replace(/\//g, "-")}-${sub.value}-${col.key}`}
                                                  checked={isSubDisabled ? false : subPerms[col.key]}
                                                  onCheckedChange={() => handleToggle(subResource, col.key)}
                                                  disabled={isSubDisabled}
                                                  className={cn("w-4 h-4", isSubDisabled && "opacity-25 cursor-not-allowed")}
                                                />
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                      {subDesc && (
                                        <div className="px-5 pb-2 pl-24 -mt-1">
                                          <p className="text-[11px] text-muted-foreground/65 italic leading-relaxed">{subDesc}</p>
                                        </div>
                                      )}
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

          {/* Quyền hệ thống — tải file đính kèm */}
          {!permsLoading && (
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center px-5 py-4 border-b border-border/50">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Download className="w-5 h-5 text-primary" />
                    </div>
                    <span className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Quyền hệ thống</span>
                  </div>
                  <div className="flex items-center gap-0">
                    {VIEW_ONLY_COLS.map(col => (
                      <div key={col.key} className="w-20 text-center text-xs font-semibold text-muted-foreground">
                        {col.label}
                      </div>
                    ))}
                    {PERM_COLS.slice(1).map(col => (
                      <div key={col.key} className="w-20 text-center text-xs font-semibold text-muted-foreground/30">
                        {col.label}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="divide-y">
                  <div>
                    <div className="flex items-center px-5 py-3 bg-muted/20 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-2 pl-8 flex-1">
                        <Download className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-sm text-foreground">Tải file đính kèm</span>
                      </div>
                      <div className="flex items-center gap-0 shrink-0">
                        <div className="w-20 flex justify-center">
                          <Checkbox
                            data-testid="perm-download-files-canView"
                            checked={getResourcePerm(DOWNLOAD_FILES_RESOURCE).canView}
                            onCheckedChange={() => handleToggle(DOWNLOAD_FILES_RESOURCE, "canView")}
                            className="w-4 h-4"
                          />
                        </div>
                        {PERM_COLS.slice(1).map(col => (
                          <div key={col.key} className="w-20 flex justify-center">
                            <span className="text-xs text-muted-foreground/30 select-none">—</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="px-5 pb-2.5 pt-0 pl-[4.5rem]">
                      <p className="text-[11px] text-muted-foreground/65 italic leading-relaxed">
                        Xem: vai trò được phép tải xuống các file đính kèm (ảnh, tài liệu, video...) khi xem nội dung trên hệ thống.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
            )}
            {!selectedRoleId && roles.length > 0 && (
              <div className="text-sm text-muted-foreground italic py-4">Chọn một vai trò bên trái để xem và thiết lập quyền.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

type ProviderKey = "openai" | "gemini" | "groq";

const AI_PROVIDERS: { value: ProviderKey; label: string; icon: string; placeholder: string; hint: string }[] = [
  { value: "openai", label: "OpenAI (ChatGPT)", icon: "🤖", placeholder: "sk-proj-...", hint: "Lấy tại: platform.openai.com → API Keys" },
  { value: "gemini", label: "Google Gemini", icon: "✨", placeholder: "AIza...", hint: "Lấy tại: aistudio.google.com → Get API key" },
  { value: "groq", label: "Groq", icon: "⚡", placeholder: "gsk_...", hint: "Lấy tại: console.groq.com → API Keys" },
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
  const { data: configuredProviders, isLoading, refetch } = useQuery<{ openai: boolean; gemini: boolean; groq: boolean }>({
    queryKey: ["/api/ai-settings"],
  });

  const { data: gradingModeData, isLoading: gradingModeLoading } = useQuery<{ parallelMode: boolean; gradingProvider: string | null }>({
    queryKey: ["/api/ai-settings/grading-mode"],
  });

  const { toast } = useToast();
  const gradingModeMutation = useMutation({
    mutationFn: (payload: { parallelMode?: boolean; gradingProvider?: string | null }) =>
      apiRequest("PUT", "/api/ai-settings/grading-mode", payload).then((r) => r.json()),
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/ai-settings/grading-mode"], data);
      toast({ title: "Đã lưu cài đặt chấm bài." });
    },
    onError: () => {
      toast({ title: "Lỗi", description: "Không thể lưu cài đặt chế độ chấm bài.", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold mb-1">Tài khoản AI</h2>
        <p className="text-sm text-muted-foreground">
          Cấu hình API key riêng của trung tâm để sử dụng AI tạo câu hỏi. Chi phí sẽ tính vào tài khoản AI của trung tâm thay vì Replit.
        </p>
      </div>

      <div className="flex gap-6 items-start">
        {/* Left sidebar: Grading mode */}
        <div className="w-80 shrink-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="text-lg">⚡</span>
                Chế độ chấm bài tự luận AI
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* AI Provider selector */}
              <div className="rounded-lg border px-4 py-3 space-y-2">
                <div>
                  <p className="text-sm font-medium mb-1">AI sử dụng để chấm bài</p>
                  <p className="text-xs text-muted-foreground">Chọn AI chấm câu tự luận. Mặc định dùng AI đầu tiên đã cấu hình.</p>
                </div>
                {gradingModeLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                ) : (
                  <Select
                    value={gradingModeData?.gradingProvider || "auto"}
                    onValueChange={(val) =>
                      gradingModeMutation.mutate({ gradingProvider: val === "auto" ? null : val })
                    }
                    disabled={gradingModeMutation.isPending}
                  >
                    <SelectTrigger className="w-full h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto" className="text-xs">
                        Tự động (AI đầu tiên khả dụng)
                      </SelectItem>
                      <SelectItem value="gemini" className="text-xs" disabled={!configuredProviders?.gemini}>
                        ✨ Google Gemini{!configuredProviders?.gemini ? " (chưa cấu hình)" : ""}
                      </SelectItem>
                      <SelectItem value="openai" className="text-xs" disabled={!configuredProviders?.openai}>
                        🤖 OpenAI (ChatGPT){!configuredProviders?.openai ? " (chưa cấu hình)" : ""}
                      </SelectItem>
                      <SelectItem value="groq" className="text-xs" disabled={!configuredProviders?.groq}>
                        ⚡ Groq{!configuredProviders?.groq ? " (chưa cấu hình)" : ""}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Sequential mode */}
              <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Chế độ tuần tự (Sequential)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Chấm từng câu, cách nhau 13 giây — an toàn cho API key miễn phí (Google AI Studio).</p>
                </div>
                {gradingModeLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground ml-3" />
                ) : (
                  <Switch
                    checked={!gradingModeData?.parallelMode}
                    onCheckedChange={(checked) => {
                      if (checked) gradingModeMutation.mutate({ parallelMode: false });
                    }}
                    disabled={gradingModeMutation.isPending}
                    data-testid="switch-sequential-mode"
                  />
                )}
              </div>

              {/* Parallel mode */}
              <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Chế độ song song (Parallel)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Tất cả câu hỏi được chấm cùng lúc — nhanh hơn, dành cho API key trả phí.</p>
                </div>
                {gradingModeLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground ml-3" />
                ) : (
                  <Switch
                    checked={!!gradingModeData?.parallelMode}
                    onCheckedChange={(checked) => {
                      if (checked) gradingModeMutation.mutate({ parallelMode: true });
                    }}
                    disabled={gradingModeMutation.isPending}
                    data-testid="switch-parallel-mode"
                  />
                )}
              </div>
              {gradingModeData?.parallelMode && (
                <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Chế độ song song có thể gây lỗi giới hạn tốc độ nếu dùng API key miễn phí (Google AI Studio). Hãy đảm bảo bạn đang dùng API key trả phí.</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: AI provider cards */}
        <div className="flex-1 min-w-0">
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
      </div>
    </div>
  );
}

// ─── Payment Gateway Config ───────────────────────────────────────────────────

const PAYMENT_PROVIDERS = [
  {
    id: "bidv",
    name: "BIDV",
    fields: [],
    isBidv: true,
  },
];

type BankAccount = { bankName: string; bankAccount: string; accountHolder: string; qrUrl?: string };

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
  const { isSubTabItemVisible } = useSidebarVisibility();
  const canSeePayment = isSubTabItemVisible("/settings", "providers", "payment", "SETTING");
  const canSeeEinvoice = isSubTabItemVisible("/settings", "providers", "einvoice", "SETTING");
  const canSeeZaloOA = isSubTabItemVisible("/settings", "providers", "zalo-oa", "SETTING");
  const canSeeCallCenter = isSubTabItemVisible("/settings", "providers", "call-center", "SETTING");

  const getDefaultTab = () => {
    if (canSeePayment) return "payment";
    if (canSeeEinvoice) return "einvoice";
    if (canSeeZaloOA) return "zalo-oa";
    if (canSeeCallCenter) return "call-center";
    return "payment";
  };

  const [activeTab, setActiveTab] = useState<"payment" | "einvoice" | "zalo-oa" | "call-center">(getDefaultTab);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("zalo_success") === "1" || params.get("zalo_error")) {
      setActiveTab("zalo-oa");
    }
  }, []);

  useEffect(() => {
    if (activeTab === "payment" && !canSeePayment) {
      if (canSeeEinvoice) setActiveTab("einvoice");
      else if (canSeeZaloOA) setActiveTab("zalo-oa");
      else if (canSeeCallCenter) setActiveTab("call-center");
    } else if (activeTab === "einvoice" && !canSeeEinvoice) {
      if (canSeePayment) setActiveTab("payment");
      else if (canSeeZaloOA) setActiveTab("zalo-oa");
      else if (canSeeCallCenter) setActiveTab("call-center");
    } else if (activeTab === "zalo-oa" && !canSeeZaloOA) {
      if (canSeePayment) setActiveTab("payment");
      else if (canSeeEinvoice) setActiveTab("einvoice");
      else if (canSeeCallCenter) setActiveTab("call-center");
    } else if (activeTab === "call-center" && !canSeeCallCenter) {
      if (canSeePayment) setActiveTab("payment");
      else if (canSeeEinvoice) setActiveTab("einvoice");
      else if (canSeeZaloOA) setActiveTab("zalo-oa");
    }
  }, [activeTab, canSeePayment, canSeeEinvoice, canSeeZaloOA, canSeeCallCenter]);

  if (!canSeePayment && !canSeeEinvoice && !canSeeZaloOA && !canSeeCallCenter) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        Tất cả mục đã bị ẩn. Vui lòng bật ít nhất một mục trong Quản lý module.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {canSeePayment && (
          <button
            className={`px-3 py-1 rounded-md border text-xs font-medium ${activeTab === "payment" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-accent"}`}
            onClick={() => setActiveTab("payment")}
            data-testid="tab-payment-gateway"
          >
            Cổng thanh toán
          </button>
        )}
        {canSeeEinvoice && (
          <button
            className={`px-3 py-1 rounded-md border text-xs font-medium ${activeTab === "einvoice" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-accent"}`}
            onClick={() => setActiveTab("einvoice")}
            data-testid="tab-einvoice"
          >
            Hoá đơn điện tử
          </button>
        )}
        {canSeeZaloOA && (
          <button
            className={`px-3 py-1 rounded-md border text-xs font-medium ${activeTab === "zalo-oa" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-accent"}`}
            onClick={() => setActiveTab("zalo-oa")}
            data-testid="tab-zalo-oa"
          >
            Zalo OA
          </button>
        )}
        {canSeeCallCenter && (
          <button
            className={`px-3 py-1 rounded-md border text-xs font-medium ${activeTab === "call-center" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-accent"}`}
            onClick={() => setActiveTab("call-center")}
            data-testid="tab-call-center"
          >
            Tổng đài
          </button>
        )}
      </div>
      {activeTab === "payment" && canSeePayment && <PaymentGatewayConfig />}
      {activeTab === "einvoice" && canSeeEinvoice && <EInvoiceConfig />}
      {activeTab === "zalo-oa" && canSeeZaloOA && <ZaloOAConfig />}
      {activeTab === "call-center" && canSeeCallCenter && <CallCenterConfig />}
    </div>
  );
}

function CallCenterConfig() {
  const { toast } = useToast();
  const { data: locations, isLoading: locationsLoading } = useLocations();
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [form, setForm] = useState({
    serviceName: "omicall",
    authUser: "",
    sipRealm: "",
    authKey: "",
    hotline: "",
    callHistoryUrl: "",
    autoCallUrl: "https://public-v1-stg.omicall.com",
    isActive: false,
  });
  const [showAuthKey, setShowAuthKey] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");

  useEffect(() => {
    if (locations?.length && !selectedLocationId) {
      setSelectedLocationId(locations[0].id);
    }
  }, [locations, selectedLocationId]);

  const { data: savedConfig } = useQuery<{
    locationId: string;
    serviceName: string;
    authUser: string;
    sipRealm: string;
    hotline: string;
    callHistoryUrl: string;
    autoCallUrl: string;
    hasAuthKey: boolean;
    authKeyMasked: string;
    authKeyDecryptionFailed: boolean;
    isActive: boolean;
  }>({
    queryKey: ["/api/call-center/omicall/config", selectedLocationId],
    enabled: Boolean(selectedLocationId),
    queryFn: async () => {
      const res = await fetch(
        `/api/call-center/omicall/config?locationId=${encodeURIComponent(selectedLocationId)}`,
        { credentials: "include", headers: getAuthHeaders() },
      );
      if (!res.ok) throw new Error("Không thể đọc cấu hình Omicall");
      return res.json();
    },
  });

  useEffect(() => {
    setForm({
      serviceName: "omicall",
      authUser: "",
      sipRealm: "",
      authKey: "",
      hotline: "",
      callHistoryUrl: "",
      autoCallUrl: "https://public-v1-stg.omicall.com",
      isActive: false,
    });
    setTestStatus("idle");
  }, [selectedLocationId]);

  useEffect(() => {
    if (!savedConfig || savedConfig.locationId !== selectedLocationId) return;
    setForm({
      serviceName: savedConfig.serviceName || "omicall",
      authUser: savedConfig.authUser || "",
      sipRealm: savedConfig.sipRealm || "",
      authKey: savedConfig.hasAuthKey && !savedConfig.authKeyDecryptionFailed ? "********" : "",
      hotline: savedConfig.hotline || "",
      callHistoryUrl: savedConfig.callHistoryUrl || "",
      autoCallUrl: savedConfig.autoCallUrl || "https://public-v1-stg.omicall.com",
      isActive: savedConfig.isActive,
    });
  }, [savedConfig, selectedLocationId]);

  const authKeyToSend = form.authKey === "********" ? "__USE_SAVED__" : form.authKey;

  const testMutation = useMutation({
    mutationFn: async () => {
      if (!selectedLocationId) throw new Error("Vui lòng chọn cơ sở");
      if (!authKeyToSend && !savedConfig?.hasAuthKey) {
        throw new Error("Vui lòng nhập Auth Key/API Key Omicall");
      }
      if (!form.callHistoryUrl.trim()) throw new Error("Vui lòng nhập Call History URL");
      if (!form.autoCallUrl.trim()) throw new Error("Vui lòng nhập Auto Call URL");
      const res = await apiRequest("POST", "/api/call-center/omicall/test-connection", {
        locationId: selectedLocationId,
        serviceName: form.serviceName,
        authUser: form.authUser,
        sipRealm: form.sipRealm,
        authKey: authKeyToSend,
        hotline: form.hotline,
        callHistoryUrl: form.callHistoryUrl,
        autoCallUrl: form.autoCallUrl,
      });
      return res.json();
    },
    onMutate: () => setTestStatus("testing"),
    onSuccess: (data: { message?: string }) => {
      setTestStatus("success");
      toast({ title: "Kết nối thành công", description: data.message });
    },
    onError: (error: any) => {
      setTestStatus("error");
      toast({ title: "Kết nối thất bại", description: error?.message || "Không thể kết nối Omicall", variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedLocationId) throw new Error("Vui lòng chọn cơ sở");
      if (!form.autoCallUrl.trim()) throw new Error("Vui lòng nhập Auto Call URL");
      if (!authKeyToSend && !savedConfig?.hasAuthKey) {
        throw new Error("Vui lòng nhập Auth Key/API Key Omicall");
      }
      const res = await apiRequest("PUT", "/api/call-center/omicall/config", {
        locationId: selectedLocationId,
        serviceName: form.serviceName,
        authUser: form.authUser,
        sipRealm: form.sipRealm,
        authKey: authKeyToSend,
        hotline: form.hotline,
        callHistoryUrl: form.callHistoryUrl,
        autoCallUrl: form.autoCallUrl,
        isActive: form.isActive,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Đã lưu cấu hình", description: "Đã lưu cấu hình Omicall riêng cho cơ sở này." });
      queryClient.invalidateQueries({ queryKey: ["/api/call-center/omicall/config", selectedLocationId] });
    },
    onError: (error: any) => {
      toast({ title: "Lưu thất bại", description: error?.message || "Không thể lưu cấu hình Omicall", variant: "destructive" });
    },
  });

  const selectedLocation = locations?.find(location => location.id === selectedLocationId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-4">
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Nhà cung cấp</CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          <div className="w-full px-3 py-2.5 rounded-md bg-primary/10 text-primary font-medium text-sm">
            Omicall
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Cấu hình tổng đài — Omicall</CardTitle>
          <Badge variant={form.isActive ? "default" : "secondary"}>
            {form.isActive ? "Đang bật" : "Đang tắt"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {locationsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Đang tải danh sách cơ sở...
            </div>
          ) : locations?.length ? (
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Khách hàng / Cơ sở <span className="text-destructive">*</span>
              </label>
              <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                <SelectTrigger data-testid="select-omicall-location">
                  <SelectValue placeholder="Chọn khách hàng / cơ sở" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map(location => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name} ({location.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Cấu hình Omicall được lưu riêng cho {selectedLocation?.name || "cơ sở đang chọn"}.
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              Chưa có cơ sở để gán cấu hình Omicall.
            </div>
          )}

          <div className="rounded-md border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
            Nhập đúng bộ thông tin Omicall cung cấp cho từng khách hàng. Auth Key được mã hóa khi lưu và không hiển thị đầy đủ sau khi đã lưu.
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Service Name</label>
            <Input
              value={form.serviceName}
              onChange={e => setForm(p => ({ ...p, serviceName: e.target.value }))}
              placeholder="omicall"
              data-testid="input-omicall-service-name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Auth User / Tenant</label>
            <Input
              value={form.authUser}
              onChange={e => setForm(p => ({ ...p, authUser: e.target.value }))}
              placeholder="Ví dụ: dynamicflc"
              data-testid="input-omicall-auth-user"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Đây là mã khách hàng/tenant do Omicall cấp; không tự điền giá trị mẫu.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              SIP Realm / Domain tổng đài
            </label>
            <Input
              value={form.sipRealm}
              onChange={e => setForm(p => ({ ...p, sipRealm: e.target.value }))}
              placeholder="Ví dụ: sales127"
              data-testid="input-omicall-sip-realm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Lấy từ trường “Domain tổng đài” của số nội bộ Omicall; khác với Auth User / Tenant.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Hotline gọi ra
            </label>
            <Input
              value={form.hotline}
              onChange={e => setForm(p => ({ ...p, hotline: e.target.value }))}
              placeholder="Số hotline Omicall cấp để gọi ra"
              data-testid="input-omicall-hotline"
            />
            <p className="text-xs text-muted-foreground mt-1">
              API Click-to-Call dùng hotline này cùng với đầu số nội bộ của nhân sự.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Auth Key / API Key <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <Input
                type={showAuthKey ? "text" : "password"}
                value={form.authKey}
                onChange={e => setForm(p => ({ ...p, authKey: e.target.value }))}
                placeholder={savedConfig?.hasAuthKey ? "Để trống để dùng Auth Key đã lưu" : "Nhập Auth Key Omicall"}
                className="pr-9"
                data-testid="input-omicall-auth-key"
              />
              <button
                type="button"
                onClick={() => setShowAuthKey(value => !value)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showAuthKey ? "Ẩn Auth Key" : "Hiện Auth Key"}
                data-testid="button-toggle-omicall-auth-key"
              >
                {showAuthKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {savedConfig?.hasAuthKey && (
              <p className={`text-xs mt-1 ${savedConfig.authKeyDecryptionFailed ? "text-amber-700" : "text-muted-foreground"}`}>
                {savedConfig.authKeyDecryptionFailed
                  ? "Auth Key đã lưu không thể giải mã trong môi trường hiện tại. Vui lòng nhập lại Auth Key mới rồi lưu."
                  : `Auth Key đã được lưu: ${savedConfig.authKeyMasked}`}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Call History URL <span className="text-destructive">*</span>
            </label>
            <Input
              value={form.callHistoryUrl}
              onChange={e => setForm(p => ({ ...p, callHistoryUrl: e.target.value }))}
              placeholder="https://public-v1-stg.omicall.com"
              data-testid="input-omicall-call-history-url"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Auto Call URL <span className="text-destructive">*</span>
            </label>
            <Input
              value={form.autoCallUrl}
              onChange={e => setForm(p => ({ ...p, autoCallUrl: e.target.value }))}
              placeholder="https://public-v1-stg.omicall.com"
              data-testid="input-omicall-auto-call-url"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Dùng cho API gọi ra. Nếu URL lịch sử là trang *.omicrm.io, hệ thống sẽ tự dùng URL API này để lấy lịch sử.
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))}
              className="accent-primary w-4 h-4"
              data-testid="checkbox-omicall-active"
            />
            <span className="text-sm">Kích hoạt Omicall cho cơ sở này</span>
          </label>

          <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || !selectedLocationId}
              data-testid="button-test-omicall-connection"
            >
              {testMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FlaskConical className="h-4 w-4 mr-1.5" />}
              Kiểm tra kết nối
            </Button>
            {testStatus === "success" && (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 border-none">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Thành công
              </Badge>
            )}
            {testStatus === "error" && (
              <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100 border-none">
                <XCircle className="h-3 w-3 mr-1" /> Thất bại
              </Badge>
            )}
            <Button
              className="ml-auto"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !selectedLocationId}
              data-testid="button-save-omicall"
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Lưu cấu hình
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
             Call History V3 dùng <code>x-api-key</code> trực tiếp theo tài liệu Omicall. Không nhập URL tài liệu api.omicall.com hoặc trang quản trị *.omicrm.io vào ô Call History URL.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ZaloOAConfig() {
  return <ZNSConfig />;
}

type ZNSSettingsDto = {
  attendanceEnabled: boolean;
  classChangedEnabled: boolean;
  tuitionEnabled: boolean;
  attendanceResultEnabled: boolean;
  zaloEnabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  channelPriority: "AUTO" | "OA" | "ZNS";
};

function ZNSConfig() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useQuery<ZNSSettingsDto>({
    queryKey: ["/api/notification/zns-settings"],
  });
  const [form, setForm] = useState<ZNSSettingsDto>({
    attendanceEnabled: true,
    classChangedEnabled: true,
    tuitionEnabled: true,
    attendanceResultEnabled: true,
    zaloEnabled: false,
    smsEnabled: false,
    emailEnabled: false,
    channelPriority: "AUTO",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const toggle = (key: keyof ZNSSettingsDto) =>
    setForm(f => ({ ...f, [key]: !f[key] }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiRequest("PUT", "/api/notification/zns-settings", form);
      toast({ title: "Đã lưu cấu hình thông báo ZNS." });
      refetch();
    } catch (err: any) {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="w-4 h-4 animate-spin" /> Đang tải cấu hình...
      </div>
    );
  }

  const notificationItems = [
    { key: "attendanceEnabled" as const, label: "Nhắc lịch học", desc: "Gửi thông báo trước giờ học" },
    { key: "classChangedEnabled" as const, label: "Đổi lịch học", desc: "Thông báo khi lịch học thay đổi" },
    { key: "tuitionEnabled" as const, label: "Nhắc học phí", desc: "Thông báo khi đến hạn đóng học phí" },
    { key: "attendanceResultEnabled" as const, label: "Kết quả điểm danh", desc: "Thông báo trạng thái điểm danh sau buổi học" },
  ];

  const channelItems = [
    { key: "zaloEnabled" as const, label: "Zalo ZNS", desc: "Gửi qua Zalo Notification Service" },
    { key: "smsEnabled" as const, label: "SMS", desc: "Gửi qua tin nhắn SMS (chưa hỗ trợ)" },
    { key: "emailEnabled" as const, label: "Email", desc: "Gửi qua email (chưa hỗ trợ)" },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Thông báo tự động</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {notificationItems.map(item => (
            <div key={item.key} className="flex items-center justify-between gap-4 py-1">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Switch
                checked={!!form[item.key]}
                onCheckedChange={() => toggle(item.key)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Kênh gửi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {channelItems.map(item => (
            <div key={item.key} className="flex items-center justify-between gap-4 py-1">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Switch
                checked={!!form[item.key]}
                onCheckedChange={() => toggle(item.key)}
                disabled={item.key !== "zaloEnabled"}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Ưu tiên kênh gửi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {([
            { value: "AUTO", label: "Tự động", desc: "Hệ thống tự chọn kênh phù hợp" },
            { value: "OA", label: "Luôn OA", desc: "Ưu tiên gửi qua Zalo Official Account" },
            { value: "ZNS", label: "Luôn ZNS", desc: "Ưu tiên gửi qua Zalo Notification Service" },
          ] as const).map(opt => (
            <label
              key={opt.value}
              className="flex items-center gap-3 cursor-pointer rounded-md px-2 py-1.5 hover:bg-accent"
            >
              <input
                type="radio"
                name="channelPriority"
                value={opt.value}
                checked={form.channelPriority === opt.value}
                onChange={() => setForm(f => ({ ...f, channelPriority: opt.value }))}
                className="accent-primary"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </div>
            </label>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          Lưu cấu hình
        </Button>
      </div>
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
    signingType: "usb" as "usb" | "central",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [fetchingPassword, setFetchingPassword] = useState(false);
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
      signingType: (savedCfg as any).signingType || "usb",
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
        signingType: form.signingType,
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
            <label className="block text-sm font-medium mb-1.5">
              Loại hình ký số <span className="text-destructive">*</span>
            </label>
            <Select
              value={form.signingType}
              onValueChange={v => setForm(p => ({ ...p, signingType: v as "usb" | "central" }))}
            >
              <SelectTrigger data-testid="select-einvoice-signing-type">
                <SelectValue placeholder="Chọn loại hình ký số" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="usb">USB</SelectItem>
                <SelectItem value="central">Ký số tập trung</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
                  onClick={async () => {
                    if (!showPassword && form.password === "********") {
                      setFetchingPassword(true);
                      try {
                        const res = await fetch("/api/einvoice/config/password", { credentials: "include", headers: getAuthHeaders() });
                        if (res.ok) {
                          const { password } = await res.json();
                          setForm(p => ({ ...p, password: password || "" }));
                        }
                      } finally {
                        setFetchingPassword(false);
                      }
                    }
                    setShowPassword(s => !s);
                  }}
                  disabled={fetchingPassword}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50"
                  data-testid="button-toggle-password"
                >
                  {fetchingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
  const [activeProvider, setActiveProvider] = useState("bidv");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [selectedProvider, setSelectedProvider] = useState("bidv");
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

        {/* RIGHT: Table view or custom panel */}
        <div className={activeProvider === "bidv" ? "overflow-y-auto" : "flex flex-col"}>
          {activeProvider === "bidv" ? (
            <BidvPanel />
          ) : (
            <>
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
            </>
          )}
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

// ─── BIDV Panel ───────────────────────────────────────────────────────────────

type BidvTestResult = {
  oauth: "ok" | "error" | "skip";
  certificate: "ok" | "error" | "skip";
  signature: "ok" | "error" | "skip";
  apiReachable: "ok" | "error" | "skip";
  messages: Record<string, string>;
};

type BidvValidateResult = { ok: boolean; message: string };

function BidvPanel() {
  const { data: myPerms } = useMyPermissions();
  const isSuperAdmin = myPerms?.isSuperAdmin ?? false;
  const { data: locations } = useLocations();
  const { toast } = useToast();

  const [sysForm, setSysForm] = useState({
    environment: "UAT",
    clientId: "",
    providerId: "",
    clientSecret: "",
    symmetricKey: "",
    publicCert: "",
    bidvResponseCert: "",
    privateKey: "",
    timeout: "30",
    retryCount: "3",
    tokenBuffer: "300",
    notes: "",
  });
  const [sysHas, setSysHas] = useState({ clientSecret: false, symmetricKey: false, privateKey: false });
  const [showSysSecrets, setShowSysSecrets] = useState<Record<string, boolean>>({});
  const [certFileName, setCertFileName] = useState("");
  const [bidvResponseCertFileName, setBidvResponseCertFileName] = useState("");
  const [keyFileName, setKeyFileName] = useState("");
  const [sysSaving, setSysSaving] = useState(false);
  const [testResult, setTestResult] = useState<BidvTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [locForm, setLocForm] = useState({
    serviceId: "",
    merchantId: "",
    secretCode: "",
    receiveAccount: "",
    accountName: "",
    vaPrefix: "",
    isEnabled: false,
    isQrEnabled: true,
    autoReconcile: false,
    notes: "",
  });
  const [locHasSecretCode, setLocHasSecretCode] = useState(false);
  const [locHasMerchantId, setLocHasMerchantId] = useState(false);
  const [showMerchantId, setShowMerchantId] = useState(false);
  const [showSecretCode, setShowSecretCode] = useState(false);
  const [locSaving, setLocSaving] = useState(false);
  const [validateResult, setValidateResult] = useState<BidvValidateResult | null>(null);
  const [validating, setValidating] = useState(false);

  const { data: sysCfg, refetch: refetchSys } = useQuery<any>({
    queryKey: ["/api/system-settings/bidv"],
    enabled: isSuperAdmin,
  });

  const { data: locCfg, refetch: refetchLoc } = useQuery<any>({
    queryKey: ["/api/bidv/location-config", selectedLocationId],
    queryFn: async () => {
      if (!selectedLocationId) return null;
      const res = await apiRequest("GET", `/api/bidv/location-config?locationId=${selectedLocationId}`);
      return res.json();
    },
    enabled: !!selectedLocationId,
  });

  useEffect(() => {
    if (!sysCfg) return;
    setSysForm(p => ({
      ...p,
      environment: sysCfg.environment || "UAT",
      clientId: sysCfg.clientId || "",
      providerId: sysCfg.providerId || "",
      clientSecret: sysCfg.clientSecretMasked || "",
      symmetricKey: sysCfg.symmetricKeyMasked || "",
      publicCert: sysCfg.publicCert || "",
      bidvResponseCert: sysCfg.bidvResponseCert || "",
      privateKey: sysCfg.privateKeyMasked || "",
      timeout: sysCfg.timeout || "30",
      retryCount: sysCfg.retryCount || "3",
      tokenBuffer: sysCfg.tokenBuffer || "300",
      notes: sysCfg.notes || "",
    }));
    setSysHas({
      clientSecret: !!sysCfg.hasClientSecret,
      symmetricKey: !!sysCfg.hasSymmetricKey,
      privateKey: !!sysCfg.hasPrivateKey,
    });
    setCertFileName("");
    setBidvResponseCertFileName("");
    setKeyFileName("");
    setShowSysSecrets({});
  }, [sysCfg]);

  useEffect(() => {
    if (!locCfg || !selectedLocationId) {
      setLocForm({ serviceId: "", merchantId: "", secretCode: "", receiveAccount: "", accountName: "", vaPrefix: "", isEnabled: false, isQrEnabled: true, autoReconcile: false, notes: "" });
      setLocHasMerchantId(false);
      setLocHasSecretCode(false);
      return;
    }
    setLocForm(p => ({
      ...p,
      serviceId: locCfg.serviceId || "",
      merchantId: locCfg.merchantIdMasked || "",
      secretCode: locCfg.secretCodeMasked || "",
      receiveAccount: locCfg.receiveAccount || "",
      accountName: locCfg.accountName || "",
      vaPrefix: locCfg.vaPrefix || "",
      isEnabled: locCfg.isEnabled ?? false,
      isQrEnabled: locCfg.isQrEnabled ?? true,
      autoReconcile: locCfg.autoReconcile ?? false,
      notes: locCfg.notes || "",
    }));
    setLocHasMerchantId(!!locCfg.hasMerchantId);
    setLocHasSecretCode(!!locCfg.hasSecretCode);
    setShowMerchantId(false);
    setShowSecretCode(false);
  }, [locCfg, selectedLocationId]);

  useEffect(() => {
    if (locations && (locations as any[]).length > 0 && !selectedLocationId) {
      setSelectedLocationId((locations as any[])[0].id);
    }
  }, [locations]);

  const handleSaveSystem = async () => {
    setSysSaving(true);
    try {
      await apiRequest("PUT", "/api/system-settings/bidv", {
        environment: sysForm.environment,
        clientId: sysForm.clientId,
        providerId: sysForm.providerId,
        clientSecret: sysForm.clientSecret && sysForm.clientSecret !== sysCfg?.clientSecretMasked ? sysForm.clientSecret : undefined,
        symmetricKey: sysForm.symmetricKey && sysForm.symmetricKey !== sysCfg?.symmetricKeyMasked ? sysForm.symmetricKey : undefined,
        publicCert: sysForm.publicCert,
        bidvResponseCert: sysForm.bidvResponseCert,
        privateKey: sysForm.privateKey && sysForm.privateKey !== sysCfg?.privateKeyMasked ? sysForm.privateKey : undefined,
        timeout: sysForm.timeout,
        retryCount: sysForm.retryCount,
        tokenBuffer: sysForm.tokenBuffer,
        notes: sysForm.notes,
      });
      toast({ title: "Đã lưu cấu hình hệ thống BIDV" });
      refetchSys();
    } catch (err: any) {
      toast({ title: "Lỗi lưu cấu hình", description: err?.message || "Không lưu được", variant: "destructive" });
    } finally {
      setSysSaving(false);
    }
  };

  const revealSystemSecret = async (key: "client_secret" | "symmetric_key" | "private_key") => {
    const field = key === "client_secret" ? "clientSecret" : key === "symmetric_key" ? "symmetricKey" : "privateKey";
    if (showSysSecrets[field]) {
      setSysForm(p => ({ ...p, [field]: sysCfg?.[`${field}Masked`] || "" }));
      setShowSysSecrets(p => ({ ...p, [field]: false }));
      return;
    }
    try {
      const res = await apiRequest("POST", "/api/system-settings/bidv/reveal", { key });
      const data = await res.json();
      setSysForm(p => ({ ...p, [field]: data.value || "" }));
      setShowSysSecrets(p => ({ ...p, [field]: true }));
    } catch (err: any) {
      toast({ title: "Không thể hiển thị", description: err?.message || "Không đọc được giá trị đã lưu", variant: "destructive" });
    }
  };

  const handleTestSystem = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiRequest("POST", "/api/bidv/test-system-connection", {
        clientId: sysForm.clientId,
        clientSecret: sysForm.clientSecret && sysForm.clientSecret !== sysCfg?.clientSecretMasked ? sysForm.clientSecret : "__USE_SAVED__",
        environment: sysForm.environment,
        publicCert: sysForm.publicCert,
        privateKey: sysForm.privateKey && sysForm.privateKey !== sysCfg?.privateKeyMasked ? sysForm.privateKey : "__USE_SAVED__",
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      toast({ title: "Lỗi kết nối", description: err?.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveLocation = async () => {
    if (!selectedLocationId) return;
    setLocSaving(true);
    try {
      await apiRequest("PUT", "/api/bidv/location-config", {
        locationId: selectedLocationId,
        serviceId: locForm.serviceId,
        merchantId: locForm.merchantId && locForm.merchantId !== locCfg?.merchantIdMasked ? locForm.merchantId : undefined,
        secretCode: locForm.secretCode && locForm.secretCode !== locCfg?.secretCodeMasked ? locForm.secretCode : undefined,
        receiveAccount: locForm.receiveAccount,
        accountName: locForm.accountName,
        vaPrefix: locForm.vaPrefix || undefined,
        isEnabled: locForm.isEnabled,
        isQrEnabled: locForm.isQrEnabled,
        autoReconcile: locForm.autoReconcile,
        notes: locForm.notes,
      });
      toast({ title: "Đã lưu cấu hình BIDV cho cơ sở" });
      refetchLoc();
    } catch (err: any) {
      toast({ title: "Lỗi lưu cấu hình", description: err?.message, variant: "destructive" });
    } finally {
      setLocSaving(false);
    }
  };

  const revealLocationSecret = async (key: "merchant_id" | "secret_code") => {
    const field = key === "merchant_id" ? "merchantId" : "secretCode";
    const isShown = key === "merchant_id" ? showMerchantId : showSecretCode;
    if (isShown) {
      setLocForm(p => ({ ...p, [field]: locCfg?.[`${field}Masked`] || "" }));
      if (key === "merchant_id") setShowMerchantId(false);
      else setShowSecretCode(false);
      return;
    }
    try {
      const res = await apiRequest("POST", "/api/bidv/location-config/reveal", { locationId: selectedLocationId, key });
      const data = await res.json();
      setLocForm(p => ({ ...p, [field]: data.value || "" }));
      if (key === "merchant_id") setShowMerchantId(true);
      else setShowSecretCode(true);
    } catch (err: any) {
      toast({ title: "Không thể hiển thị", description: err?.message || "Không đọc được giá trị đã lưu", variant: "destructive" });
    }
  };

  const handleValidateLocation = async () => {
    if (!selectedLocationId) return;
    setValidating(true);
    setValidateResult(null);
    try {
      const res = await apiRequest("POST", "/api/bidv/test-location-config", {
        locationId: selectedLocationId,
        serviceId: locForm.serviceId,
        merchantId: locForm.merchantId && locForm.merchantId !== locCfg?.merchantIdMasked ? locForm.merchantId : undefined,
        secretCode: locForm.secretCode && locForm.secretCode !== locCfg?.secretCodeMasked ? locForm.secretCode : "__USE_SAVED__",
        receiveAccount: locForm.receiveAccount,
      });
      const data = await res.json();
      setValidateResult(data);
    } catch (err: any) {
      setValidateResult({ ok: false, message: err?.message || "Lỗi kiểm tra" });
    } finally {
      setValidating(false);
    }
  };

  const handleCertUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCertFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => setSysForm(p => ({ ...p, publicCert: (ev.target?.result as string) || "" }));
    reader.readAsText(file);
  };

  const handleKeyUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setKeyFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => setSysForm(p => ({ ...p, privateKey: (ev.target?.result as string) || "" }));
    reader.readAsText(file);
  };

  const handleBidvResponseCertUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBidvResponseCertFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => setSysForm(p => ({ ...p, bidvResponseCert: (ev.target?.result as string) || "" }));
    reader.readAsText(file);
  };

  const StatusBadge = ({ status, label, msg }: { status: "ok" | "error" | "skip"; label: string; msg?: string }) => (
    <div
      title={msg}
      className={cn(
        "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border cursor-default",
        status === "ok" ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-950 dark:text-green-300 dark:border-green-700" :
        status === "error" ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-950 dark:text-red-300 dark:border-red-800" :
        "bg-muted/40 border-border text-muted-foreground"
      )}
    >
      {status === "ok" && <CheckCircle2 className="w-3 h-3 shrink-0" />}
      {status === "error" && <XCircle className="w-3 h-3 shrink-0" />}
      {status === "skip" && <div className="w-3 h-3 rounded-full border-2 border-current shrink-0" />}
      <span>{label}</span>
    </div>
  );

  return (
    <div className="p-4 space-y-5 overflow-y-auto" style={{ maxHeight: 560 }}>
      {/* ── System Config (Super Admin only) ── */}
      {isSuperAdmin && (
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/40 border-b flex items-center gap-2">
            <Server className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cấu hình hệ thống BIDV</span>
            <Badge variant="outline" className="text-[10px] h-4 ml-auto px-1.5">Super Admin</Badge>
          </div>

          <div className="p-4 space-y-4">
            {/* Environment */}
            <div className="flex items-center gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Môi trường <span className="text-destructive">*</span></label>
                <Select value={sysForm.environment} onValueChange={v => setSysForm(p => ({ ...p, environment: v }))}>
                  <SelectTrigger className="w-44" data-testid="select-bidv-environment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UAT">UAT (Kiểm thử)</SelectItem>
                    <SelectItem value="Production">Production</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {sysForm.environment === "UAT" && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-700 rounded px-2.5 py-1.5 mt-5">
                  UAT: <code className="font-mono">bidv.net:9303</code>
                </p>
              )}
            </div>

            {/* Provider ID + Client ID */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">Provider ID</label>
                <Input
                  value={sysForm.providerId}
                  onChange={e => setSysForm(p => ({ ...p, providerId: e.target.value }))}
                  placeholder="Mã nhà cung cấp do BIDV cấp"
                  maxLength={3}
                  data-testid="input-bidv-provider-id"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Client ID <span className="text-destructive">*</span></label>
                <Input
                  value={sysForm.clientId}
                  onChange={e => setSysForm(p => ({ ...p, clientId: e.target.value }))}
                  placeholder="BIDV cấp"
                  data-testid="input-bidv-client-id"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Client Secret <span className="text-destructive">*</span>
                  {sysHas.clientSecret && <span className="ml-2 text-[11px] font-normal text-muted-foreground">(đã lưu)</span>}
                </label>
                <div className="relative">
                  <Input
                    type={showSysSecrets.clientSecret ? "text" : "password"}
                    value={sysForm.clientSecret}
                    onChange={e => setSysForm(p => ({ ...p, clientSecret: e.target.value }))}
                    placeholder={sysHas.clientSecret ? "Nhập mới để thay đổi" : "BIDV cấp"}
                    className="pr-10"
                    data-testid="input-bidv-client-secret"
                  />
                  <button type="button" onClick={() => setShowSysSecrets(p => ({ ...p, clientSecret: !p.clientSecret }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showSysSecrets.clientSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Symmetric Key */}
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Symmetric Key (JWE) <span className="text-destructive">*</span>
                {sysHas.symmetricKey && <span className="ml-2 text-[11px] font-normal text-muted-foreground">(đã lưu)</span>}
              </label>
              <div className="relative">
                <Input
                  type={showSysSecrets.symmetricKey ? "text" : "password"}
                  value={sysForm.symmetricKey}
                  onChange={e => setSysForm(p => ({ ...p, symmetricKey: e.target.value }))}
                  placeholder={sysHas.symmetricKey ? "Nhập mới để thay đổi" : "Key mã hóa JWE do BIDV cấp"}
                  className="pr-10"
                  data-testid="input-bidv-symmetric-key"
                />
                <button type="button" onClick={() => setShowSysSecrets(p => ({ ...p, symmetricKey: !p.symmetricKey }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showSysSecrets.symmetricKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Public Cert */}
            <div>
              <label className="block text-sm font-medium mb-1.5">Public Certificate <span className="text-destructive">*</span></label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs border rounded-md px-3 py-1.5 bg-background hover:bg-muted transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    Upload .cer / .pem / .crt
                    <input type="file" accept=".cer,.pem,.crt" className="hidden" onChange={handleCertUpload} data-testid="input-bidv-cert-file" />
                  </label>
                  {certFileName && <span className="text-xs text-green-600">✓ {certFileName}</span>}
                </div>
                <textarea
                  className="w-full h-24 text-xs font-mono border rounded-md p-2.5 bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50"
                  value={sysForm.publicCert}
                  onChange={e => setSysForm(p => ({ ...p, publicCert: e.target.value }))}
                  placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                  data-testid="textarea-bidv-public-cert"
                />
              </div>
            </div>

            {/* Private Key */}
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Certificate BIDV (xác minh response đối soát) <span className="text-destructive">*</span>
              </label>
              <p className="mb-2 text-xs text-muted-foreground">
                Dùng certificate BIDV cấp để xác minh chữ ký X-JWS-Signature của file đối soát.
                Không dùng certificate đối tác ở ô Public Certificate phía trên.
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs border rounded-md px-3 py-1.5 bg-background hover:bg-muted transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    Upload .cer / .pem / .crt
                    <input type="file" accept=".cer,.pem,.crt" className="hidden" onChange={handleBidvResponseCertUpload} data-testid="input-bidv-response-cert-file" />
                  </label>
                  {bidvResponseCertFileName && <span className="text-xs text-green-600">✓ {bidvResponseCertFileName}</span>}
                </div>
                <textarea
                  className="w-full h-24 text-xs font-mono border rounded-md p-2.5 bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50"
                  value={sysForm.bidvResponseCert}
                  onChange={e => setSysForm(p => ({ ...p, bidvResponseCert: e.target.value }))}
                  placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                  data-testid="textarea-bidv-response-cert"
                />
              </div>
            </div>

            {/* Private Key */}
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Private Key <span className="text-destructive">*</span>
                {sysHas.privateKey && !keyFileName && <span className="ml-2 text-[11px] font-normal text-green-600">✓ đã có</span>}
              </label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs border rounded-md px-3 py-1.5 bg-background hover:bg-muted transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    Upload .key / .pem
                    <input type="file" accept=".key,.pem" className="hidden" onChange={handleKeyUpload} data-testid="input-bidv-key-file" />
                  </label>
                  {keyFileName && <span className="text-xs text-green-600">✓ {keyFileName}</span>}
                </div>
                {(sysForm.privateKey || !sysHas.privateKey) && (
                  <textarea
                    className="w-full h-20 text-xs font-mono border rounded-md p-2.5 bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50"
                    value={sysForm.privateKey}
                    onChange={e => setSysForm(p => ({ ...p, privateKey: e.target.value }))}
                    placeholder={"-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"}
                    data-testid="textarea-bidv-private-key"
                  />
                )}
              </div>
            </div>

            {/* Optional / advanced */}
            <details className="group">
              <summary className="cursor-pointer list-none flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground select-none">
                <ChevronRight className="w-4 h-4 group-open:rotate-90 transition-transform" />
                Tuỳ chọn nâng cao
              </summary>
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Timeout (giây)</label>
                    <Input type="number" min={1} value={sysForm.timeout} onChange={e => setSysForm(p => ({ ...p, timeout: e.target.value }))} placeholder="30" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Retry Count</label>
                    <Input type="number" min={0} value={sysForm.retryCount} onChange={e => setSysForm(p => ({ ...p, retryCount: e.target.value }))} placeholder="3" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Token Buffer (giây)</label>
                    <Input type="number" min={0} value={sysForm.tokenBuffer} onChange={e => setSysForm(p => ({ ...p, tokenBuffer: e.target.value }))} placeholder="300" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Ghi chú nội bộ</label>
                  <Input value={sysForm.notes} onChange={e => setSysForm(p => ({ ...p, notes: e.target.value }))} placeholder="Ghi chú..." />
                </div>
              </div>
            </details>

            {/* System actions */}
            <div className="flex items-start gap-3 pt-2 border-t flex-wrap">
              <Button size="sm" variant="outline" onClick={handleSaveSystem} disabled={sysSaving} data-testid="button-bidv-save-system">
                {sysSaving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Lưu cấu hình
              </Button>
              <Button size="sm" onClick={handleTestSystem} disabled={testing} data-testid="button-bidv-test-system">
                {testing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5 mr-1.5" />}
                Kiểm tra kết nối
              </Button>

              {testResult && (
                <div className="w-full flex flex-col gap-2 mt-1">
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status={testResult.oauth} label="OAuth" msg={testResult.messages?.oauth} />
                    <StatusBadge status={testResult.certificate} label="Certificate" msg={testResult.messages?.certificate} />
                    <StatusBadge status={testResult.signature} label="Signature" msg={testResult.messages?.signature} />
                    <StatusBadge status={testResult.apiReachable} label="API Reachable" msg={testResult.messages?.apiReachable} />
                  </div>
                  {Object.keys(testResult.messages || {}).length > 0 && (
                    <div className="space-y-0.5">
                      {Object.entries(testResult.messages).map(([k, v]) => (
                        <p key={k} className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground capitalize">{k}:</span> {v as string}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Location Config ── */}
      <div className="border rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/40 border-b flex items-center gap-2">
          <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cấu hình theo cơ sở</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr]">
          {/* Location sidebar */}
          <div className="border-b lg:border-b-0 lg:border-r p-2 space-y-1">
            {(locations as any[] || []).map((loc: any) => (
              <button
                key={loc.id}
                onClick={() => { setSelectedLocationId(loc.id); setValidateResult(null); }}
                data-testid={`button-bidv-loc-${loc.id}`}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                  loc.id === selectedLocationId ? "bg-primary text-primary-foreground" : "hover:bg-accent text-foreground"
                )}
              >
                {loc.name}
              </button>
            ))}
            {(locations as any[] || []).length === 0 && (
              <p className="text-xs text-muted-foreground px-3 py-2">Chưa có cơ sở</p>
            )}
          </div>

          {/* Location form */}
          <div className="p-4">
            {!selectedLocationId ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">Chọn cơ sở bên trái</div>
            ) : (
              <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Service ID <span className="text-destructive">*</span></label>
                    <Input
                      value={locForm.serviceId}
                      onChange={e => setLocForm(p => ({ ...p, serviceId: e.target.value }))}
                      placeholder="BIDV cấp cho trung tâm"
                      data-testid="input-bidv-service-id"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Merchant ID <span className="text-destructive">*</span></label>
                    <Input
                      value={locForm.merchantId}
                      onChange={e => setLocForm(p => ({ ...p, merchantId: e.target.value }))}
                      placeholder="Mã doanh nghiệp trên BIDV"
                      data-testid="input-bidv-merchant-id"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Secret Code <span className="text-destructive">*</span>
                    {locHasSecretCode && <span className="ml-2 text-[11px] font-normal text-muted-foreground">(đã lưu — nhập mới để thay đổi)</span>}
                  </label>
                  <div className="relative">
                    <Input
                      type={showSecretCode ? "text" : "password"}
                      value={locForm.secretCode}
                      onChange={e => setLocForm(p => ({ ...p, secretCode: e.target.value }))}
                      placeholder={locHasSecretCode ? "Nhập mới để thay đổi" : "BIDV cấp"}
                      className="pr-10"
                      data-testid="input-bidv-secret-code"
                    />
                    <button type="button" onClick={() => setShowSecretCode(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showSecretCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Tài khoản nhận tiền <span className="text-destructive">*</span></label>
                    <Input
                      value={locForm.receiveAccount}
                      onChange={e => setLocForm(p => ({ ...p, receiveAccount: e.target.value }))}
                      placeholder="STK BIDV nhận thanh toán"
                      data-testid="input-bidv-receive-account"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Prefix Virtual Account</label>
                    <Input
                      value={locForm.vaPrefix}
                      onChange={e => setLocForm(p => ({ ...p, vaPrefix: e.target.value.toUpperCase() }))}
                      placeholder="VD: EDU01"
                      maxLength={10}
                      className="font-mono uppercase"
                      data-testid="input-bidv-va-prefix"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">Do BIDV cung cấp — nhập mã prefix được cấp thủ công</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">Tên tài khoản nhận tiền</label>
                  <Input
                    value={locForm.accountName}
                    onChange={e => setLocForm(p => ({ ...p, accountName: e.target.value }))}
                    placeholder="VD: TRUNG TAM NGOAI NGU MINH KHAI"
                    data-testid="input-bidv-account-name"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Hiển thị cho học viên khi thanh toán — không dùng để xác định giao dịch</p>
                </div>

                <div className="flex items-center gap-6 py-1">
                  <button
                    type="button"
                    onClick={() => setLocForm(p => ({ ...p, isEnabled: !p.isEnabled }))}
                    className="flex items-center gap-2 text-sm"
                    data-testid="toggle-bidv-enabled"
                  >
                    {locForm.isEnabled ? <ToggleRight className="w-5 h-5 text-primary" /> : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                    Bật thanh toán BIDV
                  </button>
                  <div className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={locForm.isQrEnabled}
                      onCheckedChange={(checked) => setLocForm(p => ({ ...p, isQrEnabled: checked }))}
                      data-testid="switch-bidv-qr-enabled"
                    />
                    <span>Bật QR</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLocForm(p => ({ ...p, autoReconcile: !p.autoReconcile }))}
                    className="flex items-center gap-2 text-sm"
                    data-testid="toggle-bidv-reconcile"
                  >
                    {locForm.autoReconcile ? <ToggleRight className="w-5 h-5 text-primary" /> : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                    Tự động đối soát
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">Ghi chú</label>
                  <Input
                    value={locForm.notes}
                    onChange={e => setLocForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Tùy chọn..."
                    data-testid="input-bidv-loc-notes"
                  />
                </div>

                <div className="flex items-center gap-3 pt-2 border-t flex-wrap">
                  <Button size="sm" variant="outline" onClick={handleSaveLocation} disabled={locSaving} data-testid="button-bidv-save-location">
                    {locSaving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                    Lưu cấu hình
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleValidateLocation} disabled={validating} data-testid="button-bidv-validate">
                    {validating && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                    Kiểm tra
                  </Button>
                  {validateResult && (
                    <span className={cn("flex items-center gap-1.5 text-xs font-medium", validateResult.ok ? "text-green-600" : "text-red-600")}>
                      {validateResult.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                      {validateResult.message}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HolidaysManager({ canAdd, canEdit, canDelete }: { canAdd: boolean; canEdit: boolean; canDelete: boolean }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", startDate: "", endDate: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: holidays = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/public-holidays"],
    queryFn: () => apiRequest("GET", "/api/public-holidays").then(r => r.json()),
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", startDate: "", endDate: "", description: "" });
    setDialogOpen(true);
  };

  const openEdit = (h: any) => {
    setEditing(h);
    setForm({
      name: h.name,
      startDate: h.startDate ?? "",
      endDate: h.endDate ?? "",
      description: h.description ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Lỗi", description: "Vui lòng nhập tên nghỉ lễ.", variant: "destructive" }); return; }
    if (!form.startDate || !form.endDate) { toast({ title: "Lỗi", description: "Vui lòng chọn khoảng thời gian.", variant: "destructive" }); return; }
    if (form.endDate < form.startDate) { toast({ title: "Lỗi", description: "Ngày kết thúc phải sau ngày bắt đầu.", variant: "destructive" }); return; }
    setSaving(true);
    try {
      if (editing) {
        await apiRequest("PUT", `/api/public-holidays/${editing.id}`, form);
        toast({ title: "Thành công", description: "Đã cập nhật ngày nghỉ lễ." });
      } else {
        await apiRequest("POST", "/api/public-holidays", form);
        toast({ title: "Thành công", description: "Đã thêm ngày nghỉ lễ." });
      }
      setDialogOpen(false);
      setEditing(null);
      refetch();
    } catch (err: any) {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await apiRequest("DELETE", `/api/public-holidays/${id}`);
      toast({ title: "Thành công", description: "Đã xóa ngày nghỉ lễ." });
      refetch();
    } catch (err: any) {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const formatDateRange = (start: string, end: string) => {
    if (!start && !end) return "—";
    const fmt = (d: string) => {
      if (!d) return "";
      const [y, m, day] = d.split("-");
      return `${day}/${m}/${y}`;
    };
    return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold flex items-center gap-2"><CalendarDays className="w-5 h-5" />Danh sách Ngày nghỉ lễ</h2>
        {canAdd && (
          <Button onClick={openAdd} size="sm">
            <Plus className="w-4 h-4 mr-1.5" />Thêm ngày nghỉ lễ
          </Button>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Sửa ngày nghỉ lễ" : "Thêm ngày nghỉ lễ"}</DialogTitle>
            <DialogDescription>Nhập thông tin ngày nghỉ lễ.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-sm font-medium mb-1.5">Tên nghỉ lễ <span className="text-destructive">*</span></label>
              <Input
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Ví dụ: Tết Nguyên Đán"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Khoảng thời gian <span className="text-destructive">*</span></label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                  className="flex-1"
                />
                <span className="text-muted-foreground text-sm">–</span>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                  className="flex-1"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Mô tả</label>
              <Input
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Tùy chọn..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              {editing ? "Cập nhật" : "Thêm mới"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : holidays.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-sm text-muted-foreground gap-2">
          <CalendarDays className="w-8 h-8 opacity-30" />
          <span>Chưa có ngày nghỉ lễ nào.</span>
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tên nghỉ lễ</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Khoảng thời gian</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mô tả</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((h: any, i: number) => (
                <tr key={h.id} className={cn("border-t", i % 2 === 0 ? "bg-background" : "bg-muted/20")}>
                  <td className="px-4 py-3 font-medium">{h.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateRange(h.startDate, h.endDate)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{h.description || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(h)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(h.id)} disabled={deletingId === h.id}>
                          {deletingId === h.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
