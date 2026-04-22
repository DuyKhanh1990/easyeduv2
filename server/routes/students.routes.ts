import type { Express } from "express";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { runSecurityTests } from "../middleware/security-test";
import { db } from "../db";
import { invoices, invoiceItems, studentSessions, invoicePaymentSchedule, students, classes, attendanceFeeRules, users, staff, staffAssignments, locations, classGradeBooks, classGradeBookScores, scoreCategories, scoreSheetItems, sessionContents, studentSessionContents, classSessions } from "@shared/schema";
import { eq, and, isNotNull, sql, inArray, desc } from "drizzle-orm";
import { getStudentLearningStatusSummary, getCustomerSummary, getNewCustomersSummary, getStudentsBySource, getStudentsByRelationship, getStudentsByLocation, getStudentsByStaff, getStudentsLearningStatuses } from "../storage/student.storage";

const CRM_RESOURCE = "/customers";

// Field display names for activity log
const STUDENT_FIELD_LABELS: Record<string, string> = {
  fullName: "Họ và tên",
  code: "Mã học viên",
  locations: "Cơ sở",
  phone: "Số điện thoại",
  email: "Email",
  dateOfBirth: "Ngày sinh",
  gender: "Giới tính",
  type: "Loại",
  pipelineStage: "Pipeline",
  relationshipList: "Mối quan hệ",
  sourceList: "Nguồn",
  status: "Trạng thái",
  accountStatus: "Trạng thái tài khoản",
  parentName: "Tên phụ huynh 1",
  parentPhone: "SĐT phụ huynh 1",
  parentName2: "Tên phụ huynh 2",
  parentPhone2: "SĐT phụ huynh 2",
  parentName3: "Tên phụ huynh 3",
  parentPhone3: "SĐT phụ huynh 3",
  parentIds: "Mã phụ huynh",
  address: "Địa chỉ",
  source: "Nguồn",
  rejectReason: "Lý do từ chối",
  socialLink: "Mạng xã hội",
  academicLevel: "Trình độ học vấn",
  salesByList: "Sale",
  managedByList: "Quản lý",
  teacherList: "Giáo viên",
  classNames: "Lớp học",
  note: "Ghi chú",
};

const TRACKED_FIELDS = Object.keys(STUDENT_FIELD_LABELS);

async function getActorName(userId: string): Promise<string> {
  try {
    const [staffRow] = await db.select({ fullName: staff.fullName }).from(staff).where(eq(staff.userId, userId)).limit(1);
    if (staffRow) return staffRow.fullName;
    const [userRow] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId)).limit(1);
    return userRow?.username ?? "Hệ thống";
  } catch {
    return "Hệ thống";
  }
}

function normalizeLogStudentData(obj: any): Record<string, any> {
  const normalized: Record<string, any> = {
    ...obj,
    locations: Array.isArray(obj.locations)
      ? obj.locations.map((item: any) => item.location?.name || item.name || item.locationId).filter(Boolean)
      : undefined,
    relationshipList: Array.isArray(obj.relationshipList)
      ? obj.relationshipList.map((item: any) => item.name || item.id).filter(Boolean)
      : undefined,
    sourceList: Array.isArray(obj.sourceList)
      ? obj.sourceList.filter(Boolean)
      : Array.isArray(obj.customerSourceIds)
        ? obj.customerSourceIds
        : undefined,
    salesByList: Array.isArray(obj.salesByList)
      ? obj.salesByList.map((item: any) => item.fullName || item.id).filter(Boolean)
      : undefined,
    managedByList: Array.isArray(obj.managedByList)
      ? obj.managedByList.map((item: any) => item.fullName || item.id).filter(Boolean)
      : undefined,
    teacherList: Array.isArray(obj.teacherList)
      ? obj.teacherList.map((item: any) => item.fullName || item.id).filter(Boolean)
      : undefined,
    classNames: Array.isArray(obj.classNames)
      ? obj.classNames.filter(Boolean)
      : Array.isArray(obj.classDetails)
        ? obj.classDetails.map((item: any) => item.className || item.classCode).filter(Boolean)
        : undefined,
  };
  return normalized;
}

function pickTrackedFields(obj: any): Record<string, any> {
  const normalized = normalizeLogStudentData(obj);
  const result: Record<string, any> = {};
  for (const field of TRACKED_FIELDS) {
    const value = normalized[field];
    if (value !== undefined && value !== null && value !== "" && (!Array.isArray(value) || value.length > 0)) {
      result[field] = value;
    }
  }
  return result;
}

function diffFields(before: any, after: any): { oldData: Record<string, any>; newData: Record<string, any> } {
  const normalizedBefore = normalizeLogStudentData(before);
  const normalizedAfter = normalizeLogStudentData(after);
  const oldData: Record<string, any> = {};
  const newData: Record<string, any> = {};
  for (const field of TRACKED_FIELDS) {
    const oldVal = normalizedBefore[field] ?? null;
    const newVal = normalizedAfter[field] ?? null;
    const oldStr = JSON.stringify(oldVal);
    const newStr = JSON.stringify(newVal);
    if (oldStr !== newStr) {
      oldData[field] = oldVal;
      newData[field] = newVal;
    }
  }
  return { oldData, newData };
}

function formatDeletedStudentLabel(student: any): string {
  const fullName = student?.fullName || "Học viên";
  const code = student?.code ? ` (${student.code})` : "";
  const normalized = normalizeLogStudentData(student);
  const locationText = Array.isArray(normalized.locations) && normalized.locations.length > 0
    ? ` ${normalized.locations.join(", ")}`
    : "";
  return `${fullName}${code}${locationText}`;
}

function buildDeletedLogData(student: any): { oldData: Record<string, any>; newData: Record<string, any> } {
  const studentLabel = formatDeletedStudentLabel(student);
  return {
    oldData: { __text: studentLabel },
    newData: { __text: `Đã xoá ${studentLabel} ra khỏi hệ thống` },
  };
}

function buildCreatedLogData(student: any): { oldData: Record<string, any>; newData: Record<string, any> } {
  const fullName = student?.fullName || "Học viên";
  const code = student?.code ? ` (${student.code})` : "";
  const normalized = normalizeLogStudentData(student);
  const locationText = Array.isArray(normalized.locations) && normalized.locations.length > 0
    ? ` vào ${normalized.locations.join(", ")}`
    : "";
  const typeText = student?.type === "Phụ huynh" ? "phụ huynh" : "học viên";
  const text = `Thêm mới ${typeText}:${fullName}${code}${locationText}`;
  return {
    oldData: { __text: text },
    newData: { __text: text },
  };
}

async function insertActivityLog(opts: {
  studentId: string | null;
  userId: string;
  userName: string;
  action: "create" | "update" | "delete";
  oldData: Record<string, any> | null;
  newData: Record<string, any> | null;
}) {
  try {
    await db.execute(
      sql`INSERT INTO customer_activity_logs (student_id, user_id, user_name, action, old_data, new_data)
          VALUES (${opts.studentId}, ${opts.userId}, ${opts.userName}, ${opts.action}, ${JSON.stringify(opts.oldData)}, ${JSON.stringify(opts.newData)})`
    );
  } catch (err) {
    console.error("Activity log insert failed:", err);
  }
}

async function getCrmPermissions(req: any) {
  if (req.isSuperAdmin) {
    return { canView: true, canViewAll: true, canCreate: true, canEdit: true, canDelete: true };
  }
  return storage.getEffectivePermissions(req.roleIds || [], CRM_RESOURCE);
}

async function getNextCustomerCode(type: string): Promise<string> {
  const prefix = type === "Phụ huynh" ? "PH-" : "HV-";
  const rows = await db.select({ code: students.code })
    .from(students)
    .where(sql`${students.code} LIKE ${`${prefix}%`}`);

  const maxNum = rows.reduce((max, row) => {
    const match = row.code?.match(new RegExp(`^${prefix}(\\d+)$`));
    const num = match ? parseInt(match[1], 10) : 0;
    return Number.isFinite(num) && num > max ? num : max;
  }, 0);

  return `${prefix}${(maxNum + 1).toString().padStart(2, "0")}`;
}

export function registerStudentsRoutes(app: Express): void {
  // Students
  app.get(api.students.list.path, async (req, res) => {
    try {
      const crmPerms = await getCrmPermissions(req);

      // No view permission at all → forbidden
      if (!crmPerms.canView && !crmPerms.canViewAll) {
        return res.status(403).json({ message: "Bạn không có quyền xem danh sách khách hàng." });
      }

      // Lightweight mode for dropdowns — skips heavy joins
      if (req.query.minimal === "true") {
        const limit = parseInt(req.query.limit as string) || 200;
        const result = await storage.getStudentsMinimal({
          allowedLocationIds: req.allowedLocationIds,
          isSuperAdmin: req.isSuperAdmin,
          locationId: req.query.locationId as string | undefined,
          limit,
        });
        return res.json({ students: result, total: result.length });
      }

      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      const parseArray = (val: any) => {
        if (!val) return undefined;
        return Array.isArray(val) ? val : [val];
      };

      // Determine view scope
      const viewScope = crmPerms.canViewAll ? 'all' : 'own';

      const result = await storage.getStudents({
        allowedLocationIds: req.allowedLocationIds,
        isSuperAdmin: req.isSuperAdmin,
        locationId: req.query.locationId as string | undefined,
        limit,
        offset,
        searchTerm: req.query.searchTerm as string | undefined,
        type: req.query.type as string | undefined,
        pipelineStage: req.query.pipelineStage as string | undefined,
        sources: parseArray(req.query.sources),
        rejectReasons: parseArray(req.query.rejectReasons),
        salesIds: parseArray(req.query.salesIds),
        managerIds: parseArray(req.query.managerIds),
        teacherIds: parseArray(req.query.teacherIds),
        classIds: parseArray(req.query.classIds),
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        viewScope,
        viewerStaffId: req.staffId ?? undefined,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.get("/api/students/next-code", async (req, res) => {
    try {
      const crmPerms = await getCrmPermissions(req);
      if (!crmPerms.canCreate) {
        return res.status(403).json({ message: "Bạn không có quyền thêm khách hàng mới." });
      }
      const type = req.query.type === "Phụ huynh" ? "Phụ huynh" : "Học viên";
      const code = await getNextCustomerCode(type);
      res.json({ code });
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  // ── GET /api/students/customer-summary ─────────────────────────────────────
  // Trả về tổng khách hàng, phân loại (học viên/phụ huynh), trạng thái tài khoản
  // Query params: locationId (optional)
  app.get("/api/students/customer-summary", async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const isSuperAdmin = (req as any).isSuperAdmin ?? false;
      const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];
      const locationId = typeof req.query.locationId === "string" ? req.query.locationId : undefined;

      const summary = await getCustomerSummary({ isSuperAdmin, allowedLocationIds, locationId });
      res.json(summary);
    } catch (err: any) {
      console.error("Customer summary error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải tổng quan khách hàng" });
    }
  });

  // ── GET /api/students/learning-status-summary ──────────────────────────────
  // Trả về số lượng học viên theo từng trạng thái học tập
  // Query params: locationId (optional), dateFrom (YYYY-MM-DD), dateTo (YYYY-MM-DD) — optional
  app.get("/api/students/learning-status-summary", async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const isSuperAdmin = (req as any).isSuperAdmin ?? false;
      const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];

      const locationId = typeof req.query.locationId === "string" ? req.query.locationId : undefined;
      const dateFrom   = typeof req.query.dateFrom   === "string" ? req.query.dateFrom   : undefined;
      const dateTo     = typeof req.query.dateTo     === "string" ? req.query.dateTo     : undefined;

      const summary = await getStudentLearningStatusSummary({
        isSuperAdmin,
        allowedLocationIds,
        locationId,
        dateFrom,
        dateTo,
      });

      res.json(summary);
    } catch (err: any) {
      console.error("Learning status summary error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tính trạng thái học tập" });
    }
  });

  // ── GET /api/students/new-customers-summary ─────────────────────────────────
  // Trả về số khách hàng mới hôm nay và tháng này
  // Query params: locationId (optional)
  app.get("/api/students/new-customers-summary", async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const isSuperAdmin = (req as any).isSuperAdmin ?? false;
      const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];
      const locationId = typeof req.query.locationId === "string" ? req.query.locationId : undefined;

      const summary = await getNewCustomersSummary({ isSuperAdmin, allowedLocationIds, locationId });
      res.json(summary);
    } catch (err: any) {
      console.error("New customers summary error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải khách hàng mới" });
    }
  });

  // ── GET /api/students/by-source ─────────────────────────────────────────────
  // Trả về số lượng học viên theo từng nguồn khách hàng
  // Query params: locationId (optional), months (optional, default 1), dateFrom, dateTo
  app.get("/api/students/by-source", async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const isSuperAdmin = (req as any).isSuperAdmin ?? false;
      const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];
      const locationId = typeof req.query.locationId === "string" ? req.query.locationId : undefined;
      const months = typeof req.query.months === "string" ? parseInt(req.query.months, 10) : 1;
      const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined;
      const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : undefined;

      const data = await getStudentsBySource({ isSuperAdmin, allowedLocationIds, locationId, months, dateFrom, dateTo });
      res.json(data);
    } catch (err: any) {
      console.error("Students by source error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải dữ liệu theo nguồn" });
    }
  });

  // ── GET /api/students/by-relationship ─────────────────────────────────────────
  // Trả về số lượng học viên theo từng mối quan hệ
  // Query params: locationId (optional), months (optional, default 1), dateFrom, dateTo
  app.get("/api/students/by-relationship", async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const isSuperAdmin = (req as any).isSuperAdmin ?? false;
      const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];
      const locationId = typeof req.query.locationId === "string" ? req.query.locationId : undefined;
      const months = typeof req.query.months === "string" ? parseInt(req.query.months, 10) : 1;
      const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined;
      const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : undefined;

      const data = await getStudentsByRelationship({ isSuperAdmin, allowedLocationIds, locationId, months, dateFrom, dateTo });
      res.json(data);
    } catch (err: any) {
      console.error("Students by relationship error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải dữ liệu theo mối quan hệ" });
    }
  });

  // ── GET /api/students/by-location ─────────────────────────────────────────
  app.get("/api/students/by-location", async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const isSuperAdmin = (req as any).isSuperAdmin ?? false;
      const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];
      const locationId = typeof req.query.locationId === "string" ? req.query.locationId : undefined;
      const months = typeof req.query.months === "string" ? parseInt(req.query.months, 10) : 1;
      const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined;
      const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : undefined;
      const data = await getStudentsByLocation({ isSuperAdmin, allowedLocationIds, locationId, months, dateFrom, dateTo });
      res.json(data);
    } catch (err: any) {
      console.error("Students by location error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải dữ liệu theo cơ sở" });
    }
  });

  // ── GET /api/students/by-staff ─────────────────────────────────────────────
  app.get("/api/students/by-staff", async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const isSuperAdmin = (req as any).isSuperAdmin ?? false;
      const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];
      const locationId = typeof req.query.locationId === "string" ? req.query.locationId : undefined;
      const months = typeof req.query.months === "string" ? parseInt(req.query.months, 10) : 1;
      const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined;
      const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : undefined;
      const data = await getStudentsByStaff({ isSuperAdmin, allowedLocationIds, locationId, months, dateFrom, dateTo });
      res.json(data);
    } catch (err: any) {
      console.error("Students by staff error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải dữ liệu theo nhân sự" });
    }
  });

  // ── GET /api/students/learning-statuses ───────────────────────────────────
  app.get("/api/students/learning-statuses", async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const idsParam = typeof req.query.ids === "string" ? req.query.ids : "";
      const studentIds = idsParam ? idsParam.split(",").filter(Boolean) : [];
      if (studentIds.length === 0) return res.json({});
      const statuses = await getStudentsLearningStatuses(studentIds);
      res.json(statuses);
    } catch (err: any) {
      console.error("Learning statuses error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải trạng thái học tập" });
    }
  });

  app.get(api.students.get.path, async (req, res) => {
    try {
      const crmPerms = await getCrmPermissions(req);
      if (!crmPerms.canView && !crmPerms.canViewAll) {
        return res.status(403).json({ message: "Bạn không có quyền xem thông tin khách hàng." });
      }
      const student = await storage.getStudent(req.params.id, req.allowedLocationIds, req.isSuperAdmin);
      if (!student) return res.status(404).json({ message: "Not found" });

      // If only can_view (not can_view_all), check ownership
      if (!crmPerms.canViewAll && req.staffId) {
        const staffId = req.staffId;
        const isOwner =
          (student.salesByIds || []).includes(staffId) ||
          (student.managedByIds || []).includes(staffId) ||
          (student.teacherIds || []).includes(staffId);
        if (!isOwner) {
          return res.status(403).json({ message: "Bạn không có quyền xem khách hàng này." });
        }
      }
      res.json(student);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.post(api.students.create.path, async (req, res) => {
    try {
      const crmPerms = await getCrmPermissions(req);
      if (!crmPerms.canCreate) {
        return res.status(403).json({ message: "Bạn không có quyền thêm khách hàng mới." });
      }
      const input = api.students.create.input.parse(req.body);
      const student = await storage.createStudent({ ...input, createdBy: (req.user as any).id });
      const userId = (req.user as any).id;
      const userName = await getActorName(userId);
      const { oldData, newData } = buildCreatedLogData(student);
      await insertActivityLog({
        studentId: student.id,
        userId,
        userName,
        action: "create",
        oldData,
        newData,
      });
      res.status(201).json(student);

      // Tinode user account is created lazily on first browser login (client-side acc message).
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      if (err?.code === "23505" && err?.constraint === "students_code_unique") {
        return res.status(400).json({ message: "Mã học viên đã tồn tại. Vui lòng sử dụng mã khác." });
      }
      throw err;
    }
  });

  app.put(api.students.update.path, async (req, res) => {
    try {
      const crmPerms = await getCrmPermissions(req);
      if (!crmPerms.canEdit) {
        return res.status(403).json({ message: "Bạn không có quyền chỉnh sửa khách hàng." });
      }
      // Fetch old data before update for diff
      const oldStudent = await storage.getStudent(req.params.id, req.allowedLocationIds, req.isSuperAdmin);
      const input = api.students.update.input.parse(req.body);
      const student = await storage.updateStudent(req.params.id, { ...input, updatedBy: (req.user as any).id }, req.allowedLocationIds, req.isSuperAdmin);
      if (oldStudent) {
        const userId = (req.user as any).id;
        const userName = await getActorName(userId);
        const { oldData, newData } = diffFields(oldStudent, student);
        if (Object.keys(oldData).length > 0) {
          await insertActivityLog({
            studentId: student.id,
            userId,
            userName,
            action: "update",
            oldData,
            newData,
          });
        }
      }
      res.json(student);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(403).json({ message: (err as any).message });
    }
  });

  app.delete(api.students.delete.path, async (req, res) => {
    try {
      const crmPerms = await getCrmPermissions(req);
      if (!crmPerms.canDelete) {
        return res.status(403).json({ message: "Bạn không có quyền xóa khách hàng." });
      }
      // Fetch old data before delete for log
      const oldStudent = await storage.getStudent(req.params.id, req.allowedLocationIds, req.isSuperAdmin);
      await storage.deleteStudent(req.params.id, req.allowedLocationIds, req.isSuperAdmin);
      if (oldStudent) {
        const userId = (req.user as any).id;
        const userName = await getActorName(userId);
        const { oldData, newData } = buildDeletedLogData(oldStudent);
        await insertActivityLog({
          studentId: null,
          userId,
          userName,
          action: "delete",
          oldData,
          newData,
        });
      }
      res.status(204).send();
    } catch (err) {
      res.status(403).json({ message: (err as any).message });
    }
  });

  // GET activity logs for customers
  app.get("/api/customers/activity-logs", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = parseInt(req.query.offset as string) || 0;
      const locationId = req.query.locationId as string | undefined;
      const action = req.query.action as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const whereClauses = [sql`1 = 1`];

      if (!req.isSuperAdmin) {
        if (locationId && !req.allowedLocationIds.includes(locationId)) {
          return res.json({ logs: [], total: 0 });
        }
        whereClauses.push(sql`EXISTS (
          SELECT 1
          FROM staff actor_staff
          JOIN staff_assignments actor_assignment ON actor_assignment.staff_id = actor_staff.id
          WHERE actor_staff.user_id = l.user_id
            AND actor_assignment.location_id = ANY(${req.allowedLocationIds}::uuid[])
        )`);
      }

      if (locationId) {
        whereClauses.push(sql`EXISTS (
          SELECT 1
          FROM staff actor_staff
          JOIN staff_assignments actor_assignment ON actor_assignment.staff_id = actor_staff.id
          WHERE actor_staff.user_id = l.user_id
            AND actor_assignment.location_id = ${locationId}
        )`);
      }

      if (action && ["create", "update", "delete"].includes(action)) {
        whereClauses.push(sql`l.action = ${action}`);
      }

      if (dateFrom) {
        whereClauses.push(sql`l.created_at >= ${dateFrom}::date`);
      }

      if (dateTo) {
        whereClauses.push(sql`l.created_at < (${dateTo}::date + INTERVAL '1 day')`);
      }

      const whereExpr = sql.join(whereClauses, sql` AND `);
      const rows = await db.execute(
        sql`SELECT
              l.id,
              l.student_id,
              s.full_name AS student_name,
              s.code AS student_code,
              l.user_id,
              l.user_name,
              l.action,
              l.old_data,
              l.new_data,
              l.created_at,
              COALESCE(actor_locations.location_ids, ARRAY[]::uuid[]) AS actor_location_ids,
              COALESCE(actor_locations.location_names, ARRAY[]::text[]) AS actor_location_names
            FROM customer_activity_logs l
            LEFT JOIN students s ON s.id = l.student_id
            LEFT JOIN LATERAL (
              SELECT
                ARRAY_AGG(DISTINCT loc.id) AS location_ids,
                ARRAY_AGG(DISTINCT loc.name) AS location_names
              FROM staff actor_staff
              JOIN staff_assignments actor_assignment ON actor_assignment.staff_id = actor_staff.id
              JOIN locations loc ON loc.id = actor_assignment.location_id
              WHERE actor_staff.user_id = l.user_id
            ) actor_locations ON TRUE
            WHERE ${whereExpr}
            ORDER BY l.created_at DESC
            LIMIT ${limit} OFFSET ${offset}`
      );
      const countRow = await db.execute(sql`
        SELECT COUNT(*) AS total
        FROM customer_activity_logs l
        WHERE ${whereExpr}
      `);
      const total = parseInt((countRow.rows[0] as any)?.total ?? "0");
      res.json({ logs: rows.rows, total });
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  // Student Comments
  app.get(api.studentComments.list.path, async (req, res) => {
    try {
      const comments = await storage.getStudentComments(req.params.id);
      res.json(comments);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.post(api.studentComments.create.path, async (req, res) => {
    try {
      const comment = await storage.createStudentComment({
        studentId: req.params.id,
        userId: (req.user as any).id,
        content: req.body.content,
      });
      res.status(201).json(comment);
    } catch (err) {
      res.status(400).json({ message: (err as any).message });
    }
  });

  // Student Classes (list of classes for a student)
  app.get(api.studentClasses.list.path, async (req, res) => {
    try {
      const classes = await storage.getStudentClasses(req.params.id);
      res.json(classes);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  // Security Test Endpoint
  app.get("/api/security-test", runSecurityTests);

  // CRM Config Routes
  app.get(api.crm.relationships.list.path, async (req, res) => {
    try {
      res.json(await storage.getCrmRelationships(req.allowedLocationIds, req.isSuperAdmin));
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.post(api.crm.relationships.create.path, async (req, res) => {
    try {
      const input = api.crm.relationships.create.input.parse(req.body);
      const data = await storage.createCrmRelationship(input);
      res.status(201).json(data);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put(api.crm.relationships.update.path, async (req, res) => {
    try {
      const input = api.crm.relationships.update.input.parse(req.body);
      const data = await storage.updateCrmRelationship(req.params.id, input);
      res.json(data);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete(api.crm.relationships.delete.path, async (req, res) => {
    await storage.deleteCrmRelationship(req.params.id);
    res.status(204).send();
  });

  app.get(api.crm.rejectReasons.list.path, async (req, res) => {
    try {
      res.json(await storage.getCrmRejectReasons(req.allowedLocationIds, req.isSuperAdmin));
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.post(api.crm.rejectReasons.create.path, async (req, res) => {
    try {
      const input = api.crm.rejectReasons.create.input.parse(req.body);
      const data = await storage.createCrmRejectReason(input);
      res.status(201).json(data);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put(api.crm.rejectReasons.update.path, async (req, res) => {
    try {
      const input = api.crm.rejectReasons.update.input.parse(req.body);
      const data = await storage.updateCrmRejectReason(req.params.id, input);
      res.json(data);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete(api.crm.rejectReasons.delete.path, async (req, res) => {
    await storage.deleteCrmRejectReason(req.params.id);
    res.status(204).send();
  });

  app.get(api.crm.customerSources.list.path, async (req, res) => {
    try {
      res.json(await storage.getCrmCustomerSources(req.allowedLocationIds, req.isSuperAdmin));
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.post(api.crm.customerSources.create.path, async (req, res) => {
    try {
      const input = api.crm.customerSources.create.input.parse(req.body);
      const data = await storage.createCrmCustomerSource(input);
      res.status(201).json(data);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put(api.crm.customerSources.update.path, async (req, res) => {
    try {
      const input = api.crm.customerSources.update.input.parse(req.body);
      const data = await storage.updateCrmCustomerSource(req.params.id, input);
      res.json(data);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete(api.crm.customerSources.delete.path, async (req, res) => {
    const id = req.params.id as string;
    await storage.deleteCrmCustomerSource(id);
    res.status(204).send();
  });

  app.post(api.students.importClassAssign.path, async (req, res) => {
    try {
      const items: { studentId: string; classCode: string; className?: string; locationId: string }[] = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.json({ success: true, assigned: 0 });
      }

      const userId = (req.user as any)?.id ?? null;

      const byCode = new Map<string, { studentIds: string[]; className?: string; locationId: string }>();
      for (const item of items) {
        if (!item.classCode) continue;
        if (!byCode.has(item.classCode)) {
          byCode.set(item.classCode, { studentIds: [], className: item.className, locationId: item.locationId });
        }
        byCode.get(item.classCode)!.studentIds.push(item.studentId);
      }

      let assigned = 0;
      const created: string[] = [];

      for (const [classCode, { studentIds, className, locationId }] of byCode) {
        let cls = await storage.findClassByCode(classCode);

        if (!cls) {
          if (!className) continue;
          cls = await storage.createMinimalClass({ classCode, name: className, locationId });
          created.push(cls.id);
        }

        await storage.addClassStudents(cls.id, studentIds, userId);
        assigned += studentIds.length;
      }

      return res.json({ success: true, assigned, classesCreated: created.length });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Student Fee Packages ─────────────────────────────────────────────────
  app.get("/api/students/:id/fee-packages", async (req, res) => {
    try {
      const studentId = req.params.id;

      // 1. Tổng đăng ký: SUM(quantity) from invoice_items grouped by packageId
      //    joined via invoices.studentId, filter packageId IS NOT NULL
      const registeredRows = await db
        .select({
          packageId: invoiceItems.packageId,
          packageName: invoiceItems.packageName,
          totalSessions: sql<number>`SUM(${invoiceItems.quantity})::int`,
        })
        .from(invoiceItems)
        .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
        .where(
          and(
            eq(invoices.studentId, studentId),
            isNotNull(invoiceItems.packageId)
          )
        )
        .groupBy(invoiceItems.packageId, invoiceItems.packageName);

      // 2. Đã xếp: COUNT(*) from student_sessions grouped by packageId
      const scheduledRows = await db
        .select({
          packageId: studentSessions.packageId,
          scheduledCount: sql<number>`COUNT(*)::int`,
        })
        .from(studentSessions)
        .where(
          and(
            eq(studentSessions.studentId, studentId),
            isNotNull(studentSessions.packageId)
          )
        )
        .groupBy(studentSessions.packageId);

      // 3. Đã học: COUNT sessions where attendance_status deducts fee
      const deductingRules = await db
        .select({ attendanceStatus: attendanceFeeRules.attendanceStatus })
        .from(attendanceFeeRules)
        .where(eq(attendanceFeeRules.deductsFee, true));

      const deductingStatuses = deductingRules.map((r) => r.attendanceStatus);

      const attendedRows = deductingStatuses.length > 0
        ? await db
            .select({
              packageId: studentSessions.packageId,
              attendedCount: sql<number>`COUNT(*)::int`,
            })
            .from(studentSessions)
            .where(
              and(
                eq(studentSessions.studentId, studentId),
                isNotNull(studentSessions.packageId),
                inArray(studentSessions.attendanceStatus, deductingStatuses)
              )
            )
            .groupBy(studentSessions.packageId)
        : [];

      // 4. Merge: join by packageId
      const scheduledMap = new Map(
        scheduledRows.map((r) => [r.packageId, r.scheduledCount])
      );
      const attendedMap = new Map(
        attendedRows.map((r) => [r.packageId, r.attendedCount])
      );

      const result = registeredRows.map((row) => {
        const total = row.totalSessions ?? 0;
        const scheduled = scheduledMap.get(row.packageId!) ?? 0;
        const attended = attendedMap.get(row.packageId!) ?? 0;
        const remaining = Math.max(0, total - scheduled - attended);
        const ratio = total > 0 ? scheduled / total : 0;
        return {
          packageId: row.packageId,
          name: row.packageName,
          totalSessions: total,
          scheduledSessions: scheduled,
          attendedSessions: attended,
          remainingSessions: remaining,
          ratio,
        };
      });

      res.json({ packages: result });
    } catch (err: any) {
      console.error("Fee packages error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải gói học phí" });
    }
  });

  // GET /api/students/:id/invoices – admin view of all invoices for a student
  app.get("/api/students/:id/invoices", async (req, res) => {
    try {
      const { id: studentId } = req.params;

      const invoiceRows = await db
        .select({
          id: invoices.id,
          code: invoices.code,
          type: invoices.type,
          category: invoices.category,
          description: invoices.description,
          grandTotal: invoices.grandTotal,
          paidAmount: invoices.paidAmount,
          remainingAmount: invoices.remainingAmount,
          status: invoices.status,
          dueDate: invoices.dueDate,
          createdAt: invoices.createdAt,
          studentName: students.fullName,
          className: classes.name,
          classCode: classes.classCode,
        })
        .from(invoices)
        .leftJoin(students, eq(invoices.studentId, students.id))
        .leftJoin(classes, eq(invoices.classId, classes.id))
        .where(eq(invoices.studentId, studentId))
        .orderBy(invoices.createdAt);

      const result: any[] = [];
      for (const inv of invoiceRows) {
        const schedules = await db
          .select()
          .from(invoicePaymentSchedule)
          .where(eq(invoicePaymentSchedule.invoiceId, inv.id))
          .orderBy(invoicePaymentSchedule.sortOrder);

        if (schedules.length > 0) {
          for (const sch of schedules) {
            result.push({
              id: sch.id,
              invoiceId: inv.id,
              title: inv.description || inv.className || inv.classCode || "Hoá đơn",
              code: sch.code || inv.code,
              label: sch.label,
              studentName: inv.studentName,
              type: inv.type,
              category: inv.category,
              amount: sch.amount,
              status: sch.status,
              dueDate: sch.dueDate,
              paidAt: sch.paidAt,
              createdAt: inv.createdAt,
              isSchedule: true,
            });
          }
        } else {
          result.push({
            id: inv.id,
            invoiceId: inv.id,
            title: inv.description || inv.className || inv.classCode || "Hoá đơn",
            code: inv.code,
            label: null,
            studentName: inv.studentName,
            type: inv.type,
            category: inv.category,
            amount: inv.grandTotal,
            status: inv.status,
            dueDate: inv.dueDate,
            paidAt: null,
            createdAt: inv.createdAt,
            isSchedule: false,
          });
        }
      }

      res.json({ invoices: result });
    } catch (err: any) {
      console.error("Student invoices error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải hoá đơn" });
    }
  });

  // GET /api/students/:id/fee-wallet – ví học phí: tổng tiền + lịch sử giao dịch bất biến
  app.get("/api/students/:id/fee-wallet", async (req, res) => {
    try {
      const { id: studentId } = req.params;
      const { getStudentWalletTransactions } = await import("../storage/wallet.storage");
      const rows = await getStudentWalletTransactions(studentId);

      let hocPhi = 0;
      let datCoc = 0;

      // rows từ DB đã sắp xếp mới nhất trước (desc createdAt)
      // Tính tổng theo thứ tự cũ → mới (reverse rows)
      for (const row of [...rows].reverse()) {
        const amount = parseFloat(row.amount ?? "0") || 0;
        const cat = (row.category ?? "").trim();
        if (row.type === "credit") {
          if (cat === "Học phí") hocPhi += amount;
          else if (cat === "Đặt cọc") datCoc += amount;
        } else {
          if (cat === "Học phí") hocPhi -= amount;
          else if (cat === "Đặt cọc") datCoc -= amount;
        }
      }

      // Hiển thị theo thứ tự mới nhất trước (rows đã desc), STT = tổng - idx (mới nhất = số lớn nhất)
      const total = rows.length;
      const transactions = rows.map((row, idx) => {
        const amount = parseFloat(row.amount ?? "0") || 0;
        const signed = row.type === "credit" ? amount : -amount;
        return {
          stt: total - idx,
          id: row.id,
          action: row.action,
          direction: row.type,
          className: row.className || "—",
          amount: signed,
          invoiceCode: row.invoiceCode || "—",
          invoiceDescription: row.invoiceDescription || "—",
          invoiceId: row.invoiceId || null,
          createdAt: row.createdAt,
          createdBy: row.createdByName || "—",
          category: row.category || "—",
        };
      });

      res.json({
        summary: { hocPhi, datCoc, total: hocPhi + datCoc },
        transactions,
      });
    } catch (err: any) {
      console.error("Fee wallet error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải ví học phí" });
    }
  });

  // GET /api/students/:id/score-entries – bảng điểm học viên (grade books + BTVN + bài kiểm tra)
  app.get("/api/students/:id/score-entries", async (req, res) => {
    try {
      const { id: studentId } = req.params;

      // 1. Published grade books where student is in the class
      const gradeBooksResult = await db.execute(sql`
        SELECT
          gb.id,
          gb.title,
          gb.class_id,
          gb.score_sheet_id,
          gb.created_at,
          c.name AS class_name,
          (
            SELECT json_agg(json_build_object(
              'categoryName', sc.name,
              'score', gbs.score
            ) ORDER BY sci.ord)
            FROM class_grade_book_scores gbs
            JOIN score_categories sc ON sc.id = gbs.category_id
            LEFT JOIN (
              SELECT category_id, score_sheet_id, "order" AS ord
              FROM score_sheet_items
            ) sci ON sci.category_id = gbs.category_id AND sci.score_sheet_id = gb.score_sheet_id
            WHERE gbs.grade_book_id = gb.id
              AND gbs.student_id = ${studentId}
          ) AS scores
        FROM class_grade_books gb
        JOIN classes c ON c.id = gb.class_id
        JOIN student_classes sc2 ON sc2.class_id = gb.class_id AND sc2.student_id = ${studentId}
        WHERE gb.published = TRUE
        ORDER BY gb.created_at DESC
      `);

      const gradeBookEntries = gradeBooksResult.rows.map((row: any) => {
        const scores: Array<{ categoryName: string; score: string | null }> = row.scores ?? [];
        const hasScores = scores.some(s => s.score !== null);
        const finalScore = hasScores
          ? scores.filter(s => s.score !== null).map(s => `${s.categoryName}: ${s.score}`).join(" / ")
          : null;
        return {
          id: row.id,
          type: "Bảng điểm" as const,
          title: row.title,
          className: row.class_name,
          classId: row.class_id,
          finalScore,
          scores,
          refId: row.id,
          createdAt: row.created_at,
        };
      });

      // 2. BTVN and bài kiểm tra where student has a score
      const contentResult = await db.execute(sql`
        SELECT
          ssc.id,
          COALESCE(ssc.custom_title, sc.title) AS title,
          sc.content_type,
          ssc.score,
          ssc.grading_comment,
          ssc.created_at,
          c.name AS class_name,
          c.id AS class_id
        FROM student_session_contents ssc
        JOIN session_contents sc ON sc.id = ssc.session_content_id
        JOIN class_sessions cs ON cs.id = sc.class_session_id
        JOIN classes c ON c.id = cs.class_id
        WHERE ssc.student_id = ${studentId}
          AND ssc.score IS NOT NULL
          AND sc.content_type IN ('Bài tập về nhà', 'Bài kiểm tra')
        ORDER BY ssc.created_at DESC
      `);

      const contentEntries = contentResult.rows.map((row: any) => ({
        id: row.id,
        type: (row.content_type === "Bài tập về nhà" ? "BTVN" : "Bài kiểm tra") as "BTVN" | "Bài kiểm tra",
        title: row.title || "—",
        className: row.class_name,
        classId: row.class_id,
        finalScore: row.score,
        scores: [],
        refId: row.id,
        gradingComment: row.grading_comment,
        createdAt: row.created_at,
      }));

      const all = [...gradeBookEntries, ...contentEntries].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      res.json(all);
    } catch (err: any) {
      console.error("Score entries error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải bảng điểm" });
    }
  });

  // GET /api/students/:id/session-reviews – nhận xét tổng hợp từng buổi học
  app.get("/api/students/:id/session-reviews", async (req, res) => {
    try {
      const { id: studentId } = req.params;

      const result = await db.execute(sql`
        SELECT
          ss.id,
          s.full_name AS student_name,
          c.name AS class_name,
          cs.session_index,
          cs.session_date,
          st.name AS shift_name,
          st.start_time,
          st.end_time,
          ss.review_data,
          ss.review_published
        FROM student_sessions ss
        JOIN students s ON s.id = ss.student_id
        JOIN classes c ON c.id = ss.class_id
        JOIN class_sessions cs ON cs.id = ss.class_session_id
        LEFT JOIN shift_templates st ON st.id = cs.shift_template_id
        WHERE ss.student_id = ${studentId}
          AND ss.review_data IS NOT NULL
          AND jsonb_typeof(ss.review_data) = 'array'
          AND jsonb_array_length(ss.review_data) > 0
          AND ss.review_published = TRUE
        ORDER BY cs.session_date DESC, cs.session_index DESC
      `);

      const rows = result.rows.map((row: any) => ({
        id: row.id,
        studentName: row.student_name,
        className: row.class_name,
        sessionIndex: row.session_index,
        sessionDate: row.session_date,
        shiftName: row.shift_name || "—",
        startTime: row.start_time || null,
        endTime: row.end_time || null,
        reviewData: row.review_data || [],
        reviewPublished: row.review_published,
      }));

      res.json(rows);
    } catch (err: any) {
      console.error("Session reviews error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải nhận xét" });
    }
  });

  // GET /api/learning-overview/session-reviews – tất cả nhận xét đã công bố (admin view)
  app.get("/api/learning-overview/session-reviews", async (req, res) => {
    try {
      const { dateFrom, dateTo, search, page = "1", pageSize = "50" } = req.query as {
        dateFrom?: string; dateTo?: string; search?: string; page?: string; pageSize?: string;
      };

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const size = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 50));
      const offset = (pageNum - 1) * size;

      const whereClauses = [
        sql`ss.review_data IS NOT NULL`,
        sql`jsonb_typeof(ss.review_data) = 'array'`,
        sql`jsonb_array_length(ss.review_data) > 0`,
        sql`ss.review_published = TRUE`,
      ];

      if (dateFrom) whereClauses.push(sql`cs.session_date >= ${dateFrom}`);
      if (dateTo) whereClauses.push(sql`cs.session_date <= ${dateTo}`);
      if (search) {
        const like = `%${search}%`;
        whereClauses.push(sql`(s.full_name ILIKE ${like} OR c.name ILIKE ${like})`);
      }

      const whereExpr = sql.join(whereClauses, sql` AND `);

      const countResult = await db.execute(sql`
        SELECT COUNT(*) AS total
        FROM student_sessions ss
        JOIN students s ON s.id = ss.student_id
        JOIN classes c ON c.id = ss.class_id
        JOIN class_sessions cs ON cs.id = ss.class_session_id
        LEFT JOIN shift_templates st ON st.id = cs.shift_template_id
        WHERE ${whereExpr}
      `);
      const total = parseInt((countResult.rows[0] as any)?.total ?? "0", 10);

      const result = await db.execute(sql`
        SELECT
          ss.id,
          s.full_name AS student_name,
          c.name AS class_name,
          cs.session_index,
          cs.session_date,
          st.name AS shift_name,
          st.start_time,
          st.end_time,
          ss.review_data
        FROM student_sessions ss
        JOIN students s ON s.id = ss.student_id
        JOIN classes c ON c.id = ss.class_id
        JOIN class_sessions cs ON cs.id = ss.class_session_id
        LEFT JOIN shift_templates st ON st.id = cs.shift_template_id
        WHERE ${whereExpr}
        ORDER BY cs.session_date DESC, cs.session_index DESC
        LIMIT ${size} OFFSET ${offset}
      `);

      const rows = result.rows.map((row: any) => ({
        id: row.id,
        studentName: row.student_name,
        className: row.class_name,
        sessionIndex: row.session_index,
        sessionDate: row.session_date,
        shiftName: row.shift_name || "—",
        startTime: row.start_time || null,
        endTime: row.end_time || null,
        reviewData: row.review_data || [],
      }));

      res.json({ rows, total, page: pageNum, pageSize: size });
    } catch (err: any) {
      console.error("All session reviews error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải nhận xét" });
    }
  });

}
