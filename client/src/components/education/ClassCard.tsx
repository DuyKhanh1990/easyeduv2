import { Pencil, Trash2, MoreVertical, User, Clock, MapPin, Copy, FileDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ComputedStatus = "recruiting" | "active" | "closed" | "force_closed" | undefined;

interface ClassCardProps {
  cls: any;
  isSelected: boolean;
  onToggle: (checked: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopy?: () => void;
  onExportStudents?: () => void;
  onViewDetail: () => void;
  computedStatus: ComputedStatus;
  canEdit?: boolean;
  canDelete?: boolean;
}

function StatusBadge({ status }: { status: ComputedStatus }) {
  switch (status) {
    case "recruiting":
      return <Badge variant="outline" className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 border-none text-[10px] px-1.5 py-0 h-4 shrink-0">Đang tuyển sinh</Badge>;
    case "active":
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none text-[10px] px-1.5 py-0 h-4 shrink-0">Đang học</Badge>;
    case "closed":
      return <Badge variant="secondary" className="bg-gray-100 text-gray-600 hover:bg-gray-100 border-none text-[10px] px-1.5 py-0 h-4 shrink-0">Kết thúc</Badge>;
    case "force_closed":
      return <Badge className="bg-red-100 text-red-600 hover:bg-red-100 border-none text-[10px] px-1.5 py-0 h-4 shrink-0">Đã đóng</Badge>;
    default:
      return null;
  }
}

export function ClassCard({ cls, isSelected, onToggle, onEdit, onDelete, onCopy, onExportStudents, onViewDetail, computedStatus, canEdit = true, canDelete = true }: ClassCardProps) {
  const hasMenu = canEdit || canDelete || !!onCopy || !!onExportStudents;
  return (
    <Card
      className="hover:shadow-md transition-all cursor-pointer group border-border relative overflow-hidden h-full"
      data-testid={`card-class-${cls.id}`}
    >
      {/* 3-dot menu top-right */}
      {hasMenu && (
        <div
          className="absolute top-2 right-2 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {canEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="h-4 w-4 mr-2" />Chỉnh sửa
                </DropdownMenuItem>
              )}
              {onCopy && (
                <DropdownMenuItem onClick={onCopy}>
                  <Copy className="h-4 w-4 mr-2" />Sao chép
                </DropdownMenuItem>
              )}
              {onExportStudents && (
                <DropdownMenuItem onClick={onExportStudents}>
                  <FileDown className="h-4 w-4 mr-2" />Tải danh sách HV
                </DropdownMenuItem>
              )}
              {(canEdit || !!onCopy || !!onExportStudents) && canDelete && <DropdownMenuSeparator />}
              {canDelete && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4 mr-2" />Xóa
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div onClick={onViewDetail}>
        <CardContent className="p-5 flex flex-col h-full">

          {/* Top bar: checkbox + tags */}
          <div className="flex items-center gap-2 mb-3 pr-7">
            {canDelete && (
              <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => onToggle(!!checked)}
                  data-testid={`checkbox-class-${cls.id}`}
                />
              </div>
            )}
            <StatusBadge status={computedStatus} />
            {cls.classType === "tutor"
              ? <Badge className="px-1.5 py-0 h-4 text-[9px] font-bold bg-purple-100 text-purple-700 hover:bg-purple-100 border-none shrink-0">Gia sư</Badge>
              : <Badge className="px-1.5 py-0 h-4 text-[9px] font-bold bg-blue-100 text-blue-700 hover:bg-blue-100 border-none shrink-0">Nhóm</Badge>
            }
          </div>

          {/* Class name */}
          <h3 className="font-bold text-lg group-hover:text-primary transition-colors line-clamp-1 mb-1">{cls.name}</h3>

          {/* Code + location row */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap mb-3">
            <span className="font-mono font-bold text-primary/80 shrink-0">{cls.classCode}</span>
            <span>•</span>
            <span className="flex items-center gap-1 shrink-0"><MapPin className="h-3 w-3" />{cls.location?.name || "Cơ sở"}</span>
          </div>

          <div className="mt-auto space-y-4">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground/80">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{cls.shiftTemplate?.name || "Linh hoạt"}</span>
              <span className="text-muted-foreground">|</span>
              <div className="flex gap-0.5">
                {cls.weekdays?.map((wd: number) => (
                  <span key={wd} className="bg-muted px-1 rounded text-[10px]">{wd === 0 ? "CN" : `T${wd + 1}`}</span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold">
                  {cls.teachers?.length > 0
                    ? cls.teachers.map((t: any) => t.fullName).join(", ")
                    : "Chưa gán"}
                </span>
                <span className="text-[10px] text-muted-foreground">Giáo viên</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 py-2 border-t border-b border-border/50">
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Chờ</span>
                <span className="text-sm font-bold text-yellow-600">{cls.waitingStudentsCount || 0}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Chính thức</span>
                <span className="text-sm font-bold text-green-600">{cls.activeStudentsCount || 0}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] font-medium">
                <span className="text-muted-foreground">Tiến độ buổi học</span>
                <span>{cls.completedSessions || 0} / {cls.totalSessions || 0} buổi</span>
              </div>
              <Progress value={cls.totalSessions ? ((cls.completedSessions || 0) / (cls.totalSessions || 1)) * 100 : 0} className="h-1" />
            </div>
          </div>
        </CardContent>
      </div>
    </Card>
  );
}
