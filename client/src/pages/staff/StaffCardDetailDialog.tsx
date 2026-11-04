import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Award, Briefcase, Building2, CalendarDays, Clock3, Eye, FileText, FolderOpen, FolderPlus, GraduationCap, MapPin, Medal, Upload, UserRound, Users, Plus, Paperclip, type LucideIcon } from "lucide-react";
import * as mammoth from "mammoth";
import DOMPurify from "dompurify";
import { apiRequest } from "@/lib/queryClient";
import { getAuthHeaders } from "@/lib/queryClient";
import { Textarea } from "@/components/ui/textarea";

type ContractAttachment = { name: string; url: string };
type TeacherProfile = {
  experienceValue: number | null;
  experienceUnit: "year" | "month" | null;
  teachingExperience: string;
  certificates: string;
  achievements: string;
};
const EMPTY_TEACHER_PROFILE: TeacherProfile = {
  experienceValue: null,
  experienceUnit: "year",
  teachingExperience: "",
  certificates: "",
  achievements: "",
};
type ContractAttachmentPreview = {
  attachment: ContractAttachment;
  source: "contracts" | "profile-files";
  kind: "loading" | "image" | "pdf" | "docx" | "unsupported" | "error";
  url?: string;
  html?: string;
};

interface StaffCardDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: any;
  onEdit: () => void;
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function getUniqueAssignmentNames(staff: any, key: "role" | "department" | "location") {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const assignment of staff?.assignments ?? []) {
    const name = assignment[key]?.name;
    if (typeof name === "string" && name.trim() && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

function DetailField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid min-w-0 grid-cols-[130px_minmax(0,1fr)] gap-3 border-b border-slate-100 py-2.5 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="break-words font-medium text-slate-800">{value || "—"}</span>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, action }: { title: string; icon: LucideIcon; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-blue-100 bg-blue-50/80 px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Icon className="h-4 w-4 text-blue-600" /> {title}
        </h3>
        {action}
      </div>
      <div className="px-4 py-1">{children}</div>
    </section>
  );
}

function EmptyTab({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-6 text-center">
      <div className="mb-3 rounded-full bg-blue-50 p-3"><FileText className="h-5 w-5 text-blue-500" /></div>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function ProfileBulletList({ content }: { content: string }) {
  const items = content.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  return (
    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
      {items.map((item, index) => <li key={`${index}-${item}`} className="break-words">{item}</li>)}
    </ul>
  );
}

function calculateContractEndDate(startDate: string, months: number): string {
  const [year, month, day] = startDate.split("-").map(Number);
  if (!year || !month || !day || !months) return "";
  const targetMonth = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate();
  targetMonth.setUTCDate(Math.min(day, lastDay) - 1);
  return targetMonth.toISOString().slice(0, 10);
}

export function StaffCardDetailDialog({ open, onOpenChange, staff, onEdit }: StaffCardDetailDialogProps) {
  const queryClient = useQueryClient();
  const contractFileInput = useRef<HTMLInputElement>(null);
  const profileFileInput = useRef<HTMLInputElement>(null);
  const [addContractOpen, setAddContractOpen] = useState(false);
  const [teacherProfileDialogOpen, setTeacherProfileDialogOpen] = useState(false);
  const [teacherProfileDraft, setTeacherProfileDraft] = useState<TeacherProfile>(EMPTY_TEACHER_PROFILE);
  const [uploadingContractFiles, setUploadingContractFiles] = useState(false);
  const [contractFileError, setContractFileError] = useState("");
  const [contractPreview, setContractPreview] = useState<ContractAttachmentPreview | null>(null);
  const [selectedProfileCategoryId, setSelectedProfileCategoryId] = useState("");
  const [selectedSharedProfileType, setSelectedSharedProfileType] = useState("");
  const [newProfileCategoryName, setNewProfileCategoryName] = useState("");
  const [uploadingProfileFiles, setUploadingProfileFiles] = useState(false);
  const [profileFileError, setProfileFileError] = useState("");
  const [draft, setDraft] = useState({
    code: "", name: "", contractType: "Xác định thời hạn", durationMonths: "12",
    startDate: new Date().toISOString().slice(0, 10), workType: "Toàn thời gian", attachments: [] as ContractAttachment[],
  });
  const contractsQuery = useQuery({
    queryKey: ["/api/staff", staff?.id, "contracts"],
    enabled: open && !!staff?.id,
    queryFn: async () => (await apiRequest("GET", `/api/staff/${staff.id}/contracts`)).json(),
  });
  const teacherProfileQuery = useQuery({
    queryKey: ["/api/staff", staff?.id, "teacher-profile"],
    enabled: open && !!staff?.id,
    queryFn: async () => (await apiRequest("GET", `/api/staff/${staff.id}/teacher-profile`)).json() as Promise<TeacherProfile | null>,
  });
  const saveTeacherProfile = useMutation({
    mutationFn: async () => (await apiRequest("PUT", `/api/staff/${staff.id}/teacher-profile`, teacherProfileDraft)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff", staff.id, "teacher-profile"] });
      setTeacherProfileDialogOpen(false);
    },
  });
  const profileCategoriesQuery = useQuery({
    queryKey: ["/api/staff", staff?.id, "profile-files", "categories"],
    enabled: open && !!staff?.id,
    queryFn: async () => (await apiRequest("GET", `/api/staff/${staff.id}/profile-files/categories`)).json(),
  });
  const profileTypesQuery = useQuery({
    queryKey: ["/api/staff", staff?.id, "profile-files", "types"],
    enabled: open && !!staff?.id,
    queryFn: async () => (await apiRequest("GET", `/api/staff/${staff.id}/profile-files/types`)).json(),
  });
  const createProfileCategory = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("POST", `/api/staff/${staff.id}/profile-files/categories`, { name: name.trim() });
      return response.json();
    },
    onSuccess: (category) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff", staff.id, "profile-files", "categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff", staff.id, "profile-files", "types"] });
      setSelectedProfileCategoryId(category.id);
      setNewProfileCategoryName("");
      setSelectedSharedProfileType("");
    },
  });
  const createContract = useMutation({
    mutationFn: async () => {
      const months = draft.durationMonths === "indefinite" ? null : Number(draft.durationMonths);
      const response = await apiRequest("POST", `/api/staff/${staff.id}/contracts`, {
        code: draft.code.trim(), name: draft.name.trim(), contractType: draft.contractType,
        durationMonths: months, startDate: draft.startDate,
        endDate: months ? calculateContractEndDate(draft.startDate, months) : null,
        workType: draft.workType, attachments: draft.attachments,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff", staff.id, "contracts"] });
      setAddContractOpen(false);
      setDraft({ code: "", name: "", contractType: "Xác định thời hạn", durationMonths: "12", startDate: new Date().toISOString().slice(0, 10), workType: "Toàn thời gian", attachments: [] });
    },
  });
  const uploadContractFiles = async (files: FileList | null) => {
    if (!files?.length || !staff?.id) return;
    setUploadingContractFiles(true);
    setContractFileError("");
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("files", file));
      const response = await fetch(`/api/staff/${staff.id}/contracts/files`, {
        method: "POST", body: formData, headers: getAuthHeaders(), credentials: "include",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Không thể tải tệp lên");
      }
      const payload = await response.json();
      setDraft((current) => ({ ...current, attachments: [...current.attachments, ...payload.files] }));
    } catch (error) {
      setContractFileError(error instanceof Error ? error.message : "Không thể tải tệp lên");
    } finally {
      setUploadingContractFiles(false);
      if (contractFileInput.current) contractFileInput.current.value = "";
    }
  };
  const downloadContractAttachment = async (attachment: ContractAttachment, source: "contracts" | "profile-files" = "contracts") => {
    try {
      const endpoint = source === "contracts" ? "contracts/file" : "profile-files/file";
      const url = `/api/staff/${staff.id}/${endpoint}?key=${encodeURIComponent(attachment.url)}`;
      const response = await fetch(url, { headers: getAuthHeaders(), credentials: "include" });
      if (!response.ok) throw new Error("Không thể tải tệp");
      const blobUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = attachment.name;
      anchor.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.alert("Không thể tải tệp đính kèm.");
    }
  };
  const previewContractAttachment = async (attachment: ContractAttachment, source: "contracts" | "profile-files" = "contracts") => {
    setContractPreview({ attachment, source, kind: "loading" });
    try {
      const endpoint = source === "contracts" ? "contracts/file" : "profile-files/file";
      const response = await fetch(`/api/staff/${staff.id}/${endpoint}?key=${encodeURIComponent(attachment.url)}`, {
        headers: getAuthHeaders(), credentials: "include",
      });
      if (!response.ok) throw new Error("Không thể mở tệp");
      const blob = await response.blob();
      const extension = attachment.name.split(".").pop()?.toLowerCase();
      const mimeType = blob.type.toLowerCase();
      if (mimeType.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp"].includes(extension ?? "")) {
        setContractPreview({ attachment, source, kind: "image", url: URL.createObjectURL(blob) });
      } else if (mimeType === "application/pdf" || extension === "pdf") {
        setContractPreview({ attachment, source, kind: "pdf", url: URL.createObjectURL(blob) });
      } else if (extension === "docx") {
        const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
        setContractPreview({
          attachment,
          source,
          kind: "docx",
          html: DOMPurify.sanitize(result.value, { USE_PROFILES: { html: true } }),
        });
      } else {
        setContractPreview({ attachment, source, kind: "unsupported" });
      }
    } catch {
      setContractPreview({ attachment, source, kind: "error" });
    }
  };
  const closeContractPreview = () => {
    if (contractPreview?.url) URL.revokeObjectURL(contractPreview.url);
    setContractPreview(null);
  };
  const uploadProfileFiles = async (files: FileList | null) => {
    const categoryId = selectedProfileCategoryId;
    if (!files?.length || !staff?.id || !categoryId) return;
    setUploadingProfileFiles(true);
    setProfileFileError("");
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("files", file));
      const response = await fetch(`/api/staff/${staff.id}/profile-files/categories/${categoryId}/files`, {
        method: "POST", body: formData, headers: getAuthHeaders(), credentials: "include",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Không thể tải tệp lên");
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/staff", staff.id, "profile-files", "categories"] });
    } catch (error) {
      setProfileFileError(error instanceof Error ? error.message : "Không thể tải tệp lên");
    } finally {
      setUploadingProfileFiles(false);
      if (profileFileInput.current) profileFileInput.current.value = "";
    }
  };
  if (!staff) return null;

  const assignments = [
    { label: "Vai trò", icon: Briefcase, names: getUniqueAssignmentNames(staff, "role") },
    { label: "Phòng ban", icon: Building2, names: getUniqueAssignmentNames(staff, "department") },
    { label: "Cơ sở", icon: MapPin, names: getUniqueAssignmentNames(staff, "location") },
  ];
  const active = staff.status === "Hoạt động";
  const roleNames = getUniqueAssignmentNames(staff, "role");
  const departmentNames = getUniqueAssignmentNames(staff, "department");
  const locationNames = getUniqueAssignmentNames(staff, "location");
  const formatDate = (value?: string | Date | null) =>
    value ? new Date(value).toLocaleDateString("vi-VN") : "—";
  const formatContractDate = (value?: string | Date | null) =>
    value ? new Date(`${String(value).slice(0, 10)}T12:00:00Z`).toLocaleDateString("vi-VN", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }) : "Không xác định";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(94vh,960px)] w-[95vw] max-w-[95vw] flex-col gap-0 overflow-hidden rounded-2xl border-slate-200 p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Hồ sơ nhân sự: {staff.fullName}</DialogTitle>
          <DialogDescription>Thông tin nhân sự, phân công và lịch sử cập nhật</DialogDescription>
        </DialogHeader>

        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 pr-12 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8 gap-1.5 rounded-lg text-xs">
              <ArrowLeft className="h-3.5 w-3.5" /> Quay lại
            </Button>
            <h2 className="truncate text-lg font-bold text-slate-900">Hồ sơ nhân sự</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onEdit} className="h-8 gap-1.5 rounded-lg text-xs">
              <Briefcase className="h-3.5 w-3.5" /> Chỉnh sửa
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50 md:flex-row">
          <aside className="w-full shrink-0 overflow-y-auto border-b border-slate-200 bg-white p-4 md:w-[250px] md:border-b-0 md:border-r">
            <div className="flex items-center gap-3 md:flex-col md:text-center">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-slate-100 to-slate-200 ring-4 ring-blue-50 md:h-28 md:w-28">
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600 text-2xl font-bold text-white">{getInitials(staff.fullName || "?")}</div>
                {staff.avatarUrl && <img src={staff.avatarUrl} alt={`Ảnh đại diện ${staff.fullName}`} className="absolute inset-0 h-full w-full object-cover" onError={(event) => event.currentTarget.remove()} />}
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold text-slate-900">{staff.fullName}</h3>
                <p className="font-mono text-xs text-slate-500">{staff.code || "—"}</p>
                <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${active ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-amber-500"}`} />
                  {active ? "Đang làm việc" : "Ngừng hoạt động"}
                </span>
              </div>
            </div>

            <div className="mt-4 hidden space-y-2 border-t border-slate-100 pt-4 md:block">
              {assignments.map(({ label, icon: Icon, names }) => (
                <div key={label} className="flex items-start gap-2 text-xs text-slate-600">
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                  <span className="min-w-0 break-words">{names.join(", ") || "Chưa phân công"}<span className="sr-only">, {label}</span></span>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 md:grid-cols-1">
              {[
                { label: "Vai trò", count: roleNames.length, icon: Briefcase, color: "bg-blue-50 text-blue-700" },
                { label: "Phòng ban", count: departmentNames.length, icon: Users, color: "bg-emerald-50 text-emerald-700" },
                { label: "Cơ sở", count: locationNames.length, icon: MapPin, color: "bg-violet-50 text-violet-700" },
              ].map(({ label, count, icon: Icon, color }) => (
                <div key={label} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 ${color}`}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{label}</span>
                  <strong className="text-sm">{count}</strong>
                </div>
              ))}
            </div>

            <div className="mt-3 hidden rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-[11px] text-slate-600 md:block">
              <div className="flex items-center gap-1.5 font-medium"><CalendarDays className="h-3.5 w-3.5 text-blue-600" /> Hồ sơ tạo</div>
              <div className="mt-1 font-semibold text-slate-800">{formatDate(staff.createdAt)}</div>
            </div>
          </aside>

          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-5">
            <Tabs defaultValue="personal" className="w-full">
              <TabsList className="mb-4 flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
                <TabsTrigger value="personal" className="shrink-0 gap-1.5 rounded-lg px-3 py-2 text-xs"><UserRound className="h-3.5 w-3.5" />Thông tin cá nhân</TabsTrigger>
                <TabsTrigger value="contract" className="shrink-0 gap-1.5 rounded-lg px-3 py-2 text-xs"><FileText className="h-3.5 w-3.5" />Hợp đồng</TabsTrigger>
                <TabsTrigger value="profile-files" className="shrink-0 gap-1.5 rounded-lg px-3 py-2 text-xs"><FolderOpen className="h-3.5 w-3.5" />File hồ sơ</TabsTrigger>
              </TabsList>

              <TabsContent value="personal" className="mt-0 space-y-3">
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  <SectionCard title="Thông tin cá nhân" icon={UserRound}>
                    <DetailField label="Họ và tên" value={staff.fullName} />
                    <DetailField label="Mã nhân viên" value={staff.code} />
                    <DetailField label="Ngày sinh" value={formatDate(staff.dateOfBirth)} />
                    <DetailField label="Số điện thoại" value={staff.phone} />
                    <DetailField label="Email" value={staff.email} />
                    <DetailField label="Tài khoản" value={staff.username} />
                    <DetailField label="Địa chỉ" value={staff.address} />
                  </SectionCard>
                  <SectionCard title="Đơn vị công tác hiện tại" icon={Building2}>
                    <DetailField label="Phòng ban" value={departmentNames.join(", ")} />
                    <DetailField label="Chức vụ" value={roleNames.join(", ")} />
                    <DetailField label="Cơ sở làm việc" value={locationNames.join(", ")} />
                    <DetailField label="Trạng thái công việc" value={active ? "Đang làm việc" : "Ngừng hoạt động"} />
                    <div className="my-2 rounded-lg bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-900">
                      Đang được phân công tại {locationNames.length} cơ sở, {departmentNames.length} phòng ban và {roleNames.length} vai trò.
                    </div>
                  </SectionCard>
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <SectionCard title="Hợp đồng lao động" icon={FileText}>
                    {contractsQuery.isLoading ? <p className="py-3 text-xs text-slate-500">Đang tải hợp đồng...</p>
                      : contractsQuery.isError ? <p className="py-3 text-xs text-red-600">Không thể tải hợp đồng.</p>
                      : contractsQuery.data?.length ? <div className={`relative space-y-4 py-3 pl-5 ${contractsQuery.data.length > 1 ? "before:absolute before:bottom-4 before:left-[4px] before:top-4 before:w-px before:bg-blue-200 before:content-['']" : ""}`}>
                        {contractsQuery.data.map((contract: any) => (
                          <div key={contract.id} className="relative min-w-0">
                            <span className="absolute -left-5 top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-500 ring-1 ring-blue-200" />
                            <p className="text-xs font-semibold text-slate-800">{formatContractDate(contract.startDate)} - {formatContractDate(contract.endDate)}</p>
                            <p className="mt-0.5 break-words text-[11px] font-medium text-blue-700">
                              {contract.name} ({contract.code}) — {contract.durationMonths ? `${contract.durationMonths} tháng` : "Không xác định thời gian"}
                            </p>
                            <p className="mt-0.5 break-words text-[10px] text-blue-600">{contract.contractType} — {contract.workType}</p>
                          </div>
                        ))}
                      </div> : <p className="py-3 text-xs text-slate-500">Chưa có hợp đồng lao động.</p>}
                  </SectionCard>
                  <SectionCard
                    title="Profile giáo viên"
                    icon={GraduationCap}
                    action={<Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 bg-white text-xs" onClick={() => {
                      setTeacherProfileDraft({ ...EMPTY_TEACHER_PROFILE, ...(teacherProfileQuery.data ?? {}) });
                      saveTeacherProfile.reset();
                      setTeacherProfileDialogOpen(true);
                    }}><Plus className="h-3.5 w-3.5" />{teacherProfileQuery.data ? "Chỉnh sửa" : "Thêm mới"}</Button>}
                  >
                    {teacherProfileQuery.isLoading ? <p className="py-4 text-xs text-slate-500">Đang tải profile...</p>
                      : teacherProfileQuery.isError ? <p className="py-4 text-xs text-red-600">Không thể tải profile giáo viên.</p>
                        : teacherProfileQuery.data ? <div className="space-y-4 py-4">
                          {teacherProfileQuery.data.experienceValue !== null && <div className="flex min-w-0 gap-2.5">
                            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                            <div className="min-w-0"><h4 className="text-sm font-bold text-slate-900">Năm kinh nghiệm</h4><p className="mt-1 text-sm text-slate-700">{teacherProfileQuery.data.experienceValue} {teacherProfileQuery.data.experienceUnit === "month" ? "tháng" : "năm"}</p></div>
                          </div>}
                          {teacherProfileQuery.data.teachingExperience.trim() && <div className="flex min-w-0 gap-2.5">
                            <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                            <div className="min-w-0"><h4 className="text-sm font-bold text-slate-900">Kinh nghiệm giảng dạy</h4><ProfileBulletList content={teacherProfileQuery.data.teachingExperience} /></div>
                          </div>}
                          {teacherProfileQuery.data.certificates.trim() && <div className="flex min-w-0 gap-2.5">
                            <Award className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                            <div className="min-w-0"><h4 className="text-sm font-bold text-slate-900">Bằng cấp chứng chỉ</h4><ProfileBulletList content={teacherProfileQuery.data.certificates} /></div>
                          </div>}
                          {teacherProfileQuery.data.achievements.trim() && <div className="flex min-w-0 gap-2.5">
                            <Medal className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                            <div className="min-w-0"><h4 className="text-sm font-bold text-slate-900">Thành tích nổi bật</h4><ProfileBulletList content={teacherProfileQuery.data.achievements} /></div>
                          </div>}
                        </div>
                        : <p className="py-4 text-xs text-slate-500">Chưa có thông tin profile giáo viên.</p>}
                  </SectionCard>
                </div>

                <Dialog open={teacherProfileDialogOpen} onOpenChange={(value) => { setTeacherProfileDialogOpen(value); if (!value) saveTeacherProfile.reset(); }}>
                  <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                    <DialogHeader><DialogTitle>Profile giáo viên</DialogTitle><DialogDescription>Các mục đều không bắt buộc. Chỉ thông tin đã nhập mới hiển thị trong hồ sơ.</DialogDescription></DialogHeader>
                    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); saveTeacherProfile.mutate(); }}>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Năm kinh nghiệm</label>
                        <div className="grid grid-cols-[minmax(0,1fr)_150px] gap-2">
                          <input type="number" min={0} step={1} value={teacherProfileDraft.experienceValue ?? ""} onChange={(event) => setTeacherProfileDraft({ ...teacherProfileDraft, experienceValue: event.target.value === "" ? null : Number(event.target.value), experienceUnit: event.target.value === "" ? null : (teacherProfileDraft.experienceUnit ?? "year") })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" placeholder="Nhập số" />
                          <select aria-label="Đơn vị kinh nghiệm" value={teacherProfileDraft.experienceUnit ?? "year"} onChange={(event) => setTeacherProfileDraft({ ...teacherProfileDraft, experienceUnit: event.target.value as "year" | "month" })} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="year">Năm</option><option value="month">Tháng</option></select>
                        </div>
                      </div>
                      <label className="block space-y-1.5 text-sm font-medium">Kinh nghiệm giảng dạy<Textarea value={teacherProfileDraft.teachingExperience} onChange={(event) => setTeacherProfileDraft({ ...teacherProfileDraft, teachingExperience: event.target.value })} maxLength={10000} rows={4} placeholder="Nhập kinh nghiệm giảng dạy..." /></label>
                      <label className="block space-y-1.5 text-sm font-medium">Bằng cấp chứng chỉ<Textarea value={teacherProfileDraft.certificates} onChange={(event) => setTeacherProfileDraft({ ...teacherProfileDraft, certificates: event.target.value })} maxLength={10000} rows={3} placeholder="Nhập bằng cấp, chứng chỉ..." /></label>
                      <label className="block space-y-1.5 text-sm font-medium">Thành tích nổi bật<Textarea value={teacherProfileDraft.achievements} onChange={(event) => setTeacherProfileDraft({ ...teacherProfileDraft, achievements: event.target.value })} maxLength={10000} rows={3} placeholder="Nhập thành tích nổi bật..." /></label>
                      {saveTeacherProfile.isError && <p role="alert" className="text-sm text-red-600">{saveTeacherProfile.error instanceof Error ? saveTeacherProfile.error.message : "Không thể lưu profile giáo viên."}</p>}
                      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setTeacherProfileDialogOpen(false)}>Hủy</Button><Button type="submit" disabled={saveTeacherProfile.isPending}>{saveTeacherProfile.isPending ? "Đang lưu..." : "Lưu profile"}</Button></div>
                    </form>
                  </DialogContent>
                </Dialog>
              </TabsContent>

              <TabsContent value="contract" className="mt-0 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h3 className="text-base font-semibold text-slate-900">Hợp đồng lao động</h3><p className="mt-1 text-xs text-slate-500">Quản lý thời hạn và hồ sơ đính kèm của nhân sự.</p></div>
                  <Button type="button" onClick={() => setAddContractOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Thêm hợp đồng</Button>
                </div>
                {contractsQuery.isLoading ? <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">Đang tải hợp đồng...</div>
                  : contractsQuery.isError ? <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">Không thể tải danh sách hợp đồng.</div>
                  : contractsQuery.data?.length ? <div className="space-y-3">{contractsQuery.data.map((contract: any) => (
                    <SectionCard key={contract.id} title={`${contract.code} · ${contract.name}`} icon={FileText}>
                      <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                        {[
                          ["Loại hợp đồng", contract.contractType],
                          ["Thời hạn", contract.durationMonths ? `${contract.durationMonths} tháng` : "Không xác định thời gian"],
                          ["Hình thức làm việc", contract.workType],
                          ["Ngày bắt đầu", formatDate(contract.startDate)],
                          ["Ngày kết thúc", contract.endDate ? formatDate(contract.endDate) : "Không xác định"],
                        ].map(([label, value]) => (
                          <div key={label} className="min-w-0 border-b border-slate-100 py-2.5 last:border-0">
                            <p className="text-xs text-slate-500">{label}</p>
                            <p className="mt-1 break-words text-sm font-medium text-slate-800">{value}</p>
                          </div>
                        ))}
                      </div>
                      {!!contract.attachments?.length && <div className="border-t border-slate-100 py-3"><p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600"><Paperclip className="h-3.5 w-3.5" /> Hồ sơ đính kèm</p><div className="flex flex-wrap gap-2">{contract.attachments.map((file: ContractAttachment) => <div key={file.url} className="flex items-center gap-1 rounded-lg bg-blue-50 pl-3 pr-1 text-blue-700"><button type="button" onClick={() => downloadContractAttachment(file)} className="max-w-64 truncate py-2 text-xs hover:underline">{file.name}</button><button type="button" aria-label={`Xem trước ${file.name}`} title="Xem tệp" onClick={() => void previewContractAttachment(file)} className="rounded-md p-1.5 hover:bg-blue-100"><Eye className="h-4 w-4" /></button></div>)}</div></div>}
                    </SectionCard>
                  ))}</div> : <EmptyTab title="Chưa có dữ liệu hợp đồng" description="Thêm hợp đồng để lưu thông tin và tệp hồ sơ cho nhân sự." />}

                <Dialog open={addContractOpen} onOpenChange={(value) => { setAddContractOpen(value); if (!value) createContract.reset(); }}>
                  <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                    <DialogHeader><DialogTitle>Thêm hợp đồng</DialogTitle><DialogDescription>Nhập thông tin hợp đồng và đính kèm hồ sơ liên quan.</DialogDescription></DialogHeader>
                    <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); createContract.mutate(); }}>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="space-y-1.5 text-sm font-medium">Mã hợp đồng<input required maxLength={100} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 font-normal" /></label>
                        <label className="space-y-1.5 text-sm font-medium">Tên hợp đồng<input required maxLength={255} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 font-normal" /></label>
                      </div>
                      <section className="space-y-4 rounded-xl border p-4">
                        <h3 className="text-base font-bold">THÔNG TIN HỢP ĐỒNG</h3>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="space-y-1.5 text-sm font-medium">Loại hợp đồng<select value={draft.contractType} onChange={(e) => setDraft({ ...draft, contractType: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 font-normal"><option>Thử việc</option><option>Xác định thời hạn</option><option>Không xác định thời hạn</option></select></label>
                          <label className="space-y-1.5 text-sm font-medium">Thời hạn hợp đồng<select value={draft.durationMonths} onChange={(e) => setDraft({ ...draft, durationMonths: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 font-normal">{[1, 2, 3, 6, 12, 18, 24, 36].map((month) => <option key={month} value={month}>{month} tháng{month === 12 ? " (1 năm)" : month === 24 ? " (2 năm)" : month === 36 ? " (3 năm)" : ""}</option>)}<option value="indefinite">Không xác định thời gian</option></select></label>
                          <label className="space-y-1.5 text-sm font-medium">Ngày bắt đầu<input type="date" required value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 font-normal" /></label>
                          <div className="space-y-1.5 text-sm font-medium">Ngày kết thúc<div className="flex h-10 items-center rounded-md bg-emerald-50 px-3 font-semibold text-emerald-700">{draft.durationMonths === "indefinite" ? "Không xác định" : draft.startDate ? formatDate(calculateContractEndDate(draft.startDate, Number(draft.durationMonths))) : "—"}</div></div>
                          <label className="space-y-1.5 text-sm font-medium sm:col-span-2">Hình thức làm việc<select value={draft.workType} onChange={(e) => setDraft({ ...draft, workType: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 font-normal"><option>Toàn thời gian</option><option>Bán thời gian</option></select></label>
                        </div>
                        <p className="text-xs text-emerald-700">Ngày kết thúc được tính tự động theo ngày bắt đầu và thời hạn hợp đồng.</p>
                      </section>
                      <section className="space-y-3 rounded-xl border p-4">
                        <h3 className="text-sm font-bold">FILE HỒ SƠ ĐÍNH KÈM</h3>
                        <input ref={contractFileInput} type="file" multiple className="hidden" onChange={(event) => void uploadContractFiles(event.target.files)} />
                        <Button type="button" variant="outline" disabled={uploadingContractFiles} onClick={() => contractFileInput.current?.click()}><Plus className="mr-2 h-4 w-4" />{uploadingContractFiles ? "Đang tải tệp..." : "Chọn tệp"}</Button>
                        <p className="text-xs text-slate-500">Tối đa 10 tệp mỗi lần tải, 20 MB/tệp. Tệp được lưu riêng tư và chỉ tải qua hồ sơ nhân sự.</p>
                        {contractFileError && <p role="alert" className="text-sm text-red-600">{contractFileError}</p>}
                        {draft.attachments.length > 0 && <ul className="space-y-1">{draft.attachments.map((file, index) => <li key={`${file.url}-${index}`} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm"><span className="truncate">{file.name}</span><button type="button" className="text-red-600 hover:underline" onClick={() => setDraft({ ...draft, attachments: draft.attachments.filter((_, i) => i !== index) })}>Bỏ</button></li>)}</ul>}
                      </section>
                      {createContract.isError && <p role="alert" className="text-sm text-red-600">{createContract.error instanceof Error ? createContract.error.message : "Không thể lưu hợp đồng."}</p>}
                      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAddContractOpen(false)}>Hủy</Button><Button type="submit" disabled={createContract.isPending}>{createContract.isPending ? "Đang lưu..." : "Lưu hợp đồng"}</Button></div>
                    </form>
                  </DialogContent>
                </Dialog>
              </TabsContent>

              <TabsContent value="profile-files" className="mt-0">
                <div className="grid min-h-[420px] grid-cols-1 gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
                  <aside className="rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><FolderOpen className="h-4 w-4 text-blue-600" />Danh mục hồ sơ</h3>
                    <div className="mt-3 space-y-2">
                      <div className="flex gap-2">
                        <select
                          value={selectedSharedProfileType}
                          onChange={(event) => setSelectedSharedProfileType(event.target.value)}
                          aria-label="Chọn tên danh mục dùng chung"
                          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                        >
                          <option value="">Chọn tên có sẵn</option>
                          {(profileTypesQuery.data ?? [])
                            .filter((name: string) => !profileCategoriesQuery.data?.some((category: any) => category.name === name))
                            .map((name: string) => <option key={name} value={name}>{name}</option>)}
                        </select>
                        <Button type="button" size="sm" disabled={!selectedSharedProfileType || createProfileCategory.isPending} onClick={() => createProfileCategory.mutate(selectedSharedProfileType)} className="shrink-0 gap-1.5 px-2.5">
                          <Plus className="h-3.5 w-3.5" />Chọn
                        </Button>
                      </div>
                      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); createProfileCategory.mutate(newProfileCategoryName); }}>
                        <input
                          value={newProfileCategoryName}
                          onChange={(event) => setNewProfileCategoryName(event.target.value)}
                          maxLength={255}
                          placeholder="Tạo tên mới, ví dụ: File CV"
                          aria-label="Tên danh mục hồ sơ mới"
                          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-xs"
                        />
                        <Button type="submit" size="icon" aria-label="Tạo danh mục mới" disabled={!newProfileCategoryName.trim() || createProfileCategory.isPending} className="h-9 w-9 shrink-0">
                          <FolderPlus className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                    <p className="mt-2 text-[10px] leading-4 text-slate-500">Chỉ tên danh mục được dùng chung; tệp vẫn riêng theo từng nhân sự.</p>
                    {createProfileCategory.isError && <p className="mt-2 text-xs text-red-600">{createProfileCategory.error instanceof Error ? createProfileCategory.error.message : "Không thể tạo danh mục."}</p>}
                    {profileCategoriesQuery.isLoading || profileTypesQuery.isLoading ? <p className="py-6 text-center text-xs text-slate-500">Đang tải danh mục...</p>
                      : profileCategoriesQuery.isError ? <p className="py-6 text-center text-xs text-red-600">Không thể tải danh mục hồ sơ.</p>
                      : profileCategoriesQuery.data?.length ? <div className="mt-3 space-y-1">
                        {profileCategoriesQuery.data.map((category: any) => (
                          <button
                            key={category.id}
                            type="button"
                            onClick={() => { setSelectedProfileCategoryId(category.id); setProfileFileError(""); }}
                            className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-xs transition ${selectedProfileCategoryId === category.id ? "bg-blue-50 font-semibold text-blue-800" : "text-slate-700 hover:bg-slate-50"}`}
                          >
                            <span className="flex min-w-0 items-center gap-2"><FolderOpen className="h-4 w-4 shrink-0 text-blue-600" /><span className="truncate">{category.name}</span></span>
                            <span className="shrink-0 text-[10px] text-slate-500">{category.attachments?.length ?? 0}</span>
                          </button>
                        ))}
                      </div> : <p className="mt-4 text-xs leading-5 text-slate-500">Chưa có danh mục. Nhập tên rồi bấm nút thêm.</p>}
                  </aside>

                  <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
                    {(() => {
                      const selectedCategory = profileCategoriesQuery.data?.find((category: any) => category.id === selectedProfileCategoryId);
                      if (!selectedCategory) {
                        return <div className="flex h-full min-h-64 flex-col items-center justify-center text-center"><FolderOpen className="h-8 w-8 text-blue-300" /><p className="mt-3 text-sm font-medium text-slate-700">Chọn danh mục hồ sơ</p><p className="mt-1 text-xs text-slate-500">Các tệp tải lên sẽ được lưu trong danh mục đang chọn.</p></div>;
                      }
                      return <>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                          <div><h3 className="text-sm font-semibold text-slate-900">{selectedCategory.name}</h3><p className="mt-1 text-xs text-slate-500">Tệp hồ sơ của nhân sự này.</p></div>
                          <Button type="button" size="sm" disabled={uploadingProfileFiles} onClick={() => profileFileInput.current?.click()} className="gap-2"><Upload className="h-4 w-4" />{uploadingProfileFiles ? "Đang tải..." : "Tải file lên"}</Button>
                          <input ref={profileFileInput} type="file" multiple className="hidden" onChange={(event) => void uploadProfileFiles(event.target.files)} />
                        </div>
                        {profileFileError && <p className="mt-3 text-xs text-red-600">{profileFileError}</p>}
                        {uploadingProfileFiles && <p className="mt-3 text-xs text-blue-700">Đang tải tệp lên...</p>}
                        {selectedCategory.attachments?.length ? <div className="mt-3 divide-y divide-slate-100">
                          {selectedCategory.attachments.map((file: ContractAttachment) => (
                            <div key={file.url} className="flex items-center justify-between gap-3 py-3">
                              <div className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-blue-600" /><span className="truncate text-xs font-medium text-slate-700">{file.name}</span></div>
                              <div className="flex shrink-0 items-center gap-1">
                                <Button type="button" variant="ghost" size="icon" aria-label={`Xem ${file.name}`} title="Xem tệp" onClick={() => void previewContractAttachment(file, "profile-files")}><Eye className="h-4 w-4" /></Button>
                                <Button type="button" variant="ghost" size="icon" aria-label={`Tải ${file.name}`} title="Tải xuống" onClick={() => void downloadContractAttachment(file, "profile-files")}><Upload className="h-4 w-4 rotate-180" /></Button>
                              </div>
                            </div>
                          ))}
                        </div> : <div className="flex min-h-56 flex-col items-center justify-center text-center"><Paperclip className="h-7 w-7 text-slate-300" /><p className="mt-3 text-sm text-slate-600">Chưa có tệp trong danh mục này.</p><p className="mt-1 text-xs text-slate-500">Bấm “Tải file lên” để thêm hồ sơ.</p></div>}
                      </>;
                    })()}
                  </section>
                </div>
              </TabsContent>
            </Tabs>

            <Dialog open={!!contractPreview} onOpenChange={(isOpen) => { if (!isOpen) closeContractPreview(); }}>
              <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{contractPreview?.attachment.name ?? "Xem tệp đính kèm"}</DialogTitle>
                  <DialogDescription>Xem trước hồ sơ đính kèm của nhân sự.</DialogDescription>
                </DialogHeader>
                <div className="min-h-40 overflow-auto rounded-lg border bg-slate-50 p-3">
                  {contractPreview?.kind === "loading" && <p className="py-16 text-center text-sm text-slate-500">Đang tải tệp...</p>}
                  {contractPreview?.kind === "error" && <p className="py-16 text-center text-sm text-red-600">Không thể mở tệp đính kèm.</p>}
                  {contractPreview?.kind === "image" && contractPreview.url && <img src={contractPreview.url} alt={contractPreview.attachment.name} className="mx-auto max-h-[70vh] max-w-full object-contain" />}
                  {contractPreview?.kind === "pdf" && contractPreview.url && <iframe title={contractPreview.attachment.name} src={contractPreview.url} className="h-[70vh] w-full rounded-md bg-white" />}
                  {contractPreview?.kind === "docx" && <div className="mx-auto max-w-3xl bg-white p-6 text-sm leading-6 text-slate-800 [&_h1]:mb-3 [&_h1]:text-xl [&_h2]:mb-2 [&_h2]:text-lg [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-3" dangerouslySetInnerHTML={{ __html: contractPreview.html ?? "" }} />}
                  {contractPreview?.kind === "unsupported" && <div className="py-12 text-center"><p className="text-sm text-slate-600">Định dạng này chưa hỗ trợ xem trước.</p><Button type="button" variant="outline" className="mt-3" onClick={() => void downloadContractAttachment(contractPreview.attachment, contractPreview.source)}>Tải tệp xuống</Button></div>}
                </div>
              </DialogContent>
            </Dialog>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
