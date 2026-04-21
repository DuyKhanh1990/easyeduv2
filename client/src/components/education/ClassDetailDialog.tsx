import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { XCircle, X } from "lucide-react";
import { WaitingTabContent } from "@/components/education/WaitingTabContent";
import { ActiveTabContent } from "@/components/education/ActiveTabContent";
import { ScheduleTabContent } from "@/components/education/ScheduleTabContent";
import { AttendanceTabContent } from "@/components/education/AttendanceTabContent";
import { ScoreSheetTabContent } from "@/components/education/ScoreSheetTabContent";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import type { ClassPermissions } from "@/pages/education/ClassDetail";

interface ClassDetailDialogProps {
  classId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

function getComputedStatus(cls: any): { label: string; className: string } {
  if (!cls?.startDate || !cls?.endDate)
    return { label: "Không xác định", className: "" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(cls.startDate);
  const end = new Date(cls.endDate);
  if (today < start)
    return { label: "Đang tuyển sinh", className: "bg-yellow-100 text-yellow-700 border-yellow-200" };
  if (today > end)
    return { label: "Kết thúc", className: "bg-gray-100 text-gray-600 border-gray-200" };
  return { label: "Đang học", className: "bg-green-100 text-green-700 border-green-200" };
}

export function ClassDetailDialog({ classId, isOpen, onClose }: ClassDetailDialogProps) {
  const [activeTab, setActiveTab] = useState("waiting");
  const { data: myPerms } = useMyPermissions();

  useEffect(() => {
    if (isOpen) setActiveTab("waiting");
  }, [isOpen, classId]);

  const isSuperAdmin = myPerms?.isSuperAdmin ?? false;
  const perm = myPerms?.permissions?.["/classes"];
  const classPerm: ClassPermissions = {
    canAdd: isSuperAdmin || !!(perm?.canCreate || perm?.canEdit || perm?.canDelete),
    canEdit: isSuperAdmin || !!(perm?.canEdit || perm?.canDelete),
    canDelete: isSuperAdmin || !!perm?.canDelete,
  };

  const id = classId ?? "";

  const { data: classData, isLoading: isLoadingClass } = useQuery<any>({
    queryKey: [`/api/classes/${id}`],
    enabled: !!id && isOpen,
  });

  const needsWaiting = activeTab === "waiting" || activeTab === "schedule";
  const needsActive = activeTab === "active" || activeTab === "schedule";
  const needsSessions = activeTab === "schedule" || activeTab === "attendance" || activeTab === "score-sheet";

  const { data: waitingStudents } = useQuery<any[]>({
    queryKey: [`/api/classes/${id}/waiting-students`],
    enabled: !!id && isOpen && needsWaiting,
    staleTime: 0,
  });

  const { data: activeStudents } = useQuery<any[]>({
    queryKey: [`/api/classes/${id}/active-students`],
    enabled: !!id && isOpen && needsActive,
    staleTime: 0,
  });

  const { data: classSessions } = useQuery<any[]>({
    queryKey: [`/api/classes/${id}/sessions`],
    enabled: !!id && isOpen && needsSessions,
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
    enabled: !!classData?.courseId && isOpen && activeTab === "schedule",
    staleTime: 0,
  });

  const { data: allStudentSessions } = useQuery<any[]>({
    queryKey: [`/api/classes/${id}/all-student-sessions`],
    enabled: !!id && isOpen && activeTab === "attendance",
    staleTime: 0,
    refetchOnMount: "always",
  });

  const capacity = classData?.maxStudents || 0;
  const waitingCount = classData?.waitingStudentsCount ?? 0;
  const activeCount = classData?.activeStudentsCount ?? 0;
  const totalCount = waitingCount + activeCount;
  const progress = capacity > 0 ? (totalCount / capacity) * 100 : 0;
  const status = getComputedStatus(classData);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-[98vw] w-[98vw] h-[98vh] max-h-[98vh] p-0 overflow-hidden flex flex-col [&>button:last-child]:hidden"
        data-testid="dialog-class-detail"
      >
        {/* Header */}
        <div className="relative flex items-center px-6 py-3 border-b shrink-0 min-h-[60px]">
          {/* Left: class name + code + status */}
          <div className="flex items-center gap-2 shrink-0 min-w-0 max-w-[280px]">
            <div className="min-w-0">
              <h2 className="text-base font-bold leading-tight truncate" data-testid="text-dialog-class-name">
                {isLoadingClass ? "Đang tải..." : classData?.name}
              </h2>
              <p className="text-xs text-muted-foreground truncate" data-testid="text-dialog-class-code">
                {classData?.classCode}
              </p>
            </div>
            {classData && (
              <Badge variant="outline" className={`shrink-0 ${status.className}`}>
                {status.label}
              </Badge>
            )}
          </div>

          {/* Center: tabs */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5">
            {[
              { value: "waiting", label: `Học viên chờ (${waitingCount})` },
              { value: "active", label: `Học viên chính thức (${activeCount})` },
              { value: "schedule", label: "Lịch học" },
              { value: "attendance", label: "Điểm danh" },
              { value: "score-sheet", label: "Bảng điểm" },
            ].map(t => (
              <button
                key={t.value}
                onClick={() => setActiveTab(t.value)}
                className={cn(
                  "px-3 py-1.5 rounded-md border text-xs font-medium transition-all whitespace-nowrap",
                  activeTab === t.value
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-background border-border text-foreground hover:bg-muted/50"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Right: close button */}
          <div className="ml-auto shrink-0">
            <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-class-detail">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {isLoadingClass ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Đang tải dữ liệu lớp học...
            </div>
          ) : (
            <div className="flex flex-col xl:flex-row gap-0 w-full overflow-hidden">
              {/* Sidebar */}
              <div className={`w-full xl:w-[280px] border-r shrink-0 overflow-y-auto ${activeTab === "schedule" || activeTab === "attendance" ? "hidden" : ""}`}>
                <div className="p-4 space-y-4">
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
                      <span className="font-medium text-right">
                        {classData?.teachers?.length > 0
                          ? classData.teachers.map((t: any) => t.fullName).join(", ")
                          : "Chưa gán"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Phụ trách:</span>
                      <span className="font-medium">{classData?.manager?.fullName || "System"}</span>
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
                </div>
              </div>

              {/* Main Content */}
              <div className="flex-1 overflow-y-auto p-4">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsContent value="waiting" className="mt-0 space-y-4">
                    <WaitingTabContent
                      classId={id}
                      classData={classData}
                      waitingStudents={waitingStudents}
                      classSessions={classSessions}
                      classPerm={classPerm}
                    />
                  </TabsContent>

                  <TabsContent value="active" className="mt-0">
                    <ActiveTabContent classId={id} activeStudents={activeStudents} />
                  </TabsContent>

                  <TabsContent value="schedule" className="mt-0 space-y-4">
                    <ScheduleTabContent
                      classId={id}
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
                    />
                  </TabsContent>

                  <TabsContent value="score-sheet" className="mt-0">
                    <ScoreSheetTabContent
                      classId={id}
                      classSessions={classSessions}
                      classData={classData}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
