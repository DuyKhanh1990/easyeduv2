import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const ENC_PREFIX = "enc:";

function getKeyCandidates(): Buffer[] {
  // AI_ENCRYPT_SECRET is the current production key. Keep SYSTEM_ENCRYPTION_KEY
  // as a fallback so existing encrypted rows remain readable during migration.
  const secrets = [
    process.env.AI_ENCRYPT_SECRET,
    process.env.SYSTEM_ENCRYPTION_KEY,
  ].filter((value): value is string => Boolean(value));

  if (secrets.length === 0) {
    throw new Error("AI_ENCRYPT_SECRET or SYSTEM_ENCRYPTION_KEY is required");
  }

  return secrets.map((secret) => crypto.createHash("sha256").update(secret).digest());
}

function getKey(): Buffer {
  return getKeyCandidates()[0];
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
  const inner = ciphertext.slice(ENC_PREFIX.length);
  const parts = inner.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted value format");
  const [ivHex, tagHex, encHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");

  let lastError: unknown;
  for (const key of getKeyCandidates()) {
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Không thể giải mã giá trị đã lưu");
}

export function isEncrypted(value: string): boolean {
  return typeof value === "string" && value.startsWith(ENC_PREFIX);
}
