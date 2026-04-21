import type { Express } from "express";
import { insertTeacherSalaryTableSchema, staffSalaryConfigs } from "@shared/schema";
import { db } from "../db";
import { eq, inArray } from "drizzle-orm";
import {
  getTeacherSalaryTables,
  getTeacherSalaryTable,
  createTeacherSalaryTable,
  updateTeacherSalaryTable,
  deleteTeacherSalaryTable,
  getTeacherSalaryDetailRows,
  getTeacherSalaryRowPackages,
  saveTeacherSalaryRowPackages,
  deleteTeacherSalaryRowPackage,
  ensureTeacherSalaryRowPackagesTable,
  ensureTeacherSalaryPublishedRowsTable,
  publishSalaryRows,
  getPublishedSalaryRows,
} from "../storage/teacher-salary.storage";

export async function registerTeacherSalaryRoutes(app: Express): Promise<void> {
  await ensureTeacherSalaryRowPackagesTable();
  await ensureTeacherSalaryPublishedRowsTable();

  app.get("/api/teacher-salary-tables", async (req, res) => {
    try {
      const allowedLocationIds = req.allowedLocationIds ?? [];
      const isSuperAdmin = req.isSuperAdmin ?? false;
      const rows = await getTeacherSalaryTables(allowedLocationIds, isSuperAdmin);
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/teacher-salary-tables/:id", async (req, res) => {
    try {
      const row = await getTeacherSalaryTable(req.params.id);
      if (!row) return res.status(404).json({ message: "Không tìm thấy bảng lương" });
      res.json(row);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/teacher-salary-tables/:id/detail", async (req, res) => {
    try {
      const table = await getTeacherSalaryTable(req.params.id);
      if (!table) return res.status(404).json({ message: "Không tìm thấy bảng lương" });
      const rows = await getTeacherSalaryDetailRows(req.params.id);
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/teacher-salary-tables/:id/packages", async (req, res) => {
    try {
      const packages = await getTeacherSalaryRowPackages(req.params.id);
      res.json(packages);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/teacher-salary-tables/:id/packages", async (req, res) => {
    try {
      const { assignments } = req.body;
      if (!Array.isArray(assignments)) {
        return res.status(400).json({ message: "assignments phải là mảng" });
      }
      await saveTeacherSalaryRowPackages(req.params.id, assignments);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/teacher-salary-tables/:id/packages/:teacherId/:classId", async (req, res) => {
    try {
      await deleteTeacherSalaryRowPackage(req.params.id, req.params.teacherId, req.params.classId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Suggested packages based on staff salary configs
  app.get("/api/teacher-salary-tables/:id/suggested-packages", async (req, res) => {
    try {
      const rows = await getTeacherSalaryDetailRows(req.params.id);
      if (rows.length === 0) return res.json([]);

      const teacherIds = Array.from(new Set(rows.map(r => r.teacherId)));
      const configs = await db
        .select()
        .from(staffSalaryConfigs)
        .where(inArray(staffSalaryConfigs.staffId, teacherIds));

      if (configs.length === 0) return res.json([]);

      // Build lookup: staffId -> Map<courseId, packageId>
      const configMap = new Map<string, Map<string, string>>();
      for (const c of configs) {
        if (!configMap.has(c.staffId)) configMap.set(c.staffId, new Map());
        configMap.get(c.staffId)!.set(c.courseId, c.salaryPackageId);
      }

      const suggestions: { teacherId: string; classId: string; packageId: string }[] = [];
      for (const row of rows) {
        if (!row.courseId) continue;
        const courseMap = configMap.get(row.teacherId);
        if (!courseMap) continue;
        const packageId = courseMap.get(row.courseId);
        if (packageId) {
          suggestions.push({ teacherId: row.teacherId, classId: row.classId, packageId });
        }
      }

      res.json(suggestions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/teacher-salary-tables", async (req, res) => {
    try {
      const parsed = insertTeacherSalaryTableSchema.safeParse({
        ...req.body,
        createdBy: (req.user as any)?.id ?? null,
      });
      if (!parsed.success) {
        return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.errors });
      }
      const row = await createTeacherSalaryTable(parsed.data);
      res.status(201).json(row);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/teacher-salary-tables/:id", async (req, res) => {
    try {
      const existing = await getTeacherSalaryTable(req.params.id);
      if (!existing) return res.status(404).json({ message: "Không tìm thấy bảng lương" });

      const parsed = insertTeacherSalaryTableSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.errors });
      }
      const row = await updateTeacherSalaryTable(req.params.id, parsed.data);
      res.json(row);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/teacher-salary-tables/:id", async (req, res) => {
    try {
      const existing = await getTeacherSalaryTable(req.params.id);
      if (!existing) return res.status(404).json({ message: "Không tìm thấy bảng lương" });
      await deleteTeacherSalaryTable(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/teacher-salary-tables/:id/published-rows", async (req, res) => {
    try {
      const rows = await getPublishedSalaryRows(req.params.id);
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/teacher-salary-tables/:id/publish", async (req, res) => {
    try {
      const { rows } = req.body;
      if (!Array.isArray(rows)) {
        return res.status(400).json({ message: "rows phải là mảng" });
      }
      await publishSalaryRows(req.params.id, rows);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}
