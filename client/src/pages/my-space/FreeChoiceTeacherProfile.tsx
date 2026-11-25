import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Award,
  BookOpenText,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  GraduationCap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";

type TeacherProfile = {
  experienceValue: number | null;
  experienceUnit: "year" | "month" | null;
  teachingExperience: string;
  certificates: string;
  achievements: string;
};

type TrainingTeacher = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  teachingSubjects: string[];
  teacherProfile: TeacherProfile | null;
};

type TeacherDirectoryResponse = { teachers: TrainingTeacher[] };

function getInitials(fullName: string) {
  return fullName.trim().split(/\s+/).slice(-2).map((part) => part[0] ?? "").join("").toLocaleUpperCase("vi");
}

function withoutRatingMetrics(content: string | null | undefined): string {
  const ratingMetricLine = /(?:\d+(?:[.,]\d+)?\s*%|\d+(?:[.,]\d+)?\s*\/\s*5|[★☆⭐]|\b\d+(?:[.,]\d+)?\s*k?\s*(?:đánh giá|reviews?)\b)/i;
  return (content ?? "")
    .split(/\r?\n/)
    .filter((line) => !ratingMetricLine.test(line))
    .join("\n")
    .trim();
}

function TeacherPortrait({ teacher }: { teacher: TrainingTeacher }) {
  const [imageFailed, setImageFailed] = useState(false);
  return teacher.avatarUrl && !imageFailed ? (
    <img
      src={teacher.avatarUrl}
      alt={`Ảnh ${teacher.fullName}`}
      className="h-full w-full object-cover"
      onError={() => setImageFailed(true)}
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-[#dcece8] font-display text-5xl font-semibold tracking-tight text-[#245e58] sm:text-6xl">
      {getInitials(teacher.fullName)}
    </div>
  );
}

function ProfileSection({
  title,
  icon: Icon,
  content,
}: {
  title: string;
  icon: typeof GraduationCap;
  content: string;
}) {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  return (
    <section className="rounded-2xl border border-[#dce8e4] bg-[#fffefa] p-5 sm:p-7">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f2ed] text-[#28665d]">
          <Icon className="h-5 w-5" />
        </span>
        <h2 className="font-display text-lg font-semibold text-[#203c38]">{title}</h2>
      </div>
      <ul className="space-y-3.5">
        {lines.map((line, index) => (
          <li key={`${index}-${line}`} className="flex items-start gap-3 text-sm leading-6 text-[#526762] sm:text-[15px]">
            <Check className="mt-1 h-4 w-4 shrink-0 text-[#4d9181]" strokeWidth={2.5} />
            <span className="whitespace-pre-wrap break-words">{line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <main className="mx-auto min-h-[60vh] w-full max-w-6xl animate-pulse px-4 py-6 sm:px-7 sm:py-10">
      <div className="mb-7 h-5 w-36 rounded bg-[#dce8e4]" />
      <div className="grid gap-5 md:grid-cols-[minmax(0,7fr)_minmax(0,13fr)]">
        <div className="rounded-[26px] border border-[#dce8e4] bg-[#eaf3ef] p-5 sm:p-7">
          <div className="mx-auto mb-6 aspect-[4/3] max-w-xs rounded-[22px] bg-[#dce9e4] md:aspect-[4/5]" />
          <div className="space-y-4">
            <div className="h-7 w-4/5 rounded bg-[#dce9e4]" />
            <div className="h-4 w-2/3 rounded bg-[#dce9e4]" />
            <div className="h-8 w-1/2 rounded-full bg-[#dce9e4]" />
          </div>
        </div>
        <div className="space-y-4 rounded-[26px] border border-[#dce8e4] bg-[#fffefa] p-5 sm:p-8">
          <div className="h-32 rounded-2xl bg-[#eaf1ed]" />
          <div className="h-32 rounded-2xl bg-[#eaf1ed]" />
          <div className="h-32 rounded-2xl bg-[#eaf1ed]" />
          </div>
      </div>
    </main>
  );
}

export function FreeChoiceTeacherProfile({
  teacherId,
  search,
}: {
  teacherId: string;
  search: string;
}) {
  const { lang } = useLanguage();
  const [, setLocation] = useLocation();
  const isEnglish = lang === "en";
  const { data, isLoading, isError, refetch } = useQuery<TeacherDirectoryResponse>({
    queryKey: ["/api/my-space/schedule-registration/teachers"],
    queryFn: async () => {
      const response = await fetch("/api/my-space/schedule-registration/teachers", { credentials: "include" });
      if (!response.ok) throw new Error("Unable to load teacher profile");
      return response.json();
    },
  });

  const teacher = data?.teachers?.find((item) => item.id === teacherId);
  const profile = teacher?.teacherProfile;
  const teachingExperience = withoutRatingMetrics(profile?.teachingExperience);
  const certificates = withoutRatingMetrics(profile?.certificates);
  const achievements = withoutRatingMetrics(profile?.achievements);
  const returnToList = () => {
    const params = new URLSearchParams();
    params.set("tab", "schedule-registration");
    if (search) params.set("search", search);
    setLocation(`/my-space/calendar?${params.toString()}`);
  };

  if (isLoading) return <ProfileSkeleton />;
  if (isError || !teacher) {
    return (
      <main className="mx-auto flex min-h-[60vh] w-full max-w-5xl flex-col items-start justify-center px-4 py-10 sm:px-7">
        <Button variant="ghost" className="mb-6 -ml-3 gap-2 text-[#326b62]" onClick={returnToList}>
          <ArrowLeft className="h-4 w-4" /> {isEnglish ? "Back to teachers" : "Quay lại danh sách"}
        </Button>
        <section role="alert" className="w-full rounded-2xl border border-[#ead9ce] bg-[#fff8f2] p-6">
          <h1 className="font-display text-xl font-semibold text-[#583f33]">
            {isEnglish ? "This profile is unavailable" : "Hồ sơ hiện chưa thể hiển thị"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#79665c]">
            {isEnglish ? "Please try again, or return to the teacher list." : "Vui lòng thử lại hoặc quay về danh sách giáo viên."}
          </p>
          {isError && <Button variant="outline" className="mt-4" onClick={() => refetch()}>{isEnglish ? "Try again" : "Thử lại"}</Button>}
        </section>
      </main>
    );
  }

  const experience = profile?.experienceValue != null
    ? `${profile.experienceValue} ${profile.experienceUnit === "month"
      ? (isEnglish ? "months of experience" : "tháng kinh nghiệm")
      : (isEnglish ? "years of experience" : "năm kinh nghiệm")}`
    : "";

  return (
    <main className="mx-auto min-h-[70vh] w-full max-w-6xl px-4 pb-12 pt-5 sm:px-7 sm:pb-16 sm:pt-8">
      <button
        type="button"
        onClick={returnToList}
        className="group mb-5 inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-medium text-[#47726a] transition-colors hover:bg-[#e8f2ed] hover:text-[#204f49] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5f9b8f]"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        {isEnglish ? "Back to teachers" : "Quay lại danh sách"}
      </button>

      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,7fr)_minmax(0,13fr)]">
        <aside className="overflow-hidden rounded-[26px] border border-[#d5e4de] bg-[#eaf3ef] shadow-[0_16px_50px_-36px_rgba(31,79,70,0.38)]">
          <div className="p-4 sm:p-6">
            <div className="mx-auto aspect-[4/3] max-w-sm overflow-hidden rounded-[22px] border-4 border-[#fffefa] bg-[#dcece8] shadow-[0_12px_26px_-14px_rgba(29,76,68,0.38)] md:aspect-[4/5]">
              <TeacherPortrait teacher={teacher} />
            </div>
            <div className="px-1 pb-2 pt-6 sm:px-2 sm:pt-7">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5b8279]">
                {isEnglish ? "Teacher profile" : "Hồ sơ giáo viên"}
              </p>
              <h1 className="break-words font-display text-2xl font-semibold leading-tight tracking-[-0.035em] text-[#1e3935] sm:text-3xl">
                {teacher.fullName}
              </h1>
              {teacher.teachingSubjects.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {teacher.teachingSubjects.map((subject) => (
                    <span key={subject} className="rounded-full border border-[#c8ddd5] bg-[#f8fbf8] px-3 py-1.5 text-xs font-medium text-[#32685f] sm:text-sm">
                      {subject}
                    </span>
                  ))}
                </div>
              )}
              {experience && (
                <div className="mt-5 flex items-start gap-2 border-t border-[#d4e3dd] pt-4 text-sm font-medium leading-6 text-[#45655e]">
                  <BriefcaseBusiness className="mt-1 h-4 w-4 shrink-0 text-[#51887c]" />
                  <span>{experience}</span>
                </div>
              )}
            </div>
          </div>
        </aside>

        <div className="min-w-0 space-y-5 rounded-[26px] border border-[#dce8e4] bg-[#fffefa] p-4 shadow-[0_16px_50px_-36px_rgba(31,79,70,0.32)] sm:space-y-6 sm:p-6 lg:p-7">
          <div className="border-b border-[#e4ebe7] pb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64847c]">
              {isEnglish ? "Professional background" : "Thông tin chuyên môn"}
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-[#203c38] sm:text-2xl">
              {isEnglish ? "Experience & accomplishments" : "Kinh nghiệm & thành tích"}
            </h2>
          </div>

          {teachingExperience || certificates || achievements ? (
            <div className="space-y-5 sm:space-y-6">
              <ProfileSection title={isEnglish ? "Teaching experience" : "Kinh nghiệm giảng dạy"} icon={GraduationCap} content={teachingExperience} />
              <ProfileSection title={isEnglish ? "Certificates & qualifications" : "Bằng cấp & chứng chỉ"} icon={Award} content={certificates} />
              <ProfileSection title={isEnglish ? "Achievements" : "Thành tích"} icon={Check} content={achievements} />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#d5e4de] bg-[#f7faf8] px-5 py-10 text-center">
              <p className="text-sm font-medium text-[#45655e]">
                {isEnglish ? "No professional details have been shared yet." : "Giáo viên chưa cập nhật thông tin chuyên môn."}
              </p>
            </div>
          )}

          <footer className="flex flex-col items-stretch justify-between gap-3 border-t border-[#e4ebe7] pt-5 sm:flex-row sm:items-center">
            <p className="text-xs leading-5 text-[#788882]">
              {isEnglish ? "Schedule registration is not available yet." : "Tính năng đăng ký học hiện chưa khả dụng."}
            </p>
            <Button type="button" disabled className="min-h-11 shrink-0 rounded-xl bg-[#4d857a] px-5 text-white opacity-55">
              <CalendarDays className="mr-2 h-4 w-4" />
              {isEnglish ? "Register to study" : "Đăng ký học"}
            </Button>
          </footer>
        </div>
      </div>
    </main>
  );
}
