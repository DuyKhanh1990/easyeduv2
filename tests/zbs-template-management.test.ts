import { describe, expect, it, vi } from "vitest";
import {
  hasZbsTemplateSettingsPermission,
  ZbsTemplateManagementError,
  ZbsTemplateManagementService,
  type ZbsOaRecord,
  type ZbsTemplateRepository,
} from "../server/services/zbs-template-management.service";

const makeOa = (id: string, locationId = "location-a"): ZbsOaRecord => ({
  id,
  locationId,
  accessTokenEncrypted: `encrypted-${id}`,
  tokenExpiredAt: null,
  isConnected: true,
});

function makeRepository(oa: ZbsOaRecord | null = makeOa("oa-a")) {
  const listMappings = vi.fn(async () => []);
  const upsertMapping = vi.fn(async (input: {
    zaloOaConfigId: string;
    notificationType: string;
    templateId: string;
    templateName: string;
    templateStatus: string;
    compatibilityStatus: "compatibility_unverified";
    isEnabled: false;
  }) => ({
    id: `mapping-${input.zaloOaConfigId}-${input.notificationType}`,
    ...input,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }));
  const repository: ZbsTemplateRepository = {
    findOaConfig: vi.fn(async (id) => oa?.id === id ? oa : null),
    findNotificationType: vi.fn(async (code) => code === "invoice_created"),
    listMappings,
    upsertMapping,
  };
  return { repository, listMappings, upsertMapping };
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

  it("maps only a template returned for the selected OA and saves it unverified and disabled", async () => {
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

    const mapping = await service.saveMapping("oa-selected", {
      isSuperAdmin: true,
      allowedLocationIds: [],
    }, { notificationType: "invoice_created", templateId: "98765" });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(upsertMapping).toHaveBeenCalledWith({
      zaloOaConfigId: "oa-selected",
      notificationType: "invoice_created",
      templateId: "98765",
      templateName: "Invoice notice",
      templateStatus: "ENABLE",
      compatibilityStatus: "compatibility_unverified",
      isEnabled: false,
    });
    expect(mapping.zaloOaConfigId).toBe("oa-selected");
    expect(mapping.compatibilityStatus).toBe("compatibility_unverified");
    expect(mapping.isEnabled).toBe(false);
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

  it("rejects template IDs missing from the selected OA list and never falls back", async () => {
    const { repository, upsertMapping } = makeRepository();
    const service = new ZbsTemplateManagementService(
      repository,
      (value) => value,
      vi.fn(async () => new Response(JSON.stringify({
        error: 0,
        data: [{ templateId: "another-template", templateName: "Other OA template", status: "ENABLE" }],
        metadata: { total: 1 },
      }), { status: 200 })),
    );

    await expect(service.saveMapping("oa-a", {
      isSuperAdmin: true,
      allowedLocationIds: [],
    }, { notificationType: "invoice_created", templateId: "98765" })).rejects.toMatchObject({
      status: 422,
      code: "ZBS_TEMPLATE_NOT_IN_OA",
    });
    expect(upsertMapping).not.toHaveBeenCalled();
  });

  it("stores a legacy-listed template as unverified and disabled without claiming UID support", async () => {
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
    const mapping = await service.saveMapping("oa-a", {
      isSuperAdmin: true,
      allowedLocationIds: [],
    }, { notificationType: "invoice_created", templateId: "98765" });
    expect(mapping.compatibilityStatus).toBe("compatibility_unverified");
    expect(mapping.isEnabled).toBe(false);
    expect(upsertMapping).toHaveBeenCalledOnce();
  });

  it.each(["OTP", "Response", "Journey"])(
    "stores %s candidates only with compatibility_unverified and disabled",
    async (candidateKind) => {
      const { repository, upsertMapping } = makeRepository();
      const service = new ZbsTemplateManagementService(
        repository,
        (value) => value,
        vi.fn(async () => new Response(JSON.stringify({
          error: 0,
          data: [{
            templateId: 98765,
            templateName: candidateKind,
            createdTime: Date.UTC(2026, 1, 1),
            status: "ENABLE",
            templateQuality: "HIGH",
          }],
          metadata: { total: 1 },
        }), { status: 200 })),
      );

      const mapping = await service.saveMapping("oa-a", {
        isSuperAdmin: true,
        allowedLocationIds: [],
      }, { notificationType: "invoice_created", templateId: "98765" });
      expect(mapping.compatibilityStatus).toBe("compatibility_unverified");
      expect(mapping.isEnabled).toBe(false);
      expect(upsertMapping).toHaveBeenCalledOnce();
    },
  );

  it("stores mapping as unverified when the list has no compatibility evidence", async () => {
    const { repository } = makeRepository();
    const service = new ZbsTemplateManagementService(
      repository,
      (value) => value,
      vi.fn(async () => new Response(JSON.stringify({
        error: 0,
        data: [{ templateId: 98765, templateName: "Generic label", status: "ENABLE" }],
        metadata: { total: 1 },
      }), { status: 200 })),
    );

    const mapping = await service.saveMapping("oa-a", {
      isSuperAdmin: true,
      allowedLocationIds: [],
    }, { notificationType: "invoice_created", templateId: "98765" });
    expect(mapping.compatibilityStatus).toBe("compatibility_unverified");
    expect(mapping.isEnabled).toBe(false);
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
