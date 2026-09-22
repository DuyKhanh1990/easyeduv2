import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  Circle,
  Clock3,
  FileCheck2,
  Loader2,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type MatrixProps = {
  classId: string;
  classSessions: any[] | undefined;
  activeStudents: any[] | undefined;
  currentSessionStudents: any[] | undefined;
  updateAttendanceMutation: { mutate: Function; isPending: boolean };
  canEdit: boolean;
};

type AttendanceStatus = "present" | "absent" | "makeup_wait" | "makeup_scheduled" | "makeup_done" | "paused" | "pending";

const STATUS_META: Record<AttendanceStatus, { label: string; className: string; Icon: typeof Check }> = {
  present: { label: "Có học", className: "border-emerald-200 bg-emerald-50 text-emerald-700", Icon: Check },
  absent: { label: "Nghỉ học", className: "border-rose-200 bg-rose-50 text-rose-700", Icon: X },
  makeup_wait: { label: "Nghỉ chờ bù", className: "border-amber-200 bg-amber-50 text-amber-700", Icon: Clock3 },
  makeup_scheduled: { label: "Đã xếp bù", className: "border-violet-200 bg-violet-50 text-violet-700", Icon: Clock3 },
  makeup_done: { label: "Đã học bù", className: "border-sky-200 bg-sky-50 text-sky-700", Icon: RefreshCw },
  paused: { label: "Bảo lưu", className: "border-yellow-200 bg-yellow-50 text-yellow-700", Icon: FileCheck2 },
  pending: { label: "Chưa điểm danh", className: "border-slate-200 bg-slate-50 text-slate-500", Icon: Circle },
};

const MANUAL_STATUS_OPTIONS: AttendanceStatus[] = [
  "present",
  "absent",
  "makeup_wait",
  "makeup_done",
  "paused",
];

function formatDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function avatarGradient(name: string) {
  const gradients = [
    "from-violet-500 to-purple-600",
    "from-sky-500 to-blue-600",
    "from-emerald-500 to-teal-600",
    "from-amber-500 to-orange-500",
    "from-rose-500 to-pink-600",
  ];
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) & 0xffffff;
  return gradients[Math.abs(hash) % gradients.length];
}

function StatusCell({
  record,
  session,
  canEdit,
  isPending,
  onStatusChange,
  onEditNote,
}: {
  record: any;
  session: any;
  canEdit: boolean;
  isPending: boolean;
  onStatusChange: (record: any, status: string) => void;
  onEditNote: (record: any) => void;
}) {
  if (session.status === "cancelled" || !record) {
    return (
      <div className={cn(
        "mx-auto flex min-h-8 w-[132px] items-center justify-center gap-1 rounded-md border px-1.5 text-[10px]",
        session.status === "cancelled"
          ? "border-slate-200 bg-slate-100 text-slate-400"
          : "border-dashed border-slate-200 bg-white text-slate-300",
      )}>
        {session.status === "cancelled" ? <Minus className="h-3 w-3" /> : <span>Chưa xếp</span>}
      </div>
    );
  }

  const status = (record.attendanceStatus || "pending") as AttendanceStatus;
  const meta = STATUS_META[status] || STATUS_META.pending;
  const Icon = meta.Icon;

  return (
    <div className="flex min-w-[146px] items-center justify-center gap-1">
      <Select
        value={status}
        disabled={!canEdit || isPending || status === "makeup_scheduled"}
        onValueChange={(value) => onStatusChange(record, value)}
      >
        <SelectTrigger
          className={cn(
            "h-8 w-[126px] justify-center gap-1 rounded-md border px-1.5 text-[10px] font-semibold shadow-none",
            meta.className,
          )}
          aria-label={`Điểm danh ${record.studentName || "học viên"}`}
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Icon className="h-3 w-3 shrink-0" />
          )}
          <span className="max-w-[94px] truncate">{meta.label}</span>
          {status === "pending" && canEdit && <Plus className="h-3 w-3 shrink-0" />}
        </SelectTrigger>
        <SelectContent align="center">
          {MANUAL_STATUS_OPTIONS.map((option) => {
            const optionMeta = STATUS_META[option];
            const OptionIcon = optionMeta.Icon;
            return (
              <SelectItem key={option} value={option} className="text-xs">
                <span className="flex items-center gap-1.5">
                  <OptionIcon className="h-3 w-3" />
                  {optionMeta.label}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {canEdit && (
        <button
          type="button"
          className="rounded p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-sky-600"
          title={record.attendanceNote ? "Sửa ghi chú" : "Thêm ghi chú"}
          onClick={() => onEditNote(record)}
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export function ClassSessionMatrixDraft({
  classId,
  classSessions,
  activeStudents,
  currentSessionStudents,
  updateAttendanceMutation,
  canEdit,
}: MatrixProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [noteDialog, setNoteDialog] = useState<{ record: any; value: string } | null>(null);

  const allSessionsQuery = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/all-student-sessions`],
    enabled: Boolean(classId),
    staleTime: 60_000,
  });

  const sessions = useMemo(
    () => [...(classSessions || [])].sort((a, b) => (a.sessionIndex ?? 0) - (b.sessionIndex ?? 0)),
    [classSessions],
  );

  const rowsByStudent = useMemo(() => {
    const map = new Map<string, Map<string, any>>();
    for (const row of allSessionsQuery.data || []) {
      const studentId = String(row.studentId ?? "");
      const sessionId = String(row.classSessionId ?? "");
      if (!studentId || !sessionId) continue;
      if (!map.has(studentId)) map.set(studentId, new Map());
      map.get(studentId)!.set(sessionId, row);
    }
    return map;
  }, [allSessionsQuery.data]);

  const students = useMemo(() => {
    const map = new Map<string, any>();
    for (const item of activeStudents || []) {
      const student = item.student ?? item;
      const id = String(item.studentId ?? student.id ?? "");
      if (id) map.set(id, { ...item, student, id });
    }
    for (const item of currentSessionStudents || []) {
      const student = item.student ?? item;
      const id = String(item.studentId ?? student.id ?? "");
      if (id && !map.has(id)) map.set(id, { ...item, student, id });
    }
    for (const row of allSessionsQuery.data || []) {
      const id = String(row.studentId ?? "");
      if (id && !map.has(id)) {
        map.set(id, {
          id,
          student: { id, fullName: row.studentName, code: row.studentCode },
          studentId: id,
        });
      }
    }
    return [...map.values()].sort((a, b) =>
      String(a.student?.fullName || "").localeCompare(String(b.student?.fullName || ""), "vi"),
    );
  }, [activeStudents, currentSessionStudents, allSessionsQuery.data]);

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return students;
    return students.filter((item) => {
      const name = String(item.student?.fullName || "").toLowerCase();
      const code = String(item.student?.code || "").toLowerCase();
      return name.includes(term) || code.includes(term);
    });
  }, [students, search]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const visibleStudents = filteredStudents.slice(page * pageSize, (page + 1) * pageSize);

  const handleStatusChange = (record: any, status: string) => {
    updateAttendanceMutation.mutate({
      student_session_id: record.id,
      attendance_status: status,
    });
  };

  const handleSaveNote = () => {
    if (!noteDialog) return;
    updateAttendanceMutation.mutate(
      {
        student_session_id: noteDialog.record.id,
        attendance_note: noteDialog.value,
      },
      { onSuccess: () => setNoteDialog(null) },
    );
  };

  if (allSessionsQuery.isLoading) {
    return (
      <div className="flex min-h-[260px] items-center justify-center gap-2 rounded-b-2xl border-t border-slate-100 bg-white text-xs text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Đang tải ma trận điểm danh…
      </div>
    );
  }

  if (allSessionsQuery.isError) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-b-2xl border-t border-slate-100 bg-white text-center">
        <AlertCircle className="h-5 w-5 text-rose-500" />
        <p className="text-xs font-semibold text-slate-700">Không tải được dữ liệu điểm danh</p>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void allSessionsQuery.refetch()}>
          Thử lại
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="border-t border-slate-100 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2">
          <div className="relative min-w-[220px] flex-1">
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
              placeholder="Tìm tên, mã học viên…"
              className="h-8 bg-white pr-2 text-xs"
            />
          </div>
          <span className="text-[10px] text-slate-500">
            {filteredStudents.length} học viên · {sessions.length} buổi
          </span>
          <div className="ml-auto flex items-center gap-2 text-[10px] text-slate-400">
            <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-emerald-600" /> Có học</span>
            <span className="inline-flex items-center gap-1"><X className="h-3 w-3 text-rose-600" /> Nghỉ</span>
            <span className="inline-flex items-center gap-1"><Plus className="h-3 w-3 text-slate-500" /> Điểm danh</span>
          </div>
        </div>

        <div className="max-h-[min(55vh,520px)] overflow-auto">
          <table className="w-max min-w-full border-collapse text-xs">
            <thead className="sticky top-0 z-30 bg-slate-50">
              <tr className="border-b border-slate-200">
                <th className="sticky left-0 z-40 w-[86px] min-w-[86px] border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">Mã HV</th>
                <th className="sticky left-[86px] z-40 w-[180px] min-w-[180px] border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">Học viên</th>
                <th className="sticky left-[266px] z-40 w-[110px] min-w-[110px] border-r border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">Trạng thái</th>
                <th className="sticky left-[376px] z-40 w-[88px] min-w-[88px] border-r border-slate-200 bg-slate-50 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500">Đã học/Tổng</th>
                <th className="sticky left-[464px] z-40 w-[68px] min-w-[68px] border-r-2 border-slate-300 bg-slate-50 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500">Còn lại</th>
                {sessions.map((session) => (
                  <th key={session.id} className="w-[172px] min-w-[172px] border-r border-slate-200 px-2 py-2 text-center">
                    <div className="font-bold text-slate-700">Buổi {session.sessionIndex ?? "—"}</div>
                    <div className="mt-0.5 font-mono text-[10px] font-medium text-slate-500">{formatDate(session.sessionDate)}</div>
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
              {visibleStudents.map((item) => {
                const studentId = item.id;
                const studentRows = rowsByStudent.get(studentId) || new Map();
                const rowStatuses = sessions.map((session) => studentRows.get(String(session.id)));
                const completedFromMatrix = rowStatuses.filter((row) =>
                  row?.attendanceStatus === "present" || row?.attendanceStatus === "makeup_done",
                ).length;
                const totalFromMatrix = rowStatuses.filter((row, index) =>
                  row && sessions[index].status !== "cancelled",
                ).length;
                const detail = item.student?.classDetails?.find?.((entry: any) => entry.classId === classId);
                const completed = detail?.attendedSessions ?? completedFromMatrix;
                const total = detail?.totalSessions ?? totalFromMatrix;
                const remaining = detail?.remainingSessions ?? Math.max(0, total - completed);
                const name = item.student?.fullName || "—";
                const learningStatus = item.studentStatus || item.student?.learningStatus || "Đang học";

                return (
                  <tr key={studentId} className="group border-b border-slate-100 hover:bg-sky-50/40">
                    <td className="sticky left-0 z-20 border-r border-slate-200 bg-white px-3 py-2 font-mono text-[11px] font-semibold text-sky-700 group-hover:bg-sky-50">{item.student?.code || "—"}</td>
                    <td className="sticky left-[86px] z-20 border-r border-slate-200 bg-white px-3 py-2 group-hover:bg-sky-50">
                      <div className="flex items-center gap-2">
                        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-bold text-white", avatarGradient(name))}>{name.slice(0, 1)}</div>
                        <span className="max-w-[140px] truncate font-semibold text-slate-700">{name}</span>
                      </div>
                    </td>
                    <td className="sticky left-[266px] z-20 border-r border-slate-200 bg-white px-2 py-2 group-hover:bg-sky-50">
                      <Badge variant="outline" className="h-5 max-w-[98px] truncate border-slate-200 px-1.5 text-[10px] font-medium text-slate-600">{learningStatus}</Badge>
                    </td>
                    <td className="sticky left-[376px] z-20 border-r border-slate-200 bg-white px-2 py-2 text-center font-mono text-[11px] font-semibold text-slate-700 group-hover:bg-sky-50">{completed}/{total}</td>
                    <td className="sticky left-[464px] z-20 border-r-2 border-slate-300 bg-white px-2 py-2 text-center font-mono text-[11px] text-slate-500 group-hover:bg-sky-50">{remaining}</td>
                    {sessions.map((session, index) => (
                      <td key={session.id} className="border-r border-slate-100 px-1.5 py-1.5 text-center">
                        <StatusCell
                          record={rowStatuses[index]}
                          session={session}
                          canEdit={canEdit}
                          isPending={updateAttendanceMutation.isPending}
                          onStatusChange={handleStatusChange}
                          onEditNote={(record) => setNoteDialog({ record, value: record.attendanceNote || "" })}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
              {visibleStudents.length === 0 && (
                <tr>
                  <td colSpan={5 + sessions.length} className="px-4 py-10 text-center text-xs text-slate-400">Không tìm thấy học viên</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-4 py-2 text-[10px] text-slate-500">
          <span>Hiển thị {visibleStudents.length}/{filteredStudents.length}</span>
          <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); setPage(0); }}>
            <SelectTrigger className="h-7 w-[88px] text-[10px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="20">20 / trang</SelectItem>
              <SelectItem value="50">50 / trang</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-7 px-2 text-[10px]" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Trước</Button>
          <span>{page + 1}/{totalPages}</span>
          <Button variant="outline" size="sm" className="h-7 px-2 text-[10px]" disabled={page >= totalPages - 1} onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))}>Sau</Button>
        </div>
      </div>

      <Dialog open={Boolean(noteDialog)} onOpenChange={(open) => { if (!open) setNoteDialog(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-base">Ghi chú điểm danh</DialogTitle>
          </DialogHeader>
          <Textarea
            value={noteDialog?.value || ""}
            onChange={(event) => setNoteDialog((current) => current ? { ...current, value: event.target.value } : current)}
            placeholder="Nhập ghi chú cho học viên ở buổi này…"
            className="min-h-[110px] text-sm"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialog(null)}>Huỷ</Button>
            <Button onClick={handleSaveNote} disabled={updateAttendanceMutation.isPending}>
              {updateAttendanceMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Lưu ghi chú
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}