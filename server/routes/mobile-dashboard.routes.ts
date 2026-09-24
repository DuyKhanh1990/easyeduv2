/**
 * mobile-dashboard.routes.ts
 *
 * Dashboard tổng quan dành cho app mobile — chỉ dành cho staff/admin.
 * Mỗi endpoint tương ứng với một Tab trên màn hình Dashboard.
 *
 * GET /api/mobile/dashboard/customers  → Tab KHÁCH HÀNG
 * GET /api/mobile/dashboard/training   → Tab ĐÀO TẠO
 * GET /api/mobile/dashboard/finance    → Tab TÀI CHÍNH
 *
 * Query params chung (tất cả đều optional):
 *   locationId — lọc theo cơ sở (UUID). Bỏ trống = tất cả cơ sở được phép.
 *   dateFrom   — ISO date string "YYYY-MM-DD", điểm đầu khoảng thời gian.
 *   dateTo     — ISO date string "YYYY-MM-DD", điểm cuối khoảng thời gian.
 *
 * Auth: JWT Bearer token. Học sinh/phụ huynh nhận 403.
 */

import type { Express } from "express";
import {
  getCustomerSummary,
  getNewCustomersSummary,
  getStudentLearningStatusSummary,
  getStudentsBySource,
  getStudentsByRelationship,
  getStudentsByLocation,
  getStudentsByStaff,
  getMonthlyStudentCounts,
} from "../storage/student.storage";
import {
  getClassFormatSummary,
  getClassStatusSummary,
  getNewClassesSummary,
  getMonthlyAttendanceRate,
  getClassesByLocationSummary,
  getClassesByTeacherSummary,
  getSessionsByTeacherSummary,
} from "../storage/class.storage";
import { storage } from "../storage";

// ─── helpers ─────────────────────────────────────────────────────────────────

function requireStaff(req: any, res: any): boolean {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Unauthorized. Vui lòng gửi JWT Bearer token." });
    return false;
  }
  if (req.isStudent) {
    res.status(403).json({ success: false, message: "Chức năng này chỉ dành cho nhân viên / quản trị viên." });
    return false;
  }
  return true;
}

function parseCommonParams(req: any) {
  const isSuperAdmin: boolean     = req.isSuperAdmin ?? false;
  const allowedLocationIds: string[] = req.allowedLocationIds ?? [];
  const locationId  = typeof req.query.locationId === "string" ? req.query.locationId : undefined;
  const dateFrom    = typeof req.query.dateFrom   === "string" ? req.query.dateFrom   : undefined;
  const dateTo      = typeof req.query.dateTo     === "string" ? req.query.dateTo     : undefined;
  return { isSuperAdmin, allowedLocationIds, locationId, dateFrom, dateTo };
}

// ─── export ───────────────────────────────────────────────────────────────────

export function registerMobileDashboardRoutes(app: Express): void {

  // ── GET /api/mobile/dashboard/customers ─────────────────────────────────────
  /**
   * Tab KHÁCH HÀNG — tổng hợp toàn bộ số liệu khách hàng cho 1 lần gọi.
   *
   * Response 200:
   * {
   *   success: true,
   *   data: {
   *     customerSummary:  { total, hocVien, hocVienPct, phuHuynh, phuHuynhPct, active, activePct, inactive },
   *     accountStatus:    { active, activePct, inactive },       // trạng thái tài khoản
   *     newCustomers:     { today, thisMonth },                  // khách hàng mới
   *     learningStatus:   { dangHoc, baoLuu, choLich, daNghi, chuaCoLich, total },
   *     byRelationship:   Array<{ name, count, color? }>,        // theo loại HĐ
   *     bySource:         Array<{ name, count, pct }>,           // theo nguồn
   *     byLocation:       Array<{ name, count, pct }>,           // theo cơ sở
   *     byStaff:          Array<{ name, count, pct }>,           // theo nhân viên phụ trách
   *     monthlyCounts:    Array<{ monthKey, label, count, growthPct }> // 6 tháng gần nhất
   *   }
   * }
   */
  app.get("/api/mobile/dashboard/customers", async (req, res) => {
    if (!requireStaff(req, res)) return;
    const { isSuperAdmin, allowedLocationIds, locationId, dateFrom, dateTo } = parseCommonParams(req);

    try {
      const months = 1;
      const monthlyMonths = 6;

      const [
        customerSummary,
        newCustomers,
        learningStatus,
        byRelationship,
        bySource,
        byLocation,
        byStaff,
        monthlyCounts,
      ] = await Promise.all([
        getCustomerSummary({ isSuperAdmin, allowedLocationIds, locationId }),
        getNewCustomersSummary({ isSuperAdmin, allowedLocationIds, locationId }),
        getStudentLearningStatusSummary({ isSuperAdmin, allowedLocationIds, locationId, dateFrom, dateTo }),
        getStudentsByRelationship({ isSuperAdmin, allowedLocationIds, locationId, months, dateFrom, dateTo }),
        getStudentsBySource({ isSuperAdmin, allowedLocationIds, locationId, months, dateFrom, dateTo }),
        getStudentsByLocation({ isSuperAdmin, allowedLocationIds, locationId, months, dateFrom, dateTo }),
        getStudentsByStaff({ isSuperAdmin, allowedLocationIds, locationId, months, dateFrom, dateTo }),
        getMonthlyStudentCounts({ isSuperAdmin, allowedLocationIds, locationId, months: monthlyMonths }),
      ]);

      // Tách accountStatus ra riêng để mobile dễ dùng cho gauge chart
      const accountStatus = {
        active:    customerSummary.active,
        activePct: customerSummary.activePct,
        inactive:  customerSummary.inactive,
      };

      return res.json({
        success: true,
        data: {
          customerSummary,
          accountStatus,
          newCustomers,
          learningStatus,
          byRelationship,
          bySource,
          byLocation,
          byStaff,
          monthlyCounts,
        },
      });
    } catch (err: any) {
      console.error("[MobileDashboard] GET /customers error:", err);
      return res.status(500).json({ success: false, message: "Lỗi server khi tải dashboard khách hàng." });
    }
  });

  // ── GET /api/mobile/dashboard/training ──────────────────────────────────────
  /**
   * Tab ĐÀO TẠO — tổng hợp số liệu lớp học & chuyên cần.
   *
   * Response 200:
   * {
   *   success: true,
   *   data: {
   *     formatSummary:     { total, offline, offlinePct, online, onlinePct },
   *     statusSummary:     { planning, recruiting, active, closed, total },
   *       // labels: planning=Lên kế hoạch, recruiting=Đang tuyển sinh, active=Đang hoạt động, closed=Đã đóng
   *     newClasses:        { today, thisMonth },
   *     byLocation:        Array<{ locationId, locationName, total, active, closed }>,
   *     monthlyAttendance: Array<{ monthKey, label, total, present, rate }>,   // 6 tháng
   *     byTeacher:         Array<{ name, count, pct }>,  // Tổng số lớp theo giáo viên
   *     byTeacherSessions: Array<{ name, count, pct }>   // Tổng số ca dạy theo giáo viên
   *   }
   * }
   */
  app.get("/api/mobile/dashboard/training", async (req, res) => {
    if (!requireStaff(req, res)) return;
    const { isSuperAdmin, allowedLocationIds, locationId, dateFrom, dateTo } = parseCommonParams(req);

    try {
      const [
        formatSummary,
        statusSummary,
        newClasses,
        byLocation,
        monthlyAttendance,
        byTeacher,
        byTeacherSessions,
      ] = await Promise.all([
        getClassFormatSummary({ isSuperAdmin, allowedLocationIds, locationId }),
        getClassStatusSummary({ isSuperAdmin, allowedLocationIds, locationId }),
        getNewClassesSummary({ isSuperAdmin, allowedLocationIds, locationId }),
        getClassesByLocationSummary({ isSuperAdmin, allowedLocationIds, locationId, dateFrom, dateTo }),
        getMonthlyAttendanceRate({ isSuperAdmin, allowedLocationIds, locationId, months: 6 }),
        getClassesByTeacherSummary({ isSuperAdmin, allowedLocationIds, locationId, dateFrom, dateTo }),
        getSessionsByTeacherSummary({ isSuperAdmin, allowedLocationIds, locationId, dateFrom, dateTo }),
      ]);

      return res.json({
        success: true,
        data: {
          formatSummary,
          statusSummary,
          newClasses,
          byLocation,
          monthlyAttendance,
          byTeacher,
          byTeacherSessions,
        },
      });
    } catch (err: any) {
      console.error("[MobileDashboard] GET /training error:", err);
      return res.status(500).json({ success: false, message: "Lỗi server khi tải dashboard đào tạo." });
    }
  });

  // ── GET /api/mobile/dashboard/finance ───────────────────────────────────────
  /**
   * Tab TÀI CHÍNH — tổng hợp doanh thu, công nợ, phân bổ theo cơ sở.
   *
   * Response 200:
   * {
   *   success: true,
   *   data: {
   *     invoiceSummary: {
   *       totalCount,
   *       byStatus: { unpaid, partial, paid, debt, cancelled },
   *       totalRevenue, actualCollected, debtAmount,
   *       expectedIncome, expectedExpense,
   *       actualIncome, actualExpense,
   *       debtIncome, debtExpense
   *     },
   *     revenueByLocation: {
   *       rows: Array<{ locationId, locationName, totalIncome, totalExpense, profit }>,
   *       totals: { totalIncome, totalExpense, profit }
   *     },
   *     debtSummary: {
   *       totalDebtAmount,
   *       totalCount,
   *       byStatus: Array<{ key, label, count, amount, pct }>
   *     }
   *   }
   * }
   */
  app.get("/api/mobile/dashboard/finance", async (req, res) => {
    if (!requireStaff(req, res)) return;
    const { isSuperAdmin, allowedLocationIds, locationId, dateFrom, dateTo } = parseCommonParams(req);

    try {
      const [invoiceSummary, revenueByLocation, debtSummary, byCategory] = await Promise.all([
        storage.getInvoicesSummary({ locationId, dateFrom, dateTo, allowedLocationIds, isSuperAdmin }),
        storage.getRevenueByLocation({ locationId, dateFrom, dateTo, allowedLocationIds, isSuperAdmin }),
        storage.getCustomerDebtSummary({ locationId, dateFrom, dateTo, allowedLocationIds, isSuperAdmin }),
        storage.getInvoicesByCategory({ locationId, dateFrom, dateTo, allowedLocationIds, isSuperAdmin }),
      ]);

      return res.json({
        success: true,
        data: {
          invoiceSummary,
          revenueByLocation,
          debtSummary,
          byCategory,
        },
      });
    } catch (err: any) {
      console.error("[MobileDashboard] GET /finance error:", err);
      return res.status(500).json({ success: false, message: "Lỗi server khi tải dashboard tài chính." });
    }
  });
}
