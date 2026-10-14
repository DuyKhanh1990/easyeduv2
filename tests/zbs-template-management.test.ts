import { describe, expect, it, vi } from "vitest";
import {
  hasZbsTemplateSettingsPermission,
  ZbsTemplateManagementError,
  ZbsTemplateManagementService,
  type ZbsOaRecord,
  type ZbsTemplateMappingRecord,
  type ZbsTemplateRepository,
} from "../server/services/zbs-template-management.service";

const makeOa = (id: string, locationId = "location-a"): ZbsOaRecord => ({
  id,
  locationId,
  accessTokenEncrypted: `encrypted-${id}`,
  tokenExpiredAt: null,
  isConnected: true,
});

const makeMapping = (
  input: Pick<ZbsTemplateMappingRecord, "zaloOaConfigId" | "notificationType" | "templateId">,
): ZbsTemplateMappingRecord => ({
  id: `mapping-${input.zaloOaConfigId}-${input.notificationType}`,
  templateName: "Test template",
  templateStatus: "ENABLE",
  isEnabled: false,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...input,
});

function makeRepository(oa: ZbsOaRecord | null = makeOa("oa-a")) {
  const upsertMapping = vi.fn(async (input: {
    zaloOaConfigId: string;
    notificationType: string;
    templateId: string;
    templateName: string;
    templateStatus: string;
  }) => makeMapping(input));
  const listMappings = vi.fn(async () => []);
  const repository: ZbsTemplateRepository = {
    findOaConfig: vi.fn(async (id) => oa?.id === id ? oa : null),
    findNotificationType: vi.fn(async (code) => code === "invoice_created"),
    listMappings,
    findMapping: vi.fn(async () => null),
    upsertMapping,
  };
  return { repository, upsertMapping, listMappings };
}

function successfulTemplateResponse(status = "ENABLE") {
  return new Response(JSON.stringify({
    error: 0,
    message: "Success",
    data: [{ templateId: 98765, templateName: "Invoice notice", status }],
    metadata: { total: 1 },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("ZBS template management", () => {
  it("denies students and users without settings access, while honoring admin and settings grants", () => {
    const base = {
      isStudent: false,
      isPrivileged: false,
      canView: false,
      canViewAll: false,
      canCreate: false,
      canEdit: false,
    };
    expect(hasZbsTemplateSettingsPermission({ ...base, write: false })).toBe(false);
    expect(hasZbsTemplateSettingsPermission({ ...base, isStudent: true, isPrivileged: true, write: false })).toBe(false);
    expect(hasZbsTemplateSettingsPermission({ ...base, isPrivileged: true, write: true })).toBe(true);
    expect(hasZbsTemplateSettingsPermission({ ...base, canView: true, write: false })).toBe(true);
    expect(hasZbsTemplateSettingsPermission({ ...base, canCreate: true, write: true })).toBe(true);
    expect(hasZbsTemplateSettingsPermission({ ...base, canView: true, write: true })).toBe(false);
  });

  it("does not request templates for an OA outside the caller's locations or outside the current center", async () => {
    const fetcher = vi.fn(async () => successfulTemplateResponse());
    const { repository, upsertMapping } = makeRepository(makeOa("oa-a", "location-other"));
    const service = new ZbsTemplateManagementService(repository, (value) => value, fetcher);

    await expect(service.listTemplates("oa-a", {
      isSuperAdmin: false,
      allowedLocationIds: ["location-a"],
    }, { offset: 0, limit: 100 })).rejects.toMatchObject({
      status: 403,
      code: "OA_LOCATION_FORBIDDEN",
    });
    await expect(service.listTemplates("oa-from-another-center", {
      isSuperAdmin: true,
      allowedLocationIds: [],
    }, { offset: 0, limit: 100 })).rejects.toMatchObject({
      status: 404,
      code: "OA_NOT_FOUND",
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(upsertMapping).not.toHaveBeenCalled();
  });

  it("uses the selected OA token and stores a mapping against that exact OA", async () => {
    const { repository, upsertMapping } = makeRepository(makeOa("oa-selected"));
    const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("access_token")).toBe("fake-token-oa-selected");
      return successfulTemplateResponse();
    });
    const service = new ZbsTemplateManagementService(
      repository,
      (value) => value.replace("encrypted-", "fake-token-"),
      fetcher,
    );

    const saved = await service.saveMapping("oa-selected", {
      isSuperAdmin: true,
      allowedLocationIds: [],
    }, { notificationType: "invoice_created", templateId: "98765" });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(upsertMapping).toHaveBeenCalledWith(expect.objectContaining({
      zaloOaConfigId: "oa-selected",
      notificationType: "invoice_created",
      templateId: "98765",
      templateStatus: "ENABLE",
    }));
    expect(saved.zaloOaConfigId).toBe("oa-selected");
  });

  it("reads mappings only for the selected OA after checking its location scope", async () => {
    const { repository, listMappings } = makeRepository(makeOa("oa-visible", "location-a"));
    const service = new ZbsTemplateManagementService(repository, (value) => value, vi.fn());
    await service.listMappings("oa-visible", {
      isSuperAdmin: false,
      allowedLocationIds: ["location-a"],
    });
    expect(listMappings).toHaveBeenCalledWith("oa-visible");
    await expect(service.listMappings("oa-visible", {
      isSuperAdmin: false,
      allowedLocationIds: ["location-b"],
    })).rejects.toMatchObject({ status: 403, code: "OA_LOCATION_FORBIDDEN" });
  });

  it("reports unusable templates and never stores them", async () => {
    const { repository, upsertMapping } = makeRepository();
    const service = new ZbsTemplateManagementService(
      repository,
      (value) => value,
      vi.fn(async () => successfulTemplateResponse("DISABLE")),
    );

    await expect(service.saveMapping("oa-a", {
      isSuperAdmin: true,
      allowedLocationIds: [],
    }, { notificationType: "invoice_created", templateId: "98765" })).rejects.toMatchObject({
      status: 422,
      code: "ZBS_TEMPLATE_NOT_USABLE",
    });
    expect(upsertMapping).not.toHaveBeenCalled();
  });

  it("rejects legacy templates that are documented as unsupported for UID delivery", async () => {
    const { repository, upsertMapping } = makeRepository();
    const service = new ZbsTemplateManagementService(
      repository,
      (value) => value,
      vi.fn(async () => new Response(JSON.stringify({
        error: 0,
        data: [{ templateId: 98765, templateName: "Old ZNS template", createdTime: 0, status: "ENABLE" }],
        metadata: { total: 1 },
      }), { status: 200 })),
    );
    await expect(service.saveMapping("oa-a", {
      isSuperAdmin: true,
      allowedLocationIds: [],
    }, { notificationType: "invoice_created", templateId: "98765" })).rejects.toMatchObject({
      status: 422,
      code: "ZBS_TEMPLATE_UID_UNSUPPORTED",
    });
    expect(upsertMapping).not.toHaveBeenCalled();
  });

  it("returns clear errors for unreadable, invalid, and failed API tokens", async () => {
    const tokenDecryptError = new ZbsTemplateManagementService(
      makeRepository().repository,
      () => { throw new Error("bad encrypted token"); },
      vi.fn(),
    );
    await expect(tokenDecryptError.listTemplates("oa-a", {
      isSuperAdmin: true,
      allowedLocationIds: [],
    }, { offset: 0, limit: 10 })).rejects.toMatchObject({
      status: 401,
      code: "ZBS_TOKEN_UNREADABLE",
    });

    for (const testCase of [
      { response: new Response(JSON.stringify({ error: -124, message: "Invalid access token" }), { status: 200 }), code: "ZBS_TOKEN_INVALID" },
      { response: new Response(JSON.stringify({ message: "Server unavailable" }), { status: 503 }), code: "ZBS_API_ERROR" },
    ]) {
      const service = new ZbsTemplateManagementService(
        makeRepository().repository,
        (value) => value,
        vi.fn(async (_url: string | URL, init?: RequestInit) => {
          expect(init?.method).toBe("GET");
          return testCase.response;
        }),
      );
      await expect(service.listTemplates("oa-a", {
        isSuperAdmin: true,
        allowedLocationIds: [],
      }, { offset: 0, limit: 10 })).rejects.toMatchObject({
        code: testCase.code,
      });
    }
  });

  it("rejects every non-GET Zalo request method", async () => {
    const { repository } = makeRepository();
    const methods: string[] = [];
    const service = new ZbsTemplateManagementService(
      repository,
      (value) => value,
      vi.fn(async (_url: string | URL, init?: RequestInit) => {
        methods.push(String(init?.method));
        return successfulTemplateResponse();
      }),
    );
    await service.listTemplates("oa-a", {
      isSuperAdmin: true,
      allowedLocationIds: [],
    }, { offset: 0, limit: 100 });
    expect(methods).toEqual(["GET"]);
    expect(methods.some((method) => method === "POST" || method === "PUT" || method === "DELETE")).toBe(false);
  });

  it("exposes typed errors for route status mapping", () => {
    expect(new ZbsTemplateManagementError(401, "TOKEN", "expired"))
      .toMatchObject({ status: 401, code: "TOKEN" });
  });
});
