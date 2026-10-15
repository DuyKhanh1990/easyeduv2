import { describe, expect, it } from "vitest";
import {
  assertZbsLibraryReadAccess,
  assertZbsLibraryWriteAccess,
  interpolateZbsLibraryPreview,
  prepareZbsLibraryDraft,
  zbsLibraryInputSchema,
} from "../server/services/zbs-template-library.service";

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
    { key: "student_name", example: "Minh Anh" },
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
  });

  it("renders preview values without changing unresolved placeholders", () => {
    expect(interpolateZbsLibraryPreview(
      "Xin chào {{student_name}}, {{unknown}}",
      [{ key: "student_name", example: "Minh Anh" }],
    )).toBe("Xin chào Minh Anh, {{unknown}}");
  });
});
