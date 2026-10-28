import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getEffectivePermissionsMock } = vi.hoisted(() => ({
  getEffectivePermissionsMock: vi.fn(),
}));

vi.mock("../server/db", () => ({ db: {} }));
vi.mock("../server/storage", () => ({ storage: {} }));
vi.mock("../server/storage/permissions.storage", () => ({
  getEffectivePermissions: getEffectivePermissionsMock,
}));

import { registerChatRoutes } from "../server/routes/chat.routes";

function createApp(options: { isStudent?: boolean } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { id: "test-user", username: "test-staff" };
    req.roleIds = ["test-role"];
    req.staffId = "test-staff-id";
    req.allowedLocationIds = ["test-location-id"];
    req.isStudent = !!options.isStudent;
    next();
  });
  registerChatRoutes(app);
  return app;
}

describe("Chat API permission gates", () => {
  beforeEach(() => {
    getEffectivePermissionsMock.mockReset();
    getEffectivePermissionsMock.mockResolvedValue({
      canView: false,
      canViewAll: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
    });
  });

  it("blocks group creation when Create is granted without View or View all", async () => {
    getEffectivePermissionsMock.mockResolvedValue({
      canView: false,
      canViewAll: false,
      canCreate: true,
      canEdit: false,
      canDelete: false,
    });

    const response = await request(createApp())
      .post("/api/chat/groups")
      .send({ name: "Test group", memberUserIds: [] });

    expect(response.status).toBe(403);
    expect(response.body.message).toContain("Xem");
  });

  it("blocks starting a new DM when Create is granted without a view scope", async () => {
    getEffectivePermissionsMock.mockResolvedValue({
      canView: false,
      canViewAll: false,
      canCreate: true,
      canEdit: false,
      canDelete: false,
    });

    const response = await request(createApp())
      .post("/api/chat/p2p/open")
      .send({ targetUserId: "another-user" });

    expect(response.status).toBe(403);
    expect(response.body.message).toContain("Xem");
  });

  it("blocks Chat credentials when the staff member has no view permission", async () => {
    const response = await request(createApp()).get("/api/chat/credentials");

    expect(response.status).toBe(403);
    expect(response.body.message).toContain("xem Chat");
  });

  it("continues to block students and parents from creating groups", async () => {
    const response = await request(createApp({ isStudent: true }))
      .post("/api/chat/groups")
      .send({ name: "Student group", memberUserIds: [] });

    expect(response.status).toBe(403);
    expect(response.body.message).toContain("không được phép tạo nhóm");
  });
});
