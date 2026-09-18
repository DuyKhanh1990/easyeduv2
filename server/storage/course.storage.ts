import {
  db, eq, and, asc, sql, inArray,
  courses, courseFeePackages, coursePrograms, courseProgramContents, users,
  studentSessions, classSessions, invoices, invoiceSessionAllocations,
} from "./base";
import { distributeInvoiceFeeToSessionsInTransaction } from "./invoice-session-allocation.storage";
import type {
  Course, InsertCourse,
  CourseFeePackage, InsertCourseFeePackage,
  CourseProgram, CourseProgramContent,
} from "./base";

// ==========================================
// COURSES & FEE PACKAGES
// ==========================================

export async function getCourses(allowedLocationIds?: string[]): Promise<Course[]> {
  if (!allowedLocationIds || allowedLocationIds.length === 0) {
    return await db.select().from(courses).orderBy(sql`${courses.createdAt} desc`);
  }
  return await db.select().from(courses)
    .where(sql`(${courses.locationId} IS NULL OR ${courses.locationId} = ANY(ARRAY[${sql.raw(allowedLocationIds.map(id => `'${id}'`).join(','))}]::uuid[]))`)
    .orderBy(sql`${courses.createdAt} desc`);
}

export async function createCourse(course: InsertCourse): Promise<Course> {
  const [newCourse] = await db.insert(courses).values(course).returning();
  return newCourse;
}

export async function updateCourse(id: string, data: Partial<InsertCourse>): Promise<Course> {
  const [updated] = await db
    .update(courses)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(courses.id, id))
    .returning();
  return updated;
}

export async function deleteCourse(id: string): Promise<void> {
  await db.delete(courses).where(eq(courses.id, id));
}

export async function getCourseFeePackages(courseId: string): Promise<CourseFeePackage[]> {
  return await db.select().from(courseFeePackages).where(eq(courseFeePackages.courseId, courseId)).orderBy(sql`${courseFeePackages.createdAt} asc`);
}

export async function getAllFeePackages(locationId?: string): Promise<any[]> {
  const conditions = locationId ? [eq(courses.locationId, locationId)] : [];
  const rows = await db
    .select({
      id: courseFeePackages.id,
      courseId: courseFeePackages.courseId,
      name: courseFeePackages.name,
      type: courseFeePackages.type,
      fee: courseFeePackages.fee,
      sessions: courseFeePackages.sessions,
      totalAmount: courseFeePackages.totalAmount,
      courseName: sql<string>`courses.name`,
      courseLocationId: courses.locationId,
    })
    .from(courseFeePackages)
    .leftJoin(courses, eq(courseFeePackages.courseId, courses.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(courseFeePackages.name);
  return rows;
}

export async function createCourseFeePackage(pkg: InsertCourseFeePackage): Promise<CourseFeePackage> {
  const [newPkg] = await db.insert(courseFeePackages).values(pkg).returning();
  return newPkg;
}

export async function updateCourseFeePackage(id: string, data: Partial<InsertCourseFeePackage>): Promise<CourseFeePackage> {
  const [updated] = await db.update(courseFeePackages).set(data).where(eq(courseFeePackages.id, id)).returning();
  return updated;
}

export async function deleteCourseFeePackage(id: string): Promise<void> {
  await db.delete(courseFeePackages).where(eq(courseFeePackages.id, id));
}

// ==========================================
// COURSE PROGRAMS
// ==========================================

export async function getCoursePrograms(allowedLocationIds?: string[]): Promise<CourseProgram[]> {
  if (!allowedLocationIds || allowedLocationIds.length === 0) {
    return await db.select().from(coursePrograms);
  }
  return await db.select().from(coursePrograms)
    .where(sql`(${coursePrograms.locationIds} = '{}'::uuid[] OR ${coursePrograms.locationIds} && ${allowedLocationIds}::uuid[])`);
}

export async function updateCourseProgram(id: string, data: any): Promise<CourseProgram> {
  const [updated] = await db
    .update(coursePrograms)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(coursePrograms.id, id))
    .returning();
  return updated;
}

export async function deleteCourseProgram(id: string): Promise<void> {
  await db.delete(coursePrograms).where(eq(coursePrograms.id, id));
}

export async function createCourseProgram(program: any): Promise<CourseProgram> {
  const [newProgram] = await db.insert(coursePrograms).values(program).returning();
  return newProgram;
}

export async function getCourseProgramContents(programId: string): Promise<CourseProgramContent[]> {
  return await db.select().from(courseProgramContents).where(eq(courseProgramContents.programId, programId));
}

export async function getAllCourseProgramContents(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<{ items: any[]; total: number }> {
  const page = Math.max(1, params?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params?.pageSize ?? 20));
  const offset = (page - 1) * pageSize;
  const search = params?.search?.trim() ?? "";

  const baseQuery = db
    .select({
      id: courseProgramContents.id,
      programId: courseProgramContents.programId,
      sessionNumber: courseProgramContents.sessionNumber,
      title: courseProgramContents.title,
      type: courseProgramContents.type,
      content: courseProgramContents.content,
      attachments: courseProgramContents.attachments,
      createdBy: courseProgramContents.createdBy,
      createdAt: courseProgramContents.createdAt,
      updatedAt: courseProgramContents.updatedAt,
      programName: coursePrograms.name,
      createdByUsername: users.username,
    })
    .from(courseProgramContents)
    .leftJoin(coursePrograms, eq(courseProgramContents.programId, coursePrograms.id))
    .leftJoin(users, eq(courseProgramContents.createdBy, users.id));

  const whereCondition = search
    ? sql`(${courseProgramContents.title} ILIKE ${'%' + search + '%'}
        OR ${coursePrograms.name} ILIKE ${'%' + search + '%'}
        OR ${courseProgramContents.type} ILIKE ${'%' + search + '%'})`
    : undefined;

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(courseProgramContents)
    .leftJoin(coursePrograms, eq(courseProgramContents.programId, coursePrograms.id))
    .leftJoin(users, eq(courseProgramContents.createdBy, users.id))
    .$dynamic()
    .where(whereCondition ?? sql`true`);

  const total = Number(countRows[0]?.count ?? 0);

  const items = await baseQuery
    .$dynamic()
    .where(whereCondition ?? sql`true`)
    .orderBy(sql`${courseProgramContents.createdAt} desc`)
    .limit(pageSize)
    .offset(offset);

  return { items, total };
}

export async function getCourseProgramContentById(id: string): Promise<any | null> {
  const rows = await db
    .select({
      id: courseProgramContents.id,
      programId: courseProgramContents.programId,
      sessionNumber: courseProgramContents.sessionNumber,
      title: courseProgramContents.title,
      type: courseProgramContents.type,
      content: courseProgramContents.content,
      attachments: courseProgramContents.attachments,
      allowDownload: courseProgramContents.allowDownload,
      createdBy: courseProgramContents.createdBy,
      createdAt: courseProgramContents.createdAt,
      updatedAt: courseProgramContents.updatedAt,
      programName: coursePrograms.name,
      createdByUsername: users.username,
    })
    .from(courseProgramContents)
    .leftJoin(coursePrograms, eq(courseProgramContents.programId, coursePrograms.id))
    .leftJoin(users, eq(courseProgramContents.createdBy, users.id))
    .where(eq(courseProgramContents.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createCourseProgramContent(content: any): Promise<CourseProgramContent> {
  const [newContent] = await db.insert(courseProgramContents).values(content).returning();
  return newContent;
}

export async function updateCourseProgramContent(id: string, updates: any): Promise<CourseProgramContent> {
  const [updated] = await db.update(courseProgramContents).set({ ...updates, updatedAt: new Date() }).where(eq(courseProgramContents.id, id)).returning();
  return updated;
}

export async function deleteCourseProgramContent(id: string): Promise<void> {
  // Lấy attachments trước khi xóa để trừ dung lượng
  const [row] = await db.select({ attachments: courseProgramContents.attachments }).from(courseProgramContents).where(eq(courseProgramContents.id, id));
  await db.delete(courseProgramContents).where(eq(courseProgramContents.id, id));
  if (row?.attachments?.length) {
    const { subtractFilesByUrls } = await import("../lib/storage-usage");
    subtractFilesByUrls(row.attachments).catch(() => {});
  }
}

export async function migrateContentLibrarySchema(): Promise<void> {
  // No-op: course_program_contents columns (allow_download, created_by, nullable program_id/session_number)
  // are all declared in shared/schema.ts
  // Apply via: npm run db:push  or  npx tsx scripts/push-db-direct.ts
}

// ==========================================
// STUDENT TUITION
// ==========================================

export async function updateStudentTuitionPackage(
  studentClassIds: string[],
  packageId: string,
  fromSessionIndex: number,
  toSessionIndex: number,
): Promise<{ warning?: string }> {
  return await db.transaction(async (tx) => {
    const [feePackage] = await tx.select({
      id: courseFeePackages.id,
      type: courseFeePackages.type,
      fee: courseFeePackages.fee,
      sessions: courseFeePackages.sessions,
      totalAmount: courseFeePackages.totalAmount,
    })
      .from(courseFeePackages)
      .where(eq(courseFeePackages.id, packageId));

    if (!feePackage) {
      throw new Error("Gói học phí không tồn tại");
    }

    // Join studentSessions → classSessions to filter by sessionIndex (class-level index),
    // not sessionOrder (student-level sequential counter) which can differ if the student
    // joined mid-class.
    const matchingSessions = await tx.select({
      id: studentSessions.id,
      studentClassId: studentSessions.studentClassId,
      studentId: studentSessions.studentId,
      classId: studentSessions.classId,
      attendanceStatus: studentSessions.attendanceStatus,
    })
      .from(studentSessions)
      .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
      .where(
        and(
          inArray(studentSessions.studentClassId, studentClassIds),
          sql`${classSessions.sessionIndex} >= ${fromSessionIndex}`,
          sql`${classSessions.sessionIndex} <= ${toSessionIndex}`,
        )
      )
      .orderBy(asc(classSessions.sessionIndex));

    const attendedCount = matchingSessions.filter(s => s.attendanceStatus && s.attendanceStatus !== "pending").length;
    let warning: string | undefined;
    if (attendedCount > 0) {
      warning = `Có ${attendedCount} buổi đã điểm danh trong khoảng này`;
    }

    const sessionsByStudentClass = new Map<string, typeof matchingSessions>();
    for (const session of matchingSessions) {
      if (!session.studentClassId) continue;
      const group = sessionsByStudentClass.get(session.studentClassId) ?? [];
      group.push(session);
      sessionsByStudentClass.set(session.studentClassId, group);
    }

    // The selected package applies to the actual selected sessions for each
    // student, not to the package template's configured session count.
    for (const sessions of sessionsByStudentClass.values()) {
      const matchingIds = sessions.map((session) => session.id);
      const packageTotal = Number(feePackage.totalAmount ?? feePackage.fee);
      const sessionPrice = feePackage.type === "buổi"
        ? Number(feePackage.fee)
        : packageTotal / Math.max(1, sessions.length);
      await tx.update(studentSessions)
        .set({
          packageId: packageId,
          packageType: feePackage.type,
          sessionPrice: sessionPrice.toFixed(2),
          updatedAt: new Date(),
        })
        .where(inArray(studentSessions.id, matchingIds));
    }

    for (const [studentClassId, selectedSessions] of sessionsByStudentClass) {
      const sample = selectedSessions[0];
      if (!sample?.studentId || !sample.classId) continue;

      // Rebuild every tuition allocation for this student/class after changing
      // package membership. Existing net totals (after promotions/surcharges)
      // stay intact but are divided by the sessions that still belong to each
      // package.
      const tuitionInvoices = await tx.select({ id: invoices.id })
        .from(invoices)
        .where(and(
          eq(invoices.studentId, sample.studentId),
          eq(invoices.classId, sample.classId),
          eq(invoices.category, "Học phí"),
          sql`${invoices.status} <> 'cancelled'`,
        ));

      for (const invoice of tuitionInvoices) {
        await distributeInvoiceFeeToSessionsInTransaction(
          tx,
          invoice.id,
          sample.studentId,
          sample.classId,
        );
      }

      const allSessions = await tx.select({
        id: studentSessions.id,
        packageId: studentSessions.packageId,
        packageType: studentSessions.packageType,
      })
        .from(studentSessions)
        .where(eq(studentSessions.studentClassId, studentClassId));

      if (allSessions.length === 0) continue;

      const allSessionIds = allSessions.map((session) => session.id);
      const allocationTotals = await tx.select({
        studentSessionId: invoiceSessionAllocations.studentSessionId,
        total: sql<string>`SUM(${invoiceSessionAllocations.allocatedAmount})`,
      })
        .from(invoiceSessionAllocations)
        .where(inArray(invoiceSessionAllocations.studentSessionId, allSessionIds))
        .groupBy(invoiceSessionAllocations.studentSessionId);
      const allocationBySession = new Map(
        allocationTotals.map((row) => [row.studentSessionId, Number(row.total)]),
      );

      const packageIds = Array.from(new Set(
        allSessions.map((session) => session.packageId).filter((id): id is string => Boolean(id)),
      ));
      const packageRows = packageIds.length > 0
        ? await tx.select({
            id: courseFeePackages.id,
            type: courseFeePackages.type,
            fee: courseFeePackages.fee,
            totalAmount: courseFeePackages.totalAmount,
          })
            .from(courseFeePackages)
            .where(inArray(courseFeePackages.id, packageIds))
        : [];
      const packageById = new Map(packageRows.map((pkg) => [pkg.id, pkg]));
      const sessionCountByPackage = new Map<string, number>();
      for (const session of allSessions) {
        if (!session.packageId) continue;
        sessionCountByPackage.set(
          session.packageId,
          (sessionCountByPackage.get(session.packageId) ?? 0) + 1,
        );
      }

      const idsByPrice = new Map<string, string[]>();
      for (const session of allSessions) {
        const allocatedPrice = allocationBySession.get(session.id);
        const pkg = session.packageId ? packageById.get(session.packageId) : null;
        const fallbackPrice = pkg
          ? pkg.type === "buổi"
            ? Number(pkg.fee)
            : Number(pkg.totalAmount ?? pkg.fee)
              / Math.max(1, sessionCountByPackage.get(pkg.id) ?? 1)
          : 0;
        const price = (allocatedPrice ?? fallbackPrice).toFixed(2);
        const ids = idsByPrice.get(price) ?? [];
        ids.push(session.id);
        idsByPrice.set(price, ids);
      }

      for (const [price, sessionIds] of idsByPrice) {
        await tx.update(studentSessions)
          .set({ sessionPrice: price, updatedAt: new Date() })
          .where(inArray(studentSessions.id, sessionIds));
      }
    }

    return { warning };
  });
}
