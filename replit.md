# EduManage

A comprehensive Educational Management System (ERP/CRM) for education centers — managing students, classes, attendance, finances, HR, and learning content.

## Run & Operate

| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server (Express + Vite HMR on port 5000) |
| `npm run build` | Bundle server → `dist/index.cjs`, client → `dist/public` |
| `npm start` | Run production bundle |
| `npm run check` | TypeScript type check |
| `npm run db:push` | Sync Drizzle schema to DB |

### Required env vars
- `DATABASE_URL` — provisioned automatically by Replit PostgreSQL
- `JWT_SECRET` — set in shared env vars
- `SESSION_SECRET` — set as a secret
- `S3_*` — S3-compatible storage config (shared env vars)
- `TINODE_*` — Chat server config (shared env vars)
- `AI_INTEGRATIONS_OPENAI_API_KEY` / `AI_INTEGRATIONS_GEMINI_API_KEY` — via Replit AI integrations
- Optional: `SMTP_*`, `MATBAO_*`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `TINODE_API_KEY`, `TINODE_BOT_PASS`

### Setup notes (re-import)
- After importing from zip, run `npm install` at the repo root **and** in `gateway/` separately — they have independent `node_modules` and both workflows (`Start application`, `Zalo Gateway`) fail with "command not found" otherwise.
- `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` (S3) and `TINODE_API_KEY`/`ZALO_APP_ID`/`ZALO_APP_SECRET`/`GATEWAY_JWT_SECRET` are optional — the app boots and the login page renders without them, but chat/S3/Zalo features stay disabled until set.
- An `artifacts/mockup-sandbox` workflow may appear auto-added by the platform; it's unrelated to the main app and can be ignored/removed if unused.

## Stack

- **Runtime**: Node.js 20
- **Frontend**: React 18 + TypeScript, Vite, Tailwind CSS, Radix UI (shadcn style), TanStack Query, Wouter
- **Backend**: Express 5, Drizzle ORM, PostgreSQL (`pg`)
- **Auth**: Passport.js (local strategy) + JWT (for mobile API)
- **Build tool**: esbuild via custom `script/build.ts`

## Where things live

```
client/src/          — React frontend (pages/, components/, hooks/, lib/)
server/              — Express backend (routes/, storage/, lib/)
server/replit_integrations/ — Replit-managed AI (OpenAI/Gemini) routes
shared/schema.ts     — Drizzle schema (source of truth for DB tables)
shared/routes.ts     — Shared API route definitions
migrations/          — SQL migration files
script/build.ts      — Production build script
```

## Architecture decisions

- Monorepo: frontend and backend share a single `package.json`; dev server uses Vite middleware mode inside Express
- Auth is Passport.js local strategy (username/password, hashed with scrypt); JWT used only for mobile API
- Schema managed by Drizzle ORM — single source of truth is `shared/schema.ts`; apply via `npm run db:push`
- AI features use Replit-managed integrations (`AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_GEMINI_API_KEY`)
- S3-compatible object storage (CMC Cloud) for file uploads; Tinode for real-time chat

## Product

- Student/customer CRM with pipeline stages and relationship tracking
- Class scheduling, session management, and attendance
- Invoicing, tuition payments, wallet, and e-invoicing (Mat Bao)
- Staff HR: departments, roles, shifts, payroll
- Assessments/exams with AI-assisted question generation
- Course program/content library
- Real-time chat via Tinode
- AI features: question generation, essay grading (OpenAI/Gemini)

## User preferences

- Vietnamese language UI
- Keep the existing Passport.js + JWT auth — do not replace with Replit Auth

## Schema Change Rule

**Nguồn sự thật duy nhất cho schema là `shared/schema.ts`.**

### Được phép trong `server/index.ts`
| ✅ | Mô tả |
|---|---|
| Seeds | Dữ liệu mặc định (categories, departments...) |
| One-time data backfills | Di chuyển / backfill data hiện có |
| Service initialization | Tinode, cache, WebSocket... |

### Không được phép ở bất cứ đâu ngoài schema.ts
```
❌ ALTER TABLE ... ADD COLUMN ...
❌ CREATE TABLE IF NOT EXISTS ...
❌ DDL inline bất kỳ trong routes, storage, startup
```

### Quy trình thêm bảng / cột mới
```
1. Sửa shared/schema.ts  →  định nghĩa bảng/cột mới bằng Drizzle
2. Chạy: npm run db:push  →  apply thay đổi lên DB
3. Dùng ngay trong code bình thường
```

> Xem guardrail chi tiết trong comment đầu block `(async () => {` ở `server/index.ts`

---

## Known bugs & fixes

### ExamPickerDialog — danh sách bài kiểm tra trống trên mobile staff
**Triệu chứng:** `/my-space/calendar` → Giao nội dung → Thêm Bài kiểm tra → dialog rỗng, trong khi Bài học/BTVN hiển thị bình thường.

**Nguyên nhân:** `ExamPickerDialog` gọi `/api/exams` vốn được thiết kế cho admin (filter theo `allowedLocationIds`). Mặc dù schema có cột `location_id` trên bảng `exams`, **thực tế hiện tại không có exam nào được gán locationId** (toàn NULL) — nhưng endpoint `/api/exams` không phù hợp cho mobile staff context vì phụ thuộc vào session-based location middleware.

**Fix:** Đổi `ExamPickerDialog` sang gọi `/api/mobile/staff/exams?pageSize=500` — endpoint không filter theo location, trả về tất cả bài kiểm tra, phù hợp cho giáo viên chọn khi giao nội dung.

**File:** `client/src/components/education/SessionContentDialog.tsx` — `ExamPickerDialog` component (~dòng 709)

### Mobile API task — dropdown Quản lý/Người thực hiện rỗng + thiếu field Đối tượng
**Triệu chứng:** Form tạo task trên mobile: Quản lý/Người thực hiện không có user để chọn; field Đối tượng không thấy.

**Nguyên nhân:**
1. Fetch `/api/staff` và `/api/students` thiếu `getAuthHeaders()` → JWT auth không được gửi → 401 → data rỗng
2. Layout dùng `grid-cols-4` và `grid-cols-5` cứng, không responsive → trên màn hình nhỏ các field bị thu quá nhỏ

**Fix:** Thêm `getAuthHeaders()` vào các fetch call; đổi grid thành `grid-cols-2 md:grid-cols-4` và `grid-cols-2 md:grid-cols-5`.

**File:** `client/src/pages/tasks/components/CreateTaskDialog.tsx` — dòng ~488-496 (fetch) và ~692, ~747 (grid)

---

## Gotchas

- `tsx` is a local devDependency — the `npm run dev` script uses `node_modules/.bin/tsx` directly
- Schema thay đổi qua `shared/schema.ts` + `npm run db:push`, **không** inline trong startup
- Vite HMR WebSocket shows a `400` warning in Replit's proxied iframe — this is cosmetic, HMR still works
- `drizzle-kit push` hangs nếu DB ngoài (42.96.40.138) chậm từ CLI — chạy từ máy local hoặc server cùng mạng
- Port 5000 is the only exposed port; both API and frontend are served from it

## Pointers

- DB skill: `.local/skills/database/SKILL.md`
- Env secrets skill: `.local/skills/environment-secrets/SKILL.md`
- Workflows skill: `.local/skills/workflows/SKILL.md`
