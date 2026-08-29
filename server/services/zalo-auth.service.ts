import jwt from "jsonwebtoken";
import { db } from "../db";
import { centerConfig, studentNotificationChannels, students } from "@shared/schema";
import { eq } from "drizzle-orm";
import { JWT_SECRET } from "../auth";

const JWT_EXPIRES_IN = "30d";
const GUEST_JWT_EXPIRES_IN = "7d";

export interface ZaloAuthResult {
  token: string;
  center: string | null;
  needsOnboarding: boolean;
  studentId?: string;
  fullName?: string;
  userType?: "student" | "parent" | "guest";
}

async function getCenterUrl(): Promise<string | null> {
  try {
    const [row] = await db.select({ centerUrl: centerConfig.centerUrl }).from(centerConfig).limit(1);
    return row?.centerUrl || null;
  } catch {
    return null;
  }
}

/**
 * Core Zalo auth service — shared giữa /api/mobile/auth/zalo (public) và /api/internal/zalo-auth (internal)
 * Input: zaloAccessToken từ Zalo SDK
 * Output: ZaloAuthResult với token, center, needsOnboarding
 */
export async function resolveZaloAuth(zaloAccessToken: string): Promise<ZaloAuthResult> {
  const center = await getCenterUrl();

  // Bước 1: Verify token với Zalo graph API
  const zaloRes = await fetch(
    `https://graph.zalo.me/v2.0/me?fields=id,name&access_token=${encodeURIComponent(zaloAccessToken)}`
  );
  const zaloData = (await zaloRes.json()) as any;

  if (!zaloRes.ok || !zaloData.id || zaloData.error) {
    console.warn("[ZaloAuthService] Zalo verify thất bại:", zaloData);
    throw Object.assign(new Error("Token Zalo không hợp lệ"), { statusCode: 401 });
  }

  const zaloUserId = String(zaloData.id);
  console.log(`[ZaloAuthService] Zalo verify OK: zaloUserId=${zaloUserId}, name=${zaloData.name}`);

  // Bước 2: Tra student_notification_channels
  const [channel] = await db
    .select({ studentId: studentNotificationChannels.studentId })
    .from(studentNotificationChannels)
    .where(eq(studentNotificationChannels.zaloUserId, zaloUserId))
    .limit(1);

  if (!channel?.studentId) {
    console.log(`[ZaloAuthService] Chưa link student cho zaloUserId=${zaloUserId} → guest JWT`);
    const guestToken = jwt.sign(
      { role: "guest", zaloUserId, center },
      JWT_SECRET,
      { expiresIn: GUEST_JWT_EXPIRES_IN }
    );
    return { token: guestToken, center, needsOnboarding: true, userType: "guest" };
  }

  // Bước 3: Tra students
  const [student] = await db
    .select({
      id: students.id,
      userId: students.userId,
      fullName: students.fullName,
      type: students.type,
    })
    .from(students)
    .where(eq(students.id, channel.studentId))
    .limit(1);

  if (!student?.userId) {
    console.log(`[ZaloAuthService] Student ${channel.studentId} chưa có userId → guest JWT`);
    const guestToken = jwt.sign(
      { role: "guest", zaloUserId, center },
      JWT_SECRET,
      { expiresIn: GUEST_JWT_EXPIRES_IN }
    );
    return { token: guestToken, center, needsOnboarding: true, userType: "guest" };
  }

  // Bước 4: Ký JWT student/parent
  const token = jwt.sign({ id: student.userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const userType = student.type === "Phụ huynh" ? "parent" : "student";

  console.log(`[ZaloAuthService] Đăng nhập thành công: studentId=${student.id}, userId=${student.userId}`);

  return {
    token,
    center,
    needsOnboarding: false,
    studentId: student.id,
    fullName: student.fullName ?? "",
    userType,
  };
}
