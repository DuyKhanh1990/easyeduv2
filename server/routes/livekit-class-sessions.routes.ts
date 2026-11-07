import type { Express, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import type { RoomServiceClient } from "livekit-server-sdk";
import {
  classSessions,
  classSessionTeacherAssignments,
  classes,
  onlineLearningRules,
  shiftTemplates,
  staff,
  studentSessions,
  students,
} from "@shared/schema";
import { db } from "../db";
import {
  createClassSessionToken,
  createLiveKitRoomClient,
  ensureLiveKitRoom,
  getClassSessionDisplayName,
  getClassSessionRoomName,
  getExistingLiveKitRoom,
  isEligibleStudentSession,
  isLocationAllowed,
  isTeacherAssignedToSession,
  isWithinOnlineJoinWindow,
} from "../services/livekit-class-room.service";
import { z } from "zod";

type RequestWithAccess = Request & {
  user?: { id: string; username?: string };
  staffId?: string | null;
  allowedLocationIds?: string[];
  isSuperAdmin?: boolean;
  isStudent?: boolean;
};

const sessionIdSchema = z.string().uuid();

function getLiveKitCredentials() {
  const serverUrl = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!serverUrl || !apiKey || !apiSecret) return null;
  return { serverUrl, apiKey, apiSecret };
}

async function loadSession(classSessionId: string) {
  const [row] = await db
    .select({
      id: classSessions.id,
      classId: classSessions.classId,
      sessionDate: classSessions.sessionDate,
      sessionIndex: classSessions.sessionIndex,
      sessionStatus: classSessions.status,
      sessionFormat: classSessions.learningFormat,
      teacherIds: classSessions.teacherIds,
      className: classes.name,
      classFormat: classes.learningFormat,
      locationId: classes.locationId,
      startTime: shiftTemplates.startTime,
      endTime: shiftTemplates.endTime,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .innerJoin(shiftTemplates, eq(classSessions.shiftTemplateId, shiftTemplates.id))
    .where(eq(classSessions.id, classSessionId))
    .limit(1);
  return row ?? null;
}

async function issueToken(
  input: {
    credentials: NonNullable<ReturnType<typeof getLiveKitCredentials>>;
    userId: string;
    displayName: string;
    roomName: string;
    roomDisplayName: string;
    role: "teacher" | "student";
  },
) {
  const { token } = await createClassSessionToken({
    apiKey: input.credentials.apiKey,
    apiSecret: input.credentials.apiSecret,
    userId: input.userId,
    displayName: input.displayName,
    roomName: input.roomName,
    role: input.role,
  });
  return {
    serverUrl: input.credentials.serverUrl,
    token,
    roomName: input.roomName,
    displayName: input.roomDisplayName,
  };
}

export function registerLiveKitClassSessionRoutes(
  app: Express,
  dependencies: {
    getRoomClient?: () => RoomServiceClient;
  } = {},
) {
  const getRoomClient = dependencies.getRoomClient ?? createLiveKitRoomClient;

  app.post(
    "/api/livekit/class-sessions/:classSessionId/start",
    async (req: Request, res: Response) => {
      const request = req as RequestWithAccess;
      try {
        if (!request.user?.id) return res.status(401).json({ message: "Vui lòng đăng nhập." });
        const parsedId = sessionIdSchema.safeParse(request.params.classSessionId);
        if (!parsedId.success) return res.status(400).json({ message: "ID buổi học không hợp lệ." });
        if (!request.staffId || request.isStudent) {
          return res.status(403).json({ message: "Chỉ giáo viên được phân công mới có thể mở phòng." });
        }

        const session = await loadSession(parsedId.data);
        if (!session) return res.status(404).json({ message: "Không tìm thấy buổi học." });
        if (session.sessionIndex == null) {
          return res.status(409).json({ message: "Buổi học chưa có số thứ tự để tạo tên phòng." });
        }
        if (session.sessionStatus === "cancelled") {
          return res.status(409).json({ message: "Buổi học đã bị hủy." });
        }
        if (session.sessionFormat !== "online" && session.classFormat !== "online") {
          return res.status(409).json({ message: "Buổi học này không được cấu hình học online." });
        }
        if (!isLocationAllowed(session.locationId, request.allowedLocationIds ?? [], request.isSuperAdmin === true)) {
          return res.status(403).json({ message: "Bạn không có quyền truy cập cơ sở của buổi học." });
        }

        const assignments = await db
          .select({ teacherId: classSessionTeacherAssignments.teacherId })
          .from(classSessionTeacherAssignments)
          .where(eq(classSessionTeacherAssignments.classSessionId, session.id));
        if (!isTeacherAssignedToSession(
          request.staffId,
          session.teacherIds,
          assignments.map((assignment) => assignment.teacherId),
        )) {
          return res.status(403).json({ message: "Bạn chưa được phân công vào buổi học này." });
        }

        const [rule] = await db
          .select({
            earlyEntryMinutes: onlineLearningRules.earlyEntryMinutes,
            lateEntryMinutes: onlineLearningRules.lateEntryMinutes,
          })
          .from(onlineLearningRules)
          .where(eq(onlineLearningRules.locationId, session.locationId))
          .limit(1);
        if (!isWithinOnlineJoinWindow(
          session.sessionDate,
          session.startTime,
          session.endTime,
          rule ?? null,
        )) {
          return res.status(403).json({ message: "Chưa đến thời gian mở phòng theo cấu hình cơ sở." });
        }

        const credentials = getLiveKitCredentials();
        if (!credentials) return res.status(503).json({ message: "LiveKit chưa được cấu hình." });
        const roomName = getClassSessionRoomName(session.id);
        const roomDisplayName = getClassSessionDisplayName(session.className, session.sessionIndex);
        const [teacher] = await db
          .select({ fullName: staff.fullName })
          .from(staff)
          .where(eq(staff.id, request.staffId))
          .limit(1);
        const client = getRoomClient();
        await ensureLiveKitRoom(client, roomName);
        const payload = await issueToken({
          credentials,
          userId: request.user.id,
          displayName: teacher?.fullName || "Giáo viên",
          roomName,
          roomDisplayName,
          role: "teacher",
        });
        return res.json(payload);
      } catch (error) {
        console.error("[LiveKit] Teacher start failed:", error);
        return res.status(500).json({ message: "Không thể mở phòng LiveKit." });
      }
    },
  );

  app.post(
    "/api/livekit/class-sessions/:classSessionId/join",
    async (req: Request, res: Response) => {
      const request = req as RequestWithAccess;
      try {
        if (!request.user?.id) return res.status(401).json({ message: "Vui lòng đăng nhập." });
        const parsedId = sessionIdSchema.safeParse(request.params.classSessionId);
        if (!parsedId.success) return res.status(400).json({ message: "ID buổi học không hợp lệ." });
        if (!request.isStudent) return res.status(403).json({ message: "Chỉ tài khoản học viên mới được tham gia." });

        const session = await loadSession(parsedId.data);
        if (!session) return res.status(404).json({ message: "Không tìm thấy buổi học." });
        if (session.sessionIndex == null) {
          return res.status(409).json({ message: "Buổi học chưa có số thứ tự để tạo tên phòng." });
        }
        if (session.sessionStatus === "cancelled") {
          return res.status(409).json({ message: "Buổi học đã bị hủy." });
        }
        if (session.sessionFormat !== "online" && session.classFormat !== "online") {
          return res.status(409).json({ message: "Buổi học này không được cấu hình học online." });
        }
        if (!isLocationAllowed(session.locationId, request.allowedLocationIds ?? [], request.isSuperAdmin === true)) {
          return res.status(403).json({ message: "Bạn không có quyền truy cập cơ sở của buổi học." });
        }

        const [student] = await db
          .select({ id: students.id, fullName: students.fullName, type: students.type })
          .from(students)
          .where(eq(students.userId, request.user.id))
          .limit(1);
        if (!student || student.type !== "Học viên") {
          return res.status(403).json({ message: "Giai đoạn này chỉ tài khoản học viên mới được tham gia." });
        }

        const enrollments = await db
          .select({ status: studentSessions.status })
          .from(studentSessions)
          .where(and(
            eq(studentSessions.studentId, student.id),
            eq(studentSessions.classSessionId, session.id),
            eq(studentSessions.classId, session.classId),
          ))
        if (!enrollments.some((enrollment) => isEligibleStudentSession(enrollment.status))) {
          return res.status(403).json({ message: "Bạn không được xếp vào buổi học này." });
        }

        const [rule] = await db
          .select({
            earlyEntryMinutes: onlineLearningRules.earlyEntryMinutes,
            lateEntryMinutes: onlineLearningRules.lateEntryMinutes,
          })
          .from(onlineLearningRules)
          .where(eq(onlineLearningRules.locationId, session.locationId))
          .limit(1);
        if (!isWithinOnlineJoinWindow(
          session.sessionDate,
          session.startTime,
          session.endTime,
          rule ?? null,
        )) {
          return res.status(403).json({ message: "Chưa đến thời gian tham gia theo cấu hình cơ sở." });
        }

        const credentials = getLiveKitCredentials();
        if (!credentials) return res.status(503).json({ message: "LiveKit chưa được cấu hình." });
        const roomName = getClassSessionRoomName(session.id);
        const roomDisplayName = getClassSessionDisplayName(session.className, session.sessionIndex);
        const client = getRoomClient();
        if (!(await getExistingLiveKitRoom(client, roomName))) {
          return res.status(409).json({ message: "Giáo viên chưa mở phòng cho buổi học này." });
        }
        const payload = await issueToken({
          credentials,
          userId: request.user.id,
          displayName: student.fullName,
          roomName,
          roomDisplayName,
          role: "student",
        });
        return res.json(payload);
      } catch (error) {
        console.error("[LiveKit] Student join failed:", error);
        return res.status(500).json({ message: "Không thể tham gia phòng LiveKit." });
      }
    },
  );
}
