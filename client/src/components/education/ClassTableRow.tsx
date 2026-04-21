import { Pencil, Trash2, User, Clock, Calendar, CheckCircle2, XCircle } from "lucide-react";
import {
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface ClassTableRowProps {
  cls: any;
  isSelected: boolean;
  onToggle: (checked: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onViewDetail: () => void;
  computedStatus: "recruiting" | "active" | "closed" | undefined;
  canEdit?: boolean;
  canDelete?: boolean;
}

function StatusBadge({ status }: { status: "recruiting" | "active" | "closed" | undefined }) {
  switch (status) {
    case "recruiting":
      return <Badge variant="outline" className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 border-none">Đang tuyển sinh</Badge>;
    case "active":
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none">Đang học</Badge>;
    case "closed":
      return <Badge variant="secondary" className="bg-gray-100 text-gray-600 hover:bg-gray-100 border-none">Kết thúc</Badge>;
    default:
      return null;
  }
}

export function ClassTableRow({ cls, isSelected, onToggle, onEdit, onDelete, onViewDetail, computedStatus, canEdit = true, canDelete = true }: ClassTableRowProps) {
  return (
    <TableRow className="hover:bg-muted/30 transition-colors group cursor-pointer" data-testid={`row-class-${cls.id}`} onClick={onViewDetail}>
      {canDelete && (
        <TableCell onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onToggle(!!checked)}
            data-testid={`checkbox-table-class-${cls.id}`}
          />
        </TableCell>
      )}
      <TableCell>
        <span className="font-mono text-xs font-bold text-primary hover:underline">
          {cls.classCode}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-bold text-sm leading-tight">{cls.name}</span>
          <span className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(cls.startDate).toLocaleDateString('vi-VN')} – {new Date(cls.endDate).toLocaleDateString('vi-VN')}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="font-normal text-[10px] whitespace-nowrap">
          {cls.location?.name || "Cơ sở"}
        </Badge>
      </TableCell>
      <TableCell className="text-center">
        <div className="flex items-center justify-center gap-2 font-bold">
          <span className="text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded text-xs">{cls.waitingStudentsCount || 0}</span>
          <span className="text-muted-foreground font-light text-xs">|</span>
          <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded text-xs">{cls.activeStudentsCount || 0}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-xs font-medium truncate max-w-[120px]">
            {cls.teachers?.length > 0
              ? cls.teachers.map((t: any) => t.fullName).join(", ")
              : "Chưa gán"}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <span className="text-xs text-muted-foreground">{cls.manager?.fullName || "System"}</span>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 text-[11px]">
            <Clock className="h-3 w-3 text-muted-foreground" />
            {cls.shiftTemplate?.name || "Linh hoạt"}
          </div>
          <div className="flex gap-0.5">
            {cls.weekdays?.map((wd: number) => (
              <Badge key={wd} variant="secondary" className="px-1 py-0 h-4 text-[9px] font-bold bg-muted/50 border-none">
                {wd === 0 ? "CN" : `T${wd + 1}`}
              </Badge>
            ))}
          </div>
        </div>
      </TableCell>
      <TableCell className="text-center">
        {cls.scheduleGenerated ? (
          <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto" data-testid={`status-schedule-${cls.id}`} />
        ) : (
          <XCircle className="h-5 w-5 text-muted-foreground/40 mx-auto" data-testid={`status-schedule-${cls.id}`} />
        )}
      </TableCell>
      <TableCell>
        <StatusBadge status={computedStatus} />
      </TableCell>
      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          {canEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              data-testid={`button-edit-class-${cls.id}`}
            >
              <Pencil className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              data-testid={`button-delete-class-${cls.id}`}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
