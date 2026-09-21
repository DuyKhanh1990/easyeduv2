import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface FreeScheduleDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  students: any[];
  classData: any;
  onConfirm: (configs: any[]) => void;
  isPending: boolean;
}

export function FreeScheduleDialog({
  isOpen,
  onOpenChange,
  students,
  classData,
  onConfirm,
  isPending,
}: FreeScheduleDialogProps) {
  const defaultStart = String(classData?.startDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const defaultEnd = String(classData?.endDate || "").slice(0, 10);
  const [configs, setConfigs] = useState<any[]>([]);
  const locationId = classData?.locationId || "";
  const courseId = classData?.courseId || "";

  const packagesQueryKey = courseId
    ? `/api/courses/${courseId}/fee-packages`
    : `/api/fee-packages?locationId=${encodeURIComponent(locationId)}`;
  const { data: queriedPackages = [] } = useQuery<any[]>({
    queryKey: [packagesQueryKey],
    enabled: isOpen && (!!courseId || !!locationId),
  });
  const feePackages = useMemo(
    () => (queriedPackages.length > 0 ? queriedPackages : classData?.course?.feePackages || []),
    [queriedPackages, classData?.course?.feePackages],
  );

  useEffect(() => {
    if (!isOpen) return;
    setConfigs(students.map((student) => ({
      studentId: student.studentId || student.id,
      fullName: student.student?.fullName || student.fullName || "N/A",
      code: student.student?.code || student.code || "",
      startDate: String(student.startDate || defaultStart).slice(0, 10),
      endType: "date",
      endDate: String(student.endDate || defaultEnd).slice(0, 10),
      totalSessions: String(student.totalSessions || 40),
      packageId: student.packageId || classData?.feePackageId || "",
      autoInvoice: false,
    })));
  }, [isOpen, students, classData, defaultStart, defaultEnd]);

  const updateConfig = (index: number, patch: Record<string, any>) => {
    setConfigs((current) => current.map((config, configIndex) =>
      configIndex === index ? { ...config, ...patch } : config,
    ));
  };

  const handleConfirm = () => {
    if (
      configs.length === 0
      || configs.some((config) =>
        !config.startDate
        || !config.endDate
        || config.endDate < config.startDate
        || Number(config.totalSessions) < 1,
      )
    ) return;
    onConfirm(configs.map((config) => ({
      ...config,
      totalSessions: Number(config.totalSessions),
      packageId: config.packageId || undefined,
    })));
  };

  const hasInvalidConfig = configs.some((config) =>
    !config.startDate
    || !config.endDate
    || config.endDate < config.startDate
    || Number(config.totalSessions) < 1,
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Xếp lịch lớp tự do</DialogTitle>
          <DialogDescription>
            Mỗi học viên có khoảng thời gian và số buổi riêng. Đăng ký ngày không trừ buổi;
            chỉ khi điểm danh mới cập nhật số buổi đã dùng.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[min(65vh,620px)] rounded-md border">
          <div className="min-w-[920px]">
            <div className="grid grid-cols-[minmax(180px,1.4fr)_145px_145px_125px_minmax(190px,1fr)_100px] gap-3 border-b bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
              <span>Học viên</span>
              <span>Ngày bắt đầu</span>
              <span>Ngày giới hạn</span>
              <span>Số buổi</span>
              <span>Gói học phí</span>
              <span className="text-center">Hóa đơn tự động</span>
            </div>
            <div className="divide-y">
              {configs.map((config, index) => {
                const invalidDate = config.endDate && config.startDate && config.endDate < config.startDate;
                return (
                  <div key={config.studentId} className="grid grid-cols-[minmax(180px,1.4fr)_145px_145px_125px_minmax(190px,1fr)_100px] items-start gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-800">{config.fullName}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{config.code || "Chưa có mã"}</div>
                    </div>
                    <div className="space-y-1">
                      <Label className="sr-only">Ngày bắt đầu của {config.fullName}</Label>
                      <Input
                        type="date"
                        value={config.startDate}
                        max={config.endDate || undefined}
                        onChange={(event) => updateConfig(index, { startDate: event.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="sr-only">Ngày giới hạn của {config.fullName}</Label>
                      <Input
                        type="date"
                        value={config.endDate}
                        min={config.startDate || undefined}
                        onChange={(event) => updateConfig(index, { endDate: event.target.value })}
                        className="h-8 text-xs"
                      />
                      {invalidDate && <p className="text-[10px] text-destructive">Phải sau ngày bắt đầu</p>}
                    </div>
                    <div className="space-y-1">
                      <Label className="sr-only">Số buổi của {config.fullName}</Label>
                      <Input
                        type="number"
                        min={1}
                        max={500}
                        value={config.totalSessions}
                        onChange={(event) => updateConfig(index, { totalSessions: event.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="sr-only">Gói học phí của {config.fullName}</Label>
                      <Select
                        value={config.packageId || "none"}
                        onValueChange={(value) => updateConfig(index, { packageId: value === "none" ? "" : value })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Chọn gói" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Không chọn gói</SelectItem>
                          {feePackages.map((pkg: any) => (
                            <SelectItem key={pkg.id} value={pkg.id}>{pkg.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-center pt-1">
                      <Switch
                        checked={!!config.autoInvoice}
                        onCheckedChange={(checked) => updateConfig(index, { autoInvoice: checked })}
                        aria-label={`Hóa đơn tự động cho ${config.fullName}`}
                      />
                    </div>
                  </div>
                );
              })}
              {configs.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">Chưa có học viên được chọn.</div>
              )}
            </div>
          </div>
        </ScrollArea>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{configs.length} học viên</Badge>
          <span>Hóa đơn tự động chỉ thực hiện khi học viên đã chọn gói học phí.</span>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Hủy</Button>
          <Button onClick={handleConfirm} disabled={isPending || configs.length === 0 || hasInvalidConfig}>
            {isPending ? "Đang lưu..." : "Xếp lịch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}