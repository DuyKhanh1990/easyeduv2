import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, BookOpen, Eye } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

interface ActivityLog {
  id: string;
  userId: string | null;
  locationId: string | null;
  classId: string | null;
  action: string;
  oldContent: string | null;
  newContent: string | null;
  createdAt: string;
  userName: string | null;
  locationName: string | null;
  className: string | null;
  classCode: string | null;
}

interface ClassActivityLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId?: string;
  filterActions?: string[];
}

const ACTION_COLORS: Record<string, string> = {
  "Thêm": "bg-green-100 text-green-700 border-green-200",
  "Sửa": "bg-blue-100 text-blue-700 border-blue-200",
  "Xoá": "bg-red-100 text-red-700 border-red-200",
  "Xóa": "bg-red-100 text-red-700 border-red-200",
  "Xoá lịch": "bg-red-100 text-red-700 border-red-200",
  "Đổi giáo viên": "bg-blue-100 text-blue-700 border-blue-200",
  "Điểm danh": "bg-purple-100 text-purple-700 border-purple-200",
  "Điểm danh hàng loạt": "bg-purple-100 text-purple-700 border-purple-200",
  "Gia hạn": "bg-orange-100 text-orange-700 border-orange-200",
  "Cập nhật buổi": "bg-blue-100 text-blue-700 border-blue-200",
  "Cập nhật chu kỳ": "bg-indigo-100 text-indigo-700 border-indigo-200",
  "Loại trừ ngày": "bg-orange-100 text-orange-700 border-orange-200",
  "Thêm Nội dung": "bg-green-100 text-green-700 border-green-200",
  "Xoá Nội dung": "bg-red-100 text-red-700 border-red-200",
  "Chuyển lớp": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "Học bù": "bg-indigo-100 text-indigo-700 border-indigo-200",
};

function getActionColor(action: string): string {
  for (const [key, cls] of Object.entries(ACTION_COLORS)) {
    if (action.toLowerCase().includes(key.toLowerCase())) return cls;
  }
  return "bg-gray-100 text-gray-700 border-gray-200";
}

function formatDate(dateStr: string): string {
  try {
    // Strip 'Z' so the browser treats the timestamp as local time (UTC+7 Vietnam)
    // instead of converting from UTC which adds an extra 7 hours
    const local = dateStr.replace("Z", "").replace("+00:00", "");
    return format(new Date(local), "dd/MM/yyyy HH:mm", { locale: vi });
  } catch {
    return dateStr;
  }
}

type ContentItem = { title: string; type?: string };
type SessionInfo = { index: number | null; date: string; dayOfWeek: string; startTime: string; endTime: string } | null;
type ContentPayload = { session: SessionInfo; items: ContentItem[] } | ContentItem[] | null;
type SessionUpdateField = { label: string; value: string; changed: boolean };
type SessionUpdatePayload = { sessionIndex?: number | null; fields: SessionUpdateField[] };
type DeletedSessionEntry = { sessionIndex: number | null; weekday: number; sessionDate: string; startTime: string | null };
type TeacherEntry = { id: string; name: string; code: string };
type ChangeTeacherSessionEntry = { sessionIndex: number | null; weekday: number; sessionDate: string; startTime: string | null; teachers: TeacherEntry[] };

type ExtensionLogSession = { sessionIndex: number | null; weekday: number; sessionDate: string; startTime: string | null };
type ExtensionLogStudent = { name: string; code: string; autoInvoice: boolean };
type ExtensionLogPayload = {
  mode: "class" | "student";
  extensionType: "sessions" | "date";
  numSessions: number | null;
  endDate: string | null;
  cycleMode: "all" | "specific";
  specificShiftIds: string[];
  extensionName: string | null;
  sessions: ExtensionLogSession[];
  students: ExtensionLogStudent[];
};

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function formatDeletedSessionDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${parseInt(d)}/${parseInt(m)}/${y}`;
}

function tryParseDeletedSessions(raw: string | null): DeletedSessionEntry[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0 && "sessionDate" in parsed[0]) {
      return parsed as DeletedSessionEntry[];
    }
  } catch {}
  return null;
}

function formatDeletedSessionLine(s: DeletedSessionEntry): string {
  const wd = WEEKDAY_LABELS[s.weekday] ?? "";
  const date = formatDeletedSessionDate(s.sessionDate);
  const time = s.startTime ? ` ${s.startTime}` : "";
  return `Buổi ${s.sessionIndex ?? "?"}, ${wd} ${date}${time}`;
}

function tryParseChangeTeacherSessions(raw: string | null): ChangeTeacherSessionEntry[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0 && "teachers" in parsed[0]) {
      return parsed as ChangeTeacherSessionEntry[];
    }
  } catch {}
  return null;
}

function formatSessionPrefix(s: { sessionIndex: number | null; weekday: number; sessionDate: string; startTime: string | null }): string {
  const wd = WEEKDAY_LABELS[s.weekday] ?? "";
  const date = formatDeletedSessionDate(s.sessionDate);
  const time = s.startTime ? ` ${s.startTime}` : "";
  return `Buổi ${s.sessionIndex ?? "?"}, ${wd} ${date}${time}`;
}

type UpdateCycleTeacher = { name: string; code: string };
type UpdateCycleSessionEntry = { sessionIndex: number | null; weekday: number; sessionDate: string; startTime: string | null; teachers?: UpdateCycleTeacher[] };

function tryParseUpdateCycleSessions(raw: string | null): UpdateCycleSessionEntry[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0 && "sessionDate" in parsed[0] && "weekday" in parsed[0]) {
      return parsed as UpdateCycleSessionEntry[];
    }
  } catch {}
  return null;
}

function formatCycleSessionDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${parseInt(d)}/${parseInt(m)}/${y}`;
}

function formatCycleSessionLine(s: UpdateCycleSessionEntry): string {
  const wd = WEEKDAY_LABELS[s.weekday] ?? "";
  const date = formatCycleSessionDate(s.sessionDate);
  const time = s.startTime ? ` ${s.startTime}` : "";
  const teachers = (s.teachers ?? []).map(t => `${t.name}${t.code ? ` (${t.code})` : ""}`).join(", ");
  const teacherPart = teachers ? ` - ${teachers}` : "";
  return `Buổi ${s.sessionIndex ?? "?"}, ${wd} ${date}${time}${teacherPart}`;
}

function UpdateCycleSessionList({ raw }: { raw: string | null }) {
  const sessions = tryParseUpdateCycleSessions(raw);
  if (!sessions || sessions.length === 0) {
    return <span className="text-muted-foreground italic">—</span>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      {sessions.map((s, idx) => (
        <span key={idx} className="text-xs text-muted-foreground whitespace-nowrap">
          {formatCycleSessionLine(s)}
        </span>
      ))}
    </div>
  );
}

function UpdateCycleDetailView({ log }: { log: ActivityLog }) {
  const oldSessions = tryParseUpdateCycleSessions(log.oldContent);
  const newSessions = tryParseUpdateCycleSessions(log.newContent);

  if (!oldSessions || !newSessions) {
    return (
      <div className="text-xs text-muted-foreground italic">Không có dữ liệu chi tiết.</div>
    );
  }

  const newByIndex = new Map<number | null, UpdateCycleSessionEntry>();
  for (const s of newSessions) {
    newByIndex.set(s.sessionIndex, s);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Các buổi bị thay đổi ({oldSessions.length} buổi)
      </div>
      {oldSessions.map((old, idx) => {
        const newSession = newByIndex.get(old.sessionIndex) ?? null;
        const changed = newSession
          ? old.sessionDate !== newSession.sessionDate || old.weekday !== newSession.weekday || old.startTime !== newSession.startTime
          : true;
        return (
          <div key={idx} className="flex items-center gap-2 py-1 border-b border-border/40 last:border-0 flex-wrap">
            <span className="text-xs text-muted-foreground whitespace-nowrap">{formatCycleSessionLine(old)}</span>
            <span className="text-xs text-muted-foreground font-mono shrink-0">─────►</span>
            <span className={`text-xs whitespace-nowrap ${changed ? "text-blue-600 font-semibold" : "text-muted-foreground"}`}>
              {newSession ? formatCycleSessionLine(newSession) : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

type AttendanceStudentChange = { name: string; code: string; oldStatus: string; newStatus: string };
type AttendanceLogSession = { index: number | null; weekday: number; sessionDate: string; startTime: string | null };
type AttendanceLogPayload = { session: AttendanceLogSession; students: AttendanceStudentChange[] };

const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  present: "Có học",
  absent: "Nghỉ học",
  makeup_wait: "Nghỉ chờ bù",
  makeup_done: "Đã học bù",
  cancelled: "Huỷ",
  pending: "Chưa điểm danh",
  scheduled: "Chưa điểm danh",
};

function getAttendanceLabel(status: string): string {
  return ATTENDANCE_STATUS_LABELS[status] ?? status;
}

function tryParseAttendanceLog(raw: string | null): AttendanceLogPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "session" in parsed && Array.isArray(parsed.students)) {
      return parsed as AttendanceLogPayload;
    }
  } catch {}
  return null;
}

function formatAttendanceSessionDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${parseInt(d)}/${parseInt(m)}/${y}`;
}

function AttendanceLogDetailView({ log }: { log: ActivityLog }) {
  const payload = tryParseAttendanceLog(log.newContent);
  if (!payload) {
    return <div className="text-xs text-muted-foreground italic">Không có dữ liệu chi tiết.</div>;
  }
  const { session, students } = payload;
  const wd = WEEKDAY_LABELS[session.weekday] ?? "";
  const date = formatAttendanceSessionDate(session.sessionDate);
  const time = session.startTime ? ` ${session.startTime}` : "";
  const sessionLabel = `Buổi ${session.index ?? "?"}, ${wd} ${date}${time}`;

  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-semibold text-blue-700 mb-2">{sessionLabel}</div>
      {students.map((s, idx) => {
        const oldLabel = getAttendanceLabel(s.oldStatus);
        const newLabel = getAttendanceLabel(s.newStatus);
        const changed = s.oldStatus !== s.newStatus;
        return (
          <div key={idx} className="flex items-center gap-2 py-0.5 border-b border-border/40 last:border-0 flex-wrap">
            <span className="text-xs font-medium whitespace-nowrap">
              {s.name}{s.code ? ` (${s.code})` : ""}:
            </span>
            <span className="text-xs text-muted-foreground whitespace-nowrap">{oldLabel}</span>
            <span className="text-xs text-muted-foreground font-mono shrink-0">─────►</span>
            <span className={`text-xs whitespace-nowrap font-semibold ${changed ? "text-blue-600" : "text-muted-foreground"}`}>
              {newLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AttendanceLogCell({ raw }: { raw: string | null }) {
  const payload = tryParseAttendanceLog(raw);
  if (!payload) return <span className="text-muted-foreground italic">—</span>;
  const { session, students } = payload;
  const wd = WEEKDAY_LABELS[session.weekday] ?? "";
  const date = formatAttendanceSessionDate(session.sessionDate);
  const time = session.startTime ? ` ${session.startTime}` : "";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold text-blue-700">
        Buổi {session.index ?? "?"}, {wd} {date}{time}
      </span>
      {students.slice(0, 3).map((s, idx) => (
        <span key={idx} className="text-xs text-muted-foreground whitespace-nowrap">
          {s.name}{s.code ? ` (${s.code})` : ""}: {getAttendanceLabel(s.newStatus)}
        </span>
      ))}
      {students.length > 3 && (
        <span className="text-xs text-muted-foreground italic">+{students.length - 3} học viên khác...</span>
      )}
    </div>
  );
}

function tryParseContent(raw: string | null): ContentPayload {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as ContentItem[];
    if (parsed && typeof parsed === "object" && "items" in parsed) return parsed as { session: SessionInfo; items: ContentItem[] };
  } catch {}
  return null;
}

function getItems(payload: ContentPayload): ContentItem[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return payload.items ?? [];
}

function getSession(payload: ContentPayload): SessionInfo {
  if (!payload || Array.isArray(payload)) return null;
  return payload.session ?? null;
}

function tryParseSessionUpdate(raw: string | null): SessionUpdatePayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.fields)) {
      return parsed as SessionUpdatePayload;
    }
  } catch {}
  return null;
}

function tryParseExtensionLog(raw: string | null): ExtensionLogPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "mode" in parsed && Array.isArray(parsed.sessions) && Array.isArray(parsed.students)) {
      return parsed as ExtensionLogPayload;
    }
  } catch {}
  return null;
}

function formatExtensionSessionDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${parseInt(d)}/${parseInt(m)}/${y}`;
}

function formatExtensionSessionLine(s: ExtensionLogSession): string {
  const wd = WEEKDAY_LABELS[s.weekday] ?? "";
  const date = formatExtensionSessionDate(s.sessionDate);
  const time = s.startTime ? ` ${s.startTime}` : "";
  return `Buổi ${s.sessionIndex ?? "?"}, ${wd} ${date}${time}`;
}

function ExtensionLogCell({ raw }: { raw: string | null }) {
  const payload = tryParseExtensionLog(raw);
  if (!payload) return <span className="text-muted-foreground italic">—</span>;

  const modeLabel = payload.mode === "class"
    ? "Gia hạn sau buổi cuối lịch lớp"
    : "Gia hạn sau buổi cuối từng học viên";
  const typeLabel = payload.extensionType === "sessions"
    ? `${payload.numSessions ?? 0} buổi`
    : payload.endDate ?? "?";
  const autoStudents = payload.students.filter(s => s.autoInvoice);

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold text-orange-700">{modeLabel} · {typeLabel}</span>
      <span className="text-xs text-muted-foreground">
        {payload.sessions.length} buổi gia hạn, {payload.students.length} học viên
      </span>
      {autoStudents.length > 0 && (
        <span className="text-xs text-muted-foreground">
          Hoá đơn tự động: {autoStudents.length === payload.students.length
            ? "Tất cả"
            : autoStudents.slice(0, 2).map(s => s.name).join(", ") + (autoStudents.length > 2 ? `...` : "")}
        </span>
      )}
    </div>
  );
}

function ExtensionLogDetailView({ log }: { log: ActivityLog }) {
  const payload = tryParseExtensionLog(log.newContent);
  if (!payload) {
    return <div className="text-xs text-muted-foreground italic">Không có dữ liệu chi tiết.</div>;
  }

  const modeLabel = payload.mode === "class"
    ? "Gia hạn sau buổi cuối cùng của lịch lớp"
    : "Gia hạn sau buổi cuối cùng của từng học viên";
  const typeLabel = payload.extensionType === "sessions" ? "Số buổi cụ thể" : "Gia hạn đến ngày";
  const cycleLabel = payload.cycleMode === "all" ? "Tất cả" : (payload.specificShiftIds ?? []).join(", ");

  const autoStudents = payload.students.filter(s => s.autoInvoice);
  const autoInvoiceLabel = autoStudents.length === 0
    ? "Không"
    : autoStudents.length === payload.students.length
    ? "Tất cả"
    : autoStudents.map(s => `${s.name}${s.code ? ` (${s.code})` : ""}`).join(", ");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-md px-4 py-3">
        <div className="text-xs font-semibold text-orange-800 dark:text-orange-300 uppercase tracking-wide mb-1">Thông tin gia hạn</div>
        <div className="flex flex-wrap gap-x-8 gap-y-1">
          <div className="text-xs">
            <span className="text-muted-foreground">Chế độ gia hạn: </span>
            <span className="font-medium">{modeLabel}</span>
          </div>
          <div className="text-xs">
            <span className="text-muted-foreground">Hình thức gia hạn: </span>
            <span className="font-medium">{typeLabel}</span>
          </div>
          {payload.extensionType === "sessions" && (
            <div className="text-xs">
              <span className="text-muted-foreground">Số buổi gia hạn: </span>
              <span className="font-medium">{payload.numSessions ?? 0}</span>
            </div>
          )}
          {payload.extensionType === "date" && payload.endDate && (
            <div className="text-xs">
              <span className="text-muted-foreground">Gia hạn đến ngày: </span>
              <span className="font-medium">{formatExtensionSessionDate(payload.endDate)}</span>
            </div>
          )}
          <div className="text-xs">
            <span className="text-muted-foreground">Chu kỳ lịch học: </span>
            <span className="font-medium">{cycleLabel}</span>
          </div>
          {payload.extensionName && (
            <div className="text-xs">
              <span className="text-muted-foreground">Tên đợt gia hạn: </span>
              <span className="font-medium">{payload.extensionName}</span>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Danh sách các buổi gia hạn thêm ({payload.sessions.length} buổi)
        </div>
        {payload.sessions.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">Không có buổi nào được tạo thêm.</div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {payload.sessions.map((s, idx) => (
              <div key={idx} className="flex items-center gap-2 py-0.5 border-b border-border/30 last:border-0">
                <span className="text-xs font-medium text-orange-700 dark:text-orange-400 whitespace-nowrap">
                  {formatExtensionSessionLine(s)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Hoá đơn tự động: <span className="text-foreground font-semibold">{autoInvoiceLabel}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          {payload.students.map((s, idx) => (
            <div key={idx} className="flex items-center gap-3 py-0.5 border-b border-border/30 last:border-0">
              <span className="text-xs font-medium whitespace-nowrap">
                {s.name}{s.code ? ` (${s.code})` : ""}
              </span>
              <span className={`text-xs ${s.autoInvoice ? "text-green-600 font-medium" : "text-muted-foreground"}`}>
                {s.autoInvoice ? "Hoá đơn tự động: Bật" : "Hoá đơn tự động: Tắt"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Count visual lines for one content column of a log row */
function countContentLines(log: ActivityLog, field: "oldContent" | "newContent"): number {
  const raw = log[field];
  if (!raw) return 0;
  if (log.action === "Xoá lịch") {
    const sessions = tryParseDeletedSessions(raw);
    return sessions ? sessions.length : 1;
  }
  if (log.action === "Đổi giáo viên") {
    const sessions = tryParseChangeTeacherSessions(raw);
    return sessions ? sessions.length : 1;
  }
  const isContentAction = log.action === "Thêm Nội dung" || log.action === "Xoá Nội dung";
  if (isContentAction) {
    const payload = tryParseContent(raw);
    const items = getItems(payload);
    const session = getSession(payload);
    return items.length + (session ? 1 : 0);
  }
  if (log.action === "Cập nhật buổi") {
    const payload = tryParseSessionUpdate(raw);
    if (payload) return payload.fields.length + (payload.sessionIndex != null ? 1 : 0);
  }
  if (log.action === "Cập nhật chu kỳ" || log.action === "Loại trừ ngày") {
    const sessions = tryParseUpdateCycleSessions(raw);
    return sessions ? sessions.length + 1 : 1;
  }
  if (log.action === "Điểm danh" || log.action === "Điểm danh hàng loạt") {
    const payload = tryParseAttendanceLog(raw);
    return payload ? payload.students.length + 1 : 1;
  }
  if (log.action === "Gia hạn") {
    const payload = tryParseExtensionLog(raw);
    return payload ? Math.max(payload.sessions.length + 1, 3) : 1;
  }
  // plain text: count newlines
  return raw.split("\n").length;
}


function SessionHeader({ session }: { session: SessionInfo }) {
  if (!session) return null;
  const parts: string[] = [];
  if (session.index != null) parts.push(`Buổi ${session.index}:`);
  if (session.dayOfWeek) parts.push(session.dayOfWeek + ",");
  if (session.date) parts.push(session.date);
  const timeStr = session.startTime && session.endTime
    ? `${session.startTime} - ${session.endTime}`
    : session.startTime || session.endTime || "";
  if (timeStr) parts.push(timeStr);
  return (
    <div className="text-[11px] font-semibold text-blue-700 mb-1">
      {parts.join(" ")}
    </div>
  );
}

function SessionUpdateCell({ raw, isNew }: { raw: string | null; isNew: boolean }) {
  const payload = tryParseSessionUpdate(raw);
  if (!payload) {
    return raw ? (
      <span className="whitespace-pre-wrap break-words text-muted-foreground">{raw}</span>
    ) : (
      <span className="text-muted-foreground italic">—</span>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      {payload.sessionIndex != null && (
        <div className="text-[11px] font-semibold text-blue-700 mb-1">Buổi {payload.sessionIndex}</div>
      )}
      {payload.fields.map((field, idx) => (
        <div key={idx} className="text-xs">
          <span className="text-muted-foreground">{field.label}: </span>
          <span className={isNew && field.changed ? "text-blue-600 font-semibold" : "text-foreground"}>
            {field.value || "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

function DeletedSessionsCell({ raw, isNew }: { raw: string | null; isNew: boolean }) {
  const sessions = tryParseDeletedSessions(raw);
  if (!sessions || sessions.length === 0) {
    return <span className="text-muted-foreground italic">—</span>;
  }
  if (isNew) {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="text-[11px] font-semibold text-red-600 mb-1">Các buổi học đã bị xoá bao gồm:</div>
        {sessions.map((s, idx) => (
          <span key={idx} className="text-xs text-red-600 font-medium whitespace-nowrap">
            {formatDeletedSessionLine(s)}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      {sessions.map((s, idx) => (
        <span key={idx} className="text-xs text-muted-foreground whitespace-nowrap">
          {formatDeletedSessionLine(s)}
        </span>
      ))}
    </div>
  );
}

function ChangeTeacherCell({ log, field }: { log: ActivityLog; field: "oldContent" | "newContent" }) {
  const raw = log[field];
  const sessions = tryParseChangeTeacherSessions(raw);
  const isNew = field === "newContent";

  if (!sessions || sessions.length === 0) {
    return <span className="text-muted-foreground italic">—</span>;
  }

  // Build old teacher ID sets per sessionIndex for comparison
  const oldSessions = isNew ? tryParseChangeTeacherSessions(log.oldContent) : null;
  const oldTeacherIdsBySession = new Map<number | null, Set<string>>();
  if (oldSessions) {
    for (const s of oldSessions) {
      oldTeacherIdsBySession.set(s.sessionIndex, new Set(s.teachers.map(t => t.id)));
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {sessions.map((s, idx) => {
        const oldIds = oldTeacherIdsBySession.get(s.sessionIndex) ?? null;
        return (
          <div key={idx} className="text-xs whitespace-nowrap">
            <span className="text-muted-foreground">{formatSessionPrefix(s)} — </span>
            {s.teachers.length === 0 ? (
              <span className="text-muted-foreground italic">Chưa phân công</span>
            ) : (
              s.teachers.map((t, ti) => {
                const isChanged = isNew && oldIds !== null && !oldIds.has(t.id);
                return (
                  <span key={ti}>
                    {ti > 0 && <span className="text-muted-foreground">, </span>}
                    <span className={isChanged ? "text-blue-700 font-semibold" : ""}>
                      {t.name}{t.code ? ` (${t.code})` : ""}
                    </span>
                  </span>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}

function ContentCell({ log, field }: { log: ActivityLog; field: "oldContent" | "newContent" }) {
  const raw = log[field];
  const isAddAction = log.action === "Thêm Nội dung";
  const isRemoveAction = log.action === "Xoá Nội dung";
  const isSessionUpdate = log.action === "Cập nhật buổi";
  const isDeleteSchedule = log.action === "Xoá lịch";
  const isChangeTeacher = log.action === "Đổi giáo viên";
  const isUpdateCycle = log.action === "Cập nhật chu kỳ";
  const isContentAction = isAddAction || isRemoveAction;
  const isNew = field === "newContent";

  if (isUpdateCycle || log.action === "Loại trừ ngày") {
    return <UpdateCycleSessionList raw={raw} />;
  }

  if (log.action === "Điểm danh" || log.action === "Điểm danh hàng loạt") {
    if (field === "oldContent") return <span className="text-muted-foreground italic">—</span>;
    return <AttendanceLogCell raw={raw} />;
  }

  if (log.action === "Gia hạn") {
    if (field === "oldContent") return <span className="text-muted-foreground italic">—</span>;
    return <ExtensionLogCell raw={raw} />;
  }

  if (isChangeTeacher) {
    return <ChangeTeacherCell log={log} field={field} />;
  }

  if (isDeleteSchedule) {
    return <DeletedSessionsCell raw={raw} isNew={isNew} />;
  }

  if (isSessionUpdate) {
    return <SessionUpdateCell raw={raw} isNew={isNew} />;
  }

  if (!isContentAction) {
    return raw ? (
      <span className={`whitespace-pre-wrap break-words ${field === "oldContent" ? "text-muted-foreground" : ""}`}>
        {raw}
      </span>
    ) : (
      <span className="text-muted-foreground italic">—</span>
    );
  }

  const payload = tryParseContent(raw);
  const items = getItems(payload);
  const session = getSession(payload);

  const highlightColor = isNew ? (isAddAction ? "green" : "red") : null;

  if (!payload || items.length === 0) {
    return <span className="text-muted-foreground italic">Trống</span>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      <SessionHeader session={session} />
      {items.map((item, idx) => {
        const colorClass = highlightColor === "green"
          ? "text-blue-700 font-medium"
          : highlightColor === "red"
          ? "text-red-600 font-medium"
          : "text-foreground";
        return (
          <span key={idx} className={`text-xs ${colorClass}`}>
            {item.type ? <span className="opacity-60">[{item.type}] </span> : null}
            {item.title}
          </span>
        );
      })}
    </div>
  );
}

/** Popup dialog showing full old + new content for a log entry */
function LogDetailDialog({ log, open, onOpenChange }: { log: ActivityLog; open: boolean; onOpenChange: (v: boolean) => void }) {
  const isUpdateCycle = log.action === "Cập nhật chu kỳ" || log.action === "Loại trừ ngày";
  const isAttendance = log.action === "Điểm danh" || log.action === "Điểm danh hàng loạt";
  const isExtension = log.action === "Gia hạn";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] h-[90vh] max-w-none flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border flex-shrink-0">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            Chi tiết nhật ký
            {(log.className || log.classCode) && (
              <span className="text-muted-foreground font-normal">
                — {log.className}{log.classCode ? ` (${log.classCode})` : ""}
              </span>
            )}
          </DialogTitle>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${getActionColor(log.action)}`}>
              {log.action}
            </span>
            <span>{formatDate(log.createdAt)}</span>
            {log.userName && <span>{log.userName}</span>}
          </div>
        </DialogHeader>
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-4 overflow-x-auto">
            {isUpdateCycle ? (
              <UpdateCycleDetailView log={log} />
            ) : isAttendance ? (
              <AttendanceLogDetailView log={log} />
            ) : isExtension ? (
              <ExtensionLogDetailView log={log} />
            ) : (
              <div className="grid grid-cols-2 gap-5 min-w-max">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Nội dung cũ</div>
                  <div className="text-xs">
                    <ContentCell log={log} field="oldContent" />
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Nội dung mới</div>
                  <div className="text-xs">
                    <ContentCell log={log} field="newContent" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function buildActionSummary(log: ActivityLog): string {
  const className = log.className ?? log.classCode ?? "";
  const classPart = className ? ` Lớp ${className}` : "";
  switch (log.action) {
    case "Đổi giáo viên": return `Đổi giáo viên${classPart}`;
    case "Xoá lịch": return `Xoá lịch${classPart}`;
    case "Thêm Nội dung": return `Thêm nội dung${classPart}`;
    case "Xoá Nội dung": return `Xoá nội dung${classPart}`;
    case "Cập nhật buổi": return `Cập nhật buổi${classPart}`;
    case "Cập nhật chu kỳ": return `Cập nhật chu kỳ${classPart}`;
    case "Loại trừ ngày": return `Loại trừ ngày${classPart}`;
    case "Học bù": return `Học bù${classPart}`;
    case "Chuyển lớp": return `Chuyển lớp${classPart}`;
    case "Điểm danh": return `Điểm danh${classPart}`;
    case "Điểm danh hàng loạt": return `Điểm danh hàng loạt${classPart}`;
    case "Gia hạn": return `Gia hạn${classPart}`;
    case "Thêm mới lớp": return `Thêm mới lớp${classPart}`;
    case "Chỉnh sửa lớp": return `Chỉnh sửa${classPart}`;
    case "Xoá lớp": return `Xoá lớp${classPart}`;
    default: return `${log.action}${classPart}`;
  }
}

/** Class column cell — shows name/code only */
function ClassCell({ log }: { log: ActivityLog }) {
  return log.className ? (
    <span className="text-xs font-medium">
      {log.className}
      {log.classCode && (
        <span className="text-muted-foreground font-normal"> ({log.classCode})</span>
      )}
    </span>
  ) : (
    <span className="text-muted-foreground italic text-xs">—</span>
  );
}

export function ClassActivityLogDialog({
  open,
  onOpenChange,
  classId,
  filterActions,
}: ClassActivityLogDialogProps) {
  const [search, setSearch] = useState("");
  const [detailLog, setDetailLog] = useState<ActivityLog | null>(null);

  const queryKey = classId
    ? ["/api/activity-logs", classId]
    : ["/api/activity-logs"];

  const url = classId
    ? `/api/activity-logs?classId=${classId}&limit=500`
    : `/api/activity-logs?limit=500`;

  const { data: logs = [], isLoading } = useQuery<ActivityLog[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Không tải được nhật ký");
      return res.json();
    },
    enabled: open,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: open ? 10000 : false,
  });

  const actionFiltered = filterActions && filterActions.length > 0
    ? logs.filter(log => filterActions.some(a => log.action === a))
    : logs;

  const filtered = actionFiltered.filter((log) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (log.userName ?? "").toLowerCase().includes(q) ||
      (log.locationName ?? "").toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      (log.oldContent ?? "").toLowerCase().includes(q) ||
      (log.newContent ?? "").toLowerCase().includes(q) ||
      (log.className ?? "").toLowerCase().includes(q) ||
      (log.classCode ?? "").toLowerCase().includes(q)
    );
  });

  const title = filterActions && filterActions.length > 0
    ? "Nhật ký Lịch học"
    : "Nhật ký hành động";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="!w-screen !h-screen !max-w-none !max-h-none !rounded-none flex flex-col p-0 gap-0 translate-x-0 translate-y-0 top-0 left-0 fixed">
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-border flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <BookOpen className="h-5 w-5 text-primary" />
              {title}
              {actionFiltered.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {actionFiltered.length}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 py-3 border-b border-border flex-shrink-0">
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-8 text-sm"
                data-testid="input-activity-log-search"
              />
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="px-6 pb-6">
              {isLoading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Đang tải nhật ký...
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {search ? "Không tìm thấy kết quả phù hợp." : "Chưa có nhật ký nào."}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="w-[160px] py-2">Người dùng</TableHead>
                      <TableHead className="w-[140px] py-2">Cơ sở</TableHead>
                      <TableHead className="w-[160px] py-2 whitespace-nowrap">Thời gian</TableHead>
                      <TableHead className="w-[150px] py-2">Hành động</TableHead>
                      <TableHead className="w-[150px] py-2">Lớp học</TableHead>
                      <TableHead className="py-2">Mô tả</TableHead>
                      <TableHead className="w-[60px] py-2 text-center">Xem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((log) => (
                      <TableRow
                        key={log.id}
                        className="text-xs"
                        data-testid={`row-activity-log-${log.id}`}
                      >
                        <TableCell className="py-2 font-medium">
                          {log.userName ?? (
                            <span className="text-muted-foreground italic">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2">
                          {log.locationName ?? (
                            <span className="text-muted-foreground italic">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-muted-foreground whitespace-nowrap">
                          {formatDate(log.createdAt)}
                        </TableCell>
                        <TableCell className="py-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${getActionColor(log.action)}`}
                          >
                            {log.action}
                          </span>
                        </TableCell>
                        <TableCell className="py-2">
                          <ClassCell log={log} />
                        </TableCell>
                        <TableCell className="py-2 text-xs text-muted-foreground">
                          {buildActionSummary(log)}
                        </TableCell>
                        <TableCell className="py-2 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-primary"
                            onClick={() => setDetailLog(log)}
                            data-testid={`button-log-detail-${log.id}`}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {detailLog && (
        <LogDetailDialog
          log={detailLog}
          open={!!detailLog}
          onOpenChange={(v) => { if (!v) setDetailLog(null); }}
        />
      )}
    </>
  );
}
