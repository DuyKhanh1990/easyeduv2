import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Pencil, Plus } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type {
  ScoreConversionTemplate,
  ScoreConversionTemplateInput,
  ScoreConversionTypeKey,
} from "@shared/score-conversion";
import type {
  ScoreSheetTemplate,
  ScoreSheetTemplateInput,
} from "@shared/score-sheet-template";
import { ScoreConversionTemplateDialog } from "./score-conversion/ScoreConversionTemplateDialog";
import { ScoreSheetTemplateDialog } from "./score-conversion/ScoreSheetTemplateDialog";
import { SCORE_CONVERSION_TYPES } from "./score-conversion/score-conversion-presets";

const TEMPLATE_ENDPOINT = "/api/score-conversion-templates";
const TEMPLATE_QUERY_KEY = [TEMPLATE_ENDPOINT];
const SCORE_SHEET_TEMPLATE_ENDPOINT = "/api/score-sheet-templates";
const SCORE_SHEET_TEMPLATE_QUERY_KEY = [SCORE_SHEET_TEMPLATE_ENDPOINT];

export default function ScoreConversion() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: myPermissions } = useMyPermissions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ScoreConversionTemplate | null>(null);
  const [scoreSheetDialogOpen, setScoreSheetDialogOpen] = useState(false);
  const [editingScoreSheetTemplate, setEditingScoreSheetTemplate] = useState<ScoreSheetTemplate | null>(null);
  const assessmentPermissions = myPermissions?.permissions["/assessments#list"];
  const canCreate = Boolean(myPermissions?.isSuperAdmin || assessmentPermissions?.canCreate);
  const canEdit = Boolean(myPermissions?.isSuperAdmin || assessmentPermissions?.canEdit);

  const templatesQuery = useQuery<ScoreConversionTemplate[]>({
    queryKey: TEMPLATE_QUERY_KEY,
    queryFn: async () => {
      const response = await apiRequest("GET", TEMPLATE_ENDPOINT);
      return response.json();
    },
  });
  const scoreSheetTemplatesQuery = useQuery<ScoreSheetTemplate[]>({
    queryKey: SCORE_SHEET_TEMPLATE_QUERY_KEY,
    queryFn: async () => {
      const response = await apiRequest("GET", SCORE_SHEET_TEMPLATE_ENDPOINT);
      return response.json();
    },
  });
  const savedTemplates = templatesQuery.data ?? [];
  const initialTypeKey: ScoreConversionTypeKey =
    SCORE_CONVERSION_TYPES.find((type) =>
      type.value !== "custom" && !savedTemplates.some((template) => template.typeKey === type.value),
    )?.value ?? "custom";

  const saveMutation = useMutation({
    mutationFn: async ({ id, draft }: { id: string | null; draft: ScoreConversionTemplateInput }) => {
      const response = await apiRequest(
        id ? "PUT" : "POST",
        id ? `${TEMPLATE_ENDPOINT}/${id}` : TEMPLATE_ENDPOINT,
        draft,
      );
      return response.json() as Promise<ScoreConversionTemplate>;
    },
    onSuccess: async (_saved, variables) => {
      await queryClient.invalidateQueries({ queryKey: TEMPLATE_QUERY_KEY });
      setDialogOpen(false);
      toast({
        title: variables.id ? "Đã cập nhật cấu hình" : "Đã lưu cấu hình",
        description: "Bảng quy đổi đã sẵn sàng để áp dụng cho các bài kiểm tra.",
      });
    },
  });

  const saveScoreSheetTemplateMutation = useMutation({
    mutationFn: async ({ id, draft }: { id: string | null; draft: ScoreSheetTemplateInput }) => {
      const response = await apiRequest(
        id ? "PUT" : "POST",
        id ? `${SCORE_SHEET_TEMPLATE_ENDPOINT}/${id}` : SCORE_SHEET_TEMPLATE_ENDPOINT,
        draft,
      );
      return response.json() as Promise<ScoreSheetTemplate>;
    },
    onSuccess: async (_saved, variables) => {
      await queryClient.invalidateQueries({ queryKey: SCORE_SHEET_TEMPLATE_QUERY_KEY });
      setScoreSheetDialogOpen(false);
      toast({
        title: variables.id ? "Đã cập nhật bảng điểm mẫu" : "Đã lưu bảng điểm mẫu",
      });
    },
  });

  const openCreateDialog = () => {
    setEditingTemplate(null);
    setDialogOpen(true);
  };

  const openEditDialog = (template: ScoreConversionTemplate) => {
    setEditingTemplate(template);
    setDialogOpen(true);
  };

  const handleSave = async (draft: ScoreConversionTemplateInput) => {
    await saveMutation.mutateAsync({ id: editingTemplate?.id ?? null, draft });
  };

  const openCreateScoreSheetTemplateDialog = () => {
    setEditingScoreSheetTemplate(null);
    setScoreSheetDialogOpen(true);
  };

  const openEditScoreSheetTemplateDialog = (template: ScoreSheetTemplate) => {
    setEditingScoreSheetTemplate(template);
    setScoreSheetDialogOpen(true);
  };

  const handleSaveScoreSheetTemplate = async (draft: ScoreSheetTemplateInput) => {
    await saveScoreSheetTemplateMutation.mutateAsync({
      id: editingScoreSheetTemplate?.id ?? null,
      draft,
    });
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-100 p-2 dark:bg-emerald-900/30">
              <BarChart3 className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Bảng điểm quy đổi</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Lưu mẫu thang điểm quốc tế và cấu hình riêng của trung tâm.
              </p>
            </div>
          </div>
        </div>
        <Tabs defaultValue="international" className="space-y-4">
          <TabsList>
            <TabsTrigger value="international">Cấu hình điểm Quy đổi</TabsTrigger>
            <TabsTrigger value="sample">Bảng điểm mẫu</TabsTrigger>
            <TabsTrigger value="scores">Danh sách Bảng điểm</TabsTrigger>
          </TabsList>
          <TabsContent value="international" className="space-y-4">
            {canCreate && (
              <div className="flex justify-end">
                <Button onClick={openCreateDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Thêm mới
                </Button>
              </div>
            )}
            <Card>
              <CardContent className="p-0">
                {templatesQuery.isLoading ? (
                  <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
                    Đang tải cấu hình...
                  </div>
                ) : templatesQuery.isError ? (
                  <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
                    <p className="text-sm text-destructive">
                      {templatesQuery.error instanceof Error
                        ? templatesQuery.error.message
                        : "Không thể tải cấu hình bài kiểm tra."}
                    </p>
                    <Button variant="outline" size="sm" onClick={() => templatesQuery.refetch()}>
                      Thử lại
                    </Button>
                  </div>
                ) : templatesQuery.data?.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead className="border-b bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-medium">Loại bài kiểm tra</th>
                          <th className="px-4 py-3 font-medium">Phần thi</th>
                          <th className="px-4 py-3 font-medium">Khoảng quy đổi</th>
                          <th className="px-4 py-3 font-medium">Cách tính điểm tổng</th>
                          {canEdit && <th className="w-16 px-4 py-3" />}
                        </tr>
                      </thead>
                      <tbody>
                        {templatesQuery.data.map((template) => (
                          <tr key={template.id} className="border-b last:border-0">
                            <td className="px-4 py-3 font-medium">{template.typeName}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1.5">
                                {template.sections.map((section) => (
                                  <span key={section.id} className="rounded-md bg-muted px-2 py-1 text-xs">
                                    {section.name}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {template.sections.reduce((total, section) => total + section.mappings.length, 0)}
                            </td>
                            <td className="max-w-sm px-4 py-3">
                              <span className="font-medium">
                                {template.overallRule.method === "sum"
                                  ? "Cộng điểm các phần thi"
                                  : template.overallRule.method === "custom"
                                    ? "Tùy chỉnh công thức"
                                    : "Trung bình các phần thi"}
                              </span>
                            </td>
                            {canEdit && (
                              <td className="px-4 py-3">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Sửa bảng ${template.typeName}`}
                                  onClick={() => openEditDialog(template)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex min-h-52 flex-col items-center justify-center gap-3 p-6 text-center">
                    <div className="rounded-full bg-muted p-3">
                      <BarChart3 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">Chưa có bảng điểm quy đổi</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Tạo bảng quy đổi dùng chung theo loại bài kiểm tra.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="sample" className="space-y-4">
            {canCreate && (
              <div className="flex justify-end">
                <Button onClick={openCreateScoreSheetTemplateDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Thêm mới
                </Button>
              </div>
            )}
            <Card>
              <CardContent className="p-0">
                {scoreSheetTemplatesQuery.isLoading ? (
                  <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
                    Đang tải bảng điểm mẫu...
                  </div>
                ) : scoreSheetTemplatesQuery.isError ? (
                  <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
                    <p className="text-sm text-destructive">
                      {scoreSheetTemplatesQuery.error instanceof Error
                        ? scoreSheetTemplatesQuery.error.message
                        : "Không thể tải bảng điểm mẫu."}
                    </p>
                    <Button variant="outline" size="sm" onClick={() => scoreSheetTemplatesQuery.refetch()}>
                      Thử lại
                    </Button>
                  </div>
                ) : scoreSheetTemplatesQuery.data?.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-sm">
                      <thead className="border-b bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-medium">Mã</th>
                          <th className="px-4 py-3 font-medium">Tên bảng điểm</th>
                          <th className="px-4 py-3 font-medium">Bảng quy đổi</th>
                          <th className="px-4 py-3 font-medium">Kỹ năng</th>
                          {canEdit && <th className="w-16 px-4 py-3" />}
                        </tr>
                      </thead>
                      <tbody>
                        {scoreSheetTemplatesQuery.data.map((template) => {
                          const conversion = savedTemplates.find(
                            (item) => item.id === template.scoreConversionTemplateId,
                          );
                          return (
                            <tr key={template.id} className="border-b last:border-0">
                              <td className="px-4 py-3 font-medium">{template.code}</td>
                              <td className="px-4 py-3">{template.name}</td>
                              <td className="px-4 py-3">
                                {conversion?.typeName ?? (template.scoreConversionTemplateId ? "Không tìm thấy bảng quy đổi" : "Không áp dụng")}
                              </td>
                              <td className="px-4 py-3">{conversion?.sections.length ?? template.skills.length}</td>
                              {canEdit && (
                                <td className="px-4 py-3">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Sửa bảng điểm mẫu ${template.name}`}
                                    onClick={() => openEditScoreSheetTemplateDialog(template)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex min-h-52 flex-col items-center justify-center gap-3 p-6 text-center">
                    <div className="rounded-full bg-muted p-3">
                      <BarChart3 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">Chưa có bảng điểm mẫu</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Tạo bảng điểm mẫu và tùy chọn liên kết với bảng quy đổi quốc tế.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="scores">
            <Card>
              <CardContent className="flex min-h-52 flex-col items-center justify-center gap-2 p-6 text-center">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                <p className="font-medium">Danh sách Bảng điểm</p>
                <p className="text-sm text-muted-foreground">
                  Danh sách và nhập điểm thực tế sẽ được bổ sung ở giai đoạn tiếp theo.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <ScoreConversionTemplateDialog
        open={dialogOpen}
        template={editingTemplate}
        templates={savedTemplates}
        initialTypeKey={initialTypeKey}
        saving={saveMutation.isPending}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
      />
      <ScoreSheetTemplateDialog
        open={scoreSheetDialogOpen}
        template={editingScoreSheetTemplate}
        conversionTemplates={savedTemplates}
        conversionTemplatesLoading={templatesQuery.isLoading}
        saving={saveScoreSheetTemplateMutation.isPending}
        onOpenChange={setScoreSheetDialogOpen}
        onSave={handleSaveScoreSheetTemplate}
      />
    </DashboardLayout>
  );
}