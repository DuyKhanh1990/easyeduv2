import { useEffect, useState } from "react";
import type { FinancePromotion } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type FinancePromotionType = "promotion" | "surcharge";

type PromotionForm = {
  code: string;
  name: string;
  valueAmount: string;
  valueType: "percent" | "vnd";
  quantity: string;
  fromDate: string;
  toDate: string;
};

export type FinancePromotionDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (item: {
    code: string;
    name: string;
    valueAmount: string | null;
    valueType: "percent" | "vnd";
    quantity: number | null;
    fromDate: string | null;
    toDate: string | null;
  }) => void;
  initial?: Partial<FinancePromotion>;
  title: string;
  isSaving?: boolean;
};

function getInitialForm(initial?: Partial<FinancePromotion>): PromotionForm {
  return {
    code: initial?.code ?? "",
    name: initial?.name ?? "",
    valueAmount: initial?.valueAmount ?? "",
    valueType: (initial?.valueType ?? "percent") as "percent" | "vnd",
    quantity: initial?.quantity ? String(initial.quantity) : "",
    fromDate: initial?.fromDate ?? "",
    toDate: initial?.toDate ?? "",
  };
}

export function FinancePromotionDialog({
  open, onClose, onSave, initial, title, isSaving = false,
}: FinancePromotionDialogProps) {
  const [form, setForm] = useState<PromotionForm>(() => getInitialForm(initial));

  useEffect(() => {
    if (open) setForm(getInitialForm(initial));
  }, [open, initial]);

  const handleSave = () => {
    if (!form.code.trim() || !form.name.trim()) return;
    onSave({
      code: form.code.trim(),
      name: form.name.trim(),
      valueAmount: form.valueAmount || null,
      valueType: form.valueType,
      quantity: form.quantity ? parseInt(form.quantity, 10) : null,
      fromDate: form.fromDate || null,
      toDate: form.toDate || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={value => { if (!value && !isSaving) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Mã <span className="text-red-500">*</span></label>
              <Input
                placeholder="VD: KM001"
                value={form.code}
                onChange={e => setForm(current => ({ ...current, code: e.target.value }))}
                data-testid="input-promo-code"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Tên <span className="text-red-500">*</span></label>
              <Input
                placeholder="Tên khuyến mãi/phụ thu..."
                value={form.name}
                onChange={e => setForm(current => ({ ...current, name: e.target.value }))}
                data-testid="input-promo-name"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Giá trị</label>
            <div className="flex gap-2">
              <Input
                placeholder="Nhập giá trị..."
                value={form.valueAmount}
                onChange={e => setForm(current => ({ ...current, valueAmount: e.target.value }))}
                className="flex-1"
                data-testid="input-promo-value"
              />
              <Select value={form.valueType} onValueChange={value => setForm(current => ({ ...current, valueType: value as "percent" | "vnd" }))}>
                <SelectTrigger className="w-24" data-testid="select-promo-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">%</SelectItem>
                  <SelectItem value="vnd">VNĐ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Số lượng</label>
            <Input
              type="number"
              placeholder="Số lượng áp dụng..."
              value={form.quantity}
              onChange={e => setForm(current => ({ ...current, quantity: e.target.value }))}
              data-testid="input-promo-quantity"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Thời gian áp dụng</label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Từ ngày</label>
                <Input type="date" value={form.fromDate} onChange={e => setForm(current => ({ ...current, fromDate: e.target.value }))} data-testid="input-promo-from" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Đến ngày</label>
                <Input type="date" value={form.toDate} onChange={e => setForm(current => ({ ...current, toDate: e.target.value }))} data-testid="input-promo-to" />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Huỷ</Button>
          <Button onClick={handleSave} disabled={isSaving || !form.code.trim() || !form.name.trim()} data-testid="button-save-promo">
            {isSaving ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}