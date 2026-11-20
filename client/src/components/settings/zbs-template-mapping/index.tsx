import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownToLine,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileCheck2,
  FileCode2,
  Info,
  LockKeyhole,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ZbsAuthorizedLocation = { id: string; name: string };

type ZaloOaConfig = {
  id: string;
  locationId: string;
  oaId: string;
  oaName: string;
  tokenExpiredAt: string | null;
  connectedAt: string | null;
  hasToken: boolean;
  isTokenExpired: boolean;
  isConnected: boolean;
  templateProvisioning?: {
    status: string;
    templateId?: string;
    message?: string;
  } | null;
};

type NotificationType = {
  id: string;
  code: string;
  name: string;
  variables: unknown;
};

type ZbsTemplate = {
  templateId: string;
  templateName: string;
  status: string | number;
  templateQuality?: string | number | null;
};

type TemplateList = { data: ZbsTemplate[]; total: number | null };

type ZbsMapping = {
  id: string;
  zaloOaConfigId: string;
  notificationType: string;
  templateId: string;
  templateName: string;
  templateStatus: string | number;
  compatibilityStatus: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type ZbsPayloadPreview = {
  invoice: {
    invoiceCode: string | null;
    installmentCode: string | null;
    category: string | null;
    installmentAmount: number;
    invoiceRemainingAmount: number;
  };
  templateData: Record<string, string | number>;
  sent: false;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await apiRequest("GET", url);
  return response.json() as Promise<T>;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định.";
}

function isForbidden(error: unknown): boolean {
  const message = errorText(error).toLowerCase();
  return message.includes("403") || message.includes("forbidden") || message.includes("không có quyền");
}

function ErrorPanel({
  error,
  onRetry,
  title = "Không thể tải dữ liệu",
}: {
  error: unknown;
  onRetry: () => void;
  title?: string;
}) {
  const forbidden = isForbidden(error);
  return (
    <Alert variant="destructive" className="border-rose-300 bg-rose-50 text-rose-950">
      {forbidden ? <LockKeyhole className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
      <AlertTitle>{forbidden ? "Không có quyền truy cập" : title}</AlertTitle>
      <AlertDescription className="mt-1 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{errorText(error)}</span>
        {!forbidden && (
          <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0 border-rose-300 bg-white text-rose-950 hover:bg-rose-100">
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Thử lại
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

function statusLabel(status: string | number) {
  const normalized = String(status).toLowerCase();
  if (normalized === "1" || normalized === "approved" || normalized === "active") return "Đang hoạt động";
  if (normalized === "2" || normalized === "pending") return "Đang chờ";
  if (normalized === "3" || normalized === "rejected" || normalized === "inactive") return "Không hoạt động";
  if (normalized === "4" || normalized === "deleted") return "Đã gỡ";
  return String(status || "Không rõ");
}

function provisioningStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING_CONFIGURATION: "Chờ cấu hình logo/ngân hàng",
    CREATING: "Đang tạo trên Zalo",
    PENDING_REVIEW: "Đang chờ Zalo duyệt",
    ENABLE: "Đã được duyệt",
    REJECT: "Bị Zalo từ chối",
    DISABLE: "Đã tắt trên Zalo",
    FAILED: "Tạo mẫu thất bại",
    UNKNOWN: "Cần kiểm tra trạng thái trên Zalo",
  };
  return labels[status] ?? status;
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(date);
}

export function ZbsTemplateMapping({ locations }: { locations: ZbsAuthorizedLocation[] }) {
  const queryClient = useQueryClient();
  const {
    data: permissions,
    isLoading: permissionsLoading,
    error: permissionsError,
  } = useMyPermissions();
  const [locationId, setLocationId] = useState("");
  const [oaConfigId, setOaConfigId] = useState("");
  const [notificationType, setNotificationType] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [installmentCode, setInstallmentCode] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
  const providerPermission = permissions?.permissions["/settings#providers"];
  const canRead = !!permissions
    && !permissions.isStudent
    && (
      permissions.isSuperAdmin
      || providerPermission?.canView === true
      || providerPermission?.canViewAll === true
      || providerPermission?.canEdit === true
    );
  const canWrite = !!permissions
    && !permissions.isStudent
    && (permissions.isSuperAdmin || providerPermission?.canCreate === true || providerPermission?.canEdit === true);
  const authorizedLocations = useMemo(() => {
    if (!canRead || !permissions) return [];
    if (permissions.isSuperAdmin) return locations;
    const allowedIds = new Set(permissions.locationIds);
    return locations.filter((location) => allowedIds.has(location.id));
  }, [canRead, locations, permissions]);

  const configsQuery = useQuery({
    queryKey: ["/api/zalo-oa/configs", locationId],
    queryFn: () => getJson<ZaloOaConfig[]>(`/api/zalo-oa/configs?locationId=${encodeURIComponent(locationId)}`),
    enabled: canRead && authorizedLocations.some((location) => location.id === locationId),
  });

  const selectedLocationIsAuthorized = canRead && authorizedLocations.some((location) => location.id === locationId);
  const selectedOa = selectedLocationIsAuthorized
    ? configsQuery.data?.find((config) => config.id === oaConfigId && config.locationId === locationId)
    : undefined;
  const activeOaConfigId = selectedOa?.id ?? "";
  const oaQueryBase = `/api/notification/zbs/oa/${encodeURIComponent(activeOaConfigId)}`;
  const [catalogQuery, templatesQuery, mappingsQuery] = useQueries({
    queries: [
      {
        queryKey: ["/api/notification/templates"],
        queryFn: () => getJson<NotificationType[]>("/api/notification/templates"),
        enabled: canRead,
      },
      {
        queryKey: ["/api/notification/zbs/oa", activeOaConfigId, "templates", 0, 100],
        queryFn: () => getJson<TemplateList>(`${oaQueryBase}/templates?offset=0&limit=100`),
        enabled: Boolean(activeOaConfigId),
      },
      {
        queryKey: ["/api/notification/zbs/oa", activeOaConfigId, "mappings"],
        queryFn: () => getJson<ZbsMapping[]>(`${oaQueryBase}/mappings`),
        enabled: Boolean(activeOaConfigId),
      },
    ],
  });

  const mappingMutation = useMutation({
    mutationFn: async ({ typeCode, chosenTemplateId }: { typeCode: string; chosenTemplateId: string }) => {
      const response = await apiRequest(
        "PUT",
        `${oaQueryBase}/mappings/${encodeURIComponent(typeCode)}`,
        { templateId: chosenTemplateId },
      );
      return response.json() as Promise<ZbsMapping>;
    },
    onSuccess: async () => {
      setSavedNotice("Đã lưu ánh xạ. Trạng thái vẫn chưa xác minh tương thích và chưa sẵn sàng gửi.");
      setNotificationType("");
      setTemplateId("");
      await queryClient.invalidateQueries({ queryKey: ["/api/notification/zbs/oa", activeOaConfigId, "mappings"] });
    },
  });

  const payloadPreviewMutation = useMutation({
    mutationFn: async (input: { installmentCode: string }) => {
      const response = await apiRequest(
        "POST",
        `${oaQueryBase}/payload-preview`,
        input,
      );
      return response.json() as Promise<ZbsPayloadPreview>;
    },
  });

  const mappingByType = useMemo(
    () => new Map((mappingsQuery.data ?? []).map((mapping) => [mapping.notificationType, mapping])),
    [mappingsQuery.data],
  );

  const availableTypes = catalogQuery.data ?? [];
  const availableTemplates = templatesQuery.data?.data ?? [];
  const saveDisabled =
    !canWrite ||
    !activeOaConfigId ||
    !notificationType ||
    !templateId ||
    mappingMutation.isPending ||
    !availableTypes.some((item) => item.code === notificationType) ||
    !availableTemplates.some((item) => item.templateId === templateId);

  const changeLocation = (nextLocationId: string) => {
    setLocationId(nextLocationId);
    setOaConfigId("");
    setNotificationType("");
    setTemplateId("");
    setInstallmentCode("");
    setSavedNotice("");
    payloadPreviewMutation.reset();
  };

  const changeOa = (nextOaConfigId: string) => {
    setOaConfigId(nextOaConfigId);
    setNotificationType("");
    setTemplateId("");
    setSavedNotice("");
    payloadPreviewMutation.reset();
  };

  return (
    <section className="zbs-mapping space-y-5" aria-label="ZBS template mapping">
      <header className="relative overflow-hidden rounded-xl border border-[#c9d8d2] bg-[#edf4f0] px-5 py-5 sm:px-6">
        <div className="absolute -right-10 -top-16 h-48 w-48 rounded-full border-[24px] border-[#dae8e1] opacity-70" aria-hidden="true" />
        <div className="relative flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#527268]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#b77738]" />
              Zalo Business Solution
            </div>
            <h2 className="font-[var(--font-display)] text-xl font-semibold tracking-tight text-[#203c34] sm:text-2xl">
              Ánh xạ mẫu thông báo
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-[#536c63]">
              Ghép loại thông báo nội bộ với mẫu đã có trên Official Account được cấp quyền. Bảng điều khiển này chỉ lưu ánh xạ — không bật hoặc gửi thông báo.
            </p>
          </div>
          <Badge className="w-fit gap-1.5 border border-[#c9894d]/40 bg-[#fff4e4] px-2.5 py-1 text-[#784a1e] hover:bg-[#fff4e4]">
            <ShieldAlert className="h-3.5 w-3.5" />
            Chưa sẵn sàng gửi
          </Badge>
        </div>
      </header>

      <Alert className="border-amber-300 bg-[#fff8e9] text-[#64431b] [&>svg]:text-[#a86c27]">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle className="font-semibold">Cảnh báo an toàn — ánh xạ chưa được xác minh</AlertTitle>
        <AlertDescription className="mt-1 leading-5 text-[#765a35]">
          Mọi ánh xạ được ghi nhận là <code className="rounded bg-[#f6e8ca] px-1 py-0.5 font-mono text-[11px]">compatibility_unverified</code> và{" "}
          <strong>isEnabled=false</strong>. Chưa xác nhận nội dung mẫu tương thích với dữ liệu nội bộ; việc lưu không bật cấu hình, không gửi tin và không gọi Zalo để gửi.
        </AlertDescription>
      </Alert>

      <Card className="border-[#d9e2dd] shadow-[0_2px_12px_rgba(30,58,47,0.035)]">
        <CardHeader className="border-b border-[#e8eeeb] px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#e5efe9] text-[#41675b]">
              <FileCode2 className="h-4 w-4" />
            </span>
            <div>
              <CardTitle className="text-sm text-[#263e36]">Phạm vi kết nối</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">Chọn cơ sở được cấp quyền, sau đó chọn chính xác một OA.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#536960]" htmlFor="zbs-location">Cơ sở</label>
            <Select value={locationId} onValueChange={changeLocation}>
              <SelectTrigger id="zbs-location" className="h-10 border-[#d2ddd7] bg-white">
                <SelectValue placeholder="Chọn cơ sở được cấp quyền" />
              </SelectTrigger>
              <SelectContent>
                {authorizedLocations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#536960]" htmlFor="zbs-oa">Official Account</label>
            <Select value={oaConfigId} onValueChange={changeOa} disabled={!locationId || configsQuery.isLoading || Boolean(configsQuery.error)}>
              <SelectTrigger id="zbs-oa" className="h-10 border-[#d2ddd7] bg-white">
                <SelectValue placeholder={!locationId ? "Trước hết chọn cơ sở" : "Chọn Official Account"} />
              </SelectTrigger>
              <SelectContent>
                {(configsQuery.data ?? []).map((config) => (
                  <SelectItem key={config.id} value={config.id}>
                    {config.oaName || "Zalo OA"} · {config.oaId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {permissionsLoading && (
            <div className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-dashed border-[#cbd8d1] bg-[#f8faf8] px-3 py-3 text-xs leading-5 text-[#677a72]">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#678476]" />
              Đang xác định quyền truy cập và cơ sở được phép.
            </div>
          )}
          {permissionsError && (
            <div className="sm:col-span-2">
              <ErrorPanel error={permissionsError} onRetry={() => window.location.reload()} title="Không thể kiểm tra quyền truy cập" />
            </div>
          )}
          {!permissionsLoading && !permissions && !permissionsError && (
            <div className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-xs leading-5 text-rose-900">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
              Tài khoản chưa được xác thực để truy cập cấu hình.
            </div>
          )}
          {permissions && !canRead && (
            <div className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-xs leading-5 text-rose-900">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
              Tài khoản không có quyền xem cấu hình nhà cung cấp.
            </div>
          )}
          {permissions && canRead && authorizedLocations.length === 0 && (
            <div className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-dashed border-[#cbd8d1] bg-[#f8faf8] px-3 py-3 text-xs leading-5 text-[#677a72]">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#678476]" />
              Tài khoản hiện không có cơ sở được cấp quyền truy cập.
            </div>
          )}
          {!locationId && authorizedLocations.length > 0 && (
            <div className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-dashed border-[#cbd8d1] bg-[#f8faf8] px-3 py-3 text-xs leading-5 text-[#677a72]">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#678476]" />
              Chưa chọn cơ sở. Danh sách kết nối chỉ được truy vấn sau khi chọn một cơ sở trong danh sách được cấp quyền.
            </div>
          )}
          {locationId && configsQuery.isLoading && (
            <div className="sm:col-span-2 space-y-2" aria-label="Đang tải cấu hình OA">
              <Skeleton className="h-12 w-full bg-[#edf2ef]" />
            </div>
          )}
          {locationId && configsQuery.error && (
            <div className="sm:col-span-2">
              <ErrorPanel error={configsQuery.error} onRetry={() => configsQuery.refetch()} title="Không thể tải cấu hình OA" />
            </div>
          )}
          {locationId && !configsQuery.isLoading && !configsQuery.error && configsQuery.data?.length === 0 && (
            <div className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-[#e5d8c8] bg-[#fbf7f1] px-3 py-3 text-xs leading-5 text-[#765c40]">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              Cơ sở này chưa có cấu hình Zalo OA. Hãy kết nối OA trong phần cấu hình nhà cung cấp trước khi ánh xạ.
            </div>
          )}
          {selectedOa && (
            <div className="sm:col-span-2 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#edf1ee] pt-3 text-xs text-[#65766f]">
              <span className="inline-flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${selectedOa.isConnected ? "bg-[#4c8a69]" : "bg-[#bd7544]"}`} />
                {selectedOa.isConnected ? "Đã kết nối" : "Chưa kết nối"}
              </span>
              <span>OA ID <code className="font-mono text-[#354d43]">{selectedOa.oaId}</code></span>
              <span>Ngày kết nối: {dateLabel(selectedOa.connectedAt)}</span>
              <span>Hết hạn token: {dateLabel(selectedOa.tokenExpiredAt)}</span>
              {selectedOa.templateProvisioning && (
                <span className="basis-full text-[#354d43]">
                  Mẫu Test ZBS: {provisioningStatusLabel(selectedOa.templateProvisioning.status)}
                  {selectedOa.templateProvisioning.templateId ? ` · ID ${selectedOa.templateProvisioning.templateId}` : ""}
                  {selectedOa.templateProvisioning.message ? ` · ${selectedOa.templateProvisioning.message}` : ""}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedOa && (
        <>
          {(!selectedOa.isConnected || !selectedOa.hasToken || selectedOa.isTokenExpired) && (
            <Alert className="border-rose-300 bg-rose-50 text-rose-950 [&>svg]:text-rose-700">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>OA hoặc token cần được xử lý</AlertTitle>
              <AlertDescription className="mt-1 leading-5 text-rose-900">
                {!selectedOa.isConnected && "Kết nối OA hiện không hoạt động. "}
                {!selectedOa.hasToken && "Cấu hình không có token truy cập. "}
                {selectedOa.isTokenExpired && "Token đã hết hạn. "}
                Hãy kiểm tra kết nối Zalo OA trước khi tiếp tục. Không tự động chuyển sang OA khác.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
            <Card className="min-w-0 border-[#d9e2dd] shadow-[0_2px_12px_rgba(30,58,47,0.035)]">
              <CardHeader className="border-b border-[#e8eeeb] px-4 py-3 sm:px-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#e5efe9] text-[#41675b]">
                      <ArrowDownToLine className="h-4 w-4" />
                    </span>
                    <div>
                      <CardTitle className="text-sm text-[#263e36]">Mẫu ZBS trên OA</CardTitle>
                      <p className="mt-0.5 text-xs text-muted-foreground">Danh sách mẫu hiện có · tối đa 100 mẫu</p>
                    </div>
                  </div>
                {templatesQuery.data && <Badge variant="outline" className="border-[#d7e2dc] bg-[#f8faf8] font-mono text-[11px] text-[#587166]">{templatesQuery.data.total ?? availableTemplates.length} mẫu</Badge>}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {templatesQuery.isLoading ? (
                  <div className="space-y-2 p-4" aria-label="Đang tải danh sách mẫu">
                    <Skeleton className="h-8 w-full bg-[#edf2ef]" />
                    <Skeleton className="h-10 w-full bg-[#f1f5f2]" />
                    <Skeleton className="h-10 w-full bg-[#f1f5f2]" />
                  </div>
                ) : templatesQuery.error ? (
                  <div className="p-4"><ErrorPanel error={templatesQuery.error} onRetry={() => templatesQuery.refetch()} title="Không thể tải mẫu OA" /></div>
                ) : availableTemplates.length === 0 ? (
                  <div className="flex flex-col items-center px-5 py-10 text-center">
                    <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#f0f4f1] text-[#758a7f]"><FileCheck2 className="h-5 w-5" /></span>
                    <p className="text-sm font-medium text-[#43594f]">OA chưa có mẫu ZBS</p>
                    <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">Không có mẫu để chọn. Kết nối hoặc đồng bộ mẫu OA trong quy trình quản trị riêng.</p>
                  </div>
                ) : (
                  <div className="max-h-[380px] overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-[#f7f9f7]">
                        <TableRow className="hover:bg-[#f7f9f7]">
                          <TableHead className="h-9 w-[110px] pl-4 text-[10px] uppercase tracking-wider">Template ID</TableHead>
                          <TableHead className="h-9 text-[10px] uppercase tracking-wider">Tên mẫu</TableHead>
                          <TableHead className="h-9 text-[10px] uppercase tracking-wider">Trạng thái</TableHead>
                          <TableHead className="h-9 pr-4 text-[10px] uppercase tracking-wider">Chất lượng</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {availableTemplates.map((template) => (
                          <TableRow key={template.templateId} className="border-[#edf1ee]">
                            <TableCell className="py-3 pl-4 font-mono text-[11px] text-[#536b60]">{template.templateId}</TableCell>
                            <TableCell className="max-w-[220px] py-3 text-xs font-medium text-[#31483d]">{template.templateName}</TableCell>
                            <TableCell className="py-3">
                              <Badge variant="outline" className="whitespace-nowrap border-[#d9e3dc] bg-[#f7faf7] text-[10px] font-medium text-[#557063]">
                                {statusLabel(template.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-3 pr-4 text-xs text-[#66786f]">{template.templateQuality ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-[#d9e2dd] shadow-[0_2px_12px_rgba(30,58,47,0.035)]">
              <CardHeader className="border-b border-[#e8eeeb] px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#f3eadc] text-[#8a6137]">
                    <ChevronRight className="h-4 w-4" />
                  </span>
                  <div>
                    <CardTitle className="text-sm text-[#263e36]">Tạo ánh xạ</CardTitle>
                    <p className="mt-0.5 text-xs text-muted-foreground">Chọn loại nội bộ và mẫu OA tương ứng.</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 px-4 py-4 sm:px-5">
                {catalogQuery.isLoading ? (
                  <div className="space-y-3"><Skeleton className="h-10 w-full bg-[#edf2ef]" /><Skeleton className="h-10 w-full bg-[#edf2ef]" /></div>
                ) : catalogQuery.error ? (
                  <ErrorPanel error={catalogQuery.error} onRetry={() => catalogQuery.refetch()} title="Không thể tải loại thông báo" />
                ) : availableTypes.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[#d4ded8] bg-[#f8faf8] p-4 text-xs leading-5 text-[#62736b]">Danh mục loại thông báo nội bộ hiện không có mục nào.</div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-[#536960]" htmlFor="zbs-notification-type">Loại thông báo nội bộ</label>
                      <Select value={notificationType} onValueChange={(value) => { setNotificationType(value); setSavedNotice(""); }}>
                        <SelectTrigger id="zbs-notification-type" className="h-10 border-[#d2ddd7] bg-white">
                          <SelectValue placeholder="Chọn loại thông báo" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableTypes.map((type) => (
                            <SelectItem key={type.code} value={type.code}>
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="truncate">{type.name}</span>
                                <code className="font-mono text-[10px] text-muted-foreground">{type.code}</code>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {notificationType && mappingByType.has(notificationType) && (
                      <div className="rounded-md border border-[#d8e2dc] bg-[#f5f8f5] px-3 py-2 text-[11px] leading-5 text-[#586d62]">
                        Đã có ánh xạ: <strong>{mappingByType.get(notificationType)?.templateName}</strong>. Lưu lựa chọn mới sẽ thay thế ánh xạ hiện tại; trạng thái vẫn chưa kích hoạt.
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-[#536960]" htmlFor="zbs-template">Mẫu ZBS của OA</label>
                      <Select value={templateId} onValueChange={(value) => { setTemplateId(value); setSavedNotice(""); }} disabled={templatesQuery.isLoading || templatesQuery.isError || availableTemplates.length === 0}>
                        <SelectTrigger id="zbs-template" className="h-10 border-[#d2ddd7] bg-white">
                          <SelectValue placeholder={templatesQuery.isError ? "Không tải được mẫu" : "Chọn mẫu"} />
                        </SelectTrigger>
                        <SelectContent>
                          {availableTemplates.map((template) => (
                            <SelectItem key={template.templateId} value={template.templateId}>
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="truncate">{template.templateName}</span>
                                <code className="font-mono text-[10px] text-muted-foreground">#{template.templateId}</code>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {!canWrite && (
                      <div className="rounded-md border border-[#ead9ba] bg-[#fff9ee] px-3 py-2.5 text-[11px] leading-5 text-[#745a37]">
                        Tài khoản chỉ có quyền xem cấu hình nhà cung cấp; không thể lưu mapping.
                      </div>
                    )}
                    <div className="rounded-md border border-[#ead9ba] bg-[#fff9ee] px-3 py-2.5 text-[11px] leading-5 text-[#745a37]">
                      Lưu chỉ ghi nhận cặp loại thông báo / template ID. Nội dung và biến của mẫu chưa được kiểm tra tương thích.
                    </div>
                    {mappingMutation.error && (
                      <ErrorPanel
                        error={mappingMutation.error}
                        onRetry={() => {
                          if (mappingMutation.variables) mappingMutation.mutate(mappingMutation.variables);
                        }}
                        title="Không thể lưu ánh xạ"
                      />
                    )}
                    {savedNotice && (
                      <div role="status" className="flex items-start gap-2 rounded-md border border-[#c8dfd0] bg-[#eff8f2] px-3 py-2.5 text-xs leading-5 text-[#38644b]">
                        <Check className="mt-0.5 h-4 w-4 shrink-0" />{savedNotice}
                      </div>
                    )}
                    <Button
                      type="button"
                      onClick={() => mappingMutation.mutate({ typeCode: notificationType, chosenTemplateId: templateId })}
                      disabled={saveDisabled}
                      className="w-full bg-[#315f4e] text-white hover:bg-[#264d3e] disabled:bg-[#dfe7e2] disabled:text-[#78877f]"
                    >
                      {mappingMutation.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck2 className="mr-2 h-4 w-4" />}
                      {mappingMutation.isPending ? "Đang lưu ánh xạ…" : "Lưu ánh xạ"}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-[#d9e2dd] shadow-[0_2px_12px_rgba(30,58,47,0.035)]">
            <CardHeader className="border-b border-[#e8eeeb] px-4 py-3 sm:px-5">
              <CardTitle className="text-sm text-[#263e36]">Xem trước payload — không gửi tin</CardTitle>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Nhập mã đợt thanh toán để kiểm tra các giá trị lấy từ hóa đơn. Tính năng này chỉ đọc dữ liệu và dựng JSON; không gọi API gửi Zalo.
              </p>
            </CardHeader>
            <CardContent className="space-y-4 px-4 py-4 sm:px-5">
              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  payloadPreviewMutation.mutate({ installmentCode: installmentCode.trim() });
                }}
              >
                <Input
                  value={installmentCode}
                  onChange={(event) => {
                    setInstallmentCode(event.target.value);
                    payloadPreviewMutation.reset();
                  }}
                  placeholder="Ví dụ: PT-106-2"
                  aria-label="Mã đợt thanh toán cần xem trước"
                  className="h-10 border-[#d2ddd7] bg-white sm:max-w-sm"
                  maxLength={100}
                />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={!installmentCode.trim() || payloadPreviewMutation.isPending}
                  className="h-10 border-[#bfd1c7] text-[#315f4e] hover:bg-[#eff5f1]"
                >
                  {payloadPreviewMutation.isPending ? "Đang dựng payload…" : "Xem payload"}
                </Button>
              </form>
              {payloadPreviewMutation.error && (
                <ErrorPanel
                  error={payloadPreviewMutation.error}
                  onRetry={() => payloadPreviewMutation.mutate({ installmentCode: installmentCode.trim() })}
                  title="Không thể dựng payload"
                />
              )}
              {payloadPreviewMutation.data && (
                <div className="space-y-3 rounded-lg border border-[#c8dfd0] bg-[#f4faf6] p-3">
                  <p className="text-xs leading-5 text-[#38644b]">
                    Hóa đơn {payloadPreviewMutation.data.invoice.invoiceCode ?? "—"} · đợt{" "}
                    {payloadPreviewMutation.data.invoice.installmentCode ?? "—"} ·{" "}
                    {payloadPreviewMutation.data.invoice.category ?? "—"}.
                    {" "}Số tiền đợt:{" "}
                    {new Intl.NumberFormat("vi-VN").format(payloadPreviewMutation.data.invoice.installmentAmount)}đ;
                    {" "}còn lại trên hóa đơn:{" "}
                    {new Intl.NumberFormat("vi-VN").format(payloadPreviewMutation.data.invoice.invoiceRemainingAmount)}đ.
                    {" "}Chưa gửi.
                  </p>
                  <pre className="max-h-72 overflow-auto rounded-md bg-[#203c34] p-3 text-xs leading-5 text-[#edf4f0]">
                    {JSON.stringify(payloadPreviewMutation.data.templateData, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-[#d9e2dd] shadow-[0_2px_12px_rgba(30,58,47,0.035)]">
            <CardHeader className="border-b border-[#e8eeeb] px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#e5efe9] text-[#41675b]"><Clock3 className="h-4 w-4" /></span>
                  <div>
                    <CardTitle className="text-sm text-[#263e36]">Ánh xạ hiện có</CardTitle>
                    <p className="mt-0.5 text-xs text-muted-foreground">Trạng thái an toàn được hiển thị cho từng hàng.</p>
                  </div>
                </div>
                {mappingsQuery.data && <Badge variant="outline" className="border-[#d7e2dc] bg-[#f8faf8] font-mono text-[11px] text-[#587166]">{mappingsQuery.data.length} ánh xạ</Badge>}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {mappingsQuery.isLoading ? (
                <div className="space-y-2 p-4" aria-label="Đang tải ánh xạ">
                  <Skeleton className="h-8 w-full bg-[#edf2ef]" />
                  <Skeleton className="h-10 w-full bg-[#f1f5f2]" />
                  <Skeleton className="h-10 w-full bg-[#f1f5f2]" />
                </div>
              ) : mappingsQuery.error ? (
                <div className="p-4"><ErrorPanel error={mappingsQuery.error} onRetry={() => mappingsQuery.refetch()} title="Không thể tải ánh xạ đã lưu" /></div>
              ) : !mappingsQuery.data?.length ? (
                <div className="flex flex-col items-center px-5 py-9 text-center">
                  <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#f0f4f1] text-[#758a7f]"><FileCheck2 className="h-5 w-5" /></span>
                  <p className="text-sm font-medium text-[#43594f]">Chưa có ánh xạ cho OA này</p>
                  <p className="mt-1 text-xs text-muted-foreground">Ánh xạ mới sẽ xuất hiện tại đây sau khi lưu thành công.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-[#f7f9f7]">
                      <TableRow className="hover:bg-[#f7f9f7]">
                        <TableHead className="h-9 pl-4 text-[10px] uppercase tracking-wider">Loại thông báo</TableHead>
                        <TableHead className="h-9 text-[10px] uppercase tracking-wider">Mẫu OA</TableHead>
                        <TableHead className="h-9 text-[10px] uppercase tracking-wider">Trạng thái tương thích</TableHead>
                        <TableHead className="h-9 pr-4 text-[10px] uppercase tracking-wider">Kích hoạt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mappingsQuery.data.map((mapping) => {
                        const type = availableTypes.find((item) => item.code === mapping.notificationType);
                        return (
                          <TableRow key={mapping.id} className="border-[#edf1ee] align-top">
                            <TableCell className="py-3 pl-4">
                              <div className="text-xs font-medium text-[#31483d]">{type?.name ?? mapping.notificationType}</div>
                              <code className="mt-1 block font-mono text-[10px] text-[#73847b]">{mapping.notificationType}</code>
                            </TableCell>
                            <TableCell className="py-3">
                              <div className="text-xs font-medium text-[#31483d]">{mapping.templateName || "Mẫu không còn tên"}</div>
                              <code className="mt-1 block font-mono text-[10px] text-[#73847b]">ID {mapping.templateId}</code>
                            </TableCell>
                            <TableCell className="py-3">
                              <Badge className="whitespace-nowrap border border-amber-300 bg-[#fff4df] text-[10px] font-mono text-[#805923] hover:bg-[#fff4df]">
                                {mapping.compatibilityStatus || "compatibility_unverified"}
                              </Badge>
                              <p className="mt-1.5 max-w-[200px] text-[10px] leading-4 text-[#806d53]">Chưa xác minh tương thích</p>
                            </TableCell>
                            <TableCell className="py-3 pr-4">
                              <Badge className="border border-[#d8e2dc] bg-[#eff4f0] font-mono text-[10px] text-[#52685d] hover:bg-[#eff4f0]">
                                {mapping.isEnabled ? "isEnabled=true" : "isEnabled=false"}
                              </Badge>
                              <p className="mt-1.5 whitespace-nowrap text-[10px] text-[#6e7d75]">Chưa kích hoạt</p>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
          <p className="flex items-start gap-2 px-1 text-[11px] leading-5 text-[#75847c]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Panel này không cung cấp thao tác bật, gửi hay xóa. Mỗi lần lưu ánh xạ vẫn ở trạng thái chưa xác minh tương thích và chưa kích hoạt.
          </p>
        </>
      )}
    </section>
  );
}

export default ZbsTemplateMapping;
