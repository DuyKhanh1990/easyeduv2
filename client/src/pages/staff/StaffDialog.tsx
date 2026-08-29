import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertStaffSchema } from "@shared/schema";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { useLocations } from "@/hooks/use-locations";
import { useDepartments } from "@/hooks/use-departments";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Radio, UserRound, UsersRound, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  fullName: z.string().min(1, "Tên là bắt buộc"),
  code: z.string().min(1, "Mã là bắt buộc"),
  username: z.string().min(1, "Tài khoản là bắt buộc"),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự").optional(),
  phone: z.string().optional().nullable(),
  email: z.string().email("Email không hợp lệ").optional().nullable().or(z.literal("")),
  address: z.string().optional().nullable(),
  status: z.string().default("Hoạt động"),
  dateOfBirth: z.string().optional().nullable(),
  locationIds: z.array(z.string()).min(1, "Cơ sở là bắt buộc"),
  departmentIds: z.array(z.string()).min(1, "Phòng ban là bắt buộc"),
  roleIds: z.array(z.string()).min(1, "Vai trò là bắt buộc"),
  omicallExtensions: z.record(z.string(), z.string().max(50)).default({}),
  omicallPasswords: z.record(z.string(), z.string().max(255)).default({}),
});

type FormValues = z.infer<typeof formSchema>;

interface StaffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff?: any;
  allStaff?: any[];
}

export function StaffDialog({ open, onOpenChange, staff, allStaff = [] }: StaffDialogProps) {
  const { data: locations } = useLocations();
  const { data: departments } = useDepartments();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [visibleOmicallPasswords, setVisibleOmicallPasswords] = useState<Record<string, boolean>>({});

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      locationIds: [],
      departmentIds: [],
      roleIds: [],
      omicallExtensions: {},
      omicallPasswords: {},
      code: "",
      username: "",
      password: "123456",
      phone: "",
      email: "",
      address: "",
      status: "Hoạt động",
      dateOfBirth: "",
    },
  });

  useEffect(() => {
    if (open) {
      setShowPassword(false);
      setVisibleOmicallPasswords({});
      form.reset({
        fullName: staff?.fullName || "",
        locationIds: (staff?.locationIds || []).filter(Boolean),
        departmentIds: (staff?.departmentIds || []).filter(Boolean),
        roleIds: (staff?.roleIds || []).filter(Boolean),
        omicallExtensions: Object.fromEntries(
          (staff?.assignments || []).map((assignment: any) => [
            assignment.locationId,
            (assignment.omicallExtension || "").split("|", 1)[0].trim(),
          ]),
        ),
        // Passwords are never returned by the server. An empty value keeps the saved password.
        omicallPasswords: Object.fromEntries(
          (staff?.assignments || []).map((assignment: any) => [assignment.locationId, ""]),
        ),
        code: staff?.code || "",
        username: staff?.username || "",
        password: "123456",
        phone: staff?.phone || "",
        email: staff?.email || "",
        address: staff?.address || "",
        status: staff?.status || "Hoạt động",
        dateOfBirth: staff?.dateOfBirth ? new Date(staff.dateOfBirth).toISOString().split('T')[0] : "",
      });
    }
  }, [open, staff]);

  const selectedDepts = form.watch("departmentIds");
  const selectedRoles = form.watch("roleIds");
  const selectedLocationIds = form.watch("locationIds");
  const omicallExtensions = form.watch("omicallExtensions");
  const omicallPasswords = form.watch("omicallPasswords");

  const staffDepartments = departments?.filter((d: any) => {
    const roles: any[] = d.roles ?? [];
    if (roles.length === 0) return true;
    return roles.some((r: any) => !["Học viên", "Phụ huynh"].includes(r.name));
  }) ?? [];

  // Update code based on roles (only when creating new staff)
  useEffect(() => {
    if (!staff && selectedRoles.length > 0 && departments) {
      const allRoles = departments.flatMap(d => d.roles);
      const firstRole = allRoles.find(role => role.id === selectedRoles[0]);
      if (!firstRole) return;

      const abbreviation = firstRole.name
        .split(" ")
        .map((word: string) => word[0]?.toUpperCase() || "")
        .join("");
      const prefix = abbreviation + "-";

      const existingNumbers = allStaff
        .map(s => s.code)
        .filter(code => code && code.startsWith(prefix))
        .map(code => parseInt(code.substring(prefix.length), 10))
        .filter(n => !isNaN(n));

      const nextNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
      const newCode = `${prefix}${nextNum.toString().padStart(2, "0")}`;
      form.setValue("code", newCode);
      form.setValue("username", newCode.toLowerCase());
    }
  }, [selectedRoles, departments, staff]);

  const availableRoles = staffDepartments
    .filter((d: any) => selectedDepts.includes(d.id))
    .flatMap((d: any) => d.roles) || [];

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    form.handleSubmit(onSubmit)(e);
  };

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    try {
      // Chuyển đổi chuỗi rỗng thành null cho trường ngày sinh
      const payload = {
        ...values,
        dateOfBirth: values.dateOfBirth === "" ? null : values.dateOfBirth,
        locationIds: values.locationIds || [],
        departmentIds: values.departmentIds || [],
        roleIds: values.roleIds || [],
        omicallExtensions: values.omicallExtensions || {},
        omicallPasswords: values.omicallPasswords || {},
      };

      if (staff) {
        await apiRequest("PUT", `/api/staff/${staff.id}`, payload);
        toast({ title: "Thành công", description: "Cập nhật nhân sự thành công" });
      } else {
        await apiRequest("POST", "/api/staff", payload);
        toast({ title: "Thành công", description: "Thêm mới nhân sự thành công" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      onOpenChange(false);
    } catch (error: any) {
      console.error("Submit staff error details:", error);
      toast({
        title: "Lỗi",
        description: error.message || "Có lỗi xảy ra khi lưu dữ liệu",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const FL = "text-[11px] font-semibold text-slate-500 uppercase tracking-wide";
  const INP = "h-10 rounded-xl border-slate-200 bg-white text-sm shadow-sm transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-100";
  const SELECT = "h-10 rounded-xl border-slate-200 bg-white text-sm shadow-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto bg-slate-50 p-0 gap-0 rounded-2xl border-slate-200 shadow-2xl">
        <DialogHeader className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
          <DialogTitle className="flex items-center gap-3 text-lg font-bold text-slate-800">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm shadow-sky-200">
              <UserRound className="h-4 w-4" />
            </span>
            <span>{staff ? "Chỉnh sửa nhân sự" : "Thêm mới nhân sự"}</span>
          </DialogTitle>
          <p className="pl-12 text-xs text-slate-500">
            {staff ? "Cập nhật thông tin và phân công cho nhân sự." : "Điền thông tin để tạo hồ sơ nhân sự mới."}
          </p>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleManualSubmit} className="space-y-5 p-5 sm:p-6">
            <div className="overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/70 to-blue-50/30">
              <div className="flex items-center gap-3 border-b border-sky-100 bg-white/60 px-5 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm">
                  <UsersRound className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="text-sm font-bold leading-none text-sky-800">Thông tin cơ bản</p>
                  <p className="mt-0.5 text-[11px] text-sky-500">Thông tin định danh, phân công và liên hệ</p>
                </div>
              </div>
              <div className="space-y-5 p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FormField
                control={form.control}
                name="locationIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={FL}>Cơ sở *</FormLabel>
                    <FormControl>
                      <MultiSelect
                        options={locations?.map(l => ({ label: l.name, value: l.id })) || []}
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        placeholder="Chọn cơ sở"
                        className="rounded-xl border-slate-200 bg-white"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="departmentIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={FL}>Phòng ban *</FormLabel>
                    <FormControl>
                      <MultiSelect
                        options={staffDepartments.map((d: any) => ({ label: d.name, value: d.id }))}
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        placeholder="Chọn phòng ban"
                        className="rounded-xl border-slate-200 bg-white"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="roleIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={FL}>Vai trò *</FormLabel>
                    <FormControl>
                      <MultiSelect
                        options={availableRoles.map(r => ({ label: r.name, value: r.id }))}
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        placeholder="Chọn vai trò"
                        disabled={selectedDepts.length === 0}
                        className="rounded-xl border-slate-200 bg-white"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={FL}>Tên *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Họ và tên" className={INP} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={FL}>Mã</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="VD: GV-01" className={INP} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={FL}>Tài khoản</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} className={INP} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={FL}>Mật khẩu</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          type={showPassword ? "text" : "password"}
                          className={cn(INP, "pr-10")}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((visible) => !visible)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                          aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                          aria-pressed={showPassword}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={FL}>Số điện thoại</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} className={INP} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FormField
                control={form.control}
                name="dateOfBirth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={FL}>Sinh nhật</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} type="date" className={INP} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={FL}>Email</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} type="email" className={INP} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={FL}>Địa chỉ</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} className={INP} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={FL}>Trạng thái</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className={SELECT}>
                          <SelectValue placeholder="Chọn trạng thái" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Hoạt động">Hoạt động</SelectItem>
                        <SelectItem value="Không hoạt động">Không hoạt động</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

              </div>
            </div>

            {selectedLocationIds.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-violet-50/40">
                <div className="flex items-center gap-3 border-b border-indigo-100 bg-white/60 px-5 py-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
                    <Radio className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold leading-none text-indigo-900">Liên kết tổng đài</p>
                    <p className="mt-0.5 text-[11px] text-indigo-700/80">
                    Nhập số máy lẻ và mật khẩu tổng đài do từng khách hàng/cơ sở cấp cho nhân sự này.
                    </p>
                  </div>
                </div>
                <div className="space-y-3 p-5">
                  {selectedLocationIds.map((locationId) => {
                    const location = locations?.find((item) => item.id === locationId);
                     const assignment = staff?.assignments?.find((item: any) => item.locationId === locationId);
                    return (
                      <div key={locationId}>
                         <p className="mb-1 text-xs font-semibold text-indigo-900">{location?.name || "Cơ sở"}</p>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                           <div>
                              <FormLabel className={FL}>Số máy lẻ</FormLabel>
                             <Input
                               value={omicallExtensions?.[locationId] || ""}
                               onChange={(event) =>
                                 form.setValue("omicallExtensions", {
                                   ...(form.getValues("omicallExtensions") || {}),
                                   [locationId]: event.target.value.split("|", 1)[0].trim(),
                                 }, { shouldDirty: true })
                               }
                               placeholder="Ví dụ: 102"
                                className={cn(INP, "mt-1")}
                               data-testid={`input-omicall-extension-${locationId}`}
                             />
                           </div>
                           <div>
                              <FormLabel className={FL}>
                               Mật khẩu máy lẻ {assignment?.omicallPasswordConfigured ? "(đã lưu)" : ""}
                             </FormLabel>
                              <div className="relative">
                                <Input
                                  type={visibleOmicallPasswords[locationId] ? "text" : "password"}
                                  value={omicallPasswords?.[locationId] || ""}
                                  onChange={(event) =>
                                    form.setValue("omicallPasswords", {
                                      ...(form.getValues("omicallPasswords") || {}),
                                      [locationId]: event.target.value,
                                    }, { shouldDirty: true })
                                  }
                                  placeholder={assignment?.omicallPasswordConfigured ? "Để trống để giữ nguyên" : "Nhập mật khẩu máy lẻ"}
                                  className={cn(INP, "mt-1 pr-10")}
                                  data-testid={`input-omicall-password-${locationId}`}
                                />
                                <button
                                  type="button"
                                  onClick={() => setVisibleOmicallPasswords((current) => ({
                                    ...current,
                                    [locationId]: !current[locationId],
                                  }))}
                                  className="absolute right-2 top-1/2 mt-0.5 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                                  aria-label={visibleOmicallPasswords[locationId] ? "Ẩn mật khẩu máy lẻ" : "Hiện mật khẩu máy lẻ"}
                                  aria-pressed={Boolean(visibleOmicallPasswords[locationId])}
                                >
                                  {visibleOmicallPasswords[locationId] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                              </div>
                           </div>
                         </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <DialogFooter className="border-t border-slate-200 pt-5">
              <Button type="button" variant="outline" className="h-10 rounded-xl border-slate-200 px-5 font-semibold hover:bg-white" onClick={() => onOpenChange(false)}>
                Hủy
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting} 
                className="h-10 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-6 font-semibold shadow-md shadow-sky-200 hover:from-sky-600 hover:to-blue-700"
              >
                {staff ? "Cập nhật" : "Lưu"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
