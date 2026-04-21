import type { Express } from "express";
import { db } from "../db";
import {
  students,
  staff,
  staffAssignments,
  departments,
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
  examSubmissions,
} from "@shared/schema";
import { eq, and, gte, lte, sql, inArray, isNotNull } from "drizzle-orm";

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

async function getSessionContents(classSessionId: string, studentId?: string) {
  const allRows = await db
    .select()
    .from(sessionContents)
    .where(eq(sessionContents.classSessionId, classSessionId))
    .orderBy(sessionContents.displayOrder);

  if (allRows.length === 0) return { general: [], personal: [] };

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
  }));

  let personal: { id: string; type: string; title: string; description: string | null; resourceUrl: string | null; customTitle: string | null; customDescription: string | null }[] = [];

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
        customTitle: p.customTitle,
        customDescription: p.customDescription,
      };
    });
  }

  return { general, personal };
}

function parseReviewData(rawReviewData: any): { teacherName: string; criteria: { criteriaName: string; items: { subCriteriaName: string; comment: string }[] }[] }[] {
  if (!rawReviewData || typeof rawReviewData !== "object" || Array.isArray(rawReviewData)) return [];
  const result: { teacherName: string; criteria: { criteriaName: string; items: { subCriteriaName: string; comment: string }[] }[] }[] = [];
  for (const key of Object.keys(rawReviewData)) {
    const entry = rawReviewData[key];
    if (!entry || !Array.isArray(entry.items)) continue;
    const criteriaMap = new Map<string, { subCriteriaName: string; comment: string }[]>();
    for (const item of entry.items) {
      const cName = item.criteriaName || "Chung";
      if (!criteriaMap.has(cName)) criteriaMap.set(cName, []);
      criteriaMap.get(cName)!.push({
        subCriteriaName: item.subCriteriaName || "",
        comment: item.comment ?? "",
      });
    }
    const criteria = Array.from(criteriaMap.entries()).map(([criteriaName, items]) => ({ criteriaName, items }));
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
          sessionDate: classSessions.sessionDate,
          weekday: classSessions.weekday,
          learningFormat: classSessions.learningFormat,
          sessionStatus: classSessions.status,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
          className: classes.name,
          classCode: classes.classCode,
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
      const sessions = rows
        .filter((row) => {
          const key = `${row.studentId ?? ""}_${row.classSessionId}`;
          if (seenSessionKeys.has(key)) return false;
          seenSessionKeys.add(key);
          return true;
        })
        .map((row) => {
          const linked = studentNameMap.get(row.studentId ?? "");
          return {
            classSessionId: row.classSessionId,
            studentSessionId: row.studentSessionId,
            sessionDate: row.sessionDate,
            weekday: row.weekday,
            className: row.className,
            classCode: row.classCode,
            startTime: row.startTime,
            endTime: row.endTime,
            learningFormat: row.learningFormat,
            sessionStatus: row.sessionStatus,
            attendanceStatus: row.attendanceStatus,
            studentName: ctx.isParent ? (linked?.fullName ?? null) : null,
            studentCode: ctx.isParent ? (linked?.code ?? null) : null,
            studentId: row.studentId,
          };
        });

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

      res.json(rows.map((r) => ({
        classId: r.classId,
        className: r.className ?? r.classCode ?? r.classId,
        classCode: r.classCode ?? r.classId,
        totalSessions: r.totalSessions,
      })));
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
          attendanceStatus: studentSessions.attendanceStatus,
          attendanceNote: studentSessions.attendanceNote,
          reviewData: studentSessions.reviewData,
          reviewPublished: studentSessions.reviewPublished,
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

      if (!row) return res.status(404).json({ message: "Không tìm thấy buổi học" });

      const rowStudentId = row.studentId ?? ctx.selfStudentId!;
      const linkedStudent = ctx.linkedStudents.find(s => s.id === rowStudentId);

      const teacherNames = await getTeacherNames(row.teacherIds ?? []);
      const contents = await getSessionContents(row.classSessionId, rowStudentId);
      const stats = await getSessionAttendanceStats(row.classSessionId);

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
      });
    } catch (err: any) {
      console.error("Student session detail error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải chi tiết buổi học" });
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

      const rows = await db
        .select({
          classSessionId: classSessions.id,
          sessionDate: classSessions.sessionDate,
          weekday: classSessions.weekday,
          learningFormat: classSessions.learningFormat,
          sessionStatus: classSessions.status,
          sessionIndex: classSessions.sessionIndex,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
          className: classes.name,
          classCode: classes.classCode,
        })
        .from(classSessions)
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .where(
          and(
            sql`${classSessions.teacherIds} @> ARRAY[${staffRecord.id}]::uuid[]`,
            gte(classSessions.sessionDate, dateFrom),
            lte(classSessions.sessionDate, dateTo)
          )
        )
        .orderBy(classSessions.sessionDate, shiftTemplates.startTime);

      const sessions = rows.map((row) => ({
        classSessionId: row.classSessionId,
        studentSessionId: null,
        sessionDate: row.sessionDate,
        weekday: row.weekday,
        className: row.className,
        classCode: row.classCode,
        startTime: row.startTime,
        endTime: row.endTime,
        learningFormat: row.learningFormat,
        sessionStatus: row.sessionStatus,
        attendanceStatus: null,
      }));

      const datesWithSessions = [...new Set(sessions.map((s) => s.sessionDate))];
      res.json({ sessions, datesWithSessions, month: monthStr });
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
          totalSessions: sql<number>`(SELECT COUNT(*) FROM class_sessions cs2 WHERE cs2.class_id = ${classes.id})`,
          locationName: locations.name,
        })
        .from(classSessions)
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .leftJoin(locations, eq(classes.locationId, locations.id))
        .where(eq(classSessions.id, classSessionId))
        .limit(1);

      if (!row) return res.status(404).json({ message: "Không tìm thấy buổi học" });

      const teachers = await getTeachersWithIds(row.teacherIds ?? []);
      const teacherNames = teachers.map((t) => t.fullName);
      const contents = await getSessionContents(row.classSessionId);
      const stats = await getSessionAttendanceStats(row.classSessionId);

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
      });
    } catch (err: any) {
      console.error("Staff session detail error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải chi tiết buổi học nhân viên" });
    }
  });

  // ── Student assignments ──────────────────────────────────────────────────
  app.get("/api/my-space/assignments/student", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const ctx = await getStudentContext(user.id);
      if (!ctx.selfStudentId) return res.status(403).json({ message: "Tài khoản không phải học viên" });
      if (ctx.studentIds.length === 0) return res.json({ rows: [], month: "" });

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

      const studentNameMap = new Map(ctx.linkedStudents.map(s => [s.id, s]));

      // Parse "filename||/uploads/path" format into { name, url } objects
      function parseAttachments(raw: string[] | null): { name: string; url: string }[] {
        if (!raw || raw.length === 0) return [];
        return raw.map((entry) => {
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
          className: classes.name,
          classCode: classes.classCode,
          homeworkId: sessionContents.id,
          generalTitle: sessionContents.title,
          generalDescription: sessionContents.description,
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
          homeworkDescription: r.generalDescription,
          homeworkAttachments: parseAttachments(r.programAttachments),
          isPersonalized: !!(r.personalTitle || r.personalDescription),
          submissionStatus: (r.submissionStatus === "submitted" ? "submitted" : "pending") as "submitted" | "pending",
          submissionContent: r.submissionContent ?? null,
          submissionAttachments: (r.submissionAttachments as string[] | null) ?? [],
          studentSessionContentId: r.studentSessionContentId ?? null,
          score: r.score ?? null,
          comment: r.gradingComment ?? null,
          examId: null,
        };
      });

      // Exam rows: session_contents with contentType='Bài kiểm tra' for enrolled sessions
      const examRows = await db
        .select({
          classSessionId: classSessions.id,
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
          eq(examSubmissions.studentId, studentSessions.studentId)
        ))
        .where(
          and(
            inArray(studentSessions.studentId, ctx.studentIds),
            gte(classSessions.sessionDate, dateFrom),
            lte(classSessions.sessionDate, dateTo)
          )
        )
        .orderBy(classSessions.sessionDate, shiftTemplates.startTime);

      const examResult = examRows.map((r) => {
        const linked = studentNameMap.get(r.studentId ?? "");
        return {
          classSessionId: r.classSessionId,
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
          score: r.submissionScore ?? null,
          comment: r.submissionComment ?? null,
          examId: r.examResourceUrl || r.examContentId,
        };
      });

      // Merge and sort by date then start time
      const allRows = [...homeworkResult, ...examResult].sort((a, b) => {
        const dateCmp = a.sessionDate.localeCompare(b.sessionDate);
        if (dateCmp !== 0) return dateCmp;
        return a.startTime.localeCompare(b.startTime);
      });

      res.json({ rows: allRows, month: monthStr });
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

      // Batch fetch student names to avoid N+1 queries
      const uniqueStudentIds = [...new Set(rows.map((r) => r.studentId))];
      const studentNameMap = new Map<string, string>();
      for (const sid of uniqueStudentIds) {
        studentNameMap.set(sid, await getStudentName(sid));
      }

      function parseHomeworkAttachments(raw: string[] | null): { name: string; url: string }[] {
        if (!raw || raw.length === 0) return [];
        return raw.map((entry) => {
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
        itemType: "BTVN" as const,
        homeworkId: r.homeworkId,
        // Prefer personalized title/description over general when available
        homeworkTitle: r.personalTitle || r.generalTitle,
        homeworkDescription: r.personalDescription || r.generalDescription,
        isPersonalized: !!(r.personalTitle || r.personalDescription),
        submissionStatus: (r.submissionStatus === "submitted" ? "submitted" : "pending") as "submitted" | "pending",
        submissionContent: r.submissionContent ?? null,
        submissionAttachments: (r.submissionAttachments as string[] | null) ?? [],
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
          eq(examSubmissions.studentId, studentSessions.studentId)
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

      const examResult: any[] = examRows.map((r) => ({
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
        score: r.submissionScore ?? null,
        comment: r.submissionComment ?? null,
        examId: r.examResourceUrl || r.examContentId,
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
          eq(examSubmissions.studentId, studentSessions.studentId)
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

      function parseAttachments(raw: string[] | null): { name: string; url: string }[] {
        if (!raw || raw.length === 0) return [];
        return raw.map((entry) => {
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
        homeworkDescription: r.personalDescription || r.generalDescription,
        isPersonalized: !!(r.personalTitle || r.personalDescription),
        submissionStatus: (r.submissionStatus === "submitted" ? "submitted" : "pending") as "submitted" | "pending",
        submissionContent: r.submissionContent ?? null,
        submissionAttachments: (r.submissionAttachments as string[] | null) ?? [],
        homeworkAttachments: parseAttachments(r.programAttachments as string[] | null),
        studentSessionContentId: r.studentSessionContentId ?? null,
        score: r.score ?? null,
        comment: r.gradingComment ?? null,
        examId: null,
      }));

      const examResult: any[] = examRows.map((r) => ({
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
        score: r.submissionScore ?? null,
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

      const ctx = await getStudentContext(user.id);
      if (!ctx.selfStudentId || ctx.studentIds.length === 0) return res.json({ invoices: [] });

      // Fetch all invoices for this student (or linked children) with class name
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
        .where(inArray(invoices.studentId, ctx.studentIds))
        .orderBy(invoices.createdAt);

      // For each invoice, check if it has payment schedules
      const result: any[] = [];
      for (const inv of invoiceRows) {
        const schedules = await db
          .select()
          .from(invoicePaymentSchedule)
          .where(eq(invoicePaymentSchedule.invoiceId, inv.id))
          .orderBy(invoicePaymentSchedule.sortOrder);

        if (schedules.length > 0) {
          // One card per schedule installment
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
          // Single card for the whole invoice
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

      // Sort by createdAt descending (newest first)
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      res.json({ invoices: result });
    } catch (err: any) {
      console.error("My invoices error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải hoá đơn" });
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
            packageId: pkgMap.get(row.classId) ?? null,
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
          const packageId = pkgMap.get(row.classId) ?? null;
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
          JOIN student_classes sc2 ON sc2.class_id = gb.class_id AND sc2.student_id = ${studentId}
          LEFT JOIN score_sheets ss ON ss.id = gb.score_sheet_id
          LEFT JOIN class_sessions cs ON cs.id = gb.session_id
          LEFT JOIN users cu ON cu.id = gb.created_by
          LEFT JOIN staff st ON st.user_id = gb.created_by
          WHERE gb.published = TRUE
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
}
