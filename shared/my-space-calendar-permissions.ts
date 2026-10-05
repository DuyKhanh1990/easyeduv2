export type MySpaceCalendarPermissionFlags = {
  canView: boolean;
  canViewAll: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export type MySpaceCalendarAction = keyof MySpaceCalendarPermissionFlags;

export function normalizeMySpaceCalendarPermissions(
  permissions: Partial<MySpaceCalendarPermissionFlags> = {},
  isStudent = false,
): MySpaceCalendarPermissionFlags {
  return {
    canView: true,
    canViewAll: false,
    canCreate: isStudent ? false : permissions.canCreate === true,
    canEdit: isStudent ? false : permissions.canEdit === true,
    canDelete: false,
  };
}

export function canUseMySpaceCalendarAction(
  permissions: Partial<MySpaceCalendarPermissionFlags>,
  action: MySpaceCalendarAction,
): boolean {
  return normalizeMySpaceCalendarPermissions(permissions)[action];
}

export function isStaffAssignedToEffectiveFreeClassStudent(input: {
  staffId: string;
  registrationTeacherId?: string | null;
  dayTeacherId?: string | null;
  classTeacherIds: string[];
}): boolean {
  const effectiveTeacherId = input.registrationTeacherId || input.dayTeacherId || null;
  return effectiveTeacherId
    ? effectiveTeacherId === input.staffId
    : input.classTeacherIds.includes(input.staffId);
}