export const ZBS_TEMPLATE_LIST_URL = "https://business.openapi.zalo.me/template/all";

export interface ZbsTemplate {
  templateId: string;
  templateName: string;
  createdTime?: number;
  status: string;
  templateQuality?: string;
}

export interface ZbsTemplatePage {
  data: ZbsTemplate[];
  total: number | null;
}

export interface ZbsTemplateAccessScope {
  isSuperAdmin: boolean;
  allowedLocationIds: string[];
}

export interface ZbsOaRecord {
  id: string;
  locationId: string | null;
  accessTokenEncrypted: string | null;
  tokenExpiredAt: Date | null;
  isConnected: boolean;
}

export interface ZbsTemplateMappingRecord {
  id: string;
  zaloOaConfigId: string;
  notificationType: string;
  templateId: string | null;
  templateName: string | null;
  templateStatus: string | null;
  compatibilityStatus: string;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ZbsTemplateRepository {
  findOaConfig(id: string): Promise<ZbsOaRecord | null>;
  findNotificationType(code: string): Promise<boolean>;
  listMappings(zaloOaConfigId: string): Promise<ZbsTemplateMappingRecord[]>;
  upsertMapping(input: {
    zaloOaConfigId: string;
    notificationType: string;
    templateId: string;
    templateName: string;
    templateStatus: string;
    compatibilityStatus: "compatibility_unverified";
    isEnabled: false;
  }): Promise<ZbsTemplateMappingRecord>;
}

export class ZbsTemplateManagementError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly providerCode?: string | number,
    public readonly providerHttpStatus?: number,
    public readonly endpoint?: string,
    public readonly providerMessage?: string,
  ) {
    super(message);
    this.name = "ZbsTemplateManagementError";
  }
}

export function hasZbsTemplateSettingsPermission(input: {
  isStudent: boolean;
  isPrivileged: boolean;
  canView: boolean;
  canViewAll: boolean;
  canCreate: boolean;
  canEdit: boolean;
  write: boolean;
}) {
  if (input.isStudent) return false;
  if (input.isPrivileged) return true;
  return input.write
    ? input.canCreate || input.canEdit
    : input.canView || input.canViewAll || input.canEdit;
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type DecryptToken = (ciphertext: string) => string;

function throwApiError(response: Response, body: any, detail: string): never {
  const providerCode = body?.error ?? body?.code;
  const providerMessage = String(body?.message ?? detail);
  if (response.status === 401 || response.status === 403) {
    throw new ZbsTemplateManagementError(
      424, "ZBS_TOKEN_INVALID",
      `Zalo từ chối quyền đọc danh sách template: ${providerMessage}`,
      providerCode, response.status, ZBS_TEMPLATE_LIST_URL, providerMessage,
    );
  }
  throw new ZbsTemplateManagementError(
    502,
    "ZBS_API_ERROR",
    `Zalo không trả được danh sách template (HTTP ${response.status}): ${detail}`,
    providerCode,
    response.status,
    ZBS_TEMPLATE_LIST_URL,
    providerMessage,
  );
}

export async function fetchZbsTemplatePage(
  accessToken: string,
  input: { offset: number; limit: number; status?: number },
  fetcher: FetchLike = fetch,
): Promise<ZbsTemplatePage> {
  const url = new URL(ZBS_TEMPLATE_LIST_URL);
  url.searchParams.set("offset", String(input.offset));
  url.searchParams.set("limit", String(input.limit));
  if (input.status !== undefined) url.searchParams.set("status", String(input.status));

  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      headers: {
        access_token: accessToken,
        Accept: "application/json",
      },
    });
  } catch (error) {
    const providerMessage = error instanceof Error ? error.message : String(error);
    throw new ZbsTemplateManagementError(
      502, "ZBS_API_UNAVAILABLE", "Không kết nối được API danh sách template của Zalo.",
      undefined, undefined, ZBS_TEMPLATE_LIST_URL, providerMessage,
    );
  }

  let body: any;
  try {
    body = await response.json();
  } catch {
    throwApiError(response, null, "phản hồi không phải JSON hợp lệ");
  }

  if (!response.ok) throwApiError(response, body, String(body?.message ?? "lỗi từ API Zalo"));
  if (Number(body?.error ?? 0) !== 0) {
    const detail = String(body?.message ?? `mã lỗi ${body?.error}`);
    if (/token|access.?token|unauthori[sz]ed|permission/i.test(detail)) {
      throw new ZbsTemplateManagementError(
        424, "ZBS_TOKEN_INVALID", `Zalo từ chối quyền đọc danh sách template: ${detail}`,
        body?.error, response.status, ZBS_TEMPLATE_LIST_URL, detail,
      );
    }
    throw new ZbsTemplateManagementError(
      502, "ZBS_API_ERROR", `Zalo báo lỗi khi đọc template: ${detail}`,
      body?.error, response.status, ZBS_TEMPLATE_LIST_URL, detail,
    );
  }
  if (!Array.isArray(body?.data)) {
    throw new ZbsTemplateManagementError(502, "ZBS_INVALID_RESPONSE", "Phản hồi danh sách template của Zalo không đúng định dạng.");
  }

  const templates: ZbsTemplate[] = [];
  for (const item of body.data) {
    if (item?.templateId == null || !String(item.templateId).trim()) continue;
    templates.push({
      templateId: String(item.templateId),
      templateName: String(item.templateName ?? ""),
      ...(Number.isFinite(Number(item.createdTime)) ? { createdTime: Number(item.createdTime) } : {}),
      status: String(item.status ?? "UNKNOWN").toUpperCase(),
      ...(item.templateQuality ? { templateQuality: String(item.templateQuality).toUpperCase() } : {}),
    });
  }
  return {
    data: templates,
    total: Number.isFinite(Number(body?.metadata?.total)) ? Number(body.metadata.total) : null,
  };
}

export class ZbsTemplateManagementService {
  constructor(
    private readonly repository: ZbsTemplateRepository,
    private readonly decryptToken: DecryptToken,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  async listTemplates(
    oaConfigId: string,
    scope: ZbsTemplateAccessScope,
    input: { offset: number; limit: number; status?: number },
  ): Promise<ZbsTemplatePage> {
    const { accessToken } = await this.resolveOaToken(oaConfigId, scope);
    return fetchZbsTemplatePage(accessToken, input, this.fetcher);
  }

  async listMappings(
    oaConfigId: string,
    scope: ZbsTemplateAccessScope,
  ): Promise<ZbsTemplateMappingRecord[]> {
    await this.resolveOaToken(oaConfigId, scope, { needsToken: false, requireConnected: false });
    return this.repository.listMappings(oaConfigId);
  }

  async saveMapping(
    oaConfigId: string,
    scope: ZbsTemplateAccessScope,
    input: { notificationType: string; templateId: string },
  ): Promise<ZbsTemplateMappingRecord> {
    const type = input.notificationType.trim();
    const templateId = input.templateId.trim();
    if (!type || type.length > 100 || !templateId || templateId.length > 100) {
      throw new ZbsTemplateManagementError(400, "INVALID_MAPPING", "Mã loại thông báo và template_id là bắt buộc (tối đa 100 ký tự).");
    }

    const { accessToken } = await this.resolveOaToken(oaConfigId, scope);
    if (!(await this.repository.findNotificationType(type))) {
      throw new ZbsTemplateManagementError(404, "NOTIFICATION_TYPE_NOT_FOUND", "Mã loại thông báo không tồn tại trong EasyEdu.");
    }

    let template: ZbsTemplate | undefined;
    let offset = 0;
    let total: number | null = null;
    for (let pageCount = 0; pageCount < 100; pageCount += 1) {
      const page = await fetchZbsTemplatePage(accessToken, { offset, limit: 100 }, this.fetcher);
      template = page.data.find((item) => item.templateId === templateId);
      if (template) break;
      total = page.total ?? total;
      offset += page.data.length;
      if (page.data.length < 100 || (total !== null && offset >= total)) break;
    }
    if (!template) {
      throw new ZbsTemplateManagementError(
        422,
        "ZBS_TEMPLATE_NOT_IN_OA",
        "template_id không có trong danh sách của OA đã chọn.",
      );
    }
    return this.repository.upsertMapping({
      zaloOaConfigId: oaConfigId,
      notificationType: type,
      templateId: template.templateId,
      templateName: template.templateName,
      templateStatus: template.status,
      compatibilityStatus: "compatibility_unverified",
      isEnabled: false,
    });
  }

  private async resolveOaToken(
    oaConfigId: string,
    scope: ZbsTemplateAccessScope,
    options: { needsToken?: boolean; requireConnected?: boolean } = {},
  ): Promise<{ accessToken: string }> {
    const config = await this.repository.findOaConfig(oaConfigId);
    if (!config) {
      throw new ZbsTemplateManagementError(404, "OA_NOT_FOUND", "Không tìm thấy OA trong trung tâm hiện tại.");
    }
    if (!config.locationId || (!scope.isSuperAdmin && !scope.allowedLocationIds.includes(config.locationId))) {
      throw new ZbsTemplateManagementError(403, "OA_LOCATION_FORBIDDEN", "Bạn không có quyền truy cập OA thuộc cơ sở này.");
    }
    if (options.requireConnected !== false && !config.isConnected) {
      throw new ZbsTemplateManagementError(409, "OA_NOT_CONNECTED", "OA này hiện không được kết nối.");
    }
    if (options.needsToken === false) return { accessToken: "" };
    if (!config.accessTokenEncrypted) {
      throw new ZbsTemplateManagementError(424, "ZBS_TOKEN_MISSING", "OA chưa có access token.");
    }
    if (config.tokenExpiredAt && config.tokenExpiredAt.getTime() <= Date.now()) {
      throw new ZbsTemplateManagementError(424, "ZBS_TOKEN_EXPIRED", "Access token của OA đã hết hạn; hãy kết nối lại OA.");
    }

    try {
      const accessToken = this.decryptToken(config.accessTokenEncrypted);
      if (!accessToken.trim()) throw new Error("empty token");
      return { accessToken };
    } catch {
      throw new ZbsTemplateManagementError(424, "ZBS_TOKEN_UNREADABLE", "Không giải mã được access token của OA.");
    }
  }
}
