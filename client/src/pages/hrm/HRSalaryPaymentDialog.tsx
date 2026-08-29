import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DollarSign, TrendingDown } from "lucide-react";

export interface HRPaymentInfo {
  empId: string;
  staffCode: string;
  staffName: string;
  roleName: string;
  thucNhan: number;
  sheetId: string;
  sheetCode: string;
  sheetPeriod: string;
  locationId: string;
}

interface HRSalaryPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  info: HRPaymentInfo | null;
  onPaid: (empId: string) => void;
}

function fmtMoney(n: number) {
  return Math.abs(n).toLocaleString("vi-VN") + "đ";
}

function buildAutoDesc(info: HRPaymentInfo) {
  const label = info.thucNhan < 0 ? "Thu lương" : "Chi lương";
  const nameWithCode = info.staffCode
    ? `${info.staffName} (${info.staffCode})`
    : info.staffName;
  return `${label} - ${nameWithCode} - ${info.sheetCode} - ${info.sheetPeriod}`;
}

export function HRSalaryPaymentDialog({
  open,
  onClose,
  info,
  onPaid,
}: HRSalaryPaymentDialogProps) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const absAmount = info ? Math.abs(info.thucNhan) : 0;
  const isThu = info ? info.thucNhan < 0 : false;

  useEffect(() => {
    if (open && info) {
      setAmount(String(absAmount));
      setDescription(buildAutoDesc(info));
    }
  }, [open, info]);

  const parsedAmount = parseInt(amount.replace(/\D/g, ""), 10) || 0;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
    queryClient.invalidateQueries({ queryKey: ["/api/salary-sheets"] });
  };

  const markPaidMutation = useMutation({
    mutationFn: async (empId: string) => {
      const res = await apiRequest(
        "POST",
        `/api/salary-sheets/${info!.sheetId}/employees/bulk-pay`,
        { empIds: [empId] }
      );
      return res.json();
    },
    onSuccess: (_data, empId) => {
      invalidate();
      onPaid(empId);
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Lỗi cập nhật trạng thái", description: err.message, variant: "destructive" });
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("POST", "/api/finance/invoices", body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: isThu ? "Tạo phiếu thu thành công" : "Tạo phiếu chi thành công" });
      markPaidMutation.mutate(info!.empId);
    },
    onError: (err: any) => {
      toast({ title: "Lỗi khi tạo phiếu", description: err.message, variant: "destructive" });
    },
  });

  const handleConfirm = () => {
    if (!info) return;
    if (parsedAmount <= 0) {
      toast({ title: "Vui lòng nhập số tiền hợp lệ", variant: "destructive" });
      return;
    }

    const desc = description.trim() || buildAutoDesc(info);
    const type = isThu ? "Thu" : "Chi";
    const account = isThu ? "641" : "334";
    const counterAccount = isThu ? "334" : "641";

    createInvoiceMutation.mutate({
      type,
      locationId: info.locationId || null,
      category: isThu ? "Thu lương" : "Chi lương",
      classId: null,
      salaryTableId: info.sheetId,
      studentId: null,
      subjectName: info.staffCode
        ? `${info.staffCode} - ${info.staffName}`
        : info.staffName,
      account,
      counterAccount,
      totalAmount: String(parsedAmount),
      totalPromotion: "0",
      totalSurcharge: "0",
      grandTotal: String(parsedAmount),
      paidAmount: String(parsedAmount),
      remainingAmount: "0",
      description: desc,
      note: desc,
      status: "paid",
      items: [
        {
          packageName: desc,
          packageId: null,
          packageType: null,
          unitPrice: String(parsedAmount),
          quantity: 1,
          promotionKeys: [],
          surchargeKeys: [],
          promotionAmount: "0",
          surchargeAmount: "0",
          subtotal: String(parsedAmount),
        },
      ],
      paymentSchedule: [],
    });
  };

  const isPending = createInvoiceMutation.isPending || markPaidMutation.isPending;

  if (!info) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            {isThu
              ? <TrendingDown className="h-4 w-4 text-rose-600" />
              : <DollarSign className="h-4 w-4 text-green-600" />
            }
            {isThu ? "Tạo phiếu thu lương" : "Tạo phiếu chi lương"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nhân viên:</span>
              <span className="font-medium">
                {info.staffName}{info.staffCode ? ` (${info.staffCode})` : ""}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vai trò:</span>
              <span>{info.roleName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bảng lương:</span>
              <span>{info.sheetCode} · {info.sheetPeriod}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {isThu ? "Số tiền thu:" : "Thực nhận:"}
              </span>
              <span className={`font-semibold ${isThu ? "text-rose-600" : "text-emerald-600"}`}>
                {fmtMoney(info.thucNhan)}
              </span>
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Mô tả phiếu</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-sm resize-none min-h-[60px]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Số tiền <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                inputMode="numeric"
                value={parsedAmount > 0 ? parsedAmount.toLocaleString("vi-VN") : ""}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                placeholder="Nhập số tiền..."
                className="h-9 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Hủy
          </Button>
          <Button
            size="sm"
            className={`gap-1.5 text-white ${isThu ? "bg-rose-600 hover:bg-rose-700" : "bg-green-600 hover:bg-green-700"}`}
            onClick={handleConfirm}
            disabled={isPending || parsedAmount <= 0}
          >
            {isThu
              ? <TrendingDown className="h-3.5 w-3.5" />
              : <DollarSign className="h-3.5 w-3.5" />
            }
            {isPending ? "Đang xử lý..." : isThu ? "Tạo phiếu thu" : "Tạo phiếu chi"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
