export type AttendanceStatusLabel = {
  label: string;
  color: string;
  badgeClass: string;
};

const ATTENDANCE_STATUS_LABELS: Record<string, AttendanceStatusLabel> = {
  pending: {
    label: "Chưa điểm danh",
    color: "text-muted-foreground",
    badgeClass: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  },
  present: {
    label: "Có học",
    color: "text-green-600 font-semibold",
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  absent: {
    label: "Nghỉ học",
    color: "text-red-500 font-semibold",
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  },
  makeup_wait: {
    label: "Nghỉ chờ bù",
    color: "text-orange-500 font-semibold",
    badgeClass: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200",
  },
  makeup_done: {
    label: "Đã học bù",
    color: "text-blue-600 font-semibold",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
  },
  paused: {
    label: "Bảo lưu",
    color: "text-yellow-600 font-semibold",
    badgeClass: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200",
  },
};

export function getAttendanceStatus(status: string | null | undefined): AttendanceStatusLabel {
  // A missing or unrecognized value must not leak internal English status codes
  // into the UI. The system's default attendance state is "Chưa điểm danh".
  return ATTENDANCE_STATUS_LABELS[status ?? ""] ?? ATTENDANCE_STATUS_LABELS.pending;
}