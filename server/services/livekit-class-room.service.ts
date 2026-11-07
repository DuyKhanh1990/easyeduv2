import { randomUUID } from "node:crypto";
import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
} from "livekit-server-sdk";

export type LiveKitParticipantRole = "teacher" | "student";

const TOKEN_TTL = "10m";
const roomCreationPromises = new Map<string, Promise<unknown>>();

export function getClassSessionRoomName(classSessionId: string): string {
  return `easyedu-session-${classSessionId}`;
}

export function getClassSessionDisplayName(className: string, sessionIndex: number): string {
  return `${className} - Buổi số ${sessionIndex}`;
}

export function isTeacherAssignedToSession(
  staffId: string,
  teacherIds: string[] | null,
  timeAssignmentTeacherIds: string[],
): boolean {
  return Boolean(teacherIds?.includes(staffId) || timeAssignmentTeacherIds.includes(staffId));
}

export function isEligibleStudentSession(status: string): boolean {
  return !["cancelled", "transferred", "makeup_moved"].includes(status);
}

export function isLocationAllowed(
  locationId: string,
  allowedLocationIds: string[],
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || allowedLocationIds.includes(locationId);
}

function sessionWallTime(dateValue: string | Date, timeValue: string): Date {
  const date = typeof dateValue === "string"
    ? dateValue.slice(0, 10).split("-").map(Number)
    : [dateValue.getUTCFullYear(), dateValue.getUTCMonth() + 1, dateValue.getUTCDate()];
  const [hour, minute] = timeValue.slice(0, 5).split(":").map(Number);
  // DB schedule times are Asia/Bangkok wall-clock values; server processes run UTC.
  return new Date(Date.UTC(date[0], date[1] - 1, date[2], hour - 7, minute));
}

export function isWithinOnlineJoinWindow(
  sessionDate: string | Date,
  startTime: string,
  endTime: string,
  rule: { earlyEntryMinutes: number; lateEntryMinutes: number } | null,
  now = new Date(),
): boolean {
  // This preserves current calendar behavior when a location has no rule.
  if (!rule) return true;
  const start = sessionWallTime(sessionDate, startTime);
  const end = sessionWallTime(sessionDate, endTime);
  if (end <= start) end.setUTCDate(end.getUTCDate() + 1);
  const opensAt = start.getTime() - rule.earlyEntryMinutes * 60_000;
  const closesAt = start.getTime() + rule.lateEntryMinutes * 60_000;
  return now.getTime() >= opensAt && now.getTime() <= closesAt;
}

export function getParticipantGrant(role: LiveKitParticipantRole, roomName: string) {
  return {
    roomJoin: true,
    room: roomName,
    canSubscribe: true,
    canPublish: true,
    canPublishData: false,
    canPublishSources: role === "teacher"
      ? [TrackSource.CAMERA, TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
      : [TrackSource.CAMERA, TrackSource.MICROPHONE],
  };
}

export function createLiveKitRoomClient(): RoomServiceClient {
  const url = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!url || !apiKey || !apiSecret) {
    throw new Error("LiveKit chưa được cấu hình.");
  }
  const host = url.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
  return new RoomServiceClient(host, apiKey, apiSecret);
}

export async function ensureLiveKitRoom(
  client: Pick<RoomServiceClient, "listRooms" | "createRoom">,
  roomName: string,
): Promise<unknown> {
  const pending = roomCreationPromises.get(roomName);
  if (pending) return pending;

  const operation = (async () => {
    const existing = await client.listRooms([roomName]);
    if (existing.length) return existing[0];
    try {
      // No delete is performed on participant disconnect. Stable names let a
      // later start reuse the same logical room for this class session.
      return await client.createRoom({ name: roomName });
    } catch (error) {
      // A second server process may win the create race. Re-read the room
      // before surfacing a provider error.
      const racedRoom = await client.listRooms([roomName]);
      if (racedRoom.length) return racedRoom[0];
      throw error;
    }
  })();
  roomCreationPromises.set(roomName, operation);
  try {
    return await operation;
  } finally {
    if (roomCreationPromises.get(roomName) === operation) {
      roomCreationPromises.delete(roomName);
    }
  }
}

export async function getExistingLiveKitRoom(
  client: Pick<RoomServiceClient, "listRooms">,
  roomName: string,
): Promise<unknown | null> {
  const rooms = await client.listRooms([roomName]);
  return rooms[0] ?? null;
}

export async function createClassSessionToken(input: {
  apiKey: string;
  apiSecret: string;
  userId: string;
  displayName: string;
  roomName: string;
  role: LiveKitParticipantRole;
}) {
  const identity = `ee-${input.userId}-${randomUUID()}`;
  const accessToken = new AccessToken(input.apiKey, input.apiSecret, {
    identity,
    name: input.displayName,
    ttl: TOKEN_TTL,
  });
  accessToken.addGrant(getParticipantGrant(input.role, input.roomName));
  return { identity, token: await accessToken.toJwt() };
}
