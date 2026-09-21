import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { FinancePromotionDialog, type FinancePromotionType } from "@/pages/finance/components/FinancePromotionDialog";

const fmtMoney = (value: number) => Math.round(value).toLocaleString("vi-VN");
type AdjustmentKind = "promotion" | "surcharge";

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
  const [adjustmentPicker, setAdjustmentPicker] = useState<{
    index: number;
    kind: AdjustmentKind;
  } | null>(null);
  const [adjustmentSearch, setAdjustmentSearch] = useState("");
  const [quickCreateType, setQuickCreateType] = useState<FinancePromotionType | null>(null);
  const [quickCreateSaving, setQuickCreateSaving] = useState(false);
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
  const { data: promotionOptions = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/promotions?type=promotion"],
    enabled: isOpen,
  });
  const { data: surchargeOptions = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/promotions?type=surcharge"],
    enabled: isOpen,
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
      promotionKeys: [],
      surchargeKeys: [],
    })));
  }, [isOpen, students, classData, defaultStart, defaultEnd]);

  const updateConfig = (index: number, patch: Record<string, any>) => {
    setConfigs((current) => current.map((config, configIndex) =>
      configIndex === index ? { ...config, ...patch } : config,
    ));
  };

  const getPackage = (packageId: string) => feePackages.find((pkg: any) => pkg.id === packageId);
  const getAdjustmentAmount = (adjustment: any, baseAmount: number) => {
    const value = Number(adjustment?.valueAmount || 0);
    return adjustment?.valueType === "percent"
      ? Math.round(baseAmount * value / 100)
      : value;
  };
  const getInvoicePreview = (config: any) => {
    const pkg = getPackage(config.packageId);
    if (!pkg) return { base: 0, promo: 0, surcharge: 0, grand: 0 };
    const base = pkg.type === "buổi"
      ? Number(config.totalSessions || 0) * Number(pkg.fee || 0)
      : Number(pkg.totalAmount || 0);
    const promo = promotionOptions
      .filter((option: any) => (config.promotionKeys || []).includes(option.id))
      .reduce((sum: number, option: any) => sum + getAdjustmentAmount(option, base), 0);
    const surcharge = surchargeOptions
      .filter((option: any) => (config.surchargeKeys || []).includes(option.id))
      .reduce((sum: number, option: any) => sum + getAdjustmentAmount(option, base), 0);
    return { base, promo, surcharge, grand: Math.max(0, base - promo + surcharge) };
  };
  const toggleAdjustment = (index: number, kind: AdjustmentKind, id: string) => {
    const field = kind === "promotion" ? "promotionKeys" : "surchargeKeys";
    const current = configs[index]?.[field] || [];
    updateConfig(index, {
      [field]: current.includes(id) ? current.filter((key: string) => key !== id) : [...current, id],
    });
  };

  const openAdjustmentPicker = (index: number, kind: AdjustmentKind) => {
    setAdjustmentSearch("");
    setAdjustmentPicker({ index, kind });
  };

  const closeAdjustmentPicker = () => {
    setAdjustmentSearch("");
    setAdjustmentPicker(null);
  };

  const handleCreateAdjustment = async (data: {
    code: string;
    name: string;
    valueAmount: string | null;
    valueType: "percent" | "vnd";
    quantity: number | null;
    fromDate: string | null;
    toDate: string | null;
  }) => {
    if (!quickCreateType) return;
    const type = quickCreateType;
    setQuickCreateSaving(true);
    try {
      const response = await apiRequest("POST", "/api/finance/promotions", { ...data, type });
      const created = await response.json();
      queryClient.invalidateQueries({ queryKey: [`/api/finance/promotions?type=${type}`] });

      if (created?.id && adjustmentPicker?.kind === type) {
        toggleAdjustment(adjustmentPicker.index, type, created.id);
      }

      setQuickCreateType(null);
      toast({
        title: `Đã thêm ${type === "promotion" ? "khuyến mãi" : "phụ thu"}`,
        description: created?.name ? `"${created.name}" đã được chọn cho học viên.` : undefined,
      });
    } catch (error: any) {
      toast({
        title: "Không thể thêm mới",
        description: error?.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setQuickCreateSaving(false);
    }
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
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[92vh] bg-slate-50 p-4 sm:p-5 flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Xếp lịch lớp tự do</DialogTitle>
          <DialogDescription>
            Mỗi học viên có khoảng thời gian và số buổi riêng. Đăng ký ngày không trừ buổi;
            chỉ khi điểm danh mới cập nhật số buổi đã dùng.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[min(65vh,620px)] rounded-md border">
          <div className="min-w-[1400px]">
            <div className="grid grid-cols-[minmax(180px,1.3fr)_145px_145px_110px_minmax(190px,1fr)_180px_180px_110px] gap-3 border-b bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
              <span>Học viên</span>
              <span>Ngày bắt đầu</span>
              <span>Ngày giới hạn</span>
              <span>Số buổi</span>
              <span>Gói học phí</span>
              <span>Khuyến mãi</span>
              <span>Phụ thu</span>
              <span className="text-center">Hóa đơn tự động</span>
            </div>
            <div className="divide-y">
              {configs.map((config, index) => {
                const invalidDate = config.endDate && config.startDate && config.endDate < config.startDate;
                const invoicePreview = getInvoicePreview(config);
                const pkg = getPackage(config.packageId);
                const renderAdjustmentButton = (kind: AdjustmentKind) => {
                  const isPromotion = kind === "promotion";
                  const selectedKeys = isPromotion ? config.promotionKeys || [] : config.surchargeKeys || [];
                  const total = isPromotion ? invoicePreview.promo : invoicePreview.surcharge;
                  return (
                    <button
                      type="button"
                      className="flex h-8 w-full items-center justify-between rounded-none border-0 border-b border-slate-300 bg-transparent px-1 text-[11px] whitespace-nowrap transition-colors hover:border-primary hover:bg-slate-100/70"
                      onClick={() => openAdjustmentPicker(index, kind)}
                    >
                      <span className={cn(
                        "whitespace-nowrap",
                        total > 0
                          ? (isPromotion ? "font-semibold text-green-600" : "font-semibold text-orange-600")
                          : "text-muted-foreground",
                      )}>
                        {total > 0
                          ? `${isPromotion ? "-" : "+"}${fmtMoney(total)} đ`
                          : selectedKeys.length > 0
                            ? `${selectedKeys.length} lựa chọn`
                            : "Chọn..."}
                      </span>
                      <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                    </button>
                  );
                };
                return (
                  <div key={config.studentId} className="grid grid-cols-[minmax(180px,1.3fr)_145px_145px_110px_minmax(190px,1fr)_180px_180px_110px] items-start gap-3 px-4 py-3">
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
                    <div>{renderAdjustmentButton("promotion")}</div>
                    <div>{renderAdjustmentButton("surcharge")}</div>
                    <div className="flex justify-center pt-1">
                      <Switch
                        checked={!!config.autoInvoice}
                        onCheckedChange={(checked) => updateConfig(index, { autoInvoice: checked })}
                        aria-label={`Hóa đơn tự động cho ${config.fullName}`}
                      />
                    </div>
                    {config.autoInvoice && (
                      <div className="col-span-8 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2 text-[11px]">
                        {!config.packageId ? (
                          <span className="text-destructive">Cần chọn gói học phí để lập hóa đơn</span>
                        ) : (
                          <>
                            <span className="font-medium text-muted-foreground">
                              Gói: <span className="text-foreground">{pkg?.name}</span>
                              {pkg?.type === "buổi" && (
                                <span className="ml-1 font-normal">({config.totalSessions} buổi × {fmtMoney(Number(pkg?.fee || 0))} đ)</span>
                              )}
                            </span>
                            <span className="text-muted-foreground">
                              Tiền gốc: <span className="font-medium text-foreground">{fmtMoney(invoicePreview.base)} đ</span>
                            </span>
                            {invoicePreview.promo > 0 && (
                              <span className="text-green-600">Khuyến mãi: <span className="font-medium">-{fmtMoney(invoicePreview.promo)} đ</span></span>
                            )}
                            {invoicePreview.surcharge > 0 && (
                              <span className="text-orange-600">Phụ thu: <span className="font-medium">+{fmtMoney(invoicePreview.surcharge)} đ</span></span>
                            )}
                            <span className="font-semibold text-primary">Tổng: {fmtMoney(invoicePreview.grand)} đ</span>
                          </>
                        )}
                      </div>
                    )}
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
      <Dialog
        open={!!adjustmentPicker}
        onOpenChange={(open) => {
          if (!open) closeAdjustmentPicker();
        }}
      >
        <DialogContent className="z-[170] max-w-lg">
          {adjustmentPicker && (() => {
            const { index, kind } = adjustmentPicker;
            const config = configs[index];
            const isPromotion = kind === "promotion";
            const options = (isPromotion ? promotionOptions : surchargeOptions)
              .filter((option: any) => option.isActive !== false);
            const selectedKeys = isPromotion ? config?.promotionKeys || [] : config?.surchargeKeys || [];
            const invoicePreview = config ? getInvoicePreview(config) : { base: 0, promo: 0, surcharge: 0, grand: 0 };
            const total = isPromotion ? invoicePreview.promo : invoicePreview.surcharge;
            const search = adjustmentSearch.trim().toLowerCase();
            const filteredOptions = options.filter((option: any) =>
              !search || `${option.name || ""} ${option.code || ""}`.toLowerCase().includes(search)
            );

            return (
              <>
                <DialogHeader>
                  <div className="flex items-center justify-between gap-3 pr-6">
                    <DialogTitle>Chọn {isPromotion ? "khuyến mãi" : "phụ thu"}</DialogTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 shrink-0 px-2 text-xs font-medium text-purple-600 hover:bg-purple-50 hover:text-purple-700"
                      onClick={() => setQuickCreateType(kind)}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Thêm mới
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {config?.fullName || "Học viên"} · Chọn một hoặc nhiều {isPromotion ? "khuyến mãi" : "phụ thu"} áp dụng cho hóa đơn tự động.
                  </p>
                </DialogHeader>

                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={adjustmentSearch}
                    onChange={(event) => setAdjustmentSearch(event.target.value)}
                    placeholder={`Tìm theo tên hoặc mã ${isPromotion ? "khuyến mãi" : "phụ thu"}...`}
                    className="h-9 pl-8 text-xs"
                    autoFocus
                  />
                </div>

                <div className="max-h-72 overflow-y-auto rounded-md border">
                  {options.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">
                      Chưa có {isPromotion ? "khuyến mãi" : "phụ thu"} nào
                    </p>
                  ) : filteredOptions.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">
                      Không tìm thấy lựa chọn phù hợp
                    </p>
                  ) : (
                    <div className="divide-y">
                      {filteredOptions.map((option: any) => {
                        const amount = getAdjustmentAmount(option, invoicePreview.base);
                        return (
                          <label
                            key={option.id}
                            className="flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50"
                          >
                            <Checkbox
                              className="mt-0.5"
                              checked={selectedKeys.includes(option.id)}
                              onCheckedChange={() => toggleAdjustment(index, kind, option.id)}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium">{option.name}</p>
                              <p className={isPromotion ? "text-xs text-green-600" : "text-xs text-orange-600"}>
                                {isPromotion ? "-" : "+"}
                                {option.valueType === "percent"
                                  ? `${fmtMoney(amount)} đ (${option.valueAmount}%)`
                                  : `${fmtMoney(amount)} đ`}
                              </p>
                            </div>
                            {selectedKeys.includes(option.id) && (
                              <span className="text-[10px] font-medium text-primary">Đã chọn</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t pt-3 text-xs font-semibold">
                  <span>Tổng {isPromotion ? "khuyến mãi" : "phụ thu"}</span>
                  <span className={isPromotion ? "text-green-600" : "text-orange-600"}>
                    {isPromotion ? "-" : "+"}{fmtMoney(total)} đ
                  </span>
                </div>

                <DialogFooter>
                  <Button type="button" onClick={closeAdjustmentPicker}>Hoàn tất</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
      <FinancePromotionDialog
        open={!!quickCreateType}
        onClose={() => {
          if (!quickCreateSaving) setQuickCreateType(null);
        }}
        onSave={handleCreateAdjustment}
        title={quickCreateType === "promotion" ? "Thêm mới khuyến mãi" : "Thêm mới phụ thu"}
        isSaving={quickCreateSaving}
        contentClassName="z-[190]"
        overlayClassName="z-[180]"
      />
    </Dialog>
  );
}