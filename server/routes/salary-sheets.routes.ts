import type { Express } from "express";
import { db } from "../db";
import { eq, desc, sql, and, inArray } from "drizzle-orm";
import {
  salarySheets,
  salarySheetEmployees,
  salaryDefaultConfigs,
  salaryAllowanceTypes,
  locations,
  staff,
  staffAssignments,
  roles,
  departments,
  users,
  teacherSalaryPackages,
  staffSalaryConfigs,
  staffHrSalaryConfigs,
  shiftAssignments,
  shiftTemplates,
  staffRewards,
  staffAdvances,
} from "@shared/schema";
import {
  getTeacherSalaryDetailRows,
  getTeacherSalaryRowPackages,
  getTeacherSalarySessionPackages,
} from "../storage/teacher-salary.storage";

// ─── Salary calculation helpers (mirrors client-side logic) ──────────────────
function findRangeSalary(value: number, ranges: any[]): number {
  if (!ranges || ranges.length === 0) return 0;
  const match = ranges.find((r: any) => value >= r.from && value <= r.to);
  return match ? Number(match.price) : 0;
}

function calcSessionSalary(session: any, pkg: any): number | null {
  const coeff = session.attendanceCoefficient;
  const hasAttendance = coeff !== null && coeff !== undefined;
  if (!hasAttendance && !session.isEligible) return null;
  if (hasAttendance && coeff === 0) return 0;
  const ranges = pkg.ranges as any[] | null;
  const multiplier = hasAttendance ? coeff : 1;
  switch (pkg.type) {
    case "theo-gio":
      return session.durationHours * Number(pkg.unitPrice || 0) * multiplier;
    case "theo-buoi":
      return Number(pkg.unitPrice || 0) * multiplier;
    case "theo-so-hv": {
      const base = ranges && ranges.length > 0
        ? session.attendedCount * findRangeSalary(session.attendedCount, ranges)
        : session.attendedCount * Number(pkg.unitPrice || 0);
      return base * multiplier;
    }
    case "tong-so-gio":
    case "tong-so-buoi":
      return null;
    default:
      return null;
  }
}

function calcTotalSalary(
  row: any,
  defaultPkg: any,
  sessionPkgMap: Record<string, string>,
  pkgsMap: Record<string, any>
): number {
  const ranges = defaultPkg.ranges as any[] | null;
  switch (defaultPkg.type) {
    case "theo-gio":
    case "theo-buoi":
    case "theo-so-hv":
      return row.sessions.reduce((sum: number, s: any) => {
        const overrideId = sessionPkgMap[`${s.sessionId}::${row.teacherId}`];
        const pkg = overrideId && pkgsMap[overrideId] ? pkgsMap[overrideId] : defaultPkg;
        return sum + (calcSessionSalary(s, pkg) ?? 0);
      }, 0);
    case "tong-so-gio": {
      const totalHours = row.sessions.reduce((sum: number, s: any) => {
        const coeff = s.attendanceCoefficient;
        if (coeff !== null && coeff !== undefined) return sum + s.durationHours * coeff;
        return s.isEligible ? sum + s.durationHours : sum;
      }, 0);
      return findRangeSalary(totalHours, ranges ?? []);
    }
    case "tong-so-buoi": {
      const totalBuoi = row.sessions.reduce((sum: number, s: any) => {
        const coeff = s.attendanceCoefficient;
        if (coeff !== null && coeff !== undefined) return coeff > 0 ? sum + 1 : sum;
        return s.isEligible ? sum + 1 : sum;
      }, 0);
      return findRangeSalary(totalBuoi, ranges ?? []);
    }
    default:
      return 0;
  }
}

function requireAuth(req: any, res: any): boolean {
  if (!req.user) { res.status(401).json({ message: "Unauthorized" }); return false; }
  return true;
}

async function genCode(): Promise<string> {
  const rows = await db
    .select({ code: salarySheets.code })
    .from(salarySheets)
    .orderBy(desc(salarySheets.createdAt))
    .limit(1);
  if (rows.length === 0) return "BL00001";
  const last = rows[0].code;
  const num = parseInt(last.replace(/[^0-9]/g, ""), 10);
  return "BL" + String((isNaN(num) ? 0 : num) + 1).padStart(5, "0");
}

export function registerSalarySheetRoutes(app: Express): void {

  // ── List ─────────────────────────────────────────────────────────────────
  app.get("/api/salary-sheets", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;

      const isSuperAdmin: boolean = (req as any).isSuperAdmin ?? false;
      const allowedLocationIds: string[] = (req as any).allowedLocationIds ?? [];

      // Location isolation: restrict to sheets whose location falls within the
      // caller's assigned locations. SuperAdmin sees all sheets.
      const locationFilter =
        !isSuperAdmin && allowedLocationIds.length > 0
          ? inArray(salarySheets.locationId, allowedLocationIds)
          : undefined;

      const rows = await db
        .select({
          id: salarySheets.id,
          code: salarySheets.code,
          locationId: salarySheets.locationId,
          locationName: locations.name,
          fromDate: salarySheets.fromDate,
          toDate: salarySheets.toDate,
          note: salarySheets.note,
          status: salarySheets.status,
          createdAt: salarySheets.createdAt,
        })
        .from(salarySheets)
        .leftJoin(locations, eq(salarySheets.locationId, locations.id))
        .where(locationFilter)
        .orderBy(desc(salarySheets.createdAt));

      // Attach employee counts + totals
      const ids = rows.map(r => r.id);
      let empStats: Record<string, { total: number; daChi: number; thucNhan: string }> = {};

      if (ids.length > 0) {
        const empRows = await db
          .select({
            sheetId: salarySheetEmployees.sheetId,
            daChi: salarySheetEmployees.daChi,
            thucNhan: salarySheetEmployees.thucNhan,
          })
          .from(salarySheetEmployees)
          .where(sql`${salarySheetEmployees.sheetId} = ANY(${sql.raw(`ARRAY[${ids.map(i => `'${i}'`).join(",")}]::uuid[]`)})`)
          ;

        for (const e of empRows) {
          if (!empStats[e.sheetId]) empStats[e.sheetId] = { total: 0, daChi: 0, thucNhan: "0" };
          empStats[e.sheetId].total++;
          if (e.daChi) empStats[e.sheetId].daChi++;
          empStats[e.sheetId].thucNhan = String(
            parseFloat(empStats[e.sheetId].thucNhan) + parseFloat(String(e.thucNhan ?? "0"))
          );
        }
      }

      res.json(rows.map(r => ({
        ...r,
        totalStaff: empStats[r.id]?.total ?? 0,
        totalDaChi: empStats[r.id]?.daChi ?? 0,
        totalThucNhan: parseFloat(empStats[r.id]?.thucNhan ?? "0"),
      })));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Create ────────────────────────────────────────────────────────────────
  app.post("/api/salary-sheets", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const { locationId, fromDate, toDate, note } = req.body;
      if (!locationId || !fromDate || !toDate) {
        return res.status(400).json({ message: "locationId, fromDate, toDate required" });
      }
      const code = await genCode();
      const [created] = await db
        .insert(salarySheets)
        .values({
          code,
          locationId,
          fromDate,
          toDate,
          note: note ?? null,
          status: "draft",
          createdBy: (req.user as any)?.id ?? null,
        })
        .returning();

      const loc = await db.select({ name: locations.name }).from(locations).where(eq(locations.id, locationId)).limit(1);
      res.status(201).json({ ...created, locationName: loc[0]?.name ?? "", totalStaff: 0, totalDaChi: 0, totalThucNhan: 0 });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Delete ────────────────────────────────────────────────────────────────
  app.delete("/api/salary-sheets/:id", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const sheet = await db.select().from(salarySheets).where(eq(salarySheets.id, req.params.id)).limit(1);
      if (!sheet.length) return res.status(404).json({ message: "Not found" });
      if (sheet[0].status !== "draft") return res.status(400).json({ message: "Chỉ xoá được bảng lương ở trạng thái Nháp" });
      await db.delete(salarySheets).where(eq(salarySheets.id, req.params.id));
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Update status ─────────────────────────────────────────────────────────
  app.patch("/api/salary-sheets/:id/status", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const { status } = req.body;
      if (!["draft", "locked"].includes(status)) return res.status(400).json({ message: "Invalid status" });
      const [updated] = await db
        .update(salarySheets)
        .set({ status, updatedAt: new Date() })
        .where(eq(salarySheets.id, req.params.id))
        .returning();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Get employees ─────────────────────────────────────────────────────────
  app.get("/api/salary-sheets/:id/employees", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const rows = await db
        .select()
        .from(salarySheetEmployees)
        .where(eq(salarySheetEmployees.sheetId, req.params.id))
        .orderBy(salarySheetEmployees.createdAt);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Generate employees from staff at location ─────────────────────────────
  app.post("/api/salary-sheets/:id/employees/generate", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const sheetRows = await db
        .select({
          locationId: salarySheets.locationId,
          fromDate: salarySheets.fromDate,
          toDate: salarySheets.toDate,
          status: salarySheets.status,
        })
        .from(salarySheets)
        .where(eq(salarySheets.id, req.params.id))
        .limit(1);
      if (!sheetRows.length) return res.status(404).json({ message: "Sheet not found" });
      const { locationId, fromDate, toDate, status } = sheetRows[0];
      if (status === "locked") return res.status(400).json({ message: "Không thể chỉnh sửa bảng lương đã chốt" });

      // Get all active staff at the location
      const assignments = await db
        .select({
          staffId: staffAssignments.staffId,
          staffCode: staff.code,
          staffName: staff.fullName,
          roleName: roles.name,
        })
        .from(staffAssignments)
        .innerJoin(staff, eq(staffAssignments.staffId, staff.id))
        .leftJoin(roles, eq(staffAssignments.roleId, roles.id))
        .where(and(
          eq(staffAssignments.locationId, locationId),
          eq(staff.status, "Hoạt động")
        ));

      // Get location name
      const loc = await db
        .select({ name: locations.name })
        .from(locations)
        .where(eq(locations.id, locationId))
        .limit(1);
      const locationName = loc[0]?.name ?? "";

      // Deduplicate by staffId
      const seen = new Set<string>();
      const unique = assignments.filter(a => {
        if (seen.has(a.staffId)) return false;
        seen.add(a.staffId);
        return true;
      });

      // ── 1. Số công: Tổng công từ bảng phân ca (/shifts?tab=board) ─────────
      //    = sum of shift work_units per staff per day in the date range
      const [shiftAssignmentsRes, shiftTemplatesRes, staffMappingRes] = await Promise.all([
        db.execute(sql`
          SELECT id, target_type, target_id, by_weekday, shift_template_id,
                 weekday_schedule, effective_from, effective_to
          FROM shift_assignments
          WHERE location_id = ${locationId}::uuid
            AND status = 'active'
        `),
        db.execute(sql`
          SELECT id, work_units, start_time, end_time, lunch_break_minutes
          FROM shift_templates
          WHERE location_id = ${locationId}::uuid
        `),
        db.execute(sql`
          SELECT staff_id, department_id, role_id
          FROM staff_assignments
          WHERE location_id = ${locationId}::uuid
        `),
      ]);

      const templateMap: Record<string, any> = {};
      for (const t of shiftTemplatesRes.rows as any[]) {
        templateMap[t.id] = t;
      }

      // Build staff → dept/role mapping for matching shift assignments
      const staffDeptRoleMap: Record<string, { deptIds: Set<string>; roleIds: Set<string> }> = {};
      for (const r of staffMappingRes.rows as any[]) {
        if (!staffDeptRoleMap[r.staff_id]) {
          staffDeptRoleMap[r.staff_id] = { deptIds: new Set(), roleIds: new Set() };
        }
        if (r.department_id) staffDeptRoleMap[r.staff_id].deptIds.add(r.department_id);
        if (r.role_id) staffDeptRoleMap[r.staff_id].roleIds.add(r.role_id);
      }

      // Pre-parse weekday_schedule once per assignment (avoid repeated JSON.parse in inner loop)
      type ParsedAssignment = {
        id: string;
        target_type: string;
        target_id: string;
        by_weekday: boolean;
        shift_template_id: string | null;
        effective_from: string | null;
        effective_to: string | null;
        parsedSchedule: Record<string, string[]>; // dowKey → shiftTemplateId[]
      };
      const parsedAssignments: ParsedAssignment[] = (shiftAssignmentsRes.rows as any[]).map(a => ({
        ...a,
        parsedSchedule: a.by_weekday
          ? (typeof a.weekday_schedule === "string"
              ? JSON.parse(a.weekday_schedule)
              : (a.weekday_schedule ?? {}))
          : {},
      }));

      function staffMatchesAssignment(staffId: string, a: ParsedAssignment): boolean {
        if (a.target_type === "staff") return staffId === a.target_id;
        const mapping = staffDeptRoleMap[staffId];
        if (!mapping) return false;
        if (a.target_type === "department") return mapping.deptIds.has(a.target_id);
        if (a.target_type === "role") return mapping.roleIds.has(a.target_id);
        return false;
      }

      function getShiftWorkUnits(tpl: any): number {
        if (!tpl) return 0;
        return Number(tpl.work_units) || 0;
      }

      // Local-date formatter to match frontend's format(date, "yyyy-MM-dd") behavior
      // Using new Date(dateStr + "T00:00:00") ensures local midnight — avoids UTC-offset day shift
      function toLocalYMD(d: Date): string {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      }

      // Enumerate every day in the salary period (local dates)
      const periodDays: { ymd: string; dow: string }[] = [];
      const periodStart = new Date(fromDate + "T00:00:00");
      const periodEnd = new Date(toDate + "T00:00:00");
      for (let d = new Date(periodStart); d <= periodEnd; d.setDate(d.getDate() + 1)) {
        periodDays.push({ ymd: toLocalYMD(d), dow: String(d.getDay()) });
      }

      // Pre-index assignments per staff to avoid O(staff × days × assignments) full scan
      const assignmentsByStaff: Record<string, ParsedAssignment[]> = {};
      for (const emp of unique) {
        assignmentsByStaff[emp.staffId] = parsedAssignments.filter(a =>
          staffMatchesAssignment(emp.staffId, a)
        );
      }

      const soCongMap: Record<string, number> = {};
      for (const emp of unique) {
        let total = 0;
        const myAssignments = assignmentsByStaff[emp.staffId];
        for (const { ymd, dow } of periodDays) {
          const ids: string[] = [];
          for (const a of myAssignments) {
            if (a.effective_from && ymd < a.effective_from) continue;
            if (a.effective_to && ymd > a.effective_to) continue;
            if (a.by_weekday) {
              const list: string[] = a.parsedSchedule[dow] || [];
              for (const id of list) if (id && !ids.includes(id)) ids.push(id);
            } else if (a.shift_template_id) {
              if (!ids.includes(a.shift_template_id)) ids.push(a.shift_template_id);
            }
          }
          for (const id of ids) total += getShiftWorkUnits(templateMap[id]);
        }
        soCongMap[emp.staffId] = Math.round(total * 100) / 100;
      }

      // ── 2. Công thực: SUM(tong_cong) từ bảng chấm công (/cham-cong) ────────
      const attendanceRes = await db.execute(sql`
        SELECT staff_id, COALESCE(SUM(ROUND(tong_cong::NUMERIC, 2)), 0) AS total_cong
        FROM staff_attendances
        WHERE work_date >= ${fromDate}::date
          AND work_date <= ${toDate}::date
        GROUP BY staff_id
      `);
      const congThucMap: Record<string, number> = {};
      for (const r of attendanceRes.rows as any[]) {
        congThucMap[r.staff_id] = parseFloat(r.total_cong ?? "0");
      }

      // ── 3. Lương đứng lớp: from overlapping teacher salary tables ──────────
      const salaryTablesRes = await db.execute(sql`
        SELECT id FROM teacher_salary_tables
        WHERE location_id = ${locationId}::uuid
          AND start_date <= ${toDate}::date
          AND end_date >= ${fromDate}::date
      `);
      const overlappingTableIds = (salaryTablesRes.rows as any[]).map(r => r.id as string);

      const luongDungLopMap: Record<string, number> = {};

      for (const salaryTableId of overlappingTableIds) {
        const [detailRows, rowPackages, sessionPackages] = await Promise.all([
          getTeacherSalaryDetailRows(salaryTableId),
          getTeacherSalaryRowPackages(salaryTableId),
          getTeacherSalarySessionPackages(salaryTableId),
        ]);

        // Build explicit override maps (teacher_salary_row_packages)
        const rowPkgMap: Record<string, string> = {};
        for (const rp of rowPackages) {
          rowPkgMap[`${rp.teacherId}::${rp.classId}`] = rp.packageId;
        }
        const sessionPkgMap: Record<string, string> = {};
        for (const sp of sessionPackages) {
          sessionPkgMap[`${sp.sessionId}::${sp.teacherId}`] = sp.packageId;
        }

        // Fallback: staff_salary_configs (staffId::courseId → packageId)
        const teacherIds = [...new Set(detailRows.map(r => r.teacherId))];
        const staffCfgMap: Record<string, string> = {};
        if (teacherIds.length > 0) {
          const configs = await db
            .select()
            .from(staffSalaryConfigs)
            .where(inArray(staffSalaryConfigs.staffId, teacherIds));
          for (const c of configs) {
            staffCfgMap[`${c.staffId}::${c.courseId}`] = c.salaryPackageId;
          }
        }

        // Collect all package IDs needed
        const allPkgIds = [...new Set([
          ...Object.values(rowPkgMap),
          ...Object.values(sessionPkgMap),
          ...Object.values(staffCfgMap),
        ])].filter(Boolean);

        const pkgsMap: Record<string, any> = {};
        if (allPkgIds.length > 0) {
          const pkgsRes = await db
            .select()
            .from(teacherSalaryPackages)
            .where(inArray(teacherSalaryPackages.id, allPkgIds));
          for (const p of pkgsRes) pkgsMap[p.id] = p;
        }

        // Calculate lương đứng lớp per teacher
        for (const row of detailRows) {
          // Package priority: explicit row override → staff_salary_config fallback
          const explicitPkgId = rowPkgMap[`${row.teacherId}::${row.classId}`];
          const configPkgId = row.courseId ? staffCfgMap[`${row.teacherId}::${row.courseId}`] : undefined;
          const defaultPkgId = explicitPkgId || configPkgId;
          if (!defaultPkgId || !pkgsMap[defaultPkgId]) continue;
          const salary = calcTotalSalary(row, pkgsMap[defaultPkgId], sessionPkgMap, pkgsMap);
          luongDungLopMap[row.teacherId] = (luongDungLopMap[row.teacherId] ?? 0) + salary;
        }
      }

      // ── 4. Fetch staff HR salary configs for this location ──────────────────
      const staffIds = unique.map(a => a.staffId);
      const hrConfigs = staffIds.length > 0
        ? await db
            .select()
            .from(staffHrSalaryConfigs)
            .where(and(
              inArray(staffHrSalaryConfigs.staffId, staffIds),
              eq(staffHrSalaryConfigs.locationId, locationId)
            ))
        : [];

      // Map staffId → config (take first config per staff if multiple)
      const hrConfigMap: Record<string, typeof hrConfigs[0]> = {};
      for (const c of hrConfigs) {
        if (!hrConfigMap[c.staffId]) hrConfigMap[c.staffId] = c;
      }

      // ── 5. Fetch salary default config (tax brackets & deductions) ──────────
      const defaultCfgRows = await db
        .select()
        .from(salaryDefaultConfigs)
        .limit(1);
      const defaultCfg = defaultCfgRows[0];
      const defGiamTruBT  = parseFloat(String(defaultCfg?.giamTruBanThan ?? "15500000")) || 15500000;
      const defGiamTruNPT = parseFloat(String(defaultCfg?.giamTruNguoiPhuThuoc ?? "6200000")) || 6200000;
      const defTaxBrackets: Array<{from: number; to: number|null; rate: string}> =
        Array.isArray(defaultCfg?.taxBrackets) && (defaultCfg.taxBrackets as any[]).length > 0
          ? (defaultCfg.taxBrackets as any[])
          : [
              { from: 0,         to: 10000000,  rate: "5"  },
              { from: 10000000,  to: 30000000,  rate: "10" },
              { from: 30000000,  to: 60000000,  rate: "20" },
              { from: 60000000,  to: 100000000, rate: "30" },
              { from: 100000000, to: null,       rate: "35" },
            ];

      // Helper: calculate TNCN tax given taxable income A and tax brackets
      function calcThueTNCN(a: number, brackets: typeof defTaxBrackets): number {
        if (a <= 0) return 0;
        const bracket = brackets.find(b =>
          a >= b.from && (b.to === null || a <= b.to)
        );
        if (!bracket) return 0;
        return Math.round(a * parseFloat(bracket.rate) / 100);
      }

      // ── 5b. Thưởng / Phạt: tổng từ staff_rewards trong kỳ lương ───────────
      const thuongMap: Record<string, number> = {};
      const phatMap: Record<string, number> = {};
      const tamUngMap: Record<string, number> = {};
      if (staffIds.length > 0) {
        // Build safe UUID list — UUIDs are hex+dash only, safe to interpolate
        const uuidLiteral = staffIds.map(id => `'${id.replace(/[^a-f0-9-]/gi, "")}'`).join(",");
        console.log(`[Generate] Fetching rewards: fromDate=${fromDate} toDate=${toDate} staffCount=${staffIds.length}`);
        const rewardsRes = await db.execute(sql.raw(`
          SELECT staff_id, type, SUM(amount) AS total
          FROM staff_rewards
          WHERE date >= '${fromDate}'
            AND date <= '${toDate}'
            AND staff_id IN (${uuidLiteral})
          GROUP BY staff_id, type
        `));
        console.log(`[Generate] Rewards found:`, JSON.stringify(rewardsRes.rows));
        for (const r of rewardsRes.rows as any[]) {
          const amt = Number(r.total) || 0;
          if (r.type === "reward") {
            thuongMap[r.staff_id] = (thuongMap[r.staff_id] ?? 0) + amt;
          } else if (r.type === "penalty") {
            phatMap[r.staff_id] = (phatMap[r.staff_id] ?? 0) + amt;
          }
        }

        const advances = await db
          .select({
            staffId: staffAdvances.staffId,
            amount: staffAdvances.amount,
          })
          .from(staffAdvances)
          .where(and(
            inArray(staffAdvances.staffId, staffIds),
            sql`${staffAdvances.date} >= ${fromDate}::date`,
            sql`${staffAdvances.date} <= ${toDate}::date`,
          ));
        for (const advance of advances) {
          tamUngMap[advance.staffId] = (tamUngMap[advance.staffId] ?? 0) + Number(advance.amount || 0);
        }
      }

      // Delete and re-generate
      await db.delete(salarySheetEmployees).where(eq(salarySheetEmployees.sheetId, req.params.id));

      if (unique.length === 0) {
        return res.json([]);
      }

      const inserted = await db
        .insert(salarySheetEmployees)
        .values(unique.map(a => {
          const luongDL = Math.round(luongDungLopMap[a.staffId] ?? 0);
          const cfg = hrConfigMap[a.staffId];

          // Read from staff HR config if available
          const luongCBVal = cfg ? Math.round(parseFloat(String(cfg.luongCB ?? 0))) : 0;

          // Resolve soCong / congThuc early — needed for per_day phuCap
          const soCong   = soCongMap[a.staffId] ?? 0;
          const congThuc = congThucMap[a.staffId] ?? 0;

          // phuCap: fixed_month → full amount; per_day → amount / soCong * congThuc
          const phuCapArr = cfg && Array.isArray(cfg.phuCap)
            ? cfg.phuCap as Array<{ amount: number; applyType?: string }>
            : [];
          const phuCapVal = phuCapArr.reduce((s, p) => {
            const amt = Number(p.amount) || 0;
            if (p.applyType === "per_day") {
              return s + (soCong > 0 ? Math.round(amt / soCong * congThuc) : 0);
            }
            return s + amt;
          }, 0);

          // BHXH: base * percent / 100; base defaults to luongCB if not set
          const bhxhBase = cfg ? parseFloat(String(cfg.bhxhBase ?? 0)) : 0;
          const bhxhPct  = cfg ? parseFloat(String(cfg.bhxhPercent ?? 8)) : 8;
          const bhxhBase2 = bhxhBase > 0 ? bhxhBase : luongCBVal;
          const bhxhVal  = Math.round(bhxhBase2 * bhxhPct / 100);

          // BHYT: base * percent / 100; base defaults to luongCB if not set
          const bhytBase = cfg ? parseFloat(String(cfg.bhytBase ?? 0)) : 0;
          const bhytPct  = cfg ? parseFloat(String(cfg.bhytPercent ?? 1.5)) : 1.5;
          const bhytBase2 = bhytBase > 0 ? bhytBase : luongCBVal;
          const bhytVal  = Math.round(bhytBase2 * bhytPct / 100);

          // BHTN: uses same base as BHXH (bhxhBase), percent from config
          const bhtnPct  = cfg ? parseFloat(String(cfg.bhtnPercent ?? 1)) : 1;
          const bhtnVal  = Math.round(bhxhBase2 * bhtnPct / 100);
          const luongTheoCong = soCong > 0 ? Math.round((luongCBVal / soCong) * congThuc) : 0;
          const thuongVal = thuongMap[a.staffId] ?? 0;
          const phatVal   = phatMap[a.staffId] ?? 0;
          const tamUngVal = tamUngMap[a.staffId] ?? 0;
          const tongLuong = Math.round(luongTheoCong + phuCapVal + thuongVal - phatVal + luongDL);

          // ThueTNCN: only if mode === "fixed"
          // thueTNCNAmount stores number of dependents (integer)
          let thueTNCNVal = 0;
          if (cfg && cfg.thueTNCNMode === "fixed") {
            const nPhuThuoc = Math.max(0, Math.round(parseFloat(String(cfg.thueTNCNAmount ?? 0))));
            const tongGiamTru = defGiamTruBT + nPhuThuoc * defGiamTruNPT;
            const thuNhapTinhThue = tongLuong - bhxhVal - bhytVal - bhtnVal - tongGiamTru;
            thueTNCNVal = calcThueTNCN(thuNhapTinhThue, defTaxBrackets);
          }

          const thucNhan  = Math.round(tongLuong - bhxhVal - bhytVal - bhtnVal - thueTNCNVal - tamUngVal);

          return {
            sheetId: req.params.id,
            staffId: a.staffId,
            staffCode: a.staffCode,
            staffName: a.staffName,
            locationName,
            roleName: a.roleName ?? "Nhân viên",
            soCong: String(soCong),
            luongCB: String(luongCBVal),
            congThuc,
            luongTheoCong: String(luongTheoCong),
            phuCap: String(phuCapVal),
            thuong: String(thuongVal),
            phat: String(phatVal),
            luongDungLop: String(luongDL),
            tongLuong: String(tongLuong),
            bhxh: String(bhxhVal),
            bhyt: String(bhytVal),
            bhtn: String(bhtnVal),
            thueTNCN: String(thueTNCNVal),
            tamUng: String(tamUngVal),
            thucNhan: String(thucNhan),
            daChi: false,
          };
        }))
        .returning();

      res.json(inserted);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Update employee row ───────────────────────────────────────────────────
  app.patch("/api/salary-sheets/:id/employees/:empId", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;

      // Fetch current row so we can merge and recalculate
      const [current] = await db
        .select()
        .from(salarySheetEmployees)
        .where(and(
          eq(salarySheetEmployees.id, req.params.empId),
          eq(salarySheetEmployees.sheetId, req.params.id)
        ))
        .limit(1);
      if (!current) return res.status(404).json({ message: "Không tìm thấy dòng lương" });

      const inputFields = [
        "soCong","luongCB","congThuc","phuCap","thuong","phat",
        "luongDungLop","bhxh","bhyt","bhtn","thueTNCN","tamUng","daChi",
        "roleName","staffName","staffCode",
      ] as const;
      const updates: Partial<typeof salarySheetEmployees.$inferInsert> = {};
      for (const f of inputFields) {
        if (req.body[f] !== undefined) (updates as any)[f] = req.body[f];
      }

      // Merge with current to get full picture, then recalculate derived columns
      const merged = { ...current, ...updates };
      const soCong    = parseFloat(String(merged.soCong    ?? 0));
      const luongCB   = parseFloat(String(merged.luongCB   ?? 0));
      const congThuc  = Number(merged.congThuc  ?? 0);
      const phuCap    = parseFloat(String(merged.phuCap    ?? 0));
      const thuong    = parseFloat(String(merged.thuong    ?? 0));
      const phat      = parseFloat(String(merged.phat      ?? 0));
      const luongDL   = parseFloat(String(merged.luongDungLop ?? 0));
      const bhxh      = parseFloat(String(merged.bhxh      ?? 0));
      const bhyt      = parseFloat(String(merged.bhyt      ?? 0));
      const bhtn      = parseFloat(String(merged.bhtn      ?? 0));
      const thueTNCN  = parseFloat(String(merged.thueTNCN  ?? 0));
      const tamUng    = parseFloat(String(merged.tamUng    ?? 0));

      // Lương theo công = (Lương CB / Số công) × Công thực  (0 if soCong=0)
      const luongTheoCong = soCong > 0 ? Math.round((luongCB / soCong) * congThuc) : 0;
      // Tổng lương = Lương theo công + Phụ cấp + Thưởng - Phạt + Lương đứng lớp
      const tongLuong     = Math.round(luongTheoCong + phuCap + thuong - phat + luongDL);
      // Thực nhận = Tổng lương - BHXH - BHYT - BHTN - Thuế TNCN - Tạm ứng
      const thucNhan      = Math.round(tongLuong - bhxh - bhyt - bhtn - thueTNCN - tamUng);

      updates.luongTheoCong = String(luongTheoCong);
      updates.tongLuong     = String(tongLuong);
      updates.thucNhan      = String(thucNhan);
      updates.updatedAt     = new Date();

      const [updated] = await db
        .update(salarySheetEmployees)
        .set(updates)
        .where(and(
          eq(salarySheetEmployees.id, req.params.empId),
          eq(salarySheetEmployees.sheetId, req.params.id)
        ))
        .returning();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Salary Allowance Types (GET / POST / DELETE) ───────────────────────────
  app.get("/api/salary-allowance-types", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const rows = await db.select().from(salaryAllowanceTypes).orderBy(salaryAllowanceTypes.createdAt);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/salary-allowance-types", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const { name, applyType } = req.body;
      if (!name?.trim()) return res.status(400).json({ message: "Tên phụ thu không được để trống" });
      if (!["fixed_month", "per_day"].includes(applyType)) return res.status(400).json({ message: "Loại hình áp dụng không hợp lệ" });
      const [created] = await db.insert(salaryAllowanceTypes).values({
        name: name.trim(),
        applyType,
      }).returning();
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/salary-allowance-types/:id", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      await db.delete(salaryAllowanceTypes).where(eq(salaryAllowanceTypes.id, req.params.id));
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Salary Default Config (GET / PUT) ─────────────────────────────────────
  app.get("/api/salary-default-config", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const rows = await db.select().from(salaryDefaultConfigs).where(eq(salaryDefaultConfigs.centerId, "default")).limit(1);
      if (rows.length === 0) {
        // Return built-in defaults without inserting
        return res.json({
          centerId: "default",
          bhxhPercent: "8",
          bhytPercent: "1.5",
          bhtnPercent: "1",
          giamTruBanThan: "15500000",
          giamTruNguoiPhuThuoc: "6200000",
          taxBrackets: [
            { bac: 1, from: 0,         to: 10000000,  rate: "5"  },
            { bac: 2, from: 10000000,  to: 30000000,  rate: "10" },
            { bac: 3, from: 30000000,  to: 60000000,  rate: "20" },
            { bac: 4, from: 60000000,  to: 100000000, rate: "30" },
            { bac: 5, from: 100000000, to: null,      rate: "35" },
          ],
        });
      }
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/salary-default-config", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const { bhxhPercent, bhytPercent, bhtnPercent, giamTruBanThan, giamTruNguoiPhuThuoc, taxBrackets } = req.body;

      // Validate numeric fields
      const parseNum = (val: any, fallback: string, fieldName: string): string => {
        const n = parseFloat(String(val ?? ""));
        if (isNaN(n)) throw Object.assign(new Error(`Trường "${fieldName}" không hợp lệ`), { status: 400 });
        return String(n);
      };
      const bhxhP = parseNum(bhxhPercent, "8", "BHXH");
      const bhytP = parseNum(bhytPercent, "1.5", "BHYT");
      const bhtnP = parseNum(bhtnPercent, "1", "BHTN");
      const gtBT = parseNum(giamTruBanThan, "15500000", "Giảm trừ bản thân");
      const gtNPT = parseNum(giamTruNguoiPhuThuoc, "6200000", "Giảm trừ người phụ thuộc");

      // Validate tax brackets
      if (!Array.isArray(taxBrackets) || taxBrackets.length === 0) {
        return res.status(400).json({ message: "Bậc thuế không hợp lệ" });
      }
      for (const b of taxBrackets) {
        if (typeof b.bac !== "number" || typeof b.from !== "number" || typeof b.rate === "undefined") {
          return res.status(400).json({ message: "Dữ liệu bậc thuế không đúng định dạng" });
        }
        if (isNaN(parseFloat(String(b.rate)))) {
          return res.status(400).json({ message: `Thuế suất bậc ${b.bac} không hợp lệ` });
        }
      }

      const existing = await db.select().from(salaryDefaultConfigs).where(eq(salaryDefaultConfigs.centerId, "default")).limit(1);
      const payload: any = {
        bhxhPercent: bhxhP,
        bhytPercent: bhytP,
        bhtnPercent: bhtnP,
        giamTruBanThan: gtBT,
        giamTruNguoiPhuThuoc: gtNPT,
        taxBrackets,
        updatedAt: new Date(),
      };
      if (existing.length === 0) {
        const [created] = await db.insert(salaryDefaultConfigs).values({ centerId: "default", ...payload }).returning();
        return res.json(created);
      }
      const [updated] = await db.update(salaryDefaultConfigs).set(payload).where(eq(salaryDefaultConfigs.centerId, "default")).returning();
      res.json(updated);
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  // ── Bulk chi luong ────────────────────────────────────────────────────────
  app.post("/api/salary-sheets/:id/employees/bulk-pay", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const { empIds }: { empIds: string[] } = req.body;
      if (!Array.isArray(empIds) || empIds.length === 0) return res.status(400).json({ message: "empIds required" });
      const { inArray } = await import("drizzle-orm");
      await db
        .update(salarySheetEmployees)
        .set({ daChi: true, updatedAt: new Date() })
        .where(and(
          eq(salarySheetEmployees.sheetId, req.params.id),
          inArray(salarySheetEmployees.id, empIds)
        ));
      res.json({ updated: empIds.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
