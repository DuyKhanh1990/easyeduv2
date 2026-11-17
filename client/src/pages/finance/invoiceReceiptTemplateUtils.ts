const RECEIPT_FOOTER_MIGRATION_MARKER = 'data-receipt-footer-editable="v1"';

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
