/**
 * Dọn các Expo push token "rác" thuộc project Expo cũ (sau khi app đổi sang
 * project/tài khoản Expo mới để build APK).
 *
 * Nguyên tắc: KHÔNG đoán projectId cũ. Chỉ tin vào projectId HIỆN HÀNH
 * (biến môi trường EXPO_PROJECT_ID) — mọi token có expo_project_id khác giá trị
 * đó coi là rác. Token có expo_project_id = NULL (đăng ký từ trước khi field
 * này tồn tại) KHÔNG bị đụng tới — không đủ căn cứ để coi là rác.
 *
 * Mặc định chạy DRY-RUN (chỉ liệt kê, không sửa DB).
 * Chạy thật: `npx tsx scripts/cleanup-stale-expo-tokens.ts --confirm`
 */
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
const currentProjectId = process.env.EXPO_PROJECT_ID;
const confirm = process.argv.includes("--confirm");

if (!connectionString) {
  console.error("[cleanup-stale-expo-tokens] DATABASE_URL không được set.");
  process.exit(1);
}
if (!currentProjectId) {
  console.error(
    "[cleanup-stale-expo-tokens] EXPO_PROJECT_ID không được set — không có căn cứ để xác định project hiện hành. Dừng lại."
  );
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });

async function main() {
  const stale = await pool.query(
    `SELECT id, user_id, platform, expo_project_id, is_active, updated_at
     FROM push_tokens
     WHERE is_active = true
       AND expo_project_id IS NOT NULL
       AND expo_project_id <> $1`,
    [currentProjectId]
  );

  console.log(
    `[cleanup-stale-expo-tokens] Project hiện hành: ${currentProjectId}`
  );
  console.log(
    `[cleanup-stale-expo-tokens] Tìm thấy ${stale.rowCount} token active thuộc project khác:`
  );
  for (const row of stale.rows) {
    console.log(
      `  - id=${row.id} user=${row.user_id} platform=${row.platform} expoProjectId=${row.expo_project_id} updatedAt=${row.updated_at}`
    );
  }

  if (!confirm) {
    console.log(
      "\n[cleanup-stale-expo-tokens] DRY-RUN — không có gì bị thay đổi. Chạy lại với --confirm để soft-delete các token trên."
    );
    return;
  }

  if (stale.rowCount === 0) {
    console.log("[cleanup-stale-expo-tokens] Không có gì để dọn.");
    return;
  }

  const result = await pool.query(
    `UPDATE push_tokens
     SET is_active = false, updated_at = now()
     WHERE is_active = true
       AND expo_project_id IS NOT NULL
       AND expo_project_id <> $1`,
    [currentProjectId]
  );
  console.log(
    `[cleanup-stale-expo-tokens] Đã soft-delete (is_active=false) ${result.rowCount} token thuộc project cũ.`
  );
}

main()
  .catch((err) => {
    console.error("[cleanup-stale-expo-tokens] Lỗi:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
