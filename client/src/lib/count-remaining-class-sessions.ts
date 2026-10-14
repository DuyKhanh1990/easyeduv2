import { format } from "date-fns";

function dateKey(value: Date | string | null | undefined): string {
  if (!value) return "";
  return value instanceof Date ? format(value, "yyyy-MM-dd") : String(value).slice(0, 10);
}

export function countRemainingClassSessions(
  sessions: any[] | undefined,
  startDate: Date | string | null | undefined,
  endDate?: Date | string | null,
  selectedShiftKeys?: string[],
): number {
  const startKey = dateKey(startDate);
  const endKey = dateKey(endDate);
  if (!startKey || !sessions?.length) return 0;

  return sessions.filter((session) => {
    const sessionDate = dateKey(session.sessionDate);
    if (!sessionDate || sessionDate < startKey || (endKey && sessionDate > endKey)) return false;
    if (session.status === "cancelled") return false;
    if (selectedShiftKeys?.length) {
      const shiftId = session.shiftTemplateId || session.shiftTemplate?.id;
      if (!selectedShiftKeys.includes(`${session.weekday}_${shiftId}`)) return false;
    }
    return true;
  }).length;
}
