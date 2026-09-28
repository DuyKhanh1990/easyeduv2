import {
  db,
  eq, and, inArray, sql, asc,
  classSessions, studentSessions, classes,
} from "./base";

import {
  attendanceFeeRules,
  invoiceSessionAllocations,
  studentWalletTransactions,
  tuitionPackageSessionAdjustments,
} from "@shared/schema";
import { recalculateStudentClass, batchRecalculateStudentClasses } from "./session.storage";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
async function getFeeDeductingStatuses(executor: any = db): Promise<Set<string>> {
  const rules = await executor
    .select({ attendanceStatus: attendanceFeeRules.attendanceStatus })
    .from(attendanceFeeRules)
    .where(eq(attendanceFeeRules.deductsFee, true));
  return new Set(rules.map((r: any) => r.attendanceStatus));
}

async function getClassName(classId: string | null | undefined, executor: any = db): Promise<string | null> {
  if (!classId) return null;
  const [row] = await executor.select({ name: classes.name }).from(classes).where(eq(classes.id, classId)).limit(1);
  return row?.name ?? null;
}

async function getEffectiveSessionPrice(
  studentSessionId: string,
  fallbackPrice: number,
  executor: any = db,
): Promise<number> {
  const [allocations, overrides] = await Promise.all([
    executor
      .select({ amount: invoiceSessionAllocations.allocatedAmount })
      .from(invoiceSessionAllocations)
      .where(eq(invoiceSessionAllocations.studentSessionId, studentSessionId)),
    executor
      .select({ amount: tuitionPackageSessionAdjustments.effectiveAmount })
      .from(tuitionPackageSessionAdjustments)
      .where(eq(tuitionPackageSessionAdjustments.studentSessionId, studentSessionId))
      .orderBy(sql`${tuitionPackageSessionAdjustments.appliedSequence} desc`)
      .limit(1),
  ]);
  if (overrides.length > 0) return Number(overrides[0].amount);
  const base = allocations.length > 0
    ? allocations.reduce((sum: number, row: any) => sum + Number(row.amount), 0)
    : fallbackPrice;
  return base;
}

function attendanceError(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

// ---------------------------------------------------------------------------
// updateAttendanceStatus
// ---------------------------------------------------------------------------
export async function updateAttendanceStatus(id: string, status: string, note?: string): Promise<void> {
  await db.update(studentSessions)
    .set({ status, note, updatedAt: new Date() })
    .where(eq(studentSessions.id, id));
}

// ---------------------------------------------------------------------------
// updateStudentAttendance
// ---------------------------------------------------------------------------
export async function updateStudentAttendance(
  id: string,
  status: string,
  note?: string,
  userId?: string | null,
  userFullName?: string | null,
): Promise<{ statusChanged: boolean }> {
  let statusChanged = false;
  await db.transaction(async (tx) => {
    const [session] = await tx.select({
      classSessionId: studentSessions.classSessionId,
      studentClassId: studentSessions.studentClassId,
      studentId: studentSessions.studentId,
      classId: studentSessions.classId,
      note: studentSessions.note,
      makeupFromSessionId: studentSessions.makeupFromSessionId,
      sessionSource: studentSessions.sessionSource,
      attendanceStatus: studentSessions.attendanceStatus,
      sessionPrice: studentSessions.sessionPrice,
      sessionOrder: studentSessions.sessionOrder,
    })
    .from(studentSessions)
    .where(eq(studentSessions.id, id))
    .for("update");

    if (session) {
      const [classSession] = await tx.select({ status: classSessions.status })
        .from(classSessions)
        .where(eq(classSessions.id, session.classSessionId))
        .for("share");

      if (classSession?.status === "cancelled") {
        throw attendanceError("Không thể điểm danh cho buổi học đã bị huỷ", 409);
      }

      if (status === "makeup_scheduled" && session.attendanceStatus !== "makeup_scheduled") {
        throw attendanceError("Trạng thái Đã xếp bù chỉ được cập nhật tự động sau nghiệp vụ xếp bù", 400);
      }
    }

    // Track whether attendance status actually changed (used by callers to decide on push noti).
    // If status is null/undefined this is a note-only update – never treat as a status change
    // and never overwrite attendanceStatus in DB with null.
    const isStatusProvided = status !== null && status !== undefined;
    if (isStatusProvided) {
      statusChanged = session ? session.attendanceStatus !== status : true;
    } else {
      statusChanged = false;
    }

    await tx.update(studentSessions)
      .set({
        ...(isStatusProvided ? { attendanceStatus: status } : {}),
        attendanceNote: note,
        ...(isStatusProvided ? { attendanceAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(studentSessions.id, id));

    if (status === "present" && session && session.sessionSource === "makeup" && session.makeupFromSessionId) {
      const [originalSS] = await tx.select({
        id: studentSessions.id,
        studentClassId: studentSessions.studentClassId,
        attendanceStatus: studentSessions.attendanceStatus,
      })
      .from(studentSessions)
      .where(and(
        eq(studentSessions.studentId, session.studentId),
        eq(studentSessions.classSessionId, session.makeupFromSessionId),
      ));

      if (originalSS && ["makeup_wait", "makeup_scheduled"].includes(originalSS.attendanceStatus ?? "")) {
        await tx.update(studentSessions)
          .set({ attendanceStatus: "makeup_done", updatedAt: new Date() })
          .where(eq(studentSessions.id, originalSS.id));

        if (originalSS.studentClassId) {
          await recalculateStudentClass(originalSS.studentClassId, tx);
        }
      }
    }

    if (session?.studentClassId) {
      await recalculateStudentClass(session.studentClassId, tx);
    }

    // ── Wallet transaction for fee deduction / reversal ─────────────────────
    if (session && isStatusProvided) {
      const deductingStatuses = await getFeeDeductingStatuses(tx);
      const oldDeducts = deductingStatuses.has(session.attendanceStatus);
      const newDeducts = deductingStatuses.has(status);

      const rawSessionPrice = parseFloat(session.sessionPrice ?? "0") || 0;
      const sessionPrice = await getEffectiveSessionPrice(id, rawSessionPrice, tx);

      if (sessionPrice > 0 && oldDeducts !== newDeducts) {
        const className = await getClassName(session.classId, tx);
        const [classSession] = await tx
          .select({ sessionIndex: classSessions.sessionIndex })
          .from(classSessions)
          .where(eq(classSessions.id, session.classSessionId));
        const sessionLabel = classSession?.sessionIndex ? `Buổi ${classSession.sessionIndex}` : "Buổi học";

        await tx.insert(studentWalletTransactions).values({
          studentId: session.studentId,
          type: newDeducts ? "debit" : "credit",
          amount: sessionPrice.toFixed(2),
          category: "Học phí",
          action: newDeducts
            ? `Trừ học phí ${sessionLabel}, do điểm danh có trừ tiền`
            : `Cộng tiền học phí ${sessionLabel}, do điểm danh không trừ tiền`,
          classId: session.classId ?? null,
          className,
          createdBy: userId ?? null,
          createdByName: userFullName ?? null,
        });
      }
    }
  });
  return { statusChanged };
}

// ---------------------------------------------------------------------------
// bulkUpdateAttendance
// ---------------------------------------------------------------------------
export type StudentAttendanceBulkChange = {
  studentSessionId: string;
  studentId: string;
  classId: string | null;
  oldStatus: string | null;
  newStatus: string;
};

export async function bulkUpdateAttendance(
  sessionId: string,
  students: { studentSessionId: string; attendanceStatus: string; attendanceNote?: string }[],
  userId?: string | null,
  userFullName?: string | null,
): Promise<StudentAttendanceBulkChange[]> {
  if (students.length === 0) return [];

  const studentBySessionId = new Map<string, typeof students[number]>();
  for (const student of students) {
    if (!student.studentSessionId || !student.attendanceStatus) {
      throw attendanceError("Thông tin điểm danh không hợp lệ.", 400);
    }
    if (studentBySessionId.has(student.studentSessionId)) {
      throw attendanceError("Danh sách điểm danh có học viên bị lặp.", 400);
    }
    studentBySessionId.set(student.studentSessionId, student);
  }

  // ── 1. Kiểm tra buổi học có bị huỷ không ──────────────────────────────
  const [classSession] = await db.select({
    status: classSessions.status,
    sessionIndex: classSessions.sessionIndex,
  })
    .from(classSessions)
    .where(eq(classSessions.id, sessionId))
    .limit(1);

  if (classSession?.status === "cancelled") {
    throw attendanceError("Không thể điểm danh cho buổi học đã bị huỷ.", 409);
  }
  if (!classSession) {
    throw attendanceError("Không tìm thấy buổi học.", 404);
  }

  // ── 2. Fetch rules and the existing attendance rows ───────────────────
  const studentSessionIds = Array.from(studentBySessionId.keys());
  const newStatusMap = new Map(
    students.map((s) => [s.studentSessionId, s.attendanceStatus]),
  );

  const deductingStatuses = await getFeeDeductingStatuses();
  // Batch SELECT: 1 query thay vì N query. Keep reads sequential so each
  // bulk request occupies at most one pool connection at a time.
  const existingSessions = await db.select({
      id: studentSessions.id,
      studentClassId: studentSessions.studentClassId,
      studentId: studentSessions.studentId,
      classId: studentSessions.classId,
      attendanceStatus: studentSessions.attendanceStatus,
      sessionPrice: studentSessions.sessionPrice,
    })
      .from(studentSessions)
      .where(inArray(studentSessions.id, studentSessionIds));

  // ── 3. Gom thông tin cần thiết từ kết quả batch ────────────────────────
  const studentClassIdsSet = new Set<string>();
  const changedRows: StudentAttendanceBulkChange[] = [];
  const sessionInfos: Array<{
    studentSessionId: string;
    newStatus: string;
    oldStatus: string;
    studentId: string;
    classId: string;
    sessionPrice: string | null;
    studentClassId: string | null;
  }> = [];

  for (const sSession of existingSessions) {
    if (sSession.studentClassId) {
      studentClassIdsSet.add(sSession.studentClassId);
    }
    sessionInfos.push({
      studentSessionId: sSession.id,
      newStatus: newStatusMap.get(sSession.id) ?? sSession.attendanceStatus,
      oldStatus: sSession.attendanceStatus,
      studentId: sSession.studentId,
      classId: sSession.classId,
      sessionPrice: sSession.sessionPrice,
      studentClassId: sSession.studentClassId,
    });
  }

  if (sessionInfos.some((info) => info.newStatus === "makeup_scheduled" && info.oldStatus !== "makeup_scheduled")) {
    throw new Error("Trạng thái Đã xếp bù chỉ được cập nhật tự động sau nghiệp vụ xếp bù");
  }

  // ── 4. Pre-fetch data cho ví (song song, trước transaction) ───────────
  // Fetch trước để transaction chỉ làm writes — không có SELECT bên trong.
  const classId = sessionInfos[0]?.classId;
  const sessionLabel = classSession?.sessionIndex
    ? `Buổi ${classSession.sessionIndex}`
    : "Buổi học";

  const className = classId ? await getClassName(classId) : null;
  const allocationRows = await db
    .select({
      studentSessionId: invoiceSessionAllocations.studentSessionId,
      allocatedAmount: invoiceSessionAllocations.allocatedAmount,
    })
    .from(invoiceSessionAllocations)
    .where(inArray(invoiceSessionAllocations.studentSessionId, studentSessionIds));
  const packageAdjustmentRows = await db
    .select({
      studentSessionId: tuitionPackageSessionAdjustments.studentSessionId,
      allocatedAmount: tuitionPackageSessionAdjustments.effectiveAmount,
      appliedSequence: tuitionPackageSessionAdjustments.appliedSequence,
    })
    .from(tuitionPackageSessionAdjustments)
    .where(inArray(tuitionPackageSessionAdjustments.studentSessionId, studentSessionIds))
    .orderBy(tuitionPackageSessionAdjustments.appliedSequence);

  const allocationMap = new Map<string, number>();
  for (const row of allocationRows) {
    if (row.studentSessionId) {
      allocationMap.set(
        row.studentSessionId,
        (allocationMap.get(row.studentSessionId) ?? 0) + Number(row.allocatedAmount),
      );
    }
  }
  for (const row of packageAdjustmentRows) {
    allocationMap.set(row.studentSessionId, Number(row.allocatedAmount));
  }

  // ── 5. Atomic transaction: update điểm danh + ghi ví ──────────────────
  // Cả hai thao tác trong cùng 1 transaction — nếu ghi ví lỗi thì
  // điểm danh cũng rollback, đảm bảo không bao giờ lệch nhau.
  await db.transaction(async (tx) => {
    const [currentClassSession] = await tx
      .select({ status: classSessions.status })
      .from(classSessions)
      .where(eq(classSessions.id, sessionId))
      .for("share");
    if (!currentClassSession) {
      throw attendanceError("Không tìm thấy buổi học.", 404);
    }
    if (currentClassSession.status === "cancelled") {
      throw attendanceError("Không thể điểm danh cho buổi học đã bị huỷ.", 409);
    }

    const lockedSessions = await tx
      .select({
        id: studentSessions.id,
        studentClassId: studentSessions.studentClassId,
        studentId: studentSessions.studentId,
        classId: studentSessions.classId,
        attendanceStatus: studentSessions.attendanceStatus,
        sessionPrice: studentSessions.sessionPrice,
      })
      .from(studentSessions)
      .where(and(
        eq(studentSessions.classSessionId, sessionId),
        inArray(studentSessions.id, studentSessionIds),
      ))
      .orderBy(asc(studentSessions.id))
      .for("update");

    if (lockedSessions.length !== studentSessionIds.length) {
      throw attendanceError("Một số học viên không thuộc buổi học này hoặc không còn trong danh sách.", 400);
    }

    const lockedSessionInfos = lockedSessions.map((session) => ({
      studentSessionId: session.id,
      studentClassId: session.studentClassId,
      studentId: session.studentId,
      classId: session.classId,
      sessionPrice: session.sessionPrice,
      oldStatus: session.attendanceStatus ?? null,
      newStatus: newStatusMap.get(session.id)!,
    }));
    const changedSessionInfos = lockedSessionInfos.filter((info) => info.oldStatus !== info.newStatus);

    if (changedSessionInfos.some((info) =>
      info.newStatus === "makeup_scheduled" && info.oldStatus !== "makeup_scheduled"
    )) {
      throw attendanceError("Trạng thái Đã xếp bù chỉ được cập nhật tự động sau nghiệp vụ xếp bù.", 400);
    }

    // 5a. Write every selected row from the locked current state.
    for (const info of lockedSessionInfos) {
      const student = studentBySessionId.get(info.studentSessionId)!;
      await tx.update(studentSessions)
        .set({
          attendanceStatus: info.newStatus,
          ...(student.attendanceNote !== undefined && { attendanceNote: student.attendanceNote }),
          attendanceAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(studentSessions.id, info.studentSessionId),
          eq(studentSessions.classSessionId, sessionId),
        ));

      if (info.oldStatus !== info.newStatus) {
        changedRows.push({
          studentSessionId: info.studentSessionId,
          studentId: info.studentId,
          classId: info.classId,
          oldStatus: info.oldStatus,
          newStatus: info.newStatus,
        });
      }
    }

    // 5b. Ghi ví trong cùng transaction — mỗi học viên có số tiền/lịch sử riêng
    for (const info of changedSessionInfos) {
      const oldDeducts = deductingStatuses.has(info.oldStatus ?? "");
      const newDeducts = deductingStatuses.has(info.newStatus);

      // Nếu trạng thái không đổi chiều trừ/không trừ → bỏ qua
      if (oldDeducts === newDeducts) continue;

      const rawSessionPrice = parseFloat(info.sessionPrice ?? "0") || 0;
      const sessionPrice = allocationMap.has(info.studentSessionId)
        ? allocationMap.get(info.studentSessionId)!
        : rawSessionPrice;

      if (sessionPrice <= 0) continue;

      await tx.insert(studentWalletTransactions).values({
        studentId: info.studentId,
        type: newDeducts ? "debit" : "credit",
        amount: sessionPrice.toFixed(2),
        category: "Học phí",
        action: newDeducts
          ? `Trừ học phí ${sessionLabel}, do điểm danh có trừ tiền`
          : `Cộng tiền học phí ${sessionLabel}, do điểm danh không trừ tiền`,
        classId: info.classId ?? null,
        className,
        createdBy: userId ?? null,
        createdByName: userFullName ?? null,
      });

    }
  });

  // ── 6. Recalculate tổng hợp (ngoài transaction — không critical) ───────
  // Nếu bước này lỗi, lần cập nhật tiếp theo sẽ recalculate lại;
  // điểm danh và ví đã được commit atomically ở bước 5.
  if (studentClassIdsSet.size > 0 && classId) {
    try {
      await batchRecalculateStudentClasses(Array.from(studentClassIdsSet), classId);
    } catch (error) {
      console.error("[BulkAttendance] Student class recalculation failed:", error);
    }
  }
  return changedRows;
}
