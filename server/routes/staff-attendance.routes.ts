import type { Express } from "express";
import { db } from "../db";
import { staffAttendances, staffAssignments } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";

export function registerStaffAttendanceRoutes(app: Express): void {
  // GET /api/staff-attendances?staffId=&month=&year=
  app.get("/api/staff-attendances", async (req, res) => {
    try {
      const { staffId, month, year } = req.query as Record<string, string>;
      if (!month || !year) return res.json([]);

      const m = String(month).padStart(2, "0");
      const y = String(year);
      const dateFrom = `${y}-${m}-01`;
      const daysInMonth = new Date(Number(y), Number(month), 0).getDate();
      const dateTo = `${y}-${m}-${String(daysInMonth).padStart(2, "0")}`;

      const isSuperAdmin: boolean = (req as any).isSuperAdmin ?? false;
      const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];

      const { gte, lte } = await import("drizzle-orm");

      let rows: any[];
      if (staffId) {
        // Single-staff query: already scoped to a specific staffId chosen from the
        // (location-filtered) staff list on the frontend; no extra join needed.
        rows = await db.select().from(staffAttendances)
          .where(and(
            eq(staffAttendances.staffId, staffId),
            gte(staffAttendances.workDate, dateFrom),
            lte(staffAttendances.workDate, dateTo),
          ));
      } else if (!isSuperAdmin && allowedLocationIds.length > 0) {
        // Location isolation: only return attendance rows for staff assigned to
        // the caller's locations (staffAttendances has no direct locationId).
        const allowedStaff = db
          .selectDistinct({ staffId: staffAssignments.staffId })
          .from(staffAssignments)
          .where(inArray(staffAssignments.locationId, allowedLocationIds));

        rows = await db.select().from(staffAttendances)
          .where(and(
            inArray(staffAttendances.staffId, allowedStaff),
            gte(staffAttendances.workDate, dateFrom),
            lte(staffAttendances.workDate, dateTo),
          ));
      } else {
        // superAdmin — return everything in the date range
        rows = await db.select().from(staffAttendances)
          .where(and(
            gte(staffAttendances.workDate, dateFrom),
            lte(staffAttendances.workDate, dateTo),
          ));
      }

      res.json(rows);
    } catch (err: any) {
      console.error("[StaffAttendance] GET error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/staff-attendances — upsert one record
  app.post("/api/staff-attendances", async (req, res) => {
    try {
      const { staffId, workDate, shiftTemplateId, timeIn, timeOut, workedHours, tongCong, note } = req.body;
      if (!staffId || !workDate) return res.status(400).json({ message: "staffId và workDate là bắt buộc" });

      const userId = (req.user as any)?.id ?? null;

      const existingWhere = shiftTemplateId
        ? and(eq(staffAttendances.staffId, staffId), eq(staffAttendances.workDate, workDate), eq(staffAttendances.shiftTemplateId, shiftTemplateId))
        : and(eq(staffAttendances.staffId, staffId), eq(staffAttendances.workDate, workDate));
      const existing = await db.select({ id: staffAttendances.id })
        .from(staffAttendances)
        .where(existingWhere)
        .limit(1);

      if (existing.length > 0) {
        const [updated] = await db.update(staffAttendances)
          .set({
            shiftTemplateId: shiftTemplateId ?? null,
            timeIn: timeIn ?? null,
            timeOut: timeOut ?? null,
            workedHours: workedHours != null ? String(workedHours) : "0",
            tongCong: tongCong != null ? String(tongCong) : "0",
            note: note ?? null,
            updatedAt: new Date(),
          })
          .where(eq(staffAttendances.id, existing[0].id))
          .returning();
        return res.json(updated);
      } else {
        const [inserted] = await db.insert(staffAttendances).values({
          staffId,
          workDate,
          shiftTemplateId: shiftTemplateId ?? null,
          timeIn: timeIn ?? null,
          timeOut: timeOut ?? null,
          workedHours: workedHours != null ? String(workedHours) : "0",
          tongCong: tongCong != null ? String(tongCong) : "0",
          note: note ?? null,
          createdBy: userId,
        }).returning();
        return res.json(inserted);
      }
    } catch (err: any) {
      console.error("[StaffAttendance] POST error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // DELETE /api/staff-attendances/:id
  app.delete("/api/staff-attendances/:id", async (req, res) => {
    try {
      await db.delete(staffAttendances).where(eq(staffAttendances.id, req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/staff-attendances/bulk — upsert nhiều bản ghi từ file import
  app.post("/api/staff-attendances/bulk", async (req, res) => {
    try {
      const { records } = req.body;
      if (!Array.isArray(records) || records.length === 0)
        return res.status(400).json({ message: "records phải là mảng không rỗng" });

      const { shiftTemplates } = await import("@shared/schema");
      const { eq: eqDrz } = await import("drizzle-orm");

      const userId = (req.user as any)?.id ?? null;
      let success = 0;
      const errors: string[] = [];

      function parseMin(t: string): number {
        if (!t) return 0;
        const [h, m] = t.split(":").map(Number);
        return (h || 0) * 60 + (m || 0);
      }

      function clampTime(t: string, minT: string | null | undefined, maxT: string | null | undefined): string {
        if (!t) return t;
        const min5 = minT?.slice(0, 5);
        const max5 = maxT?.slice(0, 5);
        let clamped = t;
        if (min5 && clamped < min5) clamped = min5;
        if (max5 && clamped > max5) clamped = max5;
        return clamped;
      }

      for (const rec of records) {
        try {
          const { staffId, workDate, shiftTemplateId, timeIn, timeOut } = rec;
          if (!staffId || !workDate) continue;

          let workedHours = 0;
          let tongCong = 0;

          // Luôn fetch template nếu có shiftTemplateId (cần để clamp ngay cả khi timeIn/timeOut rỗng)
          const tpls = shiftTemplateId
            ? await db.select().from(shiftTemplates).where(eqDrz(shiftTemplates.id, shiftTemplateId)).limit(1)
            : [];
          const tpl = tpls[0] ?? null;

          // Clamp timeIn/timeOut về đúng khoảng ca (nếu nhập vượt min/max → kéo về đúng giới hạn)
          const clampedTimeIn  = tpl ? clampTime(timeIn,  tpl.startTime, tpl.endTime) : timeIn;
          const clampedTimeOut = tpl ? clampTime(timeOut, tpl.startTime, tpl.endTime) : timeOut;

          if (clampedTimeIn && clampedTimeOut) {
            const lunchBreak = tpl ? Number(tpl.lunchBreakMinutes || 0) : 0;
            const rawMins    = Math.max(0, parseMin(clampedTimeOut) - parseMin(clampedTimeIn));
            const lunchDeduct = rawMins > lunchBreak ? lunchBreak : 0;
            const actualMins = rawMins - lunchDeduct;
            workedHours = actualMins / 60;

            if (tpl) {
              let shiftHours = 0;
              if (tpl.totalHours != null) shiftHours = Number(tpl.totalHours);
              else if (tpl.startTime && tpl.endTime) {
                const sm = Math.max(0, parseMin(tpl.endTime) - parseMin(tpl.startTime) - lunchBreak);
                shiftHours = sm / 60;
              }
              const soCong = tpl.workUnits != null ? Number(tpl.workUnits) : 1;
              tongCong = shiftHours > 0 ? (workedHours * soCong) / shiftHours : 0;
            }
          }

          const bulkWhere = shiftTemplateId
            ? and(eq(staffAttendances.staffId, staffId), eq(staffAttendances.workDate, workDate), eq(staffAttendances.shiftTemplateId, shiftTemplateId))
            : and(eq(staffAttendances.staffId, staffId), eq(staffAttendances.workDate, workDate));
          const existing = await db
            .select({ id: staffAttendances.id })
            .from(staffAttendances)
            .where(bulkWhere)
            .limit(1);

          if (existing.length > 0) {
            await db
              .update(staffAttendances)
              .set({
                shiftTemplateId: shiftTemplateId || null,
                timeIn: clampedTimeIn || null,
                timeOut: clampedTimeOut || null,
                workedHours: String(workedHours),
                tongCong: String(tongCong),
                updatedAt: new Date(),
              })
              .where(eq(staffAttendances.id, existing[0].id));
          } else {
            await db.insert(staffAttendances).values({
              staffId,
              workDate,
              shiftTemplateId: shiftTemplateId || null,
              timeIn: clampedTimeIn || null,
              timeOut: clampedTimeOut || null,
              workedHours: String(workedHours),
              tongCong: String(tongCong),
              createdBy: userId,
            });
          }
          success++;
        } catch (err: any) {
          errors.push(`${rec.staffId ?? "?"}/${rec.workDate ?? "?"}: ${err.message}`);
        }
      }

      res.json({ success, errors });
    } catch (err: any) {
      console.error("[StaffAttendance] BULK error:", err);
      res.status(500).json({ message: err.message });
    }
  });
}
