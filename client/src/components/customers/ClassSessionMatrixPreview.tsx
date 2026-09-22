import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Check, Circle, Clock3, FileCheck2, Minus, RefreshCw, UserRound, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StudentResponse } from "@shared/schema";

type ClassSessionMatrixPreviewProps = {
  classId: string;
  students: StudentResponse[];
  learningStatuses?: Record<string, string>;
};

type SessionStatus = "present" | "absent" | "excused" | "leave" | "makeup_scheduled" | "makeup_done" | "pending" | "cancelled" | "unassigned";

const STATUS_META: Record<SessionStatus, { label: string; className: string; Icon: typeof Check }> = {
  present: { label: "Có học", className: "border-emerald-200 bg-emerald-50 text-emerald-700", Icon: Check },
  absent: { label: "Nghỉ", className: "border-rose-200 bg-rose-50 text-rose-700", Icon: X },
  excused: { label: "Xin phép", className: "border-amber-200 bg-amber-50 text-amber-700", Icon: FileCheck2 },
  leave: { label: "Xin phép", className: "border-amber-200 bg-amber-50 text-amber-700", Icon: FileCheck2 },
  makeup_scheduled: { label: "Đã xếp bù", className: "border-violet-200 bg-violet-50 text-violet-700", Icon: Clock3 },
  makeup_done: { label: "Đã học bù", className: "border-sky-200 bg-sky-50 text-sky-700", Icon: RefreshCw },
  pending: { label: "Chưa điểm danh", className: "border-slate-200 bg-slate-50 text-slate-500", Icon: Circle },
  cancelled: { label: "Đã huỷ", className: "border-slate-200 bg-slate-100 text-slate-400", Icon: Minus },
  unassigned: { label: "Chưa xếp", className: "border-dashed border-slate-200 bg-white text-slate-300", Icon: Minus },
};
const LEARNING_STATUS_LABELS: Record<string, string> = {
  dang_hoc: "Đang học",
  cho_lich: "Chờ lịch",
  bao_luu: "Bảo lưu",
  da_nghi: "Đã nghỉ",
  chua_co_lich: "Chưa có lịch",
};

function dateLabel(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeStatus(value: unknown): SessionStatus {
  const status = String(value || "pending").toLowerCase();
  if (status === "present" || status === "absent" || status === "excused" || status === "leave" ||
      status === "makeup_scheduled" || status === "makeup_done" || status === "cancelled") return status;
  if (status === "makeup_wait") return "absent";
  return "pending";
}

function statusFor(row: any, session: any): SessionStatus {
  if (session.status === "cancelled" || session.isCancelled === true || session.cancelledAt) return "cancelled";
  if (!row) return "unassigned";
  return normalizeStatus(row.attendanceStatus ?? row.status);
}

function StatusCell({ status }: { status: SessionStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.Icon;
  return (
    <div className={cn("mx-auto flex min-h-7 w-[92px] items-center justify-center gap-1 rounded-md border px-1 text-[10px] font-semibold leading-tight", meta.className)} title={meta.label}>
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{meta.label}</span>
    </div>
  );
}

export function ClassSessionMatrixPreview({ classId, students, learningStatuses = {} }: ClassSessionMatrixPreviewProps) {
  const sessionsQuery = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/sessions`],
    enabled: Boolean(classId),
    staleTime: 60_000,
  });
  const studentSessionsQuery = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/all-student-sessions`],
    enabled: Boolean(classId),
    staleTime: 60_000,
  });

  const sessions = useMemo(
    () => [...(sessionsQuery.data || [])].sort((a, b) => (a.sessionIndex ?? 0) - (b.sessionIndex ?? 0)),
    [sessionsQuery.data],
  );
  const rowsByStudent = useMemo(() => {
    const map = new Map<string, Map<string, any>>();
    for (const row of studentSessionsQuery.data || []) {
      const studentId = String(row.studentId ?? row.student?.id ?? "");
      const sessionId = String(row.classSessionId ?? row.sessionId ?? row.classSession?.id ?? "");
      if (!studentId || !sessionId) continue;
      if (!map.has(studentId)) map.set(studentId, new Map());
      map.get(studentId)!.set(sessionId, row);
    }
    return map;
  }, [studentSessionsQuery.data]);

  if (sessionsQuery.isLoading || studentSessionsQuery.isLoading) {
    return (
      <div className="space-y-2 p-4" aria-label="Đang tải ma trận buổi học">
        <div className="h-8 animate-pulse rounded-md bg-slate-100" />
        {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-11 animate-pulse rounded-md bg-slate-50" />)}
      </div>
    );
  }
  if (sessionsQuery.isError || studentSessionsQuery.isError) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 px-4 text-center">
        <AlertCircle className="h-5 w-5 text-rose-500" />
        <p className="text-xs font-semibold text-slate-700">Không tải được dữ liệu buổi học</p>
        <p className="text-[11px] text-slate-400">Kiểm tra kết nối rồi thử lại.</p>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { void sessionsQuery.refetch(); void studentSessionsQuery.refetch(); }}>
          Thử lại
        </Button>
      </div>
    );
  }
  if (sessions.length === 0) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 px-4 text-center">
        <UserRound className="h-5 w-5 text-slate-300" />
        <p className="text-xs font-semibold text-slate-600">Lớp chưa có buổi học</p>
        <p className="text-[11px] text-slate-400">Ma trận sẽ xuất hiện khi lịch học được tạo.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span className="font-semibold text-slate-700">{students.length} học viên</span>
          <span className="text-slate-300">·</span>
          <span>{sessions.length} buổi</span>
        </div>
        <div className="hidden items-center gap-2 text-[10px] text-slate-400 sm:flex">
          <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-emerald-600" /> Có học</span>
          <span className="inline-flex items-center gap-1"><X className="h-3 w-3 text-rose-600" /> Nghỉ</span>
          <span className="inline-flex items-center gap-1"><Minus className="h-3 w-3 text-slate-300" /> Chưa xếp</span>
        </div>
      </div>
      <div className="min-h-0 overflow-auto">
        <table className="w-max min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-30 bg-slate-50">
            <tr className="border-b border-slate-200">
              <th className="sticky left-0 z-40 w-[92px] min-w-[92px] border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">Mã HV</th>
              <th className="sticky left-[92px] z-40 w-[188px] min-w-[188px] border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">Học viên</th>
              <th className="sticky left-[280px] z-40 w-[118px] min-w-[118px] border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">Trạng thái</th>
              <th className="sticky left-[398px] z-40 w-[88px] min-w-[88px] border-r border-slate-200 bg-slate-50 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500">Đã học/Tổng</th>
              <th className="sticky left-[486px] z-40 w-[72px] min-w-[72px] border-r-2 border-slate-300 bg-slate-50 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500">Còn lại</th>
              {sessions.map((session) => (
                <th key={session.id} className="w-[126px] min-w-[126px] border-r border-slate-200 px-2 py-2 text-center">
                  <div className="font-bold text-slate-700">Buổi {session.sessionIndex ?? "—"}</div>
                  <div className="mt-0.5 font-mono text-[10px] font-medium text-slate-500">{dateLabel(session.sessionDate)}</div>
                  {(session.shiftTemplate?.startTime || session.startTime) && (
                    <div className="mt-0.5 text-[10px] font-normal text-slate-400">
                      {session.shiftTemplate?.startTime || session.startTime}
                      {(session.shiftTemplate?.endTime || session.endTime) && `–${session.shiftTemplate?.endTime || session.endTime}`}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((student) => {
              const studentRows = rowsByStudent.get(String(student.id)) || new Map();
              const assigned = sessions.map((session) => ({ session, row: studentRows.get(String(session.id)) }));
              const statuses = assigned.map(({ session, row }) => statusFor(row, session));
              const classProgress = (student.classDetails as Array<{
                classId?: string;
                totalSessions: number;
                attendedSessions: number;
                remainingSessions: number;
              }> | undefined)?.find((detail) => detail.classId === classId);
              const completedFromMatrix = statuses.filter((status) => status === "present" || status === "makeup_done").length;
              const totalFromMatrix = statuses.filter((status) => status !== "unassigned" && status !== "cancelled").length;
              const completed = classProgress?.attendedSessions ?? completedFromMatrix;
              const total = classProgress?.totalSessions ?? totalFromMatrix;
              const remaining = classProgress?.remainingSessions ?? Math.max(0, totalFromMatrix - completedFromMatrix);
              return (
                <tr key={student.id} className="group border-b border-slate-100 hover:bg-sky-50/40">
                  <td className="sticky left-0 z-20 border-r border-slate-200 bg-white px-3 py-2 font-mono text-[11px] font-semibold text-sky-700 group-hover:bg-sky-50">{student.code || "—"}</td>
                  <td className="sticky left-[92px] z-20 border-r border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 group-hover:bg-sky-50">{student.fullName}</td>
                  <td className="sticky left-[280px] z-20 border-r border-slate-200 bg-white px-3 py-2 group-hover:bg-sky-50"><Badge variant="outline" className="h-5 max-w-[106px] truncate border-slate-200 px-1.5 text-[10px] font-medium text-slate-600">{LEARNING_STATUS_LABELS[learningStatuses[student.id]] || learningStatuses[student.id] || "—"}</Badge></td>
                  <td className="sticky left-[398px] z-20 border-r border-slate-200 bg-white px-2 py-2 text-center font-mono text-[11px] font-semibold text-slate-700 group-hover:bg-sky-50">{completed}/{total}</td>
                  <td className="sticky left-[486px] z-20 border-r-2 border-slate-300 bg-white px-2 py-2 text-center font-mono text-[11px] text-slate-500 group-hover:bg-sky-50">{remaining}</td>
                  {assigned.map(({ session, row }) => <td key={session.id} className="border-r border-slate-100 px-1.5 py-1.5 text-center"><StatusCell status={statusFor(row, session)} /></td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}