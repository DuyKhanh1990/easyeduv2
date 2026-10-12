export interface AttendanceDurationParts {
  days: number;
  hours: number;
  minutes: number;
}

export function normalizeAttendanceDuration(
  days: number,
  hours: number,
  minutes: number,
): AttendanceDurationParts {
  const totalMinutes = days * 1440 + hours * 60 + minutes;

  // Leave invalid values unchanged so the API can reject them rather than
  // silently converting them into a different duration.
  if (
    !Number.isInteger(days)
    || !Number.isInteger(hours)
    || !Number.isInteger(minutes)
    || days < 0
    || hours < 0
    || minutes < 0
    || !Number.isSafeInteger(totalMinutes)
  ) {
    return { days, hours, minutes };
  }

  return {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
  };
}
