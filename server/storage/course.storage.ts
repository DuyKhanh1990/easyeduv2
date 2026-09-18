import {
  db, eq, and, asc, sql, inArray,
  courses, courseFeePackages, coursePrograms, courseProgramContents, users,
  studentClasses, studentSessions, classSessions, classes,
  invoices, invoiceItems, invoicePaymentSchedule, invoiceSessionAllocations,
  financePromotions, tuitionPackageChangeRequests, tuitionPackageChangeOperations, tuitionPackageSessionAdjustments,
  studentWalletTransactions, attendanceFeeRules,
} from "./base";
import { getNextLocationCode } from "./finance.storage";
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
  changes: Array<{
    studentClassId: string;
    packageId: string;
    promotionIds?: string[];
    surchargeIds?: string[];
    createAdjustmentInvoice?: boolean;
    invoiceDescription?: string;
  }>,
  fromSessionIndex: number,
  toSessionIndex: number,
  userId?: string | null,
  operationKey?: string,
): Promise<{
  warning?: string;
  adjustments: Array<{ studentClassId: string; difference: number; invoiceId: string | null }>;
  replayed?: boolean;
}> {
  return await db.transaction(async (tx) => {
    if (changes.length === 0) throw new Error("Vui lòng chọn ít nhất một học viên");
    if (!operationKey || !/^[a-zA-Z0-9-]{8,80}$/.test(operationKey)) {
      throw new Error("Mã thao tác đổi gói không hợp lệ");
    }

    const studentClassIds = [...new Set(changes.map((change) => change.studentClassId))];
    if (studentClassIds.length !== changes.length) {
      throw new Error("Danh sách học viên bị trùng");
    }

    const enrollmentRows = await tx.select({
      id: studentClasses.id,
      studentId: studentClasses.studentId,
      classId: studentClasses.classId,
      className: classes.name,
      locationId: classes.locationId,
      courseId: classes.courseId,
    })
      .from(studentClasses)
      .innerJoin(classes, eq(studentClasses.classId, classes.id))
      .where(inArray(studentClasses.id, studentClassIds))
      .for("update");

    if (enrollmentRows.length !== studentClassIds.length) {
      throw new Error("Không tìm thấy đầy đủ thông tin học viên trong lớp");
    }
    const classIds = new Set(enrollmentRows.map((row) => row.classId));
    if (classIds.size !== 1) throw new Error("Chỉ được đổi gói cho học viên trong cùng một lớp");

    const changeByStudentClass = new Map(changes.map((change) => [change.studentClassId, change]));
    const packageIds = [...new Set(changes.map((change) => change.packageId))];
    const packageRows = await tx.select({
      id: courseFeePackages.id,
      courseId: courseFeePackages.courseId,
      name: courseFeePackages.name,
      type: courseFeePackages.type,
      fee: courseFeePackages.fee,
      totalAmount: courseFeePackages.totalAmount,
    })
      .from(courseFeePackages)
      .where(inArray(courseFeePackages.id, packageIds));
    if (packageRows.length !== packageIds.length) throw new Error("Gói học phí không tồn tại");

    const enrollmentById = new Map(enrollmentRows.map((row) => [row.id, row]));
    const packageById = new Map(packageRows.map((pkg) => [pkg.id, pkg]));
    for (const change of changes) {
      const enrollment = enrollmentById.get(change.studentClassId)!;
      const feePackage = packageById.get(change.packageId)!;
      if (enrollment.courseId && feePackage.courseId !== enrollment.courseId) {
        throw new Error("Gói học phí không thuộc khóa học của lớp");
      }
    }

    const promotionIds = [...new Set(changes.flatMap((change) => change.promotionIds ?? []))];
    const surchargeIds = [...new Set(changes.flatMap((change) => change.surchargeIds ?? []))];
    const adjustmentIds = [...new Set([...promotionIds, ...surchargeIds])];
    const adjustmentRows = adjustmentIds.length > 0
      ? await tx.select().from(financePromotions).where(inArray(financePromotions.id, adjustmentIds))
      : [];
    const adjustmentById = new Map(adjustmentRows.map((row) => [row.id, row]));
    for (const id of promotionIds) {
      const row = adjustmentById.get(id);
      if (!row || row.type !== "promotion" || !row.isActive) throw new Error("Khuyến mãi không hợp lệ");
    }
    for (const id of surchargeIds) {
      const row = adjustmentById.get(id);
      if (!row || row.type !== "surcharge" || !row.isActive) throw new Error("Phụ thu không hợp lệ");
    }

    const requestHash = JSON.stringify({
      fromSessionIndex,
      toSessionIndex,
      changes: changes
        .map((change) => ({
          studentClassId: change.studentClassId,
          packageId: change.packageId,
          promotionIds: [...(change.promotionIds ?? [])].sort(),
          surchargeIds: [...(change.surchargeIds ?? [])].sort(),
          createAdjustmentInvoice: change.createAdjustmentInvoice === true,
          invoiceDescription: change.invoiceDescription?.trim() || null,
        }))
        .sort((left, right) => left.studentClassId.localeCompare(right.studentClassId)),
    });
    const insertedRequests = await tx.insert(tuitionPackageChangeRequests).values({
      operationKey,
      requestHash,
      createdBy: userId ?? null,
    })
      .onConflictDoNothing({ target: tuitionPackageChangeRequests.operationKey })
      .returning();
    const request = insertedRequests[0] ?? (await tx.select()
      .from(tuitionPackageChangeRequests)
      .where(eq(tuitionPackageChangeRequests.operationKey, operationKey))
      .limit(1))[0];
    if (!request) throw new Error("Không thể khởi tạo thao tác đổi gói");

    if (insertedRequests.length === 0) {
      if (request.requestHash !== requestHash) {
        throw new Error("Mã thao tác đã được sử dụng cho một yêu cầu đổi gói khác");
      }
      const existingOperations = await tx.select()
        .from(tuitionPackageChangeOperations)
        .where(eq(tuitionPackageChangeOperations.requestId, request.id));
      if (existingOperations.length !== studentClassIds.length) {
        throw new Error("Thao tác đổi gói trước đó chưa hoàn tất");
      }
      return {
        replayed: true,
        adjustments: existingOperations.map((operation) => ({
          studentClassId: operation.studentClassId,
          difference: Number(operation.difference),
          invoiceId: operation.adjustmentInvoiceId,
        })),
      };
    }

    const matchingSessions = await tx.select({
      id: studentSessions.id,
      studentClassId: studentSessions.studentClassId,
      studentId: studentSessions.studentId,
      classId: studentSessions.classId,
      attendanceStatus: studentSessions.attendanceStatus,
      sessionPrice: studentSessions.sessionPrice,
      packageId: studentSessions.packageId,
      sessionIndex: classSessions.sessionIndex,
      sessionDate: classSessions.sessionDate,
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
      .orderBy(asc(classSessions.sessionIndex))
      .for("update");

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

    if (sessionsByStudentClass.size !== studentClassIds.length) {
      throw new Error("Một số học viên không có buổi học trong khoảng đã chọn");
    }

    const selectedSessionIds = matchingSessions.map((session) => session.id);
    const allocationRows = await tx.select({
      invoiceId: invoiceSessionAllocations.invoiceId,
      invoiceItemId: invoiceSessionAllocations.invoiceItemId,
      studentSessionId: invoiceSessionAllocations.studentSessionId,
      amount: invoiceSessionAllocations.allocatedAmount,
    })
      .from(invoiceSessionAllocations)
      .where(inArray(invoiceSessionAllocations.studentSessionId, selectedSessionIds));
    const packageAdjustmentRows = await tx.select({
      studentSessionId: tuitionPackageSessionAdjustments.studentSessionId,
      amount: tuitionPackageSessionAdjustments.effectiveAmount,
      appliedSequence: tuitionPackageSessionAdjustments.appliedSequence,
    })
      .from(tuitionPackageSessionAdjustments)
      .where(inArray(tuitionPackageSessionAdjustments.studentSessionId, selectedSessionIds))
      .orderBy(asc(tuitionPackageSessionAdjustments.appliedSequence));
    const allocatedCentsBySession = new Map<string, number>();
    for (const row of allocationRows) {
      allocatedCentsBySession.set(
        row.studentSessionId,
        (allocatedCentsBySession.get(row.studentSessionId) ?? 0) + Math.round(Number(row.amount) * 100),
      );
    }
    const effectiveOverrideCentsBySession = new Map<string, number>();
    for (const row of packageAdjustmentRows) {
      effectiveOverrideCentsBySession.set(row.studentSessionId, Math.round(Number(row.amount) * 100));
    }
    const oldPackageIds = [...new Set(matchingSessions.map((session) => session.packageId).filter(Boolean))] as string[];
    const oldPackageRows = oldPackageIds.length > 0
      ? await tx.select({ id: courseFeePackages.id, name: courseFeePackages.name })
        .from(courseFeePackages)
        .where(inArray(courseFeePackages.id, oldPackageIds))
      : [];
    const oldPackageNameById = new Map(oldPackageRows.map((pkg) => [pkg.id, pkg.name]));

    const splitCents = (totalCents: number, count: number): number[] => {
      const sign = totalCents < 0 ? -1 : 1;
      const absolute = Math.abs(totalCents);
      const base = Math.floor(absolute / count);
      const remainder = absolute - base * count;
      return Array.from({ length: count }, (_, index) =>
        sign * (base + (index >= count - remainder ? 1 : 0)),
      );
    };
    const formatAmount = (cents: number) => (cents / 100).toFixed(2);
    const formatInvoiceDate = (value: string | null | undefined) => {
      const parts = String(value ?? "").slice(0, 10).split("-");
      return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(value ?? "");
    };
    const businessDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const results: Array<{ studentClassId: string; difference: number; invoiceId: string | null }> = [];

    for (const [studentClassId, selectedSessions] of sessionsByStudentClass) {
      const change = changeByStudentClass.get(studentClassId)!;
      const feePackage = packageById.get(change.packageId)!;
      const enrollment = enrollmentById.get(studentClassId)!;
      const marker = `TUITION_CHANGE:${operationKey}:${studentClassId}`;

      const oldCentsBySession = selectedSessions.map((session) =>
        effectiveOverrideCentsBySession.has(session.id)
          ? effectiveOverrideCentsBySession.get(session.id)!
          : allocatedCentsBySession.has(session.id)
          ? allocatedCentsBySession.get(session.id)!
          : Math.round(Number(session.sessionPrice ?? 0) * 100),
      );
      const oldTotalCents = oldCentsBySession.reduce((sum, amount) => sum + amount, 0);
      const isPerSessionPackage = feePackage.type === "buổi";
      const adjustmentBase = isPerSessionPackage
        ? Number(feePackage.fee)
        : Number(feePackage.totalAmount ?? feePackage.fee);

      const calculateAdjustment = (ids: string[], expectedType: "promotion" | "surcharge") =>
        ids.reduce((sum, id) => {
          const item = adjustmentById.get(id)!;
          if (item.type !== expectedType) return sum;
          const value = Number(item.valueAmount ?? 0);
          return sum + (item.valueType === "percent" ? Math.round(adjustmentBase * value) / 100 : value);
        }, 0);
      const promotionAmount = calculateAdjustment(change.promotionIds ?? [], "promotion");
      const surchargeAmount = calculateAdjustment(change.surchargeIds ?? [], "surcharge");
      const adjustedPackageAmount = Math.max(0, adjustmentBase - promotionAmount + surchargeAmount);
      const targetCentsBySession = isPerSessionPackage
        ? Array.from(
            { length: selectedSessions.length },
            () => Math.round(adjustedPackageAmount * 100),
          )
        : splitCents(Math.round(adjustedPackageAmount * 100), selectedSessions.length);
      const newTotalCents = targetCentsBySession.reduce((sum, amount) => sum + amount, 0);
      const deltaCentsBySession = targetCentsBySession.map((target, index) => target - oldCentsBySession[index]);
      const differenceCents = newTotalCents - oldTotalCents;

      for (let index = 0; index < selectedSessions.length; index++) {
        await tx.update(studentSessions)
          .set({
            packageId: feePackage.id,
            packageType: feePackage.type,
            sessionPrice: formatAmount(targetCentsBySession[index]),
            updatedAt: new Date(),
          })
          .where(eq(studentSessions.id, selectedSessions[index].id));
      }

      let invoiceId: string | null = null;
       if (change.createAdjustmentInvoice === true && differenceCents !== 0) {
        const isIncome = differenceCents > 0;
        const absoluteCents = Math.abs(differenceCents);
        const code = await getNextLocationCode(enrollment.locationId, isIncome ? "PT" : "PC", tx);
         const firstSelectedSession = selectedSessions[0];
         const lastSelectedSession = selectedSessions[selectedSessions.length - 1];
         const oldPackageName = oldPackageNameById.get(firstSelectedSession.packageId ?? "")
           || "gói học phí hiện tại";
         const description = change.invoiceDescription?.trim()
           || `Thay đổi gói học phí ${oldPackageName} sang ${feePackage.name} từ buổi ${firstSelectedSession.sessionIndex} ngày ${formatInvoiceDate(firstSelectedSession.sessionDate)} - Buổi ${lastSelectedSession.sessionIndex} ngày ${formatInvoiceDate(lastSelectedSession.sessionDate)}`;
        const [invoice] = await tx.insert(invoices).values({
          code,
          type: isIncome ? "Thu" : "Chi",
          locationId: enrollment.locationId,
          studentId: enrollment.studentId,
          classId: enrollment.classId,
          category: isIncome ? "Học phí" : "Hoàn học phí",
          totalAmount: formatAmount(absoluteCents),
          totalPromotion: "0",
          totalSurcharge: "0",
          grandTotal: formatAmount(absoluteCents),
          paidAmount: "0",
          remainingAmount: formatAmount(absoluteCents),
          status: "unpaid",
          description,
          note: marker,
          dueDate: businessDate,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        }).returning();
        const [item] = await tx.insert(invoiceItems).values({
          invoiceId: invoice.id,
          packageId: feePackage.id,
          packageName: `Chênh lệch đổi gói: ${feePackage.name}`,
          packageType: null,
          unitPrice: formatAmount(absoluteCents),
          quantity: 1,
          promotionKeys: change.promotionIds ?? [],
          surchargeKeys: change.surchargeIds ?? [],
          promotionAmount: "0",
          surchargeAmount: "0",
          subtotal: formatAmount(absoluteCents),
          category: "Học phí",
          sortOrder: 0,
        }).returning();
        await tx.insert(invoicePaymentSchedule).values({
          invoiceId: invoice.id,
          label: "ĐỢT 1",
          code: `${code}-1`,
          amount: formatAmount(absoluteCents),
          dueDate: businessDate,
          status: "unpaid",
          sortOrder: 0,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        });
        invoiceId = invoice.id;
      }

      const [operation] = await tx.insert(tuitionPackageChangeOperations).values({
        requestId: request.id,
        studentClassId,
        oldTotal: formatAmount(oldTotalCents),
        newTotal: formatAmount(newTotalCents),
        difference: formatAmount(differenceCents),
        adjustmentInvoiceId: invoiceId,
        createdBy: userId ?? null,
      }).returning();

      await tx.insert(tuitionPackageSessionAdjustments).values(
        selectedSessions.map((session, index) => ({
          operationId: operation.id,
          studentSessionId: session.id,
          effectiveAmount: formatAmount(targetCentsBySession[index]),
        })),
      );

      const [feeRuleRows, creatorRows] = await Promise.all([
        tx.select({ status: attendanceFeeRules.attendanceStatus })
          .from(attendanceFeeRules)
          .where(eq(attendanceFeeRules.deductsFee, true)),
        userId
          ? tx.select({ name: users.username }).from(users).where(eq(users.id, userId)).limit(1)
          : Promise.resolve([]),
      ]);
      const deductingStatuses = new Set(feeRuleRows.map((row) => row.status));
      const creatorName = creatorRows[0]?.name ?? null;
      const attendedAdjustmentCents = selectedSessions.reduce((sum, session, index) =>
        deductingStatuses.has(session.attendanceStatus)
          ? sum + deltaCentsBySession[index]
          : sum,
      0);
      if (attendedAdjustmentCents !== 0) {
        const isAdditionalDebit = attendedAdjustmentCents > 0;
        await tx.insert(studentWalletTransactions).values({
          studentId: enrollment.studentId,
          invoiceId: null,
          type: isAdditionalDebit ? "debit" : "credit",
          amount: formatAmount(Math.abs(attendedAdjustmentCents)),
          category: "Học phí",
          action: isAdditionalDebit
            ? `Điều chỉnh tăng tiền buổi đã học khi đổi gói: ${feePackage.name}`
            : `Hoàn chênh lệch tiền buổi đã học khi đổi gói: ${feePackage.name}`,
          classId: enrollment.classId,
          className: enrollment.className,
          invoiceCode: null,
          invoiceDescription: `Đổi gói buổi ${fromSessionIndex}-${toSessionIndex}`,
          createdBy: userId ?? null,
          createdByName: creatorName,
        });
      }

      results.push({
        studentClassId,
        difference: differenceCents / 100,
        invoiceId,
      });
    }

    return { warning, adjustments: results };
  });
}
