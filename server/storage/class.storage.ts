import {
  db,
  eq, sql, and, inArray, asc,
  classes, classSessions, studentClasses, studentSessions,
  staff, students, studentLocations, shiftTemplates,
  courseFeePackages, financePromotions, invoices, invoiceItems,
} from "./base";
import { sessionContents } from "@shared/schema";
import { studentWalletTransactions } from "@shared/schema";
import { distributeInvoiceFeeToSessions } from "./invoice-session-allocation.storage";

import type { Class } from "./base";

// ---------------------------------------------------------------------------
// batchGetClassCounts — helper: lấy counts cho nhiều lớp trong 2 queries
// ---------------------------------------------------------------------------
interface ClassCounts {
  waitingStudentsCount: number;
  activeStudentsCount: number;
  totalSessions: number;
  completedSessions: number;
}

async function batchGetClassCounts(classIds: string[]): Promise<Map<string, ClassCounts>> {
  const defaultCounts = (): ClassCounts => ({ waitingStudentsCount: 0, activeStudentsCount: 0, totalSessions: 0, completedSessions: 0 });

  if (classIds.length === 0) return new Map();

  const result = new Map<string, ClassCounts>(classIds.map(id => [id, defaultCounts()]));

  const [studentRows, sessionRows] = await Promise.all([
    db.select({
      classId: studentClasses.classId,
      status: studentClasses.status,
      count: sql<number>`count(*)::int`,
    })
    .from(studentClasses)
    .where(and(
      inArray(studentClasses.classId, classIds),
      inArray(studentClasses.status, ["waiting", "active"]),
    ))
    .groupBy(studentClasses.classId, studentClasses.status),

    db.select({
      classId: classSessions.classId,
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${classSessions.status} = ${'completed'})::int`,
    })
    .from(classSessions)
    .where(inArray(classSessions.classId, classIds))
    .groupBy(classSessions.classId),
  ]);

  for (const row of studentRows) {
    const entry = result.get(row.classId);
    if (!entry) continue;
    if (row.status === "waiting") entry.waitingStudentsCount = row.count;
    if (row.status === "active") entry.activeStudentsCount = row.count;
  }

  for (const row of sessionRows) {
    const entry = result.get(row.classId);
    if (!entry) continue;
    entry.totalSessions = row.total;
    entry.completedSessions = row.completed;
  }

  return result;
}

// ---------------------------------------------------------------------------
// getClasses
// ---------------------------------------------------------------------------
export async function getClasses(locationId?: string, allowedLocationIds?: string[] | null): Promise<any[]> {
  const whereFilters = [];
  if (locationId && locationId !== "all") {
    if (allowedLocationIds !== null && allowedLocationIds !== undefined && !allowedLocationIds.includes(locationId)) {
      return [];
    }
    whereFilters.push(eq(classes.locationId, locationId));
  } else if (allowedLocationIds !== null && allowedLocationIds !== undefined && allowedLocationIds.length > 0) {
    whereFilters.push(inArray(classes.locationId, allowedLocationIds));
  } else if (allowedLocationIds !== null && allowedLocationIds !== undefined && allowedLocationIds.length === 0) {
    return [];
  }

  const result = await db.query.classes.findMany({
    where: whereFilters.length > 0 ? and(...whereFilters) : undefined,
    with: {
      location: true,
      program: true,
      course: true,
    },
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  const allStaffIds = Array.from(new Set(result.flatMap(c => [...(c.managerIds || []), ...(c.teacherIds || [])])));
  const staffMap = allStaffIds.length > 0
    ? Object.fromEntries((await db.select().from(staff).where(inArray(staff.id, allStaffIds))).map(s => [s.id, s]))
    : {};

  const allShiftIds = Array.from(new Set(result.flatMap(c => c.shiftTemplateIds || [])));
  const shiftMap = allShiftIds.length > 0
    ? Object.fromEntries((await db.select().from(shiftTemplates).where(inArray(shiftTemplates.id, allShiftIds))).map(s => [s.id, s]))
    : {};

  const classIds = result.map(c => c.id);
  const countsMap = await batchGetClassCounts(classIds);

  return result.map((cls) => {
    const counts = countsMap.get(cls.id) ?? { waitingStudentsCount: 0, activeStudentsCount: 0, totalSessions: 0, completedSessions: 0 };
    const clsShiftTemplates = (cls.shiftTemplateIds || []).map((id: string) => shiftMap[id]).filter(Boolean);

    return {
      ...cls,
      managers: (cls.managerIds || []).map((id: string) => staffMap[id]).filter(Boolean),
      teachers: (cls.teacherIds || []).map((id: string) => staffMap[id]).filter(Boolean),
      manager: staffMap[(cls.managerIds || [])[0]] || null,
      teacher: staffMap[(cls.teacherIds || [])[0]] || null,
      shiftTemplates: clsShiftTemplates,
      shiftTemplate: clsShiftTemplates[0] || null,
      ...counts,
    };
  });
}

// ---------------------------------------------------------------------------
// getClassesList
// ---------------------------------------------------------------------------
export async function getClassesList(locationId?: string, allowedLocationIds?: string[] | null): Promise<any[]> {
  const whereFilters = [];
  if (locationId && locationId !== "all") {
    if (allowedLocationIds !== null && allowedLocationIds !== undefined && !allowedLocationIds.includes(locationId)) {
      return [];
    }
    whereFilters.push(eq(classes.locationId, locationId));
  } else if (allowedLocationIds !== null && allowedLocationIds !== undefined && allowedLocationIds.length > 0) {
    whereFilters.push(inArray(classes.locationId, allowedLocationIds));
  } else if (allowedLocationIds !== null && allowedLocationIds !== undefined && allowedLocationIds.length === 0) {
    return [];
  }

  const result = await db.query.classes.findMany({
    where: whereFilters.length > 0 ? and(...whereFilters) : undefined,
    columns: {
      id: true, classCode: true, name: true, status: true, weekdays: true,
      startDate: true, endDate: true, locationId: true, managerIds: true, teacherIds: true,
      shiftTemplateIds: true, scheduleGenerated: true,
    },
    with: {
      location: { columns: { name: true } },
    },
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  const allStaffIds = Array.from(new Set(result.flatMap(c => [...(c.managerIds || []), ...(c.teacherIds || [])])));
  const staffMap = allStaffIds.length > 0
    ? Object.fromEntries((await db.select({ id: staff.id, fullName: staff.fullName }).from(staff).where(inArray(staff.id, allStaffIds))).map(s => [s.id, s]))
    : {};

  const allShiftIds = Array.from(new Set(result.flatMap(c => c.shiftTemplateIds || [])));
  const shiftMap = allShiftIds.length > 0
    ? Object.fromEntries((await db.select({ id: shiftTemplates.id, name: shiftTemplates.name }).from(shiftTemplates).where(inArray(shiftTemplates.id, allShiftIds))).map(s => [s.id, s]))
    : {};

  const classIds = result.map(c => c.id);
  const countsMap = await batchGetClassCounts(classIds);

  return result.map((cls) => {
    const counts = countsMap.get(cls.id) ?? { waitingStudentsCount: 0, activeStudentsCount: 0, totalSessions: 0, completedSessions: 0 };
    const clsShiftTemplates = (cls.shiftTemplateIds || []).map((id: string) => shiftMap[id]).filter(Boolean);

    return {
      ...cls,
      managers: (cls.managerIds || []).map((id: string) => staffMap[id]).filter(Boolean),
      teachers: (cls.teacherIds || []).map((id: string) => staffMap[id]).filter(Boolean),
      manager: staffMap[(cls.managerIds || [])[0]] || null,
      teacher: staffMap[(cls.teacherIds || [])[0]] || null,
      shiftTemplates: clsShiftTemplates,
      shiftTemplate: clsShiftTemplates[0] || null,
      ...counts,
    };
  });
}

// ---------------------------------------------------------------------------
// getClassesMinimal
// ---------------------------------------------------------------------------
export async function getClassesMinimal(locationId?: string, allowedLocationIds?: string[] | null): Promise<{ id: string; name: string; classCode: string; locationId: string }[]> {
  const conditions: any[] = [];
  if (locationId && locationId !== "all") {
    if (allowedLocationIds !== null && allowedLocationIds !== undefined && !allowedLocationIds.includes(locationId)) {
      return [];
    }
    conditions.push(eq(classes.locationId, locationId));
  } else if (allowedLocationIds !== null && allowedLocationIds !== undefined && allowedLocationIds.length > 0) {
    conditions.push(inArray(classes.locationId, allowedLocationIds));
  } else if (allowedLocationIds !== null && allowedLocationIds !== undefined && allowedLocationIds.length === 0) {
    return [];
  }
  return await db
    .select({ id: classes.id, name: classes.name, classCode: classes.classCode, locationId: classes.locationId })
    .from(classes)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(classes.classCode);
}

// ---------------------------------------------------------------------------
// getClass
// ---------------------------------------------------------------------------
export async function getClass(id: string): Promise<any> {
  const cls = await db.query.classes.findFirst({
    where: eq(classes.id, id),
    with: {
      location: { columns: { name: true } },
    },
  });

  if (!cls) return undefined;

  const allStaffIds = Array.from(new Set([...(cls.managerIds || []), ...(cls.teacherIds || [])]));
  const staffMap = allStaffIds.length > 0
    ? Object.fromEntries(
        (await db.select({ id: staff.id, fullName: staff.fullName })
          .from(staff).where(inArray(staff.id, allStaffIds))).map(s => [s.id, s])
      )
    : {};

  const clsShiftIds = cls.shiftTemplateIds || [];
  const clsShiftObjects = clsShiftIds.length > 0
    ? await db.select({
        id: shiftTemplates.id,
        name: shiftTemplates.name,
        startTime: shiftTemplates.startTime,
        endTime: shiftTemplates.endTime,
      }).from(shiftTemplates).where(inArray(shiftTemplates.id, clsShiftIds))
    : [];

  const countsMap = await batchGetClassCounts([cls.id]);
  const counts = countsMap.get(cls.id) ?? { waitingStudentsCount: 0, activeStudentsCount: 0, totalSessions: 0, completedSessions: 0 };

  return {
    ...cls,
    managers: (cls.managerIds || []).map((sid: string) => staffMap[sid]).filter(Boolean),
    teachers: (cls.teacherIds || []).map((sid: string) => staffMap[sid]).filter(Boolean),
    shiftTemplates: clsShiftObjects,
    ...counts,
  };
}

// ---------------------------------------------------------------------------
// getClassAssignInfo
// ---------------------------------------------------------------------------
export async function getClassAssignInfo(id: string): Promise<any> {
  const cls = await db.select({
    id: classes.id,
    classCode: classes.classCode,
    name: classes.name,
    maxStudents: classes.maxStudents,
    weekdays: classes.weekdays,
    startDate: classes.startDate,
    endDate: classes.endDate,
    teacherIds: classes.teacherIds,
    shiftTemplateIds: classes.shiftTemplateIds,
    courseId: classes.courseId,
  }).from(classes).where(eq(classes.id, id)).limit(1);

  if (!cls[0]) return null;
  const c = cls[0];

  const [waitingCount, activeCount] = await Promise.all([
    db.$count(studentClasses, and(eq(studentClasses.classId, id), eq(studentClasses.status, "waiting"))),
    db.$count(studentClasses, and(eq(studentClasses.classId, id), eq(studentClasses.status, "active"))),
  ]);

  const teacherId = (c.teacherIds || [])[0];
  const shiftId = (c.shiftTemplateIds || [])[0];

  const [teacherRow, shiftRow, feePackagesRow, enrolledRows] = await Promise.all([
    teacherId
      ? db.select({ fullName: staff.fullName }).from(staff).where(eq(staff.id, teacherId)).limit(1)
      : Promise.resolve([]),
    shiftId
      ? db.select({ startTime: shiftTemplates.startTime, name: shiftTemplates.name }).from(shiftTemplates).where(eq(shiftTemplates.id, shiftId)).limit(1)
      : Promise.resolve([]),
    c.courseId
      ? db.select({
          id: courseFeePackages.id,
          name: courseFeePackages.name,
          type: courseFeePackages.type,
          fee: courseFeePackages.fee,
          totalAmount: courseFeePackages.totalAmount,
          sessions: courseFeePackages.sessions,
        }).from(courseFeePackages).where(eq(courseFeePackages.courseId, c.courseId))
      : Promise.resolve([]),
    db.select({
      studentId: studentClasses.studentId,
      status: studentClasses.status,
      fullName: students.fullName,
    })
    .from(studentClasses)
    .innerJoin(students, eq(studentClasses.studentId, students.id))
    .where(and(eq(studentClasses.classId, id), inArray(studentClasses.status, ["waiting", "active"]))),
  ]);

  return {
    id: c.id,
    classCode: c.classCode,
    name: c.name,
    maxStudents: c.maxStudents,
    weekdays: c.weekdays,
    startDate: c.startDate,
    endDate: c.endDate,
    teacher: teacherRow[0] || null,
    shiftTemplate: shiftRow[0] || null,
    waitingStudentsCount: waitingCount,
    activeStudentsCount: activeCount,
    course: { feePackages: feePackagesRow },
    enrolledStudents: enrolledRows.map(r => ({
      studentId: r.studentId,
      fullName: r.fullName,
      status: r.status,
    })),
  };
}

// ---------------------------------------------------------------------------
// createClass
// ---------------------------------------------------------------------------
export async function createClass(data: any): Promise<Class> {
  const newClass = await db.transaction(async (tx) => {
    const scheduleConfig = data.schedule_config || [];
    const teachersConfig = data.teachers_config || [];
    const endType: string = data.endType || "date";
    const sessionCount: number = endType === "sessions" ? Number(data.sessionCount) : 0;

    // Generate sessions first to determine endDate when endType = "sessions"
    const start = new Date(data.startDate);
    const sessions: any[] = [];

    if (endType === "sessions") {
      // Loop until we hit the required session count (max 5 years safety)
      const maxDate = new Date(start);
      maxDate.setFullYear(maxDate.getFullYear() + 5);
      for (let d = new Date(start); d <= maxDate && sessions.length < sessionCount; d.setDate(d.getDate() + 1)) {
        const dbWeekday = d.getDay();
        const dayConfig = scheduleConfig.find((c: any) => Number(c.weekday) === dbWeekday);
        if (dayConfig && dayConfig.shifts) {
          for (const shift of dayConfig.shifts) {
            if (sessions.length >= sessionCount) break;
            const shiftKey = `${dbWeekday}_shift${dayConfig.shifts.indexOf(shift)}`;
            const assignedTeacherIds: string[] = [];
            if (teachersConfig && Array.isArray(teachersConfig)) {
              for (const tConfig of teachersConfig) {
                if (!tConfig.teacher_id) continue;
                if (tConfig.mode === "all") assignedTeacherIds.push(tConfig.teacher_id);
                else if (tConfig.mode === "specific" && (tConfig.shift_keys?.includes(shiftKey) || tConfig.shiftKeys?.includes(shiftKey))) assignedTeacherIds.push(tConfig.teacher_id);
              }
            }
            if (shift.shift_template_id || shift.shiftTemplateId) {
              sessions.push({
                classId: "", // will be replaced after insert
                sessionDate: new Date(d).toISOString().split("T")[0],
                weekday: dbWeekday,
                shiftTemplateId: shift.shift_template_id || shift.shiftTemplateId,
                roomId: shift.room_id || shift.roomId || "00000000-0000-0000-0000-000000000000",
                teacherIds: assignedTeacherIds.length > 0 ? assignedTeacherIds : null,
                status: "scheduled",
              });
            }
          }
        }
      }
    } else {
      const end = new Date(data.endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dbWeekday = d.getDay();
        const dayConfig = scheduleConfig.find((c: any) => Number(c.weekday) === dbWeekday);
        if (dayConfig && dayConfig.shifts) {
          for (const shift of dayConfig.shifts) {
            const shiftKey = `${dbWeekday}_shift${dayConfig.shifts.indexOf(shift)}`;
            const assignedTeacherIds: string[] = [];
            if (teachersConfig && Array.isArray(teachersConfig)) {
              for (const tConfig of teachersConfig) {
                if (!tConfig.teacher_id) continue;
                if (tConfig.mode === "all") assignedTeacherIds.push(tConfig.teacher_id);
                else if (tConfig.mode === "specific" && (tConfig.shift_keys?.includes(shiftKey) || tConfig.shiftKeys?.includes(shiftKey))) assignedTeacherIds.push(tConfig.teacher_id);
              }
            }
            if (shift.shift_template_id || shift.shiftTemplateId) {
              sessions.push({
                classId: "",
                sessionDate: new Date(d).toISOString().split("T")[0],
                weekday: dbWeekday,
                shiftTemplateId: shift.shift_template_id || shift.shiftTemplateId,
                roomId: shift.room_id || shift.roomId || "00000000-0000-0000-0000-000000000000",
                teacherIds: assignedTeacherIds.length > 0 ? assignedTeacherIds : null,
                status: "scheduled",
              });
            }
          }
        }
      }
    }

    // Compute endDate: last session date when endType = "sessions", otherwise use data.endDate
    const computedEndDate = sessions.length > 0 ? sessions[sessions.length - 1].sessionDate : (data.endDate || data.startDate);

    const [newClass] = await tx.insert(classes).values({
      classCode: data.classCode,
      name: data.name,
      locationId: data.locationId,
      programId: data.programId,
      courseId: data.courseId,
      managerIds: Array.isArray(data.managerIds) ? data.managerIds : (data.managerId ? [data.managerId] : []),
      maxStudents: data.maxStudents,
      description: data.description,
      status: "planning",
      startDate: data.startDate,
      endDate: computedEndDate,
      color: data.color || null,
      teacherIds: Array.isArray(data.teacherIds) ? data.teacherIds : (data.teacherId ? [data.teacherId] : null),
      shiftTemplateIds: data.schedule_config
        ? Array.from(new Set((data.schedule_config as any[]).flatMap((c: any) => (c.shifts || []).map((s: any) => s.shift_template_id || s.shiftTemplateId).filter(Boolean))))
        : (data.shiftTemplateId ? [data.shiftTemplateId] : null),
      feePackageId: data.feePackageId || null,
      scoreSheetId: data.scoreSheetId || null,
      weekdays: data.weekdays,
      scheduleConfig: data.schedule_config || null,
      teachersConfig: data.teachers_config || null,
      learningFormat: data.learningFormat || "offline",
      onlineLink: data.onlineLink || null,
      subjectId: data.subjectId || null,
      evaluationCriteriaIds: Array.isArray(data.evaluationCriteriaIds) && data.evaluationCriteriaIds.length > 0 ? data.evaluationCriteriaIds : null,
    }).returning();

    if (sessions.length > 0) {
      const sessionsWithIndex = sessions.map((s, idx) => ({
        ...s,
        classId: newClass.id,
        sessionIndex: idx + 1,
        subjectId: newClass.subjectId || null,
        evaluationCriteriaIds: newClass.evaluationCriteriaIds || null,
        programId: newClass.programId || null,
      }));
      await tx.insert(classSessions).values(sessionsWithIndex);
      await tx.update(classes).set({ scheduleGenerated: true, updatedAt: new Date() }).where(eq(classes.id, newClass.id));
      const { recalculateClass } = await import("./session.storage");
      await recalculateClass(newClass.id, tx);
    }

    return newClass;
  });

  // Auto-apply program contents to sessions after transaction
  if (newClass.programId) {
    try {
      const { getCourseProgramContents } = await import("./course.storage");
      const { createSessionContent } = await import("./session-content.storage");

      const createdSessions = await db
        .select({ id: classSessions.id, sessionIndex: classSessions.sessionIndex })
        .from(classSessions)
        .where(eq(classSessions.classId, newClass.id))
        .orderBy(asc(classSessions.sessionIndex));

      if (createdSessions.length > 0) {
        const programContents = await getCourseProgramContents(newClass.programId);
        const sorted = programContents.sort((a, b) => parseFloat(String(a.sessionNumber)) - parseFloat(String(b.sessionNumber)));

        const contentsBySession: Record<number, typeof sorted> = {};
        for (const pc of sorted) {
          const sn = Math.round(parseFloat(String(pc.sessionNumber)));
          if (!contentsBySession[sn]) contentsBySession[sn] = [];
          contentsBySession[sn].push(pc);
        }

        for (let i = 0; i < createdSessions.length; i++) {
          const session = createdSessions[i];
          const contentsForSession = contentsBySession[i + 1] || [];
          for (let j = 0; j < contentsForSession.length; j++) {
            const pc = contentsForSession[j];
            await createSessionContent({
              classSessionId: session.id,
              contentType: (pc.type || "curriculum") as any,
              title: pc.title,
              description: pc.content || null,
              resourceUrl: pc.id,
              displayOrder: j,
            });
          }
        }
      }
    } catch (err) {
      console.error("Auto-apply program contents error:", err);
    }
  }

  return newClass;
}

// ---------------------------------------------------------------------------
// updateClass
// ---------------------------------------------------------------------------
export async function updateClass(id: string, data: any): Promise<Class> {
  // Case: regenerate sessions (class had no schedule, now being set for the first time)
  if (data.regenerateSessions === true) {
    return await db.transaction(async (tx) => {
      const scheduleConfig = data.schedule_config || [];
      const teachersConfig = data.teachers_config || [];
      const endType: string = data.endType || "date";
      const sessionCount: number = endType === "sessions" ? Number(data.sessionCount) : 0;

      const start = new Date(data.startDate);
      const sessions: any[] = [];

      if (endType === "sessions") {
        const maxDate = new Date(start);
        maxDate.setFullYear(maxDate.getFullYear() + 5);
        for (let d = new Date(start); d <= maxDate && sessions.length < sessionCount; d.setDate(d.getDate() + 1)) {
          const dbWeekday = d.getDay();
          const dayConfig = scheduleConfig.find((c: any) => Number(c.weekday) === dbWeekday);
          if (dayConfig && dayConfig.shifts) {
            for (const shift of dayConfig.shifts) {
              if (sessions.length >= sessionCount) break;
              const shiftKey = `${dbWeekday}_shift${dayConfig.shifts.indexOf(shift)}`;
              const assignedTeacherIds: string[] = [];
              if (teachersConfig && Array.isArray(teachersConfig)) {
                for (const tConfig of teachersConfig) {
                  if (!tConfig.teacher_id) continue;
                  if (tConfig.mode === "all") assignedTeacherIds.push(tConfig.teacher_id);
                  else if (tConfig.mode === "specific" && (tConfig.shift_keys?.includes(shiftKey) || tConfig.shiftKeys?.includes(shiftKey))) assignedTeacherIds.push(tConfig.teacher_id);
                }
              }
              if (shift.shift_template_id || shift.shiftTemplateId) {
                sessions.push({
                  classId: id,
                  sessionDate: new Date(d).toISOString().split("T")[0],
                  weekday: dbWeekday,
                  shiftTemplateId: shift.shift_template_id || shift.shiftTemplateId,
                  roomId: shift.room_id || shift.roomId || "00000000-0000-0000-0000-000000000000",
                  teacherIds: assignedTeacherIds.length > 0 ? assignedTeacherIds : null,
                  status: "scheduled",
                });
              }
            }
          }
        }
      } else {
        const end = new Date(data.endDate);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dbWeekday = d.getDay();
          const dayConfig = scheduleConfig.find((c: any) => Number(c.weekday) === dbWeekday);
          if (dayConfig && dayConfig.shifts) {
            for (const shift of dayConfig.shifts) {
              const shiftKey = `${dbWeekday}_shift${dayConfig.shifts.indexOf(shift)}`;
              const assignedTeacherIds: string[] = [];
              if (teachersConfig && Array.isArray(teachersConfig)) {
                for (const tConfig of teachersConfig) {
                  if (!tConfig.teacher_id) continue;
                  if (tConfig.mode === "all") assignedTeacherIds.push(tConfig.teacher_id);
                  else if (tConfig.mode === "specific" && (tConfig.shift_keys?.includes(shiftKey) || tConfig.shiftKeys?.includes(shiftKey))) assignedTeacherIds.push(tConfig.teacher_id);
                }
              }
              if (shift.shift_template_id || shift.shiftTemplateId) {
                sessions.push({
                  classId: id,
                  sessionDate: new Date(d).toISOString().split("T")[0],
                  weekday: dbWeekday,
                  shiftTemplateId: shift.shift_template_id || shift.shiftTemplateId,
                  roomId: shift.room_id || shift.roomId || "00000000-0000-0000-0000-000000000000",
                  teacherIds: assignedTeacherIds.length > 0 ? assignedTeacherIds : null,
                  status: "scheduled",
                });
              }
            }
          }
        }
      }

      const computedEndDate = sessions.length > 0
        ? sessions[sessions.length - 1].sessionDate
        : (data.endDate || data.startDate);

      const updateData: any = {};
      const allowed = ["classCode", "name", "locationId", "programId", "courseId", "managerIds", "teacherIds", "shiftTemplateIds", "feePackageId", "scoreSheetId", "maxStudents", "learningFormat", "onlineLink", "description", "status", "weekdays", "color", "subjectId", "evaluationCriteriaIds"];
      for (const key of allowed) {
        if (data[key] !== undefined) updateData[key] = data[key];
      }
      updateData.startDate = data.startDate;
      updateData.endDate = computedEndDate;
      updateData.scheduleConfig = data.schedule_config || null;
      updateData.teachersConfig = data.teachers_config || null;
      updateData.scheduleGenerated = sessions.length > 0;
      updateData.updatedAt = new Date();

      const [updated] = await tx.update(classes).set(updateData).where(eq(classes.id, id)).returning();

      if (sessions.length > 0) {
        const sessionsWithIndex = sessions.map((s, idx) => ({
          ...s,
          sessionIndex: idx + 1,
          subjectId: updated.subjectId || null,
          evaluationCriteriaIds: updated.evaluationCriteriaIds || null,
        }));
        await tx.insert(classSessions).values(sessionsWithIndex);
      }

      const { recalculateClass } = await import("./session.storage");
      await recalculateClass(id, tx);

      return updated;
    });
  }

  // Default: update class fields only (schedule already generated — do not touch session schedule structure)
  const updateData: any = {};
  const allowed = ["classCode", "name", "locationId", "programId", "courseId", "managerIds", "teacherIds", "shiftTemplateIds", "feePackageId", "scoreSheetId", "maxStudents", "learningFormat", "onlineLink", "description", "status", "startDate", "endDate", "weekdays", "color", "subjectId", "evaluationCriteriaIds"];
  for (const key of allowed) {
    if (data[key] !== undefined) updateData[key] = data[key];
  }
  if (data.schedule_config !== undefined) updateData.scheduleConfig = data.schedule_config;
  if (data.teachers_config !== undefined) updateData.teachersConfig = data.teachers_config;
  updateData.updatedAt = new Date();
  const [updated] = await db.update(classes).set(updateData).where(eq(classes.id, id)).returning();

  // Sync metadata fields to existing sessions so they reflect the latest class info
  const sessionSyncData: any = { updatedAt: new Date() };
  if (data.programId !== undefined) sessionSyncData.programId = data.programId || null;
  if (data.subjectId !== undefined) sessionSyncData.subjectId = data.subjectId || null;
  if (data.evaluationCriteriaIds !== undefined) sessionSyncData.evaluationCriteriaIds = Array.isArray(data.evaluationCriteriaIds) && data.evaluationCriteriaIds.length > 0 ? data.evaluationCriteriaIds : null;
  if (data.scoreSheetId !== undefined) sessionSyncData.scoreSheetId = data.scoreSheetId || null;

  if (Object.keys(sessionSyncData).length > 1) {
    await db.update(classSessions).set(sessionSyncData).where(eq(classSessions.classId, id));
  }

  // Auto-apply program contents to sessions when programId is set/changed
  if (data.programId) {
    try {
      const { getCourseProgramContents } = await import("./course.storage");
      const { createSessionContent, getSessionContents } = await import("./session-content.storage");

      const existingSessions = await db
        .select({ id: classSessions.id, sessionIndex: classSessions.sessionIndex })
        .from(classSessions)
        .where(eq(classSessions.classId, id))
        .orderBy(asc(classSessions.sessionIndex));

      if (existingSessions.length > 0) {
        const programContents = await getCourseProgramContents(data.programId);
        const sorted = programContents.sort((a, b) => parseFloat(String(a.sessionNumber)) - parseFloat(String(b.sessionNumber)));

        const contentsBySession: Record<number, typeof sorted> = {};
        for (const pc of sorted) {
          const sn = Math.round(parseFloat(String(pc.sessionNumber)));
          if (!contentsBySession[sn]) contentsBySession[sn] = [];
          contentsBySession[sn].push(pc);
        }

        for (let i = 0; i < existingSessions.length; i++) {
          const session = existingSessions[i];
          // Only apply if the session has no existing content
          const existingContents = await getSessionContents(session.id);
          if (existingContents.length === 0) {
            const contentsForSession = contentsBySession[i + 1] || [];
            for (let j = 0; j < contentsForSession.length; j++) {
              const pc = contentsForSession[j];
              await createSessionContent({
                classSessionId: session.id,
                contentType: (pc.type || "curriculum") as any,
                title: pc.title,
                description: pc.content || null,
                resourceUrl: pc.id,
                displayOrder: j,
              });
            }
          }
        }
      }
    } catch (err) {
      console.error("Auto-apply program contents on update error:", err);
    }
  }

  return updated;
}

// ---------------------------------------------------------------------------
// deleteClass
// ---------------------------------------------------------------------------
export async function countClassInvoices(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await db.select({ count: sql<number>`COUNT(*)::int` })
    .from(invoices)
    .where(inArray(invoices.classId, ids));
  return result[0]?.count ?? 0;
}

export async function deleteClass(id: string): Promise<void> {
  const sessions = await db.select({ id: classSessions.id }).from(classSessions).where(eq(classSessions.classId, id));
  if (sessions.length > 0) {
    const sessionIds = sessions.map(s => s.id);
    await db.delete(studentSessions).where(inArray(studentSessions.classSessionId, sessionIds));
    await db.delete(classSessions).where(inArray(classSessions.id, sessionIds));
  }
  await db.delete(studentClasses).where(eq(studentClasses.classId, id));
  // Null out classId on invoices before deleting to avoid FK constraint violation
  await db.update(invoices).set({ classId: null }).where(eq(invoices.classId, id));
  await db.delete(classes).where(eq(classes.id, id));
}

// ---------------------------------------------------------------------------
// deleteClasses
// ---------------------------------------------------------------------------
export async function deleteClasses(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction(async (tx) => {
    const sessions = await tx
      .select({ id: classSessions.id })
      .from(classSessions)
      .where(inArray(classSessions.classId, ids));

    if (sessions.length > 0) {
      const sessionIds = sessions.map(s => s.id);
      await tx.delete(studentSessions).where(inArray(studentSessions.classSessionId, sessionIds));
      await tx.delete(classSessions).where(inArray(classSessions.id, sessionIds));
    }

    await tx.delete(studentClasses).where(inArray(studentClasses.classId, ids));
    // Null out classId on invoices before deleting to avoid FK constraint violation
    await tx.update(invoices).set({ classId: null }).where(inArray(invoices.classId, ids));
    await tx.delete(classes).where(inArray(classes.id, ids));
  });
}

// ---------------------------------------------------------------------------
// getClassStudents
// ---------------------------------------------------------------------------
export async function getClassStudents(classId: string, status: string): Promise<any[]> {
  const studentClassesWithDetails = await db.query.studentClasses.findMany({
    where: and(eq(studentClasses.classId, classId), eq(studentClasses.status, status)),
    with: {
      student: { columns: { id: true, fullName: true, code: true } },
    },
  });

  if (studentClassesWithDetails.length === 0) return [];

  const studentIds = studentClassesWithDetails.map(sc => sc.studentId);

  // Batch query 1: tất cả student sessions trong lớp này (bao gồm classSessionId để filter xếp bù)
  // Batch query 2: tất cả invoices trong lớp này cho các học sinh này
  const [allSessionRows, allInvoiceRows] = await Promise.all([
    db.select({
      studentId: studentSessions.studentId,
      id: studentSessions.id,
      classSessionId: studentSessions.classSessionId,
      status: studentSessions.status,
      attendanceStatus: studentSessions.attendanceStatus,
      sessionDate: classSessions.sessionDate,
    })
    .from(studentSessions)
    .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
    .where(and(
      eq(studentSessions.classId, classId),
      inArray(studentSessions.studentId, studentIds),
    ))
    .orderBy(asc(classSessions.sessionDate)),

    db.select({
      studentId: invoices.studentId,
      remainingAmount: invoices.remainingAmount,
    })
    .from(invoices)
    .where(and(
      eq(invoices.classId, classId),
      inArray(invoices.studentId, studentIds),
    )),
  ]);

  // Build per-student maps
  type SessionRow = { id: string; classSessionId: string; status: string; attendanceStatus: string; sessionDate: string };
  const sessionsByStudent = new Map<string, SessionRow[]>();
  for (const row of allSessionRows) {
    if (!sessionsByStudent.has(row.studentId)) sessionsByStudent.set(row.studentId, []);
    sessionsByStudent.get(row.studentId)!.push({
      id: row.id,
      classSessionId: row.classSessionId,
      status: row.status,
      attendanceStatus: row.attendanceStatus,
      sessionDate: row.sessionDate,
    });
  }

  const invoicesByStudent = new Map<string, Array<{ remainingAmount: string | null }>>();
  for (const row of allInvoiceRows) {
    if (!invoicesByStudent.has(row.studentId)) invoicesByStudent.set(row.studentId, []);
    invoicesByStudent.get(row.studentId)!.push(row);
  }

  return studentClassesWithDetails.map((sc) => {
    const sessions = sessionsByStudent.get(sc.studentId) ?? [];
    const dates = sessions.map(s => s.sessionDate);
    const actualStartDate = dates.length > 0 ? dates[0] : sc.startDate;
    const actualEndDate = dates.length > 0 ? dates[dates.length - 1] : sc.endDate;

    const studentInvoices = invoicesByStudent.get(sc.studentId) ?? [];
    const hasInvoice = studentInvoices.length > 0;
    const debt = studentInvoices.reduce((sum, inv) => sum + parseFloat(inv.remainingAmount ?? "0"), 0);

    return {
      ...sc,
      startDate: actualStartDate,
      endDate: actualEndDate,
      hasInvoice,
      debt,
      // Use actual session count from student_sessions records (not the stale stored value)
      totalSessions: sessions.length,
      // Full session list for makeup filter (classSessionId, status, attendanceStatus)
      studentSessions: sessions,
    };
  });
}

// ---------------------------------------------------------------------------
// getAvailableStudentsForClass
// ---------------------------------------------------------------------------
export async function getAvailableStudentsForClass(classId: string, searchTerm?: string): Promise<any[]> {
  const [cls] = await db
    .select({ locationId: classes.locationId })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);
  if (!cls) return [];

  const existingIdsQuery = db.select({ id: studentClasses.studentId }).from(studentClasses).where(eq(studentClasses.classId, classId));

  const filters = [eq(studentLocations.locationId, cls.locationId)];
  if (searchTerm) {
    filters.push(sql`${students.fullName} ILIKE ${`%${searchTerm}%`} OR ${students.code} ILIKE ${`%${searchTerm}%`}`);
  }

  const studentsAtLocation = await db.select({
    id: students.id,
    fullName: students.fullName,
    code: students.code,
  })
  .from(students)
  .innerJoin(studentLocations, eq(students.id, studentLocations.studentId))
  .where(and(
    ...filters,
    sql`${students.id} NOT IN (${existingIdsQuery})`,
  ));

  return studentsAtLocation;
}

// ---------------------------------------------------------------------------
// findClassByCode
// ---------------------------------------------------------------------------
export async function findClassByCode(classCode: string): Promise<{ id: string; classCode: string; name: string } | null> {
  const [cls] = await db
    .select({ id: classes.id, classCode: classes.classCode, name: classes.name })
    .from(classes)
    .where(eq(classes.classCode, classCode))
    .limit(1);
  return cls ?? null;
}

// createMinimalClass
// ---------------------------------------------------------------------------
export async function createMinimalClass(data: {
  classCode: string;
  name: string;
  locationId: string;
}): Promise<{ id: string; classCode: string; name: string }> {
  const [newClass] = await db
    .insert(classes)
    .values({
      classCode: data.classCode,
      name: data.name,
      locationId: data.locationId,
      managerIds: [],
      status: "planning",
      learningFormat: "offline",
    })
    .returning({ id: classes.id, classCode: classes.classCode, name: classes.name });
  return newClass;
}

// addClassStudents
// ---------------------------------------------------------------------------
export async function addClassStudents(classId: string, studentIds: string[], userId: string): Promise<void> {
  const values = studentIds.map(sid => ({
    studentId: sid,
    classId,
    status: "waiting",
    createdBy: userId,
  }));
  if (values.length > 0) {
    await db.transaction(async (tx) => {
      await tx.insert(studentClasses).values(values);

      for (const studentId of studentIds) {
        const [student] = await tx.select({ classIds: students.classIds }).from(students).where(eq(students.id, studentId));
        if (student) {
          const currentClassIds = student.classIds || [];
          if (!currentClassIds.includes(classId)) {
            const updatedClassIds = [...currentClassIds, classId];
            await tx.update(students).set({ classIds: updatedClassIds }).where(eq(students.id, studentId));
          }
        }
      }
    });
  }
}

// ---------------------------------------------------------------------------
// getClassSessions (dùng bởi scheduleClassStudents)
// ---------------------------------------------------------------------------
export async function getClassSessions(classId: string): Promise<any[]> {
  const results = await db.query.classSessions.findMany({
    where: eq(classSessions.classId, classId),
    with: {
      shiftTemplate: { columns: { id: true, name: true, startTime: true, endTime: true } },
    },
    orderBy: (table, { asc }) => [asc(table.sessionDate), asc(table.id)],
  });

  const allTeacherIds = Array.from(new Set(results.flatMap(s => s.teacherIds || [])));
  let staffMap: Record<string, { id: string; fullName: string }> = {};
  if (allTeacherIds.length > 0) {
    const staffList = await db.select({ id: staff.id, fullName: staff.fullName }).from(staff).where(inArray(staff.id, allTeacherIds));
    staffMap = Object.fromEntries(staffList.map(s => [s.id, s]));
  }

  const allProgramIds = Array.from(new Set(results.map(s => (s as any).programId).filter(Boolean)));
  let programMap: Record<string, { id: string; name: string }> = {};
  if (allProgramIds.length > 0) {
    const { coursePrograms } = await import("@shared/schema");
    const programList = await db.select({ id: coursePrograms.id, name: coursePrograms.name }).from(coursePrograms).where(inArray(coursePrograms.id, allProgramIds));
    programMap = Object.fromEntries(programList.map(p => [p.id, p]));
  }

  const sessionIds = results.map(s => s.id);
  let contentsMap: Record<string, any[]> = {};
  if (sessionIds.length > 0) {
    const contentsList = await db.select({
      id: sessionContents.id,
      classSessionId: sessionContents.classSessionId,
      contentType: sessionContents.contentType,
      title: sessionContents.title,
      displayOrder: sessionContents.displayOrder,
    }).from(sessionContents).where(inArray(sessionContents.classSessionId, sessionIds));
    for (const c of contentsList) {
      if (!contentsMap[c.classSessionId]) contentsMap[c.classSessionId] = [];
      contentsMap[c.classSessionId].push(c);
    }
  }

  return results.map(s => ({
    ...s,
    teachers: (s.teacherIds || []).map((id: string) => staffMap[id]).filter(Boolean),
    program: (s as any).programId ? (programMap[(s as any).programId] || null) : null,
    sessionContents: (contentsMap[s.id] || []).sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
  }));
}

// ---------------------------------------------------------------------------
// scheduleClassStudents
// ---------------------------------------------------------------------------
export async function scheduleClassStudents(classId: string, configs: any[], userId?: string): Promise<void> {
  const cls = await getClass(classId);
  if (!cls) return;

  const allSessions = await getClassSessions(classId);

  const baseCodeResult = await db
    .select({ code: invoices.code })
    .from(invoices)
    .where(sql`${invoices.code} LIKE ${"PT%"} AND ${invoices.code} NOT LIKE ${"%-%"}`)
    .orderBy(sql`${invoices.code} DESC`)
    .limit(1);
  let nextCodeNum = 1;
  if (baseCodeResult.length > 0) {
    const lastCode = baseCodeResult[0].code ?? "PT00";
    nextCodeNum = (parseInt(lastCode.replace("PT", ""), 10) || 0) + 1;
  }
  let invoiceCodeCounter = 0;
  const autoCreatedInvoices: Array<{ id: string; studentId: string; classId: string }> = [];

  await db.transaction(async (tx) => {
    for (const config of configs) {
      const sid = config.studentId;
      let [sc] = await tx.select().from(studentClasses).where(and(eq(studentClasses.classId, classId), eq(studentClasses.studentId, sid)));

      // Auto-enroll student into the class if not already enrolled
      if (!sc) {
        const [newSc] = await tx.insert(studentClasses).values({
          studentId: sid,
          classId,
          status: "waiting",
          createdBy: userId || null,
        } as any).returning();
        sc = newSc;
      }

      if (!sc) continue;

      let filteredSessions = allSessions;
      if (config.shiftType === "specific" && config.selectedShifts.length > 0) {
        filteredSessions = allSessions.filter((s: any) => config.selectedShifts.includes(s.shiftTemplateId));
      }

      const start = new Date(config.startDate);
      let sessions = filteredSessions
        .filter((s: any) => new Date(s.sessionDate) >= start)
        .sort((a: any, b: any) => new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime());

      if (config.endType === "date") {
        const end = new Date(config.endDate);
        sessions = sessions.filter((s: any) => new Date(s.sessionDate) <= end);
      } else {
        sessions = sessions.slice(0, config.totalSessions);
      }

      if (sessions.length === 0) {
        throw new Error(`Không tìm thấy buổi học phù hợp cho học viên ${config.fullName}`);
      }

      // Skip sessions where the student already has a record (no duplicate)
      const sessionIds = sessions.map((s: any) => s.id);
      const existingSessionRows = await tx
        .select({ classSessionId: studentSessions.classSessionId })
        .from(studentSessions)
        .where(and(
          eq(studentSessions.studentClassId, sc.id),
          inArray(studentSessions.classSessionId, sessionIds),
        ));
      const existingSessionIdSet = new Set(existingSessionRows.map((r: any) => r.classSessionId));
      const newSessions = sessions.filter((s: any) => !existingSessionIdSet.has(s.id));

      const feePackage = config.packageId
        ? await tx.select().from(courseFeePackages).where(eq(courseFeePackages.id, config.packageId)).then((r: any[]) => r[0])
        : null;

      if (newSessions.length > 0) {
        const sSessions = newSessions.map((s: any, idx: number) => ({
          studentId: sid,
          classId,
          studentClassId: sc.id,
          classSessionId: s.id,
          status: "scheduled",
          packageId: config.packageId || null,
          packageType: feePackage?.type || null,
          sessionPrice: feePackage
            ? (feePackage.type === 'khoá' && feePackage.sessions
                ? parseFloat((parseFloat(feePackage.fee.toString()) / parseFloat(feePackage.sessions.toString())).toFixed(2))
                : parseFloat(feePackage.fee.toString()))
            : null,
          sessionSource: "normal",
          isPaid: config.packageId ? true : null,
          sessionOrder: idx + 1,
        }));
        await tx.insert(studentSessions).values(sSessions as any[]);
      }

      const stats = await tx.select({
        minDate: sql<string>`MIN(${classSessions.sessionDate})`,
        maxDate: sql<string>`MAX(${classSessions.sessionDate})`,
        total: sql<number>`COUNT(*)::int`,
        attended: sql<number>`COUNT(CASE WHEN ${studentSessions.attendanceStatus} = 'present' THEN 1 END)::int`,
      })
      .from(studentSessions)
      .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
      .where(eq(studentSessions.studentClassId, sc.id));

      const result = stats[0];

      // Compute scheduled weekdays: if student is on specific shifts, derive weekdays from those sessions
      let scheduledWeekdays: number[] | null = null;
      if (config.shiftType === "specific" && config.selectedShifts.length > 0) {
        const weekdaySet = new Set<number>(
          filteredSessions
            .map((s: any) => s.weekday)
            .filter((wd: any) => wd !== undefined && wd !== null)
        );
        scheduledWeekdays = weekdaySet.size > 0 ? [...weekdaySet].sort((a, b) => a - b) : null;
      }

      await tx.update(studentClasses)
        .set({
          status: "active",
          startDate: result.minDate,
          endDate: result.maxDate,
          totalSessions: result.total || 0,
          attendedSessions: result.attended || 0,
          remainingSessions: (result.total || 0) - (result.attended || 0),
          updatedAt: new Date(),
          ...(scheduledWeekdays !== null ? { scheduledWeekdays } : {}),
        })
        .where(eq(studentClasses.id, sc.id));

      if (config.autoInvoice && config.packageId && newSessions.length > 0) {
        const [pkg] = await tx.select().from(courseFeePackages).where(eq(courseFeePackages.id, config.packageId));
        if (pkg) {
          const feePerSession = parseFloat(pkg.fee.toString());
          const totalAmountFixed = parseFloat(pkg.totalAmount.toString());
          const baseAmount = pkg.type === "buổi"
            ? newSessions.length * feePerSession
            : totalAmountFixed;

          let totalPromotion = 0;
          let promoRecords: any[] = [];
          if (Array.isArray(config.promotionKeys) && config.promotionKeys.length > 0) {
            promoRecords = await tx.select().from(financePromotions)
              .where(and(
                inArray(financePromotions.id, config.promotionKeys),
                eq(financePromotions.type, "promotion"),
              ));
            totalPromotion = promoRecords.reduce((sum, p) => {
              const val = parseFloat(p.valueAmount?.toString() || "0");
              return sum + (p.valueType === "percent" ? Math.round(baseAmount * val / 100) : val);
            }, 0);
          }

          let totalSurcharge = 0;
          let surchargeRecords: any[] = [];
          if (Array.isArray(config.surchargeKeys) && config.surchargeKeys.length > 0) {
            surchargeRecords = await tx.select().from(financePromotions)
              .where(and(
                inArray(financePromotions.id, config.surchargeKeys),
                eq(financePromotions.type, "surcharge"),
              ));
            totalSurcharge = surchargeRecords.reduce((sum, s) => {
              const val = parseFloat(s.valueAmount?.toString() || "0");
              return sum + (s.valueType === "percent" ? Math.round(baseAmount * val / 100) : val);
            }, 0);
          }

          const grandTotal = Math.max(0, baseAmount - totalPromotion + totalSurcharge);

          const startDateFmt = newSessions[0].sessionDate;
          const endDateFmt = newSessions[newSessions.length - 1].sessionDate;
          const promoNames = promoRecords.map((p: any) => p.name).join(", ");
          const surchargeNames = surchargeRecords.map((s: any) => s.name).join(", ");
          const descParts = [
            `Học phí từ ngày ${startDateFmt} đến ${endDateFmt}`,
            `Lớp ${cls.name}`,
            `Gói học phí: ${pkg.name}`,
            promoNames ? `Khuyến mãi: ${promoNames}` : null,
            surchargeNames ? `Phụ thu: ${surchargeNames}` : null,
          ].filter(Boolean);
          const description = descParts.join(", ");

          const invoiceCode = `PT${String(nextCodeNum + invoiceCodeCounter).padStart(2, "0")}`;
          invoiceCodeCounter++;

          const [newInvoice] = await tx.insert(invoices).values({
            code: invoiceCode,
            studentId: sid,
            classId,
            locationId: cls.locationId,
            category: "Học phí",
            totalAmount: baseAmount.toString(),
            totalPromotion: totalPromotion.toString(),
            totalSurcharge: totalSurcharge.toString(),
            grandTotal: grandTotal.toString(),
            remainingAmount: grandTotal.toString(),
            paidAmount: "0",
            status: "unpaid",
            description,
            createdBy: userId || null,
          }).returning();

          if (newInvoice) {
            const qty = sessions.length > 0 ? sessions.length : 1;
            const unitPrice = pkg.type === "buổi" ? feePerSession : totalAmountFixed;
            await tx.insert(invoiceItems).values({
              invoiceId: newInvoice.id,
              packageId: pkg.id,
              packageName: pkg.name,
              packageType: pkg.type,
              unitPrice: unitPrice.toString(),
              quantity: qty,
              promotionKeys: config.promotionKeys ?? [],
              surchargeKeys: config.surchargeKeys ?? [],
              promotionAmount: totalPromotion.toString(),
              surchargeAmount: totalSurcharge.toString(),
              subtotal: grandTotal.toString(),
              sortOrder: 0,
            });

            // Handle deposit deduction if requested
            if (config.useDeposit && grandTotal > 0) {
              // Calculate current deposit balance within the transaction
              const walletRows = await tx.select().from(studentWalletTransactions)
                .where(eq(studentWalletTransactions.studentId, sid));
              let depositBalance = 0;
              for (const row of walletRows) {
                const amt = parseFloat(row.amount as any ?? "0") || 0;
                const cat = (row.category ?? "").trim();
                if (cat === "Đặt cọc") {
                  depositBalance += row.type === "credit" ? amt : -amt;
                }
              }
              if (depositBalance > 0) {
                const deductionAmt = Math.min(depositBalance, grandTotal);
                const fmtAmt = deductionAmt.toLocaleString("vi-VN") + " đ";

                // 1. Debit "Đặt cọc"
                await tx.insert(studentWalletTransactions).values({
                  studentId: sid,
                  invoiceId: newInvoice.id,
                  type: "debit",
                  amount: deductionAmt.toFixed(2),
                  category: "Đặt cọc",
                  action: `Trừ tiền đặt cọc do thanh toán hoá đơn ${newInvoice.code}: ${fmtAmt}`,
                  classId,
                  className: cls.name,
                  invoiceCode: newInvoice.code,
                  invoiceDescription: description,
                  createdBy: userId || null,
                });

                // 2. Credit "Học phí"
                await tx.insert(studentWalletTransactions).values({
                  studentId: sid,
                  invoiceId: newInvoice.id,
                  type: "credit",
                  amount: deductionAmt.toFixed(2),
                  category: "Học phí",
                  action: `Chuyển tiền từ ví đặt cọc sang Ví học phí do thanh toán hoá đơn ${newInvoice.code}: ${fmtAmt}`,
                  classId,
                  className: cls.name,
                  invoiceCode: newInvoice.code,
                  invoiceDescription: description,
                  createdBy: userId || null,
                });

                // 3. Update invoice: record deduction, paidAmount, remainingAmount
                const newPaid = deductionAmt;
                const newRemaining = Math.max(0, grandTotal - deductionAmt);
                const newStatus = newRemaining === 0 ? "paid" : "unpaid";
                await tx.update(invoices)
                  .set({
                    deduction: deductionAmt.toFixed(2),
                    paidAmount: newPaid.toFixed(2),
                    remainingAmount: newRemaining.toFixed(2),
                    status: newStatus,
                  })
                  .where(eq(invoices.id, newInvoice.id));
              }
            }

            autoCreatedInvoices.push({
              id: newInvoice.id,
              studentId: sid,
              classId,
            });
          }
        }
      }
    }
  });

  for (const inv of autoCreatedInvoices) {
    await distributeInvoiceFeeToSessions(inv.id, inv.studentId, inv.classId);
  }
}

// ==========================================
// CLASS FORMAT SUMMARY (Tổng số lớp học - online vs offline)
// ==========================================
function buildClassLocationWhere(isSuperAdmin: boolean, allowedLocationIds: string[] | null, locationId?: string): string {
  if (locationId && locationId !== "all") {
    const safe = locationId.replace(/[^a-zA-Z0-9\-]/g, "");
    return `c.location_id = '${safe}'::uuid`;
  }
  if (isSuperAdmin || allowedLocationIds === null) return "1=1";
  if (allowedLocationIds.length === 0) return "1=0";
  const ids = allowedLocationIds.map(id => `'${id.replace(/[^a-zA-Z0-9\-]/g, "")}'`).join(",");
  return `c.location_id = ANY(ARRAY[${ids}]::uuid[])`;
}

export async function getClassFormatSummary(params: {
  isSuperAdmin: boolean;
  allowedLocationIds: string[] | null;
  locationId?: string;
}): Promise<{
  total: number;
  offline: number;
  offlinePct: number;
  online: number;
  onlinePct: number;
}> {
  const where = buildClassLocationWhere(params.isSuperAdmin, params.allowedLocationIds, params.locationId);
  const queryStr = `
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE c.learning_format = 'offline') AS offline,
      COUNT(*) FILTER (WHERE c.learning_format = 'online')  AS online
    FROM classes c
    WHERE ${where}
  `;
  const result = await db.execute(sql.raw(queryStr));
  const row: any = result.rows[0] ?? {};
  const total   = parseInt(row.total ?? "0", 10);
  const offline = parseInt(row.offline ?? "0", 10);
  const online  = parseInt(row.online ?? "0", 10);
  return {
    total,
    offline,
    offlinePct: total > 0 ? Math.round((offline / total) * 100) : 0,
    online,
    onlinePct:  total > 0 ? Math.round((online  / total) * 100) : 0,
  };
}

// ==========================================
// CLASS STATUS SUMMARY (Trạng thái lớp học)
// ==========================================
export async function getClassStatusSummary(params: {
  isSuperAdmin: boolean;
  allowedLocationIds: string[] | null;
  locationId?: string;
}): Promise<{
  planning: number;
  recruiting: number;
  active: number;
  closed: number;
  total: number;
}> {
  const where = buildClassLocationWhere(params.isSuperAdmin, params.allowedLocationIds, params.locationId);
  const queryStr = `
    SELECT
      COUNT(*) FILTER (WHERE c.status = 'planning')   AS planning,
      COUNT(*) FILTER (WHERE c.status = 'recruiting') AS recruiting,
      COUNT(*) FILTER (WHERE c.status = 'active')     AS active,
      COUNT(*) FILTER (WHERE c.status = 'closed')     AS closed,
      COUNT(*) AS total
    FROM classes c
    WHERE ${where}
  `;
  const result = await db.execute(sql.raw(queryStr));
  const row: any = result.rows[0] ?? {};
  return {
    planning:   parseInt(row.planning   ?? "0", 10),
    recruiting: parseInt(row.recruiting ?? "0", 10),
    active:     parseInt(row.active     ?? "0", 10),
    closed:     parseInt(row.closed     ?? "0", 10),
    total:      parseInt(row.total      ?? "0", 10),
  };
}

// ==========================================
// NEW CLASSES SUMMARY (Lớp học mới)
// ==========================================
export async function getNewClassesSummary(params: {
  isSuperAdmin: boolean;
  allowedLocationIds: string[] | null;
  locationId?: string;
}): Promise<{
  today: number;
  thisMonth: number;
}> {
  const where = buildClassLocationWhere(params.isSuperAdmin, params.allowedLocationIds, params.locationId);
  const queryStr = `
    SELECT
      COUNT(*) FILTER (WHERE DATE(c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = CURRENT_DATE) AS today,
      COUNT(*) FILTER (
        WHERE DATE_TRUNC('month', c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
            = DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')
      ) AS this_month
    FROM classes c
    WHERE ${where}
  `;
  const result = await db.execute(sql.raw(queryStr));
  const row: any = result.rows[0] ?? {};
  return {
    today:     parseInt(row.today      ?? "0", 10),
    thisMonth: parseInt(row.this_month ?? "0", 10),
  };
}
