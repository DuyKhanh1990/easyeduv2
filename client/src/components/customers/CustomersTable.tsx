import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Settings2, Pencil, ReceiptText, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ColumnConfig } from "./SortableColumnItem";
import type { StudentResponse } from "@shared/schema";

interface ParentRecord {
  id: string;
  fullName: string;
  code: string;
}

interface CustomersTableProps {
  students: StudentResponse[];
  isLoading: boolean;
  visibleColumns: ColumnConfig[];
  selectedIds: string[];
  crmRelationships: any[] | undefined;
  parents?: ParentRecord[];
  toggleSelectAll: () => void;
  toggleSelect: (id: string) => void;
  onEdit: (student: StudentResponse) => void;
  onDelete: (id: string) => void;
  onCreateInvoice: (student: StudentResponse) => void;
  onViewDetail: (student: StudentResponse) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function CustomersTable({
  students,
  isLoading,
  visibleColumns,
  selectedIds,
  crmRelationships,
  parents = [],
  toggleSelectAll,
  toggleSelect,
  onEdit,
  onDelete,
  onCreateInvoice,
  onViewDetail,
  canEdit = true,
  canDelete = true,
}: CustomersTableProps) {
  const STICKY_BG_HEADER = "bg-white dark:bg-slate-950";
  const BLOCK_SHADOW_RIGHT = "shadow-[4px_0_6px_-2px_rgba(0,0,0,0.10)]";
  const BLOCK_SHADOW_LEFT  = "shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.10)]";

  const getHeaderStyle = (column: ColumnConfig) => {
    const base = cn("z-20", STICKY_BG_HEADER);
    if (column.id === "selection") return cn("w-10 min-w-[40px] max-w-[40px] sticky left-0", base);
    if (column.id === "code")      return cn("min-w-[100px] sticky left-10", base);
    if (column.id === "fullName")  return cn("min-w-[180px] sticky left-[140px]", base);
    if (column.id === "location")  return cn("min-w-[140px] sticky left-[320px]", base, BLOCK_SHADOW_RIGHT);
    if (column.id === "actions")   return cn("w-12 sticky right-0 z-20 text-center", STICKY_BG_HEADER, BLOCK_SHADOW_LEFT);
    return "min-w-[150px]";
  };

  const getCellStyle = (columnId: string, isSelected: boolean) => {
    const bg = isSelected
      ? "bg-blue-50 dark:bg-blue-950/20 group-hover:bg-blue-100 dark:group-hover:bg-blue-950/30"
      : "bg-white dark:bg-slate-950 group-hover:bg-gray-50 dark:group-hover:bg-slate-900";
    const base = cn("z-10", bg);
    if (columnId === "selection") return cn("sticky left-0 w-10 min-w-[40px] max-w-[40px]", base);
    if (columnId === "code")      return cn("sticky left-10 min-w-[100px]", base);
    if (columnId === "fullName")  return cn("sticky left-[140px]", base);
    if (columnId === "location")  return cn("sticky left-[320px]", base, BLOCK_SHADOW_RIGHT);
    if (columnId === "actions")   return cn("sticky right-0 z-10 text-center", bg, BLOCK_SHADOW_LEFT);
    return "";
  };

  const renderCell = (student: any, columnId: string) => {
    switch (columnId) {
      case "selection":
        return (
          <Checkbox
            checked={selectedIds.includes(student.id)}
            onCheckedChange={() => toggleSelect(student.id)}
          />
        );
      case "code":
        return <span className="font-medium text-primary">{student.code}</span>;
      case "fullName":
        return (
          <button
            onClick={(e) => { e.stopPropagation(); onViewDetail(student); }}
            className="font-semibold text-blue-600 hover:text-blue-800 hover:underline text-left"
          >
            {student.fullName}
          </button>
        );
      case "location":
        return (
          <div className="flex flex-wrap gap-1 min-w-[100px]">
            {student.locations?.length > 0
              ? student.locations.map((sl: any) => (
                  <Badge key={sl.locationId} variant="outline" className="text-[10px] px-1 h-5 bg-background border-none text-foreground">
                    {sl.location?.name}
                  </Badge>
                ))
              : "-"}
          </div>
        );
      case "type":
        return <Badge variant="outline" className="whitespace-nowrap border-none bg-background text-foreground">{student.type || "Học viên"}</Badge>;
      case "phone":
        return student.phone || "-";
      case "dob":
        return student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString("vi-VN") : "-";
      case "email":
        return <span className="max-w-[150px] truncate block">{student.email || "-"}</span>;
      case "parent1":
        return student.parentName || "-";
      case "phone1":
        return student.parentPhone || "-";
      case "parent2":
        return student.parentName2 || "-";
      case "phone2":
        return student.parentPhone2 || "-";
      case "parent3":
        return student.parentName3 || "-";
      case "phone3":
        return student.parentPhone3 || "-";
      case "parentAccounts": {
        const ids: string[] = (student as any).parentIds || [];
        if (!ids.length) return "-";
        const resolved = ids
          .map((id) => parents.find((p) => p.id === id))
          .filter(Boolean) as ParentRecord[];
        if (!resolved.length) return <span className="text-xs text-muted-foreground">{ids.length} PH</span>;
        return (
          <div className="flex flex-wrap gap-1 min-w-[120px]">
            {resolved.map((p) => (
              <Badge key={p.id} variant="outline" className="text-[10px] px-1 h-5 bg-background border-none text-foreground whitespace-nowrap">
                {p.fullName} ({p.code})
              </Badge>
            ))}
          </div>
        );
      }
      case "pipeline":
        return (
          <div className="flex flex-wrap gap-1 min-w-[100px]">
            {student.relationshipList?.length > 0 ? (
              student.relationshipList.map((rel: any) => (
                <Badge
                  key={rel.id}
                  style={{ backgroundColor: rel.color, color: "#ffffff", borderColor: rel.color }}
                  variant="secondary"
                  className="rounded-md font-medium whitespace-nowrap border text-[10px] px-1 h-5"
                >
                  {rel.name}
                </Badge>
              ))
            ) : Array.isArray(student.pipelineStage) ? (
              student.pipelineStage.map((stage: string, idx: number) => {
                const relConfig = crmRelationships?.find((r: any) => r.name === stage);
                return (
                  <Badge
                    key={idx}
                    variant="secondary"
                    className="rounded-md font-medium whitespace-nowrap border text-[10px] px-1 h-5"
                    style={relConfig ? { backgroundColor: relConfig.color, color: "#ffffff", borderColor: relConfig.color } : undefined}
                  >
                    {stage}
                  </Badge>
                );
              })
            ) : (
              <Badge variant="secondary" className="rounded-md font-medium whitespace-nowrap border text-[10px] px-1 h-5">
                {student.pipelineStage || "Lead"}
              </Badge>
            )}
          </div>
        );
      case "source":
        return (
          <div className="flex flex-wrap gap-1 min-w-[100px]">
            {student.sourceList && student.sourceList.length > 0
              ? student.sourceList.map((s: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-[10px] px-1 h-5 bg-background border-none text-foreground">{s}</Badge>
                ))
              : student.source || "-"}
          </div>
        );
      case "reject":
        return <span className="max-w-[150px] truncate block">{student.rejectReason || "-"}</span>;
      case "sale":
        return (
          <div className="flex flex-wrap gap-1 min-w-[100px]">
            {student.salesByList?.length > 0
              ? student.salesByList.map((s: any) => (
                  <Badge key={s.id} variant="outline" className="text-[10px] px-1 h-5 bg-background border-none text-foreground">{s.fullName}</Badge>
                ))
              : "-"}
          </div>
        );
      case "manager":
        return (
          <div className="flex flex-wrap gap-1 min-w-[100px]">
            {student.managedByList?.length > 0
              ? student.managedByList.map((s: any) => (
                  <Badge key={s.id} variant="outline" className="text-[10px] px-1 h-5 bg-background border-none text-foreground">{s.fullName}</Badge>
                ))
              : "-"}
          </div>
        );
      case "teacher":
        return (
          <div className="flex flex-wrap gap-1 min-w-[100px]">
            {student.teacherList?.length > 0
              ? student.teacherList.map((s: any) => (
                  <Badge key={s.id} variant="outline" className="text-[10px] px-1 h-5 bg-background border-none text-foreground">{s.fullName}</Badge>
                ))
              : "-"}
          </div>
        );
      case "classes":
        return (
          <div className="flex flex-col gap-1 min-w-[220px]">
            {student.classDetails && student.classDetails.length > 0 ? (
              student.classDetails.map((detail: any, idx: number) => {
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const start = detail.startDate ? new Date(detail.startDate) : null;
                const end = detail.endDate ? new Date(detail.endDate) : null;
                let computedLabel: string;
                let statusColor: string;
                if (!start && !end) {
                  computedLabel = "waiting";
                  statusColor = "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100";
                } else if (start && today < start) {
                  computedLabel = "Chờ đến lịch";
                  statusColor = "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100";
                } else if (end && today > end) {
                  computedLabel = "Đã kết thúc";
                  statusColor = "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100";
                } else {
                  computedLabel = "Đang học";
                  statusColor = "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100";
                }
                return (
                  <TooltipProvider key={idx}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="text-xs flex items-center gap-1.5 cursor-help hover:opacity-75 transition-opacity">
                          <span className="font-semibold">{detail.className}</span>
                          <Badge variant="outline" className={`border-none text-[10px] px-1.5 h-4 ${statusColor}`}>{computedLabel}</Badge>
                          <span className="text-gray-600 dark:text-gray-400 whitespace-nowrap">
                            <span className="text-blue-700 dark:text-blue-400 font-semibold">{detail.totalSessions}</span>
                            {" | "}
                            <span className="text-green-700 dark:text-green-400 font-semibold">{detail.attendedSessions}</span>
                            {" | "}
                            <span className="text-orange-600 dark:text-orange-400 font-semibold">{detail.remainingSessions}</span>
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="bg-slate-900 text-white text-xs p-2">
                        <div className="font-semibold">{detail.className} {computedLabel}</div>
                        <div className="mt-1">
                          <div>Tổng: <span className="text-blue-300">{detail.totalSessions}</span></div>
                          <div>Đã học: <span className="text-green-300">{detail.attendedSessions}</span></div>
                          <div>Còn lại: <span className="text-orange-300">{detail.remainingSessions}</span></div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })
            ) : "-"}
          </div>
        );
      case "accountStatus":
        return (
          <Badge
            variant="outline"
            className={`whitespace-nowrap border-none ${student.accountStatus === "Hoạt động" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100"}`}
          >
            {student.accountStatus || "Hoạt động"}
          </Badge>
        );
      case "address":
        return <span className="max-w-[200px] truncate block">{student.address || "-"}</span>;
      case "social":
        return <span className="max-w-[150px] truncate block">{student.socialLink || "-"}</span>;
      case "level":
        return student.academicLevel || "-";
      case "note":
        return <span className="max-w-[200px] truncate block">{student.note || "-"}</span>;
      case "createdAt":
        return student.createdAt ? new Date(student.createdAt).toLocaleString("vi-VN") : "-";
      case "creator":
        return student.creator?.username || "-";
      case "updatedAt":
        return student.updatedAt ? new Date(student.updatedAt).toLocaleString("vi-VN") : "-";
      case "updater":
        return student.updater?.username || "-";
      case "actions":
        if (!canEdit && !canDelete) return null;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button data-testid={`button-actions-${student.id}`} variant="ghost" size="icon" className="h-8 w-8">
                <Settings2 className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {canEdit && (
                <DropdownMenuItem
                  data-testid={`item-edit-${student.id}`}
                  className="cursor-pointer flex items-center gap-2"
                  onClick={(e) => { e.stopPropagation(); onEdit(student); }}
                >
                  <Pencil className="w-4 h-4 text-muted-foreground" /> Sửa
                </DropdownMenuItem>
              )}
              {canEdit && (
                <DropdownMenuItem
                  data-testid={`item-create-invoice-${student.id}`}
                  className="cursor-pointer flex items-center gap-2"
                  onClick={(e) => { e.stopPropagation(); onCreateInvoice(student); }}
                >
                  <ReceiptText className="w-4 h-4 text-muted-foreground" /> Tạo hoá đơn
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem
                  data-testid={`item-delete-${student.id}`}
                  onClick={(e) => { e.stopPropagation(); onDelete(student.id); }}
                  className="cursor-pointer flex items-center gap-2 text-destructive focus:text-destructive focus:bg-destructive/10"
                >
                  <Trash2 className="w-4 h-4" /> Xoá
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      default:
        return null;
    }
  };

  return (
    <table className="w-full caption-bottom text-sm border-separate border-spacing-0">
      <thead className="sticky top-0 z-20 bg-muted/80 backdrop-blur-sm">
        <tr className="bg-muted/30">
          {visibleColumns.map((col) => (
            <th
              key={col.id}
              className={cn(
                "h-10 px-3 text-left align-middle font-semibold text-foreground whitespace-nowrap border-b border-border [&:has([role=checkbox])]:pr-0",
                getHeaderStyle(col)
              )}
            >
              {col.id === "selection" ? (
                <Checkbox
                  checked={selectedIds.length === students.length && students.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              ) : (
                col.label
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="[&_tr:last-child_td]:border-b-0">
        {isLoading ? (
          <tr>
            <td colSpan={visibleColumns.length} className="h-32 p-4 text-center text-muted-foreground align-middle border-b border-border">
              <div className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                Đang tải dữ liệu...
              </div>
            </td>
          </tr>
        ) : students.length === 0 ? (
          <tr>
            <td colSpan={visibleColumns.length} className="h-32 p-4 text-center text-muted-foreground align-middle border-b border-border">
              Không tìm thấy học viên nào.
            </td>
          </tr>
        ) : (
          students.map((student) => (
            <tr
              key={student.id}
              className={cn(
                "transition-colors cursor-pointer group text-xs bg-white dark:bg-slate-950",
                selectedIds.includes(student.id)
                  ? "bg-blue-50 dark:bg-blue-950/20 hover:bg-blue-100 dark:hover:bg-blue-950/30"
                  : "hover:bg-gray-50 dark:hover:bg-slate-900"
              )}
              onClick={() => toggleSelect(student.id)}
            >
              {visibleColumns.map((col) => (
                <td
                  key={`${student.id}-${col.id}`}
                  className={cn(
                    "p-3 align-middle whitespace-nowrap border-b border-border [&:has([role=checkbox])]:pr-0",
                    getCellStyle(col.id, selectedIds.includes(student.id))
                  )}
                  onClick={(e) => (col.id === "selection" || col.id === "actions") && e.stopPropagation()}
                >
                  {renderCell(student, col.id)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
