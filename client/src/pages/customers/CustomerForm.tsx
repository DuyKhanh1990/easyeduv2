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
import { User, Phone, Mail, MapPin, CalendarDays, Briefcase, GraduationCap, Camera, Loader2, ChevronsUpDown, X, Check, AlertTriangle, Users, Sparkles, Eye, EyeOff } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/queryClient";
import { MultiSelect } from "@/components/ui/multi-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { StudentResponse } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";

// ── Grouped relationship picker (parent header + selectable children) ─────────
function RelationshipGroupPicker({
  relationships,
  value,
  onChange,
  placeholder,
}: {
  relationships: CrmRelationship[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  const { t } = useLanguage();
  const resolvedPlaceholder = placeholder ?? t("customerForm.selectRelationship");
  const [open, setOpen] = useState(false);

  const sorted = useMemo(
    () => [...relationships].sort((a, b) => parseInt((a as any).position || "0") - parseInt((b as any).position || "0")),
    [relationships]
  );
  const parents = useMemo(() => sorted.filter((r: any) => r.isParentGroup), [sorted]);
  const childByParent = useMemo(() => {
    const map = new Map<string, CrmRelationship[]>();
    sorted.filter((r: any) => !r.isSystemDefault && !r.isParentGroup && r.parentId).forEach((r: any) => {
      if (!map.has(r.parentId)) map.set(r.parentId, []);
      map.get(r.parentId)!.push(r);
    });
    return map;
  }, [sorted]);
  const ungrouped = useMemo(
    () => sorted.filter((r: any) => r.isSystemDefault || (!r.isParentGroup && !(r as any).parentId)),
    [sorted]
  );
  const displayName = (relationship: CrmRelationship) =>
    `${relationship.name}${(relationship as any).isSystemDefault ? "*" : ""}`;

  const toggleChild = (rel: CrmRelationship) => {
    // Existing customers may carry IDs for deleted relationships. Preserve
    // those IDs until the user makes a deliberate new selection, then submit
    // only live relationships so a choice such as Lead* is a real replacement.
    const selectedLiveIds = value.filter((id) => sorted.some((relationship) => relationship.id === id));
    const isSelected = selectedLiveIds.includes(rel.id);
    if (isSelected) {
      onChange(selectedLiveIds.filter((id) => id !== rel.id));
    } else if ((rel as any).parentId && !(rel as any).isSystemDefault) {
      const siblings = sorted
        .filter((r: any) => !r.isParentGroup && r.parentId === (rel as any).parentId && r.id !== rel.id)
        .map((r) => r.id);
      const sibSet = new Set(siblings);
      onChange([...selectedLiveIds.filter((id) => !sibSet.has(id)), rel.id]);
    } else {
      onChange([...selectedLiveIds, rel.id]);
    }
  };

  const selectedLabels = value
    .map((id) => sorted.find((r) => r.id === id))
    .filter(Boolean) as CrmRelationship[];

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full min-h-11 h-auto items-start justify-between rounded-md border bg-white px-2 py-1.5 text-sm shadow-sm hover:bg-gray-50 transition-colors"
        >
          {selectedLabels.length > 0 ? (
            <div className="flex flex-wrap gap-1 flex-1">
              {selectedLabels.map((rel) => (
                <span
                  key={rel.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border"
                  style={{ borderColor: rel.color || "#6b7280", color: rel.color || "#6b7280" }}
                >
                  {displayName(rel)}
                  <X
                    className="w-3 h-3 cursor-pointer opacity-70 hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); toggleChild(rel); }}
                  />
                </span>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground px-1">{resolvedPlaceholder}</span>
          )}
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0 ml-1 mt-0.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0 shadow-xl border bg-white z-[9999]" align="start">
        <ul className="max-h-[320px] overflow-y-auto py-1">
          {parents.map((group) => {
            const children = childByParent.get(group.id) || [];
            if (children.length === 0) return null;
            return (
              <li key={group.id}>
                {/* Parent group header — not selectable */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground select-none">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group.color || "#6b7280" }} />
                  {displayName(group)}
                </div>
                {children.map((child) => {
                  const isSelected = value.includes(child.id);
                  return (
                    <div
                      key={child.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => toggleChild(child)}
                      className="flex items-center gap-2 pl-7 pr-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
                    >
                      <div className={cn("w-4 h-4 rounded-sm border border-primary shrink-0 flex items-center justify-center", isSelected ? "bg-primary" : "opacity-40")}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: child.color || "#6b7280" }} />
                          {displayName(child)}
                      </span>
                    </div>
                  );
                })}
              </li>
            );
          })}
          {ungrouped.map((rel) => {
            const isSelected = value.includes(rel.id);
            return (
              <div
                key={rel.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => toggleChild(rel)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
              >
                <div className={cn("w-4 h-4 rounded-sm border border-primary shrink-0 flex items-center justify-center", isSelected ? "bg-primary" : "opacity-40")}>
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: rel.color || "#6b7280" }} />
                  {displayName(rel)}
                </span>
              </div>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

// Local schema subset for the form to ensure flexibility
const formSchema = z.object({
  locationIds: z.array(z.string()).min(1, "Trường Cơ sở: bắt buộc phải chọn"),
  type: z.enum(["Học viên", "Phụ huynh"]),
  code: z.string().min(1, "Trường Mã: bắt buộc phải nhập"),
  fullName: z.string().min(1, "Trường Họ và tên: bắt buộc phải nhập"),
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
  relationshipIds: z.array(z.string()).min(1, "Trường Mối quan hệ: bắt buộc phải chọn"),
  customerSourceIds: z.array(z.string()).optional(),
  classIds: z.array(z.string()).optional(),
  schoolIds: z.array(z.string()).optional(),
  accountStatus: z.string().optional(),
  rejectReason: z.string().optional(),
  
  salesByIds: z.array(z.string()).optional(),
  managedByIds: z.array(z.string()).optional(),
  teacherIds: z.array(z.string()).optional(),
  parentIds: z.array(z.string()).optional(),
  childIds: z.array(z.string()).optional(),
  
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
    username: (data as any)?.username || (data as any)?.user?.username || "",
    // Do not submit a placeholder password while editing; an empty value means
    // "keep the current password" on the server.
    password: data ? "" : ((data as any)?.password || "123456"),
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
    schoolIds: (data as any)?.schoolIds || ((data as any)?.schoolList?.map((s: any) => s.id) || []),
    accountStatus: (data as any)?.accountStatus || "Hoạt động",
    rejectReason: data?.rejectReason || "",
    salesByIds: (data as any)?.salesByIds || ((data as any)?.salesByList?.map((s: any) => s.id) || []),
    managedByIds: (data as any)?.managedByIds || ((data as any)?.managedByList?.map((s: any) => s.id) || []),
    teacherIds: (data as any)?.teacherIds || ((data as any)?.teacherList?.map((s: any) => s.id) || []),
    parentIds: (data as any)?.parentIds || [],
    childIds: (data as any)?.childIds || [],
    note: data?.note || "",
    avatarUrl: (data as any)?.avatarUrl || "",
    customFields: ((data as any)?.customFields as Record<string, any>) || {},
  };
}

type DuplicateWarning = {
  phoneConflicts: { id: string; fullName: string; code: string; phone: string | null }[];
  emailConflicts: { id: string; fullName: string; code: string; email: string | null }[];
  pendingData: FormData;
};

export function CustomerForm({ initialData, onSubmit, isPending }: CustomerFormProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateWarning | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
              [customId]: { type: "required", message: `Trường ${label}: bắt buộc phải nhập` },
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
          errors[key] = { type: "required", message: `Trường ${getCrmFieldLabel(key)}: bắt buộc phải nhập` };
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
      toast({ title: t("customerForm.toastImageOnly"), variant: "destructive" });
      return;
    }
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append("files", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd, headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const url = data.files?.[0]?.url;
      if (url) {
        form.setValue("avatarUrl", url);
      }
    } catch {
      toast({ title: t("customerForm.toastUploadFail"), variant: "destructive" });
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
  const { data: studentsData } = useStudents({ type: "Học viên", limit: 1000 });
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
  const { data: schoolsData } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/crm/schools"],
    queryFn: async () => {
      const res = await fetch("/api/crm/schools", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch schools");
      return res.json();
    },
    staleTime: 2 * 60_000,
  });

  // Sync form values when initialData changes (e.g. opening edit dialog)
  useEffect(() => {
    setShowPassword(false);
    if (initialData) {
      form.reset(getFormDefaults(initialData));
    }
  }, [initialData, form]);

  // Gọi thẳng onSubmit không qua check (dùng khi user chọn "Cho phép trùng & Lưu")
  const doSubmit = (data: FormData) => {
    const formattedData = {
      ...data,
      dateOfBirth: data.dateOfBirth === "" ? null : data.dateOfBirth,
      email: (data.email === "" || data.email === null) ? null : data.email,
    };
    onSubmit(formattedData as any);
  };

  // Handle form submission with duplicate check
  const handleFormSubmit = async (data: FormData) => {
    const formattedData = {
      ...data,
      dateOfBirth: data.dateOfBirth === "" ? null : data.dateOfBirth,
      email: (data.email === "" || data.email === null) ? null : data.email,
    } as FormData;

    setIsChecking(true);
    try {
      const params = new URLSearchParams();
      if (formattedData.code) params.set("code", formattedData.code);
      if (formattedData.username) params.set("username", formattedData.username);
      if (formattedData.phone) params.set("phone", formattedData.phone);
      if (formattedData.email) params.set("email", formattedData.email as string);
      if (initialData?.id) params.set("excludeId", initialData.id);

      const res = await fetch(`/api/students/check-duplicates?${params.toString()}`, { credentials: "include" });
      const dup = await res.json();

      // Hard block: Mã hoặc Tài khoản trùng
      if (dup.codeConflict) {
        form.setError("code", { message: `${t("customerForm.code")} "${formattedData.code}" (${dup.codeConflict.fullName})` });
        toast({ title: t("customerForm.errCodeDupTitle"), description: `${dup.codeConflict.fullName}`, variant: "destructive" });
        return;
      }
      if (dup.usernameConflict) {
        form.setError("username" as any, { message: `${t("customerForm.account")} "${formattedData.username}"` });
        toast({ title: t("customerForm.errUsernameDupTitle"), description: `"${formattedData.username}"`, variant: "destructive" });
        return;
      }

      // Soft warning: SĐT hoặc Email trùng → hiện popup
      if (dup.phoneConflicts?.length > 0 || dup.emailConflicts?.length > 0) {
        setDuplicateWarning({ phoneConflicts: dup.phoneConflicts, emailConflicts: dup.emailConflicts, pendingData: formattedData });
        return;
      }

      // Không có gì trùng → lưu
      onSubmit(formattedData as any);
    } catch {
      // Nếu check lỗi mạng thì vẫn cho lưu
      onSubmit(formattedData as any);
    } finally {
      setIsChecking(false);
    }
  };

  const onInvalid = (errors: any) => {
    const messages: string[] = [];
    Object.keys(errors).forEach((key) => {
      if (key === "customFields" && errors.customFields && typeof errors.customFields === "object") {
        Object.values(errors.customFields).forEach((err: any) => {
          if (err?.message) messages.push(err.message);
        });
      } else if (errors[key]?.message) {
        messages.push(errors[key].message);
      }
    });

    toast({
      title: t("customerForm.toastRequiredTitle"),
      description: messages.length > 0 ? messages.join(" • ") : t("customerForm.toastRequiredDesc"),
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

  // New customers always start with the protected Lead relationship. If a
  // legacy database has not completed the startup migration yet, retain the
  // prior first-child fallback instead of leaving a required field blank.
  useEffect(() => {
    if (!initialData && relationships && relationships.length > 0) {
      const current = form.getValues("relationshipIds");
      if (!current || current.length === 0) {
        const systemDefault = relationships.find((r: any) => r.isSystemDefault);
        if (systemDefault) {
          form.setValue("relationshipIds", [systemDefault.id], { shouldValidate: true });
          form.setValue("pipelineStage", [systemDefault.name]);
          return;
        }
        const sorted = [...relationships].sort(
          (a, b) => parseInt((a as any).position || "0") - parseInt((b as any).position || "0")
        );
        const firstChild = sorted.find((r: any) => !r.isParentGroup && r.parentId);
        if (firstChild) {
          const selectedNames = [firstChild].map((r: any) => r.name);
          form.setValue("relationshipIds", [firstChild.id]);
          form.setValue("pipelineStage", selectedNames);
        }
      }
    }
  }, [relationships, initialData, form]);

  // Sync username with code only when creating a new customer
  useEffect(() => {
    if (code && !initialData) {
      form.setValue("username", code);
    }
  }, [code, form, initialData]);

  /* ── shared field label style ── */
  const FL = "text-[11px] font-semibold text-slate-500 uppercase tracking-wide";
  /* ── shared input style ── */
  const INP = "h-10 rounded-xl border-slate-200 bg-white text-sm focus:border-sky-400 focus:ring-sky-100";

  return (
    <form onSubmit={form.handleSubmit(handleFormSubmit, onInvalid)} className="space-y-5">

      {/* ══ Section 1: Thông tin cơ bản ══ */}
      <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/60 to-blue-50/30 overflow-hidden">
        {/* Section header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-sky-100 bg-white/60">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-sm shadow-sky-200 flex-shrink-0">
            <User className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-sky-800 leading-none">{t("customerForm.sec1.title")}</p>
            <p className="text-[11px] text-sky-500 mt-0.5">{t("customerForm.sec1.subtitle")}</p>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex gap-5 items-start">
            {/* Avatar */}
            <div className="flex-shrink-0">
              <p className={cn(FL, "mb-2 block")}>{t("customerForm.avatar")} <RequiredMark k="avatarUrl" /></p>
              <div
                data-testid="avatar-upload-btn"
                onClick={() => !uploadingAvatar && avatarInputRef.current?.click()}
                className="relative w-20 h-20 rounded-2xl border-2 border-dashed border-sky-200 bg-white cursor-pointer hover:border-sky-400 hover:bg-sky-50/50 transition-all flex items-center justify-center overflow-hidden group shadow-sm"
              >
                {avatarUrl ? (
                  <>
                    <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-2xl" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
                      <Camera className="w-5 h-5 text-white" />
                    </div>
                  </>
                ) : uploadingAvatar ? (
                  <Loader2 className="w-5 h-5 text-sky-400 animate-spin" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-slate-400">
                    <Camera className="w-5 h-5" />
                    <span className="text-[9px] font-medium">{t("customerForm.avatarUpload")}</span>
                  </div>
                )}
              </div>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) handleAvatarUpload(file); e.target.value = ""; }} />
            </div>

            <div className="flex-1 space-y-4">
              {/* Row 1: Cơ sở / Phân loại / Mã / Tên */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <label className={FL}>{t("customerForm.branch")} <span className="text-rose-500">*</span></label>
                  <MultiSelect
                    options={locations?.map(l => ({ label: l.name, value: l.id })) || []}
                    onValueChange={(val) => form.setValue("locationIds", val)}
                    defaultValue={form.watch("locationIds") || []}
                    placeholder={t("customerForm.selectBranch")}
                    maxCount={3}
                    modalPopover={true}
                    className="bg-white opacity-100 rounded-xl border-slate-200"
                  />
                  {form.formState.errors.locationIds && <p className="text-xs text-rose-500">{form.formState.errors.locationIds.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className={FL}>{t("customerForm.type")} <span className="text-rose-500">*</span></label>
                  <Select onValueChange={(val: any) => form.setValue("type", val)} defaultValue={form.getValues("type")}>
                    <SelectTrigger className={INP}><SelectValue placeholder={t("customerForm.selectType")} /></SelectTrigger>
                    <SelectContent className="rounded-xl shadow-xl border-slate-200">
                      <SelectItem value="Học viên">{t("customerForm.typeStudent")}</SelectItem>
                      <SelectItem value="Phụ huynh">{t("customerForm.typeParent")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className={FL}>{t("customerForm.code")} <span className="text-rose-500">*</span></label>
                  <Input className={INP} placeholder={type === "Học viên" ? "HV-01" : "PH-01"} {...form.register("code")} />
                  {form.formState.errors.code && <p className="text-xs text-rose-500">{form.formState.errors.code.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className={FL}>{t("customerForm.fullName")} <span className="text-rose-500">*</span></label>
                  <Input className={INP} placeholder={t("customerForm.fullNamePlaceholder")} {...form.register("fullName")} />
                  {form.formState.errors.fullName && <p className="text-xs text-rose-500">{form.formState.errors.fullName.message}</p>}
                </div>
              </div>

              {/* Row 2: Tài khoản / Mật khẩu / Sinh nhật / SĐT / Email */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="space-y-1.5">
                  <label className={FL}>{t("customerForm.account")} <RequiredMark k="username" /></label>
                  <Input className={INP} value={form.watch("username") || ""} onChange={(e) => form.setValue("username", e.target.value)} />
                  <FieldError k="username" />
                </div>
                <div className="space-y-1.5">
                  <label className={FL}>{t("customerForm.password")} <RequiredMark k="password" /></label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      className={cn(INP, "pr-10")}
                      {...form.register("password")}
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
                  <FieldError k="password" />
                </div>
                <div className="space-y-1.5">
                  <label className={FL}>{t("customerForm.dob")} <RequiredMark k="dateOfBirth" /></label>
                  <div className="relative">
                    <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <Input type="date" className={cn(INP, "pl-9")} {...form.register("dateOfBirth")} />
                  </div>
                  <FieldError k="dateOfBirth" />
                </div>
                <div className="space-y-1.5">
                  <label className={FL}>{t("customerForm.phone")} <RequiredMark k="phone" /></label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <Input className={cn(INP, "pl-9")} placeholder="090..." {...form.register("phone")} />
                  </div>
                  <FieldError k="phone" />
                </div>
                <div className="space-y-1.5">
                  <label className={FL}>Email <RequiredMark k="email" /></label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <Input type="email" className={cn(INP, "pl-9")} placeholder="email@example.com" {...form.register("email")} />
                  </div>
                  <FieldError k="email" />
                </div>
              </div>

              {/* Row 3: Mối quan hệ */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={FL}>{t("customerForm.relationship")} <span className="text-rose-500">*</span></label>
                  <RelationshipGroupPicker
                    relationships={relationships || []}
                    value={form.watch("relationshipIds") || []}
                    onChange={(val) => {
                      form.setValue("relationshipIds", val, { shouldValidate: true });
                      const selectedNames = (relationships || []).filter((r: any) => val.includes(r.id)).map((r: any) => r.name);
                      form.setValue("pipelineStage", selectedNames);
                    }}
                  />
                  {form.formState.errors.relationshipIds && (
                    <p className="text-xs text-rose-500">{(form.formState.errors.relationshipIds as any)?.message || t("customerForm.relationshipRequired")}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══ Section 2: Liên hệ & Phụ huynh ══ */}
      <div className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50/50 to-emerald-50/30 overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-teal-100 bg-white/60">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-sm shadow-teal-200 flex-shrink-0">
            <Users className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-teal-800 leading-none">{t("customerForm.sec2.title")}</p>
            <p className="text-[11px] text-teal-500 mt-0.5">{t("customerForm.sec2.subtitle")}</p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Phụ huynh 1/2/3 chỉ hiện khi type = Học viên */}
          {type === "Học viên" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { n: "parentName", p: "parentPhone", label: `${t("customerForm.parentLabel")} 1`, kn: "parentName", kp: "parentPhone" },
                { n: "parentName2", p: "parentPhone2", label: `${t("customerForm.parentLabel")} 2`, kn: "parentName2", kp: "parentPhone2" },
                { n: "parentName3", p: "parentPhone3", label: `${t("customerForm.parentLabel")} 3`, kn: "parentName3", kp: "parentPhone3" },
              ].map(({ n, p, label, kn, kp }) => (
                <div key={n} className="space-y-3 p-4 border border-teal-100 rounded-xl bg-white/70">
                  <p className="text-[11px] font-bold text-teal-600 uppercase tracking-wide">{label}</p>
                  <div className="space-y-1.5">
                    <label className={FL}>{t("customerForm.parentFullName")} <RequiredMark k={kn} /></label>
                    <Input className={INP} placeholder={t("customerForm.parentNamePlaceholder")} {...form.register(n as any)} />
                    <FieldError k={kn} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={FL}>{t("customerForm.parentPhone")} <RequiredMark k={kp} /></label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <Input className={cn(INP, "pl-9")} placeholder="090..." {...form.register(p as any)} />
                    </div>
                    <FieldError k={kp} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Picker: Mã Phụ huynh (Học viên) hoặc Mã Học viên (Phụ huynh) */}
          {type === "Học viên" ? (
            <div className="space-y-1.5">
              <label className={FL}>{t("customerForm.parentIds")} <RequiredMark k="parentIds" /></label>
              <MultiSelect
                data-testid="select-parent-ids"
                options={(parentsData?.students || []).map((p: any) => ({ label: `${p.fullName} (${p.code})`, value: p.id }))}
                onValueChange={(val) => form.setValue("parentIds", val)}
                defaultValue={form.watch("parentIds") || []}
                placeholder={t("customerForm.selectParents")}
                maxCount={5}
                className="bg-white rounded-xl border-slate-200"
              />
              <p className="text-[11px] text-slate-400">{t("customerForm.parentIdsHint")}</p>
              <FieldError k="parentIds" />
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className={FL}>Mã Học viên (tài khoản hệ thống) <RequiredMark k="childIds" /></label>
              <MultiSelect
                data-testid="select-child-ids"
                options={(studentsData?.students || []).map((s: any) => ({ label: `${s.fullName} (${s.code})`, value: s.id }))}
                onValueChange={(val) => form.setValue("childIds", val)}
                defaultValue={form.watch("childIds") || []}
                placeholder="Chọn học viên là con của phụ huynh này..."
                maxCount={5}
                className="bg-white rounded-xl border-slate-200"
              />
              <p className="text-[11px] text-slate-400">Gán tài khoản học viên là con của phụ huynh này trên hệ thống.</p>
              <FieldError k="childIds" />
            </div>
          )}
        </div>
      </div>

      {/* ══ Section 3: Phân loại & Chăm sóc ══ */}
      <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/50 to-purple-50/30 overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-violet-100 bg-white/60">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm shadow-violet-200 flex-shrink-0">
            <Briefcase className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-violet-800 leading-none">{t("customerForm.sec3.title")}</p>
            <p className="text-[11px] text-violet-500 mt-0.5">{t("customerForm.sec3.subtitle")}</p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className={FL}>{t("customerForm.source")} <RequiredMark k="customerSourceIds" /></label>
              <MultiSelect
                options={sources?.map((source: any) => ({ label: source.name, value: source.id })) || [
                  { label: "Facebook", value: "Facebook" },
                  { label: "Google", value: "Google" },
                  { label: "Giới thiệu", value: "Referral" },
                  { label: "Trực tiếp", value: "Walk-in" },
                ]}
                onValueChange={(val) => form.setValue("customerSourceIds", val)}
                defaultValue={form.watch("customerSourceIds") || []}
                placeholder={t("customerForm.selectSource")}
                modalPopover={true}
                className="bg-white opacity-100 rounded-xl border-slate-200"
              />
              <FieldError k="customerSourceIds" />
            </div>
            <div className="space-y-1.5">
              <label className={FL}>{t("customerForm.rejectReason")} <RequiredMark k="rejectReason" /></label>
              <Select value={form.watch("rejectReason") || ""} onValueChange={(val) => form.setValue("rejectReason", val === "__none__" ? "" : val)}>
                <SelectTrigger className={INP}><SelectValue placeholder={t("customerForm.select")} /></SelectTrigger>
                <SelectContent className="rounded-xl shadow-xl border-slate-200">
                  <SelectItem value="__none__" className="text-slate-400">{t("customerForm.none")}</SelectItem>
                  {rejectReasons?.map((reason: any) => <SelectItem key={reason.id} value={reason.reason}>{reason.reason}</SelectItem>)}
                  {!rejectReasons?.length && <SelectItem value="no_reason" disabled>{t("customerForm.noReason")}</SelectItem>}
                </SelectContent>
              </Select>
              <FieldError k="rejectReason" />
            </div>
            <div className="space-y-1.5">
              <label className={FL}>Trường học <RequiredMark k="schoolIds" /></label>
              <MultiSelect
                data-testid="select-school-ids"
                options={(schoolsData || []).map((school) => ({ label: school.name, value: school.id }))}
                onValueChange={(val) => form.setValue("schoolIds", val)}
                defaultValue={form.watch("schoolIds") || []}
                placeholder="Chọn trường học"
                modalPopover={true}
                className="bg-white opacity-100 rounded-xl border-slate-200"
              />
              <FieldError k="schoolIds" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className={FL}>{t("customerForm.class")} <RequiredMark k="classIds" /></label>
              <MultiSelect
                options={(Array.isArray(classesData) ? classesData : []).map((c: any) => ({ label: c.name, value: c.id }))}
                onValueChange={(val) => form.setValue("classIds", val)}
                defaultValue={form.watch("classIds") || []}
                placeholder={t("customerForm.selectClass")}
                modalPopover={true}
                className="bg-white opacity-100 rounded-xl border-slate-200"
              />
              <FieldError k="classIds" />
            </div>
            <div className="space-y-1.5">
              <label className={FL}>{t("customerForm.accountStatus")} <RequiredMark k="accountStatus" /></label>
              <Select value={form.watch("accountStatus") || "Hoạt động"} onValueChange={(val) => form.setValue("accountStatus", val)}>
                <SelectTrigger className={INP}><SelectValue placeholder={t("customerForm.select")} /></SelectTrigger>
                <SelectContent className="rounded-xl shadow-xl border-slate-200">
                  <SelectItem value="Hoạt động">
                    <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />{t("customerForm.active")}</span>
                  </SelectItem>
                  <SelectItem value="Không hoạt động">
                    <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />{t("customerForm.inactive")}</span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <FieldError k="accountStatus" />
            </div>
            <div className="space-y-1.5">
              <label className={FL}>{t("customerForm.sales")} <RequiredMark k="salesByIds" /></label>
              <MultiSelect
                options={staff?.map((s: any) => ({ label: s.fullName, value: s.id })) || []}
                onValueChange={(val) => form.setValue("salesByIds", val)}
                defaultValue={form.watch("salesByIds") || []}
                placeholder={t("customerForm.selectSales")}
                modalPopover={true}
                className="bg-white opacity-100 rounded-xl border-slate-200"
              />
              <FieldError k="salesByIds" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className={FL}>{t("customerForm.manager")} <RequiredMark k="managedByIds" /></label>
              <MultiSelect
                options={staff?.map((s: any) => ({ label: s.fullName, value: s.id })) || []}
                onValueChange={(val) => form.setValue("managedByIds", val)}
                defaultValue={form.watch("managedByIds") || []}
                placeholder={t("customerForm.selectManager")}
                modalPopover={true}
                className="bg-white opacity-100 rounded-xl border-slate-200"
              />
              <FieldError k="managedByIds" />
            </div>
            <div className="space-y-1.5">
              <label className={FL}>{t("customerForm.teacher")} <RequiredMark k="teacherIds" /></label>
              <MultiSelect
                options={staff?.map((s: any) => ({ label: s.fullName, value: s.id })) || []}
                onValueChange={(val) => form.setValue("teacherIds", val)}
                defaultValue={form.watch("teacherIds") || []}
                placeholder={t("customerForm.selectTeacher")}
                modalPopover={true}
                className="bg-white opacity-100 rounded-xl border-slate-200"
              />
              <FieldError k="teacherIds" />
            </div>
            <div className="space-y-1.5">
              <label className={FL}>{t("customerForm.level")} <RequiredMark k="academicLevel" /></label>
              <Input className={INP} placeholder={t("customerForm.levelPlaceholder")} {...form.register("academicLevel")} />
              <FieldError k="academicLevel" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={FL}>{t("customerForm.address")} <RequiredMark k="address" /></label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input className={cn(INP, "pl-9")} placeholder={t("customerForm.addressPlaceholder")} {...form.register("address")} />
              </div>
              <FieldError k="address" />
            </div>
            <div className="space-y-1.5">
              <label className={FL}>{t("customerForm.social")} <RequiredMark k="socialLink" /></label>
              <Input className={INP} placeholder={t("customerForm.socialPlaceholder")} {...form.register("socialLink")} />
              <FieldError k="socialLink" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={FL}>{t("customerForm.note")} <RequiredMark k="note" /></label>
            <Textarea className="rounded-xl border-slate-200 bg-white resize-none text-sm min-h-[80px]" placeholder={t("customerForm.notePlaceholder")} {...form.register("note")} />
            <FieldError k="note" />
          </div>
        </div>
      </div>

      {/* ══ Section 4: Thông tin bổ sung (custom fields) ══ */}
      {(customFieldsList?.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/50 to-orange-50/30 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3 border-b border-amber-100 bg-white/60">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-sm shadow-amber-200 flex-shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-800 leading-none">{t("customerForm.sec4.title")}</p>
              <p className="text-[11px] text-amber-500 mt-0.5">{t("customerForm.sec4.subtitle")}</p>
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(customFieldsList ?? []).map((cf) => {
                const fieldKey = makeCustomFieldKey(cf.id);
                const value = form.watch("customFields")?.[cf.id] ?? "";
                const setVal = (v: any) => {
                  const cur = form.getValues("customFields") || {};
                  form.setValue("customFields", { ...cur, [cf.id]: v });
                };
                const errMsg = (form.formState.errors as any)?.customFields?.[cf.id]?.message;
                return (
                  <div key={cf.id} className="space-y-1.5">
                    <label className={FL}>{cf.label} <RequiredMark k={fieldKey} /></label>
                    {cf.fieldType === "textarea" ? (
                      <Textarea className="rounded-xl border-slate-200 bg-white resize-none text-sm" value={value} onChange={(e) => setVal(e.target.value)} data-testid={`input-custom-${cf.id}`} />
                    ) : cf.fieldType === "select" ? (
                      <Select value={value || undefined} onValueChange={(v) => setVal(v)}>
                        <SelectTrigger className={INP} data-testid={`select-custom-${cf.id}`}><SelectValue placeholder="Chọn..." /></SelectTrigger>
                        <SelectContent className="rounded-xl shadow-xl border-slate-200">
                          {(cf.options ?? []).map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={cf.fieldType === "number" ? "number" : cf.fieldType === "date" ? "date" : "text"}
                        className={INP}
                        value={value}
                        onChange={(e) => setVal(cf.fieldType === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)}
                        data-testid={`input-custom-${cf.id}`}
                      />
                    )}
                    {errMsg && <p className="text-xs text-rose-500" data-testid={`error-custom-${cf.id}`}>{errMsg}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Footer buttons ── */}
      <div className="flex justify-end gap-3 pt-2 pb-6">
        <Button type="button" variant="outline" className="h-10 px-6 rounded-xl font-semibold text-sm border-slate-200 hover:bg-slate-50" onClick={() => window.history.back()}>
          {t("customerForm.cancel")}
        </Button>
        <Button
          type="submit"
          disabled={isPending || isChecking}
          className="h-10 px-6 rounded-xl font-semibold text-sm bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 shadow-md shadow-sky-200 border-0 gap-2"
        >
          {isChecking
            ? <><Loader2 className="w-4 h-4 animate-spin" />{t("customerForm.checking")}</>
            : isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" />{t("customerForm.saving")}</>
              : initialData ? t("customerForm.update") : t("customerForm.create")}
        </Button>
      </div>

      {/* ── Popup cảnh báo trùng SĐT / Email ── */}
      <Dialog open={!!duplicateWarning} onOpenChange={(open) => { if (!open) setDuplicateWarning(null); }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-amber-700 font-bold">{t("customerForm.dupTitle")}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {duplicateWarning?.phoneConflicts && duplicateWarning.phoneConflicts.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{t("customerForm.dupPhone")}</p>
                <ul className="space-y-1">
                  {duplicateWarning.phoneConflicts.map((s) => (
                    <li key={s.id} className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <span className="font-semibold">{s.fullName}</span>
                      {s.code && <span className="text-muted-foreground ml-1">({s.code})</span>}
                      {s.phone && <span className="text-muted-foreground ml-1">— {t("customerForm.dupPhoneLabel")}: {s.phone}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {duplicateWarning?.emailConflicts && duplicateWarning.emailConflicts.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{t("customerForm.dupEmail")}</p>
                <ul className="space-y-1">
                  {duplicateWarning.emailConflicts.map((s) => (
                    <li key={s.id} className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <span className="font-semibold">{s.fullName}</span>
                      {s.code && <span className="text-muted-foreground ml-1">({s.code})</span>}
                      {s.email && <span className="text-muted-foreground ml-1">— Email: {s.email}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-sm text-muted-foreground pt-1">{t("customerForm.dupConfirm")}</p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDuplicateWarning(null)}>
              {t("customerForm.dupCancel")}
            </Button>
            <Button
              onClick={() => {
                if (duplicateWarning) {
                  doSubmit(duplicateWarning.pendingData);
                  setDuplicateWarning(null);
                }
              }}
              disabled={isPending}
            >
              {isPending ? t("customerForm.saving") : t("customerForm.dupSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
