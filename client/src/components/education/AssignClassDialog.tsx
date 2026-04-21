import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useClasses } from "@/hooks/use-classes";
import { Loader2, Calendar, Users, BookOpen } from "lucide-react";
import { ScheduleDialog } from "./ScheduleDialog";

interface AssignClassDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  student: any;
  locationId?: string;
  onSuccess?: () => void;
}

export function AssignClassDialog({
  isOpen,
  onOpenChange,
  student,
  locationId,
  onSuccess,
}: AssignClassDialogProps) {
  const { data: classes, isLoading: classesLoading } = useClasses(locationId, { enabled: isOpen, minimal: true });
  const { toast } = useToast();
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [isSchedulingOpen, setIsSchedulingOpen] = useState(false);
  const [isStudentSaved, setIsStudentSaved] = useState(false);
  const [isLoadingScheduleData, setIsLoadingScheduleData] = useState(false);
  const [waitingStudentsData, setWaitingStudentsData] = useState<any[]>([]);
  const [classSessionsData, setClassSessionsData] = useState<any[]>([]);

  const selectedClass = classes?.find((c: any) => c.id === selectedClassId);

  const handleAssignToWaitingList = async () => {
    if (!selectedClassId) {
      toast({ title: "Lỗi", description: "Vui lòng chọn lớp học", variant: "destructive" });
      return;
    }

    setIsAssigning(true);
    try {
      const res = await fetch(`/api/classes/${selectedClassId}/add-students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentIds: [student.id],
          status: "waiting",
        }),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to assign student");

      toast({
        title: "Thành công",
        description: "Đã gán học viên vào danh sách chờ của lớp",
      });

      setIsStudentSaved(true);
      onSuccess?.();
    } catch (error) {
      toast({
        title: "Lỗi",
        description: "Không thể gán học viên vào lớp",
        variant: "destructive",
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleOpenScheduleDialog = async () => {
    if (!selectedClassId) return;

    setIsLoadingScheduleData(true);
    try {
      // Fetch both waiting and active students for this class
      const [waitingRes, activeRes, sessionsRes] = await Promise.all([
        fetch(`/api/classes/${selectedClassId}/waiting-students`, { credentials: "include" }),
        fetch(`/api/classes/${selectedClassId}/active-students`, { credentials: "include" }),
        fetch(`/api/classes/${selectedClassId}/sessions`, { credentials: "include" }),
      ]);

      if (!waitingRes.ok) throw new Error("Failed to fetch waiting students");
      if (!activeRes.ok) throw new Error("Failed to fetch active students");
      if (!sessionsRes.ok) throw new Error("Failed to fetch sessions");

      const waitingStudents = await waitingRes.json();
      const activeStudents = await activeRes.json();
      const sessions = await sessionsRes.json();

      // Combine both waiting and active students
      const allStudents = [...waitingStudents, ...activeStudents];

      setWaitingStudentsData(allStudents);
      setClassSessionsData(sessions);
      setIsSchedulingOpen(true);
    } catch (error) {
      toast({
        title: "Lỗi",
        description: "Không thể tải thông tin lịch học",
        variant: "destructive",
      });
    } finally {
      setIsLoadingScheduleData(false);
    }
  };

  if (!student) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="text-2xl">Gán Lớp Học</DialogTitle>
            <DialogDescription>
              Gán học viên {student?.fullName} vào một lớp học
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Class Selection */}
            <div className="space-y-2">
              <label className="text-sm font-semibold">Chọn Lớp Học</label>
              <Select value={selectedClassId} onValueChange={setSelectedClassId} disabled={classesLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={classesLoading ? "Đang tải..." : "Chọn lớp học..."} />
                </SelectTrigger>
                <SelectContent>
                  {!classesLoading && classes && classes.length > 0 ? (
                    classes.map((cls: any) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.classCode} - {cls.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="_empty" disabled>
                      {classesLoading ? "Đang tải..." : "Không có lớp học nào"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Class Details */}
            {selectedClass && (
              <Card className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Thông Tin Lớp Học</CardTitle>
                    <Badge>{selectedClass.status || "Chưa rõ"}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Class Name and Code */}
                  <div className="pb-3 border-b border-slate-200 dark:border-slate-700">
                    <div className="text-sm font-medium">
                      <span className="font-semibold">{selectedClass.classCode}</span> - {selectedClass.name}
                    </div>
                  </div>

                  {/* Key Information in one line format */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase min-w-fit">Giáo Viên:</span>
                      </div>
                      <span className="text-sm font-medium">
                        {selectedClass.teacher?.fullName || "Chưa có"}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase min-w-fit">Học Viên Chờ:</span>
                      </div>
                      <Badge variant="outline">{selectedClass.waitingStudentsCount || 0}</Badge>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase min-w-fit">Học Viên Chính Thức:</span>
                      </div>
                      <Badge variant="secondary">
                        {selectedClass.activeStudentsCount || 0} / {selectedClass.maxStudents || "?"}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase min-w-fit">Ngày Bắt Đầu:</span>
                      </div>
                      <span className="text-sm font-medium">
                        {new Date(selectedClass.startDate).toLocaleDateString("vi-VN")}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <DialogFooter className="gap-3">
            <Button variant="outline" onClick={() => {
              onOpenChange(false);
              setSelectedClassId("");
              setIsStudentSaved(false);
            }}>
              Huỷ
            </Button>
            <Button
              variant="outline"
              onClick={handleOpenScheduleDialog}
              disabled={!isStudentSaved || isLoadingScheduleData}
              className="gap-2"
            >
              {isLoadingScheduleData && <Loader2 className="w-4 h-4 animate-spin" />}
              Xếp Lịch
            </Button>
            <Button
              onClick={handleAssignToWaitingList}
              disabled={!selectedClassId || isAssigning || isStudentSaved}
              className="gap-2"
            >
              {isAssigning && <Loader2 className="w-4 h-4 animate-spin" />}
              Lưu Gán Lớp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      {selectedClass && isStudentSaved && (
        <ScheduleDialog
          isOpen={isSchedulingOpen}
          onOpenChange={(open) => {
            setIsSchedulingOpen(open);
            if (!open) {
              onOpenChange(false);
              setSelectedClassId("");
              setIsStudentSaved(false);
            }
          }}
          students={waitingStudentsData}
          classData={selectedClass}
          classSessions={classSessionsData}
          onConfirm={async (configs: any[]) => {
            try {
              const res = await fetch(`/api/classes/${selectedClassId}/schedule-students`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(configs),
                credentials: "include",
              });

              if (!res.ok) throw new Error("Failed to schedule students");

              toast({
                title: "Thành công",
                description: "Đã xếp lịch học viên thành công",
              });

              queryClient.invalidateQueries({ queryKey: [`/api/classes/${selectedClassId}/waiting-students`] });
              queryClient.invalidateQueries({ queryKey: [`/api/classes/${selectedClassId}/active-students`] });
              queryClient.invalidateQueries({ queryKey: ["/api/classes", selectedClassId] });
              queryClient.invalidateQueries({
                predicate: (query) => {
                  const k0 = query.queryKey[0];
                  return typeof k0 === "string" && k0.startsWith("/api/my-space/calendar");
                },
              });

              setIsSchedulingOpen(false);
              onOpenChange(false);
              setSelectedClassId("");
              setIsStudentSaved(false);
              onSuccess?.();
            } catch (error) {
              toast({
                title: "Lỗi",
                description: "Không thể xếp lịch cho học viên",
                variant: "destructive",
              });
            }
          }}
          isPending={false}
        />
      )}
    </>
  );
}
