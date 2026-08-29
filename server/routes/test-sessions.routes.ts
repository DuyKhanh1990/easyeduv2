import type { Express } from "express";
import { db, pool } from "../db";
import { testSessions, staff, locations, exams, students, courseProgramContents } from "@shared/schema";
import { eq, desc, asc } from "drizzle-orm";

export function registerTestSessionRoutes(app: Express) {
  // GET all test sessions
  app.get("/api/test-sessions", async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(testSessions)
        .orderBy(desc(testSessions.testDate), asc(testSessions.timeStart));

      const locationRows = await db.select({ id: locations.id, name: locations.name }).from(locations);
      const locationMap = Object.fromEntries(locationRows.map(l => [l.id, l.name]));

      const staffRows = await db.select({ id: staff.id, fullName: staff.fullName, code: staff.code }).from(staff);
      const staffMap = Object.fromEntries(staffRows.map(s => [s.id, s]));

      const examRows = await db.select({ id: exams.id, name: exams.name, code: exams.code }).from(exams);
      const examMap = Object.fromEntries(examRows.map(e => [e.id, e]));

      const contentRows = await db.select({ id: courseProgramContents.id, title: courseProgramContents.title, type: courseProgramContents.type }).from(courseProgramContents);
      const contentMap = Object.fromEntries(contentRows.map(c => [c.id, c]));

      const enriched = rows.map(r => ({
        ...r,
        locationName: r.locationId ? locationMap[r.locationId] ?? null : null,
        teachers: (r.teacherIds ?? []).map(id => staffMap[id]).filter(Boolean),
        examsData: (r.examIds ?? []).map(id => examMap[id]).filter(Boolean),
        assignmentsData: (r.assignmentIds ?? []).map(id => contentMap[id]).filter(Boolean),
      }));

      return res.json(enriched);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET single test session with enriched student data
  app.get("/api/test-sessions/:id", async (req, res) => {
    try {
      const [row] = await db.select().from(testSessions).where(eq(testSessions.id, req.params.id));
      if (!row) return res.status(404).json({ error: "Not found" });

      const locationRows = await db.select({ id: locations.id, name: locations.name }).from(locations);
      const locationMap = Object.fromEntries(locationRows.map(l => [l.id, l.name]));

      const staffRows = await db.select({ id: staff.id, fullName: staff.fullName, code: staff.code }).from(staff);
      const staffMap = Object.fromEntries(staffRows.map(s => [s.id, s]));

      const examRows = await db.select({ id: exams.id, name: exams.name, code: exams.code }).from(exams);
      const examMap = Object.fromEntries(examRows.map(e => [e.id, e]));

      const contentRows = await db.select({ id: courseProgramContents.id, title: courseProgramContents.title, type: courseProgramContents.type }).from(courseProgramContents);
      const contentMap = Object.fromEntries(contentRows.map(c => [c.id, c]));

      // Enrich student data — use pool directly for correct UUID array handling
      let studentsData: { id: string; fullName: string; code: string }[] = [];
      if (row.studentIds && row.studentIds.length > 0) {
        const result = await pool.query<{ id: string; fullName: string; code: string }>(
          `SELECT id, full_name as "fullName", code FROM students WHERE id = ANY($1::uuid[])`,
          [row.studentIds]
        );
        studentsData = result.rows;
      }

      return res.json({
        ...row,
        locationName: row.locationId ? locationMap[row.locationId] ?? null : null,
        teachers: (row.teacherIds ?? []).map(id => staffMap[id]).filter(Boolean),
        examsData: (row.examIds ?? []).map(id => examMap[id]).filter(Boolean),
        assignmentsData: (row.assignmentIds ?? []).map(id => contentMap[id]).filter(Boolean),
        studentsData,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST create
  app.post("/api/test-sessions", async (req, res) => {
    try {
      const body = req.body;
      const rows = await db
        .insert(testSessions)
        .values({
          title: body.title,
          locationId: body.locationId || null,
          testDate: body.testDate,
          timeStart: body.timeStart || "",
          timeEnd: body.timeEnd || "",
          teacherIds: body.teacherIds || [],
          examIds: body.examIds || [],
          assignmentIds: body.assignmentIds || [],
          studentIds: body.studentIds || [],
          studentCount: body.studentCount || 0,
          studentResults: body.studentResults || {},
          contentSettings: body.contentSettings || {},
          notes: body.notes || null,
        })
        .returning();
      return res.json(rows[0] ?? { success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // PUT update
  app.put("/api/test-sessions/:id", async (req, res) => {
    try {
      const body = req.body;
      const [updated] = await db
        .update(testSessions)
        .set({
          title: body.title,
          locationId: body.locationId || null,
          testDate: body.testDate,
          timeStart: body.timeStart || "",
          timeEnd: body.timeEnd || "",
          teacherIds: body.teacherIds || [],
          examIds: body.examIds || [],
          assignmentIds: body.assignmentIds || [],
          studentIds: body.studentIds || [],
          studentCount: body.studentCount ?? 0,
          studentResults: body.studentResults ?? {},
          contentSettings: body.contentSettings ?? {},
          notes: body.notes ?? null,
          updatedAt: new Date(),
        })
        .where(eq(testSessions.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      return res.json(updated);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // PATCH student results only
  app.patch("/api/test-sessions/:id/results", async (req, res) => {
    try {
      const { studentResults } = req.body;
      const [updated] = await db
        .update(testSessions)
        .set({ studentResults, updatedAt: new Date() })
        .where(eq(testSessions.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      return res.json(updated);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // DELETE
  app.delete("/api/test-sessions/:id", async (req, res) => {
    try {
      await db.delete(testSessions).where(eq(testSessions.id, req.params.id));
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
}
