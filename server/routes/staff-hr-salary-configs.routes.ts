import type { Express } from "express";
import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import {
  staffHrSalaryConfigs,
  staff,
  locations,
  staffAssignments,
  roles,
} from "@shared/schema";

function requireAuth(req: any, res: any): boolean {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }
  return true;
}

/** Validate a UUID string to prevent injection into raw SQL interpolations. */
function isValidUUID(v: string | undefined): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v ?? "");
}

export function registerStaffHrSalaryConfigRoutes(app: Express): void {

  // ── Get staff's assigned locations and roles (paired per assignment) ─────
  app.get("/api/staff-hr-salary-configs/staff-assignments/:staffId", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const { staffId } = req.params;
      if (!isValidUUID(staffId)) return res.status(400).json({ message: "Invalid staffId" });

      // Return actual assignment pairs (location + role from the same row)
      const rows = await db.execute(sql`
        SELECT
          l.id   AS "locationId",
          l.name AS "locationName",
          r.id   AS "roleId",
          r.name AS "roleName"
        FROM staff_assignments sa
        LEFT JOIN locations l ON l.id = sa.location_id
        LEFT JOIN roles     r ON r.id = sa.role_id
        WHERE sa.staff_id = ${staffId}::uuid
        ORDER BY l.name, r.name
      `);

      // Also return deduplicated lists for dropdown population
      const locationMap = new Map<string, { id: string; name: string }>();
      const roleMap = new Map<string, { id: string; name: string }>();
      const pairs: { locationId: string; locationName: string; roleName: string }[] = [];

      for (const row of rows.rows as any[]) {
        if (row.locationId) locationMap.set(row.locationId, { id: row.locationId, name: row.locationName });
        if (row.roleId) roleMap.set(row.roleId, { id: row.roleId, name: row.roleName });
        pairs.push({
          locationId: row.locationId ?? "",
          locationName: row.locationName ?? "",
          roleName: row.roleName ?? "",
        });
      }

      res.json({
        pairs,
        locations: Array.from(locationMap.values()),
        roles: Array.from(roleMap.values()),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── List all active staff with their HR salary config count ──────────────
  app.get("/api/staff-hr-salary-configs/staff-list", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      // Main staff list with config count
      const staffRows = await db.execute(sql`
        SELECT
          s.id,
          s.code,
          s.full_name AS "fullName",
          s.status,
          COUNT(c.id)::int AS "configCount"
        FROM staff s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN staff_hr_salary_configs c ON c.staff_id = s.id
        WHERE s.status = 'Hoạt động'
          AND u.username != 'admin'
        GROUP BY s.id, s.code, s.full_name, s.status
        ORDER BY s.code ASC
      `);

      // Fetch assignment pairs (locationId+locationName+roleName) for all active non-admin staff
      let assignmentMap: Map<string, { locationId: string; locationName: string; roleName: string }[]> = new Map();

      if ((staffRows.rows as any[]).length > 0) {
        const assignRows = await db.execute(sql`
          SELECT
            sa.staff_id   AS "staffId",
            l.id          AS "locationId",
            l.name        AS "locationName",
            r.name        AS "roleName"
          FROM staff_assignments sa
          JOIN staff s ON s.id = sa.staff_id
          JOIN users u ON u.id = s.user_id
          LEFT JOIN locations l ON l.id = sa.location_id
          LEFT JOIN roles     r ON r.id = sa.role_id
          WHERE s.status = 'Hoạt động'
            AND u.username != 'admin'
          ORDER BY l.name, r.name
        `);
        for (const row of assignRows.rows as any[]) {
          if (!assignmentMap.has(row.staffId)) assignmentMap.set(row.staffId, []);
          assignmentMap.get(row.staffId)!.push({
            locationId: row.locationId ?? "",
            locationName: row.locationName ?? "",
            roleName: row.roleName ?? "",
          });
        }
      }

      const result = (staffRows.rows as any[]).map((r: any) => ({
        ...r,
        assignmentPairs: assignmentMap.get(r.id) ?? [],
      }));

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── List configs for a staff member ─────────────────────────────────────
  app.get("/api/staff-hr-salary-configs", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const staffId = req.query.staffId as string | undefined;
      if (!staffId) return res.status(400).json({ message: "staffId is required" });
      if (!isValidUUID(staffId)) return res.status(400).json({ message: "staffId invalide" });

      const rows = await db.execute(sql`
        SELECT
          c.*,
          l.name AS "locationName"
        FROM staff_hr_salary_configs c
        LEFT JOIN locations l ON l.id = c.location_id
        WHERE c.staff_id = ${staffId}::uuid
        ORDER BY c.created_at ASC
      `);
      res.json(rows.rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Batch create configs (atomic, single transaction) ────────────────────
  app.post("/api/staff-hr-salary-configs/batch", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const { staffId, rows, shared } = req.body as {
        staffId: string;
        rows: { locationId?: string; roleName?: string; luongCB?: number }[];
        shared: {
          phuCap: any[];
          bhxhBase: number; bhxhPercent: number;
          bhytBase: number; bhytPercent: number;
          thueTNCNMode: string; thueTNCNAmount: number;
        };
      };
      if (!staffId) return res.status(400).json({ message: "staffId is required" });
      if (!isValidUUID(staffId)) return res.status(400).json({ message: "Invalid staffId" });
      if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ message: "rows must be a non-empty array" });
      for (const row of rows) {
        if (row.locationId && !isValidUUID(row.locationId)) return res.status(400).json({ message: "Invalid locationId in rows" });
      }

      const created = await db.transaction(async tx => {
        const results = [];
        for (const row of rows) {
          const [c] = await tx.insert(staffHrSalaryConfigs).values({
            staffId,
            locationId: row.locationId || null,
            roleName: row.roleName || null,
            luongCB: String(row.luongCB ?? 0),
            phuCap: shared.phuCap ?? [],
            bhxhBase: String(shared.bhxhBase ?? 0),
            bhxhPercent: String(shared.bhxhPercent ?? 8),
            bhytBase: String(shared.bhytBase ?? 0),
            bhytPercent: String(shared.bhytPercent ?? 1.5),
            bhtnPercent: String(shared.bhtnPercent ?? 1),
            thueTNCNMode: (shared.thueTNCNMode ?? "none") as "none" | "fixed",
            thueTNCNAmount: String(shared.thueTNCNAmount ?? 0),
          }).returning();
          results.push(c);
        }
        return results;
      });
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Create config ────────────────────────────────────────────────────────
  app.post("/api/staff-hr-salary-configs", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const {
        staffId, locationId, roleName,
        luongCB, phuCap,
        bhxhBase, bhxhPercent,
        bhytBase, bhytPercent,
        bhtnPercent,
        thueTNCNMode, thueTNCNAmount,
      } = req.body;

      if (!staffId) return res.status(400).json({ message: "staffId is required" });
      if (!isValidUUID(staffId)) return res.status(400).json({ message: "Invalid staffId" });
      if (locationId && locationId !== null && !isValidUUID(locationId)) {
        return res.status(400).json({ message: "Invalid locationId" });
      }

      const [created] = await db
        .insert(staffHrSalaryConfigs)
        .values({
          staffId,
          locationId: locationId || null,
          roleName: roleName || null,
          luongCB: String(luongCB ?? 0),
          phuCap: phuCap ?? [],
          bhxhBase: String(bhxhBase ?? 0),
          bhxhPercent: String(bhxhPercent ?? 8),
          bhytBase: String(bhytBase ?? 0),
          bhytPercent: String(bhytPercent ?? 1.5),
          bhtnPercent: String(bhtnPercent ?? 1),
          thueTNCNMode: thueTNCNMode ?? "none",
          thueTNCNAmount: String(thueTNCNAmount ?? 0),
        })
        .returning();
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Update config ────────────────────────────────────────────────────────
  app.patch("/api/staff-hr-salary-configs/:id", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      if (!isValidUUID(req.params.id)) return res.status(400).json({ message: "Invalid config id" });
      const {
        locationId, roleName,
        luongCB, phuCap,
        bhxhBase, bhxhPercent,
        bhytBase, bhytPercent,
        thueTNCNMode, thueTNCNAmount,
      } = req.body;

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (locationId !== undefined) updates.locationId = locationId || null;
      if (roleName !== undefined)   updates.roleName = roleName;
      if (luongCB !== undefined)    updates.luongCB = String(luongCB);
      if (phuCap !== undefined)     updates.phuCap = phuCap;
      if (bhxhBase !== undefined)   updates.bhxhBase = String(bhxhBase);
      if (bhxhPercent !== undefined) updates.bhxhPercent = String(bhxhPercent);
      if (bhytBase !== undefined)   updates.bhytBase = String(bhytBase);
      if (bhytPercent !== undefined) updates.bhytPercent = String(bhytPercent);
      if ((req.body as any).bhtnPercent !== undefined) updates.bhtnPercent = String((req.body as any).bhtnPercent);
      if (thueTNCNMode !== undefined) updates.thueTNCNMode = thueTNCNMode;
      if (thueTNCNAmount !== undefined) updates.thueTNCNAmount = String(thueTNCNAmount);

      const [updated] = await db
        .update(staffHrSalaryConfigs)
        .set(updates)
        .where(eq(staffHrSalaryConfigs.id, req.params.id))
        .returning();

      if (!updated) return res.status(404).json({ message: "Không tìm thấy cấu hình" });

      // Enrich with location name
      const row = await db.execute(sql`
        SELECT c.*, l.name AS "locationName"
        FROM staff_hr_salary_configs c
        LEFT JOIN locations l ON l.id = c.location_id
        WHERE c.id = ${req.params.id}::uuid
      `);
      res.json(row.rows[0] ?? updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Delete config ────────────────────────────────────────────────────────
  app.delete("/api/staff-hr-salary-configs/:id", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      if (!isValidUUID(req.params.id)) return res.status(400).json({ message: "Invalid config id" });
      await db
        .delete(staffHrSalaryConfigs)
        .where(eq(staffHrSalaryConfigs.id, req.params.id));
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
