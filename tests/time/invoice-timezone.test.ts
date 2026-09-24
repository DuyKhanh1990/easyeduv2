import { describe, expect, it } from "vitest";
import { fmtDate, getInvoiceBusinessDateKey } from "../../client/src/types/invoice-types";

describe("invoice instant dates in the Center timezone", () => {
  it("uses the Center calendar date for instants near UTC midnight", () => {
    const instant = "2024-01-01T00:30:00.000Z";

    expect(getInvoiceBusinessDateKey(instant, "Asia/Ho_Chi_Minh")).toBe("2024-01-01");
    expect(getInvoiceBusinessDateKey(instant, "America/Los_Angeles")).toBe("2023-12-31");
    expect(fmtDate(instant, "America/Los_Angeles")).toBe("31/12/2023");
  });

  it("keeps date-only values unchanged regardless of Center timezone", () => {
    expect(getInvoiceBusinessDateKey("2024-01-01", "America/Los_Angeles")).toBe("2024-01-01");
    expect(fmtDate("2024-01-01", "America/Los_Angeles")).toBe("01/01/2024");
  });
});