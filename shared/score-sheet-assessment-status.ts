export type ScoreSheetAssessmentStatus =
  | "not_started"
  | "in_progress"
  | "processing"
  | "completed";

export type ScoreSheetAssessmentDeadlineStatus = "within_deadline" | "overdue";

export type ScoreSheetAssessmentStatusInput = {
  examDate: string;
  scoreDeadlineAt: string | null;
  studentCount: number;
  enteredStudentCount: number;
  completedStudentCount: number;
  published?: boolean;
  allStudentsIndividuallyPublished?: boolean;
};

function parseBangkokDateStart(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.slice(0, 10));
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const timestamp = Date.UTC(year, month - 1, day);
  return new Date(timestamp).toISOString().slice(0, 10) === `${yearText}-${monthText}-${dayText}`
    ? timestamp
    : null;
}

function parseBangkokDeadline(value: string | null): number | null {
  const match = value && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (hour > 23 || minute > 59) return null;

  const timestamp = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(timestamp).toISOString().slice(0, 16) === value ? timestamp : null;
}

export function resolveScoreSheetAssessmentDeadlineStatus(
  scoreDeadlineAt: string | null,
  nowBangkokWallClockMs: number,
): ScoreSheetAssessmentDeadlineStatus | null {
  const deadline = parseBangkokDeadline(scoreDeadlineAt);
  if (deadline === null) return null;
  return nowBangkokWallClockMs <= deadline ? "within_deadline" : "overdue";
}

export function resolveScoreSheetAssessmentStatus(
  assessment: ScoreSheetAssessmentStatusInput,
  nowBangkokWallClockMs: number,
): ScoreSheetAssessmentStatus | null {
  const studentCount = Number.isFinite(assessment.studentCount)
    ? Math.max(0, assessment.studentCount)
    : 0;
  const completedStudentCount = Number.isFinite(assessment.completedStudentCount)
    ? Math.max(0, Math.min(assessment.completedStudentCount, studentCount))
    : 0;
  const allStudentsComplete = studentCount > 0 && completedStudentCount >= studentCount;
  const allStudentsPublished = assessment.published === true
    || assessment.allStudentsIndividuallyPublished === true;

  if (allStudentsComplete && allStudentsPublished) return "completed";
  if (
    assessment.enteredStudentCount > 0
    && (!allStudentsComplete || !allStudentsPublished)
  ) return "processing";

  const examDateStart = parseBangkokDateStart(assessment.examDate);
  if (examDateStart === null) return null;
  if (nowBangkokWallClockMs < examDateStart) return "not_started";

  const deadline = parseBangkokDeadline(assessment.scoreDeadlineAt);
  if (deadline !== null && nowBangkokWallClockMs <= deadline) return "in_progress";

  return null;
}