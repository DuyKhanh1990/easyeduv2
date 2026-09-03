import { useState, useMemo, useEffect, useCallback, useRef, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Popover, PopoverTrigger, PopoverContent,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Trash2, Copy, Plus, Check, ChevronsUpDown, ChevronDown, Keyboard, Save, FileText, Users, Loader2, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import * as XLSX from "xlsx";

const DRAFTS_KEY = "bulk-invoice-entry-drafts-v1";
const MAX_ROWS = 300;
const WARN_ROWS = 250;
const AUTOSAVE_INTERVAL_MS = 30_000;
const INITIAL_RENDER_CHUNK = 50;

type RowData = {
  id: string;
  branchId: string;
  studentId: string;
  studentLabel: string;
  type: "income" | "expense";
  categoryId: string;
  product: string;
  productLabel: string;
  description: string;
  paymentMethod: "cash" | "transfer";
  amount: string;
  promotionKeys: string[];
  surchargeKeys: string[];
  installment1: string;
  installment2: string;
  installment3: string;
  installment4: string;
  dueDate: string;
  classId: string;
  _error?: string;
};

const todayStr = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

const newRow = (): RowData => ({
  id: Math.random().toString(36).slice(2),
  branchId: "",
  studentId: "",
  studentLabel: "",
  type: "income",
  categoryId: "",
  product: "",
  productLabel: "",
  description: "",
  paymentMethod: "cash",
  amount: "",
  promotionKeys: [],
  surchargeKeys: [],
  installment1: "",
  installment2: "",
  installment3: "",
  installment4: "",
  dueDate: todayStr(),
  classId: "",
});

// Calculate adjustment amount (promotion or surcharge) from selected option keys.
const calcAdjustment = (base: number, keys: string[], options: any[]) =>
  (keys ?? []).reduce((sum, key) => {
    const opt = options.find((o: any) => o.id === key);
    if (!opt) return sum;
    const val = parseFloat(opt.valueAmount || "0");
    return sum + (opt.valueType === "percent" ? Math.round(base * val / 100) : val);
  }, 0);

const fmtMoney = (n: number) => n.toLocaleString("vi-VN");

// Strip non-digits
const digits = (v: string) => (v ?? "").toString().replace(/[^\d]/g, "");
// Format integer string with thousands separators (e.g. "5000000" -> "5,000,000")
const formatNumber = (v: string) => {
  const d = digits(v);
  if (!d) return "";
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};
const toInt = (v: string) => {
  const d = digits(v);
  return d ? parseInt(d, 10) : 0;
};

const HOC_PHI = "Học phí";

export function BulkInvoiceEntryDialog({
  open,
  onOpenChange,
  importFile,
  onImportFileConsumed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  importFile?: File | null;
  onImportFileConsumed?: () => void;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<RowData[]>([newRow()]);
  const [draftCount, setDraftCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitElapsedSec, setSubmitElapsedSec] = useState(0);
  const [classPickerOpen, setClassPickerOpen] = useState(false);
  const [pickedClassIds, setPickedClassIds] = useState<string[]>([]);
  const [classSearch, setClassSearch] = useState("");
  const [importingClasses, setImportingClasses] = useState(false);
  const [autoSavedAt, setAutoSavedAt] = useState<number | null>(null);
  const [restoredBanner, setRestoredBanner] = useState<{ count: number } | null>(null);
  // Chunked initial render: only render the first N rows immediately, batch in the rest.
  const [visibleRowCount, setVisibleRowCount] = useState(INITIAL_RENDER_CHUNK);

  // Restore drafts when dialog opens.
  useEffect(() => {
    if (!open) {
      setVisibleRowCount(INITIAL_RENDER_CHUNK);
      setRestoredBanner(null);
      setAutoSavedAt(null);
      return;
    }
    try {
      const raw = localStorage.getItem(DRAFTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Re-issue ids so React keys are unique even if the user duplicates after reload.
          const restored = parsed.map((r: any) => ({
            ...newRow(),
            ...r,
            id: Math.random().toString(36).slice(2),
            // Backfill defaults for fields that may be missing from older drafts.
            dueDate: r.dueDate ?? todayStr(),
            productLabel: r.productLabel ?? r.product ?? "",
            // Migrate older drafts that stored `total` instead of `amount`.
            amount: r.amount ?? r.total ?? "",
            promotionKeys: Array.isArray(r.promotionKeys) ? r.promotionKeys : [],
            surchargeKeys: Array.isArray(r.surchargeKeys) ? r.surchargeKeys : [],
            _error: undefined,
          })) as RowData[];
          setRows(restored);
          setDraftCount(restored.length);
          setVisibleRowCount(Math.min(restored.length, INITIAL_RENDER_CHUNK));
          setRestoredBanner({ count: restored.length });
          return;
        }
      }
    } catch {
      // ignore corrupt drafts
    }
    setRows([newRow()]);
    setDraftCount(0);
    setVisibleRowCount(INITIAL_RENDER_CHUNK);
    setRestoredBanner(null);
  }, [open]);

  const { data: locations = [] } = useQuery<any[]>({ queryKey: ["/api/locations"], enabled: open });
  const { data: categories = [] } = useQuery<any[]>({ queryKey: ["/api/finance/transaction-categories"], enabled: open });
  const { data: classes = [] } = useQuery<any[]>({ queryKey: ["/api/classes"], enabled: open });
  const { data: promotionOptions = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/promotions", { type: "promotion" }],
    queryFn: () => apiRequest("GET", "/api/finance/promotions?type=promotion").then(r => r.json()),
    enabled: open,
  });
  const { data: surchargeOptions = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/promotions", { type: "surcharge" }],
    queryFn: () => apiRequest("GET", "/api/finance/promotions?type=surcharge").then(r => r.json()),
    enabled: open,
  });

  // Parse the invoice workbook into the same editable rows used by direct entry.
  // Supported headers include Vietnamese labels and the corresponding API-style names.
  useEffect(() => {
    if (!open || !importFile) return;
    if (locations.length === 0) return;

    let cancelled = false;
    const normalizeHeader = (value: unknown) =>
      String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
    const readCell = (row: Record<string, unknown>, aliases: string[]) => {
      const entries = Object.entries(row);
      const wanted = aliases.map(normalizeHeader);
      const match = entries.find(([key]) => wanted.includes(normalizeHeader(key)));
      return match?.[1] ?? "";
    };
    const asText = (value: unknown) => String(value ?? "").trim();
    const asMoney = (value: unknown) => {
      if (typeof value === "number") return String(Math.round(value));
      const digitsOnly = asText(value).replace(/[^\d-]/g, "");
      return digitsOnly || "";
    };
    const asDate = (value: unknown) => {
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, "0");
        const d = String(value.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
      const raw = asText(value);
      if (!raw) return "";
      const ymd = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
      if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
      const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
      if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
      if (/^\d+(\.\d+)?$/.test(raw)) {
        const parsed = XLSX.SSF.parse_date_code(Number(raw));
        if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
      }
      return "";
    };
    const isUuid = (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

    const parseWorkbook = async () => {
      try {
        const workbook = XLSX.read(await importFile.arrayBuffer(), { type: "array", cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const records = sheet
          ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })
          : [];
        if (records.length === 0) {
          toast({ title: "File Excel không có dữ liệu", description: "Hãy kiểm tra dòng tiêu đề và các dòng dữ liệu.", variant: "destructive" });
          return;
        }
        const imported = records.slice(0, MAX_ROWS).map((record, index): RowData => {
          const locationRaw = asText(readCell(record, ["Cơ sở", "Mã cơ sở", "locationId", "locationCode"]));
          const location = locations.find((item: any) =>
            [item.id, item.code, item.name].some(value => asText(value).toLowerCase() === locationRaw.toLowerCase())
          );
          const categoryRaw = asText(readCell(record, ["Danh mục", "category", "categoryId"]));
          const category = categories.find((item: any) =>
            [item.id, item.name].some(value => asText(value).toLowerCase() === categoryRaw.toLowerCase())
          );
          const studentIdRaw = asText(readCell(record, ["Mã học viên", "studentId", "student_id"]));
          const studentLabel = asText(readCell(record, ["Họ và tên", "Tên đối tượng", "Tên", "subjectName", "studentName"]));
          const paid = asMoney(readCell(record, ["Đã thanh toán", "paidAmount", "paid"]));
          return {
            id: `excel-${Date.now()}-${index}`,
            branchId: location?.id ?? (isUuid(locationRaw) ? locationRaw : ""),
            studentId: isUuid(studentIdRaw) ? studentIdRaw : "",
            studentLabel,
            type: /^(chi|expense|out|ra)$/i.test(asText(readCell(record, ["Loại", "type"]))) ? "expense" : "income",
            categoryId: category?.id ?? (isUuid(categoryRaw) ? categoryRaw : ""),
            product: asText(readCell(record, ["Mã sản phẩm", "packageId", "productId"])),
            productLabel: asText(readCell(record, ["Sản phẩm", "Gói", "packageName", "product"])),
            description: asText(readCell(record, ["Mô tả", "description"])),
            paymentMethod: /^(chuyen khoan|transfer|bank)$/i.test(
              normalizeHeader(readCell(record, ["Hình thức thanh toán", "paymentMethod"]))
            ) ? "transfer" : "cash",
            amount: asMoney(readCell(record, ["Số tiền", "Tổng tiền", "totalAmount", "amount"])),
            promotionKeys: [],
            surchargeKeys: [],
            installment1: paid,
            installment2: asMoney(readCell(record, ["Đợt 2", "installment2"])),
            installment3: asMoney(readCell(record, ["Đợt 3", "installment3"])),
            installment4: asMoney(readCell(record, ["Đợt 4", "installment4"])),
            dueDate: asDate(readCell(record, ["Hạn thanh toán", "dueDate"])),
            classId: asText(readCell(record, ["Mã lớp", "classId"])),
          };
        });
        if (cancelled) return;
        setRows(prev => {
          const hasOnlyEmptyDefault = prev.length === 1 && isRowEmpty(prev[0]);
          return hasOnlyEmptyDefault ? imported : [...prev, ...imported].slice(0, MAX_ROWS);
        });
        setVisibleRowCount(Math.min(imported.length, INITIAL_RENDER_CHUNK));
        toast({
          title: "Đã đọc file Excel",
          description: `Đã nạp ${imported.length} dòng. Vui lòng kiểm tra rồi bấm Lưu tất cả.`,
        });
      } catch (error: any) {
        toast({
          title: "Không thể đọc file Excel",
          description: error?.message ?? "Vui lòng sử dụng file .xlsx hoặc .xls hợp lệ.",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) onImportFileConsumed?.();
      }
    };
    void parseWorkbook();
    return () => { cancelled = true; };
  }, [open, importFile, locations, categories, toast, onImportFileConsumed]);

  // Chunked initial render: progressively reveal more rows after first paint.
  useEffect(() => {
    if (!open) return;
    if (visibleRowCount >= rows.length) return;
    const idleCb: any = (window as any).requestIdleCallback ?? ((fn: any) => setTimeout(fn, 16));
    const cancelCb: any = (window as any).cancelIdleCallback ?? clearTimeout;
    const handle = idleCb(() => {
      setVisibleRowCount(c => Math.min(rows.length, c + INITIAL_RENDER_CHUNK));
    });
    return () => cancelCb(handle);
  }, [open, visibleRowCount, rows.length]);

  // Keep visibleRowCount in sync when rows shrink (e.g. after delete or filter-failed).
  useEffect(() => {
    if (visibleRowCount > rows.length) setVisibleRowCount(rows.length);
  }, [rows.length, visibleRowCount]);

  // Stable callbacks so memoized rows don't re-render unnecessarily.
  const updateRow = useCallback((id: string, patch: Partial<RowData>) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch, _error: undefined } : r)));
  }, []);

  // Free-form amount entry: each field is independent.
  // - A value (including 0) on an installment means that installment exists.
  //   A positive value = that much has been paid; 0 = scheduled but unpaid.
  // - An empty installment is ignored (no such installment).
  // Refs hold the latest option arrays so memoized row callbacks always see
  // current promotion/surcharge data without breaking RowEditor memoization.
  const promotionOptionsRef = useRef(promotionOptions);
  const surchargeOptionsRef = useRef(surchargeOptions);
  useEffect(() => { promotionOptionsRef.current = promotionOptions; }, [promotionOptions]);
  useEffect(() => { surchargeOptionsRef.current = surchargeOptions; }, [surchargeOptions]);

  // When the row is in single-installment mode (đợt 2-4 all empty), keep
  // installment1 in sync with the computed Tổng tiền so the user sees a
  // sensible default and the original invoice (no schedule) reflects it.
  const syncInstallment1 = (r: RowData): RowData => {
    if (r.installment2 || r.installment3 || r.installment4) return r;
    const base = toInt(r.amount);
    const promo = calcAdjustment(base, r.promotionKeys, promotionOptionsRef.current);
    const surch = calcAdjustment(base, r.surchargeKeys, surchargeOptionsRef.current);
    const total = Math.max(0, base - promo + surch);
    return { ...r, installment1: total > 0 ? String(total) : "" };
  };

  const updateAmount = useCallback((
    id: string,
    field: "amount" | "installment1" | "installment2" | "installment3" | "installment4",
    raw: string,
  ) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const next = { ...r, [field]: digits(raw), _error: undefined };
      // Auto-sync đợt 1 when the base amount changes in single-installment mode.
      return field === "amount" ? syncInstallment1(next) : next;
    }));
  }, []);

  const togglePromotion = useCallback((id: string, key: string) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const has = r.promotionKeys.includes(key);
      const next = {
        ...r,
        promotionKeys: has ? r.promotionKeys.filter(k => k !== key) : [...r.promotionKeys, key],
        _error: undefined,
      };
      return syncInstallment1(next);
    }));
  }, []);

  const toggleSurcharge = useCallback((id: string, key: string) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const has = r.surchargeKeys.includes(key);
      const next = {
        ...r,
        surchargeKeys: has ? r.surchargeKeys.filter(k => k !== key) : [...r.surchargeKeys, key],
        _error: undefined,
      };
      return syncInstallment1(next);
    }));
  }, []);

  const deleteRow = useCallback((id: string) => {
    setRows(prev => (prev.length === 1 ? [newRow()] : prev.filter(r => r.id !== id)));
  }, []);

  const duplicateRow = useCallback((id: string) => {
    setRows(prev => {
      if (prev.length >= MAX_ROWS) {
        toast({ title: "Đã đạt giới hạn", description: `Tối đa ${MAX_ROWS} dòng/lần.`, variant: "destructive" });
        return prev;
      }
      const idx = prev.findIndex(r => r.id === id);
      if (idx < 0) return prev;
      const clone = { ...prev[idx], id: Math.random().toString(36).slice(2), _error: undefined };
      return [...prev.slice(0, idx + 1), clone, ...prev.slice(idx + 1)];
    });
  }, [toast]);

  const addRow = useCallback(() => {
    setRows(prev => {
      if (prev.length >= MAX_ROWS) {
        toast({ title: "Đã đạt giới hạn", description: `Tối đa ${MAX_ROWS} dòng/lần.`, variant: "destructive" });
        return prev;
      }
      return [...prev, newRow()];
    });
  }, [toast]);

  const categoryName = (id: string) =>
    (categories.find((c: any) => c.id === id)?.name as string | undefined) ?? "";

  // A row is considered "empty" if the user has not entered any meaningful data.
  const isRowEmpty = (r: RowData) =>
    !r.branchId &&
    !r.studentId && !r.studentLabel &&
    !r.categoryId &&
    !r.product && !r.productLabel &&
    !r.description &&
    !toInt(r.amount) &&
    r.promotionKeys.length === 0 &&
    r.surchargeKeys.length === 0 &&
    !r.installment1 && !r.installment2 && !r.installment3 && !r.installment4 &&
    !r.classId;

  // Save current rows as drafts in localStorage.
  const handleSaveDraft = () => {
    const filled = rows.filter(r => !isRowEmpty(r));
    if (filled.length === 0) {
      try { localStorage.removeItem(DRAFTS_KEY); } catch {}
      setDraftCount(0);
      toast({ title: "Đã xoá nháp", description: "Không có dòng nào để lưu nháp." });
      return;
    }
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(filled));
      setDraftCount(filled.length);
      toast({
        title: "Đã lưu nháp",
        description: `Đã lưu ${filled.length} dòng. Mở lại "Nhập trực tiếp" để chỉnh sửa.`,
      });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Lỗi lưu nháp", description: err?.message ?? "Không lưu được", variant: "destructive" });
    }
  };

  // Build the invoice payload for one row, returning null if invalid.
  const buildPayload = (row: RowData): { payload: any; error?: string } => {
    if (!row.branchId) return { payload: null, error: "Thiếu cơ sở" };
    if (!row.studentId && !row.studentLabel) return { payload: null, error: "Thiếu tên đối tượng" };
    const base = toInt(row.amount);
    if (base <= 0) return { payload: null, error: "Số tiền phải > 0" };
    const promoAmt = calcAdjustment(base, row.promotionKeys, promotionOptions);
    const surchargeAmt = calcAdjustment(base, row.surchargeKeys, surchargeOptions);
    const total = Math.max(0, base - promoAmt + surchargeAmt);

    const catName = categoryName(row.categoryId);
    const isHocPhi = catName === HOC_PHI;

    // Build payment schedule from installments (empty = excluded).
    const order = ["installment1", "installment2", "installment3", "installment4"] as const;
    const present = order
      .map((k, i) => ({ key: k, idx: i, val: row[k] }))
      .filter(x => x.val !== "");

    let paymentSchedule: any[] = [];
    let paidAmount = 0;

    if (present.length === 1) {
      // Single-installment mode: do NOT split. The single value represents
      // the paid amount on the original invoice; no payment schedule rows.
      paidAmount = toInt(present[0].val);
    } else if (present.length >= 2) {
      const paid = present.filter(x => toInt(x.val) > 0);
      const unpaid = present.filter(x => toInt(x.val) === 0);
      const sumPaid = paid.reduce((s, x) => s + toInt(x.val), 0);
      const remaining = Math.max(0, total - sumPaid);
      const baseUnpaid = unpaid.length > 0 ? Math.floor(remaining / unpaid.length) : 0;
      const remainder = unpaid.length > 0 ? remaining - baseUnpaid * unpaid.length : 0;

      paidAmount = sumPaid;
      paymentSchedule = present.map((x, i) => {
        const isPaidEntry = toInt(x.val) > 0;
        let amount: number;
        if (isPaidEntry) {
          amount = toInt(x.val);
        } else {
          const unpaidIdx = unpaid.findIndex(u => u.idx === x.idx);
          // Last unpaid absorbs any rounding remainder.
          amount = baseUnpaid + (unpaidIdx === unpaid.length - 1 ? remainder : 0);
        }
        return {
          label: `ĐỢT ${i + 1}`,
          amount: String(amount),
          dueDate: row.dueDate || null,
          status: isPaidEntry ? "paid" : "unpaid",
          paymentMethod: row.paymentMethod,
          sortOrder: i,
        };
      });
    }

    const remainingAmount = total - paidAmount;
    const status: "paid" | "unpaid" | "partial" =
      paidAmount >= total ? "paid"
      : paidAmount > 0 ? "partial"
      : "unpaid";

    const itemName = (isHocPhi ? row.productLabel : row.product) || row.productLabel || row.product || catName || "Dịch vụ";

    return {
      payload: {
        type: row.type === "income" ? "Thu" : "Chi",
        locationId: row.branchId || null,
        studentId: row.studentId || null,
        subjectName: row.studentLabel || null,
        classId: row.classId || null,
        category: catName || null,
        description: row.description || null,
        paymentMethod: row.paymentMethod,
        dueDate: row.dueDate || null,
        totalAmount: String(base),
        totalPromotion: String(promoAmt),
        totalSurcharge: String(surchargeAmt),
        grandTotal: String(total),
        deduction: "0",
        paidAmount: String(paidAmount),
        remainingAmount: String(remainingAmount),
        status,
        items: [
          {
            packageId: isHocPhi && row.product ? row.product : null,
            packageName: itemName,
            packageType: null,
            unitPrice: String(base),
            quantity: 1,
            promotionKeys: row.promotionKeys,
            surchargeKeys: row.surchargeKeys,
            promotionAmount: String(promoAmt),
            surchargeAmount: String(surchargeAmt),
            subtotal: String(total),
            sortOrder: 0,
            category: catName || null,
          },
        ],
        paymentSchedule,
      },
    };
  };

  // Import enrolled students from selected classes as new rows.
  const handleImportFromClasses = async () => {
    if (pickedClassIds.length === 0) {
      setClassPickerOpen(false);
      return;
    }
    if (rows.length >= MAX_ROWS) {
      toast({
        title: "Đã đạt giới hạn",
        description: `Bảng đã có ${rows.length} dòng (tối đa ${MAX_ROWS}). Hãy lưu hoặc xoá bớt trước khi tải thêm.`,
        variant: "destructive",
      });
      return;
    }
    setImportingClasses(true);
    try {
      // Resolve "Học phí" category id once.
      const hocPhiCat = categories.find((c: any) => c.name === HOC_PHI);

      // Existing pairs to skip duplicates.
      const existingPairs = new Set(
        rows.map(r => (r.classId && r.studentId ? `${r.classId}|${r.studentId}` : "")).filter(Boolean)
      );

      const newRows: RowData[] = [];
      for (const classId of pickedClassIds) {
        const cls = classes.find((c: any) => c.id === classId);
        if (!cls) continue;

        // Fetch enrolled students + (optionally) the class fee package details in parallel.
        const studentsPromise = apiRequest("GET", `/api/classes/${classId}/active-students`)
          .then(r => (r.ok ? r.json() : []))
          .catch(() => []);
        const pkgPromise = cls.feePackageId
          ? apiRequest("GET", `/api/fee-packages?locationId=${cls.locationId ?? ""}`)
              .then(r => (r.ok ? r.json() : []))
              .then((all: any[]) => all.find(p => p.id === cls.feePackageId) ?? null)
              .catch(() => null)
          : Promise.resolve(null);

        const [enrolled, pkg] = await Promise.all([studentsPromise, pkgPromise]);

        for (const sc of enrolled as any[]) {
          const studentId = sc.studentId ?? sc.student?.id;
          if (!studentId) continue;
          const pairKey = `${classId}|${studentId}`;
          if (existingPairs.has(pairKey)) continue;
          existingPairs.add(pairKey);

          const fullName = sc.student?.fullName ?? "";
          const code = sc.student?.code ?? "";
          const studentLabel = fullName ? (code ? `${fullName} (${code})` : fullName) : (code || "—");
          const amountStr = pkg?.totalAmount ? String(Math.round(parseFloat(pkg.totalAmount))) : "";

          newRows.push({
            ...newRow(),
            branchId: cls.locationId ?? "",
            studentId,
            studentLabel,
            classId,
            categoryId: hocPhiCat?.id ?? "",
            product: pkg?.id ?? "",
            productLabel: pkg?.name ?? "",
            description: cls.name ?? "",
            amount: amountStr,
          });
        }
      }

      if (newRows.length === 0) {
        toast({
          title: "Không có học viên mới",
          description: "Các lớp đã chọn không có học viên đang học, hoặc tất cả đã có dòng trong bảng.",
        });
      } else {
        // Replace the leading empty row if we still have only the default empty placeholder.
        setRows(prev => {
          const hasOnlyEmptyDefault = prev.length === 1 && isRowEmpty(prev[0]);
          return hasOnlyEmptyDefault ? newRows : [...prev, ...newRows];
        });
        toast({
          title: "Đã tải học viên",
          description: `Thêm ${newRows.length} dòng từ ${pickedClassIds.length} lớp.`,
        });
      }
      setPickedClassIds([]);
      setClassPickerOpen(false);
    } finally {
      setImportingClasses(false);
    }
  };

  // Latest-rows ref so the auto-save interval doesn't restart on every keystroke.
  const rowsRef = useRef<RowData[]>(rows);
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  // Auto-save draft every 30s while dialog is open and at least one row has data.
  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => {
      const filled = rowsRef.current.filter(r => !isRowEmpty(r));
      if (filled.length === 0) return;
      try {
        // Strip transient _error before persisting.
        const stripped = filled.map(({ _error, ...rest }) => rest);
        localStorage.setItem(DRAFTS_KEY, JSON.stringify(stripped));
        setDraftCount(filled.length);
        setAutoSavedAt(Date.now());
      } catch {
        // ignore quota errors
      }
    }, AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(t);
  }, [open]);

  // Elapsed timer during bulk submit (single-request, so we show indeterminate progress).
  useEffect(() => {
    if (!submitting) {
      setSubmitElapsedSec(0);
      return;
    }
    const start = Date.now();
    const t = window.setInterval(() => setSubmitElapsedSec(Math.floor((Date.now() - start) / 1000)), 250);
    return () => window.clearInterval(t);
  }, [submitting]);

  const handleSaveAll = async () => {
    const candidates = rows.filter(r => !isRowEmpty(r));
    if (candidates.length === 0) {
      toast({ title: "Không có dữ liệu", description: "Vui lòng nhập ít nhất một dòng.", variant: "destructive" });
      return;
    }
    if (candidates.length > MAX_ROWS) {
      toast({ title: "Vượt giới hạn", description: `Tối đa ${MAX_ROWS} hoá đơn/lần.`, variant: "destructive" });
      return;
    }

    // Pre-validate. Mark invalid rows with _error so the UI highlights them.
    const validBatch: { row: RowData; payload: any }[] = [];
    const preErrors: Map<string, string> = new Map();
    for (const row of candidates) {
      const { payload, error } = buildPayload(row);
      if (error || !payload) preErrors.set(row.id, error ?? "Dữ liệu không hợp lệ");
      else validBatch.push({ row, payload });
    }

    if (preErrors.size > 0) {
      setRows(prev => prev.map(r => preErrors.has(r.id) ? { ...r, _error: preErrors.get(r.id) } : r));
      toast({
        title: `Có ${preErrors.size} dòng chưa hợp lệ`,
        description: "Vui lòng sửa các dòng được tô viền đỏ rồi lưu lại.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/finance/invoices/bulk", {
        invoices: validBatch.map(b => b.payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({
          title: "Lưu thất bại",
          description: body.message ?? res.statusText,
          variant: "destructive",
        });
        return;
      }
      const json = await res.json() as {
        results: Array<{ index: number; ok: boolean; id?: string; code?: string; error?: string }>;
        summary: { total: number; ok: number; failed: number };
      };
      const { results, summary } = json;

      if (summary.ok > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
        queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices/summary"] });
      }

      if (summary.failed === 0) {
        // All saved → wipe drafts and close.
        try { localStorage.removeItem(DRAFTS_KEY); } catch {}
        setDraftCount(0);
        toast({ title: "Đã lưu", description: `Đã tạo ${summary.ok} hoá đơn.` });
        onOpenChange(false);
        return;
      }

      // Keep only failed rows; annotate them with error message.
      const failedIds = new Set<string>();
      const errorByRowId = new Map<string, string>();
      for (const r of results) {
        if (!r.ok) {
          const rowId = validBatch[r.index]?.row.id;
          if (rowId) {
            failedIds.add(rowId);
            errorByRowId.set(rowId, r.error ?? "Lỗi không xác định");
          }
        }
      }
      setRows(prev => {
        const kept = prev.filter(r => failedIds.has(r.id) || (preErrors.size === 0 && false));
        const annotated = kept.map(r => ({ ...r, _error: errorByRowId.get(r.id) }));
        return annotated.length > 0 ? annotated : [newRow()];
      });
      toast({
        title: `Đã lưu ${summary.ok}/${summary.total} — còn ${summary.failed} lỗi`,
        description: "Các dòng lỗi được giữ lại với viền đỏ. Sửa rồi lưu tiếp.",
        variant: "destructive",
      });
    } catch (err: any) {
      toast({ title: "Lưu thất bại", description: err?.message ?? "Lỗi mạng", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-[98vw] h-[98vh] flex flex-col p-0 gap-0" data-testid="dialog-bulk-invoice-entry">
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Keyboard className="h-5 w-5 text-blue-600" />
              Nhập trực tiếp hoá đơn
              <span className="text-xs font-normal text-muted-foreground">(tối đa {MAX_ROWS} dòng/lần)</span>
            </DialogTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Tải học viên từ lớp:</span>
              <Popover open={classPickerOpen} onOpenChange={setClassPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 min-w-[200px] justify-between text-xs font-normal"
                    data-testid="button-class-picker"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <Users className="h-3.5 w-3.5 text-blue-600" />
                      {pickedClassIds.length > 0
                        ? `Đã chọn ${pickedClassIds.length} lớp`
                        : "Chọn lớp..."}
                    </span>
                    <ChevronsUpDown className="h-3 w-3 opacity-50 flex-shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-96" align="end">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Tìm lớp theo tên hoặc mã..."
                      value={classSearch}
                      onValueChange={setClassSearch}
                      className="h-9"
                    />
                    <CommandList className="max-h-72">
                      <CommandEmpty>Không tìm thấy lớp.</CommandEmpty>
                      <CommandGroup>
                        {(classes as any[])
                          .filter((c) => {
                            if (!classSearch) return true;
                            const q = classSearch.toLowerCase();
                            return (
                              (c.name ?? "").toLowerCase().includes(q) ||
                              (c.classCode ?? "").toLowerCase().includes(q)
                            );
                          })
                          .slice(0, 100)
                          .map((c: any) => {
                            const checked = pickedClassIds.includes(c.id);
                            return (
                              <CommandItem
                                key={c.id}
                                value={c.id}
                                onSelect={() => {
                                  setPickedClassIds(prev =>
                                    prev.includes(c.id)
                                      ? prev.filter(x => x !== c.id)
                                      : [...prev, c.id]
                                  );
                                }}
                                data-testid={`option-class-${c.id}`}
                              >
                                <Checkbox checked={checked} className="mr-2 flex-shrink-0" />
                                <div className="flex flex-col min-w-0 flex-1">
                                  <span className="truncate text-xs font-medium">{c.name}</span>
                                  <span className="text-[10px] text-muted-foreground truncate">
                                    {c.classCode}
                                  </span>
                                </div>
                              </CommandItem>
                            );
                          })}
                      </CommandGroup>
                    </CommandList>
                    <div className="flex items-center justify-between gap-2 p-2 border-t bg-muted/40">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setPickedClassIds([])}
                        disabled={pickedClassIds.length === 0 || importingClasses}
                        data-testid="button-clear-class-picker"
                      >
                        Bỏ chọn
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
                        onClick={handleImportFromClasses}
                        disabled={pickedClassIds.length === 0 || importingClasses || rows.length >= MAX_ROWS}
                        data-testid="button-import-from-classes"
                        title={rows.length >= MAX_ROWS ? `Đã đạt tối đa ${MAX_ROWS} dòng` : undefined}
                      >
                        {importingClasses ? (
                          <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Đang tải...</>
                        ) : (
                          <>Tải {pickedClassIds.length > 0 ? `${pickedClassIds.length} lớp` : ""}</>
                        )}
                      </Button>
                    </div>
                  </Command>
                </PopoverContent>
              </Popover>
              {pickedClassIds.length > 0 && !classPickerOpen && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground"
                  onClick={() => setPickedClassIds([])}
                  data-testid="button-reset-class-picker"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
          {pickedClassIds.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {pickedClassIds.map((cid) => {
                const c = (classes as any[]).find((x: any) => x.id === cid);
                if (!c) return null;
                return (
                  <Badge
                    key={cid}
                    variant="secondary"
                    className="text-xs gap-1 pr-1"
                    data-testid={`badge-picked-class-${cid}`}
                  >
                    {c.name}
                    <button
                      type="button"
                      className="ml-0.5 rounded hover:bg-muted-foreground/20 p-0.5"
                      onClick={() =>
                        setPickedClassIds(prev => prev.filter(x => x !== cid))
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}
        </DialogHeader>

        <div className="relative isolate flex-1 overflow-auto pl-6 pr-0 py-4">
          <table className="w-full text-sm border-separate border-spacing-0 min-w-[2520px]">
            <thead className="sticky top-0 bg-muted z-20">
              <tr className="border-b">
                <Th className="w-10">#</Th>
                <Th className="w-40">Cơ sở</Th>
                <Th className="w-56">Tên</Th>
                <Th className="w-28">Loại</Th>
                <Th className="w-44">Danh mục</Th>
                <Th className="w-56">Sản phẩm</Th>
                <Th className="w-48">Mô tả</Th>
                <Th className="w-36">Hình thức</Th>
                <Th className="w-40 text-right">Số tiền</Th>
                <Th className="w-36 text-right">Khuyến mãi</Th>
                <Th className="w-36 text-right">Phụ thu</Th>
                <Th className="w-40 text-right">Tổng tiền</Th>
                <Th className="w-40 text-right">Đợt 1</Th>
                <Th className="w-40 text-right">Đợt 2</Th>
                <Th className="w-40 text-right">Đợt 3</Th>
                <Th className="w-40 text-right">Đợt 4</Th>
                <Th className="w-40">Hạn thanh toán</Th>
                <Th className="w-44">
                  Lớp <span className="font-normal text-muted-foreground">(không bắt buộc)</span>
                </Th>
                <Th className="w-28 min-w-[7rem] max-w-[7rem] text-center sticky right-0 z-[100] !bg-muted shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.15)] border-l">
                  Thao tác
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, visibleRowCount).map((row, idx) => (
                <RowEditor
                  key={row.id}
                  row={row}
                  idx={idx}
                  locations={locations}
                  categories={categories}
                  classes={classes}
                  promotionOptions={promotionOptions}
                  surchargeOptions={surchargeOptions}
                  updateRow={updateRow}
                  updateAmount={updateAmount}
                  togglePromotion={togglePromotion}
                  toggleSurcharge={toggleSurcharge}
                  deleteRow={deleteRow}
                  duplicateRow={duplicateRow}
                  addRow={addRow}
                  atCap={rows.length >= MAX_ROWS}
                />
              ))}
              {visibleRowCount < rows.length && (
                <tr data-testid="row-skeleton-loading">
                  <td colSpan={19} className="p-4 text-center text-xs text-muted-foreground">
                    <Loader2 className="inline h-3 w-3 mr-2 animate-spin" />
                    Đang hiển thị {visibleRowCount}/{rows.length} dòng...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter className="px-6 py-3 border-t flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={addRow}
              data-testid="button-add-row-footer"
              disabled={rows.length >= MAX_ROWS || submitting}
              title={rows.length >= MAX_ROWS ? `Đã đạt tối đa ${MAX_ROWS} dòng` : undefined}
            >
              <Plus className="h-4 w-4 mr-1" /> Thêm dòng
            </Button>
            {restoredBanner && (
              <span
                className="inline-flex items-center gap-2 text-xs text-amber-800 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-200 px-2 py-1 rounded-md border border-amber-200 dark:border-amber-900"
                data-testid="banner-restored-draft"
              >
                <FileText className="h-3 w-3" /> Đã khôi phục nháp ({restoredBanner.count} dòng)
                <button
                  type="button"
                  className="ml-1 underline hover:no-underline"
                  onClick={() => {
                    try { localStorage.removeItem(DRAFTS_KEY); } catch {}
                    setRows([newRow()]);
                    setDraftCount(0);
                    setRestoredBanner(null);
                    setVisibleRowCount(INITIAL_RENDER_CHUNK);
                    toast({ title: "Đã bỏ nháp", description: "Bảng đã được làm trống." });
                  }}
                  data-testid="button-discard-restored-draft"
                >
                  Bỏ
                </button>
                <button
                  type="button"
                  className="ml-1 underline hover:no-underline"
                  onClick={() => setRestoredBanner(null)}
                  data-testid="button-dismiss-restored-banner"
                  title="Ẩn thông báo"
                >
                  Ẩn
                </button>
              </span>
            )}
            {!restoredBanner && draftCount > 0 && (
              <span
                className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 px-2 py-1 rounded-md border border-amber-200 dark:border-amber-900"
                data-testid="indicator-draft-loaded"
              >
                <FileText className="h-3 w-3" /> Đang chỉnh nháp ({draftCount} dòng)
              </span>
            )}
            {autoSavedAt && (
              <span className="text-[11px] text-muted-foreground" data-testid="text-autosaved-at">
                Tự động lưu lúc {new Date(autoSavedAt).toLocaleTimeString("vi-VN")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={
                "text-xs font-medium tabular-nums " +
                (rows.length >= MAX_ROWS
                  ? "text-red-600 dark:text-red-400"
                  : rows.length >= WARN_ROWS
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground")
              }
              data-testid="text-rows-counter"
            >
              {rows.length}/{MAX_ROWS} dòng
            </span>
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-bulk" disabled={submitting}>
              Đóng
            </Button>
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={submitting}
              data-testid="button-save-draft"
              className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300"
            >
              <FileText className="h-4 w-4 mr-1" /> Lưu nháp
            </Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700"
              onClick={handleSaveAll}
              disabled={submitting}
              data-testid="button-save-bulk"
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Đang lưu... ({submitElapsedSec}s)</>
              ) : (
                <><Save className="h-4 w-4 mr-1" /> Lưu tất cả</>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InvoiceExcelImportDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (file: File) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const headers = [
      "Cơ sở",
      "Mã học viên",
      "Họ và tên",
      "Loại",
      "Danh mục",
      "Mã sản phẩm",
      "Sản phẩm",
      "Mô tả",
      "Hình thức thanh toán",
      "Số tiền",
      "Đã thanh toán",
      "Đợt 2",
      "Đợt 3",
      "Đợt 4",
      "Hạn thanh toán",
      "Mã lớp",
    ];
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      headers,
      ["Cơ sở 1", "", "Nguyễn Văn A", "Thu", "Học phí", "", "Học phí tháng 9", "", "Tiền mặt", 1000000, 0, "", "", "", "30/09/2026", ""],
    ]);
    sheet["!cols"] = headers.map((header) => ({ wch: Math.max(16, Math.min(28, header.length + 4)) }));
    sheet["!freeze"] = { ySplit: 1 };
    sheet["!autofilter"] = { ref: `A1:P2` };
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { patternType: "solid", fgColor: { rgb: "4F46E5" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
    };
    headers.forEach((_, index) => {
      const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: index })];
      if (cell) cell.s = headerStyle;
    });
    XLSX.utils.book_append_sheet(workbook, sheet, "Nhap_hoa_don");
    const guide = XLSX.utils.aoa_to_sheet([
      ["Hướng dẫn nhập hóa đơn"],
      ["Cột bắt buộc", "Cơ sở, Họ và tên hoặc Mã học viên, Số tiền"],
      ["Cơ sở", "Nhập đúng tên, mã cơ sở hoặc UUID cơ sở đang có trên hệ thống."],
      ["Mã học viên", "Có thể để trống nếu đã nhập Họ và tên. UUID học viên sẽ được liên kết đúng hồ sơ."],
      ["Loại", "Thu hoặc Chi. Mặc định là Thu nếu để trống."],
      ["Danh mục", "Nhập đúng tên danh mục đang có trên hệ thống."],
      ["Đã thanh toán", "Số tiền đã thu. Để 0 nếu chưa thanh toán."],
      ["Đợt 2–4", "Nhập số tiền từng đợt nếu muốn chia nhiều đợt."],
      ["Hạn thanh toán", "Ngày đến hạn, định dạng dd/mm/yyyy hoặc yyyy-mm-dd; đây không phải ngày đã thanh toán."],
      ["Lưu ý", "Sau khi nhập file, hãy kiểm tra các dòng trong bảng rồi mới bấm Lưu tất cả."],
    ]);
    guide["!cols"] = [{ wch: 24 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(workbook, guide, "Huong_dan");
    XLSX.writeFile(workbook, "mau_nhap_hoa_don.xlsx");
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) setFile(null);
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            Nhập hóa đơn bằng Excel
          </DialogTitle>
          <DialogDescription>
            Tải file mẫu, điền dữ liệu rồi nhập vào bảng để kiểm tra trước khi lưu.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            <p className="font-semibold mb-1">Các cột bắt buộc</p>
            <p>Cơ sở, Họ và tên hoặc Mã học viên, Số tiền.</p>
            <p className="mt-1 text-xs text-blue-700">
              Bạn có thể dùng tên/mã cơ sở. Ngày ở cột Hạn thanh toán không phải ngày đã thanh toán.
            </p>
          </div>
          <Button variant="outline" className="w-full gap-2" onClick={downloadTemplate}>
            <Download className="h-4 w-4 text-indigo-600" />
            Tải file mẫu Excel
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              event.target.value = "";
              setFile(selected);
            }}
          />
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 text-emerald-600" />
            {file ? file.name : "Chọn file Excel đã điền"}
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Hủy</Button>
          <Button
            className="bg-purple-600 hover:bg-purple-700"
            disabled={!file}
            onClick={() => file && onImport(file)}
          >
            Nhập vào bảng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`p-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap ${className}`}>{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`p-1.5 align-middle ${className}`}>{children}</td>;
}

type RowEditorProps = {
  row: RowData;
  idx: number;
  locations: any[];
  categories: any[];
  classes: any[];
  promotionOptions: any[];
  surchargeOptions: any[];
  updateRow: (id: string, patch: Partial<RowData>) => void;
  updateAmount: (
    id: string,
    field: "amount" | "installment1" | "installment2" | "installment3" | "installment4",
    raw: string,
  ) => void;
  togglePromotion: (id: string, key: string) => void;
  toggleSurcharge: (id: string, key: string) => void;
  deleteRow: (id: string) => void;
  duplicateRow: (id: string) => void;
  addRow: () => void;
  atCap: boolean;
};

const RowEditor = memo(function RowEditor({
  row, idx, locations, categories, classes, promotionOptions, surchargeOptions,
  updateRow, updateAmount, togglePromotion, toggleSurcharge,
  deleteRow, duplicateRow, addRow, atCap,
}: RowEditorProps) {
  const catName = categories.find((c: any) => c.id === row.categoryId)?.name as string | undefined;
  const isHocPhi = catName === HOC_PHI;
  const errored = !!row._error;
  const baseAmount = toInt(row.amount);
  const promoAmt = calcAdjustment(baseAmount, row.promotionKeys, promotionOptions);
  const surchargeAmt = calcAdjustment(baseAmount, row.surchargeKeys, surchargeOptions);
  const computedTotal = Math.max(0, baseAmount - promoAmt + surchargeAmt);
  return (
    <tr
      className={"border-b group " + (errored ? "bg-red-50/40 dark:bg-red-950/20 ring-1 ring-inset ring-red-300 dark:ring-red-800" : "")}
      data-testid={`row-bulk-${row.id}`}
      title={errored ? row._error : undefined}
    >
      <Td className="text-center text-xs text-muted-foreground">
        {idx + 1}
        {errored && <div className="text-[10px] text-red-600 leading-tight mt-0.5">!</div>}
      </Td>
      <Td>
        <Select value={row.branchId} onValueChange={v => updateRow(row.id, { branchId: v })}>
          <SelectTrigger className="h-8 text-xs" data-testid={`select-branch-${row.id}`}>
            <SelectValue placeholder="Chọn cơ sở" />
          </SelectTrigger>
          <SelectContent>
            {locations.map((l: any) => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Td>
      <Td>
        <StudentCombobox
          branchId={row.branchId}
          value={row.studentId}
          label={row.studentLabel}
          onSelect={(id, label) => updateRow(row.id, { studentId: id, studentLabel: label })}
        />
      </Td>
      <Td>
        <Select value={row.type} onValueChange={(v: any) => updateRow(row.id, { type: v })}>
          <SelectTrigger className="h-8 text-xs" data-testid={`select-type-${row.id}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="income">Thu</SelectItem>
            <SelectItem value="expense">Chi</SelectItem>
          </SelectContent>
        </Select>
      </Td>
      <Td>
        <Select
          value={row.categoryId}
          onValueChange={v => updateRow(row.id, { categoryId: v, product: "", productLabel: "" })}
        >
          <SelectTrigger className="h-8 text-xs" data-testid={`select-category-${row.id}`}>
            <SelectValue placeholder="Chọn danh mục" />
          </SelectTrigger>
          <SelectContent>
            {categories
              .filter((c: any) => !c.type || c.type === row.type)
              .map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
          </SelectContent>
        </Select>
      </Td>
      <Td>
        {isHocPhi ? (
          <FeePackageCombobox
            branchId={row.branchId}
            value={row.product}
            label={row.productLabel}
            onSelect={(id, label, amount) => {
              if (amount && amount > 0) {
                const baseNum = Math.round(amount);
                const amountStr = String(baseNum);
                // Auto-fill đợt 1 with the computed Tổng tiền (base ± current promo/surcharge).
                const promo = calcAdjustment(baseNum, row.promotionKeys, promotionOptions);
                const surch = calcAdjustment(baseNum, row.surchargeKeys, surchargeOptions);
                const totalStr = String(Math.max(0, baseNum - promo + surch));
                updateRow(row.id, {
                  product: id,
                  productLabel: label,
                  amount: amountStr,
                  installment1: totalStr,
                  installment2: "",
                  installment3: "",
                  installment4: "",
                });
              } else {
                updateRow(row.id, { product: id, productLabel: label });
              }
            }}
          />
        ) : (
          <Input
            className="h-8 text-xs"
            value={row.product}
            onChange={e => updateRow(row.id, { product: e.target.value, productLabel: e.target.value })}
            data-testid={`input-product-${row.id}`}
          />
        )}
      </Td>
      <Td>
        <Input
          className="h-8 text-xs"
          value={row.description}
          onChange={e => updateRow(row.id, { description: e.target.value })}
          data-testid={`input-description-${row.id}`}
        />
      </Td>
      <Td>
        <Select value={row.paymentMethod} onValueChange={(v: any) => updateRow(row.id, { paymentMethod: v })}>
          <SelectTrigger className="h-8 text-xs" data-testid={`select-method-${row.id}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cash">Tiền mặt</SelectItem>
            <SelectItem value="transfer">Chuyển khoản</SelectItem>
          </SelectContent>
        </Select>
      </Td>
      <Td>
        <Input
          inputMode="numeric"
          className="h-8 text-xs text-right"
          value={formatNumber(row.amount)}
          onChange={e => updateAmount(row.id, "amount", e.target.value)}
          data-testid={`input-amount-${row.id}`}
        />
      </Td>
      <Td>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-full justify-between text-xs font-normal px-2"
              data-testid={`button-promotions-${row.id}`}
            >
              <span className={promoAmt > 0 ? "text-green-600 dark:text-green-500 truncate" : "text-muted-foreground truncate"}>
                {promoAmt > 0 ? `-${fmtMoney(promoAmt)}` : "Chọn..."}
              </span>
              <ChevronDown className="h-3 w-3 opacity-50 shrink-0 ml-1" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="end">
            {promotionOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">Chưa có khuyến mãi nào.</p>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {promotionOptions.map((p: any) => {
                  const checked = row.promotionKeys.includes(p.id);
                  const valueText = p.valueType === "percent"
                    ? `${parseFloat(p.valueAmount ?? "0")}%`
                    : fmtMoney(parseFloat(p.valueAmount ?? "0"));
                  return (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 p-1.5 rounded hover-elevate cursor-pointer"
                      data-testid={`label-promotion-${row.id}-${p.id}`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => togglePromotion(row.id, p.id)}
                        data-testid={`checkbox-promotion-${row.id}-${p.id}`}
                      />
                      <span className="text-xs flex-1 truncate">{p.name}</span>
                      <span className="text-xs text-green-600 dark:text-green-500 shrink-0">-{valueText}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </PopoverContent>
        </Popover>
      </Td>
      <Td>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-full justify-between text-xs font-normal px-2"
              data-testid={`button-surcharges-${row.id}`}
            >
              <span className={surchargeAmt > 0 ? "text-orange-600 dark:text-orange-500 truncate" : "text-muted-foreground truncate"}>
                {surchargeAmt > 0 ? `+${fmtMoney(surchargeAmt)}` : "Chọn..."}
              </span>
              <ChevronDown className="h-3 w-3 opacity-50 shrink-0 ml-1" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="end">
            {surchargeOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">Chưa có phụ thu nào.</p>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {surchargeOptions.map((s: any) => {
                  const checked = row.surchargeKeys.includes(s.id);
                  const valueText = s.valueType === "percent"
                    ? `${parseFloat(s.valueAmount ?? "0")}%`
                    : fmtMoney(parseFloat(s.valueAmount ?? "0"));
                  return (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 p-1.5 rounded hover-elevate cursor-pointer"
                      data-testid={`label-surcharge-${row.id}-${s.id}`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleSurcharge(row.id, s.id)}
                        data-testid={`checkbox-surcharge-${row.id}-${s.id}`}
                      />
                      <span className="text-xs flex-1 truncate">{s.name}</span>
                      <span className="text-xs text-orange-600 dark:text-orange-500 shrink-0">+{valueText}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </PopoverContent>
        </Popover>
      </Td>
      <Td>
        <div
          className="h-8 px-2 text-xs text-right font-medium tabular-nums flex items-center justify-end rounded border border-dashed border-muted-foreground/30 bg-muted/30"
          data-testid={`text-total-${row.id}`}
        >
          {fmtMoney(computedTotal)}
        </div>
      </Td>
      {(["installment1", "installment2", "installment3", "installment4"] as const).map(k => (
        <Td key={k}>
          <Input
            inputMode="numeric"
            className="h-8 text-xs text-right"
            value={formatNumber(row[k])}
            onChange={e => updateAmount(row.id, k, e.target.value)}
            data-testid={`input-${k}-${row.id}`}
          />
        </Td>
      ))}
      <Td>
        <Input
          type="date"
          className="h-8 text-xs"
          value={row.dueDate}
          onChange={e => updateRow(row.id, { dueDate: e.target.value })}
          data-testid={`input-duedate-${row.id}`}
        />
      </Td>
      <Td>
        <Select value={row.classId} onValueChange={v => updateRow(row.id, { classId: v })}>
          <SelectTrigger className="h-8 text-xs" data-testid={`select-class-${row.id}`}>
            <SelectValue placeholder="Chọn lớp (tuỳ chọn)" />
          </SelectTrigger>
          <SelectContent>
            {classes.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>{c.name ?? c.code}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Td>
      <Td className="w-28 min-w-[7rem] max-w-[7rem] sticky right-0 z-[90] !bg-white dark:!bg-background border-l shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.15)]">
        <div className="relative z-[91] flex items-center justify-center gap-0.5 bg-white dark:bg-background group-hover:bg-muted/30 dark:group-hover:bg-muted/30">
          <Button
            size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:bg-red-50"
            onClick={() => deleteRow(row.id)}
            data-testid={`button-delete-row-${row.id}`}
            title="Xoá"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon" variant="ghost" className="h-7 w-7 text-blue-600 hover:bg-blue-50"
            onClick={() => duplicateRow(row.id)}
            data-testid={`button-duplicate-row-${row.id}`}
            title="Nhân bản"
            disabled={atCap}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon" variant="ghost" className="h-7 w-7 text-emerald-600 hover:bg-emerald-50"
            onClick={addRow}
            data-testid={`button-add-row-${row.id}`}
            title="Thêm dòng"
            disabled={atCap}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </Td>
    </tr>
  );
});

function StudentCombobox({
  branchId, value, label, onSelect,
}: {
  branchId: string;
  value: string;
  label: string;
  onSelect: (id: string, label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (branchId) p.set("locationId", branchId);
    if (search) p.set("searchTerm", search);
    p.set("limit", "30");
    return p.toString();
  }, [branchId, search]);

  const { data: students = [] } = useQuery<any[]>({
    queryKey: ["/api/invoice/search-students", branchId, search],
    queryFn: () => apiRequest("GET", `/api/invoice/search-students?${params}`).then(r => r.json()),
    enabled: open,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="h-8 w-full justify-between text-xs font-normal"
          data-testid="combobox-student"
        >
          <span className="truncate">{label || "Chọn tên..."}</span>
          <ChevronsUpDown className="h-3 w-3 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-80" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Tìm theo tên hoặc mã..." value={search} onValueChange={setSearch} className="h-9" />
          <CommandList>
            <CommandEmpty>Không tìm thấy.</CommandEmpty>
            <CommandGroup>
              {students.map((s: any) => {
                const name = s.fullName ?? s.name ?? "";
                const lbl = name ? (s.code ? `${name} (${s.code})` : name) : (s.code ?? "—");
                const tag = s.entityType === "staff" ? "NV" : (s.type ?? null);
                return (
                  <CommandItem
                    key={`${s.entityType ?? "x"}-${s.id}`}
                    value={s.id}
                    onSelect={() => {
                      onSelect(s.id, lbl);
                      setOpen(false);
                    }}
                  >
                    <Check className={`h-3 w-3 mr-2 flex-shrink-0 ${value === s.id ? "opacity-100" : "opacity-0"}`} />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="truncate text-xs">{lbl}</span>
                      {(tag || s.phone) && (
                        <span className="text-[10px] text-muted-foreground truncate">
                          {tag ? `${tag}` : ""}{tag && s.phone ? " · " : ""}{s.phone ?? ""}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function FeePackageCombobox({
  branchId, value, label, onSelect,
}: {
  branchId: string;
  value: string;
  label: string;
  onSelect: (id: string, label: string, amount?: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: packages = [] } = useQuery<any[]>({
    queryKey: ["/api/fee-packages", branchId || "all"],
    queryFn: () => {
      const url = branchId
        ? `/api/fee-packages?locationId=${encodeURIComponent(branchId)}`
        : `/api/fee-packages`;
      return apiRequest("GET", url).then(r => r.json());
    },
    enabled: open,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return packages;
    return packages.filter((p: any) => {
      const hay = `${p.name ?? ""} ${p.courseName ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [packages, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="h-8 w-full justify-between text-xs font-normal"
          data-testid="combobox-fee-package"
        >
          <span className="truncate">{label || "Chọn gói học phí..."}</span>
          <ChevronsUpDown className="h-3 w-3 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-80" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Tìm gói học phí..." value={search} onValueChange={setSearch} className="h-9" />
          <CommandList>
            <CommandEmpty>Không tìm thấy gói học phí.</CommandEmpty>
            <CommandGroup>
              {filtered.map((p: any) => {
                const amount = parseFloat(p.totalAmount ?? p.fee ?? "0") || 0;
                const formattedAmt = amount
                  ? amount.toLocaleString("vi-VN") + " ₫"
                  : "";
                const lbl = p.courseName ? `${p.name} — ${p.courseName}` : p.name;
                return (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    onSelect={() => {
                      onSelect(p.id, lbl, amount);
                      setOpen(false);
                    }}
                  >
                    <Check className={`h-3 w-3 mr-2 flex-shrink-0 ${value === p.id ? "opacity-100" : "opacity-0"}`} />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="truncate text-xs">{lbl}</span>
                      {formattedAmt && (
                        <span className="text-[10px] text-muted-foreground">{formattedAmt}</span>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
