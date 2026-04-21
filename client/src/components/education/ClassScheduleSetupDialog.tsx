import { useState } from "react";
import { format } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Loader2, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { useToast } from "@/hooks/use-toast";

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

interface ClassScheduleSetupDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  classData: any;
  locationId?: string;
  onSuccess: (freshSessions: any[]) => void;
}

export function ClassScheduleSetupDialog({
  isOpen,
  onOpenChange,
  classId,
  classData,
  locationId,
  onSuccess,
}: ClassScheduleSetupDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const effectiveLocationId = locationId || classData?.locationId;

  // Step 1 fields
  const [programId, setProgramId] = useState<string>(classData?.programId || "");
  const [courseId, setCourseId] = useState<string>(classData?.courseId || "");
  const [feePackageId, setFeePackageId] = useState<string>(classData?.feePackageId || "");
  const [scoreSheetId, setScoreSheetId] = useState<string>(classData?.scoreSheetId || "");
  const [subjectId, setSubjectId] = useState<string>(classData?.subjectId || "");
  const [learningFormat, setLearningFormat] = useState<string>(classData?.learningFormat || "offline");
  const [evaluationCriteriaIds, setEvaluationCriteriaIds] = useState<string[]>(
    Array.isArray(classData?.evaluationCriteriaIds) ? classData.evaluationCriteriaIds.map(String) : []
  );
  const [managerIds, setManagerIds] = useState<string[]>(
    Array.isArray(classData?.managerIds) ? classData.managerIds.map(String) : []
  );
  const [maxStudents, setMaxStudents] = useState<number>(classData?.maxStudents || 20);

  // Schedule fields
  const [startDate, setStartDate] = useState<Date | undefined>(
    classData?.startDate ? new Date(classData.startDate) : new Date()
  );
  const [endType, setEndType] = useState<"date" | "sessions">("sessions");
  const [endDate, setEndDate] = useState<Date | undefined>(
    classData?.endDate ? new Date(classData.endDate) : undefined
  );
  const [sessionCount, setSessionCount] = useState<number>(20);
  const [weekdays, setWeekdays] = useState<number[]>(classData?.weekdays || []);
  const [wdConfigs, setWdConfigs] = useState<Record<number, { shiftTemplateId: string; roomId: string; teacherIds: string[] }>>(
    () => {
      const init: Record<number, { shiftTemplateId: string; roomId: string; teacherIds: string[] }> = {};
      (classData?.weekdays || []).forEach((wd: number) => {
        init[wd] = {
          shiftTemplateId: "",
          roomId: "",
          teacherIds: classData?.teacherIds || [],
        };
      });
      return init;
    }
  );
  const [isSaving, setIsSaving] = useState(false);

  // Queries
  const { data: programs = [] } = useQuery<any[]>({ queryKey: ["/api/course-programs"], enabled: isOpen });
  const { data: coursesList = [] } = useQuery<any[]>({ queryKey: ["/api/courses"], enabled: isOpen });
  const { data: feePackages = [] } = useQuery<any[]>({
    queryKey: [`/api/courses/${courseId}/fee-packages`],
    enabled: !!courseId && isOpen,
  });
  const { data: scoreSheets = [] } = useQuery<any[]>({ queryKey: ["/api/score-sheets"], enabled: isOpen });
  const { data: subjects = [] } = useQuery<any[]>({ queryKey: ["/api/subjects"], enabled: isOpen });
  const { data: evaluationCriteriaList = [] } = useQuery<any[]>({ queryKey: ["/api/evaluation-criteria"], enabled: isOpen });
  const { data: staffList = [] } = useQuery<any[]>({ queryKey: ["/api/staff?minimal=true"], enabled: isOpen });

  const { data: shiftTemplates = [] } = useQuery<any[]>({
    queryKey: ["/api/shift-templates", { locationId: effectiveLocationId }],
    queryFn: async () => {
      const res = await fetch(`/api/shift-templates?locationId=${effectiveLocationId}`);
      if (!res.ok) throw new Error("Failed to fetch shifts");
      return res.json();
    },
    enabled: !!effectiveLocationId && isOpen,
  });

  const { data: classroomsList = [] } = useQuery<any[]>({
    queryKey: ["/api/classrooms", { locationId: effectiveLocationId }],
    queryFn: async () => {
      const url = effectiveLocationId
        ? `/api/classrooms?locationId=${effectiveLocationId}`
        : "/api/classrooms";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch classrooms");
      return res.json();
    },
    enabled: isOpen,
  });

  const activeStaff = (staffList as any[]).filter((s: any) => s.status === "Hoạt động");

  const toggleWeekday = (wd: number) => {
    setWeekdays(prev => {
      const next = prev.includes(wd) ? prev.filter(w => w !== wd) : [...prev, wd].sort();
      if (!prev.includes(wd)) {
        setWdConfigs(cfg => ({
          ...cfg,
          [wd]: { shiftTemplateId: "", roomId: "", teacherIds: classData?.teacherIds || [] },
        }));
      } else {
        setWdConfigs(cfg => { const n = { ...cfg }; delete n[wd]; return n; });
      }
      return next;
    });
  };

  const updateWdConfig = (wd: number, updates: any) => {
    setWdConfigs(prev => ({ ...prev, [wd]: { ...prev[wd], ...updates } }));
  };

  const isValid =
    !!courseId &&
    !!feePackageId &&
    weekdays.length > 0 &&
    weekdays.every(wd => wdConfigs[wd]?.shiftTemplateId) &&
    (endType === "date" ? !!endDate : sessionCount > 0);

  const estimatedSessions = (() => {
    if (!weekdays.length || !startDate) return 0;
    if (endType === "sessions") return sessionCount;
    if (!endDate) return 0;
    let count = 0;
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (weekdays.includes(d.getDay()) && wdConfigs[d.getDay()]?.shiftTemplateId) count++;
    }
    return count;
  })();

  const handleSave = async () => {
    if (!isValid) return;
    setIsSaving(true);
    try {
      const payload: any = {
        startDate: startDate ? format(startDate, "yyyy-MM-dd") : classData?.startDate,
        endDate: endType === "date" && endDate ? format(endDate, "yyyy-MM-dd") : undefined,
        endType,
        sessionCount: endType === "sessions" ? sessionCount : undefined,
        weekdays,
        schedule_config: weekdays.map(wd => ({
          weekday: wd,
          shifts: [{ shift_template_id: wdConfigs[wd]?.shiftTemplateId, room_id: wdConfigs[wd]?.roomId || null }],
        })),
        teachers_config: Array.from(
          new Set(weekdays.flatMap(wd => wdConfigs[wd]?.teacherIds || []))
        ).map(tid => ({ teacher_id: tid, mode: "all" })),
        courseId: courseId || classData?.courseId || undefined,
        feePackageId: feePackageId || undefined,
        programId: programId || undefined,
        scoreSheetId: scoreSheetId || undefined,
        subjectId: subjectId || undefined,
        learningFormat,
        maxStudents,
        evaluationCriteriaIds: evaluationCriteriaIds.length > 0 ? evaluationCriteriaIds : null,
        managerIds: managerIds.length > 0 ? managerIds : [],
        regenerateSessions: true,
      };

      await apiRequest("PATCH", `/api/classes/${classId}`, payload);

      await queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/sessions`] });
      await queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}`] });

      const res = await fetch(`/api/classes/${classId}/sessions`, { credentials: "include" });
      const freshSessions = res.ok ? await res.json() : [];
      const sorted = [...freshSessions].sort((a: any, b: any) =>
        new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime()
      );

      toast({ title: "Thành công", description: `Đã tạo lịch lớp với ${sorted.length} buổi học.` });
      onOpenChange(false);
      onSuccess(sorted);
    } catch (err: any) {
      toast({
        title: "Lỗi tạo lịch",
        description: err?.message || "Không thể tạo lịch lớp. Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[80vw] max-w-[80vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Cấu hình lịch lớp trước khi xếp lịch
          </DialogTitle>
          <DialogDescription>
            Lớp chưa có lịch học. Nhập thông tin lịch lớp để hệ thống tạo buổi học, sau đó bạn có thể xếp lịch cho học viên.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-5 py-2 pr-1">
          {/* Row 1: Chương trình, Khóa học, Gói học phí, Bảng điểm */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Chương trình</label>
              <Select value={programId} onValueChange={setProgramId}>
                <SelectTrigger className="h-9" data-testid="select-program">
                  <SelectValue placeholder="Chọn chương trình..." />
                </SelectTrigger>
                <SelectContent>
                  {(programs as any[]).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Khoá học <span className="text-destructive">*</span></label>
              <Select value={courseId} onValueChange={(v) => { setCourseId(v); setFeePackageId(""); }}>
                <SelectTrigger className={`h-9 ${!courseId ? "border-destructive/50" : ""}`} data-testid="select-course">
                  <SelectValue placeholder="Chọn khoá học..." />
                </SelectTrigger>
                <SelectContent>
                  {(coursesList as any[]).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Gói học phí mặc định <span className="text-destructive">*</span></label>
              <Select value={feePackageId} onValueChange={setFeePackageId} disabled={!courseId}>
                <SelectTrigger className="h-9" data-testid="select-fee-package">
                  <SelectValue placeholder={courseId ? "Chọn gói..." : "Chọn khoá trước"} />
                </SelectTrigger>
                <SelectContent>
                  {(feePackages as any[]).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Bảng điểm</label>
              <Select value={scoreSheetId} onValueChange={setScoreSheetId}>
                <SelectTrigger className="h-9" data-testid="select-score-sheet">
                  <SelectValue placeholder="Chọn bảng điểm..." />
                </SelectTrigger>
                <SelectContent>
                  {(scoreSheets as any[]).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Bộ môn, Hình thức học, Tiêu chí đánh giá, Quản lý lớp */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Bộ môn</label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger className="h-9" data-testid="select-subject">
                  <SelectValue placeholder="Chọn bộ môn..." />
                </SelectTrigger>
                <SelectContent>
                  {(subjects as any[]).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Hình thức học</label>
              <Select value={learningFormat} onValueChange={setLearningFormat}>
                <SelectTrigger className="h-9" data-testid="select-learning-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="offline">Offline</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tiêu chí đánh giá</label>
              <SearchableMultiSelect
                options={(evaluationCriteriaList as any[]).map((c: any) => ({ value: String(c.id), label: c.name }))}
                value={evaluationCriteriaIds}
                onChange={setEvaluationCriteriaIds}
                placeholder="Chọn tiêu chí..."
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Quản lý lớp</label>
              <SearchableMultiSelect
                options={activeStaff.map((s: any) => ({ value: s.id, label: s.fullName }))}
                value={managerIds}
                onChange={setManagerIds}
                placeholder="Chọn quản lý..."
              />
            </div>
          </div>

          {/* Row 3: Số học viên tối đa */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Số học viên tối đa</label>
              <Input
                type="number"
                className="h-9"
                value={maxStudents}
                min={1}
                onChange={(e) => setMaxStudents(parseInt(e.target.value) || 1)}
                data-testid="input-max-students"
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wide">Lịch học</p>

            {/* Ngày bắt đầu & Kết thúc */}
            <div className="flex flex-wrap gap-4 items-end mb-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Ngày bắt đầu lớp <span className="text-destructive">*</span></label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 w-40 justify-start font-normal" data-testid="btn-start-date">
                      <CalendarDays className="h-4 w-4 mr-2 text-muted-foreground" />
                      {startDate ? format(startDate, "dd/MM/yyyy") : "Chọn ngày"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarComponent mode="single" selected={startDate} onSelect={setStartDate} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Kết thúc <span className="text-destructive">*</span></label>
                <div className="flex items-center gap-2">
                  <Select value={endType} onValueChange={(v: any) => setEndType(v)}>
                    <SelectTrigger className="h-9 w-36" data-testid="select-end-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sessions">Theo số buổi</SelectItem>
                      <SelectItem value="date">Theo ngày</SelectItem>
                    </SelectContent>
                  </Select>
                  {endType === "sessions" ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        className="h-9 w-20"
                        value={sessionCount}
                        min={1}
                        onChange={(e) => setSessionCount(parseInt(e.target.value) || 0)}
                        data-testid="input-session-count"
                      />
                      <span className="text-sm text-muted-foreground">buổi</span>
                    </div>
                  ) : (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9 w-36 justify-start font-normal" data-testid="btn-end-date">
                          <CalendarDays className="h-4 w-4 mr-2 text-muted-foreground" />
                          {endDate ? format(endDate, "dd/MM/yyyy") : "Chọn ngày"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <CalendarComponent mode="single" selected={endDate} onSelect={setEndDate} initialFocus />
                      </PopoverContent>
                    </Popover>
                  )}
                  {estimatedSessions > 0 && (
                    <Badge variant="secondary" className="h-7 text-xs">
                      Dự kiến: {estimatedSessions} buổi
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Thứ học */}
            <div className="space-y-2 mb-5">
              <label className="text-sm font-medium">Thứ học trong tuần <span className="text-destructive">*</span></label>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6, 0].map(wd => (
                  <Button
                    key={wd}
                    type="button"
                    size="sm"
                    variant={weekdays.includes(wd) ? "default" : "outline"}
                    className="w-10 h-8 text-xs"
                    onClick={() => toggleWeekday(wd)}
                    data-testid={`btn-weekday-${wd}`}
                  >
                    {WEEKDAY_LABELS[wd]}
                  </Button>
                ))}
              </div>
            </div>

            {/* Per-weekday: Ca học / Phòng / Giáo viên */}
            {weekdays.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Ca học, Phòng học & Giáo viên theo thứ <span className="text-destructive">*</span></label>
                <div className="space-y-2 border rounded-md p-3 bg-muted/10">
                  {weekdays.map(wd => (
                    <div key={wd} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-1 font-bold text-primary text-sm">{WEEKDAY_LABELS[wd]}</div>
                      <div className="col-span-3">
                        <Select
                          value={wdConfigs[wd]?.shiftTemplateId || ""}
                          onValueChange={(v) => updateWdConfig(wd, { shiftTemplateId: v })}
                        >
                          <SelectTrigger className="h-8 text-xs" data-testid={`select-shift-${wd}`}>
                            <SelectValue placeholder="Chọn ca..." />
                          </SelectTrigger>
                          <SelectContent>
                            {(shiftTemplates as any[]).map((s: any) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name} ({s.startTime}–{s.endTime})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-3">
                        <Select
                          value={wdConfigs[wd]?.roomId || ""}
                          onValueChange={(v) => updateWdConfig(wd, { roomId: v })}
                        >
                          <SelectTrigger className="h-8 text-xs" data-testid={`select-room-${wd}`}>
                            <SelectValue placeholder="Phòng học..." />
                          </SelectTrigger>
                          <SelectContent>
                            {(classroomsList as any[]).map((r: any) => (
                              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-5">
                        <SearchableMultiSelect
                          options={activeStaff.map((t: any) => ({ value: t.id, label: t.fullName }))}
                          value={wdConfigs[wd]?.teacherIds || []}
                          onChange={(v) => updateWdConfig(wd, { teacherIds: v })}
                          placeholder="Chọn giáo viên..."
                        />
                      </div>
                    </div>
                  ))}
                  {weekdays.some(wd => !wdConfigs[wd]?.shiftTemplateId) && (
                    <p className="text-xs text-destructive mt-1">Vui lòng chọn ca học cho tất cả các thứ đã chọn.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving} data-testid="btn-cancel">
            Huỷ
          </Button>
          <Button onClick={handleSave} disabled={!isValid || isSaving} data-testid="btn-save-schedule">
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isSaving ? "Đang tạo lịch..." : "Lưu & tiếp tục xếp lịch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
