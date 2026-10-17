import type { Express, Request, Response } from "express";
import { and, asc, eq } from "drizzle-orm";
import {
  centerConfig,
  invoicePaymentSchedule,
  invoices,
  locations,
  notificationTemplates,
  students,
  zaloOaConfigs,
  zbsTemplateMappings,
} from "@shared/schema";
import {
  INVOICE_VISIBILITY_PERMISSIONS,
  invoiceStatusMatchesVisibilityPermission,
} from "@shared/invoice-visibility-permissions";
import { db } from "../storage/base";
import { getEffectivePermissions } from "../storage/permissions.storage";
import { decrypt } from "../lib/encryption";
import { buildZbsPaymentTemplateData } from "../services/zbs-payment-template-payload";
import {
  hasZbsTemplateSettingsPermission,
  ZbsTemplateManagementError,
  ZbsTemplateManagementService,
  type ZbsTemplateRepository,
} from "../services/zbs-template-management.service";

const ZBS_SETTINGS_RESOURCE = "/settings#providers";
const mappingRepository: ZbsTemplateRepository = {
  async findOaConfig(id) {
    const [center] = await db.select({ id: centerConfig.id }).from(centerConfig).limit(1);
    if (!center) return null;
    const [row] = await db
      .select({
        id: zaloOaConfigs.id,
        locationId: zaloOaConfigs.locationId,
        accessTokenEncrypted: zaloOaConfigs.accessTokenEncrypted,
        tokenExpiredAt: zaloOaConfigs.tokenExpiredAt,
        isConnected: zaloOaConfigs.isConnected,
      })
      .from(zaloOaConfigs)
      .innerJoin(locations, eq(locations.id, zaloOaConfigs.locationId))
      .where(eq(zaloOaConfigs.id, id))
      .limit(1);
    return row ?? null;
  },
  async findNotificationType(code) {
    const [row] = await db
      .select({ id: notificationTemplates.id })
      .from(notificationTemplates)
      .where(eq(notificationTemplates.code, code))
      .limit(1);
    return Boolean(row);
  },
  async listMappings(oaConfigId) {
    return db
      .select()
      .from(zbsTemplateMappings)
      .where(eq(zbsTemplateMappings.zaloOaConfigId, oaConfigId))
      .orderBy(asc(zbsTemplateMappings.notificationType));
  },
  async upsertMapping(input) {
    const [row] = await db
      .insert(zbsTemplateMappings)
      .values(input)
      .onConflictDoUpdate({
        target: [
          zbsTemplateMappings.zaloOaConfigId,
          zbsTemplateMappings.notificationType,
        ],
        set: {
          templateId: input.templateId,
          templateName: input.templateName,
          templateStatus: input.templateStatus,
          compatibilityStatus: "compatibility_unverified",
          isEnabled: false,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  },
};

const zbsTemplateService = new ZbsTemplateManagementService(mappingRepository, decrypt);

function isPrivileged(req: Request) {
  return req.isSuperAdmin === true || (req.user as any)?.username === "admin";
}

async function authorizeZbsSettings(req: Request, res: Response, write: boolean) {
  const permission = isPrivileged(req)
    ? null
    : await getEffectivePermissions(req.roleIds ?? [], ZBS_SETTINGS_RESOURCE);
  const allowed = hasZbsTemplateSettingsPermission({
    isStudent: req.isStudent === true,
    isPrivileged: isPrivileged(req),
    canView: permission?.canView ?? false,
    canViewAll: permission?.canViewAll ?? false,
    canCreate: permission?.canCreate ?? false,
    canEdit: permission?.canEdit ?? false,
    write,
  });
  if (!allowed) {
    res.status(403).json({ code: "FORBIDDEN", message: "Bạn không có quyền truy cập cấu hình nhà cung cấp." });
    return false;
  }
  return true;
}

function getScope(req: Request) {
  return {
    isSuperAdmin: isPrivileged(req),
    allowedLocationIds: req.allowedLocationIds ?? [],
  };
}

async function canViewInvoiceForPreview(req: Request, type: string, status: string) {
  if (isPrivileged(req)) return true;
  const applicable = INVOICE_VISIBILITY_PERMISSIONS.filter(
    (permission) =>
      permission.type === type &&
      invoiceStatusMatchesVisibilityPermission(status, permission.status),
  );
  const permissions = await Promise.all(
    applicable.map((permission) =>
      getEffectivePermissions(req.roleIds ?? [], permission.resource),
    ),
  );
  return permissions.some((permission) => permission.canView);
}

function parsePagination(req: Request) {
  const offset = Number(req.query.offset ?? 0);
  const limit = Number(req.query.limit ?? 100);
  const rawStatus = req.query.status;
  const status = rawStatus === undefined ? undefined : Number(rawStatus);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new ZbsTemplateManagementError(400, "INVALID_OFFSET", "offset phải là số nguyên không âm.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ZbsTemplateManagementError(400, "INVALID_LIMIT", "limit phải nằm trong khoảng 1–100.");
  }
  if (status !== undefined && ![1, 2, 3, 4].includes(status)) {
    throw new ZbsTemplateManagementError(400, "INVALID_STATUS", "status chỉ nhận giá trị 1, 2, 3 hoặc 4.");
  }
  return { offset, limit, status };
}

function sendError(res: Response, error: unknown) {
  if (error instanceof ZbsTemplateManagementError) {
    return res.status(error.status).json({ code: error.code, message: error.message });
  }
  console.error("[ZBSTemplate] request failed:", error);
  return res.status(500).json({ code: "INTERNAL_ERROR", message: "Không thể xử lý cấu hình template ZBS." });
}

export function registerZbsTemplateRoutes(app: Express) {
  app.get("/api/notification/zbs/oa/:oaConfigId/templates", async (req, res) => {
    try {
      if (!(await authorizeZbsSettings(req, res, false))) return;
      const pagination = parsePagination(req);
      const result = await zbsTemplateService.listTemplates(
        req.params.oaConfigId,
        getScope(req),
        pagination,
      );
      return res.json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.get("/api/notification/zbs/oa/:oaConfigId/mappings", async (req, res) => {
    try {
      if (!(await authorizeZbsSettings(req, res, false))) return;
      const rows = await zbsTemplateService.listMappings(req.params.oaConfigId, getScope(req));
      return res.json(rows);
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.put("/api/notification/zbs/oa/:oaConfigId/mappings/:notificationType", async (req, res) => {
    try {
      if (!(await authorizeZbsSettings(req, res, true))) return;
      const templateId = typeof req.body?.templateId === "string" ? req.body.templateId : "";
      const mapping = await zbsTemplateService.saveMapping(
        req.params.oaConfigId,
        getScope(req),
        { notificationType: req.params.notificationType, templateId },
      );
      return res.json(mapping);
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.post("/api/notification/zbs/oa/:oaConfigId/payload-preview", async (req, res) => {
    try {
      if (!(await authorizeZbsSettings(req, res, false))) return;
      const installmentCode =
        typeof req.body?.installmentCode === "string"
          ? req.body.installmentCode.trim()
          : "";
      if (!installmentCode || installmentCode.length > 100) {
        return res.status(400).json({
          code: "INVALID_INSTALLMENT_CODE",
          message: "Nhập mã hóa đơn hoặc mã đợt thanh toán hợp lệ.",
        });
      }

      const oaConfig = await mappingRepository.findOaConfig(req.params.oaConfigId);
      if (!oaConfig?.locationId) {
        return res.status(404).json({
          code: "OA_NOT_FOUND",
          message: "Không tìm thấy OA trong trung tâm hiện tại.",
        });
      }
      if (
        !isPrivileged(req) &&
        !getScope(req).allowedLocationIds.includes(oaConfig.locationId)
      ) {
        return res.status(403).json({
          code: "OA_LOCATION_FORBIDDEN",
          message: "Bạn không có quyền truy cập OA thuộc cơ sở này.",
        });
      }

      const [row] = await db
        .select({
          invoiceCode: invoices.code,
          installmentCode: invoicePaymentSchedule.code,
          invoiceType: invoices.type,
          category: invoices.category,
          invoiceStatus: invoices.status,
          installmentStatus: invoicePaymentSchedule.status,
          invoiceRemainingAmount: invoices.remainingAmount,
          installmentAmount: invoicePaymentSchedule.amount,
          invoiceNote: invoices.note,
          invoiceDescription: invoices.description,
          studentName: students.fullName,
          locationId: invoices.locationId,
        })
        .from(invoicePaymentSchedule)
        .innerJoin(invoices, eq(invoicePaymentSchedule.invoiceId, invoices.id))
        .leftJoin(students, eq(invoices.studentId, students.id))
        .where(
          and(
            eq(invoicePaymentSchedule.code, installmentCode),
            eq(invoices.locationId, oaConfig.locationId),
          ),
        )
        .limit(1);

      if (!row) {
        return res.status(404).json({
          code: "INSTALLMENT_NOT_FOUND",
          message: "Không tìm thấy mã đợt tại cơ sở của OA đã chọn.",
        });
      }
      if (
        !isPrivileged(req) &&
        !getScope(req).allowedLocationIds.includes(row.locationId ?? "")
      ) {
        return res.status(404).json({
          code: "INSTALLMENT_NOT_FOUND",
          message: "Không tìm thấy mã đợt tại cơ sở của OA đã chọn.",
        });
      }
      if (
        !(await canViewInvoiceForPreview(req, row.invoiceType, row.invoiceStatus))
      ) {
        return res.status(404).json({
          code: "INSTALLMENT_NOT_FOUND",
          message: "Không tìm thấy mã đợt tại cơ sở của OA đã chọn.",
        });
      }
      if (
        row.invoiceType !== "Thu" ||
        row.installmentStatus !== "unpaid" ||
        !["unpaid", "partial"].includes(row.invoiceStatus) ||
        !row.studentName
      ) {
        return res.status(422).json({
          code: "INSTALLMENT_NOT_PAYABLE",
          message: "Chỉ xem trước được đợt thu chưa thanh toán có học viên.",
        });
      }

      const templateData = buildZbsPaymentTemplateData({
        invoiceCode: row.invoiceCode,
        installmentCode: row.installmentCode,
        studentName: row.studentName,
        category: row.category,
        remainingAmount: row.invoiceRemainingAmount,
        installmentAmount: row.installmentAmount,
        note: row.invoiceNote,
        description: row.invoiceDescription,
      });

      return res.json({
        invoice: {
          invoiceCode: row.invoiceCode,
          installmentCode: row.installmentCode,
          category: row.category,
          installmentAmount: Number(row.installmentAmount),
          invoiceRemainingAmount: Number(row.invoiceRemainingAmount),
        },
        templateData,
        sent: false,
      });
    } catch (error) {
      return sendError(res, error);
    }
  });
}
