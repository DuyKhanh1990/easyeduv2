import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LayoutList, Kanban, Plus, Pencil, Trash2, CalendarIcon,
  Search, Users, UserCheck, ChevronDown, Loader2, Filter, X, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { TaskDetailPanel } from "./TaskDetailPanel";
import type { Task, TaskStatus, TaskLevel } from "@shared/schema";
import { useMyPermissions } from "@/hooks/use-my-permissions";

/* ─── Helpers ─────────────────────────────────────────────── */
function fmtDate(d: string | Date | null) {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy"); } catch { return "—"; }
}

function getCondition(task: Task, statusName?: string) {
  if (statusName && /hoàn thành|done|xong/i.test(statusName)) {
    return { label: "Hoàn tất", className: "text-green-600 font-medium" };
  }
  if (!task.dueDate) return { label: "—", className: "text-muted-foreground" };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(task.dueDate); due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: "Quá hạn", className: "text-red-600 font-medium" };
  if (diffDays === 0) return { label: "Đến hạn", className: "text-orange-500 font-medium" };
  if (diffDays <= 3) return { label: "Sắp đến hạn", className: "text-yellow-600 font-medium" };
  return { label: "Chưa đến hạn", className: "text-blue-600 font-medium" };
}

/* ─── DatePickerCell ─────────────────────────────────────── */
function DatePickerCell({ value, onChange, readOnly }: { value: string | Date | null; onChange: (d: string | null) => void; readOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  if (readOnly) {
    return (
      <span className="flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
        <CalendarIcon className="h-3 w-3" />
        {value ? fmtDate(value) : "—"}
      </span>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 text-xs hover:text-primary transition-colors whitespace-nowrap">
          <CalendarIcon className="h-3 w-3 text-muted-foreground" />
          {value ? fmtDate(value) : <span className="text-muted-foreground">Chọn ngày</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ? new Date(value) : undefined}
          onSelect={(d) => {
            onChange(d ? d.toISOString() : null);
            setOpen(false);
          }}
          locale={vi}
        />
      </PopoverContent>
    </Popover>
  );
}

/* ─── IdMultiSelectCell — pick from id-label list ────────── */
function IdMultiSelectCell({ value, options, onChange, placeholder, icon: Icon }: {
  value: string[];
  options: { id: string; label: string }[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  icon: any;
}) {
  const [open, setOpen] = useState(false);
  const labels = options.filter(o => value.includes(o.id)).map(o => o.label);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 text-xs hover:text-primary transition-colors max-w-[140px]">
          <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
          {labels.length === 0
            ? <span className="text-muted-foreground">{placeholder}</span>
            : <span className="truncate">{labels.join(", ")}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {options.length === 0
          ? <div className="px-3 py-2 text-xs text-muted-foreground">Không có dữ liệu</div>
          : options.map(opt => (
            <DropdownMenuCheckboxItem
              key={opt.id}
              checked={value.includes(opt.id)}
              onCheckedChange={(checked) => {
                onChange(checked ? [...value, opt.id] : value.filter(v => v !== opt.id));
              }}
              onSelect={(e) => e.preventDefault()}
            >
              {opt.label}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─── StatusBadgeCell ─────────────────────────────────────── */
function StatusBadgeCell({ statusId, statuses, onChange, readOnly }: {
  statusId: string | null;
  statuses: TaskStatus[];
  onChange: (id: string) => void;
  readOnly?: boolean;
}) {
  const current = statuses.find(s => s.id === statusId);
  const badge = current ? (
    <Badge
      style={{ backgroundColor: current.color + "20", color: current.color, borderColor: current.color + "40" }}
      className="text-[10px] font-medium border"
    >
      {current.name}
    </Badge>
  ) : (
    <span className="text-[10px] text-muted-foreground">—</span>
  );
  if (readOnly) return badge;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="cursor-pointer hover:opacity-80">{badge}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {statuses.map(s => (
          <DropdownMenuCheckboxItem
            key={s.id}
            checked={s.id === statusId}
            onCheckedChange={(checked) => { if (checked) onChange(s.id); }}
            onSelect={(e) => e.preventDefault()}
          >
            <Badge
              style={{ backgroundColor: s.color + "20", color: s.color, borderColor: s.color + "40" }}
              className="text-[10px] border"
            >
              {s.name}
            </Badge>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─── LevelBadgeCell ─────────────────────────────────────── */
function LevelBadgeCell({ levelId, levels, onChange, readOnly }: {
  levelId: string | null;
  levels: TaskLevel[];
  onChange: (id: string) => void;
  readOnly?: boolean;
}) {
  const current = levels.find(l => l.id === levelId);
  const badge = current ? (
    <Badge
      style={{ backgroundColor: current.color + "20", color: current.color, borderColor: current.color + "40" }}
      className="text-[10px] font-medium border"
    >
      {current.name}
    </Badge>
  ) : (
    <span className="text-[10px] text-muted-foreground">—</span>
  );
  if (readOnly) return badge;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="cursor-pointer hover:opacity-80">{badge}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {levels.map(l => (
          <DropdownMenuCheckboxItem
            key={l.id}
            checked={l.id === levelId}
            onCheckedChange={(checked) => { if (checked) onChange(l.id); }}
            onSelect={(e) => e.preventDefault()}
          >
            <Badge
              style={{ backgroundColor: l.color + "20", color: l.color, borderColor: l.color + "40" }}
              className="text-[10px] border"
            >
              {l.name}
            </Badge>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─── Avatar helpers ─────────────────────────────────────── */
const AVATAR_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-fuchsia-500", "bg-teal-500",
];
function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function AvatarGroup({ ids, staffMap, max = 5 }: {
  ids: string[];
  staffMap: Map<string, string>;
  max?: number;
}) {
  const names = ids.map(id => staffMap.get(id)).filter(Boolean) as string[];
  if (names.length === 0) return <span className="text-[10px] text-muted-foreground italic">—</span>;
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center -space-x-1.5">
        {shown.map(name => (
          <Tooltip key={name}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-flex items-center justify-center w-6 h-6 rounded-full text-[9px] font-bold text-white ring-2 ring-white cursor-default select-none",
                  avatarColor(name)
                )}
              >
                {getInitials(name)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">{name}</TooltipContent>
          </Tooltip>
        ))}
        {extra > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[9px] font-bold text-gray-600 bg-gray-200 ring-2 ring-white cursor-default select-none">
                +{extra}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {names.slice(max).join(", ")}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

/* ─── MultiSelectFilter ───────────────────────────────────── */
function MultiSelectFilter({
  label, options, selected, onChange, "data-testid": testId,
}: {
  label: string;
  options: { id: string; label: string; color?: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  "data-testid"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;
  }, [options, search]);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
  }

  const hasActive = selected.length > 0;

  return (
    <Popover open={open} onOpenChange={v => { setOpen(v); if (!v) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          className={cn(
            "flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-medium transition-colors",
            hasActive
              ? "border-primary bg-primary/8 text-primary"
              : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
          )}
        >
          {label}
          {hasActive && (
            <span className="flex items-center justify-center h-4 w-4 rounded-full bg-primary text-[10px] text-primary-foreground font-bold">
              {selected.length}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start">
        {options.length > 5 && (
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <input
                className="w-full pl-6 pr-2 py-1 text-xs border rounded-md outline-none focus:border-primary"
                placeholder="Tìm..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        )}
        <div className="max-h-52 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">Không tìm thấy</p>
          )}
          {filtered.map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggle(opt.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left"
            >
              <div className={cn(
                "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0",
                selected.includes(opt.id) ? "bg-primary border-primary" : "border-input"
              )}>
                {selected.includes(opt.id) && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
              </div>
              {opt.color && (
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
              )}
              <span className="flex-1 truncate">{opt.label}</span>
            </button>
          ))}
        </div>
        {selected.length > 0 && (
          <div className="border-t p-1.5">
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-xs text-destructive hover:bg-destructive/10 rounded-sm py-1 transition-colors"
            >
              Xoá bộ lọc
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ─── DateRangeFilter ─────────────────────────────────────── */
function DateRangeFilter({
  from, to, onChange,
}: {
  from: Date | undefined;
  to: Date | undefined;
  onChange: (from: Date | undefined, to: Date | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasActive = from || to;
  const label = hasActive
    ? [from ? format(from, "dd/MM/yy") : "...", to ? format(to, "dd/MM/yy") : "..."].join(" → ")
    : "Hạn hoàn thành";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-medium transition-colors",
            hasActive
              ? "border-primary bg-primary/8 text-primary"
              : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
          )}
        >
          <CalendarIcon className="h-3 w-3 opacity-60" />
          {label}
          {hasActive && (
            <span
              onClick={e => { e.stopPropagation(); onChange(undefined, undefined); }}
              className="ml-0.5 opacity-60 hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3 space-y-3" align="start">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase">Từ ngày</p>
            <Calendar
              mode="single"
              selected={from}
              onSelect={d => onChange(d, to)}
              locale={vi}
              className="border rounded-md p-2 scale-90 origin-top-left"
            />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase">Đến ngày</p>
            <Calendar
              mode="single"
              selected={to}
              onSelect={d => onChange(from, d)}
              locale={vi}
              className="border rounded-md p-2 scale-90 origin-top-left"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChange(undefined, undefined)}
          className="w-full text-xs text-destructive hover:bg-destructive/10 rounded-sm py-1 transition-colors"
        >
          Xoá bộ lọc
        </button>
      </PopoverContent>
    </Popover>
  );
}

/* ─── Kanban – draggable card ─────────────────────────────── */
function KanbanCard({ task, status, staffMap, onTaskClick, isDragOverlay = false }: {
  task: Task;
  status?: TaskStatus;
  staffMap: Map<string, string>;
  onTaskClick: (task: Task) => void;
  isDragOverlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = { transform: CSS.Translate.toString(transform) };
  const cond = getCondition(task, status?.name);
  const hasManagers = (task.managerIds || []).length > 0;
  const hasAssignees = (task.assigneeIds || []).length > 0;

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={isDragOverlay ? { opacity: 1 } : style}
      {...(isDragOverlay ? {} : { ...listeners, ...attributes })}
      onClick={() => !isDragging && onTaskClick(task)}
      className={cn(
        "bg-white rounded-lg border shadow-sm p-3 space-y-2 transition-all cursor-grab active:cursor-grabbing",
        isDragging && !isDragOverlay ? "opacity-40 border-dashed" : "hover:shadow-md hover:border-primary/30",
        isDragOverlay && "shadow-xl rotate-1 border-primary/40",
      )}
    >
      <p className="text-xs font-semibold leading-snug">{task.title}</p>

      {task.content && (
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
              {task.content}
            </p>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs whitespace-pre-wrap text-xs">
            {task.content}
          </TooltipContent>
        </Tooltip>
      )}

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <CalendarIcon className="h-3 w-3" /> {fmtDate(task.dueDate)}
        </span>
        <span className={cn("text-[10px]", cond.className)}>{cond.label}</span>
      </div>

      {(hasManagers || hasAssignees) && (
        <div className="pt-2 border-t space-y-1.5">
          {hasManagers && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-16 shrink-0">Quản lý:</span>
              <AvatarGroup ids={task.managerIds || []} staffMap={staffMap} />
            </div>
          )}
          {hasAssignees && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-16 shrink-0">Thực hiện:</span>
              <AvatarGroup ids={task.assigneeIds || []} staffMap={staffMap} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Kanban – droppable column ───────────────────────────── */
function KanbanColumn({ col, tasks, staffMap, onTaskClick }: {
  col: TaskStatus;
  tasks: Task[];
  staffMap: Map<string, string>;
  onTaskClick: (task: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-shrink-0 w-72 rounded-xl border-2 p-3 space-y-2 transition-colors",
        isOver && "ring-2 ring-primary/40",
      )}
      style={{
        borderColor: isOver ? col.color : col.color + "60",
        backgroundColor: isOver ? col.color + "15" : col.color + "08",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: col.color }}>{col.name}</span>
        <span className="text-xs bg-white border rounded-full px-2 py-0.5 font-semibold">{tasks.length}</span>
      </div>
      {tasks.map(task => (
        <KanbanCard key={task.id} task={task} status={col} staffMap={staffMap} onTaskClick={onTaskClick} />
      ))}
    </div>
  );
}

/* ─── Kanban View ────────────────────────────────────────── */
function KanbanView({ tasks, statuses, staffMap, onTaskClick }: {
  tasks: Task[];
  statuses: TaskStatus[];
  staffMap: Map<string, string>;
  onTaskClick: (task: Task) => void;
}) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const updateStatus = useMutation({
    mutationFn: ({ taskId, statusId }: { taskId: string; statusId: string }) =>
      apiRequest("PATCH", `/api/tasks/${taskId}`, { statusId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }),
  });

  function handleDragStart(event: DragStartEvent) {
    const task = tasks.find(t => t.id === event.active.id);
    setActiveTask(task ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;
    const task = tasks.find(t => t.id === active.id);
    if (!task) return;
    const newStatusId = String(over.id);
    if (task.statusId === newStatusId) return;
    updateStatus.mutate({ taskId: task.id, statusId: newStatusId });
  }

  const statusMap = useMemo(() => new Map(statuses.map(s => [s.id, s])), [statuses]);

  return (
    <TooltipProvider delayDuration={200}>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {statuses.map(col => {
            const colTasks = tasks.filter(t => t.statusId === col.id);
            return (
              <KanbanColumn
                key={col.id}
                col={col}
                tasks={colTasks}
                staffMap={staffMap}
                onTaskClick={onTaskClick}
              />
            );
          })}
        </div>
        <DragOverlay>
          {activeTask ? (
            <KanbanCard
              task={activeTask}
              status={statusMap.get(activeTask.statusId ?? "")}
              staffMap={staffMap}
              onTaskClick={onTaskClick}
              isDragOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </TooltipProvider>
  );
}

/* ─── Main component ─────────────────────────────────────── */
export function TaskList() {
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  /* ─── Permissions ─── */
  const { data: myPerms } = useMyPermissions();
  const isSuperAdmin = myPerms?.isSuperAdmin ?? false;
  const listPerm = myPerms?.permissions["/tasks#list"];
  const canView = isSuperAdmin || (listPerm?.canView ?? false);
  const canViewAll = isSuperAdmin || (listPerm?.canViewAll ?? false);
  const canCreate = isSuperAdmin || (listPerm?.canCreate ?? false);
  const canEdit = isSuperAdmin || (listPerm?.canEdit ?? false);
  const canDelete = isSuperAdmin || (listPerm?.canDelete ?? false);
  const readOnly = !canEdit;
  const myStaffId = myPerms?.staffId ?? null;
  const myUserId = myPerms?.userId ?? null;
  const myLocationIds = myPerms?.locationIds ?? [];

  /* ─── Filter states ─── */
  const [fLocations, setFLocations] = useState<string[]>([]);
  const [fManagers, setFManagers] = useState<string[]>([]);
  const [fAssignees, setFAssignees] = useState<string[]>([]);
  const [fLevels, setFLevels] = useState<string[]>([]);
  const [fStatuses, setFStatuses] = useState<string[]>([]);
  const [fConditions, setFConditions] = useState<string[]>([]);
  const [fDueFrom, setFDueFrom] = useState<Date | undefined>();
  const [fDueTo, setFDueTo] = useState<Date | undefined>();

  const activeFilterCount = fLocations.length + fManagers.length + fAssignees.length +
    fLevels.length + fStatuses.length + fConditions.length +
    (fDueFrom ? 1 : 0) + (fDueTo ? 1 : 0);

  function clearAllFilters() {
    setFLocations([]); setFManagers([]); setFAssignees([]);
    setFLevels([]); setFStatuses([]); setFConditions([]);
    setFDueFrom(undefined); setFDueTo(undefined);
  }

  /* ─── Queries ─── */
  const { data: tasksRaw = [], isLoading } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const { data: statuses = [] } = useQuery<TaskStatus[]>({ queryKey: ["/api/task-statuses"] });
  const { data: levels = [] } = useQuery<TaskLevel[]>({ queryKey: ["/api/task-levels"] });
  const { data: departments = [] } = useQuery<any[]>({ queryKey: ["/api/departments"] });
  const { data: staffRaw } = useQuery<any>({
    queryKey: ["/api/staff", "", "minimal"],
    queryFn: () => fetch("/api/staff?minimal=true", { credentials: "include" }).then(r => r.json()),
  });

  const allStaff: { id: string; fullName: string }[] = useMemo(
    () => Array.isArray(staffRaw) ? staffRaw : [],
    [staffRaw]
  );

  const { data: locations = [] } = useQuery<any[]>({ queryKey: ["/api/locations"] });

  const staffMap = useMemo(() => new Map(allStaff.map(s => [s.id, s.fullName])), [allStaff]);
  const deptMap = useMemo(() => new Map((departments as any[]).map(d => [d.id, d.name])), [departments]);
  const locMap = useMemo(() => new Map((locations as any[]).map(l => [l.id, l.name])), [locations]);

  const staffOptions = useMemo(() => allStaff.map(s => ({ id: s.id, label: s.fullName })), [allStaff]);

  const selectedTask = useMemo(
    () => tasksRaw.find(t => t.id === selectedTaskId) ?? null,
    [tasksRaw, selectedTaskId]
  );

  /* ─── Patch mutation ─── */
  const patchMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/tasks/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }),
  });

  /* ─── Delete mutation ─── */
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setDeleteId(null);
    },
  });

  function patchTask(id: string, data: any) {
    patchMutation.mutate({ id, data });
  }

  /* ─── Condition options ─── */
  const conditionOptions = [
    { id: "Quá hạn", label: "Quá hạn" },
    { id: "Đến hạn", label: "Đến hạn" },
    { id: "Sắp đến hạn", label: "Sắp đến hạn" },
    { id: "Chưa đến hạn", label: "Chưa đến hạn" },
    { id: "Hoàn tất", label: "Hoàn tất" },
  ];

  /* ─── Permission-based task scope filter ─── */
  const scopedTasks = useMemo(() => {
    if (isSuperAdmin) return tasksRaw;
    return tasksRaw.filter(t => {
      if (canViewAll) {
        return myLocationIds.length === 0 || (t.locationIds || []).some(id => myLocationIds.includes(id));
      }
      if (canView) {
        const isCreator = myUserId && t.createdBy === myUserId;
        const isManager = myStaffId && (t.managerIds || []).includes(myStaffId);
        const isAssignee = myStaffId && (t.assigneeIds || []).includes(myStaffId);
        return !!(isCreator || isManager || isAssignee);
      }
      return false;
    });
  }, [tasksRaw, isSuperAdmin, canView, canViewAll, myUserId, myStaffId, myLocationIds]);

  /* ─── User-applied filters ─── */
  const filtered = useMemo(() => {
    return scopedTasks.filter(t => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (fLocations.length > 0 && !fLocations.some(id => (t.locationIds || []).includes(id))) return false;
      if (fManagers.length > 0 && !fManagers.some(id => (t.managerIds || []).includes(id))) return false;
      if (fAssignees.length > 0 && !fAssignees.some(id => (t.assigneeIds || []).includes(id))) return false;
      if (fLevels.length > 0 && !fLevels.includes(t.levelId ?? "")) return false;
      if (fStatuses.length > 0 && !fStatuses.includes(t.statusId ?? "")) return false;
      if (fConditions.length > 0) {
        const statusName = statuses.find(s => s.id === t.statusId)?.name;
        const cond = getCondition(t, statusName);
        if (!fConditions.includes(cond.label)) return false;
      }
      if (fDueFrom && t.dueDate && new Date(t.dueDate) < fDueFrom) return false;
      if (fDueTo) {
        const dueTo = new Date(fDueTo); dueTo.setHours(23, 59, 59, 999);
        if (t.dueDate && new Date(t.dueDate) > dueTo) return false;
      }
      return true;
    });
  }, [scopedTasks, search, fLocations, fManagers, fAssignees, fLevels, fStatuses, fConditions, fDueFrom, fDueTo, statuses]);

  /* ─── Select all ─── */
  const allSelected = filtered.length > 0 && filtered.every(t => selectedIds.has(t.id));
  function toggleAll(checked: boolean) {
    if (checked) setSelectedIds(new Set(filtered.map(t => t.id)));
    else setSelectedIds(new Set());
  }
  function toggleOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {/* Row 1: view toggle (left) + add button (right) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center border rounded-md overflow-hidden">
          <button
            onClick={() => setViewMode("table")}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
              viewMode === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            data-testid="button-view-table"
          >
            <LayoutList className="h-3.5 w-3.5" /> Bảng
          </button>
          <button
            onClick={() => setViewMode("kanban")}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
              viewMode === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            data-testid="button-view-kanban"
          >
            <Kanban className="h-3.5 w-3.5" /> Kanban
          </button>
        </div>
        {canCreate && (
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setCreateDialogOpen(true)}
            data-testid="button-add-task"
          >
            <Plus className="h-3.5 w-3.5" /> Thêm công việc
          </Button>
        )}
      </div>

      {/* Row 2: search + filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Tìm công việc..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs w-44"
            data-testid="input-search-task"
          />
        </div>
        <span className="flex items-center gap-1 text-xs text-muted-foreground font-medium shrink-0">
          <Filter className="h-3.5 w-3.5" /> Lọc:
        </span>
        <MultiSelectFilter
          label="Cơ sở" options={(locations as any[]).map(l => ({ id: l.id, label: l.name }))}
          selected={fLocations} onChange={setFLocations} data-testid="filter-locations"
        />
        <MultiSelectFilter
          label="Quản lý"
          options={allStaff.map(s => ({ id: s.id, label: s.fullName }))}
          selected={fManagers} onChange={setFManagers} data-testid="filter-managers"
        />
        <MultiSelectFilter
          label="Người thực hiện"
          options={allStaff.map(s => ({ id: s.id, label: s.fullName }))}
          selected={fAssignees} onChange={setFAssignees} data-testid="filter-assignees"
        />
        <MultiSelectFilter
          label="Mức độ"
          options={(levels as TaskLevel[]).map(l => ({ id: l.id, label: l.name, color: l.color }))}
          selected={fLevels} onChange={setFLevels} data-testid="filter-levels"
        />
        <MultiSelectFilter
          label="Trạng thái"
          options={(statuses as TaskStatus[]).map(s => ({ id: s.id, label: s.name, color: s.color }))}
          selected={fStatuses} onChange={setFStatuses} data-testid="filter-statuses"
        />
        <MultiSelectFilter
          label="Tình trạng" options={conditionOptions}
          selected={fConditions} onChange={setFConditions} data-testid="filter-conditions"
        />
        <DateRangeFilter
          from={fDueFrom} to={fDueTo}
          onChange={(from, to) => { setFDueFrom(from); setFDueTo(to); }}
        />
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="flex items-center gap-1 h-8 px-2 text-xs text-destructive hover:bg-destructive/10 rounded-md transition-colors"
            data-testid="button-clear-filters"
          >
            <X className="h-3 w-3" /> Xoá tất cả ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Đang tải...
        </div>
      ) : viewMode === "kanban" ? (
        <KanbanView tasks={filtered} statuses={statuses} staffMap={staffMap} onTaskClick={(t) => setSelectedTaskId(t.id)} />
      ) : (
        <TooltipProvider delayDuration={200}>
        <div className="rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse" style={{ minWidth: "max-content" }}>
              <thead>
                <tr className="border-b bg-muted/50">
                  {/* ── Sticky: Checkbox ── */}
                  <th className="p-2.5 w-10 sticky left-0 z-20 bg-white whitespace-nowrap border-r border-border/40">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(v) => toggleAll(!!v)}
                      data-testid="checkbox-select-all"
                    />
                  </th>
                  {/* ── Sticky: Cơ sở ── */}
                  <th className="p-2.5 text-left font-semibold text-muted-foreground sticky left-10 z-20 bg-white whitespace-nowrap min-w-[120px] border-r border-border/40">
                    Cơ sở
                  </th>
                  {/* ── Sticky: Tiêu đề ── */}
                  <th className="p-2.5 text-left font-semibold text-muted-foreground sticky left-[160px] z-20 bg-white whitespace-nowrap min-w-[220px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                    Tiêu đề
                  </th>
                  <th className="p-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap min-w-[130px]">Hạn hoàn thành</th>
                  <th className="p-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap min-w-[120px]">Phòng ban</th>
                  <th className="p-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap min-w-[110px]">Mức độ</th>
                  <th className="p-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap min-w-[110px]">Trạng thái</th>
                  <th className="p-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap min-w-[90px]">Tình trạng</th>
                  <th className="p-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap min-w-[160px]">Quản lý</th>
                  <th className="p-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap min-w-[160px]">Thực hiện</th>
                  <th className="p-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap min-w-[150px]">Nội dung</th>
                  {/* ── Sticky: Thao tác ── */}
                  {(canEdit || canDelete) && (
                    <th className="p-2.5 text-center font-semibold text-muted-foreground whitespace-nowrap w-20 sticky right-0 z-20 bg-white shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                      Thao tác
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="p-8 text-center text-muted-foreground">
                      {search ? "Không tìm thấy công việc phù hợp" : "Chưa có công việc nào"}
                    </td>
                  </tr>
                ) : (
                  filtered.map((task, idx) => {
                    const statusObj = statuses.find(s => s.id === task.statusId);
                    const cond = getCondition(task, statusObj?.name);
                    const isSelected = selectedIds.has(task.id);
                    const isOdd = idx % 2 !== 0;
                    const stickyBg = "bg-white";
                    const locNames = (task.locationIds || []).map((id: string) => locMap.get(id)).filter(Boolean);
                    return (
                      <tr
                        key={task.id}
                        className={cn("border-b transition-colors hover:bg-muted/30",
                          isSelected && "bg-primary/5",
                          isOdd && !isSelected && "bg-muted/10")}
                        data-testid={`row-task-${task.id}`}
                      >
                        {/* ── Sticky: Checkbox ── */}
                        <td className={cn("p-2.5 sticky left-0 z-10 border-r border-border/40", stickyBg)}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleOne(task.id)}
                            data-testid={`checkbox-task-${task.id}`}
                          />
                        </td>

                        {/* ── Sticky: Cơ sở ── */}
                        <td className={cn("p-2.5 sticky left-10 z-10 border-r border-border/40", stickyBg)}>
                          {locNames.length > 0
                            ? <span className="text-xs whitespace-nowrap">{(locNames as string[]).join(", ")}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>

                        {/* ── Sticky: Tiêu đề ── */}
                        <td
                          className={cn("p-2.5 sticky left-[160px] z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] cursor-pointer group/title", stickyBg)}
                          onClick={() => setSelectedTaskId(task.id)}
                        >
                          <span className="font-medium text-foreground leading-snug whitespace-nowrap group-hover/title:text-primary transition-colors">{task.title}</span>
                        </td>

                        {/* Hạn hoàn thành */}
                        <td className="p-2.5">
                          <DatePickerCell
                            value={task.dueDate}
                            onChange={(d) => patchTask(task.id, { dueDate: d })}
                            readOnly={readOnly}
                          />
                        </td>

                        {/* Phòng ban */}
                        <td className="p-2.5 whitespace-nowrap">
                          {task.departmentId
                            ? <span className="text-xs">{deptMap.get(task.departmentId) || "—"}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>

                        {/* Mức độ */}
                        <td className="p-2.5">
                          <LevelBadgeCell
                            levelId={task.levelId}
                            levels={levels}
                            onChange={(id) => patchTask(task.id, { levelId: id })}
                            readOnly={readOnly}
                          />
                        </td>

                        {/* Trạng thái */}
                        <td className="p-2.5">
                          <StatusBadgeCell
                            statusId={task.statusId}
                            statuses={statuses}
                            onChange={(id) => patchTask(task.id, { statusId: id })}
                            readOnly={readOnly}
                          />
                        </td>

                        {/* Tình trạng */}
                        <td className={cn("p-2.5 whitespace-nowrap text-xs", cond.className)}>
                          {cond.label}
                        </td>

                        {/* Quản lý */}
                        <td className="p-2.5">
                          {readOnly
                            ? <AvatarGroup ids={task.managerIds || []} staffMap={staffMap} />
                            : <IdMultiSelectCell
                                value={task.managerIds || []}
                                options={staffOptions}
                                onChange={(ids) => patchTask(task.id, { managerIds: ids })}
                                placeholder="Chọn quản lý"
                                icon={UserCheck}
                              />
                          }
                        </td>

                        {/* Thực hiện */}
                        <td className="p-2.5">
                          {readOnly
                            ? <AvatarGroup ids={task.assigneeIds || []} staffMap={staffMap} />
                            : <IdMultiSelectCell
                                value={task.assigneeIds || []}
                                options={staffOptions}
                                onChange={(ids) => patchTask(task.id, { assigneeIds: ids })}
                                placeholder="Chọn người thực hiện"
                                icon={Users}
                              />
                          }
                        </td>

                        {/* Nội dung — tooltip on hover */}
                        <td className="p-2.5">
                          {task.content ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-muted-foreground line-clamp-1 text-[11px] cursor-default max-w-[140px] block truncate">
                                  {task.content}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs whitespace-pre-wrap text-xs">
                                {task.content}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">—</span>
                          )}
                        </td>

                        {/* ── Sticky: Thao tác ── */}
                        {(canEdit || canDelete) && (
                          <td className={cn("p-2.5 sticky right-0 z-10 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.08)]", stickyBg)}>
                            <div className="flex items-center justify-center gap-1">
                              {canEdit && (
                                <button
                                  onClick={() => setEditTask(task)}
                                  className="p-1 rounded hover:bg-amber-50 text-muted-foreground hover:text-amber-600 transition-colors"
                                  data-testid={`button-edit-task-${task.id}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  onClick={() => setDeleteId(task.id)}
                                  className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                                  data-testid={`button-delete-task-${task.id}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        </TooltipProvider>
      )}

      {/* Task detail panel */}
      <TaskDetailPanel
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTaskId(null)}
        statuses={statuses}
        levels={levels}
        staffMap={staffMap}
        locMap={locMap}
        deptMap={deptMap}
        canEdit={canEdit}
      />

      {/* Create dialog */}
      <CreateTaskDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["/api/tasks"] })}
      />

      {/* Edit dialog */}
      {canEdit && (
        <CreateTaskDialog
          open={!!editTask}
          onOpenChange={(o) => { if (!o) setEditTask(null); }}
          initialTask={editTask}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
            setEditTask(null);
          }}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá công việc?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này không thể hoàn tác. Công việc sẽ bị xoá vĩnh viễn.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Xoá"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
