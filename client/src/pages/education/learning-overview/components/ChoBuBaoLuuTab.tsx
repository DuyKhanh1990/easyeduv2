import { useState } from "react";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { StudentNameLink } from "@/components/ui/StudentNameLink";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { ChoBuBaoLuuFilters as FilterState, ClassGroup, ChoBuBaoLuuRow } from "../hooks/useChoBuBaoLuuTab";
import { ChoBuBaoLuuFilters } from "./ChoBuBaoLuuFilters";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  makeup_wait: { label: "Nghỉ chờ bù", className: "bg-orange-100 text-orange-700 border-orange-200" },
  paused: { label: "Bảo lưu", className: "bg-blue-100 text-blue-700 border-blue-200" },
};

function ClassCard({ group }: { group: ClassGroup }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleAll = (checked: boolean) => {
    if (checked) setSelected(new Set(group.rows.map((r) => r.id)));
    else setSelected(new Set());
  };

  const toggleRow = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const allChecked = group.rows.length > 0 && selected.size === group.rows.length;
  const someChecked = selected.size > 0 && selected.size < group.rows.length;

  return (
    <Card className="rounded-xl border border-border overflow-hidden">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed text-sm border-collapse">
            <colgroup>
              <col style={{ width: "4%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "19%" }} />
              <col style={{ width: "12%" }} />
            </colgroup>
            <thead>
              <tr className="bg-muted/60 border-b">
                <th className="px-3 py-2.5 w-10">
                  <Checkbox
                    checked={allChecked ? true : someChecked ? "indeterminate" : false}
                    data-testid={`select-all-${group.classId}`}
                    onCheckedChange={(v) => toggleAll(v === true)}
                  />
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Họ và tên</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Buổi học</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Ca học</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Ngày học</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Giáo viên</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Điểm danh</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row: ChoBuBaoLuuRow) => {
                const statusInfo = STATUS_LABEL[row.attendanceStatus] ?? { label: row.attendanceStatus, className: "" };
                const shiftLabel =
                  row.startTime && row.endTime
                    ? `${row.shiftName} (${row.startTime} – ${row.endTime})`
                    : row.shiftName;
                const dateLabel = row.sessionDate
                  ? format(new Date(row.sessionDate), "dd/MM/yyyy")
                  : "—";

                return (
                  <tr
                    key={row.id}
                    data-testid={`cho-bu-row-${row.id}`}
                    className={`border-b hover:bg-muted/20 transition-colors ${selected.has(row.id) ? "bg-muted/30" : ""}`}
                  >
                    <td className="px-3 py-2.5">
                      <Checkbox
                        checked={selected.has(row.id)}
                        data-testid={`select-row-${row.id}`}
                        onCheckedChange={(v) => toggleRow(row.id, !!v)}
                      />
                    </td>
                    <td className="max-w-0 px-3 py-2.5">
                      <div className="truncate">
                        <StudentNameLink studentId={row.studentId} name={row.studentName} code={row.studentCode} />
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                      {row.sessionIndex != null ? `Buổi ${row.sessionIndex}` : "—"}
                    </td>
                    <td className="max-w-0 truncate px-3 py-2.5 text-xs text-muted-foreground">{shiftLabel}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{dateLabel}</td>
                    <td className="max-w-0 truncate px-3 py-2.5 text-xs text-muted-foreground">{row.teacherNames}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${statusInfo.className}`}>
                        {statusInfo.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/30">
          <span className="text-sm font-semibold text-foreground">{group.className}</span>
          <Badge variant="outline" className="text-xs font-normal">
            {group.totalSessions} buổi
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export function ChoBuBaoLuuTab({
  data,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  filters,
  onFiltersChange,
  availableClasses,
  availableTeachers,
  isLoading,
}: {
  data: ClassGroup[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  filters: FilterState;
  onFiltersChange: (patch: Partial<FilterState>) => void;
  availableClasses: { id: string; label: string }[];
  availableTeachers: { id: string; label: string }[];
  isLoading: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm flex flex-col h-full overflow-hidden">
      {/* Fixed filter bar */}
      <div className="shrink-0 bg-card border-b border-border/50 px-6 py-4">
        <ChoBuBaoLuuFilters
          filters={filters}
          onFiltersChange={onFiltersChange}
          availableClasses={availableClasses}
          availableTeachers={availableTeachers}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 pt-4">
        {data.length === 0 ? (
          <div className="flex h-48 items-center justify-center rounded-md border bg-muted/20 text-sm text-muted-foreground">
            Không có học viên nào phù hợp với bộ lọc
          </div>
        ) : (
          <div className="space-y-4">
            {data.map((group) => (
              <ClassCard key={group.classId} group={group} />
            ))}
          </div>
        )}
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
            <span>lớp / trang</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Trang {page}/{totalPages} · {total} lớp
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
