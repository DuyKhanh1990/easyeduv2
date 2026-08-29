import crypto from "crypto";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import {
  bidvReconciliationFiles,
  bidvReconciliationRecords,
  bidvReconciliationSessions,
  bidvLocationConfigs,
  systemSettings,
} from "@shared/schema";
import { db } from "../../db";
import { decrypt } from "../crypto.service";
import { encryptJwe, signJws, verifyJws } from "./bidv-crypto.service";
import { fetchOAuthToken, getApiUrl, type BidvEnvironment } from "./bidv.service";
import { getBidvRequestDate } from "@shared/bidv-reconciliation";

const RECONCILIATION_PATH = "/common/reconciliation/v1";
const DEFAULT_CHANNEL = "EASYEDU-RECONCILIATION";
const DEFAULT_USER_AGENT = "EasyEdu-BIDV-Reconciliation/1.0";

type SystemConfig = {
  environment: BidvEnvironment;
  clientId: string;
  clientSecret: string;
  symmetricKey: string;
  publicCert: string;
  responseCert: string;
  privateKey: string;
  providerId: string;
  channel: string;
  userAgent: string;
};

export type ParsedReconciliationRecord = {
  channelCode: string | null;
  serviceId: string | null;
  billId: string | null;
  customerId: string | null;
  amount: string;
  currency: string;
  traceNumber: string | null;
  transactionDate: Date | null;
  valueDate: Date | null;
  transactionType: string | null;
  bankStatus: string | null;
  bankDescription: string | null;
  externalTransactionId: string | null;
  rawData: string[];
};

export type ReconciliationFileSummary = {
  recordCount: number;
  totalAmount: string;
  generatedAt: string | null;
};

function toDate(date: string, time: string): Date | null {
  if (!/^\d{8}$/.test(date) || !/^\d{6}$/.test(time)) return null;
  const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}+07:00`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function text(value: string | undefined): string | null {
  const normalized = (value ?? "").trim();
  return normalized ? normalized : null;
}

export function parseReconciliationFile(rawContent: string): {
  records: ParsedReconciliationRecord[];
  summary: ReconciliationFileSummary;
} {
  const lines = rawContent.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.length > 0);
  const records: ParsedReconciliationRecord[] = [];
  let summary: ReconciliationFileSummary = { recordCount: 0, totalAmount: "0", generatedAt: null };

  for (const line of lines) {
    const fields = line.split("|");
    // BIDV detail lines have 22 fields and retain a trailing |. The footer has 3 fields.
    if (fields.length < 10) {
      summary = {
        recordCount: Number.parseInt(fields[0] ?? "0", 10) || 0,
        totalAmount: fields[1] ?? "0",
        generatedAt: fields[2] ?? null,
      };
      continue;
    }

    const amount = fields[5] ?? "0";
    const resultCode = text(fields[16]);
    records.push({
      channelCode: text(fields[0]),
      serviceId: text(fields[1]),
      billId: text(fields[3]),
      customerId: text(fields[4]),
      amount: /^-?\d+(?:\.\d+)?$/.test(amount.trim()) ? amount.trim() : "0",
      currency: text(fields[6]) ?? "VND",
      traceNumber: text(fields[7]),
      transactionDate: toDate(fields[9] ?? "", fields[8] ?? ""),
      valueDate: toDate(fields[11] ?? "", fields[10] ?? ""),
      transactionType: text(fields[18]),
      bankStatus: resultCode === "004" ? "bank_success_partner_failed" : resultCode === "005" ? "bank_failed_partner_success" : resultCode,
      bankDescription: resultCode ? `Kết quả đối soát BIDV: ${resultCode}` : null,
      externalTransactionId: text(fields[20]),
      rawData: fields,
    });
  }

  if (summary.recordCount === 0 && records.length > 0) {
    summary.recordCount = records.length;
    summary.totalAmount = records.reduce((sum, row) => sum + Number(row.amount), 0).toString();
  }
  return { records, summary };
}

async function getSystemConfig(): Promise<SystemConfig> {
  const settings = await db.select().from(systemSettings);
  const raw: Record<string, string> = {};
  for (const setting of settings) {
    if (setting.key.startsWith("bidv.")) raw[setting.key.slice(5)] = setting.value;
  }
  const readSecret = (key: string) => {
    const value = raw[key] ?? "";
    return value ? decrypt(value) : "";
  };
  const environment = raw.environment === "Production" ? "Production" : "UAT";
  const config: SystemConfig = {
    environment,
    clientId: raw.client_id ?? "",
    clientSecret: readSecret("client_secret"),
    symmetricKey: readSecret("symmetric_key"),
    publicCert: raw.public_cert ?? "",
    responseCert: raw.bidv_response_cert ?? "",
    privateKey: readSecret("private_key"),
    providerId: raw.provider_id ?? "",
    channel: raw.channel ?? DEFAULT_CHANNEL,
    userAgent: raw.user_agent ?? DEFAULT_USER_AGENT,
  };
  const missing = Object.entries(config)
    .filter(([key, value]) => ["environment", "channel", "userAgent"].includes(key) ? false : !value)
    .map(([key]) => key);
  if (missing.length > 0) throw new Error(`Thiếu cấu hình BIDV: ${missing.join(", ")}`);
  return config;
}

function requestId(): string {
  return crypto.randomInt(100000000000, 999999999999).toString();
}

function certificateHeader(certificate: string): string {
  return certificate
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");
}

function redactResponseMetadata(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of ["timestamp", "x-api-interaction-id", "x-jws-signature"]) {
    const value = headers.get(name);
    if (value) result[name] = name === "x-jws-signature" ? "[redacted]" : value;
  }
  return result;
}

function parseResponseBody(body: string): Record<string, any> {
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object") throw new Error("Response BIDV không phải JSON object");
    return parsed;
  } catch {
    throw new Error("Response BIDV không đúng định dạng JSON");
  }
}

export async function getReconciliationConfig(): Promise<{ providerId: string; environment: BidvEnvironment }> {
  const config = await getSystemConfig();
  return { providerId: config.providerId, environment: config.environment };
}

export async function requestBidvReconciliation(params: {
  sessionId: string;
  reconcileDate: string;
  serviceId?: string | null;
  locationId?: string | null;
  requestedBy?: string | null;
  replaceExisting?: boolean;
  forceRefresh?: boolean;
}): Promise<any> {
  const config = await getSystemConfig();
  const bidvRequestDate = getBidvRequestDate(params.reconcileDate);
  const startedAt = new Date();
  let interactionId: string | null = null;
  await db.update(bidvReconciliationSessions)
    .set({
      status: "running",
      serviceId: params.serviceId ?? null,
      ...(params.locationId !== undefined ? { locationId: params.locationId } : {}),
      startedAt,
      updatedAt: startedAt,
      errorCode: null,
      errorMessage: null,
    })
    .where(eq(bidvReconciliationSessions.id, params.sessionId));

  try {
    const oauth = await fetchOAuthToken({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      environment: config.environment,
      scope: "ewallet",
    });
    if (!oauth.ok || !oauth.token) throw new Error(oauth.error || "Không lấy được access token BIDV");

    interactionId = requestId();
    const requestBody = {
      type: "1",
      providerId: config.providerId,
      ...(params.serviceId ? { serviceId: params.serviceId } : {}),
      transDate: bidvRequestDate.replace(/-/g, ""),
      fileType: "1",
    };
    const encryptedBody = await encryptJwe(requestBody, config.symmetricKey);
    const signature = await signJws(encryptedBody, config.privateKey);
    const timestamp = new Date().toISOString();
    const response = await fetch(getApiUrl(config.environment, RECONCILIATION_PATH), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${oauth.token}`,
        "Content-Type": "application/json",
        "User-Agent": config.userAgent,
        Channel: config.channel,
        Timestamp: timestamp,
        "X-API-Interaction-ID": interactionId,
        "X-Idempotency-Key": params.forceRefresh
          ? `reconciliation-refresh:${config.providerId}:${bidvRequestDate}:${params.sessionId}:${interactionId}`
          : `reconciliation:${config.providerId}:${bidvRequestDate}:1`,
        "X-JWS-Signature": signature,
        "X-Client-Certificate": certificateHeader(config.publicCert),
      },
      body: encryptedBody,
      signal: AbortSignal.timeout(45_000),
    });
    const responseText = await response.text();
    if (!response.ok) throw new Error(`BIDV HTTP ${response.status}: ${responseText.slice(0, 300)}`);

    const responseSignature = response.headers.get("x-jws-signature");
    let signatureVerified = false;
    if (responseSignature) {
      signatureVerified = await verifyJws(responseSignature, responseText, config.responseCert);
      if (!signatureVerified) throw new Error("Không xác thực được chữ ký response BIDV");
    }
    const responseBody = parseResponseBody(responseText);
    const errorCode = String(responseBody.errorCode ?? "");
    if (errorCode !== "000") {
      const error = new Error(`BIDV ${errorCode}: ${responseBody.errorDesc ?? "Lỗi không xác định"}`);
      (error as any).code = errorCode;
      throw error;
    }
    const fileContentBase64 = String(responseBody.fileContent ?? "");
    const rawBytes = fileContentBase64 ? Buffer.from(fileContentBase64, "base64") : Buffer.alloc(0);
    const rawContent = rawBytes.toString("utf8");
    const parsed = parseReconciliationFile(rawContent);
    const checksum = crypto.createHash("sha256").update(rawBytes).digest("hex");
    const totalAmount = parsed.summary.totalAmount || "0";
    const status = parsed.records.length === 0 ? "empty" : "succeeded";

    return await db.transaction(async (tx) => {
      if (params.replaceExisting) {
        // Chỉ thay dữ liệu cũ sau khi BIDV đã trả file hợp lệ.
        await tx.delete(bidvReconciliationRecords)
          .where(eq(bidvReconciliationRecords.sessionId, params.sessionId));
        await tx.delete(bidvReconciliationFiles)
          .where(eq(bidvReconciliationFiles.sessionId, params.sessionId));
      }

      await tx.insert(bidvReconciliationFiles).values({
        sessionId: params.sessionId,
        fileName: text(responseBody.fileName),
        mimeType: "text/plain",
        size: rawBytes.length,
        checksum,
        rawContent,
        rawResponseMetadata: redactResponseMetadata(response.headers),
        signatureVerified,
        encrypted: false,
      });
      if (parsed.records.length > 0) {
        await tx.insert(bidvReconciliationRecords).values(parsed.records.map((record) => ({
          sessionId: params.sessionId,
          externalTransactionId: record.externalTransactionId,
          traceNumber: record.traceNumber,
          vaCode: record.customerId,
          billId: record.billId,
          transactionDate: record.transactionDate,
          valueDate: record.valueDate,
          amount: record.amount,
          transactionType: record.transactionType,
          bankStatus: record.bankStatus,
          bankDescription: record.bankDescription,
          currency: record.currency,
          channelCode: record.channelCode,
          serviceId: record.serviceId,
          rawData: record.rawData,
        })));
      }
      const [session] = await tx.update(bidvReconciliationSessions)
        .set({
          status,
          completedAt: new Date(),
          recordCount: parsed.records.length,
          totalAmount,
          requestId: interactionId,
          signatureVerified,
          updatedAt: new Date(),
        })
        .where(eq(bidvReconciliationSessions.id, params.sessionId))
        .returning();
      return session;
    });
  } catch (error: any) {
    const [session] = await db.update(bidvReconciliationSessions)
      .set({
        status: "failed",
        completedAt: new Date(),
        errorCode: error?.code ? String(error.code) : "CLIENT_ERROR",
        errorMessage: String(error?.message || "Không thể lấy file đối soát BIDV").slice(0, 1000),
        requestId: interactionId,
        updatedAt: new Date(),
      })
      .where(eq(bidvReconciliationSessions.id, params.sessionId))
      .returning();
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { session });
  }
}

export async function resolveReconciliationServiceId(locationId?: string | null): Promise<string | null> {
  if (!locationId) return null;
  const [config] = await db.select({ serviceId: bidvLocationConfigs.serviceId })
    .from(bidvLocationConfigs)
    .where(eq(bidvLocationConfigs.locationId, locationId))
    .limit(1);
  return config?.serviceId ?? null;
}

export async function listReconciliationSessions(params: {
  page: number;
  pageSize: number;
  locationId?: string | null;
}) {
  const conditions = params.locationId
    ? [or(
        eq(bidvReconciliationSessions.locationId, params.locationId),
        isNull(bidvReconciliationSessions.locationId),
      )]
    : [];
  const where = conditions.length ? and(...conditions) : undefined;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` })
    .from(bidvReconciliationSessions).where(where);
  const rows = await db.select().from(bidvReconciliationSessions)
    .where(where)
    .orderBy(desc(bidvReconciliationSessions.requestedAt))
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);
  return { rows, total: total ?? 0 };
}

export async function getReconciliationSession(id: string) {
  const [session] = await db.select().from(bidvReconciliationSessions)
    .where(eq(bidvReconciliationSessions.id, id)).limit(1);
  if (!session) return null;
  const [file] = await db.select({
    id: bidvReconciliationFiles.id,
    fileName: bidvReconciliationFiles.fileName,
    mimeType: bidvReconciliationFiles.mimeType,
    size: bidvReconciliationFiles.size,
    checksum: bidvReconciliationFiles.checksum,
    signatureVerified: bidvReconciliationFiles.signatureVerified,
    createdAt: bidvReconciliationFiles.createdAt,
  }).from(bidvReconciliationFiles).where(eq(bidvReconciliationFiles.sessionId, id)).limit(1);
  return { session, file: file ?? null };
}

export async function getReconciliationFile(id: string) {
  const [file] = await db.select({
    fileName: bidvReconciliationFiles.fileName,
    mimeType: bidvReconciliationFiles.mimeType,
    rawContent: bidvReconciliationFiles.rawContent,
  }).from(bidvReconciliationFiles)
    .where(eq(bidvReconciliationFiles.sessionId, id))
    .limit(1);
  return file ?? null;
}

export async function listReconciliationRecords(id: string, page: number, pageSize: number) {
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` })
    .from(bidvReconciliationRecords).where(eq(bidvReconciliationRecords.sessionId, id));
  const rows = await db.select().from(bidvReconciliationRecords)
    .where(eq(bidvReconciliationRecords.sessionId, id))
    .orderBy(asc(bidvReconciliationRecords.transactionDate), asc(bidvReconciliationRecords.id))
    .limit(pageSize).offset((page - 1) * pageSize);
  return { rows, total: total ?? 0 };
}