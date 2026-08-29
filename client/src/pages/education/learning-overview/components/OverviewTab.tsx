import { useState, useRef, useEffect } from "react";
import { StudentNameLink } from "@/components/ui/StudentNameLink";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { X, ChevronDown, SlidersHorizontal, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { GroupedStudent, StudentClassTuitionPackage } from "../types";
import { OverviewFilters } from "../hooks/useOverviewTab";

const STATUS_OPTIONS = [
  { value: "waiting", label: "Chờ xếp lịch" },
  { value: "upcoming", label: "Chờ đến lịch" },
  { value: "active", label: "Đang học" },
  { value: "ended", label: "Đã kết thúc" },
];

type Props = {
  students: GroupedStudent[];
  totalClassRows: number;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  isLoading: boolean;
  filters: OverviewFilters;
  onFiltersChange: (patch: Partial<OverviewFilters>) => void;
  availableClasses: { code: string; label: string }[];
};

function getStatusBadge(startDate: string, endDate: string) {
  if (!startDate && !endDate)
    return <Badge className="bg-gray-100 text-gray-800">Chờ xếp lịch</Badge>;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if (start && today < start)
    return <Badge className="bg-purple-100 text-purple-800">Chờ đến lịch</Badge>;
  if (end && today > end)
    return <Badge className="bg-red-100 text-red-800">Đã kết thúc</Badge>;
  return <Badge className="bg-green-100 text-green-800">Đang học</Badge>;
}

function calculateRate(attended: number, total: number) {
  if (total === 0) return "0%";
  return `${Math.round((attended / total) * 100)}%`;
}

function formatMoney(amount: number) {
  return `${Math.round(amount).toLocaleString("vi-VN")} đ`;
}

function InvoiceAmount({
  invoiceCodes,
  paidAmount,
  invoiceTotal,
}: {
  invoiceCodes?: string[];
  paidAmount: number;
  invoiceTotal: number;
}) {
  const codes = invoiceCodes?.filter(Boolean) ?? [];

  return (
    <div className="tabular-nums">
      {codes.length > 0 && (
        <div className="mb-0.5 text-[10px] font-semibold leading-none text-purple-600">
          {codes.join(", ")}
        </div>
      )}
      <div>{formatMoney(paidAmount)} / {formatMoney(invoiceTotal)}</div>
    </div>
  );
}

function packageRate(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

function FloatingLabelInput({
  label,
  className,
  wrapperClassName,
  type,
  ...props
}: JSX.IntrinsicElements["input"] & {
  label: string;
  wrapperClassName?: string;
}) {
  const isDateInput = type === "date";

  return (
    <div className={`relative ${wrapperClassName ?? ""}`}>
      <span className={`absolute -top-2 left-2.5 z-10 px-1 ${isDateInput ? "text-xs" : "text-sm"} font-medium leading-none text-muted-foreground bg-background`}>
        {label}
      </span>
      <input
        type={type}
        {...props}
        className={`flex ${isDateInput ? "h-10 px-3 text-sm" : "h-9 px-2.5 text-sm"} w-full rounded-md border border-input bg-background pt-1 pb-0.5 ring-offset-background placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ""}`}
      />
    </div>
  );
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  testId,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const toggle = (v: string) => {
    if (selected.includes(v)) onChange(selected.filter((s) => s !== v));
    else onChange([...selected, v]);
  };

  const displayText =
    selected.length === 0
      ? ""
      : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
      : `${selected.length} đã chọn`;

  return (
    <div className="relative" ref={ref}>
      <span className="absolute -top-2 left-2.5 z-10 px-1 text-[10px] font-medium leading-none text-muted-foreground bg-background">
        {label}
      </span>
      <button
        type="button"
        className="flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2.5 text-xs text-left ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring min-w-[100px]"
        onClick={() => setOpen((o) => !o)}
        data-testid={testId}
      >
        <SlidersHorizontal className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className={`flex-1 truncate ${selected.length === 0 ? "text-muted-foreground/50" : ""}`}>
          {displayText || "Tất cả"}
        </span>
        {selected.length > 0 && (
          <Badge className="bg-primary text-primary-foreground text-[10px] h-4 px-1 shrink-0">
            {selected.length}
          </Badge>
        )}
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-50 top-10 left-0 bg-background border border-border rounded-lg shadow-lg w-52 p-2">
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {options.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="rounded"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <div className="border-t mt-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs"
                onClick={() => onChange([])}
              >
                Bỏ chọn tất cả
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function OverviewTab({
  students,
  totalClassRows,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  isLoading,
  filters,
  onFiltersChange,
  availableClasses,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const hasFilters =
    filters.search ||
    filters.startFrom ||
    filters.startTo ||
    filters.endFrom ||
    filters.endTo ||
    filters.selectedClasses.length > 0 ||
    filters.maxRemaining ||
    filters.selectedStatuses.length > 0;

  const clearAll = () =>
    onFiltersChange({
      search: "",
      startFrom: "",
      startTo: "",
      endFrom: "",
      endTo: "",
      selectedClasses: [],
      maxRemaining: "",
      selectedStatuses: [],
    });

  const classOptions = availableClasses.map((c) => ({ value: c.code, label: c.label }));

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm flex flex-col h-full overflow-hidden">
      {/* Fixed header + filters */}
      <div className="shrink-0 bg-card border-b border-border/50 px-6 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Danh sách học viên</h2>
          {total > 0 && (
            <Badge className="bg-secondary text-secondary-foreground font-normal text-xs">
              {total} học viên · {totalClassRows} lớp
            </Badge>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-x-2 gap-y-4 items-center pt-1">
            <FloatingLabelInput
              label="Tìm học viên"
              placeholder="Tên hoặc mã học viên..."
              wrapperClassName="w-40"
              value={filters.search}
              onChange={(e) => onFiltersChange({ search: (e.target as HTMLInputElement).value })}
              data-testid="input-search-student-classes"
            />

            <MultiSelectDropdown
              label="Lớp học"
              options={classOptions}
              selected={filters.selectedClasses}
              onChange={(v) => onFiltersChange({ selectedClasses: v })}
              testId="button-filter-class-overview"
            />

            <MultiSelectDropdown
              label="Trạng thái"
              options={STATUS_OPTIONS}
              selected={filters.selectedStatuses}
              onChange={(v) => onFiltersChange({ selectedStatuses: v })}
              testId="button-filter-status-overview"
            />

            <FloatingLabelInput
              label="Còn lại ≤ (buổi)"
              type="number"
              min={0}
              placeholder="–"
              wrapperClassName="w-24"
              value={filters.maxRemaining}
              onChange={(e) => onFiltersChange({ maxRemaining: (e.target as HTMLInputElement).value })}
              data-testid="input-filter-remaining-overview"
            />

            <div className="flex items-center gap-2">
              <FloatingLabelInput
                label="Bắt đầu từ"
                type="date"
                wrapperClassName="w-40"
                value={filters.startFrom}
                onChange={(e) => onFiltersChange({ startFrom: (e.target as HTMLInputElement).value })}
                data-testid="input-filter-start-from"
              />
              <span className="text-xs text-muted-foreground mt-0.5">–</span>
              <FloatingLabelInput
                label="Bắt đầu đến"
                type="date"
                wrapperClassName="w-40"
                value={filters.startTo}
                onChange={(e) => onFiltersChange({ startTo: (e.target as HTMLInputElement).value })}
                data-testid="input-filter-start-to"
              />
            </div>

            <div className="flex items-center gap-2">
              <FloatingLabelInput
                label="Kết thúc từ"
                type="date"
                wrapperClassName="w-40"
                value={filters.endFrom}
                onChange={(e) => onFiltersChange({ endFrom: (e.target as HTMLInputElement).value })}
                data-testid="input-filter-end-from"
              />
              <span className="text-xs text-muted-foreground mt-0.5">–</span>
              <FloatingLabelInput
                label="Kết thúc đến"
                type="date"
                wrapperClassName="w-40"
                value={filters.endTo}
                onChange={(e) => onFiltersChange({ endTo: (e.target as HTMLInputElement).value })}
                data-testid="input-filter-end-to"
              />
            </div>

            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearAll}>
                <X className="h-3 w-3 mr-1" />
                Xóa bộ lọc
              </Button>
            )}
          </div>

          {(filters.selectedClasses.length > 0 || filters.selectedStatuses.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {filters.selectedClasses.map((code) => (
                <Badge
                  key={code}
                  variant="secondary"
                  className="text-xs gap-1 cursor-pointer"
                  onClick={() =>
                    onFiltersChange({ selectedClasses: filters.selectedClasses.filter((c) => c !== code) })
                  }
                >
                  {code}
                  <X className="h-2.5 w-2.5" />
                </Badge>
              ))}
              {filters.selectedStatuses.map((s) => (
                <Badge
                  key={s}
                  variant="secondary"
                  className="text-xs gap-1 cursor-pointer"
                  onClick={() =>
                    onFiltersChange({ selectedStatuses: filters.selectedStatuses.filter((v) => v !== s) })
                  }
                >
                  {STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s}
                  <X className="h-2.5 w-2.5" />
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-hidden px-6 pb-2">
        <div className="h-full min-w-0 overflow-auto">
          <div className="w-max min-w-[1650px] rounded-md">
          <table className="learning-overview-table w-full border-collapse whitespace-nowrap caption-bottom text-sm">
            <TableHeader className="sticky top-0 z-30 bg-white">
              <TableRow className="bg-white hover:bg-transparent">
                 <TableHead className="sticky left-0 z-40 h-9 w-[150px] min-w-[150px] border-r border-border bg-slate-100" />
                 <TableHead colSpan={7} className="h-9 border-r border-border bg-slate-100 text-center text-xs font-bold text-slate-700">
                  Thông tin lớp học
                </TableHead>
                <TableHead colSpan={3} className="h-9 border-r border-border bg-amber-50 text-center text-xs font-bold text-amber-800">
                  Thông tin học phí
                </TableHead>
                <TableHead colSpan={4} className="h-9 bg-blue-50 text-center text-xs font-bold text-blue-800">
                  Thông tin xếp lịch thực tế
                </TableHead>
              </TableRow>
              <TableRow className="bg-slate-100">
                 <TableHead className="sticky left-0 top-0 z-40 w-[150px] min-w-[150px] border-r border-border bg-slate-100 text-xs font-semibold shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]">Lớp</TableHead>
                <TableHead className="min-w-[105px] bg-slate-100 text-xs font-semibold">Bắt đầu</TableHead>
                <TableHead className="min-w-[105px] bg-slate-100 text-xs font-semibold">Kết thúc</TableHead>
                <TableHead className="min-w-[70px] bg-slate-100 text-center text-xs font-semibold">Tổng</TableHead>
                <TableHead className="min-w-[85px] bg-slate-100 text-center text-xs font-semibold">Số buổi đã học</TableHead>
                <TableHead className="min-w-[75px] bg-slate-100 text-center text-xs font-semibold">Còn lại</TableHead>
                <TableHead className="min-w-[65px] bg-slate-100 text-center text-xs font-semibold">Rate</TableHead>
                <TableHead className="min-w-[105px] border-r border-border bg-slate-100 text-xs font-semibold">Trạng thái</TableHead>
                <TableHead className="min-w-[190px] bg-amber-50 text-xs font-semibold">Gói học phí</TableHead>
                <TableHead className="min-w-[155px] bg-amber-50 text-xs font-semibold">Hóa đơn</TableHead>
                <TableHead className="min-w-[105px] border-r border-border bg-amber-50 text-center text-xs font-semibold">Đã thanh toán</TableHead>
                 <TableHead className="learning-overview-schedule-cell min-w-[120px] !border-x-0 bg-blue-50 text-center text-xs font-semibold">Đăng ký theo hóa đơn</TableHead>
                 <TableHead className="learning-overview-schedule-cell min-w-[95px] !border-x-0 bg-blue-50 text-center text-xs font-semibold">Đã xếp lịch</TableHead>
                 <TableHead className="learning-overview-schedule-cell min-w-[120px] !border-x-0 bg-blue-50 text-center text-xs font-semibold">Còn lại chưa xếp</TableHead>
                 <TableHead className="learning-overview-schedule-cell min-w-[105px] !border-x-0 bg-blue-50 text-center text-xs font-semibold">Tỷ lệ xếp lịch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={15} className="text-center text-muted-foreground py-6">
                    Đang tải dữ liệu...
                  </TableCell>
                </TableRow>
              ) : students.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={15} className="text-center text-muted-foreground py-6">
                    Không có dữ liệu
                  </TableCell>
                </TableRow>
              ) : (
                students
                  .map((student) => [
                    <TableRow
                      key={`header-${student.studentId}`}
                      className="bg-slate-50 dark:bg-slate-900"
                    >
                      <TableCell className="sticky left-0 z-20 w-[150px] min-w-[150px] border-y border-r border-slate-200 bg-slate-50 py-3 text-sm font-semibold shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)] dark:bg-slate-900">
                        <StudentNameLink studentId={student.studentId} name={student.studentName} code={student.studentCode} />
                      </TableCell>
                      <TableCell colSpan={14} className="border-y border-slate-200 bg-slate-50 py-3 dark:bg-slate-900" />
                    </TableRow>,
                    ...student.classes.flatMap((sc) => {
                      const packages: (StudentClassTuitionPackage | null)[] =
                        sc.tuitionPackages && sc.tuitionPackages.length > 0 ? sc.tuitionPackages : [null];
                      const registeredSessionsTotal = (sc.tuitionPackages ?? []).reduce(
                        (total, tuitionPackage) => total + (tuitionPackage.registeredSessions ?? 0),
                        0,
                      );
                      const isOverRegistered = sc.totalSessions > registeredSessionsTotal;

                      return packages.map((pkg, packageIndex) => {
                        const isOverScheduled = !!pkg && pkg.remainingUnscheduled !== null && pkg.remainingUnscheduled < 0;
                        const classInvoice = sc.invoiceSummary;
                        const hasPackageInvoice = !!pkg && pkg.invoiceCount > 0;
                        const hasClassInvoiceFallback =
                          !hasPackageInvoice && packageIndex === 0 && !!classInvoice && classInvoice.count > 0;
                        return (
                          <TableRow
                            key={`${sc.id}-${pkg?.packageId ?? "no-package"}`}
                            data-testid={`row-student-class-${sc.id}${pkg ? `-${pkg.packageId}` : ""}`}
                            className="align-top"
                          >
                            {packageIndex === 0 && (
                              <>
                                <TableCell rowSpan={packages.length} className="sticky left-0 z-20 w-[150px] min-w-[150px] align-top border-r border-border bg-white pl-8 text-sm font-medium shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)] dark:bg-slate-950">
                                  {sc.classCode || "-"}
                                  {sc.className && sc.className !== sc.classCode && (
                                    <div className="mt-0.5 text-[10px] font-normal text-muted-foreground">{sc.className}</div>
                                  )}
                                </TableCell>
                                <TableCell rowSpan={packages.length} className="align-top text-sm">
                                  {sc.startDate ? format(new Date(sc.startDate), "dd/MM/yyyy") : "-"}
                                </TableCell>
                                <TableCell rowSpan={packages.length} className="align-top text-sm">
                                  {sc.endDate ? format(new Date(sc.endDate), "dd/MM/yyyy") : "-"}
                                </TableCell>
                                <TableCell rowSpan={packages.length} className="align-top text-center text-sm font-medium">
                                  {sc.totalSessions}
                                  {isOverRegistered && (
                                    <TooltipProvider delayDuration={150}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span
                                            className="ml-1 inline-flex cursor-help align-middle"
                                            aria-label="Số buổi nhiều hơn tổng số buổi các gói học phí đăng ký theo hóa đơn"
                                          >
                                            <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="text-xs">
                                          Số buổi nhiều hơn tổng số buổi các gói học phí đăng ký theo hóa đơn
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </TableCell>
                                <TableCell rowSpan={packages.length} className="align-top text-center text-sm font-medium text-blue-600">{sc.attendedSessions}</TableCell>
                                <TableCell rowSpan={packages.length} className="align-top text-center text-sm font-medium">{sc.remainingSessions}</TableCell>
                                <TableCell rowSpan={packages.length} className="align-top text-center text-sm">{calculateRate(sc.attendedSessions, sc.totalSessions)}</TableCell>
                                <TableCell rowSpan={packages.length} className="align-top border-r border-border text-sm">{getStatusBadge(sc.startDate, sc.endDate)}</TableCell>
                              </>
                            )}

                            <TableCell className="bg-amber-50/20 text-sm font-medium">
                              {pkg?.name || <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="bg-amber-50/20 text-sm">
                              {hasPackageInvoice ? (
                                <InvoiceAmount
                                  invoiceCodes={pkg.invoiceCodes}
                                  paidAmount={pkg.paidAmount}
                                  invoiceTotal={pkg.invoiceTotal}
                                />
                              ) : hasClassInvoiceFallback ? (
                                <InvoiceAmount
                                  invoiceCodes={classInvoice.invoiceCodes}
                                  paidAmount={classInvoice.paidAmount}
                                  invoiceTotal={classInvoice.grandTotal}
                                />
                              ) : (
                                <span className="italic text-muted-foreground">Chưa có</span>
                              )}
                            </TableCell>
                            <TableCell className="border-r border-border bg-amber-50/20 text-center text-sm">
                              {hasPackageInvoice ? (
                                <span className={pkg.paymentRate >= 1 ? "font-semibold text-green-600" : "font-semibold text-orange-600"}>
                                  {packageRate(pkg.paymentRate)}
                                </span>
                              ) : hasClassInvoiceFallback ? (
                                <span className={classInvoice.paidAmount >= classInvoice.grandTotal ? "font-semibold text-green-600" : "font-semibold text-orange-600"}>
                                  {packageRate(classInvoice.grandTotal > 0 ? classInvoice.paidAmount / classInvoice.grandTotal : 0)}
                                </span>
                              ) : "—"}
                            </TableCell>

                             <TableCell className="learning-overview-schedule-cell !border-x-0 bg-blue-50/20 text-center text-sm font-medium">
                               {pkg?.registeredSessions !== null && pkg?.registeredSessions !== undefined ? pkg.registeredSessions : "—"}
                            </TableCell>
                             <TableCell className={`learning-overview-schedule-cell !border-x-0 bg-blue-50/20 text-center text-sm font-medium ${isOverScheduled ? "text-amber-600" : "text-blue-600"}`}>
                              {pkg ? (
                                <>
                                  {pkg.scheduledSessions}
                                  {isOverScheduled && <AlertTriangle className="ml-1 inline h-3 w-3" />}
                                </>
                              ) : "—"}
                            </TableCell>
                             <TableCell className={`learning-overview-schedule-cell !border-x-0 bg-blue-50/20 text-center text-sm font-medium ${isOverScheduled ? "text-amber-600" : pkg?.remainingUnscheduled === 0 ? "text-green-600" : ""}`}>
                               {pkg?.remainingUnscheduled !== null && pkg?.remainingUnscheduled !== undefined ? pkg.remainingUnscheduled : "—"}
                            </TableCell>
                             <TableCell className={`learning-overview-schedule-cell !border-x-0 bg-blue-50/20 text-center text-sm font-semibold ${isOverScheduled ? "text-amber-600" : "text-blue-600"}`}>
                               {pkg?.scheduleRate !== null && pkg?.scheduleRate !== undefined ? (
                                <>
                                  <div>{packageRate(pkg.scheduleRate)}</div>
                                  {isOverScheduled && (
                                    <div className="mt-1 flex items-center justify-center gap-1 text-xs font-normal text-amber-600">
                                      <AlertTriangle className="h-3 w-3 shrink-0" />
                                      <span>Xếp lịch nhiều hơn số buổi gói học phí đăng ký</span>
                                    </div>
                                  )}
                                </>
                               ) : (
                                 <span className="text-xs font-normal text-muted-foreground">
                                   Chưa có hóa đơn đăng ký số buổi học
                                 </span>
                               )}
                            </TableCell>
                          </TableRow>
                        );
                      });
                    }),
                  ])
                  .flat()
              )}
            </TableBody>
          </table>
          </div>
        </div>
      </div>

      {/* Footer - pagination */}
      <div className="shrink-0 px-6 py-3 border-t border-border/50">
        {total > 0 && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Hiển thị</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => onPageSizeChange(Number(v))}
              >
                <SelectTrigger className="h-7 w-16 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="30">30</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
              <span>học viên / trang</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Trang {page}/{totalPages} · {total} học viên
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
