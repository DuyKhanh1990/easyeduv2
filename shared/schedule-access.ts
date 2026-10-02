export type ScheduleWritePermissions = {
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
};

export type ScheduleWriteCapabilities = {
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export function getScheduleWriteCapabilities(
  isSuperAdmin: boolean,
  permissions?: ScheduleWritePermissions | null,
): ScheduleWriteCapabilities {
  const canDelete = isSuperAdmin || !!permissions?.canDelete;
  const canEdit = canDelete || !!permissions?.canEdit;
  return {
    canAdd: canEdit || !!permissions?.canCreate,
    canEdit,
    canDelete,
  };
}

export function canScheduleWrite(
  permissions: ScheduleWritePermissions | null | undefined,
  action: "canCreate" | "canEdit" | "canDelete",
): boolean {
  if (permissions?.canDelete) return true;
  if (action === "canDelete") return false;
  if (permissions?.canEdit) return true;
  return action === "canCreate" && !!permissions?.canCreate;
}

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