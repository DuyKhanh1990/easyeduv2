import type { Express } from "express";
import { api } from "@shared/routes";
import { db } from "../db";
import { classSessions, studentSessions, students, classes, shiftTemplates, studentLocations, staff, studentAttendanceQrTokens } from "@shared/schema";
import { eq, and, gte, lte, inArray, sql, isNull, ne } from "drizzle-orm";
import { decrypt } from "../lib/encryption";
import { getAttendanceTimingWindow } from "../lib/attendance-limit";
import { ensureStudentQrToken, hashQrToken } from "../lib/attendance-qr";

function getBangkokDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function assertQrStudentAccess(studentId: string, req: any): Promise<any> {
  const [student] = await db
    .select({ id: students.id, code: students.code, fullName: students.fullName })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);

  if (!student) {
    const err: any = new Error("Không tìm thấy học viên.");
    err.status = 404;
    throw err;
  }

  if (!req.isSuperAdmin) {
    const locations = await db
      .select({ locationId: studentLocations.locationId })
      .from(studentLocations)
      .where(eq(studentLocations.studentId, studentId));
    const locationIds = new Set((req.allowedLocationIds ?? []).filter(Boolean));
    if (!locations.some((row) => row.locationId && locationIds.has(row.locationId))) {
      const err: any = new Error("Bạn không có quyền truy cập học viên này.");
      err.status = 403;
      throw err;
    }
  }

  return student;
}

export function registerAttendanceRoutes(app: Express): void {
  app.get(api.attendanceQr.getStudentToken.path, async (req, res) => {
    try {
      const studentId = String(req.params.studentId);
      const student = await assertQrStudentAccess(studentId, req);
      const qr = await ensureStudentQrToken(student.id, req.user?.id ?? null);

      return res.json({
        enabled: true,
        token: qr.token,
        createdAt: qr.createdAt,
      });
    } catch (err: any) {
      res.status(err.status ?? 400).json({ message: err.message || "Không thể tải mã QR." });
    }
  });

  app.post(api.attendanceQr.createStudentToken.path, async (req, res) => {
    try {
      const student = await assertQrStudentAccess(String(req.params.studentId), req);
      const qr = await ensureStudentQrToken(student.id, req.user?.id ?? null);

      return res.status(201).json({
        enabled: true,
        student: { id: student.id, code: student.code, fullName: student.fullName },
        token: qr.token,
        createdAt: qr.createdAt,
      });
    } catch (err: any) {
      res.status(err.status ?? 400).json({ message: err.message || "Không thể tạo mã QR." });
    }
  });

  app.get(api.attendanceQr.scan.path, async (req, res) => {
    try {
      if (req.isStudent) return res.status(403).json({ message: "Chỉ staff mới được quét QR điểm danh." });

      const token = String(req.params.token || "").trim();
      if (!token || token.length < 20) return res.status(400).json({ message: "Mã QR không hợp lệ." });

      const [qrRow] = await db
        .select({ studentId: studentAttendanceQrTokens.studentId })
        .from(studentAttendanceQrTokens)
        .where(and(
          eq(studentAttendanceQrTokens.tokenHash, hashQrToken(token)),
          isNull(studentAttendanceQrTokens.revokedAt),
        ))
        .limit(1);

      if (!qrRow) return res.status(404).json({ message: "Mã QR không hợp lệ hoặc đã bị thu hồi." });

      const student = await assertQrStudentAccess(qrRow.studentId, req);
      const today = getBangkokDateKey();
      const rows = await db
        .select({
          studentSessionId: studentSessions.id,
          classSessionId: classSessions.id,
          classId: classes.id,
          className: classes.name,
          classCode: classes.classCode,
          sessionDate: classSessions.sessionDate,
          sessionIndex: classSessions.sessionIndex,
          sessionStatus: classSessions.status,
          studentSessionStatus: studentSessions.status,
          attendanceStatus: studentSessions.attendanceStatus,
          teacherIds: classSessions.teacherIds,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
        })
        .from(studentSessions)
        .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .where(and(
          eq(studentSessions.studentId, student.id),
          eq(classSessions.sessionDate, today),
          ne(studentSessions.status, "cancelled"),
          ne(classSessions.status, "cancelled"),
        ));

      const roleIds = req.roleIds ?? [];
      const candidates = [];
      for (const row of rows) {
        const timing = await getAttendanceTimingWindow(
          row.classSessionId,
          roleIds,
          req.isSuperAdmin ?? false,
        );
        if (timing?.isVisible) candidates.push({ row, timing });
      }

      if (candidates.length === 0) {
        return res.status(404).json({
          code: "NO_VISIBLE_SESSION",
          message: "Hiện không có lịch học để điểm danh.",
        });
      }

      const now = new Date();
      candidates.sort((a, b) => {
        const aStarted = a.timing.sessionStart <= now ? 0 : 1;
        const bStarted = b.timing.sessionStart <= now ? 0 : 1;
        return aStarted - bStarted || a.timing.sessionStart.getTime() - b.timing.sessionStart.getTime();
      });

      const activeCandidates = candidates.filter((candidate) => candidate.timing.sessionStart <= now);
      const upcomingCandidates = candidates.filter((candidate) => candidate.timing.sessionStart > now);
      if (activeCandidates.length > 1 || (
        activeCandidates.length === 0 &&
        upcomingCandidates.length > 1 &&
        upcomingCandidates[0].timing.sessionStart.getTime() === upcomingCandidates[1].timing.sessionStart.getTime()
      )) {
        return res.status(409).json({
          code: "AMBIGUOUS_SESSION",
          message: "Có nhiều lịch học trùng thời gian. Vui lòng xử lý lịch trùng trước khi điểm danh QR.",
        });
      }
      const selected = activeCandidates[0] ?? upcomingCandidates[0];

      const teacherIds = selected.row.teacherIds ?? [];
      const teacherRows = teacherIds.length > 0
        ? await db.select({ id: staff.id, fullName: staff.fullName, code: staff.code }).from(staff).where(inArray(staff.id, teacherIds))
        : [];
      const teacherNameMap = new Map(teacherRows.map((teacher) => [teacher.id, teacher.fullName || teacher.code || ""]));

      return res.json({
        student: {
          id: student.id,
          code: student.code,
          fullName: student.fullName,
        },
        session: {
          studentSessionId: selected.row.studentSessionId,
          classSessionId: selected.row.classSessionId,
          classId: selected.row.classId,
          className: selected.row.className,
          classCode: selected.row.classCode,
          sessionDate: selected.row.sessionDate,
          sessionIndex: selected.row.sessionIndex,
          startTime: selected.row.startTime,
          endTime: selected.row.endTime,
          teacherName: teacherIds.map((id: string) => teacherNameMap.get(id)).filter(Boolean).join(", "),
          attendanceStatus: selected.row.attendanceStatus || "pending",
        },
        attendance: {
          canAttend: selected.timing.canAttend,
          displayFrom: selected.timing.displayFrom.toISOString(),
          openAt: selected.timing.attendanceOpenAt.toISOString(),
          latestAt: selected.timing.attendanceLatestAt.toISOString(),
        },
      });
    } catch (err: any) {
      res.status(err.status ?? 400).json({ message: err.message || "Không thể xử lý mã QR." });
    }
  });

  app.get(api.attendance.list.path, async (req, res) => {
    try {
      const { classes: classesStr = "", students: studentsStr = "", shift: shiftStr = "all", dateFrom = "", dateTo = "" } = req.query;
      const classIds = classesStr ? (classesStr as string).split(",").filter(Boolean) : [];
      const studentIds = studentsStr ? (studentsStr as string).split(",").filter(Boolean) : [];

      const allowedLocationIds = req.allowedLocationIds;
      const isSuperAdmin = req.isSuperAdmin;

      if (!isSuperAdmin && allowedLocationIds && allowedLocationIds.length === 0) {
        return res.json([]);
      }

      const startDate = dateFrom ? new Date(dateFrom as string) : new Date();
      const endDate = dateTo ? new Date(dateTo as string) : new Date();
      const startStr = startDate.toISOString().split("T")[0];
      const endStr = endDate.toISOString().split("T")[0];

      const conditions: any[] = [];
      conditions.push(gte(classSessions.sessionDate, startStr));
      conditions.push(lte(classSessions.sessionDate, endStr));

      if (classIds.length > 0) {
        conditions.push(inArray(studentSessions.classId, classIds));
      }
      if (studentIds.length > 0) {
        conditions.push(inArray(studentSessions.studentId, studentIds));
      }
      const shiftValue = typeof shiftStr === "string" ? shiftStr.trim() : "";
      if (shiftValue && shiftValue !== "all") {
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(shiftValue)) {
          conditions.push(eq(classSessions.shiftTemplateId, shiftValue));
        } else {
          // Keep existing bookmarked/old clients working while the UI migrates
          // from hardcoded time ranges to configured shift-template IDs.
          const legacyTimeMatch = shiftValue.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
          if (legacyTimeMatch) {
            conditions.push(
              eq(shiftTemplates.startTime, legacyTimeMatch[1]),
              eq(shiftTemplates.endTime, legacyTimeMatch[2]),
            );
          }
        }
      }

      if (!isSuperAdmin && allowedLocationIds && allowedLocationIds.length > 0) {
        conditions.push(inArray(classes.locationId, allowedLocationIds));
        conditions.push(sql`EXISTS (SELECT 1 FROM student_locations WHERE student_locations.student_id = students.id AND student_locations.location_id = ANY(ARRAY[${sql.raw(allowedLocationIds.map((id: string) => `'${id}'`).join(','))}]::uuid[]))`);
      }

      const results = await db
        .select({
          id: studentSessions.id,
          studentId: studentSessions.studentId,
          classId: studentSessions.classId,
          classSessionId: studentSessions.classSessionId,
          status: studentSessions.status,
          attendanceStatus: studentSessions.attendanceStatus,
          note: studentSessions.note,
          attendanceNote: studentSessions.attendanceNote,
          sessionOrder: studentSessions.sessionOrder,
          studentCode: students.code,
          studentName: students.fullName,
          classCode: classes.classCode,
          onlineLink: classes.onlineLink,
          learningFormat: classSessions.learningFormat,
          sessionDate: classSessions.sessionDate,
          weekday: classSessions.weekday,
          sessionIndex: classSessions.sessionIndex,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
          teacherIds: classSessions.teacherIds,
          onlineClickedAt: studentSessions.onlineClickedAt,
          onlineEndedAt: studentSessions.onlineEndedAt,
        })
        .from(studentSessions)
        .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
        .innerJoin(students, eq(studentSessions.studentId, students.id))
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(classes.classCode, students.code);

      const totalSessionsMap = new Map<string, number>();
      const resultClassIds = Array.from(new Set(results.map((r: any) => r.classId)));
      if (resultClassIds.length > 0) {
        const countRows = await db
          .select({
            studentId: studentSessions.studentId,
            classId: studentSessions.classId,
            total: sql<number>`count(*)::int`,
          })
          .from(studentSessions)
          .where(inArray(studentSessions.classId, resultClassIds))
          .groupBy(studentSessions.studentId, studentSessions.classId);
        countRows.forEach((row: any) => {
          totalSessionsMap.set(`${row.studentId}-${row.classId}`, row.total);
        });
      }

      // Batch-lookup teacher names for all unique teacherIds across all results
      const allTeacherIds = Array.from(new Set(results.flatMap((r: any) => r.teacherIds || [])));
      const staffNameMap = new Map<string, string>();
      if (allTeacherIds.length > 0) {
        const staffRows = await db
          .select({ id: staff.id, fullName: staff.fullName, code: staff.code })
          .from(staff)
          .where(inArray(staff.id, allTeacherIds));
        staffRows.forEach((s) => staffNameMap.set(s.id, s.fullName || s.code || ""));
      }

      const dayNames = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
      const formatted = results.map((r: any) => {
        const totalSessions = totalSessionsMap.get(`${r.studentId}-${r.classId}`) || 0;
        const sessionOrder = r.sessionOrder || 1;
        const teacherIds = r.teacherIds || [];
        const teacherName = teacherIds.map((id: string) => staffNameMap.get(id) || "").filter(Boolean).join(", ");
        return {
          id: r.id,
          studentId: r.studentId,
          classId: r.classId,
          studentCode: r.studentCode,
          studentName: r.studentName,
          className: r.classCode,
          dayOfWeek: dayNames[r.weekday] || "?",
          sessionDate: r.sessionDate,
          shift: `${r.startTime} - ${r.endTime}`,
          sessionOrder: sessionOrder,
          totalSessions: totalSessions,
          attendanceStatus: r.attendanceStatus || "pending",
          attendanceNote: r.attendanceNote || "",
          teacherIds,
          teacherName,
          note: r.note || "",
          onlineLink: r.onlineLink ?? null,
          learningFormat: r.learningFormat ?? "offline",
          onlineClickedAt: r.onlineClickedAt
            ? (r.onlineClickedAt instanceof Date ? r.onlineClickedAt.toISOString() : String(r.onlineClickedAt))
            : null,
          onlineEndedAt: r.onlineEndedAt
            ? (r.onlineEndedAt instanceof Date ? r.onlineEndedAt.toISOString() : String(r.onlineEndedAt))
            : null,
          endTime: r.endTime ?? null,
        };
      });

      res.json(formatted);
    } catch (err: any) {
      console.error("Attendance error:", err);
      res.status(400).json({ message: err.message || "Lỗi khi tải dữ liệu" });
    }
  });
}
