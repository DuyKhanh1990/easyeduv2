/**
 * BIDV Crypto Service — Phase 1 scaffold
 * JWE (mã hóa body) và JWS (ký số) sẽ được triển khai ở Phase 2.
 *
 * Tài liệu tham khảo:
 *   JWE: https://openid.net/specs/draft-jones-json-web-encryption-02.html
 *   JWS: https://openid.net/specs/draft-jones-json-web-signature-04.html
 *
 * Thuật toán:
 *   JWE key management: A256KW (mặc định)
 *   JWE content encryption: A128GCM (mặc định)
 *   JWS: RS256 (RSA + SHA-256), Detached Content, truyền qua header X-JWS-Signature
 */

import crypto from "crypto";
import { CompactSign, compactVerify, GeneralEncrypt, importSPKI, importX509 } from "jose";

function normalizeSecretKey(value: string): Uint8Array {
  const trimmed = value.trim();
  const candidates = [
    Buffer.from(trimmed, "utf8"),
    Buffer.from(trimmed, "base64"),
    Buffer.from(trimmed, "base64url"),
    Buffer.from(trimmed, "hex"),
  ];
  const valid = candidates.find((key) => key.length === 16 || key.length === 24 || key.length === 32);
  if (!valid) {
    throw new Error("Symmetric key phải có độ dài 16, 24 hoặc 32 bytes");
  }
  return new Uint8Array(valid);
}

/**
 * Validate định dạng PEM certificate.
 * Trả về { ok, message }.
 */
export function validateCertificatePem(pem: string): { ok: boolean; message: string } {
  if (!pem || typeof pem !== "string") {
    return { ok: false, message: "Certificate trống" };
  }
  const trimmed = pem.trim();
  const validHeaders = [
    "-----BEGIN CERTIFICATE-----",
    "-----BEGIN PUBLIC KEY-----",
    "-----BEGIN X509 CERTIFICATE-----",
  ];
  if (!validHeaders.some(h => trimmed.startsWith(h))) {
    return { ok: false, message: "Certificate không đúng định dạng PEM (phải bắt đầu bằng -----BEGIN CERTIFICATE-----)" };
  }
  if (!trimmed.includes("-----END")) {
    return { ok: false, message: "Certificate không đầy đủ (thiếu dòng -----END...)" };
  }
  return { ok: true, message: "Certificate hợp lệ" };
}

/**
 * Validate định dạng PEM private key.
 */
export function validatePrivateKeyPem(pem: string): { ok: boolean; message: string } {
  if (!pem || typeof pem !== "string") {
    return { ok: false, message: "Private key trống" };
  }
  const trimmed = pem.trim();
  const validHeaders = [
    "-----BEGIN RSA PRIVATE KEY-----",
    "-----BEGIN PRIVATE KEY-----",
    "-----BEGIN EC PRIVATE KEY-----",
  ];
  if (!validHeaders.some(h => trimmed.startsWith(h))) {
    return { ok: false, message: "Private key không đúng định dạng PEM (phải bắt đầu bằng -----BEGIN RSA PRIVATE KEY----- hoặc -----BEGIN PRIVATE KEY-----)" };
  }
  if (!trimmed.includes("-----END")) {
    return { ok: false, message: "Private key không đầy đủ (thiếu dòng -----END...)" };
  }
  return { ok: true, message: "Private key hợp lệ" };
}

/**
 * Kiểm tra private key có thể sử dụng ký RS256 không (parse thử).
 */
export function validatePrivateKeyUsable(pem: string): { ok: boolean; message: string } {
  try {
    const key = crypto.createPrivateKey({ key: pem, format: "pem" });
    if (!key) return { ok: false, message: "Không parse được private key" };
    // Thử ký một message nhỏ
    const sign = crypto.createSign("SHA256");
    sign.update("test");
    sign.sign(key);
    return { ok: true, message: "Private key sử dụng được (RS256)" };
  } catch (err: any) {
    return { ok: false, message: `Private key lỗi: ${err?.message || "không rõ"}` };
  }
}

/**
 * Phase 2: Mã hóa body theo chuẩn JWE (General JWE JSON Serialization).
 * Dùng SymmetricKey (A256KW) + A128GCM.
 */
export async function encryptJwe(body: object, symmetricKey: string): Promise<string> {
  const key = normalizeSecretKey(symmetricKey);
  const jwe = await new GeneralEncrypt(new TextEncoder().encode(JSON.stringify(body)))
    .setProtectedHeader({ alg: key.byteLength === 16 ? "A128KW" : key.byteLength === 24 ? "A192KW" : "A256KW", enc: "A128GCM" })
    .addRecipient(key)
    .encrypt();
  return JSON.stringify(jwe);
}

/**
 * Phase 2: Ký body (đã mã hóa JWE) theo chuẩn JWS Detached Content (RS256).
 * Kết quả truyền vào header X-JWS-Signature.
 */
export async function signJws(payload: string, privateKeyPem: string): Promise<string> {
  const key = crypto.createPrivateKey({ key: privateKeyPem, format: "pem" });
  const compact = await new CompactSign(new TextEncoder().encode(payload))
    .setProtectedHeader({ alg: "RS256" })
    .sign(key);
  const parts = compact.split(".");
  return `${parts[0]}..${parts[2]}`;
}

/**
 * Phase 2: Verify JWS signature từ response BIDV.
 */
export async function verifyJws(signature: string, payload: string, certPem: string): Promise<boolean> {
  const key = certPem.includes("BEGIN CERTIFICATE")
    ? await importX509(certPem, "RS256")
    : await importSPKI(certPem, "RS256");
  const [protectedPart, , signaturePart] = signature.split(".");
  if (!protectedPart || !signaturePart) throw new Error("JWS detached không hợp lệ");
  const compact = `${protectedPart}.${Buffer.from(payload).toString("base64url")}.${signaturePart}`;
  const result = await compactVerify(compact, key);
  return result.protectedHeader.alg === "RS256";
}
