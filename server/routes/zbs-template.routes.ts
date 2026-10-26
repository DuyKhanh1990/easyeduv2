import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import {
  centerConfig,
  invoicePaymentSchedule,
  invoices,
  locations,
  notificationTemplates,
  studentNotificationChannels,
  students,
  zaloOaConfigs,
  zbsTemplateMappings,
} from "@shared/schema";
import approvedTuitionNotice from "../../shared/zbs-approved-templates/tuition-notice-651693.json";
import {
  INVOICE_VISIBILITY_PERMISSIONS,
  invoiceStatusMatchesVisibilityPermission,
} from "@shared/invoice-visibility-permissions";
import { db } from "../storage/base";
import { getEffectivePermissions } from "../storage/permissions.storage";
import { decrypt } from "../lib/encryption";
import { refreshZaloOaToken } from "../services/zalo-token-refresh.service";
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

async function authorizeInvoiceZbsSend(req: Request, res: Response) {
  if (req.isStudent) {
    res.status(403).json({ code: "FORBIDDEN", message: "Học viên không được gửi thông báo hóa đơn." });
    return false;
  }
  if (isPrivileged(req)) return true;
  const permission = await getEffectivePermissions(req.roleIds ?? [], "/invoices");
  if (!permission.canEdit) {
    res.status(403).json({ code: "FORBIDDEN", message: "Bạn không có quyền gửi thông báo từ hóa đơn." });
    return false;
  }
  return true;
}

function normalizeZaloPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("84")) return digits;
  if (digits.startsWith("0")) return `84${digits.slice(1)}`;
  return digits;
}

function isZaloTokenError(errorCode: unknown, message: unknown) {
  const code = Number(errorCode);
  const detail = String(message ?? "");
  return [-155, -216, 216, -124].includes(code)
    || /access[\s_-]?token.*invalid|invalid.*access[\s_-]?token|token.*expired/i.test(detail);
}

async function getInvoiceZbsContext(req: Request, invoiceId: string, scheduleId?: string) {
  const [invoice] = await db
    .select({
      id: invoices.id,
      locationId: invoices.locationId,
      studentId: invoices.studentId,
      invoiceCode: invoices.code,
      type: invoices.type,
      category: invoices.category,
      status: invoices.status,
      remainingAmount: invoices.remainingAmount,
      note: invoices.note,
      description: invoices.description,
      studentName: students.fullName,
      studentPhone: students.phone,
      parentPhone: students.parentPhone,
    })
    .from(invoices)
    .leftJoin(students, eq(students.id, invoices.studentId))
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!invoice || !invoice.locationId) {
    throw new ZbsTemplateManagementError(404, "INVOICE_NOT_FOUND", "Không tìm thấy hóa đơn.");
  }
  if (!isPrivileged(req) && !(req.allowedLocationIds ?? []).includes(invoice.locationId)) {
    throw new ZbsTemplateManagementError(404, "INVOICE_NOT_FOUND", "Không tìm thấy hóa đơn.");
  }
  if (invoice.type !== "Thu" || !invoice.studentId || !invoice.studentName) {
    throw new ZbsTemplateManagementError(422, "INVOICE_NOT_PAYABLE", "Chỉ gửi thông báo học phí cho hóa đơn thu có học viên.");
  }
  if (!["unpaid", "partial", "debt"].includes(invoice.status)) {
    throw new ZbsTemplateManagementError(422, "INVOICE_NOT_PAYABLE", "Chỉ gửi cho hóa đơn còn số dư chưa thanh toán.");
  }

  let installment: { code: string | null; amount: string; status: string } | null = null;
  if (scheduleId) {
    const [row] = await db
      .select({
        code: invoicePaymentSchedule.code,
        amount: invoicePaymentSchedule.amount,
        status: invoicePaymentSchedule.status,
      })
      .from(invoicePaymentSchedule)
      .where(and(
        eq(invoicePaymentSchedule.id, scheduleId),
        eq(invoicePaymentSchedule.invoiceId, invoiceId),
      ))
      .limit(1);
    if (!row || row.status !== "unpaid") {
      throw new ZbsTemplateManagementError(422, "INSTALLMENT_NOT_PAYABLE", "Chỉ gửi được đợt thanh toán chưa thanh toán.");
    }
    installment = row;
  }

  const [oa] = await db.select({
    id: zaloOaConfigs.id,
    locationId: zaloOaConfigs.locationId,
    accessTokenEncrypted: zaloOaConfigs.accessTokenEncrypted,
    tokenExpiredAt: zaloOaConfigs.tokenExpiredAt,
    isConnected: zaloOaConfigs.isConnected,
  }).from(zaloOaConfigs).where(eq(zaloOaConfigs.locationId, invoice.locationId)).limit(1);
  if (!oa?.isConnected) {
    throw new ZbsTemplateManagementError(409, "OA_NOT_CONNECTED", "Cơ sở của hóa đơn chưa kết nối Zalo OA.");
  }
  if (!oa.accessTokenEncrypted) {
    throw new ZbsTemplateManagementError(424, "ZBS_TOKEN_MISSING", "OA chưa có access token.");
  }
  const [center] = await db.select({ id: centerConfig.id }).from(centerConfig).limit(1);
  const [channel] = center
    ? await db.select({
        zaloUserId: studentNotificationChannels.zaloUserId,
        isFollowed: studentNotificationChannels.isFollowed,
        hasInteracted: studentNotificationChannels.hasInteracted,
      }).from(studentNotificationChannels).where(and(
        eq(studentNotificationChannels.studentId, invoice.studentId),
        eq(studentNotificationChannels.centerId, center.id),
      )).limit(1)
    : [];
  const phoneOptions = [
    invoice.parentPhone ? { kind: "parent" as const, label: "Phụ huynh", phone: normalizeZaloPhone(invoice.parentPhone) } : null,
    invoice.studentPhone ? { kind: "student" as const, label: "Học viên", phone: normalizeZaloPhone(invoice.studentPhone) } : null,
  ].filter((item): item is { kind: "parent" | "student"; label: string; phone: string } => !!item?.phone);
  const templateData = buildZbsPaymentTemplateData({
    invoiceCode: invoice.invoiceCode,
    installmentCode: installment?.code,
    studentName: invoice.studentName,
    category: invoice.category,
    remainingAmount: invoice.remainingAmount,
    installmentAmount: installment?.amount,
    note: invoice.note,
    description: invoice.description,
  });

  return {
    invoice,
    installment,
    oa,
    templateId: String(approvedTuitionNotice.template.brandTemplateId),
    templateName: approvedTuitionNotice.template.name,
    templateData,
    phoneOptions,
    uid: channel?.isFollowed && channel?.hasInteracted ? channel.zaloUserId : null,
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
    return res.status(error.status).json({
      code: error.code,
      message: error.message,
      ...(error.providerCode !== undefined ? { providerCode: error.providerCode } : {}),
    });
  }
  console.error("[ZBSTemplate] request failed:", error);
  return res.status(500).json({ code: "INTERNAL_ERROR", message: "Không thể xử lý cấu hình template ZBS." });
}

export function registerZbsTemplateRoutes(app: Express) {
  app.get("/api/notification/zbs/invoices/:invoiceId/preview", async (req, res) => {
    try {
      if (!(await authorizeInvoiceZbsSend(req, res))) return;
      const scheduleId = typeof req.query.scheduleId === "string" ? req.query.scheduleId : undefined;
      const context = await getInvoiceZbsContext(req, req.params.invoiceId, scheduleId);
      return res.json({
        invoice: {
          id: context.invoice.id,
          code: context.installment?.code || context.invoice.invoiceCode,
          studentId: context.invoice.studentId,
          studentName: context.invoice.studentName,
          amount: context.templateData.transfer_amount,
        },
        template: { id: context.templateId, name: context.templateName, data: context.templateData },
        recipients: {
          phones: context.phoneOptions,
          uid: context.uid,
        },
      });
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.post("/api/notification/zbs/invoices/:invoiceId/send", async (req, res) => {
    try {
      if (!(await authorizeInvoiceZbsSend(req, res))) return;
      const scheduleId = typeof req.body?.scheduleId === "string" ? req.body.scheduleId : undefined;
      const method = req.body?.method;
      const context = await getInvoiceZbsContext(req, req.params.invoiceId, scheduleId);
      if (method !== "phone" && method !== "uid") {
        return res.status(400).json({ code: "INVALID_RECIPIENT_METHOD", message: "Chọn số điện thoại hoặc UID để gửi." });
      }

      const recipient: Record<string, string> = {};
      let recipientLabel = "";
      if (method === "uid") {
        if (!context.uid) {
          return res.status(422).json({ code: "ZALO_UID_NOT_LINKED", message: "Học viên chưa có UID Zalo đã liên kết với OA." });
        }
        recipient.user_id = context.uid;
        recipientLabel = "UID Zalo đã liên kết";
      } else {
        const phoneKind = req.body?.phoneKind;
        const phoneOption = context.phoneOptions.find((item) => item.kind === phoneKind);
        if (!phoneOption) {
          return res.status(422).json({ code: "PHONE_NOT_AVAILABLE", message: "Số điện thoại đã chọn không còn hợp lệ cho hóa đơn này." });
        }
        recipient.phone = phoneOption.phone;
        recipientLabel = `${phoneOption.label}: ${phoneOption.phone}`;
      }

      if (!context.oa.accessTokenEncrypted) {
        throw new ZbsTemplateManagementError(424, "ZBS_TOKEN_MISSING", "OA chưa có access token.");
      }
      let accessToken: string;
      try {
        accessToken = decrypt(context.oa.accessTokenEncrypted);
      } catch {
        throw new ZbsTemplateManagementError(424, "ZBS_TOKEN_UNREADABLE", "Không giải mã được access token của OA.");
      }
      const trackingId = randomUUID().replace(/-/g, "");
      const requestBody = JSON.stringify({
        ...recipient,
        template_id: context.templateId,
        template_data: context.templateData,
        ...(method === "phone" ? { tracking_id: trackingId } : {}),
      });
      const sendOnce = async (token: string) => {
        let response: Awaited<ReturnType<typeof fetch>>;
        try {
          const endpoint = method === "uid"
            ? "https://openapi.zalo.me/v3.0/oa/message/template"
            : "https://business.openapi.zalo.me/message/template";
          response = await fetch(endpoint, {
            method: "POST",
            headers: { access_token: token, "Content-Type": "application/json", Accept: "application/json" },
            body: requestBody,
          });
        } catch {
          throw new ZbsTemplateManagementError(502, "ZBS_SEND_UNAVAILABLE", "Không kết nối được dịch vụ gửi tin ZBS của Zalo.");
        }
        const body = await response.json().catch(() => null) as any;
        return { response, body };
      };

      let attempt = await sendOnce(accessToken);
      if (isZaloTokenError(attempt.body?.error, attempt.body?.message)) {
        const refresh = await refreshZaloOaToken({
          configId: context.oa.id,
          reason: "token_expired",
          accessTokenUsed: accessToken,
        });
        if (refresh.status === "refreshed" || refresh.status === "already_refreshed") {
          if (refresh.accessToken === accessToken) {
            throw new ZbsTemplateManagementError(
              424,
              "ZBS_TOKEN_INVALID",
              "Token OA bị Zalo từ chối và chưa có token mới. Hãy kết nối lại Zalo OA rồi thử gửi lại.",
            );
          }
          attempt = await sendOnce(refresh.accessToken);
          if (isZaloTokenError(attempt.body?.error, attempt.body?.message)) {
            throw new ZbsTemplateManagementError(
              424,
              "ZBS_TOKEN_INVALID_AFTER_REFRESH",
              "Zalo vẫn từ chối token sau khi làm mới. Hãy kết nối lại OA và kiểm tra OA/cơ sở của hóa đơn.",
            );
          }
        } else {
          throw new ZbsTemplateManagementError(
            424,
            "ZBS_TOKEN_REFRESH_FAILED",
            "Token OA không còn hợp lệ và hệ thống không làm mới được. Hãy kết nối lại Zalo OA rồi thử gửi lại.",
          );
        }
      }

      const { response, body: result } = attempt;
      if (!response.ok || !result || Number(result.error ?? -1) !== 0) {
        const detail = String(result?.message ?? `HTTP ${response.status}`);
        const isPermissionError = /token|permission|unauthori[sz]ed/i.test(detail);
        throw new ZbsTemplateManagementError(
          isPermissionError ? 424 : 502,
          isPermissionError ? "ZBS_SEND_PERMISSION_DENIED" : "ZBS_SEND_FAILED",
          `Zalo chưa gửi được tin${result?.error !== undefined ? ` (mã lỗi Zalo: ${result.error})` : ""}: ${detail}`,
          result?.error,
        );
      }
      return res.json({
        success: true,
        recipientMethod: method,
        recipientLabel,
        messageId: result?.data?.msg_id ?? result?.data?.message_id ?? null,
        sentAt: result?.data?.sent_time ?? result?.sent_time ?? null,
      });
    } catch (error) {
      return sendError(res, error);
    }
  });

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
