/**
 * mobile-permissions.routes.ts
 *
 * Cung cấp thông tin phân quyền đầy đủ cho mobile app.
 * Mobile team dùng để ẩn/hiện màn hình, tab, nút bấm theo role.
 *
 * GET  /api/mobile/me/permissions  — toàn bộ flags phân quyền của user hiện tại
 * GET  /api/mobile/me/profile      — thông tin profile + roles của user hiện tại
 */

import type { Express } from "express";
import { db } from "../db";
import {
  staff,
  students,
  staffAssignments,
  departments,
  locations,
  users,
  roles as rolesTable,
} from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getEffectivePermissions, getAllPermissionsForRoles } from "../storage/permissions.storage";

// ─── Tên resource dùng trong bảng rolePermissions ────────────────────────────
// Phải khớp chính xác với constant trong từng routes file
const RESOURCES = {
  newsFeed:        "/news-feed",
  customers:       "/customers",
  classes:         "/classes",
  invoices:        "/invoices",
  tasks:           "/tasks#list",
  learningOverview:"/learning-overview",
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Kiểm tra nhân viên có thuộc Phòng Đào tạo (system dept) không */
async function checkIsStaffInDaotao(staffId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: staffAssignments.id })
    .from(staffAssignments)
    .innerJoin(departments, eq(staffAssignments.departmentId, departments.id))
    .where(and(
      eq(staffAssignments.staffId, staffId),
      eq(departments.name, "Phòng Đào tạo"),
      eq(departments.isSystem, true),
    ))
    .limit(1);
  return !!row;
}

/** Lấy staffId từ userId, trả null nếu không phải nhân viên */
async function getStaffIdForUser(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: staff.id })
    .from(staff)
    .where(eq(staff.userId, userId))
    .limit(1);
  return row?.id ?? null;
}

type ResourceKey = keyof typeof RESOURCES;

interface PermissionFlags {
  canView:    boolean;
  canViewAll: boolean;
  canCreate:  boolean;
  canEdit:    boolean;
  canDelete:  boolean;
}

const DENIED: PermissionFlags = {
  canView: false, canViewAll: false,
  canCreate: false, canEdit: false, canDelete: false,
};
const GRANTED: PermissionFlags = {
  canView: true, canViewAll: true,
  canCreate: true, canEdit: true, canDelete: true,
};
const VIEW_ONLY: PermissionFlags = {
  canView: true, canViewAll: false,
  canCreate: false, canEdit: false, canDelete: false,
};

// ─── Shared permission helpers ────────────────────────────────────────────────

type AllPerms = Awaited<ReturnType<typeof getAllPermissionsForRoles>>;

/**
 * Merge nhiều rows cùng resource thành 1 PermissionFlags (OR từng field).
 * Nếu resource chưa có row nào → DENIED.
 */
function pick(allPerms: AllPerms, resource: string): PermissionFlags {
  const rows = allPerms.filter(p => p.resource === resource);
  if (rows.length === 0) return { ...DENIED };
  return rows.reduce<PermissionFlags>(
    (acc, p) => ({
      canView:    acc.canView    || p.canView,
      canViewAll: acc.canViewAll || p.canViewAll,
      canCreate:  acc.canCreate  || p.canCreate,
      canEdit:    acc.canEdit    || p.canEdit,
      canDelete:  acc.canDelete  || p.canDelete,
    }),
    { ...DENIED },
  );
}

/**
 * learningOverview: check cả top-level "/learning-overview" lẫn các sub-tab "#xxx".
 * Giám đốc thường chỉ được cấp sub-resources, không có top-level → cần prefix match.
 */
function pickLearningOverview(allPerms: AllPerms): PermissionFlags {
  const rows = allPerms.filter(
    p => p.resource === RESOURCES.learningOverview || p.resource.startsWith(RESOURCES.learningOverview + "#")
  );
  if (rows.length === 0) return { ...DENIED };
  return rows.reduce<PermissionFlags>(
    (acc, p) => ({
      canView:    acc.canView    || p.canView,
      canViewAll: acc.canViewAll || p.canViewAll,
      canCreate:  acc.canCreate  || p.canCreate,
      canEdit:    acc.canEdit    || p.canEdit,
      canDelete:  acc.canDelete  || p.canDelete,
    }),
    { ...DENIED },
  );
}

/**
 * My-space pages là dữ liệu cá nhân — canView/canViewAll có nghĩa như nhau.
 * Nếu chưa có row → default ALLOW (chưa cấu hình = cho xem).
 * Nếu có row explicit false → DENY.
 */
function mySpacePick(allPerms: AllPerms, resource: string): boolean {
  const rows = allPerms.filter(p => p.resource === resource);
  if (rows.length === 0) return true;
  return rows.some(p => p.canView || p.canViewAll);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function resolveStaffPermissions(
  roleIds: string[],
  isSuperAdmin: boolean,
): Promise<{
  features: Record<ResourceKey, PermissionFlags>;
  mySpaceCanView: Record<"calendar" | "assignments" | "invoices" | "payroll" | "scoreSheet", boolean>;
}> {
  if (isSuperAdmin) {
    return {
      features: {
        newsFeed:        { ...GRANTED },
        customers:       { ...GRANTED },
        classes:         { ...GRANTED },
        invoices:        { ...GRANTED },
        tasks:           { ...GRANTED },
        learningOverview:{ ...GRANTED },
      },
      mySpaceCanView: {
        calendar:    true,
        assignments: true,
        invoices:    true,
        payroll:     true,
        scoreSheet:  true,
      },
    };
  }

  const allPerms = await getAllPermissionsForRoles(roleIds);

  return {
    features: {
      newsFeed:        pick(allPerms, RESOURCES.newsFeed),
      customers:       pick(allPerms, RESOURCES.customers),
      classes:         pick(allPerms, RESOURCES.classes),
      invoices:        pick(allPerms, RESOURCES.invoices),
      tasks:           pick(allPerms, RESOURCES.tasks),
      learningOverview:pickLearningOverview(allPerms),
    },
    mySpaceCanView: {
      calendar:    mySpacePick(allPerms, "/my-space/calendar"),
      assignments: mySpacePick(allPerms, "/my-space/assignments"),
      invoices:    mySpacePick(allPerms, "/my-space/invoices"),
      payroll:     mySpacePick(allPerms, "/my-space/payroll"),
      scoreSheet:  mySpacePick(allPerms, "/my-space/score-sheet"),
    },
  };
}

/**
 * Lấy permissions động từ DB cho student/parent.
 * req.roleIds = [] với student nên phải tự lookup role system theo studentType.
 */
async function resolveStudentPermissions(userId: string): Promise<{
  userType: "student" | "parent";
  features: {
    newsFeed:  PermissionFlags;
    tasks:     PermissionFlags;
  };
  mySpaceCanView: Record<"calendar" | "assignments" | "scoreSheet" | "invoices", boolean>;
}> {
  // 1. Xác định type
  const [studentRecord] = await db
    .select({ type: students.type })
    .from(students)
    .where(eq(students.userId, userId))
    .limit(1);
  const studentType = studentRecord?.type ?? "Học viên";
  const userType: "student" | "parent" = studentType === "Phụ huynh" ? "parent" : "student";

  // 2. Tìm system role tương ứng
  const [systemRole] = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .innerJoin(departments, eq(rolesTable.departmentId, departments.id))
    .where(and(eq(rolesTable.name, studentType), eq(departments.isSystem, true)))
    .limit(1);

  const roleIds = systemRole ? [systemRole.id] : [];
  const allPerms = await getAllPermissionsForRoles(roleIds);

  return {
    userType,
    features: {
      newsFeed: pick(allPerms, "/news-feed"),
      tasks:    pick(allPerms, "/tasks#list"),
    },
    mySpaceCanView: {
      calendar:    mySpacePick(allPerms, "/my-space/calendar"),
      assignments: mySpacePick(allPerms, "/my-space/assignments"),
      scoreSheet:  mySpacePick(allPerms, "/my-space/score-sheet"),
      invoices:    mySpacePick(allPerms, "/my-space/invoices"),
    },
  };
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerMobilePermissionsRoutes(app: Express): void {

  /**
   * GET /api/mobile/me/permissions
   *
   * Trả về toàn bộ flags phân quyền theo từng tính năng cho user đang đăng nhập.
   * Mobile team dùng để ẩn/hiện màn hình, tab, nút bấm.
   *
   * Response 200 (staff):
   * {
   *   isSuperAdmin: boolean,
   *   userType: "staff" | "student" | "parent" | "unknown",
   *   features: {
   *     dashboard: { canView: boolean, tabs: { customers, training, finance } },
   *     newsFeed:  { canView, canViewAll, canCreate, canEdit, canDelete },
   *     customers: { canView, canViewAll, canCreate, canEdit, canDelete },
   *     classes:   { canView, canViewAll, canCreate, canEdit, canDelete },
   *     invoices:  { canView, canViewAll, canCreate, canEdit, canDelete },
   *     tasks:     { canView, canViewAll, canCreate, canEdit, canDelete },
   *     learningOverview: { canView, ... },
   *     mySpace: {
   *       calendar:    { canView: boolean },   // lịch cá nhân
   *       assignments: { canView: boolean },   // bài tập (staff: Phòng Đào tạo only)
   *       scoreSheet:  { canView: boolean },   // bảng điểm cá nhân
   *       invoices:    { canView: boolean },   // phiếu thu cá nhân
   *       payroll:     { canView: boolean },   // phiếu lương (staff only)
   *     }
   *   }
   * }
   */
  app.get("/api/mobile/me/permissions", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const isSuperAdmin: boolean  = (req as any).isSuperAdmin ?? (user.username === "admin");
      const roleIds:       string[] = (req as any).roleIds       ?? [];
      const isStudent:     boolean  = (req as any).isStudent      ?? false;

      // ── Student / Parent ──────────────────────────────────────────────────
      if (isStudent) {
        const resolved = await resolveStudentPermissions(user.id);
        return res.json({
          isSuperAdmin: false,
          userType: resolved.userType,
          features: {
            dashboard:       { canView: false, tabs: { customers: false, training: false, finance: false } },
            newsFeed:        resolved.features.newsFeed,
            customers:       { ...DENIED },
            classes:         { ...DENIED },
            invoices:        { ...DENIED },
            tasks:           resolved.features.tasks,
            learningOverview:{ ...DENIED },
            mySpace: {
              calendar:    { canView: resolved.mySpaceCanView.calendar },
              assignments: { canView: resolved.mySpaceCanView.assignments },
              scoreSheet:  { canView: resolved.mySpaceCanView.scoreSheet },
              invoices:    { canView: resolved.mySpaceCanView.invoices },
              payroll:     { canView: false }, // học viên/phụ huynh không có bảng lương
            },
          },
        });
      }

      // ── Staff / SuperAdmin ────────────────────────────────────────────────
      const staffId = await getStaffIdForUser(user.id);
      const isActualStaff = !!staffId;

      // Tính song song: feature perms + mySpace perms + Phòng Đào tạo check
      const [resolved, isInDaotao] = await Promise.all([
        resolveStaffPermissions(roleIds, isSuperAdmin),
        isActualStaff ? checkIsStaffInDaotao(staffId!) : Promise.resolve(false),
      ]);
      const { features: featurePerms, mySpaceCanView } = resolved;

      // Dashboard tabs: mỗi tab chỉ hiện khi user có quyền xem module đó.
      // dashboard.canView = true khi ít nhất 1 tab được phép — không cho tất cả staff vào mặc định.
      const dashTabs = {
        customers: isSuperAdmin || featurePerms.customers.canView || featurePerms.customers.canViewAll,
        training:  isSuperAdmin || featurePerms.classes.canView   || featurePerms.classes.canViewAll,
        finance:   isSuperAdmin || featurePerms.invoices.canView  || featurePerms.invoices.canViewAll,
      };
      const dashCanView = isSuperAdmin || (isActualStaff && (dashTabs.customers || dashTabs.training || dashTabs.finance));

      return res.json({
        isSuperAdmin,
        userType: "staff",
        features: {
          dashboard: {
            canView: dashCanView,
            tabs: dashTabs,
          },
          newsFeed:        featurePerms.newsFeed,
          customers:       featurePerms.customers,
          classes:         featurePerms.classes,
          invoices:        featurePerms.invoices,
          tasks:           featurePerms.tasks,
          learningOverview:featurePerms.learningOverview,
          mySpace: {
            // Lịch cá nhân — dựa vào role permissions, default allow nếu chưa cấu hình
            calendar:    { canView: isSuperAdmin || (isActualStaff && mySpaceCanView.calendar) },
            // Bài tập cần chấm — dựa vào role permissions (thường chỉ Phòng Đào tạo có record)
            assignments: { canView: isSuperAdmin || (isActualStaff && mySpaceCanView.assignments) },
            // Bảng điểm — dựa vào role permissions
            scoreSheet:  { canView: isSuperAdmin || (isActualStaff && mySpaceCanView.scoreSheet) },
            // Phiếu thu cá nhân — dựa vào role permissions
            invoices:    { canView: isSuperAdmin || (isActualStaff && mySpaceCanView.invoices) },
            // Bảng lương — dựa vào role permissions
            payroll:     { canView: isSuperAdmin || (isActualStaff && mySpaceCanView.payroll) },
          },
        },
      });
    } catch (err: any) {
      console.error("[MobilePermissions] GET /me/permissions error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải phân quyền" });
    }
  });

  /**
   * GET /api/mobile/me/profile
   *
   * Thông tin cá nhân + roles + cơ sở của user hiện tại.
   *
   * Response 200:
   * {
   *   id, username,
   *   userType: "staff" | "student" | "parent" | "unknown",
   *   isSuperAdmin: boolean,
   *   profile: { id, fullName, code, ... },
   *   roles: [{ id, name, description }],
   *   locations: [{ id, name }]
   * }
   */
  app.get("/api/mobile/me/profile", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const isSuperAdmin: boolean = (req as any).isSuperAdmin ?? (user.username === "admin");

      // ── Thử staff trước ────────────────────────────────────────────────
      const staffRows = await db
        .select({
          staffId:      staff.id,
          fullName:     staff.fullName,
          code:         staff.code,
          email:        staff.email,
          phoneNumber:  staff.phoneNumber,
          avatarUrl:    staff.avatarUrl,
          locationId:   staffAssignments.locationId,
          locationName: locations.name,
          roleId:       staffAssignments.roleId,
        })
        .from(staff)
        .leftJoin(staffAssignments, eq(staffAssignments.staffId, staff.id))
        .leftJoin(locations, eq(locations.id, staffAssignments.locationId))
        .where(eq(staff.userId, user.id));

      if (staffRows.length > 0) {
        const s = staffRows[0];
        const uniqueLocations = Array.from(
          new Map(
            staffRows
              .filter(r => r.locationId && r.locationName)
              .map(r => [r.locationId, { id: r.locationId!, name: r.locationName! }])
          ).values()
        );

        const roleIdList = [...new Set(staffRows.map(r => r.roleId).filter(Boolean))] as string[];

        // Lấy tên roles
        let roles: { id: string; name: string }[] = [];
        if (roleIdList.length > 0) {
          const { roles: rolesTable } = await import("@shared/schema");
          roles = await db
            .select({ id: rolesTable.id, name: rolesTable.name, description: rolesTable.description })
            .from(rolesTable)
            .where(inArray(rolesTable.id, roleIdList));
        }

        return res.json({
          id:          user.id,
          username:    user.username,
          userType:    "staff",
          isSuperAdmin,
          profile: {
            id:          s.staffId,
            fullName:    s.fullName,
            code:        s.code,
            email:       s.email,
            phoneNumber: s.phoneNumber,
            avatarUrl:   s.avatarUrl,
          },
          roles,
          locations: uniqueLocations,
        });
      }

      // ── Thử student ────────────────────────────────────────────────────
      const [studentRow] = await db
        .select({
          id:          students.id,
          fullName:    students.fullName,
          code:        students.code,
          email:       students.email,
          phoneNumber: students.phoneNumber,
          avatarUrl:   students.avatarUrl,
          type:        students.type,
        })
        .from(students)
        .where(eq(students.userId, user.id))
        .limit(1);

      if (studentRow) {
        return res.json({
          id:          user.id,
          username:    user.username,
          userType:    studentRow.type === "Phụ huynh" ? "parent" : "student",
          isSuperAdmin: false,
          profile:     studentRow,
          roles:       [],
          locations:   [],
        });
      }

      // ── Fallback: superadmin without profile ───────────────────────────
      return res.json({
        id:          user.id,
        username:    user.username,
        userType:    "unknown",
        isSuperAdmin,
        profile:     null,
        roles:       [],
        locations:   [],
      });
    } catch (err: any) {
      console.error("[MobilePermissions] GET /me/profile error:", err);
      return res.status(500).json({ message: err.message || "Lỗi khi tải profile" });
    }
  });
}
