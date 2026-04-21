import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * Centralises every mutation used inside the class-detail feature.
 *
 * The hook owns:
 *  - the API call (mutationFn)
 *  - cache invalidation
 *  - toast notifications
 *
 * State cleanup (closing dialogs, resetting selections) is left to the
 * caller via TanStack Query's per-call onSuccess / onError options:
 *
 *   addStudentsMutation.mutate(ids, {
 *     onSuccess: () => { setIsOpen(false); setSelected([]); }
 *   });
 */
export function useClassMutations(
  classId?: string,
  selectedClassSessionId?: string | null
) {
  const { toast } = useToast();

  // Invalidates all student-session queries for this class regardless of studentId
  const invalidateStudentSessions = () => {
    if (!classId) return;
    queryClient.invalidateQueries({
      predicate: (query) => {
        const k0 = query.queryKey[0];
        if (typeof k0 === "string") {
          return k0.startsWith(`/api/classes/${classId}/student/`) && k0.endsWith("/sessions");
        }
        return (
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === "/api/classes" &&
          query.queryKey[1] === classId &&
          query.queryKey[2] === "student"
        );
      },
    });
  };

  // Invalidates all my-space calendar and assignment queries (student + staff views)
  const invalidateCalendarQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/my-space/calendar"] });
    queryClient.invalidateQueries({ queryKey: ["/api/my-space/calendar/student"] });
    queryClient.invalidateQueries({ queryKey: ["/api/my-space/calendar/staff"] });
    queryClient.invalidateQueries({ queryKey: ["/api/my-space/assignments/student"] });
    queryClient.invalidateQueries({ queryKey: ["/api/my-space/assignments/staff"] });
    queryClient.invalidateQueries({
      predicate: (query) => {
        const k0 = query.queryKey[0];
        return typeof k0 === "string" && (
          k0.startsWith("/api/my-space/calendar") ||
          k0.startsWith("/api/my-space/assignments") ||
          k0 === "/api/schedule"
        );
      },
    });
  };

  // ─── Waiting-tab mutations ──────────────────────────────────────────────

  /** Add students to the waiting list */
  const addStudentsMutation = useMutation({
    mutationFn: async (studentIds: string[]) => {
      await apiRequest("POST", `/api/classes/${classId}/add-students`, { studentIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/waiting-students`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] });
      toast({ title: "Thành công", description: "Đã thêm học viên vào danh sách chờ" });
    },
  });

  /** Schedule waiting students into class sessions.
   *  Accepts either a plain configs array (legacy) or an object with configs + optional classScheduleConfig.
   *  When classScheduleConfig is provided and the class has no sessions, sessions are generated first (one-step flow). */
  const scheduleMutation = useMutation({
    mutationFn: async (payload: any[] | { configs: any[]; classScheduleConfig?: any }) => {
      const configs = Array.isArray(payload) ? payload : payload.configs;
      const classScheduleConfig = Array.isArray(payload) ? undefined : payload.classScheduleConfig;
      await apiRequest("POST", `/api/classes/${classId}/schedule-students`, { configs, classScheduleConfig });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/waiting-students`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/sessions`] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoices"] });
      invalidateStudentSessions();
      invalidateCalendarQueries();
      toast({ title: "Thành công", description: "Đã xếp lịch cho học viên" });
    },
    onError: (err: any) => {
      toast({
        title: "Lỗi",
        description: err.message || "Không thể xếp lịch cho học viên",
        variant: "destructive",
      });
    },
  });

  // ─── Schedule-tab mutations ─────────────────────────────────────────────

  /** Update a single class session's details (date, time, room, …) */
  const updateSessionMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest(
        "PATCH",
        `/api/class-sessions/${selectedClassSessionId}`,
        data
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/sessions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] });
      queryClient.invalidateQueries({ queryKey: ["/api/classes", classId] });
      invalidateStudentSessions();
      invalidateCalendarQueries();
      toast({ title: "Thành công", description: "Đã cập nhật thông tin buổi học" });
    },
    onError: (err: any) => {
      toast({
        title: "Lỗi",
        description: err.message || "Không thể cập nhật buổi học",
        variant: "destructive",
      });
    },
  });

  /** Regenerate the session schedule based on a new weekly cycle */
  const updateCycleMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/classes/${classId}/update-cycle`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/sessions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] });
      invalidateStudentSessions();
      invalidateCalendarQueries();
      toast({ title: "Thành công", description: "Đã cập nhật chu kỳ thành công" });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể cập nhật chu kỳ",
        variant: "destructive",
      });
    },
  });

  /** Cancel one or more sessions */
  const cancelSessionsMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", `/api/classes/${classId}/cancel-sessions`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/sessions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] });
      queryClient.invalidateQueries({ queryKey: ["/api/classes", classId] });
      invalidateStudentSessions();
      invalidateCalendarQueries();
      toast({ title: "Thành công", description: "Đã hủy các buổi học đã chọn" });
    },
    onError: (err: any) => {
      toast({
        title: "Lỗi",
        description: err.message || "Không thể hủy buổi học",
        variant: "destructive",
      });
    },
  });

  /**
   * Change the teacher for a session range.
   * Returns a rejected promise on 409 (conflict) so the caller can show
   * the conflict confirmation dialog.
   */
  const changeTeacherMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/classes/${classId}/change-teacher`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/sessions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] });
      queryClient.invalidateQueries({ queryKey: ["/api/classes", classId, "sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/classes", classId] });
      if (selectedClassSessionId) {
        queryClient.invalidateQueries({
          queryKey: [`/api/class-sessions/${selectedClassSessionId}/student-sessions`],
        });
      }
      invalidateStudentSessions();
      invalidateCalendarQueries();
      toast({ title: "Thành công", description: "Đã đổi giáo viên thành công" });
    },
    onError: (error: any) => {
      if (error.status !== 409) {
        toast({
          title: "Lỗi",
          description: error.message || "Không thể đổi giáo viên",
          variant: "destructive",
        });
      }
    },
  });

  /** Schedule makeup sessions for absent students */
  const makeupMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/classes/${classId}/makeup`, data);
      return res.json();
    },
    onSuccess: () => {
      if (selectedClassSessionId) {
        queryClient.invalidateQueries({
          queryKey: [`/api/class-sessions/${selectedClassSessionId}/student-sessions`],
        });
      }
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/sessions`] });
      queryClient.invalidateQueries({ queryKey: ["/api/classes", classId] });
      invalidateStudentSessions();
      invalidateCalendarQueries();
      toast({ title: "Thành công", description: "Đã xếp bù thành công" });
    },
    onError: (err: any) => {
      toast({
        title: "Lỗi",
        description: err.message || "Không thể xếp bù",
        variant: "destructive",
      });
    },
  });

  /** Update attendance status (and optional note) for a student-session */
  const updateAttendanceMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/student-sessions/attendance", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0] as string;
          return typeof key === "string" && (
            key.includes("/student-sessions") ||
            key === "/api/my-space/calendar/staff" ||
            key === "/api/schedule"
          );
        },
      });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/all-student-sessions`] });
      toast({ title: "Thành công", description: "Đã cập nhật điểm danh" });
    },
    onError: (error: Error) => {
      toast({ title: "Lỗi", description: error.message, variant: "destructive" });
    },
  });

  /** Swap the fee package for one or more students across a session range */
  const updateTuitionPackageMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/student-sessions/tuition-package", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      if (selectedClassSessionId) {
        queryClient.invalidateQueries({
          queryKey: [`/api/class-sessions/${selectedClassSessionId}/student-sessions`],
        });
      }
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] });
      if (data?.warning) {
        toast({ title: "Cảnh báo", description: data.warning });
      } else {
        toast({ title: "Thành công", description: "Đã cập nhật gói học phí" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Lỗi", description: error.message, variant: "destructive" });
    },
  });

  /**
   * Extend the schedule for a set of students.
   * The caller must include `studentIds` inside the data payload:
   *   extensionMutation.mutate({ ...formData, studentIds: selectedStudentIds })
   */
  const extensionMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/classes/${classId}/extend-students`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/sessions`] });
      if (selectedClassSessionId) {
        queryClient.invalidateQueries({
          queryKey: [`/api/class-sessions/${selectedClassSessionId}/student-sessions`],
        });
      }
      queryClient.invalidateQueries({ predicate: (q) => {
        const k = q.queryKey[0];
        return typeof k === "string" && k.startsWith("/api/class-sessions/") && k.endsWith("/student-sessions");
      }});
      queryClient.refetchQueries({ queryKey: ["/api/finance/invoices"] });
      invalidateStudentSessions();
      invalidateCalendarQueries();
      toast({ title: "Thành công", description: "Đã gia hạn học viên thành công" });
    },
    onError: (error: any) => {
      toast({ title: "Lỗi", description: error.message, variant: "destructive" });
    },
  });

  // ─── Class CRUD mutations ───────────────────────────────────────────────

  /** Create a new class */
  const createClassMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/classes", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      toast({ title: "Thành công", description: "Lớp học đã được tạo thành công" });
    },
    onError: (err: any) => {
      toast({
        title: "Lỗi",
        description: err.message || "Không thể tạo lớp học. Vui lòng kiểm tra lại lịch dạy giáo viên.",
        variant: "destructive",
      });
    },
  });

  /** Update an existing class — caller passes { id, data } */
  const updateClassMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/classes/${id}`, data);
      return res.json();
    },
    onSuccess: (_data, { id, data }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/classes", id] });
      if (data?.regenerateSessions) {
        queryClient.invalidateQueries({ queryKey: ["/api/classes", id, "sessions"] });
        queryClient.invalidateQueries({ queryKey: [`/api/classes/${id}/sessions`] });
      }
      toast({ title: "Thành công", description: data?.regenerateSessions ? "Đã cập nhật lớp và sinh lịch học mới" : "Cập nhật lớp học thành công" });
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message || "Không thể cập nhật lớp học", variant: "destructive" });
    },
  });

  // ─── Class-list mutations ───────────────────────────────────────────────

  /** Delete a single class by id */
  const deleteClassMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/classes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      toast({ title: "Đã xóa", description: "Lớp học đã được xóa thành công" });
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message || "Không thể xóa lớp học", variant: "destructive" });
    },
  });

  /** Delete multiple classes by ids */
  const bulkDeleteClassMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await apiRequest("DELETE", "/api/classes/bulk", { ids });
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      toast({ title: "Đã xóa", description: `Đã xóa ${ids.length} lớp học` });
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message || "Không thể xóa lớp học", variant: "destructive" });
    },
  });

  return {
    // waiting tab
    addStudentsMutation,
    scheduleMutation,
    // schedule tab
    updateSessionMutation,
    updateCycleMutation,
    cancelSessionsMutation,
    changeTeacherMutation,
    makeupMutation,
    updateAttendanceMutation,
    updateTuitionPackageMutation,
    extensionMutation,
    // class CRUD
    createClassMutation,
    updateClassMutation,
    // class list
    deleteClassMutation,
    bulkDeleteClassMutation,
  };
}
