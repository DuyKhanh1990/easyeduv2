import { Fragment, useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { rebalanceUnpaidInstallments } from "./paymentScheduleAllocation";
import { summarizeSchedulePromotions } from "./schedulePromotionSummary";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Calendar } from "@/components/ui/calendar";
import {
  Search, CreditCard, Plus, ChevronDown, X, CalendarIcon,
} from "lucide-react";
import { format } from "date-fns";
import { enUS, vi } from "date-fns/locale";
import { useClasses } from "@/hooks/use-classes";
import { useStaff } from "@/hooks/use-staff";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { fmtMoney, getTodayVietnamDate, isInvoicePaidLike } from "@/types/invoice-types";
import { isLegacyAutoInvoiceDepositDoubleCount } from "@shared/invoice-deposit-accounting";
import { calculateInvoiceVatAmount, INVOICE_VAT_RATES } from "@shared/invoice-vat";
import { calculateInvoicePromotionVat, getUniformInvoicePromotionVatRate } from "@shared/invoice-promotion-vat";
import { FinancePromotionDialog, type FinancePromotionType } from "./components/FinancePromotionDialog";
import { INVOICE_ACCOUNT_OPTIONS } from "./invoiceAccountOptions";
import { useLanguage } from "@/hooks/use-language";

interface Product {
  id: string;
  packageId: string | null;
  packageType: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
  vatRate: number;
  vatAmountOverride?: number;
  legacySurchargeKeys?: string[];
  promotionKeys: string[];
  surchargeKeys: string[];
  manualPromotionRows: ManualAdjustment[];
  manualSurchargeRows: ManualAdjustment[];
  categoryId: string;
  storeProductId?: string | null;
  storeProductCode?: string | null;
  warehouseId?: string | null;
  warehouseName?: string | null;
  stockAvailable?: number;
}

type ManualAdjustment = {
  id: string;
  optionKey?: string;
  name?: string;
  valueType: "amount" | "percent";
  value: number;
};

const SURCHARGE_CATEGORY_ID = "__surcharge__";

function getDefaultInvoiceItemName(
  categoryId: string | null | undefined,
  categories: any[],
  surchargeName: string,
): string {
  if (categoryId === SURCHARGE_CATEGORY_ID) return surchargeName;
  const categoryName = String(categories.find(category => category.id === categoryId)?.name ?? "");
  const normalizedName = categoryName.toLocaleLowerCase();
  if (normalizedName.includes("học phí") || normalizedName.includes("kho")) return "";
  return categoryName;
}

type PaymentScheduleEntry = {
  id: string;
  label: string;
  code: string;
  amount: number;
  baseAmount?: number | null;
  promotionKeys?: string[];
  surchargeKeys?: string[];
  promotionRows?: ManualAdjustment[];
  surchargeRows?: ManualAdjustment[];
  promotionAmount?: number;
  surchargeAmount?: number;
  due: Date | undefined;
  status: string;
  paymentMethod: string;
  bank: string;
  isAuto?: boolean;
};

const getNextPaymentNumber = (entries: PaymentScheduleEntry[], directPaidAmount: number) => {
  const highestExisting = entries.reduce((highest, entry) => {
    const match = entry.label.match(/(\d+)/);
    return Math.max(highest, match ? Number(match[1]) : 0);
  }, directPaidAmount > 0 ? 1 : 0);
  return highestExisting + 1;
};

const calcBase = (p: Product) =>
  p.packageType === "khoá" ? p.unitPrice : p.unitPrice * p.quantity;

const applySequentialAdjustments = (
  startingAmount: number,
  keys: string[],
  rows: ManualAdjustment[],
  options: any[],
  kind: "promotion" | "surcharge",
) => {
  const representedKeys = new Set(rows.map(row => row.optionKey).filter(Boolean));
  const orderedRows: ManualAdjustment[] = [
    ...rows,
    ...keys
      .filter(key => !representedKeys.has(key))
      .map((key, index) => ({
        id: `legacy-${kind}-${index}-${key}`,
        optionKey: key,
        valueType: "amount" as const,
        value: 0,
      })),
  ];
  let currentAmount = Math.max(0, startingAmount);
  const appliedOptionKeys = new Set<string>();
  const applyValue = (valueType: "amount" | "percent", rawValue: number) => {
    const value = Math.max(0, Number(rawValue) || 0);
    const adjustment = valueType === "percent"
      ? Math.round(currentAmount * value / 100)
      : value;
    currentAmount = kind === "promotion"
      ? Math.max(0, currentAmount - adjustment)
      : currentAmount + adjustment;
  };

  orderedRows.forEach(row => {
    if (row.optionKey && !appliedOptionKeys.has(row.optionKey)) {
      appliedOptionKeys.add(row.optionKey);
       const option = options.find((o: any) => o.id === row.optionKey || o.code === row.optionKey);
      if (option) {
        applyValue(option.valueType === "percent" ? "percent" : "amount", parseFloat(option.valueAmount || "0"));
      }
    }
    if (row.value > 0) applyValue(row.valueType, row.value);
  });

  return {
    finalAmount: currentAmount,
    adjustmentAmount: kind === "promotion"
      ? Math.max(0, startingAmount - currentAmount)
      : Math.max(0, currentAmount - startingAmount),
  };
};

const isVoucherKey = (key: string) => key.startsWith("voucher:");
const formatPromotionLabel = (option: any) =>
  option?.kind === "voucher" ? `Voucher: ${option.name}` : option?.name;
const normalizeSearchText = (value: unknown) =>
  String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const getInitialAdjustmentRows = (
  keys: string[],
  amount: number,
  prefix: string,
): ManualAdjustment[] =>
  keys.length > 0
    ? keys.map((key, index) => ({
        id: `${prefix}-option-${index}-${key}`,
        optionKey: key,
        valueType: "amount",
        value: 0,
      }))
    : amount > 0
      ? [{ id: `${prefix}-manual`, valueType: "amount", value: amount }]
      : [];

const parseDateOnly = (value: string | null | undefined): Date | undefined => {
  if (!value) return undefined;
  const dateKey = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
    ? new Date(`${dateKey}T00:00:00`)
    : undefined;
};

function AdjustmentRowsEditor({
  kind,
  rows,
  options,
  filteredOptions,
  search,
  onSearchChange,
  openPicker,
  onOpenPickerChange,
  total,
  onAdd,
  onUpdate,
  onSelect,
  onRemove,
}: {
  kind: "promotion" | "surcharge";
  rows: ManualAdjustment[];
  options: any[];
  filteredOptions: any[];
  search: string;
  onSearchChange: (value: string) => void;
  openPicker: string | null;
  onOpenPickerChange: (value: string | null) => void;
  total: number;
  onAdd: () => void;
  onUpdate: (rowId: string, patch: Partial<ManualAdjustment>) => void;
  onSelect: (rowId: string, optionKey: string) => void;
  onRemove: (rowId: string) => void;
}) {
  const isPromotion = kind === "promotion";
  const { t } = useLanguage();

  return (
    <div className="mt-3 space-y-4">
      {rows.map(row => {
        const selectedOption = options.find((o: any) => o.id === row.optionKey);
        return (
          <div key={row.id} className="space-y-2 rounded-lg border border-muted p-2">
            <Popover open={openPicker === row.id} onOpenChange={v => {
              onOpenPickerChange(v ? row.id : null);
              if (v) onSearchChange("");
            }}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="w-full min-h-9 flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5 text-left text-xs hover:border-purple-400"
                >
                  <span className={selectedOption ? "truncate" : "text-muted-foreground"}>
                    {selectedOption
                      ? (isPromotion ? formatPromotionLabel(selectedOption) : selectedOption.name)
                      : `${t("finance.create.choose")} ${isPromotion ? t("finance.promotion").toLowerCase() : t("finance.surcharge").toLowerCase()}...`}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[28rem] max-w-[calc(100vw-2rem)] p-3" align="start">
                <div className="mb-2 relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={e => onSearchChange(e.target.value)}
                    placeholder={isPromotion ? t("finance.create.searchPromotion") : t("finance.create.searchSurcharge")}
                    className="h-8 pl-7 text-xs"
                    autoFocus
                    onKeyDown={e => e.stopPropagation()}
                  />
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {options.length === 0 ? (
                    <p className="py-3 text-center text-xs text-muted-foreground">
                      {isPromotion ? t("finance.create.noPromotion") : t("finance.create.noSurcharge")}
                    </p>
                  ) : filteredOptions.length === 0 ? (
                    <p className="py-3 text-center text-xs text-muted-foreground">
                      {isPromotion ? t("finance.create.promotionNotFound") : t("finance.create.surchargeNotFound")}
                    </p>
                  ) : filteredOptions.map((o: any) => {
                    const val = parseFloat(o.valueAmount || "0");
                    return (
                      <button
                        key={o.id}
                        type="button"
                        className="w-full flex items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-muted/60"
                        onClick={() => {
                          onSelect(row.id, o.id);
                          onOpenPickerChange(null);
                        }}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1 text-xs font-medium">
                            {isPromotion && o.kind === "voucher" && (
                              <span className="shrink-0 rounded bg-red-100 px-1 text-[9px] font-semibold text-red-600">Voucher</span>
                            )}
                            <span className="truncate">{o.name}</span>
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {isPromotion ? "-" : "+"}{o.valueType === "percent" ? `${val}%` : fmtMoney(val)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

            <div className="flex items-center gap-1.5">
              <select
                value={row.valueType}
                onChange={e => onUpdate(row.id, { valueType: e.target.value as ManualAdjustment["valueType"] })}
                className="h-8 w-24 rounded-md border bg-background px-2 text-xs"
              >
                 <option value="amount">{t("finance.amount")}</option>
                 <option value="percent">%</option>
              </select>
              <div className="relative min-w-0 flex-1">
                <Input
                  type="number"
                  min={0}
                  value={row.value || ""}
                  onChange={e => onUpdate(row.id, { value: Math.max(0, Number(e.target.value) || 0) })}
                   placeholder={t("finance.create.quickEnter")}
                  className="h-8 pr-8 text-xs"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                  {row.valueType === "percent" ? "%" : "₫"}
                </span>
              </div>
              <button
                type="button"
                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                onClick={() => onRemove(row.id)}
                aria-label={t("finance.create.removeAdjustment", { type: isPromotion ? t("finance.promotion").toLowerCase() : t("finance.surcharge").toLowerCase() })}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="text-xs font-medium text-purple-600 hover:text-purple-700"
        onClick={onAdd}
      >
         + {t("finance.add")}
      </button>
      <div className="flex justify-between border-t pt-3 text-xs font-semibold">
         <span>{isPromotion ? t("finance.create.totalPromotion") : t("finance.create.totalSurcharge")}</span>
        <span className={isPromotion ? "text-green-600" : "text-orange-600"}>
          {isPromotion ? "-" : "+"}{fmtMoney(total)}
        </span>
      </div>
    </div>
  );
}

export function CreateInvoiceDialog({ open, onClose, invoiceId, defaultStudent }: { open: boolean; onClose: () => void; invoiceId?: string | null; defaultStudent?: { id: string; fullName: string; code: string } | null }) {
  const isEdit = Boolean(invoiceId);
  const { lang, t } = useLanguage();
  const accountSearchPlaceholder = lang === "en"
    ? "Search by account code or name..."
    : "Tìm theo mã hoặc tên tài khoản...";

  const [invoiceType, setInvoiceType] = useState<"income" | "expense">("income");
  const [locationId, setLocationId]   = useState<string>("");
  const [classId, setClassId]         = useState<string>("");
  const [account, setAccount]         = useState<string>("111");
  const [counterAccount, setCounterAccount] = useState<string>("511");
  const [studentId, setStudentId]     = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [subjectName, setSubjectName] = useState<string>("");
  const [studentSearch, setStudentSearch] = useState<string>("");
  const [preloadedStudent, setPreloadedStudent] = useState<{ id: string; fullName: string; code: string } | null>(null);
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [categoryPickerOpenId, setCategoryPickerOpenId] = useState<string | null>(null);
  const [productPickerCategoryId, setProductPickerCategoryId] = useState<string | null>(null);
  const [productPickerSearch, setProductPickerSearch] = useState("");
  const [isSurchargeGroupVisible, setIsSurchargeGroupVisible] = useState(false);
  const [surchargeSourcePickerOpen, setSurchargeSourcePickerOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([
    { id: "1", packageId: null, packageType: null, name: "", unitPrice: 0, quantity: 1, vatRate: 0, promotionKeys: [], surchargeKeys: [], manualPromotionRows: [], manualSurchargeRows: [], categoryId: "" },
  ]);
  const [openPromoId, setOpenPromoId] = useState<string | null>(null);
  const [openSurchargeId, setOpenSurchargeId] = useState<string | null>(null);
  const [pendingStandaloneSurchargeId, setPendingStandaloneSurchargeId] = useState<string | null>(null);
  const [openProductPromoPicker, setOpenProductPromoPicker] = useState<string | null>(null);
  const [openProductSurchargePicker, setOpenProductSurchargePicker] = useState<string | null>(null);
  const [promotionSearch, setPromotionSearch] = useState("");
  const [surchargeSearch, setSurchargeSearch] = useState("");
  const [khoPickerOpen, setKhoPickerOpen] = useState<string | null>(null);
  const [khoSearch, setKhoSearch] = useState<string>("");
  const [invoicePromoKeys, setInvoicePromoKeys] = useState<string[]>([]);
  const [invoicePromotionName, setInvoicePromotionName] = useState("");
  const [invoiceSurchargeKeys, setInvoiceSurchargeKeys] = useState<string[]>([]);
  const [invoicePromotionRows, setInvoicePromotionRows] = useState<ManualAdjustment[]>([]);
  const [invoiceSurchargeRows, setInvoiceSurchargeRows] = useState<ManualAdjustment[]>([]);
  const [openInvoicePromo, setOpenInvoicePromo] = useState(false);
  const [openInvoicePromoPicker, setOpenInvoicePromoPicker] = useState<string | null>(null);
  const [openInvoiceSurchargePicker, setOpenInvoiceSurchargePicker] = useState<string | null>(null);
  const [openSchedulePromo, setOpenSchedulePromo] = useState<string | null>(null);
  const [openScheduleSurcharge, setOpenScheduleSurcharge] = useState<string | null>(null);
  const [openSchedulePromoPicker, setOpenSchedulePromoPicker] = useState<string | null>(null);
  const [openScheduleSurchargePicker, setOpenScheduleSurchargePicker] = useState<string | null>(null);
  const [quickCreateType, setQuickCreateType] = useState<FinancePromotionType | null>(null);
  const [quickCreateTarget, setQuickCreateTarget] = useState<
    { scope: "product"; productId: string }
    | { scope: "invoice" }
    | { scope: "schedule"; scheduleId: string }
    | null
  >(null);
  const [paymentSchedule, setPaymentSchedule] = useState<PaymentScheduleEntry[]>([]);
  const [persistedScheduleIds, setPersistedScheduleIds] = useState<string[]>([]);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [pendingDeletePaymentId, setPendingDeletePaymentId] = useState<string | null>(null);
  const [scheduleSyncError, setScheduleSyncError] = useState(false);
  const [openDuePicker, setOpenDuePicker] = useState<string | null>(null);
  const [splitPaymentId, setSplitPaymentId] = useState<string | null>(null);
  const [splitAmount, setSplitAmount] = useState<number>(0);
  const [splitDueDate, setSplitDueDate] = useState<string>("");
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState<string>(() => format(getTodayVietnamDate(), "yyyy-MM-dd"));
  const [directPaidAmount, setDirectPaidAmount] = useState<number>(0);
  const [directPaymentMethod, setDirectPaymentMethod] = useState<string>("cash");
  const [directBank, setDirectBank] = useState<string>("");
  const [deduction, setDeduction] = useState<number>(0);
  const [commissions, setCommissions] = useState<{ staffId: string; percentage: number }[]>([]);
  const [commissionStaffPickerOpen, setCommissionStaffPickerOpen] = useState(false);
  const [commissionStaffSearch, setCommissionStaffSearch] = useState("");
  const [commissionAutoAssigned, setCommissionAutoAssigned] = useState(false);

  const { toast } = useToast();
  const { data: staffList = [] } = useStaff(undefined, true, true);
  const { data: currentUser } = useAuth();
  const { data: myPerms } = useMyPermissions();
  const canCreatePromotion = Boolean(
    myPerms?.isSuperAdmin || myPerms?.permissions["/finance-config#promotions"]?.canCreate
  );

  const { data: editData } = useQuery<any>({
    queryKey: ["/api/finance/invoices", invoiceId],
    enabled: open && Boolean(invoiceId),
  });
  const canDeleteInvoice = Boolean(
    myPerms?.isSuperAdmin || myPerms?.permissions["/invoices"]?.canDelete
  );
  const isPaidInvoiceLocked = isEdit && Boolean(editData && isInvoicePaidLike(editData.status));
  const originalNote = String(editData?.note ?? editData?.description ?? "");
  const isPaidNoteDirty = isPaidInvoiceLocked && note !== originalNote;

  const { data: allCategoriesForEdit = [] } = useQuery<any[]>({ queryKey: ["/api/finance/transaction-categories"], enabled: open && Boolean(invoiceId) });

  useEffect(() => {
    if (!open) return;
    if (!isEdit || !editData) {
      if (!isEdit) {
        setInvoiceType("income");
        setLocationId("");
        setClassId("");
        setAccount("111");
        setCounterAccount("511");
        setPreloadedStudent(defaultStudent ?? null);
        setStudentId(defaultStudent?.id ?? null);
        setSelectedStaffId(null);
        setSubjectName("");
        setStudentSearch("");
        setProducts([{ id: "1", packageId: null, packageType: null, name: "", unitPrice: 0, quantity: 1, vatRate: 0, promotionKeys: [], surchargeKeys: [], manualPromotionRows: [], manualSurchargeRows: [], categoryId: "" }]);
        setIsSurchargeGroupVisible(false);
        setSurchargeSourcePickerOpen(false);
        setInvoicePromoKeys([]);
        setInvoicePromotionName("");
        setInvoiceSurchargeKeys([]);
        setInvoicePromotionRows([]);
        setInvoiceSurchargeRows([]);
        setPaymentSchedule([]);
        setPersistedScheduleIds([]);
        setScheduleSyncError(false);
        setOpenSchedulePromo(null);
        setOpenScheduleSurcharge(null);
        setOpenSchedulePromoPicker(null);
        setOpenScheduleSurchargePicker(null);
        setSplitPaymentId(null);
        setSplitAmount(0);
        setSplitDueDate("");
        setNote("");
        setDueDate(format(getTodayVietnamDate(), "yyyy-MM-dd"));
        setDirectPaidAmount(0);
        setDirectPaymentMethod("cash");
        setDirectBank("");
        setDeduction(0);
        setCommissions([]);
        setCommissionStaffPickerOpen(false);
        setCommissionStaffSearch("");
        setCommissionAutoAssigned(false);
      }
      return;
    }

    const inv = editData;
    setScheduleSyncError(false);
    setInvoiceType(inv.type === "Thu" ? "income" : "expense");
    setLocationId(inv.locationId ?? "");
    setAccount(inv.account ?? "111");
    setCounterAccount(inv.counterAccount ?? "511");
    setClassId(inv.classId ?? "");
    setStudentId(inv.studentId ?? null);
    setSubjectName(inv.subjectName ?? "");
    setStudentSearch("");
    if (inv.studentId && inv.studentFullName) {
      setPreloadedStudent({ id: inv.studentId, fullName: inv.studentFullName, code: inv.studentCode ?? "" });
    } else {
      setPreloadedStudent(null);
    }
    setNote(inv.note ?? inv.description ?? "");
    setDueDate(inv.dueDate ? inv.dueDate.split("T")[0] : format(getTodayVietnamDate(), "yyyy-MM-dd"));
    // When a payment schedule exists, paid info is captured per-installment — don't double-count paidAmount
    const hasSchedule = Array.isArray(inv.paymentSchedule) && inv.paymentSchedule.length > 0;
    const legacyDepositWasCountedAsPayment = isLegacyAutoInvoiceDepositDoubleCount(inv);
    setDirectPaidAmount(
      hasSchedule || legacyDepositWasCountedAsPayment
        ? 0
        : (parseFloat(inv.paidAmount) || 0),
    );
    setDirectPaymentMethod(inv.paymentMethod ?? "cash");
    setDirectBank(inv.appliedBankAccount?.bankAccount ?? "");
    setDeduction(parseFloat(inv.deduction) || 0);
    const loadedCommissions = Array.isArray(inv.commissions)
      ? inv.commissions.map((c: any) => ({ staffId: c.staffId, percentage: parseFloat(c.percentage) || 0 }))
      : [];
    setCommissions(loadedCommissions);
    // Existing assignments are authoritative. If there are none, the
    // auto-assignment effect below may use this invoice's original creator.
    setCommissionAutoAssigned(loadedCommissions.length > 0);
    setCommissionStaffPickerOpen(false);
    setCommissionStaffSearch("");

    const invTypeForCat = inv.type === "Thu" ? "income" : "expense";
    const matchedCat = allCategoriesForEdit.find((c: any) => c.name === inv.category && c.type === invTypeForCat)
      ?? allCategoriesForEdit.find((c: any) => c.name === inv.category);
    const fallbackCatId = matchedCat?.id ?? "";

    const loadedPromoKeys = Array.isArray(inv.invoicePromotionKeys) ? inv.invoicePromotionKeys : [];
    const loadedSurchargeKeys = Array.isArray(inv.invoiceSurchargeKeys) ? inv.invoiceSurchargeKeys : [];
    setInvoicePromoKeys(loadedPromoKeys);
    setInvoicePromotionName(String(inv.invoicePromotionName ?? ""));
    setInvoiceSurchargeKeys(loadedSurchargeKeys);
    const loadedInvoicePromoAmount = parseFloat(inv.invoicePromotionAmount) || 0;
    const loadedInvoiceSurchargeAmount = parseFloat(inv.invoiceSurchargeAmount) || 0;
    setInvoicePromotionRows(
      loadedPromoKeys.length > 0
        ? loadedPromoKeys.map((key: string, index: number) => ({
            id: `invoice-promo-${index}-${key}`,
            optionKey: key,
            name: index === 0 ? String(inv.invoicePromotionName ?? "") : "",
            valueType: "amount",
            value: 0,
          }))
        : loadedInvoicePromoAmount > 0
          ? [{ id: "invoice-promo-manual", name: String(inv.invoicePromotionName ?? ""), valueType: "amount", value: loadedInvoicePromoAmount }]
          : [],
    );
    setInvoiceSurchargeRows(
      loadedSurchargeKeys.length > 0
        ? loadedSurchargeKeys.map((key: string, index: number) => ({ id: `invoice-surcharge-${index}-${key}`, optionKey: key, valueType: "amount", value: 0 }))
        : loadedInvoiceSurchargeAmount > 0
          ? [{ id: "invoice-surcharge-manual", valueType: "amount", value: loadedInvoiceSurchargeAmount }]
          : [],
    );

    if (Array.isArray(inv.items) && inv.items.length > 0) {
      setProducts(inv.items.flatMap((item: any, i: number) => {
        const itemCat = item.category
          ? (allCategoriesForEdit.find((c: any) => c.name === item.category && c.type === invTypeForCat)
            ?? allCategoriesForEdit.find((c: any) => c.name === item.category))
          : null;
        const isExistingSurchargeLine = item.category === t("finance.surcharge") || item.category === "Phụ thu";
        const legacySurchargeKeys = Array.isArray(item.surchargeKeys) ? item.surchargeKeys : [];
        const baseProduct: Product = {
          id: item.id ?? String(i + 1),
          packageId: item.packageId ?? null,
          packageType: item.packageType ?? null,
          name: String(item.packageName ?? "").trim()
            ? item.packageName
            : getDefaultInvoiceItemName(
              isExistingSurchargeLine ? SURCHARGE_CATEGORY_ID : itemCat?.id ?? fallbackCatId,
              allCategoriesForEdit,
              t("finance.surcharge"),
            ),
          unitPrice: parseFloat(item.unitPrice) || 0,
          quantity: item.quantity ?? 1,
          vatRate: Number(item.vatRate) || 0,
          promotionKeys: item.promotionKeys ?? [],
          surchargeKeys: [],
          manualPromotionRows: Array.isArray(item.manualPromotionRows) && item.manualPromotionRows.length > 0
            ? item.manualPromotionRows
            : (item.promotionKeys?.length ?? 0) === 0 && parseFloat(item.promotionAmount) > 0
              ? [{ id: `manual-promo-${item.id ?? i}`, valueType: "amount", value: parseFloat(item.promotionAmount) }]
              : [],
          manualSurchargeRows: [],
          categoryId: isExistingSurchargeLine ? SURCHARGE_CATEGORY_ID : itemCat?.id ?? fallbackCatId,
        };
        if (isExistingSurchargeLine) return [baseProduct];

        const storedSurchargeAmount = Math.max(0, parseFloat(item.surchargeAmount) || 0);
        const oldPromotionBase = calcBase(baseProduct);
        const oldPromotion = applySequentialAdjustments(
          oldPromotionBase,
          baseProduct.promotionKeys,
          getInitialAdjustmentRows(baseProduct.promotionKeys, parseFloat(item.promotionAmount) || 0, `legacy-promo-${i}`),
          promotionOptions,
          "promotion",
        );
        const recalculatedSurcharge = applySequentialAdjustments(
          oldPromotion.finalAmount,
          legacySurchargeKeys,
          getInitialAdjustmentRows(legacySurchargeKeys, storedSurchargeAmount, `legacy-surcharge-${i}`),
          surchargeOptions,
          "surcharge",
        ).adjustmentAmount;
        const surchargeAmount = storedSurchargeAmount || recalculatedSurcharge;
        if (surchargeAmount <= 0) return [baseProduct];

        const originalVatAmount = Math.max(0, parseFloat(item.vatAmount) || 0);
        const baseVatAmount = calculateInvoiceVatAmount(oldPromotion.finalAmount, baseProduct.vatRate);
        const feeVatAmount = Math.max(0, originalVatAmount - baseVatAmount);
        const surchargeName = legacySurchargeKeys
          .map((key: string) => surchargeOptions.find((option: any) => option.id === key)?.name)
          .filter(Boolean)
          .join(", ") || t("finance.surcharge");
        const feeLine: Product = {
          id: `legacy-surcharge-${item.id ?? i}`,
          packageId: null,
          packageType: null,
          name: surchargeName,
          unitPrice: surchargeAmount,
          quantity: 1,
          vatRate: baseProduct.vatRate,
          vatAmountOverride: originalVatAmount > 0 ? feeVatAmount : undefined,
          legacySurchargeKeys,
          promotionKeys: [],
          surchargeKeys: [],
          manualPromotionRows: [],
          manualSurchargeRows: [],
          categoryId: SURCHARGE_CATEGORY_ID,
        };
        return [baseProduct, feeLine];
      }));
    } else {
      setProducts([{ id: "1", packageId: null, packageType: null, name: "", unitPrice: 0, quantity: 1, vatRate: 0, promotionKeys: [], surchargeKeys: [], manualPromotionRows: [], manualSurchargeRows: [], categoryId: fallbackCatId }]);
    }

    if (Array.isArray(inv.paymentSchedule) && inv.paymentSchedule.length > 0) {
      setPersistedScheduleIds(inv.paymentSchedule.map((schedule: any) => schedule.id).filter(Boolean));
      setPaymentSchedule(inv.paymentSchedule.map((s: any, i: number) => {
        const status = s.status ?? "unpaid";
        const baseAmount = s.baseAmount === null || s.baseAmount === undefined
          ? null
          : parseFloat(s.baseAmount) || 0;
        const promotionAmount = parseFloat(s.promotionAmount) || 0;
        const surchargeAmount = parseFloat(s.surchargeAmount) || 0;
        const amount = !isInvoicePaidLike(status) && baseAmount !== null && promotionAmount > 0
          ? Math.max(0, baseAmount - promotionAmount + surchargeAmount)
          : parseFloat(s.amount) || 0;
        return {
          id: s.id ?? String(i + 1),
          label: s.label ?? t("finance.installmentLabel", { number: i + 1 }),
          code: s.code ?? "",
          amount,
          baseAmount,
          promotionKeys: Array.isArray(s.promotionKeys) ? s.promotionKeys : [],
          surchargeKeys: Array.isArray(s.surchargeKeys) ? s.surchargeKeys : [],
          promotionRows: getInitialAdjustmentRows(
            Array.isArray(s.promotionKeys) ? s.promotionKeys : [],
            promotionAmount,
            `schedule-promo-${s.id ?? i}`,
          ),
          surchargeRows: getInitialAdjustmentRows(
            Array.isArray(s.surchargeKeys) ? s.surchargeKeys : [],
            surchargeAmount,
            `schedule-surcharge-${s.id ?? i}`,
          ),
          promotionAmount,
          surchargeAmount,
          due: parseDateOnly(s.dueDate),
          status,
          paymentMethod: s.paymentMethod ?? "cash",
          bank: s.bank ?? "",
        };
      }));
    } else {
      setPersistedScheduleIds([]);
      setPaymentSchedule([]);
    }
    setSplitPaymentId(null);
    setSplitAmount(0);
    setSplitDueDate("");
  }, [open, isEdit, editData, allCategoriesForEdit]);

  // Preselect the logged-in creator only for a new invoice. Existing invoices
  // must always keep the assignments loaded from invoice_commissions; running
  // this effect for edit mode can overwrite a saved percentage while data is
  // still being hydrated.
  useEffect(() => {
    if (!open || isEdit || commissionAutoAssigned || commissions.length > 0 || !currentUser?.id) return;
    const creatorUserId = currentUser.id;
    const creatorStaff = (staffList as any[]).find((staff: any) => staff.userId === creatorUserId);
    if (!creatorStaff) return;
    setCommissions([{ staffId: creatorStaff.id, percentage: 100 }]);
    setCommissionAutoAssigned(true);
  }, [open, isEdit, commissionAutoAssigned, commissions.length, currentUser?.id, staffList]);

  const saveMutation = useMutation({
    mutationFn: (body: any) =>
      isEdit
        ? apiRequest("PATCH", `/api/finance/invoices/${invoiceId}`, body)
        : apiRequest("POST", "/api/finance/invoices", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/student-classes"] });
      if (studentId) {
        queryClient.invalidateQueries({ queryKey: ["/api/students", studentId, "fee-wallet"] });
      }
      toast({ title: isEdit ? t("finance.create.updateSuccess") : t("finance.create.saveSuccess") });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: t("finance.create.saveError"), description: err.message, variant: "destructive" });
    },
  });

  const { data: locations = [] } = useQuery<any[]>({ queryKey: ["/api/locations"] });
  const { data: allCategories = [] } = useQuery<any[]>({ queryKey: ["/api/finance/transaction-categories"] });
  const getCategoryVatRate = (categoryId: string) =>
    Number(allCategories.find((category: any) => category.id === categoryId)?.vatRate ?? 0);

  const selectedLocation = (locations as any[]).find((l: any) => l.id === locationId);
  const locationBanks: { bankName: string; bankAccount: string; accountHolder: string }[] = (() => {
    if (!selectedLocation?.bankAccounts) return [];
    try { return JSON.parse(selectedLocation.bankAccounts); } catch { return []; }
  })();
  const { data: classes = [] } = useClasses(locationId || undefined, { minimal: true, enabled: open });

  const feePackageUrl = `/api/fee-packages${locationId ? `?locationId=${encodeURIComponent(locationId)}` : ""}`;
  const { data: feePackages = [], isFetching: isFetchingFeePackages } = useQuery<any[]>({
    queryKey: ["/api/fee-packages", locationId],
    queryFn: () => apiRequest("GET", feePackageUrl).then(r => r.json()),
    enabled: open,
    staleTime: 0,
  });

  const { data: promotionOptions = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/promotions", { type: "promotion" }],
    queryFn: () => apiRequest("GET", "/api/finance/promotions?type=promotion").then(r => r.json()),
    enabled: open,
  });

  const { data: availableVouchers = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/vouchers/available", studentId, dueDate],
    queryFn: () => {
      const params = new URLSearchParams({
        studentId: studentId!,
        asOfDate: dueDate,
      });
      return apiRequest("GET", `/api/finance/vouchers/available?${params}`).then(r => r.json());
    },
    enabled: open && invoiceType === "income" && Boolean(studentId),
    staleTime: 15_000,
  });

  const promotionOptionsWithVouchers = useMemo(
    () => [...promotionOptions, ...availableVouchers],
    [promotionOptions, availableVouchers],
  );
  const hasAvailableVouchers = availableVouchers.length > 0;

  const { data: surchargeOptions = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/promotions", { type: "surcharge" }],
    queryFn: () => apiRequest("GET", "/api/finance/promotions?type=surcharge").then(r => r.json()),
    enabled: open,
  });
  useEffect(() => {
    if (!open || surchargeOptions.length === 0) return;
    setProducts(prev => {
      let changed = false;
      const next = prev.map(product => {
        if (product.categoryId !== SURCHARGE_CATEGORY_ID || !product.legacySurchargeKeys?.length) return product;
        const names = product.legacySurchargeKeys
          .map(key => surchargeOptions.find((option: any) => option.id === key)?.name)
          .filter(Boolean);
        if (names.length === 0) return product;
        changed = true;
        return { ...product, name: names.join(", "), legacySurchargeKeys: undefined };
      });
      return changed ? next : prev;
    });
  }, [open, surchargeOptions]);

  const normalizedPromotionSearch = promotionSearch.trim().toLowerCase();
  const normalizedSurchargeSearch = surchargeSearch.trim().toLowerCase();
  const filteredPromotionOptionsWithVouchers = promotionOptionsWithVouchers.filter((o: any) => {
    if (!normalizedPromotionSearch) return true;
    return `${o.name ?? ""} ${o.code ?? ""}`.toLowerCase().includes(normalizedPromotionSearch);
  });
  const filteredSurchargeOptions = surchargeOptions.filter((o: any) => {
    if (!normalizedSurchargeSearch) return true;
    return `${o.name ?? ""} ${o.code ?? ""}`.toLowerCase().includes(normalizedSurchargeSearch);
  });

  const recalculateScheduleAdjustment = (
    entry: PaymentScheduleEntry,
    kind: "promotion" | "surcharge",
    rows: ManualAdjustment[],
    keys: string[],
  ): PaymentScheduleEntry => {
    const nextEntry = {
      ...entry,
      ...(kind === "promotion"
        ? { promotionRows: rows, promotionKeys: keys }
        : { surchargeRows: rows, surchargeKeys: keys }),
    };
    const baseAmount = Math.max(0, Number(nextEntry.baseAmount ?? nextEntry.amount) || 0);
    const promotionResult = applySequentialAdjustments(
      baseAmount,
      nextEntry.promotionKeys ?? [],
      nextEntry.promotionRows ?? [],
      promotionOptionsWithVouchers,
      "promotion",
    );
    const surchargeResult = applySequentialAdjustments(
      promotionResult.finalAmount,
      nextEntry.surchargeKeys ?? [],
      nextEntry.surchargeRows ?? [],
      surchargeOptions,
      "surcharge",
    );
    return {
      ...nextEntry,
      baseAmount,
      amount: surchargeResult.finalAmount,
      promotionAmount: promotionResult.adjustmentAmount,
      surchargeAmount: surchargeResult.adjustmentAmount,
    };
  };

  const createPromotionMutation = useMutation({
    mutationFn: async ({ type, data }: {
      type: FinancePromotionType;
      data: {
        code: string;
        name: string;
        valueAmount: string | null;
        valueType: "percent" | "vnd";
        quantity: number | null;
        fromDate: string | null;
        toDate: string | null;
      };
    }) => {
      const response = await apiRequest("POST", "/api/finance/promotions", { ...data, type });
      return response.json();
    },
    onSuccess: (created: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/promotions"] });
      const createdId = created?.id;
      if (createdId && quickCreateTarget) {
        if (quickCreateTarget.scope === "product") {
          setProducts(prev => prev.map(product => {
            if (product.id !== quickCreateTarget.productId) return product;
            const keyName = quickCreateType === "promotion" ? "promotionKeys" : "surchargeKeys";
            return {
              ...product,
              [keyName]: [...new Set([...product[keyName], createdId])],
            };
          }));
        } else if (quickCreateTarget.scope === "schedule") {
          const nextEntries = paymentSchedule.map(entry => {
            if (entry.id !== quickCreateTarget?.scheduleId) return entry;
            const isPromotion = quickCreateType === "promotion";
            const rowsKey = isPromotion ? "promotionRows" : "surchargeRows";
            const keysKey = isPromotion ? "promotionKeys" : "surchargeKeys";
            const rows = [
              ...(entry[rowsKey] ?? []),
              {
                id: `schedule-${isPromotion ? "promo" : "surcharge"}-created-${createdId}`,
                optionKey: createdId,
                valueType: "amount" as const,
                value: 0,
              },
            ];
            const keys = Array.from(new Set([...(entry[keysKey] ?? []), createdId]));
            return recalculateScheduleAdjustment(entry, isPromotion ? "promotion" : "surcharge", rows, keys);
          });
          setPaymentSchedule(nextEntries);
        } else if (quickCreateType === "promotion") {
          setInvoicePromoKeys(prev => [...new Set([...prev, createdId])]);
          setInvoicePromotionRows(prev => [...prev, {
            id: `invoice-promo-created-${createdId}`,
            optionKey: createdId,
            valueType: "amount",
            value: 0,
          }]);
        } else {
          setInvoiceSurchargeKeys(prev => [...new Set([...prev, createdId])]);
          setInvoiceSurchargeRows(prev => [...prev, {
            id: `invoice-surcharge-created-${createdId}`,
            optionKey: createdId,
            valueType: "amount",
            value: 0,
          }]);
        }
      }
      setQuickCreateType(null);
      setQuickCreateTarget(null);
      toast({ title: t("finance.create.addedAdjustment", { label: quickCreateType === "promotion" ? t("finance.promotion").toLowerCase() : t("finance.surcharge").toLowerCase() }) });
    },
    onError: (err: any) => {
      toast({ title: t("finance.create.addError"), description: err.message, variant: "destructive" });
    },
  });

  const openQuickCreate = (
    type: FinancePromotionType,
    target:
      | { scope: "product"; productId: string }
      | { scope: "invoice" }
      | { scope: "schedule"; scheduleId: string },
  ) => {
    setQuickCreateType(type);
    setQuickCreateTarget(target);
  };

  const clearSelectedVouchers = () => {
    setInvoicePromoKeys(prev => prev.filter(key => !isVoucherKey(key)));
    setProducts(prev => prev.map(product => ({
      ...product,
      promotionKeys: product.promotionKeys.filter(key => !isVoucherKey(key)),
    })));
  };

  const { data: khoProducts = [], isFetching: isFetchingKhoProducts } = useQuery<any[]>({
    queryKey: ["/api/store/issue-inventory/search", "byLocation", locationId, khoSearch],
    queryFn: () => {
      const params = new URLSearchParams({ locationId });
      if (khoSearch) params.set("q", khoSearch);
      return apiRequest("GET", `/api/store/issue-inventory/search?${params}`).then(r => r.json());
    },
    enabled: !!khoPickerOpen && !!locationId,
    staleTime: 0,
    gcTime: 0,
  });

  const { data: studentsData } = useQuery<any[]>({
    queryKey: ["/api/invoice/search-students", locationId, studentSearch],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "20" });
      if (studentSearch) params.set("searchTerm", studentSearch);
      if (locationId) params.set("locationId", locationId);
      return apiRequest("GET", `/api/invoice/search-students?${params}`).then(r => r.json());
    },
    enabled: open,
  });

  const studentsRaw: any[] = Array.isArray(studentsData) ? studentsData : [];
  const students: any[] = preloadedStudent && !studentsRaw.some((s: any) => s.id === preloadedStudent.id)
    ? [preloadedStudent, ...studentsRaw]
    : studentsRaw;

  const categories = allCategories.filter(c =>
    c.isActive !== false && c.type === (invoiceType === "income" ? "income" : "expense")
  );
  const productGroups = (() => {
    const groups = new Map<string, { categoryId: string; rows: Product[] }>();
    products.forEach(product => {
      const categoryId = product.categoryId ?? "";
      const group = groups.get(categoryId) ?? { categoryId, rows: [] };
      group.rows.push(product);
      groups.set(categoryId, group);
    });
    return Array.from(groups.values());
  })();
  const isHocPhi = products.some(p => {
    const cat = allCategories.find(c => c.id === p.categoryId);
    return cat?.name?.toLowerCase().includes("học phí");
  });

  const { data: studentWallet } = useQuery<any>({
    queryKey: ["/api/students", studentId, "fee-wallet"],
    queryFn: () => apiRequest("GET", `/api/students/${studentId}/fee-wallet`).then(r => r.json()),
    enabled: open && Boolean(studentId),
  });
  const datCocBalance = (studentWallet?.summary?.datCoc ?? 0) as number;

  const selectedPerson = students.find((s: any) => s.id === studentId);
  const displayName = selectedPerson ? `[${selectedPerson.code}] ${selectedPerson.fullName}` : subjectName;
  const commissionStaffOptions = useMemo(() => {
    const search = normalizeSearchText(commissionStaffSearch);
    return (staffList as any[])
      .filter((staff: any) => !commissions.some(commission => commission.staffId === staff.id))
      .filter((staff: any) => !search || normalizeSearchText(`${staff.fullName} ${staff.code}`).includes(search))
      .sort((a: any, b: any) => {
        const aActive = a.status !== "Không hoạt động";
        const bActive = b.status !== "Không hoạt động";
        if (aActive !== bActive) return aActive ? -1 : 1;
        return String(a.fullName ?? "").localeCompare(String(b.fullName ?? ""), "vi");
      });
  }, [staffList, commissions, commissionStaffSearch]);

  const productAdjustmentTotals = products.map(product => {
    const base = calcBase(product);
    const promotionResult = applySequentialAdjustments(
      base,
      product.promotionKeys,
      product.manualPromotionRows,
      promotionOptionsWithVouchers,
      "promotion",
    );
    const surchargeResult = applySequentialAdjustments(
      promotionResult.finalAmount,
      product.surchargeKeys,
      product.manualSurchargeRows,
      surchargeOptions,
      "surcharge",
    );
    const vatAmount = product.vatAmountOverride !== undefined && promotionResult.adjustmentAmount === 0
      ? product.vatAmountOverride
      : calculateInvoiceVatAmount(surchargeResult.finalAmount, product.vatRate);
    return {
      productId: product.id,
      base,
      promoAmount: promotionResult.adjustmentAmount,
      surchargeAmount: surchargeResult.adjustmentAmount,
      finalAmount: surchargeResult.finalAmount,
      vatAmount,
    };
  });
  const totalAmount = productAdjustmentTotals.reduce((sum, item) => {
    const product = products.find(p => p.id === item.productId);
    return sum + (product?.categoryId === SURCHARGE_CATEGORY_ID ? 0 : item.base);
  }, 0);
  const itemVatTotal = productAdjustmentTotals.reduce((sum, item) => sum + item.vatAmount, 0);
  const itemPromo = productAdjustmentTotals.reduce((sum, item) => sum + item.promoAmount, 0);
  const itemSurcharge = productAdjustmentTotals.reduce((sum, item) => {
    const product = products.find(p => p.id === item.productId);
    return sum + item.surchargeAmount + (product?.categoryId === SURCHARGE_CATEGORY_ID ? item.base : 0);
  }, 0);
  const lineSubtotal = productAdjustmentTotals.reduce((sum, item) => sum + item.finalAmount, 0);
  const invoicePromotionEligibleItems = products
    .filter(product => product.categoryId !== SURCHARGE_CATEGORY_ID)
    .map(product => {
      const total = productAdjustmentTotals.find(item => item.productId === product.id);
      return {
        category: allCategories.find((category: any) => category.id === product.categoryId)?.name ?? "",
        vatRate: product.vatRate,
        subtotal: total?.finalAmount ?? 0,
      };
    });
  const invoicePromotionVatRate = getUniformInvoicePromotionVatRate(invoicePromotionEligibleItems);
  const hasInvoicePromotionEligibleItems = invoicePromotionEligibleItems.some(item => item.subtotal > 0);
  const invoicePromotionVatMixed = hasInvoicePromotionEligibleItems && invoicePromotionVatRate === null;
  const invoicePromotionVatLocked = !hasInvoicePromotionEligibleItems || invoicePromotionVatMixed;
  useEffect(() => {
    if (!invoicePromotionVatMixed) return;
    setInvoicePromoKeys([]);
    setInvoicePromotionRows([]);
    setInvoicePromotionName("");
  }, [invoicePromotionVatMixed]);
  const calculatedInvoicePromotionResult = applySequentialAdjustments(
    lineSubtotal,
    invoicePromoKeys,
    invoicePromotionRows,
    promotionOptionsWithVouchers,
    "promotion",
  );
  const invoicePromotionResult = invoicePromotionVatLocked
    ? { adjustmentAmount: 0, finalAmount: lineSubtotal }
    : calculatedInvoicePromotionResult;
  const invoiceSurchargeResult = applySequentialAdjustments(
    invoicePromotionResult.finalAmount,
    invoiceSurchargeKeys,
    invoiceSurchargeRows,
    surchargeOptions,
    "surcharge",
  );
  const invoicePromoAmt = invoicePromotionResult.adjustmentAmount;
  const resolvedInvoicePromotionName = Array.from(new Set(
    invoicePromotionRows.map(row => {
      const option = promotionOptionsWithVouchers.find((candidate: any) => candidate.id === row.optionKey || candidate.code === row.optionKey);
      return row.name?.trim() || (option ? formatPromotionLabel(option) : "");
    }).filter(Boolean),
  )).join(", ") || invoicePromotionName.trim();
  const invoicePromotionVatAmount = resolvedInvoicePromotionName
    ? calculateInvoicePromotionVat(invoicePromoAmt, invoicePromotionEligibleItems)
    : 0;
  const totalVat = Math.max(0, itemVatTotal - invoicePromotionVatAmount);
  const invoiceSurchargeAmt = invoiceSurchargeResult.adjustmentAmount;
  const invoiceSurchargeDisplayName = Array.from(new Set(
    invoiceSurchargeRows
      .map(row => surchargeOptions.find((option: any) => option.id === row.optionKey || option.code === row.optionKey)?.name)
      .filter(Boolean),
  )).join(", ") || t("finance.surcharge");
  const scheduleAdjustments = summarizeSchedulePromotions(paymentSchedule);
  const { hasPromotion: hasSchedulePromotion, promotionTotal: schedulePromotionTotal, surchargeTotal: scheduleSurchargeTotal } = scheduleAdjustments;
  const totalPromo = itemPromo + invoicePromoAmt + schedulePromotionTotal;
  const totalSurcharge = itemSurcharge + invoiceSurchargeAmt + scheduleSurchargeTotal;
  const subTotalBeforeVat = Math.max(
    0,
    invoiceSurchargeResult.finalAmount - schedulePromotionTotal + scheduleSurchargeTotal,
  );
  const subTotal = subTotalBeforeVat + totalVat;
  const calculatedFinalTotal = Math.max(0, subTotal - deduction);
  // The invoice fields are authoritative; payment installments only allocate
  // this total and must never change it.
  const finalTotal = calculatedFinalTotal;                            // Tổng tiền (sau khấu trừ)
  const grandTotal   = finalTotal;                                   // alias dùng trong submit
  // Always include directPaidAmount in paid total; paid schedule entries add on top
  const paid = directPaidAmount + paymentSchedule.filter(p => isInvoicePaidLike(p.status)).reduce((s, p) => s + p.amount, 0);
  const paidPercent  = finalTotal > 0 ? Math.round((paid / finalTotal) * 100) : (subTotal > 0 ? 100 : 0);
  const scheduleAllocated = paymentSchedule.reduce((s, p) => s + p.amount, 0);

  // Once a payment schedule exists, always preserve full allocation. A single
  // auto remainder entry absorbs changes to the invoice total or manual rows.
  useEffect(() => {
    if (!open) return;
    setPaymentSchedule(prev => {
      const difference = finalTotal - directPaidAmount - prev.reduce((sum, entry) => sum + entry.amount, 0);

      // A direct payment starts at ĐỢT 2; a deposit deduction starts the
      // remaining balance at ĐỢT 1.
      if (prev.length === 0) {
        if ((directPaidAmount > 0 || deduction > 0) && difference > 0) {
          return [{
            id: `auto-${Date.now()}`,
            label: directPaidAmount > 0 ? t("finance.installmentLabel", { number: 2 }) : t("finance.installmentLabel", { number: 1 }),
            code: `PT-${Date.now()}`,
            amount: difference,
            due: getTodayVietnamDate(),
            status: "unpaid",
            paymentMethod: "cash",
            bank: "",
            isAuto: true,
          }];
        }
        return prev;
      }

      if (Math.abs(difference) < 0.01) return prev;
      // Preserve child-discounted rows. Any unrelated invoice-total change can
      // only be reallocated across unpaid rows without a child promotion.
      return rebalanceUnpaidInstallments(
        prev,
        difference,
        entry => !hasSchedulePromotion || (entry.promotionAmount ?? 0) <= 0,
      );
    });
  }, [directPaidAmount, finalTotal, hasSchedulePromotion, open, scheduleAllocated]);

  const addProduct = (categoryId?: string) => {
    const resolvedCategoryId = categoryId ?? products[0]?.categoryId ?? "";
    setProducts(prev => [...prev, { id: Date.now().toString(), packageId: null, packageType: null, name: getDefaultInvoiceItemName(resolvedCategoryId, allCategories, t("finance.surcharge")), unitPrice: 0, quantity: 1, vatRate: getCategoryVatRate(resolvedCategoryId), promotionKeys: [], surchargeKeys: [], manualPromotionRows: [], manualSurchargeRows: [], categoryId: resolvedCategoryId }]);
  };
  const removeProduct = (id: string) => setProducts(prev => prev.filter(p => p.id !== id));
  const ensureAdjustmentRows = (
    keys: string[],
    rows: ManualAdjustment[],
    prefix: string,
  ): ManualAdjustment[] => {
    const representedKeys = new Set(rows.map(row => row.optionKey).filter(Boolean));
    const keyRows = keys
      .filter(key => !representedKeys.has(key))
      .map((key, index) => ({
        id: `${prefix}-option-${index}-${key}`,
        optionKey: key,
        valueType: "amount" as const,
        value: 0,
      }));
    if (rows.length > 0 || keyRows.length > 0) return [...rows, ...keyRows];
    return [{ id: `${prefix}-blank`, valueType: "amount", value: 0 }];
  };
  const addSurchargeForProduct = (productId: string) => {
    setProducts(prev => prev.map(product => {
      if (product.id !== productId) return product;
      const rows = ensureAdjustmentRows(
        product.surchargeKeys,
        product.manualSurchargeRows,
        `manual-surcharge-${product.id}`,
      );
      const hasEmptyRow = rows.some(row => !row.optionKey && row.value === 0);
      return {
        ...product,
        manualSurchargeRows: hasEmptyRow
          ? rows
          : [...rows, {
              id: `surcharge-${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              valueType: "amount",
              value: 0,
            }],
      };
    }));
    setIsSurchargeGroupVisible(true);
    setSurchargeSourcePickerOpen(false);
    setSurchargeSearch("");
    setOpenSurchargeId(productId);
  };
  const surchargeDisplayRows = products.flatMap(product => {
    const promotionResult = applySequentialAdjustments(
      calcBase(product),
      product.promotionKeys,
      product.manualPromotionRows,
      promotionOptionsWithVouchers,
      "promotion",
    );
    const rows = product.manualSurchargeRows.length > 0 || product.surchargeKeys.length > 0
      ? ensureAdjustmentRows(product.surchargeKeys, product.manualSurchargeRows, `display-surcharge-${product.id}`)
      : [];
    return rows.map((row, index) => {
      const previousRows = rows.slice(0, index);
      const throughCurrentRows = rows.slice(0, index + 1);
      const previousKeys = previousRows.map(item => item.optionKey).filter((key): key is string => Boolean(key));
      const throughCurrentKeys = throughCurrentRows.map(item => item.optionKey).filter((key): key is string => Boolean(key));
      const before = applySequentialAdjustments(
        promotionResult.finalAmount,
        previousKeys,
        previousRows,
        surchargeOptions,
        "surcharge",
      ).adjustmentAmount;
      const throughCurrent = applySequentialAdjustments(
        promotionResult.finalAmount,
        throughCurrentKeys,
        throughCurrentRows,
        surchargeOptions,
        "surcharge",
      ).adjustmentAmount;
      const beforeVat = calculateInvoiceVatAmount(promotionResult.finalAmount + before, product.vatRate);
      const afterVat = calculateInvoiceVatAmount(promotionResult.finalAmount + throughCurrent, product.vatRate);
      return {
        id: `${product.id}-${row.id}`,
        productId: product.id,
        productName: product.name,
        name: row.optionKey
          ? surchargeOptions.find((option: any) => option.id === row.optionKey)?.name ?? t("finance.surcharge")
          : t("finance.surcharge"),
        amount: Math.max(0, throughCurrent - before),
        vatRate: product.vatRate,
        vatAmount: Math.max(0, afterVat - beforeVat),
        hasValue: Boolean(row.optionKey) || row.value > 0,
      };
    }).filter(row => row.amount > 0 || row.hasValue);
  });
  const showSurchargeGroup = isSurchargeGroupVisible || surchargeDisplayRows.length > 0;
  const selectProductAdjustmentOption = (
    productId: string,
    kind: "promotion" | "surcharge",
    rowId: string,
    optionKey: string,
  ) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      const rowsKey = kind === "promotion" ? "manualPromotionRows" : "manualSurchargeRows";
      const keysKey = kind === "promotion" ? "promotionKeys" : "surchargeKeys";
      const rows = p[rowsKey].map(row => row.id === rowId ? { ...row, optionKey } : row);
      const selectedKeys = Array.from(new Set(rows.map(row => row.optionKey).filter((key): key is string => Boolean(key))));
      return { ...p, [rowsKey]: rows, [keysKey]: selectedKeys };
    }));
  };
  const addManualAdjustmentRow = (productId: string, kind: "promotion" | "surcharge") => {
    const row: ManualAdjustment = {
      id: `${kind}-${productId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      optionKey: undefined,
      valueType: "amount",
      value: 0,
    };
    setProducts(prev => prev.map(p => p.id !== productId ? p : {
      ...p,
      [kind === "promotion" ? "manualPromotionRows" : "manualSurchargeRows"]: [
        ...(kind === "promotion" ? p.manualPromotionRows : p.manualSurchargeRows),
        row,
      ],
    }));
  };
  const updateManualAdjustmentRow = (
    productId: string,
    kind: "promotion" | "surcharge",
    rowId: string,
    patch: Partial<ManualAdjustment>,
  ) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      const key = kind === "promotion" ? "manualPromotionRows" : "manualSurchargeRows";
      return { ...p, [key]: p[key].map(row => row.id === rowId ? { ...row, ...patch } : row) };
    }));
  };
  const removeManualAdjustmentRow = (productId: string, kind: "promotion" | "surcharge", rowId: string) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      const rowsKey = kind === "promotion" ? "manualPromotionRows" : "manualSurchargeRows";
      const keysKey = kind === "promotion" ? "promotionKeys" : "surchargeKeys";
      const rows = p[rowsKey].filter(row => row.id !== rowId);
      const selectedKeys = Array.from(new Set(rows.map(row => row.optionKey).filter((key): key is string => Boolean(key))));
      return { ...p, [rowsKey]: rows, [keysKey]: selectedKeys };
    }));
  };
  const addInvoiceAdjustmentRow = (kind: "promotion" | "surcharge") => {
    const row: ManualAdjustment = {
      id: `invoice-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      valueType: "amount",
      value: 0,
    };
    if (kind === "promotion") setInvoicePromotionRows(prev => [...prev, row]);
    else setInvoiceSurchargeRows(prev => [...prev, row]);
  };
  const updateInvoiceAdjustmentRow = (
    kind: "promotion" | "surcharge",
    rowId: string,
    patch: Partial<ManualAdjustment>,
  ) => {
    const update = (rows: ManualAdjustment[]) => rows.map(row => row.id === rowId ? { ...row, ...patch } : row);
    if (kind === "promotion") setInvoicePromotionRows(update);
    else setInvoiceSurchargeRows(update);
    if (kind === "promotion" && patch.name !== undefined) setInvoicePromotionName(patch.name);
  };
  const selectInvoiceAdjustmentOption = (
    kind: "promotion" | "surcharge",
    rowId: string,
    optionKey: string,
  ) => {
    const currentRows = kind === "promotion" ? invoicePromotionRows : invoiceSurchargeRows;
    const option = kind === "promotion"
      ? promotionOptionsWithVouchers.find((candidate: any) => candidate.id === optionKey || candidate.code === optionKey)
      : surchargeOptions.find((candidate: any) => candidate.id === optionKey || candidate.code === optionKey);
    const nextRows = currentRows.map(row => row.id === rowId
      ? { ...row, optionKey, ...(kind === "promotion" && option ? { name: formatPromotionLabel(option) } : {}) }
      : row);
    const selectedKeys = Array.from(new Set(nextRows.map(row => row.optionKey).filter((key): key is string => Boolean(key))));
    if (kind === "promotion") {
      setInvoicePromotionRows(nextRows);
      setInvoicePromoKeys(selectedKeys);
      if (option) setInvoicePromotionName(formatPromotionLabel(option));
    } else {
      setInvoiceSurchargeRows(nextRows);
      setInvoiceSurchargeKeys(selectedKeys);
    }
  };
  const removeInvoiceAdjustmentRow = (kind: "promotion" | "surcharge", rowId: string) => {
    const currentRows = kind === "promotion" ? invoicePromotionRows : invoiceSurchargeRows;
    const nextRows = currentRows.filter(row => row.id !== rowId);
    const selectedKeys = Array.from(new Set(nextRows.map(row => row.optionKey).filter((key): key is string => Boolean(key))));
    if (kind === "promotion") {
      setInvoicePromotionRows(nextRows);
      setInvoicePromoKeys(selectedKeys);
      setInvoicePromotionName(nextRows.map(row => {
        const option = promotionOptionsWithVouchers.find((candidate: any) => candidate.id === row.optionKey || candidate.code === row.optionKey);
        return row.name?.trim() || (option ? formatPromotionLabel(option) : "");
      }).filter(Boolean).join(", "));
    } else {
      setInvoiceSurchargeRows(nextRows);
      setInvoiceSurchargeKeys(selectedKeys);
    }
  };

  const applyScheduleAdjustmentUpdate = (
    updater: (entries: PaymentScheduleEntry[]) => PaymentScheduleEntry[],
  ) => {
    const nextEntries = updater(paymentSchedule);
    setPaymentSchedule(nextEntries);
  };

  const updateScheduleAdjustmentRows = (
    scheduleId: string,
    kind: "promotion" | "surcharge",
    updateRows: (rows: ManualAdjustment[]) => ManualAdjustment[],
  ) => {
    applyScheduleAdjustmentUpdate(entries => entries.map(entry => {
      if (entry.id !== scheduleId) return entry;
      const rowsKey = kind === "promotion" ? "promotionRows" : "surchargeRows";
      const keysKey = kind === "promotion" ? "promotionKeys" : "surchargeKeys";
      const rows = updateRows(entry[rowsKey] ?? []);
      const keys = Array.from(new Set(rows.map(row => row.optionKey).filter((key): key is string => Boolean(key))));
      return recalculateScheduleAdjustment(entry, kind, rows, keys);
    }));
  };

  const openScheduleAdjustment = (kind: "promotion" | "surcharge", entry: PaymentScheduleEntry) => {
    const rowsKey = kind === "promotion" ? "promotionRows" : "surchargeRows";
    const keys = kind === "promotion" ? (entry.promotionKeys ?? []) : (entry.surchargeKeys ?? []);
    const rows = entry[rowsKey] ?? [];
    const ensuredRows = ensureAdjustmentRows(keys, rows, `schedule-${kind === "promotion" ? "promo" : "surcharge"}-${entry.id}`);
    setPaymentSchedule(prev => prev.map(item => item.id === entry.id ? { ...item, [rowsKey]: ensuredRows } : item));
    setPromotionSearch("");
    setSurchargeSearch("");
    if (kind === "promotion") {
      setOpenSchedulePromo(entry.id);
    } else {
      setOpenScheduleSurcharge(entry.id);
    }
  };

  const addScheduleAdjustmentRow = (scheduleId: string, kind: "promotion" | "surcharge") => {
    const row: ManualAdjustment = {
      id: `schedule-${kind}-${scheduleId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      valueType: "amount",
      value: 0,
    };
    updateScheduleAdjustmentRows(scheduleId, kind, rows => [...rows, row]);
  };

  const updateScheduleAdjustmentRow = (
    scheduleId: string,
    kind: "promotion" | "surcharge",
    rowId: string,
    patch: Partial<ManualAdjustment>,
  ) => {
    updateScheduleAdjustmentRows(scheduleId, kind, rows => rows.map(row => row.id === rowId ? { ...row, ...patch } : row));
  };

  const selectScheduleAdjustmentOption = (
    scheduleId: string,
    kind: "promotion" | "surcharge",
    rowId: string,
    optionKey: string,
  ) => {
    updateScheduleAdjustmentRows(scheduleId, kind, rows => rows.map(row => row.id === rowId ? { ...row, optionKey } : row));
  };

  const removeScheduleAdjustmentRow = (
    scheduleId: string,
    kind: "promotion" | "surcharge",
    rowId: string,
  ) => {
    updateScheduleAdjustmentRows(scheduleId, kind, rows => rows.filter(row => row.id !== rowId));
  };

  // Remaining = total minus what's already paid directly AND what's allocated in schedule
  const scheduleRemaining = finalTotal - directPaidAmount - scheduleAllocated;
  const canAddSchedule = scheduleRemaining > 0;

  const addPayment = () => {
    if (!canAddSchedule) return;
    setPaymentSchedule(prev => {
      const allocated = directPaidAmount + prev.reduce((s, p) => s + p.amount, 0);
      const remaining = Math.max(0, finalTotal - allocated);
      // When directPaidAmount > 0, schedule starts at ĐỢT 2
      const nextNum = getNextPaymentNumber(prev, directPaidAmount);
      return [...prev, { id: Date.now().toString(), label: t("finance.installmentLabel", { number: nextNum }), code: `PT-${Date.now()}`, amount: remaining, due: getTodayVietnamDate(), status: "unpaid", paymentMethod: "cash", bank: "" }];
    });
  };
  const removePayment = async (id: string) => {
    const removed = paymentSchedule.find(p => p.id === id);
    if (!removed || isInvoicePaidLike(removed.status) || deletingPaymentId) return;

    const isPersisted = isEdit && Boolean(invoiceId) && persistedScheduleIds.includes(id);
    if (!isPersisted) {
      setPaymentSchedule(prev => {
        const remaining = prev.filter(p => p.id !== id);
        const otherUnpaid = remaining.filter(p => !isInvoicePaidLike(p.status));
        if (otherUnpaid.length === 0) return remaining;
        const recipient = otherUnpaid.find(p => p.isAuto) ?? otherUnpaid[otherUnpaid.length - 1];
        return remaining.map(p => p.id === recipient.id ? { ...p, amount: p.amount + removed.amount } : p);
      });
      return;
    }

    if (!canDeleteInvoice) {
      toast({ title: t("finance.deleteInvoiceError"), variant: "destructive" });
      return;
    }

    const savedScheduleCount = persistedScheduleIds.length;
    const savedUnpaidCount = paymentSchedule.filter(
      schedule => persistedScheduleIds.includes(schedule.id) && !isInvoicePaidLike(schedule.status)
    ).length;
    if (savedScheduleCount > 1 && savedUnpaidCount < 2) {
      toast({
        title: t("finance.deleteError"),
        description: "Cần có ít nhất hai đợt chưa thanh toán để xóa và dồn tiền.",
        variant: "destructive",
      });
      return;
    }

    setPendingDeletePaymentId(id);
  };

  const confirmRemovePayment = async () => {
    const id = pendingDeletePaymentId;
    if (!id || deletingPaymentId) return;

    const removed = paymentSchedule.find(p => p.id === id);
    if (!removed || isInvoicePaidLike(removed.status)) {
      setPendingDeletePaymentId(null);
      return;
    }
    if (!canDeleteInvoice) {
      setPendingDeletePaymentId(null);
      toast({ title: t("finance.deleteInvoiceError"), variant: "destructive" });
      return;
    }

    const savedScheduleCount = persistedScheduleIds.length;
    const savedUnpaidCount = paymentSchedule.filter(
      schedule => persistedScheduleIds.includes(schedule.id) && !isInvoicePaidLike(schedule.status)
    ).length;
    if (savedScheduleCount > 1 && savedUnpaidCount < 2) {
      setPendingDeletePaymentId(null);
      toast({
        title: t("finance.deleteError"),
        description: "Cần có ít nhất hai đợt chưa thanh toán để xóa và dồn tiền.",
        variant: "destructive",
      });
      return;
    }

    setPendingDeletePaymentId(null);
    setDeletingPaymentId(id);
    let deletionCommitted = false;
    try {
      if (savedScheduleCount === 1) {
        await apiRequest("DELETE", `/api/finance/invoices/${invoiceId}`);
        deletionCommitted = true;
        queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"], exact: true });
        queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices", invoiceId], exact: true });
        toast({ title: t("finance.deleteInvoiceSuccess") });
        onClose();
        return;
      }

      await apiRequest("DELETE", `/api/finance/invoice-schedules/${id}`);
      deletionCommitted = true;
      setScheduleSyncError(true);
      const refreshedSchedules = await apiRequest(
        "GET",
        `/api/finance/invoices/${invoiceId}/payment-schedules`,
      ).then(response => response.json());
      const refreshedEntries: PaymentScheduleEntry[] = (Array.isArray(refreshedSchedules) ? refreshedSchedules : []).map((schedule: any, index: number) => {
        const status = schedule.status ?? "unpaid";
        const baseAmount = schedule.baseAmount === null || schedule.baseAmount === undefined
          ? null
          : parseFloat(schedule.baseAmount) || 0;
        const promotionAmount = parseFloat(schedule.promotionAmount) || 0;
        const surchargeAmount = parseFloat(schedule.surchargeAmount) || 0;
        const amount = !isInvoicePaidLike(status) && baseAmount !== null && promotionAmount > 0
          ? Math.max(0, baseAmount - promotionAmount + surchargeAmount)
          : parseFloat(schedule.amount) || 0;
        return {
          id: schedule.id,
          label: schedule.label ?? t("finance.installmentLabel", { number: index + 1 }),
          code: schedule.code ?? "",
          amount,
          baseAmount,
          promotionKeys: Array.isArray(schedule.promotionKeys) ? schedule.promotionKeys : [],
          surchargeKeys: Array.isArray(schedule.surchargeKeys) ? schedule.surchargeKeys : [],
          promotionRows: getInitialAdjustmentRows(
            Array.isArray(schedule.promotionKeys) ? schedule.promotionKeys : [],
            promotionAmount,
            `schedule-promo-${schedule.id}`,
          ),
          surchargeRows: getInitialAdjustmentRows(
            Array.isArray(schedule.surchargeKeys) ? schedule.surchargeKeys : [],
            surchargeAmount,
            `schedule-surcharge-${schedule.id}`,
          ),
          promotionAmount,
          surchargeAmount,
          due: parseDateOnly(schedule.dueDate),
          status,
          paymentMethod: schedule.paymentMethod ?? "cash",
          bank: schedule.appliedBankAccount?.bankAccount ?? schedule.bank ?? "",
        };
      });
      const unsavedEntries = paymentSchedule.filter(schedule => !persistedScheduleIds.includes(schedule.id));
      setPaymentSchedule([...refreshedEntries, ...unsavedEntries]);
      setPersistedScheduleIds(refreshedEntries.map(schedule => schedule.id));
      setScheduleSyncError(false);
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"], exact: true });
      queryClient.invalidateQueries({
        queryKey: ["/api/finance/invoices", invoiceId],
        exact: true,
        refetchType: "none",
      });
      toast({ title: t("finance.deleteScheduleSuccess") });
    } catch (error: any) {
      if (deletionCommitted && savedScheduleCount > 1) {
        setScheduleSyncError(true);
        queryClient.invalidateQueries({
          queryKey: ["/api/finance/invoices", invoiceId],
          exact: true,
        });
      }
      toast({
        title: t("finance.deleteError"),
        description: deletionCommitted
          ? "Đợt đã xóa nhưng chưa đồng bộ được danh sách. Hãy đóng và mở lại hóa đơn trước khi lưu."
          : error?.message ?? t("finance.deleteInvoiceErrorRetry"),
        variant: "destructive",
      });
    } finally {
      setDeletingPaymentId(null);
    }
  };
  const hasLockedPayment = directPaidAmount > 0 || paymentSchedule.some(p => isInvoicePaidLike(p.status));
  const unpaidScheduleCount = paymentSchedule.filter(p => !isInvoicePaidLike(p.status)).length;
  const persistedUnpaidScheduleCount = paymentSchedule.filter(
    p => persistedScheduleIds.includes(p.id) && !isInvoicePaidLike(p.status)
  ).length;
  const pendingDeletePayment = paymentSchedule.find(p => p.id === pendingDeletePaymentId);
  const isPendingDeleteLastSchedule = persistedScheduleIds.length === 1;
  const canEditPaymentAmount = (entry: PaymentScheduleEntry) =>
    !isInvoicePaidLike(entry.status) && !(hasLockedPayment && unpaidScheduleCount === 1);

  const updatePaymentAmount = (id: string, rawAmount: number) => setPaymentSchedule(prev => {
    const current = prev.find(p => p.id === id);
    if (!current || isInvoicePaidLike(current.status)) return prev;
    const unpaid = prev.filter(p => !isInvoicePaidLike(p.status));
    const lockedPaymentExists = directPaidAmount > 0 || prev.some(p => isInvoicePaidLike(p.status));
    if (lockedPaymentExists && unpaid.length === 1) return prev;

    const requestedAmount = Math.max(0, Number(rawAmount) || 0);
    const otherUnpaid = unpaid.filter(p => p.id !== id);

    // With one unpaid entry and no payment history, decreasing it creates the
    // next automatic remainder entry via the reconciliation effect above.
    if (otherUnpaid.length === 0) {
      const maximum = Math.max(0, finalTotal - directPaidAmount);
      return prev.map(p => p.id === id ? { ...p, amount: Math.min(requestedAmount, maximum) } : p);
    }

    const otherTotal = otherUnpaid.reduce((sum, entry) => sum + entry.amount, 0);
    const nextAmount = Math.min(requestedAmount, current.amount + otherTotal);
    const difference = nextAmount - current.amount;
    if (Math.abs(difference) < 0.01) return prev;

    const preferredOthers = [
      ...otherUnpaid.filter(entry => entry.isAuto),
      ...otherUnpaid.filter(entry => !entry.isAuto).reverse(),
    ];
    const amounts = new Map(prev.map(entry => [entry.id, entry.amount]));
    amounts.set(id, nextAmount);

    if (difference > 0) {
      let amountToTake = difference;
      for (const entry of preferredOthers) {
        if (amountToTake <= 0) break;
        const available = amounts.get(entry.id) ?? 0;
        const taken = Math.min(available, amountToTake);
        amounts.set(entry.id, available - taken);
        amountToTake -= taken;
      }
    } else {
      const recipient = preferredOthers[0];
      amounts.set(recipient.id, (amounts.get(recipient.id) ?? 0) + Math.abs(difference));
    }

    return prev.map(entry => ({ ...entry, amount: amounts.get(entry.id) ?? entry.amount }));
  });

  const openSplitPayment = (entry: PaymentScheduleEntry) => {
    if (isInvoicePaidLike(entry.status) || entry.amount <= 0) return;
    setSplitPaymentId(entry.id);
    setSplitAmount(Math.max(1, Math.floor(entry.amount / 2)));
    setSplitDueDate(format(entry.due ?? new Date(), "yyyy-MM-dd"));
  };
  const confirmSplitPayment = () => {
    const source = paymentSchedule.find(entry => entry.id === splitPaymentId);
    if (!source || isInvoicePaidLike(source.status)) return;
    const amount = Math.max(0, Number(splitAmount) || 0);
    if (amount <= 0 || amount >= source.amount) {
      toast({
         title: t("finance.create.invalidSplitAmount"),
         description: t("finance.create.splitAmountHint", { amount: fmtMoney(source.amount) }),
        variant: "destructive",
      });
      return;
    }
    const timestamp = Date.now();
    const nextNum = getNextPaymentNumber(paymentSchedule, directPaidAmount);
    setPaymentSchedule(prev => [
      ...prev.map(entry => entry.id === source.id
        ? { ...entry, amount: entry.amount - amount, isAuto: false }
        : entry),
      {
        id: `split-${timestamp}`,
        label: t("finance.installmentLabel", { number: nextNum }),
        code: `PT-${timestamp}`,
        amount,
        due: splitDueDate ? new Date(`${splitDueDate}T00:00:00`) : source.due,
        status: "unpaid",
        paymentMethod: source.paymentMethod,
        bank: source.bank,
        isAuto: false,
      },
    ]);
    setSplitPaymentId(null);
    setSplitAmount(0);
    setSplitDueDate("");
  };
  const splitPayment = paymentSchedule.find(entry => entry.id === splitPaymentId);
  const updatePaymentDue = (id: string, due: Date) => {
    setPaymentSchedule(prev => prev.map(p => p.id === id && !isInvoicePaidLike(p.status) ? { ...p, due } : p));
    setOpenDuePicker(null);
  };
  const updatePaymentStatus = (id: string, status: string) => setPaymentSchedule(prev => prev.map(p =>
    p.id === id && !isInvoicePaidLike(p.status) ? { ...p, status } : p
  ));

  const handleSelectFeePackage = (productId: string, pkgId: string) => {
    const pkg = feePackages.find((fp: any) => fp.id === pkgId);
    if (!pkg) return;
    const isCoursePackage = pkg.type === "khoá";
    const suggestedQuantity = Number(pkg.sessions);
    setProducts(prev => prev.map(x => x.id === productId ? {
      ...x,
      packageId: pkg.id,
      packageType: pkg.type ?? null,
      name: pkg.name,
      unitPrice: parseFloat(pkg.totalAmount || pkg.fee || "0"),
      // A course package's session count is only a display/reference quantity.
      // calcBase intentionally keeps the package total independent of it.
      quantity: isCoursePackage && Number.isFinite(suggestedQuantity) && suggestedQuantity > 0
        ? suggestedQuantity
        : x.quantity,
    } : x));
  };

  const closeProductPicker = () => {
    setProductPickerCategoryId(null);
    setProductPickerSearch("");
    setSurchargeSearch("");
    setKhoSearch("");
    setKhoPickerOpen(null);
    setPendingStandaloneSurchargeId(null);
  };
  const addStandaloneSurcharge = () => {
    const id = `surcharge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setProducts(prev => [...prev, {
      id,
      packageId: null,
      packageType: null,
      name: t("finance.surcharge"),
      unitPrice: 0,
      quantity: 1,
      vatRate: 0,
      promotionKeys: [],
      surchargeKeys: [],
      manualPromotionRows: [],
      manualSurchargeRows: [],
      categoryId: SURCHARGE_CATEGORY_ID,
    }]);
    setPendingStandaloneSurchargeId(id);
    setProductPickerCategoryId(SURCHARGE_CATEGORY_ID);
    setSurchargeSearch("");
  };
  const addSelectedFeePackage = (pkg: any, categoryId: string) => {
    const isCoursePackage = pkg.type === "khoá";
    const suggestedQuantity = Number(pkg.sessions);
    setProducts(prev => [...prev, {
      id: `fee-${Date.now()}`,
      packageId: pkg.id,
      packageType: pkg.type ?? null,
      name: pkg.name,
      unitPrice: parseFloat(pkg.totalAmount || pkg.fee || "0"),
      quantity: isCoursePackage && Number.isFinite(suggestedQuantity) && suggestedQuantity > 0 ? suggestedQuantity : 1,
      vatRate: getCategoryVatRate(categoryId),
      promotionKeys: [],
      surchargeKeys: [],
      manualPromotionRows: [],
      manualSurchargeRows: [],
      categoryId,
    }]);
    closeProductPicker();
  };
  const addSelectedInventoryProduct = (product: any, categoryId: string) => {
    setProducts(prev => [...prev, {
      id: `inventory-${Date.now()}`,
      packageId: null,
      packageType: null,
      name: product.name,
      unitPrice: parseFloat(product.sale_price) || 0,
      quantity: 1,
      vatRate: getCategoryVatRate(categoryId),
      promotionKeys: [],
      surchargeKeys: [],
      manualPromotionRows: [],
      manualSurchargeRows: [],
      categoryId,
      storeProductId: product.id,
      storeProductCode: product.code,
      warehouseId: product.warehouse_id,
      warehouseName: product.warehouse_name ?? null,
      stockAvailable: parseInt(String(product.stock)) || 0,
    }]);
    closeProductPicker();
  };
  const addSelectedSurcharge = (option: any) => {
    const value = Math.max(0, parseFloat(option.valueAmount || "0") || 0);
    const basis = products
      .filter(product => product.categoryId !== SURCHARGE_CATEGORY_ID)
      .reduce((sum, product) => {
        const promotion = applySequentialAdjustments(
          calcBase(product),
          product.promotionKeys,
          product.manualPromotionRows,
          promotionOptionsWithVouchers,
          "promotion",
        );
        return sum + promotion.finalAmount;
      }, 0);
    const amount = option.valueType === "percent" ? Math.round(basis * value / 100) : value;
    const pendingId = pendingStandaloneSurchargeId;
    setProducts(prev => {
      if (pendingId && prev.some(product => product.id === pendingId)) {
        return prev.map(product => product.id === pendingId
          ? { ...product, name: option.name, unitPrice: amount }
          : product);
      }
      return [...prev, {
        id: `surcharge-${Date.now()}`,
        packageId: null,
        packageType: null,
        name: option.name,
        unitPrice: amount,
        quantity: 1,
        vatRate: 0,
        promotionKeys: [],
        surchargeKeys: [],
        manualPromotionRows: [],
        manualSurchargeRows: [],
        categoryId: SURCHARGE_CATEGORY_ID,
      }];
    });
    closeProductPicker();
  };

  const handleSave = () => {
    if (isPaidInvoiceLocked) {
      if (isPaidNoteDirty) saveMutation.mutate({ note });
      return;
    }
    if (!locationId) { toast({ title: t("finance.create.branchRequiredError"), variant: "destructive" }); return; }
    if (products.some(p => !p.categoryId)) { toast({ title: t("finance.create.categoryRequiredError"), variant: "destructive" }); return; }
    if (!studentId && !subjectName.trim()) { toast({ title: t("finance.create.recipientRequiredError"), variant: "destructive" }); return; }
    if (products.some(product => !product.name.trim())) {
      toast({ title: t("finance.create.productNameRequiredError"), variant: "destructive" });
      return;
    }
    const incompleteSurcharge = products.some(product =>
      product.categoryId === SURCHARGE_CATEGORY_ID &&
      (product.name.trim() || product.unitPrice !== 0) &&
      (!product.name.trim() || product.unitPrice <= 0),
    );
    if (incompleteSurcharge) { toast({ title: t("finance.create.surchargeDetailsRequiredError"), variant: "destructive" }); return; }
    const originalInvoicePromotionAmount = parseFloat(editData?.invoicePromotionAmount ?? "0") || 0;
    const isAddingUnnamedInvoicePromotion = invoicePromoAmt > originalInvoicePromotionAmount + 0.01
      && !resolvedInvoicePromotionName.trim();
    if (isAddingUnnamedInvoicePromotion) {
      toast({ title: t("finance.create.promotionNameRequired"), variant: "destructive" });
      return;
    }
    if (invoicePromotionVatMixed && invoicePromoAmt > 0 && resolvedInvoicePromotionName.trim()) {
      toast({ title: t("finance.create.invoicePromotionMixedVat"), variant: "destructive" });
      return;
    }
    if (directPaidAmount > finalTotal + 0.01) {
      toast({
        title: t("finance.create.paidAmountExceedsTotal"),
        description: t("finance.create.paidAmountExceedsTotalDescription"),
        variant: "destructive",
      });
      return;
    }
    if (paymentSchedule.length > 0) {
      const allocated = directPaidAmount + paymentSchedule.reduce((sum, entry) => sum + entry.amount, 0);
      if (Math.abs(allocated - finalTotal) > 0.01) {
        const allInstallmentsPaid = paymentSchedule.every(entry => isInvoicePaidLike(entry.status));
        toast({
           title: allInstallmentsPaid
             ? t("finance.create.allInstallmentsPaid")
             : t("finance.create.scheduleMismatch"),
           description: allInstallmentsPaid
             ? t("finance.create.allInstallmentsPaidDescription")
             : t("finance.create.scheduleMismatchDescription", { allocated: fmtMoney(allocated), total: fmtMoney(finalTotal) }),
          variant: "destructive",
        });
        return;
      }
      if (paymentSchedule.some(entry => entry.amount <= 0)) {
        toast({
           title: t("finance.create.invalidScheduleAmount"),
           description: t("finance.create.positiveScheduleAmount"),
          variant: "destructive",
        });
        return;
      }
    }

    const firstNonSurchargeProduct = products.find(product => product.categoryId !== SURCHARGE_CATEGORY_ID);
    const firstCat = allCategories.find((c: any) => c.id === firstNonSurchargeProduct?.categoryId);

    const items = products
      .filter(p => !(p.categoryId === SURCHARGE_CATEGORY_ID && !p.name.trim() && p.unitPrice === 0))
      .map(p => {
      const base = calcBase(p);
      const promotionResult = applySequentialAdjustments(
        base,
        p.promotionKeys,
        p.manualPromotionRows,
        promotionOptionsWithVouchers,
        "promotion",
      );
      const surchargeResult = applySequentialAdjustments(
        promotionResult.finalAmount,
        p.surchargeKeys,
        p.manualSurchargeRows,
        surchargeOptions,
        "surcharge",
      );
      const promoAmt = promotionResult.adjustmentAmount;
      const surchargeAmt = surchargeResult.adjustmentAmount;
      const itemCat = allCategories.find((c: any) => c.id === p.categoryId);
      const vatRate = p.vatRate ?? 0;
      const vatAmount = p.vatAmountOverride !== undefined && promotionResult.adjustmentAmount === 0
        ? p.vatAmountOverride
        : calculateInvoiceVatAmount(surchargeResult.finalAmount, vatRate);
      return {
        packageName: p.name,
        packageId: p.packageId,
        packageType: p.packageType,
        unitPrice: String(p.unitPrice),
        quantity: p.quantity,
        promotionKeys: p.promotionKeys,
        manualPromotionRows: p.manualPromotionRows,
        surchargeKeys: p.surchargeKeys,
        promotionAmount: String(promoAmt),
        surchargeAmount: String(surchargeAmt),
        subtotal: String(surchargeResult.finalAmount),
        vatRate,
        vatAmount: String(vatAmount),
        category: p.categoryId === SURCHARGE_CATEGORY_ID ? t("finance.surcharge") : itemCat?.name ?? "",
        storeProductId: p.storeProductId ?? null,
        storeProductCode: p.storeProductCode ?? null,
        warehouseId: p.warehouseId ?? null,
        warehouseName: p.warehouseName ?? null,
      };
      });

    const baseSchedule = paymentSchedule.map(s => ({
      id: s.id.startsWith("auto-") ? undefined : s.id,
      label: s.label,
      code: s.code,
      amount: String(s.amount),
      baseAmount: s.baseAmount === null || s.baseAmount === undefined ? undefined : String(s.baseAmount),
      promotionKeys: s.promotionKeys ?? [],
      surchargeKeys: s.surchargeKeys ?? [],
      promotionAmount: String(s.promotionAmount ?? 0),
      surchargeAmount: String(s.surchargeAmount ?? 0),
      dueDate: s.due ? format(s.due, "yyyy-MM-dd") : null,
      status: s.status,
      paymentMethod: s.paymentMethod || null,
      appliedBankAccount: s.paymentMethod === "transfer" && s.bank
        ? locationBanks.find(b => b.bankAccount === s.bank) ?? { bankAccount: s.bank }
        : null,
    }));

    // When directPaidAmount > 0 and there are further installments, prepend it as ĐỢT 1 (already paid)
    const schedule = (directPaidAmount > 0 && baseSchedule.length > 0)
      ? [
          {
            label: t("finance.installmentLabel", { number: 1 }),
            code: `PT1-${Date.now()}`,
            amount: String(directPaidAmount),
            dueDate: format(getTodayVietnamDate(), "yyyy-MM-dd"),
            status: "paid",
            paymentMethod: directPaymentMethod || null,
            appliedBankAccount: directPaymentMethod === "transfer" && directBank
              ? locationBanks.find(b => b.bankAccount === directBank) ?? { bankAccount: directBank }
              : null,
          },
          ...baseSchedule,
        ]
      : baseSchedule;

    const hasSchedule = schedule.length > 0;
    const effectivePaid = directPaidAmount + (paymentSchedule.filter(s => isInvoicePaidLike(s.status)).reduce((sum, s) => sum + s.amount, 0));
    const effectiveRemaining = Math.max(0, grandTotal - effectivePaid);

    // Use invoice-level paymentMethod only when paying in full directly (no schedule)
    const selectedBank = !hasSchedule && directPaymentMethod === "transfer" && directBank
      ? locationBanks.find(b => b.bankAccount === directBank) ?? { bankAccount: directBank }
      : null;

    saveMutation.mutate({
      type: invoiceType === "income" ? "Thu" : "Chi",
      locationId,
      category: firstCat?.name ?? (products.some(product => product.categoryId === SURCHARGE_CATEGORY_ID) ? t("finance.surcharge") : ""),
      classId: classId || null,
      studentId: studentId || null,
      subjectName: studentId ? null : subjectName.trim(),
      account,
      counterAccount,
      totalAmount: String(totalAmount),
      totalPromotion: String(totalPromo),
      totalSurcharge: String(totalSurcharge),
      invoicePromotionKeys: invoicePromotionVatLocked ? [] : invoicePromoKeys,
      invoicePromotionName: invoicePromotionVatLocked ? null : resolvedInvoicePromotionName.trim() || null,
      invoiceSurchargeKeys: invoiceSurchargeKeys,
      invoicePromotionAmount: String(invoicePromoAmt),
      invoiceSurchargeAmount: String(invoiceSurchargeAmt),
      grandTotal: String(finalTotal),
      deduction: String(deduction),
      paidAmount: String(effectivePaid),
      remainingAmount: String(effectiveRemaining),
      paymentMethod: !hasSchedule ? (directPaymentMethod || null) : null,
      appliedBankAccount: selectedBank,
      note,
      dueDate: dueDate || null,
      status: (grandTotal === 0 && subTotal > 0) || (effectivePaid >= grandTotal && grandTotal > 0) ? "paid" : effectivePaid > 0 ? "partial" : (isEdit ? undefined : "unpaid"),
      items,
      paymentSchedule: schedule,
      commissions: commissions.length > 0 ? commissions : [],
    });
  };

  const renderInvoiceAdjustmentRows = (kind: "promotion" | "surcharge") => {
    const isPromotion = kind === "promotion";
    const rows = isPromotion ? invoicePromotionRows : invoiceSurchargeRows;
    const options = isPromotion ? promotionOptionsWithVouchers : surchargeOptions;
    const filteredOptions = isPromotion ? filteredPromotionOptionsWithVouchers : filteredSurchargeOptions;
    const search = isPromotion ? promotionSearch : surchargeSearch;
    const setSearch = isPromotion ? setPromotionSearch : setSurchargeSearch;
    const openPicker = isPromotion ? openInvoicePromoPicker : openInvoiceSurchargePicker;
    const setOpenPicker = isPromotion ? setOpenInvoicePromoPicker : setOpenInvoiceSurchargePicker;
    const total = isPromotion ? invoicePromoAmt : invoiceSurchargeAmt;

    return (
      <div className="mt-3 space-y-4">
        {rows.map(row => {
          const selectedOption = options.find((o: any) => o.id === row.optionKey || o.code === row.optionKey);
          return (
              <div key={row.id} className="space-y-2 rounded-lg border border-muted p-2">
              <Popover open={openPicker === row.id} onOpenChange={v => {
                setOpenPicker(v ? row.id : null);
                if (v) setSearch("");
              }}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full min-h-9 flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5 text-left text-xs hover:border-purple-400"
                  >
                    <span className={selectedOption ? "truncate" : "text-muted-foreground"}>
                      {selectedOption
                        ? (isPromotion ? formatPromotionLabel(selectedOption) : selectedOption.name)
                        : t("finance.create.chooseAdjustment", { type: isPromotion ? t("finance.promotion").toLowerCase() : t("finance.surcharge").toLowerCase() })}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[28rem] max-w-[calc(100vw-2rem)] p-3" align="start">
                  <div className="mb-2 relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder={t("finance.create.searchAdjustment", { type: isPromotion ? t("finance.promotion").toLowerCase() : t("finance.surcharge").toLowerCase() })}
                      className="h-8 pl-7 text-xs"
                      autoFocus
                      onKeyDown={e => e.stopPropagation()}
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {options.length === 0 ? (
                      <p className="py-3 text-center text-xs text-muted-foreground">
                        {t("finance.create.noAdjustment", { type: isPromotion ? t("finance.promotion").toLowerCase() : t("finance.surcharge").toLowerCase() })}
                      </p>
                    ) : filteredOptions.length === 0 ? (
                      <p className="py-3 text-center text-xs text-muted-foreground">
                        {t("finance.create.adjustmentNotFound", { type: isPromotion ? t("finance.promotion").toLowerCase() : t("finance.surcharge").toLowerCase() })}
                      </p>
                    ) : filteredOptions.map((o: any) => {
                      const val = parseFloat(o.valueAmount || "0");
                      return (
                        <button
                          key={o.id}
                          type="button"
                          className="w-full flex items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-muted/60"
                          onClick={() => {
                            selectInvoiceAdjustmentOption(kind, row.id, o.id);
                            setOpenPicker(null);
                          }}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1 text-xs font-medium">
                              {isPromotion && o.kind === "voucher" && (
                                <span className="shrink-0 rounded bg-red-100 px-1 text-[9px] font-semibold text-red-600">Voucher</span>
                              )}
                              <span className="truncate">{o.name}</span>
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {isPromotion ? "-" : "+"}{o.valueType === "percent" ? `${val}%` : fmtMoney(val)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>

              <div className={cn("flex items-center gap-1.5", isPromotion && "flex-wrap sm:flex-nowrap")}>
                <select
                  value={row.valueType}
                  onChange={e => updateInvoiceAdjustmentRow(kind, row.id, { valueType: e.target.value as ManualAdjustment["valueType"] })}
                  className="h-8 w-28 shrink-0 rounded-md border bg-background px-2 text-xs"
                >
                  <option value="amount">{t("finance.create.amountType")}</option>
                  <option value="percent">{t("finance.create.percentType")}</option>
                </select>
                <div className="relative min-w-0 flex-1">
                  <Input
                    type="number"
                    min={0}
                    value={row.value || ""}
                    onChange={e => updateInvoiceAdjustmentRow(kind, row.id, { value: Math.max(0, Number(e.target.value) || 0) })}
                  placeholder={t("finance.create.quickEnter")}
                    className="h-8 pr-8 text-xs"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                    {row.valueType === "percent" ? "%" : "₫"}
                  </span>
                </div>
                {isPromotion && (
                  <Input
                    value={row.name ?? ""}
                    onChange={event => updateInvoiceAdjustmentRow(kind, row.id, { name: event.target.value })}
                    placeholder={t("finance.create.promotionName")}
                    aria-label={t("finance.create.promotionName")}
                    maxLength={120}
                    className="h-8 min-w-0 flex-1 text-xs"
                    data-testid={`input-invoice-promotion-name-${row.id}`}
                  />
                )}
                <button
                  type="button"
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  onClick={() => removeInvoiceAdjustmentRow(kind, row.id)}
                aria-label={t("finance.create.removeAdjustment", { type: isPromotion ? t("finance.promotion").toLowerCase() : t("finance.surcharge").toLowerCase() })}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
        <button
          type="button"
          className="text-xs font-medium text-purple-600 hover:text-purple-700"
          onClick={() => addInvoiceAdjustmentRow(kind)}
        >
          + {t("finance.add")}
        </button>
        <div className="flex justify-between border-t pt-3 text-xs font-semibold">
          <span>{t("finance.create.totalAdjustment", { type: isPromotion ? t("finance.promotion").toLowerCase() : t("finance.surcharge").toLowerCase() })}</span>
          <span className={isPromotion ? "text-green-600" : "text-orange-600"}>
            {isPromotion ? "-" : "+"}{fmtMoney(total)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={v => {
        if (!v) {
          setPendingDeletePaymentId(null);
          onClose();
        }
      }}>
      <DialogContent className="w-screen h-screen max-w-none max-h-none m-0 rounded-none p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-xs font-semibold">
            <CreditCard className="h-4 w-4 text-purple-600" />
            {isEdit ? `${t("finance.editInvoice")} ${editData?.code ?? ""}` : t("finance.create.enterInvoice")}
          </DialogTitle>
        </DialogHeader>

        <div className="relative flex flex-1 overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT PANEL */}
          <div className="flex-1 overflow-y-auto px-6 py-4 border-r space-y-4 min-w-0">

            <div className="flex items-center gap-1 p-1 rounded-lg border bg-muted/30 w-fit">
              <button
                onClick={() => { setInvoiceType("income"); setProducts(prev => prev.map(p => ({ ...p, categoryId: "" }))); }}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${invoiceType === "income" ? "bg-purple-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="toggle-income"
              >
                {t("finance.invoiceTypeIncome")}
              </button>
              <button
                onClick={() => { setInvoiceType("expense"); setProducts(prev => prev.map(p => ({ ...p, categoryId: "" }))); }}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${invoiceType === "expense" ? "bg-purple-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="toggle-expense"
              >
                {t("finance.invoiceTypeExpense")}
              </button>
            </div>

            {/* Row 1: Cơ sở, Tên, Lớp */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{t("finance.create.branchRequired")} <span className="text-red-500">*</span></label>
              <Select value={locationId} onValueChange={v => { setLocationId(v); setStudentId(null); setSubjectName(""); setClassId(""); clearSelectedVouchers(); setProducts(prev => prev.map(p => ({ ...p, packageId: null }))); }}>
                  <SelectTrigger className="h-9" data-testid="select-branch"><SelectValue placeholder={t("finance.create.chooseBranch")} /></SelectTrigger>
                  <SelectContent>
                    {locations.map((loc: any) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{t("finance.create.nameRequired")} <span className="text-red-500">*</span></label>
                <Popover open={studentPickerOpen} onOpenChange={setStudentPickerOpen}>
                  <PopoverTrigger asChild>
                    <button
                      className="w-full h-9 flex items-center justify-between px-3 rounded-md border bg-background text-sm hover:border-purple-400 transition-colors text-left"
                      data-testid="button-student-picker"
                    >
                      <span className={displayName ? "text-foreground truncate" : "text-muted-foreground"}>
                        {displayName || t("finance.selectStudent")}
                      </span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-1" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-2" align="start">
                    <div className="mb-2 relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        className="h-8 text-xs pl-7"
                         placeholder={t("finance.create.searchPerson")}
                        value={studentSearch}
                        onChange={e => setStudentSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="max-h-52 overflow-y-auto space-y-0.5">
                      {students.length === 0 ? (
                        <p className="text-xs text-center text-muted-foreground py-4">{t("finance.notFound")}</p>
                      ) : (() => {
                        const studentItemsRaw = students.filter((s: any) => s.entityType !== "staff");
                        const studentItems = [...studentItemsRaw].sort((a: any, b: any) => {
                          const aActive = a.accountStatus !== "Không hoạt động";
                          const bActive = b.accountStatus !== "Không hoạt động";
                          if (aActive === bActive) return 0;
                          return aActive ? -1 : 1;
                        });
                        const staffItems = students.filter((s: any) => s.entityType === "staff");
                        return (
                          <>
                            {studentItems.length > 0 && studentSearch && (
                              <p className="text-[10px] font-medium text-muted-foreground px-2 py-1">{t("finance.create.studentsParents")}</p>
                            )}
                            {studentItems.map((s: any) => {
                              const isInactive = s.accountStatus === "Không hoạt động";
                              return (
                                <button
                                  key={s.id}
                                  disabled={isInactive}
                                  className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${isInactive ? "opacity-40 cursor-not-allowed" : "hover:bg-muted/60 cursor-pointer"} ${studentId === s.id ? "bg-purple-50 text-purple-700" : ""}`}
                                  onClick={() => { if (isInactive) return; clearSelectedVouchers(); setStudentId(s.id); setSelectedStaffId(null); setSubjectName(""); setDeduction(0); setStudentPickerOpen(false); }}
                                >
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="font-mono text-muted-foreground">[{s.code}]</span> {s.fullName}
                                    <span className="text-[10px] text-muted-foreground">({s.type})</span>
                                    {isInactive && <span className="text-amber-500 text-[10px] font-medium">⚠ {t("finance.inactive")}</span>}
                                  </span>
                                </button>
                              );
                            })}
                            {staffItems.length > 0 && (
                              <>
                                <div className="border-t my-1" />
                                <p className="text-[10px] font-medium text-muted-foreground px-2 py-1">{t("finance.create.staff")}</p>
                                {staffItems.map((s: any) => (
                                  <button
                                    key={s.id}
                                    className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/60 transition-colors ${selectedStaffId === s.id ? "bg-blue-50 text-blue-700" : ""}`}
                                    onClick={() => { clearSelectedVouchers(); setStudentId(null); setSelectedStaffId(s.id); setSubjectName(`[${s.code}] ${s.fullName}`); setDeduction(0); setStudentPickerOpen(false); }}
                                  >
                                    <span className="font-mono text-muted-foreground">[{s.code}]</span> {s.fullName}
                                    <span className="ml-1 text-[10px] text-blue-500">({t("finance.create.staff")})</span>
                                  </button>
                                ))}
                              </>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{t("finance.class")}</label>
                <SearchableSelect
                  value={classId}
                  onChange={setClassId}
                  placeholder={t("finance.create.chooseClass")}
                  searchPlaceholder={t("finance.searchClass")}
                  options={classes.map((cls: any) => ({
                    value: cls.id,
                    label: `[${cls.classCode}] ${cls.name}`,
                  }))}
                  className="h-9"
                  data-testid="select-class"
                />
              </div>
            </div>

            {/* Row 2: Tài khoản thu/chi, Tài khoản đối ứng, Hạn Thanh toán */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{invoiceType === "income" ? t("finance.invoiceTypeIncome") : t("finance.invoiceTypeExpense")} <span className="text-red-500">*</span></label>
                <SearchableSelect
                  value={account}
                  onChange={setAccount}
                  options={INVOICE_ACCOUNT_OPTIONS}
                  searchPlaceholder={accountSearchPlaceholder}
                  className="h-9"
                  modal
                  data-testid="select-account"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{t("finance.create.counterAccount")}</label>
                <SearchableSelect
                  value={counterAccount}
                  onChange={setCounterAccount}
                  options={INVOICE_ACCOUNT_OPTIONS}
                  searchPlaceholder={accountSearchPlaceholder}
                  className="h-9"
                  modal
                  data-testid="select-counterpart"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{t("finance.create.dueDate")}</label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="h-9 text-sm"
                  data-testid="input-due-date"
                />
              </div>
            </div>

            {/* Product list */}
            <div>
              <div className="mb-2">
                <span className="text-sm font-semibold">{t("finance.create.products")}</span>
              </div>

              <div className="rounded-lg border overflow-x-auto">
                 <table className="w-full min-w-[940px] text-xs table-fixed [&_tbody_td]:align-top">
                  <colgroup>
                     <col style={{ width: "28%" }} />
                     <col style={{ width: "13%" }} />
                     <col style={{ width: "7%" }} />
                     <col style={{ width: "13%" }} />
                     <col style={{ width: "14%" }} />
                     <col style={{ width: "11%" }} />
                     <col style={{ width: "11%" }} />
                    <col style={{ width: "3%" }} />
                  </colgroup>
                  <thead className="bg-muted/60">
                    <tr className="border-b">
                       <th className="p-2 text-left font-semibold text-muted-foreground">
                         {t("finance.create.packageName")} <span className="text-rose-500">*</span>
                       </th>
                      <th className="p-2 text-right font-semibold text-muted-foreground">{t("finance.unitPrice")}</th>
                      <th className="p-2 text-center font-semibold text-muted-foreground">{t("finance.create.quantity")}</th>
                      <th className="p-2 text-right font-semibold text-muted-foreground">{t("finance.promotion")}</th>
                      <th className="p-2 text-right font-semibold text-muted-foreground">{t("finance.lineTotal")}</th>
                      <th className="p-2 text-center font-semibold text-muted-foreground">{t("finance.vat")}</th>
                      <th className="p-2 text-right font-semibold text-muted-foreground">{t("finance.totalAfterVat")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {productGroups.map(group => (
                      <Fragment key={`category-${group.categoryId || "unassigned"}`}>
                        <tr className="border-b bg-violet-50/80 dark:bg-violet-950/30">
                           <td colSpan={8} className="px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-1">
                              {group.categoryId === SURCHARGE_CATEGORY_ID ? (
                                <span className="w-56 px-1 text-[11px] font-bold uppercase text-violet-700 dark:text-violet-300">
                                  {t("finance.surcharge")}
                                </span>
                              ) : (
                                <SearchableSelect
                                  value={group.categoryId}
                                  onChange={value => {
                                    const defaultVatRate = getCategoryVatRate(value);
                                    setProducts(prev => prev.map(product => product.categoryId === group.categoryId ? {
                                      ...product,
                                      categoryId: value,
                                      vatRate: defaultVatRate,
                                      vatAmountOverride: undefined,
                                      packageId: null,
                                      packageType: null,
                                      name: getDefaultInvoiceItemName(value, allCategories, t("finance.surcharge")),
                                      storeProductId: null,
                                      storeProductCode: null,
                                      warehouseId: null,
                                      warehouseName: null,
                                      stockAvailable: undefined,
                                    } : product));
                                    setDeduction(0);
                                  }}
                                  placeholder={t("finance.create.choose")}
                                  searchPlaceholder={t("finance.searchCategory")}
                                  options={categories.map((category: any) => ({ value: category.id, label: category.name }))}
                                  className="h-8 w-56 rounded-none border-0 bg-transparent px-1 text-[11px] font-bold uppercase text-violet-700 shadow-none focus-visible:ring-0 dark:text-violet-300"
                                  contentClassName="min-w-[220px]"
                                  data-testid={`select-group-category-${group.categoryId || "unassigned"}`}
                                />
                              )}
                              <Popover
                                open={categoryPickerOpenId === (group.categoryId || "unassigned")}
                                onOpenChange={isOpen => setCategoryPickerOpenId(isOpen ? (group.categoryId || "unassigned") : null)}
                              >
                                <PopoverTrigger asChild>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 shrink-0 text-green-600 hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-950"
                                    title={t("finance.create.addCategory")}
                                    aria-label={t("finance.create.addCategory")}
                                    data-testid={`button-add-category-${group.categoryId || "unassigned"}`}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent align="start" className="w-64 p-2">
                                  <p className="mb-2 px-2 text-xs font-medium text-muted-foreground">{t("finance.create.category")}</p>
                                  <div className="max-h-56 space-y-1 overflow-y-auto">
                                    {categories.map((category: any) => (
                                      <button
                                        key={category.id}
                                        type="button"
                                        className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                                        onClick={() => {
                                          if (!group.categoryId) {
                                            const defaultVatRate = getCategoryVatRate(category.id);
                                            setProducts(prev => prev.map(product => product.categoryId === group.categoryId
                                              ? {
                                                ...product,
                                                categoryId: category.id,
                                                name: getDefaultInvoiceItemName(category.id, allCategories, t("finance.surcharge")),
                                                vatRate: defaultVatRate,
                                                vatAmountOverride: undefined,
                                              }
                                              : product));
                                          } else {
                                            addProduct(category.id);
                                          }
                                          setCategoryPickerOpenId(null);
                                        }}
                                      >
                                        {category.name}
                                      </button>
                                    ))}
                                    <>
                                      <div className="my-1 border-t" />
                                      <button
                                        type="button"
                                        className="w-full rounded px-2 py-1.5 text-left text-xs font-medium text-orange-700 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-950/30"
                                        onClick={() => {
                                          if (!group.categoryId) {
                                            setProducts(prev => prev.map(product => product.categoryId === group.categoryId
                                              ? { ...product, categoryId: SURCHARGE_CATEGORY_ID, name: t("finance.surcharge") }
                                              : product));
                                          } else {
                                            addProduct(SURCHARGE_CATEGORY_ID);
                                          }
                                          setCategoryPickerOpenId(null);
                                        }}
                                        data-testid="button-add-surcharge-category"
                                      >
                                        {t("finance.surcharge")}
                                      </button>
                                    </>
                                  </div>
                                </PopoverContent>
                              </Popover>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 shrink-0 gap-1 border-violet-200 bg-white text-[11px] text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-background dark:text-violet-300"
                                onClick={() => {
                                  if (!group.categoryId) return;
                                  const categoryName = String(allCategories.find((category: any) => category.id === group.categoryId)?.name ?? "").toLowerCase();
                                  if (
                                    group.categoryId === SURCHARGE_CATEGORY_ID ||
                                    categoryName.includes("học phí") ||
                                    categoryName.includes("kho")
                                  ) {
                                    if (group.categoryId === SURCHARGE_CATEGORY_ID) {
                                      addStandaloneSurcharge();
                                    } else {
                                      setProductPickerCategoryId(group.categoryId);
                                      setProductPickerSearch("");
                                      setSurchargeSearch("");
                                      if (categoryName.includes("kho")) {
                                        setKhoSearch("");
                                        setKhoPickerOpen(`category-picker:${group.categoryId}`);
                                      }
                                    }
                                  } else {
                                    addProduct(group.categoryId);
                                  }
                                }}
                                disabled={!group.categoryId}
                                data-testid={`button-add-product-to-category-${group.categoryId || "unassigned"}`}
                              >
                                <Plus className="h-3 w-3" /> {group.categoryId === SURCHARGE_CATEGORY_ID ? `${t("finance.add")} ${t("finance.surcharge").toLowerCase()}` : t("finance.addProduct")}
                              </Button>
                              <Dialog
                                open={productPickerCategoryId === group.categoryId}
                                onOpenChange={isOpen => {
                                  if (!isOpen) closeProductPicker();
                                }}
                              >
                                <DialogContent className="max-w-md">
                                  <DialogHeader>
                                    <DialogTitle>
                                      {group.categoryId === SURCHARGE_CATEGORY_ID
                                        ? t("finance.create.chooseSurcharge")
                                        : allCategories.find((category: any) => category.id === group.categoryId)?.name?.toLowerCase().includes("học phí")
                                          ? t("finance.create.choosePackage")
                                          : t("finance.create.searchInventory")}
                                    </DialogTitle>
                                  </DialogHeader>
                                  {group.categoryId === SURCHARGE_CATEGORY_ID ? (
                                    <>
                                      <Input
                                        value={surchargeSearch}
                                        onChange={event => setSurchargeSearch(event.target.value)}
                                        placeholder={t("finance.create.searchSurcharge")}
                                        className="h-9"
                                        autoFocus
                                      />
                                      <div className="max-h-72 space-y-1 overflow-y-auto">
                                        {filteredSurchargeOptions.length === 0 ? (
                                          <p className="py-4 text-center text-xs text-muted-foreground">{t("finance.create.noSurcharge")}</p>
                                        ) : filteredSurchargeOptions.map((option: any) => (
                                          <button
                                            key={option.id}
                                            type="button"
                                            className="w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                                            onClick={() => addSelectedSurcharge(option)}
                                          >
                                            <span className="block font-medium">{option.name}</span>
                                            <span className="block text-xs text-muted-foreground">
                                              {option.valueType === "percent"
                                                ? `${parseFloat(option.valueAmount || "0") || 0}%`
                                                : fmtMoney(parseFloat(option.valueAmount || "0") || 0)}
                                            </span>
                                          </button>
                                        ))}
                                      </div>
                                    </>
                                  ) : allCategories.find((category: any) => category.id === group.categoryId)?.name?.toLowerCase().includes("học phí") ? (
                                    <>
                                      <Input
                                        value={productPickerSearch}
                                        onChange={event => setProductPickerSearch(event.target.value)}
                                        placeholder={t("finance.searchCourse")}
                                        className="h-9"
                                        autoFocus
                                      />
                                      <div className="max-h-72 space-y-1 overflow-y-auto">
                                        {feePackages
                                          .filter((pkg: any) => !productPickerSearch || normalizeSearchText(`${pkg.name} ${pkg.courseName}`).includes(normalizeSearchText(productPickerSearch)))
                                          .map((pkg: any) => (
                                            <button
                                              key={pkg.id}
                                              type="button"
                                              className="w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                                              onClick={() => addSelectedFeePackage(pkg, group.categoryId)}
                                            >
                                              <span className="block font-medium">{pkg.name}</span>
                                              <span className="block text-xs text-muted-foreground">
                                                {pkg.courseName ? `${pkg.courseName} · ` : ""}{fmtMoney(parseFloat(pkg.totalAmount || pkg.fee || "0") || 0)}
                                              </span>
                                            </button>
                                          ))}
                                        {feePackages.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">{t("finance.create.noProducts")}</p>}
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <Input
                                        value={khoSearch}
                                        onChange={event => setKhoSearch(event.target.value)}
                                        placeholder={t("finance.create.searchInventory")}
                                        className="h-9"
                                        autoFocus
                                      />
                                      <div className="max-h-72 space-y-1 overflow-y-auto">
                                        {!locationId ? (
                                          <p className="py-4 text-center text-xs text-muted-foreground">{t("finance.create.chooseBranchFirst")}</p>
                                        ) : isFetchingKhoProducts && khoProducts.length === 0 ? (
                                          <p className="py-4 text-center text-xs text-muted-foreground">{t("finance.loading")}</p>
                                        ) : khoProducts.length === 0 ? (
                                          <p className="py-4 text-center text-xs text-muted-foreground">{t("finance.create.noProducts")}</p>
                                        ) : khoProducts.map((product: any) => (
                                          <button
                                            key={`${product.id}-${product.warehouse_id}`}
                                            type="button"
                                            className="w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                                            onClick={() => addSelectedInventoryProduct(product, group.categoryId)}
                                          >
                                            <span className="block font-medium">{product.name} <span className="text-muted-foreground">({product.code})</span></span>
                                             <span className="mt-0.5 flex justify-between text-xs text-muted-foreground">
                                               <span className="truncate">{product.warehouse_name || "Kho"}</span>
                                               <span className="ml-2 flex-shrink-0">{t("finance.stock")}: {product.stock} | {fmtMoney(parseFloat(product.sale_price) || 0)}</span>
                                             </span>
                                          </button>
                                        ))}
                                      </div>
                                    </>
                                  )}
                                </DialogContent>
                              </Dialog>
                            </div>
                          </td>
                        </tr>
                        {group.rows.map(p => {
                      const isKhoa = p.packageType === "khoá";
                      const isProductHocPhi = allCategories.find((c: any) => c.id === p.categoryId)?.name?.toLowerCase().includes("học phí");
                      const base = calcBase(p);
                      const promotionResult = applySequentialAdjustments(
                        base,
                        p.promotionKeys,
                        p.manualPromotionRows,
                        promotionOptionsWithVouchers,
                        "promotion",
                      );
                      const surchargeResult = applySequentialAdjustments(
                        promotionResult.finalAmount,
                        p.surchargeKeys,
                        p.manualSurchargeRows,
                        surchargeOptions,
                        "surcharge",
                      );
                      const promoAmt = promotionResult.adjustmentAmount;
                      const surchargeAmt = surchargeResult.adjustmentAmount;
                       // Keep the surcharge in the existing calculations, but display it
                       // separately below so the product row itself remains clear.
                       const subtotal = promotionResult.finalAmount;
                       const vatAmount = p.vatAmountOverride !== undefined && promoAmt === 0
                         ? p.vatAmountOverride
                         : calculateInvoiceVatAmount(subtotal, p.vatRate);
                      return (
                        <Fragment key={p.id}>
                        <tr className="border-b last:border-0">
                          <td className="p-2">
                            {(() => {
                              const catName = allCategories.find((c: any) => c.id === p.categoryId)?.name ?? "";
                              const isProductKho = catName.toLowerCase().includes("kho");
                              if (isProductHocPhi) {
                                const currentPackageIsMissing = Boolean(
                                  p.packageId &&
                                  p.name &&
                                  !feePackages.find((fp: any) => fp.id === p.packageId),
                                );
                                const packageOptions = [
                                  ...(currentPackageIsMissing
                                    ? [{ value: p.packageId as string, label: p.name }]
                                    : []),
                                  ...feePackages.map((fp: any) => ({
                                    value: fp.id,
                                    label: fp.name,
                                    sublabel: fp.courseName || undefined,
                                  })),
                                ];
                                return (
                                  <SearchableSelect
                                    value={p.packageId ?? feePackages.find((fp: any) => fp.name === p.name)?.id ?? ""}
                                    onChange={v => handleSelectFeePackage(p.id, v)}
                                    disabled={isFetchingFeePackages}
                                     placeholder={t("finance.create.choosePackage")}
                                     searchPlaceholder={t("finance.searchCourse")}
                                    options={packageOptions}
                                    className="h-8 rounded-none border-0 border-b border-border bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
                                    contentClassName="min-w-[280px]"
                                    data-testid={`select-fee-package-${p.id}`}
                                  />
                                );
                              }
                              if (isProductKho) {
                                return (
                                  <Popover open={khoPickerOpen === p.id} onOpenChange={v => { setKhoPickerOpen(v ? p.id : null); if (!v) setKhoSearch(""); }}>
                                    <PopoverTrigger asChild>
                                      <button className="w-full h-8 flex items-center justify-between px-1 rounded-none border-0 border-b border-border bg-transparent hover:border-purple-400 transition-colors text-[11px] text-left">
                                        <span className={p.name ? "text-foreground truncate" : "text-muted-foreground"}>
                                          {p.name || t("finance.chooseInventoryProduct")}
                                        </span>
                                        <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-72 p-2" align="start">
                                      <div className="mb-2 relative">
                                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                        <Input
                                          className="h-8 text-xs pl-7"
                                           placeholder={t("finance.create.searchInventory")}
                                          value={khoSearch}
                                          onChange={e => setKhoSearch(e.target.value)}
                                          autoFocus
                                        />
                                      </div>
                                      <div className="max-h-52 overflow-y-auto space-y-0.5">
                                        {!locationId ? (
                                           <p className="text-xs text-center text-muted-foreground py-4">{t("finance.create.chooseBranchFirst")}</p>
                                        ) : khoProducts.length === 0 ? (
                                           <p className="text-xs text-center text-muted-foreground py-4">{t("finance.create.noProducts")}</p>
                                        ) : khoProducts.map((prod: any) => (
                                          <button
                                            key={`${prod.id}-${prod.warehouse_id}`}
                                            className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/60 cursor-pointer transition-colors"
                                            onClick={() => {
                                              setProducts(prev => prev.map(x => x.id === p.id ? {
                                                ...x,
                                                name: prod.name,
                                                unitPrice: parseFloat(prod.sale_price) || 0,
                                                storeProductId: prod.id,
                                                storeProductCode: prod.code,
                                                warehouseId: prod.warehouse_id,
                                                warehouseName: prod.warehouse_name ?? null,
                                                stockAvailable: parseInt(String(prod.stock)) || 0,
                                              } : x));
                                              setKhoPickerOpen(null);
                                              setKhoSearch("");
                                            }}
                                          >
                                            <div className="font-medium">{prod.name} <span className="text-muted-foreground font-normal">({prod.code})</span></div>
                                            <div className="text-muted-foreground flex justify-between mt-0.5">
                                              <span className="truncate">{prod.warehouse_name || "Kho"}</span>
                                               <span className="ml-2 flex-shrink-0">{t("finance.stock")}: {prod.stock} | {fmtMoney(parseFloat(prod.sale_price) || 0)}</span>
                                            </div>
                                          </button>
                                        ))}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                );
                              }
                              return (
                                <Input
                                  className="h-8 rounded-none border-0 border-b border-border bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
                                   placeholder={t("finance.create.serviceName")}
                                  value={p.name}
                                  onChange={e => setProducts(prev => prev.map(x => x.id === p.id ? { ...x, name: e.target.value } : x))}
                                />
                              );
                            })()}
                            {isKhoa && (
                              <p className="mt-0.5 whitespace-nowrap text-[9px] leading-tight text-amber-600">
                                {t("finance.create.coursePackageNote")}
                              </p>
                            )}
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              value={p.unitPrice}
                              readOnly={isKhoa}
                              onChange={e => !isKhoa && setProducts(prev => prev.map(x => x.id === p.id ? { ...x, unitPrice: Number(e.target.value), vatAmountOverride: undefined } : x))}
                              onFocus={e => e.target.select()}
                              className={`h-8 rounded-none border-0 border-b border-border bg-transparent text-[11px] text-right px-1.5 shadow-none focus-visible:ring-0 ${isKhoa ? "bg-muted/40 cursor-not-allowed opacity-70" : ""}`}
                               title={isKhoa ? t("finance.fixedCoursePrice") : undefined}
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              min={1}
                              value={p.quantity}
                              onChange={e => setProducts(prev => prev.map(x => x.id === p.id ? { ...x, quantity: Number(e.target.value), vatAmountOverride: undefined } : x))}
                              onFocus={e => e.target.select()}
                              className="h-8 rounded-none border-0 border-b border-border bg-transparent text-[11px] text-center px-1 shadow-none focus-visible:ring-0"
                            />
                          </td>
                          <td className="p-2">
                            <Dialog open={openPromoId === p.id} onOpenChange={v => {
                              setOpenPromoId(v ? p.id : null);
                              if (v) {
                                setPromotionSearch("");
                                setProducts(prev => prev.map(x => x.id === p.id
                                  ? { ...x, manualPromotionRows: ensureAdjustmentRows(x.promotionKeys, x.manualPromotionRows, `manual-promo-${x.id}`) }
                                  : x));
                              } else {
                                setOpenProductPromoPicker(null);
                              }
                            }}>
                              <DialogTrigger asChild>
                                <button className="w-full h-8 flex items-center justify-end gap-1 px-1 rounded-none border-0 border-b border-border bg-transparent hover:border-purple-400 transition-colors text-[10px]">
                                  <span className={`flex-1 text-right ${promoAmt > 0 ? "text-green-600 font-semibold" : "text-muted-foreground"}`}>
                                    {promoAmt > 0 ? `-${fmtMoney(promoAmt)}` : t("finance.create.choose")}
                                  </span>
                                  <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                </button>
                              </DialogTrigger>
                             {hasAvailableVouchers && (
                               <span className="mt-0.5 block text-[9px] leading-tight text-red-500">
                                 {t("finance.create.availableVoucher")}
                               </span>
                             )}
                                 <DialogContent
                                   className="w-[min(94vw,52rem)] max-h-[90vh] overflow-y-auto rounded-xl p-6"
                                  overlayClassName="bg-black/30 backdrop-blur-[1px]"
                                >
                                 <div className="flex items-center justify-between gap-2 mb-2">
                                    <DialogTitle className="text-xl font-semibold">{t("finance.create.choosePromotion")}</DialogTitle>
                                   {canCreatePromotion && (
                                     <button
                                       type="button"
                                       className="inline-flex items-center gap-0.5 text-[11px] font-medium text-purple-600 hover:text-purple-700"
                                       onClick={() => openQuickCreate("promotion", { scope: "product", productId: p.id })}
                                       data-testid={`button-quick-add-promotion-${p.id}`}
                                     >
                                       <Plus className="h-3 w-3" /> {t("finance.addNew")}
                                     </button>
                                   )}
                                 </div>

                                 <div className="mt-3 space-y-4">
                                   {p.manualPromotionRows.map(row => {
                                     const pickerId = `${p.id}:${row.id}`;
                                     const selectedOption = promotionOptionsWithVouchers.find((o: any) => o.id === row.optionKey);
                                     return (
                                       <div key={row.id} className="space-y-2 rounded-lg border border-muted p-2">
                                         <Popover open={openProductPromoPicker === pickerId} onOpenChange={v => {
                                           setOpenProductPromoPicker(v ? pickerId : null);
                                           if (v) setPromotionSearch("");
                                         }}>
                                           <PopoverTrigger asChild>
                                             <button
                                               type="button"
                                               className="w-full min-h-9 flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5 text-left text-xs hover:border-purple-400"
                                             >
                                               <span className={selectedOption ? "truncate" : "text-muted-foreground"}>
                                                 {selectedOption ? formatPromotionLabel(selectedOption) : t("finance.create.choosePromotion")}
                                               </span>
                                               <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                             </button>
                                           </PopoverTrigger>
                                           <PopoverContent className="w-[26rem] max-w-[calc(100vw-2rem)] p-3" align="start">
                                             <div className="mb-2 relative">
                                               <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                               <Input
                                                 value={promotionSearch}
                                                 onChange={e => setPromotionSearch(e.target.value)}
                                                 placeholder={t("finance.create.searchPromotion")}
                                                 className="h-8 pl-7 text-xs"
                                                 autoFocus
                                                 onKeyDown={e => e.stopPropagation()}
                                               />
                                             </div>
                                             <div className="max-h-64 overflow-y-auto space-y-1">
                                               {promotionOptionsWithVouchers.length === 0 ? (
                                                 <p className="py-3 text-center text-xs text-muted-foreground">{t("finance.create.noPromotion")}</p>
                                               ) : filteredPromotionOptionsWithVouchers.length === 0 ? (
                                                 <p className="py-3 text-center text-xs text-muted-foreground">{t("finance.create.promotionNotFound")}</p>
                                               ) : filteredPromotionOptionsWithVouchers.map((o: any) => {
                                                 const val = parseFloat(o.valueAmount || "0");
                                                 return (
                                                   <button
                                                     key={o.id}
                                                     type="button"
                                                     className="w-full flex items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-muted/60"
                                                     onClick={() => {
                                                       selectProductAdjustmentOption(p.id, "promotion", row.id, o.id);
                                                       setOpenProductPromoPicker(null);
                                                     }}
                                                   >
                                                     <span className="min-w-0 flex-1">
                                                       <span className="flex items-center gap-1 text-xs font-medium">
                                                         {o.kind === "voucher" && (
                                                           <span className="shrink-0 rounded bg-red-100 px-1 text-[9px] font-semibold text-red-600">Voucher</span>
                                                         )}
                                                         <span className="truncate">{o.name}</span>
                                                       </span>
                                                       <span className="block text-xs text-muted-foreground">
                                                         -{o.valueType === "percent" ? `${val}%` : fmtMoney(val)}
                                                       </span>
                                                     </span>
                                                   </button>
                                                 );
                                               })}
                                             </div>
                                           </PopoverContent>
                                         </Popover>
                                          <div className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap">
                                           <select
                                             value={row.valueType}
                                             onChange={e => updateManualAdjustmentRow(p.id, "promotion", row.id, { valueType: e.target.value as ManualAdjustment["valueType"] })}
                                             className="h-8 w-24 rounded-md border bg-background px-2 text-xs"
                                           >
                                             <option value="amount">{t("finance.create.amountType")}</option>
                                             <option value="percent">{t("finance.create.percentType")}</option>
                                           </select>
                                           <div className="relative min-w-0 flex-1">
                                             <Input
                                               type="number"
                                               min={0}
                                               value={row.value || ""}
                                               onChange={e => updateManualAdjustmentRow(p.id, "promotion", row.id, { value: Math.max(0, Number(e.target.value) || 0) })}
                                               placeholder={t("finance.create.quickEnter")}
                                               className="h-8 pr-8 text-xs"
                                             />
                                             <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                                               {row.valueType === "percent" ? "%" : "₫"}
                                             </span>
                                           </div>
                                            <Input
                                              value={row.name ?? ""}
                                              onChange={e => updateManualAdjustmentRow(p.id, "promotion", row.id, { name: e.target.value })}
                                              placeholder="Nhập tên khuyến mãi..."
                                              aria-label="Tên khuyến mãi nhập tay"
                                              maxLength={120}
                                              className="h-8 min-w-0 flex-1 text-xs"
                                              data-testid={`input-product-promotion-name-${row.id}`}
                                            />
                                           <button
                                             type="button"
                                             className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                                             onClick={() => removeManualAdjustmentRow(p.id, "promotion", row.id)}
                                             aria-label={t("finance.create.removeAdjustment", { type: t("finance.promotion").toLowerCase() })}
                                           >
                                             <X className="h-4 w-4" />
                                           </button>
                                         </div>
                                       </div>
                                     );
                                   })}
                                   <button
                                     type="button"
                                     className="text-xs font-medium text-purple-600 hover:text-purple-700"
                                     onClick={() => addManualAdjustmentRow(p.id, "promotion")}
                                   >
                                     + {t("finance.add")}
                                   </button>
                                 </div>
                                 <div className="mt-3 flex justify-between border-t pt-2 text-xs font-semibold">
                                   <span>{t("finance.create.totalPromotion")}</span>
                                   <span className="text-green-600">-{fmtMoney(promoAmt)}</span>
                                 </div>
                                </DialogContent>
                              </Dialog>
                          </td>
                          <td className="hidden">
                            <Dialog open={openSurchargeId === p.id} onOpenChange={v => {
                              setOpenSurchargeId(v ? p.id : null);
                              if (v) {
                                setSurchargeSearch("");
                                setProducts(prev => prev.map(x => x.id === p.id
                                  ? { ...x, manualSurchargeRows: ensureAdjustmentRows(x.surchargeKeys, x.manualSurchargeRows, `manual-surcharge-${x.id}`) }
                                  : x));
                              } else {
                                setOpenProductSurchargePicker(null);
                              }
                            }}>
                                <DialogContent
                                  className="w-[min(92vw,40rem)] max-h-[90vh] overflow-y-auto rounded-xl p-6"
                                  overlayClassName="bg-black/30 backdrop-blur-[1px]"
                                >
                                 <div className="flex items-center justify-between gap-2 mb-2">
                                   <DialogTitle className="text-xl font-semibold">{t("finance.create.chooseSurcharge")}</DialogTitle>
                                   {canCreatePromotion && (
                                     <button
                                       type="button"
                                       className="inline-flex items-center gap-0.5 text-[11px] font-medium text-purple-600 hover:text-purple-700"
                                       onClick={() => openQuickCreate("surcharge", { scope: "product", productId: p.id })}
                                       data-testid={`button-quick-add-surcharge-${p.id}`}
                                     >
                                       <Plus className="h-3 w-3" /> {t("finance.addNew")}
                                     </button>
                                   )}
                                 </div>

                                  <div className="mt-3 space-y-4">
                                    {p.manualSurchargeRows.map(row => {
                                      const pickerId = `${p.id}:${row.id}`;
                                      const selectedOption = surchargeOptions.find((o: any) => o.id === row.optionKey);
                                      return (
                                        <div key={row.id} className="space-y-2 rounded-lg border border-muted p-2">
                                          <Popover open={openProductSurchargePicker === pickerId} onOpenChange={v => {
                                            setOpenProductSurchargePicker(v ? pickerId : null);
                                            if (v) setSurchargeSearch("");
                                          }}>
                                            <PopoverTrigger asChild>
                                              <button
                                                type="button"
                                                className="w-full min-h-9 flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5 text-left text-xs hover:border-purple-400"
                                              >
                                                <span className={selectedOption ? "truncate" : "text-muted-foreground"}>
                                                  {selectedOption ? selectedOption.name : t("finance.create.chooseSurcharge")}
                                                </span>
                                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                              </button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-[28rem] max-w-[calc(100vw-2rem)] p-3" align="start">
                                              <div className="mb-2 relative">
                                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                                <Input
                                                  value={surchargeSearch}
                                                  onChange={e => setSurchargeSearch(e.target.value)}
                                                  placeholder={t("finance.create.searchSurcharge")}
                                                  className="h-8 pl-7 text-xs"
                                                  autoFocus
                                                  onKeyDown={e => e.stopPropagation()}
                                                />
                                              </div>
                                              <div className="max-h-64 overflow-y-auto space-y-1">
                                                {surchargeOptions.length === 0 ? (
                                                  <p className="py-3 text-center text-xs text-muted-foreground">{t("finance.create.noSurcharge")}</p>
                                                ) : filteredSurchargeOptions.length === 0 ? (
                                                  <p className="py-3 text-center text-xs text-muted-foreground">{t("finance.create.surchargeNotFound")}</p>
                                                ) : filteredSurchargeOptions.map((o: any) => {
                                                  const val = parseFloat(o.valueAmount || "0");
                                                  return (
                                                    <button
                                                      key={o.id}
                                                      type="button"
                                                      className="w-full flex items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-muted/60"
                                                      onClick={() => {
                                                        selectProductAdjustmentOption(p.id, "surcharge", row.id, o.id);
                                                        setOpenProductSurchargePicker(null);
                                                      }}
                                                    >
                                                      <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-xs font-medium">{o.name}</span>
                                                         <span className="block text-xs text-muted-foreground">
                                                           +{o.valueType === "percent" ? `${val}%` : fmtMoney(val)}
                                                         </span>
                                                      </span>
                                                    </button>
                                                  );
                                                })}
                                              </div>
                                            </PopoverContent>
                                          </Popover>
                                          <div className="flex items-center gap-1.5">
                                            <select
                                              value={row.valueType}
                                              onChange={e => updateManualAdjustmentRow(p.id, "surcharge", row.id, { valueType: e.target.value as ManualAdjustment["valueType"] })}
                                              className="h-8 w-24 rounded-md border bg-background px-2 text-xs"
                                            >
                                              <option value="amount">{t("finance.create.amountType")}</option>
                                              <option value="percent">{t("finance.create.percentType")}</option>
                                            </select>
                                            <div className="relative min-w-0 flex-1">
                                              <Input
                                                type="number"
                                                min={0}
                                                value={row.value || ""}
                                                onChange={e => updateManualAdjustmentRow(p.id, "surcharge", row.id, { value: Math.max(0, Number(e.target.value) || 0) })}
                                                placeholder={t("finance.create.quickEnter")}
                                                className="h-8 pr-8 text-xs"
                                              />
                                              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                                                {row.valueType === "percent" ? "%" : "₫"}
                                              </span>
                                            </div>
                                            <button
                                              type="button"
                                              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                                              onClick={() => removeManualAdjustmentRow(p.id, "surcharge", row.id)}
                                              aria-label={t("finance.create.removeAdjustment", { type: t("finance.surcharge").toLowerCase() })}
                                            >
                                              <X className="h-4 w-4" />
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                   <button
                                     type="button"
                                     className="text-xs font-medium text-purple-600 hover:text-purple-700"
                                     onClick={() => addManualAdjustmentRow(p.id, "surcharge")}
                                   >
                                     + {t("finance.add")}
                                   </button>
                                 </div>
                                 <div className="mt-3 flex justify-between border-t pt-2 text-xs font-semibold">
                                   <span>{t("finance.create.totalSurcharge")}</span>
                                   <span className="text-orange-600">+{fmtMoney(surchargeAmt)}</span>
                                 </div>
                                </DialogContent>
                              </Dialog>
                          </td>
                          <td className="p-2">
                            <div className="flex h-8 items-center justify-end text-right text-xs font-semibold">
                              {fmtMoney(subtotal)}
                            </div>
                          </td>
                          <td className="p-2 align-top">
                            <Select
                              value={String(p.vatRate)}
                              onValueChange={value => setProducts(prev => prev.map(x => x.id === p.id ? { ...x, vatRate: Number(value), vatAmountOverride: undefined } : x))}
                            >
                              <SelectTrigger className="h-8 justify-end rounded-none border-0 border-b border-border bg-transparent px-1.5 text-right text-[11px] shadow-none focus:ring-0" data-testid={`select-vat-rate-${p.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {INVOICE_VAT_RATES.map(rate => (
                                  <SelectItem key={rate} value={String(rate)}>{rate}%</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="mt-0.5 whitespace-nowrap text-right text-[9px] leading-tight text-muted-foreground">
                              {t("finance.taxAmount")}: {fmtMoney(vatAmount)}
                            </p>
                          </td>
                          <td className="p-2">
                            <div className="flex h-8 items-center justify-end text-right text-xs font-semibold">
                              {fmtMoney(subtotal + vatAmount)}
                            </div>
                          </td>
                          <td className="p-2 text-center">
                            <button
                              onClick={() => removeProduct(p.id)}
                              disabled={products.length === 1}
                              className="text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                        </Fragment>
                      );
                        })}
                      </Fragment>
                    ))}
                    {false && showSurchargeGroup && (
                      <Fragment key="category-surcharge">
                        <tr className="border-b bg-violet-50/80 dark:bg-violet-950/30">
                          <td colSpan={8} className="px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-1">
                                <span className="w-56 px-1 text-[11px] font-bold uppercase text-violet-700 dark:text-violet-300">
                                  {t("finance.surcharge")}
                                </span>
                                <Popover
                                  open={categoryPickerOpenId === "__surcharge__"}
                                  onOpenChange={isOpen => setCategoryPickerOpenId(isOpen ? "__surcharge__" : null)}
                                >
                                  <PopoverTrigger asChild>
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 shrink-0 text-green-600 hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-950"
                                      title={t("finance.add")}
                                      aria-label={t("finance.add")}
                                      data-testid="button-add-surcharge-row"
                                    >
                                      <Plus className="h-4 w-4" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent align="start" className="w-64 p-2">
                                    <p className="mb-2 px-2 text-xs font-medium text-muted-foreground">{t("finance.create.category")}</p>
                                    <div className="max-h-56 space-y-1 overflow-y-auto">
                                      {categories.map((category: any) => (
                                        <button
                                          key={category.id}
                                          type="button"
                                          className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                                          onClick={() => {
                                            addProduct(category.id);
                                            setCategoryPickerOpenId(null);
                                          }}
                                        >
                                          {category.name}
                                        </button>
                                      ))}
                                      <div className="my-1 border-t" />
                                      <button
                                        type="button"
                                        className="w-full rounded px-2 py-1.5 text-left text-xs font-medium text-orange-700 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-950/30"
                                        onClick={() => {
                                          setIsSurchargeGroupVisible(true);
                                          setCategoryPickerOpenId(null);
                                        }}
                                        data-testid="button-add-surcharge-category-from-surcharge-group"
                                      >
                                        {t("finance.surcharge")}
                                      </button>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-semibold text-orange-600">+{fmtMoney(itemSurcharge)}</span>
                                <Dialog open={surchargeSourcePickerOpen} onOpenChange={setSurchargeSourcePickerOpen}>
                                  <DialogTrigger asChild>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-7 shrink-0 gap-1 border-violet-200 bg-white text-[11px] text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-background dark:text-violet-300"
                                      data-testid="button-add-surcharge-to-group"
                                    >
                                      <Plus className="h-3 w-3" /> {t("finance.add")} {t("finance.surcharge").toLowerCase()}
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-md">
                                    <DialogHeader>
                                      <DialogTitle>{t("finance.create.chooseSurcharge")}</DialogTitle>
                                    </DialogHeader>
                                    <div className="max-h-72 space-y-1 overflow-y-auto">
                                      {products.map(product => (
                                        <button
                                          key={product.id}
                                          type="button"
                                          className="w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                                          onClick={() => addSurchargeForProduct(product.id)}
                                        >
                                          <span className="block truncate font-medium">{product.name || t("finance.create.packageName")}</span>
                                          <span className="block text-xs text-muted-foreground">{t("finance.vat")} {product.vatRate}%</span>
                                        </button>
                                      ))}
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              </div>
                            </div>
                          </td>
                        </tr>
                        {surchargeDisplayRows.length === 0 ? (
                          <tr className="border-b">
                            <td colSpan={8} className="p-3 text-xs text-muted-foreground">{t("finance.create.noSurcharge")}</td>
                          </tr>
                        ) : surchargeDisplayRows.map(row => (
                          <tr key={`surcharge-${row.id}`} className="border-b last:border-0">
                            <td className="p-2">
                              <span className="text-xs font-medium">{row.name}</span>
                              <p className="mt-0.5 text-[10px] text-muted-foreground">{row.productName || t("finance.create.packageName")}</p>
                            </td>
                            <td className="p-2 text-right">{fmtMoney(row.amount)}</td>
                            <td className="p-2 text-center">1</td>
                            <td className="p-2 text-right text-muted-foreground">—</td>
                            <td className="p-2 text-right font-semibold">{fmtMoney(row.amount)}</td>
                            <td className="p-2 text-center">
                              {row.vatRate}%
                              <p className="mt-0.5 whitespace-nowrap text-[9px] text-muted-foreground">{t("finance.taxAmount")}: {fmtMoney(row.vatAmount)}</p>
                            </td>
                            <td className="p-2 text-right font-semibold">{fmtMoney(row.amount + row.vatAmount)}</td>
                            <td className="p-1 text-center" />
                          </tr>
                        ))}
                      </Fragment>
                    )}
                    {invoiceSurchargeAmt > 0 && (
                      <tr className="border-b bg-orange-50/40 dark:bg-orange-950/10" data-testid="row-invoice-wide-surcharge">
                        <td className="p-2">
                          <span className="text-xs font-medium">{invoiceSurchargeDisplayName}</span>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">{t("finance.create.invoiceWideSurcharge")}</p>
                        </td>
                        <td className="p-2 text-right">{fmtMoney(invoiceSurchargeAmt)}</td>
                        <td className="p-2 text-center">1</td>
                        <td className="p-2 text-right text-muted-foreground">—</td>
                        <td className="p-2 text-right font-semibold">{fmtMoney(invoiceSurchargeAmt)}</td>
                        <td className="p-2 text-center">
                          0%
                          <p className="mt-0.5 whitespace-nowrap text-[9px] text-muted-foreground">{t("finance.taxAmount")}: {fmtMoney(0)}</p>
                        </td>
                        <td className="p-2 text-right font-semibold">{fmtMoney(invoiceSurchargeAmt)}</td>
                        <td className="p-1 text-center" />
                      </tr>
                    )}
                   </tbody>
                </table>
              </div>
            </div>

            <div className="hidden">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{t("finance.surcharge")}</span>
                <span className="text-sm font-semibold text-orange-600">+{fmtMoney(itemSurcharge)}</span>
              </div>
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full min-w-[940px] table-fixed text-xs [&_tbody_td]:align-top">
                  <colgroup>
                    <col style={{ width: "28%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "3%" }} />
                  </colgroup>
                  <thead className="bg-muted/60">
                    <tr className="border-b">
                      <th className="p-2 text-left font-semibold text-muted-foreground">{t("finance.create.packageName")}</th>
                      <th className="p-2 text-right font-semibold text-muted-foreground">{t("finance.unitPrice")}</th>
                      <th className="p-2 text-center font-semibold text-muted-foreground">{t("finance.create.quantity")}</th>
                      <th className="p-2 text-right font-semibold text-muted-foreground">{t("finance.promotion")}</th>
                      <th className="p-2 text-right font-semibold text-muted-foreground">{t("finance.lineTotal")}</th>
                      <th className="p-2 text-center font-semibold text-muted-foreground">{t("finance.vat")}</th>
                      <th className="p-2 text-right font-semibold text-muted-foreground">{t("finance.totalAfterVat")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(p => {
                      const promotionResult = applySequentialAdjustments(
                        calcBase(p),
                        p.promotionKeys,
                        p.manualPromotionRows,
                        promotionOptionsWithVouchers,
                        "promotion",
                      );
                      const rowsForDisplay = p.manualSurchargeRows.length > 0 || p.surchargeKeys.length > 0
                        ? ensureAdjustmentRows(p.surchargeKeys, p.manualSurchargeRows, `display-surcharge-${p.id}`)
                        : [];
                      const displayRows = rowsForDisplay
                        .map((row, index) => {
                          const previousRows = rowsForDisplay.slice(0, index);
                          const throughCurrentRows = rowsForDisplay.slice(0, index + 1);
                          const previousKeys = previousRows.map(item => item.optionKey).filter((key): key is string => Boolean(key));
                          const throughCurrentKeys = throughCurrentRows.map(item => item.optionKey).filter((key): key is string => Boolean(key));
                          const before = applySequentialAdjustments(
                            promotionResult.finalAmount,
                            previousKeys,
                            previousRows,
                            surchargeOptions,
                            "surcharge",
                          ).adjustmentAmount;
                          const throughCurrent = applySequentialAdjustments(
                            promotionResult.finalAmount,
                            throughCurrentKeys,
                            throughCurrentRows,
                            surchargeOptions,
                            "surcharge",
                          ).adjustmentAmount;
                          const amount = Math.max(0, throughCurrent - before);
                          const beforeVat = calculateInvoiceVatAmount(promotionResult.finalAmount + before, p.vatRate);
                          const throughCurrentVat = calculateInvoiceVatAmount(promotionResult.finalAmount + throughCurrent, p.vatRate);
                          return {
                            id: row.id,
                            name: row.optionKey
                              ? surchargeOptions.find((option: any) => option.id === row.optionKey)?.name ?? t("finance.surcharge")
                              : t("finance.surcharge"),
                            amount,
                            vatAmount: Math.max(0, throughCurrentVat - beforeVat),
                            hasValue: Boolean(row.optionKey) || row.value > 0,
                          };
                        })
                        .filter(row => row.amount > 0 || row.hasValue);
                      const actionButton = null;

                      if (displayRows.length === 0) {
                        return (
                          <tr key={`surcharge-empty-${p.id}`} className="border-b last:border-0">
                            <td className="p-2">
                              <span className="text-xs text-muted-foreground">{t("finance.create.noSurcharge")}</span>
                              <p className="mt-0.5 text-[10px] text-muted-foreground">{p.name || t("finance.create.packageName")} · {t("finance.vat")} {p.vatRate}%</p>
                            </td>
                            <td className="p-2 text-right text-muted-foreground">—</td>
                            <td className="p-2 text-center text-muted-foreground">—</td>
                            <td className="p-2 text-right text-muted-foreground">—</td>
                            <td className="p-2 text-right text-muted-foreground">—</td>
                            <td className="p-2 text-center text-muted-foreground">{p.vatRate}%</td>
                            <td className="p-2 text-right text-muted-foreground">—</td>
                            <td className="p-1 text-center">{actionButton}</td>
                          </tr>
                        );
                      }

                      return displayRows.map(row => (
                        <tr key={`surcharge-${p.id}-${row.id}`} className="border-b last:border-0">
                          <td className="p-2">
                            <span className="text-xs font-medium">{row.name}</span>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">{p.name || t("finance.create.packageName")}</p>
                          </td>
                          <td className="p-2 text-right">{fmtMoney(row.amount)}</td>
                          <td className="p-2 text-center">1</td>
                          <td className="p-2 text-right text-muted-foreground">—</td>
                          <td className="p-2 text-right font-semibold">{fmtMoney(row.amount)}</td>
                          <td className="p-2 text-center">
                            {p.vatRate}%
                            <p className="mt-0.5 whitespace-nowrap text-[9px] text-muted-foreground">{t("finance.taxAmount")}: {fmtMoney(row.vatAmount)}</p>
                          </td>
                          <td className="p-2 text-right font-semibold">{fmtMoney(row.amount + row.vatAmount)}</td>
                          <td className="p-1 text-center">{actionButton}</td>
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Note */}
            <div className={isPaidInvoiceLocked ? "relative z-30 space-y-1" : "space-y-1"}>
              <label className="text-xs font-medium text-muted-foreground">{t("finance.note")}</label>
              <Textarea
                placeholder={t("finance.notePlaceholder")}
                value={note}
                onChange={e => setNote(e.target.value)}
                className="text-sm resize-none"
                rows={3}
                data-testid="textarea-note"
              />
            </div>

            {/* Commission / Doanh thu tính hoa hồng */}
            <div className="space-y-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t("finance.commissionRevenue")}</label>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {t("finance.create.commissionDescription")}
                </p>
              </div>
              <Popover
                open={commissionStaffPickerOpen}
                onOpenChange={(nextOpen) => {
                  setCommissionStaffPickerOpen(nextOpen);
                  if (!nextOpen) setCommissionStaffSearch("");
                }}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full h-9 flex items-center justify-between px-3 rounded-md border bg-background text-sm hover:border-purple-400 transition-colors text-left"
                    data-testid="button-commission-staff-picker"
                  >
                    <span className="text-muted-foreground">{t("finance.create.chooseCommissionStaff")}</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-1" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(520px,calc(100vw-3rem))] p-2" align="start">
                  <div className="relative mb-2">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="h-8 text-xs pl-7"
                      placeholder={t("finance.create.commissionStaffSearch")}
                      value={commissionStaffSearch}
                      onChange={e => setCommissionStaffSearch(e.target.value)}
                      autoFocus
                      data-testid="input-commission-staff-search"
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-0.5">
                    {commissionStaffOptions.length === 0 ? (
                      <p className="text-xs text-center text-muted-foreground py-4">
                        {commissionStaffSearch ? t("finance.notFound") : t("finance.create.noMoreStaff")}
                      </p>
                    ) : commissionStaffOptions.map((s: any) => {
                      const isInactive = s.status === "Không hoạt động";
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={isInactive}
                          className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors flex items-center gap-1.5 ${isInactive ? "opacity-40 cursor-not-allowed" : "hover:bg-muted/60 cursor-pointer"}`}
                          onClick={() => {
                            if (isInactive) return;
                            setCommissions(prev => [...prev, { staffId: s.id, percentage: 100 }]);
                            setCommissionStaffPickerOpen(false);
                            setCommissionStaffSearch("");
                          }}
                        >
                          <span className="font-mono text-muted-foreground">[{s.code}]</span>
                          <span className="truncate">{s.fullName}</span>
                          {isInactive && <span className="text-amber-500 text-[10px] font-medium whitespace-nowrap">⚠ {t("finance.inactive")}</span>}
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>

              {commissions.length > 0 && (
                <div className="space-y-1.5">
                  <div className="grid items-center gap-2 text-[11px] text-muted-foreground sm:grid-cols-[minmax(0,1fr)_72px_130px_20px]">
                    <span>{t("finance.create.commissionStaff")}</span>
                    <span className="text-right">{t("finance.commissionRate")}</span>
                    <span className="text-right">{t("finance.create.commissionRevenueHeader")}</span>
                    <span />
                  </div>
                  {commissions.map((c) => {
                    const s = (staffList as any[]).find((s: any) => s.id === c.staffId);
                    const commissionRevenue = finalTotal * c.percentage / 100;
                    return (
                      <div key={c.staffId} className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_72px_130px_20px]">
                        <span className="min-w-0 truncate text-xs">{s?.fullName ?? c.staffId} <span className="text-muted-foreground">({s?.code ?? ""})</span></span>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={c.percentage}
                            onChange={e => {
                              const val = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                              setCommissions(prev => prev.map(x => x.staffId === c.staffId ? { ...x, percentage: val } : x));
                            }}
                            className="h-7 w-16 text-right text-xs"
                            aria-label={`${t("finance.commissionRate")} ${s?.fullName ?? c.staffId}`}
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                        <div className="text-right text-xs font-medium text-foreground" title={t("finance.create.commissionRateTitle")}>
                          {fmtMoney(commissionRevenue)} đ
                        </div>
                        <button
                          type="button"
                          onClick={() => setCommissions(prev => prev.filter(x => x.staffId !== c.staffId))}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={t("finance.removeNamed", { name: s?.fullName ?? c.staffId })}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div className="w-[400px] flex-shrink-0 overflow-y-auto px-5 py-4 space-y-4 bg-muted/20">
            <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
              <div className="space-y-1.5 text-sm">
                 <div className="flex justify-between text-muted-foreground">
                   <span>{t("finance.create.amount")}:</span>
                  <span className="font-medium text-foreground">{fmtMoney(totalAmount)}</span>
                </div>
                <Dialog open={openInvoicePromo} onOpenChange={v => {
                  setOpenInvoicePromo(v);
                  if (v) {
                    setPromotionSearch("");
                    setInvoicePromotionRows(prev => ensureAdjustmentRows(invoicePromoKeys, prev, "invoice-promo"));
                  } else {
                    setOpenInvoicePromoPicker(null);
                  }
                }}>
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      disabled={invoicePromotionVatLocked}
                      className="w-full flex justify-between items-center text-green-600 hover:bg-green-50 rounded px-1 -mx-1 py-0.5 transition-colors"
                      title={invoicePromotionVatMixed
                        ? t("finance.create.invoicePromotionMixedVat")
                        : !hasInvoicePromotionEligibleItems
                          ? t("finance.create.invoicePromotionNeedsItem")
                          : undefined}
                      data-testid="button-invoice-promo"
                    >
                      <span className="flex items-center gap-1">
                         {t("finance.promotion")}:
                        <ChevronDown className="h-3 w-3 opacity-60" />
                        {hasAvailableVouchers && (
                          <span className="ml-1 text-[10px] font-medium text-red-500">
                             {t("finance.availableVoucher")}
                          </span>
                        )}
                      </span>
                      <span>{totalPromo > 0 ? `-${fmtMoney(totalPromo)}` : "0 ₫"}</span>
                    </button>
                  </DialogTrigger>
                  <DialogContent
                    className="w-[min(94vw,52rem)] max-h-[90vh] overflow-y-auto rounded-xl p-6"
                    overlayClassName="bg-black/30 backdrop-blur-[1px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                       <DialogTitle className="text-xl font-semibold">{t("finance.create.choosePromotion")}</DialogTitle>
                      {canCreatePromotion && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-0.5 text-[11px] font-medium text-purple-600 hover:text-purple-700"
                          onClick={() => openQuickCreate("promotion", { scope: "invoice" })}
                          data-testid="button-quick-add-invoice-promotion"
                        >
                           <Plus className="h-3 w-3" /> {t("finance.addNew")}
                        </button>
                      )}
                    </div>
                    {renderInvoiceAdjustmentRows("promotion")}
                    {schedulePromotionTotal > 0 && (
                      <div
                        className="mt-4 rounded-lg border bg-muted/20 p-3"
                        data-testid="invoice-schedule-promotion-breakdown"
                      >
                        <p className="mb-2 text-sm font-semibold">
                          {t("finance.create.installmentPromotionBreakdown")}
                        </p>
                        <div className="space-y-1.5">
                          {paymentSchedule
                            .filter(entry => (entry.promotionAmount ?? 0) > 0)
                            .map(entry => {
                              const promotionLabels = (entry.promotionKeys ?? [])
                                .map(key => {
                                  const option = promotionOptionsWithVouchers.find((candidate: any) => candidate.id === key);
                                  return option ? formatPromotionLabel(option) : null;
                                })
                                .filter(Boolean);
                              return (
                                <div key={entry.id} className="flex justify-between gap-3 text-xs">
                                  <div className="min-w-0">
                                    <p className="truncate text-muted-foreground">
                                      {entry.label}{entry.code ? ` (${entry.code})` : ""}
                                    </p>
                                    {promotionLabels.length > 0 && (
                                      <p className="truncate text-[10px] text-muted-foreground/80">
                                        {promotionLabels.join(", ")}
                                      </p>
                                    )}
                                  </div>
                                  <span className="shrink-0 font-medium text-green-600">
                                    -{fmtMoney(entry.promotionAmount ?? 0)}
                                  </span>
                                </div>
                              );
                            })}
                        </div>
                        <div className="mt-2 flex justify-between border-t pt-2 text-xs font-semibold">
                          <span>{t("finance.create.totalPromotionIncludingInstallments")}</span>
                          <span className="text-green-600">-{fmtMoney(totalPromo)}</span>
                        </div>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
                {invoicePromotionVatMixed ? (
                  <p className="text-[10px] text-muted-foreground" data-testid="invoice-promotion-mixed-vat-hint">
                    {t("finance.create.invoicePromotionMixedVat")}
                  </p>
                ) : !hasInvoicePromotionEligibleItems ? (
                  <p className="text-[10px] text-muted-foreground" data-testid="invoice-promotion-needs-item-hint">
                    {t("finance.create.invoicePromotionNeedsItem")}
                  </p>
                ) : null}

                <div
                  className="w-full flex justify-between items-center text-orange-500 rounded px-1 -mx-1 py-0.5"
                  data-testid="button-invoice-surcharge"
                >
                  <span>{t("finance.surcharge")}:</span>
                  <span>{totalSurcharge > 0 ? `+${fmtMoney(totalSurcharge)}` : "0 ₫"}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{t("finance.create.totalVat")}:</span>
                  <span className="font-medium text-foreground">
                    {totalVat > 0 ? `+${fmtMoney(totalVat)}` : "0 ₫"}
                  </span>
                </div>
                <div className="flex justify-between font-semibold pt-1 border-t">
                   <span>{t("finance.create.totalAmount")}:</span>
                  <span>{fmtMoney(subTotal)}</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                     <span className="text-muted-foreground flex-shrink-0">{t("finance.create.deposit")}:</span>
                    <Input
                      type="number"
                      min={0}
                      max={studentId && datCocBalance > 0 ? Math.min(subTotal, datCocBalance) : subTotal}
                      value={deduction}
                      onChange={e => {
                        const maxDed = studentId && datCocBalance > 0
                          ? Math.min(subTotal, datCocBalance)
                          : subTotal;
                        setDeduction(Math.min(maxDed, Math.max(0, Number(e.target.value))));
                      }}
                      onFocus={e => e.target.select()}
                      className="h-7 text-xs text-right w-32 border-muted"
                      data-testid="input-deduction"
                    />
                  </div>
                  {studentId && datCocBalance > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-blue-600 bg-blue-50 rounded px-2 py-1">
                         <span>{t("finance.create.remainingDeposit")}</span>
                        <span className="font-semibold">{fmtMoney(Math.max(0, datCocBalance - deduction))}</span>
                      </div>
                      {deduction > 0 && isHocPhi && (
                         <p className="text-[10px] text-muted-foreground px-1">{t("finance.create.depositPriorityHint")}</p>
                      )}
                    </div>
                  )}
                  {studentId && datCocBalance <= 0 && studentWallet !== undefined && (
                     <p className="text-xs text-muted-foreground text-right">{t("finance.create.noDeposit")}</p>
                  )}
                </div>
                <div className="flex justify-between font-bold pt-1 border-t text-foreground">
                   <span>{t("finance.create.grandTotal")}:</span>
                  <span className="text-base">{fmtMoney(finalTotal)}</span>
                </div>
              </div>
              <div className="pt-2 border-t space-y-2">
                <div className="flex items-center justify-between gap-2 text-sm">
                   <span className="text-muted-foreground flex-shrink-0">{t("finance.create.paidAmount")}</span>
                  <Input
                    type="number"
                    min={0}
                    max={grandTotal}
                    value={directPaidAmount}
                    onChange={e => setDirectPaidAmount(Math.min(grandTotal, Math.max(0, Number(e.target.value))))}
                    onFocus={e => e.target.select()}
                    className="h-7 text-xs text-right font-bold text-blue-600 w-32 border-blue-200 focus-visible:ring-blue-400"
                    data-testid="input-direct-paid"
                  />
                </div>
                <div className="flex gap-2 items-end">
                    <div className="space-y-0.5 w-36 flex-shrink-0">
                       <span className="text-xs text-muted-foreground">{t("finance.create.method")}</span>
                       <Select value={directPaymentMethod} onValueChange={v => { setDirectPaymentMethod(v); if (v !== "transfer") setDirectBank(""); }}>
                        <SelectTrigger className="h-8 text-xs" data-testid="select-direct-payment-method"><SelectValue /></SelectTrigger>
                        <SelectContent>
                           <SelectItem value="cash">{t("finance.cash")}</SelectItem>
                           <SelectItem value="transfer">{t("finance.transfer")}</SelectItem>
                            <SelectItem value="deposit_wallet">{t("finance.depositWallet")}</SelectItem>
                            <SelectItem value="card">{t("finance.card")}</SelectItem>
                            <SelectItem value="installment">{t("finance.installmentPayment")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {directPaymentMethod === "transfer" && (
                      <div className="flex-1 space-y-0.5">
                         <span className="text-xs text-muted-foreground">{t("finance.bank")}</span>
                        <Select value={directBank} onValueChange={setDirectBank}>
                           <SelectTrigger className="h-8 text-xs" data-testid="select-direct-bank"><SelectValue placeholder={t("finance.create.chooseBank")} /></SelectTrigger>
                          <SelectContent>
                            {locationBanks.length === 0
                               ? <SelectItem value="_none" disabled>{t("finance.bankNotConfigured")}</SelectItem>
                              : locationBanks.map((b, i) => (
                                  <SelectItem key={i} value={b.bankAccount}>
                                    {b.bankName} - {b.bankAccount}{b.accountHolder ? ` (${b.accountHolder})` : ""}
                                  </SelectItem>
                                ))
                            }
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-blue-500 rounded-full transition-all" style={{ width: `${paidPercent}%` }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{paidPercent}%</span>
                  <span>{fmtMoney(paid)} / {fmtMoney(grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* Payment schedule */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                 <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{t("finance.create.paymentSchedule")}</span>
                <Button
                  size="sm" variant="outline"
                  className={`h-7 gap-1 text-xs transition-opacity ${!canAddSchedule ? "opacity-40 cursor-not-allowed" : ""}`}
                  onClick={addPayment}
                  disabled={!canAddSchedule}
                   title={!canAddSchedule ? t("finance.allocationComplete") : t("finance.create.addInstallment")}
                  data-testid="button-add-payment"
                >
                   <Plus className="h-3 w-3" /> {t("finance.add")}
                </Button>
              </div>
              {paymentSchedule.length === 0 && (
                 <p className="text-xs text-muted-foreground text-center py-3 border rounded-lg">{t("finance.create.noInstallments")}</p>
              )}
              <div className="space-y-2">
                {paymentSchedule.map(p => (
                  (() => {
                    const promotionAmount = p.promotionAmount ?? 0;
                    const surchargeAmount = p.surchargeAmount ?? 0;
                    const hasScheduleAdjustment =
                      p.baseAmount !== null && p.baseAmount !== undefined
                      || (p.promotionKeys?.length ?? 0) > 0
                      || (p.surchargeKeys?.length ?? 0) > 0
                      || promotionAmount > 0
                      || surchargeAmount > 0;
                    const isSchedulePaid = isInvoicePaidLike(p.status);
                    const isPersistedSchedule = isEdit && persistedScheduleIds.includes(p.id);
                    const canRemoveSchedule = !scheduleSyncError && !isSchedulePaid && (
                      !isPersistedSchedule ||
                      (canDeleteInvoice && (
                        persistedScheduleIds.length === 1 || persistedUnpaidScheduleCount >= 2
                      ))
                    );

                    return (
                  <div key={p.id} className={`rounded-lg border bg-card p-3 space-y-2 shadow-sm ${isSchedulePaid ? "border-green-200 bg-green-50/30" : ""}`}>
                    {/* Header: label + status + delete */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold">{p.label}</span>
                        <Select value={p.status} onValueChange={v => updatePaymentStatus(p.id, v)} disabled={isSchedulePaid}>
                          <SelectTrigger className={`h-6 text-[10px] px-1.5 py-0 rounded font-medium whitespace-nowrap border-0 shadow-none focus:ring-0 w-auto gap-1 ${isSchedulePaid ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                             <SelectItem value="unpaid">{t("finance.create.unpaid")}</SelectItem>
                             <SelectItem value="paid">{t("finance.create.paid")}</SelectItem>
                             <SelectItem value="confirmed" disabled>{t("finance.tab.confirmed")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">{t("finance.create.invoiceCodePrefix")} {p.code}</span>
                        {canRemoveSchedule && (
                          <button
                            type="button"
                            onClick={() => removePayment(p.id)}
                            disabled={deletingPaymentId !== null}
                            className={`text-muted-foreground transition-colors ml-1 ${deletingPaymentId === p.id ? "opacity-40 cursor-wait" : "hover:text-red-500"}`}
                            data-testid={`button-delete-payment-${p.id}`}
                            title={deletingPaymentId === p.id ? t("finance.deleting") : undefined}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Số tiền + Hạn on same row */}
                    <div className="flex gap-2">
                      <div className="flex-1 space-y-0.5">
                         <span className="text-xs text-muted-foreground">{t("finance.create.amount")}</span>
                        <Input
                          type="number"
                          value={p.amount}
                          onChange={e => updatePaymentAmount(p.id, Number(e.target.value))}
                          onFocus={e => e.target.select()}
                          readOnly={!canEditPaymentAmount(p) || hasScheduleAdjustment}
                          title={hasScheduleAdjustment
                             ? t("finance.create.installmentOwnAdjustments")
                            : !canEditPaymentAmount(p)
                              ? isSchedulePaid
                               ? t("finance.create.paidInstallmentLocked")
                               : t("finance.create.singleUnpaidHint")
                             : t("finance.create.reallocateHint")}
                          className={`h-8 text-xs text-right font-semibold ${(!canEditPaymentAmount(p) || hasScheduleAdjustment) ? "bg-muted/40 cursor-not-allowed" : ""} ${isSchedulePaid ? "bg-green-50 text-green-700" : ""}`}
                          data-testid={`input-payment-amount-${p.id}`}
                        />
                      </div>
                      <div className="flex-1 space-y-0.5">
                         <span className="text-xs text-muted-foreground">{t("finance.dueDateShort")}</span>
                        <Popover open={openDuePicker === p.id} onOpenChange={v => setOpenDuePicker(v ? p.id : null)}>
                          <PopoverTrigger asChild>
                            <button
                              disabled={isSchedulePaid}
                              className="w-full flex items-center gap-1.5 h-8 px-2 rounded-md border bg-background text-xs hover:border-purple-400 transition-colors"
                              data-testid={`button-due-date-${p.id}`}
                            >
                              <CalendarIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              <span className={p.due ? "text-foreground" : "text-muted-foreground"}>
                                 {p.due ? format(p.due, "dd/MM/yyyy") : t("finance.chooseDate")}
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start" side="left">
                            <Calendar
                              mode="single"
                              selected={p.due}
                              onSelect={(date: Date | undefined) => { if (date) updatePaymentDue(p.id, date); }}
                              locale={lang === "en" ? enUS : vi}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    {/* Hình thức thanh toán */}
                    <div className="flex gap-2 items-end">
                      <div className="space-y-0.5 w-36 flex-shrink-0">
                         <span className="text-xs text-muted-foreground">{t("finance.create.method")}</span>
                        <Select
                          value={p.paymentMethod}
                            disabled={isSchedulePaid}
                          onValueChange={v => setPaymentSchedule(prev => prev.map(x => x.id === p.id ? { ...x, paymentMethod: v, bank: v !== "transfer" ? "" : x.bank } : x))}
                        >
                          <SelectTrigger className="h-8 text-xs" data-testid={`select-payment-method-${p.id}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                             <SelectItem value="cash">{t("finance.cash")}</SelectItem>
                             <SelectItem value="transfer">{t("finance.transfer")}</SelectItem>
                             <SelectItem value="deposit_wallet">{t("finance.depositWallet")}</SelectItem>
                             <SelectItem value="card">{t("finance.card")}</SelectItem>
                             <SelectItem value="installment">{t("finance.installmentPayment")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {p.paymentMethod === "transfer" && (
                        <div className="flex-1 space-y-0.5">
                           <span className="text-xs text-muted-foreground">{t("finance.bank")}</span>
                          <Select
                            value={p.bank}
                              disabled={isSchedulePaid}
                            onValueChange={v => setPaymentSchedule(prev => prev.map(x => x.id === p.id ? { ...x, bank: v } : x))}
                          >
                             <SelectTrigger className="h-8 text-xs" data-testid={`select-bank-${p.id}`}><SelectValue placeholder={t("finance.create.chooseBank")} /></SelectTrigger>
                            <SelectContent>
                              {locationBanks.length === 0
                                 ? <SelectItem value="_none" disabled>{t("finance.bankNotConfigured")}</SelectItem>
                                : locationBanks.map((b, i) => (
                                    <SelectItem key={i} value={b.bankAccount}>
                                      {b.bankName} - {b.bankAccount}{b.accountHolder ? ` (${b.accountHolder})` : ""}
                                    </SelectItem>
                                  ))
                              }
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    <Dialog open={openSchedulePromo === p.id} onOpenChange={v => {
                      setOpenSchedulePromo(v ? p.id : null);
                      if (v) {
                        openScheduleAdjustment("promotion", p);
                      } else {
                        setOpenSchedulePromoPicker(null);
                      }
                    }}>
                      <DialogTrigger asChild>
                        <button
                          type="button"
                          disabled={isSchedulePaid}
                          className="w-full flex justify-between items-center text-green-600 hover:bg-green-50 rounded px-1 -mx-1 py-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                          data-testid={`button-schedule-promo-${p.id}`}
                        >
                          <span className="flex items-center gap-1">
                            {t("finance.promotion")}:
                            <ChevronDown className="h-3 w-3 opacity-60" />
                          </span>
                          <span>{promotionAmount > 0 ? `-${fmtMoney(promotionAmount)}` : "0 ₫"}</span>
                        </button>
                      </DialogTrigger>
                      <DialogContent
                        className="w-[min(92vw,40rem)] max-h-[90vh] overflow-y-auto rounded-xl p-6"
                        overlayClassName="bg-black/30 backdrop-blur-[1px]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <DialogTitle className="text-xl font-semibold">{t("finance.create.choosePromotion")}</DialogTitle>
                          {canCreatePromotion && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-0.5 text-[11px] font-medium text-purple-600 hover:text-purple-700"
                              onClick={() => openQuickCreate("promotion", { scope: "schedule", scheduleId: p.id })}
                              data-testid={`button-quick-add-schedule-promotion-${p.id}`}
                            >
                              <Plus className="h-3 w-3" /> {t("finance.addNew")}
                            </button>
                          )}
                        </div>
                        <AdjustmentRowsEditor
                          kind="promotion"
                          rows={p.promotionRows ?? []}
                          options={promotionOptionsWithVouchers}
                          filteredOptions={filteredPromotionOptionsWithVouchers}
                          search={promotionSearch}
                          onSearchChange={setPromotionSearch}
                          openPicker={openSchedulePromoPicker}
                          onOpenPickerChange={setOpenSchedulePromoPicker}
                          total={promotionAmount}
                          onAdd={() => addScheduleAdjustmentRow(p.id, "promotion")}
                          onUpdate={(rowId, patch) => updateScheduleAdjustmentRow(p.id, "promotion", rowId, patch)}
                          onSelect={(rowId, optionKey) => selectScheduleAdjustmentOption(p.id, "promotion", rowId, optionKey)}
                          onRemove={rowId => removeScheduleAdjustmentRow(p.id, "promotion", rowId)}
                        />
                      </DialogContent>
                    </Dialog>

                    <Dialog open={openScheduleSurcharge === p.id} onOpenChange={v => {
                      setOpenScheduleSurcharge(v ? p.id : null);
                      if (v) {
                        openScheduleAdjustment("surcharge", p);
                      } else {
                        setOpenScheduleSurchargePicker(null);
                      }
                    }}>
                      <DialogTrigger asChild>
                        <button
                          type="button"
                          disabled={isSchedulePaid}
                          className="w-full flex justify-between items-center text-orange-500 hover:bg-orange-50 rounded px-1 -mx-1 py-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                          data-testid={`button-schedule-surcharge-${p.id}`}
                        >
                          <span className="flex items-center gap-1">
                            {t("finance.surcharge")}:
                            <ChevronDown className="h-3 w-3 opacity-60" />
                          </span>
                          <span>{surchargeAmount > 0 ? `+${fmtMoney(surchargeAmount)}` : "0 ₫"}</span>
                        </button>
                      </DialogTrigger>
                      <DialogContent
                        className="w-[min(92vw,40rem)] max-h-[90vh] overflow-y-auto rounded-xl p-6"
                        overlayClassName="bg-black/30 backdrop-blur-[1px]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <DialogTitle className="text-xl font-semibold">{t("finance.create.chooseSurcharge")}</DialogTitle>
                          {canCreatePromotion && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-0.5 text-[11px] font-medium text-purple-600 hover:text-purple-700"
                              onClick={() => openQuickCreate("surcharge", { scope: "schedule", scheduleId: p.id })}
                              data-testid={`button-quick-add-schedule-surcharge-${p.id}`}
                            >
                              <Plus className="h-3 w-3" /> {t("finance.addNew")}
                            </button>
                          )}
                        </div>
                        <AdjustmentRowsEditor
                          kind="surcharge"
                          rows={p.surchargeRows ?? []}
                          options={surchargeOptions}
                          filteredOptions={filteredSurchargeOptions}
                          search={surchargeSearch}
                          onSearchChange={setSurchargeSearch}
                          openPicker={openScheduleSurchargePicker}
                          onOpenPickerChange={setOpenScheduleSurchargePicker}
                          total={surchargeAmount}
                          onAdd={() => addScheduleAdjustmentRow(p.id, "surcharge")}
                          onUpdate={(rowId, patch) => updateScheduleAdjustmentRow(p.id, "surcharge", rowId, patch)}
                          onSelect={(rowId, optionKey) => selectScheduleAdjustmentOption(p.id, "surcharge", rowId, optionKey)}
                          onRemove={rowId => removeScheduleAdjustmentRow(p.id, "surcharge", rowId)}
                        />
                      </DialogContent>
                    </Dialog>
                    {!isSchedulePaid && (
                      <div className="flex justify-end border-t border-dashed pt-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-3 text-[11px] font-medium text-purple-600 border-purple-200 hover:bg-purple-50 hover:text-purple-700"
                          onClick={() => openSplitPayment(p)}
                          disabled={p.amount <= 1}
                           title={p.amount <= 1 ? t("finance.amountTooSmallToSplit") : `${t("finance.create.splitInstallmentTitle")} ${p.label}`}
                          data-testid={`button-split-payment-${p.id}`}
                        >
                           {t("finance.create.splitInstallmentTitle")}
                        </Button>
                      </div>
                    )}
                  </div>
                    );
                  })()
                ))}
              </div>
            </div>
          </div>
        </div>
        {isPaidInvoiceLocked && (
          <div
            className="absolute inset-0 z-20 cursor-not-allowed bg-background/20"
            aria-hidden="true"
          />
        )}
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-t bg-muted/20 flex-shrink-0">
          {isPaidInvoiceLocked && (
            <div
              className="text-sm text-destructive font-medium"
              role="alert"
              data-testid="paid-invoice-edit-warning"
            >
              Hóa đơn đã thanh toán/đã xác nhận: chỉ được sửa Ghi chú. Muốn sửa nội dung khác, hãy chuyển trạng thái về Chưa thanh toán trước.
            </div>
          )}
          <div className="ml-auto flex items-center justify-end gap-2">
           <Button variant="outline" onClick={onClose} disabled={saveMutation.isPending || deletingPaymentId !== null} data-testid="button-cancel">{t("finance.cancel")}</Button>
           <Button className="bg-purple-600 hover:bg-purple-700 gap-1" onClick={handleSave} disabled={saveMutation.isPending || deletingPaymentId !== null || scheduleSyncError || (isPaidInvoiceLocked && !isPaidNoteDirty)} data-testid="button-save-pay">
              {saveMutation.isPending ? t("finance.create.saving") : isPaidInvoiceLocked ? t("finance.save") : isEdit ? t("finance.create.updateReceipt") : t("finance.save")}
          </Button>
          </div>
        </div>
      </DialogContent>
      </Dialog>
      <AlertDialog
        open={pendingDeletePaymentId !== null}
        onOpenChange={nextOpen => {
          if (!nextOpen && deletingPaymentId === null) setPendingDeletePaymentId(null);
        }}
      >
        <AlertDialogContent overlayClassName="z-[60]" className="z-[61] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("finance.confirmDeleteScheduleQuestion", {
                label: pendingDeletePayment?.label ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                {isPendingDeleteLastSchedule
                  ? t("finance.deleteLastScheduleDeletesInvoice")
                  : t("finance.deleteScheduleReallocation", {
                    amount: fmtMoney(pendingDeletePayment?.amount ?? 0),
                  })}
              </span>
              {isPendingDeleteLastSchedule && (
                <span className="block">{t("finance.deleteIrreversible")}</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingPaymentId !== null}>
              {t("finance.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmRemovePayment()}
              disabled={!pendingDeletePayment || deletingPaymentId !== null}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-payment"
            >
              {t("finance.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={Boolean(splitPaymentId)}
        onOpenChange={nextOpen => {
          if (!nextOpen) {
            setSplitPaymentId(null);
            setSplitAmount(0);
            setSplitDueDate("");
          }
        }}
      >
        <DialogContent
          className="w-[min(92vw,28rem)] rounded-xl p-6"
          overlayClassName="bg-black/30 backdrop-blur-[1px]"
        >
          <DialogHeader>
             <DialogTitle>{t("finance.create.splitInstallmentTitle")} {splitPayment?.label ?? t("finance.paymentSchedule")}</DialogTitle>
          </DialogHeader>
          {splitPayment && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <div className="flex items-center justify-between">
                   <span className="text-muted-foreground">{t("finance.create.currentAmount")}</span>
                  <span className="font-semibold">{fmtMoney(splitPayment.amount)}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                 <label className="text-sm font-medium">{t("finance.create.newInstallmentAmount")}</label>
                <Input
                  type="number"
                  min={1}
                  max={Math.max(1, splitPayment.amount - 1)}
                  value={splitAmount || ""}
                  onChange={event => setSplitAmount(Math.max(0, Number(event.target.value) || 0))}
                  onFocus={event => event.target.select()}
                  autoFocus
                  data-testid="input-split-payment-amount"
                />
                <p className="text-xs text-muted-foreground">
                   {t("finance.create.splitPreview", {
                     label: splitPayment.label,
                     remaining: fmtMoney(Math.max(0, splitPayment.amount - splitAmount)),
                     amount: fmtMoney(splitAmount),
                   })}
                </p>
              </div>
              <div className="space-y-1.5">
                 <label className="text-sm font-medium">{t("finance.create.newInstallmentDue")}</label>
                <Input
                  type="date"
                  value={splitDueDate}
                  onChange={event => setSplitDueDate(event.target.value)}
                  data-testid="input-split-payment-due-date"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                 {t("finance.create.splitBankHint", { label: splitPayment.label })}
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSplitPaymentId(null);
                    setSplitAmount(0);
                    setSplitDueDate("");
                  }}
                >
                   {t("finance.cancel")}
                </Button>
                <Button
                  type="button"
                  className="bg-purple-600 hover:bg-purple-700"
                  onClick={confirmSplitPayment}
                  disabled={splitAmount <= 0 || splitAmount >= splitPayment.amount}
                  data-testid="button-confirm-split-payment"
                >
                   {t("finance.create.splitInstallmentTitle")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <FinancePromotionDialog
        open={quickCreateType !== null}
        onClose={() => {
          if (!createPromotionMutation.isPending) {
            setQuickCreateType(null);
            setQuickCreateTarget(null);
          }
        }}
        title={quickCreateType === "promotion" ? t("finance.create.quickAddPromotion") : t("finance.create.quickAddSurcharge")}
        isSaving={createPromotionMutation.isPending}
        onSave={data => {
          if (quickCreateType) {
            createPromotionMutation.mutate({ type: quickCreateType, data });
          }
        }}
      />
    </>
  );
}
