import React, { useState } from "react";
import { StudentNameLink } from "@/components/ui/StudentNameLink";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Loader2, Bell, ChevronLeft, ChevronRight, FlaskConical } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type LogRow = {
  id: string;
  centerId: string | null;
  studentId: string | null;
  studentName: string | null;
  studentCode: string | null;
  type: string | null;
  channel: string | null;
  status: string | null;
  payload: unknown;
  errorMessage: string | null;
  reason: string | null;
  createdAt: string;
};

type LogsResponse = {
  rows: LogRow[];
  total: number;
  page: number;
  limit: number;
};

const TYPE_LABELS: Record<string, string> = {
  attendance_reminder: "Nhắc lịch học",
  class_changed: "Đổi lịch học",
  tuition_due: "Nhắc học phí",
  attendance_result: "Kết quả điểm danh",
  schedule_update_session: "Cập nhật buổi",
  schedule_cancel_session: "Huỷ buổi",
  schedule_update_cycle: "Cập nhật chu kỳ",
  schedule_exclude_dates: "Loại trừ ngày",
  invoice_created: "Tạo hoá đơn",
  invoice_paid: "Thanh toán HĐ",
  teacher_feedback: "Nhận xét GV",
  score_sheet: "Bảng điểm",
  session_content: "Giao nội dung",
  exam_score: "Điểm KT online",
  homework_score: "Điểm BTVN",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  SENT: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  SKIPPED: "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Đang chờ",
  SENT: "Đã gửi",
  FAILED: "Thất bại",
  SKIPPED: "Bỏ qua",
};

const REASON_LABELS: Record<string, string> = {
  missing_template: "Chưa cấu hình template",
  missing_phone: "Thiếu số điện thoại",
  zns_disabled: "Zalo OA chưa kết nối",
  zalo_api_error: "Lỗi Zalo API",
  student_not_followed: "Học viên chưa follow OA",
};

const CHANNEL_COLORS: Record<string, string> = {
  ZNS: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  OA: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  SMS: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  EMAIL: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
};

const ATTENDANCE_STATUS_COLORS: Record<string, string> = {
  "Có học":          "text-green-600 dark:text-green-400",
  "Vắng":            "text-red-600 dark:text-red-400",
  "Chờ học bù":      "text-amber-600 dark:text-amber-400",
  "Đã học bù":       "text-blue-600 dark:text-blue-400",
  "Huỷ":             "text-gray-500 dark:text-gray-400",
  "Chưa điểm danh":  "text-gray-400 dark:text-gray-500",
};

function getContentSummary(log: LogRow): string {
  const payload = log.payload as Record<string, unknown> | null;
  if (!payload) return "—";
  const type = log.type ?? "";

  if (type === "attendance_result") {
    const parts = [
      `Điểm danh: Học viên ${payload.studentName ?? ""}`,
      String(payload.attendanceStatus ?? ""),
      payload.className ? `Lớp ${payload.className}` : "",
      String(payload.sessionDate ?? ""),
      payload.teacherName ? `Giáo viên ${payload.teacherName}` : "",
    ].filter(Boolean);
    return parts.join(", ") || "—";
  }
  if (type === "attendance_reminder") {
    return `15 phút nữa, Bạn có lịch học bắt đầu lúc: ${payload.time ?? ""}${payload.className ? `, lớp ${payload.className}` : ""}${payload.sessionDate ? `, ${payload.sessionDate}` : ""}`;
  }
  if (type === "schedule_update_session") {
    const from = [payload.oldWeekday, payload.oldDate, payload.oldTime].filter(Boolean).join(" ");
    const to = [payload.newWeekday, payload.newDate, payload.newTime].filter(Boolean).join(" ");
    return `Lịch học Lớp ${payload.className}, ${from} được thay đổi bắt đầu vào ${to}`;
  }
  if (type === "schedule_cancel_session") {
    const session = [payload.weekday, payload.date, payload.time].filter(Boolean).join(" ");
    return `Lịch học Lớp ${payload.className}, ${session} Được Huỷ${payload.reason ? `, Lý do: ${payload.reason}` : ""}`;
  }
  if (type === "schedule_update_cycle") {
    const from = [payload.fromWeekday, payload.fromDate, payload.fromTime].filter(Boolean).join(" ");
    return `Lịch học Lớp ${payload.className}, Được thay đổi chu kỳ sang ${payload.newWeekdays} bắt đầu từ buổi ${from}${payload.reason ? ` Lý do: ${payload.reason}` : ""}`;
  }
  if (type === "schedule_exclude_dates") {
    const from = [payload.fromWeekday, payload.fromDate, payload.fromTime].filter(Boolean).join(" ");
    const to = [payload.toWeekday, payload.toDate, payload.toTime].filter(Boolean).join(" ");
    return `Lịch học Lớp ${payload.className}, Được thay đổi loại trừ ngày bắt đầu từ buổi ${from} - ${to}${payload.reason ? ` Lý do: ${payload.reason}` : ""}`;
  }

  if (type === "invoice_created") {
    const code = payload.invoiceCode ?? "—";
    const amount = payload.amount ?? "";
    const status = payload.status ? ` (${payload.status})` : "";
    const noteStr = payload.note ? ` Nội dung: ${payload.note}` : "";
    return `Hoá đơn ${code} vừa được tạo số tiền: ${amount}${status}${noteStr}`;
  }
  if (type === "invoice_paid") {
    const code = payload.invoiceCode ?? "—";
    const amount = payload.amount ?? "";
    const noteStr = payload.note ? ` Nội dung: ${payload.note}` : "";
    return `Hoá đơn ${code} vừa được Thanh toán số tiền: ${amount}.${noteStr}`;
  }
  if (type === "teacher_feedback") {
    return [
      `Nhận xét: Học viên ${payload.studentName ?? ""}`,
      payload.className ? `Lớp ${payload.className}` : "",
      payload.sessionDate ? String(payload.sessionDate) : "",
      payload.teacherName ? `Giáo viên: ${payload.teacherName}` : "",
    ].filter(Boolean).join(", ");
  }
  if (type === "score_sheet") {
    return [
      `Bảng điểm: ${payload.sheetName ?? ""}`,
      payload.className ? `Lớp ${payload.className}` : "",
      payload.studentName ? `Học viên: ${payload.studentName}` : "",
      payload.totalScore ? `Tổng điểm: ${payload.totalScore}` : "",
      payload.comment ? `Nhận xét: ${payload.comment}` : "",
    ].filter(Boolean).join(", ");
  }
  if (type === "class_changed") {
    return [
      `Đổi lịch học: Học viên ${payload.studentName ?? ""}`,
      payload.className ? `Lớp ${payload.className}` : "",
      payload.newTime ? `Giờ mới: ${payload.newTime}` : "",
    ].filter(Boolean).join(", ");
  }
  if (type === "tuition_due") {
    return [
      `Nhắc học phí: Học viên ${payload.studentName ?? ""}`,
      payload.amount ? `Số tiền: ${payload.amount}` : "",
      payload.deadline ? `Hạn thanh toán: ${payload.deadline}` : "",
    ].filter(Boolean).join(", ");
  }

  if (type === "session_content") {
    return [
      payload.className ? `Lớp ${payload.className}` : "",
      payload.sessionDate ? String(payload.sessionDate) : "",
      payload.teacherName ? `Giáo viên: ${payload.teacherName}` : "",
      payload.contentList ? String(payload.contentList) : "",
    ].filter(Boolean).join(", ");
  }
  if (type === "exam_score") {
    return [
      payload.examName ? `Bài KT: ${payload.examName}` : "",
      payload.totalScore ? `Điểm: ${payload.totalScore}` : "",
      payload.correctCount ? `Đúng: ${payload.correctCount}` : "",
      payload.wrongCount ? `Sai: ${payload.wrongCount}` : "",
      payload.comment ? `Nhận xét: ${payload.comment}` : "",
    ].filter(Boolean).join(", ");
  }
  if (type === "homework_score") {
    return [
      payload.homeworkName ? `BTVN: ${payload.homeworkName}` : "",
      payload.score ? `Điểm: ${payload.score}` : "",
      payload.className ? `Lớp ${payload.className}` : "",
      payload.sessionDate ? String(payload.sessionDate) : "",
      payload.comment ? `Nhận xét: ${payload.comment}` : "",
    ].filter(Boolean).join(", ");
  }

  const parts: string[] = [];
  if (payload.className) parts.push(`Lớp ${payload.className}`);
  if (payload.attendanceStatus) parts.push(String(payload.attendanceStatus));
  if (payload.sessionDate) parts.push(String(payload.sessionDate));
  if (payload.teacherName) parts.push(`GV: ${payload.teacherName}`);
  if (payload.time) parts.push(String(payload.time));
  return parts.join(" · ") || "—";
}

function renderContentNode(log: LogRow): React.ReactNode {
  const payload = log.payload as Record<string, unknown> | null;
  if (!payload) return "—";
  const type = log.type ?? "";

  if (type === "attendance_result") {
    const status = String(payload.attendanceStatus ?? "");
    const statusColor = ATTENDANCE_STATUS_COLORS[status] ?? "text-foreground";
    return (
      <span>
        {"Điểm danh: Học viên "}
        {String(payload.studentName ?? "")}
        {" - "}
        <span className={`font-semibold ${statusColor}`}>{status}</span>
        {payload.className ? `, Lớp ${payload.className}` : ""}
        {payload.sessionDate ? `, ${payload.sessionDate}` : ""}
        {payload.teacherName ? `, Giáo viên ${payload.teacherName}` : ""}
      </span>
    );
  }

  if (type === "attendance_reminder") {
    return (
      <span>
        <span className="font-semibold text-green-600 dark:text-green-400">15 phút nữa</span>
        {", Bạn có lịch học bắt đầu lúc: "}
        <span className="font-medium">{String(payload.time ?? "")}</span>
        {payload.className ? `, lớp ${payload.className}` : ""}
        {payload.sessionDate ? `, ${payload.sessionDate}` : ""}
      </span>
    );
  }

  if (type === "invoice_created") {
    const code = String(payload.invoiceCode ?? "—");
    const amount = String(payload.amount ?? "");
    const status = payload.status ? String(payload.status) : "";
    return (
      <span>
        {"Hoá đơn "}
        <span className="font-semibold">{code}</span>
        {" vừa được tạo số tiền: "}
        <span className="font-semibold text-blue-600 dark:text-blue-400">{amount}</span>
        {status ? <span className="text-muted-foreground"> ({status})</span> : null}
        {payload.note ? <span className="text-muted-foreground"> Nội dung: {String(payload.note)}</span> : null}
      </span>
    );
  }

  if (type === "invoice_paid") {
    const code = String(payload.invoiceCode ?? "—");
    const amount = String(payload.amount ?? "");
    return (
      <span>
        {"Hoá đơn "}
        <span className="font-semibold">{code}</span>
        {" vừa được "}
        <span className="font-semibold text-green-600 dark:text-green-400">Thanh toán</span>
        {" số tiền: "}
        <span className="font-semibold text-green-600 dark:text-green-400">{amount}</span>
        {"."}
        {payload.note ? <span className="text-muted-foreground"> Nội dung: {String(payload.note)}</span> : null}
      </span>
    );
  }

  if (type === "teacher_feedback") {
    return (
      <span>
        {"Nhận xét: Học viên "}
        <span className="font-semibold">{String(payload.studentName ?? "")}</span>
        {payload.className ? <>, Lớp <span className="font-medium">{String(payload.className)}</span></> : null}
        {payload.sessionDate ? <>, <span className="text-muted-foreground">{String(payload.sessionDate)}</span></> : null}
        {payload.teacherName ? <>, Giáo viên: <span className="font-medium">{String(payload.teacherName)}</span></> : null}
      </span>
    );
  }

  if (type === "score_sheet") {
    return (
      <span>
        {"Bảng điểm: "}
        <span className="font-semibold">{String(payload.sheetName ?? "")}</span>
        {payload.className ? <>, Lớp <span className="font-medium">{String(payload.className)}</span></> : null}
        {payload.studentName ? <>, Học viên: <span className="font-semibold">{String(payload.studentName)}</span></> : null}
        {payload.totalScore ? <>, Tổng điểm: <span className="font-semibold text-purple-600 dark:text-purple-400">{String(payload.totalScore)}</span></> : null}
        {payload.comment ? <>, Nhận xét: <span className="italic text-gray-600 dark:text-gray-400">{String(payload.comment)}</span></> : null}
      </span>
    );
  }

  if (type === "session_content") {
    return (
      <span>
        {"Giao nội dung: "}
        {payload.className ? <>Lớp <span className="font-medium">{String(payload.className)}</span></> : null}
        {payload.sessionDate ? <>, <span className="text-muted-foreground">{String(payload.sessionDate)}</span></> : null}
        {payload.teacherName ? <>, Giáo viên: <span className="font-medium">{String(payload.teacherName)}</span></> : null}
        {payload.contentList ? <><br /><span className="text-muted-foreground">bao gồm: {String(payload.contentList)}</span></> : null}
      </span>
    );
  }

  if (type === "exam_score") {
    return (
      <span>
        {"Điểm KT: "}
        <span className="font-semibold">{String(payload.examName ?? "")}</span>
        {payload.totalScore ? <>, Điểm: <span className="font-semibold text-purple-600 dark:text-purple-400">{String(payload.totalScore)}</span></> : null}
        {payload.correctCount ? <>, Đúng: <span className="text-green-600 dark:text-green-400 font-medium">{String(payload.correctCount)}</span></> : null}
        {payload.wrongCount ? <>, Sai: <span className="text-red-500 dark:text-red-400 font-medium">{String(payload.wrongCount)}</span></> : null}
        {payload.comment ? <>, Nhận xét: <span className="italic text-gray-600 dark:text-gray-400">{String(payload.comment)}</span></> : null}
      </span>
    );
  }

  if (type === "homework_score") {
    return (
      <span>
        {"Điểm BTVN: "}
        <span className="font-semibold">{String(payload.homeworkName ?? "")}</span>
        {payload.score ? <>, Điểm: <span className="font-semibold text-purple-600 dark:text-purple-400">{String(payload.score)}</span></> : null}
        {payload.className ? <>, Lớp <span className="font-medium">{String(payload.className)}</span></> : null}
        {payload.sessionDate ? <>, <span className="text-muted-foreground">{String(payload.sessionDate)}</span></> : null}
        {payload.teacherName ? <>, Giáo viên: <span className="font-medium">{String(payload.teacherName)}</span></> : null}
        {payload.comment ? <>, Nhận xét: <span className="italic text-gray-600 dark:text-gray-400">{String(payload.comment)}</span></> : null}
      </span>
    );
  }

  if (type === "class_changed") {
    return (
      <span>
        {"Đổi lịch: Học viên "}
        <span className="font-semibold">{String(payload.studentName ?? "")}</span>
        {payload.className ? <>, Lớp <span className="font-medium">{String(payload.className)}</span></> : null}
        {payload.newTime ? <>, Giờ mới: <span className="font-semibold text-blue-600 dark:text-blue-400">{String(payload.newTime)}</span></> : null}
      </span>
    );
  }

  if (type === "tuition_due") {
    return (
      <span>
        {"Nhắc học phí: Học viên "}
        <span className="font-semibold">{String(payload.studentName ?? "")}</span>
        {payload.amount ? <>, Số tiền: <span className="font-semibold text-orange-600 dark:text-orange-400">{String(payload.amount)}</span></> : null}
        {payload.deadline ? <>, Hạn: <span className="font-medium">{String(payload.deadline)}</span></> : null}
      </span>
    );
  }

  return <span>{getContentSummary(log)}</span>;
}

export function NotificationLogs() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedLog, setSelectedLog] = useState<LogRow | null>(null);

  const params = new URLSearchParams({ page: String(page), limit: "20" });
  if (filterType !== "all") params.set("type", filterType);
  if (filterStatus !== "all") params.set("status", filterStatus);

  const { data, isLoading, refetch } = useQuery<LogsResponse>({
    queryKey: ["/api/notifications/logs", page, filterType, filterStatus],
    queryFn: () => apiRequest("GET", `/api/notifications/logs?${params}`).then(r => r.json()),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/notifications/test", {
        centerId: "00000000-0000-0000-0000-000000000001",
        studentId: "00000000-0000-0000-0000-000000000002",
        type: "attendance_reminder",
        data: { className: "IELTS Demo", time: "18:00", studentName: "Test học viên" },
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Đã gửi test notification. Xem kết quả ở bảng bên dưới." });
      setTimeout(() => refetch(), 500);
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;
  const handleFilterChange = () => setPage(1);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">Lịch sử thông báo</h1>
          {data && (
            <span className="text-xs text-muted-foreground">({data.total} bản ghi)</span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending}
        >
          {testMutation.isPending
            ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            : <FlaskConical className="w-3.5 h-3.5 mr-1.5" />}
          Gửi test
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filterType} onValueChange={v => { setFilterType(v); handleFilterChange(); }}>
          <SelectTrigger className="w-48 h-8 text-xs">
            <SelectValue placeholder="Loại thông báo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả loại</SelectItem>
            <SelectItem value="attendance_result">Kết quả điểm danh</SelectItem>
            <SelectItem value="attendance_reminder">Nhắc lịch học</SelectItem>
            <SelectItem value="schedule_update_session">Cập nhật buổi</SelectItem>
            <SelectItem value="schedule_cancel_session">Huỷ buổi</SelectItem>
            <SelectItem value="schedule_update_cycle">Cập nhật chu kỳ</SelectItem>
            <SelectItem value="schedule_exclude_dates">Loại trừ ngày</SelectItem>
            <SelectItem value="class_changed">Đổi lịch học</SelectItem>
            <SelectItem value="tuition_due">Nhắc học phí</SelectItem>
            <SelectItem value="invoice_created">Tạo hoá đơn</SelectItem>
            <SelectItem value="invoice_paid">Thanh toán HĐ</SelectItem>
            <SelectItem value="teacher_feedback">Nhận xét GV</SelectItem>
            <SelectItem value="score_sheet">Bảng điểm</SelectItem>
            <SelectItem value="session_content">Giao nội dung</SelectItem>
            <SelectItem value="exam_score">Điểm KT online</SelectItem>
            <SelectItem value="homework_score">Điểm BTVN</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); handleFilterChange(); }}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            <SelectItem value="PENDING">Đang chờ</SelectItem>
            <SelectItem value="SENT">Đã gửi</SelectItem>
            <SelectItem value="FAILED">Thất bại</SelectItem>
            <SelectItem value="SKIPPED">Bỏ qua</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Đang tải...
            </div>
          ) : !data?.rows.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Bell className="w-8 h-8 opacity-30" />
              <p className="text-sm">Chưa có lịch sử thông báo</p>
              <p className="text-xs">Nhấn "Gửi test" để tạo bản ghi đầu tiên</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground whitespace-nowrap">Thời gian</th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground whitespace-nowrap">Học viên</th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground whitespace-nowrap">Nội dung</th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground whitespace-nowrap">Loại</th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground whitespace-nowrap">Kênh</th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground whitespace-nowrap">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(log => (
                    <tr
                      key={log.id}
                      className="border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                      onClick={() => setSelectedLog(log)}
                    >
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.createdAt), "dd/MM/yyyy HH:mm", { locale: vi })}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {log.studentName ? (
                          <span className="font-medium">
                            <StudentNameLink studentId={log.studentId} name={log.studentName} code={log.studentCode} />
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground font-mono">{log.studentId?.slice(0, 8)}…</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[260px]">
                        <div
                          className="line-clamp-2 leading-relaxed cursor-help"
                          title={getContentSummary(log)}
                        >
                          {renderContentNode(log)}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                        {TYPE_LABELS[log.type ?? ""] ?? log.type ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {log.channel ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${CHANNEL_COLORS[log.channel] ?? ""}`}>
                            {log.channel}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {log.status ? (
                          <div className="flex flex-col gap-0.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[log.status] ?? ""}`}>
                              {STATUS_LABELS[log.status] ?? log.status}
                            </span>
                            {log.reason && (
                              <span className="text-[10px] text-muted-foreground leading-tight">
                                {REASON_LABELS[log.reason] ?? log.reason}
                              </span>
                            )}
                          </div>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.total > data.limit && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-xs text-muted-foreground">
            Trang {data.page}/{totalPages} · {data.total} bản ghi
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      <Sheet open={!!selectedLog} onOpenChange={v => { if (!v) setSelectedLog(null); }}>
        <SheetContent side="right" className="w-[420px] sm:w-[520px] flex flex-col p-0">
          <SheetHeader className="px-6 pt-5 pb-4 border-b shrink-0">
            <SheetTitle className="text-base">Chi tiết thông báo</SheetTitle>
          </SheetHeader>

          {selectedLog && (
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Thời gian</p>
                  <p className="font-medium text-xs">
                    {format(new Date(selectedLog.createdAt), "dd/MM/yyyy HH:mm:ss", { locale: vi })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Học viên</p>
                  <p className="font-medium text-xs">
                    {selectedLog.studentName
                      ? `${selectedLog.studentName}${selectedLog.studentCode ? ` (${selectedLog.studentCode})` : ""}`
                      : selectedLog.studentId ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Loại</p>
                  <p className="font-medium text-xs">
                    {TYPE_LABELS[selectedLog.type ?? ""] ?? selectedLog.type ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Kênh</p>
                  {selectedLog.channel ? (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${CHANNEL_COLORS[selectedLog.channel] ?? ""}`}>
                      {selectedLog.channel}
                    </span>
                  ) : "—"}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Trạng thái</p>
                  {selectedLog.status ? (
                    <div className="flex flex-col gap-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium w-fit ${STATUS_COLORS[selectedLog.status] ?? ""}`}>
                        {STATUS_LABELS[selectedLog.status] ?? selectedLog.status}
                      </span>
                      {selectedLog.reason && (
                        <span className="text-xs text-muted-foreground">
                          {REASON_LABELS[selectedLog.reason] ?? selectedLog.reason}
                        </span>
                      )}
                    </div>
                  ) : "—"}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Log ID</p>
                  <p className="font-mono text-xs text-muted-foreground">{selectedLog.id.slice(0, 8)}…</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1 font-medium">Nội dung</p>
                <p className="text-xs text-foreground bg-muted/40 rounded-md px-3 py-2 border leading-relaxed">
                  {renderContentNode(selectedLog)}
                </p>
              </div>

              {(selectedLog.status === "FAILED" || selectedLog.status === "SKIPPED") && selectedLog.errorMessage && (
                <div>
                  <p className="text-xs font-medium mb-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                      selectedLog.status === "FAILED"
                        ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400"
                    }`}>
                      {selectedLog.status === "FAILED" ? "Lỗi gửi" : "Lý do bỏ qua"}
                    </span>
                  </p>
                  <pre className={`text-xs rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-words font-mono border ${
                    selectedLog.status === "FAILED"
                      ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
                      : "bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                  }`}>
                    {selectedLog.errorMessage}
                  </pre>
                </div>
              )}

              <div>
                <p className="text-xs text-muted-foreground mb-1.5 font-medium">Payload</p>
                <pre className="text-xs bg-muted/60 rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-words font-mono border">
                  {JSON.stringify(selectedLog.payload, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
