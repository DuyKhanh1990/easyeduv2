import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { staffAssignments, staff, students, studentLocations } from "@shared/schema";
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
  if (!req.isAuthenticated() && !req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = req.user!;

  try {
    // Single JOIN query replaces the previous 2-query pattern (staff lookup + assignments lookup).
    // LEFT JOIN ensures we get a row even when the staff member has no assignments yet.
    const staffRows = await db
      .select({
        staffId: staff.id,
        locationId: staffAssignments.locationId,
        roleId: staffAssignments.roleId,
      })
      .from(staff)
      .leftJoin(staffAssignments, eq(staffAssignments.staffId, staff.id))
      .where(eq(staff.userId, user.id));

    if (staffRows.length > 0) {
      const staffId = staffRows[0].staffId;
      const locationIds = [...new Set(staffRows.map(r => r.locationId).filter((id): id is string => !!id))];
      const roleIds = [...new Set(staffRows.map(r => r.roleId).filter((id): id is string => !!id))];

      req.isSuperAdmin = user.username === "admin";
      req.isStudent = false;
      req.allowedLocationIds = locationIds;
      req.staffId = staffId;
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
      // Lấy danh sách cơ sở học viên đang học để dùng cho location filter
      const locRows = await db
        .select({ locationId: studentLocations.locationId })
        .from(studentLocations)
        .where(eq(studentLocations.studentId, studentRecord.id));

      req.isSuperAdmin = false;
      req.isStudent = true;
      req.allowedLocationIds = locRows.map(r => r.locationId);
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
