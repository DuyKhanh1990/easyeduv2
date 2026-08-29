import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarIcon, ChevronLeft, ChevronRight, Eye, History, Pencil, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type AssessmentHistoryEvent = {
  id: string;
  scope: "list" | "question-bank" | "results";
  entity_type: "exam" | "question" | "submission";
  entity_id: string | null;
  entity_code: string | null;
  entity_name: string | null;
  action: "created" | "updated" | "deleted";
  ev_time?: string;
  old_content: unknown;
  new_content: unknown;
  user_name: string | null;
  location_name: string | null;
};

type HistoryResponse = { events: AssessmentHistoryEvent[]; total: number };
type QuickRange = "all" | "today" | "7d" | "30d" | "thismonth";

const ACTION_CONFIG = {
  created: { label: "Thêm mới", icon: <Plus className="h-3 w-3" />, bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700" },
  updated: { label: "Chỉnh sửa", icon: <Pencil className="h-3 w-3" />, bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700" },
  deleted: { label: "Xoá", icon: <Trash2 className="h-3 w-3" />, bg: "bg-red-50", border: "border-red-200", text: "text-red-700" },
} as const;

const SCOPE_LABELS = {
  list: "Danh sách bài kiểm tra",
  "question-bank": "Ngân hàng câu hỏi",
  results: "Kết quả bài làm",
};

const ENTITY_LABELS = {
  exam: "Bài kiểm tra",
  question: "Câu hỏi",
  submission: "Bài làm",
};

const FIELD_LABELS: Record<string, string> = {
  id: "Mã bản ghi",
  code: "Mã",
  name: "Tên",
  title: "Tiêu đề",
  type: "Loại",
  content: "Nội dung",
  text: "Nội dung",
  value: "Giá trị",
  label: "Nhãn",
  options: "Đáp án",
  correctAnswer: "Đáp án đúng",
  score: "Điểm",
  difficulty: "Độ khó",
  explanation: "Giải thích",
  mediaImageUrl: "Ảnh minh họa",
  mediaAudioUrl: "Âm thanh minh họa",
  status: "Trạng thái",
  openAt: "Thời gian mở",
  closeAt: "Thời gian đóng",
  showResult: "Hiển thị kết quả",
  hasAIGrading: "Chấm điểm AI",
  aiGradingEnabled: "Bật chấm điểm AI",
  aiGrading: "Chấm điểm AI",
  description: "Mô tả",
  maxAttempts: "Số lần làm tối đa",
  passingScore: "Điểm đạt",
  timeLimitMinutes: "Thời gian làm bài (phút)",
  durationMinutes: "Thời lượng (phút)",
  questionCount: "Số câu hỏi",
  orderIndex: "Thứ tự",
  randomizeQuestions: "Trộn câu hỏi",
  shuffleOptions: "Trộn đáp án",
  readingPassageUrl: "Tệp bài đọc",
  readingPassageName: "Tên bài đọc",
  sessionAudioUrl: "Tệp âm thanh buổi kiểm tra",
  sessionAudioName: "Tên âm thanh buổi kiểm tra",
  createdByName: "Người tạo",
  updatedByName: "Người cập nhật",
  createdBy: "Mã người tạo",
  updatedBy: "Mã người cập nhật",
  adjustedScore: "Điểm điều chỉnh",
  comment: "Nhận xét",
  aiGradingResults: "Kết quả chấm AI",
  answers: "Câu trả lời",
  classId: "Lớp học",
  examCode: "Mã bài kiểm tra",
  examName: "Tên bài kiểm tra",
  classCode: "Mã lớp",
  className: "Tên lớp",
  expiresAt: "Thời gian hết hạn",
  startedAt: "Thời gian bắt đầu",
  submittedAt: "Thời gian nộp bài",
  studentId: "Mã học viên",
  studentName: "Học viên",
  studentCode: "Mã học viên",
  partScores: "Điểm theo phần",
  timeTakenSeconds: "Thời gian làm bài (giây)",
  changeType: "Thay đổi",
  questionName: "Câu hỏi",
  questionType: "Loại câu hỏi",
  sectionName: "Buổi kiểm tra",
  sectionId: "Mã buổi kiểm tra",
  examId: "Mã bài kiểm tra",
  createdAt: "Ngày tạo",
  updatedAt: "Ngày cập nhật",
};

const NESTED_FIELD_LABELS: Record<string, string> = {
  partName: "Tên phần",
  correct: "Số câu đúng",
  total: "Tổng số câu",
  questionId: "Mã câu hỏi",
  suggestedScore: "Điểm đề xuất",
  maxScore: "Điểm tối đa",
  feedback: "Nhận xét",
  strengths: "Điểm mạnh",
  weaknesses: "Điểm cần cải thiện",
  gradedAt: "Thời điểm chấm",
  durationMs: "Thời lượng (mili giây)",
  provider: "Nhà cung cấp",
  errorReason: "Lý do lỗi",
  text: "Nội dung",
  value: "Giá trị",
  label: "Nhãn",
};

const VALUE_LABELS: Record<string, Record<string, string>> = {
  status: {
    draft: "Nháp",
    published: "Đã công bố",
    archived: "Đã lưu trữ",
    active: "Đang hoạt động",
    inactive: "Không hoạt động",
    pending: "Đang chờ",
    accepted: "Đã chấp nhận",
    adjusted: "Đã điều chỉnh",
    error: "Lỗi",
  },
  type: {
    single_choice: "Trắc nghiệm",
    multiple_choice: "Nhiều lựa chọn",
    fill_blank: "Điền vào chỗ trống",
    essay: "Tự luận",
    matching: "Nối",
  },
  questionType: {
    single_choice: "Trắc nghiệm",
    multiple_choice: "Nhiều lựa chọn",
    fill_blank: "Điền vào chỗ trống",
    essay: "Tự luận",
    matching: "Nối",
  },
  difficulty: {
    easy: "Dễ",
    medium: "Trung bình",
    hard: "Khó",
  },
};

const INTERNAL_FIELDS = new Set([
  "id",
  "entityId",
  "userId",
  "createdBy",
  "updatedBy",
  "createdAt",
  "updatedAt",
  "locationId",
  "examId",
  "sectionId",
  "questionId",
  "submissionId",
  "studentId",
  "classId",
  "courseId",
  "programId",
  "contentId",
]);

function stripUtc(value: string) {
  return value.replace("Z", "").replace("+00:00", "");
}

function eventTime(event: AssessmentHistoryEvent) {
  return event.ev_time ?? "";
}

function fmtDateTime(value: string) {
  try {
    return format(new Date(stripUtc(value)), "HH:mm — dd/MM/yyyy", { locale: vi });
  } catch {
    return value;
  }
}

function dateKey(value: string) {
  return stripUtc(value).slice(0, 10);
}

function fmtDateGroup(value: string) {
  try {
    return format(new Date(stripUtc(value)), "EEEE, dd/MM/yyyy", { locale: vi });
  } catch {
    return value;
  }
}

function quickRangeDates(range: QuickRange): { from?: string; to?: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (range === "today") return { from: fmt(today), to: fmt(today) };
  if (range === "7d") {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    return { from: fmt(from), to: fmt(today) };
  }
  if (range === "30d") {
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    return { from: fmt(from), to: fmt(today) };
  }
  if (range === "thismonth") {
    return {
      from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: fmt(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    };
  }
  return {};
}

function parseObject(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, any>;
  try { return JSON.parse(String(value)); } catch { return {}; }
}

function fieldLabel(field: string) {
  // Do not leak database/API camelCase into a Vietnamese-only dialog when a
  // newly added audit field has not been mapped yet.
  return FIELD_LABELS[field] ?? NESTED_FIELD_LABELS[field] ?? "Thông tin khác";
}

function isInternalField(field: string) {
  return INTERNAL_FIELDS.has(field) || field.endsWith("Id") || field.endsWith("_id");
}

function displayScalar(value: any, field?: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "string") {
    if (field === "partName") {
      return value
        .replace(/\bPart\b/gi, "Phần")
        .replace(/\bSession\b/gi, "Buổi");
    }
    if (field === "sectionName") {
      return value.replace(/\bSession\b/gi, "Buổi");
    }
    if (field?.endsWith("At") && !Number.isNaN(Date.parse(value))) {
      return fmtDateTime(value);
    }
    const translated = VALUE_LABELS[field ?? ""]?.[value.trim().toLowerCase()];
    if (translated) return translated;
  }
  return String(value);
}

function displayValue(value: any, field?: string): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value.map(item => (
      typeof item === "object" && item !== null
        ? displayValue(item)
        : displayScalar(item, field)
    )).join("\n");
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).filter(([key]) => !isInternalField(key));
    if (entries.length === 0) return "—";
    return entries
      .map(([key, nestedValue]) => `${fieldLabel(key)}: ${displayValue(nestedValue, key)}`)
      .join("\n");
  }
  return displayScalar(value, field);
}

function EventDetailDialog({ event, onClose }: {
  event: AssessmentHistoryEvent | null;
  onClose: () => void;
}) {
  if (!event) return null;
  const cfg = ACTION_CONFIG[event.action];
  const oldObj = parseObject(event.old_content);
  const newObj = parseObject(event.new_content);
  const keys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]))
    .filter(key => !isInternalField(key))
    .filter(key => event.action === "deleted" || String(oldObj[key] ?? "") !== String(newObj[key] ?? ""));
  const entityLabel = ENTITY_LABELS[event.entity_type] ?? event.entity_type;

  return (
    <Dialog open={!!event} onOpenChange={open => !open && onClose()}>
      <DialogContent className="w-[80vw] max-w-[80vw] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex min-w-0 flex-wrap items-center gap-2 pr-6 text-sm">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${cfg.bg} ${cfg.border} ${cfg.text}`}>
              {cfg.icon}{cfg.label}
            </span>
            <span className="min-w-0 break-words font-bold text-slate-700">{event.entity_code || event.entity_name || entityLabel}</span>
            <span className="whitespace-nowrap text-slate-400 font-normal">{fmtDateTime(eventTime(event))}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="shrink-0 text-xs text-slate-500 space-y-0.5 -mt-1">
          <div><span className="font-medium">Đối tượng:</span> {entityLabel}{event.entity_name ? ` — ${event.entity_name}` : ""}</div>
          <div><span className="font-medium">Khu vực:</span> {SCOPE_LABELS[event.scope]}</div>
          {event.user_name && <div><span className="font-medium">Thực hiện bởi:</span> {event.user_name}</div>}
          {event.location_name && <div><span className="font-medium">Cơ sở:</span> {event.location_name}</div>}
        </div>
        {keys.length > 0 ? (
          <div className="mt-2 min-h-0 flex-1 overflow-auto">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
              {event.action === "deleted" ? "Thông tin đã xoá" : event.action === "updated" ? "Các trường bị thay đổi" : "Thông tin tạo mới"}
            </p>
            <table className="w-full table-fixed text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className={`${event.action === "updated" ? "w-[18%]" : "w-[28%]"} text-left py-1.5 pr-3 font-semibold text-slate-500`}>Trường</th>
                  {event.action === "updated" && <th className="w-[41%] text-left py-1.5 pr-3 font-semibold text-red-400">Trước</th>}
                  <th className="text-left py-1.5 font-semibold text-emerald-600">{event.action === "updated" ? "Sau" : "Giá trị"}</th>
                </tr>
              </thead>
              <tbody>
                {keys.map(key => (
                  <tr key={key} className="border-b border-slate-50">
                    <td className="py-2 pr-3 font-medium text-slate-600 align-top break-words">{fieldLabel(key)}</td>
                    {event.action === "updated" && (
                      <td className="py-2 pr-3 align-top">
                        <span className="inline-block max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] bg-red-50 text-red-700 px-1.5 py-0.5 rounded line-through">{displayValue(oldObj[key], key)}</span>
                      </td>
                    )}
                    <td className="py-2 align-top">
                      <span className={`inline-block max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${event.action === "deleted" ? "bg-slate-100 text-slate-700" : "bg-emerald-50 text-emerald-700"} px-1.5 py-0.5 rounded`}>
                        {displayValue(event.action === "updated" ? newObj[key] : oldObj[key] ?? newObj[key], key)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-slate-400 mt-2 italic">Không có chi tiết thay đổi được ghi lại cho sự kiện này.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AssessmentHistoryTab() {
  const [quickRange, setQuickRange] = useState<QuickRange>("7d");
  const [scope, setScope] = useState("all");
  const [action, setAction] = useState("all");
  const [page, setPage] = useState(1);
  const [detailEvent, setDetailEvent] = useState<AssessmentHistoryEvent | null>(null);
  const [pageSize, setPageSize] = useState(50);
  const { from, to } = quickRangeDates(quickRange);
  const params = new URLSearchParams();
  if (from) params.set("dateFrom", from);
  if (to) params.set("dateTo", to);
  if (scope !== "all") params.set("scope", scope);
  if (action !== "all") params.set("action", action);
  params.set("limit", String(pageSize));
  params.set("offset", String((page - 1) * pageSize));

  const { data, isLoading } = useQuery<HistoryResponse>({
    queryKey: ["/api/assessments/history", from, to, scope, action, page, pageSize],
    queryFn: async () => {
      const response = await fetch(`/api/assessments/history?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Không thể tải lịch sử");
      return response.json();
    },
    staleTime: 30_000,
  });

  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const groups = events.reduce<Map<string, AssessmentHistoryEvent[]>>((map, event) => {
    const key = dateKey(eventTime(event));
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(event);
    return map;
  }, new Map());

  const changeFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
          {([
            ["all", "Toàn thời gian"], ["today", "Hôm nay"], ["7d", "7 ngày"], ["30d", "30 ngày"], ["thismonth", "Tháng này"],
          ] as [QuickRange, string][]).map(([value, label]) => (
            <button key={value} onClick={() => { setQuickRange(value); setPage(1); }} className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${quickRange === value ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {label}
            </button>
          ))}
        </div>
        <Select value={scope} onValueChange={value => changeFilter(setScope, value)}>
          <SelectTrigger className="h-8 w-[190px] text-xs border-slate-200 bg-white"><SelectValue placeholder="Tất cả khu vực" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả khu vực</SelectItem>
            <SelectItem value="list">Danh sách bài kiểm tra</SelectItem>
            <SelectItem value="question-bank">Ngân hàng câu hỏi</SelectItem>
            <SelectItem value="results">Kết quả bài làm</SelectItem>
          </SelectContent>
        </Select>
        <Select value={action} onValueChange={value => changeFilter(setAction, value)}>
          <SelectTrigger className="h-8 w-[140px] text-xs border-slate-200 bg-white"><SelectValue placeholder="Tất cả thao tác" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả thao tác</SelectItem>
            <SelectItem value="created">Thêm mới</SelectItem>
            <SelectItem value="updated">Chỉnh sửa</SelectItem>
            <SelectItem value="deleted">Xoá</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(pageSize)} onValueChange={value => { setPageSize(Number(value)); setPage(1); }}>
          <SelectTrigger className="h-8 w-[100px] text-xs border-slate-200 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="50">50 / trang</SelectItem>
            <SelectItem value="100">100 / trang</SelectItem>
            <SelectItem value="200">200 / trang</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarIcon className="h-3.5 w-3.5" />
          {from && to ? `${format(new Date(`${from}T00:00`), "dd/MM/yyyy")} – ${format(new Date(`${to}T00:00`), "dd/MM/yyyy")}` : "Toàn thời gian"}
          <span className="ml-2 font-medium text-slate-600">{total} sự kiện</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground"><div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" /><p className="text-sm">Đang tải lịch sử...</p></div>
        ) : groups.size === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground"><History className="h-12 w-12 opacity-15" /><p className="text-sm">Không có thao tác nào trong khoảng thời gian này</p></div>
        ) : (
          <div className="space-y-6">
            {Array.from(groups.entries()).map(([key, group]) => (
              <div key={key}>
                <div className="flex items-center gap-2 mb-2 sticky top-0 bg-slate-50/90 py-1 px-2 rounded-lg backdrop-blur-sm z-10"><div className="h-px flex-1 bg-slate-200" /><span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{fmtDateGroup(eventTime(group[0]))}</span><div className="h-px flex-1 bg-slate-200" /></div>
                <div className="space-y-1.5">
                  {group.map(event => {
                    const cfg = ACTION_CONFIG[event.action];
                    return (
                      <div key={event.id} className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-white border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all group">
                        <div className={`mt-0.5 flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full border ${cfg.bg} ${cfg.border}`}><span className={cfg.text}>{cfg.icon}</span></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.text}`}>{cfg.label}</span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{SCOPE_LABELS[event.scope]}</span>
                            <span className="text-xs font-bold text-slate-700">{event.entity_code || event.entity_name || "—"}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className="text-xs text-slate-600">{ENTITY_LABELS[event.entity_type] ?? event.entity_type}{event.entity_name && event.entity_code ? ` — ${event.entity_name}` : ""}</span>
                            {event.location_name && <span className="text-[11px] text-slate-400">{event.location_name}</span>}
                            {event.user_name && <span className="text-[11px] text-slate-400">bởi {event.user_name}</span>}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right flex flex-col items-end gap-1">
                          <p className="text-[10px] text-slate-400">{fmtDateTime(eventTime(event))}</p>
                          <button onClick={() => setDetailEvent(event)} className="mt-0.5 flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600" title="Xem chi tiết"><Eye className="h-3 w-3" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {totalPages > 1 && <div className="shrink-0 flex items-center justify-between text-xs text-muted-foreground pt-1"><span>{total} sự kiện — trang {page}/{totalPages}</span><div className="flex items-center gap-1"><Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(1)}>«</Button><Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button><span className="px-2">Trang {page}/{totalPages}</span><Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button><Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</Button></div></div>}
      <EventDetailDialog event={detailEvent} onClose={() => setDetailEvent(null)} />
    </div>
  );
}