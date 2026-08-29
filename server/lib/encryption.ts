import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  // Ưu tiên AI_ENCRYPT_SECRET trước để tương thích với production (k8s)
  // SYSTEM_ENCRYPTION_KEY chỉ dùng nếu AI_ENCRYPT_SECRET không có
  const secret =
    process.env.AI_ENCRYPT_SECRET ||
    process.env.SYSTEM_ENCRYPTION_KEY ||
    process.env.ENCRYPTION_KEY ||
    "fallback_key_please_set";
  return createHash("sha256").update(secret).digest();
}

export function encrypt(text: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = (cipher as any).getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(data: string): string {
  const key = getKey();
  const buf = Buffer.from(data, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  (decipher as any).setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
