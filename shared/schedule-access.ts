export type ScheduleWritePermissions = {
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
};

export function isScheduleViewOnly(
  isSuperAdmin: boolean,
  permissions?: ScheduleWritePermissions | null,
): boolean {
  return !isSuperAdmin && !permissions?.canCreate && !permissions?.canEdit && !permissions?.canDelete;
}

export function isScheduleEntryVisible(options: {
  visibleClassIds: ReadonlySet<string> | null;
  staffId: string | null | undefined;
  classId?: string | null;
  teacherIds?: readonly string[] | null;
  sessionTeacherIds?: readonly string[] | null;
}): boolean {
  const { visibleClassIds, staffId, classId, teacherIds, sessionTeacherIds } = options;
  if (visibleClassIds === null) return true;
  if (classId && visibleClassIds.has(classId)) return true;
  if (!staffId) return false;
  return !!teacherIds?.includes(staffId) || !!sessionTeacherIds?.includes(staffId);
}