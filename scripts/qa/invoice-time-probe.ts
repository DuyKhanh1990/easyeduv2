/**
 * Explicitly opt-in development-only probe. Creates one zero-value QA invoice
 * without a student, then exercises the same storage writers used by invoice
 * creation and editing. It does not call payment or notification routes.
 *
 * Run once with RUN_DEV_INVOICE_TIME_PROBE=1 and the development DB connection.
 * The clearly labeled QA invoice remains cancelled in development for inspection.
 */
import { randomUUID } from "node:crypto";
import { pool } from "../../server/db";
import { createInvoice, getInvoice, updateInvoice } from "../../server/storage/finance.storage";
import { getStoredVietnamDateKey } from "../../client/src/lib/vietnam-time";

if (process.env.NODE_ENV === "production" || process.env.RUN_DEV_INVOICE_TIME_PROBE !== "1") {
  throw new Error("This probe requires explicit opt-in on the development database.");
}

const code = `TIME-QA-${randomUUID().slice(0, 8)}`;
let invoiceId: string | undefined;

async function snapshot(stage: string) {
  if (!invoiceId) throw new Error("Invoice not created");
  const result = await pool.query<{
    created_raw: string;
    updated_raw: string;
    paid_raw: string | null;
    db_zone: string;
  }>(
    `SELECT created_at::text AS created_raw, updated_at::text AS updated_raw,
            paid_at::text AS paid_raw, current_setting('TimeZone') AS db_zone
       FROM invoices WHERE id = $1`,
    [invoiceId],
  );
  const invoice = await getInvoice(invoiceId);
  if (!result.rows[0] || !invoice) throw new Error("QA invoice was not found after write");
  const { created_raw, updated_raw, paid_raw, db_zone } = result.rows[0];
  const now = new Date();
  const centerClock = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).format(now);
  console.log(JSON.stringify({
    stage,
    code,
    id: invoiceId,
    nowUtc: now.toISOString(),
    nowVietnam: centerClock,
    dbZone: db_zone,
    raw: { createdAt: created_raw, updatedAt: updated_raw, paidAt: paid_raw },
    serializedStorage: {
      createdAt: invoice.createdAt?.toISOString(),
      updatedAt: invoice.updatedAt?.toISOString(),
      paidAt: invoice.paidAt?.toISOString() ?? null,
    },
    invoiceDateFormatter: {
      createdAt: getStoredVietnamDateKey(invoice.createdAt),
      updatedAt: getStoredVietnamDateKey(invoice.updatedAt),
      paidAt: invoice.paidAt ? getStoredVietnamDateKey(invoice.paidAt) : null,
    },
  }));
}

try {
  const created = await createInvoice({
    code,
    type: "Thu",
    category: "Kiểm tra thời gian",
    status: "unpaid",
    studentId: null,
    classId: null,
    locationId: null,
    subjectName: `[TIME-QA] ${code}`,
    note: `[TIME-QA] ${code} — không có khoản thu`,
    totalAmount: "0",
    grandTotal: "0",
    paidAmount: "0",
    remainingAmount: "0",
    items: [],
    paymentSchedule: [],
  });
  invoiceId = created.id;
  await snapshot("created");

  await new Promise((resolve) => setTimeout(resolve, 1100));
  await updateInvoice(invoiceId!, { note: `[TIME-QA] ${code} — đã sửa` });
  await snapshot("edited");

  await updateInvoice(invoiceId!, {
    status: "paid",
    paidAt: new Date(),
    paidAmount: "0",
    remainingAmount: "0",
  });
  await snapshot("paid_automatically");

  await updateInvoice(invoiceId!, { createdAt: new Date("2026-09-20") });
  await snapshot("created_date_manually_2026-09-20");

  await updateInvoice(invoiceId!, { paidAt: new Date("2026-09-21") });
  await snapshot("paid_date_manually_2026-09-21");

  await updateInvoice(invoiceId!, { status: "cancelled", paidAt: null, paidAmount: "0", remainingAmount: "0" });
  await snapshot("cancelled_after_probe");
} catch (error) {
  console.error(JSON.stringify({ code, id: invoiceId ?? null, error: String(error) }));
  process.exitCode = 1;
} finally {
  await pool.end();
}