import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTuitionNoticeTestTemplate } from "../server/services/zbs-template-test.service";
import {
  createZbsTuitionTemplate,
  ZbsProvisioningApiError,
} from "../server/services/zbs-template-provisioning.service";

describe("ZBS test-template provisioning", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uploads both shared logo variants and submits center bank details", async () => {
    vi.stubEnv("S3_HOSTNAME", "assets.example.test");
    const image = new Uint8Array(24);
    image.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    new DataView(image.buffer).setUint32(16, 400);
    new DataView(image.buffer).setUint32(20, 96);
    let uploadCount = 0;
    let submittedPayload: any;

    const fetcher = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://assets.example.test/")) {
        return new Response(image, { status: 200 });
      }
      if (url.endsWith("/upload/image")) {
        uploadCount += 1;
        return Response.json({ error: 0, data: { media_id: `media-${uploadCount}` } });
      }
      submittedPayload = JSON.parse(String(init?.body));
      return Response.json({
        error: 0,
        data: { template_id: "zbs-test-123", template_name: "TEST - THÔNG BÁO HỌC PHÍ", status: "PENDING_REVIEW" },
      });
    });

    const logos = {
      logoLightUrl: "https://assets.example.test/light.png",
      logoDarkUrl: "https://assets.example.test/dark.png",
    };
    const result = await createZbsTuitionTemplate({
      accessToken: "mock-token",
      testTemplate: buildTuitionNoticeTestTemplate(logos),
      logos,
      payment: {
        bankCode: "970436",
        bankName: "Vietcombank",
        accountName: "TRUNG TAM TEST",
        accountNumber: "123456789",
      },
      trackingId: "test-tracking-id",
      fetcher,
    });

    expect(result).toMatchObject({ templateId: "zbs-test-123", status: "PENDING_REVIEW" });
    expect(uploadCount).toBe(2);
    expect(submittedPayload.template_type).toBe(3);
    expect(submittedPayload.layout.header.components[0].LOGO).toEqual({
      light: { type: "IMAGE", media_id: "media-1" },
      dark: { type: "IMAGE", media_id: "media-2" },
    });
    const payment = submittedPayload.layout.body.components.find((component: any) => component.PAYMENT).PAYMENT;
    expect(payment).toMatchObject({
      bank_code: "970436",
      account_name: "TRUNG TAM TEST",
      bank_account: "123456789",
    });
    expect(JSON.stringify(submittedPayload)).not.toContain("0021000449070");
    expect(submittedPayload.tracking_id).toBe("test-tracking-id");
  });

  it("rejects a logo outside the system storage host", async () => {
    vi.stubEnv("S3_HOSTNAME", "assets.example.test");
    const fetcher = vi.fn();
    await expect(createZbsTuitionTemplate({
      accessToken: "mock-token",
      testTemplate: buildTuitionNoticeTestTemplate({
        logoLightUrl: "https://attacker.example/logo.png",
        logoDarkUrl: "https://attacker.example/dark.png",
      }),
      logos: {
        logoLightUrl: "https://attacker.example/logo.png",
        logoDarkUrl: "https://attacker.example/dark.png",
      },
      payment: { bankCode: "970436", bankName: "VCB", accountName: "CENTER", accountNumber: "123" },
      trackingId: "test",
      fetcher,
    })).rejects.toThrow(/kho lưu trữ ảnh/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("preserves Zalo's original template-create error details", async () => {
    vi.stubEnv("S3_HOSTNAME", "assets.example.test");
    const image = new Uint8Array(24);
    image.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    new DataView(image.buffer).setUint32(16, 400);
    new DataView(image.buffer).setUint32(20, 96);
    let uploadCount = 0;
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.startsWith("https://assets.example.test/")) return new Response(image);
      if (url.endsWith("/upload/image")) {
        uploadCount += 1;
        return Response.json({ error: 0, data: { media_id: `media-${uploadCount}` } });
      }
      return Response.json({ error: -120, message: "OA does not have permission to use this feature" });
    });
    const logos = {
      logoLightUrl: "https://assets.example.test/light.png",
      logoDarkUrl: "https://assets.example.test/dark.png",
    };

    await expect(createZbsTuitionTemplate({
      accessToken: "mock-token",
      testTemplate: buildTuitionNoticeTestTemplate(logos),
      logos,
      payment: { bankCode: "970436", bankName: "VCB", accountName: "CENTER", accountNumber: "123" },
      trackingId: "test",
      fetcher,
    })).rejects.toMatchObject<Partial<ZbsProvisioningApiError>>({
      operation: "create-template",
      endpoint: "https://business.openapi.zalo.me/template/create",
      providerCode: -120,
      providerHttpStatus: 200,
      providerMessage: "OA does not have permission to use this feature",
    });
  });
});
