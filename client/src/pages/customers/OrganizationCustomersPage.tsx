import { useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  CalendarDays,
  Check,
  ChevronsUpDown,
  CircleHelp,
  Plus,
  Search,
  X,
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
import { useLocations } from "@/hooks/use-locations";
import { cn } from "@/lib/utils";

type OrganizationForm = {
  locationIds: string[];
  classification: "center" | "business" | "";
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
};

const emptyForm: OrganizationForm = {
  locationIds: [],
  classification: "",
  code: "",
  name: "",
  domain: "",
  status: "Đang hoạt động",
  contactName: "",
  phone: "",
  email: "",
  startDate: "",
  durationMonths: null,
  servicePackage: "",
  internalNote: "",
};

function parseDate(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addCalendarMonths(date: Date, months: number) {
  const result = new Date(date.getFullYear(), date.getMonth(), 1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(date.getDate(), lastDay));
  return result;
}

function wholeDaysBetween(from: Date, to: Date) {
  const utcFrom = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const utcTo = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((utcTo - utcFrom) / 86_400_000);
}

function monthLabel(months: number) {
  return months === 12 ? "12 tháng (1 năm)" : `${months} tháng`;
}

function Field({
  label,
  children,
  required = false,
  hint,
  className,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <Label className="text-[13px] font-semibold text-slate-800">
        {label}{required && <span className="ml-1 text-rose-600">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs leading-5 text-slate-500">{hint}</p>}
    </div>
  );
}

const inputClass = "h-11 rounded-xl border-slate-200 bg-slate-50/80 px-3.5 text-sm shadow-none placeholder:text-slate-400 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-sky-100";
const computedClass = "h-11 rounded-xl border-slate-200 bg-slate-100 px-3.5 text-sm text-slate-700 shadow-none";

function LocationPicker({
  locations,
  selected,
  onChange,
}: {
  locations: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedNames = locations.filter((item) => selected.includes(item.id));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2 text-left text-sm shadow-none transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-100"
        >
          <span className={cn("flex min-w-0 flex-1 flex-wrap gap-1.5", selected.length === 0 && "text-slate-400")}>
            {selectedNames.length ? selectedNames.map((location) => (
              <span key={location.id} className="rounded-md bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">{location.name}</span>
            )) : "Chọn một hoặc nhiều cơ sở"}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0">
        <Command>
          <CommandInput placeholder="Tìm cơ sở..." />
          <CommandList>
            <CommandEmpty>Không tìm thấy cơ sở.</CommandEmpty>
            <CommandGroup>
              {locations.map((location) => {
                const active = selected.includes(location.id);
                return (
                  <CommandItem
                    key={location.id}
                    value={location.name}
                    onSelect={() => onChange(active ? selected.filter((id) => id !== location.id) : [...selected, location.id])}
                    className="cursor-pointer"
                  >
                    <Check className={cn("h-4 w-4", active ? "opacity-100 text-sky-700" : "opacity-0")} />
                    {location.name}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          <div className="border-t px-3 py-2 text-xs text-slate-500">Chọn được nhiều cơ sở.</div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function DurationPicker({ value, onChange }: { value: number | null; onChange: (value: number) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = useMemo(() => Array.from({ length: 108 }, (_, index) => index + 13), []);
  const matching = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("vi");
    const all = [6, 12, ...options];
    return all.filter((months) => {
      const label = monthLabel(months).toLocaleLowerCase("vi");
      const years = `${months / 12} năm`;
      return !q || label.includes(q) || `${months} tháng`.includes(q) || years.includes(q);
    }).slice(0, q ? 60 : 10);
  }, [options, query]);

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
      <PopoverTrigger asChild>
        <button type="button" aria-expanded={open} className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 text-left text-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-100">
          <span className={value ? "font-medium text-slate-800" : "text-slate-400"}>{value ? monthLabel(value) : "Chọn thời hạn"}</span>
          <ChevronsUpDown className="h-4 w-4 text-slate-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[280px] overflow-hidden p-0 shadow-lg">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm số tháng hoặc số năm..."
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>
          <CommandList className="max-h-64">
            {matching.length === 0 ? <CommandEmpty>Không tìm thấy thời hạn.</CommandEmpty> : (
              <CommandGroup>
                {matching.map((months) => (
                  <CommandItem
                    key={months}
                    value={`${months} tháng`}
                    onSelect={() => { onChange(months); setOpen(false); setQuery(""); }}
                    className="min-h-10 cursor-pointer px-3"
                  >
                    <Check className={cn("h-4 w-4 text-sky-700", value === months ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1">{monthLabel(months)}</span>
                    {months === 12 && <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Mốc năm</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          <div className="border-t px-3 py-2 text-[11px] text-slate-500">
            {query ? `Tìm thấy ${matching.length} thời hạn` : "Đang hiển thị tối đa 10 gợi ý · nhập để tìm thêm"}
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function OrganizationCustomersPage() {
  const { data, isLoading, isError, refetch } = useLocations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<OrganizationForm>(emptyForm);
  const [formMessage, setFormMessage] = useState("");
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);

  const rawLocations = Array.isArray(data) ? data : Array.isArray((data as any)?.data) ? (data as any).data : [];
  const locations = rawLocations.map((item: any) => ({
    id: String(item.id),
    name: String(item.name ?? item.title ?? "Cơ sở"),
    code: String(item.code ?? "").trim(),
  }));
  const makeOrganizationCode = (locationIds: string[], classification: OrganizationForm["classification"]) => {
    const selectedLocation = locations.find((location: { id: string; code: string }) => location.id === locationIds[0]);
    if (!selectedLocation?.code || !classification) return "";
    return `${selectedLocation.code} - ${classification === "center" ? "TT" : "DN"} - 01`;
  };
  const computed = useMemo(() => {
    const start = parseDate(form.startDate);
    if (!start || !form.durationMonths) return { endDate: "", status: "—", remaining: "—", statusTone: "neutral" };
    const end = addCalendarMonths(start, form.durationMonths);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysToStart = wholeDaysBetween(today, start);
    const daysToEnd = wholeDaysBetween(today, end);
    const status = daysToStart > 0 ? "Chưa đến hạn" : daysToEnd > 0 ? "Đang sử dụng" : "Hết hạn";
    return {
      endDate: formatDate(end),
      status,
      remaining: `${Math.max(0, daysToEnd)} ngày`,
      statusTone: status === "Chưa đến hạn" ? "future" : status === "Đang sử dụng" ? "active" : "expired",
    };
  }, [form.startDate, form.durationMonths]);

  const update = <K extends keyof OrganizationForm>(key: K, value: OrganizationForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFormMessage("");
  };

  const updateLocations = (locationIds: string[]) => {
    setForm((current) => ({
      ...current,
      locationIds,
      code: codeManuallyEdited ? current.code : makeOrganizationCode(locationIds, current.classification),
    }));
    setFormMessage("");
  };

  const updateClassification = (classification: OrganizationForm["classification"]) => {
    setForm((current) => ({
      ...current,
      classification,
      code: codeManuallyEdited ? current.code : makeOrganizationCode(current.locationIds, classification),
    }));
    setFormMessage("");
  };

  const openNewDialog = () => {
    setForm(emptyForm);
    setFormMessage("");
    setCodeManuallyEdited(false);
    setDialogOpen(true);
  };

  const unavailable = () => setFormMessage(
    "Chức năng lưu Trung tâm/Doanh nghiệp chưa được triển khai. Thông tin hiện chỉ được giữ tạm trong biểu mẫu.",
  );

  const statusStyle = computed.statusTone === "future"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : computed.statusTone === "active"
      ? "border-sky-200 bg-sky-50 text-sky-800"
      : computed.statusTone === "expired"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-slate-200 bg-slate-100 text-slate-500";

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1440px]">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">
              <Building2 className="h-4 w-4" /> Quan hệ tổ chức
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-[28px]">Trung tâm/Doanh nghiệp</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-slate-500">Quản lý thông tin liên hệ và thời hạn sử dụng dịch vụ của các tổ chức.</p>
          </div>
          <Button onClick={openNewDialog} className="h-10 shrink-0 rounded-lg bg-slate-900 px-4 text-white hover:bg-slate-800">
            <Plus className="mr-2 h-4 w-4" /> Thêm mới
          </Button>
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Danh sách Trung tâm/Doanh nghiệp</h2>
              <p className="mt-1 text-xs text-slate-500">Chưa có dữ liệu được lưu.</p>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> 0 Trung tâm/Doanh nghiệp
            </span>
          </div>
          <div className="flex min-h-[250px] flex-col items-center justify-center px-5 py-10 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
              <Building2 className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">Chưa có Trung tâm/Doanh nghiệp</h3>
            <p className="mt-1 max-w-sm text-sm text-slate-500">Thêm hồ sơ mới để bắt đầu quản lý thông tin tổ chức và gói dịch vụ.</p>
            <Button variant="outline" onClick={openNewDialog} className="mt-4 h-9 rounded-lg border-slate-300 text-slate-700">
              <Plus className="mr-2 h-4 w-4" /> Thêm mới
            </Button>
          </div>
        </section>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-24px)] w-[calc(100%-16px)] max-w-[920px] flex-col gap-0 overflow-hidden rounded-2xl border-slate-200 bg-white p-0 shadow-2xl sm:max-h-[calc(100dvh-40px)] sm:w-[calc(100%-40px)]">
          <div className="shrink-0 border-b border-slate-100 px-5 py-5 pr-14 sm:px-9 sm:py-7">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-800">Tạo dữ liệu mới</p>
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">Thêm Trung tâm/Doanh nghiệp</DialogTitle>
              <DialogDescription className="sr-only">Nhập thông tin Trung tâm/Doanh nghiệp mới.</DialogDescription>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-9 sm:py-6">
            <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-5">
              <Field label="Cơ sở" required hint="Có thể chọn nhiều cơ sở; mã tự động dùng cơ sở đầu tiên.">
                {isLoading ? (
                  <div className="h-11 animate-pulse rounded-xl bg-slate-100" />
                ) : isError ? (
                  <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800">
                    <span>Không tải được danh sách cơ sở.</span><Button variant="outline" size="sm" onClick={() => refetch()}>Thử lại</Button>
                  </div>
                ) : (
                  <LocationPicker locations={locations} selected={form.locationIds} onChange={updateLocations} />
                )}
                {formMessage.includes("Chọn ít nhất") && <p className="text-xs text-rose-600">Vui lòng chọn ít nhất một cơ sở.</p>}
              </Field>

              <Field label="Phân loại" required>
                <Select value={form.classification} onValueChange={(value) => updateClassification(value as OrganizationForm["classification"])}>
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/80 px-3.5 text-sm shadow-none">
                    <SelectValue placeholder="Chọn loại hình" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="center">Trung tâm</SelectItem>
                    <SelectItem value="business">Doanh nghiệp</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Mã trung tâm/doanh nghiệp" hint="Tự tạo theo cơ sở và phân loại; có thể sửa thủ công.">
                <Input
                  className={inputClass}
                  placeholder="Chọn cơ sở và phân loại để tạo mã"
                  value={form.code}
                  onChange={(event) => {
                    setCodeManuallyEdited(true);
                    update("code", event.target.value);
                  }}
                />
              </Field>
              <Field label="Tên trung tâm/doanh nghiệp">
                <Input className={inputClass} placeholder="Nhập tên Trung tâm/Doanh nghiệp" value={form.name} onChange={(event) => update("name", event.target.value)} />
              </Field>
              <Field label="Domain">
                <Input className={inputClass} placeholder="example.easyedu.vn" value={form.domain} onChange={(event) => update("domain", event.target.value)} />
              </Field>
              <Field label="Trạng thái">
                <Select value={form.status} onValueChange={(value) => update("status", value)}>
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/80 px-3.5 text-sm shadow-none"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Đang hoạt động">Đang hoạt động</SelectItem>
                    <SelectItem value="Tạm ngưng">Tạm ngưng</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Người liên hệ">
                <Input className={inputClass} placeholder="Họ và tên" value={form.contactName} onChange={(event) => update("contactName", event.target.value)} />
              </Field>
              <Field label="Số điện thoại">
                <Input className={inputClass} placeholder="090..." inputMode="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} />
              </Field>
              <Field label="Email">
                <Input className={inputClass} type="email" placeholder="contact@example.com" value={form.email} onChange={(event) => update("email", event.target.value)} />
              </Field>
              <Field label="Ngày bắt đầu sử dụng">
                <div className="relative">
                  <Input className={cn(inputClass, "pr-10")} type="date" value={form.startDate} onChange={(event) => update("startDate", event.target.value)} />
                  <CalendarDays className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                </div>
              </Field>
              <Field label="Tháng sử dụng">
                <DurationPicker value={form.durationMonths} onChange={(months) => update("durationMonths", months)} />
              </Field>
              <Field label="Ngày kết thúc">
                <Input className={computedClass} readOnly value={computed.endDate} placeholder="Tự động tính từ ngày bắt đầu" />
              </Field>
              <Field label="Trạng thái sử dụng">
                <div className={cn("flex h-11 items-center rounded-xl border px-3.5 text-sm font-semibold", statusStyle)}>{computed.status}</div>
              </Field>
              <Field label="Ngày sử dụng còn">
                <Input className={computedClass} readOnly value={computed.remaining} placeholder="Tự động tính" />
              </Field>
              <Field label="Gói dịch vụ" className="sm:col-span-2">
                <Input className={inputClass} placeholder="VD: Standard" value={form.servicePackage} onChange={(event) => update("servicePackage", event.target.value)} />
              </Field>
              <Field label="Ghi chú nội bộ" className="sm:col-span-2">
                <Textarea className="min-h-[112px] resize-y rounded-xl border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm shadow-none placeholder:text-slate-400 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-sky-100" placeholder="Ghi chú chỉ dành cho đội ngũ quản trị" value={form.internalNote} onChange={(event) => update("internalNote", event.target.value)} />
              </Field>
            </div>
            {formMessage && !formMessage.includes("Chọn ít nhất") && (
              <div role="status" className="mt-5 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm leading-5 text-amber-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{formMessage}
              </div>
            )}
            {!formMessage && <div className="mt-4 flex items-center gap-2 text-xs text-slate-500"><CircleHelp className="h-3.5 w-3.5" />Dữ liệu chưa được lưu vào hệ thống.</div>}
          </div>

          <DialogFooter className="shrink-0 flex-row items-center justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:px-9">
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} className="h-10 rounded-lg px-4 text-slate-600 hover:bg-slate-100">
              <X className="mr-1.5 h-4 w-4 sm:hidden" /> Hủy
            </Button>
            <Button type="button" onClick={() => {
              if (!form.locationIds.length) {
                setFormMessage("Chọn ít nhất một cơ sở trước khi tiếp tục.");
                return;
              }
                if (!form.classification) {
                  setFormMessage("Chọn loại hình Trung tâm hoặc Doanh nghiệp trước khi tiếp tục.");
                  return;
                }
                unavailable();
            }} className="h-10 rounded-lg bg-slate-900 px-5 font-semibold text-white hover:bg-slate-800">
              Thêm Trung tâm/Doanh nghiệp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
