import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ClassGroup, ChoBuBaoLuuRow } from "../hooks/useChoBuBaoLuuTab";

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
          <table className="w-full text-sm border-collapse">
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
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{row.studentName}</div>
                      <div className="text-xs text-muted-foreground">{row.studentCode}</div>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {row.sessionIndex != null ? `Buổi ${row.sessionIndex}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{shiftLabel}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{dateLabel}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{row.teacherNames}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${statusInfo.className}`}
                      >
                        {statusInfo.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer: class name + total */}
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
  isLoading,
}: {
  data: ClassGroup[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm border rounded-md bg-muted/20">
        Không có học viên nào đang chờ bù hoặc bảo lưu
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.map((group) => (
        <ClassCard key={group.classId} group={group} />
      ))}
    </div>
  );
}
