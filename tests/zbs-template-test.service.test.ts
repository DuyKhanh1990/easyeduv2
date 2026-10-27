import { describe, expect, it } from "vitest";
import { buildTuitionNoticeTestTemplate } from "../server/services/zbs-template-test.service";

describe("ZBS tuition test template", () => {
  it("copies the complete source and uses both shared logos", () => {
    const logos = {
      logoLightUrl: "https://assets.example.test/shared-light.png",
      logoDarkUrl: "https://assets.example.test/shared-dark.png",
    };
    const testTemplate = buildTuitionNoticeTestTemplate(logos);
    const logo = testTemplate.template.section.header.components[0].LOGO;

    expect(testTemplate).toMatchObject({
      recordType: "zbs-internal-test-template",
      code: "TEST_TUITION_NOTICE",
      name: "TEST - THÔNG BÁO HỌC PHÍ",
      status: "draft",
      willSubmitToZbs: false,
      requiresCenterBankDetailsOverride: true,
    });
    expect(logo).toEqual({
      urlLight: logos.logoLightUrl,
      urlDark: logos.logoDarkUrl,
    });
    expect(testTemplate.template.section.body.components.some((item) => item.PAYMENT)).toBe(true);
    expect(testTemplate.template).not.toHaveProperty("brandTemplateId");
    expect(testTemplate.template).not.toHaveProperty("oaId");
  });

  it("requires both shared logo variants", () => {
    expect(() => buildTuitionNoticeTestTemplate({
      logoLightUrl: "https://assets.example.test/shared-light.png",
      logoDarkUrl: null,
    })).toThrow(/đủ logo giao diện sáng và tối/);
  });
});
