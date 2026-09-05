import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, AlertTriangle } from "lucide-react";
import type { InvoicePrintTemplateRow } from "@shared/schema";

interface InvoicePrintData {
  id: string;
  code?: string | null;
  type: string;
  subjectName?: string | null;
  grandTotal: string;
  paidAmount: string;
  remainingAmount?: string | null;
  createdAt: string;
  items?: Array<{
    name?: string;
    packageName?: string;
    price?: string | number;
    unitPrice?: string | number;
    quantity?: number;
    discount?: string | number;
    extra?: string | number;
    promotionAmount?: string | number;
    surchargeAmount?: string | number;
    promotionKeys?: string[];
    surchargeKeys?: string[];
  }>;
  // Fields enriched by GET /api/finance/invoices/:id
  category?: string | null;
  description?: string | null;
  note?: string | null;
  paymentMethod?: string | null;
  className?: string | null;
  classCode?: string | null;
  studentFullName?: string | null;
  studentPhone?: string | null;
  studentAddress?: string | null;
  createdByName?: string | null;
  paidByName?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  locationPhone?: string | null;
  // Ngân hàng — từ appliedBankAccount (đã chọn lúc tạo HĐ) hoặc fallback về locationBankAccounts
  appliedBankAccount?: { bankName?: string | null; bankAccount?: string | null; accountHolder?: string | null; qrUrl?: string | null } | null;
  locationBankAccounts?: string | null; // JSON string array
  // Số liệu KM / PT / Khấu trừ
  totalAmount?: string | number | null;
  totalPromotion?: string | number | null;
  totalSurcharge?: string | number | null;
  invoicePromotionAmount?: string | number | null;
  invoiceSurchargeAmount?: string | number | null;
  invoicePromotionKeys?: string[] | null;
  invoiceSurchargeKeys?: string[] | null;
  deduction?: string | number | null;
  // Hoá đơn gốc (cha) — chỉ có khi đang in một đợt thanh toán
  parentInvoice?: {
    code?: string | null;
    grandTotal?: string | number | null;
    paidAmount?: string | number | null;
    remainingAmount?: string | number | null;
    totalAmount?: string | number | null;
    totalPromotion?: string | number | null;
    totalSurcharge?: string | number | null;
    deduction?: string | number | null;
  } | null;
  paymentSchedule?: Array<{
    label: string;
    code?: string | null;
    amount: string | number;
    dueDate?: string | null;
    status?: string | null;
    paidAt?: string | null;
    paymentMethod?: string | null;
  }>;
}

function fmtMoney(n: number) {
  return n.toLocaleString("vi-VN");
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("vi-VN");
  } catch {
    return String(d);
  }
}

function paymentMethodLabel(m: string | null | undefined): string {
  if (!m) return "";
  if (m === "cash") return "Tiền mặt";
  if (m === "transfer") return "Chuyển khoản";
  return m;
}

// Chuyển tên ngân hàng (tự do) → mã VietQR (ngắn gọn).
function bankNameToVietQRCode(name: string): string {
  const n = (name ?? "").toLowerCase().replace(/[\s.]/g, "");
  if (n.includes("mbbank") || n === "mb") return "MB";
  if (n.includes("vietcombank") || n.includes("vcb")) return "VCB";
  if (n.includes("techcombank") || n === "tcb") return "TCB";
  if (n.includes("bidv")) return "BIDV";
  if (n.includes("vietinbank") || n.includes("viettinbank") || n === "ctg") return "CTG";
  if (n.includes("sacombank") || n === "stb") return "STB";
  if (n.includes("agribank") || n === "agb") return "AGRIBANK";
  if (n.includes("tpbank") || n.includes("tp bank")) return "TPB";
  if (n.includes("vpbank") || n.includes("vpb")) return "VPB";
  if (n === "acb" || n.startsWith("acb")) return "ACB";
  if (n === "ocb" || n.startsWith("ocb")) return "OCB";
  if (n.includes("hdbank") || n === "hdb") return "HDB";
  if (n.includes("msb") || n.includes("maritimebank")) return "MSB";
  if (n.includes("seabank")) return "SEAB";
  if (n === "vib" || n.startsWith("vib")) return "VIB";
  if (n.includes("namabank") || n.includes("nama")) return "NAB";
  if (n.includes("pvcombank") || n.includes("pvcom")) return "PVCB";
  if (n.includes("bvbank") || n === "bvb") return "BVB";
  if (n.includes("kienlongbank") || n.includes("kienlong")) return "KLB";
  if (n.includes("lienvietpostbank") || n === "lpb") return "LPB";
  if (n.includes("shb")) return "SHB";
  if (n.includes("abbank") || n === "abb") return "ABB";
  if (n.includes("eximbank") || n.includes("exim")) return "EIB";
  if (n.includes("scb")) return "SCB";
  if (n.includes("ncb")) return "NVB";
  return name; // fallback: gửi nguyên tên, VietQR tự nhận dạng
}

// Lấy bank vars từ invoice — ưu tiên appliedBankAccount, fallback về bank đầu tiên của cơ sở
function resolveInvoiceBankVars(invoice: InvoicePrintData): {
  ten_ngan_hang: string; so_tai_khoan: string; chu_tai_khoan: string; qrUrl: string
} {
  const ab = invoice.appliedBankAccount;
  if (ab?.bankAccount) {
    return {
      ten_ngan_hang: ab.bankName ?? "",
      so_tai_khoan:  ab.bankAccount ?? "",
      chu_tai_khoan: ab.accountHolder ?? "",
      qrUrl:         ab.qrUrl ?? "",
    };
  }
  // Fallback: bank đầu tiên của cơ sở
  if (invoice.locationBankAccounts) {
    try {
      const banks: Array<{ bankName?: string; bankAccount?: string; accountHolder?: string; qrUrl?: string }> =
        JSON.parse(invoice.locationBankAccounts);
      const first = banks[0];
      if (first?.bankAccount) {
        return {
          ten_ngan_hang: first.bankName ?? "",
          so_tai_khoan:  first.bankAccount ?? "",
          chu_tai_khoan: first.accountHolder ?? "",
          qrUrl:         first.qrUrl ?? "",
        };
      }
    } catch { /* ignore */ }
  }
  return { ten_ngan_hang: "", so_tai_khoan: "", chu_tai_khoan: "", qrUrl: "" };
}

// Đọc số tiền sang chữ tiếng Việt (hỗ trợ tới hàng tỷ).
const VI_DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
function readThreeDigits(num: number, full: boolean): string {
  const hundreds = Math.floor(num / 100);
  const tens = Math.floor((num % 100) / 10);
  const units = num % 10;
  const parts: string[] = [];
  if (hundreds > 0 || full) {
    parts.push(`${VI_DIGITS[hundreds]} trăm`);
  }
  if (tens === 0) {
    if (units > 0) {
      if (hundreds > 0 || full) parts.push("lẻ");
      parts.push(VI_DIGITS[units]);
    }
  } else if (tens === 1) {
    parts.push("mười");
    if (units === 5) parts.push("lăm");
    else if (units > 0) parts.push(VI_DIGITS[units]);
  } else {
    parts.push(`${VI_DIGITS[tens]} mươi`);
    if (units === 1) parts.push("mốt");
    else if (units === 5) parts.push("lăm");
    else if (units > 0) parts.push(VI_DIGITS[units]);
  }
  return parts.join(" ");
}
function numberToVietnameseWords(n: number): string {
  if (!isFinite(n) || n === 0) return "Không đồng";
  let num = Math.floor(Math.abs(n));
  const groups: number[] = [];
  while (num > 0) {
    groups.push(num % 1000);
    num = Math.floor(num / 1000);
  }
  const units = ["", "nghìn", "triệu", "tỷ"];
  const out: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    const isFull = i !== groups.length - 1;
    const text = readThreeDigits(g, isFull);
    out.push(text + (units[i] ? " " + units[i] : ""));
  }
  let words = out.join(" ").replace(/\s+/g, " ").trim();
  words = words.charAt(0).toUpperCase() + words.slice(1);
  return `${words} đồng`;
}

function renderHistoryHtml(schedule: NonNullable<InvoicePrintData["paymentSchedule"]>): string {
  if (!schedule || schedule.length === 0) {
    return `<div style="text-align:center;font-style:italic;color:#888;padding:8px;font-size:11px;">Hoá đơn này không chia đợt thanh toán.</div>`;
  }
  const rows = schedule.map((s, i) => {
    const isPaid = s.status === "paid";
    const dateText = isPaid && s.paidAt
      ? fmtDate(s.paidAt)
      : s.dueDate
        ? `Dự kiến ${fmtDate(s.dueDate)}`
        : "";
    const amountText = isPaid ? `${fmtMoney(Number(s.amount) || 0)} đ` : "";
    const methodText = isPaid ? paymentMethodLabel(s.paymentMethod) : "";
    return `<tr>
      <td style="border:1px solid #111;padding:5px;text-align:center">${i + 1}</td>
      <td style="border:1px solid #111;padding:5px;text-align:center">${dateText}</td>
      <td style="border:1px solid #111;padding:5px;text-align:right">${amountText}</td>
      <td style="border:1px solid #111;padding:5px;text-align:center">${methodText}</td>
      <td style="border:1px solid #111;padding:5px">${s.label ?? ""}</td>
    </tr>`;
  }).join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:10.5px;">
    <thead>
      <tr style="background:#f3f4f6">
        <th style="border:1px solid #111;padding:5px;width:8%">Đợt</th>
        <th style="border:1px solid #111;padding:5px;width:22%">Ngày thanh toán</th>
        <th style="border:1px solid #111;padding:5px;width:22%">Số tiền</th>
        <th style="border:1px solid #111;padding:5px;width:20%">Phương thức</th>
        <th style="border:1px solid #111;padding:5px">Ghi chú</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

type PromoOption = { id: string; name: string; valueType?: string; valueAmount?: string | number };

function calcAdjustmentAmount(opt: PromoOption | undefined, base: number): number {
  if (!opt) return 0;
  const val = parseFloat(String(opt.valueAmount ?? "0")) || 0;
  return opt.valueType === "percent" ? Math.round((base * val) / 100) : val;
}

function lookupAdjustments(
  keys: string[] | undefined | null,
  options: PromoOption[],
  base: number,
  fallbackTotal: number,
  fallbackLabel: string,
): Array<{ name: string; amount: number }> {
  const list = (keys ?? [])
    .map((k) => options.find((o) => o.id === k))
    .filter(Boolean) as PromoOption[];
  if (list.length > 0) {
    return list.map((o) => ({
      name: o.name || fallbackLabel,
      amount: calcAdjustmentAmount(o, base),
    }));
  }
  if (fallbackTotal > 0) return [{ name: fallbackLabel, amount: fallbackTotal }];
  return [];
}

function renderItemsHtml(
  items: NonNullable<InvoicePrintData["items"]>,
  invoice: InvoicePrintData,
  promotionOptions: PromoOption[],
  surchargeOptions: PromoOption[],
): string {
  if (!items || items.length === 0) {
    return `<div style="text-align:center;font-style:italic;color:#888;padding:8px;font-size:11px;">Hoá đơn này chưa có sản phẩm / dịch vụ.</div>`;
  }

  const COL_COUNT = 5; // STT, Tên, Đơn giá, Số lượng, Thành tiền
  const cell = (align: "left" | "right" | "center" = "left") =>
    `border:1px solid #111;padding:6px;text-align:${align};vertical-align:middle;`;

  let subtotalAfterItemAdj = 0; // "Số tiền"
  const bodyRows: string[] = [];

  items.forEach((item: any, i) => {
    const name = item.packageName ?? item.name ?? "";
    const price = Number(item.unitPrice ?? item.price) || 0;
    const qty = Number(item.quantity) || 1;
    const itemKm = Number(item.promotionAmount ?? item.discount) || 0;
    const itemPt = Number(item.surchargeAmount ?? item.extra) || 0;
    const itemBase = price * qty;
    subtotalAfterItemAdj += itemBase - itemKm + itemPt;

    bodyRows.push(`<tr>
      <td style="${cell("center")}">${i + 1}</td>
      <td style="${cell("left")}"><b>${name}</b></td>
      <td style="${cell("right")}">${fmtMoney(price)}</td>
      <td style="${cell("center")}">${qty}</td>
      <td style="${cell("right")}"><b>${fmtMoney(itemBase)}</b></td>
    </tr>`);

    const kmList = lookupAdjustments(item.promotionKeys, promotionOptions, itemBase, itemKm, "Khuyến mãi");
    kmList.forEach((adj) => {
      if (adj.amount <= 0) return;
      bodyRows.push(`<tr>
        <td style="${cell("center")}"></td>
        <td style="${cell("left")}">${adj.name}</td>
        <td style="${cell("right")}">${fmtMoney(adj.amount)}</td>
        <td style="${cell("center")}">1</td>
        <td style="${cell("right")}"><b>${fmtMoney(adj.amount)}</b></td>
      </tr>`);
    });

    const ptList = lookupAdjustments(item.surchargeKeys, surchargeOptions, itemBase, itemPt, "Phụ thu");
    ptList.forEach((adj) => {
      if (adj.amount <= 0) return;
      bodyRows.push(`<tr>
        <td style="${cell("center")}"></td>
        <td style="${cell("left")}">${adj.name}</td>
        <td style="${cell("right")}">${fmtMoney(adj.amount)}</td>
        <td style="${cell("center")}">1</td>
        <td style="${cell("right")}"><b>${fmtMoney(adj.amount)}</b></td>
      </tr>`);
    });
  });

  // ── Footer totals ────────────────────────────────────────────────────────
  const invoiceKm = Number(invoice.invoicePromotionAmount) || 0;
  const invoicePt = Number(invoice.invoiceSurchargeAmount) || 0;
  const invoiceKmList = lookupAdjustments(
    invoice.invoicePromotionKeys ?? null,
    promotionOptions,
    subtotalAfterItemAdj,
    invoiceKm,
    "Khuyến mãi",
  ).filter((a) => a.amount > 0);
  const invoicePtList = lookupAdjustments(
    invoice.invoiceSurchargeKeys ?? null,
    surchargeOptions,
    subtotalAfterItemAdj,
    invoicePt,
    "Phụ thu",
  ).filter((a) => a.amount > 0);

  const hasInvoiceAdj = invoiceKmList.length > 0 || invoicePtList.length > 0;
  const thanhTien = subtotalAfterItemAdj - invoiceKm + invoicePt;
  const khauTru = Number(invoice.deduction) || 0;
  const tongTien = thanhTien - khauTru;
  const daThanhToan = Number(invoice.paidAmount) || 0;
  const conThieu = invoice.remainingAmount != null
    ? Number(invoice.remainingAmount) || 0
    : Math.max(tongTien - daThanhToan, 0);

  // STT counter for footer rows (continues from items)
  let sttCounter = items.length;

  const footerRow = (
    label: string,
    value: number | string,
    opts: { bold?: boolean; uppercase?: boolean; color?: string } = {},
  ) => {
    sttCounter += 1;
    const weight = opts.bold ? "font-weight:bold;" : "";
    const upper = opts.uppercase ? "text-transform:uppercase;" : "";
    const color = opts.color ? `color:${opts.color};` : "";
    const valueText = typeof value === "number" ? fmtMoney(value) : value;
    return `<tr>
      <td style="${cell("center")}${weight}${color}">${sttCounter}</td>
      <td colspan="${COL_COUNT - 2}" style="${cell("left")}${weight}${upper}${color}">${label}</td>
      <td style="${cell("right")}${weight}${color}">${valueText}</td>
    </tr>`;
  };

  const footerRows: string[] = [];

  // Divider row "Thông tin thanh toán"
  footerRows.push(`<tr>
    <td style="${cell("center")}"></td>
    <td colspan="${COL_COUNT - 1}" style="${cell("center")}font-style:italic;background:#f9fafb;">Thông tin thanh toán</td>
  </tr>`);

  // "Số tiền" — chỉ hiển thị khi có KM/PT toàn đơn
  if (hasInvoiceAdj) {
    footerRows.push(footerRow("Số tiền", subtotalAfterItemAdj, { bold: true }));
    invoiceKmList.forEach((adj) => footerRows.push(footerRow(adj.name, adj.amount)));
    invoicePtList.forEach((adj) => footerRows.push(footerRow(adj.name, adj.amount)));
  }

  footerRows.push(footerRow("Thành tiền", thanhTien, { bold: true }));
  footerRows.push(footerRow("Đặt cọc", khauTru));
  footerRows.push(footerRow("TỔNG TIỀN", tongTien, { bold: true, uppercase: true, color: "#ea580c" }));
  footerRows.push(footerRow("Đã thanh toán", daThanhToan, { color: "#16a34a" }));
  footerRows.push(footerRow("Còn thiếu", conThieu, { color: "#dc2626" }));

  // Bằng chữ — đọc số tiền của "Đã thanh toán"
  sttCounter += 1;
  footerRows.push(`<tr>
    <td style="${cell("center")}">${sttCounter}</td>
    <td colspan="${COL_COUNT - 1}" style="${cell("left")}font-style:italic;">Bằng chữ: ${numberToVietnameseWords(daThanhToan)} ./</td>
  </tr>`);

  return `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:4px;">
    <thead>
      <tr style="background:#f3f4f6">
        <th style="${cell("center")}width:40px">STT</th>
        <th style="${cell("center")}">Tên dịch vụ/SP</th>
        <th style="${cell("center")}">Đơn giá</th>
        <th style="${cell("center")}width:80px">Số lượng</th>
        <th style="${cell("center")}">Thành tiền</th>
      </tr>
    </thead>
    <tbody>${bodyRows.join("")}${footerRows.join("")}</tbody>
  </table>`;
}

function renderTemplate(
  html: string,
  invoice: InvoicePrintData,
  promotionOptions: PromoOption[] = [],
  surchargeOptions: PromoOption[] = [],
  logoUrl?: string,
): string {
  const total = Number(invoice.grandTotal) || 0;
  const paid = Number(invoice.paidAmount) || 0;
  const remaining = Number(invoice.remainingAmount ?? (total - paid)) || 0;
  const items = invoice.items ?? [];
  const schedule = invoice.paymentSchedule ?? [];

  // "Khoản thu" – ưu tiên gói/tên item đầu tiên, sau đó danh mục.
  const firstItem = items[0] as any;
  const khoanThu = (firstItem?.packageName as string)
    || (firstItem?.name as string)
    || invoice.category
    || "";

  // ── Số liệu KM / PT / Khấu trừ trên hoá đơn này ──────────────────────────
  const kmTheoSp = items.reduce(
    (s, it: any) => s + (Number(it?.promotionAmount) || 0),
    0,
  );
  const ptTheoSp = items.reduce(
    (s, it: any) => s + (Number(it?.surchargeAmount) || 0),
    0,
  );
  const kmToanDon = Number(invoice.invoicePromotionAmount) || 0;
  const ptToanDon = Number(invoice.invoiceSurchargeAmount) || 0;
  const tongKm = invoice.totalPromotion != null
    ? Number(invoice.totalPromotion) || 0
    : kmTheoSp + kmToanDon;
  const tongPt = invoice.totalSurcharge != null
    ? Number(invoice.totalSurcharge) || 0
    : ptTheoSp + ptToanDon;
  const tongTruocKmpt = invoice.totalAmount != null
    ? Number(invoice.totalAmount) || 0
    : (total + tongKm - tongPt);
  const khauTru = Number(invoice.deduction) || 0;

  // ── Hoá đơn gốc (cha) – dùng khi đang in một đợt thanh toán ─────────────
  const parent = invoice.parentInvoice;
  const tongHdGoc = parent?.grandTotal != null ? Number(parent.grandTotal) || 0 : total;
  const daThuHdGoc = parent?.paidAmount != null ? Number(parent.paidAmount) || 0 : paid;
  const conLaiHdGoc = parent?.remainingAmount != null
    ? Number(parent.remainingAmount) || 0
    : Math.max(tongHdGoc - daThuHdGoc, 0);
  const maHdGoc = parent?.code ?? invoice.code ?? "";

  // Pre-computed derived values — template only does {{variable}} replacement, no expressions
  const tongSauKm = tongTruocKmpt - tongKm;          // after promotions, before surcharges
  const tongSauKmpt = tongTruocKmpt - tongKm + tongPt; // after promotions and surcharges

  const data: Record<string, string | number> = {
    customer_name: invoice.subjectName ?? invoice.studentFullName ?? "",
    phone: invoice.studentPhone ?? "",
    address: invoice.studentAddress ?? "",
    invoice_code: invoice.code ?? "",
    date: fmtDate(invoice.createdAt),
    total,
    thanh_tien: total,
    da_thanh_toan: paid,
    con_lai: remaining,
    lop: invoice.className ?? "",
    noi_dung: invoice.note ?? "",
    khoan_thu: khoanThu,
    thu_ky_nay: paid,
    phuong_thuc: paymentMethodLabel(invoice.paymentMethod),
    nguoi_tao: invoice.createdByName ?? "",
    nguoi_thanh_toan: invoice.paidByName ?? "",
    // KM / PT / Khấu trừ
    tong_truoc_kmpt: tongTruocKmpt,
    km_theo_sp: kmTheoSp,
    pt_theo_sp: ptTheoSp,
    km_toan_don: kmToanDon,
    pt_toan_don: ptToanDon,
    tong_km: tongKm,
    tong_pt: tongPt,
    khau_tru: khauTru,
    // Giá trị đã tính sẵn — dùng thay cho công thức trong template
    tong_sau_km: tongSauKm,
    tong_sau_kmpt: tongSauKmpt,
    // Hoá đơn gốc (parent)
    ma_hd_goc: maHdGoc,
    tong_hd_goc: tongHdGoc,
    da_thu_hd_goc: daThuHdGoc,
    con_lai_hd_goc: conLaiHdGoc,
    // Bằng chữ (số tiền đã thanh toán)
    thanh_chu: numberToVietnameseWords(paid),
    // Cơ sở
    ten_co_so: invoice.locationName ?? "",
    dia_chi_co_so: invoice.locationAddress ?? "",
    sdt_co_so: invoice.locationPhone ?? "",
    // Ngân hàng — ưu tiên appliedBankAccount (đã chọn lúc tạo HĐ), fallback về bank đầu tiên của cơ sở
    ...resolveInvoiceBankVars(invoice),
  };

  let output = html;

  output = output.replace(/\{\{items\}\}/g, renderItemsHtml(items as any, invoice, promotionOptions, surchargeOptions));
  output = output.replace(/\{\{lich_su_thanh_toan\}\}/g, renderHistoryHtml(schedule));

  // Replace {{logo}} with img tag from main branch logo
  output = output.replace(/\{\{logo\}\}/g, () => {
    if (logoUrl) {
      return `<img src="${logoUrl}" alt="Logo" style="max-width:120px;max-height:60px;object-fit:contain;" />`;
    }
    return "";
  });

  // Replace {{qr_ngan_hang}} — ưu tiên qrUrl đã lưu trong cơ sở, fallback sang VietQR tự tạo
  output = output.replace(/\{\{qr_ngan_hang\}\}/g, () => {
    const bank = resolveInvoiceBankVars(invoice);
    if (bank.qrUrl) {
      // Dùng ảnh QR đã upload sẵn trong cơ sở
      return `<img src="${bank.qrUrl}" alt="QR chuyển khoản" style="width:120px;height:120px;object-fit:contain;" />`;
    }
    if (!bank.so_tai_khoan) return "";
    // Tự tạo QR bằng VietQR khi không có ảnh sẵn
    const code = bankNameToVietQRCode(bank.ten_ngan_hang);
    const url = `https://img.vietqr.io/image/${encodeURIComponent(code)}-${encodeURIComponent(bank.so_tai_khoan)}-compact2.jpg` +
      (bank.chu_tai_khoan ? `?accountName=${encodeURIComponent(bank.chu_tai_khoan)}` : "");
    return `<img src="${url}" alt="QR chuyển khoản" style="width:120px;height:120px;object-fit:contain;" />`;
  });

  // Formula evaluation via token substitution (same engine as the template designer preview)
  const numToks: Record<string, number> = {};
  let tokIdx = 0;
  output = output.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = data[key];
    if (typeof val === "number") {
      const tok = `__T${tokIdx++}__`;
      numToks[tok] = val;
      return tok;
    }
    return match;
  });

  const _GAP = "(?:(?:<[^>]*>|\\s|\\(|\\))*)";
  const _TOK = "(?:__T\\d+__|[0-9]+(?:\\.\\d+)?)";
  const _formulaPattern = new RegExp(
    `([^<>]*)=\\s*(${_GAP}${_TOK}(?:${_GAP}[+\\-*/]${_GAP}${_TOK})*)`,
    "g",
  );

  output = output.replace(_formulaPattern, (match, label, rawExpr) => {
    const stripped = rawExpr.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    const expr = stripped.replace(/__T(\d+)__/g, (_: string, i: string) => {
      const t = `__T${i}__`;
      return numToks[t] !== undefined ? String(numToks[t]) : "0";
    });
    const cleaned = expr.replace(/\s/g, "");
    if (
      /^[\d+\-*/().]+$/.test(cleaned) &&
      /\d/.test(cleaned) &&
      /[+\-*/]/.test(cleaned)
    ) {
      try {
        // eslint-disable-next-line no-new-func
        const result = new Function(`return (${cleaned})`)();
        if (typeof result === "number" && isFinite(result)) {
          return label + fmtMoney(Math.round(result)) + " đ";
        }
      } catch { /* fall through */ }
    }
    return match;
  });

  output = output.replace(/__T(\d+)__/g, (_: string, i: string) => {
    const t = `__T${i}__`;
    return numToks[t] !== undefined ? fmtMoney(numToks[t]) : "";
  });

  // Replace remaining non-numeric {{variable}} placeholders
  output = output.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = data[key];
    if (typeof val === "number") return fmtMoney(val);
    return val != null ? String(val) : "";
  });

  return output;
}

const PAGE_SIZES: Record<string, { width: string; widthLandscape: string; cssSize: string }> = {
  A4:  { width: "210mm", widthLandscape: "297mm", cssSize: "A4" },
  A5:  { width: "148mm", widthLandscape: "210mm", cssSize: "A5" },
  K80: { width: "80mm",  widthLandscape: "80mm",  cssSize: "80mm auto" },
};

interface Props {
  invoice: InvoicePrintData;
  onClose: () => void;
  skipFetch?: boolean;
  titleSuffix?: string;
  templateId?: string;
}

export function InvoicePrintPreview({ invoice, onClose, skipFetch, titleSuffix, templateId }: Props) {
  const invoiceType = invoice.type;
  const printFrameRef = useRef<HTMLIFrameElement>(null);

  const { data: fullInvoice, isLoading: loadingInvoice } = useQuery<InvoicePrintData>({
    queryKey: ["/api/finance/invoices", invoice.id, "print"],
    queryFn: async () => {
      const res = await fetch(`/api/finance/invoices/${invoice.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoice");
      return res.json();
    },
    enabled: !skipFetch,
    staleTime: 0, // luôn fetch mới khi mở print preview — tránh cache thiếu locationBankAccounts
  });

  // scheduleCount: số đợt thực tế.
  // Invoice không có bản ghi schedule (hasSchedules=false) = 0 đợt = "single".
  // Invoice có schedule records: lấy từ scheduleCount prop hoặc paymentSchedule.length.
  const rawScheduleCount: number | undefined = (invoice as any).scheduleCount;
  const invHasSchedules: boolean | undefined = (invoice as any).hasSchedules;
  const scheduleCount: number | null =
    rawScheduleCount != null ? rawScheduleCount          // có schedule records: dùng số thực tế
    : !invHasSchedules ? 0                               // hasSchedules falsy (undefined/false) = không chia đợt = 0
    : fullInvoice?.paymentSchedule != null ? fullInvoice.paymentSchedule.length
    : invoice.paymentSchedule != null ? invoice.paymentSchedule.length
    : null;

  const { data: template, isLoading: loadingTemplate, error: templateError } = useQuery<InvoicePrintTemplateRow>({
    queryKey: templateId
      ? ["/api/finance/invoice-print-templates", templateId]
      : ["/api/finance/invoice-print-templates/default", invoiceType, scheduleCount],
    queryFn: async () => {
      if (templateId) {
        const res = await fetch(`/api/finance/invoice-print-templates/${templateId}`, { credentials: "include" });
        if (!res.ok) throw new Error("fetch_error");
        return res.json();
      }
      const url = scheduleCount != null
        ? `/api/finance/invoice-print-templates/default/${invoiceType}?scheduleCount=${scheduleCount}`
        : `/api/finance/invoice-print-templates/default/${invoiceType}`;
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) throw new Error("no_default");
      if (!res.ok) throw new Error("fetch_error");
      return res.json();
    },
    retry: false,
  });

  const { data: promotionOptions = [] } = useQuery<PromoOption[]>({
    queryKey: ["/api/finance/promotions", { type: "promotion" }],
    queryFn: async () => {
      const res = await fetch("/api/finance/promotions?type=promotion", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: surchargeOptions = [] } = useQuery<PromoOption[]>({
    queryKey: ["/api/finance/promotions", { type: "surcharge" }],
    queryFn: async () => {
      const res = await fetch("/api/finance/promotions?type=surcharge", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: locations = [] } = useQuery<Array<{ id: string; isMain: boolean; logoUrl?: string | null }>>({
    queryKey: ["/api/locations"],
    queryFn: async () => {
      const res = await fetch("/api/locations", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const mainLogoUrl = (locations.find((l) => l.isMain)?.logoUrl) ?? undefined;

  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");

  useEffect(() => {
    if (template?.orientation) {
      setOrientation(template.orientation as "portrait" | "landscape");
    }
  }, [template?.orientation]);

  const isLoading = loadingTemplate || (!skipFetch && loadingInvoice);
  const invoiceData = skipFetch ? invoice : (fullInvoice ?? invoice);
  const hasNoDefault = !loadingTemplate && (templateError as any)?.message === "no_default";
  const hasFetchError = !loadingTemplate && !hasNoDefault && !!templateError;

  const renderedHtml = template && !isLoading
    ? renderTemplate(template.html, invoiceData, promotionOptions, surchargeOptions, mainLogoUrl)
    : null;

  const pageCfg = PAGE_SIZES[template?.pageSize ?? "A4"] ?? PAGE_SIZES.A4;
  const previewWidth = orientation === "landscape" ? pageCfg.widthLandscape : pageCfg.width;

  const handlePrint = () => {
    const frame = printFrameRef.current;
    if (!frame || !renderedHtml) return;
    const doc = frame.contentDocument || frame.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>${invoice.code ?? "Hoá đơn"}</title>
      <style>
        @page { size: ${pageCfg.cssSize} ${orientation}; margin: 10mm; }
        body { margin: 0; font-family: Arial, sans-serif; }
        * { box-sizing: border-box; }
      </style>
    </head><body>${renderedHtml}</body></html>`);
    doc.close();
    setTimeout(() => { frame.contentWindow?.print(); }, 300);
  };

  return (
    <>
    <iframe ref={printFrameRef} style={{ position: "fixed", top: -9999, left: -9999, width: 0, height: 0, border: "none" }} title="print-frame" />
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="flex flex-col overflow-hidden p-0"
        style={{ width: "90vw", maxWidth: "90vw", height: "90vh", maxHeight: "90vh" }}
      >
        {/* Header */}
        <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="text-sm font-semibold">
              Xem trước hoá đơn — {invoice.code ?? ""}
              {titleSuffix && <span className="ml-2 text-purple-700">{titleSuffix}</span>}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({invoiceType === "Thu" ? "Phiếu thu" : "Phiếu chi"})
              </span>
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Body: preview left + settings right */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: invoice preview */}
          <div className="flex-1 overflow-auto flex items-start justify-center p-6 bg-muted/20">
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Đang tải mẫu in...
              </div>
            ) : hasFetchError ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <AlertTriangle className="h-10 w-10 opacity-40 text-red-500" />
                <p className="text-sm font-medium">Không thể tải mẫu in</p>
                <p className="text-xs text-center max-w-xs">Vui lòng thử lại sau.</p>
              </div>
            ) : hasNoDefault ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <AlertTriangle className="h-10 w-10 opacity-40 text-amber-500" />
                <p className="text-sm font-medium">Chưa có mẫu in mặc định</p>
                <p className="text-xs text-center max-w-xs">
                  Vào <b>Mẫu in hoá đơn</b>, mở thiết kế mẫu và bật <b>Mẫu in mặc định</b> cho loại{" "}
                  <b>{invoiceType === "Thu" ? "Phiếu thu" : "Phiếu chi"}</b>.
                </p>
              </div>
            ) : renderedHtml ? (
              <div
                style={{
                  width: previewWidth,
                  background: "white",
                  boxShadow: "0 2px 16px rgba(0,0,0,0.12)",
                  borderRadius: "4px",
                  padding: "16mm",
                  transition: "width 0.2s",
                }}
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            ) : null}
          </div>

          {/* Right: print settings panel */}
          {renderedHtml && (
            <div className="w-64 shrink-0 border-l bg-background flex flex-col">
              <div className="px-4 py-3 border-b">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Printer className="h-4 w-4 text-muted-foreground" />
                  Cài đặt in
                </p>
              </div>

              <div className="flex-1 overflow-auto px-4 py-4 flex flex-col gap-5">
                {/* Orientation */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bố cục</label>
                  <Select
                    value={orientation}
                    onValueChange={(v) => setOrientation(v as "portrait" | "landscape")}
                  >
                    <SelectTrigger className="h-9 text-sm" data-testid="select-print-orientation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="portrait">Khổ dọc</SelectItem>
                      <SelectItem value="landscape">Khổ ngang</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Page size (read-only info) */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Khổ giấy</label>
                  <div className="h-9 px-3 flex items-center text-sm border rounded-md bg-muted/30 text-muted-foreground">
                    {template?.pageSize === "K80" ? "K80 (80mm)" : template?.pageSize === "A5" ? "A5" : "A4"}
                  </div>
                </div>

                {/* Template name (read-only info) */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mẫu in</label>
                  <div className="h-9 px-3 flex items-center text-sm border rounded-md bg-muted/30 text-muted-foreground truncate">
                    {template?.name ?? "—"}
                  </div>
                </div>
              </div>

              {/* Print button */}
              <div className="px-4 py-4 border-t">
                <Button className="w-full gap-2" onClick={handlePrint} data-testid="button-print-invoice">
                  <Printer className="h-4 w-4" /> In hoá đơn
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
