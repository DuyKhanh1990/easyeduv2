import type { Express } from "express";
import { z } from "zod";

export function registerStaffRewardRoutes(app: Express) {
  // Ensure table exists on startup
  app.get("/api/staff-rewards", async (req, res) => {
    try {
      const { db } = await import("../storage/base");
      const { staffRewards } = await import("@shared/schema");
      const { desc, eq, and, inArray } = await import("drizzle-orm");

      const { type, staffId } = req.query as Record<string, string>;
      const isSuperAdmin: boolean = (req as any).isSuperAdmin ?? false;

      const conditions: any[] = [];
      if (type && (type === "reward" || type === "penalty")) {
        conditions.push(eq(staffRewards.type, type));
      }
      if (staffId) conditions.push(eq(staffRewards.staffId, staffId));

      const rows = await db
        .select()
        .from(staffRewards)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(staffRewards.createdAt));
      res.json(rows);
    } catch (err: any) {
      // Table may not exist yet — return empty
      if (err?.message?.includes("does not exist")) return res.json([]);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/staff-rewards", async (req, res) => {
    try {
      const { db } = await import("../storage/base");
      const { sql } = await import("drizzle-orm");

      // Ensure table exists (idempotent)
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS staff_rewards (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          staff_id UUID NOT NULL,
          type VARCHAR(10) NOT NULL CHECK (type IN ('reward', 'penalty')),
          date DATE NOT NULL,
          amount INTEGER NOT NULL DEFAULT 0,
          reason TEXT,
          created_by UUID,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);

      const { staffRewards, insertStaffRewardSchema } = await import("@shared/schema");
      const userId = (req as any).user?.id ?? null;
      const input = insertStaffRewardSchema.parse({ ...req.body, createdBy: userId });
      const [row] = await db.insert(staffRewards).values(input).returning();
      res.status(201).json(row);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/staff-rewards/:id", async (req, res) => {
    try {
      const { db } = await import("../storage/base");
      const { staffRewards } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await db.delete(staffRewards).where(eq(staffRewards.id, req.params.id));
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
