import type { Express } from "express";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { staffAssignments, departments, users } from "@shared/schema";
import {
  getAttendanceFeeRules,
  upsertAttendanceFeeRule,
  deleteAttendanceFeeRule,
} from "../storage/attendance-fee-rule.storage";

function sanitizeDateField(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return null;
}

export function registerConfigRoutes(app: Express): void {
  // Dashboard
  app.get(api.dashboard.stats.path, async (req, res) => {
    const stats = await storage.getDashboardStats(req.allowedLocationIds, req.isSuperAdmin);
    res.json(stats);
  });

  // Locations
  app.get(api.locations.list.path, async (req, res) => {
    let results = await storage.getLocations();
    if (!req.isSuperAdmin) {
      results = results.filter(loc => req.allowedLocationIds.includes(loc.id));
    }
    res.json(results);
  });

  app.get(api.locations.get.path, async (req, res) => {
    const loc = await storage.getLocation(req.params.id);
    if (!loc) return res.status(404).json({ message: "Not found" });
    if (!req.isSuperAdmin && !req.allowedLocationIds.includes(loc.id)) {
      return res.status(403).json({ message: "Access denied" });
    }
    res.json(loc);
  });

  app.post(api.locations.create.path, async (req, res) => {
    try {
      const input = api.locations.create.input.parse(req.body);
      const loc = await storage.createLocation(input);
      res.status(201).json(loc);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      throw err;
    }
  });

  app.put(api.locations.update.path, async (req, res) => {
    try {
      const input = api.locations.update.input.parse(req.body);
      const loc = await storage.updateLocation(req.params.id, input);
      res.json(loc);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      throw err;
    }
  });

  app.delete(api.locations.delete.path, async (req, res) => {
    await storage.deleteLocation(req.params.id);
    res.status(204).send();
  });

  // Departments & Roles
  app.get(api.departments.list.path, async (req, res) => {
    const depts = await storage.getDepartments(req.allowedLocationIds, req.isSuperAdmin);
    res.json(depts);
  });

  app.post(api.departments.create.path, async (req, res) => {
    try {
      const input = api.departments.create.input.parse(req.body);
      const existing = await storage.getDepartmentByName(input.name);
      if (existing) return res.status(409).json({ message: `Phòng ban "${input.name}" đã tồn tại.` });
      const dept = await storage.createDepartment(input);
      res.status(201).json(dept);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      throw err;
    }
  });

  app.put(api.departments.update.path, async (req, res) => {
    try {
      const input = api.departments.update.input.parse(req.body);
      if (input.name) {
        const existing = await storage.getDepartmentByName(input.name);
        if (existing && existing.id !== req.params.id) {
          return res.status(409).json({ message: `Phòng ban "${input.name}" đã tồn tại.` });
        }
      }
      const dept = await storage.updateDepartment(req.params.id, input);
      res.json(dept);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      throw err;
    }
  });

  app.delete(api.departments.delete.path, async (req, res) => {
    await storage.deleteDepartment(req.params.id);
    res.status(204).send();
  });

  app.post(api.roles.create.path, async (req, res) => {
    try {
      const input = api.roles.create.input.parse(req.body);
      const existing = await storage.getRoleByNameInDepartment(input.name, input.departmentId);
      if (existing) return res.status(409).json({ message: `Vai trò "${input.name}" đã tồn tại trong phòng ban này.` });
      const role = await storage.createRole(input);
      res.status(201).json(role);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      throw err;
    }
  });

  app.put(api.roles.update.path, async (req, res) => {
    try {
      const input = api.roles.update.input.parse(req.body);
      if (input.name && input.departmentId) {
        const existing = await storage.getRoleByNameInDepartment(input.name, input.departmentId);
        if (existing && existing.id !== req.params.id) {
          return res.status(409).json({ message: `Vai trò "${input.name}" đã tồn tại trong phòng ban này.` });
        }
      }
      const role = await storage.updateRole(req.params.id, input);
      res.json(role);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      throw err;
    }
  });

  app.delete(api.roles.delete.path, async (req, res) => {
    await storage.deleteRole(req.params.id);
    res.status(204).send();
  });

  // Staff
  app.get(api.staff.list.path, async (req, res) => {
    const locationId = req.query.locationId as string | undefined;
    const minimal = req.query.minimal === "true";
    const staff = await storage.getStaff(req.allowedLocationIds, req.isSuperAdmin, locationId, minimal);
    res.json(staff);
  });

  app.post(api.staff.create.path, async (req, res) => {
    try {
      const body = { ...req.body, dateOfBirth: sanitizeDateField(req.body.dateOfBirth) };
      const staff = await storage.createStaff(body);
      res.status(201).json(staff);

      // Tinode user account is created lazily on first browser login (client-side acc message).
    } catch (err: any) {
      console.error("Create staff error:", err);
      res.status(400).json({ message: err.message || "Không thể lưu nhân sự" });
    }
  });

  app.put(api.staff.update.path, async (req, res) => {
    try {
      const body = { ...req.body, dateOfBirth: sanitizeDateField(req.body.dateOfBirth) };
      const staff = await storage.updateStaff(req.params.id, body, req.allowedLocationIds, req.isSuperAdmin);
      res.json(staff);
    } catch (err: any) {
      const status = err.message?.includes("not found") || err.message?.includes("access denied") ? 403 : 400;
      res.status(status).json({ message: err.message });
    }
  });

  app.delete(api.staff.delete.path, async (req, res) => {
    try {
      await storage.deleteStaff(req.params.id, req.allowedLocationIds, req.isSuperAdmin);
      res.status(204).send();
    } catch (err: any) {
      res.status(403).json({ message: err.message });
    }
  });

  // Courses & Fee Packages
  app.get(api.courses.list.path, async (req, res) => {
    res.json(await storage.getCourses());
  });

  app.post(api.courses.create.path, async (req, res) => {
    try {
      const { insertCourseSchema } = await import("@shared/schema");
      const input = insertCourseSchema.parse(req.body);
      const course = await storage.createCourse(input);
      res.status(201).json(course);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.get(api.courses.feePackages.path, async (req, res) => {
    res.json(await storage.getCourseFeePackages(req.params.id));
  });

  app.get("/api/fee-packages", async (req, res) => {
    try {
      const locationId = req.query.locationId as string | undefined;
      res.json(await storage.getAllFeePackages(locationId || undefined));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post(api.courses.createFeePackage.path, async (req, res) => {
    try {
      const { insertCourseFeePackageSchema } = await import("@shared/schema");
      const input = insertCourseFeePackageSchema.parse({ ...req.body, courseId: req.params.id });
      const pkg = await storage.createCourseFeePackage(input);
      res.status(201).json(pkg);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put("/api/courses/:courseId/fee-packages/:pkgId", async (req, res) => {
    try {
      const updated = await storage.updateCourseFeePackage(req.params.pkgId, req.body);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete("/api/courses/:courseId/fee-packages/:pkgId", async (req, res) => {
    try {
      await storage.deleteCourseFeePackage(req.params.pkgId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  // Course Programs
  app.get("/api/course-programs", async (_req, res) => {
    const allPrograms = await storage.getCoursePrograms();
    res.json(allPrograms);
  });

  app.post("/api/course-programs", async (req, res) => {
    try {
      const { insertCourseProgramSchema } = await import("@shared/schema");
      const parsed = insertCourseProgramSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(parsed.error);
      const program = await storage.createCourseProgram(parsed.data);
      res.json(program);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.get("/api/course-program-contents", async (_req, res) => {
    const contents = await storage.getAllCourseProgramContents();
    res.json(contents);
  });

  app.post("/api/course-program-contents", async (req, res) => {
    try {
      const { insertCourseProgramContentSchema } = await import("@shared/schema");
      const parsed = insertCourseProgramContentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(parsed.error);
      const userId = (req.user as any)?.id || null;
      const content = await storage.createCourseProgramContent({ ...parsed.data, createdBy: userId });
      res.json(content);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.get("/api/course-programs/:id/contents", async (req, res) => {
    const contents = await storage.getCourseProgramContents(req.params.id);
    res.json(contents);
  });

  app.post("/api/course-programs/:id/contents", async (req, res) => {
    try {
      const { insertCourseProgramContentSchema } = await import("@shared/schema");
      const parsed = insertCourseProgramContentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(parsed.error);
      const content = await storage.createCourseProgramContent(parsed.data);
      res.json(content);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.patch("/api/course-program-contents/:id", async (req, res) => {
    try {
      const { insertCourseProgramContentSchema } = await import("@shared/schema");
      const parsed = insertCourseProgramContentSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json(parsed.error);
      const content = await storage.updateCourseProgramContent(req.params.id, parsed.data);
      res.json(content);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete("/api/course-program-contents/:id", async (req, res) => {
    try {
      await storage.deleteCourseProgramContent(req.params.id);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  // Classrooms
  app.get("/api/classrooms", async (req, res) => {
    try {
      const { classrooms } = await import("@shared/schema");
      const locationId = req.query.locationId as string | undefined;
      let rows;
      if (locationId) {
        rows = await db.select().from(classrooms).where(eq(classrooms.locationId, locationId));
      } else {
        rows = await db.select().from(classrooms);
      }
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/classrooms", async (req, res) => {
    try {
      const { classrooms, insertClassroomSchema } = await import("@shared/schema");
      const input = insertClassroomSchema.parse(req.body);
      const [row] = await db.insert(classrooms).values(input).returning();
      res.status(201).json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put("/api/classrooms/:id", async (req, res) => {
    try {
      const { classrooms, insertClassroomSchema } = await import("@shared/schema");
      const input = insertClassroomSchema.partial().parse(req.body);
      const [row] = await db.update(classrooms).set(input).where(eq(classrooms.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete("/api/classrooms/:id", async (req, res) => {
    try {
      const { classrooms } = await import("@shared/schema");
      await db.delete(classrooms).where(eq(classrooms.id, req.params.id));
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Evaluation Criteria
  app.get("/api/evaluation-criteria", async (req, res) => {
    try {
      const { evaluationCriteria, evaluationSubCriteria } = await import("@shared/schema");
      const criteria = await db.select().from(evaluationCriteria).orderBy(evaluationCriteria.name);
      const allSub = await db.select().from(evaluationSubCriteria).orderBy(evaluationSubCriteria.name);
      const result = criteria.map((c) => ({
        ...c,
        subCriteria: allSub.filter((s) => s.criteriaId === c.id),
      }));
      res.json(result);
    } catch (err) { res.status(500).json({ message: (err as any).message }); }
  });

  app.post("/api/evaluation-criteria", async (req, res) => {
    try {
      const { evaluationCriteria, insertEvaluationCriteriaSchema } = await import("@shared/schema");
      const input = insertEvaluationCriteriaSchema.parse(req.body);
      const [row] = await db.insert(evaluationCriteria).values(input).returning();
      res.status(201).json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put("/api/evaluation-criteria/:id", async (req, res) => {
    try {
      const { evaluationCriteria, insertEvaluationCriteriaSchema } = await import("@shared/schema");
      const input = insertEvaluationCriteriaSchema.partial().parse(req.body);
      const [row] = await db.update(evaluationCriteria).set({ ...input, updatedAt: new Date() }).where(eq(evaluationCriteria.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete("/api/evaluation-criteria/:id", async (req, res) => {
    try {
      const { evaluationCriteria } = await import("@shared/schema");
      await db.delete(evaluationCriteria).where(eq(evaluationCriteria.id, req.params.id));
      res.status(204).send();
    } catch (err) { res.status(500).json({ message: (err as any).message }); }
  });

  app.get("/api/evaluation-criteria/:criteriaId/sub-criteria", async (req, res) => {
    try {
      const { evaluationSubCriteria } = await import("@shared/schema");
      const rows = await db.select().from(evaluationSubCriteria).where(eq(evaluationSubCriteria.criteriaId, req.params.criteriaId)).orderBy(evaluationSubCriteria.name);
      res.json(rows);
    } catch (err) { res.status(500).json({ message: (err as any).message }); }
  });

  app.post("/api/evaluation-sub-criteria", async (req, res) => {
    try {
      const { evaluationSubCriteria, insertEvaluationSubCriteriaSchema } = await import("@shared/schema");
      const input = insertEvaluationSubCriteriaSchema.parse(req.body);
      const [row] = await db.insert(evaluationSubCriteria).values(input).returning();
      res.status(201).json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put("/api/evaluation-sub-criteria/:id", async (req, res) => {
    try {
      const { evaluationSubCriteria, insertEvaluationSubCriteriaSchema } = await import("@shared/schema");
      const input = insertEvaluationSubCriteriaSchema.partial().parse(req.body);
      const [row] = await db.update(evaluationSubCriteria).set({ ...input, updatedAt: new Date() }).where(eq(evaluationSubCriteria.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete("/api/evaluation-sub-criteria/:id", async (req, res) => {
    try {
      const { evaluationSubCriteria } = await import("@shared/schema");
      await db.delete(evaluationSubCriteria).where(eq(evaluationSubCriteria.id, req.params.id));
      res.status(204).send();
    } catch (err) { res.status(500).json({ message: (err as any).message }); }
  });

  // Subjects
  app.get("/api/subjects", async (req, res) => {
    try {
      const { subjects } = await import("@shared/schema");
      const rows = await db.select().from(subjects).orderBy(subjects.name);
      res.json(rows);
    } catch (err) { res.status(500).json({ message: (err as any).message }); }
  });

  app.post("/api/subjects", async (req, res) => {
    try {
      const { subjects, insertSubjectSchema } = await import("@shared/schema");
      const input = insertSubjectSchema.parse(req.body);
      const [row] = await db.insert(subjects).values(input).returning();
      res.status(201).json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put("/api/subjects/:id", async (req, res) => {
    try {
      const { subjects, insertSubjectSchema } = await import("@shared/schema");
      const input = insertSubjectSchema.partial().parse(req.body);
      const [row] = await db.update(subjects).set({ ...input, updatedAt: new Date() }).where(eq(subjects.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete("/api/subjects/:id", async (req, res) => {
    try {
      const { subjects } = await import("@shared/schema");
      await db.delete(subjects).where(eq(subjects.id, req.params.id));
      res.status(204).send();
    } catch (err) { res.status(500).json({ message: (err as any).message }); }
  });

  // Shift Templates
  app.get("/api/shift-templates", async (req, res) => {
    const locationId = req.query.locationId as string | undefined;
    const effectiveLocationId = (locationId === "undefined" || !locationId) ? undefined : locationId;
    const shifts = await storage.getShiftTemplates(effectiveLocationId);
    res.json(shifts);
  });

  app.post("/api/shift-templates", async (req, res) => {
    try {
      const { insertShiftTemplateSchema } = await import("@shared/schema");
      const input = insertShiftTemplateSchema.parse(req.body);

      const isOverlap = await storage.checkShiftOverlap(input.locationId, input.startTime, input.endTime);
      if (isOverlap) {
        return res.status(400).json({ message: "Thời gian ca học bị trùng lấn với ca học khác cùng cơ sở." });
      }

      const shift = await storage.createShiftTemplate(input);
      res.status(201).json(shift);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put("/api/shift-templates/:id", async (req, res) => {
    try {
      const { insertShiftTemplateSchema } = await import("@shared/schema");
      const input = insertShiftTemplateSchema.partial().parse(req.body);

      if (input.startTime && input.endTime && input.locationId) {
        const isOverlap = await storage.checkShiftOverlap(input.locationId, input.startTime, input.endTime, req.params.id);
        if (isOverlap) {
          return res.status(400).json({ message: "Thời gian ca học bị trùng lấn với ca học khác cùng cơ sở." });
        }
      }

      const shift = await storage.updateShiftTemplate(req.params.id, input);
      res.json(shift);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete("/api/shift-templates/:id", async (req, res) => {
    await storage.deleteShiftTemplate(req.params.id);
    res.status(204).send();
  });

  // Teacher Availability
  app.get("/api/teacher-availability", async (req, res) => {
    const filters = {
      locationId: req.query.locationId as string,
      teacherId: req.query.teacherId as string,
      weekday: req.query.weekday ? parseInt(req.query.weekday as string) : undefined
    };
    const availabilities = await storage.getTeacherAvailabilities(filters);
    res.json(availabilities);
  });

  app.post("/api/teacher-availability", async (req, res) => {
    try {
      const { insertTeacherAvailabilitySchema } = await import("@shared/schema");
      const { weekdays, ...rest } = req.body;

      if (!Array.isArray(weekdays)) {
        return res.status(400).json({ message: "weekdays must be an array" });
      }

      const isAtLocation = await storage.checkTeacherAtLocation(rest.teacherId, rest.locationId);
      if (!isAtLocation) {
        return res.status(400).json({ message: "Giáo viên không thuộc cơ sở này." });
      }

      const results = [];
      for (const weekday of weekdays) {
        const data = { ...rest, weekday };
        const validated = insertTeacherAvailabilitySchema.parse(data);

        const isDuplicate = await storage.checkAvailabilityDuplicate(validated);
        if (isDuplicate) {
          continue;
        }

        const created = await storage.createTeacherAvailability(validated);
        results.push(created);
      }

      res.status(201).json(results);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.put("/api/teacher-availability/:id", async (req, res) => {
    try {
      const { insertTeacherAvailabilitySchema } = await import("@shared/schema");
      const input = insertTeacherAvailabilitySchema.partial().parse(req.body);

      delete (input as any).teacherId;
      delete (input as any).locationId;

      const updated = await storage.updateTeacherAvailability(req.params.id, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.delete("/api/teacher-availability/:id", async (req, res) => {
    await storage.deleteTeacherAvailability(req.params.id);
    res.status(204).send();
  });

  // System Settings - Staff Limit
  app.get("/api/system-settings/staff-limit", async (req, res) => {
    try {
      const { systemSettings, staff, users } = await import("@shared/schema");
      const row = await db.select().from(systemSettings).where(eq(systemSettings.key, "staffLimit"));
      const limit = row.length > 0 ? parseInt(row[0].value) : 10;

      const activeStaff = await db
        .select({ id: staff.id })
        .from(staff)
        .innerJoin(users, eq(staff.userId, users.id))
        .where(and(eq(staff.status, "Hoạt động"), eq(users.isActive, true)));

      res.json({ limit, activeStaffCount: activeStaff.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/system-settings/staff-limit", async (req, res) => {
    try {
      const { systemSettings } = await import("@shared/schema");
      const { limit } = z.object({ limit: z.number().int().min(1) }).parse(req.body);
      await db
        .insert(systemSettings)
        .values({ key: "staffLimit", value: String(limit) })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value: String(limit), updatedAt: new Date() } });
      res.json({ limit });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  // My Permissions (current user's effective permissions for all resources)
  app.get("/api/my-permissions", async (req, res) => {
    try {
      if (req.isSuperAdmin) {
        return res.json({ isSuperAdmin: true, isStudent: false, departmentNames: [], permissions: {} });
      }

      if (req.isStudent) {
        return res.json({ isSuperAdmin: false, isStudent: true, departmentNames: [], permissions: {} });
      }

      const roleIds = (req as any).roleIds || [];
      const staffId = req.staffId;

      const allPerms = await storage.getAllPermissionsForRoles(roleIds);
      const permMap: Record<string, { canView: boolean; canViewAll: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }> = {};
      for (const p of allPerms) {
        const existing = permMap[p.resource];
        if (!existing) {
          permMap[p.resource] = { canView: p.canView, canViewAll: p.canViewAll, canCreate: p.canCreate, canEdit: p.canEdit, canDelete: p.canDelete };
        } else {
          permMap[p.resource] = {
            canView: existing.canView || p.canView,
            canViewAll: existing.canViewAll || p.canViewAll,
            canCreate: existing.canCreate || p.canCreate,
            canEdit: existing.canEdit || p.canEdit,
            canDelete: existing.canDelete || p.canDelete,
          };
        }
      }

      let departmentNames: string[] = [];
      if (staffId) {
        const assignments = await db
          .select({ departmentName: departments.name })
          .from(staffAssignments)
          .leftJoin(departments, eq(staffAssignments.departmentId, departments.id))
          .where(eq(staffAssignments.staffId, staffId));
        departmentNames = assignments
          .map(a => a.departmentName)
          .filter((n): n is string => !!n);
      }

      if (!permMap["/tasks#list"]) {
        permMap["/tasks#list"] = { canView: true, canViewAll: false, canCreate: false, canEdit: false, canDelete: false };
      }

      const userId = (req as any).user?.id ?? null;
      const locationIds = req.allowedLocationIds ?? [];

      res.json({ isSuperAdmin: false, isStudent: false, departmentNames, permissions: permMap, staffId: staffId ?? null, userId, locationIds });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Role Permissions
  app.get("/api/role-permissions", async (req, res) => {
    try {
      const { roleId } = z.object({ roleId: z.string().uuid() }).parse(req.query);
      const perms = await storage.getRolePermissions(roleId);
      res.json(perms);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/role-permissions", async (req, res) => {
    try {
      const body = z.object({
        roleId: z.string().uuid(),
        resource: z.string(),
        canView: z.boolean(),
        canViewAll: z.boolean(),
        canCreate: z.boolean(),
        canEdit: z.boolean(),
        canDelete: z.boolean(),
      }).parse(req.body);
      const { roleId, resource, ...permissions } = body;
      const perm = await storage.upsertRolePermission(roleId, resource, permissions);
      res.json(perm);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Attendance Fee Rules ───────────────────────────────────────────────────
  app.get("/api/attendance-fee-rules", async (_req, res) => {
    try {
      const rules = await getAttendanceFeeRules();
      res.json(rules);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/attendance-fee-rules", async (req, res) => {
    try {
      const body = z.object({
        attendanceStatus: z.string().min(1),
        deductsFee: z.boolean(),
      }).parse(req.body);
      const rule = await upsertAttendanceFeeRule(body);
      res.json(rule);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/attendance-fee-rules/:status", async (req, res) => {
    try {
      await deleteAttendanceFeeRule(req.params.status);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Score Categories (Danh mục điểm) ──────────────────────────────────────
  app.get("/api/score-categories", async (_req, res) => {
    try {
      const { scoreCategories } = await import("@shared/schema");
      const rows = await db.select().from(scoreCategories).orderBy(scoreCategories.name);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/score-categories", async (req, res) => {
    try {
      const { scoreCategories, insertScoreCategorySchema } = await import("@shared/schema");
      const input = insertScoreCategorySchema.parse(req.body);
      const [row] = await db.insert(scoreCategories).values(input).returning();
      res.json(row);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/score-categories/:id", async (req, res) => {
    try {
      const { scoreCategories, insertScoreCategorySchema } = await import("@shared/schema");
      const input = insertScoreCategorySchema.parse(req.body);
      const [row] = await db.update(scoreCategories).set(input).where(eq(scoreCategories.id, req.params.id)).returning();
      res.json(row);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/score-categories/:id", async (req, res) => {
    try {
      const { scoreCategories } = await import("@shared/schema");
      await db.delete(scoreCategories).where(eq(scoreCategories.id, req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Score Sheets (Bảng điểm) ──────────────────────────────────────────────
  app.get("/api/score-sheets", async (_req, res) => {
    try {
      const { scoreSheets, scoreSheetItems, scoreCategories } = await import("@shared/schema");
      const sheets = await db.select().from(scoreSheets).orderBy(scoreSheets.name);
      const items = await db
        .select({ item: scoreSheetItems, category: scoreCategories })
        .from(scoreSheetItems)
        .leftJoin(scoreCategories, eq(scoreSheetItems.categoryId, scoreCategories.id))
        .orderBy(scoreSheetItems.order);
      const result = sheets.map((sheet) => ({
        ...sheet,
        items: items
          .filter((i) => i.item.scoreSheetId === sheet.id)
          .map((i) => ({ ...i.item, category: i.category })),
      }));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/score-sheets", async (req, res) => {
    try {
      const { scoreSheets, scoreSheetItems } = await import("@shared/schema");
      const body = z.object({
        name: z.string().min(1),
        items: z.array(z.object({
          categoryId: z.string().uuid(),
          formula: z.string().default(""),
          order: z.number().int().default(0),
        })).default([]),
      }).parse(req.body);
      const [sheet] = await db.insert(scoreSheets).values({ name: body.name }).returning();
      if (body.items.length > 0) {
        await db.insert(scoreSheetItems).values(
          body.items.map((item, idx) => ({ ...item, scoreSheetId: sheet.id, order: item.order ?? idx }))
        );
      }
      res.json(sheet);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/score-sheets/:id", async (req, res) => {
    try {
      const { scoreSheets, scoreSheetItems } = await import("@shared/schema");
      const body = z.object({
        name: z.string().min(1),
        items: z.array(z.object({
          categoryId: z.string().uuid(),
          formula: z.string().default(""),
          order: z.number().int().default(0),
        })).default([]),
      }).parse(req.body);
      const [sheet] = await db.update(scoreSheets).set({ name: body.name }).where(eq(scoreSheets.id, req.params.id)).returning();
      await db.delete(scoreSheetItems).where(eq(scoreSheetItems.scoreSheetId, req.params.id));
      if (body.items.length > 0) {
        await db.insert(scoreSheetItems).values(
          body.items.map((item, idx) => ({ ...item, scoreSheetId: req.params.id, order: item.order ?? idx }))
        );
      }
      res.json(sheet);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json(err.errors);
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/score-sheets/:id", async (req, res) => {
    try {
      const { scoreSheets } = await import("@shared/schema");
      await db.delete(scoreSheets).where(eq(scoreSheets.id, req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
