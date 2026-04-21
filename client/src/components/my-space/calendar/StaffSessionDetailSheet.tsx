import { useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { Users, Loader2, Star, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SessionContentDialog } from "@/components/education/SessionContentDialog";
import { AddStudentToSessionDialog } from "@/components/education/AddStudentToSessionDialog";
import { ReviewDialog } from "@/components/education/ReviewDialog";
import { RemoveStudentFromSessionDialog } from "@/components/education/RemoveStudentFromSessionDialog";

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
  const { toast } = useToast();
  const [contentDialogOpen, setContentDialogOpen] = useState(false);
  const [localNotes, setLocalNotes] = useState<Record<string, string>>({});

  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isBulkAttendanceOpen, setIsBulkAttendanceOpen] = useState(false);
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);
  const [isBulkReviewOpen, setIsBulkReviewOpen] = useState(false);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addSearchTerm, setAddSearchTerm] = useState("");
  const [addSelectedIds, setAddSelectedIds] = useState<string[]>([]);

  const [reviewTarget, setReviewTarget] = useState<any>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [viewContent, setViewContent] = useState<{ title: string; type: string; description: string | null } | null>(null);

  const isOpen = !!session;
  const classSessionId = session?.classSessionId ?? "";
  const classId = session?.classId ?? "";

  const studentSessionsKey = `/api/class-sessions/${classSessionId}/student-sessions`;

  const { data: studentSessions = [], isLoading: loadingStudents } = useQuery<any[]>({
    queryKey: [studentSessionsKey],
    enabled: isOpen && !!classSessionId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: availableStudents = [], isLoading: loadingAvailable } = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/available-students`],
    enabled: isAddOpen && !!classId,
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
      toast({ title: "Đã thêm học viên vào buổi học" });
    },
    onError: () => {
      toast({ title: "Lỗi", description: "Không thể thêm học viên", variant: "destructive" });
    },
  });

  const updateAttendanceMutation = useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: string; note: string }) => {
      return apiRequest("PATCH", `/api/student-sessions/${id}/attendance`, { status, note });
    },
    onSuccess: () => {
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
    onError: () => {
      toast({ title: "Lỗi", description: "Không thể cập nhật điểm danh", variant: "destructive" });
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
  const removeStudentClassId = selectedStudentSessions[0]?.studentClassId ?? "";

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
            <DialogTitle className="text-base font-bold text-foreground">
              {session.classCode} — {session.className}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Info panel */}
            <div className="rounded-xl border border-border bg-muted/30 p-5">
              <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm">
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">Thời gian:</span>
                    <span className="font-medium text-foreground">
                      {session.startTime} - {session.endTime} · {weekdayLabel} {dateLabel}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">Cơ sở:</span>
                    <span className="font-medium text-foreground">{session.locationName || "—"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">Buổi học:</span>
                    <span className="font-medium text-foreground">
                      {session.sessionIndex != null ? `${session.sessionIndex}/${session.totalSessions ?? "?"}` : "—"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">Phòng học:</span>
                    <span className="font-medium text-muted-foreground italic">Trống</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">Giáo viên:</span>
                    <span className="font-medium text-foreground">
                      {session.teacherNames.length > 0 ? session.teacherNames.join(", ") : "—"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">Học viên:</span>
                    <span className="font-medium text-foreground">{session.enrolledCount ?? 0}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">Hình thức:</span>
                    <span className={cn("font-medium", session.learningFormat === "online" ? "text-blue-600" : "text-foreground")}>
                      {session.learningFormat === "online" ? "Online" : "Offline"}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {CONTENT_TYPE_LABELS.map(({ key, alts }) => {
                    const matched = (session.generalContents ?? []).filter((c) => alts.includes(c.type));
                    return (
                      <div key={key} className="flex gap-2">
                        <span className="text-muted-foreground w-28 shrink-0">{key}:</span>
                        {matched.length > 0 ? (
                          <div className="flex flex-col gap-0.5 min-w-0">
                            {matched.map((c) => (
                              <button
                                key={c.id}
                                className="font-medium text-primary hover:underline text-left line-clamp-1 text-sm"
                                onClick={() => setViewContent({ title: c.title, type: c.type, description: c.description })}
                                data-testid={`btn-view-content-detail-${c.id}`}
                              >
                                {c.title}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">Trống</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Student list */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Danh sách học viên buổi
                </h3>
                <div className="flex items-center gap-2">
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
                        Hành động
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
                          Điểm danh hàng loạt
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
                          Nhận xét hàng loạt
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
                          Xóa học viên
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[10px]"
                    data-testid="btn-assign-content-detail"
                    onClick={() => setContentDialogOpen(true)}
                  >
                    Giao nội dung
                  </Button>
                </div>
              </div>

              {loadingStudents ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : studentSessions.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground">
                  Chưa có học viên trong buổi học này
                </div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm table-fixed">
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
                        <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs w-[25%]">Tên học viên</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs w-[25%]">Điểm danh</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs w-[25%]">Ghi chú</th>
                        <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs w-[20%]">Nhận xét</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {studentSessions.map((ss: any) => {
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
                                  {ATTENDANCE_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value} className={cn("text-xs", o.className)}>
                                      {o.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-4 py-3">
                              <Input
                                className="h-7 text-xs border-border/60 bg-transparent w-full"
                                placeholder="Ghi chú..."
                                value={localNote}
                                onChange={(e) => setLocalNotes((prev) => ({ ...prev, [ss.id]: e.target.value }))}
                                onBlur={() => {
                                  updateAttendanceMutation.mutate({
                                    id: ss.id,
                                    status: ss.attendanceStatus || "pending",
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
                                  <span className="text-xs font-medium">Đã nhận xét</span>
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
                                  Thêm
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
      <Dialog open={isBulkAttendanceOpen} onOpenChange={setIsBulkAttendanceOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Điểm danh hàng loạt</DialogTitle>
            <DialogDescription>
              Chọn trạng thái điểm danh cho {selectedStudentIds.length} học viên được chọn
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {BULK_ATTENDANCE_OPTIONS.map(({ status, label, color }) => (
              <Button
                key={status}
                variant="outline"
                className={`w-full justify-start text-${color}-600 border-${color}-200 hover:bg-${color}-50 dark:hover:bg-${color}-950/30`}
                onClick={() => {
                  selectedStudentIds.forEach((studentId) => {
                    const ss = studentSessions.find((s: any) => s.studentId === studentId);
                    if (ss) {
                      updateAttendanceMutation.mutate({
                        id: ss.id,
                        status,
                        note: localNotes[ss.id] ?? ss.attendanceNote ?? "",
                      });
                    }
                  });
                  setIsBulkAttendanceOpen(false);
                  setIsActionMenuOpen(false);
                }}
              >
                {label}
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
          studentSessionIds={[reviewTarget.id]}
          studentNames={[reviewTarget.student?.fullName || "Học viên"]}
          criteria={sessionCriteria}
          teachers={sessionTeachers}
          existingReviewData={
            reviewTarget.reviewData && typeof reviewTarget.reviewData === "object" && !Array.isArray(reviewTarget.reviewData)
              ? reviewTarget.reviewData
              : null
          }
          existingPublished={reviewTarget.reviewPublished ?? false}
          classSessionId={classSessionId}
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
      />

      {/* Content view dialog */}
      <Dialog open={!!viewContent} onOpenChange={(open) => !open && setViewContent(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">{viewContent?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {viewContent?.type && (
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                {viewContent.type}
              </p>
            )}
            {viewContent?.description ? (
              <p className="text-foreground whitespace-pre-wrap">{viewContent.description}</p>
            ) : (
              <p className="text-muted-foreground italic">Không có mô tả</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
