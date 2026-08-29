/**
 * Tests: Regression — easyeduv2 tự xử lý BIDV của chính mình
 *
 * Scenario 8: Khi self-routing, handleGetBill/handlePayBill phải trả kết quả
 * y chang trước khi có Gateway — response format, result_code, nghiệp vụ không đổi.
 *
 *   8a. GetBill invoice VA → result_code 000, đủ fields BIDV spec
 *   8b. GetBill invoice đã paid → result_code 012
 *   8c. GetBill VA không tồn tại → result_code 011
 *   8d. PayBill checksum sai → result_code 004
 *   8e. PayBill service_id không có config → result_code 006
 *   8f. Thiếu tham số bắt buộc → result_code 001
 *   8g. PayBill 000 response chỉ có result_code + result_desc (không thêm field lạ)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── vi.hoisted ─────────────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const limitMock   = vi.fn().mockResolvedValue([]);
  const orderByMock = vi.fn();
  const whereMock   = vi.fn();
  const fromMock    = vi.fn();
  const selectMock  = vi.fn();
  const executeMock = vi.fn().mockResolvedValue({ rows: [] });
  const returningMock = vi.fn().mockResolvedValue([]);
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
  valuesMock.mockReturnValue({ returning: returningMock });
  insertMock.mockReturnValue({ values: valuesMock });
  whereUpdateMock.mockReturnValue({ returning: returningUpdateMock });
  setMock.mockReturnValue({ where: whereUpdateMock });
  updateMock.mockReturnValue({ set: setMock });

  const verifyGet = vi.fn().mockReturnValue(true);
  const verifyPay = vi.fn().mockReturnValue(true);

  return {
    limitMock, orderByMock, whereMock, fromMock, selectMock,
    executeMock, returningMock, valuesMock, insertMock,
    returningUpdateMock, whereUpdateMock, setMock, updateMock,
    verifyGet, verifyPay,
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
  and: vi.fn((...a) => `and(${a.join(",")})`),
  inArray: vi.fn((_col, vals) => `inArray:${vals}`),
  asc: vi.fn((c) => `asc:${c}`),
  // sql phải là function vì dùng làm tagged template literal: sql`...`
  sql: vi.fn().mockReturnValue({}),
}));

vi.mock("../../server/services/crypto.service", () => ({
  decrypt: vi.fn((v) => `SECRET_${v}`),
  encrypt: vi.fn((v) => `ENC_${v}`),
}));

vi.mock("../../server/services/bidv/bidv-checksum.service", () => ({
  verifyGetBillChecksum: mocks.verifyGet,
  verifyPayBillChecksum: mocks.verifyPay,
}));

vi.mock("../../shared/schema", () => ({
  bidvVirtualAccounts:       { vaCode: "vaCode" },
  bidvLocationConfigs:       { locationId: "locationId", serviceId: "serviceId" },
  bidvTransactions:          { transactionId: "transactionId" },
  invoices:                  { id: "id", studentId: "studentId", type: "type", status: "status", code: "code" },
  invoicePaymentSchedule:    { invoiceId: "invoiceId" },
  students:                  { id: "id", fullName: "fullName" },
  studentWalletTransactions: { studentId: "studentId" },
}));

import { handleGetBill, handlePayBill } from "../../server/services/bidv/bidv-request-handler.service";

// ── Helpers ────────────────────────────────────────────────────────────────────
function resetChain() {
  const m = mocks;
  m.limitMock.mockReset().mockResolvedValue([]);
  m.orderByMock.mockReset().mockReturnValue({ limit: m.limitMock });
  m.whereMock.mockReset().mockReturnValue({ limit: m.limitMock, orderBy: m.orderByMock });
  m.fromMock.mockReset().mockReturnValue({ where: m.whereMock, orderBy: m.orderByMock, limit: m.limitMock });
  m.selectMock.mockReset().mockReturnValue({ from: m.fromMock });
  m.executeMock.mockReset().mockResolvedValue({ rows: [] });
  m.returningMock.mockReset().mockResolvedValue([]);
  m.valuesMock.mockReset().mockReturnValue({ returning: m.returningMock });
  m.insertMock.mockReset().mockReturnValue({ values: m.valuesMock });
  m.returningUpdateMock.mockReset().mockResolvedValue([]);
  m.whereUpdateMock.mockReset().mockReturnValue({ returning: m.returningUpdateMock });
  m.setMock.mockReset().mockReturnValue({ where: m.whereUpdateMock });
  m.updateMock.mockReset().mockReturnValue({ set: m.setMock });
  m.verifyGet.mockReturnValue(true);
  m.verifyPay.mockReturnValue(true);
}

// ── Fixtures ───────────────────────────────────────────────────────────────────
const LOC_CONFIG  = { locationId: "loc-1", vaPrefix: "VA", merchantId: "enc_m", secretCode: "enc_s" };
const INVOICE_VA  = { id: "va-1", vaCode: "VAKH001", type: "invoice", invoiceId: "inv-1", studentId: null };
const UNPAID_INV  = {
  id: "inv-1", code: "HD2024001", description: "Học phí tháng 1", note: "",
  grandTotal: "2000000", remainingAmount: "2000000", dueDate: "2024-01-31",
  status: "unpaid", studentId: "st-1",
};
const STUDENT_ROW = { id: "st-1", fullName: "Nguyen Thi B" };
const PAID_ROW    = { id: "inv-1", code: "HD2024001", student_id: "st-1", grand_total: "2000000" };

describe("Regression: self-routing giống 100% trước gateway", () => {
  beforeEach(resetChain);

  // ─────────────────────────────────────────────────────────────────────────
  // 8a. GetBill invoice VA — đủ fields + đúng values
  // ─────────────────────────────────────────────────────────────────────────
  it("8a: GetBill invoice VA → 000, đủ fields BIDV spec", async () => {
    mocks.limitMock
      .mockResolvedValueOnce([LOC_CONFIG])  // resolveLocationConfig
      .mockResolvedValueOnce([INVOICE_VA])  // VA lookup
      .mockResolvedValueOnce([UNPAID_INV])  // invoice lookup
      .mockResolvedValueOnce([STUDENT_ROW]); // student lookup

    const result = await handleGetBill("SVC001", "KH001", "valid");

    expect(result.result_code).toBe("000");
    expect(result.result_desc).toBe("success");
    expect(result).toHaveProperty("customer_id", "KH001");
    expect(result).toHaveProperty("customer_name", "Nguyen Thi B");
    expect(result).toHaveProperty("bill_id");
    expect(result).toHaveProperty("total_amount", "2000000");
    expect(result).toHaveProperty("type", "1");
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data![0]).toHaveProperty("period");
    expect(result.data![0].data[0]).toHaveProperty("bill_id", "HD2024001");
    expect(result.data![0].data[0]).toHaveProperty("amount", "2000000");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 8b. GetBill: invoice đã paid → 012
  // ─────────────────────────────────────────────────────────────────────────
  it("8b: GetBill invoice đã paid → 012", async () => {
    mocks.limitMock
      .mockResolvedValueOnce([LOC_CONFIG])
      .mockResolvedValueOnce([INVOICE_VA])
      .mockResolvedValueOnce([{ ...UNPAID_INV, status: "paid" }]);

    const result = await handleGetBill("SVC001", "KH001", "valid");
    expect(result.result_code).toBe("012");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 8c. GetBill: VA không tồn tại → 011
  // ─────────────────────────────────────────────────────────────────────────
  it("8c: GetBill VA không tồn tại → 011", async () => {
    mocks.limitMock
      .mockResolvedValueOnce([LOC_CONFIG])
      .mockResolvedValueOnce([]); // VA not found

    const result = await handleGetBill("SVC001", "KH999", "valid");
    expect(result.result_code).toBe("011");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 8d. PayBill checksum sai → 004
  // ─────────────────────────────────────────────────────────────────────────
  it("8d: PayBill checksum sai → 004", async () => {
    mocks.verifyPay.mockReturnValueOnce(false);
    mocks.limitMock.mockResolvedValueOnce([LOC_CONFIG]);

    const result = await handlePayBill({
      serviceId: "SVC001", customerId: "KH001",
      checksum: "BADSIG", transId: "TX001", amount: 500000,
    });
    expect(result.result_code).toBe("004");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 8e. PayBill service_id không có config → 006
  // ─────────────────────────────────────────────────────────────────────────
  it("8e: PayBill service_id không có config → 006", async () => {
    mocks.limitMock.mockResolvedValueOnce([]); // no location config

    const result = await handlePayBill({
      serviceId: "NOSVC", customerId: "KH001",
      checksum: "sig", transId: "TX001", amount: 500000,
    });
    expect(result.result_code).toBe("006");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 8f. Thiếu tham số → 001
  // ─────────────────────────────────────────────────────────────────────────
  it("8f-1: PayBill thiếu trans_id → 001", async () => {
    const result = await handlePayBill({
      serviceId: "SVC001", customerId: "KH001",
      checksum: "sig", transId: "", amount: 500000,
    });
    expect(result.result_code).toBe("001");
  });

  it("8f-2: GetBill thiếu service_id → 001", async () => {
    const result = await handleGetBill("", "KH001", "sig");
    expect(result.result_code).toBe("001");
  });

  it("8f-3: PayBill thiếu amount → 001", async () => {
    const result = await handlePayBill({
      serviceId: "SVC001", customerId: "KH001",
      checksum: "sig", transId: "TX1", amount: "" as any,
    });
    expect(result.result_code).toBe("001");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 8g. PayBill 000 response format — chỉ 2 field, không thêm field lạ
  // ─────────────────────────────────────────────────────────────────────────
  it("8g: PayBill 000 response chỉ có result_code + result_desc", async () => {
    mocks.limitMock
      .mockResolvedValueOnce([LOC_CONFIG])
      .mockResolvedValueOnce([])          // pre-check: not found
      .mockResolvedValueOnce([INVOICE_VA])
      .mockResolvedValueOnce([{ ...UNPAID_INV, remainingAmount: "500000", grandTotal: "500000" }]);

    mocks.executeMock
      .mockResolvedValueOnce({ rows: [PAID_ROW] })        // UPDATE success
      .mockResolvedValueOnce({ rows: [{ mx: 10 }] });      // nextSettleCode

    const result = await handlePayBill({
      serviceId: "SVC001", customerId: "KH001",
      checksum: "valid", transId: "TXREG001", amount: 500000,
    });

    expect(result.result_code).toBe("000");
    expect(result.result_desc).toBe("success");
    expect(Object.keys(result)).toEqual(["result_code", "result_desc"]);
  });
});
