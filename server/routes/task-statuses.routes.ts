import type { Express } from "express";
import { db } from "../db";
import { taskStatuses, tasks } from "@shared/schema";
import { eq, asc, sql, or, inArray } from "drizzle-orm";
import { z } from "zod";

const DARK_BLUE = "#1d4ed8";

const createSchema = z.object({
  name: z.string().min(1, "Tên trạng thái không được để trống"),
  color: z.string().min(1, "Màu sắc không được để trống"),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
});

const reorderSchema = z.object({
  ids: z.array(z.string().uuid()),
});

async function ensureDefaultStatuses() {
  const existing = await db.select().from(taskStatuses).where(eq(taskStatuses.isFixed, true));
  if (existing.length === 0) {
    await db.insert(taskStatuses).values([
      { name: "Mới tạo", color: DARK_BLUE, isFixed: true, position: 0 },
      { name: "Hoàn thành", color: "#22c55e", isFixed: true, position: 999999 },
    ]);
  } else {
    const moiTao = existing.find((s) => s.name === "Mới tạo" && s.color === "#6b7280");
    if (moiTao) {
      await db.update(taskStatuses).set({ color: DARK_BLUE }).where(eq(taskStatuses.id, moiTao.id));
    }
  }
}

async function getTaskCountsByStatus(statusIds: string[]): Promise<Record<string, number>> {
  if (!statusIds.length) return {};
  const rows = await db
    .select({ statusId: tasks.statusId, count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(inArray(tasks.statusId, statusIds))
    .groupBy(tasks.statusId);
  const map: Record<string, number> = {};
  for (const r of rows) {
    if (r.statusId) map[r.statusId] = r.count;
  }
  return map;
}

export function registerTaskStatusRoutes(app: Express) {
  app.get("/api/task-statuses", async (req, res) => {
    try {
      await ensureDefaultStatuses();
      const mine = req.query.mine === "true";
      const userId = (req.user as any)?.id;

      let rows;
      if (mine && userId) {
        rows = await db.select().from(taskStatuses)
          .where(or(eq(taskStatuses.isFixed, true), eq(taskStatuses.createdBy, userId)))
          .orderBy(asc(taskStatuses.position), asc(taskStatuses.createdAt));
      } else {
        rows = await db.select().from(taskStatuses)
          .orderBy(asc(taskStatuses.position), asc(taskStatuses.createdAt));
      }

      const nonFixedIds = rows.filter((s) => !s.isFixed).map((s) => s.id);
      const taskCounts = await getTaskCountsByStatus(nonFixedIds);

      const result = rows.map((s) => ({
        ...s,
        inUse: s.isFixed ? false : (taskCounts[s.id] ?? 0) > 0,
        taskCount: s.isFixed ? 0 : (taskCounts[s.id] ?? 0),
      }));

      return res.json(result);
    } catch (err: any) {
      console.error("[TaskStatuses] GET list error:", err);
      return res.status(500).json({ message: "Lỗi khi lấy danh sách trạng thái" });
    }
  });

  app.post("/api/task-statuses", async (req, res) => {
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

      const userId = (req.user as any)?.id;

      const maxPositionRow = await db
        .select({ pos: taskStatuses.position })
        .from(taskStatuses)
        .where(eq(taskStatuses.isFixed, false))
        .orderBy(sql`${taskStatuses.position} DESC`)
        .limit(1);

      const maxPos = maxPositionRow.length > 0 ? maxPositionRow[0].pos : 0;

      const [created] = await db.insert(taskStatuses).values({
        name: parsed.data.name,
        color: parsed.data.color,
        isFixed: false,
        position: maxPos + 1,
        createdBy: userId || null,
      }).returning();

      return res.status(201).json({ ...created, inUse: false, taskCount: 0 });
    } catch (err: any) {
      console.error("[TaskStatuses] POST create error:", err);
      return res.status(500).json({ message: "Lỗi khi tạo trạng thái" });
    }
  });

  app.patch("/api/task-statuses/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const row = await db.select().from(taskStatuses).where(eq(taskStatuses.id, id)).limit(1);
      if (!row.length) return res.status(404).json({ message: "Không tìm thấy trạng thái" });
      if (row[0].isFixed) return res.status(400).json({ message: "Không thể chỉnh sửa trạng thái mặc định" });

      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

      const [updated] = await db
        .update(taskStatuses)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(taskStatuses.id, id))
        .returning();

      const counts = await getTaskCountsByStatus([id]);
      return res.json({ ...updated, inUse: (counts[id] ?? 0) > 0, taskCount: counts[id] ?? 0 });
    } catch (err: any) {
      console.error("[TaskStatuses] PATCH update error:", err);
      return res.status(500).json({ message: "Lỗi khi cập nhật trạng thái" });
    }
  });

  app.delete("/api/task-statuses/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const row = await db.select().from(taskStatuses).where(eq(taskStatuses.id, id)).limit(1);
      if (!row.length) return res.status(404).json({ message: "Không tìm thấy trạng thái" });
      if (row[0].isFixed) return res.status(400).json({ message: "Không thể xoá trạng thái mặc định" });

      const counts = await getTaskCountsByStatus([id]);
      if ((counts[id] ?? 0) > 0) {
        return res.status(409).json({
          message: `Không thể xoá: trạng thái này đang được dùng bởi ${counts[id]} công việc. Vui lòng sửa tên/màu thay vì xoá.`,
        });
      }

      await db.delete(taskStatuses).where(eq(taskStatuses.id, id));
      return res.json({ message: "Đã xoá trạng thái" });
    } catch (err: any) {
      console.error("[TaskStatuses] DELETE error:", err);
      return res.status(500).json({ message: "Lỗi khi xoá trạng thái" });
    }
  });

  app.post("/api/task-statuses/reorder", async (req, res) => {
    try {
      const parsed = reorderSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

      const { ids } = parsed.data;

      await db.transaction(async (tx) => {
        for (let i = 0; i < ids.length; i++) {
          await tx
            .update(taskStatuses)
            .set({ position: i + 1, updatedAt: new Date() })
            .where(eq(taskStatuses.id, ids[i]));
        }
      });

      return res.json({ message: "Đã cập nhật thứ tự" });
    } catch (err: any) {
      console.error("[TaskStatuses] POST reorder error:", err);
      return res.status(500).json({ message: "Lỗi khi sắp xếp trạng thái" });
    }
  });
}
