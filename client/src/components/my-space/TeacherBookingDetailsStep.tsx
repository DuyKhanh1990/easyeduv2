import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  CreditCard,
  GraduationCap,
  MapPin,
  Monitor,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type FeePackage = {
  id: string;
  name: string;
  type: string;
  fee: number | string;
  sessions: number | string;
  totalAmount: number | string;
  courseName?: string;
};

type BookingDetailsStepProps = {
  teacher: {
    fullName: string;
    avatarUrl: string | null;
    teachingSubjects: string[];
  };
  student: {
    fullName: string;
    code: string;
  };
  locationId: string;
  locationName: string;
  dateLabel: string;
  selectedShifts: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    locationName: string;
  }[];
  isEnglish: boolean;
  selectedFeePackageId: string;
  onFeePackageChange: (id: string) => void;
  learningMode: "offline" | "online" | null;
  onLearningModeChange: (mode: "offline" | "online") => void;
  onBack: () => void;
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(-2).map((part) => part[0] ?? "").join("").toLocaleUpperCase("vi");
}

function currency(value: number | string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

export function TeacherBookingDetailsStep({
  teacher,
  student,
  locationId,
  locationName,
  dateLabel,
  selectedShifts,
  isEnglish,
  selectedFeePackageId,
  onFeePackageChange,
  learningMode,
  onLearningModeChange,
  onBack,
}: BookingDetailsStepProps) {
  const locale = isEnglish ? "en-US" : "vi-VN";
  const packagesQuery = useQuery<FeePackage[]>({
    queryKey: ["/api/fee-packages", locationId],
    enabled: Boolean(locationId),
    queryFn: async () => {
      const response = await fetch(
        `/api/fee-packages?locationId=${encodeURIComponent(locationId)}`,
        { credentials: "include" },
      );
      if (!response.ok) {
        throw new Error(isEnglish ? "Could not load tuition packages." : "Không thể tải gói học phí.");
      }
      return response.json();
    },
  });
  const selectedPackage = packagesQuery.data?.find((item) => item.id === selectedFeePackageId);

  const modeOptions = [
    {
      value: "offline" as const,
      label: isEnglish ? "Offline" : "Offline",
      description: isEnglish ? "At the selected center" : "Học trực tiếp tại cơ sở",
      icon: GraduationCap,
    },
    {
      value: "online" as const,
      label: isEnglish ? "Online" : "Online",
      description: isEnglish ? "Learn remotely" : "Học trực tuyến",
      icon: Monitor,
    },
  ];

  return (
    <>
      <main className="flex min-h-0 min-w-0 flex-col overflow-y-auto p-3 sm:p-5 lg:p-7">
        <header className="shrink-0 border-b border-[#e2eae5] pb-4">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#e8f3ed] px-3 py-1.5 text-[#28665d]">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4d857a] text-[10px] text-white">2</span>
              {isEnglish ? "Confirm registration" : "Xác nhận đăng ký"}
            </span>
            <span className="text-[#9aa7a0]">—</span>
            <span className="text-[#87948d]">{isEnglish ? "Complete" : "Hoàn tất"}</span>
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold text-[#203c38]">
            {isEnglish ? "Choose a tuition package" : "Chọn gói học phí"}
          </h2>
          <p className="mt-1 text-sm text-[#71827a]">
            {isEnglish
              ? "Choose a package for the selected student and center."
              : "Chọn gói học phí phù hợp với học sinh và cơ sở đã chọn."}
          </p>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto py-5">
          <section aria-labelledby="fee-package-heading">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#e8f3ed] text-xs font-bold text-[#28665d]">1</span>
              <h3 id="fee-package-heading" className="text-sm font-semibold text-[#294640]">
                {isEnglish ? "Tuition package" : "Gói học phí"}
              </h3>
            </div>

            {packagesQuery.isLoading ? (
              <div className="rounded-xl border border-[#dce7e1] bg-white p-4 text-sm text-[#71827a]">
                {isEnglish ? "Loading packages…" : "Đang tải gói học phí…"}
              </div>
            ) : packagesQuery.isError ? (
              <div role="alert" className="rounded-xl border border-[#ead3cb] bg-[#fff7f2] p-4 text-sm text-[#875446]">
                {isEnglish ? "Could not load tuition packages. Please try again later." : "Không tải được gói học phí. Vui lòng thử lại sau."}
              </div>
            ) : packagesQuery.data?.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {packagesQuery.data.map((feePackage) => {
                  const isSelected = selectedFeePackageId === feePackage.id;
                  return (
                    <button
                      key={feePackage.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => onFeePackageChange(feePackage.id)}
                      className={`relative min-h-32 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5f9b8f] ${
                        isSelected
                          ? "border-[#4d8c7d] bg-[#eef7f2] ring-1 ring-[#4d8c7d]"
                          : "border-[#dce7e1] bg-[#fffefa] hover:border-[#a9c9bb] hover:bg-[#f8fbf8]"
                      }`}
                    >
                      <span className={`absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border ${isSelected ? "border-[#4d8c7d] bg-[#4d8c7d] text-white" : "border-[#cfdad3] text-transparent"}`}>
                        <Check className="h-3 w-3" />
                      </span>
                      <span className="block pr-7 text-sm font-semibold text-[#294640]">{feePackage.name}</span>
                      {feePackage.courseName && (
                        <span className="mt-1 block truncate text-xs text-[#71827a]">{feePackage.courseName}</span>
                      )}
                      <span className="mt-3 block text-xs text-[#71827a]">
                        {Number(feePackage.sessions)} {isEnglish ? "sessions" : "buổi học"}
                        {feePackage.type ? ` · ${feePackage.type}` : ""}
                      </span>
                      <span className="mt-1 block font-display text-base font-semibold text-[#28665d]">
                        {currency(feePackage.totalAmount, locale)}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-[#829089]">
                        {isEnglish ? "Per session: " : "Đơn giá/buổi: "}
                        {currency(feePackage.fee, locale)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[#d7e3dc] bg-[#fffefa] p-5 text-sm text-[#71827a]">
                {isEnglish
                  ? "There are no active tuition packages at this center yet."
                  : "Cơ sở này hiện chưa có gói học phí đang hoạt động."}
              </div>
            )}
          </section>

          <section aria-labelledby="learning-mode-heading">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#e8f3ed] text-xs font-bold text-[#28665d]">2</span>
              <h3 id="learning-mode-heading" className="text-sm font-semibold text-[#294640]">
                {isEnglish ? "Learning mode" : "Hình thức học"}
              </h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {modeOptions.map(({ value, label, description, icon: Icon }) => {
                const isSelected = learningMode === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onLearningModeChange(value)}
                    className={`flex min-h-20 items-center gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5f9b8f] ${
                      isSelected
                        ? "border-[#4d8c7d] bg-[#eef7f2] ring-1 ring-[#4d8c7d]"
                        : "border-[#dce7e1] bg-[#fffefa] hover:border-[#a9c9bb]"
                    }`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8f3ed] text-[#28665d]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[#294640]">{label}</span>
                      <span className="mt-0.5 block text-xs text-[#71827a]">{description}</span>
                    </span>
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${isSelected ? "border-[#4d8c7d] bg-[#4d8c7d] text-white" : "border-[#cfdad3] text-transparent"}`}>
                      <Check className="h-3 w-3" />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            className="min-h-10 rounded-xl border-[#d5e3dc] bg-[#fffefa] text-[#47736a] hover:bg-[#edf5f0]"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {isEnglish ? "Back to schedule" : "Quay lại chọn ca"}
          </Button>
        </div>
      </main>

      <aside className="min-h-0 overflow-y-auto border-t border-[#e0e9e3] bg-[#eef4ef] p-3 md:border-l md:border-t-0 md:p-4 lg:p-5">
        <div className="flex items-center gap-3 md:hidden">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#dcece8] text-sm font-semibold text-[#245e58]">
            {teacher.avatarUrl
              ? <img src={teacher.avatarUrl} alt="" className="h-full w-full object-cover" />
              : initials(teacher.fullName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[#294640]">{teacher.fullName}</p>
            <p className="truncate text-xs text-[#71827a]">{student.fullName} · {locationName}</p>
            {selectedPackage && (
              <p className="truncate text-[11px] text-[#405c53]">
                {selectedPackage.name} · {currency(selectedPackage.totalAmount, locale)}
              </p>
            )}
            {learningMode && (
              <p className="truncate text-[11px] text-[#71827a]">
                {isEnglish ? "Mode: " : "Hình thức: "}{learningMode === "online" ? "Online" : "Offline"}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <Button type="button" size="sm" disabled className="h-9 rounded-lg bg-[#4d857a] px-3 text-xs text-white opacity-60">
              {isEnglish ? "Confirm" : "Xác nhận"}
            </Button>
            <p className="mt-1 max-w-32 text-[9px] leading-3 text-[#7b8982]">
              {isEnglish ? "Preview only; not submitted." : "Giao diện xem trước; chưa gửi."}
            </p>
          </div>
        </div>

        <div className="hidden h-full min-h-0 flex-col md:flex">
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#70877d]">
              {isEnglish ? "Registration details" : "Thông tin đăng ký"}
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold text-[#294640]">
              {isEnglish ? "Review your choices" : "Tóm tắt đăng ký"}
            </h2>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-[#d9e5dd] bg-[#fffefa] p-4">
            <div className="flex items-center gap-3 border-b border-[#e7ede8] pb-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#dcece8] text-sm font-semibold text-[#245e58]">
                {teacher.avatarUrl
                  ? <img src={teacher.avatarUrl} alt="" className="h-full w-full object-cover" />
                  : initials(teacher.fullName)}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7a8c84]">{isEnglish ? "Teacher" : "Giáo viên"}</p>
                <p className="mt-0.5 truncate text-sm font-semibold text-[#294640]">{teacher.fullName}</p>
                {teacher.teachingSubjects.length > 0 && (
                  <p className="mt-0.5 truncate text-xs text-[#72837c]">{teacher.teachingSubjects.join(" · ")}</p>
                )}
              </div>
            </div>

            <dl className="space-y-4 py-4 text-sm">
              <div className="flex gap-3">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#6f9285]" />
                <div className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#829089]">{isEnglish ? "Student" : "Học sinh"}</dt>
                  <dd className="mt-0.5 font-medium text-[#405c53]">{student.fullName}</dd>
                  <dd className="text-xs text-[#7b8982]">{isEnglish ? "Student code: " : "Mã học sinh: "}{student.code}</dd>
                </div>
              </div>
              <div className="flex gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#6f9285]" />
                <div className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#829089]">{isEnglish ? "Center" : "Cơ sở"}</dt>
                  <dd className="mt-0.5 font-medium text-[#405c53]">{locationName}</dd>
                </div>
              </div>
              <div className="flex gap-3">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#6f9285]" />
                <div className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#829089]">{isEnglish ? "Lesson date" : "Ngày học"}</dt>
                  <dd className="mt-0.5 capitalize text-[#405c53]">{dateLabel}</dd>
                </div>
              </div>
              <div className="flex gap-3">
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#6f9285]" />
                <div className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#829089]">{isEnglish ? "Selected shifts" : "Các ca đã chọn"}</dt>
                  <dd className="mt-1 space-y-2 text-[#405c53]">
                    {selectedShifts.map((shift) => (
                      <div key={shift.id}>
                        <span className="block font-medium">{shift.name}</span>
                        <span className="block text-xs text-[#71827a]">{shift.locationName || locationName} · {shift.startTime}–{shift.endTime}</span>
                      </div>
                    ))}
                  </dd>
                </div>
              </div>
              <div className="flex gap-3">
                <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-[#6f9285]" />
                <div className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#829089]">{isEnglish ? "Tuition package" : "Gói học phí"}</dt>
                  <dd className="mt-0.5 font-medium text-[#405c53]">{selectedPackage?.name ?? (isEnglish ? "Not selected" : "Chưa chọn")}</dd>
                  {selectedPackage && (
                    <dd className="text-xs text-[#71827a]">{currency(selectedPackage.totalAmount, locale)} · {Number(selectedPackage.sessions)} {isEnglish ? "sessions" : "buổi"}</dd>
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-[#6f9285]" />
                <div className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#829089]">{isEnglish ? "Learning mode" : "Hình thức học"}</dt>
                  <dd className="mt-0.5 font-medium text-[#405c53]">{learningMode ? (learningMode === "online" ? "Online" : "Offline") : (isEnglish ? "Not selected" : "Chưa chọn")}</dd>
                </div>
              </div>
            </dl>
          </div>

          <div className="mt-4 shrink-0">
            <Button
              type="button"
              disabled
              className="min-h-11 w-full rounded-xl bg-[#3678e8] font-semibold text-white opacity-60"
              title={isEnglish ? "Submitting a booking is not available yet." : "Chức năng gửi đăng ký sẽ được bổ sung sau."}
            >
              <Check className="mr-2 h-4 w-4" />
              {isEnglish ? "Confirm registration" : "Xác nhận đăng ký"}
            </Button>
            <p className="mt-2 text-center text-[11px] leading-5 text-[#7b8982]">
              {isEnglish ? "This is a preview. Registration is not submitted or saved." : "Đây là giao diện xem trước; chưa gửi hoặc lưu đăng ký."}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
