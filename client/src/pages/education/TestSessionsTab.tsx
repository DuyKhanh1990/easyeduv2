import { useState, useMemo, useEffect, useRef } from "react";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { TestSessionDetailDialog } from "@/components/education/TestSessionDetailDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Plus, FlaskConical, Users, Clock, BookOpen, FileText, Pencil, Trash2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, X, Search, Loader2, MapPin, CalendarDays, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATIC_STALE_TIME } from "@/lib/queryClient";

// ─── Types ───────────────────────────────────────────────────────────────────
interface StudentResult {
  attendance: "present" | "absent" | null;
  scoreOnline: number | null;
  scoreOffline: number | null;
}

interface TestSession {
  id: string;
  title: string;
  locationId: string | null;
  locationName: string | null;
  testDate: string;
  timeStart: string;
  timeEnd: string;
  teacherIds: string[];
  teachers: { id: string; fullName: string; code: string }[];
  examIds: string[];
  examsData: { id: string; name: string; code: string }[];
  assignmentIds: string[];
  assignmentsData?: { id: string; title: string; type: string }[];
  studentIds: string[];
  studentCount: number;
  studentResults: Record<string, StudentResult>;
  studentsData?: { id: string; fullName: string; code: string }[];
  contentSettings?: Record<string, { availableAt: string; maxAttempts: number }>;
  notes: string | null;
}

type ContentSetting = { availableAt: string; maxAttempts: number };

interface StudentItem {
  id: string;
  fullName: string;
  code: string;
}

interface CourseContent {
  id: string;
  programId: string;
  sessionNumber: string;
  title: string;
  type: string;
  content: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDayLabel(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const days = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
  return `${days[date.getDay()]}, Ngày ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

function computeStatus(session: TestSession): "upcoming" | "ongoing" | "ended" {
  const now = new Date();
  const dateStr = session.testDate?.slice(0, 10);
  if (!dateStr) return "upcoming";
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (dateStr > todayStr) return "upcoming";
  if (dateStr < todayStr) return "ended";
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (!session.timeStart) return "upcoming";
  if (nowTime < session.timeStart) return "upcoming";
  if (session.timeEnd && nowTime > session.timeEnd) return "ended";
  return "ongoing";
}

const STATUS_CONFIG = {
  upcoming: { label: "Chưa đến giờ", color: "bg-blue-100 text-blue-700 border-blue-200" },
  ongoing:  { label: "Đang test",    color: "bg-green-100 text-green-700 border-green-200" },
  ended:    { label: "Đã kết thúc",  color: "bg-red-100 text-red-600 border-red-200" },
};

const CARD_STATUS_CONFIG = {
  upcoming: {
    label: "Chưa đến giờ",
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    border: "border-l-violet-400",
    iconBg: "bg-violet-50",
    iconColor: "text-violet-500",
  },
  ongoing: {
    label: "Đang test",
    badge: "bg-green-50 text-green-700 border-green-200",
    border: "border-l-green-400",
    iconBg: "bg-green-50",
    iconColor: "text-green-500",
  },
  ended: {
    label: "Đã kết thúc",
    badge: "bg-red-50 text-red-600 border-red-200",
    border: "border-l-red-400",
    iconBg: "bg-red-50",
    iconColor: "text-red-500",
  },
};

// ─── Empty form (kept for patchMutation type reference) ───────────────────────
const EMPTY_FORM = {
  title: "",
  locationId: "",
  testDate: new Date().toISOString().slice(0, 10),
  timeStart: "",
  timeEnd: "",
  teacherIds: [] as string[],
  examIds: [] as string[],
  assignmentIds: [] as string[],
  studentIds: [] as string[],
  studentCount: 0,
  contentSettings: {} as Record<string, ContentSetting>,
  studentResults: {} as Record<string, StudentResult>,
  notes: "",
};

// ─── Weekdays ─────────────────────────────────────────────────────────────────
const WEEKDAYS = [
  { value: 1, label: "T2" },
  { value: 2, label: "T3" },
  { value: 3, label: "T4" },
  { value: 4, label: "T5" },
  { value: 5, label: "T6" },
  { value: 6, label: "T7" },
  { value: 0, label: "CN" },
];

// ─── Generate session dates from cycle config ─────────────────────────────────
function generateSessionDates(
  startDate: string,
  endType: "date" | "sessions",
  endDate: string,
  sessionCount: number,
  weekdays: number[],
): string[] {
  if (!startDate || weekdays.length === 0) return [];
  const [y, m, d] = startDate.split("-").map(Number);
  const cur = new Date(y, m - 1, d);
  const dates: string[] = [];
  const MAX = 730;
  let iters = 0;
  if (endType === "date" && endDate) {
    const [ey, em, ed] = endDate.split("-").map(Number);
    const end = new Date(ey, em - 1, ed);
    while (cur <= end && iters < MAX) {
      if (weekdays.includes(cur.getDay())) {
        dates.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`);
      }
      cur.setDate(cur.getDate() + 1);
      iters++;
    }
  } else {
    while (dates.length < sessionCount && iters < MAX) {
      if (weekdays.includes(cur.getDay())) {
        dates.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`);
      }
      cur.setDate(cur.getDate() + 1);
      iters++;
    }
  }
  return dates;
}

// ─── Multi-session create types ────────────────────────────────────────────────
const EMPTY_BASE = {
  title: "",
  locationId: "",
  teacherIds: [] as string[],
  studentIds: [] as string[],
  studentCount: 0,
  contentSettings: {} as Record<string, ContentSetting>,
  studentResults: {} as Record<string, StudentResult>,
  notes: "",
};

interface ScheduleRow {
  _key: string;
  testDate: string;
  timeStart: string;
  timeEnd: string;
}

function newScheduleRow(): ScheduleRow {
  return {
    _key: `sr-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    testDate: new Date().toISOString().slice(0, 10),
    timeStart: "",
    timeEnd: "",
  };
}

// ─── Add Student Dialog ──────────────────────────────────────────────────────
function AddStudentDialog({
  open,
  onOpenChange,
  session,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: TestSession | null;
  onSave: (studentIds: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: rawStudentsData, isLoading } = useQuery<any>({
    queryKey: ["/api/students"],
    staleTime: STATIC_STALE_TIME,
    enabled: open,
  });

  const students: StudentItem[] = useMemo(() => {
    const arr = Array.isArray(rawStudentsData)
      ? rawStudentsData
      : (rawStudentsData?.students ?? []);
    return arr.map((s: any) => ({ id: s.id, fullName: s.fullName, code: s.code }));
  }, [rawStudentsData]);

  useEffect(() => {
    if (open && session) {
      setSelected(new Set(session.studentIds ?? []));
      setSearch("");
    }
  }, [open, session]);

  const filtered = useMemo(() => {
    if (!search.trim()) return students;
    const q = search.toLowerCase();
    return students.filter(s =>
      s.fullName.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
    );
  }, [students, search]);

  const allChecked = filtered.length > 0 && filtered.every(s => selected.has(s.id));

  function toggleAll(checked: boolean) {
    const next = new Set(selected);
    filtered.forEach(s => checked ? next.add(s.id) : next.delete(s.id));
    setSelected(next);
  }

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  function handleConfirm() {
    onSave(Array.from(selected));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Thêm học viên vào lớp</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm theo tên / mã học viên..."
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="rounded-lg border max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allChecked} onCheckedChange={v => toggleAll(!!v)} />
                  </TableHead>
                  <TableHead>Tên học viên</TableHead>
                  <TableHead>Mã</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                      Không tìm thấy học viên
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(s => (
                    <TableRow key={s.id} className="cursor-pointer" onClick={() => toggle(s.id)}>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} />
                      </TableCell>
                      <TableCell className="font-medium">{s.fullName}</TableCell>
                      <TableCell className="text-muted-foreground">{s.code}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button
            onClick={handleConfirm}
            className="bg-primary hover:bg-primary/90"
          >
            Thêm đã chọn ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Test Content Dialog ─────────────────────────────────────────────────
const TEST_CONTENT_TYPES = [
  { key: "Bài tập về nhà", label: "Bài tập về nhà", field: "assignmentIds" as const },
  { key: "Bài kiểm tra",   label: "Bài kiểm tra",   field: "examIds" as const },
];

function AddTestContentDialog({
  open,
  onOpenChange,
  session,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: TestSession | null;
  onSave: (assignmentIds: string[], examIds: string[], contentSettings: Record<string, ContentSetting>) => void;
}) {
  const [activeType, setActiveType] = useState<"Bài tập về nhà" | "Bài kiểm tra">("Bài tập về nhà");
  const [search, setSearch] = useState("");
  const [selectedAssignments, setSelectedAssignments] = useState<string[]>([]);
  const [selectedExams, setSelectedExams] = useState<string[]>([]);
  const [contentSettings, setContentSettings] = useState<Record<string, ContentSetting>>({});

  const { data: allContents = [], isLoading: isLoadingContents } = useQuery<CourseContent[]>({
    queryKey: ["/api/course-program-contents"],
    queryFn: async () => {
      const res = await fetch("/api/course-program-contents?pageSize=500", {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      return Array.isArray(json) ? json : (json.items ?? []);
    },
    staleTime: STATIC_STALE_TIME,
    enabled: open,
  });

  const { data: allExams = [], isLoading: isLoadingExams } = useQuery<{ id: string; name: string; code: string }[]>({
    queryKey: ["/api/exams"],
    staleTime: STATIC_STALE_TIME,
    enabled: open,
  });

  const isLoading = isLoadingContents || isLoadingExams;

  const prevOpenRef = useRef(false);
  const initializedRef = useRef(false);
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open) { initializedRef.current = false; return; }
    if ((justOpened || !initializedRef.current) && session) {
      initializedRef.current = true;
      setSelectedAssignments(session.assignmentIds ?? []);
      setSelectedExams(session.examIds ?? []);
      setContentSettings((session.contentSettings as Record<string, ContentSetting>) ?? {});
      setSearch("");
      setActiveType("Bài tập về nhà");
    }
  }, [open, session]);

  const filteredContents = useMemo(() => {
    const q = search.toLowerCase();
    if (activeType === "Bài kiểm tra") {
      return allExams
        .filter(e => !q || e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q))
        .map(e => ({ id: e.id, title: e.name, content: e.code, type: "Bài kiểm tra", programId: "", sessionNumber: "" }));
    }
    return allContents.filter(c =>
      c.type === activeType &&
      (!q || c.title.toLowerCase().includes(q))
    );
  }, [allContents, allExams, activeType, search]);

  const currentSelected = activeType === "Bài tập về nhà" ? selectedAssignments : selectedExams;

  function toggle(id: string) {
    if (activeType === "Bài tập về nhà") {
      setSelectedAssignments(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    } else {
      setSelectedExams(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    }
  }

  function removeItem(id: string, field: "assignmentIds" | "examIds") {
    if (field === "assignmentIds") setSelectedAssignments(p => p.filter(x => x !== id));
    else setSelectedExams(p => p.filter(x => x !== id));
    setContentSettings(prev => { const next = { ...prev }; delete next[id]; return next; });
  }

  function updateSetting(id: string, key: "availableAt" | "maxAttempts", value: string | number) {
    setContentSettings(prev => ({
      ...prev,
      [id]: { availableAt: prev[id]?.availableAt ?? "", maxAttempts: prev[id]?.maxAttempts ?? 1, [key]: value },
    }));
  }

  function getTitle(id: string) {
    const exam = allExams.find(e => e.id === id);
    if (exam) return exam.name;
    return allContents.find(c => c.id === id)?.title ?? id;
  }

  function handleConfirm() {
    onSave(selectedAssignments, selectedExams, contentSettings);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle>Thêm bài test</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: picker */}
          <div className="flex flex-col flex-1 min-w-0 border-r p-4 gap-3">
            <div className="flex gap-2">
              {TEST_CONTENT_TYPES.map(t => (
                <button
                  key={t.key}
                  onClick={() => { setActiveType(t.key as any); setSearch(""); }}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    activeType === t.key ? "bg-primary text-white" : "bg-muted text-foreground hover:bg-muted/80"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={`Tìm ${activeType.toLowerCase()}...`}
                className="pl-9 h-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <ScrollArea className="flex-1 min-h-0 max-h-72">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredContents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Không có {activeType.toLowerCase()} nào</p>
              ) : (
                <div className="space-y-1 pr-2">
                  {filteredContents.map(c => {
                    const isChecked = currentSelected.includes(c.id);
                    return (
                      <div
                        key={c.id}
                        onClick={() => toggle(c.id)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors border",
                          isChecked ? "bg-primary/5 border-primary/20" : "bg-background border-transparent hover:bg-muted"
                        )}
                      >
                        <Checkbox checked={isChecked} onCheckedChange={() => toggle(c.id)} onClick={e => e.stopPropagation()} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium line-clamp-1">{c.title}</p>
                          {c.content && <p className="text-xs text-muted-foreground line-clamp-1">{c.content}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Right: selected items with time + attempt settings */}
          <div className="w-72 shrink-0 p-4 space-y-4 overflow-y-auto">
            {TEST_CONTENT_TYPES.map(t => {
              const ids = t.field === "assignmentIds" ? selectedAssignments : selectedExams;
              return (
                <div key={t.key}>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">{t.label}</p>
                  {ids.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Chưa chọn</p>
                  ) : (
                    <div className="space-y-2">
                      {ids.map(id => (
                        <div key={id} className="bg-muted/60 rounded-lg p-2 space-y-1.5 border border-border/50">
                          <div className="flex items-start gap-1.5">
                            <span className="flex-1 text-xs font-medium line-clamp-2 leading-snug">{getTitle(id)}</span>
                            <button onClick={() => removeItem(id, t.field)} className="shrink-0 text-muted-foreground hover:text-destructive mt-0.5">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Mở lúc</label>
                              <Input
                                type="time"
                                className="h-7 text-xs px-2"
                                value={contentSettings[id]?.availableAt ?? ""}
                                onChange={e => updateSetting(id, "availableAt", e.target.value)}
                                onClick={e => e.stopPropagation()}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Số lần</label>
                              <Input
                                type="number"
                                min={0}
                                className="h-7 text-xs px-2"
                                placeholder="∞"
                                value={contentSettings[id]?.maxAttempts ?? ""}
                                onChange={e => updateSetting(id, "maxAttempts", parseInt(e.target.value) || 0)}
                                onClick={e => e.stopPropagation()}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button onClick={handleConfirm}>
            Lưu ({selectedAssignments.length + selectedExams.length} mục)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function TestSessionsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Dialog state
  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [baseForm, setBaseForm] = useState({ ...EMPTY_BASE });
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([newScheduleRow()]);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  // Calendar navigation
  const [calendarViewMode, setCalendarViewMode] = useState<"day" | "week">("week");
  const [calendarDate, setCalendarDate] = useState(new Date());

  // Cycle schedule state (create mode only)
  const today = new Date().toISOString().slice(0, 10);
  const [cycleStartDate, setCycleStartDate] = useState(today);
  const [cycleEndType, setCycleEndType] = useState<"date" | "sessions">("sessions");
  const [cycleEndDate, setCycleEndDate] = useState("");
  const [cycleSessionCount, setCycleSessionCount] = useState(1);
  const [cycleWeekdays, setCycleWeekdays] = useState<number[]>([]);
  const [cycleWeekdayTimes, setCycleWeekdayTimes] = useState<Record<number, { timeStart: string; timeEnd: string; roomId: string; teacherIds: string[] }>>({});

  // Preview of generated dates
  const previewDates = generateSessionDates(cycleStartDate, cycleEndType, cycleEndDate, cycleSessionCount, cycleWeekdays);

  // Add student popup
  const [addStudentSession, setAddStudentSession] = useState<TestSession | null>(null);
  // Add test content popup
  const [addContentSession, setAddContentSession] = useState<TestSession | null>(null);
  // Detail view
  const [detailSessionId, setDetailSessionId] = useState<string | null>(null);

  // Data fetching
  const { data: sessions = [], isLoading } = useQuery<TestSession[]>({
    queryKey: ["/api/test-sessions"],
    staleTime: 0,
  });

  const { data: locations = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/locations"],
    staleTime: STATIC_STALE_TIME,
  });

  const { data: staffList = [] } = useQuery<{ id: string; fullName: string; code: string }[]>({
    queryKey: ["/api/staff", "minimal"],
    queryFn: async () => {
      const res = await fetch("/api/staff?minimal=true", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch staff");
      return res.json();
    },
    staleTime: STATIC_STALE_TIME,
  });

  const { data: exams = [] } = useQuery<{ id: string; name: string; code: string }[]>({
    queryKey: ["/api/exams"],
    staleTime: STATIC_STALE_TIME,
  });

  const { data: classrooms = [] } = useQuery<{ id: string; name: string; locationId: string }[]>({
    queryKey: ["/api/classrooms"],
    staleTime: STATIC_STALE_TIME,
  });

  // ─── Mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (data: typeof EMPTY_FORM) => apiRequest("POST", "/api/test-sessions", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/test-sessions"] });
      toast({ title: "Đã tạo lớp test." });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  const createBatchMutation = useMutation({
    mutationFn: async (sessions: (typeof EMPTY_FORM)[]) => {
      for (const data of sessions) {
        await apiRequest("POST", "/api/test-sessions", data);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/test-sessions"] });
      toast({ title: `Đã tạo ${scheduleRows.length} lớp test thành công.` });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof EMPTY_FORM }) =>
      apiRequest("PUT", `/api/test-sessions/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/test-sessions"] });
      toast({ title: "Đã cập nhật." });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<typeof EMPTY_FORM> }) => {
      const session = sessions.find(s => s.id === id);
      if (!session) throw new Error("Not found");
      const data: typeof EMPTY_FORM = {
        title: session.title,
        locationId: session.locationId ?? "",
        testDate: session.testDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        timeStart: session.timeStart ?? "",
        timeEnd: session.timeEnd ?? "",
        teacherIds: session.teacherIds ?? [],
        examIds: session.examIds ?? [],
        assignmentIds: session.assignmentIds ?? [],
        studentIds: session.studentIds ?? [],
        studentCount: session.studentCount ?? 0,
        contentSettings: (session.contentSettings as Record<string, ContentSetting>) ?? {},
        studentResults: (session.studentResults as Record<string, StudentResult>) ?? {},
        notes: session.notes ?? "",
        ...patch,
      };
      return apiRequest("PUT", `/api/test-sessions/${id}`, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/test-sessions"] });
    },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/test-sessions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/test-sessions"] });
      toast({ title: "Đã xóa." });
    },
  });


  function openCreate() {
    setEditId(null);
    setBaseForm({ ...EMPTY_BASE });
    setScheduleRows([newScheduleRow()]);
    // Reset cycle config
    const t = new Date().toISOString().slice(0, 10);
    setCycleStartDate(t);
    setCycleEndType("sessions");
    setCycleEndDate("");
    setCycleSessionCount(1);
    setCycleWeekdays([]);
    setCycleWeekdayTimes({});
    setIsOpen(true);
  }

  function openEdit(s: TestSession) {
    setEditId(s.id);
    setBaseForm({
      title: s.title,
      locationId: s.locationId ?? "",
      teacherIds: s.teacherIds ?? [],
      studentIds: s.studentIds ?? [],
      studentCount: s.studentCount ?? 0,
      contentSettings: (s.contentSettings as Record<string, ContentSetting>) ?? {},
      studentResults: (s.studentResults as Record<string, StudentResult>) ?? {},
      notes: s.notes ?? "",
    });
    setScheduleRows([{
      _key: "edit",
      testDate: s.testDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      timeStart: s.timeStart ?? "",
      timeEnd: s.timeEnd ?? "",
    }]);
    setIsOpen(true);
  }

  function closeDialog() {
    setIsOpen(false);
    setEditId(null);
  }

  function handleSubmit() {
    if (!baseForm.title.trim()) { toast({ title: "Vui lòng nhập tiêu đề.", variant: "destructive" }); return; }
    if (editId) {
      const row = scheduleRows[0];
      updateMutation.mutate({
        id: editId,
        data: {
          title: baseForm.title,
          locationId: baseForm.locationId,
          testDate: row.testDate,
          timeStart: row.timeStart,
          timeEnd: row.timeEnd,
          teacherIds: baseForm.teacherIds,
          examIds: [],
          assignmentIds: [],
          studentIds: baseForm.studentIds,
          studentCount: baseForm.studentCount,
          contentSettings: baseForm.contentSettings,
          studentResults: baseForm.studentResults,
          notes: baseForm.notes,
        },
      });
    } else {
      if (!cycleStartDate) { toast({ title: "Vui lòng chọn ngày bắt đầu.", variant: "destructive" }); return; }
      if (cycleWeekdays.length === 0) { toast({ title: "Vui lòng chọn ít nhất một thứ trong tuần.", variant: "destructive" }); return; }
      if (cycleEndType === "date" && !cycleEndDate) { toast({ title: "Vui lòng chọn ngày kết thúc.", variant: "destructive" }); return; }
      if (cycleEndType === "sessions" && cycleSessionCount < 1) { toast({ title: "Vui lòng nhập số buổi hợp lệ.", variant: "destructive" }); return; }
      const dates = generateSessionDates(cycleStartDate, cycleEndType, cycleEndDate, cycleSessionCount, cycleWeekdays);
      if (dates.length === 0) { toast({ title: "Không tạo được buổi nào từ cấu hình chu kỳ.", variant: "destructive" }); return; }
      createBatchMutation.mutate(
        dates.map(date => {
          const [y, m, d] = date.split("-").map(Number);
          const wd = new Date(y, m - 1, d).getDay();
          const times = cycleWeekdayTimes[wd] ?? { timeStart: "", timeEnd: "", roomId: "", teacherIds: [] };
          return {
            title: baseForm.title,
            locationId: baseForm.locationId,
            testDate: date,
            timeStart: times.timeStart,
            timeEnd: times.timeEnd,
            teacherIds: times.teacherIds,
            examIds: [],
            assignmentIds: [],
            studentIds: [],
            studentCount: baseForm.studentCount,
            contentSettings: baseForm.contentSettings,
            studentResults: {},
            notes: baseForm.notes,
          };
        })
      );
    }
  }

  function toggleTeacher(id: string) {
    setBaseForm(f => ({
      ...f,
      teacherIds: f.teacherIds.includes(id) ? f.teacherIds.filter(x => x !== id) : [...f.teacherIds, id],
    }));
  }

  function addScheduleRow() {
    setScheduleRows(prev => [...prev, newScheduleRow()]);
  }

  function removeScheduleRow(key: string) {
    setScheduleRows(prev => prev.filter(r => r._key !== key));
  }

  function updateScheduleRow(key: string, field: keyof Omit<ScheduleRow, "_key">, value: string) {
    setScheduleRows(prev => prev.map(r => r._key === key ? { ...r, [field]: value } : r));
  }

  function toggleNotes(id: string) {
    setExpandedNotes(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const isSaving = createMutation.isPending || createBatchMutation.isPending || updateMutation.isPending;

  function formatSidebarDate(d: string) {
    if (!d) return "";
    const date = new Date(d + "T00:00:00");
    const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    const dayName = days[date.getDay()];
    const todayStr = new Date().toISOString().slice(0, 10);
    const isToday = d === todayStr;
    return `${dayName}, ${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}${isToday ? " (Hôm nay)" : ""}`;
  }

  // Calendar date range computed from calendarDate + calendarViewMode
  const { calendarFrom, calendarTo, calendarLabel } = useMemo(() => {
    const d = calendarDate;
    const pad = (n: number) => String(n).padStart(2, "0");
    const toStr = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    const dayNames = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
    if (calendarViewMode === "day") {
      const dateStr = toStr(d);
      const label = `${dayNames[d.getDay()]}, ngày ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
      return { calendarFrom: dateStr, calendarTo: dateStr, calendarLabel: label };
    } else {
      const dayOfWeek = d.getDay();
      const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const mon = new Date(d);
      mon.setDate(d.getDate() + diffToMon);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      const monStr = toStr(mon);
      const sunStr = toStr(sun);
      const label = `${dayNames[mon.getDay()]}, ${pad(mon.getDate())}/${pad(mon.getMonth() + 1)} – ${dayNames[sun.getDay()]}, ${pad(sun.getDate())}/${pad(sun.getMonth() + 1)}/${sun.getFullYear()}`;
      return { calendarFrom: monStr, calendarTo: sunStr, calendarLabel: label };
    }
  }, [calendarDate, calendarViewMode]);

  // Filtered sessions by current calendar range
  const filteredGrouped = useMemo(() => {
    const filtered = sessions.filter(s => {
      const dateStr = s.testDate?.slice(0, 10);
      if (!dateStr) return false;
      return dateStr >= calendarFrom && dateStr <= calendarTo;
    });
    const map = new Map<string, TestSession[]>();
    for (const s of filtered) {
      const key = s.testDate?.slice(0, 10) ?? "";
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [sessions, calendarFrom, calendarTo]);

  // Sidebar: today's sessions
  const todaySessions = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return sessions
      .filter(s => s.testDate?.slice(0, 10) === todayStr)
      .sort((a, b) => (a.timeStart ?? "").localeCompare(b.timeStart ?? ""));
  }, [sessions]);

  // Sidebar: upcoming sessions grouped by date
  // If today has sessions → 2 next future dates (after today)
  // If today has no sessions → 2 dates closest to today (any direction)
  const upcomingGrouped = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const hasTodaySessions = sessions.some(s => s.testDate?.slice(0, 10) === todayStr);
    const map = new Map<string, TestSession[]>();
    for (const s of sessions) {
      const key = s.testDate?.slice(0, 10) ?? "";
      if (!key || key === todayStr) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    const allEntries = Array.from(map.entries());
    // Always only show future dates (strictly after today), sorted ascending
    return allEntries
      .filter(([d]) => d > todayStr)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, 2);
  }, [sessions]);

  function navigateCalendar(dir: 1 | -1) {
    setCalendarDate(prev => {
      const next = new Date(prev);
      if (calendarViewMode === "day") {
        next.setDate(next.getDate() + dir);
      } else {
        next.setDate(next.getDate() + dir * 7);
      }
      return next;
    });
  }

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Full-width button row: button flush right */}
      <div className="shrink-0 flex justify-end">
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />Thêm mới Lớp TEST
        </Button>
      </div>

      {/* Two-column layout: main calendar + sidebar */}
      <div className="flex-1 overflow-hidden flex gap-4">
        {/* ── Main content ── */}
        <div className="flex-1 min-w-0 overflow-auto flex flex-col gap-4 pb-4">

          {/* Date navigation bar */}
          <div className="sticky top-0 z-10 bg-card border rounded-xl px-4 py-3 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateCalendar(-1)}
                className="p-1.5 rounded-lg hover:bg-muted border border-border transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2 px-4 py-1.5 border rounded-lg bg-background text-sm font-medium min-w-[260px] justify-center shadow-sm">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <span>{calendarLabel}</span>
              </div>
              <button
                onClick={() => navigateCalendar(1)}
                className="p-1.5 rounded-lg hover:bg-muted border border-border transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              <button
                onClick={() => setCalendarViewMode("day")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  calendarViewMode === "day" ? "bg-white shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Ngày
              </button>
              <button
                onClick={() => setCalendarViewMode("week")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  calendarViewMode === "week" ? "bg-white shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Tuần
              </button>
            </div>
          </div>

          {/* Sessions */}
          {isLoading ? (
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : filteredGrouped.length === 0 ? (
            <div className="py-24 text-center text-muted-foreground">
              <FlaskConical className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Không có lớp TEST nào trong {calendarViewMode === "day" ? "ngày" : "tuần"} này.</p>
            </div>
          ) : (
            filteredGrouped.map(([date, daySessions]) => (
              <div key={date} className="space-y-3">
                {/* Day header */}
                <div className="flex items-center gap-2 mb-3">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">{formatDayLabel(date)}</span>
                </div>

                {/* 3-col card grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {daySessions.map(s => {
                    const status = computeStatus(s);
                    const cfg = CARD_STATUS_CONFIG[status];
                    const addedCount = (s.studentIds ?? []).length;
                    const expectedCount = s.studentCount ?? 0;
                    return (
                      <div
                        key={s.id}
                        onClick={() => setDetailSessionId(s.id)}
                        className={cn(
                          "relative rounded-xl border bg-card shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden border-l-4",
                          cfg.border,
                          status === "ongoing" && "ring-1 ring-green-200",
                        )}
                      >
                        <div className="p-4 space-y-3">
                          {/* Row 1: flask icon + title + location */}
                          <div className="flex items-start gap-2.5">
                            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5", cfg.iconBg)}>
                              <FlaskConical className={cn("h-4 w-4", cfg.iconColor)} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-foreground leading-snug line-clamp-1">{s.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{s.locationName || "—"}</p>
                            </div>
                          </div>

                          {/* Row 2: status badge (left) + edit/delete (right) — NO overlap */}
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn("inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap", cfg.badge)}>
                              {cfg.label}
                            </span>
                            <div className="flex gap-0.5 shrink-0">
                              <button
                                onClick={e => { e.stopPropagation(); openEdit(s); }}
                                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); if (confirm("Xóa lớp test này?")) deleteMutation.mutate(s.id); }}
                                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Info rows */}
                          <div className="space-y-1.5 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <Users className="h-3.5 w-3.5 shrink-0" />
                              <span>{addedCount}/{expectedCount} học viên</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 shrink-0" />
                              <span>{s.timeStart && s.timeEnd ? `${s.timeStart} – ${s.timeEnd}` : s.timeStart || "Chưa đặt ca"}</span>
                            </div>
                            {(s.teachers ?? []).length > 0 && (
                              <div className="flex items-center gap-1.5">
                                <span className="w-3.5 text-center text-[11px]">👤</span>
                                <span className="line-clamp-1">{s.teachers.map(t => t.fullName).join(", ")}</span>
                              </div>
                            )}
                          </div>

                          {/* Assigned content names */}
                          {((s.examsData ?? []).length > 0 || (s.assignmentsData ?? []).length > 0) && (
                            <div className="space-y-1 border-t border-border/50 pt-2">
                              {(s.examsData ?? []).map(e => (
                                <div key={e.id} className="flex items-center gap-1.5 text-xs text-foreground">
                                  <BookOpen className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                  <span className="font-medium line-clamp-1">{e.name || e.code}</span>
                                  <span className="text-muted-foreground shrink-0">(BKT)</span>
                                </div>
                              ))}
                              {(s.assignmentsData ?? []).map(a => (
                                <div key={a.id} className="flex items-center gap-1.5 text-xs text-foreground">
                                  <FileText className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                  <span className="font-medium line-clamp-1">{a.title}</span>
                                  <span className="text-muted-foreground shrink-0">(BTVN)</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Action buttons with colored icons */}
                          <div className="flex gap-2 pt-2 border-t border-border/60">
                            <button
                              onClick={e => { e.stopPropagation(); if (status !== "ended") setAddStudentSession(s); }}
                              disabled={status === "ended"}
                              className={cn(
                                "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                                status === "ended"
                                  ? "border-border/40 bg-muted/40 text-muted-foreground cursor-not-allowed opacity-50"
                                  : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                              )}
                            >
                              <Users className="h-3.5 w-3.5" />
                              Thêm học viên
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); if (status !== "ended") setAddContentSession(s); }}
                              disabled={status === "ended"}
                              className={cn(
                                "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                                status === "ended"
                                  ? "border-border/40 bg-muted/40 text-muted-foreground cursor-not-allowed opacity-50"
                                  : "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
                              )}
                            >
                              <BookOpen className="h-3.5 w-3.5" />
                              Thêm bài test
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── Right sidebar: Lịch hôm nay ── */}
        <div className="w-72 shrink-0 overflow-auto h-full">
          <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b bg-primary/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-primary">
                  {todaySessions.length > 0 ? "Lịch hôm nay" : "Lịch sắp tới"}
                </span>
              </div>
              {todaySessions.length > 0 && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                  {todaySessions.length} lịch
                </span>
              )}
            </div>

            {/* ── Case A: today has sessions ── */}
            {todaySessions.length > 0 && (
              <>
                {/* Today date label */}
                <div className="px-4 py-2 border-b bg-muted/30">
                  <p className="text-xs font-medium text-muted-foreground">{formatSidebarDate(new Date().toISOString().slice(0, 10))}</p>
                </div>

                {/* Today sessions list */}
                <div className="divide-y">
                  {todaySessions.map(s => {
                    const status = computeStatus(s);
                    const cfg = STATUS_CONFIG[status];
                    const dotColor = status === "ongoing" ? "bg-green-500" : status === "upcoming" ? "bg-blue-500" : "bg-red-400";
                    return (
                      <div
                        key={s.id}
                        onClick={() => setDetailSessionId(s.id)}
                        className="px-4 py-3 hover:bg-accent/30 cursor-pointer transition-colors space-y-1"
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <div className={cn("w-2 h-2 rounded-full shrink-0", dotColor)} />
                            <span className="text-xs font-semibold tabular-nums text-foreground">
                              {s.timeStart}{s.timeEnd ? ` – ${s.timeEnd}` : ""}
                            </span>
                          </div>
                          <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap", cfg.color)}>
                            {cfg.label}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-foreground line-clamp-1 pl-3.5">{s.title}</p>
                        {s.locationName && (
                          <p className="text-[10px] text-muted-foreground line-clamp-1 pl-3.5">{s.locationName}</p>
                        )}
                        {(s.teachers ?? []).length > 0 && (
                          <p className="text-[10px] text-muted-foreground line-clamp-1 pl-3.5">
                            👤 {s.teachers.map(t => t.fullName).join(", ")}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Upcoming: next dates after today */}
                {upcomingGrouped.length > 0 && (
                  <>
                    <div className="px-4 py-2 border-t border-b bg-muted/20 flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold text-foreground">Sắp tới</span>
                    </div>
                    <div className="divide-y">
                      {upcomingGrouped.map(([upDate, upSessions]) => (
                        <div key={upDate}>
                          <div className="px-4 py-1.5 bg-muted/10">
                            <p className="text-[10px] font-semibold text-muted-foreground">{formatSidebarDate(upDate)}</p>
                          </div>
                          {upSessions.slice(0, 3).map(s => {
                            const status = computeStatus(s);
                            const cfg = STATUS_CONFIG[status];
                            return (
                              <div
                                key={s.id}
                                onClick={() => setDetailSessionId(s.id)}
                                className="px-4 py-2.5 hover:bg-accent/30 cursor-pointer transition-colors space-y-0.5"
                              >
                                <div className="flex items-center justify-between gap-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full shrink-0 bg-orange-400" />
                                    <span className="text-[11px] font-semibold tabular-nums text-foreground">
                                      {s.timeStart}{s.timeEnd ? ` – ${s.timeEnd}` : ""}
                                    </span>
                                  </div>
                                  <span className={cn("text-[9px] font-semibold px-1 py-0.5 rounded-full border whitespace-nowrap", cfg.color)}>
                                    {cfg.label}
                                  </span>
                                </div>
                                <p className="text-xs font-medium text-foreground line-clamp-1 pl-3.5">{s.title}</p>
                                {s.locationName && (
                                  <p className="text-[10px] text-muted-foreground pl-3.5">{s.locationName}</p>
                                )}
                                {(s.teachers ?? []).length > 0 && (
                                  <p className="text-[10px] text-muted-foreground pl-3.5 line-clamp-1">
                                    👤 {s.teachers.map(t => t.fullName).join(", ")}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {/* ── Case B: no sessions today → show 2 nearest dates ── */}
            {todaySessions.length === 0 && (
              <>
                {upcomingGrouped.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-xs text-muted-foreground">Chưa có lịch test nào.</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {upcomingGrouped.map(([upDate, upSessions]) => (
                      <div key={upDate}>
                        <div className="px-4 py-2 bg-muted/20 border-b">
                          <p className="text-[10px] font-semibold text-muted-foreground">{formatSidebarDate(upDate)}</p>
                        </div>
                        {upSessions.slice(0, 4).map(s => {
                          const status = computeStatus(s);
                          const cfg = STATUS_CONFIG[status];
                          const dotColor = status === "ongoing" ? "bg-green-500" : status === "upcoming" ? "bg-blue-500" : "bg-red-400";
                          return (
                            <div
                              key={s.id}
                              onClick={() => setDetailSessionId(s.id)}
                              className="px-4 py-3 hover:bg-accent/30 cursor-pointer transition-colors space-y-1"
                            >
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex items-center gap-1.5">
                                  <div className={cn("w-2 h-2 rounded-full shrink-0", dotColor)} />
                                  <span className="text-xs font-semibold tabular-nums text-foreground">
                                    {s.timeStart}{s.timeEnd ? ` – ${s.timeEnd}` : ""}
                                  </span>
                                </div>
                                <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap", cfg.color)}>
                                  {cfg.label}
                                </span>
                              </div>
                              <p className="text-xs font-semibold text-foreground line-clamp-1 pl-3.5">{s.title}</p>
                              {s.locationName && (
                                <p className="text-[10px] text-muted-foreground line-clamp-1 pl-3.5">{s.locationName}</p>
                              )}
                              {(s.teachers ?? []).length > 0 && (
                                <p className="text-[10px] text-muted-foreground line-clamp-1 pl-3.5">
                                  👤 {s.teachers.map(t => t.fullName).join(", ")}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

          </div>
        </div>
      </div>

      {/* Detail Dialog */}
      <TestSessionDetailDialog
        sessionId={detailSessionId}
        onClose={() => setDetailSessionId(null)}
        onEdit={s => {
          setDetailSessionId(null);
          openEdit(s);
        }}
      />

      {/* Add Student Dialog */}
      <AddStudentDialog
        open={!!addStudentSession}
        onOpenChange={v => { if (!v) setAddStudentSession(null); }}
        session={addStudentSession}
        onSave={studentIds => {
          if (!addStudentSession) return;
          patchMutation.mutate(
            { id: addStudentSession.id, patch: { studentIds } },
            { onSuccess: () => toast({ title: `Đã cập nhật ${studentIds.length} học viên.` }) }
          );
          setAddStudentSession(null);
        }}
      />

      {/* Add Test Content Dialog */}
      <AddTestContentDialog
        open={!!addContentSession}
        onOpenChange={v => { if (!v) setAddContentSession(null); }}
        session={addContentSession}
        onSave={(assignmentIds, examIds, contentSettings) => {
          if (!addContentSession) return;
          patchMutation.mutate(
            { id: addContentSession.id, patch: { assignmentIds, examIds, contentSettings } },
            { onSuccess: () => toast({ title: "Đã cập nhật bài test." }) }
          );
          setAddContentSession(null);
        }}
      />

      {/* Create / Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={v => { if (!v) closeDialog(); }}>
        <DialogContent className="w-[90vw] max-w-[90vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Chỉnh sửa Lớp TEST" : "Thêm mới Lớp TEST"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">

            {/* Hàng 1: Cơ sở | Tiêu đề | Số học viên dự kiến | Ghi chú */}
            <div className="grid grid-cols-4 gap-3 items-start">
              <div>
                <label className="block text-sm font-medium mb-1.5">Cơ sở</label>
                <Select value={baseForm.locationId} onValueChange={v => setBaseForm(f => ({ ...f, locationId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn cơ sở..." />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map(l => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Tiêu đề <span className="text-destructive">*</span></label>
                <Input
                  value={baseForm.title}
                  onChange={e => setBaseForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="VD: Test Đầu vào IELTS"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Số học viên dự kiến</label>
                <Input
                  type="number"
                  min={0}
                  value={baseForm.studentCount}
                  onChange={e => setBaseForm(f => ({ ...f, studentCount: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Ghi chú</label>
                <Textarea
                  value={baseForm.notes}
                  onChange={e => setBaseForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Ghi chú thêm..."
                  rows={3}
                />
              </div>
            </div>

            {/* Giáo viên phụ trách — chỉ hiện khi chỉnh sửa */}
            {editId && (
              <div>
                <label className="block text-sm font-medium mb-1.5">Giáo viên phụ trách</label>
                <div className="border rounded-lg max-h-36 overflow-y-auto p-2 space-y-0.5 bg-background">
                  {staffList.map(s => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm select-none"
                      onClick={(e) => { e.preventDefault(); toggleTeacher(s.id); }}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                        baseForm.teacherIds.includes(s.id)
                          ? "bg-primary border-primary"
                          : "border-muted-foreground/40 bg-background"
                      )}>
                        {baseForm.teacherIds.includes(s.id) && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <span className="font-medium">{s.fullName}</span>
                      <span className="text-muted-foreground text-xs">({s.code})</span>
                    </label>
                  ))}
                  {staffList.length === 0 && <p className="text-xs text-muted-foreground px-2 py-2">Không có nhân viên.</p>}
                </div>
                {baseForm.teacherIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {baseForm.teacherIds.map(id => {
                      const s = staffList.find(x => x.id === id);
                      return s ? (
                        <span key={id} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                          {s.fullName}
                          <button type="button" onClick={() => toggleTeacher(id)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Lịch buổi test */}
            {!editId ? (
              <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
                <p className="text-sm font-semibold">Lịch buổi test (chu kỳ)</p>

                {/* Ngày bắt đầu | Loại kết thúc | Kết thúc */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1.5">Ngày bắt đầu <span className="text-destructive">*</span></label>
                    <Input
                      type="date"
                      value={cycleStartDate}
                      onChange={e => setCycleStartDate(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5">Loại kết thúc</label>
                    <Select value={cycleEndType} onValueChange={v => setCycleEndType(v as "date" | "sessions")}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sessions">Kết thúc sau số buổi</SelectItem>
                        <SelectItem value="date">Kết thúc vào ngày</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {cycleEndType === "sessions" ? (
                    <div>
                      <label className="block text-xs font-medium mb-1.5">Kết thúc sau (số buổi) <span className="text-destructive">*</span></label>
                      <Input
                        type="number"
                        min={1}
                        max={500}
                        value={cycleSessionCount}
                        onChange={e => setCycleSessionCount(parseInt(e.target.value) || 1)}
                        className="h-9"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium mb-1.5">Ngày kết thúc <span className="text-destructive">*</span></label>
                      <Input
                        type="date"
                        value={cycleEndDate}
                        onChange={e => setCycleEndDate(e.target.value)}
                        className="h-9"
                      />
                    </div>
                  )}
                </div>

                {/* Chọn chu kỳ thứ */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Phần 1: Chọn chu kỳ thứ</label>
                  <div className="flex flex-wrap gap-4 p-3 bg-background rounded-lg border">
                    {WEEKDAYS.map(day => (
                      <div key={day.value} className="flex items-center gap-1.5">
                        <Checkbox
                          id={`cycle-day-${day.value}`}
                          checked={cycleWeekdays.includes(day.value)}
                          onCheckedChange={checked => {
                            setCycleWeekdays(prev =>
                              checked ? [...prev, day.value] : prev.filter(v => v !== day.value)
                            );
                          }}
                        />
                        <label htmlFor={`cycle-day-${day.value}`} className="text-sm font-medium cursor-pointer select-none">{day.label}</label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Phần 2: Giờ test theo từng thứ */}
                {cycleWeekdays.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Phần 2: Cấu hình giờ theo thứ</label>
                    <div className="border rounded-lg overflow-hidden">
                      <div className="grid grid-cols-12 bg-muted/50 px-3 py-2 text-xs font-semibold border-b gap-2">
                        <div className="col-span-1">Thứ</div>
                        <div className="col-span-2">Giờ bắt đầu</div>
                        <div className="col-span-2">Giờ kết thúc</div>
                        <div className="col-span-3">Phòng</div>
                        <div className="col-span-4">Giáo viên</div>
                      </div>
                      <div className="divide-y">
                        {[...cycleWeekdays].sort((a, b) => {
                          const order = [1,2,3,4,5,6,0];
                          return order.indexOf(a) - order.indexOf(b);
                        }).map(wd => {
                          const label = WEEKDAYS.find(w => w.value === wd)?.label ?? "";
                          const entry = cycleWeekdayTimes[wd] ?? { timeStart: "", timeEnd: "", roomId: "", teacherIds: [] };
                          const filteredRooms = baseForm.locationId
                            ? classrooms.filter(r => r.locationId === baseForm.locationId)
                            : classrooms;
                          return (
                            <div key={wd} className="grid grid-cols-12 items-start px-3 py-2 gap-2 hover:bg-accent/5 transition-colors">
                              <div className="col-span-1 font-bold text-primary text-sm pt-1.5">{label}</div>
                              <div className="col-span-2">
                                <input
                                  type="time"
                                  value={entry.timeStart}
                                  onChange={e => setCycleWeekdayTimes(prev => ({ ...prev, [wd]: { ...prev[wd] ?? { timeStart: "", timeEnd: "", roomId: "", teacherIds: [] }, timeStart: e.target.value } }))}
                                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                />
                              </div>
                              <div className="col-span-2">
                                <input
                                  type="time"
                                  value={entry.timeEnd}
                                  onChange={e => setCycleWeekdayTimes(prev => ({ ...prev, [wd]: { ...prev[wd] ?? { timeStart: "", timeEnd: "", roomId: "", teacherIds: [] }, timeEnd: e.target.value } }))}
                                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                />
                              </div>
                              <div className="col-span-3">
                                <Select
                                  value={entry.roomId || "__none__"}
                                  onValueChange={v => setCycleWeekdayTimes(prev => ({ ...prev, [wd]: { ...prev[wd] ?? { timeStart: "", timeEnd: "", roomId: "", teacherIds: [] }, roomId: v === "__none__" ? "" : v } }))}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Chọn phòng..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">-- Không chọn --</SelectItem>
                                    {filteredRooms.map(r => (
                                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="col-span-4">
                                <SearchableMultiSelect
                                  options={staffList.map(s => ({ value: s.id, label: s.fullName, sublabel: s.code }))}
                                  value={entry.teacherIds}
                                  onChange={ids => setCycleWeekdayTimes(prev => ({
                                    ...prev,
                                    [wd]: { ...prev[wd] ?? { timeStart: "", timeEnd: "", roomId: "", teacherIds: [] }, teacherIds: ids },
                                  }))}
                                  placeholder="Chọn giáo viên..."
                                  searchPlaceholder="Tìm giáo viên..."
                                  className="h-8 text-xs min-h-0 py-0"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

              </div>
            ) : (
              /* Edit mode: single row */
              <div>
                <label className="block text-sm font-medium mb-1.5">Lịch buổi test</label>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs font-semibold">Ngày test <span className="text-destructive">*</span></TableHead>
                        <TableHead className="text-xs font-semibold">Giờ bắt đầu</TableHead>
                        <TableHead className="text-xs font-semibold">Giờ kết thúc</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scheduleRows.map(row => (
                        <TableRow key={row._key}>
                          <TableCell className="py-2">
                            <Input type="date" value={row.testDate} onChange={e => updateScheduleRow(row._key, "testDate", e.target.value)} className="h-8 text-sm" />
                          </TableCell>
                          <TableCell className="py-2">
                            <input type="time" value={row.timeStart} onChange={e => updateScheduleRow(row._key, "timeStart", e.target.value)} className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                          </TableCell>
                          <TableCell className="py-2">
                            <input type="time" value={row.timeEnd} onChange={e => updateScheduleRow(row._key, "timeEnd", e.target.value)} className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={closeDialog} disabled={isSaving}>Hủy</Button>
              <Button onClick={handleSubmit} disabled={isSaving}>
                {isSaving
                  ? "Đang lưu..."
                  : editId
                    ? "Cập nhật"
                    : previewDates.length > 0
                      ? `Tạo ${previewDates.length} lớp TEST`
                      : "Tạo lớp TEST"}
              </Button>
            </div>
          </div>

        </DialogContent>
      </Dialog>
    </div>
  );
}
