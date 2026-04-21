import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLocations } from "@/hooks/use-locations";

interface ActivityLog {
  id: string;
  student_id: string | null;
  student_name: string | null;
  student_code: string | null;
  user_id: string;
  user_name: string;
  action: "create" | "update" | "delete";
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  created_at: string;
  actor_location_ids?: string[];
  actor_location_names?: string[];
}

const FIELD_LABELS: Record<string, string> = {
  fullName: "Họ và tên",
  code: "Mã học viên",
  locations: "Cơ sở",
  phone: "Số điện thoại",
  email: "Email",
  dateOfBirth: "Ngày sinh",
  gender: "Giới tính",
  type: "Loại",
  pipelineStage: "Pipeline",
  relationshipList: "Mối quan hệ",
  sourceList: "Nguồn",
  status: "Trạng thái",
  accountStatus: "Trạng thái tài khoản",
  relationship: "Mối quan hệ",
  parentName: "Tên phụ huynh 1",
  parentPhone: "SĐT phụ huynh 1",
  parentName2: "Tên phụ huynh 2",
  parentPhone2: "SĐT phụ huynh 2",
  parentName3: "Tên phụ huynh 3",
  parentPhone3: "SĐT phụ huynh 3",
  parentIds: "Mã phụ huynh",
  address: "Địa chỉ",
  source: "Nguồn",
  rejectReason: "Lý do từ chối",
  socialLink: "Mạng xã hội",
  academicLevel: "Trình độ học vấn",
  salesByList: "Sale",
  managedByList: "Quản lý",
  teacherList: "Giáo viên",
  classNames: "Lớp học",
  note: "Ghi chú",
};

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const period = hours < 12 ? "SA" : "CH";
  const h12 = hours % 12 || 12;
  return `${day}/${month}/${year} ${String(h12).padStart(2, "0")}:${minutes} ${period}`;
}

function actionLabel(action: string) {
  if (action === "create") return { label: "Thêm mới", variant: "default" as const, color: "bg-green-100 text-green-700 border-green-200" };
  if (action === "update") return { label: "Sửa", variant: "secondary" as const, color: "bg-blue-100 text-blue-700 border-blue-200" };
  return { label: "Xoá", variant: "destructive" as const, color: "bg-red-100 text-red-700 border-red-200" };
}

function formatValue(val: any): string {
  if (val === null || val === undefined) return "—";
  if (Array.isArray(val)) return val.map(formatValue).join(", ") || "—";
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("vi-VN");
  }
  if (typeof val === "boolean") return val ? "Có" : "Không";
  return String(val);
}

function DataBlock({ data }: { data: Record<string, any> | null }) {
  if (!data || Object.keys(data).length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  if (Object.keys(data).length === 1 && data.__text !== undefined) {
    return <span className="text-xs text-foreground">{formatValue(data.__text)}</span>;
  }
  return (
    <div className="space-y-0.5">
      {Object.entries(data).map(([key, val]) => (
        <div key={key} className="text-xs">
          <span className="font-medium text-foreground/70">{FIELD_LABELS[key] ?? key}:</span>{" "}
          <span className="text-foreground">{formatValue(val)}</span>
        </div>
      ))}
    </div>
  );
}

function getChangedUpdateData(oldData: Record<string, any> | null, newData: Record<string, any> | null) {
  const changedOldData: Record<string, any> = {};
  const changedNewData: Record<string, any> = {};
  const keys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);

  keys.forEach((key) => {
    const oldValue = oldData?.[key] ?? null;
    const newValue = newData?.[key] ?? null;
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue) && formatValue(oldValue) !== formatValue(newValue)) {
      changedOldData[key] = oldValue;
      changedNewData[key] = newValue;
    }
  });

  return { changedOldData, changedNewData };
}

function getStudentLabelFromLogData(data: Record<string, any> | null): string {
  if (!data) return "Học viên";
  if (data.__text) return formatValue(data.__text);
  const fullName = data.fullName || data["Họ và tên"] || "Học viên";
  const code = data.code || data["Mã học viên"];
  const locations = Array.isArray(data.locations)
    ? data.locations
    : Array.isArray(data["Cơ sở"])
      ? data["Cơ sở"]
      : data.locations || data["Cơ sở"];
  const locationText = Array.isArray(locations)
    ? locations.filter(Boolean).join(", ")
    : locations;
  return `${fullName}${code ? ` (${code})` : ""}${locationText ? ` ${locationText}` : ""}`;
}

function getDeletedDisplayData(oldData: Record<string, any> | null, newData: Record<string, any> | null) {
  if (oldData?.__text && newData?.__text) {
    return { changedOldData: oldData, changedNewData: newData };
  }
  const studentLabel = getStudentLabelFromLogData(oldData);
  return {
    changedOldData: { __text: studentLabel },
    changedNewData: { __text: `Đã xoá ${studentLabel} ra khỏi hệ thống` },
  };
}

function getCreatedDisplayData(oldData: Record<string, any> | null, newData: Record<string, any> | null) {
  if (oldData?.__text && newData?.__text) {
    return { changedOldData: oldData, changedNewData: newData };
  }
  const sourceData = oldData || newData;
  const fullName = sourceData?.fullName || sourceData?.["Họ và tên"] || "Học viên";
  const code = sourceData?.code || sourceData?.["Mã học viên"];
  const typeText = sourceData?.type === "Phụ huynh" ? "phụ huynh" : "học viên";
  const locations = Array.isArray(sourceData?.locations)
    ? sourceData?.locations
    : Array.isArray(sourceData?.["Cơ sở"])
      ? sourceData?.["Cơ sở"]
      : sourceData?.locations || sourceData?.["Cơ sở"];
  const locationText = Array.isArray(locations)
    ? locations.filter(Boolean).join(", ")
    : locations;
  const text = `Thêm mới ${typeText}:${fullName}${code ? ` (${code})` : ""}${locationText ? ` vào ${locationText}` : ""}`;
  return {
    changedOldData: { __text: text },
    changedNewData: { __text: text },
  };
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CustomerActivityLogDialog({ open, onOpenChange }: Props) {
  const [locationId, setLocationId] = useState("__all__");
  const [action, setAction] = useState("__all__");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const { data: locations = [] } = useLocations();
  const { data, isLoading, refetch } = useQuery<{ logs: ActivityLog[]; total: number }>({
    queryKey: ["/api/customers/activity-logs", locationId, action, dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "200" });
      if (locationId !== "__all__") params.set("locationId", locationId);
      if (action !== "__all__") params.set("action", action);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      return fetch(`/api/customers/activity-logs?${params.toString()}`, { credentials: "include" }).then(r => r.json());
    },
    enabled: open,
  });

  useEffect(() => {
    if (open) refetch();
  }, [open, refetch]);

  const logs = data?.logs ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen max-h-screen flex flex-col gap-0 p-0 rounded-none">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="text-base font-semibold" data-testid="text-business-log-title">Nhật ký</DialogTitle>
        </DialogHeader>

        <div className="px-4 py-3 border-b bg-muted/20">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Cơ sở</label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger className="h-9 bg-white" data-testid="select-log-location">
                  <SelectValue placeholder="Tất cả cơ sở" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tất cả cơ sở</SelectItem>
                  {locations.map((loc: any) => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Hành động</label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger className="h-9 bg-white" data-testid="select-log-action">
                  <SelectValue placeholder="Tất cả hành động" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tất cả hành động</SelectItem>
                  <SelectItem value="create">Thêm mới</SelectItem>
                  <SelectItem value="update">Sửa</SelectItem>
                  <SelectItem value="delete">Xoá</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Từ ngày</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 bg-white" data-testid="input-log-date-from" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Đến ngày</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 bg-white" data-testid="input-log-date-to" />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                className="h-9 w-full"
                data-testid="button-reset-log-filters"
                onClick={() => {
                  setLocationId("__all__");
                  setAction("__all__");
                  setDateFrom("");
                  setDateTo("");
                }}
              >
                Xoá lọc
              </Button>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 overflow-auto">
          <div className="p-4">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-md" />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-12">Chưa có nhật ký nào</div>
            ) : (
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2 bg-muted/50 border border-border rounded-tl-md w-[140px]">Người dùng</th>
                    <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2 bg-muted/50 border-t border-b border-r border-border w-[155px]">Thời gian</th>
                    <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2 bg-muted/50 border-t border-b border-r border-border w-[100px]">Hành động</th>
                    <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2 bg-muted/50 border-t border-b border-r border-border">Nội dung cũ</th>
                    <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2 bg-muted/50 border-t border-b border-r border-border rounded-tr-md">Nội dung mới</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, idx) => {
                    const { label, color } = actionLabel(log.action);
                    const isLast = idx === logs.length - 1;
                    const { changedOldData, changedNewData } =
                      log.action === "update"
                        ? getChangedUpdateData(log.old_data, log.new_data)
                        : log.action === "delete"
                          ? getDeletedDisplayData(log.old_data, log.new_data)
                          : log.action === "create"
                            ? getCreatedDisplayData(log.old_data, log.new_data)
                        : { changedOldData: log.old_data, changedNewData: log.new_data };
                    return (
                      <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                        <td className={`px-3 py-2 border-l border-b border-r border-border align-top ${isLast ? "rounded-bl-md" : ""}`}>
                          <span className="font-medium text-xs" data-testid={`text-log-user-${log.id}`}>{log.user_name || "—"}</span>
                        </td>
                        <td className="px-3 py-2 border-b border-r border-border align-top">
                          <span className="text-xs whitespace-nowrap" data-testid={`text-log-time-${log.id}`}>{formatDateTime(log.created_at)}</span>
                        </td>
                        <td className="px-3 py-2 border-b border-r border-border align-top">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${color}`} data-testid={`status-log-action-${log.id}`}>
                            {label}
                          </span>
                        </td>
                        <td className="px-3 py-2 border-b border-r border-border align-top max-w-[240px]">
                          <DataBlock data={changedOldData} />
                        </td>
                        <td className={`px-3 py-2 border-b border-r border-border align-top max-w-[240px] ${isLast ? "rounded-br-md" : ""}`}>
                          {log.action === "update" || log.action === "delete" || log.action === "create" ? (
                            <DataBlock data={changedNewData} />
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </ScrollArea>

        <div className="px-6 py-3 border-t text-xs text-muted-foreground">
          Tổng: {data?.total ?? 0} nhật ký
        </div>
      </DialogContent>
    </Dialog>
  );
}
