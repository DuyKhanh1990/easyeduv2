import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import crypto from "crypto";
import https from "https";
import http from "http";
import fs from "fs";

const endpoint = process.env.S3_ENDPOINT!;
const region = process.env.S3_REGION!;
const bucket = process.env.S3_BUCKET!;
const folder = process.env.S3_FOLDER_PORTAL || "uploads";
const aliasHost = process.env.S3_HOSTNAME || process.env.S3_ALIAS_HOST!;
const protocol = process.env.S3_PROTOCOL || "https";
const backupFolder = (process.env.S3_BACKUP_FOLDER || `${folder}/backups`)
  .replace(/^\/+|\/+$/g, "");
const configuredCenterId = (process.env.CENTER_ID ?? "").trim();
const centerId = configuredCenterId.replace(/[^a-zA-Z0-9._-]/g, "_");
const portalUploadFolder = centerId ? `${folder}/${centerId}` : folder;

const accessKeyId = (process.env.AWS_ACCESS_KEY_ID ?? "").trim();
const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY ?? "").trim();

if (!centerId) {
  console.warn(
    "[S3] CENTER_ID is not configured; normal uploads will use the legacy shared folder."
  );
}

if (!accessKeyId || !secretAccessKey) {
  console.error("[S3] WARNING: AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY is missing or empty!");
} else {
  console.log("[S3] Credentials loaded, key length:", accessKeyId.length, "/", secretAccessKey.length);
}

// Keep s3Client export for any code that imports it (e.g. getSignedUrl)
export const s3Client = new S3Client({
  endpoint,
  region,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

// ---------------------------------------------------------------------------
// Raw AWS Signature V4 PUT — bypasses SDK checksum/ACL issues on Ceph-based
// S3-compatible storage (CMC Telecom, Ceph, MinIO, etc.)
// ---------------------------------------------------------------------------

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function sha256hex(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function buildPortalUploadKey(filename: string, timestamp: number): string {
  const strippedName = filename.startsWith(folder + "/")
    ? filename.slice(folder.length + 1)
    : filename;
  const safeName = strippedName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  return `${portalUploadFolder}/${timestamp}_${safeName}`;
}

async function putObjectRaw(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  const endpointUrl = new URL(endpoint);
  const host = endpointUrl.hostname;
  const basePath = endpointUrl.pathname.replace(/\/$/, "");
  const path = `${basePath}/${bucket}/${key}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = sha256hex(body);

  const headers: Record<string, string> = {
    "host": host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    "x-amz-acl": "public-read",
    "content-type": contentType,
    "content-length": String(body.length),
  };

  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers).sort()
    .map((k) => `${k}:${headers[k]}\n`)
    .join("");

  const canonicalRequest = [
    "PUT",
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256hex(canonicalRequest),
  ].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), "s3"),
    "aws4_request"
  );
  const signature = hmac(signingKey, stringToSign).toString("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  await new Promise<void>((resolve, reject) => {
    const useHttps = endpointUrl.protocol === "https:";
    const port = endpointUrl.port
      ? Number(endpointUrl.port)
      : useHttps ? 443 : 80;

    const options = {
      hostname: host,
      port,
      path,
      method: "PUT",
      headers: {
        ...headers,
        Authorization: authorization,
      },
    };

    const req = (useHttps ? https : http).request(options, (res) => {
      let responseBody = "";
      res.on("data", (chunk) => (responseBody += chunk));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(
            new Error(
              `S3 PUT failed: HTTP ${res.statusCode}\n${responseBody}`
            )
          );
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function uploadFileToS3(
  fileBuffer: Buffer | Readable,
  filename: string,
  mimetype: string
): Promise<string> {
  const timestamp = Date.now();
  const key = buildPortalUploadKey(filename, timestamp);
  console.log("S3 KEY:", key);

  const body =
    fileBuffer instanceof Readable ? await streamToBuffer(fileBuffer) : fileBuffer;

  try {
    await putObjectRaw(key, body, mimetype);
  } catch (err) {
    console.error("[S3 Upload Error]", err);
    throw new Error("Failed to upload file to S3");
  }

  const fileUrl = `${protocol}://${aliasHost}/${bucket}/${key}`;
  return fileUrl;
}

/**
 * Upload a file from disk to S3 by streaming — không load toàn bộ file vào RAM.
 * Dùng cho file lớn (video, audio) để tránh OOM.
 */
export async function uploadFileToS3FromDisk(
  filePath: string,
  fileSize: number,
  filename: string,
  mimetype: string
): Promise<string> {
  const timestamp = Date.now();
  const key = buildPortalUploadKey(filename, timestamp);
  console.log("S3 KEY:", key);

  try {
    await putObjectRawStream(key, filePath, fileSize, mimetype);
  } catch (err) {
    console.error("[S3 Upload Error]", err);
    throw new Error("Failed to upload file to S3");
  }

  const fileUrl = `${protocol}://${aliasHost}/${bucket}/${key}`;
  return fileUrl;
}

/**
 * Upload a database backup as a private S3 object.
 * Unlike normal portal uploads, this intentionally returns only the object key
 * and never exposes a public URL.
 */
export async function uploadBackupFileToS3FromDisk(
  filePath: string,
  fileSize: number,
  centerId: string,
  backupId: string,
): Promise<string> {
  const requiredConfig = [
    ["S3_ENDPOINT", endpoint],
    ["S3_REGION", region],
    ["S3_BUCKET", bucket],
    ["AWS_ACCESS_KEY_ID", accessKeyId],
    ["AWS_SECRET_ACCESS_KEY", secretAccessKey],
  ] as const;
  const missing = requiredConfig.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Thiếu cấu hình S3 backup: ${missing.join(", ")}`);
  }

  const safeCenterId = centerId.replace(/[^a-zA-Z0-9._-]/g, "_");
  const safeBackupId = backupId.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${backupFolder}/${safeCenterId}/${safeBackupId}.dump`;

  try {
    await putObjectRawStream(
      key,
      filePath,
      fileSize,
      "application/octet-stream",
      "private",
    );
  } catch (err) {
    console.error("[S3 Backup Upload Error]", err);
    throw new Error("Không thể lưu file backup lên S3.");
  }

  return key;
}

/**
 * Delete one database backup object. Restrict deletion to the backup prefix so
 * retention cleanup cannot accidentally remove a normal portal upload.
 */
export async function deleteBackupFileFromS3(storageKey: string): Promise<void> {
  const key = storageKey.trim();
  if (!key) return;

  if (!key.startsWith(`${backupFolder}/`)) {
    throw new Error("Storage key không thuộc thư mục backup hợp lệ.");
  }

  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
  } catch (err) {
    console.error("[S3 Backup Delete Error]", err);
    throw new Error("Không thể xóa file backup cũ trên S3.");
  }
}

/**
 * Tính SHA256 của file bằng cách đọc stream (không buffer vào RAM).
 */
function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/**
 * PUT file lên S3 bằng stream — ký header AWS V4, pipe readStream thẳng vào request.
 */
async function putObjectRawStream(
  key: string,
  filePath: string,
  fileSize: number,
  contentType: string,
  acl: "public-read" | "private" = "public-read",
): Promise<void> {
  const payloadHash = await computeFileSha256(filePath);

  const endpointUrl = new URL(endpoint);
  const host = endpointUrl.hostname;
  const basePath = endpointUrl.pathname.replace(/\/$/, "");
  const path = `${basePath}/${bucket}/${key}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);

  const headers: Record<string, string> = {
    "host": host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    "x-amz-acl": acl,
    "content-type": contentType,
    "content-length": String(fileSize),
  };

  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers).sort()
    .map((k) => `${k}:${headers[k]}\n`)
    .join("");

  const canonicalRequest = [
    "PUT",
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256hex(canonicalRequest),
  ].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), "s3"),
    "aws4_request"
  );
  const signature = hmac(signingKey, stringToSign).toString("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  await new Promise<void>((resolve, reject) => {
    const useHttps = endpointUrl.protocol === "https:";
    const port = endpointUrl.port
      ? Number(endpointUrl.port)
      : useHttps ? 443 : 80;

    const options = {
      hostname: host,
      port,
      path,
      method: "PUT",
      headers: {
        ...headers,
        Authorization: authorization,
      },
    };

    const req = (useHttps ? https : http).request(options, (res) => {
      let responseBody = "";
      res.on("data", (chunk) => (responseBody += chunk));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`S3 PUT failed: HTTP ${res.statusCode}\n${responseBody}`));
        }
      });
    });

    req.on("error", reject);

    // Pipe file stream thẳng vào request — không buffer vào RAM
    const fileStream = fs.createReadStream(filePath);
    fileStream.on("error", reject);
    fileStream.pipe(req);
  });
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}
