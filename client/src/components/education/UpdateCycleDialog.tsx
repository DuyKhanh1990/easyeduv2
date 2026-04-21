import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
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
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle } from "lucide-react";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export function UpdateCycleDialog({
  isOpen,
  onOpenChange,
  classData,
  classSessions,
  onConfirm,
  isPending,
  defaultFromSessionId,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  classData: any;
  classSessions: any[];
  onConfirm: (data: any) => void;
  isPending: boolean;
  defaultFromSessionId?: string;
}) {
  const [fromSessionId, setFromSessionId] = useState<string>("");
  const [toSessionId, setToSessionId] = useState<string>("");
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [weekdayConfigs, setWeekdayConfigs] = useState<
    Record<number, { shiftTemplateId: string; teacherIds: string[] }>
  >({});
  const [reason, setReason] = useState<string>("");

  const { data: staffList } = useQuery<any[]>({
    queryKey: ["/api/staff?minimal=true"],
    enabled: isOpen,
  });

  const { data: shifts } = useQuery<any[]>({
    queryKey: ["/api/shift-templates", { locationId: classData?.locationId }],
    queryFn: async () => {
      const res = await fetch(`/api/shift-templates?locationId=${classData?.locationId}`);
      if (!res.ok) throw new Error("Failed to fetch shifts");
      return res.json();
    },
    enabled: !!classData?.locationId && isOpen,
  });

  useEffect(() => {
    if (isOpen && classSessions?.length > 0) {
      const fromId = defaultFromSessionId || classSessions[0].id;
      setFromSessionId(fromId);
      setToSessionId(classSessions[classSessions.length - 1].id);
      setReason("");

      const allSorted = (classSessions as any[])
        .filter((s: any) => s.status !== "cancelled")
        .sort((a: any, b: any) => (a.sessionIndex ?? 0) - (b.sessionIndex ?? 0));

      const curPos = allSorted.findIndex((s: any) => s.id === fromId);
      const startPos = curPos >= 0 ? curPos : 0;
      const fromSession = allSorted[startPos];
      const fromDate = new Date(fromSession.sessionDate);

      // Detect the cycle by walking FORWARD from the selected session, collecting weekdays
      // until a weekday repeats — that signals one full cycle has been seen.
      // If the list ends without a repeat (e.g. last few sessions), also walk BACKWARD
      // to fill in the remaining weekdays of the same cycle.
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

      const configs: Record<number, { shiftTemplateId: string; teacherIds: string[] }> = {};
      weekdaysToUse.forEach((wd: number) => {
        const s = cycleSessionMap[wd];
        configs[wd] = {
          shiftTemplateId: s?.shiftTemplateId || (classData?.shiftTemplateIds || [])[0] || "",
          teacherIds: s?.teacherIds || classData?.teacherIds || [],
        };
      });
      setWeekdayConfigs(configs);
    }
  }, [isOpen, classSessions, classData, defaultFromSessionId]);

  const activeTeachers = staffList?.filter((s) => s.status === "Hoạt động") || [];

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
    !!toSessionId &&
    selectedWeekdays.length > 0 &&
    !!reason.trim() &&
    !Object.values(weekdayConfigs).some((c) => !c.shiftTemplateId);

  const handleConfirm = () => {
    onConfirm({
      fromSessionId,
      toSessionId,
      weekdays: selectedWeekdays,
      weekdayConfigs,
      reason,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Cập nhật chu kỳ</DialogTitle>
          <DialogDescription>
            Sinh lại các buổi theo cấu hình mới. Học viên có lịch riêng sẽ tự động được ánh xạ theo index buổi sang ngày mới tương ứng.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Từ buổi</Label>
                <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground select-none">
                  {(() => {
                    const s = classSessions?.find((s) => s.id === fromSessionId);
                    if (!s) return <span className="italic">—</span>;
                    return `Buổi ${String(s.sessionIndex || "").padStart(2, "0")} - ${format(new Date(s.sessionDate), "dd/MM/yyyy")}`;
                  })()}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Đến buổi</Label>
                <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground select-none">
                  {(() => {
                    const s = classSessions?.find((s) => s.id === toSessionId);
                    if (!s) return <span className="italic">—</span>;
                    return `Buổi ${String(s.sessionIndex || "").padStart(2, "0")} - ${format(new Date(s.sessionDate), "dd/MM/yyyy")}`;
                  })()}
                </div>
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

            {selectedWeekdays.length > 0 && (
              <div className="space-y-4">
                <Label>Cấu hình ca và giáo viên theo thứ</Label>
                <div className="space-y-3 border rounded-md p-4 bg-muted/20">
                  {selectedWeekdays.map((wd) => (
                    <div
                      key={wd}
                      className="grid grid-cols-7 gap-4 items-center border-b pb-3 last:border-0 last:pb-0"
                    >
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
                        <SearchableMultiSelect
                          options={activeTeachers.map((t: any) => ({
                            value: t.id,
                            label: t.fullName,
                          }))}
                          value={weekdayConfigs[wd]?.teacherIds || []}
                          onChange={(v) => updateWeekdayConfig(wd, { teacherIds: v })}
                          placeholder="Chọn GV..."
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Lý do thay đổi</Label>
              <Textarea
                placeholder="Nhập lý do thay đổi..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 rounded-md text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold">Lưu ý quan trọng:</p>
                <ul className="list-disc ml-4 space-y-1">
                  <li>Hệ thống sẽ xoá các buổi cũ trong khoảng đã chọn và sinh lại lịch mới.</li>
                  <li>Chỉ thực hiện được nếu các buổi trong khoảng đều ở trạng thái 'scheduled' và chưa có điểm danh.</li>
                  <li>Số lượng buổi (session index) giữ nguyên. Học viên lịch riêng tự động ánh xạ sang ngày mới.</li>
                </ul>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button disabled={!isValid || isPending} onClick={handleConfirm}>
            {isPending ? "Đang xử lý..." : "Cập nhật chu kỳ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
