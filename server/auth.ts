import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import jwt from "jsonwebtoken";

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
      if (user) req.user = user;
    }
  } catch {
    // Token không hợp lệ hoặc hết hạn — bỏ qua, để route tự xử lý 401
  }
  next();
}

export function setupAuth(app: Express) {
  const PostgresStore = connectPgSimple(session);
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "super-secret",
    resave: false,
    saveUninitialized: false,
    store: new PostgresStore({
      pool,
      createTableIfMissing: true,
    }),
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !comparePasswords(password, user.passwordHash)) {
          return done(null, false);
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
      done(null, user);
    } catch (err) {
      done(err);
    }
  });
}
