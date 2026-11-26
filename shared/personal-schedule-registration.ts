export const PERSONAL_SCHEDULE_REGISTRATION_SETTINGS_KEY = "personalScheduleRegistrationPolicy";

export type PersonalScheduleRegistrationPolicy = {
  registrationAdvanceHours: number;
  cancellationAdvanceHours: number;
};

export const DEFAULT_PERSONAL_SCHEDULE_REGISTRATION_POLICY: PersonalScheduleRegistrationPolicy = {
  registrationAdvanceHours: 0,
  cancellationAdvanceHours: 0,
};

const BANGKOK_OFFSET = "+07:00";

export function isPersonalScheduleRegistrationOpen(
  sessionDate: string,
  startTime: string,
  registrationAdvanceHours: number,
  now = Date.now(),
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate) || !/^([01]\d|2[0-3]):[0-5]\d/.test(startTime)) {
    return false;
  }
  const normalizedTime = startTime.slice(0, 5);
  const sessionStart = Date.parse(`${sessionDate}T${normalizedTime}:00${BANGKOK_OFFSET}`);
  if (!Number.isFinite(sessionStart) || sessionStart <= now) return false;
  const leadHours = Number.isInteger(registrationAdvanceHours) && registrationAdvanceHours >= 0
    ? registrationAdvanceHours
    : 0;
  return sessionStart - now >= leadHours * 60 * 60 * 1000;
}
