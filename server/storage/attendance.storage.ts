import {
  db,
  eq, and, inArray,
  classSessions, studentSessions, classes,
} from "./base";

import { attendanceFeeRules, invoiceSessionAllocations } from "@shared/schema";
import { recalculateStudentClass } from "./session.storage";
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
): Promise<void> {
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

    await tx.update(studentSessions)
      .set({
        attendanceStatus: status,
        attendanceNote: note,
        attendanceAt: new Date(),
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
}

// ---------------------------------------------------------------------------
// bulkUpdateAttendance
// ---------------------------------------------------------------------------
export async function bulkUpdateAttendance(
  sessionId: string,
  students: { studentSessionId: string; attendanceStatus: string }[],
  userId?: string | null,
  userFullName?: string | null,
): Promise<void> {
  const [classSession] = await db.select({ status: classSessions.status })
    .from(classSessions)
    .where(eq(classSessions.id, sessionId));

  if (classSession?.status === "cancelled") {
    throw new Error("Không thể điểm danh cho buổi học đã bị huỷ");
  }

  const deductingStatuses = await getFeeDeductingStatuses();

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

  await db.transaction(async (tx) => {
    for (const student of students) {
      const [sSession] = await tx.select({
        studentClassId: studentSessions.studentClassId,
        studentId: studentSessions.studentId,
        classId: studentSessions.classId,
        attendanceStatus: studentSessions.attendanceStatus,
        sessionPrice: studentSessions.sessionPrice,
      })
        .from(studentSessions)
        .where(eq(studentSessions.id, student.studentSessionId));

      if (sSession?.studentClassId) {
        studentClassIdsSet.add(sSession.studentClassId);
      }

      if (sSession) {
        sessionInfos.push({
          studentSessionId: student.studentSessionId,
          newStatus: student.attendanceStatus,
          oldStatus: sSession.attendanceStatus,
          studentId: sSession.studentId,
          classId: sSession.classId,
          sessionPrice: sSession.sessionPrice,
          studentClassId: sSession.studentClassId,
        });
      }

      await tx.update(studentSessions)
        .set({
          attendanceStatus: student.attendanceStatus,
          attendanceAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(studentSessions.id, student.studentSessionId), eq(studentSessions.classSessionId, sessionId)));
    }
  });

  for (const scId of Array.from(studentClassIdsSet)) {
    await recalculateStudentClass(scId);
  }

  // ── Create wallet transactions outside the transaction ──────────────────
  const [csRow] = await db
    .select({ sessionIndex: classSessions.sessionIndex })
    .from(classSessions)
    .where(eq(classSessions.id, sessionId));
  const sessionLabel = csRow?.sessionIndex ? `Buổi ${csRow.sessionIndex}` : "Buổi học";

  for (const info of sessionInfos) {
    const oldDeducts = deductingStatuses.has(info.oldStatus);
    const newDeducts = deductingStatuses.has(info.newStatus);
    const rawSessionPrice = parseFloat(info.sessionPrice ?? "0") || 0;
    const sessionPrice = await getEffectiveSessionPrice(info.studentSessionId, rawSessionPrice);

    if (sessionPrice > 0 && oldDeducts !== newDeducts) {
      const className = await getClassName(info.classId);

      if (newDeducts) {
        await createWalletEntry({
          studentId: info.studentId,
          type: "debit",
          amount: sessionPrice,
          category: "Học phí",
          action: `Trừ học phí ${sessionLabel}, do điểm danh có trừ tiền`,
          classId: info.classId,
          className,
          createdBy: userId ?? null,
          createdByName: userFullName ?? null,
        });
      } else {
        await createWalletEntry({
          studentId: info.studentId,
          type: "credit",
          amount: sessionPrice,
          category: "Học phí",
          action: `Cộng tiền học phí ${sessionLabel}, do điểm danh không trừ tiền`,
          classId: info.classId,
          className,
          createdBy: userId ?? null,
          createdByName: userFullName ?? null,
        });
      }
    }
  }
}
