export interface StaffRoleOption {
  id: string;
  name: string;
}

export function getStaffRoleOptions(staffMember: any, locationId?: string): StaffRoleOption[] {
  const assignments = Array.isArray(staffMember?.assignments) ? staffMember.assignments : [];
  const options = new Map<string, StaffRoleOption>();

  for (const assignment of assignments) {
    const roleId = String(assignment?.roleId ?? assignment?.role?.id ?? "");
    const roleName = String(assignment?.role?.name ?? assignment?.roleName ?? "");
    if (!roleId || !roleName) continue;
    if (locationId && String(assignment?.locationId ?? "") !== locationId) continue;
    if (!options.has(roleId)) options.set(roleId, { id: roleId, name: roleName });
  }

  return [...options.values()].sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

export function resolveTeacherRoleId(teacherConfig: any, options: StaffRoleOption[]): string {
  const savedRoleId = String(teacherConfig?.role_id ?? teacherConfig?.roleId ?? "");
  if (savedRoleId && options.some((option) => option.id === savedRoleId)) return savedRoleId;
  return options.length === 1 ? options[0].id : "";
}