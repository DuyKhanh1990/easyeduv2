import type { Express } from "express";
import { and, desc, eq, exists, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { storage } from "../storage";
import {
  locations,
  organizationClientLocations,
  organizationClients,
  staff,
} from "@shared/schema";

const CRM_RESOURCE = "/customers";
class ClientRequestError extends Error {}

const clientSchema = z.object({
  classification: z.enum(["center", "business"]),
  code: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(255),
  domain: z.string().trim().max(255).nullable().optional(),
  accountStatus: z.enum(["active", "suspended"]).optional(),
  contactName: z.string().trim().max(255).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  email: z.string().trim().max(255).nullable().optional(),
  startDate: z.string().date(),
  durationMonths: z.number().int().positive().max(1200),
  servicePackage: z.string().nullable().optional(),
  internalNote: z.string().nullable().optional(),
  salesStaffIds: z.array(z.string().uuid()).optional(),
  managerStaffIds: z.array(z.string().uuid()).optional(),
  locationIds: z.array(z.string().uuid()).min(1),
  codeManuallyEdited: z.boolean().optional(),
}).strict();

const renewSchema = z.object({
  startDate: z.string().date(),
  durationMonths: z.number().int().positive().max(1200),
}).strict();

function bangkokToday(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addCalendarMonths(dateString: string, months: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const finalDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(normalizedMonth + 1).padStart(2, "0")}-${String(Math.min(day, finalDay)).padStart(2, "0")}`;
}

function periodTab(startDate: string, endDate: string, today: string): string | null {
  if (startDate > today) return "not_due";
  if (endDate < today) return "expired";
  if (endDate === today) return "due";
  const oneMonth = addCalendarMonths(today, 1);
  const twoMonths = addCalendarMonths(today, 2);
  if (endDate <= oneMonth) return "upcoming_1";
  if (endDate <= twoMonths) return "upcoming_2";
  return null;
}

function prefixFor(locationCode: string, classification: "center" | "business") {
  return `${locationCode} - ${classification === "center" ? "TT" : "DN"} - `;
}

async function getPermissions(req: any) {
  if (req.isSuperAdmin) {
    return { canView: true, canViewAll: true, canCreate: true, canEdit: true, canDelete: true };
  }
  return storage.getEffectivePermissions(req.roleIds || [], CRM_RESOURCE);
}

function canAccessLocation(req: any, locationId: string) {
  return req.isSuperAdmin === true || (req.allowedLocationIds || []).includes(locationId);
}

async function validateLocations(tx: any, req: any, locationIds: string[]): Promise<Array<{ id: string; code: string }>> {
  const uniqueIds = [...new Set(locationIds)];
  if (uniqueIds.length !== locationIds.length) throw new ClientRequestError("Danh sách cơ sở bị trùng.");
  if (!req.isSuperAdmin && uniqueIds.some((id) => !canAccessLocation(req, id))) {
    throw new ClientRequestError("Bạn không có quyền truy cập một hoặc nhiều cơ sở đã chọn.");
  }
  const active = await tx.select({ id: locations.id, code: locations.code })
    .from(locations)
    .where(and(inArray(locations.id, uniqueIds), eq(locations.isActive, true)));
  if (active.length !== uniqueIds.length) throw new ClientRequestError("Một hoặc nhiều cơ sở không tồn tại hoặc đã ngừng hoạt động.");
  const byId = new Map<string, { id: string; code: string }>(
    active.map((location: { id: string; code: string }) => [location.id, location]),
  );
  return uniqueIds.map((id) => byId.get(id)!);
}

async function validateStaffIds(tx: any, staffIds: string[] | undefined) {
  if (!staffIds?.length) return [];
  const uniqueIds = [...new Set(staffIds)];
  if (uniqueIds.length !== staffIds.length) throw new ClientRequestError("Danh sách nhân sự bị trùng.");
  const rows = await tx.select({ id: staff.id }).from(staff).where(inArray(staff.id, uniqueIds));
  if (rows.length !== uniqueIds.length) throw new ClientRequestError("Một hoặc nhiều nhân sự không tồn tại.");
  return uniqueIds;
}

function visibleConditions(req: any, permissions: any) {
  const conditions: any[] = [sql`${organizationClients.deletedAt} IS NULL`];
  if (!req.isSuperAdmin && !permissions.canViewAll) {
    conditions.push(permissions.canView
      ? eq(organizationClients.createdBy, req.user.id)
      : sql`FALSE`);
  }
  if (!req.isSuperAdmin) {
    const allowedIds: string[] = req.allowedLocationIds || [];
    conditions.push(allowedIds.length
      ? exists(db.select({ one: sql`1` }).from(organizationClientLocations).where(and(
          eq(organizationClientLocations.organizationClientId, organizationClients.id),
          inArray(organizationClientLocations.locationId, allowedIds),
        )))
      : sql`FALSE`);
  }
  return conditions;
}

function recordIsInScope(req: any, permissions: any, record: any, locationIds: string[]) {
  if (record.deletedAt) return false;
  if (!req.isSuperAdmin && !permissions.canViewAll &&
      (!permissions.canView || record.createdBy !== req.user.id)) return false;
  return req.isSuperAdmin || locationIds.some((id) => canAccessLocation(req, id));
}

async function allocateCode(tx: any, prefix: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${prefix}))`);
  const rows = await tx.select({ code: organizationClients.code })
    .from(organizationClients)
    .where(sql`starts_with(${organizationClients.code}, ${prefix})`);
  const max = rows.reduce((current: number, row: { code: string }) => {
    const suffix = row.code.slice(prefix.length);
    return /^\d+$/.test(suffix) ? Math.max(current, Number(suffix)) : current;
  }, 0);
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}

async function getClientLocationIds(clientId: string) {
  const rows = await db.select({ locationId: organizationClientLocations.locationId })
    .from(organizationClientLocations)
    .where(eq(organizationClientLocations.organizationClientId, clientId));
  return rows.map((row) => row.locationId);
}

export function registerOrganizationClientRoutes(app: Express) {
  app.get("/api/organization-clients/next-code", async (req: any, res) => {
    if (req.isStudent) return res.status(403).json({ message: "Tài khoản học viên không được phép truy cập." });
    try {
      const permissions = await getPermissions(req);
      if (!permissions.canCreate) return res.status(403).json({ message: "Bạn không có quyền tạo khách hàng tổ chức." });
      const parsed = z.object({
        locationId: z.string().uuid(),
        classification: z.enum(["center", "business"]),
      }).safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ message: "Thông tin cơ sở hoặc phân loại không hợp lệ." });
      const [location] = await db.select({ id: locations.id, code: locations.code, isActive: locations.isActive })
        .from(locations).where(eq(locations.id, parsed.data.locationId)).limit(1);
      if (!location || !location.isActive) return res.status(400).json({ message: "Cơ sở không tồn tại hoặc đã ngừng hoạt động." });
      if (!canAccessLocation(req, location.id)) return res.status(403).json({ message: "Bạn không có quyền truy cập cơ sở này." });
      const prefix = prefixFor(location.code, parsed.data.classification);
      const rows = await db.select({ code: organizationClients.code }).from(organizationClients)
        .where(sql`starts_with(${organizationClients.code}, ${prefix})`);
      const max = rows.reduce((current, row) => {
        const suffix = row.code.slice(prefix.length);
        return /^\d+$/.test(suffix) ? Math.max(current, Number(suffix)) : current;
      }, 0);
       return res.json({ code: `${prefix}${String(max + 1).padStart(2, "0")}` });
    } catch (error) {
      console.error("[OrganizationClients] next-code failed", error);
      return res.status(500).json({ message: "Không thể tạo mã khách hàng." });
    }
  });

  app.get("/api/organization-clients", async (req: any, res) => {
    if (req.isStudent) return res.status(403).json({ message: "Tài khoản học viên không được phép truy cập." });
    try {
      const permissions = await getPermissions(req);
      if (!permissions.canView && !permissions.canViewAll) return res.status(403).json({ message: "Bạn không có quyền xem khách hàng tổ chức." });
      const conditions = visibleConditions(req, permissions);
      const { search, status, tab, locationId } = req.query as Record<string, string | undefined>;
      if (status && ["active", "suspended"].includes(status)) conditions.push(eq(organizationClients.accountStatus, status));
      if (search?.trim()) {
        const pattern = `%${search.trim()}%`;
        conditions.push(or(
          ilike(organizationClients.name, pattern),
          ilike(organizationClients.code, pattern),
          ilike(organizationClients.domain, pattern),
          ilike(organizationClients.contactName, pattern),
          ilike(organizationClients.phone, pattern),
          ilike(organizationClients.email, pattern),
        )!);
      }
      if (locationId) {
        if (!req.isSuperAdmin && !canAccessLocation(req, locationId)) return res.json({ records: [], permissions });
        conditions.push(exists(db.select({ one: sql`1` }).from(organizationClientLocations)
          .where(and(
            eq(organizationClientLocations.organizationClientId, organizationClients.id),
            eq(organizationClientLocations.locationId, locationId),
          ))));
      }
      const rows = await db.select().from(organizationClients)
        .where(and(...conditions)).orderBy(desc(organizationClients.createdAt));
      const today = bangkokToday();
      let filtered = rows;
      if (tab && ["not_due", "upcoming_1", "upcoming_2", "due", "expired"].includes(tab)) {
        filtered = rows.filter((row) => periodTab(row.startDate, row.endDate, today) === tab);
      }
      const ids = filtered.map((row) => row.id);
      const locationRows = ids.length
        ? await db.select({ clientId: organizationClientLocations.organizationClientId, locationId: locations.id, locationName: locations.name })
            .from(organizationClientLocations)
            .innerJoin(locations, eq(locations.id, organizationClientLocations.locationId))
            .where(inArray(organizationClientLocations.organizationClientId, ids))
        : [];
      const locationsByClient = new Map<string, { id: string; name: string }[]>();
      for (const row of locationRows) {
        if (!req.isSuperAdmin && !canAccessLocation(req, row.locationId)) continue;
        const arr = locationsByClient.get(row.clientId) || [];
        arr.push({ id: row.locationId, name: row.locationName });
        locationsByClient.set(row.clientId, arr);
      }
      const records = filtered.filter((row) => req.isSuperAdmin || locationsByClient.has(row.id))
        .map((row) => ({ ...row, locations: locationsByClient.get(row.id) || [] }));
      return res.json({ records, permissions });
    } catch (error) {
      console.error("[OrganizationClients] list failed", error);
      return res.status(500).json({ message: "Không thể tải khách hàng tổ chức." });
    }
  });

  app.get("/api/organization-clients/:id", async (req: any, res) => {
    if (req.isStudent) return res.status(403).json({ message: "Tài khoản học viên không được phép truy cập." });
    try {
      const permissions = await getPermissions(req);
      if (!permissions.canView && !permissions.canViewAll) return res.status(403).json({ message: "Bạn không có quyền xem khách hàng tổ chức." });
      const [record] = await db.select().from(organizationClients)
        .where(eq(organizationClients.id, req.params.id)).limit(1);
      if (!record) return res.status(404).json({ message: "Không tìm thấy khách hàng tổ chức." });
      const locationIds = await getClientLocationIds(record.id);
      if (!recordIsInScope(req, permissions, record, locationIds)) return res.status(404).json({ message: "Không tìm thấy khách hàng tổ chức." });
      return res.json({
        ...record,
        locationIds: req.isSuperAdmin ? locationIds : locationIds.filter((id) => canAccessLocation(req, id)),
      });
    } catch (error) {
      console.error("[OrganizationClients] detail failed", error);
      return res.status(500).json({ message: "Không thể tải khách hàng tổ chức." });
    }
  });

  app.post("/api/organization-clients", async (req: any, res) => {
    if (req.isStudent) return res.status(403).json({ message: "Tài khoản học viên không được phép truy cập." });
    try {
      const permissions = await getPermissions(req);
      if (!permissions.canCreate) return res.status(403).json({ message: "Bạn không có quyền tạo khách hàng tổ chức." });
      const parsed = clientSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Dữ liệu khách hàng không hợp lệ.", errors: parsed.error.flatten() });
      const data = parsed.data;
      const created = await db.transaction(async (tx) => {
        const selectedLocations = await validateLocations(tx, req, data.locationIds);
        const prefix = prefixFor(selectedLocations[0].code, data.classification);
        const code = data.codeManuallyEdited
          ? data.code?.trim()
          : await allocateCode(tx, prefix);
        if (!code) throw new ClientRequestError("Mã khách hàng là bắt buộc.");
        const [record] = await tx.insert(organizationClients).values({
          classification: data.classification,
          code,
          name: data.name,
          domain: data.domain ?? null,
          accountStatus: data.accountStatus ?? "active",
          contactName: data.contactName ?? null,
          phone: data.phone ?? null,
          email: data.email ?? null,
          startDate: data.startDate,
          durationMonths: data.durationMonths,
          endDate: addCalendarMonths(data.startDate, data.durationMonths),
          servicePackage: data.servicePackage ?? null,
          internalNote: data.internalNote ?? null,
          salesStaffIds: await validateStaffIds(tx, data.salesStaffIds),
          managerStaffIds: await validateStaffIds(tx, data.managerStaffIds),
          createdBy: req.user.id,
          updatedBy: req.user.id,
        }).returning();
        await tx.insert(organizationClientLocations).values(selectedLocations.map((location: any) => ({
          organizationClientId: record.id,
          locationId: location.id,
        })));
        return record;
      });
      return res.status(201).json({ ...created, locationIds: data.locationIds });
    } catch (error: any) {
      if (error?.code === "23505") return res.status(409).json({ message: "Mã khách hàng đã tồn tại." });
      console.error("[OrganizationClients] create failed", error);
      if (error instanceof ClientRequestError) return res.status(400).json({ message: error.message });
      return res.status(500).json({ message: "Không thể tạo khách hàng tổ chức." });
    }
  });

  app.patch("/api/organization-clients/:id", async (req: any, res) => {
    if (req.isStudent) return res.status(403).json({ message: "Tài khoản học viên không được phép truy cập." });
    try {
      const permissions = await getPermissions(req);
      if (!permissions.canEdit) return res.status(403).json({ message: "Bạn không có quyền chỉnh sửa khách hàng tổ chức." });
      const parsed = clientSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Dữ liệu khách hàng không hợp lệ.", errors: parsed.error.flatten() });
      const data = parsed.data;
      const result = await db.transaction(async (tx) => {
        const [old] = await tx.select().from(organizationClients).where(eq(organizationClients.id, req.params.id)).limit(1);
        if (!old || old.deletedAt) return { missing: true };
        const oldLocations = await tx.select({ locationId: organizationClientLocations.locationId })
          .from(organizationClientLocations).where(eq(organizationClientLocations.organizationClientId, old.id));
        if (!recordIsInScope(req, permissions, old, oldLocations.map((r: any) => r.locationId))) return { missing: true };
        const requestedLocationIds = data.locationIds ?? oldLocations.map((r: any) => r.locationId);
        if (data.locationIds !== undefined) await validateLocations(tx, req, data.locationIds);
        const preservedLocationIds = !req.isSuperAdmin && data.locationIds !== undefined
          ? oldLocations.map((row: any) => row.locationId).filter((id: string) => !canAccessLocation(req, id))
          : [];
        const storedLocationIds = [...new Set([...requestedLocationIds, ...preservedLocationIds])];
        const patch: any = { updatedBy: req.user.id, updatedAt: new Date() };
        for (const key of ["classification", "name", "domain", "accountStatus", "contactName", "phone", "email", "startDate", "durationMonths", "servicePackage", "internalNote"] as const) {
          if (data[key] !== undefined) patch[key] = data[key];
        }
        if (data.salesStaffIds !== undefined) patch.salesStaffIds = await validateStaffIds(tx, data.salesStaffIds);
        if (data.managerStaffIds !== undefined) patch.managerStaffIds = await validateStaffIds(tx, data.managerStaffIds);
        if (data.startDate !== undefined || data.durationMonths !== undefined) {
          patch.endDate = addCalendarMonths(data.startDate ?? old.startDate, data.durationMonths ?? old.durationMonths);
        }
        if (data.codeManuallyEdited && data.code) {
          patch.code = data.code.trim();
        } else if (
          (data.classification !== undefined && data.classification !== old.classification) ||
          (data.locationIds !== undefined && data.locationIds[0] !== oldLocations[0]?.locationId)
        ) {
          const codeLocations = await tx.select({ id: locations.id, code: locations.code })
            .from(locations)
            .where(inArray(locations.id, requestedLocationIds));
          const firstLocation = codeLocations.find((location: any) => location.id === requestedLocationIds[0]);
          if (!firstLocation) throw new ClientRequestError("Không xác định được cơ sở để tạo mã.");
          const classification = data.classification ?? (old.classification === "business" ? "business" : "center");
          patch.code = await allocateCode(tx, prefixFor(firstLocation.code, classification));
        }
        const [updated] = await tx.update(organizationClients).set(patch)
          .where(eq(organizationClients.id, old.id)).returning();
        if (data.locationIds !== undefined) {
          await tx.delete(organizationClientLocations).where(eq(organizationClientLocations.organizationClientId, old.id));
          await tx.insert(organizationClientLocations).values(storedLocationIds.map((locationId) => ({
            organizationClientId: old.id,
            locationId,
          })));
        }
        return { updated, locationIds: storedLocationIds };
      });
      if ("missing" in result) return res.status(404).json({ message: "Không tìm thấy khách hàng tổ chức." });
      return res.json({
        ...result.updated,
        locationIds: req.isSuperAdmin
          ? result.locationIds
          : result.locationIds.filter((id: string) => canAccessLocation(req, id)),
      });
    } catch (error: any) {
      if (error?.code === "23505") return res.status(409).json({ message: "Mã khách hàng đã tồn tại." });
      console.error("[OrganizationClients] update failed", error);
      if (error instanceof ClientRequestError) return res.status(400).json({ message: error.message });
      return res.status(500).json({ message: "Không thể cập nhật khách hàng." });
    }
  });

  app.delete("/api/organization-clients/:id", async (req: any, res) => {
    if (req.isStudent) return res.status(403).json({ message: "Tài khoản học viên không được phép truy cập." });
    try {
      const permissions = await getPermissions(req);
      if (!permissions.canDelete) return res.status(403).json({ message: "Bạn không có quyền xóa khách hàng tổ chức." });
      const [record] = await db.select().from(organizationClients)
        .where(eq(organizationClients.id, req.params.id)).limit(1);
      if (!record || record.deletedAt) return res.status(404).json({ message: "Không tìm thấy khách hàng tổ chức." });
      const locationIds = await getClientLocationIds(record.id);
      if (!recordIsInScope(req, permissions, record, locationIds)) return res.status(404).json({ message: "Không tìm thấy khách hàng tổ chức." });
      await db.update(organizationClients).set({ deletedAt: new Date(), updatedAt: new Date(), updatedBy: req.user.id })
        .where(eq(organizationClients.id, record.id));
      return res.json({ success: true });
    } catch (error) {
      console.error("[OrganizationClients] delete failed", error);
      return res.status(500).json({ message: "Không thể xóa khách hàng tổ chức." });
    }
  });

  app.post("/api/organization-clients/:id/renew", async (req: any, res) => {
    if (req.isStudent) return res.status(403).json({ message: "Tài khoản học viên không được phép truy cập." });
    try {
      const permissions = await getPermissions(req);
      if (!permissions.canEdit) return res.status(403).json({ message: "Bạn không có quyền gia hạn khách hàng tổ chức." });
      const parsed = renewSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Thông tin gia hạn không hợp lệ." });
      const [record] = await db.select().from(organizationClients)
        .where(eq(organizationClients.id, req.params.id)).limit(1);
      if (!record || record.deletedAt) return res.status(404).json({ message: "Không tìm thấy khách hàng tổ chức." });
      const locationIds = await getClientLocationIds(record.id);
      if (!recordIsInScope(req, permissions, record, locationIds)) return res.status(404).json({ message: "Không tìm thấy khách hàng tổ chức." });
      const nextEndDate = addCalendarMonths(parsed.data.startDate, parsed.data.durationMonths);
      const history = Array.isArray(record.renewalHistory) ? record.renewalHistory : [];
      const [updated] = await db.update(organizationClients).set({
        renewalHistory: [...history, {
          startDate: record.startDate,
          durationMonths: record.durationMonths,
          endDate: record.endDate,
          renewedAt: new Date().toISOString(),
          renewedBy: req.user.id,
        }],
        startDate: parsed.data.startDate,
        durationMonths: parsed.data.durationMonths,
        endDate: nextEndDate,
        updatedBy: req.user.id,
        updatedAt: new Date(),
      }).where(eq(organizationClients.id, record.id)).returning();
      return res.json(updated);
    } catch (error) {
      console.error("[OrganizationClients] renew failed", error);
      return res.status(500).json({ message: "Không thể gia hạn khách hàng tổ chức." });
    }
  });
}
