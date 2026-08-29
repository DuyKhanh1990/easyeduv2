import { between } from "drizzle-orm";

import {
  db,
  eq, sql, and, inArray, asc, desc, gte,
  classSessions, studentClasses, studentSessions,
  classes, classSessionExclusions, sessionContents, students,
  invoices, invoiceItems, shiftTemplates, courseFeePackages,
  format, parseISO,
  getDayName,
} from "./base";

import { attendanceFeeRules } from "@shared/schema";

import type {
  ClassSession,
} from "./base";

import { getClass } from "./class.storage";
import { getNextLocationCode } from "./finance.storage";

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

  // Cascade: keep classes.startDate/endDate in sync with student lessons
  const [sc] = await conn.select({ classId: studentClasses.classId })
    .from(studentClasses)
    .where(eq(studentClasses.id, studentClassId));
  if (sc?.classId) {
    await recalculateClass(sc.classId, tx);
  }
}

// ---------------------------------------------------------------------------
// recalculateClass
// ---------------------------------------------------------------------------
// Synchronises classes.startDate / classes.endDate with the actual schedule.
// Priority:
//   1) MIN/MAX of student_classes.start_date/end_date for that class
//      (reflects the real lessons that students are scheduled for, regardless
//      of student status — dropped/paused students still count as long as
//      their sessions exist).
//   2) Fallback to MIN/MAX of class_sessions.session_date when the class has
//      no enrolled students yet (so the framework schedule is still shown).
//   3) NULL when there are no sessions at all.
export async function recalculateClass(classId: string, tx?: any): Promise<void> {
  const conn = tx ?? db;

  const studentRange = await conn.select({
    startDate: sql<string>`MIN(${studentClasses.startDate})`,
    endDate:   sql<string>`MAX(${studentClasses.endDate})`,
  })
  .from(studentClasses)
  .where(eq(studentClasses.classId, classId));

  let startDate: string | null = studentRange[0]?.startDate ?? null;
  let endDate: string | null = studentRange[0]?.endDate ?? null;

  if (!startDate || !endDate) {
    const sessionRange = await conn.select({
      startDate: sql<string>`MIN(${classSessions.sessionDate})`,
      endDate:   sql<string>`MAX(${classSessions.sessionDate})`,
    })
    .from(classSessions)
    .where(eq(classSessions.classId, classId));

    startDate = sessionRange[0]?.startDate ?? null;
    endDate   = sessionRange[0]?.endDate ?? null;
  }

  await conn.update(classes)
    .set({ startDate, endDate, updatedAt: new Date() })
    .where(eq(classes.id, classId));
}

// ---------------------------------------------------------------------------
// batchRecalculateStudentClasses
// ---------------------------------------------------------------------------
// Batch version of calling recalculateStudentClass N times for all students
// belonging to the same class. Reduces N×5 queries → ~5 queries total.
//
// Use when you need to recalculate every student in one class at once
// (e.g. after excludeClassSessions, deleteClassSessions, cancelClassSessions).
//
// conn: pass a drizzle transaction if inside tx; omit (or undefined) for plain db.
export async function batchRecalculateStudentClasses(
  scIds: string[],
  classId: string,
  conn?: any,
): Promise<void> {
  const db_ = conn ?? db;

  if (scIds.length === 0) {
    await recalculateClass(classId, conn);
    return;
  }

  // Fetch fee rules once (identical to what recalculateStudentClass does per-student)
  const feeRules = await db
    .select({ attendanceStatus: attendanceFeeRules.attendanceStatus })
    .from(attendanceFeeRules)
    .where(eq(attendanceFeeRules.deductsFee, true));
  const attendedStatuses = feeRules.map((r) => r.attendanceStatus);
  if (attendedStatuses.length === 0) attendedStatuses.push("present");
  const statusListSql = attendedStatuses
    .map((s) => `'${s.replace(/'/g, "''")}'`)
    .join(", ");

  // 1 GROUP BY query for all students (was N separate aggregate SELECTs)
  const allStats = await db_.select({
    studentClassId: studentSessions.studentClassId,
    startDate: sql<string>`MIN(${classSessions.sessionDate})`,
    endDate:   sql<string>`MAX(${classSessions.sessionDate})`,
    total:     sql<number>`COUNT(*)::int`,
    attended:  sql<number>`COUNT(CASE WHEN ${studentSessions.attendanceStatus} IN (${sql.raw(statusListSql)}) THEN 1 END)::int`,
  })
  .from(studentSessions)
  .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
  .where(inArray(studentSessions.studentClassId, scIds))
  .groupBy(studentSessions.studentClassId);

  const statsMap: Record<string, typeof allStats[number]> = {};
  for (const row of allStats) {
    if (row.studentClassId) statsMap[row.studentClassId] = row;
  }

  // 1 bulk UPDATE student_classes using VALUES list (was N separate UPDATEs)
  // Dates come from DB (ISO strings, safe). Counts are integers (safe). IDs are UUIDs (safe).
  const rows = scIds.map((id) => {
    const s = statsMap[id];
    const total    = s?.total    ?? 0;
    const attended = s?.attended ?? 0;
    const startDate = s?.startDate ? `'${s.startDate}'::date` : "NULL::date";
    const endDate   = s?.endDate   ? `'${s.endDate}'::date`   : "NULL::date";
    return `('${id}'::uuid, ${startDate}, ${endDate}, ${total}, ${attended}, ${total - attended})`;
  });

  await db_.execute(sql.raw(
    `UPDATE student_classes AS sc
     SET start_date          = v.start_date,
         end_date            = v.end_date,
         total_sessions      = v.total_sessions::int,
         attended_sessions   = v.attended_sessions::int,
         remaining_sessions  = v.remaining_sessions::int,
         updated_at          = NOW()
     FROM (VALUES ${rows.join(",")}) AS v(id, start_date, end_date, total_sessions, attended_sessions, remaining_sessions)
     WHERE sc.id = v.id::uuid`
  ));

  // recalculateClass once for the whole class (was called N times, same result every time)
  await recalculateClass(classId, conn);
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
export async function deleteClassSessions(
  classId: string,
  sessionId: string,
  deleteType: string,
  mode: string,
  orphanAction: "remove" | "waiting" = "remove",
): Promise<void> {
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

      // FIX: Re-index tất cả sessions còn lại bằng 1 SQL ROW_NUMBER() thay vì N UPDATE riêng lẻ.
      // Dùng session_date ASC làm thứ tự chuẩn (giống logic cũ), id ASC làm tie-breaker.
      await tx.execute(sql`
        UPDATE class_sessions cs
        SET session_index = ranked.rn
        FROM (
          SELECT id, ROW_NUMBER() OVER (ORDER BY session_date ASC, id ASC) AS rn
          FROM class_sessions
          WHERE class_id = ${classId}
        ) ranked
        WHERE cs.id = ranked.id
      `);

      // Lấy min/max date để cập nhật bảng classes (chỉ cần 2 giá trị, không cần fetch toàn bộ)
      const [dateRange] = await tx.select({
        minDate: sql<string | null>`MIN(${classSessions.sessionDate})`,
        maxDate: sql<string | null>`MAX(${classSessions.sessionDate})`,
        cnt: sql<number>`COUNT(*)::int`,
      }).from(classSessions).where(eq(classSessions.classId, classId));

      const actualStartDate = dateRange?.minDate ?? null;
      const actualEndDate = dateRange?.maxDate ?? null;
      const hasRemaining = (dateRange?.cnt ?? 0) > 0;

      await tx.update(classes)
        .set({ startDate: actualStartDate, endDate: actualEndDate, scheduleGenerated: hasRemaining, updatedAt: new Date() })
        .where(eq(classes.id, classId));

      const studentsInClass = await tx.select().from(studentClasses).where(eq(studentClasses.classId, classId));
      const allScIds = studentsInClass.map(sc => sc.id);

      // Detect students who no longer have any sessions after the deletion.
      const scIdsWithSessions = allScIds.length > 0
        ? (await tx.selectDistinct({ studentClassId: studentSessions.studentClassId })
            .from(studentSessions)
            .where(inArray(studentSessions.studentClassId, allScIds)))
            .map(r => r.studentClassId).filter((id): id is string => !!id)
        : [];
      const scIdsWithSessionsSet = new Set(scIdsWithSessions);
      const scIdsWithoutSessions = allScIds.filter(id => !scIdsWithSessionsSet.has(id));

      if (scIdsWithoutSessions.length > 0) {
        if (orphanAction === "waiting") {
          await tx.update(studentClasses)
            .set({
              status: "waiting",
              startDate: null,
              endDate: null,
              totalSessions: 0,
              attendedSessions: 0,
              remainingSessions: 0,
              scheduledWeekdays: null,
              cycleHistory: null,
              updatedAt: new Date(),
            })
            .where(inArray(studentClasses.id, scIdsWithoutSessions));
        } else {
          await tx.delete(studentClasses).where(inArray(studentClasses.id, scIdsWithoutSessions));
        }
      } else {
        // No student became orphaned; the existing schedule metadata cleanup below still applies.
      }

      // Recalculate students who still have sessions.
      await batchRecalculateStudentClasses(scIdsWithSessions, classId, tx);

      if (deleteType !== "all") {

        // FIX: Batch fetch cycleHistory + scheduledWeekdays cho tất cả học viên trong 1 query
        // thay vì N SELECT riêng lẻ
        const allScData = allScIds.length > 0
          ? await tx.select({
              id: studentClasses.id,
              scheduledWeekdays: studentClasses.scheduledWeekdays,
              cycleHistory: sql<any>`cycle_history`,
            }).from(studentClasses).where(inArray(studentClasses.id, allScIds))
          : [];

        // FIX: Batch fetch MAX(sessionOrder) cho tất cả học viên trong 1 query thay vì N queries
        const maxOrderRows = allScIds.length > 0
          ? await tx.select({
              studentClassId: studentSessions.studentClassId,
              maxOrder: sql<number>`MAX(${studentSessions.sessionOrder})`,
            }).from(studentSessions)
              .where(inArray(studentSessions.studentClassId, allScIds))
              .groupBy(studentSessions.studentClassId)
          : [];
        const maxOrderMap: Record<string, number> = {};
        for (const r of maxOrderRows) {
          if (r.studentClassId) maxOrderMap[r.studentClassId] = r.maxOrder ?? 0;
        }

        // Xử lý cycle_history restore cho từng học viên (tính toán in-memory, chỉ update khi cần)
        for (const scData of allScData) {
          const history: Array<{ fromSessionOrder: number; weekdays: number[] | null }> =
            Array.isArray(scData.cycleHistory) ? scData.cycleHistory : [];

          if (history.length === 0) continue;

          const newLastOrder: number = maxOrderMap[scData.id] ?? 0;

          // Prune history entries beyond the new last session order
          const prunedHistory = history.filter(h => h.fromSessionOrder <= newLastOrder);

          // Active cycle = entry với fromSessionOrder lớn nhất mà còn <= newLastOrder
          let activeWeekdays: number[] | null = null;
          if (prunedHistory.length > 0) {
            const sorted = [...prunedHistory].sort((a, b) => b.fromSessionOrder - a.fromSessionOrder);
            activeWeekdays = sorted[0].weekdays;
          }

          // Chỉ update nếu có thay đổi thực sự
          const currentWeekdays = scData.scheduledWeekdays as number[] | null;
          const currentSerialized = JSON.stringify((currentWeekdays ?? []).slice().sort((a, b) => a - b));
          const activeSerialized = JSON.stringify((activeWeekdays ?? []).slice().sort((a, b) => a - b));

          if (prunedHistory.length !== history.length || currentSerialized !== activeSerialized) {
            await tx.update(studentClasses)
              .set({ scheduledWeekdays: activeWeekdays ?? [], updatedAt: new Date() })
              .where(eq(studentClasses.id, scData.id));
            await tx.execute(
              sql`UPDATE student_classes SET cycle_history = ${JSON.stringify(prunedHistory)}::jsonb WHERE id = ${scData.id}`
            );
          }
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

    // FIX: Batch fetch dates của tất cả old sessions trong 1 query (thay vì N SELECT riêng lẻ)
    const oldClassSessionIds = oldSessions.map(s => s.classSessionId);
    const oldCsRows = await tx
      .select({ id: classSessions.id, sessionDate: classSessions.sessionDate })
      .from(classSessions)
      .where(inArray(classSessions.id, oldClassSessionIds));
    const oldCsDateMap: Record<string, string> = {};
    for (const row of oldCsRows) oldCsDateMap[row.id] = row.sessionDate;

    // FIX: Tính toán tất cả records trong JS rồi bulk insert 1 lần (thay vì N INSERT riêng lẻ)
    const newSSRows = targetClassSessions.map((cs, i) => {
      const oldSession = oldSessions[i];
      const oldDate = oldCsDateMap[oldSession.classSessionId];
      const oldDateStr = oldDate ? format(new Date(oldDate), "d/M/yyyy") : "";
      return {
        studentId: data.studentId,
        classId: data.toClassId,
        studentClassId: targetStudentClass.id,
        classSessionId: cs.id,
        status: "scheduled" as const,
        attendanceStatus: "pending" as const,
        note: `Chuyển từ lớp ${fromClass?.name || data.fromClassId}\nBuổi ${oldSession.sessionIndex} - ${oldDateStr}`,
      };
    });
    await tx.insert(studentSessions).values(newSSRows);

    // FIX: Cập nhật tất cả old sessions thành "transferred" trong 1 CASE WHEN SQL
    // (thay vì N UPDATE riêng lẻ). Note khác nhau từng row nên cần CASE WHEN.
    // UUIDs là safe. Class names được escape single-quote theo chuẩn PostgreSQL ('').
    const oldSessionUpdates = targetClassSessions.map((cs, i) => {
      const oldSession = oldSessions[i];
      const targetDateStr = format(new Date(cs.sessionDate), "d/M/yyyy");
      return {
        id: oldSession.id,
        note: `Chuyển sang lớp ${toClass?.name || data.toClassId}\nBuổi ${cs.sessionIndex} - ${targetDateStr}`,
      };
    });

    if (oldSessionUpdates.length > 0) {
      const caseWhen = oldSessionUpdates
        .map(u => `WHEN '${u.id}' THEN '${u.note.replace(/'/g, "''")}'`)
        .join(" ");
      const inList = oldSessionUpdates.map(u => `'${u.id}'`).join(",");
      await tx.execute(sql.raw(
        `UPDATE student_sessions SET status = 'transferred', note = CASE id ${caseWhen} END, updated_at = NOW() WHERE id IN (${inList})`
      ));
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
  overrideClassWeekdays?: number[];
  useStudentCycle?: boolean;
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
    for (const sid of studentsNeedingInvoice) {
      invoiceCodeMap[sid] = await getNextLocationCode(cls.locationId, "PT");
    }
  }

  // For mode="class": snapshot the class's last session date ONCE before any student is
  // processed. If we re-query inside the loop, sessions created for the first student
  // would shift the starting point for subsequent students, causing them to be enrolled
  // in sessions far beyond where they should start.
  let classLastSessionDateSnapshot: Date | null = null;
  if (data.mode === "class") {
    const res = await db.select({ date: classSessions.sessionDate })
      .from(classSessions)
      .where(eq(classSessions.classId, data.classId))
      .orderBy(sql`${classSessions.sessionDate} DESC`)
      .limit(1);
    classLastSessionDateSnapshot = res[0] ? new Date(res[0].date) : new Date(cls.startDate);
  }
  console.log("[DEBUG-EXTEND] mode=%s useStudentCycle=%s overrideClassWeekdays=%j numSessions=%s classLastSessionDateSnapshot=%s",
    data.mode, data.useStudentCycle, data.overrideClassWeekdays, data.numSessions,
    classLastSessionDateSnapshot?.toISOString());

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

    // ── Pre-loop batch fetches (replaces 2 queries/student) ────────────────
    // 1. Fetch all student_classes records for this class in one query
    const allSCRows = await tx
      .select()
      .from(studentClasses)
      .where(and(eq(studentClasses.classId, data.classId), inArray(studentClasses.studentId, data.studentIds)));
    const scByStudentId: Record<string, typeof allSCRows[0]> = {};
    for (const row of allSCRows) scByStudentId[row.studentId] = row;

    // 2. For mode="student": fetch last session date per student in one GROUP BY query
    const lastSessionDateByStudent: Record<string, Date> = {};
    if (data.mode === "student") {
      const lastDates = await tx
        .select({
          studentId: studentSessions.studentId,
          lastDate: sql<string>`MAX(${classSessions.sessionDate})`,
        })
        .from(studentSessions)
        .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
        .where(and(
          inArray(studentSessions.studentId, data.studentIds),
          eq(studentSessions.classId, data.classId),
        ))
        .groupBy(studentSessions.studentId);
      for (const row of lastDates) {
        if (row.studentId && row.lastDate) lastSessionDateByStudent[row.studentId] = new Date(row.lastDate);
      }
    }

    // Collect sc.id values to batch-recalculate after the loop
    const processedScIds: string[] = [];

    for (const studentId of data.studentIds) {
      const sc = scByStudentId[studentId];
      if (!sc) continue;

      let lastSessionDate: Date;
      if (data.mode === "class") {
        // Use the pre-computed snapshot so all students share the same starting point.
        lastSessionDate = classLastSessionDateSnapshot ?? new Date(cls.startDate);
      } else {
        lastSessionDate = lastSessionDateByStudent[studentId] ?? new Date(sc.startDate || cls.startDate);
      }

      const targetSessions = data.numSessions || 0;
      const endDateLimit = data.endDate ? new Date(data.endDate) : null;
      // Normalize endDateLimit to end of day (inclusive)
      if (endDateLimit) endDateLimit.setHours(23, 59, 59, 999);

      // Full cycle weekdays — used to create class sessions so the schedule stays intact.
      // Always the complete set of days for this extension cycle.
      const classSessionWeekdays: number[] =
        (data.overrideClassWeekdays && data.overrideClassWeekdays.length > 0)
          ? data.overrideClassWeekdays
          : (cls.weekdays as number[]);

      // Student session weekdays — the subset the student actually attends.
      // Priority:
      //   1. useStudentCycle=true  → use this student's own scheduledWeekdays from student_classes
      //   2. cycleMode="specific"  → use the manually selected shift days
      //   3. default               → all days of the full continuation cycle
      const studentSessionWeekdays: number[] = (() => {
        if (data.useStudentCycle) {
          const sw = sc.scheduledWeekdays as number[] | null;
          return (sw && sw.length > 0) ? sw : classSessionWeekdays;
        }
        if (data.cycleMode === "specific" && (data.specificShiftIds || []).length > 0) {
          return (data.specificShiftIds || []).map(Number);
        }
        return classSessionWeekdays;
      })();

      console.log("[DEBUG-EXTEND] student=%s lastSessionDate=%s studentSessionWeekdays=%j classSessionWeekdays=%j",
        studentId, lastSessionDate.toISOString(), studentSessionWeekdays, classSessionWeekdays);
      // ── BATCH approach: pre-calculate all dates in JS, then bulk-fetch / bulk-insert ──
      // Replaces the old day-by-day while loop that issued 3-5 DB round-trips per session.

      // Step 1: calculate every candidate date in pure JS (no DB needed)
      type CandidateDay = { dateStr: string; dbWeekday: number; isStudentDay: boolean };
      const candidateDays: CandidateDay[] = [];
      {
        let studentDayCount = 0;
        let checkDate = new Date(lastSessionDate);
        const SAFEGUARD = 3650;
        let iterations = 0;
        while (true) {
          checkDate.setDate(checkDate.getDate() + 1);
          iterations++;
          if (iterations >= SAFEGUARD) break;
          if (endDateLimit && checkDate > endDateLimit) break;
          if (!endDateLimit && studentDayCount >= targetSessions) break;

          const weekday = checkDate.getDay();
          const dbWeekday = weekday === 0 ? 0 : weekday;
          if (!classSessionWeekdays.includes(dbWeekday)) continue;

          const isStudentDay = studentSessionWeekdays.includes(dbWeekday);
          candidateDays.push({ dateStr: checkDate.toISOString().split("T")[0], dbWeekday, isStudentDay });
          if (isStudentDay) studentDayCount++;
        }
      }

      // Step 2: bulk-fetch existing class sessions for all candidate dates (1 query)
      const allDateStrs = candidateDays.map((d) => d.dateStr);
      const existingCSRows = allDateStrs.length > 0
        ? await tx.select().from(classSessions).where(
            and(eq(classSessions.classId, data.classId), inArray(classSessions.sessionDate, allDateStrs))
          )
        : [];
      const existingCSMap: Record<string, typeof existingCSRows[0]> = {};
      for (const row of existingCSRows) existingCSMap[row.sessionDate] = row;

      // Step 3: batch-insert any missing class sessions (1 query)
      const missingDays = candidateDays.filter((d) => !existingCSMap[d.dateStr]);
      if (missingDays.length > 0) {
        const [maxRow] = await tx
          .select({ maxIdx: sql<number>`MAX(${classSessions.sessionIndex})` })
          .from(classSessions)
          .where(eq(classSessions.classId, data.classId));
        let nextIdx = (maxRow?.maxIdx || 0) + 1;

        const toInsert = missingDays.map((d) => ({
          classId: data.classId,
          sessionDate: d.dateStr,
          weekday: d.dbWeekday === 0 ? 7 : d.dbWeekday,
          shiftTemplateId: (cls.shiftTemplateIds || [])[0] || null,
          roomId: cls.roomId || "00000000-0000-0000-0000-000000000000",
          teacherIds: cls.teacherIds && cls.teacherIds.length > 0 ? cls.teacherIds : null,
          sessionIndex: nextIdx++,
          status: "scheduled" as const,
        }));

        const inserted = await tx.insert(classSessions).values(toInsert).returning();
        for (const row of inserted) existingCSMap[row.sessionDate] = row;
      }

      // Step 4: collect class session IDs for student-days only
      const studentDayCsIds = candidateDays
        .filter((d) => d.isStudentDay)
        .map((d) => existingCSMap[d.dateStr]?.id)
        .filter((id): id is string => !!id);

      // Step 5: bulk-fetch existing student sessions to detect duplicates (1 query)
      const existingSSSet = new Set<string>();
      if (studentDayCsIds.length > 0) {
        const existingSS = await tx
          .select({ classSessionId: studentSessions.classSessionId })
          .from(studentSessions)
          .where(and(
            eq(studentSessions.studentId, studentId),
            inArray(studentSessions.classSessionId, studentDayCsIds),
          ));
        for (const row of existingSS) {
          if (row.classSessionId) existingSSSet.add(row.classSessionId);
        }
      }

      // Step 6: compute package info once per student (not once per session)
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

      // Step 7: batch-insert new student sessions (1 query)
      const ssToInsert = candidateDays
        .filter((d) => d.isStudentDay)
        .map((d) => existingCSMap[d.dateStr])
        .filter((cs): cs is typeof existingCSRows[0] => !!cs && !existingSSSet.has(cs.id));

      if (ssToInsert.length > 0) {
        await tx.insert(studentSessions).values(
          ssToInsert.map((cs) => ({
            studentId,
            classId: data.classId,
            studentClassId: sc.id,
            classSessionId: cs.id,
            status: "scheduled" as const,
            attendanceStatus: "pending" as const,
            packageId: pkgId,
            packageType: pkgType,
            sessionPrice: sessPrice,
            note: data.extensionName ? `Gia hạn: ${data.extensionName}` : "Gia hạn",
          }))
        );
      }

      // Maintain counters used by cycle-history logic below
      const createdForStudent = candidateDays.filter((d) => d.isStudentDay).length;
      const insertedForStudent = ssToInsert.length;

      // Collect for batch-recalculate after the loop (replaces N × recalculateStudentClass calls)
      processedScIds.push(sc.id);

      // When override mode (useStudentCycle=false) is active, update cycle_history and
      // scheduledWeekdays so the "Chu kỳ" column displays the correct new cycle for
      // the extended sessions.  Without this, a student who was T2-only but is now being
      // extended with "Tất cả" would still show T2/T4 per-session instead of "Tất cả".
      // Use createdForStudent (not insertedForStudent) so the cycle update also fires
      // when the extension is re-run and all student sessions already exist (no new inserts).
      if (!data.useStudentCycle && createdForStudent > 0) {
        // New effective weekdays: null means "Tất cả" (all days of the cycle).
        // For cycleMode="specific", use the explicitly selected days.
        const newWeekdays: number[] | null =
          (data.cycleMode === "all") ? null : studentSessionWeekdays;

        // Check if the cycle is actually changing for this student
        const currentWeekdays = sc.scheduledWeekdays as number[] | null;
        const currentIsAll = !currentWeekdays || currentWeekdays.length === 0;
        const newIsAll = !newWeekdays || newWeekdays.length === 0;
        const cycleChanged =
          currentIsAll !== newIsAll ||
          (!currentIsAll && !newIsAll &&
            JSON.stringify([...currentWeekdays!].sort((a, b) => a - b)) !==
            JSON.stringify([...newWeekdays!].sort((a, b) => a - b)));

        if (cycleChanged) {
          // Renumber sessionOrder for all student sessions in date order —
          // single SQL UPDATE with a ROW_NUMBER() CTE instead of N sequential UPDATEs.
          await tx.execute(sql`
            WITH ranked AS (
              SELECT ss.id,
                     ROW_NUMBER() OVER (ORDER BY cs.session_date ASC, ss.created_at ASC) AS rn
              FROM student_sessions ss
              INNER JOIN class_sessions cs ON ss.class_session_id = cs.id
              WHERE ss.student_class_id = ${sc.id}
            )
            UPDATE student_sessions
            SET session_order = ranked.rn
            FROM ranked
            WHERE student_sessions.id = ranked.id
          `);

          // We still need the total count for firstNewSessionOrder — fetch it cheaply.
          const [countRow] = await tx
            .select({ cnt: sql<number>`COUNT(*)` })
            .from(studentSessions)
            .where(eq(studentSessions.studentClassId, sc.id));
          const totalCount = Number(countRow?.cnt ?? 0);

          // First new session order = (total sessions) - (sessions in this extension) + 1
          const firstNewSessionOrder = Math.max(1, totalCount - createdForStudent + 1);

          // Build cycle_history — same pattern as the changeCycle code path
          const [currentScData] = await tx
            .select({ scheduledWeekdays: studentClasses.scheduledWeekdays, cycleHistory: sql<any>`cycle_history` })
            .from(studentClasses)
            .where(eq(studentClasses.id, sc.id));
          const prevHistory: Array<{ fromSessionOrder: number; weekdays: number[] | null }> =
            (currentScData?.cycleHistory as any) ?? [];

          const newHistoryEntry = { fromSessionOrder: firstNewSessionOrder, weekdays: newWeekdays };
          let baseHistory = prevHistory;
          const hasEarlierEntry = prevHistory.some((h) => h.fromSessionOrder < firstNewSessionOrder);
          if (!hasEarlierEntry && firstNewSessionOrder > 1) {
            const initialWeekdays =
              currentScData?.scheduledWeekdays && currentScData.scheduledWeekdays.length > 0
                ? currentScData.scheduledWeekdays
                : null;
            baseHistory = [{ fromSessionOrder: 1, weekdays: initialWeekdays }, ...prevHistory];
          }
          const newHistory = [
            ...baseHistory.filter((h) => h.fromSessionOrder < firstNewSessionOrder),
            newHistoryEntry,
          ];

          await tx.update(studentClasses)
            .set({ scheduledWeekdays: newWeekdays ?? [], updatedAt: new Date() })
            .where(eq(studentClasses.id, sc.id));
          await tx.execute(
            sql`UPDATE student_classes SET cycle_history = ${JSON.stringify(newHistory)}::jsonb WHERE id = ${sc.id}`
          );
        }
      }

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

    // ── Batch-recalculate all processed students in one pass ───────────────
    // Replaces N calls to recalculateStudentClass (each doing 3–4 queries)
    // with batchRecalculateStudentClasses (2 queries total regardless of N).
    if (processedScIds.length > 0) {
      await batchRecalculateStudentClasses(processedScIds, data.classId, tx);
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

        // Create a studentClasses record in the new makeup class so the student
        // appears in the "Học viên chính thức" tab and the count is correct.
        const firstSessionDate = newScheduleSessionIds.length > 0
          ? (await tx.select({ sessionDate: classSessions.sessionDate })
              .from(classSessions)
              .where(eq(classSessions.id, newScheduleSessionIds[0]))
              .limit(1))[0]?.sessionDate ?? format(new Date(), "yyyy-MM-dd")
          : format(new Date(), "yyyy-MM-dd");

        // Check if studentClasses record already exists (idempotent)
        const [existingNewSC] = await tx.select()
          .from(studentClasses)
          .where(and(
            eq(studentClasses.classId, newScheduleClassId),
            eq(studentClasses.studentId, studentId),
          ));

        let newSCId: string;
        if (existingNewSC) {
          newSCId = existingNewSC.id;
        } else {
          const [newSC] = await tx.insert(studentClasses).values({
            studentId,
            classId: newScheduleClassId,
            status: "active",
            startDate: firstSessionDate,
            createdBy: userId,
          }).returning({ id: studentClasses.id });
          newSCId = newSC.id;
        }

        // Schedule student in all newly created sessions, linked to the studentClasses record
        for (const sessionId of newScheduleSessionIds) {
          await tx.insert(studentSessions).values({
            studentId,
            classId: newScheduleClassId,
            studentClassId: newSCId,
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

        // Recalculate the new studentClasses record (totalSessions, startDate, endDate, etc.)
        await recalculateStudentClass(newSCId, tx);
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
    // Use caller-provided override (from cycle selector) when available
    const sourceWeekdays = (data.overrideClassWeekdays && data.overrideClassWeekdays.length > 0)
      ? data.overrideClassWeekdays
      : (clsInfo?.weekdays || []);
    const classDbWeekdays: number[] = sourceWeekdays.map((w: number) => w === 0 ? 7 : w);

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
  // Fetch the class session's weekday so we can use it as a fallback for legacy data
  // where cycle_history was not written (older cycle-update bug).
  const [classSessionInfo] = await db
    .select({ weekday: classSessions.weekday })
    .from(classSessions)
    .where(eq(classSessions.id, classSessionId));
  const sessionWeekday: number | null = classSessionInfo?.weekday ?? null;

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
          cycleHistory: studentClasses.cycleHistory,
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

    // Check cycle_history FIRST — before falling back to the current scheduledWeekdays.
    // This is critical when a renewal changed the student from a specific cycle (e.g. T2)
    // to "Tất cả": scheduledWeekdays becomes [] but cycle_history correctly records
    // the old cycle for earlier sessions and the new cycle for renewed sessions.
    const history = sc.cycleHistory;
    if (history && history.length > 0 && s.sessionOrder != null) {
      const applicableEntries = history
        .filter((h) => h.fromSessionOrder <= s.sessionOrder!)
        .sort((a, b) => b.fromSessionOrder - a.fromSessionOrder);
      if (applicableEntries.length > 0) {
        return { ...s, scheduledWeekdays: applicableEntries[0].weekdays ?? null };
      }
      // history exists but no entry covers this session (session is before all history entries).
      // Fall back to the student's current scheduledWeekdays.
      return { ...s, scheduledWeekdays: sc.scheduledWeekdays ?? null };
    }

    // Students with no custom cycle attend all sessions → scheduledWeekdays = null (Tất cả)
    if (!sc.scheduledWeekdays || sc.scheduledWeekdays.length === 0) {
      return { ...s, scheduledWeekdays: null };
    }

    // No cycle_history. Check if this session's actual weekday is outside the student's
    // original scheduledWeekdays — this happens when a cycle update moved the student
    // to a new day but cycle_history was not written (legacy data from older bug).
    // In that case, derive the effective cycle from the session's actual weekday.
    if (sessionWeekday != null && !sc.scheduledWeekdays.includes(sessionWeekday)) {
      return { ...s, scheduledWeekdays: [sessionWeekday] };
    }

    return { ...s, scheduledWeekdays: sc.scheduledWeekdays };
  });
}

// ---------------------------------------------------------------------------
// getClassCycles
// Detects distinct weekday-cycle patterns used across class sessions.
// Returns patterns in chronological order with session-index ranges.
// ---------------------------------------------------------------------------
export async function getClassCycles(classId: string): Promise<Array<{
  weekdays: number[];
  fromSessionIndex: number;
  toSessionIndex: number | null;
  label: string;
}>> {
  const DAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

  // --- Primary path: read from stored cycle_history ---
  const [classRecord] = await db
    .select({ cycleHistory: classes.cycleHistory })
    .from(classes)
    .where(eq(classes.id, classId));

  const storedHistory = classRecord?.cycleHistory as Array<{ fromSessionIndex: number; weekdays: number[] }> | null;

  if (storedHistory && Array.isArray(storedHistory) && storedHistory.length > 0) {
    const sorted = [...storedHistory].sort((a, b) => a.fromSessionIndex - b.fromSessionIndex);
    return sorted.map((entry, idx) => {
      const next = sorted[idx + 1];
      const toSessionIndex = next ? next.fromSessionIndex - 1 : null;
      const wdLabel = entry.weekdays.map(w => DAY_LABELS[w] ?? `T${w}`).join(", ");
      const toLabel = toSessionIndex != null ? `Buổi ${toSessionIndex}` : "hiện tại";
      return {
        weekdays: entry.weekdays,
        fromSessionIndex: entry.fromSessionIndex,
        toSessionIndex,
        label: `${wdLabel} (Buổi ${entry.fromSessionIndex} → ${toLabel})`,
      };
    });
  }

  // --- Fallback: infer from session weekday sequence (legacy data without stored history) ---
  const sessionRows = await db
    .select({ sessionIndex: classSessions.sessionIndex, weekday: classSessions.weekday })
    .from(classSessions)
    .where(eq(classSessions.classId, classId))
    .orderBy(asc(classSessions.sessionIndex));

  if (sessionRows.length === 0) return [];

  // Step 1: Detect cycle length — scan until a weekday is seen for the second time
  const seen = new Set<number>();
  let cycleLength = 1;
  for (let i = 0; i < sessionRows.length && i < 20; i++) {
    const wd = sessionRows[i].weekday;
    if (wd != null && seen.has(wd)) { cycleLength = seen.size; break; }
    if (wd != null) seen.add(wd);
    cycleLength = seen.size;
  }
  if (cycleLength < 1) cycleLength = 1;

  // Step 2: Scan sessions comparing each to its slot position in the current pattern.
  const cycles: Array<{ weekdays: number[]; fromSessionIndex: number; toSessionIndex: number | null }> = [];
  let currentPattern: number[] = [];
  let currentStart = sessionRows[0].sessionIndex ?? 1;
  let slotPos = 0;

  for (let i = 0; i < sessionRows.length; i++) {
    const s = sessionRows[i];
    const wd = s.weekday ?? 0;

    if (currentPattern.length < cycleLength) {
      currentPattern.push(wd);
      if (currentPattern.length === cycleLength) {
        const weekdays = [...new Set(currentPattern)].sort((a, b) => a - b);
        cycles.push({ weekdays, fromSessionIndex: currentStart, toSessionIndex: null });
        slotPos = 0;
      }
    } else {
      const expected = currentPattern[slotPos];
      if (wd !== expected) {
        if (cycles.length > 0) {
          cycles[cycles.length - 1].toSessionIndex = sessionRows[i - 1].sessionIndex ?? null;
        }
        currentPattern = [wd];
        currentStart = s.sessionIndex ?? (i + 1);
        slotPos = 0;
      } else {
        slotPos = (slotPos + 1) % cycleLength;
      }
    }
  }

  return cycles.map((c) => {
    const wdLabel = c.weekdays.map(w => DAY_LABELS[w] ?? `T${w}`).join(", ");
    const toLabel = c.toSessionIndex != null ? `Buổi ${c.toSessionIndex}` : "hiện tại";
    return { ...c, label: `${wdLabel} (Buổi ${c.fromSessionIndex} → ${toLabel})` };
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

    // FIX: Batch recalculate học viên bị ảnh hưởng → ~5 queries thay vì N×5 queries
    const affectedScIds = affectedStudentClasses
      .map(sc => sc.studentClassId)
      .filter((id): id is string => !!id);
    await batchRecalculateStudentClasses(affectedScIds, classId);
  }
}

// ---------------------------------------------------------------------------
// batchCaseIdUpdate — helper
// ---------------------------------------------------------------------------
// Executes a CASE … END batch UPDATE in chunks of `chunkSize` rows to avoid
// sending a single enormous SQL string to PostgreSQL (which is slow to parse
// for 20 000+ rows and can cause visible latency in long classes).
//
// Each chunk is executed on the SAME transaction object (`tx`), so atomicity
// is fully preserved: if any chunk throws, the caller's transaction rolls back.
//
// Parameters:
//   tx         — drizzle transaction (or db for non-transactional callers)
//   table      — unquoted table name, e.g. "student_sessions"
//   setCol     — column to update, e.g. "class_session_id"
//   moves      — array of { id, newId } where `id` is the match value
//   matchCol   — column used in CASE … and WHERE … IN (default: "id")
//   withUpdatedAt — whether to also set updated_at = NOW() (default: false)
//   chunkSize  — max rows per SQL statement (default: 5000)
async function batchCaseIdUpdate(
  tx: any,
  table: string,
  setCol: string,
  moves: { id: string; newId: string }[],
  options: { matchCol?: string; withUpdatedAt?: boolean } = {},
  chunkSize = 5000,
): Promise<void> {
  if (moves.length === 0) return;
  const matchCol = options.matchCol ?? 'id';
  const extraSet = options.withUpdatedAt ? ', updated_at = NOW()' : '';
  for (let i = 0; i < moves.length; i += chunkSize) {
    const chunk = moves.slice(i, i + chunkSize);
    const caseWhen = chunk.map(u => `WHEN '${u.id}'::uuid THEN '${u.newId}'::uuid`).join(' ');
    const inList  = chunk.map(u => `'${u.id}'::uuid`).join(',');
    await tx.execute(sql.raw(
      `UPDATE ${table} SET ${setCol} = CASE ${matchCol} ${caseWhen} END${extraSet} WHERE ${matchCol} IN (${inList})`
    ));
  }
}

// ---------------------------------------------------------------------------
// excludeClassSessions
// ---------------------------------------------------------------------------
export async function excludeClassSessions(params: { classId: string; fromSessionId: string; toSessionId: string; reason: string; userId: string; weekdays?: number[]; skipRecalculate?: boolean }): Promise<void> {
  const { classId, fromSessionId, toSessionId, reason, userId } = params;

  await db.transaction(async (tx) => {
    const [fromSession] = await tx.select().from(classSessions).where(eq(classSessions.id, fromSessionId));
    const [toSession] = await tx.select().from(classSessions).where(eq(classSessions.id, toSessionId));

    if (!fromSession || !toSession) throw new Error("Không tìm thấy buổi học");

    const fromOrder = fromSession.sessionIndex || 0;
    const toOrder = toSession.sessionIndex || 0;
    const shiftCount = toOrder - fromOrder + 1;

    // Bootstrap cycle_history for classes that were created before the cycle-memory feature.
    // We do this BEFORE any session modifications so the inference algorithm sees the correct order.
    {
      const [existingClass] = await tx.select({ cycleHistory: classes.cycleHistory })
        .from(classes).where(eq(classes.id, classId));
      if (!existingClass?.cycleHistory) {
        const allSessionRows = await tx
          .select({ sessionIndex: classSessions.sessionIndex, weekday: classSessions.weekday })
          .from(classSessions)
          .where(eq(classSessions.classId, classId))
          .orderBy(asc(classSessions.sessionIndex));
        if (allSessionRows.length > 0) {
          // Run the same inference algorithm used in getClassCycles fallback
          const seen = new Set<number>();
          let cycleLength = 1;
          for (let i = 0; i < allSessionRows.length && i < 20; i++) {
            const wd = allSessionRows[i].weekday;
            if (wd != null && seen.has(wd)) { cycleLength = seen.size; break; }
            if (wd != null) seen.add(wd);
            cycleLength = seen.size;
          }
          const inferredCycles: Array<{ fromSessionIndex: number; weekdays: number[] }> = [];
          let currentPattern: number[] = [];
          let currentStart = allSessionRows[0].sessionIndex ?? 1;
          let slotPos = 0;
          for (let i = 0; i < allSessionRows.length; i++) {
            const s = allSessionRows[i];
            const wd = s.weekday ?? 0;
            if (currentPattern.length < cycleLength) {
              currentPattern.push(wd);
              if (currentPattern.length === cycleLength) {
                inferredCycles.push({
                  fromSessionIndex: currentStart,
                  weekdays: [...new Set(currentPattern)].sort((a, b) => a - b),
                });
                slotPos = 0;
              }
            } else {
              const expected = currentPattern[slotPos];
              if (wd !== expected) {
                currentPattern = [wd];
                currentStart = s.sessionIndex ?? (i + 1);
                slotPos = 0;
              } else {
                slotPos = (slotPos + 1) % cycleLength;
              }
            }
          }
          if (inferredCycles.length > 0) {
            await tx.execute(sql`UPDATE classes SET cycle_history = ${JSON.stringify(inferredCycles)}::jsonb WHERE id = ${classId}`);
          }
        }
      }
    }

    // Determine weekdays for compensating sessions:
    // 1. Use caller-provided weekdays if explicitly passed (legacy support)
    // 2. Read from stored cycle_history (bootstrapped above if needed) — last entry = last cycle
    // 3. Fallback to classes.weekdays
    async function resolveCompensatingWeekdays(): Promise<number[]> {
      if (params.weekdays && params.weekdays.length > 0) return params.weekdays;
      const [classData] = await tx.select({ cycleHistory: classes.cycleHistory, weekdays: classes.weekdays }).from(classes).where(eq(classes.id, classId));
      const history = classData?.cycleHistory as Array<{ fromSessionIndex: number; weekdays: number[] }> | null;
      if (history && Array.isArray(history) && history.length > 0) {
        const lastEntry = [...history].sort((a, b) => b.fromSessionIndex - a.fromSessionIndex)[0];
        if (lastEntry.weekdays.length > 0) return lastEntry.weekdays;
      }
      return classData?.weekdays ?? [];
    }

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

    // Snapshot A: original sessionIndex → sessionId mapping (used later for content re-assignment).
    // Must be captured BEFORE Step 1 modifies sessionIndex values.
    const allOriginalSessions = await tx
      .select({ id: classSessions.id, sessionIndex: classSessions.sessionIndex })
      .from(classSessions)
      .where(eq(classSessions.classId, classId))
      .orderBy(asc(classSessions.sessionIndex));

    const originalPositionToSessionId = new Map<number, string>(
      allOriginalSessions
        .filter(s => s.sessionIndex != null)
        .map(s => [s.sessionIndex!, s.id])
    );

    // Snapshot B: all content records with their original sessionIndex.
    // Must be captured BEFORE Step 1 so we know each content's original curriculum position.
    const allClassContents = await tx
      .select({
        id: sessionContents.id,
        classSessionId: sessionContents.classSessionId,
        originalSessionIndex: classSessions.sessionIndex,
      })
      .from(sessionContents)
      .innerJoin(classSessions, eq(classSessions.id, sessionContents.classSessionId))
      .where(eq(classSessions.classId, classId));

    // Snapshot C: student_session records for non-excluded sessions with index >= fromOrder.
    // Must be captured BEFORE Step 4 to avoid picking up records that were already re-linked.
    // These will be re-linked in Step 5.6 to maintain curriculum-position ordering (same logic as Step 5.5).
    const excludedIdsFrag = excludedSessionIds.length > 0
      ? sql.raw(excludedSessionIds.map(id => `'${id}'`).join(','))
      : sql.raw("'00000000-0000-0000-0000-000000000000'");
    const nonExcludedShiftedStudentSessions = await tx
      .select({
        id: studentSessions.id,
        studentId: studentSessions.studentId,
        originalSessionIndex: classSessions.sessionIndex,
      })
      .from(studentSessions)
      .innerJoin(classSessions, eq(classSessions.id, studentSessions.classSessionId))
      .where(and(
        eq(classSessions.classId, classId),
        sql`${classSessions.sessionIndex} >= ${fromOrder}`,
        sql`${classSessions.id} != ALL(ARRAY[${excludedIdsFrag}]::uuid[])`,
      ));

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
      const weekdays = await resolveCompensatingWeekdays();
      if (weekdays.length > 0) {
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

    // Step 2b: Update class-level cycle_history to keep boundaries accurate after the shift.
    // Rules:
    //  - Entries BEFORE fromOrder: keep unchanged.
    //  - Entries IN [fromOrder, toOrder]: take the last one (highest index) and MOVE it to fromOrder.
    //    (Don't delete — the cycle it represents is still active for the shifted sessions that land there.)
    //  - Entries AFTER toOrder: subtract shiftCount.
    //  - Remove consecutive duplicates (same weekdays back-to-back).
    {
      const [existingClass] = await tx.select({ cycleHistory: classes.cycleHistory })
        .from(classes).where(eq(classes.id, classId));
      const existingHistory = (existingClass?.cycleHistory as Array<{ fromSessionIndex: number; weekdays: number[] }> | null) ?? [];
      if (existingHistory.length > 0) {
        const before = existingHistory.filter(h => h.fromSessionIndex < fromOrder);
        const inRange = [...existingHistory.filter(h => h.fromSessionIndex >= fromOrder && h.fromSessionIndex <= toOrder)]
          .sort((a, b) => b.fromSessionIndex - a.fromSessionIndex);
        const movedEntry = inRange.length > 0 ? { ...inRange[0], fromSessionIndex: fromOrder } : null;
        const after = existingHistory
          .filter(h => h.fromSessionIndex > toOrder)
          .map(h => ({ ...h, fromSessionIndex: h.fromSessionIndex - shiftCount }));

        let merged = [...before];
        if (movedEntry) merged.push(movedEntry);
        merged = [...merged, ...after].sort((a, b) => a.fromSessionIndex - b.fromSessionIndex);

        // Remove consecutive entries with identical weekdays (no-op boundaries)
        const deduped = merged.filter((entry, idx) => {
          if (idx === 0) return true;
          return JSON.stringify(entry.weekdays) !== JSON.stringify(merged[idx - 1].weekdays);
        });

        await tx.execute(sql`UPDATE classes SET cycle_history = ${JSON.stringify(deduped)}::jsonb WHERE id = ${classId}`);
      }
    }

    // Step 4: Re-link excluded sessions' student_sessions to maintain curriculum position.
    // Same curriculum-position algorithm as Step 5.5 for session_content:
    //   Excluded session at position X (always in [fromOrder, toOrder]):
    //     X <= N - shiftCount → re-link to the session originally at X + shiftCount (now shifted to X)
    //     X >  N - shiftCount → re-link to the compensating session created at position X
    // This ensures that after the exclusion, the attendance records remain at their original
    // curriculum position (e.g. "Buổi 2: có mặt" stays at position 2, not at a compensating slot).
    //
    // We also collect affectedStudentIds — students who had a session in the excluded range.
    // Step 5.6 will ONLY re-link sessions for these students, preventing incorrect moves for
    // weekday-specific students who had no session at the excluded positions.
    const affectedStudentIds = new Set<string>();
    if (excludedSessionIds.length > 0) {
      const N = originalLastSessionIndex;

      // Build moves: excludedSessionId → newSessionId (all at once, no per-row queries)
      const step4Moves: { oldSessionId: string; newSessionId: string }[] = [];
      for (const ex of excludedSessionsInfo) {
        const X = ex.sessionIndex ?? 0;
        let newSessionId: string | undefined;
        if (X <= N - shiftCount) {
          newSessionId = originalPositionToSessionId.get(X + shiftCount);
        } else {
          newSessionId = compensatingMap[X];
        }
        if (newSessionId) {
          step4Moves.push({ oldSessionId: ex.id, newSessionId });
        }
      }

      if (step4Moves.length > 0) {
        // 1 query to collect ALL affected student IDs (was N queries)
        const oldIds = step4Moves.map(m => m.oldSessionId);
        const affected = await tx
          .select({ studentId: studentSessions.studentId })
          .from(studentSessions)
          .where(inArray(studentSessions.classSessionId, oldIds));
        affected.forEach(r => affectedStudentIds.add(r.studentId));

        // Chunked batch UPDATE (≤5 000 rows/SQL) to avoid huge CASE WHEN strings for large classes
        await batchCaseIdUpdate(
          tx, 'student_sessions', 'class_session_id',
          step4Moves.map(m => ({ id: m.oldSessionId, newId: m.newSessionId })),
          { matchCol: 'class_session_id', withUpdatedAt: true },
        );
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

    // Step 5.5: Re-assign session contents to preserve curriculum order.
    //
    // Problem: when sessions shift up (excluded sessions removed), each remaining session
    // keeps its UUID — so its content moves with it to the new (lower) position.
    // Example: exclude session 2 from [B1(U1), B2(U2), B3(U3)]:
    //   B3 shifts to idx:2 carrying U3 → B2 ends up showing U3 (WRONG)
    //
    // Solution: re-assign content so it stays at its original CURRICULUM POSITION,
    // not its original session UUID.
    //
    // Algorithm (N = total sessions before exclusion):
    //   Content at original position X < fromOrder        → no change (session & content same UUID)
    //   Content at original position X ∈ [fromOrder, N-shiftCount]
    //       → move to the session originally at X+shiftCount (now shifted to X)
    //   Content at original position X > N-shiftCount
    //       → move to the compensating session at position X
    //
    // This step MUST run before Step 6 (delete) to prevent cascade deletion of re-assigned content.
    if (allClassContents.length > 0) {
      const N = originalLastSessionIndex;
      // Build moves in one pass, then batch-update (was N individual UPDATEs)
      const contentMoves: { id: string; newSessionId: string }[] = [];
      for (const content of allClassContents) {
        const X = content.originalSessionIndex ?? 0;
        if (X < fromOrder) continue; // Before excluded range: no change needed

        let newSessionId: string | undefined;
        if (X >= fromOrder && X <= N - shiftCount) {
          newSessionId = originalPositionToSessionId.get(X + shiftCount);
        } else {
          newSessionId = compensatingMap[X];
        }

        if (newSessionId) {
          contentMoves.push({ id: content.id, newSessionId });
        }
        // If newSessionId is undefined (edge case: no compensating session because
        // no weekdays were configured), the content will be cascade-deleted with
        // the excluded session — acceptable since no slot exists to place it.
      }

      if (contentMoves.length > 0) {
        // Chunked batch UPDATE (≤5 000 rows/SQL)
        await batchCaseIdUpdate(
          tx, 'session_contents', 'class_session_id',
          contentMoves.map(u => ({ id: u.id, newId: u.newSessionId })),
        );
      }
    }

    // Step 5.6: Re-link non-excluded sessions' student_sessions to maintain curriculum position.
    //
    // Problem: after Step 1 shifts session indexes, the non-excluded sessions that "move up"
    // carry their student_sessions (attendance records) to a lower position.
    // Example (exclude B2 from [B1(attended), B2(attended), B3(pending)]):
    //   B3 shifts to idx:2 carrying "pending" → position 2 shows "pending" (WRONG — B2 was attended)
    //
    // Solution: re-link each non-excluded student_session to the session that now occupies
    // its ORIGINAL curriculum position, using the same algorithm as Step 5.5.
    //
    // IMPORTANT: only process students in affectedStudentIds (those who had a session in the
    // excluded range). Weekday-specific students with NO session at the excluded positions must
    // NOT be moved — their sessions are at correct positions already and moving them would
    // re-link them to class sessions on the wrong weekday.
    //
    // Algorithm (N = total sessions before exclusion, using Snapshot C captured before Step 4):
    //   student_session at original position X < fromOrder     → no change
    //   student_session at original position X ∈ [fromOrder, N-shiftCount]
    //       → move to the session originally at X+shiftCount (now shifted to X)
    //   student_session at original position X > N-shiftCount
    //       → move to the compensating session at position X
    //
    // This step MUST run before Step 6 (delete) so the moved records are not cascade-deleted.
    if (nonExcludedShiftedStudentSessions.length > 0 && affectedStudentIds.size > 0) {
      const N = originalLastSessionIndex;
      // Build moves in one pass, then batch-update (was M individual UPDATEs)
      const ssMoves: { id: string; newSessionId: string }[] = [];
      for (const ss of nonExcludedShiftedStudentSessions) {
        // Only process students who had a session at the excluded range
        if (!affectedStudentIds.has(ss.studentId)) continue;

        const X = ss.originalSessionIndex ?? 0;
        if (X < fromOrder) continue;

        let newSessionId: string | undefined;
        if (X >= fromOrder && X <= N - shiftCount) {
          newSessionId = originalPositionToSessionId.get(X + shiftCount);
        } else {
          newSessionId = compensatingMap[X];
        }

        if (newSessionId) {
          ssMoves.push({ id: ss.id, newSessionId });
        }
      }

      if (ssMoves.length > 0) {
        // Chunked batch UPDATE (≤5 000 rows/SQL)
        await batchCaseIdUpdate(
          tx, 'student_sessions', 'class_session_id',
          ssMoves.map(u => ({ id: u.id, newId: u.newSessionId })),
          { withUpdatedAt: true },
        );
      }
    }

    // Step 6: Delete excluded class sessions.
    // Student sessions that could not be re-linked (no replacement found) are deleted here.
    // session_contents whose classSessionId was already re-assigned above are safe from cascade.
    await tx.delete(studentSessions)
      .where(inArray(studentSessions.classSessionId, excludedSessionIds));
    await tx.delete(classSessions)
      .where(inArray(classSessions.id, excludedSessionIds));
  });

  // Skip recalculate when caller will batch-recalculate after multiple ranges (e.g. bulk holiday apply).
  // Default (skipRecalculate = false/undefined) preserves existing behaviour for all other callers.
  if (!params.skipRecalculate) {
    const studentsInClass = await db.select({ id: studentClasses.id }).from(studentClasses).where(eq(studentClasses.classId, classId));
    // FIX: Batch recalculate tất cả học viên trong 1 lớp → ~5 queries thay vì N×5 queries
    await batchRecalculateStudentClasses(studentsInClass.map(sc => sc.id), classId);
  }
}

// ---------------------------------------------------------------------------
// updateClassSession
// ---------------------------------------------------------------------------
export async function updateClassSession(id: string, updates: any): Promise<ClassSession> {
  const { sessionDate, shiftTemplateId, roomId, teacherIds, changeReason, changedBy } = updates;

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
      roomId: roomId ?? existing.roomId,
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
  startDate: string;
  weekdays: number[];
  weekdayConfigs: Record<number, { shiftTemplateId: string; teacherIds: string[]; roomId?: string }>;
  reason: string;
  userId: string;
}): Promise<void> {
  const { fromSessionId, startDate, weekdays, weekdayConfigs, reason, userId } = data;

  const [fromSession] = await db.select().from(classSessions).where(and(
    eq(classSessions.id, fromSessionId),
    eq(classSessions.classId, classId),
  ));
  const [toSession] = await db.select().from(classSessions)
    .where(eq(classSessions.classId, classId))
    .orderBy(desc(classSessions.sessionIndex))
    .limit(1);

  if (!fromSession || !toSession) throw new Error("Không tìm thấy buổi học");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    throw new Error("Ngày bắt đầu không hợp lệ");
  }

  const fromIndex = fromSession.sessionIndex || 0;
  const toIndex = toSession.sessionIndex || 0;

  if (fromIndex > toIndex) throw new Error("Buổi bắt đầu phải nhỏ hơn hoặc bằng buổi kết thúc");

  const [classRecord] = await db.select({ evaluationCriteriaIds: classes.evaluationCriteriaIds }).from(classes).where(eq(classes.id, classId));

  await db.transaction(async (tx) => {
    const sessionsInRange = await tx.select().from(classSessions).where(and(
      eq(classSessions.classId, classId),
      between(classSessions.sessionIndex, fromIndex, toIndex),
    ));

    // Validate completed sessions (in-memory, no extra query needed)
    for (const s of sessionsInRange) {
      if (s.status === "completed") {
        throw new Error(`Buổi ${s.sessionIndex} đã hoàn thành, không thể cập nhật chu kỳ`);
      }
    }

    // Validate attendance: 1 batch query thay vì N queries riêng lẻ
    const rangeSessionIds = sessionsInRange.map(s => s.id);
    if (rangeSessionIds.length > 0) {
      const attendedSessions = await tx
        .select({ classSessionId: studentSessions.classSessionId })
        .from(studentSessions)
        .where(and(
          inArray(studentSessions.classSessionId, rangeSessionIds),
          sql`${studentSessions.status} != 'scheduled'`,
        ))
        .limit(1);
      if (attendedSessions.length > 0) {
        const attendedId = attendedSessions[0].classSessionId;
        const s = sessionsInRange.find(s => s.id === attendedId);
        throw new Error(`Buổi ${s?.sessionIndex ?? "?"} đã có dữ liệu điểm danh, không thể cập nhật chu kỳ`);
      }
    }

    const sessionIds = sessionsInRange.map(s => s.id);

    // Before deleting, capture which students were enrolled in each session (by sessionIndex)
    // Also preserve fee-related fields and session content so they survive the cycle update
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
    const contentIdsBySessionIndex: Record<number, string[]> = {};
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

      // Keep the existing session_content IDs and move them to the replacement
      // class session with the same sessionIndex. This also preserves
      // student_session_contents (submissions, scores, comments, etc.) because
      // those rows reference sessionContents.id rather than classSessions.id.
      const existingSessionContents = await tx
        .select({
          id: sessionContents.id,
          classSessionId: sessionContents.classSessionId,
        })
        .from(sessionContents)
        .where(inArray(sessionContents.classSessionId, sessionIds));

      for (const content of existingSessionContents) {
        const session = sessionsInRange.find((s) => s.id === content.classSessionId);
        if (session && session.sessionIndex != null) {
          if (!contentIdsBySessionIndex[session.sessionIndex]) {
            contentIdsBySessionIndex[session.sessionIndex] = [];
          }
          contentIdsBySessionIndex[session.sessionIndex].push(content.id);
        }
      }

      await tx.delete(studentSessions).where(inArray(studentSessions.classSessionId, sessionIds));
    }

    // Build all session records in JS first, then bulk insert once
    const firstDate = new Date(`${startDate}T00:00:00`);
    if (Number.isNaN(firstDate.getTime())) {
      throw new Error("Ngày bắt đầu không hợp lệ");
    }
    // The selected date is a lower bound, not necessarily a valid cycle day.
    // For example, selecting Saturday 25/07 for a Mon/Wed/Fri cycle must
    // start on the next cycle day, Monday 27/07.
    while (!weekdays.includes(firstDate.getDay())) {
      firstDate.setDate(firstDate.getDate() + 1);
    }
    const formatDateOnly = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };
    let currentDate = firstDate;
    const sessionsToInsert: Array<{
      classId: string;
      sessionIndex: number;
      sessionDate: string;
      weekday: number;
      shiftTemplateId: string;
      teacherIds: string[] | null;
      roomId: string;
      status: "scheduled";
      changeReason: string;
      changedAt: Date;
      changedBy: string;
      updatedAt: Date;
      evaluationCriteriaIds: string[] | null;
    }> = [];

    for (let i = fromIndex; i <= toIndex; i++) {
      if (i !== fromIndex) {
        currentDate.setDate(currentDate.getDate() + 1);
        while (!weekdays.includes(currentDate.getDay())) {
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }

      const wd = currentDate.getDay();
      const config = weekdayConfigs[wd];
      if (!config?.shiftTemplateId) {
        throw new Error(`Chưa cấu hình ca học cho ${wd === 0 ? "CN" : `T${wd + 1}`}`);
      }

      sessionsToInsert.push({
        classId,
        sessionIndex: i,
        sessionDate: formatDateOnly(currentDate),
        weekday: wd,
        shiftTemplateId: config.shiftTemplateId,
        teacherIds: config.teacherIds && config.teacherIds.length > 0 ? config.teacherIds : null,
        roomId: config.roomId || fromSession.roomId,
        status: "scheduled",
        changeReason: reason,
        changedAt: new Date(),
        changedBy: userId,
        updatedAt: new Date(),
        evaluationCriteriaIds: classRecord?.evaluationCriteriaIds || null,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Bulk insert tất cả sessions trong 1 query
    const newSessions = sessionsToInsert.length > 0
      ? await tx.insert(classSessions).values(sessionsToInsert).returning()
      : [];

    // Move content records before deleting the old class sessions. Reusing the
    // original content IDs keeps all personalized content records intact.
    const newSessionIdByIndex = new Map(
      newSessions
        .filter((session) => session.sessionIndex != null)
        .map((session) => [session.sessionIndex as number, session.id]),
    );
    for (const [sessionIndex, contentIds] of Object.entries(contentIdsBySessionIndex)) {
      const newSessionId = newSessionIdByIndex.get(Number(sessionIndex));
      if (newSessionId && contentIds.length > 0) {
        await tx
          .update(sessionContents)
          .set({ classSessionId: newSessionId })
          .where(inArray(sessionContents.id, contentIds));
      }
    }

    // Any remaining references to the old class sessions are now safe to
    // remove; moved session contents will not be cascade-deleted.
    if (sessionIds.length > 0) {
      await tx.delete(classSessions).where(inArray(classSessions.id, sessionIds));
    }

    // Re-assign students: gom toàn bộ records → bulk insert 1 lần
    // Preserve all fee-related fields from the original student sessions
    const affectedStudentIds = new Set<string>();
    const allStudentSessionsToInsert: Array<{
      studentId: string;
      studentClassId: string | null;
      classId: string;
      classSessionId: string;
      status: "scheduled";
      packageId: string | null;
      packageType: string | null;
      sessionPrice: string | null;
      isPaid: boolean | null;
      note: string | null;
      sessionOrder: number | null;
    }> = [];

    for (const newSession of newSessions) {
      const studentsForThisSession = studentsBySessionIndex[newSession.sessionIndex!] ?? [];
      for (const saved of studentsForThisSession) {
        allStudentSessionsToInsert.push({
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
        });
        affectedStudentIds.add(saved.studentId);
      }
    }

    if (allStudentSessionsToInsert.length > 0) {
      await tx.insert(studentSessions).values(allStudentSessionsToInsert);
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

      // FIX: Batch fetch weekdays cho tất cả custom cycle students trong 1 query (thay vì N SELECT)
      const allCustomWeekdayRows = customCycleScs.length > 0
        ? await tx.select({
            studentClassId: studentSessions.studentClassId,
            weekday: classSessions.weekday,
          })
          .from(studentSessions)
          .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
          .where(and(
            inArray(studentSessions.studentClassId, customCycleScs.map(sc => sc.id)),
            between(classSessions.sessionIndex, fromIndex, toIndex),
          ))
        : [];

      const weekdaysByScId: Record<string, number[]> = {};
      for (const row of allCustomWeekdayRows) {
        if (!row.studentClassId || row.weekday == null) continue;
        (weekdaysByScId[row.studentClassId] ??= []).push(row.weekday);
      }

      for (const sc of customCycleScs) {
        const rawWeekdays = weekdaysByScId[sc.id];
        if (!rawWeekdays || rawWeekdays.length === 0) continue;

        const newUniqueWeekdays = [...new Set(rawWeekdays)].sort((a, b) => a - b);

        if (fromIndex <= 1) {
          // Updating from the very first session: just overwrite scheduledWeekdays directly
          await tx.update(studentClasses)
            .set({ scheduledWeekdays: newUniqueWeekdays, updatedAt: new Date() })
            .where(eq(studentClasses.id, sc.id));
        } else {
          // Updating from a middle session: keep scheduledWeekdays unchanged (reflects sessions 1..fromIndex-1)
          // but record the new cycle in cycle_history so sessions fromIndex+ use the correct weekdays.
          // Find the student's sessionOrder at the FIRST session index in the range where this student
          // is actually enrolled. The student may have a custom cycle (e.g. T3 only in a T3,T5 class),
          // so fromIndex might be a T5 session the student never attended — we must scan the full range.
          let firstUpdatedSessionOrder: number | null = null;
          for (let i = fromIndex; i <= toIndex; i++) {
            const found = studentsBySessionIndex[i]?.find(s => s.studentClassId === sc.id);
            if (found?.sessionOrder != null) {
              firstUpdatedSessionOrder = found.sessionOrder;
              break;
            }
          }

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

    // === Update class-level cycle_history ===
    // Persist the cycle change at the class level so getClassCycles always reads accurate data
    // instead of inferring from the (potentially scrambled after exclusions) session weekday sequence.
    {
      const [existingClass] = await tx.select({ cycleHistory: classes.cycleHistory })
        .from(classes)
        .where(eq(classes.id, classId));

      const existingCycleHistory = (existingClass?.cycleHistory as Array<{ fromSessionIndex: number; weekdays: number[] }> | null) ?? [];
      const sortedWeekdays = [...new Set(weekdays)].sort((a, b) => a - b);

      let newClassHistory: Array<{ fromSessionIndex: number; weekdays: number[] }>;
      if (fromIndex <= 1) {
        // Updating from the very first session: the entire class now has this single cycle
        newClassHistory = [{ fromSessionIndex: 1, weekdays: sortedWeekdays }];
      } else {
        // Keep all entries that start before the updated range, then add/overwrite this one
        const retained = existingCycleHistory.filter(h => h.fromSessionIndex < fromIndex);
        // Ensure there's a base entry at session 1 if none exists
        if (retained.length === 0 && existingCycleHistory.length === 0) {
          // No history yet — first time writing; derive original cycle from the sessions before fromIndex
          const priorSessions = await tx
            .select({ weekday: classSessions.weekday })
            .from(classSessions)
            .where(and(
              eq(classSessions.classId, classId),
              sql`${classSessions.sessionIndex} < ${fromIndex}`,
            ));
          const priorWeekdays = [...new Set(priorSessions.map(s => s.weekday).filter((w): w is number => w != null))].sort((a, b) => a - b);
          if (priorWeekdays.length > 0) {
            retained.push({ fromSessionIndex: 1, weekdays: priorWeekdays });
          }
        }
        newClassHistory = [...retained, { fromSessionIndex: fromIndex, weekdays: sortedWeekdays }];
      }

      await tx.execute(sql`UPDATE classes SET cycle_history = ${JSON.stringify(newClassHistory)}::jsonb WHERE id = ${classId}`);
    }
    // === End update class-level cycle_history ===

    // FIX: Update studentClasses totals cho tất cả affected students → 2 queries thay vì 2N
    const affectedStudentIdsList = [...affectedStudentIds];
    if (affectedStudentIdsList.length > 0) {
      // 1 GROUP BY query thay vì N SELECT riêng lẻ
      const studentStats = await tx.select({
        studentId: studentSessions.studentId,
        startDate: sql<string>`MIN(${classSessions.sessionDate})`,
        endDate:   sql<string>`MAX(${classSessions.sessionDate})`,
        total:     sql<number>`COUNT(*)::int`,
      })
      .from(studentSessions)
      .innerJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
      .where(inArray(studentSessions.studentId, affectedStudentIdsList))
      .groupBy(studentSessions.studentId);

      const statsMap: Record<string, typeof studentStats[number]> = {};
      for (const s of studentStats) {
        if (s.studentId) statsMap[s.studentId] = s;
      }

      // 1 VALUES-list bulk UPDATE thay vì N UPDATE riêng lẻ
      // studentIds/classId là UUIDs (safe). Dates và counts từ DB (safe).
      const rows = affectedStudentIdsList
        .filter(id => !!statsMap[id])
        .map(id => {
          const s = statsMap[id];
          return `('${id}'::uuid, '${s.startDate}'::date, '${s.endDate}'::date, ${s.total})`;
        });

      if (rows.length > 0) {
        await tx.execute(sql.raw(
          `UPDATE student_classes AS sc
           SET total_sessions  = v.total::int,
               start_date      = v.start_date,
               end_date        = v.end_date,
               updated_at      = NOW()
           FROM (VALUES ${rows.join(',')}) AS v(student_id, start_date, end_date, total)
           WHERE sc.class_id   = '${classId}'::uuid
             AND sc.student_id = v.student_id`
        ));
      }
    }
  });
}

// ---------------------------------------------------------------------------
// changeTeacher
// ---------------------------------------------------------------------------
export async function changeTeacher(params: {
  classId: string;
  newTeacherId?: string;
  newTeacherIds?: string[];
  fromSessionId: string;
  toSessionId: string;
}): Promise<void> {
  const { classId, fromSessionId, toSessionId } = params;
  const newTeacherIds = params.newTeacherIds ?? (params.newTeacherId ? [params.newTeacherId] : []);

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
        teacherIds: newTeacherIds,
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
  deleteOnlyUnattended?: boolean;
}): Promise<{
  hasAttendedSessions: boolean;
  orphanedStudents: Array<{ studentClassId: string; studentId: string; studentName: string }>;
}> {
  const sessionsToDelete = await db.select()
    .from(studentSessions)
    .where(and(
      eq(studentSessions.studentClassId, data.studentClassId),
      inArray(studentSessions.studentId, data.studentIds),
      between(studentSessions.sessionOrder, data.fromSessionOrder, data.toSessionOrder),
    ));

  const attendedCount = sessionsToDelete.filter(s => s.attendanceStatus && s.attendanceStatus !== "pending").length;
  const effectiveSessionsToDelete = data.deleteOnlyUnattended
    ? sessionsToDelete.filter((s) => !s.attendanceStatus || s.attendanceStatus === "pending")
    : sessionsToDelete;
  const remainingStudentIds = effectiveSessionsToDelete.length > 0
    ? (await db.selectDistinct({ studentId: studentSessions.studentId })
        .from(studentSessions)
        .where(and(
          eq(studentSessions.studentClassId, data.studentClassId),
          inArray(studentSessions.studentId, data.studentIds),
          sql`${studentSessions.id} NOT IN (${sql.join(effectiveSessionsToDelete.map((s) => sql`${s.id}::uuid`), sql`, `)})`,
        )))
        .map((row) => row.studentId)
    : data.studentIds;
  const remainingStudentIdSet = new Set(remainingStudentIds);
  const orphanedStudentIds = data.studentIds.filter((id) => !remainingStudentIdSet.has(id));
  const orphanedStudents = orphanedStudentIds.length > 0
    ? await db.select({
        studentClassId: studentClasses.id,
        studentId: students.id,
        studentName: students.fullName,
      })
        .from(studentClasses)
        .innerJoin(students, eq(students.id, studentClasses.studentId))
        .where(and(
          eq(studentClasses.id, data.studentClassId),
          inArray(students.id, orphanedStudentIds),
        ))
    : [];

  return { hasAttendedSessions: attendedCount > 0, orphanedStudents };
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
  orphanAction?: "keep" | "remove" | "waiting";
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

    if (data.orphanAction && data.orphanAction !== "keep") {
      const remaining = await tx.selectDistinct({ studentId: studentSessions.studentId })
        .from(studentSessions)
        .where(and(
          eq(studentSessions.studentClassId, data.studentClassId),
          inArray(studentSessions.studentId, data.studentIds),
        ));
      const remainingIds = new Set(remaining.map((row) => row.studentId));
      const orphaned = data.studentIds.filter((id) => !remainingIds.has(id));

      if (orphaned.length > 0) {
        if (data.orphanAction === "waiting") {
          await tx.update(studentClasses)
            .set({
              status: "waiting",
              startDate: null,
              endDate: null,
              totalSessions: 0,
              attendedSessions: 0,
              remainingSessions: 0,
              scheduledWeekdays: null,
              cycleHistory: null,
              updatedAt: new Date(),
            })
            .where(and(
              eq(studentClasses.id, data.studentClassId),
              inArray(studentClasses.studentId, orphaned),
            ));
        } else {
          await tx.delete(studentClasses).where(and(
            eq(studentClasses.id, data.studentClassId),
            inArray(studentClasses.studentId, orphaned),
          ));
        }
      }
    }
  });

  // Tính lại attendedSessions dùng cấu hình fee rules (thay vì chỉ đếm 'present')
  if (data.orphanAction !== "remove") {
    await recalculateStudentClass(data.studentClassId);
  }
}

export * from "./session-content.storage";
