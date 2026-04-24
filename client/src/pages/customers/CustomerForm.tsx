import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLocations } from "@/hooks/use-locations";
import { useStaff } from "@/hooks/use-staff";
import { useStudents } from "@/hooks/use-students";
import { useCrmRelationships, useCrmCustomerSources, useCrmRejectReasons, useCrmRequiredFields, useCrmCustomFields, type CrmRelationship } from "@/hooks/use-crm-config";
import { getCrmFieldLabel, parseCustomFieldKey, makeCustomFieldKey } from "@/lib/crm-customer-fields";
import { User, Phone, Mail, MapPin, CalendarDays, Briefcase, GraduationCap, Camera, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { MultiSelect } from "@/components/ui/multi-select";
import type { StudentResponse } from "@shared/schema";

// Local schema subset for the form to ensure flexibility
const formSchema = z.object({
  locationIds: z.array(z.string()).min(1, "Vui lòng chọn ít nhất một cơ sở"),
  type: z.enum(["Học viên", "Phụ huynh"]),
  code: z.string().min(1, "Mã là bắt buộc"),
  fullName: z.string().min(1, "Họ và tên là bắt buộc *"),
  username: z.string().optional(),
  password: z.string().optional(),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  email: z.string().email("Email không hợp lệ").optional().or(z.literal("")).or(z.null()),
  
  parentName: z.string().optional(),
  parentPhone: z.string().optional(),
  parentName2: z.string().optional(),
  parentPhone2: z.string().optional(),
  parentName3: z.string().optional(),
  parentPhone3: z.string().optional(),
  
  address: z.string().optional(),
  socialLink: z.string().optional(),
  academicLevel: z.string().optional(),
  
  pipelineStage: z.array(z.string()).optional(),
  relationshipIds: z.array(z.string()).optional(),
  customerSourceIds: z.array(z.string()).optional(),
  classIds: z.array(z.string()).optional(),
  accountStatus: z.string().optional(),
  rejectReason: z.string().optional(),
  
  salesByIds: z.array(z.string()).optional(),
  managedByIds: z.array(z.string()).optional(),
  teacherIds: z.array(z.string()).optional(),
  parentIds: z.array(z.string()).optional(),
  
  note: z.string().optional(),
  avatarUrl: z.string().optional(),
  customFields: z.record(z.any()).optional(),
});

type FormData = z.infer<typeof formSchema>;

interface CustomerFormProps {
  initialData?: StudentResponse | null;
  onSubmit: (data: FormData) => void;
  isPending: boolean;
}

function getFormDefaults(data?: StudentResponse | null): FormData {
  return {
    locationIds: (data as any)?.locationIds || ((data as any)?.locationId ? [(data as any).locationId] : ((data as any)?.locations?.map((l: any) => l.locationId) || [])),
    type: (data?.type as "Học viên" | "Phụ huynh") || "Học viên",
    code: data?.code || "",
    fullName: data?.fullName || "",
    username: (data as any)?.username || "",
    password: (data as any)?.password || "123456",
    phone: data?.phone || "",
    dateOfBirth: data?.dateOfBirth ? new Date(data.dateOfBirth).toISOString().split("T")[0] : "",
    gender: (data as any)?.gender || "",
    email: data?.email || "",
    parentName: data?.parentName || "",
    parentPhone: data?.parentPhone || "",
    parentName2: data?.parentName2 || "",
    parentPhone2: data?.parentPhone2 || "",
    parentName3: data?.parentName3 || "",
    parentPhone3: data?.parentPhone3 || "",
    address: data?.address || "",
    socialLink: data?.socialLink || "",
    academicLevel: data?.academicLevel || "",
    pipelineStage: Array.isArray((data as any)?.pipelineStage) ? (data as any).pipelineStage : ((data as any)?.pipelineStage ? [(data as any).pipelineStage] : ["Lead"]),
    relationshipIds: (data as any)?.relationshipIds || ((data as any)?.relationships?.map((r: any) => r.relationshipId) || []),
    customerSourceIds: (data as any)?.customerSourceIds || ((data as any)?.customerSources?.map((s: any) => s.customerSourceId) || []),
    classIds: (data as any)?.classIds || [],
    accountStatus: (data as any)?.accountStatus || "Hoạt động",
    rejectReason: data?.rejectReason || "",
    salesByIds: (data as any)?.salesByIds || ((data as any)?.salesByList?.map((s: any) => s.id) || []),
    managedByIds: (data as any)?.managedByIds || ((data as any)?.managedByList?.map((s: any) => s.id) || []),
    teacherIds: (data as any)?.teacherIds || ((data as any)?.teacherList?.map((s: any) => s.id) || []),
    parentIds: (data as any)?.parentIds || [],
    note: data?.note || "",
    avatarUrl: (data as any)?.avatarUrl || "",
    customFields: ((data as any)?.customFields as Record<string, any>) || {},
  };
}

export function CustomerForm({ initialData, onSubmit, isPending }: CustomerFormProps) {
  const { toast } = useToast();

  // Required-field configuration from CRM config
  const { data: requiredFieldsData } = useCrmRequiredFields();
  const requiredKeys = useMemo(
    () => new Set((requiredFieldsData ?? []).filter(r => r.isRequired).map(r => r.fieldKey)),
    [requiredFieldsData],
  );
  const requiredKeysRef = useRef<Set<string>>(requiredKeys);
  useEffect(() => { requiredKeysRef.current = requiredKeys; }, [requiredKeys]);

  const { data: customFieldsList } = useCrmCustomFields();
  const customFieldLabelRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    customFieldLabelRef.current = new Map((customFieldsList ?? []).map(c => [c.id, c.label]));
  }, [customFieldsList]);

  // Custom resolver: zod first, then add errors for any configured required fields that are empty
  const resolver = useMemo(() => {
    const baseResolver = zodResolver(formSchema);
    return async (values: any, context: any, options: any) => {
      const result: any = await (baseResolver as any)(values, context, options);
      const errors: any = { ...(result.errors || {}) };
      const customLabelMap = customFieldLabelRef.current;
      Array.from(requiredKeysRef.current).forEach((key) => {
        const customId = parseCustomFieldKey(key);
        if (customId) {
          if (errors.customFields?.[customId]) return;
          const v = (values as any)?.customFields?.[customId];
          const isEmpty =
            v === undefined ||
            v === null ||
            v === "" ||
            (Array.isArray(v) && v.length === 0);
          if (isEmpty) {
            const label = customLabelMap.get(customId) ?? "Trường";
            errors.customFields = {
              ...(errors.customFields || {}),
              [customId]: { type: "required", message: `${label} là bắt buộc` },
            };
          }
          return;
        }
        if (errors[key]) return;
        const v = (values as any)?.[key];
        const isEmpty =
          v === undefined ||
          v === null ||
          v === "" ||
          (Array.isArray(v) && v.length === 0);
        if (isEmpty) {
          errors[key] = { type: "required", message: `${getCrmFieldLabel(key)} là bắt buộc` };
        }
      });
      return {
        values: Object.keys(errors).length > 0 ? {} : result.values,
        errors,
      };
    };
  }, []);

  const form = useForm<FormData>({
    resolver: resolver as any,
    defaultValues: getFormDefaults(initialData),
  });

  const RequiredMark = ({ k }: { k: string }) =>
    requiredKeys.has(k) ? <span className="text-destructive">*</span> : null;

  const FieldError = ({ k }: { k: string }) => {
    const err = (form.formState.errors as any)?.[k];
    if (!err?.message) return null;
    return <p className="text-xs text-destructive" data-testid={`error-${k}`}>{err.message}</p>;
  };

  const type = form.watch("type");
  const code = form.watch("code");
  const avatarUrl = form.watch("avatarUrl");

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Chỉ chấp nhận file ảnh", variant: "destructive" });
      return;
    }
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append("files", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const url = data.files?.[0]?.url;
      if (url) {
        form.setValue("avatarUrl", url);
      }
    } catch {
      toast({ title: "Tải ảnh lên thất bại", variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const { data: locations } = useLocations();
  const { data: staff } = useStaff(undefined, true);
  const { data: nextCodeData } = useQuery<{ code: string }>({
    queryKey: ["/api/students/next-code", type],
    queryFn: async () => {
      const res = await fetch(`/api/students/next-code?type=${encodeURIComponent(type)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch next customer code");
      return res.json();
    },
    enabled: !initialData,
  });
  const { data: parentsData } = useStudents({ type: "Phụ huynh", limit: 1000 });
  const { data: relationships } = useCrmRelationships();
  const { data: sources } = useCrmCustomerSources();
  const { data: rejectReasons } = useCrmRejectReasons();
  const { data: classesData } = useQuery({
    queryKey: ["/api/classes", { minimal: true }],
    queryFn: async () => {
      const res = await fetch("/api/classes?minimal=true", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch classes");
      return res.json();
    },
  });

  // Sync form values when initialData changes (e.g. opening edit dialog)
  useEffect(() => {
    if (initialData) {
      form.reset(getFormDefaults(initialData));
    }
  }, [initialData, form]);

  // Handle form submission with date formatting
  const handleFormSubmit = (data: FormData) => {
    const formattedData = {
      ...data,
      dateOfBirth: data.dateOfBirth === "" ? null : data.dateOfBirth,
      email: (data.email === "" || data.email === null) ? null : data.email,
    };
    onSubmit(formattedData as any);
  };

  const onInvalid = (errors: any) => {
    const errorMessages = Object.keys(errors)
      .map((key) => {
        const fieldName = key === "locationIds" ? "Cơ sở" : 
                        key === "fullName" ? "Họ và tên" : 
                        key === "code" ? "Mã" : key;
        return `${fieldName}: ${errors[key].message}`;
      })
      .join(", ");
    
    toast({
      title: "Lỗi nhập liệu",
      description: `Vui lòng kiểm tra: ${errorMessages}`,
      variant: "destructive",
    });
  };

  // Auto-generate code based on the highest existing code for the selected type
  useEffect(() => {
    if (!initialData && nextCodeData?.code) {
      form.setValue("code", nextCodeData.code);
      form.setValue("username", nextCodeData.code);
    }
  }, [nextCodeData, initialData, form]);

  // Sync username with code
  useEffect(() => {
    if (code) {
      form.setValue("username", code);
    }
  }, [code, form]);

  return (
    <form onSubmit={form.handleSubmit(handleFormSubmit, onInvalid)} className="space-y-8">
      {/* Section 1: Thông tin cơ bản */}
      <div className="bg-muted/30 p-6 rounded-2xl border border-border/50">
        <h3 className="text-lg font-display font-semibold mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-primary" /> Thông tin cơ bản
        </h3>

        <div className="flex gap-6 items-start">
          {/* Avatar upload square */}
          <div className="flex-shrink-0">
            <Label className="text-sm font-medium block mb-2">Ảnh đại diện <RequiredMark k="avatarUrl" /></Label>
            <div
              data-testid="avatar-upload-btn"
              onClick={() => !uploadingAvatar && avatarInputRef.current?.click()}
              className="relative w-24 h-24 rounded-xl border-2 border-dashed border-border bg-white cursor-pointer hover:border-primary/60 hover:bg-muted/50 transition-colors flex items-center justify-center overflow-hidden group"
            >
              {avatarUrl ? (
                <>
                  <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-xl" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                    <Camera className="w-5 h-5 text-white" />
                  </div>
                </>
              ) : uploadingAvatar ? (
                <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <Camera className="w-6 h-6" />
                  <span className="text-[10px]">Tải ảnh</span>
                </div>
              )}
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAvatarUpload(file);
                e.target.value = "";
              }}
            />
          </div>

          <div className="flex-1 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Cơ sở <span className="text-destructive">*</span></Label>
            <div className="relative">
              <MultiSelect
                options={locations?.map(l => ({ label: l.name, value: l.id })) || []}
                onValueChange={(val) => {
                  console.log("Location changed:", val);
                  form.setValue("locationIds", val);
                }}
                defaultValue={form.watch("locationIds") || []}
                placeholder="Chọn cơ sở"
                maxCount={3}
                modalPopover={true}
                className="bg-white opacity-100"
              />
            </div>
            {form.formState.errors.locationIds && <p className="text-xs text-destructive">{form.formState.errors.locationIds.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Phân loại <span className="text-destructive">*</span></Label>
            <Select onValueChange={(val: any) => form.setValue("type", val)} defaultValue={form.getValues("type")}>
              <SelectTrigger className="h-11 bg-white opacity-100"><SelectValue placeholder="Chọn phân loại" /></SelectTrigger>
              <SelectContent className="bg-white opacity-100 shadow-md border border-border">
                <SelectItem value="Học viên" className="focus:bg-accent">Học viên</SelectItem>
                <SelectItem value="Phụ huynh" className="focus:bg-accent">Phụ huynh</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label>Mã <span className="text-destructive">*</span></Label>
            <Input className="h-11 bg-white opacity-100" placeholder={type === "Học viên" ? "HV-01" : "PH-01"} {...form.register("code")} />
            {form.formState.errors.code && <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Tên <span className="text-destructive">*</span></Label>
            <Input className="h-11 bg-white opacity-100" placeholder="Họ và tên" {...form.register("fullName")} />
            {form.formState.errors.fullName && <p className="text-xs text-destructive">{form.formState.errors.fullName.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mt-6">
          <div className="space-y-2">
            <Label>Tài khoản <RequiredMark k="username" /></Label>
            <Input className="h-11 bg-white opacity-100" {...form.register("username")} />
            <FieldError k="username" />
          </div>
          <div className="space-y-2">
            <Label>Mật khẩu <RequiredMark k="password" /></Label>
            <Input className="h-11 bg-white opacity-100" {...form.register("password")} />
            <FieldError k="password" />
          </div>
          <div className="space-y-2">
            <Label>Sinh nhật <RequiredMark k="dateOfBirth" /></Label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input type="date" className="h-11 pl-10 bg-white opacity-100" {...form.register("dateOfBirth")} />
            </div>
            <FieldError k="dateOfBirth" />
          </div>
          <div className="space-y-2">
            <Label>Số điện thoại <RequiredMark k="phone" /></Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="h-11 pl-10 bg-white opacity-100" placeholder="090..." {...form.register("phone")} />
            </div>
            <FieldError k="phone" />
          </div>
          <div className="space-y-2">
            <Label>Email <RequiredMark k="email" /></Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input type="email" className="h-11 pl-10 bg-white opacity-100" placeholder="email@example.com" {...form.register("email")} />
            </div>
            <FieldError k="email" />
          </div>
        </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Section 2: Thông tin liên hệ & Gia đình */}
        <div className="bg-muted/30 p-6 rounded-2xl border border-border/50 space-y-6">
          <h3 className="text-lg font-display font-semibold flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" /> Liên hệ & Phụ huynh
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-4 p-4 border rounded-xl bg-white/50">
              <div className="space-y-2">
                <Label>Họ tên Phụ huynh 1 <RequiredMark k="parentName" /></Label>
                <Input className="h-11 bg-white opacity-100" placeholder="Tên phụ huynh" {...form.register("parentName")} />
                <FieldError k="parentName" />
              </div>
              <div className="space-y-2">
                <Label>SĐT Phụ huynh 1 <RequiredMark k="parentPhone" /></Label>
                <Input className="h-11 bg-white opacity-100" placeholder="090..." {...form.register("parentPhone")} />
                <FieldError k="parentPhone" />
              </div>
            </div>

            <div className="space-y-4 p-4 border rounded-xl bg-white/50">
              <div className="space-y-2">
                <Label>Họ tên Phụ huynh 2 <RequiredMark k="parentName2" /></Label>
                <Input className="h-11 bg-white opacity-100" placeholder="Tên phụ huynh" {...form.register("parentName2")} />
                <FieldError k="parentName2" />
              </div>
              <div className="space-y-2">
                <Label>SĐT Phụ huynh 2 <RequiredMark k="parentPhone2" /></Label>
                <Input className="h-11 bg-white opacity-100" placeholder="090..." {...form.register("parentPhone2")} />
                <FieldError k="parentPhone2" />
              </div>
            </div>

            <div className="space-y-4 p-4 border rounded-xl bg-white/50">
              <div className="space-y-2">
                <Label>Họ tên Phụ huynh 3 <RequiredMark k="parentName3" /></Label>
                <Input className="h-11 bg-white opacity-100" placeholder="Tên phụ huynh" {...form.register("parentName3")} />
                <FieldError k="parentName3" />
              </div>
              <div className="space-y-2">
                <Label>SĐT Phụ huynh 3 <RequiredMark k="parentPhone3" /></Label>
                <Input className="h-11 bg-white opacity-100" placeholder="090..." {...form.register("parentPhone3")} />
                <FieldError k="parentPhone3" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Mã Phụ huynh (tài khoản hệ thống) <RequiredMark k="parentIds" /></Label>
            <MultiSelect
              data-testid="select-parent-ids"
              options={
                (parentsData?.students || []).map((p: any) => ({
                  label: `${p.fullName} (${p.code})`,
                  value: p.id,
                }))
              }
              onValueChange={(val) => form.setValue("parentIds", val)}
              defaultValue={form.watch("parentIds") || []}
              placeholder="Chọn phụ huynh đã có tài khoản..."
              maxCount={5}
            />
            <p className="text-xs text-muted-foreground">Gán học viên này với tài khoản phụ huynh đã được tạo trên hệ thống.</p>
            <FieldError k="parentIds" />
          </div>
        </div>

        {/* Section 3: Phân loại & Sales */}
        <div className="bg-muted/30 p-6 rounded-2xl border border-border/50 space-y-6">
          <h3 className="text-lg font-display font-semibold flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-primary" /> Phân loại & Chăm sóc
          </h3>
          
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label>Mối quan hệ <RequiredMark k="relationshipIds" /></Label>
                <div className="relative">
                  <MultiSelect
                    options={relationships?.map((rel: any) => ({ 
                        label: rel.name, 
                        value: rel.id,
                        color: rel.color 
                      })) || []}
                    onValueChange={(val) => {
                      form.setValue("relationshipIds", val);
                      const selectedNames = relationships
                        ?.filter((r: any) => val.includes(r.id))
                        .map((r: any) => r.name) || [];
                      form.setValue("pipelineStage", selectedNames);
                    }}
                    defaultValue={form.watch("relationshipIds") || []}
                    placeholder="Chọn mối quan hệ"
                    modalPopover={true}
                    className="bg-white opacity-100"
                  />
                </div>
                <FieldError k="relationshipIds" />
              </div>
              <div className="space-y-2">
                <Label>Nguồn khách hàng <RequiredMark k="customerSourceIds" /></Label>
                <div className="relative">
                  <MultiSelect
                    options={sources?.map((source: any) => ({ label: source.name, value: source.id })) || [
                      { label: "Facebook", value: "Facebook" },
                      { label: "Google", value: "Google" },
                      { label: "Giới thiệu", value: "Referral" },
                      { label: "Trực tiếp", value: "Walk-in" },
                    ]}
                    onValueChange={(val) => form.setValue("customerSourceIds", val)}
                    defaultValue={form.watch("customerSourceIds") || []}
                    placeholder="Chọn nguồn"
                    modalPopover={true}
                    className="bg-white opacity-100"
                  />
                </div>
                <FieldError k="customerSourceIds" />
              </div>
              <div className="space-y-2">
                <Label>Lý do từ chối <RequiredMark k="rejectReason" /></Label>
                <Select onValueChange={(val) => form.setValue("rejectReason", val)} defaultValue={form.getValues("rejectReason")}>
                  <SelectTrigger className="h-11 bg-white opacity-100"><SelectValue placeholder="Chọn" /></SelectTrigger>
                  <SelectContent className="bg-white opacity-100 shadow-md border border-border">
                    {rejectReasons?.map((reason: any) => (
                      <SelectItem key={reason.id} value={reason.reason} className="focus:bg-accent">{reason.reason}</SelectItem>
                    ))}
                    {!rejectReasons?.length && (
                      <SelectItem value="no_reason" disabled className="focus:bg-accent">Chưa có lý do</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <FieldError k="rejectReason" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label>Lớp học <RequiredMark k="classIds" /></Label>
                <div className="relative">
                  <MultiSelect
                    options={(Array.isArray(classesData) ? classesData : []).map((c: any) => ({ label: c.name, value: c.id }))}
                    onValueChange={(val) => form.setValue("classIds", val)}
                    defaultValue={form.watch("classIds") || []}
                    placeholder="Chọn lớp học"
                    modalPopover={true}
                    className="bg-white opacity-100"
                  />
                </div>
                <FieldError k="classIds" />
              </div>
              <div className="space-y-2">
                <Label>Trạng thái tài khoản <RequiredMark k="accountStatus" /></Label>
                <Select onValueChange={(val) => form.setValue("accountStatus", val)} defaultValue={form.getValues("accountStatus")}>
                  <SelectTrigger className="h-11 bg-white opacity-100"><SelectValue placeholder="Chọn" /></SelectTrigger>
                  <SelectContent className="bg-white opacity-100 shadow-md border border-border">
                    <SelectItem value="Hoạt động" className="focus:bg-accent">Hoạt động</SelectItem>
                    <SelectItem value="Không hoạt động" className="focus:bg-accent">Không hoạt động</SelectItem>
                  </SelectContent>
                </Select>
                <FieldError k="accountStatus" />
              </div>
              <div className="space-y-2">
                <Label>Nhân viên sale <RequiredMark k="salesByIds" /></Label>
                <div className="relative">
                  <MultiSelect
                    options={staff?.map((s: any) => ({ label: s.fullName, value: s.id })) || []}
                    onValueChange={(val) => form.setValue("salesByIds", val)}
                    defaultValue={form.watch("salesByIds") || []}
                    placeholder="Chọn nhân viên sale"
                    modalPopover={true}
                    className="bg-white opacity-100"
                  />
                </div>
                <FieldError k="salesByIds" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label>Quản lý <RequiredMark k="managedByIds" /></Label>
                <div className="relative">
                  <MultiSelect
                    options={staff?.map((s: any) => ({ label: s.fullName, value: s.id })) || []}
                    onValueChange={(val) => form.setValue("managedByIds", val)}
                    defaultValue={form.watch("managedByIds") || []}
                    placeholder="Chọn quản lý"
                    modalPopover={true}
                    className="bg-white opacity-100"
                  />
                </div>
                <FieldError k="managedByIds" />
              </div>
              <div className="space-y-2">
                <Label>Giáo viên <RequiredMark k="teacherIds" /></Label>
                <div className="relative">
                  <MultiSelect
                    options={staff?.map((s: any) => ({ label: s.fullName, value: s.id })) || []}
                    onValueChange={(val) => form.setValue("teacherIds", val)}
                    defaultValue={form.watch("teacherIds") || []}
                    placeholder="Chọn giáo viên"
                    modalPopover={true}
                    className="bg-white opacity-100"
                  />
                </div>
                <FieldError k="teacherIds" />
              </div>
              <div className="space-y-2">
                <Label>Trình độ <RequiredMark k="academicLevel" /></Label>
                <Input className="h-11 bg-white opacity-100" placeholder="VD: IELTS 5.0" {...form.register("academicLevel")} />
                <FieldError k="academicLevel" />
              </div>
            </div>


            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Địa chỉ <RequiredMark k="address" /></Label>
                <Input className="h-11 bg-white opacity-100" placeholder="Địa chỉ..." {...form.register("address")} />
                <FieldError k="address" />
              </div>
              <div className="space-y-2">
                <Label>Zalo/FB <RequiredMark k="socialLink" /></Label>
                <Input className="h-11 bg-white opacity-100" placeholder="Link hoặc ID..." {...form.register("socialLink")} />
                <FieldError k="socialLink" />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Ghi chú <RequiredMark k="note" /></Label>
              <Textarea className="bg-white opacity-100 resize-none" placeholder="Nhập ghi chú thêm..." {...form.register("note")} />
              <FieldError k="note" />
            </div>
          </div>
        </div>

        {(customFieldsList?.length ?? 0) > 0 && (
          <div className="bg-muted/30 p-6 rounded-2xl border border-border/50 space-y-6">
            <h3 className="text-lg font-display font-semibold flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-primary" /> Thông tin bổ sung
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(customFieldsList ?? []).map((cf) => {
                const fieldKey = makeCustomFieldKey(cf.id);
                const value = form.watch("customFields")?.[cf.id] ?? "";
                const setVal = (v: any) => {
                  const cur = form.getValues("customFields") || {};
                  form.setValue("customFields", { ...cur, [cf.id]: v });
                };
                const errMsg = (form.formState.errors as any)?.customFields?.[cf.id]?.message;
                return (
                  <div key={cf.id} className="space-y-2">
                    <Label>{cf.label} <RequiredMark k={fieldKey} /></Label>
                    {cf.fieldType === "textarea" ? (
                      <Textarea
                        className="bg-white opacity-100 resize-none"
                        value={value}
                        onChange={(e) => setVal(e.target.value)}
                        data-testid={`input-custom-${cf.id}`}
                      />
                    ) : cf.fieldType === "select" ? (
                      <Select value={value || undefined} onValueChange={(v) => setVal(v)}>
                        <SelectTrigger className="h-11 bg-white opacity-100" data-testid={`select-custom-${cf.id}`}>
                          <SelectValue placeholder="Chọn..." />
                        </SelectTrigger>
                        <SelectContent className="bg-white opacity-100 shadow-md border border-border">
                          {(cf.options ?? []).map(opt => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={cf.fieldType === "number" ? "number" : cf.fieldType === "date" ? "date" : "text"}
                        className="h-11 bg-white opacity-100"
                        value={value}
                        onChange={(e) => setVal(cf.fieldType === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)}
                        data-testid={`input-custom-${cf.id}`}
                      />
                    )}
                    {errMsg && <p className="text-xs text-destructive" data-testid={`error-custom-${cf.id}`}>{errMsg}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-4 pt-4 border-t border-border pb-8">
        <Button type="button" variant="outline" className="h-12 px-8 rounded-xl font-semibold opacity-100" onClick={() => window.history.back()}>
          Huỷ bỏ
        </Button>
        <Button 
          type="submit" 
          disabled={isPending} 
          className="h-12 px-8 rounded-xl font-semibold shadow-lg shadow-primary/20 opacity-100"
        >
          {isPending ? "Đang lưu..." : "Lưu Học Viên"}
        </Button>
      </div>
    </form>
  );
}
