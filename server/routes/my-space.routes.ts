import type { Express } from "express";
import { sendHomeworkScoreNotification } from "../lib/attendance-notification";
import { db, pool } from "../db";
import { z } from "zod";
import { scoreSheetAssessmentSchema } from "@shared/score-sheet-assessment";
import {
  parseScoreConversionTemplatesJson,
  scoreConversionTemplateSchema,
} from "@shared/score-conversion";
import {
  calculateScoreSheetAssessmentAttemptResult,
  scoreSheetAssessmentAttemptResultSchema,
  scoreSheetAssessmentAttemptValuesSchema,
  type ScoreSheetAssessmentAttemptResult,
} from "@shared/score-sheet-assessment-scoring";
import {
  students,
  staff,
  staffAssignments,
  departments,
  roles,
  studentSessions,
  classSessions,
  classes,
  shiftTemplates,
  sessionContents,
  studentSessionContents,
  courseProgramContents,
  locations,
  invoices,
  invoicePaymentSchedule,
  leaveRequests,
  studentLeaveRequests,
  staffRewards,
  staffAdvances,
  examSubmissions,
  exams,
  testSessions,
  staffSalaryConfigs,
  staffAttendances,
  salarySheets,
  salarySheetEmployees,
  onlineLearningRules,
  freeClassRegistrations,
  freeClassDayAssignments,
  freeClassSessionContents,
  studentClasses,
  systemSettings,
  scoreSheetAssessmentStudentAttempts,
} from "@shared/schema";
import { storage } from "../storage";
import { eq, and, gte, lte, sql, inArray, isNotNull, isNull, or, desc } from "drizzle-orm";
import { updateStudentAttendance } from "../storage/attendance.storage";

async function getStudentForUser(userId: string) {
  const [student] = await db
    .select({ id: students.id, fullName: students.fullName, code: students.code })
    .from(students)
    .where(eq(students.userId, userId))
    .limit(1);
  return student ?? null;
}

async function getStaffForUser(userId: string) {
  const [staffRecord] = await db
    .select({ id: staff.id, code: staff.code, fullName: staff.fullName })
    .from(staff)
    .where(eq(staff.userId, userId))
    .limit(1);
  return staffRecord ?? null;
}

async function getScoreSheetAssessmentScoringConfig(assessmentId: string, queryable: any = db) {
  const [settingsRow] = await queryable
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, "scoreSheetAssessments"))
    .limit(1);
  if (!settingsRow) return null;

  const assessments = z.array(scoreSheetAssessmentSchema).parse(JSON.parse(settingsRow.value));
  const assessment = assessments.find((item) => item.id === assessmentId);
  if (!assessment) return null;

  const conversionTemplateId = assessment.templateSnapshot.scoreConversionTemplateId;
  let conversionTemplate = assessment.conversionTemplateSnapshot ?? null;
  if (conversionTemplateId && !conversionTemplate) {
    const [conversionRow] = await queryable
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, "scoreConversionTemplates"))
      .limit(1);
    if (conversionRow) {
      conversionTemplate = parseScoreConversionTemplatesJson(conversionRow.value)
        .find((template) => template.id === conversionTemplateId) ?? null;
    }
    if (!conversionTemplate) {
      throw new Error("Không tìm thấy cấu hình quy đổi của bảng điểm này.");
    }
  }

  return {
    ...assessment,
    conversionTemplateSnapshot: conversionTemplate
      ? scoreConversionTemplateSchema.parse(conversionTemplate)
      : null,
  };
}

type AssessmentAttemptSummaryRow = {
  attemptNumber: number;
  result: unknown;
};

function selectAssessmentAttemptSummary(
  attempts: AssessmentAttemptSummaryRow[],
  scoringPolicy: "highest" | "latest",
  hasConversion: boolean,
): { attemptNumber: number; result: ScoreSheetAssessmentAttemptResult } | null {
  const parsed = attempts.map((attempt) => ({
    attemptNumber: attempt.attemptNumber,
    result: scoreSheetAssessmentAttemptResultSchema.parse(attempt.result),
  }));
  if (parsed.length === 0) return null;

  if (scoringPolicy === "latest") {
    return parsed.reduce((latest, current) =>
      current.attemptNumber > latest.attemptNumber ? current : latest,
    );
  }

  return parsed.reduce((highest, current) => {
    const highestScore = hasConversion
      ? highest.result.overallConvertedScore
      : highest.result.overallRawScore;
    const currentScore = hasConversion
      ? current.result.overallConvertedScore
      : current.result.overallRawScore;
    if (currentScore === null && highestScore !== null) return highest;
    if (currentScore !== null && highestScore === null) return current;
    if (currentScore !== null && highestScore !== null && currentScore !== highestScore) {
      return currentScore > highestScore ? current : highest;
    }
    return current.attemptNumber > highest.attemptNumber ? current : highest;
  });
}

async function isStaffInDaotaoDept(staffId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: staffAssignments.id })
    .from(staffAssignments)
    .innerJoin(departments, eq(staffAssignments.departmentId, departments.id))
    .where(and(
      eq(staffAssignments.staffId, staffId),
      eq(departments.name, "Phòng Đào tạo"),
      eq(departments.isSystem, true)
    ))
    .limit(1);
  return !!row;
}

async function getSessionAttendanceStats(classSessionId: string): Promise<{ enrolledCount: number; pendingCount: number; reviewedCount: number }> {
  const [row] = await db
    .select({
      enrolledCount: sql<number>`count(*)::int`,
      pendingCount: sql<number>`count(case when ${studentSessions.attendanceStatus} = 'pending' then 1 end)::int`,
      reviewedCount: sql<number>`count(case when ${studentSessions.reviewData} is not null and ${studentSessions.reviewData}::text != 'null' then 1 end)::int`,
    })
    .from(studentSessions)
    .where(eq(studentSessions.classSessionId, classSessionId));
  return { enrolledCount: row?.enrolledCount ?? 0, pendingCount: row?.pendingCount ?? 0, reviewedCount: row?.reviewedCount ?? 0 };
}

async function getRegularSessionStudents(classSessionId: string) {
  const rows = await db
    .select({
      id: studentSessions.id,
      studentId: studentSessions.studentId,
      studentClassId: studentSessions.studentClassId,
      attendanceStatus: studentSessions.attendanceStatus,
      attendanceNote: studentSessions.attendanceNote,
      reviewData: studentSessions.reviewData,
      reviewPublished: studentSessions.reviewPublished,
      studentFullName: students.fullName,
      studentCode: students.code,
    })
    .from(studentSessions)
    .innerJoin(students, eq(studentSessions.studentId, students.id))
    .where(eq(studentSessions.classSessionId, classSessionId))
    .orderBy(students.fullName);

  return rows.map((row) => ({
    id: row.id,
    studentId: row.studentId,
    studentClassId: row.studentClassId,
    attendanceStatus: row.attendanceStatus,
    attendanceNote: row.attendanceNote,
    reviewData: row.reviewData,
    reviewPublished: row.reviewPublished,
    student: {
      fullName: row.studentFullName,
      code: row.studentCode,
    },
  }));
}

async function getTeacherNames(teacherIds: string[]): Promise<string[]> {
  if (!teacherIds || teacherIds.length === 0) return [];
  const records = await db
    .select({ code: staff.code, fullName: staff.fullName })
    .from(staff)
    .where(inArray(staff.id, teacherIds));
  return records.map((r) => r.fullName || r.code);
}

async function getTeachersWithIds(teacherIds: string[]): Promise<{ id: string; fullName: string; code: string | null }[]> {
  if (!teacherIds || teacherIds.length === 0) return [];
  const records = await db
    .select({ id: staff.id, code: staff.code, fullName: staff.fullName })
    .from(staff)
    .where(inArray(staff.id, teacherIds));
  return teacherIds
    .map((tid) => records.find((r) => r.id === tid))
    .filter(Boolean)
    .map((r: any) => ({ id: r.id, fullName: r.fullName || r.code, code: r.code ?? null }));
}

function parseSessionAttachments(raw: string[] | null): { name: string; url: string }[] {
  if (!raw || raw.length === 0) return [];
  return raw.map((entry) => {
    const sep = entry.indexOf("||");
    if (sep === -1) return { name: entry, url: entry };
    return { name: entry.substring(0, sep), url: entry.substring(sep + 2) };
  });
}

async function getSessionContents(classSessionId: string, studentId?: string) {
  const allRows = await db
    .select()
    .from(sessionContents)
    .where(eq(sessionContents.classSessionId, classSessionId))
    .orderBy(sessionContents.displayOrder);

  if (allRows.length === 0) return { general: [], personal: [] };

  // Enrich attachments from course_program_contents for all items with resourceUrl
  const resourceUrls = allRows.map((r) => r.resourceUrl).filter(Boolean) as string[];
  let programAttachmentMap: Record<string, { name: string; url: string }[]> = {};
  if (resourceUrls.length > 0) {
    const programRows = await db
      .select({ id: courseProgramContents.id, attachments: courseProgramContents.attachments })
      .from(courseProgramContents)
      .where(sql`${courseProgramContents.id}::text = ANY(ARRAY[${sql.join(resourceUrls.map((u) => sql`${u}`), sql`, `)}])`);
    for (const pr of programRows) {
      programAttachmentMap[pr.id] = parseSessionAttachments(pr.attachments);
    }
  }

  // Find which content IDs are personal (linked to any student)
  const allIds = allRows.map((r) => r.id);
  const personalLinked = await db
    .select({ sessionContentId: studentSessionContents.sessionContentId })
    .from(studentSessionContents)
    .where(inArray(studentSessionContents.sessionContentId, allIds));
  const personalContentIds = new Set(personalLinked.map((p) => p.sessionContentId));

  // Common content = those NOT linked to any student
  const commonRows = allRows.filter((r) => !personalContentIds.has(r.id));

  const general = commonRows.map((r) => ({
    id: r.id,
    type: r.contentType,
    title: r.title,
    description: r.description,
    resourceUrl: r.resourceUrl ?? null,
    attachments: r.resourceUrl ? (programAttachmentMap[r.resourceUrl] ?? []) : [],
  }));

  let personal: { id: string; type: string; title: string; description: string | null; resourceUrl: string | null; attachments: { name: string; url: string }[]; customTitle: string | null; customDescription: string | null }[] = [];

  if (studentId) {
    const personalRows = await db
      .select()
      .from(studentSessionContents)
      .where(
        and(
          eq(studentSessionContents.studentId, studentId),
          inArray(studentSessionContents.sessionContentId, allIds)
        )
      );

    personal = personalRows.map((p) => {
      const base = allRows.find((g) => g.id === p.sessionContentId);
      return {
        id: p.id,
        type: base?.contentType ?? "",
        title: base?.title ?? "",
        description: base?.description ?? null,
        resourceUrl: base?.resourceUrl ?? null,
        attachments: base?.resourceUrl ? (programAttachmentMap[base.resourceUrl] ?? []) : [],
        customTitle: p.customTitle,
        customDescription: p.customDescription,
      };
    });
  }

  return { general, personal };
}

function parseReviewData(rawReviewData: any): { teacherName: string; criteria: { criteriaName: string; rating?: number; items: { groupName?: string; subCriteriaName: string; comment: string; inputType?: "text" | "checkbox"; checked?: boolean }[] }[] }[] {
  if (!rawReviewData || typeof rawReviewData !== "object" || Array.isArray(rawReviewData)) return [];
  const result: { teacherName: string; criteria: { criteriaName: string; rating?: number; items: { groupName?: string; subCriteriaName: string; comment: string; inputType?: "text" | "checkbox"; checked?: boolean }[] }[] }[] = [];
  for (const key of Object.keys(rawReviewData)) {
    const entry = rawReviewData[key];
    if (!entry || !Array.isArray(entry.items)) continue;
    const criteriaMap = new Map<string, { criteriaId: string; items: { subCriteriaName: string; comment: string }[] }>();
    for (const item of entry.items) {
      const cName = item.criteriaName || "Chung";
      const cId = item.criteriaId || "";
      if (!criteriaMap.has(cName)) criteriaMap.set(cName, { criteriaId: cId, items: [] });
      criteriaMap.get(cName)!.items.push({
        ...(item.groupName ? { groupName: item.groupName } : {}),
        subCriteriaName: item.subCriteriaName || "",
        comment: item.comment ?? "",
        ...(item.inputType === "checkbox"
          ? { inputType: "checkbox" as const, checked: item.checked === true }
          : {}),
      });
    }
    const criteria = Array.from(criteriaMap.entries()).map(([criteriaName, data]) => {
      const groupNames = [...new Set(data.items.map((item) => item.groupName).filter(Boolean) as string[])]
        .sort((a, b) => a.localeCompare(b, "vi"));
      const orderedItems = [
        ...groupNames.flatMap((groupName) =>
          data.items
            .filter((item) => item.groupName === groupName)
            .sort((a, b) => a.subCriteriaName.localeCompare(b.subCriteriaName, "vi"))
        ),
        ...data.items
          .filter((item) => !item.groupName)
          .sort((a, b) => a.subCriteriaName.localeCompare(b.subCriteriaName, "vi")),
      ];

      return {
        criteriaName,
        items: orderedItems,
        ...(entry.criteriaRatings?.[data.criteriaId] != null ? { rating: entry.criteriaRatings[data.criteriaId] } : {}),
      };
    });
    result.push({ teacherName: entry.teacherName || "Giáo viên", criteria });
  }
  return result;
}

function getDateRange(month?: string) {
  const now = new Date();
  const target = month ? new Date(`${month}-01`) : new Date(now.getFullYear(), now.getMonth(), 1);
  const year = target.getFullYear();
  const mon = target.getMonth();
  const dateFrom = `${year}-${String(mon + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, mon + 1, 0).getDate();
  const dateTo = `${year}-${String(mon + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const monthStr = `${year}-${String(mon + 1).padStart(2, "0")}`;
  return { year, mon, dateFrom, dateTo, monthStr };
}

function mapFreeAttendanceStatus(status: string | null | undefined): string {
  if (status === "attended") return "present";
  if (status === "reserved") return "paused";
  return "pending";
}

function getFreeSessionId(registrationId: string): string {
  return `free-${registrationId}`;
}

function getFreeStaffSessionId(classId: string, sessionDate: string): string {
  return `free-${classId}__${String(sessionDate).slice(0, 10)}`;
}

async function getFreeSessionContents(classId: string, sessionDate: string, studentId?: string) {
  const rows = await db
    .select()
    .from(freeClassSessionContents)
    .where(and(
      eq(freeClassSessionContents.classId, classId),
      eq(freeClassSessionContents.sessionDate, sessionDate),
      studentId
        ? or(isNull(freeClassSessionContents.studentId), eq(freeClassSessionContents.studentId, studentId))
        : isNull(freeClassSessionContents.studentId),
    ))
    .orderBy(freeClassSessionContents.displayOrder, freeClassSessionContents.createdAt);

  return {
    general: rows.filter((row) => row.studentId == null),
    personal: studentId ? rows.filter((row) => row.studentId === studentId) : [],
  };
}

function mapFreeContentForCalendar(row: typeof freeClassSessionContents.$inferSelect) {
  return {
    id: row.id,
    type: row.contentType,
    title: row.title,
    description: row.description,
    resourceUrl: row.resourceUrl ?? null,
  };
}

async function getStaffFreeSessionRows(classId: string, sessionDate: string, staffId: string) {
  return db
    .select({
      registrationId: freeClassRegistrations.id,
      classId: classes.id,
      studentClassId: freeClassRegistrations.studentClassId,
      studentId: freeClassRegistrations.studentId,
      studentName: students.fullName,
      studentCode: students.code,
    })
    .from(freeClassRegistrations)
    .innerJoin(classes, eq(freeClassRegistrations.classId, classes.id))
    .innerJoin(studentClasses, eq(freeClassRegistrations.studentClassId, studentClasses.id))
    .innerJoin(students, eq(freeClassRegistrations.studentId, students.id))
    .leftJoin(freeClassDayAssignments, and(
      eq(freeClassDayAssignments.classId, freeClassRegistrations.classId),
      eq(freeClassDayAssignments.assignmentDate, freeClassRegistrations.registrationDate),
    ))
    .where(and(
      eq(freeClassRegistrations.classId, classId),
      eq(freeClassRegistrations.registrationDate, sessionDate),
      eq(classes.classType, "free"),
      inArray(studentClasses.status, ["active", "waiting"]),
      or(
        eq(freeClassRegistrations.teacherId, staffId),
        eq(freeClassDayAssignments.teacherId, staffId),
        and(
          isNull(freeClassRegistrations.teacherId),
          isNull(freeClassDayAssignments.teacherId),
          sql`${classes.teacherIds} @> ARRAY[${staffId}]::uuid[]`,
        ),
      ),
    ));
}

async function getFreeDayAssignmentMap(classIds: string[], dateFrom?: string, dateTo?: string) {
  if (classIds.length === 0) return new Map<string, any>();
  const conditions = [inArray(freeClassDayAssignments.classId, classIds)];
  if (dateFrom) conditions.push(gte(freeClassDayAssignments.assignmentDate, dateFrom));
  if (dateTo) conditions.push(lte(freeClassDayAssignments.assignmentDate, dateTo));
  const rows = await db
    .select({
      classId: freeClassDayAssignments.classId,
      assignmentDate: freeClassDayAssignments.assignmentDate,
      teacherId: freeClassDayAssignments.teacherId,
      shiftTemplateId: freeClassDayAssignments.shiftTemplateId,
      shiftName: shiftTemplates.name,
      shiftStart: shiftTemplates.startTime,
      shiftEnd: shiftTemplates.endTime,
    })
    .from(freeClassDayAssignments)
    .leftJoin(shiftTemplates, eq(shiftTemplates.id, freeClassDayAssignments.shiftTemplateId))
    .where(and(...conditions));
  return new Map(rows.map((row) => [
    `${row.classId}:${String(row.assignmentDate).slice(0, 10)}`,
    row,
  ]));
}

async function getFreeShiftMap(shiftIds: string[]) {
  if (shiftIds.length === 0) return new Map<string, any>();
  const rows = await db
    .select({
      id: shiftTemplates.id,
      name: shiftTemplates.name,
      startTime: shiftTemplates.startTime,
      endTime: shiftTemplates.endTime,
    })
    .from(shiftTemplates)
    .where(inArray(shiftTemplates.id, shiftIds));
  return new Map(rows.map((row) => [row.id, row]));
}

async function canManageFreeClass(classId: string, staffId: string, isSuperAdmin = false) {
  const conditions = [
    eq(classes.id, classId),
    eq(classes.classType, "free"),
  ];
  if (!isSuperAdmin) {
    conditions.push(sql`${classes.teacherIds} @> ARRAY[${staffId}]::uuid[]`);
  }
  const [row] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(...conditions))
    .limit(1);
  return !!row;
}

async function getStudentName(studentId: string): Promise<string> {
  const [row] = await db
    .select({ fullName: students.fullName, code: students.code })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);
  return row?.fullName || row?.code || studentId;
}

interface StudentContext {
  isParent: boolean;
  selfStudentId: string | null;
  studentIds: string[];
  linkedStudents: { id: string; fullName: string; code: string }[];
}

async function getStudentContext(userId: string): Promise<StudentContext> {
  const [student] = await db
    .select({ id: students.id, fullName: students.fullName, code: students.code, type: students.type })
    .from(students)
    .where(eq(students.userId, userId))
    .limit(1);

  if (!student) return { isParent: false, selfStudentId: null, studentIds: [], linkedStudents: [] };

  if (student.type === "Phụ huynh") {
    const linked = await db
      .select({ id: students.id, fullName: students.fullName, code: students.code })
      .from(students)
      .where(sql`${students.parentIds} @> ARRAY[${student.id}]::uuid[]`);
    return {
      isParent: true,
      selfStudentId: student.id,
      studentIds: linked.map(l => l.id),
      linkedStudents: linked.map(l => ({ id: l.id, fullName: l.fullName ?? "", code: l.code ?? "" })),
    };
  }

  return {
    isParent: false,
    selfStudentId: student.id,
    studentIds: [student.id],
    linkedStudents: [{ id: student.id, fullName: student.fullName ?? "", code: student.code ?? "" }],
  };
}

export function registerMySpaceRoutes(app: Express): void {

  // ── Current user info (name, code) ──────────────────────────────────────
  app.get("/api/my-space/me-info", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const [staffRecord] = await db
        .select({ fullName: staff.fullName, code: staff.code })
        .from(staff)
        .where(eq(staff.userId, user.id))
        .limit(1);
      if (staffRecord) {
        return res.json({ fullName: staffRecord.fullName || null, code: staffRecord.code || null, type: "staff" });
      }

      const [studentRecord] = await db
        .select({ fullName: students.fullName, code: students.code })
        .from(students)
        .where(eq(students.userId, user.id))
        .limit(1);
      if (studentRecord) {
        return res.json({ fullName: studentRecord.fullName || null, code: studentRecord.code || null, type: "student" });
      }

      return res.json({ fullName: user.username || null, code: null, type: null });
    } catch (err: any) {
      console.error("My space me-info error:", err);
      res.status(500).json({ message: err.message || "Lỗi" });
    }
  });

  // ── User type detection ──────────────────────────────────────────────────
  app.get("/api/my-space/user-type", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const studentRecord = await getStudentForUser(user.id);
      if (studentRecord) return res.json({ userType: "student" });

      const staffRecord = await getStaffForUser(user.id);
      if (staffRecord) {
        return res.json({ userType: "staff" });
      }

      return res.json({ userType: null });
    } catch (err: any) {
      console.error("My space user-type error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi xác định loại tài khoản" });
    }
  });

  // ── Flexible-class session content (kept separate from regular sessions) ───
  app.get("/api/free-class-sessions/:classId/:sessionDate/contents", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const { classId, sessionDate } = req.params;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
        return res.status(400).json({ message: "Ngày buổi học không hợp lệ" });
      }
      const rows = await getStaffFreeSessionRows(classId, sessionDate, staffRecord.id);
      if (rows.length === 0 && !(await canManageFreeClass(classId, staffRecord.id, req.isSuperAdmin))) {
        return res.status(404).json({ message: "Không tìm thấy lớp tự do hoặc bạn không có quyền" });
      }

      const contents = await getFreeSessionContents(classId, sessionDate);
      res.json({
        common: contents.general,
        personal: (await db
          .select()
          .from(freeClassSessionContents)
          .where(and(
            eq(freeClassSessionContents.classId, classId),
            eq(freeClassSessionContents.sessionDate, sessionDate),
            isNotNull(freeClassSessionContents.studentId),
          ))
          .orderBy(freeClassSessionContents.displayOrder, freeClassSessionContents.createdAt)),
        students: rows.map((row) => ({
          id: row.studentId,
          name: row.studentName || row.studentCode || row.studentId,
          code: row.studentCode,
          studentClassId: row.studentClassId,
        })),
      });
    } catch (err: any) {
      console.error("GET free session contents error:", err);
      res.status(500).json({ message: err.message || "Không thể tải nội dung lớp tự do" });
    }
  });

  app.post("/api/free-class-sessions/:classId/:sessionDate/contents", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const { classId, sessionDate } = req.params;
      const rows = await getStaffFreeSessionRows(classId, sessionDate, staffRecord.id);
      if (rows.length === 0 && !(await canManageFreeClass(classId, staffRecord.id, req.isSuperAdmin))) {
        return res.status(404).json({ message: "Không tìm thấy lớp tự do hoặc bạn không có quyền" });
      }

      const { contentType, title, description, resourceUrl, dueDate } = req.body ?? {};
      if (!contentType || !title) return res.status(400).json({ message: "Thiếu loại hoặc tên nội dung" });
      const [created] = await db.insert(freeClassSessionContents).values({
        classId,
        sessionDate,
        studentId: null,
        contentType,
        title,
        description: description || null,
        resourceUrl: resourceUrl || null,
        displayOrder: 0,
        dueDate: dueDate ? new Date(dueDate) : null,
      }).returning();
      res.status(201).json(created);
    } catch (err: any) {
      console.error("Create free session content error:", err);
      res.status(400).json({ message: err.message || "Không thể tạo nội dung lớp tự do" });
    }
  });

  app.patch("/api/free-class-sessions/:classId/:sessionDate/contents/:contentId", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });
      const { classId, sessionDate, contentId } = req.params;
      const rows = await getStaffFreeSessionRows(classId, sessionDate, staffRecord.id);
      if (rows.length === 0 && !(await canManageFreeClass(classId, staffRecord.id, req.isSuperAdmin))) {
        return res.status(404).json({ message: "Không tìm thấy lớp tự do hoặc bạn không có quyền" });
      }
      const dueDate = req.body?.dueDate;
      const [updated] = await db.update(freeClassSessionContents)
        .set({ dueDate: dueDate ? new Date(dueDate) : null })
        .where(and(
          eq(freeClassSessionContents.id, contentId),
          eq(freeClassSessionContents.classId, classId),
          eq(freeClassSessionContents.sessionDate, sessionDate),
          isNull(freeClassSessionContents.studentId),
        ))
        .returning();
      if (!updated) return res.status(404).json({ message: "Không tìm thấy nội dung" });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể cập nhật nội dung" });
    }
  });

  app.delete("/api/free-class-sessions/:classId/:sessionDate/contents/:contentId", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });
      const { classId, sessionDate, contentId } = req.params;
      const rows = await getStaffFreeSessionRows(classId, sessionDate, staffRecord.id);
      if (rows.length === 0 && !(await canManageFreeClass(classId, staffRecord.id, req.isSuperAdmin))) {
        return res.status(404).json({ message: "Không tìm thấy lớp tự do hoặc bạn không có quyền" });
      }
      const deleted = await db.delete(freeClassSessionContents).where(and(
        eq(freeClassSessionContents.id, contentId),
        eq(freeClassSessionContents.classId, classId),
        eq(freeClassSessionContents.sessionDate, sessionDate),
        isNull(freeClassSessionContents.studentId),
      )).returning({ id: freeClassSessionContents.id });
      if (deleted.length === 0) return res.status(404).json({ message: "Không tìm thấy nội dung" });
      res.status(204).send();
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể xoá nội dung" });
    }
  });

  app.post("/api/free-class-sessions/:classId/:sessionDate/student-contents", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });
      const { classId, sessionDate } = req.params;
      const rows = await getStaffFreeSessionRows(classId, sessionDate, staffRecord.id);
      if (rows.length === 0) return res.status(404).json({ message: "Không tìm thấy buổi học tự do" });

      const { studentId, contentType, title, description, resourceUrl, dueDate } = req.body ?? {};
      if (!studentId || !contentType || !title) return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
      if (!rows.some((row) => row.studentId === studentId)) {
        return res.status(400).json({ message: "Học viên không đăng ký buổi học này" });
      }
      const [created] = await db.insert(freeClassSessionContents).values({
        classId,
        sessionDate,
        studentId,
        contentType,
        title,
        description: description || null,
        resourceUrl: resourceUrl || null,
        displayOrder: 0,
        dueDate: dueDate ? new Date(dueDate) : null,
      }).returning();
      res.status(201).json(created);
    } catch (err: any) {
      console.error("Create free personal content error:", err);
      res.status(400).json({ message: err.message || "Không thể giao nội dung cá nhân" });
    }
  });

  app.delete("/api/free-class-sessions/:classId/:sessionDate/student-contents/:contentId", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });
      const { classId, sessionDate, contentId } = req.params;
      const rows = await getStaffFreeSessionRows(classId, sessionDate, staffRecord.id);
      if (rows.length === 0) return res.status(404).json({ message: "Không tìm thấy buổi học tự do" });
      const deleted = await db.delete(freeClassSessionContents).where(and(
        eq(freeClassSessionContents.id, contentId),
        eq(freeClassSessionContents.classId, classId),
        eq(freeClassSessionContents.sessionDate, sessionDate),
        isNotNull(freeClassSessionContents.studentId),
      )).returning({ id: freeClassSessionContents.id });
      if (deleted.length === 0) return res.status(404).json({ message: "Không tìm thấy nội dung cá nhân" });
      res.status(204).send();
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Không thể xoá nội dung cá nhân" });
    }
  });

  // ── Student calendar (lightweight — dates + basic info only) ─────────────
  app.get("/api/my-space/calendar/student", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const ctx = await getStudentContext(user.id);
      if (!ctx.selfStudentId) return res.status(403).json({ message: "Tài khoản không phải học viên" });

      const { month } = req.query as { month?: string };
      const { dateFrom, dateTo, monthStr } = getDateRange(month);

      if (ctx.studentIds.length === 0) return res.json({ sessions: [], datesWithSessions: [], month: monthStr });

      const studentNameMap = new Map(ctx.linkedStudents.map(s => [s.id, s]));

      const rows = await db
        .select({
          studentSessionId: studentSessions.id,
          classSessionId: classSessions.id,
          classId: classSessions.classId,
          sessionDate: classSessions.sessionDate,
          weekday: classSessions.weekday,
          sessionLearningFormat: classSessions.learningFormat,
          classLearningFormat: classes.learningFormat,
          sessionStatus: classSessions.status,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
          className: classes.name,
          classCode: classes.classCode,
          classColor: classes.color,
          onlineLink: classes.onlineLink,
          locationId: classes.locationId,
          teacherIds: classSessions.teacherIds,
          attendanceStatus: studentSessions.attendanceStatus,
          studentId: studentSessions.studentId,
        })
        .from(studentSessions)
        .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .where(
          and(
            inArray(studentSessions.studentId, ctx.studentIds),
            gte(classSessions.sessionDate, dateFrom),
            lte(classSessions.sessionDate, dateTo)
          )
        )
        .orderBy(classSessions.sessionDate, shiftTemplates.startTime);

      // Deduplicate by (studentId + classSessionId) — guards against duplicate studentSessions rows
      const seenSessionKeys = new Set<string>();
      const dedupedRows = rows.filter((row) => {
        const key = `${row.studentId ?? ""}_${row.classSessionId}`;
        if (seenSessionKeys.has(key)) return false;
        seenSessionKeys.add(key);
        return true;
      });

      // Batch-resolve locationName, teacherNames, enrolledCount
      const allLocationIds = [...new Set(dedupedRows.map(r => r.locationId).filter(Boolean))] as string[];
      const allTeacherIds = [...new Set(dedupedRows.flatMap(r => r.teacherIds ?? []))];
      const allClassSessionIds = [...new Set(dedupedRows.map(r => r.classSessionId))];

      const [locationRows, staffRows, enrolledRows] = await Promise.all([
        allLocationIds.length > 0
          ? db.select({ id: locations.id, name: locations.name }).from(locations).where(inArray(locations.id, allLocationIds))
          : Promise.resolve([]),
        allTeacherIds.length > 0
          ? db.select({ id: staff.id, fullName: staff.fullName }).from(staff).where(inArray(staff.id, allTeacherIds))
          : Promise.resolve([]),
        allClassSessionIds.length > 0
          ? db.select({
              classSessionId: studentSessions.classSessionId,
              count: sql<number>`COUNT(*)::int`,
            }).from(studentSessions).where(inArray(studentSessions.classSessionId, allClassSessionIds)).groupBy(studentSessions.classSessionId)
          : Promise.resolve([]),
      ]);

      const locationMap = new Map(locationRows.map(l => [l.id, l.name]));
      const staffMap = new Map(staffRows.map(s => [s.id, s.fullName ?? ""]));
      const enrolledMap = new Map(enrolledRows.map(r => [r.classSessionId, r.count]));

      const sessions = dedupedRows.map((row) => {
          const linked = studentNameMap.get(row.studentId ?? "");
          // Prefer session-level learningFormat if explicitly set (not default "offline"),
          // otherwise fall back to class-level learningFormat which is the source of truth
          const learningFormat = (row.sessionLearningFormat && row.sessionLearningFormat !== "offline")
            ? row.sessionLearningFormat
            : (row.classLearningFormat ?? "offline");
          return {
            classSessionId: row.classSessionId,
            studentSessionId: row.studentSessionId,
            classId: row.classId ?? null,
            sessionDate: row.sessionDate,
            weekday: row.weekday,
            className: row.className,
            classCode: row.classCode,
            classColor: row.classColor ?? null,
            startTime: row.startTime,
            endTime: row.endTime,
            learningFormat,
            onlineLink: row.onlineLink ?? null,
            locationId: row.locationId ?? null,
            locationName: row.locationId ? (locationMap.get(row.locationId) ?? null) : null,
            teacherNames: (row.teacherIds ?? []).map(id => staffMap.get(id)).filter(Boolean) as string[],
            enrolledCount: enrolledMap.get(row.classSessionId) ?? 0,
            sessionStatus: row.sessionStatus,
            attendanceStatus: row.attendanceStatus,
            studentName: ctx.isParent ? (linked?.fullName ?? null) : null,
            studentCode: ctx.isParent ? (linked?.code ?? null) : null,
            studentId: row.studentId,
          };
        });

      // Flexible classes do not have class_sessions. Each registered date is
      // exposed as a calendar item for the student (or linked children).
      const freeRows = await db
        .select({
          registrationId: freeClassRegistrations.id,
          classId: classes.id,
          className: classes.name,
          classCode: classes.classCode,
          classColor: classes.color,
          learningFormat: classes.learningFormat,
          onlineLink: classes.onlineLink,
          locationId: classes.locationId,
          classTeacherIds: classes.teacherIds,
          evaluationCriteriaIds: classes.evaluationCriteriaIds,
          studentClassId: freeClassRegistrations.studentClassId,
          studentId: freeClassRegistrations.studentId,
          sessionDate: freeClassRegistrations.registrationDate,
          registrationStatus: freeClassRegistrations.status,
          teacherId: freeClassRegistrations.teacherId,
           shiftTemplateId: freeClassRegistrations.shiftTemplateId,
          note: freeClassRegistrations.note,
          reviewData: freeClassRegistrations.reviewData,
          reviewPublished: freeClassRegistrations.reviewPublished,
          studentName: students.fullName,
          studentCode: students.code,
        })
        .from(freeClassRegistrations)
        .innerJoin(classes, eq(freeClassRegistrations.classId, classes.id))
        .innerJoin(studentClasses, eq(freeClassRegistrations.studentClassId, studentClasses.id))
        .innerJoin(students, eq(freeClassRegistrations.studentId, students.id))
        .where(and(
          eq(classes.classType, "free"),
          inArray(freeClassRegistrations.studentId, ctx.studentIds),
          inArray(studentClasses.status, ["active", "waiting"]),
          gte(freeClassRegistrations.registrationDate, dateFrom),
          lte(freeClassRegistrations.registrationDate, dateTo),
        ))
        .orderBy(freeClassRegistrations.registrationDate);

      const freeDayAssignmentMap = await getFreeDayAssignmentMap(
        [...new Set(freeRows.map((row) => row.classId))],
        dateFrom,
        dateTo,
      );
      const freeOverrideShiftMap = await getFreeShiftMap(
        [...new Set(freeRows.map((row) => row.shiftTemplateId).filter(Boolean) as string[])],
      );
      const freeTeacherIds = [...new Set(
        freeRows.flatMap((row) => {
          const dayAssignment = freeDayAssignmentMap.get(`${row.classId}:${String(row.sessionDate).slice(0, 10)}`);
          return row.teacherId
            ? [row.teacherId]
            : dayAssignment?.teacherId
            ? [dayAssignment.teacherId]
            : (row.classTeacherIds ?? []);
        }),
      )];
      const freeTeacherRows = freeTeacherIds.length > 0
        ? await db
          .select({ id: staff.id, fullName: staff.fullName })
          .from(staff)
          .where(inArray(staff.id, freeTeacherIds))
        : [];
      const freeTeacherMap = new Map(freeTeacherRows.map((teacher) => [teacher.id, teacher.fullName ?? ""]));
      for (const row of freeRows) {
        const date = String(row.sessionDate).slice(0, 10);
        const dayAssignment = freeDayAssignmentMap.get(`${row.classId}:${date}`);
        const effectiveTeacherIds = row.teacherId
          ? [row.teacherId]
          : dayAssignment?.teacherId
          ? [dayAssignment.teacherId]
          : (row.classTeacherIds ?? []);
        const effectiveShift = row.shiftTemplateId
          ? freeOverrideShiftMap.get(row.shiftTemplateId)
          : dayAssignment?.shiftTemplateId
          ? dayAssignment
          : null;
        sessions.push({
          classSessionId: getFreeSessionId(row.registrationId),
          studentSessionId: null,
          classId: row.classId,
          sessionDate: date,
          weekday: new Date(`${date}T00:00:00`).getDay(),
          className: row.className,
          classCode: row.classCode,
          classColor: row.classColor ?? null,
           startTime: effectiveShift?.shiftStart || effectiveShift?.startTime || "",
           endTime: effectiveShift?.shiftEnd || effectiveShift?.endTime || "",
          learningFormat: row.learningFormat ?? "offline",
          onlineLink: row.onlineLink ?? null,
          locationId: row.locationId ?? null,
          locationName: null,
           teacherNames: effectiveTeacherIds.map((id) => freeTeacherMap.get(id)).filter(Boolean) as string[],
          enrolledCount: 1,
          sessionStatus: "scheduled",
          attendanceStatus: mapFreeAttendanceStatus(row.registrationStatus),
          studentName: ctx.isParent ? (row.studentName ?? null) : null,
          studentCode: ctx.isParent ? (row.studentCode ?? null) : null,
          studentId: row.studentId,
          isFreeSession: true,
          freeStatus: row.registrationStatus,
        } as any);
      }

      // Merge test sessions where this student is in student_ids
      if (ctx.studentIds.length > 0) {
        const tsResult = await pool.query(
          `SELECT ts.id, ts.title, ts.location_id, ts.test_date::text AS test_date, ts.time_start, ts.time_end,
                  ts.student_ids
           FROM test_sessions ts
           WHERE ts.test_date >= $1::date AND ts.test_date <= $2::date
             AND ts.student_ids && $3::uuid[]
           ORDER BY ts.test_date, ts.time_start`,
          [dateFrom, dateTo, ctx.studentIds]
        );
        for (const ts of tsResult.rows as any[]) {
          const weekday = new Date(ts.test_date + "T00:00:00").getDay();
          const studentIds: string[] = ts.student_ids || [];
          const matchingStudentIds = ctx.studentIds.filter((id) => studentIds.includes(id));
          for (const sid of matchingStudentIds) {
            const linked = studentNameMap.get(sid);
            sessions.push({
              classSessionId: ts.id,
              studentSessionId: null,
              sessionDate: ts.test_date,
              weekday,
              className: ts.title,
              classCode: "TEST",
              startTime: ts.time_start || "",
              endTime: ts.time_end || "",
              learningFormat: "offline",
              onlineLink: null,
              locationId: ts.location_id || null,
              sessionStatus: "scheduled",
              attendanceStatus: null,
              studentName: ctx.isParent ? (linked?.fullName ?? null) : null,
              studentCode: ctx.isParent ? (linked?.code ?? null) : null,
              studentId: sid,
              isTestSession: true,
            } as any);
          }
        }
      }

      const datesWithSessions = [...new Set(sessions.map((s) => s.sessionDate))];
      res.json({ sessions, datesWithSessions, month: monthStr });
    } catch (err: any) {
      console.error("Student calendar error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải lịch học viên" });
    }
  });

  // ── Student calendar list view (all sessions, grouped by class) ──────────
  app.get("/api/my-space/calendar/student/list", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const ctx = await getStudentContext(user.id);
      if (!ctx.selfStudentId) return res.status(403).json({ message: "Tài khoản không phải học viên" });
      if (ctx.studentIds.length === 0) return res.json([]);

      const rows = await db
        .select({
          classId: classes.id,
          className: classes.name,
          classCode: classes.classCode,
          classSessionId: classSessions.id,
          sessionIndex: classSessions.sessionIndex,
          sessionDate: classSessions.sessionDate,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
          attendanceStatus: studentSessions.attendanceStatus,
          attendanceNote: studentSessions.attendanceNote,
        })
        .from(studentSessions)
        .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .where(inArray(studentSessions.studentId, ctx.studentIds))
        .orderBy(classes.classCode, classSessions.sessionIndex, classSessions.sessionDate);

      // Group by class
      const classMap = new Map<string, { classId: string; className: string; classCode: string; sessions: any[] }>();
      for (const row of rows) {
        if (!classMap.has(row.classId)) {
          classMap.set(row.classId, {
            classId: row.classId,
            className: row.className ?? row.classCode ?? row.classId,
            classCode: row.classCode ?? row.classId,
            sessions: [],
          });
        }
        classMap.get(row.classId)!.sessions.push({
          classSessionId: row.classSessionId,
          sessionIndex: row.sessionIndex,
          sessionDate: row.sessionDate,
          startTime: row.startTime,
          endTime: row.endTime,
          attendanceStatus: row.attendanceStatus,
          attendanceNote: row.attendanceNote,
        });
      }

      res.json(Array.from(classMap.values()));
    } catch (err: any) {
      console.error("Student calendar list error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải danh sách buổi học" });
    }
  });

  // ── Student class list (lightweight — class metadata + session count only) ─
  app.get("/api/my-space/calendar/student/classes", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const ctx = await getStudentContext(user.id);
      if (!ctx.selfStudentId) return res.status(403).json({ message: "Tài khoản không phải học viên" });
      if (ctx.studentIds.length === 0) return res.json([]);

      const rows = await db
        .select({
          classId: classes.id,
          className: classes.name,
          classCode: classes.classCode,
          totalSessions: sql<number>`count(${studentSessions.id})::int`,
        })
        .from(studentSessions)
        .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .where(inArray(studentSessions.studentId, ctx.studentIds))
        .groupBy(classes.id, classes.name, classes.classCode)
        .orderBy(classes.classCode);

      const classRows = rows.map((r) => ({
        classId: r.classId,
        className: r.className ?? r.classCode ?? r.classId,
        classCode: r.classCode ?? r.classId,
        totalSessions: r.totalSessions,
      }));

      const freeRows = await db
        .select({
          classId: classes.id,
          className: classes.name,
          classCode: classes.classCode,
          totalSessions: sql<number>`count(${freeClassRegistrations.id})::int`,
        })
        .from(freeClassRegistrations)
        .innerJoin(classes, eq(freeClassRegistrations.classId, classes.id))
        .innerJoin(studentClasses, eq(freeClassRegistrations.studentClassId, studentClasses.id))
        .where(and(
          eq(classes.classType, "free"),
          inArray(freeClassRegistrations.studentId, ctx.studentIds),
          inArray(studentClasses.status, ["active", "waiting"]),
        ))
        .groupBy(classes.id, classes.name, classes.classCode)
        .orderBy(classes.classCode);

      const knownClassIds = new Set(classRows.map((row) => row.classId));
      for (const row of freeRows) {
        if (knownClassIds.has(row.classId)) {
          const existing = classRows.find((item) => item.classId === row.classId);
          if (existing) existing.totalSessions += Number(row.totalSessions ?? 0);
        } else {
          classRows.push({
            classId: row.classId,
            className: row.className ?? row.classCode ?? row.classId,
            classCode: row.classCode ?? row.classId,
            totalSessions: Number(row.totalSessions ?? 0),
          });
          knownClassIds.add(row.classId);
        }
      }

      res.json(classRows);
    } catch (err: any) {
      console.error("Student classes list error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải danh sách lớp" });
    }
  });

  // ── Student paginated sessions per class ──────────────────────────────────
  app.get("/api/my-space/calendar/student/class/:classId/sessions", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const ctx = await getStudentContext(user.id);
      if (!ctx.selfStudentId) return res.status(403).json({ message: "Tài khoản không phải học viên" });

      const { classId } = req.params;
      const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
      const pageSize = Math.min(50, Math.max(1, parseInt((req.query.pageSize as string) ?? "20", 10)));
      const offset = (page - 1) * pageSize;

      if (ctx.studentIds.length === 0) return res.json({ sessions: [], total: 0, page, pageSize, totalPages: 0 });

      const [classRow] = await db
        .select({ classType: classes.classType })
        .from(classes)
        .where(eq(classes.id, classId))
        .limit(1);

      if (classRow?.classType === "free") {
        const [countRow] = await db
          .select({ total: sql<number>`count(${freeClassRegistrations.id})::int` })
          .from(freeClassRegistrations)
          .innerJoin(studentClasses, eq(freeClassRegistrations.studentClassId, studentClasses.id))
          .where(and(
            eq(freeClassRegistrations.classId, classId),
            inArray(freeClassRegistrations.studentId, ctx.studentIds),
            inArray(studentClasses.status, ["active", "waiting"]),
          ));
        const freeRows = await db
          .select({
            registrationId: freeClassRegistrations.id,
            sessionDate: freeClassRegistrations.registrationDate,
            status: freeClassRegistrations.status,
            note: freeClassRegistrations.note,
            reviewPublished: freeClassRegistrations.reviewPublished,
          })
          .from(freeClassRegistrations)
          .innerJoin(studentClasses, eq(freeClassRegistrations.studentClassId, studentClasses.id))
          .where(and(
            eq(freeClassRegistrations.classId, classId),
            inArray(freeClassRegistrations.studentId, ctx.studentIds),
            inArray(studentClasses.status, ["active", "waiting"]),
          ))
          .orderBy(freeClassRegistrations.registrationDate)
          .limit(pageSize)
          .offset(offset);

        const total = Number(countRow?.total ?? 0);
        return res.json({
          sessions: freeRows.map((row) => ({
            classSessionId: getFreeSessionId(row.registrationId),
            sessionIndex: null,
            sessionDate: row.sessionDate,
            startTime: "",
            endTime: "",
            attendanceStatus: mapFreeAttendanceStatus(row.status),
            attendanceNote: row.note ?? null,
            reviewPublished: row.reviewPublished ?? false,
          })),
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        });
      }

      const [countRow] = await db
        .select({ total: sql<number>`count(${studentSessions.id})::int` })
        .from(studentSessions)
        .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
        .where(
          and(
            inArray(studentSessions.studentId, ctx.studentIds),
            eq(classSessions.classId, classId)
          )
        );

      const total = countRow?.total ?? 0;

      const rows = await db
        .select({
          classSessionId: classSessions.id,
          sessionIndex: classSessions.sessionIndex,
          sessionDate: classSessions.sessionDate,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
          attendanceStatus: studentSessions.attendanceStatus,
          attendanceNote: studentSessions.attendanceNote,
          reviewPublished: studentSessions.reviewPublished,
        })
        .from(studentSessions)
        .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
        .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .where(
          and(
            inArray(studentSessions.studentId, ctx.studentIds),
            eq(classSessions.classId, classId)
          )
        )
        .orderBy(classSessions.sessionIndex, classSessions.sessionDate)
        .limit(pageSize)
        .offset(offset);

      res.json({
        sessions: rows,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
    } catch (err: any) {
      console.error("Student class sessions error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải buổi học theo lớp" });
    }
  });

  // ── Student session detail (full details fetched on demand) ───────────────
  app.get("/api/my-space/calendar/student/session/:classSessionId", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const ctx = await getStudentContext(user.id);
      if (!ctx.selfStudentId) return res.status(403).json({ message: "Tài khoản không phải học viên" });
      if (ctx.studentIds.length === 0) return res.status(404).json({ message: "Không tìm thấy buổi học" });

      const { classSessionId } = req.params;
      const requestedStudentId = req.query.studentId as string | undefined;

      // If a specific studentId is provided (parent viewing a child's session), use it directly
      const targetStudentIds = requestedStudentId && ctx.studentIds.includes(requestedStudentId)
        ? [requestedStudentId]
        : ctx.studentIds;

      if (classSessionId.startsWith("free-")) {
        const registrationId = classSessionId.slice("free-".length);
        const [freeRow] = await db
          .select({
            registrationId: freeClassRegistrations.id,
            classId: classes.id,
            className: classes.name,
            classCode: classes.classCode,
            classTeacherIds: classes.teacherIds,
            classColor: classes.color,
            learningFormat: classes.learningFormat,
            onlineLink: classes.onlineLink,
            locationId: classes.locationId,
            locationName: locations.name,
            evaluationCriteriaIds: classes.evaluationCriteriaIds,
            studentClassId: freeClassRegistrations.studentClassId,
            studentId: freeClassRegistrations.studentId,
            sessionDate: freeClassRegistrations.registrationDate,
            status: freeClassRegistrations.status,
             teacherId: freeClassRegistrations.teacherId,
             shiftTemplateId: freeClassRegistrations.shiftTemplateId,
            note: freeClassRegistrations.note,
            reviewData: freeClassRegistrations.reviewData,
            reviewPublished: freeClassRegistrations.reviewPublished,
            studentName: students.fullName,
            studentCode: students.code,
          })
          .from(freeClassRegistrations)
          .innerJoin(classes, eq(freeClassRegistrations.classId, classes.id))
          .innerJoin(studentClasses, eq(freeClassRegistrations.studentClassId, studentClasses.id))
          .innerJoin(students, eq(freeClassRegistrations.studentId, students.id))
          .leftJoin(locations, eq(classes.locationId, locations.id))
          .where(and(
            eq(freeClassRegistrations.id, registrationId),
            eq(classes.classType, "free"),
            inArray(freeClassRegistrations.studentId, targetStudentIds),
            inArray(studentClasses.status, ["active", "waiting"]),
          ))
          .limit(1);

        if (!freeRow) return res.status(404).json({ message: "Không tìm thấy buổi học tự do" });
        const date = String(freeRow.sessionDate).slice(0, 10);
        const freeDayAssignmentMap = await getFreeDayAssignmentMap([freeRow.classId], date, date);
        const dayAssignment = freeDayAssignmentMap.get(`${freeRow.classId}:${date}`);
        const effectiveTeacherIds = freeRow.teacherId
          ? [freeRow.teacherId]
          : dayAssignment?.teacherId
          ? [dayAssignment.teacherId]
          : (freeRow.classTeacherIds ?? []);
        const effectiveShift = freeRow.shiftTemplateId
          ? (await getFreeShiftMap([freeRow.shiftTemplateId])).get(freeRow.shiftTemplateId)
          : dayAssignment?.shiftTemplateId
          ? dayAssignment
          : null;
        const teacherIds = [...new Set(effectiveTeacherIds)];
        const teacherNames = await getTeacherNames([...new Set(teacherIds)]);
        const linkedStudent = ctx.linkedStudents.find((s) => s.id === freeRow.studentId);
        const freeContents = await getFreeSessionContents(freeRow.classId, date, freeRow.studentId);

        return res.json({
          classSessionId,
          studentSessionId: null,
          sessionDate: date,
          weekday: new Date(`${date}T00:00:00`).getDay(),
          className: freeRow.className,
          classCode: freeRow.classCode,
          classColor: freeRow.classColor ?? null,
          startTime: effectiveShift?.shiftStart || effectiveShift?.startTime || "",
          endTime: effectiveShift?.shiftEnd || effectiveShift?.endTime || "",
          learningFormat: freeRow.learningFormat ?? "offline",
          onlineLink: freeRow.onlineLink ?? null,
          locationId: freeRow.locationId ?? null,
          locationName: freeRow.locationName ?? null,
          sessionStatus: "scheduled",
          teacherNames,
          attendanceStatus: mapFreeAttendanceStatus(freeRow.status),
          attendanceNote: freeRow.note ?? null,
          reviewData: freeRow.reviewPublished ? parseReviewData(freeRow.reviewData) : [],
          reviewPublished: freeRow.reviewPublished ?? false,
          evaluationCriteriaIds: freeRow.evaluationCriteriaIds ?? [],
          generalContents: freeContents.general.map(mapFreeContentForCalendar),
          personalContents: freeContents.personal.map((content) => ({
            ...mapFreeContentForCalendar(content),
            customTitle: null,
            customDescription: null,
          })),
          userType: "student",
          studentName: ctx.isParent ? (linkedStudent?.fullName ?? null) : null,
          studentCode: ctx.isParent ? (linkedStudent?.code ?? null) : null,
          enrolledCount: 1,
          onlineClickedAt: null,
          onlineEndedAt: null,
          isFreeSession: true,
          freeStatus: freeRow.status,
        });
      }

      const [row] = await db
        .select({
          studentSessionId: studentSessions.id,
          classSessionId: classSessions.id,
          sessionDate: classSessions.sessionDate,
          weekday: classSessions.weekday,
          learningFormat: classSessions.learningFormat,
          sessionStatus: classSessions.status,
          teacherIds: classSessions.teacherIds,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
          className: classes.name,
          classCode: classes.classCode,
          onlineLink: classes.onlineLink,
          locationId: classes.locationId,
          attendanceStatus: studentSessions.attendanceStatus,
          attendanceNote: studentSessions.attendanceNote,
          reviewData: studentSessions.reviewData,
          reviewPublished: studentSessions.reviewPublished,
          onlineClickedAt: studentSessions.onlineClickedAt,
          onlineEndedAt: studentSessions.onlineEndedAt,
          studentId: studentSessions.studentId,
        })
        .from(studentSessions)
        .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .where(
          and(
            inArray(studentSessions.studentId, targetStudentIds),
            eq(classSessions.id, classSessionId)
          )
        )
        .limit(1);

      if (!row) {
        // Fallback: check if this is a test session (from test_sessions table)
        const tsResult = await pool.query(
          `SELECT ts.id, ts.title, ts.test_date::text AS test_date, ts.time_start, ts.time_end,
                  ts.teacher_ids, ts.student_ids, ts.location_id,
                  ts.assignment_ids, ts.exam_ids, ts.content_settings
           FROM test_sessions ts
           WHERE ts.id = $1
             AND ts.student_ids && $2::uuid[]
           LIMIT 1`,
          [classSessionId, ctx.studentIds]
        );
        if (tsResult.rows.length === 0) {
          return res.status(404).json({ message: "Không tìm thấy buổi học" });
        }
        const ts = tsResult.rows[0];
        const weekday = new Date(ts.test_date + "T00:00:00").getDay();
        const teacherNames = await getTeacherNames(ts.teacher_ids ?? []);

        // Fetch assignment contents from course_program_contents
        const assignmentIds: string[] = ts.assignment_ids ?? [];
        const examIdsArr: string[] = ts.exam_ids ?? [];
        const contentSettings: Record<string, { availableAt?: string; maxAttempts?: number }> = (ts.content_settings as any) ?? {};
        const generalContents: { id: string; type: string; title: string; description: string | null; resourceUrl: string | null; availableAt: string | null; maxAttempts: number | null }[] = [];

        if (assignmentIds.length > 0) {
          const assignResult = await pool.query(
            `SELECT id, title, type, content FROM course_program_contents WHERE id = ANY($1::uuid[])`,
            [assignmentIds]
          );
          for (const a of assignResult.rows) {
            const cfg = contentSettings[a.id] ?? {};
            generalContents.push({ id: a.id, type: a.type ?? "Bài tập về nhà", title: a.title, description: a.content ?? null, resourceUrl: null, availableAt: cfg.availableAt ?? null, maxAttempts: cfg.maxAttempts ?? null });
          }
        }

        if (examIdsArr.length > 0) {
          const examResult2 = await pool.query(
            `SELECT id, name, code FROM exams WHERE id = ANY($1::uuid[])`,
            [examIdsArr]
          );
          for (const e of examResult2.rows) {
            const cfg = contentSettings[e.id] ?? {};
            generalContents.push({ id: e.id, type: "Bài kiểm tra", title: e.name ?? e.code ?? "Đề thi", description: null, resourceUrl: e.id, availableAt: cfg.availableAt ?? null, maxAttempts: cfg.maxAttempts ?? null });
          }
        }

        // Resolve locationName for test session
        let tsLocationName: string | null = null;
        if (ts.location_id) {
          const [locRow] = await db.select({ name: locations.name }).from(locations).where(eq(locations.id, ts.location_id)).limit(1);
          tsLocationName = locRow?.name ?? null;
        }

        const rowStudentId = requestedStudentId && ctx.studentIds.includes(requestedStudentId)
          ? requestedStudentId
          : ctx.studentIds[0];
        const linkedStudent = ctx.linkedStudents.find(s => s.id === rowStudentId);
        return res.json({
          classSessionId: ts.id,
          studentSessionId: null,
          sessionDate: ts.test_date,
          weekday,
          className: ts.title,
          classCode: "TEST",
          startTime: ts.time_start || "",
          endTime: ts.time_end || "",
          learningFormat: "offline",
          onlineLink: null,
          locationId: ts.location_id ?? null,
          locationName: tsLocationName,
          sessionStatus: "scheduled",
          teacherNames,
          attendanceStatus: null,
          attendanceNote: null,
          reviewData: [],
          reviewPublished: false,
          generalContents,
          personalContents: [],
          userType: "student",
          studentName: ctx.isParent ? (linkedStudent?.fullName ?? null) : null,
          studentCode: ctx.isParent ? (linkedStudent?.code ?? null) : null,
          enrolledCount: (ts.student_ids || []).length,
          onlineClickedAt: null,
          onlineEndedAt: null,
        });
      }

      const rowStudentId = row.studentId ?? ctx.selfStudentId!;
      const linkedStudent = ctx.linkedStudents.find(s => s.id === rowStudentId);

      // Resolve locationName, teacherNames, enrolledCount in parallel
      const [teacherNames, contents, stats, locationRow] = await Promise.all([
        getTeacherNames(row.teacherIds ?? []),
        getSessionContents(row.classSessionId, rowStudentId),
        getSessionAttendanceStats(row.classSessionId),
        row.locationId
          ? db.select({ name: locations.name }).from(locations).where(eq(locations.id, row.locationId)).limit(1)
          : Promise.resolve([]),
      ]);
      const locationName = (locationRow as any[])[0]?.name ?? null;

      res.json({
        classSessionId: row.classSessionId,
        studentSessionId: row.studentSessionId,
        sessionDate: row.sessionDate,
        weekday: row.weekday,
        className: row.className,
        classCode: row.classCode,
        startTime: row.startTime,
        endTime: row.endTime,
        learningFormat: row.learningFormat,
        onlineLink: row.onlineLink ?? null,
        locationId: row.locationId ?? null,
        locationName,
        sessionStatus: row.sessionStatus,
        teacherNames,
        attendanceStatus: row.attendanceStatus,
        attendanceNote: row.attendanceNote,
        reviewData: row.reviewPublished ? parseReviewData(row.reviewData) : [],
        reviewPublished: row.reviewPublished ?? false,
        generalContents: contents.general,
        personalContents: contents.personal,
        userType: "student",
        studentName: ctx.isParent ? (linkedStudent?.fullName ?? null) : null,
        studentCode: ctx.isParent ? (linkedStudent?.code ?? null) : null,
        enrolledCount: stats.enrolledCount,
        onlineClickedAt: row.onlineClickedAt ? row.onlineClickedAt.toISOString() : null,
        onlineEndedAt: row.onlineEndedAt ? row.onlineEndedAt.toISOString() : null,
      });
    } catch (err: any) {
      console.error("Student session detail error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải chi tiết buổi học" });
    }
  });

  // ── Record test content attempt (check + log) ────────────────────────────
  app.post("/api/my-space/test-content-attempt", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const ctx = await getStudentContext(user.id);
      if (!ctx.selfStudentId && ctx.studentIds.length === 0) {
        return res.status(403).json({ message: "Tài khoản không phải học viên" });
      }
      const { testSessionId, contentId, contentType, studentId: reqStudentId } = req.body;
      if (!testSessionId || !contentId) {
        return res.status(400).json({ message: "Thiếu thông tin" });
      }
      const studentId = (reqStudentId && ctx.studentIds.includes(reqStudentId))
        ? reqStudentId
        : ctx.selfStudentId ?? ctx.studentIds[0];
      if (!studentId) return res.status(403).json({ message: "Không xác định được học viên" });

      // Load test session to get contentSettings
      const tsRes = await pool.query(
        `SELECT content_settings, student_ids FROM test_sessions WHERE id = $1 LIMIT 1`,
        [testSessionId]
      );
      if (tsRes.rows.length === 0) return res.status(404).json({ message: "Không tìm thấy buổi test" });
      const ts = tsRes.rows[0];
      const cfg = ((ts.content_settings as any) ?? {})[contentId] ?? {};
      const maxAttempts: number | null = cfg.maxAttempts ?? null;

      // Count existing attempts
      const attRes = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM test_session_content_attempts
         WHERE test_session_id = $1 AND student_id = $2 AND content_id = $3`,
        [testSessionId, studentId, contentId]
      );
      const attemptsUsed: number = attRes.rows[0]?.cnt ?? 0;

      if (maxAttempts !== null && maxAttempts > 0 && attemptsUsed >= maxAttempts) {
        return res.json({ allowed: false, attemptsUsed, maxAttempts });
      }

      // Record attempt
      await pool.query(
        `INSERT INTO test_session_content_attempts (test_session_id, student_id, content_id, content_type)
         VALUES ($1, $2, $3, $4)`,
        [testSessionId, studentId, contentId, contentType ?? "assignment"]
      );

      return res.json({ allowed: true, attemptsUsed: attemptsUsed + 1, maxAttempts });
    } catch (err: any) {
      console.error("Test content attempt error:", err);
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Record student clicking the online link ──────────────────────────────
  app.post("/api/my-space/calendar/student/session/:classSessionId/online-click", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const ctx = await getStudentContext(user.id);
      if (!ctx.selfStudentId) return res.status(403).json({ message: "Tài khoản không phải học viên" });

      const { classSessionId } = req.params;
      const requestedStudentId = req.query.studentId as string | undefined;
      const targetStudentIds = requestedStudentId && ctx.studentIds.includes(requestedStudentId)
        ? [requestedStudentId]
        : ctx.studentIds;

      const [ss] = await db
        .select({
          id: studentSessions.id,
          onlineEndedAt: studentSessions.onlineEndedAt,
          locationId: classes.locationId,
        })
        .from(studentSessions)
        .innerJoin(classes, eq(studentSessions.classId, classes.id))
        .where(and(
          inArray(studentSessions.studentId, targetStudentIds),
          eq(studentSessions.classSessionId, classSessionId)
        ))
        .limit(1);

      if (!ss) return res.status(404).json({ message: "Không tìm thấy buổi học" });

      if (ss.onlineEndedAt) {
        return res.status(400).json({ message: "Buổi học online đã kết thúc, không thể ghi nhận lại giờ vào" });
      }

      const now = new Date();
      await db.update(studentSessions)
        .set({ onlineClickedAt: now })
        .where(eq(studentSessions.id, ss.id));

      const [onlineRule] = ss.locationId
        ? await db
            .select({ autoAttendanceOnJoin: onlineLearningRules.autoAttendanceOnJoin })
            .from(onlineLearningRules)
            .where(eq(onlineLearningRules.locationId, ss.locationId))
            .limit(1)
        : [];
      if (onlineRule?.autoAttendanceOnJoin) {
        await updateStudentAttendance(ss.id, "present", undefined, user.id, undefined);
      }

      res.json({ onlineClickedAt: now.toISOString() });
    } catch (err: any) {
      console.error("Online click record error:", err);
      res.status(500).json({ message: err.message || "Lỗi ghi nhận click" });
    }
  });

  // ── Record student ending online session ─────────────────────────────────
  app.post("/api/my-space/calendar/student/session/:classSessionId/online-end", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const ctx = await getStudentContext(user.id);
      if (!ctx.selfStudentId) return res.status(403).json({ message: "Tài khoản không phải học viên" });

      const { classSessionId } = req.params;
      const requestedStudentId = req.query.studentId as string | undefined;
      const targetStudentIds = requestedStudentId && ctx.studentIds.includes(requestedStudentId)
        ? [requestedStudentId]
        : ctx.studentIds;

      const [ss] = await db
        .select({ id: studentSessions.id, onlineClickedAt: studentSessions.onlineClickedAt })
        .from(studentSessions)
        .where(and(
          inArray(studentSessions.studentId, targetStudentIds),
          eq(studentSessions.classSessionId, classSessionId)
        ))
        .limit(1);

      if (!ss) return res.status(404).json({ message: "Không tìm thấy buổi học" });
      if (!ss.onlineClickedAt) return res.status(400).json({ message: "Học viên chưa vào học online" });

      const now = new Date();
      await db.update(studentSessions)
        .set({ onlineEndedAt: now })
        .where(eq(studentSessions.id, ss.id));

      res.json({ onlineEndedAt: now.toISOString() });
    } catch (err: any) {
      console.error("Online end record error:", err);
      res.status(500).json({ message: err.message || "Lỗi ghi nhận kết thúc" });
    }
  });

  // ── Staff calendar ───────────────────────────────────────────────────────
  app.get("/api/my-space/calendar/staff", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const inDaotao = await isStaffInDaotaoDept(staffRecord.id);
      if (!inDaotao) return res.status(403).json({ message: "Tài khoản không thuộc Phòng Đào tạo" });

      const { month } = req.query as { month?: string };
      const { dateFrom, dateTo, monthStr } = getDateRange(month);

      const result = await db.execute(sql`
        SELECT
          cs.id AS class_session_id,
          cs.class_id,
          cs.session_date,
          cs.weekday,
          cs.learning_format,
          cs.status AS session_status,
          cs.session_index,
          st.start_time,
          st.end_time,
          c.name AS class_name,
          c.class_code,
          c.color AS class_color,
          c.online_link,
          c.location_id,
          ta.check_in_at,
          ta.check_out_at
        FROM class_sessions cs
        INNER JOIN classes c ON c.id = cs.class_id
        INNER JOIN shift_templates st ON st.id = cs.shift_template_id
        LEFT JOIN teacher_attendance ta ON ta.class_session_id = cs.id AND ta.staff_id = ${staffRecord.id}::uuid
        WHERE cs.teacher_ids @> ARRAY[${staffRecord.id}]::uuid[]
          AND cs.session_date >= ${dateFrom}
          AND cs.session_date <= ${dateTo}
        ORDER BY cs.session_date, st.start_time
      `);

      const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
      const sessions = (rows as any[]).map((row) => ({
        classSessionId: row.class_session_id,
        studentSessionId: null,
        classId: row.class_id ?? null,
        sessionDate: row.session_date,
        weekday: row.weekday,
        className: row.class_name,
        classCode: row.class_code,
        classColor: row.class_color ?? null,
        startTime: row.start_time,
        endTime: row.end_time,
        learningFormat: row.learning_format,
        onlineLink: row.online_link ?? null,
        locationId: row.location_id ?? null,
        sessionStatus: row.session_status,
        attendanceStatus: null,
        checkInAt: row.check_in_at ? new Date(row.check_in_at).toISOString() : null,
        checkOutAt: row.check_out_at ? new Date(row.check_out_at).toISOString() : null,
      }));

      // Flexible classes have no class_sessions. A staff member sees each
      // class/date with the registered students assigned to that staff member
      // or to the class.
      const freeRows = await db
        .select({
          registrationId: freeClassRegistrations.id,
          classId: classes.id,
          className: classes.name,
          classCode: classes.classCode,
          classColor: classes.color,
          learningFormat: classes.learningFormat,
          onlineLink: classes.onlineLink,
          locationId: classes.locationId,
          classTeacherIds: classes.teacherIds,
          registrationDate: freeClassRegistrations.registrationDate,
          registrationStatus: freeClassRegistrations.status,
          teacherId: freeClassRegistrations.teacherId,
           shiftTemplateId: freeClassRegistrations.shiftTemplateId,
          studentClassId: freeClassRegistrations.studentClassId,
          studentId: freeClassRegistrations.studentId,
          studentName: students.fullName,
          studentCode: students.code,
          note: freeClassRegistrations.note,
          reviewData: freeClassRegistrations.reviewData,
          reviewPublished: freeClassRegistrations.reviewPublished,
          evaluationCriteriaIds: classes.evaluationCriteriaIds,
        })
        .from(freeClassRegistrations)
        .innerJoin(classes, eq(freeClassRegistrations.classId, classes.id))
        .innerJoin(studentClasses, eq(freeClassRegistrations.studentClassId, studentClasses.id))
        .innerJoin(students, eq(freeClassRegistrations.studentId, students.id))
        .where(and(
          eq(classes.classType, "free"),
          inArray(studentClasses.status, ["active", "waiting"]),
          gte(freeClassRegistrations.registrationDate, dateFrom),
          lte(freeClassRegistrations.registrationDate, dateTo),
        ))
        .orderBy(freeClassRegistrations.registrationDate);

       const freeDayAssignmentMap = await getFreeDayAssignmentMap(
         [...new Set(freeRows.map((row) => row.classId))],
         dateFrom,
         dateTo,
       );
       const freeOverrideShiftMap = await getFreeShiftMap(
         [...new Set(freeRows.map((row) => row.shiftTemplateId).filter(Boolean) as string[])],
       );
      const freeSessionMap = new Map<string, any>();
      for (const row of freeRows) {
        const date = String(row.registrationDate).slice(0, 10);
         const dayAssignment = freeDayAssignmentMap.get(`${row.classId}:${date}`);
         const effectiveTeacherId = row.teacherId || dayAssignment?.teacherId || null;
         const visibleToStaff = effectiveTeacherId
           ? effectiveTeacherId === staffRecord.id
           : (row.classTeacherIds ?? []).includes(staffRecord.id);
         if (!visibleToStaff) continue;
         const effectiveShift = row.shiftTemplateId
           ? freeOverrideShiftMap.get(row.shiftTemplateId)
           : dayAssignment?.shiftTemplateId
           ? dayAssignment
           : null;
        const key = `${row.classId}:${date}`;
        let freeSession = freeSessionMap.get(key);
        if (!freeSession) {
          freeSession = {
            classSessionId: getFreeStaffSessionId(row.classId, date),
            studentSessionId: null,
            classId: row.classId,
            sessionDate: date,
            weekday: new Date(`${date}T00:00:00`).getDay(),
            className: row.className,
            classCode: row.classCode,
            classColor: row.classColor ?? null,
             startTime: effectiveShift?.shiftStart || effectiveShift?.startTime || "",
             endTime: effectiveShift?.shiftEnd || effectiveShift?.endTime || "",
            learningFormat: row.learningFormat ?? "offline",
            onlineLink: row.onlineLink ?? null,
            locationId: row.locationId ?? null,
            sessionStatus: "scheduled",
            attendanceStatus: null,
            checkInAt: null,
            checkOutAt: null,
            isFreeSession: true,
            freeStudents: [],
            evaluationCriteriaIds: row.evaluationCriteriaIds ?? [],
          };
          freeSessionMap.set(key, freeSession);
        }
        freeSession.freeStudents.push({
          registrationId: row.registrationId,
          studentClassId: row.studentClassId,
          studentId: row.studentId,
          fullName: row.studentName,
          code: row.studentCode,
          status: row.registrationStatus,
           teacherId: effectiveTeacherId,
           shiftTemplateId: row.shiftTemplateId || dayAssignment?.shiftTemplateId || null,
           shiftStart: effectiveShift?.shiftStart || effectiveShift?.startTime || null,
           shiftEnd: effectiveShift?.shiftEnd || effectiveShift?.endTime || null,
          note: row.note ?? null,
          reviewData: row.reviewData,
          reviewPublished: row.reviewPublished ?? false,
        });
      }
      sessions.push(...Array.from(freeSessionMap.values()));

      // Merge test sessions where this staff is in teacher_ids
      const tsStaffResult = await pool.query(
        `SELECT ts.id, ts.title, ts.location_id, ts.test_date::text AS test_date, ts.time_start, ts.time_end
         FROM test_sessions ts
         WHERE ts.test_date >= $1::date AND ts.test_date <= $2::date
           AND ts.teacher_ids @> $3::uuid[]
         ORDER BY ts.test_date, ts.time_start`,
        [dateFrom, dateTo, [staffRecord.id]]
      );
      for (const ts of tsStaffResult.rows as any[]) {
        const weekday = new Date(ts.test_date + "T00:00:00").getDay();
        sessions.push({
          classSessionId: ts.id,
          studentSessionId: null,
          sessionDate: ts.test_date,
          weekday,
          className: ts.title,
          classCode: "TEST",
          startTime: ts.time_start || "",
          endTime: ts.time_end || "",
          learningFormat: "offline",
          onlineLink: null,
          locationId: ts.location_id || null,
          sessionStatus: "scheduled",
          attendanceStatus: null,
          checkInAt: null,
          checkOutAt: null,
          isTestSession: true,
        } as any);
      }

      const datesWithSessions = [...new Set(sessions.map((s) => s.sessionDate))];
      res.json({ sessions, datesWithSessions, month: monthStr, staffId: staffRecord.id });
    } catch (err: any) {
      console.error("Staff calendar error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải lịch nhân viên" });
    }
  });

  // ── Staff session detail (on-demand) ─────────────────────────────────────
  app.get("/api/my-space/calendar/staff/session/:classSessionId", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const { classSessionId } = req.params;

      if (classSessionId.startsWith("free-")) {
        const encoded = classSessionId.slice("free-".length);
        const separatorIndex = encoded.indexOf("__");
        const freeClassId = separatorIndex >= 0 ? encoded.slice(0, separatorIndex) : "";
        const freeDate = separatorIndex >= 0 ? encoded.slice(separatorIndex + 2) : "";
        if (!freeClassId || !/^\d{4}-\d{2}-\d{2}$/.test(freeDate)) {
          return res.status(404).json({ message: "Không tìm thấy buổi học tự do" });
        }

        const freeRows = await db
          .select({
            registrationId: freeClassRegistrations.id,
            classId: classes.id,
            className: classes.name,
            classCode: classes.classCode,
            classTeacherIds: classes.teacherIds,
            classColor: classes.color,
            learningFormat: classes.learningFormat,
            onlineLink: classes.onlineLink,
            locationId: classes.locationId,
            locationName: locations.name,
            evaluationCriteriaIds: classes.evaluationCriteriaIds,
            studentClassId: freeClassRegistrations.studentClassId,
            studentId: freeClassRegistrations.studentId,
            status: freeClassRegistrations.status,
            teacherId: freeClassRegistrations.teacherId,
             shiftTemplateId: freeClassRegistrations.shiftTemplateId,
            note: freeClassRegistrations.note,
            reviewData: freeClassRegistrations.reviewData,
            reviewPublished: freeClassRegistrations.reviewPublished,
            studentName: students.fullName,
            studentCode: students.code,
          })
          .from(freeClassRegistrations)
          .innerJoin(classes, eq(freeClassRegistrations.classId, classes.id))
          .innerJoin(studentClasses, eq(freeClassRegistrations.studentClassId, studentClasses.id))
          .innerJoin(students, eq(freeClassRegistrations.studentId, students.id))
          .leftJoin(locations, eq(classes.locationId, locations.id))
          .where(and(
            eq(freeClassRegistrations.classId, freeClassId),
            eq(freeClassRegistrations.registrationDate, freeDate),
            eq(classes.classType, "free"),
            inArray(studentClasses.status, ["active", "waiting"]),
          ))
          .orderBy(students.fullName);

        const freeDayAssignmentMap = await getFreeDayAssignmentMap([freeClassId], freeDate, freeDate);
        const dayAssignment = freeDayAssignmentMap.get(`${freeClassId}:${freeDate}`);
        const freeOverrideShiftMap = await getFreeShiftMap(
          [...new Set(freeRows.map((row) => row.shiftTemplateId).filter(Boolean) as string[])],
        );
        const visibleFreeRows = freeRows
          .map((row) => {
            const effectiveTeacherId = row.teacherId || dayAssignment?.teacherId || null;
            const effectiveShift = row.shiftTemplateId
              ? freeOverrideShiftMap.get(row.shiftTemplateId)
              : dayAssignment?.shiftTemplateId
              ? dayAssignment
              : null;
            return {
              ...row,
              effectiveTeacherId,
              effectiveShift,
            };
          })
          .filter((row) =>
            row.effectiveTeacherId
              ? row.effectiveTeacherId === staffRecord.id
              : (row.classTeacherIds ?? []).includes(staffRecord.id),
          );

        if (visibleFreeRows.length === 0) {
          return res.status(404).json({ message: "Không tìm thấy buổi học tự do" });
        }

        const first = visibleFreeRows[0];
        const teacherIds = [...new Set(
          visibleFreeRows.map((row) =>
            row.effectiveTeacherId || (row.classTeacherIds ?? [])[0],
          ).filter(Boolean),
        )];
        const teachers = await getTeachersWithIds(teacherIds);
        const freeContents = await getFreeSessionContents(first.classId, freeDate);

        return res.json({
          classSessionId,
          classId: first.classId,
          studentSessionId: null,
          sessionDate: freeDate,
          weekday: new Date(`${freeDate}T00:00:00`).getDay(),
          className: first.className,
          classCode: first.classCode,
          classColor: first.classColor ?? null,
          startTime: first.effectiveShift?.shiftStart || first.effectiveShift?.startTime || "",
          endTime: first.effectiveShift?.shiftEnd || first.effectiveShift?.endTime || "",
          learningFormat: first.learningFormat ?? "offline",
          onlineLink: first.onlineLink ?? null,
          locationName: first.locationName ?? null,
          sessionStatus: "scheduled",
          sessionIndex: null,
          totalSessions: null,
          teachers,
          teacherNames: teachers.map((teacher) => teacher.fullName),
          evaluationCriteriaIds: first.evaluationCriteriaIds ?? [],
          attendanceStatus: null,
          attendanceNote: null,
          reviewData: [],
          reviewPublished: false,
          generalContents: freeContents.general.map(mapFreeContentForCalendar),
          personalContents: [],
          userType: "staff",
          enrolledCount: visibleFreeRows.length,
          attendancePendingCount: visibleFreeRows.filter((row) => row.status === "registered").length,
          reviewedCount: visibleFreeRows.filter((row) => row.reviewPublished).length,
          isFreeSession: true,
          freeStudents: visibleFreeRows.map((row) => ({
            registrationId: row.registrationId,
            studentClassId: row.studentClassId,
            studentId: row.studentId,
            fullName: row.studentName,
            code: row.studentCode,
            status: row.status,
            teacherId: row.effectiveTeacherId,
            shiftTemplateId: row.shiftTemplateId || dayAssignment?.shiftTemplateId || null,
            shiftStart: row.effectiveShift?.shiftStart || row.effectiveShift?.startTime || null,
            shiftEnd: row.effectiveShift?.shiftEnd || row.effectiveShift?.endTime || null,
            note: row.note ?? null,
            reviewData: row.reviewData,
            reviewPublished: row.reviewPublished ?? false,
          })),
        });
      }

      const [row] = await db
        .select({
          classSessionId: classSessions.id,
          classId: classSessions.classId,
          sessionDate: classSessions.sessionDate,
          weekday: classSessions.weekday,
          learningFormat: classSessions.learningFormat,
          sessionStatus: classSessions.status,
          teacherIds: classSessions.teacherIds,
          evaluationCriteriaIds: classSessions.evaluationCriteriaIds,
          sessionIndex: classSessions.sessionIndex,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
          className: classes.name,
          classCode: classes.classCode,
          onlineLink: classes.onlineLink,
          totalSessions: sql<number>`(SELECT COUNT(*) FROM class_sessions cs2 WHERE cs2.class_id = ${classes.id})`,
          locationName: locations.name,
        })
        .from(classSessions)
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .leftJoin(locations, eq(classes.locationId, locations.id))
        .where(eq(classSessions.id, classSessionId))
        .limit(1);

      if (!row) {
        // Fallback: check test_sessions table (TEST class sessions)
        const [tsRow] = await db
          .select({
            id: testSessions.id,
            title: testSessions.title,
            testDate: testSessions.testDate,
            timeStart: testSessions.timeStart,
            timeEnd: testSessions.timeEnd,
            teacherIds: testSessions.teacherIds,
            studentCount: testSessions.studentCount,
            locationId: testSessions.locationId,
          })
          .from(testSessions)
          .where(eq(testSessions.id, classSessionId))
          .limit(1);

        if (!tsRow) return res.status(404).json({ message: "Không tìm thấy buổi học" });

        const tsTeachers = await getTeachersWithIds(tsRow.teacherIds ?? []);
        const tsTeacherNames = tsTeachers.map((t: any) => t.fullName);
        const weekday = new Date(tsRow.testDate + "T00:00:00").getDay();

        return res.json({
          classSessionId: tsRow.id,
          classId: null,
          studentSessionId: null,
          sessionDate: tsRow.testDate,
          weekday,
          className: tsRow.title,
          classCode: "TEST",
          startTime: tsRow.timeStart ?? "",
          endTime: tsRow.timeEnd ?? "",
          learningFormat: "offline",
          onlineLink: null,
          sessionStatus: "scheduled",
          sessionIndex: null,
          totalSessions: null,
          locationName: null,
          teachers: tsTeachers,
          teacherNames: tsTeacherNames,
          evaluationCriteriaIds: [],
          attendanceStatus: null,
          attendanceNote: null,
          reviewData: [],
          reviewPublished: false,
          generalContents: [],
          personalContents: [],
          userType: "staff",
          enrolledCount: tsRow.studentCount ?? 0,
          attendancePendingCount: 0,
          reviewedCount: 0,
        });
      }

      const [teachers, contents, stats, regularStudentSessions] = await Promise.all([
        getTeachersWithIds(row.teacherIds ?? []),
        getSessionContents(row.classSessionId),
        getSessionAttendanceStats(row.classSessionId),
        getRegularSessionStudents(row.classSessionId),
      ]);
      const teacherNames = teachers.map((t) => t.fullName);

      res.json({
        classSessionId: row.classSessionId,
        classId: row.classId,
        studentSessionId: null,
        sessionDate: row.sessionDate,
        weekday: row.weekday,
        className: row.className,
        classCode: row.classCode,
        startTime: row.startTime,
        endTime: row.endTime,
        learningFormat: row.learningFormat,
        onlineLink: row.onlineLink ?? null,
        sessionStatus: row.sessionStatus,
        sessionIndex: row.sessionIndex,
        totalSessions: row.totalSessions,
        locationName: row.locationName,
        teachers,
        teacherNames,
        evaluationCriteriaIds: row.evaluationCriteriaIds ?? [],
        attendanceStatus: null,
        attendanceNote: null,
        reviewData: [],
        reviewPublished: false,
        generalContents: contents.general,
        personalContents: [],
        userType: "staff",
        enrolledCount: stats.enrolledCount,
        attendancePendingCount: stats.pendingCount,
        reviewedCount: stats.reviewedCount,
        studentSessions: regularStudentSessions,
      });
    } catch (err: any) {
      console.error("Staff session detail error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải chi tiết buổi học nhân viên" });
    }
  });

  // ── Staff student list for a regular class session ───────────────────────
  // Kept separate from the calendar detail endpoint because the detail sheet
  // also uses this list for attendance and review actions.
  app.get("/api/class-sessions/:classSessionId/student-sessions", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const { classSessionId } = req.params;
      if (classSessionId.startsWith("free-")) return res.json([]);

      return res.json(await getRegularSessionStudents(classSessionId));
    } catch (err: any) {
      console.error("Staff class session student list error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải danh sách học viên buổi học" });
    }
  });

  // ── Student assignments ──────────────────────────────────────────────────
  app.get("/api/my-space/assignments/student", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const ctx = await getStudentContext(user.id);
      if (!ctx.selfStudentId) return res.status(403).json({ message: "Tài khoản không phải học viên" });
      if (ctx.studentIds.length === 0) return res.json({ rows: [], total: 0, page: 1, pageSize: 50, totalPages: 0, month: "" });

      const {
        month,
        dateFrom: qDateFrom,
        dateTo: qDateTo,
        status: qStatus,    // "all" | "submitted" | "pending"
        itemType: qItemType, // "all" | "BTVN" | "exam"
        classId: qClassId,
        page: qPage,
        pageSize: qPageSize,
      } = req.query as {
        month?: string; dateFrom?: string; dateTo?: string;
        status?: string; itemType?: string; classId?: string; page?: string; pageSize?: string;
      };
      let dateFrom: string;
      let dateTo: string;
      let monthStr: string;

      if (qDateFrom && qDateTo) {
        dateFrom = qDateFrom;
        dateTo = qDateTo;
        monthStr = qDateFrom.substring(0, 7);
      } else {
        const range = getDateRange(month);
        dateFrom = range.dateFrom;
        dateTo = range.dateTo;
        monthStr = range.monthStr;
      }

      const studentNameMap = new Map(ctx.linkedStudents.map(s => [s.id, s]));

      // Parse "filename||/uploads/path" format into { name, url } objects
      function parseAttachments(raw: Array<string | { name: string; url: string }> | null): { name: string; url: string }[] {
        if (!raw || raw.length === 0) return [];
        return raw.map((entry) => {
          if (typeof entry !== "string") return { name: (entry as any).name ?? "", url: (entry as any).url ?? "" };
          const sep = entry.indexOf("||");
          if (sep === -1) return { name: entry, url: entry };
          return { name: entry.substring(0, sep), url: entry.substring(sep + 2) };
        });
      }

      // General homework: session_contents with contentType='homework' for the student's enrolled sessions
      const generalRows = await db
        .select({
          classSessionId: classSessions.id,
          sessionDate: classSessions.sessionDate,
          weekday: classSessions.weekday,
          sessionIndex: classSessions.sessionIndex,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
          classId: classes.id,
          className: classes.name,
          classCode: classes.classCode,
          homeworkId: sessionContents.id,
          generalTitle: sessionContents.title,
          generalDescription: sessionContents.description,
          homeworkDueDate: sessionContents.dueDate,
          personalTitle: studentSessionContents.customTitle,
          personalDescription: studentSessionContents.customDescription,
          submissionStatus: studentSessionContents.status,
          submissionContent: studentSessionContents.submissionContent,
          submissionAttachments: studentSessionContents.submissionAttachments,
          studentSessionContentId: studentSessionContents.id,
          score: studentSessionContents.score,
          gradingComment: studentSessionContents.gradingComment,
          studentId: studentSessions.studentId,
          programAttachments: courseProgramContents.attachments,
          programContent: courseProgramContents.content,
        })
        .from(studentSessions)
        .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .innerJoin(sessionContents, and(
          eq(sessionContents.classSessionId, classSessions.id),
          inArray(sessionContents.contentType, ["homework", "Bài tập về nhà"])
        ))
        .leftJoin(studentSessionContents, and(
          eq(studentSessionContents.sessionContentId, sessionContents.id),
          eq(studentSessionContents.studentId, studentSessions.studentId)
        ))
        .leftJoin(courseProgramContents, sql`${sessionContents.resourceUrl} = ${courseProgramContents.id}::text`)
        .where(
          and(
            inArray(studentSessions.studentId, ctx.studentIds),
            gte(classSessions.sessionDate, dateFrom),
            lte(classSessions.sessionDate, dateTo)
          )
        )
        .orderBy(classSessions.sessionDate, shiftTemplates.startTime);

      const homeworkResult = generalRows.map((r) => {
        const linked = studentNameMap.get(r.studentId ?? "");
        return {
          classSessionId: r.classSessionId,
          classId: r.classId,
          className: r.className,
          classCode: r.classCode,
          sessionDate: r.sessionDate,
          weekday: r.weekday,
          startTime: r.startTime,
          endTime: r.endTime,
          sessionIndex: r.sessionIndex,
          studentId: r.studentId,
          studentName: linked?.fullName ?? "",
          itemType: "BTVN" as const,
          homeworkId: r.homeworkId,
          homeworkTitle: r.personalTitle || r.generalTitle,
          homeworkDescription: r.personalDescription || (r.programContent ?? r.generalDescription),
          homeworkAttachments: parseAttachments(r.programAttachments),
          isPersonalized: !!(r.personalTitle || r.personalDescription),
          submissionStatus: (r.submissionStatus === "submitted" ? "submitted" : "pending") as "submitted" | "pending",
          submissionContent: r.submissionContent ?? null,
          submissionAttachments: parseAttachments(r.submissionAttachments as string[] | null),
          studentSessionContentId: r.studentSessionContentId ?? null,
          score: r.score ?? null,
          comment: r.gradingComment ?? null,
          examId: null,
          dueDate: r.homeworkDueDate ? r.homeworkDueDate.toISOString() : null,
          maxAttempts: null as number | null,
          attemptsUsed: null as number | null,
        };
      });

      // Exam rows: session_contents with contentType='Bài kiểm tra' for enrolled sessions
      const examRows = await db
        .select({
          classSessionId: classSessions.id,
          classId: classes.id,
          sessionDate: classSessions.sessionDate,
          weekday: classSessions.weekday,
          sessionIndex: classSessions.sessionIndex,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
          className: classes.name,
          classCode: classes.classCode,
          examContentId: sessionContents.id,
          examTitle: sessionContents.title,
          examDescription: sessionContents.description,
          examResourceUrl: sessionContents.resourceUrl,
          studentId: studentSessions.studentId,
          submissionId: examSubmissions.id,
          submissionScore: examSubmissions.adjustedScore,
          submissionScoreRaw: examSubmissions.score,
          submissionComment: examSubmissions.comment,
          submittedAt: examSubmissions.submittedAt,
        })
        .from(studentSessions)
        .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .innerJoin(sessionContents, and(
          eq(sessionContents.classSessionId, classSessions.id),
          inArray(sessionContents.contentType, ["Bài kiểm tra", "exam"])
        ))
        .leftJoin(examSubmissions, and(
          sql`${examSubmissions.examId}::text = ${sessionContents.resourceUrl}`,
          eq(examSubmissions.studentId, studentSessions.studentId),
          sql`(${examSubmissions.classId} = ${classes.id} OR ${examSubmissions.classId} IS NULL)`
        ))
        .where(
          and(
            inArray(studentSessions.studentId, ctx.studentIds),
            gte(classSessions.sessionDate, dateFrom),
            lte(classSessions.sessionDate, dateTo)
          )
        )
        .orderBy(classSessions.sessionDate, shiftTemplates.startTime);

      // Deduplicate exam rows: keep one row per (classSessionId, examContentId, studentId).
      // The LEFT JOIN can return multiple rows when a student has multiple submissions
      // (multiple attempts). We prefer the row that has a submissionId; among those
      // we keep the MOST RECENT one (latest submittedAt) so score/comment always reflect
      // the latest attempt.
      const examDeduped = new Map<string, typeof examRows[0]>();
      for (const r of examRows) {
        const key = `${r.classSessionId}:${r.examContentId}:${r.studentId}`;
        const existing = examDeduped.get(key);
        if (!existing) {
          examDeduped.set(key, r);
        } else if (r.submissionId && !existing.submissionId) {
          examDeduped.set(key, r);
        } else if (r.submissionId && existing.submissionId) {
          // keep the most recent submission
          const rTime = r.submittedAt ? new Date(r.submittedAt).getTime() : 0;
          const eTime = existing.submittedAt ? new Date(existing.submittedAt).getTime() : 0;
          if (rTime >= eTime) examDeduped.set(key, r);
        }
      }

      const examResultBase = [...examDeduped.values()].map((r) => {
        const linked = studentNameMap.get(r.studentId ?? "");
        return {
          classSessionId: r.classSessionId,
          classId: r.classId,
          className: r.className,
          classCode: r.classCode,
          sessionDate: r.sessionDate,
          weekday: r.weekday,
          startTime: r.startTime,
          endTime: r.endTime,
          sessionIndex: r.sessionIndex,
          studentId: r.studentId,
          studentName: linked?.fullName ?? "",
          itemType: "Bài kiểm tra" as const,
          homeworkId: r.examContentId,
          homeworkTitle: r.examTitle,
          homeworkDescription: null,
          homeworkAttachments: [],
          isPersonalized: false,
          submissionStatus: r.submissionId ? "submitted" as const : "pending" as const,
          submissionContent: null,
          submissionAttachments: [],
          studentSessionContentId: null,
          score: r.submissionScore ?? r.submissionScoreRaw ?? null,
          comment: r.submissionComment ?? null,
          examId: r.examResourceUrl || r.examContentId,
          dueDate: null as string | null,
          maxAttempts: null as number | null,
          attemptsUsed: null as number | null,
          _examUuid: r.examResourceUrl,
        };
      });

      // Batch-fetch maxAttempts and attemptsUsed for exam rows
      const examUuids = [...new Set(examResultBase.map((r) => r._examUuid).filter(Boolean))] as string[];
      if (examUuids.length > 0) {
        const [maxAttemptRows, attRows] = await Promise.all([
          pool.query(`SELECT id::text, max_attempts FROM exams WHERE id::text = ANY($1)`, [examUuids]),
          pool.query(
            `SELECT exam_id::text, student_id::text, COUNT(*)::int AS cnt
             FROM exam_submissions
             WHERE exam_id::text = ANY($1) AND student_id = ANY($2::uuid[])
             GROUP BY exam_id, student_id`,
            [examUuids, ctx.studentIds]
          ),
        ]);
        const maxAttMap = new Map<string, number | null>(maxAttemptRows.rows.map((r: any) => [r.id, r.max_attempts]));
        const attMap = new Map<string, number>(attRows.rows.map((r: any) => [`${r.exam_id}:${r.student_id}`, r.cnt]));
        for (const r of examResultBase) {
          if (r._examUuid) {
            r.maxAttempts = maxAttMap.get(r._examUuid) ?? null;
            r.attemptsUsed = attMap.get(`${r._examUuid}:${r.studentId}`) ?? 0;
          }
        }
      }

      const examResult = examResultBase.map(({ _examUuid, ...r }) => r);

      // Merge and sort by date then start time
      let allRows = [...homeworkResult, ...examResult].sort((a, b) => {
        const dateCmp = a.sessionDate.localeCompare(b.sessionDate);
        if (dateCmp !== 0) return dateCmp;
        return a.startTime.localeCompare(b.startTime);
      });

      // Server-side filters (for mobile clients)
      if (qStatus === "submitted") allRows = allRows.filter((r) => r.submissionStatus === "submitted");
      else if (qStatus === "pending") allRows = allRows.filter((r) => r.submissionStatus !== "submitted");

      if (qItemType === "BTVN") allRows = allRows.filter((r) => r.itemType === "BTVN");
      else if (qItemType === "exam") allRows = allRows.filter((r) => r.itemType === "Bài kiểm tra");

      // A deeplink may carry a classId from the notification. If the class
      // relationship changed or the ID came from an older record, do not turn
      // a valid date result into an empty screen.
      if (qClassId) {
        const classRows = allRows.filter((r) => r.classId === qClassId);
        if (classRows.length > 0) allRows = classRows;
      }

      // Server-side pagination
      const total = allRows.length;
      const page = Math.max(1, parseInt(qPage ?? "1", 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(qPageSize ?? "50", 10)));
      const totalPages = Math.ceil(total / pageSize);
      const rows = allRows.slice((page - 1) * pageSize, page * pageSize);

      res.json({ rows, total, page, pageSize, totalPages, month: monthStr });
    } catch (err: any) {
      console.error("Student assignments error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải bài tập học viên" });
    }
  });

  // ── Student submit homework ──────────────────────────────────────────────
  app.post("/api/my-space/assignments/student/submit", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const studentRecord = await getStudentForUser(user.id);
      if (!studentRecord) return res.status(403).json({ message: "Tài khoản không phải học viên" });

      const { homeworkId, submissionContent, submissionAttachments } = req.body as {
        homeworkId: string;
        submissionContent: string;
        submissionAttachments?: string[];
      };

      if (!homeworkId) return res.status(400).json({ message: "homeworkId là bắt buộc" });

      // Upsert studentSessionContents
      const existing = await db
        .select({ id: studentSessionContents.id })
        .from(studentSessionContents)
        .where(
          and(
            eq(studentSessionContents.sessionContentId, homeworkId),
            eq(studentSessionContents.studentId, studentRecord.id)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(studentSessionContents)
          .set({
            status: "submitted",
            submissionContent: submissionContent || null,
            submissionAttachments: submissionAttachments ?? [],
          })
          .where(eq(studentSessionContents.id, existing[0].id));
      } else {
        await db.insert(studentSessionContents).values({
          sessionContentId: homeworkId,
          studentId: studentRecord.id,
          status: "submitted",
          submissionContent: submissionContent || null,
          submissionAttachments: submissionAttachments ?? [],
        });
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Submit homework error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi nộp bài tập" });
    }
  });

  // ── Staff assignments ────────────────────────────────────────────────────
  app.get("/api/my-space/assignments/staff", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const inDaotao = await isStaffInDaotaoDept(staffRecord.id);
      if (!inDaotao) return res.status(403).json({ message: "Tài khoản không thuộc Phòng Đào tạo" });

      const { month, dateFrom: qDateFrom, dateTo: qDateTo } = req.query as { month?: string; dateFrom?: string; dateTo?: string };
      let dateFrom: string;
      let dateTo: string;
      let monthStr: string;

      if (qDateFrom && qDateTo) {
        dateFrom = qDateFrom;
        dateTo = qDateTo;
        monthStr = qDateFrom.substring(0, 7);
      } else {
        const range = getDateRange(month);
        dateFrom = range.dateFrom;
        dateTo = range.dateTo;
        monthStr = range.monthStr;
      }

      // General homework for sessions the staff teaches, with per-student personal overrides
      const rows = await db
        .select({
          classSessionId: classSessions.id,
          sessionDate: classSessions.sessionDate,
          weekday: classSessions.weekday,
          sessionIndex: classSessions.sessionIndex,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
          className: classes.name,
          classCode: classes.classCode,
          homeworkId: sessionContents.id,
          generalTitle: sessionContents.title,
          generalDescription: sessionContents.description,
          studentId: studentSessions.studentId,
          // Personal override for each student (if any)
          personalTitle: studentSessionContents.customTitle,
          personalDescription: studentSessionContents.customDescription,
          submissionStatus: studentSessionContents.status,
          submissionContent: studentSessionContents.submissionContent,
          submissionAttachments: studentSessionContents.submissionAttachments,
          studentSessionContentId: studentSessionContents.id,
          score: studentSessionContents.score,
          gradingComment: studentSessionContents.gradingComment,
          // Homework file attachments from program content
          programAttachments: courseProgramContents.attachments,
          programContent: courseProgramContents.content,
        })
        .from(classSessions)
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .innerJoin(sessionContents, and(
          eq(sessionContents.classSessionId, classSessions.id),
          inArray(sessionContents.contentType, ["homework", "Bài tập về nhà"])
        ))
        .innerJoin(studentSessions, eq(studentSessions.classSessionId, classSessions.id))
        .leftJoin(studentSessionContents, and(
          eq(studentSessionContents.sessionContentId, sessionContents.id),
          eq(studentSessionContents.studentId, studentSessions.studentId)
        ))
        .leftJoin(courseProgramContents, sql`${sessionContents.resourceUrl} = ${courseProgramContents.id}::text`)
        .where(
          and(
            sql`${classSessions.teacherIds} @> ARRAY[${staffRecord.id}]::uuid[]`,
            gte(classSessions.sessionDate, dateFrom),
            lte(classSessions.sessionDate, dateTo)
          )
        )
        .orderBy(classSessions.sessionDate, shiftTemplates.startTime);

      // Batch fetch student names and codes to avoid N+1 queries
      const uniqueStudentIds = [...new Set(rows.map((r) => r.studentId))];
      const studentNameMap = new Map<string, string>();
      const studentCodeMap = new Map<string, string>();
      if (uniqueStudentIds.length > 0) {
        const studentRows = await db
          .select({ id: students.id, fullName: students.fullName, code: students.code })
          .from(students)
          .where(inArray(students.id, uniqueStudentIds as string[]));
        for (const s of studentRows) {
          studentNameMap.set(s.id, s.fullName || s.code || s.id);
          studentCodeMap.set(s.id, s.code || "");
        }
      }

      function parseHomeworkAttachments(raw: Array<string | { name: string; url: string }> | null): { name: string; url: string }[] {
        if (!raw || raw.length === 0) return [];
        return raw.map((entry) => {
          if (typeof entry !== "string") return { name: (entry as any).name ?? "", url: (entry as any).url ?? "" };
          const sep = entry.indexOf("||");
          if (sep === -1) return { name: entry, url: entry };
          return { name: entry.substring(0, sep), url: entry.substring(sep + 2) };
        });
      }

      const homeworkResult: any[] = rows.map((r) => ({
        classSessionId: r.classSessionId,
        className: r.className,
        classCode: r.classCode,
        sessionDate: r.sessionDate,
        weekday: r.weekday,
        startTime: r.startTime,
        endTime: r.endTime,
        sessionIndex: r.sessionIndex,
        studentId: r.studentId,
        studentName: studentNameMap.get(r.studentId) ?? r.studentId,
        studentCode: studentCodeMap.get(r.studentId) ?? null,
        itemType: "BTVN" as const,
        homeworkId: r.homeworkId,
        // Prefer personalized title/description over general when available
        homeworkTitle: r.personalTitle || r.generalTitle,
        homeworkDescription: r.personalDescription || (r.programContent ?? r.generalDescription),
        isPersonalized: !!(r.personalTitle || r.personalDescription),
        submissionStatus: (r.submissionStatus === "submitted" ? "submitted" : "pending") as "submitted" | "pending",
        submissionContent: r.submissionContent ?? null,
        submissionAttachments: parseHomeworkAttachments(r.submissionAttachments as string[] | null),
        homeworkAttachments: parseHomeworkAttachments(r.programAttachments as string[] | null),
        studentSessionContentId: r.studentSessionContentId ?? null,
        score: r.score ?? null,
        comment: r.gradingComment ?? null,
        examId: null,
      }));

      // Exam rows: session_contents with contentType='Bài kiểm tra'/'exam' for sessions taught by this staff
      const examRows = await db
        .select({
          classSessionId: classSessions.id,
          classId: classes.id,
          sessionDate: classSessions.sessionDate,
          weekday: classSessions.weekday,
          sessionIndex: classSessions.sessionIndex,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
          className: classes.name,
          classCode: classes.classCode,
          examContentId: sessionContents.id,
          examTitle: sessionContents.title,
          examResourceUrl: sessionContents.resourceUrl,
          studentId: studentSessions.studentId,
          submissionId: examSubmissions.id,
          submissionScore: examSubmissions.adjustedScore,
          submissionScoreRaw: examSubmissions.score,
          submissionComment: examSubmissions.comment,
          submittedAt: examSubmissions.submittedAt,
        })
        .from(classSessions)
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .innerJoin(sessionContents, and(
          eq(sessionContents.classSessionId, classSessions.id),
          inArray(sessionContents.contentType, ["Bài kiểm tra", "exam"])
        ))
        .innerJoin(studentSessions, eq(studentSessions.classSessionId, classSessions.id))
        .leftJoin(examSubmissions, and(
          sql`${examSubmissions.examId}::text = ${sessionContents.resourceUrl}`,
          eq(examSubmissions.studentId, studentSessions.studentId),
          sql`(${examSubmissions.classId} = ${classes.id} OR ${examSubmissions.classId} IS NULL)`
        ))
        .where(
          and(
            sql`${classSessions.teacherIds} @> ARRAY[${staffRecord.id}]::uuid[]`,
            gte(classSessions.sessionDate, dateFrom),
            lte(classSessions.sessionDate, dateTo)
          )
        )
        .orderBy(classSessions.sessionDate, shiftTemplates.startTime);

      // Fetch names for any student not already in the map
      const examStudentIds = [...new Set(examRows.map((r) => r.studentId))];
      for (const sid of examStudentIds) {
        if (!studentNameMap.has(sid)) {
          studentNameMap.set(sid, await getStudentName(sid));
        }
      }

      // Deduplicate exam rows: one row per (classSessionId, examContentId, studentId)
      // Keep the most recent submission (by submittedAt), same logic as student side
      const staffExamDeduped = new Map<string, typeof examRows[0]>();
      for (const r of examRows) {
        const key = `${r.classSessionId}:${r.examContentId}:${r.studentId}`;
        const existing = staffExamDeduped.get(key);
        if (!existing) {
          staffExamDeduped.set(key, r);
        } else if (r.submissionId && !existing.submissionId) {
          staffExamDeduped.set(key, r);
        } else if (r.submissionId && existing.submissionId) {
          const rTime = r.submittedAt ? new Date(r.submittedAt).getTime() : 0;
          const eTime = existing.submittedAt ? new Date(existing.submittedAt).getTime() : 0;
          if (rTime > eTime) staffExamDeduped.set(key, r);
        }
      }

      const examResult: any[] = [...staffExamDeduped.values()].map((r) => ({
        classSessionId: r.classSessionId,
        classId: r.classId,
        className: r.className,
        classCode: r.classCode,
        sessionDate: r.sessionDate,
        weekday: r.weekday,
        startTime: r.startTime,
        endTime: r.endTime,
        sessionIndex: r.sessionIndex,
        studentId: r.studentId,
        studentName: studentNameMap.get(r.studentId) ?? r.studentId,
        studentCode: studentCodeMap.get(r.studentId) ?? null,
        itemType: "Bài kiểm tra" as const,
        homeworkId: r.examContentId,
        homeworkTitle: r.examTitle,
        homeworkDescription: null,
        homeworkAttachments: [],
        isPersonalized: false,
        submissionStatus: r.submissionId ? "submitted" as const : "pending" as const,
        submissionContent: null,
        submissionAttachments: [],
        studentSessionContentId: null,
        score: r.submissionScore ?? r.submissionScoreRaw ?? null,
        comment: r.submissionComment ?? null,
        examId: r.examResourceUrl || r.examContentId,
        submissionId: r.submissionId ?? null,
      }));

      const result = [...homeworkResult, ...examResult].sort((a, b) => {
        const dateCmp = a.sessionDate.localeCompare(b.sessionDate);
        if (dateCmp !== 0) return dateCmp;
        return a.startTime.localeCompare(b.startTime);
      });

      res.json({ rows: result, month: monthStr });
    } catch (err: any) {
      console.error("Staff assignments error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải bài tập nhân viên" });
    }
  });

  // ── Staff grade homework ─────────────────────────────────────────────────
  app.post("/api/my-space/assignments/staff/grade", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const inDaotao = await isStaffInDaotaoDept(staffRecord.id);
      if (!inDaotao) return res.status(403).json({ message: "Tài khoản không thuộc Phòng Đào tạo" });

      const { studentSessionContentId, score, gradingComment } = req.body as {
        studentSessionContentId: string;
        score: string;
        gradingComment: string;
      };

      if (!studentSessionContentId) {
        return res.status(400).json({ message: "Thiếu studentSessionContentId" });
      }

      await db
        .update(studentSessionContents)
        .set({ score: score ?? null, gradingComment: gradingComment ?? null })
        .where(eq(studentSessionContents.id, studentSessionContentId));

      res.json({ success: true });

      // Send homework score notification to student
      sendHomeworkScoreNotification(studentSessionContentId, score, gradingComment, user.id).catch(() => {});
    } catch (err: any) {
      console.error("Staff grade error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi chấm bài" });
    }
  });

  // ── Learning Overview: All assignments (admin view) ─────────────────────
  app.get("/api/learning-overview/assignments", async (req, res) => {
    try {
      const { month, dateFrom: qDateFrom, dateTo: qDateTo } = req.query as { month?: string; dateFrom?: string; dateTo?: string };
      let dateFrom: string;
      let dateTo: string;
      let monthStr: string;

      if (qDateFrom && qDateTo) {
        dateFrom = qDateFrom;
        dateTo = qDateTo;
        monthStr = qDateFrom.substring(0, 7);
      } else {
        const range = getDateRange(month);
        dateFrom = range.dateFrom;
        dateTo = range.dateTo;
        monthStr = range.monthStr;
      }

      // Homework rows (all classes, no teacher filter)
      const hwRows = await db
        .select({
          classSessionId: classSessions.id,
          sessionDate: classSessions.sessionDate,
          weekday: classSessions.weekday,
          sessionIndex: classSessions.sessionIndex,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
          className: classes.name,
          classCode: classes.classCode,
          homeworkId: sessionContents.id,
          generalTitle: sessionContents.title,
          generalDescription: sessionContents.description,
          studentId: studentSessions.studentId,
          personalTitle: studentSessionContents.customTitle,
          personalDescription: studentSessionContents.customDescription,
          submissionStatus: studentSessionContents.status,
          submissionContent: studentSessionContents.submissionContent,
          submissionAttachments: studentSessionContents.submissionAttachments,
          studentSessionContentId: studentSessionContents.id,
          score: studentSessionContents.score,
          gradingComment: studentSessionContents.gradingComment,
          programAttachments: courseProgramContents.attachments,
          programContent: courseProgramContents.content,
        })
        .from(classSessions)
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .innerJoin(sessionContents, and(
          eq(sessionContents.classSessionId, classSessions.id),
          inArray(sessionContents.contentType, ["homework", "Bài tập về nhà"])
        ))
        .innerJoin(studentSessions, eq(studentSessions.classSessionId, classSessions.id))
        .leftJoin(studentSessionContents, and(
          eq(studentSessionContents.sessionContentId, sessionContents.id),
          eq(studentSessionContents.studentId, studentSessions.studentId)
        ))
        .leftJoin(courseProgramContents, sql`${sessionContents.resourceUrl} = ${courseProgramContents.id}::text`)
        .where(and(
          gte(classSessions.sessionDate, dateFrom),
          lte(classSessions.sessionDate, dateTo)
        ))
        .orderBy(classSessions.sessionDate, shiftTemplates.startTime);

      // Exam rows
      const examRows = await db
        .select({
          classSessionId: classSessions.id,
          classId: classes.id,
          sessionDate: classSessions.sessionDate,
          weekday: classSessions.weekday,
          sessionIndex: classSessions.sessionIndex,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
          className: classes.name,
          classCode: classes.classCode,
          examContentId: sessionContents.id,
          examTitle: sessionContents.title,
          examResourceUrl: sessionContents.resourceUrl,
          studentId: studentSessions.studentId,
          submissionId: examSubmissions.id,
          submissionScore: examSubmissions.adjustedScore,
          submissionScoreRaw: examSubmissions.score,
          submissionComment: examSubmissions.comment,
        })
        .from(classSessions)
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .innerJoin(sessionContents, and(
          eq(sessionContents.classSessionId, classSessions.id),
          inArray(sessionContents.contentType, ["Bài kiểm tra", "exam"])
        ))
        .innerJoin(studentSessions, eq(studentSessions.classSessionId, classSessions.id))
        .leftJoin(examSubmissions, and(
          sql`${examSubmissions.examId}::text = ${sessionContents.resourceUrl}`,
          eq(examSubmissions.studentId, studentSessions.studentId),
          sql`(${examSubmissions.classId} = ${classes.id} OR ${examSubmissions.classId} IS NULL)`
        ))
        .where(and(
          gte(classSessions.sessionDate, dateFrom),
          lte(classSessions.sessionDate, dateTo)
        ))
        .orderBy(classSessions.sessionDate, shiftTemplates.startTime);

      // Batch-fetch student names
      const allStudentIds = [...new Set([...hwRows.map((r) => r.studentId), ...examRows.map((r) => r.studentId)])];
      const studentNameMap = new Map<string, string>();
      for (const sid of allStudentIds) {
        studentNameMap.set(sid, await getStudentName(sid));
      }

      function parseAttachments(raw: Array<string | { name: string; url: string }> | null): { name: string; url: string }[] {
        if (!raw || raw.length === 0) return [];
        return raw.map((entry) => {
          if (typeof entry !== "string") return { name: (entry as any).name ?? "", url: (entry as any).url ?? "" };
          const sep = entry.indexOf("||");
          if (sep === -1) return { name: entry, url: entry };
          return { name: entry.substring(0, sep), url: entry.substring(sep + 2) };
        });
      }

      const homeworkResult: any[] = hwRows.map((r) => ({
        classSessionId: r.classSessionId,
        className: r.className,
        classCode: r.classCode,
        sessionDate: r.sessionDate,
        weekday: r.weekday,
        startTime: r.startTime,
        endTime: r.endTime,
        sessionIndex: r.sessionIndex,
        studentId: r.studentId,
        studentName: studentNameMap.get(r.studentId) ?? r.studentId,
        itemType: "BTVN" as const,
        homeworkId: r.homeworkId,
        homeworkTitle: r.personalTitle || r.generalTitle,
        homeworkDescription: r.personalDescription || (r.programContent ?? r.generalDescription),
        isPersonalized: !!(r.personalTitle || r.personalDescription),
        submissionStatus: (r.submissionStatus === "submitted" ? "submitted" : "pending") as "submitted" | "pending",
        submissionContent: r.submissionContent ?? null,
        submissionAttachments: parseAttachments(r.submissionAttachments as string[] | null),
        homeworkAttachments: parseAttachments(r.programAttachments as string[] | null),
        studentSessionContentId: r.studentSessionContentId ?? null,
        score: r.score ?? null,
        comment: r.gradingComment ?? null,
        examId: null,
      }));

      const examResult: any[] = examRows.map((r) => ({
        classSessionId: r.classSessionId,
        classId: r.classId,
        className: r.className,
        classCode: r.classCode,
        sessionDate: r.sessionDate,
        weekday: r.weekday,
        startTime: r.startTime,
        endTime: r.endTime,
        sessionIndex: r.sessionIndex,
        studentId: r.studentId,
        studentName: studentNameMap.get(r.studentId) ?? r.studentId,
        itemType: "Bài kiểm tra" as const,
        homeworkId: r.examContentId,
        homeworkTitle: r.examTitle,
        homeworkDescription: null,
        homeworkAttachments: [],
        isPersonalized: false,
        submissionStatus: r.submissionId ? "submitted" as const : "pending" as const,
        submissionContent: null,
        submissionAttachments: [],
        studentSessionContentId: null,
        score: r.submissionScore ?? r.submissionScoreRaw ?? null,
        comment: r.submissionComment ?? null,
        examId: r.examResourceUrl || r.examContentId,
      }));

      const result = [...homeworkResult, ...examResult].sort((a, b) => {
        const dateCmp = b.sessionDate.localeCompare(a.sessionDate);
        if (dateCmp !== 0) return dateCmp;
        return b.startTime.localeCompare(a.startTime);
      });

      res.json({ rows: result, month: monthStr });
    } catch (err: any) {
      console.error("Learning overview assignments error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải bài tập" });
    }
  });

  app.get("/api/my-space/invoices", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      if (!req.isSuperAdmin && req.isStudent) {
        const [studentRecord] = await db.select({ type: students.type })
          .from(students)
          .where(eq(students.userId, user.id))
          .limit(1);
        const studentType = studentRecord?.type || "Học viên";
        const [systemRole] = await db
          .select({ id: roles.id })
          .from(roles)
          .leftJoin(departments, eq(roles.departmentId, departments.id))
          .where(and(eq(roles.name, studentType), eq(departments.isSystem, true)))
          .limit(1);
        let canView = false;
        if (systemRole) {
          const perms = await storage.getAllPermissionsForRoles([systemRole.id]);
          const invPerm = perms.find(p => p.resource === "/my-space/invoices");
          canView = !!(invPerm && invPerm.canView === true);
        }
        if (!canView) return res.status(403).json({ message: "Bạn không có quyền xem hoá đơn" });
      }

      // ── Helper: expand invoice rows into result cards ────────────────────
      async function expandInvoiceRows(invoiceRows: any[], displayName: string | null): Promise<any[]> {
        const cards: any[] = [];
        for (const inv of invoiceRows) {
          const schedules = await db
            .select()
            .from(invoicePaymentSchedule)
            .where(eq(invoicePaymentSchedule.invoiceId, inv.id))
            .orderBy(invoicePaymentSchedule.sortOrder);

          const title = inv.description || inv.note || inv.className || inv.classCode || "Hoá đơn";
          if (schedules.length > 0) {
            for (const sch of schedules) {
              cards.push({
                id: sch.id,
                invoiceId: inv.id,
                title,
                description: inv.description ?? null,
                note: inv.note ?? null,
                code: sch.code || inv.code,
                label: sch.label,
                studentName: inv.studentName ?? displayName,
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
            cards.push({
              id: inv.id,
              invoiceId: inv.id,
              title,
              description: inv.description ?? null,
              note: inv.note ?? null,
              code: inv.code,
              label: null,
              studentName: inv.studentName ?? displayName,
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
        return cards;
      }

      // ── Check if user is staff ───────────────────────────────────────────
      const staffRecord = await getStaffForUser(user.id);

      if (staffRecord) {
        // Staff: fetch invoices where subjectName starts with [staff.code]
        // OR salaryTableId is in published salary tables for this staff
        const { getPublishedRowsForTeacher } = await import("../storage/teacher-salary.storage");
        const publishedRows = await getPublishedRowsForTeacher(staffRecord.id);
        const salaryTableIds = [...new Set(publishedRows.map((r: any) => r.salaryTableId))];

        // Build WHERE: subjectName matches either format:
        //   "[GV-01] ..." (new format with brackets)
        //   "GV-01 - ..." (old format with dash)
        const subjectPatternBracket = `[${staffRecord.code}]%`;
        const subjectPatternDash = `${staffRecord.code} -%`;
        const conditions: any[] = [
          sql`${invoices.subjectName} LIKE ${subjectPatternBracket}`,
          sql`${invoices.subjectName} LIKE ${subjectPatternDash}`,
        ];
        if (salaryTableIds.length > 0) {
          conditions.push(inArray(invoices.salaryTableId as any, salaryTableIds));
        }

        const invoiceRows = await db
          .select({
            id: invoices.id,
            code: invoices.code,
            type: invoices.type,
            category: invoices.category,
            description: invoices.description,
            note: invoices.note,
            grandTotal: invoices.grandTotal,
            paidAmount: invoices.paidAmount,
            remainingAmount: invoices.remainingAmount,
            status: invoices.status,
            dueDate: invoices.dueDate,
            createdAt: invoices.createdAt,
            studentName: sql<string | null>`null`,
            className: classes.name,
            classCode: classes.classCode,
          })
          .from(invoices)
          .leftJoin(classes, eq(invoices.classId, classes.id))
          .where(or(...conditions))
          .orderBy(invoices.createdAt);

        const result = await expandInvoiceRows(invoiceRows, staffRecord.fullName);
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return res.json({ invoices: result });
      }

      // ── Student / parent path ────────────────────────────────────────────
      const ctx = await getStudentContext(user.id);
      if (!ctx.selfStudentId || ctx.studentIds.length === 0) return res.json({ invoices: [] });

      const invoiceRows = await db
        .select({
          id: invoices.id,
          code: invoices.code,
          type: invoices.type,
          category: invoices.category,
          description: invoices.description,
          note: invoices.note,
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
        .where(inArray(invoices.studentId, ctx.studentIds))
        .orderBy(invoices.createdAt);

      const result = await expandInvoiceRows(invoiceRows, null);
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      res.json({ invoices: result });
    } catch (err: any) {
      console.error("My invoices error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải hoá đơn" });
    }
  });

  app.get("/api/my-space/don-tu", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (staffRecord) {
        const [requests, rewards, advances] = await Promise.all([
          db
            .select()
            .from(leaveRequests)
            .where(eq(leaveRequests.staffId, staffRecord.id))
            .orderBy(desc(leaveRequests.createdAt)),
          db
            .select()
            .from(staffRewards)
            .where(eq(staffRewards.staffId, staffRecord.id))
            .orderBy(desc(staffRewards.createdAt)),
          db
            .select()
            .from(staffAdvances)
            .where(eq(staffAdvances.staffId, staffRecord.id))
            .orderBy(desc(staffAdvances.createdAt)),
        ]);

        return res.json({
          viewerType: "staff",
          profile: {
            id: staffRecord.id,
            code: staffRecord.code,
            fullName: staffRecord.fullName,
          },
          linkedStudents: [],
          leaveRequests: requests,
          rewards,
          advances,
        });
      }

      const ctx = await getStudentContext(user.id);
      const requests = ctx.studentIds.length > 0
        ? await db
            .select({
              id: studentLeaveRequests.id,
              studentId: studentLeaveRequests.studentId,
              studentName: students.fullName,
              studentCode: students.code,
              locationId: studentLeaveRequests.locationId,
              locationName: locations.name,
              scheduleIds: studentLeaveRequests.scheduleIds,
              scheduleSnapshot: studentLeaveRequests.scheduleSnapshot,
              startDate: studentLeaveRequests.startDate,
              endDate: studentLeaveRequests.endDate,
              description: studentLeaveRequests.description,
              status: studentLeaveRequests.status,
              attendanceApprovalMode: studentLeaveRequests.attendanceApprovalMode,
              rejectionReason: studentLeaveRequests.rejectionReason,
              createdAt: studentLeaveRequests.createdAt,
              updatedAt: studentLeaveRequests.updatedAt,
            })
            .from(studentLeaveRequests)
            .innerJoin(students, eq(studentLeaveRequests.studentId, students.id))
            .innerJoin(locations, eq(studentLeaveRequests.locationId, locations.id))
            .where(inArray(studentLeaveRequests.studentId, ctx.studentIds))
            .orderBy(desc(studentLeaveRequests.createdAt))
        : [];

      return res.json({
        viewerType: ctx.isParent ? "parent" : "student",
        profile: ctx.selfStudentId
          ? ctx.linkedStudents.find((student) => student.id === ctx.selfStudentId) ?? null
          : null,
        linkedStudents: ctx.linkedStudents,
        leaveRequests: requests,
        rewards: [],
        advances: [],
      });
    } catch (err: any) {
      console.error("My don-tu error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải đơn từ cá nhân" });
    }
  });

  app.get("/api/my-space/payroll/published-rows", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.json([]);

      const {
        getPublishedRowsForTeacher,
        getTeacherSalaryDetailRows,
        getTeacherSalaryRowPackages,
      } = await import("../storage/teacher-salary.storage");

      const publishedRows = await getPublishedRowsForTeacher(staffRecord.id);
      if (publishedRows.length === 0) return res.json([]);

      const tableIds = [...new Set(publishedRows.map((r) => r.salaryTableId))];
      const publishedClassIds = new Map<string, Set<string>>();
      for (const r of publishedRows) {
        if (!publishedClassIds.has(r.salaryTableId)) publishedClassIds.set(r.salaryTableId, new Set());
        publishedClassIds.get(r.salaryTableId)!.add(r.classId);
      }

      // Fallback: load staff_salary_configs for this teacher (courseId → packageId)
      const salaryConfigRows = await db
        .select({ courseId: staffSalaryConfigs.courseId, salaryPackageId: staffSalaryConfigs.salaryPackageId })
        .from(staffSalaryConfigs)
        .where(eq(staffSalaryConfigs.staffId, staffRecord.id));
      const courseConfigMap = new Map(salaryConfigRows.map((c) => [c.courseId, c.salaryPackageId]));

      const result: any[] = [];
      for (const tableId of tableIds) {
        const [detailRows, pkgRows] = await Promise.all([
          getTeacherSalaryDetailRows(tableId),
          getTeacherSalaryRowPackages(tableId),
        ]);
        const allowedClasses = publishedClassIds.get(tableId)!;
        const teacherRows = detailRows.filter(
          (r) => r.teacherId === staffRecord.id && allowedClasses.has(r.classId)
        );
        const pkgMap = new Map(pkgRows.filter((p) => p.teacherId === staffRecord.id).map((p) => [p.classId, p.packageId]));
        const meta = publishedRows.find((r) => r.salaryTableId === tableId);
        for (const row of teacherRows) {
          const packageId = pkgMap.get(row.classId)
            ?? (row.courseId ? courseConfigMap.get(row.courseId) : undefined)
            ?? null;
          result.push({
            salaryTableId: tableId,
            salaryTableName: meta?.salaryTableName ?? "",
            startDate: meta?.startDate ?? "",
            endDate: meta?.endDate ?? "",
            locationName: meta?.locationName ?? null,
            teacherId: row.teacherId,
            teacherName: row.teacherName,
            teacherCode: row.teacherCode,
            classId: row.classId,
            className: row.className,
            role: row.role,
            packageId,
            sessions: row.sessions,
            sessionDates: row.sessionDates,
          });
        }
      }

      res.json(result);
    } catch (err: any) {
      console.error("Payroll published rows error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải bảng lương" });
    }
  });

  /**
   * GET /api/my-space/payroll/salary-summary
   *
   * Trả về tổng lương đã tính sẵn cho từng lớp và tổng cộng theo bảng lương.
   * Dùng cho app mobile, không cần tự tính client-side.
   *
   * Response format:
   * [
   *   {
   *     salaryTableId, salaryTableName, startDate, endDate, locationName,
   *     classes: [
   *       { classId, className, role, packageId, packageName, packageType,
   *         totalEligibleSessions, totalSalary }
   *     ],
   *     grandTotal
   *   }
   * ]
   */
  app.get("/api/my-space/payroll/salary-summary", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.json([]);

      const {
        getPublishedRowsForTeacher,
        getTeacherSalaryDetailRows,
        getTeacherSalaryRowPackages,
      } = await import("../storage/teacher-salary.storage");

      const { getTeacherSalaryPackages } = await import(
        "../storage/teacher-salary-packages.storage"
      );

      const [publishedRows, allPackages] = await Promise.all([
        getPublishedRowsForTeacher(staffRecord.id),
        getTeacherSalaryPackages(),
      ]);

      if (publishedRows.length === 0) return res.json([]);

      const packageMap = new Map<string, any>();
      for (const p of allPackages) packageMap.set(p.id, p);

      const tableIds = [...new Set(publishedRows.map((r: any) => r.salaryTableId))];

      const publishedClassIds = new Map<string, Set<string>>();
      for (const r of publishedRows) {
        if (!publishedClassIds.has(r.salaryTableId))
          publishedClassIds.set(r.salaryTableId, new Set());
        publishedClassIds.get(r.salaryTableId)!.add(r.classId);
      }

      // Fallback: load staff_salary_configs for this teacher (courseId → packageId)
      const salaryConfigRowsSummary = await db
        .select({ courseId: staffSalaryConfigs.courseId, salaryPackageId: staffSalaryConfigs.salaryPackageId })
        .from(staffSalaryConfigs)
        .where(eq(staffSalaryConfigs.staffId, staffRecord.id));
      const courseConfigMapSummary = new Map(salaryConfigRowsSummary.map((c) => [c.courseId, c.salaryPackageId]));

      function calcSalary(sessions: any[], pkg: any): number {
        type SalaryRange = { from: number; to: number; price: number };

        function findRange(value: number, ranges: SalaryRange[]): number {
          if (!ranges || ranges.length === 0) return 0;
          const match = ranges.find((r) => value >= r.from && value <= r.to);
          return match ? match.price : 0;
        }

        const eligibleSessions = sessions.filter((s: any) => s.isEligible);
        const ranges = (pkg.ranges as SalaryRange[] | null) ?? [];

        switch (pkg.type) {
          case "theo-gio":
            return eligibleSessions.reduce(
              (sum: number, s: any) => sum + s.durationHours * Number(pkg.unitPrice || 0),
              0
            );
          case "theo-buoi":
            return eligibleSessions.length * Number(pkg.unitPrice || 0);
          case "theo-so-hv":
            return eligibleSessions.reduce((sum: number, s: any) => {
              if (ranges.length > 0) {
                return sum + s.attendedCount * findRange(s.attendedCount, ranges);
              }
              return sum + s.attendedCount * Number(pkg.unitPrice || 0);
            }, 0);
          case "tong-so-gio": {
            const totalHours = eligibleSessions.reduce(
              (sum: number, s: any) => sum + s.durationHours,
              0
            );
            return findRange(totalHours, ranges);
          }
          case "tong-so-buoi":
            return findRange(eligibleSessions.length, ranges);
          default:
            return 0;
        }
      }

      const summaries: any[] = [];

      for (const tableId of tableIds) {
        const [detailRows, pkgRows] = await Promise.all([
          getTeacherSalaryDetailRows(tableId),
          getTeacherSalaryRowPackages(tableId),
        ]);

        const allowedClasses = publishedClassIds.get(tableId)!;
        const teacherRows = detailRows.filter(
          (r: any) =>
            r.teacherId === staffRecord.id && allowedClasses.has(r.classId)
        );

        const pkgMap = new Map(
          pkgRows
            .filter((p: any) => p.teacherId === staffRecord.id)
            .map((p: any) => [p.classId, p.packageId])
        );

        const meta = publishedRows.find((r: any) => r.salaryTableId === tableId);

        const classes: any[] = [];
        let grandTotal = 0;

        for (const row of teacherRows) {
          const packageId = pkgMap.get(row.classId)
            ?? (row.courseId ? courseConfigMapSummary.get(row.courseId) : undefined)
            ?? null;
          const pkg = packageId ? packageMap.get(packageId) : null;
          const totalSalary = pkg ? calcSalary(row.sessions, pkg) : 0;
          const totalEligibleSessions = row.sessions.filter((s: any) => s.isEligible).length;

          grandTotal += totalSalary;

          classes.push({
            classId: row.classId,
            className: row.className,
            role: row.role,
            packageId: packageId ?? null,
            packageName: pkg?.name ?? null,
            packageType: pkg?.type ?? null,
            totalEligibleSessions,
            totalSalary,
          });
        }

        summaries.push({
          salaryTableId: tableId,
          salaryTableName: meta?.salaryTableName ?? "",
          startDate: meta?.startDate ?? "",
          endDate: meta?.endDate ?? "",
          locationName: meta?.locationName ?? null,
          classes,
          grandTotal,
        });
      }

      res.json(summaries);
    } catch (err: any) {
      console.error("Payroll salary summary error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải tổng lương" });
    }
  });

  /**
   * GET /api/my-space/payroll/attendance?month=6&year=2026
   * Trả về dữ liệu chấm công (số công theo ngày) của staff hiện tại
   */
  app.get("/api/my-space/payroll/attendance", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.json([]);

      const { month, year } = req.query as Record<string, string>;
      if (!month || !year) return res.json([]);

      const m = String(month).padStart(2, "0");
      const y = String(year);
      const dateFrom = `${y}-${m}-01`;
      const daysInMonth = new Date(Number(y), Number(month), 0).getDate();
      const dateTo = `${y}-${m}-${String(daysInMonth).padStart(2, "0")}`;

      const rows = await db.select().from(staffAttendances)
        .where(and(
          eq(staffAttendances.staffId, staffRecord.id),
          gte(staffAttendances.workDate, dateFrom),
          lte(staffAttendances.workDate, dateTo),
        ));

      const mapped = rows.map(r => {
        // Normalize workDate: drizzle date column returns string "YYYY-MM-DD" or Date object
        const wd = r.workDate;
        let workDateStr: string;
        if (typeof wd === "string") {
          workDateStr = wd.slice(0, 10);
        } else if (wd instanceof Date) {
          const yy = wd.getFullYear();
          const mm = String(wd.getMonth() + 1).padStart(2, "0");
          const dd = String(wd.getDate()).padStart(2, "0");
          workDateStr = `${yy}-${mm}-${dd}`;
        } else {
          workDateStr = String(wd ?? "").slice(0, 10);
        }
        return {
          workDate: workDateStr,
          timeIn: r.timeIn ?? null,
          timeOut: r.timeOut ?? null,
          tongCong: Number(r.tongCong ?? 0),
          workedHours: Number(r.workedHours ?? 0),
          note: r.note ?? null,
        };
      });
      res.json(mapped);
    } catch (err: any) {
      console.error("My payroll attendance error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải chấm công" });
    }
  });

  /**
   * GET /api/my-space/payroll/hr-summary?month=6&year=2026
   * Trả về bảng lương HR tổng hợp (soCong, luongCB, phuCap, thuong, phat, bhxh...) cho staff hiện tại
   */
  app.get("/api/my-space/payroll/hr-summary", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.json(null);

      const { month, year } = req.query as Record<string, string>;
      if (!month || !year) return res.json(null);

      const m = String(month).padStart(2, "0");
      const y = String(year);
      const monthStr = `${y}-${m}`;

      const m2 = String(month).padStart(2, "0");
      const y2 = String(year);
      const dateFrom2 = `${y2}-${m2}-01`;
      const lastDay2 = new Date(Number(y2), Number(month), 0).getDate();
      const dateTo2 = `${y2}-${m2}-${String(lastDay2).padStart(2, "0")}`;

      const rows = await db
        .select({
          id: salarySheetEmployees.id,
          sheetId: salarySheetEmployees.sheetId,
          sheetCode: salarySheets.code,
          sheetFromDate: salarySheets.fromDate,
          sheetToDate: salarySheets.toDate,
          soCong: salarySheetEmployees.soCong,
          luongCB: salarySheetEmployees.luongCB,
          congThuc: salarySheetEmployees.congThuc,
          luongTheoCong: salarySheetEmployees.luongTheoCong,
          phuCap: salarySheetEmployees.phuCap,
          thuong: salarySheetEmployees.thuong,
          phat: salarySheetEmployees.phat,
          luongDungLop: salarySheetEmployees.luongDungLop,
          tongLuong: salarySheetEmployees.tongLuong,
          bhxh: salarySheetEmployees.bhxh,
          bhyt: salarySheetEmployees.bhyt,
          bhtn: salarySheetEmployees.bhtn,
          thueTNCN: salarySheetEmployees.thueTNCN,
          tamUng: salarySheetEmployees.tamUng,
          thucNhan: salarySheetEmployees.thucNhan,
          daChi: salarySheetEmployees.daChi,
        })
        .from(salarySheetEmployees)
        .innerJoin(salarySheets, eq(salarySheetEmployees.sheetId, salarySheets.id))
        .where(
          and(
            eq(salarySheetEmployees.staffId, staffRecord.id),
            gte(salarySheets.fromDate, dateFrom2),
            lte(salarySheets.fromDate, dateTo2),
          )
        )
        .orderBy(salarySheets.createdAt)
        .limit(1);

      if (rows.length === 0) return res.json(null);

      const r = rows[0];
      res.json({
        sheetId: r.sheetId,
        sheetName: r.sheetCode,
        sheetMonth: r.sheetFromDate ? r.sheetFromDate.slice(0, 7) : monthStr,
        soCong: Number(r.soCong ?? 0),
        luongCB: Number(r.luongCB ?? 0),
        congThuc: Number(r.congThuc ?? 0),
        luongTheoCong: Number(r.luongTheoCong ?? 0),
        phuCap: Number(r.phuCap ?? 0),
        thuong: Number(r.thuong ?? 0),
        phat: Number(r.phat ?? 0),
        luongDungLop: Number(r.luongDungLop ?? 0),
        tongLuong: Number(r.tongLuong ?? 0),
        bhxh: Number(r.bhxh ?? 0),
        bhyt: Number(r.bhyt ?? 0),
        bhtn: Number(r.bhtn ?? 0),
        thueTNCN: Number(r.thueTNCN ?? 0),
        tamUng: Number(r.tamUng ?? 0),
        thucNhan: Number(r.thucNhan ?? 0),
        daChi: r.daChi,
      });
    } catch (err: any) {
      console.error("My payroll hr-summary error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải bảng lương" });
    }
  });

  app.get("/api/my-space/score-sheet", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const ctx = await getStudentContext(user.id);
      if (!ctx.selfStudentId || ctx.studentIds.length === 0) return res.json([]);

      const studentNameMap = new Map(ctx.linkedStudents.map(s => [s.id, s]));

      const allMapped: any[] = [];

      for (const studentId of ctx.studentIds) {
        const linked = studentNameMap.get(studentId);
        const result = await db.execute(sql`
          SELECT
            gb.id,
            gb.title,
            gb.class_id,
            gb.score_sheet_id,
            gb.session_id,
            gb.published,
            gb.created_at,
            gb.updated_at,
            c.class_code AS class_code,
            c.name AS class_name,
            ss.name AS score_sheet_name,
            cs.session_index AS session_index,
            cs.session_date AS session_date,
            (
              SELECT json_agg(json_build_object(
                'categoryId', gbs.category_id,
                'categoryName', sc.name,
                'score', gbs.score
              ) ORDER BY sci.order)
              FROM class_grade_book_scores gbs
              JOIN score_categories sc ON sc.id = gbs.category_id
              LEFT JOIN score_sheet_items sci ON sci.category_id = gbs.category_id AND sci.score_sheet_id = gb.score_sheet_id
              WHERE gbs.grade_book_id = gb.id
                AND gbs.student_id = ${studentId}
            ) AS scores,
            (
              SELECT comment
              FROM class_grade_book_student_comments gbc
              WHERE gbc.grade_book_id = gb.id
                AND gbc.student_id = ${studentId}
              LIMIT 1
            ) AS teacher_comment,
            COALESCE(st.full_name, cu.username) AS created_by_name
          FROM class_grade_books gb
          JOIN classes c ON c.id = gb.class_id
          LEFT JOIN score_sheets ss ON ss.id = gb.score_sheet_id
          LEFT JOIN class_sessions cs ON cs.id = gb.session_id
          LEFT JOIN users cu ON cu.id = gb.created_by
          LEFT JOIN staff st ON st.user_id = gb.created_by
          WHERE gb.published = TRUE
            AND (
              EXISTS (
                SELECT 1 FROM class_grade_book_scores gbs2
                WHERE gbs2.grade_book_id = gb.id AND gbs2.student_id = ${studentId}
                  AND gbs2.score IS NOT NULL AND gbs2.score != ''
              )
              OR EXISTS (
                SELECT 1 FROM class_grade_book_student_comments gbc2
                WHERE gbc2.grade_book_id = gb.id AND gbc2.student_id = ${studentId}
                  AND gbc2.comment IS NOT NULL AND gbc2.comment != ''
              )
            )
          ORDER BY gb.created_at DESC
        `);

        for (const row of result.rows as any[]) {
          allMapped.push({
            id: row.id,
            title: row.title,
            classId: row.class_id,
            scoreSheetId: row.score_sheet_id,
            sessionId: row.session_id,
            published: row.published,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            classCode: row.class_code,
            className: row.class_name,
            scoreSheetName: row.score_sheet_name,
            sessionIndex: row.session_index,
            sessionDate: row.session_date,
            scores: row.scores,
            teacherComment: row.teacher_comment,
            createdByName: row.created_by_name,
            studentName: ctx.isParent ? (linked?.fullName ?? null) : null,
          });
        }
      }

      allMapped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      res.json(allMapped);
    } catch (err: any) {
      console.error("My score sheet error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải bảng điểm" });
    }
  });

  app.get("/api/my-space/classes/staff", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.json([]);

      const result = await db.execute(sql`
        SELECT
          c.id,
          c.class_code AS "classCode",
          c.name,
          c.location_id AS "locationId",
          c.score_sheet_id AS "scoreSheetId"
        FROM classes c
        WHERE (
          ${staffRecord.id} = ANY(c.teacher_ids)
          OR ${staffRecord.id} = ANY(c.manager_ids)
          OR EXISTS (
            SELECT 1 FROM class_sessions cs2
            WHERE cs2.class_id = c.id
              AND cs2.teacher_ids @> ARRAY[${staffRecord.id}]::uuid[]
          )
        )
        AND EXISTS (
          SELECT 1 FROM staff_assignments sa
          WHERE sa.staff_id = ${staffRecord.id}
            AND sa.location_id = c.location_id
        )
        ORDER BY c.class_code ASC
      `);

      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Lỗi khi tải danh sách lớp" });
    }
  });

  app.get("/api/my-space/score-sheet/staff", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.json([]);

      const result = await db.execute(sql`
        SELECT
          gb.id,
          gb.title,
          gb.class_id,
          gb.score_sheet_id,
          gb.session_id,
          gb.published,
          gb.created_at,
          gb.updated_at,
          c.class_code AS class_code,
          c.name AS class_name,
          ss.name AS score_sheet_name,
          cs.session_index AS session_index,
          cs.session_date AS session_date,
          (
            SELECT COUNT(*)::int
            FROM class_grade_book_scores gbs2
            WHERE gbs2.grade_book_id = gb.id
              AND gbs2.score IS NOT NULL
          ) AS score_count,
          (
            SELECT COUNT(DISTINCT gbs3.student_id)::int
            FROM class_grade_book_scores gbs3
            WHERE gbs3.grade_book_id = gb.id
          ) AS student_count,
          COALESCE(st_c.full_name, cu.username) AS created_by_name,
          COALESCE(st_u.full_name, uu.username) AS updated_by_name
        FROM class_grade_books gb
        JOIN classes c ON c.id = gb.class_id
        LEFT JOIN score_sheets ss ON ss.id = gb.score_sheet_id
        LEFT JOIN class_sessions cs ON cs.id = gb.session_id
        LEFT JOIN users cu ON cu.id = gb.created_by
        LEFT JOIN staff st_c ON st_c.user_id = gb.created_by
        LEFT JOIN users uu ON uu.id = gb.updated_by
        LEFT JOIN staff st_u ON st_u.user_id = gb.updated_by
        WHERE (
          ${staffRecord.id} = ANY(c.teacher_ids)
          OR ${staffRecord.id} = ANY(c.manager_ids)
          OR EXISTS (
            SELECT 1 FROM class_sessions cs2
            WHERE cs2.class_id = c.id
              AND cs2.teacher_ids @> ARRAY[${staffRecord.id}]::uuid[]
          )
        )
        AND EXISTS (
          SELECT 1 FROM staff_assignments sa
          WHERE sa.staff_id = ${staffRecord.id}
            AND sa.location_id = c.location_id
        )
        ORDER BY gb.created_at DESC
      `);

      const mapped = result.rows.map((row: any) => ({
        id: row.id,
        title: row.title,
        classId: row.class_id,
        scoreSheetId: row.score_sheet_id,
        sessionId: row.session_id,
        published: row.published,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        classCode: row.class_code,
        className: row.class_name,
        scoreSheetName: row.score_sheet_name,
        sessionIndex: row.session_index,
        sessionDate: row.session_date,
        scoreCount: row.score_count,
        studentCount: row.student_count,
        createdByName: row.created_by_name,
        updatedByName: row.updated_by_name,
      }));
      res.json(mapped);
    } catch (err: any) {
      console.error("Staff score sheet error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải bảng điểm" });
    }
  });

  app.get("/api/my-space/score-sheet/staff-assessments", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.json([]);

      const [settingsRow] = await db
        .select({ value: systemSettings.value })
        .from(systemSettings)
        .where(eq(systemSettings.key, "scoreSheetAssessments"))
        .limit(1);
      const assessments = settingsRow
        ? z.array(scoreSheetAssessmentSchema).parse(JSON.parse(settingsRow.value))
        : [];
      const assessmentsById = new Map(assessments.map((assessment) => [assessment.id, assessment]));

      const result = await db.execute(sql`
        SELECT
          cs.id AS session_id,
          cs.class_id,
          cs.score_sheet_assessment_id AS assessment_id,
          cs.session_index,
          cs.session_date,
          c.class_code,
          c.name AS class_name,
          (
            SELECT COUNT(DISTINCT ss.student_id)::int
            FROM student_sessions ss
            WHERE ss.class_session_id = cs.id
          ) AS student_count,
          (
            SELECT COUNT(DISTINCT attempt.student_id)::int
            FROM score_sheet_assessment_student_attempts attempt
            WHERE attempt.assessment_id = cs.score_sheet_assessment_id
              AND attempt.class_session_id = cs.id
          ) AS entered_student_count,
          (
            SELECT COUNT(DISTINCT attempt.student_id)::int
            FROM score_sheet_assessment_student_attempts attempt
            WHERE attempt.assessment_id = cs.score_sheet_assessment_id
              AND attempt.class_session_id = cs.id
              AND attempt.result @> '{"inputComplete":true}'::jsonb
          ) AS completed_student_count
        FROM class_sessions cs
        JOIN classes c ON c.id = cs.class_id
        WHERE cs.score_sheet_assessment_id IS NOT NULL
          AND (
            ${staffRecord.id} = ANY(c.teacher_ids)
            OR ${staffRecord.id} = ANY(c.manager_ids)
            OR cs.teacher_ids @> ARRAY[${staffRecord.id}]::uuid[]
          )
          AND EXISTS (
            SELECT 1
            FROM staff_assignments sa
            WHERE sa.staff_id = ${staffRecord.id}
              AND sa.location_id = c.location_id
          )
        ORDER BY cs.session_date DESC, cs.session_index DESC, c.class_code
      `);

      const mapped = result.rows.map((row: any) => {
        const assessment = assessmentsById.get(row.assessment_id);
        return {
          sessionId: row.session_id,
          classId: row.class_id,
          classCode: row.class_code,
          className: row.class_name,
          sessionIndex: row.session_index,
          studentCount: row.student_count,
          enteredStudentCount: row.entered_student_count ?? 0,
          completedStudentCount: row.completed_student_count ?? 0,
          examDate: row.session_date,
          assessmentId: row.assessment_id,
          assessmentCode: assessment?.code ?? null,
          assessmentName: assessment?.name ?? null,
          templateName: assessment?.templateSnapshot.name ?? null,
          scoreDeadlineAt: assessment?.scoreDeadlineAt ?? null,
          attemptCount: assessment?.attemptCount ?? 1,
          scoringPolicy: assessment?.scoringPolicy ?? "latest",
          hasConversion: !!assessment?.templateSnapshot.scoreConversionTemplateId,
        };
      });

      res.json(mapped);
    } catch (err: any) {
      console.error("Staff assigned score assessments error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải bảng điểm được giao" });
    }
  });

  app.get("/api/my-space/score-sheet/staff-assessments/:sessionId/students", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const sessionId = z.string().uuid().safeParse(req.params.sessionId);
      if (!sessionId.success) return res.status(400).json({ message: "Buổi thi không hợp lệ" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const access = await db.execute(sql`
        SELECT cs.id, cs.score_sheet_assessment_id AS assessment_id
        FROM class_sessions cs
        JOIN classes c ON c.id = cs.class_id
        WHERE cs.id = ${sessionId.data}::uuid
          AND cs.score_sheet_assessment_id IS NOT NULL
          AND (
            ${staffRecord.id} = ANY(c.teacher_ids)
            OR ${staffRecord.id} = ANY(c.manager_ids)
            OR cs.teacher_ids @> ARRAY[${staffRecord.id}]::uuid[]
          )
          AND EXISTS (
            SELECT 1
            FROM staff_assignments sa
            WHERE sa.staff_id = ${staffRecord.id}
              AND sa.location_id = c.location_id
          )
        LIMIT 1
      `);
      if (access.rows.length === 0) {
        return res.status(404).json({ message: "Không tìm thấy buổi thi hoặc bạn không có quyền xem" });
      }

      const assessmentId = String(access.rows[0].assessment_id);
      const assessment = await getScoreSheetAssessmentScoringConfig(assessmentId);
      if (!assessment) {
        return res.status(409).json({ message: "Cấu hình bảng điểm được giao không còn khả dụng." });
      }

      const roster = await getRegularSessionStudents(sessionId.data);
      const uniqueStudents = new Map<string, { studentId: string; code: string; fullName: string }>();
      for (const row of roster) {
        if (!uniqueStudents.has(row.studentId)) {
          uniqueStudents.set(row.studentId, {
            studentId: row.studentId,
            code: row.student.code,
            fullName: row.student.fullName,
          });
        }
      }

      const attemptRows = await db
        .select({
          studentId: scoreSheetAssessmentStudentAttempts.studentId,
          attemptNumber: scoreSheetAssessmentStudentAttempts.attemptNumber,
          result: scoreSheetAssessmentStudentAttempts.result,
        })
        .from(scoreSheetAssessmentStudentAttempts)
        .where(and(
          eq(scoreSheetAssessmentStudentAttempts.assessmentId, assessmentId),
          eq(scoreSheetAssessmentStudentAttempts.classSessionId, sessionId.data),
        ));
      const attemptsByStudent = new Map<string, AssessmentAttemptSummaryRow[]>();
      for (const attempt of attemptRows) {
        const studentAttempts = attemptsByStudent.get(attempt.studentId) ?? [];
        studentAttempts.push({
          attemptNumber: attempt.attemptNumber,
          result: attempt.result,
        });
        attemptsByStudent.set(attempt.studentId, studentAttempts);
      }

      res.json(Array.from(uniqueStudents.values()).map((student) => {
        const attempts = attemptsByStudent.get(student.studentId) ?? [];
        const summary = selectAssessmentAttemptSummary(
          attempts,
          assessment.scoringPolicy,
          !!assessment.templateSnapshot.scoreConversionTemplateId,
        );
        return {
          ...student,
          attemptsTaken: attempts.length,
          attemptNumber: summary?.attemptNumber ?? null,
          rawScore: summary?.result.overallRawScore ?? null,
          convertedScore: summary?.result.overallConvertedScore ?? null,
          gradeBandLabel: summary?.result.gradeBand?.label ?? null,
          inputComplete: summary?.result.inputComplete ?? false,
          status: !summary ? "not_entered" : summary.result.inputComplete ? "complete" : "in_progress",
        };
      }));
    } catch (err: any) {
      console.error("Staff score assessment roster error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải danh sách học viên" });
    }
  });

  app.get(
    "/api/my-space/score-sheet/staff-assessments/:sessionId/students/:studentId/score-entry",
    async (req, res) => {
      try {
        const user = req.user as any;
        if (!user) return res.status(401).json({ message: "Unauthorized" });

        const sessionId = z.string().uuid().safeParse(req.params.sessionId);
        const studentId = z.string().uuid().safeParse(req.params.studentId);
        if (!sessionId.success || !studentId.success) {
          return res.status(400).json({ message: "Buổi thi hoặc học viên không hợp lệ." });
        }

        const staffRecord = await getStaffForUser(user.id);
        if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

        const access = await db.execute(sql`
          SELECT cs.score_sheet_assessment_id AS assessment_id
          FROM class_sessions cs
          JOIN classes c ON c.id = cs.class_id
          WHERE cs.id = ${sessionId.data}::uuid
            AND cs.score_sheet_assessment_id IS NOT NULL
            AND (
              ${staffRecord.id} = ANY(c.teacher_ids)
              OR ${staffRecord.id} = ANY(c.manager_ids)
              OR cs.teacher_ids @> ARRAY[${staffRecord.id}]::uuid[]
            )
            AND EXISTS (
              SELECT 1
              FROM staff_assignments sa
              WHERE sa.staff_id = ${staffRecord.id}
                AND sa.location_id = c.location_id
            )
          LIMIT 1
        `);
        if (access.rows.length === 0) {
          return res.status(404).json({ message: "Không tìm thấy buổi thi hoặc bạn không có quyền xem." });
        }

        const [membership] = await db
          .select({ id: studentSessions.id })
          .from(studentSessions)
          .where(and(
            eq(studentSessions.classSessionId, sessionId.data),
            eq(studentSessions.studentId, studentId.data),
          ))
          .limit(1);
        if (!membership) return res.status(404).json({ message: "Học viên không thuộc buổi thi này." });

        const assessmentId = String(access.rows[0].assessment_id);
        const assessment = await getScoreSheetAssessmentScoringConfig(assessmentId);
        if (!assessment) {
          return res.status(409).json({ message: "Cấu hình bảng điểm được giao không còn khả dụng." });
        }

        const attempts = await db
          .select()
          .from(scoreSheetAssessmentStudentAttempts)
          .where(and(
            eq(scoreSheetAssessmentStudentAttempts.assessmentId, assessmentId),
            eq(scoreSheetAssessmentStudentAttempts.classSessionId, sessionId.data),
            eq(scoreSheetAssessmentStudentAttempts.studentId, studentId.data),
          ))
          .orderBy(scoreSheetAssessmentStudentAttempts.attemptNumber);

        res.json({
          assessment: {
            id: assessment.id,
            code: assessment.code,
            name: assessment.name,
            attemptCount: assessment.attemptCount,
            scoringPolicy: assessment.scoringPolicy,
            scoreDeadlineAt: assessment.scoreDeadlineAt,
            templateSnapshot: assessment.templateSnapshot,
            conversionTemplateSnapshot: assessment.conversionTemplateSnapshot,
          },
          attempts: attempts.map((attempt) => ({
            attemptNumber: attempt.attemptNumber,
            partScores: attempt.partScores,
            skillScores: attempt.skillScores,
            notes: attempt.notes,
            result: scoreSheetAssessmentAttemptResultSchema.parse(attempt.result),
            createdAt: attempt.createdAt,
            updatedAt: attempt.updatedAt,
          })),
        });
      } catch (err: any) {
        console.error("Staff score assessment entry load error:", err);
        const status = err instanceof z.ZodError ? 400 : 500;
        res.status(status).json({ message: err.message || "Lỗi khi tải biểu mẫu nhập điểm." });
      }
    },
  );

  app.put(
    "/api/my-space/score-sheet/staff-assessments/:sessionId/students/:studentId/score-entry/:attemptNumber",
    async (req, res) => {
      try {
        const user = req.user as any;
        if (!user) return res.status(401).json({ message: "Unauthorized" });

        const sessionId = z.string().uuid().safeParse(req.params.sessionId);
        const studentId = z.string().uuid().safeParse(req.params.studentId);
        const attemptNumber = z.coerce.number().int().min(1).max(100).safeParse(req.params.attemptNumber);
        const values = scoreSheetAssessmentAttemptValuesSchema.safeParse(req.body);
        if (!sessionId.success || !studentId.success || !attemptNumber.success) {
          return res.status(400).json({ message: "Buổi thi, học viên hoặc lần thi không hợp lệ." });
        }
        if (!values.success) {
          return res.status(400).json({ message: values.error.errors[0]?.message ?? "Thông tin điểm chưa hợp lệ." });
        }

        const staffRecord = await getStaffForUser(user.id);
        if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

        const saved = await db.transaction(async (tx) => {
          const access = await tx.execute(sql`
            SELECT cs.id, cs.score_sheet_assessment_id AS assessment_id
            FROM class_sessions cs
            JOIN classes c ON c.id = cs.class_id
            WHERE cs.id = ${sessionId.data}::uuid
              AND cs.score_sheet_assessment_id IS NOT NULL
              AND (
                ${staffRecord.id} = ANY(c.teacher_ids)
                OR ${staffRecord.id} = ANY(c.manager_ids)
                OR cs.teacher_ids @> ARRAY[${staffRecord.id}]::uuid[]
              )
              AND EXISTS (
                SELECT 1
                FROM staff_assignments sa
                WHERE sa.staff_id = ${staffRecord.id}
                  AND sa.location_id = c.location_id
              )
            LIMIT 1
            FOR UPDATE OF cs
          `);
          if (access.rows.length === 0) {
            const error: any = new Error("Không tìm thấy buổi thi hoặc bạn không có quyền nhập điểm.");
            error.status = 404;
            throw error;
          }

          const assessmentId = String(access.rows[0].assessment_id);
          const assessment = await getScoreSheetAssessmentScoringConfig(assessmentId, tx);
          if (!assessment) {
            const error: any = new Error("Cấu hình bảng điểm được giao không còn khả dụng.");
            error.status = 409;
            throw error;
          }
          if (attemptNumber.data > assessment.attemptCount) {
            const error: any = new Error(`Bảng điểm này chỉ cho phép tối đa ${assessment.attemptCount} lần thi.`);
            error.status = 400;
            throw error;
          }

          const [membership] = await tx
            .select({ id: studentSessions.id })
            .from(studentSessions)
            .where(and(
              eq(studentSessions.classSessionId, sessionId.data),
              eq(studentSessions.studentId, studentId.data),
            ))
            .limit(1);
          if (!membership) {
            const error: any = new Error("Học viên không thuộc buổi thi này.");
            error.status = 404;
            throw error;
          }

          const existingAttempts = await tx
            .select({ attemptNumber: scoreSheetAssessmentStudentAttempts.attemptNumber })
            .from(scoreSheetAssessmentStudentAttempts)
            .where(and(
              eq(scoreSheetAssessmentStudentAttempts.assessmentId, assessmentId),
              eq(scoreSheetAssessmentStudentAttempts.classSessionId, sessionId.data),
              eq(scoreSheetAssessmentStudentAttempts.studentId, studentId.data),
            ));
          const highestAttempt = existingAttempts.reduce(
            (highest, attempt) => Math.max(highest, attempt.attemptNumber),
            0,
          );
          const attemptExists = existingAttempts.some(
            (attempt) => attempt.attemptNumber === attemptNumber.data,
          );
          if (!attemptExists && attemptNumber.data !== highestAttempt + 1) {
            const error: any = new Error("Hãy nhập các lần thi theo thứ tự, bắt đầu từ lần tiếp theo.");
            error.status = 409;
            throw error;
          }

          let result: ScoreSheetAssessmentAttemptResult;
          try {
            result = calculateScoreSheetAssessmentAttemptResult({
              template: assessment.templateSnapshot,
              conversionTemplate: assessment.conversionTemplateSnapshot ?? null,
              values: values.data,
            });
          } catch (scoreError: any) {
            const error: any = new Error(scoreError?.message || "Điểm nhập không hợp lệ.");
            error.status = 400;
            throw error;
          }

          const now = new Date();
          const [attempt] = await tx
            .insert(scoreSheetAssessmentStudentAttempts)
            .values({
              assessmentId,
              classSessionId: sessionId.data,
              studentId: studentId.data,
              attemptNumber: attemptNumber.data,
              partScores: values.data.partScores,
              skillScores: values.data.skillScores,
              notes: values.data.notes,
              result,
              createdBy: user.id,
              updatedBy: user.id,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [
                scoreSheetAssessmentStudentAttempts.assessmentId,
                scoreSheetAssessmentStudentAttempts.classSessionId,
                scoreSheetAssessmentStudentAttempts.studentId,
                scoreSheetAssessmentStudentAttempts.attemptNumber,
              ],
              set: {
                partScores: values.data.partScores,
                skillScores: values.data.skillScores,
                notes: values.data.notes,
                result,
                updatedBy: user.id,
                updatedAt: now,
              },
            })
            .returning();

          return {
            attemptNumber: attempt.attemptNumber,
            partScores: attempt.partScores,
            skillScores: attempt.skillScores,
            notes: attempt.notes,
            result: scoreSheetAssessmentAttemptResultSchema.parse(attempt.result),
            updatedAt: attempt.updatedAt,
          };
        });

        res.json(saved);
      } catch (err: any) {
        const status = err instanceof z.ZodError ? 400 : err?.status ?? 500;
        if (status >= 500) console.error("Staff score assessment save error:", err);
        res.status(status).json({ message: err.message || "Lỗi khi lưu điểm." });
      }
    },
  );
}
