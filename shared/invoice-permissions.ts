export const INVOICE_SCOPE_KEYS = [
  "thu_unpaid",
  "thu_paid",
  "thu_confirmed",
  "chi_unpaid",
  "chi_paid",
  "chi_confirmed",
] as const;

export type InvoiceScopeKey = typeof INVOICE_SCOPE_KEYS[number];
export type InvoiceScopePermissions = Record<InvoiceScopeKey, boolean>;

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
    INVOICE_SCOPE_KEYS.map((key) => [key, false]),
  ) as InvoiceScopePermissions;
}

export function fullInvoiceScopePermissions(): InvoiceScopePermissions {
  return Object.fromEntries(
    INVOICE_SCOPE_KEYS.map((key) => [key, true]),
  ) as InvoiceScopePermissions;
}

export function buildInvoiceScopePermissions(
  rows: Array<{
    resource: string;
    canView: boolean;
    canViewAll: boolean;
    invoiceScopes?: string[] | null;
  }>,
): InvoiceScopePermissions {
  const result = emptyInvoiceScopePermissions();

  for (const row of rows) {
    if (row.resource !== "/invoices" || (!row.canView && !row.canViewAll)) continue;
    // A null value is a legacy permission record created before invoice scopes
    // existed. Treat it as unrestricted so existing role access is unchanged.
    const scopes = row.invoiceScopes === null || row.invoiceScopes === undefined
      ? INVOICE_SCOPE_KEYS
      : row.invoiceScopes;

    for (const key of scopes) {
      if (!(INVOICE_SCOPE_KEYS as readonly string[]).includes(key)) continue;
      const scopeKey = key as InvoiceScopeKey;
      result[scopeKey] = true;
    }
  }

  return result;
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