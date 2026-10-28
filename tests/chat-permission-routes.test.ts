import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getEffectivePermissionsMock, dbMock } = vi.hoisted(() => ({
  getEffectivePermissionsMock: vi.fn(),
  dbMock: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("../server/db", () => ({ db: dbMock }));
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
    dbMock.select.mockReset();
    dbMock.insert.mockReset();
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

  it("blocks saving an edited message without Chat Edit permission", async () => {
    getEffectivePermissionsMock.mockResolvedValue({
      canView: true,
      canViewAll: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
    });

    const response = await request(createApp())
      .post("/api/chat/topics/grp-test/messages/12/edit-history")
      .send({ previousContent: "Tin nhắn cũ" });

    expect(response.status).toBe(403);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("stores the previous text when an authorized staff member edits a class message", async () => {
    getEffectivePermissionsMock.mockResolvedValue({
      canView: true,
      canViewAll: false,
      canCreate: false,
      canEdit: true,
      canDelete: false,
    });

    let selectCall = 0;
    dbMock.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            selectCall += 1;
            return selectCall === 1
              ? []
              : [{
                  id: "class-id",
                  locationId: "test-location-id",
                  teacherIds: ["test-staff-id"],
                  managerIds: [],
                }];
          },
        }),
      }),
    }));
    dbMock.insert.mockReturnValue({
      values: () => ({
        returning: async () => [{ id: "history-id" }],
      }),
    });

    const response = await request(createApp())
      .post("/api/chat/topics/grp-class/messages/12/edit-history")
      .send({ previousContent: "Phiên bản cũ" });

    expect(response.status).toBe(201);
    expect(dbMock.insert).toHaveBeenCalledOnce();
  });

  it("returns saved revisions to staff who can read the class conversation", async () => {
    getEffectivePermissionsMock.mockResolvedValue({
      canView: true,
      canViewAll: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
    });

    let selectCall = 0;
    dbMock.select.mockImplementation(() => {
      const call = selectCall++;
      return {
        from: () => ({
          where: () => ({
            limit: async () => call === 0
              ? []
              : [{
                  id: "class-id",
                  locationId: "test-location-id",
                  teacherIds: ["test-staff-id"],
                  managerIds: [],
                }],
            orderBy: async () => [{
              id: "history-id",
              previousContent: "Nội dung trước khi sửa",
              editedAt: "2026-10-28T09:00:00.000Z",
            }],
          }),
        }),
      };
    });

    const response = await request(createApp())
      .get("/api/chat/topics/grp-class/messages/12/edit-history");

    expect(response.status).toBe(200);
    expect(response.body.history).toHaveLength(1);
    expect(response.body.history[0].previousContent).toBe("Nội dung trước khi sửa");
  });
});
