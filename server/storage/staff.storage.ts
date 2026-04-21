import {
  db,
  eq, sql, and, inArray,
  users, locations, staff, departments, roles, staffAssignments,
} from "./base";
import { hashPassword } from "../auth";
import type {
  Location,
  Staff,
  Department, InsertDepartment, Role, InsertRole, DepartmentWithRoles,
} from "./base";
import { insertLocationSchema } from "@shared/schema";
import type { z } from "zod";

type InsertLocation = z.infer<typeof insertLocationSchema>;

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

export async function deleteLocation(id: string): Promise<void> {
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
  await db.delete(roles).where(eq(roles.id, id));
}

// ==========================================
// STAFF METHODS
// ==========================================

export async function getStaff(allowedLocationIds: string[], isSuperAdmin: boolean, locationId?: string, minimal?: boolean): Promise<any[]> {
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

  let results: any[];
  if (isSuperAdmin) {
    if (locationId && locationId !== "all") {
      results = await baseQuery
        .innerJoin(staffAssignments, eq(staff.id, staffAssignments.staffId))
        .where(eq(staffAssignments.locationId, locationId));
    } else {
      results = await baseQuery;
    }
  } else {
    results = await baseQuery
      .innerJoin(staffAssignments, eq(staff.id, staffAssignments.staffId))
      .where(
        locationId && locationId !== "all"
          ? and(inArray(staffAssignments.locationId, allowedLocationIds), eq(staffAssignments.locationId, locationId))
          : inArray(staffAssignments.locationId, allowedLocationIds)
      );
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
      })
      .from(staffAssignments)
      .where(inArray(staffAssignments.staffId, staffIds));

    const locationIdsMap = new Map<string, string[]>();
    minimalAssignments.forEach(a => {
      const existing = locationIdsMap.get(a.staffId) || [];
      if (!existing.includes(a.locationId)) existing.push(a.locationId);
      locationIdsMap.set(a.staffId, existing);
    });

    return dedupedStaff.map(s => ({
      id: s.id,
      code: s.code,
      fullName: s.fullName,
      email: s.email,
      phone: s.phone,
      status: s.status,
      locationIds: locationIdsMap.get(s.id) || [],
    }));
  }

  const allAssignments = await db.query.staffAssignments.findMany({
    where: inArray(staffAssignments.staffId, staffIds),
    with: {
      location: true,
      department: true,
      role: true
    }
  });

  const assignmentsMap = new Map<string, any[]>();
  allAssignments.forEach(a => {
    const existing = assignmentsMap.get(a.staffId) || [];
    assignmentsMap.set(a.staffId, [...existing, a]);
  });

  return dedupedStaff.map(s => ({
    ...s,
    username: usernameMap.get(s.userId) || "",
    assignments: assignmentsMap.get(s.id) || [],
    locationIds: Array.from(new Set((assignmentsMap.get(s.id) || []).map((a: any) => a.locationId))),
    departmentIds: Array.from(new Set((assignmentsMap.get(s.id) || []).map((a: any) => a.departmentId))),
    roleIds: Array.from(new Set((assignmentsMap.get(s.id) || []).map((a: any) => a.roleId)))
  }));
}

export async function createStaff(insertData: any): Promise<Staff> {
  const { username, password, locationIds, departmentIds, roleIds, ...staffData } = insertData;

  if (username) {
    const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
    if (existingUser) throw new Error(`Tài khoản "${username}" đã tồn tại trong hệ thống`);
  }
  if (staffData.code) {
    const [existingCode] = await db.select({ id: staff.id }).from(staff).where(eq(staff.code, staffData.code));
    if (existingCode) throw new Error(`Mã "${staffData.code}" đã tồn tại trong hệ thống`);
  }

  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({
        username,
        passwordHash: hashPassword(password || "123456"),
        isActive: true,
      }).returning();

      const [newStaff] = await tx.insert(staff).values({
        ...staffData,
        userId: user.id,
      }).returning();

      const assignments = [];
      const maxLen = Math.max(
        (locationIds || []).length,
        (departmentIds || []).length,
        (roleIds || []).length
      );

      for (let i = 0; i < maxLen; i++) {
        assignments.push({
          staffId: newStaff.id,
          locationId: locationIds?.[i] || locationIds?.[0],
          departmentId: departmentIds?.[i] || departmentIds?.[0],
          roleId: roleIds?.[i] || roleIds?.[0],
        });
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
  const { username, password, locationIds, departmentIds, roleIds, ...staffUpdates } = updates;

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

    if (locationIds || departmentIds || roleIds) {
      const existingAssignments = await tx.select().from(staffAssignments).where(eq(staffAssignments.staffId, id));

      const newLocationIds = locationIds || Array.from(new Set(existingAssignments.map(a => a.locationId)));
      const newDepartmentIds = departmentIds || Array.from(new Set(existingAssignments.map(a => a.departmentId)));
      const newRoleIds = roleIds || Array.from(new Set(existingAssignments.map(a => a.roleId)));

      await tx.delete(staffAssignments).where(eq(staffAssignments.staffId, id));

      const assignments = [];
      const maxLen = Math.max(
        newLocationIds.length,
        newDepartmentIds.length,
        newRoleIds.length
      );

      for (let i = 0; i < maxLen; i++) {
        assignments.push({
          staffId: id,
          locationId: newLocationIds[i] || newLocationIds[0],
          departmentId: newDepartmentIds[i] || newDepartmentIds[0],
          roleId: newRoleIds[i] || newRoleIds[0],
        });
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

    const [existing] = await tx.select({ id: staff.id }).from(staff).where(whereClause).for("update");
    if (!existing) throw new Error("Staff not found or access denied");

    await tx.delete(staffAssignments).where(eq(staffAssignments.staffId, id));
    await tx.delete(staff).where(eq(staff.id, id));
  });
}
