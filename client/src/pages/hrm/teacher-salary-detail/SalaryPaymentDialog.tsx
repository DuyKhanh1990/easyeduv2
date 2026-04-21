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
import { DollarSign } from "lucide-react";

export interface SalaryPaymentInfo {
  rowKey: string;
  teacherCode: string;
  teacherName: string;
  role: string;
  className: string;
  classId: string;
  totalSalary: number;
  alreadyPaid: number;
  existingInvoiceId?: string;
}

interface SalaryPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  info: SalaryPaymentInfo | null;
  locationId?: string;
  salaryTableId?: string;
  salaryTableName?: string;
  onPaid: (rowKey: string, paidAmount: number, invoiceId: string) => void;
}

function formatMoney(amount: number): string {
  return amount.toLocaleString("vi-VN") + "đ";
}

export function SalaryPaymentDialog({
  open,
  onClose,
  info,
  locationId,
  salaryTableId,
  salaryTableName,
  onPaid,
}: SalaryPaymentDialogProps) {
  const { toast } = useToast();
  const [amount, setAmount] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  const maxAmount = info ? info.totalSalary - info.alreadyPaid : 0;

  const buildAutoDescription = (i: SalaryPaymentInfo) => {
    const nameWithCode = i.teacherCode
      ? `${i.teacherName} (${i.teacherCode})`
      : i.teacherName;
    return `Chi lương Giáo viên ${nameWithCode} - Lớp ${i.className} - ${salaryTableName ?? ""}`;
  };

  useEffect(() => {
    if (open && info) {
      setAmount(String(maxAmount));
      setDescription(buildAutoDescription(info));
    }
  }, [open, info]);

  const parsedAmount = parseInt(amount.replace(/\D/g, ""), 10) || 0;
  const remainingAfter = info ? info.totalSalary - info.alreadyPaid - parsedAmount : 0;
  const isFullPay = info ? parsedAmount === maxAmount && maxAmount > 0 : false;

  const invalidateAndRefetch = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
    queryClient.refetchQueries({ queryKey: ["/api/finance/invoices"] });
    if (salaryTableId) {
      queryClient.invalidateQueries({
        queryKey: ["/api/finance/invoices", "Chi", salaryTableId],
      });
    }
  };

  const createMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("POST", "/api/finance/invoices", body);
      return res.json();
    },
    onSuccess: (data: any) => {
      invalidateAndRefetch();
      toast({ title: "Tạo phiếu chi thành công" });
      if (info) onPaid(info.rowKey, parsedAmount, data.id);
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Lỗi khi tạo phiếu chi", description: err.message, variant: "destructive" });
    },
  });

  const appendMutation = useMutation({
    mutationFn: async ({ invoiceId, amountPaid }: { invoiceId: string; amountPaid: number }) => {
      const res = await apiRequest("POST", `/api/finance/invoices/${invoiceId}/append-salary-payment`, { amountPaid });
      return res.json();
    },
    onSuccess: (_data: any, variables) => {
      invalidateAndRefetch();
      toast({ title: "Ghi nhận thanh toán thành công" });
      if (info) onPaid(info.rowKey, parsedAmount, variables.invoiceId);
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Lỗi khi ghi nhận thanh toán", description: err.message, variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!info) return;
    if (parsedAmount <= 0) {
      toast({ title: "Vui lòng nhập số tiền hợp lệ", variant: "destructive" });
      return;
    }
    if (parsedAmount > maxAmount) {
      toast({ title: `Số tiền chi tối đa là ${formatMoney(maxAmount)}`, variant: "destructive" });
      return;
    }

    if (info.existingInvoiceId) {
      appendMutation.mutate({ invoiceId: info.existingInvoiceId, amountPaid: parsedAmount });
      return;
    }

    const newPaidTotal = parsedAmount;
    const invoiceStatus = isFullPay ? "paid" : "partial";
    const remainingStr = String(Math.max(0, info.totalSalary - newPaidTotal));

    const paymentSchedule = isFullPay
      ? []
      : [
          {
            label: "ĐỢT 1",
            code: `PC-${Date.now()}`,
            amount: String(parsedAmount),
            dueDate: null,
            status: "paid",
          },
          {
            label: "ĐỢT 2",
            code: `PC-${Date.now() + 1}`,
            amount: String(remainingAfter),
            dueDate: null,
            status: "unpaid",
          },
        ];

    createMutation.mutate({
      type: "Chi",
      locationId: locationId || null,
      category: "Chi lương",
      classId: info.classId || null,
      salaryTableId: salaryTableId || null,
      studentId: null,
      subjectName: `${info.teacherCode} - ${info.teacherName}`,
      account: "334",
      counterAccount: "641",
      totalAmount: String(info.totalSalary),
      totalPromotion: "0",
      totalSurcharge: "0",
      grandTotal: String(info.totalSalary),
      paidAmount: String(newPaidTotal),
      remainingAmount: remainingStr,
      description: description.trim() || buildAutoDescription(info),
      note: description.trim() || buildAutoDescription(info),
      status: invoiceStatus,
      items: [
        {
          packageName: description.trim() || buildAutoDescription(info),
          packageId: null,
          packageType: null,
          unitPrice: String(info.totalSalary),
          quantity: 1,
          promotionKeys: [],
          surchargeKeys: [],
          promotionAmount: "0",
          surchargeAmount: "0",
          subtotal: String(info.totalSalary),
        },
      ],
      paymentSchedule,
    });
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    setAmount(raw);
  };

  const isPending = createMutation.isPending || appendMutation.isPending;

  if (!info) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md" data-testid="dialog-salary-payment">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <DollarSign className="h-4 w-4 text-green-600" />
            {info.existingInvoiceId ? "Ghi nhận thanh toán thêm" : "Tạo phiếu chi lương"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Giáo viên:</span>
              <span className="font-medium">
                {info.teacherName}{info.teacherCode ? ` (${info.teacherCode})` : ""}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vai trò:</span>
              <span>{info.role}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lớp:</span>
              <span>{info.className}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tổng lương:</span>
              <span className="font-semibold text-blue-600">{formatMoney(info.totalSalary)}</span>
            </div>
            {info.alreadyPaid > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Đã chi:</span>
                <span className="text-orange-600 font-medium">{formatMoney(info.alreadyPaid)}</span>
              </div>
            )}
            {info.alreadyPaid > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Còn lại:</span>
                <span className="text-green-600 font-medium">{formatMoney(maxAmount)}</span>
              </div>
            )}
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Mô tả phiếu chi</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-sm resize-none min-h-[60px]"
                data-testid="input-salary-description"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Số tiền chi <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                inputMode="numeric"
                value={parsedAmount > 0 ? parsedAmount.toLocaleString("vi-VN") : ""}
                onChange={handleAmountChange}
                placeholder="Nhập số tiền..."
                className="h-9 text-sm"
                data-testid="input-salary-amount"
              />
              {parsedAmount > 0 && !isFullPay && remainingAfter > 0 && (
                <p className="text-xs text-orange-600">
                  Đợt chi này: {formatMoney(parsedAmount)} (đã thanh toán) — Còn lại: {formatMoney(remainingAfter)} (chưa thanh toán)
                </p>
              )}
              {isFullPay && (
                <p className="text-xs text-green-600">
                  Thanh toán đầy đủ — Phiếu chi sẽ ở trạng thái Đã thanh toán
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            data-testid="button-cancel-payment"
          >
            Hủy
          </Button>
          <Button
            size="sm"
            className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
            onClick={handleCreate}
            disabled={isPending || parsedAmount <= 0}
            data-testid="button-create-payment"
          >
            <DollarSign className="h-3.5 w-3.5" />
            {isPending ? "Đang xử lý..." : info.existingInvoiceId ? "Ghi nhận thanh toán" : "Tạo phiếu chi"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
