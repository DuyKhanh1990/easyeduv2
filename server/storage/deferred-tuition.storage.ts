import { sql } from "drizzle-orm";
import { db } from "./base";

export interface DeferredSession {
  sessionId: string;
  date: string;
  price: number;
  isPaid: boolean | null;
  status: string | null;
  packageId: string | null;
  packageType: string | null;
  packageName: string | null;
  deductsFee: boolean;
}

export interface DeferredClassSummary {
  classId: string;
  className: string;
  locationId: string;
  totalSessions: number;
  totalAmount: number;
  hasReceipt: boolean;
  receiptPaidAmount: number;
  sessions: DeferredSession[];
}

export interface DeferredStudentSummary {
  studentId: string;
  studentName: string;
  totalSessions: number;
  totalAmount: number;
  classes: DeferredClassSummary[];
}

export interface DeferredTuitionResult {
  students: DeferredStudentSummary[];
  total: number;
  allStudents: { id: string; name: string }[];
  allClasses: { id: string; name: string }[];
  availableMonths: string[];
}

export async function getDeferredTuition(params: {
  studentIds?: string[];
  classIds?: string[];
  month?: string;
  page?: number;
  pageSize?: number;
}): Promise<DeferredTuitionResult> {
  const { studentIds, classIds, month, page = 1, pageSize = 20 } = params;
  const offset = (page - 1) * pageSize;

  const esc = (id: string) => `'${id.replace(/'/g, "''")}'`;

  const baseParts: string[] = [`ss.status IN ('scheduled', 'attended')`];
  if (month) baseParts.push(`LEFT(cs.session_date::text, 7) = '${month.replace(/'/g, "''")}'`);
  if (studentIds?.length) baseParts.push(`ss.student_id IN (${studentIds.map(esc).join(",")})`);
  if (classIds?.length) baseParts.push(`ss.class_id IN (${classIds.map(esc).join(",")})`);
  const baseWhere = baseParts.join(" AND ");

  // 1. Lightweight meta query: distinct students + classes (for filter options + total count)
  const metaRows = await db.execute(sql.raw(`
    SELECT DISTINCT ss.student_id, s.full_name AS student_name, ss.class_id, c.name AS class_name
    FROM student_sessions ss
    JOIN students  s  ON ss.student_id = s.id
    JOIN classes   c  ON ss.class_id   = c.id
    JOIN class_sessions cs ON ss.class_session_id = cs.id
    WHERE ${baseWhere}
  `));

  const studentMap = new Map<string, string>();
  const classMap   = new Map<string, string>();
  for (const r of metaRows.rows as any[]) {
    studentMap.set(r.student_id, r.student_name ?? "");
    classMap.set(r.class_id, r.class_name ?? "");
  }

  const allStudents = Array.from(studentMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));

  const allClasses = Array.from(classMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));

  const total = allStudents.length;

  // Available months query (no month filter so user can navigate months)
  const monthParts: string[] = [`ss.status IN ('scheduled', 'attended')`];
  if (studentIds?.length) monthParts.push(`ss.student_id IN (${studentIds.map(esc).join(",")})`);
  if (classIds?.length) monthParts.push(`ss.class_id IN (${classIds.map(esc).join(",")})`);
  const monthWhere = monthParts.join(" AND ");

  const monthRows = await db.execute(sql.raw(`
    SELECT DISTINCT LEFT(cs.session_date::text, 7) AS month
    FROM student_sessions ss
    JOIN class_sessions cs ON ss.class_session_id = cs.id
    WHERE ${monthWhere}
    ORDER BY month DESC
  `));
  const availableMonths = (monthRows.rows as any[]).map((r: any) => r.month as string);

  // 2. Paginate student IDs in-memory (already sorted alphabetically)
  const pagedStudentIds = allStudents.slice(offset, offset + pageSize).map(s => s.id);

  if (pagedStudentIds.length === 0) {
    return { students: [], total, allStudents, allClasses, availableMonths };
  }

  // 3. Full session data only for this page's students
  const studentIdFilter = pagedStudentIds.map(esc).join(",");
  const sessionParts: string[] = [
    `ss.status IN ('scheduled', 'attended')`,
    `ss.student_id IN (${studentIdFilter})`,
  ];
  if (month) sessionParts.push(`LEFT(cs.session_date::text, 7) = '${month.replace(/'/g, "''")}'`);
  if (classIds?.length) sessionParts.push(`ss.class_id IN (${classIds.map(esc).join(",")})`);
  const sessionWhere = sessionParts.join(" AND ");

  // A deferred-tuition receipt is an invoice-level record. Keep its state
  // separate from session payment allocation so an unpaid receipt can still
  // be shown as created in the deferred-tuition table.
  const receiptPaidAmountMap = new Map<string, number>();
  if (month && pagedStudentIds.length > 0) {
    const [year, monthNumber] = month.split("-");
    const monthLabel = `Tháng ${parseInt(monthNumber, 10)}/${year}`;
    const marker = `DEFERRED_TUITION:${month}`;
    const receiptRows = await db.execute(sql.raw(`
      SELECT
        i.student_id,
        i.class_id,
        COALESCE(SUM(
          CASE
            WHEN COALESCE(ps.schedule_count, 0) > 0
              THEN COALESCE(ps.schedule_paid_amount, 0)
            ELSE COALESCE(i.paid_amount::numeric, 0)
          END
        ), 0)::text AS paid_amount
      FROM invoices i
      LEFT JOIN (
        SELECT
          invoice_id,
          COUNT(*)::int AS schedule_count,
          COALESCE(SUM(
            CASE WHEN status = 'paid' THEN amount::numeric ELSE 0 END
          ), 0) AS schedule_paid_amount
        FROM invoice_payment_schedule
        GROUP BY invoice_id
      ) ps ON ps.invoice_id = i.id
      WHERE i.type = 'Thu'
        AND i.category = 'Học phí'
        AND i.student_id IN (${studentIdFilter})
        AND i.class_id IS NOT NULL
        AND (
          i.payment_note = ${esc(marker)}
          OR (
            (i.description ILIKE ${esc("%Thu học phí trả sau%")} OR i.note ILIKE ${esc("%Thu học phí trả sau%")})
            AND (i.description ILIKE ${esc(`%${monthLabel}%`)} OR i.note ILIKE ${esc(`%${monthLabel}%`)})
          )
      )
      GROUP BY i.student_id, i.class_id
    `));
    for (const row of receiptRows.rows as any[]) {
      receiptPaidAmountMap.set(
        `${row.student_id}:${row.class_id}`,
        Number(row.paid_amount ?? 0),
      );
    }
  }

  const rows = await db.execute(sql.raw(`
    SELECT
      ss.id                   AS session_id,
      ss.student_id,
      s.full_name             AS student_name,
      ss.class_id,
      c.name                  AS class_name,
      c.location_id           AS location_id,
      cs.session_date         AS session_date,
      ss.session_price,
      ss.is_paid,
      ss.attendance_status    AS session_status,
      ss.package_id,
      ss.package_type,
      cfp.name                AS package_name,
      COALESCE(afr.deducts_fee, false) AS deducts_fee
    FROM student_sessions ss
    JOIN students  s   ON ss.student_id        = s.id
    JOIN classes   c   ON ss.class_id          = c.id
    JOIN class_sessions cs ON ss.class_session_id = cs.id
    LEFT JOIN course_fee_packages    cfp ON ss.package_id          = cfp.id
    LEFT JOIN attendance_fee_rules   afr ON afr.attendance_status  = ss.attendance_status
    WHERE ${sessionWhere}
    ORDER BY s.full_name, c.name, cs.session_date
  `));

  const data = rows.rows as Array<{
    session_id: string;
    student_id: string;
    student_name: string;
    class_id: string;
    class_name: string;
    location_id: string;
    session_date: string;
    session_price: string | null;
    is_paid: boolean | null;
    session_status: string | null;
    package_id: string | null;
    package_type: string | null;
    package_name: string | null;
    deducts_fee: boolean;
  }>;

  type ClassGroup = {
    classId: string;
    className: string;
    locationId: string;
    count: number;
    amount: number;
    hasReceipt: boolean;
    receiptPaidAmount: number;
    sessions: DeferredSession[];
  };
  type StudentGroup = { studentId: string; studentName: string; classGroups: Map<string, ClassGroup> };

  const studentGroupMap = new Map<string, StudentGroup>();

  for (const r of data) {
    if (!studentGroupMap.has(r.student_id)) {
      studentGroupMap.set(r.student_id, { studentId: r.student_id, studentName: r.student_name ?? "", classGroups: new Map() });
    }
    const sg = studentGroupMap.get(r.student_id)!;
    if (!sg.classGroups.has(r.class_id)) {
      const receiptPaidAmount = receiptPaidAmountMap.get(`${r.student_id}:${r.class_id}`) ?? 0;
      sg.classGroups.set(r.class_id, {
        classId: r.class_id,
        className: r.class_name ?? "",
        locationId: r.location_id,
        count: 0,
        amount: 0,
        hasReceipt: receiptPaidAmountMap.has(`${r.student_id}:${r.class_id}`),
        receiptPaidAmount,
        sessions: [],
      });
    }
    const cg = sg.classGroups.get(r.class_id)!;
    cg.count += 1;
    cg.amount += Number(r.session_price ?? 0);
    cg.sessions.push({
      sessionId: r.session_id,
      date: r.session_date ?? "",
      price: Number(r.session_price ?? 0),
      isPaid: r.is_paid,
      status: r.session_status,
      packageId: r.package_id ?? null,
      packageType: r.package_type ?? null,
      packageName: r.package_name ?? null,
      deductsFee: r.deducts_fee === true,
    });
  }

  const studentSummaries: DeferredStudentSummary[] = [];
  for (const sg of studentGroupMap.values()) {
    let totalSessions = 0;
    let totalAmount = 0;
    const classSummaries: DeferredClassSummary[] = [];
    for (const cg of sg.classGroups.values()) {
      classSummaries.push({
        classId: cg.classId,
        className: cg.className,
        locationId: cg.locationId,
        totalSessions: cg.count,
        totalAmount: cg.amount,
        hasReceipt: cg.hasReceipt,
        receiptPaidAmount: cg.receiptPaidAmount,
        sessions: cg.sessions,
      });
      totalSessions += cg.count;
      totalAmount += cg.amount;
    }
    studentSummaries.push({ studentId: sg.studentId, studentName: sg.studentName, totalSessions, totalAmount, classes: classSummaries });
  }

  // Preserve original alphabetical order from pagedStudentIds
  studentSummaries.sort((a, b) => {
    const ai = pagedStudentIds.indexOf(a.studentId);
    const bi = pagedStudentIds.indexOf(b.studentId);
    return ai - bi;
  });

  return { students: studentSummaries, total, allStudents, allClasses, availableMonths };
}
