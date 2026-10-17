export function canStaffViewAssignedScoreSheetAssessment(input: {
  hasConversion: boolean;
  isSessionTeacher: boolean;
  isClassManager: boolean;
}) {
  if (!input.hasConversion) return true;
  return input.isSessionTeacher || input.isClassManager;
}
