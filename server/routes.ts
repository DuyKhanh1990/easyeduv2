import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { setupAuth, jwtAuthMiddleware, JWT_SECRET } from "./auth";
import { locationAccessMiddleware } from "./middleware/location-access";
import { api } from "@shared/routes";
import passport from "passport";
import path from "path";
import express from "express";
import jwt from "jsonwebtoken";
import { initializeWsHub } from "./lib/ws-hub";
import { captureError } from "./lib/monitoring";
import { registerNotificationRoutes } from "./routes/notification.routes";

import { registerConfigRoutes } from "./routes/config.routes";
import { registerStudentsRoutes } from "./routes/students.routes";
import { registerClassesRoutes } from "./routes/classes.routes";
import { registerAttendanceRoutes } from "./routes/attendance.routes";
import { registerFinanceRoutes } from "./routes/finance.routes";
import { registerMySpaceRoutes } from "./routes/my-space.routes";
import { registerUploadRoutes } from "./routes/upload.routes";
import { registerTeacherSalaryRoutes } from "./routes/teacher-salary.routes";
import { registerTeacherSalaryPackageRoutes } from "./routes/teacher-salary-packages.routes";
import { registerStaffSalaryConfigRoutes } from "./routes/staff-salary-configs.routes";
import { registerStaffHrSalaryConfigRoutes } from "./routes/staff-hr-salary-configs.routes";
import { registerQuestionRoutes } from "./routes/question.routes";
import { registerExamRoutes } from "./routes/exam.routes";
import { registerExamSectionRoutes } from "./routes/exam-section.routes";
import { registerExamSectionQuestionRoutes } from "./routes/exam-section-questions.routes";
import { registerExamSubmissionRoutes } from "./routes/exam-submission.routes";
import { registerAssessmentHistoryRoutes } from "./routes/assessment-history.routes";
import { registerAIRoutes } from "./routes/ai.routes";
import { registerAISettingsRoutes } from "./routes/ai-settings.routes";
import { registerPaymentGatewayRoutes } from "./routes/payment-gateways.routes";
import { registerOmicallRoutes } from "./routes/omicall.routes";
import { registerTaskStatusRoutes } from "./routes/task-statuses.routes";
import { registerTaskLevelRoutes } from "./routes/task-levels.routes";
import { registerTaskRoutes } from "./routes/tasks.routes";
import { registerMobileRoutes } from "./routes/mobile.routes";
import { registerMobileTaskRoutes } from "./routes/mobile-tasks.routes";
import { registerMobileNewsFeedRoutes } from "./routes/mobile-news-feed.routes";
import { registerChatRoutes } from "./routes/chat.routes";
import { registerMobileChatRoutes } from "./routes/mobile-chat.routes";
import { registerMobileDashboardRoutes } from "./routes/mobile-dashboard.routes";
import { registerMobilePermissionsRoutes } from "./routes/mobile-permissions.routes";
import { registerEInvoiceRoutes } from "./routes/einvoice.routes";
import { registerMonitoringRoutes } from "./routes/monitoring.routes";
import { registerTestSessionRoutes } from "./routes/test-sessions.routes";
import { registerZaloOARoutes } from "./routes/zalo-oa.routes";
import { registerInternalZaloAuthRoutes } from "./routes/internal-zalo-auth.routes";
import { registerZaloOAChatRoutes } from "./routes/zalo-oa-chat.routes";
import { registerZaloOATagRoutes } from "./routes/zalo-oa-tags.routes";
import { registerZaloSSERoutes } from "./routes/zalo-sse.routes";
import { registerFacebookChatRoutes } from "./routes/facebook-chat.routes";
import { registerFacebookSSERoutes } from "./routes/facebook-sse.routes";
import { registerFacebookGatewayRoutes } from "./routes/facebook-gateway.routes";
import { startZaloTokenRefreshCron, healNullOaIds } from "./services/zalo-token-refresh.service";
import { startClassReminderCron } from "./services/class-reminder.service";
import { startClassBellReminderCron } from "./services/class-bell-reminder.service";
import { startTuitionReminderCron } from "./services/tuition-reminder.service";
import { startDebtReminderCron } from "./services/debt-reminder.service";
import { db } from "./db";
import { zaloOaConversations, zaloOaMessages } from "@shared/schema";
import { eq } from "drizzle-orm";
import { registerDeferredTuitionRoutes } from "./routes/deferred-tuition.routes";
import { registerBidvAdminRoutes } from "./routes/bidv.routes";
import { registerBidvGatewayRoutes } from "./routes/bidv-gateway.routes";
import { registerBidvReconciliationRoutes } from "./routes/bidv-reconciliation.routes";
import { registerShortLinkRoutes } from "./routes/shortlink.routes";
import { registerStoreRoutes } from "./routes/store.routes";
import swaggerUi from "swagger-ui-express";
import { load as yamlLoad } from "js-yaml";
import fs from "fs";
import { registerStoreReceiptRoutes } from "./routes/store-receipt.routes";
import { registerStoreIssueReceiptRoutes } from "./routes/store-issue-receipt.routes";
import { registerStoreInventoryRoutes } from "./routes/store-inventory.routes";
import { registerStoreTransferRoutes } from "./routes/store-transfer.routes";
import { registerLeaveRequestRoutes } from "./routes/leave-requests.routes";
import { registerStudentLeaveRequestRoutes } from "./routes/student-leave-requests.routes";
import { registerStaffRewardRoutes } from "./routes/staff-rewards.routes";
import { registerStaffAdvanceRoutes } from "./routes/staff-advances.routes";
import { registerNewsFeedRoutes } from "./routes/news-feed.routes";
import { registerStaffAttendanceRoutes } from "./routes/staff-attendance.routes";
import { registerSalarySheetRoutes } from "./routes/salary-sheets.routes";
import { registerCustomerGuideRoutes } from "./routes/customer-guide.routes";
import { registerCommissionRoutes } from "./routes/commission.routes";
import { registerReconciliationRoutes } from "./routes/reconciliation.routes";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  initializeWsHub(wss);

  setupAuth(app);

  // JWT middleware — chạy trước mọi route, set req.user nếu có Bearer token hợp lệ
  app.use(jwtAuthMiddleware);

  // Auth routes
  app.post(api.auth.login.path, (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        if (info?.message === "account_deleted") {
          return res.status(403).json({ message: "Tài khoản không còn tồn tại trong hệ thống. Vui lòng liên hệ quản trị viên." });
        }
        if (info?.message === "account_inactive") {
          return res.status(403).json({ message: "Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên." });
        }
        return res.status(401).json({ message: "Tên đăng nhập hoặc mật khẩu không đúng." });
      }
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "30d" });
        const { passwordHash: _ph, ...safeUser } = user as any;
        res.status(200).json({ user: safeUser, token });
      });
    })(req, res, next);
  });

  app.post(api.auth.logout.path, (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.status(200).json({ message: "Logged out" });
    });
  });

  app.get(api.auth.me.path, (req, res) => {
    if (!req.isAuthenticated() && !req.user) return res.sendStatus(401);
    const { passwordHash, ...safeUser } = req.user as any;
    res.status(200).json(safeUser);
  });

  // Public: lấy logo + tên cơ sở chính (không cần auth — dùng ở trang login)
  app.get("/api/public/main-location", async (_req, res) => {
    try {
      const { db } = await import("./db");
      const { locations } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [main] = await db
        .select({ name: locations.name, logoUrl: locations.logoUrl })
        .from(locations)
        .where(eq(locations.isMain, true))
        .limit(1);
      res.json(main ?? null);
    } catch {
      res.json(null);
    }
  });

  // ── Public: Registration form endpoints (no auth) ───────────────────────────
  app.get("/api/public/registration-form-config", async (_req, res) => {
    try {
      const { db } = await import("./db");
      const { crmRegistrationFormFields, crmCustomFields, locations } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [fields, customFields, allLocs] = await Promise.all([
        db.select().from(crmRegistrationFormFields),
        db.select().from(crmCustomFields).orderBy(crmCustomFields.position),
        db.select({ id: locations.id, name: locations.name, isMain: locations.isMain }).from(locations),
      ]);
      const mainLocation = allLocs.find(l => l.isMain) ?? null;
      res.json({ fields, customFields, mainLocation, locations: allLocs });
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.get("/api/public/registration-form/sources", async (_req, res) => {
    try {
      const { db } = await import("./db");
      const { crmCustomerSources } = await import("@shared/schema");
      const sources = await db.select({ id: crmCustomerSources.id, name: crmCustomerSources.name })
        .from(crmCustomerSources);
      res.json(sources);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.get("/api/public/registration-form/staff", async (_req, res) => {
    try {
      const { db } = await import("./db");
      const { staff, users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const rows = await db.select({ id: staff.id, fullName: staff.fullName })
        .from(staff)
        .innerJoin(users, eq(staff.userId, users.id))
        .where(eq(users.isActive, true));
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: (err as any).message });
    }
  });

  app.post("/api/public/registration-form/submit", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { crmRegistrationFormFields, locations } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      // Verify form config — only accept fields that are actually enabled
      const enabledRows = await db.select().from(crmRegistrationFormFields).where(eq(crmRegistrationFormFields.isVisible, true));
      const enabledKeys = new Set(enabledRows.map(r => r.fieldKey));
      const requiredKeys = new Set(enabledRows.filter(r => r.isRequired).map(r => r.fieldKey));

      const body = req.body as Record<string, any>;
      const fullName = (body.fullName ?? "").trim();
      if (!fullName) return res.status(400).json({ message: "Họ và tên là bắt buộc." });

      // Enforce required fields from config
      const SCALAR_LABELS: Record<string, string> = {
        phone: "Số điện thoại", email: "Email", dateOfBirth: "Ngày sinh",
        parentName: "Họ tên phụ huynh", parentPhone: "Số điện thoại phụ huynh",
        note: "Ghi chú", address: "Địa chỉ",
      };
      for (const [key, label] of Object.entries(SCALAR_LABELS)) {
        if (requiredKeys.has(key) && !body[key]?.toString().trim()) {
          return res.status(400).json({ message: `${label} là bắt buộc.` });
        }
      }
      if (requiredKeys.has("locationId") && !body.locationId?.toString().trim()) {
        return res.status(400).json({ message: "Cơ sở là bắt buộc." });
      }
      if (requiredKeys.has("customerSourceIds") && (!Array.isArray(body.customerSourceIds) || body.customerSourceIds.length === 0)) {
        return res.status(400).json({ message: "Nguồn khách hàng là bắt buộc." });
      }
      if (requiredKeys.has("salesByIds") && (!Array.isArray(body.salesByIds) || body.salesByIds.length === 0)) {
        return res.status(400).json({ message: "Nhân viên tư vấn là bắt buộc." });
      }
      // Enforce required custom fields (keys stored as "custom:<id>")
      for (const reqKey of requiredKeys) {
        if (!reqKey.startsWith("custom:")) continue;
        const cfId = reqKey.slice(7);
        const val = body.customFields?.[cfId];
        if (val === undefined || val === null || val.toString().trim() === "") {
          return res.status(400).json({ message: "Vui lòng điền đầy đủ các trường bắt buộc." });
        }
      }

      // Resolve location: prefer selected locationId from form, fall back to main location
      const [mainLoc] = await db.select({ id: locations.id }).from(locations).where(eq(locations.isMain, true)).limit(1);
      const resolvedLocationId = (enabledKeys.has("locationId") && body.locationId) ? body.locationId : mainLoc?.id;

      // Build student data — only include fields that are enabled
      const studentData: Record<string, any> = { fullName, type: "Học viên" };
      const customFields: Record<string, any> = {};

      const ALLOWED_SCALAR = ["phone", "email", "dateOfBirth", "parentName", "parentPhone", "note", "address"];
      for (const key of ALLOWED_SCALAR) {
        if (enabledKeys.has(key) && body[key] !== undefined && body[key] !== "") {
          studentData[key] = body[key];
        }
      }
      if (enabledKeys.has("customerSourceIds") && Array.isArray(body.customerSourceIds) && body.customerSourceIds.length > 0) {
        studentData.customerSourceIds = body.customerSourceIds;
      }
      if (enabledKeys.has("salesByIds") && Array.isArray(body.salesByIds) && body.salesByIds.length > 0) {
        studentData.salesByIds = body.salesByIds;
      }
      // Custom fields
      if (body.customFields && typeof body.customFields === "object") {
        for (const [k, v] of Object.entries(body.customFields)) {
          if (enabledKeys.has(`custom:${k}`)) customFields[k] = v;
        }
      }
      if (Object.keys(customFields).length > 0) studentData.customFields = customFields;
      if (resolvedLocationId) studentData.locationIds = [resolvedLocationId];

      const { createStudent } = await import("./storage/student.storage");
      const newStudent = await createStudent(studentData);
      res.status(201).json({ id: newStudent.id, code: newStudent.code, message: "Đăng ký thành công!" });
    } catch (err: any) {
      console.error("[PublicRegistration] submit error:", err);
      res.status(500).json({ message: "Đã xảy ra lỗi. Vui lòng thử lại." });
    }
  });

  // Protect all API routes after auth
  // Chấp nhận cả session cookie (req.isAuthenticated) và JWT (req.user set bởi jwtAuthMiddleware)
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth")) return next();
    if (req.path.startsWith("/mobile/auth")) return next();
    if (req.path === "/customer-guide" && req.method === "GET") return next();
    if (req.path === "/page-guide" && req.method === "GET") return next();
    if (req.path === "/zalo-oa/webhook") return next(); // Zalo webhook không cần auth
    if (req.path === "/zalo/incoming") return next();   // Gateway → main app (xác thực bằng x-gateway-secret)
    if (req.path === "/zalo/receive-token") return next(); // Gateway deliver token
    if (req.path === "/facebook/incoming") return next(); // Facebook gateway → center (xác thực bằng x-gateway-secret)
    if (req.path === "/facebook/webhook") return next(); // Facebook webhook verify (GET) — không cần auth
    if (req.path === "/facebook/oauth/callback") return next(); // Facebook OAuth redirect — không có session
    if (req.path === "/bidv/getbill") return next();    // BIDV webhook không cần auth
    if (req.path === "/bidv/paybill") return next();    // BIDV webhook không cần auth
    if (req.path === "/admin/tinode-push-test") return next(); // Debug endpoint — localhost only
    if (req.path === "/admin/expo-push-test") return next(); // Debug endpoint — localhost only
    if (req.isAuthenticated() || req.user) return next();
    return res.sendStatus(401);
  });

  // Apply location access control to all non-auth API routes
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth")) return next();
    if (req.path.startsWith("/mobile/auth")) return next();
    if (req.path === "/customer-guide" && req.method === "GET") return next();
    if (req.path === "/page-guide" && req.method === "GET") return next();
    if (req.path === "/zalo-oa/webhook") return next(); // Zalo webhook bypass
    if (req.path === "/zalo/incoming") return next();   // Gateway webhook bypass
    if (req.path === "/zalo/receive-token") return next(); // Gateway token delivery bypass
    if (req.path === "/facebook/incoming") return next(); // Facebook gateway → center bypass
    if (req.path === "/facebook/webhook") return next(); // Facebook webhook bypass
    if (req.path === "/facebook/oauth/callback") return next(); // Facebook OAuth redirect bypass
    if (req.path === "/bidv/getbill") return next();    // BIDV webhook bypass
    if (req.path === "/bidv/paybill") return next();    // BIDV webhook bypass
    if (req.path === "/admin/tinode-push-test") return next(); // Debug endpoint
    if (req.path === "/admin/expo-push-test") return next(); // Debug endpoint
    locationAccessMiddleware(req, res, next);
  });

  // Public shortlink redirect — không cần auth
  registerShortLinkRoutes(app);

  // Serve uploaded files
  app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));
  // Return proper 404 when uploaded file not found (prevent Vite from serving React app)
  app.use("/uploads", (_req, res) => {
    res.status(404).send("File not found");
  });

  // Upload routes (before auth middleware so multer can parse multipart)
  registerUploadRoutes(app);

  // Domain routes
  registerConfigRoutes(app);
  registerStudentsRoutes(app);
  registerClassesRoutes(app);
  registerAttendanceRoutes(app);
  registerFinanceRoutes(app);
  registerMySpaceRoutes(app);
  await registerTeacherSalaryRoutes(app);
  await registerTeacherSalaryPackageRoutes(app);
  registerStaffSalaryConfigRoutes(app);
  registerStaffHrSalaryConfigRoutes(app);
  registerQuestionRoutes(app);
  registerExamRoutes(app);
  registerExamSectionRoutes(app);
  registerExamSectionQuestionRoutes(app);
  registerExamSubmissionRoutes(app);
  registerAssessmentHistoryRoutes(app);
  registerAIRoutes(app);
  registerAISettingsRoutes(app);
  registerPaymentGatewayRoutes(app);
  registerOmicallRoutes(app);
  registerTaskStatusRoutes(app);
  registerTaskLevelRoutes(app);
  registerTaskRoutes(app);
  registerNotificationRoutes(app);
  registerMobileRoutes(app);
  registerMobileTaskRoutes(app);
  registerMobileNewsFeedRoutes(app);

  // ── OpenAPI spec & Swagger UI (admin-only) ──────────────────────
  try {
    const specPath = path.resolve(process.cwd(), "docs/openapi.yaml");
    const specDoc = yamlLoad(fs.readFileSync(specPath, "utf8")) as object;

    // Chỉ user đã đăng nhập mới được xem Swagger UI
    // (username === "admin" = superadmin, hoặc bất kỳ staff nào có session/JWT hợp lệ)
    const docsAuthMiddleware = (req: any, res: any, next: any) => {
      const user = req.user as { username?: string } | undefined;
      if (!user) return res.status(401).json({ message: "Yêu cầu đăng nhập" });
      next();
    };

    // Public — spec file không cần auth (chỉ là tài liệu, không có dữ liệu nhạy cảm)
    app.get("/api-docs/openapi.yaml", (_req, res) => {
      res.setHeader("Content-Type", "application/yaml");
      res.sendFile(specPath);
    });
    app.get("/api-docs/openapi.json", (_req, res) => {
      res.json(specDoc);
    });
    // Swagger UI — yêu cầu đăng nhập
    app.use("/api-docs", docsAuthMiddleware, swaggerUi.serve, swaggerUi.setup(specDoc, {
      customSiteTitle: "EduManage Mobile API",
      swaggerOptions: { persistAuthorization: true },
    }));
    console.log("[API Docs] Swagger UI available at /api-docs (admin only)");
  } catch (e) {
    console.warn("[API Docs] Failed to load openapi.yaml:", e);
  }
  registerChatRoutes(app);
  registerMobileChatRoutes(app);
  registerMobileDashboardRoutes(app);
  registerMobilePermissionsRoutes(app);
  registerEInvoiceRoutes(app);
  registerZaloOARoutes(app);
  registerInternalZaloAuthRoutes(app);
  registerZaloOAChatRoutes(app);
  registerZaloOATagRoutes(app);
  registerZaloSSERoutes(app);
  registerFacebookGatewayRoutes(app);
  registerFacebookChatRoutes(app);
  registerFacebookSSERoutes(app);
  startZaloTokenRefreshCron();
  startClassReminderCron();
  startClassBellReminderCron();
  startTuitionReminderCron();
  startDebtReminderCron();
  healNullOaIds();
  // ONE-TIME: xóa conversation rác do bug auto-heal cũ (followerId = OA ID)
  const GHOST_CONV_ID = "fad9de58-a26a-4987-8a34-59168f81871e";
  db.select({ id: zaloOaConversations.id }).from(zaloOaConversations).where(eq(zaloOaConversations.id, GHOST_CONV_ID)).limit(1).then(async (rows) => {
    if (rows.length > 0) {
      await db.delete(zaloOaMessages).where(eq(zaloOaMessages.conversationId, GHOST_CONV_ID));
      await db.delete(zaloOaConversations).where(eq(zaloOaConversations.id, GHOST_CONV_ID));
      console.log(`[Cleanup] Đã xóa conversation rác ${GHOST_CONV_ID}`);
    }
  }).catch(() => {});
  registerMonitoringRoutes(app);
  registerTestSessionRoutes(app);
  registerDeferredTuitionRoutes(app);
  registerBidvAdminRoutes(app);
  registerBidvGatewayRoutes(app);
  registerBidvReconciliationRoutes(app);
  registerReconciliationRoutes(app);
  await registerStoreRoutes(app);
  await registerStoreReceiptRoutes(app);
  await registerStoreIssueReceiptRoutes(app);
  await registerStoreInventoryRoutes(app);
  await registerStoreTransferRoutes(app);
  registerLeaveRequestRoutes(app);
  registerStudentLeaveRequestRoutes(app);
  registerStaffRewardRoutes(app);
  registerStaffAdvanceRoutes(app);
  registerNewsFeedRoutes(app);
  registerStaffAttendanceRoutes(app);
  registerSalarySheetRoutes(app);
  registerCustomerGuideRoutes(app);
  registerCommissionRoutes(app);

  // Client-side error reporting endpoint (unauthenticated — browser sends before auth loads)
  app.post("/api/client-errors", (req, res) => {
    const { message, stack, componentStack, url } = req.body || {};
    console.error(`[ClientError] ${message}\nURL: ${url}\nStack: ${stack}\nComponent: ${componentStack}`);
    captureError(
      Object.assign(new Error(message || "Client error"), { stack }),
      { extra: { componentStack, url, source: "frontend" } }
    );
    return res.status(204).send();
  });

  return httpServer;
}
