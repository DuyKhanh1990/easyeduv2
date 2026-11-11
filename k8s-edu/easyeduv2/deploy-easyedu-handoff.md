# Bàn giao Job bootstrap database cho `deploy-easyedu`

Tài liệu/ví dụ để tích hợp vào luồng tạo center. Chưa sửa repository
`deploy-easyedu`. Mọi tên trong ví dụ dùng tiền tố `demov21` để
`create-center.sh` có thể thay chuỗi `demov21` bằng tên center mới.

## Tên tài nguyên và thay chuỗi

| Loại | Tên ví dụ |
|---|---|
| ConfigMap | `demov21-config` |
| Secret | `demov21-bootstrap` |
| Job | `demov21-db-bootstrap` |

Khi tạo center khác, thay `demov21` nhất quán trong `metadata.name`, tham chiếu
ConfigMap/Secret và các lệnh kiểm tra. Job và Deployment phải dùng cùng một
image reference — cùng tag hoặc digest của lần phát hành đó.

## Thứ tự Argo Sync

Đặt các annotation theo wave để Argo áp dụng ConfigMap và Secret trước Job,
rồi mới cho Deployment chạy:

| Tài nguyên | Wave | Ghi chú |
|---|---:|---|
| ConfigMap `demov21-config` | `-3` | Chứa `DB_BOOTSTRAP_ENABLED`, `DATABASE_URL`, `STAFF_LIMIT` |
| Secret `demov21-bootstrap` | `-3` | Chứa mật khẩu admin khởi tạo |
| Job `demov21-db-bootstrap` | `-2` | `Sync` hook; Argo đợi Job thành công |
| Deployment | `0` | Chỉ được đồng bộ sau khi hook thành công |

Thêm vào metadata ConfigMap và Secret:

```yaml
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "-3"
```

Thêm vào metadata Deployment:

```yaml
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "0"
```

## Biến môi trường và nguồn cấu hình

| Biến | Nguồn | Yêu cầu |
|---|---|---|
| `DB_BOOTSTRAP_ENABLED` | ConfigMap `demov21-config` | Đặt chuỗi `"true"` cho center mới; nếu không, Job thoát an toàn mà không bootstrap |
| `DATABASE_URL` | ConfigMap `demov21-config` | URL duy nhất dùng để suy ra tên database và kết nối vào database đích |
| `STAFF_LIMIT` | ConfigMap `demov21-config` | Số nguyên dương; dùng tạo setting nếu center chưa có setting này |
| `BOOTSTRAP_ADMIN_PASSWORD` | Secret `demov21-bootstrap`, key cùng tên | Mật khẩu khởi tạo admin, tối thiểu 12 ký tự; không commit giá trị thật |

Nếu tài khoản trong `DATABASE_URL` không có quyền tạo database, runner hiện hỗ
trợ thêm `DB_BOOTSTRAP_URL` để kết nối database bảo trì và `DB_OWNER_ROLE` để
chọn owner database. Hai biến này không bắt buộc khi tài khoản `DATABASE_URL`
có đủ quyền.

`DATABASE_URL` có thể là credential; không đưa giá trị vào manifest Git hoặc
log. Không bật `DB_BOOTSTRAP_ENABLED` cho center production hiện hữu nếu chưa
chủ động xác nhận kế hoạch rollout.

## Job manifest mẫu

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: demov21-db-bootstrap
  namespace: production
  annotations:
    argocd.argoproj.io/hook: Sync
    argocd.argoproj.io/sync-wave: "-2"
    argocd.argoproj.io/hook-delete-policy: BeforeHookCreation,HookSucceeded
spec:
  backoffLimit: 0
  activeDeadlineSeconds: 900
  ttlSecondsAfterFinished: 3600
  template:
    metadata:
      labels:
        app: demov21-db-bootstrap
    spec:
      restartPolicy: Never
      imagePullSecrets:
        - name: emso-harbo-production
      containers:
        - name: db-bootstrap
          # Phải trùng image reference của Deployment ở cùng lần phát hành.
          image: harbor.emso.vn/emso-common/new-easyedu:0.0.2
          imagePullPolicy: IfNotPresent
          command: ["/bin/sh", "-ec"]
          args:
            - |
              if [ "${DB_BOOTSTRAP_ENABLED:-false}" != "true" ]; then
                echo "DB bootstrap disabled for this center; skipping."
                exit 0
              fi
              node dist/db/migrate.cjs
              TARGET_DB_URL="$DATABASE_URL" node dist/db/seed-default.cjs
          envFrom:
            - configMapRef:
                name: demov21-config
          env:
            - name: BOOTSTRAP_ADMIN_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: demov21-bootstrap
                  key: BOOTSTRAP_ADMIN_PASSWORD
                  optional: true
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: "1"
              memory: 1Gi
```

Khi cập nhật release, đổi image của Job và Deployment cùng lúc sang đúng tag hoặc
digest. `HookSucceeded` xóa Job thành công; Job thất bại được giữ lại để xem log.
`backoffLimit: 0` làm Argo dừng sync ngay khi bootstrap lỗi, nên Deployment wave
`0` không được áp dụng.

## Chạy thử trên một center test

1. Dùng center test riêng và PostgreSQL/database dùng một lần; tuyệt đối không
   trỏ `DATABASE_URL` vào database production.
2. Tạo ConfigMap và Secret với các tên trên. Đặt
   `DB_BOOTSTRAP_ENABLED: "true"`, URL database test và `STAFF_LIMIT`; tạo mật
   khẩu admin test riêng trong Secret.
3. Đồng bộ Argo app với cùng image reference cho Job và Deployment. Argo phải
   báo Sync thành công; kiểm tra hook Job hoàn tất trước khi Deployment chạy.
4. Trong lúc Job chạy, theo dõi:

   ```sh
   kubectl -n production get job demov21-db-bootstrap --watch
   ```

   Khi thành công, Argo xóa Job theo `HookSucceeded`; có thể xác nhận trạng thái
   hook trong kết quả sync của Argo. Không tái sử dụng database test cho dữ liệu
   thật.
5. Sau khi kiểm tra, xóa tài nguyên test và database dùng một lần theo quy trình
   của môi trường test.

## Xem lỗi và log

Job lỗi không bị xóa bởi `HookSucceeded`. Xem trạng thái, sự kiện và log bằng:

```sh
kubectl -n production describe job demov21-db-bootstrap
kubectl -n production get pods -l job-name=demov21-db-bootstrap
kubectl -n production logs job/demov21-db-bootstrap --all-containers=true
```

Nếu cần chi tiết pod:

```sh
kubectl -n production describe pod -l job-name=demov21-db-bootstrap
```

Job có TTL một giờ sau khi kết thúc; lưu log trước khi TTL dọn Job/pod. Sau khi
sửa ConfigMap, Secret hoặc quyền database, chạy lại Argo sync để tạo lại hook.

## Phạm vi hiện tại

Runner tạo database, áp dụng schema đóng gói trong image và chạy `seed-default`.
Một số cập nhật dữ liệu cũ trong `server/index.ts` (ví dụ backfill quyền/role)
vẫn chạy khi app khởi động; chúng chưa được chuyển thành bước seed của Job.
