import { describe, expect, it, vi } from "vitest";
import { TrackSource } from "livekit-server-sdk";
import { decodeJwt } from "jose";
import {
  createClassSessionToken,
  ensureLiveKitRoom,
  getClassSessionDisplayName,
  getClassSessionRoomName,
  getParticipantGrant,
  isEligibleStudentSession,
  isLocationAllowed,
  isTeacherAssignedToSession,
  isWithinOnlineJoinWindow,
} from "./livekit-class-room.service";

describe("LiveKit class-session authorization helpers", () => {
  it("allows a teacher assigned to the session and denies an unassigned teacher", () => {
    expect(isTeacherAssignedToSession("teacher-1", ["teacher-1"], [])).toBe(true);
    expect(isTeacherAssignedToSession("teacher-1", null, ["teacher-1"])).toBe(true);
    expect(isTeacherAssignedToSession("teacher-2", ["teacher-1"], [])).toBe(false);
  });

  it("allows only session records that have not been cancelled, transferred, or moved away", () => {
    expect(isEligibleStudentSession("scheduled")).toBe(true);
    expect(isEligibleStudentSession("present")).toBe(true);
    expect(isEligibleStudentSession("cancelled")).toBe(false);
    expect(isEligibleStudentSession("transferred")).toBe(false);
    expect(isEligibleStudentSession("makeup_moved")).toBe(false);
  });

  it("enforces location scope unless the request is Super Admin", () => {
    expect(isLocationAllowed("loc-1", ["loc-1"], false)).toBe(true);
    expect(isLocationAllowed("loc-2", ["loc-1"], false)).toBe(false);
    expect(isLocationAllowed("loc-2", [], true)).toBe(true);
  });

  it("uses the configured Bangkok join window and preserves no-rule behavior", () => {
    const now = new Date("2026-11-07T02:55:00.000Z"); // 09:55 Asia/Bangkok
    const rule = { earlyEntryMinutes: 10, lateEntryMinutes: 5 };
    expect(isWithinOnlineJoinWindow("2026-11-07", "10:00", "11:00", rule, now)).toBe(true);
    expect(isWithinOnlineJoinWindow("2026-11-07", "10:00", "11:00", {
      ...rule,
      earlyEntryMinutes: 2,
    }, now)).toBe(false);
    expect(isWithinOnlineJoinWindow("2026-11-07", "10:00", "11:00", null, now)).toBe(true);
  });

  it("uses the class-session ID for the stable internal room and session index for its label", () => {
    expect(getClassSessionRoomName("abc-123")).toBe("easyedu-session-abc-123");
    expect(getClassSessionDisplayName("IELTS 4.0", 5)).toBe("IELTS 4.0 - Buổi số 5");
  });
});

describe("LiveKit room creation and role grants", () => {
  it("coalesces concurrent creation requests into one room", async () => {
    const roomName = `room-${crypto.randomUUID()}`;
    const room = { name: roomName };
    const listRooms = vi.fn(async () => [] as { name: string }[]);
    const createRoom = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return room;
    });
    const client = { listRooms, createRoom } as any;

    const [first, second] = await Promise.all([
      ensureLiveKitRoom(client, roomName),
      ensureLiveKitRoom(client, roomName),
    ]);

    expect(first).toBe(room);
    expect(second).toBe(room);
    expect(listRooms).toHaveBeenCalledTimes(1);
    expect(createRoom).toHaveBeenCalledTimes(1);
  });

  it("reuses an existing room without creating another", async () => {
    const room = { name: `room-${crypto.randomUUID()}` };
    const client = {
      listRooms: vi.fn(async () => [room]),
      createRoom: vi.fn(),
    } as any;

    await expect(ensureLiveKitRoom(client, room.name)).resolves.toBe(room);
    expect(client.createRoom).not.toHaveBeenCalled();
  });

  it("recovers when another server wins the same-name room creation race", async () => {
    const room = { name: `room-${crypto.randomUUID()}` };
    const listRooms = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([room]);
    const createRoom = vi.fn().mockRejectedValue(new Error("room already exists"));
    const client = { listRooms, createRoom } as any;

    await expect(ensureLiveKitRoom(client, room.name)).resolves.toBe(room);
    expect(createRoom).toHaveBeenCalledTimes(1);
    expect(listRooms).toHaveBeenCalledTimes(2);
  });

  it("limits camera, microphone, and screen sharing to teachers", () => {
    const teacher = getParticipantGrant("teacher", "room");
    const student = getParticipantGrant("student", "room");

    expect(teacher.canPublishSources).toEqual([
      TrackSource.CAMERA,
      TrackSource.MICROPHONE,
      TrackSource.SCREEN_SHARE,
      TrackSource.SCREEN_SHARE_AUDIO,
    ]);
    expect(student.canPublishSources).toEqual([TrackSource.CAMERA, TrackSource.MICROPHONE]);
    expect(teacher.canSubscribe).toBe(true);
    expect(student.canSubscribe).toBe(true);
    expect(student.canPublishData).toBe(false);
  });

  it("signs role-limited permissions into the actual teacher and student tokens", async () => {
    const tokenInput = {
      apiKey: "test-api-key",
      apiSecret: "test-api-secret-that-is-long-enough",
      userId: "user-1",
      displayName: "Test user",
      roomName: "session-room",
    };
    const teacher = await createClassSessionToken({ ...tokenInput, role: "teacher" });
    const student = await createClassSessionToken({ ...tokenInput, role: "student" });
    const teacherClaims = decodeJwt(teacher.token) as any;
    const studentClaims = decodeJwt(student.token) as any;

    expect(teacher.identity).not.toBe(student.identity);
    expect(teacherClaims.video.canPublishSources).toEqual([
      "camera",
      "microphone",
      "screen_share",
      "screen_share_audio",
    ]);
    expect(studentClaims.video.canPublishSources).toEqual(["camera", "microphone"]);
    expect(studentClaims.video.canPublishData).toBe(false);
  });
});
