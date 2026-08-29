import type { Express } from "express";
import { z } from "zod";

const advanceItemSchema = z.object({
  name: z.string().trim().min(1).max(255),
  amount: z.coerce.number().int().nonnegative(),
});
const advanceItemsSchema = z.array(advanceItemSchema).max(100).default([]);

function parseAdvanceItems(value: unknown) {
  return advanceItemsSchema.parse(value ?? []);
}

async function refreshDraftSalaryRows(staffId: string) {
  const { db } = await import("../storage/base");
  const { staffAdvances, salarySheets, salarySheetEmployees } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");

  const [advances, sheets] = await Promise.all([
    db
      .select({ date: staffAdvances.date, amount: staffAdvances.amount })
      .from(staffAdvances)
      .where(eq(staffAdvances.staffId, staffId)),
    db
      .select({
        id: salarySheets.id,
        fromDate: salarySheets.fromDate,
        toDate: salarySheets.toDate,
      })
      .from(salarySheets)
      .where(eq(salarySheets.status, "draft")),
  ]);

  for (const sheet of sheets) {
    const amount = advances
      .filter((advance) => String(advance.date) >= String(sheet.fromDate) && String(advance.date) <= String(sheet.toDate))
      .reduce((total, advance) => total + Number(advance.amount || 0), 0);

    const rows = await db
      .select()
      .from(salarySheetEmployees)
      .where(and(
        eq(salarySheetEmployees.sheetId, sheet.id),
        eq(salarySheetEmployees.staffId, staffId),
      ));

    for (const row of rows) {
      const tongLuong = Number(row.tongLuong || 0);
      const deductions =
        Number(row.bhxh || 0) +
        Number(row.bhyt || 0) +
        Number(row.bhtn || 0) +
        Number(row.thueTNCN || 0);
      await db
        .update(salarySheetEmployees)
        .set({
          tamUng: String(amount),
          thucNhan: String(Math.round(tongLuong - deductions - amount)),
          updatedAt: new Date(),
        })
        .where(eq(salarySheetEmployees.id, row.id));
    }
  }
}

export function registerStaffAdvanceRoutes(app: Express) {
  app.get("/api/staff-advances", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const { db } = await import("../storage/base");
      const { staffAdvances } = await import("@shared/schema");
      const { desc, eq } = await import("drizzle-orm");
      const { staffId } = req.query as Record<string, string>;
      const rows = await db
        .select()
        .from(staffAdvances)
        .where(staffId ? eq(staffAdvances.staffId, staffId) : undefined)
        .orderBy(desc(staffAdvances.createdAt));
      res.json(rows);
    } catch (err: any) {
      if (err?.message?.includes("does not exist")) return res.json([]);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/staff-advances", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const { db } = await import("../storage/base");
      const { staffAdvances, insertStaffAdvanceSchema } = await import("@shared/schema");
      const userId = (req as any).user?.id ?? null;
      const input = insertStaffAdvanceSchema.parse({
        ...req.body,
        documentDueDate: req.body?.documentDueDate || null,
        items: parseAdvanceItems(req.body?.items),
        createdBy: userId,
      });
      const [row] = await db.insert(staffAdvances).values(input).returning();
      await refreshDraftSalaryRows(row.staffId);
      res.status(201).json(row);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/staff-advances/:id", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const { db } = await import("../storage/base");
      const { staffAdvances, insertStaffAdvanceSchema } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [existing] = await db
        .select()
        .from(staffAdvances)
        .where(eq(staffAdvances.id, req.params.id))
        .limit(1);
      if (!existing) return res.status(404).json({ message: "Không tìm thấy phiếu tạm ứng" });

      const input = insertStaffAdvanceSchema.parse({
        staffId: req.body?.staffId,
        date: req.body?.date,
        documentDueDate: req.body?.documentDueDate || null,
        amount: req.body?.amount,
        reason: req.body?.reason ?? null,
        items: parseAdvanceItems(req.body?.items),
      });
      const [row] = await db
        .update(staffAdvances)
        .set({
          staffId: input.staffId,
          date: input.date,
          documentDueDate: input.documentDueDate,
          amount: input.amount,
          reason: input.reason,
          items: input.items,
          updatedAt: new Date(),
        })
        .where(eq(staffAdvances.id, req.params.id))
        .returning();
      await refreshDraftSalaryRows(existing.staffId);
      if (existing.staffId !== row.staffId) await refreshDraftSalaryRows(row.staffId);
      res.json(row);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/staff-advances/:id", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const { db } = await import("../storage/base");
      const { staffAdvances } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [row] = await db
        .select({ staffId: staffAdvances.staffId })
        .from(staffAdvances)
        .where(eq(staffAdvances.id, req.params.id))
        .limit(1);
      if (!row) return res.status(404).json({ message: "Không tìm thấy phiếu tạm ứng" });
      await db.delete(staffAdvances).where(eq(staffAdvances.id, req.params.id));
      await refreshDraftSalaryRows(row.staffId);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}