import type { Express } from "express";
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  classSessions,
  classes,
  locations,
  shiftTemplates,
  staff,
  studentLeaveRequests,
  studentLocations,
  studentSessions,
  students,
} from "@shared/schema";
import { storage } from "../storage";
import { sendNotificationToMany } from "../lib/notification";

const LEAVE_STATUSES = ["pending", "approved", "rejected"] as const;
const STATUS_SCHEMA = z.enum(LEAVE_STATUSES);
const ATTENDANCE_APPROVAL_MODES = ["unchanged", "applied"] as const;
const ATTENDANCE_APPROVAL_MODE_SCHEMA = z.enum(ATTENDANCE_APPROVAL_MODES);

const requestInputSchema = z.object({
  locationId: z.string().uuid(),
  studentIds: z.array(z.string().uuid()).min(1),
  scheduleIds: z.array(z.string().uuid()).default([]),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  description: z.string().trim().max(5000).optional().nullable(),
  status: STATUS_SCHEMA.optional(),
  attendanceApprovalMode: ATTENDANCE_APPROVAL_MODE_SCHEMA.optional().nullable(),
  rejectionReason: z.string().trim().max(5000).optional().nullable(),
});

const updateInputSchema = z.object({
  locationId: z.string().uuid().optional(),
  scheduleIds: z.array(z.string().uuid()).optional(),
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
  description: z.string().trim().max(5000).optional().nullable(),
  status: STATUS_SCHEMA.optional(),
  attendanceApprovalMode: ATTENDANCE_APPROVAL_MODE_SCHEMA.optional().nullable(),
  rejectionReason: z.string().trim().max(5000).optional().nullable(),
});

const selfRequestInputSchema = z.object({
  studentId: z.string().uuid().optional(),
  scheduleIds: z.array(z.string().uuid()).default([]),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  description: z.string().trim().max(5000).optional().nullable(),
});

type ScheduleRow = {
  studentSessionId: string;
  classSessionId: string;
  classId: string;
  studentId: string;
  className: string;
  classCode: string;
  sessionDate: string;
  shiftName: string | null;
  startTime: string | null;
  endTime: string | null;
  teacherIds: string[] | null;
  teacherNames?: string[];
};

function parseIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => String(item).split(",")).filter(Boolean);
  return typeof value === "string" ? value.split(",").filter(Boolean) : [];
}

function formatSchedule(row: ScheduleRow) {
  return {
    id: row.studentSessionId,
    classSessionId: row.classSessionId,
    studentId: row.studentId,
    className: row.className,
    classCode: row.classCode,
    date: row.sessionDate,
    time: [row.startTime, row.endTime].filter(Boolean).join(" – "),
    shiftName: row.shiftName,
    teachers: row.teacherNames?.join(", ") ?? "",
  };
}

async function findSchedules({
  studentIds,
  locationId,
  scheduleIds,
  startDate,
  endDate,
}: {
  studentIds: string[];
  locationId: string;
  scheduleIds?: string[];
  startDate: string;
  endDate: string;
}): Promise<ScheduleRow[]> {
  const conditions = [
    inArray(studentSessions.studentId, studentIds),
    eq(classes.locationId, locationId),
    ne(studentSessions.status, "cancelled"),
    ne(classSessions.status, "cancelled"),
    gte(classSessions.sessionDate, startDate),
    lte(classSessions.sessionDate, endDate),
  ];
  if (scheduleIds?.length) conditions.push(inArray(studentSessions.id, scheduleIds));

  const rows = await db
    .select({
      studentSessionId: studentSessions.id,
      classSessionId: classSessions.id,
      classId: classes.id,
      studentId: studentSessions.studentId,
      className: classes.name,
      classCode: classes.classCode,
      sessionDate: classSessions.sessionDate,
      shiftName: shiftTemplates.name,
      startTime: shiftTemplates.startTime,
      endTime: shiftTemplates.endTime,
      teacherIds: classSessions.teacherIds,
    })
    .from(studentSessions)
    .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .leftJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
    .where(and(...conditions))
    .orderBy(asc(classSessions.sessionDate), asc(shiftTemplates.startTime));

  const teacherIds = [...new Set(rows.flatMap((row) => row.teacherIds ?? []))];
  if (teacherIds.length === 0) return rows;

  const teacherRows = await db
    .select({ id: staff.id, fullName: staff.fullName })
    .from(staff)
    .where(inArray(staff.id, teacherIds));
  const teacherMap = new Map(teacherRows.map((teacher) => [teacher.id, teacher.fullName]));

  return rows.map((row) => ({
    ...row,
    teacherNames: (row.teacherIds ?? [])
      .map((teacherId) => teacherMap.get(teacherId))
      .filter((name): name is string => Boolean(name)),
  }));
}

function checkLocationAccess(req: any, locationId: string): boolean {
  return !!req.isSuperAdmin || (req.allowedLocationIds ?? []).includes(locationId);
}

function validateDateRange(startDate: string, endDate: string): string | null {
  if (!startDate || !endDate) return "Vui lòng chọn thời gian xin nghỉ";
  if (startDate > endDate) return "Ngày bắt đầu không được sau ngày kết thúc";
  return null;
}

async function getSelfLeaveContext(req: any) {
  const userId = req.user?.id;
  if (!userId) return null;
  const [accountStudent] = await db
    .select({
      id: students.id,
      code: students.code,
      fullName: students.fullName,
      type: students.type,
    })
    .from(students)
    .where(eq(students.userId, userId))
    .limit(1);
  if (!accountStudent) return null;

  if (accountStudent.type === "Phụ huynh") {
    const linkedStudents = await db
      .select({
        id: students.id,
        code: students.code,
        fullName: students.fullName,
        type: students.type,
      })
      .from(students)
      .where(sql`${students.parentIds} @> ARRAY[${accountStudent.id}]::uuid[]`)
      .orderBy(asc(students.fullName));
    return { viewerType: "parent" as const, students: linkedStudents };
  }

  return { viewerType: "student" as const, students: [accountStudent] };
}

async function getStudentAssignedLocations(studentId: string) {
  return db
    .select({
      id: locations.id,
      name: locations.name,
    })
    .from(studentLocations)
    .innerJoin(locations, eq(studentLocations.locationId, locations.id))
    .where(eq(studentLocations.studentId, studentId))
    .orderBy(asc(locations.name));
}

function formatNotificationDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${Number(day)}/${Number(month)}/${year}`;
}

async function notifyStaffAboutStudentLeave({
  requestId,
  studentName,
  description,
  schedules,
}: {
  requestId: string;
  studentName: string;
  description?: string | null;
  schedules: ScheduleRow[];
}) {
  if (schedules.length === 0) return;

  const classIds = [...new Set(schedules.map((schedule) => schedule.classId))];
  const classRows = await db
    .select({
      id: classes.id,
      managerIds: classes.managerIds,
    })
    .from(classes)
    .where(inArray(classes.id, classIds));

  const staffIds = [...new Set([
    ...schedules.flatMap((schedule) => schedule.teacherIds ?? []),
    ...classRows.flatMap((classRow) => classRow.managerIds ?? []),
  ])];
  if (staffIds.length === 0) return;

  const staffRows = await db
    .select({ id: staff.id, userId: staff.userId })
    .from(staff)
    .where(inArray(staff.id, staffIds));
  const recipientIds = [...new Set(
    staffRows.map((staffRow) => staffRow.userId).filter((userId): userId is string => Boolean(userId)),
  )];
  if (recipientIds.length === 0) return;

  const classLabels = [...new Set(
    schedules.map((schedule) => schedule.className),
  )];
  const dateLabels = [...new Set(schedules.map((schedule) => schedule.sessionDate))].sort();
  const dateText = dateLabels.length === 1
    ? `ngày ${formatNotificationDate(dateLabels[0])}`
    : `từ ngày ${formatNotificationDate(dateLabels[0])} - đến ngày ${formatNotificationDate(dateLabels[dateLabels.length - 1])}`;
  const reasonText = description?.trim() || "Không có lý do";

  await sendNotificationToMany(recipientIds, {
    title: "Đơn xin nghỉ học.",
    content: `Học viên ${studentName}, xin nghỉ ${dateText} lớp: ${classLabels.join(", ")}, Lý do: ${reasonText}`,
    category: "student_leave",
    referenceId: requestId,
    referenceType: "student_leave_request",
    referenceDate: schedules[0]?.sessionDate,
    deeplink: {
      screen: "StaffLeaveRequests",
      params: { requestId },
    },
  });
}

async function notifyStudentAndParentsAboutLeaveStatus({
  requestId,
  studentId,
  startDate,
  endDate,
  scheduleSnapshot,
  status,
  rejectionReason,
}: {
  requestId: string;
  studentId: string;
  startDate: string;
  endDate: string;
  scheduleSnapshot: unknown;
  status: "approved" | "rejected";
  rejectionReason?: string | null;
}) {
  const [student] = await db
    .select({ userId: students.userId, fullName: students.fullName })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);
  if (!student) return;

  const parentRows = await db
    .select({ userId: students.userId })
    .from(students)
    .where(sql`${students.parentIds} @> ARRAY[${studentId}]::uuid[]`);
  const recipientIds = [...new Set(
    [student.userId, ...parentRows.map((parent) => parent.userId)]
      .filter((userId): userId is string => Boolean(userId)),
  )];
  if (recipientIds.length === 0) return;

  const snapshots = Array.isArray(scheduleSnapshot)
    ? scheduleSnapshot as Array<{ className?: unknown; date?: unknown }>
    : [];
  const classLabels = [...new Set(
    snapshots
      .map((snapshot) => typeof snapshot.className === "string" ? snapshot.className : "")
      .filter(Boolean),
  )];
  const dateLabels = [...new Set(
    snapshots
      .map((snapshot) => typeof snapshot.date === "string" ? snapshot.date.slice(0, 10) : "")
      .filter(Boolean),
  )].sort();
  const firstDate = dateLabels[0] || startDate;
  const lastDate = dateLabels[dateLabels.length - 1] || endDate;
  const dateText = firstDate === lastDate
    ? `ngày ${formatNotificationDate(firstDate)}`
    : `từ ngày ${formatNotificationDate(firstDate)} - đến ngày ${formatNotificationDate(lastDate)}`;
  const classText = classLabels.length > 0 ? classLabels.join(", ") : "—";
  const statusText = status === "approved" ? "Đã duyệt" : "Từ chối";
  const rejectionText = status === "rejected" && rejectionReason?.trim()
    ? `, Lý do: ${rejectionReason.trim()}`
    : "";

  await sendNotificationToMany(recipientIds, {
    title: "Đơn xin nghỉ học.",
    content: `Đơn xin nghỉ, Học viên ${student.fullName}, ${dateText} Lớp: ${classText}, Trạng thái: ${statusText}${rejectionText}`,
    category: "student_leave",
    referenceId: requestId,
    referenceType: "student_leave_request",
    referenceDate: firstDate,
    deeplink: {
      screen: "StudentLeaveRequests",
      params: { requestId },
    },
  });
}

export function registerStudentLeaveRequestRoutes(app: Express) {
  app.get("/api/student-leave-requests/self/context", async (req, res) => {
    try {
      const context = await getSelfLeaveContext(req);
      if (!context) return res.status(403).json({ message: "Tài khoản này không phải tài khoản học viên/phụ huynh." });

      const studentsWithLocations = await Promise.all(context.students.map(async (student) => ({
        id: student.id,
        code: student.code,
        fullName: student.fullName,
        locations: await getStudentAssignedLocations(student.id),
      })));
      res.json({
        viewerType: context.viewerType,
        students: studentsWithLocations,
      });
    } catch (error) {
      console.error("[StudentLeaveRequests] self context error:", error);
      res.status(500).json({ message: "Không thể tải thông tin học viên." });
    }
  });

  app.get("/api/student-leave-requests/self/schedules", async (req, res) => {
    try {
      const context = await getSelfLeaveContext(req);
      if (!context) return res.status(403).json({ message: "Tài khoản này không phải tài khoản học viên/phụ huynh." });
      const requestedStudentId = String(req.query.studentId ?? "");
      const student = context.students.find((item) =>
        context.viewerType === "student" || item.id === requestedStudentId
      );
      if (!student) return res.status(403).json({ message: "Học viên không thuộc tài khoản này." });

      const startDate = String(req.query.startDate ?? "");
      const endDate = String(req.query.endDate ?? "");
      const dateError = validateDateRange(startDate, endDate);
      if (dateError) return res.status(400).json({ message: dateError });

      const assignedLocations = await getStudentAssignedLocations(student.id);
      const locationMap = new Map(assignedLocations.map((location) => [location.id, location.name]));
      const scheduleGroups = await Promise.all(
        assignedLocations.map(async (location) => {
          const schedules = await findSchedules({
            studentIds: [student.id],
            locationId: location.id,
            startDate,
            endDate,
          });
          return schedules.map((schedule) => ({
            ...formatSchedule(schedule),
            locationId: location.id,
            locationName: locationMap.get(location.id) ?? location.name,
          }));
        }),
      );

      res.json(scheduleGroups.flat());
    } catch (error) {
      console.error("[StudentLeaveRequests] self schedule list error:", error);
      res.status(500).json({ message: "Không thể tải lịch học." });
    }
  });

  app.post("/api/student-leave-requests/self", async (req, res) => {
    try {
      const input = selfRequestInputSchema.parse(req.body);
      const context = await getSelfLeaveContext(req);
      if (!context) return res.status(403).json({ message: "Tài khoản này không phải tài khoản học viên/phụ huynh." });
      const student = context.students.find((item) =>
        context.viewerType === "student" || item.id === input.studentId
      );
      if (!student) return res.status(403).json({ message: "Học viên không thuộc tài khoản này." });
      const dateError = validateDateRange(input.startDate, input.endDate);
      if (dateError) return res.status(400).json({ message: dateError });

      const assignedLocations = await getStudentAssignedLocations(student.id);
      if (assignedLocations.length === 0) {
        return res.status(400).json({ message: "Học viên chưa được gán cơ sở. Vui lòng liên hệ trung tâm." });
      }

      const scheduleGroups = await Promise.all(
        assignedLocations.map(async (location) => ({
          location,
          schedules: await findSchedules({
            studentIds: [student.id],
            locationId: location.id,
            startDate: input.startDate,
            endDate: input.endDate,
          }),
        })),
      );
      const allSchedules = scheduleGroups.flatMap(({ schedules }) => schedules);
      if (allSchedules.length > 0 && input.scheduleIds.length === 0) {
        return res.status(400).json({ message: "Vui lòng chọn ít nhất một lịch học muốn xin nghỉ." });
      }

      const scheduleById = new Map(allSchedules.map((schedule) => [schedule.studentSessionId, schedule]));
      const selectedSchedules = input.scheduleIds.map((scheduleId) => scheduleById.get(scheduleId));
      if (selectedSchedules.some((schedule) => !schedule)) {
        return res.status(400).json({ message: "Lịch học được chọn không thuộc học viên hoặc khoảng thời gian xin nghỉ." });
      }
      const selectedScheduleIdSet = new Set(input.scheduleIds);
      const groupsToCreate = allSchedules.length === 0
        ? scheduleGroups
        : scheduleGroups.filter(({ schedules }) => schedules.some((schedule) => selectedScheduleIdSet.has(schedule.studentSessionId)));
      const notificationGroups = groupsToCreate.map(({ location, schedules }) => ({
        location,
        schedules: allSchedules.length === 0
          ? schedules
          : schedules.filter((schedule) => selectedScheduleIdSet.has(schedule.studentSessionId)),
      }));

      const created = await db.transaction(async (tx) => {
        const result = [];
        for (const { location, schedules } of notificationGroups) {
          const [row] = await tx.insert(studentLeaveRequests).values({
            studentId: student.id,
            locationId: location.id,
            scheduleIds: schedules.map((schedule) => schedule.studentSessionId),
            scheduleSnapshot: schedules.map(formatSchedule),
            startDate: input.startDate,
            endDate: input.endDate,
            description: input.description?.trim() || null,
            status: "pending",
            attendanceApprovalMode: null,
            rejectionReason: null,
            createdBy: req.user?.id ?? null,
          }).returning();
          result.push(row);
        }
        return result;
      });

      const notificationResults = await Promise.allSettled(
        created.map((request, index) => notifyStaffAboutStudentLeave({
          requestId: request.id,
          studentName: student.fullName,
          description: input.description,
          schedules: notificationGroups[index]?.schedules ?? [],
        })),
      );
      notificationResults
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .forEach((result) => console.error("[StudentLeaveRequests] notification error:", result.reason));

      res.status(201).json(created);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Vui lòng nhập đầy đủ thời gian xin nghỉ." });
      }
      console.error("[StudentLeaveRequests] self create error:", error);
      res.status(500).json({ message: "Không thể tạo đơn xin nghỉ." });
    }
  });

  app.get("/api/student-leave-requests/schedules", async (req, res) => {
    try {
      const studentIds = parseIds(req.query.studentIds);
      const locationId = String(req.query.locationId ?? "");
      const startDate = String(req.query.startDate ?? "");
      const endDate = String(req.query.endDate ?? "");
      if (!studentIds.length || !locationId || !startDate || !endDate) return res.json([]);
      if (!checkLocationAccess(req, locationId)) return res.status(403).json({ message: "Bạn không có quyền truy cập cơ sở này." });
      const rows = await findSchedules({ studentIds, locationId, startDate, endDate });
      res.json(rows.map(formatSchedule));
    } catch (error) {
      console.error("[StudentLeaveRequests] schedule list error:", error);
      res.status(500).json({ message: "Không thể tải lịch học" });
    }
  });

  app.get("/api/student-leave-requests", async (req, res) => {
    try {
      const status = String(req.query.status ?? "");
      const locationId = String(req.query.locationId ?? "");
      const search = String(req.query.search ?? "").trim();
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const conditions: any[] = [];
      if (status && LEAVE_STATUSES.includes(status as (typeof LEAVE_STATUSES)[number])) {
        conditions.push(eq(studentLeaveRequests.status, status));
      }
      if (locationId) conditions.push(eq(studentLeaveRequests.locationId, locationId));
      if (search) {
        conditions.push(or(ilike(students.fullName, `%${search}%`), ilike(students.code, `%${search}%`)));
      }
      if (!req.isSuperAdmin && (req.allowedLocationIds ?? []).length > 0) {
        conditions.push(inArray(studentLeaveRequests.locationId, req.allowedLocationIds));
      }

      const where = conditions.length ? and(...conditions) : undefined;
      const [rows, [{ total }]] = await Promise.all([
        db.select({
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
          .where(where)
          .orderBy(desc(studentLeaveRequests.createdAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db.select({ total: count() })
          .from(studentLeaveRequests)
          .innerJoin(students, eq(studentLeaveRequests.studentId, students.id))
          .where(where),
      ]);

      res.json({ data: rows, total: Number(total ?? 0), page, pageSize });
    } catch (error) {
      console.error("[StudentLeaveRequests] list error:", error);
      res.status(500).json({ message: "Không thể tải danh sách đơn xin nghỉ" });
    }
  });

  app.post("/api/student-leave-requests", async (req, res) => {
    try {
      const input = requestInputSchema.parse(req.body);
      if (!checkLocationAccess(req, input.locationId)) return res.status(403).json({ message: "Bạn không có quyền tạo đơn tại cơ sở này." });
      const dateError = validateDateRange(input.startDate, input.endDate);
      if (dateError) return res.status(400).json({ message: dateError });
      if (input.status === "rejected" && !input.rejectionReason?.trim()) {
        return res.status(400).json({ message: "Vui lòng nhập lý do từ chối." });
      }

      const schedules = await findSchedules({
        studentIds: input.studentIds,
        locationId: input.locationId,
        scheduleIds: input.scheduleIds,
        startDate: input.startDate,
        endDate: input.endDate,
      });
      const selectedSchedules = schedules.filter((schedule) =>
        input.scheduleIds.includes(schedule.studentSessionId)
      );
      const schedulesByStudent = new Map<string, ScheduleRow[]>();
      for (const schedule of selectedSchedules) {
        const current = schedulesByStudent.get(schedule.studentId) ?? [];
        current.push(schedule);
        schedulesByStudent.set(schedule.studentId, current);
      }

      const created = await db.transaction(async (tx) => {
        const result = [];
        for (const studentId of input.studentIds) {
          const studentSchedules = schedulesByStudent.get(studentId) ?? [];
          const [row] = await tx.insert(studentLeaveRequests).values({
            studentId,
            locationId: input.locationId,
            scheduleIds: studentSchedules.map((schedule) => schedule.studentSessionId),
            scheduleSnapshot: studentSchedules.map(formatSchedule),
            startDate: input.startDate,
            endDate: input.endDate,
            description: input.description ?? null,
            status: input.status ?? "pending",
            attendanceApprovalMode: null,
            rejectionReason: input.status === "rejected" ? input.rejectionReason!.trim() : null,
            createdBy: req.user?.id ?? null,
          }).returning();
          result.push(row);
        }
        return result;
      });
      res.status(201).json(created);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Dữ liệu đơn xin nghỉ không hợp lệ", issues: error.issues });
      console.error("[StudentLeaveRequests] create error:", error);
      res.status(500).json({ message: "Không thể tạo đơn xin nghỉ" });
    }
  });

  app.put("/api/student-leave-requests/:id", async (req, res) => {
    try {
      const input = updateInputSchema.parse(req.body);
      const [existing] = await db.select().from(studentLeaveRequests).where(eq(studentLeaveRequests.id, req.params.id)).limit(1);
      if (!existing) return res.status(404).json({ message: "Không tìm thấy đơn xin nghỉ" });
      if (!checkLocationAccess(req, input.locationId ?? existing.locationId)) return res.status(403).json({ message: "Bạn không có quyền sửa đơn này." });
      const hasEditableFields = [
        input.locationId,
        input.scheduleIds,
        input.startDate,
        input.endDate,
        input.description,
      ].some((value) => value !== undefined);
      if (existing.status === "approved" && hasEditableFields) {
        return res.status(400).json({ message: "Đơn đã duyệt không thể sửa thông tin." });
      }

      const startDate = input.startDate ?? existing.startDate;
      const endDate = input.endDate ?? existing.endDate;
      const dateError = validateDateRange(startDate, endDate);
      if (dateError) return res.status(400).json({ message: dateError });

      const nextLocationId = input.locationId ?? existing.locationId;
      const scheduleIds = input.scheduleIds ?? existing.scheduleIds ?? [];
      const nextStatus = input.status ?? existing.status;
      const shouldNotifyStatusChange =
        existing.status !== nextStatus &&
        (nextStatus === "approved" || nextStatus === "rejected");
      if (
        nextStatus === "rejected" &&
        input.status === "rejected" &&
        input.rejectionReason !== undefined &&
        !input.rejectionReason?.trim()
      ) {
        return res.status(400).json({ message: "Vui lòng nhập lý do từ chối." });
      }
      if (nextStatus === "rejected" && existing.status !== "rejected" && input.rejectionReason === undefined) {
        return res.status(400).json({ message: "Vui lòng nhập lý do từ chối." });
      }
      let scheduleSnapshot = existing.scheduleSnapshot;
      if (input.locationId || input.startDate || input.endDate || input.scheduleIds) {
        const schedules = await findSchedules({
          studentIds: [existing.studentId],
          locationId: nextLocationId,
          scheduleIds,
          startDate,
          endDate,
        });
        scheduleSnapshot = schedules.map(formatSchedule);
      }

      let attendanceApprovalMode = existing.attendanceApprovalMode;
      let rejectionReason = existing.rejectionReason;
      if (nextStatus === "approved") {
        // The approval flow explicitly tells us whether it changed attendance.
        // Legacy/manual approvals without this value are treated as unchanged.
        attendanceApprovalMode = input.attendanceApprovalMode
          ?? existing.attendanceApprovalMode
          ?? "unchanged";
        rejectionReason = null;
      } else {
        // Only attendance statuses applied by this leave request are reset.
        // "unchanged" approvals must preserve the student's existing attendance.
        if (
          existing.status === "approved" &&
          existing.attendanceApprovalMode === "applied"
        ) {
          for (const studentSessionId of existing.scheduleIds ?? []) {
            await storage.updateStudentAttendance(
              studentSessionId,
              "pending",
              undefined,
              req.user?.id ?? null,
              null,
            );
          }
        }
        attendanceApprovalMode = null;
        rejectionReason = nextStatus === "rejected"
          ? (input.rejectionReason === undefined ? existing.rejectionReason : input.rejectionReason?.trim() || null)
          : null;
      }

      const [row] = await db.update(studentLeaveRequests)
        .set({
          locationId: nextLocationId,
          scheduleIds,
          scheduleSnapshot,
          startDate,
          endDate,
          description: input.description === undefined ? existing.description : input.description,
          status: nextStatus,
          attendanceApprovalMode,
          rejectionReason,
          updatedAt: new Date(),
        })
        .where(eq(studentLeaveRequests.id, req.params.id))
        .returning();

      if (shouldNotifyStatusChange) {
        try {
          await notifyStudentAndParentsAboutLeaveStatus({
            requestId: row.id,
            studentId: existing.studentId,
            startDate,
            endDate,
            scheduleSnapshot,
            status: nextStatus as "approved" | "rejected",
            rejectionReason,
          });
        } catch (notificationError) {
          console.error("[StudentLeaveRequests] status notification error:", notificationError);
        }
      }

      res.json(row);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Dữ liệu đơn xin nghỉ không hợp lệ", issues: error.issues });
      console.error("[StudentLeaveRequests] update error:", error);
      res.status(500).json({ message: "Không thể cập nhật đơn xin nghỉ" });
    }
  });

  app.delete("/api/student-leave-requests/:id", async (req, res) => {
    try {
      const [existing] = await db.select({
        locationId: studentLeaveRequests.locationId,
        status: studentLeaveRequests.status,
      })
        .from(studentLeaveRequests)
        .where(eq(studentLeaveRequests.id, req.params.id))
        .limit(1);
      if (!existing) return res.status(404).json({ message: "Không tìm thấy đơn xin nghỉ" });
      if (!checkLocationAccess(req, existing.locationId)) return res.status(403).json({ message: "Bạn không có quyền xóa đơn này." });
      if (existing.status === "approved") return res.status(400).json({ message: "Đơn đã duyệt không thể xóa." });
      await db.delete(studentLeaveRequests).where(eq(studentLeaveRequests.id, req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("[StudentLeaveRequests] delete error:", error);
      res.status(500).json({ message: "Không thể xóa đơn xin nghỉ" });
    }
  });
}