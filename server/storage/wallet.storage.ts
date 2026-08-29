import { db } from "./base";
import { studentWalletTransactions } from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";

export interface WalletEntryInput {
  studentId: string;
  invoiceId?: string | null;
  type: "credit" | "debit";
  amount: number;
  category?: string | null;
  action: string;
  classId?: string | null;
  className?: string | null;
  invoiceCode?: string | null;
  invoiceDescription?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
}

export async function createWalletEntry(entry: WalletEntryInput) {
  const [row] = await db
    .insert(studentWalletTransactions)
    .values({
      studentId: entry.studentId,
      invoiceId: entry.invoiceId ?? null,
      type: entry.type,
      amount: entry.amount.toFixed(2),
      category: entry.category ?? null,
      action: entry.action,
      classId: entry.classId ?? null,
      className: entry.className ?? null,
      invoiceCode: entry.invoiceCode ?? null,
      invoiceDescription: entry.invoiceDescription ?? null,
      createdBy: entry.createdBy ?? null,
      createdByName: entry.createdByName ?? null,
    })
    .returning();
  return row;
}

export async function getStudentWalletTransactions(studentId: string) {
  return db
    .select()
    .from(studentWalletTransactions)
    .where(eq(studentWalletTransactions.studentId, studentId))
    .orderBy(desc(studentWalletTransactions.createdAt));
}

export async function getNetWalletAmountByInvoiceAndCategory(invoiceId: string, category: string): Promise<number> {
  const rows = await db
    .select()
    .from(studentWalletTransactions)
    .where(
      and(
        eq(studentWalletTransactions.invoiceId, invoiceId),
        eq(studentWalletTransactions.category, category),
      )
    );
  return rows.reduce((net: number, row: any) => {
    const amt = parseFloat(row.amount) || 0;
    return row.type === "credit" ? net + amt : net - amt;
  }, 0);
}

export type WalletTransferInput = {
  fromStudentId: string;
  toStudentId: string;
  hocPhiAmount: number;
  datCocAmount: number;
  description?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  fromStudentName: string;
  toStudentName: string;
};

/**
 * Transfers wallet balances as paired immutable ledger entries.
 * Both sides are committed atomically so a transfer can never leave the
 * sender debited without crediting the recipient (or vice versa).
 */
export async function transferStudentWallet(input: WalletTransferInput) {
  type WalletCategory = "Học phí" | "Đặt cọc";
  type TransferLine = {
    debitCategory: WalletCategory;
    creditCategory: WalletCategory;
    amount: number;
  };

  const requested: Record<WalletCategory, number> = {
    "Học phí": Number(input.hocPhiAmount),
    "Đặt cọc": Number(input.datCocAmount),
  };

  if (Object.values(requested).some(amount => !Number.isFinite(amount) || amount < 0)) {
    throw new Error("Số tiền chuyển không hợp lệ");
  }
  if (requested["Học phí"] <= 0 && requested["Đặt cọc"] <= 0) {
    throw new Error("Vui lòng nhập ít nhất một khoản tiền cần chuyển");
  }
  if (input.fromStudentId === input.toStudentId) {
    throw new Error("Người nhận phải khác người chuyển");
  }

  return db.transaction(async tx => {
    // Lock both wallets in a stable order. This prevents two simultaneous
    // transfers from spending the same available balance.
    for (const id of [input.fromStudentId, input.toStudentId].sort()) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`);
    }

    const senderRows = await tx
      .select({
        type: studentWalletTransactions.type,
        amount: studentWalletTransactions.amount,
        category: studentWalletTransactions.category,
      })
      .from(studentWalletTransactions)
      .where(eq(studentWalletTransactions.studentId, input.fromStudentId));

    const balances: Record<WalletCategory, number> = {
      "Học phí": 0,
      "Đặt cọc": 0,
    };
    for (const row of senderRows) {
      const category = row.category as WalletCategory;
      if (!(category in balances)) continue;
      const amount = Number(row.amount) || 0;
      balances[category] += row.type === "credit" ? amount : -amount;
    }

    const available: Record<WalletCategory, number> = {
      "Học phí": Math.max(0, balances["Học phí"]),
      "Đặt cọc": Math.max(0, balances["Đặt cọc"]),
    };
    const requestedTotal = requested["Học phí"] + requested["Đặt cọc"];
    const availableTotal = available["Học phí"] + available["Đặt cọc"];
    if (requestedTotal > availableTotal + 0.000001) {
      throw new Error(`Tổng tiền chuyển tối đa ${availableTotal.toLocaleString("vi-VN")} đ`);
    }

    // Each input is the wallet category the recipient should receive.
    // First debit the matching sender wallet, then use the other wallet only
    // for the remaining shortfall. This preserves the user's requested
    // category while allowing, for example, tuition -> deposit transfers.
    const matchingHocPhi = Math.min(requested["Học phí"], available["Học phí"]);
    const matchingDatCoc = Math.min(requested["Đặt cọc"], available["Đặt cọc"]);
    const remainingHocPhi = available["Học phí"] - matchingHocPhi;
    const remainingDatCoc = available["Đặt cọc"] - matchingDatCoc;
    const lines: TransferLine[] = [];

    if (matchingHocPhi > 0) {
      lines.push({ debitCategory: "Học phí", creditCategory: "Học phí", amount: matchingHocPhi });
    }
    if (matchingDatCoc > 0) {
      lines.push({ debitCategory: "Đặt cọc", creditCategory: "Đặt cọc", amount: matchingDatCoc });
    }

    const hocPhiShortfall = requested["Học phí"] - matchingHocPhi;
    const datCocShortfall = requested["Đặt cọc"] - matchingDatCoc;
    if (hocPhiShortfall > 0) {
      if (hocPhiShortfall > remainingDatCoc + 0.000001) {
        throw new Error(`Tổng tiền chuyển tối đa ${availableTotal.toLocaleString("vi-VN")} đ`);
      }
      lines.push({ debitCategory: "Đặt cọc", creditCategory: "Học phí", amount: hocPhiShortfall });
    }
    if (datCocShortfall > 0) {
      if (datCocShortfall > remainingHocPhi + 0.000001) {
        throw new Error(`Tổng tiền chuyển tối đa ${availableTotal.toLocaleString("vi-VN")} đ`);
      }
      lines.push({ debitCategory: "Học phí", creditCategory: "Đặt cọc", amount: datCocShortfall });
    }

    const transferCode = `WALLET-${Date.now()}`;
    const description = input.description?.trim() || "Chuyển tiền giữa các ví học phí";
    const rowsToInsert = lines.flatMap(line => [
      {
        studentId: input.fromStudentId,
        type: "debit" as const,
        amount: line.amount.toFixed(2),
        category: line.debitCategory,
        action: `Chuyển ${line.creditCategory.toLowerCase()} sang ví ${input.toStudentName}${
          line.debitCategory === line.creditCategory ? "" : ` (trừ ${line.debitCategory.toLowerCase()})`
        }`,
        invoiceCode: transferCode,
        invoiceDescription: description,
        createdBy: input.createdBy ?? null,
        createdByName: input.createdByName ?? null,
      },
      {
        studentId: input.toStudentId,
        type: "credit" as const,
        amount: line.amount.toFixed(2),
        category: line.creditCategory,
        action: `Nhận ${line.creditCategory.toLowerCase()} từ ví ${input.fromStudentName}${
          line.debitCategory === line.creditCategory ? "" : ` (từ ${line.debitCategory.toLowerCase()})`
        }`,
        invoiceCode: transferCode,
        invoiceDescription: description,
        createdBy: input.createdBy ?? null,
        createdByName: input.createdByName ?? null,
      },
    ]);

    return tx.insert(studentWalletTransactions).values(rowsToInsert).returning();
  });
}
