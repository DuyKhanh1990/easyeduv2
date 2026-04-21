import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, AlertTriangle } from "lucide-react";
import type { InvoicePrintTemplateRow } from "@shared/schema";

interface InvoiceRow {
  id: string;
  code?: string | null;
  type: string;
  subjectName?: string | null;
  grandTotal: string;
  paidAmount: string;
  remainingAmount?: string | null;
  createdAt: string;
  items?: Array<{
    name: string;
    price: string | number;
    quantity: number;
    discount?: string | number;
    extra?: string | number;
  }>;
}

function fmtMoney(n: number) {
  return n.toLocaleString("vi-VN");
}

function fmtDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("vi-VN");
  } catch {
    return d;
  }
}

function renderItemsHtml(items: NonNullable<InvoiceRow["items"]>): string {
  const rows = items.map((item, i) => {
    const price = Number(item.price) || 0;
    const qty = Number(item.quantity) || 1;
    const discount = Number(item.discount) || 0;
    const extra = Number(item.extra) || 0;
    const total = price * qty - discount + extra;
    return `<tr>
      <td style="border:1px solid #ccc;padding:5px;text-align:center">${i + 1}</td>
      <td style="border:1px solid #ccc;padding:5px">${item.name}</td>
      <td style="border:1px solid #ccc;padding:5px;text-align:right">${fmtMoney(price)}</td>
      <td style="border:1px solid #ccc;padding:5px;text-align:center">${qty}</td>
      <td style="border:1px solid #ccc;padding:5px;text-align:right">${fmtMoney(discount)}</td>
      <td style="border:1px solid #ccc;padding:5px;text-align:right">${fmtMoney(extra)}</td>
      <td style="border:1px solid #ccc;padding:5px;text-align:right"><b>${fmtMoney(total)}</b></td>
    </tr>`;
  }).join("");

  return `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:4px;">
    <thead>
      <tr style="background:#f3f4f6">
        <th style="border:1px solid #ccc;padding:5px;text-align:center;width:36px">STT</th>
        <th style="border:1px solid #ccc;padding:5px;text-align:left">Tên dịch vụ / SP</th>
        <th style="border:1px solid #ccc;padding:5px;text-align:right">Đơn giá</th>
        <th style="border:1px solid #ccc;padding:5px;text-align:center">SL</th>
        <th style="border:1px solid #ccc;padding:5px;text-align:right">KM</th>
        <th style="border:1px solid #ccc;padding:5px;text-align:right">Phụ thu</th>
        <th style="border:1px solid #ccc;padding:5px;text-align:right">Thành tiền</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderTemplate(html: string, invoice: InvoiceRow): string {
  const total = Number(invoice.grandTotal) || 0;
  const paid = Number(invoice.paidAmount) || 0;
  const items = invoice.items ?? [];

  const data: Record<string, string | number> = {
    customer_name: invoice.subjectName ?? "",
    phone: "",
    address: "",
    invoice_code: invoice.code ?? "",
    date: fmtDate(invoice.createdAt),
    total,
    da_thanh_toan: paid,
  };

  let output = html;

  output = output.replace(/\{\{items\}\}/g, renderItemsHtml(items));

  output = output.replace(/((?:[^<{]|<[^/])*?)=\s*([\d\s+\-*/().{{}}a-z_]+)/g, (match, label, expr) => {
    const replaced = expr.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => {
      const val = data[key];
      return typeof val === "number" ? String(val) : "0";
    });
    try {
      if (/^[\d\s+\-*/().]+$/.test(replaced.trim())) {
        // eslint-disable-next-line no-new-func
        const result = Function(`"use strict"; return (${replaced.trim()})`)();
        return label + fmtMoney(Number(result)) + " đ";
      }
    } catch {}
    return match;
  });

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
  invoice: InvoiceRow;
  onClose: () => void;
}

export function InvoicePrintPreview({ invoice, onClose }: Props) {
  const invoiceType = invoice.type;
  const printFrameRef = useRef<HTMLIFrameElement>(null);

  const { data: template, isLoading: loadingTemplate, error: templateError } = useQuery<InvoicePrintTemplateRow>({
    queryKey: ["/api/finance/invoice-print-templates/default", invoiceType],
    queryFn: async () => {
      const res = await fetch(`/api/finance/invoice-print-templates/default/${invoiceType}`, { credentials: "include" });
      if (res.status === 404) throw new Error("no_default");
      if (!res.ok) throw new Error("fetch_error");
      return res.json();
    },
    retry: false,
  });

  const { data: fullInvoice, isLoading: loadingInvoice } = useQuery<InvoiceRow>({
    queryKey: ["/api/finance/invoices", invoice.id],
    queryFn: async () => {
      const res = await fetch(`/api/finance/invoices/${invoice.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoice");
      return res.json();
    },
  });

  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");

  useEffect(() => {
    if (template?.orientation) {
      setOrientation(template.orientation as "portrait" | "landscape");
    }
  }, [template?.orientation]);

  const isLoading = loadingTemplate || loadingInvoice;
  const invoiceData = fullInvoice ?? invoice;
  const hasNoDefault = !loadingTemplate && (templateError as any)?.message === "no_default";
  const hasFetchError = !loadingTemplate && !hasNoDefault && !!templateError;

  const renderedHtml = template && !isLoading
    ? renderTemplate(template.html, invoiceData)
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
