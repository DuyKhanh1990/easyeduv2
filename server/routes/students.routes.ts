import type { Express } from "express";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { runSecurityTests } from "../middleware/security-test";
import { cacheGet, cacheSet, cacheInvalidate } from "../lib/simple-cache";
import { db } from "../db";
import { invoices, invoiceItems, studentSessions, invoicePaymentSchedule, students, classes, attendanceFeeRules, users, staff, staffAssignments, locations, classGradeBooks, classGradeBookScores, scoreCategories, scoreSheetItems, sessionContents, studentSessionContents, classSessions, studentRelationshipHistory, crmPipelineGroups, crmRelationships, crmRejectReasons, crmCustomerSources, crmSchools, crmCustomFields, crmRequiredFields } from "@shared/schema";
import { eq, and, isNotNull, sql, inArray, desc, gte, lte, ne } from "drizzle-orm";
import { getStudentLearningStatusSummary, getCustomerLearningStatusSummary, getCustomerSummary, getNewCustomersSummary, getStudentsBySource, getStudentsByRelationship, getStudentsByLocation, getStudentsByStaff, getStudentsLearningStatuses, getMonthlyStudentCounts } from "../storage/student.storage";
import { createCrmConfigAuditLog, getCrmConfigAuditLogs } from "../storage/crm-config-audit.storage";

const CRM_RESOURCE = "/customers";
const CRM_CONFIG_BASE = "/customers/crm-config";

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

// Check permission for a CRM config sub-tab (e.g. "relationships", "reject-reasons")
// Allows access if user has the sub-resource permission OR the base /customers permission
async function getCrmConfigPermissions(req: any, tabValue: string) {
  if (req.isSuperAdmin) {
    return { canCreate: true, canEdit: true, canDelete: true };
  }
  const roleIds = req.roleIds || [];
  const subResource = `${CRM_CONFIG_BASE}#${tabValue}`;
  const [subPerms, basePerms] = await Promise.all([
    storage.getEffectivePermissions(roleIds, subResource),
    storage.getEffectivePermissions(roleIds, CRM_RESOURCE),
  ]);
  return {
    canCreate: subPerms.canCreate || basePerms.canCreate,
    canEdit:   subPerms.canEdit   || basePerms.canEdit,
    canDelete: subPerms.canDelete || basePerms.canDelete,
  };
}

async function recordCrmConfigAudit(req: any, entityType: string, action: "created" | "updated" | "deleted", entityId: string | null, entityName: string | null, oldContent: unknown, newContent: unknown) {
  try {
    await createCrmConfigAuditLog({
      userId: (req.user as any)?.id ?? null,
      entityType,
      entityId,
      entityName,
      action,
      oldContent,
      newContent,
    });
  } catch (error) {
    console.error("[crm-config-audit] failed to record:", error);
  }
}

async function getCrmConfigRecord(table: any, id: string | string[]) {
  const recordId = Array.isArray(id) ? id[0] : id;
  const [row] = await db.select().from(table).where(eq(table.id, recordId)).limit(1);
  return row ?? null;
}

async function getNextCustomerCode(type: string): Promise<string> {
  const prefix = type === "Phụ huynh" ? "PH-" : "HV-";
  const [studentCodes, linkedAccountNames] = await Promise.all([
    db.select({ code: students.code })
      .from(students)
      .where(sql`UPPER(${students.code}) LIKE ${`${prefix}%`}`),
    db.select({ code: users.username })
      .from(users)
      .where(sql`
        UPPER(${users.username}) LIKE ${`${prefix}%`}
        AND (
          LOWER(${users.username}) = 'admin'
          OR EXISTS (SELECT 1 FROM ${staff} WHERE ${staff.userId} = ${users.id})
          OR EXISTS (SELECT 1 FROM ${students} WHERE ${students.userId} = ${users.id})
        )
      `),
  ]);
  const rows = [...studentCodes, ...linkedAccountNames];

  const maxNum = rows.reduce((max, row) => {
    const match = row.code?.trim().toUpperCase().match(new RegExp(`^${prefix}(\\d+)$`));
    const num = match ? parseInt(match[1], 10) : 0;
    return Number.isFinite(num) && num > max ? num : max;
  }, 0);

  return `${prefix}${(maxNum + 1).toString().padStart(2, "0")}`;
}

export function registerStudentsRoutes(app: Express): void {
  // Students
  app.get(api.students.list.path, async (req, res) => {
    try {
      // Lightweight mode for dropdowns — accessible to any authenticated staff with location access.
      // This is used by classes, invoices, schedule, attendance etc. to search for students
      // without requiring the full CRM (/customers) permission.
      if (req.query.minimal === "true") {
        // Non-superadmin must have at least one allowed location
        if (!req.isSuperAdmin && (!req.allowedLocationIds || req.allowedLocationIds.length === 0)) {
          return res.status(403).json({ message: "Bạn không có quyền truy cập." });
        }
        const limit = parseInt(req.query.limit as string) || 200;
        const searchTerm = req.query.searchTerm as string | undefined;
        const result = await storage.getStudentsMinimal({
          allowedLocationIds: req.allowedLocationIds,
          isSuperAdmin: req.isSuperAdmin,
          locationId: req.query.locationId as string | undefined,
          limit,
          searchTerm,
        });
        return res.json({ students: result, total: result.length });
      }

      const crmPerms = await getCrmPermissions(req);

      // No view permission at all → forbidden (full list requires CRM permission)
      if (!crmPerms.canView && !crmPerms.canViewAll) {
        return res.status(403).json({ message: "Bạn không có quyền xem danh sách khách hàng." });
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
        pipelineGroupId: req.query.pipelineGroupId as string | undefined,
        parentRelationshipId: req.query.parentRelationshipId as string | undefined,
        sources: parseArray(req.query.sources),
        rejectReasons: parseArray(req.query.rejectReasons),
        salesIds: parseArray(req.query.salesIds),
        managerIds: parseArray(req.query.managerIds),
        teacherIds: parseArray(req.query.teacherIds),
        classIds: parseArray(req.query.classIds),
        schoolIds: parseArray(req.query.schoolIds),
        birthYear: req.query.birthYear as string | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        updatedFrom: req.query.updatedFrom as string | undefined,
        updatedTo: req.query.updatedTo as string | undefined,
        accountStatuses: parseArray(req.query.accountStatuses),
        learningStatuses: parseArray(req.query.learningStatuses),
        birthdayFrom: req.query.birthdayFrom as string | undefined,
        birthdayTo: req.query.birthdayTo as string | undefined,
        classTabId: req.query.classTabId as string | undefined,
        classTab: req.query.classTab === "unassigned" ? "unassigned" : undefined,
        viewScope,
        viewerStaffId: req.staffId ?? undefined,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.get("/api/students/class-tabs", async (req, res) => {
    try {
      const crmPerms = await getCrmPermissions(req);
      if (!crmPerms.canView && !crmPerms.canViewAll) {
        return res.status(403).json({ message: "Bạn không có quyền xem danh sách khách hàng." });
      }
      const viewScope = crmPerms.canViewAll ? "all" : "own";
      const result = await storage.getStudentClassTabs({
        allowedLocationIds: req.allowedLocationIds,
        isSuperAdmin: req.isSuperAdmin,
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

  // ── GET /api/students/check-duplicates ─────────────────────────────────────
  // Kiểm tra trùng lặp: code/username (hard block), phone/email (soft warning)
  // Query params: code, username, phone, email, excludeId (khi edit)
  app.get("/api/students/check-duplicates", async (req, res) => {
    try {
      const { code, username, phone, email, excludeId } = req.query as Record<string, string>;

      const [codeConflict, usernameConflict, phoneConflicts, emailConflicts] = await Promise.all([
        // Mã học viên - hard block
        code
          ? db.select({ id: students.id, fullName: students.fullName, code: students.code })
              .from(students)
              .where(
                excludeId
                  ? and(sql`LOWER(${students.code}) = LOWER(${code})`, sql`${students.id} != ${excludeId}`)
                  : sql`LOWER(${students.code}) = LOWER(${code})`
              )
              .limit(1)
          : Promise.resolve([]),

        // Tài khoản (username trong users) - hard block
        username
          ? db.select({ id: users.id, username: users.username })
              .from(users)
              .where(and(
                sql`LOWER(${users.username}) = LOWER(${username})`,
                sql`(
                  LOWER(${users.username}) = 'admin'
                  OR EXISTS (SELECT 1 FROM ${staff} WHERE ${staff.userId} = ${users.id})
                  OR EXISTS (SELECT 1 FROM ${students} WHERE ${students.userId} = ${users.id})
                )`,
                excludeId
                  ? sql`${users.id} IS DISTINCT FROM (
                      SELECT ${students.userId}
                      FROM ${students}
                      WHERE ${students.id} = ${excludeId}
                      LIMIT 1
                    )`
                  : undefined,
              ))
              .limit(1)
          : Promise.resolve([]),

        // Số điện thoại - soft warning (trả về danh sách trùng)
        phone
          ? db.select({ id: students.id, fullName: students.fullName, code: students.code, phone: students.phone })
              .from(students)
              .where(
                excludeId
                  ? and(eq(students.phone, phone), sql`${students.id} != ${excludeId}`)
                  : eq(students.phone, phone)
              )
              .limit(5)
          : Promise.resolve([]),

        // Email - soft warning
        email
          ? db.select({ id: students.id, fullName: students.fullName, code: students.code, email: students.email })
              .from(students)
              .where(
                excludeId
                  ? and(sql`LOWER(${students.email}) = LOWER(${email})`, sql`${students.id} != ${excludeId}`)
                  : sql`LOWER(${students.email}) = LOWER(${email})`
              )
              .limit(5)
          : Promise.resolve([]),
      ]);

      res.json({
        codeConflict: codeConflict.length > 0 ? codeConflict[0] : null,
        usernameConflict: usernameConflict.length > 0 ? usernameConflict[0] : null,
        phoneConflicts,
        emailConflicts,
      });
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

  // ── GET /api/students/customer-learning-status-summary ────────────────────
  // Customer-page cards use class enrollments, not individual session activity.
  app.get("/api/students/customer-learning-status-summary", async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const isSuperAdmin = (req as any).isSuperAdmin ?? false;
      const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];
      const locationId = typeof req.query.locationId === "string" ? req.query.locationId : undefined;

      const summary = await getCustomerLearningStatusSummary({
        isSuperAdmin,
        allowedLocationIds,
        locationId,
      });

      res.json(summary);
    } catch (err: any) {
      console.error("Customer learning status summary error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tính trạng thái học viên" });
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

  // ── GET /api/students/monthly-counts ─────────────────────────────────────
  // Trả về số lượng học viên đăng ký mới theo từng tháng (mặc định 6 tháng).
  // Mỗi tháng có thêm growthPct so với tháng liền kề trước đó.
  app.get("/api/students/monthly-counts", async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const isSuperAdmin = (req as any).isSuperAdmin ?? false;
      const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];
      const locationId = typeof req.query.locationId === "string" ? req.query.locationId : undefined;
      const months = typeof req.query.months === "string" ? parseInt(req.query.months, 10) : 6;
      const data = await getMonthlyStudentCounts({ isSuperAdmin, allowedLocationIds, locationId, months });
      res.json(data);
    } catch (err: any) {
      console.error("Monthly student counts error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải dữ liệu theo tháng" });
    }
  });

  // ── GET /api/students/dashboard-summary ──────────────────────────────────
  // Gộp tất cả summary queries thành 1 request để giảm DB round trips
  app.get("/api/students/dashboard-summary", async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const isSuperAdmin = (req as any).isSuperAdmin ?? false;
      const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];
      const locationId = typeof req.query.locationId === "string" ? req.query.locationId : undefined;
      const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined;
      const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : undefined;
      const months = typeof req.query.months === "string" ? parseInt(req.query.months, 10) : 1;
      const monthlyMonths = 6;

      const locKey = isSuperAdmin ? "super" : allowedLocationIds.slice().sort().join(",");
      const cacheKey = `students:dashboard-summary:${locKey}:${locationId ?? ""}:${dateFrom ?? ""}:${dateTo ?? ""}:${months}`;
      const cached = cacheGet<any>(cacheKey);
      if (cached) return res.json(cached);

      const [customerSummary, newCustomers, byLocation, byRelationship] = await Promise.all([
        getCustomerSummary({ isSuperAdmin, allowedLocationIds, locationId }),
        getNewCustomersSummary({ isSuperAdmin, allowedLocationIds, locationId }),
        getStudentsByLocation({ isSuperAdmin, allowedLocationIds, locationId, months, dateFrom, dateTo }),
        getStudentsByRelationship({ isSuperAdmin, allowedLocationIds, locationId, months, dateFrom, dateTo }),
      ]);

      const [learningStatus, bySource, byStaff, monthlyCounts] = await Promise.all([
        getStudentLearningStatusSummary({ isSuperAdmin, allowedLocationIds, locationId, dateFrom, dateTo }),
        getStudentsBySource({ isSuperAdmin, allowedLocationIds, locationId, months, dateFrom, dateTo }),
        getStudentsByStaff({ isSuperAdmin, allowedLocationIds, locationId, months, dateFrom, dateTo }),
        getMonthlyStudentCounts({ isSuperAdmin, allowedLocationIds, locationId, months: monthlyMonths }),
      ]);

      const result = { customerSummary, learningStatus, newCustomers, bySource, byRelationship, byLocation, byStaff, monthlyCounts };
      cacheSet(cacheKey, result, 5 * 60_000);
      res.json(result);
    } catch (err: any) {
      console.error("Dashboard summary error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải dashboard summary" });
    }
  });

  // ── GET /api/students/conversion-report ──────────────────────────────────
  app.get("/api/students/conversion-report", async (req, res) => {
    try {
      const crmPerms = await getCrmPermissions(req);
      if (!crmPerms.canView && !crmPerms.canViewAll) {
        return res.status(403).json({ message: "Bạn không có quyền xem báo cáo này." });
      }
      const isSuperAdmin = (req as any).isSuperAdmin ?? false;
      const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];

      const dateFrom = (req.query.dateFrom as string) || "";
      const dateTo = (req.query.dateTo as string) || "";
      const locationId = req.query.locationId as string | undefined;
      const search = req.query.search as string | undefined;
      const salesId = req.query.salesId as string | undefined;
      const managerId = req.query.managerId as string | undefined;

      // Build WHERE conditions — always start with 1=1 so we can safely join
      const whereClauses = [sql`1 = 1`];

      if (dateFrom) {
        whereClauses.push(sql`srh.changed_at >= ${dateFrom}::date`);
      }
      if (dateTo) {
        whereClauses.push(sql`srh.changed_at < (${dateTo}::date + INTERVAL '1 day')`);
      }
      if (locationId && locationId !== "all") {
        whereClauses.push(sql`s.location_id = ${locationId}::uuid`);
      }
      if (!isSuperAdmin && allowedLocationIds.length > 0) {
        whereClauses.push(sql`s.location_id = ANY(ARRAY[${sql.raw(allowedLocationIds.map(id => `'${id}'`).join(','))}]::uuid[])`);
      }
      if (search) {
        const like = `%${search}%`;
        whereClauses.push(sql`(s.full_name ILIKE ${like} OR s.code ILIKE ${like})`);
      }
      if (salesId && salesId !== "all") {
        whereClauses.push(sql`s.sales_by @> ARRAY[${salesId}]::uuid[]`);
      }
      if (managerId && managerId !== "all") {
        whereClauses.push(sql`s.managed_by @> ARRAY[${managerId}]::uuid[]`);
      }

      const whereExpr = sql.join(whereClauses, sql` AND `);

      const rows = await db.execute(sql`
        SELECT
          srh.from_relationship_name,
          srh.to_relationship_name,
          srh.student_id,
          s.code       AS student_code,
          s.full_name  AS student_name
        FROM student_relationship_history srh
        JOIN students s ON srh.student_id = s.id
        WHERE ${whereExpr}
        ORDER BY srh.to_relationship_name, srh.from_relationship_name, s.code
      `);

      // Group in JS by toRelationshipName, then by (from -> to) pair
      const groupMap = new Map<string, Map<string, { students: { id: string; code: string; fullName: string }[] }>>();
      const allStudentIds = new Set<string>();
      const allStudents: { id: string; code: string; fullName: string }[] = [];

      for (const row of rows.rows as any[]) {
        const toRel: string = row.to_relationship_name ?? "Không xác định";
        const fromRel: string | null = row.from_relationship_name ?? null;
        const transKey = fromRel ?? "__new__";

        if (!groupMap.has(toRel)) groupMap.set(toRel, new Map());
        const transMap = groupMap.get(toRel)!;
        if (!transMap.has(transKey)) transMap.set(transKey, { students: [] });

        const student = { id: row.student_id, code: row.student_code ?? "", fullName: row.student_name ?? "" };
        // Deduplicate within each transition
        const existing = transMap.get(transKey)!.students;
        if (!existing.find(s => s.id === student.id)) {
          existing.push(student);
        }

        // Track all unique students
        if (!allStudentIds.has(student.id)) {
          allStudentIds.add(student.id);
          allStudents.push(student);
        }
      }

      const total = allStudentIds.size;

      const groups = Array.from(groupMap.entries()).map(([toRel, transMap]) => {
        const transitions = Array.from(transMap.entries()).map(([fromKey, data]) => ({
          fromRelationshipName: fromKey === "__new__" ? null : fromKey,
          count: data.students.length,
          students: data.students,
        }));
        const totalCount = new Set(transitions.flatMap(t => t.students.map(s => s.id))).size;
        const pct = total > 0 ? (totalCount / total) * 100 : 0;
        return { toRelationshipName: toRel, totalCount, pct, transitions };
      });

      // Sort groups by totalCount desc
      groups.sort((a, b) => b.totalCount - a.totalCount);

      res.json({ total, allStudents, groups });
    } catch (err: any) {
      console.error("Conversion report error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải báo cáo chuyển đổi" });
    }
  });

  // ── GET /api/students/new-students-report ────────────────────────────────
  app.get("/api/students/new-students-report", async (req, res) => {
    try {
      const crmPerms = await getCrmPermissions(req);
      if (!crmPerms.canView && !crmPerms.canViewAll) {
        return res.status(403).json({ message: "Bạn không có quyền xem danh sách khách hàng." });
      }
      const viewScope = crmPerms.canViewAll ? "all" : "own";
      const parseArray = (val: any) => {
        if (!val) return undefined;
        return Array.isArray(val) ? val : [val];
      };
      const result = await storage.getStudents({
        allowedLocationIds: req.allowedLocationIds,
        isSuperAdmin: req.isSuperAdmin,
        locationId: req.query.locationId as string | undefined,
        limit: 2000,
        offset: 0,
        searchTerm: req.query.search as string | undefined,
        pipelineStage: req.query.relationshipName as string | undefined,
        salesIds: parseArray(req.query.salesIds),
        managerIds: parseArray(req.query.managerIds),
        startDate: req.query.dateFrom as string | undefined,
        endDate: req.query.dateTo as string | undefined,
        viewScope,
        viewerStaffId: req.staffId ?? undefined,
      });

      const allParentIds = [...new Set(result.students.flatMap((s: any) => s.parentIds ?? []))] as string[];
      const parentMap = new Map<string, { id: string; code: string | null; fullName: string | null }>();
      if (allParentIds.length > 0) {
        const parents = await db
          .select({ id: students.id, code: students.code, fullName: students.fullName })
          .from(students)
          .where(inArray(students.id, allParentIds));
        parents.forEach(p => parentMap.set(p.id, p));
      }

      const enriched = result.students.map((s: any) => ({
        id: s.id,
        code: s.code,
        fullName: s.fullName,
        type: s.type,
        location: s.location ? { name: s.location.name } : null,
        relationshipList: (s.relationshipList || []).map((r: any) => r.name ?? r),
        sourceList: s.sourceList ?? [],
        parents: (s.parentIds ?? []).map((id: string) => parentMap.get(id)).filter(Boolean),
        teacherList: (s.teacherList || []).map((t: any) => ({ code: t.code, fullName: t.fullName })),
        salesByList: (s.salesByList || []).map((t: any) => ({ code: t.code, fullName: t.fullName })),
        managedByList: (s.managedByList || []).map((t: any) => ({ code: t.code, fullName: t.fullName })),
        classDetails: (s.classDetails ?? []).map((c: any) => ({
          className: c.className,
          startDate: c.startDate,
          endDate: c.endDate,
          totalSessions: c.totalSessions,
          attendedSessions: c.attendedSessions,
          remainingSessions: c.remainingSessions,
        })),
        createdAt: s.createdAt,
        socialLink: s.socialLink ?? null,
      }));

      res.json({ data: enriched, total: result.total });
    } catch (err: any) {
      console.error("New students report error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải báo cáo học viên mới" });
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

  // ── Batch star balances (must be before :id route) ────────────────────────
  app.get("/api/students/star-balances", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const ids = ((req.query.ids as string) || "").split(",").map(s => s.trim()).filter(Boolean);
      if (ids.length === 0) return res.json({});

      const idList = sql.raw(ids.map(id => `'${id}'`).join(","));
      const earnedRows = await db.execute(sql`
        SELECT ss.student_id::text,
               COALESCE(SUM((rating_val)::numeric), 0)::int AS earned
        FROM student_sessions ss,
             jsonb_each(ss.review_data) AS t(tk, td),
             jsonb_each(td->'criteriaRatings') AS r(ck, rating_val)
        WHERE ss.student_id = ANY(ARRAY[${idList}]::uuid[])
          AND ss.review_data IS NOT NULL
          AND jsonb_typeof(ss.review_data) = 'object'
          AND (rating_val)::text ~ '^[0-9]+(\.[0-9]+)?$'
        GROUP BY ss.student_id
      `);
      const spentRows = await db.execute(sql`
        SELECT student_id::text, COALESCE(SUM(ABS(delta)), 0)::int AS spent
        FROM student_star_transactions
        WHERE student_id = ANY(ARRAY[${idList}]::uuid[]) AND delta < 0
        GROUP BY student_id
      `);

      const earnedMap: Record<string, number> = {};
      for (const r of earnedRows.rows as any[]) earnedMap[r.student_id] = Number(r.earned);
      const spentMap: Record<string, number> = {};
      for (const r of spentRows.rows as any[]) spentMap[r.student_id] = Number(r.spent);

      const result: Record<string, number> = {};
      for (const id of ids) {
        const available = Math.max(0, (earnedMap[id] ?? 0) - (spentMap[id] ?? 0));
        if (available > 0) result[id] = available;
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
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
      if (err?.code === "23505" && err?.constraint === "users_username_key") {
        return res.status(400).json({ message: "Tài khoản đã tồn tại. Vui lòng sử dụng tài khoản khác." });
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
      // Sync tên mới lên Tinode nếu fullName thay đổi (fire-and-forget)
      if (input.fullName && student.userId) {
        import("../lib/tinode.service").then(({ syncUserDisplayNameByUserId }) =>
          syncUserDisplayNameByUserId(student.userId, input.fullName).catch(() => {})
        ).catch(() => {});
      }
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      if ((err as any)?.code === "23505") {
        const constraint = (err as any)?.constraint;
        if (constraint === "students_code_unique") {
          return res.status(400).json({ message: "Mã học viên đã tồn tại. Vui lòng sử dụng mã khác." });
        }
        if (constraint === "users_username_key") {
          return res.status(400).json({ message: "Tài khoản đã tồn tại. Vui lòng sử dụng tài khoản khác." });
        }
      }
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
      if ((err as any)?.code === "STUDENT_HAS_RELATED_RECORDS") {
        return res.status(409).json({
          code: "STUDENT_HAS_RELATED_RECORDS",
          message: (err as any).message,
          classes: (err as any).classes ?? [],
          invoices: (err as any).invoices ?? [],
        });
      }
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

  // Student Classes Summary (lightweight, paginated — for overview tab)
  app.get("/api/students/:id/classes/summary", async (req, res) => {
    try {
      const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 8));
      const { getStudentClassesSummary } = await import("../storage/student.storage");
      const data = await getStudentClassesSummary(req.params.id, page, limit);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  // Student Classes (list of classes for a student)
  app.get(api.studentClasses.list.path, async (req, res) => {
    try {
      const data = await storage.getStudentClasses(req.params.id);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  // Paginated sessions for a single class — server-side pagination
  // GET /api/students/:id/classes/:classId/sessions?page=1&limit=20
  app.get("/api/students/:id/classes/:classId/sessions", async (req, res) => {
    try {
      const page  = Math.max(1, parseInt((req.query.page  as string) || "1"));
      const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "20")));
      const data = await storage.getStudentClassSessions({
        studentId: req.params.id,
        classId:   req.params.classId,
        page,
        limit,
      });
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  // Security Test Endpoint
  app.get("/api/security-test", runSecurityTests);

  // CRM Pipeline Groups Routes
  app.get(api.crm.pipelineGroups.list.path, async (req, res) => {
    try {
      const cacheKey = "crm:pipelineGroups";
      const cached = cacheGet<any[]>(cacheKey);
      if (cached) return res.json(cached);
      const data = await storage.getCrmPipelineGroups();
      cacheSet(cacheKey, data);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.post(api.crm.pipelineGroups.create.path, async (req, res) => {
    try {
      const perms = await getCrmConfigPermissions(req, "relationships");
      if (!perms.canCreate) return res.status(403).json({ message: "Bạn không có quyền thêm nhóm pipeline." });
      const input = api.crm.pipelineGroups.create.input.parse(req.body);
      const data = await storage.createCrmPipelineGroup(input);
      await recordCrmConfigAudit(req, "pipeline-group", "created", data.id, data.name, null, data);
      cacheInvalidate("crm:pipelineGroups");
      res.status(201).json(data);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put(api.crm.pipelineGroups.update.path, async (req, res) => {
    try {
      const perms = await getCrmConfigPermissions(req, "relationships");
      if (!perms.canEdit) return res.status(403).json({ message: "Bạn không có quyền chỉnh sửa nhóm pipeline." });
      const input = api.crm.pipelineGroups.update.input.parse(req.body);
      const before = await getCrmConfigRecord(crmPipelineGroups, req.params.id);
      const data = await storage.updateCrmPipelineGroup(req.params.id, input);
      await recordCrmConfigAudit(req, "pipeline-group", "updated", data.id, data.name, before, data);
      cacheInvalidate("crm:pipelineGroups");
      res.json(data);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete(api.crm.pipelineGroups.delete.path, async (req, res) => {
    try {
      const perms = await getCrmConfigPermissions(req, "relationships");
      if (!perms.canDelete) return res.status(403).json({ message: "Bạn không có quyền xóa nhóm pipeline." });
      const before = await getCrmConfigRecord(crmPipelineGroups, req.params.id);
      await storage.deleteCrmPipelineGroup(req.params.id);
      await recordCrmConfigAudit(req, "pipeline-group", "deleted", req.params.id, before?.name ?? null, before, null);
      cacheInvalidate("crm:pipelineGroups");
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.get("/api/crm/config-history", async (req, res) => {
    try {
      const perms = await getCrmPermissions(req);
      if (!perms.canView && !perms.canViewAll && !perms.canCreate && !perms.canEdit && !perms.canDelete) {
        return res.status(403).json({ message: "Bạn không có quyền xem lịch sử cấu hình CRM." });
      }
      const query = req.query as Record<string, string>;
      const action = ["created", "updated", "deleted"].includes(query.action)
        ? query.action as "created" | "updated" | "deleted"
        : undefined;
      const result = await getCrmConfigAuditLogs({
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        entityType: query.entityType,
        action,
        limit: parseInt(query.limit || "100", 10) || 100,
        offset: parseInt(query.offset || "0", 10) || 0,
      });
      res.json({
        total: result.total,
        events: result.events.map(event => ({
          id: event.id,
          entity_type: event.entityType,
          action: event.action,
          old_content: event.oldContent,
          new_content: event.newContent,
          ev_time: event.createdAt,
          user_name: event.userName,
        })),
      });
    } catch (error: any) {
      console.error("[crm-config-history] error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // CRM Config Routes
  app.get(api.crm.relationships.list.path, async (req, res) => {
    try {
      const data = await storage.getCrmRelationships(req.allowedLocationIds, req.isSuperAdmin);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.post(api.crm.relationships.create.path, async (req, res) => {
    try {
      const perms = await getCrmConfigPermissions(req, "relationships");
      if (!perms.canCreate) return res.status(403).json({ message: "Bạn không có quyền thêm mối quan hệ." });
      const input = api.crm.relationships.create.input.parse(req.body);
      const data = await storage.createCrmRelationship(input);
      await recordCrmConfigAudit(req, "relationship", "created", data.id, data.name, null, data);
      cacheInvalidate("crm:relationships");
      res.status(201).json(data);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      if ((err as any).statusCode) return res.status((err as any).statusCode).json({ message: (err as any).message });
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put(api.crm.relationships.update.path, async (req, res) => {
    try {
      const perms = await getCrmConfigPermissions(req, "relationships");
      if (!perms.canEdit) return res.status(403).json({ message: "Bạn không có quyền chỉnh sửa mối quan hệ." });
      const input = api.crm.relationships.update.input.parse(req.body);
      const before = await getCrmConfigRecord(crmRelationships, req.params.id);
      const data = await storage.updateCrmRelationship(req.params.id, input);
      await recordCrmConfigAudit(req, "relationship", "updated", data.id, data.name, before, data);
      cacheInvalidate("crm:relationships");
      res.json(data);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      if ((err as any).statusCode) return res.status((err as any).statusCode).json({ message: (err as any).message });
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete(api.crm.relationships.delete.path, async (req, res) => {
    try {
      const perms = await getCrmConfigPermissions(req, "relationships");
      if (!perms.canDelete) return res.status(403).json({ message: "Bạn không có quyền xóa mối quan hệ." });
      const before = await getCrmConfigRecord(crmRelationships, req.params.id);
      await storage.deleteCrmRelationship(req.params.id);
      await recordCrmConfigAudit(req, "relationship", "deleted", req.params.id, before?.name ?? null, before, null);
      cacheInvalidate("crm:relationships");
      res.status(204).send();
    } catch (err) {
      if ((err as any).statusCode) return res.status((err as any).statusCode).json({ message: (err as any).message });
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.get(api.crm.rejectReasons.list.path, async (req, res) => {
    try {
      const locationKey = req.isSuperAdmin ? "super" : (req.allowedLocationIds ?? []).slice().sort().join(",");
      const cacheKey = `crm:rejectReasons:${locationKey}`;
      const cached = cacheGet<any[]>(cacheKey);
      if (cached) return res.json(cached);
      const data = await storage.getCrmRejectReasons(req.allowedLocationIds, req.isSuperAdmin);
      cacheSet(cacheKey, data);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.post(api.crm.rejectReasons.create.path, async (req, res) => {
    try {
      const perms = await getCrmConfigPermissions(req, "reject-reasons");
      if (!perms.canCreate) return res.status(403).json({ message: "Bạn không có quyền thêm lý do từ chối." });
      const input = api.crm.rejectReasons.create.input.parse(req.body);
      const data = await storage.createCrmRejectReason(input);
      await recordCrmConfigAudit(req, "reject-reason", "created", data.id, data.reason, null, data);
      cacheInvalidate("crm:rejectReasons");
      res.status(201).json(data);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put(api.crm.rejectReasons.update.path, async (req, res) => {
    try {
      const perms = await getCrmConfigPermissions(req, "reject-reasons");
      if (!perms.canEdit) return res.status(403).json({ message: "Bạn không có quyền chỉnh sửa lý do từ chối." });
      const input = api.crm.rejectReasons.update.input.parse(req.body);
      const before = await getCrmConfigRecord(crmRejectReasons, req.params.id);
      const data = await storage.updateCrmRejectReason(req.params.id, input);
      await recordCrmConfigAudit(req, "reject-reason", "updated", data.id, data.reason, before, data);
      cacheInvalidate("crm:rejectReasons");
      res.json(data);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete(api.crm.rejectReasons.delete.path, async (req, res) => {
    try {
      const perms = await getCrmConfigPermissions(req, "reject-reasons");
      if (!perms.canDelete) return res.status(403).json({ message: "Bạn không có quyền xóa lý do từ chối." });
      const before = await getCrmConfigRecord(crmRejectReasons, req.params.id);
      await storage.deleteCrmRejectReason(req.params.id);
      await recordCrmConfigAudit(req, "reject-reason", "deleted", req.params.id, before?.reason ?? null, before, null);
      cacheInvalidate("crm:rejectReasons");
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.get(api.crm.customerSources.list.path, async (req, res) => {
    try {
      const locationKey = req.isSuperAdmin ? "super" : (req.allowedLocationIds ?? []).slice().sort().join(",");
      const cacheKey = `crm:customerSources:${locationKey}`;
      const cached = cacheGet<any[]>(cacheKey);
      if (cached) return res.json(cached);
      const data = await storage.getCrmCustomerSources(req.allowedLocationIds, req.isSuperAdmin);
      cacheSet(cacheKey, data);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.post(api.crm.customerSources.create.path, async (req, res) => {
    try {
      const perms = await getCrmConfigPermissions(req, "sources");
      if (!perms.canCreate) return res.status(403).json({ message: "Bạn không có quyền thêm nguồn khách hàng." });
      const input = api.crm.customerSources.create.input.parse(req.body);
      const data = await storage.createCrmCustomerSource(input);
      await recordCrmConfigAudit(req, "customer-source", "created", data.id, data.name, null, data);
      cacheInvalidate("crm:customerSources");
      res.status(201).json(data);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put(api.crm.customerSources.update.path, async (req, res) => {
    try {
      const perms = await getCrmConfigPermissions(req, "sources");
      if (!perms.canEdit) return res.status(403).json({ message: "Bạn không có quyền chỉnh sửa nguồn khách hàng." });
      const input = api.crm.customerSources.update.input.parse(req.body);
      const before = await getCrmConfigRecord(crmCustomerSources, req.params.id);
      const data = await storage.updateCrmCustomerSource(req.params.id, input);
      await recordCrmConfigAudit(req, "customer-source", "updated", data.id, data.name, before, data);
      cacheInvalidate("crm:customerSources");
      res.json(data);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete(api.crm.customerSources.delete.path, async (req, res) => {
    try {
      const perms = await getCrmConfigPermissions(req, "sources");
      if (!perms.canDelete) return res.status(403).json({ message: "Bạn không có quyền xóa nguồn khách hàng." });
      const id = req.params.id as string;
      const before = await getCrmConfigRecord(crmCustomerSources, id);
      await storage.deleteCrmCustomerSource(id);
      await recordCrmConfigAudit(req, "customer-source", "deleted", id, before?.name ?? null, before, null);
      cacheInvalidate("crm:customerSources");
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.get(api.crm.schools.list.path, async (req, res) => {
    try {
      const locationKey = req.isSuperAdmin ? "super" : (req.allowedLocationIds ?? []).slice().sort().join(",");
      const cacheKey = `crm:schools:${locationKey}`;
      const cached = cacheGet<any[]>(cacheKey);
      if (cached) return res.json(cached);
      const data = await storage.getCrmSchools();
      cacheSet(cacheKey, data);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.post(api.crm.schools.create.path, async (req, res) => {
    try {
      const perms = await getCrmConfigPermissions(req, "schools");
      if (!perms.canCreate) return res.status(403).json({ message: "Bạn không có quyền thêm trường học." });
      const input = api.crm.schools.create.input.parse(req.body);
      const data = await storage.createCrmSchool(input);
      await recordCrmConfigAudit(req, "school", "created", data.id, data.name, null, data);
      cacheInvalidate("crm:schools");
      res.status(201).json(data);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put(api.crm.schools.update.path, async (req, res) => {
    try {
      const perms = await getCrmConfigPermissions(req, "schools");
      if (!perms.canEdit) return res.status(403).json({ message: "Bạn không có quyền chỉnh sửa trường học." });
      const input = api.crm.schools.update.input.parse(req.body);
      const before = await getCrmConfigRecord(crmSchools, req.params.id);
      const data = await storage.updateCrmSchool(req.params.id, input);
      await recordCrmConfigAudit(req, "school", "updated", data.id, data.name, before, data);
      cacheInvalidate("crm:schools");
      res.json(data);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete(api.crm.schools.delete.path, async (req, res) => {
    try {
      const perms = await getCrmConfigPermissions(req, "schools");
      if (!perms.canDelete) return res.status(403).json({ message: "Bạn không có quyền xóa trường học." });
      const before = await getCrmConfigRecord(crmSchools, req.params.id);
      await storage.deleteCrmSchool(req.params.id);
      await recordCrmConfigAudit(req, "school", "deleted", req.params.id, before?.name ?? null, before, null);
      cacheInvalidate("crm:schools");
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.get(api.crm.requiredFields.list.path, async (_req, res) => {
    try {
      res.json(await storage.getCrmRequiredFields());
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put(api.crm.requiredFields.upsert.path, async (req, res) => {
    try {
      const perms = await getCrmConfigPermissions(req, "required-info");
      if (!perms.canEdit) return res.status(403).json({ message: "Bạn không có quyền chỉnh sửa trường bắt buộc." });
      const body = req.body as { fieldKey: string; isRequired: boolean };
      if (!body || typeof body.fieldKey !== "string" || typeof body.isRequired !== "boolean") {
        return res.status(400).json({ message: "Invalid payload" });
      }
      const [before] = await db.select().from(crmRequiredFields)
        .where(eq(crmRequiredFields.fieldKey, body.fieldKey)).limit(1);
      const data = await storage.upsertCrmRequiredField(body.fieldKey, body.isRequired);
      await recordCrmConfigAudit(
        req,
        "required-field",
        "updated",
        body.fieldKey,
        body.fieldKey,
        before ?? { fieldKey: body.fieldKey, isRequired: false },
        data,
      );
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  // ── CRM Registration Form Fields ──────────────────────────────────────────
  app.get(api.crm.registrationFields.list.path, async (_req, res) => {
    try {
      res.json(await storage.getCrmRegistrationFormFields());
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put(api.crm.registrationFields.upsert.path, async (req, res) => {
    try {
      const perms = await getCrmConfigPermissions(req, "registration-form");
      if (!perms.canEdit) return res.status(403).json({ message: "Bạn không có quyền chỉnh sửa form đăng ký." });
      const body = req.body as { fieldKey: string; isVisible: boolean; isRequired?: boolean };
      if (!body || typeof body.fieldKey !== "string" || typeof body.isVisible !== "boolean") {
        return res.status(400).json({ message: "Invalid payload" });
      }
      const data = await storage.upsertCrmRegistrationFormField(body.fieldKey, body.isVisible, body.isRequired);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  // ── CRM Custom Fields ──────────────────────────────────────────────────────
  app.get(api.crm.customFields.list.path, async (_req, res) => {
    try {
      const cacheKey = "crm:customFields";
      const cached = cacheGet<any[]>(cacheKey);
      if (cached) return res.json(cached);
      const data = await storage.getCrmCustomFields();
      cacheSet(cacheKey, data);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.post(api.crm.customFields.create.path, async (req, res) => {
    try {
      const perms = await getCrmConfigPermissions(req, "additional-info");
      if (!perms.canCreate) return res.status(403).json({ message: "Bạn không có quyền thêm trường thông tin bổ sung." });
      const input = api.crm.customFields.create.input.parse(req.body);
      const data = await storage.createCrmCustomField(input);
      await recordCrmConfigAudit(req, "custom-field", "created", data.id, data.label, null, data);
      cacheInvalidate("crm:customFields");
      res.status(201).json(data);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put(api.crm.customFields.update.path, async (req, res) => {
    try {
      const perms = await getCrmConfigPermissions(req, "additional-info");
      if (!perms.canEdit) return res.status(403).json({ message: "Bạn không có quyền chỉnh sửa trường thông tin bổ sung." });
      const input = api.crm.customFields.update.input.parse(req.body);
      const before = await getCrmConfigRecord(crmCustomFields, req.params.id);
      const data = await storage.updateCrmCustomField(req.params.id, input);
      await recordCrmConfigAudit(req, "custom-field", "updated", data.id, data.label, before, data);
      cacheInvalidate("crm:customFields");
      res.json(data);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete(api.crm.customFields.delete.path, async (req, res) => {
    try {
      const perms = await getCrmConfigPermissions(req, "additional-info");
      if (!perms.canDelete) return res.status(403).json({ message: "Bạn không có quyền xóa trường thông tin bổ sung." });
      const before = await getCrmConfigRecord(crmCustomFields, req.params.id);
      await storage.deleteCrmCustomField(req.params.id);
      await recordCrmConfigAudit(req, "custom-field", "deleted", req.params.id, before?.label ?? null, before, null);
      cacheInvalidate("crm:customFields");
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
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
            isNotNull(invoiceItems.packageId),
            ne(invoices.status, "cancelled")
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

  // POST /api/students/fee-packages-batch
  // Batch: lấy fee packages cho nhiều học viên cùng lúc — thay thế N lần GET /students/:id/fee-packages
  app.post("/api/students/fee-packages-batch", async (req, res) => {
    try {
      const { studentIds } = req.body as { studentIds: string[] };
      if (!Array.isArray(studentIds) || studentIds.length === 0) return res.json({});

      // 1. Tổng đăng ký per student+package
      const registeredRows = await db
        .select({
          studentId: invoices.studentId,
          packageId: invoiceItems.packageId,
          packageName: invoiceItems.packageName,
          totalSessions: sql<number>`SUM(${invoiceItems.quantity})::int`,
        })
        .from(invoiceItems)
        .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
        .where(and(
          inArray(invoices.studentId, studentIds),
          isNotNull(invoiceItems.packageId),
          ne(invoices.status, "cancelled"),
        ))
        .groupBy(invoices.studentId, invoiceItems.packageId, invoiceItems.packageName);

      // 2. Đã xếp per student+package
      const scheduledRows = await db
        .select({
          studentId: studentSessions.studentId,
          packageId: studentSessions.packageId,
          scheduledCount: sql<number>`COUNT(*)::int`,
        })
        .from(studentSessions)
        .where(and(inArray(studentSessions.studentId, studentIds), isNotNull(studentSessions.packageId)))
        .groupBy(studentSessions.studentId, studentSessions.packageId);

      // 3. Deducting statuses
      const deductingRules = await db
        .select({ attendanceStatus: attendanceFeeRules.attendanceStatus })
        .from(attendanceFeeRules)
        .where(eq(attendanceFeeRules.deductsFee, true));
      const deductingStatuses = deductingRules.map((r) => r.attendanceStatus);

      // 4. Đã học per student+package
      const attendedRows = deductingStatuses.length > 0
        ? await db
            .select({
              studentId: studentSessions.studentId,
              packageId: studentSessions.packageId,
              attendedCount: sql<number>`COUNT(*)::int`,
            })
            .from(studentSessions)
            .where(and(
              inArray(studentSessions.studentId, studentIds),
              isNotNull(studentSessions.packageId),
              inArray(studentSessions.attendanceStatus, deductingStatuses)
            ))
            .groupBy(studentSessions.studentId, studentSessions.packageId)
        : [];

      // 5. Merge into result map: studentId -> packages[]
      type ScheduledKey = string;
      const scheduledMap = new Map<ScheduledKey, number>();
      for (const r of scheduledRows) scheduledMap.set(`${r.studentId}|${r.packageId}`, r.scheduledCount);
      const attendedMap = new Map<ScheduledKey, number>();
      for (const r of attendedRows) attendedMap.set(`${r.studentId}|${r.packageId}`, r.attendedCount);

      const result: Record<string, any[]> = {};
      for (const row of registeredRows) {
        const sid = row.studentId!;
        if (!result[sid]) result[sid] = [];
        const key = `${sid}|${row.packageId}`;
        const total = row.totalSessions ?? 0;
        const scheduled = scheduledMap.get(key) ?? 0;
        const attended = attendedMap.get(key) ?? 0;
        const remaining = Math.max(0, total - scheduled - attended);
        result[sid].push({
          packageId: row.packageId,
          name: row.packageName,
          totalSessions: total,
          scheduledSessions: scheduled,
          attendedSessions: attended,
          remainingSessions: remaining,
          ratio: total > 0 ? scheduled / total : 0,
        });
      }
      res.json(result);
    } catch (err: any) {
      console.error("Fee packages batch error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải gói học phí batch" });
    }
  });

  // GET /api/students/:id/invoices – admin view of all invoices for a student
  // Supports ?page=1&limit=8 for paginated overview; returns totalDebt when paginated
  app.get("/api/students/:id/invoices", async (req, res) => {
    try {
      const { id: studentId } = req.params;
      const limitParam = req.query.limit ? parseInt(req.query.limit as string) : null;
      const pageParam  = req.query.page  ? Math.max(1, parseInt(req.query.page as string)) : null;
      const isPaginated = limitParam !== null && !isNaN(limitParam);

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
        .orderBy(desc(invoices.createdAt));

      const invoiceIds = invoiceRows.map(inv => inv.id);
      const allSchedules = invoiceIds.length
        ? await db
            .select()
            .from(invoicePaymentSchedule)
            .where(inArray(invoicePaymentSchedule.invoiceId, invoiceIds))
            .orderBy(invoicePaymentSchedule.sortOrder)
        : [];

      const schedulesByInvoice = new Map<string, typeof allSchedules>();
      for (const sch of allSchedules) {
        const list = schedulesByInvoice.get(sch.invoiceId) ?? [];
        list.push(sch);
        schedulesByInvoice.set(sch.invoiceId, list);
      }

      const result: any[] = [];
      for (const inv of invoiceRows) {
        const schedules = schedulesByInvoice.get(inv.id) ?? [];

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

      if (isPaginated) {
        const limit  = limitParam!;
        const page   = pageParam  ?? 1;
        const offset = (page - 1) * limit;
        // Sort by paidAt desc for paid items, createdAt desc overall
        const sorted = result.sort((a, b) => {
          const ta = new Date(a.paidAt || a.createdAt).getTime();
          const tb = new Date(b.paidAt || b.createdAt).getTime();
          return tb - ta;
        });
        const paidItems   = sorted.filter(i => i.paidAt || i.status === "paid");
        const totalDebt   = sorted
          .filter(i => !i.paidAt && i.status !== "paid")
          .reduce((s, i) => s + Number(i.amount || 0), 0);
        const total       = paidItems.length;
        const totalPages  = Math.max(1, Math.ceil(total / limit));
        const items       = paidItems.slice(offset, offset + limit);
        return res.json({ invoices: items, total, totalPages, totalDebt });
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

  // POST /api/students/fee-wallet-transfer – chuyển đồng thời Học phí/Đặt cọc
  // giữa hai tài khoản khách hàng bằng các ledger entries bất biến.
  app.post("/api/students/fee-wallet-transfer", async (req, res) => {
    try {
      const fromStudentId = String(req.body?.fromStudentId ?? "");
      const toStudentId = String(req.body?.toStudentId ?? "");
      const hocPhiAmount = Number(req.body?.hocPhiAmount ?? 0);
      const datCocAmount = Number(req.body?.datCocAmount ?? 0);
      const description = typeof req.body?.description === "string" ? req.body.description : "";

      if (!fromStudentId || !toStudentId) {
        return res.status(400).json({ message: "Vui lòng chọn người nhận" });
      }
      if (![hocPhiAmount, datCocAmount].every(Number.isFinite) || hocPhiAmount < 0 || datCocAmount < 0) {
        return res.status(400).json({ message: "Số tiền chuyển không hợp lệ" });
      }
      if (hocPhiAmount <= 0 && datCocAmount <= 0) {
        return res.status(400).json({ message: "Vui lòng nhập ít nhất một khoản tiền cần chuyển" });
      }

      const [fromStudent, toStudent] = await Promise.all([
        storage.getStudent(fromStudentId, req.allowedLocationIds, req.isSuperAdmin),
        storage.getStudent(toStudentId, req.allowedLocationIds, req.isSuperAdmin),
      ]);
      if (!fromStudent) return res.status(404).json({ message: "Không tìm thấy người chuyển hoặc bạn không có quyền truy cập" });
      if (!toStudent) return res.status(404).json({ message: "Không tìm thấy người nhận hoặc bạn không có quyền truy cập" });

      const { transferStudentWallet } = await import("../storage/wallet.storage");
      const actorId = (req.user as any)?.id ?? null;
      const actorName = actorId ? await getActorName(actorId) : "Hệ thống";
      const entries = await transferStudentWallet({
        fromStudentId,
        toStudentId,
        hocPhiAmount,
        datCocAmount,
        description,
        createdBy: actorId,
        createdByName: actorName,
        fromStudentName: `${fromStudent.fullName} (${fromStudent.code})`,
        toStudentName: `${toStudent.fullName} (${toStudent.code})`,
      });

      res.status(201).json({ message: "Đã chuyển tiền thành công", entries });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể chuyển tiền" });
    }
  });

  // POST /api/students/fee-wallets-batch
  // Batch: lấy wallet summary (datCoc) cho nhiều học viên — thay thế N lần GET /students/:id/fee-wallet
  app.post("/api/students/fee-wallets-batch", async (req, res) => {
    try {
      const { studentIds } = req.body as { studentIds: string[] };
      if (!Array.isArray(studentIds) || studentIds.length === 0) return res.json({});

      const { getStudentWalletTransactions } = await import("../storage/wallet.storage");

      // Run in parallel — each call is already a single DB query
      const results = await Promise.all(
        studentIds.map(async (studentId) => {
          const rows = await getStudentWalletTransactions(studentId);
          let hocPhi = 0;
          let datCoc = 0;
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
          return { studentId, summary: { hocPhi, datCoc, total: hocPhi + datCoc } };
        })
      );

      const result: Record<string, { summary: { hocPhi: number; datCoc: number; total: number } }> = {};
      for (const r of results) result[r.studentId] = { summary: r.summary };
      res.json(result);
    } catch (err: any) {
      console.error("Fee wallets batch error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải ví học phí batch" });
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
      }).filter((entry) => entry.scores.length > 0);

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
  // ── GET /api/students/:id/star-rating ────────────────────────────────────────
  // Tổng điểm sao từ tất cả các lần nhận xét của học viên
  app.get("/api/students/:id/star-rating", async (req, res) => {
    try {
      const { id: studentId } = req.params;
      const result = await db.execute(sql`
        SELECT
          COUNT(DISTINCT ss.id)::int AS review_count,
          COALESCE(SUM((rating_val)::numeric), 0)::int AS total_stars
        FROM student_sessions ss,
             jsonb_each(ss.review_data) AS teacher_entry(teacher_key, teacher_data),
             jsonb_each(teacher_data->'criteriaRatings') AS rating_entry(criteria_key, rating_val)
        WHERE ss.student_id = ${studentId}
          AND ss.review_data IS NOT NULL
          AND jsonb_typeof(ss.review_data) = 'object'
          AND (rating_val)::text ~ '^[0-9]+(\.[0-9]+)?$'
      `);
      const row = (result.rows?.[0] ?? {}) as any;
      res.json({
        totalStars: Number(row.total_stars ?? 0),
        reviewCount: Number(row.review_count ?? 0),
      });
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

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
          AND ss.review_data::text NOT IN ('null', '[]', '{}')
          AND CASE WHEN jsonb_typeof(ss.review_data) = 'array' THEN jsonb_array_length(ss.review_data) > 0 ELSE TRUE END
          AND ss.review_published = TRUE
        ORDER BY cs.session_date DESC, cs.session_index DESC
      `);

      function normalizeStudentReviewData(raw: any): { criteriaId?: string; criteriaName: string; comment: string; rating?: number }[] {
        if (!raw) return [];
        if (Array.isArray(raw)) {
          return raw.map((item: any) => ({
            criteriaId: item.subCriteriaId || item.criteriaId,
            criteriaName: item.subCriteriaName || item.criteriaName || "—",
            comment: item.comment || "",
            rating: item.rating,
          }));
        }
        if (typeof raw === "object") {
          const items: { criteriaId?: string; criteriaName: string; comment: string; rating?: number }[] = [];
          for (const teacherData of Object.values(raw)) {
            const td = teacherData as any;
            const criteriaRatings: Record<string, number> = td?.criteriaRatings || {};
            if (td?.items && Array.isArray(td.items)) {
              for (const item of td.items) {
                const parentCriteriaId = item.criteriaId;
                const rating = criteriaRatings[parentCriteriaId] ?? undefined;
                items.push({
                  criteriaId: item.subCriteriaId || item.criteriaId,
                  criteriaName: item.subCriteriaName || item.criteriaName || "—",
                  comment: item.comment || "",
                  rating,
                });
              }
            } else if (td?.subNotes && typeof td.subNotes === "object") {
              for (const [subId, note] of Object.entries(td.subNotes)) {
                if (note) {
                  items.push({
                    criteriaId: subId,
                    criteriaName: subId,
                    comment: String(note),
                  });
                }
              }
            }
            // If no items but criteriaRatings exist, surface ratings as items
            if ((!td?.items || td.items.length === 0) && Object.keys(criteriaRatings).length > 0) {
              for (const [cId, rating] of Object.entries(criteriaRatings)) {
                items.push({
                  criteriaId: cId,
                  criteriaName: cId,
                  comment: "",
                  rating: rating as number,
                });
              }
            }
          }
          return items;
        }
        return [];
      }

      const rows = result.rows.map((row: any) => ({
        id: row.id,
        studentName: row.student_name,
        className: row.class_name,
        sessionIndex: row.session_index,
        sessionDate: row.session_date,
        shiftName: row.shift_name || "—",
        startTime: row.start_time || null,
        endTime: row.end_time || null,
        reviewData: normalizeStudentReviewData(row.review_data),
        reviewPublished: row.review_published,
      })).filter((row) => row.reviewData.some(item => item.comment || (item.rating && item.rating > 0)));

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
        sql`ss.review_data::text NOT IN ('null', '[]', '{}')`,
        sql`CASE WHEN jsonb_typeof(ss.review_data) = 'array' THEN jsonb_array_length(ss.review_data) > 0 ELSE TRUE END`,
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
          s.id AS student_id,
          s.full_name AS student_name,
          s.code AS student_code,
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

      // Collect all sub-criteria IDs needed for format-2 reviews (subNotes format)
      const subCriteriaIdsNeeded = new Set<string>();
      for (const row of result.rows) {
        const raw = (row as any).review_data;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
        for (const teacherData of Object.values(raw)) {
          const td = teacherData as any;
          if (td?.subNotes && typeof td.subNotes === "object") {
            for (const subId of Object.keys(td.subNotes)) subCriteriaIdsNeeded.add(subId);
          }
        }
      }

      // Batch-lookup sub-criteria names (only if needed)
      const subCriteriaNameMap = new Map<string, string>();
      if (subCriteriaIdsNeeded.size > 0) {
        const idList = [...subCriteriaIdsNeeded].map(id => `'${id}'`).join(",");
        const scRows = await db.execute(sql.raw(
          `SELECT id, name FROM evaluation_sub_criteria WHERE id IN (${idList})`
        ));
        for (const r of scRows.rows) {
          subCriteriaNameMap.set((r as any).id, (r as any).name || "");
        }
      }

      function normalizeReviewData(raw: any): { criteriaId?: string; criteriaName: string; comment: string }[] {
        if (!raw) return [];
        if (Array.isArray(raw)) {
          // Legacy flat-array format: [{ criteriaName, comment }]
          return raw.map((item: any) => ({
            criteriaId: item.subCriteriaId || item.criteriaId,
            criteriaName: item.subCriteriaName || item.criteriaName || "—",
            comment: item.comment || "",
          }));
        }
        if (typeof raw === "object") {
          const items: { criteriaId?: string; criteriaName: string; comment: string }[] = [];
          for (const teacherData of Object.values(raw)) {
            const td = teacherData as any;
            if (td?.items && Array.isArray(td.items)) {
              // Format 1: { teacherId: { items: [{criteriaName, subCriteriaName, comment}], teacherName } }
              for (const item of td.items) {
                items.push({
                  criteriaId: item.subCriteriaId || item.criteriaId,
                  criteriaName: item.subCriteriaName || item.criteriaName || "—",
                  comment: item.comment || "",
                });
              }
            } else if (td?.subNotes && typeof td.subNotes === "object") {
              // Format 2: { teacherId: { scores: {}, subNotes: { subCriteriaId: "text" } } }
              for (const [subId, note] of Object.entries(td.subNotes)) {
                if (note) {
                  items.push({
                    criteriaId: subId,
                    criteriaName: subCriteriaNameMap.get(subId) || subId,
                    comment: String(note),
                  });
                }
              }
            }
          }
          return items;
        }
        return [];
      }

      const rows = result.rows.map((row: any) => ({
        id: row.id,
        studentId: row.student_id,
        studentName: row.student_name,
        studentCode: row.student_code ?? null,
        className: row.class_name,
        sessionIndex: row.session_index,
        sessionDate: row.session_date,
        shiftName: row.shift_name || "—",
        startTime: row.start_time || null,
        endTime: row.end_time || null,
        reviewData: normalizeReviewData(row.review_data),
      }));

      res.json({ rows, total, page: pageNum, pageSize: size });
    } catch (err: any) {
      console.error("All session reviews error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải nhận xét" });
    }
  });

}
