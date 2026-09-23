import { useState } from "react";
import { Loader2, Scale } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type WalletSummary = {
  hocPhi: number;
  datCoc: number;
  total: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  studentId: string;
  summary: WalletSummary;
};

function formatCurrency(value: number) {
  return value.toLocaleString("vi-VN") + " đ";
}

function formatSignedCurrency(value: number) {
  if (value === 0) return "0 đ";
  return `${value > 0 ? "+" : "−"}${formatCurrency(Math.abs(value))}`;
}

function parseAdjustment(value: string) {
  if (!value || value === "-") return 0;
  const parsed = Number(value);
  return Number.isInteger(parsed) && Number.isFinite(parsed) ? parsed : 0;
}

function updateAmount(setter: (value: string) => void, value: string) {
  if (value === "" || value === "-") {
    setter(value);
    return;
  }
  if (!/^-?\d*$/.test(value)) return;
  const isNegative = value.startsWith("-");
  const digits = value.replace(/^-/, "").replace(/^0+(?=\d)/, "");
  setter(`${isNegative ? "-" : ""}${digits}`);
}

export function AdjustFeeWalletDialog({ open, onClose, studentId, summary }: Props) {
  const { toast } = useToast();
  const [hocPhiInput, setHocPhiInput] = useState("");
  const [datCocInput, setDatCocInput] = useState("");

  const hocPhiAdjustment = parseAdjustment(hocPhiInput);
  const datCocAdjustment = parseAdjustment(datCocInput);
  const adjustedHocPhi = summary.hocPhi + hocPhiAdjustment;
  const adjustedDatCoc = summary.datCoc + datCocAdjustment;
  const adjustedTotal = adjustedHocPhi + adjustedDatCoc;
  const hasAdjustment = hocPhiAdjustment !== 0 || datCocAdjustment !== 0;

  const adjustmentMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/students/${studentId}/fee-wallet-adjustment`, {
        hocPhiAmount: hocPhiAdjustment,
        datCocAmount: datCocAdjustment,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students", studentId, "fee-wallet"] });
      toast({ title: "Đã cân bằng tài khoản thành công" });
      setHocPhiInput("");
      setDatCocInput("");
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Không thể cân bằng tài khoản",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const close = () => {
    if (adjustmentMutation.isPending) return;
    setHocPhiInput("");
    setDatCocInput("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) close(); }}>
      <DialogContent className="max-w-xl z-[301]" overlayClassName="z-[300]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            Cân bằng tài khoản
          </DialogTitle>
          <DialogDescription>
            Nhập số dương để cộng hoặc số âm để trừ trực tiếp vào ví. Giao dịch sẽ được lưu vào lịch sử.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Số dư Học phí hiện tại</p>
              <p className="font-semibold text-green-700">{formatCurrency(summary.hocPhi)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Số dư Đặt cọc hiện tại</p>
              <p className="font-semibold text-violet-700">{formatCurrency(summary.datCoc)}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="wallet-adjustment-hoc-phi" className="text-sm font-medium">
                Điều chỉnh Học phí
              </label>
              <Input
                id="wallet-adjustment-hoc-phi"
                type="text"
                inputMode="numeric"
                value={hocPhiInput}
                onChange={event => updateAmount(setHocPhiInput, event.target.value)}
                onBlur={() => { if (hocPhiInput === "-") setHocPhiInput(""); }}
                placeholder="Ví dụ: 100000 hoặc -50000"
                disabled={adjustmentMutation.isPending}
                data-testid="input-adjust-wallet-hoc-phi"
              />
              <p className="text-xs text-muted-foreground">
                Sau cân bằng: <span className={adjustedHocPhi < 0 ? "text-red-600" : "font-medium"}>{formatCurrency(adjustedHocPhi)}</span>
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="wallet-adjustment-dat-coc" className="text-sm font-medium">
                Điều chỉnh Đặt cọc
              </label>
              <Input
                id="wallet-adjustment-dat-coc"
                type="text"
                inputMode="numeric"
                value={datCocInput}
                onChange={event => updateAmount(setDatCocInput, event.target.value)}
                onBlur={() => { if (datCocInput === "-") setDatCocInput(""); }}
                placeholder="Ví dụ: 100000 hoặc -50000"
                disabled={adjustmentMutation.isPending}
                data-testid="input-adjust-wallet-dat-coc"
              />
              <p className="text-xs text-muted-foreground">
                Sau cân bằng: <span className={adjustedDatCoc < 0 ? "text-red-600" : "font-medium"}>{formatCurrency(adjustedDatCoc)}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-primary/5 px-4 py-3">
            <div>
              <p className="font-semibold">Tổng tiền sau cân bằng</p>
              <p className="text-xs text-muted-foreground">
                Hiện tại {formatCurrency(summary.total)} · Điều chỉnh {formatSignedCurrency(hocPhiAdjustment + datCocAdjustment)}
              </p>
            </div>
            <span className={`text-lg font-bold ${adjustedTotal < 0 ? "text-red-600" : "text-primary"}`}>
              {formatCurrency(adjustedTotal)}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={adjustmentMutation.isPending}>Huỷ</Button>
          <Button
            onClick={() => adjustmentMutation.mutate()}
            disabled={adjustmentMutation.isPending || !hasAdjustment}
            data-testid="button-confirm-wallet-adjustment"
          >
            {adjustmentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu cân bằng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}