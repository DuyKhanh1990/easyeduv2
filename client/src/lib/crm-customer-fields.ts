export type CrmConfigurableField = {
  key: string;
  label: string;
  group: "system" | "account" | "contact" | "parent" | "crm" | "school" | "other" | "additional";
};

export const CUSTOM_FIELD_KEY_PREFIX = "custom:";

export function makeCustomFieldKey(id: string): string {
  return `${CUSTOM_FIELD_KEY_PREFIX}${id}`;
}

export function parseCustomFieldKey(key: string): string | null {
  return key.startsWith(CUSTOM_FIELD_KEY_PREFIX) ? key.slice(CUSTOM_FIELD_KEY_PREFIX.length) : null;
}

export const CRM_CONFIGURABLE_FIELDS: CrmConfigurableField[] = [
  { key: "avatarUrl", label: "Ảnh đại diện", group: "account" },
  { key: "username", label: "Tài khoản", group: "account" },
  { key: "password", label: "Mật khẩu", group: "account" },
  { key: "accountStatus", label: "Trạng thái tài khoản", group: "account" },

  { key: "dateOfBirth", label: "Ngày sinh", group: "contact" },
  { key: "phone", label: "Số điện thoại", group: "contact" },
  { key: "email", label: "Email", group: "contact" },
  { key: "address", label: "Địa chỉ", group: "contact" },
  { key: "socialLink", label: "Zalo / Facebook", group: "contact" },

  { key: "parentName", label: "Họ tên Phụ huynh 1", group: "parent" },
  { key: "parentPhone", label: "SĐT Phụ huynh 1", group: "parent" },
  { key: "parentName2", label: "Họ tên Phụ huynh 2", group: "parent" },
  { key: "parentPhone2", label: "SĐT Phụ huynh 2", group: "parent" },
  { key: "parentName3", label: "Họ tên Phụ huynh 3", group: "parent" },
  { key: "parentPhone3", label: "SĐT Phụ huynh 3", group: "parent" },
  { key: "parentIds", label: "Phụ huynh (tài khoản hệ thống)", group: "parent" },
  { key: "relationshipIds", label: "Mối quan hệ", group: "parent" },

  { key: "customerSourceIds", label: "Nguồn khách hàng", group: "crm" },
  { key: "rejectReason", label: "Lý do từ chối", group: "crm" },
  { key: "salesByIds", label: "Nhân viên Sale", group: "crm" },
  { key: "managedByIds", label: "Người quản lý", group: "crm" },

  { key: "classIds", label: "Lớp học", group: "school" },
  { key: "teacherIds", label: "Giáo viên", group: "school" },
  { key: "academicLevel", label: "Trình độ", group: "school" },

  { key: "note", label: "Ghi chú", group: "other" },
];

export const CRM_FIELD_GROUP_LABELS: Record<CrmConfigurableField["group"], string> = {
  system: "Hệ thống",
  account: "Tài khoản",
  contact: "Liên hệ",
  parent: "Phụ huynh",
  crm: "CRM / Sale",
  school: "Lớp & Giáo viên",
  other: "Khác",
  additional: "Thông tin bổ sung",
};

export function getCrmFieldLabel(
  key: string,
  customFields?: { id: string; label: string }[],
): string {
  const customId = parseCustomFieldKey(key);
  if (customId) {
    return customFields?.find(c => c.id === customId)?.label ?? key;
  }
  return CRM_CONFIGURABLE_FIELDS.find(f => f.key === key)?.label ?? key;
}
