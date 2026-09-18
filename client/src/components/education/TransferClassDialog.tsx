import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  Check,
  ChevronsUpDown,
  ChevronDown,
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  FileText,
  Wallet,
  X,
} from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { FinancePromotionDialog } from "@/pages/finance/components/FinancePromotionDialog";

const transferSchema = z.object({
  studentId: z.string().uuid(),
  fromClassId: z.string().uuid(),
  toClassId: z.string().uuid({ message: "Vui lòng chọn lớp mới" }),
  fromSessionIndex: z.coerce.number().int().min(1, "Vui lòng chọn buổi bắt đầu chuyển"),
  toSessionIndex: z.coerce.number().int().min(1, "Vui lòng chọn buổi bắt đầu ở lớp mới"),
  transferCount: z.coerce.number().int().min(1, "Số buổi chuyển phải ít nhất là 1"),
});

type TransferFormValues = z.infer<typeof transferSchema>;

interface TransferClassDialogProps {
  isOpen: boolean;
  onClose: () => void;
  student: {
    id: string;
    fullName: string;
  };
  currentClass: {
    id: string;
    name: string;
    classCode: string;
    locationId?: string;
    teacherName?: string;
    weekdays: number[];
  };
}

const formatCurrencyValue = (amount: number) =>
  new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);

const formatCurrency = (amount: number) => formatCurrencyValue(amount) + "đ";

const formatPercent = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value) || value <= 0) return "";
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(2).replace(/\.?0+$/, "")}%`;
};

const isCoursePackage = (pkg: any) =>
  pkg?.type === "khoá" || pkg?.type === "khóa";

const packageTypeLabel = (pkg: any) =>
  isCoursePackage(pkg) ? "Khóa" : pkg?.type === "buổi" ? "Buổi" : "";

const getPackageSessionCount = (pkg: any, fallback = 0) => {
  const sessions = Number(pkg?.sessions);
  return sessions > 0 ? sessions : fallback;
};

const getPackageBaseSessionPrice = (pkg: any, fallback = 0) => {
  if (!pkg) return fallback;
  const sessions = getPackageSessionCount(pkg);
  if (isCoursePackage(pkg) && sessions > 0) {
    const total = Number(pkg.totalAmount ?? pkg.fee ?? 0);
    return total / sessions;
  }
  return Number(pkg.fee ?? fallback) || fallback;
};

const getPackageBaseTotal = (pkg: any, fallback = 0) => {
  if (!pkg) return fallback;
  const sessions = getPackageSessionCount(pkg);
  if (isCoursePackage(pkg)) {
    return Number(pkg.totalAmount ?? pkg.fee ?? 0);
  }
  return (Number(pkg.fee ?? 0) || 0) * sessions;
};

type TransferAdjustmentRow = {
  id: string;
  optionKey?: string;
  valueType: "amount" | "percent";
  value: number;
};

const normalizeSearchText = (value: unknown) =>
  String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const formatPromotionLabel = (option: any) =>
  option?.kind === "voucher" ? `Voucher: ${option.name}` : option?.name;

const applyTransferPromotions = (
  startingAmount: number,
  keys: string[],
  rows: TransferAdjustmentRow[],
  options: any[],
) => {
  const representedKeys = new Set(rows.map((row) => row.optionKey).filter(Boolean));
  const orderedRows: TransferAdjustmentRow[] = [
    ...rows,
    ...keys
      .filter((key) => !representedKeys.has(key))
      .map((key, index) => ({
        id: `legacy-transfer-promotion-${index}-${key}`,
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
    currentAmount = Math.max(0, currentAmount - adjustment);
  };

  orderedRows.forEach((row) => {
    if (row.optionKey && !appliedOptionKeys.has(row.optionKey)) {
      appliedOptionKeys.add(row.optionKey);
      const option = options.find((item: any) => item.id === row.optionKey);
      if (option) {
        applyValue(
          option.valueType === "percent" ? "percent" : "amount",
          Number(option.valueAmount ?? 0),
        );
      }
    }
    if (row.value > 0) applyValue(row.valueType, row.value);
  });

  return {
    finalAmount: currentAmount,
    adjustmentAmount: Math.max(0, startingAmount - currentAmount),
  };
};

export function TransferClassDialog({
  isOpen,
  onClose,
  student,
  currentClass,
}: TransferClassDialogProps) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTargetPackageId, setSelectedTargetPackageId] = useState<string>("");
  const [isTargetClassPickerOpen, setIsTargetClassPickerOpen] = useState(false);
  const [isTargetDiscountDialogOpen, setIsTargetDiscountDialogOpen] = useState(false);
  const [targetPromotionSearch, setTargetPromotionSearch] = useState("");
  const [targetPromotionKeys, setTargetPromotionKeys] = useState<string[]>([]);
  const [targetPromotionRows, setTargetPromotionRows] = useState<TransferAdjustmentRow[]>([]);
  const [openTargetPromotionPicker, setOpenTargetPromotionPicker] = useState<string | null>(null);
  const [quickCreatePromotionOpen, setQuickCreatePromotionOpen] = useState(false);
  const [autoInvoice, setAutoInvoice] = useState(true);
  const [invoiceCategory, setInvoiceCategory] = useState<"Hoàn học phí" | "Đặt cọc">("Hoàn học phí");
  const [refundMethod, setRefundMethod] = useState<"invoice" | "deposit">("invoice");
  const [actualSessionCount, setActualSessionCount] = useState(0);
  const [roundingMode, setRoundingMode] = useState<"none" | "down" | "up">("none");
  const { data: myPerms } = useMyPermissions();
  const canCreatePromotion = Boolean(
    myPerms?.isSuperAdmin || myPerms?.permissions["/finance-config#promotions"]?.canCreate,
  );

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      studentId: student?.id,
      fromClassId: currentClass?.id,
      toClassId: "",
      fromSessionIndex: 1,
      toSessionIndex: 1,
      transferCount: 1,
    },
  });

  const selectedToClassId = form.watch("toClassId");
  const fromSessionIndex = form.watch("fromSessionIndex");
  const toSessionIndex = form.watch("toSessionIndex");
  const transferCount = Number(form.watch("transferCount") || 0);

  // Fetch student sessions in current class
  const { data: currentSessions, isLoading: loadingCurrent } = useQuery<any[]>({
    queryKey: ["/api/classes", currentClass?.id, "student", student?.id, "sessions"],
    enabled: isOpen && !!currentClass?.id && !!student?.id,
  });

  // Fetch available classes for transfer
  const { data: availableClasses, isLoading: loadingClasses } = useQuery<any[]>({
    queryKey: ["/api/classes"],
    enabled: isOpen,
  });

  // Fetch all fee packages to resolve class fee packages
  const { data: allFeePackages } = useQuery<any[]>({
    queryKey: ["/api/fee-packages"],
    enabled: isOpen,
  });

  const { data: promotionOptions = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/promotions", { type: "promotion" }],
    queryFn: () => apiRequest("GET", "/api/finance/promotions?type=promotion").then((response) => response.json()),
    enabled: isOpen,
  });

  const transferAsOfDate = format(new Date(), "yyyy-MM-dd");
  const { data: availableVouchers = [] } = useQuery<any[]>({
    queryKey: ["/api/finance/vouchers/available", student?.id, transferAsOfDate],
    queryFn: () => {
      const params = new URLSearchParams({
        studentId: student.id,
        asOfDate: transferAsOfDate,
      });
      return apiRequest("GET", `/api/finance/vouchers/available?${params}`).then((response) => response.json());
    },
    enabled: isOpen && Boolean(student?.id),
    staleTime: 15_000,
  });

  const promotionOptionsWithVouchers = [...promotionOptions, ...availableVouchers];

  // Filter classes inside the target-class picker.
  const filteredClasses = availableClasses?.filter(
    (c) =>
      c.id !== currentClass?.id &&
      (c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.classCode.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const hasTransferSchedule = (classItem: any) => Number(classItem?.totalSessions ?? 0) > 0;

  // Fetch sessions for the selected target class
  const { data: targetSessions, isLoading: loadingTarget } = useQuery<any[]>({
    queryKey: ["/api/classes", selectedToClassId, "sessions"],
    enabled: !!selectedToClassId,
  });

  // Auto-calculate transferCount = number of sessions from selected index to end
  useEffect(() => {
    if (!currentSessions || currentSessions.length === 0) return;
    const idx = Number(fromSessionIndex);
    if (!idx) return;
    const remaining = currentSessions.filter((s) => {
      const sessionIndex = s.classSession?.sessionIndex ?? s.sessionIndex;
      return sessionIndex != null && Number(sessionIndex) >= idx;
    }).length;
    if (remaining > 0) {
      form.setValue("transferCount", remaining, { shouldValidate: false });
    }
  }, [fromSessionIndex, currentSessions]);

  // Default to the student's actual enrolled session count, while allowing
  // the operator to adjust the denominator for the transfer calculation.
  useEffect(() => {
    if (!isOpen || !currentClass?.id || !student?.id) return;
    const registeredCount = currentSessions?.length ?? 0;
    if (registeredCount > 0) {
      setActualSessionCount(registeredCount);
    }
  }, [isOpen, currentClass?.id, student?.id, currentSessions?.length]);

  // Reset target package when class changes
  useEffect(() => {
    setSelectedTargetPackageId("");
    setTargetPromotionKeys([]);
    setTargetPromotionRows([]);
    setIsTargetDiscountDialogOpen(false);
    setOpenTargetPromotionPicker(null);
  }, [selectedToClassId]);

  // Auto-select fee package of target class (use class's feePackageId or first from course)
  const targetClass = availableClasses?.find((c) => c.id === selectedToClassId);
  const targetFeePackages: any[] = (() => {
    if (!targetClass || !allFeePackages) return [];
    const byCourse = targetClass.courseId
      ? allFeePackages.filter((p) => p.courseId === targetClass.courseId)
      : [];
    if (byCourse.length > 0) return byCourse;
    // Fallback: if class has a direct feePackageId, include that single package
    if (targetClass.feePackageId) {
      const direct = allFeePackages.find((p) => p.id === targetClass.feePackageId);
      return direct ? [direct] : [];
    }
    return [];
  })();

  useEffect(() => {
    if (!selectedToClassId) return;
    if (targetFeePackages.length > 0) {
      // Pre-select the class's own feePackageId if available, else first package
      const defaultPkg = targetClass?.feePackageId
        ? targetFeePackages.find((p) => p.id === targetClass.feePackageId)
        : null;
      setSelectedTargetPackageId(defaultPkg?.id ?? targetFeePackages[0].id);
    }
  }, [selectedToClassId, targetFeePackages.length]);

  useEffect(() => {
    setTargetPromotionKeys([]);
    setTargetPromotionRows([]);
    setOpenTargetPromotionPicker(null);
  }, [selectedTargetPackageId]);

  const ensureTargetPromotionRows = (
    keys: string[],
    rows: TransferAdjustmentRow[],
  ): TransferAdjustmentRow[] => {
    const representedKeys = new Set(rows.map((row) => row.optionKey).filter(Boolean));
    const keyRows = keys
      .filter((key) => !representedKeys.has(key))
      .map((key, index) => ({
        id: `transfer-promotion-option-${index}-${key}`,
        optionKey: key,
        valueType: "amount" as const,
        value: 0,
      }));
    if (rows.length > 0 || keyRows.length > 0) return [...rows, ...keyRows];
    return [{
      id: `transfer-promotion-blank-${Date.now()}`,
      valueType: "amount",
      value: 0,
    }];
  };

  const openTargetDiscountPicker = () => {
    if (!selectedTargetPackage) return;
    setTargetPromotionRows((rows) => ensureTargetPromotionRows(targetPromotionKeys, rows));
    setTargetPromotionSearch("");
    setOpenTargetPromotionPicker(null);
    setIsTargetDiscountDialogOpen(true);
  };

  const addTargetPromotionRow = () => {
    setTargetPromotionRows((rows) => [
      ...rows,
      {
        id: `transfer-promotion-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        valueType: "amount",
        value: 0,
      },
    ]);
  };

  const updateTargetPromotionRow = (
    rowId: string,
    patch: Partial<TransferAdjustmentRow>,
  ) => {
    setTargetPromotionRows((rows) =>
      rows.map((row) => row.id === rowId ? { ...row, ...patch } : row),
    );
  };

  const selectTargetPromotionOption = (rowId: string, optionKey: string) => {
    setTargetPromotionRows((rows) => {
      const nextRows = rows.map((row) => row.id === rowId ? { ...row, optionKey } : row);
      setTargetPromotionKeys(
        Array.from(new Set(nextRows.map((row) => row.optionKey).filter((key): key is string => Boolean(key))),
      ));
      return nextRows;
    });
  };

  const removeTargetPromotionRow = (rowId: string) => {
    setTargetPromotionRows((rows) => {
      const nextRows = rows.filter((row) => row.id !== rowId);
      setTargetPromotionKeys(
        Array.from(new Set(nextRows.map((row) => row.optionKey).filter((key): key is string => Boolean(key))),
      ));
      return nextRows;
    });
  };

  const createPromotionMutation = useMutation({
    mutationFn: async (data: {
      code: string;
      name: string;
      valueAmount: string | null;
      valueType: "percent" | "vnd";
      quantity: number | null;
      fromDate: string | null;
      toDate: string | null;
    }) => {
      const response = await apiRequest("POST", "/api/finance/promotions", {
        ...data,
        type: "promotion",
      });
      return response.json();
    },
    onSuccess: (created: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/promotions"] });
      if (created?.id) {
        setTargetPromotionRows((rows) => {
          const blankRow = rows.find((row) => !row.optionKey);
          const nextRows = blankRow
            ? rows.map((row) => row.id === blankRow.id ? { ...row, optionKey: created.id } : row)
            : [
                ...rows,
                {
                  id: `transfer-promotion-created-${created.id}`,
                  optionKey: created.id,
                  valueType: "amount" as const,
                  value: 0,
                },
              ];
          setTargetPromotionKeys(
            Array.from(new Set(nextRows.map((row) => row.optionKey).filter((key): key is string => Boolean(key))),
          ));
          return nextRows;
        });
      }
      setQuickCreatePromotionOpen(false);
      toast({ title: "Đã thêm giảm trừ", description: "Giảm trừ mới đã được chọn cho lớp mới." });
    },
    onError: (error: any) => {
      toast({
        title: "Không thể thêm giảm trừ",
        description: error.message || "Vui lòng thử lại",
        variant: "destructive",
      });
    },
  });

  // Current class fee info from student's sessions
  const currentSession = currentSessions?.find((s) => {
    const idx = s.classSession?.sessionIndex ?? s.sessionIndex;
    return Number(idx) === Number(fromSessionIndex);
  }) ?? currentSessions?.[0];
  const currentFeePackage = currentSession?.feePackage;
  const currentStoredSessionPrice = currentSession ? Number(currentSession.sessionPrice ?? 0) : 0;
  // For an enrolled student, the invoice allocation is based on the actual
  // number of registered sessions, which can differ from the package template
  // (e.g. a 20-session course package applied to 49 enrolled sessions).
  const currentRegisteredSessionCount = currentSessions?.length ?? 0;
  const currentSessionCount = actualSessionCount > 0
    ? actualSessionCount
    : currentRegisteredSessionCount > 0
    ? currentRegisteredSessionCount
    : getPackageSessionCount(currentFeePackage);
  const currentBaseSessionPrice = getPackageBaseSessionPrice(currentFeePackage, currentStoredSessionPrice);
  const currentBaseTotal = getPackageBaseTotal(
    currentFeePackage,
    currentBaseSessionPrice * currentSessionCount,
  );
  const currentDiscountPerSession = Number(currentSession?.pricing?.discountAmount ?? 0);
  // Keep the invoice's total discount stable when the operator changes the
  // editable session count; the source allocation was created for the
  // student's original registered session count.
  const currentDiscountAmount = currentDiscountPerSession
    * (currentRegisteredSessionCount > 0 ? currentRegisteredSessionCount : currentSessionCount);
  const currentDiscountPercent = currentSession?.pricing?.discountPercent ?? null;
  const currentAllocatedSessionPrice = Number(currentSession?.pricing?.allocatedFee ?? 0);
  const hasCurrentPackagePrice = !!currentFeePackage && currentBaseSessionPrice > 0;
  const currentNetTotal = Math.max(0, currentBaseTotal - currentDiscountAmount);
  const currentSessionPrice = currentSessionCount > 0 && (currentAllocatedSessionPrice > 0 || currentNetTotal > 0)
    ? Number((currentNetTotal / currentSessionCount).toFixed(2))
    : hasCurrentPackagePrice
    ? Math.max(0, currentBaseSessionPrice - currentDiscountPerSession)
    : currentStoredSessionPrice;
  const exactCurrentTotal = currentSessionPrice * transferCount;
  const currentTotal = roundingMode === "down"
    ? Math.floor(exactCurrentTotal)
    : roundingMode === "up"
    ? Math.ceil(exactCurrentTotal)
    : exactCurrentTotal;

  // Target class fee info
  const selectedTargetPackage = targetFeePackages.find((p) => p.id === selectedTargetPackageId);
  const targetPackageSessionCount = getPackageSessionCount(selectedTargetPackage);
  const targetBaseTotal = getPackageBaseTotal(
    selectedTargetPackage,
    getPackageBaseSessionPrice(selectedTargetPackage) * targetPackageSessionCount,
  );
  const targetPromotionResult = applyTransferPromotions(
    targetBaseTotal,
    targetPromotionKeys,
    targetPromotionRows,
    promotionOptionsWithVouchers,
  );
  const normalizedTargetPromotionSearch = normalizeSearchText(targetPromotionSearch);
  const filteredTargetPromotions = promotionOptionsWithVouchers.filter((option: any) =>
    !normalizedTargetPromotionSearch ||
    normalizeSearchText(`${option.name ?? ""} ${option.code ?? ""}`).includes(normalizedTargetPromotionSearch),
  );
  const targetDiscountAmount = targetPromotionResult.adjustmentAmount;
  const targetTotalAfterDiscount = targetPromotionResult.finalAmount;
  const targetSessionPrice = targetPackageSessionCount > 0
    ? Number((targetTotalAfterDiscount / targetPackageSessionCount).toFixed(2))
    : getPackageBaseSessionPrice(selectedTargetPackage);
  const targetTotal = targetSessionPrice * transferCount;

  // Financial difference
  const diff = targetTotal - currentTotal;
  const refundAmount = Number(Math.abs(diff).toFixed(2));
  const shouldRefundToDeposit = diff < 0 && refundMethod === "deposit";

  const { data: feeWalletData, isLoading: loadingFeeWallet } = useQuery<{
    summary?: { hocPhi?: number };
  }>({
    queryKey: ["/api/students", student?.id, "fee-wallet"],
    enabled: isOpen && !!student?.id && shouldRefundToDeposit,
  });
  const tuitionWalletBalance = Number(feeWalletData?.summary?.hocPhi ?? 0);
  const insufficientTuitionWallet =
    shouldRefundToDeposit &&
    !loadingFeeWallet &&
    refundAmount > tuitionWalletBalance + 0.000001;

  // Session info for invoice note
  const getDayName = (day: number) => {
    const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    return days[day] || "";
  };

  const getFromSessionLabel = () => {
    const s = currentSessions?.find((s) => {
      const idx = s.classSession?.sessionIndex ?? s.sessionIndex;
      return Number(idx) === Number(fromSessionIndex);
    });
    if (!s) return `Buổi ${fromSessionIndex}`;
    const date = s.classSession?.sessionDate ?? s.sessionDate;
    return `Buổi ${fromSessionIndex}: ${getDayName(new Date(date).getDay())}, ${format(new Date(date), "dd/MM/yyyy")}`;
  };

  const getToSessionLabel = () => {
    const s = targetSessions?.find((s) => Number(s.sessionIndex) === Number(toSessionIndex));
    if (!s) return `Buổi ${toSessionIndex}`;
    return `Buổi ${toSessionIndex}: ${getDayName(new Date(s.sessionDate).getDay())}, ${format(new Date(s.sessionDate), "dd/MM/yyyy")}`;
  };

  const buildInvoiceNote = () => {
    const fromName = `${currentClass.name}`;
    const toName = `${targetClass?.name || ""}`;
    const fromLabel = getFromSessionLabel();
    const toLabel = getToSessionLabel();
    const suffix = diff > 0
      ? `Do lớp ${toName} học phí cao hơn`
      : diff < 0
      ? `Do lớp ${toName} học phí thấp hơn`
      : `Do học phí 2 lớp bằng nhau`;

    if (diff >= 0) {
      return `Thu tiền Chuyển lớp ${fromName}, ${transferCount} buổi bắt đầu từ ${fromLabel} Sang Lớp ${toName}, ${transferCount} buổi bắt đầu từ ${toLabel}. ${suffix}`;
    } else {
      return `Hoàn tiền Chuyển lớp ${fromName}, ${transferCount} buổi bắt đầu từ ${fromLabel} Sang Lớp ${toName}, ${transferCount} buổi bắt đầu từ ${toLabel}. ${suffix}`;
    }
  };

  const createInvoiceMutation = useMutation({
    mutationFn: async (invoiceData: any) => {
      await apiRequest("POST", "/api/finance/invoices", invoiceData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
    },
  });

  const transferMutation = useMutation({
    mutationFn: async (values: TransferFormValues) => {
      await apiRequest("POST", "/api/students/transfer-class", {
        ...values,
        refundToDepositAmount: shouldRefundToDeposit ? refundAmount : undefined,
        refundDescription: shouldRefundToDeposit ? buildInvoiceNote() : undefined,
      });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${currentClass?.id}/active-students`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${currentClass?.id}/sessions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${currentClass?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/classes", currentClass?.id] });
      queryClient.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/class-sessions/") && key.endsWith("/student-sessions");
        }
      });

      if (shouldRefundToDeposit) {
        queryClient.invalidateQueries({ queryKey: ["/api/students", student.id, "fee-wallet"] });
      } else if (autoInvoice) {
        const invoiceType = diff < 0 ? "Chi" : "Thu";
        const category = diff < 0 ? invoiceCategory : "Học phí";
        const amount = Math.round(Math.abs(diff));
        await createInvoiceMutation.mutateAsync({
          type: invoiceType,
          studentId: student.id,
          classId: currentClass.id,
          locationId: currentClass.locationId || undefined,
          category,
          totalAmount: amount.toString(),
          grandTotal: amount.toString(),
          paidAmount: "0",
          status: "unpaid",
          description: buildInvoiceNote(),
          items: [],
          paymentSchedule: [],
        });
      }

      toast({
        title: "Thành công",
        description: shouldRefundToDeposit
          ? "Đã chuyển lớp và chuyển tiền hoàn vào ví cọc"
          : autoInvoice
          ? "Đã chuyển lớp và tạo hoá đơn thành công"
          : "Đã chuyển lớp cho học viên thành công",
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể chuyển lớp",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: TransferFormValues) => {
    if (shouldRefundToDeposit && (loadingFeeWallet || insufficientTuitionWallet)) {
      toast({
        title: "Không thể chuyển lớp",
        description: loadingFeeWallet
          ? "Đang kiểm tra số dư ví học phí, vui lòng thử lại sau"
          : `Ví học phí không đủ số dư để hoàn ${formatCurrency(refundAmount)}`,
        variant: "destructive",
      });
      return;
    }
    transferMutation.mutate(values);
  };

  const isPending = transferMutation.isPending || createInvoiceMutation.isPending;

  if (!student || !currentClass) return null;

  const showFinancial = selectedToClassId && currentSessionPrice > 0 && targetSessionPrice > 0 && transferCount > 0;

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-screen h-screen max-w-none max-h-screen overflow-y-auto rounded-none">
        <DialogHeader>
          <DialogTitle>Chuyển lớp: {student.fullName}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* LỚP HIỆN TẠI */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-semibold text-primary">LỚP HIỆN TẠI</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm md:grid-cols-[1.25fr_1.5fr_0.75fr]">
                    <p
                      className="min-w-0 truncate text-foreground"
                      title={`${currentClass.name} (${currentClass.classCode})`}
                    >
                      <span className="font-semibold">Tên lớp:</span>{" "}
                      <span>{currentClass.name} ({currentClass.classCode})</span>
                    </p>
                    <p
                      className="min-w-0 truncate text-foreground"
                      title={currentClass.teacherName || "Chưa gán"}
                    >
                      <span className="font-semibold">Giáo viên:</span>{" "}
                      <span>{currentClass.teacherName || "Chưa gán"}</span>
                    </p>
                    <p className="min-w-0 truncate text-foreground">
                      <span className="font-semibold">Chu kỳ:</span>{" "}
                      <span>{currentClass.weekdays?.map(getDayName).join(", ") || "—"}</span>
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="fromSessionIndex"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Chọn buổi bắt đầu chuyển</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value?.toString()}
                            disabled={loadingCurrent}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-from-session">
                                <SelectValue placeholder="Chọn buổi học" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {currentSessions?.map((s) => {
                                const sessionIndex = s.classSession?.sessionIndex ?? s.sessionIndex;
                                const sessionDate = s.classSession?.sessionDate ?? s.sessionDate;
                                if (sessionIndex == null || !sessionDate) return null;
                                return (
                                  <SelectItem key={s.id} value={sessionIndex.toString()}>
                                    Buổi {sessionIndex}: {getDayName(new Date(sessionDate).getDay())}, {format(new Date(sessionDate), "dd/MM/yyyy")}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="transferCount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Số buổi chuyển</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              min={1}
                              data-testid="input-transfer-count"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Fee summary - current class */}
                  <div className="rounded-md border bg-muted/40 p-3 space-y-1.5 text-sm">
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-muted-foreground">Gói học phí:</span>
                      <span className="font-medium text-right">
                        {currentFeePackage?.name || "—"}
                        {packageTypeLabel(currentFeePackage) && (
                          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0">
                            {packageTypeLabel(currentFeePackage)}
                          </Badge>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tổng học phí:</span>
                      <span className="font-medium">
                        {currentBaseTotal > 0 ? formatCurrency(currentBaseTotal) : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Giảm trừ:</span>
                      <span className="font-medium">
                        {currentDiscountAmount > 0
                          ? `${formatCurrency(currentDiscountAmount)}${formatPercent(currentDiscountPercent) ? ` (${formatPercent(currentDiscountPercent)})` : ""}`
                          : "0đ"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sau giảm trừ:</span>
                      <span className="font-medium">
                        {currentNetTotal > 0 ? formatCurrency(currentNetTotal) : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Số buổi đăng ký thực tế:</span>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={actualSessionCount > 0 ? actualSessionCount : ""}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            setActualSessionCount(Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);
                          }}
                          className="h-7 w-24 text-right"
                          disabled={loadingCurrent}
                          data-testid="input-actual-session-count"
                        />
                        <span className="font-medium">buổi</span>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Đơn giá sau giảm:</span>
                      <span className="font-medium">
                        {currentSessionPrice > 0 ? formatCurrency(currentSessionPrice) + "/buổi" : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between border-t pt-1.5 mt-1">
                      <span className="font-medium">Thành tiền:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {transferCount > 0 && currentSessionPrice > 0 ? (
                            <span className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                              <span className="text-[11px] font-normal text-muted-foreground whitespace-nowrap">
                                ({formatCurrencyValue(currentSessionPrice)} x {transferCount})
                              </span>
                              <span>{formatCurrency(currentTotal)}</span>
                            </span>
                          ) : "—"}
                        </span>
                        {transferCount > 0 && currentSessionPrice > 0 && (
                          <Select
                            value={roundingMode}
                            onValueChange={(value) => setRoundingMode(value as "none" | "down" | "up")}
                          >
                            <SelectTrigger
                              className="h-7 w-[126px] text-xs"
                              data-testid="select-rounding-mode"
                            >
                              <SelectValue placeholder="Làm tròn" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none" className="text-xs">Không làm tròn</SelectItem>
                              <SelectItem value="down" className="text-xs">Bỏ phần lẻ</SelectItem>
                              <SelectItem value="up" className="text-xs">Làm tròn lên</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* LỚP MỚI */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-semibold text-primary">LỚP MỚI</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="min-h-5" aria-hidden="true" />
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="toClassId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Chọn lớp mới</FormLabel>
                          <Popover
                            open={isTargetClassPickerOpen}
                            onOpenChange={setIsTargetClassPickerOpen}
                          >
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  type="button"
                                  variant="outline"
                                  role="combobox"
                                  aria-expanded={isTargetClassPickerOpen}
                                  className="w-full justify-between font-normal"
                                  disabled={loadingClasses}
                                  data-testid="select-to-class"
                                >
                                  {targetClass
                                    ? `${targetClass.name} (${targetClass.classCode})`
                                    : loadingClasses
                                    ? "Đang tải danh sách lớp..."
                                    : "Chọn lớp đích"}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                              <Command shouldFilter={false}>
                                <CommandInput
                                  placeholder="Tìm kiếm lớp..."
                                  value={searchTerm}
                                  onValueChange={setSearchTerm}
                                />
                                <CommandList>
                                  <CommandEmpty>Không tìm thấy lớp</CommandEmpty>
                                  <CommandGroup>
                                    {filteredClasses?.map((c) => {
                                      const canTransfer = hasTransferSchedule(c);
                                      const isSelected = c.id === field.value;
                                      return (
                                        <CommandItem
                                          key={c.id}
                                          value={`${c.name} ${c.classCode}`}
                                          disabled={!canTransfer}
                                          onSelect={() => {
                                            if (!canTransfer) return;
                                            field.onChange(c.id);
                                            setIsTargetClassPickerOpen(false);
                                            setSearchTerm("");
                                          }}
                                          className={cn(
                                            !canTransfer && "cursor-not-allowed opacity-40",
                                          )}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              isSelected ? "opacity-100" : "opacity-0",
                                            )}
                                          />
                                          <span className="truncate">
                                            {c.name} ({c.classCode})
                                          </span>
                                          {!canTransfer && (
                                            <span className="ml-auto text-xs text-muted-foreground">
                                              Chưa có lịch
                                            </span>
                                          )}
                                        </CommandItem>
                                      );
                                    })}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="toSessionIndex"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Chọn buổi bắt đầu ở lớp mới</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value?.toString()}
                            disabled={!selectedToClassId || loadingTarget}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-to-session">
                                <SelectValue placeholder={!selectedToClassId ? "Vui lòng chọn lớp mới trước" : "Chọn buổi học"} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {targetSessions?.map((s) => {
                                if (s.sessionIndex == null || !s.sessionDate) return null;
                                return (
                                  <SelectItem key={s.id} value={s.sessionIndex.toString()}>
                                    Buổi {s.sessionIndex}: {getDayName(new Date(s.sessionDate).getDay())}, {format(new Date(s.sessionDate), "dd/MM/yyyy")}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Fee summary - new class */}
                  <div className="rounded-md border bg-muted/40 p-3 space-y-1.5 text-sm">
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-muted-foreground">Gói học phí:</span>
                      {selectedToClassId && targetFeePackages.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <Select
                            value={selectedTargetPackageId}
                            onValueChange={setSelectedTargetPackageId}
                          >
                            <SelectTrigger className="h-7 w-auto min-w-[140px] text-xs border-0 shadow-none bg-transparent p-0 pr-6 font-medium" data-testid="select-target-package">
                              <SelectValue placeholder="Chọn gói" />
                            </SelectTrigger>
                            <SelectContent>
                              {targetFeePackages.map((p) => (
                                <SelectItem key={p.id} value={p.id} className="text-xs">
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {packageTypeLabel(selectedTargetPackage) && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                              {packageTypeLabel(selectedTargetPackage)}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="font-medium text-muted-foreground">
                          {selectedToClassId ? "Không có gói" : "—"}
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tổng học phí:</span>
                      <span className="font-medium">
                        {targetBaseTotal > 0 ? formatCurrency(targetBaseTotal) : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Giảm trừ:</span>
                      <Dialog
                        open={isTargetDiscountDialogOpen}
                        onOpenChange={(open) => {
                          setIsTargetDiscountDialogOpen(open);
                          if (open) {
                            setTargetPromotionSearch("");
                            setOpenTargetPromotionPicker(null);
                            setTargetPromotionRows((rows) => ensureTargetPromotionRows(targetPromotionKeys, rows));
                          } else {
                            setOpenTargetPromotionPicker(null);
                          }
                        }}
                      >
                        <button
                          type="button"
                          className={cn(
                            "flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-right text-sm transition-colors",
                            selectedTargetPackage
                              ? "hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-950/30"
                              : "cursor-not-allowed text-muted-foreground opacity-60",
                          )}
                          onClick={openTargetDiscountPicker}
                          disabled={!selectedTargetPackage}
                          data-testid="button-target-discount"
                        >
                          <span className={targetDiscountAmount > 0 ? "font-semibold text-green-600" : "font-medium"}>
                            {targetDiscountAmount > 0 ? `- ${formatCurrency(targetDiscountAmount)}` : "0đ"}
                          </span>
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </button>
                        <DialogContent
                          className="w-[min(92vw,40rem)] max-h-[90vh] overflow-y-auto rounded-xl p-6"
                          overlayClassName="bg-black/30 backdrop-blur-[1px]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <DialogTitle className="text-xl font-semibold">Chọn giảm trừ</DialogTitle>
                            {canCreatePromotion && (
                              <button
                                type="button"
                                className="inline-flex items-center gap-0.5 text-[11px] font-medium text-purple-600 hover:text-purple-700"
                                onClick={() => setQuickCreatePromotionOpen(true)}
                                data-testid="button-quick-add-transfer-promotion"
                              >
                                <span className="text-sm leading-none">+</span> Thêm mới
                              </button>
                            )}
                          </div>
                          <div className="mt-3 space-y-4">
                            {targetPromotionRows.map((row) => {
                              const selectedOption = promotionOptionsWithVouchers.find(
                                (option: any) => option.id === row.optionKey,
                              );
                              return (
                                <div key={row.id} className="space-y-2 rounded-lg border border-muted p-2">
                                  <Popover
                                    open={openTargetPromotionPicker === row.id}
                                    onOpenChange={(open) => {
                                      setOpenTargetPromotionPicker(open ? row.id : null);
                                      if (open) setTargetPromotionSearch("");
                                    }}
                                  >
                                    <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        className="flex min-h-9 w-full items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5 text-left text-xs hover:border-purple-400"
                                      >
                                        <span className={selectedOption ? "truncate" : "text-muted-foreground"}>
                                          {selectedOption ? formatPromotionLabel(selectedOption) : "Chọn giảm trừ..."}
                                        </span>
                                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent
                                      className="w-[28rem] max-w-[calc(100vw-2rem)] p-3"
                                      align="start"
                                    >
                                      <div className="relative mb-2">
                                        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                          value={targetPromotionSearch}
                                          onChange={(event) => setTargetPromotionSearch(event.target.value)}
                                          placeholder="Tìm theo tên hoặc mã giảm trừ..."
                                          className="h-8 pl-7 text-xs"
                                          autoFocus
                                          onKeyDown={(event) => event.stopPropagation()}
                                        />
                                      </div>
                                      <div className="max-h-64 space-y-1 overflow-y-auto">
                                        {promotionOptionsWithVouchers.length === 0 ? (
                                          <p className="py-3 text-center text-xs text-muted-foreground">
                                            Chưa có giảm trừ
                                          </p>
                                        ) : filteredTargetPromotions.length === 0 ? (
                                          <p className="py-3 text-center text-xs text-muted-foreground">
                                            Không tìm thấy giảm trừ phù hợp
                                          </p>
                                        ) : (
                                          filteredTargetPromotions.map((option: any) => {
                                            const value = Number(option.valueAmount ?? 0) || 0;
                                            return (
                                              <button
                                                key={option.id}
                                                type="button"
                                                className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-muted/60"
                                                onClick={() => {
                                                  selectTargetPromotionOption(row.id, option.id);
                                                  setOpenTargetPromotionPicker(null);
                                                }}
                                              >
                                                <span className="min-w-0 flex-1">
                                                  <span className="flex items-center gap-1 text-xs font-medium">
                                                    {option.kind === "voucher" && (
                                                      <span className="shrink-0 rounded bg-red-100 px-1 text-[9px] font-semibold text-red-600">
                                                        Voucher
                                                      </span>
                                                    )}
                                                    <span className="truncate">{option.name}</span>
                                                  </span>
                                                  <span className="block text-xs text-muted-foreground">
                                                    -{option.valueType === "percent" ? `${value}%` : formatCurrency(value)}
                                                  </span>
                                                </span>
                                              </button>
                                            );
                                          })
                                        )}
                                      </div>
                                    </PopoverContent>
                                  </Popover>

                                  <div className="flex items-center gap-1.5">
                                    <select
                                      value={row.valueType}
                                      onChange={(event) =>
                                        updateTargetPromotionRow(row.id, {
                                          valueType: event.target.value as TransferAdjustmentRow["valueType"],
                                        })
                                      }
                                      className="h-8 w-24 rounded-md border bg-background px-2 text-xs"
                                    >
                                      <option value="amount">Số tiền</option>
                                      <option value="percent">Phần trăm</option>
                                    </select>
                                    <div className="relative min-w-0 flex-1">
                                      <Input
                                        type="number"
                                        min={0}
                                        value={row.value || ""}
                                        onChange={(event) =>
                                          updateTargetPromotionRow(row.id, {
                                            value: Math.max(0, Number(event.target.value) || 0),
                                          })
                                        }
                                        placeholder="Nhập nhanh..."
                                        className="h-8 pr-8 text-xs"
                                      />
                                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                                        {row.valueType === "percent" ? "%" : "₫"}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                                      onClick={() => removeTargetPromotionRow(row.id)}
                                      aria-label="Xóa dòng giảm trừ"
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
                              onClick={addTargetPromotionRow}
                            >
                              + Thêm
                            </button>
                            <div className="flex justify-between border-t pt-3 text-xs font-semibold">
                              <span>Tổng giảm trừ lớp mới</span>
                              <span className="text-green-600">-{formatCurrency(targetDiscountAmount)}</span>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button type="button" onClick={() => setIsTargetDiscountDialogOpen(false)}>
                              Xong
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sau giảm trừ:</span>
                      <span className="font-medium">
                        {targetTotalAfterDiscount > 0 ? formatCurrency(targetTotalAfterDiscount) : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Số buổi của gói:</span>
                      <span className="font-medium">
                        {targetPackageSessionCount > 0 ? `${targetPackageSessionCount} buổi` : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Đơn giá sau giảm:</span>
                      <span className="font-medium">
                        {targetSessionPrice > 0 ? formatCurrency(targetSessionPrice) + "/buổi" : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between border-t pt-1.5 mt-1">
                      <span className="font-medium">Thành tiền:</span>
                      <span className="font-semibold text-foreground">
                        {transferCount > 0 && targetSessionPrice > 0 ? (
                          <span className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                            <span className="text-[11px] font-normal text-muted-foreground whitespace-nowrap">
                              ({formatCurrencyValue(targetSessionPrice)} x {transferCount})
                            </span>
                            <span>{formatCurrency(targetTotal)}</span>
                          </span>
                        ) : "—"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Financial difference summary */}
            {showFinancial && (
              <div className={`rounded-md border p-3 flex items-center justify-between text-sm font-medium ${
                diff > 0
                  ? "border-orange-200 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800"
                  : diff < 0
                  ? "border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800"
                  : "border-muted bg-muted/40"
              }`}>
                {diff > 0 ? (
                  <>
                    <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                      <TrendingUp className="h-4 w-4" />
                      <span>Thu thêm từ học viên</span>
                    </div>
                    <Badge variant="outline" className="text-orange-600 border-orange-300 font-semibold text-sm">
                      +{formatCurrency(diff)}
                    </Badge>
                  </>
                ) : diff < 0 ? (
                  <>
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <TrendingDown className="h-4 w-4" />
                      <span>Hoàn tiền cho học viên</span>
                    </div>
                    <Badge variant="outline" className="text-green-600 border-green-300 font-semibold text-sm">
                      -{formatCurrency(Math.abs(diff))}
                    </Badge>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Minus className="h-4 w-4" />
                      <span>Không phát sinh thêm hoá đơn</span>
                    </div>
                    <Badge variant="outline" className="font-semibold text-sm">
                      {formatCurrency(0)}
                    </Badge>
                  </>
                )}
              </div>
            )}

            {diff < 0 && showFinancial && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
                <span className="text-sm font-medium">Cách hoàn tiền</span>
                <RadioGroup
                  value={refundMethod}
                  onValueChange={(value) => setRefundMethod(value as "invoice" | "deposit")}
                  className="flex flex-wrap items-center gap-x-5 gap-y-2"
                  aria-label="Cách hoàn tiền"
                >
                  <label
                    htmlFor="refund-method-invoice"
                    className="flex cursor-pointer items-center gap-2 text-xs"
                  >
                    <RadioGroupItem
                      value="invoice"
                      id="refund-method-invoice"
                      data-testid="radio-refund-method-invoice"
                    />
                    <span>Xuất Phiếu chi</span>
                  </label>
                  <label
                    htmlFor="refund-method-deposit"
                    className="flex cursor-pointer items-center gap-2 text-xs"
                  >
                    <RadioGroupItem
                      value="deposit"
                      id="refund-method-deposit"
                      data-testid="radio-refund-method-deposit"
                    />
                    <span>Chuyển vào ví cọc</span>
                  </label>
                </RadioGroup>
              </div>
            )}

            {shouldRefundToDeposit ? (
              <div className="rounded-md border border-violet-200 bg-violet-50/60 p-4 space-y-2 dark:border-violet-900 dark:bg-violet-950/20">
                <div className="flex items-center gap-2 text-sm font-medium text-violet-700 dark:text-violet-300">
                  <Wallet className="h-4 w-4" />
                  <span>Chuyển khoản hoàn vào ví cọc</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Số dư ví học phí: </span>
                    <span className="font-semibold">{loadingFeeWallet ? "Đang kiểm tra..." : formatCurrency(tuitionWalletBalance)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Số tiền hoàn: </span>
                    <span className="font-semibold">{formatCurrency(refundAmount)}</span>
                  </div>
                </div>
                {insufficientTuitionWallet && (
                  <p className="text-xs font-medium text-red-600">
                    Ví học phí không đủ số dư. Còn {formatCurrency(tuitionWalletBalance)}, cần {formatCurrency(refundAmount)}. Không thể chuyển âm.
                  </p>
                )}
                {!loadingFeeWallet && !insufficientTuitionWallet && (
                  <p className="text-xs text-muted-foreground">
                    Hệ thống sẽ trừ ví học phí và cộng đúng số tiền này vào ví cọc, đồng thời ghi lại hai giao dịch đối ứng.
                  </p>
                )}
              </div>
            ) : (
              /* Auto invoice switch */
              <div className="rounded-md border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Hoá đơn tự động</span>
                  </div>
                  <Switch
                    checked={autoInvoice}
                    onCheckedChange={setAutoInvoice}
                    data-testid="switch-auto-invoice"
                  />
                </div>

                {autoInvoice && (
                  <div className="space-y-2 pt-1 border-t">
                    <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                      <div>
                        <span className="font-medium text-foreground">Loại phiếu: </span>
                        {diff < 0 ? "Phiếu chi" : "Phiếu thu"}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">Loại: </span>
                        {diff < 0 ? (
                          <Select
                            value={invoiceCategory}
                            onValueChange={(v) => setInvoiceCategory(v as any)}
                          >
                            <SelectTrigger className="h-6 text-xs border-dashed w-auto min-w-[130px]" data-testid="select-invoice-category">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Hoàn học phí" className="text-xs">Hoàn học phí</SelectItem>
                              <SelectItem value="Đặt cọc" className="text-xs">Đặt cọc</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span>Học phí</span>
                        )}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Số tiền: </span>
                        {showFinancial ? formatCurrency(Math.abs(diff)) : "—"}
                      </div>
                    </div>
                    {showFinancial && (
                      <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 italic">
                        {buildInvoiceNote()}
                      </div>
                    )}
                    {!showFinancial && (
                      <p className="text-xs text-muted-foreground italic">
                        Chọn đầy đủ lớp mới và gói học phí để xem hoá đơn tự động
                      </p>
                    )}
                  </div>
                )}

                {!autoInvoice && (
                  <p className="text-xs text-muted-foreground pt-1 border-t">
                    Chỉ chuyển lớp, không tạo hoá đơn
                  </p>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                data-testid="button-cancel-transfer"
              >
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={isPending || loadingFeeWallet || insufficientTuitionWallet}
                data-testid="button-confirm-transfer"
              >
                {isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Xác nhận chuyển
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
    <FinancePromotionDialog
      open={quickCreatePromotionOpen}
      onClose={() => setQuickCreatePromotionOpen(false)}
      onSave={(data) => createPromotionMutation.mutate(data)}
      title="Thêm mới giảm trừ"
      isSaving={createPromotionMutation.isPending}
    />
    </>
  );
}
