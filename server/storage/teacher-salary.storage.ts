import { db, eq, and, inArray, sql } from "./base";
import { teacherSalaryTables, locations, users, staff } from "@shared/schema";
import type { TeacherSalaryTable, InsertTeacherSalaryTable } from "@shared/schema";

export type TeacherSalaryTableWithRelations = TeacherSalaryTable & {
  location?: { id: string; name: string } | null;
  creator?: { id: string; username: string } | null;
  creatorName?: string | null;
};

export type SessionInfo = {
  sessionId: string;
  sessionDate: string;
  sessionIndex: number | null;
  startTime: string;
  endTime: string;
  durationHours: number;
  attendedCount: number;
  isEligible: boolean;
  /** Hệ số từ bảng Chấm công giáo viên. null = chưa chấm công → dùng logic cũ */
  attendanceCoefficient: number | null;
  /** ISO string hoặc null nếu chưa chấm công */
  checkInAt: string | null;
  checkOutAt: string | null;
};

export type TeacherSalaryDetailRow = {
  teacherId: string;
  teacherName: string;
  teacherCode: string;
  classId: string;
  className: string;
  courseId: string | null;
  role: string;
  sessions: SessionInfo[];
  sessionDates: string[];
};

export type TeacherSalaryRowPackage = {
  teacherId: string;
  classId: string;
  packageId: string;
};

export async function ensureTeacherSalaryRowPackagesTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS teacher_salary_row_packages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      salary_table_id UUID NOT NULL,
      teacher_id UUID NOT NULL,
      class_id UUID NOT NULL,
      package_id UUID NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'teacher_salary_row_packages_salary_table_id_teacher_id_class_id_key'
          AND conrelid = 'teacher_salary_row_packages'::regclass
      ) THEN
        ALTER TABLE teacher_salary_row_packages
          ADD CONSTRAINT teacher_salary_row_packages_salary_table_id_teacher_id_class_id_key
          UNIQUE (salary_table_id, teacher_id, class_id);
      END IF;
    END $$
  `);
}

export async function getTeacherSalaryTables(
  allowedLocationIds: string[],
  isSuperAdmin: boolean
): Promise<TeacherSalaryTableWithRelations[]> {
  const rows = await db
    .select({
      id: teacherSalaryTables.id,
      locationId: teacherSalaryTables.locationId,
      name: teacherSalaryTables.name,
      startDate: teacherSalaryTables.startDate,
      endDate: teacherSalaryTables.endDate,
      createdBy: teacherSalaryTables.createdBy,
      createdAt: teacherSalaryTables.createdAt,
      updatedAt: teacherSalaryTables.updatedAt,
      locationName: locations.name,
      creatorUsername: users.username,
    })
    .from(teacherSalaryTables)
    .leftJoin(locations, eq(teacherSalaryTables.locationId, locations.id))
    .leftJoin(users, eq(teacherSalaryTables.createdBy, users.id))
    .orderBy(teacherSalaryTables.createdAt);

  const filtered = isSuperAdmin
    ? rows
    : rows.filter((r) => allowedLocationIds.includes(r.locationId));

  return filtered.map((r) => ({
    id: r.id,
    locationId: r.locationId,
    name: r.name,
    startDate: r.startDate,
    endDate: r.endDate,
    createdBy: r.createdBy ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    location: r.locationName ? { id: r.locationId, name: r.locationName } : null,
    creatorName: r.creatorUsername ?? null,
  }));
}

export async function getTeacherSalaryTable(id: string): Promise<TeacherSalaryTable | undefined> {
  const [row] = await db
    .select()
    .from(teacherSalaryTables)
    .where(eq(teacherSalaryTables.id, id));
  return row;
}

export async function createTeacherSalaryTable(data: InsertTeacherSalaryTable): Promise<TeacherSalaryTable> {
  const [row] = await db.insert(teacherSalaryTables).values(data).returning();
  return row;
}

export async function updateTeacherSalaryTable(
  id: string,
  data: Partial<InsertTeacherSalaryTable>
): Promise<TeacherSalaryTable> {
  const [row] = await db
    .update(teacherSalaryTables)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(teacherSalaryTables.id, id))
    .returning();
  return row;
}

export async function deleteTeacherSalaryTable(id: string): Promise<void> {
  await db.delete(teacherSalaryTables).where(eq(teacherSalaryTables.id, id));
}

function parseHours(startTime: string, endTime: string): number {
  try {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const startMinutes = (sh || 0) * 60 + (sm || 0);
    const endMinutes = (eh || 0) * 60 + (em || 0);
    const diff = endMinutes - startMinutes;
    return diff > 0 ? diff / 60 : 0;
  } catch {
    return 0;
  }
}

function timeStrToMinutes(t: string): number {
  const [h, m] = t.substring(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function computeAttendanceCoefficient(
  startTime: string,
  endTime: string,
  checkInAt: Date | string | null,
  checkOutAt: Date | string | null
): number | null {
  if (!checkInAt && !checkOutAt) return null;

  const start = timeStrToMinutes(startTime);
  const end = timeStrToMinutes(endTime);
  const scheduled = end - start;
  if (scheduled <= 0) return null;

  const toMinutes = (v: Date | string): number => {
    const d = v instanceof Date ? v : new Date(v);
    return d.getHours() * 60 + d.getMinutes();
  };

  let actual: number;
  if (checkInAt && checkOutAt) {
    actual = toMinutes(checkOutAt) - toMinutes(checkInAt);
  } else if (checkInAt) {
    actual = end - toMinutes(checkInAt);
  } else {
    actual = toMinutes(checkOutAt!) - start;
  }

  return Math.round((actual / scheduled) * 100) / 100;
}

// Invalid attendance statuses: Chưa điểm danh, Bảo lưu, Nghỉ chờ bù, Đã học bù
const INVALID_STATUSES = ["pending", "paused", "reserved", "makeup_wait", "makeup_done"];

export async function getTeacherSalaryDetailRows(
  salaryTableId: string
): Promise<TeacherSalaryDetailRow[]> {
  const table = await getTeacherSalaryTable(salaryTableId);
  if (!table) return [];

  const { locationId, startDate, endDate } = table;

  const result = await db.execute(sql`
    SELECT
      s.id          AS teacher_id,
      s.full_name   AS teacher_name,
      s.code        AS teacher_code,
      c.id          AS class_id,
      c.name        AS class_name,
      c.course_id   AS course_id,
      cs.id            AS session_id,
      cs.session_date,
      cs.session_index,
      st.start_time,
      st.end_time,
      COUNT(ss.id) FILTER (WHERE ss.attendance_status NOT IN ('pending', 'paused', 'reserved', 'makeup_wait', 'makeup_done')) AS eligible_count,
      COUNT(ss.id) FILTER (WHERE ss.attendance_status IN ('present', 'makeup_done', 'made_up')) AS attended_count,
      ta.check_in_at,
      ta.check_out_at
    FROM class_sessions cs
    JOIN classes c ON c.id = cs.class_id
    JOIN staff  s ON s.id = ANY(cs.teacher_ids)
    JOIN shift_templates st ON st.id = cs.shift_template_id
    LEFT JOIN student_sessions ss ON ss.class_session_id = cs.id
    LEFT JOIN teacher_attendance ta ON ta.class_session_id = cs.id AND ta.staff_id = s.id
    WHERE c.location_id = ${locationId}::uuid
      AND cs.session_date >= ${startDate}::date
      AND cs.session_date <= ${endDate}::date
      AND cs.status != 'cancelled'
    GROUP BY s.id, s.full_name, s.code, c.id, c.name, c.course_id, cs.id, cs.session_date, st.start_time, st.end_time, ta.check_in_at, ta.check_out_at
    ORDER BY s.full_name, c.name, cs.session_date
  `);

  const groupMap = new Map<string, TeacherSalaryDetailRow>();

  for (const row of result.rows as any[]) {
    const key = `${row.teacher_id}::${row.class_id}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        teacherId: row.teacher_id,
        teacherName: row.teacher_name,
        teacherCode: row.teacher_code,
        classId: row.class_id,
        className: row.class_name,
        courseId: row.course_id ?? null,
        role: "Giáo viên",
        sessions: [],
        sessionDates: [],
      });
    }

    const dateStr = typeof row.session_date === "string"
      ? row.session_date.slice(0, 10)
      : row.session_date instanceof Date
        ? row.session_date.toISOString().slice(0, 10)
        : String(row.session_date).slice(0, 10);

    const durationHours = parseHours(row.start_time || "00:00", row.end_time || "00:00");
    const eligibleCount = Number(row.eligible_count || 0);
    const attendedCount = Number(row.attended_count || 0);

    const attendanceCoefficient = computeAttendanceCoefficient(
      row.start_time || "00:00",
      row.end_time || "00:00",
      row.check_in_at ?? null,
      row.check_out_at ?? null
    );

    const sessionInfo: SessionInfo = {
      sessionId: row.session_id,
      sessionDate: dateStr,
      sessionIndex: row.session_index != null ? Number(row.session_index) : null,
      startTime: row.start_time || "00:00",
      endTime: row.end_time || "00:00",
      durationHours,
      attendedCount,
      isEligible: eligibleCount > 0,
      attendanceCoefficient,
      checkInAt: row.check_in_at ? new Date(row.check_in_at).toISOString() : null,
      checkOutAt: row.check_out_at ? new Date(row.check_out_at).toISOString() : null,
    };

    const entry = groupMap.get(key)!;
    entry.sessions.push(sessionInfo);
    entry.sessionDates.push(dateStr);
  }

  return Array.from(groupMap.values());
}

export async function getTeacherSalaryRowPackages(
  salaryTableId: string
): Promise<TeacherSalaryRowPackage[]> {
  const result = await db.execute(sql`
    SELECT teacher_id, class_id, package_id
    FROM teacher_salary_row_packages
    WHERE salary_table_id = ${salaryTableId}::uuid
  `);
  return (result.rows as any[]).map((r) => ({
    teacherId: r.teacher_id,
    classId: r.class_id,
    packageId: r.package_id,
  }));
}

export async function saveTeacherSalaryRowPackages(
  salaryTableId: string,
  assignments: TeacherSalaryRowPackage[]
): Promise<void> {
  if (assignments.length === 0) return;

  for (const a of assignments) {
    await db.execute(sql`
      INSERT INTO teacher_salary_row_packages (salary_table_id, teacher_id, class_id, package_id)
      VALUES (${salaryTableId}::uuid, ${a.teacherId}::uuid, ${a.classId}::uuid, ${a.packageId}::uuid)
      ON CONFLICT (salary_table_id, teacher_id, class_id)
      DO UPDATE SET package_id = EXCLUDED.package_id, updated_at = NOW()
    `);
  }
}

export async function deleteTeacherSalaryRowPackage(
  salaryTableId: string,
  teacherId: string,
  classId: string
): Promise<void> {
  await db.execute(sql`
    DELETE FROM teacher_salary_row_packages
    WHERE salary_table_id = ${salaryTableId}::uuid
      AND teacher_id = ${teacherId}::uuid
      AND class_id = ${classId}::uuid
  `);
}

// ─── Session Package Overrides ────────────────────────────────────────────────

export async function ensureTeacherSalarySessionPackagesTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS teacher_salary_session_packages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      salary_table_id UUID NOT NULL,
      class_session_id UUID NOT NULL,
      teacher_id UUID NOT NULL,
      package_id UUID NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'teacher_salary_session_packages_salary_table_id_class_session_id_teacher_id_key'
          AND conrelid = 'teacher_salary_session_packages'::regclass
      ) THEN
        ALTER TABLE teacher_salary_session_packages
          ADD CONSTRAINT teacher_salary_session_packages_salary_table_id_class_session_id_teacher_id_key
          UNIQUE (salary_table_id, class_session_id, teacher_id);
      END IF;
    END $$
  `);
}

export async function getTeacherSalarySessionPackages(
  salaryTableId: string
): Promise<{ sessionId: string; teacherId: string; packageId: string }[]> {
  const result = await db.execute(sql`
    SELECT class_session_id AS session_id, teacher_id, package_id
    FROM teacher_salary_session_packages
    WHERE salary_table_id = ${salaryTableId}::uuid
  `);
  return (result.rows as any[]).map((r) => ({
    sessionId: r.session_id,
    teacherId: r.teacher_id,
    packageId: r.package_id,
  }));
}

export async function saveTeacherSalarySessionPackage(
  salaryTableId: string,
  sessionId: string,
  teacherId: string,
  packageId: string
): Promise<void> {
  await db.execute(sql`
    INSERT INTO teacher_salary_session_packages (salary_table_id, class_session_id, teacher_id, package_id)
    VALUES (${salaryTableId}::uuid, ${sessionId}::uuid, ${teacherId}::uuid, ${packageId}::uuid)
    ON CONFLICT (salary_table_id, class_session_id, teacher_id)
    DO UPDATE SET package_id = EXCLUDED.package_id, updated_at = NOW()
  `);
}

export async function deleteTeacherSalarySessionPackage(
  salaryTableId: string,
  sessionId: string,
  teacherId: string
): Promise<void> {
  await db.execute(sql`
    DELETE FROM teacher_salary_session_packages
    WHERE salary_table_id = ${salaryTableId}::uuid
      AND class_session_id = ${sessionId}::uuid
      AND teacher_id = ${teacherId}::uuid
  `);
}

// ─── Published Rows ───────────────────────────────────────────────────────────

export async function ensureTeacherSalaryPublishedRowsTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS teacher_salary_published_rows (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      salary_table_id UUID NOT NULL,
      teacher_id UUID NOT NULL,
      class_id UUID NOT NULL,
      published_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'teacher_salary_published_rows_salary_table_id_teacher_id_class_id_key'
          AND conrelid = 'teacher_salary_published_rows'::regclass
      ) THEN
        ALTER TABLE teacher_salary_published_rows
          ADD CONSTRAINT teacher_salary_published_rows_salary_table_id_teacher_id_class_id_key
          UNIQUE (salary_table_id, teacher_id, class_id);
      END IF;
    END $$
  `);
}

export async function publishSalaryRows(
  salaryTableId: string,
  rows: { teacherId: string; classId: string }[]
): Promise<void> {
  for (const r of rows) {
    await db.execute(sql`
      INSERT INTO teacher_salary_published_rows (salary_table_id, teacher_id, class_id)
      VALUES (${salaryTableId}::uuid, ${r.teacherId}::uuid, ${r.classId}::uuid)
      ON CONFLICT (salary_table_id, teacher_id, class_id) DO NOTHING
    `);
  }
}

export async function getPublishedSalaryRows(
  salaryTableId: string
): Promise<{ teacherId: string; classId: string; publishedAt: string }[]> {
  const result = await db.execute(sql`
    SELECT teacher_id, class_id, published_at
    FROM teacher_salary_published_rows
    WHERE salary_table_id = ${salaryTableId}::uuid
  `);
  return (result.rows as any[]).map((r) => ({
    teacherId: r.teacher_id,
    classId: r.class_id,
    publishedAt: r.published_at,
  }));
}

export type PublishedSalaryRow = {
  salaryTableId: string;
  salaryTableName: string;
  startDate: string;
  endDate: string;
  locationName: string | null;
  teacherId: string;
  classId: string;
  className: string;
  publishedAt: string;
};

export async function getPublishedRowsForTeacher(
  teacherId: string
): Promise<PublishedSalaryRow[]> {
  const result = await db.execute(sql`
    SELECT
      pr.salary_table_id,
      tst.name AS salary_table_name,
      tst.start_date,
      tst.end_date,
      l.name AS location_name,
      pr.teacher_id,
      pr.class_id,
      c.name AS class_name,
      pr.published_at
    FROM teacher_salary_published_rows pr
    JOIN teacher_salary_tables tst ON tst.id = pr.salary_table_id
    LEFT JOIN locations l ON l.id = tst.location_id
    LEFT JOIN classes c ON c.id = pr.class_id
    WHERE pr.teacher_id = ${teacherId}::uuid
    ORDER BY pr.published_at DESC
  `);
  return (result.rows as any[]).map((r) => ({
    salaryTableId: r.salary_table_id,
    salaryTableName: r.salary_table_name,
    startDate: r.start_date,
    endDate: r.end_date,
    locationName: r.location_name ?? null,
    teacherId: r.teacher_id,
    classId: r.class_id,
    className: r.class_name,
    publishedAt: r.published_at,
  }));
}
