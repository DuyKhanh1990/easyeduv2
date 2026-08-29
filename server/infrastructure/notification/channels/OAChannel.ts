import { db } from "../../../storage/base";
import { zaloOaConfigs, centerConfig } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { decrypt, encrypt } from "../../../lib/encryption";
import type { INotificationChannel, ChannelPayload } from "./INotificationChannel";
import { notificationRepository } from "../repositories/NotificationRepository";
import { createShortLink } from "../../../lib/shortlink";

const OA_CS_URL = "https://openapi.zalo.me/v3.0/oa/message/cs";

const ZALO_MINI_APP_ID = process.env.ZALO_MINI_APP_ID ?? "172427016861458518";

function buildMiniAppLink(path: string, query?: Record<string, string>): string {
  const queryStr = query ? "?" + new URLSearchParams(query).toString() : "";
  const fullPath = encodeURIComponent(path + queryStr);
  return `https://zalo.me/s/${ZALO_MINI_APP_ID}?path=${fullPath}`;
}

function buildDeepLinkUrl(type: string, data: Record<string, unknown>, crmUrl?: string): string {
  const rawDate = data._rawDate as string | null | undefined;
  const centerParam = crmUrl ? { center: crmUrl } : undefined;

  const withCenter = (extra?: Record<string, string>) =>
    centerParam ? { ...extra, ...centerParam } : extra;

  switch (type) {
    case "attendance_result":
    case "attendance_reminder":
    case "session_content":
    case "teacher_feedback":
      return rawDate
        ? buildMiniAppLink("/my-space/calendar", withCenter({ date: rawDate }))
        : buildMiniAppLink("/my-space/calendar", centerParam);

    case "class_changed":
    case "schedule_update_session":
    case "schedule_cancel_session":
      return rawDate
        ? buildMiniAppLink("/my-space/calendar", withCenter({ date: rawDate }))
        : buildMiniAppLink("/my-space/calendar", centerParam);

    case "schedule_update_cycle":
    case "schedule_exclude_dates":
      return rawDate
        ? buildMiniAppLink("/my-space/calendar", withCenter({ date: rawDate }))
        : buildMiniAppLink("/my-space/calendar", centerParam);

    case "homework_score":
      return rawDate && rawDate.length >= 7
        ? buildMiniAppLink("/my-space/assignments", withCenter({ month: rawDate.substring(0, 7) }))
        : buildMiniAppLink("/my-space/assignments", centerParam);

    case "exam_score":
      return buildMiniAppLink("/my-space/assignments", centerParam);

    case "score_sheet":
      return buildMiniAppLink("/my-space/score-sheet", centerParam);

    case "invoice_created":
    case "invoice_paid":
    case "tuition_due":
      return buildMiniAppLink("/my-space/invoices", centerParam);

    default:
      return crmUrl
        ? buildMiniAppLink("/", centerParam)
        : `https://zalo.me/s/${ZALO_MINI_APP_ID}`;
  }
}

const ATTENDANCE_STATUS_ICONS: Record<string, string> = {
  "Có học":          "✅",
  "Vắng":            "❌",
  "Chờ học bù":      "⏳",
  "Đã học bù":       "🔄",
  "Huỷ":             "🚫",
  "Chưa điểm danh":  "⏱️",
};

function attendanceStatusLine(status: string): string {
  const icon = ATTENDANCE_STATUS_ICONS[status] ?? "📌";
  return `${icon} Trạng thái: ${status.toUpperCase()}`;
}

function buildButtons(type: string, data: Record<string, unknown>, crmUrl?: string) {
  const deepLink = buildDeepLinkUrl(type, data, crmUrl);
  const miniAppBtn = {
    title: "⚡ Xem chi tiết",
    type: "oa.open.url",
    payload: deepLink,
  };

  if (type === "attendance_result") {
    return [
      {
        title: "💬 Để lại lời nhắn",
        type: "oa.query.show",
        payload: "Tôi muốn phản hồi về kết quả điểm danh này",
      },
      miniAppBtn,
    ];
  }

  return [miniAppBtn];
}

const OA_TEMPLATES: Record<string, (d: Record<string, unknown>) => string> = {
  attendance_result: (d) =>
    `🔔 KẾT QUẢ ĐIỂM DANH\n\n👤 Học viên: ${d.studentName}\n🏫 Lớp học: ${d.className}\n📅 Buổi học: ${d.sessionDate}\n${attendanceStatusLine(String(d.attendanceStatus))}\n👩‍🏫 Giáo viên: ${d.teacherName}`,
  attendance_reminder: (d) =>
    `🔔 NHẮC LỊCH HỌC\n\n👤 Học viên: ${d.studentName}\n🏫 Lớp: ${d.className}\n⏰ Thời gian: ${d.time}\n👩‍🏫 Giáo viên: ${d.teacher}`,
  tuition_due: (d) =>
    `💰 NHẮC HỌC PHÍ\n\n👤 Học viên: ${d.studentName}\n💵 Số tiền: ${d.amount}\n📅 Hạn thanh toán: ${d.deadline}`,
  class_changed: (d) =>
    `📢 THÔNG BÁO ĐỔI LỊCH\n\n👤 Học viên: ${d.studentName}\n🏫 Lớp: ${d.className}\n🗓️ Lịch mới: ${d.newTime}`,
  schedule_update_session: (d) =>
    `📅 CẬP NHẬT BUỔI HỌC\n\n🏫 Lớp: ${d.className}\n🔴 Cũ: ${d.oldWeekday} ${d.oldDate} ${d.oldTime}\n🟢 Mới: ${d.newWeekday} ${d.newDate} ${d.newTime}`,
  schedule_cancel_session: (d) =>
    `🚫 HUỶ BUỔI HỌC\n\n🏫 Lớp: ${d.className}\n📅 Ngày: ${d.weekday} ${d.date} ${d.time}${d.reason ? `\n📝 Lý do: ${d.reason}` : ""}`,
  schedule_update_cycle: (d) =>
    `🗓️ CẬP NHẬT LỊCH HỌC\n\n🏫 Lớp: ${d.className}\n📅 Lịch mới: ${d.newWeekdays}${d.reason ? `\n📝 Lý do: ${d.reason}` : ""}`,
  schedule_exclude_dates: (d) =>
    `📅 LỊCH NGHỈ\n\n🏫 Lớp: ${d.className}\n▶️ Từ: ${d.fromWeekday} ${d.fromDate}${d.fromTime ? ` ${d.fromTime}` : ""}\n⏹️ Đến: ${d.toWeekday} ${d.toDate}${d.toTime ? ` ${d.toTime}` : ""}${d.reason ? `\n📝 Lý do: ${d.reason}` : ""}`,
  invoice_created: (d) =>
    `🧾 HOÁ ĐƠN MỚI\n\n🔖 Mã: ${d.invoiceCode}\n💵 Số tiền: ${d.amount}\n📌 Trạng thái: ${d.status}${d.note ? `\n📝 Ghi chú: ${d.note}` : ""}`,
  invoice_paid: (d) =>
    `✅ XÁC NHẬN THANH TOÁN\n\n🔖 Mã hoá đơn: ${d.invoiceCode}\n💵 Số tiền: ${d.amount}${d.note ? `\n📝 Ghi chú: ${d.note}` : ""}`,
  teacher_feedback: (d) =>
    `📝 NHẬN XÉT GIÁO VIÊN\n\n👤 Học viên: ${d.studentName}\n🏫 Lớp: ${d.className}\n📅 Buổi: ${d.sessionDate}\n👩‍🏫 GV: ${d.teacherName}`,
  score_sheet: (d) =>
    `📊 BẢNG ĐIỂM\n\n📋 Bảng: ${d.sheetName}\n👤 Học viên: ${d.studentName}\n🏆 Tổng điểm: ${d.totalScore}${d.comment ? `\n💬 Nhận xét: ${d.comment}` : ""}`,
  exam_score: (d) =>
    `📝 ĐIỂM KIỂM TRA\n\n📋 Bài: ${d.examName}\n🏆 Điểm: ${d.totalScore}  ✅ Đúng: ${d.correctCount}  ❌ Sai: ${d.wrongCount}${d.comment ? `\n💬 Nhận xét: ${d.comment}` : ""}`,
  homework_score: (d) =>
    `📚 ĐIỂM BÀI TẬP VỀ NHÀ\n\n📋 Bài: ${d.homeworkName}\n🏆 Điểm: ${d.score}${d.comment ? `\n💬 Nhận xét: ${d.comment}` : ""}`,
  session_content: (d) =>
    `📖 NỘI DUNG BUỔI HỌC\n\n🏫 Lớp: ${d.className}\n📅 Ngày: ${d.sessionDate}\n👩‍🏫 GV: ${d.teacherName}\n📌 Nội dung: ${d.contentList}`,
};

function buildText(type: string, data: Record<string, unknown>, detailUrl?: string): string {
  const fn = OA_TEMPLATES[type];
  const body = fn ? fn(data) : `Thông báo từ trung tâm (${type})`;
  return detailUrl ? `${body}\n\n👉 Xem chi tiết: ${detailUrl}` : body;
}

export class OAChannel implements INotificationChannel {
  async send(payload: ChannelPayload): Promise<void> {
    const { logId, studentId, centerId, type, data } = payload;

    try {
      const channelRow = await notificationRepository.getStudentChannel(studentId, centerId);

      if (!channelRow?.zaloUserId) {
        console.warn(`[OAChannel] Bỏ qua: học viên ${studentId} chưa có zalo_user_id`);
        await notificationRepository.updateLogStatus(logId, "SKIPPED", {
          reason: "missing_zalo_user_id",
          errorMessage: `Học viên ${studentId} chưa có zalo_user_id`,
        });
        return;
      }

      if (!channelRow.isFollowed) {
        console.warn(`[OAChannel] Bỏ qua: học viên ${studentId} chưa follow OA`);
        await notificationRepository.updateLogStatus(logId, "SKIPPED", {
          reason: "not_followed",
          errorMessage: `Học viên ${studentId} chưa follow OA (is_followed=false)`,
        });
        return;
      }

      const locationId = await this.resolveConnectedLocationId();
      const accessToken = await this.resolveAccessToken(locationId);
      if (!accessToken) {
        console.warn(`[OAChannel] Bỏ qua: không có Zalo OA nào đang kết nối`);
        await notificationRepository.updateLogStatus(logId, "SKIPPED", {
          reason: "zns_disabled",
          errorMessage: "Không có Zalo OA nào đang kết nối",
        });
        return;
      }

      // Lấy CRM URL từ centerConfig để gắn vào deep link (tenant resolver cho Mini App)
      const [cfg] = await db.select({ centerUrl: centerConfig.centerUrl }).from(centerConfig).limit(1);
      const crmUrl = cfg?.centerUrl || undefined;

      const deepLink = buildDeepLinkUrl(type, data, crmUrl);
      let detailUrl: string | undefined;
      if (crmUrl) {
        try {
          detailUrl = await createShortLink(deepLink, crmUrl);
        } catch (err) {
          console.warn("[OAChannel] Không tạo được shortlink, dùng full URL:", err);
          detailUrl = deepLink;
        }
      } else {
        detailUrl = deepLink;
      }

      const text = buildText(type, data, detailUrl);
      const buttons = buildButtons(type, data, crmUrl);
      const body = JSON.stringify({
        recipient: { user_id: channelRow.zaloUserId },
        message: {
          text,
          buttons,
        },
      });
      console.log(`[OAChannel] Payload gửi: type=${type}, buttons=${JSON.stringify(buttons)}`);

      const callAPI = (token: string) =>
        fetch(OA_CS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "access_token": token },
          body,
        });

      let res = await callAPI(accessToken);
      let result = await res.json() as any;
      console.log(`[OAChannel] Gửi lần 1: error=${result.error}, msg="${result.message ?? ""}", studentId=${studentId}`);

      if ((result.error === -155 || result.error === -216 || result.error === 216) && locationId) {
        const newToken = await this.refreshToken(locationId);
        if (newToken) {
          res = await callAPI(newToken);
          result = await res.json() as any;
          console.log(`[OAChannel] Gửi lần 2 (sau refresh): error=${result.error}, msg="${result.message ?? ""}"`);
        }
      }

      if (result.error !== 0) {
        throw new Error(`Zalo OA API lỗi ${result.error}: ${result.message ?? JSON.stringify(result)}`);
      }

      console.log("[OAChannel] Gửi thành công", { logId, msgId: result.data?.message_id });
      await notificationRepository.updateLogStatus(logId, "SENT");
    } catch (err: any) {
      const errorMessage = err.message ?? "Unknown error";
      console.error("[OAChannel] Gửi thất bại", { logId, type, error: errorMessage });
      await notificationRepository.updateLogStatus(logId, "FAILED", {
        reason: "zalo_api_error",
        errorMessage,
      });
      throw err;
    }
  }

  private async resolveConnectedLocationId(): Promise<string | null> {
    const [config] = await db
      .select({ locationId: zaloOaConfigs.locationId })
      .from(zaloOaConfigs)
      .where(eq(zaloOaConfigs.isConnected, true))
      .limit(1);
    return config?.locationId ?? null;
  }

  private async resolveAccessToken(locationId: string | null): Promise<string | null> {
    const condition = locationId
      ? and(eq(zaloOaConfigs.locationId, locationId), eq(zaloOaConfigs.isConnected, true))
      : eq(zaloOaConfigs.isConnected, true);

    const [config] = await db
      .select({ accessTokenEncrypted: zaloOaConfigs.accessTokenEncrypted })
      .from(zaloOaConfigs)
      .where(condition)
      .limit(1);

    if (!config?.accessTokenEncrypted) return null;
    try {
      return decrypt(config.accessTokenEncrypted);
    } catch {
      return null;
    }
  }

  private async refreshToken(locationId: string): Promise<string | null> {
    const appId = process.env.ZALO_APP_ID;
    const appSecret = process.env.ZALO_APP_SECRET;
    if (!appId || !appSecret) return null;

    const [row] = await db
      .select({ refreshTokenEncrypted: zaloOaConfigs.refreshTokenEncrypted })
      .from(zaloOaConfigs)
      .where(eq(zaloOaConfigs.locationId, locationId))
      .limit(1);

    if (!row?.refreshTokenEncrypted) return null;

    try {
      const refreshToken = decrypt(row.refreshTokenEncrypted);
      const res = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "secret_key": appSecret,
        },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          app_id: appId,
          grant_type: "refresh_token",
        }),
      });
      const data = await res.json() as any;
      if (data.error || !data.access_token) return null;

      const accessTokenEncrypted = encrypt(data.access_token);
      const newRefreshTokenEncrypted = data.refresh_token
        ? encrypt(data.refresh_token)
        : row.refreshTokenEncrypted;
      const expiresIn = data.expires_in ? parseInt(data.expires_in) : 7200;

      await db.update(zaloOaConfigs).set({
        accessTokenEncrypted,
        refreshTokenEncrypted: newRefreshTokenEncrypted,
        tokenExpiredAt: new Date(Date.now() + expiresIn * 1000),
        isConnected: true,
        updatedAt: new Date(),
      }).where(eq(zaloOaConfigs.locationId, locationId));

      return data.access_token;
    } catch {
      return null;
    }
  }
}

export const oaChannel = new OAChannel();
