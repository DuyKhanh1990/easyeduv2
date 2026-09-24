import { formatCenterInstant } from "@shared/center-time";

export function formatCenterTimestamp(
  value: string | Date | null | undefined,
  timeZone: string | undefined,
  options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  },
): string {
  if (!value || !timeZone) return "—";
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) return "—";
  return formatCenterInstant(instant, timeZone, options);
}