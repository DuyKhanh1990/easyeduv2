export const CENTER_TIME_ZONE = "Asia/Bangkok";

export function formatCenterTimestamp(
  value: string | Date | null | undefined,
  timeZone = CENTER_TIME_ZONE,
  options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  },
): string {
  if (!value) return "—";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("vi-VN", {
    ...options,
    timeZone,
  }).format(date);
}