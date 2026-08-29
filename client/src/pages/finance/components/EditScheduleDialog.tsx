import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useInvoiceSchedules } from "@/hooks/use-invoice-schedules";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Pencil } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import type { ScheduleItem } from "@/types/invoice-types";

export function EditScheduleDialog({
  schedule,
  invoiceId,
  onClose,
}: {
  schedule: ScheduleItem;
  invoiceId: string;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState<number>(parseFloat(schedule.amount ?? "0"));
  const [dueDate, setDueDate] = useState<Date | undefined>(
    schedule.dueDate ? new Date(schedule.dueDate) : undefined
  );
  const [calOpen, setCalOpen] = useState(false);
  const { toast } = useToast();
  const { updateMutation } = useInvoiceSchedules(invoiceId);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-gray-600" />
            Sửa đợt thanh toán
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            <span className="text-muted-foreground">Đợt: </span>
            <span className="font-medium">{schedule.label}{schedule.code ? ` (${schedule.code})` : ""}</span>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Số tiền</label>
            <Input
              type="number"
              value={amount}
              onChange={e => setAmount(Number(e.target.value))}
              className="text-right"
              data-testid="input-edit-amount"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Hạn thanh toán</label>
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <button
                  className="w-full flex items-center gap-2 h-9 px-3 rounded-md border bg-background text-sm hover:border-purple-400 transition-colors"
                  data-testid="input-edit-duedate"
                >
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  <span className={dueDate ? "text-foreground" : "text-muted-foreground"}>
                    {dueDate ? format(dueDate, "dd/MM/yyyy") : "Chọn ngày..."}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dueDate}
                  onSelect={(d) => { if (d) { setDueDate(d); setCalOpen(false); } }}
                  locale={vi}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={updateMutation.isPending}>Huỷ</Button>
          <Button
            className="bg-purple-600 hover:bg-purple-700"
            onClick={() =>
              updateMutation.mutate(
                {
                  scheduleId: schedule.id,
                  amount,
                  dueDate: dueDate ? dueDate.toISOString().split("T")[0] : null,
                },
                {
                  onSuccess: () => {
                    toast({ title: "Đã cập nhật đợt thanh toán" });
                    onClose();
                  },
                  onError: (err: any) =>
                    toast({ title: "Lỗi cập nhật", description: err.message, variant: "destructive" }),
                }
              )
            }
            disabled={updateMutation.isPending || amount <= 0}
            data-testid="button-confirm-edit-schedule"
          >
            {updateMutation.isPending ? "Đang lưu..." : "Lưu thay đổi"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
