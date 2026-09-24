import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "wouter";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Cloud,
  Database,
  HardDrive,
  Info,
  Link2,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { apiRequest } from "@/lib/queryClient";
import { formatStoredVietnamTimestamp } from "@/lib/vietnam-time";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type BackupStatus = "queued" | "running" | "completed" | "failed";

type DatabaseBackup = {
  id: string;
  backupType: string;
  snapshotAt: string;
  status: BackupStatus | string;
  progressPercent: number;
  progressMessage: string | null;
  storageKey: string | null;
  fileSizeBytes: string | number | null;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
};

type BackupsResponse = {
  data: DatabaseBackup[];
};

type DatabaseRestore = {
  id: string;
  sourceBackupId: string;
  safetyBackupId: string | null;
  status: "queued" | "running" | "completed" | "failed" | string;
  progressPercent: number;
  progressMessage: string | null;
  errorMessage: string | null;
  completedAt: string | null;
};

function formatDateTime(value: string | null | undefined): string {
  return formatStoredVietnamTimestamp(value, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function formatBytes(value: string | number | null): string {
  if (value === null || value === undefined || value === "") return "—";
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = bytes;
  let unitIndex = -1;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  return `${amount.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ${units[unitIndex]}`;
}

function statusMeta(status: string) {
  switch (status) {
    case "completed":
      return {
        label: "Hoàn tất",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
        icon: CheckCircle2,
      };
    case "failed":
      return {
        label: "Thất bại",
        className: "border-red-200 bg-red-50 text-red-700",
        icon: XCircle,
      };
    case "running":
      return {
        label: "Đang chạy",
        className: "border-blue-200 bg-blue-50 text-blue-700",
        icon: Loader2,
      };
    case "queued":
      return {
        label: "Đang chờ",
        className: "border-amber-200 bg-amber-50 text-amber-700",
        icon: Clock3,
      };
    default:
      return {
        label: status || "Không rõ",
        className: "border-slate-200 bg-slate-50 text-slate-700",
        icon: Clock3,
      };
  }
}

function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta(status);
  const Icon = meta.icon;
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-semibold", meta.className)}
    >
      <Icon className={cn("h-3.5 w-3.5", status === "running" && "animate-spin")} />
      {meta.label}
    </Badge>
  );
}

function backupTypeLabel(type: string): string {
  if (type === "scheduled") return "Tự động";
  if (type === "pre_restore") return "Dự phòng khôi phục";
  return "Thủ công";
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  detail: string;
  icon: typeof Database;
  tone: string;
}) {
  return (
    <Card className="border-white/70 bg-white/90 shadow-sm">
      <CardContent className="flex items-center gap-4 p-5">
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", tone)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{value}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminPage() {
  const { data: user, isLoading: userLoading } = useAuth();
  const { data: permissions, isLoading: permissionsLoading } = useMyPermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [restoreTarget, setRestoreTarget] = useState<DatabaseBackup | null>(null);
  const [activeRestoreId, setActiveRestoreId] = useState<string | null>(null);
  const [adminHubApiUrl, setAdminHubApiUrl] = useState("");
  const [adminHubSnapshotUrl, setAdminHubSnapshotUrl] = useState("");
  const [adminHubConnectionCode, setAdminHubConnectionCode] = useState("");
  const [adminHubConnectionStatus, setAdminHubConnectionStatus] = useState<"idle" | "connected" | "failed">("idle");
  const [adminHubClaimStatus, setAdminHubClaimStatus] = useState<"connected" | "already_connected" | null>(null);

  const adminHubConnectionQuery = useQuery<{
    connected: boolean;
    connection: {
      apiUrl: string;
      snapshotUrl: string;
      connectionId: string;
      centerCode: string | null;
      lastSyncAt: string | null;
      lastSyncStatus: "never" | "success" | "failed";
      lastSyncError: string | null;
    } | null;
  }>({
    queryKey: ["/api/admin-hub/connection"],
    enabled: isSuperAdmin,
    staleTime: 30_000,
  });

  const backupsQuery = useQuery<BackupsResponse>({
    queryKey: ["/api/admin/database-backups?limit=50"],
    enabled: isSuperAdmin,
    refetchInterval: 5000,
    staleTime: 0,
  });

  const createBackupMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/database-backups");
      return (await response.json()) as DatabaseBackup;
    },
    onSuccess: (backup) => {
      queryClient.setQueryData<BackupsResponse>(
        ["/api/admin/database-backups?limit=50"],
        (current) => ({
          data: [backup, ...(current?.data ?? []).filter((item) => item.id !== backup.id)],
        }),
      );
      toast({
        title: "Đã bắt đầu backup",
        description: "Bạn có thể theo dõi tiến độ trong lịch sử bên dưới.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Không thể bắt đầu backup",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (backupId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/admin/database-backups/${backupId}/restore`,
      );
      return (await response.json()) as DatabaseRestore;
    },
    onSuccess: (restore) => {
      setActiveRestoreId(restore.id);
      setRestoreTarget(null);
      toast({
        title: "Đã bắt đầu khôi phục",
        description:
          "Hệ thống đang tạo backup dự phòng trước khi khôi phục dữ liệu.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Không thể bắt đầu khôi phục",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const restoreQuery = useQuery<DatabaseRestore>({
    queryKey: [`/api/admin/database-restores/${activeRestoreId}`],
    enabled: Boolean(activeRestoreId),
    staleTime: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 3000;
    },
  });

  const adminHubConnectMutation = useMutation({
    mutationFn: async ({ apiUrl, code }: { apiUrl: string; code: string }) => {
      const response = await apiRequest("POST", "/api/admin-hub/connection/claim", {
        apiUrl: apiUrl.trim(),
        snapshotUrl: adminHubSnapshotUrl.trim(),
        code: code.trim(),
      });
      return response.json();
    },
    onSuccess: (data) => {
      setAdminHubConnectionStatus("connected");
      setAdminHubClaimStatus(data.adminHubStatus === "already_connected" ? "already_connected" : "connected");
      setAdminHubApiUrl(data.connection?.apiUrl ?? adminHubApiUrl);
      setAdminHubSnapshotUrl(data.connection?.snapshotUrl ?? adminHubSnapshotUrl);
      queryClient.invalidateQueries({ queryKey: ["/api/admin-hub/connection"] });
      toast({
        title:
          data.adminHubStatus === "already_connected"
            ? "Đã khôi phục kết nối Admin Hub"
            : "Kết nối Admin Hub thành công",
        description:
          data.adminHubStatus === "already_connected"
            ? "Mã này đã được kết nối trước đó. Kết nối cũ đã được dùng lại, không cần tạo mã mới."
            : "Đã lưu kết nối ở server. Bạn có thể đồng bộ số liệu tổng hợp ngay.",
      });
    },
    onError: (error: Error) => {
      setAdminHubConnectionStatus("failed");
      setAdminHubClaimStatus(null);
      toast({
        title: "Không thể kết nối Admin Hub",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const adminHubSyncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin-hub/connection/sync");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-hub/connection"] });
      toast({
        title: "Đồng bộ Admin Hub thành công",
        description: "Đã gửi số liệu tổng hợp, không bao gồm dữ liệu cá nhân.",
      });
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-hub/connection"] });
      toast({
        title: "Đồng bộ Admin Hub thất bại",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const savedAdminHubConnection = adminHubConnectionQuery.data?.connection;
  const isAdminHubConnected =
    adminHubConnectionStatus === "connected" ||
    adminHubConnectionQuery.data?.connected === true;
  const adminHubStatus = savedAdminHubConnection?.lastSyncStatus;

  useEffect(() => {
    if (!savedAdminHubConnection) return;
    setAdminHubApiUrl(savedAdminHubConnection.apiUrl);
    setAdminHubSnapshotUrl(savedAdminHubConnection.snapshotUrl);
  }, [savedAdminHubConnection]);

  const backups = backupsQuery.data?.data ?? [];
  const stats = useMemo(() => ({
    running: backups.filter((backup) => backup.status === "running" || backup.status === "queued").length,
    completed: backups.filter((backup) => backup.status === "completed").length,
    failed: backups.filter((backup) => backup.status === "failed").length,
    latest: backups[0] ? formatDateTime(backups[0].snapshotAt) : "Chưa có",
  }), [backups]);
  const activeRestore = restoreQuery.data;
  const restoreBusy =
    restoreMutation.isPending ||
    activeRestore?.status === "queued" ||
    activeRestore?.status === "running";

  const handleCreateBackup = () => {
    if (createBackupMutation.isPending) return;
    if (!window.confirm("Tạo một bản backup database mới ngay bây giờ?")) return;
    createBackupMutation.mutate();
  };

  if (userLoading || permissionsLoading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!user) return <Redirect to="/login" />;
  if (!isSuperAdmin) return <Redirect to="/" />;

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-7xl">
        <Tabs defaultValue="backup" className="space-y-6">
          <div className="flex flex-col gap-4 border-b border-border/60 pb-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Khu vực quản trị</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground md:text-3xl">Trang admin</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Quản lý các nghiệp vụ tổng hợp dành cho Super Admin.
              </p>
            </div>
            <TabsList className="h-10 w-fit">
              <TabsTrigger value="backup" className="gap-2">
                <HardDrive className="h-4 w-4" />
                Backup
              </TabsTrigger>
              <TabsTrigger value="admin-hub" className="gap-2">
                <Link2 className="h-4 w-4" />
                Kết nối Admin Hub
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="backup" className="mt-0 space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 px-6 py-7 text-white shadow-lg md:px-8 md:py-9">
          <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-blue-500/15 blur-3xl" />
          <div className="absolute -bottom-32 right-24 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 flex items-center gap-2 text-blue-200">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-[0.16em]">Khu vực Super Admin</span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Backup database</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 md:text-base">
                Tạo bản sao lưu nhất quán của database hiện tại và lưu file riêng tư trên S3.
                Backup chạy nền nên bạn vẫn có thể tiếp tục sử dụng hệ thống.
              </p>
            </div>
            <Button
              onClick={handleCreateBackup}
              disabled={createBackupMutation.isPending || stats.running > 0 || restoreBusy}
              className="h-11 shrink-0 gap-2 bg-white text-slate-950 hover:bg-blue-50"
            >
              {createBackupMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {stats.running > 0 ? "Backup đang chạy" : "Tạo backup mới"}
            </Button>
          </div>
        </section>

        <Alert className="border-blue-200 bg-blue-50/70 text-blue-950">
          <LockKeyhole className="h-4 w-4" />
          <AlertTitle>Backup được lưu riêng tư</AlertTitle>
          <AlertDescription className="text-blue-900/80">
            Database chỉ lưu metadata và trạng thái. File dump thật nằm ngoài database trên S3,
            không tạo public URL và không dùng chung với luồng upload tài liệu thông thường.
          </AlertDescription>
        </Alert>

        {activeRestore && (
          <Alert
            className={cn(
              activeRestore.status === "failed"
                ? "border-red-200 bg-red-50 text-red-950"
                : activeRestore.status === "completed"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                  : "border-amber-200 bg-amber-50 text-amber-950",
            )}
          >
            {activeRestore.status === "failed" ? (
              <XCircle className="h-4 w-4" />
            ) : activeRestore.status === "completed" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            <AlertTitle>
              {activeRestore.status === "failed"
                ? "Khôi phục thất bại"
                : activeRestore.status === "completed"
                  ? "Khôi phục hoàn tất"
                  : "Đang khôi phục database"}
            </AlertTitle>
            <AlertDescription>
              {activeRestore.errorMessage ||
                activeRestore.progressMessage ||
                "Đang xử lý..."}{" "}
              ({activeRestore.progressPercent ?? 0}%)
            </AlertDescription>
          </Alert>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Bản mới nhất"
            value={stats.latest}
            detail="Thời điểm snapshot"
            icon={Database}
            tone="bg-blue-100 text-blue-700"
          />
          <StatCard
            label="Đang xử lý"
            value={stats.running}
            detail={stats.running > 0 ? "Tự động cập nhật mỗi 5 giây" : "Không có job đang chạy"}
            icon={RefreshCw}
            tone="bg-amber-100 text-amber-700"
          />
          <StatCard
            label="Hoàn tất"
            value={stats.completed}
            detail="Trong 50 bản ghi gần nhất"
            icon={CheckCircle2}
            tone="bg-emerald-100 text-emerald-700"
          />
          <StatCard
            label="Thất bại"
            value={stats.failed}
            detail={stats.failed > 0 ? "Cần kiểm tra chi tiết lỗi" : "Chưa có lỗi được ghi nhận"}
            icon={AlertTriangle}
            tone="bg-red-100 text-red-700"
          />
        </section>

        <Card className="overflow-hidden border-white/80 shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/60 bg-white/70 px-5 py-5 md:px-6">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <HardDrive className="h-5 w-5 text-primary" />
                Lịch sử backup
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Theo dõi snapshot time, tiến độ lưu file và kết quả từng lần chạy.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Làm mới lịch sử backup"
              onClick={() => backupsQuery.refetch()}
              disabled={backupsQuery.isFetching}
              className="shrink-0"
            >
              <RefreshCw className={cn("h-4 w-4", backupsQuery.isFetching && "animate-spin")} />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {backupsQuery.isLoading ? (
              <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Đang tải lịch sử backup...
              </div>
            ) : backupsQuery.isError ? (
              <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 text-center">
                <XCircle className="h-8 w-8 text-red-500" />
                <div>
                  <p className="font-semibold text-foreground">Không tải được lịch sử backup</p>
                  <p className="mt-1 text-sm text-muted-foreground">Vui lòng thử làm mới lại trang.</p>
                </div>
              </div>
            ) : backups.length === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                  <Cloud className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Chưa có bản backup nào</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tạo bản backup đầu tiên để lưu dữ liệu database hiện tại lên S3.
                  </p>
                </div>
              </div>
            ) : (
              <Table containerClassName="min-w-full">
                <TableHeader className="bg-slate-50/80">
                  <TableRow>
                    <TableHead className="whitespace-nowrap pl-5 md:pl-6">Snapshot</TableHead>
                    <TableHead className="whitespace-nowrap">Trạng thái</TableHead>
                    <TableHead className="min-w-[220px]">Tiến độ</TableHead>
                    <TableHead className="whitespace-nowrap">Dung lượng</TableHead>
                    <TableHead className="whitespace-nowrap">Hoàn tất lúc</TableHead>
                    <TableHead className="whitespace-nowrap pr-5 md:pr-6">Chi tiết</TableHead>
                     <TableHead className="whitespace-nowrap pr-5 md:pr-6">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backups.map((backup) => (
                    <TableRow key={backup.id} className="align-top">
                      <TableCell className="pl-5 md:pl-6">
                        <p className="whitespace-nowrap font-semibold text-foreground">{formatDateTime(backup.snapshotAt)}</p>
                        <p className="mt-1 font-mono text-[10px] text-muted-foreground">{backup.id.slice(0, 8)}…</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{backupTypeLabel(backup.backupType)}</p>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={backup.status} />
                      </TableCell>
                      <TableCell>
                        <div className="min-w-[190px]">
                          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                            <span className="truncate text-muted-foreground">{backup.progressMessage || "Đang chờ xử lý"}</span>
                            <span className="shrink-0 font-semibold text-foreground">{backup.progressPercent ?? 0}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                backup.status === "failed" ? "bg-red-500" : backup.status === "completed" ? "bg-emerald-500" : "bg-blue-500",
                              )}
                              style={{ width: `${Math.min(Math.max(backup.progressPercent ?? 0, 0), 100)}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium">
                        {formatBytes(backup.fileSizeBytes)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDateTime(backup.completedAt)}
                      </TableCell>
                      <TableCell className="max-w-[280px] pr-5 text-xs text-muted-foreground md:pr-6">
                        {backup.status === "failed" ? (
                          <div className="flex gap-1.5 text-red-600">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span className="line-clamp-3 break-words" title={backup.errorMessage ?? undefined}>
                              {backup.errorMessage || "Backup thất bại, chưa có thông tin chi tiết."}
                            </span>
                          </div>
                        ) : backup.storageKey ? (
                          <div className="flex gap-1.5 text-emerald-700">
                            <Cloud className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span className="line-clamp-2 break-all" title={backup.storageKey}>
                              Đã lưu private trên S3
                            </span>
                          </div>
                        ) : (
                          <div className="flex gap-1.5">
                            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>Đang xử lý, chưa có file trên S3</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="pr-5 md:pr-6">
                        {backup.status === "completed" &&
                        backup.storageKey ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            disabled={restoreBusy || stats.running > 0}
                            onClick={() => setRestoreTarget(backup)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Khôi phục
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <AlertDialog
          open={Boolean(restoreTarget)}
          onOpenChange={(open) => {
            if (!open && !restoreMutation.isPending) setRestoreTarget(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-700">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <AlertDialogTitle>Khôi phục database từ backup này?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>
                    Database sẽ quay về trạng thái lúc{" "}
                    <strong>{formatDateTime(restoreTarget?.snapshotAt)}</strong>.
                    Dữ liệu phát sinh sau thời điểm này sẽ không còn trong database.
                  </p>
                  <p>
                    Trước khi khôi phục, hệ thống bắt buộc tạo một backup dự phòng
                    của dữ liệu hiện tại và giữ bản đó trong 3 ngày.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={restoreMutation.isPending}>
                Hủy
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={restoreMutation.isPending || !restoreTarget}
                onClick={(event) => {
                  event.preventDefault();
                  if (restoreTarget) restoreMutation.mutate(restoreTarget.id);
                }}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {restoreMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Tạo dự phòng và khôi phục
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
          </TabsContent>

          <TabsContent value="admin-hub" className="mt-0 space-y-6">
            <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-violet-950 px-6 py-7 text-white shadow-lg md:px-8 md:py-9">
              <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
              <div className="absolute -bottom-32 right-24 h-64 w-64 rounded-full bg-indigo-400/10 blur-3xl" />
              <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                <div className="max-w-2xl">
                  <div className="mb-3 flex items-center gap-2 text-indigo-200">
                    <Link2 className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-[0.16em]">Tích hợp hệ thống</span>
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Kết nối Admin Hub</h2>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 md:text-base">
                    Liên kết website của trung tâm với Admin Hub bằng mã kết nối được cấp riêng cho tenant này.
                  </p>
                </div>
                <Badge
                  className={cn(
                    "w-fit border-white/20 text-indigo-100 hover:bg-white/10",
                    isAdminHubConnected
                      ? "bg-emerald-500/20"
                      : adminHubConnectionStatus === "failed"
                        ? "bg-red-500/20"
                        : "bg-white/10",
                  )}
                >
                  {isAdminHubConnected
                    ? "Đã kết nối"
                    : adminHubConnectionStatus === "failed"
                      ? "Kết nối thất bại"
                      : "Chưa kết nối"}
                </Badge>
              </div>
            </section>

            <Card className="border-white/80 shadow-sm">
              <CardHeader className="border-b border-border/60 bg-white/70 px-5 py-5 md:px-6">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Link2 className="h-5 w-5 text-primary" />
                  Thông tin kết nối
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Nhập mã kết nối được tạo từ Admin Hub. Nếu mã đã kết nối trước đó nhưng còn hợp lệ,
                  hệ thống sẽ khôi phục lại kết nối cũ.
                </p>
              </CardHeader>
              <CardContent className="space-y-5 px-5 py-6 md:px-6">
                <div className="space-y-2">
                  <label htmlFor="admin-hub-api-url" className="text-sm font-medium text-foreground">
                    URL API Admin Hub để test
                  </label>
                  <Input
                    id="admin-hub-api-url"
                    type="url"
                    placeholder="https://your-admin-hub.replit.app/api/v1/connections/claim"
                    value={adminHubApiUrl}
                    onChange={(event) => {
                      setAdminHubApiUrl(event.target.value);
                      setAdminHubConnectionStatus("idle");
                      setAdminHubClaimStatus(null);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    EasyEdu gửi request qua server, nên endpoint không cần cho phép CORS từ trình duyệt.
                  </p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="admin-hub-snapshot-url" className="text-sm font-medium text-foreground">
                    URL API nhận dữ liệu tổng hợp
                  </label>
                  <Input
                    id="admin-hub-snapshot-url"
                    type="url"
                    placeholder="https://your-admin-hub.replit.app/api/v1/usage/snapshot"
                    value={adminHubSnapshotUrl}
                    onChange={(event) => {
                      setAdminHubSnapshotUrl(event.target.value);
                      setAdminHubConnectionStatus("idle");
                      setAdminHubClaimStatus(null);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Có thể để trống để hệ thống tự suy ra từ URL claim bằng đường dẫn <code>/api/v1/usage/snapshot</code>.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <div className="space-y-2">
                    <label htmlFor="admin-hub-connection-code" className="text-sm font-medium text-foreground">
                      Mã kết nối
                    </label>
                    <Input
                      id="admin-hub-connection-code"
                      placeholder="EASYEDU-ABC-7F92"
                      className="h-11 uppercase tracking-[0.12em]"
                      value={adminHubConnectionCode}
                      onChange={(event) => {
                        setAdminHubConnectionCode(event.target.value);
                        setAdminHubConnectionStatus("idle");
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      className="h-11 gap-2"
                      disabled={
                        adminHubConnectMutation.isPending ||
                        !adminHubApiUrl.trim() ||
                        !adminHubConnectionCode.trim()
                      }
                      onClick={() =>
                        adminHubConnectMutation.mutate({
                          apiUrl: adminHubApiUrl,
                          code: adminHubConnectionCode,
                        })
                      }
                    >
                      {adminHubConnectMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Link2 className="h-4 w-4" />
                      )}
                      {adminHubConnectMutation.isPending
                        ? "Đang kết nối..."
                        : adminHubClaimStatus === "already_connected"
                          ? "Đã khôi phục kết nối"
                          : "Kết nối với Admin Hub"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-11 gap-2"
                      disabled={!isAdminHubConnected || adminHubSyncMutation.isPending}
                      onClick={() => adminHubSyncMutation.mutate()}
                    >
                      {adminHubSyncMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      {adminHubSyncMutation.isPending ? "Đang đồng bộ..." : "Đồng bộ ngay"}
                    </Button>
                  </div>
                </div>
                {savedAdminHubConnection && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        Kết nối: <strong>{savedAdminHubConnection.centerCode || savedAdminHubConnection.connectionId}</strong>
                      </span>
                      <Badge variant="outline">
                        {adminHubStatus === "success"
                          ? "Đồng bộ thành công"
                          : adminHubStatus === "failed"
                            ? "Đồng bộ lỗi"
                            : "Chưa đồng bộ"}
                      </Badge>
                    </div>
                    {savedAdminHubConnection.lastSyncAt && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Lần gần nhất: {formatDateTime(savedAdminHubConnection.lastSyncAt)}
                      </p>
                    )}
                    {savedAdminHubConnection.lastSyncStatus === "failed" && savedAdminHubConnection.lastSyncError && (
                      <p className="mt-1 text-xs text-red-600">{savedAdminHubConnection.lastSyncError}</p>
                    )}
                  </div>
                )}
                <Alert className="border-indigo-200 bg-indigo-50/70 text-indigo-950">
                  <Info className="h-4 w-4" />
                  <AlertTitle>Chế độ test trên Replit</AlertTitle>
                  <AlertDescription className="text-indigo-900/80">
                    EasyEdu sẽ xác thực mã ở server, lưu kết nối riêng và chỉ gửi số liệu tổng hợp:
                    học viên, phụ huynh, nhân sự, lớp học và dung lượng. Không gửi tên, số điện thoại,
                    email, mã học viên hoặc danh sách chi tiết.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}