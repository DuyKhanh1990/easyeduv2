import { useMemo, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocations } from "@/hooks/use-locations";
import { Search, ScrollText, X, Eye } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { navigation } from "@/lib/sidebar-navigation";

const permissionResourceLabels: Record<string, string> = (() => {
  const labels: Record<string, string> = {
    "/#bao-cao/thu-chi": "Báo cáo Thu - Chi",
    "/#bao-cao/phan-bo": "Phân bổ Thu - Chi",
    "/#bao-cao/doanh-thu-lop-hoc": "Doanh thu lớp học",
    "/#bao-cao/doanh-thu-nhan-su": "Doanh thu nhân sự",
    "/#bao-cao/phan-bo-hoc-phi": "Phân bổ học phí",
    "/#bao-cao/thoi-gian-giang-day": "Thời gian giảng dạy",
    "/#bao-cao/hoc-vien-moi": "Báo cáo Học viên mới",
    "/#bao-cao/chuyen-doi": "Báo cáo Chuyển đổi",
    "/#bao-cao/lich-su-cuoc-goi": "Lịch sử cuộc gọi",
  };
  for (const entry of navigation) {
    if ("module" in entry) {
      for (const item of entry.items) {
        labels[item.href] = item.name;
        for (const sub of item.subTabs ?? []) {
          labels[`${item.href}#${sub.value}`] = sub.name;
          for (const subItem of sub.subItems ?? []) {
            labels[`${item.href}#${sub.value}/${subItem.value}`] = subItem.name;
          }
        }
      }
    } else {
      labels[entry.href] = entry.name;
      for (const sub of entry.subTabs ?? []) {
        labels[`${entry.href}#${sub.value}`] = sub.name;
        for (const subItem of sub.subItems ?? []) {
          labels[`${entry.href}#${sub.value}/${subItem.value}`] = subItem.name;
        }
      }
    }
  }
  return labels;
})();

export interface ActivityLog {
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

type LogTimeRange = "all" | "today" | "7d" | "30d" | "thismonth";

function isInTimeRange(dateValue: string, range: LogTimeRange): boolean {
  if (range === "all") return true;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  if (range === "today") return target.getTime() === today.getTime();
  if (range === "7d") {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    return target >= from && target <= today;
  }
  if (range === "30d") {
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    return target >= from && target <= today;
  }

  return target.getFullYear() === today.getFullYear()
    && target.getMonth() === today.getMonth();
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
  "Đổi chu kỳ": "bg-purple-100 text-purple-700 border-purple-200",
  "Loại trừ ngày": "bg-orange-100 text-orange-700 border-orange-200",
  "Thêm Nội dung": "bg-green-100 text-green-700 border-green-200",
  "Xoá Nội dung": "bg-red-100 text-red-700 border-red-200",
  "Đổi gói học phí": "bg-amber-100 text-amber-700 border-amber-200",
  "Chuyển lớp": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "Học bù": "bg-indigo-100 text-indigo-700 border-indigo-200",
  "Xếp bù": "bg-teal-100 text-teal-700 border-teal-200",
  "Xoá học viên khỏi buổi": "bg-red-100 text-red-700 border-red-200",
  "Nhận xét học viên": "bg-sky-100 text-sky-700 border-sky-200",
  "Gán tiêu chí": "bg-violet-100 text-violet-700 border-violet-200",
  "Gán bảng điểm": "bg-orange-100 text-orange-700 border-orange-200",
  "Gán link online": "bg-cyan-100 text-cyan-700 border-cyan-200",
};

export function getActionColor(action: string): string {
  for (const [key, cls] of Object.entries(ACTION_COLORS)) {
    if (action.toLowerCase().includes(key.toLowerCase())) return cls;
  }
  return "bg-gray-100 text-gray-700 border-gray-200";
}

export function formatDate(dateStr: string): string {
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

type MakeupSessionInfo = {
  sessionIndex: number | null;
  sessionDate: string;
  weekday: number;
  startTime: string | null;
  className: string;
  classCode: string;
};
type MakeupStudentLogEntry = {
  name: string;
  code: string;
  fromSession: MakeupSessionInfo;
  toSession: MakeupSessionInfo | null;
};
type MakeupLogPayload = {
  option: "current_class" | "other_class" | "new_schedule";
  subOption: "specific_session" | "end_of_schedule" | null;
  students: MakeupStudentLogEntry[];
};

type TransferClassLogSession = {
  fromSessionIndex: number | null;
  fromSessionDate: string;
  fromWeekday: number;
  toSessionIndex: number | null;
  toSessionDate: string;
  toWeekday: number;
};
type TransferClassLogPayload = {
  student: { name: string; code: string };
  fromClass: { name: string; classCode: string };
  toClass: { name: string; classCode: string };
  fromSessionIndex: number;
  toSessionIndex: number;
  transferCount: number;
  sessions: TransferClassLogSession[];
};

type TuitionPackageLogStudent = {
  name: string;
  code: string;
  oldPackageName: string | null;
  oldPackageType: string | null;
  oldSessionPrice: number | null;
  sessionCount: number;
};
type TuitionPackageLogPayload = {
  newPackage: { name: string; type: string; fee: number; sessions: number | null; sessionPrice: number } | null;
  fromSessionIndex: number;
  toSessionIndex: number;
  className: string;
  classCode: string;
  students: TuitionPackageLogStudent[];
};

type ExtensionLogSession = { sessionIndex: number | null; weekday: number; sessionDate: string; startTime: string | null };
type ExtensionLogStudent = {
  name: string;
  code: string;
  autoInvoice: boolean;
  fromSession?: ExtensionLogSession | null;
  toSessions?: ExtensionLogSession[];
};
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

// ─── New schedule-operation log types ───────────────────────────────────────

type RemoveStudentFromSessionPayload = {
  students: { name: string; code: string }[];
  fromSessionIndex: number;
  toSessionIndex: number;
  deleteOnlyUnattended: boolean;
  className: string;
  classCode: string;
};

type ReviewStudentEntry = {
  name: string;
  code: string;
  sessionIndex: number | null;
  sessionDate: string;
  weekday: number;
};

type ReviewStudentPayload = {
  published: boolean;
  students: ReviewStudentEntry[];
};

type ApplyCriteriaPayload = {
  criteriaId: string;
  criteriaName: string;
  fromSessionIndex: number;
  toSessionIndex: number;
  sessionCount: number;
};

type ApplyScoreSheetPayload = {
  scoreSheetId: string;
  scoreSheetName: string;
  fromSessionIndex: number;
  toSessionIndex: number;
  sessionCount: number;
};

type OnlineLinkPayload = {
  link: string | null;
  className: string;
  classCode: string;
};

type ChangeCycleSinglePayload = {
  student: { name: string; code: string };
  fromSessionOrder: number;
  oldWeekdays: string;
  newWeekdays: string;
  mode: "all" | "unattended_only";
  deleted: number;
  created: number;
};

type ChangeCycleBulkStudentEntry = {
  name: string;
  code: string;
  fromSessionOrder: number;
  oldWeekdays: string;
  newWeekdays: string;
};

type ChangeCycleBulkPayload = {
  mode: "all" | "unattended_only";
  students: ChangeCycleBulkStudentEntry[];
  totalDeleted: number;
  totalCreated: number;
};

type ChangeCyclePayload =
  | { kind: "single"; data: ChangeCycleSinglePayload }
  | { kind: "bulk"; data: ChangeCycleBulkPayload };

// ─── Parsers ──────────────────────────────────────────────────────────────────

function tryParseRemoveStudentLog(raw: string | null): RemoveStudentFromSessionPayload | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === "object" && Array.isArray(p.students) && "fromSessionIndex" in p) return p as RemoveStudentFromSessionPayload;
  } catch {}
  return null;
}

function tryParseReviewLog(raw: string | null): ReviewStudentPayload | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === "object" && "published" in p && Array.isArray(p.students)) return p as ReviewStudentPayload;
  } catch {}
  return null;
}

function tryParseApplyCriteriaLog(raw: string | null): ApplyCriteriaPayload | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === "object" && "criteriaName" in p) return p as ApplyCriteriaPayload;
  } catch {}
  return null;
}

function tryParseApplyScoreSheetLog(raw: string | null): ApplyScoreSheetPayload | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === "object" && "scoreSheetName" in p) return p as ApplyScoreSheetPayload;
  } catch {}
  return null;
}

function tryParseOnlineLinkLog(raw: string | null): OnlineLinkPayload | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === "object" && "className" in p && ("link" in p)) return p as OnlineLinkPayload;
  } catch {}
  return null;
}

function tryParseChangeCycleLog(raw: string | null): ChangeCyclePayload | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return null;
    if ("student" in p && "fromSessionOrder" in p) {
      return { kind: "single", data: p as ChangeCycleSinglePayload };
    }
    if ("students" in p && Array.isArray(p.students) && "totalDeleted" in p) {
      return { kind: "bulk", data: p as ChangeCycleBulkPayload };
    }
  } catch {}
  return null;
}

// ─── Cell renderers (summary column) ─────────────────────────────────────────

function RemoveStudentLogCell({ raw }: { raw: string | null }) {
  const p = tryParseRemoveStudentLog(raw);
  if (!p) return <span className="text-muted-foreground italic">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold text-red-700">
        Buổi {p.fromSessionIndex}{p.fromSessionIndex !== p.toSessionIndex ? ` → ${p.toSessionIndex}` : ""}
        {p.deleteOnlyUnattended ? " (chưa điểm danh)" : ""}
      </span>
      {p.students.slice(0, 3).map((s, i) => (
        <span key={i} className="text-xs text-muted-foreground whitespace-nowrap">
          {s.name}{s.code ? ` (${s.code})` : ""}
        </span>
      ))}
      {p.students.length > 3 && (
        <span className="text-xs text-muted-foreground italic">+{p.students.length - 3} học viên khác...</span>
      )}
    </div>
  );
}

function ReviewLogCell({ raw }: { raw: string | null }) {
  const p = tryParseReviewLog(raw);
  if (!p) return <span className="text-muted-foreground italic">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold text-sky-700">
        {p.published ? "Đã công bố" : "Chưa công bố"} · {p.students.length} học viên
      </span>
      {p.students.slice(0, 3).map((s, i) => (
        <span key={i} className="text-xs text-muted-foreground whitespace-nowrap">
          {s.name}{s.code ? ` (${s.code})` : ""}
        </span>
      ))}
      {p.students.length > 3 && (
        <span className="text-xs text-muted-foreground italic">+{p.students.length - 3} học viên khác...</span>
      )}
    </div>
  );
}

function ApplyCriteriaLogCell({ raw }: { raw: string | null }) {
  const p = tryParseApplyCriteriaLog(raw);
  if (!p) return <span className="text-muted-foreground italic">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold text-violet-700">{p.criteriaName}</span>
      <span className="text-xs text-muted-foreground">
        Buổi {p.fromSessionIndex}{p.fromSessionIndex !== p.toSessionIndex ? ` → ${p.toSessionIndex}` : ""} ({p.sessionCount} buổi)
      </span>
    </div>
  );
}

function ApplyScoreSheetLogCell({ raw }: { raw: string | null }) {
  const p = tryParseApplyScoreSheetLog(raw);
  if (!p) return <span className="text-muted-foreground italic">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold text-orange-700">{p.scoreSheetName}</span>
      <span className="text-xs text-muted-foreground">
        Buổi {p.fromSessionIndex}{p.fromSessionIndex !== p.toSessionIndex ? ` → ${p.toSessionIndex}` : ""} ({p.sessionCount} buổi)
      </span>
    </div>
  );
}

function OnlineLinkLogCell({ raw }: { raw: string | null }) {
  const p = tryParseOnlineLinkLog(raw);
  if (!p) return <span className="text-muted-foreground italic">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {p.link ? (
        <span className="text-[11px] font-semibold text-cyan-700 truncate max-w-[200px]">{p.link}</span>
      ) : (
        <span className="text-[11px] text-muted-foreground italic">Xoá link online</span>
      )}
    </div>
  );
}

function ChangeCycleLogCell({ raw }: { raw: string | null }) {
  const parsed = tryParseChangeCycleLog(raw);
  if (!parsed) return <span className="text-muted-foreground italic">—</span>;
  if (parsed.kind === "single") {
    const { data: d } = parsed;
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold text-purple-700">
          {d.student.name}{d.student.code ? ` (${d.student.code})` : ""}
        </span>
        <span className="text-xs text-muted-foreground">
          {d.oldWeekdays} → <span className="font-medium text-foreground">{d.newWeekdays}</span>
        </span>
        <span className="text-xs text-muted-foreground">Từ buổi {d.fromSessionOrder} · xóa {d.deleted}, tạo {d.created}</span>
      </div>
    );
  }
  const { data: d } = parsed;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold text-purple-700">{d.students.length} học viên</span>
      {d.students.slice(0, 2).map((s, i) => (
        <span key={i} className="text-xs text-muted-foreground whitespace-nowrap">
          {s.name}{s.code ? ` (${s.code})` : ""}: {s.oldWeekdays} → {s.newWeekdays}
        </span>
      ))}
      {d.students.length > 2 && (
        <span className="text-xs text-muted-foreground italic">+{d.students.length - 2} học viên khác...</span>
      )}
    </div>
  );
}

// ─── Detail views (popup) ────────────────────────────────────────────────────

function RemoveStudentLogDetailView({ log }: { log: ActivityLog }) {
  const p = tryParseRemoveStudentLog(log.newContent);
  if (!p) return <div className="text-xs text-muted-foreground italic">Không có dữ liệu chi tiết.</div>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md px-4 py-3">
        <div className="text-xs font-semibold text-red-800 dark:text-red-300 uppercase tracking-wide mb-1">Thông tin xoá</div>
        <div className="flex flex-wrap gap-x-8 gap-y-1">
          <div className="text-xs"><span className="text-muted-foreground">Từ buổi: </span><span className="font-medium">{p.fromSessionIndex}</span></div>
          <div className="text-xs"><span className="text-muted-foreground">Đến buổi: </span><span className="font-medium">{p.toSessionIndex}</span></div>
          <div className="text-xs"><span className="text-muted-foreground">Chế độ: </span><span className="font-medium">{p.deleteOnlyUnattended ? "Chỉ buổi chưa điểm danh" : "Tất cả buổi trong khoảng"}</span></div>
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Học viên bị xoá ({p.students.length})</div>
        <div className="flex flex-col gap-1">
          {p.students.map((s, i) => (
            <div key={i} className="text-xs py-1 border-b border-border/40 last:border-0">
              {s.name}{s.code ? <span className="text-muted-foreground"> ({s.code})</span> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReviewLogDetailView({ log }: { log: ActivityLog }) {
  const p = tryParseReviewLog(log.newContent);
  if (!p) return <div className="text-xs text-muted-foreground italic">Không có dữ liệu chi tiết.</div>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5 bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800 rounded-md px-4 py-3">
        <div className="text-xs font-semibold text-sky-800 dark:text-sky-300 uppercase tracking-wide mb-1">Trạng thái nhận xét</div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${p.published ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
            {p.published ? "Đã công bố" : "Chưa công bố"}
          </span>
          <span className="text-xs text-muted-foreground">{p.students.length} học viên</span>
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Danh sách học viên</div>
        <div className="flex flex-col gap-1">
          {p.students.map((s, i) => (
            <div key={i} className="flex items-center gap-3 py-1 border-b border-border/40 last:border-0">
              <span className="text-xs font-medium">{s.name}{s.code ? <span className="text-muted-foreground font-normal"> ({s.code})</span> : null}</span>
              {s.sessionIndex != null && (
                <span className="text-xs text-muted-foreground">
                  Buổi {s.sessionIndex}
                  {s.sessionDate ? `, ${formatDeletedSessionDate(s.sessionDate)}` : ""}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ApplyCriteriaLogDetailView({ log }: { log: ActivityLog }) {
  const p = tryParseApplyCriteriaLog(log.newContent);
  if (!p) return <div className="text-xs text-muted-foreground italic">Không có dữ liệu chi tiết.</div>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5 bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 rounded-md px-4 py-3">
        <div className="text-xs font-semibold text-violet-800 dark:text-violet-300 uppercase tracking-wide mb-1">Thông tin gán tiêu chí</div>
        <div className="flex flex-wrap gap-x-8 gap-y-1">
          <div className="text-xs"><span className="text-muted-foreground">Tiêu chí: </span><span className="font-semibold text-violet-700">{p.criteriaName}</span></div>
          <div className="text-xs"><span className="text-muted-foreground">Từ buổi: </span><span className="font-medium">{p.fromSessionIndex}</span></div>
          <div className="text-xs"><span className="text-muted-foreground">Đến buổi: </span><span className="font-medium">{p.toSessionIndex}</span></div>
          <div className="text-xs"><span className="text-muted-foreground">Số buổi áp dụng: </span><span className="font-medium">{p.sessionCount}</span></div>
        </div>
      </div>
    </div>
  );
}

function ApplyScoreSheetLogDetailView({ log }: { log: ActivityLog }) {
  const p = tryParseApplyScoreSheetLog(log.newContent);
  if (!p) return <div className="text-xs text-muted-foreground italic">Không có dữ liệu chi tiết.</div>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-md px-4 py-3">
        <div className="text-xs font-semibold text-orange-800 dark:text-orange-300 uppercase tracking-wide mb-1">Thông tin gán bảng điểm</div>
        <div className="flex flex-wrap gap-x-8 gap-y-1">
          <div className="text-xs"><span className="text-muted-foreground">Bảng điểm: </span><span className="font-semibold text-orange-700">{p.scoreSheetName}</span></div>
          <div className="text-xs"><span className="text-muted-foreground">Từ buổi: </span><span className="font-medium">{p.fromSessionIndex}</span></div>
          <div className="text-xs"><span className="text-muted-foreground">Đến buổi: </span><span className="font-medium">{p.toSessionIndex}</span></div>
          <div className="text-xs"><span className="text-muted-foreground">Số buổi áp dụng: </span><span className="font-medium">{p.sessionCount}</span></div>
        </div>
      </div>
    </div>
  );
}

function OnlineLinkLogDetailView({ log }: { log: ActivityLog }) {
  const p = tryParseOnlineLinkLog(log.newContent);
  if (!p) return <div className="text-xs text-muted-foreground italic">Không có dữ liệu chi tiết.</div>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5 bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-800 rounded-md px-4 py-3">
        <div className="text-xs font-semibold text-cyan-800 dark:text-cyan-300 uppercase tracking-wide mb-1">Cập nhật link online</div>
        <div className="flex flex-col gap-2">
          <div className="text-xs">
            <span className="text-muted-foreground">Link cũ: </span>
            {log.oldContent ? (
              <a href={log.oldContent} target="_blank" rel="noopener noreferrer" className="text-cyan-600 underline break-all">{log.oldContent}</a>
            ) : (
              <span className="text-muted-foreground italic">Chưa có</span>
            )}
          </div>
          <div className="text-xs">
            <span className="text-muted-foreground">Link mới: </span>
            {p.link ? (
              <a href={p.link} target="_blank" rel="noopener noreferrer" className="text-cyan-600 underline break-all">{p.link}</a>
            ) : (
              <span className="text-muted-foreground italic">Đã xoá link</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChangeCycleLogDetailView({ log }: { log: ActivityLog }) {
  const parsed = tryParseChangeCycleLog(log.newContent);
  if (!parsed) return <div className="text-xs text-muted-foreground italic">Không có dữ liệu chi tiết.</div>;

  const modeLabel = (mode: string) => mode === "all" ? "Tất cả buổi (kể cả đã điểm danh)" : "Chỉ buổi chưa điểm danh";

  if (parsed.kind === "single") {
    const { data: d } = parsed;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-md px-4 py-3">
          <div className="text-xs font-semibold text-purple-800 dark:text-purple-300 uppercase tracking-wide mb-1">Thông tin đổi chu kỳ</div>
          <div className="flex flex-wrap gap-x-8 gap-y-1.5">
            <div className="text-xs">
              <span className="text-muted-foreground">Học viên: </span>
              <span className="font-semibold">{d.student.name}{d.student.code ? ` (${d.student.code})` : ""}</span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">Từ buổi: </span>
              <span className="font-medium">{d.fromSessionOrder}</span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">Chế độ: </span>
              <span className="font-medium">{modeLabel(d.mode)}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded bg-muted border text-muted-foreground">{d.oldWeekdays}</span>
            <span className="text-xs text-muted-foreground font-mono">─────►</span>
            <span className="text-xs px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900 border border-purple-300 dark:border-purple-700 font-semibold text-purple-700 dark:text-purple-300">{d.newWeekdays}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">Đã xóa <span className="font-medium text-red-600">{d.deleted}</span> buổi, tạo mới <span className="font-medium text-green-600">{d.created}</span> buổi.</div>
        </div>
      </div>
    );
  }

  const { data: d } = parsed;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-md px-4 py-3">
        <div className="text-xs font-semibold text-purple-800 dark:text-purple-300 uppercase tracking-wide mb-1">Đổi chu kỳ hàng loạt</div>
        <div className="flex flex-wrap gap-x-8 gap-y-1">
          <div className="text-xs"><span className="text-muted-foreground">Chế độ: </span><span className="font-medium">{modeLabel(d.mode)}</span></div>
          <div className="text-xs"><span className="text-muted-foreground">Tổng xóa: </span><span className="font-medium text-red-600">{d.totalDeleted}</span></div>
          <div className="text-xs"><span className="text-muted-foreground">Tổng tạo: </span><span className="font-medium text-green-600">{d.totalCreated}</span></div>
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Danh sách học viên ({d.students.length})</div>
        <div className="flex flex-col gap-0">
          {d.students.map((s, i) => (
            <div key={i} className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0 flex-wrap">
              <span className="text-xs font-medium min-w-[120px]">{s.name}{s.code ? <span className="text-muted-foreground font-normal"> ({s.code})</span> : null}</span>
              <span className="text-xs text-muted-foreground">Từ buổi {s.fromSessionOrder}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted border text-muted-foreground">{s.oldWeekdays}</span>
              <span className="text-xs text-muted-foreground font-mono">→</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900 border border-purple-300 dark:border-purple-700 font-semibold text-purple-700 dark:text-purple-300">{s.newWeekdays}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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

function tryParseMakeupLog(raw: string | null): MakeupLogPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "option" in parsed && Array.isArray(parsed.students)) {
      return parsed as MakeupLogPayload;
    }
  } catch {}
  return null;
}

function formatMakeupDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${parseInt(d)}/${parseInt(m)}/${y}`;
}

function formatMakeupSessionLine(s: MakeupSessionInfo): string {
  const wd = WEEKDAY_LABELS[s.weekday] ?? "";
  const date = formatMakeupDate(s.sessionDate);
  const time = s.startTime ? ` ${s.startTime}` : "";
  return `Buổi ${s.sessionIndex ?? "?"}, ${wd} ${date}${time}`;
}

function getMakeupOptionLabel(option: string): string {
  if (option === "current_class") return "Xếp bù vào lớp hiện tại";
  if (option === "other_class") return "Xếp bù sang lớp khác";
  if (option === "new_schedule") return "Tạo riêng lịch bù";
  return option;
}

function getMakeupSubOptionLabel(subOption: string | null): string {
  if (subOption === "specific_session") return "Buổi cụ thể";
  if (subOption === "end_of_schedule") return "Cuối lịch";
  return "";
}

function MakeupLogCell({ raw }: { raw: string | null }) {
  const payload = tryParseMakeupLog(raw);
  if (!payload) return <span className="text-muted-foreground italic">—</span>;

  const optionLabel = getMakeupOptionLabel(payload.option);
  const subOptionLabel = getMakeupSubOptionLabel(payload.subOption);

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold text-teal-700">
        {optionLabel}{subOptionLabel ? ` · ${subOptionLabel}` : ""}
      </span>
      <span className="text-xs text-muted-foreground">
        {payload.students.length} học viên
      </span>
      {payload.students.slice(0, 2).map((s, idx) => (
        <span key={idx} className="text-xs text-muted-foreground whitespace-nowrap">
          {s.name}{s.code ? ` (${s.code})` : ""}
          {s.fromSession ? `: ${formatMakeupSessionLine(s.fromSession)}` : ""}
          {s.toSession ? ` → ${formatMakeupSessionLine(s.toSession)}` : ""}
        </span>
      ))}
      {payload.students.length > 2 && (
        <span className="text-xs text-muted-foreground italic">+{payload.students.length - 2} học viên khác...</span>
      )}
    </div>
  );
}

function MakeupLogDetailView({ log }: { log: ActivityLog }) {
  const payload = tryParseMakeupLog(log.newContent);
  if (!payload) {
    return <div className="text-xs text-muted-foreground italic">Không có dữ liệu chi tiết.</div>;
  }

  const optionLabel = getMakeupOptionLabel(payload.option);
  const subOptionLabel = getMakeupSubOptionLabel(payload.subOption);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5 bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800 rounded-md px-4 py-3">
        <div className="text-xs font-semibold text-teal-800 dark:text-teal-300 uppercase tracking-wide mb-1">Thông tin xếp bù</div>
        <div className="flex flex-wrap gap-x-8 gap-y-1">
          <div className="text-xs">
            <span className="text-muted-foreground">Hình thức xếp bù: </span>
            <span className="font-medium">{optionLabel}</span>
          </div>
          {subOptionLabel && (
            <div className="text-xs">
              <span className="text-muted-foreground">Loại: </span>
              <span className="font-medium">{subOptionLabel}</span>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Danh sách học viên xếp bù ({payload.students.length} học viên)
        </div>
        {payload.students.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">Không có học viên nào.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {payload.students.map((s, idx) => (
              <div key={idx} className="border border-border/40 rounded-md px-3 py-2 bg-muted/20">
                <div className="text-xs font-semibold mb-1.5">
                  {s.name}{s.code ? ` (${s.code})` : ""}
                </div>
                <div className="flex items-start gap-2 flex-wrap">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Bù buổi</span>
                    <span className="text-[11px] font-medium text-foreground whitespace-nowrap">
                      {formatMakeupSessionLine(s.fromSession)}
                    </span>
                    {s.fromSession.className && (
                      <span className="text-[10px] text-muted-foreground">
                        Lớp {s.fromSession.className}{s.fromSession.classCode ? ` (${s.fromSession.classCode})` : ""}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground font-mono mt-4 shrink-0">───►</span>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Sang buổi</span>
                    {s.toSession ? (
                      <>
                        <span className="text-[11px] font-medium text-teal-700 dark:text-teal-400 whitespace-nowrap">
                          {formatMakeupSessionLine(s.toSession)}
                        </span>
                        {s.toSession.className && (
                          <span className="text-[10px] text-muted-foreground">
                            Lớp {s.toSession.className}{s.toSession.classCode ? ` (${s.toSession.classCode})` : ""}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic">
                        {payload.option === "end_of_schedule" ? "Cuối lịch học" : payload.option === "new_schedule" ? "Lịch bù mới" : "—"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatVND(amount: number | null | undefined): string {
  if (amount == null || isNaN(amount)) return "—";
  return new Intl.NumberFormat("vi-VN").format(Math.round(amount)) + "đ";
}

function formatTransferDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${parseInt(d)}/${parseInt(m)}/${y}`;
}

function tryParseTransferClassLog(raw: string | null): TransferClassLogPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "student" in parsed && "sessions" in parsed) {
      return parsed as TransferClassLogPayload;
    }
  } catch {}
  return null;
}

function tryParseTuitionPackageLog(raw: string | null): TuitionPackageLogPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "newPackage" in parsed && Array.isArray(parsed.students)) {
      return parsed as TuitionPackageLogPayload;
    }
  } catch {}
  return null;
}

function TransferClassLogCell({ raw }: { raw: string | null }) {
  const payload = tryParseTransferClassLog(raw);
  if (!payload) return <span className="text-muted-foreground italic">—</span>;
  const { student, fromClass, toClass, sessions } = payload;
  const firstPair = sessions[0];
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold text-yellow-800">
        {student.name}{student.code ? ` (${student.code})` : ""}
      </span>
      <span className="text-xs text-muted-foreground">
        {fromClass.name} → {toClass.name}
      </span>
      {firstPair && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          Buổi {firstPair.fromSessionIndex ?? "?"} ({formatTransferDate(firstPair.fromSessionDate)})
          {" → "}Buổi {firstPair.toSessionIndex ?? "?"} ({formatTransferDate(firstPair.toSessionDate)})
        </span>
      )}
      {sessions.length > 1 && (
        <span className="text-xs text-muted-foreground italic">+{sessions.length - 1} buổi nữa</span>
      )}
    </div>
  );
}

function TransferClassLogDetailView({ log }: { log: ActivityLog }) {
  const payload = tryParseTransferClassLog(log.newContent);
  if (!payload) return <div className="text-xs text-muted-foreground italic">Không có dữ liệu chi tiết.</div>;
  const { student, fromClass, toClass, fromSessionIndex, toSessionIndex, transferCount, sessions } = payload;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-md px-4 py-3">
        <div className="text-xs font-semibold text-yellow-800 dark:text-yellow-300 uppercase tracking-wide mb-1">Thông tin chuyển lớp</div>
        <div className="flex flex-wrap gap-x-8 gap-y-1">
          <div className="text-xs"><span className="text-muted-foreground">Học viên: </span><span className="font-semibold">{student.name}{student.code ? ` (${student.code})` : ""}</span></div>
          <div className="text-xs"><span className="text-muted-foreground">Số buổi chuyển: </span><span className="font-medium">{transferCount}</span></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="border border-border/60 rounded-md p-3 bg-red-50/30 dark:bg-red-950/10">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Lớp cũ</div>
          <div className="text-sm font-semibold text-foreground">{fromClass.name}</div>
          {fromClass.classCode && <div className="text-[10px] text-muted-foreground">{fromClass.classCode}</div>}
          <div className="text-xs text-muted-foreground mt-1">Từ buổi <span className="font-medium text-foreground">{fromSessionIndex}</span></div>
        </div>
        <div className="border border-border/60 rounded-md p-3 bg-green-50/30 dark:bg-green-950/10">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Lớp mới</div>
          <div className="text-sm font-semibold text-foreground">{toClass.name}</div>
          {toClass.classCode && <div className="text-[10px] text-muted-foreground">{toClass.classCode}</div>}
          <div className="text-xs text-muted-foreground mt-1">Từ buổi <span className="font-medium text-foreground">{toSessionIndex}</span></div>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Chi tiết buổi học ({sessions.length} buổi)</div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/40">
              <th className="border border-border/40 px-2 py-1 text-left font-medium text-muted-foreground">STT</th>
              <th className="border border-border/40 px-2 py-1 text-left font-medium text-muted-foreground">Buổi cũ</th>
              <th className="border border-border/40 px-2 py-1 text-left font-medium text-muted-foreground">Ngày cũ</th>
              <th className="border border-border/40 px-2 py-1 text-center font-medium text-muted-foreground">→</th>
              <th className="border border-border/40 px-2 py-1 text-left font-medium text-muted-foreground">Buổi mới</th>
              <th className="border border-border/40 px-2 py-1 text-left font-medium text-muted-foreground">Ngày mới</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((pair, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                <td className="border border-border/40 px-2 py-1 text-center text-muted-foreground">{idx + 1}</td>
                <td className="border border-border/40 px-2 py-1 font-medium">Buổi {pair.fromSessionIndex ?? "?"}</td>
                <td className="border border-border/40 px-2 py-1 text-muted-foreground whitespace-nowrap">
                  {WEEKDAY_LABELS[pair.fromWeekday] ?? ""} {formatTransferDate(pair.fromSessionDate)}
                </td>
                <td className="border border-border/40 px-2 py-1 text-center text-muted-foreground">→</td>
                <td className="border border-border/40 px-2 py-1 font-medium text-yellow-700 dark:text-yellow-400">Buổi {pair.toSessionIndex ?? "?"}</td>
                <td className="border border-border/40 px-2 py-1 text-muted-foreground whitespace-nowrap">
                  {WEEKDAY_LABELS[pair.toWeekday] ?? ""} {formatTransferDate(pair.toSessionDate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TuitionPackageLogCell({ raw }: { raw: string | null }) {
  const payload = tryParseTuitionPackageLog(raw);
  if (!payload) return <span className="text-muted-foreground italic">—</span>;
  const { newPackage, fromSessionIndex, toSessionIndex, students } = payload;
  return (
    <div className="flex flex-col gap-0.5">
      {newPackage && (
        <span className="text-[11px] font-semibold text-amber-700">
          {newPackage.name} · {formatVND(newPackage.sessionPrice)}/buổi
        </span>
      )}
      <span className="text-xs text-muted-foreground">
        Buổi {fromSessionIndex}–{toSessionIndex} · {students.length} học viên
      </span>
      {students.slice(0, 2).map((s, idx) => (
        <span key={idx} className="text-xs text-muted-foreground whitespace-nowrap">
          {s.name}{s.code ? ` (${s.code})` : ""}
          {s.oldSessionPrice != null && newPackage
            ? `: ${formatVND(s.oldSessionPrice)} → ${formatVND(newPackage.sessionPrice)}/buổi`
            : ""}
        </span>
      ))}
      {students.length > 2 && (
        <span className="text-xs text-muted-foreground italic">+{students.length - 2} học viên khác...</span>
      )}
    </div>
  );
}

function TuitionPackageLogDetailView({ log }: { log: ActivityLog }) {
  const payload = tryParseTuitionPackageLog(log.newContent);
  if (!payload) return <div className="text-xs text-muted-foreground italic">Không có dữ liệu chi tiết.</div>;
  const { newPackage, fromSessionIndex, toSessionIndex, className, classCode, students } = payload;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md px-4 py-3">
        <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wide">Gói học phí mới</div>
        {newPackage ? (
          <div className="flex flex-wrap gap-x-8 gap-y-1">
            <div className="text-xs"><span className="text-muted-foreground">Tên gói: </span><span className="font-semibold">{newPackage.name}</span></div>
            <div className="text-xs"><span className="text-muted-foreground">Loại: </span><span className="font-medium">{newPackage.type === "buổi" ? "Theo buổi" : "Theo khoá"}</span></div>
            <div className="text-xs"><span className="text-muted-foreground">Học phí: </span><span className="font-medium">{formatVND(newPackage.fee)}{newPackage.type === "khoá" && newPackage.sessions ? ` / ${newPackage.sessions} buổi` : ""}</span></div>
            <div className="text-xs"><span className="text-muted-foreground">Giá/buổi: </span><span className="font-semibold text-amber-700 dark:text-amber-400">{formatVND(newPackage.sessionPrice)}</span></div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground italic">Không có thông tin gói mới</span>
        )}
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-amber-200/60 pt-2 mt-1">
          <div className="text-xs"><span className="text-muted-foreground">Lớp: </span><span className="font-medium">{className}{classCode ? ` (${classCode})` : ""}</span></div>
          <div className="text-xs"><span className="text-muted-foreground">Khoảng buổi: </span><span className="font-medium">Buổi {fromSessionIndex} – {toSessionIndex}</span></div>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Danh sách học viên ({students.length} học viên)
        </div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/40">
              <th className="border border-border/40 px-2 py-1 text-left font-medium text-muted-foreground">Học viên</th>
              <th className="border border-border/40 px-2 py-1 text-left font-medium text-muted-foreground">Gói cũ</th>
              <th className="border border-border/40 px-2 py-1 text-right font-medium text-muted-foreground">Giá cũ/buổi</th>
              <th className="border border-border/40 px-2 py-1 text-center font-medium text-muted-foreground">→</th>
              <th className="border border-border/40 px-2 py-1 text-right font-medium text-amber-700 dark:text-amber-400">Giá mới/buổi</th>
              <th className="border border-border/40 px-2 py-1 text-center font-medium text-muted-foreground">Số buổi</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                <td className="border border-border/40 px-2 py-1">
                  <div className="font-medium">{s.name}</div>
                  {s.code && <div className="text-[10px] text-muted-foreground">{s.code}</div>}
                </td>
                <td className="border border-border/40 px-2 py-1 text-muted-foreground">
                  {s.oldPackageName ?? <span className="italic">—</span>}
                  {s.oldPackageType && <span className="text-[10px] ml-1">({s.oldPackageType})</span>}
                </td>
                <td className="border border-border/40 px-2 py-1 text-right text-muted-foreground">
                  {s.oldSessionPrice != null ? formatVND(s.oldSessionPrice) : "—"}
                </td>
                <td className="border border-border/40 px-2 py-1 text-center text-muted-foreground">→</td>
                <td className="border border-border/40 px-2 py-1 text-right font-semibold text-amber-700 dark:text-amber-400">
                  {newPackage ? formatVND(newPackage.sessionPrice) : "—"}
                </td>
                <td className="border border-border/40 px-2 py-1 text-center text-muted-foreground">{s.sessionCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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

      {/* Per-student extension breakdown */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Danh sách gia hạn theo học viên ({payload.students.length} học viên)
        </div>
        {payload.students.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">Không có học viên nào được gia hạn.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {payload.students.map((s, idx) => {
              const hasPerStudentData = s.fromSession !== undefined || (s.toSessions && s.toSessions.length > 0);
              return (
                <div key={idx} className="border border-border/40 rounded-md px-3 py-2 bg-muted/20">
                  {/* Student header */}
                  <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                    <span className="text-xs font-semibold">
                      {s.name}{s.code ? ` (${s.code})` : ""}
                    </span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded ${s.autoInvoice ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {s.autoInvoice ? "Hoá đơn tự động" : "Không tự động"}
                    </span>
                  </div>
                  {/* From → To sessions */}
                  {hasPerStudentData ? (
                    <div className="flex items-start gap-1.5 flex-wrap">
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                        Gia hạn từ:
                      </span>
                      <span className="text-[11px] font-medium text-foreground whitespace-nowrap">
                        {s.fromSession
                          ? formatExtensionSessionLine(s.fromSession)
                          : "—"}
                      </span>
                      <span className="text-[11px] text-muted-foreground font-mono shrink-0">───►</span>
                      <span className="text-[11px] text-orange-700 dark:text-orange-400 font-medium">
                        {(s.toSessions && s.toSessions.length > 0)
                          ? s.toSessions.map(ts => formatExtensionSessionLine(ts)).join(";  ")
                          : "—"}
                      </span>
                    </div>
                  ) : (
                    /* Fallback for old logs without per-student data */
                    <div className="flex items-start gap-1.5 flex-wrap">
                      <span className="text-[11px] text-muted-foreground italic">
                        {payload.sessions.length > 0
                          ? `Gia hạn thêm ${payload.sessions.length} buổi`
                          : "Không có dữ liệu chi tiết"}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New class sessions summary (collapsed under chevron for reference) */}
      {payload.sessions.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            Các buổi lớp được tạo thêm ({payload.sessions.length} buổi)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {payload.sessions.map((s, idx) => (
              <span key={idx} className="text-[11px] font-medium text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded px-1.5 py-0.5 whitespace-nowrap">
                {formatExtensionSessionLine(s)}
              </span>
            ))}
          </div>
        </div>
      )}
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
  if (log.action === "Xếp bù") {
    const payload = tryParseMakeupLog(raw);
    return payload ? Math.max(payload.students.length + 1, 2) : 1;
  }
  if (log.action === "Chuyển lớp") {
    const payload = tryParseTransferClassLog(raw);
    return payload ? Math.max(payload.sessions.length + 2, 3) : 1;
  }
  if (log.action === "Đổi gói học phí") {
    const payload = tryParseTuitionPackageLog(raw);
    return payload ? Math.max(payload.students.length + 2, 3) : 1;
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

  if (log.action === "Xếp bù") {
    if (field === "oldContent") return <span className="text-muted-foreground italic">—</span>;
    return <MakeupLogCell raw={raw} />;
  }

  if (log.action === "Chuyển lớp") {
    if (field === "oldContent") return <span className="text-muted-foreground italic">—</span>;
    return <TransferClassLogCell raw={raw} />;
  }

  if (log.action === "Đổi gói học phí") {
    if (field === "oldContent") return <span className="text-muted-foreground italic">—</span>;
    return <TuitionPackageLogCell raw={raw} />;
  }

  if (log.action === "Xoá học viên khỏi buổi") {
    if (field === "oldContent") return <span className="text-muted-foreground italic">—</span>;
    return <RemoveStudentLogCell raw={raw} />;
  }

  if (log.action === "Nhận xét học viên") {
    if (field === "oldContent") return <span className="text-muted-foreground italic">—</span>;
    return <ReviewLogCell raw={raw} />;
  }

  if (log.action === "Gán tiêu chí") {
    if (field === "oldContent") return <span className="text-muted-foreground italic">—</span>;
    return <ApplyCriteriaLogCell raw={raw} />;
  }

  if (log.action === "Gán bảng điểm") {
    if (field === "oldContent") return <span className="text-muted-foreground italic">—</span>;
    return <ApplyScoreSheetLogCell raw={raw} />;
  }

  if (log.action === "Gán link online") {
    if (field === "oldContent") {
      return raw ? <span className="text-xs text-muted-foreground break-all">{raw}</span> : <span className="text-muted-foreground italic">Chưa có</span>;
    }
    return <OnlineLinkLogCell raw={raw} />;
  }

  if (log.action === "Đổi chu kỳ") {
    if (field === "oldContent") return <span className="text-muted-foreground italic">—</span>;
    return <ChangeCycleLogCell raw={raw} />;
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

function EducationConfigDetailView({ log }: { log: ActivityLog }) {
  const parse = (raw: string | null) => {
    if (!raw) return {};
    try { return JSON.parse(raw) as Record<string, unknown>; } catch { return { "Nội dung": raw }; }
  };
  const oldValue = parse(log.oldContent);
  const newValue = parse(log.newContent);
  const isPermissionLog = log.action === "settings.permission.updated";
  if (isPermissionLog) {
    const oldPermissions = Array.isArray(oldValue.permissions) ? oldValue.permissions as Record<string, unknown>[] : [];
    const newPermissions = Array.isArray(newValue.permissions) ? newValue.permissions as Record<string, unknown>[] : [];
    const permissionRows = Array.from(new Set([
      ...oldPermissions.map(permission => String(permission.resource ?? "")),
      ...newPermissions.map(permission => String(permission.resource ?? "")),
    ])).filter(Boolean).map(resource => ({
      resource,
      oldValue: oldPermissions.find(permission => permission.resource === resource) ?? {},
      newValue: newPermissions.find(permission => permission.resource === resource) ?? {},
    }));
    const permissionLabels: Record<string, string> = {
      canView: "Xem", canViewAll: "Xem all", canCreate: "Thêm", canEdit: "Sửa", canDelete: "Xoá",
    };
    const roleContext = newValue.roleName || oldValue.roleName || "Không rõ role";
    const departmentContext = newValue.departmentName || oldValue.departmentName || "Không rõ phòng ban";
    return permissionRows.length === 0
      ? <p className="text-xs italic text-slate-400">Không có quyền thay đổi.</p>
      : <div className="overflow-x-auto rounded-lg border border-slate-200 p-3">
          <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 rounded-md bg-slate-50 px-3 py-2 text-xs">
            <span><b className="text-slate-500">Phòng ban:</b> <span className="font-semibold text-slate-700">{departmentContext}</span></span>
            <span><b className="text-slate-500">Role:</b> <span className="font-semibold text-slate-700">{roleContext}</span></span>
          </div>
          <div className="mb-2 text-[11px] text-slate-500">
            <span className="font-semibold text-red-600">Dữ liệu cũ</span>
            <span className="px-1">|</span>
            <span className="font-semibold text-emerald-600">Dữ liệu mới</span>
          </div>
          <table className="w-full min-w-[680px] text-xs">
            <thead><tr className="border-b bg-slate-50 text-left">
              <th className="px-3 py-2 font-semibold text-slate-500">Tiêu đề</th>
              {Object.entries(permissionLabels).map(([key, label]) => <th key={key} className="px-3 py-2 text-center font-semibold text-slate-500">{label}</th>)}
            </tr></thead>
            <tbody>{permissionRows.map(row => (
              <tr key={row.resource} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium text-slate-600">{permissionResourceLabels[row.resource] ?? row.resource}</td>
                {Object.keys(permissionLabels).map(key => (
                  <td key={key} className="whitespace-nowrap px-3 py-2 text-center">
                    <span className={row.oldValue[key] ? "font-semibold text-red-600" : "text-red-300"}>{row.oldValue[key] ? "Có" : "Không"}</span>
                    <span className="px-1 text-slate-300">|</span>
                    <span className={row.newValue[key] ? "font-semibold text-emerald-700" : "text-emerald-300"}>{row.newValue[key] ? "Có" : "Không"}</span>
                  </td>
                ))}
              </tr>
            ))}</tbody>
          </table>
        </div>;
  }
  // IDs and timestamps are implementation details, not business information.
  // Hide every relation key as well (criteriaId, scoreSheetId, ...), including
  // keys introduced by a new education-config entity.
  const hiddenKeys = new Set(["id", "createdAt", "updatedAt", "locationId", "categoryId", "scoreSheetId", "criteriaId", "roleIds", "staffId", "userId", "order"]);
  const keys = Array.from(new Set([...Object.keys(oldValue), ...Object.keys(newValue)]))
    .filter(key => !hiddenKeys.has(key) && !/Id$/.test(key));
  const labels: Record<string, string> = {
    name: "Tên", locationName: "Cơ sở", capacity: "Sức chứa", startTime: "Giờ bắt đầu",
    endTime: "Giờ kết thúc", status: "Trạng thái", note: "Ghi chú", attendanceStatus: "Trạng thái điểm danh",
    deductsFee: "Trừ học phí", earlyEntryMinutes: "Cho vào sớm (phút)",
    lateEntryMinutes: "Cho vào muộn (phút)", earlyEndMinutes: "Kết thúc sớm (phút)",
    beforeDays: "Số ngày giới hạn trước", beforeHours: "Số giờ giới hạn trước",
    beforeMinutes: "Số phút giới hạn trước", afterDays: "Số ngày giới hạn sau",
    afterHours: "Số giờ giới hạn sau", afterMinutes: "Số phút giới hạn sau",
    roleNames: "Vai trò áp dụng", items: "Các mục điểm", categoryName: "Danh mục điểm", formula: "Công thức", code: "Mã",
    description: "Mô tả", title: "Tiêu đề", enabled: "Đã bật", isActive: "Đang hoạt động",
  };
  const fieldLabel = (key: string) => labels[key] ?? "Thông tin cấu hình";
  const isId = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value);
  const display = (key: string, value: unknown): string => {
    if (value == null || value === "") return "—";
    if (key === "roleNames" && Array.isArray(value) && value.length === 0) return "Tất cả vai trò";
    if (typeof value === "boolean") return value ? "Có" : "Không";
    if (key === "status" && value === "active") return "Đang hoạt động";
    if (key === "status" && value === "inactive") return "Không hoạt động";
    if (key === "attendanceStatus") {
      const statuses: Record<string, string> = {
        pending: "Chưa điểm danh", present: "Có học", absent: "Nghỉ học",
        makeup_wait: "Nghỉ chờ bù", makeup: "Học bù",
      };
      return statuses[String(value)] ?? String(value);
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return "—";
      if (value.every(isId)) return `Đã chọn ${value.length} mục`;
      if (key === "items") {
        return value.map((item, index) => {
          if (!item || typeof item !== "object") return `Danh mục ${index + 1}: ${display(key, item)}`;
          const entry = item as Record<string, unknown>;
          return `${entry.categoryName ?? `Danh mục ${index + 1}`}${entry.formula ? ` — Công thức: ${entry.formula}` : ""}`;
        }).join("\n");
      }
      return value.map(item => display(key, item)).join(", ");
    }
    if (typeof value === "object") {
      const entries: string[] = Object.entries(value as Record<string, unknown>)
        .filter(([nestedKey]) => !hiddenKeys.has(nestedKey) && !/Id$/.test(nestedKey))
        .map(([nestedKey, nestedValue]) => `${fieldLabel(nestedKey)}: ${display(nestedKey, nestedValue)}`);
      return entries.length ? entries.join(" · ") : "Đã cấu hình";
    }
    if (isId(value)) return "Đã cấu hình";
    return String(value);
  };
  return keys.length === 0 ? <p className="text-xs italic text-slate-400">Không có dữ liệu chi tiết.</p> : (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full text-xs">
        <thead><tr className="border-b bg-slate-50 text-left">
          <th className="w-[28%] px-3 py-2 font-semibold text-slate-500">Trường thông tin</th>
          <th className="w-[36%] px-3 py-2 font-semibold text-red-600">Nội dung cũ</th>
          <th className="w-[36%] px-3 py-2 font-semibold text-emerald-600">Nội dung mới</th>
        </tr></thead>
        <tbody>{keys.map(key => (
          <tr key={key} className="border-b last:border-0">
            <td className="px-3 py-2 font-medium text-slate-600">{fieldLabel(key)}</td>
            <td className="whitespace-pre-line px-3 py-2 text-red-700">{display(key, oldValue[key])}</td>
            <td className="whitespace-pre-line px-3 py-2 font-medium text-emerald-700">{display(key, newValue[key])}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/** Popup dialog showing full old + new content for a log entry */
export function LogDetailDialog({ log, open, onOpenChange }: { log: ActivityLog; open: boolean; onOpenChange: (v: boolean) => void }) {
  const isUpdateCycle = log.action === "Cập nhật chu kỳ" || log.action === "Loại trừ ngày";
  const isAttendance = log.action === "Điểm danh" || log.action === "Điểm danh hàng loạt";
  const isExtension = log.action === "Gia hạn";
  const isMakeup = log.action === "Xếp bù";
  const isTransferClass = log.action === "Chuyển lớp";
  const isTuitionPackage = log.action === "Đổi gói học phí";
  const isRemoveStudent = log.action === "Xoá học viên khỏi buổi";
  const isReview = log.action === "Nhận xét học viên";
  const isApplyCriteria = log.action === "Gán tiêu chí";
  const isApplyScoreSheet = log.action === "Gán bảng điểm";
  const isOnlineLink = log.action === "Gán link online";
  const isChangeCycle = log.action === "Đổi chu kỳ";
  const isEducationConfig = log.action.startsWith("education_config.") || log.action.startsWith("settings.");
  const permissionContext = (() => {
    if (log.action !== "settings.permission.updated") return null;
    try {
      const value = JSON.parse(log.newContent || log.oldContent || "{}");
      return `${value.roleName || "Không rõ role"} · ${value.departmentName || "Không rõ phòng ban"}`;
    } catch {
      return "Không rõ role · Không rõ phòng ban";
    }
  })();
  const educationActionLabel = (() => {
    if (!isEducationConfig) return log.action;
    const [, resource, action] = log.action.split(".");
    const resourceLabels: Record<string, string> = {
      classroom: "Phòng học", subject: "Bộ môn", evaluation_criteria: "Tiêu chí đánh giá",
      evaluation_sub_criteria: "Tiêu chí con", shift: "Ca học", attendance_fee: "Trừ học phí",
      attendance_limit: "Giới hạn điểm danh",
      score_category: "Danh mục điểm", score_sheet: "Bảng điểm", online_learning: "Học online",
      location: "Cơ sở", department: "Phòng ban", role: "Vai trò",
      permission: "Quản lý phân quyền", holiday: "Ngày nghỉ lễ",
    };
     const actionLabels: Record<string, string> = { created: "Thêm", updated: "Sửa", deleted: "Xóa" };
     if (resource === "attendance_fee") {
      try {
        const payload = JSON.parse(log.newContent || log.oldContent || "{}");
        if (["beforeDays", "beforeHours", "beforeMinutes", "afterDays", "afterHours", "afterMinutes"].some(key => key in payload)) {
          return `${actionLabels[action] ?? action} Giới hạn điểm danh`;
        }
      } catch { /* keep the resource label */ }
    }
    return `${actionLabels[action] ?? action} ${resourceLabels[resource] ?? resource}`;
  })();
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
              {educationActionLabel}
            </span>
            <span>{formatDate(log.createdAt)}</span>
            {log.userName && <span>{log.userName}</span>}
            {permissionContext && <span className="font-semibold text-slate-700">Phân quyền: {permissionContext}</span>}
          </div>
        </DialogHeader>
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-4 overflow-x-auto">
            {isEducationConfig ? (
              <EducationConfigDetailView log={log} />
            ) : isUpdateCycle ? (
              <UpdateCycleDetailView log={log} />
            ) : isAttendance ? (
              <AttendanceLogDetailView log={log} />
            ) : isExtension ? (
              <ExtensionLogDetailView log={log} />
            ) : isMakeup ? (
              <MakeupLogDetailView log={log} />
            ) : isTransferClass ? (
              <TransferClassLogDetailView log={log} />
            ) : isTuitionPackage ? (
              <TuitionPackageLogDetailView log={log} />
            ) : isRemoveStudent ? (
              <RemoveStudentLogDetailView log={log} />
            ) : isReview ? (
              <ReviewLogDetailView log={log} />
            ) : isApplyCriteria ? (
              <ApplyCriteriaLogDetailView log={log} />
            ) : isApplyScoreSheet ? (
              <ApplyScoreSheetLogDetailView log={log} />
            ) : isOnlineLink ? (
              <OnlineLinkLogDetailView log={log} />
            ) : isChangeCycle ? (
              <ChangeCycleLogDetailView log={log} />
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

export function buildActionSummary(log: ActivityLog): string {
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
    case "Xếp bù": return `Xếp bù${classPart}`;
    case "Chuyển lớp": return `Chuyển lớp${classPart}`;
    case "Đổi gói học phí": return `Đổi gói học phí${classPart}`;
    case "Điểm danh": return `Điểm danh${classPart}`;
    case "Điểm danh hàng loạt": return `Điểm danh hàng loạt${classPart}`;
    case "Gia hạn": return `Gia hạn${classPart}`;
    case "Thêm mới lớp": return `Thêm mới lớp${classPart}`;
    case "Chỉnh sửa lớp": return `Chỉnh sửa${classPart}`;
    case "Xoá lớp": return `Xoá lớp${classPart}`;
    case "Xoá học viên khỏi buổi": {
      const p = tryParseRemoveStudentLog(log.newContent);
      const range = p ? ` buổi ${p.fromSessionIndex}${p.fromSessionIndex !== p.toSessionIndex ? `→${p.toSessionIndex}` : ""}` : "";
      return `Xoá học viên khỏi buổi${range}${classPart}`;
    }
    case "Nhận xét học viên": {
      const p = tryParseReviewLog(log.newContent);
      const status = p ? (p.published ? " (Công bố)" : " (Chưa công bố)") : "";
      return `Nhận xét học viên${status}${classPart}`;
    }
    case "Gán tiêu chí": {
      const p = tryParseApplyCriteriaLog(log.newContent);
      return `Gán tiêu chí${p ? `: ${p.criteriaName}` : ""}${classPart}`;
    }
    case "Gán bảng điểm": {
      const p = tryParseApplyScoreSheetLog(log.newContent);
      return `Gán bảng điểm${p ? `: ${p.scoreSheetName}` : ""}${classPart}`;
    }
    case "Gán link online": return `Cập nhật link online${classPart}`;
    case "Đổi chu kỳ": {
      const p = tryParseChangeCycleLog(log.newContent);
      if (!p) return `Đổi chu kỳ${classPart}`;
      if (p.kind === "single") return `Đổi chu kỳ: ${p.data.student.name}${classPart}`;
      return `Đổi chu kỳ hàng loạt: ${p.data.students.length} học viên${classPart}`;
    }
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
  const [locationFilter, setLocationFilter] = useState("all");
  const [timeRange, setTimeRange] = useState<LogTimeRange>("all");
  const [classFilter, setClassFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [detailLog, setDetailLog] = useState<ActivityLog | null>(null);
  const { data: locations = [] } = useLocations();

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

  const classOptions = useMemo(() => {
    const values = new Map<string, string>();
    logs.forEach(log => {
      if (log.classId && log.className) values.set(log.classId, log.className);
    });
    return Array.from(values.entries()).sort((a, b) => a[1].localeCompare(b[1], "vi"));
  }, [logs]);

  const actionOptions = useMemo(
    () => Array.from(new Set(actionFiltered.map(log => log.action))).sort((a, b) => a.localeCompare(b, "vi")),
    [actionFiltered],
  );

  const filtered = actionFiltered.filter((log) => {
    if (locationFilter !== "all" && log.locationId !== locationFilter) return false;
    if (classFilter !== "all" && log.classId !== classFilter) return false;
    if (actionFilter !== "all" && log.action !== actionFilter) return false;
    if (!isInTimeRange(log.createdAt, timeRange)) return false;
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
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const title = filterActions && filterActions.length > 0
    ? "Nhật ký Lịch học"
    : "Nhật ký hành động";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[90vw] max-w-[90vw] h-[min(88vh,760px)] max-h-[calc(100vh-2rem)] flex flex-col gap-0 p-0 rounded-2xl overflow-hidden border-slate-200 shadow-2xl">
          <DialogHeader className="flex flex-row items-center gap-3 px-5 py-3.5 border-b bg-gradient-to-r from-slate-50 to-slate-100/50 flex-shrink-0 text-left">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shadow-md shadow-slate-200 flex-shrink-0">
              <ScrollText className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-sm font-bold text-slate-800 leading-none">
                {title}
                {actionFiltered.length > 0 && (
                  <Badge variant="secondary" className="ml-2 align-middle text-[10px]">
                    {actionFiltered.length}
                  </Badge>
                )}
              </DialogTitle>
              <p className="text-[11px] text-slate-400 mt-1">
                Lịch sử thay đổi và thao tác trên lớp học
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
              aria-label="Đóng nhật ký"
            >
              <X className="w-4 h-4" />
            </button>
          </DialogHeader>

          <div className="px-5 py-3 border-b bg-white flex-shrink-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 items-end">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  Tìm kiếm nhật ký
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm kiếm..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className="pl-9 h-9 bg-white rounded-xl border-slate-200 text-xs"
                    data-testid="input-activity-log-search"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Cơ sở</label>
                <Select value={locationFilter} onValueChange={(value) => { setLocationFilter(value); setPage(1); }}>
                  <SelectTrigger className="h-9 bg-white rounded-xl border-slate-200 text-xs" data-testid="select-log-location">
                    <SelectValue placeholder="Tất cả cơ sở" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả cơ sở</SelectItem>
                    {locations.map((location: any) => (
                      <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Thời gian</label>
                <Select value={timeRange} onValueChange={(value: LogTimeRange) => { setTimeRange(value); setPage(1); }}>
                  <SelectTrigger className="h-9 bg-white rounded-xl border-slate-200 text-xs" data-testid="select-log-time-range">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toàn thời gian</SelectItem>
                    <SelectItem value="today">Hôm nay</SelectItem>
                    <SelectItem value="7d">7 ngày qua</SelectItem>
                    <SelectItem value="30d">30 ngày qua</SelectItem>
                    <SelectItem value="thismonth">Tháng này</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Lớp học</label>
                <Select value={classFilter} onValueChange={(value) => { setClassFilter(value); setPage(1); }}>
                  <SelectTrigger className="h-9 bg-white rounded-xl border-slate-200 text-xs" data-testid="select-log-class">
                    <SelectValue placeholder="Tất cả lớp học" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả lớp học</SelectItem>
                    {classOptions.map(([id, name]) => (
                      <SelectItem key={id} value={id}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Hành động</label>
                <Select value={actionFilter} onValueChange={(value) => { setActionFilter(value); setPage(1); }}>
                  <SelectTrigger className="h-9 bg-white rounded-xl border-slate-200 text-xs" data-testid="select-log-action">
                    <SelectValue placeholder="Tất cả hành động" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả hành động</SelectItem>
                    {actionOptions.map(action => (
                      <SelectItem key={action} value={action}>{action}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0 bg-slate-50/40">
            <div className="p-4">
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-xl" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                    <ScrollText className="w-7 h-7 text-slate-300" />
                  </div>
                  <p className="text-sm text-slate-400 font-medium">
                    {search ? "Không tìm thấy kết quả phù hợp." : "Chưa có nhật ký nào."}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl bg-white border border-slate-100 overflow-hidden shadow-sm">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs bg-slate-50/80">
                        <TableHead className="w-[160px] py-2.5">Người dùng</TableHead>
                        <TableHead className="w-[140px] py-2.5">Cơ sở</TableHead>
                        <TableHead className="w-[160px] py-2.5 whitespace-nowrap">Thời gian</TableHead>
                        <TableHead className="w-[150px] py-2.5">Hành động</TableHead>
                        <TableHead className="w-[150px] py-2.5">Lớp học</TableHead>
                        <TableHead className="py-2.5">Mô tả</TableHead>
                        <TableHead className="w-[60px] py-2.5 text-center">Xem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginated.map((log) => (
                        <TableRow
                          key={log.id}
                          className="text-xs"
                          data-testid={`row-activity-log-${log.id}`}
                        >
                          <TableCell className="py-2.5 font-medium">
                            {log.userName ?? (
                              <span className="text-muted-foreground italic">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2.5">
                            {log.locationName ?? (
                              <span className="text-muted-foreground italic">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2.5 text-muted-foreground whitespace-nowrap">
                            {formatDate(log.createdAt)}
                          </TableCell>
                          <TableCell className="py-2.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${getActionColor(log.action)}`}>
                              {log.action}
                            </span>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <ClassCell log={log} />
                          </TableCell>
                          <TableCell className="py-2.5 text-xs text-muted-foreground">
                            {buildActionSummary(log)}
                          </TableCell>
                          <TableCell className="py-2.5 text-center">
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
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="px-5 py-3 border-t bg-slate-50/80 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span>
                Tổng: <span className="font-semibold text-slate-700">{filtered.length}</span> bản ghi
              </span>
              <span className="text-slate-400">
                {filtered.length > 0
                  ? `· Hiển thị ${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filtered.length)}`
                  : "· Hiển thị 0"}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span>Số hàng:</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => { setPageSize(Number(value)); setPage(1); }}
                >
                  <SelectTrigger className="h-7 w-[76px] rounded-lg bg-white border-slate-200 text-[11px]" data-testid="select-log-page-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="200">200</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1 text-slate-500">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 rounded-lg bg-white"
                  disabled={safePage <= 1 || isLoading}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  aria-label="Trang trước"
                  data-testid="button-log-previous-page"
                >
                  ‹
                </Button>
                <span className="min-w-[54px] text-center">{safePage} / {totalPages}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 rounded-lg bg-white"
                  disabled={safePage >= totalPages || isLoading}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  aria-label="Trang sau"
                  data-testid="button-log-next-page"
                >
                  ›
                </Button>
              </div>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Thêm
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" /> Sửa
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500" /> Xoá
              </span>
            </div>
          </div>
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
