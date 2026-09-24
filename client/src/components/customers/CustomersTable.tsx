import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MoreHorizontal, Pencil, ReceiptText, Trash2, ChevronDown, MessageCircle, CheckCircle2, XCircle, CalendarPlus, Star, AlertTriangle, Clock, Facebook, PhoneCall } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { ColumnConfig } from "./SortableColumnItem";
import type { StudentResponse } from "@shared/schema";
import { CreateTaskDialog } from "@/pages/tasks/components/CreateTaskDialog";

/* ── Avatar helper ── */
const AVATAR_GRADIENTS = [
  "from-sky-500 to-blue-600",
  "from-violet-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-orange-500 to-amber-600",
  "from-rose-500 to-pink-600",
  "from-indigo-500 to-blue-700",
  "from-cyan-500 to-sky-600",
];
function avatarGradient(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length];
}
function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0][0] ?? "?").toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ── Ending-soon badge ── */
function EndingSoonBadge({ classes }: { classes: { className: string; remainingSessions: number; endDate: string }[] }) {
  const [popPos, setPopPos] = useState<{ x: number; y: number } | null>(null);
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[12.5px] text-orange-600 font-semibold cursor-default leading-none"
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setPopPos({ x: r.left, y: r.bottom + 6 });
      }}
      onMouseLeave={() => setPopPos(null)}
    >
      <AlertTriangle className="w-3 h-3" /> Sắp hết lịch
      {popPos && createPortal(
        <div
          style={{ position: "fixed", left: popPos.x, top: popPos.y, zIndex: 99999 }}
          className="bg-white border border-orange-200 rounded-xl shadow-xl p-2.5 min-w-[220px] max-w-[300px]"
          onMouseLeave={() => setPopPos(null)}
        >
          {classes.map((ec, i) => {
            const endDateFormatted = ec.endDate
              ? (() => {
                  const datePart = ec.endDate.slice(0, 10); // handle ISO datetime
                  const [y, m, d] = datePart.split("-");
                  return y && m && d ? `${d}/${m}/${y}` : null;
                })()
              : null;
            return (
              <div key={i} className="text-xs leading-snug py-1 flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0 mt-1" />
                <div>
                  <span className="font-semibold text-slate-700">{ec.className}</span>
                  <span className="text-slate-500"> · còn </span>
                  <span className="font-semibold text-orange-600">{ec.remainingSessions} buổi</span>
                  {endDateFormatted && (
                    <div className="text-slate-400 text-xs mt-0.5">
                      Kết thúc: <span className="font-medium text-slate-500">{endDateFormatted}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </span>
  );
}

/* ── Debt invoices badge (Công nợ) ── */
type DebtInvoiceItem = { id: string; code: string; dueDate: string | null; daysOverdue: number; remainingAmount: number; debtStatus: string };

const DEBT_STATUS_CONFIG: Record<string, { label: string; dotColor: string; textColor: string; borderColor: string; bgColor: string }> = {
  overdue: { label: "Quá hạn",     dotColor: "bg-red-400",    textColor: "text-red-600",    borderColor: "border-red-200",    bgColor: "bg-white" },
  dueSoon: { label: "Sắp đến hạn", dotColor: "bg-orange-400", textColor: "text-orange-600", borderColor: "border-orange-200", bgColor: "bg-white" },
  inTerm:  { label: "Trong hạn",   dotColor: "bg-green-400",  textColor: "text-green-600",  borderColor: "border-green-200",  bgColor: "bg-white" },
  noDue:   { label: "Chưa có hạn", dotColor: "bg-slate-400",  textColor: "text-slate-500",  borderColor: "border-slate-200",  bgColor: "bg-white" },
};

// Ưu tiên hiển thị trạng thái nghiêm trọng nhất
const DEBT_PRIORITY = ["overdue", "dueSoon", "inTerm", "noDue"];

function OverdueInvoicesBadge({ invoices }: { invoices: DebtInvoiceItem[] }) {
  const [popPos, setPopPos] = useState<{ x: number; y: number } | null>(null);

  // Tìm trạng thái ưu tiên cao nhất để hiển thị trên badge
  const topStatus = DEBT_PRIORITY.find(s => invoices.some(inv => inv.debtStatus === s)) ?? "noDue";
  const cfg = DEBT_STATUS_CONFIG[topStatus] ?? DEBT_STATUS_CONFIG.noDue;

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[12.5px] font-semibold cursor-default leading-none ${cfg.textColor}`}
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setPopPos({ x: r.left, y: r.bottom + 6 });
      }}
      onMouseLeave={() => setPopPos(null)}
    >
      <Clock className="w-3 h-3" />
      {topStatus === "overdue" && invoices.filter(i => i.debtStatus === "overdue").length > 0
        ? `Quá hạn ${invoices.find(i => i.debtStatus === "overdue")?.daysOverdue ?? 0} ngày`
        : cfg.label}
      {popPos && createPortal(
        <div
          style={{ position: "fixed", left: popPos.x, top: popPos.y, zIndex: 99999 }}
          className={`bg-white rounded-xl shadow-xl p-2.5 min-w-[260px] max-w-[340px] border ${cfg.borderColor}`}
          onMouseLeave={() => setPopPos(null)}
        >
          <div className={`text-xs font-bold uppercase tracking-wide mb-1.5 ${cfg.textColor}`}>Công nợ</div>
          {invoices.map((inv, i) => {
            const sc = DEBT_STATUS_CONFIG[inv.debtStatus] ?? DEBT_STATUS_CONFIG.noDue;
            const dueParts = inv.dueDate ? inv.dueDate.slice(0, 10).split("-") : null;
            const dueFmt = dueParts ? `${dueParts[2]}/${dueParts[1]}/${dueParts[0]}` : "—";
            const remaining = inv.remainingAmount.toLocaleString("vi-VN");
            return (
              <div key={i} className="text-xs leading-snug py-1.5 flex items-start gap-2 border-t border-slate-100 first:border-t-0">
                <span className={`w-1.5 h-1.5 rounded-full ${sc.dotColor} flex-shrink-0 mt-1`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-slate-700">{inv.code}</span>
                    <span className={`text-xs font-semibold px-1 py-0.5 rounded ${sc.textColor} bg-opacity-10`}
                      style={{ backgroundColor: `color-mix(in srgb, currentColor 10%, transparent)` }}>
                      {sc.label}
                    </span>
                  </div>
                  <div className="text-slate-400 text-xs mt-0.5 flex gap-2 flex-wrap">
                    {inv.dueDate && <span>Hạn TT: <span className="font-medium text-slate-500">{dueFmt}</span></span>}
                    {inv.debtStatus === "overdue" && inv.daysOverdue > 0 && (
                      <span className="text-red-500 font-semibold">Quá {inv.daysOverdue} ngày</span>
                    )}
                    <span>Còn lại: <span className={`font-semibold ${sc.textColor}`}>{remaining}đ</span></span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </span>
  );
}

/* ── Relative time ── */
function formatRelativeVi(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);
  if (diffMinutes < 1) return "vừa xong";
  if (diffMinutes < 60) return `${diffMinutes} phút`;
  if (diffHours < 24) { const mins = diffMinutes % 60; return mins > 0 ? `${diffHours} giờ ${mins} phút` : `${diffHours} giờ`; }
  if (diffDays < 30) { const remainHours = diffHours % 24; return remainHours > 0 ? `${diffDays} ngày ${remainHours} giờ` : `${diffDays} ngày`; }
  if (diffMonths < 12) { const weeks = Math.floor((diffDays % 30) / 7); return weeks > 0 ? `${diffMonths} tháng ${weeks} tuần` : `${diffMonths} tháng`; }
  const remainMonths = diffMonths - diffYears * 12;
  return remainMonths > 0 ? `${diffYears} năm ${remainMonths} tháng` : `${diffYears} năm`;
}

/* ── Appointment cell ── */
function AppointmentCell({ task, onClick }: { task: any; onClick?: (task: any) => void }) {
  if (!task) return <span className="text-slate-300 text-xs">—</span>;
  const isDone = task.statusName && /hoàn thành|done|xong/i.test(task.statusName);
  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const colors = ["text-blue-700 bg-blue-50 border-blue-200","text-purple-700 bg-purple-50 border-purple-200","text-orange-700 bg-orange-50 border-orange-200","text-teal-700 bg-teal-50 border-teal-200","text-pink-700 bg-pink-50 border-pink-200"];
  const colorIdx = task.id ? task.id.charCodeAt(0) % colors.length : 0;
  return (
    <div className="flex flex-col gap-0.5 min-w-[150px] cursor-pointer hover:opacity-80 transition-opacity" onClick={(e) => { e.stopPropagation(); onClick?.(task); }}>
      <span className={cn("inline-block text-xs font-semibold px-1.5 py-0.5 rounded-md border truncate max-w-[150px]", colors[colorIdx])}>
        {task.title}
      </span>
      {dueDate && (
        <div className="flex items-center gap-1 pl-0.5">
          <span className="text-xs text-slate-400">{format(dueDate, "dd-MM-yyyy HH:mm")}</span>
          {isDone ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" /> : <XCircle className="w-3 h-3 text-rose-400 shrink-0" />}
        </div>
      )}
    </div>
  );
}

type OmicallCallerLocation = {
  locationId: string;
  locationName: string;
  extension: string;
  hotline?: string;
  ready: boolean;
};

type OmicallCallerResponse = {
  available: boolean;
  locations: OmicallCallerLocation[];
};

function CustomerPhoneCallMenu({ student }: { student: any }) {
  const [open, setOpen] = useState(false);
  const { data: caller, isLoading } = useQuery<OmicallCallerResponse>({
    queryKey: ["/api/call-center/omicall/caller"],
    staleTime: 30_000,
    retry: false,
  });

  const studentLocationIds = useMemo(
    () => new Set((student.locations || []).map((location: any) => location.locationId).filter(Boolean)),
    [student.locations],
  );
  const matchingLocations = (caller?.locations || []).filter((location) => studentLocationIds.has(location.locationId));
  const callLocations = matchingLocations.length > 0 ? matchingLocations : caller?.locations || [];

  const chooseCaller = (location: OmicallCallerLocation) => {
    window.dispatchEvent(new CustomEvent("omicall:direct-call", {
      detail: {
        phoneNumber: student.phone,
        locationId: location.locationId,
        displayName: student.fullName,
        autoCall: true,
      },
    }));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          className="group inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium text-slate-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
          data-testid={`button-call-student-${student.id}`}
          title="Chọn số tổng đài để gọi"
        >
          <span>{student.phone}</span>
          <PhoneCall className="h-3 w-3 text-emerald-600 opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="z-[10000] w-64 rounded-xl border-slate-200 p-1.5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-2.5 pb-1.5 pt-1">
          <p className="text-xs font-semibold text-slate-700">Chọn số tổng đài để gọi</p>
          <p className="mt-0.5 text-xs text-slate-400">Cuộc gọi sẽ bắt đầu ngay</p>
        </div>
        {isLoading ? (
          <div className="px-2.5 py-2 text-xs text-slate-400">Đang tải cấu hình gọi...</div>
        ) : callLocations.length > 0 ? (
          callLocations.map((location) => (
            <button
              key={location.locationId}
              type="button"
              onClick={() => chooseCaller(location)}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-emerald-50"
              data-testid={`button-call-location-${student.id}-${location.locationId}`}
            >
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-slate-700">{location.locationName}</span>
                <span className="mt-0.5 block text-xs text-slate-400">Máy lẻ {location.extension}</span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-emerald-700">
                {location.hotline || "Số mặc định"}
              </span>
            </button>
          ))
        ) : (
          <div className="px-2.5 py-2 text-xs text-rose-500">Chưa có số tổng đài sẵn sàng để gọi</div>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface ParentRecord { id: string; fullName: string; code: string; }

interface CustomersTableProps {
  students: StudentResponse[];
  isLoading: boolean;
  visibleColumns: ColumnConfig[];
  selectedIds: string[];
  crmRelationships: any[] | undefined;
  parents?: ParentRecord[];
  learningStatuses?: Record<string, string>;
  studentTasksMap?: Record<string, any[]>;
  starBalancesMap?: Record<string, number>;
  endingSoonMap?: Record<string, { className: string; remainingSessions: number; endDate: string }[]>;
  overdueInvoicesMap?: Record<string, DebtInvoiceItem[]>;
  toggleSelectAll: () => void;
  toggleSelect: (id: string) => void;
  onEdit: (student: StudentResponse) => void;
  onDelete: (id: string) => void;
  onCreateInvoice: (student: StudentResponse) => void;
  onViewDetail: (student: StudentResponse) => void;
  onViewClass?: (classId: string) => void;
  onChangePipeline?: (student: StudentResponse, relationshipIds: string[]) => void;
  onChangeAccountStatus?: (student: StudentResponse, status: string) => void;
  onZaloChat?: (student: StudentResponse) => void;
  onFacebookChat?: (student: StudentResponse) => void;
  fbLinkedStudentIds?: Set<string>;
  canEdit?: boolean;
  canDelete?: boolean;
}

interface PipelineDialog { student: StudentResponse; selectedIds: string[]; }

const LEARNING_STATUS_MAP: Record<string, { label: string; dot: string; badge: string }> = {
  dang_hoc:     { label: "Đang học",     dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cho_lich:     { label: "Chờ lịch",     dot: "bg-purple-500",  badge: "bg-purple-50 text-purple-700 border-purple-200" },
  bao_luu:      { label: "Bảo lưu",      dot: "bg-amber-500",   badge: "bg-amber-50 text-amber-700 border-amber-200" },
  da_nghi:      { label: "Đã nghỉ",      dot: "bg-rose-500",    badge: "bg-rose-50 text-rose-700 border-rose-200" },
  chua_co_lich: { label: "Chưa có lịch", dot: "bg-slate-400",   badge: "bg-slate-50 text-slate-600 border-slate-200" },
};

export function CustomersTable({
  students, isLoading, visibleColumns, selectedIds, crmRelationships,
  parents = [], learningStatuses = {}, studentTasksMap = {}, starBalancesMap = {}, endingSoonMap = {}, overdueInvoicesMap = {},
  toggleSelectAll, toggleSelect, onEdit, onDelete, onCreateInvoice, onViewDetail,
  onViewClass, onChangePipeline, onChangeAccountStatus, onZaloChat, onFacebookChat, fbLinkedStudentIds,
  canEdit = true, canDelete = true,
}: CustomersTableProps) {
  const [pipelineDialog, setPipelineDialog] = useState<PipelineDialog | null>(null);
  const [accountStatusOpen, setAccountStatusOpen] = useState<string | null>(null);
  const [addTaskStudent, setAddTaskStudent] = useState<StudentResponse | null>(null);
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const queryClient = useQueryClient();

  const sortedRels = useMemo(() => {
    if (!crmRelationships) return [];
    return [...crmRelationships].sort((a: any, b: any) => parseInt(a.position || "0") - parseInt(b.position || "0"));
  }, [crmRelationships]);

  const parentGroups = useMemo(
    () => sortedRels.filter((r: any) => !r.isSystemDefault && r.isParentGroup),
    [sortedRels]
  );
  const childRelsByParent = useMemo(() => {
    const map = new Map<string, any[]>();
    sortedRels.filter((r: any) => !r.isSystemDefault && !r.isParentGroup && r.parentId).forEach((r: any) => {
      if (!map.has(r.parentId)) map.set(r.parentId, []);
      map.get(r.parentId)!.push(r);
    });
    return map;
  }, [sortedRels]);
  const directRelationships = useMemo(
    () => sortedRels.filter((r: any) =>
      r.isSystemDefault
        ? r.isUsed === true
        : !r.isParentGroup && !r.parentId
    ),
    [sortedRels]
  );

  const handleToggleRel = (rel: any) => {
    if (!pipelineDialog) return;
    // Keep historical/deleted IDs untouched while merely opening the dialog,
    // but discard them once the user explicitly chooses a current relationship.
    const liveIds = pipelineDialog.selectedIds.filter((id) => sortedRels.some((relationship: any) => relationship.id === id));
    const isSelected = liveIds.includes(rel.id);
    let newIds: string[];
    if (isSelected) {
      newIds = liveIds.filter((id) => id !== rel.id);
    } else if (rel.parentId && !rel.isSystemDefault) {
      const siblingIds = new Set(sortedRels.filter((r: any) => !r.isParentGroup && r.parentId === rel.parentId && r.id !== rel.id).map((r: any) => r.id));
      newIds = [...liveIds.filter((id) => !siblingIds.has(id)), rel.id];
    } else {
      newIds = [...liveIds, rel.id];
    }
    setPipelineDialog({ ...pipelineDialog, selectedIds: newIds });
  };

  const STICKY_BG_HEADER = "bg-slate-50 dark:bg-slate-950";
  const STICKY_BG_CELL   = "bg-white dark:bg-slate-950";
  const BLOCK_SHADOW_RIGHT = "shadow-[4px_0_6px_-2px_rgba(0,0,0,0.08)]";
  const BLOCK_SHADOW_LEFT  = "shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.08)]";

  const getHeaderStyle = (column: ColumnConfig) => {
    const base = cn("z-20", STICKY_BG_HEADER);
    if (column.id === "selection") return cn("w-10 min-w-[40px] max-w-[40px] sticky left-0", base);
    if (column.id === "code")      return cn("min-w-[100px] sticky left-10", base);
    if (column.id === "fullName")  return cn("min-w-[180px] sticky left-[140px]", base);
    if (column.id === "location")  return cn("min-w-[140px] sticky left-[320px]", base, BLOCK_SHADOW_RIGHT);
    if (column.id === "classes")   return cn("w-[410px] min-w-[410px] max-w-[410px]", base);
    if (column.id === "actions")   return cn("w-12 sticky right-0 z-20 text-center", STICKY_BG_HEADER, BLOCK_SHADOW_LEFT);
    return "min-w-[150px]";
  };

  const getCellStyle = (columnId: string, isSelected: boolean) => {
    const bg = isSelected
      ? "bg-sky-50/80 dark:bg-blue-950/20 group-hover:bg-sky-100 dark:group-hover:bg-blue-950/30"
      : `${STICKY_BG_CELL} group-hover:bg-slate-50/70 dark:group-hover:bg-slate-900`;
    const base = cn("z-10", bg);
    if (columnId === "selection") return cn("sticky left-0 w-10 min-w-[40px] max-w-[40px]", base);
    if (columnId === "code")      return cn("sticky left-10 min-w-[100px]", base);
    if (columnId === "fullName")  return cn("sticky left-[140px]", base);
    if (columnId === "location")  return cn("sticky left-[320px]", base, BLOCK_SHADOW_RIGHT);
    if (columnId === "classes")   return cn("w-[410px] min-w-[410px] max-w-[410px]", base);
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
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-sky-700 text-xs font-semibold tracking-wide whitespace-nowrap">
            {student.code}
          </span>
        );

      case "fullName": {
        const stars = starBalancesMap[student.id];
        const endingClasses = endingSoonMap[student.id];
        const name = student.fullName || "?";
        return (
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn(
              "w-7 h-7 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm",
              avatarGradient(name)
            )}>
              {getInitials(name)}
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <a
                href={`/customers/${student.id}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="font-semibold text-sky-600 hover:text-sky-800 hover:underline text-left text-xs leading-tight"
              >
                {name}
              </a>
              <div className="flex items-center gap-1.5 flex-wrap">
                {stars != null && stars > 0 && (
                  <span className="flex items-center gap-0.5 text-xs text-amber-600 font-semibold leading-none">
                    {stars}<Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                  </span>
                )}
                {endingClasses && endingClasses.length > 0 && (
                  <EndingSoonBadge classes={endingClasses} />
                )}
                {overdueInvoicesMap[student.id]?.length > 0 && (
                  <OverdueInvoicesBadge invoices={overdueInvoicesMap[student.id]} />
                )}
              </div>
            </div>
          </div>
        );
      }

      case "location":
        return (
          <div className="flex flex-wrap gap-1 min-w-[100px]">
            {student.locations?.length > 0
              ? student.locations.map((sl: any) => (
                  <span key={sl.locationId} className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[12.5px] font-medium border border-slate-200">
                    {sl.location?.name}
                  </span>
                ))
              : <span className="text-slate-300">—</span>}
          </div>
        );

      case "school":
        return (
          <div className="flex flex-wrap gap-1 min-w-[120px]">
            {student.schoolList?.length > 0
              ? student.schoolList.map((school: any) => (
                  <span key={school.id} className="inline-flex px-1.5 py-0.5 rounded-md bg-cyan-50 border border-cyan-200 text-cyan-700 text-[12.5px] font-medium">
                    {school.name}
                  </span>
                ))
              : <span className="text-slate-300">—</span>}
          </div>
        );

      case "type":
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 text-[12.5px] font-medium whitespace-nowrap">
            {student.type || "Học viên"}
          </span>
        );

      case "phone":
        return student.phone
          ? <CustomerPhoneCallMenu student={student} />
          : <span className="text-slate-300">—</span>;

      case "dob":
        return student.dateOfBirth
          ? <span className="text-xs text-slate-600">{new Date(student.dateOfBirth).toLocaleDateString("vi-VN")}</span>
          : <span className="text-slate-300">—</span>;

      case "email":
        return student.email
          ? <span className="max-w-[150px] truncate block text-xs text-slate-600">{student.email}</span>
          : <span className="text-slate-300">—</span>;

      case "parent1": return student.parentName || <span className="text-slate-300">—</span>;
      case "phone1":  return student.parentPhone || <span className="text-slate-300">—</span>;
      case "parent2": return student.parentName2 || <span className="text-slate-300">—</span>;
      case "phone2":  return student.parentPhone2 || <span className="text-slate-300">—</span>;
      case "parent3": return student.parentName3 || <span className="text-slate-300">—</span>;
      case "phone3":  return student.parentPhone3 || <span className="text-slate-300">—</span>;

      case "parentAccounts": {
        const ids: string[] = (student as any).parentIds || [];
        if (!ids.length) return <span className="text-slate-300">—</span>;
        const resolved = ids.map((id) => parents.find((p) => p.id === id)).filter(Boolean) as ParentRecord[];
        if (!resolved.length) return <span className="text-xs text-slate-400">{ids.length} PH</span>;
        return (
          <div className="flex flex-wrap gap-1 min-w-[120px]">
            {resolved.map((p) => (
              <span key={p.id} className="inline-flex px-1.5 py-0.5 rounded-md bg-teal-50 border border-teal-200 text-teal-700 text-xs font-medium whitespace-nowrap">
                {p.fullName} ({p.code})
              </span>
            ))}
          </div>
        );
      }

      case "pipeline": {
        const resolvedRelationships: any[] = student.relationshipList || [];
        const resolvedNames = new Set(resolvedRelationships.map((relationship: any) => relationship.name));
        const historicalRelationships = Array.isArray(student.pipelineStage)
          ? student.pipelineStage
              .filter((stage: string) => !resolvedNames.has(stage))
              .map((stage: string) => {
                const cfg = crmRelationships?.find((r: any) => r.name === stage);
                return {
                  ...(cfg || { id: stage, name: stage, color: "#6b7280" }),
                  // pipelineStage is retained as a historical label when the
                  // relationship ID no longer exists in crm_relationships.
                  isMissing: !cfg,
                };
              })
          : [];
        const relList: any[] = [...resolvedRelationships, ...historicalRelationships];

        const openPipelineDialog = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (!onChangePipeline) return;
          const currentIds: string[] =
            (student as any).relationshipIds?.length
              ? (student as any).relationshipIds
              : (student.relationshipList || []).map((r: any) => r.id).filter(Boolean);
          setPipelineDialog({ student, selectedIds: currentIds });
        };

        return (
          <div className="flex flex-wrap gap-1 min-w-[100px] cursor-pointer" onClick={openPipelineDialog} title="Nhấn để thay đổi mối quan hệ">
            {relList.length > 0 ? (
              relList.map((rel: any, idx: number) => {
                const badge = (
                  <Badge
                    key={rel.id ?? idx}
                    style={{ backgroundColor: `${rel.color}18`, color: rel.color, borderColor: `${rel.color}40` }}
                    variant="outline"
                    className="font-semibold whitespace-nowrap text-xs px-1.5 h-5 hover:opacity-80 transition-opacity"
                  >
                    {rel.name}{rel.isSystemDefault ? "*" : ""}
                    {rel.isMissing && (
                      <AlertTriangle
                        className="w-3 h-3 ml-0.5 text-amber-500"
                        aria-label="Mối quan hệ không tồn tại"
                      />
                    )}
                  </Badge>
                );
                return rel.isMissing ? (
                  <TooltipProvider key={`missing-${rel.id ?? idx}`} delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">{badge}</span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs rounded-xl">
                        Mối quan hệ không tồn tại
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : badge;
              })
            ) : (
              <Badge variant="outline" className="font-semibold whitespace-nowrap text-xs px-1.5 h-5 bg-slate-50 text-slate-500 border-slate-200 hover:opacity-80 transition-opacity">
                Chưa có mối quan hệ
              </Badge>
            )}
          </div>
        );
      }

      case "source":
        return (
          <div className="flex flex-wrap gap-1 min-w-[100px]">
            {student.sourceList && student.sourceList.length > 0
              ? student.sourceList.map((s: string, i: number) => (
                  <span key={i} className="inline-flex px-1.5 py-0.5 rounded-md bg-violet-50 border border-violet-200 text-violet-700 text-xs font-medium">{s}</span>
                ))
              : student.source
                ? <span className="inline-flex px-1.5 py-0.5 rounded-md bg-violet-50 border border-violet-200 text-violet-700 text-xs font-medium">{student.source}</span>
                : <span className="text-slate-300">—</span>}
          </div>
        );

      case "reject":
        return student.rejectReason
          ? <span className="max-w-[150px] truncate block text-xs text-rose-500">{student.rejectReason}</span>
          : <span className="text-slate-300">—</span>;

      case "sale":
        return (
          <div className="flex flex-wrap gap-1 min-w-[100px]">
            {student.salesByList?.length > 0
              ? student.salesByList.map((s: any) => (
                  <span key={s.id} className="inline-flex px-1.5 py-0.5 rounded-md bg-orange-50 border border-orange-200 text-orange-700 text-xs font-medium">{s.fullName}</span>
                ))
              : <span className="text-slate-300">—</span>}
          </div>
        );

      case "manager":
        return (
          <div className="flex flex-wrap gap-1 min-w-[100px]">
            {student.managedByList?.length > 0
              ? student.managedByList.map((s: any) => (
                  <span key={s.id} className="inline-flex px-1.5 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium">{s.fullName}</span>
                ))
              : <span className="text-slate-300">—</span>}
          </div>
        );

      case "teacher":
        return (
          <div className="flex flex-wrap gap-1 min-w-[100px]">
            {student.teacherList?.length > 0
              ? student.teacherList.map((s: any) => (
                  <span key={s.id} className="inline-flex px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">{s.fullName}</span>
                ))
              : <span className="text-slate-300">—</span>}
          </div>
        );

      case "classes":
        return (
          <div className="flex w-[386px] min-w-[386px] flex-col gap-1">
            {student.classDetails && student.classDetails.length > 0 ? (
              student.classDetails.map((detail: any, idx: number) => {
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const start = detail.startDate ? new Date(detail.startDate) : null;
                const end = detail.endDate ? new Date(detail.endDate) : null;
                let computedLabel: string;
                let statusBadge: string;
                if (!start && !end) {
                  computedLabel = "waiting";
                  statusBadge = "bg-slate-50 text-slate-500 border-slate-200";
                } else if (start && today < start) {
                  computedLabel = "Chờ lịch";
                  statusBadge = "bg-purple-50 text-purple-700 border-purple-200";
                } else if (end && today > end) {
                  computedLabel = "Kết thúc";
                  statusBadge = "bg-rose-50 text-rose-700 border-rose-200";
                } else {
                  computedLabel = "Đang học";
                  statusBadge = "bg-emerald-50 text-emerald-700 border-emerald-200";
                }
                return (
                  <TooltipProvider key={idx}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="grid grid-cols-[120px_82px_84px] items-center text-[12.5px] cursor-help hover:opacity-75 transition-opacity">
                          <button
                            type="button"
                            className="min-w-0 truncate text-left font-semibold text-sky-600 whitespace-nowrap hover:text-sky-800 hover:underline"
                            title={detail.className}
                            data-testid={`link-class-${detail.classId}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (detail.classId) onViewClass?.(detail.classId);
                            }}
                          >
                            {detail.className}
                          </button>
                          <span className={cn("inline-flex w-fit items-center px-1.5 py-0.5 rounded-md border text-[12.5px] font-medium whitespace-nowrap", statusBadge)}>{computedLabel}</span>
                          <span className="text-slate-400 whitespace-nowrap text-[12.5px]">
                            <span className="text-sky-600 font-bold">{detail.totalSessions}</span>
                            {" · "}
                            <span className="text-emerald-600 font-bold">{detail.attendedSessions}</span>
                            {" · "}
                            <span className="text-orange-500 font-bold">{detail.remainingSessions}</span>
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="bg-slate-900 text-white text-xs p-2.5 rounded-xl">
                        <div className="font-semibold mb-1">{detail.className} — {computedLabel}</div>
                        <div className="space-y-0.5">
                          <div>Tổng: <span className="text-sky-300 font-bold">{detail.totalSessions}</span></div>
                          <div>Đã học: <span className="text-emerald-300 font-bold">{detail.attendedSessions}</span></div>
                          <div>Còn lại: <span className="text-orange-300 font-bold">{detail.remainingSessions}</span></div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })
            ) : <span className="text-slate-300">—</span>}
          </div>
        );

      case "accountStatus": {
        const currentStatus = student.accountStatus || "Hoạt động";
        const isActive = currentStatus === "Hoạt động";
        const pill = isActive
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-rose-50 text-rose-700 border-rose-200";
        const dot = isActive ? "bg-emerald-500" : "bg-rose-400";

        if (!onChangeAccountStatus) {
          return (
              <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[12.5px] font-semibold", pill)}>
              <span className={cn("w-1.5 h-1.5 rounded-full", dot)} />
              {currentStatus}
            </span>
          );
        }
        return (
          <Popover open={accountStatusOpen === student.id} onOpenChange={(open) => setAccountStatusOpen(open ? student.id : null)}>
            <PopoverTrigger asChild>
              <button
                className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[12.5px] font-semibold transition-opacity hover:opacity-80", pill)}
                onClick={(e) => e.stopPropagation()}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", dot)} />
                {currentStatus}
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1.5 rounded-xl shadow-xl border-slate-200" align="start" onClick={(e) => e.stopPropagation()}>
              {["Hoạt động", "Không hoạt động"].map((status) => (
                <button
                  key={status}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center gap-2",
                    currentStatus === status ? "bg-slate-100 font-semibold" : "hover:bg-slate-50"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (status !== currentStatus) onChangeAccountStatus(student, status);
                    setAccountStatusOpen(null);
                  }}
                >
                  <span className={cn("w-2 h-2 rounded-full", status === "Hoạt động" ? "bg-emerald-500" : "bg-rose-400")} />
                  {status}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        );
      }

      case "address":
        return student.address
          ? <span className="max-w-[200px] truncate block text-xs text-slate-600">{student.address}</span>
          : <span className="text-slate-300">—</span>;

      case "social":
        return student.socialLink
          ? <span className="max-w-[150px] truncate block text-xs text-slate-600">{student.socialLink}</span>
          : <span className="text-slate-300">—</span>;

      case "zaloOA": {
        const ch = student.zaloChannel;
        if (!ch) return <span className="text-slate-300">—</span>;
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 cursor-default px-1.5 py-0.5 rounded-md bg-sky-50 border border-sky-200">
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                  {ch.zaloUserId.slice(0, 10)}…
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs space-y-0.5 rounded-xl">
                <p className="font-semibold">Đã kết nối Zalo OA</p>
                <p>ID: {ch.zaloUserId}</p>
                <p>Theo dõi OA: {ch.isFollowed ? "✓ Có" : "✗ Chưa"}</p>
                <p>Đã tương tác: {ch.hasInteracted ? "✓ Có" : "✗ Chưa"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }

      case "level":
        return student.academicLevel
          ? <span className="text-xs text-slate-600">{student.academicLevel}</span>
          : <span className="text-slate-300">—</span>;

      case "note":
        return student.note
          ? <span className="max-w-[200px] truncate block text-xs text-slate-500 italic">{student.note}</span>
          : <span className="text-slate-300">—</span>;

      case "createdAt":
        return student.createdAt
          ? <span className="text-xs text-slate-500 whitespace-nowrap">{new Date(student.createdAt).toLocaleString("vi-VN")}</span>
          : <span className="text-slate-300">—</span>;

      case "creator":
        return student.creator?.username
          ? <span className="text-xs text-slate-600 font-medium">{student.creator.username}</span>
          : <span className="text-slate-300">—</span>;

      case "updatedAt":
        return student.updatedAt
          ? <span className="text-xs text-slate-500 whitespace-nowrap">{new Date(student.updatedAt).toLocaleString("vi-VN")}</span>
          : <span className="text-slate-300">—</span>;

      case "updater":
        return student.updater?.username
          ? <span className="text-xs text-slate-600 font-medium">{student.updater.username}</span>
          : <span className="text-slate-300">—</span>;

      case "appointmentNearest":
      case "appointment1":
      case "appointment2": {
        const allTasks: any[] = studentTasksMap[student.id] || [];
        const now = new Date();
        const upcoming = allTasks
          .filter((t) => t.dueDate && new Date(t.dueDate) >= now)
          .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        const idx = columnId === "appointmentNearest" ? 0 : columnId === "appointment1" ? 1 : 2;
        return <AppointmentCell task={upcoming[idx]} onClick={setEditingTask} />;
      }

      case "discussion": {
        const lc = (student as any).lastComment as { content: string; createdAt: string; authorName: string } | null | undefined;
        if (!lc) return <span className="text-slate-300">—</span>;
        const dateStr = lc.createdAt ? format(new Date(lc.createdAt), "dd/MM/yyyy HH:mm") : "";
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="min-w-[200px] max-w-[280px] cursor-default">
                  <p className="text-xs text-slate-700 line-clamp-3 break-words leading-relaxed whitespace-pre-wrap">{lc.content}</p>
                  <span className="text-xs text-slate-400 mt-0.5 block">{lc.authorName} · {dateStr}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[320px] whitespace-pre-wrap text-xs leading-relaxed rounded-xl">
                <p className="font-semibold mb-1">{lc.authorName} · {dateStr}</p>
                <p>{lc.content}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }

      case "lastContact": {
        const allTasks: any[] = studentTasksMap[student.id] || [];
        const now = new Date();
        const past = allTasks
          .filter((t) => t.dueDate && new Date(t.dueDate) < now)
          .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
        const last = past[0];
        if (!last) return <span className="text-slate-300">—</span>;
        const dueDate = new Date(last.dueDate);
        const relative = formatRelativeVi(dueDate);
        const assigneePart = (last.assigneeNames || []).join(", ");
        const fullMeta = assigneePart ? `${assigneePart} có lịch hẹn: ${last.title}` : "";
        return (
          <div className="flex flex-col gap-0.5 min-w-[180px]">
            <span className="text-xs text-slate-700 font-medium">{format(dueDate, "dd/MM/yyyy HH:mm:ss")}</span>
            <span className="text-xs text-slate-400">(cách đây {relative})</span>
            {fullMeta && (
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs text-sky-600 truncate max-w-[180px] cursor-pointer block">{fullMeta}</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={4} className="max-w-[300px] text-xs break-words z-[9999] rounded-xl">
                    {fullMeta}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        );
      }

      case "learningStatus": {
        const status = learningStatuses[student.id];
        const config = status ? LEARNING_STATUS_MAP[status] : undefined;
        if (!config) return <span className="text-slate-300">—</span>;
        return (
          <span
            className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[12.5px] font-semibold", config.badge)}
            data-testid={`status-learning-${student.id}`}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", config.dot)} />
            {config.label}
          </span>
        );
      }

      case "actions":
        if (!canEdit && !canDelete && !onZaloChat && !onFacebookChat) return null;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                data-testid={`button-actions-${student.id}`}
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-100"
              >
                <MoreHorizontal className="h-4 w-4 text-slate-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-xl border-slate-200 p-1.5">
              {onZaloChat && student.zaloChannel?.zaloUserId && (
                <DropdownMenuItem
                  data-testid={`item-zalo-chat-${student.id}`}
                  className="cursor-pointer flex items-center gap-2.5 rounded-lg text-xs py-2"
                  onClick={(e) => { e.stopPropagation(); onZaloChat(student); }}
                >
                  <MessageCircle className="w-3.5 h-3.5 text-sky-500" />
                  <span>Chat Zalo OA</span>
                </DropdownMenuItem>
              )}
              {onFacebookChat && fbLinkedStudentIds?.has(student.id) && (
                <DropdownMenuItem
                  data-testid={`item-fb-chat-${student.id}`}
                  className="cursor-pointer flex items-center gap-2.5 rounded-lg text-xs py-2"
                  onClick={(e) => { e.stopPropagation(); onFacebookChat(student); }}
                >
                  <Facebook className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-blue-600 font-medium">Chat Facebook</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                data-testid={`item-add-task-${student.id}`}
                className="cursor-pointer flex items-center gap-2.5 rounded-lg text-xs py-2"
                onClick={(e) => { e.stopPropagation(); setAddTaskStudent(student); }}
              >
                <CalendarPlus className="w-3.5 h-3.5 text-emerald-500" /> Thêm lịch hẹn
              </DropdownMenuItem>
              {canEdit && (
                <DropdownMenuItem
                  data-testid={`item-edit-${student.id}`}
                  className="cursor-pointer flex items-center gap-2.5 rounded-lg text-xs py-2"
                  onClick={(e) => { e.stopPropagation(); onEdit(student); }}
                >
                  <Pencil className="w-3.5 h-3.5 text-slate-500" /> Sửa
                </DropdownMenuItem>
              )}
              {canEdit && (
                <DropdownMenuItem
                  data-testid={`item-create-invoice-${student.id}`}
                  className="cursor-pointer flex items-center gap-2.5 rounded-lg text-xs py-2"
                  onClick={(e) => { e.stopPropagation(); onCreateInvoice(student); }}
                >
                  <ReceiptText className="w-3.5 h-3.5 text-violet-500" /> Tạo hoá đơn
                </DropdownMenuItem>
              )}
              {canDelete && (
                <>
                  <div className="my-1 border-t border-slate-100" />
                  <DropdownMenuItem
                    data-testid={`item-delete-${student.id}`}
                    onClick={(e) => { e.stopPropagation(); onDelete(student.id); }}
                    className="cursor-pointer flex items-center gap-2.5 rounded-lg text-xs py-2 text-rose-600 focus:text-rose-600 focus:bg-rose-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Xoá
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );

      default: {
        if (columnId.startsWith("custom:")) {
          const id = columnId.slice("custom:".length);
          const v = (student?.customFields ?? {})[id];
          if (v === undefined || v === null || v === "") return <span className="text-slate-300">—</span>;
          return <span data-testid={`cell-custom-${id}-${student.id}`} className="text-xs text-slate-600">{String(v)}</span>;
        }
        return null;
      }
    }
  };

  const usesStandardCustomerFont = (columnId: string) =>
    !["selection", "code", "fullName", "location"].includes(columnId);

  return (
    <>
      <table className="customers-table w-full caption-bottom text-sm border-separate border-spacing-0">
        {/* ── Header ── */}
        <thead className="sticky top-0 z-20">
          <tr className="bg-slate-50 dark:bg-slate-900">
            {visibleColumns.map((col) => (
              <th
                key={col.id}
                className={cn(
                  "h-9 px-3 text-left align-middle whitespace-nowrap border-b border-slate-200 [&:has([role=checkbox])]:pr-0",
                  "text-[11px] font-semibold text-slate-500 uppercase tracking-wide",
                  usesStandardCustomerFont(col.id) && "standard-customer-font",
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

        {/* ── Body ── */}
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={visibleColumns.length} className="h-36 p-4 text-center align-middle border-b border-slate-100">
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-slate-400">Đang tải dữ liệu...</span>
                </div>
              </td>
            </tr>
          ) : students.length === 0 ? (
            <tr>
              <td colSpan={visibleColumns.length} className="h-36 p-4 text-center align-middle border-b border-slate-100">
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    <span className="text-xl">👤</span>
                  </div>
                  <span className="text-xs text-slate-400">Không tìm thấy học viên nào</span>
                </div>
              </td>
            </tr>
          ) : (
            students.map((student, rowIdx) => (
              <tr
                key={student.id}
                className={cn(
                  "transition-colors cursor-pointer group text-xs",
                  selectedIds.includes(student.id)
                    ? "bg-sky-50/80 dark:bg-blue-950/20 hover:bg-sky-100/80 dark:hover:bg-blue-950/30"
                    : rowIdx % 2 === 0
                      ? "bg-white dark:bg-slate-950 hover:bg-slate-50/70"
                      : "bg-slate-50/30 dark:bg-slate-900/30 hover:bg-slate-50/70"
                )}
                onClick={() => toggleSelect(student.id)}
              >
                {visibleColumns.map((col) => (
                  <td
                    key={`${student.id}-${col.id}`}
                    className={cn(
                      "px-3 py-2.5 align-middle whitespace-nowrap border-b border-slate-100 [&:has([role=checkbox])]:pr-0",
                      usesStandardCustomerFont(col.id) && "standard-customer-font",
                      getCellStyle(col.id, selectedIds.includes(student.id))
                    )}
                    onClick={(e) => (col.id === "selection" || col.id === "actions" || col.id === "pipeline" || col.id === "accountStatus") && e.stopPropagation()}
                  >
                    {renderCell(student, col.id)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* ── Pipeline dialog ── */}
      <Dialog open={!!pipelineDialog} onOpenChange={(open) => { if (!open) setPipelineDialog(null); }}>
        <DialogContent className="max-w-lg rounded-2xl" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Chuyển mối quan hệ</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-1">
            <p className="text-sm text-slate-500 mb-4">
              Chọn mối quan hệ mới cho <span className="font-semibold text-slate-800">{pipelineDialog?.student?.fullName}</span>
            </p>
            {parentGroups.map((group: any) => {
              const children = childRelsByParent.get(group.id) || [];
              if (children.length === 0) return null;
              return (
                <div key={group.id} className="mb-5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{group.name}</p>
                  <div className="flex flex-wrap gap-2">
                    {children.map((rel: any) => {
                      const isSelected = pipelineDialog?.selectedIds.includes(rel.id);
                      const color = rel.color || "#8b5cf6";
                      return (
                        <button
                          key={rel.id}
                          onClick={() => handleToggleRel(rel)}
                          className={cn(
                            "px-3 py-1 rounded-xl text-xs font-semibold border transition-all",
                            isSelected ? "text-white shadow-md" : "bg-white hover:opacity-80"
                          )}
                          style={isSelected
                            ? { backgroundColor: color, borderColor: color }
                            : { borderColor: `${color}60`, color, backgroundColor: `${color}10` }
                          }
                        >
                          {rel.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {directRelationships.length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Mối quan hệ khác</p>
                <div className="flex flex-wrap gap-2">
                  {directRelationships.map((rel: any) => {
                    const isSelected = pipelineDialog?.selectedIds.includes(rel.id);
                    const color = rel.color || "#3b82f6";
                    return (
                      <button
                        key={rel.id}
                        onClick={() => handleToggleRel(rel)}
                        className={cn(
                          "px-3 py-1 rounded-xl text-xs font-semibold border transition-all",
                          isSelected ? "text-white shadow-md" : "bg-white hover:opacity-80"
                        )}
                        style={isSelected
                          ? { backgroundColor: color, borderColor: color }
                          : { borderColor: `${color}60`, color, backgroundColor: `${color}10` }
                        }
                      >
                        {rel.name}{rel.isSystemDefault ? "*" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-3">
              <button
                className="px-4 py-1.5 rounded-xl text-sm border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                onClick={() => setPipelineDialog(null)}
              >
                Hủy
              </button>
              <button
                className="px-4 py-1.5 rounded-xl text-sm font-medium bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:from-sky-600 hover:to-blue-700 transition-all shadow-md shadow-sky-200"
                onClick={() => {
                  if (!pipelineDialog || !onChangePipeline) return;
                  onChangePipeline(pipelineDialog.student, pipelineDialog.selectedIds);
                  setPipelineDialog(null);
                }}
              >
                Lưu
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CreateTaskDialog
        open={!!addTaskStudent}
        onOpenChange={(v) => { if (!v) setAddTaskStudent(null); }}
        defaultSubjectIds={addTaskStudent ? [addTaskStudent.id] : []}
        defaultLocationIds={
          addTaskStudent?.locations && addTaskStudent.locations.length > 0
            ? addTaskStudent.locations.map((l: any) => l.locationId)
            : []
        }
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/tasks/by-subjects"] });
          setAddTaskStudent(null);
        }}
      />
      <CreateTaskDialog
        open={!!editingTask}
        onOpenChange={(v) => { if (!v) setEditingTask(null); }}
        initialTask={editingTask}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/tasks/by-subjects"] });
          setEditingTask(null);
        }}
      />
    </>
  );
}
