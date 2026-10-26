import { useQuery } from "@tanstack/react-query";
import { AlertCircle, FileCheck2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ApprovedZbsTemplateSource } from "./ApprovedZbsTemplateCard";

async function getApprovedSources(): Promise<ApprovedZbsTemplateSource[]> {
  const response = await apiRequest("GET", "/api/settings/zbs-template-library/approved-sources");
  return response.json() as Promise<ApprovedZbsTemplateSource[]>;
}

export function ZbsStandardTemplates() {
  const { data: permissions, isLoading: permissionsLoading } = useMyPermissions();
  const providerPermission = permissions?.permissions["/settings#providers"];
  const canRead = !!permissions && !permissions.isStudent && (
    permissions.isSuperAdmin
    || providerPermission?.canView === true
    || providerPermission?.canViewAll === true
    || providerPermission?.canCreate === true
    || providerPermission?.canEdit === true
  );

  const templatesQuery = useQuery({
    queryKey: ["/api/settings/zbs-template-library/approved-sources"],
    queryFn: getApprovedSources,
    enabled: canRead,
  });

  const templates = templatesQuery.data ?? [];
  return (
    <Card className="overflow-hidden border-[#d9e2dd] shadow-[0_2px_12px_rgba(30,58,47,0.035)]">
      <CardHeader className="border-b border-[#e8eeeb] px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm text-[#263e36]">Mẫu chuẩn ánh xạ Zalo OA</CardTitle>
            <CardDescription className="mt-1 text-xs leading-5">
              Các mẫu đã được duyệt trên OA nguồn và lưu làm mẫu chính thức của hệ thống.
            </CardDescription>
          </div>
          {!permissionsLoading && canRead && !templatesQuery.isLoading && !templatesQuery.error && (
            <Badge variant="outline" className="border-[#d7e2dc] bg-[#f8faf8] text-[#587166]">
              {templates.length} mẫu
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {permissionsLoading || (canRead && templatesQuery.isLoading) ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !canRead ? (
          <Alert variant="destructive" className="m-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Không có quyền truy cập</AlertTitle>
            <AlertDescription>Bạn không có quyền xem mẫu ZBS chuẩn.</AlertDescription>
          </Alert>
        ) : templatesQuery.error ? (
          <Alert variant="destructive" className="m-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Không thể tải mẫu chuẩn</AlertTitle>
            <AlertDescription>
              {templatesQuery.error instanceof Error
                ? templatesQuery.error.message
                : "Đã xảy ra lỗi khi tải danh sách mẫu."}
            </AlertDescription>
          </Alert>
        ) : templates.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-6 text-sm text-muted-foreground">
            <FileCheck2 className="h-4 w-4 shrink-0" />
            Chưa có mẫu ZBS chuẩn được duyệt và lưu vào hệ thống.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#f7f9f7]">
                  <TableHead>Tên mẫu</TableHead>
                  <TableHead>Mã mẫu Zalo</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>OA nguồn</TableHead>
                  <TableHead>Ngày lưu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((source: ApprovedZbsTemplateSource) => (
                  <TableRow key={source.template.brandTemplateId}>
                    <TableCell className="min-w-52 font-medium text-[#31483d]">
                      {source.template.name}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {source.template.brandTemplateId}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-[#d7ddc5] bg-[#f7f8ed] text-[#68713b]">
                        {source.capture.approvalLabelFromZbsUi}
                      </Badge>
                    </TableCell>
                    <TableCell className="min-w-48 text-xs">
                      {source.template.oaName}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {source.capture.capturedAt}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
