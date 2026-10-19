import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { getAvailableStock } from "../server/routes/store-inventory.routes";

const suffix = randomUUID().slice(0, 8).toUpperCase();
const productId = randomUUID();
const activeSessionId = `TEST-RES-ACTIVE-${suffix}`;
const expiredSessionId = `TEST-RES-EXPIRED-${suffix}`;
let productInserted = false;

async function cleanup() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      DELETE FROM store_inventory_reservations
      WHERE session_id IN (${activeSessionId}, ${expiredSessionId})
    `);
    await tx.execute(sql`DELETE FROM store_stock_transactions WHERE product_id = ${productId}`);
    await tx.execute(sql`DELETE FROM store_inventory WHERE product_id = ${productId}`);
    if (productInserted) await tx.execute(sql`DELETE FROM store_products WHERE id = ${productId}`);
  });
}

async function main() {
  try {
    const warehouseResult = await db.execute(sql`SELECT id FROM store_warehouses LIMIT 1`);
    const warehouseId = (warehouseResult.rows[0] as any)?.id;
    if (!warehouseId) throw new Error("No warehouse available for the temporary test");

    await db.execute(sql`
      INSERT INTO store_products (id, code, name, status)
      VALUES (${productId}, ${`TEST-AVAILABLE-${suffix}`}, ${`TEST available ${suffix}`}, 'active')
    `);
    productInserted = true;

    await db.execute(sql`
      INSERT INTO store_stock_transactions (product_id, warehouse_id, type, quantity_delta, status)
      VALUES (${productId}, ${warehouseId}, 'import', 10, 'completed')
    `);
    await db.execute(sql`
      INSERT INTO store_inventory_reservations (session_id, product_id, warehouse_id, quantity, expires_at)
      VALUES
        (${activeSessionId}, ${productId}, ${warehouseId}, 3, NOW() + INTERVAL '5 minutes'),
        (${expiredSessionId}, ${productId}, ${warehouseId}, 4, NOW() - INTERVAL '1 minute')
    `);

    const available = await getAvailableStock({ productId, warehouseId });
    if (available !== 7) throw new Error(`Expected available stock 7, got ${available}`);

    const expiredCount = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM store_inventory_reservations WHERE session_id = ${expiredSessionId}
    `);
    if (Number((expiredCount.rows[0] as any)?.count ?? 0) !== 0) {
      throw new Error("Expired reservation was not released");
    }

    console.log(JSON.stringify({ result: "passed", onHand: 10, activeReserved: 3, available }));
  } finally {
    await cleanup();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
