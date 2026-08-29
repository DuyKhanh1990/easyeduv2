import { useState, Fragment, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { AlertCircle, CheckCircle2, Eye, Calendar, Info, ChevronDown, Wallet, CalendarDays, Check, ChevronsUpDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { format } from "date-fns";
import { useClasses } from "@/hooks/use-classes";
import { useToast } from "@/hooks/use-toast";
import { fmtMoney } from "@/types/invoice-types";
import { VoucherHint } from "@/components/finance/VoucherHint";
import { useQuery, useQueries, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

interface StudentEnrollmentInfo {
  studentId: string;
  fullName: string;
  status: "waiting" | "active";
}

interface StudentData {
  id: string;
  fullName: string;
}

interface AssignClassNewDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  studentIds: string[];
  students?: StudentData[];
  studentCount: number;
  locationId?: string;
}

export function AssignClassNewDialog({
  isOpen,
  onOpenChange,
  studentIds,
  students = [],
  studentCount,
  locationId,
}: AssignClassNewDialogProps) {
  const { toast } = useToast();
  const { data: classesData } = useClasses(locationId, { enabled: isOpen, minimal: true });
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [classPickerOpen, setClassPickerOpen] = useState(false);
  const [classInfo, setClassInfo] = useState<any>(null);
  const [existingStudents, setExistingStudents] = useState<StudentEnrollmentInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Two-phase flow states
  const [phase, setPhase] = useState<"assign" | "schedule">("assign");
  const [assignedStudentIds, setAssignedStudentIds] = useState<string[]>([]);
  const [classSessions, setClassSessions] = useState<any[]>([]);

  // Schedule configuration states
  const [globalStart, setGlobalStart] = useState<Date | undefined>();
  const [globalEndType, setGlobalEndType] = useState<"date" | "sessions">("date");
  const [globalEnd, setGlobalEnd] = useState<Date | undefined>();
  const [globalSessions, setGlobalSessions] = useState<number>(20);
  const [globalPackageId, setGlobalPackageId] = useState<string>("");
  const [globalAutoInvoice, setGlobalAutoInvoice] = useState<boolean>(true);
  const [studentConfigs, setStudentConfigs] = useState<any[]>([]);
  const [openPromoIdx, setOpenPromoIdx] = useState<number | null>(null);
  const [openSurchargeIdx, setOpenSurchargeIdx] = useState<number | null>(null);
  const [isAutoInvoiceWarningOpen, setIsAutoInvoiceWarningOpen] = useState(false);

  const { data: promotionOptions = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/promotions?type=promotion"],
    enabled: phase === "schedule",
  });
  const { data: surchargeOptions = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/promotions?type=surcharge"],
    enabled: phase === "schedule",
  });

  // Fetch wallet for each assigned student to get deposit balance
  const walletQueries = useQueries({
    queries: assignedStudentIds.map(id => ({
      queryKey: ["/api/students", id, "fee-wallet"],
      queryFn: () => fetch(`/api/students/${id}/fee-wallet`, { credentials: "include" }).then(r => r.json()),
      enabled: phase === "schedule" && !!id,
    })),
  });

  const depositMap = useMemo(() => {
    const map: Record<string, number> = {};
    assignedStudentIds.forEach((id, idx) => {
      const data = walletQueries[idx]?.data as any;
      if (data?.summary) {
        map[id] = data.summary.datCoc ?? 0;
      }
    });
    return map;
  }, [walletQueries, assignedStudentIds]);

  // Fetch fee packages for each assigned student to get remaining session counts
  const feePackageQueries = useQueries({
    queries: assignedStudentIds.map(id => ({
      queryKey: ["/api/students", id, "fee-packages"],
      queryFn: () => fetch(`/api/students/${id}/fee-packages`, { credentials: "include" }).then(r => r.json()),
      enabled: phase === "schedule" && !!id,
    })),
  });

  // Map: studentId -> { packageId -> remainingSessions }
  const remainingSessionsMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    assignedStudentIds.forEach((id, idx) => {
      const raw = feePackageQueries[idx]?.data as any;
      const packages: any[] = Array.isArray(raw) ? raw : (raw?.packages ?? []);
      if (packages.length > 0) {
        map[id] = {};
        packages.forEach((pkg: any) => {
          if (pkg.packageId) {
            map[id][pkg.packageId] = pkg.remainingSessions ?? 0;
          }
        });
      }
    });
    return map;
  }, [feePackageQueries, assignedStudentIds]);

  const getPackage = (packageId: string) =>
    classInfo?.course?.feePackages?.find((p: any) => p.id === packageId);

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
    (promotionOptions as any[])
      .filter((p: any) => (config.promotionKeys || []).includes(p.id))
      .reduce((sum: number, p: any) => sum + calcPromoAmount(p, base), 0);

  const getTotalSurchargeAmount = (config: any, base: number) =>
    (surchargeOptions as any[])
      .filter((s: any) => (config.surchargeKeys || []).includes(s.id))
      .reduce((sum: number, s: any) => sum + calcSurchargeAmount(s, base), 0);

  const calcInvoicePreview = (config: any, numSessions: number) => {
    const base = calcBaseAmount(config, numSessions);
    const promo = getTotalPromoAmount(config, base);
    const surcharge = getTotalSurchargeAmount(config, base);
    const grand = Math.max(0, base - promo + surcharge);
    return { base, promo, surcharge, grand };
  };

  const togglePromoKey = (idx: number, id: string) => {
    const config = studentConfigs[idx];
    const keys = config.promotionKeys || [];
    const next = keys.includes(id) ? keys.filter((k: string) => k !== id) : [...keys, id];
    updateStudentConfig(idx, { promotionKeys: next });
  };

  const toggleSurchargeKey = (idx: number, id: string) => {
    const config = studentConfigs[idx];
    const keys = config.surchargeKeys || [];
    const next = keys.includes(id) ? keys.filter((k: string) => k !== id) : [...keys, id];
    updateStudentConfig(idx, { surchargeKeys: next });
  };

  // Schedule mutation
  const scheduleMutation = useMutation({
    mutationFn: async (configs: any[]) => {
      return apiRequest("POST", `/api/classes/${selectedClassId}/schedule-students`, {
        configs: configs
      });
    },
    onSuccess: () => {
      toast({
        title: "Thành công",
        description: "Xếp lịch cho học viên thành công",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/classes", selectedClassId] });
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      queryClient.invalidateQueries({
        predicate: (query) => {
          const k0 = query.queryKey[0];
          return typeof k0 === "string" && k0.startsWith("/api/my-space/calendar");
        },
      });
      onOpenChange(false);
      setSelectedClassId("");
      setClassInfo(null);
      setExistingStudents([]);
      setPhase("assign");
      setAssignedStudentIds([]);
      setClassSessions([]);
      setStudentConfigs([]);
    },
    onError: () => {
      toast({
        title: "Lỗi",
        description: "Không thể xếp lịch cho học viên",
        variant: "destructive",
      });
    }
  });

  const handleClassSelect = async (classId: string) => {
    setSelectedClassId(classId);
    setClassInfo(null);
    setExistingStudents([]);

    const selected = classesData?.find((c: any) => c.id === classId);
    if (!selected) return;

    try {
      setIsLoading(true);

      const res = await fetch(`/api/classes/${classId}/assign-info`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch class info");
      const info = await res.json();

      const existingStudentEnrollments: StudentEnrollmentInfo[] = (info.enrolledStudents || [])
        .filter((e: any) => studentIds.includes(e.studentId))
        .map((e: any) => ({
          studentId: e.studentId,
          fullName: e.fullName,
          status: e.status as "waiting" | "active",
        }));

      setExistingStudents(existingStudentEnrollments);
      setClassInfo(info);
    } catch (error) {
      console.error(error);
      toast({
        title: "Lỗi",
        description: "Không thể tải thông tin lớp",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedClassId) return;

    const existingStudentIds = existingStudents.map((e) => e.studentId);
    const newStudentIds = studentIds.filter((id) => !existingStudentIds.includes(id));

    if (newStudentIds.length === 0) {
      toast({
        title: "Thông báo",
        description: "Tất cả học viên đã có trong lớp",
        variant: "default",
      });
      return;
    }

    try {
      setIsLoading(true);
      await apiRequest("POST", `/api/classes/${selectedClassId}/add-students`, {
        studentIds: newStudentIds,
      });

      toast({
        title: "Thành công",
        description: `Gán ${newStudentIds.length} học viên vào lớp`,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });

      setAssignedStudentIds(newStudentIds);

      try {
        const res = await fetch(`/api/classes/${selectedClassId}/sessions`, { credentials: "include" });
        if (res.ok) {
          const sessions = await res.json();
          setClassSessions(sessions || []);
        }
      } catch (err) {
        console.error("Failed to fetch sessions:", err);
      }

      const newStudentObjs = students.filter((s) => newStudentIds.includes(s.id));
      setStudentConfigs(
        newStudentObjs.map((s) => ({
          studentId: s.id,
          fullName: s.fullName,
          code: s.fullName,
          startDate: classInfo?.startDate ? new Date(classInfo.startDate) : new Date(),
          shiftType: "all",
          selectedShifts: [],
          endType: "date",
          endDate: classInfo?.endDate ? new Date(classInfo.endDate) : new Date(),
          totalSessions: 20,
          packageId: classInfo?.course?.feePackages?.[0]?.id || "",
          autoInvoice: true,
          promotionKeys: [],
          surchargeKeys: [],
          useDeposit: false,
        }))
      );

      setGlobalStart(classInfo?.startDate ? new Date(classInfo.startDate) : new Date());
      setGlobalEnd(classInfo?.endDate ? new Date(classInfo.endDate) : new Date());
      setGlobalPackageId(classInfo?.course?.feePackages?.[0]?.id || "");

      setPhase("schedule");
    } catch (error) {
      console.error(error);
      toast({
        title: "Lỗi",
        description: "Không thể gán học viên vào lớp",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateStudentConfig = (index: number, updates: any) => {
    setStudentConfigs((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const applyGlobal = () => {
    setStudentConfigs((prev) =>
      prev.map((config) => ({
        ...config,
        startDate: globalStart || config.startDate,
        endType: globalEndType,
        endDate: globalEndType === "date" ? (globalEnd || config.endDate) : config.endDate,
        totalSessions: globalEndType === "sessions" ? globalSessions : config.totalSessions,
        packageId: globalPackageId || config.packageId,
        autoInvoice: globalAutoInvoice,
      }))
    );
  };

  const getPreviewSessions = (config: any) => {
    if (!classSessions) return [];

    let filtered = classSessions;
    if (config.shiftType === "specific" && config.selectedShifts.length > 0) {
      const keySet = new Set<string>(config.selectedShifts);
      filtered = classSessions.filter((s: any) => {
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

    return sessions;
  };

  const formatWeekday = (wd: number) => {
    const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    return days[wd] || "";
  };

  const availableShifts = classSessions
    ?.reduce((acc: any[], s: any) => {
      const shiftId = s.shiftTemplateId || s.shiftTemplate?.id;
      if (shiftId) {
        const compositeKey = `${s.weekday}_${shiftId}`;
        if (!acc.find((x) => x.compositeKey === compositeKey)) {
          acc.push({
            compositeKey,
            id: shiftId,
            name: s.shiftTemplate?.name,
            weekday: s.weekday,
            startTime: s.shiftTemplate?.startTime,
          });
        }
      }
      return acc;
    }, [])
    .sort((a: any, b: any) => {
      if (a.weekday !== b.weekday) return a.weekday - b.weekday;
      return (a.startTime || "").localeCompare(b.startTime || "");
    }) || [];

  const daysOfWeek = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const weekdaysDisplay =
    classInfo?.weekdays
      ?.map((day: number) => daysOfWeek[day] || "")
      .filter(Boolean)
      .join(", ") || "Chưa có";

  const newStudentCount = studentIds.length - existingStudents.length;
  const hasConflict = existingStudents.length > 0;

  const handleClose = (open: boolean) => {
    if (!open) {
      setPhase("assign");
      setAssignedStudentIds([]);
      setClassSessions([]);
      setStudentConfigs([]);
      setSelectedClassId("");
      setClassInfo(null);
      setExistingStudents([]);
    }
    onOpenChange(open);
  };

  const submitSchedule = () => {
    scheduleMutation.mutate(
      studentConfigs.map(c => ({
        ...c,
        selectedShiftKeys: c.shiftType === "specific" ? c.selectedShifts : undefined,
      }))
    );
  };

  const handleScheduleConfirm = () => {
    if (studentConfigs.some(config => config.autoInvoice)) {
      setIsAutoInvoiceWarningOpen(true);
      return;
    }
    submitSchedule();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className={phase === "schedule" ? "max-w-[95vw] w-[95vw] max-h-[92vh] bg-slate-50 p-4 sm:p-5 flex flex-col gap-3" : "max-w-2xl"}>
        <DialogHeader className="space-y-2">
          {phase === "assign" ? (
            <DialogTitle>Gán lớp cho học viên</DialogTitle>
          ) : (
            <div className="flex flex-wrap justify-between items-center pr-8 gap-4">
              <div className="flex min-w-0 items-center rounded-lg border bg-white px-3 py-2 shadow-sm">
                <DialogTitle>Xếp lịch học cho {assignedStudentIds.length} học viên</DialogTitle>
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
                    <Input type="number" className="h-8 w-16 rounded-none border-0 border-b border-slate-300 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0" value={globalSessions} onChange={(e) => setGlobalSessions(parseInt(e.target.value) || 0)} />
                      <span className="text-xs">buổi</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">Gói:</span>
                  <Select value={globalPackageId} onValueChange={setGlobalPackageId}>
                    <SelectTrigger className="h-8 w-[140px] rounded-none border-0 border-b border-slate-300 bg-transparent px-1 text-xs shadow-none hover:border-primary focus:ring-0">
                      <SelectValue placeholder="Chọn gói" />
                    </SelectTrigger>
                    <SelectContent>
                      {classInfo?.course?.feePackages?.map((pkg: any) => (
                        <SelectItem key={pkg.id} value={pkg.id}>{pkg.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" variant="default" className="h-8 text-xs" onClick={applyGlobal}>Áp dụng tất cả</Button>
              </div>
            </div>
          )}
        </DialogHeader>

        {phase === "assign" ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Chọn lớp</label>
              <Popover open={classPickerOpen} onOpenChange={setClassPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={classPickerOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selectedClassId
                      ? (() => {
                          const selectedClass = classesData?.find((cls: any) => cls.id === selectedClassId);
                          return selectedClass ? `${selectedClass.classCode} - ${selectedClass.name}` : "Chọn lớp để gán";
                        })()
                      : "Chọn lớp để gán"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Tìm theo mã hoặc tên lớp..." />
                    <CommandList>
                      <CommandEmpty>Không tìm thấy lớp phù hợp.</CommandEmpty>
                      {classesData?.map((cls: any) => (
                        <CommandItem
                          key={cls.id}
                          value={`${cls.classCode} ${cls.name}`}
                          onSelect={() => {
                            handleClassSelect(cls.id);
                            setClassPickerOpen(false);
                          }}
                        >
                          <Check className={`mr-2 h-4 w-4 ${selectedClassId === cls.id ? "opacity-100" : "opacity-0"}`} />
                          {cls.classCode} - {cls.name}
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {classInfo && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{classInfo.classCode} - {classInfo.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Giáo viên</p>
                      <p className="font-medium">{classInfo.teacher?.fullName || "Chưa gán"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Học viên chờ</p>
                      <p className="font-medium">{classInfo.waitingStudentsCount || 0}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Học viên chính thức</p>
                      <p className="font-medium">
                        {classInfo.activeStudentsCount || 0}/{classInfo.maxStudents || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Chu kỳ học</p>
                      <p className="font-medium">{weekdaysDisplay}</p>
                    </div>
                    {classInfo.shiftTemplate && (
                      <div className="col-span-2">
                        <p className="text-sm text-muted-foreground">Ca học</p>
                        <p className="font-medium">
                          {classInfo.shiftTemplate.startTime}
                        </p>
                      </div>
                    )}
                  </div>

                  {hasConflict && (
                    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-amber-900">Học viên đã có trong lớp</p>
                            <p className="text-amber-800 mt-1">
                              {existingStudents.length}/{studentCount} học viên đã có trong lớp
                            </p>
                          </div>
                          <button
                            onClick={() => setShowDetailModal(true)}
                            className="text-amber-700 hover:text-amber-900 p-2 hover:bg-amber-100 rounded transition-colors flex-shrink-0"
                            title="Xem chi tiết"
                          >
                            <Eye className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {newStudentCount > 0 && !hasConflict && (
                    <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-green-900">Sẵn sàng gán</p>
                        <p className="text-green-800 mt-1">Sẽ gán {newStudentCount} học viên vào lớp</p>
                      </div>
                    </div>
                  )}

                  {hasConflict && newStudentCount === 0 && (
                    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-amber-900">Tất cả học viên đã có trong lớp</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Hủy
              </Button>
              <Button
                onClick={handleAssign}
                disabled={!selectedClassId || !classInfo || newStudentCount === 0 || isLoading}
                loading={isLoading}
              >
                Lưu Gán lớp ({newStudentCount > 0 ? newStudentCount : 0})
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0 min-w-0 overflow-x-auto overflow-y-auto pt-0 pb-2">
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
                      <Fragment key={config.studentId}>
                        <TableRow
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
                              <SelectTrigger className="h-8 w-[108px] min-w-[108px] rounded-none border-0 border-b border-slate-300 bg-transparent px-1 text-xs shadow-none hover:border-primary focus:ring-0 [&>span]:line-clamp-none [&>span]:whitespace-nowrap">
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
                                <SelectTrigger className="h-8 w-full rounded-none border-0 border-b border-slate-300 bg-transparent px-1 text-xs shadow-none hover:border-primary focus:ring-0">
                                <SelectValue placeholder="Chọn gói" />
                              </SelectTrigger>
                              <SelectContent>
                                {classInfo?.course?.feePackages?.map((p: any) => (
                                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>

                          <TableCell>
                            <Popover
                              open={openPromoIdx === idx}
                              onOpenChange={(v) => setOpenPromoIdx(v ? idx : null)}
                            >
                              <PopoverTrigger asChild>
                               <button className="flex h-8 w-full items-center justify-between rounded-none border-0 border-b border-slate-300 bg-transparent px-1 text-[11px] whitespace-nowrap transition-colors hover:border-primary hover:bg-slate-100/70">
                                  <span className={`whitespace-nowrap ${promoAmt > 0 ? "text-green-600 font-semibold" : "text-muted-foreground"}`}>
                                    {promoAmt > 0 ? `-${fmtMoney(promoAmt)}` : "Chọn..."}
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
                                {(promotionOptions as any[]).length === 0 ? (
                                  <p className="text-xs text-muted-foreground italic py-2 text-center">Chưa có khuyến mãi nào</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {(promotionOptions as any[]).filter((p: any) => p.isActive).map((promo: any) => {
                                      const amt = calcPromoAmount(promo, baseFee);
                                      const label = promo.valueType === "percent"
                                        ? `${parseFloat(promo.valueAmount)}%`
                                        : `${fmtMoney(parseFloat(promo.valueAmount))}`;
                                      return (
                                        <label key={promo.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                                          <Checkbox
                                            checked={(config.promotionKeys || []).includes(promo.id)}
                                            onCheckedChange={() => togglePromoKey(idx, promo.id)}
                                          />
                                          <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium">{promo.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                              {baseFee > 0 && promo.valueType === "percent"
                                                ? `-${fmtMoney(amt)} (${label})`
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

                          <TableCell>
                            <Popover
                              open={openSurchargeIdx === idx}
                              onOpenChange={(v) => setOpenSurchargeIdx(v ? idx : null)}
                            >
                              <PopoverTrigger asChild>
                               <button className="flex h-8 w-full items-center justify-between rounded-none border-0 border-b border-slate-300 bg-transparent px-1 text-[11px] whitespace-nowrap transition-colors hover:border-primary hover:bg-slate-100/70">
                                  <span className={`whitespace-nowrap ${surchargeAmt > 0 ? "text-orange-600 font-semibold" : "text-muted-foreground"}`}>
                                    {surchargeAmt > 0 ? `+${fmtMoney(surchargeAmt)}` : "Chọn..."}
                                  </span>
                                  <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-56 p-2" align="start">
                                <p className="text-xs font-semibold mb-2 text-muted-foreground">Chọn phụ thu</p>
                                {(surchargeOptions as any[]).length === 0 ? (
                                  <p className="text-xs text-muted-foreground italic py-2 text-center">Chưa có phụ thu nào</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {(surchargeOptions as any[]).filter((s: any) => s.isActive).map((surcharge: any) => {
                                      const amt = calcSurchargeAmount(surcharge, baseFee);
                                      const label = surcharge.valueType === "percent"
                                        ? `${parseFloat(surcharge.valueAmount)}%`
                                        : `${fmtMoney(amt)}`;
                                      return (
                                        <label key={surcharge.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                                          <Checkbox
                                            checked={(config.surchargeKeys || []).includes(surcharge.id)}
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
                                  {preview.length} buổi
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[300px] p-0">
                                <div className="p-3 border-b font-medium bg-muted/30 text-sm">
                                  Xem lịch học dự kiến
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
                                        Không có buổi học nào phù hợp
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
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            </div>

            <DialogFooter className="border-t pt-4">
              <Button
                variant="outline"
                onClick={async () => {
                  setPhase("assign");
                  setAssignedStudentIds([]);
                  setClassSessions([]);
                  setStudentConfigs([]);
                  if (selectedClassId) {
                    await handleClassSelect(selectedClassId);
                  }
                }}
              >
                Quay lại
              </Button>
              <Button
                disabled={scheduleMutation.isPending || studentConfigs.some(c =>
                  (c.shiftType === "specific" && c.selectedShifts.length === 0)
                )}
                onClick={handleScheduleConfirm}
              >
                {scheduleMutation.isPending ? "Đang xử lý..." : "Xác nhận xếp lịch"}
              </Button>
            </DialogFooter>
          </>
        )}
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

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Thông tin học viên gán lớp</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {studentIds.map((studentId) => {
              const existingStudent = existingStudents.find((s) => s.studentId === studentId);
              const isNewStudent = !existingStudent;
              const studentData = students.find((s) => s.id === studentId);
              const studentName = existingStudent?.fullName || studentData?.fullName || "Không tên";

              return (
                <div key={studentId} className="flex items-start justify-between gap-3 pb-3 border-b last:border-b-0">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{studentName}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {isNewStudent ? "Chưa có mặt trong lớp" : "Đã có mặt trong lớp"}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      isNewStudent
                        ? "bg-green-50 text-green-700 border-green-300 flex-shrink-0"
                        : existingStudent.status === "waiting"
                        ? "bg-amber-50 text-amber-700 border-amber-300 flex-shrink-0"
                        : "bg-blue-50 text-blue-700 border-blue-300 flex-shrink-0"
                    }
                  >
                    {isNewStudent
                      ? "Chưa có"
                      : existingStudent.status === "waiting"
                      ? "Học viên chờ"
                      : "Học viên chính thức"}
                  </Badge>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setShowDetailModal(false)}>
              Đóng
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
