import { sql } from "drizzle-orm";
import { db } from "../db";

/**
 * Recover ownership only from the original "Thêm mới lớp" audit event.
 * The update is idempotent and never overwrites an owner already known.
 */
export async function recoverClassCreatorsFromActivityLogs(): Promise<{
  recovered: number;
  unresolved: number;
}> {
  const recoveredRows = await db.execute(sql`
    WITH creator_candidates AS (
      SELECT DISTINCT ON (al.class_id)
        al.class_id,
        al.user_id
      FROM activity_logs al
      INNER JOIN classes c ON c.id = al.class_id
      INNER JOIN users u ON u.id = al.user_id
      WHERE c.created_by IS NULL
        AND al.class_id IS NOT NULL
        AND al.user_id IS NOT NULL
        AND al.action = 'Thêm mới lớp'
      ORDER BY al.class_id, al.created_at ASC, al.id ASC
    )
    UPDATE classes c
    SET created_by = candidates.user_id
    FROM creator_candidates candidates
    WHERE c.id = candidates.class_id
      AND c.created_by IS NULL
    RETURNING c.id
  `);

  const unresolvedRows = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM classes c
    WHERE c.created_by IS NULL
  `);

  return {
    recovered: recoveredRows.rows.length,
    unresolved: Number((unresolvedRows.rows[0] as any)?.count ?? 0),
  };
}
