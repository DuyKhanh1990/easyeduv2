import type { Express, Request, Response } from "express";
import { and, asc, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  activityLogs,
  classSessionTeacherAssignments,
  classSessions,
  classes,
  staff,
} from "@shared/schema";

function requireSuperAdmin(req: Request, res: Response): boolean {
  if (!req.isSuperAdmin) {
    res.status(403).json({ message: "Chỉ Super Admin được truy cập." });
    return false;
  }
  return true;
}

const orphanAssignmentCondition = sql`
  NOT (
    ${classSessionTeacherAssignments.teacherId} =
    ANY(COALESCE(${classSessions.teacherIds}, ARRAY[]::uuid[]))
  )
`;

const cleanupBodySchema = z.object({
  assignmentIds: z.array(z.string().uuid()).min(1).max(5000),
});

export function registerAdminEducationRoutes(app: Express): void {
  app.get("/api/admin/education/orphan-teacher-assignments", async (req, res) => {
    if (!requireSuperAdmin(req, res)) return;

    try {
      const rows = await db
        .select({
          assignmentId: classSessionTeacherAssignments.id,
          classSessionId: classSessions.id,
          classId: classes.id,
          classCode: classes.classCode,
          className: classes.name,
          sessionIndex: classSessions.sessionIndex,
          sessionDate: classSessions.sessionDate,
          currentTeacherIds: classSessions.teacherIds,
          oldTeacherId: classSessionTeacherAssignments.teacherId,
          oldTeacherName: staff.fullName,
          oldTeacherCode: staff.code,
          startTime: classSessionTeacherAssignments.startTime,
          endTime: classSessionTeacherAssignments.endTime,
        })
        .from(classSessionTeacherAssignments)
        .innerJoin(classSessions, and(
          sql`${classSessionTeacherAssignments.classSessionId} = ${classSessions.id}`,
          orphanAssignmentCondition,
        ))
        .innerJoin(classes, sql`${classSessions.classId} = ${classes.id}`)
        .innerJoin(staff, sql`${classSessionTeacherAssignments.teacherId} = ${staff.id}`)
        .orderBy(asc(classes.classCode), asc(classSessions.sessionIndex), asc(classSessionTeacherAssignments.teacherId));

      const currentTeacherIds = Array.from(new Set(
        rows.flatMap((row) => row.currentTeacherIds ?? []),
      ));
      const currentTeachers = currentTeacherIds.length > 0
        ? await db.select({
            id: staff.id,
            fullName: staff.fullName,
            code: staff.code,
          }).from(staff).where(inArray(staff.id, currentTeacherIds))
        : [];
      const currentTeacherById = new Map(currentTeachers.map((teacher) => [teacher.id, teacher]));
      const items = rows.map((row) => ({
        assignmentId: row.assignmentId,
        classSessionId: row.classSessionId,
        classId: row.classId,
        classCode: row.classCode,
        className: row.className,
        sessionIndex: row.sessionIndex,
        sessionDate: row.sessionDate,
        oldTeacherId: row.oldTeacherId,
        oldTeacherName: row.oldTeacherName,
        oldTeacherCode: row.oldTeacherCode,
        startTime: String(row.startTime),
        endTime: String(row.endTime),
        currentTeachers: (row.currentTeacherIds ?? []).map((teacherId) => ({
          id: teacherId,
          fullName: currentTeacherById.get(teacherId)?.fullName ?? "Không tìm thấy nhân sự",
          code: currentTeacherById.get(teacherId)?.code ?? "",
        })),
      }));

      return res.json({
        total: items.length,
        classCount: new Set(items.map((item) => item.classId)).size,
        sessionCount: new Set(items.map((item) => item.classSessionId)).size,
        items,
      });
    } catch (error) {
      console.error("[AdminEducation] Failed to scan orphan teacher assignments:", error);
      return res.status(500).json({ message: "Không thể quét phân công giáo viên cũ." });
    }
  });

  app.post("/api/admin/education/orphan-teacher-assignments/cleanup", async (req, res) => {
    if (!requireSuperAdmin(req, res)) return;

    const parsedBody = cleanupBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({ message: "Danh sách phân công cần dọn không hợp lệ." });
    }

    try {
      const result = await db.transaction(async (tx) => {
        const rows = await tx
          .select({
            assignmentId: classSessionTeacherAssignments.id,
            classSessionId: classSessions.id,
            classId: classes.id,
            classCode: classes.classCode,
            className: classes.name,
            sessionIndex: classSessions.sessionIndex,
            sessionDate: classSessions.sessionDate,
            oldTeacherId: classSessionTeacherAssignments.teacherId,
            oldTeacherName: staff.fullName,
            oldTeacherCode: staff.code,
            startTime: classSessionTeacherAssignments.startTime,
            endTime: classSessionTeacherAssignments.endTime,
          })
          .from(classSessionTeacherAssignments)
          .innerJoin(classSessions, and(
            sql`${classSessionTeacherAssignments.classSessionId} = ${classSessions.id}`,
            orphanAssignmentCondition,
          ))
          .innerJoin(classes, sql`${classSessions.classId} = ${classes.id}`)
          .innerJoin(staff, sql`${classSessionTeacherAssignments.teacherId} = ${staff.id}`)
          .where(inArray(classSessionTeacherAssignments.id, parsedBody.data.assignmentIds))
          .for("update");

        const removableIds = rows.map((row) => row.assignmentId);
        if (removableIds.length > 0) {
          await tx.delete(classSessionTeacherAssignments)
            .where(inArray(classSessionTeacherAssignments.id, removableIds));

          await tx.insert(activityLogs).values({
            userId: req.user?.id ?? null,
            locationId: null,
            classId: null,
            action: "admin.education.orphan_teacher_assignments_cleanup",
            oldContent: JSON.stringify(rows.map((row) => ({
              assignmentId: row.assignmentId,
              classId: row.classId,
              classCode: row.classCode,
              className: row.className,
              classSessionId: row.classSessionId,
              sessionIndex: row.sessionIndex,
              sessionDate: row.sessionDate,
              teacherId: row.oldTeacherId,
              teacherName: row.oldTeacherName,
              teacherCode: row.oldTeacherCode,
              startTime: String(row.startTime),
              endTime: String(row.endTime),
            }))),
            newContent: JSON.stringify({
              removedCount: removableIds.length,
              actorUserId: req.user?.id ?? null,
            }),
          });
        }

        return {
          removedCount: removableIds.length,
          skippedCount: parsedBody.data.assignmentIds.length - removableIds.length,
        };
      });

      return res.json({ success: true, ...result });
    } catch (error) {
      console.error("[AdminEducation] Failed to clean orphan teacher assignments:", error);
      return res.status(500).json({ message: "Không thể dọn phân công giáo viên cũ." });
    }
  });
}
