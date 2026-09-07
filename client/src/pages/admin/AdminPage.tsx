import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "wouter";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Cloud,
  Database,
  HardDrive,
  Info,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
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

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "dd/MM/yyyy HH:mm", { locale: vi });
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

  const backups = backupsQuery.data?.data ?? [];
  const stats = useMemo(() => ({
    running: backups.filter((backup) => backup.status === "running" || backup.status === "queued").length,
    completed: backups.filter((backup) => backup.status === "completed").length,
    failed: backups.filter((backup) => backup.status === "failed").length,
    latest: backups[0] ? formatDateTime(backups[0].snapshotAt) : "Chưa có",
  }), [backups]);

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
      <div className="mx-auto w-full max-w-7xl space-y-6">
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
              disabled={createBackupMutation.isPending || stats.running > 0}
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backups.map((backup) => (
                    <TableRow key={backup.id} className="align-top">
                      <TableCell className="pl-5 md:pl-6">
                        <p className="whitespace-nowrap font-semibold text-foreground">{formatDateTime(backup.snapshotAt)}</p>
                        <p className="mt-1 font-mono text-[10px] text-muted-foreground">{backup.id.slice(0, 8)}…</p>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}