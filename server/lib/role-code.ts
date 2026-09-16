export function defaultRoleCodePrefix(roleName: string | null | undefined): string {
  const name = String(roleName ?? "").trim();
  if (!name) return "";
  return `${name
    .split(/\s+/)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")}-`;
}

export function normalizeRoleCodePrefix(
  configuredPrefix: string | null | undefined,
  roleName: string | null | undefined,
): string {
  const raw = String(configuredPrefix ?? "").trim();
  const defaultPrefix = defaultRoleCodePrefix(roleName);
  const initials = defaultPrefix.slice(0, -1);
  const legacyPrefix = initials
    ? `${initials[0]}${initials.slice(1).toLowerCase()}-`
    : "";
  // Older roles used a title-cased initials format such as Ktt-. Treat that
  // known generated value as automatic, while preserving arbitrary manual
  // casing such as ktt- or KtT-.
  const prefix = !raw || raw === legacyPrefix ? defaultPrefix : raw;
  if (!prefix) return "";
  return prefix.endsWith("-") ? prefix : `${prefix}-`;
}

export function codeStem(
  configuredPrefix: string | null | undefined,
  roleName: string | null | undefined,
  byLocationRole: boolean | null | undefined,
  locationCode?: string | null,
): string {
  const prefix = normalizeRoleCodePrefix(configuredPrefix, roleName);
  if (!byLocationRole || !locationCode?.trim()) return prefix;
  return `${prefix}${locationCode.trim().toUpperCase()}-`;
}

export function nextCodeForStem(codes: Array<string | null | undefined>, stem: string): string {
  const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(`^${escapedStem}(\\d+)$`, "i");
  const maxNum = codes.reduce((max, code) => {
    const match = String(code ?? "").trim().match(matcher);
    const num = match ? Number.parseInt(match[1], 10) : 0;
    return Number.isFinite(num) && num > max ? num : max;
  }, 0);
  return `${stem}${(maxNum + 1).toString().padStart(2, "0")}`;
}