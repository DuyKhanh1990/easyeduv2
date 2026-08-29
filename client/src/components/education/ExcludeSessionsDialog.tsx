import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, AlertTriangle, Clock, Loader2, Plus, X } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient, getAuthHeaders } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { ConflictDetailSheet } from "@/components/education/ConflictDetailSheet";
import type { ConflictItem } from "@/components/education/ConflictDetailSheet";

interface ExcludeSessionsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  currentSessionIndex?: number;
  classSessions: any[];
}

type Range = { fromSessionId: string; toSessionId: string };

function getSessionIdx(sessions: any[], id: string) {
  return sessions.findIndex(s => s.id === id);
}

function resolveRange(sessions: any[], r: Range) {
  const fi = getSessionIdx(sessions, r.fromSessionId);
  const ti = getSessionIdx(sessions, r.toSessionId);
  if (fi < 0 || ti < 0) return null;
  return { from: Math.min(fi, ti), to: Math.max(fi, ti) };
}

function detectOverlaps(sessions: any[], ranges: Range[]): Set<number> {
  const overlapping = new Set<number>();
  const resolved = ranges.map((r, i) => ({ ...resolveRange(sessions, r), i }));
  for (let a = 0; a < resolved.length; a++) {
    for (let b = a + 1; b < resolved.length; b++) {
      const ra = resolved[a];
      const rb = resolved[b];
      if (ra.from == null || rb.from == null) continue;
      if (ra.from! <= rb.to! && rb.from! <= ra.to!) {
        overlapping.add(a);
        overlapping.add(b);
      }
    }
  }
  return overlapping;
}

export function ExcludeSessionsDialog({
  isOpen,
  onOpenChange,
  classId,
  currentSessionIndex = 0,
  classSessions
}: ExcludeSessionsDialogProps) {
  const [ranges, setRanges] = useState<Range[]>([{ fromSessionId: "", toSessionId: "" }]);
  const [reason, setReason] = useState<string>("");
  const [showWarning, setShowWarning] = useState(false);
  const { toast } = useToast();

  // Live conflict check
  const [liveConflicts, setLiveConflicts] = useState<ConflictItem[]>([]);
  const [isLiveChecking, setIsLiveChecking] = useState(false);
  const [conflictSheetOpen, setConflictSheetOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen && classSessions.length > 0 && currentSessionIndex > 0) {
      const defaultSession = classSessions[Math.min(currentSessionIndex - 1, classSessions.length - 1)];
      if (defaultSession) {
        setRanges([{ fromSessionId: defaultSession.id, toSessionId: defaultSession.id }]);
      }
    }
  }, [isOpen, currentSessionIndex, classSessions]);

  // Debounced live conflict check — watches validRanges changes
  const validRanges = ranges.filter(r => r.fromSessionId && r.toSessionId);

  useEffect(() => {
    if (!isOpen || validRanges.length === 0 || hasOverlap) {
      setLiveConflicts([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsLiveChecking(true);
      try {
        const res = await fetch("/api/classes/preview-exclude-conflicts", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          credentials: "include",
          body: JSON.stringify({ classId, ranges: validRanges }),
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
  }, [isOpen, classId, JSON.stringify(validRanges)]);

  const overlappingIndexes = detectOverlaps(classSessions, ranges);
  const hasOverlap = overlappingIndexes.size > 0;
  const totalSessionCount = validRanges.reduce((sum, r) => {
    const res = resolveRange(classSessions, r);
    return res ? sum + (res.to - res.from + 1) : sum;
  }, 0);

  const updateRange = (idx: number, field: keyof Range, value: string) => {
    setRanges(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const addRange = () => {
    if (ranges.length < 5) setRanges(prev => [...prev, { fromSessionId: "", toSessionId: "" }]);
  };

  const removeRange = (idx: number) => {
    setRanges(prev => prev.filter((_, i) => i !== idx));
  };

  const checkAttendanceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/classes/check-attendance-for-exclusion", {
        classId,
        ranges: validRanges,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.hasAttendance) {
        setShowWarning(true);
      } else {
        executeExclude();
      }
    }
  });

  const excludeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/classes/exclude-sessions", {
        classId,
        ranges: validRanges,
        reason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/sessions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/exclusions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] });
      queryClient.invalidateQueries({ queryKey: ["/api/classes", classId] });
      toast({
        title: "Thành công",
        description: `Đã loại trừ ${totalSessionCount} buổi học thành công`,
      });
      onOpenChange(false);
      resetForm();
      setShowWarning(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể loại trừ buổi học",
        variant: "destructive"
      });
    }
  });

  const resetForm = () => {
    setRanges([{ fromSessionId: "", toSessionId: "" }]);
    setReason("");
  };

  const executeExclude = () => excludeMutation.mutate();

  const canSubmit = validRanges.length > 0 && !hasOverlap
    && !checkAttendanceMutation.isPending && !excludeMutation.isPending;

  const { data: exclusionsData } = useQuery({
    queryKey: [`/api/classes/${classId}/exclusions`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/classes/${classId}/exclusions`);
      return res.json();
    },
    enabled: isOpen
  });

  return (
    <>
      <Dialog open={isOpen && !showWarning} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl w-full max-h-[90vh] flex flex-col">
          <DialogHeader className="pb-2 shrink-0">
            <DialogTitle className="text-base font-semibold">Loại trừ ngày học</DialogTitle>
            <DialogDescription className="text-xs">
              Các buổi phía sau khoảng loại trừ sẽ dồn lên thế chỗ. Hệ thống tự động tạo buổi bù ở cuối lịch.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-5 flex-1 min-h-0 overflow-y-auto">
            {/* Left: form */}
            <div className="flex-1 space-y-3 min-w-0">

              {/* Ranges */}
              <div className="space-y-2">
                {ranges.map((range, idx) => {
                  const isOverlapping = overlappingIndexes.has(idx);
                  const res = resolveRange(classSessions, range);
                  const count = res ? res.to - res.from + 1 : 0;

                  return (
                    <div key={idx} className={`rounded-md border p-2.5 space-y-2 ${isOverlapping ? "border-red-400 bg-red-50" : "border-border bg-muted/20"}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          Khoảng {idx + 1}
                          {count > 0 && !isOverlapping && (
                            <span className="ml-2 text-blue-600 font-semibold">{count} buổi</span>
                          )}
                          {isOverlapping && (
                            <span className="ml-2 text-red-600 font-semibold flex-inline items-center gap-1">
                              <AlertCircle className="inline h-3 w-3 mr-0.5" />Chồng chéo!
                            </span>
                          )}
                        </span>
                        {ranges.length > 1 && (
                          <button
                            onClick={() => removeRange(idx)}
                            className="h-5 w-5 flex items-center justify-center rounded hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Từ buổi</Label>
                          <Select
                            value={range.fromSessionId}
                            onValueChange={v => updateRange(idx, "fromSessionId", v)}
                          >
                            <SelectTrigger className={`h-8 text-xs ${isOverlapping ? "border-red-400" : ""}`}>
                              <SelectValue placeholder="Chọn buổi" />
                            </SelectTrigger>
                            <SelectContent>
                              {classSessions.map((s, si) => (
                                <SelectItem key={s.id} value={s.id} className="text-xs">
                                  Buổi {String(si + 1).padStart(2, '0')}: {format(new Date(s.sessionDate), "EEE d/M/yy HH:mm", { locale: vi })}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">Đến buổi</Label>
                          <Select
                            value={range.toSessionId}
                            onValueChange={v => updateRange(idx, "toSessionId", v)}
                          >
                            <SelectTrigger className={`h-8 text-xs ${isOverlapping ? "border-red-400" : ""}`}>
                              <SelectValue placeholder="Chọn buổi" />
                            </SelectTrigger>
                            <SelectContent>
                              {classSessions.map((s, si) => (
                                <SelectItem key={s.id} value={s.id} className="text-xs">
                                  Buổi {String(si + 1).padStart(2, '0')}: {format(new Date(s.sessionDate), "EEE d/M/yy HH:mm", { locale: vi })}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add range button */}
              {ranges.length < 5 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-xs border-dashed gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={addRange}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Thêm khoảng loại trừ
                </Button>
              )}

              {/* Summary */}
              {totalSessionCount > 0 && !hasOverlap && (
                <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900">
                  <strong>Loại trừ {totalSessionCount} buổi</strong>
                  {" — "}hệ thống sẽ tạo thêm {totalSessionCount} buổi bù vào cuối lịch theo chu kỳ hiện tại.
                </div>
              )}

              {hasOverlap && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-800 flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Các khoảng đang chồng chéo nhau. Vui lòng điều chỉnh lại.
                </div>
              )}

              {/* Live conflict banner */}
              {isLiveChecking && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Đang kiểm tra trùng lịch buổi bù...
                </div>
              )}
              {!isLiveChecking && liveConflicts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConflictSheetOpen(true)}
                  className="w-full text-left rounded-md border border-orange-200 bg-orange-50 px-3 py-2.5 hover:bg-orange-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
                    <span className="text-xs font-medium text-orange-700">
                      {liveConflicts.length} xung đột lịch ở buổi bù cuối lịch
                    </span>
                  </div>
                  <div className="mt-0.5 flex gap-3 text-xs text-orange-600">
                    {liveConflicts.filter(c => c.type === "room").length > 0 && (
                      <span>🏠 {liveConflicts.filter(c => c.type === "room").length} trùng phòng</span>
                    )}
                    {liveConflicts.filter(c => c.type === "teacher").length > 0 && (
                      <span>👤 {liveConflicts.filter(c => c.type === "teacher").length} trùng GV</span>
                    )}
                    <span className="underline ml-auto">Xem chi tiết →</span>
                  </div>
                </button>
              )}

              <div className="space-y-1">
                <Label className="text-xs">Lý do (không bắt buộc)</Label>
                <Textarea
                  data-testid="textarea-reason"
                  placeholder="Ví dụ: Nghỉ lễ, Giáo viên bận, Trung tâm nghỉ..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="h-20 text-xs resize-none"
                />
              </div>
            </div>

            {/* Right: history */}
            <div className="w-56 border-l pl-4 shrink-0">
              <p className="text-xs font-semibold flex items-center gap-1.5 mb-2 text-muted-foreground uppercase tracking-wide">
                <Clock className="h-3.5 w-3.5" />
                Lịch sử loại trừ
              </p>
              <ScrollArea className="h-52">
                {exclusionsData && exclusionsData.length > 0 ? (
                  <div className="space-y-2 pr-2">
                    {exclusionsData.map((exclusion: any) => (
                      <div key={exclusion.id} className="p-2 bg-muted/40 rounded border text-[11px] space-y-0.5">
                        <div className="font-medium text-foreground">
                          Buổi {String(exclusion.fromSessionOrder).padStart(2, '0')}
                          {exclusion.fromSessionOrder !== exclusion.toSessionOrder &&
                            ` — ${String(exclusion.toSessionOrder).padStart(2, '0')}`}
                        </div>
                        <div className="text-muted-foreground">
                          {format(new Date(exclusion.fromSessionDate), "EEE d/M/yy", { locale: vi })}
                          {exclusion.fromSessionDate !== exclusion.toSessionDate && (
                            <> — {format(new Date(exclusion.toSessionDate), "EEE d/M/yy", { locale: vi })}</>
                          )}
                        </div>
                        {exclusion.reason && (
                          <div className="text-muted-foreground italic truncate" title={exclusion.reason}>
                            {exclusion.reason}
                          </div>
                        )}
                        <div className="text-muted-foreground/60">
                          {format(new Date(exclusion.createdAt), "dd/MM/yy HH:mm", { locale: vi })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground text-center py-6">Chưa có lịch sử</p>
                )}
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className="pt-2 shrink-0 border-t">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} data-testid="button-cancel">
              Hủy
            </Button>
            <Button
              size="sm"
              data-testid="button-exclude"
              disabled={!canSubmit}
              onClick={() => checkAttendanceMutation.mutate()}
            >
              {checkAttendanceMutation.isPending || excludeMutation.isPending ? "Đang xử lý..." : "Loại trừ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConflictDetailSheet
        open={conflictSheetOpen}
        onClose={() => setConflictSheetOpen(false)}
        conflicts={liveConflicts}
        title={`${liveConflicts.length} xung đột lịch — Buổi bù cuối lịch`}
      />

      {/* Warning dialog */}
      <Dialog open={showWarning} onOpenChange={setShowWarning}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              Cảnh báo
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Có {totalSessionCount} buổi trong khoảng đã chọn có học viên điểm danh. Bạn có chắc muốn loại trừ?
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowWarning(false)} data-testid="button-warning-cancel">
              Hủy
            </Button>
            <Button
              size="sm"
              variant="destructive"
              data-testid="button-warning-continue"
              onClick={executeExclude}
              disabled={excludeMutation.isPending}
            >
              {excludeMutation.isPending ? "Đang xử lý..." : "Tiếp tục"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
