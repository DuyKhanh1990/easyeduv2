import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { StudentClassData } from "../types";
import { StudentsEndingFilters } from "../hooks/useStudentsEndingTab";
import { FilterBar, StatusFilterValue } from "./FilterBar";
import { Pagination } from "./Pagination";

type Props = {
  data: StudentClassData[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  isLoading: boolean;
  filters: StudentsEndingFilters;
  onFiltersChange: (patch: Partial<StudentsEndingFilters>) => void;
  availableClasses: { code: string; label: string }[];
};

function getRemainingBadgeClass(remaining: number) {
  if (remaining <= 2) return "bg-red-100 text-red-800";
  if (remaining <= 5) return "bg-orange-100 text-orange-800";
  return "bg-yellow-100 text-yellow-800";
}

export function StudentsEndingTab({
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
    <Card className="rounded-xl border border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          Học viên sắp hết lịch
          {total > 0 && (
            <Badge className="bg-orange-100 text-orange-800 font-normal text-xs">
              {total}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
          searchPlaceholder="Tìm theo tên hoặc mã học viên..."
        />

        <ScrollArea className="w-full rounded-md border">
          <Table>
            <TableHeader className="bg-secondary/50 sticky top-0">
              <TableRow>
                <TableHead className="text-xs font-semibold">Họ tên</TableHead>
                <TableHead className="text-xs font-semibold">Lớp học</TableHead>
                <TableHead className="text-xs font-semibold">Điện thoại</TableHead>
                <TableHead className="text-xs font-semibold">Thư điện tử</TableHead>
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
                data.map((sc) => (
                  <TableRow key={sc.id} data-testid={`row-ending-student-${sc.id}`}>
                    <TableCell className="text-sm">
                      <div className="font-medium">{sc.studentName}</div>
                      <div className="text-xs text-muted-foreground">{sc.studentCode}</div>
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {sc.classCode || sc.className || "-"}
                    </TableCell>
                    <TableCell className="text-sm">{sc.studentPhone || "-"}</TableCell>
                    <TableCell className="text-sm">{sc.studentEmail || "-"}</TableCell>
                    <TableCell className="text-sm text-center">
                      <Badge className={getRemainingBadgeClass(sc.remainingSessions)}>
                        {sc.remainingSessions}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {sc.endDate ? format(new Date(sc.endDate), "dd/MM/yyyy") : "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {sc.endDate ? (() => {
                        const today = new Date(new Date().toDateString());
                        const end = new Date(sc.endDate);
                        if (end < today)
                          return <Badge className="bg-red-100 text-red-800">Đã kết thúc</Badge>;
                        if (sc.remainingSessions < 5)
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

        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      </CardContent>
    </Card>
  );
}
