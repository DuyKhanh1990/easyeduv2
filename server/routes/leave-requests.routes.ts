import type { Express } from "express";
import { z } from "zod";

export function registerLeaveRequestRoutes(app: Express) {
  app.get("/api/leave-requests", async (req, res) => {
    try {
      const { db } = await import("../storage/base");
      const { leaveRequests, staffAssignments } = await import("@shared/schema");
      const { desc, eq, and, inArray, sql } = await import("drizzle-orm");

      const { type, status, staffId } = req.query as Record<string, string>;
      const isSuperAdmin: boolean = (req as any).isSuperAdmin ?? false;
      const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];

      const conditions: any[] = [];
      if (type) conditions.push(eq(leaveRequests.type, type));
      if (status) conditions.push(eq(leaveRequests.status, status));
      if (staffId) conditions.push(eq(leaveRequests.staffId, staffId));

      // Location isolation: show leave requests whose staffId is assigned to
      // one of the caller's locations (handles NULL locationId on the record itself).
      // SuperAdmin sees everything.
      if (!isSuperAdmin && allowedLocationIds.length > 0) {
        const staffInLocations = db
          .selectDistinct({ staffId: staffAssignments.staffId })
          .from(staffAssignments)
          .where(inArray(staffAssignments.locationId, allowedLocationIds));
        conditions.push(inArray(leaveRequests.staffId, staffInLocations));
      }

      const rows = await db
        .select()
        .from(leaveRequests)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(leaveRequests.createdAt));
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.post("/api/leave-requests", async (req, res) => {
    try {
      const { db } = await import("../storage/base");
      const { insertLeaveRequestSchema, leaveRequests, staffAssignments } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const input = insertLeaveRequestSchema.parse(req.body);

      // Auto-set locationId from staff's primary assignment if not provided
      if (!input.locationId && input.staffId) {
        const [assignment] = await db
          .select({ locationId: staffAssignments.locationId })
          .from(staffAssignments)
          .where(eq(staffAssignments.staffId, input.staffId))
          .limit(1);
        if (assignment?.locationId) {
          (input as any).locationId = assignment.locationId;
        }
      }

      const [row] = await db.insert(leaveRequests).values(input).returning();
      res.status(201).json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put("/api/leave-requests/:id", async (req, res) => {
    try {
      const { db } = await import("../storage/base");
      const { insertLeaveRequestSchema, leaveRequests } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const input = insertLeaveRequestSchema.partial().parse(req.body);
      const [row] = await db
        .update(leaveRequests)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(leaveRequests.id, req.params.id))
        .returning();
      if (!row) return res.status(404).json({ message: "Không tìm thấy đơn từ" });
      res.json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.patch("/api/leave-requests/:id/status", async (req, res) => {
    try {
      const { db } = await import("../storage/base");
      const { leaveRequests } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const { status, adminNote } = req.body as { status: string; adminNote?: string };
      if (!["pending", "approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Trạng thái không hợp lệ" });
      }
      const [row] = await db
        .update(leaveRequests)
        .set({ status, adminNote: adminNote ?? null, updatedAt: new Date() })
        .where(eq(leaveRequests.id, req.params.id))
        .returning();
      if (!row) return res.status(404).json({ message: "Không tìm thấy đơn từ" });
      res.json(row);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete("/api/leave-requests/:id", async (req, res) => {
    try {
      const { db } = await import("../storage/base");
      const { leaveRequests } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await db.delete(leaveRequests).where(eq(leaveRequests.id, req.params.id));
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });
}
