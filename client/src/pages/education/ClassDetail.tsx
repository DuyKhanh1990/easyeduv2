import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { XCircle, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { WaitingTabContent } from "@/components/education/WaitingTabContent";
import { ActiveTabContent } from "@/components/education/ActiveTabContent";
import { ScheduleTabContent } from "@/components/education/ScheduleTabContent";
import { AttendanceTabContent } from "@/components/education/AttendanceTabContent";
import { ScoreSheetTabContent } from "@/components/education/ScoreSheetTabContent";
import { useMyPermissions } from "@/hooks/use-my-permissions";

export type ClassPermissions = {
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export function ClassDetail() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState("waiting");
  const { data: myPerms } = useMyPermissions();
  const isSuperAdmin = myPerms?.isSuperAdmin ?? false;
  const perm = myPerms?.permissions?.["/classes"];
  const classPerm: ClassPermissions = {
    canAdd: isSuperAdmin || !!(perm?.canCreate || perm?.canEdit || perm?.canDelete),
    canEdit: isSuperAdmin || !!(perm?.canEdit || perm?.canDelete),
    canDelete: isSuperAdmin || !!perm?.canDelete,
  };

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const { data: classData, isLoading: isLoadingClass } = useQuery<any>({
    queryKey: [`/api/classes/${id}`],
  });

  const needsWaiting = activeTab === "waiting" || activeTab === "schedule";
  const needsActive = activeTab === "active" || activeTab === "schedule" || activeTab === "attendance";
  const needsSessions = activeTab === "waiting" || activeTab === "schedule" || activeTab === "attendance" || activeTab === "score-sheet";

  const { data: waitingStudents } = useQuery<any[]>({
    queryKey: [`/api/classes/${id}/waiting-students`],
    enabled: !!id && needsWaiting,
    staleTime: 0,
  });

  const { data: activeStudents } = useQuery<any[]>({
    queryKey: [`/api/classes/${id}/active-students`],
    enabled: !!id && needsActive,
    staleTime: 0,
  });

  const { data: classSessions } = useQuery<any[]>({
    queryKey: [`/api/classes/${id}/sessions`],
    enabled: !!id && needsSessions,
    staleTime: 0,
    select: (data) =>
      [...data].sort((a, b) => {
        const dateA = new Date(a.sessionDate).getTime();
        const dateB = new Date(b.sessionDate).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return a.id.localeCompare(b.id);
      }),
  });

  const { data: feePackages } = useQuery<any[]>({
    queryKey: [`/api/courses/${classData?.courseId}/fee-packages`],
    enabled: !!classData?.courseId && activeTab === "schedule",
    staleTime: 0,
  });

  const { data: allStudentSessions } = useQuery<any[]>({
    queryKey: [`/api/classes/${id}/all-student-sessions`],
    enabled: !!id && activeTab === "attendance",
    staleTime: 0,
    refetchOnMount: "always",
  });

  if (isLoadingClass) return <DashboardLayout><div>Đang tải...</div></DashboardLayout>;

  const getComputedStatus = (cls: any): { label: string; className: string } => {
    if (!cls?.startDate || !cls?.endDate)
      return { label: "Không xác định", className: "" };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(cls.startDate);
    const end = new Date(cls.endDate);
    if (today < start)
      return {
        label: "Đang tuyển sinh",
        className: "bg-yellow-100 text-yellow-700 border-yellow-200",
      };
    if (today > end)
      return {
        label: "Kết thúc",
        className: "bg-gray-100 text-gray-600 border-gray-200",
      };
    return {
      label: "Đang học",
      className: "bg-green-100 text-green-700 border-green-200",
    };
  };

  const capacity = classData?.maxStudents || 0;
  const waitingCount = classData?.waitingStudentsCount ?? 0;
  const activeCount = classData?.activeStudentsCount ?? 0;
  const totalCount = waitingCount + activeCount;
  const progress = capacity > 0 ? (totalCount / capacity) * 100 : 0;

  return (
    <DashboardLayout>
      <div className="flex flex-col xl:flex-row gap-6 p-0">
        {/* Sidebar - hidden on schedule and attendance tabs */}
        {activeTab !== "schedule" && activeTab !== "attendance" && (
          <div className={cn("shrink-0 transition-all duration-200", sidebarCollapsed ? "w-8" : "w-full xl:w-[300px]")}>
            {sidebarCollapsed ? (
              <div className="sticky top-6 flex flex-col items-center">
                <button
                  onClick={() => setSidebarCollapsed(false)}
                  className="flex items-center justify-center w-8 h-8 rounded-md border bg-background hover:bg-muted transition-colors"
                  title="Mở rộng sidebar"
                  data-testid="btn-expand-sidebar"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Card className="sticky top-6">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <h1 className="text-2xl font-bold" data-testid="text-class-name">
                        {classData?.name}
                      </h1>
                      <p className="text-sm text-muted-foreground" data-testid="text-class-code">
                        {classData?.classCode}
                      </p>
                      {(() => {
                        const s = getComputedStatus(classData);
                        return (
                          <Badge variant="outline" className={`mt-2 ${s.className}`}>
                            {s.label}
                          </Badge>
                        );
                      })()}
                    </div>
                    <button
                      onClick={() => setSidebarCollapsed(true)}
                      className="flex items-center justify-center w-7 h-7 rounded-md border bg-background hover:bg-muted transition-colors shrink-0 mt-1"
                      title="Thu gọn sidebar"
                      data-testid="btn-collapse-sidebar"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cơ sở:</span>
                      <span className="font-medium">{classData?.location?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Thời gian:</span>
                      <span className="font-medium">
                        {classData?.startDate || classData?.endDate ? (
                          <>
                            {classData?.startDate && format(new Date(classData.startDate), "dd/MM")}
                            {" - "}
                            {classData?.endDate && format(new Date(classData.endDate), "dd/MM")}
                          </>
                        ) : (
                          <span className="text-muted-foreground italic">Chưa có lịch</span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Giáo viên:</span>
                      <span className="font-medium">
                        {classData?.teachers?.length > 0
                          ? classData.teachers.map((t: any) => t.fullName).join(", ")
                          : "Chưa gán"}
                      </span>
                    </div>
                  </div>

                  <div className="pt-4 space-y-2 border-t">
                    <div className="flex justify-between text-sm">
                      <span>Sĩ số: {totalCount}/{capacity}</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground pt-1">
                      <span>Chờ: {waitingCount}</span>
                      <span>Chính thức: {activeCount}</span>
                    </div>
                  </div>

                  {classPerm.canEdit && (
                    <div className="pt-4 space-y-2 border-t">
                      <Button
                        className="w-full justify-start text-destructive"
                        variant="outline"
                        onClick={() => {}}
                      >
                        <XCircle className="mr-2 h-4 w-4" /> Đóng lớp
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 min-w-0 space-y-4">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                { value: "waiting", label: `Học viên chờ (${waitingCount})` },
                { value: "active", label: `Học viên chính thức (${activeCount})`, icon: Calendar },
                { value: "schedule", label: "Lịch học" },
                { value: "attendance", label: "Điểm danh" },
                { value: "score-sheet", label: "Bảng điểm" },
              ].map(t => (
                <button
                  key={t.value}
                  onClick={() => setActiveTab(t.value)}
                  className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-1.5", activeTab === t.value ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}
                >
                  {t.icon && <t.icon className="h-3.5 w-3.5" />}
                  {t.label}
                </button>
              ))}
            </div>

            <TabsContent value="waiting" className="mt-0 space-y-4">
              <WaitingTabContent
                classId={id!}
                classData={classData}
                waitingStudents={waitingStudents}
                classSessions={classSessions}
                classPerm={classPerm}
              />
            </TabsContent>

            <TabsContent value="active" className="mt-0">
              <ActiveTabContent classId={id!} activeStudents={activeStudents} />
            </TabsContent>

            <TabsContent value="schedule" className="mt-0 space-y-4">
              <ScheduleTabContent
                classId={id!}
                classData={classData}
                classSessions={classSessions}
                waitingStudents={waitingStudents}
                activeStudents={activeStudents}
                feePackages={feePackages}
                classPerm={classPerm}
              />
            </TabsContent>

            <TabsContent value="attendance" className="mt-0">
              <AttendanceTabContent
                classSessions={classSessions}
                studentSessions={allStudentSessions}
                classData={classData}
                enrolledStudents={activeStudents}
              />
            </TabsContent>

            <TabsContent value="score-sheet" className="mt-0">
              <ScoreSheetTabContent
                classId={id!}
                classSessions={classSessions}
                classData={classData}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
}
