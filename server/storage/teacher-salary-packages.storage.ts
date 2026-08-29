import { db, eq, sql } from "./base";
import { teacherSalaryPackages } from "@shared/schema";
import type { TeacherSalaryPackage, InsertTeacherSalaryPackage } from "@shared/schema";

export async function ensureTeacherSalaryPackagesTable(): Promise<void> {
  // No-op: teacher_salary_packages and all columns are declared in shared/schema.ts
  // Apply via: npm run db:push  or  npx tsx scripts/push-db-direct.ts
}

export async function getTeacherSalaryPackages(): Promise<TeacherSalaryPackage[]> {
  return db.select().from(teacherSalaryPackages).orderBy(teacherSalaryPackages.createdAt);
}

export async function getTeacherSalaryPackage(id: string): Promise<TeacherSalaryPackage | undefined> {
  const [row] = await db.select().from(teacherSalaryPackages).where(eq(teacherSalaryPackages.id, id));
  return row;
}

export async function createTeacherSalaryPackage(data: InsertTeacherSalaryPackage): Promise<TeacherSalaryPackage> {
  const [row] = await db.insert(teacherSalaryPackages).values(data).returning();
  return row;
}

export async function updateTeacherSalaryPackage(
  id: string,
  data: Partial<InsertTeacherSalaryPackage>
): Promise<TeacherSalaryPackage> {
  const [row] = await db
    .update(teacherSalaryPackages)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(teacherSalaryPackages.id, id))
    .returning();
  return row;
}

export async function deleteTeacherSalaryPackage(id: string): Promise<void> {
  await db.delete(teacherSalaryPackages).where(eq(teacherSalaryPackages.id, id));
}
