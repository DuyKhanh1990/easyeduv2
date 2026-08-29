import { useState, useEffect } from "react";
import { z } from "zod";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShiftSelectWithCreate } from "@/components/ui/shift-select-with-create";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertClassSchema } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useQuery } from "@tanstack/react-query";
import { STATIC_STALE_TIME, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useClassMutations } from "@/hooks/use-class-mutations";
import { ConflictWarningDialog } from "@/components/education/ConflictWarningDialog";
import { ConflictDetailSheet } from "@/components/education/ConflictDetailSheet";
import { ChevronRight, ChevronLeft, Check, Loader2, Plus, X, User, AlertTriangle, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";

const COPY_STEPS = [
  { id: 1, name: "Thông tin cơ bản" },
  { id: 2, name: "Lịch học" },
];

const WEEKDAYS = [
  { value: 1, label: "T2" },
  { value: 2, label: "T3" },
  { value: 3, label: "T4" },
  { value: 4, label: "T5" },
  { value: 5, label: "T6" },
  { value: 6, label: "T7" },
  { value: 0, label: "CN" },
];

const CLASS_PALETTE = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#64748b",
  "#0ea5e9", "#10b981", "#f59e0b", "#a855f7", "#06b6d4",
];

interface CopyClassDialogProps {
  open: boolean;
  onClose: () => void;
  sourceClass: any; // full class object from GET /api/classes/:id
}

export function CopyClassDialog({ open, onClose, sourceClass }: CopyClassDialogProps) {
  const [step, setStep] = useState(1);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [endType, setEndType] = useState<"date" | "sessions">(sourceClass?.endType ?? "date");
  const [sessionCount, setSessionCount] = useState<string>(String(sourceClass?.sessionCount ?? 10));
  const [selectedColor, setSelectedColor] = useState<string>(sourceClass?.color ?? CLASS_PALETTE[5]);
  const [skipHolidays, setSkipHolidays] = useState<boolean>(sourceClass?.skipHolidays ?? false);
  const [liveConflicts, setLiveConflicts] = useState<any[]>([]);
  const [isLiveChecking, setIsLiveChecking] = useState(false);
  const [conflictDetail, setConflictDetail] = useState<{ conflicts: any[]; title: string } | null>(null);
  const [step2Conflicts, setStep2Conflicts] = useState<any[]>([]);
  const [isCheckingStep2, setIsCheckingStep2] = useState(false);
  const [previewConflicts, setPreviewConflicts] = useState<any[]>([]);
  const [pendingSubmitData, setPendingSubmitData] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);

  const { createClassMutation } = useClassMutations();

  // Build schedule_config: API returns camelCase (scheduleConfig), not snake_case.
  // Fall back to per-weekday reconstruction from legacy shiftTemplates array.
  const buildScheduleConfig = (src: any) => {
    // New format: stored as scheduleConfig (camelCase from Drizzle)
    const stored = src?.scheduleConfig ?? src?.schedule_config;
    if (Array.isArray(stored) && stored.length > 0) return stored;
    // Legacy fallback: one shift per weekday from shiftTemplates array
    const dummyUUID = "00000000-0000-0000-0000-000000000000";
    const shifts: any[] = Array.isArray(src?.shiftTemplates) ? src.shiftTemplates : [];
    if (shifts.length > 0 && Array.isArray(src?.weekdays) && src.weekdays.length > 0) {
      // If only one shift → same shift for all days
      if (shifts.length === 1) {
        return src.weekdays.map((day: number) => ({
          weekday: day,
          shifts: [{ shift_template_id: shifts[0].id, room_id: "" }],
        }));
      }
      // Multiple shifts → assign by weekday index order (best-effort)
      return src.weekdays.map((day: number, i: number) => ({
        weekday: day,
        shifts: [{ shift_template_id: (shifts[i] ?? shifts[0]).id, room_id: "" }],
      }));
    }
    // Last resort: non-dummy shiftTemplateId
    const legacyId = src?.shiftTemplateId !== dummyUUID ? src?.shiftTemplateId : null;
    if (legacyId && Array.isArray(src?.weekdays) && src.weekdays.length > 0) {
      return src.weekdays.map((day: number) => ({
        weekday: day,
        shifts: [{ shift_template_id: legacyId, room_id: "" }],
      }));
    }
    return [];
  };

  // Build teachers_config: API returns camelCase (teachersConfig).
  const buildTeachersConfig = (src: any) => {
    const stored = src?.teachersConfig ?? src?.teachers_config;
    if (Array.isArray(stored) && stored.length > 0) return stored;
    // Legacy: teachers array [{ id, fullName }]
    if (Array.isArray(src?.teachers) && src.teachers.length > 0) {
      return src.teachers.map((t: any) => ({
        teacher_id: t.id,
        mode: "all",
        shift_keys: [],
      }));
    }
    return [];
  };

  // Build pre-fill default values from source class
  const buildDefaultValues = () => ({
    classCode: `COPY-${Date.now().toString().slice(-6)}`,
    name: sourceClass?.name ?? "",
    locationId: sourceClass?.locationId ?? "",
    programId: sourceClass?.programId ?? "",
    courseId: sourceClass?.courseId ?? "",
    managerIds: (sourceClass?.managers ?? []).map((m: any) => m.id),
    feePackageId: sourceClass?.feePackageId ?? "",
    scoreSheetId: sourceClass?.scoreSheetId ?? "",
    maxStudents: sourceClass?.maxStudents ?? 20,
    learningFormat: sourceClass?.learningFormat ?? "offline",
    onlineLink: sourceClass?.onlineLink ?? "",
    description: sourceClass?.description ?? "",
    status: "planning",
    subjectId: sourceClass?.subjectId ?? "",
    evaluationCriteriaIds: sourceClass?.evaluationCriteriaIds ?? [],
    weekdays: sourceClass?.weekdays ?? [],
    startDate: sourceClass?.startDate ?? "",
    endDate: sourceClass?.endDate ?? "",
    schedule_config: buildScheduleConfig(sourceClass),
    teachers_config: buildTeachersConfig(sourceClass),
    teacherId: "00000000-0000-0000-0000-000000000000",
    shiftTemplateId: "00000000-0000-0000-0000-000000000000",
  });

  const form = useForm({
    resolver: zodResolver(insertClassSchema.extend({
      startDate: z.string().min(1, "Ngày bắt đầu là bắt buộc"),
      endDate: z.string().optional(),
      programId: z.string().optional().nullable(),
      courseId: z.string().optional().nullable(),
      feePackageId: z.string().optional().nullable(),
      scoreSheetId: z.string().optional().nullable(),
      subjectId: z.string().optional().nullable(),
      evaluationCriteriaIds: z.array(z.string()).optional(),
      schedule_config: z.array(z.object({
        weekday: z.number(),
        shifts: z.array(z.object({
          shift_template_id: z.string().min(1, "Vui lòng chọn ca học"),
          room_id: z.string().optional(),
        })).min(1, "Vui lòng thêm ít nhất một ca học"),
      })).min(1, "Lịch học là bắt buộc"),
      teachers_config: z.array(z.object({
        teacher_id: z.string().min(1, "Vui lòng chọn giáo viên"),
        mode: z.enum(["all", "specific"]),
        shift_keys: z.array(z.string()),
      })).min(1, "Giáo viên là bắt buộc"),
    })),
    defaultValues: buildDefaultValues(),
  });

  // Reset form when dialog opens with new source data
  useEffect(() => {
    if (open && sourceClass) {
      form.reset(buildDefaultValues());
      setStep(1);
      setEndType(sourceClass.endType ?? "date");
      setSessionCount(String(sourceClass.sessionCount ?? 10));
      setSelectedColor(sourceClass.color ?? CLASS_PALETTE[5]);
      setSkipHolidays(sourceClass.skipHolidays ?? false);
      setLiveConflicts([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceClass?.id]);

  const { data: locations } = useQuery({ queryKey: ["/api/locations"], staleTime: STATIC_STALE_TIME });
  const { data: programs } = useQuery({ queryKey: ["/api/course-programs"], staleTime: STATIC_STALE_TIME });
  const { data: courses } = useQuery({ queryKey: ["/api/courses"], staleTime: STATIC_STALE_TIME });
  const { data: subjects } = useQuery<any[]>({ queryKey: ["/api/subjects"], staleTime: STATIC_STALE_TIME });
  const { data: evaluationCriteriaList } = useQuery<any[]>({ queryKey: ["/api/evaluation-criteria"], staleTime: STATIC_STALE_TIME });

  const selectedLocationId = form.watch("locationId");
  const selectedCourseId = form.watch("courseId");
  const selectedLearningFormat = form.watch("learningFormat");

  const { data: staff } = useQuery<any[]>({
    queryKey: [selectedLocationId ? `/api/staff?locationId=${selectedLocationId}&minimal=true` : "/api/staff?minimal=true"],
    enabled: !!selectedLocationId,
  });
  const { data: shifts } = useQuery<any[]>({
    queryKey: ["/api/shift-templates?type=class"],
    enabled: !!selectedLocationId,
  });
  const { data: classrooms } = useQuery<any[]>({
    queryKey: ["/api/classrooms"],
    enabled: !!selectedLocationId,
  });
  const { data: feePackages } = useQuery<any[]>({
    queryKey: [selectedCourseId ? `/api/courses/${selectedCourseId}/fee-packages` : null],
    enabled: !!selectedCourseId,
  });
  const { data: scoreSheets } = useQuery<any[]>({ queryKey: ["/api/score-sheets"] });
  const { data: holidays } = useQuery<any[]>({ queryKey: ["/api/public-holidays"], staleTime: STATIC_STALE_TIME });

  const { fields: _scheduleFields, append: _appendSchedule, remove: _removeSchedule } = useFieldArray({
    control: form.control,
    name: "schedule_config",
  });
  const { fields: _teacherFields, append: appendTeacher, remove: removeTeacher } = useFieldArray({
    control: form.control,
    name: "teachers_config",
  });

  const selectedWeekdays = form.watch("weekdays") || [];
  const scheduleConfig = form.watch("schedule_config") || [];
  const teachersConfig = form.watch("teachers_config") || [];
  const watchedStartDate = form.watch("startDate");
  const watchedEndDate = form.watch("endDate");

  const filteredShifts = Array.isArray(shifts) ? shifts.filter(s => String(s.locationId) === String(selectedLocationId)) : [];
  const filteredClassrooms = Array.isArray(classrooms) ? classrooms.filter(r => String(r.locationId) === String(selectedLocationId)) : [];

  // Sync schedule_config when weekdays change.
  // Exact-match guard: if config already has exactly the same weekday set → skip (preserves
  // pre-filled shift/room data). Otherwise sync: add slots for new days, drop removed days.
  useEffect(() => {
    const currentConfig = form.getValues("schedule_config") || [];
    const exactMatch =
      currentConfig.length === selectedWeekdays.length &&
      selectedWeekdays.every((day: number) => currentConfig.some((c: any) => c.weekday === day));
    if (exactMatch) return;
    const newConfig = selectedWeekdays.map((day: number) => {
      const existing = currentConfig.find((c: any) => c.weekday === day);
      if (existing) return existing;
      return { weekday: day, shifts: [{ shift_template_id: "", room_id: "" }] };
    });
    form.setValue("schedule_config", newConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeekdays, form]);

  // Live conflict check (debounced)
  useEffect(() => {
    if (!watchedStartDate || !selectedWeekdays.length) { setLiveConflicts([]); return; }
    const hasShift = scheduleConfig.some((d: any) => d.shifts?.some((s: any) => s.shift_template_id));
    if (!hasShift) { setLiveConflicts([]); return; }
    if (endType === "date" && !watchedEndDate) { setLiveConflicts([]); return; }
    if (endType === "sessions" && (!sessionCount || Number(sessionCount) < 1)) { setLiveConflicts([]); return; }
    const timer = setTimeout(async () => {
      setIsLiveChecking(true);
      try {
        const res = await apiRequest("POST", "/api/classes/preview-conflicts", {
          startDate: watchedStartDate,
          endDate: watchedEndDate,
          endType,
          sessionCount: endType === "sessions" ? Number(sessionCount) : undefined,
          schedule_config: scheduleConfig,
          teachers_config: teachersConfig,
          skipHolidays,
        });
        const { conflicts } = await res.json();
        setLiveConflicts(conflicts || []);
      } catch { setLiveConflicts([]); }
      finally { setIsLiveChecking(false); }
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(scheduleConfig), JSON.stringify(teachersConfig), watchedStartDate, watchedEndDate, endType, sessionCount, skipHolidays]);

  const getAllShiftsList = () => {
    const list: { key: string; label: string }[] = [];
    scheduleConfig.forEach((day: any) => {
      const dayLabel = WEEKDAYS.find(w => w.value === day.weekday)?.label;
      day.shifts.forEach((s: any, idx: number) => {
        const shiftName = shifts?.find((st: any) => st.id === s.shift_template_id)?.name || `Ca ${idx + 1}`;
        list.push({ key: `${day.weekday}_shift${idx}`, label: `${dayLabel}-${shiftName}` });
      });
    });
    return list;
  };

  const nextStep = async () => {
    if (step === 1) {
      const fields = ["name", "locationId", "courseId", "managerIds", "feePackageId", "maxStudents", "learningFormat"];
      const fieldsToValidate: any[] = [...fields];
      if (selectedLearningFormat === "online") fieldsToValidate.push("onlineLink");
      const isValid = await form.trigger(fieldsToValidate);
      if (!isValid) {
        return toast({ title: "Thiếu thông tin", description: "Vui lòng điền đầy đủ các trường bắt buộc", variant: "destructive" });
      }
      const classCode = (form.getValues("classCode") || "").trim();
      if (classCode) {
        try {
          const res = await fetch(`/api/classes/check-code?code=${encodeURIComponent(classCode)}`);
          const data = await res.json();
          if (data.exists) {
            form.setError("classCode", { message: "Mã lớp học này đã tồn tại, vui lòng chọn mã khác" });
            return toast({ title: "Mã lớp bị trùng", description: `"${classCode}" đã được sử dụng. Vui lòng nhập mã khác.`, variant: "destructive" });
          }
        } catch { /* allow proceeding */ }
      }
      if (!form.getValues("startDate")) {
        const today = new Date().toISOString().split("T")[0];
        form.setValue("startDate", today);
      }
    }
    setStep(s => s + 1);
  };

  const prevStep = () => setStep(s => s - 1);

  const doCreateAndCopy = async (submitData: any) => {
    setIsCreating(true);
    try {
      // 1. Create the new class
      const newClass: any = await new Promise((resolve, reject) => {
        createClassMutation.mutate(submitData, {
          onSuccess: (data: any) => resolve(data),
          onError: (err: any) => reject(err),
        });
      });

      // 2. Fetch active students from source class
      let studentIds: string[] = [];
      try {
        const studentsRes = await apiRequest("GET", `/api/classes/${sourceClass.id}/active-students`);
        const students: any[] = await studentsRes.json();
        studentIds = (students || []).map((s: any) => s.studentId).filter(Boolean);
      } catch {
        // If fetching students fails, still navigate to new class
      }

      // 3. Bulk-add active students to waiting list of new class
      if (studentIds.length > 0) {
        try {
          await apiRequest("POST", `/api/classes/${newClass.id}/add-students`, {
            studentIds,
            status: "waiting",
          });
        } catch {
          toast({
            title: "Lưu ý",
            description: "Tạo lớp thành công nhưng chưa sao chép được danh sách học viên. Vui lòng thêm lại thủ công.",
            variant: "destructive",
          });
        }
      }

      // 4. Navigate to new class waiting tab
      toast({
        title: "Sao chép lớp thành công",
        description: studentIds.length > 0
          ? `Đã tạo lớp mới và sao chép ${studentIds.length} học viên vào danh sách chờ.`
          : "Đã tạo lớp mới. Chưa có học viên chính thức để sao chép.",
      });
      onClose();
      setLocation(`/classes/${newClass.id}?tab=waiting`);
    } catch {
      toast({ title: "Tạo lớp thất bại", description: "Vui lòng thử lại.", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleFinish = async () => {
    const fieldsToValidate: any[] = ["weekdays", "startDate", "schedule_config", "teachers_config"];
    if (endType === "date") fieldsToValidate.push("endDate");
    const isValid = await form.trigger(fieldsToValidate);
    if (endType === "sessions" && (!sessionCount || Number(sessionCount) < 1)) {
      return toast({ title: "Thiếu thông tin", description: "Vui lòng nhập số buổi học hợp lệ", variant: "destructive" });
    }
    if (!isValid) {
      return toast({ title: "Thiếu thông tin", description: "Vui lòng hoàn tất cấu hình lịch học và giáo viên", variant: "destructive" });
    }

    // Check conflicts before creating
    setIsCheckingStep2(true);
    let finalConflicts: any[] = [];
    try {
      const values = form.getValues();
      const res = await apiRequest("POST", "/api/classes/preview-conflicts", {
        startDate: values.startDate,
        endDate: values.endDate,
        endType,
        sessionCount: endType === "sessions" ? Number(sessionCount) : undefined,
        schedule_config: values.schedule_config,
        teachers_config: values.teachers_config,
        skipHolidays,
      });
      const { conflicts } = await res.json();
      finalConflicts = conflicts || [];
    } catch { /* allow proceeding */ }
    finally { setIsCheckingStep2(false); }

    const valOrNull = (val: string | undefined | null) => (val && val.trim() !== "" ? val : null);
    const data = form.getValues();
    const submitData = {
      ...data,
      weekdays: data.weekdays.map(Number),
      managerIds: data.managerIds || [],
      teacherIds: [...new Set((data.teachers_config || []).map((t: any) => t.teacher_id))],
      shiftTemplateId: data.schedule_config[0]?.shifts[0]?.shift_template_id || "00000000-0000-0000-0000-000000000000",
      endType,
      sessionCount: endType === "sessions" ? Number(sessionCount) : undefined,
      color: selectedColor,
      skipHolidays,
      programId: valOrNull(data.programId),
      courseId: valOrNull(data.courseId),
      feePackageId: valOrNull(data.feePackageId),
      scoreSheetId: valOrNull(data.scoreSheetId),
      subjectId: valOrNull(data.subjectId),
      evaluationCriteriaIds: data.evaluationCriteriaIds?.length > 0 ? data.evaluationCriteriaIds : null,
    };

    if (finalConflicts.length > 0) {
      setPreviewConflicts(finalConflicts);
      setPendingSubmitData(submitData);
      return;
    }
    doCreateAndCopy(submitData);
  };

  return (
    <>
      <ConflictDetailSheet
        open={!!conflictDetail}
        conflicts={conflictDetail?.conflicts || []}
        title={conflictDetail?.title}
        onClose={() => setConflictDetail(null)}
      />
      <ConflictWarningDialog
        conflicts={previewConflicts}
        mode="confirm"
        confirmLabel="Vẫn tạo lớp"
        onConfirm={() => {
          if (pendingSubmitData) doCreateAndCopy(pendingSubmitData);
          setPendingSubmitData(null);
          setPreviewConflicts([]);
        }}
        onClose={() => { setPreviewConflicts([]); setPendingSubmitData(null); }}
      />
      <ConflictWarningDialog
        conflicts={step2Conflicts}
        mode="confirm"
        confirmLabel="Vẫn tiếp tục"
        onConfirm={() => { setStep2Conflicts([]); setStep(s => s + 1); }}
        onClose={() => setStep2Conflicts([])}
      />

      <Dialog open={open} onOpenChange={(v) => { if (!v && !isCreating) onClose(); }}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Copy className="h-5 w-5 text-primary" />
              Sao chép lớp: <span className="font-bold text-primary">{sourceClass?.name}</span>
            </DialogTitle>
          </DialogHeader>

          {/* Progress indicator */}
          <div className="flex items-center gap-0 relative mb-2">
            {COPY_STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all",
                    step >= s.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}>
                    {step > s.id ? <Check className="h-4 w-4" /> : s.id}
                  </div>
                  <span className={cn("text-xs font-medium", step === s.id ? "text-primary" : "text-muted-foreground")}>
                    {s.name}
                  </span>
                </div>
                {i < COPY_STEPS.length - 1 && (
                  <div className="h-0.5 flex-1 mx-2 mb-4" style={{ background: step > s.id ? "hsl(var(--primary))" : "hsl(var(--muted))" }} />
                )}
              </div>
            ))}
          </div>

          <Form {...form}>
            <form className="space-y-4">
              <Card className="border-border shadow-sm">
                <CardContent className="pt-5">
                  {/* ── STEP 1: Basic Info ── */}
                  {step === 1 && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-3 gap-5">
                        <FormField control={form.control} name="locationId" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cơ sở <span className="text-destructive">*</span></FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl><SelectTrigger><SelectValue placeholder="Chọn cơ sở" /></SelectTrigger></FormControl>
                              <SelectContent>{locations?.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="classCode" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mã lớp học <span className="text-destructive">*</span></FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="name" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tên lớp <span className="text-destructive">*</span></FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="courseId" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Khóa học <span className="text-destructive">*</span></FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl><SelectTrigger><SelectValue placeholder="Chọn khóa học" /></SelectTrigger></FormControl>
                              <SelectContent>{courses?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="feePackageId" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Gói học phí {selectedCourseId ? <span className="text-destructive">*</span> : ""}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={!selectedCourseId}>
                              <FormControl><SelectTrigger><SelectValue placeholder={selectedCourseId ? "Chọn gói học phí" : "Chọn khóa học trước"} /></SelectTrigger></FormControl>
                              <SelectContent>{feePackages?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="managerIds" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Quản lý lớp <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                              <SearchableMultiSelect
                                options={(staff || []).map((s: any) => ({ value: s.id, label: s.fullName, sublabel: s.code, isActive: s.status !== "Không hoạt động" }))}
                                value={field.value || []}
                                onChange={field.onChange}
                                placeholder={selectedLocationId ? "Chọn nhân sự" : "Chọn cơ sở trước"}
                                searchPlaceholder="Tìm kiếm nhân sự..."
                                disabled={!selectedLocationId}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="maxStudents" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Số học viên tối đa <span className="text-destructive">*</span></FormLabel>
                            <FormControl><Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value))} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="learningFormat" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Hình thức học <span className="text-destructive">*</span></FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="offline">Offline</SelectItem>
                                <SelectItem value="online">Online</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        {selectedLearningFormat === "online" && (
                          <FormField control={form.control} name="onlineLink" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Đường link <span className="text-destructive">*</span></FormLabel>
                              <FormControl><Input placeholder="https://meet.google.com/..." {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                        )}
                      </div>

                      {/* Thông tin bổ sung */}
                      <div className="border-t pt-5">
                        <p className="text-sm font-medium text-muted-foreground mb-4">Thông tin bổ sung</p>
                        <div className="grid grid-cols-3 gap-5">
                          <FormField control={form.control} name="programId" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Chương trình</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Chọn chương trình" /></SelectTrigger></FormControl>
                                <SelectContent>{programs?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="scoreSheetId" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Bảng điểm</FormLabel>
                              <Select onValueChange={(val) => field.onChange(val === "none" ? "" : val)} value={field.value || "none"}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Chọn bảng điểm (tuỳ chọn)" /></SelectTrigger></FormControl>
                                <SelectContent>
                                  <SelectItem value="none">— Không chọn —</SelectItem>
                                  {scoreSheets?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="subjectId" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Bộ môn</FormLabel>
                              <Select onValueChange={(val) => field.onChange(val === "none" ? "" : val)} value={field.value || "none"}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Chọn bộ môn (tuỳ chọn)" /></SelectTrigger></FormControl>
                                <SelectContent>
                                  <SelectItem value="none">— Không chọn —</SelectItem>
                                  {subjects?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="evaluationCriteriaIds" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Tiêu chí đánh giá</FormLabel>
                              <FormControl>
                                <SearchableMultiSelect
                                  options={(evaluationCriteriaList || []).map((c: any) => ({ value: c.id, label: c.name }))}
                                  value={field.value || []}
                                  onChange={field.onChange}
                                  placeholder="Chọn tiêu chí (tuỳ chọn)"
                                  searchPlaceholder="Tìm kiếm tiêu chí..."
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="description" render={({ field }) => (
                            <FormItem className="col-span-2">
                              <FormLabel>Mô tả</FormLabel>
                              <FormControl><Textarea className="resize-none" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                        </div>
                      </div>

                      {/* Color picker */}
                      <div className="border-t pt-5">
                        <p className="text-sm font-medium text-muted-foreground mb-3">Màu hiển thị lịch</p>
                        <div className="flex flex-wrap gap-2">
                          {CLASS_PALETTE.map(color => (
                            <button key={color} type="button" onClick={() => setSelectedColor(color)}
                              className="w-7 h-7 rounded-full border-2 transition-all"
                              style={{
                                backgroundColor: color,
                                borderColor: selectedColor === color ? "#1e293b" : "transparent",
                                transform: selectedColor === color ? "scale(1.2)" : "scale(1)",
                                boxShadow: selectedColor === color ? "0 0 0 2px white, 0 0 0 4px #1e293b" : "none",
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── STEP 2: Schedule ── */}
                  {step === 2 && (
                    <div className="space-y-6">
                      {/* Time range */}
                      <div className="pb-5 border-b">
                        <div className="grid grid-cols-3 gap-5">
                          <FormField control={form.control} name="startDate" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Ngày bắt đầu <span className="text-destructive">*</span></FormLabel>
                              <FormControl><Input type="date" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <div className="space-y-2">
                            <Label>Loại kết thúc</Label>
                            <Select value={endType} onValueChange={(v) => setEndType(v as "date" | "sessions")}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="date">Kết thúc vào ngày</SelectItem>
                                <SelectItem value="sessions">Kết thúc sau số buổi</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {endType === "date" ? (
                            <FormField control={form.control} name="endDate" render={({ field }) => (
                              <FormItem>
                                <FormLabel>Ngày kết thúc <span className="text-destructive">*</span></FormLabel>
                                <FormControl><Input type="date" {...field} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                          ) : (
                            <div className="space-y-2">
                              <Label>Kết thúc sau (số buổi) <span className="text-destructive">*</span></Label>
                              <Input type="number" min={1} max={500} value={sessionCount} onChange={e => setSessionCount(e.target.value)} />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Skip holidays */}
                      {(() => {
                        const relevantHolidays = (holidays || []).filter((h: any) => !watchedStartDate || h.endDate >= watchedStartDate);
                        if (relevantHolidays.length === 0) return null;
                        return (
                          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                            <Checkbox id="skip-holidays-copy" checked={skipHolidays} onCheckedChange={(v) => setSkipHolidays(!!v)} className="mt-0.5" />
                            <div className="space-y-1.5 flex-1">
                              <Label htmlFor="skip-holidays-copy" className="text-sm font-semibold cursor-pointer text-amber-800">
                                Bỏ qua ngày nghỉ lễ ({relevantHolidays.length} kỳ nghỉ)
                              </Label>
                              {skipHolidays && (
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {relevantHolidays.map((h: any) => (
                                    <Badge key={h.id} variant="outline" className="text-xs text-amber-700 border-amber-300 bg-white">
                                      {h.name}: {h.startDate} → {h.endDate}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Weekday selection */}
                      <div className="space-y-3">
                        <Label className="text-sm font-semibold">PHẦN 1: CHỌN CHU KỲ THỨ</Label>
                        <div className="flex flex-wrap gap-5 p-4 bg-muted/30 rounded-lg border">
                          {WEEKDAYS.map((day) => (
                            <div key={day.value} className="flex items-center gap-2">
                              <Checkbox
                                id={`copy-day-${day.value}`}
                                checked={selectedWeekdays.includes(day.value)}
                                onCheckedChange={(checked) => {
                                  const current = form.getValues("weekdays") || [];
                                  if (checked) {
                                    form.setValue("weekdays", [...current, day.value]);
                                  } else {
                                    form.setValue("weekdays", current.filter((v: number) => v !== day.value));
                                  }
                                  form.trigger("weekdays");
                                }}
                              />
                              <Label htmlFor={`copy-day-${day.value}`} className="cursor-pointer font-medium">{day.label}</Label>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Schedule + Teachers side by side */}
                      <div className="grid grid-cols-2 gap-5 items-start">
                        {/* Schedule config */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm font-semibold">PHẦN 2: CẤU HÌNH CA THEO THỨ</Label>
                            {isLiveChecking && (
                              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" /> Đang kiểm tra...
                              </span>
                            )}
                          </div>
                          {!isLiveChecking && liveConflicts.length > 0 && (
                            <button type="button"
                              onClick={() => setConflictDetail({ conflicts: liveConflicts, title: `${liveConflicts.length} buổi trùng lịch` })}
                              className="w-full flex items-start gap-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-md px-3 py-2 hover:bg-orange-100 transition-colors text-left"
                            >
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                              <span>Phát hiện trùng lịch — <span className="underline">Nhấn để xem →</span></span>
                            </button>
                          )}
                          {selectedWeekdays.length > 0 ? (
                            <div className="border rounded-lg overflow-hidden">
                              <div className="grid grid-cols-12 bg-muted/50 p-3 text-xs font-semibold border-b">
                                <div className="col-span-2">Thứ</div>
                                <div className="col-span-4">Ca học</div>
                                <div className="col-span-4">Phòng học</div>
                                <div className="col-span-2 text-center">+/-</div>
                              </div>
                              <div className="divide-y">
                                {scheduleConfig.map((dayConfig: any, dayIdx: number) => (
                                  <div key={dayConfig.weekday} className="contents">
                                    {dayConfig.shifts.map((shift: any, shiftIdx: number) => (
                                      <div key={shiftIdx} className="grid grid-cols-12 p-2.5 items-center gap-2 hover:bg-accent/5 transition-colors">
                                        <div className="col-span-2 font-bold text-primary text-sm">
                                          {shiftIdx === 0 ? WEEKDAYS.find(w => w.value === dayConfig.weekday)?.label : ""}
                                        </div>
                                        <div className="col-span-4">
                                          <ShiftSelectWithCreate
                                            value={shift.shift_template_id}
                                            onValueChange={(val) => {
                                              const newConfig = [...scheduleConfig];
                                              newConfig[dayIdx].shifts[shiftIdx].shift_template_id = val;
                                              form.setValue("schedule_config", newConfig);
                                            }}
                                            locationId={selectedLocationId}
                                            placeholder="Chọn ca"
                                            triggerClassName="h-8 text-xs"
                                          />
                                        </div>
                                        <div className="col-span-4">
                                          <Select
                                            value={shift.room_id}
                                            onValueChange={(val) => {
                                              const newConfig = [...scheduleConfig];
                                              newConfig[dayIdx].shifts[shiftIdx].room_id = val;
                                              form.setValue("schedule_config", newConfig);
                                            }}
                                          >
                                            <SelectTrigger className="h-8 text-xs">
                                              <SelectValue placeholder="Chọn phòng" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {filteredClassrooms?.map((r: any) => (
                                                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        <div className="col-span-2 flex justify-center">
                                          {shiftIdx === 0 ? (
                                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10"
                                              onClick={() => {
                                                const newConfig = [...scheduleConfig];
                                                newConfig[dayIdx].shifts.push({ shift_template_id: "", room_id: "" });
                                                form.setValue("schedule_config", newConfig);
                                              }}>
                                              <Plus className="h-3.5 w-3.5" />
                                            </Button>
                                          ) : (
                                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                              onClick={() => {
                                                const newConfig = [...scheduleConfig];
                                                newConfig[dayIdx].shifts.splice(shiftIdx, 1);
                                                form.setValue("schedule_config", newConfig);
                                              }}>
                                              <X className="h-3.5 w-3.5" />
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-6 border-2 border-dashed rounded-lg bg-muted/5">
                              <p className="text-sm text-muted-foreground">Vui lòng chọn thứ ở phần 1 trước.</p>
                            </div>
                          )}
                        </div>

                        {/* Teacher config */}
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm font-semibold">PHẦN 3: CHỌN GIÁO VIÊN</Label>
                            <Select onValueChange={(val) => {
                              if (!teachersConfig.some((t: any) => t.teacher_id === val)) {
                                appendTeacher({ teacher_id: val, mode: "all", shift_keys: [] });
                              }
                            }}>
                              <SelectTrigger className="w-[180px] h-8 text-xs">
                                <SelectValue placeholder="Thêm giáo viên..." />
                              </SelectTrigger>
                              <SelectContent>
                                {[...(staff?.filter((s: any) => {
                                  if (!s.assignments) return true;
                                  return s.assignments.some((a: any) => a.department?.name?.toLowerCase().includes("đào tạo"));
                                }) || [])].sort((a: any, b: any) => {
                                  const aA = a.status !== "Không hoạt động";
                                  const bA = b.status !== "Không hoạt động";
                                  return aA === bA ? 0 : aA ? -1 : 1;
                                }).map((s: any) => (
                                  <SelectItem key={s.id} value={s.id} disabled={s.status === "Không hoạt động"} className={s.status === "Không hoạt động" ? "opacity-40" : ""}>
                                    {s.fullName} {s.code ? `(${s.code})` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-3">
                            {teachersConfig.map((teacher: any, idx: number) => {
                              const staffMember = staff?.find((s: any) => s.id === teacher.teacher_id);
                              const teacherConflictCount = staffMember?.fullName
                                ? liveConflicts.filter(c => c.type === "teacher" && c.resourceName === staffMember.fullName).length
                                : 0;
                              return (
                                <Card key={teacher.teacher_id} className={cn("bg-muted/10 border-dashed", teacherConflictCount > 0 && "border-orange-300")}>
                                  <CardContent className="pt-3 pb-3 space-y-3">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                                          <User className="h-3.5 w-3.5 text-primary" />
                                        </div>
                                        <span className="font-bold text-sm">{staffMember?.fullName}</span>
                                        {teacherConflictCount > 0 && (
                                          <button type="button"
                                            onClick={() => setConflictDetail({
                                              conflicts: liveConflicts.filter(c => c.type === "teacher" && c.resourceName === staffMember?.fullName),
                                              title: `${staffMember?.fullName}: ${teacherConflictCount} buổi trùng`,
                                            })}
                                            className="flex items-center gap-1 text-[11px] text-orange-600 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5"
                                          >
                                            <AlertTriangle className="h-3 w-3" /> Trùng {teacherConflictCount} buổi →
                                          </button>
                                        )}
                                      </div>
                                      <Button type="button" variant="ghost" size="sm" className="text-destructive h-7 px-2 text-xs"
                                        onClick={() => removeTeacher(idx)}>
                                        <X className="h-3.5 w-3.5 mr-1" /> Gỡ
                                      </Button>
                                    </div>
                                    <div className="flex items-center gap-3 flex-wrap">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium">Loại:</span>
                                        <div className="flex bg-muted p-0.5 rounded text-xs">
                                          {(["all", "specific"] as const).map((mode) => (
                                            <button key={mode} type="button"
                                              className={cn("px-2.5 py-1 rounded transition-colors text-xs",
                                                teacher.mode === mode ? "bg-background shadow-sm font-bold" : "text-muted-foreground")}
                                              onClick={() => {
                                                const newConfig = [...teachersConfig];
                                                newConfig[idx].mode = mode;
                                                form.setValue("teachers_config", newConfig);
                                              }}>
                                              {mode === "all" ? "Tất cả" : "Theo ca"}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                      {teacher.mode === "specific" && (
                                        <div className="flex flex-wrap gap-1.5">
                                          {getAllShiftsList().map((shift) => (
                                            <Badge key={shift.key}
                                              variant={teacher.shift_keys.includes(shift.key) ? "default" : "outline"}
                                              className="cursor-pointer text-xs px-2 py-1"
                                              onClick={() => {
                                                const newConfig = [...teachersConfig];
                                                const keys = [...teacher.shift_keys];
                                                newConfig[idx].shift_keys = keys.includes(shift.key)
                                                  ? keys.filter(k => k !== shift.key)
                                                  : [...keys, shift.key];
                                                form.setValue("teachers_config", newConfig);
                                              }}>
                                              {shift.label}
                                              {teacher.shift_keys.includes(shift.key) && <Check className="ml-1 h-3 w-3" />}
                                            </Badge>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })}
                            {teachersConfig.length === 0 && (
                              <div className="text-center py-6 border-2 border-dashed rounded-lg bg-muted/5">
                                <p className="text-sm text-muted-foreground">Chưa có giáo viên nào.</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Footer */}
              <div className="flex justify-between gap-3 pt-1">
                <Button type="button" variant="outline" onClick={step === 1 ? onClose : prevStep} className="gap-2">
                  <ChevronLeft className="h-4 w-4" />
                  {step === 1 ? "Hủy" : "Quay lại"}
                </Button>
                {step < 2 ? (
                  <Button type="button" onClick={nextStep} className="gap-2">
                    Tiếp tục <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="button" onClick={handleFinish} disabled={isCreating || isCheckingStep2} className="gap-2 bg-green-600 hover:bg-green-700">
                    {(isCreating || isCheckingStep2) && <Loader2 className="h-4 w-4 animate-spin" />}
                    <Copy className="h-4 w-4" />
                    {isCreating ? "Đang tạo lớp..." : "Tạo lớp & Sao chép học viên"}
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
