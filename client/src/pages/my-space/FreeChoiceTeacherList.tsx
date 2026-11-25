import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BriefcaseBusiness, CalendarDays, Search, Users } from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/hooks/use-language";
import { TeacherBookingDialog } from "@/components/my-space/TeacherBookingDialog";

type TeacherProfile = {
  experienceValue: number | null;
  experienceUnit: "year" | "month" | null;
  teachingExperience: string;
  certificates?: string;
  achievements?: string;
};

type TrainingTeacher = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  teacherProfile: TeacherProfile | null;
  teachingSubjects?: string[];
};

type RegistrationStudent = {
  id: string;
  fullName: string;
  code: string;
  locations: { id: string; name: string }[];
};

type RegistrationStudentsResponse = {
  isParent: boolean;
  students: RegistrationStudent[];
};

type TeacherDirectoryResponse = {
  teachers: TrainingTeacher[];
};

function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0] ?? "")
    .join("")
    .toLocaleUpperCase("vi");
}

function TeacherAvatar({ teacher }: { teacher: TrainingTeacher }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className="h-full w-full overflow-hidden rounded-xl bg-primary/10">
      {teacher.avatarUrl && !imageFailed ? (
        <img
          src={teacher.avatarUrl}
          alt={`Ảnh ${teacher.fullName}`}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xl font-semibold text-primary">
          {initials(teacher.fullName)}
        </div>
      )}
    </div>
  );
}

export function FreeChoiceTeacherList() {
  const { t, lang } = useLanguage();
  const isEnglish = lang === "en";
  const currentSearch = useSearch();
  const [, setLocation] = useLocation();
  const routeParams = new URLSearchParams(currentSearch);
  const preservedSearch = routeParams.get("search") ?? "";
  const requestedStudentId = routeParams.get("studentId") ?? "";
  const [selectedStudentId, setSelectedStudentId] = useState(requestedStudentId);
  const [search, setSearch] = useState(preservedSearch);
  const [bookingTeacher, setBookingTeacher] = useState<TrainingTeacher | null>(null);
  const studentsQuery = useQuery<RegistrationStudentsResponse>({
    queryKey: ["/api/my-space/schedule-registration/students"],
    queryFn: async () => {
      const response = await fetch("/api/my-space/schedule-registration/students", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Không thể tải danh sách học viên");
      return response.json();
    },
  });
  const students = studentsQuery.data?.students ?? [];

  useEffect(() => {
    if (requestedStudentId) {
      setSelectedStudentId(students.some((student) => student.id === requestedStudentId) ? requestedStudentId : "");
    } else if (students.length === 1) {
      setSelectedStudentId(students[0].id);
    } else {
      setSelectedStudentId("");
    }
  }, [requestedStudentId, students]);

  const teachersQuery = useQuery<TeacherDirectoryResponse>({
    queryKey: ["/api/my-space/schedule-registration/teachers", selectedStudentId],
    enabled: Boolean(selectedStudentId),
    queryFn: async () => {
      const params = new URLSearchParams({ studentId: selectedStudentId });
      const response = await fetch(`/api/my-space/schedule-registration/teachers?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Không thể tải danh sách giáo viên");
      return response.json();
    },
  });

  const selectedStudent = students.find((student) => student.id === selectedStudentId);
  const teachers = selectedStudentId ? teachersQuery.data?.teachers ?? [] : [];
  const isLoading = studentsQuery.isLoading || (Boolean(selectedStudentId) && teachersQuery.isLoading);
  const isError = studentsQuery.isError || (Boolean(selectedStudentId) && teachersQuery.isError);
  const filteredTeachers = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");
    if (!keyword) return teachers;
    return teachers.filter((teacher) =>
      [teacher.fullName, ...(teacher.teachingSubjects ?? [])]
        .concat([
          teacher.teacherProfile?.teachingExperience ?? "",
        ])
        .some((value) => value.toLocaleLowerCase("vi").includes(keyword))
    );
  }, [search, teachers]);

  const selectStudent = (studentId: string) => {
    setSelectedStudentId(studentId);
    const params = new URLSearchParams(currentSearch);
    params.set("tab", "schedule-registration");
    params.set("studentId", studentId);
    if (search.trim()) params.set("search", search.trim());
    else params.delete("search");
    setLocation(`/my-space/calendar?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      {!studentsQuery.isLoading && !studentsQuery.isError && students.length === 0 && (
        <div role="alert" className="rounded-xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
          {isEnglish ? "This account has no student profile for schedule registration." : "Tài khoản chưa có hồ sơ học viên để đăng ký lịch."}
        </div>
      )}
      {students.length > 1 && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:max-w-md">
          <label htmlFor="schedule-registration-student" className="text-sm font-medium text-foreground">
            {isEnglish ? "Choose a student" : "Chọn học viên"}
          </label>
          <Select value={selectedStudentId} onValueChange={selectStudent}>
            <SelectTrigger id="schedule-registration-student" className="min-h-11">
              <SelectValue placeholder={isEnglish ? "Choose a student for registration" : "Chọn học viên cần đăng ký lịch"} />
            </SelectTrigger>
            <SelectContent>
              {students.map((student) => (
                <SelectItem key={student.id} value={student.id}>
                  {student.fullName}{student.code ? ` · ${student.code}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedStudent && (
            <p className="text-xs text-muted-foreground">
              {isEnglish ? "Teachers below are filtered by this student's center." : "Giáo viên bên dưới được lọc theo cơ sở của học viên này."}
            </p>
          )}
        </div>
      )}
      {!studentsQuery.isLoading && !studentsQuery.isError && students.length > 1 && !selectedStudentId && (
        <div className="rounded-xl border border-dashed border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
          {isEnglish ? "Choose a student to see teachers at the same center." : "Chọn học viên để xem giáo viên cùng cơ sở."}
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="free-choice-teacher-search" className="sr-only">
            {t("mySpace.calendar.teacherSearch")}
          </label>
          <Input
            id="free-choice-teacher-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("mySpace.calendar.teacherSearch")}
            className="pl-9"
          />
        </div>
        {!isLoading && !isError && selectedStudentId && (
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{filteredTeachers.length}</span>{" "}
            {t("mySpace.calendar.teacherCount")}
          </p>
        )}
      </div>

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="flex min-h-40 animate-pulse gap-4 rounded-2xl border border-border bg-card p-4"
            >
              <div className="h-24 w-24 shrink-0 rounded-xl bg-secondary sm:h-28 sm:w-28" />
              <div className="flex-1 space-y-3 pt-2">
                <div className="h-4 w-3/4 rounded bg-secondary" />
                <div className="h-3 w-1/2 rounded bg-secondary" />
                <div className="h-6 w-2/3 rounded-full bg-secondary" />
              </div>
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          {studentsQuery.isError
            ? (isEnglish ? "Unable to load students." : "Không thể tải danh sách học viên.")
            : t("mySpace.calendar.teacherLoadError")}
        </div>
      )}

      {!isLoading && !isError && selectedStudentId && filteredTeachers.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card px-5 py-12 text-center text-muted-foreground">
          <Users className="h-9 w-9 opacity-40" />
          <p className="text-sm">
            {teachers.length === 0
              ? t("mySpace.calendar.noTrainingTeachers")
              : t("mySpace.calendar.noMatchingTeachers")}
          </p>
        </div>
      )}

      {!isLoading && !isError && selectedStudent && filteredTeachers.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredTeachers.map((teacher) => {
            const profile = teacher.teacherProfile;
            const teachingExperience = profile?.teachingExperience?.trim() ?? "";

            return (
              <article
                key={teacher.id}
                className="flex min-h-64 flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex min-w-0 gap-4">
                  <div className="w-[42%] max-w-[180px] shrink-0 self-start">
                    <div className="aspect-[3/4]">
                      <TeacherAvatar teacher={teacher} />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 pt-1">
                    <h2 className="line-clamp-2 text-lg font-semibold leading-tight text-foreground">
                      {teacher.fullName}
                    </h2>
                    {(teacher.teachingSubjects ?? []).length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {teacher.teachingSubjects?.map((subject) => (
                          <span
                            key={subject}
                            className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                          >
                            {subject}
                          </span>
                        ))}
                      </div>
                    )}
                    {profile?.experienceValue !== null
                      && profile?.experienceValue !== undefined
                      && (
                        <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <BriefcaseBusiness className="h-4 w-4 shrink-0 text-primary" />
                          {profile.experienceValue}{" "}
                          {profile.experienceUnit === "month"
                            ? t("mySpace.calendar.experienceMonths")
                            : t("mySpace.calendar.experienceYears")}
                        </p>
                      )}
                    {teachingExperience && (
                      <p className="mt-3 line-clamp-3 text-sm leading-5 text-muted-foreground">
                        {teachingExperience}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const params = new URLSearchParams();
                      params.set("teacher", teacher.id);
                      params.set("tab", "schedule-registration");
                      params.set("studentId", selectedStudent.id);
                      if (search) params.set("search", search);
                      setLocation(`/my-space/calendar?${params.toString()}`);
                    }}
                    className="whitespace-nowrap text-primary transition-colors hover:bg-primary/10"
                    aria-label={`${t("mySpace.calendar.viewProfile")}: ${teacher.fullName}`}
                  >
                    {t("mySpace.calendar.viewProfile")}
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {t("mySpace.calendar.comingSoon")}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setBookingTeacher(teacher)}
                      className="whitespace-nowrap"
                    >
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {t("mySpace.calendar.registerStudy")}
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {selectedStudent && bookingTeacher && (
        <TeacherBookingDialog
          open={Boolean(bookingTeacher)}
          onOpenChange={(open) => { if (!open) setBookingTeacher(null); }}
          teacher={{
            id: bookingTeacher.id,
            fullName: bookingTeacher.fullName,
            avatarUrl: bookingTeacher.avatarUrl,
            teachingSubjects: bookingTeacher.teachingSubjects ?? [],
          }}
          student={selectedStudent}
        />
      )}
    </div>
  );
}
