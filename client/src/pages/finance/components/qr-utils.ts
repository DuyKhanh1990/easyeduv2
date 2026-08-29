/** Shared QR / bank utilities — used by InvoiceQRDialog and ScheduleQRDialog */

export const BANK_CODE_MAP: Record<string, string> = {
  // MB
  "mb": "MB", "mb bank": "MB", "mbbank": "MB", "ngân hàng quân đội": "MB",
  // Techcombank
  "techcombank": "TCB", "tcb": "TCB",
  // Vietcombank
  "vietcombank": "VCB", "vcb": "VCB",
  // BIDV
  "bidv": "BIDV",
  // Vietinbank
  "vietinbank": "ICB", "icb": "ICB", "viettinbank": "ICB",
  // Agribank
  "agribank": "AGRIBANK", "nhno": "AGRIBANK",
  // ACB
  "acb": "ACB",
  // Sacombank
  "sacombank": "STB", "stb": "STB",
  // TPBank
  "tpbank": "TPB", "tpb": "TPB",
  // VPBank
  "vpbank": "VPB", "vpb": "VPB",
  // SHB
  "shb": "SHB",
  // HDBank
  "hdbank": "HDB", "hdb": "HDB",
  // VIB
  "vib": "VIB",
  // OCB
  "ocb": "OCB",
  // MSB
  "msb": "MSB", "maritime": "MSB",
  // SeABank
  "seabank": "SEAB", "seab": "SEAB",
  // LienVietPostBank
  "lienvietpostbank": "LPB", "lpb": "LPB", "lienviet": "LPB",
  // Eximbank
  "eximbank": "EIB", "eib": "EIB",
  // PVcomBank
  "pvcombank": "PVCOMBANK",
  // Nam A Bank
  "nam a bank": "NAB", "namabank": "NAB", "nab": "NAB",
  // ABBank
  "abbank": "ABB", "abb": "ABB",
  // NCB
  "ncb": "NCB",
  // KienLong Bank
  "kienlongbank": "KLB", "klb": "KLB",
  // BaoViet Bank
  "baoVietbank": "BVB", "baoviet": "BVB", "bvb": "BVB",
  // VietBank
  "vietbank": "VIETBANK",
  // Woori
  "woori": "WVN",
  // Shinhan
  "shinhan": "SHBVN", "shinhanbank": "SHBVN",
  // HSBC
  "hsbc": "HSBC",
};

export function getBankCode(bankName: string): string {
  const key = bankName.toLowerCase().trim();
  return BANK_CODE_MAP[key] ?? bankName.toUpperCase().replace(/\s+/g, "");
}

export function sanitizeForBank(text: string, maxLen = 160): string {
  // Lowercase trước để xử lý đồng nhất cả ký tự hoa tiếng Việt (Ợ, Ồ, Đ...)
  const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f\u1ea0-\u1ef9]/g, (c) => {
    const map: Record<string, string> = {
      "\u1ea1": "a", "\u1ea3": "a", "\u1ea5": "a", "\u1ea7": "a", "\u1ea9": "a", "\u1eab": "a", "\u1ead": "a", "\u1eaf": "a", "\u1eb1": "a", "\u1eb3": "a", "\u1eb5": "a", "\u1eb7": "a",
      "\u1eb9": "e", "\u1ebb": "e", "\u1ebd": "e", "\u1ebf": "e", "\u1ec1": "e", "\u1ec3": "e", "\u1ec5": "e", "\u1ec7": "e",
      "\u1ec9": "i", "\u1ecb": "i",
      "\u1ecd": "o", "\u1ecf": "o", "\u1ed1": "o", "\u1ed3": "o", "\u1ed5": "o", "\u1ed7": "o", "\u1ed9": "o", "\u1edb": "o", "\u1edd": "o", "\u1edf": "o", "\u1ee1": "o", "\u1ee3": "o",
      "\u1ee5": "u", "\u1ee7": "u", "\u1ee9": "u", "\u1eeb": "u", "\u1eed": "u", "\u1eef": "u", "\u1ef1": "u",
      "\u1ef3": "y", "\u1ef5": "y", "\u1ef7": "y", "\u1ef9": "y",
    };
    return map[c] ?? "";
  });
  const cleaned = normalized
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^a-zA-Z0-9 _\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, maxLen);
}
