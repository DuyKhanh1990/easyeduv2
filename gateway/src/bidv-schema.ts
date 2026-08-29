import { pgTable, varchar, text, timestamp, boolean, serial } from "drizzle-orm/pg-core";

export const gatewayRegistry = pgTable("gateway_registry", {
  id: serial("id").primaryKey(),
  provider: varchar("provider", { length: 50 }).notNull().default("bidv"),
  routingKey: varchar("routing_key", { length: 100 }).notNull(),
  centerId: varchar("center_id", { length: 100 }).notNull(),
  name: text("name"),
  baseUrl: text("base_url").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type GatewayRegistry = typeof gatewayRegistry.$inferSelect;
export type InsertGatewayRegistry = typeof gatewayRegistry.$inferInsert;
