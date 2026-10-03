export type TeacherRoleChanges = Record<string, string | null>;

export function mergeSelectedTeacherRoleIds(
  currentRoleIds: unknown,
  selectedTeacherIds: string[],
  roleChanges: TeacherRoleChanges = {},
): Record<string, string> {
  const current = currentRoleIds && typeof currentRoleIds === "object" && !Array.isArray(currentRoleIds)
    ? currentRoleIds as Record<string, unknown>
    : {};
  const selectedIds = new Set(selectedTeacherIds);
  const next: Record<string, string> = {};

  for (const teacherId of selectedIds) {
    if (Object.prototype.hasOwnProperty.call(roleChanges, teacherId)) {
      const changedRoleId = roleChanges[teacherId];
      if (typeof changedRoleId === "string" && changedRoleId.trim()) {
        next[teacherId] = changedRoleId.trim();
      }
      continue;
    }

    const currentRoleId = current[teacherId];
    if (typeof currentRoleId === "string" && currentRoleId.trim()) {
      next[teacherId] = currentRoleId.trim();
    }
  }

  return next;
}