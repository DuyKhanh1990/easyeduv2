---
name: Production PostgreSQL client
description: Runtime dependency required by database backup and restore outside the development workspace.
---

Mọi môi trường Production chạy backup hoặc restore phải đóng gói PostgreSQL client để có `pg_dump`, `pg_restore` và `psql`; module có sẵn trong workspace development không đảm bảo binary tồn tại trong runtime Production.

**Why:** Backup tự động từng thất bại với `spawn pg_dump ENOENT` dù workspace development chạy được, vì image/runtime Production không chứa PostgreSQL client.

**How to apply:** Giữ PostgreSQL client trong dependency Nix của Replit và runner image Docker. Sau khi thay đổi dependency runtime, phải publish/build lại Production và xác minh bằng một backup thủ công trước khi chờ lịch tự động.