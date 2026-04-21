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
import { registerQuestionRoutes } from "./routes/question.routes";
import { registerExamRoutes } from "./routes/exam.routes";
import { registerExamSectionRoutes } from "./routes/exam-section.routes";
import { registerExamSectionQuestionRoutes } from "./routes/exam-section-questions.routes";
import { registerExamSubmissionRoutes } from "./routes/exam-submission.routes";
import { registerAIRoutes } from "./routes/ai.routes";
import { registerAISettingsRoutes } from "./routes/ai-settings.routes";
import { registerPaymentGatewayRoutes } from "./routes/payment-gateways.routes";
import { registerTaskStatusRoutes } from "./routes/task-statuses.routes";
import { registerTaskLevelRoutes } from "./routes/task-levels.routes";
import { registerTaskRoutes } from "./routes/tasks.routes";
import { registerMobileRoutes } from "./routes/mobile.routes";
import { registerMobileTaskRoutes } from "./routes/mobile-tasks.routes";
import { registerChatRoutes } from "./routes/chat.routes";
import { registerMobileChatRoutes } from "./routes/mobile-chat.routes";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  initializeWsHub(wss);

  setupAuth(app);

  // JWT middleware — chạy trước mọi route, set req.user nếu có Bearer token hợp lệ
  app.use(jwtAuthMiddleware);

  // Auth routes
  app.post(api.auth.login.path, passport.authenticate("local"), (req, res) => {
    const user = req.user!;
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "30d" });
    res.status(200).json({ user, token });
  });

  app.post(api.auth.logout.path, (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.status(200).json({ message: "Logged out" });
    });
  });

  app.get(api.auth.me.path, (req, res) => {
    if (!req.isAuthenticated() && !req.user) return res.sendStatus(401);
    res.status(200).json(req.user);
  });

  // Protect all API routes after auth
  // Chấp nhận cả session cookie (req.isAuthenticated) và JWT (req.user set bởi jwtAuthMiddleware)
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth")) return next();
    if (req.path.startsWith("/mobile/auth")) return next();
    if (req.isAuthenticated() || req.user) return next();
    return res.sendStatus(401);
  });

  // Apply location access control to all non-auth API routes
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth")) return next();
    if (req.path.startsWith("/mobile/auth")) return next();
    locationAccessMiddleware(req, res, next);
  });

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
  registerQuestionRoutes(app);
  registerExamRoutes(app);
  registerExamSectionRoutes(app);
  registerExamSectionQuestionRoutes(app);
  registerExamSubmissionRoutes(app);
  registerAIRoutes(app);
  registerAISettingsRoutes(app);
  registerPaymentGatewayRoutes(app);
  registerTaskStatusRoutes(app);
  registerTaskLevelRoutes(app);
  registerTaskRoutes(app);
  registerNotificationRoutes(app);
  registerMobileRoutes(app);
  registerMobileTaskRoutes(app);
  registerChatRoutes(app);
  registerMobileChatRoutes(app);

  return httpServer;
}
