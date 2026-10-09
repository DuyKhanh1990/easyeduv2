import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ db: {} }));

import {
  canOverrideAutoInvoice,
  DEFAULT_AUTO_INVOICE_ENABLED,
  resolveAutoInvoiceValue,
} from "./auto-invoice-policy";

describe("automatic invoice policy", () => {
  const policy = {
    defaultEnabled: DEFAULT_AUTO_INVOICE_ENABLED,
    roleIds: ["allowed-role"],
  };

  it("defaults to enabled when no saved setting exists", () => {
    expect(DEFAULT_AUTO_INVOICE_ENABLED).toBe(true);
  });

  it("forces the configured default for roles outside the override list", () => {
    expect(resolveAutoInvoiceValue({ roleIds: ["other-role"] }, policy, false)).toBe(true);
    expect(resolveAutoInvoiceValue({ roleIds: [] }, { ...policy, defaultEnabled: false }, true)).toBe(false);
  });

  it("allows listed roles to choose either value and defaults missing choices", () => {
    const user = { roleIds: ["allowed-role"] };
    expect(resolveAutoInvoiceValue(user, policy, false)).toBe(false);
    expect(resolveAutoInvoiceValue(user, policy, true)).toBe(true);
    expect(resolveAutoInvoiceValue(user, policy, undefined)).toBe(true);
  });

  it("always lets Super Admin override regardless of the selected roles", () => {
    expect(canOverrideAutoInvoice({ isSuperAdmin: true, roleIds: [] }, policy)).toBe(true);
    expect(resolveAutoInvoiceValue({ isSuperAdmin: true }, policy, false)).toBe(false);
  });
});
