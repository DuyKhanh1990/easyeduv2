export interface SystemTrainingRoleCandidate {
  id: string;
  name: string;
  isSystemRole?: boolean;
  departmentName?: string;
  isSystemDepartment?: boolean;
}

function isDefaultTrainingRole(role: SystemTrainingRoleCandidate): boolean {
  return role.isSystemRole === true &&
    role.isSystemDepartment === true &&
    role.departmentName === "Phòng Đào tạo" &&
    (role.name === "Giáo viên" || role.name === "Trợ giảng");
}

export function getPreferredSystemTrainingTeacherRoleId(
  roles: SystemTrainingRoleCandidate[],
): string {
  const defaultRoles = roles.filter(isDefaultTrainingRole);
  const teacherRole = defaultRoles.find((role) => role.name === "Giáo viên");
  const hasAssistantRole = defaultRoles.some((role) => role.name === "Trợ giảng");
  return teacherRole && hasAssistantRole ? teacherRole.id : "";
}