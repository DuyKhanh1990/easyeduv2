import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { staffAssignments, staff, students } from "@shared/schema";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      allowedLocationIds: string[];
      isSuperAdmin: boolean;
      isStudent: boolean;
      staffId: string | null;
      roleIds: string[];
    }
  }
}

export async function locationAccessMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = req.user!;

  try {
    // Check staff profile first
    const [staffRecord] = await db.select().from(staff).where(eq(staff.userId, user.id));

    if (staffRecord) {
      const assignments = await db.select()
        .from(staffAssignments)
        .where(eq(staffAssignments.staffId, staffRecord.id));

      const locationIds = assignments.map(a => a.locationId);
      const roleIds = assignments.map(a => a.roleId).filter((id): id is string => !!id);

      req.isSuperAdmin = user.username === "admin";
      req.isStudent = false;
      req.allowedLocationIds = locationIds;
      req.staffId = staffRecord.id;
      req.roleIds = roleIds;

      if (!req.isSuperAdmin && locationIds.length === 0) {
        return res.status(403).json({ message: "No locations assigned to this staff" });
      }

      return next();
    }

    // No staff record — check if the user is a student
    const [studentRecord] = await db.select({ id: students.id })
      .from(students)
      .where(eq(students.userId, user.id))
      .limit(1);

    if (studentRecord) {
      req.isSuperAdmin = false;
      req.isStudent = true;
      req.allowedLocationIds = [];
      req.staffId = null;
      req.roleIds = [];
      return next();
    }

    // Super admin fallback (no staff, no student)
    if (user.username === "admin") {
      req.isSuperAdmin = true;
      req.isStudent = false;
      req.allowedLocationIds = [];
      req.staffId = null;
      req.roleIds = [];
      return next();
    }

    return res.status(403).json({ message: "No staff profile found" });
  } catch (error) {
    console.error("Location access middleware error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}
