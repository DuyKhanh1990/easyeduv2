import type { Express } from "express";
import { insertTeacherSalaryPackageSchema } from "@shared/schema";
import {
  getTeacherSalaryPackages,
  getTeacherSalaryPackage,
  createTeacherSalaryPackage,
  updateTeacherSalaryPackage,
  deleteTeacherSalaryPackage,
  ensureTeacherSalaryPackagesTable,
} from "../storage/teacher-salary-packages.storage";

export async function registerTeacherSalaryPackageRoutes(app: Express): Promise<void> {
  await ensureTeacherSalaryPackagesTable();

  app.get("/api/teacher-salary-packages", async (req, res) => {
    try {
      const rows = await getTeacherSalaryPackages();
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/teacher-salary-packages/:id", async (req, res) => {
    try {
      const row = await getTeacherSalaryPackage(req.params.id);
      if (!row) return res.status(404).json({ message: "Không tìm thấy gói lương" });
      res.json(row);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/teacher-salary-packages", async (req, res) => {
    try {
      const parsed = insertTeacherSalaryPackageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.errors });
      }
      const row = await createTeacherSalaryPackage(parsed.data);
      res.status(201).json(row);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/teacher-salary-packages/:id", async (req, res) => {
    try {
      const existing = await getTeacherSalaryPackage(req.params.id);
      if (!existing) return res.status(404).json({ message: "Không tìm thấy gói lương" });
      const parsed = insertTeacherSalaryPackageSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.errors });
      }
      const row = await updateTeacherSalaryPackage(req.params.id, parsed.data);
      res.json(row);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/teacher-salary-packages/:id", async (req, res) => {
    try {
      const existing = await getTeacherSalaryPackage(req.params.id);
      if (!existing) return res.status(404).json({ message: "Không tìm thấy gói lương" });
      await deleteTeacherSalaryPackage(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}
