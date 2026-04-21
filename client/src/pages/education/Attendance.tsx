import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronUp, Calendar, Search, X } from "lucide-react";
import { format, addDays } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

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
  dateFrom: Date;
  dateTo: Date;
  studentSearch: string;
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
};

export function Attendance() {
  const { data: myPerms } = useMyPermissions();
  const canAttend = !myPerms || myPerms.isSuperAdmin || !!(myPerms.permissions["/attendance"]?.canCreate);

  const [filters, setFilters] = useState<AttendanceFilters>({
    classes: [],
    students: [],
    shift: "all",
    dateFrom: new Date(),
    dateTo: new Date(),
    studentSearch: "",
  });

  const [expandedClasses, setExpandedClasses] = useState<string[]>([""]);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);;

  // Mutation for updating attendance status
  const updateAttendanceMutation = useMutation({
    mutationFn: async (data: { studentSessionId: string; attendanceStatus: string }) => {
      return apiRequest("PATCH", `/api/student-sessions/${data.studentSessionId}/attendance`, {
        attendance_status: data.attendanceStatus,
      });
    },
  });

  // Mutation for updating attendance note
  const updateNoteMutation = useMutation({
    mutationFn: async (data: { studentSessionId: string; attendanceNote: string }) => {
      return apiRequest("PATCH", `/api/student-sessions/${data.studentSessionId}/attendance`, {
        attendance_note: data.attendanceNote,
      });
    },
  });

  // Fetch data
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
    queryFn: async () => {
      const params = new URLSearchParams({
        classes: filters.classes.join(","),
        students: filters.students.join(","),
        shift: filters.shift,
        dateFrom: format(filters.dateFrom, "yyyy-MM-dd"),
        dateTo: format(filters.dateTo, "yyyy-MM-dd"),
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

  // Filter students for search
  const filteredStudents = useMemo(() => {
    return studentsData.filter(
      (s: any) =>
        s.code.toLowerCase().includes(filters.studentSearch.toLowerCase()) ||
        s.fullName.toLowerCase().includes(filters.studentSearch.toLowerCase())
    );
  }, [studentsData, filters.studentSearch]);

  // Group attendance by class
  const attendanceByClass = useMemo(() => {
    const grouped: Record<string, any> = {};
    attendanceData.forEach((record: StudentAttendance) => {
      if (!grouped[record.className]) {
        grouped[record.className] = [];
      }
      grouped[record.className].push(record);
    });
    return grouped;
  }, [attendanceData]);

  const toggleClass = (classId: string) => {
    setExpandedClasses((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId]
    );
  };

  const handleDateChange = (
    date: Date | undefined,
    type: "from" | "to"
  ) => {
    if (!date) return;
    if (type === "from") {
      setFilters((prev) => ({ ...prev, dateFrom: date }));
    } else {
      setFilters((prev) => ({ ...prev, dateTo: date }));
    }
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Filters */}
        <div className="bg-card rounded-xl border border-border p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Classes Filter */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Lớp</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left"
                    data-testid="button-class-filter"
                  >
                    {filters.classes.length > 0
                      ? `${filters.classes.length} lớp`
                      : "Chọn lớp"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 bg-white opacity-100" align="start">
                  <div className="space-y-2">
                    {classesData.map((cls: any) => (
                      <div key={cls.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`class-${cls.id}`}
                          checked={filters.classes.includes(cls.id)}
                          onCheckedChange={(checked) => {
                            setFilters((prev) => ({
                              ...prev,
                              classes: checked
                                ? [...prev.classes, cls.id]
                                : prev.classes.filter((id) => id !== cls.id),
                            }));
                          }}
                          data-testid={`checkbox-class-${cls.classCode}`}
                        />
                        <Label
                          htmlFor={`class-${cls.id}`}
                          className="text-sm cursor-pointer"
                        >
                          {cls.classCode}
                        </Label>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              {selectedClassesLabels && (
                <div className="flex flex-wrap gap-1">
                  {filters.classes.map((classId) => {
                    const cls = classesData.find((c: any) => c.id === classId);
                    return (
                      <Badge
                        key={classId}
                        variant="secondary"
                        className="text-xs"
                        data-testid={`badge-class-${cls?.classCode}`}
                      >
                        {cls?.classCode}
                        <button
                          onClick={() =>
                            setFilters((prev) => ({
                              ...prev,
                              classes: prev.classes.filter(
                                (id) => id !== classId
                              ),
                            }))
                          }
                          className="ml-1"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Students Filter */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Học viên</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left"
                    data-testid="button-student-filter"
                  >
                    {filters.students.length > 0
                      ? `${filters.students.length} học viên`
                      : "Tìm học viên"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 bg-white opacity-100" align="start">
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Tìm theo tên hoặc mã"
                        className="pl-8"
                        value={filters.studentSearch}
                        onChange={(e) =>
                          setFilters((prev) => ({
                            ...prev,
                            studentSearch: e.target.value,
                          }))
                        }
                        data-testid="input-student-search"
                      />
                    </div>
                    <ScrollArea className="h-48">
                      <div className="space-y-2 pr-4">
                        {filteredStudents.map((student: any) => (
                          <div
                            key={student.id}
                            className="flex items-center space-x-2"
                          >
                            <Checkbox
                              id={`student-${student.id}`}
                              checked={filters.students.includes(student.id)}
                              onCheckedChange={(checked) => {
                                setFilters((prev) => ({
                                  ...prev,
                                  students: checked
                                    ? [...prev.students, student.id]
                                    : prev.students.filter(
                                        (id) => id !== student.id
                                      ),
                                }));
                              }}
                              data-testid={`checkbox-student-${student.code}`}
                            />
                            <Label
                              htmlFor={`student-${student.id}`}
                              className="text-sm cursor-pointer"
                            >
                              {student.code} - {student.fullName}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </PopoverContent>
              </Popover>
              {selectedStudentsLabels && (
                <div className="flex flex-wrap gap-1">
                  {filters.students.map((studentId) => {
                    const student = studentsData.find(
                      (s: any) => s.id === studentId
                    );
                    return (
                      <Badge
                        key={studentId}
                        variant="secondary"
                        className="text-xs"
                        data-testid={`badge-student-${student?.code}`}
                      >
                        {student?.code}
                        <button
                          onClick={() =>
                            setFilters((prev) => ({
                              ...prev,
                              students: prev.students.filter(
                                (id) => id !== studentId
                              ),
                            }))
                          }
                          className="ml-1"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Shift Filter */}
            <div className="space-y-2">
              <Label htmlFor="shift" className="text-sm font-medium">
                Ca học
              </Label>
              <Select
                value={filters.shift}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, shift: value }))
                }
              >
                <SelectTrigger id="shift" data-testid="select-shift" className="bg-white opacity-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white opacity-100">
                  {SHIFTS.map((shift) => (
                    <SelectItem key={shift.value} value={shift.value}>
                      {shift.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date From */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Từ ngày</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left"
                    data-testid="button-date-from"
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    {format(filters.dateFrom, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="bg-white opacity-100">
                  <CalendarComponent
                    mode="single"
                    selected={filters.dateFrom}
                    onSelect={(date) => handleDateChange(date, "from")}
                    disabled={(date) => date > filters.dateTo}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Date To */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Đến ngày</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left"
                    data-testid="button-date-to"
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    {format(filters.dateTo, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="bg-white opacity-100">
                  <CalendarComponent
                    mode="single"
                    selected={filters.dateTo}
                    onSelect={(date) => handleDateChange(date, "to")}
                    disabled={(date) => date < filters.dateFrom}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Clear Filters */}
          <div className="flex justify-end pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setFilters({
                  classes: [],
                  students: [],
                  shift: "all",
                  dateFrom: new Date(),
                  dateTo: new Date(),
                  studentSearch: "",
                })
              }
              data-testid="button-clear-filters"
            >
              Xoá bộ lọc
            </Button>
          </div>
        </div>

        {/* Attendance Cards */}
        <div className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  Đang tải dữ liệu...
                </p>
              </CardContent>
            </Card>
          ) : Object.keys(attendanceByClass).length === 0 ? (
            <Card className="rounded-xl border border-border">
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  Không có dữ liệu điểm danh
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-4">
                {Object.entries(attendanceByClass)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                  .map(
                    ([className, records]: [string, any]) => {
                      const isExpanded = expandedClasses.includes(className) || expandedClasses.length === 0 || 
                        (expandedClasses.length === 1 && expandedClasses[0] === "");
                    const studentCount = new Set(
                      (records as StudentAttendance[]).map((r) => r.studentCode)
                    ).size;

                    return (
                      <Card key={className} className="overflow-hidden rounded-xl border border-border">
                    <CardHeader
                      className="cursor-pointer hover:bg-secondary/50 transition-colors"
                      onClick={() => toggleClass(className)}
                      data-testid={`header-class-${className}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                          <CardTitle className="text-base">
                            Lớp: {className} ({studentCount} học viên)
                          </CardTitle>
                        </div>
                      </div>
                    </CardHeader>

                    {isExpanded && (
                      <CardContent className="p-0">
                        <ScrollArea className="w-full">
                          <Table>
                            <TableHeader className="sticky top-0 bg-secondary/50">
                              <TableRow>
                                <TableHead
                                  className="text-xs font-semibold w-12"
                                  data-testid="th-checkbox"
                                >
                                </TableHead>
                                <TableHead
                                  className="text-xs font-semibold"
                                  data-testid="th-student-name"
                                >
                                  Tên học viên
                                </TableHead>
                                <TableHead
                                  className="text-xs font-semibold"
                                  data-testid="th-day"
                                >
                                  Thứ
                                </TableHead>
                                <TableHead
                                  className="text-xs font-semibold"
                                  data-testid="th-shift"
                                >
                                  Ca học
                                </TableHead>
                                <TableHead
                                  className="text-xs font-semibold text-center"
                                  data-testid="th-sessions"
                                >
                                  Số buổi
                                </TableHead>
                                <TableHead
                                  className="text-xs font-semibold"
                                  data-testid="th-attendance"
                                >
                                  Điểm danh
                                </TableHead>
                                <TableHead
                                  className="text-xs font-semibold"
                                  data-testid="th-teacher"
                                >
                                  Giáo viên
                                </TableHead>
                                <TableHead
                                  className="text-xs font-semibold"
                                  data-testid="th-notes"
                                >
                                  Ghi chú
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(records as StudentAttendance[]).map(
                                (record, idx) => {
                                  const getAttendanceColor = (status: string) => {
                                    switch (status) {
                                      case "present": return "text-green-600";
                                      case "absent": return "text-red-600";
                                      case "makeup_wait": return "text-orange-600";
                                      case "makeup_done": return "text-blue-600";
                                      case "paused": return "text-yellow-600";
                                      default: return "text-slate-600";
                                    }
                                  };
                                  
                                  const getAttendanceLabel = (status: string) => {
                                    switch (status) {
                                      case "present": return "Có học";
                                      case "absent": return "Nghỉ học";
                                      case "makeup_wait": return "Nghỉ chờ bù";
                                      case "makeup_done": return "Đã học bù";
                                      case "paused": return "Bảo lưu";
                                      default: return "Chưa điểm danh";
                                    }
                                  };
                                  
                                  return (
                                  <TableRow
                                    key={`${record.id}-${idx}`}
                                    data-testid={`row-attendance-${record.studentCode}`}
                                  >
                                    <TableCell className="text-sm w-12">
                                      <Checkbox
                                        checked={selectedRows.has(record.id)}
                                        onCheckedChange={(checked) => {
                                          const newSelected = new Set(selectedRows);
                                          if (checked) {
                                            newSelected.add(record.id);
                                          } else {
                                            newSelected.delete(record.id);
                                          }
                                          setSelectedRows(newSelected);
                                        }}
                                        data-testid={`checkbox-row-${record.id}`}
                                      />
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      {record.studentCode} -{" "}
                                      {record.studentName}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      {record.dayOfWeek}, {format(new Date(record.sessionDate), "d/M/yyyy")}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      {record.shift}
                                    </TableCell>
                                    <TableCell className="text-sm text-center">
                                      {record.sessionOrder}/{record.totalSessions}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      {canAttend ? (
                                        <Select
                                          value={record.attendanceStatus || "pending"}
                                          onValueChange={(val) =>
                                            updateAttendanceMutation.mutate({
                                              studentSessionId: record.id,
                                              attendanceStatus: val,
                                            })
                                          }
                                        >
                                          <SelectTrigger className={`w-[140px] h-8 text-xs bg-white opacity-100 border-0 shadow-none p-0 ${getAttendanceColor(record.attendanceStatus)}`}>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent className="bg-white opacity-100">
                                            <SelectItem value="pending" className="text-slate-600">Chưa điểm danh</SelectItem>
                                            <SelectItem value="present" className="text-green-600 font-medium">Có học</SelectItem>
                                            <SelectItem value="absent" className="text-red-600 font-medium">Nghỉ học</SelectItem>
                                            <SelectItem value="makeup_wait" className="text-orange-600 font-medium">Nghỉ chờ bù</SelectItem>
                                            <SelectItem value="makeup_done" className="text-blue-600 font-medium">Đã học bù</SelectItem>
                                            <SelectItem value="paused" className="text-yellow-600 font-medium">Bảo lưu</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        <span className={`text-xs font-medium ${getAttendanceColor(record.attendanceStatus)}`} data-testid={`status-readonly-${record.id}`}>
                                          {getAttendanceLabel(record.attendanceStatus)}
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      {record.teacherName}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      {canAttend ? (
                                        <Input
                                          className="h-8 text-xs min-w-[150px] bg-white"
                                          placeholder="Ghi chú..."
                                          defaultValue={record.attendanceNote || ""}
                                          onBlur={(e) => {
                                            if (e.target.value !== record.attendanceNote) {
                                              updateNoteMutation.mutate({
                                                studentSessionId: record.id,
                                                attendanceNote: e.target.value,
                                              });
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
                                  </TableRow>
                                );
                                }
                              )}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      </CardContent>
                    )}
                  </Card>
                    );
                  }
                )}
              </div>

              {/* Pagination - Compact on right */}
              <div className="flex justify-end items-center gap-3 mt-6">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Label className="text-xs font-medium">Hiển thị:</Label>
                  <Select value={pageSize.toString()} onValueChange={(val) => {
                    setPageSize(parseInt(val));
                    setCurrentPage(1);
                  }}>
                    <SelectTrigger className="w-16 h-7 bg-white opacity-100 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white opacity-100">
                      <SelectItem value="15">15</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="30">30</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                  <span>trang {currentPage} / {Math.ceil(Object.keys(attendanceByClass).length / pageSize)}</span>
                </div>
                
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={`text-xs h-6 ${currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
                      />
                    </PaginationItem>
                    
                    <PaginationItem>
                      <span className="text-xs text-muted-foreground">{currentPage}</span>
                    </PaginationItem>
                    
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => setCurrentPage(p => Math.min(Math.ceil(Object.keys(attendanceByClass).length / pageSize), p + 1))}
                        className={`text-xs h-6 ${currentPage === Math.ceil(Object.keys(attendanceByClass).length / pageSize) ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
