import {
  db,
  eq, and, inArray,
  classSessions, studentSessions, classes,
} from "./base";

import { attendanceFeeRules, invoiceSessionAllocations, studentWalletTransactions } from "@shared/schema";
import { recalculateStudentClass, batchRecalculateStudentClasses } from "./session.storage";
import { createWalletEntry } from "./wallet.storage";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
async function getFeeDeductingStatuses(): Promise<Set<string>> {
  const rules = await db
    .select({ attendanceStatus: attendanceFeeRules.attendanceStatus })
    .from(attendanceFeeRules)
    .where(eq(attendanceFeeRules.deductsFee, true));
  return new Set(rules.map((r) => r.attendanceStatus));
}

async function getClassName(classId: string | null | undefined): Promise<string | null> {
  if (!classId) return null;
  const [row] = await db.select({ name: classes.name }).from(classes).where(eq(classes.id, classId)).limit(1);
  return row?.name ?? null;
}

async function getEffectiveSessionPrice(studentSessionId: string, fallbackPrice: number): Promise<number> {
  const allocations = await db
    .select({ allocatedAmount: invoiceSessionAllocations.allocatedAmount })
    .from(invoiceSessionAllocations)
    .where(eq(invoiceSessionAllocations.studentSessionId, studentSessionId));
  if (allocations.length > 0) {
    const total = allocations.reduce((sum, a) => sum + Number(a.allocatedAmount), 0);
    return total;
  }
  return fallbackPrice;
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
    .where(eq(studentSessions.id, id));

    if (session) {
      const [classSession] = await tx.select({ status: classSessions.status })
        .from(classSessions)
        .where(eq(classSessions.id, session.classSessionId));

      if (classSession?.status === "cancelled") {
        throw new Error("Không thể điểm danh cho buổi học đã bị huỷ");
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

      if (originalSS && originalSS.attendanceStatus === "makeup_wait") {
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
    if (session) {
      const deductingStatuses = await getFeeDeductingStatuses();
      const oldDeducts = deductingStatuses.has(session.attendanceStatus);
      const newDeducts = deductingStatuses.has(status);

      const rawSessionPrice = parseFloat(session.sessionPrice ?? "0") || 0;
      const sessionPrice = await getEffectiveSessionPrice(id, rawSessionPrice);

      if (sessionPrice > 0 && oldDeducts !== newDeducts) {
        const className = await getClassName(session.classId);
        const [classSession] = await tx
          .select({ sessionIndex: classSessions.sessionIndex })
          .from(classSessions)
          .where(eq(classSessions.id, session.classSessionId));
        const sessionLabel = classSession?.sessionIndex ? `Buổi ${classSession.sessionIndex}` : "Buổi học";

        if (newDeducts) {
          await createWalletEntry({
            studentId: session.studentId,
            type: "debit",
            amount: sessionPrice,
            category: "Học phí",
            action: `Trừ học phí ${sessionLabel}, do điểm danh có trừ tiền`,
            classId: session.classId,
            className,
            createdBy: userId ?? null,
            createdByName: userFullName ?? null,
          });
        } else {
          await createWalletEntry({
            studentId: session.studentId,
            type: "credit",
            amount: sessionPrice,
            category: "Học phí",
            action: `Cộng tiền học phí ${sessionLabel}, do điểm danh không trừ tiền`,
            classId: session.classId,
            className,
            createdBy: userId ?? null,
            createdByName: userFullName ?? null,
          });
        }
      }
    }
  });
  return { statusChanged };
}

// ---------------------------------------------------------------------------
// bulkUpdateAttendance
// ---------------------------------------------------------------------------
export async function bulkUpdateAttendance(
  sessionId: string,
  students: { studentSessionId: string; attendanceStatus: string; attendanceNote?: string }[],
  userId?: string | null,
  userFullName?: string | null,
): Promise<void> {
  if (students.length === 0) return;

  // ── 1. Kiểm tra buổi học có bị huỷ không ──────────────────────────────
  const [classSession] = await db.select({
    status: classSessions.status,
    sessionIndex: classSessions.sessionIndex,
  })
    .from(classSessions)
    .where(eq(classSessions.id, sessionId));

  if (classSession?.status === "cancelled") {
    throw new Error("Không thể điểm danh cho buổi học đã bị huỷ");
  }

  // ── 2. Fetch song song: fee rules + trạng thái cũ của tất cả học viên ─
  const studentSessionIds = students.map((s) => s.studentSessionId);
  const newStatusMap = new Map(students.map((s) => [s.studentSessionId, s.attendanceStatus]));

  const [deductingStatuses, existingSessions] = await Promise.all([
    getFeeDeductingStatuses(),
    // Batch SELECT: 1 query thay vì N query
    db.select({
      id: studentSessions.id,
      studentClassId: studentSessions.studentClassId,
      studentId: studentSessions.studentId,
      classId: studentSessions.classId,
      attendanceStatus: studentSessions.attendanceStatus,
      sessionPrice: studentSessions.sessionPrice,
    })
      .from(studentSessions)
      .where(inArray(studentSessions.id, studentSessionIds)),
  ]);

  // ── 3. Gom thông tin cần thiết từ kết quả batch ────────────────────────
  const studentClassIdsSet = new Set<string>();
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

  // ── 4. Pre-fetch data cho ví (song song, trước transaction) ───────────
  // Fetch trước để transaction chỉ làm writes — không có SELECT bên trong.
  const classId = sessionInfos[0]?.classId;
  const sessionLabel = classSession?.sessionIndex
    ? `Buổi ${classSession.sessionIndex}`
    : "Buổi học";

  const [className, allocationRows] = await Promise.all([
    classId ? getClassName(classId) : Promise.resolve(null),
    db
      .select({
        studentSessionId: invoiceSessionAllocations.studentSessionId,
        allocatedAmount: invoiceSessionAllocations.allocatedAmount,
      })
      .from(invoiceSessionAllocations)
      .where(inArray(invoiceSessionAllocations.studentSessionId, studentSessionIds)),
  ]);

  const allocationMap = new Map<string, number>();
  for (const row of allocationRows) {
    if (row.studentSessionId) {
      allocationMap.set(
        row.studentSessionId,
        (allocationMap.get(row.studentSessionId) ?? 0) + Number(row.allocatedAmount),
      );
    }
  }

  // ── 5. Atomic transaction: update điểm danh + ghi ví ──────────────────
  // Cả hai thao tác trong cùng 1 transaction — nếu ghi ví lỗi thì
  // điểm danh cũng rollback, đảm bảo không bao giờ lệch nhau.
  await db.transaction(async (tx) => {
    // 5a. Batch UPDATE attendance
    for (const student of students) {
      await tx.update(studentSessions)
        .set({
          attendanceStatus: student.attendanceStatus,
          ...(student.attendanceNote !== undefined && { attendanceNote: student.attendanceNote }),
          attendanceAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(studentSessions.id, student.studentSessionId),
          eq(studentSessions.classSessionId, sessionId),
        ));
    }

    // 5b. Ghi ví trong cùng transaction — mỗi học viên có số tiền/lịch sử riêng
    for (const info of sessionInfos) {
      const oldDeducts = deductingStatuses.has(info.oldStatus);
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
    await batchRecalculateStudentClasses(Array.from(studentClassIdsSet), classId);
  }
}
