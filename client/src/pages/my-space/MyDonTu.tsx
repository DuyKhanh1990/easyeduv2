import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Gift,
  Loader2,
  Plus,
  Timer,
  Umbrella,
  Wallet,
  XCircle,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageGuideButton } from "@/components/guides/PageGuideDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

type MainTab = "don-tu" | "thuong-phat" | "tam-ung";
type ViewerType = "staff" | "student" | "parent";

type LeaveRequest = {
  id: string;
  staffId?: string;
  locationId?: string | null;
  locationName?: string | null;
  studentId?: string;
  studentName?: string;
  type?: string;
  fromDate?: string;
  toDate?: string;
  startDate?: string;
  endDate?: string;
  hours?: string | null;
  overtimeFrom?: string | null;
  overtimeTo?: string | null;
  reason?: string | null;
  description?: string | null;
  rejectionReason?: string | null;
  scheduleIds?: string[] | null;
  scheduleSnapshot?: { id: string; date?: string; time?: string }[] | null;
  status: string;
  adminNote?: string | null;
};

type Reward = {
  id: string;
  type: "reward" | "penalty";
  locationId?: string | null;
  locationName?: string | null;
  date: string;
  amount: number;
  reason?: string | null;
};

type Advance = {
  id: string;
  locationId?: string | null;
  locationName?: string | null;
  date: string;
  documentDueDate?: string | null;
  amount: number;
  reason?: string | null;
};

type LocationOption = { id: string; name: string };

type MyDonTuData = {
  viewerType: ViewerType;
  profile: {
    id: string;
    code?: string | null;
    fullName?: string | null;
    assignedLocations?: LocationOption[];
  } | null;
  linkedStudents: { id: string; code: string; fullName: string }[];
  leaveRequests: LeaveRequest[];
  rewards: Reward[];
  advances: Advance[];
};

type StudentLeaveLocation = {
  id: string;
  name: string;
};

type StudentLeaveStudent = {
  id: string;
  code: string;
  fullName: string;
  locations: StudentLeaveLocation[];
};

type StudentLeaveContext = {
  viewerType: "student" | "parent";
  students: StudentLeaveStudent[];
};

type StudentLeaveSchedule = {
  id: string;
  className: string;
  classCode: string;
  date: string;
  time: string;
  teachers?: string;
  locationName?: string;
};

type StaffLeaveForm = {
  type: "nghi_phep" | "nghi_co_luong" | "tang_ca";
  locationId: string;
  fromDate: string;
  toDate: string;
  overtimeFrom: string;
  overtimeTo: string;
  reason: string;
};

const LEAVE_TYPES: Record<string, { key: string; icon: typeof Umbrella; color: string }> = {
  nghi_phep: { key: "leave", icon: Umbrella, color: "bg-violet-100 text-violet-700 border-violet-200" },
  nghi_co_luong: { key: "annualLeave", icon: CalendarDays, color: "bg-blue-100 text-blue-700 border-blue-200" },
  tang_ca: { key: "overtime", icon: Timer, color: "bg-amber-100 text-amber-700 border-amber-200" },
  student_leave: { key: "studentLeave", icon: Umbrella, color: "bg-sky-100 text-sky-700 border-sky-200" },
};

const STATUS: Record<string, { key: string; color: string; dot: string }> = {
  pending: { key: "pending", color: "bg-yellow-100 text-yellow-700 border-yellow-200", dot: "bg-yellow-400" },
  approved: { key: "approved", color: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  rejected: { key: "rejected", color: "bg-red-100 text-red-600 border-red-200", dot: "bg-red-500" },
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("vi-VN");
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("vi-VN").format(Number(value || 0))} ₫`;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function dateAfterDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calculateStaffLeaveHours(fromDate: string, toDate: string) {
  if (!fromDate || !toDate) return "0";
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  const days = Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000)) + 1;
  return String(days * 8);
}

function calculateOvertimeHours(fromTime: string, toTime: string) {
  if (!fromTime || !toTime) return 0;
  const [fromHour, fromMinute] = fromTime.split(":").map(Number);
  const [toHour, toMinute] = toTime.split(":").map(Number);
  const minutes = (toHour * 60 + toMinute) - (fromHour * 60 + fromMinute);
  return minutes > 0 ? Number((minutes / 60).toFixed(2)) : 0;
}

function getLeaveType(type: string, t: (key: string) => string) {
  const item = LEAVE_TYPES[type];
  return item ? { ...item, label: t(`mySpace.donTu.${item.key}`) } : { key: type, label: type, icon: FileText, color: "bg-slate-100 text-slate-600 border-slate-200" };
}

function getRequestType(request: LeaveRequest, viewerType: ViewerType) {
  return viewerType === "staff" ? (request.type ?? "") : "student_leave";
}

function getRequestStartDate(request: LeaveRequest) {
  return request.fromDate ?? request.startDate;
}

function getRequestEndDate(request: LeaveRequest) {
  return request.toDate ?? request.endDate;
}

function getRequestReason(request: LeaveRequest) {
  return request.reason ?? request.description;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 px-6 text-center text-slate-400">
      <FileText className="h-10 w-10 opacity-25" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

export default function MyDonTu() {
  const { t } = useLanguage();
  const tr = (key: string) => t(`mySpace.donTu.${key}`);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [mainTab, setMainTab] = useState<MainTab>("don-tu");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [studentFilter, setStudentFilter] = useState("all");
  const [rewardFilter, setRewardFilter] = useState<"all" | "reward" | "penalty">("all");
  const [studentLeaveDialogOpen, setStudentLeaveDialogOpen] = useState(false);
  const [selectedLeaveStudentId, setSelectedLeaveStudentId] = useState("");
  const [leaveStartDate, setLeaveStartDate] = useState("");
  const [leaveEndDate, setLeaveEndDate] = useState("");
  const [leaveDescription, setLeaveDescription] = useState("");
  const [selectedLeaveScheduleIds, setSelectedLeaveScheduleIds] = useState<Set<string>>(new Set());
  const [staffLeaveDialogOpen, setStaffLeaveDialogOpen] = useState(false);
  const [staffLeaveForm, setStaffLeaveForm] = useState<StaffLeaveForm>({
    type: "nghi_phep",
    locationId: "",
    fromDate: todayDate(),
    toDate: todayDate(),
    overtimeFrom: "17:00",
    overtimeTo: "19:00",
    reason: "",
  });
  const [advanceDialogOpen, setAdvanceDialogOpen] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({
    locationId: "",
    date: todayDate(),
    documentDueDate: dateAfterDays(todayDate(), 7),
    amount: "",
    reason: "",
  });

  const { data, isLoading, isError } = useQuery<MyDonTuData>({
    queryKey: ["/api/my-space/don-tu"],
    queryFn: async () => {
      const response = await fetch("/api/my-space/don-tu", { credentials: "include" });
      if (!response.ok) throw new Error(tr("loadError"));
      return response.json();
    },
  });

  const viewerType = data?.viewerType ?? "staff";
  const isStaff = viewerType === "staff";
  const linkedStudents = data?.linkedStudents ?? [];
  const isStudentArea = viewerType === "student" || viewerType === "parent";

  const studentLeaveContextQuery = useQuery<StudentLeaveContext>({
    queryKey: ["/api/student-leave-requests/self/context"],
    queryFn: async () => {
      const response = await fetch("/api/student-leave-requests/self/context", { credentials: "include" });
      if (!response.ok) throw new Error(tr("studentLoadError"));
      return response.json();
    },
    enabled: studentLeaveDialogOpen && isStudentArea,
  });

  const leaveContextStudents = studentLeaveContextQuery.data?.students ?? [];
  const activeLeaveStudentId = viewerType === "student"
    ? leaveContextStudents[0]?.id ?? data?.profile?.id ?? ""
    : selectedLeaveStudentId || leaveContextStudents[0]?.id || "";
  const activeLeaveStudent = leaveContextStudents.find((student) => student.id === activeLeaveStudentId);

  useEffect(() => {
    if (studentLeaveDialogOpen && viewerType === "parent" && !selectedLeaveStudentId && leaveContextStudents[0]) {
      setSelectedLeaveStudentId(leaveContextStudents[0].id);
    }
  }, [studentLeaveDialogOpen, viewerType, selectedLeaveStudentId, leaveContextStudents]);

  const studentLeaveSchedulesQuery = useQuery<StudentLeaveSchedule[]>({
    queryKey: ["/api/student-leave-requests/self/schedules", activeLeaveStudentId, leaveStartDate, leaveEndDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        studentId: activeLeaveStudentId,
        startDate: leaveStartDate,
        endDate: leaveEndDate,
      });
      const response = await fetch(`/api/student-leave-requests/self/schedules?${params.toString()}`, { credentials: "include" });
      if (!response.ok) throw new Error(tr("loadScheduleError"));
      return response.json();
    },
    enabled: studentLeaveDialogOpen && isStudentArea && Boolean(activeLeaveStudentId && leaveStartDate && leaveEndDate && leaveStartDate <= leaveEndDate),
  });

  const createStudentLeaveMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/student-leave-requests/self", {
      ...(viewerType === "parent" ? { studentId: activeLeaveStudentId } : {}),
      scheduleIds: Array.from(selectedLeaveScheduleIds),
      startDate: leaveStartDate,
      endDate: leaveEndDate,
      description: leaveDescription.trim() || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-space/don-tu"] });
      toast({ title: tr("sentStudentLeave") });
      closeStudentLeaveDialog();
    },
    onError: (error: Error) => {
      toast({ title: tr("sendStudentLeaveError"), description: error.message, variant: "destructive" });
    },
  });

  const createStaffLeaveMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/leave-requests/self", {
      type: staffLeaveForm.type,
      locationId: staffLeaveForm.locationId,
      fromDate: staffLeaveForm.fromDate,
      toDate: staffLeaveForm.type === "tang_ca" ? staffLeaveForm.fromDate : staffLeaveForm.toDate,
      hours: staffLeaveForm.type === "tang_ca"
        ? String(calculateOvertimeHours(staffLeaveForm.overtimeFrom, staffLeaveForm.overtimeTo))
        : calculateStaffLeaveHours(staffLeaveForm.fromDate, staffLeaveForm.toDate),
      overtimeFrom: staffLeaveForm.type === "tang_ca" ? staffLeaveForm.overtimeFrom : null,
      overtimeTo: staffLeaveForm.type === "tang_ca" ? staffLeaveForm.overtimeTo : null,
      reason: staffLeaveForm.reason.trim() || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-space/don-tu"] });
      toast({ title: tr("createdLeave") });
      setStaffLeaveDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: tr("createLeaveError"), description: error.message, variant: "destructive" });
    },
  });

  const createAdvanceMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/staff-advances/self", {
      locationId: advanceForm.locationId,
      date: advanceForm.date,
      documentDueDate: advanceForm.documentDueDate,
      amount: Number(advanceForm.amount),
      reason: advanceForm.reason.trim() || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-space/don-tu"] });
      toast({ title: tr("advanceCreated") });
      setAdvanceDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: tr("advanceCreateError"), description: error.message, variant: "destructive" });
    },
  });

  function openStaffLeaveDialog() {
    const date = todayDate();
    const assignedLocations = data?.profile?.assignedLocations ?? [];
    setStaffLeaveForm({
      type: "nghi_phep",
      locationId: assignedLocations.length === 1 ? assignedLocations[0].id : "",
      fromDate: date,
      toDate: date,
      overtimeFrom: "17:00",
      overtimeTo: "19:00",
      reason: "",
    });
    setStaffLeaveDialogOpen(true);
  }

  function openAdvanceDialog() {
    const date = todayDate();
    const assignedLocations = data?.profile?.assignedLocations ?? [];
    setAdvanceForm({
      locationId: assignedLocations.length === 1 ? assignedLocations[0].id : "",
      date,
      documentDueDate: dateAfterDays(date, 7),
      amount: "",
      reason: "",
    });
    setAdvanceDialogOpen(true);
  }

  function closeStaffLeaveDialog() {
    if (!createStaffLeaveMutation.isPending) setStaffLeaveDialogOpen(false);
  }

  function closeAdvanceDialog() {
    if (!createAdvanceMutation.isPending) setAdvanceDialogOpen(false);
  }

  function submitStaffLeaveRequest() {
    const assignedLocations = data?.profile?.assignedLocations ?? [];
    if (!staffLeaveForm.locationId || !assignedLocations.some((location) => location.id === staffLeaveForm.locationId)) {
      toast({ title: tr("chooseLocation"), variant: "destructive" });
      return;
    }
    if (!staffLeaveForm.fromDate || !staffLeaveForm.toDate) {
      toast({ title: tr("enterLeavePeriod"), variant: "destructive" });
      return;
    }
    if (staffLeaveForm.fromDate > staffLeaveForm.toDate) {
      toast({ title: tr("invalidDateRange"), variant: "destructive" });
      return;
    }
    if (
      staffLeaveForm.type === "tang_ca"
      && calculateOvertimeHours(staffLeaveForm.overtimeFrom, staffLeaveForm.overtimeTo) <= 0
    ) {
      toast({ title: tr("invalidOvertime"), variant: "destructive" });
      return;
    }
    createStaffLeaveMutation.mutate();
  }

  function submitAdvanceRequest() {
    const assignedLocations = data?.profile?.assignedLocations ?? [];
    const amount = Number(advanceForm.amount);
    if (!advanceForm.locationId || !assignedLocations.some((location) => location.id === advanceForm.locationId)) {
      toast({ title: tr("chooseLocation"), variant: "destructive" });
      return;
    }
    if (!advanceForm.date || !advanceForm.documentDueDate) {
      toast({ title: tr("completeAdvanceDates"), variant: "destructive" });
      return;
    }
    if (advanceForm.documentDueDate < advanceForm.date) {
      toast({ title: tr("invalidAdvanceDueDate"), variant: "destructive" });
      return;
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      toast({ title: tr("invalidAdvanceAmount"), variant: "destructive" });
      return;
    }
    createAdvanceMutation.mutate();
  }

  function openStudentLeaveDialog() {
    setSelectedLeaveStudentId("");
    setLeaveStartDate("");
    setLeaveEndDate("");
    setLeaveDescription("");
    setSelectedLeaveScheduleIds(new Set());
    setStudentLeaveDialogOpen(true);
  }

  function closeStudentLeaveDialog() {
    if (createStudentLeaveMutation.isPending) return;
    setStudentLeaveDialogOpen(false);
    setSelectedLeaveStudentId("");
    setLeaveStartDate("");
    setLeaveEndDate("");
    setLeaveDescription("");
    setSelectedLeaveScheduleIds(new Set());
  }

  function toggleLeaveSchedule(scheduleId: string, checked: boolean) {
    setSelectedLeaveScheduleIds((current) => {
      const next = new Set(current);
      if (checked) next.add(scheduleId);
      else next.delete(scheduleId);
      return next;
    });
  }

  function submitStudentLeaveRequest() {
    if (!activeLeaveStudentId || !leaveStartDate || !leaveEndDate) {
      toast({ title: tr("enterLeavePeriod"), variant: "destructive" });
      return;
    }
    if (leaveStartDate > leaveEndDate) {
      toast({ title: tr("invalidDateRange"), variant: "destructive" });
      return;
    }
    if ((studentLeaveSchedulesQuery.data?.length ?? 0) > 0 && selectedLeaveScheduleIds.size === 0) {
      toast({ title: tr("chooseSchedule"), variant: "destructive" });
      return;
    }
    createStudentLeaveMutation.mutate();
  }

  const filteredLeaveRequests = useMemo(() => {
    return (data?.leaveRequests ?? []).filter((request) => (
      (statusFilter === "all" || request.status === statusFilter)
      && (typeFilter === "all" || getRequestType(request, viewerType) === typeFilter)
      && (studentFilter === "all" || request.studentId === studentFilter)
    ));
  }, [data?.leaveRequests, statusFilter, typeFilter, studentFilter, viewerType]);

  const filteredRewards = useMemo(() => (
    (data?.rewards ?? []).filter((record) => rewardFilter === "all" || record.type === rewardFilter)
  ), [data?.rewards, rewardFilter]);

  const pendingCount = (data?.leaveRequests ?? []).filter((request) => request.status === "pending").length;
  const approvedCount = (data?.leaveRequests ?? []).filter((request) => request.status === "approved").length;
  const rewardTotal = (data?.rewards ?? []).filter((record) => record.type === "reward").reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const penaltyTotal = (data?.rewards ?? []).filter((record) => record.type === "penalty").reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const advanceTotal = (data?.advances ?? []).reduce((sum, record) => sum + Number(record.amount || 0), 0);

  const tabs = [
    { id: "don-tu" as const, label: tr("requests"), icon: FileText },
    ...(isStaff ? [
      { id: "thuong-phat" as const, label: tr("rewardsPenalties"), icon: Gift },
      { id: "tam-ung" as const, label: tr("advances"), icon: Wallet },
    ] : []),
  ];

  return (
    <DashboardLayout fullscreen>
      <div className="flex h-full flex-col overflow-hidden bg-slate-50 dark:bg-gray-950">
        <div className="shrink-0 bg-slate-600 px-6 pt-4 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
                  <h1 className="text-base font-semibold text-white">{tr("title")}</h1>
              <p className="mt-0.5 text-xs text-slate-200">
                {isStaff
                  ? `${tr("personalInfo")}${data?.profile?.fullName ? ` · ${data.profile.fullName}` : ""}`
                  : viewerType === "parent" ? tr("linkedStudents") : tr("studentRequests")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {data?.viewerType === "staff" && mainTab !== "thuong-phat" ? (
                <Button
                  size="sm"
                  onClick={mainTab === "tam-ung" ? openAdvanceDialog : openStaffLeaveDialog}
                  className="h-8 gap-1 bg-white text-slate-700 hover:bg-slate-100"
                  data-testid={mainTab === "tam-ung" ? "button-open-staff-advance-request" : "button-open-staff-leave-request"}
                >
                  <Plus className="h-4 w-4" />
                  {mainTab === "tam-ung" ? tr("addAdvance") : tr("add")}
                </Button>
              ) : isStudentArea && (
                <Button
                  size="sm"
                  onClick={openStudentLeaveDialog}
                  className="h-8 gap-1 bg-white text-slate-700 hover:bg-slate-100"
                  data-testid="button-open-student-leave-request"
                >
                  <Plus className="h-4 w-4" />
                  {tr("add")}
                </Button>
              )}
              <PageGuideButton pageTitle={tr("title")} />
            </div>
          </div>
          <div className="mt-4 flex items-end gap-1 overflow-x-auto">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setMainTab(id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-medium transition-all",
                  mainTab === id ? "bg-white text-slate-700 shadow-sm" : "bg-white/10 text-slate-200 hover:bg-white/20",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">{tr("loading")}</div>
        ) : isError ? (
          <div className="flex flex-1 items-center justify-center text-sm text-red-500">{tr("loadError")}</div>
        ) : mainTab === "don-tu" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:gap-3 sm:p-4 md:p-5">
            <div className="grid shrink-0 grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
              {[
                { label: tr("totalRequests"), value: data?.leaveRequests.length ?? 0, icon: FileText, color: "text-violet-600", bg: "bg-violet-50 border-violet-200" },
                { label: tr("pending"), value: pendingCount, icon: Clock3, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
                { label: tr("approved"), value: approvedCount, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
                { label: tr("rejected"), value: (data?.leaveRequests ?? []).filter((request) => request.status === "rejected").length, icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200" },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className={cn("rounded-xl border p-2 sm:p-3", bg)}>
                  <div className="flex items-center gap-1.5">
                    <Icon className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4", color)} />
                    <span className="text-[10px] font-medium text-slate-500 sm:text-[11px]">{label}</span>
                  </div>
                  <p className={cn("mt-1 text-lg font-bold sm:text-xl", color)}>{value}</p>
                </div>
              ))}
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
              <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-slate-100 bg-slate-50/60 px-2 py-2 dark:border-gray-800 dark:bg-gray-900/50 sm:flex sm:flex-wrap sm:items-center sm:px-4 sm:py-3">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 w-full bg-white text-xs sm:w-36"><SelectValue placeholder={tr("status")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{tr("allStatuses")}</SelectItem>
                    <SelectItem value="pending">{tr("pending")}</SelectItem>
                    <SelectItem value="approved">{tr("approved")}</SelectItem>
                    <SelectItem value="rejected">{tr("rejected")}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="h-8 w-full bg-white text-xs sm:w-36"><SelectValue placeholder={tr("requestType")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{tr("allRequestTypes")}</SelectItem>
                    {Object.entries(LEAVE_TYPES).map(([value, item]) => <SelectItem key={value} value={value}>{tr(item.key)}</SelectItem>)}
                  </SelectContent>
                </Select>
                {viewerType === "parent" && linkedStudents.length > 0 && (
                  <Select value={studentFilter} onValueChange={setStudentFilter}>
                    <SelectTrigger className="col-span-2 h-8 w-full bg-white text-xs sm:col-span-1 sm:w-48"><SelectValue placeholder={tr("student")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tr("allStudents")}</SelectItem>
                      {linkedStudents.map((student) => <SelectItem key={student.id} value={student.id}>{student.fullName || student.code}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <span className="col-span-2 justify-self-end text-xs text-slate-400 sm:ml-auto">{filteredLeaveRequests.length} {tr("requestCount")}</span>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                {filteredLeaveRequests.length === 0 ? <EmptyState message={tr("noMatchingRequests")} /> : (
                  <>
                    <div className="space-y-2 p-2 md:hidden">
                      {filteredLeaveRequests.map((request) => {
                        const requestType = getRequestType(request, viewerType);
        const type = getLeaveType(requestType, t);
        const status = STATUS[request.status] ?? { key: request.status, color: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" };
                        const TypeIcon = type.icon;
                        const ownerName = isStaff ? (data?.profile?.fullName || data?.profile?.code || "Tôi") : request.studentName;
                        const startDate = getRequestStartDate(request);
                        const endDate = getRequestEndDate(request);
                        const reason = getRequestReason(request);
                        const scheduleCount = request.scheduleSnapshot?.length ?? request.scheduleIds?.length ?? 0;
                        return (
                          <article key={request.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-950">
                            <div className="flex items-start justify-between gap-2">
                              <span className={cn("inline-flex max-w-[62%] items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold", type.color)}>
                                <TypeIcon className="h-3 w-3 shrink-0" />
                                 <span className="truncate">{type.label}</span>
                              </span>
                              <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold", status.color)}>
                                <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
                                 {tr(status.key)}
                              </span>
                            </div>
                            {viewerType !== "student" && (
                              <div className="mt-2">
                                <p className="truncate text-xs font-semibold text-slate-700">{ownerName || "—"}</p>
                                {isStaff && request.locationName && (
                                  <p className="mt-0.5 truncate text-[10px] text-slate-400">{tr("location")}: {request.locationName}</p>
                                )}
                              </div>
                            )}
                            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-slate-100 pt-2.5 dark:border-gray-800">
                              <div className="min-w-0">
                                 <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{tr("time")}</p>
                                <p className="mt-0.5 text-xs font-medium text-slate-600">
                                  {requestType === "tang_ca" && request.overtimeFrom && request.overtimeTo
                                    ? `${formatDate(startDate)} · ${request.overtimeFrom}–${request.overtimeTo}`
                                    : <>{formatDate(startDate)} – {formatDate(endDate)}</>}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                  {requestType === "student_leave" ? tr("sessions") : tr("hours")}
                                </p>
                                <p className="mt-0.5 text-xs font-bold text-slate-600">
                                  {requestType === "student_leave"
                                     ? (scheduleCount > 0 ? `${scheduleCount} ${tr("session")}` : "—")
                                    : request.hours ? `${request.hours}${requestType === "tang_ca" ? "h" : ""}` : "—"}
                                </p>
                              </div>
                            </div>
                            <div className="mt-2 border-t border-slate-100 pt-2 dark:border-gray-800">
                               <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{tr("reasonNotes")}</p>
                              <p className="mt-0.5 break-words text-xs text-slate-600">{reason || "—"}</p>
                              {request.status === "rejected" && (request.adminNote || request.rejectionReason) && (
                                <p className="mt-1 break-words text-[10px] italic text-red-500">↳ {request.adminNote || request.rejectionReason}</p>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full min-w-0 table-fixed border-collapse">
                        <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900">
                          <tr>
                            {viewerType !== "student" && <th className="w-[18%] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{isStaff ? tr("sender") : tr("student")}</th>}
                            <th className="w-[18%] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{tr("requestType")}</th>
                            <th className="w-[22%] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{tr("time")}</th>
                            <th className="w-[12%] px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">{viewerType === "student" || viewerType === "parent" ? tr("sessions") : tr("hours")}</th>
                            <th className="w-[15%] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{tr("status")}</th>
                            <th className="w-[25%] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{tr("reasonNotes")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLeaveRequests.map((request, index) => {
                            const requestType = getRequestType(request, viewerType);
                        const type = getLeaveType(requestType, t);
                        const status = STATUS[request.status] ?? { key: request.status, color: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" };
                            const TypeIcon = type.icon;
                            const ownerName = isStaff ? (data?.profile?.fullName || data?.profile?.code || "Tôi") : request.studentName;
                            const startDate = getRequestStartDate(request);
                            const endDate = getRequestEndDate(request);
                            const reason = getRequestReason(request);
                            const scheduleCount = request.scheduleSnapshot?.length ?? request.scheduleIds?.length ?? 0;
                            return (
                              <tr key={request.id} className={cn(index % 2 ? "bg-slate-50/60" : "bg-white", "border-b border-slate-100 hover:bg-violet-50/30")}>
                                {viewerType !== "student" && <td className="px-3 py-3 text-xs font-semibold text-slate-700"><span className="block truncate">{ownerName || "—"}</span></td>}
                                 <td className="px-3 py-3">
                                   <span className={cn("inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold", type.color)}><TypeIcon className="h-3 w-3 shrink-0" /><span className="truncate">{type.label}</span></span>
                                   {isStaff && request.locationName && <p className="mt-1 truncate text-[10px] text-slate-400">{request.locationName}</p>}
                                </td>
                                <td className="break-words px-3 py-3 text-xs font-medium text-slate-600">{requestType === "tang_ca" && request.overtimeFrom && request.overtimeTo ? `${formatDate(startDate)} · ${request.overtimeFrom}–${request.overtimeTo}` : `${formatDate(startDate)} – ${formatDate(endDate)}`}</td>
                                <td className="break-words px-3 py-3 text-center text-xs font-bold text-slate-600">{requestType === "student_leave" ? (scheduleCount > 0 ? `${scheduleCount} ${tr("session")}` : "—") : request.hours ? `${request.hours}${requestType === "tang_ca" ? "h" : ""}` : "—"}</td>
                                 <td className="px-3 py-3"><span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold", status.color)}><span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", status.dot)} /><span className="truncate">{tr(status.key)}</span></span></td>
                                <td className="break-words px-3 py-3 text-xs text-slate-600"><p className="line-clamp-2" title={reason ?? ""}>{reason || "—"}</p>{request.status === "rejected" && (request.adminNote || request.rejectionReason) && <p className="mt-0.5 line-clamp-2 text-[10px] italic text-red-500">↳ {request.adminNote || request.rejectionReason}</p>}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : mainTab === "thuong-phat" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 md:p-5">
            <div className="grid shrink-0 grid-cols-2 gap-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-medium text-slate-500">{tr("totalReward")}</p><p className="mt-1 text-xl font-bold text-emerald-700">{formatMoney(rewardTotal)}</p></div>
              <div className="rounded-xl border border-red-200 bg-red-50 p-4"><p className="text-xs font-medium text-slate-500">{tr("totalPenalty")}</p><p className="mt-1 text-xl font-bold text-red-600">{formatMoney(penaltyTotal)}</p></div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-gray-800">
                {(["all", "reward", "penalty"] as const).map((value) => <button key={value} onClick={() => setRewardFilter(value)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", rewardFilter === value ? value === "reward" ? "border-emerald-200 bg-emerald-100 text-emerald-700" : value === "penalty" ? "border-red-200 bg-red-100 text-red-600" : "border-violet-200 bg-violet-100 text-violet-700" : "border-slate-200 bg-white text-slate-500")}>{value === "all" ? tr("all") : value === "reward" ? tr("reward") : tr("penalty")}</button>)}
              </div>
              {filteredRewards.length === 0 ? <EmptyState message={tr("noRewards")} /> : (
                <table className="w-full min-w-[720px] border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-900"><tr><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{tr("type")}</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{tr("date")}</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{tr("location")}</th><th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">{tr("amount")}</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{tr("reason")}</th></tr></thead>
                  <tbody>{filteredRewards.map((record, index) => <tr key={record.id} className={cn(index % 2 ? "bg-slate-50/60" : "bg-white", "border-b border-slate-100")}><td className="px-4 py-3 text-xs font-semibold">{record.type === "reward" ? <span className="inline-flex items-center gap-1 text-emerald-600"><Gift className="h-3.5 w-3.5" />{tr("reward")}</span> : <span className="inline-flex items-center gap-1 text-red-600"><AlertTriangle className="h-3.5 w-3.5" />{tr("penalty")}</span>}</td><td className="px-4 py-3 text-xs text-slate-600">{formatDate(record.date)}</td><td className="px-4 py-3 text-xs text-slate-600">{record.locationName || "—"}</td><td className={cn("px-4 py-3 text-right text-xs font-bold", record.type === "reward" ? "text-emerald-700" : "text-red-600")}>{formatMoney(record.amount)}</td><td className="max-w-[320px] truncate px-4 py-3 text-xs text-slate-600">{record.reason || "—"}</td></tr>)}</tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 md:p-5">
            <div className="shrink-0 rounded-xl border border-violet-200 bg-violet-50 p-4"><p className="text-xs font-medium text-slate-500">{tr("totalAdvance")}</p><p className="mt-1 text-xl font-bold text-violet-700">{formatMoney(advanceTotal)}</p></div>
            <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
              {(data?.advances ?? []).length === 0 ? <EmptyState message={tr("noAdvances")} /> : (
                <table className="w-full min-w-[620px] border-collapse">
                  <thead className="bg-slate-100 dark:bg-slate-900"><tr><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{tr("date")}</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{tr("location")}</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{tr("documentDueDate")}</th><th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">{tr("amount")}</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{tr("reason")}</th></tr></thead>
                  <tbody>{data?.advances.map((record, index) => <tr key={record.id} className={cn(index % 2 ? "bg-slate-50/60" : "bg-white", "border-b border-slate-100")}><td className="px-4 py-3 text-xs text-slate-600">{formatDate(record.date)}</td><td className="px-4 py-3 text-xs text-slate-600">{record.locationName || "—"}</td><td className="px-4 py-3 text-xs text-slate-600">{formatDate(record.documentDueDate)}</td><td className="px-4 py-3 text-right text-xs font-bold text-violet-700">{formatMoney(record.amount)}</td><td className="max-w-[320px] truncate px-4 py-3 text-xs text-slate-600">{record.reason || "—"}</td></tr>)}</tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={studentLeaveDialogOpen} onOpenChange={(open) => open ? setStudentLeaveDialogOpen(true) : closeStudentLeaveDialog()}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tr("addStudentLeave")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {studentLeaveContextQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border bg-muted/20 px-4 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {tr("loadingStudent")}
              </div>
            ) : studentLeaveContextQuery.isError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {tr("studentLoadError")}
              </div>
            ) : (
              <>
                {viewerType === "parent" && leaveContextStudents.length > 1 && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{tr("student")}</label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={activeLeaveStudentId}
                      onChange={(event) => {
                        setSelectedLeaveStudentId(event.target.value);
                        setSelectedLeaveScheduleIds(new Set());
                      }}
                      disabled={createStudentLeaveMutation.isPending}
                    >
                      {leaveContextStudents.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.fullName} ({student.code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">{tr("student")}</p>
                    <p className="mt-1 text-sm font-medium">
                      {activeLeaveStudent?.fullName || data?.profile?.fullName || "—"}
                      {(activeLeaveStudent?.code || data?.profile?.code) && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          ({activeLeaveStudent?.code || data?.profile?.code})
                        </span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{tr("assignedLocation")}</p>
                    <p className="mt-1 text-sm font-medium">
                      {activeLeaveStudent?.locations.length
                        ? activeLeaveStudent.locations.map((location) => location.name).join(", ")
                        : tr("noLocation")}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">
                     {tr("leavePeriod")} <span className="text-red-500">*</span>
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">{tr("start")}</label>
                      <Input
                        type="date"
                        value={leaveStartDate}
                        onChange={(event) => {
                          setLeaveStartDate(event.target.value);
                          setSelectedLeaveScheduleIds(new Set());
                        }}
                        disabled={createStudentLeaveMutation.isPending}
                        data-testid="input-student-leave-start-date"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">{tr("end")}</label>
                      <Input
                        type="date"
                        value={leaveEndDate}
                        onChange={(event) => {
                          setLeaveEndDate(event.target.value);
                          setSelectedLeaveScheduleIds(new Set());
                        }}
                        disabled={createStudentLeaveMutation.isPending}
                        data-testid="input-student-leave-end-date"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-medium">{tr("actualSchedule")}</label>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {selectedLeaveScheduleIds.size > 0 && <span>{tr("selectedSessions").replace("{count}", String(selectedLeaveScheduleIds.size))}</span>}
                      {studentLeaveSchedulesQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto rounded-lg border">
                    {studentLeaveSchedulesQuery.data?.length ? (
                      studentLeaveSchedulesQuery.data.map((schedule) => (
                        <label
                          key={schedule.id}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 border-b px-3 py-2.5 text-sm last:border-b-0 hover:bg-muted/30",
                            selectedLeaveScheduleIds.has(schedule.id) && "bg-emerald-50/60",
                          )}
                        >
                          <Checkbox
                            checked={selectedLeaveScheduleIds.has(schedule.id)}
                            onCheckedChange={(checked) => toggleLeaveSchedule(schedule.id, checked === true)}
                            disabled={createStudentLeaveMutation.isPending}
                            className="mt-0.5"
                          />
                          <div className="min-w-0">
                          <div className="font-medium">
                            {schedule.className}
                            {schedule.classCode && <span className="ml-1 text-xs font-normal text-muted-foreground">({schedule.classCode})</span>}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(schedule.date)}
                            {schedule.time && ` · ${schedule.time}`}
                            {schedule.locationName && ` · ${schedule.locationName}`}
                            {schedule.teachers && ` · ${schedule.teachers}`}
                          </div>
                          </div>
                        </label>
                      ))
                    ) : (
                      <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                        {leaveStartDate && leaveEndDate
                          ? tr("noSchedules")
                          : tr("chooseTime")}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tr("chooseSchedules")}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">{tr("description")}</label>
                  <Textarea
                    rows={3}
                    placeholder={tr("leaveReasonPlaceholder")}
                    value={leaveDescription}
                    onChange={(event) => setLeaveDescription(event.target.value)}
                    disabled={createStudentLeaveMutation.isPending}
                    data-testid="textarea-student-leave-description"
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeStudentLeaveDialog} disabled={createStudentLeaveMutation.isPending}>
              {tr("cancel")}
            </Button>
            <Button
              onClick={submitStudentLeaveRequest}
              disabled={
                createStudentLeaveMutation.isPending
                || studentLeaveContextQuery.isLoading
                || !activeLeaveStudentId
                || !activeLeaveStudent?.locations.length
                || !leaveStartDate
                || !leaveEndDate
                || studentLeaveSchedulesQuery.isFetching
                || ((studentLeaveSchedulesQuery.data?.length ?? 0) > 0 && selectedLeaveScheduleIds.size === 0)
              }
              data-testid="button-save-student-leave-request"
            >
              {createStudentLeaveMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {tr("sendRequest")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={staffLeaveDialogOpen} onOpenChange={(open) => open ? setStaffLeaveDialogOpen(true) : closeStaffLeaveDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{tr("addRequest")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">{tr("staff")}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {data?.profile?.fullName || tr("loading")}
                {data?.profile?.code && <span className="ml-1 font-normal text-muted-foreground">({data.profile.code})</span>}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">{tr("location")}</label>
              {(data?.profile?.assignedLocations ?? []).length > 1 ? (
                <Select
                  value={staffLeaveForm.locationId}
                  onValueChange={(locationId) => setStaffLeaveForm((current) => ({ ...current, locationId }))}
                  disabled={createStaffLeaveMutation.isPending}
                >
                  <SelectTrigger className="h-10 w-full"><SelectValue placeholder={tr("chooseLocation")} /></SelectTrigger>
                  <SelectContent>
                    {data?.profile?.assignedLocations?.map((location) => (
                      <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="rounded-lg border bg-muted/20 px-3 py-2.5 text-sm">
                  {data?.profile?.assignedLocations?.[0]?.name || tr("noLocation")}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">{tr("requestType")}</label>
              <Select
                value={staffLeaveForm.type}
                onValueChange={(value) => setStaffLeaveForm((current) => ({
                  ...current,
                  type: value as StaffLeaveForm["type"],
                }))}
                disabled={createStaffLeaveMutation.isPending}
              >
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder={tr("chooseRequestType")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nghi_phep">{tr("leave")}</SelectItem>
                  <SelectItem value="nghi_co_luong">{tr("annualLeave")}</SelectItem>
                  <SelectItem value="tang_ca">{tr("overtime")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{tr("fromDate")}</label>
                <Input
                  type="date"
                  value={staffLeaveForm.fromDate}
                  onChange={(event) => setStaffLeaveForm((current) => ({ ...current, fromDate: event.target.value }))}
                  disabled={createStaffLeaveMutation.isPending}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{tr("toDate")}</label>
                <Input
                  type="date"
                  value={staffLeaveForm.toDate}
                  onChange={(event) => setStaffLeaveForm((current) => ({ ...current, toDate: event.target.value }))}
                  disabled={createStaffLeaveMutation.isPending || staffLeaveForm.type === "tang_ca"}
                />
              </div>
            </div>

            {staffLeaveForm.type === "tang_ca" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{tr("fromTime")}</label>
                  <Input
                    type="time"
                    value={staffLeaveForm.overtimeFrom}
                    onChange={(event) => setStaffLeaveForm((current) => ({ ...current, overtimeFrom: event.target.value }))}
                    disabled={createStaffLeaveMutation.isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{tr("toTime")}</label>
                  <Input
                    type="time"
                    value={staffLeaveForm.overtimeTo}
                    onChange={(event) => setStaffLeaveForm((current) => ({ ...current, overtimeTo: event.target.value }))}
                    disabled={createStaffLeaveMutation.isPending}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">{tr("reason")}</label>
              <Textarea
                rows={4}
                placeholder={tr("reasonPlaceholder")}
                value={staffLeaveForm.reason}
                onChange={(event) => setStaffLeaveForm((current) => ({ ...current, reason: event.target.value }))}
                disabled={createStaffLeaveMutation.isPending}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeStaffLeaveDialog} disabled={createStaffLeaveMutation.isPending}>
              {tr("cancel")}
            </Button>
            <Button onClick={submitStaffLeaveRequest} disabled={createStaffLeaveMutation.isPending}>
              {createStaffLeaveMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {tr("createRequest")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={advanceDialogOpen} onOpenChange={(open) => open ? setAdvanceDialogOpen(true) : closeAdvanceDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{tr("addAdvance")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">{tr("staff")}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {data?.profile?.fullName || tr("loading")}
                {data?.profile?.code && <span className="ml-1 font-normal text-muted-foreground">({data.profile.code})</span>}
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{tr("location")}</label>
              {(data?.profile?.assignedLocations ?? []).length > 1 ? (
                <Select
                  value={advanceForm.locationId}
                  onValueChange={(locationId) => setAdvanceForm((current) => ({ ...current, locationId }))}
                  disabled={createAdvanceMutation.isPending}
                >
                  <SelectTrigger className="h-10 w-full"><SelectValue placeholder={tr("chooseLocation")} /></SelectTrigger>
                  <SelectContent>
                    {data?.profile?.assignedLocations?.map((location) => (
                      <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="rounded-lg border bg-muted/20 px-3 py-2.5 text-sm">
                  {data?.profile?.assignedLocations?.[0]?.name || tr("noLocation")}
                </div>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{tr("date")}</label>
                <Input
                  type="date"
                  value={advanceForm.date}
                  onChange={(event) => setAdvanceForm((current) => ({ ...current, date: event.target.value }))}
                  disabled={createAdvanceMutation.isPending}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{tr("documentDueDate")}</label>
                <Input
                  type="date"
                  value={advanceForm.documentDueDate}
                  onChange={(event) => setAdvanceForm((current) => ({ ...current, documentDueDate: event.target.value }))}
                  disabled={createAdvanceMutation.isPending}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{tr("amount")}</label>
              <Input
                type="number"
                min="1"
                step="1"
                value={advanceForm.amount}
                onChange={(event) => setAdvanceForm((current) => ({ ...current, amount: event.target.value }))}
                disabled={createAdvanceMutation.isPending}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{tr("reason")}</label>
              <Textarea
                rows={3}
                placeholder={tr("reasonPlaceholder")}
                value={advanceForm.reason}
                onChange={(event) => setAdvanceForm((current) => ({ ...current, reason: event.target.value }))}
                disabled={createAdvanceMutation.isPending}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAdvanceDialog} disabled={createAdvanceMutation.isPending}>
              {tr("cancel")}
            </Button>
            <Button
              onClick={submitAdvanceRequest}
              disabled={createAdvanceMutation.isPending || !(data?.profile?.assignedLocations?.length)}
              data-testid="button-save-staff-advance-request"
            >
              {createAdvanceMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {tr("createAdvance")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}