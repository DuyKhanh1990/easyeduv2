import { sql } from "drizzle-orm";
import { students } from "@shared/schema";

export function buildCustomerClassFilterCondition(classIds: string[]) {
  if (classIds.length === 0) return undefined;

  const selectedClassIds = sql.join(
    classIds.map((classId) => sql`${classId}::uuid`),
    sql`, `,
  );

  return sql`EXISTS (
    SELECT 1
    FROM student_classes sc_customer_filter
    INNER JOIN classes c_customer_filter ON c_customer_filter.id = sc_customer_filter.class_id
    WHERE sc_customer_filter.student_id = ${students.id}
      AND c_customer_filter.id IN (${selectedClassIds})
  )`;
}
