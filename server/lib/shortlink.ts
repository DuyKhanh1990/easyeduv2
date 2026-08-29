import { db } from "../db";
import { shortLinks } from "@shared/schema";
import { eq } from "drizzle-orm";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const CODE_LENGTH = 6;
const TTL_DAYS = 90;

function generateCode(): string {
  let result = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    result += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return result;
}

export async function createShortLink(targetUrl: string, baseUrl: string): Promise<string> {
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      await db.insert(shortLinks).values({ code, targetUrl, expiresAt });
      const base = baseUrl.replace(/\/$/, "");
      return `${base}/go/${code}`;
    } catch {
      // Collision — retry with new code
    }
  }

  // Fallback: return original URL if all attempts fail
  return targetUrl;
}

export async function resolveShortLink(code: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(shortLinks)
    .where(eq(shortLinks.code, code))
    .limit(1);

  if (!row) return null;
  if (row.expiresAt && row.expiresAt < new Date()) return null;
  return row.targetUrl;
}
