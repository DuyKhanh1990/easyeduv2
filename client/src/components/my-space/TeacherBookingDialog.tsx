import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  GraduationCap,
  MapPin,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/hooks/use-language";

type Teacher = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  teachingSubjects: string[];
};

type Student = {
  id: string;
  fullName: string;
  code: string;
  locations: { id: string; name: string }[];
};

type SlotStatus = "available" | "busy" | "outside_availability" | "past";

type Availability = {
  locations: { id: string; name: string }[];
  locationId: string | null;
  shifts: { id: string; name: string; startTime: string; endTime: string }[];
  days: {
    date: string;
    weekday: number;
    slots: { shiftId: string; status: SlotStatus }[];
  }[];
};

type TeacherBookingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teacher: Teacher;
  student: Student;
};

type ViewMode = "week" | "month";

const WEEKDAYS_VI = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const WEEKDAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function mondayOf(date: Date) {
  const result = new Date(date);
  const daysSinceMonday = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - daysSinceMonday);
  return result;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatDate(date: Date, options: Intl.DateTimeFormatOptions = {}, locale = "vi-VN") {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    ...options,
  }).format(date);
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(-2).map((part) => part[0] ?? "").join("").toLocaleUpperCase("vi");
}

function getSlotStatus(day: Availability["days"][number] | undefined, shiftId: string): SlotStatus {
  return day?.slots.find((slot) => slot.shiftId === shiftId)?.status ?? "outside_availability";
}

function getStatusLabel(status: SlotStatus, isEnglish: boolean) {
  if (status === "available") return isEnglish ? "Available" : "Còn chỗ";
  if (status === "busy") return isEnglish ? "Booked" : "Đã kín";
  if (status === "past") return isEnglish ? "Past" : "Đã qua";
  return isEnglish ? "Unavailable" : "Không khả dụng";
}

function statusStyle(status: SlotStatus) {
  if (status === "available") {
    return "border-[#b8d9ce] bg-[#edf7f2] text-[#286757]";
  }
  if (status === "busy") {
    return "border-[#ead3cb] bg-[#faf0ec] text-[#875446]";
  }
  if (status === "past") {
    return "border-[#e3e6e1] bg-[#f1f2ef] text-[#7b837d]";
  }
  return "border-[#e5e8e3] bg-[#f6f7f4] text-[#78827c]";
}

function TeacherAvatar({ teacher }: { teacher: Teacher }) {
  const [imageFailed, setImageFailed] = useState(false);

  return teacher.avatarUrl && !imageFailed ? (
    <img
      src={teacher.avatarUrl}
      alt={`Ảnh ${teacher.fullName}`}
      className="h-full w-full object-cover"
      onError={() => setImageFailed(true)}
    />
  ) : (
    <span className="flex h-full w-full items-center justify-center bg-[#dcece8] font-display text-xl font-semibold text-[#245e58]">
      {initials(teacher.fullName)}
    </span>
  );
}

export function TeacherBookingDialog({
  open,
  onOpenChange,
  teacher,
  student,
}: TeacherBookingDialogProps) {
  const { lang } = useLanguage();
  const isEnglish = lang === "en";
  const weekdays = isEnglish ? WEEKDAYS_EN : WEEKDAYS_VI;
  const locale = isEnglish ? "en-US" : "vi-VN";
  const [focusedDate, setFocusedDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [locationId, setLocationId] = useState("");
  const [selectedShiftId, setSelectedShiftId] = useState("");

  useEffect(() => {
    if (open) {
      setFocusedDate(new Date());
      setViewMode("week");
      setLocationId("");
      setSelectedShiftId("");
    }
  }, [open, teacher.id, student.id]);

  const month = monthKey(focusedDate);
  const query = useQuery<Availability>({
    queryKey: [
      "/api/my-space/schedule-registration/teachers",
      teacher.id,
      "slots",
      student.id,
      month,
      locationId || null,
    ],
    enabled: open,
    queryFn: async () => {
      const params = new URLSearchParams({ studentId: student.id, month });
      if (locationId) params.set("locationId", locationId);
      const response = await fetch(
        `/api/my-space/schedule-registration/teachers/${encodeURIComponent(teacher.id)}/slots?${params.toString()}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error(isEnglish ? "Unable to load schedule" : "Không thể tải lịch học");
      return response.json() as Promise<Availability>;
    },
  });

  const sharedLocations = useMemo(() => {
    const studentLocationIds = new Set(student.locations.map((location) => location.id));
    return (query.data?.locations ?? []).filter((location) => studentLocationIds.has(location.id));
  }, [query.data?.locations, student.locations]);

  useEffect(() => {
    if (!query.data || locationId) return;
    const preferred = sharedLocations.length === 1 ? sharedLocations[0].id : "";
    if (preferred) setLocationId(preferred);
  }, [locationId, query.data, sharedLocations]);

  useEffect(() => {
    setSelectedShiftId("");
  }, [focusedDate, locationId]);

  const dayMap = useMemo(
    () => new Map((query.data?.days ?? []).map((day) => [day.date, day])),
    [query.data?.days],
  );
  const selectedDay = dayMap.get(dateKey(focusedDate));
  const selectedShift = query.data?.shifts.find((shift) => shift.id === selectedShiftId);
  const selectedLocation = sharedLocations.find((location) => location.id === locationId);
  const monthStart = new Date(focusedDate.getFullYear(), focusedDate.getMonth(), 1);
  const monthEnd = new Date(focusedDate.getFullYear(), focusedDate.getMonth() + 1, 0);
  const monthCells = Array.from(
    { length: Math.ceil((((monthStart.getDay() + 6) % 7) + monthEnd.getDate()) / 7) * 7 },
    (_, index) => {
      const dayNumber = index - ((monthStart.getDay() + 6) % 7) + 1;
      return dayNumber > 0 && dayNumber <= monthEnd.getDate()
        ? new Date(focusedDate.getFullYear(), focusedDate.getMonth(), dayNumber)
        : null;
    },
  );
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(mondayOf(focusedDate), index));

  const goToDate = (date: Date) => {
    setFocusedDate(date);
    setSelectedShiftId("");
  };

  const moveMonth = (amount: number) => {
    goToDate(new Date(focusedDate.getFullYear(), focusedDate.getMonth() + amount, 1));
  };

  const moveWeek = (amount: number) => {
    goToDate(addDays(focusedDate, amount * 7));
  };

  const selectedDateLabel = formatDate(focusedDate, { weekday: "long", year: "numeric" }, locale);
  const locationNeedsChoice = sharedLocations.length > 1 && !locationId;
  const availabilityReady = Boolean(locationId) && !locationNeedsChoice;
  const noSharedLocations = !query.isLoading && !query.isError && query.data && sharedLocations.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] max-w-6xl gap-0 overflow-hidden border-[#d8e6df] bg-[#f8faf7] p-0 text-[#203c38] sm:rounded-[26px]">
        <div className="max-h-[94dvh] overflow-y-auto">
          <DialogHeader className="border-b border-[#e3ebe6] bg-[#fffefa] px-5 py-5 text-left sm:px-7 sm:py-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8f2ed] text-[#327267]">
                <CalendarDays className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                  <DialogTitle className="font-display text-xl font-semibold tracking-tight text-[#203c38] sm:text-2xl">
                   {isEnglish ? "Choose a lesson time" : "Chọn lịch học"}
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm leading-5 text-[#687b74]">
                   {isEnglish ? "View the teacher’s schedule and choose an available shift." : "Xem lịch thực tế của giáo viên và chọn ca còn chỗ phù hợp."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_320px]">
            <main className="min-w-0 p-4 sm:p-6 lg:p-7">
              <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#66847b]">{isEnglish ? "Availability" : "Lịch khả dụng"}</p>
                  <h2 className="mt-1 font-display text-xl font-semibold capitalize tracking-tight text-[#203c38]">
                    {formatDate(focusedDate, { month: "long", year: "numeric" }, locale)}
                  </h2>
                </div>
                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <div className="inline-flex rounded-xl border border-[#dce7e1] bg-[#eef3ef] p-1" aria-label={isEnglish ? "Calendar view mode" : "Chế độ xem lịch"}>
                    <button
                      type="button"
                      aria-pressed={viewMode === "week"}
                      onClick={() => setViewMode("week")}
                      className={`min-h-9 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5f9b8f] ${viewMode === "week" ? "bg-[#fffefa] text-[#28665d] shadow-sm" : "text-[#71827c] hover:text-[#345f56]"}`}
                    >
                      {isEnglish ? "Week" : "Tuần"}
                    </button>
                    <button
                      type="button"
                      aria-pressed={viewMode === "month"}
                      onClick={() => setViewMode("month")}
                      className={`min-h-9 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5f9b8f] ${viewMode === "month" ? "bg-[#fffefa] text-[#28665d] shadow-sm" : "text-[#71827c] hover:text-[#345f56]"}`}
                    >
                      {isEnglish ? "Month" : "Tháng"}
                    </button>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={viewMode === "week"
                        ? (isEnglish ? "Previous week" : "Tuần trước")
                        : (isEnglish ? "Previous month" : "Tháng trước")}
                      onClick={() => viewMode === "week" ? moveWeek(-1) : moveMonth(-1)}
                      className="h-10 w-10 border-[#dce7e1] bg-[#fffefa] text-[#47736a] hover:bg-[#edf5f0]"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={viewMode === "week"
                        ? (isEnglish ? "Next week" : "Tuần sau")
                        : (isEnglish ? "Next month" : "Tháng sau")}
                      onClick={() => viewMode === "week" ? moveWeek(1) : moveMonth(1)}
                      className="h-10 w-10 border-[#dce7e1] bg-[#fffefa] text-[#47736a] hover:bg-[#edf5f0]"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {viewMode === "week" ? (
                <section aria-label={isEnglish ? "Choose a day this week" : "Chọn ngày trong tuần"} className="rounded-2xl border border-[#dce7e1] bg-[#fffefa] p-2.5 sm:p-3">
                  <div className="grid grid-cols-7 gap-1 sm:gap-2">
                    {weekDays.map((date, index) => {
                      const day = dayMap.get(dateKey(date));
                      const availableCount = availabilityReady ? day?.slots.filter((slot) => slot.status === "available").length ?? 0 : 0;
                      const active = dateKey(date) === dateKey(focusedDate);
                      return (
                        <button
                          type="button"
                          key={dateKey(date)}
                          onClick={() => goToDate(date)}
                          aria-pressed={active}
                          aria-label={`${weekdays[index]}, ${formatDate(date, {}, locale)}${availableCount ? `, ${availableCount} ${isEnglish ? "available shifts" : "ca còn chỗ"}` : ""}`}
                          className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5f9b8f] sm:min-h-[82px] ${active ? "border-[#5c9286] bg-[#e8f3ed] text-[#245e54]" : "border-transparent text-[#65776f] hover:border-[#dce7e1] hover:bg-[#f5f8f5]"}`}
                        >
                          <span className="text-[10px] font-semibold uppercase tracking-wide sm:text-[11px]">{weekdays[index]}</span>
                          <span className={`font-display text-lg font-semibold leading-none sm:text-xl ${active ? "text-[#245e54]" : "text-[#334e48]"}`}>
                            {date.getDate()}
                          </span>
                          <span className="min-h-3 text-[9px] font-medium sm:text-[10px]">
                            {availableCount ? `${availableCount} ${isEnglish ? "shifts" : "ca"}` : "\u00a0"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : (
                <section aria-label={isEnglish ? "Monthly calendar" : "Lịch tháng"} className="rounded-2xl border border-[#dce7e1] bg-[#fffefa] p-3 sm:p-4">
                  <div className="mb-2 grid grid-cols-7">
                    {weekdays.map((weekday) => (
                      <div key={weekday} className="py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-[#85918b] sm:text-xs">
                        {weekday}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1 sm:gap-2">
                    {monthCells.map((date, index) => {
                      if (!date) return <div key={`empty-${index}`} className="min-h-12 sm:min-h-[62px]" />;
                      const day = dayMap.get(dateKey(date));
                      const availableCount = availabilityReady ? day?.slots.filter((slot) => slot.status === "available").length ?? 0 : 0;
                      const busyCount = availabilityReady ? day?.slots.filter((slot) => slot.status === "busy").length ?? 0 : 0;
                      const active = dateKey(date) === dateKey(focusedDate);
                      return (
                        <button
                          key={dateKey(date)}
                          type="button"
                          onClick={() => goToDate(date)}
                          aria-pressed={active}
                          aria-label={`${formatDate(date, { weekday: "long" }, locale)}${availableCount ? `, ${availableCount} ${isEnglish ? "available shifts" : "ca còn chỗ"}` : (isEnglish ? ", no available shifts" : ", không có ca còn chỗ")}`}
                          className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg border text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5f9b8f] sm:min-h-[62px] ${active ? "border-[#5c9286] bg-[#e8f3ed] font-semibold text-[#245e54]" : "border-transparent text-[#465f57] hover:border-[#dce7e1] hover:bg-[#f5f8f5]"}`}
                        >
                          <span>{date.getDate()}</span>
                          <span className="flex min-h-1.5 items-center gap-1" aria-hidden="true">
                            {availableCount > 0 && <i className="h-1.5 w-1.5 rounded-full bg-[#4c9a7b]" />}
                            {busyCount > 0 && <i className="h-1.5 w-1.5 rounded-full bg-[#c3816c]" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-[#718079] sm:text-xs">
                <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#4c9a7b]" />{isEnglish ? "Available" : "Còn chỗ"}</span>
                <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#c3816c]" />{isEnglish ? "Booked" : "Đã kín"}</span>
                <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#aeb7b0]" />{isEnglish ? "Unavailable" : "Không khả dụng"}</span>
              </div>

              <section className="mt-6 border-t border-[#e2eae5] pt-5" aria-labelledby="day-shifts-heading">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#779087]">{isEnglish ? "Selected day" : "Ngày đã chọn"}</p>
                    <h3 id="day-shifts-heading" className="mt-1 font-display text-lg font-semibold capitalize text-[#294640]">
                      {selectedDateLabel}
                    </h3>
                  </div>
                  {selectedDay && (
                    <span className="text-xs text-[#73837d]">
                      {selectedDay.slots.filter((slot) => slot.status === "available").length} {isEnglish ? "available shifts" : "ca còn chỗ"}
                    </span>
                  )}
                </div>

                {query.isLoading && (
                  <div className="grid gap-2 sm:grid-cols-2" aria-label="Đang tải lịch">
                    {[0, 1, 2, 3].map((item) => (
                      <div key={item} className="h-[76px] animate-pulse rounded-xl border border-[#e2eae5] bg-[#f0f4f0]" />
                    ))}
                  </div>
                )}

                {query.isError && (
                  <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-[#ead6ce] bg-[#fff7f2] p-4 text-sm text-[#805446] sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{isEnglish ? "Unable to load the schedule. Please try again." : "Không thể tải lịch lúc này. Vui lòng thử lại."}</span>
                    <Button type="button" variant="outline" onClick={() => query.refetch()} className="border-[#dbc0b5] bg-[#fffdfa] text-[#805446] hover:bg-[#f9ece5]">
                      {isEnglish ? "Try again" : "Thử lại"}
                    </Button>
                  </div>
                )}

                {noSharedLocations && (
                  <div className="rounded-xl border border-dashed border-[#d7e3dc] bg-[#fffefa] px-4 py-6 text-center">
                    <MapPin className="mx-auto h-5 w-5 text-[#7f9b90]" />
                    <p className="mt-2 text-sm font-medium text-[#526b62]">{isEnglish ? "No shared center found" : "Không tìm thấy cơ sở chung"}</p>
                    <p className="mt-1 text-xs leading-5 text-[#7d8983]">{isEnglish ? "The teacher and student must share a center to view available times." : "Giáo viên và học sinh cần cùng cơ sở để xem lịch đăng ký."}</p>
                  </div>
                )}

                {!query.isLoading && !query.isError && !noSharedLocations && locationNeedsChoice && (
                  <div className="rounded-xl border border-[#dce7e1] bg-[#fffefa] p-4">
                    <label className="mb-2 block text-sm font-medium text-[#405e55]" htmlFor="teacher-booking-location">
                      {isEnglish ? "Choose a center" : "Chọn cơ sở học"}
                    </label>
                    <Select value={locationId} onValueChange={setLocationId}>
                      <SelectTrigger id="teacher-booking-location" className="min-h-11 border-[#d5e3dc] bg-white">
                        <SelectValue placeholder={isEnglish ? "Choose a shared center" : "Chọn cơ sở phù hợp"} />
                      </SelectTrigger>
                      <SelectContent>
                        {sharedLocations.map((location) => (
                          <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-2 text-xs leading-5 text-[#7b8982]">{isEnglish ? "Only centers assigned to both the teacher and student are shown." : "Chỉ hiển thị các cơ sở có trong lịch của giáo viên và hồ sơ học sinh."}</p>
                  </div>
                )}

                {!query.isLoading && !query.isError && availabilityReady && (
                  query.data?.shifts.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {query.data.shifts.map((shift) => {
                        const status = getSlotStatus(selectedDay, shift.id);
                        const isAvailable = status === "available";
                        const isSelected = selectedShiftId === shift.id && isAvailable;
                        return (
                          <button
                            key={shift.id}
                            type="button"
                            disabled={!isAvailable}
                            aria-pressed={isSelected}
                            onClick={() => setSelectedShiftId(isSelected ? "" : shift.id)}
                            className={`flex min-h-[76px] items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5f9b8f] disabled:cursor-not-allowed ${isSelected ? "border-[#4e8e7f] bg-[#e7f3ed] ring-1 ring-[#4e8e7f]" : statusStyle(status)} ${isAvailable && !isSelected ? "hover:border-[#84b4a4] hover:bg-[#e7f3ed]" : ""}`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold">{shift.name}</span>
                              <span className="mt-1 flex items-center gap-1.5 text-xs opacity-80">
                                <Clock3 className="h-3.5 w-3.5" />
                                {shift.startTime} – {shift.endTime}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold">
                              {isSelected ? <Check className="h-4 w-4" /> : null}
                              {isSelected
                                ? (isEnglish ? "Selected" : "Đã chọn")
                                : getStatusLabel(status, isEnglish)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-[#d7e3dc] bg-[#fffefa] px-4 py-7 text-center">
                      <CalendarDays className="mx-auto h-5 w-5 text-[#7f9b90]" />
                      <p className="mt-2 text-sm font-medium text-[#526b62]">{isEnglish ? "No class shifts this month" : "Chưa có ca học trong tháng này"}</p>
                      <p className="mt-1 text-xs text-[#7d8983]">{isEnglish ? "Use the navigation above to view another month." : "Bạn có thể xem tháng khác bằng các nút điều hướng phía trên."}</p>
                    </div>
                  )
                )}

                {!query.isLoading && !query.isError && availabilityReady && Boolean(query.data?.shifts.length) && !selectedDay && (
                  <p className="mt-2 text-xs text-[#7b8982]">{isEnglish ? "No shift information is available for this day." : "Ngày này chưa có thông tin ca học trong lịch."}</p>
                )}
              </section>
            </main>

            <aside className="border-t border-[#e0e9e3] bg-[#eef4ef] p-4 sm:p-6 lg:border-l lg:border-t-0 lg:p-6">
              <div className="lg:sticky lg:top-0">
                <div className="mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#70877d]">{isEnglish ? "Registration details" : "Thông tin đăng ký"}</p>
                  <h2 className="mt-1 font-display text-lg font-semibold text-[#294640]">{isEnglish ? "Your selection" : "Tóm tắt lựa chọn"}</h2>
                </div>

                <div className="rounded-2xl border border-[#d9e5dd] bg-[#fffefa] p-4">
                  <div className="flex items-center gap-3 border-b border-[#e7ede8] pb-4">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[#d7e4dc] bg-[#dcece8]">
                      <TeacherAvatar teacher={teacher} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7a8c84]">{isEnglish ? "Teacher" : "Giáo viên"}</p>
                      <p className="mt-0.5 truncate text-sm font-semibold text-[#294640]">{teacher.fullName}</p>
                      {teacher.teachingSubjects.length > 0 && (
                        <p className="mt-0.5 truncate text-xs text-[#72837c]">{teacher.teachingSubjects.join(" · ")}</p>
                      )}
                    </div>
                  </div>

                  <dl className="space-y-4 py-4">
                    <div className="flex gap-3">
                      <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#6f9285]" />
                      <div className="min-w-0">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#829089]">{isEnglish ? "Student" : "Học sinh"}</dt>
                        <dd className="mt-0.5 truncate text-sm font-medium text-[#405c53]">{student.fullName}</dd>
                        <dd className="text-xs text-[#7b8982]">{isEnglish ? "Student code: " : "Mã học sinh: "}{student.code}</dd>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#6f9285]" />
                      <div className="min-w-0">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#829089]">{isEnglish ? "Center" : "Cơ sở"}</dt>
                        <dd className="mt-0.5 truncate text-sm font-medium text-[#405c53]">{selectedLocation?.name ?? (isEnglish ? "No center selected" : "Chưa chọn cơ sở")}</dd>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#6f9285]" />
                      <div className="min-w-0">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#829089]">{isEnglish ? "Lesson date" : "Ngày học"}</dt>
                        <dd className="mt-0.5 text-sm font-medium capitalize text-[#405c53]">{selectedDateLabel}</dd>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#6f9285]" />
                      <div className="min-w-0">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#829089]">{isEnglish ? "Class shift" : "Ca học"}</dt>
                        <dd className="mt-0.5 text-sm font-medium text-[#405c53]">
                          {selectedShift
                            ? `${selectedShift.name} · ${selectedShift.startTime}–${selectedShift.endTime}`
                            : (isEnglish ? "No shift selected" : "Chưa chọn ca")}
                        </dd>
                      </div>
                    </div>
                  </dl>

                  <div className="border-t border-[#e7ede8] pt-4">
                    <Button
                      type="button"
                      disabled
                      className="min-h-11 w-full rounded-xl bg-[#4d857a] font-semibold text-white opacity-60"
                      title={isEnglish ? "Booking submission will be available once the registration flow is ready." : "Tính năng đăng ký sẽ khả dụng khi hệ thống hoàn thiện."}
                    >
                      <GraduationCap className="mr-2 h-4 w-4" />
                      {isEnglish ? "Register now" : "Đăng ký ngay"}
                    </Button>
                    <p className="mt-2 text-center text-[11px] leading-5 text-[#7b8982]">
                      {isEnglish ? "Submitting a registration is not available yet." : "Tính năng xác nhận đăng ký chưa khả dụng."}
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-xs leading-5 text-[#74837c]">
                  {isEnglish
                    ? "Only available shifts can be selected. Viewing the schedule does not create a booking."
                    : "Chỉ các ca còn chỗ mới có thể được chọn. Việc xem lịch chưa tạo đăng ký."}
                </p>
              </div>
            </aside>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
