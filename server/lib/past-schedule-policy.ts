import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { systemSettings } from "@shared/schema";

export const PAST_SCHEDULE_POLICY_SETTINGS_KEY = "pastSchedulePolicy";
export const DEFAULT_PAST_SCHEDULE_POLICY = {
  enabled: false,
  roleIds: [] as string[],
};

export type PastSchedulePolicy = {
  enabled: boolean;
  roleIds: string[];
};

const pastSchedulePolicySchema = z.object({
  enabled: z.boolean(),
  roleIds: z.array(z.string().uuid()).max(500),
});

export function getBangkokDateString(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isPastScheduleDate(value: unknown, today = getBangkokDateString()): boolean {
  if (value == null) return false;
  const date = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date < today;
}

export async function getPastSchedulePolicy(): Promise<PastSchedulePolicy> {
  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, PAST_SCHEDULE_POLICY_SETTINGS_KEY))
    .limit(1);

  if (!row) return DEFAULT_PAST_SCHEDULE_POLICY;

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value);
  } catch {
    throw new Error("Cấu hình chạy lịch học trong quá khứ không hợp lệ.");
  }
  const result = pastSchedulePolicySchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Cấu hình chạy lịch học trong quá khứ không hợp lệ.");
  }
  return result.data;
}

export function canRunPastSchedule(req: any, policy: PastSchedulePolicy): boolean {
  if (req?.isSuperAdmin === true) return true;
  if (!policy.enabled) return false;
  const roleIds: string[] = Array.isArray(req?.roleIds) ? req.roleIds : [];
  return roleIds.some((roleId) => policy.roleIds.includes(roleId));
}

export async function canRunPastScheduleForRequest(req: any): Promise<boolean> {
  return canRunPastSchedule(req, await getPastSchedulePolicy());
}
