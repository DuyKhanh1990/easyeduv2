/**
 * Shared invoice notification helpers — dùng chung cho finance.routes và bidv-webhook.
 */
import { db } from "../storage/base";
import { students, staff, centerConfig } from "@shared/schema";
import { eq } from "drizzle-orm";
import { sendNotificationToMany } from "./notification";
import { notificationService } from "../application/notification/services/NotificationService";

export async function resolveInvoiceRecipientUserIds(
  invoice: { studentId?: string | null; subjectName?: string | null },
): Promise<string[]> {
  const recipientUserIds = new Set<string>();
  if (invoice.studentId) {
    const [row] = await db
      .select({ userId: students.userId })
      .from(students)
      .where(eq(students.id, invoice.studentId))
      .limit(1);
    if (row?.userId) recipientUserIds.add(row.userId);
  } else if (invoice.subjectName) {
    const match = (invoice.subjectName as string).match(/^\[([^\]]+)\]/);
    if (match) {
      const [row] = await db
        .select({ userId: staff.userId })
        .from(staff)
        .where(eq(staff.code, match[1]))
        .limit(1);
      if (row?.userId) recipientUserIds.add(row.userId);
    }
  }
  return [...recipientUserIds];
}

export async function sendInvoicePaidNotification(
  invoiceCode: string | null | undefined,
  amount: string | number | null | undefined,
  recipientUserIds: string[],
  invoiceId: string,
  scheduleLabel?: string | null,
  studentId?: string | null,
  note?: string | null,
): Promise<void> {
  const formattedAmount = parseFloat(String(amount ?? "0")).toLocaleString("vi-VN") + " đ";
  const code = invoiceCode ?? "—";
  const invoiceRef = scheduleLabel ? `Hoá đơn ${code} (${scheduleLabel})` : `Hoá đơn ${code}`;

  if (recipientUserIds.length) {
    await sendNotificationToMany(recipientUserIds, {
      title: "Thông báo thanh toán",
      content: `${invoiceRef} vừa được chuyển: Đã thanh toán số tiền: ${formattedAmount}`,
      category: "finance",
      referenceType: "invoice",
      referenceId: invoiceId,
      deeplink: {
        screen: "Invoices",
        params: { invoiceId },
      },
    });
  }

  if (studentId) {
    try {
      const [center] = await db.select({ id: centerConfig.id }).from(centerConfig).limit(1);
      const centerId = center?.id ?? "00000000-0000-0000-0000-000000000000";
      await notificationService.send({
        type: "invoice_paid",
        studentId,
        centerId,
        data: {
          invoiceCode: code,
          amount: formattedAmount,
          note: note ?? "",
        },
      });
    } catch (err) {
      console.error("[InvoiceNotify] notificationService.send invoice_paid error:", err);
    }
  }
}
