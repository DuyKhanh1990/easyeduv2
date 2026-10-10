import { describe, expect, it } from "vitest";
import {
  getInvoiceStatusActionPermission,
  invoiceStatusMatchesVisibilityPermission,
} from "../shared/invoice-visibility-permissions";

describe("invoice visibility status permissions", () => {
  it("treats partial invoices as part of the unpaid permission", () => {
    expect(invoiceStatusMatchesVisibilityPermission("unpaid", "unpaid")).toBe(true);
    expect(invoiceStatusMatchesVisibilityPermission("partial", "unpaid")).toBe(true);
    expect(invoiceStatusMatchesVisibilityPermission("paid", "unpaid")).toBe(false);
    expect(invoiceStatusMatchesVisibilityPermission("confirmed", "unpaid")).toBe(false);
  });

  it("keeps paid and confirmed visibility separate", () => {
    expect(invoiceStatusMatchesVisibilityPermission("paid", "paid")).toBe(true);
    expect(invoiceStatusMatchesVisibilityPermission("confirmed", "confirmed")).toBe(true);
    expect(invoiceStatusMatchesVisibilityPermission("confirmed", "paid")).toBe(false);
    expect(invoiceStatusMatchesVisibilityPermission("paid", "confirmed")).toBe(false);
  });

  it("does not expose cancelled or missing statuses through these scopes", () => {
    expect(invoiceStatusMatchesVisibilityPermission("cancelled", "unpaid")).toBe(false);
    expect(invoiceStatusMatchesVisibilityPermission(undefined, "paid")).toBe(false);
  });

  it("maps manual status changes by target state, regardless of the source state", () => {
    expect(getInvoiceStatusActionPermission("confirmed")?.value).toBe("status-confirmed");
    expect(getInvoiceStatusActionPermission("paid")?.value).toBe("status-paid");
    expect(getInvoiceStatusActionPermission("unpaid")?.value).toBe("status-unpaid");
    expect(getInvoiceStatusActionPermission("partial")).toBeUndefined();
  });
});
