import type { Express } from "express";
import { db } from "../db";
import { tasks, taskComments, staff, taskStatuses, locations } from "@shared/schema";
import { eq, desc, asc, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { sendNotificationToMany } from "../lib/notification";

async function getCreatorLabel(userId: string, fallback: string): Promise<string> {
  try {
    const [s] = await db.select({ fullName: staff.fullName, code: staff.code })
      .from(staff)
      .where(eq(staff.userId, userId))
      .limit(1);
    if (s) return `${s.fullName} (${s.code})`;
  } catch {
    // ignore
  }
  return fallback;
}

async function resolveStaffUserIds(staffIds: string[]): Promise<string[]> {
  if (!staffIds.length) return [];
  try {
    const rows = await db.select({ userId: staff.userId })
      .from(staff)
      .where(inArray(staff.id, staffIds));
    return rows.map((r) => r.userId).filter(Boolean) as string[];
  } catch {
    return [];
  }
}

async function notifyAssignees(assigneeStaffIds: string[], creatorLabel: string, taskTitle: string, taskId?: string) {
  if (!assigneeStaffIds.length) return;
  const userIds = await resolveStaffUserIds(assigneeStaffIds);
  if (!userIds.length) return;
  await sendNotificationToMany(userIds, {
    title: "Bạn vừa được giao công việc",
    content: `Bạn vừa được ${creatorLabel} giao công việc: ${taskTitle}`,
    category: "task",
    referenceType: "task",
    referenceId: taskId,
    deeplink: {
      screen: "StaffTasks",
      params: taskId ? { taskId } : {},
    },
  });
}

const createSchema = z.object({
  title: z.string().min(1, "Tiêu đề không được để trống"),
  content: z.string().optional().default(""),
  locationIds: z.array(z.string().uuid()).min(1, "Vui lòng chọn ít nhất một cơ sở"),
  departmentId: z.string().uuid().nullable().optional(),
  statusId: z.string().uuid().nullable().optional(),
  levelId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  subjectIds: z.array(z.string().uuid()).optional().default([]),
  managerIds: z.array(z.string().uuid()).optional().default([]),
  assigneeIds: z.array(z.string().uuid()).optional().default([]),
  attachments: z.array(z.any()).optional().default([]),
});

const updateSchema = createSchema.partial();

export function registerTaskRoutes(app: Express) {
  app.get("/api/tasks", async (req, res) => {
    try {
      const { allowedLocationIds, isSuperAdmin } = req;
      let rows;
      if (isSuperAdmin || !allowedLocationIds?.length) {
        rows = await db.select().from(tasks).orderBy(desc(tasks.createdAt));
      } else {
        rows = await db.select().from(tasks)
          .where(sql`${tasks.locationIds} && ARRAY[${sql.raw(allowedLocationIds.map(id => `'${id}'`).join(','))}]::uuid[]`)
          .orderBy(desc(tasks.createdAt));
      }
      return res.json(rows);
    } catch (err: any) {
      console.error("[Tasks] GET list error:", err);
      return res.status(500).json({ message: "Lỗi khi lấy danh sách công việc" });
    }
  });

  app.get("/api/tasks/by-subjects", async (req, res) => {
    try {
      const idsParam = req.query.ids as string;
      if (!idsParam) return res.json({});
      const subjectIds = idsParam.split(",").filter((id) => /^[0-9a-f-]{36}$/i.test(id));
      if (!subjectIds.length) return res.json({});

      const uuidArray = sql`array[${sql.join(subjectIds.map((id) => sql`${id}::uuid`), sql`, `)}]`;
      const rows = await db.select().from(tasks)
        .where(sql`${tasks.subjectIds} && ${uuidArray}`)
        .orderBy(asc(tasks.dueDate));

      const allLocationIds = [...new Set(rows.flatMap((t) => t.locationIds || []))];
      let locationMap: Record<string, string> = {};
      if (allLocationIds.length) {
        const locs = await db.select({ id: locations.id, name: locations.name }).from(locations).where(inArray(locations.id, allLocationIds));
        locationMap = Object.fromEntries(locs.map((l) => [l.id, l.name]));
      }

      const allStatusIds = [...new Set(rows.map((t) => t.statusId).filter(Boolean) as string[])];
      let statusMap: Record<string, string> = {};
      if (allStatusIds.length) {
        const statuses = await db.select({ id: taskStatuses.id, name: taskStatuses.name }).from(taskStatuses).where(inArray(taskStatuses.id, allStatusIds));
        statusMap = Object.fromEntries(statuses.map((s) => [s.id, s.name]));
      }

      const allStaffIds = [...new Set(rows.flatMap((t) => [...(t.assigneeIds || []), ...(t.managerIds || [])]))];
      let staffMap: Record<string, string> = {};
      if (allStaffIds.length) {
        const staffRows = await db.select({ id: staff.id, fullName: staff.fullName }).from(staff).where(inArray(staff.id, allStaffIds));
        staffMap = Object.fromEntries(staffRows.map((s) => [s.id, s.fullName]));
      }

      const result: Record<string, any[]> = {};
      for (const task of rows) {
        const enriched = {
          ...task,
          locationNames: (task.locationIds || []).map((id) => locationMap[id]).filter(Boolean),
          statusName: task.statusId ? statusMap[task.statusId] : undefined,
          assigneeNames: [...new Set([...(task.assigneeIds || []), ...(task.managerIds || [])])].map((id) => staffMap[id]).filter(Boolean),
        };
        for (const studentId of (task.subjectIds || [])) {
          if (subjectIds.includes(studentId)) {
            if (!result[studentId]) result[studentId] = [];
            result[studentId].push(enriched);
          }
        }
      }

      return res.json(result);
    } catch (err: any) {
      console.error("[Tasks] by-subjects error:", err);
      return res.status(500).json({ message: "Lỗi khi lấy lịch hẹn" });
    }
  });

  app.get("/api/tasks/:id", async (req, res) => {
    try {
      const [row] = await db.select().from(tasks).where(eq(tasks.id, req.params.id)).limit(1);
      if (!row) return res.status(404).json({ message: "Không tìm thấy công việc" });
      return res.json(row);
    } catch (err: any) {
      console.error("[Tasks] GET one error:", err);
      return res.status(500).json({ message: "Lỗi khi lấy công việc" });
    }
  });

  app.post("/api/tasks", async (req, res) => {
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

      const userId = (req.user as any)?.id;
      const [created] = await db.insert(tasks).values({
        title: parsed.data.title,
        content: parsed.data.content || "",
        locationIds: parsed.data.locationIds,
        departmentId: parsed.data.departmentId || null,
        statusId: parsed.data.statusId || null,
        levelId: parsed.data.levelId || null,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        subjectIds: parsed.data.subjectIds || [],
        managerIds: parsed.data.managerIds || [],
        assigneeIds: parsed.data.assigneeIds || [],
        attachments: parsed.data.attachments || [],
        createdBy: userId || null,
      }).returning();

      // Send notifications to assignees
      if (userId && created.assigneeIds?.length) {
        const creatorLabel = await getCreatorLabel(userId, (req.user as any)?.username || "Hệ thống");
        notifyAssignees(created.assigneeIds, creatorLabel, created.title, created.id).catch(console.error);
      }

      return res.status(201).json(created);
    } catch (err: any) {
      console.error("[Tasks] POST create error:", err);
      return res.status(500).json({ message: "Lỗi khi tạo công việc" });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const [existing] = await db.select().from(tasks).where(eq(tasks.id, req.params.id)).limit(1);
      if (!existing) return res.status(404).json({ message: "Không tìm thấy công việc" });

      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

      const oldAssigneeIds: string[] = existing.assigneeIds ?? [];

      const { dueDate: dueDateRaw, ...restData } = parsed.data;
      const [updated] = await db.update(tasks)
        .set({
          ...restData,
          ...(dueDateRaw !== undefined ? { dueDate: dueDateRaw ? new Date(dueDateRaw) : null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, req.params.id))
        .returning();

      // Notify only newly added assignees
      const newAssigneeIds: string[] = updated.assigneeIds ?? [];
      const addedIds = newAssigneeIds.filter((id) => !oldAssigneeIds.includes(id));
      if (addedIds.length) {
        const userId = (req.user as any)?.id;
        if (userId) {
          const creatorLabel = await getCreatorLabel(userId, (req.user as any)?.username || "Hệ thống");
          notifyAssignees(addedIds, creatorLabel, updated.title, updated.id).catch(console.error);
        }
      }

      return res.json(updated);
    } catch (err: any) {
      console.error("[Tasks] PATCH update error:", err);
      return res.status(500).json({ message: "Lỗi khi cập nhật công việc" });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      const [existing] = await db.select().from(tasks).where(eq(tasks.id, req.params.id)).limit(1);
      if (!existing) return res.status(404).json({ message: "Không tìm thấy công việc" });
      await db.delete(tasks).where(eq(tasks.id, req.params.id));
      return res.json({ message: "Đã xoá công việc" });
    } catch (err: any) {
      console.error("[Tasks] DELETE error:", err);
      return res.status(500).json({ message: "Lỗi khi xoá công việc" });
    }
  });

  // ── Comments ──────────────────────────────────────────────
  app.get("/api/tasks/:id/comments", async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(taskComments)
        .where(eq(taskComments.taskId, req.params.id))
        .orderBy(desc(taskComments.createdAt));
      return res.json(rows);
    } catch (err: any) {
      console.error("[TaskComments] GET error:", err);
      return res.status(500).json({ message: "Lỗi khi lấy bình luận" });
    }
  });

  app.post("/api/tasks/:id/comments", async (req, res) => {
    try {
      const [existing] = await db.select().from(tasks).where(eq(tasks.id, req.params.id)).limit(1);
      if (!existing) return res.status(404).json({ message: "Không tìm thấy công việc" });

      const schema = z.object({ content: z.string().min(1, "Nội dung không được trống") });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

      const userId = (req.user as any)?.id;
      const authorName = (req.user as any)?.fullName || (req.user as any)?.username || "Ẩn danh";

      const [created] = await db.insert(taskComments).values({
        taskId: req.params.id,
        authorId: userId || null,
        authorName,
        content: parsed.data.content,
      }).returning();

      return res.status(201).json(created);
    } catch (err: any) {
      console.error("[TaskComments] POST error:", err);
      return res.status(500).json({ message: "Lỗi khi thêm bình luận" });
    }
  });

  app.delete("/api/tasks/:taskId/comments/:commentId", async (req, res) => {
    try {
      await db.delete(taskComments).where(eq(taskComments.id, req.params.commentId));
      return res.json({ message: "Đã xoá bình luận" });
    } catch (err: any) {
      console.error("[TaskComments] DELETE error:", err);
      return res.status(500).json({ message: "Lỗi khi xoá bình luận" });
    }
  });
}
