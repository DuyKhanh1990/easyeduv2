import { db, eq, sql } from "./base";
import { teacherSalaryPackages } from "@shared/schema";
import type { TeacherSalaryPackage, InsertTeacherSalaryPackage } from "@shared/schema";

export async function ensureTeacherSalaryPackagesTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS teacher_salary_packages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL,
      role VARCHAR(100) NOT NULL DEFAULT 'Giáo viên',
      unit_price NUMERIC(15, 2),
      ranges JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    ALTER TABLE teacher_salary_packages ADD COLUMN IF NOT EXISTS ranges JSONB
  `);
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
