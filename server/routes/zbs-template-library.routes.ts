import type { Express, Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { centerConfig, systemSettings, zbsTemplateLibrary } from "@shared/schema";
import { z } from "zod";
import approvedTuitionNotice from "../../shared/zbs-approved-templates/tuition-notice-651693.json";
import { db } from "../storage/base";
import { getEffectivePermissions } from "../storage/permissions.storage";
import {
  assertZbsLibraryReadAccess,
  assertZbsLibraryWriteAccess,
  prepareZbsLibraryDraft,
  zbsLibraryInputSchema,
  ZbsLibraryError,
} from "../services/zbs-template-library.service";
import { buildTuitionNoticeTestTemplate } from "../services/zbs-template-test.service";

const RESOURCE = "/settings#providers";
const idSchema = z.string().uuid();
const sharedLogosSchema = z.object({
  logoLightUrl: z.string().url().max(2000).nullable(),
  logoDarkUrl: z.string().url().max(2000).nullable(),
});

function privileged(req: Request) {
  return req.isSuperAdmin === true || (req.user as any)?.username === "admin";
}

async function permission(req: Request, res: Response, action: "read" | "write" | "delete") {
  const p = privileged(req) ? null : await getEffectivePermissions(req.roleIds ?? [], RESOURCE);
  const base = {
    isStudent: req.isStudent === true,
    isPrivileged: privileged(req),
    canView: p?.canView ?? false,
    canViewAll: p?.canViewAll ?? false,
    canCreate: p?.canCreate ?? false,
    canEdit: p?.canEdit ?? false,
    canDelete: p?.canDelete ?? false,
  };
  const allowed = action === "read"
    ? assertZbsLibraryReadAccess(base)
    : assertZbsLibraryWriteAccess({ ...base, deleting: action === "delete" });
  if (!allowed) {
    res.status(403).json({ code: "FORBIDDEN", message: "Bạn không có quyền truy cập Thư viện mẫu ZBS." });
    return false;
  }
  return true;
}

async function currentCenterId() {
  const [center] = await db.select({ id: centerConfig.id }).from(centerConfig).limit(1);
  if (!center) throw new ZbsLibraryError(409, "CENTER_NOT_CONFIGURED", "Chưa cấu hình trung tâm hiện tại.");
  return center.id;
}

function reportError(res: Response, error: unknown) {
  if (error instanceof ZbsLibraryError) {
    return res.status(error.status).json({ code: error.code, message: error.message });
  }
  if ((error as any)?.code === "42P01" && String((error as any)?.message ?? "").includes("zbs_template_library")) {
    return res.status(503).json({
      code: "LIBRARY_MIGRATION_REQUIRED",
      message: "Thư viện mẫu ZBS chưa có bảng dữ liệu. Cần áp dụng migration riêng trước khi tải hoặc lưu mẫu.",
    });
  }
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    const field = issue?.path.map(String).join(".");
    const message = issue?.message ?? "Dữ liệu mẫu không hợp lệ.";
    return res.status(400).json({
      code: "INVALID_TEMPLATE",
      message: field ? `${field}: ${message}` : message,
    });
  }
  if ((error as any)?.code === "23505") {
    return res.status(409).json({ code: "TEMPLATE_CODE_TAKEN", message: "Mã mẫu đã được sử dụng trong trung tâm này." });
  }
  console.error("[ZbsTemplateLibrary] request failed:", error);
  return res.status(500).json({ code: "INTERNAL_ERROR", message: "Không thể xử lý Thư viện mẫu ZBS." });
}

export function registerZbsTemplateLibraryRoutes(app: Express) {
  app.get("/api/settings/zbs-template-library/test-template", async (req, res) => {
    try {
      if (!(await permission(req, res, "write"))) return;
      const centerId = await currentCenterId();
      const sharedLogosKey = `zbsSharedLogos:${centerId}`;
      const testTemplateKey = `zbsTestTemplate:${centerId}`;
      const [row] = await db.select({ value: systemSettings.value })
        .from(systemSettings)
        .where(eq(systemSettings.key, sharedLogosKey))
        .limit(1);
      if (!row) {
        return res.status(409).json({
          code: "SHARED_LOGOS_REQUIRED",
          message: "Hãy lưu đủ hai logo dùng chung trước khi tạo mẫu Test.",
        });
      }
      const logos = sharedLogosSchema.parse(JSON.parse(row.value));
      if (!logos.logoLightUrl || !logos.logoDarkUrl) {
        return res.status(409).json({
          code: "SHARED_LOGOS_REQUIRED",
          message: "Hãy lưu đủ hai logo dùng chung trước khi tạo mẫu Test.",
        });
      }
      const testTemplate = buildTuitionNoticeTestTemplate(logos);
      await db.insert(systemSettings)
        .values({ key: testTemplateKey, value: JSON.stringify(testTemplate) })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: JSON.stringify(testTemplate), updatedAt: new Date() },
        });
      return res.json(testTemplate);
    } catch (error) { return reportError(res, error); }
  });

  app.get("/api/settings/zbs-logo-settings", async (req, res) => {
    try {
      if (!(await permission(req, res, "read"))) return;
      const centerId = await currentCenterId();
      const key = `zbsSharedLogos:${centerId}`;
      const [row] = await db.select({ value: systemSettings.value })
        .from(systemSettings)
        .where(eq(systemSettings.key, key))
        .limit(1);
      const logos = row ? sharedLogosSchema.parse(JSON.parse(row.value)) : { logoLightUrl: null, logoDarkUrl: null };
      return res.json(logos);
    } catch (error) { return reportError(res, error); }
  });

  app.put("/api/settings/zbs-logo-settings", async (req, res) => {
    try {
      if (!(await permission(req, res, "write"))) return;
      const logos = sharedLogosSchema.parse(req.body);
      const centerId = await currentCenterId();
      const key = `zbsSharedLogos:${centerId}`;
      await db.insert(systemSettings)
        .values({ key, value: JSON.stringify(logos) })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: JSON.stringify(logos), updatedAt: new Date() },
        });
      return res.json(logos);
    } catch (error) { return reportError(res, error); }
  });

  app.get("/api/settings/zbs-template-library/approved-sources", async (req, res) => {
    try {
      if (!(await permission(req, res, "read"))) return;
      return res.json([approvedTuitionNotice]);
    } catch (error) { return reportError(res, error); }
  });

  app.get("/api/settings/zbs-template-library", async (req, res) => {
    try {
      if (!(await permission(req, res, "read"))) return;
      const centerId = await currentCenterId();
      const rows = await db.select().from(zbsTemplateLibrary)
        .where(eq(zbsTemplateLibrary.centerId, centerId))
        .orderBy(desc(zbsTemplateLibrary.updatedAt));
      return res.json(rows);
    } catch (error) { return reportError(res, error); }
  });

  app.get("/api/settings/zbs-template-library/:id", async (req, res) => {
    try {
      if (!(await permission(req, res, "read"))) return;
      const parsedId = idSchema.safeParse(req.params.id);
      if (!parsedId.success) throw new ZbsLibraryError(400, "INVALID_ID", "Mã mẫu không hợp lệ.");
      const centerId = await currentCenterId();
      const [row] = await db.select().from(zbsTemplateLibrary).where(and(
        eq(zbsTemplateLibrary.id, parsedId.data),
        eq(zbsTemplateLibrary.centerId, centerId),
      )).limit(1);
      if (!row) throw new ZbsLibraryError(404, "TEMPLATE_NOT_FOUND", "Không tìm thấy mẫu trong trung tâm hiện tại.");
      return res.json(row);
    } catch (error) { return reportError(res, error); }
  });

  app.post("/api/settings/zbs-template-library", async (req, res) => {
    try {
      if (!(await permission(req, res, "write"))) return;
      const draft = prepareZbsLibraryDraft(req.body);
      const centerId = await currentCenterId();
      const [row] = await db.insert(zbsTemplateLibrary).values({
        centerId,
        ...draft,
      }).returning();
      return res.status(201).json(row);
    } catch (error) { return reportError(res, error); }
  });

  app.put("/api/settings/zbs-template-library/:id", async (req, res) => {
    try {
      if (!(await permission(req, res, "write"))) return;
      const parsedId = idSchema.safeParse(req.params.id);
      if (!parsedId.success) throw new ZbsLibraryError(400, "INVALID_ID", "Mã mẫu không hợp lệ.");
      const input = zbsLibraryInputSchema.parse(req.body);
      const centerId = await currentCenterId();
      const [existing] = await db.select({ version: zbsTemplateLibrary.version })
        .from(zbsTemplateLibrary).where(and(
          eq(zbsTemplateLibrary.id, parsedId.data),
          eq(zbsTemplateLibrary.centerId, centerId),
          eq(zbsTemplateLibrary.status, "draft"),
        )).limit(1);
      if (!existing) throw new ZbsLibraryError(404, "DRAFT_NOT_FOUND", "Không tìm thấy bản nháp trong trung tâm hiện tại.");
      const [row] = await db.update(zbsTemplateLibrary).set({
        ...input,
        version: existing.version + 1,
        updatedAt: new Date(),
      }).where(and(
        eq(zbsTemplateLibrary.id, parsedId.data),
        eq(zbsTemplateLibrary.centerId, centerId),
      )).returning();
      return res.json(row);
    } catch (error) { return reportError(res, error); }
  });

  app.post("/api/settings/zbs-template-library/:id/duplicate", async (req, res) => {
    try {
      if (!(await permission(req, res, "write"))) return;
      const parsedId = idSchema.safeParse(req.params.id);
      if (!parsedId.success) throw new ZbsLibraryError(400, "INVALID_ID", "Mã mẫu không hợp lệ.");
      const code = z.string().trim().min(1).max(100).parse(req.body?.code);
      const centerId = await currentCenterId();
      const [source] = await db.select().from(zbsTemplateLibrary).where(and(
        eq(zbsTemplateLibrary.id, parsedId.data),
        eq(zbsTemplateLibrary.centerId, centerId),
      )).limit(1);
      if (!source) throw new ZbsLibraryError(404, "TEMPLATE_NOT_FOUND", "Không tìm thấy mẫu trong trung tâm hiện tại.");
      const [row] = await db.insert(zbsTemplateLibrary).values({
        centerId,
        code,
        name: `${source.name} - Bản sao`,
        notificationType: source.notificationType,
        title: source.title,
        components: source.components,
        variables: source.variables,
        version: 1,
        status: "draft",
        compatibilityStatus: "unverified",
      }).returning();
      return res.status(201).json(row);
    } catch (error) { return reportError(res, error); }
  });

  app.delete("/api/settings/zbs-template-library/:id", async (req, res) => {
    try {
      if (!(await permission(req, res, "delete"))) return;
      const parsedId = idSchema.safeParse(req.params.id);
      if (!parsedId.success) throw new ZbsLibraryError(400, "INVALID_ID", "Mã mẫu không hợp lệ.");
      const centerId = await currentCenterId();
      const [row] = await db.update(zbsTemplateLibrary).set({
        status: "archived",
        version: sql`${zbsTemplateLibrary.version} + 1`,
        updatedAt: new Date(),
      }).where(and(
        eq(zbsTemplateLibrary.id, parsedId.data),
        eq(zbsTemplateLibrary.centerId, centerId),
      )).returning();
      if (!row) throw new ZbsLibraryError(404, "TEMPLATE_NOT_FOUND", "Không tìm thấy mẫu trong trung tâm hiện tại.");
      return res.json(row);
    } catch (error) { return reportError(res, error); }
  });
}
