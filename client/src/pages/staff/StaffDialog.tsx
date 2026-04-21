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

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      locationIds: [],
      departmentIds: [],
      roleIds: [],
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
      form.reset({
        fullName: staff?.fullName || "",
        locationIds: staff?.locationIds || [],
        departmentIds: staff?.departmentIds || [],
        roleIds: staff?.roleIds || [],
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

  const availableRoles = departments
    ?.filter((d) => selectedDepts.includes(d.id))
    .flatMap((d) => d.roles) || [];

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Manual submit triggered");
    form.handleSubmit(onSubmit)(e);
  };

  async function onSubmit(values: FormValues) {
    console.log("onSubmit called with values:", values);
    setIsSubmitting(true);
    try {
      // Chuyển đổi chuỗi rỗng thành null cho trường ngày sinh
      const payload = {
        ...values,
        dateOfBirth: values.dateOfBirth === "" ? null : values.dateOfBirth,
        locationIds: values.locationIds || [],
        departmentIds: values.departmentIds || [],
        roleIds: values.roleIds || [],
      };

      console.log("Submitting staff payload:", payload);

      if (staff) {
        const res = await apiRequest("PUT", `/api/staff/${staff.id}`, payload);
        console.log("Update staff response:", res);
        toast({ title: "Thành công", description: "Cập nhật nhân sự thành công" });
      } else {
        const res = await apiRequest("POST", "/api/staff", payload);
        console.log("Create staff response:", res);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{staff ? "Chỉnh sửa nhân sự" : "Thêm mới nhân sự"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <FormField
                control={form.control}
                name="locationIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cơ sở *</FormLabel>
                    <FormControl>
                      <MultiSelect
                        options={locations?.map(l => ({ label: l.name, value: l.id })) || []}
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        placeholder="Chọn cơ sở"
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
                    <FormLabel>Phòng ban *</FormLabel>
                    <FormControl>
                      <MultiSelect
                        options={departments?.map(d => ({ label: d.name, value: d.id })) || []}
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        placeholder="Chọn phòng ban"
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
                    <FormLabel>Vai trò *</FormLabel>
                    <FormControl>
                      <MultiSelect
                        options={availableRoles.map(r => ({ label: r.name, value: r.id }))}
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        placeholder="Chọn vai trò"
                        disabled={selectedDepts.length === 0}
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
                    <FormLabel>Tên *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Họ và tên" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-4 gap-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mã</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="VD: GV-01" />
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
                    <FormLabel>Tài khoản</FormLabel>
                    <FormControl>
                      <Input {...field} />
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
                    <FormLabel>Mật khẩu</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" />
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
                    <FormLabel>Số điện thoại</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-4 gap-4">
              <FormField
                control={form.control}
                name="dateOfBirth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sinh nhật</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" />
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
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" />
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
                    <FormLabel>Địa chỉ</FormLabel>
                    <FormControl>
                      <Input {...field} />
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
                    <FormLabel>Trạng thái</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
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

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Hủy
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting} 
                onClick={() => {
                  console.log("Submit button clicked");
                  const errors = form.formState.errors;
                  if (Object.keys(errors).length > 0) {
                    console.log("Form validation errors:", errors);
                  }
                }}
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
