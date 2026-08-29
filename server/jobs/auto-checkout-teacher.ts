/**
 * Auto checkout job — Teacher attendance
 *
 * Chạy định kỳ mỗi 10 phút.
 * Điều kiện tự động ghi giờ ra:
 *   1. Buổi học đã kết thúc (session_date + end_time < NOW())
 *   2. Giáo viên đã bấm tham gia → check_in_at IS NOT NULL
 *   3. Giáo viên quên bấm kết thúc → check_out_at IS NULL
 *
 * check_out_at được set = giờ kết thúc lịch của buổi học (không phải NOW()).
 */

import { db } from "../storage/base";
import { sql } from "drizzle-orm";

const INTERVAL_MS = 10 * 60 * 1000; // 10 phút

async function runAutoCheckout(): Promise<void> {
  try {
    const result = await db.execute(sql`
      UPDATE teacher_attendance ta
      SET
        check_out_at = (cs.session_date + st.end_time::time) AT TIME ZONE 'Asia/Ho_Chi_Minh' AT TIME ZONE 'UTC',
        updated_at   = NOW()
      FROM class_sessions cs
      JOIN shift_templates st ON st.id = cs.shift_template_id
      WHERE ta.class_session_id = cs.id
        AND ta.check_in_at IS NOT NULL
        AND ta.check_out_at IS NULL
        -- buổi học đã kết thúc (giờ UTC hiện tại > giờ kết thúc lịch)
        AND (cs.session_date + st.end_time::time) AT TIME ZONE 'Asia/Ho_Chi_Minh' < NOW()
    `);

    const count = (result as any).rowCount ?? (result as any).count ?? 0;
    if (count > 0) {
      console.log(`[AutoCheckout] Tự động ghi giờ ra cho ${count} giáo viên quên bấm kết thúc`);
    }
  } catch (err: any) {
    console.error("[AutoCheckout] Lỗi khi chạy job:", err.message);
  }
}

export function startAutoCheckoutJob(): void {
  // Chạy lần đầu ngay khi server khởi động (delay nhỏ để DB kịp warm-up)
  setTimeout(() => runAutoCheckout(), 60_000);

  // Sau đó chạy định kỳ mỗi 10 phút
  setInterval(() => runAutoCheckout(), INTERVAL_MS);

  console.log("[AutoCheckout] Job khởi động — tự động ghi giờ ra mỗi 10 phút");
}
