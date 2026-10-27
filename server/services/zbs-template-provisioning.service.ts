import type { buildTuitionNoticeTestTemplate } from "./zbs-template-test.service";

const ZBS_IMAGE_UPLOAD_URL = "https://business.openapi.zalo.me/upload/image";
const ZBS_TEMPLATE_CREATE_URL = "https://business.openapi.zalo.me/template/create";
const VIETQR_BANKS_URL = "https://api.vietqr.io/v2/banks";
const MAX_LOGO_BYTES = 500 * 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

type TestTemplate = ReturnType<typeof buildTuitionNoticeTestTemplate>;
type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type ZbsFixedPaymentDetails = {
  bankCode: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
};

function normalizeBankName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

let cachedBankList: { expiresAt: number; data: Array<{ bin: string; name: string; shortName: string; code: string }> } | null = null;

export async function resolveVietQrBankCode(bankName: string, fetcher: FetchLike = fetch): Promise<string | null> {
  const target = normalizeBankName(bankName);
  if (!target) return null;
  if (!cachedBankList || cachedBankList.expiresAt <= Date.now()) {
    const response = await fetcher(VIETQR_BANKS_URL, { headers: { Accept: "application/json" } });
    const body = await response.json().catch(() => null) as any;
    if (!response.ok || body?.code !== "00" || !Array.isArray(body?.data)) {
      throw new Error("Không tra được mã BIN ngân hàng từ danh mục VietQR.");
    }
    cachedBankList = {
      expiresAt: Date.now() + 6 * 60 * 60 * 1000,
      data: body.data.filter((item: any) => item.transferSupported !== 0 && /^\d{6}$/.test(String(item.bin ?? ""))),
    };
  }

  const matches = cachedBankList.data
    .map((bank) => ({
      bank,
      names: [bank.name, bank.shortName, bank.code].map(normalizeBankName).filter(Boolean),
    }))
    .map(({ bank, names }) => ({
      bank,
      score: Math.max(0, ...names.map((name) =>
        target === name ? 1000 + name.length
          : target.startsWith(name) || name.startsWith(target) ? Math.min(target.length, name.length)
            : 0,
      )),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!matches.length || (matches[1]?.score === matches[0]?.score)) return null;
  return matches[0].bank.bin;
}

async function uploadTemplateLogo(
  logoUrl: string,
  accessToken: string,
  fetcher: FetchLike,
): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(logoUrl);
  } catch {
    throw new Error("Đường dẫn logo dùng chung không hợp lệ.");
  }
  const allowedHost = (process.env.S3_HOSTNAME || process.env.S3_ALIAS_HOST || "").trim().toLowerCase();
  const hostname = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:"
    || !allowedHost
    || !(hostname === allowedHost || hostname.endsWith(`.${allowedHost}`))
  ) {
    throw new Error("Logo phải nằm trên kho lưu trữ ảnh của hệ thống.");
  }

  const imageResponse = await fetcher(parsed, { redirect: "error" });
  if (!imageResponse.ok) throw new Error("Không tải được logo dùng chung.");
  const bytes = new Uint8Array(await imageResponse.arrayBuffer());
  if (bytes.byteLength > MAX_LOGO_BYTES) throw new Error("Ảnh logo vượt giới hạn 500 KB của Zalo.");
  if (
    bytes.byteLength < 24
    || !PNG_SIGNATURE.every((value, index) => bytes[index] === value)
  ) {
    throw new Error("Logo dùng chung phải là tệp PNG.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(16) !== 400 || view.getUint32(20) !== 96) {
    throw new Error("Logo dùng chung phải có kích thước 400 × 96 px.");
  }

  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/png" }), "zbs-logo.png");
  const uploadResponse = await fetcher(ZBS_IMAGE_UPLOAD_URL, {
    method: "POST",
    headers: { access_token: accessToken },
    body: form,
  });
  const result = await uploadResponse.json().catch(() => null) as any;
  const mediaId = String(result?.data?.media_id ?? "");
  if (!uploadResponse.ok || Number(result?.error ?? -1) !== 0 || !mediaId) {
    throw new Error(`Zalo không nhận được logo (mã lỗi ${result?.error ?? uploadResponse.status}).`);
  }
  return mediaId;
}

function toCreatePayload(
  templateRecord: TestTemplate,
  payment: ZbsFixedPaymentDetails,
  logoMediaIds: { light: string; dark: string },
  trackingId: string,
) {
  const template = templateRecord.template as Record<string, any>;
  const sourceSection = template.section;
  const bodyComponents = sourceSection.body.components.map((component: Record<string, any>) => {
    if (component.PAYMENT) {
      return {
        PAYMENT: {
          bank_code: payment.bankCode,
          account_name: payment.accountName,
          bank_account: payment.accountNumber,
          amount: component.PAYMENT.amount,
          ...(component.PAYMENT.description ? { note: component.PAYMENT.description } : {}),
        },
      };
    }
    if (component.TABLE) {
      return {
        TABLE: {
          rows: component.TABLE.rows.map((row: Record<string, any>) => ({
            title: row.key,
            value: row.value,
            ...(Number.isInteger(row.type) ? { row_type: row.type } : {}),
          })),
        },
      };
    }
    if (component.PARAGRAPH) return { PARAGRAPH: { value: component.PARAGRAPH.value } };
    return component;
  });

  const sourceButtons = sourceSection.footer?.components?.flatMap((component: Record<string, any>) => component.BUTTON?.buttons ?? []) ?? [];
  const footerComponents = sourceButtons.length
    ? [{
        BUTTONS: {
          items: sourceButtons.map((button: Record<string, any>) => ({
            type: Number(button.type ?? button.tag),
            title: String(button.text ?? "").trim(),
            content: String(button.data ?? ""),
          })),
        },
      }]
    : [];

  const params = (template.params ?? []).map((param: Record<string, any>) => ({
    type: String(param.paramType),
    name: param.name,
    sample_value: String(param.sampleValue ?? ""),
  }));

  return {
    template_name: templateRecord.name,
    template_type: 3,
    tag: 1,
    layout: {
      header: {
        components: [{
          LOGO: {
            light: { type: "IMAGE", media_id: logoMediaIds.light },
            dark: { type: "IMAGE", media_id: logoMediaIds.dark },
          },
        }],
      },
      body: { components: bodyComponents },
      footer: { components: footerComponents },
    },
    params,
    note: String(template.note ?? "Mẫu Test nội bộ thông báo học phí."),
    tracking_id: trackingId,
  };
}

export async function createZbsTuitionTemplate(input: {
  accessToken: string;
  testTemplate: TestTemplate;
  logos: { logoLightUrl: string; logoDarkUrl: string };
  payment: ZbsFixedPaymentDetails;
  trackingId: string;
  fetcher?: FetchLike;
}) {
  const fetcher = input.fetcher ?? fetch;
  const [lightMediaId, darkMediaId] = await Promise.all([
    uploadTemplateLogo(input.logos.logoLightUrl, input.accessToken, fetcher),
    uploadTemplateLogo(input.logos.logoDarkUrl, input.accessToken, fetcher),
  ]);
  const payload = toCreatePayload(
    input.testTemplate,
    input.payment,
    { light: lightMediaId, dark: darkMediaId },
    input.trackingId,
  );
  const response = await fetcher(ZBS_TEMPLATE_CREATE_URL, {
    method: "POST",
    headers: {
      access_token: input.accessToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => null) as any;
  if (!response.ok || Number(result?.error ?? -1) !== 0 || !result?.data?.template_id) {
    throw new Error(`Zalo chưa tạo được mẫu Test (mã lỗi ${result?.error ?? response.status}): ${String(result?.message ?? "phản hồi không hợp lệ")}`);
  }
  return {
    templateId: String(result.data.template_id),
    templateName: String(result.data.template_name ?? payload.template_name),
    status: String(result.data.status ?? "PENDING_REVIEW").toUpperCase(),
    previewUrl: typeof result.data.preview_url === "string" ? result.data.preview_url : null,
  };
}
