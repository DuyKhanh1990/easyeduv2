export const STUDENT_EXPORT_HEADERS = [
  "Mã số", "Họ và tên (*)", "Cơ sở", "Phân loại (*)", "Giới tính", "SĐT", "Ngày sinh", "Email",
  "PH 1", "SĐT PH 1", "PH 2", "SĐT PH 2", "PH 3", "SĐT PH 3",
  "Mối quan hệ (*)", "Nguồn", "Lý do từ chối", "Sale", "Quản lý", "Giáo viên",
  "Mã lớp", "Địa chỉ", "Zalo/FB", "Trình độ", "Ghi chú",
] as const;

export const STUDENT_UPLOAD_HEADERS = [
  ...STUDENT_EXPORT_HEADERS.slice(0, 5),
  "Tài khoản",
  "Mật khẩu",
  ...STUDENT_EXPORT_HEADERS.slice(5),
];

const normalizeHeader = (header: unknown) =>
  String(header ?? "").trim().toLocaleLowerCase();

/**
 * Returns rows in the original import field order, with account/password and
 * gender appended. This keeps established indexes stable even though gender
 * appears after "Phân loại" in the spreadsheet.
 */
export function mapStudentImportRows(rows: unknown[][]): unknown[][] {
  const headers = rows[0] ?? [];
  const sourceColumnIndexes = new Map<string, number>();
  const baseHeaders = STUDENT_EXPORT_HEADERS.filter(
    (header) => normalizeHeader(header) !== normalizeHeader("Giới tính"),
  );

  headers.forEach((header, index) => {
    sourceColumnIndexes.set(normalizeHeader(header), index);
  });

  const recognizedHeaders = new Set([
    ...STUDENT_EXPORT_HEADERS.map(normalizeHeader),
    "tài khoản",
    "mật khẩu",
  ]);
  const hasRecognizedHeaders = headers.some((header) =>
    recognizedHeaders.has(normalizeHeader(header))
  );
  const accountIndex = sourceColumnIndexes.get("tài khoản");
  const passwordIndex = sourceColumnIndexes.get("mật khẩu");

  return rows.slice(1).map((sourceRow) => {
    // Keep the established internal row indexes stable. Gender is appended
    // after credentials so adding it after column D won't shift other fields.
    const originalFields = baseHeaders.map((header, index) => {
      const mappedIndex = sourceColumnIndexes.get(normalizeHeader(header));
      if (mappedIndex !== undefined) return sourceRow[mappedIndex];
      if (hasRecognizedHeaders) return "";

      // Preserve positional fallback only for files without recognizable headers.
      const fallbackIndex = index >= 20 ? index + 1 : index;
      return sourceRow[fallbackIndex];
    });

    return [
      ...originalFields,
      accountIndex === undefined ? "" : sourceRow[accountIndex],
      passwordIndex === undefined ? "" : sourceRow[passwordIndex],
      sourceColumnIndexes.has(normalizeHeader("Giới tính"))
        ? sourceRow[sourceColumnIndexes.get(normalizeHeader("Giới tính"))!]
        : "",
    ];
  });
}

export function resolveStudentImportCredentials(
  codeValue: unknown,
  accountValue: unknown,
  passwordValue: unknown,
): { username?: string; password: string } {
  const code = codeValue == null ? "" : String(codeValue).trim();
  const account = accountValue == null ? "" : String(accountValue).trim();
  const hasPassword = passwordValue != null && String(passwordValue) !== "";

  return {
    username: account || code || undefined,
    password: hasPassword ? String(passwordValue) : "123456",
  };
}

export type StudentImportLocation = {
  id: string;
  name: string;
};

function normalizeStudentImportLocationName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .toLocaleLowerCase("vi")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchStudentImportLocation<T extends StudentImportLocation>(
  value: unknown,
  locations: readonly T[],
): { location: T | null; ambiguous: boolean } {
  const name = String(value ?? "").trim();
  if (!name) return { location: null, ambiguous: false };

  const exactMatches = locations.filter((location) => location.name.trim() === name);
  if (exactMatches.length === 1) return { location: exactMatches[0], ambiguous: false };
  if (exactMatches.length > 1) return { location: null, ambiguous: true };

  const normalizedName = normalizeStudentImportLocationName(name);
  const normalizedMatches = locations.filter(
    (location) => normalizeStudentImportLocationName(location.name) === normalizedName,
  );
  if (normalizedMatches.length === 1) {
    return { location: normalizedMatches[0], ambiguous: false };
  }

  return { location: null, ambiguous: normalizedMatches.length > 1 };
}
