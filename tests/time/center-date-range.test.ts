import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { centerDateRangeConditions, InvalidCenterDateKeyError } from "../../server/lib/center-date-range";

describe("Center-local history date filters", () => {
  it("uses parameterized, half-open timestamp boundaries in the Center timezone", () => {
    const conditions = centerDateRangeConditions(
      sql.raw("created_at"),
      "2026-03-29",
      "2026-03-29",
      "Europe/Berlin",
    );
    const dialect = new PgDialect();
    const start = dialect.sqlToQuery(conditions[0]);
    const end = dialect.sqlToQuery(conditions[1]);
    expect(start.sql).toContain(">= ");
    expect(start.sql).toContain("AT TIME ZONE");
    expect(start.params).toEqual(["2026-03-29", "Europe/Berlin"]);
    expect(end.sql).toContain("< ");
    expect(end.sql).toContain("::date + 1");
    expect(end.params).toEqual(["2026-03-29", "Europe/Berlin"]);
  });

  it("rejects impossible calendar dates and missing timezone rather than guessing", () => {
    expect(() => centerDateRangeConditions(sql.raw("created_at"), "2026-02-30", null, "UTC"))
      .toThrow(InvalidCenterDateKeyError);
    expect(() => centerDateRangeConditions(sql.raw("created_at"), "2026-03-29"))
      .toThrow("Chưa cấu hình múi giờ");
  });
});