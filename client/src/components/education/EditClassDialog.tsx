import { useEffect, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useClassMutations } from "@/hooks/use-class-mutations";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronRight, ChevronLeft, Check, Plus, X, User, Lock, CalendarDays, Clock, Users } from "lucide-react";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, name: "Thông tin cơ bản" },
  { id: 2, name: "Lịch học" },
  { id: 3, name: "Xác nhận" },
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

const editSchema = z.object({
  classCode: z.string().min(1, "Mã lớp là bắt buộc"),
  name: z.string().min(1, "Tên lớp là bắt buộc"),
  locationId: z.string().min(1, "Cơ sở là bắt buộc"),
  programId: z.string().optional(),
  courseId: z.string().optional(),
  subjectId: z.string().optional(),
  evaluationCriteriaIds: z.array(z.string()).optional(),
  managerIds: z.array(z.string()).optional(),
  feePackageId: z.string().optional(),
  scoreSheetId: z.string().optional(),
  maxStudents: z.number().min(1),
  learningFormat: z.enum(["offline", "online"]),
  onlineLink: z.string().optional(),
  status: z.enum(["planning", "active", "recruiting", "closed", "cancelled"]),
  description: z.string().optional(),
  // Schedule fields — optional at schema level; validated manually when scheduleGenerated === false
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  weekdays: z.array(z.number()).optional(),
  schedule_config: z.array(z.object({
    weekday: z.number(),
    shifts: z.array(z.object({
      shift_template_id: z.string(),
      room_id: z.string().optional(),
    })),
  })).optional(),
  teachers_config: z.array(z.object({
    teacher_id: z.string(),
    mode: z.enum(["all", "specific"]),
    shift_keys: z.array(z.string()),
  })).optional(),
});

type EditFormValues = z.infer<typeof editSchema>;

interface EditClassDialogProps {
  classId: string | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function EditClassDialog({ classId, isOpen, onOpenChange, onSuccess }: EditClassDialogProps) {
  const { toast } = useToast();
  const { updateClassMutation } = useClassMutations();
  const [step, setStep] = useState(1);
  const [selectedColor, setSelectedColor] = useState<string>(CLASS_PALETTE[5]);
  const [endType, setEndType] = useState<"date" | "sessions">("date");
  const [sessionCount, setSessionCount] = useState<string>("10");

  const { data: cls, isLoading: loadingClass } = useQuery<any>({
    queryKey: ["/api/classes", classId],
    queryFn: async () => {
      const res = await fetch(`/api/classes/${classId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Không thể tải thông tin lớp");
      return res.json();
    },
    enabled: isOpen && !!classId,
  });

  const { data: sessions } = useQuery<any[]>({
    queryKey: ["/api/classes", classId, "sessions"],
    queryFn: async () => {
      const res = await fetch(`/api/classes/${classId}/sessions`, { credentials: "include" });
      if (!res.ok) throw new Error("Không thể tải lịch học");
      return res.json();
    },
    enabled: isOpen && !!classId,
  });

  // scheduleGenerated = true → lớp đã có lịch: step 2 chỉ xem, không sửa lịch
  const scheduleGenerated: boolean = cls?.scheduleGenerated ?? false;

  const { data: locations } = useQuery<any[]>({ queryKey: ["/api/locations"], enabled: isOpen });
  const { data: programs } = useQuery<any[]>({ queryKey: ["/api/course-programs"], enabled: isOpen });
  const { data: courses } = useQuery<any[]>({ queryKey: ["/api/courses"], enabled: isOpen });
  const { data: subjects } = useQuery<any[]>({ queryKey: ["/api/subjects"], enabled: isOpen });
  const { data: evaluationCriteriaList } = useQuery<any[]>({ queryKey: ["/api/evaluation-criteria"], enabled: isOpen });
  const { data: scoreSheets } = useQuery<any[]>({ queryKey: ["/api/score-sheets"], enabled: isOpen });

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      classCode: "", name: "", locationId: "", programId: "", courseId: "",
      subjectId: "", evaluationCriteriaIds: [],
      managerIds: [], feePackageId: "", scoreSheetId: "",
      maxStudents: 20, learningFormat: "offline", onlineLink: "", status: "planning",
      description: "",
      startDate: "", endDate: "", weekdays: [],
      schedule_config: [],
      teachers_config: [],
    },
  });

  const selectedLocationId = form.watch("locationId");
  const selectedCourseId = form.watch("courseId");
  const selectedLearningFormat = form.watch("learningFormat");
  const selectedWeekdays = form.watch("weekdays") || [];
  const scheduleConfig = form.watch("schedule_config") || [];
  const teachersConfig = form.watch("teachers_config") || [];

  const effectiveLocationId = selectedLocationId || cls?.locationId;

  const { data: staff } = useQuery<any[]>({
    queryKey: [effectiveLocationId ? `/api/staff?locationId=${effectiveLocationId}&minimal=true` : "/api/staff?minimal=true"],
    enabled: isOpen && !!effectiveLocationId,
  });
  const { data: shifts } = useQuery<any[]>({
    queryKey: ["/api/shift-templates"],
    enabled: isOpen && !!effectiveLocationId,
  });
  const { data: classrooms } = useQuery<any[]>({
    queryKey: ["/api/classrooms"],
    enabled: isOpen && !!effectiveLocationId,
  });
  const effectiveCourseId = selectedCourseId || cls?.courseId;

  const { data: feePackages } = useQuery<any[]>({
    queryKey: ["/api/courses", effectiveCourseId, "fee-packages"],
    queryFn: async () => {
      const res = await fetch(`/api/courses/${effectiveCourseId}/fee-packages`, { credentials: "include" });
      if (!res.ok) throw new Error("Không thể tải gói học phí");
      return res.json();
    },
    enabled: isOpen && !!effectiveCourseId,
  });

  const filteredShifts = Array.isArray(shifts)
    ? shifts.filter((s) => String(s.locationId) === String(effectiveLocationId))
    : [];
  const filteredClassrooms = Array.isArray(classrooms)
    ? classrooms.filter((r) => String(r.locationId) === String(effectiveLocationId))
    : [];

  useEffect(() => {
    if (cls && isOpen && sessions !== undefined) {
      const weekdays = cls.weekdays || [];

      // Reconstruct schedule_config: prefer sessions → stored JSON → fallback
      let schedule_config: any[];
      if (sessions && sessions.length > 0) {
        const dayMap = new Map<number, Map<string, string>>();
        sessions.forEach((s: any) => {
          if (!dayMap.has(s.weekday)) dayMap.set(s.weekday, new Map());
          const shiftMap = dayMap.get(s.weekday)!;
          if (s.shiftTemplateId && !shiftMap.has(s.shiftTemplateId)) {
            shiftMap.set(s.shiftTemplateId, s.roomId || "");
          }
        });
        schedule_config = weekdays.map((wd: number) => {
          const shiftMap = dayMap.get(wd);
          if (shiftMap && shiftMap.size > 0) {
            return {
              weekday: wd,
              shifts: Array.from(shiftMap.entries()).map(([shift_template_id, room_id]) => ({
                shift_template_id,
                room_id: room_id === "00000000-0000-0000-0000-000000000000" ? "" : (room_id || ""),
              })),
            };
          }
          return { weekday: wd, shifts: [{ shift_template_id: "", room_id: "" }] };
        });
      } else if (cls.scheduleConfig && Array.isArray(cls.scheduleConfig) && cls.scheduleConfig.length > 0) {
        // Use stored schedule_config JSON — exact weekday→shift mapping
        schedule_config = weekdays.map((wd: number) => {
          const stored = (cls.scheduleConfig as any[]).find((c: any) => c.weekday === wd);
          return stored || { weekday: wd, shifts: [{ shift_template_id: "", room_id: "" }] };
        });
      } else {
        // Last resort: assign first shift to all days
        const firstShift = (cls.shiftTemplateIds || [])[0] || "";
        schedule_config = weekdays.map((wd: number) => ({
          weekday: wd,
          shifts: [{ shift_template_id: firstShift, room_id: "" }],
        }));
      }

      // Reconstruct teachers_config: prefer sessions → stored JSON → fallback
      let teachers_config: any[];
      if (sessions && sessions.length > 0) {
        const teacherMap = new Map<string, string[]>();
        sessions.forEach((s: any) => {
          const ids: string[] = Array.isArray(s.teacherIds) ? s.teacherIds : [];
          ids.forEach((tid: string) => {
            if (!teacherMap.has(tid)) teacherMap.set(tid, []);
            const key = `${s.weekday}_shift0`;
            if (!teacherMap.get(tid)!.includes(key)) {
              teacherMap.get(tid)!.push(key);
            }
          });
        });
        const totalDays = weekdays.length;
        teachers_config = Array.from(teacherMap.entries()).map(([teacher_id, keys]) => ({
          teacher_id,
          mode: keys.length >= totalDays ? "all" as const : "specific" as const,
          shift_keys: keys.length >= totalDays ? [] : keys,
        }));
        const allTeacherIds: string[] = Array.isArray(cls.teacherIds) ? cls.teacherIds : (cls.teacherId ? [cls.teacherId] : []);
        for (const tid of allTeacherIds) {
          if (!teacherMap.has(tid)) {
            teachers_config.push({ teacher_id: tid, mode: "all" as const, shift_keys: [] });
          }
        }
      } else if (cls.teachersConfig && Array.isArray(cls.teachersConfig) && cls.teachersConfig.length > 0) {
        // Use stored teachers_config JSON — exact mode/shift_keys per teacher
        teachers_config = cls.teachersConfig as any[];
      } else {
        const allTeacherIds: string[] = Array.isArray(cls.teacherIds) ? cls.teacherIds : (cls.teacherId ? [cls.teacherId] : []);
        teachers_config = allTeacherIds.map(tid => ({ teacher_id: tid, mode: "all" as const, shift_keys: [] }));
      }

      form.reset({
        classCode: cls.classCode || "",
        name: cls.name || "",
        locationId: String(cls.locationId || ""),
        programId: String(cls.programId || ""),
        courseId: String(cls.courseId || ""),
        subjectId: cls.subjectId ? String(cls.subjectId) : "",
        evaluationCriteriaIds: Array.isArray(cls.evaluationCriteriaIds) ? cls.evaluationCriteriaIds.map(String) : [],
        managerIds: Array.isArray(cls.managerIds) ? cls.managerIds.map(String) : (cls.managerId ? [String(cls.managerId)] : []),
        feePackageId: String(cls.feePackageId || ""),
        scoreSheetId: String(cls.scoreSheetId || ""),
        maxStudents: cls.maxStudents || 20,
        learningFormat: cls.learningFormat || "offline",
        onlineLink: cls.onlineLink || "",
        status: cls.status || "planning",
        description: cls.description || "",
        startDate: cls.startDate || "",
        endDate: cls.endDate || "",
        weekdays,
        schedule_config,
        teachers_config,
      });
      setStep(1);
      setSelectedColor(cls.color || CLASS_PALETTE[5]);
      setEndType("date");
      if (cls.endDate) setSessionCount("10");
    }
  }, [cls, isOpen, sessions]);

  // Sync schedule_config when weekdays change
  useEffect(() => {
    const currentConfig = form.getValues("schedule_config") || [];
    const newConfig = selectedWeekdays.map((day: number) => {
      const existing = currentConfig.find((c: any) => c.weekday === day);
      if (existing) return existing;
      return { weekday: day, shifts: [{ shift_template_id: "", room_id: "" }] };
    });
    form.setValue("schedule_config", newConfig);
  }, [selectedWeekdays]);


  const nextStep = async () => {
    if (step === 1) {
      const fields = ["classCode", "name", "locationId", "maxStudents", "learningFormat"] as any[];
      if (selectedLearningFormat === "online") fields.push("onlineLink");
      const isValid = await form.trigger(fields);
      if (!isValid) return toast({ title: "Thiếu thông tin", description: "Vui lòng điền đầy đủ các trường bắt buộc", variant: "destructive" });
    }
    if (step === 2 && !scheduleGenerated) {
      // Only validate schedule fields if schedule has NOT been generated yet
      if (!form.getValues("startDate")) {
        return toast({ title: "Thiếu thông tin", description: "Vui lòng nhập ngày bắt đầu", variant: "destructive" });
      }
      if (endType === "date" && !form.getValues("endDate")) {
        return toast({ title: "Thiếu thông tin", description: "Vui lòng nhập ngày kết thúc", variant: "destructive" });
      }
      if (endType === "sessions" && (!sessionCount || Number(sessionCount) < 1)) {
        return toast({ title: "Thiếu thông tin", description: "Vui lòng nhập số buổi học hợp lệ", variant: "destructive" });
      }
      const weekdays = form.getValues("weekdays") || [];
      if (weekdays.length === 0) {
        return toast({ title: "Thiếu thông tin", description: "Vui lòng chọn ít nhất một ngày học", variant: "destructive" });
      }
      const schedCfg = form.getValues("schedule_config") || [];
      const hasEmptyShift = schedCfg.some((d: any) => d.shifts?.some((s: any) => !s.shift_template_id));
      if (hasEmptyShift) {
        return toast({ title: "Thiếu thông tin", description: "Vui lòng chọn ca học cho tất cả các thứ", variant: "destructive" });
      }
      const teachersCfg = form.getValues("teachers_config") || [];
      if (teachersCfg.length === 0) {
        return toast({ title: "Thiếu thông tin", description: "Vui lòng chọn ít nhất một giáo viên", variant: "destructive" });
      }
    }
    // When scheduleGenerated === true and step === 2, step 2 is read-only — no validation needed
    setStep((s) => s + 1);
  };

  const prevStep = () => setStep((s) => s - 1);

  const handleFinalSubmit = async () => {
    const step1Fields = ["classCode", "name", "locationId", "maxStudents", "learningFormat"] as any[];
    const isValid = await form.trigger(step1Fields);
    if (!isValid) {
      return toast({ title: "Lỗi", description: "Vui lòng kiểm tra lại thông tin. Một số trường chưa hợp lệ.", variant: "destructive" });
    }
    const data = form.getValues();
    const valOrUndefined = (val: string | undefined) => (val && val.trim() !== "" ? val : undefined);
    const valOrNull = (val: string | undefined) => (val && val.trim() !== "" ? val : null);

    if (scheduleGenerated) {
      // Case 1: Schedule already generated — only save basic class info, do not touch sessions
      const submitData: any = {
        classCode: data.classCode,
        name: data.name,
        locationId: data.locationId,
        maxStudents: data.maxStudents,
        learningFormat: data.learningFormat,
        status: data.status,
        description: valOrNull(data.description),
        onlineLink: valOrNull(data.onlineLink),
        programId: valOrUndefined(data.programId),
        courseId: valOrUndefined(data.courseId),
        subjectId: valOrNull(data.subjectId),
        evaluationCriteriaIds: Array.isArray(data.evaluationCriteriaIds) && data.evaluationCriteriaIds.length > 0 ? data.evaluationCriteriaIds : null,
        managerIds: data.managerIds || [],
        feePackageId: valOrNull(data.feePackageId),
        scoreSheetId: valOrNull(data.scoreSheetId),
        color: selectedColor || null,
      };
      updateClassMutation.mutate(
        { id: classId, data: submitData },
        { onSuccess: () => { onOpenChange(false); onSuccess?.(); } }
      );
    } else {
      // Case 2: No schedule yet — save all fields and regenerate sessions
      // Compute endDate from sessionCount when endType === "sessions"
      let computedEndDate: string | null = endType === "date" ? (data.endDate || null) : null;
      if (endType === "sessions" && data.startDate && (data.weekdays || []).length > 0) {
        const count = Number(sessionCount);
        const weekdaySet = new Set((data.weekdays || []).map(Number));
        let found = 0;
        const d = new Date(data.startDate);
        const maxDate = new Date(data.startDate);
        maxDate.setFullYear(maxDate.getFullYear() + 5);
        while (d <= maxDate && found < count) {
          const dow = d.getDay();
          if (weekdaySet.has(dow)) {
            found++;
            if (found === count) {
              computedEndDate = d.toISOString().slice(0, 10);
            }
          }
          d.setDate(d.getDate() + 1);
        }
      }
      const submitData: any = {
        classCode: data.classCode,
        name: data.name,
        locationId: data.locationId,
        maxStudents: data.maxStudents,
        learningFormat: data.learningFormat,
        status: data.status,
        description: valOrNull(data.description),
        onlineLink: valOrNull(data.onlineLink),
        startDate: data.startDate,
        endDate: computedEndDate,
        endType,
        sessionCount: endType === "sessions" ? Number(sessionCount) : undefined,
        weekdays: (data.weekdays || []).map(Number),
        programId: valOrUndefined(data.programId),
        courseId: valOrUndefined(data.courseId),
        subjectId: valOrNull(data.subjectId),
        evaluationCriteriaIds: Array.isArray(data.evaluationCriteriaIds) && data.evaluationCriteriaIds.length > 0 ? data.evaluationCriteriaIds : null,
        managerIds: data.managerIds || [],
        feePackageId: valOrNull(data.feePackageId),
        scoreSheetId: valOrNull(data.scoreSheetId),
        teacherIds: [...new Set((data.teachers_config || []).map((t: any) => t.teacher_id).filter(Boolean))],
        shiftTemplateIds: [...new Set((data.schedule_config || []).flatMap((c: any) => (c.shifts || []).map((s: any) => s.shift_template_id).filter(Boolean)))],
        color: selectedColor || null,
        schedule_config: data.schedule_config || [],
        teachers_config: data.teachers_config || [],
        regenerateSessions: true,
      };
      updateClassMutation.mutate(
        { id: classId, data: submitData },
        { onSuccess: () => { onOpenChange(false); onSuccess?.(); } }
      );
    }
  };

  const getAllShiftsList = () => {
    const list: { key: string; label: string }[] = [];
    scheduleConfig.forEach((day: any) => {
      const dayLabel = WEEKDAYS.find((w) => w.value === day.weekday)?.label;
      day.shifts.forEach((s: any, idx: number) => {
        const shiftName = shifts?.find((st: any) => st.id === s.shift_template_id)?.name || `Ca ${idx + 1}`;
        list.push({ key: `${day.weekday}_shift${idx}`, label: `${dayLabel}-${shiftName}` });
      });
    });
    return list;
  };

  const handleClose = (open: boolean) => {
    if (!open) setStep(1);
    onOpenChange(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="text-xl font-display font-bold">Chỉnh sửa lớp học</DialogTitle>
          <p className="text-sm text-muted-foreground">Cập nhật thông tin và lịch học cho lớp</p>
        </DialogHeader>

        {loadingClass ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Step Indicator */}
            <div className="flex items-center justify-between relative px-10 py-4 border-b">
              {STEPS.map((s) => {
                const isStep2Locked = s.id === 2 && scheduleGenerated;
                return (
                <div key={s.id} className="flex flex-col items-center gap-1.5 z-10">
                  <div className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center font-bold transition-all text-sm",
                    isStep2Locked ? "bg-amber-100 text-amber-600 border border-amber-300" :
                    step >= s.id ? "bg-primary text-primary-foreground shadow-md" : "bg-muted text-muted-foreground"
                  )}>
                    {isStep2Locked ? <Lock className="h-4 w-4" /> : step > s.id ? <Check className="h-4 w-4" /> : s.id}
                  </div>
                  <span className={cn("text-xs font-medium", isStep2Locked ? "text-amber-600" : step === s.id ? "text-primary" : "text-muted-foreground")}>
                    {s.name}{isStep2Locked ? " (xem)" : ""}
                  </span>
                </div>
                );
              })}
              <div className="absolute top-[28px] left-10 right-10 h-0.5 bg-muted -z-0" />
              <div
                className="absolute top-[28px] left-10 h-0.5 bg-primary transition-all duration-300 -z-0"
                style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%`, right: "auto" }}
              />
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <Form {...form}>
                <form className="space-y-4">

                  {/* STEP 1 */}
                  {step === 1 && (
                    <div className="space-y-6">
                      {/* Thông tin bắt buộc */}
                      <div className="grid grid-cols-3 gap-5">
                        <FormField control={form.control} name="locationId" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cơ sở <span className="text-destructive">*</span></FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl><SelectTrigger><SelectValue placeholder="Chọn cơ sở" /></SelectTrigger></FormControl>
                              <SelectContent>
                                {locations?.map((l: any) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
                              </SelectContent>
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
                            <FormControl><Input placeholder="VD: Lớp Tiếng Anh Giao Tiếp A1" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="courseId" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Khóa học</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl><SelectTrigger><SelectValue placeholder="Chọn khóa học" /></SelectTrigger></FormControl>
                              <SelectContent>
                                {courses?.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="feePackageId" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Gói học phí</FormLabel>
                            <Select
                              key={`fee-${feePackages?.length ?? 0}-${field.value}`}
                              onValueChange={field.onChange}
                              value={field.value || ""}
                              disabled={!selectedCourseId}
                            >
                              <FormControl><SelectTrigger><SelectValue placeholder={selectedCourseId ? "Chọn gói học phí" : "Chọn khóa học trước"} /></SelectTrigger></FormControl>
                              <SelectContent>
                                {feePackages?.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="managerIds" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Quản lý lớp</FormLabel>
                            <FormControl>
                              <SearchableMultiSelect
                                options={(staff || []).map((s: any) => ({ value: String(s.id), label: s.fullName, sublabel: s.code }))}
                                value={field.value || []}
                                onChange={field.onChange}
                                placeholder="Chọn nhân sự"
                                searchPlaceholder="Tìm kiếm nhân sự..."
                                data-testid="select-manager"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="maxStudents" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Số học viên tối đa <span className="text-destructive">*</span></FormLabel>
                            <FormControl><Input type="number" {...field} onChange={(e) => field.onChange(parseInt(e.target.value))} /></FormControl>
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
                              <FormLabel>Link học online</FormLabel>
                              <FormControl><Input placeholder="https://meet.google.com/..." {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                        )}
                      </div>

                      {/* Thông tin bổ sung */}
                      <div className="border-t pt-6">
                        <p className="text-sm font-medium text-muted-foreground mb-4">Thông tin bổ sung</p>
                        <div className="grid grid-cols-3 gap-5">
                          <FormField control={form.control} name="programId" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Chương trình</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Chọn chương trình" /></SelectTrigger></FormControl>
                                <SelectContent>
                                  {programs?.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="scoreSheetId" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Bảng điểm</FormLabel>
                              <Select
                                onValueChange={(val) => field.onChange(val === "none" ? "" : val)}
                                value={field.value || "none"}
                              >
                                <FormControl><SelectTrigger data-testid="select-score-sheet"><SelectValue placeholder="Chọn bảng điểm (tuỳ chọn)" /></SelectTrigger></FormControl>
                                <SelectContent>
                                  <SelectItem value="none">— Không chọn —</SelectItem>
                                  {scoreSheets?.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
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
                                  {subjects?.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
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
                                  options={(evaluationCriteriaList || []).map((c: any) => ({ value: String(c.id), label: c.name }))}
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
                              <FormControl><Textarea placeholder="Thông tin thêm về lớp học..." className="resize-none" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 2 */}
                  {step === 2 && scheduleGenerated && (
                    <div className="space-y-5">
                      <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <Lock className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Lịch học đã được tạo</p>
                          <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                            Lớp học này đã có lịch học. Để thay đổi lịch, hãy xóa các buổi học trong tab Lịch học trước. Dưới đây là thông tin lịch học hiện tại.
                          </p>
                        </div>
                      </div>

                      {/* Date range */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-muted/30 rounded-lg border">
                          <div className="flex items-center gap-2 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            <CalendarDays className="h-3.5 w-3.5" />Thời gian
                          </div>
                          <p className="text-sm font-bold">{cls?.startDate || "—"} → {cls?.endDate || "—"}</p>
                        </div>
                        <div className="p-4 bg-muted/30 rounded-lg border">
                          <div className="flex items-center gap-2 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            <Clock className="h-3.5 w-3.5" />Số buổi
                          </div>
                          <p className="text-sm font-bold">{sessions?.length ?? "—"} buổi học</p>
                        </div>
                      </div>

                      {/* Weekdays */}
                      <div className="p-4 bg-muted/30 rounded-lg border space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ngày học trong tuần</p>
                        <div className="flex flex-wrap gap-2">
                          {(cls?.weekdays || []).map((wd: number) => (
                            <Badge key={wd} variant="secondary" className="text-sm px-3 py-1">
                              {WEEKDAYS.find(w => w.value === wd)?.label ?? wd}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Schedule config */}
                      {scheduleConfig.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cấu hình ca học</p>
                          <div className="border rounded-lg overflow-hidden">
                            <div className="grid grid-cols-12 bg-muted/50 p-3 text-xs font-semibold border-b">
                              <div className="col-span-2">Thứ</div>
                              <div className="col-span-5">Ca học</div>
                              <div className="col-span-5">Phòng</div>
                            </div>
                            <div className="divide-y">
                              {scheduleConfig.map((dayConfig: any) => (
                                <div key={dayConfig.weekday} className="contents">
                                  {dayConfig.shifts.map((shift: any, si: number) => (
                                    <div key={si} className="grid grid-cols-12 p-3 items-center text-sm">
                                      <div className="col-span-2 font-bold text-primary text-sm">
                                        {si === 0 ? WEEKDAYS.find(w => w.value === dayConfig.weekday)?.label : ""}
                                      </div>
                                      <div className="col-span-5 text-muted-foreground">
                                        {filteredShifts.find((s: any) => s.id === shift.shift_template_id)
                                          ? `${filteredShifts.find((s: any) => s.id === shift.shift_template_id)?.name} (${filteredShifts.find((s: any) => s.id === shift.shift_template_id)?.startTime}–${filteredShifts.find((s: any) => s.id === shift.shift_template_id)?.endTime})`
                                          : shift.shift_template_id || "—"}
                                      </div>
                                      <div className="col-span-5 text-muted-foreground">
                                        {filteredClassrooms.find((r: any) => r.id === shift.room_id)?.name || "—"}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Teachers */}
                      {teachersConfig.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            <Users className="h-3.5 w-3.5" />Giáo viên
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {teachersConfig.map((t: any) => {
                              const member = staff?.find((s: any) => s.id === t.teacher_id);
                              return (
                                <div key={t.teacher_id} className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg border text-sm">
                                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                                    <User className="h-3 w-3 text-primary" />
                                  </div>
                                  <span className="font-medium">{member?.fullName || t.teacher_id}</span>
                                  <Badge variant="outline" className="text-xs">{t.mode === "all" ? "Tất cả" : "Theo ca"}</Badge>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {step === 2 && !scheduleGenerated && (
                    <div className="space-y-6">
                      <div className="space-y-4 pb-5 border-b">
                        <div className="grid grid-cols-2 gap-5">
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
                        </div>
                        <div className="grid grid-cols-2 gap-5">
                          <div />
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
                              <Input
                                type="number"
                                min={1}
                                max={500}
                                value={sessionCount}
                                onChange={(e) => setSessionCount(e.target.value)}
                                placeholder="VD: 10"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label className="text-sm font-semibold uppercase tracking-wide">Phần 1: Chọn chu kỳ thứ</Label>
                        <div className="flex flex-wrap gap-5 p-4 bg-muted/30 rounded-lg border border-border">
                          {WEEKDAYS.map((day) => (
                            <div key={day.value} className="flex items-center gap-2">
                              <Checkbox
                                id={`edit-day-${day.value}`}
                                checked={selectedWeekdays.includes(day.value)}
                                onCheckedChange={(checked) => {
                                  const current = form.getValues("weekdays") || [];
                                  form.setValue("weekdays", checked ? [...current, day.value] : current.filter((v) => v !== day.value));
                                  form.trigger("weekdays");
                                }}
                              />
                              <Label htmlFor={`edit-day-${day.value}`} className="cursor-pointer font-medium">{day.label}</Label>
                            </div>
                          ))}
                        </div>
                      </div>

                      {selectedWeekdays.length > 0 && (
                        <div className="space-y-3">
                          <Label className="text-sm font-semibold uppercase tracking-wide">Phần 2: Cấu hình ca theo thứ</Label>
                          <div className="border rounded-lg overflow-hidden">
                            <div className="grid grid-cols-12 bg-muted/50 p-3 text-sm font-semibold border-b">
                              <div className="col-span-2">Thứ</div>
                              <div className="col-span-4">Ca học</div>
                              <div className="col-span-4">Phòng học</div>
                              <div className="col-span-2 text-center">Action</div>
                            </div>
                            <div className="divide-y">
                              {scheduleConfig.map((dayConfig: any, dayIdx: number) => (
                                <div key={dayConfig.weekday} className="contents">
                                  {dayConfig.shifts.map((shift: any, shiftIdx: number) => (
                                    <div key={shiftIdx} className="grid grid-cols-12 p-3 items-center gap-3 hover:bg-accent/5 transition-colors">
                                      <div className="col-span-2 font-bold text-primary text-sm">
                                        {shiftIdx === 0 ? WEEKDAYS.find((w) => w.value === dayConfig.weekday)?.label : ""}
                                      </div>
                                      <div className="col-span-4">
                                        <Select
                                          value={shift.shift_template_id}
                                          onValueChange={(val) => {
                                            const newConfig = [...scheduleConfig];
                                            newConfig[dayIdx].shifts[shiftIdx].shift_template_id = val;
                                            form.setValue("schedule_config", newConfig);
                                          }}
                                        >
                                          <SelectTrigger className="h-9"><SelectValue placeholder="Chọn ca" /></SelectTrigger>
                                          <SelectContent>
                                            {filteredShifts.map((s: any) => (
                                              <SelectItem key={s.id} value={s.id}>{s.name} ({s.startTime}-{s.endTime})</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="col-span-4">
                                        <Select
                                          value={shift.room_id || ""}
                                          onValueChange={(val) => {
                                            const newConfig = [...scheduleConfig];
                                            newConfig[dayIdx].shifts[shiftIdx].room_id = val;
                                            form.setValue("schedule_config", newConfig);
                                          }}
                                        >
                                          <SelectTrigger className="h-9"><SelectValue placeholder="Chọn phòng (không bắt buộc)" /></SelectTrigger>
                                          <SelectContent>
                                            {filteredClassrooms.map((r: any) => (
                                              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="col-span-2 flex justify-center gap-1">
                                        {shiftIdx === 0 ? (
                                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/10"
                                            onClick={() => {
                                              const newConfig = [...scheduleConfig];
                                              newConfig[dayIdx].shifts.push({ shift_template_id: "", room_id: "" });
                                              form.setValue("schedule_config", newConfig);
                                            }}>
                                            <Plus className="h-4 w-4" />
                                          </Button>
                                        ) : (
                                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                            onClick={() => {
                                              const newConfig = [...scheduleConfig];
                                              newConfig[dayIdx].shifts.splice(shiftIdx, 1);
                                              form.setValue("schedule_config", newConfig);
                                            }}>
                                            <X className="h-4 w-4" />
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="space-y-4 pt-4 border-t">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-semibold uppercase tracking-wide">Phần 3: Chọn giáo viên</Label>
                          <Select
                            onValueChange={(val) => {
                              const current = form.getValues("teachers_config") || [];
                              if (!current.some((t: any) => t.teacher_id === val)) {
                                form.setValue("teachers_config", [...current, { teacher_id: val, mode: "all", shift_keys: [] }]);
                              }
                            }}
                          >
                            <SelectTrigger className="w-[260px]">
                              <SelectValue placeholder="Thêm giáo viên..." />
                            </SelectTrigger>
                            <SelectContent>
                              {staff?.filter((s: any) => {
                                if (!s.assignments) return true;
                                return s.assignments.some((a: any) =>
                                  a.department?.name && a.department.name.toLowerCase().includes("đào tạo")
                                );
                              }).map((s: any) => (
                                <SelectItem key={s.id} value={s.id}>
                                  <span>{s.fullName}</span>
                                  {s.code && <span className="ml-1 text-[11px] text-muted-foreground">({s.code})</span>}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-3">
                          {teachersConfig.map((teacher: any, idx: number) => {
                            const staffMember = staff?.find((s: any) => s.id === teacher.teacher_id);
                            return (
                              <Card key={teacher.teacher_id} className="bg-muted/10 border-dashed">
                                <CardContent className="pt-4 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                        <User className="h-4 w-4 text-primary" />
                                      </div>
                                      <span className="font-bold text-sm">{staffMember?.fullName || teacher.teacher_id}</span>
                                    </div>
                                    <Button type="button" variant="ghost" size="sm" className="text-destructive h-7 px-2"
                                      onClick={() => {
                                        const current = form.getValues("teachers_config");
                                        form.setValue("teachers_config", current.filter((_: any, i: number) => i !== idx));
                                      }}>
                                      <X className="h-4 w-4 mr-1" /> Gỡ
                                    </Button>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <span className="text-xs font-medium">Loại:</span>
                                    <div className="flex bg-muted p-1 rounded-md text-xs">
                                      {(["all", "specific"] as const).map((mode) => (
                                        <button key={mode} type="button"
                                          className={cn("px-3 py-1 rounded transition-colors", teacher.mode === mode ? "bg-background shadow-sm font-bold" : "text-muted-foreground")}
                                          onClick={() => {
                                            const current = [...form.getValues("teachers_config")];
                                            current[idx].mode = mode;
                                            form.setValue("teachers_config", current);
                                          }}>
                                          {mode === "all" ? "Tất cả" : "Theo ca"}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  {teacher.mode === "specific" && (
                                    <div className="space-y-1.5">
                                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Chọn ca dạy:</p>
                                      <div className="flex flex-wrap gap-2">
                                        {getAllShiftsList().map((shift) => (
                                          <Badge key={shift.key}
                                            variant={teacher.shift_keys.includes(shift.key) ? "default" : "outline"}
                                            className={cn("cursor-pointer px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                                              !teacher.shift_keys.includes(shift.key) && "bg-background hover:bg-accent")}
                                            onClick={() => {
                                              const current = [...form.getValues("teachers_config")];
                                              const keys = [...current[idx].shift_keys];
                                              current[idx].shift_keys = keys.includes(shift.key) ? keys.filter((k) => k !== shift.key) : [...keys, shift.key];
                                              form.setValue("teachers_config", current);
                                            }}>
                                            {shift.label}
                                            {teacher.shift_keys.includes(shift.key) && <Check className="ml-1 h-3 w-3" />}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            );
                          })}
                          {teachersConfig.length === 0 && (
                            <div className="text-center py-6 border-2 border-dashed rounded-lg bg-muted/5">
                              <p className="text-sm text-muted-foreground">Chưa có giáo viên nào được chọn.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 3 */}
                  {step === 3 && (
                    <div className="space-y-5">
                      <div className="bg-primary/5 p-5 rounded-xl border border-primary/10">
                        <h3 className="font-bold text-base mb-4 text-primary">Tóm tắt thông tin lớp học</h3>
                        <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
                          <div className="space-y-0.5">
                            <p className="text-muted-foreground text-xs">Tên lớp</p>
                            <p className="font-semibold">{form.watch("name")}</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-muted-foreground text-xs">Mã lớp</p>
                            <p className="font-semibold font-mono">{form.watch("classCode")}</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-muted-foreground text-xs">Thời gian</p>
                            <p className="font-semibold">
                              {scheduleGenerated
                                ? `${cls?.startDate || "—"} → ${cls?.endDate || "—"}`
                                : `${form.watch("startDate") || "—"} → ${endType === "date" ? (form.watch("endDate") || "—") : `${sessionCount} buổi`}`}
                            </p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-muted-foreground text-xs">Cơ sở</p>
                            <p className="font-semibold">{locations?.find((l: any) => String(l.id) === form.watch("locationId"))?.name || "—"}</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-muted-foreground text-xs">Hình thức</p>
                            <p className="font-semibold capitalize">{form.watch("learningFormat")}</p>
                          </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-primary/10 space-y-3">
                          <p className="text-xs font-medium text-muted-foreground">Màu hiển thị trong lịch:</p>
                          <div className="flex flex-wrap gap-2">
                            {CLASS_PALETTE.map(color => (
                              <button
                                key={color}
                                type="button"
                                onClick={() => setSelectedColor(color)}
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

                        {scheduleGenerated ? (
                          <div className="mt-4 pt-4 border-t border-primary/10">
                            <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 rounded">
                              <Lock className="h-3.5 w-3.5 shrink-0" />
                              Lịch học không thay đổi — chỉ cập nhật thông tin cơ bản của lớp.
                            </div>
                          </div>
                        ) : (
                          <div className="mt-4 pt-4 border-t border-primary/10 space-y-3">
                            <div className="space-y-2">
                              <p className="text-muted-foreground text-xs font-medium">Lịch học chi tiết (sẽ được tạo mới):</p>
                              <div className="grid grid-cols-1 gap-1.5">
                                {scheduleConfig.map((day: any) => (
                                  <div key={day.weekday} className="flex items-start gap-3 text-sm bg-background p-2 rounded border">
                                    <span className="font-bold min-w-[32px] text-primary">{WEEKDAYS.find((w) => w.value === day.weekday)?.label}:</span>
                                    <div className="flex flex-wrap gap-1.5">
                                      {day.shifts.map((s: any, i: number) => {
                                        const shiftInfo = shifts?.find((st: any) => st.id === s.shift_template_id);
                                        const roomInfo = classrooms?.find((r: any) => r.id === s.room_id);
                                        return (
                                          <Badge key={i} variant="secondary" className="font-normal text-xs">
                                            {shiftInfo?.name || "Chưa chọn"}{shiftInfo ? ` (${shiftInfo.startTime}-${shiftInfo.endTime})` : ""}{roomInfo ? ` - ${roomInfo.name}` : ""}
                                          </Badge>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <p className="text-muted-foreground text-xs font-medium">Giáo viên:</p>
                              <div className="flex flex-wrap gap-2">
                                {teachersConfig.map((t: any) => (
                                  <Badge key={t.teacher_id} variant="outline" className="bg-primary/5 py-1">
                                    <User className="h-3 w-3 mr-1" />
                                    {staff?.find((s: any) => s.id === t.teacher_id)?.fullName || t.teacher_id}
                                    <span className="ml-1 text-[10px] opacity-70">({t.mode === "all" ? "Tất cả" : "Theo ca"})</span>
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </form>
              </Form>
            </div>

            {/* Footer actions */}
            <div className="flex justify-between gap-3 px-6 py-4 border-t bg-muted/20">
              <Button type="button" variant="outline" className="gap-2"
                onClick={step === 1 ? () => onOpenChange(false) : prevStep}>
                <ChevronLeft className="h-4 w-4" />
                {step === 1 ? "Hủy" : "Quay lại"}
              </Button>
              {step < 3 ? (
                <Button type="button" onClick={nextStep} className="gap-2">
                  Tiếp tục <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button type="button" onClick={handleFinalSubmit} className="gap-2 bg-green-600 hover:bg-green-700" disabled={updateClassMutation.isPending}>
                  {updateClassMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Check className="h-4 w-4" />
                  Lưu thay đổi
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
