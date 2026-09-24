import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  centerInstantRangeConditions,
  getCenterDayRangeInstants,
  invoiceBusinessDateOnly,
  normalizeInvoiceInstant,
} from "../../server/lib/invoice-time";

describe("invoice timestamp normalization", () => {
  it("converts a manual YYYY-MM-DD value to midnight in the Center timezone", () => {
    const parsedDate = new Date("2026-03-29T00:00:00.000Z");
    const instant = normalizeInvoiceInstant(parsedDate, "2026-03-29", "Europe/Berlin");

    expect(instant?.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(invoiceBusinessDateOnly(instant, "2026-03-29", "Europe/Berlin")).toBe("2026-03-29");
    expect(invoiceBusinessDateOnly(instant, undefined, "Europe/Berlin")).toBe("2026-03-29");
  });

  it("uses half-open Center-local day boundaries for timestamp filters", () => {
    const range = getCenterDayRangeInstants("2026-03-29", "2026-03-29", "Europe/Berlin");
    expect(range.from?.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(range.toExclusive?.toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(range.toExclusive!.getTime() - range.from!.getTime()).toBe(23 * 60 * 60 * 1000);

    const dialect = new PgDialect();
    const conditions = centerInstantRangeConditions(sql.raw("paid_at"), "2026-03-29", "2026-03-29", "Europe/Berlin");
    const start = dialect.sqlToQuery(conditions[0]);
    const end = dialect.sqlToQuery(conditions[1]);
    expect(start.sql).toContain(">=");
    expect(start.params[0]).toEqual(range.from);
    expect(end.sql).toContain("<");
    expect(end.params[0]).toEqual(range.toExclusive);
  });

  it("rejects an invalid calendar day rather than storing a guessed instant", () => {
    expect(() =>
      normalizeInvoiceInstant(new Date("2026-03-02T00:00:00Z"), "2026-02-30", "Asia/Ho_Chi_Minh")
    ).toThrow("Ngày hoặc giờ lịch không hợp lệ");
  });
});