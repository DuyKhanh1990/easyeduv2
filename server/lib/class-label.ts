export function formatClassLabel(
  name: string | null | undefined,
  code: string | null | undefined,
  fallback = "Lớp học",
): string {
  const className = name?.trim() ?? "";
  const classCode = code?.trim() ?? "";

  if (className && classCode && className !== classCode) {
    return `${className} (${classCode})`;
  }
  return className || classCode || fallback;
}
