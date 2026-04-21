import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, eachDayOfInterval, parseISO, isValid } from "date-fns";
import { X, DollarSign, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  useTeacherSalaryDetail,
  useTeacherSalaryRowPackages,
  useSaveTeacherSalaryRowPackages,
  calculateTotalSalary,
} from "@/hooks/use-teacher-salary";
import { useTeacherSalaryPackages } from "@/hooks/use-teacher-salary-packages";
import { TeacherSalaryDetailFilters } from "./teacher-salary-detail/TeacherSalaryDetailFilters";
import { TeacherSalaryDetailTable } from "./teacher-salary-detail/TeacherSalaryDetailTable";
import { SalaryPaymentDialog, type SalaryPaymentInfo } from "./teacher-salary-detail/SalaryPaymentDialog";

interface TeacherSalaryDetailDialogProps {
  open: boolean;
  onClose: () => void;
  salaryTableId?: string | null;
  salaryTableName?: string;
  startDate?: string;
  endDate?: string;
  locationId?: string;
  locationName?: string;
}

export function TeacherSalaryDetailDialog({
  open,
  onClose,
  salaryTableId,
  salaryTableName,
  startDate,
  endDate,
  locationId,
  locationName,
}: TeacherSalaryDetailDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [filterTeacher, setFilterTeacher] = useState("all");
  const [filterPackage, setFilterPackage] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [rowPackages, setRowPackages] = useState<Record<string, string>>({});
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState<SalaryPaymentInfo | null>(null);
  const [rowPaidAmounts, setRowPaidAmounts] = useState<Record<string, number>>({});
  const [rowInvoiceIds, setRowInvoiceIds] = useState<Record<string, string>>({});

  const { data: detailRows = [], isLoading } = useTeacherSalaryDetail(
    open ? (salaryTableId ?? null) : null
  );

  const { data: savedPackages = [] } = useTeacherSalaryRowPackages(
    open ? (salaryTableId ?? null) : null
  );

  const { data: suggestedPackages = [] } = useQuery<{ teacherId: string; classId: string; packageId: string }[]>({
    queryKey: ["/api/teacher-salary-tables", salaryTableId, "suggested-packages"],
    queryFn: async () => {
      const res = await fetch(`/api/teacher-salary-tables/${salaryTableId}/suggested-packages`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: open && !!salaryTableId,
  });

  const { data: allPackages = [] } = useTeacherSalaryPackages();

  const salaryInvoicesQueryKey = open && salaryTableId
    ? ["/api/finance/invoices", "Chi", salaryTableId]
    : null;

  const { data: salaryInvoices = [] } = useQuery<any[]>({
    queryKey: salaryInvoicesQueryKey ?? ["__disabled__"],
    queryFn: async () => {
      const res = await fetch(`/api/finance/invoices?type=Chi&salaryTableId=${salaryTableId}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: open && !!salaryTableId,
  });

  const saveMutation = useSaveTeacherSalaryRowPackages();

  const { data: publishedRowsData = [] } = useQuery<{ teacherId: string; classId: string }[]>({
    queryKey: ["/api/teacher-salary-tables", salaryTableId, "published-rows"],
    queryFn: async () => {
      const res = await fetch(`/api/teacher-salary-tables/${salaryTableId}/published-rows`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: open && !!salaryTableId,
  });

  const publishedRowsSet = useMemo(() => {
    const s = new Set<string>();
    for (const r of publishedRowsData) {
      s.add(`${r.teacherId}::${r.classId}`);
    }
    return s;
  }, [publishedRowsData]);

  const publishMutation = useMutation({
    mutationFn: async (rows: { teacherId: string; classId: string }[]) => {
      await apiRequest("POST", `/api/teacher-salary-tables/${salaryTableId}/publish`, { rows });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teacher-salary-tables", salaryTableId, "published-rows"] });
      toast({ title: "Đã công bố", description: `${selectedRows.length} dòng đã được công bố cho giáo viên.` });
      setSelectedRows([]);
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  const handlePublish = () => {
    const rows = selectedRows.map((key) => {
      const [teacherId, classId] = key.split("::");
      return { teacherId, classId };
    });
    publishMutation.mutate(rows);
  };

  useEffect(() => {
    setRowPaidAmounts({});
    setRowInvoiceIds({});
  }, [salaryTableId]);

  useEffect(() => {
    const map: Record<string, string> = {};
    // First apply suggestions (lower priority)
    for (const sp of suggestedPackages) {
      const key = `${sp.teacherId}::${sp.classId}`;
      map[key] = sp.packageId;
    }
    // Then apply saved packages (higher priority - overrides suggestions)
    for (const sp of savedPackages) {
      const key = `${sp.teacherId}::${sp.classId}`;
      map[key] = sp.packageId;
    }
    if (Object.keys(map).length > 0) {
      setRowPackages(map);
    }
  }, [savedPackages, suggestedPackages]);

  const tableRows = useMemo(() => {
    return detailRows.map((r) => ({
      ...r,
      rowKey: `${r.teacherId}::${r.classId}`,
    }));
  }, [detailRows]);

  useEffect(() => {
    if (!open || tableRows.length === 0) return;

    const chiLuongInvoices = salaryInvoices.filter(
      (inv: any) => inv.category === "Chi lương"
    );

    const paidMap: Record<string, number> = {};
    const invoiceIdMap: Record<string, string> = {};

    for (const inv of chiLuongInvoices) {
      const matchingRow = inv.classId
        ? tableRows.find(
            (r) =>
              r.classId === inv.classId &&
              inv.subjectName?.includes(r.teacherCode)
          )
        : null;

      if (!matchingRow) continue;

      const paidAmt = parseFloat(inv.paidAmount ?? "0");
      paidMap[matchingRow.rowKey] = (paidMap[matchingRow.rowKey] ?? 0) + paidAmt;

      if (inv.status === "partial") {
        invoiceIdMap[matchingRow.rowKey] = inv.id;
      }
    }

    setRowPaidAmounts(paidMap);
    setRowInvoiceIds(invoiceIdMap);
  }, [open, salaryInvoices, tableRows]);

  const dateRange = useMemo(() => {
    try {
      const start = startDate ? parseISO(startDate) : null;
      const end = endDate ? parseISO(endDate) : null;
      if (!start || !end || !isValid(start) || !isValid(end)) return [];
      return eachDayOfInterval({ start, end });
    } catch {
      return [];
    }
  }, [startDate, endDate]);

  const filteredRows = useMemo(() => {
    return tableRows.filter((row) => {
      if (filterTeacher !== "all" && row.teacherId !== filterTeacher) return false;
      if (filterPackage !== "all") {
        const pkg = rowPackages[row.rowKey] ?? "";
        if (pkg !== filterPackage) return false;
      }
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        if (
          !row.teacherName.toLowerCase().includes(q) &&
          !row.teacherCode.toLowerCase().includes(q) &&
          !row.className.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [tableRows, filterTeacher, filterPackage, rowPackages, searchText]);

  const toggleRow = (key: string) => {
    setSelectedRows((prev) =>
      prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]
    );
  };

  const toggleAll = () => {
    if (selectedRows.length === filteredRows.length && filteredRows.length > 0) {
      setSelectedRows([]);
    } else {
      setSelectedRows(filteredRows.map((r) => r.rowKey));
    }
  };

  const setPackage = (key: string, value: string) => {
    setRowPackages((prev) => {
      if (!value || value === "none") {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  };

  const handlePayRow = (row: any, totalSalary: number) => {
    setPaymentInfo({
      rowKey: row.rowKey,
      teacherCode: row.teacherCode,
      teacherName: row.teacherName,
      role: row.role,
      className: row.className,
      classId: row.classId,
      totalSalary,
      alreadyPaid: rowPaidAmounts[row.rowKey] ?? 0,
      existingInvoiceId: rowInvoiceIds[row.rowKey],
    });
    setPaymentDialogOpen(true);
  };

  const handleRowPaid = (rowKey: string, paidAmount: number, invoiceId: string) => {
    setRowPaidAmounts((prev) => ({
      ...prev,
      [rowKey]: (prev[rowKey] ?? 0) + paidAmount,
    }));
    if (invoiceId) {
      setRowInvoiceIds((prev) => ({ ...prev, [rowKey]: invoiceId }));
    }
  };

  const handleSave = async () => {
    if (!salaryTableId) return;
    const assignments = Object.entries(rowPackages)
      .filter(([, pkgId]) => !!pkgId)
      .map(([key, pkgId]) => {
        const [teacherId, classId] = key.split("::");
        return { teacherId, classId, packageId: pkgId };
      });

    try {
      await saveMutation.mutateAsync({ id: salaryTableId, assignments });
      toast({ title: "Thành công", description: "Đã lưu bảng lương" });
    } catch (error: any) {
      toast({ title: "Lỗi", description: error.message, variant: "destructive" });
    }
  };

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = async () => {
    if (!salaryTableId || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/teacher-salary-tables", salaryTableId, "detail"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/teacher-salary-tables", salaryTableId, "packages"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/teacher-salary-tables", salaryTableId, "suggested-packages"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/teacher-salary-tables", salaryTableId, "published-rows"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/teacher-salary-packages"] }),
        queryClient.invalidateQueries({ queryKey: salaryInvoicesQueryKey ?? ["__disabled__"] }),
      ]);
      toast({ title: "Đã cập nhật", description: "Dữ liệu bảng lương đã được làm mới" });
    } finally {
      setIsRefreshing(false);
    }
  };

  const packageMap = useMemo(() => {
    const map = new Map<string, typeof allPackages[0]>();
    for (const pkg of allPackages) {
      map.set(pkg.id, pkg);
    }
    return map;
  }, [allPackages]);

  const totalSalaryForSelected = useMemo(() => {
    return selectedRows.reduce((sum, key) => {
      const row = tableRows.find((r) => r.rowKey === key);
      const pkgId = rowPackages[key];
      const pkg = pkgId ? packageMap.get(pkgId) : null;
      if (!row || !pkg) return sum;
      return sum + calculateTotalSalary(row, pkg as any);
    }, 0);
  }, [selectedRows, tableRows, rowPackages, packageMap]);

  if (!open) return null;

  const displayStart = startDate && isValid(parseISO(startDate))
    ? format(parseISO(startDate), "dd/MM/yyyy")
    : "";
  const displayEnd = endDate && isValid(parseISO(endDate))
    ? format(parseISO(endDate), "dd/MM/yyyy")
    : "";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      data-testid="dialog-salary-detail"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-3 bg-white dark:bg-gray-950 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30">
            <DollarSign className="h-4 w-4 text-orange-600" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground leading-tight">
              {salaryTableName || "Bảng lương mới"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {locationName && <span className="mr-2">{locationName}</span>}
              {displayStart && displayEnd && (
                <span>{displayStart} – {displayEnd}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            data-testid="button-refresh-detail"
            className="gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Đang cập nhật..." : "Cập nhật"}
          </Button>
          {selectedRows.length > 0 && (
            <Button
              size="sm"
              className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-pay-selected"
            >
              <DollarSign className="h-4 w-4" />
              Chi lương ({selectedRows.length})
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            data-testid="button-close-detail"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <TeacherSalaryDetailFilters
        rows={detailRows}
        filterTeacher={filterTeacher}
        setFilterTeacher={setFilterTeacher}
        filterPackage={filterPackage}
        setFilterPackage={setFilterPackage}
        searchText={searchText}
        setSearchText={setSearchText}
        packages={allPackages}
        selectedCount={selectedRows.length}
        onPublish={handlePublish}
        isPublishing={publishMutation.isPending}
      />

      {/* Table */}
      <TeacherSalaryDetailTable
        rows={filteredRows}
        dateRange={dateRange}
        selectedRows={selectedRows}
        rowPackages={rowPackages}
        packageMap={packageMap}
        rowPaidAmounts={rowPaidAmounts}
        publishedRows={publishedRowsSet}
        isLoading={isLoading}
        onToggleRow={toggleRow}
        onToggleAll={toggleAll}
        onSetPackage={setPackage}
        onPayRow={handlePayRow}
      />

      {/* Salary Payment Dialog */}
      <SalaryPaymentDialog
        open={paymentDialogOpen}
        onClose={() => setPaymentDialogOpen(false)}
        info={paymentInfo}
        locationId={locationId}
        salaryTableId={salaryTableId ?? undefined}
        salaryTableName={salaryTableName}
        onPaid={handleRowPaid}
      />

      {/* Footer */}
      <div className="border-t px-6 py-3 bg-gray-50 dark:bg-gray-900 shrink-0 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {isLoading
            ? "Đang tải..."
            : `${filteredRows.length} dòng`}
          {selectedRows.length > 0 && (
            <span className="ml-2 text-blue-600 font-medium">
              • Đang chọn {selectedRows.length}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            data-testid="button-cancel-detail"
          >
            Đóng
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            data-testid="button-save-salary-table"
          >
            {saveMutation.isPending ? "Đang lưu..." : "Lưu bảng lương"}
          </Button>
        </div>
      </div>
    </div>
  );
}
