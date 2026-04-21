import {
  db, eq, and, asc, sql, inArray,
  courses, courseFeePackages, coursePrograms, courseProgramContents, users,
  studentSessions,
} from "./base";
import type {
  Course, InsertCourse,
  CourseFeePackage, InsertCourseFeePackage,
  CourseProgram, CourseProgramContent,
} from "./base";

// ==========================================
// COURSES & FEE PACKAGES
// ==========================================

export async function getCourses(): Promise<Course[]> {
  return await db.select().from(courses).orderBy(sql`${courses.createdAt} desc`);
}

export async function createCourse(course: InsertCourse): Promise<Course> {
  const [newCourse] = await db.insert(courses).values(course).returning();
  return newCourse;
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

export async function getCoursePrograms(): Promise<CourseProgram[]> {
  return await db.select().from(coursePrograms);
}

export async function createCourseProgram(program: any): Promise<CourseProgram> {
  const [newProgram] = await db.insert(coursePrograms).values(program).returning();
  return newProgram;
}

export async function getCourseProgramContents(programId: string): Promise<CourseProgramContent[]> {
  return await db.select().from(courseProgramContents).where(eq(courseProgramContents.programId, programId));
}

export async function getAllCourseProgramContents(): Promise<any[]> {
  return await db
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
    .leftJoin(users, eq(courseProgramContents.createdBy, users.id))
    .orderBy(sql`${courseProgramContents.createdAt} desc`);
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
  await db.delete(courseProgramContents).where(eq(courseProgramContents.id, id));
}

export async function migrateContentLibrarySchema(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE course_program_contents
        ALTER COLUMN program_id DROP NOT NULL,
        ALTER COLUMN session_number DROP NOT NULL
    `);
    console.log("Migration: content library - program_id & session_number now nullable");
  } catch (e: any) {
    if (!e.message?.includes("already")) {
      console.log("Migration content library columns: already applied or skipped");
    }
  }
  try {
    await db.execute(sql`
      ALTER TABLE course_program_contents
        ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id)
    `);
    console.log("Migration: content library - created_by column added");
  } catch (e: any) {
    console.log("Migration created_by: already exists or skipped");
  }
}

// ==========================================
// STUDENT TUITION
// ==========================================

export async function updateStudentTuitionPackage(
  studentClassIds: string[],
  packageId: string,
  fromSessionOrder: number,
  toSessionOrder: number,
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

    const sessionSessions = await tx.select({
      id: studentSessions.id,
      attendanceStatus: studentSessions.attendanceStatus,
      sessionOrder: studentSessions.sessionOrder,
    })
      .from(studentSessions)
      .where(
        and(
          inArray(studentSessions.studentClassId, studentClassIds),
          sql`${studentSessions.sessionOrder} >= ${fromSessionOrder} AND ${studentSessions.sessionOrder} <= ${toSessionOrder}`,
        )
      )
      .orderBy(studentSessions.sessionOrder);

    const attendedCount = sessionSessions.filter(s => s.attendanceStatus && s.attendanceStatus !== "pending").length;
    let warning: string | undefined;
    if (attendedCount > 0) {
      warning = `Có ${attendedCount} buổi đã điểm danh trong khoảng này`;
    }

    const packageType = feePackage.type === "buổi" ? "session" : "course";
    let sessionPrice: string;

    if (feePackage.type === "buổi") {
      sessionPrice = feePackage.fee.toString();
    } else {
      const numSessions = Number(feePackage.sessions);
      const numFee = Number(feePackage.fee);
      sessionPrice = (numFee / numSessions).toFixed(2);
    }

    await tx.update(studentSessions)
      .set({
        packageId: packageId,
        packageType: packageType,
        sessionPrice: sessionPrice,
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(studentSessions.studentClassId, studentClassIds),
          sql`${studentSessions.sessionOrder} >= ${fromSessionOrder} AND ${studentSessions.sessionOrder} <= ${toSessionOrder}`,
        )
      );

    return { warning };
  });
}
