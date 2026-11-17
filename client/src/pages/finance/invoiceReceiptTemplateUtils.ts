const RECEIPT_FOOTER_MIGRATION_MARKER = 'data-receipt-footer-editable="v1"';

const ITEM_TEMPLATE_KEYS = new Set([
  "ten_san_pham",
  "don_gia",
  "so_luong",
  "so_tien",
  "thanh_tien_truoc_vat",
  "vat_rate",
  "tien_vat",
  "thanh_tien_sau_vat",
]);

function formatItemMoney(value: number): string {
  return value.toLocaleString("vi-VN");
}

export function invoiceItemTemplateValues(item: Record<string, any>): Record<string, string> {
  const unitPrice = Number(item.unitPrice ?? item.price) || 0;
  const quantity = Number(item.quantity) || 1;
  const amount = item.packageType === "khoá" ? unitPrice : unitPrice * quantity;
  const promotion = Number(item.promotionAmount ?? item.discount) || 0;
  const surcharge = Number(item.surchargeAmount ?? item.extra) || 0;
  const beforeVat = item.subtotal != null
    ? Number(item.subtotal) || 0
    : amount - promotion + surcharge;
  const vatRate = Number(item.vatRate) || 0;
  const vatAmount = item.vatAmount != null
    ? Number(item.vatAmount) || 0
    : beforeVat * vatRate / 100;

  return {
    ten_san_pham: String(item.packageName ?? item.name ?? ""),
    don_gia: formatItemMoney(unitPrice),
    so_luong: String(quantity),
    so_tien: formatItemMoney(amount),
    thanh_tien_truoc_vat: formatItemMoney(beforeVat),
    vat_rate: `${vatRate}%`,
    tien_vat: formatItemMoney(vatAmount),
    thanh_tien_sau_vat: formatItemMoney(beforeVat + vatAmount),
  };
}

export function expandInvoiceItemTemplateRows(
  html: string,
  items: Array<Record<string, any>>,
): string {
  if (!items.length) return html;

  return html.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi, (row) => {
    const rowTokens = [...row.matchAll(/\{\{(\w+)\}\}/g)]
      .map((match) => match[1])
      .filter((key) => ITEM_TEMPLATE_KEYS.has(key));
    if (rowTokens.length === 0) return row;

    return items.map((item) => {
      const values = invoiceItemTemplateValues(item);
      return row.replace(/\{\{(\w+)\}\}/g, (token, key: string) =>
        ITEM_TEMPLATE_KEYS.has(key) ? values[key] ?? "" : token,
      );
    }).join("");
  });
}

export function prepareReceiptTemplateForEditing(html: string): string {
  if (
    !html.includes("{{items_vat}}")
    || html.includes(RECEIPT_FOOTER_MIGRATION_MARKER)
    || html.includes("{{phuong_thuc}}")
  ) {
    return html;
  }

  const footer = `<div style="font-family:'Times New Roman',Times,serif;font-size:12px;margin-top:4px;">
    <div style="margin:4px 0;">Hình thức thanh toán: {{phuong_thuc}}</div>
    <div style="text-align:right;font-style:italic;margin:6px 0;">Ngày {{ngay_in_phieu}}</div>
    <table style="width:100%;border-collapse:collapse;text-align:center;font-size:12px;font-weight:bold;margin-top:16px;">
      <tr><td style="width:25%;">Giám đốc</td><td style="width:25%;">Kế toán trưởng</td><td style="width:25%;">Người lập phiếu</td><td style="width:25%;">Người nộp tiền</td></tr>
      <tr><td style="height:44px;font-size:11px;font-style:italic;">(ký, họ tên, đóng dấu)</td><td style="font-size:11px;font-style:italic;">(ký, họ tên)</td><td style="font-size:11px;font-style:italic;">{{nguoi_tao}}</td><td style="font-size:11px;font-style:italic;">(ký, họ tên)</td></tr>
    </table>
  </div>`;
  const markedHtml = html.replace(/<div\b/i, `<div ${RECEIPT_FOOTER_MIGRATION_MARKER}`);
  return /<\/div>\s*$/i.test(markedHtml)
    ? markedHtml.replace(/<\/div>\s*$/i, `${footer}</div>`)
    : `${markedHtml}${footer}`;
}
