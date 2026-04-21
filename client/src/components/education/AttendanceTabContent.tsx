import { useState, useRef, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eye, CheckCircle2, XCircle, Clock, RefreshCw, PauseCircle, Circle, Download } from "lucide-react";
import * as XLSX from "xlsx";

interface AttendanceTabContentProps {
  classSessions: any[] | undefined;
  studentSessions: any[] | undefined;
  classData?: any;
  enrolledStudents?: any[] | undefined;
}

const CONTENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  "Bài học": { label: "Bài học", color: "text-blue-700" },
  "Bài tập về nhà": { label: "BTVN", color: "text-green-700" },
  "Giáo trình": { label: "Giáo trình", color: "text-purple-700" },
  "Bài kiểm tra": { label: "Bài kiểm tra", color: "text-red-700" },
  lesson: { label: "Bài học", color: "text-blue-700" },
  homework: { label: "BTVN", color: "text-green-700" },
  curriculum: { label: "Giáo trình", color: "text-purple-700" },
  test: { label: "Bài kiểm tra", color: "text-red-700" },
};

const CONTENT_TYPE_ORDER = ["Bài học", "lesson", "Giáo trình", "curriculum", "Bài tập về nhà", "homework", "Bài kiểm tra", "test"];

type StatusConfig = {
  label: string;
  Icon: React.ElementType;
  iconCls: string;
  textCls: string;
};

const ATTENDANCE_STATUS_CONFIG: Record<string, StatusConfig> = {
  present:      { label: "Học viên có học", Icon: CheckCircle2, iconCls: "text-green-500",  textCls: "text-green-700"  },
  absent:       { label: "Nghỉ học",        Icon: XCircle,      iconCls: "text-red-400",    textCls: "text-red-600"    },
  makeup_wait:  { label: "Nghỉ chờ bù",     Icon: Clock,        iconCls: "text-orange-400", textCls: "text-orange-600" },
  makeup_done:  { label: "Đã học bù",       Icon: RefreshCw,    iconCls: "text-blue-400",   textCls: "text-blue-600"   },
  paused:       { label: "Bảo lưu",         Icon: PauseCircle,  iconCls: "text-yellow-500", textCls: "text-yellow-700" },
  pending:      { label: "Chưa điểm danh",  Icon: Circle,       iconCls: "text-gray-300",   textCls: "text-gray-400"   },
};

const STATUS_LABEL_VI: Record<string, string> = {
  present:     "Có học",
  absent:      "Nghỉ học",
  makeup_wait: "Nghỉ chờ bù",
  makeup_done: "Đã học bù",
  paused:      "Bảo lưu",
  pending:     "Chưa điểm danh",
};

function exportAllSessionsToExcel(
  classSessions: any[],
  studentSessions: any[]
) {
  const rows = classSessions.map((session: any, index: number) => {
    const sessionStudents = studentSessions.filter((s) => s.classSessionId === session.id);
    const present     = sessionStudents.filter((s) => s.attendanceStatus === "present").length;
    const absent      = sessionStudents.filter((s) => s.attendanceStatus === "absent").length;
    const makeupWait  = sessionStudents.filter((s) => s.attendanceStatus === "makeup_wait").length;
    const makeupDone  = sessionStudents.filter((s) => s.attendanceStatus === "makeup_done").length;
    const paused      = sessionStudents.filter((s) => s.attendanceStatus === "paused").length;
    const pending     = sessionStudents.filter((s) => !s.attendanceStatus || s.attendanceStatus === "pending").length;
    const attended    = present + absent + makeupWait + makeupDone + paused;
    const total       = attended + pending;
    const contents    = (session.sessionContents || []).map((c: any) => c.title || c.name || "").filter(Boolean).join(", ");
    const teachers    = (session.teachers || []).map((t: any) => t.fullName).join(", ");

    return {
      "Buổi":             `Buổi ${index + 1}`,
      "Ngày":             format(new Date(session.sessionDate), "dd/MM/yyyy"),
      "Giờ":              session.shiftTemplate?.startTime || "",
      "Có học":           present,
      "Nghỉ học":         absent,
      "Nghỉ chờ bù":      makeupWait,
      "Đã học bù":        makeupDone,
      "Bảo lưu":          paused,
      "Chưa điểm danh":   pending,
      "Tổng":             `${attended}/${total}`,
      "Nội dung bài học": contents,
      "Giáo viên":        teachers,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 10 }, { wch: 14 }, { wch: 8 },
    { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 18 },
    { wch: 10 }, { wch: 40 }, { wch: 20 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Điểm danh");
  XLSX.writeFile(wb, `Bang_diem_danh.xlsx`);
}

function SessionContentsCell({ contents }: { contents: any[] }) {
  if (!contents || contents.length === 0) {
    return <span className="text-gray-400 text-xs">—</span>;
  }
  const grouped: Record<string, any[]> = {};
  for (const c of contents) {
    if (!grouped[c.contentType]) grouped[c.contentType] = [];
    grouped[c.contentType].push(c);
  }
  const sortedTypes = Object.keys(grouped).sort(
    (a, b) => CONTENT_TYPE_ORDER.indexOf(a) - CONTENT_TYPE_ORDER.indexOf(b)
  );
  return (
    <div className="text-xs space-y-1 min-w-[180px]">
      {sortedTypes.map((type) => {
        const meta = CONTENT_TYPE_LABELS[type] ?? { label: type, color: "text-foreground" };
        return (
          <div key={type}>
            <span className={`font-semibold ${meta.color}`}>{meta.label}:</span>
            {grouped[type].map((c: any, i: number) => (
              <div key={c.id} className="ml-1 text-foreground">{i + 1}.{c.title}</div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function AttendanceStatusCell({ status }: { status: string | undefined | null }) {
  if (!status) return <span className="text-gray-300 text-[10px]">—</span>;
  const cfg: StatusConfig = ATTENDANCE_STATUS_CONFIG[status] ?? {
    label: status, Icon: Circle, iconCls: "text-gray-300", textCls: "text-gray-400",
  };
  const { Icon, iconCls, textCls, label } = cfg;
  return (
    <div className={`inline-flex items-center gap-1 whitespace-nowrap ${textCls}`}>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${iconCls}`} />
      <span className="text-[11px] font-medium">{label}</span>
    </div>
  );
}

// ─── Column widths (px) ──────────────────────────────────────────────────────
const COL_STT = 44;
const COL_NAME = 176;
const COL_SESSION = 220;
const COL_TOTAL_DD = 100;
const COL_TOTAL_HV = 76;

function colStyle(w: number): React.CSSProperties {
  return { width: w, minWidth: w, maxWidth: w };
}

// Shared colgroup used in both header table and body table
function TableColgroup({ sessionCount }: { sessionCount: number }) {
  return (
    <colgroup>
      <col style={colStyle(COL_STT)} />
      <col style={colStyle(COL_NAME)} />
      {Array.from({ length: sessionCount }).map((_, i) => (
        <col key={i} style={colStyle(COL_SESSION)} />
      ))}
      <col style={colStyle(COL_TOTAL_DD)} />
      <col style={colStyle(COL_TOTAL_HV)} />
    </colgroup>
  );
}

// Sticky-left cell helpers
const stickySTT: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 10,
  backgroundColor: "inherit",
};
const stickyName: React.CSSProperties = {
  position: "sticky",
  left: COL_STT,
  zIndex: 10,
  backgroundColor: "inherit",
};
// Sticky-right cell helpers (last 2 columns always visible on right)
const stickyTotalDD: React.CSSProperties = {
  position: "sticky",
  right: COL_TOTAL_HV,
  zIndex: 10,
  backgroundColor: "inherit",
};
const stickyTotalHV: React.CSSProperties = {
  position: "sticky",
  right: 0,
  zIndex: 10,
  backgroundColor: "inherit",
};

function AttendanceOverviewModal({
  open,
  onClose,
  classSessions,
  studentSessions,
  classData,
  enrolledStudents,
}: {
  open: boolean;
  onClose: () => void;
  classSessions: any[];
  studentSessions: any[];
  classData?: any;
  enrolledStudents?: any[];
}) {
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);

  // Sync horizontal scroll: body drives header
  const onBodyScroll = useCallback(() => {
    if (headerScrollRef.current && bodyScrollRef.current) {
      headerScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const el = bodyScrollRef.current;
    if (!el) return;
    el.scrollLeft = 0;
    el.scrollTop = 0;
  }, [open]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const sortedSessions = [...classSessions].sort((a, b) => {
    const dA = new Date(a.sessionDate).getTime();
    const dB = new Date(b.sessionDate).getTime();
    return dA !== dB ? dA - dB : a.id.localeCompare(b.id);
  });

  const uniqueStudentsMap = new Map<string, { id: string; name: string; code: string }>();
  for (const ss of studentSessions) {
    if (!uniqueStudentsMap.has(ss.studentId)) {
      uniqueStudentsMap.set(ss.studentId, {
        id: ss.studentId,
        name: ss.studentName ?? "—",
        code: ss.studentCode ?? "",
      });
    }
  }
  if (enrolledStudents && enrolledStudents.length > 0) {
    for (const sc of enrolledStudents) {
      const student = sc.student ?? sc;
      const sId = student.id ?? sc.studentId;
      if (sId && !uniqueStudentsMap.has(sId)) {
        uniqueStudentsMap.set(sId, {
          id: sId,
          name: student.fullName ?? sc.fullName ?? "—",
          code: student.code ?? sc.code ?? sc.studentCode ?? "",
        });
      }
    }
  }
  const students = Array.from(uniqueStudentsMap.values());
  const totalSessions = sortedSessions.length;

  const getStatus = (studentId: string, sessionId: string): string | null => {
    const ss = studentSessions.find(
      (s) => s.studentId === studentId && s.classSessionId === sessionId
    );
    return ss ? (ss.attendanceStatus || "pending") : null;
  };

  const getAttendedCount = (studentId: string) =>
    studentSessions.filter(
      (s) => s.studentId === studentId &&
        (s.attendanceStatus === "present" || s.attendanceStatus === "makeup_done")
    ).length;

  const getDiemDanhCount = (studentId: string) =>
    studentSessions.filter(
      (s) => s.studentId === studentId &&
        s.attendanceStatus && s.attendanceStatus !== "pending"
    ).length;

  const getSiSo = (sessionId: string) => {
    const inSession = studentSessions.filter((s) => s.classSessionId === sessionId);
    const attended = inSession.filter(
      (s) => s.attendanceStatus === "present" || s.attendanceStatus === "makeup_done"
    ).length;
    return `${attended}/${inSession.length || students.length}`;
  };

  const weekdayLabel = (days: string[] | string | undefined) => {
    if (!days) return "";
    const arr = Array.isArray(days) ? days : [days];
    const map: Record<string, string> = {
      monday: "Thứ hai", tuesday: "Thứ ba", wednesday: "Thứ tư",
      thursday: "Thứ năm", friday: "Thứ sáu", saturday: "Thứ bảy", sunday: "Chủ nhật",
      "2": "Thứ hai", "3": "Thứ ba", "4": "Thứ tư",
      "5": "Thứ năm", "6": "Thứ sáu", "7": "Thứ bảy", "8": "Chủ nhật",
      "1": "Chủ nhật",
    };
    return arr.map((d) => map[d] ?? d).join(", ");
  };

  const totalTableWidth = COL_STT + COL_NAME + totalSessions * COL_SESSION + COL_TOTAL_DD + COL_TOTAL_HV;

  // ── Shared cell class helpers ─────────────────────────────────────────────
  const borderCell = "border-r border-b border-gray-200";
  const headerBg1 = "#ffffff";   // row 1 – Lịch học
  const headerBg2 = "#f8fafc";   // row 2 – Bài học
  const headerBg3 = "#f8fafc";   // row 3 – Giáo viên
  const headerBg4 = "#f1f5f9";   // row 4 – STT/Tên/dates

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="fixed inset-0 z-50 w-screen h-screen max-w-none max-h-none rounded-none flex flex-col p-0 gap-0"
        style={{ transform: "none" }}
      >
        {/* ── Dialog title bar ── */}
        <DialogHeader className="px-5 py-3 border-b border-gray-200 bg-white shrink-0">
          <DialogTitle className="text-sm font-semibold text-gray-800">Tổng quan điểm danh</DialogTitle>
          <div className="flex flex-wrap gap-x-6 gap-y-0.5 text-xs text-gray-500 mt-0.5">
            <span>
              <span className="font-medium text-gray-700">Lớp học:</span>{" "}
              {classData?.name ?? "—"}
            </span>
            <span>
              <span className="font-medium text-gray-700">Thời gian:</span>{" "}
              {weekdayLabel(classData?.scheduleDays ?? classData?.weekdays)}
            </span>
            <span>
              <span className="font-medium text-gray-700">Ngày bắt đầu:</span>{" "}
              {classData?.startDate ? format(new Date(classData.startDate), "dd-MM-yyyy") : "—"}
            </span>
          </div>
        </DialogHeader>

        {/* ── HEADER TABLE (frozen, no scrollbar) ── */}
        <div
          ref={headerScrollRef}
          className="overflow-hidden shrink-0 border-b border-gray-300"
          style={{ overflowX: "hidden" }}
        >
          <table
            style={{
              width: totalTableWidth,
              tableLayout: "fixed",
              borderCollapse: "separate",
              borderSpacing: 0,
              fontSize: 12,
            }}
          >
            <TableColgroup sessionCount={totalSessions} />
            <tbody>
              {/* ── Row 1: Lịch học + session numbers ── */}
              <tr style={{ backgroundColor: headerBg1 }}>
                <td
                  className={`${borderCell} border-l border-t px-2 py-2`}
                  style={{ ...stickySTT, backgroundColor: headerBg1 }}
                />
                <td
                  className={`${borderCell} border-t px-2 py-2 font-semibold text-gray-700`}
                  style={{ ...stickyName, backgroundColor: headerBg1 }}
                >
                  Lịch học
                </td>
                {sortedSessions.map((_, idx) => (
                  <td
                    key={idx}
                    className={`${borderCell} border-t px-1 py-2 text-center font-medium text-gray-700`}
                  >
                    {idx + 1}
                  </td>
                ))}
                <td
                  className={`${borderCell} border-t px-2 py-2 text-center text-[11px] font-semibold text-gray-600 whitespace-nowrap`}
                  style={{ ...stickyTotalDD, backgroundColor: headerBg1 }}
                >
                  Đã điểm danh
                </td>
                <td
                  className={`${borderCell} border-t px-2 py-2 text-center text-[11px] font-semibold text-gray-600 whitespace-nowrap`}
                  style={{ ...stickyTotalHV, backgroundColor: headerBg1 }}
                >
                  Đã học
                </td>
              </tr>

              {/* ── Row 2: Bài học (lesson content) ── */}
              <tr style={{ backgroundColor: headerBg2 }}>
                <td
                  className={`${borderCell} border-l px-2 py-1.5`}
                  style={{ ...stickySTT, backgroundColor: headerBg2 }}
                />
                <td
                  className={`${borderCell} px-2 py-1.5 font-semibold text-gray-600 text-[11px]`}
                  style={{ ...stickyName, backgroundColor: headerBg2 }}
                >
                  Bài học
                </td>
                {sortedSessions.map((session) => {
                  const allContents: any[] = session.sessionContents ?? [];
                  const grouped: Record<string, any[]> = {};
                  for (const c of allContents) {
                    if (!grouped[c.contentType]) grouped[c.contentType] = [];
                    grouped[c.contentType].push(c);
                  }
                  const sortedTypes = Object.keys(grouped).sort(
                    (a, b) => CONTENT_TYPE_ORDER.indexOf(a) - CONTENT_TYPE_ORDER.indexOf(b)
                  );
                  if (sortedTypes.length === 0) {
                    return (
                      <td key={session.id} className={`${borderCell} px-2 py-1.5 text-center`}>
                        <span className="text-gray-400 text-[11px]">—</span>
                      </td>
                    );
                  }
                  const lines: { label: string; color: string; title: string }[] = [];
                  for (const type of sortedTypes) {
                    const meta = CONTENT_TYPE_LABELS[type] ?? { label: type, color: "text-gray-700" };
                    for (const c of grouped[type]) {
                      lines.push({ label: meta.label, color: meta.color, title: c.title });
                    }
                  }
                  return (
                    <td key={session.id} className={`${borderCell} px-2 py-1.5 align-top`}>
                      <div className="space-y-1">
                        {lines.map((l, i) => (
                          <div
                            key={i}
                            title={`${l.label}: ${l.title}`}
                            className="line-clamp-2 text-[11px] leading-snug text-gray-700"
                          >
                            <span className={`font-semibold ${l.color}`}>{l.label}:</span>{" "}{l.title}
                          </div>
                        ))}
                      </div>
                    </td>
                  );
                })}
                <td className={`${borderCell} px-2 py-1.5`} style={{ ...stickyTotalDD, backgroundColor: headerBg2 }} />
                <td className={`${borderCell} px-2 py-1.5`} style={{ ...stickyTotalHV, backgroundColor: headerBg2 }} />
              </tr>

              {/* ── Row 3: Giáo viên ── */}
              <tr style={{ backgroundColor: headerBg3 }}>
                <td
                  className={`${borderCell} border-l px-2 py-1.5`}
                  style={{ ...stickySTT, backgroundColor: headerBg3 }}
                />
                <td
                  className={`${borderCell} px-2 py-1.5 font-semibold text-gray-600 text-[11px]`}
                  style={{ ...stickyName, backgroundColor: headerBg3 }}
                >
                  Giáo viên
                </td>
                {sortedSessions.map((session) => {
                  const teachers: any[] = session.teachers ?? [];
                  return (
                    <td key={session.id} className={`${borderCell} px-2 py-1.5 align-top`}>
                      {teachers.length > 0 ? (
                        <div className="space-y-0.5">
                          {teachers.map((t: any) => (
                            <div key={t.id} className="text-[11px] text-blue-600 font-medium leading-tight truncate">
                              {t.fullName}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-[11px]">—</span>
                      )}
                    </td>
                  );
                })}
                <td className={`${borderCell} px-2 py-1.5`} style={{ ...stickyTotalDD, backgroundColor: headerBg3 }} />
                <td className={`${borderCell} px-2 py-1.5`} style={{ ...stickyTotalHV, backgroundColor: headerBg3 }} />
              </tr>

              {/* ── Row 4: STT / Tên / Dates ── */}
              <tr style={{ backgroundColor: headerBg4 }}>
                <td
                  className={`${borderCell} border-l px-2 py-2 text-center font-semibold text-gray-700`}
                  style={{ ...stickySTT, backgroundColor: headerBg4 }}
                >
                  STT
                </td>
                <td
                  className={`${borderCell} px-2 py-2 font-semibold text-gray-700`}
                  style={{ ...stickyName, backgroundColor: headerBg4 }}
                >
                  Tên
                </td>
                {sortedSessions.map((session) => (
                  <td
                    key={session.id}
                    className={`${borderCell} px-1 py-2 text-center font-semibold text-gray-700 whitespace-nowrap`}
                  >
                    {format(new Date(session.sessionDate), "dd/MM")}
                  </td>
                ))}
                <td className={`${borderCell} px-2 py-2`} style={{ ...stickyTotalDD, backgroundColor: headerBg4 }} />
                <td className={`${borderCell} px-2 py-2`} style={{ ...stickyTotalHV, backgroundColor: headerBg4 }} />
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── BODY TABLE (scrollable) ── */}
        <div
          ref={bodyScrollRef}
          onScroll={onBodyScroll}
          className="overflow-auto flex-1"
        >
          <table
            style={{
              width: totalTableWidth,
              tableLayout: "fixed",
              borderCollapse: "separate",
              borderSpacing: 0,
              fontSize: 12,
            }}
          >
            <TableColgroup sessionCount={totalSessions} />
            <tbody>
              {students.map((student, idx) => {
                const attended = getAttendedCount(student.id);
                const diemDanh = getDiemDanhCount(student.id);
                return (
                  <tr
                    key={student.id}
                    className="hover:bg-blue-50 transition-colors"
                    style={{ backgroundColor: "white" }}
                  >
                    <td
                      className={`${borderCell} border-l px-2 py-2 text-center text-gray-700`}
                      style={{ ...stickySTT, backgroundColor: "inherit" }}
                    >
                      {idx + 1}
                    </td>
                    <td
                      className={`${borderCell} px-2 py-2 text-gray-800`}
                      style={{ ...stickyName, backgroundColor: "inherit" }}
                    >
                      <div className="flex flex-col leading-tight">
                        {student.code && (
                          <span className="text-[10px] text-gray-400 font-mono">{student.code}</span>
                        )}
                        <span className="font-medium truncate">{student.name}</span>
                      </div>
                    </td>
                    {sortedSessions.map((session) => {
                      const status = getStatus(student.id, session.id);
                      return (
                        <td
                          key={session.id}
                          className={`${borderCell} px-2 py-2`}
                        >
                          {status !== null ? (
                            <AttendanceStatusCell status={status} />
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td
                      className={`${borderCell} px-2 py-2 text-center font-semibold text-gray-700`}
                      style={{ ...stickyTotalDD, backgroundColor: "white" }}
                    >
                      {diemDanh}
                    </td>
                    <td
                      className={`${borderCell} px-2 py-2 text-center font-semibold text-gray-700`}
                      style={{ ...stickyTotalHV, backgroundColor: "white" }}
                    >
                      {attended}/{totalSessions}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: "#f1f5f9" }}>
                <td
                  className={`${borderCell} border-l border-t px-2 py-2`}
                  style={{ ...stickySTT, backgroundColor: "#f1f5f9" }}
                />
                <td
                  className={`${borderCell} border-t px-2 py-2 font-semibold text-gray-700`}
                  style={{ ...stickyName, backgroundColor: "#f1f5f9" }}
                >
                  Sĩ số
                </td>
                {sortedSessions.map((session) => (
                  <td
                    key={session.id}
                    className={`${borderCell} border-t px-1 py-2 text-center font-semibold text-gray-700 whitespace-nowrap`}
                  >
                    {getSiSo(session.id)}
                  </td>
                ))}
                <td className={`${borderCell} border-t px-2 py-2`} style={{ ...stickyTotalDD, backgroundColor: "#f1f5f9" }} />
                <td className={`${borderCell} border-t px-2 py-2`} style={{ ...stickyTotalHV, backgroundColor: "#f1f5f9" }} />
              </tr>
            </tfoot>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AttendanceTabContent({
  classSessions,
  studentSessions,
  classData,
  enrolledStudents,
}: AttendanceTabContentProps) {
  const [overviewOpen, setOverviewOpen] = useState(false);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Điểm danh theo buổi học</CardTitle>
          {classSessions && classSessions.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                data-testid="btn-download-attendance-all"
                onClick={() => exportAllSessionsToExcel(classSessions, studentSessions || [])}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Tải xuống
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                data-testid="btn-attendance-overview"
                onClick={() => setOverviewOpen(true)}
              >
                <Eye className="h-3.5 w-3.5 mr-1.5" />
                Xem chi tiết
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div>
            {classSessions && classSessions.length > 0 ? (
              <div className="overflow-x-auto border rounded-lg">
                <table className="text-sm border-collapse" style={{ minWidth: 1400 }}>
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="sticky left-0 z-20 bg-muted/50 px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap border-r" style={{ minWidth: 80 }}>Buổi</th>
                      <th className="sticky left-[80px] z-20 bg-muted/50 px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap border-r" style={{ minWidth: 110 }}>Ngày</th>
                      <th className="sticky left-[190px] z-20 bg-muted/50 px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap border-r" style={{ minWidth: 70 }}>Giờ</th>
                      <th className="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Có học</th>
                      <th className="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Nghỉ học</th>
                      <th className="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Nghỉ chờ bù</th>
                      <th className="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Đã học bù</th>
                      <th className="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Bảo lưu</th>
                      <th className="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Chưa điểm danh</th>
                      <th className="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Tổng</th>
                      <th className="px-3 py-3 text-left font-medium text-muted-foreground" style={{ minWidth: 320 }}>Nội dung bài học</th>
                      <th className="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap" style={{ minWidth: 120 }}>Giáo viên</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classSessions.map((session: any, index: number) => {
                      const sessionStudents =
                        studentSessions?.filter((s) => s.classSessionId === session.id) || [];
                      const stats = {
                        present: sessionStudents.filter((s) => s.attendanceStatus === "present").length,
                        absent: sessionStudents.filter((s) => s.attendanceStatus === "absent").length,
                        makeup_wait: sessionStudents.filter((s) => s.attendanceStatus === "makeup_wait").length,
                        makeup_done: sessionStudents.filter((s) => s.attendanceStatus === "makeup_done").length,
                        paused: sessionStudents.filter((s) => s.attendanceStatus === "paused").length,
                        scheduled: sessionStudents.filter((s) => !s.attendanceStatus || s.attendanceStatus === "pending").length,
                      };
                      const teachers: any[] = session.teachers || [];
                      const contents: any[] = session.sessionContents || [];
                      const attended = stats.present + stats.absent + stats.makeup_wait + stats.makeup_done + stats.paused;
                      const total = attended + stats.scheduled;

                      return (
                        <tr key={session.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="sticky left-0 z-10 bg-background px-3 py-3 font-medium whitespace-nowrap border-r" style={{ minWidth: 80 }}>Buổi {index + 1}</td>
                          <td className="sticky left-[80px] z-10 bg-background px-3 py-3 whitespace-nowrap border-r" style={{ minWidth: 110 }}>
                            {format(new Date(session.sessionDate), "dd/MM/yyyy")}
                          </td>
                          <td className="sticky left-[190px] z-10 bg-background px-3 py-3 whitespace-nowrap border-r" style={{ minWidth: 70 }}>
                            {session.shiftTemplate?.startTime}
                          </td>
                          <td className="px-3 py-3">
                            <span className="font-semibold text-green-600">{stats.present}</span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="font-semibold text-red-600">{stats.absent}</span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="font-semibold text-orange-500">{stats.makeup_wait}</span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="font-semibold text-blue-600">{stats.makeup_done}</span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="font-semibold text-yellow-600">{stats.paused}</span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="font-semibold text-muted-foreground">{stats.scheduled}</span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className="font-medium text-sm">{attended}/{total}</span>
                          </td>
                          <td className="px-3 py-3">
                            <SessionContentsCell contents={contents} />
                          </td>
                          <td className="px-3 py-3">
                            {teachers.length > 0 ? (
                              <div className="text-xs space-y-0.5 whitespace-nowrap">
                                {teachers.map((t: any) => (
                                  <div key={t.id}>{t.fullName}</div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Clock className="h-8 w-8 mb-2 opacity-50" />
                <p>Chưa có buổi học nào</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {overviewOpen && classSessions && classSessions.length > 0 && (
        <AttendanceOverviewModal
          open={overviewOpen}
          onClose={() => setOverviewOpen(false)}
          classSessions={classSessions}
          studentSessions={studentSessions ?? []}
          classData={classData}
          enrolledStudents={enrolledStudents}
        />
      )}
    </>
  );
}
