import {
  db,
  eq, sql, and, inArray,
  users, locations, staff, departments, roles, staffAssignments, studentLocations, classes,
  shiftTemplates, teacherAvailability, invoices, courses, students,
} from "./base";
import { hashPassword } from "../auth";
import { encrypt } from "../lib/encryption";
import type {
  Location,
  Staff,
  Department, InsertDepartment, Role, InsertRole, DepartmentWithRoles,
} from "./base";
import { insertLocationSchema } from "@shared/schema";
import type { z } from "zod";

type InsertLocation = z.infer<typeof insertLocationSchema>;

function getOmicallAssignmentFields(
  extensionValue: unknown,
  passwordValue?: unknown,
  existingEncryptedPassword?: string | null,
) {
  let extension = typeof extensionValue === "string" ? extensionValue.trim() : "";
  let password = typeof passwordValue === "string" ? passwordValue.trim() : "";
  const separatorIndex = extension.indexOf("|");

  // Accept the legacy input once, then persist the two values separately.
  if (separatorIndex >= 0) {
    const legacyPassword = extension.slice(separatorIndex + 1).trim();
    extension = extension.slice(0, separatorIndex).trim();
    if (!password) password = legacyPassword;
  }

  return {
    omicallExtension: extension || null,
    omicallPasswordEncrypted: password
      ? encrypt(password)
      : existingEncryptedPassword || null,
  };
}

// ==========================================
// LOCATION METHODS
// ==========================================

export async function getLocations(): Promise<Location[]> {
  return await db.select().from(locations);
}

export async function getLocation(id: string): Promise<Location | undefined> {
  const [loc] = await db.select().from(locations).where(eq(locations.id, id));
  return loc;
}

export async function createLocation(location: InsertLocation): Promise<Location> {
  const [newLocation] = await db.insert(locations).values(location).returning();
  return newLocation;
}

export async function updateLocation(id: string, updates: Partial<InsertLocation>): Promise<Location> {
  const [updated] = await db.update(locations).set(updates).where(eq(locations.id, id)).returning();
  return updated;
}

export async function checkLocationUsage(id: string): Promise<boolean> {
  // Check all key tables that hold a non-cascade locationId reference
  const checks = await Promise.all([
    db.select({ id: staffAssignments.id }).from(staffAssignments).where(eq(staffAssignments.locationId, id)).limit(1),
    db.select({ id: classes.id }).from(classes).where(eq(classes.locationId, id)).limit(1),
    db.select({ id: studentLocations.id }).from(studentLocations).where(eq(studentLocations.locationId, id)).limit(1),
    db.select({ id: shiftTemplates.id }).from(shiftTemplates).where(eq(shiftTemplates.locationId, id)).limit(1),
    db.select({ id: teacherAvailability.id }).from(teacherAvailability).where(eq(teacherAvailability.locationId, id)).limit(1),
    db.select({ id: invoices.id }).from(invoices).where(eq(invoices.locationId, id)).limit(1),
    db.select({ id: courses.id }).from(courses).where(eq(courses.locationId, id)).limit(1),
  ]);
  return checks.some(result => result.length > 0);
}

export async function deleteLocation(id: string, isSuperAdmin = false): Promise<void> {
  if (!isSuperAdmin) {
    const [loc] = await db.select({ name: locations.name }).from(locations).where(eq(locations.id, id)).limit(1);
    const inUse = await checkLocationUsage(id);
    if (inUse) {
      throw Object.assign(
        new Error(`Cơ sở "${loc?.name ?? id}" đang được gán với dữ liệu trên hệ thống, không thể xóa được.`),
        { code: "LOCATION_IN_USE" },
      );
    }
  }
  await db.delete(locations).where(eq(locations.id, id));
}

// ==========================================
// DEPARTMENT & ROLE METHODS
// ==========================================

export async function getDepartments(allowedLocationIds: string[], isSuperAdmin: boolean): Promise<DepartmentWithRoles[]> {
  const results = await db.query.departments.findMany({
    with: {
      roles: true
    },
    orderBy: (table, { asc }) => [asc(table.createdAt)]
  });
  return results as DepartmentWithRoles[];
}

export async function getDepartmentByName(name: string): Promise<Department | undefined> {
  const [dept] = await db.select().from(departments).where(eq(departments.name, name));
  return dept;
}

export async function getRoleByNameInDepartment(name: string, departmentId: string): Promise<Role | undefined> {
  const [role] = await db.select().from(roles).where(and(eq(roles.name, name), eq(roles.departmentId, departmentId)));
  return role;
}

export async function createDepartment(dept: InsertDepartment): Promise<Department> {
  const [newDept] = await db.insert(departments).values(dept).returning();
  return newDept;
}

export async function updateDepartment(id: string, updates: Partial<InsertDepartment>): Promise<Department> {
  const [updated] = await db.update(departments).set(updates).where(eq(departments.id, id)).returning();
  return updated;
}

export async function deleteDepartment(id: string): Promise<void> {
  // Fetch department name for a descriptive error
  const [dept] = await db.select({ name: departments.name }).from(departments).where(eq(departments.id, id)).limit(1);
  // Check if any staff assignments reference this department
  const [ref] = await db
    .select({ id: staffAssignments.id })
    .from(staffAssignments)
    .where(eq(staffAssignments.departmentId, id))
    .limit(1);
  if (ref) {
    throw Object.assign(
      new Error(`Phòng ban "${dept?.name ?? id}" đang được gán cho nhân viên, không thể xóa. Hãy gỡ phòng ban khỏi tất cả nhân viên trước.`),
      { code: "DEPT_IN_USE" },
    );
  }
  await db.delete(departments).where(eq(departments.id, id));
}

export async function createRole(role: InsertRole): Promise<Role> {
  const [newRole] = await db.insert(roles).values(role).returning();
  return newRole;
}

export async function updateRole(id: string, updates: Partial<InsertRole>): Promise<Role> {
  const [updated] = await db.update(roles).set(updates).where(eq(roles.id, id)).returning();
  return updated;
}

export async function deleteRole(id: string): Promise<void> {
  // Fetch role name for a descriptive error
  const [role] = await db.select({ name: roles.name }).from(roles).where(eq(roles.id, id)).limit(1);
  // Kiểm tra role còn đang được gán cho nhân viên không
  const [ref] = await db
    .select({ id: staffAssignments.id })
    .from(staffAssignments)
    .where(eq(staffAssignments.roleId, id))
    .limit(1);
  if (ref) {
    throw Object.assign(
      new Error(`Vai trò "${role?.name ?? id}" đang được gán cho nhân viên, không thể xóa. Hãy gỡ vai trò khỏi tất cả nhân viên trước.`),
      { code: "ROLE_IN_USE" },
    );
  }
  await db.delete(roles).where(eq(roles.id, id));
}

// ==========================================
// STAFF METHODS
// ==========================================

export async function getStaff(
  allowedLocationIds: string[],
  isSuperAdmin: boolean,
  locationId?: string,
  minimal?: boolean,
  includeUserId?: string,
): Promise<any[]> {
  let baseQuery = db.select({
    id: staff.id,
    userId: staff.userId,
    code: staff.code,
    fullName: staff.fullName,
    phone: staff.phone,
    email: staff.email,
    dateOfBirth: staff.dateOfBirth,
    address: staff.address,
    status: staff.status,
    createdAt: staff.createdAt,
    updatedAt: staff.updatedAt
  }).from(staff);

  // Exclude the super admin account from normal staff lists. Some screens
  // (such as invoice commission assignment) may explicitly include the
  // currently logged-in user's staff profile.
  const [adminUser] = await db.select({ id: users.id }).from(users).where(eq(users.username, "admin")).limit(1);
  const adminUserId = adminUser?.id;
  const excludedAdminUserId = adminUserId && adminUserId !== includeUserId ? adminUserId : null;

  let results: any[];
  if (isSuperAdmin) {
    if (locationId && locationId !== "all") {
      const whereCondition = excludedAdminUserId
        ? and(eq(staffAssignments.locationId, locationId), sql`${staff.userId} != ${excludedAdminUserId}`)
        : eq(staffAssignments.locationId, locationId);
      results = await baseQuery
        .innerJoin(staffAssignments, eq(staff.id, staffAssignments.staffId))
        .where(whereCondition);
    } else {
      const whereCondition = excludedAdminUserId
        ? sql`${staff.userId} != ${excludedAdminUserId}`
        : undefined;
      results = whereCondition
        ? await baseQuery.where(whereCondition)
        : await baseQuery;
    }
  } else {
    const locationCondition = locationId && locationId !== "all"
      ? and(inArray(staffAssignments.locationId, allowedLocationIds), eq(staffAssignments.locationId, locationId))
      : inArray(staffAssignments.locationId, allowedLocationIds);

    const whereCondition = excludedAdminUserId
      ? and(locationCondition, sql`${staff.userId} != ${excludedAdminUserId}`)
      : locationCondition;

    results = await baseQuery
      .innerJoin(staffAssignments, eq(staff.id, staffAssignments.staffId))
      .where(whereCondition);
  }

  const staffIds = Array.from(new Set(results.map(r => r.id)));
  if (staffIds.length === 0) return [];

  const dedupedStaff = results.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);

  const staffUserIds = dedupedStaff.map(s => s.userId).filter(Boolean);
  const usernameMap = new Map<string, string>();
  if (staffUserIds.length > 0) {
    const userRows = await db.select({ id: users.id, username: users.username })
      .from(users)
      .where(inArray(users.id, staffUserIds));
    userRows.forEach(u => usernameMap.set(u.id, u.username));
  }

  if (minimal) {
    const minimalAssignments = await db
      .select({
        staffId: staffAssignments.staffId,
        locationId: staffAssignments.locationId,
        roleId: staffAssignments.roleId,
        departmentId: staffAssignments.departmentId,
      })
      .from(staffAssignments)
      .where(inArray(staffAssignments.staffId, staffIds));

    const locationIdsMap = new Map<string, string[]>();
    const roleIdsMap = new Map<string, string[]>();
    const assignmentsListMap = new Map<string, { locationId: string; roleId: string | null; departmentId: string | null }[]>();
    minimalAssignments.forEach(a => {
      const existingLoc = locationIdsMap.get(a.staffId) || [];
      if (!existingLoc.includes(a.locationId)) existingLoc.push(a.locationId);
      locationIdsMap.set(a.staffId, existingLoc);
      if (a.roleId) {
        const existingRole = roleIdsMap.get(a.staffId) || [];
        if (!existingRole.includes(a.roleId)) existingRole.push(a.roleId);
        roleIdsMap.set(a.staffId, existingRole);
      }
      const existingList = assignmentsListMap.get(a.staffId) || [];
      existingList.push({ locationId: a.locationId, roleId: a.roleId, departmentId: a.departmentId });
      assignmentsListMap.set(a.staffId, existingList);
    });

    const allRoleIds = Array.from(new Set(minimalAssignments.map(a => a.roleId).filter(Boolean) as string[]));
    const roleNameMap = new Map<string, string>();
    if (allRoleIds.length > 0) {
      const roleRows = await db.select({ id: roles.id, name: roles.name }).from(roles).where(inArray(roles.id, allRoleIds));
      roleRows.forEach(r => roleNameMap.set(r.id, r.name));
    }

    const allDeptIds = Array.from(new Set(minimalAssignments.map(a => a.departmentId).filter(Boolean) as string[]));
    const deptNameMap = new Map<string, string>();
    if (allDeptIds.length > 0) {
      const deptRows = await db.select({ id: departments.id, name: departments.name }).from(departments).where(inArray(departments.id, allDeptIds));
      deptRows.forEach(d => deptNameMap.set(d.id, d.name));
    }

    return dedupedStaff.map(s => {
      const rIds = roleIdsMap.get(s.id) || [];
      const rawAssignments = assignmentsListMap.get(s.id) || [];
      return {
        id: s.id,
        userId: s.userId,
        code: s.code,
        fullName: s.fullName,
        email: s.email,
        phone: s.phone,
        status: s.status,
        locationIds: locationIdsMap.get(s.id) || [],
        roleNames: rIds.map(rid => roleNameMap.get(rid)).filter(Boolean) as string[],
        assignments: rawAssignments.map(a => ({
          ...a,
          department: a.departmentId ? { id: a.departmentId, name: deptNameMap.get(a.departmentId) || "" } : null,
        })),
      };
    });
  }

  const allAssignments = await db.query.staffAssignments.findMany({
    where: inArray(staffAssignments.staffId, staffIds),
    with: {
      location: { columns: { id: true, name: true, code: true, isMain: true, isActive: true } },
      department: { columns: { id: true, name: true } },
      role: { columns: { id: true, name: true } },
    }
  });

  const assignmentsMap = new Map<string, any[]>();
  allAssignments.forEach(a => {
    const { omicallPasswordEncrypted, ...safeAssignment } = a as any;
    const existing = assignmentsMap.get(a.staffId) || [];
    assignmentsMap.set(a.staffId, [
      ...existing,
      {
        ...safeAssignment,
        omicallPasswordConfigured: Boolean(omicallPasswordEncrypted),
      },
    ]);
  });

  return dedupedStaff.map(s => ({
    ...s,
    username: usernameMap.get(s.userId) || "",
    assignments: assignmentsMap.get(s.id) || [],
    locationIds: Array.from(new Set((assignmentsMap.get(s.id) || []).map((a: any) => a.locationId).filter(Boolean))),
    departmentIds: Array.from(new Set((assignmentsMap.get(s.id) || []).map((a: any) => a.departmentId).filter(Boolean))),
    roleIds: Array.from(new Set((assignmentsMap.get(s.id) || []).map((a: any) => a.roleId).filter(Boolean)))
  }));
}

export async function createStaff(insertData: any): Promise<Staff> {
  const {
    username,
    password,
    locationIds,
    departmentIds,
    roleIds,
    omicallExtensions,
    omicallPasswords,
    ...staffData
  } = insertData;
  const normalizedUsername = typeof username === "string" ? username.trim().toLowerCase() : username;

  if (staffData.code) {
    const [existingCode] = await db.select({ id: staff.id }).from(staff).where(eq(staff.code, staffData.code));
    if (existingCode) throw new Error(`Mã "${staffData.code}" đã tồn tại trong hệ thống`);
  }

  try {
    return await db.transaction(async (tx) => {
      // Deleted staff keep their inactive user row for historical foreign-key
      // references. Reuse that orphaned account instead of treating it as a
      // duplicate, but never take over an account still linked to staff.
      const [existingUser] = normalizedUsername
        ? await tx
            .select({ id: users.id, username: users.username, isActive: users.isActive })
            .from(users)
            .where(eq(users.username, normalizedUsername))
            .for("update")
        : [];

      let user;
      if (existingUser) {
        const [linkedStaff] = await tx
          .select({ id: staff.id })
          .from(staff)
          .where(eq(staff.userId, existingUser.id))
          .limit(1);
        const [linkedStudent] = await tx
          .select({ id: students.id })
          .from(students)
          .where(eq(students.userId, existingUser.id))
          .limit(1);

        // A user without a staff/student profile is an orphan left by an old
        // deletion flow. Reclaim it so deleted usernames can be used again.
        if (linkedStaff || linkedStudent || existingUser.username === "admin") {
          throw new Error(`Tài khoản "${username}" đã tồn tại trong hệ thống`);
        }

        [user] = await tx
          .update(users)
          .set({
            passwordHash: hashPassword(password || "123456"),
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingUser.id))
          .returning();
      } else {
        [user] = await tx.insert(users).values({
          username: normalizedUsername,
          passwordHash: hashPassword(password || "123456"),
          isActive: true,
        }).returning();
      }

      const [newStaff] = await tx.insert(staff).values({
        ...staffData,
        userId: user.id,
      }).returning();

      // Build assignments as cross-product: each location × each role (with its dept)
      const assignments = [];
      const locList: string[] = locationIds || [];
      const roleList: string[] = roleIds || [];
      const deptList: string[] = departmentIds || [];

      if (locList.length > 0 && roleList.length > 0) {
        // Query each role's departmentId so pairing is always correct
        const roleRows = await tx
          .select({ id: roles.id, departmentId: roles.departmentId })
          .from(roles)
          .where(inArray(roles.id, roleList));
        for (const loc of locList) {
          for (const role of roleRows) {
            assignments.push({
              staffId: newStaff.id,
              locationId: loc,
              departmentId: role.departmentId,
              roleId: role.id,
              ...getOmicallAssignmentFields(omicallExtensions?.[loc], omicallPasswords?.[loc]),
            });
          }
        }
      } else if (locList.length > 0 && deptList.length > 0) {
        // Departments without roles
        for (const loc of locList) {
          for (const dept of deptList) {
            assignments.push({
              staffId: newStaff.id,
              locationId: loc,
              departmentId: dept,
              roleId: null,
              ...getOmicallAssignmentFields(omicallExtensions?.[loc], omicallPasswords?.[loc]),
            });
          }
        }
      } else if (locList.length > 0) {
        for (const loc of locList) {
          assignments.push({
            staffId: newStaff.id,
            locationId: loc,
            departmentId: null,
            roleId: null,
            ...getOmicallAssignmentFields(omicallExtensions?.[loc], omicallPasswords?.[loc]),
          });
        }
      }

      if (assignments.length > 0) {
        await tx.insert(staffAssignments).values(assignments);
      }

      return newStaff;
    });
  } catch (error: any) {
    console.error("Database error in createStaff:", error);
    throw error;
  }
}

export async function updateStaff(id: string, updates: any, allowedLocationIds: string[], isSuperAdmin: boolean): Promise<Staff> {
  const {
    username,
    password,
    locationIds,
    departmentIds,
    roleIds,
    omicallExtensions,
    omicallPasswords,
    ...staffUpdates
  } = updates;

  if (username) {
    const [existingUser] = await db.select({ id: users.id }).from(users)
      .where(eq(users.username, username));
    const [currentStaff] = await db.select({ userId: staff.userId }).from(staff).where(eq(staff.id, id));
    if (existingUser && currentStaff && existingUser.id !== currentStaff.userId) {
      throw new Error(`Tài khoản "${username}" đã tồn tại trong hệ thống`);
    }
  }
  if (staffUpdates.code) {
    const [existingCode] = await db.select({ id: staff.id }).from(staff).where(eq(staff.code, staffUpdates.code));
    if (existingCode && existingCode.id !== id) throw new Error(`Mã "${staffUpdates.code}" đã tồn tại trong hệ thống`);
  }

  return await db.transaction(async (tx) => {
    let whereClause = eq(staff.id, id);
    if (!isSuperAdmin) {
      whereClause = and(
        whereClause,
        sql`EXISTS (SELECT 1 FROM ${staffAssignments} WHERE ${staffAssignments.staffId} = ${staff.id} AND ${staffAssignments.locationId} IN ${allowedLocationIds})`
      ) as any;
    }

    const [existingStaff] = await tx.select({ id: staff.id, userId: staff.userId }).from(staff).where(whereClause).for("update");
    if (!existingStaff) throw new Error("Staff not found or access denied");

    if (username || password) {
      const userUpdates: any = {};
      if (username) userUpdates.username = username;
      if (password) userUpdates.passwordHash = hashPassword(password);
      await tx.update(users).set(userUpdates).where(eq(users.id, existingStaff.userId));
    }

    if (staffUpdates.status !== undefined) {
      const isActive = staffUpdates.status === "Hoạt động";
      await tx.update(users).set({ isActive }).where(eq(users.id, existingStaff.userId));
    }

    if (locationIds || departmentIds || roleIds || omicallExtensions || omicallPasswords) {
      const existingAssignments = await tx.select().from(staffAssignments).where(eq(staffAssignments.staffId, id));
      const extensionMap: Record<string, string | null> = omicallExtensions ?? Object.fromEntries(
        existingAssignments.map((assignment) => [assignment.locationId, assignment.omicallExtension]),
      );
      // Blank password means "keep the saved password" when editing. A non-empty
      // value replaces it; passwords are never returned to the browser.
      const passwordMap: Record<string, string | null> = Object.fromEntries(
        existingAssignments.map((assignment) => [assignment.locationId, assignment.omicallPasswordEncrypted]),
      );
      if (omicallPasswords) {
        for (const [locationId, passwordValue] of Object.entries(omicallPasswords as Record<string, string | null | undefined>)) {
          if (passwordValue?.trim()) passwordMap[locationId] = encrypt(passwordValue.trim());
        }
      }

      const newLocationIds = locationIds || Array.from(new Set(existingAssignments.map(a => a.locationId)));
      const newDepartmentIds = departmentIds || Array.from(new Set(existingAssignments.map(a => a.departmentId)));
      const newRoleIds = roleIds || Array.from(new Set(existingAssignments.map(a => a.roleId)));

      await tx.delete(staffAssignments).where(eq(staffAssignments.staffId, id));

      // Build assignments as cross-product: each location × each role (with its dept)
      const assignments = [];
      if (newLocationIds.length > 0 && newRoleIds.length > 0) {
        const roleRows = await tx
          .select({ id: roles.id, departmentId: roles.departmentId })
          .from(roles)
          .where(inArray(roles.id, newRoleIds));
        for (const loc of newLocationIds) {
          for (const role of roleRows) {
            assignments.push({
              staffId: id,
              locationId: loc,
              departmentId: role.departmentId,
              roleId: role.id,
              ...getOmicallAssignmentFields(extensionMap[loc], omicallPasswords?.[loc], passwordMap[loc]),
            });
          }
        }
      } else if (newLocationIds.length > 0 && newDepartmentIds.length > 0) {
        for (const loc of newLocationIds) {
          for (const dept of newDepartmentIds) {
            assignments.push({
              staffId: id,
              locationId: loc,
              departmentId: dept,
              roleId: null,
              ...getOmicallAssignmentFields(extensionMap[loc], omicallPasswords?.[loc], passwordMap[loc]),
            });
          }
        }
      } else if (newLocationIds.length > 0) {
        for (const loc of newLocationIds) {
          assignments.push({
            staffId: id,
            locationId: loc,
            departmentId: null,
            roleId: null,
            ...getOmicallAssignmentFields(extensionMap[loc], omicallPasswords?.[loc], passwordMap[loc]),
          });
        }
      }

      if (assignments.length > 0) {
        await tx.insert(staffAssignments).values(assignments);
      }
    }

    const [updated] = await tx.update(staff).set(staffUpdates).where(eq(staff.id, id)).returning();
    return updated;
  });
}

export async function deleteStaff(id: string, allowedLocationIds: string[], isSuperAdmin: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    let whereClause = eq(staff.id, id);
    if (!isSuperAdmin) {
      whereClause = and(
        whereClause,
        sql`EXISTS (SELECT 1 FROM ${staffAssignments} WHERE ${staffAssignments.staffId} = ${staff.id} AND ${staffAssignments.locationId} IN ${allowedLocationIds})`
      ) as any;
    }

    const [existing] = await tx.select({ id: staff.id, userId: staff.userId }).from(staff).where(whereClause).for("update");
    if (!existing) throw new Error("Staff not found or access denied");

    await tx.delete(staffAssignments).where(eq(staffAssignments.staffId, id));
    await tx.delete(staff).where(eq(staff.id, id));
    // Keep the user row for historical foreign-key references, but make sure
    // credentials can no longer be used after the staff profile is deleted.
    await tx.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, existing.userId));
  });
}
