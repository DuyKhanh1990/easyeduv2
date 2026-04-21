import type { Express } from "express";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { staffSalaryConfigs, insertStaffSalaryConfigSchema, courses, teacherSalaryPackages, staff, departments, staffAssignments } from "@shared/schema";
import { z } from "zod";

export function registerStaffSalaryConfigRoutes(app: Express): void {
  app.get("/api/staff-salary-configs", async (req, res) => {
    try {
      const staffId = req.query.staffId as string | undefined;
      if (!staffId) return res.status(400).json({ message: "staffId is required" });

      const configs = await db
        .select({
          id: staffSalaryConfigs.id,
          staffId: staffSalaryConfigs.staffId,
          courseId: staffSalaryConfigs.courseId,
          salaryPackageId: staffSalaryConfigs.salaryPackageId,
          createdAt: staffSalaryConfigs.createdAt,
          courseName: courses.name,
          salaryPackageName: teacherSalaryPackages.name,
        })
        .from(staffSalaryConfigs)
        .leftJoin(courses, eq(staffSalaryConfigs.courseId, courses.id))
        .leftJoin(teacherSalaryPackages, eq(staffSalaryConfigs.salaryPackageId, teacherSalaryPackages.id))
        .where(eq(staffSalaryConfigs.staffId, staffId));

      res.json(configs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/staff-salary-configs", async (req, res) => {
    try {
      const parsed = insertStaffSalaryConfigSchema.parse(req.body);
      const [created] = await db.insert(staffSalaryConfigs).values(parsed).returning();
      res.status(201).json(created);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/staff-salary-configs/:id", async (req, res) => {
    try {
      const { courseId, salaryPackageId } = req.body;
      const updates: Record<string, string> = {};
      if (courseId) updates.courseId = courseId;
      if (salaryPackageId) updates.salaryPackageId = salaryPackageId;
      const [updated] = await db
        .update(staffSalaryConfigs)
        .set(updates)
        .where(eq(staffSalaryConfigs.id, req.params.id))
        .returning();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/staff-salary-configs/:id", async (req, res) => {
    try {
      await db.delete(staffSalaryConfigs).where(eq(staffSalaryConfigs.id, req.params.id));
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/staff/training-department", async (req, res) => {
    try {
      const trainingDept = await db
        .select()
        .from(departments)
        .where(eq(departments.isSystem, true));

      const trainingDeptIds = trainingDept.map(d => d.id);
      if (trainingDeptIds.length === 0) return res.json([]);

      const { inArray } = await import("drizzle-orm");

      const assignments = await db
        .select({
          staffId: staffAssignments.staffId,
        })
        .from(staffAssignments)
        .where(inArray(staffAssignments.departmentId, trainingDeptIds));

      const staffIds = Array.from(new Set(assignments.map(a => a.staffId)));
      if (staffIds.length === 0) return res.json([]);

      const staffList = await db
        .select({ id: staff.id, fullName: staff.fullName, code: staff.code, status: staff.status })
        .from(staff)
        .where(inArray(staff.id, staffIds));

      res.json(staffList);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
