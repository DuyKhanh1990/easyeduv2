export type TeacherTimeRange = {
  start_time: string;
  end_time: string;
};

export type TeacherTimeAssignment = {
  teacherId: string;
  startTime: string;
  endTime: string;
  scheduleKey: string;
};

export type ShiftTimeLookup = Map<string, {
  startTime: string | null | undefined;
  endTime: string | null | undefined;
}>;

function toMinutes(value: string | null | undefined): number {
  if (!value) return -1;
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return -1;
  return hours * 60 + minutes;
}

function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60).toString().padStart(2, "0");
  const remainingMinutes = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${remainingMinutes}`;
}

function teacherCoversShift(teacher: any, scheduleKey: string): boolean {
  if (!teacher?.teacher_id) return false;
  if (teacher.mode === "all") return true;
  const keys = Array.isArray(teacher.shift_keys)
    ? teacher.shift_keys
    : Array.isArray(teacher.shiftKeys) ? teacher.shiftKeys : [];
  return teacher.mode === "specific" && keys.includes(scheduleKey);
}

export function getShiftScheduleKey(weekday: number, shiftIndex: number): string {
  return `${weekday}_shift${shiftIndex}`;
}

export function resolveShiftScheduleKey(
  scheduleConfig: any[],
  weekday: number,
  shiftTemplateId: string,
  roomId?: string | null,
): string | null {
  const day = (scheduleConfig || []).find((entry: any) => Number(entry?.weekday) === Number(weekday));
  const shifts = Array.isArray(day?.shifts) ? day.shifts : [];
  const normalizedRoomId = roomId && roomId !== "00000000-0000-0000-0000-000000000000" ? roomId : "";
  const exactRoomIndex = shifts.findIndex((shift: any) =>
    String(shift?.shift_template_id || shift?.shiftTemplateId || "") === String(shiftTemplateId) &&
    String(shift?.room_id || shift?.roomId || "") === normalizedRoomId
  );
  if (exactRoomIndex >= 0) return getShiftScheduleKey(Number(weekday), exactRoomIndex);

  const templateIndex = shifts.findIndex((shift: any) =>
    String(shift?.shift_template_id || shift?.shiftTemplateId || "") === String(shiftTemplateId)
  );
  return templateIndex >= 0 ? getShiftScheduleKey(Number(weekday), templateIndex) : null;
}

export function getTeacherTimeRange(
  teacher: any,
  scheduleKey: string,
  defaultStartTime: string,
  defaultEndTime: string,
): { startTime: string; endTime: string } {
  const configured = teacher?.shift_time_ranges?.[scheduleKey] as TeacherTimeRange | undefined;
  return {
    startTime: String(configured?.start_time || defaultStartTime).slice(0, 5),
    endTime: String(configured?.end_time || defaultEndTime).slice(0, 5),
  };
}

export function buildTeacherTimeAssignments(
  teachersConfig: any[],
  scheduleKey: string,
  defaultStartTime: string,
  defaultEndTime: string,
): TeacherTimeAssignment[] {
  const seen = new Set<string>();
  const assignments: TeacherTimeAssignment[] = [];

  for (const teacher of teachersConfig || []) {
    const teacherId = String(teacher?.teacher_id || "");
    if (!teacherId || seen.has(teacherId) || !teacherCoversShift(teacher, scheduleKey)) continue;
    seen.add(teacherId);
    const range = getTeacherTimeRange(teacher, scheduleKey, defaultStartTime, defaultEndTime);
    assignments.push({
      teacherId,
      startTime: range.startTime,
      endTime: range.endTime,
      scheduleKey,
    });
  }

  return assignments;
}

export type TeacherCoverageIssue = {
  scheduleKey: string;
  label: string;
  message: string;
};

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export function validateTeacherTimeCoverage(
  scheduleConfig: any[],
  teachersConfig: any[],
  shiftTimes: ShiftTimeLookup,
): TeacherCoverageIssue[] {
  const issues: TeacherCoverageIssue[] = [];

  for (const day of scheduleConfig || []) {
    const weekday = Number(day?.weekday);
    for (let index = 0; index < (day?.shifts || []).length; index += 1) {
      const shift = day.shifts[index];
      const shiftId = String(shift?.shift_template_id || shift?.shiftTemplateId || "");
      if (!shiftId) continue;
      const shiftTime = shiftTimes.get(shiftId);
      const start = toMinutes(shiftTime?.startTime);
      const end = toMinutes(shiftTime?.endTime);
      if (start < 0 || end <= start) continue;

      const scheduleKey = getShiftScheduleKey(weekday, index);
      const weekdayLabel = WEEKDAY_LABELS[weekday] || `Thứ ${weekday}`;
      const shiftLabel = shift?.name || `Ca ${index + 1}`;
      const label = `${weekdayLabel}-${shiftLabel}`;
      const assignments = buildTeacherTimeAssignments(
        teachersConfig,
        scheduleKey,
        String(shiftTime?.startTime),
        String(shiftTime?.endTime),
      );
      const covered: Array<{ start: number; end: number }> = [];

      for (const assignment of assignments) {
        const assignmentStart = toMinutes(assignment.startTime);
        const assignmentEnd = toMinutes(assignment.endTime);
        if (
          assignmentStart < start ||
          assignmentEnd > end ||
          assignmentStart < 0 ||
          assignmentEnd <= assignmentStart
        ) {
          issues.push({
            scheduleKey,
            label,
            message: `${label}: giờ của giáo viên phải nằm trong ca ${formatTime(start)}–${formatTime(end)}.`,
          });
          continue;
        }
        covered.push({ start: assignmentStart, end: assignmentEnd });
      }

      covered.sort((a, b) => a.start - b.start || a.end - b.end);
      let cursor = start;
      for (const interval of covered) {
        if (interval.start > cursor) {
          issues.push({
            scheduleKey,
            label,
            message: `${label}: chưa có giáo viên từ ${formatTime(cursor)} đến ${formatTime(interval.start)}.`,
          });
        }
        cursor = Math.max(cursor, interval.end);
      }
      if (cursor < end) {
        issues.push({
          scheduleKey,
          label,
          message: `${label}: chưa có giáo viên từ ${formatTime(cursor)} đến ${formatTime(end)}.`,
        });
      }
    }
  }

  return issues;
}