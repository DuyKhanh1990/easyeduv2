import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { MyCalendarSession } from "@/types/my-calendar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { applyBulkAttendance } from "@/lib/attendance-bulk";
import { useToast } from "@/hooks/use-toast";
import { Users, Loader2, Star, ChevronDown, LibraryBig } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContentViewDialog, SessionContentDialog } from "@/components/education/SessionContentDialog";
import { LibraryContentDialog } from "@/components/courses/LibraryContentDialog";
import { AddStudentToSessionDialog } from "@/components/education/AddStudentToSessionDialog";
import { ReviewDialog } from "@/components/education/ReviewDialog";
import { RemoveStudentFromSessionDialog } from "@/components/education/RemoveStudentFromSessionDialog";
import { useLanguage } from "@/hooks/use-language";

const WEEKDAY_LABELS: Record<number, string> = {
  0: "Chủ Nhật",
  1: "Thứ Hai",
  2: "Thứ Ba",
  3: "Thứ Tư",
  4: "Thứ Năm",
  5: "Thứ Sáu",
  6: "Thứ Bảy",
};

const CONTENT_TYPE_LABELS = [
  { key: "Bài học", alts: ["lesson", "Bài học"] },
  { key: "Bài tập về nhà", alts: ["homework", "Bài tập về nhà"] },
  { key: "Giáo trình", alts: ["curriculum", "Giáo trình"] },
  { key: "Bài kiểm tra", alts: ["exam", "Bài kiểm tra"] },
];

const ATTENDANCE_OPTIONS = [
  { value: "pending", label: "Chưa điểm danh", className: "text-slate-600" },
  { value: "present", label: "Có học", className: "text-green-600" },
  { value: "absent", label: "Nghỉ học", className: "text-red-600" },
  { value: "makeup_wait", label: "Nghỉ chờ bù", className: "text-amber-600" },
  { value: "makeup_scheduled", label: "Đã xếp bù", className: "text-violet-900" },
  { value: "makeup_done", label: "Đã học bù", className: "text-blue-600" },
  { value: "paused", label: "Bảo lưu", className: "text-yellow-600" },
];

const BULK_ATTENDANCE_OPTIONS = [
  { status: "present", label: "Có học", color: "green" },
  { status: "absent", label: "Nghỉ học", color: "red" },
  { status: "makeup_wait", label: "Nghỉ chờ bù", color: "orange" },
  { status: "makeup_done", label: "Đã học bù", color: "blue" },
  { status: "paused", label: "Bảo lưu", color: "gray" },
];

function getAttendanceOption(status: string | null) {
  return ATTENDANCE_OPTIONS.find((o) => o.value === (status || "pending")) ?? ATTENDANCE_OPTIONS[0];
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr + "T00:00:00");
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function getContentSummary(generalContents: MyCalendarSession["generalContents"]) {
  return CONTENT_TYPE_LABELS.map(({ key, alts }) => {
    const matched = generalContents.filter((c) => alts.includes(c.type));
    return {
      label: key,
      value: matched.length > 0 ? matched.map((c) => c.title).join(", ") : null,
    };
  });
}

interface StaffSessionDetailSheetProps {
  session: MyCalendarSession | null;
  onClose: () => void;
}

export function StaffSessionDetailSheet({ session, onClose }: StaffSessionDetailSheetProps) {
  const { t } = useLanguage();
  const attendanceLabel = (status: string | null | undefined) => {
    switch (status) {
      case "present": return t("mySpace.calendar.attendancePresent");
      case "absent": return t("mySpace.calendar.attendanceAbsent");
      case "makeup_wait": return t("mySpace.calendar.attendanceMakeupWait");
      case "makeup_scheduled": return t("mySpace.calendar.attendanceMakeupScheduled");
      case "makeup_done": return t("mySpace.calendar.attendanceMakeupDone");
      case "paused": return t("mySpace.calendar.attendancePaused");
      default: return t("mySpace.calendar.attendancePending");
    }
  };
  const { toast } = useToast();
  const [contentDialogOpen, setContentDialogOpen] = useState(false);
  const [libraryDialogOpen, setLibraryDialogOpen] = useState(false);
  const [localNotes, setLocalNotes] = useState<Record<string, string>>({});

  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isBulkAttendanceOpen, setIsBulkAttendanceOpen] = useState(false);
  const [isBulkAttendanceSaving, setIsBulkAttendanceSaving] = useState(false);
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);
  const [isBulkReviewOpen, setIsBulkReviewOpen] = useState(false);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addSearchTerm, setAddSearchTerm] = useState("");
  const [addSelectedIds, setAddSelectedIds] = useState<string[]>([]);

  const [reviewTarget, setReviewTarget] = useState<any>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [viewingContentId, setViewingContentId] = useState<string | null>(null);
  const [viewingFallbackContent, setViewingFallbackContent] = useState<{
    title: string;
    type: string;
    content?: string | null;
  } | null>(null);

  const isOpen = !!session;
  const classSessionId = session?.classSessionId ?? "";
  const classId = session?.classId ?? "";
  const isFreeSession = session?.isFreeSession === true;
  const [freeStudentRows, setFreeStudentRows] = useState(session?.freeStudents ?? []);

  useEffect(() => {
    setFreeStudentRows(session?.freeStudents ?? []);
  }, [session]);

  const studentSessionsKey = `/api/class-sessions/${classSessionId}/student-sessions`;

  const embeddedStudentSessions = session?.studentSessions;
  const [regularStudentRows, setRegularStudentRows] = useState<any[]>(embeddedStudentSessions ?? []);
  useEffect(() => {
    setRegularStudentRows(embeddedStudentSessions ?? []);
  }, [classSessionId, embeddedStudentSessions]);

  const { data: fetchedStudentSessions = [], isLoading: loadingFetchedStudents } = useQuery<any[]>({
    queryKey: [studentSessionsKey],
    enabled: isOpen && !isFreeSession && !!classSessionId && embeddedStudentSessions === undefined,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const freeStudentSessions = freeStudentRows.map((student) => ({
    id: student.registrationId,
    studentId: student.studentId,
    studentClassId: student.studentClassId,
    attendanceStatus: student.status,
    attendanceNote: student.note ?? null,
    reviewData: student.reviewData,
    reviewPublished: student.reviewPublished ?? false,
    student: { fullName: student.fullName, code: student.code },
    registrationId: student.registrationId,
  }));
  const studentSessions = isFreeSession
    ? freeStudentSessions
    : (embeddedStudentSessions === undefined ? fetchedStudentSessions : regularStudentRows);
  const loadingStudents = !isFreeSession && embeddedStudentSessions === undefined && loadingFetchedStudents;

  const applyRegularStudentSessionUpdates = (updates: Record<string, Partial<any>>) => {
    const applyUpdates = (rows: any[] | undefined) =>
      rows?.map((row) => updates[row.id] ? { ...row, ...updates[row.id] } : row);

    setRegularStudentRows((current) => applyUpdates(current) ?? current);
    queryClient.setQueryData<any[]>([studentSessionsKey], applyUpdates);
    queryClient.setQueryData<MyCalendarSession>(
      ["/api/my-space/calendar/staff/session", classSessionId],
      (cached) => cached
        ? { ...cached, studentSessions: applyUpdates(cached.studentSessions) }
        : cached,
    );
  };

  const { data: availableStudents = [], isLoading: loadingAvailable } = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/available-students`],
    enabled: isAddOpen && !isFreeSession && !!classId,
  });

  const { data: allCriteria = [] } = useQuery<any[]>({
    queryKey: ["/api/evaluation-criteria"],
    enabled: isOpen,
  });

  const sessionInStudents = new Set(studentSessions.map((ss: any) => ss.studentId));
  const enrolledCandidates = availableStudents
    .filter((s: any) => !sessionInStudents.has(s.id))
    .map((s: any) => ({ ...s, source: "enrolled" }));

  const filteredCandidates = addSearchTerm.trim()
    ? enrolledCandidates.filter(
        (s: any) =>
          s.fullName?.toLowerCase().includes(addSearchTerm.toLowerCase()) ||
          s.code?.toLowerCase().includes(addSearchTerm.toLowerCase())
      )
    : enrolledCandidates;

  const addStudentsMutation = useMutation({
    mutationFn: async (studentIds: string[]) => {
      return apiRequest("POST", `/api/class-sessions/${classSessionId}/add-students`, { studentIds });
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
      toast({ title: t("mySpace.calendar.addStudentSuccess") });
    },
    onError: () => {
      toast({ title: t("mySpace.calendar.error"), description: t("mySpace.calendar.addStudentFailed"), variant: "destructive" });
    },
  });

  const updateAttendanceMutation = useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status?: string; note?: string }) => {
      return apiRequest("PATCH", `/api/student-sessions/${id}/attendance`, { status, note });
    },
    onSuccess: (_data, variables) => {
      const update: Partial<any> = {};
      if (variables.status !== undefined) update.attendanceStatus = variables.status;
      if (variables.note !== undefined) update.attendanceNote = variables.note;
      applyRegularStudentSessionUpdates({ [variables.id]: update });
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0] as string;
          return typeof key === "string" && (
            key.includes("/student-sessions") ||
            key.includes("/all-student-sessions") ||
            key === "/api/my-space/calendar/staff" ||
            key === "/api/schedule"
          );
        },
      });
    },
    onError: (err: any) => {
      toast({ title: t("mySpace.calendar.error"), description: err?.message || t("mySpace.calendar.updateAttendanceFailed"), variant: "destructive" });
    },
  });

  const updateFreeAttendanceMutation = useMutation({
    mutationFn: async ({
      studentClassId,
      status,
      note,
    }: {
      studentClassId: string;
      status: "registered" | "attended" | "reserved";
      note?: string;
    }) => {
       if (!session?.classId) throw new Error(t("mySpace.calendar.notFoundClass"));
      await apiRequest("PATCH", `/api/classes/${session.classId}/free-schedule`, {
        studentClassId,
        date: session.sessionDate,
        action: "attend",
        status,
        ...(note !== undefined ? { note } : {}),
      });
      return { studentClassId, status, note };
    },
    onSuccess: ({ studentClassId, status, note }) => {
      setFreeStudentRows((current) =>
        current.map((student) =>
          student.studentClassId === studentClassId
            ? { ...student, status, ...(note !== undefined ? { note: note || null } : {}) }
            : student,
        ),
      );
      queryClient.setQueryData<MyCalendarSession>(
        ["/api/my-space/calendar/staff/session", classSessionId],
        (cached) => cached
          ? {
              ...cached,
              freeStudents: (cached.freeStudents ?? []).map((student) =>
                student.studentClassId === studentClassId
                  ? { ...student, status, ...(note !== undefined ? { note: note || null } : {}) }
                  : student,
              ),
            }
          : cached,
      );
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0] as string;
          return typeof key === "string" && (
            key === "/api/my-space/calendar/staff" ||
            key.includes("/free-schedule")
          );
        },
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/my-space/calendar/staff/session", classSessionId],
      });
    },
    onError: (err: any) => {
      toast({ title: t("mySpace.calendar.error"), description: err?.message || t("mySpace.calendar.updateAttendanceFailed"), variant: "destructive" });
    },
  });

  function handleClose() {
    setSelectedStudentIds([]);
    setIsActionMenuOpen(false);
    onClose();
  }

  if (!session) return null;

  const weekdayLabel = WEEKDAY_LABELS[session.weekday] ?? "";
  const dateLabel = formatDate(session.sessionDate);

  const sessionCriteriaIds = session.evaluationCriteriaIds ?? [];
  const sessionCriteria = allCriteria.filter((c: any) => sessionCriteriaIds.includes(c.id));
  const sessionTeachers: { id: string; fullName: string }[] = session.teachers ?? [];

  const selectedStudentSessions = studentSessions.filter((ss: any) =>
    selectedStudentIds.includes(ss.studentId)
  );
  async function handleBulkAttendance(status: string) {
    if (isBulkAttendanceSaving || isFreeSession) return;
    if (!classSessionId || selectedStudentIds.length === 0) {
      toast({
         title: t("mySpace.calendar.toastCannotAttendance"),
         description: t("mySpace.calendar.toastMissingSession"),
        variant: "destructive",
      });
      return;
    }

    const selectedRows = selectedStudentIds
      .map((studentId) => studentSessions.find((ss: any) => ss.studentId === studentId))
      .filter(Boolean) as any[];
    if (selectedRows.length !== selectedStudentIds.length) {
      toast({
         title: t("mySpace.calendar.toastCannotAttendance"),
         description: t("mySpace.calendar.toastStaleStudents"),
        variant: "destructive",
      });
      return;
    }

    const noteBySessionId: Record<string, string> = {};
    for (const row of selectedRows) {
      noteBySessionId[row.id] = localNotes[row.id] ?? row.attendanceNote ?? "";
    }

    setIsBulkAttendanceSaving(true);
    try {
      const result = await applyBulkAttendance(
        selectedRows.map((row) => ({ id: row.id, classSessionId })),
        status,
        (sessionId, students) => apiRequest(
          "POST",
          "/api/student-sessions/bulk-attendance",
          {
            session_id: sessionId,
            students: students.map((student) => ({
              ...student,
              attendanceNote: noteBySessionId[student.studentSessionId] ?? "",
            })),
          },
        ),
        async () => {
          throw new Error("Lớp tự do cần dùng luồng điểm danh riêng.");
        },
      );

      const successfulUpdates = Object.fromEntries(result.updatedIds.map((id) => [
        id,
        {
          attendanceStatus: status,
          attendanceNote: noteBySessionId[id] ?? "",
        },
      ]));
      if (result.updatedIds.length > 0) {
        applyRegularStudentSessionUpdates(successfulUpdates);
        void queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0] as string;
            return typeof key === "string" && (
              key.includes("/student-sessions") ||
              key.includes("/all-student-sessions") ||
              key === "/api/my-space/calendar/staff" ||
              key === "/api/schedule" ||
              (key === "/api/my-space/calendar/staff/session" && query.queryKey[1] === classSessionId)
            );
          },
        });
      }

      if (result.failures.length > 0) {
        const failedSessionIds = new Set(result.failures.map((failure) => failure.id));
        const failedStudentIds = new Set(
          selectedRows
            .filter((row) => failedSessionIds.has(row.id))
            .map((row) => row.studentId),
        );
        setSelectedStudentIds((previous) =>
          previous.filter((studentId) => failedStudentIds.has(studentId)),
        );
        toast({
           title: t("mySpace.calendar.bulkAttendanceSaveFailed"),
          description: `${result.failures.length} học viên vẫn được giữ chọn để thử lại. ${result.failures[0]?.message ?? "Hãy thử lại."}`,
          variant: "destructive",
        });
        return;
      }

      setSelectedStudentIds([]);
      setIsBulkAttendanceOpen(false);
      setIsActionMenuOpen(false);
      toast({
         title: t("mySpace.calendar.bulkAttendanceSaved"),
         description: t("mySpace.calendar.toastBulkSavedDescription").replace("{count}", String(result.updatedIds.length)),
      });
    } catch (error: any) {
      toast({
         title: t("mySpace.calendar.completeAttendanceFailed"),
        description: error?.message || "Hãy thử lại. Các học viên vẫn được giữ chọn.",
        variant: "destructive",
      });
    } finally {
      setIsBulkAttendanceSaving(false);
    }
  }

  const removeStudentClassId = selectedStudentSessions[0]?.studentClassId ?? "";
  const removeStudentClassIds = Object.fromEntries(
    selectedStudentSessions
      .filter((ss: any) => ss.studentId && ss.studentClassId)
      .map((ss: any) => [ss.studentId, ss.studentClassId]),
  );

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="flex h-[calc(100vh-1rem)] max-h-[90vh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col gap-0 p-0 sm:h-auto sm:w-[95vw] sm:max-w-[95vw]">
          <DialogHeader className="flex-shrink-0 border-b px-4 py-3 sm:px-6 sm:py-4">
            <DialogTitle className="text-base font-bold text-foreground">
              {session.classCode} — {session.className}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 space-y-4 overflow-y-auto p-3 sm:space-y-5 sm:p-6">
            {/* Info panel */}
            <div className="rounded-xl border border-border bg-muted/30 p-3 sm:p-5">
              <div className="grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-2 sm:gap-x-10">
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">{t("mySpace.calendar.time")}</span>
                    <span className="font-medium text-foreground">
                      {isFreeSession
                        ? `Lịch linh hoạt · ${weekdayLabel} ${dateLabel}`
                        : `${session.startTime.slice(0, 5)} - ${session.endTime.slice(0, 5)} · ${weekdayLabel} ${dateLabel}`}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">{t("mySpace.calendar.location")}</span>
                    <span className="font-medium text-foreground">{session.locationName || "—"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">{t("mySpace.calendar.session")}</span>
                    <span className="font-medium text-foreground">
                      {isFreeSession
                        ? <span className="text-emerald-700">{t("mySpace.calendar.freeClass")}</span>
                        : session.sessionIndex != null
                          ? `${session.sessionIndex}/${session.totalSessions ?? "?"}`
                          : "—"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">{t("mySpace.calendar.room")}</span>
                    <span className="font-medium text-muted-foreground italic">{t("mySpace.calendar.empty")}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">{t("mySpace.calendar.teacher")}</span>
                    <span className="font-medium text-foreground">
                      {session.teacherNames.length > 0 ? session.teacherNames.join(", ") : "—"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">{t("mySpace.calendar.students")}</span>
                    <span className="font-medium text-foreground">{session.enrolledCount ?? 0}</span>
                  </div>
                  {!isFreeSession && <div className="flex gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">{t("mySpace.calendar.format")}</span>
                    <span className={cn("font-medium", (session.learningFormat === "online" || !!session.onlineLink) ? "text-blue-600" : "text-foreground")}>
                       {(session.learningFormat === "online" || !!session.onlineLink) ? t("mySpace.calendar.online") : t("mySpace.calendar.offline")}
                    </span>
                  </div>}
                </div>

                <div className="space-y-2">
                  {CONTENT_TYPE_LABELS.map(({ key, alts }) => {
                    const matched = (session.generalContents ?? []).filter((c) => alts.includes(c.type));
                    return (
                      <div key={key} className="flex gap-2">
                         <span className="text-muted-foreground w-28 shrink-0">
                           {key === "Bài học" ? t("mySpace.calendar.contentLesson")
                             : key === "Bài tập về nhà" ? t("mySpace.calendar.contentHomework")
                             : key === "Giáo trình" ? t("mySpace.calendar.contentCurriculum")
                             : t("mySpace.calendar.contentTest")}:
                         </span>
                        {matched.length > 0 ? (
                          <div className="flex flex-col gap-0.5 min-w-0">
                            {matched.map((c) => (
                              <button
                                key={c.id}
                                className="font-medium text-primary hover:underline text-left line-clamp-1 text-sm"
                                onClick={() => {
                                  setViewingContentId(c.resourceUrl || null);
                                  setViewingFallbackContent(c.resourceUrl ? null : {
                                    title: c.title,
                                    type: c.type,
                                    content: c.description,
                                  });
                                }}
                                data-testid={`btn-view-content-detail-${c.id}`}
                              >
                                {c.title}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">{t("mySpace.calendar.empty")}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Student list */}
            <div>
              <div className="mb-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                   {t("mySpace.calendar.students")}
                </h3>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                  {!isFreeSession && (
                    <>
                      <AddStudentToSessionDialog
                        open={isAddOpen}
                        onOpenChange={(open) => {
                          setIsAddOpen(open);
                          if (!open) {
                            setAddSearchTerm("");
                            setAddSelectedIds([]);
                          }
                        }}
                        searchTerm={addSearchTerm}
                        onSearchChange={setAddSearchTerm}
                        selectedIds={addSelectedIds}
                        onSelectionChange={setAddSelectedIds}
                        filteredCandidates={filteredCandidates}
                        allCandidates={enrolledCandidates}
                        isLoading={loadingAvailable}
                        classId={classId}
                        onConfirm={(students) => {
                          addStudentsMutation.mutate(students.map((s) => s.studentId));
                          setAddSelectedIds([]);
                          setAddSearchTerm("");
                        }}
                      />

                      <Popover open={isActionMenuOpen} onOpenChange={setIsActionMenuOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant={selectedStudentIds.length > 0 ? "default" : "outline"}
                            size="sm"
                            className={cn(
                              "h-7 px-2 text-[10px] gap-1",
                              selectedStudentIds.length > 0 && "bg-gray-700 hover:bg-gray-800 text-white"
                            )}
                            disabled={selectedStudentIds.length === 0}
                          >
                            {t("mySpace.calendar.actions")}
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 p-2 bg-white dark:bg-slate-950">
                          <div className="flex flex-col gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="justify-start text-xs h-8"
                              onClick={() => {
                                setIsActionMenuOpen(false);
                                setIsBulkAttendanceOpen(true);
                              }}
                            >
                               {t("mySpace.calendar.bulkAttendance")}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="justify-start text-xs h-8"
                              onClick={() => {
                                setIsActionMenuOpen(false);
                                setIsBulkReviewOpen(true);
                              }}
                            >
                               {t("mySpace.calendar.bulkReview")}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="justify-start text-xs h-8 text-destructive hover:text-destructive"
                              onClick={() => {
                                setIsActionMenuOpen(false);
                                setIsRemoveOpen(true);
                              }}
                            >
                               {t("mySpace.calendar.removeStudent")}
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </>
                  )}

                  {!isFreeSession && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[10px]"
                      data-testid="btn-add-content-detail"
                      onClick={() => setLibraryDialogOpen(true)}
                    >
                      <LibraryBig className="h-3 w-3 mr-1" />
                      {t("mySpace.calendar.addContent")}
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[10px]"
                    data-testid="btn-assign-content-detail"
                    onClick={() => setContentDialogOpen(true)}
                  >
                    {t("mySpace.calendar.assignContent")}
                  </Button>
                </div>
              </div>

              {loadingStudents ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : studentSessions.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground">
                  {t("mySpace.calendar.noStudentsToAdd")}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[680px] table-fixed text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="px-3 py-2.5 w-[5%] text-center">
                          <Checkbox
                            checked={
                              studentSessions.length > 0 &&
                              selectedStudentIds.length === studentSessions.length
                            }
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedStudentIds(studentSessions.map((ss: any) => ss.studentId));
                                setIsActionMenuOpen(true);
                              } else {
                                setSelectedStudentIds([]);
                                setIsActionMenuOpen(false);
                              }
                            }}
                          />
                        </th>
                        <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs w-[25%]">{t("mySpace.calendar.studentName")}</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs w-[25%]">{t("mySpace.calendar.studentAttendance")}</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs w-[25%]">{t("mySpace.calendar.note")}</th>
                        <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs w-[20%]">{t("mySpace.calendar.studentReview")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {studentSessions.map((ss: any) => {
                        if (isFreeSession) {
                          const freeStatus = ss.attendanceStatus === "attended" || ss.attendanceStatus === "reserved"
                            ? ss.attendanceStatus
                            : "registered";
                          const freeStatusLabel = freeStatus === "attended"
                            ? t("mySpace.calendar.attendancePresent")
                            : freeStatus === "reserved"
                              ? t("mySpace.calendar.attendancePaused")
                              : t("mySpace.calendar.attendancePending");
                          const freeStatusClass = freeStatus === "attended"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : freeStatus === "reserved"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-border/60 text-muted-foreground";
                          const freeStudent = freeStudentRows.find(
                            (student) => student.registrationId === ss.registrationId,
                          );
                          const hasReview = ss.reviewData &&
                            (Array.isArray(ss.reviewData)
                              ? ss.reviewData.length > 0
                              : Object.keys(ss.reviewData).length > 0);

                          return (
                            <tr key={ss.id} className="hover:bg-muted/20 transition-colors">
                              <td className="px-3 py-3 text-center">
                                <Checkbox
                                  checked={selectedStudentIds.includes(ss.studentId)}
                                  onCheckedChange={(checked) => {
                                    const newIds = checked
                                      ? [...selectedStudentIds, ss.studentId]
                                      : selectedStudentIds.filter((id) => id !== ss.studentId);
                                    setSelectedStudentIds(newIds);
                                  }}
                                  aria-label={`Chọn học viên ${ss.student?.fullName || ""}`}
                                />
                              </td>
                              <td className="px-4 py-3">
                                <div>
                                  <p className="font-medium text-foreground">{ss.student?.fullName || "—"}</p>
                                  <p className="text-xs text-muted-foreground">{ss.student?.code}</p>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <Select
                                  value={freeStatus}
                                  disabled={updateFreeAttendanceMutation.isPending}
                                  onValueChange={(value) => {
                                    updateFreeAttendanceMutation.mutate({
                                      studentClassId: ss.studentClassId,
                                      status: value as "registered" | "attended" | "reserved",
                                      note: freeStudent?.note ?? ss.attendanceNote ?? "",
                                    });
                                  }}
                                >
                                  <SelectTrigger
                                    className={cn("h-7 text-xs", freeStatusClass)}
                                    data-testid={`attendance-select-${ss.id}`}
                                  >
                                    <SelectValue>{freeStatusLabel}</SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="registered">{t("mySpace.calendar.attendancePending")}</SelectItem>
                                    <SelectItem value="attended">{t("mySpace.calendar.attendancePresent")}</SelectItem>
                                    <SelectItem value="reserved">{t("mySpace.calendar.attendancePaused")}</SelectItem>
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="px-4 py-3">
                                <Input
                                  className="h-7 text-xs border-border/60 bg-transparent w-full"
                                  placeholder={t("mySpace.calendar.notePlaceholder")}
                                  value={freeStudent?.note ?? ""}
                                  onChange={(event) => {
                                    setFreeStudentRows((current) =>
                                      current.map((student) =>
                                        student.registrationId === ss.registrationId
                                          ? { ...student, note: event.target.value }
                                          : student,
                                      ),
                                    );
                                  }}
                                  onBlur={() => {
                                    const note = freeStudent?.note ?? "";
                                    updateFreeAttendanceMutation.mutate({
                                      studentClassId: ss.studentClassId,
                                      status: freeStatus,
                                      note,
                                    });
                                  }}
                                  data-testid={`note-input-${ss.id}`}
                                />
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  className={cn(
                                    "ml-auto flex items-center justify-end gap-1 transition-opacity hover:opacity-80",
                                    hasReview ? "text-amber-500" : "text-xs text-primary hover:underline",
                                  )}
                                  onClick={() => {
                                    setReviewTarget(ss);
                                    setIsReviewOpen(true);
                                  }}
                                  data-testid={`${hasReview ? "btn-review" : "btn-add-review"}-${ss.id}`}
                                >
                                  {hasReview ? (
                                    <>
                                      <Star className="h-3.5 w-3.5 fill-amber-400" />
                                       <span className="text-xs font-medium">{t("mySpace.calendar.reviewed")}</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-base leading-none">+</span>
                                       {t("mySpace.calendar.addReviewShort")}
                                    </>
                                  )}
                                </button>
                              </td>
                            </tr>
                          );
                        }

                        const opt = getAttendanceOption(ss.attendanceStatus);
                        const localNote = localNotes[ss.id] ?? ss.attendanceNote ?? "";
                        const hasReview = ss.reviewData &&
                          (Array.isArray(ss.reviewData)
                            ? ss.reviewData.length > 0
                            : Object.keys(ss.reviewData).length > 0);

                        return (
                          <tr key={ss.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-3 py-3 text-center">
                              <Checkbox
                                checked={selectedStudentIds.includes(ss.studentId)}
                                onCheckedChange={(checked) => {
                                  const newIds = checked
                                    ? [...selectedStudentIds, ss.studentId]
                                    : selectedStudentIds.filter((id) => id !== ss.studentId);
                                  setSelectedStudentIds(newIds);
                                  setIsActionMenuOpen(newIds.length > 0);
                                }}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div>
                                <p className="font-medium text-foreground">{ss.student?.fullName || "—"}</p>
                                <p className="text-xs text-muted-foreground">{ss.student?.code}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Select
                                value={ss.attendanceStatus || "pending"}
                                onValueChange={(val) => {
                                  updateAttendanceMutation.mutate({
                                    id: ss.id,
                                    status: val,
                                    note: localNote,
                                  });
                                }}
                              >
                                <SelectTrigger
                                  className={cn("h-7 text-xs border-border/60", opt.className)}
                                  data-testid={`attendance-select-${ss.id}`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                   {ATTENDANCE_OPTIONS.filter((o) => o.value !== "makeup_scheduled").map((o) => (
                                    <SelectItem key={o.value} value={o.value} className={cn("text-xs", o.className)}>
                                       {attendanceLabel(o.value)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-4 py-3">
                              <Input
                                className="h-7 text-xs border-border/60 bg-transparent w-full"
                                 placeholder={t("mySpace.calendar.notePlaceholder")}
                                value={localNote}
                                onChange={(e) => setLocalNotes((prev) => ({ ...prev, [ss.id]: e.target.value }))}
                                onBlur={() => {
                                  updateAttendanceMutation.mutate({
                                    id: ss.id,
                                    note: localNote,
                                  });
                                }}
                                data-testid={`note-input-${ss.id}`}
                              />
                            </td>
                            <td className="px-4 py-3 text-right">
                              {hasReview ? (
                                <button
                                  className="flex items-center justify-end gap-1 text-amber-500 ml-auto hover:opacity-80 transition-opacity"
                                  onClick={() => {
                                    setReviewTarget(ss);
                                    setIsReviewOpen(true);
                                  }}
                                  data-testid={`btn-review-${ss.id}`}
                                >
                                  <Star className="h-3.5 w-3.5 fill-amber-400" />
                                   <span className="text-xs font-medium">{t("mySpace.calendar.reviewed")}</span>
                                </button>
                              ) : (
                                <button
                                  className="text-xs text-primary hover:underline flex items-center gap-0.5 ml-auto"
                                  data-testid={`btn-add-review-${ss.id}`}
                                  onClick={() => {
                                    setReviewTarget(ss);
                                    setIsReviewOpen(true);
                                  }}
                                >
                                  <span className="text-base leading-none">+</span>
                                   {t("mySpace.calendar.addReviewShort")}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk attendance dialog */}
      <Dialog
        open={isBulkAttendanceOpen}
        onOpenChange={(open) => {
          if (!isBulkAttendanceSaving) setIsBulkAttendanceOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t("mySpace.calendar.actionBulkAttendance")}</DialogTitle>
            <DialogDescription>
              Chọn trạng thái điểm danh cho {selectedStudentIds.length} học viên được chọn
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {BULK_ATTENDANCE_OPTIONS.map(({ status, color }) => (
              <Button
                key={status}
                variant="outline"
                className={`w-full justify-start text-${color}-600 border-${color}-200 hover:bg-${color}-50 dark:hover:bg-${color}-950/30`}
                disabled={isBulkAttendanceSaving}
                onClick={() => void handleBulkAttendance(status)}
              >
                {isBulkAttendanceSaving ? t("mySpace.calendar.bulkAttendanceSaving") : attendanceLabel(status)}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove student dialog */}
      {isRemoveOpen && selectedStudentSessions.length > 0 && (
        <RemoveStudentFromSessionDialog
          isOpen={isRemoveOpen}
          onOpenChange={(open) => {
            setIsRemoveOpen(open);
            if (!open) setSelectedStudentIds([]);
          }}
          studentIds={selectedStudentSessions.map((ss: any) => ss.studentId)}
          studentClassId={removeStudentClassId}
          studentClassIds={removeStudentClassIds}
          fromSessionOrder={session.sessionIndex ?? 1}
          toSessionOrder={session.sessionIndex ?? 1}
          classId={classId}
        />
      )}

      {/* Review dialog */}
      {reviewTarget && (
        <ReviewDialog
          open={isReviewOpen}
          onOpenChange={(open) => {
            setIsReviewOpen(open);
            if (!open) setReviewTarget(null);
          }}
          studentSessionIds={isFreeSession ? [] : [reviewTarget.id]}
          studentNames={[reviewTarget.student?.fullName || "Học viên"]}
          criteria={sessionCriteria}
          teachers={sessionTeachers}
          existingReviewData={
            reviewTarget.reviewData && typeof reviewTarget.reviewData === "object" && !Array.isArray(reviewTarget.reviewData)
              ? reviewTarget.reviewData
              : null
          }
          existingPublished={reviewTarget.reviewPublished ?? false}
          classSessionId={isFreeSession ? "" : classSessionId}
          freeReview={isFreeSession ? {
            classId,
            registrationId: reviewTarget.registrationId,
          } : undefined}
          onSaved={(reviewData, published) => {
            if (isFreeSession) {
              setFreeStudentRows((current) => current.map((student) =>
                student.registrationId === reviewTarget.registrationId
                  ? { ...student, reviewData, reviewPublished: published }
                  : student,
              ));
              queryClient.setQueryData<MyCalendarSession>(
                ["/api/my-space/calendar/staff/session", classSessionId],
                (cached) => cached
                  ? {
                      ...cached,
                      freeStudents: (cached.freeStudents ?? []).map((student) =>
                        student.registrationId === reviewTarget.registrationId
                          ? { ...student, reviewData, reviewPublished: published }
                          : student,
                      ),
                    }
                  : cached,
              );
            } else {
              applyRegularStudentSessionUpdates({
                [reviewTarget.id]: { reviewData, reviewPublished: published },
              });
            }
            setReviewTarget((current: any) => current
              ? { ...current, reviewData, reviewPublished: published }
              : current);
          }}
        />
      )}

      {/* Bulk review dialog */}
      {isBulkReviewOpen && selectedStudentSessions.length > 0 && (
        <ReviewDialog
          open={isBulkReviewOpen}
          onOpenChange={(open) => {
            setIsBulkReviewOpen(open);
            if (!open) setIsActionMenuOpen(false);
          }}
          studentSessionIds={selectedStudentSessions.map((ss: any) => ss.id)}
          studentNames={selectedStudentSessions.map((ss: any) => ss.student?.fullName || "Học viên")}
          criteria={sessionCriteria}
          teachers={sessionTeachers}
          classSessionId={classSessionId}
        />
      )}

      <SessionContentDialog
        isOpen={contentDialogOpen}
        onOpenChange={setContentDialogOpen}
        classSessionId={classSessionId}
        freeClassId={session.isFreeSession ? classId : undefined}
        freeSessionDate={session.isFreeSession ? session.sessionDate : undefined}
        freeStudents={session.isFreeSession
          ? (session.freeStudents ?? []).map((student) => ({
              id: student.studentId,
              name: student.fullName,
              code: student.code,
            }))
          : undefined}
      />

      <LibraryContentDialog
        open={libraryDialogOpen}
        onOpenChange={setLibraryDialogOpen}
      />

      <ContentViewDialog
        isOpen={!!viewingContentId || !!viewingFallbackContent}
        onOpenChange={(open) => {
          if (!open) {
            setViewingContentId(null);
            setViewingFallbackContent(null);
          }
        }}
        contentId={viewingContentId}
        fallbackContent={viewingFallbackContent}
      />
    </>
  );
}
