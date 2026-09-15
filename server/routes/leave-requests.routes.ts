import type { Express } from "express";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../storage/base";
import {
  leaveRequests,
  rolePermissions,
  staff,
  staffAssignments,
  users,
} from "@shared/schema";
import { sendNotification, sendNotificationToMany } from "../lib/notification";

const STAFF_LEAVE_TYPES: Record<string, string> = {
  nghi_phep: "Nghỉ phép",
  nghi_co_luong: "Nghỉ phép năm",
  tang_ca: "Tăng ca",
};

function formatNotificationDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${Number(day)}/${Number(month)}/${year}` : value;
}

function staffLeaveTypeLabel(type: string) {
  return STAFF_LEAVE_TYPES[type] ?? type;
}

async function getLeavePageManagerUserIds(locationId: string | null | undefined, excludeUserId?: string) {
  const managerRows = await db
    .select({ userId: staff.userId })
    .from(staff)
    .innerJoin(staffAssignments, eq(staffAssignments.staffId, staff.id))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, staffAssignments.roleId))
    .where(and(
      eq(rolePermissions.resource, "/don-tu"),
      or(
        eq(rolePermissions.canView, true),
        eq(rolePermissions.canViewAll, true),
        eq(rolePermissions.canEdit, true),
      ),
      ...(locationId ? [eq(staffAssignments.locationId, locationId)] : []),
    ));

  const adminRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, "admin"));

  return [...new Set(
    [...managerRows.map((row) => row.userId), ...adminRows.map((row) => row.id)]
      .filter((userId): userId is string => Boolean(userId && userId !== excludeUserId)),
  )];
}

async function notifyStaffLeaveCreated(request: {
  id: string;
  staffId: string;
  type: string;
  fromDate: string;
  toDate: string;
  reason?: string | null;
  locationId?: string | null;
}) {
  const [staffRecord] = await db
    .select({ userId: staff.userId, fullName: staff.fullName, code: staff.code })
    .from(staff)
    .where(eq(staff.id, request.staffId))
    .limit(1);
  if (!staffRecord) return;

  const recipientIds = await getLeavePageManagerUserIds(request.locationId, staffRecord.userId);
  if (recipientIds.length === 0) return;

  const dateText = `Từ ngày ${formatNotificationDate(request.fromDate)} - đến ngày ${formatNotificationDate(request.toDate)}`;
  const reasonText = request.reason?.trim() || "Không có lý do";
  await sendNotificationToMany(recipientIds, {
    title: "Đơn Nghỉ phép",
    content: `${staffRecord.fullName} (${staffRecord.code}), xin nghỉ ${dateText}, Loại: ${staffLeaveTypeLabel(request.type)}, Lý do: ${reasonText}`,
    category: "staff_leave",
    referenceId: request.id,
    referenceType: "staff_leave_request",
    referenceDate: request.fromDate,
    deeplink: {
      screen: "StaffLeaveRequestManagement",
      params: { requestId: request.id },
    },
  });
}

async function notifyStaffLeaveStatus(request: {
  id: string;
  staffId: string;
  type: string;
  fromDate: string;
  toDate: string;
  status: "approved" | "rejected";
  adminNote?: string | null;
}) {
  const [staffRecord] = await db
    .select({ userId: staff.userId, fullName: staff.fullName, code: staff.code })
    .from(staff)
    .where(eq(staff.id, request.staffId))
    .limit(1);
  if (!staffRecord?.userId) return;

  const statusText = request.status === "approved" ? "Đã duyệt" : "Từ chối";
  const rejectionText = request.status === "rejected" && request.adminNote?.trim()
    ? `, Lý do: ${request.adminNote.trim()}`
    : "";
  const dateText = `Từ ngày ${formatNotificationDate(request.fromDate)} - đến ngày ${formatNotificationDate(request.toDate)}`;

  await sendNotification({
    userId: staffRecord.userId,
    title: "Đơn Nghỉ phép",
    content: `Đơn Nghỉ phép, ${staffRecord.fullName} (${staffRecord.code}), xin nghỉ ${dateText}, Trạng thái: ${statusText}${rejectionText}`,
    category: "staff_leave",
    referenceId: request.id,
    referenceType: "staff_leave_request",
    referenceDate: request.fromDate,
    deeplink: {
      screen: "StaffMyLeaveRequests",
      params: { requestId: request.id },
    },
  });
}

const selfLeaveRequestSchema = z.object({
  type: z.enum(["nghi_phep", "nghi_co_luong", "tang_ca"]),
  fromDate: z.string().min(1),
  toDate: z.string().min(1),
  hours: z.string().optional().nullable(),
  overtimeFrom: z.string().optional().nullable(),
  overtimeTo: z.string().optional().nullable(),
  reason: z.string().trim().max(5000).optional().nullable(),
});

function validateDateRange(fromDate: string, toDate: string) {
  if (fromDate > toDate) return "Ngày bắt đầu không được sau ngày kết thúc";
  return null;
}

export function registerLeaveRequestRoutes(app: Express) {
  app.post("/api/leave-requests/self", async (req, res) => {
    try {
      const input = selfLeaveRequestSchema.parse(req.body);
      const currentStaffId = req.staffId;
      if (!currentStaffId) return res.status(403).json({ message: "Tài khoản không phải nhân sự." });

      const dateError = validateDateRange(input.fromDate, input.toDate);
      if (dateError) return res.status(400).json({ message: dateError });

      if (input.type === "tang_ca") {
        if (!input.overtimeFrom || !input.overtimeTo) {
          return res.status(400).json({ message: "Vui lòng nhập thời gian tăng ca." });
        }
        const [fromHour, fromMinute] = input.overtimeFrom.split(":").map(Number);
        const [toHour, toMinute] = input.overtimeTo.split(":").map(Number);
        if ((toHour * 60 + toMinute) <= (fromHour * 60 + fromMinute)) {
          return res.status(400).json({ message: "Thời gian tăng ca không hợp lệ." });
        }
      }

      const [assignment] = await db
        .select({ locationId: staffAssignments.locationId })
        .from(staffAssignments)
        .where(eq(staffAssignments.staffId, currentStaffId))
        .orderBy(desc(staffAssignments.createdAt))
        .limit(1);

      const [row] = await db.insert(leaveRequests).values({
        staffId: currentStaffId,
        locationId: assignment?.locationId ?? null,
        type: input.type,
        fromDate: input.fromDate,
        toDate: input.type === "tang_ca" ? input.fromDate : input.toDate,
        hours: input.hours ?? null,
        overtimeFrom: input.overtimeFrom ?? null,
        overtimeTo: input.overtimeTo ?? null,
        reason: input.reason?.trim() || null,
        status: "pending",
      }).returning();

      await notifyStaffLeaveCreated({
        id: row.id,
        staffId: row.staffId,
        type: row.type,
        fromDate: row.fromDate,
        toDate: row.toDate,
        reason: row.reason,
        locationId: row.locationId,
      }).catch((error) => console.error("[LeaveRequests] create notification error:", error));

      return res.status(201).json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Dữ liệu đơn từ không hợp lệ", issues: err.issues });
      console.error("[LeaveRequests] self create error:", err);
      return res.status(500).json({ message: (err as any).message || "Không thể tạo đơn từ" });
    }
  });

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
      if (status === "rejected" && !adminNote?.trim()) {
        return res.status(400).json({ message: "Vui lòng nhập lý do từ chối." });
      }
      const [existing] = await db
        .select()
        .from(leaveRequests)
        .where(eq(leaveRequests.id, req.params.id))
        .limit(1);
      if (!existing) return res.status(404).json({ message: "Không tìm thấy đơn từ" });
      const [row] = await db
        .update(leaveRequests)
        .set({ status, adminNote: adminNote ?? null, updatedAt: new Date() })
        .where(eq(leaveRequests.id, req.params.id))
        .returning();
      if (row && existing.status !== row.status && (row.status === "approved" || row.status === "rejected")) {
        await notifyStaffLeaveStatus({
          id: row.id,
          staffId: row.staffId,
          type: row.type,
          fromDate: row.fromDate,
          toDate: row.toDate,
          status: row.status,
          adminNote: row.adminNote,
        }).catch((error) => console.error("[LeaveRequests] status notification error:", error));
      }
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
