import { useState, useEffect, useMemo, useRef } from "react";
import { RichContentRenderer, RichContentPreview } from "@/components/ui/rich-content-renderer";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, STATIC_STALE_TIME } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Users, Clock, BookOpen, Pencil, Trash2, X, Search, Loader2,
  MapPin, CalendarDays, Save, UserPlus, ClipboardPlus, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────
export interface StudentResult {
  attendance: "present" | "absent" | null;
  scoreOnline: number | null;
  scoreOffline: number | null;
}

export interface TestSession {
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

// ─── Helpers ───────────────────────────────────────────────────────────────
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

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

// ─── Add Student Dialog ────────────────────────────────────────────────────
function AddStudentDialog({
  open, onOpenChange, session, onSave,
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
          <div className="border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={v => toggleAll(!!v)}
                    />
                  </TableHead>
                  <TableHead>Học viên</TableHead>
                  <TableHead>Mã</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground text-sm">
                      Không tìm thấy học viên
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(s => (
                    <TableRow key={s.id} className="cursor-pointer hover:bg-muted/30" onClick={() => toggle(s.id)}>
                      <TableCell>
                        <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} onClick={e => e.stopPropagation()} />
                      </TableCell>
                      <TableCell className="font-medium text-sm">{s.fullName}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{s.code}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button onClick={() => { onSave(Array.from(selected)); onOpenChange(false); }}>
            Thêm đã chọn ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Test Content Dialog ───────────────────────────────────────────────
const TEST_CONTENT_TYPES = [
  { key: "Bài tập về nhà", label: "Bài tập về nhà", field: "assignmentIds" as const },
  { key: "Bài kiểm tra",   label: "Bài kiểm tra",   field: "examIds" as const },
];

export function AddTestContentDialog({
  open, onOpenChange, session, onSave,
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
      const res = await fetch("/api/course-program-contents?pageSize=500");
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
        .map(e => ({ id: e.id, title: e.name || e.code, content: e.code, type: "Bài kiểm tra", programId: "", sessionNumber: "" }));
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
    const fromContents = allContents.find(c => c.id === id)?.title;
    if (fromContents) return fromContents;
    const fromExam = allExams.find(e => e.id === id);
    return fromExam ? (fromExam.name || fromExam.code) : id;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle>Thêm bài test</DialogTitle>
        </DialogHeader>
        <div className="flex flex-1 min-h-0 overflow-hidden">
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
                          {c.content && <p className="text-xs text-muted-foreground line-clamp-1"><RichContentPreview text={c.content} maxLength={80} /></p>}
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
          <Button onClick={() => { onSave(selectedAssignments, selectedExams, contentSettings); onOpenChange(false); }}>
            Lưu ({selectedAssignments.length + selectedExams.length} mục)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Content View Dialog ───────────────────────────────────────────────────
function ContentViewDialog({
  item, onClose,
}: {
  item: { title: string; type: string; content?: string } | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!item} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{item?.title}</DialogTitle>
        </DialogHeader>
        {item && (
          <div className="space-y-3 py-2">
            <Badge variant="outline" className="text-xs">{item.type}</Badge>
            {item.content ? (
              <div className="bg-muted/40 rounded-lg p-3 max-h-64 overflow-y-auto">
                <RichContentRenderer text={item.content} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">Không có nội dung.</p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Đóng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Dialog ───────────────────────────────────────────────────────────
export function TestSessionDetailDialog({
  sessionId,
  onClose,
  onEdit,
}: {
  sessionId: string | null;
  onClose: () => void;
  onEdit?: (s: TestSession) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [localResults, setLocalResults] = useState<Record<string, StudentResult>>({});
  const [dirty, setDirty] = useState(false);
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [addContentOpen, setAddContentOpen] = useState(false);
  const [viewContent, setViewContent] = useState<{ title: string; type: string; content?: string } | null>(null);

  const { data: session, isLoading } = useQuery<TestSession>({
    queryKey: ["/api/test-sessions", sessionId],
    queryFn: () => apiRequest("GET", `/api/test-sessions/${sessionId}`).then(r => r.json()),
    enabled: !!sessionId,
    staleTime: 0,
  });

  const { data: allContents = [] } = useQuery<CourseContent[]>({
    queryKey: ["/api/course-program-contents"],
    queryFn: async () => {
      const res = await fetch("/api/course-program-contents?pageSize=500");
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      return Array.isArray(json) ? json : (json.items ?? []);
    },
    staleTime: STATIC_STALE_TIME,
    enabled: !!sessionId,
  });

  useEffect(() => {
    if (session) {
      setLocalResults(session.studentResults ?? {});
      setDirty(false);
    }
  }, [session?.id]);

  const saveResultsMutation = useMutation({
    mutationFn: (results: Record<string, StudentResult>) =>
      apiRequest("PATCH", `/api/test-sessions/${sessionId}/results`, { studentResults: results }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/test-sessions", sessionId] });
      qc.invalidateQueries({ queryKey: ["/api/test-sessions"] });
      toast({ title: "Đã lưu kết quả." });
      setDirty(false);
    },
    onError: (e: any) => toast({ title: "Lỗi lưu", description: e.message, variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: (patch: { studentIds?: string[]; assignmentIds?: string[]; examIds?: string[]; contentSettings?: Record<string, ContentSetting> }) => {
      if (!session) throw new Error("No session");
      return apiRequest("PUT", `/api/test-sessions/${sessionId}`, {
        title: session.title,
        locationId: session.locationId ?? "",
        testDate: session.testDate?.slice(0, 10),
        timeStart: session.timeStart ?? "",
        timeEnd: session.timeEnd ?? "",
        teacherIds: session.teacherIds ?? [],
        examIds: patch.examIds ?? session.examIds ?? [],
        assignmentIds: patch.assignmentIds ?? session.assignmentIds ?? [],
        studentIds: patch.studentIds ?? session.studentIds ?? [],
        studentCount: session.studentCount ?? 0,
        contentSettings: patch.contentSettings ?? (session.contentSettings as Record<string, ContentSetting>) ?? {},
        notes: session.notes ?? "",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/test-sessions", sessionId] });
      qc.invalidateQueries({ queryKey: ["/api/test-sessions"] });
    },
    onError: (e: any) => toast({ title: "Lỗi cập nhật", description: e.message, variant: "destructive" }),
  });

  const removeStudentMutation = useMutation({
    mutationFn: ({ studentId }: { studentId: string }) => {
      if (!session) throw new Error("No session");
      const newStudentIds = (session.studentIds ?? []).filter(id => id !== studentId);
      const newResults = { ...localResults };
      delete newResults[studentId];
      return apiRequest("PUT", `/api/test-sessions/${sessionId}`, {
        title: session.title,
        locationId: session.locationId ?? "",
        testDate: session.testDate?.slice(0, 10),
        timeStart: session.timeStart ?? "",
        timeEnd: session.timeEnd ?? "",
        teacherIds: session.teacherIds ?? [],
        examIds: session.examIds ?? [],
        assignmentIds: session.assignmentIds ?? [],
        studentIds: newStudentIds,
        studentCount: session.studentCount ?? 0,
        studentResults: newResults,
        contentSettings: (session.contentSettings as Record<string, ContentSetting>) ?? {},
        notes: session.notes ?? "",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/test-sessions", sessionId] });
      qc.invalidateQueries({ queryKey: ["/api/test-sessions"] });
      toast({ title: "Đã xóa học viên." });
    },
    onError: (e: any) => toast({ title: "Lỗi", description: e.message, variant: "destructive" }),
  });

  function updateResult(studentId: string, field: keyof StudentResult, value: any) {
    setLocalResults(prev => ({
      ...prev,
      [studentId]: {
        attendance: null, scoreOnline: null, scoreOffline: null,
        ...(prev[studentId] ?? {}),
        [field]: value,
      },
    }));
    setDirty(true);
  }

  function handleClickContent(item: { id: string; title: string; type: string }) {
    const full = allContents.find(c => c.id === item.id);
    setViewContent({ title: item.title, type: item.type, content: full?.content });
  }

  const status = session ? computeStatus(session) : "upcoming";
  const cfg = STATUS_CONFIG[status];
  const studentsData = session?.studentsData ?? [];

  return (
    <>
      <Dialog open={!!sessionId} onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent className="!max-w-[calc(100vw-32px)] w-[calc(100vw-32px)] max-h-[92vh] p-0 flex flex-col overflow-hidden">
          {/* Header */}
          <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xl">🧪</span>
                <DialogTitle className="text-lg font-bold line-clamp-1">{session?.title ?? "Chi tiết lớp TEST"}</DialogTitle>
                {session && (
                  <span className={cn("inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0", cfg.color)}>
                    {cfg.label}
                  </span>
                )}
              </div>

              {/* Action buttons in the highlighted area */}
              <div className="flex items-center gap-2 flex-wrap">
                {session && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { if (status !== "ended") setAddStudentOpen(true); }}
                      disabled={status === "ended"}
                      className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Thêm học viên
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { if (status !== "ended") setAddContentOpen(true); }}
                      disabled={status === "ended"}
                      className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ClipboardPlus className="h-3.5 w-3.5" />
                      Thêm bài test
                    </Button>
                  </>
                )}
                {session && onEdit && (
                  <Button variant="outline" size="sm" onClick={() => onEdit(session)} className="gap-1.5">
                    <Pencil className="h-3.5 w-3.5" />Chỉnh sửa
                  </Button>
                )}
                {dirty && (
                  <Button size="sm" onClick={() => saveResultsMutation.mutate(localResults)} disabled={saveResultsMutation.isPending} className="gap-1.5">
                    <Save className="h-3.5 w-3.5" />
                    {saveResultsMutation.isPending ? "Đang lưu..." : "Lưu kết quả"}
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center flex-1 py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : session ? (
            <div className="flex flex-1 min-h-0 overflow-hidden">
              {/* ─── Left sidebar ─── */}
              <div className="w-64 shrink-0 border-r overflow-y-auto p-4 space-y-4 bg-muted/20">
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <CalendarDays className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Ngày test</p>
                      <p className="text-sm font-semibold">{formatDate(session.testDate)}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Thời gian</p>
                      <p className="text-sm font-semibold">
                        {session.timeStart && session.timeEnd ? `${session.timeStart} – ${session.timeEnd}` : session.timeStart || "Chưa đặt"}
                      </p>
                    </div>
                  </div>
                  {session.locationName && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Cơ sở</p>
                        <p className="text-sm font-semibold">{session.locationName}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <Users className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Học viên</p>
                      <p className="text-sm font-semibold">
                        {(session.studentIds ?? []).length}/{session.studentCount ?? 0}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Teachers */}
                {(session.teachers ?? []).length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1.5">Giáo viên</p>
                    <div className="space-y-1.5">
                      {session.teachers.map(t => (
                        <div key={t.id} className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                            {t.fullName.charAt(0)}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-medium">{t.fullName}</p>
                            <p className="text-[10px] text-muted-foreground">{t.code}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Exams — clickable blue */}
                {(session.examsData ?? []).length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1.5">Bài kiểm tra</p>
                    <div className="space-y-1">
                      {session.examsData.map(e => (
                        <button
                          key={e.id}
                          onClick={() => setViewContent({ title: e.name || e.code, type: "Bài kiểm tra" })}
                          className="w-full flex items-start gap-1.5 text-xs bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded px-2 py-1.5 transition-colors text-left group"
                        >
                          <BookOpen className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-500" />
                          <span className="font-medium text-blue-700 group-hover:underline">{e.name || e.code}</span>
                          <Eye className="h-3 w-3 ml-auto shrink-0 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Assignments — clickable blue */}
                {(session.assignmentsData ?? []).length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1.5">Bài tập / Đề</p>
                    <div className="space-y-1">
                      {(session.assignmentsData ?? []).map(a => (
                        <button
                          key={a.id}
                          onClick={() => handleClickContent(a)}
                          className="w-full flex items-start gap-1.5 text-xs bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded px-2 py-1.5 transition-colors text-left group"
                        >
                          <span className="shrink-0 mt-0.5 text-blue-500">📝</span>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-blue-700 group-hover:underline">{a.title}</p>
                            <p className="text-[10px] text-blue-400">{a.type}</p>
                          </div>
                          <Eye className="h-3 w-3 ml-auto shrink-0 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {session.notes && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1.5">Ghi chú</p>
                    <p className="text-xs text-foreground bg-muted rounded p-2 whitespace-pre-wrap">{session.notes}</p>
                  </div>
                )}
              </div>

              {/* ─── Right: student table ─── */}
              <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b flex items-center justify-between shrink-0">
                  <p className="text-sm font-semibold">
                    Danh sách học viên
                    <span className="ml-2 text-xs font-normal text-muted-foreground">({studentsData.length} học viên)</span>
                  </p>
                  {dirty && <p className="text-xs text-amber-600 font-medium">Có thay đổi chưa lưu</p>}
                </div>
                <div className="flex-1 overflow-auto">
                  {studentsData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <Users className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-sm">Chưa có học viên nào.</p>
                      <p className="text-xs mt-1">Dùng nút "Thêm học viên" ở trên để thêm.</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8 text-center">#</TableHead>
                          <TableHead>Tên học viên</TableHead>
                          <TableHead className="w-36">Điểm danh</TableHead>
                          <TableHead className="w-28 text-center">Điểm (online)</TableHead>
                          <TableHead className="w-28 text-center">Điểm (offline)</TableHead>
                          <TableHead className="w-16 text-center">Thao tác</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {studentsData.map((stu, idx) => {
                          const result = localResults[stu.id] ?? { attendance: null, scoreOnline: null, scoreOffline: null };
                          return (
                            <TableRow key={stu.id}>
                              <TableCell className="text-center text-muted-foreground text-xs">{idx + 1}</TableCell>
                              <TableCell>
                                <p className="font-medium text-sm">{stu.fullName}</p>
                                <p className="text-xs text-muted-foreground">{stu.code}</p>
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={result.attendance ?? "none"}
                                  onValueChange={v => updateResult(stu.id, "attendance", v === "none" ? null : v as "present" | "absent")}
                                >
                                  <SelectTrigger className="h-8 text-xs w-full">
                                    <SelectValue placeholder="Chưa chọn" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">Chưa chọn</SelectItem>
                                    <SelectItem value="present"><span className="text-green-600 font-medium">✓ Có học</span></SelectItem>
                                    <SelectItem value="absent"><span className="text-red-500 font-medium">✗ Nghỉ học</span></SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number" min={0} max={10} step={0.5} placeholder="—"
                                  className="h-8 text-xs text-center"
                                  value={result.scoreOnline ?? ""}
                                  onChange={e => updateResult(stu.id, "scoreOnline", e.target.value === "" ? null : parseFloat(e.target.value))}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number" min={0} max={10} step={0.5} placeholder="—"
                                  className="h-8 text-xs text-center"
                                  value={result.scoreOffline ?? ""}
                                  onChange={e => updateResult(stu.id, "scoreOffline", e.target.value === "" ? null : parseFloat(e.target.value))}
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <button
                                  onClick={() => {
                                    if (confirm(`Xóa ${stu.fullName} khỏi lớp test?`)) {
                                      removeStudentMutation.mutate({ studentId: stu.id });
                                    }
                                  }}
                                  className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center flex-1 py-16 text-muted-foreground">
              Không tìm thấy dữ liệu
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sub-dialogs */}
      <AddStudentDialog
        open={addStudentOpen}
        onOpenChange={setAddStudentOpen}
        session={session ?? null}
        onSave={studentIds => {
          patchMutation.mutate({ studentIds } as any, {
            onSuccess: () => toast({ title: `Đã cập nhật ${studentIds.length} học viên.` }),
          });
        }}
      />

      <AddTestContentDialog
        open={addContentOpen}
        onOpenChange={setAddContentOpen}
        session={session ?? null}
        onSave={(assignmentIds, examIds, contentSettings) => {
          patchMutation.mutate({ assignmentIds, examIds, contentSettings }, {
            onSuccess: () => toast({ title: "Đã cập nhật bài test." }),
          });
        }}
      />

      <ContentViewDialog
        item={viewContent}
        onClose={() => setViewContent(null)}
      />
    </>
  );
}
