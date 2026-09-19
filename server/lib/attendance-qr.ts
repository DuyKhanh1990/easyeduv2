import { createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { studentAttendanceQrTokens } from "@shared/schema";
import { db } from "../db";
import { decrypt, encrypt } from "./encryption";

export function hashQrToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Returns the one stable QR token for a student.
 * The first authorized read provisions it lazily; subsequent reads reuse it.
 */
export async function ensureStudentQrToken(studentId: string, createdBy: string | null) {
  const [existing] = await db
    .select({
      id: studentAttendanceQrTokens.id,
      tokenEncrypted: studentAttendanceQrTokens.tokenEncrypted,
      createdAt: studentAttendanceQrTokens.createdAt,
      revokedAt: studentAttendanceQrTokens.revokedAt,
    })
    .from(studentAttendanceQrTokens)
    .where(eq(studentAttendanceQrTokens.studentId, studentId))
    .limit(1);

  if (existing && !existing.revokedAt) {
    try {
      return {
        token: decrypt(existing.tokenEncrypted),
        createdAt: existing.createdAt,
      };
    } catch {
      // Regenerate an unreadable legacy token below.
    }
  }

  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const values = {
    tokenHash: hashQrToken(token),
    tokenEncrypted: encrypt(token),
    createdBy,
    updatedAt: now,
    revokedAt: null,
  };

  if (existing) {
    await db
      .update(studentAttendanceQrTokens)
      .set(values)
      .where(eq(studentAttendanceQrTokens.id, existing.id));
    return { token, createdAt: existing.createdAt };
  }

  await db
    .insert(studentAttendanceQrTokens)
    .values({
      studentId,
      ...values,
      createdAt: now,
    })
    .onConflictDoNothing({ target: studentAttendanceQrTokens.studentId });

  // A simultaneous page load may have inserted the row first. Return the
  // persisted token so all views of a student share the same QR.
  const [saved] = await db
    .select({
      tokenEncrypted: studentAttendanceQrTokens.tokenEncrypted,
      createdAt: studentAttendanceQrTokens.createdAt,
    })
    .from(studentAttendanceQrTokens)
    .where(eq(studentAttendanceQrTokens.studentId, studentId))
    .limit(1);
  if (!saved) throw new Error("Không thể tạo mã QR mặc định.");

  return {
    token: decrypt(saved.tokenEncrypted),
    createdAt: saved.createdAt,
  };
}