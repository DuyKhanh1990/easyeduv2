import type { Express } from "express";
import { api } from "@shared/routes";
import { db } from "../db";
import { classSessions, studentSessions, students, classes, shiftTemplates, studentLocations } from "@shared/schema";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";

export function registerAttendanceRoutes(app: Express): void {
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

      if (!isSuperAdmin && allowedLocationIds && allowedLocationIds.length > 0) {
        conditions.push(inArray(classes.locationId, allowedLocationIds));
        conditions.push(sql`EXISTS (SELECT 1 FROM ${studentLocations} WHERE ${studentLocations.studentId} = ${students.id} AND ${studentLocations.locationId} IN ${allowedLocationIds})`);
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
          sessionDate: classSessions.sessionDate,
          weekday: classSessions.weekday,
          sessionIndex: classSessions.sessionIndex,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
          teacherIds: classSessions.teacherIds,
        })
        .from(studentSessions)
        .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
        .innerJoin(students, eq(studentSessions.studentId, students.id))
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(classes.classCode, students.code);

      const totalSessionsMap = new Map<string, number>();
      const allSessions = await db.query.studentSessions.findMany({
        columns: { studentId: true, classId: true },
      });

      allSessions.forEach((ss: any) => {
        const key = `${ss.studentId}-${ss.classId}`;
        totalSessionsMap.set(key, (totalSessionsMap.get(key) || 0) + 1);
      });

      const dayNames = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
      const formatted = results.map((r: any) => {
        const totalSessions = totalSessionsMap.get(`${r.studentId}-${r.classId}`) || 0;
        const sessionOrder = r.sessionOrder || 1;
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
          teacherIds: r.teacherIds || [],
          note: r.note || "",
        };
      });

      res.json(formatted);
    } catch (err: any) {
      console.error("Attendance error:", err);
      res.status(400).json({ message: err.message || "Lỗi khi tải dữ liệu" });
    }
  });
}
