import { useState } from "react";
import { StudentNameLink } from "@/components/ui/StudentNameLink";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, CheckCircle2, XCircle, Clock, RefreshCw, PauseCircle, Circle, Download, ChevronLeft, ChevronRight } from "lucide-react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";

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
  makeup_scheduled: { label: "Đã xếp bù",    Icon: Clock,        iconCls: "text-violet-900",  textCls: "text-violet-900" },
  makeup_done:  { label: "Đã học bù",       Icon: RefreshCw,    iconCls: "text-blue-400",   textCls: "text-blue-600"   },
  paused:       { label: "Bảo lưu",         Icon: PauseCircle,  iconCls: "text-yellow-500", textCls: "text-yellow-700" },
  pending:      { label: "Chưa điểm danh",  Icon: Circle,       iconCls: "text-gray-300",   textCls: "text-gray-400"   },
};

const STATUS_LABEL_VI: Record<string, string> = {
  present:     "Có học",
  absent:      "Nghỉ học",
  makeup_wait: "Nghỉ chờ bù",
  makeup_scheduled: "Đã xếp bù",
  makeup_done: "Đã học bù",
  paused:      "Bảo lưu",
  pending:     "Chưa điểm danh",
};

function exportAllSessionsToExcel(
  classSessions: any[],
  studentSessions: any[]
) {
  const rows = classSessions.map((session: any) => {
    const sessionStudents = studentSessions.filter((s) => s.classSessionId === session.id);
    const present     = sessionStudents.filter((s) => s.attendanceStatus === "present").length;
    const absent      = sessionStudents.filter((s) => s.attendanceStatus === "absent").length;
    const makeupWait  = sessionStudents.filter((s) => s.attendanceStatus === "makeup_wait").length;
    const makeupScheduled = sessionStudents.filter((s) => s.attendanceStatus === "makeup_scheduled").length;
    const makeupDone  = sessionStudents.filter((s) => s.attendanceStatus === "makeup_done").length;
    const paused      = sessionStudents.filter((s) => s.attendanceStatus === "paused").length;
    const pending     = sessionStudents.filter((s) => !s.attendanceStatus || s.attendanceStatus === "pending").length;
    const attended    = present + absent + makeupWait + makeupScheduled + makeupDone + paused;
    const total       = attended + pending;
    const contents    = (session.sessionContents || []).map((c: any) => c.title || c.name || "").filter(Boolean).join(", ");
    const teachers    = (session.teachers || []).map((t: any) => t.fullName).join(", ");

    return {
      "Buổi":             `Buổi ${session.sessionIndex ?? "?"}`,
      "Ngày":             format(new Date(session.sessionDate), "dd/MM/yyyy"),
      "Giờ":              session.shiftTemplate?.startTime || "",
      "Có học":           present,
      "Nghỉ học":         absent,
      "Nghỉ chờ bù":      makeupWait,
      "Đã xếp bù":        makeupScheduled,
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

  // ── Derived data ──────────────────────────────────────────────────────────
  const sortedSessions = [...classSessions].sort((a, b) => {
    const indexA = a.sessionIndex ?? Number.MAX_SAFE_INTEGER;
    const indexB = b.sessionIndex ?? Number.MAX_SAFE_INTEGER;
    return indexA !== indexB ? indexA - indexB : a.id.localeCompare(b.id);
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

  const downloadOverviewExcel = async () => {
    const sessionContents = (session: any) => {
      const grouped: Record<string, any[]> = {};
      for (const content of session.sessionContents ?? []) {
        if (!grouped[content.contentType]) grouped[content.contentType] = [];
        grouped[content.contentType].push(content);
      }
      const sortedTypes = Object.keys(grouped).sort(
        (a, b) => CONTENT_TYPE_ORDER.indexOf(a) - CONTENT_TYPE_ORDER.indexOf(b)
      );
      if (sortedTypes.length === 0) return "—";
      return sortedTypes.flatMap((type) => {
        const label = CONTENT_TYPE_LABELS[type]?.label ?? type;
        return grouped[type].map((content) => `${label}: ${content.title ?? ""}`);
      }).join("\n");
    };
    const sessionTeachers = (session: any) =>
      (session.teachers ?? []).map((teacher: any) => teacher.fullName).filter(Boolean).join(", ");
    const statusLabel = (studentId: string, sessionId: string) => {
      const status = getStatus(studentId, sessionId);
      if (status === null) return "—";
      return ATTENDANCE_STATUS_CONFIG[status]?.label ?? status;
    };

    const rows: (string | number)[][] = [
      ["Tổng quan điểm danh"],
      ["Lớp học", classData?.name ?? "—"],
      ["Thời gian", weekdayLabel(classData?.scheduleDays ?? classData?.weekdays) || "—"],
      ["Ngày bắt đầu", classData?.startDate ? format(new Date(classData.startDate), "dd-MM-yyyy") : "—"],
      [],
      ["", "Lịch học", ...sortedSessions.map((session) => `Buổi ${session.sessionIndex ?? "?"}`), "Đã điểm danh", "Đã học"],
      ["", "Bài học", ...sortedSessions.map(sessionContents), "", ""],
      ["", "Giáo viên", ...sortedSessions.map(sessionTeachers), "", ""],
      ["STT", "Tên", ...sortedSessions.map((session) => format(new Date(session.sessionDate), "dd/MM")), "Đã điểm danh", "Đã học"],
    ];

    students.forEach((student, index) => {
      rows.push([
        index + 1,
        student.code ? `${student.name} (${student.code})` : student.name,
        ...sortedSessions.map((session) => statusLabel(student.id, session.id)),
        getDiemDanhCount(student.id),
        `${getAttendedCount(student.id)}/${totalSessions}`,
      ]);
    });

    rows.push([
      "",
      "Sĩ số",
      ...sortedSessions.map((session) => getSiSo(session.id)),
      "",
      "",
    ]);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Tổng quan điểm danh");
    const columnCount = rows[8].length;
    worksheet.columns = rows[8].map((_value, columnIndex) => ({
      key: `column${columnIndex + 1}`,
      width: columnIndex === 0 ? 8
        : columnIndex === 1 ? 30
          : columnIndex < columnCount - 2 ? 30
            : columnIndex === columnCount - 2 ? 16 : 12,
    }));
    rows.forEach((row) => worksheet.addRow(row));

    const lastColumn = worksheet.getColumn(columnCount).letter;
    const thinBorder = {
      top: { style: "thin" as const, color: { argb: "FFD1D5DB" } },
      left: { style: "thin" as const, color: { argb: "FFD1D5DB" } },
      bottom: { style: "thin" as const, color: { argb: "FFD1D5DB" } },
      right: { style: "thin" as const, color: { argb: "FFD1D5DB" } },
    };
    const fill = (color: string): ExcelJS.Fill => ({
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: color },
    });
    const styleRow = (rowNumber: number, options: {
      bg: string;
      fontColor?: string;
      bold?: boolean;
      fontSize?: number;
      align?: "left" | "center";
      wrap?: boolean;
    }) => {
      const row = worksheet.getRow(rowNumber);
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = fill(options.bg);
        cell.font = {
          name: "Arial",
          size: options.fontSize ?? 10,
          bold: options.bold ?? false,
          color: { argb: options.fontColor ?? "FF1F2937" },
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: options.align ?? "left",
          wrapText: options.wrap ?? false,
        };
        cell.border = thinBorder;
      });
    };

    worksheet.mergeCells(`A1:${lastColumn}1`);
    worksheet.getRow(1).height = 32;
    styleRow(1, { bg: "FF155E75", fontColor: "FFFFFFFF", bold: true, fontSize: 15, align: "center" });
    [2, 3, 4].forEach((rowNumber) => {
      worksheet.mergeCells(rowNumber, 2, rowNumber, columnCount);
      worksheet.getRow(rowNumber).height = 22;
      styleRow(rowNumber, { bg: "FFF1F5F9" });
      worksheet.getCell(rowNumber, 1).font = {
        name: "Arial",
        size: 10,
        bold: true,
        color: { argb: "FF334155" },
      };
    });
    worksheet.getRow(5).height = 8;

    worksheet.getRow(6).height = 24;
    worksheet.getRow(7).height = 66;
    worksheet.getRow(8).height = 42;
    styleRow(6, { bg: "FFDBEAFE", fontColor: "FF1E3A8A", bold: true, align: "center", wrap: true });
    styleRow(7, { bg: "FFF8FAFC", fontColor: "FF334155", wrap: true });
    styleRow(8, { bg: "FFF8FAFC", fontColor: "FF334155", wrap: true });
    worksheet.getRow(6).getCell(2).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    worksheet.getRow(7).getCell(2).font = { name: "Arial", size: 10, bold: true, color: { argb: "FF334155" } };
    worksheet.getRow(8).getCell(2).font = { name: "Arial", size: 10, bold: true, color: { argb: "FF334155" } };

    const headerRowNumber = 9;
    worksheet.getRow(headerRowNumber).height = 30;
    styleRow(headerRowNumber, { bg: "FF2563EB", fontColor: "FFFFFFFF", bold: true, align: "center", wrap: true });
    worksheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: students.length + headerRowNumber, column: columnCount },
    };

    const attendanceColors: Record<string, { bg: string; text: string }> = {
      present: { bg: "FFDCFCE7", text: "FF15803D" },
      absent: { bg: "FFFEE2E2", text: "FFB91C1C" },
      makeup_wait: { bg: "FFFFEDD5", text: "FFC2410C" },
      makeup_scheduled: { bg: "FFEDE9FE", text: "FF6D28D9" },
      makeup_done: { bg: "FFDBEAFE", text: "FF1D4ED8" },
      paused: { bg: "FFFEF3C7", text: "FFA16207" },
      pending: { bg: "FFF1F5F9", text: "FF64748B" },
    };
    students.forEach((student, studentIndex) => {
      const rowNumber = headerRowNumber + studentIndex + 1;
      const row = worksheet.getRow(rowNumber);
      row.height = 25;
      row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
        cell.fill = fill(studentIndex % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC");
        cell.font = { name: "Arial", size: 10, color: { argb: "FF1F2937" } };
        cell.alignment = {
          vertical: "middle",
          horizontal: columnNumber === 1 || columnNumber >= 3 ? "center" : "left",
          wrapText: columnNumber >= 3,
        };
        cell.border = thinBorder;
      });
      sortedSessions.forEach((session, sessionIndex) => {
        const status = getStatus(student.id, session.id);
        const colors = attendanceColors[status ?? "pending"] ?? attendanceColors.pending;
        const cell = row.getCell(sessionIndex + 3);
        cell.fill = fill(colors.bg);
        cell.font = { name: "Arial", size: 9, bold: true, color: { argb: colors.text } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      });
    });

    const totalRowNumber = students.length + headerRowNumber + 1;
    worksheet.getRow(totalRowNumber).height = 26;
    styleRow(totalRowNumber, { bg: "FFE2E8F0", fontColor: "FF334155", bold: true, align: "center" });
    worksheet.getRow(totalRowNumber).getCell(2).alignment = { vertical: "middle", horizontal: "left" };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const safeClassName = String(classData?.name ?? "Lop")
      .replace(/[\\/:*?"<>|]/g, "_")
      .trim();
    link.download = `Tong_quan_diem_danh_${safeClassName || "Lop"}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  // ── Shared cell class helpers ─────────────────────────────────────────────
  const borderCell = "border-r border-b border-gray-200";
  const headerBg1 = "#ffffff";   // row 1 – Lịch học
  const headerBg2 = "#f8fafc";   // row 2 – Bài học
  const headerBg3 = "#f8fafc";   // row 3 – Giáo viên
  const headerBg4 = "#f1f5f9";   // row 4 – STT/Tên/dates

  // z-index helpers — corner cells in thead need higher z so they sit above both
  // horizontally-sticky body cells AND are covered by the sticky thead itself.
  const stickyCornerTh: React.CSSProperties = { position: "sticky", zIndex: 30, backgroundColor: "inherit" };

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
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              data-testid="btn-download-attendance-overview"
              onClick={downloadOverviewExcel}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Tải xuống Excel
            </Button>
          </div>
        </DialogHeader>

        {/* ── Single unified scrollable table — no JS scroll sync needed ── */}
        <div className="overflow-auto flex-1">
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

            {/* thead is sticky-top via CSS — browser handles scroll natively, zero jank */}
            <thead style={{ position: "sticky", top: 0, zIndex: 20 }}>
              {/* ── Row 1: Lịch học + session numbers ── */}
              <tr style={{ backgroundColor: headerBg1 }}>
                <td
                  className={`${borderCell} border-l border-t px-2 py-2`}
                  style={{ ...stickyCornerTh, left: 0, backgroundColor: headerBg1 }}
                />
                <td
                  className={`${borderCell} border-t px-2 py-2 font-semibold text-gray-700`}
                  style={{ ...stickyCornerTh, left: COL_STT, backgroundColor: headerBg1 }}
                >
                  Lịch học
                </td>
                {sortedSessions.map((session) => (
                  <td
                    key={session.id}
                    className={`${borderCell} border-t px-1 py-2 text-center font-medium text-gray-700`}
                    style={{ backgroundColor: headerBg1 }}
                  >
                    {session.sessionIndex ?? "?"}
                  </td>
                ))}
                <td
                  className={`${borderCell} border-t px-2 py-2 text-center text-[11px] font-semibold text-gray-600 whitespace-nowrap`}
                  style={{ ...stickyCornerTh, right: COL_TOTAL_HV, backgroundColor: headerBg1 }}
                >
                  Đã điểm danh
                </td>
                <td
                  className={`${borderCell} border-t px-2 py-2 text-center text-[11px] font-semibold text-gray-600 whitespace-nowrap`}
                  style={{ ...stickyCornerTh, right: 0, backgroundColor: headerBg1 }}
                >
                  Đã học
                </td>
              </tr>

              {/* ── Row 2: Bài học ── */}
              <tr style={{ backgroundColor: headerBg2 }}>
                <td
                  className={`${borderCell} border-l px-2 py-1.5`}
                  style={{ ...stickyCornerTh, left: 0, backgroundColor: headerBg2 }}
                />
                <td
                  className={`${borderCell} px-2 py-1.5 font-semibold text-gray-600 text-[11px]`}
                  style={{ ...stickyCornerTh, left: COL_STT, backgroundColor: headerBg2 }}
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
                      <td key={session.id} className={`${borderCell} px-2 py-1.5 text-center`} style={{ backgroundColor: headerBg2 }}>
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
                    <td key={session.id} className={`${borderCell} px-2 py-1.5 align-top`} style={{ backgroundColor: headerBg2 }}>
                      <div className="space-y-1">
                        {lines.map((l, i) => (
                          <div key={i} title={`${l.label}: ${l.title}`} className="line-clamp-2 text-[11px] leading-snug text-gray-700">
                            <span className={`font-semibold ${l.color}`}>{l.label}:</span>{" "}{l.title}
                          </div>
                        ))}
                      </div>
                    </td>
                  );
                })}
                <td className={`${borderCell} px-2 py-1.5`} style={{ ...stickyCornerTh, right: COL_TOTAL_HV, backgroundColor: headerBg2 }} />
                <td className={`${borderCell} px-2 py-1.5`} style={{ ...stickyCornerTh, right: 0, backgroundColor: headerBg2 }} />
              </tr>

              {/* ── Row 3: Giáo viên ── */}
              <tr style={{ backgroundColor: headerBg3 }}>
                <td
                  className={`${borderCell} border-l px-2 py-1.5`}
                  style={{ ...stickyCornerTh, left: 0, backgroundColor: headerBg3 }}
                />
                <td
                  className={`${borderCell} px-2 py-1.5 font-semibold text-gray-600 text-[11px]`}
                  style={{ ...stickyCornerTh, left: COL_STT, backgroundColor: headerBg3 }}
                >
                  Giáo viên
                </td>
                {sortedSessions.map((session) => {
                  const teachers: any[] = session.teachers ?? [];
                  return (
                    <td key={session.id} className={`${borderCell} px-2 py-1.5 align-top`} style={{ backgroundColor: headerBg3 }}>
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
                <td className={`${borderCell} px-2 py-1.5`} style={{ ...stickyCornerTh, right: COL_TOTAL_HV, backgroundColor: headerBg3 }} />
                <td className={`${borderCell} px-2 py-1.5`} style={{ ...stickyCornerTh, right: 0, backgroundColor: headerBg3 }} />
              </tr>

              {/* ── Row 4: STT / Tên / Dates ── */}
              <tr style={{ backgroundColor: headerBg4 }}>
                <td
                  className={`${borderCell} border-l px-2 py-2 text-center font-semibold text-gray-700`}
                  style={{ ...stickyCornerTh, left: 0, backgroundColor: headerBg4 }}
                >
                  STT
                </td>
                <td
                  className={`${borderCell} px-2 py-2 font-semibold text-gray-700`}
                  style={{ ...stickyCornerTh, left: COL_STT, backgroundColor: headerBg4 }}
                >
                  Tên
                </td>
                {sortedSessions.map((session) => (
                  <td
                    key={session.id}
                    className={`${borderCell} px-1 py-2 text-center font-semibold text-gray-700 whitespace-nowrap`}
                    style={{ backgroundColor: headerBg4 }}
                  >
                    {format(new Date(session.sessionDate), "dd/MM")}
                  </td>
                ))}
                <td className={`${borderCell} px-2 py-2`} style={{ ...stickyCornerTh, right: COL_TOTAL_HV, backgroundColor: headerBg4 }} />
                <td className={`${borderCell} px-2 py-2`} style={{ ...stickyCornerTh, right: 0, backgroundColor: headerBg4 }} />
              </tr>
            </thead>

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
                        <StudentNameLink studentId={student.id} name={student.name} code={student.code} className="truncate" />
                      </div>
                    </td>
                    {sortedSessions.map((session) => {
                      const status = getStatus(student.id, session.id);
                      return (
                        <td key={session.id} className={`${borderCell} px-2 py-2`}>
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
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  const totalSessions = classSessions?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalSessions / pageSize));
  const pagedSessions = classSessions?.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <>
      <div className="rounded-xl border border-border bg-card shadow-sm flex flex-col h-full overflow-hidden">
        {/* Fixed header */}
        <div className="shrink-0 bg-card border-b border-border/50 px-6 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Điểm danh theo buổi học</h2>
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
        </div>

        {/* Scrollable table */}
        <div className="flex-1 overflow-auto">
          {classSessions && classSessions.length > 0 ? (
            <>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[1400px] text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/50">
                      <th className="sticky left-0 z-20 bg-muted/50 px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap border-r border-border/40" style={{ minWidth: 80 }}>Buổi</th>
                      <th className="sticky left-[80px] z-20 bg-muted/50 px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap border-r border-border/40" style={{ minWidth: 110 }}>Ngày</th>
                      <th className="sticky left-[190px] z-20 bg-muted/50 px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap border-r border-border/40" style={{ minWidth: 70 }}>Giờ</th>
                      <th className="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Có học</th>
                      <th className="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Nghỉ học</th>
                      <th className="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Nghỉ chờ bù</th>
                       <th className="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Đã xếp bù</th>
                      <th className="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Đã học bù</th>
                      <th className="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Bảo lưu</th>
                      <th className="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Chưa điểm danh</th>
                      <th className="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Tổng</th>
                      <th className="px-3 py-3 text-left font-medium text-muted-foreground" style={{ minWidth: 320 }}>Nội dung bài học</th>
                      <th className="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap" style={{ minWidth: 120 }}>Giáo viên</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pagedSessions ?? []).map((session: any) => {
                      const sessionStudents =
                        studentSessions?.filter((s) => s.classSessionId === session.id) || [];
                      const stats = {
                        present: sessionStudents.filter((s) => s.attendanceStatus === "present").length,
                        absent: sessionStudents.filter((s) => s.attendanceStatus === "absent").length,
                        makeup_wait: sessionStudents.filter((s) => s.attendanceStatus === "makeup_wait").length,
                        makeup_scheduled: sessionStudents.filter((s) => s.attendanceStatus === "makeup_scheduled").length,
                        makeup_done: sessionStudents.filter((s) => s.attendanceStatus === "makeup_done").length,
                        paused: sessionStudents.filter((s) => s.attendanceStatus === "paused").length,
                        scheduled: sessionStudents.filter((s) => !s.attendanceStatus || s.attendanceStatus === "pending").length,
                      };
                      const teachers: any[] = session.teachers || [];
                      const contents: any[] = session.sessionContents || [];
                       const attended = stats.present + stats.absent + stats.makeup_wait + stats.makeup_scheduled + stats.makeup_done + stats.paused;
                      const total = attended + stats.scheduled;

                      return (
                        <tr key={session.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                          <td className="sticky left-0 z-10 bg-background px-3 py-3 font-medium whitespace-nowrap border-r border-border/40" style={{ minWidth: 80 }}>Buổi {session.sessionIndex ?? "?"}</td>
                          <td className="sticky left-[80px] z-10 bg-background px-3 py-3 whitespace-nowrap border-r border-border/40" style={{ minWidth: 110 }}>
                            {format(new Date(session.sessionDate), "dd/MM/yyyy")}
                          </td>
                          <td className="sticky left-[190px] z-10 bg-background px-3 py-3 whitespace-nowrap border-r border-border/40" style={{ minWidth: 70 }}>
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
                            <span className="font-semibold text-violet-900">{stats.makeup_scheduled}</span>
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
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Clock className="h-8 w-8 mb-2 opacity-50" />
                <p>Chưa có buổi học nào</p>
              </div>
            )}
        </div>{/* end scrollable table */}

        {/* Fixed footer - pagination */}
        {classSessions && classSessions.length > 0 && (
          <div className="shrink-0 px-6 py-3 border-t border-border/50 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalSessions)} / {totalSessions} buổi
            </span>
            <div className="flex items-center gap-1.5">
              <Select
                value={String(pageSize)}
                onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}
              >
                <SelectTrigger className="h-7 w-16 text-xs border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20" className="text-xs">20</SelectItem>
                  <SelectItem value="30" className="text-xs">30</SelectItem>
                  <SelectItem value="50" className="text-xs">50</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 border-border/50"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground w-12 text-center">{page + 1}/{totalPages}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 border-border/50"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>{/* end card */}

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
