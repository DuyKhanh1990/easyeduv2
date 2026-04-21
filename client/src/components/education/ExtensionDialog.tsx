import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function fmtMoney(n: number): string {
  return Math.round(n).toLocaleString("vi-VN");
}

function formatDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function parseSessionDate(raw: any): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function computeEndByCount(
  lastDate: Date,
  numSessions: number,
  weekdays: number[]
): { date: Date; count: number } | null {
  if (weekdays.length === 0 || numSessions <= 0) return null;
  const sorted = [...weekdays].sort();
  const current = new Date(lastDate);
  let count = 0;
  let safeGuard = 0;
  while (count < numSessions && safeGuard < 3650) {
    current.setDate(current.getDate() + 1);
    safeGuard++;
    if (sorted.includes(current.getDay())) count++;
  }
  if (count < numSessions) return null;
  return { date: new Date(current), count: numSessions };
}

// Count ALL class-weekday sessions strictly after lastDate up to (inclusive) endDate
function countAllClassSessionsBetween(
  lastDate: Date,
  endDate: Date,
  allWeekdays: number[]
): number {
  if (allWeekdays.length === 0) return 0;
  const current = new Date(lastDate);
  let count = 0;
  let safeGuard = 0;
  while (safeGuard < 3650) {
    current.setDate(current.getDate() + 1);
    safeGuard++;
    if (current > endDate) break;
    if (allWeekdays.includes(current.getDay())) count++;
  }
  return count;
}

function computeEndByDate(
  lastDate: Date,
  endDate: Date,
  weekdays: number[]
): { date: Date; count: number } | null {
  if (weekdays.length === 0) return null;
  const sorted = [...weekdays].sort();
  const current = new Date(lastDate);
  let count = 0;
  let lastValidDate: Date | null = null;
  let safeGuard = 0;
  while (safeGuard < 3650) {
    current.setDate(current.getDate() + 1);
    safeGuard++;
    if (current > endDate) break;
    if (sorted.includes(current.getDay())) {
      count++;
      lastValidDate = new Date(current);
    }
  }
  if (count === 0 || !lastValidDate) return null;
  return { date: lastValidDate, count };
}

export function ExtensionDialog({
  isOpen,
  onOpenChange,
  classData,
  classSessions,
  activeStudents,
  selectedStudents,
  feePackages,
  onConfirm,
  isPending,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  classData: any;
  classSessions?: any[];
  activeStudents?: any[];
  selectedStudents: any[];
  feePackages?: any[];
  onConfirm: (data: any) => void;
  isPending: boolean;
}) {
  const [mode, setMode] = useState<"class" | "student">("class");
  const [extensionType, setExtensionType] = useState<"sessions" | "date">("sessions");
  const [numSessions, setNumSessions] = useState(0);
  const [endDate, setEndDate] = useState<string>("");
  const [cycleMode, setCycleMode] = useState<"all" | "specific">("all");
  const [specificShiftIds, setSpecificShiftIds] = useState<string[]>([]);
  const [extensionName, setExtensionName] = useState("");

  // Per-student fee state
  const [studentPkgIds, setStudentPkgIds] = useState<Record<string, string>>({});
  const [studentDiscountIds, setStudentDiscountIds] = useState<Record<string, string[]>>({});
  const [studentSurchargeIds, setStudentSurchargeIds] = useState<Record<string, string[]>>({});
  const [studentAutoInvoice, setStudentAutoInvoice] = useState<Record<string, boolean>>({});
  const [allAutoInvoice, setAllAutoInvoice] = useState(true);
  const [openPromoStudentId, setOpenPromoStudentId] = useState<string | null>(null);
  const [openSurchargeStudentId, setOpenSurchargeStudentId] = useState<string | null>(null);

  const { data: promotionOptions = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/promotions?type=promotion"],
    enabled: isOpen,
  });
  const { data: surchargeOptions = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/promotions?type=surcharge"],
    enabled: isOpen,
  });

  const prevIsOpenRef = useRef(false);

  // Reset per-student state only when dialog transitions from closed -> open
  useEffect(() => {
    const wasOpen = prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;

    if (!isOpen) return;

    const classFeePackageId = classData?.feePackageId || "";
    const coursePkgId = classData?.course?.feePackages?.[0]?.id || "";
    const pkgs: Record<string, string> = {};
    const autoInv: Record<string, boolean> = {};
    for (const s of selectedStudents) {
      pkgs[s.id] = s.packageId || classFeePackageId || coursePkgId || "";
      autoInv[s.id] = true;
    }
    setStudentPkgIds(pkgs);
    setStudentAutoInvoice(autoInv);

    // Only clear discount/surcharge selections when the dialog first opens
    if (!wasOpen) {
      setStudentDiscountIds({});
      setStudentSurchargeIds({});
    }
  }, [isOpen, selectedStudents, classData]);

  const lastClassSession = useMemo(() => {
    if (!classSessions || classSessions.length === 0) return null;
    return classSessions.reduce((prev: any, cur: any) => {
      const prevIdx = prev.sessionIndex ?? 0;
      const curIdx = cur.sessionIndex ?? 0;
      return curIdx > prevIdx ? cur : prev;
    }, classSessions[0]);
  }, [classSessions]);

  const activeWeekdays = useMemo((): number[] => {
    if (cycleMode === "all") return (classData?.weekdays || []) as number[];
    return specificShiftIds.map((id) => parseInt(id));
  }, [cycleMode, specificShiftIds, classData]);

  const endSessionInfo = useMemo(() => {
    if (!lastClassSession) return null;
    const lastDate = parseSessionDate(lastClassSession.sessionDate);
    if (!lastDate) return null;
    const lastIdx: number = lastClassSession.sessionIndex ?? 0;
    if (extensionType === "sessions") {
      if (numSessions <= 0) return null;
      const result = computeEndByCount(lastDate, numSessions, activeWeekdays);
      if (!result) return null;
      return { sessionIndex: lastIdx + result.count, date: result.date };
    } else {
      if (!endDate) return null;
      const endDateObj = new Date(endDate);
      if (isNaN(endDateObj.getTime())) return null;
      const result = computeEndByDate(lastDate, endDateObj, activeWeekdays);
      if (!result) return null;
      return { sessionIndex: lastIdx + result.count, date: result.date };
    }
  }, [lastClassSession, extensionType, numSessions, endDate, activeWeekdays]);

  const lastSessionLabel = useMemo(() => {
    if (!lastClassSession) return null;
    const date = parseSessionDate(lastClassSession.sessionDate);
    if (!date) return null;
    const idx = lastClassSession.sessionIndex ?? "?";
    const dayLabel = DAY_LABELS[date.getDay()] ?? "";
    return `Buổi số ${idx}, ${dayLabel} ${formatDate(date)}`;
  }, [lastClassSession]);

  const sessionIndexMap = useMemo(() => {
    const m: Record<string, number> = {};
    (classSessions || []).forEach((cs: any) => { m[cs.id] = cs.sessionIndex; });
    return m;
  }, [classSessions]);

  const activeMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const a of (activeStudents || [])) m[a.studentId] = a;
    return m;
  }, [activeStudents]);

  // Per-student: last session info and extension result
  const studentExtensionInfos = useMemo(() => {
    if (mode !== "student") return {};
    const result: Record<string, { lastLabel: string; endLabel: string | null }> = {};
    for (const s of selectedStudents) {
      const fullRecord = activeMap[s.studentId] || s;
      const sessions: any[] = fullRecord.studentSessions || s.studentSessions || [];
      if (sessions.length === 0) {
        result[s.id] = { lastLabel: "—", endLabel: null };
        continue;
      }
      const sorted = [...sessions].sort((a, b) => {
        const da = parseSessionDate(a.sessionDate);
        const db = parseSessionDate(b.sessionDate);
        if (!da || !db) return 0;
        return db.getTime() - da.getTime();
      });
      const last = sorted[0];
      const lastDate = parseSessionDate(last.sessionDate);
      if (!lastDate) {
        result[s.id] = { lastLabel: "—", endLabel: null };
        continue;
      }
      const idx = sessionIndexMap[last.classSessionId];
      const dayLabel = DAY_LABELS[lastDate.getDay()] ?? "";
      const lastLabel = idx != null
        ? `Buổi ${idx}, ${dayLabel} ${formatDate(lastDate)}`
        : `${dayLabel} ${formatDate(lastDate)}`;

      const allClassWeekdays: number[] = (classData?.weekdays || []) as number[];
      let endLabel: string | null = null;
      if (extensionType === "sessions" && numSessions > 0) {
        const r = computeEndByCount(lastDate, numSessions, activeWeekdays);
        if (r && idx != null) {
          const allSteps = countAllClassSessionsBetween(lastDate, r.date, allClassWeekdays);
          const endDayLabel = DAY_LABELS[r.date.getDay()] ?? "";
          endLabel = `Buổi ${idx + allSteps}, ${endDayLabel} ${formatDate(r.date)}`;
        }
      } else if (extensionType === "date" && endDate) {
        const endDateObj = new Date(endDate);
        if (!isNaN(endDateObj.getTime())) {
          const r = computeEndByDate(lastDate, endDateObj, activeWeekdays);
          if (r && idx != null) {
            const allSteps = countAllClassSessionsBetween(lastDate, r.date, allClassWeekdays);
            const endDayLabel = DAY_LABELS[r.date.getDay()] ?? "";
            endLabel = `Buổi ${idx + allSteps}, ${endDayLabel} ${formatDate(r.date)}`;
          }
        }
      }
      result[s.id] = { lastLabel, endLabel };
    }
    return result;
  }, [mode, selectedStudents, activeMap, sessionIndexMap, classData, extensionType, numSessions, endDate, activeWeekdays]);

  // Get extension session count for a student (used for fee calc)
  const getExtCount = (s: any): number => {
    if (extensionType === "sessions") return numSessions;
    if (!endDate) return 0;
    const endDateObj = new Date(endDate);
    if (isNaN(endDateObj.getTime())) return 0;
    let lastDate: Date | null = null;
    if (mode === "class") {
      lastDate = parseSessionDate(lastClassSession?.sessionDate);
    } else {
      const fullRecord = activeMap[s.studentId] || s;
      const sessions: any[] = fullRecord.studentSessions || s.studentSessions || [];
      const sorted = [...sessions].sort((a: any, b: any) => {
        const da = parseSessionDate(a.sessionDate);
        const db = parseSessionDate(b.sessionDate);
        if (!da || !db) return 0;
        return db.getTime() - da.getTime();
      });
      if (sorted.length === 0) return 0;
      lastDate = parseSessionDate(sorted[0].sessionDate);
    }
    if (!lastDate) return 0;
    const r = computeEndByDate(lastDate, endDateObj, activeWeekdays);
    return r?.count ?? 0;
  };

  // Get per-session price from the selected package or student record
  const getSessionPrice = (s: any): number => {
    const pkgId = studentPkgIds[s.id] || s.packageId;
    const pkg = feePackages?.find((p: any) => p.id === pkgId);
    if (pkg) {
      if (pkg.type === "buổi") return parseFloat(pkg.fee) || 0;
      if (pkg.type === "khoá" && pkg.sessions)
        return parseFloat(pkg.fee) / parseFloat(pkg.sessions);
    }
    return parseFloat(s.sessionPrice || "0") || 0;
  };

  // Compute fee amounts for a student
  const getAmounts = (s: any) => {
    const extCount = getExtCount(s);
    const sprice = getSessionPrice(s);
    const base = extCount > 0 && sprice > 0 ? sprice * extCount : 0;
    const discIds = studentDiscountIds[s.id] ?? [];
    const surchIds = studentSurchargeIds[s.id] ?? [];
    const discAmt = discIds.reduce((sum: number, id: string) => {
      const opt = (promotionOptions as any[]).find((p: any) => p.id === id);
      if (!opt) return sum;
      return sum + (opt.valueType === "percent"
        ? base * parseFloat(opt.valueAmount) / 100
        : parseFloat(opt.valueAmount) || 0);
    }, 0);
    const surchAmt = surchIds.reduce((sum: number, id: string) => {
      const opt = (surchargeOptions as any[]).find((p: any) => p.id === id);
      if (!opt) return sum;
      return sum + (opt.valueType === "percent"
        ? base * parseFloat(opt.valueAmount) / 100
        : parseFloat(opt.valueAmount) || 0);
    }, 0);
    return { base, discAmt, surchAmt, total: base - discAmt + surchAmt };
  };

  const allPkgs: any[] = feePackages || classData?.course?.feePackages || [];

  // Build auto invoice description for a student
  const buildNote = (s: any): string => {
    const pkg = allPkgs.find((p: any) => p.id === studentPkgIds[s.id]);
    const discIds = studentDiscountIds[s.id] ?? [];
    const surchIds = studentSurchargeIds[s.id] ?? [];

    let startDate: Date | null = null;
    let noteEndDate: Date | null = null;

    if (mode === "class") {
      const lastDate = parseSessionDate(lastClassSession?.sessionDate);
      if (lastDate) {
        startDate = new Date(lastDate);
        startDate.setDate(startDate.getDate() + 1);
      }
      noteEndDate = endSessionInfo?.date ?? null;
    } else {
      const fullRecord = activeMap[s.studentId] || s;
      const sessions: any[] = fullRecord.studentSessions || s.studentSessions || [];
      const sorted = [...sessions].sort((a: any, b: any) => {
        const da = parseSessionDate(a.sessionDate);
        const db = parseSessionDate(b.sessionDate);
        if (!da || !db) return 0;
        return db.getTime() - da.getTime();
      });
      const lastDate = sorted[0] ? parseSessionDate(sorted[0].sessionDate) : null;
      if (lastDate) {
        startDate = new Date(lastDate);
        startDate.setDate(startDate.getDate() + 1);
        if (extensionType === "sessions" && numSessions > 0) {
          const r = computeEndByCount(lastDate, numSessions, activeWeekdays);
          if (r) noteEndDate = r.date;
        } else if (extensionType === "date" && endDate) {
          const edObj = new Date(endDate);
          if (!isNaN(edObj.getTime())) {
            const r = computeEndByDate(lastDate, edObj, activeWeekdays);
            if (r) noteEndDate = r.date;
          }
        }
      }
    }

    const startStr = startDate ? formatDate(startDate) : "?";
    const endStr = noteEndDate ? formatDate(noteEndDate) : "?";
    const className = classData?.name || "";
    const pkgName = pkg?.name || "";
    const discNames = discIds.map((id: string) => (promotionOptions as any[]).find((p: any) => p.id === id)?.name).filter(Boolean).join(", ");
    const surchNames = surchIds.map((id: string) => (surchargeOptions as any[]).find((p: any) => p.id === id)?.name).filter(Boolean).join(", ");
    const weekdayStr = (classData?.weekdays || []).map((wd: number) => DAY_LABELS[wd]).join(", ");
    const shift = classData?.shiftTemplate;
    const shiftStr = shift ? `${shift.name}: ${shift.startTime} - ${shift.endTime}` : "";

    let note = `Học phí gia hạn từ ngày ${startStr} đến ngày ${endStr}. Lớp ${className}`;
    if (pkgName) note += `, Gói học phí ${pkgName}`;
    if (discNames) note += `, Khuyến mãi ${discNames}`;
    if (surchNames) note += `, Phụ thu ${surchNames}`;
    note += `. Chu kỳ học ${weekdayStr}${shiftStr ? `, ${shiftStr}` : ""}`;
    return note;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[98vw] h-[98dvh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle>Gia hạn học viên</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* ── LEFT PANEL: settings ─────────────────────────────── */}
          <div className="w-[380px] shrink-0 border-r overflow-y-auto p-6 space-y-4">
            <div className="space-y-2">
              <Label>Chế độ gia hạn</Label>
              <Select value={mode} onValueChange={(v: any) => setMode(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="class">
                    Gia hạn sau buổi cuối cùng của lịch lớp
                  </SelectItem>
                  <SelectItem value="student">
                    Gia hạn sau buổi cuối cùng của từng học viên
                  </SelectItem>
                </SelectContent>
              </Select>
              {mode === "class" && lastSessionLabel && (
                <p className="text-xs text-muted-foreground">
                  Buổi cuối cùng của lớp:{" "}
                  <span className="font-medium text-foreground">{lastSessionLabel}</span>
                </p>
              )}
              {mode === "student" && (
                <p className="text-xs text-muted-foreground">
                  Mỗi học viên sẽ được gia hạn từ buổi cuối cùng của họ.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Hình thức gia hạn</Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={extensionType === "sessions" ? "default" : "outline"}
                  onClick={() => setExtensionType("sessions")}
                >
                  Số buổi cụ thể
                </Button>
                <Button
                  size="sm"
                  variant={extensionType === "date" ? "default" : "outline"}
                  onClick={() => setExtensionType("date")}
                >
                  Gia hạn đến ngày
                </Button>
              </div>
            </div>

            {extensionType === "sessions" ? (
              <div className="space-y-2">
                <Label>Số buổi gia hạn</Label>
                <Input
                  type="number"
                  value={numSessions}
                  onChange={(e) => setNumSessions(parseInt(e.target.value) || 0)}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Gia hạn đến ngày</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Chu kỳ lịch học</Label>
              <Select value={cycleMode} onValueChange={(v: any) => setCycleMode(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả ca học của lớp</SelectItem>
                  <SelectItem value="specific">Chọn ca học cụ thể</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {cycleMode === "specific" && (
              <div className="space-y-2 border rounded-md p-3 bg-muted/20">
                <Label className="text-xs mb-2 block">Chọn các ca học áp dụng</Label>
                <div className="space-y-2">
                  {(classData?.weekdays || []).map((wd: number) => {
                    const shift = classData?.shiftTemplate;
                    return (
                      <div key={wd} className="flex items-center space-x-2">
                        <Checkbox
                          id={`shift-${wd}`}
                          checked={specificShiftIds.includes(wd.toString())}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSpecificShiftIds([...specificShiftIds, wd.toString()]);
                            } else {
                              setSpecificShiftIds(specificShiftIds.filter((id) => id !== wd.toString()));
                            }
                          }}
                        />
                        <Label htmlFor={`shift-${wd}`} className="text-sm cursor-pointer">
                          Thứ {DAY_LABELS[wd]}: {shift?.name} ({shift?.startTime}-{shift?.endTime})
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {mode === "class" && endSessionInfo && (
              <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-800 dark:text-blue-300">
                Học viên sẽ xếp vào đến buổi{" "}
                <span className="font-semibold">
                  Số {endSessionInfo.sessionIndex},{" "}
                  {DAY_LABELS[endSessionInfo.date.getDay()]}{" "}
                  {formatDate(endSessionInfo.date)}
                </span>
              </div>
            )}

            <div className="space-y-2">
              <Label>Tên đợt gia hạn (tùy chọn)</Label>
              <Input
                value={extensionName}
                onChange={(e) => setExtensionName(e.target.value)}
                placeholder="VD: Gia hạn tháng 7"
              />
            </div>
          </div>

          {/* ── RIGHT PANEL: student table ──────────────────────────── */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="px-4 py-3 border-b shrink-0 flex items-center justify-between">
              <p className="text-sm font-semibold">
                Danh sách học viên gia hạn ({selectedStudents.length})
              </p>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-muted-foreground">Hoá đơn tự động</span>
                <Switch
                  checked={allAutoInvoice}
                  onCheckedChange={(v) => {
                    setAllAutoInvoice(v);
                    const next: Record<string, boolean> = {};
                    for (const s of selectedStudents) next[s.id] = v;
                    setStudentAutoInvoice(next);
                  }}
                  data-testid="switch-all-auto-invoice"
                />
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr className="border-b">
                    <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap min-w-[180px]">Học viên</th>
                    <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap min-w-[160px]">Gói học phí</th>
                    <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap w-24">Đơn giá</th>
                    <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap w-16">SL</th>
                    <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap w-28">Khuyến mãi</th>
                    <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap w-28">Phụ thu</th>
                    <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap w-28">Tổng tiền</th>
                    <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap w-32">Hoá đơn tự động</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedStudents.map((s) => {
                    const info = studentExtensionInfos[s.id];
                    const pkgId = studentPkgIds[s.id] ?? "";
                    const discIds = studentDiscountIds[s.id] ?? [];
                    const surchIds = studentSurchargeIds[s.id] ?? [];
                    const amounts = getAmounts(s);

                    const discAmt = amounts.discAmt;
                    const surchAmt = amounts.surchAmt;

                    return (
                      <tr key={s.id} className="border-b hover:bg-muted/30 transition-colors">
                        {/* Học viên */}
                        <td className="px-3 py-2">
                          <div className="font-medium">{s.student?.fullName} ({s.student?.code})</div>
                          {mode === "class" && lastSessionLabel && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              Gia hạn từ sau {lastSessionLabel}
                            </div>
                          )}
                          {mode === "student" && info && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              <span>Buổi cuối: <span className="font-medium text-foreground">{info.lastLabel}</span></span>
                              {info.endLabel && (
                                <span> · <span className="text-blue-600 dark:text-blue-400 font-medium">{info.endLabel}</span></span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Gói học phí */}
                        <td className="px-3 py-2">
                          <Select
                            value={pkgId}
                            onValueChange={(v) =>
                              setStudentPkgIds((prev) => ({ ...prev, [s.id]: v }))
                            }
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="Chọn gói..." />
                            </SelectTrigger>
                            <SelectContent>
                              {allPkgs.length === 0 ? (
                                <SelectItem value="_none" disabled>Chưa có gói</SelectItem>
                              ) : (
                                allPkgs.map((pkg: any) => (
                                  <SelectItem key={pkg.id} value={pkg.id} className="text-xs">
                                    {pkg.name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </td>

                        {/* Đơn giá */}
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <span className="font-medium">{getSessionPrice(s) > 0 ? `${fmtMoney(getSessionPrice(s))}đ` : "—"}</span>
                        </td>

                        {/* SL */}
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          <span className="font-medium">{getExtCount(s) > 0 ? getExtCount(s) : "—"}</span>
                        </td>

                        {/* Khuyến mãi */}
                        <td className="px-3 py-2">
                          <Popover
                            open={openPromoStudentId === s.id}
                            onOpenChange={(v) => setOpenPromoStudentId(v ? s.id : null)}
                          >
                            <PopoverTrigger asChild>
                              <button className="w-full h-7 flex items-center justify-between px-2 rounded-md border bg-background hover:border-primary transition-colors text-[11px]">
                                <span className={discAmt > 0 ? "text-green-600 font-semibold" : "text-muted-foreground"}>
                                  {discAmt > 0 ? `-${fmtMoney(discAmt)}đ` : "Chọn..."}
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
                                    const amt = promo.valueType === "percent"
                                      ? amounts.base * parseFloat(promo.valueAmount) / 100
                                      : parseFloat(promo.valueAmount) || 0;
                                    const label = promo.valueType === "percent"
                                      ? `${parseFloat(promo.valueAmount)}%`
                                      : `${fmtMoney(parseFloat(promo.valueAmount))}đ`;
                                    return (
                                      <label key={promo.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                                        <Checkbox
                                          checked={discIds.includes(promo.id)}
                                          onCheckedChange={() => {
                                            const next = discIds.includes(promo.id)
                                              ? discIds.filter((id: string) => id !== promo.id)
                                              : [...discIds, promo.id];
                                            setStudentDiscountIds((prev) => ({ ...prev, [s.id]: next }));
                                          }}
                                        />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-medium">{promo.name}</p>
                                          <p className="text-xs text-muted-foreground">
                                            {amounts.base > 0 && promo.valueType === "percent"
                                              ? `-${fmtMoney(amt)}đ (${label})`
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
                        </td>

                        {/* Phụ thu */}
                        <td className="px-3 py-2">
                          <Popover
                            open={openSurchargeStudentId === s.id}
                            onOpenChange={(v) => setOpenSurchargeStudentId(v ? s.id : null)}
                          >
                            <PopoverTrigger asChild>
                              <button className="w-full h-7 flex items-center justify-between px-2 rounded-md border bg-background hover:border-primary transition-colors text-[11px]">
                                <span className={surchAmt > 0 ? "text-orange-600 font-semibold" : "text-muted-foreground"}>
                                  {surchAmt > 0 ? `+${fmtMoney(surchAmt)}đ` : "Chọn..."}
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
                                  {(surchargeOptions as any[]).filter((s2: any) => s2.isActive).map((surcharge: any) => {
                                    const amt = surcharge.valueType === "percent"
                                      ? amounts.base * parseFloat(surcharge.valueAmount) / 100
                                      : parseFloat(surcharge.valueAmount) || 0;
                                    const label = surcharge.valueType === "percent"
                                      ? `${parseFloat(surcharge.valueAmount)}%`
                                      : `${fmtMoney(amt)}đ`;
                                    return (
                                      <label key={surcharge.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                                        <Checkbox
                                          checked={surchIds.includes(surcharge.id)}
                                          onCheckedChange={() => {
                                            const next = surchIds.includes(surcharge.id)
                                              ? surchIds.filter((id: string) => id !== surcharge.id)
                                              : [...surchIds, surcharge.id];
                                            setStudentSurchargeIds((prev) => ({ ...prev, [s.id]: next }));
                                          }}
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
                        </td>

                        {/* Tổng tiền */}
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">
                          {amounts.total > 0 ? `${fmtMoney(amounts.total)}đ` : "—"}
                        </td>

                        {/* Hoá đơn tự động */}
                        <td className="px-3 py-2 text-center">
                          <Switch
                            checked={studentAutoInvoice[s.id] ?? true}
                            onCheckedChange={(v) =>
                              setStudentAutoInvoice((prev) => ({ ...prev, [s.id]: v }))
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            disabled={isPending || (extensionType === "sessions" && numSessions <= 0)}
            onClick={() =>
              onConfirm({
                mode,
                numSessions,
                endDate,
                cycleMode,
                specificShiftIds,
                extensionName,
                autoInvoice: allAutoInvoice,
                studentIds: selectedStudents.map((s) => s.studentId),
                perStudent: selectedStudents.map((s) => {
                  const amounts = getAmounts(s);
                  const autoInv = studentAutoInvoice[s.id] ?? true;
                  return {
                    studentId: s.studentId,
                    packageId: studentPkgIds[s.id] || s.packageId || null,
                    discountIds: studentDiscountIds[s.id] ?? [],
                    surchargeIds: studentSurchargeIds[s.id] ?? [],
                    promotionKeys: studentDiscountIds[s.id] ?? [],
                    surchargeKeys: studentSurchargeIds[s.id] ?? [],
                    autoInvoice: autoInv,
                    grandTotal: amounts.total,
                    totalAmount: amounts.base,
                    promotionAmount: amounts.discAmt,
                    surchargeAmount: amounts.surchAmt,
                    unitPrice: getSessionPrice(s),
                    quantity: getExtCount(s),
                    description: autoInv ? buildNote(s) : "",
                  };
                }),
              })
            }
          >
            {isPending ? "Đang xử lý..." : "Xác nhận gia hạn"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
