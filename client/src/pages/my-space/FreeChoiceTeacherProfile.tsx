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
  ShieldCheck,
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
    <main className="mx-auto min-h-[60vh] w-full max-w-5xl animate-pulse px-4 py-6 sm:px-7 sm:py-10">
      <div className="mb-7 h-5 w-36 rounded bg-[#dce8e4]" />
      <div className="rounded-[28px] border border-[#dce8e4] bg-[#fffefa] p-5 sm:p-9">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="h-32 w-32 rounded-[24px] bg-[#e4efeb] sm:h-44 sm:w-44" />
          <div className="flex-1 space-y-4">
            <div className="h-8 w-2/3 rounded bg-[#e4efeb]" />
            <div className="h-4 w-1/3 rounded bg-[#e4efeb]" />
            <div className="h-10 w-1/2 rounded bg-[#e4efeb]" />
          </div>
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
    <main className="mx-auto min-h-[70vh] w-full max-w-5xl px-4 pb-12 pt-5 sm:px-7 sm:pb-16 sm:pt-8">
      <button
        type="button"
        onClick={returnToList}
        className="group mb-5 inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-medium text-[#47726a] transition-colors hover:bg-[#e8f2ed] hover:text-[#204f49] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5f9b8f]"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        {isEnglish ? "Back to teachers" : "Quay lại danh sách"}
      </button>

      <div className="overflow-hidden rounded-[28px] border border-[#dce8e4] bg-[#fffefa] shadow-[0_16px_50px_-36px_rgba(31,79,70,0.42)]">
        <div className="relative overflow-hidden bg-[#e8f1ec] px-5 py-7 sm:px-10 sm:py-10">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border-[1px] border-[#c8ddd5] sm:-right-8 sm:-top-40 sm:h-[420px] sm:w-[420px]" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-3 top-14 h-40 w-40 rounded-full border-[1px] border-[#d2e2dc] sm:right-40 sm:top-12 sm:h-56 sm:w-56" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-9">
            <div className="h-32 w-32 shrink-0 overflow-hidden rounded-[24px] border-4 border-[#fffefa] bg-[#dcece8] shadow-[0_12px_26px_-14px_rgba(29,76,68,0.45)] sm:h-44 sm:w-44">
              <TeacherPortrait teacher={teacher} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#c8ddd5] bg-[#f7faf7] px-3 py-1.5 text-xs font-medium text-[#356c62]">
                <ShieldCheck className="h-4 w-4" />
                {isEnglish ? "Training department teacher" : "Giáo viên thuộc Phòng Đào tạo"}
              </div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#5b8279]">
                {isEnglish ? "Teacher profile" : "Hồ sơ giáo viên"}
              </p>
              <h1 className="font-display text-3xl font-semibold leading-tight tracking-[-0.035em] text-[#1e3935] sm:text-[42px]">
                {teacher.fullName}
              </h1>
              {teacher.teachingSubjects.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {teacher.teachingSubjects.map((subject) => (
                    <span key={subject} className="rounded-full border border-[#c8ddd5] bg-[#f8fbf8] px-3.5 py-1.5 text-xs font-medium text-[#32685f] sm:text-sm">
                      {subject}
                    </span>
                  ))}
                </div>
              )}
              {experience && (
                <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[#45655e]">
                  <BriefcaseBusiness className="h-4 w-4 text-[#51887c]" />
                  {experience}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-5 sm:gap-7 sm:p-8">
          {(teachingExperience || certificates || achievements) ? (
            <div className="flex items-start gap-3 rounded-2xl border border-[#e6e3d8] bg-[#f8f7f0] px-4 py-4 text-sm leading-6 text-[#5c6254] sm:px-5">
              <BookOpenText className="mt-0.5 h-5 w-5 shrink-0 text-[#8a885e]" />
              <p>{isEnglish ? "Explore the teaching experience, qualifications and achievements shared in this profile." : "Tìm hiểu kinh nghiệm giảng dạy, chứng chỉ và thành tích được chia sẻ trong hồ sơ này."}</p>
            </div>
          ) : null}

          <ProfileSection title={isEnglish ? "Teaching experience" : "Kinh nghiệm giảng dạy"} icon={GraduationCap} content={teachingExperience} />
          <ProfileSection title={isEnglish ? "Certificates & qualifications" : "Bằng cấp & chứng chỉ"} icon={Award} content={certificates} />
          <ProfileSection title={isEnglish ? "Achievements" : "Thành tích"} icon={Check} content={achievements} />

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
