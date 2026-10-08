import type { Express } from "express";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../db";
import {
  parseScoreConversionTemplatesJson,
  scoreConversionTemplateInputSchema,
  scoreConversionTemplateSchema,
  type ScoreConversionTemplate,
  type ScoreConversionTemplateInput,
} from "@shared/score-conversion";
import {
  scoreSheetTemplateInputSchema,
  scoreSheetTemplateSchema,
  type ScoreSheetTemplate,
  type ScoreSheetTemplateInput,
} from "@shared/score-sheet-template";
import {
  resolveScoreSheetAssessmentDeadlineAt,
  scoreSheetAssessmentInputSchema,
  scoreSheetAssessmentSchema,
  type ScoreSheetAssessment,
  type ParsedScoreSheetAssessmentInput,
} from "@shared/score-sheet-assessment";
import {
  calculateScoreSheetAssessmentAttemptResult,
  selectScoreSheetAssessmentAttemptSummary,
} from "@shared/score-sheet-assessment-scoring";
import { isScoreSheetAssessmentStudentPublished } from "@shared/score-sheet-assessment-publication";
import {
  MY_SPACE_CALENDAR_RESOURCE,
  normalizeMySpaceCalendarPermissions,
} from "@shared/my-space-calendar-permissions";
import { eq, and, sql, notExists, inArray, ne, isNull } from "drizzle-orm";
import {
  staff, staffAssignments, departments, users, roles, students, shiftTemplates, classes, studentClasses, centerConfig,
  studentSessions, scoreSheetAssessmentStudentAttempts,
  courses, courseFeePackages, coursePrograms, courseProgramContents, activityLogs,
} from "@shared/schema";
import { emitToAll } from "../lib/ws-hub";
import { cacheGet, cacheSet, cacheInvalidate } from "../lib/simple-cache";
import { notificationService } from "../application/notification/services/NotificationService";
import {
  getAttendanceFeeRules,
  upsertAttendanceFeeRule,
  deleteAttendanceFeeRule,
} from "../storage/attendance-fee-rule.storage";
import * as courseStorage from "../storage/course.storage";
import { createCourseAuditLog, getCourseAuditLogs } from "../storage/course-audit-log.storage";
import { createActivityLog, getStaffHistory } from "../storage/activity-log.storage";

function getBangkokDateOnly(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const SCORE_CONVERSION_SETTINGS_KEY = "scoreConversionTemplates";
const SCORE_SHEET_TEMPLATE_SETTINGS_KEY = "scoreSheetTemplates";
const SCORE_SHEET_ASSESSMENTS_SETTINGS_KEY = "scoreSheetAssessments";
const SCORE_CONVERSION_PERMISSION_RESOURCE = "/assessments#list";

function parseScoreConversionTemplates(value: string): ScoreConversionTemplate[] {
  return parseScoreConversionTemplatesJson(value);
}

async function readScoreConversionTemplates(): Promise<ScoreConversionTemplate[]> {
  const { systemSettings } = await import("@shared/schema");
  const [row] = await db.select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, SCORE_CONVERSION_SETTINGS_KEY))
    .limit(1);
  if (!row) return [];
  return parseScoreConversionTemplates(row.value);
}

async function mutateScoreConversionTemplates(
  mutate: (templates: ScoreConversionTemplate[]) => {
    templates: ScoreConversionTemplate[];
    result: ScoreConversionTemplate | null;
  },
): Promise<ScoreConversionTemplate | null> {
  const { systemSettings } = await import("@shared/schema");
  return db.transaction(async (tx) => {
    await tx.insert(systemSettings)
      .values({ key: SCORE_CONVERSION_SETTINGS_KEY, value: "[]" })
      .onConflictDoNothing();

    const [row] = await tx.select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, SCORE_CONVERSION_SETTINGS_KEY))
      .for("update")
      .limit(1);
    if (!row) throw new Error("Không thể tải cấu hình bảng điểm quy đổi.");

    const templates = parseScoreConversionTemplates(row.value);
    const result = mutate(templates);
    await tx.update(systemSettings)
      .set({ value: JSON.stringify(result.templates), updatedAt: new Date() })
      .where(eq(systemSettings.key, SCORE_CONVERSION_SETTINGS_KEY));
    return result.result;
  });
}

function parseScoreSheetTemplates(value: string): ScoreSheetTemplate[] {
  return z.array(scoreSheetTemplateSchema).parse(JSON.parse(value));
}

async function readScoreSheetTemplates(): Promise<ScoreSheetTemplate[]> {
  const { systemSettings } = await import("@shared/schema");
  const [row] = await db.select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, SCORE_SHEET_TEMPLATE_SETTINGS_KEY))
    .limit(1);
  if (!row) return [];
  return parseScoreSheetTemplates(row.value);
}

async function mutateScoreSheetTemplates(
  mutate: (templates: ScoreSheetTemplate[]) => {
    templates: ScoreSheetTemplate[];
    result: ScoreSheetTemplate | null;
  },
): Promise<ScoreSheetTemplate | null> {
  const { systemSettings } = await import("@shared/schema");
  return db.transaction(async (tx) => {
    await tx.insert(systemSettings)
      .values({ key: SCORE_SHEET_TEMPLATE_SETTINGS_KEY, value: "[]" })
      .onConflictDoNothing();

    const [row] = await tx.select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, SCORE_SHEET_TEMPLATE_SETTINGS_KEY))
      .for("update")
      .limit(1);
    if (!row) throw new Error("Không thể tải cấu hình bảng điểm mẫu.");

    const templates = parseScoreSheetTemplates(row.value);
    const result = mutate(templates);
    await tx.update(systemSettings)
      .set({ value: JSON.stringify(result.templates), updatedAt: new Date() })
      .where(eq(systemSettings.key, SCORE_SHEET_TEMPLATE_SETTINGS_KEY));
    return result.result;
  });
}

function parseScoreSheetAssessments(value: string): ScoreSheetAssessment[] {
  return z.array(scoreSheetAssessmentSchema).parse(JSON.parse(value));
}

async function readScoreSheetAssessments(): Promise<ScoreSheetAssessment[]> {
  const { systemSettings } = await import("@shared/schema");
  const [row] = await db.select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, SCORE_SHEET_ASSESSMENTS_SETTINGS_KEY))
    .limit(1);
  if (!row) return [];
  return parseScoreSheetAssessments(row.value);
}

type ScoreTemplateUsage = {
  scoreSheetTemplateIdsInUse: string[];
  scoreConversionTemplateIdsInUse: string[];
};

async function readScoreTemplateUsage(executor: any = db): Promise<ScoreTemplateUsage> {
  const { classSessions, systemSettings } = await import("@shared/schema");
  const [assessmentSettings] = await executor.select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, SCORE_SHEET_ASSESSMENTS_SETTINGS_KEY))
    .for("share")
    .limit(1);
  const assessments = assessmentSettings
    ? parseScoreSheetAssessments(assessmentSettings.value)
    : [];
  const assignedRows = await executor.select({
    assessmentId: classSessions.scoreSheetAssessmentId,
  })
    .from(classSessions)
    .where(sql`${classSessions.scoreSheetAssessmentId} IS NOT NULL`);
  const assignedAssessmentIds = new Set<string>(
    (assignedRows as Array<{ assessmentId: string | null }>)
      .map(({ assessmentId }) => assessmentId)
      .filter((assessmentId): assessmentId is string => Boolean(assessmentId)),
  );
  const assignedAssessments = assessments.filter((assessment) =>
    assignedAssessmentIds.has(assessment.id));

  return {
    scoreSheetTemplateIdsInUse: Array.from(new Set(
      assignedAssessments.map((assessment) => assessment.scoreSheetTemplateId),
    )),
    scoreConversionTemplateIdsInUse: Array.from(new Set(
      assignedAssessments
        .map((assessment) => assessment.templateSnapshot.scoreConversionTemplateId)
        .filter((templateId): templateId is string => Boolean(templateId)),
    )),
  };
}

async function deleteScoreConversionTemplateIfUnassigned(
  id: string,
): Promise<"deleted" | "in_use" | "not_found"> {
  const { systemSettings } = await import("@shared/schema");
  return db.transaction(async (tx) => {
    await tx.insert(systemSettings)
      .values({ key: SCORE_CONVERSION_SETTINGS_KEY, value: "[]" })
      .onConflictDoNothing();
    const [row] = await tx.select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, SCORE_CONVERSION_SETTINGS_KEY))
      .for("update")
      .limit(1);
    if (!row) return "not_found";

    const templates = parseScoreConversionTemplates(row.value);
    if (!templates.some((template) => template.id === id)) return "not_found";
    const usage = await readScoreTemplateUsage(tx);
    if (usage.scoreConversionTemplateIdsInUse.includes(id)) return "in_use";

    await tx.update(systemSettings)
      .set({
        value: JSON.stringify(templates.filter((template) => template.id !== id)),
        updatedAt: new Date(),
      })
      .where(eq(systemSettings.key, SCORE_CONVERSION_SETTINGS_KEY));
    return "deleted";
  });
}

async function deleteScoreSheetTemplateIfUnassigned(
  id: string,
): Promise<"deleted" | "in_use" | "not_found"> {
  const { systemSettings } = await import("@shared/schema");
  return db.transaction(async (tx) => {
    await tx.insert(systemSettings)
      .values({ key: SCORE_SHEET_TEMPLATE_SETTINGS_KEY, value: "[]" })
      .onConflictDoNothing();
    const [row] = await tx.select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, SCORE_SHEET_TEMPLATE_SETTINGS_KEY))
      .for("update")
      .limit(1);
    if (!row) return "not_found";

    const templates = parseScoreSheetTemplates(row.value);
    if (!templates.some((template) => template.id === id)) return "not_found";
    const usage = await readScoreTemplateUsage(tx);
    if (usage.scoreSheetTemplateIdsInUse.includes(id)) return "in_use";

    await tx.update(systemSettings)
      .set({
        value: JSON.stringify(templates.filter((template) => template.id !== id)),
        updatedAt: new Date(),
      })
      .where(eq(systemSettings.key, SCORE_SHEET_TEMPLATE_SETTINGS_KEY));
    return "deleted";
  });
}

async function mutateScoreSheetAssessments(
  mutate: (assessments: ScoreSheetAssessment[]) => {
    assessments: ScoreSheetAssessment[];
    result: ScoreSheetAssessment | null;
  },
  afterMutate?: (tx: any, result: ScoreSheetAssessment) => Promise<void>,
): Promise<ScoreSheetAssessment | null> {
  const { systemSettings } = await import("@shared/schema");
  return db.transaction(async (tx) => {
    await tx.insert(systemSettings)
      .values({ key: SCORE_SHEET_ASSESSMENTS_SETTINGS_KEY, value: "[]" })
      .onConflictDoNothing();

    const [row] = await tx.select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, SCORE_SHEET_ASSESSMENTS_SETTINGS_KEY))
      .for("update")
      .limit(1);
    if (!row) throw new Error("Không thể tải danh sách bảng điểm.");

    const assessments = parseScoreSheetAssessments(row.value);
    const result = mutate(assessments);
    if (result.result && afterMutate) await afterMutate(tx, result.result);
    await tx.update(systemSettings)
      .set({ value: JSON.stringify(result.assessments), updatedAt: new Date() })
      .where(eq(systemSettings.key, SCORE_SHEET_ASSESSMENTS_SETTINGS_KEY));
    return result.result;
  });
}

async function areManualScoreSheetStudentsAccessible(
  req: any,
  input: ParsedScoreSheetAssessmentInput,
): Promise<boolean> {
  if (req.isSuperAdmin) return true;
  const [staffRecord] = await db
    .select({ id: staff.id })
    .from(staff)
    .where(eq(staff.userId, req.user.id))
    .limit(1);
  if (!staffRecord) return false;

  const classConstraint = input.manualSelectionMode === "class" && input.manualClassId
    ? sql`AND c.id = ${input.manualClassId}::uuid`
    : sql``;
  const result = await db.execute(sql`
    SELECT DISTINCT sc.student_id
    FROM student_classes sc
    JOIN classes c ON c.id = sc.class_id
    WHERE sc.status = 'active'
      AND sc.student_id = ANY(${input.manualStudentIds}::uuid[])
      ${classConstraint}
      AND (
        ${staffRecord.id} = ANY(c.teacher_ids)
        OR ${staffRecord.id} = ANY(c.manager_ids)
        OR EXISTS (
          SELECT 1
          FROM class_sessions cs
          WHERE cs.class_id = c.id
            AND (
              cs.teacher_ids @> ARRAY[${staffRecord.id}]::uuid[]
              OR EXISTS (
                SELECT 1
                FROM class_session_teacher_assignments csta
                WHERE csta.class_session_id = cs.id
                  AND csta.teacher_id = ${staffRecord.id}
              )
            )
        )
      )
      AND EXISTS (
        SELECT 1
        FROM staff_assignments sa
        WHERE sa.staff_id = ${staffRecord.id}
          AND sa.location_id = c.location_id
      )
  `);
  return new Set(result.rows.map((row: any) => String(row.student_id))).size
    === input.manualStudentIds.length;
}

function hasScoreSheetAssessmentInput(values: {
  skillScores: Record<string, number | null>;
  partScores: Record<string, Record<string, number | null>>;
  notes: Record<string, Record<string, string>>;
  evaluationResponses: Record<string, string | boolean | null>;
}): boolean {
  return Object.values(values.skillScores).some((value) => value !== null)
    || Object.values(values.partScores).some((parts) =>
      Object.values(parts).some((value) => value !== null),
    )
    || Object.values(values.notes).some((parts) =>
      Object.values(parts).some((value) => value.trim().length > 0),
    )
    || Object.values(values.evaluationResponses).some((value) => value !== null);
}

function validateScoreSheetTemplateConversion(
  input: ScoreSheetTemplateInput,
  conversionTemplates: ScoreConversionTemplate[],
): void {
  if (!input.scoreConversionTemplateId) {
    if (input.skills.some((skill) => skill.sectionId !== null)) {
      const error: any = new Error("Kỹ năng tự tạo không được liên kết với section của bảng quy đổi.");
      error.code = "SCORE_SHEET_TEMPLATE_SKILLS_MISMATCH";
      throw error;
    }
    return;
  }
  const conversion = conversionTemplates.find((item) => item.id === input.scoreConversionTemplateId);
  if (!conversion) {
    const error: any = new Error("Không tìm thấy bảng quy đổi đã chọn.");
    error.code = "SCORE_SHEET_TEMPLATE_CONVERSION_MISSING";
    throw error;
  }

  const sectionIds = new Set(conversion.sections.map((section) => section.id));
  if (
    input.skills.length !== sectionIds.size
    || input.skills.some((skill) => !skill.sectionId || !sectionIds.has(skill.sectionId))
  ) {
    const error: any = new Error("Danh sách kỹ năng không khớp với bảng quy đổi đã chọn.");
    error.code = "SCORE_SHEET_TEMPLATE_SKILLS_MISMATCH";
    throw error;
  }
}

function sameScoreConversionType(
  template: ScoreConversionTemplate,
  input: ScoreConversionTemplateInput,
): boolean {
  if (template.typeKey !== input.typeKey) return false;
  if (input.typeKey !== "custom") return true;
  return template.typeName.trim().toLocaleLowerCase() === input.typeName.trim().toLocaleLowerCase();
}

async function getScoreConversionPermissions(req: any) {
  if (req.isSuperAdmin) {
    return { canView: true, canViewAll: true, canCreate: true, canEdit: true, canDelete: true };
  }
  return storage.getEffectivePermissions(req.roleIds ?? [], SCORE_CONVERSION_PERMISSION_RESOURCE);
}

function sanitizeDateField(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return null;
}

function requestUserId(req: any): string | null {
  return req.user?.id ?? null;
}

function staffHistorySnapshot(data: any, staffId?: string | null) {
  const { password, omicallPasswords, ...safe } = data ?? {};
  return JSON.stringify({ ...safe, staffId: staffId ?? data?.id ?? null });
}

function staffHistoryLocationId(data: any): string | null {
  return data?.locationIds?.[0] ?? data?.assignments?.[0]?.locationId ?? null;
}

async function recordCourseAudit(req: any, data: {
  scope: "courses" | "programs" | "library";
  entityType: "course" | "fee_package" | "program" | "content";
  entityId?: string | null;
  entityCode?: string | null;
  entityName?: string | null;
  action: "created" | "updated" | "deleted";
  locationId?: string | null;
  oldContent?: unknown;
  newContent?: unknown;
}) {
  try {
    await createCourseAuditLog({
      ...data,
      userId: requestUserId(req),
      oldContent: data.oldContent ?? null,
      newContent: data.newContent ?? null,
    });
  } catch (error) {
    // Audit failure must not turn a successful course mutation into a failed request.
    console.error("[course-audit] failed to record:", error);
  }
}

async function recordEducationConfigAudit(req: any, data: {
  resource: "classroom" | "subject" | "evaluation_criteria" | "evaluation_sub_criteria" | "shift" | "attendance_fee" | "attendance_limit" | "score_category" | "score_sheet" | "score_conversion_template" | "online_learning" | "location" | "department" | "role" | "permission" | "holiday";
  action: "created" | "updated" | "deleted";
  scope?: "education-config" | "settings";
  entityId?: string | null;
  locationId?: string | null;
  oldContent?: unknown;
  newContent?: unknown;
}) {
  try {
    const enrichAttendanceRoles = async (content: unknown) => {
      if (data.resource !== "attendance_limit" || !content || typeof content !== "object") return content;
      const roleIds = Array.isArray((content as any).roleIds) ? (content as any).roleIds : [];
      if (!roleIds.length) return { ...(content as any), roleNames: [] };
      const roleRows = await db.select({ id: roles.id, name: roles.name })
        .from(roles)
        .where(inArray(roles.id, roleIds));
      const names = roleIds.map((id: string) => roleRows.find(role => role.id === id)?.name).filter(Boolean);
      return { ...(content as any), roleNames: names };
    };
    const enrichScoreSheetItems = async (content: unknown) => {
      if (data.resource !== "score_sheet" || !content || typeof content !== "object") return content;
      const items = Array.isArray((content as any).items) ? (content as any).items : [];
      const categoryIds = items.map((item: any) => item?.categoryId).filter(Boolean);
      if (!categoryIds.length) return { ...(content as any), items: [] };
      const { scoreCategories } = await import("@shared/schema");
      const categories = await db.select({ id: scoreCategories.id, name: scoreCategories.name })
        .from(scoreCategories).where(inArray(scoreCategories.id, categoryIds));
      return {
        ...(content as any),
        items: items.map((item: any) => ({
          categoryName: item.categoryName ?? categories.find(category => category.id === item.categoryId)?.name ?? "Danh mục điểm",
          formula: item.formula ?? "",
        })),
      };
    };
    const oldContent = await enrichScoreSheetItems(await enrichAttendanceRoles(data.oldContent));
    const newContent = await enrichScoreSheetItems(await enrichAttendanceRoles(data.newContent));
    await createActivityLog({
      userId: requestUserId(req),
      locationId: data.locationId ?? null,
      classId: null,
      action: `${data.scope ?? "education-config"}.${data.resource}.${data.action}`,
      oldContent: oldContent == null ? null : JSON.stringify(oldContent),
      newContent: newContent == null ? null : JSON.stringify(newContent),
    });
  } catch (error) {
    console.error("[education-config-audit] failed to record:", error);
  }
}

async function getEducationConfigSnapshot(resource: string, path: string, body?: any): Promise<unknown | null> {
  if (resource === "permission") {
    if (!body?.roleId || !body?.resource) return null;
    try {
      const { rolePermissions } = await import("@shared/schema");
      const [row] = await db.select().from(rolePermissions)
        .where(and(eq(rolePermissions.roleId, body.roleId), eq(rolePermissions.resource, body.resource))).limit(1);
      return row ?? null;
    } catch {
      return null;
    }
  }
  const id = path.split("/").filter(Boolean).pop();
  if (resource === "score_conversion_template") {
    if (!id || id === "score-conversion-templates") return null;
    try {
      const templates = await readScoreConversionTemplates();
      return templates.find((template) => template.id === id) ?? null;
    } catch (error) {
      console.error("[education-config-audit] failed to snapshot score conversion template:", error);
      return null;
    }
  }
  if (resource === "attendance_limit" && id === "attendance-limit") {
    try {
      const { systemSettings } = await import("@shared/schema");
      const [row] = await db.select({ value: systemSettings.value })
        .from(systemSettings)
        .where(eq(systemSettings.key, "attendanceLimit"))
        .limit(1);
      return row?.value ? JSON.parse(row.value) : null;
    } catch (error) {
      console.error("[education-config-audit] failed to snapshot attendance limit:", error);
      return null;
    }
  }
  if (!id) return null;
  const tableNames: Record<string, string> = {
    classroom: "classrooms",
    subject: "subjects",
    evaluation_criteria: "evaluationCriteria",
    evaluation_sub_criteria: "evaluationSubCriteria",
    shift: "shiftTemplates",
    score_category: "scoreCategories",
    score_sheet: "scoreSheets",
    online_learning: "onlineLearningRules",
    location: "locations",
    department: "departments",
    role: "roles",
    holiday: "publicHolidays",
  };
  const tableName = tableNames[resource];
  if (!tableName) return null;
  try {
    const schema = await import("@shared/schema") as any;
    const table = schema[tableName];
    if (!table) return null;
    const [row] = await db.select().from(table).where(eq(table.id, id)).limit(1);
    if (!row) return null;
    if (resource === "score_sheet") {
      const { scoreSheetItems, scoreCategories } = schema;
      const items = await db.select({
        categoryName: scoreCategories.name,
        formula: scoreSheetItems.formula,
      }).from(scoreSheetItems)
        .leftJoin(scoreCategories, eq(scoreSheetItems.categoryId, scoreCategories.id))
        .where(eq(scoreSheetItems.scoreSheetId, id))
        .orderBy(scoreSheetItems.order);
      return { ...row, items };
    }
    if (row.locationId) {
      const { locations } = schema;
      const [location] = await db.select({ name: locations.name }).from(locations).where(eq(locations.id, row.locationId)).limit(1);
      return { ...row, locationName: location?.name ?? null };
    }
    return row;
  } catch (error) {
    console.error("[education-config-audit] failed to snapshot:", error);
    return null;
  }
}

async function getCourseLocationId(courseId: string): Promise<string | null> {
  const [row] = await db.select({ locationId: courses.locationId }).from(courses).where(eq(courses.id, courseId)).limit(1);
  return row?.locationId ?? null;
}

async function getProgramLocationId(programId: string | null | undefined): Promise<string | null> {
  if (!programId) return null;
  const [row] = await db.select({ locationIds: coursePrograms.locationIds }).from(coursePrograms).where(eq(coursePrograms.id, programId)).limit(1);
  return row?.locationIds?.[0] ?? null;
}

async function getStaffLimitInfo(): Promise<{ limit: number | null; activeCount: number }> {
  const { systemSettings, staff, users } = await import("@shared/schema");
  const row = await db.select().from(systemSettings).where(eq(systemSettings.key, "staffLimit"));
  const limit = row.length > 0 ? parseInt(row[0].value) : null;
  const activeStaff = await db
    .select({ id: staff.id })
    .from(staff)
    .innerJoin(users, eq(staff.userId, users.id))
    .where(
      and(
        eq(staff.status, "Hoạt động"),
        eq(users.isActive, true),
        ne(users.username, "admin"),
        notExists(
          db.select({ id: staffAssignments.id })
            .from(staffAssignments)
            .innerJoin(roles, eq(staffAssignments.roleId, roles.id))
            .where(
              and(
                eq(staffAssignments.staffId, staff.id),
                inArray(roles.name, ["Học viên", "Phụ huynh"])
              )
            )
        )
      )
    );
  return { limit, activeCount: activeStaff.length };
}

export function registerConfigRoutes(app: Express): void {
  // Keep one audit trail for every mutation made from the education-config page.
  // Middleware coverage prevents newly added config endpoints from silently
  // skipping history recording.
  app.use("/api", (req, res, next) => {
    const resourceByPath: Array<[RegExp, string]> = [
      [/^\/classrooms(?:\/|$)/, "classroom"],
      [/^\/subjects(?:\/|$)/, "subject"],
      [/^\/evaluation-criteria(?:\/|$)/, "evaluation_criteria"],
      [/^\/evaluation-sub-criteria(?:\/|$)/, "evaluation_sub_criteria"],
      [/^\/shift-templates(?:\/|$)/, "shift"],
      [/^\/attendance-fee-rules(?:\/|$)/, "attendance_fee"],
      [/^\/score-categories(?:\/|$)/, "score_category"],
      [/^\/score-sheets(?:\/|$)/, "score_sheet"],
      [/^\/score-conversion-templates(?:\/|$)/, "score_conversion_template"],
      [/^\/online-learning-rules(?:\/|$)/, "online_learning"],
       [/^\/system-settings\/attendance-limit$/, "attendance_limit"],
    ];
    const settingsResourceByPath: Array<[RegExp, string]> = [
      [/^\/locations(?:\/|$)/, "location"],
      [/^\/departments(?:\/|$)/, "department"],
      [/^\/roles(?:\/|$)/, "role"],
      [/^\/role-permissions$/, "permission"],
      [/^\/public-holidays(?:\/|$)/, "holiday"],
    ];
    const match = resourceByPath.find(([pattern]) => pattern.test(req.path));
    const settingsMatch = settingsResourceByPath.find(([pattern]) => pattern.test(req.path));
    const action = req.method === "POST" ? "created"
      : req.method === "DELETE" ? "deleted"
      : req.method === "PUT" || req.method === "PATCH" ? "updated"
      : null;
     // Permission changes are batched by the UI so one role-editing session
     // creates one audit entry instead of one entry per checkbox.
     if ((!match && !settingsMatch) || !action || (settingsMatch?.[1] === "permission" && Array.isArray(req.body?.permissions))) return next();
    const auditMatch = match ?? settingsMatch!;
    const scope = match ? "education-config" as const : "settings" as const;

    void (async () => {
      const oldContent = action === "created" ? null : await getEducationConfigSnapshot(auditMatch[1], req.path, req.body);
      res.on("finish", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return;
        void recordEducationConfigAudit(req, {
           resource: auditMatch[1] as any,
           scope,
           action: action as "created" | "updated" | "deleted",
           entityId: typeof (req.params as any)?.id === "string" ? (req.params as any).id : null,
           locationId: req.body?.locationId ?? (oldContent as any)?.locationId ?? null,
          oldContent,
          newContent: action === "deleted" ? null : req.body,
        });
      });
      next();
    })();
  });

  // Dashboard
  app.get(api.dashboard.stats.path, async (req, res) => {
    const stats = await storage.getDashboardStats(req.allowedLocationIds, req.isSuperAdmin);
    res.json(stats);
  });

  // Locations
  app.get(api.locations.list.path, async (req, res) => {
    let results = await storage.getLocations();
    if (!req.isSuperAdmin) {
      results = results.filter(loc => req.allowedLocationIds.includes(loc.id));
    }
    res.json(results);
  });

  app.get(api.locations.get.path, async (req, res) => {
    const loc = await storage.getLocation(req.params.id);
    if (!loc) return res.status(404).json({ message: "Not found" });
    if (!req.isSuperAdmin && !req.allowedLocationIds.includes(loc.id)) {
      return res.status(403).json({ message: "Access denied" });
    }
    res.json(loc);
  });

  app.post(api.locations.create.path, async (req, res) => {
    try {
      const input = api.locations.create.input.parse(req.body);
      const loc = await storage.createLocation(input);

      // Nếu người tạo không phải super admin → tự động gán cơ sở mới vào staffAssignments
      // để họ có thể nhìn thấy dữ liệu thuộc cơ sở vừa tạo ngay lập tức
      if (!req.isSuperAdmin && req.staffId) {
        await db.insert(staffAssignments).values({
          staffId: req.staffId,
          locationId: loc.id,
        });
      }

      cacheInvalidate("config:departments");
      cacheInvalidate("config:staff");
      res.status(201).json(loc);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      if (err?.code === "23505" && err?.constraint === "locations_code_unique") {
        return res.status(409).json({ message: "Mã cơ sở đã tồn tại. Vui lòng chọn mã khác." });
      }
      throw err;
    }
  });

  app.put(api.locations.update.path, async (req, res) => {
    try {
      const input = api.locations.update.input.parse(req.body);
      const loc = await storage.updateLocation(req.params.id, input);
      cacheInvalidate("config:departments");
      cacheInvalidate("config:staff");
      res.json(loc);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      if (err?.code === "23505" && err?.constraint === "locations_code_unique") {
        return res.status(409).json({ message: "Mã cơ sở đã tồn tại. Vui lòng chọn mã khác." });
      }
      throw err;
    }
  });

  app.get("/api/locations/:id/usage", async (req, res) => {
    const inUse = await storage.checkLocationUsage(req.params.id);
    res.json({ inUse });
  });

  app.delete(api.locations.delete.path, async (req, res) => {
    try {
      await storage.deleteLocation(req.params.id, req.isSuperAdmin);
      cacheInvalidate("config:departments");
      cacheInvalidate("config:staff");
      res.status(204).send();
    } catch (err: any) {
      if (err.code === "LOCATION_IN_USE") {
        return res.status(409).json({ message: err.message });
      }
      throw err;
    }
  });

  // Departments & Roles
  app.get(api.departments.list.path, async (req, res) => {
    const locKey = req.isSuperAdmin ? "super" : (req.allowedLocationIds ?? []).slice().sort().join(",");
    const cacheKey = `config:departments:${locKey}`;
    const cached = cacheGet<any[]>(cacheKey);
    if (cached) return res.json(cached);
    const depts = await storage.getDepartments(req.allowedLocationIds, req.isSuperAdmin);
    cacheSet(cacheKey, depts, 5 * 60_000);
    res.json(depts);
  });

  app.post(api.departments.create.path, async (req, res) => {
    try {
      const input = api.departments.create.input.parse(req.body);
      const existing = await storage.getDepartmentByName(input.name);
      if (existing) return res.status(409).json({ message: `Phòng ban "${input.name}" đã tồn tại.` });
      const dept = await storage.createDepartment(input);
      cacheInvalidate("config:departments");
      res.status(201).json(dept);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      throw err;
    }
  });

  app.put(api.departments.update.path, async (req, res) => {
    try {
      const input = api.departments.update.input.parse(req.body);
      if (input.name) {
        const existing = await storage.getDepartmentByName(input.name);
        if (existing && existing.id !== req.params.id) {
          return res.status(409).json({ message: `Phòng ban "${input.name}" đã tồn tại.` });
        }
      }
      const dept = await storage.updateDepartment(req.params.id, input);
      cacheInvalidate("config:departments");
      res.json(dept);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      throw err;
    }
  });

  app.delete(api.departments.delete.path, async (req, res) => {
    try {
      await storage.deleteDepartment(req.params.id);
      cacheInvalidate("config:departments");
      res.status(204).send();
    } catch (err: any) {
      if (err.code === "DEPT_IN_USE") {
        return res.status(409).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post(api.roles.create.path, async (req, res) => {
    try {
      const input = api.roles.create.input.parse(req.body);
      const existing = await storage.getRoleByNameInDepartment(input.name, input.departmentId);
      if (existing) return res.status(409).json({ message: `Vai trò "${input.name}" đã tồn tại trong phòng ban này.` });
      const role = await storage.createRole(input);
      cacheInvalidate("config:departments");
      // Auto-seed canView=true for /tasks#list for non-Phòng Khách hàng roles
      // Note: /learning-overview#list is NOT seeded by default — admin must grant explicitly
      try {
        const [dept] = await db.select().from(departments).where(eq(departments.id, role.departmentId));
        if (dept && dept.name !== "Phòng Khách hàng") {
          await storage.upsertRolePermission(role.id, "/tasks#list", {
            canView: true, canViewAll: false, canCreate: false, canEdit: false, canDelete: false,
          });
        }
        // Seed /news-feed canView for all new roles
        await storage.upsertRolePermission(role.id, "/news-feed", {
          canView: true, canViewAll: false, canCreate: false, canEdit: false, canDelete: false,
        });
      } catch (_) {}
      res.status(201).json(role);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      throw err;
    }
  });

  app.put(api.roles.update.path, async (req, res) => {
    try {
      const input = api.roles.update.input.parse(req.body);
      if (input.name && input.departmentId) {
        const existing = await storage.getRoleByNameInDepartment(input.name, input.departmentId);
        if (existing && existing.id !== req.params.id) {
          return res.status(409).json({ message: `Vai trò "${input.name}" đã tồn tại trong phòng ban này.` });
        }
      }
      const role = await storage.updateRole(req.params.id, input);
      cacheInvalidate("config:departments");
      res.json(role);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      throw err;
    }
  });

  app.delete(api.roles.delete.path, async (req, res) => {
    try {
      await storage.deleteRole(req.params.id);
      cacheInvalidate("config:departments");
      res.status(204).send();
    } catch (err: any) {
      if (err.code === "ROLE_IN_USE") {
        return res.status(409).json({ message: err.message });
      }
      throw err;
    }
  });

  // Staff
  app.get("/api/staff/history", async (req, res) => {
    try {
      const q = req.query as Record<string, string>;
      const result = await getStaffHistory({
        dateFrom: q.dateFrom || null,
        dateTo: q.dateTo || null,
        locationId: q.locationId || null,
        allowedLocationIds: req.allowedLocationIds,
        isSuperAdmin: req.isSuperAdmin,
        limit: Math.min(parseInt(q.limit || "100"), 500),
        offset: parseInt(q.offset || "0"),
      });
      res.json(result);
    } catch (err: any) {
      console.error("[staff-history]", err);
      res.status(500).json({ message: "Không thể tải lịch sử nhân sự" });
    }
  });

  app.get(api.staff.list.path, async (req, res) => {
    const locationId = (req.query.locationId as string | undefined) ?? "";
    const minimal = req.query.minimal === "true";
    const includeCurrentUser = req.query.includeCurrentUser === "true";
    const currentUserId = includeCurrentUser ? requestUserId(req) : null;
    const locKey = req.isSuperAdmin ? "super" : (req.allowedLocationIds ?? []).slice().sort().join(",");
    const cacheKey = `config:staff:${locKey}:${locationId}:${minimal}:${currentUserId ?? ""}`;
    const cached = cacheGet<any[]>(cacheKey);
    if (cached) return res.json(cached);
    const staff = await storage.getStaff(req.allowedLocationIds, req.isSuperAdmin, locationId || undefined, minimal, currentUserId ?? undefined);
    cacheSet(cacheKey, staff, 2 * 60_000);
    res.json(staff);
  });

  app.get("/api/staff/:id/password", async (req, res) => {
    try {
      const password = await storage.getStaffPassword(
        req.params.id,
        req.allowedLocationIds,
        req.isSuperAdmin,
      );
      if (password === null) {
        return res.status(404).json({ message: "Chưa có mật khẩu có thể hiển thị cho nhân sự này" });
      }
      res.json({ password });
    } catch (err: any) {
      console.error("Get staff password error:", err);
      res.status(403).json({ message: err.message || "Không thể lấy mật khẩu nhân sự" });
    }
  });

  app.post(api.staff.create.path, async (req, res) => {
    try {
      const body = { ...req.body, dateOfBirth: sanitizeDateField(req.body.dateOfBirth) };
      const newStatus = body.status || "Hoạt động";
      if (newStatus === "Hoạt động") {
        const { limit, activeCount } = await getStaffLimitInfo();
        if (limit !== null && activeCount >= limit) {
          return res.status(400).json({ message: `Hệ thống đã đạt giới hạn ${limit} tài khoản nhân sự hoạt động. Vui lòng nâng cấp gói dịch vụ.` });
        }
      }
      const staff = await storage.createStaff(body);
      cacheInvalidate("config:staff");
      await createActivityLog({
        userId: requestUserId(req),
        locationId: staffHistoryLocationId(body),
        classId: null,
        action: "staff.created",
        oldContent: null,
        newContent: staffHistorySnapshot(staff, staff.id),
      });
      res.status(201).json(staff);
      emitToAll({ type: "staff_count_changed" });
      // Tinode user account is created lazily on first browser login (client-side acc message).
    } catch (err: any) {
      console.error("Create staff error:", err);
      res.status(400).json({ message: err.message || "Không thể lưu nhân sự" });
    }
  });

  app.put(api.staff.update.path, async (req, res) => {
    try {
      const body = { ...req.body, dateOfBirth: sanitizeDateField(req.body.dateOfBirth) };
      const before = (await storage.getStaff(req.allowedLocationIds, req.isSuperAdmin)).find((item: any) => item.id === req.params.id);
      if (body.status === "Hoạt động") {
        const { staff: staffSchema } = await import("@shared/schema");
        const [currentStaff] = await db.select({ status: staffSchema.status }).from(staffSchema).where(eq(staffSchema.id, req.params.id));
        if (currentStaff && currentStaff.status !== "Hoạt động") {
          const { limit, activeCount } = await getStaffLimitInfo();
          if (limit !== null && activeCount >= limit) {
            return res.status(400).json({ message: `Hệ thống đã đạt giới hạn ${limit} tài khoản nhân sự hoạt động. Vui lòng nâng cấp gói dịch vụ để kích hoạt thêm nhân sự.` });
          }
        }
      }
      const staff = await storage.updateStaff(req.params.id, body, req.allowedLocationIds, req.isSuperAdmin);
      cacheInvalidate("config:staff");
      await createActivityLog({
        userId: requestUserId(req),
        locationId: staffHistoryLocationId(body) ?? staffHistoryLocationId(before),
        classId: null,
        action: "staff.updated",
        oldContent: staffHistorySnapshot(before, req.params.id),
        newContent: staffHistorySnapshot({ ...before, ...body }, req.params.id),
      });
      res.json(staff);
      emitToAll({ type: "staff_count_changed" });
      // Sync tên mới lên Tinode nếu fullName thay đổi (fire-and-forget)
      if (body.fullName && staff.userId) {
        import("../lib/tinode.service").then(({ syncUserDisplayNameByUserId }) =>
          syncUserDisplayNameByUserId(staff.userId, body.fullName).catch(() => {})
        ).catch(() => {});
      }
    } catch (err: any) {
      const status = err.message?.includes("not found") || err.message?.includes("access denied") ? 403 : 400;
      res.status(status).json({ message: err.message });
    }
  });

  app.delete(api.staff.delete.path, async (req, res) => {
    try {
      const before = (await storage.getStaff(req.allowedLocationIds, req.isSuperAdmin)).find((item: any) => item.id === req.params.id);
      await storage.deleteStaff(req.params.id, req.allowedLocationIds, req.isSuperAdmin);
      cacheInvalidate("config:staff");
      await createActivityLog({
        userId: requestUserId(req),
        locationId: staffHistoryLocationId(before),
        classId: null,
        action: "staff.deleted",
        oldContent: staffHistorySnapshot(before, req.params.id),
        newContent: null,
      });
      res.status(204).send();
      emitToAll({ type: "staff_count_changed" });
    } catch (err: any) {
      res.status(403).json({ message: err.message });
    }
  });

  // Courses & Fee Packages
  app.get(api.courses.list.path, async (req, res) => {
    const locationFilter = req.isSuperAdmin ? undefined : req.allowedLocationIds;
    res.json(await storage.getCourses(locationFilter));
  });

  // Course/program/content history timeline
  app.get("/api/courses/history", async (req, res) => {
    try {
      const q = req.query as Record<string, string>;
      const dateFrom = q.dateFrom ? new Date(`${q.dateFrom}T00:00:00`) : undefined;
      const dateTo = q.dateTo ? new Date(`${q.dateTo}T23:59:59.999`) : undefined;
      const scope = ["courses", "programs", "library"].includes(q.scope) ? q.scope : undefined;
      const action = ["created", "updated", "deleted"].includes(q.action) ? q.action : undefined;
      const limit = Math.min(Math.max(parseInt(q.limit || "100", 10) || 100, 1), 500);
      const offset = Math.max(parseInt(q.offset || "0", 10) || 0, 0);
      const result = await getCourseAuditLogs({
        dateFrom,
        dateTo,
        scope,
        action,
        allowedLocationIds: req.allowedLocationIds,
        isSuperAdmin: req.isSuperAdmin,
        limit,
        offset,
      });
      res.json({
        total: result.total,
        events: result.events.map(event => ({
          id: event.id,
          scope: event.scope,
          entity_type: event.entityType,
          entity_id: event.entityId,
          entity_code: event.entityCode,
          entity_name: event.entityName,
          action: event.action,
          ev_time: event.createdAt,
          old_content: event.oldContent,
          new_content: event.newContent,
          user_name: event.userName,
          location_name: event.locationName,
        })),
      });
    } catch (error: any) {
      console.error("[course-history] error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post(api.courses.create.path, async (req, res) => {
    try {
      const { insertCourseSchema } = await import("@shared/schema");
      const inputSchema = insertCourseSchema.extend({
        locationIds: z.array(z.string().uuid()).min(1).optional(),
      });
      const { locationIds, ...courseInput } = inputSchema.parse(req.body);
      const selectedLocationIds = locationIds ?? (courseInput.locationId ? [courseInput.locationId] : []);
      const course = await storage.createCourse(courseInput, selectedLocationIds);
      await recordCourseAudit(req, {
        scope: "courses",
        entityType: "course",
        entityId: course.id,
        entityCode: course.code,
        entityName: course.name,
        action: "created",
        locationId: course.locationId,
        newContent: course,
      });
      res.status(201).json(course);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.get(api.courses.feePackages.path, async (req, res) => {
    res.json(await storage.getCourseFeePackages(req.params.id));
  });

  app.get("/api/fee-packages", async (req, res) => {
    try {
      const locationId = req.query.locationId as string | undefined;
      res.json(await storage.getAllFeePackages(locationId || undefined));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post(api.courses.createFeePackage.path, async (req, res) => {
    try {
      const { insertCourseFeePackageSchema } = await import("@shared/schema");
      const input = insertCourseFeePackageSchema.parse({ ...req.body, courseId: req.params.id });
      const pkg = await storage.createCourseFeePackage(input);
      const [course] = await db.select({ name: courses.name, locationId: courses.locationId })
        .from(courses).where(eq(courses.id, pkg.courseId)).limit(1);
      await recordCourseAudit(req, {
        scope: "courses",
        entityType: "fee_package",
        entityId: pkg.id,
        entityName: pkg.name,
        action: "created",
        locationId: course?.locationId,
        newContent: { ...pkg, courseName: course?.name ?? null },
      });
      res.status(201).json(pkg);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put("/api/courses/:id", async (req, res) => {
    try {
      const { insertCourseSchema } = await import("@shared/schema");
      const inputSchema = insertCourseSchema.partial().extend({
        locationIds: z.array(z.string().uuid()).min(1).optional(),
      });
      const { locationIds, ...courseInput } = inputSchema.parse(req.body);
      const [oldCourse] = await db.select().from(courses).where(eq(courses.id, req.params.id)).limit(1);
      const selectedLocationIds = locationIds ?? (courseInput.locationId ? [courseInput.locationId] : undefined);
      console.log("[PUT /api/courses] id=", req.params.id, "input=", courseInput);
      const updated = await storage.updateCourse(req.params.id, courseInput, selectedLocationIds);
      console.log("[PUT /api/courses] updated=", updated);
      if (!updated) {
        return res.status(404).json({ message: "Khoá học không tồn tại" });
      }
      await recordCourseAudit(req, {
        scope: "courses",
        entityType: "course",
        entityId: updated.id,
        entityCode: updated.code,
        entityName: updated.name,
        action: "updated",
        locationId: updated.locationId,
        oldContent: oldCourse,
        newContent: updated,
      });
      res.json(updated);
    } catch (err) {
      console.error("[PUT /api/courses] error:", err);
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete("/api/courses/:id", async (req, res) => {
    try {
      const [course] = await db.select().from(courses).where(eq(courses.id, req.params.id)).limit(1);
      console.log("[DELETE /api/courses] id=", req.params.id);
      await storage.deleteCourse(req.params.id);
      console.log("[DELETE /api/courses] done");
      if (course) {
        await recordCourseAudit(req, {
          scope: "courses",
          entityType: "course",
          entityId: course.id,
          entityCode: course.code,
          entityName: course.name,
          action: "deleted",
          locationId: course.locationId,
          oldContent: course,
        });
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[DELETE /api/courses] error:", err);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put("/api/courses/:courseId/fee-packages/:pkgId", async (req, res) => {
    try {
      const [oldPkg] = await db.select().from(courseFeePackages).where(eq(courseFeePackages.id, req.params.pkgId)).limit(1);
      const updated = await storage.updateCourseFeePackage(req.params.pkgId, req.body);
      if (updated) {
        await recordCourseAudit(req, {
          scope: "courses",
          entityType: "fee_package",
          entityId: updated.id,
          entityName: updated.name,
          action: "updated",
          locationId: await getCourseLocationId(updated.courseId),
          oldContent: oldPkg,
          newContent: updated,
        });
      }
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete("/api/courses/:courseId/fee-packages/:pkgId", async (req, res) => {
    try {
      const [pkg] = await db.select().from(courseFeePackages).where(eq(courseFeePackages.id, req.params.pkgId)).limit(1);
      await storage.deleteCourseFeePackage(req.params.pkgId);
      if (pkg) {
        await recordCourseAudit(req, {
          scope: "courses",
          entityType: "fee_package",
          entityId: pkg.id,
          entityName: pkg.name,
          action: "deleted",
          locationId: await getCourseLocationId(pkg.courseId),
          oldContent: pkg,
        });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  // Course Programs
  app.get("/api/course-programs", async (req, res) => {
    const locationFilter = req.isSuperAdmin ? undefined : req.allowedLocationIds;
    const allPrograms = await storage.getCoursePrograms(locationFilter);
    res.json(allPrograms);
  });

  app.post("/api/course-programs", async (req, res) => {
    try {
      const { insertCourseProgramSchema } = await import("@shared/schema");
      const parsed = insertCourseProgramSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(parsed.error);
      const program = await storage.createCourseProgram(parsed.data);
      await recordCourseAudit(req, {
        scope: "programs",
        entityType: "program",
        entityId: program.id,
        entityCode: program.code,
        entityName: program.name,
        action: "created",
        locationId: program.locationIds?.[0] ?? null,
        newContent: program,
      });
      res.json(program);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put("/api/course-programs/:id", async (req, res) => {
    try {
      const { insertCourseProgramSchema } = await import("@shared/schema");
      const input = insertCourseProgramSchema.partial().parse(req.body);
      const [oldProgram] = await db.select().from(coursePrograms).where(eq(coursePrograms.id, req.params.id)).limit(1);
      const updated = await storage.updateCourseProgram(req.params.id, input);
      if (!updated) return res.status(404).json({ message: "Chương trình không tồn tại" });
      await recordCourseAudit(req, {
        scope: "programs",
        entityType: "program",
        entityId: updated.id,
        entityCode: updated.code,
        entityName: updated.name,
        action: "updated",
        locationId: updated.locationIds?.[0] ?? null,
        oldContent: oldProgram,
        newContent: updated,
      });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete("/api/course-programs/:id", async (req, res) => {
    try {
      const [program] = await db.select().from(coursePrograms).where(eq(coursePrograms.id, req.params.id)).limit(1);
      await storage.deleteCourseProgram(req.params.id);
      if (program) {
        await recordCourseAudit(req, {
          scope: "programs",
          entityType: "program",
          entityId: program.id,
          entityCode: program.code,
          entityName: program.name,
          action: "deleted",
          locationId: program.locationIds?.[0] ?? null,
          oldContent: program,
        });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.get("/api/course-program-contents", async (req, res) => {
    const { page, pageSize, search } = req.query;
    const result = await storage.getAllCourseProgramContents({
      page:     typeof page     === "string" ? Math.max(1, parseInt(page, 10))                    : 1,
      pageSize: typeof pageSize === "string" ? Math.min(100, Math.max(1, parseInt(pageSize, 10))) : 20,
      search:   typeof search   === "string" ? search                                              : "",
    });
    res.json(result);
  });

  app.post("/api/course-program-contents", async (req, res) => {
    try {
      const { insertCourseProgramContentSchema } = await import("@shared/schema");
      const parsed = insertCourseProgramContentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(parsed.error);
      const userId = (req.user as any)?.id || null;
      const content = await storage.createCourseProgramContent({ ...parsed.data, createdBy: userId });
      await recordCourseAudit(req, {
        scope: "library",
        entityType: "content",
        entityId: content.id,
        entityName: content.title,
        action: "created",
        locationId: await getProgramLocationId(content.programId),
        newContent: content,
      });
      res.json(content);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.get("/api/course-programs/:id/contents", async (req, res) => {
    const contents = await storage.getCourseProgramContents(req.params.id);
    res.json(contents);
  });

  app.post("/api/course-programs/:id/contents", async (req, res) => {
    try {
      const { insertCourseProgramContentSchema } = await import("@shared/schema");
      const parsed = insertCourseProgramContentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(parsed.error);
      const content = await storage.createCourseProgramContent(parsed.data);
      await recordCourseAudit(req, {
        scope: "programs",
        entityType: "content",
        entityId: content.id,
        entityName: content.title,
        action: "created",
        locationId: await getProgramLocationId(req.params.id),
        newContent: content,
      });
      res.json(content);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.post("/api/course-programs/:id/session-assignments", async (req, res) => {
    try {
      const bodySchema = z.object({
        sessionNumber: z.number().int().positive(),
        examIds: z.array(z.string().uuid()).optional().default([]),
        scoreSheetSelection: z.object({
          kind: z.enum(["sheet", "assessment", "template"]),
          id: z.string().uuid(),
        }).nullable().optional(),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(parsed.error);

      const { exams, scoreSheets } = await import("@shared/schema");
      const { id: programId } = req.params;
      const { sessionNumber, examIds, scoreSheetSelection } = parsed.data;
      const [program] = await db.select({
        id: coursePrograms.id,
        sessions: coursePrograms.sessions,
      })
        .from(coursePrograms)
        .where(eq(coursePrograms.id, programId))
        .limit(1);
      if (!program) return res.status(404).json({ message: "Không tìm thấy chương trình học." });
      if (sessionNumber > Number(program.sessions)) {
        return res.status(400).json({ message: "Số buổi nằm ngoài chương trình học." });
      }

      const examRows = examIds.length
        ? await db.select({ id: exams.id, code: exams.code, name: exams.name })
            .from(exams)
            .where(inArray(exams.id, examIds))
        : [];
      if (examRows.length !== new Set(examIds).size) {
        return res.status(400).json({ message: "Một hoặc nhiều bài kiểm tra không còn tồn tại." });
      }

      let scoreSheetTitle: string | null = null;
      if (scoreSheetSelection?.kind === "sheet") {
        const [sheet] = await db.select({ name: scoreSheets.name })
          .from(scoreSheets)
          .where(eq(scoreSheets.id, scoreSheetSelection.id))
          .limit(1);
        if (!sheet) return res.status(400).json({ message: "Không tìm thấy bảng điểm đã chọn." });
        scoreSheetTitle = sheet.name;
      } else if (scoreSheetSelection?.kind === "assessment") {
        const assessment = (await readScoreSheetAssessments())
          .find((item) => item.id === scoreSheetSelection.id);
        if (!assessment) return res.status(400).json({ message: "Không tìm thấy bảng điểm quy đổi đã chọn." });
        scoreSheetTitle = `${assessment.code} — ${assessment.name}`;
      } else if (scoreSheetSelection?.kind === "template") {
        const template = (await readScoreSheetTemplates())
          .find((item) => item.id === scoreSheetSelection.id);
        if (!template) return res.status(400).json({ message: "Không tìm thấy bảng điểm mẫu đã chọn." });
        scoreSheetTitle = `${template.code} — ${template.name}`;
      }

      const createdBy = (req.user as any)?.id ?? null;
      const result = await db.transaction(async (tx) => {
        const existingExams = examIds.length
          ? await tx.select({ examId: courseProgramContents.examId })
              .from(courseProgramContents)
              .where(and(
                eq(courseProgramContents.programId, programId),
                eq(courseProgramContents.sessionNumber, String(sessionNumber)),
                inArray(courseProgramContents.examId, examIds),
              ))
          : [];
        const assignedExamIds = new Set(existingExams.map((item) => item.examId));
        const newExamRows = examRows
          .filter((exam) => !assignedExamIds.has(exam.id))
          .map((exam) => ({
            programId,
            sessionNumber: String(sessionNumber),
            title: exam.code ? `${exam.code} — ${exam.name}` : exam.name,
            type: "Bài kiểm tra",
            examId: exam.id,
            createdBy,
          }));
        const createdExams = newExamRows.length
          ? await tx.insert(courseProgramContents).values(newExamRows).returning()
          : [];

        let scoreSheetAssignment: typeof courseProgramContents.$inferSelect | null = null;
        if (scoreSheetSelection !== undefined) {
          const currentScoreRows = await tx.select({ id: courseProgramContents.id })
            .from(courseProgramContents)
            .where(and(
              eq(courseProgramContents.programId, programId),
              eq(courseProgramContents.sessionNumber, String(sessionNumber)),
              eq(courseProgramContents.type, "Bảng điểm"),
            ));
          if (currentScoreRows.length > 0) {
            await tx.delete(courseProgramContents).where(inArray(
              courseProgramContents.id,
              currentScoreRows.map((row) => row.id),
            ));
          }

          if (scoreSheetSelection && scoreSheetTitle) {
            const assignmentValues = {
              programId,
              sessionNumber: String(sessionNumber),
              title: scoreSheetTitle,
              type: "Bảng điểm",
              ...(scoreSheetSelection.kind === "sheet"
                ? { scoreSheetId: scoreSheetSelection.id }
                : scoreSheetSelection.kind === "assessment"
                  ? { scoreSheetAssessmentId: scoreSheetSelection.id }
                  : { scoreSheetTemplateId: scoreSheetSelection.id }),
              createdBy,
            };
            [scoreSheetAssignment] = await tx.insert(courseProgramContents)
              .values(assignmentValues)
              .returning();
          }
        }

        return { exams: createdExams, scoreSheet: scoreSheetAssignment };
      });

      await recordCourseAudit(req, {
        scope: "programs",
        entityType: "content",
        entityId: programId,
        entityName: `Buổi ${sessionNumber}`,
        action: "created",
        locationId: await getProgramLocationId(programId),
        newContent: result,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: (err as any).message || "Không thể gán nội dung cho buổi học." });
    }
  });

  app.get("/api/course-program-contents/:id", async (req, res) => {
    try {
      const content = await courseStorage.getCourseProgramContentById(req.params.id);
      if (!content) return res.status(404).json({ message: "Not found" });
      res.json(content);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.patch("/api/course-program-contents/:id", async (req, res) => {
    try {
      const { insertCourseProgramContentSchema } = await import("@shared/schema");
      const parsed = insertCourseProgramContentSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json(parsed.error);
      const [oldContent] = await db.select().from(courseProgramContents).where(eq(courseProgramContents.id, req.params.id)).limit(1);
      const content = await storage.updateCourseProgramContent(req.params.id, parsed.data);
      if (content) {
        await recordCourseAudit(req, {
          scope: "library",
          entityType: "content",
          entityId: content.id,
          entityName: content.title,
          action: "updated",
          locationId: await getProgramLocationId(content.programId),
          oldContent,
          newContent: content,
        });
      }
      res.json(content);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete("/api/course-program-contents/:id", async (req, res) => {
    try {
      const [content] = await db.select().from(courseProgramContents).where(eq(courseProgramContents.id, req.params.id)).limit(1);
      await storage.deleteCourseProgramContent(req.params.id);
      if (content) {
        await recordCourseAudit(req, {
          scope: "library",
          entityType: "content",
          entityId: content.id,
          entityName: content.title,
          action: "deleted",
          locationId: await getProgramLocationId(content.programId),
          oldContent: content,
        });
      }
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  // Classrooms
  app.get("/api/classrooms", async (req, res) => {
    try {
      const { classrooms } = await import("@shared/schema");
      const locationId = req.query.locationId as string | undefined;
      let rows;
      if (locationId) {
        rows = await db.select().from(classrooms).where(eq(classrooms.locationId, locationId));
      } else {
        rows = await db.select().from(classrooms);
      }
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/classrooms", async (req, res) => {
    try {
      const { classrooms, insertClassroomSchema } = await import("@shared/schema");
      const input = insertClassroomSchema.parse(req.body);
      const [row] = await db.insert(classrooms).values(input).returning();
      res.status(201).json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put("/api/classrooms/:id", async (req, res) => {
    try {
      const { classrooms, insertClassroomSchema } = await import("@shared/schema");
      const input = insertClassroomSchema.partial().parse(req.body);
      const [row] = await db.update(classrooms).set(input).where(eq(classrooms.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete("/api/classrooms/:id", async (req, res) => {
    try {
      const { classrooms } = await import("@shared/schema");
      await db.delete(classrooms).where(eq(classrooms.id, req.params.id));
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Evaluation Criteria
  app.get("/api/evaluation-criteria", async (req, res) => {
    try {
      const { evaluationCriteria, evaluationSubCriteria } = await import("@shared/schema");
      const criteria = await db.select().from(evaluationCriteria).orderBy(evaluationCriteria.name);
      const allSub = await db.select().from(evaluationSubCriteria).orderBy(evaluationSubCriteria.name);
      const result = criteria.map((c) => ({
        ...c,
        subCriteria: allSub.filter((s) => s.criteriaId === c.id),
      }));
      res.json(result);
    } catch (err) { res.status(500).json({ message: (err as any).message }); }
  });

  app.post("/api/evaluation-criteria", async (req, res) => {
    try {
      const { evaluationCriteria, insertEvaluationCriteriaSchema } = await import("@shared/schema");
      const input = insertEvaluationCriteriaSchema.parse(req.body);
      const [row] = await db.insert(evaluationCriteria).values(input).returning();
      res.status(201).json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put("/api/evaluation-criteria/:id", async (req, res) => {
    try {
      const { evaluationCriteria, insertEvaluationCriteriaSchema } = await import("@shared/schema");
      const input = insertEvaluationCriteriaSchema.partial().parse(req.body);
      const [row] = await db.update(evaluationCriteria).set({ ...input, updatedAt: new Date() }).where(eq(evaluationCriteria.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete("/api/evaluation-criteria/:id", async (req, res) => {
    try {
      const { evaluationCriteria } = await import("@shared/schema");
      await db.delete(evaluationCriteria).where(eq(evaluationCriteria.id, req.params.id));
      res.status(204).send();
    } catch (err) { res.status(500).json({ message: (err as any).message }); }
  });

  app.get("/api/evaluation-criteria/:criteriaId/sub-criteria", async (req, res) => {
    try {
      const { evaluationSubCriteria } = await import("@shared/schema");
      const rows = await db.select().from(evaluationSubCriteria).where(eq(evaluationSubCriteria.criteriaId, req.params.criteriaId)).orderBy(evaluationSubCriteria.name);
      res.json(rows);
    } catch (err) { res.status(500).json({ message: (err as any).message }); }
  });

  const getEvaluationGroupBoundsError = (minChecked: number | null, maxChecked: number | null) => {
    if (minChecked != null && (!Number.isSafeInteger(minChecked) || minChecked < 0)) {
      return "Số tickbox tối thiểu phải là số nguyên không âm.";
    }
    if (maxChecked != null && (!Number.isSafeInteger(maxChecked) || maxChecked < 0)) {
      return "Số tickbox tối đa phải là số nguyên không âm.";
    }
    if (minChecked != null && maxChecked != null && minChecked > maxChecked) {
      return "Số tickbox tối thiểu không được lớn hơn tối đa.";
    }
    return null;
  };

  app.post("/api/evaluation-sub-criteria", async (req, res) => {
    try {
      const { evaluationSubCriteria, insertEvaluationSubCriteriaSchema } = await import("@shared/schema");
      const input = insertEvaluationSubCriteriaSchema.parse(req.body);
      const itemType = input.itemType === "heading" ? "heading" : "criterion";
      const parentId = itemType === "criterion" ? (input.parentId || null) : null;
      const minChecked = itemType === "heading" ? (input.minChecked ?? null) : null;
      const maxChecked = itemType === "heading" ? (input.maxChecked ?? null) : null;
      const boundsError = getEvaluationGroupBoundsError(minChecked, maxChecked);
      if (boundsError) return res.status(400).json({ message: boundsError });
      if (itemType === "criterion" && !parentId) {
        return res.status(400).json({ message: "Tiêu chí con phải chọn Nhóm chung" });
      }
      if (parentId) {
        const [parent] = await db.select({ id: evaluationSubCriteria.id })
          .from(evaluationSubCriteria)
          .where(and(
            eq(evaluationSubCriteria.id, parentId),
            eq(evaluationSubCriteria.criteriaId, input.criteriaId),
            eq(evaluationSubCriteria.itemType, "heading"),
          ))
          .limit(1);
        if (!parent) return res.status(400).json({ message: "Nhóm chung không hợp lệ" });
      }
      const [row] = await db.insert(evaluationSubCriteria).values({
        ...input,
        itemType,
        parentId,
        minChecked,
        maxChecked,
        inputType: itemType === "criterion" && input.inputType === "checkbox" ? "checkbox" : "text",
      }).returning();
      res.status(201).json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put("/api/evaluation-sub-criteria/:id", async (req, res) => {
    try {
      const { evaluationSubCriteria, insertEvaluationSubCriteriaSchema } = await import("@shared/schema");
      const input = insertEvaluationSubCriteriaSchema.partial().parse(req.body);
      const [current] = await db.select().from(evaluationSubCriteria)
        .where(eq(evaluationSubCriteria.id, req.params.id))
        .limit(1);
      if (!current) return res.status(404).json({ message: "Not found" });
      const itemType = input.itemType === "heading" ? "heading" : input.itemType === "criterion" ? "criterion" : current.itemType;
      const parentId = itemType === "criterion" ? (input.parentId ?? current.parentId) : null;
      const minChecked = itemType === "heading"
        ? (input.minChecked === undefined ? current.minChecked : input.minChecked)
        : null;
      const maxChecked = itemType === "heading"
        ? (input.maxChecked === undefined ? current.maxChecked : input.maxChecked)
        : null;
      const boundsError = getEvaluationGroupBoundsError(minChecked, maxChecked);
      if (boundsError) return res.status(400).json({ message: boundsError });
      const isLegacyUngroupedCriterion = itemType === "criterion"
        && !parentId
        && current.itemType === "criterion"
        && !current.parentId
        && input.parentId === null;
      if (itemType === "criterion" && !parentId && !isLegacyUngroupedCriterion) {
        return res.status(400).json({ message: "Tiêu chí con phải chọn Nhóm chung" });
      }
      if (parentId) {
        const [parent] = await db.select({ id: evaluationSubCriteria.id })
          .from(evaluationSubCriteria)
          .where(and(
            eq(evaluationSubCriteria.id, parentId),
            eq(evaluationSubCriteria.criteriaId, input.criteriaId || current.criteriaId),
            eq(evaluationSubCriteria.itemType, "heading"),
          ))
          .limit(1);
        if (!parent || parent.id === req.params.id) return res.status(400).json({ message: "Nhóm chung không hợp lệ" });
      }
      const [row] = await db.update(evaluationSubCriteria).set({
        ...input,
        itemType,
        parentId,
        minChecked,
        maxChecked,
        inputType: itemType === "criterion" && input.inputType === "checkbox" ? "checkbox" : "text",
        updatedAt: new Date(),
      }).where(eq(evaluationSubCriteria.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete("/api/evaluation-sub-criteria/:id", async (req, res) => {
    try {
      const { evaluationSubCriteria } = await import("@shared/schema");
      const children = await db.select({ id: evaluationSubCriteria.id })
        .from(evaluationSubCriteria)
        .where(eq(evaluationSubCriteria.parentId, req.params.id))
        .limit(1);
      if (children.length > 0) {
        return res.status(400).json({ message: "Không thể xoá tiêu đề đang có tiêu chí con" });
      }
      await db.delete(evaluationSubCriteria).where(eq(evaluationSubCriteria.id, req.params.id));
      res.status(204).send();
    } catch (err) { res.status(500).json({ message: (err as any).message }); }
  });

  // Subjects
  app.get("/api/subjects", async (req, res) => {
    try {
      const { subjects } = await import("@shared/schema");
      const rows = await db.select().from(subjects).orderBy(subjects.name);
      res.json(rows);
    } catch (err) { res.status(500).json({ message: (err as any).message }); }
  });

  app.post("/api/subjects", async (req, res) => {
    try {
      const { subjects, insertSubjectSchema } = await import("@shared/schema");
      const input = insertSubjectSchema.parse(req.body);
      const [row] = await db.insert(subjects).values(input).returning();
      res.status(201).json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put("/api/subjects/:id", async (req, res) => {
    try {
      const { subjects, insertSubjectSchema } = await import("@shared/schema");
      const input = insertSubjectSchema.partial().parse(req.body);
      const [row] = await db.update(subjects).set({ ...input, updatedAt: new Date() }).where(eq(subjects.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete("/api/subjects/:id", async (req, res) => {
    try {
      const { subjects } = await import("@shared/schema");
      await db.delete(subjects).where(eq(subjects.id, req.params.id));
      res.status(204).send();
    } catch (err) { res.status(500).json({ message: (err as any).message }); }
  });

  // Shift Templates
  app.get("/api/shift-templates", async (req, res) => {
    const { allowedLocationIds, isSuperAdmin } = req;
    const locationId = req.query.locationId as string | undefined;
    const type = req.query.type as string | undefined;
    const requestedLocationId = (locationId === "undefined" || !locationId) ? undefined : locationId;
    const effectiveType = (type === "undefined" || !type) ? undefined : type;
    const includeInactive = req.query.includeInactive === "true";

    if (isSuperAdmin) {
      const shifts = await storage.getShiftTemplates(requestedLocationId, effectiveType, includeInactive);
      return res.json(shifts);
    }

    // Non-superAdmin: validate requested locationId is within allowedLocationIds
    if (requestedLocationId) {
      if (!allowedLocationIds.includes(requestedLocationId)) {
        return res.json([]);
      }
      const shifts = await storage.getShiftTemplates(requestedLocationId, effectiveType, includeInactive);
      return res.json(shifts);
    }

    // No specific location requested — return shifts for all allowed locations only
    const allShifts = await storage.getShiftTemplates(undefined, effectiveType, includeInactive);
    const filtered = allShifts.filter(s => allowedLocationIds.includes(s.locationId));
    return res.json(filtered);
  });

  app.post("/api/shift-templates", async (req, res) => {
    try {
      const { insertShiftTemplateSchema } = await import("@shared/schema");
      const rawLocationIds = req.body?.locationIds ?? (req.body?.locationId ? [req.body.locationId] : []);
      const locationIds = z.array(z.string().uuid()).min(1).parse(rawLocationIds);
      if (!req.isSuperAdmin && locationIds.some((id) => !(req.allowedLocationIds ?? []).includes(id))) {
        return res.status(403).json({ message: "Bạn không có quyền thao tác tại cơ sở đã chọn" });
      }
      const { locationIds: _locationIds, ...rawInput } = req.body ?? {};
      const input = insertShiftTemplateSchema.parse({ ...rawInput, locationId: locationIds[0], groupId: null });
      const shifts = await db.insert(shiftTemplates).values(
        locationIds.map((locationId) => ({ ...input, locationId, groupId: null }))
      ).returning();
      res.status(201).json(shifts.length === 1 ? shifts[0] : shifts);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put("/api/shift-templates/:id", async (req, res) => {
    try {
      const { insertShiftTemplateSchema } = await import("@shared/schema");
      const { shiftTemplates: shiftTemplateTable } = await import("@shared/schema");
      const [current] = await db.select().from(shiftTemplateTable)
        .where(eq(shiftTemplateTable.id, req.params.id)).limit(1);
      if (!current) return res.status(404).json({ message: "Không tìm thấy ca làm việc" });
      if (!req.isSuperAdmin && !(req.allowedLocationIds ?? []).includes(current.locationId)) {
        return res.status(403).json({ message: "Bạn không có quyền thao tác tại cơ sở này" });
      }

      const { locationIds: _locationIds, locationId: _locationId, ...rawInput } = req.body ?? {};
      const input = insertShiftTemplateSchema.partial().parse(rawInput);
      const [updatedShift] = await db.update(shiftTemplateTable)
        .set({
          ...input,
          locationId: current.locationId,
          groupId: null,
          updatedAt: new Date(),
        })
        .where(eq(shiftTemplateTable.id, current.id))
        .returning();
      res.json(updatedShift);

      const changedShiftIds =
        input.startTime && current.startTime !== input.startTime ? [current.id] : [];
      if (changedShiftIds.length > 0 && input.startTime) {
        const newTime = String(input.startTime).slice(0, 5);
        setImmediate(async () => {
          try {
            const [center] = await db.select({ id: centerConfig.id }).from(centerConfig).limit(1);
            if (!center?.id) return;
            const notified = new Set<string>();

            for (const shiftId of changedShiftIds) {
              const affectedClasses = await db
                .select({ id: classes.id, classCode: classes.classCode, name: classes.name })
                .from(classes)
                .where(and(
                  sql`${shiftId} = ANY(${classes.shiftTemplateIds})`,
                  inArray(classes.status, ["active", "recruiting"]),
                ));

              for (const cls of affectedClasses) {
                const className = cls.classCode || cls.name;
                const activeStudents = await db
                  .select({ studentId: studentClasses.studentId, studentName: students.fullName })
                  .from(studentClasses)
                  .innerJoin(students, eq(studentClasses.studentId, students.id))
                  .where(and(eq(studentClasses.classId, cls.id), eq(studentClasses.status, "active")));

                for (const student of activeStudents) {
                  const notificationKey = `${cls.id}:${student.studentId}`;
                  if (notified.has(notificationKey)) continue;
                  notified.add(notificationKey);
                  await notificationService.send({
                    centerId: center.id,
                    studentId: student.studentId,
                    type: "class_changed",
                    data: { studentName: student.studentName ?? "", className, newTime },
                  }).catch((err) => console.error("[ClassChanged] Lỗi gửi noti studentId:", student.studentId, err));
                }
              }
            }
            console.log(`[ClassChanged] Đã notify ${changedShiftIds.length} ca → newTime=${newTime}`);
          } catch (err) {
            console.error("[ClassChanged] Lỗi xử lý notification:", err);
          }
        });
      }
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete("/api/shift-templates/:id", async (req, res) => {
    try {
      const [current] = await db.select().from(shiftTemplates)
        .where(eq(shiftTemplates.id, req.params.id)).limit(1);
      if (!current) return res.status(404).json({ message: "Không tìm thấy ca làm việc" });
      if (!req.isSuperAdmin && !(req.allowedLocationIds ?? []).includes(current.locationId)) {
        return res.status(403).json({ message: "Bạn không có quyền thao tác tại cơ sở này" });
      }
      await db.update(shiftTemplates)
        .set({ status: "inactive", groupId: null, updatedAt: new Date() })
        .where(eq(shiftTemplates.id, current.id));
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  // Shift Assignments (Phân ca làm việc)
  app.get("/api/shift-assignments", async (req, res) => {
    try {
      const { db } = await import("../storage/base");
      const { shiftAssignments } = await import("@shared/schema");
      const { desc, inArray } = await import("drizzle-orm");
      let rows;
      if (req.isSuperAdmin) {
        rows = await db.select().from(shiftAssignments).orderBy(desc(shiftAssignments.createdAt));
      } else {
        const allowed = req.allowedLocationIds ?? [];
        if (allowed.length === 0) return res.json([]);
        rows = await db.select().from(shiftAssignments)
          .where(inArray(shiftAssignments.locationId, allowed))
          .orderBy(desc(shiftAssignments.createdAt));
      }
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.post("/api/shift-assignments", async (req, res) => {
    try {
      const { insertShiftAssignmentSchema, shiftAssignments } = await import("@shared/schema");
      const { db } = await import("../storage/base");
      const rawEntries = req.body?.locationAssignments;

      if (!Array.isArray(rawEntries)) {
        const input = insertShiftAssignmentSchema.parse(req.body);
        if (!req.isSuperAdmin && !(req.allowedLocationIds ?? []).includes(input.locationId)) {
          return res.status(403).json({ message: "Bạn không có quyền thao tác tại cơ sở này" });
        }
        const [row] = await db.insert(shiftAssignments).values({ ...input, groupId: null }).returning();
        return res.status(201).json(row);
      }

      const entries = z.array(z.object({
        locationId: z.string().uuid(),
        shiftTemplateId: z.string().uuid().nullable(),
        weekdaySchedule: z.record(z.array(z.string().uuid())).nullable(),
      })).min(1).parse(rawEntries);
      const locationIds = entries.map((entry) => entry.locationId);
      if (new Set(locationIds).size !== locationIds.length) {
        return res.status(400).json({ message: "Không thể chọn trùng cơ sở" });
      }
      if (!req.isSuperAdmin && locationIds.some((id) => !(req.allowedLocationIds ?? []).includes(id))) {
        return res.status(403).json({ message: "Bạn không có quyền thao tác tại cơ sở đã chọn" });
      }

      const { locationAssignments: _entries, ...rawCommon } = req.body;
      const input = insertShiftAssignmentSchema.parse({
        ...rawCommon,
        locationId: entries[0].locationId,
        shiftTemplateId: entries[0].shiftTemplateId,
        weekdaySchedule: entries[0].weekdaySchedule,
      });
      const shiftIds = [...new Set(entries.flatMap((entry) =>
        entry.shiftTemplateId
          ? [entry.shiftTemplateId]
          : Object.values(entry.weekdaySchedule ?? {}).flat()
      ))];
      if (shiftIds.length > 0) {
        const { shiftTemplates } = await import("@shared/schema");
        const templates = await db.select({
          id: shiftTemplates.id,
          locationId: shiftTemplates.locationId,
          status: shiftTemplates.status,
        }).from(shiftTemplates).where(inArray(shiftTemplates.id, shiftIds));
        const templateById = new Map(templates.map((template) => [template.id, template]));
        for (const entry of entries) {
          const selectedIds = entry.shiftTemplateId
            ? [entry.shiftTemplateId]
            : Object.values(entry.weekdaySchedule ?? {}).flat();
          if (selectedIds.some((id) => {
            const template = templateById.get(id);
            return !template || template.locationId !== entry.locationId || template.status !== "active";
          })) {
            return res.status(400).json({ message: "Ca được chọn không thuộc cơ sở hoặc đã ngừng hoạt động" });
          }
        }
      }

      const { locationId: _locationId, shiftTemplateId: _shiftTemplateId, weekdaySchedule: _weekdaySchedule, ...common } = input;
      const rows = await db.transaction(async (tx) => tx.insert(shiftAssignments).values(
        entries.map((entry) => ({
          ...common,
          ...entry,
          groupId: null,
          status: "active",
        }))
      ).returning());
      res.status(201).json(rows);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put("/api/shift-assignments/:id", async (req, res) => {
    try {
      const { insertShiftAssignmentSchema, shiftAssignments } = await import("@shared/schema");
      const { db } = await import("../storage/base");
      const [current] = await db.select().from(shiftAssignments)
        .where(eq(shiftAssignments.id, req.params.id)).limit(1);
      if (!current) return res.status(404).json({ message: "Không tìm thấy phân ca" });
      if (!req.isSuperAdmin && !(req.allowedLocationIds ?? []).includes(current.locationId)) {
        return res.status(403).json({ message: "Bạn không có quyền thao tác tại cơ sở này" });
      }

      const rawEntries = req.body?.locationAssignments;
      if (!Array.isArray(rawEntries)) {
        const { locationId: _locationId, ...rawInput } = req.body ?? {};
        const input = insertShiftAssignmentSchema.partial().parse(rawInput);
        const [row] = await db.update(shiftAssignments)
          .set({ ...input, locationId: current.locationId, groupId: null, updatedAt: new Date() })
          .where(eq(shiftAssignments.id, req.params.id))
          .returning();
        return res.json(row);
      }

      const entries = z.array(z.object({
        locationId: z.string().uuid(),
        shiftTemplateId: z.string().uuid().nullable(),
        weekdaySchedule: z.record(z.array(z.string().uuid())).nullable(),
      })).min(1).parse(rawEntries);
      const entry = entries.find((candidate) => candidate.locationId === current.locationId);
      if (!entry) {
        return res.status(400).json({ message: "Dữ liệu cập nhật không chứa cơ sở của phân ca này" });
      }
      if (!req.isSuperAdmin && !(req.allowedLocationIds ?? []).includes(entry.locationId)) {
        return res.status(403).json({ message: "Bạn không có quyền thao tác tại cơ sở này" });
      }

      const { locationAssignments: _entries, locationIds: _locationIds, locationId: _locationId, ...rawCommon } = req.body;
      const input = insertShiftAssignmentSchema.partial().parse({
        ...rawCommon,
        locationId: current.locationId,
        shiftTemplateId: entry.shiftTemplateId,
        weekdaySchedule: entry.weekdaySchedule,
      });
      const shiftIds = entry.shiftTemplateId
        ? [entry.shiftTemplateId]
        : Object.values(entry.weekdaySchedule ?? {}).flat();
      if (shiftIds.length > 0) {
        const { shiftTemplates } = await import("@shared/schema");
        const templates = await db.select({
          id: shiftTemplates.id,
          locationId: shiftTemplates.locationId,
          status: shiftTemplates.status,
        }).from(shiftTemplates).where(inArray(shiftTemplates.id, shiftIds));
        const templateById = new Map(templates.map((template) => [template.id, template]));
        if (shiftIds.some((id) => {
          const template = templateById.get(id);
          return !template || template.locationId !== entry.locationId || template.status !== "active";
        })) {
          return res.status(400).json({ message: "Ca được chọn không thuộc cơ sở hoặc đã ngừng hoạt động" });
        }
      }

      const [updated] = await db.update(shiftAssignments).set({
        ...input,
        ...entry,
        locationId: current.locationId,
        groupId: null,
        status: "active",
        updatedAt: new Date(),
      }).where(eq(shiftAssignments.id, current.id)).returning();
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete("/api/shift-assignments/:id", async (req, res) => {
    try {
      const { shiftAssignments } = await import("@shared/schema");
      const { db } = await import("../storage/base");
      const [current] = await db.select().from(shiftAssignments)
        .where(eq(shiftAssignments.id, req.params.id)).limit(1);
      if (!current) return res.status(404).json({ message: "Không tìm thấy phân ca" });
      if (!req.isSuperAdmin && !(req.allowedLocationIds ?? []).includes(current.locationId)) {
        return res.status(403).json({ message: "Bạn không có quyền thao tác tại cơ sở này" });
      }
      const cutoffDate = getBangkokDateOnly();
      const previousEnd = current.effectiveTo ? String(current.effectiveTo).slice(0, 10) : null;
      const effectiveTo = previousEnd && previousEnd < cutoffDate ? previousEnd : cutoffDate;
      await db.update(shiftAssignments).set({
        status: "inactive",
        effectiveTo,
        groupId: null,
        updatedAt: new Date(),
      }).where(eq(shiftAssignments.id, current.id));
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  // Teacher Availability
  app.get("/api/teacher-availability", async (req, res) => {
    const filters = {
      locationId: req.query.locationId as string,
      teacherId: req.query.teacherId as string,
      weekday: req.query.weekday ? parseInt(req.query.weekday as string) : undefined
    };
    const availabilities = await storage.getTeacherAvailabilities(filters);
    res.json(availabilities);
  });

  app.post("/api/teacher-availability", async (req, res) => {
    try {
      const { insertTeacherAvailabilitySchema } = await import("@shared/schema");
      const { weekdays, ...rest } = req.body;

      if (!Array.isArray(weekdays)) {
        return res.status(400).json({ message: "weekdays must be an array" });
      }

      const isAtLocation = await storage.checkTeacherAtLocation(rest.teacherId, rest.locationId);
      if (!isAtLocation) {
        return res.status(400).json({ message: "Giáo viên không thuộc cơ sở này." });
      }

      const results = [];
      for (const weekday of weekdays) {
        const data = { ...rest, weekday };
        const validated = insertTeacherAvailabilitySchema.parse(data);

        const isDuplicate = await storage.checkAvailabilityDuplicate(validated);
        if (isDuplicate) {
          continue;
        }

        const created = await storage.createTeacherAvailability(validated);
        results.push(created);
      }

      res.status(201).json(results);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put("/api/teacher-availability/:id", async (req, res) => {
    try {
      const { insertTeacherAvailabilitySchema } = await import("@shared/schema");
      const input = insertTeacherAvailabilitySchema.partial().parse(req.body);

      delete (input as any).teacherId;
      delete (input as any).locationId;

      const updated = await storage.updateTeacherAvailability(req.params.id, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete("/api/teacher-availability/:id", async (req, res) => {
    await storage.deleteTeacherAvailability(req.params.id);
    res.status(204).send();
  });

  // System Settings - Staff Limit
  app.get("/api/system-settings/staff-limit", async (req, res) => {
    try {
      const { systemSettings, staff, users } = await import("@shared/schema");
      const row = await db.select().from(systemSettings).where(eq(systemSettings.key, "staffLimit"));
      const limit = row.length > 0 ? parseInt(row[0].value) : 10;

      const activeStaff = await db
        .select({ id: staff.id })
        .from(staff)
        .innerJoin(users, eq(staff.userId, users.id))
        .where(
          and(
            eq(staff.status, "Hoạt động"),
            eq(users.isActive, true),
            ne(users.username, "admin"),
            notExists(
              db.select({ id: staffAssignments.id })
                .from(staffAssignments)
                .innerJoin(roles, eq(staffAssignments.roleId, roles.id))
                .where(
                  and(
                    eq(staffAssignments.staffId, staff.id),
                    inArray(roles.name, ["Học viên", "Phụ huynh"])
                  )
                )
            )
          )
        );

      res.json({ limit, activeStaffCount: activeStaff.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/system-settings/staff-limit", async (req, res) => {
    try {
      const { systemSettings } = await import("@shared/schema");
      const { limit } = z.object({ limit: z.number().int().min(1) }).parse(req.body);
      await db
        .insert(systemSettings)
        .values({ key: "staffLimit", value: String(limit) })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value: String(limit), updatedAt: new Date() } });
      cacheInvalidate("config:staff");
      res.json({ limit });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/system-settings/sidebar-visibility", async (req, res) => {
    try {
      const { systemSettings } = await import("@shared/schema");
      const row = await db.select().from(systemSettings).where(eq(systemSettings.key, "sidebarVisibility"));
      if (row.length > 0) {
        res.json(JSON.parse(row[0].value));
      } else {
        res.json({});
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/system-settings/sidebar-visibility", async (req, res) => {
    try {
      if (!req.isSuperAdmin) return res.status(403).json({ message: "Chỉ Super Admin mới có quyền thay đổi cài đặt này." });
      const { systemSettings } = await import("@shared/schema");
      const visibility = z.record(z.boolean()).parse(req.body);
      const value = JSON.stringify(visibility);
      await db
        .insert(systemSettings)
        .values({ key: "sidebarVisibility", value })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedAt: new Date() } });
      emitToAll({ type: "sidebar_visibility_changed", data: visibility });
      res.json(visibility);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  // Attendance Limit Settings
  app.get("/api/system-settings/attendance-limit", async (req, res) => {
    try {
      const { systemSettings } = await import("@shared/schema");
      const row = await db.select().from(systemSettings).where(eq(systemSettings.key, "attendanceLimit"));
      if (row.length > 0) {
        res.json(JSON.parse(row[0].value));
      } else {
        res.json({ beforeDays: 0, beforeHours: 0, beforeMinutes: 15, afterDays: 0, afterHours: 0, afterMinutes: 15, roleIds: [] });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/system-settings/attendance-limit", async (req, res) => {
    try {
      const { systemSettings } = await import("@shared/schema");
      const schema = z.object({
        beforeDays: z.number().int().min(0),
        beforeHours: z.number().int().min(0).max(23),
        beforeMinutes: z.number().int().min(0).max(59),
        afterDays: z.number().int().min(0),
        afterHours: z.number().int().min(0).max(23),
        afterMinutes: z.number().int().min(0).max(59),
        roleIds: z.array(z.string()),
      });
      const payload = schema.parse(req.body);
      const value = JSON.stringify(payload);
      await db
        .insert(systemSettings)
        .values({ key: "attendanceLimit", value })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedAt: new Date() } });
      res.json(payload);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  // My Permissions (current user's effective permissions for all resources)
  app.get("/api/my-permissions", async (req, res) => {
    try {
      if (req.isSuperAdmin) {
        return res.json({ isSuperAdmin: true, isStudent: false, departmentNames: [], systemDepartmentNames: [], permissions: {} });
      }

      if (req.isStudent) {
        const user = req.user as any;
        const [studentRecord] = await db.select({ type: students.type })
          .from(students)
          .where(eq(students.userId, user.id))
          .limit(1);
        const studentType = studentRecord?.type || "Học viên";

        // Tìm role tương ứng (Học viên hoặc Phụ huynh) trong phòng ban hệ thống (is_system=true)
        const [systemRole] = await db
          .select({ id: roles.id })
          .from(roles)
          .leftJoin(departments, eq(roles.departmentId, departments.id))
          .where(and(eq(roles.name, studentType), eq(departments.isSystem, true)))
          .limit(1);

        const studentPermMap: Record<string, { canView: boolean; canViewAll: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }> = {};
        if (systemRole) {
          const studentPerms = await storage.getAllPermissionsForRoles([systemRole.id]);
          for (const p of studentPerms) {
            studentPermMap[p.resource] = { canView: p.canView, canViewAll: p.canViewAll, canCreate: p.canCreate, canEdit: p.canEdit, canDelete: p.canDelete };
          }
        }
        const studentAssignmentsPerm = studentPermMap["/my-space/assignments"];
        studentPermMap["/my-space/assignments"] = {
          canView: true,
          canViewAll: false,
          canCreate: studentAssignmentsPerm?.canCreate ?? false,
          canEdit: studentAssignmentsPerm?.canEdit ?? false,
          canDelete: false,
        };
        studentPermMap[MY_SPACE_CALENDAR_RESOURCE] = normalizeMySpaceCalendarPermissions({}, true);

        return res.json({
          isSuperAdmin: false,
          isStudent: true,
          departmentNames: ["Phòng Khách hàng"],
          systemDepartmentNames: ["Phòng Khách hàng"],
          permissions: studentPermMap,
          staffId: null,
          userId: user.id,
          locationIds: [],
        });
      }

      const roleIds = (req as any).roleIds || [];
      const staffId = req.staffId;

      const allPerms = await storage.getAllPermissionsForRoles(roleIds);
      const permMap: Record<string, { canView: boolean; canViewAll: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }> = {};
      for (const p of allPerms) {
        const existing = permMap[p.resource];
        if (!existing) {
          permMap[p.resource] = { canView: p.canView, canViewAll: p.canViewAll, canCreate: p.canCreate, canEdit: p.canEdit, canDelete: p.canDelete };
        } else {
          permMap[p.resource] = {
            canView: existing.canView || p.canView,
            canViewAll: existing.canViewAll || p.canViewAll,
            canCreate: existing.canCreate || p.canCreate,
            canEdit: existing.canEdit || p.canEdit,
            canDelete: existing.canDelete || p.canDelete,
          };
        }
      }
      const assignmentsPerm = permMap["/my-space/assignments"];
      permMap["/my-space/assignments"] = {
        canView: true,
        canViewAll: false,
        canCreate: assignmentsPerm?.canCreate ?? false,
        canEdit: assignmentsPerm?.canEdit ?? false,
        canDelete: false,
      };
      permMap[MY_SPACE_CALENDAR_RESOURCE] = normalizeMySpaceCalendarPermissions(
        permMap[MY_SPACE_CALENDAR_RESOURCE],
      );

      let departmentNames: string[] = [];
      let systemDepartmentNames: string[] = [];
      if (staffId) {
        const assignments = await db
          .select({ departmentName: departments.name, isSystemDept: departments.isSystem })
          .from(staffAssignments)
          .leftJoin(departments, eq(staffAssignments.departmentId, departments.id))
          .where(eq(staffAssignments.staffId, staffId));
        departmentNames = assignments.map(a => a.departmentName).filter((n): n is string => !!n);
        systemDepartmentNames = assignments
          .filter(a => a.isSystemDept === true)
          .map(a => a.departmentName)
          .filter((n): n is string => !!n);
      }

      if (!permMap["/tasks#list"]) {
        permMap["/tasks#list"] = { canView: true, canViewAll: false, canCreate: false, canEdit: false, canDelete: false };
      }
      if (!permMap["/news-feed"]) {
        permMap["/news-feed"] = { canView: true, canViewAll: false, canCreate: false, canEdit: false, canDelete: false };
      }

      const userId = (req as any).user?.id ?? null;
      const locationIds = req.allowedLocationIds ?? [];

      res.json({ isSuperAdmin: false, isStudent: false, departmentNames, systemDepartmentNames, permissions: permMap, staffId: staffId ?? null, userId, locationIds });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Role Permissions
  app.get("/api/role-permissions", async (req, res) => {
    try {
      const { roleId } = z.object({ roleId: z.string().uuid() }).parse(req.query);
      const perms = await storage.getRolePermissions(roleId);
      res.json(perms.map(permission => permission.resource === MY_SPACE_CALENDAR_RESOURCE
        ? { ...permission, ...normalizeMySpaceCalendarPermissions(permission) }
        : permission.resource === "/my-space/score-sheet"
        ? { ...permission, canView: true, canViewAll: false, canDelete: false }
        : permission.resource === "/my-space/assignments"
          ? { ...permission, canView: true, canViewAll: false, canDelete: false }
          : permission));
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/role-permissions", async (req, res) => {
    try {
      const body = z.object({
        roleId: z.string().uuid(),
        resource: z.string(),
        canView: z.boolean(),
        canViewAll: z.boolean(),
        canCreate: z.boolean(),
        canEdit: z.boolean(),
        canDelete: z.boolean(),
      }).parse(req.body);
      const { roleId, resource, ...permissions } = body;
      const effectivePermissions = resource === MY_SPACE_CALENDAR_RESOURCE
        ? normalizeMySpaceCalendarPermissions(permissions)
        : resource === "/my-space/score-sheet"
        ? { ...permissions, canView: true, canViewAll: false, canDelete: false }
        : resource === "/my-space/assignments"
          ? { ...permissions, canView: true, canViewAll: false, canDelete: false }
          : permissions;
      const perm = await storage.upsertRolePermission(roleId, resource, effectivePermissions);
      cacheInvalidate("config:departments");
      res.json(perm);
      emitToAll({ type: "permissions_changed", roleId });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/role-permissions/batch", async (req, res) => {
    try {
      const body = z.object({
        roleId: z.string().uuid(),
        sessionId: z.string().min(1).max(100),
        permissions: z.array(z.object({
          resource: z.string(),
          canView: z.boolean(),
          canViewAll: z.boolean(),
          canCreate: z.boolean(),
          canEdit: z.boolean(),
          canDelete: z.boolean(),
        })).min(1),
      }).parse(req.body);
      const normalizedPermissions = body.permissions.map(permission => permission.resource === MY_SPACE_CALENDAR_RESOURCE
        ? { ...permission, ...normalizeMySpaceCalendarPermissions(permission) }
        : permission.resource === "/my-space/score-sheet"
        ? { ...permission, canView: true, canViewAll: false, canDelete: false }
        : permission.resource === "/my-space/assignments"
          ? { ...permission, canView: true, canViewAll: false, canDelete: false }
          : permission);
      const { rolePermissions } = await import("@shared/schema");
      const oldRows = await db.select().from(rolePermissions)
        .where(and(eq(rolePermissions.roleId, body.roleId), inArray(rolePermissions.resource, normalizedPermissions.map(p => p.resource))));
      const oldByResource = new Map(oldRows.map(row => [row.resource, row]));
      const changed = normalizedPermissions.filter(next => {
        const previous = oldByResource.get(next.resource);
        return !previous
          || previous.canView !== next.canView
          || previous.canViewAll !== next.canViewAll
          || previous.canCreate !== next.canCreate
          || previous.canEdit !== next.canEdit
          || previous.canDelete !== next.canDelete;
      });

      const saved = [];
      for (const permission of changed) {
        saved.push(await storage.upsertRolePermission(body.roleId, permission.resource, {
          canView: permission.canView,
          canViewAll: permission.canViewAll,
          canCreate: permission.canCreate,
          canEdit: permission.canEdit,
          canDelete: permission.canDelete,
        }));
      }

      if (changed.length > 0) {
        const [role] = await db.select({ name: roles.name, departmentName: departments.name })
          .from(roles)
          .leftJoin(departments, eq(roles.departmentId, departments.id))
          .where(eq(roles.id, body.roleId))
          .limit(1);
        const permissionSnapshot = (items: typeof normalizedPermissions) => ({
          roleId: body.roleId,
          roleName: role?.name ?? null,
          departmentName: role?.departmentName ?? null,
          permissions: items.map(({ resource, canView, canViewAll, canCreate, canEdit, canDelete }) => ({
            resource, canView, canViewAll, canCreate, canEdit, canDelete,
          })),
        });
        const oldPermissions = normalizedPermissions.map(permission => {
          const previous = oldByResource.get(permission.resource);
          return {
            ...permission,
            canView: previous?.canView ?? false,
            canViewAll: previous?.canViewAll ?? false,
            canCreate: previous?.canCreate ?? false,
            canEdit: previous?.canEdit ?? false,
            canDelete: previous?.canDelete ?? false,
          };
        }).filter(permission => changed.some(item => item.resource === permission.resource));
        const oldSnapshot = permissionSnapshot(oldPermissions);
        const newSnapshot = permissionSnapshot(changed);
        const recentLogs = await db.select({
          id: activityLogs.id,
          oldContent: activityLogs.oldContent,
          newContent: activityLogs.newContent,
        }).from(activityLogs)
          .where(and(
            eq(activityLogs.userId, requestUserId(req)),
            eq(activityLogs.action, "settings.permission.updated"),
          ))
          .orderBy(sql`${activityLogs.createdAt} desc`)
          .limit(100);
        const currentSessionLog = recentLogs.find(log => {
          try {
            const content = JSON.parse(log.newContent ?? "");
            return content.roleId === body.roleId && content.sessionId === body.sessionId;
          } catch {
            return false;
          }
        });

        if (currentSessionLog) {
          const previousNew = (() => {
            try { return JSON.parse(currentSessionLog.newContent ?? "{}"); } catch { return {}; }
          })();
          const previousPermissions = Array.isArray(previousNew.permissions) ? previousNew.permissions : [];
          const mergedPermissions = new Map<string, any>(
            previousPermissions.map((permission: any) => [String(permission.resource), permission]),
          );
          for (const permission of newSnapshot.permissions) {
            mergedPermissions.set(String(permission.resource), permission);
          }
          await db.update(activityLogs)
            .set({ newContent: JSON.stringify({
              ...newSnapshot,
              sessionId: body.sessionId,
              permissions: Array.from(mergedPermissions.values()),
            }) })
            .where(eq(activityLogs.id, currentSessionLog.id));
        } else {
          await recordEducationConfigAudit(req, {
            resource: "permission",
            scope: "settings",
            action: "updated",
            oldContent: { ...oldSnapshot, sessionId: body.sessionId },
            newContent: { ...newSnapshot, sessionId: body.sessionId },
          });
        }
      }

      cacheInvalidate("config:departments");
      res.json(saved);
      if (changed.length > 0) emitToAll({ type: "permissions_changed", roleId: body.roleId });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Attendance Fee Rules ───────────────────────────────────────────────────
  app.get("/api/attendance-fee-rules", async (_req, res) => {
    try {
      const rules = await getAttendanceFeeRules();
      res.json(rules);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/attendance-fee-rules", async (req, res) => {
    try {
      const body = z.object({
        attendanceStatus: z.string().min(1),
        deductsFee: z.boolean(),
      }).parse(req.body);
      const rule = await upsertAttendanceFeeRule(body);
      res.json(rule);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/attendance-fee-rules/:status", async (req, res) => {
    try {
      await deleteAttendanceFeeRule(req.params.status);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Score Categories (Danh mục điểm) ──────────────────────────────────────
  app.get("/api/score-categories", async (_req, res) => {
    try {
      const { scoreCategories } = await import("@shared/schema");
      const rows = await db.select().from(scoreCategories).orderBy(scoreCategories.name);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/score-categories", async (req, res) => {
    try {
      const { scoreCategories, insertScoreCategorySchema } = await import("@shared/schema");
      const input = insertScoreCategorySchema.parse(req.body);
      const [row] = await db.insert(scoreCategories).values(input).returning();
      res.json(row);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/score-categories/:id", async (req, res) => {
    try {
      const { scoreCategories, insertScoreCategorySchema } = await import("@shared/schema");
      const input = insertScoreCategorySchema.parse(req.body);
      const [row] = await db.update(scoreCategories).set(input).where(eq(scoreCategories.id, req.params.id)).returning();
      res.json(row);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/score-categories/:id", async (req, res) => {
    try {
      const { scoreCategories } = await import("@shared/schema");
      await db.delete(scoreCategories).where(eq(scoreCategories.id, req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── International Score Conversion Templates ─────────────────────────────
  app.get("/api/score-conversion-templates", async (req, res) => {
    try {
      const permissions = await getScoreConversionPermissions(req);
      if (!permissions.canView && !permissions.canViewAll) {
        return res.status(403).json({ message: "Bạn không có quyền xem cấu hình bảng điểm quy đổi." });
      }
      res.json(await readScoreConversionTemplates());
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/score-conversion-templates", async (req, res) => {
    try {
      const permissions = await getScoreConversionPermissions(req);
      if (!permissions.canCreate) {
        return res.status(403).json({ message: "Bạn không có quyền tạo cấu hình bảng điểm quy đổi." });
      }
      const input = scoreConversionTemplateInputSchema.parse(req.body);
      const now = new Date().toISOString();
      const template = scoreConversionTemplateSchema.parse({
        ...input,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      });
      const created = await mutateScoreConversionTemplates((templates) => {
        if (templates.some((existing) => sameScoreConversionType(existing, input))) {
          const error: any = new Error("Đã có bảng quy đổi cho loại này. Hãy mở bảng hiện có để chỉnh sửa.");
          error.code = "SCORE_CONVERSION_TYPE_EXISTS";
          throw error;
        }
        return {
          templates: [template, ...templates],
          result: template,
        };
      });
      res.status(201).json(created);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Cấu hình không hợp lệ." });
      if (err?.code === "SCORE_CONVERSION_TYPE_EXISTS") return res.status(409).json({ message: err.message });
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/score-conversion-templates/:id", async (req, res) => {
    try {
      const permissions = await getScoreConversionPermissions(req);
      if (!permissions.canEdit) {
        return res.status(403).json({ message: "Bạn không có quyền chỉnh sửa cấu hình bảng điểm quy đổi." });
      }
      const input = scoreConversionTemplateInputSchema.parse(req.body);
      const updated = await mutateScoreConversionTemplates((templates) => {
        const index = templates.findIndex((template) => template.id === req.params.id);
        if (index < 0) return { templates, result: null };
        const previous = templates[index];
        if (templates.some((existing) =>
          existing.id !== previous.id && sameScoreConversionType(existing, input))) {
          const error: any = new Error("Đã có bảng quy đổi cho loại này.");
          error.code = "SCORE_CONVERSION_TYPE_EXISTS";
          throw error;
        }
        const next = scoreConversionTemplateSchema.parse({
          ...input,
          id: previous.id,
          createdAt: previous.createdAt,
          updatedAt: new Date().toISOString(),
        });
        const nextTemplates = [...templates];
        nextTemplates[index] = next;
        return { templates: nextTemplates, result: next };
      });
      if (!updated) return res.status(404).json({ message: "Không tìm thấy cấu hình bài kiểm tra." });
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Cấu hình không hợp lệ." });
      if (err?.code === "SCORE_CONVERSION_TYPE_EXISTS") return res.status(409).json({ message: err.message });
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/score-conversion-templates/:id", async (req, res) => {
    try {
      const permissions = await getScoreConversionPermissions(req);
      if (!permissions.canDelete) {
        return res.status(403).json({ message: "Bạn không có quyền xóa cấu hình bảng điểm quy đổi." });
      }
      const result = await deleteScoreConversionTemplateIfUnassigned(req.params.id);
      if (result === "not_found") {
        return res.status(404).json({ message: "Không tìm thấy cấu hình bảng điểm quy đổi." });
      }
      if (result === "in_use") {
        return res.status(409).json({
          code: "SCORE_CONVERSION_TEMPLATE_IN_USE",
          message: "Không thể xóa cấu hình vì bảng quy đổi này đang được dùng trong ít nhất một buổi học của lớp.",
        });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Không thể xóa cấu hình bảng điểm quy đổi." });
    }
  });

  // ─── Score Sheet Templates ──────────────────────────────────────────────────
  app.get("/api/score-sheet-templates", async (req, res) => {
    try {
      const permissions = await getScoreConversionPermissions(req);
      if (!permissions.canView && !permissions.canViewAll) {
        return res.status(403).json({ message: "Bạn không có quyền xem cấu hình bảng điểm mẫu." });
      }
      res.json(await readScoreSheetTemplates());
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/score-sheet-templates", async (req, res) => {
    try {
      const permissions = await getScoreConversionPermissions(req);
      if (!permissions.canCreate) {
        return res.status(403).json({ message: "Bạn không có quyền tạo bảng điểm mẫu." });
      }
      const parsed = scoreSheetTemplateInputSchema.parse(req.body);
      const input = { ...parsed, code: parsed.code.trim().toUpperCase() };
      validateScoreSheetTemplateConversion(input, await readScoreConversionTemplates());
      const now = new Date().toISOString();
      const template = scoreSheetTemplateSchema.parse({
        ...input,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      });
      const created = await mutateScoreSheetTemplates((templates) => {
        if (templates.some((existing) => existing.code.toLocaleLowerCase() === template.code.toLocaleLowerCase())) {
          const error: any = new Error("Mã bảng điểm mẫu đã tồn tại.");
          error.code = "SCORE_SHEET_TEMPLATE_CODE_EXISTS";
          throw error;
        }
        return { templates: [template, ...templates], result: template };
      });
      res.status(201).json(created);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Cấu hình không hợp lệ." });
      if (err?.code === "SCORE_SHEET_TEMPLATE_CODE_EXISTS") return res.status(409).json({ message: err.message });
      if (err?.code === "SCORE_SHEET_TEMPLATE_CONVERSION_MISSING" || err?.code === "SCORE_SHEET_TEMPLATE_SKILLS_MISMATCH") {
        return res.status(400).json({ message: err.message });
      }
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/score-sheet-templates/:id", async (req, res) => {
    try {
      const permissions = await getScoreConversionPermissions(req);
      if (!permissions.canEdit) {
        return res.status(403).json({ message: "Bạn không có quyền chỉnh sửa bảng điểm mẫu." });
      }
      const parsed = scoreSheetTemplateInputSchema.parse(req.body);
      const input = { ...parsed, code: parsed.code.trim().toUpperCase() };
      validateScoreSheetTemplateConversion(input, await readScoreConversionTemplates());
      const updated = await mutateScoreSheetTemplates((templates) => {
        const index = templates.findIndex((template) => template.id === req.params.id);
        if (index < 0) return { templates, result: null };
        const previous = templates[index];
        if (templates.some((existing) =>
          existing.id !== previous.id
          && existing.code.toLocaleLowerCase() === input.code.toLocaleLowerCase())) {
          const error: any = new Error("Mã bảng điểm mẫu đã tồn tại.");
          error.code = "SCORE_SHEET_TEMPLATE_CODE_EXISTS";
          throw error;
        }
        const next = scoreSheetTemplateSchema.parse({
          ...input,
          id: previous.id,
          createdAt: previous.createdAt,
          updatedAt: new Date().toISOString(),
        });
        const nextTemplates = [...templates];
        nextTemplates[index] = next;
        return { templates: nextTemplates, result: next };
      });
      if (!updated) return res.status(404).json({ message: "Không tìm thấy bảng điểm mẫu." });
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Cấu hình không hợp lệ." });
      if (err?.code === "SCORE_SHEET_TEMPLATE_CODE_EXISTS") return res.status(409).json({ message: err.message });
      if (err?.code === "SCORE_SHEET_TEMPLATE_CONVERSION_MISSING" || err?.code === "SCORE_SHEET_TEMPLATE_SKILLS_MISMATCH") {
        return res.status(400).json({ message: err.message });
      }
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/score-sheet-templates/:id", async (req, res) => {
    try {
      const permissions = await getScoreConversionPermissions(req);
      if (!permissions.canDelete) {
        return res.status(403).json({ message: "Bạn không có quyền xóa bảng điểm mẫu." });
      }
      const result = await deleteScoreSheetTemplateIfUnassigned(req.params.id);
      if (result === "not_found") {
        return res.status(404).json({ message: "Không tìm thấy bảng điểm mẫu." });
      }
      if (result === "in_use") {
        return res.status(409).json({
          code: "SCORE_SHEET_TEMPLATE_IN_USE",
          message: "Không thể xóa bảng điểm mẫu vì bảng này đang được gán vào ít nhất một buổi học của lớp.",
        });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Không thể xóa bảng điểm mẫu." });
    }
  });

  app.get("/api/score-template-usage", async (req, res) => {
    try {
      const permissions = await getScoreConversionPermissions(req);
      if (
        !permissions.canView
        && !permissions.canViewAll
        && !permissions.canCreate
        && !permissions.canEdit
        && !permissions.canDelete
      ) {
        return res.status(403).json({ message: "Bạn không có quyền xem trạng thái sử dụng bảng điểm." });
      }
      res.json(await readScoreTemplateUsage());
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Không thể tải trạng thái sử dụng bảng điểm." });
    }
  });

  // ─── Score Sheet Assessments ────────────────────────────────────────────────
  app.get("/api/score-sheet-assessments/assigned", async (req, res) => {
    try {
      const permissions = await getScoreConversionPermissions(req);
      if (
        !permissions.canView
        && !permissions.canViewAll
        && !permissions.canCreate
        && !permissions.canEdit
        && !permissions.canDelete
      ) {
        return res.status(403).json({ message: "Bạn không có quyền xem danh sách bảng điểm." });
      }

      const [assessments, scoreSheetTemplates] = await Promise.all([
        readScoreSheetAssessments(),
        readScoreSheetTemplates(),
      ]);
      const assessmentsById = new Map(assessments.map((assessment) => [assessment.id, assessment]));
      const scoreSheetTemplatesById = new Map(
        scoreSheetTemplates.map((template) => [template.id, template]),
      );
      const result = await db.execute(sql`
        SELECT
          cs.id AS session_id,
          cs.class_id,
          cs.score_sheet_assessment_id AS assessment_id,
          cs.session_index,
          cs.session_date,
          cs.score_sheet_assessment_published AS published,
          cs.score_sheet_assessment_excluded_student_ids AS excluded_student_ids,
          st.start_time AS session_start_time,
          c.class_code,
          c.name AS class_name,
          loc.name AS location_name,
          assigned_teachers.teacher_names,
          (
            SELECT COUNT(DISTINCT ss.student_id)::int
            FROM student_sessions ss
            WHERE ss.class_session_id = cs.id
              AND NOT (ss.student_id = ANY(COALESCE(cs.score_sheet_assessment_excluded_student_ids, '{}'::uuid[])))
          ) AS student_count,
          (
            SELECT COUNT(DISTINCT attempt.student_id)::int
            FROM score_sheet_assessment_student_attempts attempt
            WHERE attempt.assessment_id = cs.score_sheet_assessment_id
              AND attempt.class_session_id = cs.id
              AND NOT (attempt.student_id = ANY(COALESCE(cs.score_sheet_assessment_excluded_student_ids, '{}'::uuid[])))
          ) AS entered_student_count
        FROM class_sessions cs
        JOIN classes c ON c.id = cs.class_id
        LEFT JOIN shift_templates st ON st.id = cs.shift_template_id
        LEFT JOIN locations loc ON loc.id = c.location_id
        LEFT JOIN LATERAL (
          SELECT string_agg(DISTINCT teacher.full_name, ', ' ORDER BY teacher.full_name) AS teacher_names
          FROM unnest(
            COALESCE(
              NULLIF(cs.teacher_ids, '{}'::uuid[]),
              c.teacher_ids,
              '{}'::uuid[]
            )
          ) AS assigned_teacher(id)
          JOIN staff teacher ON teacher.id = assigned_teacher.id
        ) assigned_teachers ON TRUE
        WHERE cs.score_sheet_assessment_id IS NOT NULL
        ORDER BY cs.session_date DESC, cs.session_index DESC, c.class_code
      `);

      const conversionRows = result.rows.filter((row: any) =>
        assessmentsById.get(row.assessment_id)?.templateSnapshot.scoreConversionTemplateId,
      );
      const conversionSessionIds = conversionRows.map((row: any) => String(row.session_id));
      const conversionAssessmentIds = Array.from(
        new Set(conversionRows.map((row: any) => String(row.assessment_id))),
      );
      const excludedStudentIdsBySession = new Map<string, Set<string>>(
        conversionRows.map((row: any) => [
          String(row.session_id),
          new Set<string>((row.excluded_student_ids ?? []).map(String)),
        ]),
      );
      const assessmentAttempts = conversionSessionIds.length
        ? await db.select({
            assessmentId: scoreSheetAssessmentStudentAttempts.assessmentId,
            classSessionId: scoreSheetAssessmentStudentAttempts.classSessionId,
            studentId: scoreSheetAssessmentStudentAttempts.studentId,
            attemptNumber: scoreSheetAssessmentStudentAttempts.attemptNumber,
            result: scoreSheetAssessmentStudentAttempts.result,
          })
          .from(scoreSheetAssessmentStudentAttempts)
          .innerJoin(
            studentSessions,
            and(
              eq(studentSessions.classSessionId, scoreSheetAssessmentStudentAttempts.classSessionId),
              eq(studentSessions.studentId, scoreSheetAssessmentStudentAttempts.studentId),
            ),
          )
          .where(and(
            inArray(scoreSheetAssessmentStudentAttempts.classSessionId, conversionSessionIds),
            inArray(scoreSheetAssessmentStudentAttempts.assessmentId, conversionAssessmentIds),
          ))
        : [];
      const attemptsBySessionStudent = new Map<string, Map<string, Map<number, {
        attemptNumber: number;
        result: unknown;
      }>>>();
      for (const attempt of assessmentAttempts) {
        if (excludedStudentIdsBySession.get(String(attempt.classSessionId))?.has(String(attempt.studentId))) {
          continue;
        }
        const sessionKey = `${attempt.assessmentId}:${attempt.classSessionId}`;
        let studentsForSession = attemptsBySessionStudent.get(sessionKey);
        if (!studentsForSession) {
          studentsForSession = new Map();
          attemptsBySessionStudent.set(sessionKey, studentsForSession);
        }
        let attemptsForStudent = studentsForSession.get(attempt.studentId);
        if (!attemptsForStudent) {
          attemptsForStudent = new Map();
          studentsForSession.set(attempt.studentId, attemptsForStudent);
        }
        attemptsForStudent.set(attempt.attemptNumber, {
          attemptNumber: attempt.attemptNumber,
          result: attempt.result,
        });
      }

      const mapped = result.rows.flatMap((row: any) => {
        const assessment = assessmentsById.get(row.assessment_id);
        if (!assessment?.templateSnapshot.scoreConversionTemplateId) return [];
        const currentTemplate = scoreSheetTemplatesById.get(assessment.scoreSheetTemplateId);
        const sessionKey = `${row.assessment_id}:${row.session_id}`;
        const studentAttempts = attemptsBySessionStudent.get(sessionKey);
        const completedStudentCount = Array.from(studentAttempts?.values() ?? [])
          .filter((attempts) => selectScoreSheetAssessmentAttemptSummary(
            Array.from(attempts.values()),
            assessment.scoringPolicy,
            true,
          )?.result.inputComplete)
          .length;
        const individuallyPublishedStudentCount = Array.from(studentAttempts?.values() ?? [])
          .filter((attempts) =>
            Array.from(attempts.values()).some((attempt) =>
              isScoreSheetAssessmentStudentPublished(attempt.result),
            ),
          )
          .length;
        const studentCount = Number(row.student_count ?? 0);
        return [{
          sessionId: row.session_id,
          classId: row.class_id,
          classCode: row.class_code,
          className: row.class_name,
          locationName: row.location_name ?? null,
          teacherNames: row.teacher_names ?? null,
          sessionIndex: row.session_index,
          studentCount,
          enteredStudentCount: row.entered_student_count ?? 0,
          completedStudentCount,
          individuallyPublishedStudentCount,
          allStudentsIndividuallyPublished: studentCount > 0
            && individuallyPublishedStudentCount === studentCount,
          examDate: row.session_date,
          assessmentId: row.assessment_id,
          assessmentCode: assessment.code,
          assessmentName: assessment.name,
          templateName: currentTemplate?.name ?? assessment.templateSnapshot.name,
          scoreDeadlineAt: resolveScoreSheetAssessmentDeadlineAt(
            assessment,
            row.session_date,
            row.session_start_time,
            currentTemplate?.scoreDeadlineOffsetMinutes,
          ),
          published: Boolean(row.published),
          attemptCount: assessment.attemptCount,
          scoringPolicy: assessment.scoringPolicy,
          hasConversion: true,
        }];
      });

      const manualAssessments = assessments.filter((assessment) =>
        assessment.creationMode === "manual"
        && Boolean(assessment.templateSnapshot.scoreConversionTemplateId),
      );
      const manualAssessmentIds = manualAssessments.map((assessment) => assessment.id);
      const manualAttemptRows = manualAssessmentIds.length > 0
        ? await db.select({
            assessmentId: scoreSheetAssessmentStudentAttempts.assessmentId,
            studentId: scoreSheetAssessmentStudentAttempts.studentId,
            attemptNumber: scoreSheetAssessmentStudentAttempts.attemptNumber,
            result: scoreSheetAssessmentStudentAttempts.result,
          })
          .from(scoreSheetAssessmentStudentAttempts)
          .where(and(
            isNull(scoreSheetAssessmentStudentAttempts.classSessionId),
            inArray(scoreSheetAssessmentStudentAttempts.assessmentId, manualAssessmentIds),
          ))
        : [];
      const manualAttemptsByAssessment = new Map<string, Map<string, Array<{
        attemptNumber: number;
        result: unknown;
      }>>>();
      for (const attempt of manualAttemptRows) {
        const studentsForAssessment = manualAttemptsByAssessment.get(attempt.assessmentId) ?? new Map();
        const attemptsForStudent = studentsForAssessment.get(attempt.studentId) ?? [];
        attemptsForStudent.push({
          attemptNumber: attempt.attemptNumber,
          result: attempt.result,
        });
        studentsForAssessment.set(attempt.studentId, attemptsForStudent);
        manualAttemptsByAssessment.set(attempt.assessmentId, studentsForAssessment);
      }
      const manualMapped = manualAssessments.map((assessment) => {
        const currentTemplate = scoreSheetTemplatesById.get(assessment.scoreSheetTemplateId);
        const attemptsByStudent = manualAttemptsByAssessment.get(assessment.id)
          ?? new Map<string, Array<{ attemptNumber: number; result: unknown }>>();
        const enteredStudentCount = attemptsByStudent.size;
        const completedStudentCount = assessment.manualStudentIds.filter((studentId) =>
          selectScoreSheetAssessmentAttemptSummary(
            attemptsByStudent.get(studentId) ?? [],
            assessment.scoringPolicy,
            true,
          )?.result.inputComplete,
        ).length;
        const individuallyPublishedStudentCount = Array.from(attemptsByStudent.values())
          .filter((attempts) => attempts.some((attempt) =>
            isScoreSheetAssessmentStudentPublished(attempt.result),
          ))
          .length;
        return {
          sessionId: assessment.id,
          isManual: true,
          classId: "manual",
          classCode: "Thủ công",
          className: "Thủ công",
          locationName: null,
          teacherNames: null,
          sessionIndex: null,
          studentCount: assessment.manualStudentIds.length,
          enteredStudentCount,
          completedStudentCount,
          individuallyPublishedStudentCount,
          allStudentsIndividuallyPublished: assessment.manualStudentIds.length > 0
            && individuallyPublishedStudentCount === assessment.manualStudentIds.length,
          examDate: assessment.createdAt,
          assessmentId: assessment.id,
          assessmentCode: assessment.code,
          assessmentName: assessment.name,
          templateName: currentTemplate?.name ?? assessment.templateSnapshot.name,
          scoreDeadlineAt: null,
          published: false,
          attemptCount: assessment.attemptCount,
          scoringPolicy: assessment.scoringPolicy,
          hasConversion: true,
        };
      });

      res.json([...mapped, ...manualMapped].sort((left, right) =>
        String(right.examDate).localeCompare(String(left.examDate)),
      ));
    } catch (err: any) {
      console.error("Assigned score conversion assessments error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải danh sách bảng điểm Quy đổi" });
    }
  });

  app.get("/api/score-sheet-assessments/assigned/students", async (req, res) => {
    try {
      const permissions = await getScoreConversionPermissions(req);
      if (
        !permissions.canView
        && !permissions.canViewAll
        && !permissions.canCreate
        && !permissions.canEdit
        && !permissions.canDelete
      ) {
        return res.status(403).json({ message: "Bạn không có quyền xem danh sách học viên." });
      }

      const [assessments, scoreSheetTemplates] = await Promise.all([
        readScoreSheetAssessments(),
        readScoreSheetTemplates(),
      ]);
      const assessmentsById = new Map(assessments.map((assessment) => [assessment.id, assessment]));
      const scoreSheetTemplatesById = new Map(
        scoreSheetTemplates.map((template) => [template.id, template]),
      );
      const result = await db.execute(sql`
        SELECT
          cs.id AS session_id,
          cs.class_id,
          cs.score_sheet_assessment_id AS assessment_id,
          cs.session_index,
          cs.session_date,
          cs.score_sheet_assessment_published AS published,
          cs.score_sheet_assessment_excluded_student_ids AS excluded_student_ids,
          st.start_time AS session_start_time,
          c.class_code,
          c.name AS class_name,
          loc.name AS location_name,
          assigned_teachers.teacher_names
        FROM class_sessions cs
        JOIN classes c ON c.id = cs.class_id
        LEFT JOIN shift_templates st ON st.id = cs.shift_template_id
        LEFT JOIN locations loc ON loc.id = c.location_id
        LEFT JOIN LATERAL (
          SELECT string_agg(DISTINCT teacher.full_name, ', ' ORDER BY teacher.full_name) AS teacher_names
          FROM unnest(
            COALESCE(
              NULLIF(cs.teacher_ids, '{}'::uuid[]),
              c.teacher_ids,
              '{}'::uuid[]
            )
          ) AS assigned_teacher(id)
          JOIN staff teacher ON teacher.id = assigned_teacher.id
        ) assigned_teachers ON TRUE
        WHERE cs.score_sheet_assessment_id IS NOT NULL
        ORDER BY cs.session_date DESC, cs.session_index DESC, c.class_code
      `);
      const conversionRows = result.rows.filter((row: any) =>
        assessmentsById.get(row.assessment_id)?.templateSnapshot.scoreConversionTemplateId,
      );
      const conversionSessionIds = conversionRows.map((row: any) => String(row.session_id));
      const conversionAssessmentIds = Array.from(
        new Set(conversionRows.map((row: any) => String(row.assessment_id))),
      );
      const manualAssessments = assessments.filter((assessment) =>
        assessment.creationMode === "manual"
        && Boolean(assessment.templateSnapshot.scoreConversionTemplateId),
      );
      const manualAssessmentIds = manualAssessments.map((assessment) => assessment.id);
      const manualStudentIds = Array.from(
        new Set(manualAssessments.flatMap((assessment) => assessment.manualStudentIds)),
      );

      const excludedStudentIdsBySession = new Map<string, Set<string>>(
        conversionRows.map((row: any) => [
          String(row.session_id),
          new Set<string>((row.excluded_student_ids ?? []).map(String)),
        ]),
      );
      const rosterRows = conversionSessionIds.length > 0
        ? await db
          .select({
            classSessionId: studentSessions.classSessionId,
            studentId: studentSessions.studentId,
            code: students.code,
            fullName: students.fullName,
          })
          .from(studentSessions)
          .innerJoin(students, eq(students.id, studentSessions.studentId))
          .where(inArray(studentSessions.classSessionId, conversionSessionIds))
        : [];
      const studentsBySession = new Map<string, Map<string, {
        studentId: string;
        code: string;
        fullName: string;
      }>>();
      for (const row of rosterRows) {
        const sessionKey = String(row.classSessionId);
        const sessionStudents = studentsBySession.get(sessionKey) ?? new Map();
        sessionStudents.set(String(row.studentId), {
          studentId: String(row.studentId),
          code: row.code,
          fullName: row.fullName,
        });
        studentsBySession.set(sessionKey, sessionStudents);
      }

      const attemptRows = conversionSessionIds.length > 0
        ? await db
          .select({
            assessmentId: scoreSheetAssessmentStudentAttempts.assessmentId,
            classSessionId: scoreSheetAssessmentStudentAttempts.classSessionId,
            studentId: scoreSheetAssessmentStudentAttempts.studentId,
            attemptNumber: scoreSheetAssessmentStudentAttempts.attemptNumber,
            result: scoreSheetAssessmentStudentAttempts.result,
          })
          .from(scoreSheetAssessmentStudentAttempts)
          .innerJoin(
            studentSessions,
            and(
              eq(studentSessions.classSessionId, scoreSheetAssessmentStudentAttempts.classSessionId),
              eq(studentSessions.studentId, scoreSheetAssessmentStudentAttempts.studentId),
            ),
          )
          .where(and(
            inArray(scoreSheetAssessmentStudentAttempts.classSessionId, conversionSessionIds),
            inArray(scoreSheetAssessmentStudentAttempts.assessmentId, conversionAssessmentIds),
          ))
        : [];
      const attemptsBySessionStudent = new Map<string, Array<{
        attemptNumber: number;
        result: unknown;
      }>>();
      for (const attempt of attemptRows) {
        const key = `${attempt.assessmentId}:${attempt.classSessionId}:${attempt.studentId}`;
        const attempts = attemptsBySessionStudent.get(key) ?? [];
        attempts.push({
          attemptNumber: attempt.attemptNumber,
          result: attempt.result,
        });
        attemptsBySessionStudent.set(key, attempts);
      }

      const mapped = conversionRows.flatMap((row: any) => {
        const assessment = assessmentsById.get(row.assessment_id);
        if (!assessment?.templateSnapshot.scoreConversionTemplateId) return [];
        const currentTemplate = scoreSheetTemplatesById.get(assessment.scoreSheetTemplateId);
        const sessionId = String(row.session_id);
        const excludedStudentIds = excludedStudentIdsBySession.get(sessionId) ?? new Set<string>();
        const sessionStudents = studentsBySession.get(sessionId) ?? new Map();
        return Array.from(sessionStudents.values())
          .filter((student) => !excludedStudentIds.has(student.studentId))
          .map((student) => {
            const attempts = attemptsBySessionStudent.get(
              `${row.assessment_id}:${row.session_id}:${student.studentId}`,
            ) ?? [];
            const summary = selectScoreSheetAssessmentAttemptSummary(
              attempts,
              assessment.scoringPolicy,
              true,
            );
            return {
              sessionId: row.session_id,
              classId: row.class_id,
              classCode: row.class_code,
              className: row.class_name,
              locationName: row.location_name ?? null,
              teacherNames: row.teacher_names ?? null,
              sessionIndex: row.session_index,
              examDate: row.session_date,
              assessmentId: row.assessment_id,
              assessmentCode: assessment.code,
              assessmentName: assessment.name,
              templateName: currentTemplate?.name ?? assessment.templateSnapshot.name,
              scoreDeadlineAt: resolveScoreSheetAssessmentDeadlineAt(
                assessment,
                row.session_date,
                row.session_start_time,
                currentTemplate?.scoreDeadlineOffsetMinutes,
              ),
              attemptCount: assessment.attemptCount,
              scoringPolicy: assessment.scoringPolicy,
              hasConversion: true,
              published: row.published === true,
              studentId: student.studentId,
              studentCode: student.code,
              studentName: student.fullName,
              attemptsTaken: attempts.length,
              attemptNumber: summary?.attemptNumber ?? null,
              rawScore: summary?.result.overallRawScore ?? null,
              convertedScore: summary?.result.overallConvertedScore ?? null,
              gradeBandLabel: summary?.result.gradeBand?.label ?? null,
              gradeBandColor: summary?.result.gradeBand?.color ?? null,
              passStatus: summary?.result.passStatus ?? null,
              inputComplete: summary?.result.inputComplete ?? false,
              individuallyPublished: attempts.some((attempt) =>
                isScoreSheetAssessmentStudentPublished(attempt.result),
              ),
              hasPublishableScore: Boolean(summary && (
                summary.result.overallConvertedScore !== null
                || summary.result.skills.some((skill) => skill.convertedScore !== null)
              )),
              status: !summary
                ? "not_entered"
                : summary.result.inputComplete
                  ? "complete"
                  : "in_progress",
            };
          });
      });
      const manualStudentRows = manualStudentIds.length > 0
        ? await db.select({
            studentId: students.id,
            code: students.code,
            fullName: students.fullName,
          })
          .from(students)
          .where(inArray(students.id, manualStudentIds))
        : [];
      const manualStudentsById = new Map(
        manualStudentRows.map((student) => [String(student.studentId), student]),
      );
      const manualAttemptRows = manualAssessmentIds.length > 0
        ? await db.select({
            assessmentId: scoreSheetAssessmentStudentAttempts.assessmentId,
            studentId: scoreSheetAssessmentStudentAttempts.studentId,
            attemptNumber: scoreSheetAssessmentStudentAttempts.attemptNumber,
            result: scoreSheetAssessmentStudentAttempts.result,
          })
          .from(scoreSheetAssessmentStudentAttempts)
          .where(and(
            isNull(scoreSheetAssessmentStudentAttempts.classSessionId),
            inArray(scoreSheetAssessmentStudentAttempts.assessmentId, manualAssessmentIds),
          ))
        : [];
      const manualAttemptsByAssessmentStudent = new Map<string, Array<{
        attemptNumber: number;
        result: unknown;
      }>>();
      for (const attempt of manualAttemptRows) {
        const key = `${attempt.assessmentId}:${attempt.studentId}`;
        const attempts = manualAttemptsByAssessmentStudent.get(key) ?? [];
        attempts.push({
          attemptNumber: attempt.attemptNumber,
          result: attempt.result,
        });
        manualAttemptsByAssessmentStudent.set(key, attempts);
      }
      const manualMapped = manualAssessments.flatMap((assessment) => {
        const currentTemplate = scoreSheetTemplatesById.get(assessment.scoreSheetTemplateId);
        return assessment.manualStudentIds.flatMap((studentId) => {
          const student = manualStudentsById.get(studentId);
          if (!student) return [];
          const attempts = manualAttemptsByAssessmentStudent.get(
            `${assessment.id}:${studentId}`,
          ) ?? [];
          const summary = selectScoreSheetAssessmentAttemptSummary(
            attempts,
            assessment.scoringPolicy,
            true,
          );
          return [{
            sessionId: assessment.id,
            isManual: true,
            classId: "manual",
            classCode: "Thủ công",
            className: "Thủ công",
            locationName: null,
            teacherNames: null,
            sessionIndex: null,
            examDate: assessment.createdAt,
            assessmentId: assessment.id,
            assessmentCode: assessment.code,
            assessmentName: assessment.name,
            templateName: currentTemplate?.name ?? assessment.templateSnapshot.name,
            scoreDeadlineAt: null,
            attemptCount: assessment.attemptCount,
            scoringPolicy: assessment.scoringPolicy,
            hasConversion: true,
            published: false,
            studentId,
            studentCode: student.code,
            studentName: student.fullName,
            attemptsTaken: attempts.length,
            attemptNumber: summary?.attemptNumber ?? null,
            rawScore: summary?.result.overallRawScore ?? null,
            convertedScore: summary?.result.overallConvertedScore ?? null,
            gradeBandLabel: summary?.result.gradeBand?.label ?? null,
            gradeBandColor: summary?.result.gradeBand?.color ?? null,
            passStatus: summary?.result.passStatus ?? null,
            inputComplete: summary?.result.inputComplete ?? false,
            individuallyPublished: attempts.some((attempt) =>
              isScoreSheetAssessmentStudentPublished(attempt.result),
            ),
            hasPublishableScore: Boolean(summary && (
              summary.result.overallConvertedScore !== null
              || summary.result.skills.some((skill) => skill.convertedScore !== null)
            )),
            status: !summary
              ? "not_entered"
              : summary.result.inputComplete
                ? "complete"
                : "in_progress",
          }];
        });
      });

      res.json([...mapped, ...manualMapped].sort((left, right) =>
        String(right.examDate).localeCompare(String(left.examDate)),
      ));
    } catch (err: any) {
      console.error("Assigned score conversion students error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải danh sách học viên bảng điểm Quy đổi" });
    }
  });

  app.get("/api/score-sheet-assessments", async (req, res) => {
    try {
      // Session assignment uses this list in the same way as /api/score-sheets.
      // Keep it readable for users who can manage class schedules, even if
      // they do not administer score-conversion settings.
      const [assessments, templates] = await Promise.all([
        readScoreSheetAssessments(),
        readScoreSheetTemplates(),
      ]);
      const templatesById = new Map(templates.map((template) => [template.id, template]));
      res.json(assessments.filter((assessment) => assessment.creationMode !== "manual").map((assessment) => {
        const currentTemplate = templatesById.get(assessment.scoreSheetTemplateId);
        return {
          ...assessment,
          currentTemplate: currentTemplate
            ? { code: currentTemplate.code, name: currentTemplate.name }
            : null,
        };
      }));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/score-sheet-assessments", async (req, res) => {
    try {
      const parsed = scoreSheetAssessmentInputSchema.parse(req.body);
      const permissions = await getScoreConversionPermissions(req);
      const mySpacePermissions = req.isSuperAdmin
        ? { canCreate: true }
        : await storage.getEffectivePermissions(req.roleIds ?? [], "/my-space/score-sheet");
      const canCreate = parsed.creationMode === "manual"
        ? permissions.canCreate || mySpacePermissions.canCreate
        : permissions.canCreate;
      if (!canCreate) {
        return res.status(403).json({ message: "Bạn không có quyền tạo bảng điểm." });
      }
      if (
        parsed.creationMode === "manual"
        && !await areManualScoreSheetStudentsAccessible(req, parsed)
      ) {
        return res.status(403).json({ message: "Danh sách có học viên ngoài lớp bạn được phân công." });
      }

      const scoreSheetTemplate = (await readScoreSheetTemplates())
        .find((template) => template.id === parsed.scoreSheetTemplateId);
      if (!scoreSheetTemplate) {
        const error: any = new Error("Không tìm thấy bảng điểm mẫu đã chọn.");
        error.code = "SCORE_SHEET_ASSESSMENT_TEMPLATE_MISSING";
        throw error;
      }
      if (parsed.creationMode === "manual" && !scoreSheetTemplate.scoreConversionTemplateId) {
        return res.status(400).json({ message: "Bảng điểm thủ công cần có cấu hình điểm quy đổi." });
      }
      const conversionTemplateSnapshot = scoreSheetTemplate.scoreConversionTemplateId
        ? (await readScoreConversionTemplates()).find(
          (template) => template.id === scoreSheetTemplate.scoreConversionTemplateId,
        ) ?? null
        : null;
      if (scoreSheetTemplate.scoreConversionTemplateId && !conversionTemplateSnapshot) {
        const error: any = new Error("Không tìm thấy bảng quy đổi của bảng điểm mẫu.");
        error.code = "SCORE_SHEET_ASSESSMENT_CONVERSION_MISSING";
        throw error;
      }

      const now = new Date().toISOString();
      const { initialScoresByStudent = {}, ...assessmentInput } = parsed;
      const assessment = scoreSheetAssessmentSchema.parse({
        ...assessmentInput,
        code: assessmentInput.code.toUpperCase(),
        id: randomUUID(),
        scoreDeadlineAt: null,
        attemptCount: scoreSheetTemplate.attemptCount,
        scoringPolicy: scoreSheetTemplate.scoringPolicy,
        templateSnapshot: scoreSheetTemplate,
        conversionTemplateSnapshot,
        createdAt: now,
        updatedAt: now,
      });
      const created = await mutateScoreSheetAssessments(
        (assessments) => {
          if (assessments.some((existing) =>
            existing.code.toLocaleLowerCase() === assessment.code.toLocaleLowerCase())) {
            const error: any = new Error("Mã bảng điểm đã tồn tại.");
            error.code = "SCORE_SHEET_ASSESSMENT_CODE_EXISTS";
            throw error;
          }
          return { assessments: [assessment, ...assessments], result: assessment };
        },
        async (tx, createdAssessment) => {
          if (createdAssessment.creationMode !== "manual") return;
          const userId = (req.user as any)?.id ?? null;
          const initialAttempts = createdAssessment.manualStudentIds.flatMap((studentId) => {
            const values = initialScoresByStudent[studentId];
            if (!values || !hasScoreSheetAssessmentInput(values)) return [];
            const result = calculateScoreSheetAssessmentAttemptResult({
              template: createdAssessment.templateSnapshot,
              conversionTemplate: createdAssessment.conversionTemplateSnapshot ?? null,
              values,
            });
            return [{
              assessmentId: createdAssessment.id,
              classSessionId: null,
              studentId,
              attemptNumber: 1,
              partScores: values.partScores,
              skillScores: values.skillScores,
              notes: values.notes,
              result: { ...result, evaluationResponses: values.evaluationResponses },
              createdBy: userId,
              updatedBy: userId,
              createdAt: new Date(),
              updatedAt: new Date(),
            }];
          });
          if (initialAttempts.length > 0) {
            await tx.insert(scoreSheetAssessmentStudentAttempts).values(initialAttempts);
          }
        },
      );
      res.status(201).json(created);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Thông tin bảng điểm không hợp lệ." });
      }
      if (err?.code === "SCORE_SHEET_ASSESSMENT_TEMPLATE_MISSING") {
        return res.status(400).json({ message: err.message });
      }
      if (err?.code === "SCORE_SHEET_ASSESSMENT_CONVERSION_MISSING") {
        return res.status(400).json({ message: err.message });
      }
      if (err?.code === "SCORE_SHEET_ASSESSMENT_CODE_EXISTS") {
        return res.status(409).json({ message: err.message });
      }
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Score Sheets (Bảng điểm) ──────────────────────────────────────────────
  app.get("/api/score-sheets", async (_req, res) => {
    try {
      const { scoreSheets, scoreSheetItems, scoreCategories } = await import("@shared/schema");
      const sheets = await db.select().from(scoreSheets).orderBy(scoreSheets.name);
      const items = await db
        .select({ item: scoreSheetItems, category: scoreCategories })
        .from(scoreSheetItems)
        .leftJoin(scoreCategories, eq(scoreSheetItems.categoryId, scoreCategories.id))
        .orderBy(scoreSheetItems.order);
      const result = sheets.map((sheet) => ({
        ...sheet,
        items: items
          .filter((i) => i.item.scoreSheetId === sheet.id)
          .map((i) => ({ ...i.item, category: i.category })),
      }));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/score-sheets", async (req, res) => {
    try {
      const { scoreSheets, scoreSheetItems } = await import("@shared/schema");
      const body = z.object({
        name: z.string().min(1),
        items: z.array(z.object({
          categoryId: z.string().uuid(),
          formula: z.string().default(""),
          order: z.number().int().default(0),
        })).default([]),
      }).parse(req.body);
      const [sheet] = await db.insert(scoreSheets).values({ name: body.name }).returning();
      if (body.items.length > 0) {
        await db.insert(scoreSheetItems).values(
          body.items.map((item, idx) => ({ ...item, scoreSheetId: sheet.id, order: item.order ?? idx }))
        );
      }
      res.json(sheet);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/score-sheets/:id", async (req, res) => {
    try {
      const { scoreSheets, scoreSheetItems, classGradeBooks } = await import("@shared/schema");
      const body = z.object({
        name: z.string().min(1),
        items: z.array(z.object({
          categoryId: z.string().uuid(),
          formula: z.string().default(""),
          order: z.number().int().default(0),
        })).default([]),
      }).parse(req.body);
      const sheet = await db.transaction(async (tx) => {
        const previousItems = await tx
          .select({ categoryId: scoreSheetItems.categoryId })
          .from(scoreSheetItems)
          .where(eq(scoreSheetItems.scoreSheetId, req.params.id))
          .orderBy(scoreSheetItems.order);
        const previousOrder = previousItems.map((item) => item.categoryId);
        const nextOrder = body.items.map((item) => item.categoryId);
        const orderChanged = previousOrder.length !== nextOrder.length
          || previousOrder.some((categoryId, index) => categoryId !== nextOrder[index]);

        if (orderChanged) {
          await tx.update(classGradeBooks)
            .set({ scoreSheetCategoryOrderSnapshot: previousOrder })
            .where(and(
              eq(classGradeBooks.scoreSheetId, req.params.id),
              isNull(classGradeBooks.scoreSheetCategoryOrderSnapshot),
            ));
        }

        const [updatedSheet] = await tx.update(scoreSheets)
          .set({ name: body.name })
          .where(eq(scoreSheets.id, req.params.id))
          .returning();
        await tx.delete(scoreSheetItems).where(eq(scoreSheetItems.scoreSheetId, req.params.id));
        if (body.items.length > 0) {
          await tx.insert(scoreSheetItems).values(
            body.items.map((item, idx) => ({ ...item, scoreSheetId: req.params.id, order: item.order ?? idx }))
          );
        }
        return updatedSheet;
      });
      res.json(sheet);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/score-sheets/:id", async (req, res) => {
    try {
      const { scoreSheets } = await import("@shared/schema");
      await db.delete(scoreSheets).where(eq(scoreSheets.id, req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Online Learning Rules ────────────────────────────────────────────────────
  // NOTE: Table is defined in shared/schema.ts (onlineLearningRules).
  // Do NOT add CREATE TABLE / ALTER TABLE here — use schema.ts + drizzle migration instead.

  app.get("/api/online-learning-rules", async (_req, res) => {
    try {
      const { onlineLearningRules } = await import("@shared/schema");
      const rules = await db.select().from(onlineLearningRules).orderBy(onlineLearningRules.createdAt);
      res.json(rules);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/online-learning-rules", async (req, res) => {
    try {
      const { onlineLearningRules } = await import("@shared/schema");
      const body = z.object({
        locationId: z.string().uuid(),
        earlyEntryMinutes: z.coerce.number().int().min(0).default(0),
        lateEntryMinutes: z.coerce.number().int().min(0).default(0),
        earlyEndMinutes: z.coerce.number().int().min(0).default(0),
        autoAttendanceOnJoin: z.boolean().default(false),
      }).parse(req.body);
      const [row] = await db.insert(onlineLearningRules).values({
        locationId: body.locationId,
        earlyEntryMinutes: body.earlyEntryMinutes,
        lateEntryMinutes: body.lateEntryMinutes,
        earlyEndMinutes: body.earlyEndMinutes,
        autoAttendanceOnJoin: body.autoAttendanceOnJoin,
      }).returning();
      res.status(201).json(row);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/online-learning-rules/:id", async (req, res) => {
    try {
      const { onlineLearningRules } = await import("@shared/schema");
      const body = z.object({
        locationId: z.string().uuid(),
        earlyEntryMinutes: z.coerce.number().int().min(0).default(0),
        lateEntryMinutes: z.coerce.number().int().min(0).default(0),
        earlyEndMinutes: z.coerce.number().int().min(0).default(0),
        autoAttendanceOnJoin: z.boolean().default(false),
      }).parse(req.body);
      const [row] = await db
        .update(onlineLearningRules)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(onlineLearningRules.id, req.params.id))
        .returning();
      if (!row) return res.status(404).json({ message: "Không tìm thấy" });
      res.json(row);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/online-learning-rules/:id", async (req, res) => {
    try {
      const { onlineLearningRules } = await import("@shared/schema");
      await db.delete(onlineLearningRules).where(eq(onlineLearningRules.id, req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Public Holidays (Ngày nghỉ lễ) ──────────────────────────────────────
  // Table declared in shared/schema.ts — apply via push-db-direct.ts

  app.get("/api/public-holidays", async (req, res) => {
    try {
      const { publicHolidays } = await import("@shared/schema");
      const rows = await db.select().from(publicHolidays).orderBy(publicHolidays.startDate);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/public-holidays", async (req, res) => {
    try {
      const { publicHolidays } = await import("@shared/schema");
      const body = z.object({
        name: z.string().min(1),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: z.string().optional().nullable(),
      }).parse(req.body);
      const [row] = await db.insert(publicHolidays).values(body).returning();
      res.status(201).json(row);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/public-holidays/:id", async (req, res) => {
    try {
      const { publicHolidays } = await import("@shared/schema");
      const body = z.object({
        name: z.string().min(1),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: z.string().optional().nullable(),
      }).parse(req.body);
      const [row] = await db
        .update(publicHolidays)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(publicHolidays.id, req.params.id))
        .returning();
      if (!row) return res.status(404).json({ message: "Không tìm thấy" });
      res.json(row);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/public-holidays/:id", async (req, res) => {
    try {
      const { publicHolidays } = await import("@shared/schema");
      await db.delete(publicHolidays).where(eq(publicHolidays.id, req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Quản lý dung lượng ──────────────────────────────────────────────────────

  app.get("/api/system-settings/storage", async (req, res) => {
    try {
      const { systemSettings } = await import("@shared/schema");

      // Quota (GB)
      const quotaRow = await db.select().from(systemSettings).where(eq(systemSettings.key, "storageQuotaGb"));
      const quotaGb = quotaRow.length > 0 ? parseFloat(quotaRow[0].value) || 10 : 10;

      // S3 used bytes
      const s3Row = await db.select().from(systemSettings).where(eq(systemSettings.key, "s3UsedBytes"));
      const s3UsedBytes = s3Row.length > 0 ? parseInt(s3Row[0].value) || 0 : 0;

      // DB size — tổng toàn bộ bảng trong public schema
      // Khi bàn giao, DB gần trống nên mọi dữ liệu tăng thêm đều phản ánh đúng thực tế
      const sizeResult = await db.execute(sql.raw(`
        SELECT COALESCE(SUM(pg_total_relation_size(quote_ident(tablename))), 0)::bigint AS total_bytes
        FROM pg_tables
        WHERE schemaname = 'public'
      `));
      const dbSizeBytes = Number((sizeResult as any).rows?.[0]?.total_bytes ?? 0);

      res.json({ quotaGb, s3UsedBytes, dbSizeBytes });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Form đăng ký ────────────────────────────────────────────────────────────
  const REGISTRATION_FORM_DEFAULT_FIELDS = [
    { key: "phone",             label: "Số điện thoại" },
    { key: "email",             label: "Email" },
    { key: "dateOfBirth",       label: "Ngày sinh" },
    { key: "address",           label: "Địa chỉ" },
    { key: "socialLink",        label: "Zalo / Facebook" },
    { key: "parentName",        label: "Họ tên Phụ huynh 1" },
    { key: "parentPhone",       label: "SĐT Phụ huynh 1" },
    { key: "parentName2",       label: "Họ tên Phụ huynh 2" },
    { key: "parentPhone2",      label: "SĐT Phụ huynh 2" },
    { key: "academicLevel",     label: "Trình độ" },
    { key: "customerSourceIds", label: "Nguồn khách hàng" },
    { key: "note",              label: "Ghi chú" },
  ];

  app.get("/api/system-settings/registration-form", async (req, res) => {
    try {
      const { systemSettings } = await import("@shared/schema");
      const row = await db.select().from(systemSettings).where(eq(systemSettings.key, "registrationFormFields"));
      if (row.length === 0) {
        // Trả về mặc định — tất cả bật, theo thứ tự default
        return res.json({
          fields: REGISTRATION_FORM_DEFAULT_FIELDS.map((f, i) => ({ ...f, enabled: true, position: i })),
        });
      }
      const saved: { key: string; enabled: boolean; position: number }[] = JSON.parse(row[0].value);
      // Merge: giữ thứ tự đã lưu, bổ sung field mới nếu có
      const savedKeys = new Set(saved.map(f => f.key));
      const extra = REGISTRATION_FORM_DEFAULT_FIELDS
        .filter(f => !savedKeys.has(f.key))
        .map((f, i) => ({ key: f.key, enabled: true, position: saved.length + i }));
      const merged = [...saved, ...extra].map(f => ({
        ...f,
        label: REGISTRATION_FORM_DEFAULT_FIELDS.find(d => d.key === f.key)?.label ?? f.key,
      })).sort((a, b) => a.position - b.position);
      res.json({ fields: merged });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/system-settings/registration-form", async (req, res) => {
    try {
      const { systemSettings } = await import("@shared/schema");
      const { fields } = z.object({
        fields: z.array(z.object({
          key: z.string(),
          enabled: z.boolean(),
          position: z.number().int(),
        })),
      }).parse(req.body);
      const value = JSON.stringify(fields);
      await db
        .insert(systemSettings)
        .values({ key: "registrationFormFields", value })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedAt: new Date() } });
      res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/system-settings/storage-quota", async (req, res) => {
    try {
      const { systemSettings } = await import("@shared/schema");
      const { quotaGb } = z.object({ quotaGb: z.number().positive() }).parse(req.body);
      await db
        .insert(systemSettings)
        .values({ key: "storageQuotaGb", value: String(quotaGb) })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value: String(quotaGb), updatedAt: new Date() } });
      res.json({ quotaGb });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });
}
