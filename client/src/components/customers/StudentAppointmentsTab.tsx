import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { STATIC_STALE_TIME } from "@/lib/queryClient";
import { format, isToday, isTomorrow, isYesterday, startOfDay } from "date-fns";
import { vi } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus, TaskLevel } from "@shared/schema";

/* ─── Condition helper ───────────────────────────────────────── */
type Condition = {
  key: string;
  label: string;
  color: string;
  dot: string;
  emoji: string;
};

function getCondition(task: Task, statusName?: string): Condition {
  if (statusName && /hoàn thành|done|xong/i.test(statusName)) {
    return { key: "hoan-thanh", label: "Hoàn tất", color: "text-green-600", dot: "bg-green-500", emoji: "🟢" };
  }
  if (!task.dueDate) {
    return { key: "chua-den-han", label: "Chưa đến hạn", color: "text-blue-600", dot: "bg-blue-400", emoji: "🔵" };
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(task.dueDate as string); due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0)  return { key: "qua-han",       label: "Quá hạn",       color: "text-red-600",    dot: "bg-red-500",    emoji: "🔴" };
  if (diffDays === 0) return { key: "den-han",       label: "Đến hạn",       color: "text-orange-500", dot: "bg-orange-400", emoji: "🟠" };
  if (diffDays <= 3)  return { key: "sap-den-han",   label: "Sắp đến hạn",  color: "text-yellow-600", dot: "bg-yellow-400", emoji: "🟡" };
  return               { key: "chua-den-han",         label: "Chưa đến hạn", color: "text-blue-600",   dot: "bg-blue-400",   emoji: "🔵" };
}

/* ─── Sub-tab definitions ────────────────────────────────────── */
const SUB_TABS = [
  { key: "tat-ca",      label: "Tất cả" },
  { key: "den-han",     label: "Đến hạn" },
  { key: "sap-den-han", label: "Sắp đến hạn" },
  { key: "chua-den-han",label: "Chưa đến hạn" },
  { key: "hoan-thanh",  label: "Hoàn thành" },
  { key: "qua-han",     label: "Quá hạn" },
] as const;

type SubTabKey = typeof SUB_TABS[number]["key"];

/* ─── Format helpers ─────────────────────────────────────────── */
function formatDateHeader(dateStr: string): string {
  const d = new Date(dateStr);
  const label = format(d, "dd/MM/yyyy");
  if (isToday(d))     return `Hôm nay - ${label}`;
  if (isYesterday(d)) return `Hôm qua - ${label}`;
  if (isTomorrow(d))  return `Ngày mai - ${label}`;
  return format(d, "EEEE, dd/MM/yyyy", { locale: vi });
}

function formatTime(dateStr: string): string {
  try { return format(new Date(dateStr), "HH:mm"); } catch { return "—"; }
}

function formatDateKey(dateStr: string): string {
  return format(startOfDay(new Date(dateStr)), "yyyy-MM-dd");
}

/* ─── Props ──────────────────────────────────────────────────── */
interface Props {
  studentId: string;
  open: boolean;
}

/* ─── Component ──────────────────────────────────────────────── */
export function StudentAppointmentsTab({ studentId, open }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<SubTabKey>("tat-ca");

  const { data: tasksBySubject = {}, isLoading } = useQuery<Record<string, Task[]>>({
    queryKey: ["/api/tasks/by-subjects", studentId],
    queryFn: () =>
      fetch(`/api/tasks/by-subjects?ids=${studentId}`, { credentials: "include" }).then(r => r.json()),
    enabled: open && !!studentId,
    staleTime: 30_000,
  });

  const tasksRaw: Task[] = tasksBySubject[studentId] ?? [];

  const { data: statuses = [] } = useQuery<TaskStatus[]>({
    queryKey: ["/api/task-statuses"],
    staleTime: STATIC_STALE_TIME,
    enabled: open,
  });

  const { data: levels = [] } = useQuery<TaskLevel[]>({
    queryKey: ["/api/task-levels"],
    staleTime: STATIC_STALE_TIME,
    enabled: open,
  });

  const { data: staffRaw } = useQuery<any>({
    queryKey: ["/api/staff", "", "minimal"],
    queryFn: () => fetch("/api/staff?minimal=true", { credentials: "include" }).then(r => r.json()),
    enabled: open,
  });

  const allStaff: { id: string; fullName: string }[] = useMemo(
    () => (Array.isArray(staffRaw) ? staffRaw : []),
    [staffRaw]
  );

  const staffMap  = useMemo(() => new Map(allStaff.map(s => [s.id, s.fullName])), [allStaff]);
  const statusMap = useMemo(() => new Map(statuses.map(s => [s.id, s])), [statuses]);
  const levelMap  = useMemo(() => new Map(levels.map(l => [l.id, l])), [levels]);

  /* All tasks already filtered for this student from API */
  const studentTasks = useMemo(
    () => tasksRaw.filter(t => Array.isArray(t.subjectIds) && t.subjectIds.includes(studentId)),
    [tasksRaw, studentId]
  );

  /* Attach condition to each task, then apply sub-tab filter */
  const enriched = useMemo(
    () =>
      studentTasks.map(task => {
        const status = statusMap.get(task.statusId ?? "");
        const condition = getCondition(task, status?.name);
        return { task, status, level: levelMap.get(task.levelId ?? ""), condition };
      }),
    [studentTasks, statusMap, levelMap]
  );

  /* Counts per sub-tab for badges */
  const counts = useMemo(() => {
    const c: Record<string, number> = { "tat-ca": enriched.length };
    for (const { condition } of enriched) {
      c[condition.key] = (c[condition.key] ?? 0) + 1;
    }
    return c;
  }, [enriched]);

  const filtered = useMemo(() => {
    const base = activeSubTab === "tat-ca"
      ? enriched
      : enriched.filter(e => e.condition.key === activeSubTab);

    /* Sort: newest dueDate first; tasks without dueDate go to bottom */
    return [...base].sort((a, b) => {
      if (!a.task.dueDate && !b.task.dueDate) return 0;
      if (!a.task.dueDate) return 1;
      if (!b.task.dueDate) return -1;
      return new Date(b.task.dueDate as string).getTime() - new Date(a.task.dueDate as string).getTime();
    });
  }, [enriched, activeSubTab]);

  /* Group by date (descending order already from sort) */
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const item of filtered) {
      const key = item.task.dueDate
        ? formatDateKey(item.task.dueDate as string)
        : "__no_date__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [filtered]);

  const dateKeys = useMemo(() => Array.from(grouped.keys()), [grouped]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ── Sub-tab bar ── */}
      <div className="flex items-center gap-1.5 px-5 py-3 border-b bg-white flex-shrink-0 flex-wrap shadow-sm">
        {SUB_TABS.map(tab => {
          const isActive = activeSubTab === tab.key;
          const count = counts[tab.key] ?? 0;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveSubTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 focus:outline-none whitespace-nowrap",
                isActive
                  ? "bg-teal-600 text-white shadow-md shadow-teal-200"
                  : "bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200"
              )}
            >
              {tab.label}
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none",
                  isActive ? "bg-white/30 text-white" : "bg-teal-600 text-white"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Content area ── */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p className="text-sm">Đang tải...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground py-16">
          <CalendarIcon className="w-10 h-10 opacity-30" />
          <p className="text-sm">Không có công việc nào</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8 bg-white">
          {dateKeys.map(dateKey => {
            const items = grouped.get(dateKey)!;
            const headerLabel =
              dateKey === "__no_date__"
                ? "Chưa có hạn xử lý"
                : formatDateHeader(dateKey + "T00:00:00");
            const isCurrentDay =
              dateKey !== "__no_date__" && isToday(new Date(dateKey + "T00:00:00"));

            return (
              <div key={dateKey}>
                {/* Date header */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={cn(
                      "text-xs font-bold px-3 py-1 rounded-full border",
                      isCurrentDay
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-muted text-muted-foreground border-border"
                    )}
                  >
                    {headerLabel}
                  </div>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {/* Task cards */}
                <div className="space-y-4 pl-2">
                  {items.map(({ task, status, level, condition }) => {
                    const assigneeNames = (task.assigneeIds ?? [])
                      .map(id => staffMap.get(id))
                      .filter(Boolean) as string[];
                    const managerNames = (task.managerIds ?? [])
                      .map(id => staffMap.get(id))
                      .filter(Boolean) as string[];
                    const responsibleNames = [...new Set([...assigneeNames, ...managerNames])];

                    return (
                      <div key={task.id} className="flex gap-4">
                        {/* Time column */}
                        <div className="flex flex-col items-center gap-1 w-14 shrink-0">
                          <span className="text-sm font-bold text-foreground tabular-nums">
                            {task.dueDate ? formatTime(task.dueDate as string) : "—"}
                          </span>
                          <div className={cn("w-2.5 h-2.5 rounded-full shrink-0 mt-0.5", condition.dot)} />
                          <div className="flex-1 w-px bg-border min-h-[20px]" />
                        </div>

                        {/* Card */}
                        <div className="flex-1 mb-2 border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                          {/* Card header */}
                          <div className="flex items-start justify-between gap-2 px-4 py-2.5 bg-gray-50 border-b">
                            <p className="text-sm font-semibold text-foreground flex-1 leading-snug">
                              {task.title}
                            </p>
                            {status && (
                              <Badge
                                style={{
                                  backgroundColor: status.color + "20",
                                  color: status.color,
                                  borderColor: status.color + "40",
                                }}
                                className="text-[10px] font-medium border shrink-0"
                              >
                                {status.name}
                              </Badge>
                            )}
                          </div>

                          {/* Card body */}
                          <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2">
                            <div className="space-y-2">
                              {level && (
                                <div className="flex items-start gap-2">
                                  <span className="text-[11px] text-muted-foreground w-20 shrink-0 pt-0.5">Loại</span>
                                  <Badge
                                    style={{
                                      backgroundColor: level.color + "20",
                                      color: level.color,
                                      borderColor: level.color + "40",
                                    }}
                                    className="text-[10px] border font-medium"
                                  >
                                    {level.name}
                                  </Badge>
                                </div>
                              )}

                              <div className="flex items-start gap-2">
                                <span className="text-[11px] text-muted-foreground w-20 shrink-0 pt-0.5">Phụ trách</span>
                                <span className="text-[11px] text-foreground font-medium">
                                  {responsibleNames.length > 0 ? responsibleNames.join(", ") : "—"}
                                </span>
                              </div>

                              <div className="flex items-start gap-2">
                                <span className="text-[11px] text-muted-foreground w-20 shrink-0 pt-0.5">Trạng thái</span>
                                <span className={cn("text-[11px] font-semibold", condition.color)}>
                                  {condition.emoji} {condition.label}
                                </span>
                              </div>

                              <div className="flex items-start gap-2">
                                <span className="text-[11px] text-muted-foreground w-20 shrink-0 pt-0.5">Hạn xử lý</span>
                                <span className="text-[11px] text-foreground font-medium tabular-nums">
                                  {task.dueDate ? formatTime(task.dueDate as string) : "—"}
                                </span>
                              </div>
                            </div>

                            {task.content && (
                              <div className="flex items-start gap-2">
                                <span className="text-[11px] text-muted-foreground w-14 shrink-0 pt-0.5">Ghi chú</span>
                                <span className="text-[11px] text-foreground leading-relaxed line-clamp-4 whitespace-pre-wrap">
                                  {task.content}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
