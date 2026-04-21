import type { Express } from "express";
import { db } from "../db";
import { taskLevels } from "@shared/schema";
import { eq, asc, sql } from "drizzle-orm";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1, "Tên mức độ không được để trống"),
  color: z.string().min(1, "Màu sắc không được để trống"),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
});

const reorderSchema = z.object({
  ids: z.array(z.string().uuid()),
});

export function registerTaskLevelRoutes(app: Express) {
  app.get("/api/task-levels", async (req, res) => {
    try {
      const mine = req.query.mine === "true";
      const userId = (req.user as any)?.id;

      let rows;
      if (mine && userId) {
        rows = await db.select().from(taskLevels)
          .where(eq(taskLevels.createdBy, userId))
          .orderBy(asc(taskLevels.position), asc(taskLevels.createdAt));
      } else {
        rows = await db.select().from(taskLevels)
          .orderBy(asc(taskLevels.position), asc(taskLevels.createdAt));
      }

      return res.json(rows);
    } catch (err: any) {
      console.error("[TaskLevels] GET list error:", err);
      return res.status(500).json({ message: "Lỗi khi lấy danh sách mức độ" });
    }
  });

  app.post("/api/task-levels", async (req, res) => {
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

      const userId = (req.user as any)?.id;

      const maxPositionRow = await db
        .select({ pos: taskLevels.position })
        .from(taskLevels)
        .orderBy(sql`${taskLevels.position} DESC`)
        .limit(1);

      const maxPos = maxPositionRow.length > 0 ? maxPositionRow[0].pos : 0;

      const [created] = await db.insert(taskLevels).values({
        name: parsed.data.name,
        color: parsed.data.color,
        position: maxPos + 1,
        createdBy: userId || null,
      }).returning();

      return res.status(201).json(created);
    } catch (err: any) {
      console.error("[TaskLevels] POST create error:", err);
      return res.status(500).json({ message: "Lỗi khi tạo mức độ" });
    }
  });

  app.patch("/api/task-levels/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const row = await db.select().from(taskLevels).where(eq(taskLevels.id, id)).limit(1);
      if (!row.length) return res.status(404).json({ message: "Không tìm thấy mức độ" });

      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

      const [updated] = await db
        .update(taskLevels)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(taskLevels.id, id))
        .returning();

      return res.json(updated);
    } catch (err: any) {
      console.error("[TaskLevels] PATCH update error:", err);
      return res.status(500).json({ message: "Lỗi khi cập nhật mức độ" });
    }
  });

  app.delete("/api/task-levels/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const row = await db.select().from(taskLevels).where(eq(taskLevels.id, id)).limit(1);
      if (!row.length) return res.status(404).json({ message: "Không tìm thấy mức độ" });

      await db.delete(taskLevels).where(eq(taskLevels.id, id));
      return res.json({ message: "Đã xoá mức độ" });
    } catch (err: any) {
      console.error("[TaskLevels] DELETE error:", err);
      return res.status(500).json({ message: "Lỗi khi xoá mức độ" });
    }
  });

  app.post("/api/task-levels/reorder", async (req, res) => {
    try {
      const parsed = reorderSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

      const { ids } = parsed.data;

      await db.transaction(async (tx) => {
        for (let i = 0; i < ids.length; i++) {
          await tx
            .update(taskLevels)
            .set({ position: i + 1, updatedAt: new Date() })
            .where(eq(taskLevels.id, ids[i]));
        }
      });

      return res.json({ message: "Đã cập nhật thứ tự" });
    } catch (err: any) {
      console.error("[TaskLevels] POST reorder error:", err);
      return res.status(500).json({ message: "Lỗi khi sắp xếp mức độ" });
    }
  });
}
