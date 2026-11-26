import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useToast } from "@/hooks/use-toast";

type FeePackage = {
  id: string;
  name: string;
  type: string;
  fee: number | string;
  sessions: number | string;
  totalAmount: number | string;
  courseName?: string;
  remainingSessions?: number;
  totalSessions?: number;
  usedSessions?: number;
};

type BookingOptions = {
  purchasedPackages: FeePackage[];
  newPackages: FeePackage[];
  depositBalance: number;
};

type BookingDetailsStepProps = {
  teacherId: string;
  teacher: {
    fullName: string;
    avatarUrl: string | null;
    teachingSubjects: string[];
  };
  student: {
    id: string;
    fullName: string;
    code: string;
  };
  locationId: string;
  locationName: string;
  selectedSessions: {
    sessionDate: string;
    dateLabel: string;
    shifts: {
      id: string;
      name: string;
      startTime: string;
      endTime: string;
      locationName: string;
    }[];
  }[];
  isEnglish: boolean;
  selectedFeePackageId: string;
  onFeePackageChange: (id: string) => void;
  learningMode: "offline" | "online" | null;
  onLearningModeChange: (mode: "offline" | "online") => void;
  onBack: () => void;
  onComplete: () => void;
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
  teacherId,
  teacher,
  student,
  locationId,
  locationName,
  selectedSessions,
  isEnglish,
  selectedFeePackageId,
  onFeePackageChange,
  learningMode,
  onLearningModeChange,
  onBack,
  onComplete,
}: BookingDetailsStepProps) {
  const locale = isEnglish ? "en-US" : "vi-VN";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [packageSource, setPackageSource] = useState<"existing" | "new">("existing");
  const requestKeyRef = useRef<string | null>(null);
  const optionsQuery = useQuery<BookingOptions>({
    queryKey: ["/api/my-space/schedule-registration/options", student.id, locationId],
    enabled: Boolean(locationId),
    queryFn: async () => {
      const params = new URLSearchParams({
        studentId: student.id,
        locationId,
      });
      const response = await fetch(`/api/my-space/schedule-registration/options?${params.toString()}`, { credentials: "include" });
      if (!response.ok) {
        throw new Error(isEnglish ? "Could not load tuition packages." : "Không thể tải gói học phí.");
      }
      return response.json() as Promise<BookingOptions>;
    },
  });
  const availablePackages = packageSource === "existing"
    ? optionsQuery.data?.purchasedPackages ?? []
    : optionsQuery.data?.newPackages ?? [];
  const selectedPackage = availablePackages.find((item) => item.id === selectedFeePackageId);
  const newPackages = optionsQuery.data?.newPackages ?? [];
  const selectedShiftCount = selectedSessions.reduce((total, session) => total + session.shifts.length, 0);
  const selectedPackageSessions = selectedPackage
    ? Number(packageSource === "existing" ? selectedPackage.remainingSessions : selectedPackage.sessions) || 0
    : 0;
  const fullPackageAmount = selectedPackage
    ? (selectedPackage.type === "buổi"
      ? (Number(selectedPackage.fee) || 0) * (Number(selectedPackage.sessions) || 0)
      : Number(selectedPackage.totalAmount) || 0)
    : 0;
  const depositBalance = Number(optionsQuery.data?.depositBalance) || 0;
  const hasEnoughDeposit = packageSource === "existing" || depositBalance >= fullPackageAmount;
  const depositHintIsEnough = packageSource === "new" && selectedPackage
    ? hasEnoughDeposit
    : newPackages.some((item) => {
      const amount = item.type === "buổi"
        ? (Number(item.fee) || 0) * (Number(item.sessions) || 0)
        : Number(item.totalAmount) || 0;
      return amount > 0 && depositBalance >= amount;
    });
  const canConfirm = Boolean(
    selectedPackage
    && learningMode
    && selectedShiftCount > 0
    && selectedShiftCount <= selectedPackageSessions
    && hasEnoughDeposit
    && !optionsQuery.isLoading
    && !optionsQuery.isError
  );

  useEffect(() => {
    if (!optionsQuery.data || optionsQuery.data.purchasedPackages.length > 0) return;
    setPackageSource("new");
  }, [optionsQuery.data]);

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPackage || !learningMode) throw new Error(isEnglish ? "Complete the package and learning-mode selections." : "Vui lòng chọn gói học phí và hình thức học.");
      if (!requestKeyRef.current) requestKeyRef.current = crypto.randomUUID();
      const response = await fetch("/api/my-space/schedule-registration/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          teacherId,
          locationId,
          sessions: selectedSessions.map((session) => ({
            sessionDate: session.sessionDate,
            shiftIds: session.shifts.map((shift) => shift.id),
          })),
          packageId: selectedPackage.id,
          packageSource,
          learningMode,
          requestKey: requestKeyRef.current,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || (isEnglish ? "Could not complete this registration." : "Không thể hoàn tất đăng ký."));
      return result;
    },
    onSuccess: (result) => {
      requestKeyRef.current = null;
      toast({
        title: isEnglish ? "Registration complete" : "Đăng ký thành công",
        description: result.invoiceCode
          ? `${isEnglish ? "Receipt" : "Phiếu thu"} ${result.invoiceCode} · ${result.bookedSessions} ${isEnglish ? "sessions booked" : "buổi đã xếp"} · ${result.remainingSessions} ${isEnglish ? "remaining" : "buổi còn lại"}`
          : `${result.bookedSessions} ${isEnglish ? "sessions booked" : "buổi đã xếp"} · ${result.remainingSessions} ${isEnglish ? "remaining" : "buổi còn lại"}`,
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/my-space/schedule-registration/options"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/my-space/schedule-registration/teachers"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/my-space/calendar/student"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/my-space/calendar/student/classes"] });
      onComplete();
    },
    onError: (error: Error) => {
      toast({
        title: isEnglish ? "Registration failed" : "Đăng ký chưa thành công",
        description: error.message,
        variant: "destructive",
      });
    },
  });

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
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto py-5">
          <section aria-labelledby="fee-package-heading">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#e8f3ed] text-xs font-bold text-[#28665d]">1</span>
              <h3 id="fee-package-heading" className="text-sm font-semibold text-[#294640]">
                {isEnglish ? "Tuition package" : "Gói học phí"}
              </h3>
            </div>

            {optionsQuery.isLoading ? (
              <div className="rounded-xl border border-[#dce7e1] bg-white p-4 text-sm text-[#71827a]">
                {isEnglish ? "Loading packages…" : "Đang tải gói học phí…"}
              </div>
            ) : optionsQuery.isError ? (
              <div role="alert" className="rounded-xl border border-[#ead3cb] bg-[#fff7f2] p-4 text-sm text-[#875446]">
                {isEnglish ? "Could not load tuition packages. Please try again later." : "Không tải được gói học phí. Vui lòng thử lại sau."}
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={isEnglish ? "Package payment type" : "Loại gói học phí"}>
                  {optionsQuery.data?.purchasedPackages.length ? (
                    <button
                      type="button"
                      aria-pressed={packageSource === "existing"}
                      onClick={() => {
                        if (packageSource !== "existing") onFeePackageChange("");
                        setPackageSource("existing");
                      }}
                      className={`min-h-10 rounded-xl border px-4 text-xs font-semibold transition-colors ${packageSource === "existing" ? "border-[#4d8c7d] bg-[#e8f3ed] text-[#28665d]" : "border-[#dce7e1] bg-white text-[#71827a] hover:bg-[#f5f8f5]"}`}
                    >
                      {isEnglish ? "Already purchased" : "Gói đã đăng ký trước"}
                    </button>
                  ) : null}
                    <div className="flex flex-col items-start">
                      <button
                        type="button"
                        aria-pressed={packageSource === "new"}
                        onClick={() => {
                          if (packageSource !== "new") onFeePackageChange("");
                          setPackageSource("new");
                        }}
                        className={`min-h-10 rounded-xl border px-4 text-xs font-semibold transition-colors ${packageSource === "new" ? "border-[#4d8c7d] bg-[#e8f3ed] text-[#28665d]" : "border-[#dce7e1] bg-white text-[#71827a] hover:bg-[#f5f8f5]"}`}
                      >
                        {isEnglish ? "New package with deposit" : "Gói mới theo Ví Đặt Cọc"}
                      </button>
                      <p className={`mt-1 pl-1 text-[10px] leading-4 ${depositHintIsEnough ? "text-emerald-700" : "text-orange-700"}`}>
                        {isEnglish ? "Deposit wallet: " : "Ví Đặt Cọc: "}
                        {new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(depositBalance)} đ
                      </p>
                    </div>
                </div>

                {availablePackages.length ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {availablePackages.map((feePackage) => {
                  const isSelected = selectedFeePackageId === feePackage.id;
                  const sessionsAvailable = packageSource === "existing"
                    ? Number(feePackage.remainingSessions) || 0
                    : Number(feePackage.sessions) || 0;
                  const amount = feePackage.type === "buổi"
                    ? (Number(feePackage.fee) || 0) * (Number(feePackage.sessions) || 0)
                    : Number(feePackage.totalAmount) || 0;
                  const canAfford = packageSource === "existing" || depositBalance >= amount;
                  return (
                    <button
                      key={feePackage.id}
                      type="button"
                      disabled={!canAfford}
                      aria-pressed={isSelected}
                      onClick={() => onFeePackageChange(feePackage.id)}
                      className={`relative min-h-32 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5f9b8f] disabled:cursor-not-allowed disabled:opacity-50 ${
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
                        {packageSource === "existing"
                          ? `${sessionsAvailable} ${isEnglish ? "sessions available" : "buổi còn có thể xếp"}`
                          : `${Number(feePackage.sessions)} ${isEnglish ? "sessions in package" : "buổi trong gói"}`}
                        {feePackage.type ? ` · ${feePackage.type}` : ""}
                      </span>
                      <span className="mt-1 block font-display text-base font-semibold text-[#28665d]">
                        {packageSource === "existing"
                          ? `${Number(feePackage.usedSessions) || 0}/${Number(feePackage.totalSessions) || 0} ${isEnglish ? "booked" : "đã xếp"}`
                          : currency(amount, locale)}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-[#829089]">
                        {packageSource === "existing"
                          ? (isEnglish ? "Previously paid; no new charge" : "Đã thu trước; không thu lại")
                          : canAfford
                            ? `${isEnglish ? "Per session: " : "Đơn giá/buổi: "}${currency(feePackage.fee, locale)}`
                            : (isEnglish ? "Deposit balance is insufficient" : "Ví Đặt Cọc không đủ")}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[#d7e3dc] bg-[#fffefa] p-5 text-sm text-[#71827a]">
                {packageSource === "existing"
                  ? (isEnglish ? "No previously purchased package has sessions available." : "Không có gói đã thanh toán nào còn buổi để xếp.")
                  : (isEnglish ? "There are no active packages at this center." : "Cơ sở này chưa có gói học phí đang hoạt động.")}
              </div>
                )}
                {selectedPackage && selectedShiftCount > selectedPackageSessions && (
                  <p role="alert" className="mt-3 rounded-xl border border-[#ead3cb] bg-[#fff7f2] px-4 py-3 text-sm text-[#875446]">
                    {packageSource === "existing"
                      ? (isEnglish
                        ? `This package has only ${selectedPackageSessions} sessions left to schedule.`
                        : `Gói này chỉ còn ${selectedPackageSessions} buổi chưa xếp.`)
                      : (isEnglish
                        ? `This package includes ${selectedPackageSessions} sessions.`
                        : `Gói này có ${selectedPackageSessions} buổi.`)}
                  </p>
                )}
              </>
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
                  {selectedPackage.name} · {selectedShiftCount}/{selectedPackageSessions}
              </p>
            )}
            {learningMode && (
              <p className="truncate text-[11px] text-[#71827a]">
                {isEnglish ? "Mode: " : "Hình thức: "}{learningMode === "online" ? "Online" : "Offline"}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <Button
              type="button"
              size="sm"
              disabled={!canConfirm || confirmMutation.isPending}
              onClick={() => confirmMutation.mutate()}
              className="h-9 rounded-lg bg-[#4d857a] px-3 text-xs text-white disabled:opacity-50"
            >
              {confirmMutation.isPending
                ? (isEnglish ? "Submitting…" : "Đang gửi…")
                : (isEnglish ? "Confirm" : "Xác nhận")}
            </Button>
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
                  <dd className="mt-0.5 space-y-1 capitalize text-[#405c53]">
                    {selectedSessions.map((session) => (
                      <div key={session.sessionDate}>{session.dateLabel}</div>
                    ))}
                  </dd>
                </div>
              </div>
              <div className="flex gap-3">
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#6f9285]" />
                <div className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#829089]">{isEnglish ? "Selected shifts" : "Các ca đã chọn"}</dt>
                  <dd className="mt-1 space-y-2 text-[#405c53]">
                    {selectedSessions.map((session) => (
                      <div key={session.sessionDate} className="space-y-1.5">
                        <span className="block text-xs font-semibold capitalize text-[#71827a]">{session.dateLabel}</span>
                        {session.shifts.map((shift) => (
                          <div key={`${session.sessionDate}:${shift.id}`}>
                            <span className="block font-medium">{shift.name}</span>
                            <span className="block text-xs text-[#71827a]">{shift.locationName || locationName} · {shift.startTime}–{shift.endTime}</span>
                          </div>
                        ))}
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
                    <>
                      <dd className="text-xs text-[#71827a]">
                        {packageSource === "existing"
                          ? `${selectedShiftCount} ${isEnglish ? "booked now" : "buổi đăng ký lần này"} · ${Math.max(0, selectedPackageSessions - selectedShiftCount)} ${isEnglish ? "left to schedule" : "buổi còn để xếp"}`
                          : `${selectedShiftCount}/${Number(selectedPackage.sessions)} ${isEnglish ? "booked now" : "buổi đã xếp"} · ${Math.max(0, Number(selectedPackage.sessions) - selectedShiftCount)} ${isEnglish ? "left to schedule" : "buổi còn để xếp"}`}
                      </dd>
                      <dd className="text-xs text-[#71827a]">
                        {packageSource === "existing"
                          ? (isEnglish ? "Already paid · no additional charge" : "Đã thu trước · không thu thêm")
                          : `${isEnglish ? "Full package charge: " : "Thu đủ cả gói: "}${currency(fullPackageAmount, locale)}`}
                      </dd>
                    </>
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
              {packageSource === "new" && (
                <div className="flex gap-3">
                  <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-[#6f9285]" />
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#829089]">{isEnglish ? "Payment" : "Thanh toán"}</dt>
                    <dd className="mt-0.5 font-medium text-[#405c53]">{isEnglish ? "Deposit wallet" : "Ví Đặt Cọc"}</dd>
                    <dd className="text-xs text-[#71827a]">
                      {isEnglish ? "Balance: " : "Số dư: "}{currency(depositBalance, locale)}
                      {hasEnoughDeposit
                        ? ""
                        : (isEnglish ? " · Not enough for the full package" : " · Không đủ thanh toán cả gói")}
                    </dd>
                  </div>
                </div>
              )}
            </dl>
          </div>

          <div className="mt-4 shrink-0">
            <Button
              type="button"
              disabled={!canConfirm || confirmMutation.isPending}
              onClick={() => confirmMutation.mutate()}
              className="min-h-11 w-full rounded-xl bg-[#3678e8] font-semibold text-white disabled:opacity-50"
            >
              {confirmMutation.isPending
                ? (isEnglish ? "Submitting…" : "Đang xác nhận…")
                : <><Check className="mr-2 h-4 w-4" />{isEnglish ? "Confirm registration" : "Xác nhận đăng ký"}</>}
            </Button>
            <p className="mt-2 text-center text-[11px] leading-5 text-[#7b8982]">
              {packageSource === "new"
                ? (isEnglish ? "The full package is paid from the deposit wallet." : "Hệ thống thu đủ giá gói từ Ví Đặt Cọc khi xác nhận.")
                : (isEnglish ? "Previously paid packages are not charged again." : "Gói đã đăng ký trước sẽ không bị thu thêm lần nữa.")}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
