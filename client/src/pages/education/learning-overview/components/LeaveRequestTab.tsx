import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, ClipboardList, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Pagination } from "./Pagination";

type LocationOption = {
  id: string;
  name: string;
};

type StudentOption = {
  id: string;
  fullName: string;
  code?: string | null;
};

type ScheduleOption = {
  id: string;
  classSessionId: string;
  studentId: string;
  className: string;
  classCode: string;
  date: string;
  time: string;
  shiftName?: string | null;
  teachers?: string;
};

type LeaveStatus = "pending" | "approved" | "rejected";
type AttendanceApprovalMode = "unchanged" | "applied";

type LeaveRequest = {
  id: string;
  studentId: string;
  studentName: string;
  studentCode?: string | null;
  locationId: string;
  locationName: string;
  scheduleIds: string[];
  scheduleSnapshot: ScheduleOption[];
  startDate: string;
  endDate: string;
  description?: string | null;
  status: LeaveStatus;
  attendanceApprovalMode?: AttendanceApprovalMode | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

type LeaveResponse = {
  data: LeaveRequest[];
  total: number;
  page: number;
  pageSize: number;
};

type LeaveForm = {
  locationId: string;
  startDate: string;
  endDate: string;
  description: string;
  status: LeaveStatus;
};

const EMPTY_FORM: LeaveForm = {
  locationId: "",
  startDate: "",
  endDate: "",
  description: "",
  status: "pending",
};

const STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
};

const STATUS_STYLES: Record<LeaveStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
};

const ATTENDANCE_OPTIONS = [
  { value: "unchanged", label: "Giữ nguyên", className: "border-slate-200 bg-slate-50 text-slate-700" },
  { value: "present", label: "Có học", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { value: "absent", label: "Nghỉ học", className: "border-red-200 bg-red-50 text-red-700" },
  { value: "makeup_wait", label: "Nghỉ chờ bù", className: "border-orange-200 bg-orange-50 text-orange-700" },
  { value: "makeup_done", label: "Đã học bù", className: "border-blue-200 bg-blue-50 text-blue-700" },
  { value: "paused", label: "Bảo lưu", className: "border-yellow-200 bg-yellow-50 text-yellow-700" },
] as const;

function formatDate(date: string | null | undefined) {
  if (!date) return "—";
  const [year, month, day] = date.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "—";
}

function formatDateTime(date: string | null | undefined) {
  if (!date) return "—";
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function ScheduleLines({ schedules }: { schedules: ScheduleOption[] }) {
  if (!schedules?.length) return <span className="text-muted-foreground">Chưa chọn lịch</span>;

  return (
    <div className="min-w-[190px] space-y-1">
      {schedules.slice(0, 3).map((schedule) => (
        <div key={schedule.id} className="leading-5">
          <div className="font-medium text-foreground">
            {schedule.className}
            {schedule.classCode && <span className="ml-1 text-xs font-normal text-muted-foreground">({schedule.classCode})</span>}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatDate(schedule.date)}
            {schedule.time && ` · ${schedule.time}`}
            {schedule.teachers && ` · ${schedule.teachers}`}
          </div>
        </div>
      ))}
      {schedules.length > 3 && (
        <div className="text-xs text-muted-foreground">+{schedules.length - 3} lịch học khác</div>
      )}
    </div>
  );
}

export function LeaveRequestTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<LeaveRequest | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeaveRequest | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<StudentOption[]>([]);
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<LeaveForm>(EMPTY_FORM);
  const [attendanceTarget, setAttendanceTarget] = useState<LeaveRequest | null>(null);
  const [attendanceStatus, setAttendanceStatus] = useState<string>("unchanged");
  const [rejectionTarget, setRejectionTarget] = useState<LeaveRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const listQuery = useQuery<LeaveResponse>({
    queryKey: ["/api/student-leave-requests", search, locationFilter, statusFilter, page, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) params.set("search", search.trim());
      if (locationFilter) params.set("locationId", locationFilter);
      if (statusFilter) params.set("status", statusFilter);
      const response = await fetch(`/api/student-leave-requests?${params.toString()}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error("Không thể tải danh sách đơn xin nghỉ");
      return response.json();
    },
  });

  const { data: locations = [] } = useQuery<LocationOption[]>({
    queryKey: ["/api/locations", "leave-request"],
    queryFn: async () => {
      const response = await fetch("/api/locations", { credentials: "include", headers: getAuthHeaders() });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : data?.locations ?? data?.data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const dialogOpen = dialogMode !== null;
  const { data: students = [] } = useQuery<StudentOption[]>({
    queryKey: ["/api/students", "leave-request"],
    queryFn: async () => {
      const response = await fetch("/api/students?minimal=true", {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : data?.students ?? data?.data ?? [];
    },
    enabled: dialogOpen,
    staleTime: 5 * 60_000,
  });

  const studentIdsKey = selectedStudents.map((student) => student.id).sort().join(",");
  const schedulesQuery = useQuery<ScheduleOption[]>({
    queryKey: ["/api/student-leave-requests/schedules", form.locationId, form.startDate, form.endDate, studentIdsKey],
    queryFn: async () => {
      const params = new URLSearchParams({
        locationId: form.locationId,
        startDate: form.startDate,
        endDate: form.endDate,
        studentIds: selectedStudents.map((student) => student.id).join(","),
      });
      const response = await fetch(`/api/student-leave-requests/schedules?${params.toString()}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error("Không thể tải lịch học");
      return response.json();
    },
    enabled: dialogOpen && Boolean(form.locationId && form.startDate && form.endDate && selectedStudents.length),
  });
  const schedules = schedulesQuery.data ?? [];

  const filteredStudents = useMemo(() => {
    const keyword = studentSearch.trim().toLowerCase();
    if (!keyword) return [];
    const selectedIds = new Set(selectedStudents.map((student) => student.id));
    return students
      .filter((student) => !selectedIds.has(student.id))
      .filter((student) => `${student.fullName} ${student.code ?? ""}`.toLowerCase().includes(keyword))
      .slice(0, 8);
  }, [studentSearch, students, selectedStudents]);

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", "/api/student-leave-requests", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/student-leave-requests"] });
      toast({ title: "Đã tạo đơn xin nghỉ" });
      closeDialog();
    },
    onError: (error: Error) => toast({ title: "Không thể tạo đơn", description: error.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiRequest("PUT", `/api/student-leave-requests/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/student-leave-requests"] });
      toast({ title: "Đã cập nhật đơn xin nghỉ" });
      closeDialog();
    },
    onError: (error: Error) => toast({ title: "Không thể cập nhật đơn", description: error.message, variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ request, status }: { request: LeaveRequest; status: LeaveStatus }) =>
      apiRequest("PUT", `/api/student-leave-requests/${request.id}`, {
        status,
        ...(status !== "rejected" ? { rejectionReason: null } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/student-leave-requests"] });
      toast({ title: "Đã cập nhật trạng thái đơn xin nghỉ" });
    },
    onError: (error: Error) => toast({ title: "Không thể cập nhật trạng thái", description: error.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ request, reason }: { request: LeaveRequest; reason: string }) =>
      apiRequest("PUT", `/api/student-leave-requests/${request.id}`, {
        status: "rejected",
        rejectionReason: reason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/student-leave-requests"] });
      setRejectionTarget(null);
      setRejectionReason("");
      toast({ title: "Đã từ chối đơn xin nghỉ" });
    },
    onError: (error: Error) => toast({ title: "Không thể từ chối đơn", description: error.message, variant: "destructive" }),
  });

  const approveWithAttendanceMutation = useMutation({
    mutationFn: async ({ request, status }: { request: LeaveRequest; status: string }) => {
      if (status !== "unchanged") {
        for (const studentSessionId of request.scheduleIds ?? []) {
          await apiRequest("PATCH", `/api/student-sessions/${studentSessionId}/attendance`, { status });
        }
      }
      return apiRequest("PUT", `/api/student-leave-requests/${request.id}`, {
        status: "approved",
        attendanceApprovalMode: status === "unchanged" ? "unchanged" : "applied",
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/student-leave-requests"] });
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && (
            key.includes("/student-sessions") ||
            key === "/api/my-space/calendar/staff" ||
            key === "/api/schedule"
          );
        },
      });
      setAttendanceTarget(null);
      toast({
        title: "Đã duyệt đơn xin nghỉ",
        description: `${variables.request.scheduleIds?.length ?? 0} buổi học đã được cập nhật điểm danh.`,
      });
    },
    onError: (error: Error) => toast({ title: "Không thể duyệt đơn", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/student-leave-requests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/student-leave-requests"] });
      toast({ title: "Đã xóa đơn xin nghỉ" });
      setDeleteTarget(null);
    },
    onError: (error: Error) => toast({ title: "Không thể xóa đơn", description: error.message, variant: "destructive" }),
  });

  function resetDialog() {
    setForm(EMPTY_FORM);
    setStudentSearch("");
    setSelectedStudents([]);
    setSelectedScheduleIds(new Set());
    setEditTarget(null);
  }

  function closeDialog() {
    setDialogMode(null);
    resetDialog();
  }

  function openCreate() {
    resetDialog();
    setDialogMode("create");
  }

  function openEdit(request: LeaveRequest) {
    setEditTarget(request);
    setForm({
      locationId: request.locationId,
      startDate: request.startDate,
      endDate: request.endDate,
      description: request.description ?? "",
      status: request.status,
    });
    setSelectedStudents([{
      id: request.studentId,
      fullName: request.studentName,
      code: request.studentCode,
    }]);
    setSelectedScheduleIds(new Set(request.scheduleIds ?? []));
    setDialogMode("edit");
  }

  function toggleSchedule(scheduleId: string, checked: boolean) {
    setSelectedScheduleIds((current) => {
      const next = new Set(current);
      if (checked) next.add(scheduleId);
      else next.delete(scheduleId);
      return next;
    });
  }

  function handleStatusChange(request: LeaveRequest, status: LeaveStatus) {
    if (status === "approved") {
      setAttendanceStatus("unchanged");
      setAttendanceTarget(request);
      return;
    }
    if (status === "rejected") {
      setRejectionTarget(request);
      setRejectionReason(request.rejectionReason ?? "");
      return;
    }
    updateStatusMutation.mutate({ request, status });
  }

  function applyRejection() {
    const reason = rejectionReason.trim();
    if (!rejectionTarget || !reason) {
      toast({ title: "Vui lòng nhập lý do từ chối", variant: "destructive" });
      return;
    }
    rejectMutation.mutate({ request: rejectionTarget, reason });
  }

  function applyApproval() {
    if (!attendanceTarget) return;
    approveWithAttendanceMutation.mutate({
      request: attendanceTarget,
      status: attendanceStatus,
    });
  }

  function submitForm() {
    if (!form.locationId || !form.startDate || !form.endDate || !selectedStudents.length) {
      toast({ title: "Vui lòng nhập đủ thông tin bắt buộc", variant: "destructive" });
      return;
    }
    if (form.startDate > form.endDate) {
      toast({ title: "Ngày bắt đầu không được sau ngày kết thúc", variant: "destructive" });
      return;
    }
    const scheduleIds = Array.from(selectedScheduleIds);
    if (schedules.length > 0 && scheduleIds.length === 0) {
      toast({ title: "Vui lòng chọn ít nhất một lịch học", variant: "destructive" });
      return;
    }

    if (dialogMode === "edit" && editTarget) {
      updateMutation.mutate({
        id: editTarget.id,
        data: {
          locationId: form.locationId,
          scheduleIds,
          startDate: form.startDate,
          endDate: form.endDate,
          description: form.description.trim() || null,
          status: form.status,
        },
      });
      return;
    }

    createMutation.mutate({
      locationId: form.locationId,
      studentIds: selectedStudents.map((student) => student.id),
      scheduleIds,
      startDate: form.startDate,
      endDate: form.endDate,
      description: form.description.trim() || null,
    });
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const rows = listQuery.data?.data ?? [];
  const total = listQuery.data?.total ?? 0;

  useEffect(() => {
    setPage(1);
  }, [search, locationFilter, statusFilter, pageSize]);

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="shrink-0 space-y-3 border-b border-border/50 bg-card px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-semibold">Xin nghỉ</h2>
              <Badge variant="secondary" className="font-normal">{total}</Badge>
            </div>
            <Button size="sm" onClick={openCreate} data-testid="button-open-leave-request">
              <Plus className="mr-1 h-4 w-4" />
              Thêm mới
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-9 text-sm"
                placeholder="Tìm theo tên hoặc mã học viên..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                data-testid="input-leave-search"
              />
            </div>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              value={locationFilter}
              onChange={(event) => setLocationFilter(event.target.value)}
              data-testid="select-leave-filter-location"
            >
              <option value="">Tất cả cơ sở</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              data-testid="select-leave-filter-status"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="pending">Chờ duyệt</option>
              <option value="approved">Đã duyệt</option>
              <option value="rejected">Từ chối</option>
            </select>
            {(search || locationFilter || statusFilter) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-1 text-muted-foreground"
                onClick={() => { setSearch(""); setLocationFilter(""); setStatusFilter(""); }}
              >
                <X className="h-3.5 w-3.5" />
                Xóa lọc
              </Button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-6 pt-4">
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[1120px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/60">
                  <th className="w-[210px] px-3 py-2.5 text-left font-medium text-muted-foreground">Tên</th>
                  <th className="w-[130px] px-3 py-2.5 text-left font-medium text-muted-foreground">Cơ sở</th>
                  <th className="w-[260px] px-3 py-2.5 text-left font-medium text-muted-foreground">Lịch học</th>
                  <th className="w-[110px] px-3 py-2.5 text-left font-medium text-muted-foreground">Ngày tạo</th>
                  <th className="w-[105px] px-3 py-2.5 text-left font-medium text-muted-foreground">Bắt đầu</th>
                  <th className="w-[105px] px-3 py-2.5 text-left font-medium text-muted-foreground">Kết thúc</th>
                  <th className="min-w-[180px] px-3 py-2.5 text-left font-medium text-muted-foreground">Mô tả</th>
                  <th className="w-[120px] px-3 py-2.5 text-left font-medium text-muted-foreground">Trạng thái</th>
                  <th className="w-[90px] px-3 py-2.5 text-center font-medium text-muted-foreground">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {listQuery.isLoading ? (
                  <tr><td colSpan={9} className="h-36 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
                ) : listQuery.isError ? (
                  <tr><td colSpan={9} className="h-36 text-center text-sm text-destructive">Không thể tải danh sách đơn xin nghỉ.</td></tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="h-48 text-center">
                      <ClipboardList className="mx-auto mb-2 h-10 w-10 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">Chưa có đơn xin nghỉ</p>
                      <p className="mt-1 text-xs text-muted-foreground">Nhấn “Thêm mới” để tạo đơn xin nghỉ cho học viên.</p>
                    </td>
                  </tr>
                ) : rows.map((request) => (
                  <tr key={request.id} className="border-b align-top last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-3">
                      <div className="font-medium">{request.studentName}</div>
                      <div className="text-xs text-muted-foreground">{request.studentCode || "Chưa có mã"}</div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{request.locationName}</td>
                    <td className="px-3 py-3"><ScheduleLines schedules={request.scheduleSnapshot ?? []} /></td>
                    <td className="px-3 py-3 text-muted-foreground">{formatDateTime(request.createdAt)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatDate(request.startDate)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatDate(request.endDate)}</td>
                    <td className="max-w-[250px] px-3 py-3 text-muted-foreground">
                      <span className="line-clamp-3" title={request.description ?? undefined}>{request.description || "—"}</span>
                      {request.rejectionReason && (
                        <div className="mt-1 line-clamp-3 text-xs font-medium text-red-600" title={request.rejectionReason}>
                          Lý do từ chối: {request.rejectionReason}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={`inline-flex cursor-pointer rounded border px-2 py-1 text-xs font-medium transition-opacity hover:opacity-75 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 ${STATUS_STYLES[request.status] ?? STATUS_STYLES.pending}`}
                            aria-label={`Đổi trạng thái đơn của ${request.studentName}`}
                            data-testid={`button-status-leave-${request.id}`}
                          >
                            {STATUS_LABELS[request.status] ?? request.status}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-36">
                          {(Object.keys(STATUS_LABELS) as LeaveStatus[]).map((status) => (
                            <DropdownMenuItem
                              key={status}
                              className="cursor-pointer gap-2 text-sm"
                              onSelect={() => handleStatusChange(request, status)}
                              disabled={updateStatusMutation.isPending || approveWithAttendanceMutation.isPending}
                            >
                              <span className={`h-2 w-2 rounded-full ${status === "pending" ? "bg-amber-500" : status === "approved" ? "bg-emerald-500" : "bg-red-500"}`} />
                              {STATUS_LABELS[status]}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                    <td className="px-3 py-3">
                      {request.status !== "approved" && (
                        <div className="flex justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(request)} aria-label="Sửa đơn xin nghỉ" data-testid={`button-edit-leave-${request.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(request)} aria-label="Xóa đơn xin nghỉ" data-testid={`button-delete-leave-${request.id}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => open ? setDialogMode("create") : closeDialog()}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogMode === "edit" ? "Sửa đơn xin nghỉ" : "Thêm đơn xin nghỉ"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Cơ sở <span className="text-red-500">*</span></label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.locationId}
                  onChange={(event) => { setForm((current) => ({ ...current, locationId: event.target.value })); setSelectedScheduleIds(new Set()); }}
                  data-testid="select-leave-location"
                >
                  <option value="">Chọn cơ sở</option>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
              </div>
              {dialogMode === "edit" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Trạng thái</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.status}
                    onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as LeaveStatus }))}
                  >
                    <option value="pending">Chờ duyệt</option>
                    <option value="approved">Đã duyệt</option>
                    <option value="rejected">Từ chối</option>
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Học viên <span className="text-red-500">*</span></label>
              {dialogMode === "create" && (
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Tìm tên hoặc mã học viên để chọn..."
                    value={studentSearch}
                    onChange={(event) => setStudentSearch(event.target.value)}
                    data-testid="input-leave-student-search"
                  />
                  {filteredStudents.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border bg-background p-1 shadow-lg">
                      {filteredStudents.map((student) => (
                        <button
                          key={student.id}
                          type="button"
                          onClick={() => { setSelectedStudents((current) => [...current, student]); setStudentSearch(""); }}
                          className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-muted"
                        >
                          <span>{student.fullName}</span>
                          {student.code && <span className="text-xs text-muted-foreground">{student.code}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/20 p-3">
                {selectedStudents.map((student) => (
                  <span key={student.id} className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs font-medium">
                    {student.fullName}{student.code && <span className="text-muted-foreground">({student.code})</span>}
                    {dialogMode === "create" && (
                      <button type="button" onClick={() => setSelectedStudents((current) => current.filter((item) => item.id !== student.id))} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Bỏ chọn ${student.fullName}`}>
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
                {!selectedStudents.length && <span className="text-xs text-muted-foreground">Chưa chọn học viên</span>}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Thời gian xin nghỉ <span className="text-red-500">*</span></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Bắt đầu</label>
                  <Input type="date" value={form.startDate} onChange={(event) => { setForm((current) => ({ ...current, startDate: event.target.value })); setSelectedScheduleIds(new Set()); }} data-testid="input-leave-start-date" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Kết thúc</label>
                  <Input type="date" value={form.endDate} onChange={(event) => { setForm((current) => ({ ...current, endDate: event.target.value })); setSelectedScheduleIds(new Set()); }} data-testid="input-leave-end-date" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium">Lịch học thực tế</label>
                {selectedScheduleIds.size > 0 && <span className="text-xs text-muted-foreground">Đã chọn {selectedScheduleIds.size} lịch học</span>}
              </div>
              <div className="overflow-hidden rounded-lg border">
                <div className="grid grid-cols-[36px_1.4fr_1fr_1.3fr] gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground">
                  <span />
                  <span>Lớp học</span>
                  <span>Ngày học</span>
                  <span>Thời gian / Giáo viên</span>
                </div>
                {schedulesQuery.isFetching ? (
                  <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Đang tải lịch học...</div>
                ) : schedules.length > 0 ? (
                  schedules.map((schedule) => (
                    <label key={schedule.id} className={`grid cursor-pointer grid-cols-[36px_1.4fr_1fr_1.3fr] items-center gap-2 border-b px-3 py-2.5 text-sm last:border-b-0 hover:bg-muted/30 ${selectedScheduleIds.has(schedule.id) ? "bg-emerald-50/60" : ""}`}>
                      <Checkbox checked={selectedScheduleIds.has(schedule.id)} onCheckedChange={(checked) => toggleSchedule(schedule.id, checked === true)} />
                      <span className="truncate">{schedule.className} <span className="text-xs text-muted-foreground">({schedule.classCode})</span></span>
                      <span className="text-muted-foreground">{formatDate(schedule.date)}</span>
                      <span className="truncate text-muted-foreground">{schedule.time || schedule.shiftName || "—"}{schedule.teachers && ` · ${schedule.teachers}`}</span>
                    </label>
                  ))
                ) : (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {selectedStudents.length && form.locationId && form.startDate && form.endDate
                      ? "Không có lịch học đã lập trong khoảng thời gian này."
                      : "Chọn cơ sở, học viên và khoảng thời gian để tải lịch học thật."}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Mô tả</label>
              <Textarea rows={4} placeholder="Nhập lý do xin nghỉ..." value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} data-testid="textarea-leave-reason" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Hủy</Button>
            <Button
              disabled={isSaving || schedulesQuery.isFetching || !form.locationId || !form.startDate || !form.endDate || !selectedStudents.length}
              onClick={submitForm}
              data-testid="button-save-leave-request"
            >
              {isSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
              {dialogMode === "edit" ? "Cập nhật" : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!rejectionTarget}
        onOpenChange={(open) => {
          if (!open && !rejectMutation.isPending) {
            setRejectionTarget(null);
            setRejectionReason("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Từ chối đơn xin nghỉ</DialogTitle>
            <DialogDescription>
              Nhập lý do từ chối đơn của {rejectionTarget?.studentName}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">
              Lý do từ chối <span className="text-red-500">*</span>
            </label>
            <Textarea
              rows={5}
              autoFocus
              placeholder="Nhập lý do từ chối..."
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              disabled={rejectMutation.isPending}
              data-testid="textarea-leave-rejection-reason"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setRejectionTarget(null); setRejectionReason(""); }}
              disabled={rejectMutation.isPending}
            >
              Hủy
            </Button>
            <Button
              variant="destructive"
              onClick={applyRejection}
              disabled={rejectMutation.isPending || !rejectionReason.trim()}
              data-testid="button-confirm-leave-rejection"
            >
              {rejectMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Xác nhận từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!attendanceTarget} onOpenChange={(open) => !open && !approveWithAttendanceMutation.isPending && setAttendanceTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Chọn trạng thái điểm danh</DialogTitle>
            <DialogDescription>
              Chọn cách xử lý điểm danh cho các buổi học trong đơn xin nghỉ.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
              <div className="font-medium">{attendanceTarget?.studentName}</div>
              <div className="mt-1 text-muted-foreground">
                Chọn trạng thái cho {attendanceTarget?.scheduleIds?.length ?? 0} buổi học trong đơn trước khi duyệt.
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {ATTENDANCE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setAttendanceStatus(option.value)}
                  disabled={approveWithAttendanceMutation.isPending}
                  className={`rounded-lg border px-3 py-3 text-left text-sm font-medium transition-all hover:shadow-sm ${option.className} ${attendanceStatus === option.value ? "ring-2 ring-primary ring-offset-2" : "opacity-75 hover:opacity-100"}`}
                  data-testid={`button-approval-attendance-${option.value}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {attendanceStatus === "unchanged"
                ? "Giữ nguyên sẽ không thay đổi điểm danh hiện tại, chỉ chuyển đơn sang Đã duyệt."
                : "Khi đơn được chuyển khỏi Đã duyệt, các buổi học đã áp dụng trạng thái này sẽ được trả về Chưa điểm danh."}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttendanceTarget(null)} disabled={approveWithAttendanceMutation.isPending}>Hủy</Button>
            <Button onClick={applyApproval} disabled={approveWithAttendanceMutation.isPending}>
              {approveWithAttendanceMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Duyệt và áp dụng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa đơn xin nghỉ?</AlertDialogTitle>
            <AlertDialogDescription>
              Đơn của <strong>{deleteTarget?.studentName}</strong> sẽ bị xóa vĩnh viễn.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => { event.preventDefault(); if (deleteTarget) deleteMutation.mutate(deleteTarget.id); }}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}