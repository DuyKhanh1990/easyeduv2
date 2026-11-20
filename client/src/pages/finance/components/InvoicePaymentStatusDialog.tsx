import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/hooks/use-language";
import { INVOICE_ACCOUNT_OPTIONS } from "../invoiceAccountOptions";

export type InvoicePaymentStatusDetails = {
  account?: string | null;
  counterAccount?: string | null;
  paymentMethod: string;
};

const OPTIONAL_ACCOUNT_OPTIONS = [
  { value: "__unchanged__", label: "Giữ nguyên" },
  ...INVOICE_ACCOUNT_OPTIONS,
];

export function InvoicePaymentStatusDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending = false,
  title = "Thông tin thanh toán",
  initialAccount,
  initialCounterAccount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (details: InvoicePaymentStatusDetails) => void;
  isPending?: boolean;
  title?: string;
  initialAccount?: string | null;
  initialCounterAccount?: string | null;
}) {
  const { lang, t } = useLanguage();
  const [account, setAccount] = useState("");
  const [counterAccount, setCounterAccount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");

  useEffect(() => {
    if (open) {
      setAccount(initialAccount ?? "");
      setCounterAccount(initialCounterAccount ?? "");
      setPaymentMethod("");
    }
  }, [open, initialAccount, initialCounterAccount]);

  const searchPlaceholder = lang === "en"
    ? "Search by account code or name..."
    : "Tìm theo mã hoặc tên tài khoản...";
  const accountLabel = lang === "en" ? "Income/expense account" : "Tài khoản thu/chi";
  const unchangedLabel = lang === "en" ? "Keep current" : "Giữ nguyên";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{accountLabel}</label>
            <SearchableSelect
              value={account || "__unchanged__"}
              onChange={value => setAccount(value === "__unchanged__" ? "" : value)}
              options={OPTIONAL_ACCOUNT_OPTIONS}
              placeholder={unchangedLabel}
              searchPlaceholder={searchPlaceholder}
              className="h-10"
              modal
              data-testid="quick-payment-account"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("finance.create.counterAccount")}</label>
            <SearchableSelect
              value={counterAccount || "__unchanged__"}
              onChange={value => setCounterAccount(value === "__unchanged__" ? "" : value)}
              options={OPTIONAL_ACCOUNT_OPTIONS}
              placeholder={unchangedLabel}
              searchPlaceholder={searchPlaceholder}
              className="h-10"
              modal
              data-testid="quick-payment-counter-account"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t("finance.paymentMethod")} <span className="text-destructive">*</span>
            </label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="h-10" data-testid="quick-payment-method">
                <SelectValue placeholder="Chọn hình thức thanh toán" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">{t("finance.cash")}</SelectItem>
                <SelectItem value="transfer">{t("finance.transfer")}</SelectItem>
                <SelectItem value="deposit_wallet">{t("finance.depositWallet")}</SelectItem>
                <SelectItem value="card">{t("finance.card")}</SelectItem>
                <SelectItem value="installment">{t("finance.installmentPayment")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {t("finance.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm({
              account: account || undefined,
              counterAccount: counterAccount || undefined,
              paymentMethod,
            })}
            disabled={!paymentMethod || isPending}
            data-testid="quick-payment-confirm"
          >
            {isPending ? t("finance.processing") : "Xác nhận"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
