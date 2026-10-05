import { afterEach, describe, expect, it, vi } from "vitest";
import { and } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildInvoiceScheduleRowArrayFilterConditions } from "../server/storage/invoice-schedule-row-filters";
import { fetchInvoices } from "../client/src/hooks/use-invoices";
import { InvoiceListErrorRow } from "../client/src/pages/finance/components/InvoiceListErrorRow";

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
  getAuthHeaders: () => ({}),
}));

describe("invoice list filter regression coverage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("binds schedule payment, payer, and creator filters as scalar IN parameters", () => {
    const condition = and(...buildInvoiceScheduleRowArrayFilterConditions("schedule_row", {
      paymentMethods: ["cash", "transfer"],
      payerNames: ["Payer One", "Payer Two"],
      creatorNames: ["Creator One", "Creator Two"],
    }));
    const query = new PgDialect().sqlToQuery(condition!);

    expect(query.sql).toContain("COALESCE(schedule_row.payment_method, '') in ($1, $2)");
    expect(query.sql).toMatch(/schedule_row_payer\.full_name in \(\$3, \$4\)/);
    expect(query.sql).toMatch(/schedule_row_creator\.full_name in \(\$5, \$6\)/);
    expect(query.sql).not.toMatch(/\bANY\s*\(/i);
    expect(query.params).toEqual([
      "cash", "transfer",
      "Payer One", "Payer Two",
      "Creator One", "Creator Two",
    ]);
  });

  it("omits array predicates when no values are selected", () => {
    expect(buildInvoiceScheduleRowArrayFilterConditions("schedule_row", {})).toEqual([]);
    expect(buildInvoiceScheduleRowArrayFilterConditions("schedule_row", {
      paymentMethods: [],
      payerNames: [],
      creatorNames: [],
    })).toEqual([]);
  });

  it("sends all invoice filter fields and preserves row/count metadata from the API", async () => {
    const responsePayload = {
      data: [{ id: "invoice-1" }],
      total: 1,
      parentTotal: 1,
      tabCounts: { all: 1, unpaid: 0, partial: 0, paid: 1, confirmed: 0, debt: 0 },
      rowPage: [{ invoiceId: "invoice-1", scheduleId: "schedule-1" }],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(responsePayload),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchInvoices({
      tabFilter: "paid",
      search: "PT-001",
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
      paidAtFrom: "2026-10-01",
      paidAtTo: "2026-10-31",
      types: ["Thu", "Chi"],
      locationNames: ["Cơ sở A", "Cơ sở B"],
      categories: ["Học phí"],
      classNames: ["Lớp A"],
      creatorNames: ["Người tạo"],
      payerNames: ["Người thu"],
      commissionStaffNames: ["Nhân sự hoa hồng"],
      paymentMethods: ["cash"],
      page: 1,
      limit: 20,
    });

    expect(result).toEqual(responsePayload);
    expect(result.data).toHaveLength(result.total);
    expect(result.rowPage).toHaveLength(result.total);
    expect(result.tabCounts.paid).toBe(result.total);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const query = new URL(url, "http://localhost").searchParams;
    expect(query.get("tabFilter")).toBe("paid");
    expect(query.getAll("types")).toEqual(["Thu", "Chi"]);
    expect(query.getAll("locationNames")).toEqual(["Cơ sở A", "Cơ sở B"]);
    expect(query.getAll("categories")).toEqual(["Học phí"]);
    expect(query.getAll("classNames")).toEqual(["Lớp A"]);
    expect(query.getAll("creatorNames")).toEqual(["Người tạo"]);
    expect(query.getAll("payerNames")).toEqual(["Người thu"]);
    expect(query.getAll("commissionStaffNames")).toEqual(["Nhân sự hoa hồng"]);
    expect(query.getAll("paymentMethods")).toEqual(["cash"]);
    expect(query.get("dateFrom")).toBe("2026-10-01");
    expect(query.get("dateTo")).toBe("2026-10-31");
    expect(query.get("paidAtFrom")).toBe("2026-10-01");
    expect(query.get("paidAtTo")).toBe("2026-10-31");
    expect(query.get("search")).toBe("PT-001");
    expect(query.get("includeTabCounts")).toBe("true");
    expect(init.credentials).toBe("include");
  });

  it("rejects an invoice list API error rather than treating it as an empty result", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchInvoices({ paymentMethods: ["cash"] }))
      .rejects.toThrow("Failed to fetch invoices");
  });

  it("renders invoice load failures as an accessible error, not an empty-state message", () => {
    const html = renderToStaticMarkup(
      createElement("table", null,
        createElement("tbody", null,
          createElement(InvoiceListErrorRow, {
            colSpan: 4,
            message: "Unable to load invoices.",
          }),
        ),
      ),
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("Unable to load invoices.");
    expect(html).not.toContain("No invoice data");
  });
});