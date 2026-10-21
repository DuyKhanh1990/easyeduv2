export type TeacherAttendancePermission = {
  canView: boolean;
  canViewAll: boolean;
};

export function resolveTeacherAttendanceScope(input: {
  isSuperAdmin: boolean;
  permission: TeacherAttendancePermission;
  staffId: string | null | undefined;
}): { allowed: boolean; staffId: string | null } {
  if (input.isSuperAdmin || input.permission.canViewAll) {
    return { allowed: true, staffId: null };
  }

  if (!input.permission.canView || !input.staffId) {
    return { allowed: false, staffId: null };
  }

  return { allowed: true, staffId: input.staffId };
}
