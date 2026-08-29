import {
  db, eq, and, asc, sql, inArray,
  courses, courseFeePackages, coursePrograms, courseProgramContents, users,
  studentSessions, classSessions,
} from "./base";
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

    // Keep Vietnamese type values ("buổi" / "khoá") consistent with how
    // initial scheduling stores them — the UI checks packageType === 'buổi'.
    const packageType = feePackage.type; // "buổi" or "khoá"
    let sessionPrice: string;

    if (feePackage.type === "buổi") {
      sessionPrice = feePackage.fee.toString();
    } else {
      const numSessions = Number(feePackage.sessions);
      const numFee = Number(feePackage.fee);
      sessionPrice = (numFee / numSessions).toFixed(2);
    }

    if (matchingSessions.length > 0) {
      const matchingIds = matchingSessions.map(s => s.id);
      await tx.update(studentSessions)
        .set({
          packageId: packageId,
          packageType: packageType,
          sessionPrice: sessionPrice,
          updatedAt: new Date(),
        })
        .where(inArray(studentSessions.id, matchingIds));
    }

    return { warning };
  });
}
