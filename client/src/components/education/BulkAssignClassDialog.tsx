import { useState, useMemo, useEffect } from "react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useClasses } from "@/hooks/use-classes";
import { useStudents } from "@/hooks/use-students";
import { ScheduleDialog } from "./ScheduleDialog";
import { Loader2, Calendar, Users, BookOpen, AlertTriangle } from "lucide-react";

interface BulkAssignClassDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  studentIds: string[];
  studentCount: number;
  locationId?: string;
  onSuccess?: () => void;
}

export function BulkAssignClassDialog({
  isOpen,
  onOpenChange,
  studentIds,
  studentCount,
  locationId,
  onSuccess,
}: BulkAssignClassDialogProps) {
  const { data: classes, isLoading: classesLoading } = useClasses(locationId, { enabled: isOpen, minimal: true });
  const { data: allStudents } = useStudents();
  const { toast } = useToast();
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [isSchedulingOpen, setIsSchedulingOpen] = useState(false);
  const [fullClassData, setFullClassData] = useState<any>(null);
  const [isLoadingClass, setIsLoadingClass] = useState(false);
  const [scheduledStudents, setScheduledStudents] = useState<any[]>([]);

  const selectedClass = classes?.find((c: any) => c.id === selectedClassId);

  // Fetch full class data and students when class is selected
  useEffect(() => {
    if (selectedClassId) {
      setIsLoadingClass(true);
      Promise.all([
        fetch(`/api/classes/${selectedClassId}`, { credentials: "include" }).then(res => res.json()),
        fetch(`/api/classes/${selectedClassId}/waiting-students`, { credentials: "include" }).then(res => res.json()),
        fetch(`/api/classes/${selectedClassId}/active-students`, { credentials: "include" }).then(res => res.json())
      ])
        .then(([classData, waitingStudents, activeStudents]) => {
          setFullClassData({
            ...classData,
            waitingStudents: waitingStudents || [],
            activeStudents: activeStudents || []
          });
        })
        .catch(err => console.error("Failed to fetch class details:", err))
        .finally(() => setIsLoadingClass(false));
    } else {
      setFullClassData(null);
    }
  }, [selectedClassId]);

  // Check which students are already in the selected class using actual DB data
  const studentsAlreadyInClass = useMemo(() => {
    if (!fullClassData) return [];
    
    // Get all student IDs from both waiting and active students in the class
    const existingStudentIds = new Set<string>();
    
    // From waiting students
    if (Array.isArray(fullClassData.waitingStudents)) {
      fullClassData.waitingStudents.forEach((sc: any) => {
        existingStudentIds.add(sc.studentId);
      });
    }
    
    // From active students
    if (Array.isArray(fullClassData.activeStudents)) {
      fullClassData.activeStudents.forEach((sc: any) => {
        existingStudentIds.add(sc.studentId);
      });
    }
    
    return studentIds.filter(id => existingStudentIds.has(id));
  }, [selectedClassId, studentIds, fullClassData]);

  // Check if there are any students already in the class
  const hasConflict = studentsAlreadyInClass.length > 0;
  const studentsToAdd = studentIds.filter(id => !studentsAlreadyInClass.includes(id));

  // Fetch student details when schedule dialog opens
  useEffect(() => {
    if (isSchedulingOpen && studentsToAdd.length > 0) {
      const ids = studentsToAdd.join(",");
      fetch(`/api/students?ids=${ids}`, { credentials: "include" })
        .then(res => res.json())
        .then(data => {
          const studentMap = new Map(
            (data.students || []).map((s: any) => [s.id, s])
          );
          setScheduledStudents(
            studentsToAdd.map(studentId => ({
              studentId,
              student: studentMap.get(studentId) || {
                id: studentId,
                fullName: "Đang tải...",
                code: ""
              }
            }))
          );
        })
        .catch(err => {
          console.error("Failed to fetch students:", err);
          setScheduledStudents(
            studentsToAdd.map(studentId => ({
              studentId,
              student: { id: studentId, fullName: "Đang tải...", code: "" }
            }))
          );
        });
    }
  }, [isSchedulingOpen, studentsToAdd]);

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
          studentIds: studentsToAdd, // Only add students not already in the class
          status: "waiting",
        }),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to assign students");

      toast({
        title: "Thành công",
        description: `Đã gán ${studentsToAdd.length} học viên vào danh sách chờ của lớp`,
      });

      onOpenChange(false);
      setSelectedClassId("");
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

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Gán Lớp Học</DialogTitle>
          <DialogDescription>
            Gán {studentCount} học viên vào một lớp học
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

          {/* Warning if students already in class */}
          {hasConflict && (
            <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                {studentsAlreadyInClass.length} học viên đã có trong lớp này. Chỉ {studentsToAdd.length} học viên sẽ được thêm.
              </AlertDescription>
            </Alert>
          )}

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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          {selectedClass && (
            <Button
              variant="outline"
              onClick={() => setIsSchedulingOpen(true)}
              disabled={isAssigning}
            >
              Xếp Lịch
            </Button>
          )}
          <Button
            onClick={handleAssignToWaitingList}
            disabled={!selectedClassId || isAssigning || studentsToAdd.length === 0}
            className="gap-2"
          >
            {isAssigning && <Loader2 className="w-4 h-4 animate-spin" />}
            Lưu Gán Lớp
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Schedule Dialog */}
      {fullClassData && (
        <ScheduleDialog
          isOpen={isSchedulingOpen}
          onOpenChange={setIsSchedulingOpen}
          students={scheduledStudents}
          classData={fullClassData}
          classSessions={fullClassData.sessions || []}
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
    </Dialog>
  );
}
