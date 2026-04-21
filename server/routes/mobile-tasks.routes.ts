import type { Express } from "express";
import multer from "multer";
import { db } from "../db";
import { tasks, taskStatuses, taskLevels, taskComments, staff, locations, departments, students } from "@shared/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { getEffectivePermissions } from "../storage/permissions.storage";
import { sendNotificationToMany } from "../lib/notification";
import { uploadFileToS3 } from "../lib/s3";

const mobileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const TASK_RESOURCE = "/tasks#list";

/* ─── helpers ─────────────────────────────────────────────── */

async function resolveTaskPermissions(req: any) {
  const isSuperAdmin: boolean = req.isSuperAdmin ?? false;
  const roleIds: string[] = req.roleIds ?? [];
  const staffId: string | null = req.staffId ?? null;
  const myUserId: string | null = (req.user as any)?.id ?? null;
  const myLocationIds: string[] = req.allowedLocationIds ?? [];

  if (isSuperAdmin) {
    return {
      isSuperAdmin: true,
      canView: true,
      canViewAll: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      staffId,
      myUserId,
      myLocationIds,
    };
  }

  const raw = await getEffectivePermissions(roleIds, TASK_RESOURCE);
  const perms = {
    canView: raw.canView || true,
    canViewAll: raw.canViewAll,
    canCreate: raw.canCreate,
    canEdit: raw.canEdit,
    canDelete: raw.canDelete,
  };

  return {
    isSuperAdmin: false,
    ...perms,
    staffId,
    myUserId,
    myLocationIds,
  };
}

function applyPermissionFilter(allTasks: any[], perms: Awaited<ReturnType<typeof resolveTaskPermissions>>) {
  if (perms.isSuperAdmin) return allTasks;

  return allTasks.filter((t) => {
    if (perms.canViewAll) {
      return (
        perms.myLocationIds.length === 0 ||
        (t.locationIds || []).some((id: string) => perms.myLocationIds.includes(id))
      );
    }
    if (perms.canView) {
      const isCreator = perms.myUserId && t.createdBy === perms.myUserId;
      const isManager = perms.staffId && (t.managerIds || []).includes(perms.staffId);
      const isAssignee = perms.staffId && (t.assigneeIds || []).includes(perms.staffId);
      return !!(isCreator || isManager || isAssignee);
    }
    return false;
  });
}

async function getCreatorLabel(userId: string, fallback: string): Promise<string> {
  try {
    const [s] = await db
      .select({ fullName: staff.fullName, code: staff.code })
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
    const rows = await db.select({ userId: staff.userId }).from(staff).where(inArray(staff.id, staffIds));
    return rows.map((r) => r.userId).filter(Boolean) as string[];
  } catch {
    return [];
  }
}

async function buildStaffMap(staffIds: string[]): Promise<Record<string, { id: string; fullName: string; code: string }>> {
  if (!staffIds.length) return {};
  try {
    const rows = await db
      .select({ id: staff.id, fullName: staff.fullName, code: staff.code })
      .from(staff)
      .where(inArray(staff.id, staffIds));
    const map: Record<string, { id: string; fullName: string; code: string }> = {};
    for (const r of rows) map[r.id] = r;
    return map;
  } catch {
    return {};
  }
}

function enrichTasksWithStaff(
  taskList: any[],
  staffMap: Record<string, { id: string; fullName: string; code: string }>
) {
  return taskList.map((t) => ({
    ...t,
    description: t.content ?? "",
    managers: (t.managerIds ?? []).map((id: string) => staffMap[id]).filter(Boolean),
    assignees: (t.assigneeIds ?? []).map((id: string) => staffMap[id]).filter(Boolean),
  }));
}

async function notifyAssignees(assigneeStaffIds: string[], creatorLabel: string, taskTitle: string) {
  if (!assigneeStaffIds.length) return;
  const userIds = await resolveStaffUserIds(assigneeStaffIds);
  if (!userIds.length) return;
  await sendNotificationToMany(userIds, {
    title: "Bạn vừa được giao công việc",
    content: `Bạn vừa được ${creatorLabel} giao công việc: ${taskTitle}`,
    category: "task",
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

/* ─── Routes ───────────────────────────────────────────────── */

export function registerMobileTaskRoutes(app: Express) {
  /**
   * GET /api/mobile/tasks/kanban
   *
   * Returns tasks grouped by status column (Kanban format).
   * Applies server-side permission filtering identical to the web UI.
   *
   * Response shape:
   * {
   *   permissions: { canView, canViewAll, canCreate, canEdit, canDelete },
   *   statuses: [ { id, name, color, position, isFixed } ],
   *   levels: [ { id, name, color, position } ],
   *   columns: [
   *     {
   *       status: { id, name, color, position, isFixed } | null,  // null = no status
   *       tasks: [ Task... ]
   *     }
   *   ]
   * }
   */
  app.get("/api/mobile/tasks/kanban", async (req, res) => {
    try {
      const perms = await resolveTaskPermissions(req);

      const [allTasks, allStatuses, allLevels] = await Promise.all([
        db.select().from(tasks).orderBy(desc(tasks.createdAt)),
        db.select().from(taskStatuses).orderBy(taskStatuses.position),
        db.select().from(taskLevels).orderBy(taskLevels.position),
      ]);

      const scopedTasks = applyPermissionFilter(allTasks, perms);

      const allStaffIds = [
        ...new Set(scopedTasks.flatMap((t) => [...(t.managerIds ?? []), ...(t.assigneeIds ?? [])])),
      ];
      const staffMap = await buildStaffMap(allStaffIds);
      const enrichedTasks = enrichTasksWithStaff(scopedTasks, staffMap);

      const columns: Array<{ status: any | null; tasks: any[] }> = [];

      for (const status of allStatuses) {
        const colTasks = enrichedTasks.filter((t) => t.statusId === status.id);
        columns.push({ status, tasks: colTasks });
      }

      const unstatused = enrichedTasks.filter((t) => !t.statusId);
      if (unstatused.length > 0) {
        columns.unshift({ status: null, tasks: unstatused });
      }

      return res.json({
        permissions: {
          canView: perms.canView,
          canViewAll: perms.canViewAll,
          canCreate: perms.canCreate,
          canEdit: perms.canEdit,
          canDelete: perms.canDelete,
        },
        statuses: allStatuses,
        levels: allLevels,
        columns,
      });
    } catch (err: any) {
      console.error("[MobileTasks] Kanban error:", err);
      return res.status(500).json({ message: "Lỗi khi tải dữ liệu Kanban" });
    }
  });

  /**
   * GET /api/mobile/tasks
   *
   * Returns a flat list of tasks with permission metadata.
   * Supports query params: statusId, levelId, search
   *
   * Response shape:
   * {
   *   permissions: { canView, canViewAll, canCreate, canEdit, canDelete },
   *   statuses: [...],
   *   levels: [...],
   *   tasks: [ Task... ]
   * }
   */
  app.get("/api/mobile/tasks", async (req, res) => {
    try {
      const perms = await resolveTaskPermissions(req);

      const [allTasks, allStatuses, allLevels] = await Promise.all([
        db.select().from(tasks).orderBy(desc(tasks.createdAt)),
        db.select().from(taskStatuses).orderBy(taskStatuses.position),
        db.select().from(taskLevels).orderBy(taskLevels.position),
      ]);

      let scopedTasks = applyPermissionFilter(allTasks, perms);

      const { statusId, levelId, search } = req.query as Record<string, string>;
      if (statusId) scopedTasks = scopedTasks.filter((t) => t.statusId === statusId);
      if (levelId) scopedTasks = scopedTasks.filter((t) => t.levelId === levelId);
      if (search) {
        const q = search.toLowerCase();
        scopedTasks = scopedTasks.filter((t) => t.title.toLowerCase().includes(q));
      }

      const allStaffIds = [
        ...new Set(scopedTasks.flatMap((t) => [...(t.managerIds ?? []), ...(t.assigneeIds ?? [])])),
      ];
      const staffMap = await buildStaffMap(allStaffIds);
      const enrichedTasks = enrichTasksWithStaff(scopedTasks, staffMap);

      return res.json({
        permissions: {
          canView: perms.canView,
          canViewAll: perms.canViewAll,
          canCreate: perms.canCreate,
          canEdit: perms.canEdit,
          canDelete: perms.canDelete,
        },
        statuses: allStatuses,
        levels: allLevels,
        tasks: enrichedTasks,
      });
    } catch (err: any) {
      console.error("[MobileTasks] List error:", err);
      return res.status(500).json({ message: "Lỗi khi lấy danh sách công việc" });
    }
  });

  /**
   * GET /api/mobile/tasks/:id
   *
   * Returns a single task detail. Access is granted only if the user
   * can see this task according to their permission scope.
   *
   * Response shape:
   * {
   *   permissions: { canEdit, canDelete },
   *   task: Task,
   *   status: TaskStatus | null,
   *   level: TaskLevel | null
   * }
   */
  app.get("/api/mobile/tasks/:id", async (req, res) => {
    try {
      const perms = await resolveTaskPermissions(req);

      const [row] = await db.select().from(tasks).where(eq(tasks.id, req.params.id)).limit(1);
      if (!row) return res.status(404).json({ message: "Không tìm thấy công việc" });

      const [scoped] = applyPermissionFilter([row], perms);
      if (!scoped) return res.status(403).json({ message: "Bạn không có quyền xem công việc này" });

      const managerIds: string[] = row.managerIds ?? [];
      const assigneeIds: string[] = row.assigneeIds ?? [];
      const subjectIds: string[] = row.subjectIds ?? [];
      const locationIds: string[] = row.locationIds ?? [];

      const [
        status,
        level,
        managersData,
        assigneesData,
        subjectsData,
        locationsData,
        departmentData,
        creatorData,
      ] = await Promise.all([
        row.statusId
          ? db.select().from(taskStatuses).where(eq(taskStatuses.id, row.statusId)).limit(1).then((r) => r[0] ?? null)
          : Promise.resolve(null),
        row.levelId
          ? db.select().from(taskLevels).where(eq(taskLevels.id, row.levelId)).limit(1).then((r) => r[0] ?? null)
          : Promise.resolve(null),
        managerIds.length
          ? db.select({ id: staff.id, fullName: staff.fullName, code: staff.code, phone: staff.phone, email: staff.email }).from(staff).where(inArray(staff.id, managerIds))
          : Promise.resolve([]),
        assigneeIds.length
          ? db.select({ id: staff.id, fullName: staff.fullName, code: staff.code, phone: staff.phone, email: staff.email }).from(staff).where(inArray(staff.id, assigneeIds))
          : Promise.resolve([]),
        subjectIds.length
          ? db.select({ id: students.id, name: students.fullName, fullName: students.fullName, code: students.code, type: students.type, phone: students.phone }).from(students).where(inArray(students.id, subjectIds))
          : Promise.resolve([]),
        locationIds.length
          ? db.select({ id: locations.id, name: locations.name, code: locations.code }).from(locations).where(inArray(locations.id, locationIds))
          : Promise.resolve([]),
        row.departmentId
          ? db.select({ id: departments.id, name: departments.name }).from(departments).where(eq(departments.id, row.departmentId)).limit(1).then((r) => r[0] ?? null)
          : Promise.resolve(null),
        row.createdBy
          ? db.select({ fullName: staff.fullName, code: staff.code }).from(staff).where(eq(staff.userId, row.createdBy)).limit(1).then((r) => r[0] ?? null)
          : Promise.resolve(null),
      ]);

      return res.json({
        permissions: {
          canEdit: perms.canEdit,
          canDelete: perms.canDelete,
        },
        task: {
          ...row,
          description: row.content ?? "",
        },
        status,
        level,
        managers: managersData,
        assignees: assigneesData,
        subjects: subjectsData,
        locationDetails: locationsData,
        department: departmentData,
        creatorName: creatorData ? `${creatorData.fullName} (${creatorData.code})` : null,
      });
    } catch (err: any) {
      console.error("[MobileTasks] GET one error:", err);
      return res.status(500).json({ message: "Lỗi khi lấy công việc" });
    }
  });

  /**
   * POST /api/mobile/tasks
   * Create a new task. Requires canCreate permission.
   */
  app.post("/api/mobile/tasks", async (req, res) => {
    try {
      const perms = await resolveTaskPermissions(req);
      if (!perms.canCreate) return res.status(403).json({ message: "Bạn không có quyền tạo công việc" });

      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

      const userId = (req.user as any)?.id;
      const [created] = await db
        .insert(tasks)
        .values({
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
        })
        .returning();

      if (userId && created.assigneeIds?.length) {
        const creatorLabel = await getCreatorLabel(userId, (req.user as any)?.username || "Hệ thống");
        notifyAssignees(created.assigneeIds, creatorLabel, created.title).catch(console.error);
      }

      return res.status(201).json(created);
    } catch (err: any) {
      console.error("[MobileTasks] POST create error:", err);
      return res.status(500).json({ message: "Lỗi khi tạo công việc" });
    }
  });

  /**
   * PATCH /api/mobile/tasks/:id
   * Update a task. Requires canEdit permission.
   */
  app.patch("/api/mobile/tasks/:id", async (req, res) => {
    try {
      const perms = await resolveTaskPermissions(req);
      if (!perms.canEdit) return res.status(403).json({ message: "Bạn không có quyền sửa công việc" });

      const [existing] = await db.select().from(tasks).where(eq(tasks.id, req.params.id)).limit(1);
      if (!existing) return res.status(404).json({ message: "Không tìm thấy công việc" });

      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

      const oldAssigneeIds: string[] = existing.assigneeIds ?? [];
      const { dueDate: dueDateRaw, ...restData } = parsed.data;
      const [updated] = await db
        .update(tasks)
        .set({
          ...restData,
          ...(dueDateRaw !== undefined ? { dueDate: dueDateRaw ? new Date(dueDateRaw) : null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, req.params.id))
        .returning();

      const newAssigneeIds: string[] = updated.assigneeIds ?? [];
      const addedIds = newAssigneeIds.filter((id) => !oldAssigneeIds.includes(id));
      if (addedIds.length) {
        const userId = (req.user as any)?.id;
        if (userId) {
          const creatorLabel = await getCreatorLabel(userId, (req.user as any)?.username || "Hệ thống");
          notifyAssignees(addedIds, creatorLabel, updated.title).catch(console.error);
        }
      }

      return res.json(updated);
    } catch (err: any) {
      console.error("[MobileTasks] PATCH update error:", err);
      return res.status(500).json({ message: "Lỗi khi cập nhật công việc" });
    }
  });

  /**
   * DELETE /api/mobile/tasks/:id
   * Delete a task. Requires canDelete permission.
   */
  app.delete("/api/mobile/tasks/:id", async (req, res) => {
    try {
      const perms = await resolveTaskPermissions(req);
      if (!perms.canDelete) return res.status(403).json({ message: "Bạn không có quyền xoá công việc" });

      const [existing] = await db.select().from(tasks).where(eq(tasks.id, req.params.id)).limit(1);
      if (!existing) return res.status(404).json({ message: "Không tìm thấy công việc" });

      await db.delete(tasks).where(eq(tasks.id, req.params.id));
      return res.json({ message: "Đã xoá công việc" });
    } catch (err: any) {
      console.error("[MobileTasks] DELETE error:", err);
      return res.status(500).json({ message: "Lỗi khi xoá công việc" });
    }
  });

  /**
   * GET /api/mobile/tasks/:id/attachments
   * Get all attachments for a task.
   *
   * Response shape:
   * [{ name, url, size, mimetype }]
   */
  app.get("/api/mobile/tasks/:id/attachments", async (req, res) => {
    try {
      const perms = await resolveTaskPermissions(req);
      const [row] = await db.select().from(tasks).where(eq(tasks.id, req.params.id)).limit(1);
      if (!row) return res.status(404).json({ message: "Không tìm thấy công việc" });

      const [accessible] = applyPermissionFilter([row], perms);
      if (!accessible) return res.status(403).json({ message: "Bạn không có quyền xem công việc này" });

      const attachments: any[] = Array.isArray(row.attachments) ? row.attachments : [];
      return res.json(attachments);
    } catch (err: any) {
      console.error("[MobileTasks] Attachments GET error:", err);
      return res.status(500).json({ message: "Lỗi khi lấy file đính kèm" });
    }
  });

  /**
   * POST /api/mobile/tasks/:id/attachments
   * Upload one or more files and attach them to a task.
   * Requires canEdit permission.
   *
   * Request: multipart/form-data with field "files" (one or many)
   * Response shape:
   * { attachments: [{ name, url, size, mimetype }] }
   */
  app.post(
    "/api/mobile/tasks/:id/attachments",
    mobileUpload.array("files"),
    async (req, res) => {
      try {
        const perms = await resolveTaskPermissions(req);
        if (!perms.canEdit) return res.status(403).json({ message: "Bạn không có quyền thêm file đính kèm" });

        const [row] = await db.select().from(tasks).where(eq(tasks.id, req.params.id)).limit(1);
        if (!row) return res.status(404).json({ message: "Không tìm thấy công việc" });

        const [accessible] = applyPermissionFilter([row], perms);
        if (!accessible) return res.status(403).json({ message: "Bạn không có quyền chỉnh sửa công việc này" });

        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
          return res.status(400).json({ message: "Không có file nào được tải lên" });
        }

        const uploaded = await Promise.all(
          files.map(async (f) => {
            const url = await uploadFileToS3(f.buffer, f.originalname, f.mimetype);
            return { name: f.originalname, url, size: f.size, mimetype: f.mimetype };
          })
        );

        const existing: any[] = Array.isArray(row.attachments) ? row.attachments : [];
        const merged = [...existing, ...uploaded];

        const [updated] = await db
          .update(tasks)
          .set({ attachments: merged, updatedAt: new Date() })
          .where(eq(tasks.id, req.params.id))
          .returning();

        return res.status(201).json({ attachments: updated.attachments });
      } catch (err: any) {
        console.error("[MobileTasks] Attachments POST error:", err);
        return res.status(500).json({ message: "Lỗi khi tải lên file đính kèm" });
      }
    }
  );

  /**
   * DELETE /api/mobile/tasks/:id/attachments
   * Remove an attachment from a task by its URL.
   * Requires canEdit permission.
   *
   * Request body: { url: string }
   * Response shape:
   * { attachments: [{ name, url, size, mimetype }] }
   */
  app.delete("/api/mobile/tasks/:id/attachments", async (req, res) => {
    try {
      const perms = await resolveTaskPermissions(req);
      if (!perms.canEdit) return res.status(403).json({ message: "Bạn không có quyền xoá file đính kèm" });

      const [row] = await db.select().from(tasks).where(eq(tasks.id, req.params.id)).limit(1);
      if (!row) return res.status(404).json({ message: "Không tìm thấy công việc" });

      const schema = z.object({ url: z.string().url("URL không hợp lệ") });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

      const existing: any[] = Array.isArray(row.attachments) ? row.attachments : [];
      const filtered = existing.filter((a: any) => a.url !== parsed.data.url);

      if (filtered.length === existing.length) {
        return res.status(404).json({ message: "Không tìm thấy file đính kèm với URL này" });
      }

      const [updated] = await db
        .update(tasks)
        .set({ attachments: filtered, updatedAt: new Date() })
        .where(eq(tasks.id, req.params.id))
        .returning();

      return res.json({ attachments: updated.attachments });
    } catch (err: any) {
      console.error("[MobileTasks] Attachments DELETE error:", err);
      return res.status(500).json({ message: "Lỗi khi xoá file đính kèm" });
    }
  });

  /**
   * GET /api/mobile/tasks/:id/comments
   * Get all comments for a task.
   */
  app.get("/api/mobile/tasks/:id/comments", async (req, res) => {
    try {
      const perms = await resolveTaskPermissions(req);
      const [row] = await db.select().from(tasks).where(eq(tasks.id, req.params.id)).limit(1);
      if (!row) return res.status(404).json({ message: "Không tìm thấy công việc" });

      const [accessible] = applyPermissionFilter([row], perms);
      if (!accessible) return res.status(403).json({ message: "Bạn không có quyền xem công việc này" });

      const rows = await db
        .select()
        .from(taskComments)
        .where(eq(taskComments.taskId, req.params.id))
        .orderBy(desc(taskComments.createdAt));
      return res.json(rows);
    } catch (err: any) {
      console.error("[MobileTasks] Comments GET error:", err);
      return res.status(500).json({ message: "Lỗi khi lấy bình luận" });
    }
  });

  /**
   * POST /api/mobile/tasks/:id/comments
   * Add a comment to a task.
   */
  app.post("/api/mobile/tasks/:id/comments", async (req, res) => {
    try {
      const perms = await resolveTaskPermissions(req);
      const [row] = await db.select().from(tasks).where(eq(tasks.id, req.params.id)).limit(1);
      if (!row) return res.status(404).json({ message: "Không tìm thấy công việc" });

      const [accessible] = applyPermissionFilter([row], perms);
      if (!accessible) return res.status(403).json({ message: "Bạn không có quyền bình luận công việc này" });

      const schema = z.object({ content: z.string().min(1, "Nội dung không được trống") });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

      const userId = (req.user as any)?.id;
      const authorName = (req.user as any)?.fullName || (req.user as any)?.username || "Ẩn danh";

      const [created] = await db
        .insert(taskComments)
        .values({
          taskId: req.params.id,
          authorId: userId || null,
          authorName,
          content: parsed.data.content,
        })
        .returning();

      return res.status(201).json(created);
    } catch (err: any) {
      console.error("[MobileTasks] Comments POST error:", err);
      return res.status(500).json({ message: "Lỗi khi thêm bình luận" });
    }
  });

  /**
   * DELETE /api/mobile/tasks/:taskId/comments/:commentId
   * Delete a comment. Requires canEdit permission.
   */
  app.delete("/api/mobile/tasks/:taskId/comments/:commentId", async (req, res) => {
    try {
      const perms = await resolveTaskPermissions(req);
      if (!perms.canEdit && !perms.canDelete) {
        return res.status(403).json({ message: "Bạn không có quyền xoá bình luận" });
      }
      await db.delete(taskComments).where(eq(taskComments.id, req.params.commentId));
      return res.json({ message: "Đã xoá bình luận" });
    } catch (err: any) {
      console.error("[MobileTasks] Comments DELETE error:", err);
      return res.status(500).json({ message: "Lỗi khi xoá bình luận" });
    }
  });

  /**
   * GET /api/mobile/tasks/meta
   * Returns statuses, levels, and current user's task permissions.
   * Useful for bootstrapping the mobile app UI state.
   */
  app.get("/api/mobile/tasks/meta", async (req, res) => {
    try {
      const perms = await resolveTaskPermissions(req);
      const [allStatuses, allLevels] = await Promise.all([
        db.select().from(taskStatuses).orderBy(taskStatuses.position),
        db.select().from(taskLevels).orderBy(taskLevels.position),
      ]);

      return res.json({
        permissions: {
          canView: perms.canView,
          canViewAll: perms.canViewAll,
          canCreate: perms.canCreate,
          canEdit: perms.canEdit,
          canDelete: perms.canDelete,
        },
        statuses: allStatuses,
        levels: allLevels,
      });
    } catch (err: any) {
      console.error("[MobileTasks] Meta error:", err);
      return res.status(500).json({ message: "Lỗi khi tải dữ liệu" });
    }
  });
}
