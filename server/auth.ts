import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import { storage } from "./storage";
import { User as SelectUser, staff, students } from "@shared/schema";
import connectPgSimple from "connect-pg-simple";
import { db, pool } from "./db";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";

export const JWT_SECRET =
  process.env.JWT_SECRET || "mobile_jwt_secret_key_change_in_production";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (scryptSync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (scryptSync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

/**
 * Middleware: xác thực JWT từ header Authorization: Bearer <token>
 * Nếu token hợp lệ, set req.user và gọi next().
 * Nếu không có token hoặc token không hợp lệ, gọi next() mà KHÔNG set req.user
 * (để các middleware tiếp theo tự quyết định reject hay không).
 */
export async function jwtAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return next();

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
    if (!req.user) {
      const user = await storage.getUser(decoded.id);
      if (user && user.isActive) req.user = user;
    }
  } catch {
    // Token không hợp lệ hoặc hết hạn — bỏ qua, để route tự xử lý 401
  }
  next();
}

export function setupAuth(app: Express) {
  // Replit always terminates TLS at the proxy layer — trust proxy in all environments.
  app.set("trust proxy", 1);

  const PostgresStore = connectPgSimple(session);
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "super-secret",
    resave: false,
    saveUninitialized: false,
    // Reset cookie expiry on every request — users who are active never get logged out
    rolling: true,
    store: new PostgresStore({
      pool,
      createTableIfMissing: true,
      // Prune expired sessions every hour
      pruneSessionInterval: 60 * 60,
    }),
    cookie: {
      // 30-day persistent cookie so sessions survive browser restarts
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
      // secure follows the proxy's protocol (req.secure is reliable after trust proxy = 1)
      secure: "auto" as any,
    },
  };

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !comparePasswords(password, user.passwordHash)) {
          return done(null, false, { message: "invalid_credentials" });
        }
        // A deleted staff/student profile must not leave an orphaned user record
        // that can still authenticate with its old credentials.
        const [staffProfile] = await db
          .select({ id: staff.id })
          .from(staff)
          .where(eq(staff.userId, user.id))
          .limit(1);
        const [studentProfile] = await db
          .select({ id: students.id })
          .from(students)
          .where(eq(students.userId, user.id))
          .limit(1);
        if (!staffProfile && !studentProfile) {
          return done(null, false, { message: "account_deleted" });
        }
        if (!user.isActive) {
          return done(null, false, { message: "account_inactive" });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user || !user.isActive) {
        return done(null, false as any);
      }
      done(null, user);
    } catch (err) {
      done(err);
    }
  });
}
