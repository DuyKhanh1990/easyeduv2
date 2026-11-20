# Web Push cho PWA và backend EasyEdu

Tài liệu này phân biệt Web Push của PWA với Expo Push của ứng dụng mobile và
ghi lại contract giữa hai dự án.

## Trạng thái backend

Backend đã có phần Web Push:

- Đọc `VAPID_PUBLIC_KEY` và `VAPID_PRIVATE_KEY` từ Secrets/environment.
- Lưu nhiều browser subscription cho cùng một user.
- Scope subscription theo `centerId + userId`.
- Gửi Web Push song song với Expo Push khi notification được tạo.
- Tự xóa subscription khi Push Service trả `404` hoặc `410`.
- Không nhận `userId` hoặc `centerId` từ request body.

Development database đã có bảng `web_push_subscriptions`. Trước khi deploy
production, phải áp schema mới cho database của từng trung tâm.

## Hai hệ thống push không dùng chung API

### Native mobile / Expo Push

```http
POST   /api/mobile/push-token
DELETE /api/mobile/push-token
```

Lưu Expo Push Token, FCM token hoặc APNs token. Đây là API cho ứng dụng mobile
native.

### PWA / Web Push

```http
GET    /api/mobile/push/config
POST   /api/mobile/push/subscription
DELETE /api/mobile/push/subscription
```

Các route Web Push không trùng với `/api/mobile/push-token`.

## VAPID keys dùng chung cho tất cả trung tâm

Tất cả backend trung tâm có thể dùng cùng một cặp ổn định:

```text
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
```

- `VAPID_PUBLIC_KEY` có thể trả cho PWA.
- `VAPID_PRIVATE_KEY` chỉ lưu trong Secrets của backend.
- Không commit hai giá trị vào Git.
- Không đưa private key vào PWA.
- Không tạo lại cặp key sau mỗi lần deploy.

Khi deploy lên Argo, khai báo cùng cặp giá trị cho mọi backend trung tâm.
Ngoài ra có thể khai báo tùy chọn:

```text
VAPID_SUBJECT=https://app.easyedu.vn
```

Nếu không khai báo `VAPID_SUBJECT`, backend dùng `https://app.easyedu.vn`.

VAPID key chỉ xác định ứng dụng gửi push; nó không xác định tenant. Việc
không lẫn dữ liệu được bảo đảm bằng `centerId` lấy từ `center_config` của
backend hiện tại và `userId` lấy từ JWT/session.

## Contract API cho PWA

Tất cả API dưới đây cần gửi:

```http
Authorization: Bearer <JWT>
Content-Type: application/json
```

`JWT` là token trả về từ `/api/mobile/auth/login`.

### 1. Lấy cấu hình VAPID

```http
GET /api/mobile/push/config
```

Response khi đã cấu hình:

```json
{
  "enabled": true,
  "publicKey": "<VAPID_PUBLIC_KEY>"
}
```

Response khi backend chưa có đủ VAPID key:

```json
{
  "enabled": false,
  "publicKey": null
}
```

PWA không được cố gọi `pushManager.subscribe()` khi `enabled` là `false`.

### 2. Lưu hoặc cập nhật browser subscription

```http
POST /api/mobile/push/subscription
```

Body là object chuẩn trả về từ `PushManager.subscribe()`:

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "expirationTime": null,
  "keys": {
    "p256dh": "...",
    "auth": "..."
  }
}
```

Backend tự lấy:

- `userId` từ JWT.
- `centerId` từ `center_config` của backend đang được gọi.

PWA không gửi và không cần biết giá trị `centerId` trong request này.

Response:

```json
{
  "success": true
}
```

Gọi lại API này khi user đăng nhập, khi subscription được refresh, hoặc khi
PWA phát hiện subscription hiện tại đã thay đổi.

### 3. Xóa browser subscription

```http
DELETE /api/mobile/push/subscription
```

Xóa một thiết bị/trình duyệt:

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/..."
}
```

Nếu không gửi `endpoint`, backend xóa toàn bộ Web Push subscription của user
ở center hiện tại. PWA nên gửi endpoint hiện tại khi logout hoặc unsubscribe.

Response:

```json
{
  "success": true
}
```

## Luồng PWA cần triển khai

### Sau khi login thành công

1. Lưu JWT và `center` URL trả về từ login.
2. Đăng ký service worker trên domain PWA.
3. Kiểm tra browser có hỗ trợ `serviceWorker` và `PushManager`.
4. Xin `Notification.requestPermission()` sau một thao tác rõ ràng của user.
5. Gọi `GET /api/mobile/push/config` đến đúng center URL.
6. Nếu `enabled === true` và permission là `granted`, gọi:

```js
const existing = await registration.pushManager.getSubscription();
const subscription = existing ?? await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(config.publicKey),
});
```

7. Gửi toàn bộ object `subscription.toJSON()` đến:

```http
POST <centerUrl>/api/mobile/push/subscription
```

### Khi logout

1. Lấy subscription hiện tại bằng `registration.pushManager.getSubscription()`.
2. Gọi `DELETE /api/mobile/push/subscription` với `endpoint`.
3. Có thể gọi `subscription.unsubscribe()`.
4. Sau đó mới xóa JWT/local session.

### Service worker

Service worker phải xử lý tối thiểu hai event:

```js
self.addEventListener("push", (event) => {
  const payload = event.data?.json() ?? {};

  event.waitUntil(
    self.registration.showNotification(payload.title || "EasyEdu", {
      body: payload.body || "",
      data: payload.data || {},
      icon: "/app/icons/icon-192.png",
      badge: "/app/icons/badge-72.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const current = windows.find((window) => "focus" in window);
      if (current) {
        current.focus();
        current.postMessage({ type: "EASYEDU_NOTIFICATION_CLICK", data });
        return;
      }

      return clients.openWindow("/app/");
    }),
  );
});
```

Payload Web Push hiện có dạng:

```json
{
  "title": "Thông báo",
  "body": "Bạn có lịch học mới",
  "data": {
    "type": "schedule",
    "referenceId": "...",
    "referenceType": "class_session",
    "date": "2026-09-14",
    "screen": "Calendar",
    "params": {
      "sessionId": "..."
    }
  }
}
```

PWA cần tự map `data.screen` và `data.params` sang route của PWA. Không nên
dùng nguyên route của web admin nếu route đó không tồn tại trong PWA.

## Database và deploy

Mỗi database trung tâm phải có bảng:

```text
web_push_subscriptions
```

Có thể áp schema trước khi deploy bằng:

```bash
TARGET_DB_URL="DATABASE_URL_CUA_TRUNG_TAM" \
npx tsx scripts/push-db-direct.ts
```

Thứ tự rollout:

1. Khai báo hai VAPID Secrets trên backend trung tâm.
2. Áp schema vào database trung tâm.
3. Deploy backend mới.
4. Deploy PWA có service worker và gọi ba API Web Push.
5. Đăng nhập PWA, cấp quyền notification và kiểm tra một notification thật.

## Checklist kiểm thử

- Login PWA bằng center URL A, đăng ký subscription thành công.
- Login bằng center URL B, đăng ký subscription thành công.
- Hai center không nhìn thấy hoặc xóa subscription của nhau.
- Một user có thể có nhiều subscription.
- Logout một browser không xóa subscription browser khác.
- Subscription hết hạn bị xóa sau lỗi `404`/`410`.
- Notification có Expo Push vẫn tiếp tục hoạt động.
- Notification có Web Push mở đúng màn hình PWA sau khi click.
- Backend thiếu VAPID key trả `enabled: false`, không làm crash server.