import { db } from "../db";
import { attendanceFeeRules, InsertAttendanceFeeRule } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function getAttendanceFeeRules() {
  return db.select().from(attendanceFeeRules).orderBy(attendanceFeeRules.createdAt);
}

export async function upsertAttendanceFeeRule(data: InsertAttendanceFeeRule) {
  const existing = await db
    .select()
    .from(attendanceFeeRules)
    .where(eq(attendanceFeeRules.attendanceStatus, data.attendanceStatus));

  if (existing.length > 0) {
    const [updated] = await db
      .update(attendanceFeeRules)
      .set({ deductsFee: data.deductsFee })
      .where(eq(attendanceFeeRules.attendanceStatus, data.attendanceStatus))
      .returning();
    return updated;
  }

  const [inserted] = await db
    .insert(attendanceFeeRules)
    .values(data)
    .returning();
  return inserted;
}

export async function deleteAttendanceFeeRule(attendanceStatus: string) {
  await db
    .delete(attendanceFeeRules)
    .where(eq(attendanceFeeRules.attendanceStatus, attendanceStatus));
}
