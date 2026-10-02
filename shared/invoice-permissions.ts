export const INVOICE_SCOPE_KEYS = [
  "thu_unpaid",
  "thu_paid",
  "thu_confirmed",
  "chi_unpaid",
  "chi_paid",
  "chi_confirmed",
] as const;

export type InvoiceScopeKey = typeof INVOICE_SCOPE_KEYS[number];
export type InvoicePermissionAction =
  | "canView"
  | "canViewAll"
  | "canCreate"
  | "canEdit"
  | "canDelete";

export type InvoicePermissionFlags = Record<InvoicePermissionAction, boolean>;
export type InvoiceScopePermissions = Record<InvoiceScopeKey, InvoicePermissionFlags>;
export type LegacyInvoicePermissions = InvoicePermissionFlags;

export const INVOICE_SCOPE_LABEL_KEYS: Record<InvoiceScopeKey, string> = {
  thu_unpaid: "settings.permissions.invoiceScope.thuUnpaid",
  thu_paid: "settings.permissions.invoiceScope.thuPaid",
  thu_confirmed: "settings.permissions.invoiceScope.thuConfirmed",
  chi_unpaid: "settings.permissions.invoiceScope.chiUnpaid",
  chi_paid: "settings.permissions.invoiceScope.chiPaid",
  chi_confirmed: "settings.permissions.invoiceScope.chiConfirmed",
};

export function emptyInvoiceScopePermissions(): InvoiceScopePermissions {
  return Object.fromEntries(
    INVOICE_SCOPE_KEYS.map((key) => [
      key,
      { canView: false, canViewAll: false, canCreate: false, canEdit: false, canDelete: false },
    ]),
  ) as InvoiceScopePermissions;
}

export function fullInvoiceScopePermissions(): InvoiceScopePermissions {
  return Object.fromEntries(
    INVOICE_SCOPE_KEYS.map((key) => [
      key,
      { canView: true, canViewAll: true, canCreate: true, canEdit: true, canDelete: true },
    ]),
  ) as InvoiceScopePermissions;
}

export function buildInvoiceScopePermissions(
  rows: Array<InvoicePermissionFlags & {
    resource: string;
    invoiceScopes?: string[] | null;
  }>,
): InvoiceScopePermissions {
  const result = emptyInvoiceScopePermissions();

  for (const row of rows) {
    if (row.resource !== "/invoices") continue;
    // A null value is a legacy permission record created before invoice scopes
    // existed. Treat it as unrestricted so existing role access is unchanged.
    const scopes = row.invoiceScopes === null || row.invoiceScopes === undefined
      ? INVOICE_SCOPE_KEYS
      : row.invoiceScopes;

    for (const key of scopes) {
      if (!(INVOICE_SCOPE_KEYS as readonly string[]).includes(key)) continue;
      const scopeKey = key as InvoiceScopeKey;
      for (const action of ["canView", "canViewAll", "canCreate", "canEdit", "canDelete"] as const) {
        result[scopeKey][action] ||= row[action];
      }
    }
  }

  return result;
}

export function buildLegacyInvoicePermissions(
  rows: Array<InvoicePermissionFlags & {
    resource: string;
    invoiceScopes?: string[] | null;
  }>,
): LegacyInvoicePermissions {
  return rows
    .filter((row) => row.resource === "/invoices" && row.invoiceScopes == null)
    .reduce(
      (result, row) => ({
        canView: result.canView || row.canView,
        canViewAll: result.canViewAll || row.canViewAll,
        canCreate: result.canCreate || row.canCreate,
        canEdit: result.canEdit || row.canEdit,
        canDelete: result.canDelete || row.canDelete,
      }),
      { canView: false, canViewAll: false, canCreate: false, canEdit: false, canDelete: false },
    );
}

export function getInvoiceScopeKey(type: string | null | undefined, status: string | null | undefined): InvoiceScopeKey | null {
  const typePrefix = type === "Thu" ? "thu" : type === "Chi" ? "chi" : null;
  if (!typePrefix) return null;

  const statusSuffix = status === "paid"
    ? "paid"
    : status === "confirmed"
      ? "confirmed"
      : ["unpaid", "partial", "debt"].includes(status ?? "")
        ? "unpaid"
        : null;
  if (!statusSuffix) return null;

  return `${typePrefix}_${statusSuffix}` as InvoiceScopeKey;
}

export function hasInvoiceScopePermission(
  scopePermissions: InvoiceScopePermissions,
  action: InvoicePermissionAction,
  type: string | null | undefined,
  status: string | null | undefined,
): boolean {
  const key = getInvoiceScopeKey(type, status);
  return key ? scopePermissions[key][action] : false;
}