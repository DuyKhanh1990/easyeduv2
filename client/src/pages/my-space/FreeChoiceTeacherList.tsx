import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/hooks/use-language";

type TrainingTeacher = {
  id: string;
  fullName: string;
  code: string;
  avatarUrl: string | null;
  roleNames: string[];
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
    <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-primary/10 sm:h-28 sm:w-28">
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
      [teacher.fullName, teacher.code, ...teacher.roleNames]
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
          {filteredTeachers.map((teacher) => (
            <article
              key={teacher.id}
              className="flex min-h-40 gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <TeacherAvatar teacher={teacher} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold text-foreground">
                  {teacher.fullName}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("mySpace.calendar.staffCode")}: {teacher.code}
                </p>
                {teacher.roleNames.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {teacher.roleNames.map((role) => (
                      <span
                        key={role}
                        className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
