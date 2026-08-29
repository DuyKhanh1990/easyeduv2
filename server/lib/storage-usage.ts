/**
 * storage-usage.ts
 * Tiện ích theo dõi dung lượng file đã upload lên S3.
 * - Tổng dung lượng lưu vào system_settings key "s3UsedBytes".
 * - Mỗi URL → size lưu vào bảng s3_file_logs để trừ đúng khi xóa.
 */
import { db } from "../db";
import { eq } from "drizzle-orm";
import { systemSettings, s3FileLogs } from "@shared/schema";

const KEY_S3_BYTES = "s3UsedBytes";

/**
 * Cộng thêm bytes vào tổng dung lượng S3 đã dùng.
 * Gọi sau mỗi lần upload thành công.
 */
export async function addS3Bytes(bytes: number): Promise<void> {
  if (!bytes || bytes <= 0) return;
  try {
    const rows = await db.select().from(systemSettings).where(eq(systemSettings.key, KEY_S3_BYTES));
    const current = rows.length > 0 ? parseInt(rows[0].value) || 0 : 0;
    const next = Math.max(0, current + bytes);
    await db
      .insert(systemSettings)
      .values({ key: KEY_S3_BYTES, value: String(next) })
      .onConflictDoUpdate({ target: systemSettings.key, set: { value: String(next), updatedAt: new Date() } });
  } catch (err) {
    console.warn("[StorageUsage] Không thể cập nhật s3UsedBytes (add):", err);
  }
}

/**
 * Trừ bytes khỏi tổng dung lượng S3 đã dùng.
 * Gọi sau khi xóa file thành công.
 */
export async function subtractS3Bytes(bytes: number): Promise<void> {
  if (!bytes || bytes <= 0) return;
  try {
    const rows = await db.select().from(systemSettings).where(eq(systemSettings.key, KEY_S3_BYTES));
    const current = rows.length > 0 ? parseInt(rows[0].value) || 0 : 0;
    const next = Math.max(0, current - bytes);
    await db
      .insert(systemSettings)
      .values({ key: KEY_S3_BYTES, value: String(next) })
      .onConflictDoUpdate({ target: systemSettings.key, set: { value: String(next), updatedAt: new Date() } });
  } catch (err) {
    console.warn("[StorageUsage] Không thể cập nhật s3UsedBytes (subtract):", err);
  }
}

/**
 * Lưu mapping URL → size vào s3_file_logs.
 * Gọi ngay sau addS3Bytes khi upload thành công.
 */
export async function recordFileUpload(url: string, bytes: number): Promise<void> {
  if (!url || !bytes || bytes <= 0) return;
  try {
    await db
      .insert(s3FileLogs)
      .values({ url, sizeBytes: bytes })
      .onConflictDoNothing();
  } catch (err) {
    console.warn("[StorageUsage] Không thể ghi s3_file_logs:", err);
  }
}

/**
 * Tra cứu size theo URL, trừ khỏi tổng, và xóa bản ghi log.
 * Gọi trước hoặc sau khi xóa DB record chứa URL file.
 * Nếu URL không tồn tại trong log thì bỏ qua (không throw).
 */
export async function subtractFileByUrl(url: string): Promise<void> {
  if (!url) return;
  try {
    const rows = await db.select().from(s3FileLogs).where(eq(s3FileLogs.url, url));
    if (rows.length === 0) return;
    const bytes = rows[0].sizeBytes;
    await Promise.all([
      subtractS3Bytes(bytes),
      db.delete(s3FileLogs).where(eq(s3FileLogs.url, url)),
    ]);
  } catch (err) {
    console.warn("[StorageUsage] subtractFileByUrl lỗi:", url, err);
  }
}

/**
 * Trừ nhiều URLs cùng lúc (dùng cho xóa post có nhiều ảnh, hay content có nhiều attachment).
 */
export async function subtractFilesByUrls(urls: string[]): Promise<void> {
  const validUrls = (urls ?? []).filter(Boolean);
  if (validUrls.length === 0) return;
  await Promise.all(validUrls.map(subtractFileByUrl));
}

/**
 * Đọc tổng dung lượng S3 hiện tại (bytes).
 */
export async function getS3UsedBytes(): Promise<number> {
  const rows = await db.select().from(systemSettings).where(eq(systemSettings.key, KEY_S3_BYTES));
  return rows.length > 0 ? parseInt(rows[0].value) || 0 : 0;
}
