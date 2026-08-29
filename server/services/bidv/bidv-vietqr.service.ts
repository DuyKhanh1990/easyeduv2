/**
 * BIDV VietQR Service
 * Tạo URL QR code theo chuẩn VietQR.io cho tài khoản ảo BIDV.
 */

const BANK_ID = "BIDV";

export interface BidvQrParams {
  receiveAccount: string;
  accountName: string;
  vaCode: string;
  amount?: number;
}

/**
 * Sinh URL QR VietQR cho BIDV Virtual Account.
 * Tài khoản trong URL = vaCode (để app ngân hàng hiển thị TK định danh, ví dụ: V3EE2000128).
 * Nội dung chuyển khoản = vaCode (để BIDV getbill/paybill khớp VA).
 * receiveAccount (TK chuyên thu) là nội bộ BIDV, không cần encode vào QR.
 */
export function buildBidvQrUrl(params: BidvQrParams): string {
  const { accountName, vaCode, amount } = params;
  const base = `https://img.vietqr.io/image/${BANK_ID}-${vaCode}-compact2.png`;
  const query = new URLSearchParams();
  if (amount && amount > 0) query.set("amount", String(Math.round(amount)));
  query.set("addInfo", vaCode);
  query.set("accountName", accountName);
  return `${base}?${query.toString()}`;
}
