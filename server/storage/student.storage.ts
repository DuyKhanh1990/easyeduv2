import {
  db,
  eq, sql, and, or, inArray, asc, isNull,
  students, staff, users, classes, classSessions, studentClasses, studentSessions,
  studentLocations, crmRelationships, crmRejectReasons, crmCustomerSources,
  courseFeePackages, shiftTemplates, studentComments,
  staffAssignments, locations, invoices, invoiceSessionAllocations,
  studentRelationshipHistory,
} from "./base";
import { hashPassword } from "../auth";
import type {
  StudentResponse, Staff as StaffType, CrmRelationship,
  InsertCrmRelationship, CrmRejectReason, InsertCrmRejectReason,
  CrmCustomerSource, InsertCrmCustomerSource,
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
  sources?: string[];
  rejectReasons?: string[];
  salesIds?: string[];
  managerIds?: string[];
  teacherIds?: string[];
  classIds?: string[];
  startDate?: string;
  endDate?: string;
  viewScope?: 'all' | 'own';
  viewerStaffId?: string;
}): Promise<{ students: StudentResponse[]; total: number }> {
  const {
    allowedLocationIds, isSuperAdmin,
    locationId, offset, limit, searchTerm, type, pipelineStage,
    sources, rejectReasons, salesIds, managerIds, teacherIds, classIds,
    startDate, endDate, viewScope, viewerStaffId
  } = params;

  let whereClause = sql`1=1`;

  if (!isSuperAdmin) {
    whereClause = sql`${whereClause} AND EXISTS (SELECT 1 FROM ${studentLocations} WHERE ${studentLocations.studentId} = ${students.id} AND ${studentLocations.locationId} IN ${allowedLocationIds})`;
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
    whereClause = sql`${whereClause} AND EXISTS (SELECT 1 FROM ${studentLocations} WHERE ${studentLocations.studentId} = ${students.id} AND ${studentLocations.locationId} = ${locationId})`;
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
  }
  if (sources && sources.length > 0) {
    whereClause = sql`${whereClause} AND ${students.source} IN ${sources}`;
  }
  if (rejectReasons && rejectReasons.length > 0) {
    whereClause = sql`${whereClause} AND ${students.rejectReason} IN ${rejectReasons}`;
  }
  if (salesIds && salesIds.length > 0) {
    whereClause = sql`${whereClause} AND ${students.salesByIds} && ${salesIds}::uuid[]`;
  }
  if (managerIds && managerIds.length > 0) {
    whereClause = sql`${whereClause} AND ${students.managedByIds} && ${managerIds}::uuid[]`;
  }
  if (teacherIds && teacherIds.length > 0) {
    whereClause = sql`${whereClause} AND ${students.teacherIds} && ${teacherIds}::uuid[]`;
  }
  if (classIds && classIds.length > 0) {
    whereClause = sql`${whereClause} AND ${students.classIds} && array[${classIds.join(',')}]::uuid[]`;
  }
  if (startDate) {
    whereClause = sql`${whereClause} AND ${students.createdAt} >= ${new Date(startDate)}`;
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    whereClause = sql`${whereClause} AND ${students.createdAt} <= ${end}`;
  }
  if (searchTerm) {
    const search = `%${searchTerm.toLowerCase()}%`;
    whereClause = sql`${whereClause} AND (LOWER(${students.fullName}) LIKE ${search} OR LOWER(${students.code}) LIKE ${search})`;
  }

  const [totalResult] = await db.select({ count: sql<number>`count(*)` }).from(students).where(whereClause);
  const total = Number(totalResult.count);

  const studentIdRows = await db
    .select({ id: students.id })
    .from(students)
    .where(whereClause)
    .limit(limit ?? 20)
    .offset(offset ?? 0)
    .orderBy(sql`${students.createdAt} DESC`);

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

  const [allStaff, allUsers, allClasses, allSources, allStudentClasses] = await Promise.all([
    db.select().from(staff),
    db.select().from(users),
    db.select().from(classes),
    db.select().from(crmCustomerSources),
    db.select().from(studentClasses)
  ]);
  const staffMap = new Map(allStaff.map(s => [s.id, s]));
  const userMap = new Map(allUsers.map(u => [u.id, u]));
  const classMap = new Map(allClasses.map(c => [c.id, c]));
  const sourceMap = new Map(allSources.map(s => [s.id, s]));

  const mappedStudents = studentsList.map(student => ({
    ...student,
    location: student.locations?.[0]?.location,
    salesBy: student.salesByIds && student.salesByIds.length > 0 ? staffMap.get(student.salesByIds[0]) : undefined,
    salesByList: (student.salesByIds || []).map(id => staffMap.get(id)).filter(Boolean) as StaffType[],
    managedByList: (student.managedByIds || []).map(id => staffMap.get(id)).filter(Boolean) as StaffType[],
    teacherList: (student.teacherIds || []).map(id => staffMap.get(id)).filter(Boolean) as StaffType[],
    creator: student.createdBy ? userMap.get(student.createdBy) : undefined,
    updater: student.updatedBy ? userMap.get(student.updatedBy) : undefined,
    className: student.classIds?.[0] ? classMap.get(student.classIds[0])?.name : undefined,
    classCode: student.classIds?.[0] ? classMap.get(student.classIds[0])?.classCode : undefined,
    classNames: (student.classIds || []).map(id => classMap.get(id)?.name).filter(Boolean) as string[],
    classDetails: (student.classIds || []).map(classId => {
      const studentClassRecord = allStudentClasses.find(sc => sc.studentId === student.id && sc.classId === classId);
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
    sourceList: (student.customerSourceIds || []).map(id => sourceMap.get(id)).filter(Boolean).map(s => s!.name),
  })) as StudentResponse[];

  return { students: mappedStudents, total };
}

export async function getStudentsMinimal(params: {
  allowedLocationIds: string[];
  isSuperAdmin: boolean;
  locationId?: string;
  limit?: number;
}): Promise<{ id: string; fullName: string; type: string | null; locations: { locationId: string }[] }[]> {
  const { allowedLocationIds, isSuperAdmin, locationId, limit = 200 } = params;

  let whereClause = sql`1=1`;

  if (!isSuperAdmin && allowedLocationIds.length > 0) {
    whereClause = sql`${whereClause} AND EXISTS (SELECT 1 FROM ${studentLocations} sl WHERE sl.student_id = ${students.id} AND sl.location_id = ANY(ARRAY[${sql.raw(allowedLocationIds.map(id => `'${id}'`).join(','))}]::uuid[]))`;
  }

  if (locationId && locationId !== "all") {
    whereClause = sql`${whereClause} AND EXISTS (SELECT 1 FROM ${studentLocations} sl WHERE sl.student_id = ${students.id} AND sl.location_id = ${locationId}::uuid)`;
  }

  const rows = await db
    .select({ id: students.id, fullName: students.fullName, type: students.type })
    .from(students)
    .where(whereClause)
    .limit(limit)
    .orderBy(sql`${students.fullName} ASC`);

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
    type: r.type,
    locations: locMap.get(r.id) || [],
  }));
}

export async function getStudent(id: string, allowedLocationIds: string[], isSuperAdmin: boolean): Promise<StudentResponse | undefined> {
  const filters = [eq(students.id, id)];
  if (!isSuperAdmin) {
    filters.push(sql`EXISTS (SELECT 1 FROM ${studentLocations} WHERE ${studentLocations.studentId} = ${students.id} AND ${studentLocations.locationId} IN ${allowedLocationIds})`);
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

  const [allStaff, allRelationships, allClasses, allStudentClasses] = await Promise.all([
    db.select().from(staff),
    db.select().from(crmRelationships),
    db.select().from(classes),
    db.select().from(studentClasses)
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
    classNames: (student.classIds || []).map(id => classMap.get(id)?.name).filter(Boolean) as string[],
    classDetails: (student.classIds || []).map(classId => {
      const studentClassRecord = allStudentClasses.find(sc => sc.studentId === student.id && sc.classId === classId);
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
}

export async function createStudent(student: any): Promise<StudentResponse> {
  const { username, password, locationIds, ...studentData } = student;

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
    let userId = null;
    const effectiveUsername = username || studentData.code;
    if (effectiveUsername) {
      const [existingUser] = await tx.select().from(users).where(eq(users.username, effectiveUsername));
      if (!existingUser) {
        const [newUser] = await tx.insert(users).values({
          username: effectiveUsername,
          passwordHash: hashPassword(password || "123456"),
          isActive: true
        }).returning();
        userId = newUser.id;
      } else {
        userId = existingUser.id;
      }
    }

    if (userId) {
      studentData.userId = userId;
    }

    const [newStudent] = await tx.insert(students).values({
      ...studentData,
      relationshipIds: studentData.relationshipIds || [],
      customerSourceIds: studentData.customerSourceIds || [],
      classIds: Array.isArray(studentData.classIds) ? studentData.classIds : (studentData.classIds ? [studentData.classIds] : []),
      pipelineStage: Array.isArray(studentData.pipelineStage) ? studentData.pipelineStage : (studentData.pipelineStage ? [studentData.pipelineStage] : (studentData.relationshipIds && studentData.relationshipIds.length > 0 ? (await tx.select().from(crmRelationships).where(inArray(crmRelationships.id, studentData.relationshipIds))).map(r => r.name) : ["Lead"])),
    }).returning();

    if (locationIds && locationIds.length > 0) {
      await tx.insert(studentLocations).values(
        locationIds.map((locationId: string) => ({
          studentId: newStudent.id,
          locationId,
        }))
      );
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
    } as StudentResponse;
  });
}

export async function updateStudent(id: string, updates: any, allowedLocationIds: string[], isSuperAdmin: boolean): Promise<StudentResponse> {
  const { locationIds, ...studentUpdates } = updates;

  return await db.transaction(async (tx) => {
    let whereClause = eq(students.id, id);
    if (!isSuperAdmin) {
      whereClause = and(
        whereClause,
        sql`EXISTS (SELECT 1 FROM ${studentLocations} WHERE ${studentLocations.studentId} = ${students.id} AND ${studentLocations.locationId} IN ${allowedLocationIds})`
      ) as any;
    }

    const [existing] = await tx.select({ id: students.id, relationshipIds: students.relationshipIds }).from(students).where(whereClause).for("update");
    if (!existing) throw new Error("Student not found or access denied");

    const oldRelationshipIds: string[] = existing.relationshipIds || [];

    if (Object.keys(studentUpdates).length > 0) {
      const updatesToApply: any = { ...studentUpdates };

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
            fromRelationshipId: removedIds[0],
            fromRelationshipName: relNameMap.get(removedIds[0]) ?? null,
            toRelationshipId: addedIds[0],
            toRelationshipName: relNameMap.get(addedIds[0]) ?? null,
            changedByUserId,
            changedByName,
          });
        } else {
          // Multiple changes: record each removal and each addition separately
          for (const removedId of removedIds) {
            await tx.insert(studentRelationshipHistory).values({
              studentId: id,
              fromRelationshipId: removedId,
              fromRelationshipName: relNameMap.get(removedId) ?? null,
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
              toRelationshipId: addedId,
              toRelationshipName: relNameMap.get(addedId) ?? null,
              changedByUserId,
              changedByName,
            });
          }
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

    const allStaff = await tx.select().from(staff);
    const allRelationships = await tx.select().from(crmRelationships);
    const allClasses = await tx.select().from(classes);
    const allStudentClasses = await tx.select().from(studentClasses);
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
        sql`EXISTS (SELECT 1 FROM ${studentLocations} WHERE ${studentLocations.studentId} = ${students.id} AND ${studentLocations.locationId} IN ${allowedLocationIds})`
      ) as any;
    }

    const [existing] = await tx.select({ id: students.id }).from(students).where(whereClause).for("update");
    if (!existing) throw new Error("Student not found or access denied");

    await tx.delete(students).where(eq(students.id, id));
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
    studentWhere = sql`EXISTS (SELECT 1 FROM ${studentLocations} WHERE ${studentLocations.studentId} = ${students.id} AND ${studentLocations.locationId} IN ${allowedLocationIds})`;
    staffWhere = sql`EXISTS (SELECT 1 FROM ${staffAssignments} WHERE ${staffAssignments.staffId} = ${staff.id} AND ${staffAssignments.locationId} IN ${allowedLocationIds})`;
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

export async function getCrmRelationships(allowedLocationIds: string[], isSuperAdmin: boolean): Promise<CrmRelationship[]> {
  return await db.select().from(crmRelationships).orderBy(sql`${crmRelationships.createdAt} asc`);
}

export async function createCrmRelationship(data: InsertCrmRelationship): Promise<CrmRelationship> {
  const [res] = await db.insert(crmRelationships).values(data).returning();
  return res;
}

export async function updateCrmRelationship(id: string, data: Partial<InsertCrmRelationship>): Promise<CrmRelationship> {
  const [res] = await db.update(crmRelationships).set(data).where(eq(crmRelationships.id, id)).returning();
  return res;
}

export async function deleteCrmRelationship(id: string): Promise<void> {
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

export async function getStudentClasses(studentId: string): Promise<any[]> {
  const enrollments = await db.select()
    .from(studentClasses)
    .leftJoin(classes, eq(studentClasses.classId, classes.id))
    .leftJoin(courseFeePackages, eq(classes.feePackageId, courseFeePackages.id))
    .where(eq(studentClasses.studentId, studentId));

  const result = [];
  for (const enrollment of enrollments) {
    const classRec = enrollment.classes;
    if (!classRec) continue;

    const scId = enrollment.student_classes!.id;
    const sessions = await db.select()
      .from(studentSessions)
      .leftJoin(classSessions, eq(studentSessions.classSessionId, classSessions.id))
      .leftJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
      .leftJoin(courseFeePackages, eq(studentSessions.packageId, courseFeePackages.id))
      .where(or(
        eq(studentSessions.studentClassId, scId),
        and(
          isNull(studentSessions.studentClassId),
          eq(studentSessions.studentId, studentId),
          eq(studentSessions.classId, classRec.id)
        )
      ))
      .orderBy(asc(studentSessions.sessionOrder));

    const classInvoices = await db.select()
      .from(invoices)
      .where(and(
        eq(invoices.studentId, studentId),
        eq(invoices.classId, classRec.id),
        eq(invoices.type, "Thu"),
      ));

    const invoicePaidTotal = classInvoices.reduce((sum, inv) => {
      return sum + Number(inv.paidAmount || 0);
    }, 0);

    const sessionIds = sessions
      .map(s => s.student_sessions?.id)
      .filter((id): id is string => !!id);

    const allocationMap: Record<string, number> = {};
    if (sessionIds.length > 0) {
      const allocations = await db.select()
        .from(invoiceSessionAllocations)
        .where(inArray(invoiceSessionAllocations.studentSessionId, sessionIds));
      for (const alloc of allocations) {
        const prev = allocationMap[alloc.studentSessionId] ?? 0;
        allocationMap[alloc.studentSessionId] = prev + Number(alloc.allocatedAmount);
      }
    }

    result.push({
      studentClass: enrollment.student_classes,
      class: classRec,
      feePackage: enrollment.course_fee_packages,
      invoicePaidTotal,
      sessions: sessions.map(s => ({
        studentSession: s.student_sessions,
        classSession: s.class_sessions,
        shiftTemplate: s.shift_templates,
        feePackage: s.course_fee_packages,
        allocatedFee: s.student_sessions?.id
          ? (allocationMap[s.student_sessions.id] ?? (s.student_sessions.sessionPrice != null ? Number(s.student_sessions.sessionPrice) : null))
          : null,
      })),
    });
  }
  return result;
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
      studentWhere = sql`EXISTS (SELECT 1 FROM ${studentLocations} WHERE ${studentLocations.studentId} = ${students.id} AND ${studentLocations.locationId} IN ${allowedLocationIds!})
        AND (LOWER(${students.fullName}) LIKE ${searchPattern} OR LOWER(${students.code}) LIKE ${searchPattern})`;
    } else {
      studentWhere = sql`EXISTS (SELECT 1 FROM ${studentLocations} WHERE ${studentLocations.studentId} = ${students.id} AND ${studentLocations.locationId} IN ${allowedLocationIds!})`;
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
    .select({ id: students.id, code: students.code, fullName: students.fullName, type: students.type, phone: students.phone })
    .from(students)
    .where(studentWhere)
    .limit(limit)
    .orderBy(students.fullName);

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
