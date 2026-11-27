import { useState, useMemo, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Merge, X, QrCode } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { type InvoiceRow, type ScheduleItem, STATUS_CONFIG, isInvoicePaidLike, parseNum, fmtMoney } from "@/types/invoice-types";
import { format } from "date-fns";
import type { BulkCollectPrintData } from "./BulkCollectPrintPreview";
import { getBankCode, sanitizeForBankPreservingCase } from "./qr-utils";

export type { BulkCollectPrintData };

interface BulkCollectDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (printData: BulkCollectPrintData) => void;
  initialInvoices: InvoiceRow[];
  initialSchedules?: Map<string, ScheduleItem>;
  invoiceType: "Thu" | "Chi";
}

const PAYMENT_METHODS = [
  { value: "cash",     labelKey: "finance.cash" },
  { value: "transfer", labelKey: "finance.transfer" },
  { value: "deposit_wallet", labelKey: "finance.depositWallet" },
  { value: "card", labelKey: "finance.card" },
  { value: "installment", labelKey: "finance.installmentPayment" },
  { value: "other",    labelKey: "finance.other" },
];

export function BulkCollectDialog({
  open,
  onClose,
  onSuccess,
  initialInvoices,
  initialSchedules,
  invoiceType,
}: BulkCollectDialogProps) {
  const { toast } = useToast();
  const { t } = useLanguage();

  const [search, setSearch] = useState("");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    () => new Set(initialInvoices.map(inv => inv.id))
  );
  const [checkedScheduleIds, setCheckedScheduleIds] = useState<Set<string>>(
    () => new Set(initialSchedules?.keys() ?? [])
  );
  const [paymentDate, setPaymentDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  );
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [collectorName, setCollectorName] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [qrImageError, setQrImageError] = useState(false);

  const { data: locationsData = [] } = useQuery<any[]>({
    queryKey: ["/api/locations"],
    enabled: open && invoiceType === "Thu",
  });

  const allSchedules = useMemo(
    () => Array.from(initialSchedules?.values() ?? []),
    [initialSchedules]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialInvoices;
    return initialInvoices.filter(inv =>
      (inv.code ?? "").toLowerCase().includes(q) ||
      (inv.description ?? "").toLowerCase().includes(q) ||
      (inv.name ?? "").toLowerCase().includes(q)
    );
  }, [initialInvoices, search]);

  const filteredSchedules = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allSchedules;
    return allSchedules.filter(s =>
      (s.code ?? "").toLowerCase().includes(q) ||
      (s.label ?? "").toLowerCase().includes(q)
    );
  }, [allSchedules, search]);

  const checkedInvoices = useMemo(
    () => initialInvoices.filter(inv => checkedIds.has(inv.id)),
    [initialInvoices, checkedIds]
  );

  const checkedSchedules = useMemo(
    () => allSchedules.filter(s => checkedScheduleIds.has(s.id)),
    [allSchedules, checkedScheduleIds]
  );

  const unpaidCheckedInvoices = useMemo(
    () => checkedInvoices.filter(inv => !isInvoicePaidLike(inv.status)),
    [checkedInvoices]
  );

  const unpaidCheckedSchedules = useMemo(
    () => checkedSchedules.filter(s => !isInvoicePaidLike(s.status)),
    [checkedSchedules]
  );

  const totalAmount = useMemo(() => {
    const invTotal = unpaidCheckedInvoices.reduce((sum, inv) => sum + parseNum(inv.grandTotal), 0);
    const schedTotal = unpaidCheckedSchedules.reduce((sum, s) => sum + parseNum(s.amount), 0);
    return invTotal + schedTotal;
  }, [unpaidCheckedInvoices, unpaidCheckedSchedules]);

  const qrLocationResolution = useMemo(() => {
    const locationIds = new Set<string>();
    let hasUnresolvedLocation = false;
    for (const invoice of unpaidCheckedInvoices) {
      const branchLocation = locationsData.find((location) =>
        location.name === invoice.branch || location.locationName === invoice.branch
      );
      const locationId = invoice.locationId || branchLocation?.id;
      if (locationId) locationIds.add(String(locationId));
      else hasUnresolvedLocation = true;
    }
    for (const schedule of unpaidCheckedSchedules) {
      if (schedule.locationId) locationIds.add(String(schedule.locationId));
      else hasUnresolvedLocation = true;
    }

    if (locationIds.size > 1) return { issue: "multiple" as const, location: null };
    if (hasUnresolvedLocation) return { issue: "unknown" as const, location: null };
    if (locationIds.size === 1) {
      const id = Array.from(locationIds)[0];
      const location = locationsData.find((candidate) => String(candidate.id) === id) ?? null;
      return { issue: location ? null : "missing" as const, location };
    }
    if (locationsData.length === 1) return { issue: null, location: locationsData[0] };
    return { issue: "missing" as const, location: null };
  }, [locationsData, unpaidCheckedInvoices, unpaidCheckedSchedules]);

  const qrBankAccount = useMemo(() => {
    const raw = qrLocationResolution.location?.bankAccounts;
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(parsed)
        ? parsed.find((account) => String(account?.bankAccount ?? "").trim()) ?? null
        : null;
    } catch {
      return null;
    }
  }, [qrLocationResolution.location]);

  const qrBankName = String(qrBankAccount?.bankName ?? "").trim();
  const qrAccountNumber = String(qrBankAccount?.bankAccount ?? "").trim();
  const qrAccountHolder = String(qrBankAccount?.accountHolder ?? "").trim();
  const qrTransferContent = useMemo(() => {
    const identities = Array.from(new Set(unpaidCheckedInvoices
      .map((invoice) => [invoice.name?.trim(), invoice.studentCode?.trim()].filter(Boolean).join(" "))
      .filter(Boolean)));
    const identity = identities.length === 1 ? identities[0] : "THU GOP";
    const codes = [
      ...unpaidCheckedInvoices.map((invoice) => invoice.code),
      ...unpaidCheckedSchedules.map((schedule) => schedule.code),
    ].filter(Boolean);
    return sanitizeForBankPreservingCase([identity, ...codes].join(" "), 160);
  }, [unpaidCheckedInvoices, unpaidCheckedSchedules]);

  const qrImageUrl = useMemo(() => {
    if (!qrBankName || !qrAccountNumber || totalAmount <= 0) return null;
    const bankCode = getBankCode(qrBankName);
    return `https://img.vietqr.io/image/${encodeURIComponent(bankCode)}-${encodeURIComponent(qrAccountNumber)}-compact2.png?amount=${Math.round(totalAmount)}&addInfo=${encodeURIComponent(qrTransferContent)}&accountName=${encodeURIComponent(qrAccountHolder)}`;
  }, [qrAccountHolder, qrAccountNumber, qrBankName, qrTransferContent, totalAmount]);

  useEffect(() => {
    setQrImageError(false);
  }, [qrImageUrl]);

  const alreadyPaidCount = useMemo(
    () =>
      initialInvoices.filter(inv => isInvoicePaidLike(inv.status)).length +
      allSchedules.filter(s => isInvoicePaidLike(s.status)).length,
    [initialInvoices, allSchedules]
  );

  const notPaidCount = useMemo(
    () =>
      initialInvoices.filter(inv => !isInvoicePaidLike(inv.status)).length +
      allSchedules.filter(s => !isInvoicePaidLike(s.status)).length,
    [initialInvoices, allSchedules]
  );

  const toggleOne = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSchedule = (id: string) => {
    setCheckedScheduleIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const collectMutation = useMutation({
    mutationFn: async () => {
      const unpaidInvoices = unpaidCheckedInvoices;
      const unpaidSchedules = unpaidCheckedSchedules;
      const ids = unpaidInvoices.map(inv => inv.id);
      const scheduleIds = unpaidSchedules.map(s => s.id);
      if (ids.length === 0 && scheduleIds.length === 0)
        throw new Error(t("finance.noInvoiceData"));
      const res = await apiRequest("POST", "/api/finance/invoices/bulk-collect", {
        ids,
        scheduleIds,
        paymentDate,
        paymentMethod,
        collectorName: collectorName.trim() || undefined,
        note: note.trim() || undefined,
      });
      const apiData = await res.json();
      return {
        ...apiData,
        _print: {
          items: [
            ...unpaidInvoices.map(inv => ({
              code: inv.code ?? "",
              description: inv.description || "",
              amount: parseNum(inv.grandTotal),
              isSchedule: false as const,
            })),
            ...unpaidSchedules.map(s => ({
              code: s.code ?? "",
              description: s.label || "",
              amount: parseNum(s.amount),
              isSchedule: true as const,
            })),
          ],
          paymentDate,
          paymentMethod,
          collectorName: collectorName.trim(),
          note: note.trim(),
        },
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
      const { ok, failed } = data.summary ?? {};
      toast({
        title: t("finance.bulkCollectSuccess", { type: invoiceType === "Thu" ? t("finance.incomeWord") : t("finance.expenseWord") }),
        description: t("finance.bulkCollectProcessed", { count: ok ?? 0, failed: failed > 0 ? `, ${failed} ${t("finance.receipts")}` : "" }),
        variant: failed > 0 ? "destructive" : "default",
      });
      const printItems = data._print?.items ?? [];
      const printData: BulkCollectPrintData = {
        items: printItems,
        paymentDate: data._print?.paymentDate ?? paymentDate,
        paymentMethod: data._print?.paymentMethod ?? paymentMethod,
        collectorName: data._print?.collectorName ?? collectorName.trim(),
        note: data._print?.note ?? note.trim(),
        invoiceType,
        totalAmount: printItems.reduce((sum: number, i: { amount: number }) => sum + i.amount, 0),
        customerName: initialInvoices[0]?.name ?? "",
      };
      onSuccess(printData);
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: t("finance.bulkCollectError"),
        description: err?.message ?? t("finance.tryAgain"),
        variant: "destructive",
      });
    },
  });

  const isPending = collectMutation.isPending;

  const uncheckedInvoicesToPay = unpaidCheckedInvoices;
  const uncheckedSchedulesToPay = unpaidCheckedSchedules;
  const uncheckedToPay = uncheckedInvoicesToPay.length + uncheckedSchedulesToPay.length;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Merge className="h-5 w-5 text-purple-600" />
            {t("finance.bulkCollectTitle", { type: invoiceType === "Thu" ? t("finance.incomeWord") : t("finance.expenseWord") })}
          </DialogTitle>

          <div className="grid grid-cols-4 gap-3 mt-3">
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-foreground">
                {initialInvoices.length + allSchedules.length}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{t("finance.totalReceipts")}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{alreadyPaidCount}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{t("finance.paid")}</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-amber-600">{notPaidCount}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{t("finance.unpaidStatus")}</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-purple-700">{uncheckedToPay}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{t("finance.willCollect")}</div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* Left panel - Invoice list */}
          <div className="flex flex-col w-1/2 border-r min-h-0">
            <div className="px-4 py-3 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder={t("finance.searchInvoices")}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <tr className="border-b">
                    <th className="p-2 w-8"></th>
                    <th className="p-2 text-left font-semibold text-muted-foreground">{t("finance.receiptCode")}</th>
                    <th className="p-2 text-left font-semibold text-muted-foreground">{t("finance.description")}</th>
                    <th className="p-2 text-right font-semibold text-muted-foreground">{t("finance.amount")}</th>
                    <th className="p-2 text-center font-semibold text-muted-foreground">{t("finance.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(inv => {
                    const isChecked = checkedIds.has(inv.id);
                    const isPaid = isInvoicePaidLike(inv.status);
                    const cfg = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG["unpaid"];
                    return (
                      <tr
                        key={inv.id}
                        className={`border-b transition-colors ${isChecked ? "bg-purple-50/60" : "hover:bg-muted/30"} ${isPaid ? "opacity-50" : ""}`}
                      >
                        <td className="p-2 text-center">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => toggleOne(inv.id)}
                            disabled={isPaid}
                          />
                        </td>
                        <td className="p-2 font-mono font-medium text-purple-700 whitespace-nowrap">
                          {inv.code ?? "—"}
                        </td>
                        <td className="p-2 text-muted-foreground max-w-[140px]">
                          <span className="line-clamp-2">{inv.description || inv.name || "—"}</span>
                        </td>
                        <td className="p-2 text-right font-semibold whitespace-nowrap">
                          {fmtMoney(parseNum(inv.grandTotal))}
                        </td>
                        <td className="p-2 text-center">
                          <Badge className={`text-[10px] px-1.5 py-0 ${cfg.className}`}>
                            {cfg.label}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredSchedules.map(s => {
                    const isChecked = checkedScheduleIds.has(s.id);
                    const isPaid = isInvoicePaidLike(s.status);
                    const cfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG["unpaid"];
                    return (
                      <tr
                        key={s.id}
                        className={`border-b transition-colors ${isChecked ? "bg-purple-50/60" : "hover:bg-muted/30"} ${isPaid ? "opacity-50" : ""}`}
                      >
                        <td className="p-2 text-center">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => toggleSchedule(s.id)}
                            disabled={isPaid}
                          />
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          <span className="font-mono font-medium text-purple-700">{s.code ?? "—"}</span>
                          <span className="ml-1.5 text-[10px] text-blue-600 bg-blue-50 border border-blue-100 px-1 py-0.5 rounded">{t("finance.installmentShort")}</span>
                        </td>
                        <td className="p-2 text-muted-foreground max-w-[140px]">
                          <span className="line-clamp-2">{s.label || "—"}</span>
                        </td>
                        <td className="p-2 text-right font-semibold whitespace-nowrap">
                          {fmtMoney(parseNum(s.amount))}
                        </td>
                        <td className="p-2 text-center">
                          <Badge className={`text-[10px] px-1.5 py-0 ${cfg.className}`}>
                            {cfg.label}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && filteredSchedules.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground">
                        {t("finance.noReceiptsFound")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right panel - Payment form */}
          <div className="flex flex-col w-1/2 min-h-0 overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* Total summary */}
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                  {t("finance.bulkTotalAfter")}
                </div>
                <div className="text-3xl font-bold text-purple-700">
                  {fmtMoney(totalAmount)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {t("finance.receiptsWillBeCollected", { count: uncheckedToPay, type: invoiceType === "Thu" ? t("finance.incomeWord") : t("finance.expenseWord") })}
                </div>
                {invoiceType === "Thu" && (
                  <div className="mt-4 border-t border-purple-200 pt-4">
                    {paymentMethod !== "transfer" ? (
                      <p className="text-xs text-muted-foreground">
                        {t("finance.bulkQrSelectTransfer")}
                      </p>
                    ) : qrLocationResolution.issue === "multiple" ? (
                      <p className="text-xs text-amber-700">
                        {t("finance.bulkQrMixedLocations")}
                      </p>
                    ) : qrLocationResolution.issue === "unknown" ? (
                      <p className="text-xs text-amber-700">
                        {t("finance.bulkQrLocationUnknown")}
                      </p>
                    ) : qrLocationResolution.issue || !qrBankAccount ? (
                      <p className="text-xs text-amber-700">
                        {qrLocationResolution.location?.paymentQrUrl
                          ? t("finance.bulkQrStaticOnly")
                          : t("finance.bulkQrBankNotConfigured")}
                      </p>
                    ) : qrImageError ? (
                      <p className="text-xs text-rose-700">
                        {t("finance.bulkQrImageError")}
                      </p>
                    ) : qrImageUrl ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-800">
                          <QrCode className="h-4 w-4" />
                          {t("finance.qrScanToPay")}
                        </div>
                        <div className="rounded-xl border border-purple-100 bg-white p-2 shadow-sm">
                          <img
                            src={qrImageUrl}
                            alt={t("finance.paymentQrAlt")}
                            className="h-56 w-56 object-contain"
                            onError={() => setQrImageError(true)}
                          />
                        </div>
                        <div className="text-xs font-medium text-slate-700">
                          {qrBankName} · {qrAccountNumber}
                        </div>
                        {qrAccountHolder && (
                          <div className="text-[11px] text-slate-600">{qrAccountHolder}</div>
                        )}
                        <div className="max-w-full break-words text-[11px] text-slate-600">
                          {t("finance.bulkQrTransferContent")}: {qrTransferContent}
                        </div>
                        <p className="text-[11px] text-amber-800">
                          {t("finance.bulkQrConfirmHint")}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-700">
                        {t("finance.bulkQrBankNotConfigured")}
                      </p>
                    )}
                  </div>
                )}
                {invoiceType === "Chi" && paymentMethod === "transfer" && (
                  <p className="mt-4 border-t border-purple-200 pt-4 text-xs text-muted-foreground">
                    {t("finance.bulkQrIncomeOnly")}
                  </p>
                )}
              </div>

              {/* Invoice breakdown */}
              {(checkedInvoices.length > 0 || checkedSchedules.length > 0) && (
                <div className="rounded-lg border overflow-hidden">
                  <div className="px-3 py-2 bg-muted/50 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {t("finance.selectedReceiptDetails")}
                  </div>
                  <div className="divide-y max-h-40 overflow-y-auto">
                    {checkedInvoices.map(inv => (
                      <div key={inv.id} className="px-3 py-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={() => toggleOne(inv.id)}
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            disabled={isInvoicePaidLike(inv.status)}
                          >
                            <X className="h-3 w-3" />
                          </button>
                          <span className="font-mono text-xs text-purple-700 shrink-0">
                            {inv.code ?? "—"}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">
                            {inv.description || inv.name || ""}
                          </span>
                        </div>
                        <span className="text-xs font-semibold shrink-0">
                          {fmtMoney(parseNum(inv.grandTotal))}
                        </span>
                      </div>
                    ))}
                    {checkedSchedules.map(s => (
                      <div key={s.id} className="px-3 py-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={() => toggleSchedule(s.id)}
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            disabled={isInvoicePaidLike(s.status)}
                          >
                            <X className="h-3 w-3" />
                          </button>
                          <span className="font-mono text-xs text-purple-700 shrink-0">
                            {s.code ?? "—"}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">
                            {s.label || ""}
                          </span>
                          <span className="text-[10px] text-blue-600 bg-blue-50 border border-blue-100 px-1 py-0.5 rounded shrink-0">{t("finance.installmentShort")}</span>
                        </div>
                        <span className="text-xs font-semibold shrink-0">
                          {fmtMoney(parseNum(s.amount))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment form */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1">
                  {t("finance.paymentInfo")}
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("finance.collectionDate", { type: invoiceType === "Thu" ? t("finance.incomeWord") : t("finance.expenseWord") })}</label>
                  <Input
                    type="date"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("finance.paymentMethod")}</label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="h-9">
                    <SelectValue placeholder={t("finance.choosePaymentMethod")} />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map(m => (
                        <SelectItem key={m.value} value={m.value}>{t(m.labelKey)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {t("finance.collector", { type: invoiceType === "Thu" ? t("finance.incomeWord") : t("finance.expenseWord") })} <span className="text-muted-foreground font-normal">{t("finance.optional")}</span>
                  </label>
                  <Input
                    placeholder={t("finance.collectorPlaceholder")}
                    value={collectorName}
                    onChange={e => setCollectorName(e.target.value)}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {t("finance.note")} <span className="text-muted-foreground font-normal">{t("finance.optional")}</span>
                  </label>
                  <Textarea
                    placeholder={t("finance.receiptNotePlaceholder")}
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    className="h-20 resize-none text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t shrink-0 flex items-center justify-between gap-4 bg-muted/30">
          <div className="text-sm text-muted-foreground">
            {t("finance.selectedReceipts")} <span className="font-semibold text-foreground">{uncheckedToPay}</span> {t("finance.receipts")}
            {" · "}
            Tổng <span className="font-semibold text-purple-700">{fmtMoney(totalAmount)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              {t("finance.cancel")}
            </Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700 gap-2"
              disabled={isPending || uncheckedToPay === 0}
              onClick={() => collectMutation.mutate()}
            >
              <Merge className="h-4 w-4" />
              {isPending ? t("finance.processing") : t("finance.bulkCollectButton", { type: invoiceType === "Thu" ? t("finance.incomeWord") : t("finance.expenseWord") })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
