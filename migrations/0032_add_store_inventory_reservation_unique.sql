CREATE UNIQUE INDEX IF NOT EXISTS "store_inventory_reservations_session_product_warehouse_uidx"
ON "store_inventory_reservations" (
  "session_id",
  "product_id",
  "warehouse_id"
);