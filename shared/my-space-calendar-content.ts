export function isCurriculumContentType(contentType: unknown): boolean {
  if (typeof contentType !== "string") return false;
  const normalized = contentType.trim().toLocaleLowerCase("vi");
  return normalized === "curriculum" || normalized === "giáo trình";
}
