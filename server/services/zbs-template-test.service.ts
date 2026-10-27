import approvedTuitionNotice from "../../shared/zbs-approved-templates/tuition-notice-651693.json";

export type SharedZbsLogoUrls = {
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
};

export function buildTuitionNoticeTestTemplate(logos: SharedZbsLogoUrls) {
  if (!logos.logoLightUrl || !logos.logoDarkUrl) {
    throw new Error("Cần lưu đủ logo giao diện sáng và tối trước khi tạo mẫu Test.");
  }

  const source = structuredClone(approvedTuitionNotice.template) as Record<string, any>;
  const logoComponent = source.section?.header?.components?.find((component: Record<string, any>) => component.LOGO)?.LOGO;
  if (!logoComponent) {
    throw new Error("Không tìm thấy khối LOGO trong mẫu học phí chuẩn.");
  }

  logoComponent.urlLight = logos.logoLightUrl;
  logoComponent.urlDark = logos.logoDarkUrl;

  const sourceBrandTemplateId = source.brandTemplateId;
  const {
    brandTemplateId: _brandTemplateId,
    id: _id,
    appId: _appId,
    oaId: _oaId,
    oaIdLong: _oaIdLong,
    oaName: _oaName,
    status: _status,
    ...template
  } = source;

  return {
    recordType: "zbs-internal-test-template",
    code: "TEST_TUITION_NOTICE",
    name: "TEST - THÔNG BÁO HỌC PHÍ",
    status: "draft",
    sourceBrandTemplateId,
    requiresCenterBankDetailsOverride: true,
    willSubmitToZbs: false,
    template: {
      ...template,
      name: "TEST - THÔNG BÁO HỌC PHÍ",
    },
  };
}
