import { z } from "zod";
import {
  ZBS_TEMPLATE_SYSTEM_VARIABLE_FORMATS,
  ZBS_TEMPLATE_SYSTEM_VARIABLE_SOURCES,
} from "@shared/zbs-template-system-variables";

export const zbsLibraryComponentSchema = z.union([
  z.object({ type: z.literal("text"), text: z.string().max(5000) }),
  z.object({
    type: z.literal("image"),
    source: z.enum(["url", "asset"]),
    url: z.string().max(2000).optional(),
    assetId: z.string().max(200).optional(),
    alt: z.string().max(500).optional(),
    compatibilityStatus: z.literal("unverified").default("unverified"),
  }),
  z.object({
    type: z.literal("button"),
    label: z.string().min(1).max(100),
    url: z.string().url().max(2000),
    compatibilityStatus: z.literal("unverified").default("unverified"),
  }),
]);

export const zbsLibraryInputSchema = z.object({
  code: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(255),
  notificationType: z.string().trim().min(1).max(100),
  title: z.string().max(255).default(""),
  components: z.array(zbsLibraryComponentSchema).max(100).default([]),
  variables: z.array(z.object({
    key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/).max(64),
    example: z.string().max(1000),
    description: z.string().max(255).optional(),
    systemField: z.enum(ZBS_TEMPLATE_SYSTEM_VARIABLE_SOURCES).optional(),
    format: z.enum(ZBS_TEMPLATE_SYSTEM_VARIABLE_FORMATS).optional(),
  })).max(100).default([]),
}).superRefine((value, ctx) => {
  const keys = new Set<string>();
  value.components.forEach((component, index) => {
    if (component.type === "image" && component.source === "url" && !component.url?.trim()) {
      ctx.addIssue({ code: "custom", message: "Ảnh dạng URL cần có URL.", path: ["components", index, "url"] });
    }
    if (component.type === "image" && component.source === "asset" && !component.assetId?.trim()) {
      ctx.addIssue({ code: "custom", message: "Ảnh dạng tài nguyên cần có assetId.", path: ["components", index, "assetId"] });
    }
  });
  value.variables.forEach((variable, index) => {
    if (keys.has(variable.key)) {
      ctx.addIssue({ code: "custom", message: `Biến ${variable.key} bị khai báo trùng.`, path: ["variables", index, "key"] });
    }
    keys.add(variable.key);
  });
});

export type ZbsLibraryInput = z.infer<typeof zbsLibraryInputSchema>;
export function prepareZbsLibraryDraft(input: unknown) {
  return {
    ...zbsLibraryInputSchema.parse(input),
    version: 1,
    status: "draft" as const,
    compatibilityStatus: "unverified" as const,
  };
}

export type ZbsLibraryRecord = ZbsLibraryInput & {
  id: string;
  centerId: string;
  version: number;
  status: "draft" | "archived";
  compatibilityStatus: "unverified";
  createdAt: Date;
  updatedAt: Date;
};

export class ZbsLibraryError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "ZbsLibraryError";
  }
}

export interface ZbsLibraryRepository {
  list(centerId: string): Promise<ZbsLibraryRecord[]>;
  get(centerId: string, id: string): Promise<ZbsLibraryRecord | null>;
  create(centerId: string, input: ZbsLibraryInput, userId: string | null): Promise<ZbsLibraryRecord>;
  update(centerId: string, id: string, input: ZbsLibraryInput, userId: string | null): Promise<ZbsLibraryRecord | null>;
  duplicate(centerId: string, id: string, code: string, userId: string | null): Promise<ZbsLibraryRecord | null>;
  archive(centerId: string, id: string, userId: string | null): Promise<ZbsLibraryRecord | null>;
}

export function interpolateZbsLibraryPreview(text: string, variables: ZbsLibraryInput["variables"]) {
  const values = new Map(variables.map((variable) => [variable.key, variable.example]));
  return text.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (match, key: string) =>
    values.has(key) ? values.get(key)! : match,
  );
}

export function assertZbsLibraryReadAccess(input: {
  isStudent: boolean;
  isPrivileged: boolean;
  canView: boolean;
  canViewAll: boolean;
  canCreate: boolean;
  canEdit: boolean;
}) {
  return !input.isStudent && (input.isPrivileged || input.canView || input.canViewAll || input.canCreate || input.canEdit);
}

export function assertZbsLibraryWriteAccess(input: {
  isStudent: boolean;
  isPrivileged: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete?: boolean;
  deleting?: boolean;
}) {
  if (input.isStudent) return false;
  if (input.isPrivileged) return true;
  return input.deleting ? input.canDelete === true : input.canCreate || input.canEdit;
}
