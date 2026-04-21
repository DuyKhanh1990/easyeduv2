import { between } from "drizzle-orm";

import {
  db,
  eq, sql, and, inArray, asc, desc, gte,
  classSessions, studentClasses, studentSessions,
  classes, classSessionExclusions,
  invoices, invoiceItems, shiftTemplates, courseFeePackages,
  format, parseISO,
  getDayName,
} from "./base";

import { attendanceFeeRules } from "@shared/schema";

import type {
  ClassSession,
} from "./base";

import { getClass } from "./class.storage";

// ---------------------------------------------------------------------------
// recalculateStudentClass
// ---------------------------------------------------------------------------
export async function recalculateStudentClass(studentClassId: string, tx?: any): Promise<void> {
  const conn = tx ?? db;

  // Lấy danh sách trạng thái được tính là "có buổi học" từ bảng cấu hình
  const feeRules = await db
    .select({ attendanceStatus: attendanceFeeRules.attendanceStatus })
    .from(attendanceFeeRules)
    .where(eq(attendanceFeeRules.deductsFee, true));

  const attendedStatuses = feeRules.map((r) => r.attendanceStatus);
  // Fallback nếu chưa cấu hình rule nào
  if (attendedStatuses.length === 0) {
    attendedStatuses.push("present");
  }

  const statusListSql = attendedStatuses.map((s) => `'${s.replace(/'/g, "''")}'`).join(", ");

  const stats = await conn.select({
    startDate: sql<string>`MIN(${classSessions.sessionDate})`,
    endDate: sql<string>`MAX(${classSessions.sessionDate})`,
    total: sql<number>`COUNT(*)::int`,
    attended: sql<number>`COUNT(CASE WHEN ${studentSessions.attendanceStatus} IN (${sql.raw(statusListSql)}) THEN 1 END)::int`,
  })
  .from(studentSessions)
  .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
  .where(eq(studentSessions.studentClassId, studentClassId));

  const result = stats[0];
  if (result) {
    await conn.update(studentClasses)
      .set({
        startDate: result.startDate,
        endDate: result.endDate,
        totalSessions: result.total || 0,
        attendedSessions: result.attended || 0,
        remainingSessions: (result.total || 0) - (result.attended || 0),
        updatedAt: new Date(),
      })
      .where(eq(studentClasses.id, studentClassId));
  }
}

// ---------------------------------------------------------------------------
// getClassSession
// ---------------------------------------------------------------------------
export async function getClassSession(id: string): Promise<ClassSession | undefined> {
  const [session] = await db.select().from(classSessions).where(eq(classSessions.id, id));
  return session;
}

// ---------------------------------------------------------------------------
// getClassExclusions
// ---------------------------------------------------------------------------
export async function getClassExclusions(classId: string): Promise<any[]> {
  return await db.select().from(classSessionExclusions)
    .where(eq(classSessionExclusions.classId, classId))
    .orderBy(sql`${classSessionExclusions.createdAt} DESC`);
}

// ---------------------------------------------------------------------------
// checkSessionsAttendance
// ---------------------------------------------------------------------------
export async function checkSessionsAttendance(sessionIds: string[]): Promise<boolean> {
  if (sessionIds.length === 0) return false;
  const attended = await db.select()
    .from(studentSessions)
    .where(and(
      inArray(studentSessions.classSessionId, sessionIds),
      sql`${studentSessions.attendanceStatus} != 'pending'`,
    ))
    .limit(1);
  return attended.length > 0;
}

// ---------------------------------------------------------------------------
// deleteClassSessions
// ---------------------------------------------------------------------------
export async function deleteClassSessions(classId: string, sessionId: string, deleteType: string, mode: string): Promise<void> {
  await db.transaction(async (tx) => {
    let sessionIdsToDelete: string[] = [];
    const selectedSession = await getClassSession(sessionId);
    if (!selectedSession) throw new Error("Không tìm thấy buổi học");

    const allSessions = await tx.select().from(classSessions)
      .where(eq(classSessions.classId, classId))
      .orderBy(asc(classSessions.sessionIndex));

    if (deleteType === "single") {
      sessionIdsToDelete = [sessionId];
    } else if (deleteType === "next") {
      sessionIdsToDelete = allSessions
        .filter(s => (s.sessionIndex || 0) >= (selectedSession.sessionIndex || 0))
        .map(s => s.id);
    } else if (deleteType === "all") {
      sessionIdsToDelete = allSessions.map(s => s.id);
    }

    if (mode === "skip_attended") {
      const attendedSessions = await tx.select({ id: studentSessions.classSessionId })
        .from(studentSessions)
        .where(and(
          inArray(studentSessions.classSessionId, sessionIdsToDelete),
          sql`${studentSessions.attendanceStatus} != 'pending'`,
        ));
      const attendedIds = new Set(attendedSessions.map(s => s.id));
      sessionIdsToDelete = sessionIdsToDelete.filter(id => !attendedIds.has(id));
    }

    if (sessionIdsToDelete.length > 0) {
      await tx.delete(studentSessions).where(inArray(studentSessions.classSessionId, sessionIdsToDelete));
      await tx.delete(classSessions).where(inArray(classSessions.id, sessionIdsToDelete));

      const remainingSessions = await tx.select().from(classSessions)
        .where(eq(classSessions.classId, classId))
        .orderBy(asc(classSessions.sessionDate));

      for (let i = 0; i < remainingSessions.length; i++) {
        await tx.update(classSessions)
          .set({ sessionIndex: i + 1 })
          .where(eq(classSessions.id, remainingSessions[i].id));
      }

      // Update classes table startDate/endDate to reflect actual remaining sessions
      const actualStartDate = remainingSessions.length > 0 ? remainingSessions[0].sessionDate : null;
      const actualEndDate = remainingSessions.length > 0 ? remainingSessions[remainingSessions.length - 1].sessionDate : null;
      await tx.update(classes)
        .set({ startDate: actualStartDate, endDate: actualEndDate, scheduleGenerated: remainingSessions.length > 0, updatedAt: new Date() })
        .where(eq(classes.id, classId));

      const studentsInClass = await tx.select().from(studentClasses).where(eq(studentClasses.classId, classId));

      if (deleteType === "all") {
        // When deleting ALL schedules, remove studentClasses for students who have no remaining sessions
        for (const sc of studentsInClass) {
          const remainingStudentSessions = await tx.select({ id: studentSessions.id })
            .from(studentSessions)
            .where(eq(studentSessions.studentClassId, sc.id))
            .limit(1);

          if (remainingStudentSessions.length === 0) {
            // No more sessions for this student in this class → make them a free student
            await tx.delete(studentClasses).where(eq(studentClasses.id, sc.id));
          } else {
            // Student has some attended sessions remaining (mode=skip_attended) → keep but recalculate
            await recalculateStudentClass(sc.id, tx);
          }
        }
      } else {
        for (const sc of studentsInClass) {
          await recalculateStudentClass(sc.id, tx);
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// transferStudentClass
// ---------------------------------------------------------------------------
export async function transferStudentClass(data: {
  studentId: string;
  fromClassId: string;
  toClassId: string;
  fromSessionIndex: number;
  toSessionIndex: number;
  transferCount: number;
  userId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const oldSessions = await tx.select({
      id: studentSessions.id,
      studentClassId: studentSessions.studentClassId,
      sessionIndex: classSessions.sessionIndex,
      classSessionId: studentSessions.classSessionId,
    })
    .from(studentSessions)
    .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
    .where(and(
      eq(studentSessions.studentId, data.studentId),
      eq(studentSessions.classId, data.fromClassId),
      sql`${classSessions.sessionIndex} >= ${data.fromSessionIndex}`,
    ))
    .orderBy(asc(classSessions.sessionIndex))
    .limit(data.transferCount);

    if (oldSessions.length === 0) {
      throw new Error("Không tìm thấy buổi học học viên để chuyển");
    }

    const studentClassId = oldSessions[0].studentClassId;

    const targetClassSessions = await tx.select()
      .from(classSessions)
      .where(and(
        eq(classSessions.classId, data.toClassId),
        eq(classSessions.status, "scheduled"),
        sql`${classSessions.sessionIndex} >= ${data.toSessionIndex}`,
      ))
      .orderBy(asc(classSessions.sessionIndex))
      .limit(data.transferCount);

    if (targetClassSessions.length < data.transferCount) {
      throw new Error(`Lớp mới không đủ ${data.transferCount} buổi học để chuyển vào (chỉ còn ${targetClassSessions.length} buổi)`);
    }

    let [targetStudentClass] = await tx.select()
      .from(studentClasses)
      .where(and(
        eq(studentClasses.studentId, data.studentId),
        eq(studentClasses.classId, data.toClassId),
      ));

    if (!targetStudentClass) {
      [targetStudentClass] = await tx.insert(studentClasses).values({
        studentId: data.studentId,
        classId: data.toClassId,
        status: "active",
        startDate: targetClassSessions[0].sessionDate,
        createdBy: data.userId,
      }).returning();
    }

    const fromClass = await tx.query.classes.findFirst({
      where: eq(classes.id, data.fromClassId),
    });

    const toClass = await tx.query.classes.findFirst({
      where: eq(classes.id, data.toClassId),
    });

    for (let i = 0; i < targetClassSessions.length; i++) {
      const cs = targetClassSessions[i];
      const oldSession = oldSessions[i];

      const oldCS = await tx.query.classSessions.findFirst({
        where: eq(classSessions.id, oldSession.classSessionId),
      });
      const oldDateStr = oldCS ? format(new Date(oldCS.sessionDate), "d/M/yyyy") : "";

      await tx.insert(studentSessions).values({
        studentId: data.studentId,
        classId: data.toClassId,
        studentClassId: targetStudentClass.id,
        classSessionId: cs.id,
        status: "scheduled",
        attendanceStatus: "pending",
        note: `Chuyển từ lớp ${fromClass?.name || data.fromClassId}\nBuổi ${oldSession?.sessionIndex} - ${oldDateStr}`,
      });

      const targetDateStr = format(new Date(cs.sessionDate), "d/M/yyyy");
      await tx.update(studentSessions)
        .set({
          status: "transferred",
          note: `Chuyển sang lớp ${toClass?.name || data.toClassId}\nBuổi ${cs.sessionIndex} - ${targetDateStr}`,
          updatedAt: new Date(),
        })
        .where(eq(studentSessions.id, oldSession.id));
    }

    if (studentClassId) await recalculateStudentClass(studentClassId, tx);
    await recalculateStudentClass(targetStudentClass.id, tx);
  });
}

// ---------------------------------------------------------------------------
// extendStudentSessions
// ---------------------------------------------------------------------------
export async function extendStudentSessions(data: {
  classId: string;
  studentIds: string[];
  mode: "class" | "student";
  numSessions?: number;
  endDate?: string;
  cycleMode: "all" | "specific";
  specificShiftIds?: string[];
  extensionName?: string;
  autoInvoice: boolean;
  perStudent?: Array<{
    studentId: string;
    packageId?: string | null;
    autoInvoice?: boolean;
    grandTotal?: number;
    totalAmount?: number;
    promotionAmount?: number;
    surchargeAmount?: number;
    promotionKeys?: string[];
    surchargeKeys?: string[];
    unitPrice?: number;
    quantity?: number;
    description?: string;
  }>;
  userId: string;
}): Promise<void> {
  const cls = await getClass(data.classId);
  if (!cls) throw new Error("Lớp học không tồn tại");

  // Build per-student maps
  const perStudentMap: Record<string, string | null> = {};
  const perStudentInvoice: Record<string, {
    autoInvoice: boolean;
    grandTotal: number;
    totalAmount: number;
    promotionAmount: number;
    surchargeAmount: number;
    promotionKeys: string[];
    surchargeKeys: string[];
    unitPrice: number;
    quantity: number;
    description: string;
  }> = {};
  for (const ps of (data.perStudent || [])) {
    perStudentMap[ps.studentId] = ps.packageId || null;
    perStudentInvoice[ps.studentId] = {
      autoInvoice: ps.autoInvoice ?? data.autoInvoice,
      grandTotal: ps.grandTotal ?? 0,
      totalAmount: ps.totalAmount ?? ps.grandTotal ?? 0,
      promotionAmount: ps.promotionAmount ?? 0,
      surchargeAmount: ps.surchargeAmount ?? 0,
      promotionKeys: ps.promotionKeys ?? [],
      surchargeKeys: ps.surchargeKeys ?? [],
      unitPrice: ps.unitPrice ?? 0,
      quantity: ps.quantity ?? 1,
      description: ps.description ?? "",
    };
  }

  // Pre-generate invoice codes for students who need auto invoices (outside transaction)
  const studentsNeedingInvoice = data.studentIds.filter(sid => {
    const inv = perStudentInvoice[sid];
    return inv ? inv.autoInvoice : data.autoInvoice;
  });
  const invoiceCodeMap: Record<string, string> = {};
  if (studentsNeedingInvoice.length > 0) {
    const prefix = "PT";
    const baseCodeResult = await db
      .select({ code: invoices.code })
      .from(invoices)
      .where(sql`${invoices.code} LIKE ${`${prefix}%`} AND ${invoices.code} NOT LIKE ${'%-%'}`)
      .orderBy(sql`${invoices.code} DESC`)
      .limit(1);
    let nextNum = 1;
    if (baseCodeResult.length > 0) {
      const lastCode = baseCodeResult[0].code ?? `${prefix}00`;
      nextNum = (parseInt(lastCode.replace(prefix, ""), 10) || 0) + 1;
    }
    for (const sid of studentsNeedingInvoice) {
      invoiceCodeMap[sid] = `${prefix}${String(nextNum).padStart(2, "0")}`;
      nextNum++;
    }
  }

  await db.transaction(async (tx) => {
    // Cache fee package lookups to avoid redundant queries
    const feePackageCache: Record<string, { type: string; fee: string; sessions: string | null; name: string } | null> = {};

    const getFeePackageInfo = async (pkgId: string | null) => {
      if (!pkgId) return null;
      if (pkgId in feePackageCache) return feePackageCache[pkgId];
      const [pkg] = await tx.select({
        type: courseFeePackages.type,
        fee: courseFeePackages.fee,
        sessions: courseFeePackages.sessions,
        name: courseFeePackages.name,
      }).from(courseFeePackages).where(eq(courseFeePackages.id, pkgId));
      feePackageCache[pkgId] = pkg ?? null;
      return pkg ?? null;
    };

    for (const studentId of data.studentIds) {
      const [sc] = await tx.select().from(studentClasses).where(and(eq(studentClasses.classId, data.classId), eq(studentClasses.studentId, studentId)));
      if (!sc) continue;

      let lastSessionDate: Date;
      if (data.mode === "class") {
        const res = await tx.select({ date: classSessions.sessionDate })
          .from(classSessions)
          .where(eq(classSessions.classId, data.classId))
          .orderBy(sql`${classSessions.sessionDate} DESC`)
          .limit(1);
        lastSessionDate = res[0] ? new Date(res[0].date) : new Date(cls.startDate);
      } else {
        const res = await tx.select({ date: classSessions.sessionDate })
          .from(studentSessions)
          .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
          .where(and(eq(studentSessions.studentId, studentId), eq(studentSessions.classId, data.classId)))
          .orderBy(sql`${classSessions.sessionDate} DESC`)
          .limit(1);
        lastSessionDate = res[0] ? new Date(res[0].date) : new Date(sc.startDate || cls.startDate);
      }

      const targetSessions = data.numSessions || 0;
      const endDateLimit = data.endDate ? new Date(data.endDate) : null;
      // Normalize endDateLimit to end of day (inclusive)
      if (endDateLimit) endDateLimit.setHours(23, 59, 59, 999);

      let createdForStudent = 0;
      let checkDate = new Date(lastSessionDate);
      const SAFEGUARD = 3650;
      let iterations = 0;

      while (true) {
        checkDate.setDate(checkDate.getDate() + 1);
        iterations++;
        // Guard: stop conditions checked AFTER incrementing so the limit date is respected exactly
        if (iterations >= SAFEGUARD) break;
        if (endDateLimit && checkDate > endDateLimit) break;
        if (!endDateLimit && createdForStudent >= targetSessions) break;
        const weekday = checkDate.getDay();
        const dbWeekday = weekday === 0 ? 0 : weekday;

        if (!cls.weekdays.includes(dbWeekday)) continue;

        const isSelectedDay = data.cycleMode === "all" || (data.specificShiftIds || []).includes(dbWeekday.toString());

        // In specific-cycle mode, skip non-selected days entirely to avoid
        // creating orphan class sessions beyond the student's last session date
        if (!isSelectedDay) continue;

        const dateStr = checkDate.toISOString().split("T")[0];
        let [cs] = await tx.select().from(classSessions).where(and(eq(classSessions.classId, data.classId), eq(classSessions.sessionDate, dateStr)));

        if (!cs) {
          const res = await tx.select({ maxIdx: sql<number>`MAX(${classSessions.sessionIndex})` }).from(classSessions).where(eq(classSessions.classId, data.classId));
          const nextIdx = (res[0]?.maxIdx || 0) + 1;

          [cs] = await tx.insert(classSessions).values({
            classId: data.classId,
            sessionDate: dateStr,
            weekday: dbWeekday === 0 ? 7 : dbWeekday,
            shiftTemplateId: (cls.shiftTemplateIds || [])[0] || null,
            roomId: cls.roomId || "00000000-0000-0000-0000-000000000000",
            teacherIds: cls.teacherIds && cls.teacherIds.length > 0 ? cls.teacherIds : null,
            sessionIndex: nextIdx,
            status: "scheduled",
          }).returning();
        }

        // Check for duplicate student session before inserting
        const [existing] = await tx.select({ id: studentSessions.id })
          .from(studentSessions)
          .where(and(
            eq(studentSessions.studentId, studentId),
            eq(studentSessions.classSessionId, cs.id),
          ));

        if (!existing) {
          const pkgId = perStudentMap[studentId] ?? null;
          const pkgInfo = await getFeePackageInfo(pkgId);
          let pkgType: string | null = null;
          let sessPrice: string | null = null;
          if (pkgInfo) {
            pkgType = pkgInfo.type === "buổi" ? "buổi" : "khoá";
            if (pkgInfo.type === "buổi") {
              sessPrice = parseFloat(pkgInfo.fee.toString()).toFixed(2);
            } else if (pkgInfo.sessions && parseFloat(pkgInfo.sessions.toString()) > 0) {
              sessPrice = (parseFloat(pkgInfo.fee.toString()) / parseFloat(pkgInfo.sessions.toString())).toFixed(2);
            }
          }
          await tx.insert(studentSessions).values({
            studentId,
            classId: data.classId,
            studentClassId: sc.id,
            classSessionId: cs.id,
            status: "scheduled",
            attendanceStatus: "pending",
            packageId: pkgId,
            packageType: pkgType,
            sessionPrice: sessPrice,
            note: data.extensionName ? `Gia hạn: ${data.extensionName}` : "Gia hạn",
          });
        }
        createdForStudent++;
      }

      await recalculateStudentClass(sc.id, tx);

      const inv = perStudentInvoice[studentId];
      const shouldCreateInvoice = inv ? inv.autoInvoice : data.autoInvoice;
      if (shouldCreateInvoice) {
        const grandTotal = inv?.grandTotal ?? 0;
        const totalAmt = inv?.totalAmount ?? grandTotal;
        const promoAmt = inv?.promotionAmount ?? 0;
        const surchAmt = inv?.surchargeAmount ?? 0;
        const invoiceCode = invoiceCodeMap[studentId] ?? null;
        const todayStr = new Date().toISOString().split("T")[0];

        const pkgId = perStudentMap[studentId] ?? null;
        const pkgInfo = pkgId ? await getFeePackageInfo(pkgId) : null;
        const pkgName = pkgInfo ? ((pkgInfo as any).name || "") : "";

        const [newInvoice] = await tx.insert(invoices).values({
          code: invoiceCode,
          type: "Thu",
          studentId,
          classId: data.classId,
          locationId: cls.locationId ?? undefined,
          category: "Học phí",
          account: "111",
          counterAccount: "511",
          totalAmount: totalAmt.toFixed(2),
          totalPromotion: promoAmt.toFixed(2),
          totalSurcharge: surchAmt.toFixed(2),
          grandTotal: grandTotal.toFixed(2),
          paidAmount: "0",
          remainingAmount: grandTotal.toFixed(2),
          status: "unpaid",
          description: inv?.description ?? undefined,
          dueDate: todayStr,
          createdBy: data.userId ?? undefined,
        }).returning();

        if (newInvoice) {
          const itemUnitPrice = inv?.unitPrice ?? 0;
          const itemQuantity = inv?.quantity ?? 1;
          await tx.insert(invoiceItems).values({
            invoiceId: newInvoice.id,
            packageId: pkgId ?? undefined,
            packageName: pkgName || "Học phí gia hạn",
            packageType: pkgInfo?.type ?? null,
            unitPrice: itemUnitPrice.toFixed(2),
            quantity: itemQuantity,
            promotionKeys: inv?.promotionKeys ?? [],
            surchargeKeys: inv?.surchargeKeys ?? [],
            promotionAmount: promoAmt.toFixed(2),
            surchargeAmount: surchAmt.toFixed(2),
            subtotal: grandTotal.toFixed(2),
            sortOrder: 0,
          });
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// makeupClassStudents
// ---------------------------------------------------------------------------
// Helper: find the next occurrence of a weekday (0=Sun,1=Mon,...,6=Sat) starting tomorrow
function getNextWeekdayDate(weekday: number): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(tomorrow);
    d.setDate(tomorrow.getDate() + i);
    if (d.getDay() === weekday) {
      return format(d, "yyyy-MM-dd");
    }
  }
  return format(tomorrow, "yyyy-MM-dd");
}

export async function makeupClassStudents(classId: string, data: any, userId: string): Promise<void> {
  const { option, subOption, selectedTargetSessionId, students } = data;
  const cls = await getClass(classId);
  if (!cls) throw new Error("Lớp học không tồn tại");

  await db.transaction(async (tx) => {
    // ── Pre-loop: Create new class for new_schedule option ─────────────────
    let newScheduleClassId: string | null = null;
    let newScheduleSessionIds: string[] = [];

    if (option === "new_schedule") {
      const { newSchedule } = data;
      if (!newSchedule?.scheduleConfig?.length) throw new Error("Chưa cấu hình lịch học");

      // Derive the earliest session date from user-selected dates
      const firstSelectedDate = newSchedule.scheduleConfig
        .map((c: any) => c.date ? String(c.date).slice(0, 10) : null)
        .filter(Boolean)
        .sort()[0] || format(new Date(), "yyyy-MM-dd");

      // Create new class
      const [newClass] = await tx.insert(classes).values({
        classCode: newSchedule.code || `MAKEUP_${Date.now()}`,
        name: newSchedule.name || "Lớp bù",
        locationId: cls.locationId,
        weekdays: newSchedule.weekdays || [],
        scheduleConfig: newSchedule.scheduleConfig,
        managerIds: cls.managerIds || [],
        status: "active",
        startDate: firstSelectedDate,
        learningFormat: "offline",
      }).returning({ id: classes.id });

      newScheduleClassId = newClass.id;

      // Create one class session per weekday-shift combination
      let sessionIndex = 1;
      const teacherIds: string[] = newSchedule.teacherIds || [];
      for (const dayConfig of newSchedule.scheduleConfig) {
        for (const shift of dayConfig.shifts) {
          if (!shift.shiftTemplateId) continue;
          // Use user-selected date when available, otherwise fall back to next weekday
          const sessionDate = dayConfig.date
            ? String(dayConfig.date).slice(0, 10)
            : getNextWeekdayDate(dayConfig.weekday);
          const roomId = shift.roomId || "00000000-0000-0000-0000-000000000000";

          const [newSession] = await tx.insert(classSessions).values({
            classId: newScheduleClassId,
            sessionDate,
            weekday: dayConfig.weekday,
            shiftTemplateId: shift.shiftTemplateId,
            roomId,
            status: "scheduled",
            sessionIndex,
            teacherIds: teacherIds.length > 0 ? teacherIds : undefined,
          }).returning({ id: classSessions.id });

          newScheduleSessionIds.push(newSession.id);
          sessionIndex++;
        }
      }

      if (newScheduleSessionIds.length === 0) throw new Error("Không tạo được buổi học nào");
    }

    for (const student of students) {
      const studentId = student.studentId;
      // original student_session record ID
      const originalStudentSessionId: string | undefined = student.id;
      // original class_session ID (the session the student missed)
      const originalClassSessionId: string | undefined = student.classSessionId;

      const [sc] = await tx.select()
        .from(studentClasses)
        .where(and(eq(studentClasses.classId, classId), eq(studentClasses.studentId, studentId)));
      if (!sc) continue;

      // ── Resolve original class session from DB for accurate note labels ───
      let originalCS: { sessionIndex: number | null; sessionDate: string; shiftTemplateId: string | null } | null = null;
      if (originalClassSessionId) {
        const [row] = await tx.select({
          sessionIndex: classSessions.sessionIndex,
          sessionDate: classSessions.sessionDate,
          shiftTemplateId: classSessions.shiftTemplateId,
        }).from(classSessions).where(eq(classSessions.id, originalClassSessionId));
        originalCS = row ?? null;
      }

      // ── Fetch fee package info from the original student session ──────────
      let origPackageId: string | null = null;
      let origPackageType: string | null = null;
      let origSessionPrice: string | null = null;
      if (originalStudentSessionId) {
        const [origSS] = await tx.select({
          packageId: studentSessions.packageId,
          packageType: studentSessions.packageType,
          sessionPrice: studentSessions.sessionPrice,
        }).from(studentSessions).where(eq(studentSessions.id, originalStudentSessionId));
        if (origSS) {
          origPackageId = origSS.packageId ?? null;
          origPackageType = origSS.packageType ?? null;
          origSessionPrice = origSS.sessionPrice ?? null;
        }
      }

      // Lookup startTime from shiftTemplate if available
      let originalStartTime = student.startTime || "";
      if (originalCS?.shiftTemplateId && !originalStartTime) {
        const [st] = await tx.select({ startTime: shiftTemplates.startTime })
          .from(shiftTemplates)
          .where(eq(shiftTemplates.id, originalCS.shiftTemplateId));
        originalStartTime = st?.startTime || "";
      }

      const buildOrigLabel = () => {
        if (originalCS?.sessionDate) {
          return `Buổi ${originalCS.sessionIndex}: ${getDayName(originalCS.sessionDate)} ${format(parseISO(originalCS.sessionDate), "dd/MM/yy")}${originalStartTime ? ` ${originalStartTime}` : ""}`;
        }
        return `Buổi ${originalCS?.sessionIndex || student.sessionIndex || "?"}`;
      };

      if (option === "other_class") {
        // ── Xếp bù sang lớp khác ────────────────────────────────────────────
        const { selectedTargetClassId } = data;
        if (!selectedTargetClassId) throw new Error("Chưa chọn lớp đích để xếp bù");
        if (!selectedTargetSessionId) throw new Error("Chưa chọn buổi học để xếp bù");

        // ❌ Validate 1: Target session must exist and belong to target class
        const [targetCS] = await tx.select()
          .from(classSessions)
          .where(and(
            eq(classSessions.id, selectedTargetSessionId),
            eq(classSessions.classId, selectedTargetClassId),
          ));
        if (!targetCS) throw new Error("Buổi học bù không tồn tại hoặc không thuộc lớp đích");

        // ❌ Validate 2: No existing student_session for the same (student, session) in target class
        const [duplicate] = await tx.select()
          .from(studentSessions)
          .where(and(
            eq(studentSessions.studentId, studentId),
            eq(studentSessions.classSessionId, selectedTargetSessionId),
            sql`${studentSessions.status} != 'cancelled'`,
          ));
        if (duplicate) {
          throw new Error(`Học viên đã có mặt trong buổi học này`);
        }

        // ❌ Validate 3: No same-day conflict within the target class
        const [sameDayTarget] = await tx.select({ id: studentSessions.id })
          .from(studentSessions)
          .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
          .where(and(
            eq(studentSessions.studentId, studentId),
            eq(classSessions.classId, selectedTargetClassId),
            sql`DATE(${classSessions.sessionDate}) = DATE(${targetCS.sessionDate}::text::date)`,
            sql`${studentSessions.status} != 'cancelled'`,
            sql`${studentSessions.attendanceStatus} != 'cancelled'`,
          ));
        if (sameDayTarget) {
          throw new Error(`Học viên đã có lịch học vào ngày ${format(parseISO(targetCS.sessionDate), "dd/MM/yyyy")} ở lớp đích`);
        }

        // Look up student's studentClassId in the target class (may be null if not enrolled)
        const [targetSC] = await tx.select()
          .from(studentClasses)
          .where(and(
            eq(studentClasses.classId, selectedTargetClassId),
            eq(studentClasses.studentId, studentId),
          ));

        // Fetch target class name for note
        const [targetClassRecord] = await tx.select({ name: classes.name })
          .from(classes)
          .where(eq(classes.id, selectedTargetClassId));
        const targetClassName = targetClassRecord?.name || "lớp khác";

        const origLabel = buildOrigLabel();
        const targetLabel = `Buổi ${targetCS.sessionIndex}: ${getDayName(targetCS.sessionDate)} ${format(parseISO(targetCS.sessionDate), "dd/MM/yy")}`;

        // ✅ INSERT new makeup student_session in target class
        await tx.insert(studentSessions).values({
          studentId,
          classId: selectedTargetClassId,
          studentClassId: targetSC?.id || null,
          classSessionId: selectedTargetSessionId,
          status: "scheduled",
          attendanceStatus: "pending",
          sessionSource: "makeup",
          makeupFromSessionId: originalClassSessionId || null,
          packageId: origPackageId,
          packageType: origPackageType,
          sessionPrice: origSessionPrice,
          note: `Xếp bù từ ${origLabel} (${cls.name})`,
        });

        // ✅ UPDATE original student_session → makeup_moved
        if (originalStudentSessionId) {
          await tx.update(studentSessions)
            .set({
              status: "makeup_moved",
              note: `Xếp bù sang ${targetLabel} (${targetClassName})`,
              updatedAt: new Date(),
            })
            .where(eq(studentSessions.id, originalStudentSessionId));
        }

        // Recalculate target class studentClass if enrolled
        if (targetSC) {
          await recalculateStudentClass(targetSC.id, tx);
        }

      } else if (option === "current_class") {
        // ── Specific session ────────────────────────────────────────────────
        if (subOption === "specific_session") {
          if (!selectedTargetSessionId) throw new Error("Chưa chọn buổi học để xếp bù");

          // ❌ Validate 1: Target session must exist
          const [targetCS] = await tx.select()
            .from(classSessions)
            .where(eq(classSessions.id, selectedTargetSessionId));
          if (!targetCS) throw new Error("Buổi học bù không tồn tại");

          // ❌ Validate 2: No existing student_session for the same (student, session)
          const [duplicate] = await tx.select()
            .from(studentSessions)
            .where(and(
              eq(studentSessions.studentId, studentId),
              eq(studentSessions.classSessionId, selectedTargetSessionId),
            ));
          if (duplicate) {
            throw new Error(`Học viên đã có mặt trong buổi học này`);
          }

          // ❌ Validate 3: No same-day conflict within the same class
          const [sameDay] = await tx.select({ id: studentSessions.id })
            .from(studentSessions)
            .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
            .where(and(
              eq(studentSessions.studentId, studentId),
              eq(classSessions.classId, classId),
              sql`DATE(${classSessions.sessionDate}) = DATE(${targetCS.sessionDate}::text::date)`,
              sql`${studentSessions.status} != 'cancelled'`,
              sql`${studentSessions.attendanceStatus} != 'cancelled'`,
            ));
          if (sameDay) {
            throw new Error(`Học viên đã có lịch học vào ngày ${format(parseISO(targetCS.sessionDate), "dd/MM/yyyy")}`);
          }

          // Build note strings
          const origLabel = buildOrigLabel();
          const targetLabel = `Buổi ${targetCS.sessionIndex}: ${getDayName(targetCS.sessionDate)} ${format(parseISO(targetCS.sessionDate), "dd/MM/yy")}`;

          // ✅ INSERT new makeup student_session
          await tx.insert(studentSessions).values({
            studentId,
            classId,
            studentClassId: sc.id,
            classSessionId: selectedTargetSessionId,
            status: "scheduled",
            attendanceStatus: "pending",
            sessionSource: "makeup",
            makeupFromSessionId: originalClassSessionId || null,
            packageId: origPackageId,
            packageType: origPackageType,
            sessionPrice: origSessionPrice,
            note: `Xếp bù từ ${origLabel}`,
          });

          // ✅ UPDATE original student_session → makeup_moved
          if (originalStudentSessionId) {
            await tx.update(studentSessions)
              .set({
                status: "makeup_moved",
                note: `Xếp bù sang ${targetLabel}`,
                updatedAt: new Date(),
              })
              .where(eq(studentSessions.id, originalStudentSessionId));
          }

        // ── End of schedule ─────────────────────────────────────────────────
        } else if (subOption === "end_of_schedule") {
          const lastCS = await tx.select()
            .from(classSessions)
            .where(eq(classSessions.classId, classId))
            .orderBy(sql`${classSessions.sessionDate} DESC`)
            .limit(1);

          const lastDate = lastCS[0] ? new Date(lastCS[0].sessionDate) : new Date(cls.startDate);
          let checkDate = new Date(lastDate);
          let found = false;

          while (!found) {
            checkDate.setDate(checkDate.getDate() + 1);
            const dbWeekday = checkDate.getDay();
            if (!cls.weekdays.includes(dbWeekday)) continue;

            const dateStr = checkDate.toISOString().split("T")[0];
            const resIdx = await tx.select({ maxIdx: sql<number>`MAX(${classSessions.sessionIndex})` })
              .from(classSessions)
              .where(eq(classSessions.classId, classId));
            const nextIdx = (resIdx[0]?.maxIdx || 0) + 1;

            const [newCS] = await tx.insert(classSessions).values({
              classId,
              sessionDate: dateStr,
              weekday: dbWeekday === 0 ? 0 : dbWeekday,
              shiftTemplateId: (cls.shiftTemplateIds || [])[0] || null,
              roomId: cls.roomId || "00000000-0000-0000-0000-000000000000",
              teacherIds: cls.teacherIds && cls.teacherIds.length > 0 ? cls.teacherIds : null,
              sessionIndex: nextIdx,
              status: "scheduled",
            }).returning();

            const origLabel = buildOrigLabel();
            const targetLabel = `Buổi ${newCS.sessionIndex}: ${getDayName(newCS.sessionDate)} ${format(parseISO(newCS.sessionDate), "dd/MM/yy")}`;

            // ✅ INSERT new makeup student_session at end of schedule
            await tx.insert(studentSessions).values({
              studentId,
              classId,
              studentClassId: sc.id,
              classSessionId: newCS.id,
              status: "scheduled",
              attendanceStatus: "pending",
              sessionSource: "makeup",
              makeupFromSessionId: originalClassSessionId || null,
              packageId: origPackageId,
              packageType: origPackageType,
              sessionPrice: origSessionPrice,
              note: `Xếp bù từ ${origLabel}`,
            });

            // ✅ UPDATE original student_session → makeup_moved
            if (originalStudentSessionId) {
              await tx.update(studentSessions)
                .set({
                  status: "makeup_moved",
                  note: `Xếp bù sang ${targetLabel}`,
                  updatedAt: new Date(),
                })
                .where(eq(studentSessions.id, originalStudentSessionId));
            }

            found = true;
          }
        }
      } else if (option === "new_schedule" && newScheduleClassId && newScheduleSessionIds.length > 0) {
        // ── Tạo riêng lịch bù ──────────────────────────────────────────────
        const origLabel = buildOrigLabel();

        // Schedule student in all newly created sessions
        for (const sessionId of newScheduleSessionIds) {
          await tx.insert(studentSessions).values({
            studentId,
            classId: newScheduleClassId,
            studentClassId: null,
            classSessionId: sessionId,
            status: "scheduled",
            attendanceStatus: "pending",
            sessionSource: "makeup",
            makeupFromSessionId: originalClassSessionId || null,
            packageId: origPackageId,
            packageType: origPackageType,
            sessionPrice: origSessionPrice,
            note: `Xếp bù từ ${origLabel} (${cls.name})`,
          });
        }

        // Update original student_session → makeup_moved
        if (originalStudentSessionId) {
          await tx.update(studentSessions)
            .set({
              status: "makeup_moved",
              note: `Xếp bù sang lớp ${data.newSchedule?.name || "bù"}`,
              updatedAt: new Date(),
            })
            .where(eq(studentSessions.id, originalStudentSessionId));
        }
      }

      await recalculateStudentClass(sc.id, tx);
    }
  });
}

// ---------------------------------------------------------------------------
// getStudentSessionsForClass
// ---------------------------------------------------------------------------
export async function getStudentSessionsForClass(classId: string, studentId: string): Promise<any[]> {
  return await db.query.studentSessions.findMany({
    where: and(eq(studentSessions.classId, classId), eq(studentSessions.studentId, studentId)),
    columns: {
      id: true,
      classSessionId: true,
      attendanceStatus: true,
      packageId: true,
      sessionPrice: true,
    },
    with: {
      classSession: {
        columns: {
          sessionDate: true,
          sessionIndex: true,
        },
        with: {
          shiftTemplate: {
            columns: {
              startTime: true,
              endTime: true,
            },
          },
        },
      },
      feePackage: {
        columns: {
          id: true,
          name: true,
          fee: true,
        },
      },
    },
    orderBy: (table, { asc }) => [
      asc(sql`(SELECT session_date FROM class_sessions WHERE id = ${table.classSessionId})`),
      asc(table.createdAt),
    ],
  });
}

// ---------------------------------------------------------------------------
// changeStudentCycle
// ---------------------------------------------------------------------------
export async function changeStudentCycle(data: {
  studentClassId: string;
  fromSessionOrder: number;
  weekdays: number[]; // new cycle: 0=CN, 1=T2, ..., 6=T7
  mode: "all" | "unattended_only";
}): Promise<{ deleted: number; created: number; warning?: string }> {
  // Get class info outside transaction for auto-extending schedule
  const [scPre] = await db.select().from(studentClasses).where(eq(studentClasses.id, data.studentClassId));
  if (!scPre) throw new Error("Không tìm thấy thông tin học viên trong lớp");
  const clsInfo = await getClass(scPre.classId);

  return await db.transaction(async (tx) => {
    // 1. Get studentClass
    const [sc] = await tx.select().from(studentClasses).where(eq(studentClasses.id, data.studentClassId));
    if (!sc) throw new Error("Không tìm thấy thông tin học viên trong lớp");

    // 2. Get all student sessions from fromSessionOrder onwards
    const futureSessions = await tx
      .select({
        id: studentSessions.id,
        classSessionId: studentSessions.classSessionId,
        attendanceStatus: studentSessions.attendanceStatus,
        sessionOrder: studentSessions.sessionOrder,
        sessionDate: classSessions.sessionDate,
        packageId: studentSessions.packageId,
        packageType: studentSessions.packageType,
        sessionPrice: studentSessions.sessionPrice,
      })
      .from(studentSessions)
      .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
      .where(and(
        eq(studentSessions.studentClassId, data.studentClassId),
        gte(studentSessions.sessionOrder, data.fromSessionOrder),
      ))
      .orderBy(asc(classSessions.sessionDate));

    if (futureSessions.length === 0) {
      return { deleted: 0, created: 0, warning: "Không có buổi nào từ vị trí này trở đi" };
    }

    // 3. Determine which to delete
    const toDelete = data.mode === "all"
      ? futureSessions
      : futureSessions.filter((ss) => ss.attendanceStatus === "pending");

    if (toDelete.length === 0) {
      return { deleted: 0, created: 0, warning: "Không có buổi nào cần thay đổi" };
    }

    // 4. From date = earliest date of sessions to delete
    const fromDate = toDelete[0].sessionDate;

    // 5. Convert new weekdays to DB convention: 0(CN)→7, 1-6 same
    const dbWeekdays = data.weekdays.map((w) => (w === 0 ? 7 : w));

    // 6. Sessions student is keeping (attended in unattended_only mode)
    const toDeleteIds = new Set(toDelete.map((ss) => ss.id));
    const keptClassSessionIds = new Set(
      futureSessions.filter((ss) => !toDeleteIds.has(ss.id)).map((ss) => ss.classSessionId)
    );

    // 7. Fee reference from first deleted session
    const feeRef = toDelete.find((ss) => ss.packageId) ?? toDelete[0];

    // 8. Delete selected student sessions
    await tx.delete(studentSessions).where(inArray(studentSessions.id, [...toDeleteIds]));

    // 9. Create new student sessions — iterating forward day by day, auto-creating class sessions if needed
    const numToCreate = toDelete.length;
    let created = 0;
    let checkDate = new Date(fromDate);
    checkDate.setDate(checkDate.getDate() - 1); // start one day before so first increment lands on fromDate
    const SAFEGUARD = 3650;
    let iterations = 0;

    // Resolve shiftTemplateId and roomId from existing class sessions (most recent) as fallback
    const [latestCs] = await tx
      .select({ shiftTemplateId: classSessions.shiftTemplateId, roomId: classSessions.roomId, teacherIds: classSessions.teacherIds })
      .from(classSessions)
      .where(eq(classSessions.classId, sc.classId))
      .orderBy(sql`${classSessions.sessionDate} DESC`)
      .limit(1);
    const fallbackShiftId = (clsInfo?.shiftTemplateIds || [])[0] ?? latestCs?.shiftTemplateId ?? null;
    const fallbackRoomId = clsInfo?.roomId ?? latestCs?.roomId ?? "00000000-0000-0000-0000-000000000000";
    const fallbackTeacherIds = (clsInfo?.teacherIds && clsInfo.teacherIds.length > 0)
      ? clsInfo.teacherIds
      : (latestCs?.teacherIds ?? null);

    if (!fallbackShiftId) throw new Error("Không tìm thấy ca học để tạo buổi mới. Vui lòng kiểm tra cấu hình lớp.");

    // Class full weekdays in DB convention (0→7 for Sunday, 1-6 for Mon-Sat)
    // clsInfo.weekdays uses JS getDay() convention: 0=Sun, 1=Mon...6=Sat
    const classDbWeekdays: number[] = (clsInfo?.weekdays || []).map((w: number) => w === 0 ? 7 : w);

    // Track the last existing class session date so we know when we start extending
    const lastExistingClassDateRes = await tx
      .select({ sessionDate: classSessions.sessionDate })
      .from(classSessions)
      .where(eq(classSessions.classId, sc.classId))
      .orderBy(sql`${classSessions.sessionDate} DESC`)
      .limit(1);
    const lastExistingClassDate = lastExistingClassDateRes[0]?.sessionDate ?? fromDate;

    while (created < numToCreate && iterations < SAFEGUARD) {
      checkDate.setDate(checkDate.getDate() + 1);
      iterations++;

      const jsWeekday = checkDate.getDay(); // 0=Sun … 6=Sat
      const dbWd = jsWeekday === 0 ? 7 : jsWeekday; // convert Sun to 7
      const dateStr = checkDate.toISOString().split("T")[0];
      const isPastLastClassSession = dateStr > lastExistingClassDate;

      // When extending beyond existing class schedule: create class sessions for ALL class weekdays
      // When still within existing schedule: only look for student's new cycle days
      const isClassDay = classDbWeekdays.length > 0 ? classDbWeekdays.includes(dbWd) : dbWeekdays.includes(dbWd);
      const isStudentDay = dbWeekdays.includes(dbWd);

      if (isPastLastClassSession) {
        // Beyond last class session — follow the full class cycle
        if (!isClassDay) continue;
      } else {
        // Within existing schedule — only care about student's new cycle days
        if (!isStudentDay) continue;
      }

      // Find or create a class session for this date
      let [cs] = await tx
        .select({ id: classSessions.id, sessionDate: classSessions.sessionDate })
        .from(classSessions)
        .where(and(eq(classSessions.classId, sc.classId), eq(classSessions.sessionDate, dateStr)));

      if (!cs) {
        // Auto-extend class schedule: create new class session
        const res = await tx
          .select({ maxIdx: sql<number>`MAX(${classSessions.sessionIndex})` })
          .from(classSessions)
          .where(eq(classSessions.classId, sc.classId));
        const nextIdx = (res[0]?.maxIdx || 0) + 1;

        [cs] = await tx.insert(classSessions).values({
          classId: sc.classId,
          sessionDate: dateStr,
          weekday: dbWd,
          shiftTemplateId: fallbackShiftId,
          roomId: fallbackRoomId,
          teacherIds: fallbackTeacherIds,
          sessionIndex: nextIdx,
          status: "scheduled",
        }).returning();
      }

      // Only add the student to sessions matching their new cycle
      if (!isStudentDay) continue;

      // Skip if this is a session the student is already keeping
      if (keptClassSessionIds.has(cs.id)) continue;

      // Skip if student already has this session
      const [existing] = await tx
        .select({ id: studentSessions.id })
        .from(studentSessions)
        .where(and(eq(studentSessions.studentId, sc.studentId), eq(studentSessions.classSessionId, cs.id)));
      if (existing) continue;

      await tx.insert(studentSessions).values({
        studentId: sc.studentId,
        classId: sc.classId,
        studentClassId: sc.id,
        classSessionId: cs.id,
        status: "scheduled",
        attendanceStatus: "pending",
        packageId: feeRef.packageId ?? null,
        packageType: feeRef.packageType ?? null,
        sessionPrice: feeRef.sessionPrice ?? null,
      });
      created++;
    }

    // 10. Update scheduledWeekdays in studentClasses and append to cycle_history
    const [currentSc] = await tx
      .select({ scheduledWeekdays: studentClasses.scheduledWeekdays, cycleHistory: sql<any>`cycle_history` })
      .from(studentClasses)
      .where(eq(studentClasses.id, data.studentClassId));
    const prevHistory: Array<{ fromSessionOrder: number; weekdays: number[] | null }> = currentSc?.cycleHistory ?? [];
    const newHistoryEntry = { fromSessionOrder: data.fromSessionOrder, weekdays: data.weekdays.length > 0 ? data.weekdays : null };
    // If there is no existing history entry that covers sessions BEFORE this change point,
    // add an initial entry at session 1 recording the cycle that was active before this change.
    let baseHistory = prevHistory;
    const hasEarlierEntry = prevHistory.some((h) => h.fromSessionOrder < data.fromSessionOrder);
    if (!hasEarlierEntry && data.fromSessionOrder > 1) {
      const initialWeekdays = (currentSc?.scheduledWeekdays && currentSc.scheduledWeekdays.length > 0)
        ? currentSc.scheduledWeekdays
        : null;
      baseHistory = [{ fromSessionOrder: 1, weekdays: initialWeekdays }, ...prevHistory];
    }
    const newHistory = [...baseHistory.filter((h) => h.fromSessionOrder < data.fromSessionOrder), newHistoryEntry];
    await tx.update(studentClasses)
      .set({ scheduledWeekdays: data.weekdays, updatedAt: new Date() })
      .where(eq(studentClasses.id, data.studentClassId));
    await tx.execute(sql`UPDATE student_classes SET cycle_history = ${JSON.stringify(newHistory)}::jsonb WHERE id = ${data.studentClassId}`);

    // 11. Renumber ALL student sessions for this student in this class by date order
    const allOrdered = await tx
      .select({ id: studentSessions.id })
      .from(studentSessions)
      .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
      .where(eq(studentSessions.studentClassId, data.studentClassId))
      .orderBy(asc(classSessions.sessionDate), asc(studentSessions.createdAt));
    for (let i = 0; i < allOrdered.length; i++) {
      await tx.update(studentSessions).set({ sessionOrder: i + 1 }).where(eq(studentSessions.id, allOrdered[i].id));
    }

    // 12. Recalculate (pass tx to avoid deadlock)
    await recalculateStudentClass(data.studentClassId, tx);

    return { deleted: toDelete.length, created };
  });
}

// ---------------------------------------------------------------------------
// getStudentSessionsByClassSession
// ---------------------------------------------------------------------------
export async function getStudentSessionsByClassSession(classSessionId: string): Promise<any[]> {
  const sessions = await db.query.studentSessions.findMany({
    where: and(
      eq(studentSessions.classSessionId, classSessionId),
      sql`${studentSessions.status} != 'transferred'`,
    ),
    with: {
      student: {
        columns: {
          id: true,
          fullName: true,
          code: true,
        },
      },
      feePackage: {
        columns: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: (table, { asc }) => [asc(table.sessionOrder)],
  });

  const studentClassIds = [...new Set(sessions.map((s) => s.studentClassId).filter(Boolean))] as string[];
  const scRows = studentClassIds.length
    ? await db
        .select({
          id: studentClasses.id,
          scheduledWeekdays: studentClasses.scheduledWeekdays,
          cycleHistory: sql<any>`cycle_history`,
        })
        .from(studentClasses)
        .where(inArray(studentClasses.id, studentClassIds))
    : [];
  const scMap: Record<string, { scheduledWeekdays: number[] | null; cycleHistory: Array<{ fromSessionOrder: number; weekdays: number[] | null }> | null }> = {};
  for (const r of scRows) {
    scMap[r.id] = {
      scheduledWeekdays: r.scheduledWeekdays ?? null,
      cycleHistory: (r.cycleHistory as any) ?? null,
    };
  }

  return sessions.map((s) => {
    if (!s.studentClassId) return { ...s, scheduledWeekdays: null };
    const sc = scMap[s.studentClassId];
    if (!sc) return { ...s, scheduledWeekdays: null };
    // Use cycle_history to determine effective weekdays at this session's sessionOrder
    const history = sc.cycleHistory;
    if (history && history.length > 0 && s.sessionOrder != null) {
      const applicableEntries = history
        .filter((h) => h.fromSessionOrder <= s.sessionOrder!)
        .sort((a, b) => b.fromSessionOrder - a.fromSessionOrder);
      if (applicableEntries.length > 0) {
        return { ...s, scheduledWeekdays: applicableEntries[0].weekdays ?? null };
      }
      // history exists but no entry covers this session (session is before all history entries).
      // Fall back to the student's current scheduledWeekdays so we don't incorrectly show "Tất cả".
      return { ...s, scheduledWeekdays: sc.scheduledWeekdays ?? null };
    }
    return { ...s, scheduledWeekdays: sc.scheduledWeekdays ?? null };
  });
}

// ---------------------------------------------------------------------------
// cancelClassSessions
// ---------------------------------------------------------------------------
export async function cancelClassSessions(params: { classId: string; fromSessionId: string; toSessionId: string; reason: string; userId: string }): Promise<void> {
  const { classId, fromSessionId, toSessionId, reason, userId } = params;

  const [fromSession] = await db.select().from(classSessions).where(eq(classSessions.id, fromSessionId));
  const [toSession] = await db.select().from(classSessions).where(eq(classSessions.id, toSessionId));

  if (!fromSession || !toSession) throw new Error("Không tìm thấy buổi học");

  const fromIndex = fromSession.sessionIndex || 0;
  const toIndex = toSession.sessionIndex || 0;

  await db.update(classSessions)
    .set({
      status: "cancelled",
      cancelReason: reason,
      cancelledAt: new Date(),
      cancelledBy: userId,
      updatedAt: new Date(),
    })
    .where(and(
      eq(classSessions.classId, classId),
      sql`${classSessions.sessionIndex} BETWEEN ${fromIndex} AND ${toIndex}`,
    ));

  const affectedSessions = await db.select({ id: classSessions.id })
    .from(classSessions)
    .where(and(
      eq(classSessions.classId, classId),
      sql`${classSessions.sessionIndex} BETWEEN ${fromIndex} AND ${toIndex}`,
    ));

  const affectedIds = affectedSessions.map(s => s.id);
  if (affectedIds.length > 0) {
    const affectedStudentClasses = await db.selectDistinct({ studentClassId: studentSessions.studentClassId })
      .from(studentSessions)
      .where(inArray(studentSessions.classSessionId, affectedIds));

    await db.delete(studentSessions)
      .where(inArray(studentSessions.classSessionId, affectedIds));

    for (const sc of affectedStudentClasses) {
      if (sc.studentClassId) {
        await recalculateStudentClass(sc.studentClassId);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// excludeClassSessions
// ---------------------------------------------------------------------------
export async function excludeClassSessions(params: { classId: string; fromSessionId: string; toSessionId: string; reason: string; userId: string }): Promise<void> {
  const { classId, fromSessionId, toSessionId, reason, userId } = params;

  await db.transaction(async (tx) => {
    const [fromSession] = await tx.select().from(classSessions).where(eq(classSessions.id, fromSessionId));
    const [toSession] = await tx.select().from(classSessions).where(eq(classSessions.id, toSessionId));

    if (!fromSession || !toSession) throw new Error("Không tìm thấy buổi học");

    const fromOrder = fromSession.sessionIndex || 0;
    const toOrder = toSession.sessionIndex || 0;
    const shiftCount = toOrder - fromOrder + 1;

    const [originalLastSession] = await tx.select()
      .from(classSessions)
      .where(eq(classSessions.classId, classId))
      .orderBy(sql`${classSessions.sessionIndex} DESC`)
      .limit(1);
    const originalLastSessionIndex = originalLastSession?.sessionIndex || 0;

    // Fetch excluded sessions with their indexes
    const excludedSessionsInfo = await tx.select({ id: classSessions.id, sessionIndex: classSessions.sessionIndex })
      .from(classSessions)
      .where(and(
        eq(classSessions.classId, classId),
        sql`${classSessions.sessionIndex} BETWEEN ${fromOrder} AND ${toOrder}`,
      ));
    const excludedSessionIds = excludedSessionsInfo.map(s => s.id);
    const excludedIdSet = new Set(excludedSessionIds);

    // Step 1: Shift class session indexes for sessions after the excluded range
    await tx.update(classSessions)
      .set({
        sessionIndex: sql`${classSessions.sessionIndex} - ${shiftCount}`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(classSessions.classId, classId),
        sql`${classSessions.sessionIndex} > ${toOrder}`,
      ));

    // Step 2: Create compensating sessions at the end (so they exist before re-linking)
    const compensatingMap: Record<number, string> = {}; // excluded sessionIndex → new compensating session ID
    const lastSessionAfterShift = await tx.select()
      .from(classSessions)
      .where(and(eq(classSessions.classId, classId), sql`${classSessions.id} != ALL(ARRAY[${sql.raw(excludedSessionIds.map(id => `'${id}'`).join(','))}]::uuid[])`))
      .orderBy(sql`${classSessions.sessionIndex} DESC`)
      .limit(1);

    if (lastSessionAfterShift[0]) {
      const classData = await tx.select().from(classes).where(eq(classes.id, classId));
      if (classData[0]) {
        const weekdays = classData[0].weekdays || [];
        const lastRemainingDate = new Date(lastSessionAfterShift[0].sessionDate);
        const lastExcludedDate = new Date(toSession.sessionDate);
        let currentDate = lastRemainingDate > lastExcludedDate ? lastRemainingDate : lastExcludedDate;

        for (let i = 0; i < shiftCount; i++) {
          do {
            currentDate.setDate(currentDate.getDate() + 1);
          } while (!weekdays.includes(currentDate.getDay()));

          const newSessionIndex = originalLastSessionIndex - shiftCount + i + 1;

          const [newSession] = await tx.insert(classSessions)
            .values({
              classId,
              sessionDate: format(currentDate, "yyyy-MM-dd"),
              weekday: currentDate.getDay(),
              shiftTemplateId: lastSessionAfterShift[0].shiftTemplateId,
              roomId: lastSessionAfterShift[0].roomId,
              teacherIds: lastSessionAfterShift[0].teacherIds,
              learningFormat: lastSessionAfterShift[0].learningFormat,
              status: "scheduled",
              sessionIndex: newSessionIndex,
            })
            .returning();

          compensatingMap[newSessionIndex] = newSession.id;
        }
      }
    }

    // Step 3: Build map from excluded session original index → replacement class session ID
    // The replacement is whichever class session now occupies that index (shifted or compensating).
    const excludedToReplacementId: Record<string, string> = {};
    for (const ex of excludedSessionsInfo) {
      if (ex.sessionIndex == null) continue;

      // Check if a non-excluded session now has this same index (shifted from after the range)
      const shiftedReplacement = await tx.select({ id: classSessions.id })
        .from(classSessions)
        .where(and(
          eq(classSessions.classId, classId),
          eq(classSessions.sessionIndex, ex.sessionIndex),
          sql`${classSessions.id} != ${ex.id}`,
        ));

      if (shiftedReplacement[0] && !excludedIdSet.has(shiftedReplacement[0].id)) {
        excludedToReplacementId[ex.id] = shiftedReplacement[0].id;
      } else if (compensatingMap[ex.sessionIndex]) {
        // Compensating session was created at this index
        excludedToReplacementId[ex.id] = compensatingMap[ex.sessionIndex];
      }
    }

    // Build a direct mapping for "Tất cả" students: i-th excluded session → i-th compensating session.
    // Using shifted sessions as replacements (original approach) would cause duplicates because "Tất cả"
    // students already have student_sessions in every remaining slot after the shift.
    const sortedExcludedSessions = [...excludedSessionsInfo].sort(
      (a, b) => (a.sessionIndex ?? 0) - (b.sessionIndex ?? 0)
    );
    const sortedCompensatingIds = Object.entries(compensatingMap)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, id]) => id);
    const allDaysReplacementMap: Record<string, string> = {};
    for (let i = 0; i < sortedExcludedSessions.length; i++) {
      if (sortedCompensatingIds[i]) {
        allDaysReplacementMap[sortedExcludedSessions[i].id] = sortedCompensatingIds[i];
      }
    }

    // Step 4: Re-link student sessions from excluded class sessions to their replacements
    // YC-1: Each student is re-linked individually based on their scheduledWeekdays.
    // - Students with null/empty scheduledWeekdays (Tất cả) → map to compensating sessions at the end
    // - Students with specific scheduledWeekdays → find replacement by matching weekday (YC-2 to YC-5)
    if (excludedSessionIds.length > 0) {
      const excludedStudentSessions = await tx.select()
        .from(studentSessions)
        .where(inArray(studentSessions.classSessionId, excludedSessionIds));

      // Cache newly created on-demand sessions: dateString → classSessionId
      const onDemandSessionCache: Record<string, string> = {};

      // Helper: SQL fragment excluding excluded session IDs
      const excludedIdsFragment = sql.raw(excludedSessionIds.map(id => `'${id}'`).join(','));

      for (const ss of excludedStudentSessions) {
        // Get the student's scheduled weekdays — prefer direct lookup via studentClassId for reliability
        const [studentClass] = ss.studentClassId
          ? await tx.select().from(studentClasses).where(eq(studentClasses.id, ss.studentClassId))
          : await tx.select().from(studentClasses).where(and(
              eq(studentClasses.studentId, ss.studentId),
              eq(studentClasses.classId, classId),
            ));

        const scheduledWeekdays = studentClass?.scheduledWeekdays;
        let replacementId: string | undefined;

        if (!scheduledWeekdays || scheduledWeekdays.length === 0) {
          // YC-1: "Tất cả" students — map directly to compensating sessions (avoids duplicate enrollments).
          // Fallback to index-based map only if no compensating session was built (edge case).
          replacementId = allDaysReplacementMap[ss.classSessionId] ?? excludedToReplacementId[ss.classSessionId];
        } else {
          // YC-2: Find first available class session after the excluded range that:
          //   a) matches one of the student's scheduledWeekdays
          //   b) the student does NOT already have a student_session there (YC-4)
          const candidateSessions = await tx.select()
            .from(classSessions)
            .where(and(
              eq(classSessions.classId, classId),
              sql`${classSessions.sessionDate} > ${toSession.sessionDate}`,
              inArray(classSessions.weekday, scheduledWeekdays),
              sql`${classSessions.id} != ALL(ARRAY[${excludedIdsFragment}]::uuid[])`,
            ))
            .orderBy(asc(classSessions.sessionIndex));

          for (const candidate of candidateSessions) {
            // YC-4: Skip if student already occupies this slot
            const [conflict] = await tx.select({ id: studentSessions.id })
              .from(studentSessions)
              .where(and(
                eq(studentSessions.studentId, ss.studentId),
                eq(studentSessions.classSessionId, candidate.id),
              ));

            if (!conflict) {
              replacementId = candidate.id;
              break;
            }
          }

          // YC-3: No existing slot found — create a new class session on the right weekday
          if (!replacementId) {
            // Find current last class session (excluding the ones being deleted)
            const [currentLast] = await tx.select()
              .from(classSessions)
              .where(and(
                eq(classSessions.classId, classId),
                sql`${classSessions.id} != ALL(ARRAY[${excludedIdsFragment}]::uuid[])`,
              ))
              .orderBy(sql`${classSessions.sessionIndex} DESC`)
              .limit(1);

            if (currentLast) {
              // Advance day-by-day from last session date until a matching weekday is found
              const refDate = new Date(currentLast.sessionDate);
              let newDate: Date | null = null;
              for (let d = 1; d <= 7; d++) {
                const candidate = new Date(refDate);
                candidate.setDate(refDate.getDate() + d);
                if (scheduledWeekdays.includes(candidate.getDay())) {
                  newDate = candidate;
                  break;
                }
              }

              if (newDate) {
                const dateStr = format(newDate, "yyyy-MM-dd");

                if (onDemandSessionCache[dateStr]) {
                  // Reuse a session we already created for this date in this operation
                  replacementId = onDemandSessionCache[dateStr];
                } else {
                  // Check if a class session already exists on this date (shouldn't normally)
                  const [alreadyExists] = await tx.select()
                    .from(classSessions)
                    .where(and(
                      eq(classSessions.classId, classId),
                      eq(classSessions.sessionDate, dateStr),
                      sql`${classSessions.id} != ALL(ARRAY[${excludedIdsFragment}]::uuid[])`,
                    ));

                  if (alreadyExists) {
                    const [conflict] = await tx.select({ id: studentSessions.id })
                      .from(studentSessions)
                      .where(and(
                        eq(studentSessions.studentId, ss.studentId),
                        eq(studentSessions.classSessionId, alreadyExists.id),
                      ));
                    if (!conflict) {
                      replacementId = alreadyExists.id;
                      onDemandSessionCache[dateStr] = alreadyExists.id;
                    }
                  } else {
                    // YC-3: Create a brand-new class session
                    const newIndex = (currentLast.sessionIndex ?? 0) + 1;
                    const [newSession] = await tx.insert(classSessions)
                      .values({
                        classId,
                        sessionDate: dateStr,
                        weekday: newDate.getDay(),
                        shiftTemplateId: currentLast.shiftTemplateId,
                        roomId: currentLast.roomId,
                        teacherIds: currentLast.teacherIds,   // YC-6: inherited from last session
                        learningFormat: currentLast.learningFormat,
                        status: "scheduled",
                        sessionIndex: newIndex,
                      })
                      .returning();

                    replacementId = newSession.id;
                    onDemandSessionCache[dateStr] = newSession.id;
                  }
                }
              }
            }
          }
        }

        if (replacementId) {
          await tx.update(studentSessions)
            .set({ classSessionId: replacementId, updatedAt: new Date() })
            .where(eq(studentSessions.id, ss.id));
        }
      }
    }

    // Step 5: Record the exclusion
    await tx.insert(classSessionExclusions)
      .values({
        classId,
        fromSessionId,
        toSessionId,
        fromSessionOrder: fromOrder,
        toSessionOrder: toOrder,
        fromSessionDate: fromSession.sessionDate,
        toSessionDate: toSession.sessionDate,
        reason,
        createdBy: userId,
      });

    // Step 6: Delete excluded class sessions.
    // Student sessions that could not be re-linked (no replacement found) are deleted here.
    await tx.delete(studentSessions)
      .where(inArray(studentSessions.classSessionId, excludedSessionIds));
    await tx.delete(classSessions)
      .where(inArray(classSessions.id, excludedSessionIds));
  });

  const studentsInClass = await db.select().from(studentClasses).where(eq(studentClasses.classId, classId));
  for (const sc of studentsInClass) {
    await recalculateStudentClass(sc.id);
  }
}

// ---------------------------------------------------------------------------
// updateClassSession
// ---------------------------------------------------------------------------
export async function updateClassSession(id: string, updates: any): Promise<ClassSession> {
  const { sessionDate, shiftTemplateId, teacherIds, changeReason, changedBy } = updates;

  const [existing] = await db.select().from(classSessions).where(eq(classSessions.id, id));
  if (!existing) throw new Error("Không tìm thấy buổi học");

  const conflict = await db.select().from(classSessions).where(and(
    eq(classSessions.classId, existing.classId),
    eq(classSessions.sessionDate, sessionDate),
    eq(classSessions.shiftTemplateId, shiftTemplateId),
    sql`${classSessions.id} != ${id}`,
  ));

  if (conflict.length > 0) {
    throw new Error("Trùng lịch học (ngày và ca) với buổi khác trong cùng lớp");
  }

  const [updated] = await db.update(classSessions)
    .set({
      sessionDate,
      shiftTemplateId,
      teacherIds: Array.isArray(teacherIds) ? (teacherIds.length > 0 ? teacherIds : null) : null,
      changeReason,
      changedBy,
      changedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(classSessions.id, id))
    .returning();

  if (existing.sessionDate !== sessionDate) {
    const affectedStudentClasses = await db.selectDistinct({ studentClassId: studentSessions.studentClassId })
      .from(studentSessions)
      .where(eq(studentSessions.classSessionId, id));

    for (const sc of affectedStudentClasses) {
      if (sc.studentClassId) {
        await recalculateStudentClass(sc.studentClassId);
      }
    }
  }

  return updated;
}

// ---------------------------------------------------------------------------
// updateClassCycle
// ---------------------------------------------------------------------------
export async function updateClassCycle(classId: string, data: {
  fromSessionId: string;
  toSessionId: string;
  weekdays: number[];
  weekdayConfigs: Record<number, { shiftTemplateId: string; teacherIds: string[] }>;
  reason: string;
  userId: string;
}): Promise<void> {
  const { fromSessionId, toSessionId, weekdays, weekdayConfigs, reason, userId } = data;

  const [fromSession] = await db.select().from(classSessions).where(eq(classSessions.id, fromSessionId));
  const [toSession] = await db.select().from(classSessions).where(eq(classSessions.id, toSessionId));

  if (!fromSession || !toSession) throw new Error("Không tìm thấy buổi học");

  const fromIndex = fromSession.sessionIndex || 0;
  const toIndex = toSession.sessionIndex || 0;

  if (fromIndex > toIndex) throw new Error("Buổi bắt đầu phải nhỏ hơn hoặc bằng buổi kết thúc");

  const [classRecord] = await db.select({ evaluationCriteriaIds: classes.evaluationCriteriaIds }).from(classes).where(eq(classes.id, classId));

  await db.transaction(async (tx) => {
    const sessionsInRange = await tx.select().from(classSessions).where(and(
      eq(classSessions.classId, classId),
      between(classSessions.sessionIndex, fromIndex, toIndex),
    ));

    for (const s of sessionsInRange) {
      if (s.status === "completed") {
        throw new Error(`Buổi ${s.sessionIndex} đã hoàn thành, không thể cập nhật chu kỳ`);
      }

      const attendance = await tx.select().from(studentSessions).where(and(
        eq(studentSessions.classSessionId, s.id),
        sql`${studentSessions.status} != 'scheduled'`,
      ));
      if (attendance.length > 0) {
        throw new Error(`Buổi ${s.sessionIndex} đã có dữ liệu điểm danh, không thể cập nhật chu kỳ`);
      }
    }

    const sessionIds = sessionsInRange.map(s => s.id);

    // Before deleting, capture which students were enrolled in each session (by sessionIndex)
    // Also preserve fee-related fields so they survive the cycle update
    type SavedStudentSession = {
      studentId: string;
      studentClassId: string | null;
      packageId: string | null;
      packageType: string | null;
      sessionPrice: string | null;
      isPaid: boolean | null;
      note: string | null;
      sessionOrder: number | null;
    };
    const studentsBySessionIndex: Record<number, SavedStudentSession[]> = {};
    if (sessionIds.length > 0) {
      const existingStudentSessions = await tx.select({
        classSessionId: studentSessions.classSessionId,
        studentId: studentSessions.studentId,
        studentClassId: studentSessions.studentClassId,
        packageId: studentSessions.packageId,
        packageType: studentSessions.packageType,
        sessionPrice: studentSessions.sessionPrice,
        isPaid: studentSessions.isPaid,
        note: studentSessions.note,
        sessionOrder: studentSessions.sessionOrder,
      }).from(studentSessions).where(inArray(studentSessions.classSessionId, sessionIds));

      for (const ss of existingStudentSessions) {
        const session = sessionsInRange.find(s => s.id === ss.classSessionId);
        if (session && session.sessionIndex != null) {
          if (!studentsBySessionIndex[session.sessionIndex]) {
            studentsBySessionIndex[session.sessionIndex] = [];
          }
          studentsBySessionIndex[session.sessionIndex].push({
            studentId: ss.studentId,
            studentClassId: ss.studentClassId ?? null,
            packageId: ss.packageId ?? null,
            packageType: ss.packageType ?? null,
            sessionPrice: ss.sessionPrice ?? null,
            isPaid: ss.isPaid ?? null,
            note: ss.note ?? null,
            sessionOrder: ss.sessionOrder ?? null,
          });
        }
      }

      await tx.delete(studentSessions).where(inArray(studentSessions.classSessionId, sessionIds));
      await tx.delete(classSessions).where(inArray(classSessions.id, sessionIds));
    }

    let currentDate = new Date(fromSession.sessionDate);
    const newSessions: any[] = [];

    for (let i = fromIndex; i <= toIndex; i++) {
      while (!weekdays.includes(currentDate.getDay())) {
        currentDate.setDate(currentDate.getDate() + 1);
      }

      const wd = currentDate.getDay();
      const config = weekdayConfigs[wd];

      const [newSession] = await tx.insert(classSessions).values({
        classId,
        sessionIndex: i,
        sessionDate: currentDate.toISOString().split("T")[0],
        weekday: wd,
        shiftTemplateId: config.shiftTemplateId,
        teacherIds: config.teacherIds && config.teacherIds.length > 0 ? config.teacherIds : null,
        roomId: fromSession.roomId,
        status: "scheduled",
        changeReason: reason,
        changedAt: new Date(),
        changedBy: userId,
        updatedAt: new Date(),
        evaluationCriteriaIds: classRecord?.evaluationCriteriaIds || null,
      }).returning();

      newSessions.push(newSession);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Re-assign only the students who were previously enrolled in each specific session
    // Preserve all fee-related fields from the original student sessions
    const affectedStudentIds = new Set<string>();
    for (const newSession of newSessions) {
      const studentsForThisSession = studentsBySessionIndex[newSession.sessionIndex] ?? [];
      if (studentsForThisSession.length > 0) {
        const sSessions = studentsForThisSession.map(saved => ({
          studentId: saved.studentId,
          studentClassId: saved.studentClassId,
          classId,
          classSessionId: newSession.id,
          status: "scheduled",
          packageId: saved.packageId,
          packageType: saved.packageType,
          sessionPrice: saved.sessionPrice,
          isPaid: saved.isPaid,
          note: saved.note,
          sessionOrder: saved.sessionOrder,
        }));
        await tx.insert(studentSessions).values(sSessions);
        studentsForThisSession.forEach(saved => affectedStudentIds.add(saved.studentId));
      }
    }

    // === Update cycle_history for custom-cycle students ===
    // Sessions were re-assigned by index above (session N old → session N new).
    // For students with a custom cycle (scheduledWeekdays set), we must record the new
    // effective weekdays in cycle_history so that getStudentSessionsByClassSession can
    // return the correct cycle for every session based on its position.
    const allAffectedScIds: string[] = [];
    for (const sessions of Object.values(studentsBySessionIndex)) {
      for (const ss of sessions) {
        if (ss.studentClassId && !allAffectedScIds.includes(ss.studentClassId)) {
          allAffectedScIds.push(ss.studentClassId);
        }
      }
    }

    if (allAffectedScIds.length > 0) {
      const customCycleScs = await tx.select({
        id: studentClasses.id,
        scheduledWeekdays: studentClasses.scheduledWeekdays,
        cycleHistory: sql<any>`cycle_history`,
      }).from(studentClasses)
        .where(and(
          inArray(studentClasses.id, allAffectedScIds),
          sql`${studentClasses.scheduledWeekdays} IS NOT NULL AND array_length(${studentClasses.scheduledWeekdays}, 1) > 0`,
        ));

      for (const sc of customCycleScs) {
        // Determine the new weekdays this student has in the updated range
        const newSessionWeekdays = await tx.select({
          weekday: classSessions.weekday,
        }).from(studentSessions)
          .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
          .where(and(
            eq(studentSessions.studentClassId, sc.id),
            between(classSessions.sessionIndex, fromIndex, toIndex),
          ));

        if (newSessionWeekdays.length === 0) continue;

        const newUniqueWeekdays = [
          ...new Set(newSessionWeekdays.map(s => s.weekday).filter((w): w is number => w != null))
        ].sort((a, b) => a - b);

        if (fromIndex <= 1) {
          // Updating from the very first session: just overwrite scheduledWeekdays directly
          await tx.update(studentClasses)
            .set({ scheduledWeekdays: newUniqueWeekdays, updatedAt: new Date() })
            .where(eq(studentClasses.id, sc.id));
        } else {
          // Updating from a middle session: keep scheduledWeekdays unchanged (reflects sessions 1..fromIndex-1)
          // but record the new cycle in cycle_history so sessions fromIndex+ use the correct weekdays.
          // Find the student's sessionOrder at fromIndex (the first session in the updated range)
          const firstUpdatedSessionOrder = studentsBySessionIndex[fromIndex]
            ?.find(s => s.studentClassId === sc.id)?.sessionOrder ?? null;

          if (firstUpdatedSessionOrder != null) {
            const prevHistory: Array<{ fromSessionOrder: number; weekdays: number[] | null }> =
              (sc.cycleHistory as any) ?? [];

            // Ensure there's a base entry at sessionOrder 1 recording the original cycle
            let baseHistory = prevHistory;
            const hasEarlierEntry = prevHistory.some(h => h.fromSessionOrder < firstUpdatedSessionOrder);
            if (!hasEarlierEntry && firstUpdatedSessionOrder > 1) {
              const initialWeekdays = sc.scheduledWeekdays && sc.scheduledWeekdays.length > 0
                ? sc.scheduledWeekdays
                : null;
              baseHistory = [{ fromSessionOrder: 1, weekdays: initialWeekdays }, ...prevHistory];
            }

            // Add/overwrite entry at firstUpdatedSessionOrder with new weekdays
            const newHistory = [
              ...baseHistory.filter(h => h.fromSessionOrder < firstUpdatedSessionOrder),
              { fromSessionOrder: firstUpdatedSessionOrder, weekdays: newUniqueWeekdays },
            ];

            await tx.execute(sql`UPDATE student_classes SET cycle_history = ${JSON.stringify(newHistory)}::jsonb WHERE id = ${sc.id}`);
          }
        }
      }
    }
    // === End update cycle_history ===

    // Update studentClasses totals only for affected students
    for (const studentId of affectedStudentIds) {
      const allStudentSessions = await tx.select({ sessionDate: classSessions.sessionDate })
        .from(studentSessions)
        .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
        .where(eq(studentSessions.studentId, studentId))
        .orderBy(asc(classSessions.sessionDate));

      if (allStudentSessions.length > 0) {
        await tx.update(studentClasses)
          .set({
            totalSessions: allStudentSessions.length,
            startDate: allStudentSessions[0].sessionDate,
            endDate: allStudentSessions[allStudentSessions.length - 1].sessionDate,
            updatedAt: new Date(),
          })
          .where(and(eq(studentClasses.classId, classId), eq(studentClasses.studentId, studentId)));
      }
    }
  });
}

// ---------------------------------------------------------------------------
// changeTeacher
// ---------------------------------------------------------------------------
export async function changeTeacher(params: {
  classId: string;
  newTeacherId: string;
  fromSessionId: string;
  toSessionId: string;
}): Promise<void> {
  const { classId, newTeacherId, fromSessionId, toSessionId } = params;

  const [fromSession] = await db.select().from(classSessions).where(eq(classSessions.id, fromSessionId));
  const [toSession] = await db.select().from(classSessions).where(eq(classSessions.id, toSessionId));

  if (!fromSession || !toSession) throw new Error("Không tìm thấy buổi học");
  if (fromSession.classId !== classId || toSession.classId !== classId) {
    throw new Error("Buổi học không thuộc lớp này");
  }

  const fromDate = fromSession.sessionDate;
  const toDate = toSession.sessionDate;

  if (new Date(fromDate) > new Date(toDate)) {
    throw new Error("Buổi kết thúc phải lớn hơn hoặc bằng buổi bắt đầu");
  }

  await db.transaction(async (tx) => {
    await tx.update(classSessions)
      .set({
        teacherIds: [newTeacherId],
        updatedAt: new Date(),
      })
      .where(and(
        eq(classSessions.classId, classId),
        sql`${classSessions.sessionDate} BETWEEN ${fromDate} AND ${toDate}`,
      ));

    await tx.update(classes)
      .set({ updatedAt: new Date() })
      .where(eq(classes.id, classId));

    if (fromDate === toDate) {
      await tx.update(studentSessions)
        .set({ updatedAt: new Date() })
        .where(eq(studentSessions.classSessionId, fromSessionId));
    }
  });
}

// ---------------------------------------------------------------------------
// removeStudentFromSessions
// ---------------------------------------------------------------------------
export async function removeStudentFromSessions(data: {
  studentIds: string[];
  studentClassId: string;
  fromSessionOrder: number;
  toSessionOrder: number;
}): Promise<{ hasAttendedSessions: boolean }> {
  const sessionsToDelete = await db.select()
    .from(studentSessions)
    .where(and(
      eq(studentSessions.studentClassId, data.studentClassId),
      inArray(studentSessions.studentId, data.studentIds),
      between(studentSessions.sessionOrder, data.fromSessionOrder, data.toSessionOrder),
    ));

  const attendedCount = sessionsToDelete.filter(s => s.attendanceStatus && s.attendanceStatus !== "pending").length;

  return { hasAttendedSessions: attendedCount > 0 };
}

// ---------------------------------------------------------------------------
// removeStudentFromSessionsConfirm
// ---------------------------------------------------------------------------
export async function removeStudentFromSessionsConfirm(data: {
  studentIds: string[];
  studentClassId: string;
  fromSessionOrder: number;
  toSessionOrder: number;
  deleteOnlyUnattended: boolean;
}): Promise<void> {
  await db.transaction(async (tx) => {
    let deleteConditions = and(
      eq(studentSessions.studentClassId, data.studentClassId),
      inArray(studentSessions.studentId, data.studentIds),
      between(studentSessions.sessionOrder, data.fromSessionOrder, data.toSessionOrder),
    );

    if (data.deleteOnlyUnattended) {
      deleteConditions = and(
        deleteConditions,
        sql`${studentSessions.attendanceStatus} IS NULL OR ${studentSessions.attendanceStatus} = 'pending'`,
      );
    }

    await tx.delete(studentSessions).where(deleteConditions);
  });

  // Tính lại attendedSessions dùng cấu hình fee rules (thay vì chỉ đếm 'present')
  await recalculateStudentClass(data.studentClassId);
}

export * from "./session-content.storage";
