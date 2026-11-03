import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { systemSettings } from "@shared/schema";

export const SESSION_REVIEW_PUBLICATION_SETTINGS_KEY = "sessionReviewPublicationPolicy";

export const DEFAULT_SESSION_REVIEW_PUBLICATION_POLICY = {
  defaultPublished: false,
  deniedRoleIds: [] as string[],
};

export type SessionReviewPublicationPolicy = {
  defaultPublished: boolean;
  deniedRoleIds: string[];
};

const policySchema = z.object({
  defaultPublished: z.boolean(),
  deniedRoleIds: z.array(z.string().uuid()).max(500),
});

export async function getSessionReviewPublicationPolicy(): Promise<SessionReviewPublicationPolicy> {
  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, SESSION_REVIEW_PUBLICATION_SETTINGS_KEY))
    .limit(1);

  if (!row) return DEFAULT_SESSION_REVIEW_PUBLICATION_POLICY;

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value);
  } catch {
    throw new Error("Cấu hình công bố nhận xét học viên không hợp lệ.");
  }

  const result = policySchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Cấu hình công bố nhận xét học viên không hợp lệ.");
  }
  return result.data;
}

export function canToggleSessionReviewPublication(
  req: any,
  policy: SessionReviewPublicationPolicy,
): boolean {
  if (req?.isSuperAdmin === true) return true;
  const roleIds: string[] = Array.isArray(req?.roleIds) ? req.roleIds : [];
  return !roleIds.some((roleId) => policy.deniedRoleIds.includes(roleId));
}
