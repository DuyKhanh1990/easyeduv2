import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { X, ChevronDown, SlidersHorizontal } from "lucide-react";
import { format } from "date-fns";
import { GroupedStudent } from "../types";
import { OverviewFilters } from "../hooks/useOverviewTab";

const STATUS_OPTIONS = [
  { value: "waiting", label: "Chờ xếp lịch" },
  { value: "upcoming", label: "Chờ đến lịch" },
  { value: "active", label: "Đang học" },
  { value: "ended", label: "Đã kết thúc" },
];

type Props = {
  filteredStudents: GroupedStudent[];
  totalClassRows: number;
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

function FloatingLabelInput({
  label,
  className,
  wrapperClassName,
  ...props
}: JSX.IntrinsicElements["input"] & {
  label: string;
  wrapperClassName?: string;
}) {
  return (
    <div className={`relative ${wrapperClassName ?? ""}`}>
      <span className="absolute -top-2 left-2.5 z-10 px-1 text-[10px] font-medium leading-none text-muted-foreground bg-background">
        {label}
      </span>
      <input
        {...props}
        className={`flex h-8 w-full rounded-md border border-input bg-background px-2.5 pt-1 pb-0.5 text-xs ring-offset-background placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ""}`}
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
  filteredStudents,
  totalClassRows,
  isLoading,
  filters,
  onFiltersChange,
  availableClasses,
}: Props) {
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
    <Card className="rounded-xl border border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          Danh sách học viên
          {totalClassRows > 0 && (
            <Badge className="bg-secondary text-secondary-foreground font-normal text-xs">
              {filteredStudents.length} học viên · {totalClassRows} lớp
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-x-2 gap-y-4 items-center pt-2">
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
                wrapperClassName="w-32"
                value={filters.startFrom}
                onChange={(e) => onFiltersChange({ startFrom: (e.target as HTMLInputElement).value })}
                data-testid="input-filter-start-from"
              />
              <span className="text-xs text-muted-foreground mt-0.5">–</span>
              <FloatingLabelInput
                label="Bắt đầu đến"
                type="date"
                wrapperClassName="w-32"
                value={filters.startTo}
                onChange={(e) => onFiltersChange({ startTo: (e.target as HTMLInputElement).value })}
                data-testid="input-filter-start-to"
              />
            </div>

            <div className="flex items-center gap-2">
              <FloatingLabelInput
                label="Kết thúc từ"
                type="date"
                wrapperClassName="w-32"
                value={filters.endFrom}
                onChange={(e) => onFiltersChange({ endFrom: (e.target as HTMLInputElement).value })}
                data-testid="input-filter-end-from"
              />
              <span className="text-xs text-muted-foreground mt-0.5">–</span>
              <FloatingLabelInput
                label="Kết thúc đến"
                type="date"
                wrapperClassName="w-32"
                value={filters.endTo}
                onChange={(e) => onFiltersChange({ endTo: (e.target as HTMLInputElement).value })}
                data-testid="input-filter-end-to"
              />
            </div>
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

        <ScrollArea className="w-full rounded-md border">
          <Table>
            <TableHeader className="bg-secondary/50 sticky top-0">
              <TableRow>
                <TableHead className="text-xs font-semibold">Lớp học</TableHead>
                <TableHead className="text-xs font-semibold">Ngày Bắt đầu</TableHead>
                <TableHead className="text-xs font-semibold">Ngày Kết thúc</TableHead>
                <TableHead className="text-xs font-semibold text-center">Tổng</TableHead>
                <TableHead className="text-xs font-semibold text-center">Đã điểm danh</TableHead>
                <TableHead className="text-xs font-semibold text-center">Còn lại</TableHead>
                <TableHead className="text-xs font-semibold text-center">Rate</TableHead>
                <TableHead className="text-xs font-semibold">Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                    Đang tải dữ liệu...
                  </TableCell>
                </TableRow>
              ) : filteredStudents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                    Không có dữ liệu
                  </TableCell>
                </TableRow>
              ) : (
                filteredStudents
                  .map((student) => [
                    <TableRow
                      key={`header-${student.studentId}`}
                      className="bg-slate-50 dark:bg-slate-900"
                    >
                      <TableCell colSpan={8} className="text-sm font-semibold py-3">
                        {student.studentCode} - {student.studentName}
                      </TableCell>
                    </TableRow>,
                    ...student.classes.map((sc) => (
                      <TableRow key={sc.id} data-testid={`row-student-class-${sc.id}`}>
                        <TableCell className="text-sm font-medium pl-8">
                          {sc.classCode || "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {sc.startDate ? format(new Date(sc.startDate), "dd/MM/yyyy") : "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {sc.endDate ? format(new Date(sc.endDate), "dd/MM/yyyy") : "-"}
                        </TableCell>
                        <TableCell className="text-sm text-center font-medium">
                          {sc.totalSessions}
                        </TableCell>
                        <TableCell className="text-sm text-center text-blue-600 font-medium">
                          {sc.attendedSessions}
                        </TableCell>
                        <TableCell className="text-sm text-center font-medium">
                          {sc.remainingSessions}
                        </TableCell>
                        <TableCell className="text-sm text-center">
                          {calculateRate(sc.attendedSessions, sc.totalSessions)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {getStatusBadge(sc.startDate, sc.endDate)}
                        </TableCell>
                      </TableRow>
                    )),
                  ])
                  .flat()
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
