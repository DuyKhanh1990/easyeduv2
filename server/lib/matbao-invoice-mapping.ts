export function isCoursePackageType(packageType: string | null | undefined): boolean {
  const normalized = String(packageType ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  return normalized === "course" || normalized.includes("khoa");
}

export function getMatBaoInvoiceQuantity(
  packageType: string | null | undefined,
  quantity: number | null | undefined,
): number {
  return isCoursePackageType(packageType) ? 1 : quantity ?? 1;
}
