import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BriefcaseBusiness, CalendarDays, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/hooks/use-language";

type TeacherProfile = {
  experienceValue: number | null;
  experienceUnit: "year" | "month" | null;
  teachingExperience: string;
};

type TrainingTeacher = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  teacherProfile: TeacherProfile | null;
  teachingSubjects?: string[];
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
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const { data, isLoading, isError } = useQuery<TeacherDirectoryResponse>({
    queryKey: ["/api/my-space/schedule-registration/teachers"],
    queryFn: async () => {
      const response = await fetch("/api/my-space/schedule-registration/teachers", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Không thể tải danh sách giáo viên");
      return response.json();
    },
  });

  const teachers = data?.teachers ?? [];
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

  return (
    <div className="space-y-4">
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
        {!isLoading && !isError && (
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
          {t("mySpace.calendar.teacherLoadError")}
        </div>
      )}

      {!isLoading && !isError && filteredTeachers.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card px-5 py-12 text-center text-muted-foreground">
          <Users className="h-9 w-9 opacity-40" />
          <p className="text-sm">
            {teachers.length === 0
              ? t("mySpace.calendar.noTrainingTeachers")
              : t("mySpace.calendar.noMatchingTeachers")}
          </p>
        </div>
      )}

      {!isLoading && !isError && filteredTeachers.length > 0 && (
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
                    disabled
                    className="whitespace-nowrap text-primary"
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
                      disabled
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
    </div>
  );
}
