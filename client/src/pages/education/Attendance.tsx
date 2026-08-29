import { useState, useMemo } from "react";
import { StudentNameLink } from "@/components/ui/StudentNameLink";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ChevronDown,
  ChevronUp,
  Search,
  X,
  SlidersHorizontal,
  Users,
  CalendarDays,
  Clock,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import { format } from "date-fns";
import { StoreDateRangePicker, DateRange } from "@/pages/store/StoreDateRangePicker";
import { apiRequest } from "@/lib/queryClient";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { useToast } from "@/hooks/use-toast";

const SHIFTS = [
  { label: "Tất cả", value: "all" },
  { label: "07:00 - 09:00", value: "07:00-09:00" },
  { label: "09:00 - 11:00", value: "09:00-11:00" },
  { label: "13:00 - 15:00", value: "13:00-15:00" },
];

type AttendanceFilters = {
  classes: string[];
  students: string[];
  shift: string;
  dateRange: DateRange;
  studentSearch: string;
  attendanceStatus: string[];
};

type ClassData = {
  id: string;
  classCode: string;
  name: string;
  studentCount: number;
};

type StudentAttendance = {
  id: string;
  studentId: string;
  classId: string;
  studentCode: string;
  studentName: string;
  className: string;
  dayOfWeek: string;
  sessionDate: string;
  shift: string;
  sessionOrder: number;
  totalSessions: number;
  attendanceStatus: string;
  attendanceNote: string;
  teacherName: string;
  note: string;
  onlineLink?: string | null;
  learningFormat?: string;
  onlineClickedAt?: string | null;
  onlineEndedAt?: string | null;
  endTime?: string | null;
};

function getDefaultAttendanceDateRange(): DateRange {
  const now = new Date();
  return {
    from: now,
    to: now,
  };
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  present:     { label: "Có học",        bg: "bg-emerald-50",  text: "text-emerald-700", dot: "bg-emerald-500" },
  absent:      { label: "Nghỉ học",      bg: "bg-red-50",      text: "text-red-700",     dot: "bg-red-500" },
  makeup_wait: { label: "Nghỉ chờ bù",  bg: "bg-orange-50",   text: "text-orange-700",  dot: "bg-orange-500" },
  makeup_done: { label: "Đã học bù",    bg: "bg-blue-50",     text: "text-blue-700",    dot: "bg-blue-500" },
  paused:      { label: "Bảo lưu",      bg: "bg-amber-50",    text: "text-amber-700",   dot: "bg-amber-500" },
  pending:     { label: "Chưa điểm danh", bg: "bg-slate-50",  text: "text-slate-500",   dot: "bg-slate-400" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

export function Attendance() {
  const queryClient = useQueryClient();
  const { data: myPerms } = useMyPermissions();
  const canAttend = !myPerms || myPerms.isSuperAdmin || !!(myPerms.permissions["/attendance"]?.canCreate);

  const [filters, setFilters] = useState<AttendanceFilters>({
    classes: [],
    students: [],
    shift: "all",
    dateRange: getDefaultAttendanceDateRange(),
    studentSearch: "",
    attendanceStatus: [],
  });
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  const [expandedClasses, setExpandedClasses] = useState<string[]>([""]);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [isBulkAttendanceOpen, setIsBulkAttendanceOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const { toast } = useToast();

  const updateAttendanceMutation = useMutation({
    mutationFn: async (data: { studentSessionId: string; attendanceStatus: string }) => {
      return apiRequest("PATCH", `/api/student-sessions/${data.studentSessionId}/attendance`, {
        attendance_status: data.attendanceStatus,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err?.message || "Không thể cập nhật điểm danh", variant: "destructive" });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async (data: { studentSessionId: string; attendanceNote: string }) => {
      return apiRequest("PATCH", `/api/student-sessions/${data.studentSessionId}/attendance`, {
        attendance_note: data.attendanceNote,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err?.message || "Không thể cập nhật ghi chú", variant: "destructive" });
    },
  });

  const { data: classesData = [], isLoading: loadingClasses } = useQuery({
    queryKey: ["/api/classes"],
    queryFn: async () => {
      const response = await fetch("/api/classes");
      const json = await response.json();
      return Array.isArray(json) ? json : (json.classes || json.data || []);
    },
  });

  const { data: studentsData = [], isLoading: loadingStudents } = useQuery({
    queryKey: ["/api/students"],
    queryFn: async () => {
      const response = await fetch("/api/students");
      const json = await response.json();
      return Array.isArray(json) ? json : (json.students || json.data || []);
    },
  });

  const { data: attendanceData = [] } = useQuery({
    queryKey: ["/api/attendance", filters],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const now = new Date();
      const params = new URLSearchParams({
        classes: filters.classes.join(","),
        students: filters.students.join(","),
        shift: filters.shift,
        dateFrom: format(filters.dateRange.from ?? now, "yyyy-MM-dd"),
        dateTo: format(filters.dateRange.to ?? now, "yyyy-MM-dd"),
      });
      try {
        const response = await fetch(`/api/attendance?${params}`);
        const json = await response.json();
        return Array.isArray(json) ? json : (json.data || []);
      } catch {
        return [];
      }
    },
  });

  const filteredStudents = useMemo(() => {
    return studentsData.filter(
      (s: any) =>
        s.code.toLowerCase().includes(filters.studentSearch.toLowerCase()) ||
        s.fullName.toLowerCase().includes(filters.studentSearch.toLowerCase())
    );
  }, [studentsData, filters.studentSearch]);

  const attendanceByClass = useMemo(() => {
    const grouped: Record<string, any> = {};
    (attendanceData as StudentAttendance[])
      .filter(record => {
        if (filters.attendanceStatus.length === 0) return true;
        const status = record.attendanceStatus || "pending";
        return filters.attendanceStatus.includes(status);
      })
      .forEach((record: StudentAttendance) => {
        if (!grouped[record.className]) {
          grouped[record.className] = [];
        }
        grouped[record.className].push(record);
      });
    return grouped;
  }, [attendanceData, filters.attendanceStatus]);

  const toggleClass = (classId: string) => {
    setExpandedClasses((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId]
    );
  };

  const selectedClassesLabels = classesData
    .filter((c: any) => filters.classes.includes(c.id))
    .map((c: any) => c.classCode)
    .join(", ");

  const selectedStudentsLabels = studentsData
    .filter((s: any) => filters.students.includes(s.id))
    .map((s: any) => `${s.code}`)
    .join(", ");

  const isLoading = loadingClasses || loadingStudents;

  const totalPages = Math.max(1, Math.ceil(Object.keys(attendanceByClass).length / pageSize));

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full gap-3 p-0">

        {/* ── FILTER BAR ── */}
        <div className="bg-white border border-border rounded-2xl shadow-sm flex-shrink-0">
          <div className="flex items-center gap-2 px-3 py-2.5 flex-wrap">

            {/* Status chips — multi-select */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
              {/* Tất cả chip */}
              <button
                onClick={() => setFilters(prev => ({ ...prev, attendanceStatus: [] }))}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
                  filters.attendanceStatus.length === 0
                    ? "bg-slate-700 text-white border-slate-700"
                    : "bg-white text-slate-500 border-border hover:border-slate-400 hover:text-slate-700"
                }`}
                data-testid="chip-all"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${filters.attendanceStatus.length === 0 ? "bg-white" : "bg-slate-400"}`} />
                Tất cả
              </button>

              {/* Per-status chips */}
              {Object.entries(STATUS_CONFIG).map(([val, cfg]) => {
                const isActive = filters.attendanceStatus.includes(val);
                return (
                  <button
                    key={val}
                    onClick={() => setFilters(prev => {
                      const next = prev.attendanceStatus.includes(val)
                        ? prev.attendanceStatus.filter(s => s !== val)
                        : [...prev.attendanceStatus, val];
                      return { ...prev, attendanceStatus: next };
                    })}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
                      isActive
                        ? val === "pending"
                          ? "bg-slate-300 text-slate-800 border-slate-500"
                          : `${cfg.bg} ${cfg.text} border-current`
                        : "bg-white text-slate-500 border-border hover:border-current hover:bg-muted/30"
                    }`}
                    data-testid={`chip-${val}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </button>
                );
              })}
            </div>

            {/* Right side controls */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Clear filters */}
              {(filters.classes.length > 0 || filters.students.length > 0 || filters.shift !== "all" || filters.attendanceStatus.length > 0) && (
                <button
                  onClick={() => {
                    setFilters({ classes: [], students: [], shift: "all", dateRange: getDefaultAttendanceDateRange(), studentSearch: "", attendanceStatus: [] });
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                  data-testid="button-clear-filters"
                >
                  <X className="h-3 w-3" /> Xoá lọc
                </button>
              )}

              {/* Bộ lọc button */}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 border-border/70"
                onClick={() => setFilterPanelOpen(true)}
                data-testid="button-open-filter-panel"
              >
                <Filter className="h-3.5 w-3.5" />
                Bộ lọc
                {(filters.classes.length + filters.students.length + (filters.shift !== "all" ? 1 : 0)) > 0 && (
                  <span className="ml-0.5 h-4 w-4 rounded-full bg-primary text-white text-[10px] flex items-center justify-center font-bold">
                    {filters.classes.length + filters.students.length + (filters.shift !== "all" ? 1 : 0)}
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* ── BỘ LỌC DIALOG ── */}
        <Dialog open={filterPanelOpen} onOpenChange={setFilterPanelOpen}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" /> Bộ lọc
              </DialogTitle>
              <DialogDescription>Lọc theo lớp học, học viên, ca học và thời gian</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">

              {/* Classes */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <CheckSquare className="h-3 w-3" /> Lớp học
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-9 justify-start text-sm border-border/70" data-testid="button-class-filter">
                      {filters.classes.length > 0 ? (
                        <span className="flex items-center gap-1.5">
                          <Badge className="h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px] bg-primary text-white">{filters.classes.length}</Badge>
                          lớp đã chọn
                        </span>
                      ) : <span className="text-muted-foreground">Chọn lớp...</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-60 bg-white shadow-lg border border-border/70 z-[200]" align="start">
                    <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                      {classesData.map((cls: any) => (
                        <div key={cls.id} className="flex items-center space-x-2 px-1 py-1.5 rounded-lg hover:bg-muted/50 cursor-pointer"
                          onClick={() => setFilters(prev => ({ ...prev, classes: prev.classes.includes(cls.id) ? prev.classes.filter(id => id !== cls.id) : [...prev.classes, cls.id] }))}>
                          <Checkbox id={`class-${cls.id}`} checked={filters.classes.includes(cls.id)} data-testid={`checkbox-class-${cls.classCode}`}
                            onCheckedChange={(checked) => setFilters(prev => ({ ...prev, classes: checked ? [...prev.classes, cls.id] : prev.classes.filter(id => id !== cls.id) }))} />
                          <Label htmlFor={`class-${cls.id}`} className="text-sm cursor-pointer flex-1">{cls.classCode}</Label>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                {filters.classes.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {filters.classes.map(classId => {
                      const cls = classesData.find((c: any) => c.id === classId);
                      return (
                        <Badge key={classId} variant="secondary" className="text-xs gap-1 pl-2 pr-1">
                          {cls?.classCode}
                          <button onClick={() => setFilters(prev => ({ ...prev, classes: prev.classes.filter(id => id !== classId) }))} className="ml-0.5 rounded-full hover:bg-muted p-0.5"><X className="h-2.5 w-2.5" /></button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Students */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" /> Học viên
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-9 justify-start text-sm border-border/70" data-testid="button-student-filter">
                      {filters.students.length > 0 ? (
                        <span className="flex items-center gap-1.5">
                          <Badge className="h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px] bg-primary text-white">{filters.students.length}</Badge>
                          học viên đã chọn
                        </span>
                      ) : <span className="text-muted-foreground">Tìm học viên...</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 bg-white shadow-lg border border-border/70 z-[200]" align="start">
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Tìm theo tên hoặc mã" className="pl-8 h-9" value={filters.studentSearch}
                          onChange={(e) => setFilters(prev => ({ ...prev, studentSearch: e.target.value }))} data-testid="input-student-search" />
                      </div>
                      <ScrollArea className="h-48">
                        <div className="space-y-0.5 pr-2">
                          {filteredStudents.map((student: any) => (
                            <div key={student.id} className="flex items-center space-x-2 px-1 py-1.5 rounded-lg hover:bg-muted/50 cursor-pointer"
                              onClick={() => setFilters(prev => ({ ...prev, students: prev.students.includes(student.id) ? prev.students.filter(id => id !== student.id) : [...prev.students, student.id] }))}>
                              <Checkbox id={`student-${student.id}`} checked={filters.students.includes(student.id)} data-testid={`checkbox-student-${student.code}`}
                                onCheckedChange={(checked) => setFilters(prev => ({ ...prev, students: checked ? [...prev.students, student.id] : prev.students.filter(id => id !== student.id) }))} />
                              <Label htmlFor={`student-${student.id}`} className="text-sm cursor-pointer flex-1">
                                <span className="font-medium text-primary">{student.code}</span>
                                <span className="text-muted-foreground ml-1">– {student.fullName}</span>
                              </Label>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </PopoverContent>
                </Popover>
                {filters.students.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {filters.students.map(studentId => {
                      const student = studentsData.find((s: any) => s.id === studentId);
                      return (
                        <Badge key={studentId} variant="secondary" className="text-xs gap-1 pl-2 pr-1">
                          {student?.code}
                          <button onClick={() => setFilters(prev => ({ ...prev, students: prev.students.filter(id => id !== studentId) }))} className="ml-0.5 rounded-full hover:bg-muted p-0.5"><X className="h-2.5 w-2.5" /></button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Shift */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Ca học
                </Label>
                <Select value={filters.shift} onValueChange={(value) => setFilters(prev => ({ ...prev, shift: value }))}>
                  <SelectTrigger id="shift" data-testid="select-shift" className="h-9 text-sm border-border/70"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-white z-[200]">
                    {SHIFTS.map(shift => <SelectItem key={shift.value} value={shift.value}>{shift.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Date Range */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" /> Thời gian
                </Label>
                <StoreDateRangePicker value={filters.dateRange} onChange={(range) => setFilters(prev => ({ ...prev, dateRange: range }))} />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-border/60">
                <Button variant="outline" size="sm" onClick={() => {
                  setFilters(prev => ({ ...prev, classes: [], students: [], shift: "all", dateRange: getDefaultAttendanceDateRange(), studentSearch: "" }));
                }}>Xoá bộ lọc</Button>
                <Button size="sm" onClick={() => setFilterPanelOpen(false)}>Áp dụng</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Main content */}
        <div className="bg-white border border-border rounded-2xl shadow-sm flex flex-col flex-1 overflow-hidden min-h-0">

          {/* Bulk action bar */}
          {(() => {
            const visibleRecordIds = Object.entries(attendanceByClass)
              .sort(([a], [b]) => a.localeCompare(b))
              .slice((currentPage - 1) * pageSize, currentPage * pageSize)
              .flatMap(([, recs]) => (recs as StudentAttendance[]).map(r => r.id));
            const allPageSelected = visibleRecordIds.length > 0 && visibleRecordIds.every(id => selectedRows.has(id));
            const somePageSelected = visibleRecordIds.some(id => selectedRows.has(id));
            return (
              <div className={`flex items-center gap-3 px-4 py-2.5 border-b border-border/60 flex-shrink-0 transition-colors ${selectedRows.size > 0 ? "bg-primary/5" : "bg-muted/20"}`}>
                <Checkbox
                  checked={allPageSelected ? true : somePageSelected ? "indeterminate" : false}
                  onCheckedChange={(checked) => {
                    const newSelected = new Set(selectedRows);
                    if (checked) { visibleRecordIds.forEach(id => newSelected.add(id)); }
                    else { visibleRecordIds.forEach(id => newSelected.delete(id)); }
                    setSelectedRows(newSelected);
                  }}
                  data-testid="checkbox-all-page"
                />
                <span className="text-sm text-muted-foreground">
                  {selectedRows.size > 0
                    ? <span className="font-medium text-primary">Đã chọn {selectedRows.size} dòng</span>
                    : "Chọn tất cả trang"}
                </span>
                {selectedRows.size > 0 && (
                  <Button size="sm" className="h-7 text-xs ml-1" onClick={() => setIsBulkAttendanceOpen(true)}>
                    Điểm danh hàng loạt ({selectedRows.size})
                  </Button>
                )}
                <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{(attendanceData as any[]).length} bản ghi</span>
                </div>
              </div>
            );
          })()}

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto overflow-x-auto p-4">
            <div className="space-y-3">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-muted-foreground">Đang tải dữ liệu...</p>
                </div>
              ) : Object.keys(attendanceByClass).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center">
                    <Users className="h-7 w-7 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm text-muted-foreground font-medium">Không có dữ liệu điểm danh</p>
                  <p className="text-xs text-muted-foreground">Thử thay đổi bộ lọc hoặc chọn ngày khác</p>
                </div>
              ) : (
                Object.entries(attendanceByClass)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                  .map(([className, records]: [string, any]) => {
                    const isExpanded = expandedClasses.includes(className) || expandedClasses.length === 0 ||
                      (expandedClasses.length === 1 && expandedClasses[0] === "");
                    const studentCount = new Set((records as StudentAttendance[]).map(r => r.studentCode)).size;
                    const classRecordIds = (records as StudentAttendance[]).map(r => r.id);
                    const allClassSelected = classRecordIds.length > 0 && classRecordIds.every(id => selectedRows.has(id));
                    const someClassSelected = classRecordIds.some(id => selectedRows.has(id));

                    const presentCount = (records as StudentAttendance[]).filter(r => r.attendanceStatus === "present").length;
                    const absentCount = (records as StudentAttendance[]).filter(r => r.attendanceStatus === "absent").length;
                    const pendingCount = (records as StudentAttendance[]).filter(r => !r.attendanceStatus || r.attendanceStatus === "pending").length;

                    return (
                      <div key={className} className="border border-border/70 rounded-xl overflow-hidden shadow-sm hover:shadow transition-shadow">
                        {/* Class header */}
                        <div
                          className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors bg-muted/20"
                          onClick={() => toggleClass(className)}
                          data-testid={`header-class-${className}`}
                        >
                          <div onClick={e => e.stopPropagation()}>
                            <Checkbox
                              checked={allClassSelected ? true : someClassSelected ? "indeterminate" : false}
                              onCheckedChange={(checked) => {
                                const newSelected = new Set(selectedRows);
                                if (checked) { classRecordIds.forEach(id => newSelected.add(id)); }
                                else { classRecordIds.forEach(id => newSelected.delete(id)); }
                                setSelectedRows(newSelected);
                              }}
                              data-testid={`checkbox-header-class-${className}`}
                            />
                          </div>

                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="w-2 h-2 rounded-full bg-primary/70 flex-shrink-0" />
                            <span className="font-semibold text-sm truncate">{className}</span>
                            <Badge variant="secondary" className="text-xs flex-shrink-0">
                              {studentCount} học viên
                            </Badge>
                          </div>

                          <div className="hidden sm:flex items-center gap-2">
                            {presentCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                {presentCount} có học
                              </span>
                            )}
                            {absentCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                {absentCount} nghỉ
                              </span>
                            )}
                            {pendingCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                {pendingCount} chưa
                              </span>
                            )}
                          </div>

                          <div className="flex-shrink-0 text-muted-foreground ml-2">
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </div>

                        {/* Table */}
                        {isExpanded && (
                          <div className="w-full overflow-x-auto">
                            <Table className="min-w-[1000px]">
                              <TableHeader>
                                <TableRow className="bg-muted/10 hover:bg-muted/10">
                                  <TableHead className="text-xs font-semibold w-10" data-testid="th-checkbox">
                                    <Checkbox
                                      checked={allClassSelected ? true : someClassSelected ? "indeterminate" : false}
                                      onCheckedChange={(checked) => {
                                        const newSelected = new Set(selectedRows);
                                        if (checked) { classRecordIds.forEach(id => newSelected.add(id)); }
                                        else { classRecordIds.forEach(id => newSelected.delete(id)); }
                                        setSelectedRows(newSelected);
                                      }}
                                      data-testid={`checkbox-all-class-${className}`}
                                    />
                                  </TableHead>
                                  <TableHead className="text-xs font-semibold min-w-[180px]" data-testid="th-student-name">Tên học viên</TableHead>
                                  <TableHead className="text-xs font-semibold min-w-[110px]" data-testid="th-day">Thứ / Ngày</TableHead>
                                  <TableHead className="text-xs font-semibold min-w-[110px]" data-testid="th-shift">Ca học</TableHead>
                                  <TableHead className="text-xs font-semibold text-center min-w-[70px]" data-testid="th-sessions">Số buổi</TableHead>
                                  <TableHead className="text-xs font-semibold min-w-[160px]" data-testid="th-attendance">Điểm danh</TableHead>
                                  <TableHead className="text-xs font-semibold min-w-[150px]" data-testid="th-teacher">Giáo viên</TableHead>
                                  <TableHead className="text-xs font-semibold min-w-[170px]" data-testid="th-notes">Ghi chú</TableHead>
                                  <TableHead className="text-xs font-semibold min-w-[120px]" data-testid="th-online">Học online</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(records as StudentAttendance[]).map((record, idx) => (
                                  <TableRow
                                    key={`${record.id}-${idx}`}
                                    className={`transition-colors ${selectedRows.has(record.id) ? "bg-primary/5" : idx % 2 === 0 ? "bg-white" : "bg-muted/10"} hover:bg-primary/5`}
                                    data-testid={`row-attendance-${record.studentCode}`}
                                  >
                                    <TableCell className="w-10">
                                      <Checkbox
                                        checked={selectedRows.has(record.id)}
                                        onCheckedChange={(checked) => {
                                          const newSelected = new Set(selectedRows);
                                          if (checked) { newSelected.add(record.id); }
                                          else { newSelected.delete(record.id); }
                                          setSelectedRows(newSelected);
                                        }}
                                        data-testid={`checkbox-row-${record.id}`}
                                      />
                                    </TableCell>
                                    <TableCell className="text-sm whitespace-nowrap font-medium">
                                      <StudentNameLink studentId={record.studentId} name={record.studentName} code={record.studentCode} />
                                    </TableCell>
                                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                                      {record.dayOfWeek}, {format(new Date(record.sessionDate), "d/M/yyyy")}
                                    </TableCell>
                                    <TableCell className="text-sm whitespace-nowrap">
                                      <div className="flex flex-col gap-0.5">
                                        <span>{record.shift}</span>
                                        {record.learningFormat === "online" && record.onlineLink && record.onlineClickedAt && (
                                          <span className="text-orange-500 text-xs font-medium">
                                            Vào lúc {new Date(record.onlineClickedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                                          </span>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-sm text-center whitespace-nowrap">
                                      <span className="font-semibold text-foreground">{record.sessionOrder}</span>
                                      <span className="text-muted-foreground">/{record.totalSessions}</span>
                                    </TableCell>
                                    <TableCell className="text-sm whitespace-nowrap">
                                      {canAttend ? (
                                        <Select
                                          value={record.attendanceStatus || "pending"}
                                          onValueChange={(val) => updateAttendanceMutation.mutate({ studentSessionId: record.id, attendanceStatus: val })}
                                        >
                                          <SelectTrigger className="w-auto h-7 text-xs border-0 shadow-none p-0 bg-transparent focus:ring-0">
                                            <StatusBadge status={record.attendanceStatus || "pending"} />
                                          </SelectTrigger>
                                          <SelectContent className="bg-white">
                                            {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                                              <SelectItem key={val} value={val}>
                                                <span className={`flex items-center gap-1.5 ${cfg.text}`}>
                                                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                                  {cfg.label}
                                                </span>
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        <StatusBadge status={record.attendanceStatus || "pending"} />
                                      )}
                                    </TableCell>
                                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                                      {record.teacherName}
                                    </TableCell>
                                    <TableCell className="text-sm whitespace-nowrap">
                                      {canAttend ? (
                                        <Input
                                          className="h-7 text-xs min-w-[150px] bg-transparent border-dashed focus:border-solid focus:bg-white"
                                          placeholder="Ghi chú..."
                                          defaultValue={record.attendanceNote || ""}
                                          onBlur={(e) => {
                                            if (e.target.value !== record.attendanceNote) {
                                              updateNoteMutation.mutate({ studentSessionId: record.id, attendanceNote: e.target.value });
                                            }
                                          }}
                                          data-testid={`input-note-${record.id}`}
                                        />
                                      ) : (
                                        <span className="text-xs text-muted-foreground" data-testid={`note-readonly-${record.id}`}>
                                          {record.attendanceNote || "—"}
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-sm" data-testid={`cell-online-${record.id}`}>
                                      {(record.learningFormat === "online" || !!record.onlineLink) ? (
                                        record.onlineClickedAt ? (() => {
                                          const clickedAt = new Date(record.onlineClickedAt);
                                          const fmt = (d: Date) => d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                                          let endedAt: Date | null = null;
                                          let isDefaultEnd = false;
                                          if (record.onlineEndedAt) {
                                            endedAt = new Date(record.onlineEndedAt);
                                          } else if (record.endTime && record.sessionDate) {
                                            const [h, m, s = 0] = record.endTime.split(":").map(Number);
                                            const [yr, mo, day] = (typeof record.sessionDate === "string"
                                              ? record.sessionDate.split("T")[0]
                                              : new Date(record.sessionDate).toISOString().split("T")[0]
                                            ).split("-").map(Number);
                                            const sessionEnd = new Date(yr, mo - 1, day, h, m, s, 0);
                                            if (new Date() >= sessionEnd) { endedAt = sessionEnd; isDefaultEnd = true; }
                                          }
                                          return (
                                            <div className="flex flex-col gap-0.5 whitespace-nowrap">
                                              <span className="text-xs text-emerald-600 font-medium">↗ {fmt(clickedAt)}</span>
                                              {endedAt && (
                                                <span className={`text-xs font-medium ${isDefaultEnd ? "text-slate-400" : "text-red-500"}`}>
                                                  ↙ {fmt(endedAt)}{isDefaultEnd ? " *" : ""}
                                                </span>
                                              )}
                                            </div>
                                          );
                                        })() : (
                                          <span className="text-xs text-muted-foreground">—</span>
                                        )
                                      ) : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          {/* Footer pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/60 bg-muted/10 flex-shrink-0 gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="text-xs">Hiển thị</span>
              <Select value={pageSize.toString()} onValueChange={(val) => { setPageSize(parseInt(val)); setCurrentPage(1); }}>
                <SelectTrigger className="w-16 h-7 bg-white text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  {[15, 20, 30, 50].map(n => <SelectItem key={n} value={n.toString()}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-xs">lớp / trang</span>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1 px-2">
                <span className="text-xs font-medium">{currentPage}</span>
                <span className="text-xs text-muted-foreground">/</span>
                <span className="text-xs text-muted-foreground">{totalPages}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Attendance Dialog */}
      <Dialog open={isBulkAttendanceOpen} onOpenChange={setIsBulkAttendanceOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Điểm danh hàng loạt</DialogTitle>
            <DialogDescription>
              Chọn trạng thái điểm danh cho <strong>{selectedRows.size}</strong> học viên được chọn
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {Object.entries(STATUS_CONFIG)
              .filter(([val]) => val !== "pending")
              .map(([status, cfg]) => (
                <Button
                  key={status}
                  variant="outline"
                  className={`w-full justify-start gap-2 ${cfg.text} hover:${cfg.bg} border-border/70`}
                  onClick={async () => {
                    setIsBulkAttendanceOpen(false);
                    try {
                      await Promise.all(
                        Array.from(selectedRows).map(id =>
                          updateAttendanceMutation.mutateAsync({ studentSessionId: id, attendanceStatus: status })
                        )
                      );
                    } catch {}
                    await queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
                    setSelectedRows(new Set());
                  }}
                >
                  <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  {cfg.label}
                </Button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
