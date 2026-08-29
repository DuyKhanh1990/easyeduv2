import {
  db,
  eq, sql, and, or, inArray, asc, isNull,
  students, staff, users, classes, classSessions, studentClasses, studentSessions,
  studentLocations, crmPipelineGroups, crmRelationships, crmRejectReasons, crmCustomerSources, crmSchools,
  crmRequiredFields, crmCustomFields, crmRegistrationFormFields,
  courseFeePackages, shiftTemplates, studentComments,
  staffAssignments, locations, invoices, invoiceSessionAllocations,
  studentRelationshipHistory, studentNotificationChannels,
} from "./base";
import { hashPassword } from "../auth";
import type {
  StudentResponse, Staff as StaffType,
  CrmPipelineGroup, InsertCrmPipelineGroup,
  CrmRelationship, InsertCrmRelationship,
  CrmRejectReason, InsertCrmRejectReason,
  CrmCustomerSource, InsertCrmCustomerSource,
  CrmSchool, InsertCrmSchool,
  CrmCustomField, InsertCrmCustomField,
  StudentComment, InsertStudentComment,
  User,
} from "./base";

// ==========================================
// STUDENT METHODS
// ==========================================

export async function getStudents(params: {
  allowedLocationIds: string[];
  isSuperAdmin: boolean;
  locationId?: string;
  offset?: number;
  limit?: number;
  searchTerm?: string;
  type?: string;
  pipelineStage?: string;
  pipelineGroupId?: string;
  parentRelationshipId?: string;
  sources?: string[];
  rejectReasons?: string[];
  salesIds?: string[];
  managerIds?: string[];
  teacherIds?: string[];
  classIds?: string[];
  schoolIds?: string[];
  birthYear?: string;
  startDate?: string;
  endDate?: string;
  updatedFrom?: string;
  updatedTo?: string;
  accountStatuses?: string[];
  learningStatuses?: string[];
  birthdayFrom?: string;
  birthdayTo?: string;
  classTabId?: string;
  classTab?: 'unassigned';
  viewScope?: 'all' | 'own';
  viewerStaffId?: string;
}): Promise<{ students: StudentResponse[]; total: number }> {
  const {
    allowedLocationIds, isSuperAdmin,
    locationId, offset, limit, searchTerm, type, pipelineStage, pipelineGroupId, parentRelationshipId,
    sources, rejectReasons, salesIds, managerIds, teacherIds, classIds, schoolIds, birthYear,
    startDate, endDate, updatedFrom, updatedTo,
    accountStatuses, learningStatuses, birthdayFrom, birthdayTo, classTabId, classTab,
    viewScope, viewerStaffId
  } = params;

  let whereClause = sql`1=1`;

  if (!isSuperAdmin) {
    whereClause = sql`${whereClause} AND EXISTS (SELECT 1 FROM student_locations WHERE student_locations.student_id = students.id AND student_locations.location_id = ANY(ARRAY[${sql.raw(allowedLocationIds.map(id => `'${id}'`).join(','))}]::uuid[]))`;
  }

  // Apply view scope: 'own' = only data the viewer is assigned to
  if (!isSuperAdmin && viewScope === 'own' && viewerStaffId) {
    whereClause = sql`${whereClause} AND (
      ${students.salesByIds} && ARRAY[${viewerStaffId}]::uuid[]
      OR ${students.managedByIds} && ARRAY[${viewerStaffId}]::uuid[]
      OR ${students.teacherIds} && ARRAY[${viewerStaffId}]::uuid[]
    )`;
  }

  if (locationId && locationId !== "all") {
    whereClause = sql`${whereClause} AND EXISTS (SELECT 1 FROM student_locations WHERE student_locations.student_id = students.id AND student_locations.location_id = ${locationId})`;
  }
  if (type && type !== "all") {
    whereClause = sql`${whereClause} AND ${students.type} = ${type}`;
  }
  if (pipelineStage && pipelineStage !== "all") {
    whereClause = sql`${whereClause} AND EXISTS (
      SELECT 1 FROM crm_relationships cr
      WHERE cr.id = ANY(${students.relationshipIds}::uuid[])
      AND cr.name = ${pipelineStage}
    )`;
  } else if (parentRelationshipId && parentRelationshipId !== "all") {
    whereClause = sql`${whereClause} AND EXISTS (
      SELECT 1 FROM crm_relationships cr
      WHERE cr.id = ANY(${students.relationshipIds}::uuid[])
      AND cr.parent_id = ${parentRelationshipId}::uuid
    )`;
  } else if (pipelineGroupId && pipelineGroupId !== "all") {
    whereClause = sql`${whereClause} AND EXISTS (
      SELECT 1 FROM crm_relationships cr
      WHERE cr.id = ANY(${students.relationshipIds}::uuid[])
      AND cr.group_id = ${pipelineGroupId}::uuid
    )`;
  }
  if (sources && sources.length > 0) {
    whereClause = sql`${whereClause} AND ${students.source} IN ${sources}`;
  }
  if (rejectReasons && rejectReasons.length > 0) {
    whereClause = sql`${whereClause} AND ${students.rejectReason} IN ${rejectReasons}`;
  }
  if (salesIds && salesIds.length > 0) {
    const conds = salesIds.map((id: string) => sql`${students.salesByIds} && ARRAY[${id}]::uuid[]`);
    let combined = conds[0];
    for (let i = 1; i < conds.length; i++) combined = sql`(${combined}) OR (${conds[i]})`;
    whereClause = sql`${whereClause} AND (${combined})`;
  }
  if (managerIds && managerIds.length > 0) {
    const conds = managerIds.map((id: string) => sql`${students.managedByIds} && ARRAY[${id}]::uuid[]`);
    let combined = conds[0];
    for (let i = 1; i < conds.length; i++) combined = sql`(${combined}) OR (${conds[i]})`;
    whereClause = sql`${whereClause} AND (${combined})`;
  }
  if (teacherIds && teacherIds.length > 0) {
    const conds = teacherIds.map((id: string) => sql`${students.teacherIds} && ARRAY[${id}]::uuid[]`);
    let combined = conds[0];
    for (let i = 1; i < conds.length; i++) combined = sql`(${combined}) OR (${conds[i]})`;
    whereClause = sql`${whereClause} AND (${combined})`;
  }
  if (classIds && classIds.length > 0) {
    whereClause = sql`${whereClause} AND ${students.classIds} && array[${classIds.join(',')}]::uuid[]`;
  }
  if (schoolIds && schoolIds.length > 0) {
    const schoolIdArray = sql.join(schoolIds.map((id) => sql`${id}::uuid`), sql`, `);
    whereClause = sql`${whereClause} AND ${students.schoolIds} && ARRAY[${schoolIdArray}]::uuid[]`;
  }
  // The class view must use the same source as the "Lớp học" column:
  // student_classes joined to an existing classes row. Do not use students.classIds here.
  if (classTabId) {
    whereClause = sql`${whereClause} AND EXISTS (
      SELECT 1
      FROM student_classes sc
      INNER JOIN classes c ON c.id = sc.class_id
      WHERE sc.student_id = ${students.id}
        AND c.id = ${classTabId}::uuid
    )`;
  } else if (classTab === "unassigned") {
    whereClause = sql`${whereClause} AND NOT EXISTS (
      SELECT 1
      FROM student_classes sc
      INNER JOIN classes c ON c.id = sc.class_id
      WHERE sc.student_id = ${students.id}
    )`;
  }
  if (startDate) {
    whereClause = sql`${whereClause} AND ${students.createdAt} >= ${new Date(startDate)}`;
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    whereClause = sql`${whereClause} AND ${students.createdAt} <= ${end}`;
  }
  if (updatedFrom) {
    whereClause = sql`${whereClause} AND ${students.updatedAt} >= ${new Date(updatedFrom)}`;
  }
  if (updatedTo) {
    const end = new Date(updatedTo);
    end.setHours(23, 59, 59, 999);
    whereClause = sql`${whereClause} AND ${students.updatedAt} <= ${end}`;
  }
  if (birthYear && /^\d{4}$/.test(birthYear)) {
    whereClause = sql`${whereClause}
      AND ${students.dateOfBirth} >= ${`${birthYear}-01-01`}
      AND ${students.dateOfBirth} <= ${`${birthYear}-12-31`}`;
  }
  if (accountStatuses && accountStatuses.length > 0) {
    whereClause = sql`${whereClause} AND ${students.accountStatus} IN ${accountStatuses}`;
  }
  if (birthdayFrom || birthdayTo) {
    const parseMD = (s?: string) => {
      if (!s) return null;
      const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
      if (!m) return null;
      const day = parseInt(m[1], 10);
      const month = parseInt(m[2], 10);
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      return month * 100 + day;
    };
    const fromMD = parseMD(birthdayFrom);
    const toMD = parseMD(birthdayTo);
    const dobExpr = sql`(EXTRACT(MONTH FROM ${students.dateOfBirth})::int * 100 + EXTRACT(DAY FROM ${students.dateOfBirth})::int)`;
    if (fromMD !== null && toMD !== null) {
      if (fromMD <= toMD) {
        whereClause = sql`${whereClause} AND ${students.dateOfBirth} IS NOT NULL AND ${dobExpr} BETWEEN ${fromMD} AND ${toMD}`;
      } else {
        whereClause = sql`${whereClause} AND ${students.dateOfBirth} IS NOT NULL AND (${dobExpr} >= ${fromMD} OR ${dobExpr} <= ${toMD})`;
      }
    } else if (fromMD !== null) {
      whereClause = sql`${whereClause} AND ${students.dateOfBirth} IS NOT NULL AND ${dobExpr} >= ${fromMD}`;
    } else if (toMD !== null) {
      whereClause = sql`${whereClause} AND ${students.dateOfBirth} IS NOT NULL AND ${dobExpr} <= ${toMD}`;
    }
  }
  if (learningStatuses && learningStatuses.length > 0) {
    whereClause = sql`${whereClause} AND ${students.id} IN (
      SELECT s2.id FROM students s2
      LEFT JOIN (
        SELECT ss.student_id,
          COUNT(*) FILTER (WHERE cs.session_date < CURRENT_DATE) AS past_any,
          COUNT(*) FILTER (WHERE cs.session_date = CURRENT_DATE) AS today_any,
          COUNT(*) FILTER (WHERE cs.session_date > CURRENT_DATE) AS future_any,
          COUNT(*) FILTER (WHERE cs.session_date = CURRENT_DATE AND ss.attendance_status = 'paused') AS paused_today
        FROM student_sessions ss
        JOIN class_sessions cs ON cs.id = ss.class_session_id
        GROUP BY ss.student_id
      ) st ON st.student_id = s2.id
      WHERE (
        CASE
          WHEN COALESCE(st.today_any,0) > 0 OR (COALESCE(st.past_any,0) > 0 AND COALESCE(st.future_any,0) > 0) OR COALESCE(st.future_any,0) > 0
            THEN CASE WHEN COALESCE(st.past_any,0) = 0 AND COALESCE(st.today_any,0) = 0 AND COALESCE(st.future_any,0) > 0 THEN 'cho_lich' ELSE 'dang_hoc' END
          WHEN COALESCE(st.paused_today,0) > 0 THEN 'bao_luu'
          WHEN COALESCE(st.past_any,0) > 0 AND COALESCE(st.today_any,0) = 0 AND COALESCE(st.future_any,0) = 0 THEN 'da_nghi'
          ELSE 'chua_co_lich'
        END
      ) IN ${learningStatuses}
    )`;
  }
  if (searchTerm) {
    const search = `%${searchTerm.toLowerCase()}%`;
    whereClause = sql`${whereClause} AND (LOWER(${students.fullName}) LIKE ${search} OR LOWER(${students.code}) LIKE ${search})`;
  }

  const studentIdRows = await db
    .select({
      id: students.id,
      total: sql<number>`COUNT(*) OVER()`,
    })
    .from(students)
    .where(whereClause)
    .limit(limit ?? 20)
    .offset(offset ?? 0)
    .orderBy(
      searchTerm
        ? sql`CASE
            WHEN LOWER(${students.fullName}) = LOWER(${searchTerm}) OR LOWER(${students.code}) = LOWER(${searchTerm}) THEN 0
            WHEN LOWER(${students.fullName}) LIKE LOWER(${searchTerm + "%"}) OR LOWER(${students.code}) LIKE LOWER(${searchTerm + "%"}) THEN 1
            ELSE 2
          END, ${students.fullName}`
        : sql`${students.createdAt} DESC`
    );

  const total = studentIdRows.length > 0 ? Number(studentIdRows[0].total) : 0;
  const studentIds = studentIdRows.map(r => r.id);

  const studentsList = studentIds.length === 0 ? [] : await db.query.students.findMany({
    where: inArray(students.id, studentIds),
    with: {
      locations: {
        with: {
          location: true
        }
      },
      user: true
    },
    orderBy: (table, { desc }) => [desc(table.createdAt)]
  });

  // Re-sort to preserve relevance ordering when searching
  if (searchTerm && studentIds.length > 0) {
    const idOrder = new Map(studentIds.map((id, i) => [id, i]));
    studentsList.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));
  }

  const relevantStaffIds = Array.from(new Set(studentsList.flatMap(s => [
    ...(s.salesByIds || []),
    ...(s.managedByIds || []),
    ...(s.teacherIds || []),
  ])));
  const relevantUserIds = Array.from(new Set(studentsList.flatMap(s => [
    s.createdBy,
    s.updatedBy,
  ].filter(Boolean) as string[])));
  const relevantSourceIds = Array.from(new Set(studentsList.flatMap(s => s.customerSourceIds || [])));
  const relevantSchoolIds = Array.from(new Set(studentsList.flatMap(s => s.schoolIds || [])));

  // Fetch studentClasses first so we can include ALL enrolled class IDs in the classMap
  const allStudentClasses = studentIds.length === 0 ? [] : await db.select().from(studentClasses).where(inArray(studentClasses.studentId, studentIds));

  const relevantClassIds = Array.from(new Set([
    ...studentsList.flatMap(s => s.classIds || []),
    ...allStudentClasses.map(sc => sc.classId),
  ]));

  const [allStaff, allUsers, allClasses, allSources, allSchools, allZaloChannels, allLastComments] = await Promise.all([
    relevantStaffIds.length === 0 ? Promise.resolve([]) : db.select({ id: staff.id, fullName: staff.fullName, code: staff.code, phone: staff.phone, email: staff.email, status: staff.status }).from(staff).where(inArray(staff.id, relevantStaffIds)),
    relevantUserIds.length === 0 ? Promise.resolve([]) : db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, relevantUserIds)),
    relevantClassIds.length === 0 ? Promise.resolve([]) : db.select({ id: classes.id, name: classes.name, classCode: classes.classCode }).from(classes).where(inArray(classes.id, relevantClassIds)),
    relevantSourceIds.length === 0 ? Promise.resolve([]) : db.select().from(crmCustomerSources).where(inArray(crmCustomerSources.id, relevantSourceIds)),
    relevantSchoolIds.length === 0 ? Promise.resolve([]) : db.select().from(crmSchools).where(inArray(crmSchools.id, relevantSchoolIds)),
    studentIds.length === 0 ? Promise.resolve([]) : db
      .select({
        studentId: studentNotificationChannels.studentId,
        zaloUserId: studentNotificationChannels.zaloUserId,
        isFollowed: studentNotificationChannels.isFollowed,
        hasInteracted: studentNotificationChannels.hasInteracted,
      })
      .from(studentNotificationChannels)
      .where(inArray(studentNotificationChannels.studentId, studentIds)),
    studentIds.length === 0 ? Promise.resolve([]) : db
      .select({
        studentId: studentComments.studentId,
        content: studentComments.content,
        createdAt: studentComments.createdAt,
        authorName: users.username,
      })
      .from(studentComments)
      .leftJoin(users, eq(users.id, studentComments.userId))
      .where(inArray(studentComments.studentId, studentIds))
      .orderBy(asc(studentComments.studentId), sql`${studentComments.createdAt} DESC`),
  ]);
  const staffMap = new Map(allStaff.map(s => [s.id, s]));
  const userMap = new Map(allUsers.map(u => [u.id, u]));
  const classMap = new Map(allClasses.map(c => [c.id, c]));
  const sourceMap = new Map(allSources.map(s => [s.id, s]));
  const schoolMap = new Map(allSchools.map(s => [s.id, s]));
  const lastCommentMap = new Map<string, { content: string; createdAt: string; authorName: string }>();
  for (const c of (allLastComments as Array<{ studentId: string; content: string; createdAt: Date | string | null; authorName: string | null }>)) {
    if (!lastCommentMap.has(c.studentId)) {
      lastCommentMap.set(c.studentId, {
        content: c.content,
        createdAt: c.createdAt ? new Date(c.createdAt as any).toISOString() : "",
        authorName: c.authorName ?? "",
      });
    }
  }
  const zaloChannelMap = new Map(
    allZaloChannels
      .filter(z => z.zaloUserId)
      .map(z => [z.studentId, { zaloUserId: z.zaloUserId!, isFollowed: z.isFollowed ?? false, hasInteracted: z.hasInteracted ?? false }])
  );
  const studentClassMap = new Map(allStudentClasses.map(sc => [`${sc.studentId}-${sc.classId}`, sc]));

  const mappedStudents = studentsList.map(student => ({
    ...student,
    location: student.locations?.[0]?.location,
    zaloChannel: zaloChannelMap.get(student.id) ?? null,
    salesBy: student.salesByIds && student.salesByIds.length > 0 ? staffMap.get(student.salesByIds[0]) : undefined,
    salesByList: (student.salesByIds || []).map(id => staffMap.get(id)).filter(Boolean) as StaffType[],
    managedByList: (student.managedByIds || []).map(id => staffMap.get(id)).filter(Boolean) as StaffType[],
    teacherList: (student.teacherIds || []).map(id => staffMap.get(id)).filter(Boolean) as StaffType[],
    creator: student.createdBy ? userMap.get(student.createdBy) : undefined,
    updater: student.updatedBy ? userMap.get(student.updatedBy) : undefined,
    classDetails: allStudentClasses
      .filter(sc => sc.studentId === student.id)
      .map(sc => {
        const classRecord = classMap.get(sc.classId);
        return {
          classId: sc.classId,
          className: classRecord?.name || '',
          classCode: classRecord?.classCode || '',
          studentStatus: sc.studentStatus || 'Không xác định',
          startDate: sc.startDate || null,
          endDate: sc.endDate || null,
          totalSessions: sc.totalSessions || 0,
          attendedSessions: sc.attendedSessions || 0,
          remainingSessions: sc.remainingSessions || 0,
        };
      })
      .filter(c => c.className),
    classNames: allStudentClasses
      .filter(sc => sc.studentId === student.id)
      .map(sc => classMap.get(sc.classId)?.name)
      .filter(Boolean) as string[],
    className: (() => {
      const first = allStudentClasses.find(sc => sc.studentId === student.id);
      return first ? classMap.get(first.classId)?.name : undefined;
    })(),
    classCode: (() => {
      const first = allStudentClasses.find(sc => sc.studentId === student.id);
      return first ? classMap.get(first.classId)?.classCode : undefined;
    })(),
    sourceList: (student.customerSourceIds || []).map(id => sourceMap.get(id)).filter(Boolean).map(s => s!.name),
    schoolList: (student.schoolIds || []).map(id => schoolMap.get(id)).filter(Boolean) as CrmSchool[],
    lastComment: lastCommentMap.get(student.id) ?? null,
  })) as StudentResponse[];

  return { students: mappedStudents, total };
}

export async function getStudentClassTabs(params: {
  allowedLocationIds: string[];
  isSuperAdmin: boolean;
  viewScope?: 'all' | 'own';
  viewerStaffId?: string;
}): Promise<{
  classes: { id: string; name: string; classCode: string }[];
  hasUnassigned: boolean;
}> {
  const { allowedLocationIds, isSuperAdmin, viewScope, viewerStaffId } = params;
  let visibleStudentWhere = sql`1=1`;

  if (!isSuperAdmin) {
    visibleStudentWhere = sql`${visibleStudentWhere} AND EXISTS (
      SELECT 1 FROM student_locations sl
      WHERE sl.student_id = ${students.id}
        AND sl.location_id = ANY(ARRAY[${sql.raw(allowedLocationIds.map(id => `'${id}'`).join(','))}]::uuid[])
    )`;
  }

  if (!isSuperAdmin && viewScope === 'own' && viewerStaffId) {
    visibleStudentWhere = sql`${visibleStudentWhere} AND (
      ${students.salesByIds} && ARRAY[${viewerStaffId}]::uuid[]
      OR ${students.managedByIds} && ARRAY[${viewerStaffId}]::uuid[]
      OR ${students.teacherIds} && ARRAY[${viewerStaffId}]::uuid[]
    )`;
  }

  const classRows = await db
    .selectDistinct({
      id: classes.id,
      name: classes.name,
      classCode: classes.classCode,
    })
    .from(classes)
    .innerJoin(studentClasses, eq(studentClasses.classId, classes.id))
    .innerJoin(students, eq(students.id, studentClasses.studentId))
    .where(visibleStudentWhere)
    .orderBy(asc(classes.classCode), asc(classes.name));

  const unassignedRows = await db
    .select({ id: students.id })
    .from(students)
    .where(sql`${visibleStudentWhere} AND NOT EXISTS (
      SELECT 1
      FROM student_classes sc
      INNER JOIN classes c ON c.id = sc.class_id
      WHERE sc.student_id = ${students.id}
    )`)
    .limit(1);

  return {
    classes: classRows,
    hasUnassigned: unassignedRows.length > 0,
  };
}

export async function getStudentsMinimal(params: {
  allowedLocationIds: string[];
  isSuperAdmin: boolean;
  locationId?: string;
  limit?: number;
  searchTerm?: string;
}): Promise<{ id: string; fullName: string; code: string; phone: string | null; type: string | null; accountStatus: string | null; locations: { locationId: string }[] }[]> {
  const { allowedLocationIds, isSuperAdmin, locationId, limit = 200, searchTerm } = params;

  let whereClause = sql`1=1`;

  if (!isSuperAdmin && allowedLocationIds.length > 0) {
    whereClause = sql`${whereClause} AND EXISTS (SELECT 1 FROM ${studentLocations} sl WHERE sl.student_id = ${students.id} AND sl.location_id = ANY(ARRAY[${sql.raw(allowedLocationIds.map(id => `'${id}'`).join(','))}]::uuid[]))`;
  }

  if (locationId && locationId !== "all") {
    whereClause = sql`${whereClause} AND EXISTS (SELECT 1 FROM ${studentLocations} sl WHERE sl.student_id = ${students.id} AND sl.location_id = ${locationId}::uuid)`;
  }

  if (searchTerm && searchTerm.trim()) {
    const search = `%${searchTerm.trim().toLowerCase()}%`;
    whereClause = sql`${whereClause} AND (LOWER(${students.fullName}) LIKE ${search} OR LOWER(${students.code}) LIKE ${search} OR ${students.phone} LIKE ${search} OR ${students.parentPhone} LIKE ${search})`;
  }

  const orderBy = searchTerm?.trim()
    ? sql`CASE WHEN LOWER(${students.fullName}) LIKE LOWER(${searchTerm.trim() + "%"}) THEN 0 ELSE 1 END, ${students.fullName} ASC`
    : sql`${students.fullName} ASC`;

  const rows = await db
    .select({ id: students.id, fullName: students.fullName, code: students.code, phone: students.phone, type: students.type, accountStatus: students.accountStatus })
    .from(students)
    .where(whereClause)
    .limit(limit)
    .orderBy(orderBy);

  if (rows.length === 0) return [];

  const ids = rows.map(r => r.id);
  const locRows = await db
    .select({ studentId: studentLocations.studentId, locationId: studentLocations.locationId })
    .from(studentLocations)
    .where(inArray(studentLocations.studentId, ids));

  const locMap = new Map<string, { locationId: string }[]>();
  locRows.forEach(l => {
    const existing = locMap.get(l.studentId) || [];
    existing.push({ locationId: l.locationId });
    locMap.set(l.studentId, existing);
  });

  return rows.map(r => ({
    id: r.id,
    fullName: r.fullName,
    code: r.code,
    phone: r.phone,
    type: r.type,
    accountStatus: r.accountStatus,
    locations: locMap.get(r.id) || [],
  }));
}

export async function getStudent(id: string, allowedLocationIds: string[], isSuperAdmin: boolean): Promise<StudentResponse | undefined> {
  const filters = [eq(students.id, id)];
  if (!isSuperAdmin) {
    filters.push(sql`EXISTS (SELECT 1 FROM student_locations WHERE student_locations.student_id = students.id AND student_locations.location_id = ANY(ARRAY[${sql.raw(allowedLocationIds.map(id => `'${id}'`).join(','))}]::uuid[]))`);
  }

  const student = await db.query.students.findFirst({
    where: and(...filters),
    with: {
      locations: {
        with: {
          location: true
        }
      },
      user: true
    }
  });
  if (!student) return undefined;
  const childRows = await db
    .select({ id: students.id })
    .from(students)
    .where(sql`${students.parentIds} @> ARRAY[${student.id}::uuid]`);

  const relevantStaffIds = Array.from(new Set([
    ...(student.salesByIds || []),
    ...(student.managedByIds || []),
    ...(student.teacherIds || []),
  ]));
  const relevantRelationshipIds = student.relationshipIds || [];
  const relevantClassIds = student.classIds || [];

  const [allStaff, allRelationships, allClasses, allSchools, allStudentClasses] = await Promise.all([
    relevantStaffIds.length > 0
      ? db.select().from(staff).where(inArray(staff.id, relevantStaffIds))
      : Promise.resolve([]),
    relevantRelationshipIds.length > 0
      ? db.select().from(crmRelationships).where(inArray(crmRelationships.id, relevantRelationshipIds))
      : Promise.resolve([]),
    relevantClassIds.length > 0
      ? db.select().from(classes).where(inArray(classes.id, relevantClassIds))
      : Promise.resolve([]),
    student.schoolIds?.length
      ? db.select().from(crmSchools).where(inArray(crmSchools.id, student.schoolIds))
      : Promise.resolve([]),
    db.select().from(studentClasses).where(eq(studentClasses.studentId, student.id)),
  ]);
  const staffMap = new Map(allStaff.map(s => [s.id, s]));
  const relMap = new Map(allRelationships.map(r => [r.id, r]));
  const classMap = new Map(allClasses.map(c => [c.id, c]));

  return {
    ...student,
    location: student.locations?.[0]?.location,
    salesBy: student.salesByIds && student.salesByIds.length > 0 ? staffMap.get(student.salesByIds[0]) : undefined,
    salesByList: (student.salesByIds || []).map(id => staffMap.get(id)).filter(Boolean) as StaffType[],
    managedByList: (student.managedByIds || []).map(id => staffMap.get(id)).filter(Boolean) as StaffType[],
    teacherList: (student.teacherIds || []).map(id => staffMap.get(id)).filter(Boolean) as StaffType[],
    relationshipList: (student.relationshipIds || []).map(id => relMap.get(id)).filter(Boolean) as CrmRelationship[],
     childIds: childRows.map(child => child.id),
    classNames: (student.classIds || []).map(id => classMap.get(id)?.name).filter(Boolean) as string[],
     schoolList: (student.schoolIds || []).map(id => allSchools.find(s => s.id === id)).filter(Boolean) as CrmSchool[],
    classDetails: (student.classIds || []).map(classId => {
      const studentClassRecord = allStudentClasses.find(sc => sc.studentId === student.id && sc.classId === classId);
      const classRecord = classMap.get(classId);
      return {
        classId,
        className: classRecord?.name || '',
        classCode: classRecord?.classCode || '',
        studentStatus: studentClassRecord?.studentStatus || 'Không xác định',
        startDate: studentClassRecord?.startDate || null,
        endDate: studentClassRecord?.endDate || null,
        totalSessions: studentClassRecord?.totalSessions || 0,
        attendedSessions: studentClassRecord?.attendedSessions || 0,
        remainingSessions: studentClassRecord?.remainingSessions || 0,
      };
    }).filter(c => c.className),
  } as StudentResponse;
}

export async function createStudent(student: any): Promise<StudentResponse> {
  const { username, password, locationIds, childIds, ...studentData } = student;

  if (!studentData.code) {
    const prefix = studentData.type === "Phụ huynh" ? "PH-" : "HV-";
    const existingCodes = await db.select({ code: students.code })
      .from(students)
      .where(sql`${students.code} LIKE ${`${prefix}%`}`);

    const maxNum = existingCodes.reduce((max, row) => {
      const match = row.code?.match(new RegExp(`^${prefix}(\\d+)$`));
      const num = match ? parseInt(match[1], 10) : 0;
      return Number.isFinite(num) && num > max ? num : max;
    }, 0);
    const nextNum = maxNum + 1;
    studentData.code = `${prefix}${nextNum.toString().padStart(2, '0')}`;
  }

  return await db.transaction(async (tx) => {
    let requestedRelationshipIds = Array.isArray(studentData.relationshipIds)
      ? studentData.relationshipIds.filter(Boolean)
      : [];
    const requestedStages = Array.isArray(studentData.pipelineStage)
      ? studentData.pipelineStage.filter(Boolean)
      : (studentData.pipelineStage ? [studentData.pipelineStage] : []);

    if (requestedRelationshipIds.length === 0 && requestedStages.length > 0) {
      const stageRelationships = await tx
        .select()
        .from(crmRelationships)
        .where(inArray(crmRelationships.name, requestedStages));
      requestedRelationshipIds = stageRelationships.map((relationship) => relationship.id);
    }

    let selectedRelationships = requestedRelationshipIds.length > 0
      ? await tx.select().from(crmRelationships).where(inArray(crmRelationships.id, requestedRelationshipIds))
      : [];

    if (selectedRelationships.length === 0) {
      const [defaultRelationship] = await tx
        .select()
        .from(crmRelationships)
        .where(eq(crmRelationships.isSystemDefault, true))
        .limit(1);
      if (!defaultRelationship) {
        throw new Error("Không tìm thấy mối quan hệ Lead mặc định của hệ thống.");
      }
      selectedRelationships = [defaultRelationship];
    }

    requestedRelationshipIds = selectedRelationships.map((relationship) => relationship.id);
    studentData.relationshipIds = requestedRelationshipIds;
    studentData.pipelineStage = selectedRelationships.map((relationship) => relationship.name);

    let userId = null;
    const effectiveUsername = String(username || studentData.code || "").trim();
    if (effectiveUsername) {
      const [existingUser] = await tx
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(sql`LOWER(${users.username}) = LOWER(${effectiveUsername})`)
        .for("update");
      if (existingUser) {
        const [[linkedStaff], [linkedStudent]] = await Promise.all([
          tx.select({ id: staff.id }).from(staff).where(eq(staff.userId, existingUser.id)).limit(1),
          tx.select({ id: students.id }).from(students).where(eq(students.userId, existingUser.id)).limit(1),
        ]);
        if (linkedStaff || linkedStudent || existingUser.username.toLowerCase() === "admin") {
          const conflict: any = new Error(`Tài khoản "${effectiveUsername}" đã tồn tại trong hệ thống`);
          conflict.code = "23505";
          conflict.constraint = "users_username_key";
          throw conflict;
        }

        const [reclaimedUser] = await tx
          .update(users)
          .set({
            username: effectiveUsername,
            passwordHash: hashPassword(password || "123456"),
            isActive: studentData.accountStatus !== "Không hoạt động",
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingUser.id))
          .returning({ id: users.id });
        userId = reclaimedUser.id;
      } else {
        const [newUser] = await tx.insert(users).values({
          username: effectiveUsername,
          passwordHash: hashPassword(password || "123456"),
          isActive: studentData.accountStatus !== "Không hoạt động",
        }).returning();
        userId = newUser.id;
      }
    }

    if (userId) {
      studentData.userId = userId;
    }

    const [newStudent] = await tx.insert(students).values({
      ...studentData,
      relationshipIds: requestedRelationshipIds,
      customerSourceIds: studentData.customerSourceIds || [],
      classIds: Array.isArray(studentData.classIds) ? studentData.classIds : (studentData.classIds ? [studentData.classIds] : []),
      pipelineStage: Array.isArray(studentData.pipelineStage) ? studentData.pipelineStage : (studentData.pipelineStage ? [studentData.pipelineStage] : []),
    }).returning();

    if (locationIds && locationIds.length > 0) {
      await tx.insert(studentLocations).values(
        locationIds.map((locationId: string) => ({
          studentId: newStudent.id,
          locationId,
        }))
      );
    }

    // childIds is the inverse relation used by the parent form. Store the
    // relationship on each selected student's parentIds array.
    if (Array.isArray(childIds) && childIds.length > 0) {
      for (const childId of childIds.filter((value: string) => value && value !== newStudent.id)) {
        const [child] = await tx
          .select({ parentIds: students.parentIds })
          .from(students)
          .where(eq(students.id, childId));
        if (child) {
          await tx.update(students)
            .set({ parentIds: Array.from(new Set([...(child.parentIds || []), newStudent.id])) })
            .where(eq(students.id, childId));
        }
      }
    }

    // ── Record initial relationship history ──────────────────────────────────
    const initialRelIds: string[] = newStudent.relationshipIds || [];
    if (initialRelIds.length > 0) {
      const initRels = await tx.select().from(crmRelationships).where(inArray(crmRelationships.id, initialRelIds));
      const initRelMap = new Map(initRels.map(r => [r.id, r.name]));
      for (const relId of initialRelIds) {
        await tx.insert(studentRelationshipHistory).values({
          studentId: newStudent.id,
          fromRelationshipId: null,
          fromRelationshipName: null,
          toRelationshipId: relId,
          toRelationshipName: initRelMap.get(relId) ?? null,
          changedByUserId: null,
          changedByName: null,
          note: "Khởi tạo",
        });
      }
    }

    const fetchedStudent = await tx.query.students.findFirst({
      where: eq(students.id, newStudent.id),
      with: {
        locations: {
          with: {
            location: true
          }
        },
        user: true
      }
    });

    const allStaff = await tx.select().from(staff);
    const allRelationships = await tx.select().from(crmRelationships);
    const allSchools = fetchedStudent?.schoolIds?.length
      ? await tx.select().from(crmSchools).where(inArray(crmSchools.id, fetchedStudent.schoolIds))
      : [];
    const staffMap = new Map(allStaff.map(s => [s.id, s]));
    const relMap = new Map(allRelationships.map(r => [r.id, r]));

    return {
      ...fetchedStudent,
      location: fetchedStudent?.locations?.[0]?.location,
      salesBy: fetchedStudent?.salesByIds && fetchedStudent.salesByIds.length > 0 ? staffMap.get(fetchedStudent.salesByIds[0]) : undefined,
      salesByList: (fetchedStudent?.salesByIds || []).map(id => staffMap.get(id)).filter(Boolean) as StaffType[],
      managedByList: (fetchedStudent?.managedByIds || []).map(id => staffMap.get(id)).filter(Boolean) as StaffType[],
      teacherList: (fetchedStudent?.teacherIds || []).map(id => staffMap.get(id)).filter(Boolean) as StaffType[],
      relationshipList: (fetchedStudent?.relationshipIds || []).map(id => relMap.get(id)).filter(Boolean) as CrmRelationship[],
       schoolList: (fetchedStudent?.schoolIds || []).map(id => allSchools.find(s => s.id === id)).filter(Boolean) as CrmSchool[],
    } as StudentResponse;
  });
}

export async function updateStudent(id: string, updates: any, allowedLocationIds: string[], isSuperAdmin: boolean): Promise<StudentResponse> {
  const { locationIds, username, password, childIds, classId, ...studentUpdates } = updates;
  if (classId !== undefined && studentUpdates.classIds === undefined) {
    studentUpdates.classIds = classId ? [classId] : [];
  }

  return await db.transaction(async (tx) => {
    let whereClause = eq(students.id, id);
    if (!isSuperAdmin) {
      whereClause = and(
        whereClause,
        sql`EXISTS (SELECT 1 FROM student_locations WHERE student_locations.student_id = students.id AND student_locations.location_id = ANY(ARRAY[${sql.raw(allowedLocationIds.map(id => `'${id}'`).join(','))}]::uuid[]))`
      ) as any;
    }

    const [existing] = await tx
      .select({
        id: students.id,
        relationshipIds: students.relationshipIds,
        pipelineStage: students.pipelineStage,
        userId: students.userId,
      })
      .from(students)
      .where(whereClause)
      .for("update");
    if (!existing) throw new Error("Student not found or access denied");

    const oldRelationshipIds: string[] = existing.relationshipIds || [];
    let userId = existing.userId;
    const effectiveUsername = username !== undefined ? String(username).trim() : undefined;

    // username/password live in users, not students. Keep these out of the
    // students UPDATE and synchronize the linked login account explicitly.
    if (effectiveUsername) {
      const [usernameOwner] = await tx
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(sql`LOWER(${users.username}) = LOWER(${effectiveUsername})`)
        .for("update");
      if (usernameOwner && usernameOwner.id !== userId) {
        const [[linkedStaff], [linkedStudent]] = await Promise.all([
          tx.select({ id: staff.id }).from(staff).where(eq(staff.userId, usernameOwner.id)).limit(1),
          tx.select({ id: students.id }).from(students).where(eq(students.userId, usernameOwner.id)).limit(1),
        ]);
        if (linkedStaff || linkedStudent || usernameOwner.username.toLowerCase() === "admin") {
          const conflict: any = new Error(`Tài khoản "${effectiveUsername}" đã tồn tại trong hệ thống`);
          conflict.code = "23505";
          conflict.constraint = "users_username_key";
          throw conflict;
        }

        if (userId) {
          await tx
            .update(users)
            .set({
              username: `__orphaned__${usernameOwner.id}`,
              isActive: false,
              updatedAt: new Date(),
            })
            .where(eq(users.id, usernameOwner.id));
        } else {
          userId = usernameOwner.id;
        }
      }
    }

    if (effectiveUsername && !userId) {
      const [newUser] = await tx.insert(users).values({
        username: effectiveUsername,
        passwordHash: hashPassword(password || "123456"),
        isActive: studentUpdates.accountStatus !== "Không hoạt động",
      }).returning({ id: users.id });
      userId = newUser.id;
    }
    if (userId && (effectiveUsername || password || studentUpdates.accountStatus !== undefined)) {
      const userUpdates: Record<string, any> = {};
      if (effectiveUsername) userUpdates.username = effectiveUsername;
      if (password?.trim()) userUpdates.passwordHash = hashPassword(password.trim());
      if (studentUpdates.accountStatus !== undefined) {
        userUpdates.isActive = studentUpdates.accountStatus === "Hoạt động";
      }
      if (Object.keys(userUpdates).length > 0) {
        userUpdates.updatedAt = new Date();
        await tx.update(users).set(userUpdates).where(eq(users.id, userId));
      }
    }

    if (Object.keys(studentUpdates).length > 0 || userId !== existing.userId) {
      const updatesToApply: any = { ...studentUpdates };
      if (userId !== existing.userId) updatesToApply.userId = userId;

      if (studentUpdates.pipelineStage !== undefined) {
        const stageNames: string[] = Array.isArray(studentUpdates.pipelineStage)
          ? studentUpdates.pipelineStage
          : (studentUpdates.pipelineStage ? [studentUpdates.pipelineStage] : []);
        updatesToApply.pipelineStage = stageNames;
        if (!studentUpdates.relationshipIds) {
          if (stageNames.length > 0) {
            const rels = await tx.select().from(crmRelationships).where(inArray(crmRelationships.name, stageNames));
            updatesToApply.relationshipIds = rels.map(r => r.id);
          } else {
            updatesToApply.relationshipIds = [];
          }
        }
      }

      if (studentUpdates.relationshipIds) {
        updatesToApply.relationshipIds = studentUpdates.relationshipIds;
        if (studentUpdates.relationshipIds.length > 0 && !studentUpdates.pipelineStage) {
          const allRels = await tx.select().from(crmRelationships).where(inArray(crmRelationships.id, studentUpdates.relationshipIds));
          if (allRels.length > 0) {
            updatesToApply.pipelineStage = allRels.map(r => r.name);
          }
        }
      }
      if (studentUpdates.customerSourceIds) {
        updatesToApply.customerSourceIds = studentUpdates.customerSourceIds;
      }
      if (studentUpdates.classIds !== undefined) {
        updatesToApply.classIds = Array.isArray(studentUpdates.classIds) ? studentUpdates.classIds : [];
      }
      await tx.update(students).set(updatesToApply).where(eq(students.id, id));

      // ── Record relationship history if relationshipIds changed ──────────────
      const newRelationshipIds: string[] = updatesToApply.relationshipIds ?? oldRelationshipIds;
      const oldSet = new Set(oldRelationshipIds);
      const newSet = new Set(newRelationshipIds);

      const addedIds = newRelationshipIds.filter(rid => !oldSet.has(rid));
      const removedIds = oldRelationshipIds.filter(rid => !newSet.has(rid));

      if (addedIds.length > 0 || removedIds.length > 0) {
        // Fetch relationship names for added and removed IDs
        const allChangedIds = [...addedIds, ...removedIds];
        const relRecords = allChangedIds.length > 0
          ? await tx.select().from(crmRelationships).where(inArray(crmRelationships.id, allChangedIds))
          : [];
        const relNameMap = new Map(relRecords.map(r => [r.id, r.name]));
        const oldStageNames: string[] = Array.isArray(existing.pipelineStage) ? existing.pipelineStage : [];
        const oldRelationshipName = (relationshipId: string) => {
          const relationshipIndex = oldRelationshipIds.indexOf(relationshipId);
          return relNameMap.get(relationshipId)
            ?? (relationshipIndex >= 0 ? oldStageNames[relationshipIndex] : null)
            ?? null;
        };
        const existingRelationshipId = (relationshipId: string) =>
          relNameMap.has(relationshipId) ? relationshipId : null;

        const changedByUserId: string | null = studentUpdates.updatedBy ?? null;
        let changedByName: string | null = null;
        if (changedByUserId) {
          const [u] = await tx.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, changedByUserId));
          changedByName = u?.username ?? null;
        }

        // Simple 1→1 transition: record as (from=A, to=B)
        if (removedIds.length === 1 && addedIds.length === 1) {
          await tx.insert(studentRelationshipHistory).values({
            studentId: id,
            fromRelationshipId: existingRelationshipId(removedIds[0]),
            fromRelationshipName: oldRelationshipName(removedIds[0]),
            toRelationshipId: existingRelationshipId(addedIds[0]),
            toRelationshipName: relNameMap.get(addedIds[0]) ?? null,
            changedByUserId,
            changedByName,
          });
        } else {
          // Multiple changes: record each removal and each addition separately
          for (const removedId of removedIds) {
            await tx.insert(studentRelationshipHistory).values({
              studentId: id,
              fromRelationshipId: existingRelationshipId(removedId),
              fromRelationshipName: oldRelationshipName(removedId),
              toRelationshipId: null,
              toRelationshipName: null,
              changedByUserId,
              changedByName,
            });
          }
          for (const addedId of addedIds) {
            await tx.insert(studentRelationshipHistory).values({
              studentId: id,
              fromRelationshipId: null,
              fromRelationshipName: null,
              toRelationshipId: existingRelationshipId(addedId),
              toRelationshipName: relNameMap.get(addedId) ?? null,
              changedByUserId,
              changedByName,
            });
          }
        }
      }
    }

    // childIds is a form-only inverse of students.parentIds. Reconcile the
    // selected children without overwriting their other parent assignments.
    if (childIds !== undefined) {
      const currentChildren = await tx
        .select({ id: students.id, parentIds: students.parentIds })
        .from(students)
        .where(sql`${students.parentIds} @> ARRAY[${id}::uuid]`);
      const desiredChildIds = (Array.isArray(childIds) ? childIds : [])
        .filter((childId: string) => childId && childId !== id)
        .filter((childId: string, index: number, values: string[]) => values.indexOf(childId) === index);
      const childIdsToCheck = [
        ...currentChildren.map(child => child.id),
        ...desiredChildIds,
      ].filter((childId: string, index: number, values: string[]) => values.indexOf(childId) === index);
      for (const childId of childIdsToCheck) {
        const child = currentChildren.find(record => record.id === childId);
        const currentParentIds = child?.parentIds || [];
        const nextParentIds = desiredChildIds.includes(childId)
          ? [...currentParentIds, id].filter((parentId: string, index: number, values: string[]) => values.indexOf(parentId) === index)
          : currentParentIds.filter(parentId => parentId !== id);
        if (JSON.stringify(currentParentIds) !== JSON.stringify(nextParentIds)) {
          await tx.update(students).set({ parentIds: nextParentIds }).where(eq(students.id, childId));
        }
      }
    }

    if (locationIds) {
      await tx.delete(studentLocations).where(eq(studentLocations.studentId, id));
      if (locationIds.length > 0) {
        await tx.insert(studentLocations).values(
          locationIds.map((locationId: string) => ({
            studentId: id,
            locationId,
          }))
        );
      }
    }

    const student = await tx.query.students.findFirst({
      where: eq(students.id, id),
      with: {
        locations: {
          with: {
            location: true
          }
        },
        user: true
      }
    });
    const allSchools = student?.schoolIds?.length
      ? await tx.select().from(crmSchools).where(inArray(crmSchools.id, student.schoolIds))
      : [];

    const allStaff = await tx.select().from(staff);
    const allRelationships = await tx.select().from(crmRelationships);
    const allClasses = await tx.select().from(classes);
    const allStudentClasses = await tx.select().from(studentClasses);
    const childRows = await tx
      .select({ id: students.id })
      .from(students)
      .where(sql`${students.parentIds} @> ARRAY[${id}::uuid]`);
    const staffMap = new Map(allStaff.map(s => [s.id, s]));
    const relMap = new Map(allRelationships.map(r => [r.id, r]));
    const classMap = new Map(allClasses.map(c => [c.id, c]));

    return {
      ...student,
      location: student?.locations?.[0]?.location,
      salesBy: student?.salesByIds && student.salesByIds.length > 0 ? staffMap.get(student.salesByIds[0]) : undefined,
      salesByList: (student?.salesByIds || []).map(id => staffMap.get(id)).filter(Boolean) as StaffType[],
      managedByList: (student?.managedByIds || []).map(id => staffMap.get(id)).filter(Boolean) as StaffType[],
      teacherList: (student?.teacherIds || []).map(id => staffMap.get(id)).filter(Boolean) as StaffType[],
      relationshipList: (student?.relationshipIds || []).map(id => relMap.get(id)).filter(Boolean) as CrmRelationship[],
       schoolList: (student?.schoolIds || []).map(id => allSchools.find(s => s.id === id)).filter(Boolean) as CrmSchool[],
    childIds: childRows.map(child => child.id),
      classNames: (student?.classIds || []).map(id => classMap.get(id)?.name).filter(Boolean) as string[],
      classDetails: (student?.classIds || []).map(classId => {
        const studentClassRecord = allStudentClasses.find(sc => sc.studentId === student?.id && sc.classId === classId);
        const classRecord = classMap.get(classId);
        return {
          className: classRecord?.name || '',
          classCode: classRecord?.classCode || '',
          studentStatus: studentClassRecord?.studentStatus || 'Không xác định',
          startDate: studentClassRecord?.startDate || null,
          endDate: studentClassRecord?.endDate || null,
          totalSessions: studentClassRecord?.totalSessions || 0,
          attendedSessions: studentClassRecord?.attendedSessions || 0,
          remainingSessions: studentClassRecord?.remainingSessions || 0,
        };
      }).filter(c => c.className),
    } as StudentResponse;
  });
}

export async function deleteStudent(id: string, allowedLocationIds: string[], isSuperAdmin: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    let whereClause = eq(students.id, id);
    if (!isSuperAdmin) {
      whereClause = and(
        whereClause,
        sql`EXISTS (SELECT 1 FROM student_locations WHERE student_locations.student_id = students.id AND student_locations.location_id = ANY(ARRAY[${sql.raw(allowedLocationIds.map(id => `'${id}'`).join(','))}]::uuid[]))`
      ) as any;
    }

    const [existing] = await tx
      .select({ id: students.id, userId: students.userId })
      .from(students)
      .where(whereClause)
      .for("update");
    if (!existing) throw new Error("Student not found or access denied");

    const enrolledClasses = await tx
      .select({
        className: classes.name,
        classCode: classes.classCode,
      })
      .from(studentClasses)
      .innerJoin(classes, eq(studentClasses.classId, classes.id))
      .where(eq(studentClasses.studentId, id));

    const studentInvoices = await tx
      .select({
        id: invoices.id,
        code: invoices.code,
        type: invoices.type,
        status: invoices.status,
      })
      .from(invoices)
      .where(eq(invoices.studentId, id));

    const classNames = Array.from(
      new Set(
        enrolledClasses.map(({ className, classCode }) =>
          classCode && classCode !== className ? `${className} (${classCode})` : className
        )
      )
    );
    const invoiceLabels = Array.from(
      new Set(
        studentInvoices.map(({ id: invoiceId, code, type, status }) => {
          const invoiceLabel = code || `ID ${invoiceId.slice(0, 8)}`;
          const details = [type, status].filter(Boolean).join(" · ");
          return details ? `${invoiceLabel} (${details})` : invoiceLabel;
        })
      )
    );

    if (classNames.length > 0 || invoiceLabels.length > 0) {
      const details: string[] = [];
      if (classNames.length > 0) {
        details.push(`đang được ghi danh trong lớp: ${classNames.join(", ")}`);
      }
      if (invoiceLabels.length > 0) {
        details.push(`đã có hoá đơn: ${invoiceLabels.join(", ")}`);
      }
      const error = new Error(
        `Không thể xoá học viên vì ${details.join("; ")}. Vui lòng xử lý các dữ liệu liên quan trước.`
      );
      (error as any).code = "STUDENT_HAS_RELATED_RECORDS";
      (error as any).classes = classNames;
      (error as any).invoices = invoiceLabels;
      throw error;
    }

    await tx.delete(students).where(eq(students.id, id));
    if (existing.userId) {
      const [[linkedStaff], [linkedStudent]] = await Promise.all([
        tx.select({ id: staff.id }).from(staff).where(eq(staff.userId, existing.userId)).limit(1),
        tx.select({ id: students.id }).from(students).where(eq(students.userId, existing.userId)).limit(1),
      ]);
      if (!linkedStaff && !linkedStudent) {
        await tx
          .update(users)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(users.id, existing.userId));
      }
    }
  });
}

// ==========================================
// DASHBOARD STATS
// ==========================================

export async function getDashboardStats(allowedLocationIds: string[], isSuperAdmin: boolean): Promise<{ totalStudents: number; totalStaff: number; totalLocations: number }> {
  let studentWhere = sql`1=1`;
  let staffWhere = sql`1=1`;
  let locationWhere = sql`1=1`;

  if (!isSuperAdmin) {
    studentWhere = sql`EXISTS (SELECT 1 FROM student_locations WHERE student_locations.student_id = students.id AND student_locations.location_id = ANY(ARRAY[${sql.raw(allowedLocationIds.map(id => `'${id}'`).join(','))}]::uuid[]))`;
    staffWhere = sql`EXISTS (SELECT 1 FROM ${staffAssignments} WHERE ${staffAssignments.staffId} = ${staff.id} AND ${staffAssignments.locationId} = ANY(ARRAY[${sql.raw(allowedLocationIds.map(id => `'${id}'`).join(','))}]::uuid[]))`;
    locationWhere = inArray(locations.id, allowedLocationIds);
  }

  const [[studentsCount], [staffCount], [locationsCount]] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(students).where(studentWhere),
    db.select({ count: sql<number>`count(*)` }).from(staff).where(staffWhere),
    db.select({ count: sql<number>`count(*)` }).from(locations).where(locationWhere)
  ]);

  return {
    totalStudents: Number(studentsCount.count),
    totalStaff: Number(staffCount.count),
    totalLocations: Number(locationsCount.count)
  };
}

// ==========================================
// CRM CONFIGURATION
// ==========================================

export async function getCrmPipelineGroups(): Promise<CrmPipelineGroup[]> {
  return await db.select().from(crmPipelineGroups).orderBy(asc(crmPipelineGroups.position), sql`${crmPipelineGroups.createdAt} asc`);
}

export async function createCrmPipelineGroup(data: InsertCrmPipelineGroup): Promise<CrmPipelineGroup> {
  const [res] = await db.insert(crmPipelineGroups).values(data).returning();
  return res;
}

export async function updateCrmPipelineGroup(id: string, data: Partial<InsertCrmPipelineGroup>): Promise<CrmPipelineGroup> {
  const [res] = await db.update(crmPipelineGroups).set(data).where(eq(crmPipelineGroups.id, id)).returning();
  return res;
}

export async function deleteCrmPipelineGroup(id: string): Promise<void> {
  await db.delete(crmPipelineGroups).where(eq(crmPipelineGroups.id, id));
}

export async function getCrmRelationships(allowedLocationIds: string[], isSuperAdmin: boolean): Promise<(CrmRelationship & { isUsed?: boolean })[]> {
  const relationships = await db
    .select()
    .from(crmRelationships)
    .orderBy(sql`${crmRelationships.createdAt} asc`);
  const usedRows = await db.execute(sql`
    SELECT DISTINCT unnest(relationship_ids)::text AS id
    FROM students
    WHERE relationship_ids IS NOT NULL
  `);
  const usedIds = new Set(usedRows.rows.map((row: any) => String(row.id)));
  const rows = relationships.map((relationship) => ({
    ...relationship,
    isUsed: usedIds.has(relationship.id),
  }));

  // Older production databases may briefly contain more than one row marked
  // as the protected default. Return a single canonical row immediately while
  // the startup migration consolidates the underlying records.
  const systemDefaults = rows.filter((relationship) => relationship.isSystemDefault);
  if (systemDefaults.length <= 1) return rows;

  const canonicalDefault = systemDefaults[0];
  const defaultIsUsed = systemDefaults.some((relationship) => relationship.isUsed);
  return rows
    .filter((relationship) => !relationship.isSystemDefault || relationship.id === canonicalDefault.id)
    .map((relationship) =>
      relationship.id === canonicalDefault.id
        ? { ...relationship, isUsed: defaultIsUsed }
        : relationship
    );
}

export async function createCrmRelationship(data: InsertCrmRelationship): Promise<CrmRelationship> {
  if (data.isSystemDefault) {
    const error = new Error("Mối quan hệ mặc định của hệ thống chỉ được tạo khi khởi động.");
    (error as any).statusCode = 409;
    throw error;
  }
  const [res] = await db.insert(crmRelationships).values(data).returning();
  return res;
}

export async function updateCrmRelationship(id: string, data: Partial<InsertCrmRelationship>): Promise<CrmRelationship> {
  const [current] = await db
    .select({ id: crmRelationships.id, isSystemDefault: crmRelationships.isSystemDefault })
    .from(crmRelationships)
    .where(eq(crmRelationships.id, id));
  if (current?.isSystemDefault || data.isSystemDefault) {
    const error = new Error("Không thể chỉnh sửa mối quan hệ mặc định của hệ thống.");
    (error as any).statusCode = 409;
    throw error;
  }
  const [res] = await db.update(crmRelationships).set(data).where(eq(crmRelationships.id, id)).returning();
  return res;
}

export async function deleteCrmRelationship(id: string): Promise<void> {
  const [current] = await db
    .select({ id: crmRelationships.id, isSystemDefault: crmRelationships.isSystemDefault })
    .from(crmRelationships)
    .where(eq(crmRelationships.id, id));
  if (current?.isSystemDefault) {
    const error = new Error("Không thể xoá mối quan hệ mặc định của hệ thống.");
    (error as any).statusCode = 409;
    throw error;
  }
  await db.delete(crmRelationships).where(eq(crmRelationships.id, id));
}

export async function getCrmRejectReasons(allowedLocationIds: string[], isSuperAdmin: boolean): Promise<CrmRejectReason[]> {
  return await db.select().from(crmRejectReasons).orderBy(sql`${crmRejectReasons.createdAt} asc`);
}

export async function createCrmRejectReason(data: InsertCrmRejectReason): Promise<CrmRejectReason> {
  const [res] = await db.insert(crmRejectReasons).values(data).returning();
  return res;
}

export async function updateCrmRejectReason(id: string, data: Partial<InsertCrmRejectReason>): Promise<CrmRejectReason> {
  const [res] = await db.update(crmRejectReasons).set(data).where(eq(crmRejectReasons.id, id)).returning();
  return res;
}

export async function deleteCrmRejectReason(id: string): Promise<void> {
  await db.delete(crmRejectReasons).where(eq(crmRejectReasons.id, id));
}

export async function getCrmCustomerSources(allowedLocationIds: string[], isSuperAdmin: boolean): Promise<CrmCustomerSource[]> {
  return await db.select().from(crmCustomerSources).orderBy(sql`${crmCustomerSources.createdAt} asc`);
}

export async function createCrmCustomerSource(data: InsertCrmCustomerSource): Promise<CrmCustomerSource> {
  const [res] = await db.insert(crmCustomerSources).values(data).returning();
  return res;
}

export async function updateCrmCustomerSource(id: string, data: Partial<InsertCrmCustomerSource>): Promise<CrmCustomerSource> {
  const [res] = await db.update(crmCustomerSources).set(data).where(eq(crmCustomerSources.id, id)).returning();
  return res;
}

export async function deleteCrmCustomerSource(id: string): Promise<void> {
  await db.delete(crmCustomerSources).where(eq(crmCustomerSources.id, id));
}

export async function getCrmSchools(): Promise<CrmSchool[]> {
  return await db.select().from(crmSchools).orderBy(sql`${crmSchools.createdAt} asc`);
}

export async function createCrmSchool(data: InsertCrmSchool): Promise<CrmSchool> {
  const [res] = await db.insert(crmSchools).values(data).returning();
  return res;
}

export async function updateCrmSchool(id: string, data: Partial<InsertCrmSchool>): Promise<CrmSchool> {
  const [res] = await db.update(crmSchools).set({ ...data, updatedAt: new Date() }).where(eq(crmSchools.id, id)).returning();
  return res;
}

export async function deleteCrmSchool(id: string): Promise<void> {
  await db.delete(crmSchools).where(eq(crmSchools.id, id));
}

// ── CRM Registration Form Fields ─────────────────────────────────────────────
export async function getCrmRegistrationFormFields(): Promise<{ fieldKey: string; isVisible: boolean; isRequired: boolean }[]> {
  const rows = await db.select().from(crmRegistrationFormFields);
  return rows.map(r => ({ fieldKey: r.fieldKey, isVisible: r.isVisible, isRequired: r.isRequired }));
}

export async function upsertCrmRegistrationFormField(
  fieldKey: string,
  isVisible: boolean,
  isRequired?: boolean,
): Promise<{ fieldKey: string; isVisible: boolean; isRequired: boolean }> {
  const setClause: any = { isVisible, updatedAt: new Date() };
  if (isRequired !== undefined) setClause.isRequired = isRequired;
  const [res] = await db
    .insert(crmRegistrationFormFields)
    .values({ fieldKey, isVisible, ...(isRequired !== undefined ? { isRequired } : {}) })
    .onConflictDoUpdate({
      target: crmRegistrationFormFields.fieldKey,
      set: setClause,
    })
    .returning();
  return { fieldKey: res.fieldKey, isVisible: res.isVisible, isRequired: res.isRequired };
}

export async function getCrmRequiredFields(): Promise<{ fieldKey: string; isRequired: boolean }[]> {
  const rows = await db.select().from(crmRequiredFields);
  return rows.map(r => ({ fieldKey: r.fieldKey, isRequired: r.isRequired }));
}

export async function upsertCrmRequiredField(fieldKey: string, isRequired: boolean): Promise<{ fieldKey: string; isRequired: boolean }> {
  const [res] = await db
    .insert(crmRequiredFields)
    .values({ fieldKey, isRequired })
    .onConflictDoUpdate({
      target: crmRequiredFields.fieldKey,
      set: { isRequired, updatedAt: new Date() },
    })
    .returning();
  return { fieldKey: res.fieldKey, isRequired: res.isRequired };
}

// ── CRM Custom Fields ───────────────────────────────────────────────────────
export async function getCrmCustomFields(): Promise<CrmCustomField[]> {
  return await db
    .select()
    .from(crmCustomFields)
    .orderBy(asc(crmCustomFields.position), asc(crmCustomFields.createdAt));
}

export async function createCrmCustomField(data: InsertCrmCustomField): Promise<CrmCustomField> {
  const [res] = await db.insert(crmCustomFields).values(data).returning();
  return res;
}

export async function updateCrmCustomField(id: string, data: Partial<InsertCrmCustomField>): Promise<CrmCustomField> {
  const [res] = await db
    .update(crmCustomFields)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(crmCustomFields.id, id))
    .returning();
  return res;
}

export async function deleteCrmCustomField(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Strip the value from every student's custom_fields jsonb
    await tx.execute(sql`UPDATE students SET custom_fields = COALESCE(custom_fields, '{}'::jsonb) - ${id} WHERE custom_fields ? ${id}`);
    // Remove the linked required-field row, if any
    await tx.delete(crmRequiredFields).where(eq(crmRequiredFields.fieldKey, `custom:${id}`));
    await tx.delete(crmCustomFields).where(eq(crmCustomFields.id, id));
  });
}

// ==========================================
// STUDENT COMMENTS & CLASSES
// ==========================================

export async function getStudentComments(studentId: string): Promise<(StudentComment & { user: User })[]> {
  const comments = await db.select()
    .from(studentComments)
    .leftJoin(users, eq(studentComments.userId, users.id))
    .where(eq(studentComments.studentId, studentId))
    .orderBy(asc(studentComments.createdAt));

  return comments.map(row => ({
    ...row.student_comments!,
    user: row.users!
  }));
}

export async function createStudentComment(comment: InsertStudentComment): Promise<StudentComment> {
  const [newComment] = await db.insert(studentComments).values(comment).returning();
  return newComment;
}

export async function getStudentClassesSummary(
  studentId: string,
  page: number = 1,
  limit: number = 8
): Promise<{ items: any[]; total: number; totalPages: number }> {
  const offset = (page - 1) * limit;
  const escapedId = studentId.replace(/'/g, "''");

  const queryStr = `
    SELECT
      sc.id,
      sc.status,
      c.id        AS class_id,
      c.name      AS class_name,
      c.class_code,
      c.start_date,
      c.end_date,
      COUNT(DISTINCT ss.id)  AS total_sessions,
      COUNT(DISTINCT CASE WHEN ss.attendance_status = 'present' THEN ss.id END) AS attended_sessions,
      COALESCE((
        SELECT SUM(i.paid_amount)
        FROM invoices i
        WHERE i.student_id = '${escapedId}'
          AND i.class_id   = c.id
          AND i.type       = 'Thu'
      ), 0) AS invoice_paid_total
    FROM student_classes sc
    JOIN classes c ON c.id = sc.class_id
    LEFT JOIN student_sessions ss ON (
      ss.student_class_id = sc.id
      OR (ss.student_class_id IS NULL AND ss.student_id = '${escapedId}' AND ss.class_id = c.id)
    )
    WHERE sc.student_id = '${escapedId}'
    GROUP BY sc.id, sc.status, c.id, c.name, c.class_code, c.start_date, c.end_date
    ORDER BY COALESCE(c.start_date, '1970-01-01') DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countStr = `SELECT COUNT(*) AS total FROM student_classes WHERE student_id = '${escapedId}'`;

  const [result, countResult] = await Promise.all([
    db.execute(sql.raw(queryStr)),
    db.execute(sql.raw(countStr)),
  ]);

  const total = parseInt((countResult.rows[0] as any)?.total ?? "0", 10);
  return {
    items: (result.rows as any[]).map(r => ({
      id: r.id,
      status: r.status,
      class: {
        id:        r.class_id,
        name:      r.class_name,
        classCode: r.class_code,
        startDate: r.start_date,
        endDate:   r.end_date,
      },
      totalSessions:    Number(r.total_sessions    || 0),
      attendedSessions: Number(r.attended_sessions || 0),
      invoicePaidTotal: Number(r.invoice_paid_total || 0),
    })),
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getStudentClasses(
  studentId: string,
  opts?: { sessionsPage?: number; sessionsLimit?: number }
): Promise<any[]> {
  void opts; // pagination handled by dedicated endpoint; kept for API compat

  // ── Q1 + Q2 in parallel ─────────────────────────────────────────────────────
  const [enrollments, sessionClassRows] = await Promise.all([
    db.select()
      .from(studentClasses)
      .leftJoin(classes, eq(studentClasses.classId, classes.id))
      .leftJoin(courseFeePackages, eq(classes.feePackageId, courseFeePackages.id))
      .where(eq(studentClasses.studentId, studentId)),
    db.selectDistinct({ classId: studentSessions.classId })
      .from(studentSessions)
      .where(eq(studentSessions.studentId, studentId)),
  ]);

  const enrolledClassIds = new Set(
    enrollments.map(e => e.classes?.id).filter(Boolean) as string[]
  );

  const extraClassIds = sessionClassRows
    .map(r => r.classId)
    .filter((id): id is string => !!id && !enrolledClassIds.has(id));

  // ── Q3: details for extra classes (conditional, single batch) ───────────────
  if (extraClassIds.length > 0) {
    const extraClasses = await db.select()
      .from(classes)
      .leftJoin(courseFeePackages, eq(classes.feePackageId, courseFeePackages.id))
      .where(inArray(classes.id, extraClassIds));

    for (const ec of extraClasses) {
      enrollments.push({
        student_classes: null as any,
        classes: ec.classes,
        course_fee_packages: ec.course_fee_packages,
      });
    }
  }

  const allClassIds = enrollments
    .map(e => e.classes?.id)
    .filter((id): id is string => !!id);

  if (allClassIds.length === 0) return [];

  const escapedStudentId = studentId.replace(/'/g, "''");
  const classIdList = allClassIds.map(id => `'${id.replace(/'/g, "''")}'`).join(",");

  // ── Q4 (lightweight aggregate): session stats per class via CTE ─────────────
  // JOIN-based approach avoids correlated subquery; attendance_fee_rules join
  // computes attendedFeeTotal server-side. No session rows returned.
  const statsQueryStr = `
    WITH target_sessions AS (
      SELECT ss.id, ss.class_id, ss.attendance_status, ss.session_price
      FROM student_sessions ss
      WHERE ss.student_id = '${escapedStudentId}'
        AND ss.class_id IN (${classIdList})
    ),
    session_allocs AS (
      SELECT isa.student_session_id, SUM(isa.allocated_amount) AS total_alloc
      FROM invoice_session_allocations isa
      INNER JOIN target_sessions ts ON ts.id = isa.student_session_id
      GROUP BY isa.student_session_id
    )
    SELECT
      ts.class_id,
      COUNT(ts.id) AS total_sessions,
      COUNT(CASE WHEN ts.attendance_status IS NULL
                   OR ts.attendance_status IN ('pending','scheduled') THEN 1 END) AS not_attended_count,
      COALESCE(SUM(
        CASE WHEN afr.deducts_fee = true
        THEN COALESCE(sa.total_alloc, ts.session_price, 0)
        END
      ), 0) AS attended_fee_total
    FROM target_sessions ts
    LEFT JOIN attendance_fee_rules afr ON afr.attendance_status = ts.attendance_status
    LEFT JOIN session_allocs sa ON sa.student_session_id = ts.id
    GROUP BY ts.class_id
  `;

  // ── Q5: invoice paid totals per class ──────────────────────────────────────
  const [statsResult, allInvoices] = await Promise.all([
    db.execute(sql.raw(statsQueryStr)),
    db.select({ classId: invoices.classId, paidAmount: invoices.paidAmount })
      .from(invoices)
      .where(and(
        eq(invoices.studentId, studentId),
        inArray(invoices.classId, allClassIds),
        eq(invoices.type, "Thu"),
      )),
  ]);

  const statsByClassId = new Map<string, { totalSessions: number; notAttendedCount: number; attendedFeeTotal: number }>();
  for (const row of statsResult.rows as any[]) {
    statsByClassId.set(row.class_id, {
      totalSessions:    Number(row.total_sessions    || 0),
      notAttendedCount: Number(row.not_attended_count || 0),
      attendedFeeTotal: Number(row.attended_fee_total || 0),
    });
  }

  const invoicePaidByClassId = new Map<string, number>();
  for (const inv of allInvoices) {
    if (!inv.classId) continue;
    invoicePaidByClassId.set(
      inv.classId,
      (invoicePaidByClassId.get(inv.classId) ?? 0) + Number(inv.paidAmount || 0)
    );
  }

  // ── Build result (no sessions array — sessions fetched on-demand per class) ──
  const result = [];
  for (const enrollment of enrollments) {
    const classRec = enrollment.classes;
    if (!classRec) continue;
    const stats = statsByClassId.get(classRec.id) ?? { totalSessions: 0, notAttendedCount: 0, attendedFeeTotal: 0 };
    result.push({
      studentClass:     enrollment.student_classes,
      class:            classRec,
      feePackage:       enrollment.course_fee_packages,
      invoicePaidTotal: invoicePaidByClassId.get(classRec.id) ?? 0,
      totalSessions:    stats.totalSessions,
      notAttendedCount: stats.notAttendedCount,
      attendedFeeTotal: stats.attendedFeeTotal,
    });
  }
  return result;
}

// Paginated sessions for a single class — used by the dedicated sessions endpoint
export async function getStudentClassSessions(params: {
  studentId: string;
  classId: string;
  page: number;
  limit: number;
}): Promise<{ sessions: any[]; total: number; page: number; limit: number; totalPages: number }> {
  const { studentId, classId, page, limit } = params;
  const offset = (page - 1) * limit;

  const rows = await db.select()
    .from(studentSessions)
    .leftJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
    .leftJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
    .leftJoin(courseFeePackages, eq(studentSessions.packageId, courseFeePackages.id))
    .where(and(
      eq(studentSessions.studentId, studentId),
      eq(studentSessions.classId, classId),
    ))
    .orderBy(asc(studentSessions.sessionOrder));

  const total = rows.length;
  const pageRows = rows.slice(offset, offset + limit);

  const sessionIds = pageRows.map(s => s.student_sessions?.id).filter((id): id is string => !!id);
  const allocationMap = new Map<string, number>();
  if (sessionIds.length > 0) {
    const allocations = await db.select()
      .from(invoiceSessionAllocations)
      .where(inArray(invoiceSessionAllocations.studentSessionId, sessionIds));
    for (const alloc of allocations) {
      allocationMap.set(
        alloc.studentSessionId,
        (allocationMap.get(alloc.studentSessionId) ?? 0) + Number(alloc.allocatedAmount)
      );
    }
  }

  return {
    sessions: pageRows.map(s => ({
      studentSession: s.student_sessions,
      classSession:   s.class_sessions,
      shiftTemplate:  s.shift_templates,
      feePackage:     s.course_fee_packages,
      allocatedFee: s.student_sessions?.id
        ? (allocationMap.get(s.student_sessions.id) ?? (s.student_sessions.sessionPrice != null ? Number(s.student_sessions.sessionPrice) : null))
        : null,
    })),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

// ==========================================
// INVOICE SUBJECT SEARCH
// ==========================================

export type InvoiceSubjectResult = {
  id: string;
  code: string | null;
  fullName: string;
  type: string | null;
  phone: string | null;
  entityType: "student" | "staff";
};

export async function searchInvoiceSubjects(params: {
  locationId?: string;
  searchTerm?: string;
  limit?: number;
  allowedLocationIds?: string[] | null;
}): Promise<InvoiceSubjectResult[]> {
  const { locationId, searchTerm, limit = 20, allowedLocationIds } = params;
  const searchPattern = searchTerm ? `%${searchTerm.toLowerCase()}%` : null;

  // Determine effective location filter: prefer specific locationId, then fallback to allowedLocationIds
  const effectiveLocationId = locationId;
  const mustFilterByAllowed = allowedLocationIds !== null && allowedLocationIds !== undefined && allowedLocationIds.length > 0;

  let studentWhere: any = undefined;

  // Student location filter
  if (effectiveLocationId) {
    // Filter by specific location (must also be in allowed list)
    if (mustFilterByAllowed && !allowedLocationIds!.includes(effectiveLocationId)) {
      // User doesn't have access to this location, return empty
      return [];
    }
    if (searchPattern) {
      studentWhere = sql`EXISTS (SELECT 1 FROM student_locations sl WHERE sl.student_id = ${students.id} AND sl.location_id = ${effectiveLocationId})
        AND (LOWER(${students.fullName}) LIKE ${searchPattern} OR LOWER(${students.code}) LIKE ${searchPattern})`;
    } else {
      studentWhere = sql`EXISTS (SELECT 1 FROM student_locations sl WHERE sl.student_id = ${students.id} AND sl.location_id = ${effectiveLocationId})`;
    }
  } else if (mustFilterByAllowed) {
    // Filter by all allowed locations
    if (searchPattern) {
      studentWhere = sql`EXISTS (SELECT 1 FROM student_locations WHERE student_locations.student_id = students.id AND student_locations.location_id = ANY(ARRAY[${sql.raw(allowedLocationIds!.map(id => `'${id}'`).join(','))}]::uuid[]))
        AND (LOWER(${students.fullName}) LIKE ${searchPattern} OR LOWER(${students.code}) LIKE ${searchPattern})`;
    } else {
      studentWhere = sql`EXISTS (SELECT 1 FROM student_locations WHERE student_locations.student_id = students.id AND student_locations.location_id = ANY(ARRAY[${sql.raw(allowedLocationIds!.map(id => `'${id}'`).join(','))}]::uuid[]))`;
    }
  } else if (allowedLocationIds === null) {
    // Super admin - no location restriction
    if (searchPattern) {
      studentWhere = sql`(LOWER(${students.fullName}) LIKE ${searchPattern} OR LOWER(${students.code}) LIKE ${searchPattern})`;
    }
  } else if (searchPattern) {
    studentWhere = sql`(LOWER(${students.fullName}) LIKE ${searchPattern} OR LOWER(${students.code}) LIKE ${searchPattern})`;
  }

  const studentRows = await db
    .select({ id: students.id, code: students.code, fullName: students.fullName, type: students.type, phone: students.phone, accountStatus: students.accountStatus })
    .from(students)
    .where(studentWhere)
    .limit(limit)
    .orderBy(
      searchPattern
        ? sql`CASE
            WHEN LOWER(${students.fullName}) = LOWER(${searchPattern.slice(1, -1)}) OR LOWER(${students.code}) = LOWER(${searchPattern.slice(1, -1)}) THEN 0
            WHEN LOWER(${students.fullName}) LIKE LOWER(${searchPattern.slice(1, -1) + "%"}) OR LOWER(${students.code}) LIKE LOWER(${searchPattern.slice(1, -1) + "%"}) THEN 1
            ELSE 2
          END, ${students.fullName}`
        : students.fullName
    );

  let staffRows: { id: string; code: string | null; fullName: string; phone: string | null }[] = [];
  if (searchPattern) {
    let staffWhere: any;
    if (locationId) {
      staffWhere = sql`(LOWER(${staff.fullName}) LIKE ${searchPattern} OR LOWER(COALESCE(${staff.code}, '')) LIKE ${searchPattern})
        AND EXISTS (SELECT 1 FROM staff_assignments sa WHERE sa.staff_id = ${staff.id} AND sa.location_id = ${locationId})`;
    } else {
      staffWhere = sql`(LOWER(${staff.fullName}) LIKE ${searchPattern} OR LOWER(COALESCE(${staff.code}, '')) LIKE ${searchPattern})`;
    }
    staffRows = await db
      .select({ id: staff.id, code: staff.code, fullName: staff.fullName, phone: staff.phone })
      .from(staff)
      .where(staffWhere)
      .limit(10)
      .orderBy(staff.fullName);
  }

  return [
    ...studentRows.map(r => ({ ...r, entityType: "student" as const })),
    ...staffRows.map(r => ({ ...r, type: "Nhân viên", entityType: "staff" as const })),
  ];
}

// ==========================================
// SHARED: build location WHERE clause string
// ==========================================
function buildLocationWhere(isSuperAdmin: boolean, allowedLocationIds: string[], locationId?: string): string {
  // If a specific locationId is requested (and it's not "all")
  if (locationId && locationId !== "all") {
    const safe = locationId.replace(/[^a-zA-Z0-9\-]/g, "");
    return `s.id IN (SELECT sl.student_id FROM student_locations sl WHERE sl.location_id = '${safe}'::uuid)`;
  }
  // SuperAdmin without filter → all
  if (isSuperAdmin) return "1=1";
  // Staff → their allowed locations
  if (allowedLocationIds.length === 0) return "1=0";
  const ids = allowedLocationIds.map(id => `'${id.replace(/[^a-zA-Z0-9\-]/g, "")}'`).join(",");
  return `s.id IN (SELECT sl.student_id FROM student_locations sl WHERE sl.location_id = ANY(ARRAY[${ids}]::uuid[]))`;
}

// ==========================================
// CUSTOMER SUMMARY (Tổng Khách hàng, Trạng thái tài khoản)
// ==========================================
export async function getCustomerSummary(params: {
  isSuperAdmin: boolean;
  allowedLocationIds: string[];
  locationId?: string;
}): Promise<{
  total: number;
  hocVien: number;
  hocVienPct: number;
  phuHuynh: number;
  phuHuynhPct: number;
  active: number;
  activePct: number;
  inactive: number;
}> {
  const locationWhere = buildLocationWhere(params.isSuperAdmin, params.allowedLocationIds, params.locationId);
  const queryStr = `
    SELECT
      COUNT(*)                                                    AS total,
      COUNT(*) FILTER (WHERE type = 'Học viên')                  AS hoc_vien,
      COUNT(*) FILTER (WHERE type = 'Phụ huynh')                 AS phu_huynh,
      COUNT(*) FILTER (WHERE account_status = 'Hoạt động' OR account_status IS NULL) AS active_count,
      COUNT(*) FILTER (WHERE account_status = 'Không hoạt động') AS inactive_count
    FROM students s
    WHERE ${locationWhere}
  `;
  const result = await db.execute(sql.raw(queryStr));
  const row: any = result.rows[0] ?? {};
  const total    = parseInt(row.total ?? "0", 10);
  const hocVien  = parseInt(row.hoc_vien ?? "0", 10);
  const phuHuynh = parseInt(row.phu_huynh ?? "0", 10);
  const active   = parseInt(row.active_count ?? "0", 10);
  const inactive = parseInt(row.inactive_count ?? "0", 10);
  return {
    total,
    hocVien,
    hocVienPct:  total > 0 ? Math.round((hocVien  / total) * 100) : 0,
    phuHuynh,
    phuHuynhPct: total > 0 ? Math.round((phuHuynh / total) * 100) : 0,
    active,
    activePct:   total > 0 ? Math.round((active   / total) * 100) : 0,
    inactive,
  };
}

// ==========================================
// NEW CUSTOMERS SUMMARY (Khách hàng mới)
// ==========================================
export async function getNewCustomersSummary(params: {
  isSuperAdmin: boolean;
  allowedLocationIds: string[];
  locationId?: string;
}): Promise<{
  today: number;
  thisMonth: number;
}> {
  const locationWhere = buildLocationWhere(params.isSuperAdmin, params.allowedLocationIds, params.locationId);
  const queryStr = `
    SELECT
      COUNT(*) FILTER (WHERE DATE(s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = CURRENT_DATE) AS today,
      COUNT(*) FILTER (
        WHERE DATE_TRUNC('month', s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
            = DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')
      ) AS this_month
    FROM students s
    WHERE ${locationWhere}
  `;
  const result = await db.execute(sql.raw(queryStr));
  const row: any = result.rows[0] ?? {};
  return {
    today:     parseInt(row.today      ?? "0", 10),
    thisMonth: parseInt(row.this_month ?? "0", 10),
  };
}

// ==========================================
// STUDENT LEARNING STATUS SUMMARY
// ==========================================
// Priority: dang_hoc > bao_luu > cho_lich > da_nghi > chua_co_lich

export async function getStudentLearningStatusSummary(params: {
  isSuperAdmin: boolean;
  allowedLocationIds: string[];
  locationId?: string;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;   // YYYY-MM-DD
}): Promise<{
  dangHoc: number;
  baoLuu: number;
  choLich: number;
  daNghi: number;
  chuaCoLich: number;
  total: number;
}> {
  const { isSuperAdmin, allowedLocationIds, dateFrom, dateTo } = params;
  const hasRange = !!(dateFrom && dateTo);

  // Build location WHERE clause as plain string to avoid nested sql fragment issues
  const locationWhere = buildLocationWhere(isSuperAdmin, allowedLocationIds, params.locationId);

  let queryStr: string;

  if (!hasRange) {
    queryStr = `
      WITH session_stats AS (
        SELECT
          ss.student_id,
          COUNT(*) FILTER (
            WHERE cs.session_date < CURRENT_DATE
              AND ss.attendance_status NOT IN ('pending', 'paused')
          ) AS past_active,
          COUNT(*) FILTER (
            WHERE cs.session_date = CURRENT_DATE
              AND ss.attendance_status NOT IN ('pending', 'paused')
          ) AS today_active,
          COUNT(*) FILTER (
            WHERE cs.session_date > CURRENT_DATE
          ) AS future_any,
          COUNT(*) FILTER (
            WHERE cs.session_date = CURRENT_DATE
              AND ss.attendance_status = 'paused'
          ) AS paused_today,
          COUNT(*) AS total_sessions
        FROM student_sessions ss
        JOIN class_sessions cs ON cs.id = ss.class_session_id
        GROUP BY ss.student_id
      ),
      student_status AS (
        SELECT
          s.id AS student_id,
          CASE
            WHEN (COALESCE(st.past_active,0) > 0 OR COALESCE(st.today_active,0) > 0)
                 AND (COALESCE(st.future_any,0) > 0 OR COALESCE(st.today_active,0) > 0)
              THEN 'dang_hoc'
            WHEN COALESCE(st.paused_today,0) > 0
              THEN 'bao_luu'
            WHEN COALESCE(st.future_any,0) > 0
                 AND COALESCE(st.past_active,0) = 0
                 AND COALESCE(st.today_active,0) = 0
                 AND COALESCE(st.paused_today,0) = 0
              THEN 'cho_lich'
            WHEN (COALESCE(st.past_active,0) > 0 OR COALESCE(st.today_active,0) > 0)
                 AND COALESCE(st.future_any,0) = 0
              THEN 'da_nghi'
            ELSE 'chua_co_lich'
          END AS learning_status
        FROM students s
        LEFT JOIN session_stats st ON st.student_id = s.id
        WHERE ${locationWhere}
      )
      SELECT
        COUNT(*) FILTER (WHERE learning_status = 'dang_hoc')     AS dang_hoc,
        COUNT(*) FILTER (WHERE learning_status = 'bao_luu')      AS bao_luu,
        COUNT(*) FILTER (WHERE learning_status = 'cho_lich')     AS cho_lich,
        COUNT(*) FILTER (WHERE learning_status = 'da_nghi')      AS da_nghi,
        COUNT(*) FILTER (WHERE learning_status = 'chua_co_lich') AS chua_co_lich,
        COUNT(*) AS total
      FROM student_status
    `;
  } else {
    const from = dateFrom!.replace(/[^0-9\-]/g, "");
    const to   = dateTo!.replace(/[^0-9\-]/g, "");
    queryStr = `
      WITH session_stats AS (
        SELECT
          ss.student_id,
          COUNT(*) FILTER (
            WHERE cs.session_date BETWEEN '${from}'::date AND '${to}'::date
              AND ss.attendance_status NOT IN ('pending', 'paused')
          ) AS in_range_active,
          COUNT(*) FILTER (
            WHERE cs.session_date BETWEEN '${from}'::date AND '${to}'::date
              AND ss.attendance_status = 'paused'
          ) AS in_range_paused,
          COUNT(*) FILTER (
            WHERE cs.session_date < '${from}'::date
          ) AS before_range_any,
          COUNT(*) FILTER (
            WHERE cs.session_date > '${to}'::date
          ) AS after_range_any,
          COUNT(*) AS total_sessions
        FROM student_sessions ss
        JOIN class_sessions cs ON cs.id = ss.class_session_id
        GROUP BY ss.student_id
      ),
      student_status AS (
        SELECT
          s.id AS student_id,
          CASE
            WHEN COALESCE(st.in_range_active,0) > 0
              THEN 'dang_hoc'
            WHEN COALESCE(st.in_range_paused,0) > 0
                 AND COALESCE(st.in_range_active,0) = 0
              THEN 'bao_luu'
            WHEN COALESCE(st.in_range_active,0) = 0
                 AND COALESCE(st.in_range_paused,0) = 0
                 AND COALESCE(st.before_range_any,0) = 0
                 AND COALESCE(st.after_range_any,0) > 0
              THEN 'cho_lich'
            WHEN COALESCE(st.before_range_any,0) > 0
                 AND COALESCE(st.in_range_active,0) = 0
                 AND COALESCE(st.in_range_paused,0) = 0
                 AND COALESCE(st.after_range_any,0) = 0
              THEN 'da_nghi'
            ELSE 'chua_co_lich'
          END AS learning_status
        FROM students s
        LEFT JOIN session_stats st ON st.student_id = s.id
        WHERE ${locationWhere}
      )
      SELECT
        COUNT(*) FILTER (WHERE learning_status = 'dang_hoc')     AS dang_hoc,
        COUNT(*) FILTER (WHERE learning_status = 'bao_luu')      AS bao_luu,
        COUNT(*) FILTER (WHERE learning_status = 'cho_lich')     AS cho_lich,
        COUNT(*) FILTER (WHERE learning_status = 'da_nghi')      AS da_nghi,
        COUNT(*) FILTER (WHERE learning_status = 'chua_co_lich') AS chua_co_lich,
        COUNT(*) AS total
      FROM student_status
    `;
  }

  const result = await db.execute(sql.raw(queryStr));
  const row: any = result.rows[0] ?? {};
  return {
    dangHoc:    parseInt(row.dang_hoc ?? "0", 10),
    baoLuu:     parseInt(row.bao_luu ?? "0", 10),
    choLich:    parseInt(row.cho_lich ?? "0", 10),
    daNghi:     parseInt(row.da_nghi ?? "0", 10),
    chuaCoLich: parseInt(row.chua_co_lich ?? "0", 10),
    total:      parseInt(row.total ?? "0", 10),
  };
}

// Customer-page stat cards: derive one status per student from class enrollments.
// This is intentionally separate from the session-based summary used by reports.
export async function getCustomerLearningStatusSummary(params: {
  isSuperAdmin: boolean;
  allowedLocationIds: string[];
  locationId?: string;
}): Promise<{
  dangHoc: number;
  baoLuu: number;
  choLich: number;
  daNghi: number;
  chuaCoLich: number;
  total: number;
}> {
  const locationWhere = buildLocationWhere(params.isSuperAdmin, params.allowedLocationIds, params.locationId);
  const queryStr = `
    WITH enrollment_flags AS (
      SELECT
        s.id AS student_id,
        COUNT(sc.id) AS enrollment_count,
        BOOL_OR(
          sc.id IS NOT NULL
          AND COALESCE(sc.status, '') NOT IN ('paused', 'completed', 'dropped')
          AND (sc.start_date IS NOT NULL OR sc.end_date IS NOT NULL)
          AND (sc.start_date IS NULL OR sc.start_date <= CURRENT_DATE)
          AND (sc.end_date IS NULL OR sc.end_date >= CURRENT_DATE)
        ) AS has_active_class,
        BOOL_OR(sc.status = 'paused') AS has_paused_class,
        BOOL_OR(
          sc.id IS NOT NULL
          AND COALESCE(sc.status, '') NOT IN ('paused', 'completed', 'dropped')
          AND sc.start_date > CURRENT_DATE
        ) AS has_future_class,
        BOOL_OR(
          sc.id IS NOT NULL
          AND (
            sc.status IN ('completed', 'dropped')
            OR (sc.end_date IS NOT NULL AND sc.end_date < CURRENT_DATE)
          )
        ) AS has_ended_class
      FROM students s
      LEFT JOIN student_classes sc ON sc.student_id = s.id
      WHERE ${locationWhere}
      GROUP BY s.id
    ),
    student_status AS (
      SELECT
        student_id,
        CASE
          WHEN COALESCE(has_active_class, false)
            THEN 'dang_hoc'
          WHEN COALESCE(has_paused_class, false)
            THEN 'bao_luu'
          WHEN COALESCE(has_future_class, false)
            THEN 'cho_lich'
          WHEN COALESCE(has_ended_class, false)
            THEN 'da_nghi'
          ELSE 'chua_co_lich'
        END AS learning_status
      FROM enrollment_flags
    )
    SELECT
      COUNT(*) FILTER (WHERE learning_status = 'dang_hoc') AS dang_hoc,
      COUNT(*) FILTER (WHERE learning_status = 'bao_luu') AS bao_luu,
      COUNT(*) FILTER (WHERE learning_status = 'cho_lich') AS cho_lich,
      COUNT(*) FILTER (WHERE learning_status = 'da_nghi') AS da_nghi,
      COUNT(*) FILTER (WHERE learning_status = 'chua_co_lich') AS chua_co_lich,
      COUNT(*) AS total
    FROM student_status
  `;

  const result = await db.execute(sql.raw(queryStr));
  const row: any = result.rows[0] ?? {};
  return {
    dangHoc: parseInt(row.dang_hoc ?? "0", 10),
    baoLuu: parseInt(row.bao_luu ?? "0", 10),
    choLich: parseInt(row.cho_lich ?? "0", 10),
    daNghi: parseInt(row.da_nghi ?? "0", 10),
    chuaCoLich: parseInt(row.chua_co_lich ?? "0", 10),
    total: parseInt(row.total ?? "0", 10),
  };
}

// ==========================================
// STUDENTS BY CUSTOMER SOURCE (Nguồn khách hàng)
// ==========================================
export async function getStudentsBySource(params: {
  isSuperAdmin: boolean;
  allowedLocationIds: string[];
  locationId?: string;
  months?: number;
  dateFrom?: string;
  dateTo?: string;
}): Promise<{ name: string; count: number; pct: number }[]> {
  const locationWhere = buildLocationWhere(params.isSuperAdmin, params.allowedLocationIds, params.locationId);

  let timeWhere = "";
  if (params.dateFrom && params.dateTo) {
    const from = params.dateFrom.replace(/[^0-9\-]/g, "");
    const to = params.dateTo.replace(/[^0-9\-]/g, "");
    timeWhere = `AND s.created_at >= '${from}'::date AND s.created_at < ('${to}'::date + INTERVAL '1 day')`;
  } else if (params.months && params.months > 0) {
    timeWhere = `AND s.created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') - INTERVAL '${params.months - 1} months'`;
  }

  const queryStr = `
    WITH session_stats AS (
      SELECT
        ss.student_id,
        COUNT(*) FILTER (
          WHERE cs2.session_date < CURRENT_DATE
            AND ss.attendance_status NOT IN ('pending', 'paused')
        ) AS past_active,
        COUNT(*) FILTER (
          WHERE cs2.session_date = CURRENT_DATE
            AND ss.attendance_status NOT IN ('pending', 'paused')
        ) AS today_active,
        COUNT(*) FILTER (
          WHERE cs2.session_date > CURRENT_DATE
        ) AS future_any,
        COUNT(*) FILTER (
          WHERE cs2.session_date = CURRENT_DATE
            AND ss.attendance_status = 'paused'
        ) AS paused_today
      FROM student_sessions ss
      JOIN class_sessions cs2 ON cs2.id = ss.class_session_id
      GROUP BY ss.student_id
    ),
    student_current_status AS (
      SELECT
        s.id AS student_id,
        CASE
          WHEN (COALESCE(st.past_active,0) > 0 OR COALESCE(st.today_active,0) > 0)
               AND (COALESCE(st.future_any,0) > 0 OR COALESCE(st.today_active,0) > 0)
            THEN 'dang_hoc'
          WHEN COALESCE(st.paused_today,0) > 0
            THEN 'bao_luu'
          WHEN COALESCE(st.future_any,0) > 0
               AND COALESCE(st.past_active,0) = 0
               AND COALESCE(st.today_active,0) = 0
               AND COALESCE(st.paused_today,0) = 0
            THEN 'cho_lich'
          WHEN (COALESCE(st.past_active,0) > 0 OR COALESCE(st.today_active,0) > 0)
               AND COALESCE(st.future_any,0) = 0
            THEN 'da_nghi'
          ELSE 'chua_co_lich'
        END AS status
      FROM students s
      LEFT JOIN session_stats st ON st.student_id = s.id
      WHERE ${locationWhere}
    ),
    total_active AS (
      SELECT COUNT(DISTINCT s.id) AS total
      FROM students s
      JOIN student_current_status scs ON scs.student_id = s.id
      WHERE scs.status IN ('dang_hoc', 'cho_lich', 'bao_luu', 'da_nghi')
        ${timeWhere}
    ),
    source_counts AS (
      SELECT
        src.name AS source_name,
        COUNT(DISTINCT s.id) AS cnt,
        COUNT(DISTINCT s.id) FILTER (
          WHERE scs.status IN ('dang_hoc', 'cho_lich', 'bao_luu', 'da_nghi')
        ) AS active_cnt
      FROM students s
      JOIN crm_customer_sources src ON src.id = ANY(s.customer_source_ids::uuid[])
      JOIN student_current_status scs ON scs.student_id = s.id
      WHERE ${locationWhere} ${timeWhere}
      GROUP BY src.id, src.name
    )
    SELECT
      sc.source_name,
      sc.cnt,
      ROUND(sc.active_cnt::numeric * 100.0 / NULLIF(ta.total, 0), 1) AS pct
    FROM source_counts sc
    CROSS JOIN total_active ta
    ORDER BY sc.cnt DESC
  `;
  const result = await db.execute(sql.raw(queryStr));
  return (result.rows as any[]).map(row => ({
    name: row.source_name as string,
    count: parseInt(row.cnt ?? "0", 10),
    pct: parseFloat(row.pct ?? "0"),
  }));
}

// ==========================================
// STUDENTS BY RELATIONSHIP (Mối quan hệ)
// ==========================================
export async function getStudentsByRelationship(params: {
  isSuperAdmin: boolean;
  allowedLocationIds: string[];
  locationId?: string;
  months?: number;
  dateFrom?: string;
  dateTo?: string;
}): Promise<{ name: string; count: number; color?: string }[]> {
  const locationWhere = buildLocationWhere(params.isSuperAdmin, params.allowedLocationIds, params.locationId);

  let timeWhere = "";
  if (params.dateFrom && params.dateTo) {
    const from = params.dateFrom.replace(/[^0-9\-]/g, "");
    const to = params.dateTo.replace(/[^0-9\-]/g, "");
    timeWhere = `AND s.created_at >= '${from}'::date AND s.created_at < ('${to}'::date + INTERVAL '1 day')`;
  } else if (params.months && params.months > 0) {
    timeWhere = `AND s.created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') - INTERVAL '${params.months - 1} months'`;
  }

  const queryStr = `
    SELECT
      cr.name AS rel_name,
      cr.color AS rel_color,
      COUNT(DISTINCT s.id) AS cnt
    FROM students s
    JOIN crm_relationships cr
      ON cr.id = ANY(s.relationship_ids::uuid[])
    WHERE ${locationWhere} ${timeWhere}
      AND (cr.is_parent_group = false OR cr.is_parent_group IS NULL)
    GROUP BY cr.id, cr.name, cr.color
    ORDER BY cr.position NULLS LAST, cnt DESC
  `;
  const result = await db.execute(sql.raw(queryStr));
  return (result.rows as any[]).map(row => ({
    name: row.rel_name as string,
    count: parseInt(row.cnt ?? "0", 10),
    color: row.rel_color as string | undefined,
  }));
}

// ==========================================
// STUDENTS BY LOCATION (Theo cơ sở)
// ==========================================
export async function getStudentsByLocation(params: {
  isSuperAdmin: boolean;
  allowedLocationIds: string[];
  locationId?: string;
  months?: number;
  dateFrom?: string;
  dateTo?: string;
}): Promise<{ name: string; count: number; pct: number }[]> {
  const locationWhere = buildLocationWhere(params.isSuperAdmin, params.allowedLocationIds, params.locationId);

  let timeWhere = "";
  if (params.dateFrom && params.dateTo) {
    const from = params.dateFrom.replace(/[^0-9\-]/g, "");
    const to = params.dateTo.replace(/[^0-9\-]/g, "");
    timeWhere = `AND s.created_at >= '${from}'::date AND s.created_at < ('${to}'::date + INTERVAL '1 day')`;
  } else if (params.months && params.months > 0) {
    timeWhere = `AND s.created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') - INTERVAL '${params.months - 1} months'`;
  }

  const queryStr = `
    WITH loc_counts AS (
      SELECT
        l.name AS loc_name,
        COUNT(DISTINCT s.id) AS cnt
      FROM students s
      JOIN student_locations sl ON sl.student_id = s.id
      JOIN locations l ON l.id = sl.location_id
      WHERE ${locationWhere} ${timeWhere}
      GROUP BY l.id, l.name
    ),
    total AS (SELECT COALESCE(SUM(cnt), 1) AS total FROM loc_counts)
    SELECT loc_name, cnt, ROUND(cnt * 100.0 / total.total, 1) AS pct
    FROM loc_counts, total
    ORDER BY cnt DESC
  `;
  const res = await db.execute(sql.raw(queryStr));
  return (res.rows as any[]).map(row => ({
    name: row.loc_name as string,
    count: parseInt(row.cnt ?? "0", 10),
    pct: parseFloat(row.pct ?? "0"),
  }));
}

// ==========================================
// STUDENTS BY STAFF (Theo nhân sự - Sale hoặc Phụ trách)
// ==========================================
export async function getStudentsByStaff(params: {
  isSuperAdmin: boolean;
  allowedLocationIds: string[];
  locationId?: string;
  months?: number;
  dateFrom?: string;
  dateTo?: string;
}): Promise<{ name: string; count: number; pct: number }[]> {
  const locationWhere = buildLocationWhere(params.isSuperAdmin, params.allowedLocationIds, params.locationId);

  let timeWhere = "";
  if (params.dateFrom && params.dateTo) {
    const from = params.dateFrom.replace(/[^0-9\-]/g, "");
    const to = params.dateTo.replace(/[^0-9\-]/g, "");
    timeWhere = `AND s.created_at >= '${from}'::date AND s.created_at < ('${to}'::date + INTERVAL '1 day')`;
  } else if (params.months && params.months > 0) {
    timeWhere = `AND s.created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') - INTERVAL '${params.months - 1} months'`;
  }

  const queryStr = `
    WITH staff_student AS (
      SELECT DISTINCT
        st.id AS staff_id,
        st.full_name AS staff_name,
        s.id AS student_id
      FROM students s
      JOIN staff st ON st.id = ANY(s.sales_by_ids::uuid[]) OR st.id = ANY(COALESCE(s.managed_by_ids, '{}')::uuid[])
      WHERE ${locationWhere} ${timeWhere}
    ),
    staff_counts AS (
      SELECT staff_name, COUNT(student_id) AS cnt
      FROM staff_student
      GROUP BY staff_id, staff_name
    ),
    total AS (SELECT COALESCE(SUM(cnt), 1) AS total FROM staff_counts)
    SELECT staff_name, cnt, ROUND(cnt * 100.0 / total.total, 1) AS pct
    FROM staff_counts, total
    ORDER BY cnt DESC
    LIMIT 20
  `;
  const res = await db.execute(sql.raw(queryStr));
  return (res.rows as any[]).map(row => ({
    name: row.staff_name as string,
    count: parseInt(row.cnt ?? "0", 10),
    pct: parseFloat(row.pct ?? "0"),
  }));
}

// ==========================================
// BATCH LEARNING STATUS (Trạng thái học tập theo danh sách ID)
// ==========================================
export async function getStudentsLearningStatuses(
  studentIds: string[]
): Promise<Record<string, string>> {
  if (studentIds.length === 0) return {};

  const safeIds = studentIds.map(id => `'${id.replace(/[^a-zA-Z0-9\-]/g, "")}'`).join(",");

  const queryStr = `
    WITH session_stats AS (
      SELECT
        ss.student_id,
        COUNT(*) FILTER (
          WHERE cs.session_date < CURRENT_DATE
        ) AS past_any,
        COUNT(*) FILTER (
          WHERE cs.session_date = CURRENT_DATE
        ) AS today_any,
        COUNT(*) FILTER (
          WHERE cs.session_date > CURRENT_DATE
        ) AS future_any,
        COUNT(*) FILTER (
          WHERE cs.session_date = CURRENT_DATE
            AND ss.attendance_status = 'paused'
        ) AS paused_today
      FROM student_sessions ss
      JOIN class_sessions cs ON cs.id = ss.class_session_id
      WHERE ss.student_id = ANY(ARRAY[${safeIds}]::uuid[])
      GROUP BY ss.student_id
    )
    SELECT
      s.id AS student_id,
      CASE
        WHEN COALESCE(st.today_any,0) > 0
             OR (COALESCE(st.past_any,0) > 0 AND COALESCE(st.future_any,0) > 0)
             OR COALESCE(st.future_any,0) > 0
          THEN CASE
                 WHEN COALESCE(st.past_any,0) = 0
                      AND COALESCE(st.today_any,0) = 0
                      AND COALESCE(st.future_any,0) > 0
                   THEN 'cho_lich'
                 ELSE 'dang_hoc'
               END
        WHEN COALESCE(st.paused_today,0) > 0
          THEN 'bao_luu'
        WHEN COALESCE(st.past_any,0) > 0
             AND COALESCE(st.today_any,0) = 0
             AND COALESCE(st.future_any,0) = 0
          THEN 'da_nghi'
        ELSE 'chua_co_lich'
      END AS learning_status
    FROM students s
    LEFT JOIN session_stats st ON st.student_id = s.id
    WHERE s.id = ANY(ARRAY[${safeIds}]::uuid[])
  `;

  const result = await db.execute(sql.raw(queryStr));
  const map: Record<string, string> = {};
  (result.rows as any[]).forEach(row => {
    map[row.student_id as string] = row.learning_status as string;
  });
  return map;
}

// ==========================================
// MONTHLY STUDENT COUNTS (Số lượng học viên theo tháng)
// Trả về N tháng gần nhất, mỗi tháng có count + growthPct so với tháng trước.
// ==========================================
export async function getMonthlyStudentCounts(params: {
  isSuperAdmin: boolean;
  allowedLocationIds: string[];
  locationId?: string;
  months?: number;
}): Promise<{ monthKey: string; label: string; count: number; growthPct: number }[]> {
  const n = Math.max(1, Math.min(params.months ?? 6, 36));
  const locationWhere = buildLocationWhere(params.isSuperAdmin, params.allowedLocationIds, params.locationId);
  // We fetch N+1 months including the month BEFORE the visible window so the
  // first visible month can compute its growth pct against a real prior value.
  const queryStr = `
    WITH months AS (
      SELECT generate_series(
        DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') - INTERVAL '${n} months',
        DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh'),
        INTERVAL '1 month'
      ) AS month_start
    ),
    counts AS (
      SELECT
        DATE_TRUNC('month', s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS month_start,
        COUNT(*) AS cnt
      FROM students s
      WHERE ${locationWhere}
        AND s.created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') - INTERVAL '${n} months'
      GROUP BY 1
    )
    SELECT m.month_start, COALESCE(c.cnt, 0)::int AS cnt
    FROM months m
    LEFT JOIN counts c ON c.month_start = m.month_start
    ORDER BY m.month_start
  `;
  const result = await db.execute(sql.raw(queryStr));
  const rows = (result.rows as any[]).map(r => ({
    date: new Date(r.month_start as string),
    count: parseInt(String(r.cnt ?? "0"), 10),
  }));
  // Drop the seed (oldest) month after using it as growth baseline for the
  // first visible month.
  return rows.slice(1).map((row, i) => {
    const prev = rows[i].count;
    const curr = row.count;
    const growthPct = prev > 0
      ? Math.round(((curr - prev) / prev) * 100)
      : (curr > 0 ? 100 : 0);
    const m = row.date.getUTCMonth() + 1;
    const y = row.date.getUTCFullYear();
    return {
      monthKey: `${y}-${String(m).padStart(2, "0")}`,
      label: `T${m}/${String(y).slice(-2)}`,
      count: curr,
      growthPct,
    };
  });
}
