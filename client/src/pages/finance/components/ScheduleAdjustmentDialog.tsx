import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { fmtMoney, parseNum, type ScheduleItem } from "@/types/invoice-types";
import { useInvoiceSchedules } from "@/hooks/use-invoice-schedules";

type AdjustmentOption = {
  id: string;
  name: string;
  valueType?: string | null;
  valueAmount?: string | number | null;
};

const calculateAdjustment = (base: number, keys: string[], options: AdjustmentOption[]) =>
  keys.reduce((sum, key) => {
    const option = options.find(item => item.id === key);
    if (!option) return sum;
    const value = Math.max(0, Number(option.valueAmount ?? 0) || 0);
    return sum + (option.valueType === "percent" ? Math.round(base * value / 100) : value);
  }, 0);

function AdjustmentPicker({
  label,
  kind,
  options,
  selected,
  onToggle,
}: {
  label: string;
  kind: "promotion" | "surcharge";
  options: AdjustmentOption[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const total = selected.length;
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between font-normal">
            <span className={total > 0 ? (kind === "promotion" ? "text-green-600" : "text-orange-600") : "text-muted-foreground"}>
              {total > 0 ? `Đã chọn ${total}` : "Chọn..."}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="start">
          {options.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground">Chưa có cấu hình nào.</p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {options.map(option => {
                const checked = selected.includes(option.id);
                const value = option.valueType === "percent"
                  ? `${Number(option.valueAmount ?? 0)}%`
                  : fmtMoney(Number(option.valueAmount ?? 0));
                return (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-muted"
                    data-testid={`schedule-${kind}-${option.id}`}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => onToggle(option.id)} />
                    <span className="min-w-0 flex-1 truncate text-xs">{option.name}</span>
                    <span className={`shrink-0 text-xs ${kind === "promotion" ? "text-green-600" : "text-orange-600"}`}>
                      {kind === "promotion" ? "-" : "+"}{value}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function ScheduleAdjustmentDialog({
  schedule,
  invoiceId,
  onClose,
}: {
  schedule: ScheduleItem;
  invoiceId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { updateMutation } = useInvoiceSchedules(invoiceId);
  const [baseAmount, setBaseAmount] = useState<number>(parseNum(schedule.baseAmount ?? schedule.amount));
  const [promotionKeys, setPromotionKeys] = useState<string[]>(schedule.promotionKeys ?? []);
  const [surchargeKeys, setSurchargeKeys] = useState<string[]>(schedule.surchargeKeys ?? []);
  const { data: promotionOptions = [] } = useQuery<AdjustmentOption[]>({
    queryKey: ["/api/finance/promotions", { type: "promotion" }],
    queryFn: () => apiRequest("GET", "/api/finance/promotions?type=promotion").then(res => res.json()),
  });
  const { data: surchargeOptions = [] } = useQuery<AdjustmentOption[]>({
    queryKey: ["/api/finance/promotions", { type: "surcharge" }],
    queryFn: () => apiRequest("GET", "/api/finance/promotions?type=surcharge").then(res => res.json()),
  });

  const calculation = useMemo(() => {
    const safeBase = Math.max(0, Number(baseAmount) || 0);
    const promotionAmount = calculateAdjustment(safeBase, promotionKeys, promotionOptions);
    const surchargeAmount = calculateAdjustment(safeBase, surchargeKeys, surchargeOptions);
    return {
      baseAmount: safeBase,
      promotionAmount,
      surchargeAmount,
      total: Math.max(0, safeBase - promotionAmount + surchargeAmount),
    };
  }, [baseAmount, promotionKeys, surchargeKeys, promotionOptions, surchargeOptions]);

  const toggle = (keys: string[], setKeys: (next: string[]) => void, id: string) => {
    setKeys(keys.includes(id) ? keys.filter(key => key !== id) : [...keys, id]);
  };

  const save = () => {
    updateMutation.mutate(
      { scheduleId: schedule.id, baseAmount: calculation.baseAmount, promotionKeys, surchargeKeys },
      {
        onSuccess: () => {
          toast({ title: "Đã cập nhật khuyến mãi/phụ thu cho đợt" });
          onClose();
        },
        onError: (error: any) => toast({
          title: "Không thể cập nhật đợt",
          description: error?.message ?? "Vui lòng thử lại.",
          variant: "destructive",
        }),
      },
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-purple-600" />
            Khuyến mãi/phụ thu {schedule.label}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mã đợt</span>
              <span className="font-medium">{schedule.code ?? schedule.label}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Chỉ áp dụng cho đợt chưa thanh toán. Số tiền sau điều chỉnh không thể âm.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Số tiền cơ sở của đợt</label>
            <Input
              type="number"
              min={0}
              value={baseAmount}
              onChange={event => setBaseAmount(Number(event.target.value))}
              className="text-right"
              data-testid={`input-schedule-base-amount-${schedule.id}`}
            />
          </div>

          <AdjustmentPicker
            label="Khuyến mãi riêng"
            kind="promotion"
            options={promotionOptions}
            selected={promotionKeys}
            onToggle={id => toggle(promotionKeys, setPromotionKeys, id)}
          />
          <AdjustmentPicker
            label="Phụ thu riêng"
            kind="surcharge"
            options={surchargeOptions}
            selected={surchargeKeys}
            onToggle={id => toggle(surchargeKeys, setSurchargeKeys, id)}
          />

          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Xem trước</p>
            <div className="space-y-1.5">
              <div className="flex justify-between"><span>Tiền cơ sở</span><span>{fmtMoney(calculation.baseAmount)}</span></div>
              <div className="flex justify-between text-green-600"><span>Khuyến mãi</span><span>- {fmtMoney(calculation.promotionAmount)}</span></div>
              <div className="flex justify-between text-orange-600"><span>Phụ thu</span><span>+ {fmtMoney(calculation.surchargeAmount)}</span></div>
              <div className="mt-2 flex justify-between border-t pt-2 font-bold">
                <span>Thành tiền đợt</span>
                <span>{fmtMoney(calculation.total)}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={updateMutation.isPending}>Hủy</Button>
          <Button
            className="bg-purple-600 hover:bg-purple-700"
            onClick={save}
            disabled={updateMutation.isPending || calculation.baseAmount < 0}
            data-testid={`button-save-schedule-adjustment-${schedule.id}`}
          >
            {updateMutation.isPending ? "Đang lưu..." : "Lưu thay đổi"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}