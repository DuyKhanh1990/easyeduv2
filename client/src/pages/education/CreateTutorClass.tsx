import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { STATIC_STALE_TIME } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useClassMutations } from "@/hooks/use-class-mutations";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronLeft, Plus, X, User, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeSearchText } from "@/lib/search-text";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { ShiftSelectWithCreate } from "@/components/ui/shift-select-with-create";
import { insertClassSchema } from "@shared/schema";
import { ConflictWarningDialog } from "@/components/education/ConflictWarningDialog";
import { ConflictDetailSheet } from "@/components/education/ConflictDetailSheet";

const CLASS_PALETTE = [
  "#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444",
  "#06b6d4","#ec4899","#84cc16","#f97316","#6366f1",
];

const WEEKDAYS = [
  { value: 1, label: "T2" }, { value: 2, label: "T3" },
  { value: 3, label: "T4" }, { value: 4, label: "T5" },
  { value: 5, label: "T6" }, { value: 6, label: "T7" },
  { value: 0, label: "CN" },
];

const STEPS = [
  { id: 1, name: "Thông tin lớp" },
  { id: 2, name: "Lịch học" },
  { id: 3, name: "Xác nhận" },
];

const formSchema = insertClassSchema.extend({
  weekdays: z.array(z.number()).min(1, "Chọn ít nhất một ngày trong tuần"),
  schedule_config: z.array(z.any()).min(1),
  teachers_config: z.array(z.any()),
  managerIds: z.array(z.string()).min(1, "Chọn ít nhất một quản lý lớp"),
  courseId: z.string().optional(),
  feePackageId: z.string().optional(),
  programId: z.string().optional(),
  subjectId: z.string().optional(),
  scoreSheetId: z.string().optional(),
  onlineLink: z.string().optional(),
  endDate: z.string().optional(),
  description: z.string().optional(),
  teacherId: z.string().optional(),
  shiftTemplateId: z.string().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true } as any);

export function CreateTutorClass() {
  const [step, setStep] = useState(1);
  const [endType, setEndType] = useState<"date" | "sessions">("sessions");
  const [sessionCount, setSessionCount] = useState("10");
  const [selectedColor, setSelectedColor] = useState(CLASS_PALETTE[1]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [studentSearch, setStudentSearch] = useState("");
  const [debouncedStudentSearch, setDebouncedStudentSearch] = useState("");
  const [studentFocused, setStudentFocused] = useState(false);
  const [step2Conflicts, setStep2Conflicts] = useState<any[]>([]);
  const [isCheckingStep2, setIsCheckingStep2] = useState(false);
  const [liveConflicts, setLiveConflicts] = useState<any[]>([]);
  const [isLiveChecking, setIsLiveChecking] = useState(false);
  const [conflictDetail, setConflictDetail] = useState<{ conflicts: any[]; title: string } | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const form = useForm<any>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      classCode: "",
      locationId: "",
      courseId: "",
      feePackageId: "",
      managerIds: [],
      maxStudents: 1,
      learningFormat: "offline",
      onlineLink: "",
      programId: "",
      subjectId: "",
      evaluationCriteriaIds: [],
      scoreSheetId: "",
      description: "",
      startDate: "",
      endDate: "",
      weekdays: [],
      schedule_config: [],
      teachers_config: [],
      teacherId: "00000000-0000-0000-0000-000000000000",
      shiftTemplateId: "00000000-0000-0000-0000-000000000000",
    },
  });

  const { data: locations } = useQuery({ queryKey: ["/api/locations"], staleTime: STATIC_STALE_TIME });
  const { data: courses } = useQuery({ queryKey: ["/api/courses"], staleTime: STATIC_STALE_TIME });
  const { data: subjects } = useQuery<any[]>({ queryKey: ["/api/subjects"], staleTime: STATIC_STALE_TIME });
  const { data: scoreSheets } = useQuery<any[]>({ queryKey: ["/api/score-sheets"] });
  const { data: programs } = useQuery({ queryKey: ["/api/course-programs"], staleTime: STATIC_STALE_TIME });
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

  const studentListUrl = (() => {
    const params = new URLSearchParams({
      minimal: "true",
      limit: "200",
    });
    if (selectedLocationId) params.set("locationId", selectedLocationId);
    if (debouncedStudentSearch.trim()) {
      params.set("searchTerm", debouncedStudentSearch.trim());
    }
    return `/api/students?${params.toString()}`;
  })();

  const { data: studentsData } = useQuery<any[]>({
    queryKey: [studentListUrl],
    queryFn: async () => {
      const response = await fetch(studentListUrl, { credentials: "include" });
      if (!response.ok) throw new Error("Không thể tải danh sách học viên");
      const data = await response.json();
      return Array.isArray(data) ? data : (data?.students ?? []);
    },
    enabled: !!selectedLocationId,
    staleTime: STATIC_STALE_TIME,
  });

  const filteredShifts = Array.isArray(shifts)
    ? shifts.filter((s) => String(s.locationId) === String(selectedLocationId))
    : [];
  const filteredClassrooms = Array.isArray(classrooms)
    ? classrooms.filter((r) => String(r.locationId) === String(selectedLocationId))
    : [];

  const { fields: teacherFields, append: appendTeacher, remove: removeTeacher } = useFieldArray({
    control: form.control,
    name: "teachers_config",
  });

  const selectedWeekdays = form.watch("weekdays") || [];
  const scheduleConfig = form.watch("schedule_config") || [];
  const teachersConfig = form.watch("teachers_config") || [];
  const selectedFeePackageId = form.watch("feePackageId");
  const watchedStartDate = form.watch("startDate");
  const watchedEndDate = form.watch("endDate");

  useEffect(() => {
    if (!selectedFeePackageId || !feePackages) return;
    const pkg = feePackages.find((p: any) => String(p.id) === String(selectedFeePackageId));
    if (pkg && pkg.sessions) {
      const numSessions = Math.round(Number(pkg.sessions));
      if (numSessions > 0) {
        setEndType("sessions");
        setSessionCount(String(numSessions));
      }
    }
  }, [selectedFeePackageId, feePackages]);

  // Live conflict check (debounced 1s) whenever schedule/teacher/date changes
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
        });
        const { conflicts } = await res.json();
        setLiveConflicts(conflicts || []);
      } catch { setLiveConflicts([]); }
      finally { setIsLiveChecking(false); }
    }, 1000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(scheduleConfig), JSON.stringify(teachersConfig), watchedStartDate, watchedEndDate, endType, sessionCount]);

  useEffect(() => {
    setSelectedStudentId("");
    setStudentSearch("");
    setDebouncedStudentSearch("");
  }, [selectedLocationId]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedStudentSearch(studentSearch), 250);
    return () => clearTimeout(timer);
  }, [studentSearch]);

  useEffect(() => {
    const currentConfig = form.getValues("schedule_config") || [];
    const newConfig = selectedWeekdays.map((day: number) => {
      const existing = currentConfig.find((c: any) => c.weekday === day);
      if (existing) return existing;
      return { weekday: day, shifts: [{ shift_template_id: "", room_id: "" }] };
    });
    form.setValue("schedule_config", newConfig);
  }, [selectedWeekdays, form]);

  const filteredStudents = Array.isArray(studentsData)
    ? [...studentsData.filter((s: any) => {
        const q = normalizeSearchText(studentSearch);
        if (!q) return true;
        return (
          normalizeSearchText(s.fullName).includes(q) ||
          normalizeSearchText(s.code).includes(q)
        );
      })].sort((a: any, b: any) => {
        const aActive = a.accountStatus !== "Không hoạt động";
        const bActive = b.accountStatus !== "Không hoạt động";
        if (aActive === bActive) return 0;
        return aActive ? -1 : 1;
      })
    : [];

  const selectedStudent = Array.isArray(studentsData)
    ? studentsData.find((s: any) => s.id === selectedStudentId)
    : null;

  const handleStudentSelect = async (student: any) => {
    setSelectedStudentId(student.id);
    const baseName = student.fullName;
    let autoCode = `GS-${baseName}`;
    let counter = 1;
    try {
      while (true) {
        const res = await fetch(`/api/classes/check-code?code=${encodeURIComponent(autoCode)}`);
        const data = await res.json();
        if (!data.exists) break;
        autoCode = `GS${counter}-${baseName}`;
        counter++;
      }
    } catch {}
    form.setValue("classCode", autoCode);
    form.setValue("name", autoCode);
    setStudentSearch("");
  };

  const { createClassMutation } = useClassMutations();

  const getAllShiftsList = () => {
    const list: { key: string; label: string }[] = [];
    scheduleConfig.forEach((day: any) => {
      const dayLabel = WEEKDAYS.find((w) => w.value === day.weekday)?.label;
      day.shifts.forEach((s: any, idx: number) => {
        const shiftName =
          shifts?.find((st: any) => st.id === s.shift_template_id)?.name || `Ca ${idx + 1}`;
        list.push({ key: `${day.weekday}_shift${idx}`, label: `${dayLabel}-${shiftName}` });
      });
    });
    return list;
  };

  const nextStep = async () => {
    if (step === 1) {
      if (!selectedStudentId) {
        return toast({ title: "Thiếu thông tin", description: "Vui lòng chọn học viên", variant: "destructive" });
      }
      const fields = ["name", "locationId", "courseId", "managerIds", "feePackageId", "learningFormat"];
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
            return toast({ title: "Mã lớp bị trùng", description: `"${classCode}" đã được sử dụng.`, variant: "destructive" });
          }
        } catch {}
      }
      if (!form.getValues("startDate")) {
        form.setValue("startDate", new Date().toISOString().split("T")[0]);
      }
    }
    if (step === 2) {
      const fieldsToValidate: any[] = ["weekdays", "startDate", "schedule_config", "teachers_config"];
      if (endType === "date") fieldsToValidate.push("endDate");
      const isValid = await form.trigger(fieldsToValidate);
      if (endType === "sessions" && (!sessionCount || Number(sessionCount) < 1)) {
        return toast({ title: "Thiếu thông tin", description: "Vui lòng nhập số buổi học hợp lệ", variant: "destructive" });
      }
      if (!isValid) {
        return toast({ title: "Thiếu thông tin", description: "Vui lòng hoàn tất cấu hình lịch học và giáo viên", variant: "destructive" });
      }
      // Check room/teacher conflicts before advancing
      setIsCheckingStep2(true);
      try {
        const values = form.getValues();
        const res = await apiRequest("POST", "/api/classes/preview-conflicts", {
          startDate: values.startDate,
          endDate: values.endDate,
          endType,
          sessionCount: endType === "sessions" ? Number(sessionCount) : undefined,
          schedule_config: values.schedule_config,
          teachers_config: values.teachers_config,
        });
        const { conflicts } = await res.json();
        if (conflicts?.length > 0) {
          setStep2Conflicts(conflicts);
          return;
        }
      } catch {
        // If check fails, allow proceeding
      } finally {
        setIsCheckingStep2(false);
      }
    }
    setStep((s) => s + 1);
  };

  const prevStep = () => setStep((s) => s - 1);

  const onSubmit = (data: any) => {
    const valOrNull = (val: string | undefined | null) =>
      val && val.trim() !== "" ? val : null;
    const submitData = {
      ...data,
      classType: "tutor",
      maxStudents: 1,
      weekdays: data.weekdays.map(Number),
      managerIds: data.managerIds || [],
      teacherIds: [...new Set((data.teachers_config || []).map((t: any) => t.teacher_id))],
      shiftTemplateId:
        data.schedule_config[0]?.shifts[0]?.shift_template_id ||
        "00000000-0000-0000-0000-000000000000",
      endType,
      sessionCount: endType === "sessions" ? Number(sessionCount) : undefined,
      color: selectedColor,
      programId: valOrNull(data.programId),
      courseId: valOrNull(data.courseId),
      feePackageId: valOrNull(data.feePackageId),
      scoreSheetId: valOrNull(data.scoreSheetId),
      subjectId: valOrNull(data.subjectId),
      evaluationCriteriaIds:
        data.evaluationCriteriaIds?.length > 0 ? data.evaluationCriteriaIds : null,
    };
    createClassMutation.mutate(submitData, {
      onSuccess: async (cls: any) => {
        if (selectedStudentId) {
          try {
            await apiRequest("POST", `/api/classes/${cls.id}/schedule-students`, {
              configs: [{
                studentId: selectedStudentId,
                startDate: submitData.startDate,
                endType: endType === "date" ? "date" : "count",
                endDate: endType === "date" ? submitData.endDate : undefined,
                totalSessions: endType === "sessions" ? Number(sessionCount) : undefined,
                shiftType: "all",
                packageId: submitData.feePackageId || null,
              }],
            });
          } catch (err) {
            console.error("Auto-schedule student failed:", err);
          }
        }
        setLocation(`/classes/${cls.id}?tab=schedule`);
      },
    });
  };

  const handleFinalSubmit = async () => {
    const isValid = await form.trigger();
    if (!isValid) {
      toast({ title: "Lỗi", description: "Vui lòng kiểm tra lại thông tin.", variant: "destructive" });
      return;
    }
    onSubmit(form.getValues());
  };

  return (
    <DashboardLayout>
      <ConflictDetailSheet
        open={!!conflictDetail}
        conflicts={conflictDetail?.conflicts || []}
        title={conflictDetail?.title}
        onClose={() => setConflictDetail(null)}
      />
      <ConflictWarningDialog
        conflicts={step2Conflicts}
        mode="confirm"
        confirmLabel="Vẫn tiếp tục"
        onConfirm={() => {
          setStep2Conflicts([]);
          setStep((s) => s + 1);
        }}
        onClose={() => setStep2Conflicts([])}
      />
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Tạo Lớp Gia sư (1-1)</h1>
          <p className="text-muted-foreground">Thiết lập lớp học kèm riêng lẻ cho một học viên</p>
        </div>

        {/* Progress Bar */}
        <div className="flex items-center justify-between relative px-2">
          {STEPS.map((s) => (
            <div key={s.id} className="flex flex-col items-center gap-2 z-10">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all",
                  step >= s.id
                    ? "bg-purple-600 text-white shadow-lg"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {step > s.id ? <Check className="h-5 w-5" /> : s.id}
              </div>
              <span
                className={cn(
                  "text-xs font-medium",
                  step === s.id ? "text-purple-600" : "text-muted-foreground"
                )}
              >
                {s.name}
              </span>
            </div>
          ))}
          <div className="absolute top-5 left-0 w-full h-0.5 bg-muted -z-0" />
          <div
            className="absolute top-5 left-0 h-0.5 bg-purple-600 transition-all duration-300 -z-0"
            style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }}
          />
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card className="border-border shadow-md">
              <CardContent className="pt-6">
                {/* ─── STEP 1 ─── */}
                {step === 1 && (
                  <div className="space-y-6">
                    {/* Row 1: Cơ sở + Học viên */}
                    <div className="grid grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="locationId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cơ sở <span className="text-destructive">*</span></FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger><SelectValue placeholder="Chọn cơ sở" /></SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {(locations as any[])?.map((l: any) => (
                                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="space-y-2">
                        <Label>Học viên <span className="text-destructive">*</span></Label>
                        {selectedStudent ? (
                          <div className="flex items-center gap-3 border rounded-md px-3 h-10 bg-background">
                            <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                              <User className="h-3.5 w-3.5 text-purple-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{selectedStudent.fullName}</p>
                            </div>
                            <p className="text-xs text-muted-foreground shrink-0">{selectedStudent.code}</p>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive h-6 px-2 shrink-0"
                              onClick={() => setSelectedStudentId("")}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="relative">
                            <Input
                              placeholder={selectedLocationId ? "Tìm theo tên hoặc mã học viên..." : "Chọn cơ sở trước"}
                              value={studentSearch}
                              disabled={!selectedLocationId}
                              onChange={(e) => setStudentSearch(e.target.value)}
                              onFocus={() => setStudentFocused(true)}
                              onBlur={() => setTimeout(() => setStudentFocused(false), 150)}
                            />
                            {studentFocused && filteredStudents.length > 0 && (
                              <div className="absolute z-50 top-full mt-1 left-0 right-0 border rounded-lg bg-background shadow-md overflow-hidden max-h-52 overflow-y-auto">
                                {filteredStudents.slice(0, studentSearch ? 20 : 10).map((s: any) => {
                                  const isInactive = s.accountStatus === "Không hoạt động";
                                  return (
                                    <button
                                      key={s.id}
                                      type="button"
                                      disabled={isInactive}
                                      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors border-b last:border-b-0 ${isInactive ? "opacity-40 cursor-not-allowed" : "hover:bg-purple-50 cursor-pointer"}`}
                                      onClick={() => { if (!isInactive) handleStudentSelect(s); }}
                                    >
                                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                                        <User className="h-3 w-3 text-muted-foreground" />
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <p className="text-sm font-medium">{s.fullName} <span className="text-muted-foreground font-normal">({s.code})</span></p>
                                        {isInactive && <span className="text-amber-500 text-[10px] font-medium">⚠ Không hoạt động</span>}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {studentFocused && studentSearch && filteredStudents.length === 0 && (
                              <p className="text-xs text-muted-foreground mt-1 px-1">Không tìm thấy học viên</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Row 2: Mã lớp, Tên lớp, Hình thức học */}
                    <div className="grid grid-cols-3 gap-6">
                      <FormField
                        control={form.control}
                        name="classCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mã lớp học <span className="text-destructive">*</span></FormLabel>
                            <FormControl><Input {...field} placeholder="VD: GS-001" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tên lớp <span className="text-destructive">*</span></FormLabel>
                            <FormControl><Input placeholder="VD: Lớp GS - Nguyễn Văn A" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="learningFormat"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Hình thức học <span className="text-destructive">*</span></FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger><SelectValue placeholder="Chọn hình thức học" /></SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="offline">Offline</SelectItem>
                                <SelectItem value="online">Online</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Row 3: Khóa học, Gói học phí, Quản lý lớp */}
                    <div className="grid grid-cols-3 gap-6">
                      <FormField
                        control={form.control}
                        name="courseId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Khóa học <span className="text-destructive">*</span></FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger><SelectValue placeholder="Chọn khóa học" /></SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {(courses as any[])?.map((c: any) => (
                                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="feePackageId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Gói học phí {selectedCourseId ? <span className="text-destructive">*</span> : ""}
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              disabled={!selectedCourseId}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={selectedCourseId ? "Chọn gói học phí" : "Chọn khóa học trước"} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {feePackages?.map((p: any) => (
                                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="managerIds"
                        render={({ field }) => (
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
                        )}
                      />
                    </div>

                    {/* Row 4: Online link (conditional) */}
                    {selectedLearningFormat === "online" && (
                      <div className="grid grid-cols-3 gap-6">
                        <FormField
                          control={form.control}
                          name="onlineLink"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Đường link <span className="text-destructive">*</span></FormLabel>
                              <FormControl><Input placeholder="VD: https://meet.google.com/..." {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}

                    {/* Optional info */}
                    <div className="border-t pt-6">
                      <p className="text-sm font-medium text-muted-foreground mb-4">Thông tin bổ sung</p>
                      <div className="grid grid-cols-3 gap-6">
                        <FormField
                          control={form.control}
                          name="programId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Chương trình</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger><SelectValue placeholder="Chọn chương trình" /></SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {(programs as any[])?.map((p: any) => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="scoreSheetId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Bảng điểm</FormLabel>
                              <Select
                                onValueChange={(val) => field.onChange(val === "none" ? "" : val)}
                                value={field.value || "none"}
                              >
                                <FormControl>
                                  <SelectTrigger><SelectValue placeholder="Chọn bảng điểm (tuỳ chọn)" /></SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="none">— Không chọn —</SelectItem>
                                  {scoreSheets?.map((s: any) => (
                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="subjectId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Bộ môn</FormLabel>
                              <Select
                                onValueChange={(val) => field.onChange(val === "none" ? "" : val)}
                                value={field.value || "none"}
                              >
                                <FormControl>
                                  <SelectTrigger><SelectValue placeholder="Chọn bộ môn (tuỳ chọn)" /></SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="none">— Không chọn —</SelectItem>
                                  {subjects?.map((s: any) => (
                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="evaluationCriteriaIds"
                          render={({ field }) => (
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
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem className="col-span-2">
                              <FormLabel>Mô tả</FormLabel>
                              <FormControl>
                                <Textarea placeholder="Thông tin thêm về lớp học..." className="resize-none" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── STEP 2 ─── */}
                {step === 2 && (
                  <div className="space-y-8">
                    {/* Time range */}
                    <div className="pb-6 border-b">
                      <div className="grid grid-cols-3 gap-6">
                        <FormField
                          control={form.control}
                          name="startDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Ngày bắt đầu <span className="text-destructive">*</span></FormLabel>
                              <FormControl><Input type="date" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
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
                          <FormField
                            control={form.control}
                            name="endDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Ngày kết thúc <span className="text-destructive">*</span></FormLabel>
                                <FormControl><Input type="date" {...field} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
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

                    {/* Weekday selection */}
                    <div className="space-y-4">
                      <Label className="text-base font-semibold">PHẦN 1: CHỌN CHU KỲ THỨ</Label>
                      <div className="flex flex-wrap gap-6 p-4 bg-muted/30 rounded-lg border border-border">
                        {WEEKDAYS.map((day) => (
                          <div key={day.value} className="flex items-center gap-2">
                            <Checkbox
                              id={`day-${day.value}`}
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
                            <Label htmlFor={`day-${day.value}`} className="cursor-pointer font-medium">
                              {day.label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Schedule + Teacher side by side */}
                    <div className="grid grid-cols-2 gap-6 items-start">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-semibold">PHẦN 2: CẤU HÌNH CA THEO THỨ</Label>
                          {isLiveChecking && (
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" /> Đang kiểm tra...
                            </span>
                          )}
                        </div>
                        {!isLiveChecking && liveConflicts.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setConflictDetail({ conflicts: liveConflicts, title: `Tất cả ${liveConflicts.length} buổi trùng lịch` })}
                            className="w-full flex items-start gap-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-md px-3 py-2 hover:bg-orange-100 transition-colors text-left cursor-pointer"
                          >
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>
                              Phát hiện trùng lịch:{" "}
                              {liveConflicts.filter(c => c.type === "room").length > 0 && <><strong>{liveConflicts.filter(c => c.type === "room").length} buổi trùng phòng</strong>{liveConflicts.filter(c => c.type === "teacher").length > 0 ? ", " : ""}</>}
                              {liveConflicts.filter(c => c.type === "teacher").length > 0 && <strong>{liveConflicts.filter(c => c.type === "teacher").length} buổi trùng giáo viên</strong>}
                              . <span className="underline">Nhấn để xem chi tiết →</span>
                            </span>
                          </button>
                        )}
                        {selectedWeekdays.length > 0 ? (
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
                                    <div
                                      key={shiftIdx}
                                      className="grid grid-cols-12 p-3 items-center gap-4 group hover:bg-accent/5 transition-colors"
                                    >
                                      <div className="col-span-2 font-bold text-purple-600">
                                        {shiftIdx === 0
                                          ? WEEKDAYS.find((w) => w.value === dayConfig.weekday)?.label
                                          : ""}
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
                                          triggerClassName="h-9"
                                        />
                                      </div>
                                      <div className="col-span-4">
                                        {(() => {
                                          const roomName = filteredClassrooms?.find((r: any) => r.id === shift.room_id)?.name;
                                          const roomConflictCount = shift.room_id && roomName ? liveConflicts.filter(c => c.type === "room" && c.resourceName === roomName).length : 0;
                                          return (
                                            <>
                                              <Select
                                                value={shift.room_id}
                                                onValueChange={(val) => {
                                                  const newConfig = [...scheduleConfig];
                                                  newConfig[dayIdx].shifts[shiftIdx].room_id = val;
                                                  form.setValue("schedule_config", newConfig);
                                                }}
                                              >
                                                <SelectTrigger className={cn("h-9", roomConflictCount > 0 && "border-orange-400 bg-orange-50")}>
                                                  <SelectValue placeholder="Chọn phòng (không bắt buộc)" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {filteredClassrooms?.map((r: any) => (
                                                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                              {roomConflictCount > 0 && (
                                                <button
                                                  type="button"
                                                  onClick={() => setConflictDetail({
                                                    conflicts: liveConflicts.filter(c => c.type === "room" && c.resourceName === roomName),
                                                    title: `${roomName}: ${roomConflictCount} buổi trùng phòng`
                                                  })}
                                                  className="text-[11px] text-orange-600 flex items-center gap-1 mt-1 hover:underline"
                                                >
                                                  <AlertTriangle className="h-3 w-3 shrink-0" /> Trùng {roomConflictCount} buổi →
                                                </button>
                                              )}
                                            </>
                                          );
                                        })()}
                                      </div>
                                      <div className="col-span-2 flex justify-center gap-2">
                                        {shiftIdx === 0 ? (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                                            onClick={() => {
                                              const newConfig = [...scheduleConfig];
                                              newConfig[dayIdx].shifts.push({ shift_template_id: "", room_id: "" });
                                              form.setValue("schedule_config", newConfig);
                                            }}
                                          >
                                            <Plus className="h-4 w-4" />
                                          </Button>
                                        ) : (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => {
                                              const newConfig = [...scheduleConfig];
                                              newConfig[dayIdx].shifts.splice(shiftIdx, 1);
                                              form.setValue("schedule_config", newConfig);
                                            }}
                                          >
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
                        ) : (
                          <div className="text-center py-8 border-2 border-dashed rounded-lg bg-muted/5">
                            <p className="text-sm text-muted-foreground">Vui lòng chọn thứ ở phần 1 trước.</p>
                          </div>
                        )}
                      </div>

                      {/* Teacher config */}
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-semibold">PHẦN 3: CHỌN GIÁO VIÊN</Label>
                          <Select
                            onValueChange={(val) => {
                              if (!teachersConfig.some((t: any) => t.teacher_id === val)) {
                                appendTeacher({ teacher_id: val, mode: "all", shift_keys: [] });
                              }
                            }}
                          >
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Thêm giáo viên..." />
                            </SelectTrigger>
                            <SelectContent>
                              {[...(staff?.filter((s: any) => {
                                if (!s.assignments) return true;
                                return s.assignments.some((a: any) =>
                                  a.department?.name && a.department.name.toLowerCase().includes("đào tạo")
                                );
                              }) || [])].sort((a: any, b: any) => {
                                const aActive = a.status !== "Không hoạt động";
                                const bActive = b.status !== "Không hoạt động";
                                if (aActive === bActive) return 0;
                                return aActive ? -1 : 1;
                              }).map((s: any) => {
                                const isInactive = s.status === "Không hoạt động";
                                return (
                                  <SelectItem key={s.id} value={s.id} disabled={isInactive} className={isInactive ? "opacity-40" : ""}>
                                    <span className="flex items-center gap-1.5">
                                      <span>{s.fullName}</span>
                                      {s.code && <span className="text-[11px] text-muted-foreground">({s.code})</span>}
                                      {isInactive && <span className="text-amber-500 text-[10px] font-medium">⚠ Không hoạt động</span>}
                                    </span>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-4">
                          {teachersConfig.map((teacher: any, idx: number) => {
                            const staffMember = staff?.find((s: any) => s.id === teacher.teacher_id);
                            const teacherConflictCount = staffMember?.fullName ? liveConflicts.filter(c => c.type === "teacher" && c.resourceName === staffMember.fullName).length : 0;
                            return (
                              <Card key={teacher.teacher_id} className={cn("bg-muted/10 border-dashed", teacherConflictCount > 0 && "border-orange-300")}>
                                <CardContent className="pt-4 space-y-4">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                                        <User className="h-4 w-4 text-purple-600" />
                                      </div>
                                      <span className="font-bold">{staffMember?.fullName}</span>
                                      {teacherConflictCount > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => setConflictDetail({
                                            conflicts: liveConflicts.filter(c => c.type === "teacher" && c.resourceName === staffMember?.fullName),
                                            title: `${staffMember?.fullName}: ${teacherConflictCount} buổi trùng lịch`
                                          })}
                                          className="flex items-center gap-1 text-[11px] text-orange-600 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5 hover:bg-orange-100"
                                        >
                                          <AlertTriangle className="h-3 w-3" /> Trùng {teacherConflictCount} buổi →
                                        </button>
                                      )}
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="text-destructive h-8 px-2"
                                      onClick={() => removeTeacher(idx)}
                                    >
                                      <X className="h-4 w-4 mr-1" /> Gỡ
                                    </Button>
                                  </div>
                                  <div className="flex items-center gap-4 flex-wrap">
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="text-sm font-medium">Loại:</span>
                                      <div className="flex bg-muted p-1 rounded-md text-xs">
                                        {(["all", "specific"] as const).map((mode) => (
                                          <button
                                            key={mode}
                                            type="button"
                                            className={cn(
                                              "px-3 py-1 rounded transition-colors",
                                              teacher.mode === mode
                                                ? "bg-background shadow-sm font-bold"
                                                : "text-muted-foreground"
                                            )}
                                            onClick={() => {
                                              const newConfig = [...teachersConfig];
                                              newConfig[idx].mode = mode;
                                              form.setValue("teachers_config", newConfig);
                                            }}
                                          >
                                            {mode === "all" ? "Tất cả" : "Theo ca"}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    {teacher.mode === "specific" && (
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Chọn ca dạy:</span>
                                        <div className="flex flex-wrap gap-2">
                                          {getAllShiftsList().map((shift) => (
                                            <Badge
                                              key={shift.key}
                                              variant={teacher.shift_keys.includes(shift.key) ? "default" : "outline"}
                                              className={cn(
                                                "cursor-pointer px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                                                !teacher.shift_keys.includes(shift.key) && "bg-background hover:bg-accent"
                                              )}
                                              onClick={() => {
                                                const newConfig = [...teachersConfig];
                                                const currentKeys = [...teacher.shift_keys];
                                                if (currentKeys.includes(shift.key)) {
                                                  newConfig[idx].shift_keys = currentKeys.filter((k: string) => k !== shift.key);
                                                } else {
                                                  newConfig[idx].shift_keys = [...currentKeys, shift.key];
                                                }
                                                form.setValue("teachers_config", newConfig);
                                              }}
                                            >
                                              {shift.label}
                                              {teacher.shift_keys.includes(shift.key) && (
                                                <Check className="ml-1 h-3 w-3" />
                                              )}
                                            </Badge>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                          {teachersConfig.length === 0 && (
                            <div className="text-center py-8 border-2 border-dashed rounded-lg bg-muted/5">
                              <p className="text-sm text-muted-foreground">Chưa có giáo viên nào được chọn.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── STEP 3 ─── */}
                {step === 3 && (
                  <div className="space-y-6">
                    <div className="bg-purple-50 p-6 rounded-xl border border-purple-200">
                      <h3 className="font-bold text-lg mb-4 text-purple-800">Tóm tắt thông tin lớp Gia sư</h3>
                      <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                        <div className="space-y-1">
                          <p className="text-muted-foreground">Học viên</p>
                          <p className="font-semibold">{selectedStudent?.fullName || "—"}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-muted-foreground">Tên lớp</p>
                          <p className="font-semibold">{form.watch("name")}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-muted-foreground">Mã lớp</p>
                          <p className="font-semibold">{form.watch("classCode")}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-muted-foreground">Cơ sở</p>
                          <p className="font-semibold">
                            {(locations as any[])?.find((l: any) => l.id === form.watch("locationId"))?.name}
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 pt-6 border-t border-purple-200 space-y-4">
                        <div className="space-y-2">
                          <p className="text-muted-foreground font-medium">Lịch học:</p>
                          <div className="grid grid-cols-1 gap-2">
                            {scheduleConfig.map((day: any) => (
                              <div
                                key={day.weekday}
                                className="flex items-start gap-4 text-sm bg-white p-2 rounded border"
                              >
                                <span className="font-bold min-w-[40px]">
                                  {WEEKDAYS.find((w) => w.value === day.weekday)?.label}:
                                </span>
                                <div className="flex flex-wrap gap-2">
                                  {day.shifts.map((s: any, i: number) => {
                                    const shiftInfo = shifts?.find((st: any) => st.id === s.shift_template_id);
                                    const roomInfo = classrooms?.find((r: any) => r.id === s.room_id);
                                    return (
                                      <Badge key={i} variant="secondary" className="font-normal">
                                        {shiftInfo?.name} ({shiftInfo?.startTime}-{shiftInfo?.endTime})
                                        {roomInfo ? ` - ${roomInfo.name}` : ""}
                                      </Badge>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-muted-foreground font-medium">Giáo viên:</p>
                          <div className="flex flex-wrap gap-2">
                            {teachersConfig.map((t: any) => (
                              <Badge key={t.teacher_id} variant="outline" className="bg-purple-50 py-1.5">
                                <User className="h-3 w-3 mr-1" />
                                {staff?.find((s: any) => s.id === t.teacher_id)?.fullName}
                                <span className="ml-1 text-[10px] opacity-70">
                                  ({t.mode === "all" ? "Tất cả" : "Theo ca"})
                                </span>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-5 border rounded-xl space-y-4">
                      <p className="text-muted-foreground text-sm">
                        Hệ thống sẽ tự động tạo lịch học và ghi danh học viên vào lớp.
                      </p>
                      <div className="space-y-3">
                        <p className="text-sm font-medium">Chọn màu hiển thị cho lịch học:</p>
                        <div className="flex flex-wrap gap-2.5">
                          {CLASS_PALETTE.map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setSelectedColor(color)}
                              className="w-8 h-8 rounded-full border-2 transition-all"
                              style={{
                                backgroundColor: color,
                                borderColor: selectedColor === color ? "#1e293b" : "transparent",
                                transform: selectedColor === color ? "scale(1.2)" : "scale(1)",
                                boxShadow:
                                  selectedColor === color
                                    ? "0 0 0 2px white, 0 0 0 4px #1e293b"
                                    : "none",
                              }}
                            />
                          ))}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <div className="w-5 h-5 rounded-full border" style={{ backgroundColor: selectedColor }} />
                          <span>Màu đã chọn sẽ hiển thị cho lớp này trong lịch học</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={step === 1 ? () => setLocation("/classes") : prevStep}
                className="gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                {step === 1 ? "Hủy bỏ" : "Quay lại"}
              </Button>
              {step < 3 ? (
                <Button type="button" onClick={nextStep} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white" disabled={isCheckingStep2}>
                  {isCheckingStep2 ? "Đang kiểm tra..." : "Tiếp theo"}
                  {isCheckingStep2 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleFinalSubmit}
                  disabled={createClassMutation.isPending}
                  className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {createClassMutation.isPending ? "Đang tạo..." : "Xác nhận & Tạo lịch"}
                  <Check className="h-4 w-4" />
                </Button>
              )}
            </div>
          </form>
        </Form>
      </div>
    </DashboardLayout>
  );
}
