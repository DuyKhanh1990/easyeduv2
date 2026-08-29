import { pgTable, varchar, text, timestamp, boolean, serial } from "drizzle-orm/pg-core";

export const zaloRouting = pgTable("zalo_routing", {
  oaId: varchar("oa_id", { length: 100 }).primaryKey(),
  centerId: varchar("center_id", { length: 100 }).notNull(),
  centerUrl: text("center_url").notNull(),
  connectedAt: timestamp("connected_at").defaultNow().notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

// ─── Facebook Page → Center routing ──────────────────────────────────────────
// One Page can have only one active owner at a time. The center URL is always
// resolved from center_registry by the service layer, never trusted from a
// frontend request.
export const facebookPageRoutes = pgTable("facebook_page_routes", {
  pageId: varchar("page_id", { length: 100 }).primaryKey(),
  centerId: varchar("center_id", { length: 100 }).notNull(),
  centerUrl: text("center_url").notNull(),
  connectedAt: timestamp("connected_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const centerRegistry = pgTable("center_registry", {
  centerId: varchar("center_id", { length: 100 }).primaryKey(),
  centerUrl: text("center_url").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  registeredAt: timestamp("registered_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Source of truth cho tenant resolution:
// CRM push mapping vào đây khi gắn Zalo với học viên
export const userTenantMap = pgTable("user_tenant_map", {
  id: serial("id").primaryKey(),
  zaloUserId: varchar("zalo_user_id", { length: 100 }).notNull().unique(),
  userId: varchar("user_id", { length: 100 }).notNull(),
  tenantId: varchar("tenant_id", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ZaloRoute = typeof zaloRouting.$inferSelect;
export type InsertZaloRoute = typeof zaloRouting.$inferInsert;
export type FacebookPageRoute = typeof facebookPageRoutes.$inferSelect;
export type InsertFacebookPageRoute = typeof facebookPageRoutes.$inferInsert;
export type CenterRegistry = typeof centerRegistry.$inferSelect;
export type InsertCenterRegistry = typeof centerRegistry.$inferInsert;
export type UserTenantMap = typeof userTenantMap.$inferSelect;
export type InsertUserTenantMap = typeof userTenantMap.$inferInsert;
