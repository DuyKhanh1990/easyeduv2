import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Scissors } from "lucide-react";

export function SplitScheduleDialog({
  scheduleId,
  label,
  amount,
  invoiceId,
  onClose,
}: {
  scheduleId: string;
  label: string;
  amount: number;
  invoiceId: string;
  onClose: () => void;
}) {
  const [splitAmount, setSplitAmount] = useState<number | "">(0);
  const { toast } = useToast();

  const splitMutation = useMutation({
    mutationFn: ({ scheduleId, splitAmount }: { scheduleId: string; splitAmount: number }) =>
      apiRequest("POST", `/api/finance/invoice-schedules/${scheduleId}/split`, { splitAmount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices", invoiceId, "payment-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
    },
  });

  const split = Number(splitAmount) || 0;
  const remaining = amount - split;
  const isValid = split > 0 && split < amount;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-4 w-4 text-blue-600" />
            Tách đợt thanh toán
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-muted/40 p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Đợt:</span>
              <span className="font-medium">{label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Số tiền:</span>
              <span className="font-bold text-blue-700">{amount.toLocaleString("vi-VN")} ₫</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Số tiền tách ra</label>
            <Input
              type="number"
              value={splitAmount}
              onChange={e => setSplitAmount(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="Nhập số tiền..."
              className="text-right"
              data-testid="input-split-amount"
            />
          </div>

          {split > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-2 text-sm">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Xem trước sau khi tách</p>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{label} (mới):</span>
                <span className={`font-medium ${isValid ? "text-blue-700" : "text-red-500"}`}>{split.toLocaleString("vi-VN")} ₫</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{label} (còn lại):</span>
                <span className={`font-medium ${remaining > 0 ? "text-foreground" : "text-red-500"}`}>{remaining.toLocaleString("vi-VN")} ₫</span>
              </div>
              {!isValid && (
                <p className="text-xs text-red-500">Số tiền tách phải lớn hơn 0 và nhỏ hơn {amount.toLocaleString("vi-VN")} ₫</p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={splitMutation.isPending}>Huỷ</Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 gap-1"
            onClick={() =>
              splitMutation.mutate(
                { scheduleId, splitAmount: Number(splitAmount) },
                {
                  onSuccess: () => {
                    toast({ title: "Tách đợt thành công" });
                    onClose();
                  },
                  onError: (err: any) =>
                    toast({ title: "Lỗi", description: err.message || "Không thể tách đợt", variant: "destructive" }),
                }
              )
            }
            disabled={!isValid || splitMutation.isPending}
            data-testid="button-confirm-split"
          >
            <Scissors className="h-3.5 w-3.5" />
            {splitMutation.isPending ? "Đang tách..." : "Xác nhận tách"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
