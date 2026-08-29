import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const ENC_PREFIX = "enc:";

function getKey(): Buffer {
  const envKey = process.env.SYSTEM_ENCRYPTION_KEY;
  if (!envKey) {
    throw new Error("SYSTEM_ENCRYPTION_KEY is required");
  }
  return crypto.createHash("sha256").update(envKey).digest();
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext || !ciphertext.startsWith(ENC_PREFIX)) return ciphertext;
  const key = getKey();
  const inner = ciphertext.slice(ENC_PREFIX.length);
  const parts = inner.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted value format");
  const [ivHex, tagHex, encHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}

export function isEncrypted(value: string): boolean {
  return typeof value === "string" && value.startsWith(ENC_PREFIX);
}
