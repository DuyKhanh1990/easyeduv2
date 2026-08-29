import { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Copy, Check, X, ChevronsUpDown, CalendarIcon, Loader2, AlertCircle, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { groupRowsByClassCode, submitClassGroups, type ParsedClassRow } from "@/hooks/use-class-bulk-submit";

const MAX_CLASSES_PER_SUBMIT = 15;

interface InlineRow {
  id: string;
  classCode: string;
  className: string;
  locationId: string | null;
  maxStudents: number | null;
  learningFormat: "online" | "offline";
  onlineLink: string;
  weekday: number | null;
  shiftId: string | null;
  startDate: string | null;
  endDate: string | null;
  endSessions: number | null;
  teacherIds: string[];
  studentIds: string[];
  courseId: string | null;
  feePackageId: string | null;
}

interface StudentMinimal {
  id: string;
  fullName: string;
  type: string | null;
  locations: { locationId: string }[];
}

const WEEKDAYS = [
  { value: 1, label: "T2" }, { value: 2, label: "T3" }, { value: 3, label: "T4" },
  { value: 4, label: "T5" }, { value: 5, label: "T6" }, { value: 6, label: "T7" },
  { value: 0, label: "CN" },
];

const newRow = (): InlineRow => ({
  id: Math.random().toString(36).slice(2),
  classCode: "", className: "", locationId: null, maxStudents: null,
  learningFormat: "offline", onlineLink: "",
  weekday: null, shiftId: null,
  startDate: null, endDate: null, endSessions: null,
  teacherIds: [], studentIds: [],
  courseId: null, feePackageId: null,
});

interface RowValidation {
  status: "empty" | "valid" | "invalid";
  errors: string[];
}

function validateRow(r: InlineRow): RowValidation {
  const isEmpty =
    !r.classCode && !r.className && !r.locationId && r.weekday == null &&
    !r.shiftId && r.teacherIds.length === 0 && r.studentIds.length === 0 &&
    !r.courseId && !r.feePackageId && !r.onlineLink && r.endSessions == null;
  if (isEmpty) return { status: "empty", errors: [] };
  const errors: string[] = [];
  if (!r.classCode.trim()) errors.push("Thiếu Mã lớp");
  if (!r.className.trim()) errors.push("Thiếu Tên lớp");
  if (!r.locationId) errors.push("Thiếu Cơ sở");
  if (!r.courseId) errors.push("Thiếu Khoá học");
  if (!r.feePackageId) errors.push("Thiếu Gói học phí");
  if (r.learningFormat === "online" && !r.onlineLink.trim()) errors.push("Thiếu Link online");
  if ((r.weekday != null) !== !!r.shiftId) errors.push("Chu kỳ và Ca học phải đi cùng nhau");
  if (r.startDate && r.endDate && r.startDate > r.endDate) errors.push("Ngày kết thúc phải sau ngày bắt đầu");
  if (r.endDate && r.endSessions != null) errors.push("Chỉ được chọn 1 trong 2: ngày kết thúc HOẶC số buổi");
  if (r.endSessions != null && r.endSessions <= 0) errors.push("Số buổi phải lớn hơn 0");
  if (r.maxStudents != null && r.maxStudents < 0) errors.push("Số học viên không hợp lệ");
  return { status: errors.length ? "invalid" : "valid", errors };
}

interface InlineClassEntryProps {
  locations: any[] | undefined;
  onSuccess?: () => void;
}

export function InlineClassEntry({ locations, onSuccess }: InlineClassEntryProps) {
  const { toast } = useToast();
  const { data: shiftTemplates } = useQuery<any[]>({ queryKey: ["/api/shift-templates?type=class"] });
  const { data: staff } = useQuery<any[]>({ queryKey: ["/api/staff?minimal=true"] });
  const { data: courses } = useQuery<any[]>({ queryKey: ["/api/courses"] });
  const { data: feePackagesAll } = useQuery<any[]>({ queryKey: ["/api/fee-packages"] });
  const { data: studentsResp } = useQuery<{ students: StudentMinimal[]; total: number }>({
    queryKey: ["/api/students?minimal=true&limit=1000"],
  });
  const allStudents = studentsResp?.students ?? [];

  const [rows, setRows] = useState<InlineRow[]>(() => Array.from({ length: 1 }, newRow));
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const validations = useMemo(() => rows.map(validateRow), [rows]);
  const validCount = validations.filter(v => v.status === "valid").length;
  const invalidCount = validations.filter(v => v.status === "invalid").length;
  const distinctClassCount = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r, i) => { if (validations[i].status === "valid") set.add(r.classCode.trim()); });
    return set.size;
  }, [rows, validations]);

  const updateRow = useCallback((id: string, patch: Partial<InlineRow>) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const next = { ...r, ...patch };
      // If course changes, reset fee package
      if ("courseId" in patch && patch.courseId !== r.courseId) {
        next.feePackageId = null;
      }
      return next;
    }));
  }, []);

  const addRows = (n: number) => setRows(prev => [...prev, ...Array.from({ length: n }, newRow)]);
  const deleteRow = (id: string) => setRows(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);
  const duplicateRow = (id: string) => {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === id);
      if (idx === -1) return prev;
      const copy = { ...prev[idx], id: Math.random().toString(36).slice(2) };
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  };
  const clearAll = () => setRows(Array.from({ length: 1 }, newRow));

  const locationOptions = useMemo(
    () => (locations ?? []).map(l => ({ value: l.id, label: l.name })),
    [locations],
  );
  const shiftOptions = useMemo(
    () => (shiftTemplates ?? []).map(s => ({
      value: s.id,
      label: s.startTime && s.endTime ? `${s.name} (${s.startTime}-${s.endTime})` : s.name,
    })),
    [shiftTemplates],
  );
  const teacherOptions = useMemo(
    () => (staff ?? []).map(s => ({ value: s.id, label: s.fullName })),
    [staff],
  );
  const courseOptions = useMemo(
    () => (courses ?? []).map((c: any) => ({
      value: c.id,
      label: c.code ? `${c.code} - ${c.name}` : c.name,
    })),
    [courses],
  );
  const feePackagesByCourse = useMemo(() => {
    const map = new Map<string, { value: string; label: string }[]>();
    (feePackagesAll ?? []).forEach((p: any) => {
      const opt = {
        value: p.id,
        label: p.sessions ? `${p.name} (${Math.round(Number(p.sessions))} buổi)` : p.name,
      };
      const arr = map.get(p.courseId) ?? [];
      arr.push(opt);
      map.set(p.courseId, arr);
    });
    return map;
  }, [feePackagesAll]);

  const handleSubmit = async () => {
    const validRows = rows.filter((_, i) => validations[i].status === "valid");
    if (validRows.length === 0) {
      toast({ title: "Không có dòng hợp lệ", description: "Vui lòng nhập đầy đủ Mã lớp, Tên lớp, Cơ sở, Khoá học, Gói học phí.", variant: "destructive" });
      return;
    }
    if (distinctClassCount > MAX_CLASSES_PER_SUBMIT) {
      toast({
        title: "Vượt quá giới hạn",
        description: `Mỗi lần nhập trực tiếp chỉ được tạo tối đa ${MAX_CLASSES_PER_SUBMIT} lớp. Hiện đang có ${distinctClassCount} lớp.`,
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    setProgress(10);
    try {
      const parsed: ParsedClassRow[] = validRows.map(r => ({
        classCode: r.classCode.trim(),
        className: r.className.trim(),
        locationId: r.locationId!,
        maxStudents: r.maxStudents ?? undefined,
        learningFormat: r.learningFormat,
        onlineLink: r.learningFormat === "online" ? r.onlineLink.trim() : undefined,
        startDate: r.startDate ?? undefined,
        endDate: r.endDate ?? undefined,
        endSessions: r.endSessions ?? undefined,
        weekday: r.weekday ?? undefined,
        shiftId: r.shiftId ?? undefined,
        teacherIds: r.teacherIds,
        studentIds: r.studentIds,
        courseId: r.courseId ?? undefined,
        feePackageId: r.feePackageId ?? undefined,
      }));
      const groups = groupRowsByClassCode(parsed);
      const total = groups.size;
      setProgress(20);
      const result = await submitClassGroups(groups, (done) => {
        setProgress(20 + Math.round((done / total) * 80));
      });
      setProgress(100);
      if (result.failed > 0) {
        toast({
          title: "Tạo lớp hoàn tất",
          description: `Đã tạo ${result.success}/${result.total} lớp. ${result.failed} lớp lỗi: ${result.failedCodes.slice(0, 3).join(", ")}${result.failedCodes.length > 3 ? "..." : ""}`,
          variant: result.failed === result.total ? "destructive" : "default",
        });
      } else {
        toast({ title: "Thành công", description: `Đã tạo ${result.success} lớp học.` });
        clearAll();
        onSuccess?.();
      }
    } catch (e: any) {
      toast({ title: "Lỗi", description: e?.message ?? "Không thể tạo lớp.", variant: "destructive" });
    } finally {
      setSubmitting(false);
      setTimeout(() => setProgress(0), 800);
    }
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => addRows(1)} className="gap-1.5 h-8" data-testid="button-add-row">
          <Plus className="h-3.5 w-3.5" /> Thêm dòng
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addRows(10)} className="gap-1.5 h-8" data-testid="button-add-10-rows">
          <Plus className="h-3.5 w-3.5" /> Thêm 10 dòng
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={clearAll} className="gap-1.5 h-8 text-muted-foreground" data-testid="button-clear-all">
          <X className="h-3.5 w-3.5" /> Xoá tất cả
        </Button>

        <div className="ml-auto flex items-center gap-2 text-xs">
          {validCount > 0 && (
            <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> {validCount} dòng hợp lệ
              {distinctClassCount !== validCount && ` → ${distinctClassCount} lớp`}
            </Badge>
          )}
          {invalidCount > 0 && (
            <Badge variant="secondary" className="gap-1 bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-400">
              <AlertCircle className="h-3 w-3" /> {invalidCount} dòng lỗi
            </Badge>
          )}
        </div>
      </div>

      {/* Hint */}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Mỗi dòng = 1 chu kỳ học. Các dòng có cùng <span className="font-medium">Mã lớp</span> sẽ được gộp thành 1 lớp khi tạo.
        Ngày bắt đầu/kết thúc chỉ cần điền ở dòng đầu tiên của mỗi mã lớp.
        <span className="ml-1">Cột <span className="font-medium">Kết thúc (ngày)</span> và <span className="font-medium">Kết thúc sau (số buổi)</span> loại trừ lẫn nhau — chỉ nhập 1 trong 2.</span>
      </p>

      {/* Grid */}
      <div className="rounded-md border overflow-x-auto overflow-y-auto max-h-[70vh] min-w-0 w-full">
        <Table className="min-w-[2830px] w-[2830px] table-fixed">
          <TableHeader className="sticky top-0 bg-muted/50 backdrop-blur z-20">
            <TableRow>
              <TableHead className="w-10 text-center text-[11px] sticky left-0 bg-muted/95 backdrop-blur z-30">#</TableHead>
              <TableHead className="w-[120px] text-[11px] sticky left-10 bg-muted/95 backdrop-blur z-30 border-r">Mã lớp <span className="text-rose-500">*</span></TableHead>
              <TableHead className="w-[180px] text-[11px] sticky left-[160px] bg-muted/95 backdrop-blur z-30 border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">Tên lớp <span className="text-rose-500">*</span></TableHead>
              <TableHead className="w-[220px] text-[11px]">Cơ sở <span className="text-rose-500">*</span></TableHead>
              <TableHead className="w-[100px] text-[11px]">Số HV</TableHead>
              <TableHead className="w-[130px] text-[11px]">Hình thức</TableHead>
              <TableHead className="w-[220px] text-[11px]">Link online</TableHead>
              <TableHead className="w-[110px] text-[11px]">Chu kỳ</TableHead>
              <TableHead className="w-[220px] text-[11px]">Ca học</TableHead>
              <TableHead className="w-[160px] text-[11px]">Bắt đầu</TableHead>
              <TableHead className="w-[160px] text-[11px]">Kết thúc (ngày)</TableHead>
              <TableHead className="w-[140px] text-[11px]">Kết thúc sau (buổi)</TableHead>
              <TableHead className="w-[260px] text-[11px]">Giáo viên</TableHead>
              <TableHead className="w-[260px] text-[11px]">Học viên</TableHead>
              <TableHead className="w-[220px] text-[11px]">Khoá học <span className="text-rose-500">*</span></TableHead>
              <TableHead className="w-[220px] text-[11px]">Gói học phí <span className="text-rose-500">*</span></TableHead>
              <TableHead className="w-[90px] text-center text-[11px] sticky right-0 bg-muted/95 backdrop-blur z-30 border-l shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.08)]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, idx) => {
              const v = validations[idx];
              const rowBg = v.status === "invalid"
                ? "bg-rose-50 dark:bg-rose-950/30"
                : "bg-background";
              const isOnline = r.learningFormat === "online";
              const dateDisabled = r.endSessions != null;
              const sessionsDisabled = !!r.endDate;
              const feePkgOptions = r.courseId ? (feePackagesByCourse.get(r.courseId) ?? []) : [];
              return (
                <TableRow key={r.id} className={cn(
                  "hover-elevate",
                  v.status === "invalid" && "bg-rose-50/40 dark:bg-rose-950/10",
                )} data-testid={`row-inline-${idx}`}>
                  <TableCell className={cn("text-center text-xs text-muted-foreground py-1.5 sticky left-0 z-10", rowBg)}>
                    <RowStatusIndicator validation={v} index={idx + 1} />
                  </TableCell>
                  <TableCell className={cn("py-1 sticky left-10 z-10 border-r", rowBg)}>
                    <Input value={r.classCode} onChange={e => updateRow(r.id, { classCode: e.target.value })} className="h-8 text-xs" placeholder="A1" data-testid={`input-class-code-${idx}`} />
                  </TableCell>
                  <TableCell className={cn("py-1 sticky left-[160px] z-10 border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]", rowBg)}>
                    <Input value={r.className} onChange={e => updateRow(r.id, { className: e.target.value })} className="h-8 text-xs" placeholder="Lớp A1" data-testid={`input-class-name-${idx}`} />
                  </TableCell>
                  <TableCell className="py-1">
                    <ComboboxCell options={locationOptions} value={r.locationId} onChange={v => updateRow(r.id, { locationId: v })} placeholder="Chọn cơ sở" testId={`combo-location-${idx}`} />
                  </TableCell>
                  <TableCell className="py-1">
                    <Input type="number" min={0} value={r.maxStudents ?? ""} onChange={e => updateRow(r.id, { maxStudents: e.target.value === "" ? null : Number(e.target.value) })} className="h-8 text-xs" data-testid={`input-max-${idx}`} />
                  </TableCell>
                  <TableCell className="py-1">
                    <Select value={r.learningFormat} onValueChange={(val: any) => updateRow(r.id, { learningFormat: val, ...(val === "offline" ? { onlineLink: "" } : {}) })}>
                      <SelectTrigger className="h-8 text-xs" data-testid={`select-format-${idx}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="offline">Offline</SelectItem>
                        <SelectItem value="online">Online</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="py-1">
                    <Input
                      value={r.onlineLink}
                      onChange={e => updateRow(r.id, { onlineLink: e.target.value })}
                      className="h-8 text-xs"
                      placeholder={isOnline ? "https://meet.google.com/..." : "—"}
                      disabled={!isOnline}
                      data-testid={`input-online-link-${idx}`}
                    />
                  </TableCell>
                  <TableCell className="py-1">
                    <Select value={r.weekday?.toString() ?? "_none"} onValueChange={val => updateRow(r.id, { weekday: val === "_none" ? null : Number(val) })}>
                      <SelectTrigger className="h-8 text-xs" data-testid={`select-weekday-${idx}`}><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">—</SelectItem>
                        {WEEKDAYS.map(w => <SelectItem key={w.value} value={w.value.toString()}>{w.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="py-1">
                    <ComboboxCell options={shiftOptions} value={r.shiftId} onChange={v => updateRow(r.id, { shiftId: v })} placeholder="Chọn ca" testId={`combo-shift-${idx}`} />
                  </TableCell>
                  <TableCell className="py-1">
                    <DateCell value={r.startDate} onChange={v => updateRow(r.id, { startDate: v })} testId={`date-start-${idx}`} />
                  </TableCell>
                  <TableCell className="py-1">
                    <DateCell
                      value={r.endDate}
                      onChange={v => updateRow(r.id, { endDate: v })}
                      disabled={dateDisabled}
                      testId={`date-end-${idx}`}
                    />
                  </TableCell>
                  <TableCell className="py-1">
                    <Input
                      type="number"
                      min={1}
                      value={r.endSessions ?? ""}
                      onChange={e => updateRow(r.id, { endSessions: e.target.value === "" ? null : Number(e.target.value) })}
                      className="h-8 text-xs"
                      placeholder={sessionsDisabled ? "—" : "VD: 24"}
                      disabled={sessionsDisabled}
                      data-testid={`input-end-sessions-${idx}`}
                    />
                  </TableCell>
                  <TableCell className="py-1">
                    <SearchableMultiSelect
                      options={teacherOptions}
                      value={r.teacherIds}
                      onChange={ids => updateRow(r.id, { teacherIds: ids })}
                      placeholder="Chọn giáo viên..."
                      data-testid={`select-teachers-${idx}`}
                      className="h-8 text-xs"
                    />
                  </TableCell>
                  <TableCell className="py-1">
                    <StudentSelectCell
                      allStudents={allStudents}
                      locationId={r.locationId}
                      value={r.studentIds}
                      onChange={ids => updateRow(r.id, { studentIds: ids })}
                      testId={`select-students-${idx}`}
                    />
                  </TableCell>
                  <TableCell className="py-1">
                    <ComboboxCell options={courseOptions} value={r.courseId} onChange={v => updateRow(r.id, { courseId: v })} placeholder="Chọn khoá học" testId={`combo-course-${idx}`} />
                  </TableCell>
                  <TableCell className="py-1">
                    <ComboboxCell
                      options={feePkgOptions}
                      value={r.feePackageId}
                      onChange={v => updateRow(r.id, { feePackageId: v })}
                      placeholder={r.courseId ? "Chọn gói" : "Chọn khoá trước"}
                      disabled={!r.courseId}
                      testId={`combo-fee-package-${idx}`}
                    />
                  </TableCell>
                  <TableCell className={cn("py-1 text-center sticky right-0 z-10 border-l shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.08)]", rowBg)}>
                    <RowActions onDuplicate={() => duplicateRow(r.id)} onDelete={() => deleteRow(r.id)} testId={`actions-${idx}`} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Progress */}
      {(submitting || progress > 0) && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{submitting ? "Đang tạo lớp..." : progress === 100 ? "Hoàn tất" : ""}</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-end gap-3 pt-1">
        {distinctClassCount > MAX_CLASSES_PER_SUBMIT && (
          <span className="text-xs text-rose-600 dark:text-rose-400" data-testid="text-limit-warning">
            Tối đa {MAX_CLASSES_PER_SUBMIT} lớp/lần (đang có {distinctClassCount}).
          </span>
        )}
        <Button
          onClick={handleSubmit}
          disabled={submitting || validCount === 0 || distinctClassCount > MAX_CLASSES_PER_SUBMIT}
          className="gap-1.5"
          data-testid="button-submit-inline"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Tạo {distinctClassCount > 0 ? `${distinctClassCount} lớp` : "lớp"}
        </Button>
      </div>
    </div>
  );
}

function RowStatusIndicator({ validation, index }: { validation: RowValidation; index: number }) {
  if (validation.status === "empty") return <span className="text-muted-foreground/60">{index}</span>;
  if (validation.status === "valid") return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" title="Hợp lệ">
      <Check className="h-3 w-3" />
    </span>
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400 hover:bg-rose-200" title="Có lỗi">
          <AlertCircle className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-2 text-xs">
        <p className="font-medium mb-1">Lỗi cần sửa:</p>
        <ul className="space-y-0.5 text-muted-foreground list-disc list-inside">
          {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function ComboboxCell({
  options, value, onChange, placeholder, testId, disabled,
}: {
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder: string;
  testId?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button" variant="outline" role="combobox" disabled={disabled}
          className={cn("h-8 w-full justify-between text-xs px-2 font-normal", !selected && "text-muted-foreground")}
          data-testid={testId}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Tìm..." className="h-9" />
          <CommandList>
            <CommandEmpty>Không tìm thấy.</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem onSelect={() => { onChange(null); setOpen(false); }} className="text-muted-foreground">
                  <X className="mr-2 h-3 w-3" /> Bỏ chọn
                </CommandItem>
              )}
              {options.map(opt => (
                <CommandItem key={opt.value} value={opt.label} onSelect={() => { onChange(opt.value); setOpen(false); }}>
                  <Check className={cn("mr-2 h-3 w-3", value === opt.value ? "opacity-100" : "opacity-0")} />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function DateCell({ value, onChange, testId, disabled }: { value: string | null; onChange: (v: string | null) => void; testId?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(value + "T00:00:00") : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button" variant="outline" disabled={disabled}
          className={cn("h-8 w-full justify-start text-xs px-2 font-normal", !date && "text-muted-foreground")}
          data-testid={testId}
        >
          <CalendarIcon className="mr-1.5 h-3 w-3 shrink-0" />
          {date ? format(date, "dd/MM/yyyy") : "—"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            if (!d) { onChange(null); setOpen(false); return; }
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            onChange(`${y}-${m}-${day}`);
            setOpen(false);
          }}
          initialFocus
        />
        {value && (
          <div className="border-t p-1">
            <Button variant="ghost" size="sm" className="w-full h-7 text-xs text-muted-foreground" onClick={() => { onChange(null); setOpen(false); }}>
              <X className="mr-1 h-3 w-3" /> Xoá ngày
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function StudentSelectCell({
  allStudents, locationId, value, onChange, testId,
}: {
  allStudents: StudentMinimal[];
  locationId: string | null;
  value: string[];
  onChange: (ids: string[]) => void;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const available = useMemo(() => {
    if (!locationId) return [] as StudentMinimal[];
    return allStudents.filter(s =>
      !s.locations?.length || s.locations.some(l => l.locationId === locationId),
    );
  }, [allStudents, locationId]);

  const studentMap = useMemo(() => new Map(allStudents.map(s => [s.id, s])), [allStudents]);
  const selectedStudents = value.map(id => studentMap.get(id)).filter(Boolean) as StudentMinimal[];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return available;
    return available.filter(s => s.fullName.toLowerCase().includes(q));
  }, [available, search]);

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter(v => v !== id));
    else onChange([...value, id]);
  };

  const previewLimit = 2;
  const preview = selectedStudents.slice(0, previewLimit);
  const overflow = selectedStudents.length - preview.length;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={!locationId}
          className={cn(
            "h-8 w-full justify-between text-xs px-2 font-normal gap-1",
            value.length === 0 && "text-muted-foreground",
          )}
          data-testid={testId}
        >
          {value.length === 0 ? (
            <span className="truncate">{locationId ? "Chọn học viên..." : "Chọn cơ sở trước"}</span>
          ) : (
            <span className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
              {preview.map(s => (
                <Badge key={s.id} variant="secondary" className="text-[10px] px-1.5 py-0 h-5 max-w-[90px] truncate font-normal">
                  {s.fullName}
                </Badge>
              ))}
              {overflow > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 font-medium bg-primary/10 text-primary border-primary/20">
                  +{overflow}
                </Badge>
              )}
            </span>
          )}
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <div className="p-2 border-b space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">Chọn học viên</span>
            <span className="text-muted-foreground">
              Đã chọn <span className="font-semibold text-foreground">{value.length}</span>/{available.length}
            </span>
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên học viên..."
            className="h-8 text-xs"
            data-testid={`${testId}-search`}
          />
          {value.length > 0 && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                Bấm để chọn / bỏ chọn học viên
              </span>
              <Button
                type="button" variant="ghost" size="sm"
                className="h-6 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                onClick={() => onChange([])}
              >
                <X className="h-3 w-3 mr-0.5" /> Bỏ tất cả
              </Button>
            </div>
          )}
        </div>
        <div className="max-h-[280px] overflow-y-auto py-1">
          {!locationId ? (
            <p className="text-xs text-muted-foreground text-center py-6">Chọn cơ sở trước để xem học viên.</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              {available.length === 0 ? "Chưa có học viên ở cơ sở này." : "Không khớp."}
            </p>
          ) : (
            filtered.map(s => {
              const checked = value.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover-elevate",
                    checked && "bg-primary/5",
                  )}
                  data-testid={`${testId}-option-${s.id}`}
                >
                  <span className={cn(
                    "inline-flex items-center justify-center w-4 h-4 rounded border shrink-0",
                    checked ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30",
                  )}>
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <span className="truncate flex-1">{s.fullName}</span>
                  {s.type && (
                    <span className="text-[10px] text-muted-foreground shrink-0">{s.type}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RowActions({ onDuplicate, onDelete, testId }: { onDuplicate: () => void; onDelete: () => void; testId?: string }) {
  return (
    <div className="flex items-center justify-center gap-0.5" data-testid={testId}>
      <Button type="button" variant="ghost" size="icon" onClick={onDuplicate} className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Nhân đôi dòng">
        <Copy className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" onClick={onDelete} className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Xoá dòng">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
