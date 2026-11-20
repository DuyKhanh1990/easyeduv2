import { useState, useEffect } from "react";
import { format, parseISO, isValid } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DollarSign, Loader2 } from "lucide-react";
import type { SalaryPaymentInfo } from "./SalaryPaymentDialog";

interface BulkSalaryPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  items: SalaryPaymentInfo[];
  locationId?: string;
  locationName?: string;
  salaryTableId?: string;
  salaryTableName?: string;
  startDate?: string;
  endDate?: string;
  onAllPaid: (results: { rowKey: string; paidAmount: number; invoiceId: string }[]) => void;
}

function formatMoney(amount: number): string {
  return amount.toLocaleString("vi-VN") + "đ";
}

function fmtDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = parseISO(dateStr);
    return isValid(d) ? format(d, "dd/MM/yyyy") : dateStr;
  } catch {
    return dateStr;
  }
}

export function BulkSalaryPaymentDialog({
  open,
  onClose,
  items,
  locationId,
  locationName,
  salaryTableId,
  salaryTableName,
  startDate,
  endDate,
  onAllPaid,
}: BulkSalaryPaymentDialogProps) {
  const { toast } = useToast();
  const [description, setDescription] = useState("");
  const [splitMode, setSplitMode] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const totalAmount = items.reduce((sum, i) => sum + (i.totalSalary - i.alreadyPaid), 0);

  const tableLabel = [
    salaryTableName,
    locationName,
    startDate && endDate ? `${fmtDate(startDate)} – ${fmtDate(endDate)}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const buildCombinedDescription = () => {
    if (items.length === 0) return "";
    const names = [...new Set(items.map((i) => i.teacherCode ? `${i.teacherName} (${i.teacherCode})` : i.teacherName))];
    const classAmounts = items
      .map((i) => `${i.className}: ${formatMoney(i.totalSalary - i.alreadyPaid)}`)
      .join(", ");
    return `Chi lương Giáo viên ${names.join(", ")} - Lớp ${classAmounts}\nBảng lương: ${tableLabel}`;
  };

  const buildSplitDescription = (item: SalaryPaymentInfo) => {
    const name = item.teacherCode ? `${item.teacherName} (${item.teacherCode})` : item.teacherName;
    const remaining = item.totalSalary - item.alreadyPaid;
    return `Chi lương Giáo viên ${name} - Lớp ${item.className}: ${formatMoney(remaining)}\nBảng lương: ${tableLabel}`;
  };

  useEffect(() => {
    if (open && items.length > 0) {
      setDescription(splitMode ? buildSplitDescription(items[0]) : buildCombinedDescription());
    }
  }, [open, items, splitMode]);

  const handleConfirm = async () => {
    if (items.length === 0) return;
    setIsPending(true);

    const results: { rowKey: string; paidAmount: number; invoiceId: string }[] = [];
    const errors: string[] = [];

    if (!splitMode) {
      // Gộp: 1 phiếu chi tổng, không gắn classId cụ thể
      const desc = description.trim() || buildCombinedDescription();
      const subjectNames = [...new Set(items.map((i) => `${i.teacherCode} - ${i.teacherName}`))].join(", ");
      try {
        const res = await apiRequest("POST", "/api/finance/invoices", {
          type: "Chi",
          locationId: locationId || null,
          category: "Chi lương",
          classId: null,
          salaryTableId: salaryTableId || null,
          studentId: null,
          subjectName: subjectNames,
          account: "334",
          counterAccount: "641",
          totalAmount: String(totalAmount),
          totalPromotion: "0",
          totalSurcharge: "0",
          grandTotal: String(totalAmount),
          paidAmount: String(totalAmount),
          remainingAmount: "0",
          description: desc,
          note: desc,
          status: "paid",
          items: items.map((info) => {
            const remaining = info.totalSalary - info.alreadyPaid;
            const itemDesc = buildSplitDescription(info);
            return {
              packageName: itemDesc,
              packageId: null,
              packageType: null,
              unitPrice: String(remaining),
              quantity: 1,
              promotionKeys: [],
              surchargeKeys: [],
              promotionAmount: "0",
              surchargeAmount: "0",
              subtotal: String(remaining),
            };
          }),
          paymentSchedule: [],
        });
        const data = await res.json();
        for (const info of items) {
          const remaining = info.totalSalary - info.alreadyPaid;
          results.push({ rowKey: info.rowKey, paidAmount: remaining, invoiceId: data.id });
        }
      } catch (err: any) {
        errors.push(err.message);
      }
    } else {
      // Riêng lẻ: mỗi gói 1 phiếu chi song song
      await Promise.all(
        items.map(async (info) => {
          const remaining = info.totalSalary - info.alreadyPaid;
          if (remaining <= 0) return;
          const desc = buildSplitDescription(info);
          try {
            if (info.existingInvoiceId) {
              await apiRequest(
                "POST",
                `/api/finance/invoices/${info.existingInvoiceId}/append-salary-payment`,
                { amountPaid: remaining }
              );
              results.push({ rowKey: info.rowKey, paidAmount: remaining, invoiceId: info.existingInvoiceId });
            } else {
              const res = await apiRequest("POST", "/api/finance/invoices", {
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
                paidAmount: String(remaining),
                remainingAmount: "0",
                description: desc,
                note: desc,
                status: "paid",
                items: [
                  {
                    packageName: desc,
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
                paymentSchedule: [],
              });
              const data = await res.json();
              results.push({ rowKey: info.rowKey, paidAmount: remaining, invoiceId: data.id });
            }
          } catch (err: any) {
            errors.push(`${info.className}: ${err.message}`);
          }
        })
      );
    }

    queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
    queryClient.refetchQueries({ queryKey: ["/api/finance/invoices"], type: "all" });
    if (salaryTableId) {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices", "Chi", salaryTableId] });
    }

    setIsPending(false);

    if (errors.length > 0) {
      toast({
        title: `Chi lương hoàn tất (${results.length}/${items.length} thành công)`,
        description: errors.join("; "),
        variant: "destructive",
      });
    } else {
      toast({
        title: splitMode
          ? `Chi lương thành công — ${results.length} phiếu chi`
          : "Chi lương thành công — 1 phiếu chi tổng",
      });
    }

    if (results.length > 0) {
      onAllPaid(results);
    }
    onClose();
  };

  const invoiceCount = splitMode ? items.length : 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isPending) onClose(); }}>
      <DialogContent className="max-w-lg" data-testid="dialog-bulk-salary-payment">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <DollarSign className="h-4 w-4 text-green-600" />
            Chi lương gộp ({items.length} gói)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Giáo viên</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Lớp</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Lương</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const remaining = item.totalSalary - item.alreadyPaid;
                  return (
                    <tr key={item.rowKey} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-medium">{item.teacherName}</div>
                        {item.teacherCode && (
                          <div className="text-xs text-muted-foreground">{item.teacherCode}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{item.className}</td>
                      <td className="px-3 py-2 text-right font-semibold text-blue-600">
                        {formatMoney(remaining)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t bg-muted/30">
                <tr>
                  <td className="px-3 py-2 font-semibold" colSpan={2}>Tổng chi</td>
                  <td className="px-3 py-2 text-right font-bold text-green-600 text-base">
                    {formatMoney(totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="split-mode"
              checked={splitMode}
              onCheckedChange={(v) => setSplitMode(!!v)}
              data-testid="checkbox-split-mode"
            />
            <label htmlFor="split-mode" className="text-sm cursor-pointer select-none">
              Tạo chi riêng lẻ
              {splitMode && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({items.length} phiếu chi)
                </span>
              )}
            </label>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Mô tả phiếu chi</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="text-sm resize-none min-h-[72px]"
              data-testid="input-bulk-salary-description"
            />
            {splitMode && (
              <p className="text-xs text-muted-foreground">
                Mô tả trên áp dụng cho từng phiếu chi (tự động điều chỉnh tên lớp và số tiền).
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Hủy
          </Button>
          <Button
            className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
            onClick={handleConfirm}
            disabled={isPending || items.length === 0}
            data-testid="button-confirm-bulk-pay"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang xử lý...
              </>
            ) : (
              <>
                <DollarSign className="h-4 w-4" />
                Tạo {invoiceCount} phiếu chi — {formatMoney(totalAmount)}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
