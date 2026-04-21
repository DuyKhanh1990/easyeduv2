import type { Express } from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../auth";
import { z } from "zod";
import { db } from "../db";
import { sendNotificationToMany } from "../lib/notification";
import {
  students,
  staff,
  staffAssignments,
  departments,
  studentSessions,
  classSessions,
  classes,
  shiftTemplates,
  locations,
  invoices,
  invoicePaymentSchedule,
  sessionContents,
  studentSessionContents,
  courseProgramContents,
  examSubmissions,
  classGradeBooks,
  classGradeBookScores,
  classGradeBookStudentComments,
  scoreSheets,
  scoreSheetItems,
  scoreCategories,
  studentClasses,
  users,
  notifications,
} from "@shared/schema";
import { eq, and, gte, lte, sql, inArray, desc } from "drizzle-orm";

const JWT_EXPIRES_IN = "30d";

async function getStudentForUser(userId: string) {
  const [student] = await db
    .select({ id: students.id, fullName: students.fullName, code: students.code })
    .from(students)
    .where(eq(students.userId, userId))
    .limit(1);
  return student ?? null;
}

interface MobileStudentContext {
  isParent: boolean;
  selfStudentId: string | null;
  studentIds: string[];
  linkedStudents: { id: string; fullName: string; code: string }[];
}

async function getMobileStudentContext(userId: string): Promise<MobileStudentContext | null> {
  const [student] = await db
    .select({ id: students.id, fullName: students.fullName, code: students.code, type: students.type })
    .from(students)
    .where(eq(students.userId, userId))
    .limit(1);

  if (!student) return null;

  if (student.type === "Phụ huynh") {
    const linked = await db
      .select({ id: students.id, fullName: students.fullName, code: students.code })
      .from(students)
      .where(sql`${students.parentIds} @> ARRAY[${student.id}]::uuid[]`);
    return {
      isParent: true,
      selfStudentId: student.id,
      studentIds: linked.map((l) => l.id),
      linkedStudents: linked.map((l) => ({ id: l.id, fullName: l.fullName ?? "", code: l.code ?? "" })),
    };
  }

  return {
    isParent: false,
    selfStudentId: student.id,
    studentIds: [student.id],
    linkedStudents: [{ id: student.id, fullName: student.fullName ?? "", code: student.code ?? "" }],
  };
}

async function getEnrolledCount(classSessionId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(studentSessions)
    .where(eq(studentSessions.classSessionId, classSessionId));
  return row?.count ?? 0;
}

async function getStaffForUser(userId: string) {
  const [staffRecord] = await db
    .select({ id: staff.id, fullName: staff.fullName, code: staff.code })
    .from(staff)
    .where(eq(staff.userId, userId))
    .limit(1);
  return staffRecord ?? null;
}

function getTodayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getMonthRange(month?: string) {
  const now = new Date();
  const target = month ? new Date(`${month}-01`) : new Date(now.getFullYear(), now.getMonth(), 1);
  const y = target.getFullYear();
  const mon = target.getMonth();
  const dateFrom = `${y}-${String(mon + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(y, mon + 1, 0).getDate();
  const dateTo = `${y}-${String(mon + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const monthStr = `${y}-${String(mon + 1).padStart(2, "0")}`;
  return { dateFrom, dateTo, monthStr };
}

async function buildTeacherMap(teacherIdArrays: (string[] | null)[]): Promise<Record<string, string>> {
  const allIds = [...new Set(teacherIdArrays.flatMap((ids) => ids ?? []))];
  if (allIds.length === 0) return {};
  const rows = await db
    .select({ id: staff.id, fullName: staff.fullName, code: staff.code })
    .from(staff)
    .where(inArray(staff.id, allIds));
  return Object.fromEntries(rows.map((r) => [r.id, r.fullName || r.code || r.id]));
}

function parseAttachments(raw: string[] | null): { name: string; url: string }[] {
  if (!raw || raw.length === 0) return [];
  return raw.map((entry) => {
    const sep = entry.indexOf("||");
    if (sep === -1) return { name: entry, url: entry };
    return { name: entry.substring(0, sep), url: entry.substring(sep + 2) };
  });
}

async function getSessionContentsForSession(
  classSessionId: string,
  studentId: string
): Promise<{ general: any[]; personal: any[] }> {
  const allRows = await db
    .select()
    .from(sessionContents)
    .where(eq(sessionContents.classSessionId, classSessionId))
    .orderBy(sessionContents.displayOrder);

  if (allRows.length === 0) return { general: [], personal: [] };

  const allIds = allRows.map((r) => r.id);

  // Lấy file đính kèm từ courseProgramContents cho tất cả nội dung có resourceUrl
  const resourceUrls = allRows.map((r) => r.resourceUrl).filter(Boolean) as string[];
  let programAttachmentMap: Record<string, { name: string; url: string }[]> = {};
  if (resourceUrls.length > 0) {
    const programRows = await db
      .select({ id: courseProgramContents.id, attachments: courseProgramContents.attachments })
      .from(courseProgramContents)
      .where(sql`${courseProgramContents.id}::text = ANY(ARRAY[${sql.join(resourceUrls.map((u) => sql`${u}`), sql`, `)}])`);
    for (const pr of programRows) {
      programAttachmentMap[pr.id] = parseAttachments(pr.attachments);
    }
  }

  const personalLinked = await db
    .select({ sessionContentId: studentSessionContents.sessionContentId })
    .from(studentSessionContents)
    .where(inArray(studentSessionContents.sessionContentId, allIds));
  const personalContentIds = new Set(personalLinked.map((p) => p.sessionContentId));

  const commonRows = allRows.filter((r) => !personalContentIds.has(r.id));
  const general = commonRows.map((r) => ({
    id: r.id,
    type: r.contentType,
    title: r.title,
    description: r.description ?? null,
    resourceUrl: r.resourceUrl ?? null,
    attachments: r.resourceUrl ? (programAttachmentMap[r.resourceUrl] ?? []) : [],
  }));

  const personalRows = await db
    .select()
    .from(studentSessionContents)
    .where(
      and(
        eq(studentSessionContents.studentId, studentId),
        inArray(studentSessionContents.sessionContentId, allIds)
      )
    );

  const personal = personalRows.map((p) => {
    const base = allRows.find((g) => g.id === p.sessionContentId);
    return {
      id: p.id,
      type: base?.contentType ?? "",
      title: p.customTitle || base?.title || "",
      description: p.customDescription || base?.description || null,
      resourceUrl: base?.resourceUrl ?? null,
      attachments: base?.resourceUrl ? (programAttachmentMap[base.resourceUrl] ?? []) : [],
    };
  });

  return { general, personal };
}

function toISODate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return `${dateStr}T00:00:00.000Z`;
  return dateStr;
}

function parseReviewData(rawReviewData: any): any[] {
  if (!rawReviewData || typeof rawReviewData !== "object" || Array.isArray(rawReviewData)) return [];
  const result: any[] = [];
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

export function registerMobileRoutes(app: Express) {

  // ── POST /api/mobile/auth/login ───────────────────────────────────────────
  // Public endpoint — không cần token trước
  app.post("/api/mobile/auth/login", (req, res, next) => {
    passport.authenticate("local", async (err: any, user: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: "Tên đăng nhập hoặc mật khẩu không đúng" });

      req.logIn(user, async (loginErr) => {
        if (loginErr) return next(loginErr);

        try {
          const tokenPayload = { id: user.id, username: user.username, isActive: user.isActive };
          const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

          // Xác định loại người dùng
          const [staffRecord] = await db
            .select({ id: staff.id, fullName: staff.fullName, code: staff.code })
            .from(staff)
            .where(eq(staff.userId, user.id))
            .limit(1);

          if (staffRecord) {
            return res.status(200).json({
              token,
              user: { id: user.id, username: user.username, isActive: user.isActive },
              userType: "staff",
              profile: staffRecord,
            });
          }

          const [studentRecord] = await db
            .select({ id: students.id, fullName: students.fullName, code: students.code, type: students.type })
            .from(students)
            .where(eq(students.userId, user.id))
            .limit(1);

          if (studentRecord) {
            return res.status(200).json({
              token,
              user: { id: user.id, username: user.username, isActive: user.isActive },
              userType: studentRecord.type === "Phụ huynh" ? "parent" : "student",
              profile: studentRecord,
            });
          }

          // Fallback: tài khoản không gắn với staff hay student
          return res.status(200).json({
            token,
            user: { id: user.id, username: user.username, isActive: user.isActive },
            userType: "unknown",
            profile: null,
          });
        } catch (dbErr: any) {
          console.error("[Mobile] login user-type lookup error:", dbErr);
          return next(dbErr);
        }
      });
    })(req, res, next);
  });

  // ── GET /api/mobile/schedule/today ───────────────────────────────────────
  // Lịch hôm nay — dành cho cả học viên và giáo viên
  app.get("/api/mobile/schedule/today", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const today = getTodayString();

      const studentRecord = await getStudentForUser(user.id);
      if (studentRecord) {
        const rows = await db
          .select({
            classSessionId: classSessions.id,
            studentSessionId: studentSessions.id,
            sessionDate: classSessions.sessionDate,
            sessionIndex: classSessions.sessionIndex,
            weekday: classSessions.weekday,
            learningFormat: classSessions.learningFormat,
            sessionStatus: classSessions.status,
            teacherIds: classSessions.teacherIds,
            startTime: shiftTemplates.startTime,
            endTime: shiftTemplates.endTime,
            className: classes.name,
            classCode: classes.classCode,
            locationId: classes.locationId,
            attendanceStatus: studentSessions.attendanceStatus,
            attendanceNote: studentSessions.attendanceNote,
          })
          .from(studentSessions)
          .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
          .innerJoin(classes, eq(classSessions.classId, classes.id))
          .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
          .where(and(eq(studentSessions.studentId, studentRecord.id), eq(classSessions.sessionDate, today)))
          .orderBy(shiftTemplates.startTime);

        const teacherMap = await buildTeacherMap(rows.map((r) => r.teacherIds));

        const locationIds = [...new Set(rows.map((r) => r.locationId).filter(Boolean))] as string[];
        let locationMap: Record<string, string> = {};
        if (locationIds.length > 0) {
          const locRows = await db.select({ id: locations.id, name: locations.name }).from(locations).where(inArray(locations.id, locationIds));
          locationMap = Object.fromEntries(locRows.map((l) => [l.id, l.name]));
        }

        const sessions = rows.map((row) => ({
          classSessionId: row.classSessionId,
          studentSessionId: row.studentSessionId,
          sessionDate: row.sessionDate,
          sessionIndex: row.sessionIndex,
          weekday: row.weekday,
          className: row.className,
          classCode: row.classCode,
          locationName: row.locationId ? (locationMap[row.locationId] ?? null) : null,
          startTime: row.startTime,
          endTime: row.endTime,
          learningFormat: row.learningFormat,
          sessionStatus: row.sessionStatus,
          teacherNames: (row.teacherIds ?? []).map((id) => teacherMap[id]).filter(Boolean),
          attendanceStatus: row.attendanceStatus,
          attendanceNote: row.attendanceNote ?? null,
        }));

        return res.json({ userType: "student", date: today, sessions });
      }

      const staffRecord = await getStaffForUser(user.id);
      if (staffRecord) {
        const rows = await db
          .select({
            classSessionId: classSessions.id,
            sessionDate: classSessions.sessionDate,
            sessionIndex: classSessions.sessionIndex,
            weekday: classSessions.weekday,
            learningFormat: classSessions.learningFormat,
            sessionStatus: classSessions.status,
            startTime: shiftTemplates.startTime,
            endTime: shiftTemplates.endTime,
            className: classes.name,
            classCode: classes.classCode,
            locationId: classes.locationId,
            enrolledCount: sql<number>`(SELECT COUNT(*)::int FROM student_sessions ss WHERE ss.class_session_id = ${classSessions.id})`,
            pendingCount: sql<number>`(SELECT COUNT(*)::int FROM student_sessions ss WHERE ss.class_session_id = ${classSessions.id} AND ss.attendance_status = 'pending')`,
          })
          .from(classSessions)
          .innerJoin(classes, eq(classSessions.classId, classes.id))
          .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
          .where(and(sql`${classSessions.teacherIds} @> ARRAY[${staffRecord.id}]::uuid[]`, eq(classSessions.sessionDate, today)))
          .orderBy(shiftTemplates.startTime);

        const locationIds = [...new Set(rows.map((r) => r.locationId).filter(Boolean))] as string[];
        let locationMap: Record<string, string> = {};
        if (locationIds.length > 0) {
          const locRows = await db.select({ id: locations.id, name: locations.name }).from(locations).where(inArray(locations.id, locationIds));
          locationMap = Object.fromEntries(locRows.map((l) => [l.id, l.name]));
        }

        return res.json({
          userType: "staff",
          date: today,
          sessions: rows.map((row) => ({
            classSessionId: row.classSessionId,
            sessionDate: row.sessionDate,
            sessionIndex: row.sessionIndex,
            weekday: row.weekday,
            className: row.className,
            classCode: row.classCode,
            locationName: row.locationId ? (locationMap[row.locationId] ?? null) : null,
            startTime: row.startTime,
            endTime: row.endTime,
            learningFormat: row.learningFormat,
            sessionStatus: row.sessionStatus,
            enrolledCount: row.enrolledCount,
            pendingCount: row.pendingCount,
          })),
        });
      }

      return res.json({ userType: null, date: today, sessions: [] });
    } catch (err: any) {
      console.error("[Mobile] schedule/today error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải lịch hôm nay" });
    }
  });

  // ── GET /api/mobile/student/calendar?month=YYYY-MM ───────────────────────
  // Lịch tháng — danh sách ngày có buổi học + danh sách buổi (nhẹ, không có nội dung)
  // Hỗ trợ cả tài khoản học viên và phụ huynh (lấy lịch của tất cả con)
  app.get("/api/mobile/student/calendar", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const ctx = await getMobileStudentContext(user.id);
      if (!ctx) return res.status(403).json({ message: "Tài khoản không phải học viên" });
      if (ctx.studentIds.length === 0) return res.json({ month: "", datesWithSessions: [], sessions: [] });

      const { month } = req.query as { month?: string };
      const { dateFrom, dateTo, monthStr } = getMonthRange(month);

      const rows = await db
        .select({
          classSessionId: classSessions.id,
          studentSessionId: studentSessions.id,
          studentId: studentSessions.studentId,
          sessionDate: classSessions.sessionDate,
          sessionIndex: classSessions.sessionIndex,
          weekday: classSessions.weekday,
          learningFormat: classSessions.learningFormat,
          sessionStatus: classSessions.status,
          teacherIds: classSessions.teacherIds,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
          className: classes.name,
          classCode: classes.classCode,
          locationId: classes.locationId,
          attendanceStatus: studentSessions.attendanceStatus,
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

      const teacherMap = await buildTeacherMap(rows.map((r) => r.teacherIds));

      const locationIds = [...new Set(rows.map((r) => r.locationId).filter(Boolean))] as string[];
      let locationMap: Record<string, string> = {};
      if (locationIds.length > 0) {
        const locRows = await db.select({ id: locations.id, name: locations.name }).from(locations).where(inArray(locations.id, locationIds));
        locationMap = Object.fromEntries(locRows.map((l) => [l.id, l.name]));
      }

      const studentMap = new Map(ctx.linkedStudents.map((s) => [s.id, s]));

      const sessions = rows.map((row) => {
        const linked = studentMap.get(row.studentId);
        return {
          classSessionId: row.classSessionId,
          studentSessionId: row.studentSessionId,
          sessionDate: toISODate(row.sessionDate),
          sessionIndex: row.sessionIndex,
          weekday: row.weekday,
          className: row.className,
          classCode: row.classCode,
          locationName: row.locationId ? (locationMap[row.locationId] ?? null) : null,
          startTime: row.startTime,
          endTime: row.endTime,
          learningFormat: row.learningFormat,
          sessionStatus: row.sessionStatus,
          teacherNames: (row.teacherIds ?? []).map((id) => teacherMap[id]).filter(Boolean),
          attendanceStatus: row.attendanceStatus,
          student: {
            id: row.studentId,
            name: ctx.isParent ? (linked?.fullName ?? null) : (linked?.fullName ?? null),
            code: ctx.isParent ? (linked?.code ?? null) : (linked?.code ?? null),
          },
          isParent: ctx.isParent,
        };
      });

      const datesWithSessions = [...new Set(rows.map((r) => r.sessionDate))].sort();
      res.json({ month: monthStr, datesWithSessions, sessions });
    } catch (err: any) {
      console.error("[Mobile] student/calendar error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải lịch học" });
    }
  });

  // ── GET /api/mobile/student/calendar/month?month=YYYY-MM ────────────────
  // Danh sách ngày có buổi học trong tháng — chỉ trả ngày, không trả chi tiết
  // Dùng để hiển thị chấm tròn trên lịch mobile (1 request/tháng)
  // Auth: JWT Bearer token — hỗ trợ cả phụ huynh
  app.get("/api/mobile/student/calendar/month", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized. Vui lòng đăng nhập và gửi JWT Bearer token." });

      const ctx = await getMobileStudentContext(user.id);
      if (!ctx) return res.status(403).json({ message: "Tài khoản không phải học viên" });
      if (ctx.studentIds.length === 0) return res.json({ month: "", datesWithSessions: [] });

      const { month } = req.query as { month?: string };
      const { dateFrom, dateTo, monthStr } = getMonthRange(month);

      const rows = await db
        .select({ sessionDate: classSessions.sessionDate })
        .from(studentSessions)
        .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
        .where(
          and(
            inArray(studentSessions.studentId, ctx.studentIds),
            gte(classSessions.sessionDate, dateFrom),
            lte(classSessions.sessionDate, dateTo)
          )
        );

      const datesWithSessions = [...new Set(rows.map((r) => r.sessionDate))].sort();

      res.json({ month: monthStr, datesWithSessions });
    } catch (err: any) {
      console.error("[Mobile] student/calendar/month error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải lịch tháng" });
    }
  });

  // ── GET /api/mobile/student/calendar/day?date=YYYY-MM-DD ────────────────
  // Chi tiết các buổi học trong ngày — đầy đủ: GV, nội dung, nhận xét
  app.get("/api/mobile/student/calendar/day", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const ctx = await getMobileStudentContext(user.id);
      if (!ctx) return res.status(403).json({ message: "Tài khoản không phải học viên" });
      if (ctx.studentIds.length === 0) return res.json({ date: getTodayString(), sessions: [] });

      const date = (req.query.date as string) || getTodayString();

      const rows = await db
        .select({
          classSessionId: classSessions.id,
          studentSessionId: studentSessions.id,
          studentId: studentSessions.studentId,
          sessionDate: classSessions.sessionDate,
          sessionIndex: classSessions.sessionIndex,
          weekday: classSessions.weekday,
          learningFormat: classSessions.learningFormat,
          sessionStatus: classSessions.status,
          teacherIds: classSessions.teacherIds,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
          className: classes.name,
          classCode: classes.classCode,
          locationId: classes.locationId,
          attendanceStatus: studentSessions.attendanceStatus,
          attendanceNote: studentSessions.attendanceNote,
          reviewData: studentSessions.reviewData,
          reviewPublished: studentSessions.reviewPublished,
        })
        .from(studentSessions)
        .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .where(
          and(
            inArray(studentSessions.studentId, ctx.studentIds),
            eq(classSessions.sessionDate, date)
          )
        )
        .orderBy(shiftTemplates.startTime);

      const teacherMap = await buildTeacherMap(rows.map((r) => r.teacherIds));

      const locationIds = [...new Set(rows.map((r) => r.locationId).filter(Boolean))] as string[];
      let locationMap: Record<string, string> = {};
      if (locationIds.length > 0) {
        const locRows = await db.select({ id: locations.id, name: locations.name }).from(locations).where(inArray(locations.id, locationIds));
        locationMap = Object.fromEntries(locRows.map((l) => [l.id, l.name]));
      }

      const studentMap = new Map(ctx.linkedStudents.map((s) => [s.id, s]));

      // Lấy nội dung và sĩ số từng buổi (parallel)
      const sessionsWithContent = await Promise.all(
        rows.map(async (row) => {
          const linked = studentMap.get(row.studentId);
          const [contents, enrolledCount] = await Promise.all([
            getSessionContentsForSession(row.classSessionId, row.studentId),
            getEnrolledCount(row.classSessionId),
          ]);
          return {
            classSessionId: row.classSessionId,
            studentSessionId: row.studentSessionId,
            sessionDate: toISODate(row.sessionDate),
            sessionIndex: row.sessionIndex,
            weekday: row.weekday,
            className: row.className,
            classCode: row.classCode,
            locationName: row.locationId ? (locationMap[row.locationId] ?? null) : null,
            startTime: row.startTime,
            endTime: row.endTime,
            learningFormat: row.learningFormat,
            sessionStatus: row.sessionStatus,
            teacherNames: (row.teacherIds ?? []).map((id) => teacherMap[id]).filter(Boolean),
            attendanceStatus: row.attendanceStatus,
            attendanceNote: row.attendanceNote ?? null,
            reviewPublished: row.reviewPublished ?? false,
            reviewData: row.reviewPublished ? parseReviewData(row.reviewData) : [],
            generalContents: contents.general,
            personalContents: contents.personal,
            student: {
              id: row.studentId,
              name: linked?.fullName ?? null,
              code: linked?.code ?? null,
            },
            isParent: ctx.isParent,
            enrolledCount,
          };
        })
      );

      res.json({ date: toISODate(date), sessions: sessionsWithContent });
    } catch (err: any) {
      console.error("[Mobile] student/calendar/day error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải lịch ngày" });
    }
  });

  // ── GET /api/mobile/student/session/:classSessionId ──────────────────────
  // Chi tiết một buổi học — trả về thông tin học viên (tên, mã) + sĩ số + đầy đủ nội dung
  // Auth: JWT Bearer token — hỗ trợ cả phụ huynh (dùng getMobileStudentContext)
  // Query params:
  //   studentId (optional) — phụ huynh có thể chỉ định ID con cụ thể
  app.get("/api/mobile/student/session/:classSessionId", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized. Vui lòng đăng nhập và gửi JWT Bearer token." });

      const ctx = await getMobileStudentContext(user.id);
      if (!ctx) return res.status(403).json({ message: "Tài khoản không phải học viên" });
      if (ctx.studentIds.length === 0) return res.status(404).json({ message: "Không tìm thấy buổi học" });

      const { classSessionId } = req.params;
      const requestedStudentId = req.query.studentId as string | undefined;

      const targetStudentIds =
        requestedStudentId && ctx.studentIds.includes(requestedStudentId)
          ? [requestedStudentId]
          : ctx.studentIds;

      const [row] = await db
        .select({
          studentSessionId: studentSessions.id,
          classSessionId: classSessions.id,
          studentId: studentSessions.studentId,
          sessionDate: classSessions.sessionDate,
          sessionIndex: classSessions.sessionIndex,
          weekday: classSessions.weekday,
          learningFormat: classSessions.learningFormat,
          sessionStatus: classSessions.status,
          teacherIds: classSessions.teacherIds,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
          className: classes.name,
          classCode: classes.classCode,
          locationId: classes.locationId,
          attendanceStatus: studentSessions.attendanceStatus,
          attendanceNote: studentSessions.attendanceNote,
          reviewData: studentSessions.reviewData,
          reviewPublished: studentSessions.reviewPublished,
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

      const rowStudentId = row.studentId!;
      const linkedStudent = ctx.linkedStudents.find((s) => s.id === rowStudentId);

      const teacherMap = await buildTeacherMap([row.teacherIds]);

      let locationName: string | null = null;
      if (row.locationId) {
        const [loc] = await db
          .select({ name: locations.name })
          .from(locations)
          .where(eq(locations.id, row.locationId))
          .limit(1);
        locationName = loc?.name ?? null;
      }

      const [contents, enrolledCount] = await Promise.all([
        getSessionContentsForSession(row.classSessionId, rowStudentId),
        getEnrolledCount(row.classSessionId),
      ]);

      res.json({
        classSessionId: row.classSessionId,
        studentSessionId: row.studentSessionId,
        sessionDate: toISODate(row.sessionDate),
        sessionIndex: row.sessionIndex ?? null,
        weekday: row.weekday,
        className: row.className,
        classCode: row.classCode,
        locationName,
        startTime: row.startTime,
        endTime: row.endTime,
        learningFormat: row.learningFormat,
        sessionStatus: row.sessionStatus,
        teacherNames: (row.teacherIds ?? []).map((id) => teacherMap[id]).filter(Boolean),
        attendanceStatus: row.attendanceStatus,
        attendanceNote: row.attendanceNote ?? null,
        reviewPublished: row.reviewPublished ?? false,
        reviewData: row.reviewPublished ? parseReviewData(row.reviewData) : [],
        generalContents: contents.general,
        personalContents: contents.personal,
        student: {
          id: rowStudentId,
          name: linkedStudent?.fullName ?? null,
          code: linkedStudent?.code ?? null,
        },
        isParent: ctx.isParent,
        enrolledCount,
      });
    } catch (err: any) {
      console.error("[Mobile] student/session detail error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải chi tiết buổi học" });
    }
  });

  // ── GET /api/mobile/student/invoices ─────────────────────────────────────
  // Thẻ học — danh sách hoá đơn / lịch thanh toán của học viên
  // Hỗ trợ cả tài khoản phụ huynh (lấy hoá đơn của tất cả con)
  // Auth: JWT Bearer token
  app.get("/api/mobile/student/invoices", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized. Vui lòng đăng nhập và gửi JWT Bearer token." });

      const ctx = await getMobileStudentContext(user.id);
      if (!ctx) return res.status(403).json({ message: "Tài khoản không phải học viên" });
      if (ctx.studentIds.length === 0) return res.json({ invoices: [], summary: { totalPaid: 0, totalUnpaid: 0, totalAmount: 0 }, isParent: ctx.isParent });

      const studentMap = new Map(ctx.linkedStudents.map((s) => [s.id, s]));

      const invoiceRows = await db
        .select({
          id: invoices.id,
          studentId: invoices.studentId,
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
          studentCode: students.code,
          className: classes.name,
          classCode: classes.classCode,
        })
        .from(invoices)
        .leftJoin(students, eq(invoices.studentId, students.id))
        .leftJoin(classes, eq(invoices.classId, classes.id))
        .where(inArray(invoices.studentId, ctx.studentIds))
        .orderBy(invoices.createdAt);

      function toISO(val: any): string | null {
        if (!val) return null;
        if (val instanceof Date) return val.toISOString();
        if (typeof val === "string") {
          if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return `${val}T00:00:00.000Z`;
          return val;
        }
        return String(val);
      }

      const result: any[] = [];
      for (const inv of invoiceRows) {
        const linked = studentMap.get(inv.studentId ?? "");
        const studentObj = {
          id: inv.studentId ?? null,
          name: linked?.fullName ?? inv.studentName ?? null,
          code: linked?.code ?? inv.studentCode ?? null,
        };

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
              label: sch.label ?? null,
              type: inv.type,
              category: inv.category ?? null,
              amount: sch.amount,
              paidAmount: null,
              remainingAmount: null,
              status: sch.status,
              dueDate: toISO(sch.dueDate),
              paidAt: toISO(sch.paidAt),
              createdAt: toISO(inv.createdAt),
              isSchedule: true,
              student: studentObj,
              isParent: ctx.isParent,
            });
          }
        } else {
          result.push({
            id: inv.id,
            invoiceId: inv.id,
            title: inv.description || inv.className || inv.classCode || "Hoá đơn",
            code: inv.code,
            label: null,
            type: inv.type,
            category: inv.category ?? null,
            amount: inv.grandTotal,
            paidAmount: inv.paidAmount,
            remainingAmount: inv.remainingAmount,
            status: inv.status,
            dueDate: toISO(inv.dueDate),
            paidAt: null,
            createdAt: toISO(inv.createdAt),
            isSchedule: false,
            student: studentObj,
            isParent: ctx.isParent,
          });
        }
      }

      result.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());

      // Tính tổng server-side (không cần client tự tính)
      let totalPaid = 0;
      let totalUnpaid = 0;
      let totalAmount = 0;
      for (const item of result) {
        const amt = Number(item.amount) || 0;
        totalAmount += amt;
        const s = item.status;
        if (s === "paid") {
          totalPaid += amt;
        } else if (s === "unpaid" || s === "debt" || s === "partial") {
          totalUnpaid += Number(item.remainingAmount ?? item.amount) || 0;
        }
      }

      res.json({
        invoices: result,
        summary: { totalPaid, totalUnpaid, totalAmount },
        isParent: ctx.isParent,
      });
    } catch (err: any) {
      console.error("[Mobile] student/invoices error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải hoá đơn" });
    }
  });

  // ── GET /api/mobile/student/assignments ──────────────────────────────────
  // Bài tập của tôi — BTVN + bài kiểm tra theo tháng hoặc khoảng ngày
  // Query params:
  //   month=YYYY-MM  hoặc  dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
  //   status   (optional) "submitted" | "pending" | "all"
  //   className (optional) lọc theo tên lớp
  app.get("/api/mobile/student/assignments", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const ctx = await getMobileStudentContext(user.id);
      if (!ctx) return res.status(403).json({ message: "Tài khoản không phải học viên" });
      if (ctx.studentIds.length === 0) return res.json({ rows: [], month: "" });

      const { month, dateFrom: qDateFrom, dateTo: qDateTo, status: qStatus, className: qClassName } = req.query as {
        month?: string;
        dateFrom?: string;
        dateTo?: string;
        status?: string;
        className?: string;
      };

      let dateFrom: string;
      let dateTo: string;
      let monthStr: string;

      if (qDateFrom && qDateTo) {
        dateFrom = qDateFrom;
        dateTo = qDateTo;
        monthStr = qDateFrom.substring(0, 7);
      } else {
        const range = getMonthRange(month);
        dateFrom = range.dateFrom;
        dateTo = range.dateTo;
        monthStr = range.monthStr;
      }

      function parseAttachments(raw: string[] | null): { name: string; url: string }[] {
        if (!raw || raw.length === 0) return [];
        return raw.map((entry) => {
          const sep = entry.indexOf("||");
          if (sep === -1) return { name: entry, url: entry };
          return { name: entry.substring(0, sep), url: entry.substring(sep + 2) };
        });
      }

      const studentMap = new Map(ctx.linkedStudents.map((s) => [s.id, s]));

      // ── BTVN ─────────────────────────────────────────────────────────────
      const homeworkRows = await db
        .select({
          classSessionId: classSessions.id,
          studentId: studentSessions.studentId,
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
        .where(and(
          inArray(studentSessions.studentId, ctx.studentIds),
          gte(classSessions.sessionDate, dateFrom),
          lte(classSessions.sessionDate, dateTo)
        ))
        .orderBy(classSessions.sessionDate, shiftTemplates.startTime);

      const homeworkResult = homeworkRows.map((r) => {
        const linked = studentMap.get(r.studentId);
        return {
          itemType: "BTVN" as const,
          classSessionId: r.classSessionId,
          className: r.className,
          classCode: r.classCode,
          sessionDate: toISODate(r.sessionDate),
          weekday: r.weekday,
          sessionIndex: r.sessionIndex,
          startTime: r.startTime,
          endTime: r.endTime,
          homeworkId: r.homeworkId,
          title: r.personalTitle || r.generalTitle,
          description: r.personalDescription || r.generalDescription || null,
          attachments: parseAttachments(r.programAttachments),
          isPersonalized: !!(r.personalTitle || r.personalDescription),
          submissionStatus: (r.submissionStatus === "submitted" ? "submitted" : "pending") as "submitted" | "pending",
          submissionContent: r.submissionContent ?? null,
          submissionAttachments: parseAttachments(r.submissionAttachments as string[] | null),
          studentSessionContentId: r.studentSessionContentId ?? null,
          score: r.score ?? null,
          comment: r.gradingComment ?? null,
          examId: null as string | null,
          student: {
            id: r.studentId ?? null,
            name: linked?.fullName ?? null,
            code: linked?.code ?? null,
          },
          isParent: ctx.isParent,
        };
      });

      // ── Bài kiểm tra ─────────────────────────────────────────────────────
      const examRows = await db
        .select({
          classSessionId: classSessions.id,
          studentId: studentSessions.studentId,
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
        .where(and(
          inArray(studentSessions.studentId, ctx.studentIds),
          gte(classSessions.sessionDate, dateFrom),
          lte(classSessions.sessionDate, dateTo)
        ))
        .orderBy(classSessions.sessionDate, shiftTemplates.startTime);

      const examResult = examRows.map((r) => {
        const linked = studentMap.get(r.studentId);
        return {
          itemType: "Bài kiểm tra" as const,
          classSessionId: r.classSessionId,
          className: r.className,
          classCode: r.classCode,
          sessionDate: toISODate(r.sessionDate),
          weekday: r.weekday,
          sessionIndex: r.sessionIndex,
          startTime: r.startTime,
          endTime: r.endTime,
          homeworkId: r.examContentId,
          title: r.examTitle,
          description: null as string | null,
          attachments: [] as { name: string; url: string }[],
          isPersonalized: false,
          submissionStatus: (r.submissionId ? "submitted" : "pending") as "submitted" | "pending",
          submissionContent: null as string | null,
          submissionAttachments: [] as { name: string; url: string }[],
          studentSessionContentId: null as string | null,
          score: r.submissionScore ?? null,
          comment: r.submissionComment ?? null,
          examId: r.examResourceUrl || r.examContentId,
          student: {
            id: r.studentId ?? null,
            name: linked?.fullName ?? null,
            code: linked?.code ?? null,
          },
          isParent: ctx.isParent,
        };
      });

      let allRows = [...homeworkResult, ...examResult].sort((a, b) => {
        const d = a.sessionDate.localeCompare(b.sessionDate);
        return d !== 0 ? d : a.startTime.localeCompare(b.startTime);
      });

      if (qStatus === "submitted") allRows = allRows.filter((r) => r.submissionStatus === "submitted");
      else if (qStatus === "pending") allRows = allRows.filter((r) => r.submissionStatus === "pending");
      if (qClassName) allRows = allRows.filter((r) => r.className?.toLowerCase() === qClassName.toLowerCase());

      res.json({ rows: allRows, month: monthStr });
    } catch (err: any) {
      console.error("[Mobile] student/assignments error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải bài tập" });
    }
  });

  // ── POST /api/mobile/student/assignments/submit ──────────────────────────
  // Nộp bài tập về nhà
  // Body: { homeworkId, submissionContent, submissionAttachments? }
  app.post("/api/mobile/student/assignments/submit", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const studentRecord = await getStudentForUser(user.id);
      if (!studentRecord) return res.status(403).json({ message: "Tài khoản không phải học viên" });

      const { homeworkId, submissionContent, submissionAttachments } = req.body as {
        homeworkId: string;
        submissionContent?: string;
        submissionAttachments?: string[];
      };

      if (!homeworkId) return res.status(400).json({ message: "homeworkId là bắt buộc" });

      const existing = await db
        .select({ id: studentSessionContents.id })
        .from(studentSessionContents)
        .where(and(
          eq(studentSessionContents.sessionContentId, homeworkId),
          eq(studentSessionContents.studentId, studentRecord.id)
        ))
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
      console.error("[Mobile] student/assignments/submit error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi nộp bài tập" });
    }
  });

  // ── Student score sheet ──────────────────────────────────────────────────
  // GET /api/mobile/student/score-sheet
  // Returns all published grade books for the authenticated student (or all linked
  // students if the account is a parent).
  // Auth: JWT Bearer token — hỗ trợ cả tài khoản phụ huynh
  app.get("/api/mobile/student/score-sheet", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized. Vui lòng đăng nhập và gửi JWT Bearer token." });

      const ctx = await getMobileStudentContext(user.id);
      if (!ctx) return res.status(403).json({ message: "Tài khoản không phải học viên" });
      if (ctx.studentIds.length === 0) return res.json([]);

      // Chạy truy vấn cho từng học viên rồi gộp lại
      const allResults = await Promise.all(
        ctx.linkedStudents.map(async (linkedStudent) => {
          const studentId = linkedStudent.id;
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

          return result.rows.map((row: any) => ({
            id: row.id,
            title: row.title,
            classId: row.class_id,
            scoreSheetId: row.score_sheet_id,
            sessionId: row.session_id,
            published: row.published,
            createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at ?? null),
            updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : (row.updated_at ?? null),
            classCode: row.class_code,
            className: row.class_name,
            scoreSheetName: row.score_sheet_name,
            sessionIndex: row.session_index,
            sessionDate: toISODate(
              row.session_date instanceof Date
                ? `${row.session_date.getFullYear()}-${String(row.session_date.getMonth() + 1).padStart(2, "0")}-${String(row.session_date.getDate()).padStart(2, "0")}`
                : row.session_date
            ),
            scores: row.scores ?? [],
            teacherComment: row.teacher_comment ?? null,
            createdByName: row.created_by_name ?? null,
            student: {
              id: linkedStudent.id,
              name: linkedStudent.fullName ?? null,
              code: linkedStudent.code ?? null,
            },
            isParent: ctx.isParent,
          }));
        })
      );

      const mapped = allResults
        .flat()
        .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());

      res.json(mapped);
    } catch (err: any) {
      console.error("[Mobile] student/score-sheet error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải bảng điểm" });
    }
  });

  // ── GET /api/mobile/staff/invoices ───────────────────────────────────────
  // Phiếu chi lương của nhân viên — tương đương trang /my-space/invoices bên phía staff
  // Auth: JWT Bearer token
  // Query params:
  //   status  — lọc theo trạng thái (unpaid | partial | paid | debt | cancelled), mặc định tất cả
  //   page    — trang (mặc định 1)
  //   limit   — số lượng mỗi trang (mặc định 20, tối đa 100)
  // Response:
  //   { invoices: InvoiceItem[], summary: { totalPaid, totalUnpaid, totalAmount }, pagination: { page, limit, total, totalPages } }
  app.get("/api/mobile/staff/invoices", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized. Vui lòng đăng nhập và gửi JWT Bearer token." });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const statusFilter = req.query.status as string | undefined;
      const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? "20", 10)));

      function toISO(val: any): string | null {
        if (!val) return null;
        if (val instanceof Date) return val.toISOString();
        if (typeof val === "string") {
          if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return `${val}T00:00:00.000Z`;
          return val;
        }
        return String(val);
      }

      // 1. Lấy tất cả salary table IDs mà nhân viên này có published rows
      const { getPublishedRowsForTeacher } = await import("../storage/teacher-salary.storage");
      const publishedRows = await getPublishedRowsForTeacher(staffRecord.id);

      // Map salaryTableId → { salaryTableName, startDate, endDate, locationName }
      const tableMetaMap = new Map<string, { salaryTableName: string; startDate: string | null; endDate: string | null; locationName: string | null }>();
      for (const r of publishedRows) {
        if (!tableMetaMap.has(r.salaryTableId)) {
          tableMetaMap.set(r.salaryTableId, {
            salaryTableName: r.salaryTableName ?? "",
            startDate: r.startDate ? toISO(r.startDate) : null,
            endDate: r.endDate ? toISO(r.endDate) : null,
            locationName: r.locationName ?? null,
          });
        }
      }

      const salaryTableIds = [...tableMetaMap.keys()];

      // 2. Lấy các phiếu chi lương (type=Chi) gắn với các bảng lương này
      let invoiceRows: any[] = [];
      if (salaryTableIds.length > 0) {
        invoiceRows = await db
          .select({
            id: invoices.id,
            code: invoices.code,
            settleCode: invoices.settleCode,
            type: invoices.type,
            category: invoices.category,
            description: invoices.description,
            salaryTableId: invoices.salaryTableId,
            grandTotal: invoices.grandTotal,
            paidAmount: invoices.paidAmount,
            remainingAmount: invoices.remainingAmount,
            status: invoices.status,
            dueDate: invoices.dueDate,
            paymentMethod: invoices.paymentMethod,
            note: invoices.note,
            createdAt: invoices.createdAt,
            updatedAt: invoices.updatedAt,
          })
          .from(invoices)
          .where(
            and(
              inArray(invoices.salaryTableId as any, salaryTableIds),
              sql`${invoices.type} = 'Chi'`
            )
          )
          .orderBy(desc(invoices.createdAt));
      }

      // 3. Với mỗi invoice, kiểm tra payment schedules và mở rộng nếu có
      const allItems: any[] = [];
      for (const inv of invoiceRows) {
        const meta = tableMetaMap.get(inv.salaryTableId ?? "") ?? null;

        const schedules = await db
          .select()
          .from(invoicePaymentSchedule)
          .where(eq(invoicePaymentSchedule.invoiceId, inv.id))
          .orderBy(invoicePaymentSchedule.sortOrder);

        if (schedules.length > 0) {
          for (const sch of schedules) {
            allItems.push({
              id: sch.id,
              invoiceId: inv.id,
              title: inv.description || meta?.salaryTableName || "Phiếu chi lương",
              code: sch.code || inv.code || null,
              settleCode: inv.settleCode ?? null,
              label: sch.label ?? null,
              type: inv.type,
              category: inv.category ?? null,
              amount: String(sch.amount ?? "0"),
              paidAmount: null,
              remainingAmount: null,
              status: sch.status,
              dueDate: toISO(sch.dueDate),
              paidAt: toISO(sch.paidAt),
              paymentMethod: inv.paymentMethod ?? null,
              note: inv.note ?? null,
              createdAt: toISO(inv.createdAt),
              updatedAt: toISO(inv.updatedAt),
              isSchedule: true,
              salaryTable: meta
                ? {
                    id: inv.salaryTableId,
                    name: meta.salaryTableName,
                    startDate: meta.startDate,
                    endDate: meta.endDate,
                    locationName: meta.locationName,
                  }
                : null,
            });
          }
        } else {
          allItems.push({
            id: inv.id,
            invoiceId: inv.id,
            title: inv.description || meta?.salaryTableName || "Phiếu chi lương",
            code: inv.code ?? null,
            settleCode: inv.settleCode ?? null,
            label: null,
            type: inv.type,
            category: inv.category ?? null,
            amount: String(inv.grandTotal ?? "0"),
            paidAmount: String(inv.paidAmount ?? "0"),
            remainingAmount: String(inv.remainingAmount ?? "0"),
            status: inv.status,
            dueDate: toISO(inv.dueDate),
            paidAt: null,
            paymentMethod: inv.paymentMethod ?? null,
            note: inv.note ?? null,
            createdAt: toISO(inv.createdAt),
            updatedAt: toISO(inv.updatedAt),
            isSchedule: false,
            salaryTable: meta
              ? {
                  id: inv.salaryTableId,
                  name: meta.salaryTableName,
                  startDate: meta.startDate,
                  endDate: meta.endDate,
                  locationName: meta.locationName,
                }
              : null,
          });
        }
      }

      // 4. Lọc theo status nếu có
      const filtered = statusFilter
        ? allItems.filter((item) => item.status === statusFilter)
        : allItems;

      // 5. Tính tổng server-side
      let totalPaid = 0;
      let totalUnpaid = 0;
      let totalAmount = 0;
      for (const item of filtered) {
        const amt = Number(item.amount) || 0;
        totalAmount += amt;
        if (item.status === "paid") {
          totalPaid += amt;
        } else if (item.status === "unpaid" || item.status === "debt" || item.status === "partial") {
          totalUnpaid += Number(item.remainingAmount ?? item.amount) || 0;
        }
      }

      // 6. Phân trang
      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const safePage = Math.min(page, totalPages);
      const paged = filtered.slice((safePage - 1) * limit, safePage * limit);

      res.json({
        invoices: paged,
        summary: {
          totalPaid,
          totalUnpaid,
          totalAmount,
        },
        pagination: {
          page: safePage,
          limit,
          total,
          totalPages,
        },
        staff: {
          id: staffRecord.id,
          fullName: staffRecord.fullName,
          code: staffRecord.code,
        },
      });
    } catch (err: any) {
      console.error("[Mobile] staff/invoices error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải phiếu chi lương" });
    }
  });

  // ── GET /api/mobile/staff/calendar ────────────────────────────────────────
  // Lịch dạy theo tháng cho giáo viên (không giới hạn phòng ban)
  app.get("/api/mobile/staff/calendar", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const { month } = req.query as { month?: string };
      const { dateFrom, dateTo, monthStr } = getMonthRange(month);

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
          locationName: locations.name,
        })
        .from(classSessions)
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .leftJoin(locations, eq(classes.locationId, locations.id))
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
        sessionDate: row.sessionDate,
        weekday: row.weekday,
        className: row.className,
        classCode: row.classCode,
        startTime: row.startTime,
        endTime: row.endTime,
        learningFormat: row.learningFormat,
        sessionStatus: row.sessionStatus,
        sessionIndex: row.sessionIndex,
        locationName: row.locationName ?? null,
      }));

      const datesWithSessions = [...new Set(sessions.map((s) => s.sessionDate))];
      res.json({ sessions, datesWithSessions, month: monthStr });
    } catch (err: any) {
      console.error("[Mobile] staff/calendar error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải lịch dạy" });
    }
  });

  // ── GET /api/mobile/staff/calendar/session/:classSessionId ────────────────
  // Chi tiết buổi dạy — thống kê điểm danh, nội dung, danh sách giáo viên
  app.get("/api/mobile/staff/calendar/session/:classSessionId", async (req, res) => {
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

      // Danh sách giáo viên
      const teacherIds = row.teacherIds ?? [];
      let teachers: { id: string; fullName: string }[] = [];
      if (teacherIds.length > 0) {
        const teacherRows = await db
          .select({ id: staff.id, fullName: staff.fullName, code: staff.code })
          .from(staff)
          .where(inArray(staff.id, teacherIds));
        teachers = teacherIds
          .map((tid) => teacherRows.find((r) => r.id === tid))
          .filter(Boolean)
          .map((r: any) => ({ id: r.id, fullName: r.fullName || r.code }));
      }

      // Nội dung buổi học (chung)
      const contentRows = await db
        .select()
        .from(sessionContents)
        .where(eq(sessionContents.classSessionId, classSessionId))
        .orderBy(sessionContents.displayOrder);

      const allContentIds = contentRows.map((r) => r.id);
      let personalContentIds = new Set<string>();
      if (allContentIds.length > 0) {
        const linked = await db
          .select({ sessionContentId: studentSessionContents.sessionContentId })
          .from(studentSessionContents)
          .where(inArray(studentSessionContents.sessionContentId, allContentIds));
        personalContentIds = new Set(linked.map((p) => p.sessionContentId));
      }

      // Lấy file đính kèm từ courseProgramContents
      const staffContentResourceUrls = contentRows.map((r) => r.resourceUrl).filter(Boolean) as string[];
      let staffProgramAttachmentMap: Record<string, { name: string; url: string }[]> = {};
      if (staffContentResourceUrls.length > 0) {
        const programRows = await db
          .select({ id: courseProgramContents.id, attachments: courseProgramContents.attachments })
          .from(courseProgramContents)
          .where(sql`${courseProgramContents.id}::text = ANY(ARRAY[${sql.join(staffContentResourceUrls.map((u) => sql`${u}`), sql`, `)}])`);
        for (const pr of programRows) {
          staffProgramAttachmentMap[pr.id] = parseAttachments(pr.attachments);
        }
      }

      const generalContents = contentRows
        .filter((r) => !personalContentIds.has(r.id))
        .map((r) => ({
          id: r.id,
          type: r.contentType,
          title: r.title,
          description: r.description ?? null,
          resourceUrl: r.resourceUrl ?? null,
          attachments: r.resourceUrl ? (staffProgramAttachmentMap[r.resourceUrl] ?? []) : [],
        }));

      // Thống kê điểm danh
      const [stats] = await db
        .select({
          enrolledCount: sql<number>`count(*)::int`,
          pendingCount: sql<number>`count(case when ${studentSessions.attendanceStatus} = 'pending' then 1 end)::int`,
          reviewedCount: sql<number>`count(case when ${studentSessions.reviewData} is not null and ${studentSessions.reviewData}::text != 'null' then 1 end)::int`,
        })
        .from(studentSessions)
        .where(eq(studentSessions.classSessionId, classSessionId));

      res.json({
        classSessionId: row.classSessionId,
        classId: row.classId,
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
        locationName: row.locationName ?? null,
        teachers,
        evaluationCriteriaIds: row.evaluationCriteriaIds ?? [],
        generalContents,
        enrolledCount: stats?.enrolledCount ?? 0,
        attendancePendingCount: stats?.pendingCount ?? 0,
        reviewedCount: stats?.reviewedCount ?? 0,
      });
    } catch (err: any) {
      console.error("[Mobile] staff/calendar/session error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải chi tiết buổi dạy" });
    }
  });

  // ── GET /api/mobile/staff/calendar/session/:classSessionId/students ────────
  // Danh sách học viên của buổi học — điểm danh + trạng thái nhận xét
  app.get("/api/mobile/staff/calendar/session/:classSessionId/students", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const { classSessionId } = req.params;

      const rows = await db
        .select({
          studentSessionId: studentSessions.id,
          studentId: studentSessions.studentId,
          attendanceStatus: studentSessions.attendanceStatus,
          attendanceNote: studentSessions.attendanceNote,
          sessionOrder: studentSessions.sessionOrder,
          reviewData: studentSessions.reviewData,
          reviewPublished: studentSessions.reviewPublished,
          studentName: students.fullName,
          studentCode: students.code,
        })
        .from(studentSessions)
        .innerJoin(students, eq(studentSessions.studentId, students.id))
        .where(
          and(
            eq(studentSessions.classSessionId, classSessionId),
            sql`${studentSessions.status} != 'transferred'`
          )
        )
        .orderBy(studentSessions.sessionOrder);

      const result = rows.map((r) => ({
        studentSessionId: r.studentSessionId,
        studentId: r.studentId,
        studentName: r.studentName,
        studentCode: r.studentCode,
        attendanceStatus: r.attendanceStatus ?? "pending",
        attendanceNote: r.attendanceNote ?? "",
        sessionOrder: r.sessionOrder ?? null,
        hasReview: r.reviewData !== null && (r.reviewData as any) !== "null",
        reviewPublished: r.reviewPublished ?? false,
      }));

      res.json(result);
    } catch (err: any) {
      console.error("[Mobile] staff/calendar/session/students error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải danh sách học viên" });
    }
  });

  // ── Staff Assignments ────────────────────────────────────────────────────

  /**
   * GET /api/mobile/staff/assignments
   * Lấy danh sách bài tập + bài kiểm tra của nhân viên thuộc Phòng Đào tạo.
   *
   * Query params:
   *   month     (optional) "YYYY-MM"     — mặc định tháng hiện tại
   *   dateFrom  (optional) "YYYY-MM-DD"
   *   dateTo    (optional) "YYYY-MM-DD"
   *   status    (optional) "submitted" | "pending" | "all"  — mặc định "all"
   *   className   (optional) lọc theo tên lớp học (không phân biệt hoa/thường)
   *   studentId   (optional) lọc theo UUID học viên (ưu tiên hơn studentName)
   *   studentName (optional) lọc theo tên học viên nếu không có studentId
   *
   * Response:
   * {
   *   month: "YYYY-MM",
   *   rows: [
   *     {
   *       classSessionId, className, classCode,
   *       sessionDate, weekday, startTime, endTime, sessionIndex,
   *       studentId, studentName,
   *       itemType: "BTVN" | "Bài kiểm tra",
   *       homeworkId,
   *       homeworkTitle, homeworkDescription,
   *       homeworkAttachments: [{ name, url }],
   *       isPersonalized,
   *       submissionStatus: "submitted" | "pending",
   *       submissionContent,
   *       submissionAttachments: [{ name, url }],
   *       studentSessionContentId,
   *       score, comment,
   *       examId
   *     }
   *   ]
   * }
   */
  app.get("/api/mobile/staff/assignments", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const [daotaoRow] = await db
        .select({ id: staffAssignments.id })
        .from(staffAssignments)
        .innerJoin(departments, eq(staffAssignments.departmentId, departments.id))
        .where(and(
          eq(staffAssignments.staffId, staffRecord.id),
          eq(departments.name, "Phòng Đào tạo"),
          eq(departments.isSystem, true)
        ))
        .limit(1);
      if (!daotaoRow) return res.status(403).json({ message: "Tài khoản không thuộc Phòng Đào tạo" });

      const { month, dateFrom: qDateFrom, dateTo: qDateTo, status: qStatus, className: qClassName, studentId: qStudentId, studentName: qStudentName } = req.query as {
        month?: string; dateFrom?: string; dateTo?: string; status?: string; className?: string; studentId?: string; studentName?: string;
      };

      let dateFrom: string;
      let dateTo: string;
      let monthStr: string;

      if (qDateFrom && qDateTo) {
        dateFrom = qDateFrom;
        dateTo = qDateTo;
        monthStr = qDateFrom.substring(0, 7);
      } else {
        const range = getMonthRange(month);
        dateFrom = range.dateFrom;
        dateTo = range.dateTo;
        monthStr = range.monthStr;
      }

      // ── Homework rows ──
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
          sql`${classSessions.teacherIds} @> ARRAY[${staffRecord.id}]::uuid[]`,
          gte(classSessions.sessionDate, dateFrom),
          lte(classSessions.sessionDate, dateTo)
        ))
        .orderBy(classSessions.sessionDate, shiftTemplates.startTime);

      const uniqueStudentIds = [...new Set(rows.map((r) => r.studentId))];
      const studentNameMap = new Map<string, string>();
      for (const sid of uniqueStudentIds) {
        const [s] = await db
          .select({ fullName: students.fullName, code: students.code })
          .from(students)
          .where(eq(students.id, sid))
          .limit(1);
        studentNameMap.set(sid, s?.fullName || s?.code || sid);
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
        homeworkTitle: r.personalTitle || r.generalTitle,
        homeworkDescription: r.personalDescription || r.generalDescription,
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

      // ── Exam rows ──
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
          sql`${classSessions.teacherIds} @> ARRAY[${staffRecord.id}]::uuid[]`,
          gte(classSessions.sessionDate, dateFrom),
          lte(classSessions.sessionDate, dateTo)
        ))
        .orderBy(classSessions.sessionDate, shiftTemplates.startTime);

      for (const sid of [...new Set(examRows.map((r) => r.studentId))]) {
        if (!studentNameMap.has(sid)) {
          const [s] = await db
            .select({ fullName: students.fullName, code: students.code })
            .from(students)
            .where(eq(students.id, sid))
            .limit(1);
          studentNameMap.set(sid, s?.fullName || s?.code || sid);
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

      let result = [...homeworkResult, ...examResult].sort((a, b) => {
        const dateCmp = a.sessionDate.localeCompare(b.sessionDate);
        if (dateCmp !== 0) return dateCmp;
        return a.startTime.localeCompare(b.startTime);
      });

      if (qStatus === "submitted") result = result.filter((r) => r.submissionStatus === "submitted");
      else if (qStatus === "pending") result = result.filter((r) => r.submissionStatus === "pending");
      if (qClassName) result = result.filter((r) => r.className?.toLowerCase() === qClassName.toLowerCase());
      if (qStudentId) result = result.filter((r) => r.studentId === qStudentId);
      if (qStudentName && !qStudentId) result = result.filter((r) => r.studentName?.toLowerCase() === qStudentName.toLowerCase());

      return res.json({ month: monthStr, rows: result });
    } catch (err: any) {
      console.error("[Mobile] staff/assignments error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải bài tập nhân viên" });
    }
  });

  /**
   * POST /api/mobile/staff/assignments/grade
   * Chấm điểm bài tập của học viên.
   * Yêu cầu nhân viên thuộc Phòng Đào tạo.
   *
   * Request body:
   * {
   *   studentSessionContentId: string (uuid),
   *   score: string | null,
   *   gradingComment: string | null
   * }
   *
   * Response: { success: true }
   */
  app.post("/api/mobile/staff/assignments/grade", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const [daotaoRow] = await db
        .select({ id: staffAssignments.id })
        .from(staffAssignments)
        .innerJoin(departments, eq(staffAssignments.departmentId, departments.id))
        .where(and(
          eq(staffAssignments.staffId, staffRecord.id),
          eq(departments.name, "Phòng Đào tạo"),
          eq(departments.isSystem, true)
        ))
        .limit(1);
      if (!daotaoRow) return res.status(403).json({ message: "Tài khoản không thuộc Phòng Đào tạo" });

      const { studentSessionContentId, score, gradingComment } = req.body as {
        studentSessionContentId: string;
        score?: string | null;
        gradingComment?: string | null;
      };

      if (!studentSessionContentId) {
        return res.status(400).json({ message: "Thiếu studentSessionContentId" });
      }

      await db
        .update(studentSessionContents)
        .set({ score: score ?? null, gradingComment: gradingComment ?? null })
        .where(eq(studentSessionContents.id, studentSessionContentId));

      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Mobile] staff/assignments/grade error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi chấm bài" });
    }
  });

  // ── Score Sheet (Staff Grade Books) ─────────────────────────────────────

  /**
   * Helper: verify staff belongs to one of their accessible classes
   * Returns staffRecord or sends 401/403
   */
  async function requireStaff(req: any, res: any) {
    const user = req.user as any;
    if (!user) { res.status(401).json({ message: "Unauthorized" }); return null; }
    const staffRecord = await getStaffForUser(user.id);
    if (!staffRecord) { res.status(403).json({ message: "Tài khoản không phải nhân viên" }); return null; }
    return staffRecord;
  }

  /**
   * Helper: verify staff has access to classId (is teacher or manager AND has location assignment)
   */
  async function staffCanAccessClass(staffId: string, classId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: classes.id })
      .from(classes)
      .where(and(
        eq(classes.id, classId),
        sql`(${staffId} = ANY(${classes.teacherIds}) OR ${staffId} = ANY(${classes.managerIds}))`,
      ))
      .limit(1);
    if (!row) return false;
    const [sa] = await db
      .select({ id: staffAssignments.id })
      .from(staffAssignments)
      .innerJoin(classes, eq(staffAssignments.locationId, classes.locationId))
      .where(and(eq(staffAssignments.staffId, staffId), eq(classes.id, classId)))
      .limit(1);
    return !!sa;
  }

  /**
   * POST helper: send notification when grade book is published
   */
  async function notifyGradeBookPublished(
    classId: string,
    title: string,
    creatorUserId: string | null,
    studentIds: string[]
  ): Promise<void> {
    const uniqueIds = [...new Set(studentIds)].filter(Boolean);
    if (!uniqueIds.length) return;
    const [classRow] = await db
      .select({ name: classes.name })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    const classLabel = classRow?.name ?? "";
    let teacherLabel = "Giáo viên";
    if (creatorUserId) {
      const [sr] = await db.select({ fullName: staff.fullName, code: staff.code })
        .from(staff).where(eq(staff.userId, creatorUserId)).limit(1);
      if (sr) teacherLabel = `Giáo viên: ${sr.fullName} (${sr.code})`;
    }
    const studentUserIds = await db.select({ userId: students.userId })
      .from(students).where(inArray(students.id, uniqueIds));
    const recipientIds = studentUserIds.map(r => r.userId).filter(Boolean) as string[];
    if (!recipientIds.length) return;
    await sendNotificationToMany(recipientIds, {
      title: "Thông báo bảng điểm",
      content: `${teacherLabel} vừa gửi Bảng điểm: ${title}, Lớp ${classLabel}`,
      category: "schedule",
      referenceId: classId,
      referenceType: "class",
    });
  }

  /**
   * GET /api/mobile/staff/score-sheet
   * Danh sách tất cả grade books thuộc các lớp staff đang dạy/quản lý.
   *
   * Response: [{ id, title, classId, classCode, className, scoreSheetId, scoreSheetName,
   *              sessionId, sessionIndex, sessionDate, published,
   *              studentCount, scoreCount, createdByName, updatedByName, createdAt, updatedAt }]
   */
  app.get("/api/mobile/staff/score-sheet", async (req, res) => {
    try {
      const staffRecord = await requireStaff(req, res);
      if (!staffRecord) return;

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
          (SELECT COUNT(*)::int FROM class_grade_book_scores gbs2
            WHERE gbs2.grade_book_id = gb.id AND gbs2.score IS NOT NULL) AS score_count,
          (SELECT COUNT(DISTINCT gbs3.student_id)::int FROM class_grade_book_scores gbs3
            WHERE gbs3.grade_book_id = gb.id) AS student_count,
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
      return res.json(mapped);
    } catch (err: any) {
      console.error("[Mobile] staff/score-sheet error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải bảng điểm" });
    }
  });

  /**
   * GET /api/mobile/staff/classes
   * Danh sách các lớp mà staff đang dạy hoặc quản lý.
   *
   * Response: [{ id, classCode, name, locationId, scoreSheetId }]
   */
  app.get("/api/mobile/staff/classes", async (req, res) => {
    try {
      const staffRecord = await requireStaff(req, res);
      if (!staffRecord) return;

      const result = await db.execute(sql`
        SELECT c.id, c.class_code AS "classCode", c.name, c.location_id AS "locationId", c.score_sheet_id AS "scoreSheetId"
        FROM classes c
        WHERE (${staffRecord.id} = ANY(c.teacher_ids) OR ${staffRecord.id} = ANY(c.manager_ids))
        AND EXISTS (
          SELECT 1 FROM staff_assignments sa
          WHERE sa.staff_id = ${staffRecord.id} AND sa.location_id = c.location_id
        )
        ORDER BY c.class_code ASC
      `);
      return res.json(result.rows);
    } catch (err: any) {
      console.error("[Mobile] staff/classes error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải danh sách lớp" });
    }
  });

  /**
   * GET /api/mobile/score-sheets
   * Danh sách tất cả mẫu bảng điểm (score sheet templates) kèm các hạng mục.
   *
   * Response: [{ id, name, items: [{ id, scoreSheetId, categoryId, formula, order, category: { id, name } }] }]
   */
  app.get("/api/mobile/score-sheets", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

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
      return res.json(result);
    } catch (err: any) {
      console.error("[Mobile] score-sheets error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải mẫu bảng điểm" });
    }
  });

  /**
   * GET /api/mobile/staff/classes/:classId/sessions
   * Danh sách buổi học của một lớp (để chọn khi tạo bảng điểm).
   *
   * Response: [{ id, sessionIndex, sessionDate, weekday, startTime, endTime }]
   */
  app.get("/api/mobile/staff/classes/:classId/sessions", async (req, res) => {
    try {
      const staffRecord = await requireStaff(req, res);
      if (!staffRecord) return;

      const { classId } = req.params;
      if (!await staffCanAccessClass(staffRecord.id, classId)) {
        return res.status(403).json({ message: "Bạn không có quyền truy cập lớp này" });
      }

      const rows = await db
        .select({
          id: classSessions.id,
          sessionIndex: classSessions.sessionIndex,
          sessionDate: classSessions.sessionDate,
          weekday: classSessions.weekday,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
        })
        .from(classSessions)
        .leftJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .where(eq(classSessions.classId, classId))
        .orderBy(classSessions.sessionDate);

      return res.json(rows);
    } catch (err: any) {
      console.error("[Mobile] staff/classes/sessions error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải danh sách buổi học" });
    }
  });

  /**
   * GET /api/mobile/staff/classes/:classId/active-students
   * Danh sách học viên đang học (active) trong một lớp.
   *
   * Response: [{ id, fullName, code, phone, email }]
   */
  app.get("/api/mobile/staff/classes/:classId/active-students", async (req, res) => {
    try {
      const staffRecord = await requireStaff(req, res);
      if (!staffRecord) return;

      const { classId } = req.params;
      if (!await staffCanAccessClass(staffRecord.id, classId)) {
        return res.status(403).json({ message: "Bạn không có quyền truy cập lớp này" });
      }

      const rows = await db
        .select({
          id: students.id,
          fullName: students.fullName,
          code: students.code,
          phone: students.phone,
          email: students.email,
        })
        .from(students)
        .innerJoin(studentClasses, and(
          eq(studentClasses.studentId, students.id),
          eq(studentClasses.classId, classId),
          eq(studentClasses.status, "active")
        ));

      return res.json(rows);
    } catch (err: any) {
      console.error("[Mobile] staff/classes/active-students error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải danh sách học viên" });
    }
  });

  /**
   * GET /api/mobile/staff/classes/:classId/grade-books
   * Danh sách grade books của một lớp cụ thể.
   *
   * Response: [{ id, classId, title, scoreSheetId, scoreSheetName, sessionId, published,
   *              createdBy, updatedBy, createdByName, updatedByName, createdAt, updatedAt }]
   */
  app.get("/api/mobile/staff/classes/:classId/grade-books", async (req, res) => {
    try {
      const staffRecord = await requireStaff(req, res);
      if (!staffRecord) return;

      const { classId } = req.params;
      if (!await staffCanAccessClass(staffRecord.id, classId)) {
        return res.status(403).json({ message: "Bạn không có quyền truy cập lớp này" });
      }

      const result = await db.execute(sql`
        SELECT
          gb.id, gb.class_id, gb.title, gb.score_sheet_id, gb.session_id,
          gb.published, gb.created_by, gb.updated_by, gb.created_at, gb.updated_at,
          ss.name AS score_sheet_name,
          COALESCE(st_c.full_name, cu.username) AS created_by_name,
          COALESCE(st_u.full_name, uu.username) AS updated_by_name
        FROM class_grade_books gb
        LEFT JOIN score_sheets ss ON ss.id = gb.score_sheet_id
        LEFT JOIN users cu ON cu.id = gb.created_by
        LEFT JOIN staff st_c ON st_c.user_id = gb.created_by
        LEFT JOIN users uu ON uu.id = gb.updated_by
        LEFT JOIN staff st_u ON st_u.user_id = gb.updated_by
        WHERE gb.class_id = ${classId}
        ORDER BY gb.created_at DESC
      `);
      return res.json(result.rows.map((r: any) => ({
        id: r.id,
        classId: r.class_id,
        title: r.title,
        scoreSheetId: r.score_sheet_id,
        scoreSheetName: r.score_sheet_name,
        sessionId: r.session_id,
        published: r.published,
        createdBy: r.created_by,
        updatedBy: r.updated_by,
        createdByName: r.created_by_name,
        updatedByName: r.updated_by_name,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })));
    } catch (err: any) {
      console.error("[Mobile] staff/classes/grade-books GET error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải grade books" });
    }
  });

  /**
   * GET /api/mobile/staff/classes/:classId/grade-books/:id
   * Chi tiết điểm + nhận xét của một grade book cụ thể.
   *
   * Response:
   * {
   *   scores: [{ id, gradeBookId, studentId, categoryId, score }],
   *   studentComments: { [studentId]: "comment" }
   * }
   */
  app.get("/api/mobile/staff/classes/:classId/grade-books/:id", async (req, res) => {
    try {
      const staffRecord = await requireStaff(req, res);
      if (!staffRecord) return;

      const { classId, id } = req.params;
      if (!await staffCanAccessClass(staffRecord.id, classId)) {
        return res.status(403).json({ message: "Bạn không có quyền truy cập lớp này" });
      }

      const scores = await db.select().from(classGradeBookScores).where(eq(classGradeBookScores.gradeBookId, id));
      const commentRows = await db.select().from(classGradeBookStudentComments).where(eq(classGradeBookStudentComments.gradeBookId, id));
      const studentComments: Record<string, string> = {};
      commentRows.forEach(row => { studentComments[row.studentId] = row.comment; });

      return res.json({ scores, studentComments });
    } catch (err: any) {
      console.error("[Mobile] staff/classes/grade-books/:id GET error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải chi tiết bảng điểm" });
    }
  });

  /**
   * POST /api/mobile/staff/classes/:classId/grade-books
   * Tạo grade book mới cho một lớp.
   *
   * Request body:
   * {
   *   title: string,
   *   scoreSheetId: string (uuid),
   *   sessionId?: string (uuid) | null,
   *   published?: boolean,
   *   scores?: [{ studentId, categoryId, score }],
   *   studentComments?: { [studentId]: string }
   * }
   *
   * Response (201): grade book object
   */
  app.post("/api/mobile/staff/classes/:classId/grade-books", async (req, res) => {
    try {
      const staffRecord = await requireStaff(req, res);
      if (!staffRecord) return;

      const { classId } = req.params;
      if (!await staffCanAccessClass(staffRecord.id, classId)) {
        return res.status(403).json({ message: "Bạn không có quyền truy cập lớp này" });
      }

      const userId = (req.user as any)?.id;
      const schema = z.object({
        title: z.string().min(1, "Tiêu đề không được để trống"),
        scoreSheetId: z.string().uuid(),
        sessionId: z.string().uuid().nullable().optional(),
        published: z.boolean().optional().default(false),
        studentComments: z.record(z.string()).optional().default({}),
        scores: z.array(z.object({
          studentId: z.string().uuid(),
          categoryId: z.string().uuid(),
          score: z.string().nullable().optional(),
        })).optional().default([]),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const body = parsed.data;

      const [book] = await db.insert(classGradeBooks).values({
        classId,
        title: body.title,
        scoreSheetId: body.scoreSheetId,
        sessionId: body.sessionId || null,
        published: body.published ?? false,
        createdBy: userId || null,
        updatedBy: userId || null,
      }).returning();

      if (body.scores.length > 0) {
        await db.insert(classGradeBookScores).values(
          body.scores.map(s => ({ gradeBookId: book.id, studentId: s.studentId, categoryId: s.categoryId, score: s.score || null }))
        );
      }

      const commentEntries = Object.entries(body.studentComments || {}).filter(([, c]) => c?.trim());
      if (commentEntries.length > 0) {
        await db.insert(classGradeBookStudentComments).values(
          commentEntries.map(([studentId, comment]) => ({ gradeBookId: book.id, studentId, comment: comment.trim() }))
        );
      }

      if (body.published) {
        notifyGradeBookPublished(classId, body.title, userId, body.scores.map(s => s.studentId))
          .catch(err => console.error("[Mobile] GradeBook notify POST error:", err));
      }

      return res.status(201).json(book);
    } catch (err: any) {
      console.error("[Mobile] staff/classes/grade-books POST error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tạo bảng điểm" });
    }
  });

  /**
   * PUT /api/mobile/staff/classes/:classId/grade-books/:id
   * Cập nhật grade book (sửa điểm, tiêu đề, publish/unpublish).
   * Khi chuyển từ unpublished → published sẽ gửi thông báo cho học viên.
   *
   * Request body: (tất cả optional)
   * {
   *   title?: string,
   *   scoreSheetId?: string,
   *   sessionId?: string | null,
   *   published?: boolean,
   *   scores?: [{ studentId, categoryId, score }],
   *   studentComments?: { [studentId]: string }
   * }
   *
   * Response: updated grade book object
   */
  app.put("/api/mobile/staff/classes/:classId/grade-books/:id", async (req, res) => {
    try {
      const staffRecord = await requireStaff(req, res);
      if (!staffRecord) return;

      const { classId, id } = req.params;
      if (!await staffCanAccessClass(staffRecord.id, classId)) {
        return res.status(403).json({ message: "Bạn không có quyền truy cập lớp này" });
      }

      const userId = (req.user as any)?.id;
      const schema = z.object({
        title: z.string().min(1).optional(),
        scoreSheetId: z.string().uuid().optional(),
        sessionId: z.string().uuid().nullable().optional(),
        published: z.boolean().optional(),
        studentComments: z.record(z.string()).optional(),
        scores: z.array(z.object({
          studentId: z.string().uuid(),
          categoryId: z.string().uuid(),
          score: z.string().nullable().optional(),
        })).optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const body = parsed.data;

      const [existing] = await db.select({ published: classGradeBooks.published, title: classGradeBooks.title })
        .from(classGradeBooks).where(eq(classGradeBooks.id, id)).limit(1);
      if (!existing) return res.status(404).json({ message: "Không tìm thấy bảng điểm" });
      const wasPublished = existing.published ?? false;

      const updateData: any = { updatedBy: userId, updatedAt: new Date() };
      if (body.title) updateData.title = body.title;
      if (body.scoreSheetId) updateData.scoreSheetId = body.scoreSheetId;
      if ("sessionId" in body) updateData.sessionId = body.sessionId;
      if ("published" in body) updateData.published = body.published;

      const [updated] = await db.update(classGradeBooks).set(updateData).where(eq(classGradeBooks.id, id)).returning();

      if (body.scores) {
        await db.delete(classGradeBookScores).where(eq(classGradeBookScores.gradeBookId, id));
        if (body.scores.length > 0) {
          await db.insert(classGradeBookScores).values(
            body.scores.map(s => ({ gradeBookId: id, studentId: s.studentId, categoryId: s.categoryId, score: s.score || null }))
          );
        }
      }

      if (body.studentComments !== undefined) {
        await db.delete(classGradeBookStudentComments).where(eq(classGradeBookStudentComments.gradeBookId, id));
        const entries = Object.entries(body.studentComments).filter(([, c]) => c?.trim());
        if (entries.length > 0) {
          await db.insert(classGradeBookStudentComments).values(
            entries.map(([studentId, comment]) => ({ gradeBookId: id, studentId, comment: comment.trim() }))
          );
        }
      }

      // Notify only on unpublished → published transition
      const nowPublished = "published" in body ? body.published : wasPublished;
      if (nowPublished && !wasPublished) {
        const resolvedTitle = body.title ?? existing.title ?? "";
        let studentIds: string[] = [];
        if (body.scores) {
          studentIds = [...new Set(body.scores.map(s => s.studentId))];
        } else {
          const scoreRows = await db.select({ studentId: classGradeBookScores.studentId })
            .from(classGradeBookScores).where(eq(classGradeBookScores.gradeBookId, id));
          studentIds = [...new Set(scoreRows.map(r => r.studentId))];
        }
        notifyGradeBookPublished(classId, resolvedTitle, userId, studentIds)
          .catch(err => console.error("[Mobile] GradeBook notify PUT error:", err));
      }

      return res.json(updated);
    } catch (err: any) {
      console.error("[Mobile] staff/classes/grade-books PUT error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi cập nhật bảng điểm" });
    }
  });

  /**
   * DELETE /api/mobile/staff/classes/:classId/grade-books/:id
   * Xoá một grade book.
   *
   * Response: { success: true }
   */
  app.delete("/api/mobile/staff/classes/:classId/grade-books/:id", async (req, res) => {
    try {
      const staffRecord = await requireStaff(req, res);
      if (!staffRecord) return;

      const { classId, id } = req.params;
      if (!await staffCanAccessClass(staffRecord.id, classId)) {
        return res.status(403).json({ message: "Bạn không có quyền truy cập lớp này" });
      }

      await db.delete(classGradeBooks).where(eq(classGradeBooks.id, id));
      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Mobile] staff/classes/grade-books DELETE error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi xoá bảng điểm" });
    }
  });

  // ── GET /api/mobile/learning-overview/summary ────────────────────────────
  // Trả về số đếm nhanh cho badge trên các tab của trang Learning Overview
  app.get("/api/mobile/learning-overview/summary", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const isSuperAdmin = user.username === "admin";
      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord && !isSuperAdmin) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const allowedLocationIds: string[] = isSuperAdmin ? [] : await db
        .select({ locationId: staffAssignments.locationId })
        .from(staffAssignments)
        .where(eq(staffAssignments.staffId, staffRecord!.id))
        .then((rows) => rows.map((r) => r.locationId));

      if (!isSuperAdmin && allowedLocationIds.length === 0) {
        return res.json({ studentsEndingSoon: 0, classesEndingSoon: 0 });
      }

      const today = new Date().toISOString().split("T")[0];

      const studentLocationClause = isSuperAdmin
        ? sql`1=1`
        : sql`EXISTS (
            SELECT 1 FROM student_locations sl
            WHERE sl.student_id = sc.student_id
              AND sl.location_id = ANY(${allowedLocationIds}::uuid[])
          )`;

      const classLocationClause = isSuperAdmin
        ? sql`1=1`
        : sql`c.location_id = ANY(${allowedLocationIds}::uuid[])`;

      const [studentCount, classCount] = await Promise.all([
        db.execute(sql`
          SELECT COUNT(*)::int AS cnt
          FROM student_classes sc
          WHERE sc.status = 'active'
            AND sc.end_date IS NOT NULL
            AND ${studentLocationClause}
            AND (
              SELECT COUNT(*)::int FROM student_sessions ss
              INNER JOIN class_sessions cs ON ss.class_session_id = cs.id
              WHERE ss.student_class_id = sc.id
                AND cs.session_date >= ${today}::date
                AND cs.status != 'cancelled'
            ) <= 10
        `),
        db.execute(sql`
          SELECT COUNT(*)::int AS cnt
          FROM classes c
          WHERE c.status IN ('active', 'planning')
            AND c.end_date IS NOT NULL
            AND ${classLocationClause}
            AND (
              SELECT COUNT(*)::int FROM class_sessions cs
              WHERE cs.class_id = c.id
                AND cs.session_date >= ${today}::date
                AND cs.status != 'cancelled'
            ) <= 10
        `),
      ]);

      return res.json({
        studentsEndingSoon: parseInt((studentCount.rows[0] as any).cnt ?? "0"),
        classesEndingSoon: parseInt((classCount.rows[0] as any).cnt ?? "0"),
      });
    } catch (err: any) {
      console.error("[Mobile] learning-overview/summary error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải summary" });
    }
  });

  /**
   * GET /api/mobile/students-ending-soon
   * Danh sách học viên sắp hết lịch học (remaining_sessions <= 10).
   * Dùng cho trang /learning-overview tab "Học viên sắp hết lịch".
   *
   * Quyền truy cập:
   *   - Phải đăng nhập với tài khoản staff.
   *   - Dữ liệu được lọc theo cơ sở (location) mà staff được phân công.
   *   - Super admin xem toàn bộ.
   *
   * Query params:
   *   page         (optional, default 1)       — trang hiện tại
   *   pageSize     (optional, default 20)      — số dòng mỗi trang, tối đa 50
   *   search       (optional)                  — tìm theo tên hoặc mã học viên
   *   classes      (optional, repeat)          — lọc theo class_code (vd: classes=A&classes=B)
   *   maxRemaining (optional)                  — lọc số buổi còn lại <= giá trị này
   *   dateFrom     (optional, YYYY-MM-DD)      — lọc ngày kết thúc >= dateFrom
   *   dateTo       (optional, YYYY-MM-DD)      — lọc ngày kết thúc <= dateTo
   *   statusFilter (optional)                  — "ending-soon" | "active" | "ended" | ""
   *
   * Response:
   * {
   *   data: [
   *     {
   *       id,             — id của student_class
   *       studentId,
   *       classId,
   *       status,         — "active"
   *       startDate,
   *       endDate,
   *       studentStatus,
   *       totalSessions,
   *       attendedSessions,
   *       remainingSessions,  — số buổi học trong tương lai (chưa huỷ)
   *       studentCode,
   *       studentName,
   *       studentPhone,
   *       studentEmail,
   *       classCode,
   *       className
   *     }
   *   ],
   *   total,
   *   page,
   *   pageSize,
   *   availableClasses: [{ code, label }]  — danh sách lớp để filter
   * }
   *
   * Nghiệp vụ:
   *   - remainingSessions <= 2 : cảnh báo đỏ (rất gấp)
   *   - remainingSessions 3-4  : cảnh báo cam (sắp hết)
   *   - remainingSessions 5-10 : cảnh báo vàng (cần chú ý)
   *   - statusFilter "ending-soon": end_date >= hôm nay VÀ remaining < 5
   *   - statusFilter "active"     : end_date >= hôm nay VÀ remaining >= 5
   *   - statusFilter "ended"      : end_date < hôm nay
   *   - Sắp xếp: sắp kết thúc → đang học → đã kết thúc, rồi số buổi còn ít nhất trước
   */
  app.get("/api/mobile/students-ending-soon", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const isSuperAdmin = user.username === "admin";

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord && !isSuperAdmin) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const allowedLocationIds: string[] = isSuperAdmin ? [] : await db
        .select({ locationId: staffAssignments.locationId })
        .from(staffAssignments)
        .where(eq(staffAssignments.staffId, staffRecord.id))
        .then((rows) => rows.map((r) => r.locationId));

      if (!isSuperAdmin && allowedLocationIds.length === 0) {
        return res.json({ data: [], total: 0, page: 1, pageSize: 20, availableClasses: [] });
      }

      const {
        page = "1", pageSize = "20", search = "",
        classes: classesParam, maxRemaining, dateFrom = "", dateTo = "", statusFilter = "",
      } = req.query as Record<string, string | string[]>;

      const pageNum = Math.max(1, parseInt(String(page)));
      const pageSizeNum = Math.min(50, Math.max(10, parseInt(String(pageSize))));
      const offsetNum = (pageNum - 1) * pageSizeNum;
      const selectedClasses = classesParam
        ? (Array.isArray(classesParam) ? classesParam : [classesParam]) as string[]
        : [] as string[];

      const today = new Date().toISOString().split("T")[0];

      const locationClause = isSuperAdmin
        ? sql`1=1`
        : sql`EXISTS (
            SELECT 1 FROM student_locations sl
            WHERE sl.student_id = sc.student_id
              AND sl.location_id = ANY(${allowedLocationIds}::uuid[])
          )`;

      const searchStr = String(search);
      const searchCond = searchStr
        ? sql`AND (b.student_code ILIKE ${`%${searchStr}%`} OR b.student_name ILIKE ${`%${searchStr}%`})`
        : sql``;

      const classCond = selectedClasses.length > 0
        ? sql`AND b.class_code = ANY(ARRAY[${sql.join(selectedClasses.map((c) => sql`${c}`), sql`, `)}])`
        : sql``;

      const maxRemainingCond = maxRemaining
        ? sql`AND b.remaining_sessions <= ${parseInt(String(maxRemaining))}`
        : sql``;

      const dateFromCond = dateFrom ? sql`AND b.end_date >= ${String(dateFrom)}::date` : sql``;
      const dateToCond = dateTo ? sql`AND b.end_date <= ${String(dateTo)}::date` : sql``;

      let statusCond = sql``;
      if (statusFilter === "ending-soon") {
        statusCond = sql`AND b.end_date >= ${today}::date AND b.remaining_sessions < 5`;
      } else if (statusFilter === "active") {
        statusCond = sql`AND b.end_date >= ${today}::date AND b.remaining_sessions >= 5`;
      } else if (statusFilter === "ended") {
        statusCond = sql`AND b.end_date < ${today}::date`;
      }

      const result = await db.execute(sql`
        WITH base AS (
          SELECT
            sc.id,
            sc.student_id,
            sc.class_id,
            sc.status,
            sc.start_date,
            sc.end_date,
            sc.student_status,
            sc.total_sessions,
            sc.attended_sessions,
            (
              SELECT COUNT(*)::int
              FROM student_sessions ss
              INNER JOIN class_sessions cs ON ss.class_session_id = cs.id
              WHERE ss.student_class_id = sc.id
                AND cs.session_date >= ${today}::date
                AND cs.status != 'cancelled'
            ) AS remaining_sessions,
            s.code AS student_code,
            s.full_name AS student_name,
            s.phone AS student_phone,
            s.email AS student_email,
            c.class_code,
            c.name AS class_name
          FROM student_classes sc
          INNER JOIN students s ON sc.student_id = s.id
          INNER JOIN classes c ON sc.class_id = c.id
          WHERE sc.status = 'active'
            AND sc.end_date IS NOT NULL
            AND ${locationClause}
            AND (
              SELECT COUNT(*)::int
              FROM student_sessions ss
              INNER JOIN class_sessions cs ON ss.class_session_id = cs.id
              WHERE ss.student_class_id = sc.id
                AND cs.session_date >= ${today}::date
                AND cs.status != 'cancelled'
            ) <= 10
        )
        SELECT
          b.id,
          b.student_id AS "studentId",
          b.class_id AS "classId",
          b.status,
          b.start_date AS "startDate",
          b.end_date AS "endDate",
          b.student_status AS "studentStatus",
          b.total_sessions AS "totalSessions",
          b.attended_sessions AS "attendedSessions",
          b.remaining_sessions AS "remainingSessions",
          b.student_code AS "studentCode",
          b.student_name AS "studentName",
          b.student_phone AS "studentPhone",
          b.student_email AS "studentEmail",
          b.class_code AS "classCode",
          b.class_name AS "className",
          CASE WHEN b.end_date < ${today}::date THEN 2 WHEN b.remaining_sessions < 5 THEN 0 ELSE 1 END AS status_priority,
          COUNT(*) OVER() AS total_count
        FROM base b
        WHERE 1=1
          ${searchCond}
          ${classCond}
          ${maxRemainingCond}
          ${dateFromCond}
          ${dateToCond}
          ${statusCond}
        ORDER BY status_priority ASC, b.remaining_sessions ASC, b.end_date ASC
        LIMIT ${pageSizeNum} OFFSET ${offsetNum}
      `);

      const classesResult = await db.execute(sql`
        SELECT DISTINCT c.class_code, c.name AS class_name
        FROM student_classes sc
        INNER JOIN classes c ON sc.class_id = c.id
        WHERE sc.status = 'active'
          AND sc.end_date IS NOT NULL
          AND ${locationClause}
          AND (
            SELECT COUNT(*)::int
            FROM student_sessions ss
            INNER JOIN class_sessions cs ON ss.class_session_id = cs.id
            WHERE ss.student_class_id = sc.id
              AND cs.session_date >= ${today}::date
              AND cs.status != 'cancelled'
          ) <= 10
        ORDER BY c.class_code
      `);

      const rows = result.rows as any[];
      const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
      const data = rows.map(({ status_priority, total_count, ...rest }) => rest);
      const availableClasses = (classesResult.rows as any[]).map((r) => ({
        code: r.class_code,
        label: r.class_name || r.class_code,
      }));

      return res.json({ data, total, page: pageNum, pageSize: pageSizeNum, availableClasses });
    } catch (err: any) {
      console.error("[Mobile] students-ending-soon error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải dữ liệu học viên sắp hết lịch" });
    }
  });

  // ── GET /api/mobile/parent/profile ──────────────────────────────────────
  // Thông tin phụ huynh + danh sách học viên được liên kết
  // Yêu cầu: JWT Bearer token, tài khoản phải có type = "Phụ huynh"
  // Response:
  //   {
  //     parent: { id, code, fullName, type, phone, email, dateOfBirth, gender,
  //               address, relationship, accountStatus, status },
  //     linkedStudents: [
  //       { id, code, fullName, phone, email, dateOfBirth, gender,
  //         address, accountStatus, status,
  //         enrolledClasses: [{ classId, classCode, className, status,
  //                             startDate, endDate, totalSessions,
  //                             attendedSessions, remainingSessions }] }
  //     ]
  //   }
  app.get("/api/mobile/parent/profile", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      // Lấy bản ghi student của user đang đăng nhập
      const [parentRecord] = await db
        .select({
          id: students.id,
          code: students.code,
          fullName: students.fullName,
          type: students.type,
          phone: students.phone,
          email: students.email,
          dateOfBirth: students.dateOfBirth,
          gender: students.gender,
          address: students.address,
          relationship: students.relationship,
          accountStatus: students.accountStatus,
          status: students.status,
        })
        .from(students)
        .where(eq(students.userId, user.id))
        .limit(1);

      if (!parentRecord) {
        return res.status(404).json({ message: "Không tìm thấy thông tin phụ huynh" });
      }

      if (parentRecord.type !== "Phụ huynh") {
        return res.status(403).json({ message: "Tài khoản này không phải tài khoản phụ huynh" });
      }

      // Lấy danh sách học viên được liên kết với phụ huynh này
      const linkedStudentRecords = await db
        .select({
          id: students.id,
          code: students.code,
          fullName: students.fullName,
          phone: students.phone,
          email: students.email,
          dateOfBirth: students.dateOfBirth,
          gender: students.gender,
          address: students.address,
          accountStatus: students.accountStatus,
          status: students.status,
        })
        .from(students)
        .where(sql`${students.parentIds} @> ARRAY[${parentRecord.id}]::uuid[]`);

      // Với mỗi học viên, lấy danh sách lớp đang học
      const linkedStudentsWithClasses = await Promise.all(
        linkedStudentRecords.map(async (student) => {
          const classRows = await db
            .select({
              classId: studentClasses.classId,
              classCode: classes.classCode,
              className: classes.name,
              status: studentClasses.status,
              startDate: studentClasses.startDate,
              endDate: studentClasses.endDate,
              totalSessions: studentClasses.totalSessions,
              attendedSessions: studentClasses.attendedSessions,
              remainingSessions: studentClasses.remainingSessions,
            })
            .from(studentClasses)
            .innerJoin(classes, eq(studentClasses.classId, classes.id))
            .where(eq(studentClasses.studentId, student.id))
            .orderBy(studentClasses.createdAt);

          return {
            id: student.id,
            code: student.code,
            fullName: student.fullName,
            phone: student.phone ?? null,
            email: student.email ?? null,
            dateOfBirth: student.dateOfBirth ? new Date(student.dateOfBirth).toISOString().split("T")[0] : null,
            gender: student.gender ?? null,
            address: student.address ?? null,
            accountStatus: student.accountStatus ?? null,
            status: student.status ?? null,
            enrolledClasses: classRows.map((c) => ({
              classId: c.classId,
              classCode: c.classCode ?? null,
              className: c.className ?? null,
              status: c.status,
              startDate: c.startDate ? new Date(c.startDate).toISOString().split("T")[0] : null,
              endDate: c.endDate ? new Date(c.endDate).toISOString().split("T")[0] : null,
              totalSessions: c.totalSessions ?? 0,
              attendedSessions: c.attendedSessions ?? 0,
              remainingSessions: c.remainingSessions ?? 0,
            })),
          };
        })
      );

      return res.json({
        parent: {
          id: parentRecord.id,
          code: parentRecord.code,
          fullName: parentRecord.fullName,
          type: parentRecord.type,
          phone: parentRecord.phone ?? null,
          email: parentRecord.email ?? null,
          dateOfBirth: parentRecord.dateOfBirth ? new Date(parentRecord.dateOfBirth).toISOString().split("T")[0] : null,
          gender: parentRecord.gender ?? null,
          address: parentRecord.address ?? null,
          relationship: parentRecord.relationship ?? null,
          accountStatus: parentRecord.accountStatus ?? null,
          status: parentRecord.status ?? null,
        },
        linkedStudents: linkedStudentsWithClasses,
      });
    } catch (err: any) {
      console.error("[Mobile] parent/profile error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải thông tin phụ huynh" });
    }
  });

  // Trả về đúng format cần dùng khi ghi (POST /api/student-sessions/review)
  app.get("/api/student-sessions/:id/review", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const { id } = req.params;
      const [row] = await db
        .select({
          reviewData: studentSessions.reviewData,
          reviewPublished: studentSessions.reviewPublished,
        })
        .from(studentSessions)
        .where(eq(studentSessions.id, id))
        .limit(1);

      if (!row) return res.status(404).json({ message: "Không tìm thấy student session" });

      res.json({
        reviewData: row.reviewData ?? null,
        reviewPublished: row.reviewPublished ?? false,
      });
    } catch (err: any) {
      console.error("[Mobile] student-sessions/review GET error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải nhận xét" });
    }
  });

  // ── GET /api/mobile/parent/notifications ─────────────────────────────────
  // Thông báo dành cho Phụ huynh — trả về noti của bản thân và tất cả con Học viên
  // Auth: JWT Bearer token
  // Query: ?limit=50&offset=0
  app.get("/api/mobile/parent/notifications", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized. Vui lòng gửi JWT Bearer token." });

      const ctx = await getMobileStudentContext(user.id);
      if (!ctx) return res.status(403).json({ message: "Tài khoản không phải học viên hoặc phụ huynh." });
      if (!ctx.isParent) return res.status(403).json({ message: "API này chỉ dành cho tài khoản Phụ huynh." });

      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const offset = Number(req.query.offset) || 0;

      // Lấy userId của các con học viên và xây map userId -> student info
      const studentMap = new Map(ctx.linkedStudents.map((s) => [s.id, s]));
      const childUserIds: string[] = [];
      const userIdToStudent = new Map<string, { id: string; fullName: string; code: string }>();
      if (ctx.studentIds.length > 0) {
        const childStudents = await db
          .select({ id: students.id, userId: students.userId })
          .from(students)
          .where(inArray(students.id, ctx.studentIds));
        for (const c of childStudents) {
          if (c.userId) {
            childUserIds.push(c.userId);
            const info = studentMap.get(c.id);
            if (info) userIdToStudent.set(c.userId, info);
          }
        }
      }

      // Danh sách userId cần lấy noti: userId của phụ huynh + userId của các con
      const allUserIds = [user.id, ...childUserIds];

      // Lấy tổng số unread
      const unreadRows = await db
        .select({ userId: notifications.userId })
        .from(notifications)
        .where(and(inArray(notifications.userId, allUserIds), eq(notifications.isRead, false)));
      const totalUnread = unreadRows.length;

      // Lấy danh sách noti (phân trang)
      const rows = await db
        .select()
        .from(notifications)
        .where(inArray(notifications.userId, allUserIds))
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset);

      const items = rows.map((n) => {
        const child = userIdToStudent.get(n.userId);
        return {
          id: n.id,
          title: n.title,
          content: n.content,
          type: n.type,
          category: n.category ?? "general",
          referenceId: n.referenceId ?? null,
          referenceType: n.referenceType ?? null,
          isRead: n.isRead,
          createdAt: n.createdAt ? new Date(n.createdAt).toISOString() : null,
          student: child
            ? { id: child.id, fullName: child.fullName, code: child.code }
            : null,
          isSelf: n.userId === user.id,
        };
      });

      return res.json({
        totalUnread,
        limit,
        offset,
        items,
      });
    } catch (err: any) {
      console.error("[Mobile] parent/notifications error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải thông báo" });
    }
  });

  // ── GET /api/mobile/parent/notifications/unread-count ────────────────────
  // Số thông báo chưa đọc của phụ huynh + tất cả con
  // Auth: JWT Bearer token
  app.get("/api/mobile/parent/notifications/unread-count", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized. Vui lòng gửi JWT Bearer token." });

      const ctx = await getMobileStudentContext(user.id);
      if (!ctx) return res.status(403).json({ message: "Tài khoản không phải học viên hoặc phụ huynh." });
      if (!ctx.isParent) return res.status(403).json({ message: "API này chỉ dành cho tài khoản Phụ huynh." });

      const childUserIds: string[] = [];
      if (ctx.studentIds.length > 0) {
        const childStudents = await db
          .select({ userId: students.userId })
          .from(students)
          .where(inArray(students.id, ctx.studentIds));
        for (const c of childStudents) {
          if (c.userId) childUserIds.push(c.userId);
        }
      }

      const allUserIds = [user.id, ...childUserIds];

      const rows = await db
        .select({ id: notifications.id, userId: notifications.userId })
        .from(notifications)
        .where(and(inArray(notifications.userId, allUserIds), eq(notifications.isRead, false)));

      // Tính unread theo từng con
      const userIdToStudent = new Map<string, { id: string; fullName: string; code: string }>();
      if (ctx.studentIds.length > 0) {
        const childStudents = await db
          .select({ id: students.id, userId: students.userId })
          .from(students)
          .where(inArray(students.id, ctx.studentIds));
        for (const c of childStudents) {
          if (c.userId) {
            const info = ctx.linkedStudents.find((s) => s.id === c.id);
            if (info) userIdToStudent.set(c.userId, info);
          }
        }
      }

      const byStudent: { studentId: string; fullName: string; code: string; unread: number }[] = [];
      for (const [uid, info] of userIdToStudent.entries()) {
        byStudent.push({
          studentId: info.id,
          fullName: info.fullName,
          code: info.code,
          unread: rows.filter((r) => r.userId === uid).length,
        });
      }

      return res.json({
        total: rows.length,
        byStudent,
      });
    } catch (err: any) {
      console.error("[Mobile] parent/notifications/unread-count error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải số thông báo chưa đọc" });
    }
  });

  // ── PATCH /api/mobile/parent/notifications/:id/read ───────────────────────
  // Đánh dấu một thông báo là đã đọc (chỉ nếu thuộc phụ huynh hoặc con)
  // Auth: JWT Bearer token
  app.patch("/api/mobile/parent/notifications/:id/read", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized. Vui lòng gửi JWT Bearer token." });

      const ctx = await getMobileStudentContext(user.id);
      if (!ctx) return res.status(403).json({ message: "Tài khoản không phải học viên hoặc phụ huynh." });
      if (!ctx.isParent) return res.status(403).json({ message: "API này chỉ dành cho tài khoản Phụ huynh." });

      const childUserIds: string[] = [];
      if (ctx.studentIds.length > 0) {
        const childStudents = await db
          .select({ userId: students.userId })
          .from(students)
          .where(inArray(students.id, ctx.studentIds));
        for (const c of childStudents) {
          if (c.userId) childUserIds.push(c.userId);
        }
      }

      const allUserIds = [user.id, ...childUserIds];
      const { id } = req.params;

      const updated = await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.id, id), inArray(notifications.userId, allUserIds)))
        .returning({ id: notifications.id });

      if (updated.length === 0) {
        return res.status(404).json({ message: "Không tìm thấy thông báo hoặc bạn không có quyền truy cập." });
      }

      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Mobile] parent/notifications/:id/read error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi đánh dấu đã đọc" });
    }
  });

  // ── PATCH /api/mobile/parent/notifications/read-all ───────────────────────
  // Đánh dấu tất cả thông báo là đã đọc (của phụ huynh + tất cả con)
  // Auth: JWT Bearer token
  app.patch("/api/mobile/parent/notifications/read-all", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized. Vui lòng gửi JWT Bearer token." });

      const ctx = await getMobileStudentContext(user.id);
      if (!ctx) return res.status(403).json({ message: "Tài khoản không phải học viên hoặc phụ huynh." });
      if (!ctx.isParent) return res.status(403).json({ message: "API này chỉ dành cho tài khoản Phụ huynh." });

      const childUserIds: string[] = [];
      if (ctx.studentIds.length > 0) {
        const childStudents = await db
          .select({ userId: students.userId })
          .from(students)
          .where(inArray(students.id, ctx.studentIds));
        for (const c of childStudents) {
          if (c.userId) childUserIds.push(c.userId);
        }
      }

      const allUserIds = [user.id, ...childUserIds];

      await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(inArray(notifications.userId, allUserIds), eq(notifications.isRead, false)));

      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Mobile] parent/notifications/read-all error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi đánh dấu tất cả đã đọc" });
    }
  });
}
