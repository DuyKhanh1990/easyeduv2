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
export async function getShiftTemplates(locationId?: string, type?: string, includeInactive = false): Promise<ShiftTemplate[]> {
  const filters = includeInactive ? [] : [eq(shiftTemplates.status, "active")];
  if (locationId) filters.push(eq(shiftTemplates.locationId, locationId));
  if (type) filters.push(eq(shiftTemplates.type as any, type));
  return await db.select().from(shiftTemplates).where(and(...filters));
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

export async function removeTeacherAvailabilityFromDate(
  id: string,
  date: string,
  mode: "single" | "future",
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw Object.assign(new Error("Ngày xóa không hợp lệ."), { statusCode: 400 });
  }
  const selectedDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(selectedDate.getTime()) || selectedDate.toISOString().slice(0, 10) !== date) {
    throw Object.assign(new Error("Ngày xóa không hợp lệ."), { statusCode: 400 });
  }
  const weekday = selectedDate.getUTCDay();
  const addDays = (value: string, amount: number) => {
    const day = new Date(`${value}T00:00:00.000Z`);
    day.setUTCDate(day.getUTCDate() + amount);
    return day.toISOString().slice(0, 10);
  };
  const previousDate = addDays(date, -1);
  const nextDate = addDays(date, 1);

  await db.transaction(async (tx) => {
    const [availability] = await tx
      .select()
      .from(teacherAvailability)
      .where(eq(teacherAvailability.id, id))
      .limit(1);
    if (!availability) {
      throw Object.assign(new Error("Không tìm thấy đăng ký ca."), { statusCode: 404 });
    }
    if (availability.weekday !== weekday) {
      throw Object.assign(new Error("Ngày đã chọn không thuộc thứ của ca đăng ký này."), { statusCode: 400 });
    }

    const effectiveFrom = availability.effectiveFrom ? String(availability.effectiveFrom).slice(0, 10) : null;
    const effectiveTo = availability.effectiveTo ? String(availability.effectiveTo).slice(0, 10) : null;
    if ((effectiveFrom && date < effectiveFrom) || (effectiveTo && date > effectiveTo)) {
      throw Object.assign(new Error("Ngày đã chọn nằm ngoài khoảng hiệu lực của đăng ký."), { statusCode: 400 });
    }

    if (mode === "future") {
      if (effectiveFrom && date <= effectiveFrom) {
        await tx.delete(teacherAvailability).where(eq(teacherAvailability.id, id));
      } else {
        await tx
          .update(teacherAvailability)
          .set({ effectiveTo: previousDate, updatedAt: new Date() })
          .where(eq(teacherAvailability.id, id));
      }
      return;
    }

    const hasPreviousRange = !effectiveFrom || effectiveFrom <= previousDate;
    const hasNextRange = !effectiveTo || nextDate <= effectiveTo;

    if (hasPreviousRange && hasNextRange) {
      await tx
        .update(teacherAvailability)
        .set({ effectiveTo: previousDate, updatedAt: new Date() })
        .where(eq(teacherAvailability.id, id));
      await tx.insert(teacherAvailability).values({
        teacherId: availability.teacherId,
        locationId: availability.locationId,
        shiftTemplateId: availability.shiftTemplateId,
        weekday: availability.weekday,
        effectiveFrom: nextDate,
        effectiveTo: availability.effectiveTo,
      });
    } else if (hasPreviousRange) {
      await tx
        .update(teacherAvailability)
        .set({ effectiveTo: previousDate, updatedAt: new Date() })
        .where(eq(teacherAvailability.id, id));
    } else if (hasNextRange) {
      await tx
        .update(teacherAvailability)
        .set({ effectiveFrom: nextDate, updatedAt: new Date() })
        .where(eq(teacherAvailability.id, id));
    } else {
      await tx.delete(teacherAvailability).where(eq(teacherAvailability.id, id));
    }
  });
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
