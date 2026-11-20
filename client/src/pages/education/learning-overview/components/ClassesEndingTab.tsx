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
import { format } from "date-fns";
import { ClassEndingSoonData, ClassesEndingFilters } from "../hooks/useClassesEndingTab";
import { FilterBar, StatusFilterValue } from "./FilterBar";
import { Pagination } from "./Pagination";

type Props = {
  data: ClassEndingSoonData[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  isLoading: boolean;
  filters: ClassesEndingFilters;
  onFiltersChange: (patch: Partial<ClassesEndingFilters>) => void;
  availableClasses: { code: string; label: string }[];
};

function formatWeekdays(weekdays: number[] | null): string {
  if (!weekdays || weekdays.length === 0) return "-";
  return weekdays
    .slice()
    .sort((a, b) => a - b)
    .map((wd) => (wd === 0 ? "CN" : `T${wd + 1}`))
    .join(", ");
}

function getRemainingBadgeClass(remaining: number) {
  if (remaining <= 2) return "bg-red-100 text-red-800";
  if (remaining <= 5) return "bg-orange-100 text-orange-800";
  return "bg-yellow-100 text-yellow-800";
}

export function ClassesEndingTab({
  data,
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
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm flex flex-col h-full overflow-hidden">
      {/* Fixed header + filters */}
      <div className="shrink-0 bg-card border-b border-border/50 px-6 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Lớp học sắp kết thúc</h2>
          {total > 0 && (
            <Badge className="bg-orange-100 text-orange-800 font-normal text-xs">
              {total}
            </Badge>
          )}
        </div>
        <FilterBar
          search={filters.search}
          onSearchChange={(v) => onFiltersChange({ search: v })}
          availableClasses={availableClasses}
          selectedClasses={filters.selectedClasses}
          onSelectedClassesChange={(v) => onFiltersChange({ selectedClasses: v })}
          maxRemaining={filters.maxRemaining}
          onMaxRemainingChange={(v) => onFiltersChange({ maxRemaining: v })}
          dateFrom={filters.dateFrom}
          onDateFromChange={(v) => onFiltersChange({ dateFrom: v })}
          dateTo={filters.dateTo}
          onDateToChange={(v) => onFiltersChange({ dateTo: v })}
          statusFilter={filters.statusFilter}
          onStatusFilterChange={(v) => onFiltersChange({ statusFilter: v as StatusFilterValue })}
          searchPlaceholder="Tìm theo mã hoặc tên lớp..."
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pt-4 pb-2">
        <ScrollArea className="w-full rounded-md border">
          <Table>
            <TableHeader className="bg-secondary/50 sticky top-0">
              <TableRow>
                <TableHead className="text-xs font-semibold">Cơ sở</TableHead>
                <TableHead className="text-xs font-semibold">Tên lớp</TableHead>
                <TableHead className="text-xs font-semibold">Giáo viên</TableHead>
                <TableHead className="text-xs font-semibold">Chu kỳ</TableHead>
                <TableHead className="text-xs font-semibold text-center">Số buổi còn lại</TableHead>
                <TableHead className="text-xs font-semibold">Ngày kết thúc</TableHead>
                <TableHead className="text-xs font-semibold">Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    Đang tải dữ liệu...
                  </TableCell>
                </TableRow>
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    Không có kết quả phù hợp
                  </TableCell>
                </TableRow>
              ) : (
                data.map((cls) => (
                  <TableRow key={cls.id} data-testid={`row-ending-class-${cls.id}`}>
                    <TableCell className="text-sm">{cls.locationName || "-"}</TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{cls.className || "-"}</div>
                      {cls.classCode && (
                        <div className="text-xs text-muted-foreground italic">{cls.classCode}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{cls.teacherNames || "-"}</TableCell>
                    <TableCell className="text-sm">{formatWeekdays(cls.weekdays)}</TableCell>
                    <TableCell className="text-sm text-center">
                      <Badge className={getRemainingBadgeClass(cls.remainingSessions)}>
                        {cls.remainingSessions}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {cls.endDate ? format(new Date(cls.endDate), "dd/MM/yyyy") : "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {cls.endDate ? (() => {
                        const today = new Date(new Date().toDateString());
                        const end = new Date(cls.endDate);
                        if (end < today)
                          return <Badge className="bg-red-100 text-red-800">Đã kết thúc</Badge>;
                        if (cls.remainingSessions < 5)
                          return <Badge className="bg-orange-100 text-orange-800">Sắp kết thúc</Badge>;
                        return <Badge className="bg-green-100 text-green-800">Đang học</Badge>;
                      })() : "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {/* Footer - pagination */}
      <div className="shrink-0 px-6 pb-3">
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      </div>
    </div>
  );
}
