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
import { Loader2, Search, TrendingUp, TrendingDown, Minus, FileText } from "lucide-react";
import { format } from "date-fns";

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

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("vi-VN").format(Math.round(amount)) + "đ";

export function TransferClassDialog({
  isOpen,
  onClose,
  student,
  currentClass,
}: TransferClassDialogProps) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTargetPackageId, setSelectedTargetPackageId] = useState<string>("");
  const [autoInvoice, setAutoInvoice] = useState(true);
  const [invoiceCategory, setInvoiceCategory] = useState<"Hoàn học phí" | "Đặt cọc">("Hoàn học phí");

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

  // Filter classes based on search
  const filteredClasses = availableClasses?.filter(
    (c) =>
      c.id !== currentClass?.id &&
      (c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.classCode.toLowerCase().includes(searchTerm.toLowerCase()))
  );

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

  // Reset target package when class changes
  useEffect(() => {
    setSelectedTargetPackageId("");
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

  // Current class fee info from student's sessions
  const currentSession = currentSessions?.find((s) => {
    const idx = s.classSession?.sessionIndex ?? s.sessionIndex;
    return Number(idx) === Number(fromSessionIndex);
  }) ?? currentSessions?.[0];
  const currentFeePackage = currentSession?.feePackage;
  const currentSessionPrice = currentSession ? Number(currentSession.sessionPrice ?? 0) : 0;
  const currentTotal = currentSessionPrice * transferCount;

  // Target class fee info
  const selectedTargetPackage = targetFeePackages.find((p) => p.id === selectedTargetPackageId);
  const targetSessionPrice = selectedTargetPackage
    ? selectedTargetPackage.type === "khoá" && Number(selectedTargetPackage.sessions) > 0
      ? Number(selectedTargetPackage.fee) / Number(selectedTargetPackage.sessions)
      : Number(selectedTargetPackage.fee ?? 0)
    : 0;
  const targetTotal = targetSessionPrice * transferCount;

  // Financial difference
  const diff = targetTotal - currentTotal;

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
      await apiRequest("POST", "/api/students/transfer-class", values);
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

      if (autoInvoice) {
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
        description: autoInvoice
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
    transferMutation.mutate(values);
  };

  const isPending = transferMutation.isPending || createInvoiceMutation.isPending;

  if (!student || !currentClass) return null;

  const showFinancial = selectedToClassId && currentSessionPrice > 0 && targetSessionPrice > 0 && transferCount > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[90vw] max-w-[90vw] max-h-[90vh] overflow-y-auto">
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
                <CardContent className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Tên lớp: <span className="font-normal">{currentClass.name} ({currentClass.classCode})</span></p>
                    <p className="text-sm font-medium">Giáo viên: <span className="font-normal">{currentClass.teacherName || "Chưa gán"}</span></p>
                    <p className="text-sm font-medium">Chu kỳ: <span className="font-normal">{currentClass.weekdays?.map(getDayName).join(", ")}</span></p>
                  </div>

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

                  {/* Fee summary - current class */}
                  <div className="rounded-md border bg-muted/40 p-3 space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Gói học phí:</span>
                      <span className="font-medium">{currentFeePackage?.name || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Học phí áp dụng:</span>
                      <span className="font-medium">
                        {currentSessionPrice > 0 ? formatCurrency(currentSessionPrice) + "/buổi" : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between border-t pt-1.5 mt-1">
                      <span className="font-medium">Thành tiền:</span>
                      <span className="font-semibold text-foreground">
                        {transferCount > 0 && currentSessionPrice > 0
                          ? formatCurrency(currentTotal)
                          : "—"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* LỚP MỚI */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-semibold text-primary">LỚP MỚI</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="toClassId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Chọn lớp mới</FormLabel>
                        <div className="relative mb-2">
                          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Tìm kiếm lớp..."
                            className="pl-8"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                          />
                        </div>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={loadingClasses}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-to-class">
                              <SelectValue placeholder="Chọn lớp đích" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {filteredClasses?.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name} ({c.classCode})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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

                  {/* Fee summary - new class */}
                  <div className="rounded-md border bg-muted/40 p-3 space-y-1.5 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Gói học phí:</span>
                      {selectedToClassId && targetFeePackages.length > 0 ? (
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
                      ) : (
                        <span className="font-medium text-muted-foreground">
                          {selectedToClassId ? "Không có gói" : "—"}
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Học phí áp dụng:</span>
                      <span className="font-medium">
                        {targetSessionPrice > 0 ? formatCurrency(targetSessionPrice) + "/buổi" : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between border-t pt-1.5 mt-1">
                      <span className="font-medium">Thành tiền:</span>
                      <span className="font-semibold text-foreground">
                        {transferCount > 0 && targetSessionPrice > 0
                          ? formatCurrency(targetTotal)
                          : "—"}
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

            {/* Auto invoice switch */}
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
                disabled={isPending}
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
  );
}
