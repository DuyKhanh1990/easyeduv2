import { useState, useMemo, useRef } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Eye, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssignmentRow } from "@/types/my-assignments";
import { AssignmentSubmitDialog } from "./AssignmentSubmitDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

const WEEKDAY_LABELS: Record<number, string> = {
  2: "Thứ Hai", 3: "Thứ Ba", 4: "Thứ Tư", 5: "Thứ Năm",
  6: "Thứ Sáu", 7: "Thứ Bảy", 1: "Chủ Nhật",
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
  onExamClick?: (examId: string) => void;
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
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-600 dark:text-amber-400 transition-colors"
        title="Xem nhận xét"
        data-testid="button-view-comment"
      >
        <Eye className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 rounded-xl border border-border bg-popover shadow-xl overflow-hidden"
            style={{
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "80vw",
              maxWidth: 900,
              maxHeight: "80vh",
            }}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <p className="text-sm font-semibold text-foreground">Nhận xét</p>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
                data-testid="button-close-comment-popover"
              >
                ✕
              </button>
            </div>
            <div className="p-5 overflow-y-auto" style={{ maxHeight: "calc(80vh - 56px)" }}>
              <CommentRichContent text={comment} />
            </div>
          </div>
        </>
      )}
    </>
  );
}

export function AssignmentsTable({
  rows, month, isLoading, isStaff = false, year, monthIndex, onPrevMonth, onNextMonth, onToday, onDateRangeChange, onExamClick,
}: Props) {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [selectedRow, setSelectedRow] = useState<AssignmentRow | null>(null);
  const [viewOnly, setViewOnly] = useState(false);

  const [filterClass, setFilterClass] = useState("");
  const [filterStudent, setFilterStudent] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

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

  function handleDateChange(newFrom: string, newTo: string) {
    setDateFrom(newFrom);
    setDateTo(newTo);
    if (newFrom && newTo) onDateRangeChange(newFrom, newTo);
  }

  function openRow(row: AssignmentRow, asViewOnly: boolean) {
    setSelectedRow(row);
    setViewOnly(asViewOnly);
  }

  const COLS = ["TÊN LỚP", "THỜI GIAN", "NGÀY HỌC", "BUỔI", "HỌC VIÊN", "BÀI TẬP", "LOẠI", "TRẠNG THÁI", "BÀI NỘP", "ĐIỂM", "NHẬN XÉT"];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-green-600" />
            <h1 className="text-xl font-bold text-foreground">Bài tập về nhà</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{formatMonthLabel(year, monthIndex)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="btn-prev-month"
            onClick={onPrevMonth}
            className="p-1.5 rounded-lg border border-border hover:bg-secondary/70 text-muted-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            data-testid="btn-next-month"
            onClick={onNextMonth}
            className="p-1.5 rounded-lg border border-border hover:bg-secondary/70 text-muted-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            data-testid="btn-today"
            onClick={onToday}
            className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-secondary/70"
          >
            Hôm nay
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-background border border-border rounded-2xl px-4 py-3 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1">
          {(["all", "submitted", "pending"] as FilterStatus[]).map((s) => (
            <button
              key={s}
              data-testid={`filter-${s}`}
              onClick={() => setFilterStatus(s)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                filterStatus === s
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-secondary/60"
              )}
            >
              {s === "all" ? "Tất cả" : s === "submitted" ? "Đã nộp" : "Chưa nộp"}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Date range */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Từ</span>
          <input
            data-testid="input-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => handleDateChange(e.target.value, dateTo)}
            className="border border-border rounded-lg px-2 py-1 text-sm text-foreground bg-background"
          />
          <span>Đến</span>
          <input
            data-testid="input-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => handleDateChange(dateFrom, e.target.value)}
            className="border border-border rounded-lg px-2 py-1 text-sm text-foreground bg-background"
          />
        </div>

        {/* Filter button */}
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <button
              data-testid="btn-filter-panel"
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
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
          <PopoverContent align="end" className="w-[420px] p-0 rounded-xl shadow-lg border border-border">
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
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span>Hiển thị</span>
          {[20, 30, 50].map((n) => (
            <button
              key={n}
              data-testid={`pagesize-${n}`}
              onClick={() => setPageSize(n)}
              className={cn(
                "w-8 h-8 rounded-full text-sm font-semibold transition-colors",
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

      {/* Table */}
      <div className="bg-background border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {COLS.map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-xs font-semibold text-black tracking-wide uppercase whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    {Array.from({ length: COLS.length }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
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
                pagedRows.map((row, idx) => {
                  const isExam = row.itemType === "Bài kiểm tra";
                  return (
                    <tr
                      key={`${row.classSessionId}-${row.homeworkId}-${row.studentId}`}
                      data-testid={`row-assignment-${idx}`}
                      className="border-b border-border/50 last:border-0 hover:bg-secondary/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                        {row.className}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatTime(row.startTime)} – {formatTime(row.endTime)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {WEEKDAY_LABELS[row.weekday] ?? ""}, {formatDate(row.sessionDate)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {row.sessionIndex != null ? `Buổi ${row.sessionIndex}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {row.studentName}
                      </td>
                      <td className="px-4 py-3 text-foreground max-w-[200px]">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              if (isExam && row.examId && onExamClick) {
                                onExamClick(row.examId);
                              } else {
                                openRow(row, false);
                              }
                            }}
                            className="font-medium text-left text-blue-600 dark:text-blue-400 hover:underline transition-colors cursor-pointer"
                            data-testid={`button-open-homework-${idx}`}
                          >
                            {row.homeworkTitle}
                          </button>
                          {!isExam && row.isPersonalized && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 whitespace-nowrap">
                              Cá nhân
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Loại */}
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
                      {/* Trạng thái */}
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
                      {/* Bài nộp */}
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
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      {/* Điểm */}
                      <td className="px-4 py-3 text-center">
                        {row.score != null ? (
                          <span className="font-semibold text-foreground" data-testid={`score-${idx}`}>
                            {row.score}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      {/* Nhận xét */}
                      <td className="px-4 py-3 text-center">
                        {row.comment ? (
                          <CommentPopover comment={row.comment} />
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
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
    </div>
  );
}
