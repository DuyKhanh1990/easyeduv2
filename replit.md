# Student Learning Management System

## Project Overview
A comprehensive learning management system for managing students, classes, course programs, and tuition/fee management.

## CRM Custom Fields ("Thông tin bổ sung")

Centers can define custom additional fields for student records (text/number/date/textarea/select).

**Schema:**
- `crm_custom_fields` — id (uuid), label, fieldType, options (text[]), position, timestamps
- `students.custom_fields` — jsonb keyed by custom-field id

**Key files:**
- `shared/schema.ts` — `crmCustomFields` table + `students.customFields` column
- `server/storage/student.storage.ts` — CRUD; delete strips key from all `students.custom_fields` (single tx)
- `server/routes/students.routes.ts` — `/api/crm/custom-fields` REST
- `client/src/hooks/use-crm-config.ts` — `useCrmCustomFields()` hook
- `client/src/lib/customer-fields.ts` — `makeCustomFieldKey()` / `parseCustomFieldKey()` (`custom:<id>`) + `additional` group
- `client/src/pages/customers/CRMConfig.tsx` — `AdditionalInfoTab` (CRUD) + `RequiredInfoTab` merges custom fields under `additional` group
- `client/src/pages/customers/CustomerForm.tsx` — dynamic section + Zod resolver checks required custom fields via `customFields[id]`
- `client/src/pages/customers/CustomersList.tsx` / `CustomersTable.tsx` — custom columns rendered before `actions`, toggleable in Sort menu

## Notification System

Hệ thống thông báo realtime tích hợp vào app, gồm 3 kênh: DB, WebSocket, Email.

**Files quan trọng:**
- `server/lib/ws-hub.ts` — WebSocket hub quản lý userId → Set<WebSocket>
- `server/lib/notification.ts` — `sendNotification()` & `sendNotificationToMany()` helper
- `server/routes/notification.routes.ts` — REST API cho notifications
- `client/src/hooks/use-notifications.ts` — React hooks + WS client
- `client/src/components/notifications/NotificationBell.tsx` — Bell UI component

**API endpoints:**
- `GET /api/notifications` — Lấy danh sách thông báo của user hiện tại
- `PATCH /api/notifications/:id/read` — Đánh dấu đã đọc
- `PATCH /api/notifications/read-all` — Đọc tất cả
- `DELETE /api/notifications/:id` — Xóa thông báo
- `POST /api/notifications/send` — Gửi thông báo (test / admin)

**WebSocket:** `ws://host/ws` — Client đăng ký bằng `{ type: "register", userId }`

**Email (tùy chọn):** Cần set secrets: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

**Gửi notification từ code backend:**
```typescript
import { sendNotification } from "../lib/notification";
await sendNotification({ userId, title, content, category, email });
```

## File Storage: S3 Integration

All file uploads are stored on **CMC Telecom S3-compatible storage** (not local disk).

**Key files:**
- `server/lib/s3.ts` — S3 client + `uploadFileToS3()` helper
- `server/routes/upload.routes.ts` — Upload API uses `multer.memoryStorage()` then pushes to S3

**Environment variables required:**
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_FOLDER_PORTAL`
- `S3_ALIAS_HOST` — CDN host used in returned file URLs (e.g. `cdn3.emso.vn/easyedu`)
- `S3_PROTOCOL` — `https`

**URL format:** `https://{S3_ALIAS_HOST}/{S3_FOLDER_PORTAL}/{timestamp}_{filename}`

**Affected upload points:**
1. `/my-space/assignments` — Attachment khi nộp bài / chấm bài
2. `/tasks` — Đính kèm file vào task
3. `/courses` — Tài liệu buổi học (SessionContentDialog)
4. `/assessments` — Ảnh/audio câu hỏi thi (MatchingDialog dùng API upload thật)

## Database Schema Updates

### Recent Changes (March 24, 2026)

#### Makeup Session Business Logic
**OBJECTIVE**: Implement full transactional makeup-session flow per clean architecture.

**CHANGES**:
1. **Added `makeup_from_session_id` column to `student_sessions`**:
   - Traces which original `class_session` a makeup record was created for
   - Enables future reporting ("which session was this makeup for?")

2. **Rewrote `makeupClassStudents()` in `server/storage/session.storage.ts`**:
   - **Validate**: target session exists; no duplicate `(student, session)` record; no same-date conflict
   - **INSERT**: new `student_sessions` row with `session_source = 'makeup'` and `makeup_from_session_id`
   - **UPDATE**: original `student_sessions` row → `status = 'makeup_moved'`
   - All inside a single DB transaction with ROLLBACK on failure
   - Supports two sub-options: `specific_session` (choose existing session) and `end_of_schedule` (append new session)

3. **Improved `MakeupDialog` (front-end)**:
   - Filter logic matches spec exactly (past, original, duplicate, same-day)
   - Alert shown when no valid sessions exist
   - Confirm button disabled until a session is selected
   - Resets selection on option switch

### Recent Changes (March 11, 2026)

#### Refactored Class Assignment System - Single Source of Truth for classIds
**OBJECTIVE**: Eliminated redundant columns and created automatic sync between class assignment (trang /class) and student profiles (trang /customers).

**CHANGES**:
1. **Removed columns from `students` table**:
   - `class_id` (uuid) - PRIMARY CLASS REFERENCE - REMOVED (use classIds array instead)
   - `school` (text) - REMOVED (unused field)

2. **Kept column in `students` table**:
   - `class_ids` (uuid[]) - NOW THE SINGLE SOURCE OF TRUTH for all class enrollments

3. **Updated `addClassStudents()` function in `server/storage.ts`**:
   - When a student is assigned to a class via `/api/classes/:id/add-students`
   - Now **automatically adds** the class ID to the student's `classIds` array
   - Prevents duplicate class IDs using array uniqueness check

4. **Updated form in `client/src/pages/customers/CustomerForm.tsx`**:
   - Removed `classId` field (single class reference)
   - Removed `school` field (legacy field)
   - Kept `classIds` MultiSelect (allows multi-class enrollment)

5. **Updated schema relation in `shared/schema.ts`**:
   - Changed `classesRelations` from `students: many(students)` to `studentClasses: many(studentClasses)`
   - Properly references the junction table instead of direct relation

**HOW IT WORKS NOW**:
```
Workflow 1: Gán học viên vào lớp (trang /class)
1. User chọn học viên + click "Gán Lớp"
2. POST /api/classes/:id/add-students
3. Backend:
   - Tạo record trong student_classes (status=waiting)
   - Tự động add classId vào students.classIds mảng
4. Trang /customers sẽ nhận thấy classIds được update ngay

Workflow 2: Chỉnh sửa lớp học (trang /customers)
1. User chọn học viên + chỉnh sửa Lớp học field
2. classIds được update trực tiếp trong form
3. Data được lưu vào students.classIds
```

**Benefits**:
- ✅ No more duplicate/conflicting class info across 3 columns
- ✅ Automatic sync when assigning from /class page
- ✅ Single source of truth: classIds array in students table
- ✅ Support multi-class enrollment
- ✅ Cleaner schema, fewer edge cases

---

### Previous Changes (March 7, 2026)

#### Added Fee Management Columns to `student_sessions` Table
Added the following columns to track tuition and payment status for each student session:

- **package_id** (uuid, nullable): References the `course_fee_packages` used for this session
- **package_type** (varchar(20)): Type of package - 'course' (package of sessions) or 'session' (single session)
- **session_price** (numeric(10,2)): Price of this session at the time it was taken
- **session_source** (varchar(20)): Source of the session:
  - 'normal': Regular class session
  - 'makeup': Makeup/compensatory session
  - 'transfer': Transferred from another class
  - 'extra': Extra/additional session
- **is_paid** (boolean): Whether this session has been counted in the tuition fee
- **session_order** (integer): Order/sequence number within the course package

**Migration File**: `migrations/0003_add_fee_columns.sql`

**Purpose**: These columns enable granular tuition management, allowing:
- Per-session price snapshots (protects from future price changes)
- Easy makeup/extra session tracking
- Flexible fee calculation per student
- Audit trail for each learning session

## Backend Architecture

### Customer Business Activity Log (April 16, 2026)
- Trang `/customers` có nút **Nhật ký triển khai nghiệp vụ** mở dialog `CustomerActivityLogDialog`.
- API `/api/customers/activity-logs` đọc bảng `customer_activity_logs` và hiển thị các cột: Người dùng, Thời gian, Hành động, Nội dung cũ, Nội dung mới.
- Khi thêm mới khách hàng: `old_data` và `new_data` cùng lưu một dòng tóm tắt dạng `Thêm mới học viên:Học viên 104 (HV-104) vào Cơ sở Chính`.
- Khi sửa khách hàng: `old_data` và `new_data` chỉ chứa các trường thật sự thay đổi.
- Khi xoá khách hàng: `old_data` lưu tóm tắt học viên kèm cơ sở, `new_data` lưu câu xác nhận xoá khỏi hệ thống kèm cơ sở.
- Mã khách hàng/học viên tự động lấy số lớn nhất đang tồn tại theo tiền tố `HV-` hoặc `PH-` rồi cộng 1; không dùng tổng số bản ghi để tránh trùng mã khi danh sách đã có mã lớn hơn.
- Dialog Nhật ký có bộ lọc theo Cơ sở, Hành động, Từ ngày, Đến ngày. Cơ sở được lọc theo cơ sở của nhân sự/người dùng đã thao tác; nhân sự thường chỉ nhìn thấy nhật ký của người thao tác thuộc các cơ sở mà nhân sự đó được phân quyền.

### Storage Layer (Refactored — March 14, 2026, Tasks 4.0–4.7)
`server/storage.ts` đã được tách thành các module riêng theo domain:

| File | Domain |
|------|--------|
| `server/storage/base.ts` | Shared imports & utilities (db, drizzle operators, getDayName...) |
| `server/storage/staff.storage.ts` | Locations, Departments, Roles, Staff |
| `server/storage/student.storage.ts` | Students, CRM, Comments, StudentClasses |
| `server/storage/finance.storage.ts` | Invoices, Transaction Categories, Promotions |
| `server/storage/course.storage.ts` | Courses, Fee Packages, Course Programs |
| `server/storage/class.storage.ts` | Classes & Class Sessions CRUD |
| `server/storage/session.storage.ts` | Attendance, Session Contents, Student Sessions |
| `server/storage/shift.storage.ts` | Shift Templates, Teacher Availability |
| `server/storage/index.ts` | Re-export tổng hợp tất cả modules |

`DatabaseStorage` trong `server/storage.ts` delegate toàn bộ sang các module trên.

## Tinode Chat — Multi-tenant tagging

Nhiều trung tâm (mỗi trung tâm có Postgres + domain riêng) **dùng chung 1 Tinode server + 1 MongoDB**. Để off-board (xoá data chat của 1 trung tâm) cần gắn tag tenant vào tất cả user/topic do trung tâm đó tạo.

**Env vars (mỗi deployment):**
- `TINODE_URL`, `TINODE_API_KEY`, `TINODE_BOT_USER`, `TINODE_BOT_PASS`, `TINODE_USER_PASS_SECRET` — **giống nhau** trên mọi center sharing cùng Tinode (đặc biệt `TINODE_USER_PASS_SECRET` phải identical để HMAC password derive ra cùng giá trị).
- `CENTER_ID` — **khác nhau** từng center. Pattern `^[a-z][a-z0-9_]{2,30}$`. Ví dụ: `easyedu_vn`, `abc_center`. Nếu bỏ trống, code sẽ thử derive từ domain (`PUBLIC_DOMAIN` → `REPLIT_DOMAINS` → `REPLIT_DEV_DOMAIN`); nếu derive thất bại → log warning và **bỏ qua tag** (không break Tinode).

**Tag/private đính kèm khi tạo mới:**
- User (`ensureUserInTinode`) → `tags: [<login>, "tenant:<CENTER_ID>"]`, `private.tenantId: <CENTER_ID>`
- Class topic (`createClassTopic`) → `tags: ["tenant:<CENTER_ID>"]`, `private.tenantId: <CENTER_ID>`
- Group topic (`createGroupTopic`) → `tags: ["tenant:<CENTER_ID>"]`, `private.tenantId: <CENTER_ID>`

**Off-board 1 trung tâm:** query MongoDB `users`/`topics` collections theo `tags` chứa `tenant:<CENTER_ID>` → xoá. User cũ tạo trước khi rollout này KHÔNG có tag → cần backfill thủ công nếu muốn dọn sạch.

**Files:**
- `server/lib/tinode.service.ts` — `resolveCenterId()`, `getCenterId()`, `getTenantTag()`, đã inject vào 3 hàm tạo user/topic.
- `server/lib/tinode-admin.ts` — bot connection + check `TINODE_BOT_PASS` length ≤ 32.

## Schema Files
- `shared/schema.ts`: Contains all Drizzle ORM table definitions and relations
- `migrations/`: SQL migration files (0000, 0001, 0002, 0003...)

## Key Tables
- **students**: Student information (NOW uses classIds array as single source)
- **classes**: Course classes
- **student_classes**: Student enrollment in classes (junction table - source of truth for enrollment status)
- **student_sessions**: Individual session attendance and fee tracking
- **class_sessions**: Master schedule of all class sessions
- **courses**: Course definitions
- **course_fee_packages**: Tuition packages (course or per-session)
- **staff**: Teachers and administrators
- **locations**: Physical learning locations
