import { useState, useMemo } from "react";
import { format } from "date-fns";
import { Calendar, Info, ChevronDown, Wallet, AlertTriangle, CalendarDays } from "lucide-react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";

interface ScheduleDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  students: any[];
  classData: any;
  classSessions: any[];
  onConfirm: (configs: any[], classScheduleConfig?: any) => void;
  isPending: boolean;
  defaultStartDate?: Date;
  defaultEndType?: "date" | "sessions";
  defaultTotalSessions?: number;
  hasNoSessions?: boolean;
  locationId?: string;
}

const fmtMoney = (n: number) => Math.round(n).toLocaleString("vi-VN");
const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/** Generate preview sessions client-side from a schedule config (used when class has no sessions yet) */
function generateSessionsFromConfig(
  startDate: Date,
  endType: "date" | "sessions",
  endDate: Date | undefined,
  sessionCount: number,
  weekdays: number[],
  wdConfigs: Record<number, { shiftTemplateId: string; roomId: string; teacherIds: string[] }>,
  shifts: any[]
): any[] {
  if (!weekdays.length) return [];
  const sessions: any[] = [];
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const maxDate = new Date(start);
  maxDate.setFullYear(maxDate.getFullYear() + 5);

  const limit = endType === "sessions" ? sessionCount : 99999;
  const until = endType === "date" ? (endDate ? new Date(endDate) : maxDate) : maxDate;
  until.setHours(23, 59, 59, 999);

  for (let d = new Date(start); d <= until && sessions.length < limit; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    if (!weekdays.includes(wd)) continue;
    const cfg = wdConfigs[wd];
    if (!cfg || !cfg.shiftTemplateId) continue;
    const shift = shifts.find((s: any) => s.id === cfg.shiftTemplateId);
    sessions.push({
      id: `preview-${sessions.length}`,
      sessionDate: new Date(d).toISOString().split("T")[0],
      weekday: wd,
      shiftTemplateId: cfg.shiftTemplateId,
      shiftTemplate: shift || { name: "", startTime: "" },
    });
  }
  return sessions;
}

export function ScheduleDialog({
  isOpen,
  onOpenChange,
  students,
  classData,
  classSessions,
  onConfirm,
  isPending,
  defaultStartDate,
  defaultEndType,
  defaultTotalSessions,
  hasNoSessions = false,
  locationId,
}: ScheduleDialogProps) {
  const initStart = defaultStartDate ?? (classData?.startDate ? new Date(classData.startDate) : undefined);
  const initEndType: "date" | "sessions" = defaultEndType ?? "date";
  const initTotalSessions = defaultTotalSessions ?? 20;

  const [globalStart, setGlobalStart] = useState<Date | undefined>(initStart);
  const [globalEndType, setGlobalEndType] = useState<"date" | "sessions">(initEndType);
  const [globalEnd, setGlobalEnd] = useState<Date | undefined>(classData?.endDate ? new Date(classData.endDate) : undefined);
  const [globalSessions, setGlobalSessions] = useState<number>(initTotalSessions);
  const [globalPackageId, setGlobalPackageId] = useState<string>(classData?.feePackageId || "");
  const [globalAutoInvoice, setGlobalAutoInvoice] = useState<boolean>(true);
  const [selectedCourseId, setSelectedCourseId] = useState<string>(classData?.courseId || "");

  // ── Class schedule config state (used when hasNoSessions) ──────────────────
  const [schedStartDate, setSchedStartDate] = useState<Date | undefined>(
    classData?.startDate ? new Date(classData.startDate) : new Date()
  );
  const [schedEndType, setSchedEndType] = useState<"date" | "sessions">("sessions");
  const [schedEndDate, setSchedEndDate] = useState<Date | undefined>(
    classData?.endDate ? new Date(classData.endDate) : undefined
  );
  const [schedSessionCount, setSchedSessionCount] = useState<number>(20);
  const [schedWeekdays, setSchedWeekdays] = useState<number[]>(classData?.weekdays || []);
  const [schedWdConfigs, setSchedWdConfigs] = useState<Record<number, { shiftTemplateId: string; roomId: string; teacherIds: string[] }>>(
    () => {
      const init: Record<number, { shiftTemplateId: string; roomId: string; teacherIds: string[] }> = {};
      (classData?.weekdays || []).forEach((wd: number) => {
        init[wd] = { shiftTemplateId: "", roomId: "", teacherIds: classData?.teacherIds || [] };
      });
      return init;
    }
  );

  // Multi-select popover open state per student
  const [openPromoIdx, setOpenPromoIdx] = useState<number | null>(null);
  const [openSurchargeIdx, setOpenSurchargeIdx] = useState<number | null>(null);

  const [studentConfigs, setStudentConfigs] = useState<any[]>(
    students.map(s => {
      const fullName = s.student?.fullName || s.fullName || "N/A";
      const code = s.student?.code || s.code || "N/A";
      return {
        studentId: s.studentId,
        fullName,
        code,
        startDate: initStart ?? new Date(),
        shiftType: "all",
        selectedShifts: [],
        endType: initEndType,
        endDate: classData?.endDate ? new Date(classData.endDate) : new Date(),
        totalSessions: initTotalSessions,
        packageId: classData?.feePackageId || "",
        autoInvoice: true,
        promotionKeys: [] as string[],
        surchargeKeys: [] as string[],
        useDeposit: false,
      };
    })
  );

  // Fetch all courses for the course selector
  const { data: coursesList = [] } = useQuery<any[]>({
    queryKey: ["/api/courses"],
    enabled: isOpen,
  });

  // Fetch fee packages for the selected course
  const { data: feePackages = [] } = useQuery<any[]>({
    queryKey: [`/api/courses/${selectedCourseId}/fee-packages`],
    enabled: !!selectedCourseId,
  });

  // Fetch promotions & surcharges from finance config
  const { data: promotionOptions = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/promotions?type=promotion"],
  });

  const { data: surchargeOptions = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/promotions?type=surcharge"],
  });

  // Fetch shift templates and staff for class schedule config (when hasNoSessions)
  const effectiveLocationId = locationId || classData?.locationId;

  // Fetch classrooms filtered by location
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
    enabled: hasNoSessions && isOpen,
  });
  const { data: shiftTemplates = [] } = useQuery<any[]>({
    queryKey: ["/api/shift-templates", { locationId: effectiveLocationId }],
    queryFn: async () => {
      const res = await fetch(`/api/shift-templates?locationId=${effectiveLocationId}`);
      if (!res.ok) throw new Error("Failed to fetch shifts");
      return res.json();
    },
    enabled: hasNoSessions && !!effectiveLocationId && isOpen,
  });

  const { data: staffList = [] } = useQuery<any[]>({
    queryKey: ["/api/staff?minimal=true"],
    enabled: hasNoSessions && isOpen,
  });

  const activeTeachers = (staffList as any[]).filter((s: any) => s.status === "Hoạt động");

  // Fetch existing sessions for each student in this class to avoid counting duplicates in preview
  const existingSessionQueries = useQueries({
    queries: students.map(s => ({
      queryKey: [`/api/classes/${classData?.id}/student/${s.studentId}/sessions`],
      enabled: !!(classData?.id && s.studentId),
    })),
  });

  // Fetch wallet (ví học phí) for each student to get deposit balance
  const walletQueries = useQueries({
    queries: students.map(s => ({
      queryKey: ["/api/students", s.studentId, "fee-wallet"],
      queryFn: () => fetch(`/api/students/${s.studentId}/fee-wallet`, { credentials: "include" }).then(r => r.json()),
      enabled: !!s.studentId,
    })),
  });

  // Map studentId -> deposit balance (datCoc)
  const depositMap = useMemo(() => {
    const map: Record<string, number> = {};
    students.forEach((s, idx) => {
      const data = walletQueries[idx]?.data as any;
      if (data?.summary) {
        map[s.studentId] = data.summary.datCoc ?? 0;
      }
    });
    return map;
  }, [walletQueries, students]);

  // Fetch fee packages for each student to get remaining session counts
  const feePackageQueries = useQueries({
    queries: students.map(s => ({
      queryKey: ["/api/students", s.studentId, "fee-packages"],
      queryFn: () => fetch(`/api/students/${s.studentId}/fee-packages`, { credentials: "include" }).then(r => r.json()),
      enabled: !!s.studentId && isOpen,
    })),
  });

  // Map: studentId -> { packageId -> remainingSessions }
  const remainingSessionsMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    students.forEach((s, idx) => {
      const raw = feePackageQueries[idx]?.data as any;
      const packages: any[] = Array.isArray(raw) ? raw : (raw?.packages ?? []);
      if (packages.length > 0) {
        map[s.studentId] = {};
        packages.forEach((pkg: any) => {
          if (pkg.packageId) {
            map[s.studentId][pkg.packageId] = pkg.remainingSessions ?? 0;
          }
        });
      }
    });
    return map;
  }, [feePackageQueries, students]);

  const existingSessionMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    students.forEach((s, idx) => {
      const studentId = s.studentId;
      const data = existingSessionQueries[idx]?.data as any[] | undefined;
      if (studentId && data) {
        map[studentId] = new Set(data.map((ss: any) => ss.classSessionId));
      }
    });
    return map;
  }, [existingSessionQueries, students]);

  // ── Generated preview sessions (when hasNoSessions) ────────────────────────
  const generatedSessions = useMemo(() => {
    if (!hasNoSessions || !schedStartDate || !schedWeekdays.length) return [];
    return generateSessionsFromConfig(
      schedStartDate,
      schedEndType,
      schedEndDate,
      schedSessionCount,
      schedWeekdays,
      schedWdConfigs,
      shiftTemplates as any[]
    );
  }, [hasNoSessions, schedStartDate, schedEndType, schedEndDate, schedSessionCount, schedWeekdays, schedWdConfigs, shiftTemplates]);

  // The sessions to use for preview / shift selection
  const effectiveSessions = hasNoSessions ? generatedSessions : (classSessions || []);

  const getPackage = (packageId: string) =>
    feePackages.find((p: any) => p.id === packageId);

  const calcBaseAmount = (config: any, numSessions: number): number => {
    const pkg = getPackage(config.packageId);
    if (!pkg) return 0;
    if (pkg.type === "buổi") return numSessions * parseFloat(pkg.fee || "0");
    return parseFloat(pkg.totalAmount || "0");
  };

  const calcPromoAmount = (promo: any, baseFee: number): number => {
    const val = parseFloat(promo.valueAmount || "0");
    if (promo.valueType === "percent") return Math.round(baseFee * val / 100);
    return val;
  };

  const calcSurchargeAmount = (surcharge: any, baseFee: number): number => {
    const val = parseFloat(surcharge.valueAmount || "0");
    if (surcharge.valueType === "percent") return Math.round(baseFee * val / 100);
    return val;
  };

  const getTotalPromoAmount = (config: any, base: number) =>
    promotionOptions
      .filter((p: any) => config.promotionKeys.includes(p.id))
      .reduce((sum: number, p: any) => sum + calcPromoAmount(p, base), 0);

  const getTotalSurchargeAmount = (config: any, base: number) =>
    surchargeOptions
      .filter((s: any) => config.surchargeKeys.includes(s.id))
      .reduce((sum: number, s: any) => sum + calcSurchargeAmount(s, base), 0);

  const calcInvoicePreview = (config: any, numSessions: number) => {
    const base = calcBaseAmount(config, numSessions);
    const promo = getTotalPromoAmount(config, base);
    const surcharge = getTotalSurchargeAmount(config, base);
    const grand = Math.max(0, base - promo + surcharge);
    return { base, promo, surcharge, grand };
  };

  const applyGlobal = () => {
    setStudentConfigs(prev => prev.map(config => ({
      ...config,
      startDate: globalStart || config.startDate,
      endType: globalEndType,
      endDate: globalEndType === "date" ? (globalEnd || config.endDate) : config.endDate,
      totalSessions: globalEndType === "sessions" ? globalSessions : config.totalSessions,
      packageId: globalPackageId || config.packageId,
      autoInvoice: globalAutoInvoice
    })));
  };

  const updateStudentConfig = (index: number, updates: any) => {
    setStudentConfigs(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const togglePromoKey = (idx: number, id: string) => {
    const config = studentConfigs[idx];
    const next = config.promotionKeys.includes(id)
      ? config.promotionKeys.filter((k: string) => k !== id)
      : [...config.promotionKeys, id];
    updateStudentConfig(idx, { promotionKeys: next });
  };

  const toggleSurchargeKey = (idx: number, id: string) => {
    const config = studentConfigs[idx];
    const next = config.surchargeKeys.includes(id)
      ? config.surchargeKeys.filter((k: string) => k !== id)
      : [...config.surchargeKeys, id];
    updateStudentConfig(idx, { surchargeKeys: next });
  };

  const availableShifts = effectiveSessions?.reduce((acc: any[], s: any) => {
    const shiftId = s.shiftTemplateId || s.shiftTemplate?.id;
    if (shiftId && !acc.find(x => x.id === shiftId)) {
      acc.push({
        id: shiftId,
        name: s.shiftTemplate?.name,
        weekday: s.weekday,
        startTime: s.shiftTemplate?.startTime
      });
    }
    return acc;
  }, []).sort((a: any, b: any) => {
    if (a.weekday !== b.weekday) return a.weekday - b.weekday;
    return (a.startTime || "").localeCompare(b.startTime || "");
  }) || [];

  const formatWeekday = (wd: number) => WEEKDAY_LABELS[wd] || "";

  const getPreviewSessions = (config: any) => {
    if (!effectiveSessions) return [];
    let filtered = effectiveSessions;
    if (config.shiftType === "specific" && config.selectedShifts.length > 0) {
      filtered = effectiveSessions.filter((s: any) => config.selectedShifts.includes(s.shiftTemplateId || s.shiftTemplate?.id));
    }
    const start = new Date(config.startDate);
    start.setHours(0, 0, 0, 0);
    let sessions = filtered
      .filter((s: any) => {
        const sessionDate = new Date(s.sessionDate);
        sessionDate.setHours(0, 0, 0, 0);
        return sessionDate >= start;
      })
      .sort((a: any, b: any) => new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime());
    if (config.endType === "date") {
      const end = new Date(config.endDate);
      end.setHours(23, 59, 59, 999);
      sessions = sessions.filter((s: any) => new Date(s.sessionDate) <= end);
    } else {
      sessions = sessions.slice(0, config.totalSessions);
    }
    if (!hasNoSessions) {
      const existing = existingSessionMap[config.studentId];
      if (existing && existing.size > 0) {
        sessions = sessions.filter((s: any) => !existing.has(s.id));
      }
    }
    return sessions;
  };

  // ── Weekday toggle for class schedule config ──────────────────────────────
  const toggleSchedWeekday = (wd: number) => {
    setSchedWeekdays(prev => {
      const next = prev.includes(wd) ? prev.filter(w => w !== wd) : [...prev, wd].sort();
      if (!next.includes(wd)) {
        setSchedWdConfigs(cfg => { const n = { ...cfg }; delete n[wd]; return n; });
      } else {
        setSchedWdConfigs(cfg => ({
          ...cfg,
          [wd]: { shiftTemplateId: "", roomId: "", teacherIds: classData?.teacherIds || [] },
        }));
      }
      return next;
    });
  };

  const updateSchedWdConfig = (wd: number, updates: any) => {
    setSchedWdConfigs(prev => ({ ...prev, [wd]: { ...prev[wd], ...updates } }));
  };

  // Validate class schedule config
  const isSchedConfigValid = !hasNoSessions || (
    schedWeekdays.length > 0 &&
    schedWeekdays.every(wd => schedWdConfigs[wd]?.shiftTemplateId) &&
    (schedEndType === "date" ? !!schedEndDate : schedSessionCount > 0)
  );

  // Build classScheduleConfig object to send to backend
  const buildClassScheduleConfig = () => {
    if (!hasNoSessions) return undefined;
    return {
      startDate: schedStartDate ? format(schedStartDate, "yyyy-MM-dd") : classData?.startDate,
      endType: schedEndType,
      endDate: schedEndType === "date" && schedEndDate ? format(schedEndDate, "yyyy-MM-dd") : undefined,
      sessionCount: schedEndType === "sessions" ? schedSessionCount : undefined,
      weekdays: schedWeekdays,
      schedule_config: schedWeekdays.map(wd => ({
        weekday: wd,
        shifts: [{ shift_template_id: schedWdConfigs[wd]?.shiftTemplateId, room_id: schedWdConfigs[wd]?.roomId || null }],
      })),
      teachers_config: Array.from(
        new Set(schedWeekdays.flatMap(wd => schedWdConfigs[wd]?.teacherIds || []))
      ).map(tid => ({ teacher_id: tid, mode: "all" })),
    };
  };

  const handleConfirm = () => {
    onConfirm(studentConfigs, buildClassScheduleConfig());
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex flex-wrap justify-between items-center pr-8 gap-4">
            <DialogTitle>
              Xếp lịch học cho {students.length === 1 ? (students[0]?.student?.fullName || students[0]?.fullName || "học viên") : `${students.length} học viên`}
            </DialogTitle>
            <div className="flex flex-wrap items-center gap-4 bg-muted/30 p-2 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">Bắt đầu:</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-xs">
                      {globalStart ? format(globalStart, "dd/MM/yyyy") : "Chọn ngày"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarComponent mode="single" selected={globalStart} onSelect={setGlobalStart} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2">
                <Select value={globalEndType} onValueChange={(v: any) => setGlobalEndType(v)}>
                  <SelectTrigger className="h-8 text-xs w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Kết thúc vào</SelectItem>
                    <SelectItem value="sessions">Kết thúc sau</SelectItem>
                  </SelectContent>
                </Select>
                {globalEndType === "date" ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 text-xs">
                        {globalEnd ? format(globalEnd, "dd/MM/yyyy") : "Chọn ngày"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <CalendarComponent mode="single" selected={globalEnd} onSelect={setGlobalEnd} initialFocus />
                    </PopoverContent>
                  </Popover>
                ) : (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      className="h-8 w-16 text-xs"
                      value={globalSessions}
                      onChange={(e) => setGlobalSessions(parseInt(e.target.value) || 0)}
                    />
                    <span className="text-xs">buổi</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">Khoá học:</span>
                <Select value={selectedCourseId} onValueChange={(v) => { setSelectedCourseId(v); setGlobalPackageId(""); }}>
                  <SelectTrigger className="h-8 text-xs w-[160px]">
                    <SelectValue placeholder="Chọn khoá học" />
                  </SelectTrigger>
                  <SelectContent>
                    {(coursesList as any[]).map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">Gói:</span>
                <Select value={globalPackageId} onValueChange={setGlobalPackageId} disabled={!selectedCourseId}>
                  <SelectTrigger className="h-8 text-xs w-[140px]">
                    <SelectValue placeholder={selectedCourseId ? "Chọn gói" : "Chọn khoá trước"} />
                  </SelectTrigger>
                  <SelectContent>
                    {feePackages.map((pkg: any) => (
                      <SelectItem key={pkg.id} value={pkg.id}>{pkg.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" variant="default" className="h-8 text-xs" onClick={applyGlobal}>Áp dụng tất cả</Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto py-4 space-y-4">

          {/* ── Class schedule config panel (only when class has no sessions) ── */}
          {false && hasNoSessions && (
            <div className="border border-amber-300 rounded-lg bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-4 space-y-4">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span className="font-semibold text-sm">Lớp chưa có lịch học — Cấu hình lịch lớp để xếp đồng thời</span>
              </div>

              {/* Start date + End config */}
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-amber-900 dark:text-amber-100 w-20">Bắt đầu lớp:</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 text-xs border-amber-300">
                        <CalendarDays className="h-3 w-3 mr-1" />
                        {schedStartDate ? format(schedStartDate, "dd/MM/yyyy") : "Chọn ngày"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <CalendarComponent mode="single" selected={schedStartDate} onSelect={setSchedStartDate} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-amber-900 dark:text-amber-100 w-20">Kết thúc:</span>
                  <Select value={schedEndType} onValueChange={(v: any) => setSchedEndType(v)}>
                    <SelectTrigger className="h-8 text-xs w-[110px] border-amber-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">Theo ngày</SelectItem>
                      <SelectItem value="sessions">Theo số buổi</SelectItem>
                    </SelectContent>
                  </Select>
                  {schedEndType === "date" ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 text-xs border-amber-300">
                          <CalendarDays className="h-3 w-3 mr-1" />
                          {schedEndDate ? format(schedEndDate, "dd/MM/yyyy") : "Chọn ngày"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <CalendarComponent mode="single" selected={schedEndDate} onSelect={setSchedEndDate} initialFocus />
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        className="h-8 w-16 text-xs border-amber-300"
                        value={schedSessionCount}
                        onChange={(e) => setSchedSessionCount(parseInt(e.target.value) || 0)}
                      />
                      <span className="text-xs text-amber-900 dark:text-amber-100">buổi</span>
                    </div>
                  )}
                </div>

                {generatedSessions.length > 0 && (
                  <Badge variant="secondary" className="h-7 text-xs bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-100 border-amber-300">
                    Dự kiến: {generatedSessions.length} buổi
                  </Badge>
                )}
              </div>

              {/* Weekday selector */}
              <div className="space-y-2">
                <span className="text-xs font-medium text-amber-900 dark:text-amber-100">Chọn thứ trong tuần:</span>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5, 6, 0].map(wd => (
                    <Button
                      key={wd}
                      type="button"
                      size="sm"
                      variant={schedWeekdays.includes(wd) ? "default" : "outline"}
                      className={`w-10 h-8 text-xs ${schedWeekdays.includes(wd) ? "" : "border-amber-300"}`}
                      onClick={() => toggleSchedWeekday(wd)}
                    >
                      {formatWeekday(wd)}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Per-weekday config: shift + teachers */}
              {schedWeekdays.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-medium text-amber-900 dark:text-amber-100">Ca học, Phòng học & Giáo viên theo thứ:</span>
                  <div className="space-y-2 border border-amber-200 dark:border-amber-700 rounded-md p-3 bg-white/50 dark:bg-black/20">
                    {schedWeekdays.map(wd => (
                      <div key={wd} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-1 font-bold text-primary text-sm">{formatWeekday(wd)}</div>
                        <div className="col-span-3">
                          <Select
                            value={schedWdConfigs[wd]?.shiftTemplateId || ""}
                            onValueChange={(v) => updateSchedWdConfig(wd, { shiftTemplateId: v })}
                          >
                            <SelectTrigger className="h-8 text-xs">
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
                            value={schedWdConfigs[wd]?.roomId || ""}
                            onValueChange={(v) => updateSchedWdConfig(wd, { roomId: v })}
                          >
                            <SelectTrigger className="h-8 text-xs">
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
                            options={activeTeachers.map((t: any) => ({ value: t.id, label: t.fullName }))}
                            value={schedWdConfigs[wd]?.teacherIds || []}
                            onChange={(v) => updateSchedWdConfig(wd, { teacherIds: v })}
                            placeholder="Chọn giáo viên..."
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!isSchedConfigValid && schedWeekdays.length > 0 && (
                <p className="text-xs text-destructive">Vui lòng chọn ca học cho tất cả các thứ đã chọn.</p>
              )}
            </div>
          )}

          {/* ── Student schedule table ───────────────────────────────────────── */}
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-[150px]">Học viên</TableHead>
                <TableHead className="w-[130px]">Ngày bắt đầu</TableHead>
                <TableHead className="w-[180px]">Chọn ca học</TableHead>
                <TableHead className="w-[220px]">Kết thúc</TableHead>
                <TableHead className="w-[140px]">Gói học phí</TableHead>
                <TableHead className="w-[130px]">Khuyến mãi</TableHead>
                <TableHead className="w-[130px]">Phụ thu</TableHead>
                <TableHead className="w-[120px]">
                  <div className="flex flex-col items-center gap-1">
                    <span>Hoá đơn tự động</span>
                    <Switch
                      checked={globalAutoInvoice}
                      onCheckedChange={(v) => {
                        setGlobalAutoInvoice(v);
                        setStudentConfigs(prev => prev.map(config => ({ ...config, autoInvoice: v })));
                      }}
                    />
                  </div>
                </TableHead>
                <TableHead className="w-[90px]">Lịch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {studentConfigs.map((config, idx) => {
                const preview = getPreviewSessions(config);
                const pkg = getPackage(config.packageId);
                const invoicePreview = calcInvoicePreview(config, preview.length);
                const promoAmt = invoicePreview.promo;
                const surchargeAmt = invoicePreview.surcharge;
                const baseFee = invoicePreview.base;

                return (
                  <>
                  <TableRow key={config.studentId}>
                    <TableCell>
                      <div className="font-medium text-sm">{config.fullName}</div>
                      <div className="text-[10px] text-muted-foreground">{config.code}</div>
                    </TableCell>
                    <TableCell>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="w-full justify-start font-normal text-xs h-8">
                            <Calendar className="mr-1 h-3 w-3" />
                            {format(config.startDate, "dd/MM/yyyy")}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <CalendarComponent
                            mode="single"
                            selected={config.startDate}
                            onSelect={(date) => date && updateStudentConfig(idx, { startDate: date })}
                          />
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={config.shiftType}
                        onValueChange={(v) => updateStudentConfig(idx, { shiftType: v })}
                      >
                        <SelectTrigger className="w-full h-8 text-xs">
                          <SelectValue placeholder="Chọn ca" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tất cả</SelectItem>
                          <SelectItem value="specific">Chọn ca</SelectItem>
                        </SelectContent>
                      </Select>
                      {config.shiftType === "specific" && (
                        <div className="mt-2 p-2 border rounded-md bg-muted/10 space-y-2">
                          {availableShifts.map((s: any) => (
                            <div key={s.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`shift-${idx}-${s.id}`}
                                checked={config.selectedShifts.includes(s.id)}
                                onCheckedChange={(checked) => {
                                  const next = checked
                                    ? [...config.selectedShifts, s.id]
                                    : config.selectedShifts.filter((id: string) => id !== s.id);
                                  updateStudentConfig(idx, { selectedShifts: next });
                                }}
                              />
                              <label htmlFor={`shift-${idx}-${s.id}`} className="text-[10px] cursor-pointer">
                                {formatWeekday(s.weekday)} - {s.startTime} ({s.name})
                              </label>
                            </div>
                          ))}
                          {config.selectedShifts.length === 0 && (
                            <p className="text-[10px] text-destructive italic">Vui lòng chọn ít nhất 1 ca</p>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Select
                          value={config.endType}
                          onValueChange={(v: any) => updateStudentConfig(idx, { endType: v })}
                        >
                          <SelectTrigger className="w-full h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="date">Kết thúc vào</SelectItem>
                            <SelectItem value="sessions">Kết thúc sau</SelectItem>
                          </SelectContent>
                        </Select>
                        {config.endType === "date" ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="w-full justify-start font-normal text-xs h-8">
                                <Calendar className="mr-1 h-3 w-3" />
                                {format(config.endDate, "dd/MM/yyyy")}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <CalendarComponent
                                mode="single"
                                selected={config.endDate}
                                onSelect={(date) => date && updateStudentConfig(idx, { endDate: date })}
                              />
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              className="h-8 w-full text-xs"
                              value={config.totalSessions}
                              onChange={(e) => updateStudentConfig(idx, { totalSessions: parseInt(e.target.value) || 0 })}
                            />
                            <span className="text-[10px]">buổi</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={config.packageId}
                        onValueChange={(v) => updateStudentConfig(idx, { packageId: v })}
                      >
                        <SelectTrigger className="w-full h-8 text-xs">
                          <SelectValue placeholder="Chọn gói" />
                        </SelectTrigger>
                        <SelectContent>
                          {feePackages.map((pkg: any) => (
                            <SelectItem key={pkg.id} value={pkg.id}>{pkg.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>

                    {/* Khuyến mãi multi-select */}
                    <TableCell>
                      <Popover
                        open={openPromoIdx === idx}
                        onOpenChange={(v) => setOpenPromoIdx(v ? idx : null)}
                      >
                        <PopoverTrigger asChild>
                          <button className="w-full h-8 flex items-center justify-between px-2 rounded-md border bg-background hover:border-primary transition-colors text-[11px]">
                            <span className={promoAmt > 0 ? "text-green-600 font-semibold" : "text-muted-foreground"}>
                              {promoAmt > 0 ? `-${fmtMoney(promoAmt)} đ` : "Chọn..."}
                            </span>
                            <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-2" align="start">
                          <p className="text-xs font-semibold mb-2 text-muted-foreground">Chọn khuyến mãi</p>
                          {promotionOptions.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic py-2 text-center">Chưa có khuyến mãi nào</p>
                          ) : (
                            <div className="space-y-1.5">
                              {promotionOptions.filter((p: any) => p.isActive).map((promo: any) => {
                                const amt = calcPromoAmount(promo, baseFee);
                                const label = promo.valueType === "percent"
                                  ? `${parseFloat(promo.valueAmount)}%`
                                  : `${fmtMoney(parseFloat(promo.valueAmount))} đ`;
                                return (
                                  <label key={promo.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                                    <Checkbox
                                      checked={config.promotionKeys.includes(promo.id)}
                                      onCheckedChange={() => togglePromoKey(idx, promo.id)}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium">{promo.name}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {baseFee > 0 && promo.valueType === "percent"
                                          ? `-${fmtMoney(amt)} đ (${label})`
                                          : `-${label}`}
                                      </p>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    </TableCell>

                    {/* Phụ thu multi-select */}
                    <TableCell>
                      <Popover
                        open={openSurchargeIdx === idx}
                        onOpenChange={(v) => setOpenSurchargeIdx(v ? idx : null)}
                      >
                        <PopoverTrigger asChild>
                          <button className="w-full h-8 flex items-center justify-between px-2 rounded-md border bg-background hover:border-primary transition-colors text-[11px]">
                            <span className={surchargeAmt > 0 ? "text-orange-600 font-semibold" : "text-muted-foreground"}>
                              {surchargeAmt > 0 ? `+${fmtMoney(surchargeAmt)} đ` : "Chọn..."}
                            </span>
                            <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-2" align="start">
                          <p className="text-xs font-semibold mb-2 text-muted-foreground">Chọn phụ thu</p>
                          {surchargeOptions.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic py-2 text-center">Chưa có phụ thu nào</p>
                          ) : (
                            <div className="space-y-1.5">
                              {surchargeOptions.filter((s: any) => s.isActive).map((surcharge: any) => {
                                const amt = calcSurchargeAmount(surcharge, baseFee);
                                const label = surcharge.valueType === "percent"
                                  ? `${parseFloat(surcharge.valueAmount)}%`
                                  : `${fmtMoney(amt)} đ`;
                                return (
                                  <label key={surcharge.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                                    <Checkbox
                                      checked={config.surchargeKeys.includes(surcharge.id)}
                                      onCheckedChange={() => toggleSurchargeKey(idx, surcharge.id)}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium">{surcharge.name}</p>
                                      <p className="text-xs text-muted-foreground">+{label}</p>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    </TableCell>

                    <TableCell className="text-center">
                      <Switch
                        checked={config.autoInvoice}
                        onCheckedChange={(v) => updateStudentConfig(idx, { autoInvoice: v })}
                      />
                    </TableCell>
                    <TableCell>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 text-xs px-1">
                            <Info className="h-3 w-3 mr-1" />
                            {preview.length} buổi
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0">
                          <div className="p-3 border-b font-medium bg-muted/30 text-sm">
                            {hasNoSessions ? "Lịch học dự kiến (từ cấu hình lớp)" : "Xem lịch học dự kiến"}
                          </div>
                          <ScrollArea className="h-[250px]">
                            <div className="p-3 space-y-2">
                              {preview.map((p: any, pIdx: number) => (
                                <div key={p.id} className="flex justify-between text-xs border-b pb-1 last:border-0">
                                  <span>Buổi {pIdx + 1}: {format(new Date(p.sessionDate), "dd/MM/yyyy")}</span>
                                  <span className="text-muted-foreground">{p.shiftTemplate?.name}</span>
                                </div>
                              ))}
                              {preview.length === 0 && (
                                <div className="text-center py-4 text-muted-foreground text-xs italic">
                                  {hasNoSessions
                                    ? "Cấu hình lịch lớp bên trên để xem trước"
                                    : "Không có buổi học nào phù hợp"}
                                </div>
                              )}
                            </div>
                          </ScrollArea>
                          <div className="p-2 border-t bg-muted/10 text-[10px] flex justify-between">
                            <span>Bắt đầu: {preview.length > 0 ? format(new Date(preview[0].sessionDate), "dd/MM/yyyy") : "-"}</span>
                            <span>Kết thúc: {preview.length > 0 ? format(new Date(preview[preview.length - 1].sessionDate), "dd/MM/yyyy") : "-"}</span>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                  </TableRow>
                  {config.packageId && (() => {
                    const depositBalance = depositMap[config.studentId] ?? 0;
                    const remainingSessions = remainingSessionsMap[config.studentId]?.[config.packageId] ?? null;
                    const hasRemaining = remainingSessions !== null && remainingSessions > 0;
                    if (!config.autoInvoice && !hasRemaining) return null;
                    return (
                      <TableRow className="bg-blue-50/50 dark:bg-blue-950/20 border-t-0">
                        <TableCell colSpan={9} className="py-2 px-4">
                          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px]">
                            {config.autoInvoice && (
                              <>
                                <span className="text-muted-foreground font-medium">📋 Hoá đơn tự động:</span>
                                <span className="text-muted-foreground">
                                  Gói: <span className="font-medium text-foreground">{pkg?.name}</span>
                                  {pkg?.type === "buổi" && (
                                    <span className="ml-1 text-muted-foreground">({preview.length} buổi × {fmtMoney(parseFloat(pkg?.fee || "0"))}đ)</span>
                                  )}
                                </span>
                                <span className="text-muted-foreground">
                                  Tiền gốc: <span className="font-medium text-foreground">{fmtMoney(invoicePreview.base)}đ</span>
                                </span>
                                {invoicePreview.promo > 0 && (
                                  <span className="text-green-600">
                                    Khuyến mãi: <span className="font-medium">-{fmtMoney(invoicePreview.promo)}đ</span>
                                  </span>
                                )}
                                {invoicePreview.surcharge > 0 && (
                                  <span className="text-orange-600">
                                    Phụ thu: <span className="font-medium">+{fmtMoney(invoicePreview.surcharge)}đ</span>
                                  </span>
                                )}
                                <span className="font-semibold text-primary text-sm">
                                  Tổng: {fmtMoney(invoicePreview.grand)}đ
                                </span>
                              </>
                            )}
                            {hasRemaining && (
                              <span className="flex items-center gap-1 text-blue-600 font-medium">
                                <CalendarDays className="h-3 w-3" />
                                Còn {remainingSessions} buổi chưa được xếp lịch
                              </span>
                            )}
                            {config.autoInvoice && depositBalance > 0 && (
                              <>
                                <span className="flex items-center gap-1 text-amber-600 font-medium">
                                  <Wallet className="h-3 w-3" />
                                  Đặt cọc còn: {fmtMoney(depositBalance)} đ
                                </span>
                                <label className="flex items-center gap-1.5 cursor-pointer select-none text-foreground font-medium">
                                  <Checkbox
                                    checked={config.useDeposit}
                                    onCheckedChange={(v) => updateStudentConfig(idx, { useDeposit: !!v })}
                                    data-testid={`checkbox-use-deposit-${config.studentId}`}
                                  />
                                  Sử dụng cọc
                                </label>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })()}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button
            disabled={isPending || !isSchedConfigValid || studentConfigs.some(c =>
              (c.shiftType === "specific" && c.selectedShifts.length === 0)
            )}
            onClick={handleConfirm}
          >
            {isPending ? "Đang xử lý..." : "Xác nhận xếp lịch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
