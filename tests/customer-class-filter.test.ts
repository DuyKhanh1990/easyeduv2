import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildCustomerClassFilterCondition } from "../server/storage/customer-class-filter";

describe("customer class filter", () => {
  it("matches enrollment records for any selected class without multiplying student rows", () => {
    const classIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ];
    const condition = buildCustomerClassFilterCondition(classIds);
    expect(condition).toBeDefined();
    const query = new PgDialect().sqlToQuery(condition!);

    expect(query.sql).toContain("EXISTS");
    expect(query.sql).toContain("FROM student_classes sc_customer_filter");
    expect(query.sql).toContain("INNER JOIN classes c_customer_filter");
    expect(query.sql).toContain('sc_customer_filter.student_id = "students"."id"');
    expect(query.sql).toContain("c_customer_filter.id IN");
    expect(query.params).toEqual(classIds);
  });

  it("does not add a class condition when no classes are selected", () => {
    expect(buildCustomerClassFilterCondition([])).toBeUndefined();
  });
});
