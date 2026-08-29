import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Gift,
  Timer,
  Umbrella,
  Wallet,
  XCircle,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageGuideButton } from "@/components/guides/PageGuideDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type MainTab = "don-tu" | "thuong-phat" | "tam-ung";
type ViewerType = "staff" | "student" | "parent";

type LeaveRequest = {
  id: string;
  staffId?: string;
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
  date: string;
  amount: number;
  reason?: string | null;
};

type Advance = {
  id: string;
  date: string;
  documentDueDate?: string | null;
  amount: number;
  reason?: string | null;
};

type MyDonTuData = {
  viewerType: ViewerType;
  profile: { id: string; code?: string | null; fullName?: string | null } | null;
  linkedStudents: { id: string; code: string; fullName: string }[];
  leaveRequests: LeaveRequest[];
  rewards: Reward[];
  advances: Advance[];
};

const LEAVE_TYPES: Record<string, { label: string; icon: typeof Umbrella; color: string }> = {
  nghi_phep: { label: "Nghỉ phép", icon: Umbrella, color: "bg-violet-100 text-violet-700 border-violet-200" },
  nghi_co_luong: { label: "Nghỉ phép năm", icon: CalendarDays, color: "bg-blue-100 text-blue-700 border-blue-200" },
  tang_ca: { label: "Tăng ca", icon: Timer, color: "bg-amber-100 text-amber-700 border-amber-200" },
  student_leave: { label: "Xin nghỉ học", icon: Umbrella, color: "bg-sky-100 text-sky-700 border-sky-200" },
};

const STATUS: Record<string, { label: string; color: string; dot: string }> = {
  pending: { label: "Chờ duyệt", color: "bg-yellow-100 text-yellow-700 border-yellow-200", dot: "bg-yellow-400" },
  approved: { label: "Đã duyệt", color: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  rejected: { label: "Từ chối", color: "bg-red-100 text-red-600 border-red-200", dot: "bg-red-500" },
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("vi-VN");
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("vi-VN").format(Number(value || 0))} ₫`;
}

function getLeaveType(type: string) {
  return LEAVE_TYPES[type] ?? { label: type, icon: FileText, color: "bg-slate-100 text-slate-600 border-slate-200" };
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
  const [mainTab, setMainTab] = useState<MainTab>("don-tu");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [studentFilter, setStudentFilter] = useState("all");
  const [rewardFilter, setRewardFilter] = useState<"all" | "reward" | "penalty">("all");

  const { data, isLoading, isError } = useQuery<MyDonTuData>({
    queryKey: ["/api/my-space/don-tu"],
    queryFn: async () => {
      const response = await fetch("/api/my-space/don-tu", { credentials: "include" });
      if (!response.ok) throw new Error("Không thể tải dữ liệu đơn từ");
      return response.json();
    },
  });

  const viewerType = data?.viewerType ?? "staff";
  const isStaff = viewerType === "staff";
  const linkedStudents = data?.linkedStudents ?? [];

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
    { id: "don-tu" as const, label: "Đơn từ", icon: FileText },
    ...(isStaff ? [
      { id: "thuong-phat" as const, label: "Thưởng / Phạt", icon: Gift },
      { id: "tam-ung" as const, label: "Tạm ứng", icon: Wallet },
    ] : []),
  ];

  return (
    <DashboardLayout fullscreen>
      <div className="flex h-full flex-col overflow-hidden bg-slate-50 dark:bg-gray-950">
        <div className="shrink-0 bg-slate-600 px-6 pt-4 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-base font-semibold text-white">Đơn từ của tôi</h1>
              <p className="mt-0.5 text-xs text-slate-200">
                {isStaff
                  ? `Thông tin cá nhân${data?.profile?.fullName ? ` · ${data.profile.fullName}` : ""}`
                  : viewerType === "parent" ? "Đơn từ của các học viên đã liên kết" : "Đơn từ của học viên"}
              </p>
            </div>
            <PageGuideButton pageTitle="Đơn từ của tôi" className="shrink-0" />
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
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Đang tải dữ liệu...</div>
        ) : isError ? (
          <div className="flex flex-1 items-center justify-center text-sm text-red-500">Không thể tải dữ liệu đơn từ.</div>
        ) : mainTab === "don-tu" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:gap-3 sm:p-4 md:p-5">
            <div className="grid shrink-0 grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
              {[
                { label: "Tổng số đơn", value: data?.leaveRequests.length ?? 0, icon: FileText, color: "text-violet-600", bg: "bg-violet-50 border-violet-200" },
                { label: "Chờ duyệt", value: pendingCount, icon: Clock3, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
                { label: "Đã duyệt", value: approvedCount, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
                { label: "Từ chối", value: (data?.leaveRequests ?? []).filter((request) => request.status === "rejected").length, icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200" },
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
                  <SelectTrigger className="h-8 w-full bg-white text-xs sm:w-36"><SelectValue placeholder="Trạng thái" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả trạng thái</SelectItem>
                    <SelectItem value="pending">Chờ duyệt</SelectItem>
                    <SelectItem value="approved">Đã duyệt</SelectItem>
                    <SelectItem value="rejected">Từ chối</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="h-8 w-full bg-white text-xs sm:w-36"><SelectValue placeholder="Loại đơn" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả loại đơn</SelectItem>
                    {Object.entries(LEAVE_TYPES).map(([value, item]) => <SelectItem key={value} value={value}>{item.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {viewerType === "parent" && linkedStudents.length > 0 && (
                  <Select value={studentFilter} onValueChange={setStudentFilter}>
                    <SelectTrigger className="col-span-2 h-8 w-full bg-white text-xs sm:col-span-1 sm:w-48"><SelectValue placeholder="Học viên" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả học viên</SelectItem>
                      {linkedStudents.map((student) => <SelectItem key={student.id} value={student.id}>{student.fullName || student.code}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <span className="col-span-2 justify-self-end text-xs text-slate-400 sm:ml-auto">{filteredLeaveRequests.length} đơn từ</span>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                {filteredLeaveRequests.length === 0 ? <EmptyState message="Chưa có đơn từ phù hợp" /> : (
                  <>
                    <div className="space-y-2 p-2 md:hidden">
                      {filteredLeaveRequests.map((request) => {
                        const requestType = getRequestType(request, viewerType);
                        const type = getLeaveType(requestType);
                        const status = STATUS[request.status] ?? { label: request.status, color: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" };
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
                                {status.label}
                              </span>
                            </div>
                            {viewerType !== "student" && (
                              <p className="mt-2 truncate text-xs font-semibold text-slate-700">{ownerName || "—"}</p>
                            )}
                            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-slate-100 pt-2.5 dark:border-gray-800">
                              <div className="min-w-0">
                                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Thời gian</p>
                                <p className="mt-0.5 text-xs font-medium text-slate-600">
                                  {requestType === "tang_ca" && request.overtimeFrom && request.overtimeTo
                                    ? `${formatDate(startDate)} · ${request.overtimeFrom}–${request.overtimeTo}`
                                    : <>{formatDate(startDate)} – {formatDate(endDate)}</>}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                  {requestType === "student_leave" ? "Số buổi" : "Số giờ"}
                                </p>
                                <p className="mt-0.5 text-xs font-bold text-slate-600">
                                  {requestType === "student_leave"
                                    ? (scheduleCount > 0 ? `${scheduleCount} buổi` : "—")
                                    : request.hours ? `${request.hours}${requestType === "tang_ca" ? "h" : ""}` : "—"}
                                </p>
                              </div>
                            </div>
                            <div className="mt-2 border-t border-slate-100 pt-2 dark:border-gray-800">
                              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Lý do / Ghi chú</p>
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
                            {viewerType !== "student" && <th className="w-[18%] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{isStaff ? "Người gửi" : "Học viên"}</th>}
                            <th className="w-[18%] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Loại đơn</th>
                            <th className="w-[22%] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Thời gian</th>
                            <th className="w-[12%] px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">{viewerType === "student" || viewerType === "parent" ? "Số buổi" : "Số giờ"}</th>
                            <th className="w-[15%] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Trạng thái</th>
                            <th className="w-[25%] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Lý do / Ghi chú</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLeaveRequests.map((request, index) => {
                            const requestType = getRequestType(request, viewerType);
                            const type = getLeaveType(requestType);
                            const status = STATUS[request.status] ?? { label: request.status, color: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" };
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
                                </td>
                                <td className="break-words px-3 py-3 text-xs font-medium text-slate-600">{requestType === "tang_ca" && request.overtimeFrom && request.overtimeTo ? `${formatDate(startDate)} · ${request.overtimeFrom}–${request.overtimeTo}` : `${formatDate(startDate)} – ${formatDate(endDate)}`}</td>
                                <td className="break-words px-3 py-3 text-center text-xs font-bold text-slate-600">{requestType === "student_leave" ? (scheduleCount > 0 ? `${scheduleCount} buổi` : "—") : request.hours ? `${request.hours}${requestType === "tang_ca" ? "h" : ""}` : "—"}</td>
                                <td className="px-3 py-3"><span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold", status.color)}><span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", status.dot)} /><span className="truncate">{status.label}</span></span></td>
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
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-medium text-slate-500">Tổng thưởng</p><p className="mt-1 text-xl font-bold text-emerald-700">{formatMoney(rewardTotal)}</p></div>
              <div className="rounded-xl border border-red-200 bg-red-50 p-4"><p className="text-xs font-medium text-slate-500">Tổng phạt</p><p className="mt-1 text-xl font-bold text-red-600">{formatMoney(penaltyTotal)}</p></div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-gray-800">
                {(["all", "reward", "penalty"] as const).map((value) => <button key={value} onClick={() => setRewardFilter(value)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", rewardFilter === value ? value === "reward" ? "border-emerald-200 bg-emerald-100 text-emerald-700" : value === "penalty" ? "border-red-200 bg-red-100 text-red-600" : "border-violet-200 bg-violet-100 text-violet-700" : "border-slate-200 bg-white text-slate-500")}>{value === "all" ? "Tất cả" : value === "reward" ? "Thưởng" : "Phạt"}</button>)}
              </div>
              {filteredRewards.length === 0 ? <EmptyState message="Chưa có phiếu thưởng / phạt" /> : (
                <table className="w-full min-w-[620px] border-collapse">
                  <thead className="bg-slate-100 dark:bg-slate-900"><tr><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Loại</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Ngày</th><th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">Số tiền</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Lý do</th></tr></thead>
                  <tbody>{filteredRewards.map((record, index) => <tr key={record.id} className={cn(index % 2 ? "bg-slate-50/60" : "bg-white", "border-b border-slate-100")}><td className="px-4 py-3 text-xs font-semibold">{record.type === "reward" ? <span className="inline-flex items-center gap-1 text-emerald-600"><Gift className="h-3.5 w-3.5" />Thưởng</span> : <span className="inline-flex items-center gap-1 text-red-600"><AlertTriangle className="h-3.5 w-3.5" />Phạt</span>}</td><td className="px-4 py-3 text-xs text-slate-600">{formatDate(record.date)}</td><td className={cn("px-4 py-3 text-right text-xs font-bold", record.type === "reward" ? "text-emerald-700" : "text-red-600")}>{formatMoney(record.amount)}</td><td className="max-w-[320px] truncate px-4 py-3 text-xs text-slate-600">{record.reason || "—"}</td></tr>)}</tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 md:p-5">
            <div className="shrink-0 rounded-xl border border-violet-200 bg-violet-50 p-4"><p className="text-xs font-medium text-slate-500">Tổng tạm ứng</p><p className="mt-1 text-xl font-bold text-violet-700">{formatMoney(advanceTotal)}</p></div>
            <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
              {(data?.advances ?? []).length === 0 ? <EmptyState message="Chưa có phiếu tạm ứng" /> : (
                <table className="w-full min-w-[620px] border-collapse">
                  <thead className="bg-slate-100 dark:bg-slate-900"><tr><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Ngày</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Hạn hoàn chứng từ</th><th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">Số tiền</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Lý do</th></tr></thead>
                  <tbody>{data?.advances.map((record, index) => <tr key={record.id} className={cn(index % 2 ? "bg-slate-50/60" : "bg-white", "border-b border-slate-100")}><td className="px-4 py-3 text-xs text-slate-600">{formatDate(record.date)}</td><td className="px-4 py-3 text-xs text-slate-600">{formatDate(record.documentDueDate)}</td><td className="px-4 py-3 text-right text-xs font-bold text-violet-700">{formatMoney(record.amount)}</td><td className="max-w-[320px] truncate px-4 py-3 text-xs text-slate-600">{record.reason || "—"}</td></tr>)}</tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}