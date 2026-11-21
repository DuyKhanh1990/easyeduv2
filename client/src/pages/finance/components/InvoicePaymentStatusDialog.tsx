import { useEffect, useMemo, useState } from "react";
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
import { useLocations } from "@/hooks/use-locations";
import { INVOICE_ACCOUNT_OPTIONS } from "../invoiceAccountOptions";

export type AppliedBankAccount = {
  bankName?: string;
  bankAccount: string;
  accountHolder?: string;
};

export type InvoicePaymentStatusDetails = {
  account?: string | null;
  counterAccount?: string | null;
  paymentMethod: string;
  appliedBankAccount?: AppliedBankAccount | null;
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
  locationId,
  initialAppliedBankAccount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (details: InvoicePaymentStatusDetails) => void;
  isPending?: boolean;
  title?: string;
  initialAccount?: string | null;
  initialCounterAccount?: string | null;
  locationId?: string | null;
  initialAppliedBankAccount?: AppliedBankAccount | null;
}) {
  const { lang, t } = useLanguage();
  const { data: locations = [] } = useLocations();
  const [account, setAccount] = useState("");
  const [counterAccount, setCounterAccount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [bankAccount, setBankAccount] = useState("");

  const locationBanks = useMemo(() => {
    const raw = locations.find(location => location.id === locationId)?.bankAccounts;
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((bank): bank is AppliedBankAccount =>
            typeof bank?.bankAccount === "string" && bank.bankAccount.length > 0,
          )
        : [];
    } catch {
      return [];
    }
  }, [locations, locationId]);

  useEffect(() => {
    if (open) {
      setAccount(initialAccount ?? "");
      setCounterAccount(initialCounterAccount ?? "");
      setPaymentMethod("");
      setBankAccount(initialAppliedBankAccount?.bankAccount ?? "");
    }
  }, [open, initialAccount, initialCounterAccount, initialAppliedBankAccount]);

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
            <Select
              value={paymentMethod}
              onValueChange={value => {
                setPaymentMethod(value);
                if (value !== "transfer") setBankAccount("");
              }}
            >
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

          {paymentMethod === "transfer" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("finance.bank")}</label>
              {!locationId ? (
                <p className="text-xs text-muted-foreground">
                  {lang === "en"
                    ? "Select one location at a time to choose a bank account."
                    : "Hãy chọn hóa đơn cùng một cơ sở để chọn ngân hàng."}
                </p>
              ) : (
                <Select value={bankAccount} onValueChange={setBankAccount}>
                  <SelectTrigger className="h-10" data-testid="quick-payment-bank">
                    <SelectValue placeholder={t("finance.create.chooseBank")} />
                  </SelectTrigger>
                  <SelectContent>
                    {locationBanks.length === 0
                      ? <SelectItem value="__bank_not_configured__" disabled>{t("finance.bankNotConfigured")}</SelectItem>
                      : locationBanks.map((bank, index) => (
                          <SelectItem key={`${bank.bankAccount}-${index}`} value={bank.bankAccount}>
                            {bank.bankName || bank.bankAccount} - {bank.bankAccount}
                            {bank.accountHolder ? ` (${bank.accountHolder})` : ""}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
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
              appliedBankAccount: paymentMethod === "transfer"
                ? locationBanks.find(bank => bank.bankAccount === bankAccount)
                  ?? (bankAccount ? { bankAccount } : locationId ? null : undefined)
                : null,
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
