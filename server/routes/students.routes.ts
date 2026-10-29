import type { Express } from "express";
import multer from "multer";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { runSecurityTests } from "../middleware/security-test";
import { cacheGet, cacheSet, cacheInvalidate } from "../lib/simple-cache";
import { db } from "../db";
import { invoices, invoiceItems, studentSessions, invoicePaymentSchedule, students, classes, attendanceFeeRules, users, staff, staffAssignments, locations, roles, departments, classGradeBooks, classGradeBookScores, scoreCategories, scoreSheetItems, sessionContents, studentSessionContents, classSessions, scoreSheetAssessmentStudentAttempts, systemSettings, studentRelationshipHistory, crmPipelineGroups, crmRelationships, crmRejectReasons, crmCustomerSources, crmSchools, crmCustomFields, crmRequiredFields, evaluationCriteria, evaluationSubCriteria, shiftTemplates, tasks } from "@shared/schema";
import { eq, and, isNotNull, sql, inArray, desc, gte, lte, ne, between, asc } from "drizzle-orm";
import { resolveScoreSheetAssessmentDeadlineAt, scoreSheetAssessmentSchema } from "@shared/score-sheet-assessment";
import {
  scoreSheetAssessmentAttemptResultSchema,
  scoreSheetAssessmentEvaluationResponsesSchema,
  selectScoreSheetAssessmentAttemptSummary,
} from "@shared/score-sheet-assessment-scoring";
import { SCORE_SHEET_ASSESSMENT_PUBLICATION_META_KEY } from "@shared/score-sheet-assessment-publication";
import { parseScoreConversionTemplatesJson, scoreConversionTemplateSchema } from "@shared/score-conversion";
import { scoreSheetTemplateSchema } from "@shared/score-sheet-template";
import { getStudentLearningStatusSummary, getCustomerLearningStatusSummary, getCustomerSummary, getNewCustomersSummary, getStudentsBySource, getStudentsByRelationship, getStudentsByLocation, getStudentsByStaff, getStudentsLearningStatuses, getMonthlyStudentCounts } from "../storage/student.storage";
import { createCrmConfigAuditLog, getCrmConfigAuditLogs } from "../storage/crm-config-audit.storage";
import { codeStem, nextCodeForStem } from "../lib/role-code";
import { decrypt, encrypt } from "../lib/encryption";
import { comparePasswords } from "../auth";
import {
  deletePrivateCustomerImport,
  downloadPrivateCustomerImport,
  uploadPrivateCustomerImport,
} from "../lib/s3";

const customerImportFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, fieldSize: 10 * 1024 * 1024 },
});

const CRM_RESOURCE = "/customers";
const CRM_CONFIG_BASE = "/customers/crm-config";
const CUSTOMER_EXPORT_MAX_ROWS = 50_000;
const CUSTOMER_EXPORT_BATCH_SIZE = 1_000;
const CUSTOMER_EXPORT_COLUMNS = new Set([
  "code", "fullName", "location", "school", "type", "phone", "dob", "email",
  "parent1", "phone1", "parent2", "phone2", "parent3", "phone3", "parentAccounts",
  "pipeline", "source", "reject", "sale", "manager", "teacher", "classes",
  "accountStatus", "learningStatus", "address", "social", "zaloOA", "level", "note",
  "createdAt", "creator", "updatedAt", "updater", "appointmentNearest", "appointment1",
  "appointment2", "lastContact", "discussion",
]);
const customerExportTokens = new Map<string, {
  userId: string;
  mode: "all" | "selected";
  studentIds: string[];
  columns: { id: string; label: string }[];
  createdAt: number;
}>();
let activeCustomerExports = 0;

const classRosterAttendanceLabels: Record<string, string> = {
  present: "Có học",
  absent: "Nghỉ",
  makeup_wait: "Chờ bù",
  makeup_scheduled: "Đã xếp bù",
  makeup_done: "Học bù",
  paused: "Bảo lưu",
  pending: "Chưa điểm danh",
};
const classRosterLearningStatusLabels: Record<string, string> = {
  dang_hoc: "Đang học",
  chua_co_lich: "Chưa có lịch",
  cho_lich: "Chờ lịch",
  bao_luu: "Bảo lưu",
  da_nghi: "Đã nghỉ",
};

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

async function getNextCustomerCode(type: string, locationId?: string): Promise<string> {
  const [roleConfig] = await db
    .select({
      name: roles.name,
      codePrefix: roles.codePrefix,
      codeByLocationRole: roles.codeByLocationRole,
    })
    .from(roles)
    .innerJoin(departments, eq(roles.departmentId, departments.id))
    .where(and(eq(roles.name, type), eq(departments.isSystem, true)))
    .limit(1);
  const [location] = locationId
    ? await db.select({ code: locations.code }).from(locations).where(eq(locations.id, locationId)).limit(1)
    : [];
  const stem = codeStem(
    roleConfig?.codePrefix,
    roleConfig?.name ?? type,
    roleConfig?.codeByLocationRole,
    location?.code,
  );
  const [studentCodes, linkedAccountNames] = await Promise.all([
    db.select({ code: students.code })
      .from(students)
      .where(sql`UPPER(${students.code}) LIKE ${`${stem}%`}`),
    db.select({ code: users.username })
      .from(users)
      .where(sql`UPPER(${users.username}) LIKE ${`${stem}%`}`),
  ]);
  return nextCodeForStem(
    [...studentCodes, ...linkedAccountNames].map((row) => row.code),
    stem,
  );
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
      const validCustomerLearningStatuses = ["dang_hoc", "chua_co_lich", "cho_lich", "bao_luu", "da_nghi"];
      const customerLearningStatusQuery = req.query.customerLearningStatus;
      if (
        customerLearningStatusQuery !== undefined &&
        (typeof customerLearningStatusQuery !== "string" || !validCustomerLearningStatuses.includes(customerLearningStatusQuery))
      ) {
        return res.status(400).json({ message: "Trạng thái học viên không hợp lệ." });
      }
      const customerLearningStatus = customerLearningStatusQuery as string | undefined;

      const result = await storage.getStudents({
        allowedLocationIds: req.allowedLocationIds,
        isSuperAdmin: req.isSuperAdmin,
        locationId: req.query.locationId as string | undefined,
        limit,
        offset,
        searchTerm: req.query.searchTerm as string | undefined,
        type: req.query.type as string | undefined,
        pipelineStage: req.query.pipelineStage as string | undefined,
        relationshipIds: parseArray(req.query.relationshipIds),
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
        customerLearningStatus,
        birthdayFrom: req.query.birthdayFrom as string | undefined,
        birthdayTo: req.query.birthdayTo as string | undefined,
        classTabId: req.query.classTabId as string | undefined,
        classTab: req.query.classTab === "unassigned" ? "unassigned" : undefined,
        endingSoonOnly: req.query.endingSoonOnly === "true",
        viewScope,
        viewerStaffId: req.staffId ?? undefined,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  // Customer XLSX export: issue a short-lived, single-use download token first,
  // then stream the workbook directly to the browser (no server-side file).
  app.post("/api/students/export-token", async (req, res) => {
    try {
      const schema = z.object({
        mode: z.enum(["all", "selected"]),
        studentIds: z.array(z.string().uuid()).max(CUSTOMER_EXPORT_MAX_ROWS).optional(),
        columns: z.array(z.object({ id: z.string().max(100), label: z.string().trim().min(1).max(150) })).max(100),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Thông tin xuất Excel không hợp lệ." });
      const columns = parsed.data.columns.filter(({ id }) =>
        id !== "selection" && id !== "actions" &&
        (CUSTOMER_EXPORT_COLUMNS.has(id) || /^custom:[\w-]{1,80}$/.test(id))
      );
      if (!columns.length) return res.status(400).json({ message: "Hãy chọn ít nhất một cột dữ liệu để xuất." });
      const studentIds = [...new Set(parsed.data.studentIds || [])];
      if (parsed.data.mode === "selected" && !studentIds.length) {
        return res.status(400).json({ message: "Chưa có khách hàng nào được chọn." });
      }
      if (parsed.data.mode === "all" && studentIds.length) {
        return res.status(400).json({ message: "Danh sách xuất không hợp lệ." });
      }
      const permissions = await getCrmPermissions(req);
      if (!permissions.canView && !permissions.canViewAll) {
        return res.status(403).json({ message: "Bạn không có quyền xem danh sách khách hàng." });
      }
      const scope = {
        allowedLocationIds: req.allowedLocationIds || [],
        isSuperAdmin: !!req.isSuperAdmin,
        viewScope: permissions.canViewAll ? "all" as const : "own" as const,
        viewerStaffId: req.staffId ?? undefined,
      };
      const count = await storage.getStudents({
        ...scope,
        studentIds: parsed.data.mode === "selected" ? studentIds : undefined,
        limit: 1,
        offset: 0,
      });
      if (!count.total) return res.status(400).json({ message: "Không có khách hàng phù hợp để xuất." });
      if (count.total > CUSTOMER_EXPORT_MAX_ROWS) {
        return res.status(413).json({ message: `Danh sách vượt giới hạn ${CUSTOMER_EXPORT_MAX_ROWS.toLocaleString("vi-VN")} dòng.` });
      }
      for (const [key, value] of customerExportTokens) {
        if (Date.now() - value.createdAt > 10 * 60_000) customerExportTokens.delete(key);
      }
      const token = randomUUID();
      customerExportTokens.set(token, {
        userId: String((req.user as any)?.id ?? req.staffId ?? ""),
        mode: parsed.data.mode,
        studentIds: parsed.data.mode === "selected" ? studentIds : [],
        columns,
        createdAt: Date.now(),
      });
      res.json({ token, total: count.total });
    } catch (error: any) {
      console.error("[customers-export] prepare failed:", error);
      res.status(500).json({ message: "Không thể chuẩn bị file Excel." });
    }
  });

  app.get("/api/students/export.xlsx", async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const exportRequest = customerExportTokens.get(token);
    if (!exportRequest || Date.now() - exportRequest.createdAt > 10 * 60_000) {
      customerExportTokens.delete(token);
      return res.status(410).json({ message: "Yêu cầu tải xuống đã hết hạn. Hãy thử lại." });
    }
    const userId = String((req.user as any)?.id ?? req.staffId ?? "");
    if (!userId || userId !== exportRequest.userId) return res.status(403).json({ message: "Không có quyền tải file này." });
    customerExportTokens.delete(token);
    if (activeCustomerExports >= 1) return res.status(429).json({ message: "Đang có một lượt xuất danh sách khác. Vui lòng thử lại sau." });
    activeCustomerExports++;
    try {
      const permissions = await getCrmPermissions(req);
      if (!permissions.canView && !permissions.canViewAll) return res.status(403).json({ message: "Bạn không có quyền xem danh sách khách hàng." });
      const scope = {
        allowedLocationIds: req.allowedLocationIds || [],
        isSuperAdmin: !!req.isSuperAdmin,
        viewScope: permissions.canViewAll ? "all" as const : "own" as const,
        viewerStaffId: req.staffId ?? undefined,
      };
      const count = await storage.getStudents({
        ...scope,
        studentIds: exportRequest.mode === "selected" ? exportRequest.studentIds : undefined,
        limit: 1,
        offset: 0,
      });
      if (!count.total || count.total > CUSTOMER_EXPORT_MAX_ROWS) {
        return res.status(count.total ? 413 : 400).json({ message: "Danh sách không còn phù hợp để xuất. Hãy thử lại." });
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="customers_${new Date().toISOString().slice(0, 10)}.xlsx"`);
      res.setHeader("Cache-Control", "no-store");
      res.flushHeaders();
      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: false, useSharedStrings: false });
      const worksheet = workbook.addWorksheet("Khach_hang");
      worksheet.addRow(exportRequest.columns.map((column) => column.label)).commit();

      const formatDate = (value: any, includeTime = false) => {
        if (!value) return "";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        return includeTime
          ? date.toLocaleString("vi-VN", { timeZone: "Asia/Bangkok" })
          : date.toLocaleDateString("vi-VN", { timeZone: "Asia/Bangkok" });
      };
      const addBatch = async (batch: any[]) => {
        if (!batch.length) return;
        const ids = batch.map((student) => student.id);
        const statuses = await getStudentsLearningStatuses(ids);
        const parentIds = [...new Set(batch.flatMap((student) => student.parentIds || []))] as string[];
        const parentRows = parentIds.length && exportRequest.columns.some((column) => column.id === "parentAccounts")
          ? await storage.getStudents({ ...scope, studentIds: parentIds, limit: parentIds.length, offset: 0 })
          : { students: [], total: 0 };
        const parentMap = new Map(parentRows.students.map((parent: any) => [parent.id, parent]));
        const taskRows = exportRequest.columns.some((column) => ["appointmentNearest", "appointment1", "appointment2", "lastContact"].includes(column.id))
          ? await db.select().from(tasks).where(sql`${tasks.subjectIds} && ARRAY[${sql.join(ids.map((id: string) => sql`${id}::uuid`), sql`, `)}]::uuid[]`).orderBy(tasks.dueDate)
          : [];
        const taskMap = new Map<string, any[]>();
        for (const task of taskRows) for (const id of task.subjectIds || []) {
          if (!ids.includes(id)) continue;
          const rows = taskMap.get(id) || [];
          rows.push(task);
          taskMap.set(id, rows);
        }
        const labels: Record<string, string> = {
          dang_hoc: "Đang học", chua_co_lich: "Chưa có lịch", cho_lich: "Chờ lịch",
          bao_luu: "Bảo lưu", da_nghi: "Đã nghỉ",
        };
        const taskText = (task: any) => task?.dueDate
          ? `${formatDate(task.dueDate, true)}${task.title ? ` — ${task.title}` : ""}`
          : "";
        for (const student of batch) {
          const studentTasks = taskMap.get(student.id) || [];
          const now = Date.now();
          const upcoming = studentTasks.filter((task) => task.dueDate && new Date(task.dueDate).getTime() >= now)
            .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
          const past = studentTasks.filter((task) => task.dueDate && new Date(task.dueDate).getTime() < now)
            .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
          const values = exportRequest.columns.map(({ id }) => {
            if (id.startsWith("custom:")) return student.customFields?.[id.slice(7)] ?? "";
            switch (id) {
              case "code": return student.code || "";
              case "fullName": return student.fullName || "";
              case "location": return (student.locations || []).map((row: any) => row.location?.name).filter(Boolean).join("; ") || student.location?.name || "";
              case "school": return (student.schoolList || []).map((row: any) => row.name).filter(Boolean).join("; ");
              case "type": return student.type || "Học viên";
              case "phone": return student.phone || "";
              case "dob": return formatDate(student.dateOfBirth);
              case "email": return student.email || "";
              case "parent1": return student.parentName || "";
              case "phone1": return student.parentPhone || "";
              case "parent2": return student.parentName2 || "";
              case "phone2": return student.parentPhone2 || "";
              case "parent3": return student.parentName3 || "";
              case "phone3": return student.parentPhone3 || "";
              case "parentAccounts": {
                const linkedParents = (student.parentIds || []).map((id: string) => parentMap.get(id)).filter(Boolean) as any[];
                return linkedParents.length
                  ? linkedParents.map((parent) => `${parent.fullName} (${parent.code})`).join("; ")
                  : student.parentIds?.length ? `${student.parentIds.length} PH` : "";
              }
              case "pipeline": return Array.isArray(student.pipelineStage) ? student.pipelineStage.join("; ") : student.pipelineStage || "";
              case "source": return student.sourceList?.join("; ") || student.source || "";
              case "reject": return student.rejectReason || "";
              case "sale": return student.salesByList?.map((row: any) => row.fullName).filter(Boolean).join("; ") || "";
              case "manager": return student.managedByList?.map((row: any) => row.fullName).filter(Boolean).join("; ") || "";
              case "teacher": return student.teacherList?.map((row: any) => row.fullName).filter(Boolean).join("; ") || "";
              case "classes": return (student.classDetails || []).map((row: any) => `${row.className}${row.studentStatus ? ` (${row.studentStatus})` : ""}`).join("; ");
              case "accountStatus": return student.accountStatus || "Hoạt động";
              case "learningStatus": return labels[(statuses as any)?.[student.id]] || (statuses as any)?.[student.id] || "";
              case "address": return student.address || "";
              case "social": return student.socialLink || "";
              case "zaloOA": return student.zaloChannel?.zaloUserId || "";
              case "level": return student.academicLevel || "";
              case "note": return student.note || "";
              case "createdAt": return formatDate(student.createdAt, true);
              case "creator": return student.creator?.username || "";
              case "updatedAt": return formatDate(student.updatedAt, true);
              case "updater": return student.updater?.username || "";
              case "appointmentNearest": return taskText(upcoming[0]);
              case "appointment1": return taskText(upcoming[1]);
              case "appointment2": return taskText(upcoming[2]);
              case "lastContact": return taskText(past[0]);
              case "discussion": return student.lastComment
                ? `${student.lastComment.content || ""}${student.lastComment.authorName ? ` — ${student.lastComment.authorName}` : ""}${student.lastComment.createdAt ? ` — ${formatDate(student.lastComment.createdAt, true)}` : ""}`
                : "";
              default: return "";
            }
          });
          worksheet.addRow(values).commit();
        }
      };

      if (exportRequest.mode === "all") {
        for (let offset = 0; offset < count.total; offset += CUSTOMER_EXPORT_BATCH_SIZE) {
          if (req.aborted || res.destroyed) break;
          const page = await storage.getStudents({ ...scope, limit: CUSTOMER_EXPORT_BATCH_SIZE, offset });
          await addBatch(page.students);
        }
      } else {
        for (let offset = 0; offset < exportRequest.studentIds.length; offset += CUSTOMER_EXPORT_BATCH_SIZE) {
          if (req.aborted || res.destroyed) break;
          const ids = exportRequest.studentIds.slice(offset, offset + CUSTOMER_EXPORT_BATCH_SIZE);
          const page = await storage.getStudents({ ...scope, studentIds: ids, limit: ids.length, offset: 0 });
          await addBatch(page.students);
        }
      }
      worksheet.commit();
      await workbook.commit();
    } catch (error: any) {
      console.error("[customers-export] stream failed:", error);
      if (res.headersSent) res.destroy(error);
      else res.status(500).json({ message: "Không thể tạo file Excel." });
    } finally {
      activeCustomerExports--;
    }
  });

  app.get("/api/students/class-roster-export.xlsx", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const classId = typeof req.query.classId === "string" ? req.query.classId : "";
    const month = typeof req.query.month === "string" ? req.query.month : "";
    const parsedClassId = z.string().uuid().safeParse(classId);
    const parsedMonth = /^(\d{4})-(\d{2})$/.exec(month);
    if (!parsedClassId.success || !parsedMonth || Number(parsedMonth[2]) < 1 || Number(parsedMonth[2]) > 12) {
      return res.status(400).json({ message: "Lớp hoặc tháng không hợp lệ." });
    }

    let exportHeadersSent = false;
    try {
      const permissions = await getCrmPermissions(req);
      if (!permissions.canView && !permissions.canViewAll) {
        return res.status(403).json({ message: "Bạn không có quyền xem danh sách khách hàng." });
      }
      const scope = {
        allowedLocationIds: req.allowedLocationIds || [],
        isSuperAdmin: !!req.isSuperAdmin,
        viewScope: permissions.canViewAll ? "all" as const : "own" as const,
        viewerStaffId: req.staffId ?? undefined,
      };
      const classRows = await db.select({ name: classes.name, classCode: classes.classCode })
        .from(classes).where(eq(classes.id, classId)).limit(1);
      const classInfo = classRows[0];
      if (!classInfo) return res.status(404).json({ message: "Không tìm thấy lớp." });

      const rosterCount = await storage.getStudents({
        ...scope, classTabId: classId, limit: 1, offset: 0,
      });
      if (!rosterCount.total) return res.status(404).json({ message: "Lớp chưa có học viên phù hợp để tải." });
      if (rosterCount.total > CUSTOMER_EXPORT_MAX_ROWS) {
        return res.status(413).json({ message: `Danh sách vượt giới hạn ${CUSTOMER_EXPORT_MAX_ROWS.toLocaleString("vi-VN")} dòng.` });
      }

      const year = Number(parsedMonth[1]);
      const monthNumber = Number(parsedMonth[2]);
      const startDate = `${parsedMonth[1]}-${parsedMonth[2]}-01`;
      const endDate = `${parsedMonth[1]}-${parsedMonth[2]}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, "0")}`;
      const attendanceRows = await db.select({
        studentId: studentSessions.studentId,
        sessionDate: classSessions.sessionDate,
        attendanceStatus: studentSessions.attendanceStatus,
      })
        .from(studentSessions)
        .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
        .where(and(
          eq(studentSessions.classId, classId),
          eq(classSessions.classId, classId),
          between(classSessions.sessionDate, startDate, endDate),
          ne(classSessions.status, "cancelled"),
          ne(studentSessions.status, "cancelled"),
          ne(studentSessions.status, "transferred"),
        ))
        .orderBy(asc(classSessions.sessionDate), asc(studentSessions.studentId));

      const dateKeys = [...new Set(attendanceRows.map((item) => String(item.sessionDate).slice(0, 10)))].sort();
      const attendanceByStudentDate = new Map<string, string[]>();
      for (const item of attendanceRows) {
        const date = String(item.sessionDate).slice(0, 10);
        const key = `${item.studentId}:${date}`;
        const statuses = attendanceByStudentDate.get(key) ?? [];
        statuses.push(classRosterAttendanceLabels[item.attendanceStatus || "pending"] || classRosterAttendanceLabels.pending);
        attendanceByStudentDate.set(key, statuses);
      }

      const weekdayNames = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
      const dateHeader = (date: string) => {
        const [y, m, d] = date.split("-").map(Number);
        const weekday = weekdayNames[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
        return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")} ${weekday}`;
      };
      const worksheetHeaders = [
        "STT", "Họ và tên", "Mã học viên", "Cơ sở", "Số điện thoại", "Ngày sinh",
        "Bắt đầu", "Kết thúc", "Số buổi (Tổng - Đã học - Còn lại)", "Trạng thái học",
        ...dateKeys.map(dateHeader),
      ];

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="class_${classId}_${month}.xlsx"; filename*=UTF-8''${encodeURIComponent(`Danh_sach_${classInfo.name || classInfo.classCode}_${month}.xlsx`)}`,
      );
      res.setHeader("Cache-Control", "no-store");

      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true, useSharedStrings: true });
      const worksheet = workbook.addWorksheet("Danh sach lop", {
        views: [{ state: "frozen", xSplit: 3, ySplit: 3, topLeftCell: "D4" }],
        pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
        autoFilter: {
          from: { row: 3, column: 1 },
          to: { row: 3, column: worksheetHeaders.length },
        },
      });
      const fixedWidths = [7, 26, 16, 22, 17, 14, 14, 14, 28, 18];
      worksheet.columns = worksheetHeaders.map((_header, index) => ({
        key: `column${index + 1}`,
        width: fixedWidths[index] ?? 18,
      }));
      worksheet.properties.defaultRowHeight = 26;
      res.flushHeaders();
      exportHeadersSent = true;

      const titleRow = worksheet.addRow([
        `DANH SÁCH LỚP · ${classInfo.name || classInfo.classCode}`,
        ...Array(worksheetHeaders.length - 1).fill(""),
      ]);
      worksheet.mergeCells(1, 1, 1, worksheetHeaders.length);
      titleRow.height = 36;
      const titleCell = titleRow.getCell(1);
      titleCell.font = { name: "Arial", size: 15, bold: true, color: { argb: "FFFFFFFF" } };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF155E75" } };
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      titleRow.commit();

      const subtitleRow = worksheet.addRow([
        `Lớp: ${classInfo.classCode || ""} · Tháng chuyên cần: ${month}`,
        ...Array(worksheetHeaders.length - 1).fill(""),
      ]);
      worksheet.mergeCells(2, 1, 2, worksheetHeaders.length);
      subtitleRow.height = 28;
      const subtitleCell = subtitleRow.getCell(1);
      subtitleCell.font = { name: "Arial", size: 10, color: { argb: "FF334155" } };
      subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
      subtitleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      subtitleRow.commit();

      const headerRow = worksheet.addRow(worksheetHeaders);
      headerRow.height = 36;
      headerRow.eachCell((cell) => {
        cell.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = { bottom: { style: "medium", color: { argb: "FF1D4ED8" } } };
      });
      headerRow.commit();
      const formatDate = (value: any) => {
        if (!value) return "";
        const datePart = String(value).slice(0, 10);
        const [y, m, d] = datePart.split("-");
        return y && m && d ? `${d}/${m}/${y}` : "";
      };
      for (let offset = 0, index = 1; offset < rosterCount.total;) {
        const batch = await storage.getStudents({
          ...scope, classTabId: classId, limit: CUSTOMER_EXPORT_BATCH_SIZE, offset,
        });
        if (!batch.students.length) break;
        for (const student of batch.students) {
          const classDetail = student.classDetails?.find((detail: any) => detail.classId === classId);
          const locations = (student.locations || [])
            .map((item: any) => item.location?.name)
            .filter(Boolean);
          const locationNames = [...new Set(locations)].join(", ") || student.location?.name || "";
          const row = worksheet.addRow([
            index++,
            student.fullName || "",
            student.code || "",
            locationNames,
            student.phone || "",
            formatDate(student.dateOfBirth),
            formatDate(classDetail?.startDate),
            formatDate(classDetail?.endDate),
            `${classDetail?.totalSessions ?? 0} - ${classDetail?.attendedSessions ?? 0} - ${classDetail?.remainingSessions ?? 0}`,
            classRosterLearningStatusLabels[classDetail?.learningStatus || ""] || classDetail?.learningStatus || "",
            ...dateKeys.map((date) => (attendanceByStudentDate.get(`${student.id}:${date}`) || []).join(" / ")),
          ]);
          row.height = 30;
          row.eachCell((cell, columnNumber) => {
            cell.font = { name: "Arial", size: 10, color: { argb: "FF1E293B" } };
            cell.alignment = {
              vertical: "middle",
              horizontal: columnNumber === 1 || columnNumber >= 11 ? "center" : "left",
              wrapText: columnNumber >= 9,
            };
            cell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
            if (index % 2 === 1) {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
            }
            if (columnNumber >= 11 && typeof cell.value === "string" && cell.value) {
              const statusFill: Record<string, string> = {
                "Có học": "FFDCFCE7",
                "Nghỉ": "FFFEE2E2",
                "Chờ bù": "FFFFEDD5",
                "Đã xếp bù": "FFEDE9FE",
                "Học bù": "FFDBEAFE",
                "Bảo lưu": "FFFEF3C7",
                "Chưa điểm danh": "FFF1F5F9",
              };
              const labels = cell.value.split(" / ");
              const fill = labels.length === 1 ? statusFill[labels[0]] : undefined;
              if (fill) {
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
                cell.font = { name: "Arial", size: 9, bold: true, color: { argb: "FF334155" } };
              }
            }
          });
          row.commit();
        }
        offset += batch.students.length;
      }
      await workbook.commit();
    } catch (error: any) {
      console.error("[customers-class-export] failed:", error);
      if (exportHeadersSent) res.destroy(error);
      else res.status(500).json({ message: error?.message || "Không thể xuất danh sách lớp." });
    }
  });

  // Server-side recipient search for fee-wallet transfers.
  // Do not preload a capped customer list: customers beyond that cap must
  // still be searchable, while the same location scope must apply at read
  // time and again when the transfer is submitted.
  app.get("/api/students/wallet-transfer-recipients", async (req, res) => {
    try {
      if (!req.isSuperAdmin && (!req.allowedLocationIds || req.allowedLocationIds.length === 0)) {
        return res.status(403).json({ message: "Bạn không có quyền truy cập." });
      }

      const requestedLimit = Number.parseInt(String(req.query.limit ?? "50"), 10);
      const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 50, 1), 100);
      const searchTerm = typeof req.query.searchTerm === "string"
        ? req.query.searchTerm.trim()
        : undefined;
      const students = await storage.getStudentsMinimal({
        allowedLocationIds: req.allowedLocationIds ?? [],
        isSuperAdmin: req.isSuperAdmin,
        limit,
        searchTerm,
      });

      return res.json({ students, total: students.length });
    } catch (err: any) {
      console.error("Wallet transfer recipient search error:", err);
      return res.status(500).json({ message: err.message || "Không thể tìm người nhận" });
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
      const locationId = typeof req.query.locationId === "string" ? req.query.locationId : undefined;
      const code = await getNextCustomerCode(type, locationId);
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
  // Customer-page cards aggregate each student's effective status per enrolled class.
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

  app.get("/api/students/:id/password", async (req, res) => {
    try {
      const crmPerms = await getCrmPermissions(req);
      if (!crmPerms.canEdit) {
        return res.status(403).json({ message: "Bạn không có quyền xem mật khẩu tài khoản khách hàng." });
      }

      const student = await storage.getStudent(req.params.id, req.allowedLocationIds, req.isSuperAdmin);
      if (!student) return res.status(404).json({ message: "Not found" });

      if (!crmPerms.canViewAll && req.staffId) {
        const staffId = req.staffId;
        const isOwner =
          (student.salesByIds || []).includes(staffId) ||
          (student.managedByIds || []).includes(staffId) ||
          (student.teacherIds || []).includes(staffId);
        if (!isOwner) {
          return res.status(403).json({ message: "Bạn không có quyền xem mật khẩu khách hàng này." });
        }
      }

      if (!student.userId) return res.json({ password: null, reason: "no_linked_account" });
      const [account] = await db
        .select({ passwordEncrypted: users.passwordEncrypted, passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, student.userId))
        .limit(1);
      let isDefaultPassword = false;
      try {
        isDefaultPassword = !!account?.passwordHash && comparePasswords("123456", account.passwordHash);
      } catch {
        isDefaultPassword = false;
      }
      const recoverDefaultPassword = async () => {
        const passwordEncrypted = encrypt("123456");
        await db.update(users).set({ passwordEncrypted, updatedAt: new Date() }).where(eq(users.id, student.userId!));
        return res.json({ password: "123456" });
      };
      if (!account?.passwordEncrypted) {
        if (isDefaultPassword) return await recoverDefaultPassword();
        return res.json({ password: null, reason: "legacy_password_not_recoverable" });
      }

      try {
        return res.json({ password: decrypt(account.passwordEncrypted) });
      } catch {
        if (isDefaultPassword) return await recoverDefaultPassword();
        return res.status(409).json({ message: "Không thể giải mã mật khẩu đã lưu." });
      }
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.post(api.students.create.path, async (req, res) => {
    try {
      const isExcelImport = req.body?.__activityLogSource === "excel_import";
      const crmPerms = await getCrmPermissions(req);
      if (!crmPerms.canCreate) {
        return res.status(403).json({ message: "Bạn không có quyền thêm khách hàng mới." });
      }
      const input = api.students.create.input.parse(req.body);
      const student = await storage.createStudent({ ...input, createdBy: (req.user as any).id });
      const userId = (req.user as any).id;
      const userName = await getActorName(userId);
      if (!isExcelImport) {
        const { oldData, newData } = buildCreatedLogData(student);
        await insertActivityLog({
          studentId: student.id,
          userId,
          userName,
          action: "create",
          oldData,
          newData,
        });
      }
      const codeAdjusted = Boolean(input.codeAutoGenerated && input.code && input.code !== student.code);
      const usernameAdjusted = Boolean(
        codeAdjusted &&
        input.usernameAutoGenerated &&
        input.username &&
        input.username !== (student as any).username
      );
      res.status(201).json({
        ...student,
        ...(codeAdjusted ? { codeAdjustedFrom: input.code } : {}),
        ...(usernameAdjusted ? { usernameAdjustedFrom: input.username } : {}),
      });

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
        const allowedLocationIdsArray = sql`ARRAY[${sql.join(
          req.allowedLocationIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}]::uuid[]`;
        if (locationId && !req.allowedLocationIds.includes(locationId)) {
          return res.json({ logs: [], total: 0 });
        }
        whereClauses.push(sql`EXISTS (
          SELECT 1
          FROM staff actor_staff
          JOIN staff_assignments actor_assignment ON actor_assignment.staff_id = actor_staff.id
          WHERE actor_staff.user_id = l.user_id
            AND actor_assignment.location_id = ANY(${allowedLocationIdsArray})
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

    if (action && ["create", "update", "delete", "import"].includes(action)) {
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

  app.post("/api/students/import-supplement", customerImportFileUpload.single("file"), async (req, res) => {
    let storageKey: string | null = null;
    try {
      const file = req.file;
      if (!file || !/\.xlsx$/i.test(file.originalname)) {
        return res.status(400).json({ message: "Chọn file Excel .xlsx hợp lệ." });
      }
      const crmPerms = await getCrmPermissions(req);
      if (!crmPerms.canEdit) return res.status(403).json({ message: "Bạn không có quyền chỉnh sửa khách hàng." });

      const updateSchema = z.object({
        username: z.string().max(500).optional(),
        password: z.string().max(500).optional(),
        phone: z.string().max(100).optional(),
        dateOfBirth: z.string().max(30).optional(),
        address: z.string().max(5000).optional(),
        source: z.string().max(500).optional(),
        rejectReason: z.string().max(500).optional(),
        academicLevel: z.string().max(500).optional(),
        note: z.string().max(5000).optional(),
      }).strict();
      const rowSchema = z.object({
        row: z.number().int().min(2),
        studentId: z.string().uuid(),
        code: z.string().trim().min(1).max(150),
        name: z.string().optional(),
        updates: updateSchema,
        rawData: z.array(z.any()).optional(),
      });
      let payload: any;
      try {
        payload = JSON.parse(String(req.body.payload || "{}"));
      } catch {
        return res.status(400).json({ message: "Dữ liệu file bổ sung không hợp lệ." });
      }
      const parsed = z.object({
        rows: z.array(rowSchema).max(10000),
        totalRows: z.number().int().min(0).max(10000),
        preErrors: z.array(z.object({
          row: z.number().int().min(2),
          name: z.string().optional(),
          reason: z.string().max(1000),
          rawData: z.array(z.any()).optional(),
          errorColumns: z.array(z.number().int()).optional(),
        })).max(10000).default([]),
      }).safeParse(payload);
      if (!parsed.success) return res.status(400).json({ message: "Cấu trúc file bổ sung không hợp lệ." });

      const userId = String((req.user as any)?.id || "");
      if (!userId) return res.status(401).json({ message: "Phiên đăng nhập không hợp lệ." });
      const batchId = randomUUID();
      storageKey = await uploadPrivateCustomerImport(
        Buffer.from(encrypt(file.buffer.toString("base64")), "utf8"),
        batchId,
      );

      const errorRows: any[] = [...parsed.data.preErrors];
      const seenStudentIds = new Set<string>();
      let updatedCount = 0;
      let unchangedCount = 0;
      let cursor = 0;
      const worker = async () => {
        while (cursor < parsed.data.rows.length) {
          const row = parsed.data.rows[cursor++];
          try {
            if (seenStudentIds.has(row.studentId)) throw new Error("Học viên bị lặp trong file.");
            seenStudentIds.add(row.studentId);
            const existing = await storage.getStudent(row.studentId, req.allowedLocationIds, req.isSuperAdmin);
            if (!existing || String(existing.code || "").trim().toLowerCase() !== row.code.trim().toLowerCase()) {
              throw new Error("Mã học viên không khớp hoặc bạn không có quyền truy cập.");
            }
            const updates = { ...row.updates };
            if (updates.password && !updates.username) {
              const [linkedAccount] = await db
                .select({ userId: students.userId })
                .from(students)
                .where(eq(students.id, row.studentId))
                .limit(1);
              if (!linkedAccount?.userId) updates.username = row.code;
            }
            if (Object.keys(updates).length) {
              await storage.updateStudent(
                row.studentId,
                { ...updates, updatedBy: userId },
                req.allowedLocationIds,
                req.isSuperAdmin,
              );
              updatedCount++;
            } else {
              unchangedCount++;
            }
          } catch (error: any) {
            errorRows.push({
              row: row.row,
              name: row.name || "",
              reason: error?.message || "Không thể cập nhật học viên.",
              rawData: row.rawData || [],
              errorColumns: [],
            });
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(5, parsed.data.rows.length) }, () => worker()));

      const userName = await getActorName(userId);
      const fileName = Buffer.from(file.originalname, "latin1").toString("utf8");
      const totalRows = parsed.data.totalRows;
      const newData = {
        __kind: "excel_import_batch",
        __text: "Import Excel bổ sung thông tin khách hàng",
        importType: "supplement",
        status: errorRows.length > 0 ? "error" : "success",
        fileName,
        storageKey,
        locationId: null,
        locationName: "Theo phạm vi quyền truy cập",
        successCount: updatedCount,
        unchangedCount,
        totalRows,
        errorCount: errorRows.length,
      };
      await db.execute(sql`
        INSERT INTO customer_activity_logs (student_id, user_id, user_name, action, old_data, new_data)
        VALUES (NULL, ${userId}, ${userName}, 'import', NULL, ${JSON.stringify(newData)}::jsonb)
      `);
      res.status(200).json({ successCount: updatedCount, unchangedCount, totalRows, errorRows });
    } catch (error: any) {
      if (storageKey) {
        await deletePrivateCustomerImport(storageKey).catch(() => {});
      }
      console.error("[Customer Supplement Import Error]", error);
      res.status(500).json({ message: error?.message || "Không thể nhập file bổ sung." });
    }
  });

  app.post("/api/customers/activity-logs/import", customerImportFileUpload.single("file"), async (req, res) => {
    let storageKey: string | null = null;
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ message: "Thiếu file Excel cần lưu nhật ký." });
      if (!/\.xlsx$/i.test(file.originalname)) {
        return res.status(400).json({ message: "Chỉ hỗ trợ lưu file Excel .xlsx." });
      }

      let summary: Record<string, any> = {};
      try {
        summary = JSON.parse(String(req.body.summary || "{}"));
      } catch {
        return res.status(400).json({ message: "Thông tin kết quả nhập không hợp lệ." });
      }
      const importType = summary.importType === "supplement" ? "supplement" : "create";
      const crmPerms = await getCrmPermissions(req);
      if (importType === "supplement" ? !crmPerms.canEdit : !crmPerms.canCreate) {
        return res.status(403).json({ message: "Bạn không có quyền ghi nhật ký nhập file." });
      }

      const locationId = summary.locationId ? String(summary.locationId) : "";
      if (locationId && !req.isSuperAdmin && !req.allowedLocationIds.includes(locationId)) {
        return res.status(403).json({ message: "Bạn không có quyền ghi nhật ký cho cơ sở này." });
      }

      const batchId = randomUUID();
      storageKey = await uploadPrivateCustomerImport(
        Buffer.from(encrypt(file.buffer.toString("base64")), "utf8"),
        batchId,
      );

      const userId = String((req.user as any)?.id || "");
      if (!userId) throw new Error("Không xác định được người thực hiện nhập file.");
      const userName = await getActorName(userId);
      const fileName = Buffer.from(file.originalname, "latin1").toString("utf8");
      const successCount = Math.max(0, Number(summary.successCount) || 0);
      const totalRows = Math.max(0, Number(summary.totalRows) || 0);
      const errorCount = Math.max(0, Number(summary.errorCount) || 0);
      const classAssignments = summary.classAssignments || null;
      const status = errorCount > 0 || classAssignments?.error || successCount === 0
        ? "error"
        : "success";
      const newData = {
        __kind: "excel_import_batch",
        __text: importType === "supplement"
          ? "Import Excel bổ sung thông tin khách hàng"
          : "Import Excel tạo mới khách hàng",
        importType,
        status,
        fileName,
        storageKey,
        locationId: locationId || null,
        locationName: String(summary.locationName || ""),
        successCount,
        totalRows,
        errorCount,
        classAssignments,
        options: {
          allowDuplicatePhone: Boolean(summary.allowDuplicatePhone),
          allowDuplicateEmail: Boolean(summary.allowDuplicateEmail),
        },
      };

      const inserted = await db.execute(sql`
        INSERT INTO customer_activity_logs (student_id, user_id, user_name, action, old_data, new_data)
        VALUES (NULL, ${userId}, ${userName}, 'import', NULL, ${JSON.stringify(newData)}::jsonb)
        RETURNING id
      `);
      res.status(201).json({ id: (inserted.rows[0] as any)?.id });
    } catch (err) {
      if (storageKey) {
        await deletePrivateCustomerImport(storageKey).catch((cleanupError) => {
          console.error("[Customer Import File Cleanup Error]", cleanupError);
        });
      }
      console.error("[Customer Import Activity Log Error]", err);
      res.status(500).json({ message: (err as any)?.message || "Không thể lưu nhật ký nhập Excel." });
    }
  });

  app.get("/api/customers/activity-logs/:id/file", async (req, res) => {
    try {
      const crmPerms = await getCrmPermissions(req);
      if (!crmPerms.canEdit) {
        return res.status(403).json({ message: "Bạn không có quyền tải file import có thông tin tài khoản." });
      }

      const actorScope = req.isSuperAdmin
        ? sql`TRUE`
        : sql`EXISTS (
            SELECT 1
            FROM staff actor_staff
            JOIN staff_assignments actor_assignment ON actor_assignment.staff_id = actor_staff.id
            WHERE actor_staff.user_id = l.user_id
              AND actor_assignment.location_id = ANY(ARRAY[${sql.join(
                req.allowedLocationIds.map((id: string) => sql`${id}::uuid`),
                sql`, `,
              )}]::uuid[])
          )`;
      const result = await db.execute(sql`
        SELECT l.new_data
        FROM customer_activity_logs l
        WHERE l.id = ${req.params.id}::uuid
          AND l.student_id IS NULL
          AND l.action = 'import'
          AND ${actorScope}
        LIMIT 1
      `);
      const newData = (result.rows[0] as any)?.new_data;
      if (newData?.__kind !== "excel_import_batch" || !newData.storageKey) {
        return res.status(404).json({ message: "Không tìm thấy file import." });
      }

      const encryptedFile = await downloadPrivateCustomerImport(String(newData.storageKey));
      const file = Buffer.from(decrypt(encryptedFile.toString("utf8")), "base64");
      const fileName = String(newData.fileName || "customer-import.xlsx").replace(/[\r\n"]/g, "_");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
      res.setHeader("Content-Length", String(file.length));
      res.send(file);
    } catch (err) {
      console.error("[Customer Import File Download Error]", err);
      res.status(500).json({ message: "Không thể tải file import." });
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

  app.patch(api.studentComments.update.path, async (req, res) => {
    try {
      const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
      if (!content) {
        return res.status(400).json({ message: "Nội dung thảo luận không được để trống" });
      }

      const comment = await storage.updateStudentComment(
        req.params.commentId,
        req.params.studentId,
        content,
        (req.user as any).id,
      );
      res.json(comment);
    } catch (err) {
      const message = (err as any).message;
      res.status(message === "Comment not found" ? 404 : 400).json({ message });
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
      const items: { studentId: string; classCode: string; locationId: string }[] = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.json({ success: true, assigned: 0 });
      }

      const userId = (req.user as any)?.id ?? null;

      const byCode = new Map<string, { studentIds: Set<string>; locationId: string }>();
      for (const item of items) {
        const studentId = String(item?.studentId ?? "").trim();
        if (!studentId) continue;
        const classCodes = [...new Set(
          String(item?.classCode ?? "")
            .split("/")
            .map((code) => code.trim())
            .filter(Boolean)
        )];
        for (const classCode of classCodes) {
          const existing = byCode.get(classCode);
          if (!existing) {
            byCode.set(classCode, {
              studentIds: new Set([studentId]),
              locationId: String(item.locationId ?? ""),
            });
          } else {
            existing.studentIds.add(studentId);
          }
        }
      }

      let assigned = 0;
      const created: string[] = [];
      const assignedStudentIds = new Set<string>();

      for (const [classCode, { studentIds, locationId }] of byCode) {
        const studentIdList = [...studentIds];
        if (studentIdList.length === 0) continue;
        let cls = await storage.findClassByCode(classCode);

        if (!cls) {
          cls = await storage.createMinimalClass({
            classCode,
            name: classCode,
            locationId,
            createdBy: userId,
          });
          created.push(cls.id);
        }

        await storage.addClassStudents(cls.id, studentIdList, userId);
        assigned += studentIdList.length;
        studentIdList.forEach((studentId) => assignedStudentIds.add(studentId));
      }

      return res.json({
        success: true,
        assigned,
        studentsAssigned: assignedStudentIds.size,
        classesProcessed: byCode.size,
        classesCreated: created.length,
      });
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

  // POST /api/students/:id/fee-wallet-adjustment – cân bằng thủ công Học phí/Đặt cọc
  // bằng các ledger entries bất biến, không tạo hóa đơn.
  app.post("/api/students/:id/fee-wallet-adjustment", async (req, res) => {
    try {
      const crmPerms = await getCrmPermissions(req);
      if (!crmPerms.canEdit) {
        return res.status(403).json({ message: "Bạn không có quyền cân bằng ví học phí." });
      }

      const { id: studentId } = req.params;
      const hocPhiAmount = Number(req.body?.hocPhiAmount ?? 0);
      const datCocAmount = Number(req.body?.datCocAmount ?? 0);
      if (
        ![hocPhiAmount, datCocAmount].every(amount =>
          Number.isSafeInteger(amount) && Math.abs(amount) <= 9_999_999_999_999
        ) ||
        (hocPhiAmount === 0 && datCocAmount === 0)
      ) {
        return res.status(400).json({ message: "Vui lòng nhập ít nhất một khoản cân bằng hợp lệ" });
      }

      const student = await storage.getStudent(studentId, req.allowedLocationIds, req.isSuperAdmin);
      if (!student) {
        return res.status(404).json({ message: "Không tìm thấy học viên hoặc bạn không có quyền truy cập" });
      }

      const { adjustStudentWallet } = await import("../storage/wallet.storage");
      const actorId = (req.user as any)?.id ?? null;
      const actorName = actorId ? await getActorName(actorId) : "Hệ thống";
      const entries = await adjustStudentWallet({
        studentId,
        hocPhiAmount,
        datCocAmount,
        createdBy: actorId,
        createdByName: actorName,
      });

      res.status(201).json({ message: "Đã cân bằng tài khoản thành công", entries });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể cân bằng tài khoản" });
    }
  });

  // POST /api/students/fee-wallet-adjustments – cân bằng nhiều ví atomically
  app.post("/api/students/fee-wallet-adjustments", async (req, res) => {
    try {
      const crmPerms = await getCrmPermissions(req);
      if (!crmPerms.canEdit) {
        return res.status(403).json({ message: "Bạn không có quyền cân bằng ví học phí." });
      }

      const adjustments = req.body?.adjustments;
      if (!Array.isArray(adjustments) || adjustments.length === 0 || adjustments.length > 500) {
        return res.status(400).json({ message: "Danh sách học viên cân bằng không hợp lệ" });
      }

      const normalized = adjustments.map((item: any) => ({
        studentId: String(item?.studentId ?? ""),
        hocPhiAmount: Number(item?.hocPhiAmount ?? 0),
        datCocAmount: Number(item?.datCocAmount ?? 0),
      }));
      if (normalized.some((item) =>
        !item.studentId ||
        ![item.hocPhiAmount, item.datCocAmount].every(amount =>
          Number.isSafeInteger(amount) && Math.abs(amount) <= 9_999_999_999_999
        )
      )) {
        return res.status(400).json({ message: "Số tiền cân bằng không hợp lệ" });
      }

      const uniqueStudentIds = [...new Set(normalized.map(item => item.studentId))];
      const students = await Promise.all(
        uniqueStudentIds.map(studentId =>
          storage.getStudent(studentId, req.allowedLocationIds, req.isSuperAdmin)
        )
      );
      if (students.some(student => !student || student.type !== "Học viên")) {
        return res.status(404).json({ message: "Không tìm thấy học viên hoặc bạn không có quyền truy cập" });
      }

      const { adjustStudentsWallet } = await import("../storage/wallet.storage");
      const actorId = (req.user as any)?.id ?? null;
      const actorName = actorId ? await getActorName(actorId) : "Hệ thống";
      const entries = await adjustStudentsWallet(normalized.map(item => ({
        ...item,
        createdBy: actorId,
        createdByName: actorName,
      })));

      res.status(201).json({
        message: "Đã cân bằng tài khoản thành công",
        studentCount: uniqueStudentIds.length,
        entries,
      });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể cân bằng tài khoản" });
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
          cs.session_date AS session_date,
          c.name AS class_name,
          (
            SELECT gbc.comment
            FROM class_grade_book_student_comments gbc
            WHERE gbc.grade_book_id = gb.id
              AND gbc.student_id = ${studentId}
            ORDER BY gbc.updated_at DESC
            LIMIT 1
          ) AS grading_comment,
          (
            SELECT json_agg(json_build_object(
              'categoryName', sc.name,
              'score', gbs.score
            ) ORDER BY CASE
              WHEN gb.score_sheet_category_order_snapshot IS NULL THEN sci.ord
              ELSE COALESCE(array_position(gb.score_sheet_category_order_snapshot, gbs.category_id), 2147483647)
            END)
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
        LEFT JOIN class_sessions cs ON cs.id = gb.session_id
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
          gradingComment: row.grading_comment ?? null,
          refId: row.id,
          createdAt: row.created_at,
          sessionDate: row.session_date,
        };
      }).filter((entry) => entry.scores.length > 0 || Boolean(entry.gradingComment?.trim()));

      const [assessmentSettings] = await db
        .select({ value: systemSettings.value })
        .from(systemSettings)
        .where(eq(systemSettings.key, "scoreSheetAssessments"))
        .limit(1);
      const assessments = assessmentSettings
        ? z.array(scoreSheetAssessmentSchema).parse(JSON.parse(assessmentSettings.value))
        : [];
      const assessmentsById = new Map(assessments.map((assessment) => [assessment.id, assessment]));
      const publishedAssessmentAttempts = await db
        .select({
          assessmentId: scoreSheetAssessmentStudentAttempts.assessmentId,
          classSessionId: scoreSheetAssessmentStudentAttempts.classSessionId,
          attemptNumber: scoreSheetAssessmentStudentAttempts.attemptNumber,
          result: scoreSheetAssessmentStudentAttempts.result,
          updatedAt: scoreSheetAssessmentStudentAttempts.updatedAt,
          sessionDate: classSessions.sessionDate,
          sessionIndex: classSessions.sessionIndex,
          classId: classes.id,
          classCode: classes.classCode,
          className: classes.name,
        })
        .from(scoreSheetAssessmentStudentAttempts)
        .innerJoin(
          classSessions,
          and(
            eq(classSessions.id, scoreSheetAssessmentStudentAttempts.classSessionId),
            eq(classSessions.scoreSheetAssessmentId, scoreSheetAssessmentStudentAttempts.assessmentId),
            sql`(
              ${classSessions.scoreSheetAssessmentPublished} = true
              OR ${scoreSheetAssessmentStudentAttempts.result}
                -> ${sql.raw(`'${SCORE_SHEET_ASSESSMENT_PUBLICATION_META_KEY}'`)}
                ->> 'publishedToStudent' = 'true'
            )`,
          ),
        )
        .innerJoin(
          studentSessions,
          and(
            eq(studentSessions.classSessionId, classSessions.id),
            eq(studentSessions.studentId, scoreSheetAssessmentStudentAttempts.studentId),
          ),
        )
        .innerJoin(classes, eq(classes.id, classSessions.classId))
        .where(and(
          eq(scoreSheetAssessmentStudentAttempts.studentId, studentId),
          sql`NOT (${scoreSheetAssessmentStudentAttempts.studentId} = ANY(COALESCE(${classSessions.scoreSheetAssessmentExcludedStudentIds}, ARRAY[]::uuid[])))`,
        ))
        .orderBy(desc(classSessions.sessionDate), desc(scoreSheetAssessmentStudentAttempts.attemptNumber));

      const publishedAssessmentGroups = new Map<string, { assessment: any; attempts: any[] }>();
      for (const row of publishedAssessmentAttempts) {
        const assessment = assessmentsById.get(row.assessmentId);
        if (!assessment?.templateSnapshot.scoreConversionTemplateId) continue;
        const key = `${row.assessmentId}:${row.classSessionId}`;
        const group = publishedAssessmentGroups.get(key) ?? { assessment, attempts: [] };
        group.attempts.push(row);
        publishedAssessmentGroups.set(key, group);
      }

      const publishedAssessmentEntries = Array.from(publishedAssessmentGroups.entries()).flatMap(
        ([, group]) => {
          const summary = selectScoreSheetAssessmentAttemptSummary(
            group.attempts,
            group.assessment.scoringPolicy,
            true,
          );
          if (!summary) return [];
          const selectedAttempt = group.attempts.find(
            (attempt) => attempt.attemptNumber === summary.attemptNumber,
          ) ?? group.attempts[0];
          const formatScore = (value: number) =>
            new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
          const overallScore = summary.result.overallConvertedScore;
          const skillScores = summary.result.skills
            .filter((skill) => skill.convertedScore !== null)
            .map((skill) => ({
              categoryName: skill.name,
              score: formatScore(skill.convertedScore!),
            }));
          if (overallScore === null && skillScores.length === 0) return [];

          const scores: Array<{ categoryName: string; score: string | null; color?: string }> = [
            ...(overallScore === null
              ? []
              : [{ categoryName: "Điểm quy đổi", score: formatScore(overallScore) }]),
            ...skillScores,
            ...(summary.result.gradeBand
              ? [{
                  categoryName: "Xếp loại",
                  score: summary.result.gradeBand.label,
                  color: summary.result.gradeBand.color,
                }]
              : []),
            ...(summary.result.passStatus
              ? [{
                  categoryName: "Kết quả",
                  score: summary.result.passStatus === "passed" ? "Đạt" : "Không đạt",
                  color: summary.result.passStatus === "passed" ? "#15803D" : "#DC2626",
                }]
              : []),
          ];
          const row = group.attempts[0];
          const examDate = row.sessionDate instanceof Date
            ? row.sessionDate.toISOString().slice(0, 10)
            : String(row.sessionDate ?? "").slice(0, 10);
          const rawCreatedAt = selectedAttempt?.updatedAt ?? row.sessionDate;
          const createdAt = rawCreatedAt instanceof Date
            ? rawCreatedAt.toISOString()
            : String(rawCreatedAt ?? "");
          return [{
            id: `score-sheet-assessment:${row.classSessionId}:${row.assessmentId}`,
            type: "Bảng điểm quy đổi" as const,
            title: `${group.assessment.name}${row.sessionIndex != null ? ` · Buổi ${row.sessionIndex}` : ""}`,
            className: row.classCode || row.className,
            classId: row.classId,
            finalScore: overallScore === null
              ? skillScores.map((score) => `${score.categoryName}: ${score.score}`).join(" / ") || null
              : formatScore(overallScore),
            scores,
            gradingComment: null,
            refId: row.classSessionId,
            createdAt,
            sessionDate: examDate,
            conversionResult: {
              gradeBand: summary.result.gradeBand,
              passStatus: summary.result.passStatus,
            },
            conversionAssessment: {
              sessionId: row.classSessionId,
              classCode: row.classCode || row.className,
              sessionIndex: row.sessionIndex,
              examDate,
              assessmentCode: group.assessment.code,
              templateName: group.assessment.templateSnapshot.name,
              attemptCount: group.assessment.attemptCount,
              scoringPolicy: group.assessment.scoringPolicy,
            },
          }];
        },
      );

      // 2. BTVN and bài kiểm tra where student has a score
      const contentResult = await db.execute(sql`
        SELECT
          ssc.id,
          COALESCE(ssc.custom_title, sc.title) AS title,
          sc.content_type,
          ssc.score,
          ssc.grading_comment,
          ssc.created_at,
          cs.session_date AS session_date,
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
        sessionDate: row.session_date,
      }));

      const all = [...gradeBookEntries, ...publishedAssessmentEntries, ...contentEntries].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      res.json(all);
    } catch (err: any) {
      console.error("Score entries error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải bảng điểm" });
    }
  });

  // GET /api/students/:id/score-entries/:sessionId/conversion-detail – chi tiết bảng điểm quy đổi đã công bố
  app.get("/api/students/:id/score-entries/:sessionId/conversion-detail", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const studentId = z.string().uuid().safeParse(req.params.id);
      const sessionId = z.string().uuid().safeParse(req.params.sessionId);
      if (!studentId.success || !sessionId.success) {
        return res.status(400).json({ message: "Học viên hoặc buổi thi không hợp lệ." });
      }

      const permissions = await getCrmPermissions(req);
      if (!permissions.canView && !permissions.canViewAll) {
        return res.status(403).json({ message: "Bạn không có quyền xem hồ sơ học viên." });
      }
      const student = await storage.getStudent(
        studentId.data,
        req.allowedLocationIds,
        req.isSuperAdmin,
      );
      if (!student) return res.status(404).json({ message: "Không tìm thấy học viên." });
      if (!permissions.canViewAll && req.staffId) {
        const staffId = req.staffId;
        const isOwner =
          (student.salesByIds || []).includes(staffId)
          || (student.managedByIds || []).includes(staffId)
          || (student.teacherIds || []).includes(staffId);
        if (!isOwner) {
          return res.status(403).json({ message: "Bạn không có quyền xem học viên này." });
        }
      }

      const [session] = await db
        .select({
          assessmentId: classSessions.scoreSheetAssessmentId,
          sessionDate: classSessions.sessionDate,
          sessionStartTime: shiftTemplates.startTime,
          published: classSessions.scoreSheetAssessmentPublished,
          excludedStudentIds: classSessions.scoreSheetAssessmentExcludedStudentIds,
        })
        .from(classSessions)
        .innerJoin(studentSessions, and(
          eq(studentSessions.classSessionId, classSessions.id),
          eq(studentSessions.studentId, studentId.data),
        ))
        .leftJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .where(eq(classSessions.id, sessionId.data))
        .limit(1);
      if (
        !session?.assessmentId
        || session.excludedStudentIds?.includes(studentId.data)
      ) {
        return res.status(404).json({ message: "Không tìm thấy bảng điểm đã công bố cho học viên này." });
      }

      const [assessmentSettings] = await db
        .select({ value: systemSettings.value })
        .from(systemSettings)
        .where(eq(systemSettings.key, "scoreSheetAssessments"))
        .limit(1);
      const savedAssessments = assessmentSettings
        ? z.array(scoreSheetAssessmentSchema).parse(JSON.parse(assessmentSettings.value))
        : [];
      const savedAssessment = savedAssessments.find((item) => item.id === session.assessmentId);
      const conversionTemplateId = savedAssessment?.templateSnapshot.scoreConversionTemplateId;
      if (!savedAssessment || !conversionTemplateId) {
        return res.status(404).json({ message: "Không tìm thấy cấu hình bảng điểm quy đổi." });
      }

      let conversionTemplate = savedAssessment.conversionTemplateSnapshot ?? null;
      if (!conversionTemplate) {
        const [conversionSettings] = await db
          .select({ value: systemSettings.value })
          .from(systemSettings)
          .where(eq(systemSettings.key, "scoreConversionTemplates"))
          .limit(1);
        conversionTemplate = conversionSettings
          ? parseScoreConversionTemplatesJson(conversionSettings.value)
            .find((item) => item.id === conversionTemplateId) ?? null
          : null;
      }
      if (!conversionTemplate) {
        return res.status(409).json({ message: "Cấu hình quy đổi của bảng điểm không còn khả dụng." });
      }
      const assessment = {
        ...savedAssessment,
        conversionTemplateSnapshot: scoreConversionTemplateSchema.parse(conversionTemplate),
      };

      const [templateSettings] = await db
        .select({ value: systemSettings.value })
        .from(systemSettings)
        .where(eq(systemSettings.key, "scoreSheetTemplates"))
        .limit(1);
      const currentTemplates = templateSettings
        ? z.array(scoreSheetTemplateSchema).parse(JSON.parse(templateSettings.value))
        : [];
      const currentTemplate = currentTemplates.find(
        (template) => template.id === assessment.scoreSheetTemplateId,
      ) ?? null;

      const attempts = await db
        .select()
        .from(scoreSheetAssessmentStudentAttempts)
        .where(and(
          eq(scoreSheetAssessmentStudentAttempts.assessmentId, assessment.id),
          eq(scoreSheetAssessmentStudentAttempts.classSessionId, sessionId.data),
          eq(scoreSheetAssessmentStudentAttempts.studentId, studentId.data),
        ))
        .orderBy(scoreSheetAssessmentStudentAttempts.attemptNumber);
      const publishedAttempts = attempts.filter((attempt) => {
        if (session.published) return true;
        const storedResult = attempt.result && typeof attempt.result === "object"
          ? attempt.result as Record<string, unknown>
          : {};
        const publicationMeta = storedResult[SCORE_SHEET_ASSESSMENT_PUBLICATION_META_KEY];
        return Boolean(
          publicationMeta
          && typeof publicationMeta === "object"
          && (publicationMeta as Record<string, unknown>).publishedToStudent === true,
        );
      });
      if (publishedAttempts.length === 0) {
        return res.status(404).json({ message: "Chưa có điểm được công bố cho học viên này." });
      }

      const criteriaIds = currentTemplate?.evaluationCriteriaIds
        ?? assessment.templateSnapshot.evaluationCriteriaIds;
      const uniqueCriteriaIds = Array.from(new Set(criteriaIds));
      const [criteriaRows, subCriteriaRows] = uniqueCriteriaIds.length > 0
        ? await Promise.all([
          db.select().from(evaluationCriteria)
            .where(inArray(evaluationCriteria.id, uniqueCriteriaIds)),
          db.select().from(evaluationSubCriteria)
            .where(inArray(evaluationSubCriteria.criteriaId, uniqueCriteriaIds))
            .orderBy(evaluationSubCriteria.name),
        ])
        : [[], []];
      const criteriaById = new Map(
        criteriaRows.map((criterion) => [criterion.id, { id: criterion.id, name: criterion.name }]),
      );
      const configuredEvaluationCriteria = uniqueCriteriaIds.flatMap((criteriaId) => {
        const criterion = criteriaById.get(criteriaId);
        if (!criterion) return [];
        return [{
          id: criterion.id,
          name: criterion.name,
          subCriteria: subCriteriaRows
            .filter((subCriterion) => subCriterion.criteriaId === criteriaId)
            .map((subCriterion) => ({
              id: subCriterion.id,
              name: subCriterion.name,
              criteriaId: subCriterion.criteriaId,
              itemType: subCriterion.itemType,
              inputType: subCriterion.inputType,
              parentId: subCriterion.parentId,
              minChecked: subCriterion.minChecked,
              maxChecked: subCriterion.maxChecked,
            })),
        }];
      });

      return res.json({
        assessment: {
          id: assessment.id,
          code: assessment.code,
          name: assessment.name,
          attemptCount: assessment.attemptCount,
          scoringPolicy: assessment.scoringPolicy,
          scoreDeadlineAt: resolveScoreSheetAssessmentDeadlineAt(
            assessment,
            session.sessionDate,
            session.sessionStartTime,
            currentTemplate?.scoreDeadlineOffsetMinutes,
          ),
          templateSnapshot: assessment.templateSnapshot,
          conversionTemplateSnapshot: assessment.conversionTemplateSnapshot,
        },
        evaluationCriteria: configuredEvaluationCriteria,
        attempts: publishedAttempts.map((attempt) => {
          const storedResult = attempt.result && typeof attempt.result === "object"
            ? attempt.result as Record<string, unknown>
            : {};
          return {
            attemptNumber: attempt.attemptNumber,
            partScores: attempt.partScores,
            skillScores: attempt.skillScores,
            notes: attempt.notes,
            evaluationResponses: scoreSheetAssessmentEvaluationResponsesSchema.parse(
              storedResult.evaluationResponses ?? {},
            ),
            result: scoreSheetAssessmentAttemptResultSchema.parse(attempt.result),
            createdAt: attempt.createdAt,
            updatedAt: attempt.updatedAt,
          };
        }),
      });
    } catch (err: any) {
      console.error("Customer conversion score entry load error:", err);
      const status = err instanceof z.ZodError ? 400 : 500;
      return res.status(status).json({ message: err.message || "Lỗi khi tải chi tiết bảng điểm quy đổi." });
    }
  });

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

      function normalizeStudentReviewData(raw: any): {
        criteriaId?: string;
        criteriaName: string;
        groupName?: string;
        comment: string;
        inputType: "text" | "checkbox";
        checked?: boolean;
      }[] {
        if (!raw) return [];
        if (Array.isArray(raw)) {
          return raw.map((item: any) => ({
            criteriaId: item.subCriteriaId || item.criteriaId,
            criteriaName: item.subCriteriaName || item.criteriaName || "—",
            ...(item.groupName ? { groupName: item.groupName } : {}),
            comment: item.comment || "",
            inputType: item.inputType === "checkbox" ? "checkbox" : "text",
            ...(item.inputType === "checkbox" ? { checked: item.checked === true } : {}),
          }));
        }
        if (typeof raw === "object") {
          const items: {
            criteriaId?: string;
            criteriaName: string;
            groupName?: string;
            comment: string;
            inputType: "text" | "checkbox";
            checked?: boolean;
          }[] = [];
          for (const teacherData of Object.values(raw)) {
            const td = teacherData as any;
            if (td?.items && Array.isArray(td.items)) {
              for (const item of td.items) {
                items.push({
                  criteriaId: item.subCriteriaId || item.criteriaId,
                  criteriaName: item.subCriteriaName || item.criteriaName || "—",
                  ...(item.groupName ? { groupName: item.groupName } : {}),
                  comment: item.comment || "",
                  inputType: item.inputType === "checkbox" ? "checkbox" : "text",
                  ...(item.inputType === "checkbox" ? { checked: item.checked === true } : {}),
                });
              }
            } else if (td?.subNotes && typeof td.subNotes === "object") {
              for (const [subId, note] of Object.entries(td.subNotes)) {
                if (note) {
                  items.push({
                    criteriaId: subId,
                    criteriaName: subId,
                    comment: String(note),
                    inputType: "text",
                  });
                }
              }
            }
            // If no items but criteriaRatings exist, surface ratings as items
            if ((!td?.items || td.items.length === 0) && Object.keys(td?.criteriaRatings || {}).length > 0) {
              for (const [cId] of Object.entries(td.criteriaRatings)) {
                items.push({
                  criteriaId: cId,
                  criteriaName: cId,
                  comment: "",
                  inputType: "text",
                });
              }
            }
          }
          return items;
        }
        return [];
      }

      const rows = result.rows.map((row: any) => {
        const raw = row.review_data;
        const entries = raw && typeof raw === "object" && !Array.isArray(raw) ? Object.values(raw) as any[] : [];
        const ratings = entries
          .flatMap((entry) => Object.values(entry?.criteriaRatings || {}))
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0);
        const firstItem = entries
          .flatMap((entry) => Array.isArray(entry?.items) ? entry.items : [])
          .find((item) => item?.criteriaName || item?.subCriteriaName);

        return {
          id: row.id,
          studentName: row.student_name,
          className: row.class_name,
          sessionIndex: row.session_index,
          sessionDate: row.session_date,
          shiftName: row.shift_name || "—",
          startTime: row.start_time || null,
          endTime: row.end_time || null,
          criteriaName: firstItem?.criteriaName || null,
          overallRating: ratings[0] ?? null,
          reviewData: normalizeStudentReviewData(raw),
          reviewPublished: row.review_published,
        };
      }).filter((row) => row.reviewData.some(item => item.comment) || (row.overallRating != null && row.overallRating > 0));

      // Keep the customer detail view in the same order as the teacher form.
      // Review JSON follows the order in which the teacher submitted items,
      // which is not necessarily the configured group/criterion order.
      const criteriaIds = [...new Set(result.rows.flatMap((row: any) => {
        const raw = row.review_data;
        if (!raw || typeof raw !== "object") return [];
        return Object.values(raw).flatMap((entry: any) =>
          Array.isArray(entry?.items) ? entry.items.map((item: any) => item.criteriaId).filter(Boolean) : []
        );
      }))];
      if (criteriaIds.length > 0) {
        const configuredItems = await db.select({
          id: evaluationSubCriteria.id,
          name: evaluationSubCriteria.name,
          itemType: evaluationSubCriteria.itemType,
          parentId: evaluationSubCriteria.parentId,
          criteriaId: evaluationSubCriteria.criteriaId,
        }).from(evaluationSubCriteria)
          .where(inArray(evaluationSubCriteria.criteriaId, criteriaIds))
          .orderBy(evaluationSubCriteria.name);
        const itemOrder = new Map(configuredItems.map((item, index) => [item.id, index]));
        const groupOrder = new Map(
          configuredItems
            .filter((item) => item.itemType === "heading")
            .map((item, index) => [item.name, index])
        );
        for (const row of rows) {
          row.reviewData.sort((a: any, b: any) => {
            const aGroup = a.groupName ? (groupOrder.get(a.groupName) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
            const bGroup = b.groupName ? (groupOrder.get(b.groupName) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
            if (aGroup !== bGroup) return aGroup - bGroup;
            return (itemOrder.get(a.criteriaId) ?? Number.MAX_SAFE_INTEGER)
              - (itemOrder.get(b.criteriaId) ?? Number.MAX_SAFE_INTEGER);
          });
        }
      }

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

      const configuredSubCriteria = await db.select({
        id: evaluationSubCriteria.id,
        name: evaluationSubCriteria.name,
        parentId: evaluationSubCriteria.parentId,
        itemType: evaluationSubCriteria.itemType,
      }).from(evaluationSubCriteria).orderBy(evaluationSubCriteria.name);
      const configuredSubCriteriaById = new Map(configuredSubCriteria.map((item) => [item.id, item]));
      const groupNameById = new Map(
        configuredSubCriteria
          .filter((item) => item.itemType === "heading")
          .map((item) => [item.id, item.name])
      );
      const groupOrder = new Map(
        configuredSubCriteria
          .filter((item) => item.itemType === "heading")
          .map((item, index) => [item.name, index])
      );
      const itemOrder = new Map(configuredSubCriteria.map((item, index) => [item.id, index]));
      const configuredCriteria = await db.select({
        id: evaluationCriteria.id,
        name: evaluationCriteria.name,
      }).from(evaluationCriteria);
      const criteriaNameById = new Map(configuredCriteria.map((item) => [item.id, item.name]));

      function normalizeReviewData(raw: any): {
        criteriaId?: string;
        criteriaName: string;
        groupName?: string;
        comment: string;
        inputType: "text" | "checkbox";
        checked?: boolean;
      }[] {
        const normalizeItem = (item: any) => {
          const criteriaId = item.subCriteriaId || item.criteriaId;
          const configured = configuredSubCriteriaById.get(criteriaId);
          const inputType = item.inputType === "checkbox" ? "checkbox" : "text";
          return {
            criteriaId,
            criteriaName: item.subCriteriaName || item.criteriaName || configured?.name || "—",
            ...(item.groupName || configured?.parentId && groupNameById.get(configured.parentId)
              ? { groupName: item.groupName || groupNameById.get(configured?.parentId as string) }
              : {}),
            comment: item.comment || "",
            inputType,
            ...(inputType === "checkbox" ? { checked: item.checked === true } : {}),
          };
        };

        if (!raw) return [];
        if (Array.isArray(raw)) {
          return raw.map(normalizeItem);
        }
        if (typeof raw === "object") {
          const items: ReturnType<typeof normalizeItem>[] = [];
          for (const teacherData of Object.values(raw)) {
            const td = teacherData as any;
            if (td?.items && Array.isArray(td.items)) {
              for (const item of td.items) {
                items.push(normalizeItem(item));
              }
            } else if (td?.subNotes && typeof td.subNotes === "object") {
              for (const [subId, note] of Object.entries(td.subNotes)) {
                if (note) {
                  items.push(normalizeItem({
                    criteriaId: subId,
                    comment: String(note),
                  }));
                }
              }
            }
          }
          return items;
        }
        return [];
      }

      const rows = result.rows.map((row: any) => {
        const raw = row.review_data;
        const entries = raw && typeof raw === "object" && !Array.isArray(raw)
          ? Object.values(raw) as any[]
          : [];
        const rawItems = Array.isArray(raw)
          ? raw
          : entries.flatMap((entry) => Array.isArray(entry?.items) ? entry.items : []);
        const firstItem = rawItems.find((item: any) => item?.criteriaId || item?.subCriteriaId);
        const criteriaId = firstItem?.criteriaId || entries
          .flatMap((entry) => Object.keys(entry?.criteriaRatings || {}))
          .find(Boolean);
        const ratings = entries
          .flatMap((entry) => Object.values(entry?.criteriaRatings || {}))
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0);
        const reviewData = normalizeReviewData(raw);

        reviewData.sort((a, b) => {
          const aGroup = a.groupName ? (groupOrder.get(a.groupName) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
          const bGroup = b.groupName ? (groupOrder.get(b.groupName) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
          if (aGroup !== bGroup) return aGroup - bGroup;
          return (itemOrder.get(a.criteriaId) ?? Number.MAX_SAFE_INTEGER)
            - (itemOrder.get(b.criteriaId) ?? Number.MAX_SAFE_INTEGER);
        });

        return {
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
          criteriaName: criteriaNameById.get(criteriaId) || firstItem?.criteriaName || null,
          overallRating: ratings[0] ?? null,
          reviewData,
        };
      });

      res.json({ rows, total, page: pageNum, pageSize: size });
    } catch (err: any) {
      console.error("All session reviews error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải nhận xét" });
    }
  });

}
