import { useState, useEffect } from "react";
import { z } from "zod";
import { useLocation } from "wouter";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertClassSchema } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useClassMutations } from "@/hooks/use-class-mutations";
import { ChevronRight, ChevronLeft, Check, Loader2, Plus, X, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";

const STEPS = [
  { id: 1, name: "Thông tin cơ bản" },
  { id: 2, name: "Lịch học" },
  { id: 3, name: "Xác nhận" }
];

const WEEKDAYS = [
  { value: 1, label: "T2" },
  { value: 2, label: "T3" },
  { value: 3, label: "T4" },
  { value: 4, label: "T5" },
  { value: 5, label: "T6" },
  { value: 6, label: "T7" },
  { value: 0, label: "CN" }
];

const CLASS_PALETTE = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#64748b",
  "#0ea5e9", "#10b981", "#f59e0b", "#a855f7", "#06b6d4",
];

export function CreateClass() {
  const [step, setStep] = useState(1);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [endType, setEndType] = useState<"date" | "sessions">("date");
  const [sessionCount, setSessionCount] = useState<string>("10");
  const [selectedColor, setSelectedColor] = useState<string>(CLASS_PALETTE[5]);

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
          room_id: z.string().optional()
        })).min(1, "Vui lòng thêm ít nhất một ca học")
      })).min(1, "Lịch học là bắt buộc"),
      teachers_config: z.array(z.object({
        teacher_id: z.string().min(1, "Vui lòng chọn giáo viên"),
        mode: z.enum(["all", "specific"]),
        shift_keys: z.array(z.string())
      })).min(1, "Giáo viên là bắt buộc"),
    })),
    defaultValues: {
      classCode: `CLS-${Date.now().toString().slice(-6)}`,
      name: "",
      locationId: "",
      programId: "",
      courseId: "",
      managerIds: [] as string[],
      feePackageId: "",
      scoreSheetId: "",
      maxStudents: 20,
      learningFormat: "offline",
      onlineLink: "",
      description: "",
      status: "planning",
      subjectId: "",
      evaluationCriteriaIds: [] as string[],
      weekdays: [],
      startDate: "",
      endDate: "",
      // New structure for Step 2
      schedule_config: [], // Array of { weekday, shifts: [{ shift_template_id, room_id }] }
      teachers_config: [], // Array of { teacher_id, mode: "all" | "specific", shift_keys: [] }
      // Legacy fields (kept for schema compatibility if needed, but we'll use new ones)
      teacherId: "00000000-0000-0000-0000-000000000000",
      shiftTemplateId: "00000000-0000-0000-0000-000000000000"
    }
  });

  const { data: locations } = useQuery({ queryKey: ["/api/locations"] });
  const { data: programs } = useQuery({ queryKey: ["/api/course-programs"] });
  const { data: courses } = useQuery({ queryKey: ["/api/courses"] });
  const { data: subjects } = useQuery<any[]>({ queryKey: ["/api/subjects"] });
  const { data: evaluationCriteriaList } = useQuery<any[]>({ queryKey: ["/api/evaluation-criteria"] });
  
  const selectedLocationId = form.watch("locationId");
  const selectedCourseId = form.watch("courseId");
  const selectedLearningFormat = form.watch("learningFormat");
  
  const { data: staff } = useQuery<any[]>({ 
      queryKey: [selectedLocationId ? `/api/staff?locationId=${selectedLocationId}&minimal=true` : "/api/staff?minimal=true"],
    enabled: !!selectedLocationId 
  });
  const { data: shifts } = useQuery<any[]>({ 
    queryKey: ["/api/shift-templates"],
    enabled: !!selectedLocationId 
  });
  const { data: classrooms } = useQuery<any[]>({
    queryKey: ["/api/classrooms"],
    enabled: !!selectedLocationId
  });
  const { data: feePackages } = useQuery<any[]>({
    queryKey: [selectedCourseId ? `/api/courses/${selectedCourseId}/fee-packages` : null],
    enabled: !!selectedCourseId
  });
  const { data: scoreSheets } = useQuery<any[]>({ queryKey: ["/api/score-sheets"] });

  useEffect(() => {
    if (form.formState.errors) {
      console.log("Form errors:", form.formState.errors);
    }
  }, [form.formState.errors]);

  const { fields: scheduleFields, append: appendSchedule, remove: removeSchedule } = useFieldArray({
    control: form.control,
    name: "schedule_config"
  });

  const { fields: teacherFields, append: appendTeacher, remove: removeTeacher } = useFieldArray({
    control: form.control,
    name: "teachers_config"
  });

  const selectedWeekdays = form.watch("weekdays") || [];
  const scheduleConfig = form.watch("schedule_config") || [];
  const teachersConfig = form.watch("teachers_config") || [];
  const selectedFeePackageId = form.watch("feePackageId");

  // Auto-set endType + sessionCount when fee package changes
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

  // Filter shifts and classrooms by locationId on the client side
  // Ensure shifts and classrooms are arrays before filtering
  // Log data for debugging
  console.log("Selected Location:", selectedLocationId);
  console.log("All Shifts:", shifts);
  console.log("All Classrooms:", classrooms);
  
  const filteredShifts = Array.isArray(shifts) ? shifts.filter(s => String(s.locationId) === String(selectedLocationId)) : [];
  const filteredClassrooms = Array.isArray(classrooms) ? classrooms.filter(r => String(r.locationId) === String(selectedLocationId)) : [];
  
  console.log("Filtered Shifts:", filteredShifts);
  console.log("Filtered Classrooms:", filteredClassrooms);

  // Update schedule_config when weekdays change
  useEffect(() => {
    const currentConfig = form.getValues("schedule_config") || [];
    const newConfig = selectedWeekdays.map(day => {
      const existing = currentConfig.find((c: any) => c.weekday === day);
      if (existing) return existing;
      return { weekday: day, shifts: [{ shift_template_id: "", room_id: "" }] };
    });
    form.setValue("schedule_config", newConfig);
  }, [selectedWeekdays, form]);

  const { createClassMutation } = useClassMutations();

  const nextStep = async () => {
    if (step === 1) {
      const fields = ["name", "locationId", "courseId", "managerIds", "feePackageId", "maxStudents", "learningFormat"];
      const fieldsToValidate: any[] = [...fields];
      if (selectedLearningFormat === "online") {
        fieldsToValidate.push("onlineLink");
      }
      const isValid = await form.trigger(fieldsToValidate);
      if (!isValid) {
        console.log("Step 1 validation failed", form.formState.errors);
        return toast({ title: "Thiếu thông tin", description: "Vui lòng điền đầy đủ các trường bắt buộc", variant: "destructive" });
      }
      // Check class code uniqueness
      const classCode = (form.getValues("classCode") || "").trim();
      if (classCode) {
        try {
          const res = await fetch(`/api/classes/check-code?code=${encodeURIComponent(classCode)}`);
          const data = await res.json();
          if (data.exists) {
            form.setError("classCode", { message: "Mã lớp học này đã tồn tại, vui lòng chọn mã khác" });
            return toast({ title: "Mã lớp bị trùng", description: `"${classCode}" đã được sử dụng. Vui lòng nhập mã khác.`, variant: "destructive" });
          }
        } catch {
          // If check fails, still allow proceeding
        }
      }
      // Auto-fill start date to today if not set
      if (!form.getValues("startDate")) {
        const today = new Date().toISOString().split("T")[0];
        form.setValue("startDate", today);
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
        console.log("Step 2 validation failed", form.formState.errors);
        return toast({ title: "Thiếu thông tin", description: "Vui lòng hoàn tất cấu hình lịch học và giáo viên", variant: "destructive" });
      }
    }
    setStep(s => s + 1);
  };

  const prevStep = () => setStep(s => s - 1);

    const onSubmit = (data: any) => {
      console.log("Form submit triggered with data:", data);
      const valOrNull = (val: string | undefined | null) => (val && val.trim() !== "" ? val : null);
      const submitData = {
        ...data,
        weekdays: data.weekdays.map(Number),
        managerIds: data.managerIds || [],
        teacherIds: [...new Set((data.teachers_config || []).map((t: any) => t.teacher_id))],
        shiftTemplateId: data.schedule_config[0]?.shifts[0]?.shift_template_id || "00000000-0000-0000-0000-000000000000",
        endType,
        sessionCount: endType === "sessions" ? Number(sessionCount) : undefined,
        color: selectedColor,
        programId: valOrNull(data.programId),
        courseId: valOrNull(data.courseId),
        feePackageId: valOrNull(data.feePackageId),
        scoreSheetId: valOrNull(data.scoreSheetId),
        subjectId: valOrNull(data.subjectId),
        evaluationCriteriaIds: data.evaluationCriteriaIds?.length > 0 ? data.evaluationCriteriaIds : null,
      };
      console.log("Submitting data:", submitData);
      createClassMutation.mutate(submitData, { onSuccess: () => setLocation("/classes") });
    };

    const handleFinalSubmit = async () => {
      console.log("handleFinalSubmit triggered");
      // Trigger validation for all fields
      const isValid = await form.trigger();
      
      if (!isValid) {
        console.log("Validation failed before final submit:", form.formState.errors);
        
        // Detailed logging of errors to help debug
        Object.keys(form.formState.errors).forEach(key => {
          console.log(`Field ${key} error:`, form.formState.errors[key as keyof typeof form.formState.errors]);
        });

        toast({
          title: "Lỗi",
          description: "Vui lòng kiểm tra lại thông tin. Một số trường chưa hợp lệ.",
          variant: "destructive"
        });
        return;
      }
      
      console.log("Form is valid, calling onSubmit");
      const values = form.getValues();
      onSubmit(values);
    };

  // Helper to get all shifts for teacher config
  const getAllShiftsList = () => {
    const list: { key: string, label: string }[] = [];
    scheduleConfig.forEach((day: any) => {
      const dayLabel = WEEKDAYS.find(w => w.value === day.weekday)?.label;
      day.shifts.forEach((s: any, idx: number) => {
        const shiftName = shifts?.find((st: any) => st.id === s.shift_template_id)?.name || `Ca ${idx + 1}`;
        list.push({
          key: `${day.weekday}_shift${idx}`,
          label: `${dayLabel}-${shiftName}`
        });
      });
    });
    return list;
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Tạo lớp học mới</h1>
          <p className="text-muted-foreground">Thiết kế khung lịch học cho lớp mới</p>
        </div>

        {/* Progress Bar */}
        <div className="flex items-center justify-between relative px-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex flex-col items-center gap-2 z-10">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all",
                step >= s.id ? "bg-primary text-primary-foreground shadow-lg" : "bg-muted text-muted-foreground"
              )}>
                {step > s.id ? <Check className="h-5 w-5" /> : s.id}
              </div>
              <span className={cn("text-xs font-medium", step === s.id ? "text-primary" : "text-muted-foreground")}>
                {s.name}
              </span>
            </div>
          ))}
          <div className="absolute top-5 left-0 w-full h-0.5 bg-muted -z-0" />
          <div 
            className="absolute top-5 left-0 h-0.5 bg-primary transition-all duration-300 -z-0" 
            style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }} 
          />
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card className="border-border shadow-md">
              <CardContent className="pt-6">
                {step === 1 && (
                  <div className="space-y-6">
                    {/* Thông tin bắt buộc */}
                    <div className="grid grid-cols-3 gap-6">
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
                                {locations?.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="classCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mã lớp học <span className="text-destructive">*</span></FormLabel>
                            <FormControl><Input {...field} data-testid="input-class-code" /></FormControl>
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
                            <FormControl><Input placeholder="VD: Lớp Tiếng Anh Giao Tiếp A1" {...field} data-testid="input-class-name" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
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
                                {courses?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
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
                            <FormLabel>Gói học phí {selectedCourseId ? <span className="text-destructive">*</span> : ""}</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!selectedCourseId}>
                              <FormControl>
                                <SelectTrigger><SelectValue placeholder={selectedCourseId ? "Chọn gói học phí" : "Chọn khóa học trước"} /></SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {feePackages?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
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
                                options={(staff || []).map((s: any) => ({ value: s.id, label: s.fullName, sublabel: s.code }))}
                                value={field.value || []}
                                onChange={field.onChange}
                                placeholder={selectedLocationId ? "Chọn nhân sự" : "Chọn cơ sở trước"}
                                searchPlaceholder="Tìm kiếm nhân sự..."
                                disabled={!selectedLocationId}
                                data-testid="select-manager"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="maxStudents"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Số học viên tối đa <span className="text-destructive">*</span></FormLabel>
                            <FormControl><Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value))} /></FormControl>
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
                      {selectedLearningFormat === "online" && (
                        <FormField
                          control={form.control}
                          name="onlineLink"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Đường link <span className="text-destructive">*</span></FormLabel>
                              <FormControl><Input placeholder="VD: https://meet.google.com/..." {...field} data-testid="input-online-link" /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>

                    {/* Thông tin bổ sung */}
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
                                  {programs?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
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
                              <Select onValueChange={(val) => field.onChange(val === "none" ? "" : val)} value={field.value || "none"}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-score-sheet"><SelectValue placeholder="Chọn bảng điểm (tuỳ chọn)" /></SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="none">— Không chọn —</SelectItem>
                                  {scoreSheets?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
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
                              <Select onValueChange={(val) => field.onChange(val === "none" ? "" : val)} value={field.value || "none"}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-subject"><SelectValue placeholder="Chọn bộ môn (tuỳ chọn)" /></SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="none">— Không chọn —</SelectItem>
                                  {subjects?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
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
                                  data-testid="select-evaluation-criteria"
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
                              <FormControl><Textarea placeholder="Thông tin thêm về lớp học..." className="resize-none" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-8">
                    {/* Time Range */}
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

                    {/* Weekday Selection */}
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
                                  form.setValue("weekdays", current.filter(v => v !== day.value));
                                }
                                // Force validation
                                form.trigger("weekdays");
                              }}
                            />
                            <Label htmlFor={`day-${day.value}`} className="cursor-pointer font-medium">{day.label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Schedule Configuration Table */}
                    {selectedWeekdays.length > 0 && (
                      <div className="space-y-4">
                        <Label className="text-base font-semibold">PHẦN 2: CẤU HÌNH CA THEO THỨ</Label>
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
                                  <div key={shiftIdx} className="grid grid-cols-12 p-3 items-center gap-4 group hover:bg-accent/5 transition-colors">
                                    <div className="col-span-2 font-bold text-primary">
                                      {shiftIdx === 0 ? WEEKDAYS.find(w => w.value === dayConfig.weekday)?.label : ""}
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
                                        <SelectTrigger className="h-9">
                                          <SelectValue placeholder="Chọn ca" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {filteredShifts?.map((s: any) => (
                                            <SelectItem key={s.id} value={s.id}>
                                              {s.name} ({s.startTime}-{s.endTime})
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
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
                                        <SelectTrigger className="h-9">
                                          <SelectValue placeholder="Chọn phòng (không bắt buộc)" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {filteredClassrooms?.map((r: any) => (
                                            <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="col-span-2 flex justify-center gap-2">
                                      {shiftIdx === 0 ? (
                                        <Button 
                                          type="button" 
                                          variant="ghost" 
                                          size="icon" 
                                          className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
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
                      </div>
                    )}

                    {/* Teacher Configuration */}
                    <div className="space-y-6 pt-6 border-t">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold">PHẦN 3: CHỌN GIÁO VIÊN</Label>
                        <Select 
                          onValueChange={(val) => {
                            if (!teachersConfig.some((t: any) => t.teacher_id === val)) {
                              appendTeacher({ teacher_id: val, mode: "all", shift_keys: [] });
                            }
                          }}
                        >
                          <SelectTrigger className="w-[280px]">
                            <SelectValue placeholder="Thêm giáo viên..." />
                          </SelectTrigger>
                          <SelectContent>
                            {staff?.filter(s => {
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

                      <div className="space-y-4">
                        {teachersConfig.map((teacher: any, idx: number) => {
                          const staffMember = staff?.find(s => s.id === teacher.teacher_id);
                          return (
                            <Card key={teacher.teacher_id} className="bg-muted/10 border-dashed">
                              <CardContent className="pt-4 space-y-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                      <User className="h-4 w-4 text-primary" />
                                    </div>
                                    <span className="font-bold">{staffMember?.fullName}</span>
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
                                      <button
                                        type="button"
                                        className={cn(
                                          "px-3 py-1 rounded transition-colors",
                                          teacher.mode === "all" ? "bg-background shadow-sm font-bold" : "text-muted-foreground"
                                        )}
                                        onClick={() => {
                                          const newConfig = [...teachersConfig];
                                          newConfig[idx].mode = "all";
                                          form.setValue("teachers_config", newConfig);
                                        }}
                                      >
                                        Tất cả
                                      </button>
                                      <button
                                        type="button"
                                        className={cn(
                                          "px-3 py-1 rounded transition-colors",
                                          teacher.mode === "specific" ? "bg-background shadow-sm font-bold" : "text-muted-foreground"
                                        )}
                                        onClick={() => {
                                          const newConfig = [...teachersConfig];
                                          newConfig[idx].mode = "specific";
                                          form.setValue("teachers_config", newConfig);
                                        }}
                                      >
                                        Theo ca
                                      </button>
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
                                                newConfig[idx].shift_keys = currentKeys.filter(k => k !== shift.key);
                                              } else {
                                                newConfig[idx].shift_keys = [...currentKeys, shift.key];
                                              }
                                              form.setValue("teachers_config", newConfig);
                                            }}
                                          >
                                            {shift.label}
                                            {teacher.shift_keys.includes(shift.key) && <Check className="ml-1 h-3 w-3" />}
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
                )}

                {step === 3 && (
                  <div className="space-y-6">
                    <div className="bg-primary/5 p-6 rounded-xl border border-primary/10">
                      <h3 className="font-bold text-lg mb-4 text-primary">Tóm tắt thông tin lớp học</h3>
                      <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                        <div className="space-y-1">
                          <p className="text-muted-foreground">Tên lớp</p>
                          <p className="font-semibold">{form.watch("name")}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-muted-foreground">Mã lớp</p>
                          <p className="font-semibold">{form.watch("classCode")}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-muted-foreground">Thời gian</p>
                          <p className="font-semibold">{form.watch("start_date")} đến {form.watch("end_date")}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-muted-foreground">Cơ sở</p>
                          <p className="font-semibold">{locations?.find((l: any) => l.id === form.watch("locationId"))?.name}</p>
                        </div>
                      </div>

                      <div className="mt-6 pt-6 border-t border-primary/10 space-y-4">
                        <div className="space-y-2">
                          <p className="text-muted-foreground font-medium">Lịch học chi tiết:</p>
                          <div className="grid grid-cols-1 gap-2">
                            {scheduleConfig.map((day: any) => (
                              <div key={day.weekday} className="flex items-start gap-4 text-sm bg-background p-2 rounded border">
                                <span className="font-bold min-w-[40px]">{WEEKDAYS.find(w => w.value === day.weekday)?.label}:</span>
                                <div className="flex flex-wrap gap-2">
                                  {day.shifts.map((s: any, i: number) => {
                                    const shiftInfo = shifts?.find((st: any) => st.id === s.shift_template_id);
                                    const roomInfo = classrooms?.find((r: any) => r.id === s.room_id);
                                    return (
                                      <Badge key={i} variant="secondary" className="font-normal">
                                        {shiftInfo?.name} ({shiftInfo?.startTime}-{shiftInfo?.endTime}) - {roomInfo?.name}
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
                              <Badge key={t.teacher_id} variant="outline" className="bg-primary/5 py-1.5">
                                <User className="h-3 w-3 mr-1" />
                                {staff?.find(s => s.id === t.teacher_id)?.fullName} 
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
                      <p className="text-muted-foreground text-sm">Hệ thống sẽ tự động tạo lịch học cho toàn bộ các buổi dựa trên cài đặt của bạn.</p>
                      <div className="space-y-3">
                        <p className="text-sm font-medium">Vui lòng chọn màu để hiển thị cho lịch học:</p>
                        <div className="flex flex-wrap gap-2.5">
                          {CLASS_PALETTE.map(color => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setSelectedColor(color)}
                              className="w-8 h-8 rounded-full border-2 transition-all"
                              style={{
                                backgroundColor: color,
                                borderColor: selectedColor === color ? "#1e293b" : "transparent",
                                transform: selectedColor === color ? "scale(1.2)" : "scale(1)",
                                boxShadow: selectedColor === color ? "0 0 0 2px white, 0 0 0 4px #1e293b" : "none",
                              }}
                              data-testid={`color-swatch-${color}`}
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
                data-testid="button-prev-step"
              >
                <ChevronLeft className="h-4 w-4" />
                {step === 1 ? "Hủy bỏ" : "Quay lại"}
              </Button>
              
              {step < 3 ? (
                <Button type="button" onClick={nextStep} className="gap-2" data-testid="button-next-step">
                  Tiếp tục
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button 
                  type="button" 
                  onClick={handleFinalSubmit}
                  className="gap-2 bg-green-600 hover:bg-green-700" 
                  disabled={createClassMutation.isPending}
                  data-testid="button-submit-class"
                >
                  {createClassMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Check className="h-4 w-4" />
                  Xác nhận & Tạo lớp
                </Button>
              )}
            </div>
          </form>
        </Form>
      </div>
    </DashboardLayout>
  );
}
