import {
  db,
  eq, sql, and,
  shiftTemplates, teacherAvailability, staffAssignments,
} from "./base";

import type {
  ShiftTemplate, InsertShiftTemplate,
  TeacherAvailability, InsertTeacherAvailability,
} from "./base";

// ---------------------------------------------------------------------------
// getShiftTemplates
// ---------------------------------------------------------------------------
export async function getShiftTemplates(locationId?: string): Promise<ShiftTemplate[]> {
  if (locationId) {
    return await db.select().from(shiftTemplates).where(and(eq(shiftTemplates.locationId, locationId), eq(shiftTemplates.status, "active")));
  }
  return await db.select().from(shiftTemplates).where(eq(shiftTemplates.status, "active"));
}

// ---------------------------------------------------------------------------
// createShiftTemplate
// ---------------------------------------------------------------------------
export async function createShiftTemplate(shift: InsertShiftTemplate): Promise<ShiftTemplate> {
  const [newShift] = await db.insert(shiftTemplates).values(shift).returning();
  return newShift;
}

// ---------------------------------------------------------------------------
// updateShiftTemplate
// ---------------------------------------------------------------------------
export async function updateShiftTemplate(id: string, updates: Partial<InsertShiftTemplate>): Promise<ShiftTemplate> {
  const [updated] = await db.update(shiftTemplates).set(updates).where(eq(shiftTemplates.id, id)).returning();
  return updated;
}

// ---------------------------------------------------------------------------
// deleteShiftTemplate (soft delete — set status = inactive)
// ---------------------------------------------------------------------------
export async function deleteShiftTemplate(id: string): Promise<void> {
  await db.update(shiftTemplates).set({ status: "inactive" }).where(eq(shiftTemplates.id, id));
}

// ---------------------------------------------------------------------------
// checkShiftOverlap
// ---------------------------------------------------------------------------
export async function checkShiftOverlap(locationId: string, startTime: string, endTime: string, excludeId?: string): Promise<boolean> {
  const filters = [
    eq(shiftTemplates.locationId, locationId),
    eq(shiftTemplates.status, "active"),
    sql`${shiftTemplates.startTime} < ${endTime} AND ${shiftTemplates.endTime} > ${startTime}`,
  ];
  if (excludeId) {
    filters.push(sql`${shiftTemplates.id} != ${excludeId}`);
  }
  const results = await db.select().from(shiftTemplates).where(and(...filters));
  return results.length > 0;
}

// ---------------------------------------------------------------------------
// getTeacherAvailabilities
// ---------------------------------------------------------------------------
export async function getTeacherAvailabilities(filters: { locationId?: string; teacherId?: string; weekday?: number }): Promise<any[]> {
  const whereFilters = [];
  if (filters.locationId) whereFilters.push(eq(teacherAvailability.locationId, filters.locationId));
  if (filters.teacherId) whereFilters.push(eq(teacherAvailability.teacherId, filters.teacherId));
  if (filters.weekday !== undefined) whereFilters.push(eq(teacherAvailability.weekday, filters.weekday));

  return await db.query.teacherAvailability.findMany({
    where: whereFilters.length > 0 ? and(...whereFilters) : undefined,
    with: {
      teacher: true,
      location: true,
      shiftTemplate: true,
    },
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });
}

// ---------------------------------------------------------------------------
// createTeacherAvailability
// ---------------------------------------------------------------------------
export async function createTeacherAvailability(data: InsertTeacherAvailability): Promise<TeacherAvailability> {
  const [newAvail] = await db.insert(teacherAvailability).values(data).returning();
  return newAvail;
}

// ---------------------------------------------------------------------------
// updateTeacherAvailability
// ---------------------------------------------------------------------------
export async function updateTeacherAvailability(id: string, data: Partial<InsertTeacherAvailability>): Promise<TeacherAvailability> {
  const [updated] = await db.update(teacherAvailability).set(data).where(eq(teacherAvailability.id, id)).returning();
  return updated;
}

// ---------------------------------------------------------------------------
// deleteTeacherAvailability
// ---------------------------------------------------------------------------
export async function deleteTeacherAvailability(id: string): Promise<void> {
  await db.delete(teacherAvailability).where(eq(teacherAvailability.id, id));
}

// ---------------------------------------------------------------------------
// checkTeacherAtLocation
// ---------------------------------------------------------------------------
export async function checkTeacherAtLocation(teacherId: string, locationId: string): Promise<boolean> {
  const results = await db.select().from(staffAssignments).where(and(eq(staffAssignments.staffId, teacherId), eq(staffAssignments.locationId, locationId)));
  return results.length > 0;
}

// ---------------------------------------------------------------------------
// checkAvailabilityDuplicate
// ---------------------------------------------------------------------------
export async function checkAvailabilityDuplicate(data: InsertTeacherAvailability): Promise<boolean> {
  const results = await db.select().from(teacherAvailability).where(and(
    eq(teacherAvailability.teacherId, data.teacherId),
    eq(teacherAvailability.locationId, data.locationId),
    eq(teacherAvailability.shiftTemplateId, data.shiftTemplateId),
    eq(teacherAvailability.weekday, data.weekday),
    data.effectiveFrom
      ? eq(teacherAvailability.effectiveFrom, data.effectiveFrom)
      : sql`${teacherAvailability.effectiveFrom} IS NULL`,
  ));
  return results.length > 0;
}
