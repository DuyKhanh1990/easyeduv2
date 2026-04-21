import { useState, useRef, useMemo, useEffect } from "react";
import { FileViewer } from "@/components/ui/file-viewer";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  CalendarIcon, Search, X, Paperclip, ChevronDown, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { TaskStatus, TaskLevel, Task } from "@shared/schema";

/* ─── Types ──────────────────────────────────────────────── */
interface SelectOption { id: string; label: string; sub?: string; color?: string }

/* ─── UserMultiSelect ────────────────────────────────────── */
function UserMultiSelect({
  label, required, placeholder, options, selected, onChange, hint, isLoading, "data-testid": testId,
}: {
  label: string; required?: boolean; placeholder: string;
  options: SelectOption[]; selected: string[];
  onChange: (ids: string[]) => void;
  hint?: string;
  isLoading?: boolean;
  "data-testid"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) return options.filter(o => o.label.toLowerCase().includes(q) || (o.sub || "").toLowerCase().includes(q));
    return options.slice(0, 10);
  }, [options, search]);

  const selectedOptions = useMemo(() => options.filter(o => selected.includes(o.id)), [options, selected]);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}{required && <span className="text-destructive ml-0.5">*</span>}</Label>
      <Popover open={open} onOpenChange={v => { setOpen(v); if (!v) setSearch(""); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid={testId}
            className="w-full min-h-[38px] flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-1.5 text-sm hover:border-primary/60 transition-colors"
          >
            <div className="flex flex-wrap gap-1 flex-1 min-w-0">
              {selectedOptions.length === 0
                ? <span className="text-muted-foreground text-xs">{placeholder}</span>
                : selectedOptions.map(o => (
                    <span key={o.id} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-1.5 py-0.5 rounded-full">
                      {o.label}
                      <button type="button" onClick={e => { e.stopPropagation(); toggle(o.id); }} className="hover:text-destructive">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8 h-8 text-xs" placeholder="Tìm kiếm..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {!search && options.length > 10 && (
              <p className="text-[10px] text-muted-foreground mt-1 pl-1">
                Hiển thị 10 đầu tiên • nhập tên để tìm thêm
              </p>
            )}
            {hint && !search && (
              <p className="text-[10px] text-blue-500 mt-1 pl-1">{hint}</p>
            )}
          </div>
          <div className="max-h-52 overflow-y-auto">
            {isLoading ? (
              <div className="py-4 text-center text-xs text-muted-foreground">Đang tải...</div>
            ) : filtered.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                {options.length === 0 ? "Không có dữ liệu" : "Không tìm thấy"}
              </div>
            ) : (
              filtered.map(opt => (
                <label key={opt.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                  <Checkbox checked={selected.includes(opt.id)} onCheckedChange={() => toggle(opt.id)} />
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm truncate">{opt.label}</span>
                    {opt.sub && <span className="text-[10px] text-muted-foreground">{opt.sub}</span>}
                  </div>
                </label>
              ))
            )}
          </div>
          {selected.length > 0 && (
            <div className="p-2 border-t text-[11px] text-muted-foreground flex justify-between">
              <span>Đã chọn: {selected.length}</span>
              <button type="button" className="text-destructive hover:underline" onClick={() => onChange([])}>Bỏ chọn tất cả</button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ─── SimpleMultiSelect (for locations) ─────────────────── */
function SimpleMultiSelect({
  label, required, placeholder, options, selected, onChange, "data-testid": testId,
}: {
  label: string; required?: boolean; placeholder: string;
  options: SelectOption[]; selected: string[];
  onChange: (ids: string[]) => void; "data-testid"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;
  }, [options, search]);

  const selectedOptions = options.filter(o => selected.includes(o.id));

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}{required && <span className="text-destructive ml-0.5">*</span>}</Label>
      <Popover open={open} onOpenChange={v => { setOpen(v); setSearch(""); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid={testId}
            className="w-full min-h-[38px] flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-1.5 text-sm hover:border-primary/60 transition-colors"
          >
            <div className="flex flex-wrap gap-1 flex-1 min-w-0">
              {selectedOptions.length === 0
                ? <span className="text-muted-foreground text-xs">{placeholder}</span>
                : selectedOptions.map(o => (
                    <span key={o.id} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-1.5 py-0.5 rounded-full">
                      {o.label}
                      <button type="button" onClick={e => { e.stopPropagation(); toggle(o.id); }} className="hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
                    </span>
                  ))}
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          {options.length > 4 && (
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="pl-8 h-8 text-xs" placeholder="Tìm kiếm..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
          )}
          <div className="max-h-48 overflow-y-auto">
            {filtered.map(opt => (
              <label key={opt.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                <Checkbox checked={selected.includes(opt.id)} onCheckedChange={() => toggle(opt.id)} />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ─── SingleSelect ───────────────────────────────────────── */
function SingleSelect({
  label, placeholder, options, value, onChange, "data-testid": testId,
}: {
  label: string; placeholder: string;
  options: SelectOption[]; value: string;
  onChange: (id: string) => void; "data-testid"?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.id === value);

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" data-testid={testId}
            className="w-full h-[38px] flex items-center justify-between gap-2 rounded-md border bg-background px-3 text-sm hover:border-primary/60 transition-colors"
          >
            {selected
              ? <span className="flex items-center gap-2">
                  {selected.color && <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: selected.color }} />}
                  {selected.label}
                </span>
              : <span className="text-muted-foreground text-xs">{placeholder}</span>
            }
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-1" align="start">
          {options.map(opt => (
            <button key={opt.id} type="button"
              onClick={() => { onChange(opt.id); setOpen(false); }}
              className={cn("w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted/60 transition-colors", value === opt.id && "bg-primary/10 text-primary font-medium")}
            >
              {opt.color && <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />}
              {opt.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ─── DateTimePicker ─────────────────────────────────────── */
function DateTimePicker({
  label, required, value, onChange, error, "data-testid": testId,
}: {
  label: string; required?: boolean;
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
  error?: string;
  "data-testid"?: string;
}) {
  const [open, setOpen] = useState(false);
  const hour = value ? value.getHours().toString().padStart(2, "0") : "08";
  const minute = value ? value.getMinutes().toString().padStart(2, "0") : "00";

  function handleDateSelect(d: Date | undefined) {
    if (!d) { onChange(undefined); return; }
    const next = new Date(d);
    next.setHours(parseInt(hour), parseInt(minute), 0, 0);
    onChange(next);
    setOpen(false);
  }

  function handleTimeChange(type: "hour" | "minute", val: string) {
    const base = value ? new Date(value) : new Date();
    if (type === "hour") base.setHours(parseInt(val));
    else base.setMinutes(parseInt(val));
    base.setSeconds(0, 0);
    onChange(base);
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}{required && <span className="text-destructive ml-0.5">*</span>}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid={testId}
            className={cn(
              "w-full h-[38px] flex items-center gap-2 rounded-md border bg-background px-3 text-sm hover:border-primary/60 transition-colors",
              error && "border-destructive"
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {value
              ? <span className="text-xs">{format(value, "dd/MM/yyyy HH:mm")}</span>
              : <span className="text-muted-foreground text-xs">Chọn ngày & giờ</span>
            }
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={handleDateSelect}
            locale={vi}
            initialFocus
          />
          {/* Time picker */}
          <div className="border-t p-3 flex items-center gap-3">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-1.5">
              <select
                value={hour}
                onChange={e => handleTimeChange("hour", e.target.value)}
                className="border rounded px-2 py-1 text-sm bg-background"
                data-testid={testId ? `${testId}-hour` : undefined}
              >
                {Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0")).map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <span className="text-muted-foreground font-bold">:</span>
              <select
                value={minute}
                onChange={e => handleTimeChange("minute", e.target.value)}
                className="border rounded px-2 py-1 text-sm bg-background"
                data-testid={testId ? `${testId}-minute` : undefined}
              >
                {["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

/* ─── File Attachment ────────────────────────────────────── */
interface SavedAttachment { name: string; url?: string; size?: number; type?: string; mimetype?: string }

function FileAttachmentArea({
  files, onChange, existingAttachments, onRemoveExisting,
}: {
  files: File[];
  onChange: (f: File[]) => void;
  existingAttachments?: SavedAttachment[];
  onRemoveExisting?: (i: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null);
  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" multiple className="hidden"
        onChange={e => { if (e.target.files) onChange([...files, ...Array.from(e.target.files)]); }}
        data-testid="input-file-attachment"
      />
      <button type="button" onClick={() => inputRef.current?.click()}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors py-1 px-2 border border-dashed rounded-md hover:border-primary/50"
        data-testid="button-attach-file"
      >
        <Paperclip className="h-3.5 w-3.5" /> Đính kèm file
      </button>
      {((existingAttachments?.length ?? 0) > 0 || files.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {existingAttachments?.map((att, i) => (
            <div key={`existing-${i}`} className="flex items-center gap-1.5 bg-blue-50 text-xs px-2 py-1 rounded-md border border-blue-200">
              <Paperclip className="h-3 w-3 text-blue-500" />
              {att.url ? (
                <button type="button" onClick={() => setViewerFile({ url: att.url!, name: att.name })}
                  className="max-w-[160px] truncate text-blue-600 hover:underline text-left">
                  {att.name}
                </button>
              ) : (
                <span className="max-w-[160px] truncate text-muted-foreground">{att.name}</span>
              )}
              {onRemoveExisting && (
                <button type="button" onClick={() => onRemoveExisting(i)} className="text-muted-foreground hover:text-destructive ml-0.5">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          {files.map((file, i) => (
            <div key={`new-${i}`} className="flex items-center gap-1.5 bg-muted text-xs px-2 py-1 rounded-md">
              <Paperclip className="h-3 w-3 text-muted-foreground" />
              <span className="max-w-[160px] truncate">{file.name}</span>
              <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive ml-0.5">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <FileViewer
        open={!!viewerFile}
        onClose={() => setViewerFile(null)}
        url={viewerFile?.url ?? ""}
        name={viewerFile?.name ?? ""}
        canDownload={true}
      />
    </div>
  );
}

/* ─── Form state ─────────────────────────────────────────── */
interface TaskFormData {
  locationIds: string[];
  title: string;
  departmentId: string;
  statusId: string;
  content: string;
  files: File[];
  existingAttachments: SavedAttachment[];
  subjectIds: string[];
  managerIds: string[];
  assigneeIds: string[];
  levelId: string;
  dueDate: Date | undefined;
}

function buildDefaultForm(defaultStatusId = "", defaultLevelId = ""): TaskFormData {
  const today = new Date();
  today.setHours(8, 0, 0, 0);
  return {
    locationIds: [], title: "", departmentId: "", statusId: defaultStatusId,
    content: "", files: [], existingAttachments: [], subjectIds: [], managerIds: [],
    assigneeIds: [], levelId: defaultLevelId, dueDate: today,
  };
}

/* ─── Main Dialog ────────────────────────────────────────── */
export function CreateTaskDialog({
  open, onOpenChange, onCreated, initialTask,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
  initialTask?: Task | null;
}) {
  const isEditMode = !!initialTask;
  const { toast } = useToast();
  const [form, setForm] = useState<TaskFormData>(() => buildDefaultForm());
  const [errors, setErrors] = useState<Partial<Record<keyof TaskFormData, string>>>({});
  const [isUploading, setIsUploading] = useState(false);

  /* ── Fetch all data ─── */
  const { data: locations = [] } = useQuery<any[]>({ queryKey: ["/api/locations"] });
  const { data: departments = [] } = useQuery<any[]>({ queryKey: ["/api/departments"] });
  const { data: taskStatuses = [] } = useQuery<TaskStatus[]>({ queryKey: ["/api/task-statuses"] });
  const { data: taskLevels = [] } = useQuery<TaskLevel[]>({ queryKey: ["/api/task-levels"] });

  // Build server-side filter URL based on selected location
  const firstLocationId = form.locationIds[0] ?? "";
  const staffUrl = firstLocationId
    ? `/api/staff?locationId=${firstLocationId}&minimal=true`
    : "/api/staff?minimal=true";
  const studentUrl = firstLocationId
    ? `/api/students?locationId=${firstLocationId}&limit=200&minimal=true`
    : "/api/students?limit=200&minimal=true";

  const { data: staffRaw, isFetching: staffFetching } = useQuery<any>({
    queryKey: ["/api/staff", firstLocationId, "minimal"],
    queryFn: () => fetch(staffUrl, { credentials: "include" }).then(r => r.json()),
  });
  const { data: studentRaw, isFetching: studentFetching } = useQuery<any>({
    queryKey: ["/api/students", firstLocationId, "minimal"],
    queryFn: () => fetch(studentUrl, { credentials: "include" }).then(r => r.json()),
  });

  const allStaff: any[] = useMemo(() => Array.isArray(staffRaw) ? staffRaw : (staffRaw?.data ?? []), [staffRaw]);
  const allStudents: any[] = useMemo(() => Array.isArray(studentRaw) ? studentRaw : (studentRaw?.students ?? studentRaw?.data ?? []), [studentRaw]);

  const defaultStatus = taskStatuses.find(s => s.isFixed && s.position === 0);
  const defaultLevel = taskLevels[0]; // first level in config

  /* ── Sync defaults / pre-fill from initialTask when dialog opens ─── */
  useEffect(() => {
    if (open) {
      if (initialTask) {
        const savedAtts: SavedAttachment[] = Array.isArray(initialTask.attachments)
          ? (initialTask.attachments as any[]).filter((a: any) => a && a.name)
          : [];
        setForm({
          locationIds: initialTask.locationIds ?? [],
          title: initialTask.title ?? "",
          departmentId: initialTask.departmentId ?? "",
          statusId: initialTask.statusId ?? defaultStatus?.id ?? "",
          content: initialTask.content ?? "",
          files: [],
          existingAttachments: savedAtts,
          subjectIds: initialTask.subjectIds ?? [],
          managerIds: initialTask.managerIds ?? [],
          assigneeIds: initialTask.assigneeIds ?? [],
          levelId: initialTask.levelId ?? defaultLevel?.id ?? "",
          dueDate: initialTask.dueDate ? new Date(initialTask.dueDate) : undefined,
        });
      } else {
        setForm(prev => ({
          ...prev,
          statusId: prev.statusId || defaultStatus?.id || "",
          levelId: prev.levelId || defaultLevel?.id || "",
        }));
      }
      setErrors({});
    }
  }, [open, initialTask, defaultStatus?.id, defaultLevel?.id]);

  /* ── When multiple locations selected, client-side filter for staff ─── */
  const filteredStaff = useMemo(() => {
    if (form.locationIds.length <= 1) return allStaff;
    return allStaff.filter((s: any) =>
      Array.isArray(s.locationIds) && s.locationIds.some((lid: string) => form.locationIds.includes(lid))
    );
  }, [allStaff, form.locationIds]);

  const filteredStudents = useMemo(() => {
    if (form.locationIds.length <= 1) return allStudents;
    return allStudents.filter((s: any) =>
      Array.isArray(s.locations) &&
      s.locations.some((l: any) => form.locationIds.includes(l.locationId ?? l.location_id))
    );
  }, [allStudents, form.locationIds]);

  /* ── Option lists ─── */
  const locationOptions: SelectOption[] = (locations as any[]).map(l => ({ id: l.id, label: l.name }));
  const departmentOptions: SelectOption[] = (departments as any[]).map(d => ({ id: d.id, label: d.name }));
  const statusOptions: SelectOption[] = taskStatuses.map(s => ({ id: s.id, label: s.name, color: s.color }));
  const levelOptions: SelectOption[] = taskLevels.map(l => ({ id: l.id, label: l.name, color: l.color }));
  const staffOptions: SelectOption[] = filteredStaff.map((s: any) => ({ id: s.id, label: s.fullName, sub: s.email || s.phone || "" }));
  const studentOptions: SelectOption[] = filteredStudents.map((s: any) => ({ id: s.id, label: s.fullName, sub: s.type || "" }));

  const locationHint = form.locationIds.length > 0
    ? `Lọc theo ${form.locationIds.length} cơ sở đã chọn`
    : "Hiển thị tất cả — chọn cơ sở để lọc";

  /* ── Mutations ─── */
  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/tasks", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Đã tạo công việc thành công" });
      onCreated?.();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/tasks/${initialTask!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Đã cập nhật công việc thành công" });
      onCreated?.();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  /* ── Patch ─── */
  function patch<K extends keyof TaskFormData>(key: K, value: TaskFormData[K]) {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      if (key === "locationIds") {
        next.subjectIds = [];
        next.managerIds = [];
        next.assigneeIds = [];
      }
      return next;
    });
    if (errors[key]) setErrors(p => ({ ...p, [key]: undefined }));
  }

  /* ── Open/close handler ─── */
  function handleOpen(v: boolean) {
    if (v && !isEditMode) {
      const today = new Date(); today.setHours(8, 0, 0, 0);
      setForm({
        locationIds: [], title: "", departmentId: "",
        statusId: defaultStatus?.id || "",
        content: "", files: [], subjectIds: [], managerIds: [],
        assigneeIds: [], levelId: defaultLevel?.id || "", dueDate: today,
      });
      setErrors({});
    }
    onOpenChange(v);
  }

  /* ── Validate ─── */
  function validate() {
    const e: typeof errors = {};
    if (form.locationIds.length === 0) e.locationIds = "Vui lòng chọn ít nhất một cơ sở";
    if (!form.title.trim()) e.title = "Tiêu đề không được để trống";
    if (form.managerIds.length === 0) e.managerIds = "Vui lòng chọn ít nhất một quản lý";
    if (form.assigneeIds.length === 0) e.assigneeIds = "Vui lòng chọn người thực hiện";
    if (!form.dueDate) e.dueDate = "Vui lòng chọn hạn hoàn thành";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  /* ── Submit ─── */
  async function handleSubmit() {
    if (!validate()) return;

    let uploadedAttachments: SavedAttachment[] = [];

    if (form.files.length > 0) {
      setIsUploading(true);
      try {
        const fd = new FormData();
        form.files.forEach(f => fd.append("files", f));
        const res = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
        if (!res.ok) throw new Error("Upload thất bại");
        const data = await res.json();
        uploadedAttachments = (data.files ?? []) as SavedAttachment[];
      } catch (err: any) {
        toast({ title: "Lỗi upload file", description: err.message, variant: "destructive" });
        setIsUploading(false);
        return;
      } finally {
        setIsUploading(false);
      }
    }

    const allAttachments: SavedAttachment[] = [...form.existingAttachments, ...uploadedAttachments];

    const payload = {
      title: form.title.trim(),
      content: form.content,
      locationIds: form.locationIds,
      departmentId: form.departmentId || null,
      statusId: form.statusId || null,
      levelId: form.levelId || null,
      dueDate: form.dueDate ? form.dueDate.toISOString() : null,
      subjectIds: form.subjectIds,
      managerIds: form.managerIds,
      assigneeIds: form.assigneeIds,
      attachments: allAttachments,
    };
    if (isEditMode) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="w-[85vw] max-w-[85vw] max-h-[90vh] overflow-y-auto" data-testid="dialog-create-task">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {isEditMode ? "Chỉnh sửa công việc" : "Thêm công việc mới"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* ── Row 1: Cơ sở | Tiêu đề | Phòng ban | Trạng thái ── */}
          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-1">
              <SimpleMultiSelect
                label="Cơ sở" required placeholder="Chọn cơ sở"
                options={locationOptions} selected={form.locationIds}
                onChange={v => patch("locationIds", v)}
                data-testid="select-locations"
              />
              {errors.locationIds && <p className="text-[11px] text-destructive">{errors.locationIds}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="task-title">Tiêu đề <span className="text-destructive">*</span></Label>
              <Input
                id="task-title" placeholder="Nhập tiêu đề công việc"
                value={form.title} onChange={e => patch("title", e.target.value)}
                className={cn("h-[38px]", errors.title && "border-destructive")}
                data-testid="input-task-title"
              />
              {errors.title && <p className="text-[11px] text-destructive">{errors.title}</p>}
            </div>

            <SingleSelect
              label="Phòng ban" placeholder="Chọn phòng ban"
              options={departmentOptions} value={form.departmentId}
              onChange={v => patch("departmentId", v)}
              data-testid="select-department"
            />

            <SingleSelect
              label="Trạng thái" placeholder="Chọn trạng thái"
              options={statusOptions} value={form.statusId}
              onChange={v => patch("statusId", v)}
              data-testid="select-status"
            />
          </div>

          {/* ── Row 2: Nội dung + đính kèm ── */}
          <div className="space-y-2">
            <Label htmlFor="task-content">Nội dung</Label>
            <Textarea
              id="task-content" placeholder="Nhập nội dung công việc..."
              value={form.content} onChange={e => patch("content", e.target.value)}
              rows={4} className="resize-none"
              data-testid="textarea-task-content"
            />
            <FileAttachmentArea
              files={form.files}
              onChange={v => patch("files", v)}
              existingAttachments={form.existingAttachments}
              onRemoveExisting={i => patch("existingAttachments", form.existingAttachments.filter((_, j) => j !== i))}
            />
          </div>

          {/* ── Row 3: 5 columns ── */}
          <div className="grid grid-cols-5 gap-4">
            {/* Đối tượng */}
            <UserMultiSelect
              label="Đối tượng"
              placeholder="Học viên / Phụ huynh"
              options={studentOptions}
              selected={form.subjectIds}
              onChange={v => patch("subjectIds", v)}
              hint={locationHint}
              isLoading={studentFetching}
              data-testid="select-subjects"
            />

            {/* Quản lý */}
            <div className="space-y-1">
              <UserMultiSelect
                label="Quản lý" required
                placeholder="Chọn quản lý"
                options={staffOptions}
                selected={form.managerIds}
                onChange={v => patch("managerIds", v)}
                hint={locationHint}
                isLoading={staffFetching}
                data-testid="select-managers"
              />
              {errors.managerIds && <p className="text-[11px] text-destructive">{errors.managerIds}</p>}
            </div>

            {/* Người thực hiện */}
            <div className="space-y-1">
              <UserMultiSelect
                label="Người thực hiện" required
                placeholder="Chọn người thực hiện"
                options={staffOptions}
                selected={form.assigneeIds}
                onChange={v => patch("assigneeIds", v)}
                hint={locationHint}
                isLoading={staffFetching}
                data-testid="select-assignees"
              />
              {errors.assigneeIds && <p className="text-[11px] text-destructive">{errors.assigneeIds}</p>}
            </div>

            {/* Mức độ */}
            <SingleSelect
              label="Mức độ" placeholder="Chọn mức độ"
              options={levelOptions} value={form.levelId}
              onChange={v => patch("levelId", v)}
              data-testid="select-level"
            />

            {/* Hạn hoàn thành */}
            <DateTimePicker
              label="Hạn hoàn thành" required
              value={form.dueDate}
              onChange={v => patch("dueDate", v)}
              error={errors.dueDate}
              data-testid="select-due-date"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => handleOpen(false)} data-testid="button-cancel-create-task">
            Huỷ
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isUploading || createMutation.isPending || updateMutation.isPending}
            data-testid="button-submit-create-task"
          >
            {isUploading
              ? "Đang upload file..."
              : isEditMode
                ? (updateMutation.isPending ? "Đang lưu..." : "Lưu thay đổi")
                : (createMutation.isPending ? "Đang tạo..." : "Tạo công việc")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
