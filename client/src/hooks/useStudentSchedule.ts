import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { StudentResponse, Class, ClassSession } from "@shared/schema";

export type StudentForSchedule = StudentResponse & { studentId: string; classId?: string };

export type ScheduleStudentConfig = Record<string, unknown>;

export function useStudentSchedule() {
  const { toast } = useToast();
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [studentForSchedule, setStudentForSchedule] = useState<StudentForSchedule | null>(null);
  const [scheduleClassData, setScheduleClassData] = useState<Class | null>(null);
  const [scheduleSessionsData, setScheduleSessionsData] = useState<ClassSession[]>([]);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);

  const openScheduleDialog = async (student: StudentResponse & { classId?: string }) => {
    if (!student.classId) {
      toast({ title: "Lỗi", description: "Học viên chưa được gán vào lớp", variant: "destructive" });
      return;
    }

    setIsLoadingSchedule(true);
    try {
      const [classRes, sessionsRes] = await Promise.all([
        fetch(`/api/classes/${student.classId}`, { credentials: "include" }),
        fetch(`/api/classes/${student.classId}/sessions`, { credentials: "include" }),
      ]);

      if (!classRes.ok || !sessionsRes.ok) throw new Error("Failed to fetch data");

      const classData: Class = await classRes.json();
      const sessions: ClassSession[] = await sessionsRes.json();

      const formattedStudent: StudentForSchedule = { ...student, studentId: student.id };

      setScheduleClassData(classData);
      setScheduleSessionsData(sessions);
      setStudentForSchedule(formattedStudent);
      setIsScheduleOpen(true);
    } catch {
      toast({
        title: "Lỗi",
        description: "Không thể tải thông tin lịch học",
        variant: "destructive",
      });
    } finally {
      setIsLoadingSchedule(false);
    }
  };

  const handleScheduleConfirm = async (configs: ScheduleStudentConfig[]) => {
    const classId = studentForSchedule?.classId;
    try {
      const res = await fetch(`/api/classes/${classId}/schedule-students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configs),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to schedule students");

      // Invalidate all affected queries
      if (classId) {
        queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/waiting-students`] });
        queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] });
        queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/sessions`] });
        queryClient.invalidateQueries({ queryKey: ["/api/classes", classId] });
        queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
      }
      queryClient.invalidateQueries({
        predicate: (query) => {
          const k0 = query.queryKey[0];
          return typeof k0 === "string" && k0.startsWith("/api/my-space/calendar");
        },
      });

      toast({ title: "Thành công", description: "Đã xếp lịch cho học viên" });
      setIsScheduleOpen(false);
      setStudentForSchedule(null);
    } catch {
      toast({
        title: "Lỗi",
        description: "Không thể xếp lịch cho học viên",
        variant: "destructive",
      });
    }
  };

  return {
    isScheduleOpen,
    setIsScheduleOpen,
    studentForSchedule,
    scheduleClassData,
    scheduleSessionsData,
    isLoadingSchedule,
    openScheduleDialog,
    handleScheduleConfirm,
  };
}
