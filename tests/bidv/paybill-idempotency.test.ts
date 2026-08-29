/**
 * Tests: PayBill Idempotency
 *
 * Scenarios covered:
 *   6a. Gửi cùng transactionId 2 lần → lần 2 trả RC_ALREADY_PAID (023)
 *   6b. Atomic UPDATE "WHERE status != 'paid'" là lớp bảo vệ cuối cùng
 *   6c. Insert idempotency log: chỉ bỏ qua lỗi 23505, lỗi DB thật phải được log
 *   6d. Không có transactionId → không pre-check, atomic UPDATE vẫn bảo vệ
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── vi.hoisted: khai báo trước khi vi.mock hoist ──────────────────────────────
const mocks = vi.hoisted(() => {
  const limitMock   = vi.fn().mockResolvedValue([]);
  const orderByMock = vi.fn();
  const whereMock   = vi.fn();
  const fromMock    = vi.fn();
  const selectMock  = vi.fn();
  const executeMock = vi.fn().mockResolvedValue({ rows: [] });
  const returningInsertMock = vi.fn().mockResolvedValue([]);
  const valuesMock  = vi.fn();
  const insertMock  = vi.fn();
  const returningUpdateMock = vi.fn().mockResolvedValue([]);
  const whereUpdateMock = vi.fn();
  const setMock     = vi.fn();
  const updateMock  = vi.fn();

  orderByMock.mockReturnValue({ limit: limitMock });
  whereMock.mockReturnValue({ limit: limitMock, orderBy: orderByMock });
  fromMock.mockReturnValue({ where: whereMock, orderBy: orderByMock, limit: limitMock });
  selectMock.mockReturnValue({ from: fromMock });
  // processPayBill dùng: await db.insert().values({}) — không có .returning()
  // Nên valuesMock phải là thenable (Promise)
  valuesMock.mockResolvedValue([]);
  insertMock.mockReturnValue({ values: valuesMock });
  whereUpdateMock.mockReturnValue({ returning: returningUpdateMock });
  setMock.mockReturnValue({ where: whereUpdateMock });
  updateMock.mockReturnValue({ set: setMock });

  return {
    limitMock, orderByMock, whereMock, fromMock, selectMock,
    executeMock, returningInsertMock, valuesMock, insertMock,
    returningUpdateMock, whereUpdateMock, setMock, updateMock,
  };
});

vi.mock("../../server/db", () => ({
  db: {
    select: mocks.selectMock,
    insert: mocks.insertMock,
    update: mocks.updateMock,
    execute: mocks.executeMock,
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, val) => `eq:${val}`),
  and: vi.fn((...args) => `and(${args.join(",")})`),
  inArray: vi.fn((_col, vals) => `inArray:${vals}`),
  asc: vi.fn((col) => `asc:${col}`),
  // sql phải là function vì dùng làm tagged template literal: sql`...`
  sql: vi.fn().mockReturnValue({}),
}));

vi.mock("../../server/services/crypto.service", () => ({
  decrypt: vi.fn((v) => `decrypted:${v}`),
  encrypt: vi.fn((v) => `encrypted:${v}`),
}));

vi.mock("../../server/services/bidv/bidv-checksum.service", () => ({
  verifyGetBillChecksum: vi.fn().mockReturnValue(true),
  verifyPayBillChecksum: vi.fn().mockReturnValue(true),
}));

vi.mock("../../shared/schema", () => ({
  bidvVirtualAccounts:        { vaCode: "vaCode" },
  bidvLocationConfigs:        { locationId: "locationId", serviceId: "serviceId" },
  bidvTransactions:           { transactionId: "transactionId" },
  invoices:                   { id: "id", studentId: "studentId", type: "type", status: "status" },
  invoicePaymentSchedule:     { invoiceId: "invoiceId" },
  students:                   { id: "id", fullName: "fullName" },
  studentWalletTransactions:  { studentId: "studentId" },
}));

import { processPayBill } from "../../server/services/bidv/bidv-webhook.service";

// ── Helpers ────────────────────────────────────────────────────────────────────
function resetChain() {
  const { limitMock, orderByMock, whereMock, fromMock, selectMock,
          executeMock, returningInsertMock, valuesMock, insertMock,
          returningUpdateMock, whereUpdateMock, setMock, updateMock } = mocks;

  limitMock.mockReset().mockResolvedValue([]);
  orderByMock.mockReset().mockReturnValue({ limit: limitMock });
  whereMock.mockReset().mockReturnValue({ limit: limitMock, orderBy: orderByMock });
  fromMock.mockReset().mockReturnValue({ where: whereMock, orderBy: orderByMock, limit: limitMock });
  selectMock.mockReset().mockReturnValue({ from: fromMock });
  executeMock.mockReset().mockResolvedValue({ rows: [] });
  returningInsertMock.mockReset().mockResolvedValue([]);
  valuesMock.mockReset().mockResolvedValue([]); // await db.insert().values() → Promise
  insertMock.mockReset().mockReturnValue({ values: valuesMock });
  returningUpdateMock.mockReset().mockResolvedValue([]);
  whereUpdateMock.mockReset().mockReturnValue({ returning: returningUpdateMock });
  setMock.mockReset().mockReturnValue({ where: whereUpdateMock });
  updateMock.mockReset().mockReturnValue({ set: setMock });
}

// ── Fixtures ───────────────────────────────────────────────────────────────────
const INVOICE_VA  = { id: "va-1", vaCode: "VATEST001", type: "invoice", invoiceId: "inv-1", studentId: null };
const INVOICE_ROW = { id: "inv-1", code: "HD001", status: "unpaid", grandTotal: "500000", remainingAmount: "500000" };
const PAID_ROW    = { id: "inv-1", code: "HD001", student_id: "st-1", grand_total: "500000" };

describe("PayBill Idempotency", () => {
  beforeEach(resetChain);

  // ─────────────────────────────────────────────────────────────────────────
  // 6a. Cùng transactionId lần 2 → RC_ALREADY_PAID từ pre-check
  // ─────────────────────────────────────────────────────────────────────────
  it("6a: gửi lại cùng transactionId → pre-check phát hiện duplicate → 023", async () => {
    mocks.limitMock.mockResolvedValueOnce([{ id: "bt-1" }]); // existing transaction

    const result = await processPayBill({ vaCode: "VATEST001", amount: 500000, transactionId: "TXDUP001" });

    expect(result.result_code).toBe("023");
    expect(result.result_desc).toContain("gạch nợ");
    expect(mocks.executeMock).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6b. Atomic UPDATE là lớp bảo vệ cuối — UPDATE trả 0 rows
  // ─────────────────────────────────────────────────────────────────────────
  it("6b: pre-check pass nhưng invoice đã paid → atomic UPDATE 0 rows → 023", async () => {
    mocks.limitMock
      .mockResolvedValueOnce([])           // pre-check: not found
      .mockResolvedValueOnce([INVOICE_VA]) // VA lookup
      .mockResolvedValueOnce([INVOICE_ROW]); // invoice lookup

    mocks.executeMock.mockResolvedValueOnce({ rows: [] }); // UPDATE: 0 rows

    const result = await processPayBill({ vaCode: "VATEST001", amount: 500000, transactionId: "TXRACE001" });

    expect(result.result_code).toBe("023");
    expect(mocks.executeMock).toHaveBeenCalledTimes(1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6c-i. Invoice paid thành công, idempotency log được insert
  // ─────────────────────────────────────────────────────────────────────────
  it("6c-i: lần đầu tiên — invoice paid, log insert thành công → 000", async () => {
    mocks.limitMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([INVOICE_VA])
      .mockResolvedValueOnce([INVOICE_ROW]);

    mocks.executeMock
      .mockResolvedValueOnce({ rows: [PAID_ROW] }) // UPDATE success
      .mockResolvedValueOnce({ rows: [{ mx: 5 }] }); // nextSettleCode

    const result = await processPayBill({ vaCode: "VATEST001", amount: 500000, transactionId: "TXNEW001" });

    expect(result.result_code).toBe("000");
    expect(mocks.insertMock).toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6c-ii. Insert log: lỗi 23505 → bỏ qua, console.warn, vẫn trả 000
  // ─────────────────────────────────────────────────────────────────────────
  it("6c-ii: insert idempotency log gặp 23505 → warn + bỏ qua, vẫn trả 000", async () => {
    mocks.limitMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([INVOICE_VA])
      .mockResolvedValueOnce([INVOICE_ROW]);

    mocks.executeMock
      .mockResolvedValueOnce({ rows: [PAID_ROW] })
      .mockResolvedValueOnce({ rows: [{ mx: 1 }] });

    // processPayBill: await db.insert().values({}) — valuesMock là điểm reject
    mocks.valuesMock.mockRejectedValueOnce(
      Object.assign(new Error("duplicate key"), { code: "23505" })
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await processPayBill({ vaCode: "VATEST001", amount: 500000, transactionId: "TXCONCUR" });

    expect(result.result_code).toBe("000");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("conflict"));
    warnSpy.mockRestore();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6c-iii. Insert log: lỗi DB thật → console.error (không phải warn)
  // ─────────────────────────────────────────────────────────────────────────
  it("6c-iii: insert idempotency log gặp lỗi DB thật → console.error, vẫn trả 000", async () => {
    mocks.limitMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([INVOICE_VA])
      .mockResolvedValueOnce([INVOICE_ROW]);

    mocks.executeMock
      .mockResolvedValueOnce({ rows: [PAID_ROW] })
      .mockResolvedValueOnce({ rows: [{ mx: 1 }] });

    // processPayBill: await db.insert().values({}) — valuesMock là điểm reject
    mocks.valuesMock.mockRejectedValueOnce(
      Object.assign(new Error("connection reset"), { code: "57P01" })
    );

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await processPayBill({ vaCode: "VATEST001", amount: 500000, transactionId: "TXDBERR" });

    expect(result.result_code).toBe("000");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("failed to insert idempotency log"),
      expect.anything(),
    );
    errorSpy.mockRestore();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6d. Không có transactionId → bỏ qua pre-check, atomic UPDATE vẫn bảo vệ
  // ─────────────────────────────────────────────────────────────────────────
  it("6d: thiếu transactionId → bỏ qua pre-check, atomic UPDATE vẫn guard", async () => {
    mocks.limitMock
      .mockResolvedValueOnce([INVOICE_VA])  // VA lookup (không có pre-check)
      .mockResolvedValueOnce([INVOICE_ROW]); // invoice lookup

    mocks.executeMock.mockResolvedValueOnce({ rows: [] }); // UPDATE: đã paid → 0 rows

    const result = await processPayBill({ vaCode: "VATEST001", amount: 500000 });

    expect(result.result_code).toBe("023");
    expect(mocks.insertMock).not.toHaveBeenCalled();
  });
});
