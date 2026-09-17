import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MakeupDialog } from "@/components/education/MakeupDialog";
import { ChoBuBaoLuuFilters as FilterState, ClassGroup, ChoBuBaoLuuRow } from "../hooks/useChoBuBaoLuuTab";
import { ChoBuBaoLuuFilters } from "./ChoBuBaoLuuFilters";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  makeup_wait: { label: "Nghỉ chờ bù", className: "bg-orange-100 text-orange-700 border-orange-200" },
  paused: { label: "Bảo lưu", className: "bg-blue-100 text-blue-700 border-blue-200" },
};

function ClassCard({
  group,
  selectedIds,
  onToggleAll,
  onToggleRow,
}: {
  group: ClassGroup;
  selectedIds: Set<string>;
  onToggleAll: (rows: ChoBuBaoLuuRow[], checked: boolean) => void;
  onToggleRow: (row: ChoBuBaoLuuRow, checked: boolean) => void;
}) {
  const allChecked = group.rows.length > 0 && group.rows.every((row) => selectedIds.has(row.id));
  const someChecked = group.rows.some((row) => selectedIds.has(row.id)) && !allChecked;

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
                  <div className="flex justify-center">
                    <Checkbox
                      checked={allChecked ? true : someChecked ? "indeterminate" : false}
                      data-testid={`select-all-${group.classId}`}
                      onCheckedChange={(v) => onToggleAll(group.rows, v === true)}
                    />
                  </div>
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
                    className={`border-b hover:bg-muted/20 transition-colors ${selectedIds.has(row.id) ? "bg-muted/30" : ""}`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex justify-center">
                        <Checkbox
                          checked={selectedIds.has(row.id)}
                          data-testid={`select-row-${row.id}`}
                          onCheckedChange={(v) => onToggleRow(row, !!v)}
                        />
                      </div>
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
  const { toast } = useToast();
  const [selectedRows, setSelectedRows] = useState<Map<string, ChoBuBaoLuuRow>>(new Map());
  const [isMakeupDialogOpen, setIsMakeupDialogOpen] = useState(false);
  const [makeupClassId, setMakeupClassId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const selectedRowsList = useMemo(() => Array.from(selectedRows.values()), [selectedRows]);
  const selectedIds = useMemo(() => new Set(selectedRows.keys()), [selectedRows]);
  const selectedClassIds = useMemo(
    () => new Set(selectedRowsList.map((row) => row.classId)),
    [selectedRowsList],
  );
  const selectedMakeupRows = useMemo(
    () => selectedRowsList.filter((row) => row.attendanceStatus === "makeup_wait"),
    [selectedRowsList],
  );

  const { data: makeupClassSessions = [] } = useQuery<any[]>({
    queryKey: [`/api/classes/${makeupClassId}/sessions`],
    enabled: isMakeupDialogOpen && !!makeupClassId,
  });
  const { data: makeupClass } = useQuery<any>({
    queryKey: [`/api/classes/${makeupClassId}`],
    enabled: isMakeupDialogOpen && !!makeupClassId,
  });
  const { data: makeupActiveStudents = [] } = useQuery<any[]>({
    queryKey: [`/api/classes/${makeupClassId}/active-students`],
    enabled: isMakeupDialogOpen && !!makeupClassId,
    staleTime: 0,
  });

  const selectedStudentsForMakeup = useMemo(
    () => selectedMakeupRows.map((row) => {
      const activeStudent = makeupActiveStudents.find((student: any) => student.studentId === row.studentId);
      return {
        ...row,
        student: { id: row.studentId, fullName: row.studentName, code: row.studentCode },
        allStudentSessions: activeStudent?.studentSessions ?? [],
      };
    }),
    [selectedMakeupRows, makeupActiveStudents],
  );

  const makeupMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!makeupClassId) throw new Error("Chưa xác định lớp học");
      const response = await apiRequest("POST", `/api/classes/${makeupClassId}/makeup`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/learning-overview/cho-bu-bao-luu"] });
      setIsMakeupDialogOpen(false);
      setMakeupClassId(null);
      setSelectedRows(new Map());
      toast({ title: "Thành công", description: "Đã xếp bù thành công" });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể xếp bù",
        variant: "destructive",
      });
    },
  });

  const toggleRow = (row: ChoBuBaoLuuRow, checked: boolean) => {
    setSelectedRows((previous) => {
      const next = new Map(previous);
      if (checked) next.set(row.id, row);
      else next.delete(row.id);
      return next;
    });
  };

  const toggleAll = (rows: ChoBuBaoLuuRow[], checked: boolean) => {
    setSelectedRows((previous) => {
      const next = new Map(previous);
      rows.forEach((row) => {
        if (checked) next.set(row.id, row);
        else next.delete(row.id);
      });
      return next;
    });
  };

  const openMakeupDialog = () => {
    if (selectedClassIds.size !== 1) {
      toast({
        title: "Chọn học viên trong cùng một lớp",
        description: "Dialog xếp bù hiện tại xử lý một lớp gốc mỗi lần.",
        variant: "destructive",
      });
      return;
    }
    if (selectedMakeupRows.length === 0) {
      toast({
        title: "Không thể xếp bù",
        description: "Chỉ học viên có trạng thái Nghỉ chờ bù mới được xếp bù.",
        variant: "destructive",
      });
      return;
    }
    if (selectedMakeupRows.length !== selectedRowsList.length) {
      toast({
        title: "Bỏ chọn học viên Bảo lưu",
        description: "Chỉ các dòng Nghỉ chờ bù được đưa vào dialog xếp bù.",
        variant: "destructive",
      });
      return;
    }
    setMakeupClassId(selectedMakeupRows[0].classId);
    setIsMakeupDialogOpen(true);
  };

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
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <ChoBuBaoLuuFilters
              filters={filters}
              onFiltersChange={onFiltersChange}
              availableClasses={availableClasses}
              availableTeachers={availableTeachers}
            />
          </div>
          {selectedRowsList.length > 0 && (
            <Button
              size="sm"
              className="h-9 shrink-0 bg-blue-600 text-white hover:bg-blue-700"
              onClick={openMakeupDialog}
              data-testid="button-bulk-makeup"
            >
              Xếp bù ({selectedRowsList.length})
            </Button>
          )}
        </div>
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
              <ClassCard
                key={group.classId}
                group={group}
                selectedIds={selectedIds}
                onToggleAll={toggleAll}
                onToggleRow={toggleRow}
              />
            ))}
          </div>
        )}
      </div>

      {isMakeupDialogOpen && makeupClassId && (
        <MakeupDialog
          isOpen={isMakeupDialogOpen}
          onOpenChange={(open) => {
            setIsMakeupDialogOpen(open);
            if (!open) setMakeupClassId(null);
          }}
          selectedStudents={selectedStudentsForMakeup}
          classSessions={makeupClassSessions}
          allClasses={[]}
          classId={makeupClassId}
          locationId={makeupClass?.locationId}
          onConfirm={(makeupData) => makeupMutation.mutate(makeupData)}
          isPending={makeupMutation.isPending}
        />
      )}

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
