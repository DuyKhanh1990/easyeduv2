import { useState, useMemo, useRef, useEffect } from "react";
import { StudentNameLink } from "@/components/ui/StudentNameLink";
import { useLocation } from "wouter";
import { BookOpen, ChevronLeft, ChevronRight, Eye, Filter, MessageSquare, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssignmentRow } from "@/types/my-assignments";
import { AssignmentSubmitDialog } from "./AssignmentSubmitDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { ExamTakingDialog } from "@/pages/courses/dialogs/ExamTakingDialog";
import { ExamCommentDialog } from "./ExamCommentDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const WEEKDAY_LABELS: Record<number, string> = {
  0: "Chủ Nhật", 1: "Thứ Hai", 2: "Thứ Ba", 3: "Thứ Tư",
  4: "Thứ Năm", 5: "Thứ Sáu", 6: "Thứ Bảy",
};

const WEEKDAY_SHORT: Record<number, string> = {
  0: "CN", 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7",
};

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function formatTime(t: string) {
  return t ? t.substring(0, 5) : "";
}

function formatMonthLabel(year: number, month: number) {
  return `Tháng ${String(month + 1).padStart(2, "0")}/${year}`;
}

const DAY_SHORT: Record<number, string> = {
  0: "CN", 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7",
};

function formatDueDate(dueDate: string) {
  const d = new Date(dueDate);
  if (isNaN(d.getTime())) return dueDate;
  const dayShort = DAY_SHORT[d.getDay()] ?? "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = d.getHours() % 12 || 12;
  const min = String(d.getMinutes()).padStart(2, "0");
  const ampm = d.getHours() >= 12 ? "pm" : "am";
  return `${dayShort}. ${dd}/${mm}/${yyyy} ${hh}:${min} ${ampm}`;
}

type FilterStatus = "all" | "submitted" | "pending";

interface Props {
  rows: AssignmentRow[];
  month: string;
  isLoading?: boolean;
  isStaff?: boolean;
  year: number;
  monthIndex: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  onDateRangeChange: (dateFrom: string, dateTo: string) => void;
  onExamClick?: (examId: string, classId?: string) => void;
  highlightDate?: string;
}

function isImageUrl(url: string) {
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(url) || url.startsWith("/uploads/");
}

function getYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url);
}

function CommentRichContent({ text }: { text: string }) {
  if (text.trim().startsWith("<")) {
    return (
      <div
        className="prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: text }}
      />
    );
  }
  const lines = text.split("\n");
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-2" />;

        const ytId = getYouTubeId(trimmed);
        if (ytId) {
          return (
            <div key={i} className="rounded-lg overflow-hidden aspect-video">
              <iframe
                src={`https://www.youtube.com/embed/${ytId}`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          );
        }

        if (isVideoUrl(trimmed)) {
          return (
            <video key={i} src={trimmed} controls className="w-full rounded-lg max-h-48 object-contain bg-black" />
          );
        }

        if (isImageUrl(trimmed)) {
          return (
            <img
              key={i}
              src={trimmed}
              alt="ảnh đính kèm"
              className="w-full rounded-lg object-contain max-h-64"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          );
        }

        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
          return (
            <a
              key={i}
              href={trimmed}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-blue-600 dark:text-blue-400 underline break-all"
            >
              {trimmed}
            </a>
          );
        }

        return <p key={i} className="text-sm text-muted-foreground leading-relaxed">{line}</p>;
      })}
    </div>
  );
}

function CommentPopover({ comment }: { comment: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-600 dark:text-amber-400 transition-colors"
        title="Xem nhận xét"
        data-testid="button-view-comment"
      >
        <Eye className="w-4 h-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Nhận xét</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 pr-1">
            <CommentRichContent text={comment} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface AssignmentMobileCardProps {
  row: AssignmentRow;
  index: number;
  isStaff: boolean;
  onOpenAssignment: (row: AssignmentRow) => void;
  onViewSubmission: (row: AssignmentRow) => void;
  onViewExamSubmission: (row: AssignmentRow) => void;
  onViewExamComment: (row: AssignmentRow) => void;
  onEditExamComment: (row: AssignmentRow) => void;
}

function AssignmentMobileCard({
  row,
  index,
  isStaff,
  onOpenAssignment,
  onViewSubmission,
  onViewExamSubmission,
  onViewExamComment,
  onEditExamComment,
}: AssignmentMobileCardProps) {
  const isExam = row.itemType === "Bài kiểm tra";
  const remaining = isExam && row.maxAttempts != null
    ? row.maxAttempts - (row.attemptsUsed ?? 0)
    : null;
  const locked = remaining !== null && remaining <= 0;
  const isPastDue = !isExam && row.dueDate
    ? new Date() > new Date(row.dueDate)
    : false;

  return (
    <article
      className="rounded-xl border border-border bg-background p-3 shadow-sm transition-shadow hover:shadow-md sm:p-4"
      data-testid={`card-assignment-${index}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {row.className}
            {row.sessionIndex != null && (
              <span className="ml-1 font-normal text-muted-foreground">
                (Buổi {row.sessionIndex})
              </span>
            )}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {formatTime(row.startTime)} – {formatTime(row.endTime)} ·{" "}
            {WEEKDAY_SHORT[row.weekday] ?? ""} {formatDate(row.sessionDate)}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-full px-2 py-1 text-[10px] font-semibold",
            row.submissionStatus === "submitted"
              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
              : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
          )}
        >
          {row.submissionStatus === "submitted" ? "Đã nộp" : "Chưa nộp"}
        </span>
      </div>

      <div className="mt-3 border-t border-border/60 pt-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Bài tập
            </p>
            {locked ? (
              <span className="block break-words text-sm font-medium text-muted-foreground">
                {row.homeworkTitle}
              </span>
            ) : (
              <button
                onClick={() => onOpenAssignment(row)}
                className="block max-w-full break-words text-left text-sm font-semibold leading-snug text-blue-600 transition-colors hover:underline dark:text-blue-400"
                data-testid={`button-open-homework-mobile-${index}`}
              >
                {row.homeworkTitle}
              </button>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {row.isPersonalized && !isExam && (
                <span className="inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                  Cá nhân
                </span>
              )}
              {isExam && row.maxAttempts != null && (
                <span className={cn(
                  "text-[10px] font-medium",
                  locked ? "text-red-500 dark:text-red-400" : "text-orange-500 dark:text-orange-400",
                )}>
                  Còn {Math.max(0, remaining!)} lượt{locked && " — Đã hết lượt"}
                </span>
              )}
              {!isExam && row.dueDate && (
                <span className={cn(
                  "text-[10px] font-medium",
                  isPastDue ? "text-red-500 dark:text-red-400" : "text-orange-500 dark:text-orange-400",
                )}>
                  Hạn: {formatDueDate(row.dueDate)}
                </span>
              )}
            </div>
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 rounded px-2 py-1 text-[10px] font-medium",
              isExam
                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400"
                : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
            )}
          >
            {isExam ? "Bài kiểm tra" : "BTVN"}
          </span>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg bg-muted/30 p-2.5 sm:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Học viên</dt>
          <dd className="mt-0.5 truncate text-xs font-medium text-foreground" title={row.studentName}>
            {row.studentName || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Mã HV</dt>
          <dd className="mt-0.5 truncate text-xs text-foreground">{row.studentCode || "—"}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Điểm</dt>
          <dd className="mt-0.5 text-xs font-semibold text-foreground">{row.score ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Nhận xét</dt>
          <dd className="mt-0.5 text-xs text-foreground">{row.comment ? "Có nhận xét" : "—"}</dd>
        </div>
      </dl>

      {(row.submissionStatus === "submitted" || (isExam && isStaff && row.submissionId)) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          {!isExam && row.submissionStatus === "submitted" && (
            <button
              onClick={() => onViewSubmission(row)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
              title={isStaff ? "Xem bài & chấm điểm" : "Xem bài đã nộp"}
              data-testid={`button-view-submission-mobile-${index}`}
            >
              <Eye className="h-4 w-4" />
              {isStaff ? "Xem & chấm" : "Xem bài nộp"}
            </button>
          )}
          {isExam && isStaff && row.submissionStatus === "submitted" && row.submissionId && (
            <button
              onClick={() => onViewExamSubmission(row)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
              title="Xem bài làm của học viên"
              data-testid={`button-view-exam-submission-mobile-${index}`}
            >
              <Eye className="h-4 w-4" />
              Xem bài làm
            </button>
          )}
          {isExam && isStaff && row.submissionId && (
            row.comment ? (
              <button
                onClick={() => onViewExamComment(row)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
                title="Xem nhận xét"
              >
                <Eye className="h-4 w-4" />
                Xem nhận xét
              </button>
            ) : (
              <button
                onClick={() => onEditExamComment(row)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
                title="Thêm nhận xét"
              >
                <MessageSquare className="h-4 w-4" />
                Nhận xét
              </button>
            )
          )}
          {!isExam && row.comment && <CommentPopover comment={row.comment} />}
        </div>
      )}
    </article>
  );
}

export function AssignmentsTable({
  rows, month, isLoading, isStaff = false, year, monthIndex, onPrevMonth, onNextMonth, onToday, onDateRangeChange, onExamClick, highlightDate,
}: Props) {
  const [, navigate] = useLocation();
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  });
  const [pageSize, setPageSize] = useState(20);
  const [selectedRow, setSelectedRow] = useState<AssignmentRow | null>(null);
  const [viewOnly, setViewOnly] = useState(false);

  const [filterClass, setFilterClass] = useState("");
  const [filterStudent, setFilterStudent] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  const [viewingExamInfo, setViewingExamInfo] = useState<{ examId: string; submissionId: string } | null>(null);
  const [commentDialogData, setCommentDialogData] = useState<{
    submissionId: string;
    studentName: string;
    examTitle: string;
    comment: string | null;
    startInEditMode: boolean;
  } | null>(null);

  const { data: viewingExam } = useQuery({
    queryKey: ["/api/exams", viewingExamInfo?.examId],
    queryFn: async () => {
      const res = await fetch(`/api/exams/${viewingExamInfo!.examId}`);
      if (!res.ok) throw new Error("Lỗi tải bài kiểm tra");
      return res.json();
    },
    enabled: !!viewingExamInfo?.examId,
  });

  const { data: viewingSubData } = useQuery({
    queryKey: ["/api/exam-submissions", viewingExamInfo?.submissionId],
    queryFn: async () => {
      const res = await fetch(`/api/exam-submissions/${viewingExamInfo!.submissionId}`);
      if (!res.ok) throw new Error("Lỗi tải bài làm");
      return res.json();
    },
    enabled: !!viewingExamInfo?.submissionId,
  });

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const uniqueClasses = useMemo(() => {
    const names = new Set(rows.map((r) => r.className).filter(Boolean));
    return Array.from(names).sort();
  }, [rows]);

  const uniqueStudents = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      if (r.studentId && r.studentName) map.set(r.studentId, r.studentName);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], "vi"));
  }, [rows]);

  const activeFilterCount = [filterClass, filterStudent, filterDateFrom && filterDateTo ? "date" : ""].filter(Boolean).length;

  function applyFilters() {
    if (filterDateFrom && filterDateTo) {
      setDateFrom(filterDateFrom);
      setDateTo(filterDateTo);
      onDateRangeChange(filterDateFrom, filterDateTo);
    }
    setFilterOpen(false);
  }

  function clearFilters() {
    setFilterClass("");
    setFilterStudent("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setDateFrom("");
    setDateTo("");
    onDateRangeChange("", "");
  }

  const filteredRows = useMemo(() => {
    let list = rows;
    if (filterStatus === "submitted") list = list.filter((r) => r.submissionStatus === "submitted");
    if (filterStatus === "pending") list = list.filter((r) => r.submissionStatus !== "submitted");
    if (filterClass) list = list.filter((r) => r.className === filterClass);
    if (filterStudent) list = list.filter((r) => r.studentId === filterStudent);
    return list;
  }, [rows, filterStatus, filterClass, filterStudent]);

  const pagedRows = useMemo(() => filteredRows.slice(0, pageSize), [filteredRows, pageSize]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, AssignmentRow[]>();
    for (const row of pagedRows) {
      const key = row.sessionDate;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [pagedRows]);

  const highlightRowRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    if (highlightDate && highlightRowRef.current) {
      highlightRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightDate, groupedByDate]);

  function handleDateChange(newFrom: string, newTo: string) {
    setDateFrom(newFrom);
    setDateTo(newTo);
    if (newFrom && newTo) onDateRangeChange(newFrom, newTo);
  }

  function openRow(row: AssignmentRow, asViewOnly: boolean) {
    setSelectedRow(row);
    setViewOnly(asViewOnly);
  }

  const COLS = [
    { label: "TÊN LỚP",    minW: "min-w-[160px]", sticky: false },
    { label: "HỌC VIÊN",   minW: "min-w-[120px]", sticky: false },
    { label: "BÀI TẬP",   minW: "min-w-[200px]", sticky: false },
    { label: "LOẠI",       minW: "min-w-[110px]", sticky: false },
    { label: "TRẠNG THÁI", minW: "min-w-[100px]", sticky: false },
    { label: "BÀI NỘP",   minW: "min-w-[80px]",  sticky: false },
    { label: "ĐIỂM",       minW: "min-w-[70px]",  sticky: true,  right: "right-[96px]" },
    { label: "NHẬN XÉT",  minW: "min-w-[96px]",  sticky: true,  right: "right-0" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-3 px-3 py-4 sm:space-y-4 sm:px-4 sm:py-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 shrink-0 text-green-600" />
            <h1 className="truncate text-lg font-bold text-foreground sm:text-xl">Bài tập về nhà</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{formatMonthLabel(year, monthIndex)}</p>
        </div>
        <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
          <button
            data-testid="btn-prev-month"
            onClick={onPrevMonth}
            className="min-h-10 min-w-10 rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-secondary/70"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            data-testid="btn-next-month"
            onClick={onNextMonth}
            className="min-h-10 min-w-10 rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-secondary/70"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            data-testid="btn-today"
            onClick={onToday}
            className="min-h-10 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary/70"
          >
            Hôm nay
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-background px-3 py-3 sm:flex sm:flex-wrap sm:items-center sm:gap-4 sm:px-4">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto pb-0.5 sm:shrink-0">
          {(["all", "submitted", "pending"] as FilterStatus[]).map((s) => (
            <button
              key={s}
              data-testid={`filter-${s}`}
              onClick={() => setFilterStatus(s)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                filterStatus === s
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-secondary/60"
              )}
            >
              {s === "all" ? "Tất cả" : s === "submitted" ? "Đã nộp" : "Chưa nộp"}
            </button>
          ))}
        </div>

        <div className="hidden flex-1 sm:block" />

        {/* Date range */}
        <div className="grid min-w-0 grid-cols-2 gap-2 text-sm text-muted-foreground sm:flex sm:items-center">
          <label className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <span>Từ</span>
          <input
            data-testid="input-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => handleDateChange(e.target.value, dateTo)}
              className="min-w-0 rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground sm:py-1"
          />
          </label>
          <label className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <span>Đến</span>
          <input
            data-testid="input-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => handleDateChange(dateFrom, e.target.value)}
              className="min-w-0 rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground sm:py-1"
          />
          </label>
        </div>

        {/* Filter button */}
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <button
              data-testid="btn-filter-panel"
              className={cn(
                "flex min-h-10 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                activeFilterCount > 0
                  ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 dark:border-green-700"
                  : "border-border text-muted-foreground hover:bg-secondary/60"
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              Bộ lọc
              {activeFilterCount > 0 && (
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-600 text-white text-[10px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[calc(100vw-2rem)] rounded-xl border border-border p-0 shadow-lg sm:w-[420px]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold text-foreground">Bộ lọc</span>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                  data-testid="btn-clear-filters"
                >
                  <X className="h-3 w-3" />
                  Xóa bộ lọc
                </button>
              )}
            </div>

            <div className="p-4 space-y-4">
              {/* Date range inside filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Từ — Đến
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">Từ</span>
                    <input
                      data-testid="filter-input-date-from"
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      className="w-full border border-border rounded-lg px-2 py-1.5 text-sm text-foreground bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">Đến</span>
                    <input
                      data-testid="filter-input-date-to"
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className="w-full border border-border rounded-lg px-2 py-1.5 text-sm text-foreground bg-background"
                    />
                  </div>
                </div>
              </div>

              {/* Class filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Lớp học
                </label>
                <select
                  data-testid="filter-select-class"
                  value={filterClass}
                  onChange={(e) => setFilterClass(e.target.value)}
                  className="w-full border border-border rounded-lg px-2 py-1.5 text-sm text-foreground bg-background"
                >
                  <option value="">— Tất cả lớp —</option>
                  {uniqueClasses.map((cls) => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              </div>

              {/* Student filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Học viên
                </label>
                <select
                  data-testid="filter-select-student"
                  value={filterStudent}
                  onChange={(e) => setFilterStudent(e.target.value)}
                  className="w-full border border-border rounded-lg px-2 py-1.5 text-sm text-foreground bg-background"
                >
                  <option value="">— Tất cả học viên —</option>
                  {uniqueStudents.map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="px-4 pb-4 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => { clearFilters(); setFilterOpen(false); }}
                data-testid="btn-filter-reset"
              >
                Đặt lại
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={applyFilters}
                data-testid="btn-filter-apply"
              >
                Áp dụng
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Page size */}
        <div className="flex items-center justify-between gap-1.5 text-sm text-muted-foreground sm:justify-start">
          <span>Hiển thị</span>
          {[20, 30, 50].map((n) => (
            <button
              key={n}
              data-testid={`pagesize-${n}`}
              onClick={() => setPageSize(n)}
              className={cn(
                "h-9 w-9 rounded-full text-sm font-semibold transition-colors",
                pageSize === n
                  ? "bg-green-500 text-white"
                  : "text-muted-foreground hover:bg-secondary/60"
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Active filter tags */}
      {(filterClass || filterStudent) && (
        <div className="flex flex-wrap items-center gap-2">
          {filterClass && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800">
              Lớp: {filterClass}
              <button
                onClick={() => setFilterClass("")}
                className="hover:text-green-900 dark:hover:text-green-200 transition-colors"
                data-testid="tag-clear-class"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {filterStudent && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
              Học viên: {uniqueStudents.find(([id]) => id === filterStudent)?.[1] ?? filterStudent}
              <button
                onClick={() => setFilterStudent("")}
                className="hover:text-blue-900 dark:hover:text-blue-200 transition-colors"
                data-testid="tag-clear-student"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Mobile and tablet cards */}
      <div className="space-y-4 xl:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl bg-secondary/40" />
          ))
        ) : pagedRows.length === 0 ? (
          <div className="rounded-xl border border-border bg-background py-12 text-center text-sm text-muted-foreground">
            Không tìm thấy bài tập nào.
          </div>
        ) : (
          groupedByDate.map(([date, dateRows]) => {
            const firstRow = dateRows[0];
            const dayLabel = WEEKDAY_LABELS[firstRow.weekday] ?? "";
            const dateLabel = formatDate(date);
            const today = new Date().toISOString().split("T")[0];
            const isToday = date === today;
            const isHighlighted = date === highlightDate;

            return (
              <section
                key={`mobile-date-${date}`}
                className={cn(
                  "space-y-2 rounded-2xl border p-2.5 sm:p-3",
                  isToday
                    ? "border-green-200 bg-green-50/50 dark:border-green-800/50 dark:bg-green-900/10"
                    : "border-violet-200/60 bg-violet-50/30 dark:border-violet-800/30 dark:bg-violet-900/10",
                  isHighlighted && "outline outline-2 outline-primary/50",
                )}
              >
                <div className="flex flex-wrap items-center gap-2 px-1 py-1">
                  <div className={cn(
                    "h-2.5 w-2.5 shrink-0 rounded-full ring-4",
                    isToday
                      ? "bg-green-500 ring-green-100 dark:ring-green-900/40"
                      : "bg-violet-500 ring-violet-100 dark:ring-violet-900/40",
                  )} />
                  <span className={cn(
                    "text-xs font-semibold",
                    isToday ? "text-green-700 dark:text-green-400" : "text-violet-700 dark:text-violet-400",
                  )}>
                    {dayLabel}, {dateLabel}
                    {isToday && <span className="ml-1 font-normal opacity-80">— Hôm nay</span>}
                  </span>
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    isToday
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
                  )}>
                    {dateRows.length} bài tập
                  </span>
                </div>
                <div className="space-y-2">
                  {dateRows.map((row) => {
                    const idx = pagedRows.indexOf(row);
                    return (
                      <AssignmentMobileCard
                        key={`${row.classSessionId}-${row.homeworkId}-${row.studentId}`}
                        row={row}
                        index={idx}
                        isStaff={isStaff}
                        onOpenAssignment={(assignment) => {
                          const isAssignmentExam = assignment.itemType === "Bài kiểm tra";
                          if (isAssignmentExam && assignment.examId) {
                            if (!isStaff) {
                              navigate(assignment.classId
                                ? `/my-space/exam/${assignment.examId}?classId=${assignment.classId}`
                                : `/my-space/exam/${assignment.examId}`);
                            } else if (onExamClick) {
                              onExamClick(assignment.examId, assignment.classId);
                            }
                          } else {
                            openRow(assignment, false);
                          }
                        }}
                        onViewSubmission={(assignment) => openRow(assignment, !isStaff)}
                        onViewExamSubmission={(assignment) => setViewingExamInfo({
                          examId: assignment.examId!,
                          submissionId: assignment.submissionId!,
                        })}
                        onViewExamComment={(assignment) => setCommentDialogData({
                          submissionId: assignment.submissionId!,
                          studentName: assignment.studentName,
                          examTitle: assignment.homeworkTitle,
                          comment: assignment.comment,
                          startInEditMode: false,
                        })}
                        onEditExamComment={(assignment) => setCommentDialogData({
                          submissionId: assignment.submissionId!,
                          studentName: assignment.studentName,
                          examTitle: assignment.homeworkTitle,
                          comment: null,
                          startInEditMode: true,
                        })}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-background xl:block">
        <div className="overflow-x-auto">
          <table className="text-sm" style={{ minWidth: "max-content", width: "100%" }}>
            <thead>
              <tr className="border-b border-border">
                {COLS.map((col) => (
                  <th
                    key={col.label}
                    className={cn(
                      "px-4 py-3 text-left text-xs font-semibold text-black tracking-wide uppercase whitespace-nowrap",
                      col.minW,
                      col.sticky && "sticky bg-background z-10 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]",
                      col.sticky && (col as any).right
                    )}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    {COLS.map((col, j) => (
                      <td key={j} className={cn("px-4 py-3", col.sticky && `sticky bg-background z-10 ${(col as any).right}`)}>
                        <div className="h-4 rounded bg-secondary/40 animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={COLS.length} className="text-center py-12 text-muted-foreground text-sm">
                    Không tìm thấy bài tập nào.
                  </td>
                </tr>
              ) : (
                groupedByDate.map(([date, dateRows]) => {
                  const firstRow = dateRows[0];
                  const dayLabel = WEEKDAY_LABELS[firstRow.weekday] ?? "";
                  const dateLabel = formatDate(date);
                  const today = new Date().toISOString().split("T")[0];
                  const isToday = date === today;
                  let globalIdx = pagedRows.indexOf(firstRow);

                  const isHighlighted = date === highlightDate;
                  return [
                    <tr
                      key={`date-${date}`}
                      ref={isHighlighted ? highlightRowRef : undefined}
                      className={cn(
                        "border-b border-t",
                        isToday
                          ? "border-green-200 dark:border-green-800/50 bg-green-50/60 dark:bg-green-900/10"
                          : "border-violet-200/60 dark:border-violet-800/30 bg-violet-50/40 dark:bg-violet-900/10",
                        isHighlighted && "outline outline-2 outline-primary/50 bg-primary/5 dark:bg-primary/10"
                      )}
                    >
                      <td colSpan={COLS.length} className="py-2.5 sticky left-0 z-20 bg-transparent">
                        <div className="flex items-center gap-3 px-4">
                          <div className={cn(
                            "w-2.5 h-2.5 rounded-full shrink-0 ring-4",
                            isToday
                              ? "bg-green-500 ring-green-100 dark:ring-green-900/40"
                              : "bg-violet-500 ring-violet-100 dark:ring-violet-900/40"
                          )} />
                          <span className={cn(
                            "text-xs font-semibold",
                            isToday ? "text-green-700 dark:text-green-400" : "text-violet-700 dark:text-violet-400"
                          )}>
                            {dayLabel}, {dateLabel}
                            {isToday && <span className="ml-1 font-normal opacity-80">— Hôm nay</span>}
                          </span>
                          <span className={cn(
                            "text-xs font-medium px-2 py-0.5 rounded-full",
                            isToday
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                          )}>
                            {dateRows.length} bài tập
                          </span>
                        </div>
                      </td>
                    </tr>,
                    ...dateRows.map((row, rowIdx) => {
                      const idx = globalIdx + rowIdx;
                      const isExam = row.itemType === "Bài kiểm tra";
                      return (
                        <tr
                          key={`${row.classSessionId}-${row.homeworkId}-${row.studentId}`}
                          data-testid={`row-assignment-${idx}`}
                          className="border-b border-border/50 last:border-0 hover:bg-secondary/30 transition-colors"
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <p className="font-medium text-foreground leading-tight">
                              {row.className}
                              {row.sessionIndex != null && (
                                <span className="ml-1 text-xs font-normal text-muted-foreground">(Buổi {row.sessionIndex})</span>
                              )}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {formatTime(row.startTime)} – {formatTime(row.endTime)}, {WEEKDAY_SHORT[row.weekday] ?? ""}: {formatDate(row.sessionDate)}
                            </p>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <StudentNameLink studentId={row.studentId} name={row.studentName} code={row.studentCode} />
                          </td>
                          <td className="px-4 py-3 text-foreground max-w-[220px]">
                            {(() => {
                              const remaining = isExam && row.maxAttempts != null
                                ? row.maxAttempts - (row.attemptsUsed ?? 0)
                                : null;
                              const locked = remaining !== null && remaining <= 0;
                              const isPastDue = !isExam && row.dueDate
                                ? new Date() > new Date(row.dueDate)
                                : false;
                              return (
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1.5">
                                    {locked ? (
                                      <span className="font-medium text-left text-muted-foreground cursor-not-allowed text-sm">
                                        {row.homeworkTitle}
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          if (isExam && row.examId) {
                                            if (!isStaff) {
                                              const url = row.classId
                                                ? `/my-space/exam/${row.examId}?classId=${row.classId}`
                                                : `/my-space/exam/${row.examId}`;
                                              navigate(url);
                                            } else if (onExamClick) {
                                              onExamClick(row.examId, row.classId);
                                            }
                                          } else {
                                            openRow(row, false);
                                          }
                                        }}
                                        className="font-medium text-left text-blue-600 dark:text-blue-400 hover:underline transition-colors cursor-pointer text-sm"
                                        data-testid={`button-open-homework-${idx}`}
                                      >
                                        {row.homeworkTitle}
                                      </button>
                                    )}
                                    {!isExam && row.isPersonalized && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 whitespace-nowrap">
                                        Cá nhân
                                      </span>
                                    )}
                                  </div>
                                  {isExam && row.maxAttempts != null && (
                                    <span className={cn(
                                      "text-[10px] font-medium",
                                      locked ? "text-red-500 dark:text-red-400" : "text-orange-500 dark:text-orange-400"
                                    )}>
                                      Số lần làm: {Math.max(0, remaining!)}
                                      {locked && " — Đã hết lượt"}
                                    </span>
                                  )}
                                  {!isExam && row.dueDate && (
                                    <span className={cn(
                                      "text-[10px] font-medium",
                                      isPastDue ? "text-red-500 dark:text-red-400" : "text-orange-500 dark:text-orange-400"
                                    )}>
                                      Hạn nộp: {formatDueDate(row.dueDate)}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                                isExam
                                  ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400"
                                  : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                              )}
                            >
                              {isExam ? "Bài kiểm tra" : "BTVN"}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              data-testid={`status-${idx}`}
                              className={cn(
                                "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                                row.submissionStatus === "submitted"
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                                  : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
                              )}
                            >
                              {row.submissionStatus === "submitted" ? "Đã nộp" : "Chưa nộp"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {!isExam && row.submissionStatus === "submitted" ? (
                              <button
                                onClick={() => openRow(row, !isStaff)}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 transition-colors"
                                title={isStaff ? "Xem bài & chấm điểm" : "Xem bài đã nộp"}
                                data-testid={`button-view-submission-${idx}`}
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            ) : isExam && isStaff && row.submissionStatus === "submitted" && row.submissionId ? (
                              <button
                                onClick={() => setViewingExamInfo({ examId: row.examId!, submissionId: row.submissionId! })}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 transition-colors"
                                title="Xem bài làm của học viên"
                                data-testid={`button-view-exam-submission-${idx}`}
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center sticky right-[96px] bg-background z-10 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                            {row.score != null ? (
                              <span className="font-semibold text-foreground" data-testid={`score-${idx}`}>
                                {row.score}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center sticky right-0 bg-background z-10 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                            {isExam && isStaff && row.submissionId ? (
                              row.comment ? (
                                <button
                                  onClick={() => setCommentDialogData({
                                    submissionId: row.submissionId!,
                                    studentName: row.studentName,
                                    examTitle: row.homeworkTitle,
                                    comment: row.comment,
                                    startInEditMode: false,
                                  })}
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-600 dark:text-amber-400 transition-colors"
                                  title="Xem nhận xét"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              ) : (
                                <button
                                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
                                  onClick={() => setCommentDialogData({
                                    submissionId: row.submissionId!,
                                    studentName: row.studentName,
                                    examTitle: row.homeworkTitle,
                                    comment: null,
                                    startInEditMode: true,
                                  })}
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  Nhận xét
                                </button>
                              )
                            ) : row.comment ? (
                              <CommentPopover comment={row.comment} />
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    }),
                  ];
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedRow && (
        <AssignmentSubmitDialog
          row={selectedRow}
          open={!!selectedRow}
          viewOnly={isStaff ? false : viewOnly}
          isStaff={isStaff}
          onClose={() => { setSelectedRow(null); setViewOnly(false); }}
        />
      )}

      {viewingExamInfo && viewingExam && viewingSubData && (
        <ExamTakingDialog
          exam={viewingExam}
          open={!!viewingExamInfo}
          onClose={() => setViewingExamInfo(null)}
          readonlySubmission={viewingSubData}
        />
      )}

      {commentDialogData && (
        <ExamCommentDialog
          open={!!commentDialogData}
          onClose={() => setCommentDialogData(null)}
          submissionId={commentDialogData.submissionId}
          studentName={commentDialogData.studentName}
          examTitle={commentDialogData.examTitle}
          initialComment={commentDialogData.comment}
          startInEditMode={commentDialogData.startInEditMode}
        />
      )}
    </div>
  );
}
