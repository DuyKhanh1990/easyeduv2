import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Circle,
  CircleDot,
  Clock3,
  Eye,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  resolveScoreSheetAssessmentStatus,
  type ScoreSheetAssessmentStatus,
} from "@shared/score-sheet-assessment-status";
import { ScoreConversionTemplateDialog } from "./score-conversion/ScoreConversionTemplateDialog";
import { ScoreSheetTemplateDialog } from "./score-conversion/ScoreSheetTemplateDialog";
import {
  StaffScoreSheetAssessmentStudentsDialog,
  type StaffAssignedScoreSheetAssessment,
} from "@/components/education/StaffScoreSheetAssessmentStudentsDialog";
import { SCORE_CONVERSION_TYPES } from "./score-conversion/score-conversion-presets";

const TEMPLATE_ENDPOINT = "/api/score-conversion-templates";
const TEMPLATE_QUERY_KEY = [TEMPLATE_ENDPOINT];
const SCORE_SHEET_TEMPLATE_ENDPOINT = "/api/score-sheet-templates";
const SCORE_SHEET_TEMPLATE_QUERY_KEY = [SCORE_SHEET_TEMPLATE_ENDPOINT];
const TEMPLATE_USAGE_ENDPOINT = "/api/score-template-usage";
const TEMPLATE_USAGE_QUERY_KEY = [TEMPLATE_USAGE_ENDPOINT];
const ASSIGNED_SCORE_SHEET_ASSESSMENT_ENDPOINT = "/api/score-sheet-assessments/assigned";
const ASSIGNED_SCORE_SHEET_ASSESSMENT_QUERY_KEY = [ASSIGNED_SCORE_SHEET_ASSESSMENT_ENDPOINT];

type ScoreTemplateUsage = {
  scoreSheetTemplateIdsInUse: string[];
  scoreConversionTemplateIdsInUse: string[];
};

type PendingTemplateDelete =
  | { kind: "conversion"; id: string; name: string }
  | { kind: "scoreSheet"; id: string; name: string };

type AssessmentStatusPresentation = {
  key: ScoreSheetAssessmentStatus;
  label: string;
  indicator: string;
  className: string;
}

type AssessmentStatusFilter = "all" | ScoreSheetAssessmentStatus;

const ASSESSMENT_STATUS_PRESENTATION: Record<
  ScoreSheetAssessmentStatus,
  AssessmentStatusPresentation
> = {
  not_started: {
    key: "not_started",
    label: "Chưa thi",
    indicator: "🟣",
    className: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300",
  },
  in_progress: {
    key: "in_progress",
    label: "Đang thi",
    indicator: "🟢",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
  },
  processing: {
    key: "processing",
    label: "Đang xử lý",
    indicator: "🟠",
    className: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-300",
  },
  completed: {
    key: "completed",
    label: "Hoàn thành",
    indicator: "✅",
    className: "border-green-800 bg-green-800 text-white dark:border-green-700 dark:bg-green-700 dark:text-white",
  },
};

function formatAssessmentDate(value: string | null | undefined): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
}

function formatAssessmentDeadline(value: string | null | undefined): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}` : "—";
}

function getBangkokWallClockMs(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value])) as Record<string, string>;
  return Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
  );
}

function getAssessmentStatus(
  assessment: StaffAssignedScoreSheetAssessment,
  nowWallClockMs: number,
): AssessmentStatusPresentation | null {
  const status = resolveScoreSheetAssessmentStatus(assessment, nowWallClockMs);
  return status ? ASSESSMENT_STATUS_PRESENTATION[status] : null;
}

function getCompletedStudentCount(
  assessment: Pick<StaffAssignedScoreSheetAssessment, "completedStudentCount" | "studentCount">,
): number {
  return Math.max(0, Math.min(assessment.completedStudentCount, assessment.studentCount));
}

function formatDateLabel(value: string): string {
  try {
    return format(new Date(value), "EEEE, dd/MM/yyyy", { locale: vi });
  } catch {
    return value;
  }
}

export default function ScoreConversion() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: myPermissions } = useMyPermissions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ScoreConversionTemplate | null>(null);
  const [scoreSheetDialogOpen, setScoreSheetDialogOpen] = useState(false);
  const [editingScoreSheetTemplate, setEditingScoreSheetTemplate] = useState<ScoreSheetTemplate | null>(null);
  const [pendingTemplateDelete, setPendingTemplateDelete] = useState<PendingTemplateDelete | null>(null);
  const [selectedAssessment, setSelectedAssessment] = useState<StaffAssignedScoreSheetAssessment | null>(null);
  const [assessmentStatusFilter, setAssessmentStatusFilter] = useState<AssessmentStatusFilter>("all");
  const [examDateFrom, setExamDateFrom] = useState("");
  const [examDateTo, setExamDateTo] = useState("");
  const assessmentPermissions = myPermissions?.permissions["/assessments#list"];
  const canCreate = Boolean(myPermissions?.isSuperAdmin || assessmentPermissions?.canCreate);
  const canEdit = Boolean(myPermissions?.isSuperAdmin || assessmentPermissions?.canEdit);
  const canDelete = Boolean(myPermissions?.isSuperAdmin || assessmentPermissions?.canDelete);

  const templatesQuery = useQuery<ScoreConversionTemplate[]>({
    queryKey: TEMPLATE_QUERY_KEY,
    queryFn: async () => {
      const response = await apiRequest("GET", TEMPLATE_ENDPOINT);
      return response.json();
    },
  });
  const templateUsageQuery = useQuery<ScoreTemplateUsage>({
    queryKey: TEMPLATE_USAGE_QUERY_KEY,
    queryFn: async () => {
      const response = await apiRequest("GET", TEMPLATE_USAGE_ENDPOINT);
      return response.json();
    },
    enabled: canDelete,
    refetchInterval: 30_000,
  });
  const scoreSheetTemplatesQuery = useQuery<ScoreSheetTemplate[]>({
    queryKey: SCORE_SHEET_TEMPLATE_QUERY_KEY,
    queryFn: async () => {
      const response = await apiRequest("GET", SCORE_SHEET_TEMPLATE_ENDPOINT);
      return response.json();
    },
  });
  const assignedScoreSheetAssessmentsQuery = useQuery<StaffAssignedScoreSheetAssessment[]>({
    queryKey: ASSIGNED_SCORE_SHEET_ASSESSMENT_QUERY_KEY,
    queryFn: async () => {
      const response = await apiRequest("GET", ASSIGNED_SCORE_SHEET_ASSESSMENT_ENDPOINT);
      return response.json();
    },
    refetchInterval: 60_000,
  });
  const nowWallClockMs = getBangkokWallClockMs(new Date());
  const conversionAssessments = (assignedScoreSheetAssessmentsQuery.data ?? [])
    .filter((assessment) => assessment.hasConversion);
  const filteredConversionAssessments = conversionAssessments.filter((assessment) => {
    const dateKey = assessment.examDate.substring(0, 10);
    const status = getAssessmentStatus(assessment, nowWallClockMs);
    if (assessmentStatusFilter !== "all" && status?.key !== assessmentStatusFilter) return false;
    if (examDateFrom && dateKey < examDateFrom) return false;
    if (examDateTo && dateKey > examDateTo) return false;
    return true;
  });
  const assessmentsByDate = filteredConversionAssessments.reduce<Record<string, StaffAssignedScoreSheetAssessment[]>>(
    (grouped, assessment) => {
      const dateKey = assessment.examDate.substring(0, 10);
      (grouped[dateKey] ??= []).push(assessment);
      return grouped;
    },
    {},
  );
  const sortedAssessmentDates = Object.keys(assessmentsByDate).sort((a, b) => b.localeCompare(a));
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: SCORE_SHEET_TEMPLATE_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["/api/score-sheet-assessments"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/score-sheet-assessments/assigned"] }),
      ]);
      setScoreSheetDialogOpen(false);
      toast({
        title: variables.id ? "Đã cập nhật bảng điểm mẫu" : "Đã lưu bảng điểm mẫu",
      });
    },
  });

  const deleteConversionTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `${TEMPLATE_ENDPOINT}/${id}`);
    },
    onSuccess: async () => {
      setPendingTemplateDelete(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: TEMPLATE_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: TEMPLATE_USAGE_QUERY_KEY }),
      ]);
      toast({ title: "Đã xóa cấu hình điểm quy đổi" });
    },
    onError: (error) => {
      toast({
        title: "Không thể xóa cấu hình điểm quy đổi",
        description: error instanceof Error ? error.message : "Vui lòng thử lại.",
        variant: "destructive",
      });
    },
  });

  const deleteScoreSheetTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `${SCORE_SHEET_TEMPLATE_ENDPOINT}/${id}`);
    },
    onSuccess: async () => {
      setPendingTemplateDelete(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: SCORE_SHEET_TEMPLATE_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: TEMPLATE_USAGE_QUERY_KEY }),
      ]);
      toast({ title: "Đã xóa bảng điểm mẫu" });
    },
    onError: (error) => {
      toast({
        title: "Không thể xóa bảng điểm mẫu",
        description: error instanceof Error ? error.message : "Vui lòng thử lại.",
        variant: "destructive",
      });
    },
  });

  const conversionTemplateIdsInUse = new Set(
    templateUsageQuery.data?.scoreConversionTemplateIdsInUse ?? [],
  );
  const scoreSheetTemplateIdsInUse = new Set(
    templateUsageQuery.data?.scoreSheetTemplateIdsInUse ?? [],
  );
  const templateUsageUnavailable =
    !templateUsageQuery.isSuccess || !templateUsageQuery.data;

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

  const confirmTemplateDelete = () => {
    if (!pendingTemplateDelete) return;
    if (pendingTemplateDelete.kind === "conversion") {
      deleteConversionTemplateMutation.mutate(pendingTemplateDelete.id);
    } else {
      deleteScoreSheetTemplateMutation.mutate(pendingTemplateDelete.id);
    }
  };

  const deletingTemplate =
    deleteConversionTemplateMutation.isPending || deleteScoreSheetTemplateMutation.isPending;

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
          <TabsList className="flex h-auto flex-wrap justify-start gap-2 rounded-none bg-transparent p-0">
            <TabsTrigger
              value="international"
              className="gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Cấu hình điểm Quy đổi
            </TabsTrigger>
            <TabsTrigger
              value="sample"
              className="gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Bảng điểm mẫu
            </TabsTrigger>
            <TabsTrigger
              value="scores"
              className="gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Danh sách Bảng điểm Quy đổi
            </TabsTrigger>
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
                          {(canEdit || canDelete) && <th className="w-24 px-4 py-3" />}
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
                            {(canEdit || canDelete) && (
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-1">
                                  {canEdit && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`Sửa bảng ${template.typeName}`}
                                      onClick={() => openEditDialog(template)}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {canDelete && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-destructive hover:text-destructive"
                                      aria-label={`Xóa bảng ${template.typeName}`}
                                      title={
                                        templateUsageQuery.isError
                                          ? "Không thể kiểm tra bảng này có đang được gán hay không."
                                          : templateUsageUnavailable
                                            ? "Đang kiểm tra trạng thái sử dụng."
                                            : conversionTemplateIdsInUse.has(template.id)
                                              ? "Đang được gán vào lịch học nên không thể xóa."
                                              : "Xóa cấu hình điểm quy đổi"
                                      }
                                      disabled={
                                        templateUsageUnavailable ||
                                        conversionTemplateIdsInUse.has(template.id) ||
                                        deleteConversionTemplateMutation.isPending
                                      }
                                      onClick={() => setPendingTemplateDelete({
                                        kind: "conversion",
                                        id: template.id,
                                        name: template.typeName,
                                      })}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
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
                          {(canEdit || canDelete) && <th className="w-24 px-4 py-3" />}
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
                              {(canEdit || canDelete) && (
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-1">
                                    {canEdit && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Sửa bảng điểm mẫu ${template.name}`}
                                        onClick={() => openEditScoreSheetTemplateDialog(template)}
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                    )}
                                    {canDelete && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-destructive hover:text-destructive"
                                        aria-label={`Xóa bảng điểm mẫu ${template.name}`}
                                        title={
                                          templateUsageQuery.isError
                                            ? "Không thể kiểm tra bảng này có đang được gán hay không."
                                            : templateUsageUnavailable
                                              ? "Đang kiểm tra trạng thái sử dụng."
                                              : scoreSheetTemplateIdsInUse.has(template.id)
                                                ? "Đang được gán vào lịch học nên không thể xóa."
                                                : "Xóa bảng điểm mẫu"
                                        }
                                        disabled={
                                          templateUsageUnavailable ||
                                          scoreSheetTemplateIdsInUse.has(template.id) ||
                                          deleteScoreSheetTemplateMutation.isPending
                                        }
                                        onClick={() => setPendingTemplateDelete({
                                          kind: "scoreSheet",
                                          id: template.id,
                                          name: template.name,
                                        })}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </div>
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
          <TabsContent value="scores" className="space-y-4">
            {assignedScoreSheetAssessmentsQuery.isLoading ? (
              <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
                Đang tải danh sách bảng điểm Quy đổi...
              </div>
            ) : assignedScoreSheetAssessmentsQuery.isError ? (
              <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border p-6 text-center">
                <p className="text-sm text-destructive">
                  {assignedScoreSheetAssessmentsQuery.error instanceof Error
                    ? assignedScoreSheetAssessmentsQuery.error.message
                    : "Không thể tải danh sách bảng điểm Quy đổi."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => assignedScoreSheetAssessmentsQuery.refetch()}
                >
                  Thử lại
                </Button>
              </div>
            ) : conversionAssessments.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
                <BookOpen className="h-10 w-10 opacity-25" />
                <p className="text-sm">Chưa có bảng điểm Quy đổi nào được gán vào buổi học</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border bg-background">
                <div
                  className="grid grid-cols-1 gap-3 border-b border-border px-3 py-3 sm:flex sm:flex-wrap sm:items-center sm:gap-4 sm:px-4"
                  data-testid="score-conversion-filter-bar"
                >
                  <div className="flex min-w-0 items-center gap-1 overflow-x-auto pb-0.5 sm:shrink-0">
                    {([
                      { value: "all", label: "Tất cả" },
                      { value: "not_started", label: "Chưa thi" },
                      { value: "in_progress", label: "Đang thi" },
                      { value: "processing", label: "Đang xử lý" },
                      { value: "completed", label: "Hoàn thành" },
                    ] as const).map((filter) => (
                      <button
                        key={filter.value}
                        type="button"
                        aria-pressed={assessmentStatusFilter === filter.value}
                        data-testid={`filter-score-conversion-${filter.value}`}
                        onClick={() => setAssessmentStatusFilter(filter.value)}
                        className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          assessmentStatusFilter === filter.value
                            ? "bg-foreground text-background"
                            : "text-muted-foreground hover:bg-secondary/60"
                        }`}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>

                  <div className="hidden flex-1 sm:block" />

                  <div className="grid min-w-0 grid-cols-2 gap-2 text-sm text-muted-foreground sm:flex sm:items-center">
                    <label className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                      <span>Từ</span>
                      <input
                        type="date"
                        aria-label="Lọc từ ngày thi"
                        value={examDateFrom}
                        onChange={(event) => setExamDateFrom(event.target.value)}
                        className="min-w-0 rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground sm:py-1"
                      />
                    </label>
                    <label className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                      <span>Đến</span>
                      <input
                        type="date"
                        aria-label="Lọc đến ngày thi"
                        value={examDateTo}
                        onChange={(event) => setExamDateTo(event.target.value)}
                        className="min-w-0 rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground sm:py-1"
                      />
                    </label>
                    {(examDateFrom || examDateTo) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="col-span-2 justify-self-end sm:col-span-1"
                        onClick={() => {
                          setExamDateFrom("");
                          setExamDateTo("");
                        }}
                      >
                        Xóa ngày
                      </Button>
                    )}
                  </div>
                </div>

                <div className="max-h-[min(70vh,680px)] overflow-auto">
                  <table
                    className="w-full min-w-[1315px] border-separate border-spacing-0 text-left text-xs"
                    data-testid="table-score-conversion-assessments"
                  >
                    <thead>
                      <tr className="bg-muted/70 text-muted-foreground">
                        <th className="sticky left-0 top-0 z-30 w-[260px] min-w-[260px] border-b border-r border-border bg-muted/95 px-3 py-2.5 font-semibold shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]">
                          Lớp
                        </th>
                        <th className="sticky top-0 z-20 w-[180px] min-w-[180px] border-b border-r border-border bg-muted/95 px-3 py-2.5 font-semibold">
                          Giáo viên
                        </th>
                        <th className="sticky top-0 z-20 w-[190px] min-w-[190px] border-b border-r border-border bg-muted/95 px-3 py-2.5 font-semibold">
                          Bảng điểm
                        </th>
                        <th className="sticky top-0 z-20 w-[200px] min-w-[200px] border-b border-r border-border bg-muted/95 px-3 py-2.5 font-semibold">
                          Số học viên / Đã nhập / Chưa nhập
                        </th>
                        <th className="sticky top-0 z-20 w-[120px] min-w-[120px] border-b border-r border-border bg-muted/95 px-3 py-2.5 font-semibold">
                          Ngày thi
                        </th>
                        <th className="sticky top-0 z-20 w-[145px] min-w-[145px] border-b border-r border-border bg-muted/95 px-3 py-2.5 font-semibold">
                          Hạn trả
                        </th>
                        <th className="sticky top-0 z-20 w-[140px] min-w-[140px] border-b border-r border-border bg-muted/95 px-3 py-2.5 font-semibold">
                          Trạng thái
                        </th>
                        <th className="sticky right-0 top-0 z-30 w-[80px] min-w-[80px] border-b border-border bg-muted/95 px-3 py-2.5 text-center font-semibold shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.12)]">
                          Xem
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAssessmentDates.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                            Không có bảng điểm phù hợp với bộ lọc.
                          </td>
                        </tr>
                      ) : (
                        sortedAssessmentDates.flatMap((dateKey) => {
                          const assessments = assessmentsByDate[dateKey] ?? [];
                          return [
                            <tr
                              key={`date-${dateKey}`}
                              className="border-b border-t border-violet-200/60 bg-violet-50/60 dark:border-violet-800/30 dark:bg-violet-900/10"
                              data-testid={`row-score-conversion-date-${dateKey}`}
                            >
                              <td colSpan={8} className="sticky left-0 z-20 bg-violet-50/60 py-2.5 dark:bg-violet-950/30">
                                <div className="flex items-center gap-3 px-4">
                                  <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-violet-500 ring-4 ring-violet-100 dark:ring-violet-900/40" />
                                  <span className="whitespace-nowrap text-xs font-semibold text-violet-700 dark:text-violet-400">
                                    {formatDateLabel(dateKey)}
                                  </span>
                                  <span className="inline-flex whitespace-nowrap rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                                    {assessments.length} bảng điểm
                                  </span>
                                </div>
                              </td>
                            </tr>,
                            ...assessments.map((assessment) => {
                              const status = getAssessmentStatus(assessment, nowWallClockMs);
                              const completedStudentCount = getCompletedStudentCount(assessment);
                              const notCompletedStudentCount = Math.max(
                                0,
                                assessment.studentCount - completedStudentCount,
                              );
                              const classLabel =
                                assessment.className !== assessment.classCode
                                  ? assessment.className
                                  : assessment.assessmentName ?? assessment.className;
                              return (
                                <tr
                                  key={assessment.sessionId}
                                  className="group"
                                  data-testid={`row-score-conversion-assessment-${assessment.sessionId}`}
                                >
                                  <td className="sticky left-0 z-10 min-w-[260px] border-b border-r border-border bg-card px-3 py-2.5 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)] group-hover:bg-accent/50">
                                    <p className="truncate font-semibold text-foreground" title={`${classLabel}${assessment.sessionIndex != null ? ` (Buổi ${assessment.sessionIndex})` : ""}`}>
                                      {classLabel}
                                      {assessment.sessionIndex != null && (
                                        <span className="ml-1 font-normal text-muted-foreground">
                                          (Buổi {assessment.sessionIndex})
                                        </span>
                                      )}
                                    </p>
                                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={assessment.classCode}>
                                      {assessment.classCode}
                                    </p>
                                    <p
                                      className="mt-1 flex min-w-0 items-center gap-1 truncate text-[11px] text-muted-foreground"
                                      title={assessment.locationName ?? "Chưa xác định cơ sở"}
                                    >
                                      <MapPin className="h-3 w-3 shrink-0" />
                                      <span className="truncate">
                                        {assessment.locationName ?? "Chưa xác định cơ sở"}
                                      </span>
                                    </p>
                                  </td>
                                  <td className="max-w-[180px] border-b border-r border-border px-3 py-2.5 group-hover:bg-accent/50">
                                    <span className="flex items-center gap-1.5">
                                      <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                      <span className="truncate" title={assessment.teacherNames ?? undefined}>
                                        {assessment.teacherNames ?? "Chưa phân công"}
                                      </span>
                                    </span>
                                  </td>
                                  <td className="max-w-[190px] border-b border-r border-border px-3 py-2.5 group-hover:bg-accent/50">
                                    <p className="truncate font-medium" title={assessment.assessmentName ?? undefined}>
                                      {assessment.assessmentName ?? "Cấu hình không khả dụng"}
                                    </p>
                                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={assessment.assessmentCode ?? undefined}>
                                      {assessment.assessmentCode ?? "—"}
                                    </p>
                                  </td>
                                  <td className="border-b border-r border-border px-3 py-2 group-hover:bg-accent/50">
                                    <div className="space-y-1 whitespace-nowrap">
                                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                        {assessment.studentCount} học viên
                                      </span>
                                      <span className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Đã nhập: {completedStudentCount}
                                      </span>
                                      <span className="flex items-center gap-1.5 text-muted-foreground">
                                        <Circle className="h-3.5 w-3.5" />
                                        Chưa nhập: {notCompletedStudentCount}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="whitespace-nowrap border-b border-r border-border px-3 py-2.5 group-hover:bg-accent/50">
                                    <span className="inline-flex items-center gap-1.5">
                                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                                      {formatAssessmentDate(assessment.examDate)}
                                    </span>
                                  </td>
                                  <td className="whitespace-nowrap border-b border-r border-border px-3 py-2.5 text-muted-foreground group-hover:bg-accent/50">
                                    <span className="inline-flex items-center gap-1.5">
                                      <Clock3 className="h-3.5 w-3.5" />
                                      {formatAssessmentDeadline(assessment.scoreDeadlineAt)}
                                    </span>
                                  </td>
                                  <td className="border-b border-r border-border px-3 py-2.5 group-hover:bg-accent/50">
                                    {status ? (
                                      <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium ${status.className}`}>
                                        {status.indicator} {status.label}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground" aria-label="Chưa có trạng thái">—</span>
                                    )}
                                  </td>
                                  <td className="sticky right-0 z-10 border-b border-border bg-card px-2 py-2 text-center shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.12)] group-hover:bg-accent/50">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-2 text-primary"
                                      aria-label={`Xem danh sách học viên: ${assessment.assessmentName ?? "Bảng điểm Quy đổi"} - ${assessment.classCode}`}
                                      onClick={() => setSelectedAssessment(assessment)}
                                    >
                                      <Eye className="mr-1 h-3.5 w-3.5" />
                                      Xem
                                    </Button>
                                  </td>
                                </tr>
                              );
                            }),
                          ];
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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
      <AlertDialog
        open={Boolean(pendingTemplateDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingTemplate) setPendingTemplateDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingTemplateDelete?.kind === "conversion"
                ? "Xóa cấu hình điểm quy đổi?"
                : "Xóa bảng điểm mẫu?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTemplateDelete && (
                <>
                  Bạn có chắc muốn xóa <strong>{pendingTemplateDelete.name}</strong>? Thao tác này không thể hoàn tác.
                  Bảng đã được gán vào buổi học sẽ không thể xóa.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingTemplate}>Hủy</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={confirmTemplateDelete}
              disabled={!pendingTemplateDelete || deletingTemplate}
            >
              {deletingTemplate ? "Đang xóa..." : "Xóa"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <StaffScoreSheetAssessmentStudentsDialog
        assessment={selectedAssessment}
        open={!!selectedAssessment}
        canManageScores={canEdit}
        canManagePublication
        onOpenChange={(open) => {
          if (!open) setSelectedAssessment(null);
        }}
      />
    </DashboardLayout>
  );
}