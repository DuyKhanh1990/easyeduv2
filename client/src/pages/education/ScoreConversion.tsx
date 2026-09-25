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
import type { ScoreConversionTemplate, ScoreConversionTemplateInput } from "@shared/score-conversion";
import { ScoreConversionTemplateDialog } from "./score-conversion/ScoreConversionTemplateDialog";

const TEMPLATE_ENDPOINT = "/api/score-conversion-templates";
const TEMPLATE_QUERY_KEY = [TEMPLATE_ENDPOINT];

export default function ScoreConversion() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: myPermissions } = useMyPermissions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ScoreConversionTemplate | null>(null);
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
        description: "Cấu hình bài kiểm tra đã sẵn sàng để dùng lại.",
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

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
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
          {canCreate && (
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Thêm mới
            </Button>
          )}
        </div>
        <Tabs defaultValue="international" className="space-y-4">
          <TabsList>
            <TabsTrigger value="international">Điểm Quy đổi Quốc tế</TabsTrigger>
          </TabsList>
          <TabsContent value="international">
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
                          <th className="px-4 py-3 font-medium">Tên bài kiểm tra</th>
                          <th className="px-4 py-3 font-medium">Loại</th>
                          <th className="px-4 py-3 font-medium">Phần thi</th>
                          <th className="px-4 py-3 font-medium">Quy tắc điểm tổng</th>
                          {canEdit && <th className="w-16 px-4 py-3" />}
                        </tr>
                      </thead>
                      <tbody>
                        {templatesQuery.data.map((template) => (
                          <tr key={template.id} className="border-b last:border-0">
                            <td className="px-4 py-3 font-medium">{template.name}</td>
                            <td className="px-4 py-3">{template.typeName}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1.5">
                                {template.sections.map((section) => (
                                  <span key={section.id} className="rounded-md bg-muted px-2 py-1 text-xs">
                                    {section.name}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="max-w-sm px-4 py-3">
                              <div className="font-medium">
                                {template.overallRule.method === "sum" ? "Cộng tổng" : "Trung bình"}
                                {" · "}{template.overallRule.minScore}–{template.overallRule.maxScore} {template.overallRule.unit}
                              </div>
                              {template.overallRule.description && (
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                  {template.overallRule.description}
                                </p>
                              )}
                            </td>
                            {canEdit && (
                              <td className="px-4 py-3">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Sửa ${template.name}`}
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
                      <p className="font-medium">Chưa có cấu hình bài kiểm tra</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Chọn một mẫu có sẵn hoặc tạo loại bài kiểm tra riêng.
                      </p>
                    </div>
                    {canCreate && (
                      <Button variant="outline" size="sm" onClick={openCreateDialog}>
                        <Plus className="mr-2 h-4 w-4" />
                        Thêm mới
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <ScoreConversionTemplateDialog
        open={dialogOpen}
        template={editingTemplate}
        saving={saveMutation.isPending}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
      />
    </DashboardLayout>
  );
}