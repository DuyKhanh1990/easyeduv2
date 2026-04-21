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
import { AlertCircle, CheckCircle2, Eye, Calendar, Info, ChevronDown, Wallet, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { useClasses } from "@/hooks/use-classes";
import { useToast } from "@/hooks/use-toast";
import { fmtMoney } from "@/types/invoice-types";
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
      filtered = classSessions.filter((s: any) =>
        config.selectedShifts.includes(s.shiftTemplateId || s.shiftTemplate?.id)
      );
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
      if (shiftId && !acc.find((x) => x.id === shiftId)) {
        acc.push({
          id: shiftId,
          name: s.shiftTemplate?.name,
          weekday: s.weekday,
          startTime: s.shiftTemplate?.startTime,
        });
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

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className={phase === "schedule" ? "max-w-[95vw] w-[95vw] max-h-[90vh] flex flex-col" : "max-w-2xl"}>
        <DialogHeader>
          {phase === "assign" ? (
            <DialogTitle>Gán lớp cho học viên</DialogTitle>
          ) : (
            <div className="flex flex-wrap justify-between items-center pr-8 gap-4">
              <DialogTitle>Xếp lịch học cho {assignedStudentIds.length} học viên</DialogTitle>
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
                      <Input type="number" className="h-8 w-16 text-xs" value={globalSessions} onChange={(e) => setGlobalSessions(parseInt(e.target.value) || 0)} />
                      <span className="text-xs">buổi</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">Gói:</span>
                  <Select value={globalPackageId} onValueChange={setGlobalPackageId}>
                    <SelectTrigger className="h-8 text-xs w-[140px]">
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
              <Select value={selectedClassId} onValueChange={handleClassSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn lớp để gán" />
                </SelectTrigger>
                <SelectContent>
                  {classesData?.map((cls: any) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.classCode} - {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <div className="flex-1 overflow-auto py-4">
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
                      <Fragment key={config.studentId}>
                        <TableRow>
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
                                <button className="w-full h-8 flex items-center justify-between px-2 rounded-md border bg-background hover:border-primary transition-colors text-[11px]">
                                  <span className={promoAmt > 0 ? "text-green-600 font-semibold" : "text-muted-foreground"}>
                                    {promoAmt > 0 ? `-${fmtMoney(promoAmt)}` : "Chọn..."}
                                  </span>
                                  <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                </button>
                              </PopoverTrigger>
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
                                <button className="w-full h-8 flex items-center justify-between px-2 rounded-md border bg-background hover:border-primary transition-colors text-[11px]">
                                  <span className={surchargeAmt > 0 ? "text-orange-600 font-semibold" : "text-muted-foreground"}>
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
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
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
                onClick={() => scheduleMutation.mutate(studentConfigs)}
              >
                {scheduleMutation.isPending ? "Đang xử lý..." : "Xác nhận xếp lịch"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>

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
