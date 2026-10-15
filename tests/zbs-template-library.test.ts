import { describe, expect, it } from "vitest";
import {
  assertZbsLibraryReadAccess,
  assertZbsLibraryWriteAccess,
  interpolateZbsLibraryPreview,
  prepareZbsLibraryDraft,
  zbsLibraryInputSchema,
} from "../server/services/zbs-template-library.service";
import { ZBS_TEMPLATE_SYSTEM_VARIABLES } from "../shared/zbs-template-system-variables";

const validInput = {
  code: "TUITION_NOTICE",
  name: "Nhắc học phí",
  notificationType: "tuition_due",
  title: "Xin chào {{student_name}}",
  components: [
    { type: "text" as const, text: "Hạn đóng {{due_date}}, số tiền {{amount}}" },
    { type: "image" as const, source: "url" as const, url: "https://example.test/banner.png" },
    { type: "button" as const, label: "Xem chi tiết", url: "https://example.test/invoice" },
  ],
  variables: [
    { key: "student_name", example: "Minh Anh", systemField: "student.fullName" },
    { key: "due_date", example: "30/10/2026" },
    { key: "amount", example: "500.000đ" },
  ],
};

describe("ZBS internal template library", () => {
  it("allows only authorized non-student readers", () => {
    expect(assertZbsLibraryReadAccess({
      isStudent: false, isPrivileged: false, canView: true, canViewAll: false, canCreate: false, canEdit: false,
    })).toBe(true);
    expect(assertZbsLibraryReadAccess({
      isStudent: false, isPrivileged: false, canView: false, canViewAll: false, canCreate: false, canEdit: false,
    })).toBe(false);
    expect(assertZbsLibraryReadAccess({
      isStudent: true, isPrivileged: true, canView: true, canViewAll: true, canCreate: true, canEdit: true,
    })).toBe(false);
  });

  it("separates create/edit from delete permissions", () => {
    expect(assertZbsLibraryWriteAccess({
      isStudent: false, isPrivileged: false, canCreate: true, canEdit: false, canDelete: false,
    })).toBe(true);
    expect(assertZbsLibraryWriteAccess({
      isStudent: false, isPrivileged: false, canCreate: false, canEdit: true, canDelete: false, deleting: true,
    })).toBe(false);
    expect(assertZbsLibraryWriteAccess({
      isStudent: false, isPrivileged: false, canCreate: false, canEdit: false, canDelete: true, deleting: true,
    })).toBe(true);
  });

  it("validates draft text, image resources, buttons and variables without marking Zalo support verified", () => {
    const parsed = zbsLibraryInputSchema.parse(validInput);
    expect(parsed.components[1]).toMatchObject({ type: "image", compatibilityStatus: "unverified" });
    expect(parsed.components[2]).toMatchObject({ type: "button", compatibilityStatus: "unverified" });
  });

  it("prepares a saved template as a versioned, unverified internal draft", () => {
    const draft = prepareZbsLibraryDraft(validInput);
    expect(draft).toMatchObject({
      code: "TUITION_NOTICE",
      status: "draft",
      version: 1,
      compatibilityStatus: "unverified",
    });
    expect(draft.components).toHaveLength(3);
    expect(draft.components[1]).toMatchObject({ type: "image", source: "url" });
    expect(draft.variables[0]).toMatchObject({ key: "student_name", systemField: "student.fullName" });
  });

  it("offers ready-made student and invoice variables with explicit data sources", () => {
    expect(ZBS_TEMPLATE_SYSTEM_VARIABLES.map((variable) => variable.key)).toEqual(expect.arrayContaining([
      "student_name",
      "billing_month",
      "tuition_amount",
      "paid_amount",
      "remaining_amount",
      "amount",
      "bank_name",
      "bank_code",
      "account_number",
      "account_name",
      "due_date",
    ]));
    expect(ZBS_TEMPLATE_SYSTEM_VARIABLES.find((variable) => variable.key === "amount"))
      .toMatchObject({ token: "<amount>", source: "payment.amount", format: "currencyVnd" });
    expect(ZBS_TEMPLATE_SYSTEM_VARIABLES.find((variable) => variable.key === "bank_code"))
      .toMatchObject({ token: "<bank_code>", source: "payment.bankCode" });
    expect(ZBS_TEMPLATE_SYSTEM_VARIABLES.find((variable) => variable.key === "paid_amount"))
      .toMatchObject({ source: "invoice.paidAmount", format: "currencyVnd" });
    expect(ZBS_TEMPLATE_SYSTEM_VARIABLES.find((variable) => variable.key === "center_logo"))
      .toMatchObject({ source: "center.logoUrl", format: "imageUrl" });
  });

  it("accepts a center-logo image block and a QR payload block", () => {
    const parsed = zbsLibraryInputSchema.parse({
      ...validInput,
      components: [
        { type: "image", source: "systemVariable", variableKey: "center_logo", alt: "Logo trung tâm" },
        { type: "qr", value: "payment-payload", caption: "Quét mã để thanh toán" },
      ],
      variables: [{
        key: "center_logo",
        example: "Logo trung tâm",
        systemField: "center.logoUrl",
        format: "imageUrl",
      }],
    });
    expect(parsed.components[0]).toMatchObject({ type: "image", source: "systemVariable", variableKey: "center_logo" });
    expect(parsed.components[1]).toMatchObject({ type: "qr", value: "payment-payload", compatibilityStatus: "unverified" });
  });

  it("keeps blue-card styling optional on editable text blocks", () => {
    const parsed = zbsLibraryInputSchema.parse({
      ...validInput,
      components: [{ type: "text", text: "Editable trip information", style: "blueCard" }],
    });
    expect(parsed.components[0]).toMatchObject({
      type: "text",
      text: "Editable trip information",
      style: "blueCard",
    });
    const plainText = zbsLibraryInputSchema.parse({
      ...validInput,
      components: [{ type: "text", text: "Ordinary editable text" }],
    }).components[0];
    expect(plainText).toMatchObject({ type: "text", text: "Ordinary editable text" });
    expect(plainText).not.toHaveProperty("style");
  });

  it("allows incomplete buttons in a draft but rejects malformed non-empty URLs", () => {
    const draft = zbsLibraryInputSchema.parse({
      ...validInput,
      components: [{ type: "button", label: "Xem vé", url: "" }],
    });
    expect(draft.components[0]).toMatchObject({ type: "button", label: "Xem vé", url: "" });
    expect(() => zbsLibraryInputSchema.parse({
      ...validInput,
      components: [{ type: "button", label: "Xem vé", url: "not a URL" }],
    })).toThrow(/URL nút phải là đường dẫn hợp lệ/);
  });

  it("rejects duplicate variable keys and incomplete image resources", () => {
    expect(() => zbsLibraryInputSchema.parse({
      ...validInput,
      variables: [{ key: "amount", example: "1" }, { key: "amount", example: "2" }],
    })).toThrow(/bị khai báo trùng/);
    expect(() => zbsLibraryInputSchema.parse({
      ...validInput,
      components: [{ type: "image", source: "asset" }],
    })).toThrow(/assetId/);
    expect(() => zbsLibraryInputSchema.parse({
      ...validInput,
      variables: [{ key: "custom", example: "x", systemField: "student.password" }],
    })).toThrow();
  });

  it("renders preview values without changing unresolved placeholders", () => {
    expect(interpolateZbsLibraryPreview(
      "Xin chào {{student_name}}, thanh toán <amount>, ngân hàng <bank_name>, {{unknown}}",
      [
        { key: "student_name", example: "Minh Anh" },
        { key: "amount", example: "1.000.000đ" },
        { key: "bank_name", example: "Vietcombank" },
      ],
    )).toBe("Xin chào Minh Anh, thanh toán 1.000.000đ, ngân hàng Vietcombank, {{unknown}}");
  });
});
