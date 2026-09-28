import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CircleDot,
  Clock3,
  Eye,
  MapPin,
  Pencil,
  Plus,
  UserRound,
  Users,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  StaffScoreSheetAssessmentStudentsDialog,
  type StaffAssignedScoreSheetAssessment,
} from "@/components/education/StaffScoreSheetAssessmentStudentsDialog";
import { SCORE_CONVERSION_TYPES } from "./score-conversion/score-conversion-presets";

const TEMPLATE_ENDPOINT = "/api/score-conversion-templates";
const TEMPLATE_QUERY_KEY = [TEMPLATE_ENDPOINT];
const SCORE_SHEET_TEMPLATE_ENDPOINT = "/api/score-sheet-templates";
const SCORE_SHEET_TEMPLATE_QUERY_KEY = [SCORE_SHEET_TEMPLATE_ENDPOINT];
const ASSIGNED_SCORE_SHEET_ASSESSMENT_ENDPOINT = "/api/score-sheet-assessments/assigned";
const ASSIGNED_SCORE_SHEET_ASSESSMENT_QUERY_KEY = [ASSIGNED_SCORE_SHEET_ASSESSMENT_ENDPOINT];

type DeadlineStatus = {
  label: string;
  indicator: string;
  className: string;
}

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

function getDeadlineStatus(deadline: string | null, nowWallClockMs: number): DeadlineStatus {
  const match = deadline && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(deadline);
  if (!match) {
    return {
      label: "Chưa có hạn trả điểm",
      indicator: "⚪",
      className: "border-slate-200 bg-slate-50 text-slate-600",
    };
  }

  const [, year, month, day, hour, minute] = match;
  const deadlineWallClockMs = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  const remainingMs = deadlineWallClockMs - nowWallClockMs;
  if (remainingMs < 0) {
    return {
      label: "Quá hạn",
      indicator: "🔴",
      className: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",
    };
  }
  if (remainingMs <= 3 * 24 * 60 * 60 * 1000) {
    return {
      label: "Sắp đến hạn",
      indicator: "🟡",
      className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
    };
  }
  return {
    label: "Đúng hạn",
    indicator: "🟢",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
  };
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
  const [selectedAssessment, setSelectedAssessment] = useState<StaffAssignedScoreSheetAssessment | null>(null);
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
  const assignedScoreSheetAssessmentsQuery = useQuery<StaffAssignedScoreSheetAssessment[]>({
    queryKey: ASSIGNED_SCORE_SHEET_ASSESSMENT_QUERY_KEY,
    queryFn: async () => {
      const response = await apiRequest("GET", ASSIGNED_SCORE_SHEET_ASSESSMENT_ENDPOINT);
      return response.json();
    },
    refetchInterval: 60_000,
  });
  const conversionAssessments = (assignedScoreSheetAssessmentsQuery.data ?? [])
    .filter((assessment) => assessment.hasConversion);
  const assessmentsByDate = conversionAssessments.reduce<Record<string, StaffAssignedScoreSheetAssessment[]>>(
    (grouped, assessment) => {
      const dateKey = assessment.examDate.substring(0, 10);
      (grouped[dateKey] ??= []).push(assessment);
      return grouped;
    },
    {},
  );
  const sortedAssessmentDates = Object.keys(assessmentsByDate).sort((a, b) => b.localeCompare(a));
  const nowWallClockMs = getBangkokWallClockMs(new Date());
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
            <TabsTrigger value="scores">Danh sách Bảng điểm Quy đổi</TabsTrigger>
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
              <div className="space-y-0">
                {sortedAssessmentDates.map((dateKey, dateIndex) => {
                  const assessments = assessmentsByDate[dateKey] ?? [];
                  const isLastDate = dateIndex === sortedAssessmentDates.length - 1;
                  return (
                    <div key={dateKey} className="flex min-w-0 gap-2 sm:gap-4">
                      <div className="flex w-8 shrink-0 flex-col items-center pt-1 sm:w-12 md:w-16 xl:w-[130px]">
                        <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-violet-500 ring-4 ring-violet-100 dark:ring-violet-900/40" />
                        {!isLastDate && <div className="mt-2 min-h-[24px] w-px flex-1 bg-border" />}
                      </div>

                      <div className="min-w-0 flex-1 pb-6">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet-600 capitalize dark:text-violet-400">
                          {formatDateLabel(dateKey)}
                        </p>
                        <div className="space-y-2">
                          {assessments.map((assessment) => {
                            const deadlineStatus = getDeadlineStatus(
                              assessment.scoreDeadlineAt,
                              nowWallClockMs,
                            );
                            const scoreProgressLabel = assessment.studentCount > 0
                              && assessment.completedStudentCount >= assessment.studentCount
                              ? "Đã nhập đủ điểm"
                              : assessment.enteredStudentCount > 0
                                ? `${assessment.enteredStudentCount}/${assessment.studentCount} đã nhập`
                                : "Chưa nhập";
                            return (
                              <div
                                key={assessment.sessionId}
                                role="button"
                                tabIndex={0}
                                aria-haspopup="dialog"
                                aria-label={`Xem danh sách học viên: ${assessment.assessmentName ?? "Bảng điểm Quy đổi"} - ${assessment.classCode}`}
                                onClick={() => setSelectedAssessment(assessment)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    setSelectedAssessment(assessment);
                                  }
                                }}
                                className="grid min-w-0 cursor-pointer grid-cols-2 items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card px-3 py-3 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-3 sm:px-4 md:grid-cols-4 xl:grid-cols-[minmax(160px,1fr)_160px_60px_120px_minmax(180px,1fr)_56px] xl:items-center xl:gap-x-4 xl:gap-y-0"
                                data-testid={`row-score-conversion-assessment-${assessment.sessionId}`}
                              >
                                <div className="col-span-2 min-w-0 sm:col-span-2 md:col-span-2 xl:col-span-1">
                                  <p className="truncate text-sm font-semibold leading-tight text-foreground">
                                    {assessment.assessmentName ?? "Cấu hình bảng điểm không khả dụng"}
                                  </p>
                                  <div className="mt-0.5 flex items-center gap-1">
                                    <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                                      {assessment.classCode}
                                    </span>
                                    {assessment.className !== assessment.classCode && (
                                      <span className="truncate text-xs text-muted-foreground/70">
                                        — {assessment.className}
                                      </span>
                                    )}
                                    {assessment.sessionIndex != null && (
                                      <span className="whitespace-nowrap text-[11px] text-muted-foreground/60">
                                        · Buổi {assessment.sessionIndex}
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
                                    <p
                                      className="flex min-w-0 items-center gap-1"
                                      title={assessment.locationName ?? "Chưa xác định cơ sở"}
                                    >
                                      <MapPin className="h-3 w-3 shrink-0" />
                                      <span className="truncate">
                                        Cơ sở: {assessment.locationName ?? "Chưa xác định"}
                                      </span>
                                    </p>
                                    <p
                                      className="flex min-w-0 items-center gap-1"
                                      title={assessment.teacherNames ?? "Chưa phân công giáo viên"}
                                    >
                                      <UserRound className="h-3 w-3 shrink-0" />
                                      <span className="truncate">
                                        Giáo viên: {assessment.teacherNames ?? "Chưa phân công"}
                                      </span>
                                    </p>
                                  </div>
                                </div>

                                <div className="flex min-w-0 flex-col items-start gap-1">
                                  <Badge variant="outline" className="whitespace-nowrap text-[11px]">
                                    Bảng điểm Quy đổi
                                  </Badge>
                                  {assessment.assessmentCode && (
                                    <span className="max-w-full truncate text-[10px] text-muted-foreground">
                                      {assessment.assessmentCode}
                                    </span>
                                  )}
                                </div>

                                <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                                  <Users className="h-3.5 w-3.5 shrink-0" />
                                  <span>{assessment.studentCount} HV</span>
                                </div>

                                <div className="flex min-w-0 flex-col items-start gap-1">
                                  <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-muted-foreground">
                                    <CircleDot className="h-3.5 w-3.5 shrink-0" />
                                    {scoreProgressLabel}
                                  </span>
                                  <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1 text-[10px] font-medium ${deadlineStatus.className}`}>
                                    {deadlineStatus.indicator} {deadlineStatus.label}
                                  </span>
                                </div>

                                <div className="col-span-2 min-w-0 sm:col-span-2 md:col-span-2 xl:col-span-1">
                                  <p className="flex items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground">
                                    <CalendarDays className="h-3 w-3 shrink-0" />
                                    Ngày thi: {formatAssessmentDate(assessment.examDate)}
                                  </p>
                                  <p className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground/70">
                                    <Clock3 className="h-3 w-3 shrink-0" />
                                    Hạn trả: {formatAssessmentDeadline(assessment.scoreDeadlineAt)}
                                  </p>
                                </div>

                                <div className="col-span-2 flex justify-end border-t border-border/60 pt-2 sm:col-span-3 md:col-span-4 xl:col-span-1 xl:border-0 xl:pt-0">
                                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                                    <Eye className="h-3.5 w-3.5" />
                                    Xem
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
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
      <StaffScoreSheetAssessmentStudentsDialog
        assessment={selectedAssessment}
        open={!!selectedAssessment}
        onOpenChange={(open) => {
          if (!open) setSelectedAssessment(null);
        }}
      />
    </DashboardLayout>
  );
}