import type { Express } from "express";
import { and, asc, desc, eq, ilike, inArray, lt, gte, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  bidvTransactions,
  bidvVirtualAccounts,
  invoices,
  locations,
} from "@shared/schema";

/**
 * Read-only reconciliation view.
 *
 * This route deliberately reads the existing BIDV idempotency log, virtual
 * account mapping, and invoice records. It does not call or mutate any of the
 * existing BIDV getbill/paybill flows.
 */
export function registerBidvReconciliationRoutes(app: Express) {
  app.get("/api/bidv/reconciliation/transactions", async (req, res) => {
    if (req.isStudent) {
      return res.status(403).json({ message: "Bạn không có quyền xem đối soát BIDV" });
    }

    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(10, Number.parseInt(String(req.query.pageSize ?? "25"), 10) || 25),
    );
    const locationId = typeof req.query.locationId === "string" ? req.query.locationId : "";
    const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : "";
    const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : "";
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    try {
      const conditions = [];
      const resolvedLocationId = sql<string | null>`
        COALESCE(${bidvVirtualAccounts.locationId}, ${invoices.locationId})
      `;

      if (!req.isSuperAdmin && req.allowedLocationIds.length > 0) {
        conditions.push(or(
          inArray(bidvVirtualAccounts.locationId, req.allowedLocationIds),
          inArray(invoices.locationId, req.allowedLocationIds),
        ));
      }
      if (locationId) {
        conditions.push(eq(resolvedLocationId, locationId));
      }
      if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
        conditions.push(gte(bidvTransactions.createdAt, new Date(`${dateFrom}T00:00:00`)));
      }
      if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
        const end = new Date(`${dateTo}T00:00:00`);
        end.setDate(end.getDate() + 1);
        conditions.push(lt(bidvTransactions.createdAt, end));
      }
      if (status) {
        conditions.push(eq(bidvTransactions.status, status));
      }
      if (search) {
        conditions.push(or(
          ilike(bidvTransactions.transactionId, `%${search}%`),
          ilike(bidvTransactions.vaCode, `%${search}%`),
          ilike(invoices.code, `%${search}%`),
        ));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const offset = (page - 1) * pageSize;

      const [countRow] = await db
        .select({
          total: sql<number>`count(*)::int`,
        })
        .from(bidvTransactions)
        .leftJoin(
          bidvVirtualAccounts,
          eq(bidvTransactions.vaCode, bidvVirtualAccounts.vaCode),
        )
        .leftJoin(invoices, eq(bidvTransactions.invoiceId, invoices.id))
        .where(whereClause);

      const [summaryRow] = await db
        .select({
          totalAmount: sql<string>`coalesce(sum(${bidvTransactions.amount}), 0)`,
          linkedCount: sql<number>`count(${invoices.id})::int`,
        })
        .from(bidvTransactions)
        .leftJoin(
          bidvVirtualAccounts,
          eq(bidvTransactions.vaCode, bidvVirtualAccounts.vaCode),
        )
        .leftJoin(invoices, eq(bidvTransactions.invoiceId, invoices.id))
        .where(whereClause);

      const rows = await db
        .select({
          id: bidvTransactions.id,
          transactionId: bidvTransactions.transactionId,
          vaCode: bidvTransactions.vaCode,
          invoiceId: bidvTransactions.invoiceId,
          amount: bidvTransactions.amount,
          status: bidvTransactions.status,
          createdAt: bidvTransactions.createdAt,
          invoiceCode: invoices.code,
          invoiceStatus: invoices.status,
          invoiceGrandTotal: invoices.grandTotal,
          invoicePaidAmount: invoices.paidAmount,
          resolvedLocationId,
        })
        .from(bidvTransactions)
        .leftJoin(
          bidvVirtualAccounts,
          eq(bidvTransactions.vaCode, bidvVirtualAccounts.vaCode),
        )
        .leftJoin(invoices, eq(bidvTransactions.invoiceId, invoices.id))
        .where(whereClause)
        .orderBy(desc(bidvTransactions.createdAt), asc(bidvTransactions.transactionId))
        .limit(pageSize)
        .offset(offset);

      const locationIds = Array.from(new Set(
        rows.map((row) => row.resolvedLocationId).filter((id): id is string => Boolean(id)),
      ));
      const locationRows = locationIds.length > 0
        ? await db
            .select({ id: locations.id, name: locations.name, code: locations.code })
            .from(locations)
            .where(inArray(locations.id, locationIds))
        : [];
      const locationMap = new Map(locationRows.map((location) => [location.id, location]));

      return res.json({
        rows: rows.map((row) => ({
          ...row,
          location: row.resolvedLocationId
            ? locationMap.get(row.resolvedLocationId) ?? null
            : null,
        })),
        pagination: {
          page,
          pageSize,
          total: countRow?.total ?? 0,
          totalPages: Math.max(1, Math.ceil((countRow?.total ?? 0) / pageSize)),
        },
        summary: {
          totalTransactions: countRow?.total ?? 0,
          totalAmount: summaryRow?.totalAmount ?? "0",
          linkedTransactions: summaryRow?.linkedCount ?? 0,
          unlinkedTransactions: Math.max(
            0,
            (countRow?.total ?? 0) - (summaryRow?.linkedCount ?? 0),
          ),
        },
      });
    } catch (error) {
      console.error("[BIDV_RECONCILIATION] read transactions error:", error);
      return res.status(500).json({ message: "Không thể tải dữ liệu đối soát BIDV" });
    }
  });
}