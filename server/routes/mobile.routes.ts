import type { Express } from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../auth";
import { z } from "zod";
import { getEffectivePermissions } from "../storage/permissions.storage";
import { db, pool } from "../db";
import { sendNotificationToMany } from "../lib/notification";
import { resolveZaloAuth } from "../services/zalo-auth.service";
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
  coursePrograms,
  examSubmissions,
  exams,
  classGradeBooks,
  classGradeBookScores,
  classGradeBookStudentComments,
  scoreSheets,
  scoreSheetItems,
  scoreCategories,
  studentClasses,
  users,
  notifications,
  centerConfig,
  onlineLearningRules,
  teacherAttendance,
  staffAttendances,
  salarySheets,
  salarySheetEmployees,
  staffSalaryConfigs,
  pushTokens,
  newsFeedPosts,
  newsFeedReactions,
  evaluationCriteria,
  evaluationSubCriteria,
  studentLocations,
} from "@shared/schema";
import { eq, and, gte, lte, sql, inArray, desc, or, isNull } from "drizzle-orm";
import { enforceAttendanceTimeLimit, getStaffRoleIds } from "../lib/attendance-limit";
import { updateStudentAttendance, bulkUpdateAttendance } from "../storage/attendance.storage";
import { sendAttendanceNotification } from "../lib/attendance-notification";

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

function parseAttachments(raw: Array<string | { name: string; url: string }> | null): { name: string; url: string }[] {
  if (!raw || raw.length === 0) return [];
  return raw.map((entry) => {
    if (typeof entry !== "string") return { name: (entry as any).name ?? "", url: (entry as any).url ?? "" };
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
    const criteriaMap = new Map<string, { criteriaId: string; items: { subCriteriaName: string; comment: string }[]; fallbackScore?: number }>();
    for (const item of entry.items) {
      const cName = item.criteriaName || "Chung";
      const cId = item.criteriaId || "";
      if (!criteriaMap.has(cName)) criteriaMap.set(cName, { criteriaId: cId, items: [], fallbackScore: item.score });
      criteriaMap.get(cName)!.items.push({
        subCriteriaName: item.subCriteriaName || "",
        comment: item.comment ?? "",
      });
    }
    const criteria = Array.from(criteriaMap.entries()).map(([criteriaName, data]) => {
      // Primary: criteriaRatings[criteriaId] (web format)
      // Fallback: items[].score (mobile format — score per item, same across sub-criteria of one criteria)
      const rating = entry.criteriaRatings?.[data.criteriaId] ?? data.fallbackScore ?? undefined;
      return {
        criteriaName,
        items: data.items,
        ...(rating != null && rating > 0 ? { rating } : {}),
      };
    });
    result.push({ teacherName: entry.teacherName || "Giáo viên", criteria });
  }
  return result;
}

async function getCenter(): Promise<string | null> {
  try {
    const [row] = await db.select({ centerUrl: centerConfig.centerUrl }).from(centerConfig).limit(1);
    return row?.centerUrl || null;
  } catch {
    return null;
  }
}

export function registerMobileRoutes(app: Express) {

  // ── POST /api/mobile/auth/zalo ────────────────────────────────────────────
  // PUBLIC endpoint — Mini App gọi trực tiếp, không cần secret
  // Body: { accessToken: string }  (Zalo access token từ ZMP SDK)
  // Response: { token, center, needsOnboarding, studentId?, fullName?, userType? }
  app.post("/api/mobile/auth/zalo", async (req, res) => {
    const { accessToken } = req.body as { accessToken?: string };

    if (!accessToken || typeof accessToken !== "string") {
      return res.status(400).json({ error: "Thiếu accessToken" });
    }

    try {
      const result = await resolveZaloAuth(accessToken);
      return res.status(200).json(result);
    } catch (err: any) {
      const status = err.statusCode ?? 500;
      const message = status === 401 ? "Token Zalo không hợp lệ" : "Lỗi server nội bộ";
      console.error("[Mobile] /auth/zalo lỗi:", err.message);
      return res.status(status).json({ error: message });
    }
  });

  // ── POST /api/mobile/auth/login ───────────────────────────────────────────
  // Public endpoint — đăng nhập bằng username/password
  // Response: { token, center, needsOnboarding, user, userType, profile }
  app.post("/api/mobile/auth/login", (req, res, next) => {
    passport.authenticate("local", async (err: any, user: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: "Tên đăng nhập hoặc mật khẩu không đúng" });

      req.logIn(user, async (loginErr) => {
        if (loginErr) return next(loginErr);

        try {
          const tokenPayload = { id: user.id, username: user.username, isActive: user.isActive };
          const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
          // Trả về URL của server nhận request — đảm bảo mobile app gọi đúng server (dev hoặc prod)
          const requestOrigin = `${req.protocol}://${req.get("host")}`;
          const dbCenter = await getCenter();
          const center = requestOrigin || dbCenter;

          // Xác định loại người dùng
          const [staffRecord] = await db
            .select({ id: staff.id, fullName: staff.fullName, code: staff.code })
            .from(staff)
            .where(eq(staff.userId, user.id))
            .limit(1);

          if (staffRecord) {
            return res.status(200).json({
              token,
              center,
              needsOnboarding: false,
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
              center,
              needsOnboarding: false,
              user: { id: user.id, username: user.username, isActive: user.isActive },
              userType: studentRecord.type === "Phụ huynh" ? "parent" : "student",
              profile: studentRecord,
            });
          }

          // Fallback: tài khoản không gắn với staff hay student
          return res.status(200).json({
            token,
            center,
            needsOnboarding: false,
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
          onlineLink: classes.onlineLink,
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

      const sessions: any[] = rows.map((row) => {
        const linked = studentMap.get(row.studentId);
        return {
          classSessionId: row.classSessionId,
          studentSessionId: row.studentSessionId,
          sessionDate: toISODate(row.sessionDate),
          sessionIndex: row.sessionIndex,
          weekday: row.weekday,
          className: row.className,
          classCode: row.classCode,
          onlineLink: row.onlineLink ?? null,
          locationId: row.locationId ?? null,
          locationName: row.locationId ? (locationMap[row.locationId] ?? null) : null,
          startTime: row.startTime,
          endTime: row.endTime,
          learningFormat: row.learningFormat,
          sessionStatus: row.sessionStatus,
          teacherNames: (row.teacherIds ?? []).map((id) => teacherMap[id]).filter(Boolean),
          attendanceStatus: row.attendanceStatus,
          student: {
            id: row.studentId,
            name: linked?.fullName ?? null,
            code: linked?.code ?? null,
          },
          isParent: ctx.isParent,
        };
      });

      // Merge test sessions (từ bảng test_sessions riêng)
      const tsResult = await pool.query(
        `SELECT ts.id, ts.title, ts.location_id, ts.test_date::text AS test_date, ts.time_start, ts.time_end, ts.student_ids
         FROM test_sessions ts
         WHERE ts.test_date >= $1::date AND ts.test_date <= $2::date
           AND ts.student_ids && $3::uuid[]
         ORDER BY ts.test_date, ts.time_start`,
        [dateFrom, dateTo, ctx.studentIds]
      );
      for (const ts of tsResult.rows as any[]) {
        const weekday = new Date(ts.test_date + "T00:00:00").getDay();
        const matchingStudentIds = ctx.studentIds.filter((id: string) => (ts.student_ids || []).includes(id));
        for (const sid of matchingStudentIds) {
          const linked = studentMap.get(sid);
          sessions.push({
            classSessionId: ts.id,
            studentSessionId: null,
            sessionDate: toISODate(ts.test_date),
            sessionIndex: null,
            weekday,
            className: ts.title,
            classCode: "TEST",
            onlineLink: null,
            locationName: ts.location_id ? (locationMap[ts.location_id] ?? null) : null,
            startTime: ts.time_start || "",
            endTime: ts.time_end || "",
            learningFormat: "offline",
            sessionStatus: "scheduled",
            teacherNames: [],
            attendanceStatus: null,
            student: { id: sid, name: linked?.fullName ?? null, code: linked?.code ?? null },
            isParent: ctx.isParent,
            isTestSession: true,
          });
        }
      }

      const datesWithSessions = [...new Set(sessions.map((s) => s.sessionDate))].sort();
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

      // Merge test session dates
      const tsMonthResult = await pool.query(
        `SELECT DISTINCT ts.test_date::text AS test_date
         FROM test_sessions ts
         WHERE ts.test_date >= $1::date AND ts.test_date <= $2::date
           AND ts.student_ids && $3::uuid[]`,
        [dateFrom, dateTo, ctx.studentIds]
      );
      const testDates = (tsMonthResult.rows as any[]).map((r) => toISODate(r.test_date) as string);

      const datesWithSessions = [...new Set([...rows.map((r) => r.sessionDate as string), ...testDates])].sort();

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
          onlineLink: classes.onlineLink,
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
            onlineLink: row.onlineLink ?? null,
            locationId: row.locationId ?? null,
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

      // Merge test sessions for this day
      const tsDayResult = await pool.query(
        `SELECT ts.id, ts.title, ts.test_date::text AS test_date, ts.time_start, ts.time_end,
                ts.teacher_ids, ts.student_ids, ts.location_id,
                ts.assignment_ids, ts.exam_ids, ts.content_settings
         FROM test_sessions ts
         WHERE ts.test_date = $1::date
           AND ts.student_ids && $2::uuid[]
         ORDER BY ts.time_start`,
        [date, ctx.studentIds]
      );

      for (const ts of tsDayResult.rows as any[]) {
        const weekday = new Date(ts.test_date + "T00:00:00").getDay();
        const matchingStudentIds = ctx.studentIds.filter((id: string) => (ts.student_ids || []).includes(id));

        // Build teacher names
        const tsTeacherMap = await buildTeacherMap([ts.teacher_ids ?? []]);
        const teacherNames = (ts.teacher_ids ?? []).map((id: string) => tsTeacherMap[id]).filter(Boolean);

        // Resolve location name
        let tsLocationName: string | null = null;
        if (ts.location_id) {
          const [locRow] = await db.select({ name: locations.name }).from(locations).where(eq(locations.id, ts.location_id)).limit(1);
          tsLocationName = locRow?.name ?? null;
        }

        // Build general contents (assignments + exams)
        const assignmentIds: string[] = ts.assignment_ids ?? [];
        const examIdsArr: string[] = ts.exam_ids ?? [];
        const contentSettings: Record<string, { availableAt?: string; maxAttempts?: number }> = (ts.content_settings as any) ?? {};
        const generalContents: any[] = [];

        if (assignmentIds.length > 0) {
          const assignResult = await pool.query(
            `SELECT id, title, type, content FROM course_program_contents WHERE id = ANY($1::uuid[])`,
            [assignmentIds]
          );
          for (const a of assignResult.rows as any[]) {
            const cfg = contentSettings[a.id] ?? {};
            generalContents.push({ id: a.id, type: a.type ?? "Bài tập về nhà", title: a.title, description: a.content ?? null, resourceUrl: null, attachments: [], availableAt: cfg.availableAt ?? null, maxAttempts: cfg.maxAttempts ?? null });
          }
        }
        if (examIdsArr.length > 0) {
          const examResult = await pool.query(
            `SELECT id, name, code FROM exams WHERE id = ANY($1::uuid[])`,
            [examIdsArr]
          );
          for (const e of examResult.rows as any[]) {
            const cfg = contentSettings[e.id] ?? {};
            generalContents.push({ id: e.id, type: "Bài kiểm tra", title: e.name ?? e.code ?? "Đề thi", description: null, resourceUrl: e.id, attachments: [], availableAt: cfg.availableAt ?? null, maxAttempts: cfg.maxAttempts ?? null });
          }
        }

        for (const sid of matchingStudentIds) {
          const linked = studentMap.get(sid);
          sessionsWithContent.push({
            classSessionId: ts.id,
            studentSessionId: null,
            sessionDate: toISODate(ts.test_date),
            sessionIndex: null,
            weekday,
            className: ts.title,
            classCode: "TEST",
            onlineLink: null,
            locationId: ts.location_id ?? null,
            locationName: tsLocationName,
            startTime: ts.time_start || "",
            endTime: ts.time_end || "",
            learningFormat: "offline",
            sessionStatus: "scheduled",
            teacherNames,
            attendanceStatus: null,
            attendanceNote: null,
            reviewPublished: false,
            reviewData: [],
            generalContents,
            personalContents: [],
            student: { id: sid, name: linked?.fullName ?? null, code: linked?.code ?? null },
            isParent: ctx.isParent,
            enrolledCount: (ts.student_ids || []).length,
            isTestSession: true,
            onlineClickedAt: null,
            onlineEndedAt: null,
          });
        }
      }

      // Sort all sessions by startTime
      sessionsWithContent.sort((a, b) => (a.startTime > b.startTime ? 1 : -1));

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
          onlineLink: classes.onlineLink,
          locationId: classes.locationId,
          attendanceStatus: studentSessions.attendanceStatus,
          attendanceNote: studentSessions.attendanceNote,
          reviewData: studentSessions.reviewData,
          reviewPublished: studentSessions.reviewPublished,
          onlineClickedAt: studentSessions.onlineClickedAt,
          onlineEndedAt: studentSessions.onlineEndedAt,
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
        // Fallback: kiểm tra xem có phải buổi kiểm tra TEST không
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
        const teacherMap = await buildTeacherMap([ts.teacher_ids ?? []]);
        const teacherNames = (ts.teacher_ids ?? []).map((id: string) => teacherMap[id]).filter(Boolean);

        const assignmentIds: string[] = ts.assignment_ids ?? [];
        const examIdsArr: string[] = ts.exam_ids ?? [];
        const contentSettings: Record<string, { availableAt?: string; maxAttempts?: number }> = (ts.content_settings as any) ?? {};
        const generalContents: any[] = [];

        if (assignmentIds.length > 0) {
          const assignResult = await pool.query(
            `SELECT id, title, type, content FROM course_program_contents WHERE id = ANY($1::uuid[])`,
            [assignmentIds]
          );
          for (const a of assignResult.rows) {
            const cfg = contentSettings[a.id] ?? {};
            generalContents.push({ id: a.id, type: a.type ?? "Bài tập về nhà", title: a.title, description: a.content ?? null, resourceUrl: null, attachments: [], availableAt: cfg.availableAt ?? null, maxAttempts: cfg.maxAttempts ?? null });
          }
        }
        if (examIdsArr.length > 0) {
          const examResult = await pool.query(
            `SELECT id, name, code FROM exams WHERE id = ANY($1::uuid[])`,
            [examIdsArr]
          );
          for (const e of examResult.rows) {
            const cfg = contentSettings[e.id] ?? {};
            generalContents.push({ id: e.id, type: "Bài kiểm tra", title: e.name ?? e.code ?? "Đề thi", description: null, resourceUrl: e.id, attachments: [], availableAt: cfg.availableAt ?? null, maxAttempts: cfg.maxAttempts ?? null });
          }
        }

        let tsLocationName: string | null = null;
        if (ts.location_id) {
          const [locRow] = await db.select({ name: locations.name }).from(locations).where(eq(locations.id, ts.location_id)).limit(1);
          tsLocationName = locRow?.name ?? null;
        }

        const targetSid = requestedStudentId && ctx.studentIds.includes(requestedStudentId) ? requestedStudentId : ctx.studentIds[0];
        const linkedStudent = ctx.linkedStudents.find((s) => s.id === targetSid);
        return res.json({
          classSessionId: ts.id,
          studentSessionId: null,
          sessionDate: toISODate(ts.test_date),
          sessionIndex: null,
          weekday,
          className: ts.title,
          classCode: "TEST",
          onlineLink: null,
          locationName: tsLocationName,
          startTime: ts.time_start || "",
          endTime: ts.time_end || "",
          learningFormat: "offline",
          sessionStatus: "scheduled",
          teacherNames,
          attendanceStatus: null,
          attendanceNote: null,
          enrolledCount: (ts.student_ids || []).length,
          reviewPublished: false,
          reviewData: [],
          generalContents,
          personalContents: [],
          student: { id: targetSid, name: linkedStudent?.fullName ?? null, code: linkedStudent?.code ?? null },
          isParent: ctx.isParent,
          isTestSession: true,
          onlineClickedAt: null,
          onlineEndedAt: null,
        });
      }

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

      let onlineRule: { earlyEntryMinutes: number; lateEntryMinutes: number; earlyEndMinutes: number } | null = null;
      if (row.locationId) {
        const [rule] = await db
          .select({
            earlyEntryMinutes: onlineLearningRules.earlyEntryMinutes,
            lateEntryMinutes: onlineLearningRules.lateEntryMinutes,
            earlyEndMinutes: onlineLearningRules.earlyEndMinutes,
          })
          .from(onlineLearningRules)
          .where(eq(onlineLearningRules.locationId, row.locationId))
          .limit(1);
        onlineRule = rule ?? null;
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
        onlineLink: row.onlineLink ?? null,
        locationId: row.locationId ?? null,
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
        onlineClickedAt: row.onlineClickedAt ? new Date(row.onlineClickedAt).toISOString() : null,
        onlineEndedAt: row.onlineEndedAt ? new Date(row.onlineEndedAt).toISOString() : null,
        onlineRule,
      });
    } catch (err: any) {
      console.error("[Mobile] student/session detail error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải chi tiết buổi học" });
    }
  });

  // ── POST /api/mobile/student/session/:classSessionId/online-click ─────────
  // Ghi nhận học viên bấm vào link học online
  app.post("/api/mobile/student/session/:classSessionId/online-click", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const ctx = await getMobileStudentContext(user.id);
      if (!ctx) return res.status(403).json({ message: "Tài khoản không phải học viên" });

      const { classSessionId } = req.params;
      const requestedStudentId = req.query.studentId as string | undefined;
      const targetStudentIds = requestedStudentId && ctx.studentIds.includes(requestedStudentId)
        ? [requestedStudentId]
        : ctx.studentIds;

      const [ss] = await db
        .select({ id: studentSessions.id, onlineEndedAt: studentSessions.onlineEndedAt })
        .from(studentSessions)
        .where(and(
          inArray(studentSessions.studentId, targetStudentIds),
          eq(studentSessions.classSessionId, classSessionId)
        ))
        .limit(1);

      if (!ss) return res.status(404).json({ message: "Không tìm thấy buổi học" });
      if (ss.onlineEndedAt) return res.status(400).json({ message: "Buổi học online đã kết thúc" });

      const now = new Date();
      await db.update(studentSessions).set({ onlineClickedAt: now }).where(eq(studentSessions.id, ss.id));
      res.json({ onlineClickedAt: now.toISOString() });
    } catch (err: any) {
      console.error("[Mobile] online-click error:", err);
      res.status(500).json({ message: err.message || "Lỗi ghi nhận vào học online" });
    }
  });

  // ── POST /api/mobile/student/session/:classSessionId/online-end ───────────
  // Ghi nhận học viên kết thúc học online
  app.post("/api/mobile/student/session/:classSessionId/online-end", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const ctx = await getMobileStudentContext(user.id);
      if (!ctx) return res.status(403).json({ message: "Tài khoản không phải học viên" });

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
      await db.update(studentSessions).set({ onlineEndedAt: now }).where(eq(studentSessions.id, ss.id));
      res.json({ onlineEndedAt: now.toISOString() });
    } catch (err: any) {
      console.error("[Mobile] online-end error:", err);
      res.status(500).json({ message: err.message || "Lỗi ghi nhận kết thúc học online" });
    }
  });

  // ── GET /api/mobile/online-learning-rules ────────────────────────────────
  // Trả về cấu hình thời gian mở nút học online theo từng cơ sở (locationId)
  // Mobile dùng để tính canJoin / canEnd cho button link học online
  app.get("/api/mobile/online-learning-rules", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const rules = await db
        .select({
          id: onlineLearningRules.id,
          locationId: onlineLearningRules.locationId,
          earlyEntryMinutes: onlineLearningRules.earlyEntryMinutes,
          lateEntryMinutes: onlineLearningRules.lateEntryMinutes,
          earlyEndMinutes: onlineLearningRules.earlyEndMinutes,
        })
        .from(onlineLearningRules);

      res.json(rules);
    } catch (err: any) {
      console.error("[Mobile] online-learning-rules error:", err);
      res.status(500).json({ message: err.message || "Lỗi tải cấu hình học online" });
    }
  });

  // ── POST /api/mobile/test-content-attempt ────────────────────────────────
  // Kiểm tra + ghi nhận lượt làm bài trong buổi kiểm tra TEST
  app.post("/api/mobile/test-content-attempt", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const ctx = await getMobileStudentContext(user.id);
      if (!ctx || ctx.studentIds.length === 0) return res.status(403).json({ message: "Tài khoản không phải học viên" });

      const { testSessionId, contentId, contentType, studentId: reqStudentId } = req.body;
      if (!testSessionId || !contentId) return res.status(400).json({ message: "Thiếu testSessionId hoặc contentId" });

      const studentId = (reqStudentId && ctx.studentIds.includes(reqStudentId))
        ? reqStudentId
        : ctx.selfStudentId ?? ctx.studentIds[0];
      if (!studentId) return res.status(403).json({ message: "Không xác định được học viên" });

      const tsRes = await pool.query(
        `SELECT content_settings, student_ids FROM test_sessions WHERE id = $1 LIMIT 1`,
        [testSessionId]
      );
      if (tsRes.rows.length === 0) return res.status(404).json({ message: "Không tìm thấy buổi test" });
      const cfg = ((tsRes.rows[0].content_settings as any) ?? {})[contentId] ?? {};
      const maxAttempts: number | null = cfg.maxAttempts ?? null;

      const attRes = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM test_session_content_attempts
         WHERE test_session_id = $1 AND student_id = $2 AND content_id = $3`,
        [testSessionId, studentId, contentId]
      );
      const attemptsUsed: number = attRes.rows[0]?.cnt ?? 0;

      if (maxAttempts !== null && maxAttempts > 0 && attemptsUsed >= maxAttempts) {
        return res.json({ allowed: false, attemptsUsed, maxAttempts });
      }

      await pool.query(
        `INSERT INTO test_session_content_attempts (test_session_id, student_id, content_id, content_type)
         VALUES ($1, $2, $3, $4)`,
        [testSessionId, studentId, contentId, contentType ?? "assignment"]
      );

      return res.json({ allowed: true, attemptsUsed: attemptsUsed + 1, maxAttempts });
    } catch (err: any) {
      console.error("[Mobile] test-content-attempt error:", err);
      return res.status(500).json({ message: err.message });
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
              description: inv.description ?? null,
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
            description: inv.description ?? null,
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

  // ── GET /api/mobile/student/stars ────────────────────────────────────────
  // Tổng số sao của học viên: số sao tích lũy, đã tiêu, còn lại + lịch sử giao dịch
  // Hỗ trợ Phụ huynh — trả dữ liệu từng con riêng biệt
  // Auth: JWT Bearer token
  app.get("/api/mobile/student/stars", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized. Vui lòng đăng nhập và gửi JWT Bearer token." });

      const ctx = await getMobileStudentContext(user.id);
      if (!ctx) return res.status(403).json({ message: "Tài khoản không phải học viên" });
      if (ctx.studentIds.length === 0) {
        return res.json({ earned: 0, spent: 0, available: 0, transactions: [], isParent: ctx.isParent, students: [] });
      }

      const studentMap = new Map(ctx.linkedStudents.map((s) => [s.id, s]));

      // Tính sao tích lũy (từ criteriaRatings trong review_data của từng buổi học)
      const earnedRows = await db.execute(sql`
        SELECT ss.student_id::text,
               COALESCE(SUM((rating_val)::numeric), 0)::int AS earned
        FROM student_sessions ss,
             jsonb_each(ss.review_data) AS teacher_entry(teacher_key, teacher_data),
             jsonb_each(teacher_data->'criteriaRatings') AS rating_entry(criteria_key, rating_val)
        WHERE ss.student_id = ANY(ARRAY[${sql.raw(ctx.studentIds.map(id => `'${id}'`).join(","))}]::uuid[])
          AND ss.review_data IS NOT NULL
          AND jsonb_typeof(ss.review_data) = 'object'
          AND (rating_val)::text ~ '^[0-9]+(\.[0-9]+)?$'
        GROUP BY ss.student_id
      `);

      // Tính sao đã tiêu (delta < 0 trong bảng student_star_transactions)
      const spentRows = await db.execute(sql`
        SELECT student_id::text, COALESCE(SUM(ABS(delta)), 0)::int AS spent
        FROM student_star_transactions
        WHERE student_id = ANY(ARRAY[${sql.raw(ctx.studentIds.map(id => `'${id}'`).join(","))}]::uuid[])
          AND delta < 0
        GROUP BY student_id
      `);

      // Lịch sử giao dịch (chỉ ghi nhận giao dịch tiêu sao; tích sao từ buổi học không có bản ghi riêng)
      const txRows = await db.execute(sql`
        SELECT id::text, student_id::text, delta, reason, receipt_id::text, receipt_code, created_at
        FROM student_star_transactions
        WHERE student_id = ANY(ARRAY[${sql.raw(ctx.studentIds.map(id => `'${id}'`).join(","))}]::uuid[])
        ORDER BY created_at DESC
        LIMIT 100
      `);

      const earnedMap: Record<string, number> = {};
      for (const r of earnedRows.rows as any[]) earnedMap[r.student_id] = Number(r.earned ?? 0);
      const spentMap: Record<string, number> = {};
      for (const r of spentRows.rows as any[]) spentMap[r.student_id] = Number(r.spent ?? 0);

      // Tổng hợp theo từng học viên (dành cho phụ huynh có nhiều con)
      const studentsData = ctx.linkedStudents.map((s) => {
        const earned = earnedMap[s.id] ?? 0;
        const spent = spentMap[s.id] ?? 0;
        return {
          id: s.id,
          name: s.fullName,
          code: s.code,
          earned,
          spent,
          available: Math.max(0, earned - spent),
        };
      });

      // Tổng cộng tất cả học viên
      const totalEarned = studentsData.reduce((sum, s) => sum + s.earned, 0);
      const totalSpent = studentsData.reduce((sum, s) => sum + s.spent, 0);
      const totalAvailable = studentsData.reduce((sum, s) => sum + s.available, 0);

      const transactions = (txRows.rows as any[]).map((r) => {
        const stu = studentMap.get(r.student_id);
        return {
          id: r.id,
          studentId: r.student_id,
          studentName: stu?.fullName ?? null,
          delta: Number(r.delta),
          reason: r.reason ?? null,
          receiptId: r.receipt_id ?? null,
          receiptCode: r.receipt_code ?? null,
          createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        };
      });

      res.json({
        earned: totalEarned,
        spent: totalSpent,
        available: totalAvailable,
        transactions,
        isParent: ctx.isParent,
        students: ctx.isParent ? studentsData : [],
      });
    } catch (err: any) {
      console.error("[Mobile] student/stars error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải dữ liệu sao" });
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

      const {
        month,
        dateFrom: qDateFrom,
        dateTo: qDateTo,
        status: qStatus,
        className: qClassName,
        itemType: qItemType,
        page: qPage,
        pageSize: qPageSize,
      } = req.query as {
        month?: string;
        dateFrom?: string;
        dateTo?: string;
        status?: string;    // "all" | "submitted" | "pending"
        className?: string;
        itemType?: string;  // "all" | "BTVN" | "exam"
        page?: string;
        pageSize?: string;
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

      function parseAttachments(raw: Array<string | { name: string; url: string }> | null): { name: string; url: string }[] {
        if (!raw || raw.length === 0) return [];
        return raw.map((entry) => {
          // Dữ liệu cũ trong DB có thể là object {name, url} (mobile gửi trước khi chuẩn hoá)
          if (typeof entry !== "string") return { name: (entry as any).name ?? "", url: (entry as any).url ?? "" };
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
          homeworkDueDate: sessionContents.dueDate,
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
          dueDate: r.homeworkDueDate ? (() => { try { const d = r.homeworkDueDate instanceof Date ? r.homeworkDueDate : new Date(r.homeworkDueDate as any); return isNaN(d.getTime()) ? null : d.toISOString(); } catch { return null; } })() : null,
          examId: null as string | null,
          maxAttempts: null as number | null,
          attemptsUsed: null as number | null,
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
          classId: classes.id,
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
        .where(and(
          inArray(studentSessions.studentId, ctx.studentIds),
          gte(classSessions.sessionDate, dateFrom),
          lte(classSessions.sessionDate, dateTo)
        ))
        .orderBy(classSessions.sessionDate, shiftTemplates.startTime);

      // Deduplicate: keep MOST RECENT submission per (classSessionId, examContentId, studentId)
      const examDeduped = new Map<string, typeof examRows[0]>();
      for (const r of examRows) {
        const key = `${r.classSessionId}:${r.examContentId}:${r.studentId}`;
        const existing = examDeduped.get(key);
        if (!existing) {
          examDeduped.set(key, r);
        } else if (r.submissionId && !existing.submissionId) {
          examDeduped.set(key, r);
        } else if (r.submissionId && existing.submissionId) {
          const rTime = r.submittedAt ? new Date(r.submittedAt).getTime() : 0;
          const eTime = existing.submittedAt ? new Date(existing.submittedAt).getTime() : 0;
          if (rTime >= eTime) examDeduped.set(key, r);
        }
      }

      const examResultBase = [...examDeduped.values()].map((r) => {
        const linked = studentMap.get(r.studentId);
        return {
          itemType: "Bài kiểm tra" as const,
          classSessionId: r.classSessionId,
          classId: r.classId,
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
          score: r.submissionScore ?? r.submissionScoreRaw ?? null,
          comment: r.submissionComment ?? null,
          submittedAt: r.submittedAt ? new Date(r.submittedAt).toISOString() : null,
          dueDate: null as string | null,
          examId: r.examResourceUrl || r.examContentId,
          maxAttempts: null as number | null,
          attemptsUsed: null as number | null,
          _examUuid: r.examResourceUrl,
          student: {
            id: r.studentId ?? null,
            name: linked?.fullName ?? null,
            code: linked?.code ?? null,
          },
          isParent: ctx.isParent,
        };
      });

      // Batch-fetch maxAttempts and attemptsUsed
      const examUuids = [...new Set(examResultBase.map((r) => r._examUuid).filter(Boolean))] as string[];
      if (examUuids.length > 0) {
        const [maxRows, attRows] = await Promise.all([
          pool.query(`SELECT id::text, max_attempts FROM exams WHERE id::text = ANY($1)`, [examUuids]),
          pool.query(
            `SELECT exam_id::text, student_id::text, COUNT(*)::int AS cnt
             FROM exam_submissions
             WHERE exam_id::text = ANY($1) AND student_id = ANY($2::uuid[])
             GROUP BY exam_id, student_id`,
            [examUuids, ctx.studentIds]
          ),
        ]);
        const maxAttMap = new Map<string, number | null>(maxRows.rows.map((r: any) => [r.id, r.max_attempts]));
        const attMap = new Map<string, number>(attRows.rows.map((r: any) => [`${r.exam_id}:${r.student_id}`, r.cnt]));
        for (const r of examResultBase) {
          if (r._examUuid) {
            r.maxAttempts = maxAttMap.get(r._examUuid) ?? null;
            r.attemptsUsed = attMap.get(`${r._examUuid}:${r.student?.id}`) ?? 0;
          }
        }
      }

      const examResult = examResultBase.map(({ _examUuid, ...r }) => r);

      let allRows = [...homeworkResult, ...examResult].sort((a, b) => {
        const d = a.sessionDate.localeCompare(b.sessionDate);
        return d !== 0 ? d : a.startTime.localeCompare(b.startTime);
      });

      // Server-side filters
      if (qStatus === "submitted") allRows = allRows.filter((r) => r.submissionStatus === "submitted");
      else if (qStatus === "pending") allRows = allRows.filter((r) => r.submissionStatus === "pending");
      if (qItemType === "BTVN") allRows = allRows.filter((r) => r.itemType === "BTVN");
      else if (qItemType === "exam") allRows = allRows.filter((r) => r.itemType === "Bài kiểm tra");
      if (qClassName) allRows = allRows.filter((r) => r.className?.toLowerCase() === qClassName.toLowerCase());

      // Server-side pagination
      const total = allRows.length;
      const page = Math.max(1, parseInt(qPage ?? "1", 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(qPageSize ?? "50", 10)));
      const totalPages = Math.ceil(total / pageSize);
      const rows = allRows.slice((page - 1) * pageSize, page * pageSize);

      res.json({ rows, total, page, pageSize, totalPages, month: monthStr });
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

      const { homeworkId, submissionContent, submissionAttachments: rawAttachments } = req.body as {
        homeworkId: string;
        submissionContent?: string;
        submissionAttachments?: Array<string | { name: string; url: string }>;
      };

      if (!homeworkId) return res.status(400).json({ message: "homeworkId là bắt buộc" });

      // Normalize: accept both ["name||url"] strings và [{ name, url }] objects
      const submissionAttachments: string[] = (rawAttachments ?? []).map((item) => {
        if (typeof item === "string") return item;
        return `${item.name}||${item.url}`;
      });

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
            submissionAttachments: submissionAttachments,
          })
          .where(eq(studentSessionContents.id, existing[0].id));
      } else {
        await db.insert(studentSessionContents).values({
          sessionContentId: homeworkId,
          studentId: studentRecord.id,
          status: "submitted",
          submissionContent: submissionContent || null,
          submissionAttachments: submissionAttachments,
        });
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("[Mobile] student/assignments/submit error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi nộp bài tập" });
    }
  });

  // ── GET /api/mobile/student/exam/:examId/attempt-count ───────────────────
  // Kiểm tra số lần làm bài và giới hạn của một đề thi
  // Query params:
  //   classId (optional) — scope theo lớp cụ thể
  app.get("/api/mobile/student/exam/:examId/attempt-count", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const ctx = await getMobileStudentContext(user.id);
      if (!ctx) return res.status(403).json({ message: "Tài khoản không phải học viên" });

      const { examId } = req.params;
      const requestedStudentId = req.query.studentId as string | undefined;
      const classId = req.query.classId as string | undefined;

      const targetStudentId = requestedStudentId && ctx.studentIds.includes(requestedStudentId)
        ? requestedStudentId
        : ctx.studentIds[0];

      if (!targetStudentId) return res.status(404).json({ message: "Không tìm thấy học viên" });

      const [exam] = await db
        .select({ maxAttempts: exams.maxAttempts })
        .from(exams)
        .where(eq(exams.id, examId))
        .limit(1);

      if (!exam) return res.status(404).json({ message: "Không tìm thấy đề thi" });

      const conditions: any[] = [
        eq(examSubmissions.examId, examId),
        eq(examSubmissions.studentId, targetStudentId),
      ];
      if (classId) conditions.push(eq(examSubmissions.classId, classId));

      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(examSubmissions)
        .where(and(...conditions));

      res.json({ count: result?.count ?? 0, maxAttempts: exam.maxAttempts });
    } catch (err: any) {
      console.error("[Mobile] exam/attempt-count error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi kiểm tra lượt làm bài" });
    }
  });

  // ── GET /api/mobile/student/score-sheet ─────────────────────────────────
  // Trả về tất cả bảng điểm đã published của học viên (hoặc con em nếu là phụ huynh).
  // Auth: JWT Bearer token
  // Query params:
  //   classId   — lọc theo lớp cụ thể (UUID)
  //   month     — lọc theo tháng YYYY-MM (theo session_date của buổi học)
  //   dateFrom  — lọc từ ngày YYYY-MM-DD (ưu tiên hơn month)
  //   dateTo    — lọc đến ngày YYYY-MM-DD
  //   page      — trang (mặc định 1)
  //   pageSize  — số bản ghi mỗi trang (mặc định 20, tối đa 100)
  // Response: { items, total, page, pageSize, totalPages }
  app.get("/api/mobile/student/score-sheet", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized. Vui lòng đăng nhập và gửi JWT Bearer token." });

      const ctx = await getMobileStudentContext(user.id);
      if (!ctx) return res.status(403).json({ message: "Tài khoản không phải học viên" });
      if (ctx.studentIds.length === 0) return res.json({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });

      const {
        classId: qClassId,
        month: qMonth,
        dateFrom: qDateFrom,
        dateTo: qDateTo,
        page: qPage,
        pageSize: qPageSize,
      } = req.query as {
        classId?: string;
        month?: string;
        dateFrom?: string;
        dateTo?: string;
        page?: string;
        pageSize?: string;
      };

      // Tính khoảng ngày nếu có filter
      let dateFrom: string | null = null;
      let dateTo: string | null = null;
      if (qDateFrom && qDateTo) {
        dateFrom = qDateFrom;
        dateTo = qDateTo;
      } else if (qMonth) {
        const [y, m] = qMonth.split("-").map(Number);
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 0);
        dateFrom = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
        dateTo = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
      }

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
              cs.weekday AS weekday,
              sht.start_time AS start_time,
              sht.end_time AS end_time,
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
            LEFT JOIN shift_templates sht ON sht.id = cs.shift_template_id
            LEFT JOIN users cu ON cu.id = gb.created_by
            LEFT JOIN staff st ON st.user_id = gb.created_by
            WHERE gb.published = TRUE
              ${qClassId ? sql`AND gb.class_id = ${qClassId}::uuid` : sql``}
              ${dateFrom && dateTo ? sql`AND (cs.session_date IS NULL OR (cs.session_date >= ${dateFrom} AND cs.session_date <= ${dateTo}))` : sql``}
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

          return result.rows.map((row: any) => {
            const rawDate = row.session_date instanceof Date
              ? `${row.session_date.getFullYear()}-${String(row.session_date.getMonth() + 1).padStart(2, "0")}-${String(row.session_date.getDate()).padStart(2, "0")}`
              : row.session_date;
            return {
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
              sessionIndex: row.session_index ?? null,
              sessionDate: toISODate(rawDate),
              weekday: row.weekday ?? null,
              startTime: row.start_time ?? null,
              endTime: row.end_time ?? null,
              scores: row.scores ?? [],
              teacherComment: row.teacher_comment ?? null,
              createdByName: row.created_by_name ?? null,
              student: {
                id: linkedStudent.id,
                name: linkedStudent.fullName ?? null,
                code: linkedStudent.code ?? null,
              },
              isParent: ctx.isParent,
            };
          });
        })
      );

      let items = allResults
        .flat()
        .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());

      const total = items.length;
      const page = Math.max(1, parseInt(qPage ?? "1", 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(qPageSize ?? "20", 10)));
      const totalPages = Math.ceil(total / pageSize);
      items = items.slice((page - 1) * pageSize, page * pageSize);

      res.json({ items, total, page, pageSize, totalPages });
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

      // 2. Lấy phiếu chi lương theo 2 nguồn (giống web /api/my-space/invoices):
      //    a) subjectName LIKE '[STAFF_CODE]%' hoặc 'STAFF_CODE -%' (format cũ / gắn trực tiếp)
      //    b) salaryTableId có trong bảng lương đã publish
      const selectFields = {
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
      };

      const subjectPatternBracket = `[${staffRecord.code}]%`;
      const subjectPatternDash = `${staffRecord.code} -%`;

      const subjectConditions: any[] = [
        sql`${invoices.subjectName} LIKE ${subjectPatternBracket}`,
        sql`${invoices.subjectName} LIKE ${subjectPatternDash}`,
      ];
      if (salaryTableIds.length > 0) {
        subjectConditions.push(inArray(invoices.salaryTableId as any, salaryTableIds));
      }

      const invoiceRows = await db
        .select(selectFields)
        .from(invoices)
        .where(or(...subjectConditions))
        .orderBy(desc(invoices.createdAt));

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
              description: inv.description ?? null,
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
            description: inv.description ?? null,
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

  // ── GET /api/mobile/staff/payroll/published-rows ─────────────────────────
  // Bảng lương đứng lớp — danh sách buổi dạy theo lớp/bảng lương đã publish
  app.get("/api/mobile/staff/payroll/published-rows", async (req, res) => {
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

      return res.json(result);
    } catch (err: any) {
      console.error("[Mobile] staff/payroll/published-rows error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải bảng lương đứng lớp" });
    }
  });

  // ── GET /api/mobile/staff/payroll/salary-summary ──────────────────────────
  // Tổng lương đứng lớp đã tính sẵn — không cần client tự tính
  app.get("/api/mobile/staff/payroll/salary-summary", async (req, res) => {
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
      const { getTeacherSalaryPackages } = await import("../storage/teacher-salary-packages.storage");

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
        if (!publishedClassIds.has(r.salaryTableId)) publishedClassIds.set(r.salaryTableId, new Set());
        publishedClassIds.get(r.salaryTableId)!.add(r.classId);
      }

      const salaryConfigRows = await db
        .select({ courseId: staffSalaryConfigs.courseId, salaryPackageId: staffSalaryConfigs.salaryPackageId })
        .from(staffSalaryConfigs)
        .where(eq(staffSalaryConfigs.staffId, staffRecord.id));
      const courseConfigMap = new Map(salaryConfigRows.map((c) => [c.courseId, c.salaryPackageId]));

      type SalaryRange = { from: number; to: number; price: number };
      function findRange(value: number, ranges: SalaryRange[]): number {
        if (!ranges || ranges.length === 0) return 0;
        const match = ranges.find((r) => value >= r.from && value <= r.to);
        return match ? match.price : 0;
      }
      function calcSalary(sessions: any[], pkg: any): number {
        const eligibleSessions = sessions.filter((s: any) => s.isEligible);
        const ranges = (pkg.ranges as SalaryRange[] | null) ?? [];
        switch (pkg.type) {
          case "theo-gio":
            return eligibleSessions.reduce((sum: number, s: any) => sum + s.durationHours * Number(pkg.unitPrice || 0), 0);
          case "theo-buoi":
            return eligibleSessions.length * Number(pkg.unitPrice || 0);
          case "theo-so-hv":
            return eligibleSessions.reduce((sum: number, s: any) => {
              if (ranges.length > 0) return sum + s.attendedCount * findRange(s.attendedCount, ranges);
              return sum + s.attendedCount * Number(pkg.unitPrice || 0);
            }, 0);
          case "tong-so-gio": {
            const totalHours = eligibleSessions.reduce((sum: number, s: any) => sum + s.durationHours, 0);
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
          (r: any) => r.teacherId === staffRecord.id && allowedClasses.has(r.classId)
        );
        const pkgMap = new Map(
          pkgRows.filter((p: any) => p.teacherId === staffRecord.id).map((p: any) => [p.classId, p.packageId])
        );
        const meta = publishedRows.find((r: any) => r.salaryTableId === tableId);

        const classes: any[] = [];
        let grandTotal = 0;
        for (const row of teacherRows) {
          const packageId = pkgMap.get(row.classId)
            ?? (row.courseId ? courseConfigMap.get(row.courseId) : undefined)
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

      return res.json(summaries);
    } catch (err: any) {
      console.error("[Mobile] staff/payroll/salary-summary error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải tổng lương" });
    }
  });

  // ── GET /api/mobile/staff/salary-tables/:id/breakdown ────────────────────
  // Chi tiết bảng lương theo từng lớp và từng buổi dạy — server tính sẵn
  app.get("/api/mobile/staff/salary-tables/:id/breakdown", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const tableId = req.params.id;

      const {
        getTeacherSalaryTable,
        getPublishedRowsForTeacher,
        getTeacherSalaryDetailRows,
        getTeacherSalaryRowPackages,
      } = await import("../storage/teacher-salary.storage");
      const { getTeacherSalaryPackages } = await import("../storage/teacher-salary-packages.storage");

      // 404 nếu bảng lương không tồn tại
      const salaryTable = await getTeacherSalaryTable(tableId);
      if (!salaryTable) {
        return res.status(404).json({ message: "Không tìm thấy bảng lương" });
      }

      // 403 nếu bảng lương không được publish cho staff này
      const publishedRows = await getPublishedRowsForTeacher(staffRecord.id);
      const tableRows = publishedRows.filter((r: any) => r.salaryTableId === tableId);
      if (tableRows.length === 0) {
        return res.status(403).json({ message: "Bạn không có quyền xem bảng lương này" });
      }

      const allowedClassIds = new Set(tableRows.map((r: any) => r.classId));
      const meta = tableRows[0];

      const [detailRows, pkgRows, allPackages] = await Promise.all([
        getTeacherSalaryDetailRows(tableId),
        getTeacherSalaryRowPackages(tableId),
        getTeacherSalaryPackages(),
      ]);

      const packageMap = new Map<string, any>();
      for (const p of allPackages) packageMap.set(p.id, p);

      const pkgMap = new Map(
        pkgRows
          .filter((p: any) => p.teacherId === staffRecord.id)
          .map((p: any) => [p.classId, p.packageId])
      );

      const salaryConfigRows = await db
        .select({ courseId: staffSalaryConfigs.courseId, salaryPackageId: staffSalaryConfigs.salaryPackageId })
        .from(staffSalaryConfigs)
        .where(eq(staffSalaryConfigs.staffId, staffRecord.id));
      const courseConfigMap = new Map(salaryConfigRows.map((c) => [c.courseId, c.salaryPackageId]));

      type SalaryRange = { from: number; to: number; price: number };
      function findRange(value: number, ranges: SalaryRange[]): number {
        if (!ranges || ranges.length === 0) return 0;
        const match = ranges.find((r) => value >= r.from && value <= r.to);
        return match ? match.price : 0;
      }
      function calcSalary(sessions: any[], pkg: any): number {
        const eligible = sessions.filter((s: any) => s.isEligible);
        const ranges = (pkg.ranges as SalaryRange[] | null) ?? [];
        switch (pkg.type) {
          case "theo-gio":
            return eligible.reduce((sum: number, s: any) => sum + s.durationHours * Number(pkg.unitPrice || 0), 0);
          case "theo-buoi":
            return eligible.length * Number(pkg.unitPrice || 0);
          case "theo-so-hv":
            return eligible.reduce((sum: number, s: any) => {
              if (ranges.length > 0) return sum + s.attendedCount * findRange(s.attendedCount, ranges);
              return sum + s.attendedCount * Number(pkg.unitPrice || 0);
            }, 0);
          case "tong-so-gio": {
            const totalHours = eligible.reduce((sum: number, s: any) => sum + s.durationHours, 0);
            return findRange(totalHours, ranges);
          }
          case "tong-so-buoi":
            return findRange(eligible.length, ranges);
          default:
            return 0;
        }
      }

      const teacherRows = detailRows.filter(
        (r: any) => r.teacherId === staffRecord.id && allowedClassIds.has(r.classId)
      );

      let grandTotal = 0;
      const classes = teacherRows.map((row: any) => {
        const packageId =
          pkgMap.get(row.classId) ??
          (row.courseId ? courseConfigMap.get(row.courseId) : undefined) ??
          null;
        const pkg = packageId ? packageMap.get(packageId) : null;
        const totalSalary = pkg ? calcSalary(row.sessions, pkg) : 0;
        const totalEligibleSessions = row.sessions.filter((s: any) => s.isEligible).length;
        grandTotal += totalSalary;

        const sessions = row.sessions.map((s: any) => ({
          sessionDate: s.sessionDate,
          sessionIndex: s.sessionIndex ?? null,
          durationHours: s.durationHours,
          attendedCount: s.attendedCount,
          isEligible: s.isEligible,
          coefficient: s.attendanceCoefficient ?? null,
        }));

        return {
          classId: row.classId,
          className: row.className,
          role: row.role,
          packageId: packageId ?? null,
          packageName: pkg?.name ?? null,
          packageType: pkg?.type ?? null,
          totalEligibleSessions,
          totalSalary,
          sessions,
        };
      });

      return res.json({
        salaryTableId: tableId,
        salaryTableName: meta.salaryTableName ?? "",
        startDate: meta.startDate ?? "",
        endDate: meta.endDate ?? "",
        locationName: meta.locationName ?? null,
        grandTotal,
        classes,
      });
    } catch (err: any) {
      console.error("[Mobile] staff/salary-tables/:id/breakdown error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải chi tiết bảng lương" });
    }
  });

  // ── GET /api/mobile/staff/payroll/attendance ──────────────────────────────
  // Dữ liệu chấm công theo tháng của nhân viên
  app.get("/api/mobile/staff/payroll/attendance", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.json([]);

      const { month, year } = req.query as Record<string, string>;
      if (!month || !year) return res.status(400).json({ message: "Thiếu tham số month hoặc year" });

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

      const mapped = rows.map((r) => {
        const wd = r.workDate;
        let workDateStr: string;
        if (typeof wd === "string") {
          workDateStr = wd.slice(0, 10);
        } else if (wd instanceof Date) {
          const yy = wd.getFullYear();
          const mm2 = String(wd.getMonth() + 1).padStart(2, "0");
          const dd = String(wd.getDate()).padStart(2, "0");
          workDateStr = `${yy}-${mm2}-${dd}`;
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

      return res.json(mapped);
    } catch (err: any) {
      console.error("[Mobile] staff/payroll/attendance error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải chấm công" });
    }
  });

  // ── GET /api/mobile/staff/payroll/hr-summary ──────────────────────────────
  // Bảng lương HR tổng hợp (lương cơ bản, phụ cấp, BHXH, thực nhận...)
  app.get("/api/mobile/staff/payroll/hr-summary", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.json(null);

      const { month, year } = req.query as Record<string, string>;
      if (!month || !year) return res.status(400).json({ message: "Thiếu tham số month hoặc year" });

      const m = String(month).padStart(2, "0");
      const y = String(year);
      const monthStr = `${y}-${m}`;
      const dateFrom = `${y}-${m}-01`;
      const lastDay = new Date(Number(y), Number(month), 0).getDate();
      const dateTo = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;

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
            gte(salarySheets.fromDate, dateFrom),
            lte(salarySheets.fromDate, dateTo),
          )
        )
        .orderBy(salarySheets.createdAt)
        .limit(1);

      if (rows.length === 0) return res.json(null);

      const r = rows[0];
      return res.json({
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
      console.error("[Mobile] staff/payroll/hr-summary error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải bảng lương HR" });
    }
  });

  // ── GET /api/mobile/staff/calendar ────────────────────────────────────────
  // Lịch dạy theo tháng cho giáo viên — bao gồm test_sessions + teacher attendance
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
          onlineLink: classes.onlineLink,
          locationName: locations.name,
          checkInAt: teacherAttendance.checkInAt,
          checkOutAt: teacherAttendance.checkOutAt,
        })
        .from(classSessions)
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .leftJoin(locations, eq(classes.locationId, locations.id))
        .leftJoin(
          teacherAttendance,
          and(
            eq(teacherAttendance.classSessionId, classSessions.id),
            sql`${teacherAttendance.staffId} = ${staffRecord.id}::uuid`
          )
        )
        .where(
          and(
            sql`${classSessions.teacherIds} @> ARRAY[${staffRecord.id}]::uuid[]`,
            gte(classSessions.sessionDate, dateFrom),
            lte(classSessions.sessionDate, dateTo)
          )
        )
        .orderBy(classSessions.sessionDate, shiftTemplates.startTime);

      const sessions: any[] = rows.map((row) => ({
        classSessionId: row.classSessionId,
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
        locationName: row.locationName ?? null,
        checkInAt: row.checkInAt ? new Date(row.checkInAt).toISOString() : null,
        checkOutAt: row.checkOutAt ? new Date(row.checkOutAt).toISOString() : null,
        isTestSession: false,
      }));

      // Merge buổi kiểm tra tập trung
      const tsResult = await pool.query(
        `SELECT ts.id, ts.title, ts.test_date::text AS test_date, ts.time_start, ts.time_end, ts.location_id
         FROM test_sessions ts
         WHERE ts.test_date >= $1::date AND ts.test_date <= $2::date
           AND ts.teacher_ids @> $3::uuid[]
         ORDER BY ts.test_date, ts.time_start`,
        [dateFrom, dateTo, [staffRecord.id]]
      );
      for (const ts of tsResult.rows as any[]) {
        sessions.push({
          classSessionId: ts.id,
          sessionDate: ts.test_date,
          weekday: new Date(ts.test_date + "T00:00:00").getDay(),
          className: ts.title,
          classCode: "TEST",
          startTime: ts.time_start ?? "",
          endTime: ts.time_end ?? "",
          learningFormat: "offline",
          onlineLink: null,
          sessionStatus: "scheduled",
          sessionIndex: null,
          locationName: null,
          checkInAt: null,
          checkOutAt: null,
          isTestSession: true,
        });
      }

      sessions.sort((a, b) => {
        if (a.sessionDate < b.sessionDate) return -1;
        if (a.sessionDate > b.sessionDate) return 1;
        return (a.startTime ?? "").localeCompare(b.startTime ?? "");
      });

      const datesWithSessions = [...new Set(sessions.map((s) => s.sessionDate))];
      res.json({ sessions, datesWithSessions, month: monthStr });
    } catch (err: any) {
      console.error("[Mobile] staff/calendar error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải lịch dạy" });
    }
  });

  // ── GET /api/mobile/staff/calendar/day ────────────────────────────────────
  // Tất cả buổi dạy trong một ngày cụ thể (bao gồm test_sessions)
  app.get("/api/mobile/staff/calendar/day", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const { date } = req.query as { date?: string };
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: "Thiếu hoặc sai định dạng tham số date (YYYY-MM-DD)" });
      }

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
          onlineLink: classes.onlineLink,
          locationName: locations.name,
          checkInAt: teacherAttendance.checkInAt,
          checkOutAt: teacherAttendance.checkOutAt,
          enrolledCount: sql<number>`(SELECT COUNT(*) FROM student_sessions ss WHERE ss.class_session_id = ${classSessions.id} AND ss.status != 'transferred')::int`,
          pendingCount: sql<number>`(SELECT COUNT(*) FROM student_sessions ss WHERE ss.class_session_id = ${classSessions.id} AND ss.attendance_status = 'pending')::int`,
        })
        .from(classSessions)
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .leftJoin(locations, eq(classes.locationId, locations.id))
        .leftJoin(
          teacherAttendance,
          and(
            eq(teacherAttendance.classSessionId, classSessions.id),
            sql`${teacherAttendance.staffId} = ${staffRecord.id}::uuid`
          )
        )
        .where(
          and(
            sql`${classSessions.teacherIds} @> ARRAY[${staffRecord.id}]::uuid[]`,
            eq(classSessions.sessionDate, date)
          )
        )
        .orderBy(shiftTemplates.startTime);

      const sessions: any[] = rows.map((row) => ({
        classSessionId: row.classSessionId,
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
        locationName: row.locationName ?? null,
        checkInAt: row.checkInAt ? new Date(row.checkInAt).toISOString() : null,
        checkOutAt: row.checkOutAt ? new Date(row.checkOutAt).toISOString() : null,
        enrolledCount: row.enrolledCount ?? 0,
        attendancePendingCount: row.pendingCount ?? 0,
        isTestSession: false,
      }));

      // Merge buổi kiểm tra tập trung
      const tsResult = await pool.query(
        `SELECT ts.id, ts.title, ts.test_date::text AS test_date, ts.time_start, ts.time_end, ts.student_count
         FROM test_sessions ts
         WHERE ts.test_date = $1::date
           AND ts.teacher_ids @> $2::uuid[]
         ORDER BY ts.time_start`,
        [date, [staffRecord.id]]
      );
      for (const ts of tsResult.rows as any[]) {
        sessions.push({
          classSessionId: ts.id,
          sessionDate: ts.test_date,
          weekday: new Date(ts.test_date + "T00:00:00").getDay(),
          className: ts.title,
          classCode: "TEST",
          startTime: ts.time_start ?? "",
          endTime: ts.time_end ?? "",
          learningFormat: "offline",
          onlineLink: null,
          sessionStatus: "scheduled",
          sessionIndex: null,
          locationName: null,
          checkInAt: null,
          checkOutAt: null,
          enrolledCount: ts.student_count ?? 0,
          attendancePendingCount: 0,
          isTestSession: true,
        });
      }

      sessions.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));

      res.json({ date, sessions });
    } catch (err: any) {
      console.error("[Mobile] staff/calendar/day error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải lịch dạy theo ngày" });
    }
  });

  // ── GET /api/mobile/staff/calendar/session/:classSessionId ────────────────
  // Chi tiết buổi dạy — thống kê điểm danh, nội dung, giáo viên, teacher attendance
  // Hỗ trợ cả buổi kiểm tra tập trung (test_sessions)
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
          onlineLink: classes.onlineLink,
          totalSessions: sql<number>`(SELECT COUNT(*) FROM class_sessions cs2 WHERE cs2.class_id = ${classes.id})`,
          locationName: locations.name,
          checkInAt: teacherAttendance.checkInAt,
          checkOutAt: teacherAttendance.checkOutAt,
        })
        .from(classSessions)
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .leftJoin(locations, eq(classes.locationId, locations.id))
        .leftJoin(
          teacherAttendance,
          and(
            eq(teacherAttendance.classSessionId, classSessions.id),
            sql`${teacherAttendance.staffId} = ${staffRecord.id}::uuid`
          )
        )
        .where(eq(classSessions.id, classSessionId))
        .limit(1);

      // Fallback: buổi kiểm tra tập trung (test_sessions)
      if (!row) {
        const tsResult = await pool.query(
          `SELECT ts.id, ts.title, ts.test_date::text AS test_date, ts.time_start, ts.time_end,
                  ts.teacher_ids, ts.student_count, ts.location_id
           FROM test_sessions ts WHERE ts.id = $1 LIMIT 1`,
          [classSessionId]
        );
        const ts = tsResult.rows[0];
        if (!ts) return res.status(404).json({ message: "Không tìm thấy buổi học" });

        const tsTeacherIds: string[] = ts.teacher_ids ?? [];
        let tsTeachers: { id: string; fullName: string }[] = [];
        if (tsTeacherIds.length > 0) {
          const tRows = await db
            .select({ id: staff.id, fullName: staff.fullName, code: staff.code })
            .from(staff)
            .where(inArray(staff.id, tsTeacherIds));
          tsTeachers = tsTeacherIds
            .map((tid) => tRows.find((r) => r.id === tid))
            .filter(Boolean)
            .map((r: any) => ({ id: r.id, fullName: r.fullName || r.code }));
        }
        const weekday = new Date(ts.test_date + "T00:00:00").getDay();
        return res.json({
          classSessionId: ts.id,
          classId: null,
          sessionDate: ts.test_date,
          weekday,
          className: ts.title,
          classCode: "TEST",
          startTime: ts.time_start ?? "",
          endTime: ts.time_end ?? "",
          learningFormat: "offline",
          onlineLink: null,
          sessionStatus: "scheduled",
          sessionIndex: null,
          totalSessions: null,
          locationName: null,
          teachers: tsTeachers,
          evaluationCriteriaIds: [],
          generalContents: [],
          enrolledCount: ts.student_count ?? 0,
          attendancePendingCount: 0,
          reviewedCount: 0,
          checkInAt: null,
          checkOutAt: null,
          isTestSession: true,
        });
      }

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
        onlineLink: row.onlineLink ?? null,
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
        checkInAt: row.checkInAt ? new Date(row.checkInAt).toISOString() : null,
        checkOutAt: row.checkOutAt ? new Date(row.checkOutAt).toISOString() : null,
        isTestSession: false,
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

  // ── Staff Attendance Update ──────────────────────────────────────────────

  /**
   * POST /api/mobile/staff/calendar/session/:classSessionId/attendance
   * Cập nhật trạng thái điểm danh cho một học viên trong buổi học.
   *
   * Auth: Bearer JWT (nhân viên)
   * Params: classSessionId — UUID buổi học
   * Body:
   *   studentSessionId  string  — UUID bản ghi student_session
   *   attendanceStatus  string  — "present" | "absent" | "makeup_wait" | "makeup_done" | "reserve" | "pending"
   *   attendanceNote?   string  — ghi chú tuỳ chọn
   *
   * Errors:
   *   401 — chưa đăng nhập / token hết hạn
   *   403 — không phải nhân viên, hoặc vượt quá thời gian điểm danh
   *   400 — thiếu tham số bắt buộc
   */
  app.post("/api/mobile/staff/calendar/session/:classSessionId/attendance", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const { classSessionId } = req.params;
      const { studentSessionId, attendanceStatus, attendanceNote } = req.body as {
        studentSessionId?: string;
        attendanceStatus?: string;
        attendanceNote?: string;
      };

      if (!studentSessionId || !attendanceStatus) {
        return res.status(400).json({ message: "Thiếu studentSessionId hoặc attendanceStatus" });
      }

      // Enforce attendance time limit
      const roleIds = await getStaffRoleIds(staffRecord.id);
      await enforceAttendanceTimeLimit(classSessionId, roleIds);

      const { statusChanged } = await updateStudentAttendance(studentSessionId, attendanceStatus, attendanceNote, user.id, staffRecord.fullName);
      if (statusChanged) sendAttendanceNotification(studentSessionId, attendanceStatus, user.id).catch(console.error);

      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Mobile] staff/attendance error:", err);
      return res.status(err.status ?? 500).json({ message: err.message || "Lỗi khi cập nhật điểm danh" });
    }
  });

  /**
   * PATCH /api/mobile/staff/calendar/session/:classSessionId/attendance/note
   * Cập nhật ghi chú cho một học viên — KHÔNG kiểm tra giới hạn thời gian điểm danh.
   *
   * Auth: Bearer JWT (nhân viên)
   * Params: classSessionId — UUID buổi học
   * Body:
   *   studentSessionId  string  — UUID student_session
   *   attendanceNote    string  — nội dung ghi chú (truyền "" để xoá)
   *
   * Errors:
   *   401 — chưa đăng nhập / token hết hạn
   *   403 — không phải nhân viên
   *   400 — thiếu tham số bắt buộc
   */
  app.patch("/api/mobile/staff/calendar/session/:classSessionId/attendance/note", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const { studentSessionId, attendanceNote } = req.body as {
        studentSessionId?: string;
        attendanceNote?: string;
      };

      if (!studentSessionId) {
        return res.status(400).json({ message: "Thiếu studentSessionId" });
      }

      // Chỉ cập nhật ghi chú — không đổi attendanceStatus, không kiểm tra time limit
      await db.update(studentSessions)
        .set({ attendanceNote: attendanceNote ?? null, updatedAt: new Date() })
        .where(eq(studentSessions.id, studentSessionId));

      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Mobile] staff/attendance/note error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi cập nhật ghi chú" });
    }
  });

  /**
   * POST /api/mobile/staff/calendar/session/:classSessionId/attendance/bulk
   * Cập nhật điểm danh hàng loạt cho tất cả học viên trong một buổi học.
   *
   * Auth: Bearer JWT (nhân viên)
   * Params: classSessionId — UUID buổi học
   * Body:
   *   students  Array<{ studentSessionId: string; attendanceStatus: string; attendanceNote?: string }>
   *
   * Errors:
   *   401 — chưa đăng nhập / token hết hạn
   *   403 — không phải nhân viên, hoặc vượt quá thời gian điểm danh
   *   400 — thiếu tham số bắt buộc
   */
  app.post("/api/mobile/staff/calendar/session/:classSessionId/attendance/bulk", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const { classSessionId } = req.params;
      const { students: studentList } = req.body as {
        students?: Array<{ studentSessionId: string; attendanceStatus: string; attendanceNote?: string }>;
      };

      if (!Array.isArray(studentList) || studentList.length === 0) {
        return res.status(400).json({ message: "Thiếu danh sách học viên (students)" });
      }

      // Enforce attendance time limit
      const roleIds = await getStaffRoleIds(staffRecord.id);
      await enforceAttendanceTimeLimit(classSessionId, roleIds);

      // bulkUpdateAttendance expects { studentSessionId, attendanceStatus, attendanceNote? }
      const payload = studentList.map((s) => ({
        studentSessionId: s.studentSessionId,
        attendanceStatus: s.attendanceStatus,
        attendanceNote: s.attendanceNote,
      }));
      await bulkUpdateAttendance(classSessionId, payload, user.id, staffRecord.fullName);
      for (const s of studentList) {
        sendAttendanceNotification(s.studentSessionId, s.attendanceStatus, user.id).catch(console.error);
      }

      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Mobile] staff/attendance/bulk error:", err);
      return res.status(err.status ?? 500).json({ message: err.message || "Lỗi khi cập nhật điểm danh hàng loạt" });
    }
  });

  // ── Staff Review (Nhận xét học viên) ────────────────────────────────────

  /**
   * GET /api/mobile/staff/calendar/session/:classSessionId/review-form
   * Trả về toàn bộ thông tin cần thiết để nhân viên viết nhận xét cho buổi học:
   *   - criteria: danh sách tiêu chí (id, name, subCriteria[]) — dùng id làm key khi lưu sao
   *   - teachers: danh sách giáo viên trong buổi (id, fullName)
   *   - students: danh sách học viên + reviewData hiện tại (raw format, null nếu chưa có)
   *
   * Auth: Bearer JWT (nhân viên)
   *
   * Response:
   * {
   *   criteria: [{ id, name, subCriteria: [{ id, name }] }],
   *   teachers:  [{ id, fullName }],
   *   students:  [{
   *     studentSessionId, studentName, studentCode,
   *     reviewPublished,
   *     reviewData: Record<teacherId, { teacherName, items, criteriaRatings: Record<criteriaId, number> }> | null
   *   }]
   * }
   *
   * LƯU Ý: criteriaRatings được key bằng criteriaId (UUID), KHÔNG phải tên criteria.
   *         Khi lưu sao phải dùng đúng criteriaId này.
   */
  app.get("/api/mobile/staff/calendar/session/:classSessionId/review-form", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const { classSessionId } = req.params;

      // 1. Fetch session info: evaluationCriteriaIds + teacherIds
      const [sessionRow] = await db
        .select({
          evaluationCriteriaIds: classSessions.evaluationCriteriaIds,
          teacherIds: classSessions.teacherIds,
        })
        .from(classSessions)
        .where(eq(classSessions.id, classSessionId))
        .limit(1);

      if (!sessionRow) return res.status(404).json({ message: "Không tìm thấy buổi học" });

      const criteriaIds = (sessionRow.evaluationCriteriaIds ?? []) as string[];
      const teacherStaffIds = (sessionRow.teacherIds ?? []) as string[];

      // 2. Load criteria + sub-criteria
      let criteriaList: { id: string; name: string; subCriteria: { id: string; name: string }[] }[] = [];
      if (criteriaIds.length > 0) {
        const rawCriteria = await db
          .select({ id: evaluationCriteria.id, name: evaluationCriteria.name })
          .from(evaluationCriteria)
          .where(inArray(evaluationCriteria.id, criteriaIds));

        const subRows = await db
          .select({ id: evaluationSubCriteria.id, name: evaluationSubCriteria.name, criteriaId: evaluationSubCriteria.criteriaId })
          .from(evaluationSubCriteria)
          .where(inArray(evaluationSubCriteria.criteriaId, criteriaIds));

        const subMap = new Map<string, { id: string; name: string }[]>();
        for (const s of subRows) {
          if (!subMap.has(s.criteriaId)) subMap.set(s.criteriaId, []);
          subMap.get(s.criteriaId)!.push({ id: s.id, name: s.name });
        }

        // Preserve the order of evaluationCriteriaIds
        criteriaList = criteriaIds
          .map((cid) => {
            const c = rawCriteria.find((r) => r.id === cid);
            if (!c) return null;
            return { id: c.id, name: c.name, subCriteria: subMap.get(c.id) ?? [] };
          })
          .filter((c): c is NonNullable<typeof c> => c !== null);
      }

      // 3. Load teachers
      let teacherList: { id: string; fullName: string }[] = [];
      if (teacherStaffIds.length > 0) {
        const teacherRows = await db
          .select({ id: staff.id, fullName: staff.fullName })
          .from(staff)
          .where(inArray(staff.id, teacherStaffIds));
        teacherList = teacherRows;
      }

      // 4. Load students + existing review data
      const studentRows = await db
        .select({
          studentSessionId: studentSessions.id,
          studentId: studentSessions.studentId,
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

      const studentList = studentRows.map((r) => ({
        studentSessionId: r.studentSessionId,
        studentName: r.studentName,
        studentCode: r.studentCode,
        reviewPublished: r.reviewPublished ?? false,
        /**
         * reviewData format (khi đã có nhận xét):
         * {
         *   "<teacherId>": {
         *     "teacherName": "...",
         *     "items": [{ criteriaId, criteriaName, subCriteriaId?, subCriteriaName?, comment }],
         *     "criteriaRatings": { "<criteriaId>": <số sao 1-5> }
         *   }
         * }
         * criteriaRatings KEY = criteriaId (UUID) — khớp với trường id trong mảng criteria ở trên.
         */
        reviewData: (r.reviewData ?? null) as Record<string, {
          teacherName: string;
          items: { criteriaId: string; criteriaName: string; subCriteriaId?: string; subCriteriaName?: string; comment: string }[];
          criteriaRatings: Record<string, number>;
        }> | null,
      }));

      res.json({ criteria: criteriaList, teachers: teacherList, students: studentList });
    } catch (err: any) {
      console.error("[Mobile] staff/review-form GET error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải form nhận xét" });
    }
  });

  /**
   * POST /api/mobile/staff/calendar/session/:classSessionId/review
   * Lưu nhận xét (và sao đánh giá) cho một hoặc nhiều học viên trong buổi học.
   *
   * Auth: Bearer JWT (nhân viên)
   * Params: classSessionId — UUID buổi học
   *
   * Body:
   * {
   *   studentSessionIds: string[],   // 1 hoặc nhiều studentSessionId
   *   published: boolean,            // true = công bố tới học viên
   *   reviewData: {
   *     "<teacherId>": {
   *       teacherName: string,
   *       items: [{
   *         criteriaId:      string,   // UUID của criteria (lấy từ GET review-form)
   *         criteriaName:    string,
   *         subCriteriaId?:  string,
   *         subCriteriaName?: string,
   *         comment:         string    // có thể là HTML từ rich text editor
   *       }],
   *       criteriaRatings: {
   *         "<criteriaId>": number    // số sao 1-5 (0 = chưa đánh giá, bỏ qua)
   *       }
   *     }
   *   }
   * }
   *
   * ⚠️  criteriaRatings PHẢI dùng criteriaId (UUID) làm key — KHÔNG dùng tên criteria.
   *     Nếu dùng tên, web sẽ không đọc được sao.
   *
   * Response: { success: true }
   *
   * Errors:
   *   401 — chưa đăng nhập
   *   403 — không phải nhân viên
   *   400 — thiếu studentSessionIds hoặc reviewData
   */
  app.post("/api/mobile/staff/calendar/session/:classSessionId/review", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const { studentSessionIds, reviewData, published } = req.body as {
        studentSessionIds?: string[];
        reviewData?: Record<string, unknown>;
        published?: boolean;
      };

      if (!Array.isArray(studentSessionIds) || studentSessionIds.length === 0) {
        return res.status(400).json({ message: "Thiếu studentSessionIds" });
      }
      if (!reviewData || typeof reviewData !== "object") {
        return res.status(400).json({ message: "Thiếu reviewData" });
      }

      // Normalize reviewData: nếu mobile gửi score trong items[] nhưng thiếu criteriaRatings
      // → tự build criteriaRatings để web có thể đọc sao (backward compat).
      const normalizedReviewData: Record<string, any> = {};
      for (const [teacherId, entry] of Object.entries(reviewData as Record<string, any>)) {
        const e = entry as any;
        const hasCriteriaRatings =
          e?.criteriaRatings && Object.keys(e.criteriaRatings).length > 0;
        let criteriaRatings = e?.criteriaRatings ?? {};
        if (!hasCriteriaRatings && Array.isArray(e?.items)) {
          // Build criteriaRatings from items[].score (take first score per criteriaId)
          for (const item of e.items) {
            if (item.criteriaId && item.score != null && criteriaRatings[item.criteriaId] == null) {
              criteriaRatings[item.criteriaId] = item.score;
            }
          }
        }
        normalizedReviewData[teacherId] = { ...e, criteriaRatings };
      }

      // Save — same DB update as the shared web endpoint
      await db
        .update(studentSessions)
        .set({ reviewData: normalizedReviewData, reviewPublished: !!published, updatedAt: new Date() })
        .where(inArray(studentSessions.id, studentSessionIds));

      if (published) {
        sendReviewNotification(studentSessionIds, user.id).catch(console.error);
      }

      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Mobile] staff/review POST error:", err);
      return res.status(err.status ?? 500).json({ message: err.message || "Lỗi khi lưu nhận xét" });
    }
  });

  // ── Staff Library Content ────────────────────────────────────────────────

  // GET /api/mobile/staff/library — Danh sách nội dung thư viện
  app.get("/api/mobile/staff/library", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const { search = "", type, programId, page = "1", pageSize = "20" } = req.query as Record<string, string>;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const pageSizeNum = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));
      const offset = (pageNum - 1) * pageSizeNum;

      let whereClause = sql`1=1`;
      if (search) whereClause = sql`${whereClause} AND (${courseProgramContents.title} ILIKE ${`%${search}%`})`;
      if (type) whereClause = sql`${whereClause} AND ${courseProgramContents.type} = ${type}`;
      if (programId) whereClause = sql`${whereClause} AND ${courseProgramContents.programId}::text = ${programId}`;

      const [items, [{ total }]] = await Promise.all([
        db.select({
          id: courseProgramContents.id,
          title: courseProgramContents.title,
          type: courseProgramContents.type,
          content: courseProgramContents.content,
          programId: courseProgramContents.programId,
          programName: coursePrograms.name,
          attachments: courseProgramContents.attachments,
          allowDownload: courseProgramContents.allowDownload,
          createdAt: courseProgramContents.createdAt,
        })
          .from(courseProgramContents)
          .leftJoin(coursePrograms, eq(courseProgramContents.programId, coursePrograms.id))
          .where(whereClause)
          .orderBy(desc(courseProgramContents.createdAt))
          .limit(pageSizeNum)
          .offset(offset),
        db.select({ total: sql<number>`COUNT(*)::int` })
          .from(courseProgramContents)
          .where(whereClause),
      ]);

      res.json({ items, total, page: pageNum, pageSize: pageSizeNum, totalPages: Math.ceil(total / pageSizeNum) });
    } catch (err: any) {
      console.error("[Mobile] staff/library GET error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải thư viện nội dung" });
    }
  });

  // POST /api/mobile/staff/library — Tạo nội dung mới vào thư viện
  app.post("/api/mobile/staff/library", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const { insertCourseProgramContentSchema } = await import("@shared/schema");
      const parsed = insertCourseProgramContentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.flatten() });

      const [created] = await db
        .insert(courseProgramContents)
        .values({ ...parsed.data, programId: parsed.data.programId || null, createdBy: user.id })
        .returning();

      res.status(201).json(created);
    } catch (err: any) {
      console.error("[Mobile] staff/library POST error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tạo nội dung thư viện" });
    }
  });

  // GET /api/mobile/staff/calendar/session/:classSessionId/contents — Nội dung đã giao trong buổi học
  app.get("/api/mobile/staff/calendar/session/:classSessionId/contents", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const { classSessionId } = req.params;
      const contents = await db
        .select({
          id: sessionContents.id,
          contentType: sessionContents.contentType,
          title: sessionContents.title,
          description: sessionContents.description,
          resourceUrl: sessionContents.resourceUrl,
          displayOrder: sessionContents.displayOrder,
          dueDate: sessionContents.dueDate,
        })
        .from(sessionContents)
        .where(eq(sessionContents.classSessionId, classSessionId))
        .orderBy(sessionContents.displayOrder);

      res.json(contents);
    } catch (err: any) {
      console.error("[Mobile] staff/session/contents GET error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi tải nội dung buổi học" });
    }
  });

  // POST /api/mobile/staff/calendar/session/:classSessionId/contents — Giao nội dung vào buổi học
  app.post("/api/mobile/staff/calendar/session/:classSessionId/contents", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const { classSessionId } = req.params;
      const { libraryContentId, contentType, title, description, dueDate } = req.body;

      if (!contentType || !title) {
        return res.status(400).json({ message: "Thiếu contentType hoặc title" });
      }

      // Tính displayOrder: lấy max hiện tại + 1
      const [{ maxOrder }] = await db
        .select({ maxOrder: sql<number>`COALESCE(MAX(${sessionContents.displayOrder}), 0)` })
        .from(sessionContents)
        .where(eq(sessionContents.classSessionId, classSessionId));

      const [created] = await db
        .insert(sessionContents)
        .values({
          classSessionId,
          contentType,
          title,
          description: description || null,
          resourceUrl: libraryContentId || null,
          displayOrder: (maxOrder ?? 0) + 1,
          dueDate: dueDate ? new Date(dueDate) : null,
        })
        .returning();

      res.status(201).json(created);
    } catch (err: any) {
      console.error("[Mobile] staff/session/contents POST error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi giao nội dung" });
    }
  });

  // DELETE /api/mobile/staff/calendar/session/:classSessionId/contents/:contentId — Xoá nội dung khỏi buổi học
  app.delete("/api/mobile/staff/calendar/session/:classSessionId/contents/:contentId", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const { contentId } = req.params;
      await db.delete(sessionContents).where(eq(sessionContents.id, contentId));
      res.status(204).send();
    } catch (err: any) {
      console.error("[Mobile] staff/session/contents DELETE error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi xoá nội dung" });
    }
  });

  // ── GET /api/mobile/staff/exams — Danh sách bài kiểm tra ─────────────────
  // JWT required, không cần staff check (giáo viên và admin đều xem được)
  // Query: search, page, pageSize, status
  app.get("/api/mobile/staff/exams", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
      const search = ((req.query.search as string) || "").trim();
      const statusFilter = (req.query.status as string | undefined);
      const offset = (page - 1) * pageSize;

      const conditions: any[] = [];
      if (search) {
        conditions.push(
          sql`(${exams.name} ILIKE ${"%" + search + "%"} OR ${exams.code} ILIKE ${"%" + search + "%"})`
        );
      }
      if (statusFilter) {
        conditions.push(eq(exams.status, statusFilter));
      }
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalRow, rows] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(exams).where(whereClause),
        db
          .select({
            id: exams.id,
            code: exams.code,
            name: exams.name,
            status: exams.status,
            timeLimitMinutes: exams.timeLimitMinutes,
            passingScore: exams.passingScore,
            maxAttempts: exams.maxAttempts,
            description: exams.description,
          })
          .from(exams)
          .where(whereClause)
          .orderBy(desc(exams.createdAt))
          .limit(pageSize)
          .offset(offset),
      ]);

      const total = totalRow[0]?.count ?? 0;
      return res.json({
        items: rows,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
    } catch (err: any) {
      console.error("[Mobile] staff/exams GET error:", err);
      res.status(500).json({ message: err.message || "Lỗi khi lấy danh sách bài kiểm tra" });
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
        score: r.submissionScore ?? r.submissionScoreRaw ?? null,
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
        sql`(
          ${staffId} = ANY(${classes.teacherIds})
          OR ${staffId} = ANY(${classes.managerIds})
          OR EXISTS (
            SELECT 1 FROM class_sessions cs2
            WHERE cs2.class_id = ${classId}
              AND cs2.teacher_ids @> ARRAY[${staffId}]::uuid[]
          )
        )`,
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
      category: "review",
      referenceId: classId,
      referenceType: "grade_book",
      deeplink: {
        screen: "ScoreSheet",
        params: { classId },
      },
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

  // ── Learning Overview: resource key ──────────────────────────────────────
  const LEARNING_OVERVIEW_RESOURCE = "/learning-overview";

  /**
   * Kiểm tra user có quyền xem Learning Overview không.
   * Check cả top-level "/learning-overview" lẫn sub-resources "/learning-overview#xxx"
   * vì một số role (VD: Giám đốc) chỉ được cấp quyền từng tab riêng lẻ.
   */
  async function canViewLearningOverview(roleIds: string[]): Promise<boolean> {
    if (!roleIds || roleIds.length === 0) return false;
    const allPerms = await getAllPermissionsForRoles(roleIds);
    return allPerms.some(
      p =>
        (p.resource === LEARNING_OVERVIEW_RESOURCE || p.resource.startsWith(LEARNING_OVERVIEW_RESOURCE + "#")) &&
        p.canView,
    );
  }

  // ── GET /api/mobile/learning-overview/meta ────────────────────────────────
  // Trả về quyền truy cập tính năng Learning Overview cho role hiện tại
  app.get("/api/mobile/learning-overview/meta", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const isSuperAdmin = (req as any).isSuperAdmin ?? user.username === "admin";
      if (isSuperAdmin) {
        return res.json({ permissions: { canView: true } });
      }

      const roleIds: string[] = (req as any).roleIds ?? [];
      const canView = await canViewLearningOverview(roleIds);
      return res.json({ permissions: { canView } });
    } catch (err: any) {
      console.error("[Mobile] learning-overview/meta error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải meta" });
    }
  });

  // ── GET /api/mobile/learning-overview/summary ────────────────────────────
  // Trả về số đếm nhanh cho badge trên các tab của trang Learning Overview
  app.get("/api/mobile/learning-overview/summary", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const isSuperAdmin = (req as any).isSuperAdmin ?? user.username === "admin";
      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord && !isSuperAdmin) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const roleIds: string[] = (req as any).roleIds ?? [];
      const canView = isSuperAdmin || (await canViewLearningOverview(roleIds));
      if (!canView) return res.status(403).json({ message: "Bạn không có quyền truy cập tính năng này" });

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
              AND sl.location_id = ANY(ARRAY[${sql.raw((allowedLocationIds ?? []).map(id => `'${id}'`).join(','))}]::uuid[])
          )`;

      const classLocationClause = isSuperAdmin
        ? sql`1=1`
        : sql`c.location_id = ANY(ARRAY[${sql.raw((allowedLocationIds ?? []).map(id => `'${id}'`).join(','))}]::uuid[])`;

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

      const isSuperAdmin = (req as any).isSuperAdmin ?? user.username === "admin";

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord && !isSuperAdmin) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const roleIds: string[] = (req as any).roleIds ?? [];
      const canView = isSuperAdmin || (await canViewLearningOverview(roleIds));
      if (!canView) return res.status(403).json({ message: "Bạn không có quyền truy cập tính năng này" });

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
              AND sl.location_id = ANY(ARRAY[${sql.raw((allowedLocationIds ?? []).map(id => `'${id}'`).join(','))}]::uuid[])
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
            s.account_status,
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
          b.account_status AS "accountStatus",
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

  // ── GET /api/mobile/classes-ending-soon ──────────────────────────────────
  // Danh sách lớp học sắp kết thúc (remaining_sessions <= 10).
  // Dùng cho trang /learning-overview tab "Lớp học sắp kết thúc".
  app.get("/api/mobile/classes-ending-soon", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const isSuperAdmin = (req as any).isSuperAdmin ?? user.username === "admin";
      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord && !isSuperAdmin) return res.status(403).json({ message: "Tài khoản không phải nhân viên" });

      const roleIds: string[] = (req as any).roleIds ?? [];
      const canView = isSuperAdmin || (await canViewLearningOverview(roleIds));
      if (!canView) return res.status(403).json({ message: "Bạn không có quyền truy cập tính năng này" });

      const allowedLocationIds: string[] = isSuperAdmin ? [] : await db
        .select({ locationId: staffAssignments.locationId })
        .from(staffAssignments)
        .where(eq(staffAssignments.staffId, staffRecord!.id))
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
        : sql`c.location_id = ANY(ARRAY[${sql.raw((allowedLocationIds ?? []).map(id => `'${id}'`).join(','))}]::uuid[])`;

      const searchStr = String(search);
      const searchCond = searchStr
        ? sql`AND (b.class_code ILIKE ${`%${searchStr}%`} OR b.class_name ILIKE ${`%${searchStr}%`})`
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
            c.id,
            c.class_code,
            c.name AS class_name,
            c.weekdays,
            c.teacher_ids,
            c.end_date,
            l.name AS location_name,
            (
              SELECT COUNT(*)::int FROM class_sessions cs
              WHERE cs.class_id = c.id AND cs.session_date >= ${today}::date AND cs.status != 'cancelled'
            ) AS remaining_sessions
          FROM classes c
          INNER JOIN locations l ON c.location_id = l.id
          WHERE c.status IN ('active', 'planning')
            AND c.end_date IS NOT NULL
            AND ${locationClause}
            AND (
              SELECT COUNT(*)::int FROM class_sessions cs
              WHERE cs.class_id = c.id AND cs.session_date >= ${today}::date AND cs.status != 'cancelled'
            ) <= 10
        )
        SELECT
          b.id,
          b.class_code AS "classCode",
          b.class_name AS "className",
          b.weekdays,
          b.teacher_ids AS "teacherIds",
          b.end_date AS "endDate",
          b.location_name AS "locationName",
          b.remaining_sessions AS "remainingSessions",
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
        FROM classes c
        WHERE c.status IN ('active', 'planning')
          AND c.end_date IS NOT NULL
          AND ${locationClause}
          AND (
            SELECT COUNT(*)::int FROM class_sessions cs
            WHERE cs.class_id = c.id AND cs.session_date >= ${today}::date AND cs.status != 'cancelled'
          ) <= 10
        ORDER BY c.class_code
      `);

      const allStaff = await db.select({ id: staff.id, fullName: staff.fullName }).from(staff);
      const staffMap = new Map(allStaff.map((s) => [s.id, s.fullName]));

      const rows = result.rows as any[];
      const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
      const data = rows.map(({ status_priority, total_count, ...rest }) => ({
        ...rest,
        teacherNames: Array.isArray(rest.teacherIds)
          ? rest.teacherIds.map((id: string) => staffMap.get(id) || "").filter(Boolean).join(", ")
          : "",
      }));
      const availableClasses = (classesResult.rows as any[]).map((r) => ({
        code: r.class_code,
        label: r.class_name || r.class_code,
      }));

      return res.json({ data, total, page: pageNum, pageSize: pageSizeNum, availableClasses });
    } catch (err: any) {
      console.error("[Mobile] classes-ending-soon error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải danh sách lớp sắp kết thúc" });
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

  // ═══════════════════════════════════════════════════════════════════════════
  // STUDENT NOTIFICATIONS — dành cho tài khoản Học viên (và Phụ huynh xem con)
  // Auth: JWT Bearer token
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /api/mobile/student/notifications ─────────────────────────────────
  // Danh sách thông báo nội bộ của học viên đang đăng nhập.
  // Nếu là Phụ huynh: lấy noti của TẤT CẢ con học viên (không lấy noti của phụ huynh).
  // Nếu là Học viên: chỉ lấy noti của chính tài khoản đó.
  // Query: ?limit=50&offset=0
  // Response: { totalUnread, limit, offset, items: [...] }
  // item.deeplink — screen gợi ý trên app (xem bảng deeplink bên dưới)
  //
  // Bảng deeplink (ưu tiên cột deeplink lưu sẵn trong DB, fallback suy luận từ category):
  //   attendance  → screen: Calendar,    params: { date, sessionId?, classId? }
  //   schedule    → screen: Calendar,    params: { date, sessionId?, classId? }
  //   class       → screen: Calendar,    params: { date, classId? }
  //   review      → screen: Calendar,    params: { date, sessionId?, classId? }
  //   content     → screen: Assignments, params: { date?, classId? }   ← classId dùng để lọc đúng lớp
  //   assignment  → screen: Assignments, params: { date?, classId? }
  //   finance     → screen: Invoices,    params: { invoiceId? }
  //   score_sheet / grade_book (referenceType) → screen: ScoreSheet, params: { classId? }
  //   chat        → screen: Chat,        params: { topicId?, referenceType? }
  //   task / general → không navigate
  app.get("/api/mobile/student/notifications", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized. Vui lòng gửi JWT Bearer token." });

      const ctx = await getMobileStudentContext(user.id);
      if (!ctx) return res.status(403).json({ message: "Tài khoản không phải học viên hoặc phụ huynh." });

      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const offset = Number(req.query.offset) || 0;

      let targetUserIds: string[];

      if (ctx.isParent) {
        // Phụ huynh: lấy noti của các con học viên (không lấy noti của phụ huynh)
        if (ctx.studentIds.length === 0) {
          return res.json({ totalUnread: 0, limit, offset, items: [] });
        }
        const childStudents = await db
          .select({ id: students.id, userId: students.userId })
          .from(students)
          .where(inArray(students.id, ctx.studentIds));
        targetUserIds = childStudents.map((c) => c.userId).filter((id): id is string => !!id);
      } else {
        // Học viên: chỉ lấy noti của chính mình
        targetUserIds = [user.id];
      }

      if (targetUserIds.length === 0) {
        return res.json({ totalUnread: 0, limit, offset, items: [] });
      }

      // Tổng số chưa đọc
      const unreadRows = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(and(inArray(notifications.userId, targetUserIds), eq(notifications.isRead, false)));
      const totalUnread = unreadRows.length;

      // Danh sách noti phân trang
      const rows = await db
        .select()
        .from(notifications)
        .where(inArray(notifications.userId, targetUserIds))
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset);

      // Hàm tính deeplink screen + params cho app mobile.
      // Ưu tiên deeplink đã lưu tại thời điểm tạo (nguồn chính, chính xác nhất).
      // Chỉ suy luận lại (fallback) cho notification cũ chưa có cột deeplink.
      function resolveDeeplink(n: typeof rows[0]): { screen: string | null; params: Record<string, string> } {
        const stored = (n as any).deeplink as { screen: string; params?: Record<string, string> } | null | undefined;
        if (stored && stored.screen) {
          return { screen: stored.screen, params: stored.params ?? {} };
        }

        const category = n.category ?? "general";
        const refType  = n.referenceType ?? "";
        const title    = (n.title ?? "").toLowerCase();
        const content  = (n.content ?? "").toLowerCase();

        // Trích ngày từ nội dung — ưu tiên DD/MM/YYYY (4 số), fallback DD/MM/YY, cuối cùng dùng referenceDate
        const content4 = (n.content ?? "").match(/(\d{2})\/(\d{2})\/(20\d{2})(?!\d)/);
        const content2 = (n.content ?? "").match(/(\d{2})\/(\d{2})\/(\d{2})(?!\d)/);
        const date = content4
          ? `${content4[3]}-${content4[2]}-${content4[1]}`
          : content2
            ? `20${content2[3]}-${content2[2]}-${content2[1]}`
            : (n.referenceDate as string | null | undefined)?.slice(0, 10) ?? null;

        // Bảng điểm
        if (title.includes("bảng điểm") || content.includes("bảng điểm") || refType === "score_sheet" || refType === "grade_book") {
          return { screen: "ScoreSheet", params: {} };
        }
        // Tài chính / hoá đơn
        if (category === "finance" || refType === "invoice") {
          return { screen: "Invoices", params: n.referenceId ? { invoiceId: n.referenceId } : {} };
        }
        // Nội dung / bài tập
        if (category === "content" || category === "assignment" || ["assignment", "homework", "content"].includes(refType)) {
          return { screen: "Assignments", params: date ? { date } : {} };
        }
        // Lịch học
        if (["attendance", "schedule", "class", "review"].includes(category) || ["session", "class", "schedule", "attendance"].includes(refType)) {
          return { screen: "Calendar", params: date ? { date } : {} };
        }
        // Công việc được giao (nhân viên) — mở danh sách, không highlight item cụ thể
        if (category === "task") {
          return { screen: "StaffTasks", params: {} };
        }
        // Tin nhắn chat mới — referenceId là Tinode topic ID
        if (category === "chat") {
          const params: Record<string, string> = {};
          if (n.referenceId) params.topicId = n.referenceId;
          if (refType) params.referenceType = refType;
          return { screen: "Chat", params };
        }
        return { screen: null, params: {} };
      }

      // Map userId → student info (dùng cho phụ huynh)
      const studentMap = new Map(ctx.linkedStudents.map((s) => [s.id, s]));
      const userIdToStudentMap = new Map<string, { id: string; fullName: string; code: string }>();
      if (ctx.isParent && ctx.studentIds.length > 0) {
        const childStudents = await db
          .select({ id: students.id, userId: students.userId })
          .from(students)
          .where(inArray(students.id, ctx.studentIds));
        for (const c of childStudents) {
          if (c.userId) {
            const info = studentMap.get(c.id);
            if (info) userIdToStudentMap.set(c.userId, info);
          }
        }
      }

      const items = rows.map((n) => {
        const { screen, params } = resolveDeeplink(n);
        const child = userIdToStudentMap.get(n.userId);
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
          deeplink: { screen, params },
          student: child ? { id: child.id, fullName: child.fullName, code: child.code } : null,
        };
      });

      return res.json({ totalUnread, limit, offset, items });
    } catch (err: any) {
      console.error("[Mobile] student/notifications error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải thông báo" });
    }
  });

  // ── GET /api/mobile/student/notifications/unread-count ───────────────────
  // Số thông báo chưa đọc của học viên (hoặc tổng của các con nếu là phụ huynh)
  // Auth: JWT Bearer token
  // Response: { total: number, byStudent?: [{ studentId, fullName, code, unread }] }
  app.get("/api/mobile/student/notifications/unread-count", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized. Vui lòng gửi JWT Bearer token." });

      const ctx = await getMobileStudentContext(user.id);
      if (!ctx) return res.status(403).json({ message: "Tài khoản không phải học viên hoặc phụ huynh." });

      if (ctx.isParent) {
        if (ctx.studentIds.length === 0) return res.json({ total: 0, byStudent: [] });

        const childStudents = await db
          .select({ id: students.id, userId: students.userId })
          .from(students)
          .where(inArray(students.id, ctx.studentIds));

        const userIdToStudent = new Map<string, { id: string; fullName: string; code: string }>();
        const childUserIds: string[] = [];
        const studentMap = new Map(ctx.linkedStudents.map((s) => [s.id, s]));
        for (const c of childStudents) {
          if (c.userId) {
            childUserIds.push(c.userId);
            const info = studentMap.get(c.id);
            if (info) userIdToStudent.set(c.userId, info);
          }
        }

        if (childUserIds.length === 0) return res.json({ total: 0, byStudent: [] });

        const rows = await db
          .select({ id: notifications.id, userId: notifications.userId })
          .from(notifications)
          .where(and(inArray(notifications.userId, childUserIds), eq(notifications.isRead, false)));

        const byStudent = [...userIdToStudent.entries()].map(([uid, info]) => ({
          studentId: info.id,
          fullName: info.fullName,
          code: info.code,
          unread: rows.filter((r) => r.userId === uid).length,
        }));

        return res.json({ total: rows.length, byStudent });
      } else {
        const rows = await db
          .select({ id: notifications.id })
          .from(notifications)
          .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));
        return res.json({ total: rows.length });
      }
    } catch (err: any) {
      console.error("[Mobile] student/notifications/unread-count error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải số thông báo chưa đọc" });
    }
  });

  // ── PATCH /api/mobile/student/notifications/:id/read ─────────────────────
  // Đánh dấu 1 thông báo là đã đọc (chỉ được phép nếu thuộc về học viên đó)
  // Auth: JWT Bearer token
  // Response: { success: true }
  app.patch("/api/mobile/student/notifications/:id/read", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized. Vui lòng gửi JWT Bearer token." });

      const ctx = await getMobileStudentContext(user.id);
      if (!ctx) return res.status(403).json({ message: "Tài khoản không phải học viên hoặc phụ huynh." });

      let allowedUserIds: string[];
      if (ctx.isParent) {
        const childStudents = await db
          .select({ userId: students.userId })
          .from(students)
          .where(inArray(students.id, ctx.studentIds));
        allowedUserIds = childStudents.map((c) => c.userId).filter((id): id is string => !!id);
      } else {
        allowedUserIds = [user.id];
      }

      if (allowedUserIds.length === 0) {
        return res.status(404).json({ message: "Không tìm thấy thông báo." });
      }

      const { id } = req.params;
      const updated = await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.id, id), inArray(notifications.userId, allowedUserIds)))
        .returning({ id: notifications.id });

      if (updated.length === 0) {
        return res.status(404).json({ message: "Không tìm thấy thông báo hoặc bạn không có quyền truy cập." });
      }

      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Mobile] student/notifications/:id/read error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi đánh dấu đã đọc" });
    }
  });

  // ── PATCH /api/mobile/student/notifications/read-all ─────────────────────
  // Đánh dấu TẤT CẢ thông báo là đã đọc
  // Auth: JWT Bearer token
  // Response: { success: true }
  app.patch("/api/mobile/student/notifications/read-all", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized. Vui lòng gửi JWT Bearer token." });

      const ctx = await getMobileStudentContext(user.id);
      if (!ctx) return res.status(403).json({ message: "Tài khoản không phải học viên hoặc phụ huynh." });

      let allowedUserIds: string[];
      if (ctx.isParent) {
        const childStudents = await db
          .select({ userId: students.userId })
          .from(students)
          .where(inArray(students.id, ctx.studentIds));
        allowedUserIds = childStudents.map((c) => c.userId).filter((id): id is string => !!id);
      } else {
        allowedUserIds = [user.id];
      }

      if (allowedUserIds.length > 0) {
        await db
          .update(notifications)
          .set({ isRead: true })
          .where(and(inArray(notifications.userId, allowedUserIds), eq(notifications.isRead, false)));
      }

      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Mobile] student/notifications/read-all error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi đánh dấu tất cả đã đọc" });
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

  // ══════════════════════════════════════════════════════════════════════════
  // NHÂN VIÊN / GIÁO VIÊN — THÔNG BÁO
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /api/mobile/staff/notifications ──────────────────────────────────
  // Danh sách thông báo của nhân viên / giáo viên, có phân trang
  // Auth: JWT Bearer token (yêu cầu tài khoản là nhân viên)
  // Query: ?limit=50&offset=0
  // Response: { totalUnread, limit, offset, items: [...] }
  app.get("/api/mobile/staff/notifications", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized. Vui lòng gửi JWT Bearer token." });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên." });

      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const offset = Number(req.query.offset) || 0;

      // Tổng số chưa đọc
      const unreadRows = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));
      const totalUnread = unreadRows.length;

      // Danh sách noti phân trang
      const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, user.id))
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset);

      // Deeplink screen mapping cho nhân viên / giáo viên.
      // Ưu tiên cột deeplink lưu sẵn trong DB (nguồn chính xác nhất — có đủ classId/sessionId/taskId).
      // Chỉ suy luận lại (fallback) cho notification cũ chưa có cột deeplink.
      function resolveStaffDeeplink(n: typeof rows[0]): { screen: string | null; params: Record<string, string> } {
        // 1. Ưu tiên deeplink đã lưu
        const stored = (n as any).deeplink as { screen: string; params?: Record<string, string> } | null | undefined;
        if (stored && stored.screen) {
          // Translate generic screen names → staff-specific screen names
          // (stored deeplink dùng tên chung, staff app dùng tên riêng)
          const screenMap: Record<string, string> = {
            Calendar:    "StaffCalendar",
            Assignments: "StaffCalendar", // staff xem nội dung giao qua calendar
            ScoreSheet:  "StaffGradeBook",
          };
          const screen = screenMap[stored.screen] ?? stored.screen;
          return { screen, params: stored.params ?? {} };
        }

        // 2. Fallback: suy luận từ category / referenceType (dữ liệu cũ)
        const category = n.category ?? "general";
        const refType  = n.referenceType ?? "";
        const title    = (n.title ?? "").toLowerCase();
        const content  = (n.content ?? "").toLowerCase();

        // Trích ngày từ nội dung — ưu tiên DD/MM/YYYY (4 số), fallback DD/MM/YY, cuối cùng dùng referenceDate
        const content4 = (n.content ?? "").match(/(\d{2})\/(\d{2})\/(20\d{2})(?!\d)/);
        const content2 = (n.content ?? "").match(/(\d{2})\/(\d{2})\/(\d{2})(?!\d)/);
        const date = content4
          ? `${content4[3]}-${content4[2]}-${content4[1]}`
          : content2
            ? `20${content2[3]}-${content2[2]}-${content2[1]}`
            : (n.referenceDate as string | null | undefined)?.slice(0, 10) ?? null;

        // Bảng điểm / điểm số
        if (title.includes("bảng điểm") || content.includes("bảng điểm") || refType === "score_sheet" || refType === "grade_book") {
          return { screen: "StaffGradeBook", params: n.referenceId ? { gradeBookId: n.referenceId } : {} };
        }
        // Lương / tài chính
        if (category === "finance" || refType === "salary" || refType === "payroll") {
          return { screen: "StaffSalary", params: {} };
        }
        // Bài tập / nội dung
        if (category === "content" || category === "assignment" || ["assignment", "homework", "content"].includes(refType)) {
          return { screen: "StaffCalendar", params: date ? { date } : {} };
        }
        // Lịch dạy / buổi học
        if (["attendance", "schedule", "class", "session"].includes(category) || ["session", "class", "schedule", "attendance"].includes(refType)) {
          return { screen: "StaffCalendar", params: date ? { date } : {} };
        }
        // Công việc
        if (category === "task" || refType === "task") {
          return { screen: "StaffTasks", params: n.referenceId ? { taskId: n.referenceId } : {} };
        }
        return { screen: null, params: {} };
      }

      const items = rows.map((n) => {
        const { screen, params } = resolveStaffDeeplink(n);
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
          deeplink: { screen, params },
        };
      });

      return res.json({ totalUnread, limit, offset, items });
    } catch (err: any) {
      console.error("[Mobile] staff/notifications error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải thông báo" });
    }
  });

  // ── GET /api/mobile/staff/notifications/unread-count ─────────────────────
  // Số thông báo chưa đọc của nhân viên / giáo viên
  // Auth: JWT Bearer token
  // Response: { total: number }
  app.get("/api/mobile/staff/notifications/unread-count", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized. Vui lòng gửi JWT Bearer token." });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên." });

      const rows = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));

      return res.json({ total: rows.length });
    } catch (err: any) {
      console.error("[Mobile] staff/notifications/unread-count error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải số thông báo chưa đọc" });
    }
  });

  // ── PATCH /api/mobile/staff/notifications/:id/read ───────────────────────
  // Đánh dấu 1 thông báo là đã đọc (chỉ được phép nếu thuộc về nhân viên đó)
  // Auth: JWT Bearer token
  // Response: { success: true }
  app.patch("/api/mobile/staff/notifications/:id/read", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized. Vui lòng gửi JWT Bearer token." });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên." });

      const { id } = req.params;
      const updated = await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)))
        .returning({ id: notifications.id });

      if (updated.length === 0) {
        return res.status(404).json({ message: "Không tìm thấy thông báo hoặc bạn không có quyền truy cập." });
      }

      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Mobile] staff/notifications/:id/read error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi đánh dấu đã đọc" });
    }
  });

  // ── PATCH /api/mobile/staff/notifications/read-all ───────────────────────
  // Đánh dấu TẤT CẤT thông báo của nhân viên là đã đọc
  // Auth: JWT Bearer token
  // Response: { success: true }
  app.patch("/api/mobile/staff/notifications/read-all", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized. Vui lòng gửi JWT Bearer token." });

      const staffRecord = await getStaffForUser(user.id);
      if (!staffRecord) return res.status(403).json({ message: "Tài khoản không phải nhân viên." });

      await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));

      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Mobile] staff/notifications/read-all error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi đánh dấu tất cả đã đọc" });
    }
  });

  // ── POST /api/mobile/push-token ───────────────────────────────────────────
  // Lưu Expo Push Token của thiết bị vào database.
  // App gọi endpoint này ngay sau khi đăng nhập và lấy được push token.
  // Upsert theo push_token: một thiết bị có thể đổi chủ (đăng nhập tài khoản khác).
  // Auth: JWT Bearer token hoặc session cookie
  // Request body: { pushToken: string, platform: "android" | "ios" }
  // Response: 200 { success: true }
  app.post("/api/mobile/push-token", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized. Vui lòng gửi JWT Bearer token." });
      }

      const schema = z.object({
        pushToken: z
          .string()
          .min(1, "pushToken là bắt buộc")
          .trim()
          .refine(
            (token) =>
              // Expo Push Token (Expo Go / managed workflow)
              /^Expo(?:nent)?PushToken\[.+\]$/.test(token) ||
              // FCM token (Android standalone / EAS Build) — dài, chứa chữ số + chữ cái + dấu : - _
              /^[A-Za-z0-9\-_:]{100,}$/.test(token) ||
              // APNs token (iOS standalone) — 64 hex chars
              /^[0-9a-f]{64}$/i.test(token),
            "pushToken không đúng định dạng (Expo, FCM hoặc APNs)"
          ),
        platform: z.enum(["android", "ios"], {
          errorMap: () => ({ message: 'platform phải là "android" hoặc "ios"' }),
        }),
        // EAS projectId hiện hành của app (Constants.expoConfig.extra.eas.projectId).
        // Dùng để nhận diện & dọn token "rác" nếu app từng đổi Expo project/tài khoản.
        // Optional để không phá vỡ các bản app cũ chưa gửi field này.
        expoProjectId: z.string().trim().min(1).optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const { pushToken, platform, expoProjectId } = parsed.data;

      // Upsert: nếu token đã tồn tại → cập nhật user_id + is_active + updated_at
      // Nếu chưa → thêm mới. Re-login tự động re-activate token.
      await db
        .insert(pushTokens)
        .values({
          userId: user.id,
          pushToken,
          platform,
          expoProjectId,
          isActive: true,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: pushTokens.pushToken,
          set: {
            userId: user.id,
            platform,
            expoProjectId,
            isActive: true,
            updatedAt: new Date(),
          },
        });

      // Dọn token cũ không có expoProjectId (Expo Go / bản cũ) khi user đăng ký
      // token mới với expoProjectId thật — tránh push double do tích lũy token rác.
      if (expoProjectId) {
        const cleaned = await db
          .update(pushTokens)
          .set({ isActive: false, updatedAt: new Date() })
          .where(
            and(
              eq(pushTokens.userId, user.id),
              isNull(pushTokens.expoProjectId),
              eq(pushTokens.isActive, true),
            ),
          )
          .returning({ id: pushTokens.id });
        if (cleaned.length > 0) {
          console.log(`[PushToken] Deactivated ${cleaned.length} stale null-projectId token(s) for user ${user.id}`);
        }
      }

      console.log(`[PushToken] Saved token for user ${user.id} (${platform})`);
      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Mobile] push-token error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi lưu push token" });
    }
  });

  // ── DELETE /api/mobile/push-token ─────────────────────────────────────────
  // Soft delete push token khi user logout.
  // Không xoá record để giữ lịch sử và tránh insert/delete liên tục.
  // Body: { pushToken: string }  — token cụ thể của thiết bị đang logout.
  // Nếu không truyền pushToken → deactivate toàn bộ token của user (logout all devices).
  app.delete("/api/mobile/push-token", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized." });
      }

      const { pushService } = await import("../services/push.service");
      // Mobile gửi token qua body hoặc query string — chấp nhận cả hai
      const token = (req.body?.pushToken ?? req.query?.pushToken) as string | undefined;

      if (token) {
        // Kiểm tra ownership: chỉ deactivate nếu token thuộc user hiện tại
        await pushService.deactivateTokenForUser(token, user.id);
        console.log(`[PushToken] Deactivated token for user ${user.id}`);
      } else {
        await pushService.deactivateAllForUser(user.id);
        console.log(`[PushToken] Deactivated all tokens for user ${user.id}`);
      }

      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Mobile] push-token delete error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi huỷ push token" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEWS FEED — Mobile API
  // ═══════════════════════════════════════════════════════════════════════════

  const VALID_FEED_CATEGORIES = ["thong-bao", "su-kien", "hoat-dong", "hoc-thuat", "khuyen-mai"] as const;
  const EMPTY_REACTIONS = { "👍": 0, "❤️": 0, "🎉": 0, "😮": 0, "😢": 0, "👏": 0 };
  /**
   * Trả về URL ảnh có thể load được trực tiếp từ mobile client.
   * - Nếu là URL tuyệt đối (http/https) → trả thẳng (S3 bucket public-read).
   * - Nếu là relative proxy URL (/api/media/proxy?url=...) → giải mã lấy S3 URL gốc.
   * - Fallback: prepend base.
   */
  function toMobileImageUrl(url: string | null | undefined, base: string): string | null {
    if (!url) return null;
    // Đã là URL tuyệt đối (S3 hoặc CDN) → dùng thẳng, không qua proxy server
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    // Relative proxy URL: /api/media/proxy?url=<encoded-s3-url>
    const m = url.match(/\/api\/media\/proxy\?url=([^&]+)/);
    if (m) {
      try { return decodeURIComponent(m[1]); } catch { /* fallthrough */ }
    }
    // Fallback: prepend base
    return `${base}${url}`;
  }
  function normalizeMobilePost(post: any, base: string): any {
    return {
      ...post,
      imageUrl:  toMobileImageUrl(post.imageUrl, base) ?? null,
      imageUrls: post.imageUrls?.map((u: string) => toMobileImageUrl(u, base) ?? u) ?? null,
    };
  }

  /** Lấy locationIds mà user (staff hoặc student) thuộc về */
  async function getMobileUserLocationIds(userId: string): Promise<string[] | null> {
    // staffAssignments không có userId — phải join qua bảng staff
    const [staffRecord] = await db
      .select({ id: staff.id })
      .from(staff)
      .where(eq(staff.userId, userId))
      .limit(1);
    if (staffRecord) {
      const rows = await db
        .select({ locationId: staffAssignments.locationId })
        .from(staffAssignments)
        .where(eq(staffAssignments.staffId, staffRecord.id));
      return rows.map(r => r.locationId).filter(Boolean) as string[];
    }
    // Thử student — locations nằm ở bảng student_locations, không phải students
    const [studentRecord] = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.userId, userId))
      .limit(1);
    if (studentRecord) {
      const locRows = await db
        .select({ locationId: studentLocations.locationId })
        .from(studentLocations)
        .where(eq(studentLocations.studentId, studentRecord.id));
      return locRows.map(r => r.locationId).filter(Boolean) as string[];
    }
    return null; // không tìm thấy → trả null (xem tất cả như superadmin)
  }

  /** Điều kiện WHERE location cho mobile user */
  function buildMobileLocationFilter(allowedIds: string[] | null) {
    if (!allowedIds) return undefined; // null = superadmin, xem tất cả
    if (allowedIds.length === 0) return isNull(newsFeedPosts.postLocationIds);
    const bindings = sql.join(allowedIds.map(id => sql`${id}`), sql`, `);
    return or(
      isNull(newsFeedPosts.postLocationIds),
      sql`EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(${newsFeedPosts.postLocationIds}) AS _loc
        WHERE _loc = ANY(ARRAY[${bindings}]::text[])
      )`
    );
  }

  /** Gắn reactions + myReaction vào danh sách posts */
  async function attachReactions(posts: any[], userId: string | null) {
    if (posts.length === 0) return [];
    const postIds = posts.map(p => p.id);
    const [reactionRows, myRows] = await Promise.all([
      db.select({
        postId: newsFeedReactions.postId,
        reaction: newsFeedReactions.reaction,
        count: sql<number>`cast(count(*) as int)`,
      })
        .from(newsFeedReactions)
        .where(inArray(newsFeedReactions.postId, postIds))
        .groupBy(newsFeedReactions.postId, newsFeedReactions.reaction),
      userId
        ? db.select({ postId: newsFeedReactions.postId, reaction: newsFeedReactions.reaction })
            .from(newsFeedReactions)
            .where(and(inArray(newsFeedReactions.postId, postIds), eq(newsFeedReactions.userId, userId)))
        : Promise.resolve([]),
    ]);

    const reactionMap: Record<string, Record<string, number>> = {};
    for (const r of reactionRows) {
      if (!reactionMap[r.postId]) reactionMap[r.postId] = {};
      reactionMap[r.postId][r.reaction] = r.count;
    }
    const myMap: Record<string, string> = {};
    for (const r of myRows) myMap[r.postId] = r.reaction;

    return posts.map(p => ({
      ...p,
      reactions: { ...EMPTY_REACTIONS, ...(reactionMap[p.id] ?? {}) },
      myReaction: myMap[p.id] ?? null,
    }));
  }

  // ─── GET /api/mobile/news-feed ───────────────────────────────────────────
  /**
   * Lấy danh sách bài viết (tất cả category hoặc lọc theo category).
   *
   * Query params:
   *   category  — "thong-bao" | "su-kien" | "hoat-dong" | "hoc-thuat" | "khuyen-mai" | "all"
   *   limit     — số bài mỗi trang (mặc định 20, tối đa 50)
   *   offset    — vị trí bắt đầu (mặc định 0)
   *
   * Response: { data: Post[], total: number, hasMore: boolean }
   */
  app.get("/api/mobile/news-feed", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const limit  = Math.min(parseInt((req.query.limit  as string) || "20", 10), 50);
      const offset = parseInt((req.query.offset as string) || "0", 10);
      const category = req.query.category as string | undefined;

      const allowedIds = await getMobileUserLocationIds(user.id);
      const locFilter  = buildMobileLocationFilter(allowedIds);
      const catFilter  = category && category !== "all"
        ? eq(newsFeedPosts.category, category)
        : undefined;

      const conditions = [locFilter, catFilter].filter(Boolean) as any[];
      const where = conditions.length === 0 ? undefined
        : conditions.length === 1 ? conditions[0]
        : and(...conditions);

      const [posts, [{ total }]] = await Promise.all([
        db.select().from(newsFeedPosts)
          .where(where)
          .orderBy(desc(newsFeedPosts.isPinned), desc(newsFeedPosts.createdAt))
          .limit(limit).offset(offset),
        db.select({ total: sql<number>`cast(count(*) as int)` })
          .from(newsFeedPosts).where(where),
      ]);

      const raw = await attachReactions(posts, user.id);
      const mobileBase1 = (process.env.CENTER_PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      const data = raw.map((p: any) => normalizeMobilePost(p, mobileBase1));
      return res.json({ data, total, hasMore: offset + limit < total });
    } catch (err: any) {
      console.error("[Mobile] news-feed GET error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải bảng tin" });
    }
  });

  // ─── GET /api/mobile/news-feed/promotions ───────────────────────────────
  /**
   * Shortcut: chỉ lấy bài Khuyến mãi — dùng cho banner/widget trang chủ mobile.
   *
   * Query params:
   *   limit   — mặc định 10, tối đa 20
   *   offset  — mặc định 0
   *
   * Response: { data: Post[], total: number, hasMore: boolean }
   */
  app.get("/api/mobile/news-feed/promotions", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const limit  = Math.min(parseInt((req.query.limit  as string) || "10", 10), 20);
      const offset = parseInt((req.query.offset as string) || "0", 10);

      const allowedIds = await getMobileUserLocationIds(user.id);
      const locFilter  = buildMobileLocationFilter(allowedIds);
      const catFilter  = eq(newsFeedPosts.category, "khuyen-mai");

      const conditions = [locFilter, catFilter].filter(Boolean) as any[];
      const where = conditions.length === 1 ? conditions[0] : and(...conditions);

      const [posts, [{ total }]] = await Promise.all([
        db.select().from(newsFeedPosts)
          .where(where)
          .orderBy(desc(newsFeedPosts.createdAt))
          .limit(limit).offset(offset),
        db.select({ total: sql<number>`cast(count(*) as int)` })
          .from(newsFeedPosts).where(where),
      ]);

      const rawPromo = await attachReactions(posts, user.id);
      const mobileBase2 = (process.env.CENTER_PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      const data = rawPromo.map((p: any) => normalizeMobilePost(p, mobileBase2));
      return res.json({ data, total, hasMore: offset + limit < total });
    } catch (err: any) {
      console.error("[Mobile] promotions GET error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải khuyến mãi" });
    }
  });

  // ─── GET /api/mobile/news-feed/:id ──────────────────────────────────────
  /**
   * Chi tiết 1 bài viết kèm reactions.
   * Response: Post & { reactions, myReaction }
   */
  app.get("/api/mobile/news-feed/:id", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const [post] = await db
        .select().from(newsFeedPosts)
        .where(eq(newsFeedPosts.id, req.params.id))
        .limit(1);

      if (!post) return res.status(404).json({ message: "Không tìm thấy bài viết" });

      const [withReactions] = await attachReactions([post], user.id);
      const mobileBase = (process.env.CENTER_PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      const data = normalizeMobilePost(withReactions, mobileBase);
      return res.json(data);
    } catch (err: any) {
      console.error("[Mobile] news-feed/:id GET error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải bài viết" });
    }
  });

  // ─── POST /api/mobile/news-feed/:id/react ───────────────────────────────
  /**
   * Thả / bỏ reaction cho 1 bài. Cùng reaction → toggle off.
   * Body: { reaction: "👍" | "❤️" | "🎉" | "😮" | "😢" | "👏" }
   * Response: { myReaction: string | null }
   */
  app.post("/api/mobile/news-feed/:id/react", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const parsed = z.object({
        reaction: z.enum(["👍", "❤️", "🎉", "😮", "😢", "👏"]),
      }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "reaction không hợp lệ", errors: parsed.error.flatten() });

      const { reaction } = parsed.data;
      const postId  = req.params.id;
      const userId  = user.id;

      const [existing] = await db
        .select().from(newsFeedReactions)
        .where(and(eq(newsFeedReactions.postId, postId), eq(newsFeedReactions.userId, userId)))
        .limit(1);

      if (existing) {
        if (existing.reaction === reaction) {
          await db.delete(newsFeedReactions)
            .where(and(eq(newsFeedReactions.postId, postId), eq(newsFeedReactions.userId, userId)));
          return res.json({ myReaction: null });
        }
        await db.update(newsFeedReactions)
          .set({ reaction })
          .where(and(eq(newsFeedReactions.postId, postId), eq(newsFeedReactions.userId, userId)));
        return res.json({ myReaction: reaction });
      }

      await db.insert(newsFeedReactions).values({ postId, userId, reaction });
      return res.json({ myReaction: reaction });
    } catch (err: any) {
      console.error("[Mobile] news-feed react error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi thả reaction" });
    }
  });

  // ─── POST /api/mobile/staff/news-feed ───────────────────────────────────
  /**
   * Staff tạo bài viết mới (gồm cả Khuyến mãi).
   *
   * Body:
   *   content    string (bắt buộc)
   *   category   "thong-bao" | "su-kien" | "hoat-dong" | "hoc-thuat" | "khuyen-mai"
   *   imageUrls  string[]  (tuỳ chọn, URLs đã upload lên S3)
   *   locationIds string[] (tuỳ chọn; mặc định = tất cả cơ sở của staff)
   *
   * Response: { success: true, data: Post }
   */
  app.post("/api/mobile/staff/news-feed", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRow = await getStaffForUser(user.id);
      if (!staffRow) return res.status(403).json({ message: "Chỉ nhân viên mới được đăng bài" });

      const schema = z.object({
        content:     z.string().min(1, "Nội dung không được để trống").max(10000),
        category:    z.enum(VALID_FEED_CATEGORIES),
        imageUrls:   z.array(z.string().min(1)).optional().default([]),
        locationIds: z.array(z.string().uuid()).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.flatten() });

      const body = parsed.data;
      const allowedIds = await getMobileUserLocationIds(user.id) ?? [];

      let postLocationIds: string[] | null = null;
      if (body.locationIds && body.locationIds.length > 0) {
        postLocationIds = body.locationIds.filter(id => allowedIds.includes(id));
        if (postLocationIds.length === 0) postLocationIds = allowedIds.length > 0 ? allowedIds : null;
      } else {
        postLocationIds = allowedIds.length > 0 ? allowedIds : null;
      }

      const urls = body.imageUrls ?? [];
      const [post] = await db.insert(newsFeedPosts).values({
        authorId:        user.id,
        authorName:      staffRow.fullName ?? "Nhân viên",
        category:        body.category,
        content:         body.content,
        imageUrl:        urls[0] ?? null,
        imageUrls:       urls.length > 0 ? urls : null,
        postLocationIds,
      }).returning();

      return res.status(201).json({
        success: true,
        data: { ...post, reactions: EMPTY_REACTIONS, myReaction: null },
      });
    } catch (err: any) {
      console.error("[Mobile] staff/news-feed POST error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi đăng bài" });
    }
  });

  // ─── PATCH /api/mobile/staff/news-feed/:id ──────────────────────────────
  /**
   * Staff chỉnh sửa bài viết của chính mình.
   * Body: { content?, category?, imageUrls? }
   * Response: { success: true, data: Post }
   */
  app.patch("/api/mobile/staff/news-feed/:id", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const [existing] = await db
        .select({ authorId: newsFeedPosts.authorId })
        .from(newsFeedPosts)
        .where(eq(newsFeedPosts.id, req.params.id))
        .limit(1);

      if (!existing) return res.status(404).json({ message: "Không tìm thấy bài viết" });
      if (existing.authorId !== user.id) return res.status(403).json({ message: "Bạn chỉ được sửa bài của chính mình" });

      const schema = z.object({
        content:   z.string().min(1).max(10000).optional(),
        category:  z.enum(VALID_FEED_CATEGORIES).optional(),
        imageUrls: z.array(z.string().min(1)).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.flatten() });

      const { imageUrls, ...rest } = parsed.data;
      const setData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
      if (imageUrls !== undefined) {
        setData.imageUrls = imageUrls.length > 0 ? imageUrls : null;
        setData.imageUrl  = imageUrls[0] ?? null;
      }

      const [updated] = await db
        .update(newsFeedPosts).set(setData as any)
        .where(eq(newsFeedPosts.id, req.params.id))
        .returning();

      return res.json({ success: true, data: updated });
    } catch (err: any) {
      console.error("[Mobile] staff/news-feed PATCH error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi cập nhật bài viết" });
    }
  });

  // ─── DELETE /api/mobile/staff/news-feed/:id ─────────────────────────────
  /**
   * Staff xoá bài viết của chính mình.
   * Response: { success: true }
   */
  app.delete("/api/mobile/staff/news-feed/:id", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const [existing] = await db
        .select({ authorId: newsFeedPosts.authorId, imageUrl: newsFeedPosts.imageUrl, imageUrls: newsFeedPosts.imageUrls })
        .from(newsFeedPosts)
        .where(eq(newsFeedPosts.id, req.params.id))
        .limit(1);

      if (!existing) return res.status(404).json({ message: "Không tìm thấy bài viết" });
      if (existing.authorId !== user.id) return res.status(403).json({ message: "Bạn chỉ được xoá bài của chính mình" });

      await db.delete(newsFeedPosts).where(eq(newsFeedPosts.id, req.params.id));

      // Trừ dung lượng các ảnh đã xóa
      const { subtractFilesByUrls } = await import("../lib/storage-usage");
      const urls = [
        ...(existing.imageUrl ? [existing.imageUrl] : []),
        ...(Array.isArray(existing.imageUrls) ? (existing.imageUrls as string[]) : []),
      ];
      subtractFilesByUrls(urls).catch(() => {});

      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Mobile] staff/news-feed DELETE error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi xoá bài viết" });
    }
  });

  // ─── POST /api/mobile/staff/news-feed/upload-image ──────────────────────
  /**
   * Upload ảnh cho bài viết news-feed lên S3.
   * Form-data: file (image/*)
   * Response: { url: string }
   */
  app.post("/api/mobile/staff/news-feed/upload-image", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const staffRow = await getStaffForUser(user.id);
      if (!staffRow) return res.status(403).json({ message: "Chỉ nhân viên mới được upload ảnh" });

      const multer = (await import("multer")).default;
      const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }).single("file");

      upload(req, res, async (err) => {
        if (err) return res.status(400).json({ message: "Lỗi upload file", detail: err.message });
        const file = (req as any).file as Express.Multer.File | undefined;
        if (!file) return res.status(400).json({ message: "Không có file nào được gửi" });
        if (!file.mimetype.startsWith("image/")) return res.status(400).json({ message: "Chỉ chấp nhận file ảnh" });

        try {
          const { uploadFileToS3 } = await import("../lib/s3");
          const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
          const s3Url = await uploadFileToS3(file.buffer, originalName, file.mimetype);
          const mobileBase = (process.env.CENTER_PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
          const url = `${mobileBase}/api/media/proxy?url=${encodeURIComponent(s3Url)}`;
          return res.json({ url });
        } catch (s3Err: any) {
          console.error("[Mobile] news-feed upload-image S3 error:", s3Err);
          return res.status(500).json({ message: "Lỗi upload lên S3" });
        }
      });
    } catch (err: any) {
      console.error("[Mobile] news-feed upload-image error:", err);
      return res.status(500).json({ message: err.message || "Lỗi upload ảnh" });
    }
  });
}
