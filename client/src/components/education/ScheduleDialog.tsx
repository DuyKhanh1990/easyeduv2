import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { VoucherHint } from "@/components/finance/VoucherHint";
import { Calendar, Info, ChevronDown, Wallet, AlertTriangle, CalendarDays, Plus, UserPlus, Search } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
import { Label } from "@/components/ui/label";

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
  const [isAutoInvoiceWarningOpen, setIsAutoInvoiceWarningOpen] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Internal list of students (starts from prop, grows as user adds more)
  const [internalStudents, setInternalStudents] = useState<any[]>(students);

  const [studentConfigs, setStudentConfigs] = useState<any[]>(
    students.map(s => {
      const fullName = s.student?.fullName || s.fullName || "N/A";
      const code = s.student?.code || s.code || "N/A";
      return {
        studentId: s.studentId || s.id,
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

  // ── "Thêm học viên" dialog state ────────────────────────────────────────────
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [addSearchTerm, setAddSearchTerm] = useState("");
  const [selectedAddIds, setSelectedAddIds] = useState<string[]>([]);
  const [justAddedToDialog, setJustAddedToDialog] = useState<any[]>([]);

  // ── "Thêm mới học viên" nested inside add-dialog ───────────────────────────
  const [isNestedQuickOpen, setIsNestedQuickOpen] = useState(false);
  const [nestedSaving, setNestedSaving] = useState(false);

  // ── "Thêm mới học viên" standalone (header button) ──────────────────────────
  const [isStandaloneQuickOpen, setIsStandaloneQuickOpen] = useState(false);
  const [standaloneSaving, setStandaloneSaving] = useState(false);

  // Shared quick-create form for both nested + standalone
  const emptyQF = () => ({
    locationId: classData?.locationId || "",
    type: "Học viên",
    code: "",
    fullName: "",
    username: "",
    password: "123456",
    dateOfBirth: "",
    phone: "",
    email: "",
    parentName: "",
    parentPhone: "",
  });
  const [qForm, setQForm] = useState(emptyQF());

  const setQF = (field: string, value: string) => {
    setQForm(f => {
      const u = { ...f, [field]: value };
      if (field === "code") u.username = value;
      if (field === "type") u.code = "";
      return u;
    });
  };

  const effectiveLocationId = locationId || classData?.locationId;

  // Fetch all courses for the course selector
  const { data: coursesList = [] } = useQuery<any[]>({
    queryKey: ["/api/courses"],
    enabled: isOpen,
  });

  // Fetch packages for the selected course, or all packages available at the
  // class location when the class has no course assigned yet.
  const feePackagesQueryKey = selectedCourseId
    ? `/api/courses/${selectedCourseId}/fee-packages`
    : `/api/fee-packages?locationId=${encodeURIComponent(effectiveLocationId || "")}`;
  const { data: feePackages = [] } = useQuery<any[]>({
    queryKey: [feePackagesQueryKey],
    enabled: isOpen && (!!selectedCourseId || !!effectiveLocationId),
  });

  // Fetch promotions & surcharges from finance config
  const { data: promotionOptions = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/promotions?type=promotion"],
  });

  const { data: surchargeOptions = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/promotions?type=surcharge"],
  });

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
      const res = await fetch(`/api/shift-templates?locationId=${effectiveLocationId}&type=class`);
      if (!res.ok) throw new Error("Failed to fetch shifts");
      return res.json();
    },
    enabled: hasNoSessions && !!effectiveLocationId && isOpen,
  });

  const { data: staffList = [] } = useQuery<any[]>({
    queryKey: ["/api/staff?minimal=true"],
    enabled: hasNoSessions && isOpen,
  });

  const activeTeachers = (staffList as any[]).map((s: any) => ({ ...s, _isActive: s.status === "Hoạt động" }));

  const studentIds = useMemo(
    () => internalStudents.map(s => s.studentId || s.id).filter(Boolean),
    [internalStudents]
  );

  // Batch: lấy existing sessions cho tất cả học viên — 1 request thay vì N
  const { data: sessionsBatch } = useQuery<Record<string, any[]>>({
    queryKey: [`/api/classes/${classData?.id}/students/sessions-batch`, studentIds],
    queryFn: async () => {
      if (!classData?.id || studentIds.length === 0) return {};
      const res = await fetch(`/api/classes/${classData.id}/students/sessions-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ studentIds }),
      });
      return res.json();
    },
    enabled: !!(classData?.id && studentIds.length > 0),
  });

  // Batch: lấy wallet summary cho tất cả học viên — 1 request thay vì N
  const { data: walletsBatch } = useQuery<Record<string, { summary: { hocPhi: number; datCoc: number; total: number } }>>({
    queryKey: ["/api/students/fee-wallets-batch", studentIds],
    queryFn: async () => {
      if (studentIds.length === 0) return {};
      const res = await fetch("/api/students/fee-wallets-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ studentIds }),
      });
      return res.json();
    },
    enabled: isOpen && studentIds.length > 0,
  });

  // Batch: lấy fee packages cho tất cả học viên — 1 request thay vì N
  const { data: feePackagesBatch } = useQuery<Record<string, any[]>>({
    queryKey: ["/api/students/fee-packages-batch", studentIds],
    queryFn: async () => {
      if (studentIds.length === 0) return {};
      const res = await fetch("/api/students/fee-packages-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ studentIds }),
      });
      return res.json();
    },
    enabled: isOpen && studentIds.length > 0,
  });

  // Map studentId -> deposit balance (datCoc)
  const depositMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (!walletsBatch) return map;
    for (const [sid, data] of Object.entries(walletsBatch)) {
      map[sid] = data?.summary?.datCoc ?? 0;
    }
    return map;
  }, [walletsBatch]);

  // Map: studentId -> { packageId -> remainingSessions }
  const remainingSessionsMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    if (!feePackagesBatch) return map;
    for (const [sid, packages] of Object.entries(feePackagesBatch)) {
      if (Array.isArray(packages) && packages.length > 0) {
        map[sid] = {};
        packages.forEach((pkg: any) => {
          if (pkg.packageId) map[sid][pkg.packageId] = pkg.remainingSessions ?? 0;
        });
      }
    }
    return map;
  }, [feePackagesBatch]);

  const existingSessionMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    if (!sessionsBatch) return map;
    for (const [studentId, sessions] of Object.entries(sessionsBatch)) {
      if (sessions) map[studentId] = new Set(sessions.map((ss: any) => ss.classSessionId));
    }
    return map;
  }, [sessionsBatch]);

  // ── Queries for add-student dialogs ─────────────────────────────────────────
  const { data: waitingStudentsList = [] } = useQuery<any[]>({
    queryKey: [`/api/classes/${classData?.id}/available-students`],
    enabled: isAddDialogOpen && !!classData?.id,
  });

  const { data: locationsList = [] } = useQuery<any[]>({
    queryKey: ["/api/locations"],
    enabled: isNestedQuickOpen || isStandaloneQuickOpen,
  });

  const { data: nextCodeData, refetch: refetchNextCode } = useQuery<{ code: string }>({
    queryKey: ["/api/students/next-code-sched", qForm.type],
    queryFn: async () => {
      const res = await fetch(`/api/students/next-code?type=${encodeURIComponent(qForm.type)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isNestedQuickOpen || isStandaloneQuickOpen,
  });

  useEffect(() => {
    if (isNestedQuickOpen || isStandaloneQuickOpen) {
      refetchNextCode();
      setQForm(emptyQF());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNestedQuickOpen, isStandaloneQuickOpen]);

  useEffect(() => {
    if ((isNestedQuickOpen || isStandaloneQuickOpen) && nextCodeData?.code) {
      setQForm(f => ({ ...f, code: nextCodeData.code, username: nextCodeData.code }));
    }
  }, [nextCodeData, isNestedQuickOpen, isStandaloneQuickOpen]);

  useEffect(() => {
    if (!isAddDialogOpen) {
      setJustAddedToDialog([]);
      setSelectedAddIds([]);
      setAddSearchTerm("");
    }
  }, [isAddDialogOpen]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const makeConfig = (s: any) => ({
    studentId: s.studentId || s.id,
    fullName: s.student?.fullName || s.fullName || "N/A",
    code: s.student?.code || s.code || "N/A",
    startDate: globalStart ?? new Date(),
    shiftType: "all",
    selectedShifts: [],
    endType: globalEndType,
    endDate: globalEnd ?? (classData?.endDate ? new Date(classData.endDate) : new Date()),
    totalSessions: globalSessions,
    packageId: globalPackageId || classData?.feePackageId || "",
    autoInvoice: true,
    promotionKeys: [] as string[],
    surchargeKeys: [] as string[],
    useDeposit: false,
  });

  const addStudentsToSchedule = (newStudents: any[]) => {
    const toAdd = newStudents.filter(s => {
      const sid = s.studentId || s.id;
      return !internalStudents.some(e => (e.studentId || e.id) === sid);
    });
    if (!toAdd.length) return;
    setInternalStudents(prev => [...prev, ...toAdd]);
    setStudentConfigs(prev => [...prev, ...toAdd.map(makeConfig)]);
  };

  const handleQuickCreate = async (isNested: boolean) => {
    if (!qForm.fullName.trim()) {
      toast({ title: "Lỗi", description: "Vui lòng nhập Tên học viên", variant: "destructive" }); return;
    }
    if (!qForm.code.trim()) {
      toast({ title: "Lỗi", description: "Vui lòng nhập Mã", variant: "destructive" }); return;
    }
    if (!qForm.locationId) {
      toast({ title: "Lỗi", description: "Vui lòng chọn Cơ sở", variant: "destructive" }); return;
    }
    if (isNested) setNestedSaving(true); else setStandaloneSaving(true);
    try {
      const res = await apiRequest("POST", "/api/students", {
        locationIds: [qForm.locationId],
        type: qForm.type,
        code: qForm.code.trim(),
        fullName: qForm.fullName.trim(),
        username: qForm.username.trim() || qForm.code.trim(),
        password: qForm.password || "123456",
        dateOfBirth: qForm.dateOfBirth || null,
        phone: qForm.phone || "",
        email: qForm.email || null,
        parentName: qForm.parentName || "",
        parentPhone: qForm.parentPhone || "",
      });
      const created = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      const studentObj = { studentId: created.id, id: created.id, student: { fullName: created.fullName, code: created.code }, fullName: created.fullName, code: created.code };
      if (isNested) {
        setJustAddedToDialog(prev => [studentObj, ...prev]);
        setSelectedAddIds(prev => [created.id, ...prev]);
        setIsNestedQuickOpen(false);
        toast({ title: "Đã tạo", description: `"${created.fullName}" đã thêm vào danh sách` });
      } else {
        addStudentsToSchedule([studentObj]);
        setIsStandaloneQuickOpen(false);
        toast({ title: "Đã tạo", description: `"${created.fullName}" đã thêm vào danh sách xếp lịch` });
      }
    } catch (err: any) {
      toast({ title: "Lỗi", description: err.message || "Không thể tạo học viên", variant: "destructive" });
    } finally {
      if (isNested) setNestedSaving(false); else setStandaloneSaving(false);
    }
  };

  const handleConfirmAddStudents = () => {
    const allAvailable = [...justAddedToDialog, ...(waitingStudentsList as any[]).filter(s => !justAddedToDialog.some(j => (j.studentId || j.id) === (s.studentId || s.id)))];
    const toAdd = allAvailable.filter(s => selectedAddIds.includes(s.studentId || s.id));
    addStudentsToSchedule(toAdd);
    setIsAddDialogOpen(false);
  };

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
    if (shiftId) {
      const compositeKey = `${s.weekday}_${shiftId}`;
      if (!acc.find(x => x.compositeKey === compositeKey)) {
        acc.push({
          compositeKey,
          id: shiftId,
          name: s.shiftTemplate?.name,
          weekday: s.weekday,
          startTime: s.shiftTemplate?.startTime
        });
      }
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
      const keySet = new Set(config.selectedShifts);
      filtered = effectiveSessions.filter((s: any) => {
        const shiftId = s.shiftTemplateId || s.shiftTemplate?.id;
        return keySet.has(`${s.weekday}_${shiftId}`);
      });
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

  const submitSchedule = () => {
    const configs = studentConfigs.map(c => ({
      ...c,
      selectedShiftKeys: c.shiftType === "specific" ? c.selectedShifts : [],
    }));
    onConfirm(configs, buildClassScheduleConfig());
  };

  const handleConfirm = () => {
    if (studentConfigs.some(config => config.autoInvoice)) {
      setIsAutoInvoiceWarningOpen(true);
      return;
    }
    submitSchedule();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[92vh] bg-slate-50 p-4 sm:p-5 flex flex-col gap-3">
        <DialogHeader className="space-y-2">
          <div className="flex flex-wrap justify-between items-center pr-8 gap-4">
            <div className="flex min-w-0 items-center gap-3 rounded-lg border bg-white px-3 py-2 shadow-sm">
              <DialogTitle>
                Xếp lịch học cho {internalStudents.length === 1 ? (internalStudents[0]?.student?.fullName || internalStudents[0]?.fullName || "học viên") : `${internalStudents.length} học viên`}
              </DialogTitle>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setIsAddDialogOpen(true)}>
                <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                Thêm học viên
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setIsStandaloneQuickOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Thêm mới học viên
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 rounded-lg border-0 bg-transparent p-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">Bắt đầu:</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 rounded-none border-0 border-b border-slate-300 bg-transparent px-1 text-xs shadow-none hover:bg-white/60 focus-visible:ring-0">
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
                  <SelectTrigger className="h-8 w-[110px] rounded-none border-0 border-b border-slate-300 bg-transparent px-1 text-xs shadow-none hover:border-primary focus:ring-0">
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
                      <Button variant="ghost" size="sm" className="h-8 rounded-none border-0 border-b border-slate-300 bg-transparent px-1 text-xs shadow-none hover:bg-white/60 focus-visible:ring-0">
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
                       className="h-8 w-16 rounded-none border-0 border-b border-slate-300 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
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
                  <SelectTrigger className="h-8 w-[160px] rounded-none border-0 border-b border-slate-300 bg-transparent px-1 text-xs shadow-none hover:border-primary focus:ring-0">
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
                <Select
                  value={globalPackageId}
                  onValueChange={setGlobalPackageId}
                  disabled={!selectedCourseId && !effectiveLocationId}
                >
                  <SelectTrigger className="h-8 w-[140px] rounded-none border-0 border-b border-slate-300 bg-transparent px-1 text-xs shadow-none hover:border-primary focus:ring-0">
                    <SelectValue placeholder={selectedCourseId || effectiveLocationId ? "Chọn gói" : "Chọn khoá trước"} />
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

        <div className="flex-1 min-h-0 min-w-0 overflow-x-auto overflow-y-auto pt-0 pb-2 space-y-3">

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
                            options={activeTeachers.map((t: any) => ({ value: t.id, label: t.fullName, isActive: t._isActive }))}
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
          <div className="min-w-[1700px]">
          <Table className="min-w-[1700px]" containerClassName="overflow-visible">
            <TableHeader>
              <TableRow className="sticky top-0 z-20 h-8 border-0 bg-slate-50 hover:bg-slate-50">
                <TableHead colSpan={4} className="h-8 rounded-tl-lg bg-sky-100 px-3 text-[11px] font-semibold uppercase tracking-wide text-sky-800">Lịch học</TableHead>
                <TableHead colSpan={3} className="h-8 bg-amber-100 px-3 text-[11px] font-semibold uppercase tracking-wide text-amber-800">Học phí</TableHead>
                <TableHead colSpan={2} className="h-8 rounded-tr-lg bg-violet-100 px-3 text-[11px] font-semibold uppercase tracking-wide text-violet-800">Hóa đơn & lịch dự kiến</TableHead>
              </TableRow>
              <TableRow className="sticky top-8 z-20 h-10 bg-white hover:bg-white [&>th]:whitespace-nowrap [&>th]:font-bold [&>th]:text-black">
                <TableHead className="w-[190px]">Học viên</TableHead>
                <TableHead className="w-[165px]">Ngày bắt đầu</TableHead>
                <TableHead className="w-[240px]">Chọn ca học</TableHead>
                <TableHead className="w-[240px]">Kết thúc</TableHead>
                <TableHead className="w-[240px]">Gói học phí</TableHead>
                <TableHead className="w-[180px]">Khuyến mãi</TableHead>
                <TableHead className="w-[180px]">Phụ thu</TableHead>
                  <TableHead className="w-[150px] py-2 align-middle">
                  <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                    <span className="text-[11px] leading-none">Hoá đơn tự động</span>
                    <Switch
                      className="h-4 w-7"
                      thumbClassName="h-3 w-3 data-[state=checked]:translate-x-3"
                      checked={globalAutoInvoice}
                      onCheckedChange={(v) => {
                        setGlobalAutoInvoice(v);
                        setStudentConfigs(prev => prev.map(config => ({ ...config, autoInvoice: v })));
                      }}
                    />
                  </div>
                </TableHead>
                <TableHead className="w-[110px]">Lịch</TableHead>
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
                  const remainingSessions = config.packageId
                    ? remainingSessionsMap[config.studentId]?.[config.packageId] ?? null
                    : null;
                  const hasStudentNote = !!config.packageId
                    && (config.autoInvoice || (remainingSessions !== null && remainingSessions > 0));
                    const selectedShiftLabels = availableShifts
                      .filter((s: any) => config.selectedShifts.includes(s.compositeKey))
                      .map((s: any) => `${formatWeekday(s.weekday)} ${s.startTime || ""}`.trim());

                return (
                  <>
                  <TableRow
                    key={config.studentId}
                    className={`${hasStudentNote ? "border-0" : "border-b border-slate-200/70"} bg-white [&>td]:border-b-0 [&>td]:whitespace-nowrap`}
                  >
                    <TableCell className="rounded-l-lg border-l-4 border-l-sky-300">
                      <div className="font-medium text-sm text-primary">{config.fullName}</div>
                      <div className="text-[10px] text-muted-foreground">{config.code}</div>
                    </TableCell>
                    <TableCell>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-full justify-start rounded-none border-0 border-b border-slate-300 bg-transparent px-1 font-normal text-xs shadow-none hover:bg-slate-100/70 focus-visible:ring-0">
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
                        <SelectTrigger className="h-8 w-full rounded-none border-0 border-b border-slate-300 bg-transparent px-1 text-xs shadow-none hover:border-primary focus:ring-0 [&>span]:line-clamp-none [&>span]:whitespace-nowrap">
                          <SelectValue placeholder="Chọn ca" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tất cả</SelectItem>
                          <SelectItem value="specific">Chọn ca</SelectItem>
                        </SelectContent>
                      </Select>
                      {config.shiftType === "specific" && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              className="mt-1.5 h-8 min-w-[240px] w-max max-w-none justify-between gap-2 rounded-none border-0 border-b border-slate-300 bg-transparent px-1 text-[10px] font-normal shadow-none hover:bg-slate-100/70 focus-visible:ring-0"
                              aria-label="Chọn ca học"
                            >
                              <span className={`shrink-0 whitespace-nowrap ${selectedShiftLabels.length ? "text-foreground" : "text-muted-foreground"}`}>
                                {selectedShiftLabels.length ? selectedShiftLabels.join("; ") : "Chọn ca học"}
                              </span>
                              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-[240px] p-2">
                            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Chọn ca học</p>
                            <div className="max-h-48 space-y-1 overflow-y-auto">
                              {availableShifts.map((s: any) => (
                                <label key={s.compositeKey} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted/60">
                                  <Checkbox
                                    id={`shift-${idx}-${s.compositeKey}`}
                                    checked={config.selectedShifts.includes(s.compositeKey)}
                                    onCheckedChange={(checked) => {
                                      const next = checked
                                        ? [...config.selectedShifts, s.compositeKey]
                                        : config.selectedShifts.filter((k: string) => k !== s.compositeKey);
                                      updateStudentConfig(idx, { selectedShifts: next });
                                    }}
                                  />
                                  <span className="min-w-0 text-[11px]">
                                    {formatWeekday(s.weekday)} {s.startTime} <span className="text-muted-foreground">({s.name})</span>
                                  </span>
                                </label>
                              ))}
                            </div>
                            {config.selectedShifts.length === 0 && (
                              <p className="mt-1.5 text-[10px] text-destructive italic">Vui lòng chọn ít nhất 1 ca</p>
                            )}
                          </PopoverContent>
                        </Popover>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 whitespace-nowrap">
                        <Select
                          value={config.endType}
                          onValueChange={(v: any) => updateStudentConfig(idx, { endType: v })}
                        >
                          <SelectTrigger className="h-8 w-[108px] min-w-[108px] rounded-none border-0 border-b border-slate-300 bg-transparent px-1 text-xs shadow-none hover:border-primary focus:ring-0">
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
                              <Button variant="ghost" size="sm" className="h-8 w-[122px] shrink-0 justify-start rounded-none border-0 border-b border-slate-300 bg-transparent px-1 font-normal text-xs shadow-none hover:bg-slate-100/70 focus-visible:ring-0">
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
                              className="h-8 w-[84px] text-xs"
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
                        <SelectTrigger className="h-8 w-full min-w-[220px] rounded-none border-0 border-b border-slate-300 bg-transparent px-1 text-xs shadow-none hover:border-primary focus:ring-0 [&>span]:line-clamp-none [&>span]:whitespace-nowrap">
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
                           <button className="flex h-8 w-full items-center justify-between rounded-none border-0 border-b border-slate-300 bg-transparent px-1 text-[11px] whitespace-nowrap transition-colors hover:border-primary hover:bg-slate-100/70">
                            <span className={`whitespace-nowrap ${promoAmt > 0 ? "text-green-600 font-semibold" : "text-muted-foreground"}`}>
                              {promoAmt > 0 ? `-${fmtMoney(promoAmt)} đ` : "Chọn..."}
                            </span>
                            <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          </button>
                        </PopoverTrigger>
                        <VoucherHint
                          studentId={config.studentId}
                          asOfDate={format(config.startDate, "yyyy-MM-dd")}
                        />
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
                           <button className="flex h-8 w-full items-center justify-between rounded-none border-0 border-b border-slate-300 bg-transparent px-1 text-[11px] whitespace-nowrap transition-colors hover:border-primary hover:bg-slate-100/70">
                            <span className={`whitespace-nowrap ${surchargeAmt > 0 ? "text-orange-600 font-semibold" : "text-muted-foreground"}`}>
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

                    <TableCell className="align-middle text-center">
                      <div className="flex items-center justify-center">
                        <Switch
                          className="h-4 w-7"
                          thumbClassName="h-3 w-3 data-[state=checked]:translate-x-3"
                          checked={config.autoInvoice}
                          onCheckedChange={(v) => updateStudentConfig(idx, { autoInvoice: v })}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 text-xs px-1">
                            <Info className="h-3 w-3 mr-1" />
                            {config.endType === "sessions" && config.totalSessions > preview.length
                              ? config.totalSessions
                              : preview.length} buổi
                            {config.endType === "sessions" && config.totalSessions > preview.length && (
                              <span className="ml-1 text-amber-600 text-[10px]">(+{config.totalSessions - preview.length} tạo thêm)</span>
                            )}
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
                      <TableRow className="border-b border-slate-200/70 bg-white">
                        <TableCell colSpan={9} className="border-0 px-4 pb-2 pt-0">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 pt-0 text-[10px]">
                            {config.autoInvoice && (
                              <>
                                <span className="text-muted-foreground font-medium">Hoá đơn tự động:</span>
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
                                <span className="font-semibold text-primary text-[10px]">
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

      <Dialog open={isAutoInvoiceWarningOpen} onOpenChange={setIsAutoInvoiceWarningOpen}>
        <DialogContent className="z-[150] max-w-md">
          <DialogHeader>
            <DialogTitle>Cảnh báo</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Bạn đang bật hoá đơn tự động. Bạn có muốn tiếp tục?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAutoInvoiceWarningOpen(false)}>
              Huỷ
            </Button>
            <Button onClick={() => {
              setIsAutoInvoiceWarningOpen(false);
              submitSchedule();
            }}>
              Tiếp tục
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── "Thêm học viên" dialog ──────────────────────────────────────────── */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-2xl z-[150]">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle>Thêm học viên vào lịch</DialogTitle>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setIsNestedQuickOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Thêm mới học viên
              </Button>
            </div>
          </DialogHeader>

          {/* Nested quick-create inside "Thêm học viên" dialog */}
          <Dialog open={isNestedQuickOpen} onOpenChange={setIsNestedQuickOpen}>
            <DialogContent className="max-w-xl z-[200]">
              <DialogHeader><DialogTitle>Thêm mới học viên nhanh</DialogTitle></DialogHeader>
              {_renderQuickForm()}
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNestedQuickOpen(false)} disabled={nestedSaving}>Hủy</Button>
                <Button onClick={() => handleQuickCreate(true)} disabled={nestedSaving}>
                  {nestedSaving ? "Đang lưu..." : "Lưu & thêm vào danh sách"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="space-y-4 py-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Tìm theo tên / mã học viên..." className="pl-8" value={addSearchTerm} onChange={e => setAddSearchTerm(e.target.value)} />
            </div>
            <ScrollArea className="h-[300px] border rounded-md p-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead>Tên học viên</TableHead>
                    <TableHead>Mã</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {justAddedToDialog.map((s: any) => (
                    <TableRow key={s.studentId || s.id} className="bg-primary/5">
                      <TableCell>
                        <Checkbox checked={selectedAddIds.includes(s.studentId || s.id)} onCheckedChange={checked => {
                          const sid = s.studentId || s.id;
                          if (checked) setSelectedAddIds(p => [...p, sid]); else setSelectedAddIds(p => p.filter(id => id !== sid));
                        }} />
                      </TableCell>
                      <TableCell className="font-medium text-primary">{s.student?.fullName || s.fullName}</TableCell>
                      <TableCell className="text-primary">{s.student?.code || s.code}</TableCell>
                    </TableRow>
                  ))}
                  {(waitingStudentsList as any[])
                    .filter(s => !justAddedToDialog.some(j => (j.studentId || j.id) === (s.studentId || s.id)))
                    .filter(s => !internalStudents.some(e => (e.studentId || e.id) === (s.studentId || s.id)))
                    .filter(s => {
                      const name = s.student?.fullName || s.fullName || "";
                      const code = s.student?.code || s.code || "";
                      const q = addSearchTerm.toLowerCase();
                      return !q || name.toLowerCase().includes(q) || code.toLowerCase().includes(q);
                    })
                    .map((s: any) => (
                      <TableRow key={s.studentId || s.id}>
                        <TableCell>
                          <Checkbox checked={selectedAddIds.includes(s.studentId || s.id)} onCheckedChange={checked => {
                            const sid = s.studentId || s.id;
                            if (checked) setSelectedAddIds(p => [...p, sid]); else setSelectedAddIds(p => p.filter(id => id !== sid));
                          }} />
                        </TableCell>
                        <TableCell>{s.student?.fullName || s.fullName}</TableCell>
                        <TableCell>{s.student?.code || s.code}</TableCell>
                      </TableRow>
                    ))}
                  {(waitingStudentsList as any[]).filter(s => !internalStudents.some(e => (e.studentId || e.id) === (s.studentId || s.id))).length === 0 && justAddedToDialog.length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Không có học viên nào trong danh sách chờ</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Hủy</Button>
            <Button disabled={selectedAddIds.length === 0} onClick={handleConfirmAddStudents}>
              Thêm đã chọn ({selectedAddIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Standalone "Thêm mới học viên" dialog ──────────────────────────── */}
      <Dialog open={isStandaloneQuickOpen} onOpenChange={setIsStandaloneQuickOpen}>
        <DialogContent className="max-w-xl z-[150]">
          <DialogHeader><DialogTitle>Thêm mới học viên nhanh</DialogTitle></DialogHeader>
          {_renderQuickForm()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStandaloneQuickOpen(false)} disabled={standaloneSaving}>Hủy</Button>
            <Button onClick={() => handleQuickCreate(false)} disabled={standaloneSaving}>
              {standaloneSaving ? "Đang lưu..." : "Lưu & thêm vào xếp lịch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );

  function _renderQuickForm() {
    return (
      <div className="space-y-4 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Cơ sở <span className="text-destructive">*</span></Label>
            <Select value={qForm.locationId} onValueChange={v => setQF("locationId", v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Chọn cơ sở..." /></SelectTrigger>
              <SelectContent>
                {(locationsList as any[]).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Phân loại</Label>
            <Select value={qForm.type} onValueChange={v => setQF("type", v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Học viên">Học viên</SelectItem>
                <SelectItem value="Phụ huynh">Phụ huynh</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Mã <span className="text-destructive">*</span></Label>
            <Input className="h-9 text-sm" value={qForm.code} onChange={e => setQF("code", e.target.value)} placeholder="VD: HV-01" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Tên <span className="text-destructive">*</span></Label>
            <Input className="h-9 text-sm" value={qForm.fullName} onChange={e => setQF("fullName", e.target.value)} placeholder="Họ và tên..." />
          </div>
        </div>
        <div className="border-t pt-3">
          <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">Thông tin bổ sung</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Tài khoản</Label>
              <Input className="h-9 text-sm" value={qForm.username} onChange={e => setQForm(f => ({ ...f, username: e.target.value }))} placeholder="Tự sinh theo Mã" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Mật khẩu</Label>
              <Input className="h-9 text-sm" value={qForm.password} onChange={e => setQF("password", e.target.value)} placeholder="123456" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Sinh nhật</Label>
              <Input type="date" className="h-9 text-sm" value={qForm.dateOfBirth} onChange={e => setQF("dateOfBirth", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Số điện thoại</Label>
              <Input className="h-9 text-sm" value={qForm.phone} onChange={e => setQF("phone", e.target.value)} placeholder="SĐT..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Email</Label>
              <Input className="h-9 text-sm" value={qForm.email} onChange={e => setQF("email", e.target.value)} placeholder="Email..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Họ tên Phụ huynh 1</Label>
              <Input className="h-9 text-sm" value={qForm.parentName} onChange={e => setQF("parentName", e.target.value)} placeholder="Tên phụ huynh..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">SĐT Phụ huynh 1</Label>
              <Input className="h-9 text-sm" value={qForm.parentPhone} onChange={e => setQF("parentPhone", e.target.value)} placeholder="SĐT phụ huynh..." />
            </div>
          </div>
        </div>
      </div>
    );
  }
}
