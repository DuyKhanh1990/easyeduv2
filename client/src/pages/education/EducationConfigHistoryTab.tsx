import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Eye, History, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ActivityLog, LogDetailDialog } from "@/components/education/ClassActivityLogDialog";

type Range = "all" | "today" | "7d" | "30d" | "thismonth";
type Filter = "all" | "created" | "updated" | "deleted";

const resources: Record<string, string> = {
  classroom: "Phòng học", subject: "Bộ môn", evaluation_criteria: "Tiêu chí đánh giá",
  evaluation_sub_criteria: "Tiêu chí con", shift: "Ca học", attendance_fee: "Trừ học phí",
  attendance_limit: "Giới hạn điểm danh",
  score_category: "Danh mục điểm", score_sheet: "Bảng điểm", online_learning: "Học online",
  location: "Cơ sở", department: "Phòng ban", role: "Vai trò",
  permission: "Quản lý phân quyền", holiday: "Ngày nghỉ lễ",
};
const educationHistoryResources: Record<string, string> = {
  classroom: "Phòng học", subject: "Bộ môn", evaluation_criteria: "Tiêu chí đánh giá",
  evaluation_sub_criteria: "Tiêu chí con", shift: "Ca học", attendance_fee: "Trừ học phí",
  attendance_limit: "Giới hạn điểm danh", score_category: "Danh mục điểm",
  score_sheet: "Bảng điểm", online_learning: "Học online",
};

const actionConfig = {
  created: { label: "Thêm", Icon: Plus, color: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200" },
  updated: { label: "Sửa", Icon: Pencil, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  deleted: { label: "Xóa", Icon: Trash2, color: "text-slate-600", bg: "bg-slate-100", border: "border-slate-300" },
} as const;

function dateKey(value: string | Date) {
  return new Date(value).toLocaleDateString("sv-SE");
}
function dateLabel(value: string | Date) {
  return new Date(value).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
}
function timeLabel(value: string | Date) {
  return new Date(value).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
}
function contentLabel(log: ActivityLog, resource: string) {
  const raw = log.newContent || log.oldContent;
  if (!raw) return "Cấu hình";
  try {
    const value = JSON.parse(raw);
    if (resource === "permission") {
      const role = value.roleName || "Không rõ role";
      const department = value.departmentName || "Không rõ phòng ban";
      return `${role} · ${department}`;
    }
    if (resource === "attendance_fee" && ["beforeDays", "beforeHours", "beforeMinutes", "afterDays", "afterHours", "afterMinutes"].some(key => key in value)) {
      return "Giới hạn điểm danh";
    }
    const name = value.name || value.title || value.fullName || value.attendanceStatus;
    if (name) return String(name);
    if (resource === "attendance_fee") return "Quy tắc trừ học phí";
    if (resource === "online_learning") return "Quy tắc học online";
    return "Cấu hình";
  } catch {
    return raw.length > 80 ? `${raw.slice(0, 80)}…` : raw;
  }
}
function historyResource(log: ActivityLog) {
  const [, resource] = log.action.split(".");
  if (resource !== "attendance_fee") return resource;
  try {
    const value = JSON.parse(log.newContent || log.oldContent || "{}");
    if (["beforeDays", "beforeHours", "beforeMinutes", "afterDays", "afterHours", "afterMinutes"].some(key => key in value)) {
      return "attendance_limit";
    }
  } catch { /* keep the stored resource */ }
  return resource;
}
function rangeDates(range: Range) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (range === "today") return { from: today, to: today };
  if (range === "7d" || range === "30d") {
    const from = new Date(today); from.setDate(from.getDate() - (range === "7d" ? 6 : 29));
    return { from, to: today };
  }
  if (range === "thismonth") return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
  return { from: null, to: null };
}

export function EducationConfigHistoryTab({ scope = "education-config", resourceOptions }: {
  scope?: "education-config" | "settings";
  resourceOptions?: Record<string, string>;
}) {
  const [range, setRange] = useState<Range>("30d");
  const [filter, setFilter] = useState<Filter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [detail, setDetail] = useState<ActivityLog | null>(null);
  const { data: logs = [], isLoading } = useQuery<ActivityLog[]>({
    queryKey: ["/api/activity-logs", scope],
    queryFn: async () => {
      const response = await fetch(`/api/activity-logs?scope=${scope}&limit=500`, { credentials: "include" });
      if (!response.ok) throw new Error("Không tải được lịch sử cấu hình");
      return response.json();
    },
    refetchOnMount: "always",
    refetchInterval: 10000,
  });

  const filtered = useMemo(() => {
    const { from, to } = rangeDates(range);
    return logs.filter(log => {
      const [, , action] = log.action.split(".");
      const resource = historyResource(log);
      const date = new Date(log.createdAt);
      return (filter === "all" || action === filter)
        && (categoryFilter === "all" || resource === categoryFilter)
        && (!from || date >= from)
        && (!to || date < new Date(to.getTime() + 86400000));
    });
  }, [logs, range, filter, categoryFilter]);
  const groups = useMemo(() => filtered.reduce<Map<string, ActivityLog[]>>((map, log) => {
    const key = dateKey(log.createdAt);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(log);
    return map;
  }, new Map()), [filtered]);

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[420px] flex-col gap-3 rounded-xl border bg-slate-50/40 p-5 pt-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
          {([
            ["all", "Toàn thời gian"], ["today", "Hôm nay"], ["7d", "7 ngày"],
            ["30d", "30 ngày"], ["thismonth", "Tháng này"],
          ] as [Range, string][]).map(([value, label]) => (
            <button key={value} onClick={() => setRange(value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${range === value ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {label}
            </button>
          ))}
        </div>
        <Select value={filter} onValueChange={value => setFilter(value as Filter)}>
          <SelectTrigger className="h-8 w-[150px] border-slate-200 bg-white text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả thao tác</SelectItem>
            <SelectItem value="created">Thêm mới</SelectItem>
            <SelectItem value="updated">Chỉnh sửa</SelectItem>
            <SelectItem value="deleted">Đã xóa</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-8 w-[170px] border-slate-200 bg-white text-xs"><SelectValue placeholder="Danh mục" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả danh mục</SelectItem>
            {Object.entries(resourceOptions ?? educationHistoryResources).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-1 text-xs text-slate-500">
          <CalendarDays className="h-3.5 w-3.5" /> <b className="text-slate-700">{filtered.length}</b> sự kiện
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? <div className="py-16 text-center text-sm text-slate-400">Đang tải lịch sử...</div>
          : groups.size === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
              <History className="h-12 w-12 opacity-20" /><p className="text-sm">Không có sự kiện trong khoảng thời gian này</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Array.from(groups.entries()).map(([key, events]) => (
                <section key={key}>
                  <div className="sticky top-0 z-10 mb-2 flex items-center gap-2 bg-slate-50/90 px-2 py-1 backdrop-blur-sm">
                    <div className="h-px flex-1 bg-slate-200" /><span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{dateLabel(events[0].createdAt)}</span><div className="h-px flex-1 bg-slate-200" />
                  </div>
                  <div className="space-y-1.5">
                    {events.map(log => {
                      const [, resource, verb] = log.action.split(".");
                      const config = actionConfig[verb as keyof typeof actionConfig] ?? actionConfig.updated;
                      const Icon = config.Icon;
                      return <div key={log.id} className="group flex items-start gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 transition-all hover:border-slate-200 hover:shadow-sm">
                        <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${config.bg} ${config.border}`}><Icon className={`h-3 w-3 ${config.color}`} /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${config.bg} ${config.border} ${config.color}`}>{config.label}</span>
                            <span className="text-xs font-bold text-slate-700">{resources[resource] ?? resource}</span>
                            <span className="truncate text-xs text-slate-500">{contentLabel(log, resource)}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-slate-400"><span>{log.userName || "Hệ thống"}</span>{log.locationName && <span>{log.locationName}</span>}</div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1"><span className="text-[10px] text-slate-400">{timeLabel(log.createdAt)}</span><Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => setDetail(log)} title="Xem chi tiết"><Eye className="h-3 w-3" /></Button></div>
                      </div>;
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
      </div>
      {detail && <LogDetailDialog log={detail} open={!!detail} onOpenChange={open => !open && setDetail(null)} />}
    </div>
  );
}