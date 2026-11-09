import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle, Building2, CalendarDays, Check, ChevronsUpDown, CircleHelp,
  Clock3, Eye, Mail, MoreHorizontal, Pencil, Phone, Plus, RefreshCw, Search,
  Trash2, X,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { useLocations } from "@/hooks/use-locations";
import { cn } from "@/lib/utils";

type Classification = "center" | "business" | "";
type FormData = {
  locationIds: string[];
  classification: Classification;
  code: string;
  name: string;
  domain: string;
  status: string;
  contactName: string;
  phone: string;
  email: string;
  startDate: string;
  durationMonths: number | null;
  servicePackage: string;
  internalNote: string;
  salesStaffIds: string[];
  managerStaffIds: string[];
};
type ClientRecord = FormData & {
  id: string | number;
  accountStatus?: "active" | "suspended";
  codeManuallyEdited?: boolean;
  endDate?: string;
  usageStatus?: string;
  locations?: Array<{ id?: string | number; name?: string }>;
  locationNames?: string[];
  remainingDays?: number;
};
const emptyForm: FormData = {
  locationIds: [], classification: "", code: "", name: "", domain: "", status: "Đang hoạt động",
  contactName: "", phone: "", email: "", startDate: "", durationMonths: null, servicePackage: "", internalNote: "",
  salesStaffIds: [], managerStaffIds: [],
};
const tabs = [
  ["all", "Tất cả"], ["not_due", "Chưa đến hạn"], ["upcoming_2", "Sắp đến hạn trước 2 tháng"],
  ["upcoming_1", "Sắp đến hạn trước 1 tháng"], ["due", "Đến hạn"], ["expired", "Hết hạn"],
] as const;
const inputClass = "h-11 rounded-xl border-slate-200 bg-slate-50/80 px-3.5 text-sm shadow-none placeholder:text-slate-400 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-sky-100";
const computedClass = "h-11 rounded-xl border-slate-200 bg-slate-100 px-3.5 text-sm text-slate-700 shadow-none";

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}
function dateString(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
function addMonths(date: Date, months: number) {
  const end = new Date(date.getFullYear(), date.getMonth() + months, 1);
  end.setDate(Math.min(date.getDate(), new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()));
  return end;
}
function dayDiff(from: Date, to: Date) {
  return Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 86400000);
}
function displayDate(value?: string | null) {
  const date = parseDate(value);
  return date ? `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}` : "—";
}
function isoFromDmy(value: string) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]), month = Number(match[2]), year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function DateTextInput({ value, onChange, className }: { value: string; onChange: (value: string) => void; className?: string }) {
  const [text, setText] = useState(value ? displayDate(value) : "");
  useEffect(() => setText(value ? displayDate(value) : ""), [value]);
  return <Input
    className={className}
    inputMode="numeric"
    placeholder="dd/mm/yyyy"
    value={text}
    onChange={(event) => {
      const next = event.target.value;
      setText(next);
      const iso = isoFromDmy(next);
      if (iso) onChange(iso);
      else if (!next) onChange("");
    }}
    onBlur={() => {
      if (text && !isoFromDmy(text)) setText(value ? displayDate(value) : "");
      else if (text) setText(displayDate(isoFromDmy(text)!));
    }}
  />;
}
function monthLabel(months: number) { return months === 12 ? "12 tháng (1 năm)" : `${months} tháng`; }
function unwrapList(payload: any): ClientRecord[] {
  const list = Array.isArray(payload) ? payload : payload?.records ?? payload?.data?.records ?? payload?.data ?? [];
  return Array.isArray(list) ? list : [];
}
function getErrorMessage(error: unknown) { return error instanceof Error ? error.message : "Đã xảy ra lỗi. Vui lòng thử lại."; }

function Field({ label, children, required, hint, className }: { label: string; children: React.ReactNode; required?: boolean; hint?: string; className?: string }) {
  return <div className={cn("min-w-0 space-y-2", className)}><Label className="text-[13px] font-semibold text-slate-800">{label}{required && <span className="ml-1 text-rose-600">*</span>}</Label>{children}{hint && <p className="text-xs leading-5 text-slate-500">{hint}</p>}</div>;
}

function LocationPicker({ locations, selected, onChange, disabled }: { locations: { id: string; name: string }[]; selected: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const selectedNames = locations.filter((location) => selected.includes(location.id));
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" disabled={disabled} aria-expanded={open} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-60">
      <span className={cn("flex min-w-0 flex-1 flex-wrap gap-1.5", !selected.length && "text-slate-400")}>{selectedNames.length ? selectedNames.map((location) => <span key={location.id} className="rounded-md bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">{location.name}</span>) : "Chọn một hoặc nhiều cơ sở"}</span><ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
    </button></PopoverTrigger>
    <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0"><Command><CommandInput placeholder="Tìm cơ sở..." /><CommandList><CommandEmpty>Không tìm thấy cơ sở.</CommandEmpty><CommandGroup>{locations.map((location) => {
      const active = selected.includes(location.id);
      return <CommandItem key={location.id} value={location.name} onSelect={() => onChange(active ? selected.filter((id) => id !== location.id) : [...selected, location.id])} className="cursor-pointer"><Check className={cn("h-4 w-4", active ? "text-sky-700 opacity-100" : "opacity-0")} />{location.name}</CommandItem>;
    })}</CommandGroup></CommandList><div className="border-t px-3 py-2 text-xs text-slate-500">Có thể chọn nhiều cơ sở.</div></Command></PopoverContent>
  </Popover>;
}

function DurationPicker({ value, onChange, disabled }: { value: number | null; onChange: (value: number) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = useMemo(() => [6, 12, ...Array.from({ length: 108 }, (_, index) => index + 13)], []);
  const matching = options.filter((months) => !query || `${months} tháng ${months / 12} năm`.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi"))).slice(0, query ? 80 : 10);
  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}><PopoverTrigger asChild><button type="button" disabled={disabled} aria-expanded={open} className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 text-left text-sm disabled:opacity-60"><span className={value ? "font-medium text-slate-800" : "text-slate-400"}>{value ? monthLabel(value) : "Chọn thời hạn"}</span><ChevronsUpDown className="h-4 w-4 text-slate-400" /></button></PopoverTrigger><PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[260px] overflow-hidden p-0"><Command shouldFilter={false}><div className="flex items-center border-b px-3"><Search className="mr-2 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm số tháng hoặc số năm..." className="h-11 w-full bg-transparent text-sm outline-none" /></div><CommandList className="max-h-64">{matching.length ? <CommandGroup>{matching.map((months) => <CommandItem key={months} value={`${months} tháng`} onSelect={() => { onChange(months); setOpen(false); setQuery(""); }} className="min-h-10 cursor-pointer px-3"><Check className={cn("h-4 w-4 text-sky-700", value === months ? "opacity-100" : "opacity-0")} /><span className="flex-1">{monthLabel(months)}</span></CommandItem>)}</CommandGroup> : <CommandEmpty>Không tìm thấy thời hạn.</CommandEmpty>}</CommandList><div className="border-t px-3 py-2 text-[11px] text-slate-500">{query ? `Tìm thấy ${matching.length} thời hạn` : "Nhập để tìm thời hạn khác"}</div></Command></PopoverContent></Popover>;
}

export function OrganizationCustomersPage() {
  const queryClient = useQueryClient();
  const locationsQuery = useLocations();
  const rawLocations = Array.isArray(locationsQuery.data) ? locationsQuery.data : Array.isArray((locationsQuery.data as any)?.data) ? (locationsQuery.data as any).data : [];
  const locations: { id: string; name: string }[] = rawLocations.map((item: any) => ({ id: String(item.id), name: String(item.name ?? item.title ?? "Cơ sở") }));
  const staffQuery = useQuery<any[]>({
    queryKey: ["/api/staff?minimal=true"],
    queryFn: async () => {
      const response = await fetch("/api/staff?minimal=true", { credentials: "include" });
      if (!response.ok) throw new Error("Không tải được danh sách nhân sự.");
      const payload = await response.json();
      return Array.isArray(payload) ? payload : payload?.staff ?? payload?.data ?? [];
    },
  });
  const staffOptions = (staffQuery.data ?? []).map((person: any) => ({
    value: String(person.id),
    label: person.fullName ?? person.name ?? person.username ?? "Nhân sự",
    sublabel: person.code,
  }));
  const staffName = (ids?: string[]) => (ids ?? [])
    .map((id) => staffOptions.find((person) => person.value === id)?.label)
    .filter(Boolean)
    .join(", ") || "—";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [locationId, setLocationId] = useState("all");
  const [tab, setTab] = useState<string>("all");
  const [form, setForm] = useState<FormData>(emptyForm);
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [activeId, setActiveId] = useState<string | number | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClientRecord | null>(null);
  const [renewTarget, setRenewTarget] = useState<ClientRecord | null>(null);
  const [renewStart, setRenewStart] = useState("");
  const [renewDuration, setRenewDuration] = useState<number | null>(12);
  const [actionMessage, setActionMessage] = useState("");
  const listKey = ["/api/organization-clients", search, status, tab, locationId];
  const listQuery = useQuery({
    queryKey: listKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (status !== "all") params.set("status", status);
      if (tab !== "all") params.set("tab", tab);
      if (locationId !== "all") params.set("locationId", locationId);
      const response = await fetch(`/api/organization-clients?${params.toString()}`, { credentials: "include" });
      if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.message || "Không tải được danh sách tổ chức.");
      return response.json();
    },
  });
  const records = unwrapList(listQuery.data);
  const permissions = listQuery.data?.permissions ?? listQuery.data?.data?.permissions ?? {};
  const allowed = (keys: string[], fallback = false) => {
    for (const key of keys) if (typeof permissions[key] === "boolean") return permissions[key];
    return fallback;
  };
  const canCreate = allowed(["create", "canCreate", "createOrganizationClient"]);
  const canView = allowed(["view", "canView", "read"]) || allowed(["canViewAll"]);
  const canEdit = allowed(["edit", "update", "canEdit", "canUpdate"]);
  const canDelete = allowed(["delete", "canDelete"]);
  const canRenew = canEdit;
  const firstLocation = form.locationIds[0] ?? "";
  const codeQuery = useQuery({
    queryKey: ["/api/organization-clients/next-code", firstLocation, form.classification],
    enabled: formOpen && formMode === "create" && Boolean(firstLocation && form.classification) && !codeManuallyEdited,
    queryFn: async () => {
      const params = new URLSearchParams({ locationId: firstLocation, classification: form.classification });
      const response = await fetch(`/api/organization-clients/next-code?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Không tạo được mã tự động.");
      return response.json() as Promise<{ code?: string }>;
    },
  });
  useEffect(() => {
    if (!codeManuallyEdited && formMode === "create") setForm((current) => ({ ...current, code: codeQuery.data?.code ?? "" }));
  }, [codeQuery.data?.code, codeManuallyEdited, formMode]);

  const detailQuery = useQuery({
    queryKey: ["/api/organization-clients", activeId],
    enabled: activeId !== null && (viewOpen || (formOpen && formMode === "edit")),
    queryFn: async () => {
      const response = await fetch(`/api/organization-clients/${activeId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Không tải được hồ sơ tổ chức.");
      const payload = await response.json();
      return payload?.record ?? payload?.data?.record ?? payload?.data ?? payload;
    },
  });
  useEffect(() => {
    if (formOpen && formMode === "edit" && detailQuery.data) {
      const client = detailQuery.data as ClientRecord;
      setForm({
        ...emptyForm, ...client,
        locationIds: (client.locationIds ?? client.locations?.map((location) => String(location.id)) ?? []).map(String),
        startDate: (client.startDate ?? "").slice(0, 10),
        salesStaffIds: client.salesStaffIds ?? [],
        managerStaffIds: client.managerStaffIds ?? [],
        classification: client.classification ?? "",
        durationMonths: client.durationMonths ? Number(client.durationMonths) : null,
        status: client.accountStatus === "suspended" ? "Tạm ngưng" : "Đang hoạt động",
      });
      setCodeManuallyEdited(Boolean(client.codeManuallyEdited));
    }
  }, [detailQuery.data, formOpen, formMode]);

  const refreshList = () => queryClient.invalidateQueries({ queryKey: ["/api/organization-clients"] });
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        locationIds: form.locationIds,
        classification: form.classification,
        code: form.code.trim() || (codeManuallyEdited ? "" : undefined),
        name: form.name,
        domain: form.domain,
        accountStatus: form.status === "Tạm ngưng" ? "suspended" : "active",
        contactName: form.contactName,
        phone: form.phone,
        email: form.email,
        startDate: form.startDate,
        durationMonths: form.durationMonths ? Number(form.durationMonths) : null,
        servicePackage: form.servicePackage,
        internalNote: form.internalNote,
        salesStaffIds: form.salesStaffIds ?? [],
        managerStaffIds: form.managerStaffIds ?? [],
        codeManuallyEdited,
      };
      const editing = formMode === "edit" && activeId !== null;
      const response = await fetch(editing ? `/api/organization-clients/${activeId}` : "/api/organization-clients", {
        method: editing ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        const fieldErrors = errorPayload?.errors?.fieldErrors;
        const details = fieldErrors && typeof fieldErrors === "object"
          ? Object.entries(fieldErrors)
              .flatMap(([field, messages]) => Array.isArray(messages) ? messages.map((message) => `${field}: ${message}`) : [])
              .join("; ")
          : "";
        throw new Error([
          errorPayload?.message || "Không lưu được thông tin tổ chức.",
          details,
        ].filter(Boolean).join(" "));
      }
      return response.json();
    },
    onSuccess: () => { setFormOpen(false); setActionMessage(""); refreshList(); },
    onError: (error) => setFormMessage(getErrorMessage(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string | number) => {
      const response = await fetch(`/api/organization-clients/${id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.message || "Không thể xóa hồ sơ.");
    },
    onSuccess: () => { setDeleteTarget(null); setActionMessage(""); refreshList(); },
    onError: (error) => setActionMessage(getErrorMessage(error)),
  });
  const renewMutation = useMutation({
    mutationFn: async () => {
      if (!renewTarget) return;
      const response = await fetch(`/api/organization-clients/${renewTarget.id}/renew`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: renewStart, durationMonths: renewDuration }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.message || "Không thể gia hạn hồ sơ.");
    },
    onSuccess: () => { setRenewTarget(null); setActionMessage(""); refreshList(); },
    onError: (error) => setActionMessage(getErrorMessage(error)),
  });

  const openCreate = () => {
    setForm(emptyForm); setFormMessage(""); setCodeManuallyEdited(false); setActiveId(null); setFormMode("create"); setFormOpen(true);
  };
  const openEdit = (record: ClientRecord) => {
    setActiveId(record.id); setFormMessage(""); setFormMode("edit"); setFormOpen(true);
  };
  const openView = (record: ClientRecord) => { setActiveId(record.id); setViewOpen(true); };
  const update = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((current) => ({ ...current, [key]: value })); setFormMessage("");
  };
  const computed = useMemo(() => {
    const start = parseDate(form.startDate);
    if (!start || !form.durationMonths) return { endDate: "", status: "—", remaining: "—", tone: "neutral" };
    const end = addMonths(start, form.durationMonths);
    const daysStart = dayDiff(new Date(), start);
    const daysEnd = dayDiff(new Date(), end);
    const usage = daysStart > 0 ? "Chưa đến hạn" : daysEnd < 0 ? "Hết hạn" : daysEnd === 0 ? "Đến hạn" : "Đang sử dụng";
    return { endDate: dateString(end), status: usage, remaining: `${Math.max(0, daysEnd)} ngày`, tone: daysStart > 0 ? "future" : daysEnd < 0 ? "expired" : daysEnd === 0 ? "due" : "active" };
  }, [form.startDate, form.durationMonths]);
  const statusStyle = computed.tone === "future" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : computed.tone === "active" ? "border-sky-200 bg-sky-50 text-sky-800" : computed.tone === "due" ? "border-amber-200 bg-amber-50 text-amber-800" : computed.tone === "expired" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-slate-200 bg-slate-100 text-slate-500";
  const submitForm = () => {
    if (!form.locationIds.length) { setFormMessage("Chọn ít nhất một cơ sở trước khi tiếp tục."); return; }
    if (!form.classification) { setFormMessage("Chọn phân loại Trung tâm hoặc Doanh nghiệp."); return; }
    if (!form.name.trim()) { setFormMessage("Vui lòng nhập tên tổ chức."); return; }
    if (!form.startDate) { setFormMessage("Chọn ngày bắt đầu sử dụng."); return; }
    if (!form.durationMonths) { setFormMessage("Chọn tháng sử dụng."); return; }
    saveMutation.mutate();
  };
  const recordLocations = (record: ClientRecord) => record.locationNames?.join(", ") || record.locations?.map((loc: { id?: string | number; name?: string }) => loc.name).filter(Boolean).join(", ") || locations.filter((loc: { id: string; name: string }) => record.locationIds?.map(String).includes(loc.id)).map((loc: { id: string; name: string }) => loc.name).join(", ") || "—";
  const recordUsage = (record: ClientRecord) => {
    if (record.usageStatus) return record.usageStatus;
    const start = parseDate(record.startDate);
    const end = parseDate(record.endDate || (start && record.durationMonths ? dateString(addMonths(start, Number(record.durationMonths))) : ""));
    if (!start || !end) return "—";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = dayDiff(today, end);
    if (dayDiff(today, start) > 0) return "Chưa đến hạn";
    if (days < 0) return "Hết hạn";
    if (days === 0) return "Đến hạn";
    if (end <= addMonths(today, 1)) return "Sắp đến hạn trước 1 tháng";
    if (end <= addMonths(today, 2)) return "Sắp đến hạn trước 2 tháng";
    return "Đang sử dụng";
  };
  const usageClass = (value: string) => value === "Hết hạn" ? "bg-rose-50 text-rose-700" : value === "Chưa đến hạn" ? "bg-amber-50 text-amber-700" : value.startsWith("Sắp đến hạn") ? "bg-orange-50 text-orange-700" : value === "Đến hạn" ? "bg-amber-100 text-amber-800" : value === "Đang sử dụng" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600";
  const detail = detailQuery.data as ClientRecord | undefined;

  return <DashboardLayout>
    <div className="mx-auto w-full max-w-[1600px]">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-sky-700"><Building2 className="h-4 w-4" />Quan hệ tổ chức</div><h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-[28px]">Trung tâm/Doanh nghiệp</h1><p className="mt-1.5 max-w-2xl text-sm text-slate-500">Quản lý hồ sơ, liên hệ và thời hạn sử dụng dịch vụ của các tổ chức.</p></div>
        {canCreate && <Button onClick={openCreate} className="h-10 shrink-0 rounded-lg bg-slate-900 px-4 text-white hover:bg-slate-800"><Plus className="mr-2 h-4 w-4" />Thêm mới</Button>}
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-sm font-semibold text-slate-800">Danh sách Trung tâm/Doanh nghiệp</h2><p className="mt-1 text-xs text-slate-500">{listQuery.isLoading ? "Đang tải hồ sơ..." : `${records.length} hồ sơ trong danh sách`}</p></div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"><span className="h-1.5 w-1.5 rounded-full bg-sky-600" />{records.length} tổ chức</span>
        </div>
        <div className="overflow-x-auto border-b border-slate-100 px-4 pt-3">
          <div className="flex min-w-max gap-1">{tabs.map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={cn("relative rounded-t-lg px-3 py-2.5 text-xs font-semibold transition-colors", tab === key ? "bg-sky-50 text-sky-800 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-sky-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800")}>{label}</button>)}</div>
        </div>
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 sm:grid-cols-[minmax(220px,1fr)_200px_190px]">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên, mã, liên hệ..." className="h-10 rounded-lg border-slate-200 pl-9 text-sm" /></div>
          <Select value={locationId} onValueChange={setLocationId}><SelectTrigger className="h-10 rounded-lg border-slate-200 text-sm"><SelectValue placeholder="Tất cả cơ sở" /></SelectTrigger><SelectContent><SelectItem value="all">Tất cả cơ sở</SelectItem>{locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}</SelectContent></Select>
          <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-10 rounded-lg border-slate-200 text-sm"><SelectValue placeholder="Mọi trạng thái" /></SelectTrigger><SelectContent><SelectItem value="all">Mọi trạng thái</SelectItem><SelectItem value="active">Đang hoạt động</SelectItem><SelectItem value="suspended">Tạm ngưng</SelectItem></SelectContent></Select>
        </div>
        {actionMessage && <div role="status" className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"><AlertCircle className="h-4 w-4 shrink-0" />{actionMessage}<button className="ml-auto" onClick={() => setActionMessage("")} aria-label="Đóng"><X className="h-4 w-4" /></button></div>}
        {listQuery.isError ? <div className="flex min-h-[280px] flex-col items-center justify-center px-5 text-center"><AlertCircle className="mb-3 h-8 w-8 text-rose-500" /><h3 className="font-semibold text-slate-800">Không tải được danh sách</h3><p className="mt-1 text-sm text-slate-500">{getErrorMessage(listQuery.error)}</p><Button variant="outline" className="mt-4" onClick={() => listQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Thử lại</Button></div>
          : listQuery.isLoading ? <div className="space-y-3 p-5">{[0, 1, 2, 3].map((item) => <div key={item} className="h-[62px] animate-pulse rounded-lg bg-slate-100" />)}</div>
          : !records.length ? <div className="flex min-h-[280px] flex-col items-center justify-center px-5 py-10 text-center"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500"><Building2 className="h-5 w-5" /></div><h3 className="text-sm font-semibold text-slate-800">{search || locationId !== "all" || status !== "all" || tab !== "all" ? "Không tìm thấy hồ sơ phù hợp" : "Chưa có Trung tâm/Doanh nghiệp"}</h3><p className="mt-1 max-w-sm text-sm text-slate-500">{search || locationId !== "all" || status !== "all" || tab !== "all" ? "Thử thay đổi từ khóa hoặc bộ lọc." : "Thêm hồ sơ mới để quản lý tổ chức và gói dịch vụ."}</p>{canCreate && !search && locationId === "all" && tab === "all" && <Button variant="outline" onClick={openCreate} className="mt-4 h-9 rounded-lg"><Plus className="mr-2 h-4 w-4" />Thêm mới</Button>}</div>
          : <Table containerClassName="w-full"><TableHeader><TableRow className="bg-slate-50/80 hover:bg-slate-50/80">{["Tổ chức", "Cơ sở", "Domain", "Bắt đầu / Kết thúc", "Thời hạn", "Còn lại", "Gói dịch vụ", "Sales bởi", "Quản lý bởi", "Ghi chú", "Liên hệ", ""].map((head) => <TableHead key={head} className="whitespace-nowrap px-3 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">{head}</TableHead>)}</TableRow></TableHeader><TableBody>{records.map((record) => {
            const usage = recordUsage(record);
            const endDate = record.endDate || (parseDate(record.startDate) && record.durationMonths ? dateString(addMonths(parseDate(record.startDate)!, Number(record.durationMonths))) : "");
            const remaining = record.remainingDays ?? (parseDate(endDate) ? Math.max(0, dayDiff(new Date(), parseDate(endDate)!)) : null);
            return <TableRow key={record.id} className="group align-top hover:bg-sky-50/30">
              <TableCell className="min-w-[200px] px-3 py-3.5"><div className="font-semibold text-slate-900">{record.name || "Chưa đặt tên"}</div><div className="mt-1 text-xs font-medium text-slate-500">{record.code || "Chưa có mã"}</div><span className={cn("mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold", usageClass(usage))}>{usage}</span></TableCell>
              <TableCell className="min-w-[140px] max-w-[190px] whitespace-normal px-3 py-3.5 text-xs leading-5 text-slate-600">{recordLocations(record)}</TableCell>
              <TableCell className="min-w-[130px] px-3 py-3.5 text-xs text-slate-600">{record.domain || "—"}</TableCell>
              <TableCell className="whitespace-nowrap px-3 py-3.5 text-xs leading-5 text-slate-600"><div>{displayDate(record.startDate)}</div><div className="text-slate-400">{displayDate(endDate)}</div></TableCell>
              <TableCell className="whitespace-nowrap px-3 py-3.5 text-xs text-slate-600">{record.durationMonths ? monthLabel(Number(record.durationMonths)) : "—"}</TableCell>
              <TableCell className="whitespace-nowrap px-3 py-3.5 text-xs text-slate-600">{remaining === null ? "—" : `${remaining} ngày`}</TableCell>
              <TableCell className="min-w-[120px] px-3 py-3.5 text-xs text-slate-600">{record.servicePackage || "—"}</TableCell>
              <TableCell className="min-w-[130px] max-w-[190px] whitespace-normal px-3 py-3.5 text-xs text-slate-600">{staffName(record.salesStaffIds)}</TableCell>
              <TableCell className="min-w-[130px] max-w-[190px] whitespace-normal px-3 py-3.5 text-xs text-slate-600">{staffName(record.managerStaffIds)}</TableCell>
              <TableCell className="min-w-[140px] max-w-[200px] whitespace-normal px-3 py-3.5 text-xs text-slate-500"><span className="line-clamp-2">{record.internalNote || "—"}</span></TableCell>
              <TableCell className="min-w-[150px] px-3 py-3.5"><div className="text-xs font-medium text-slate-700">{record.contactName || "—"}</div>{record.phone && <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500"><Phone className="h-3 w-3" />{record.phone}</div>}{record.email && <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500"><Mail className="h-3 w-3" />{record.email}</div>}</TableCell>
              <TableCell className="px-3 py-3"><div className="flex items-center gap-1">
                {canView && <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-sky-800" title="Xem" onClick={() => openView(record)}><Eye className="h-4 w-4" /></Button>}
                {canEdit && <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-sky-800" title="Sửa" onClick={() => openEdit(record)}><Pencil className="h-4 w-4" /></Button>}
                {canRenew && <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-emerald-700" title="Gia hạn" onClick={() => { setRenewTarget(record); const today = dateString(new Date()); setRenewStart(record.endDate && record.endDate > today ? record.endDate : today); setRenewDuration(Number(record.durationMonths) || 12); }}><RefreshCw className="h-4 w-4" /></Button>}
                {canDelete && <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-rose-700" title="Xóa" onClick={() => { setActionMessage(""); setDeleteTarget(record); }}><Trash2 className="h-4 w-4" /></Button>}
              </div></TableCell>
            </TableRow>;
          })}</TableBody></Table>}
      </section>
    </div>

    <Dialog open={formOpen} onOpenChange={setFormOpen}><DialogContent className="flex max-h-[calc(100dvh-24px)] w-[calc(100%-16px)] max-w-[920px] flex-col gap-0 overflow-hidden rounded-2xl border-slate-200 bg-white p-0 shadow-2xl sm:max-h-[calc(100dvh-40px)] sm:w-[calc(100%-40px)]">
      <div className="shrink-0 border-b border-slate-100 px-5 py-5 pr-14 sm:px-9 sm:py-7"><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-800">{formMode === "create" ? "Tạo dữ liệu mới" : "Cập nhật hồ sơ"}</p><DialogHeader className="space-y-1 text-left"><DialogTitle className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">{formMode === "create" ? "Thêm Trung tâm/Doanh nghiệp" : "Chỉnh sửa hồ sơ"}</DialogTitle><DialogDescription className="sr-only">Nhập thông tin tổ chức.</DialogDescription></DialogHeader></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-9 sm:py-6"><div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2 sm:gap-x-6">
        <Field label="Cơ sở" required hint="Có thể chọn nhiều cơ sở."><LocationPicker locations={locations} selected={form.locationIds} onChange={(ids) => { update("locationIds", ids); if (!codeManuallyEdited && formMode === "create") update("code", ""); }} /></Field>
        <Field label="Phân loại" required><Select value={form.classification} onValueChange={(value) => { update("classification", value as Classification); if (!codeManuallyEdited && formMode === "create") update("code", ""); }}><SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/80 px-3.5 text-sm"><SelectValue placeholder="Chọn loại hình" /></SelectTrigger><SelectContent><SelectItem value="center">Trung tâm</SelectItem><SelectItem value="business">Doanh nghiệp</SelectItem></SelectContent></Select></Field>
        <Field label="Mã trung tâm/doanh nghiệp" hint={codeQuery.isFetching ? "Đang tạo mã tự động..." : "Mã được cấp từ hệ thống; có thể sửa thủ công."}><Input className={inputClass} placeholder="Chọn cơ sở và phân loại để tạo mã" value={form.code} onChange={(event) => { setCodeManuallyEdited(true); update("code", event.target.value); }} /></Field>
        <Field label="Tên trung tâm/doanh nghiệp" required><Input className={inputClass} placeholder="Nhập tên tổ chức" value={form.name} onChange={(event) => update("name", event.target.value)} /></Field>
        <Field label="Domain"><Input className={inputClass} placeholder="example.easyedu.vn" value={form.domain} onChange={(event) => update("domain", event.target.value)} /></Field>
        <Field label="Trạng thái"><Select value={form.status} onValueChange={(value) => update("status", value)}><SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/80 px-3.5 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Đang hoạt động">Đang hoạt động</SelectItem><SelectItem value="Tạm ngưng">Tạm ngưng</SelectItem></SelectContent></Select></Field>
        <Field label="Người liên hệ"><Input className={inputClass} placeholder="Họ và tên" value={form.contactName} onChange={(event) => update("contactName", event.target.value)} /></Field>
        <Field label="Số điện thoại"><Input className={inputClass} placeholder="090..." inputMode="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} /></Field>
        <Field label="Email"><Input className={inputClass} type="email" placeholder="contact@example.com" value={form.email} onChange={(event) => update("email", event.target.value)} /></Field>
          <Field label="Ngày bắt đầu sử dụng" required hint="Nhập theo định dạng dd/mm/yyyy."><div className="relative"><DateTextInput className={cn(inputClass, "pr-10")} value={form.startDate} onChange={(value) => update("startDate", value)} /><CalendarDays className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /></div></Field>
         <Field label="Tháng sử dụng" required><DurationPicker value={form.durationMonths} onChange={(value) => update("durationMonths", value)} /></Field>
         <Field label="Ngày kết thúc"><Input className={computedClass} readOnly value={computed.endDate ? displayDate(computed.endDate) : ""} placeholder="Tự động tính" /></Field>
        <Field label="Trạng thái sử dụng"><div className={cn("flex h-11 items-center rounded-xl border px-3.5 text-sm font-semibold", statusStyle)}>{computed.status}</div></Field>
        <Field label="Ngày sử dụng còn"><Input className={computedClass} readOnly value={computed.remaining} placeholder="Tự động tính" /></Field>
        <Field label="Gói dịch vụ" className="sm:col-span-2"><Input className={inputClass} placeholder="VD: Standard" value={form.servicePackage} onChange={(event) => update("servicePackage", event.target.value)} /></Field>
         <Field label="Sales bởi" hint="Có thể chọn nhiều nhân sự."><SearchableMultiSelect options={staffOptions} value={form.salesStaffIds} onChange={(ids) => update("salesStaffIds", ids)} placeholder="Chọn sales" searchPlaceholder="Tìm nhân sự..." className="min-h-11 rounded-xl border-slate-200 bg-slate-50/80" compactSelectionLabel="nhân sự" /></Field>
         <Field label="Quản lý bởi" hint="Có thể chọn nhiều nhân sự."><SearchableMultiSelect options={staffOptions} value={form.managerStaffIds} onChange={(ids) => update("managerStaffIds", ids)} placeholder="Chọn quản lý" searchPlaceholder="Tìm nhân sự..." className="min-h-11 rounded-xl border-slate-200 bg-slate-50/80" compactSelectionLabel="nhân sự" /></Field>
        <Field label="Ghi chú nội bộ" className="sm:col-span-2"><Textarea className="min-h-[112px] resize-y rounded-xl border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm shadow-none placeholder:text-slate-400 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-sky-100" placeholder="Ghi chú chỉ dành cho đội ngũ quản trị" value={form.internalNote} onChange={(event) => update("internalNote", event.target.value)} /></Field>
      </div>
      {formMessage && <div role="alert" className="mt-5 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm leading-5 text-rose-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{formMessage}</div>}
      {!formMessage && <div className="mt-4 flex items-center gap-2 text-xs text-slate-500"><CircleHelp className="h-3.5 w-3.5" />Thông tin sẽ được lưu vào hồ sơ tổ chức.</div>}
      </div>
      <DialogFooter className="shrink-0 flex-row items-center justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:px-9"><Button type="button" variant="ghost" onClick={() => setFormOpen(false)} className="h-10 rounded-lg px-4 text-slate-600"><X className="mr-1.5 h-4 w-4 sm:hidden" />Hủy</Button><Button type="button" disabled={saveMutation.isPending || (formMode === "edit" && detailQuery.isLoading)} onClick={submitForm} className="h-10 rounded-lg bg-slate-900 px-5 font-semibold text-white hover:bg-slate-800">{saveMutation.isPending ? "Đang lưu..." : formMode === "create" ? "Thêm Trung tâm/Doanh nghiệp" : "Lưu thay đổi"}</Button></DialogFooter>
    </DialogContent></Dialog>

    <Dialog open={viewOpen} onOpenChange={setViewOpen}><DialogContent className="max-h-[calc(100dvh-32px)] w-[calc(100%-24px)] max-w-2xl overflow-y-auto rounded-2xl border-slate-200"><DialogHeader><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">Hồ sơ tổ chức</p><DialogTitle className="text-2xl font-bold text-slate-900">{detail?.name || "Chi tiết tổ chức"}</DialogTitle><DialogDescription>{detail?.code || "Thông tin hồ sơ và thời hạn dịch vụ"}</DialogDescription></DialogHeader>
      {detailQuery.isLoading ? <div className="space-y-3 py-4">{[1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}</div> : detailQuery.isError ? <div className="rounded-lg bg-rose-50 p-4 text-sm text-rose-800">{getErrorMessage(detailQuery.error)} <Button variant="outline" size="sm" className="ml-2" onClick={() => detailQuery.refetch()}>Thử lại</Button></div> : detail && <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">{[
          ["Phân loại", detail.classification === "center" ? "Trung tâm" : "Doanh nghiệp"], ["Cơ sở", recordLocations(detail)], ["Domain", detail.domain], ["Trạng thái", detail.accountStatus === "suspended" ? "Tạm ngưng" : "Đang hoạt động"], ["Người liên hệ", detail.contactName], ["Số điện thoại", detail.phone], ["Email", detail.email], ["Ngày bắt đầu", displayDate(detail.startDate)], ["Ngày kết thúc", displayDate(detail.endDate || (parseDate(detail.startDate) && detail.durationMonths ? dateString(addMonths(parseDate(detail.startDate)!, Number(detail.durationMonths))) : ""))], ["Thời hạn", detail.durationMonths ? monthLabel(Number(detail.durationMonths)) : "—"], ["Sales bởi", staffName(detail.salesStaffIds)], ["Quản lý bởi", staffName(detail.managerStaffIds)], ["Gói dịch vụ", detail.servicePackage], ["Ghi chú", detail.internalNote],
      ].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{value || "—"}</div></div>)}</div>}
      <DialogFooter><Button variant="outline" onClick={() => setViewOpen(false)}>Đóng</Button></DialogFooter>
    </DialogContent></Dialog>

    <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}><DialogContent className="max-w-md rounded-2xl"><DialogHeader><DialogTitle>Xóa hồ sơ tổ chức?</DialogTitle><DialogDescription>Hồ sơ “{deleteTarget?.name}” sẽ được chuyển vào trạng thái đã xóa. Thao tác này không xóa vĩnh viễn dữ liệu.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteTarget(null)}>Hủy</Button><Button disabled={deleteMutation.isPending} onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} className="bg-rose-700 text-white hover:bg-rose-800">{deleteMutation.isPending ? "Đang xóa..." : "Xóa hồ sơ"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(renewTarget)} onOpenChange={(open) => { if (!open) setRenewTarget(null); }}><DialogContent className="max-w-md rounded-2xl"><DialogHeader><DialogTitle>Gia hạn dịch vụ</DialogTitle><DialogDescription>Thiết lập thời gian mới cho {renewTarget?.name || "tổ chức"}.</DialogDescription></DialogHeader><div className="space-y-4 py-2"><Field label="Ngày bắt đầu gia hạn" required hint="Nhập theo định dạng dd/mm/yyyy."><DateTextInput className={inputClass} value={renewStart} onChange={setRenewStart} /></Field><Field label="Thời hạn gia hạn" required><DurationPicker value={renewDuration} onChange={setRenewDuration} /></Field>{renewStart && renewDuration && <div className="flex items-center gap-2 rounded-lg bg-sky-50 p-3 text-sm text-sky-900"><Clock3 className="h-4 w-4" />Kết thúc dự kiến: {displayDate(dateString(addMonths(parseDate(renewStart)!, renewDuration)))}</div>}</div><DialogFooter><Button variant="outline" onClick={() => setRenewTarget(null)}>Hủy</Button><Button disabled={!renewStart || !renewDuration || renewMutation.isPending} onClick={() => renewMutation.mutate()} className="bg-slate-900 text-white hover:bg-slate-800">{renewMutation.isPending ? "Đang gia hạn..." : "Xác nhận gia hạn"}</Button></DialogFooter></DialogContent></Dialog>
  </DashboardLayout>;
}
