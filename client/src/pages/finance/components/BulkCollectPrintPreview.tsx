import { useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, Merge } from "lucide-react";
import type { InvoicePrintTemplateRow } from "@shared/schema";

export interface BulkCollectPrintData {
  items: Array<{
    code: string;
    description: string;
    amount: number;
    isSchedule: boolean;
  }>;
  paymentDate: string;
  paymentMethod: string;
  collectorName: string;
  note: string;
  invoiceType: "Thu" | "Chi";
  totalAmount: number;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerEmail?: string;
}

interface Props {
  data: BulkCollectPrintData;
  onClose: () => void;
}

function fmtMoney(n: number): string {
  return n.toLocaleString("vi-VN");
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "";
  try { return new Date(d).toLocaleDateString("vi-VN"); } catch { return String(d); }
}

function paymentMethodLabel(m: string | null | undefined): string {
  if (!m) return "";
  if (m === "cash") return "Tiền mặt";
  if (m === "transfer") return "Chuyển khoản";
  return m;
}

const VI_DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
function readThreeDigits(num: number, full: boolean): string {
  const hundreds = Math.floor(num / 100);
  const tens = Math.floor((num % 100) / 10);
  const units = num % 10;
  const parts: string[] = [];
  if (hundreds > 0 || full) parts.push(`${VI_DIGITS[hundreds]} trăm`);
  if (tens === 0) {
    if (units > 0) { if (hundreds > 0 || full) parts.push("lẻ"); parts.push(VI_DIGITS[units]); }
  } else if (tens === 1) {
    parts.push("mười");
    if (units === 5) parts.push("lăm"); else if (units > 0) parts.push(VI_DIGITS[units]);
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
  while (num > 0) { groups.push(num % 1000); num = Math.floor(num / 1000); }
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

function generateMergeItemsHtml(items: BulkCollectPrintData["items"]): string {
  const cell = (align: string = "left") =>
    `border:1px solid #111;padding:6px;text-align:${align};vertical-align:middle;`;

  const rows = items.map((item, i) => `<tr>
    <td style="${cell("center")}">${i + 1}</td>
    <td style="${cell("left")};font-family:monospace;white-space:nowrap;font-weight:bold;color:#5b21b6;">
      ${item.code || "—"}${item.isSchedule ? ' <span style="font-size:9px;background:#dbeafe;color:#1d4ed8;padding:1px 4px;border-radius:3px;font-family:Arial,sans-serif;font-weight:normal;">đợt</span>' : ""}
    </td>
    <td style="${cell("left")}">${item.description || "—"}</td>
    <td style="${cell("right")};font-weight:bold;white-space:nowrap;">${fmtMoney(item.amount)} đ</td>
  </tr>`).join("");

  return `<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:0;">
    <thead>
      <tr style="background:#f3f4f6;">
        <th style="${cell("center")};width:8%;">STT</th>
        <th style="${cell("left")};width:18%;">Mã phiếu</th>
        <th style="${cell("left")};">Nội dung</th>
        <th style="${cell("right")};width:22%;">Số tiền (đ)</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderBulkTemplate(
  html: string,
  data: BulkCollectPrintData,
  logoUrl: string | undefined,
  locationName: string,
  locationAddress: string,
  locationPhone: string,
): string {
  const mergeItemsHtml = generateMergeItemsHtml(data.items);

  const vars: Record<string, string> = {
    merge_items: mergeItemsHtml,
    tong_tien: fmtMoney(data.totalAmount),
    thanh_chu: numberToVietnameseWords(data.totalAmount),
    date: fmtDate(data.paymentDate),
    phuong_thuc: paymentMethodLabel(data.paymentMethod),
    nguoi_thanh_toan: data.collectorName || "",
    nguoi_chi: data.collectorName || "",
    noi_dung: data.note || "—",
    ten_co_so: locationName,
    dia_chi_co_so: locationAddress,
    sdt_co_so: locationPhone,
    ten_khach_hang: data.customerName || "",
    sdt_khach_hang: data.customerPhone || "",
    dia_chi_khach_hang: data.customerAddress || "",
    email_khach_hang: data.customerEmail || "",
  };

  let output = html;

  output = output.replace(/\{\{logo\}\}/g, () => {
    if (logoUrl) return `<img src="${logoUrl}" alt="Logo" style="max-width:80px;max-height:60px;object-fit:contain;" />`;
    return "";
  });

  output = output.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");

  return output;
}

function generateBuiltinHtml(data: BulkCollectPrintData, logoUrl?: string, locationName?: string, locationAddress?: string, locationPhone?: string): string {
  const title = data.invoiceType === "Thu" ? "PHIẾU THU" : "PHIẾU CHI";
  const dateLabel = data.invoiceType === "Thu" ? "Ngày thu" : "Ngày chi";

  const mergeItemsHtml = generateMergeItemsHtml(data.items);
  const logoHtml = logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-width:80px;max-height:60px;object-fit:contain;" />` : "";

  return `<div style="font-family: Arial, sans-serif; font-size: 11px; color:#111; line-height:1.5;">
    <table style="width:100%;border-collapse:collapse;margin-bottom:6px;">
      <tr>
        <td style="width:18%;vertical-align:middle;text-align:center;">${logoHtml}</td>
        <td style="width:82%;vertical-align:middle;text-align:center;">
          <div style="font-weight:bold;font-size:14px;">${locationName || ""}</div>
          ${locationAddress ? `<div style="font-size:11px;color:#555;">Địa chỉ: ${locationAddress}</div>` : ""}
          ${locationPhone ? `<div style="font-size:11px;color:#555;">Số điện thoại: ${locationPhone}</div>` : ""}
        </td>
      </tr>
    </table>

    <div style="border-top:2px solid #111;margin:6px 0 10px;"></div>

    <div style="text-align:center;margin-bottom:10px;">
      <div style="font-size:22px;font-weight:bold;letter-spacing:2px;">${title}</div>
      <div style="font-size:11px;color:#555;margin-top:2px;">${dateLabel}: <b>${fmtDate(data.paymentDate)}</b></div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:10px;">
      <tr>
        <td style="padding:2px 0;width:50%;">
          <span style="color:#555;">Họ và tên:</span>
          <span style="font-weight:bold;margin-left:4px;">${data.customerName || ""}</span>
        </td>
        <td style="padding:2px 0;width:50%;">
          <span style="color:#555;">Số điện thoại:</span>
          <span style="font-weight:bold;margin-left:4px;">${data.customerPhone || ""}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:2px 0;">
          <span style="color:#555;">Địa chỉ:</span>
          <span style="margin-left:4px;">${data.customerAddress || ""}</span>
        </td>
        <td style="padding:2px 0;">
          <span style="color:#555;">Email:</span>
          <span style="margin-left:4px;">${data.customerEmail || ""}</span>
        </td>
      </tr>
    </table>

    ${mergeItemsHtml}

    <table style="width:100%;border-collapse:collapse;margin-top:4px;margin-bottom:4px;">
      <tr>
        <td colspan="3" style="text-align:right;padding:5px 8px;font-weight:bold;font-size:12px;border-top:2px solid #111;">TỔNG CỘNG:</td>
        <td style="text-align:right;padding:5px 8px;font-weight:bold;font-size:13px;border-top:2px solid #111;white-space:nowrap;">${fmtMoney(data.totalAmount)} đ</td>
      </tr>
      <tr>
        <td colspan="4" style="text-align:right;padding:3px 8px;font-size:11px;font-style:italic;color:#444;">Bằng chữ: ${numberToVietnameseWords(data.totalAmount)}</td>
      </tr>
    </table>

    <div style="border-top:1px dashed #999;margin:8px 0;"></div>

    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px;">
      <tr>
        <td style="padding:3px 0;width:38%;color:#555;">Hình thức thanh toán:</td>
        <td style="padding:3px 0;font-weight:bold;">${paymentMethodLabel(data.paymentMethod)}</td>
      </tr>
      ${data.note ? `<tr>
        <td style="padding:3px 0;color:#555;">Ghi chú:</td>
        <td style="padding:3px 0;">${data.note}</td>
      </tr>` : ""}
    </table>

    <table style="width:100%;margin-top:18px;font-size:11px;">
      <tr>
        <td style="width:50%;text-align:center;vertical-align:top;">
          <div style="font-weight:bold;">NGƯỜI NỘP TIỀN</div>
          <div style="font-style:italic;color:#555;font-size:10px;">(Ký và ghi rõ họ tên)</div>
          <div style="height:50px;"></div>
        </td>
        <td style="width:50%;text-align:center;vertical-align:top;">
          <div style="font-weight:bold;">${data.invoiceType === "Thu" ? "NGƯỜI THU TIỀN" : "NGƯỜI CHI TIỀN"}</div>
          <div style="font-style:italic;color:#555;font-size:10px;">(Ký và ghi rõ họ tên)</div>
          <div style="height:50px;"></div>
          <div style="font-style:italic;">${data.collectorName || ""}</div>
        </td>
      </tr>
    </table>
  </div>`;
}

const PAGE_SIZES: Record<string, { width: string; widthLandscape: string; cssSize: string }> = {
  A4:  { width: "210mm", widthLandscape: "297mm", cssSize: "A4" },
  A5:  { width: "148mm", widthLandscape: "210mm", cssSize: "A5" },
  K80: { width: "80mm",  widthLandscape: "80mm",  cssSize: "80mm auto" },
};

export function BulkCollectPrintPreview({ data, onClose }: Props) {
  const printFrameRef = useRef<HTMLIFrameElement>(null);
  const templateType = data.invoiceType === "Thu" ? "ThuGop" : "ChiGop";

  const { data: template, isLoading: loadingTemplate } = useQuery<InvoicePrintTemplateRow>({
    queryKey: ["/api/finance/invoice-print-templates/default", templateType],
    queryFn: async () => {
      const res = await fetch(`/api/finance/invoice-print-templates/default/${templateType}`, { credentials: "include" });
      if (!res.ok) throw new Error("no_default");
      return res.json();
    },
    retry: false,
  });

  const { data: locations = [] } = useQuery<Array<{ id: string; isMain: boolean; logoUrl?: string | null; name?: string | null; address?: string | null; phone?: string | null }>>({
    queryKey: ["/api/locations"],
    queryFn: async () => {
      const res = await fetch("/api/locations", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");

  useEffect(() => {
    if (template?.orientation) setOrientation(template.orientation as "portrait" | "landscape");
  }, [template?.orientation]);

  const mainLocation = locations.find(l => l.isMain) ?? locations[0];
  const logoUrl = mainLocation?.logoUrl ?? undefined;
  const locationName = (mainLocation as any)?.name ?? (mainLocation as any)?.locationName ?? "";
  const locationAddress = (mainLocation as any)?.address ?? "";
  const locationPhone = (mainLocation as any)?.phone ?? "";

  const renderedHtml = loadingTemplate
    ? null
    : template
      ? renderBulkTemplate(template.html, data, logoUrl, locationName, locationAddress, locationPhone)
      : generateBuiltinHtml(data, logoUrl, locationName, locationAddress, locationPhone);

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
      <title>Phiếu ${data.invoiceType === "Thu" ? "thu" : "chi"}</title>
      <style>
        @page { size: ${pageCfg.cssSize} ${orientation}; margin: 10mm; }
        body { margin: 0; font-family: Arial, sans-serif; }
        * { box-sizing: border-box; }
      </style>
    </head><body>${renderedHtml}</body></html>`);
    doc.close();
    setTimeout(() => { frame.contentWindow?.print(); }, 300);
  };

  const title = data.invoiceType === "Thu" ? "Phiếu thu gộp" : "Phiếu chi gộp";

  return (
    <>
      <iframe ref={printFrameRef} style={{ position: "fixed", top: -9999, left: -9999, width: 0, height: 0, border: "none" }} title="print-frame" />
      <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent
          className="flex flex-col overflow-hidden p-0"
          style={{ width: "90vw", maxWidth: "90vw", height: "90vh", maxHeight: "90vh" }}
        >
          <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
            <div className="flex items-center justify-between pr-6">
              <DialogTitle className="text-sm font-semibold flex items-center gap-2">
                <Merge className="h-4 w-4 text-purple-600" />
                {title} — {data.items.length} phiếu · {fmtMoney(data.totalAmount)} đ
              </DialogTitle>
            </div>
          </DialogHeader>

          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-auto flex items-start justify-center p-6 bg-muted/20">
              {loadingTemplate ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Đang tải mẫu in...</div>
              ) : renderedHtml ? (
                <div
                  style={{ width: previewWidth, background: "white", boxShadow: "0 2px 16px rgba(0,0,0,0.12)", borderRadius: "4px", padding: "16mm", transition: "width 0.2s" }}
                  dangerouslySetInnerHTML={{ __html: renderedHtml }}
                />
              ) : null}
            </div>

            <div className="w-64 shrink-0 border-l bg-background flex flex-col">
              <div className="px-4 py-3 border-b">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Printer className="h-4 w-4 text-muted-foreground" />
                  Cài đặt in
                </p>
              </div>

              <div className="flex-1 overflow-auto px-4 py-4 flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bố cục</label>
                  <Select value={orientation} onValueChange={v => setOrientation(v as "portrait" | "landscape")}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="portrait">Khổ dọc</SelectItem>
                      <SelectItem value="landscape">Khổ ngang</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mẫu in</label>
                  <div className="h-9 px-3 flex items-center text-sm border rounded-md bg-muted/30 text-muted-foreground truncate">
                    {template?.name ?? "Mẫu mặc định"}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Lưu ý</label>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Tùy chỉnh mẫu in tại <b>Mẫu in hoá đơn</b> → tạo mẫu loại <b>{title}</b> và đặt làm mặc định.
                  </p>
                </div>
              </div>

              <div className="px-4 py-4 border-t space-y-2">
                <Button className="w-full gap-2" onClick={handlePrint} disabled={!renderedHtml}>
                  <Printer className="h-4 w-4" /> In phiếu
                </Button>
                <Button variant="outline" className="w-full" onClick={onClose}>
                  Đóng
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
