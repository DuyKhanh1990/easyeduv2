import type { Express, Request, Response } from "express";
import { db } from "../storage/base";
import { notifications, students } from "@shared/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { sendNotification } from "../lib/notification";

// Lấy tất cả userId cần truy vấn noti:
// - Với phụ huynh: gộp userId của phụ huynh + userId của các học viên liên kết
// - Với tài khoản khác: chỉ userId của chính họ
async function getRelevantUserIds(userId: string): Promise<string[]> {
  const [parentStudent] = await db
    .select({ id: students.id, type: students.type })
    .from(students)
    .where(and(eq(students.userId, userId), eq(students.type, "Phụ huynh")))
    .limit(1);

  if (!parentStudent) return [userId];

  // Tìm các học viên có parentIds chứa ID của phụ huynh này
  const linkedStudents = await db
    .select({ userId: students.userId })
    .from(students)
    .where(sql`${students.parentIds} @> ARRAY[${parentStudent.id}]::uuid[]`);

  const linkedUserIds = linkedStudents
    .map((s) => s.userId)
    .filter((id): id is string => !!id);

  return [userId, ...linkedUserIds];
}

export function registerNotificationRoutes(app: Express) {
  app.get("/api/notifications", async (req: Request, res: Response) => {
    const user = req.user as { id: string } | undefined;
    if (!user) return res.sendStatus(401);

    const userIds = await getRelevantUserIds(user.id);

    const rows = await db
      .select()
      .from(notifications)
      .where(inArray(notifications.userId, userIds))
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    res.json(rows);
  });

  app.get("/api/notifications/unread-count", async (req: Request, res: Response) => {
    const user = req.user as { id: string } | undefined;
    if (!user) return res.sendStatus(401);

    const userIds = await getRelevantUserIds(user.id);

    const rows = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(inArray(notifications.userId, userIds), eq(notifications.isRead, false)));

    res.json({ count: rows.length });
  });

  app.patch("/api/notifications/:id/read", async (req: Request, res: Response) => {
    const user = req.user as { id: string } | undefined;
    if (!user) return res.sendStatus(401);

    const userIds = await getRelevantUserIds(user.id);

    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, req.params.id), inArray(notifications.userId, userIds)));

    res.json({ success: true });
  });

  app.patch("/api/notifications/read-all", async (req: Request, res: Response) => {
    const user = req.user as { id: string } | undefined;
    if (!user) return res.sendStatus(401);

    const userIds = await getRelevantUserIds(user.id);

    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(inArray(notifications.userId, userIds), eq(notifications.isRead, false)));

    res.json({ success: true });
  });

  app.delete("/api/notifications/:id", async (req: Request, res: Response) => {
    const user = req.user as { id: string } | undefined;
    if (!user) return res.sendStatus(401);

    const userIds = await getRelevantUserIds(user.id);

    await db
      .delete(notifications)
      .where(and(eq(notifications.id, req.params.id), inArray(notifications.userId, userIds)));

    res.json({ success: true });
  });

  app.post("/api/notifications/send", async (req: Request, res: Response) => {
    const { userId, title, content, category, referenceId, referenceType, email } = req.body;

    if (!userId || !content) {
      return res.status(400).json({ error: "userId và content là bắt buộc" });
    }

    try {
      const result = await sendNotification({
        userId,
        title: title || "Thông báo mới",
        content,
        category,
        referenceId,
        referenceType,
        email,
      });
      res.json({ success: true, notification: result });
    } catch (err: any) {
      console.error("[Notification API Error]", err);
      res.status(500).json({ error: err.message });
    }
  });
}
