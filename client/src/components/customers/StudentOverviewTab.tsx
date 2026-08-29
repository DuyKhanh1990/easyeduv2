import { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { STATIC_STALE_TIME, getAuthHeaders } from "@/lib/queryClient";
import { useStaff } from "@/hooks/use-staff";
import {
  Phone, Mail, MessageSquare, CheckCircle2, XCircle, CreditCard, AlertCircle,
  User, Clock, CalendarClock, ChevronLeft, ChevronRight, Users, MapPin, School, Link2,
  Tag, UserCog, Calendar, Heart, GraduationCap, BookOpen,
  TrendingUp, Wallet, BarChart3, Building2, FileText, Pencil, Save, Star,
} from "lucide-react";
import { format, isToday, isTomorrow, isYesterday } from "date-fns";
import { vi } from "date-fns/locale";
import type { Task, TaskStatus, TaskLevel } from "@shared/schema";

interface StudentOverviewTabProps {
  studentId: string;
  student: any;
  classesData: any[];
  processedComments: { id: string; authorName: string; content: string; createdAt: string }[];
  starBalance?: number;
  prefetchedTasks?: any[];
  open?: boolean;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtTime(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
}
function fmtDate(dateStr: string) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return `${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")}/${d.getFullYear()}`;
}
function fmtMoney(n: number | string) {
  return Number(n || 0).toLocaleString("vi-VN");
}
function getInitial(name: string) {
  return (name || "?").trim().split(" ").pop()?.charAt(0).toUpperCase() || "?";
}

// ─── unified event type ───────────────────────────────────────────────────────

type ActivityEvent = {
  id: string;
  ts: number;
  timeLabel: string;
  dateKey: string;
  type: "note" | "present" | "absent" | "payment" | "overdue";
  title: string;
  desc: string;
  actor?: string;
  badge?: { label: string; color: string };
};

function buildDateKey(dateStr: string): string {
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate()-1);
  const d = new Date(dateStr); d.setHours(0,0,0,0);
  if (d.getTime() === today.getTime()) return "Hôm nay";
  if (d.getTime() === yesterday.getTime()) return "Hôm qua";
  return fmtDate(dateStr);
}

// ─── event icon ───────────────────────────────────────────────────────────────

function EventIcon({ type }: { type: ActivityEvent["type"] }) {
  const cfg = {
    note:    { bg: "bg-amber-50 border border-amber-200",   icon: <MessageSquare className="w-3.5 h-3.5 text-amber-500" /> },
    present: { bg: "bg-blue-50 border border-blue-200",     icon: <CheckCircle2  className="w-3.5 h-3.5 text-blue-500" /> },
    absent:  { bg: "bg-red-50 border border-red-200",       icon: <XCircle       className="w-3.5 h-3.5 text-red-500" /> },
    payment: { bg: "bg-emerald-50 border border-emerald-200", icon: <CreditCard  className="w-3.5 h-3.5 text-emerald-600" /> },
    overdue: { bg: "bg-rose-50 border border-rose-200",     icon: <AlertCircle   className="w-3.5 h-3.5 text-rose-500" /> },
  }[type];
  return (
    <div className={`w-7 h-7 rounded-full ${cfg.bg} flex items-center justify-center shrink-0`}>
      {cfg.icon}
    </div>
  );
}

// ─── task condition ───────────────────────────────────────────────────────────

function getTaskCondition(task: Task, statusName?: string) {
  if (statusName && /hoàn thành|done|xong/i.test(statusName))
    return { label: "Hoàn tất", badgeBg: "bg-emerald-100", badgeText: "text-emerald-700", cardBg: "bg-white", border: "border-gray-100" };
  if (!task.dueDate)
    return { label: "—",         badgeBg: "bg-gray-100",    badgeText: "text-gray-500",    cardBg: "bg-white", border: "border-gray-100" };
  const today = new Date(); today.setHours(0,0,0,0);
  const due   = new Date(task.dueDate as string); due.setHours(0,0,0,0);
  const diff  = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0)   return { label: "Quá hạn",     badgeBg: "bg-red-100",    badgeText: "text-red-600",    cardBg: "bg-white", border: "border-gray-100" };
  if (diff === 0) return { label: null,           badgeBg: "bg-amber-100",  badgeText: "text-amber-700",  cardBg: "bg-white", border: "border-gray-100" };
  if (diff === 1) return { label: null,           badgeBg: "bg-teal-100",   badgeText: "text-teal-700",   cardBg: "bg-white", border: "border-gray-100" };
  if (diff <= 7)  return { label: null,           badgeBg: "bg-blue-100",   badgeText: "text-blue-700",   cardBg: "bg-white", border: "border-gray-100" };
  return                 { label: null,           badgeBg: "bg-gray-100",   badgeText: "text-gray-600",   cardBg: "bg-white", border: "border-gray-100" };
}

function fmtTaskBadge(dueDate: string | null | undefined, conditionLabel: string | null): string {
  if (conditionLabel) return conditionLabel; // "Quá hạn", "Hoàn tất", "—"
  if (!dueDate) return "—";
  const d = new Date(dueDate);
  const time = format(d, "HH:mm");
  if (isToday(d))    return `Hôm nay ${time}`;
  if (isTomorrow(d)) return `Ngày mai ${time}`;
  if (isYesterday(d)) return `Hôm qua ${time}`;
  return `${format(d, "dd/MM", { locale: vi })} ${time}`;
}

function fmtTaskDate(dueDate: string | null | undefined): string {
  if (!dueDate) return "—";
  const d = new Date(dueDate);
  return format(d, "dd/MM/yyyy HH:mm", { locale: vi });
}

// ─── info row ─────────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value, link }: {
  icon: React.ReactNode; label: string; value?: string | null; link?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2 group">
      <span className="shrink-0 w-7 h-7 rounded-lg bg-gray-50 group-hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-colors">
        {icon}
      </span>
      <span className="w-32 shrink-0 text-xs text-gray-500 font-medium">{label}</span>
      <span className={`text-xs flex-1 min-w-0 break-words ${link ? "text-blue-600 hover:underline cursor-pointer" : "text-gray-800 font-medium"} ${!value ? "text-gray-300 italic font-normal" : ""}`}>
        {value || "—"}
      </span>
    </div>
  );
}

// ─── card header ──────────────────────────────────────────────────────────────

function CardHeader({ icon, iconBg, title, badge }: {
  icon: React.ReactNode; iconBg: string; title: string; badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100">
      <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
        {icon}
      </span>
      <span className="text-sm font-semibold text-gray-800 flex-1">{title}</span>
      {badge}
    </div>
  );
}

// ─── stat card ────────────────────────────────────────────────────────────────

function StatCard({ icon, iconBg, label, value, sub, valueColor }: {
  icon: React.ReactNode; iconBg: string; label: string; value: string; sub: string; valueColor: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-3 gap-1 min-w-[90px]">
      <span className={`w-8 h-8 rounded-xl flex items-center justify-center mb-0.5 ${iconBg}`}>
        {icon}
      </span>
      <p className="text-[11px] text-gray-400 font-medium">{label}</p>
      <p className={`font-bold text-base leading-tight ${valueColor}`}>{value}</p>
      <p className="text-[10px] text-gray-400">{sub}</p>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function StudentOverviewTab({ studentId, student, classesData, processedComments, starBalance: starBalanceProp, prefetchedTasks, open }: StudentOverviewTabProps) {

  // ── classes summary derived from classesData prop (no extra API call) ───────
  const CLASS_LIMIT = 5;
  const isLoadingClasses = false;
  const classesSummaryData = {
    items: classesData.slice(0, CLASS_LIMIT).map((cd: any) => ({
      id: cd.studentClass?.id || cd.class?.id,
      class: cd.class,
      status: cd.studentClass?.status || "active",
      attendedSessions: (cd.sessions || []).filter((s: any) => s.studentSession?.attendanceStatus === "present").length,
      totalSessions: (cd.sessions || []).length,
    })),
    total: classesData.length,
    totalPages: Math.ceil(classesData.length / CLASS_LIMIT),
  };

  // ── paginated paid invoices (lightweight — only paid items) ────────────────
  const [invPage] = useState(1);
  const INV_LIMIT = 5;
  const { data: invoicePageData } = useQuery<{
    invoices: any[]; total: number; totalPages: number; totalDebt: number;
  }>({
    queryKey: [`/api/students/${studentId}/invoices`, "overview", invPage],
    queryFn: async () => {
      const res = await fetch(`/api/students/${studentId}/invoices?page=${invPage}&limit=${INV_LIMIT}`, { credentials: "include" });
      if (!res.ok) return { invoices: [], total: 0, totalPages: 1, totalDebt: 0 };
      return res.json();
    },
    enabled: !!studentId && open !== false,
    staleTime: 30_000,
  });

  const paidHistory  = invoicePageData?.invoices ?? [];
  const invTotal     = invoicePageData?.total ?? 0;
  const invTotalPages = invoicePageData?.totalPages ?? 1;
  const totalDebt    = invoicePageData?.totalDebt ?? 0;

  // ── tasks: use prefetched data from parent list, fallback to own fetch ──────
  const hasPrefetchedTasks = Array.isArray(prefetchedTasks);
  const { data: tasksBySubject = {} } = useQuery<Record<string, Task[]>>({
    queryKey: ["/api/tasks/by-subjects", studentId],
    queryFn: () => fetch(`/api/tasks/by-subjects?ids=${studentId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!studentId && !hasPrefetchedTasks && open !== false,
    staleTime: 30_000,
  });
  const tasksRaw: Task[] = hasPrefetchedTasks ? (prefetchedTasks as Task[]) : (tasksBySubject[studentId] ?? []);

  const { data: taskStatuses = [] } = useQuery<TaskStatus[]>({ queryKey: ["/api/task-statuses"], staleTime: STATIC_STALE_TIME });
  const { data: taskLevels = [] }   = useQuery<TaskLevel[]>({ queryKey: ["/api/task-levels"],   staleTime: STATIC_STALE_TIME });

  // ── staff: reuse same cache key as useStaff(undefined, true) in parent ──────
  const { data: staffRaw } = useStaff(undefined, true);

  const allStaff: { id: string; fullName: string }[] = Array.isArray(staffRaw) ? staffRaw : [];
  const staffMap  = new Map(allStaff.map(s => [s.id, s.fullName]));
  const statusMap = new Map((taskStatuses ?? []).map(s => [s.id, s]));
  const levelMap  = new Map((taskLevels ?? []).map(l => [l.id, l]));

  // ── Tổng sao khả dụng ───────────────────────────────────────────────────
  const totalStars = starBalanceProp ?? 0;
  const reviewCount = 0;

  // ── Mô tả học viên auto-save ─────────────────────────────────────────────
  const qc = useQueryClient();
  const [descValue, setDescValue] = useState<string>(student.note || "");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [activityPage, setActivityPage] = useState(1);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDescChange = useCallback((val: string) => {
    setDescValue(val);
    setSaveStatus("idle");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await fetch(`/api/students/${studentId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          credentials: "include",
          body: JSON.stringify({ note: val }),
        });
        setSaveStatus("saved");
        qc.invalidateQueries({ queryKey: [`/api/students/${studentId}`] });
      } catch {
        setSaveStatus("idle");
      }
    }, 1500);
  }, [studentId, qc]);

  // ── tasks ────────────────────────────────────────────────────────────────
  const studentTasks = tasksRaw
    .filter(t => Array.isArray(t.subjectIds) && t.subjectIds.includes(studentId))
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate as string).getTime() - new Date(b.dueDate as string).getTime();
    });
  const SHOW_MAX = 2;
  const visibleTasks = studentTasks.slice(0, SHOW_MAX);
  const extraCount = Math.max(0, studentTasks.length - SHOW_MAX);

  // ── unified timeline ──────────────────────────────────────────────────────
  const events: ActivityEvent[] = [];
  for (const c of processedComments) {
    events.push({ id: `note-${c.id}`, ts: new Date(c.createdAt).getTime(), timeLabel: fmtTime(c.createdAt),
      dateKey: buildDateKey(c.createdAt), type: "note", title: "Ghi chú", desc: c.content, actor: c.authorName });
  }
  const now = Date.now();
  for (const cls of classesData) {
    const clsName = cls.class?.name || cls.class?.classCode || "Lớp học";
    for (const s of cls.sessions || []) {
      const date = s.classSession?.sessionDate;
      if (!date) continue;
      const st = s.studentSession?.attendanceStatus;
      if (!st || st === "pending") continue;
      const isPresent = st === "present";
      events.push({ id: `sess-${s.studentSession?.id || Math.random()}`, ts: new Date(date).getTime(),
        timeLabel: s.shiftTemplate ? s.shiftTemplate.startTime?.slice(0,5) : fmtTime(date),
        dateKey: buildDateKey(date), type: isPresent ? "present" : "absent",
        title: isPresent ? "Điểm danh" : "Vắng mặt",
        desc: `Buổi học ${clsName}${s.shiftTemplate ? ` — ca ${s.shiftTemplate.name} (${s.shiftTemplate.startTime?.slice(0,5)}–${s.shiftTemplate.endTime?.slice(0,5)})` : ""}` });
    }
  }
  // Activity events from paidHistory (already paginated — only adds to timeline if loaded)
  for (const inv of paidHistory) {
    if (inv.paidAt) {
      events.push({ id: `pay-${inv.id}`, ts: new Date(inv.paidAt).getTime(), timeLabel: fmtTime(inv.paidAt),
        dateKey: buildDateKey(inv.paidAt), type: "payment", title: "Thanh toán",
        desc: `${inv.title || "Học phí"} — ${fmtMoney(inv.amount)} đ` });
    }
  }
  events.sort((a, b) => b.ts - a.ts);
  const ACTIVITY_PER_PAGE = 10;
  const activityTotalPages = Math.max(1, Math.ceil(events.length / ACTIVITY_PER_PAGE));
  const pagedEvents = events.slice((activityPage - 1) * ACTIVITY_PER_PAGE, activityPage * ACTIVITY_PER_PAGE);
  const grouped: { dateKey: string; items: ActivityEvent[] }[] = [];
  const seen = new Map<string, ActivityEvent[]>();
  for (const ev of pagedEvents) {
    if (!seen.has(ev.dateKey)) { const arr: ActivityEvent[] = []; seen.set(ev.dateKey, arr); grouped.push({ dateKey: ev.dateKey, items: arr }); }
    seen.get(ev.dateKey)!.push(ev);
  }

  // ── stats ────────────────────────────────────────────────────────────────
  const totalPaid     = classesData.reduce((s, c) => s + Number(c.invoicePaidTotal || 0), 0);
  const totalAttended = classesData.reduce((s, c) =>
    s + (c.sessions || []).filter((x: any) => x.studentSession?.attendanceStatus === "present").length, 0);
  const totalClasses  = classesSummaryData?.total ?? classesData.length;
  const recentNotes = [...processedComments].reverse().slice(0, 3);

  const statusLabel = student.accountStatus || "—";
  const statusConfig: Record<string, { cls: string; dot: string }> = {
    "Đang học":        { cls: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
    "active":          { cls: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
    "Không hoạt động": { cls: "bg-gray-100 text-gray-500",       dot: "bg-gray-400" },
  };
  const { cls: statusCls, dot: statusDot } = statusConfig[statusLabel] || { cls: "bg-blue-100 text-blue-700", dot: "bg-blue-500" };

  return (
    <div className="h-full overflow-y-auto bg-slate-50">

      {/* ── PROFILE + LỊCH HẸN + MÔ TẢ (2 cột) ────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 shadow-sm">
        {/* Accent bar — full width */}
        <div className="h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500" />

        <div className="flex items-stretch">

          {/* ── Cột trái: Info + 4 thẻ → Lịch hẹn ────────────────────────── */}
          <div className="flex-1 flex flex-col min-w-0">

            {/* Header row */}
            <div className="px-6 py-5 flex items-stretch gap-0">

              {/* Avatar + Name + Info — w-[38%] của cột trái ≈ w-[25%] tổng */}
              <div className="flex items-start gap-4 w-[38%] shrink-0 pr-6 border-r border-gray-100">
                <div className="shrink-0 relative mt-0.5">
                  {student.avatarUrl ? (
                    <img src={student.avatarUrl} alt={student.fullName}
                      className="w-16 h-16 rounded-2xl object-cover shadow-md ring-2 ring-white" />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-2xl font-bold shadow-md ring-2 ring-white">
                      {getInitial(student.fullName)}
                    </div>
                  )}
                  <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white shadow ${statusDot}`} />
                </div>
                <div className="min-w-[170px]">
                  <div className="mb-1">
                    <h2 className="text-xl font-bold text-gray-900 leading-tight">{student.fullName}</h2>
                  </div>
                  <div className="flex items-center gap-2 mb-1.5">
                    {student.code && (
                      <p className="text-xs font-mono text-indigo-500 font-semibold">{student.code}</p>
                    )}
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap ${statusCls}`}>
                      {statusLabel}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {[
                      { icon: <Building2 className="w-3 h-3" />, val: student.location?.name },
                      { icon: <Calendar className="w-3 h-3" />,  val: student.dateOfBirth },
                      { icon: <Phone className="w-3 h-3" />,     val: student.phone },
                      { icon: <Mail className="w-3 h-3" />,      val: student.email },
                    ].map((row, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className="text-gray-400 shrink-0">{row.icon}</span>
                        <span className="text-xs text-gray-600">{row.val || <span className="text-gray-300">—</span>}</span>
                      </div>
                    ))}

                    {/* Sao khả dụng */}
                    {totalStars > 0 && (
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <span className="text-yellow-400 shrink-0"><Star className="w-3 h-3 fill-yellow-400" /></span>
                        <span className="text-xs text-gray-600">Sao khả dụng: <span className="font-semibold text-yellow-600">{totalStars} ⭐</span></span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 4 Stats cards */}
              <div className="flex-1 px-6 border-l border-gray-100 flex items-center">
                <div className="flex items-stretch gap-2 w-full">
                  <div className="flex-1 bg-blue-50 rounded-2xl border border-blue-100">
                    <StatCard
                      icon={<GraduationCap className="w-4 h-4 text-blue-600" />}
                      iconBg="bg-blue-100"
                      label="Lớp học"
                      value={String(totalClasses)}
                      sub="Đang tham gia"
                      valueColor="text-blue-700"
                    />
                  </div>
                  <div className="flex-1 bg-indigo-50 rounded-2xl border border-indigo-100">
                    <StatCard
                      icon={<TrendingUp className="w-4 h-4 text-indigo-600" />}
                      iconBg="bg-indigo-100"
                      label="Tổng học phí"
                      value={fmtMoney(totalPaid) + " đ"}
                      sub="Đã thanh toán"
                      valueColor="text-indigo-700"
                    />
                  </div>
                  <div className={`flex-1 rounded-2xl border ${totalDebt > 0 ? "bg-rose-50 border-rose-100" : "bg-gray-50 border-gray-100"}`}>
                    <StatCard
                      icon={<Wallet className="w-4 h-4 text-rose-500" />}
                      iconBg={totalDebt > 0 ? "bg-rose-100" : "bg-gray-100"}
                      label="Công nợ"
                      value={fmtMoney(totalDebt) + " đ"}
                      sub="Còn phải thu"
                      valueColor={totalDebt > 0 ? "text-rose-600" : "text-gray-400"}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Lịch hẹn — cùng chiều rộng cột trái */}
            <div className="border-t border-gray-100 px-6 py-3.5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-lg bg-teal-50 flex items-center justify-center">
                    <CalendarClock className="w-3.5 h-3.5 text-teal-600" />
                  </span>
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Lịch hẹn</span>
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-teal-100 text-teal-700 text-[11px] font-bold">
                    {studentTasks.length}
                  </span>
                </div>
                <div className="flex items-stretch gap-3 overflow-x-auto pb-1">
                  {studentTasks.length === 0 && (
                    <div className="shrink-0 w-52 rounded-xl border border-gray-100 bg-gray-50 p-3 flex flex-col gap-1 shadow-sm">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Hôm nay</span>
                      <p className="text-xs text-gray-400 italic">Không có lịch hẹn</p>
                    </div>
                  )}
                  {visibleTasks.map(task => {
                    const status    = statusMap.get(task.statusId ?? "");
                    const condition = getTaskCondition(task, status?.name);
                    const assigneeNames = (task.assigneeIds ?? []).map(id => staffMap.get(id)).filter(Boolean) as string[];
                    const managerNames  = (task.managerIds ?? []).map(id => staffMap.get(id)).filter(Boolean) as string[];
                    const responsible   = [...new Set([...assigneeNames, ...managerNames])];
                    const badgeLabel    = fmtTaskBadge(task.dueDate as string | undefined, condition.label);
                    const tooltipLines = [
                      task.title,
                      task.dueDate ? `Hạn cuối: ${fmtTaskDate(task.dueDate as string)}` : null,
                      responsible.length > 0 ? `Nhân sự: ${responsible.join(", ")}` : null,
                    ].filter(Boolean).join("\n");
                    return (
                      <div key={task.id}
                        title={tooltipLines}
                        className={`shrink-0 w-52 rounded-xl border ${condition.border} ${condition.cardBg} p-3 flex flex-col gap-2 shadow-sm hover:shadow-md transition-shadow cursor-pointer`}>
                        <span className={`self-start text-[10px] font-semibold px-2 py-0.5 rounded-full ${condition.badgeBg} ${condition.badgeText}`}>
                          {badgeLabel}
                        </span>
                        <p className="text-xs font-semibold text-gray-900 leading-snug line-clamp-2 flex-1">{task.title}</p>
                        {task.dueDate && (
                          <span className="text-[10px] text-gray-700">
                            Hạn cuối: {fmtTaskDate(task.dueDate as string)}
                          </span>
                        )}
                        {responsible.length > 0 && (
                          <div className="flex items-center gap-1 pt-1.5 border-t border-gray-100">
                            {responsible.slice(0, 3).map(name => (
                              <div key={name} className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[9px] font-bold text-gray-700 shrink-0" title={name}>
                                {getInitial(name)}
                              </div>
                            ))}
                            {responsible.length > 3 && (
                              <span className="text-[10px] text-gray-700 ml-0.5">+{responsible.length - 3}</span>
                            )}
                            <span className="text-[10px] text-gray-700 truncate ml-1">{responsible[0]}{responsible.length > 1 ? ` +${responsible.length - 1}` : ""}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {extraCount > 0 && (
                    <div className="shrink-0 w-36 rounded-xl border border-gray-100 bg-white flex flex-col items-center justify-center gap-2 p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                      <span className="text-sm font-semibold text-gray-700 text-center">+{extraCount} công việc khác</span>
                      <span className="text-[11px] text-blue-500 font-medium hover:underline">Xem tất cả</span>
                    </div>
                  )}
                </div>
            </div>
          </div>

          {/* ── Cột phải: Mô tả học viên — kéo dài suốt chiều cao ─────────── */}
          <div className="w-[35%] shrink-0 border-l border-gray-100 flex flex-col p-5 relative">
            {saveStatus === "saving" && (
              <span className="absolute top-3 right-4 flex items-center gap-1 text-[11px] text-gray-400 italic">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-pulse" />Đang lưu…
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="absolute top-3 right-4 flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                <Save className="w-3 h-3" />Đã lưu
              </span>
            )}
            <textarea
              value={descValue}
              onChange={e => handleDescChange(e.target.value)}
              placeholder="Nhập thông tin quan trọng về học viên — tính cách, nhu cầu, lưu ý đặc biệt…"
              className="flex-1 w-full text-[13px] text-gray-700 placeholder-gray-300 border border-gray-200 rounded-xl px-3.5 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 bg-violet-50/30 leading-relaxed transition-all"
            />
          </div>
        </div>
      </div>

      {/* ── BODY ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 p-4">

        {/* ─ TOP ROW: 3 thẻ ngang nhau ──────────────────────────────────────── */}
        <div className="flex gap-4 items-stretch">

          {/* Thông tin bổ sung — 33% */}
          <div className="w-[33%] shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
            <CardHeader
              icon={<FileText className="w-4 h-4 text-violet-600" />}
              iconBg="bg-violet-50"
              title="Thông tin bổ sung"
            />
            <div className="px-5 py-1 divide-y divide-gray-50 overflow-hidden">
              <InfoRow icon={<User    className="w-3.5 h-3.5" />} label="Giới tính"        value={student.gender} />
              <InfoRow icon={<MapPin  className="w-3.5 h-3.5" />} label="Địa chỉ"          value={student.address} />
              <InfoRow icon={<School  className="w-3.5 h-3.5" />} label="Trường học"       value={student.academicLevel} />
              <InfoRow icon={<Tag     className="w-3.5 h-3.5" />} label="Nguồn KH"         value={student.source} />
              <InfoRow icon={<Link2   className="w-3.5 h-3.5" />} label="Mạng xã hội"      value={student.socialLink} link={!!student.socialLink} />
              <InfoRow icon={<UserCog className="w-3.5 h-3.5" />} label="Sale"
                value={Array.isArray(student.salesByIds) && student.salesByIds.length > 0
                  ? student.salesByIds.map((id: string) => staffMap.get(id) || id).join(", ") : null} />
              <InfoRow icon={<UserCog className="w-3.5 h-3.5" />} label="Quản lý"
                value={Array.isArray(student.managedByIds) && student.managedByIds.length > 0
                  ? student.managedByIds.map((id: string) => staffMap.get(id) || id).join(", ") : null} />
              {student.parentName  && <InfoRow icon={<Users className="w-3.5 h-3.5" />} label="Phụ huynh"   value={[student.parentName,  student.parentPhone ].filter(Boolean).join(" — ")} />}
              {student.parentName2 && <InfoRow icon={<Users className="w-3.5 h-3.5" />} label="Phụ huynh 2" value={[student.parentName2, student.parentPhone2].filter(Boolean).join(" — ")} />}
              {student.parentName3 && <InfoRow icon={<Users className="w-3.5 h-3.5" />} label="Phụ huynh 3" value={[student.parentName3, student.parentPhone3].filter(Boolean).join(" — ")} />}
              <InfoRow icon={<Heart    className="w-3.5 h-3.5" />} label="Quan hệ"     value={student.relationship} />
              <InfoRow icon={<Calendar className="w-3.5 h-3.5" />} label="Ngày tạo"    value={student.createdAt ? fmtDate(student.createdAt) : null} />
            </div>
          </div>

          {/* Thông tin lớp học — 33% (server-side paginated) */}
          <div className="w-[33%] shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
            <CardHeader
              icon={<GraduationCap className="w-4 h-4 text-indigo-600" />}
              iconBg="bg-indigo-50"
              title="Thông tin lớp học"
              badge={<span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">{classesSummaryData?.total ?? "…"} lớp</span>}
            />
            {isLoadingClasses ? (
              <div className="flex items-center justify-center py-10 flex-1">
                <span className="w-5 h-5 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />
              </div>
            ) : !classesSummaryData || classesSummaryData.total === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-300 flex-1">
                <GraduationCap className="w-8 h-8 mb-2" />
                <p className="text-xs text-gray-400">Chưa tham gia lớp nào</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-gray-50 overflow-hidden flex-1">
                  {classesSummaryData.items.map((cd: any) => {
                    const cls = cd.class || {};
                    const rawStatus = cd.status || "active";
                    const sLabel = ({ active:"Đang học", ongoing:"Đang học", dropped:"Bỏ học", completed:"Hoàn thành", paused:"Tạm dừng" } as any)[rawStatus] || rawStatus;
                    const sColor = ({ active:"bg-emerald-100 text-emerald-700", ongoing:"bg-emerald-100 text-emerald-700",
                      dropped:"bg-red-100 text-red-700", completed:"bg-blue-100 text-blue-700", paused:"bg-yellow-100 text-yellow-700" } as any)[rawStatus] || "bg-emerald-100 text-emerald-700";
                    const dateRange = [cls.startDate ? fmtDate(cls.startDate) : null, cls.endDate ? fmtDate(cls.endDate) : null].filter(Boolean).join(" - ");
                    return (
                      <div key={cd.id} className="px-4 py-2.5 flex items-center gap-2.5 hover:bg-gray-50/60 transition-colors">
                        <div className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                          <BookOpen className="w-3 h-3 text-indigo-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-semibold text-gray-900 truncate block">{cls.name || "—"}</span>
                          {dateRange && <span className="text-[10px] text-gray-400">{dateRange}</span>}
                        </div>
                        <span className="text-[11px] text-gray-500 shrink-0 tabular-nums font-medium">
                          {cd.attendedSessions}<span className="text-gray-300">/{cd.totalSessions}</span>
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${sColor}`}>{sLabel}</span>
                      </div>
                    );
                  })}
                </div>
                {classesSummaryData.total > CLASS_LIMIT && (
                  <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/30 text-center">
                    <span className="text-[10px] text-gray-400">Hiển thị {CLASS_LIMIT}/{classesSummaryData.total} lớp — xem thêm tại tab Lớp học</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Lịch sử thanh toán — flex-1 (server-side paginated) */}
          <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
            <CardHeader
              icon={<BarChart3 className="w-4 h-4 text-emerald-600" />}
              iconBg="bg-emerald-50"
              title="Lịch sử thanh toán"
              badge={invTotal > 0
                ? <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{invTotal}</span>
                : undefined}
            />
            {paidHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-300 flex-1">
                <CreditCard className="w-8 h-8 mb-2" />
                <p className="text-xs text-gray-400">Chưa có dữ liệu thanh toán</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-gray-50 overflow-hidden flex-1">
                  {paidHistory.map((inv: any) => (
                    <div key={inv.id} className="px-4 py-2.5 flex items-center gap-2.5 hover:bg-gray-50/60 transition-colors">
                      <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                        <CreditCard className="w-3 h-3 text-emerald-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">{inv.title || "Học phí"}</p>
                        <p className="text-[10px] text-gray-400">{fmtDate(inv.paidAt || inv.createdAt)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-emerald-700">{fmtMoney(inv.amount)} đ</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium border border-emerald-100">Đã TT</span>
                      </div>
                    </div>
                  ))}
                </div>
                {invTotal > INV_LIMIT && (
                  <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/30 text-center">
                    <span className="text-[10px] text-gray-400">Hiển thị {INV_LIMIT}/{invTotal} giao dịch — xem thêm tại tab Hoá đơn</span>
                  </div>
                )}
              </>
            )}
          </div>

        </div>

        {false && <div className="flex gap-4">

          {/* Hoạt động */}
          <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <CardHeader
              icon={<Clock className="w-4 h-4 text-blue-600" />}
              iconBg="bg-blue-50"
              title="Hoạt động"
              badge={<span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{events.length}</span>}
            />
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-gray-300">
                <Clock className="w-10 h-10 mb-3" />
                <p className="text-sm font-medium text-gray-400">Chưa có hoạt động nào</p>
                <p className="text-xs mt-1 text-gray-300">Ghi chú, điểm danh, thanh toán sẽ xuất hiện tại đây</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-gray-50">
                  {grouped.map(group => (
                    <div key={group.dateKey}>
                      <div className="px-5 pt-3 pb-1.5 flex items-center gap-2">
                        <div className="h-px flex-1 bg-gray-100" />
                        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-2">{group.dateKey}</span>
                        <div className="h-px flex-1 bg-gray-100" />
                      </div>
                      {group.items.map((ev, i) => (
                        <div key={ev.id} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50/70 transition-colors group">
                          <span className="text-[11px] text-gray-400 w-10 shrink-0 pt-2 text-right font-mono tabular-nums">{ev.timeLabel}</span>
                          <div className="flex flex-col items-center shrink-0 mt-0.5">
                            <EventIcon type={ev.type} />
                            {i < group.items.length - 1 && <div className="w-px flex-1 bg-gray-100 mt-1 min-h-[16px]" />}
                          </div>
                          <div className="flex-1 min-w-0 pt-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <span className="text-sm font-semibold text-gray-800">{ev.title}</span>
                                {ev.badge && (
                                  <span className={`ml-2 text-[11px] px-1.5 py-0.5 rounded-full font-medium ${ev.badge.color}`}>{ev.badge.label}</span>
                                )}
                                <p className="text-xs text-gray-500 mt-0.5 break-words leading-relaxed">{ev.desc}</p>
                              </div>
                              {ev.actor && (
                                <div className="flex items-center gap-1.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                                  <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[9px] font-bold text-gray-600">
                                    {getInitial(ev.actor)}
                                  </div>
                                  <span className="text-[11px] text-gray-500 whitespace-nowrap">{ev.actor}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                {activityTotalPages > 1 && (
                  <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <span className="text-[11px] text-gray-400">
                      {(activityPage - 1) * ACTIVITY_PER_PAGE + 1}–{Math.min(activityPage * ACTIVITY_PER_PAGE, events.length)} / {events.length} hoạt động
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setActivityPage(p => Math.max(1, p - 1))}
                        disabled={activityPage === 1}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      {Array.from({ length: activityTotalPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === activityTotalPages || Math.abs(p - activityPage) <= 1)
                        .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                          if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push("…");
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((p, idx) => p === "…"
                          ? <span key={`ellipsis-${idx}`} className="text-[11px] text-gray-400 px-1">…</span>
                          : <button key={p} onClick={() => setActivityPage(p as number)}
                              className={`w-7 h-7 rounded-lg text-[11px] font-semibold transition-colors ${activityPage === p ? "bg-blue-500 text-white shadow-sm" : "text-gray-500 hover:bg-gray-200"}`}>
                              {p}
                            </button>
                        )}
                      <button
                        onClick={() => setActivityPage(p => Math.min(activityTotalPages, p + 1))}
                        disabled={activityPage === activityTotalPages}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Ghi chú gần đây */}
          <div className="w-[38%] shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <CardHeader
              icon={<MessageSquare className="w-4 h-4 text-amber-600" />}
              iconBg="bg-amber-50"
              title="Ghi chú gần đây"
              badge={recentNotes.length > 0
                ? <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{recentNotes.length}</span>
                : undefined}
            />
            {recentNotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-300">
                <MessageSquare className="w-8 h-8 mb-2" />
                <p className="text-xs text-gray-400">Chưa có ghi chú nào</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {recentNotes.map(c => (
                  <div key={c.id} className="px-5 py-3 hover:bg-gray-50/60 transition-colors">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center text-[10px] font-bold text-amber-700 shrink-0">
                        {getInitial(c.authorName)}
                      </div>
                      <span className="text-xs font-semibold text-gray-700 flex-1">{c.authorName}</span>
                      <span className="text-[11px] text-gray-400">{fmtDate(c.createdAt)}</span>
                    </div>
                    <p className="text-xs text-gray-600 line-clamp-2 break-words leading-relaxed pl-7">{c.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>}
      </div>
    </div>
  );
}
