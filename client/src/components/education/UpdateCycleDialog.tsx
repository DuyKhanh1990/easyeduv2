import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, AlertTriangle, Loader2 } from "lucide-react";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { ConflictDetailSheet } from "@/components/education/ConflictDetailSheet";
import type { ConflictItem } from "@/components/education/ConflictDetailSheet";

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function getNextCycleDate(dateValue: string, weekdays: number[]): string | null {
  if (!dateValue || weekdays.length === 0) return null;
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  for (let i = 0; i < 7; i++) {
    if (weekdays.includes(date.getDay())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    date.setDate(date.getDate() + 1);
  }
  return null;
}

function formatDateForDisplay(dateValue: string): string {
  const [year, month, day] = dateValue.split("-");
  return year && month && day ? `${day}/${month}/${year}` : dateValue;
}

export function UpdateCycleDialog({
  isOpen,
  onOpenChange,
  classData,
  classId,
  classSessions,
  onConfirm,
  isPending,
  defaultFromSessionId,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  classData: any;
  classId?: string;
  classSessions: any[];
  onConfirm: (data: any) => void;
  isPending: boolean;
  defaultFromSessionId?: string;
}) {
  const [fromSessionId, setFromSessionId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [weekdayConfigs, setWeekdayConfigs] = useState<
    Record<number, { shiftTemplateId: string; teacherIds: string[]; roomId: string }>
  >({});
  const [reason, setReason] = useState<string>("");
  const [showErrors, setShowErrors] = useState(false);

  // Live conflict check state
  const [liveConflicts, setLiveConflicts] = useState<ConflictItem[]>([]);
  const [isLiveChecking, setIsLiveChecking] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: staffList } = useQuery<any[]>({
    queryKey: ["/api/staff?minimal=true"],
    enabled: isOpen,
  });

  const { data: shifts } = useQuery<any[]>({
    queryKey: ["/api/shift-templates", { locationId: classData?.locationId }],
    queryFn: async () => {
      const res = await fetch(`/api/shift-templates?locationId=${classData?.locationId}&type=class`);
      if (!res.ok) throw new Error("Failed to fetch shifts");
      return res.json();
    },
    enabled: !!classData?.locationId && isOpen,
  });

  const { data: classrooms } = useQuery<any[]>({
    queryKey: ["/api/classrooms", { locationId: classData?.locationId }],
    queryFn: async () => {
      const res = await fetch(`/api/classrooms?locationId=${classData?.locationId}`);
      if (!res.ok) throw new Error("Failed to fetch classrooms");
      return res.json();
    },
    enabled: !!classData?.locationId && isOpen,
  });

  useEffect(() => {
    if (isOpen && classSessions?.length > 0) {
      const fromId = defaultFromSessionId || classSessions[0].id;
      setFromSessionId(fromId);
      setReason("");
      setShowErrors(false);
      setLiveConflicts([]);

      const allSorted = (classSessions as any[])
        .filter((s: any) => s.status !== "cancelled")
        .sort((a: any, b: any) => (a.sessionIndex ?? 0) - (b.sessionIndex ?? 0));

      const curPos = allSorted.findIndex((s: any) => s.id === fromId);
      const startPos = curPos >= 0 ? curPos : 0;
      const fromSession = allSorted[startPos];
      const fromDate = new Date(fromSession.sessionDate);
      setStartDate(String(fromSession.sessionDate).slice(0, 10));

      const seenWeekdays: number[] = [];
      let forwardComplete = false;

      for (let i = startPos; i < allSorted.length; i++) {
        const wd = allSorted[i].weekday as number;
        if (seenWeekdays.includes(wd)) { forwardComplete = true; break; }
        seenWeekdays.push(wd);
      }

      if (!forwardComplete) {
        for (let i = startPos - 1; i >= 0; i--) {
          const wd = allSorted[i].weekday as number;
          if (seenWeekdays.includes(wd)) break;
          seenWeekdays.push(wd);
        }
      }

      const blockSessions = allSorted.filter((s: any) =>
        seenWeekdays.includes(s.weekday as number) &&
        Math.abs(new Date(s.sessionDate).getTime() - fromDate.getTime()) <= 14 * 86400000
      );
      const cycleWeekdays = [...new Set(blockSessions.map((s: any) => s.weekday as number))].sort(
        (a, b) => a - b
      );
      const weekdaysToUse = cycleWeekdays.length > 0 ? cycleWeekdays : (classData?.weekdays || []);
      setSelectedWeekdays(weekdaysToUse);

      const cycleSessionMap: Record<number, any> = {};
      weekdaysToUse.forEach((wd: number) => {
        const candidates = blockSessions.filter((s: any) => s.weekday === wd);
        const onOrAfter = candidates.filter((s: any) => new Date(s.sessionDate) >= fromDate);
        cycleSessionMap[wd] = (onOrAfter[0] ?? candidates[candidates.length - 1]);
      });

      const configs: Record<number, { shiftTemplateId: string; teacherIds: string[]; roomId: string }> = {};
      weekdaysToUse.forEach((wd: number) => {
        const s = cycleSessionMap[wd];
        configs[wd] = {
          shiftTemplateId: s?.shiftTemplateId || (classData?.shiftTemplateIds || [])[0] || "",
          teacherIds: s?.teacherIds || classData?.teacherIds || [],
          roomId: s?.roomId || classData?.roomId || "",
        };
      });
      setWeekdayConfigs(configs);
    }
  }, [isOpen, classSessions, classData, defaultFromSessionId]);

  // Debounced live conflict check
  useEffect(() => {
    const effectiveClassId = classId || classData?.id;
    if (!isOpen || !effectiveClassId || !fromSessionId || !startDate || selectedWeekdays.length === 0) {
      setLiveConflicts([]);
      return;
    }
    // Only check if all selected weekdays have a shift configured
    const allConfigured = selectedWeekdays.every(wd => weekdayConfigs[wd]?.shiftTemplateId);
    if (!allConfigured) {
      setLiveConflicts([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsLiveChecking(true);
      try {
        const res = await fetch(`/api/classes/${effectiveClassId}/preview-cycle-conflicts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          credentials: "include",
          body: JSON.stringify({ fromSessionId, startDate, weekdays: selectedWeekdays, weekdayConfigs }),
        });
        if (res.ok) {
          const data = await res.json();
          setLiveConflicts(data.conflicts || []);
        }
      } catch {
        setLiveConflicts([]);
      } finally {
        setIsLiveChecking(false);
      }
    }, 800);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [isOpen, classId, classData?.id, fromSessionId, startDate, selectedWeekdays, weekdayConfigs]);

  const allTeachers = (staffList || []).map((s: any) => ({ ...s, _isActive: s.status === "Hoạt động" }));
  const activeTeachers = allTeachers;

  const handleWeekdayToggle = (wd: number) => {
    setSelectedWeekdays((prev) => {
      const next = prev.includes(wd) ? prev.filter((w) => w !== wd) : [...prev, wd].sort();
      if (!next.includes(wd)) {
        const newConfigs = { ...weekdayConfigs };
        delete newConfigs[wd];
        setWeekdayConfigs(newConfigs);
      } else {
        setWeekdayConfigs((prevConfigs) => ({
          ...prevConfigs,
          [wd]: {
            shiftTemplateId: (classData.shiftTemplateIds || [])[0] || "",
            teacherIds: classData.teacherIds || [],
            roomId: classData.roomId || "",
          },
        }));
      }
      return next;
    });
  };

  const updateWeekdayConfig = (wd: number, updates: any) => {
    setWeekdayConfigs((prev) => ({
      ...prev,
      [wd]: { ...prev[wd], ...updates },
    }));
  };

  const isValid =
    !!fromSessionId &&
    !!startDate &&
    selectedWeekdays.length > 0 &&
    !!reason.trim() &&
    !Object.values(weekdayConfigs).some((c) => !c.shiftTemplateId);

  const validationErrors: string[] = [];
  if (!reason.trim()) validationErrors.push("Lý do thay đổi chưa nhập");
  if (selectedWeekdays.length === 0) validationErrors.push("Chưa chọn thứ trong tuần");
  if (Object.values(weekdayConfigs).some((c) => !c.shiftTemplateId))
    validationErrors.push("Chưa chọn ca học cho một số thứ");

  const handleConfirm = () => {
    if (!isValid) {
      setShowErrors(true);
      return;
    }
    onConfirm({ fromSessionId, startDate, weekdays: selectedWeekdays, weekdayConfigs, reason });
  };

  const roomConflicts = liveConflicts.filter(c => c.type === "room");
  const teacherConflicts = liveConflicts.filter(c => c.type === "teacher");
  const effectiveStartDate = getNextCycleDate(startDate, selectedWeekdays);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-[95vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Cập nhật chu kỳ</DialogTitle>
            <DialogDescription>
              Sinh lại các buổi theo cấu hình mới. Học viên có lịch riêng sẽ tự động được ánh xạ theo index buổi sang ngày mới tương ứng.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto pr-4">
              <div className="space-y-6 py-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <div className="space-y-2">
                        <Label>Chọn ngày</Label>
                        <Input
                          type="date"
                          value={startDate}
                          onChange={(e) => {
                            setStartDate(e.target.value);
                            if (showErrors) setShowErrors(false);
                          }}
                        />
                         {effectiveStartDate && effectiveStartDate !== startDate && (
                           <p className="text-xs text-amber-700 dark:text-amber-300">
                             Ngày đã chọn ({formatDateForDisplay(startDate)}) không thuộc chu kỳ. Hệ thống sẽ bắt đầu từ ngày gần nhất tiếp theo: <strong>{formatDateForDisplay(effectiveStartDate)}</strong>.
                           </p>
                         )}
                        {(() => {
                          const s = classSessions?.find((session) => session.id === fromSessionId);
                          if (!s) return null;
                          return (
                            <p className="text-xs text-muted-foreground">
                              Từ Buổi {String(s.sessionIndex || "").padStart(2, "0")}; các buổi tiếp theo sẽ được sinh đến buổi cuối cùng của lịch.
                            </p>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label>Chọn các thứ trong tuần</Label>
                      <div className="flex flex-wrap gap-2">
                        {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
                          <Button
                            key={wd}
                            type="button"
                            variant={selectedWeekdays.includes(wd) ? "default" : "outline"}
                            className="w-12 h-10"
                            onClick={() => handleWeekdayToggle(wd)}
                          >
                            {WEEKDAY_LABELS[wd]}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Live conflict banner */}
                    {isLiveChecking && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Đang kiểm tra trùng lịch...
                      </div>
                    )}
                    {!isLiveChecking && liveConflicts.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSheetOpen(true)}
                        className="w-full text-left rounded-md border border-orange-200 bg-orange-50 px-3 py-2.5 hover:bg-orange-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
                          <span className="text-sm font-medium text-orange-700">
                            Phát hiện {liveConflicts.length} xung đột lịch
                          </span>
                        </div>
                        <div className="mt-1 flex gap-3 text-xs text-orange-600">
                          {roomConflicts.length > 0 && <span>🏠 {roomConflicts.length} trùng phòng</span>}
                          {teacherConflicts.length > 0 && <span>👤 {teacherConflicts.length} trùng GV</span>}
                          <span className="underline ml-auto">Xem chi tiết →</span>
                        </div>
                      </button>
                    )}

                    <div className="space-y-2">
                      <Label>
                        Lý do thay đổi{" "}
                        <span className="text-red-500 text-xs font-normal">(bắt buộc)</span>
                      </Label>
                      <Textarea
                        placeholder="Nhập lý do thay đổi..."
                        value={reason}
                        onChange={(e) => { setReason(e.target.value); if (showErrors) setShowErrors(false); }}
                        className={showErrors && !reason.trim() ? "border-red-400 focus-visible:ring-red-400" : ""}
                      />
                      {showErrors && !reason.trim() && (
                        <p className="text-xs text-red-500">Vui lòng nhập lý do thay đổi</p>
                      )}
                    </div>

                    <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 rounded-md text-sm">
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div className="space-y-1">
                        <p className="font-semibold">Lưu ý quan trọng:</p>
                        <ul className="list-disc ml-4 space-y-1">
                          <li>Hệ thống sẽ xoá các buổi cũ trong khoảng đã chọn và sinh lại lịch mới.</li>
                            <li>Nếu ngày đã chọn không thuộc chu kỳ, buổi đầu tiên sẽ được dời tới ngày gần nhất tiếp theo thuộc chu kỳ; các buổi sau được sinh theo các thứ trong tuần đến buổi cuối cùng.</li>
                           <li>Chỉ thực hiện được nếu các buổi trong khoảng đều ở trạng thái 'scheduled' và chưa có điểm danh.</li>
                          <li>Số lượng buổi (session index) giữ nguyên. Học viên lịch riêng tự động ánh xạ sang ngày mới.</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {selectedWeekdays.length > 0 && (
                    <div className="space-y-4">
                      <Label>Cấu hình ca và giáo viên theo thứ</Label>
                      <div className="space-y-3 border rounded-md p-4 bg-muted/20">
                        {selectedWeekdays.map((wd) => {
                          const wdRoomConflicts = roomConflicts.filter(c => {
                            // match by weekday from sessionDate
                            const d = new Date(c.sessionDate + "T00:00:00");
                            return d.getDay() === wd;
                          });
                          return (
                            <div key={wd} className="space-y-2 border-b pb-3 last:border-0 last:pb-0">
                              <div className="grid grid-cols-10 gap-3 items-center">
                                <div className="col-span-1 font-bold text-primary">{WEEKDAY_LABELS[wd]}</div>
                                <div className="col-span-3">
                                  <Select
                                    value={weekdayConfigs[wd]?.shiftTemplateId}
                                    onValueChange={(v) => updateWeekdayConfig(wd, { shiftTemplateId: v })}
                                  >
                                    <SelectTrigger className="h-9 text-xs">
                                      <SelectValue placeholder="Chọn ca" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {shifts?.map((s) => (
                                        <SelectItem key={s.id} value={s.id}>
                                          {s.name} ({s.startTime}-{s.endTime})
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="col-span-3">
                                  <Select
                                    value={weekdayConfigs[wd]?.roomId || "none"}
                                    onValueChange={(v) => updateWeekdayConfig(wd, { roomId: v === "none" ? "" : v })}
                                  >
                                    <SelectTrigger className={`h-9 text-xs ${wdRoomConflicts.length > 0 ? "border-orange-400 text-orange-700" : ""}`}>
                                      <SelectValue placeholder="Chọn phòng" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">Chưa chọn phòng</SelectItem>
                                      {classrooms?.map((r) => (
                                        <SelectItem key={r.id} value={r.id}>
                                          {r.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="col-span-3">
                                  <SearchableMultiSelect
                                    options={activeTeachers.map((t: any) => ({
                                      value: t.id,
                                      label: t.fullName,
                                      isActive: t._isActive,
                                    }))}
                                    value={weekdayConfigs[wd]?.teacherIds || []}
                                    onChange={(v) => updateWeekdayConfig(wd, { teacherIds: v })}
                                    placeholder="Chọn GV..."
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
          </div>

          <DialogFooter className="pt-4 border-t flex-col items-stretch gap-2 sm:flex-col">
            {showErrors && validationErrors.length > 0 && (
              <div className="flex items-start gap-2 p-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <ul className="space-y-0.5">
                  {validationErrors.map((e) => <li key={e}>• {e}</li>)}
                </ul>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Hủy
              </Button>
              <Button
                disabled={isPending}
                onClick={handleConfirm}
                className={!isValid ? "opacity-50" : ""}
              >
                {isPending ? "Đang xử lý..." : "Cập nhật chu kỳ"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConflictDetailSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        conflicts={liveConflicts}
        title={`${liveConflicts.length} xung đột lịch — Cập nhật chu kỳ`}
      />
    </>
  );
}
