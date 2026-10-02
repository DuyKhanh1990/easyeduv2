import { describe, expect, it } from "vitest";
import {
  INVOICE_SCOPE_KEYS,
  buildInvoiceScopePermissions,
  emptyInvoiceScopePermissions,
  getInvoiceScopeKey,
} from "../shared/invoice-permissions";

describe("invoice visibility scopes", () => {
  it("only includes explicitly selected scopes from roles that can view invoices", () => {
    const scopes = buildInvoiceScopePermissions([
      {
        resource: "/invoices",
        canView: true,
        canViewAll: false,
        invoiceScopes: ["thu_unpaid", "chi_paid"],
      },
      {
        resource: "/invoices",
        canView: false,
        canViewAll: false,
        invoiceScopes: ["thu_confirmed"],
      },
      {
        resource: "/news-feed",
        canView: true,
        canViewAll: true,
        invoiceScopes: ["chi_confirmed"],
      },
    ]);

    expect(scopes).toEqual({
      ...emptyInvoiceScopePermissions(),
      thu_unpaid: true,
      chi_paid: true,
    });
  });

  it("treats legacy view permissions without stored scopes as unrestricted", () => {
    const scopes = buildInvoiceScopePermissions([{
      resource: "/invoices",
      canView: false,
      canViewAll: true,
      invoiceScopes: null,
    }]);

    expect(scopes).toEqual(Object.fromEntries(INVOICE_SCOPE_KEYS.map(scope => [scope, true])));
  });

  it("maps partial and debt invoices to the unpaid visibility scope", () => {
    expect(getInvoiceScopeKey("Thu", "partial")).toBe("thu_unpaid");
    expect(getInvoiceScopeKey("Chi", "debt")).toBe("chi_unpaid");
    expect(getInvoiceScopeKey("Thu", "paid")).toBe("thu_paid");
    expect(getInvoiceScopeKey("Chi", "confirmed")).toBe("chi_confirmed");
    expect(getInvoiceScopeKey("Thu", "cancelled")).toBeNull();
  });
});