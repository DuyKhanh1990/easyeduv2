import { db } from "./base";
import { studentWalletTransactions } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

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
