import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { X, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PrintProps {
  type: "import" | "export";
  id: string;
  warehouseName: string | null;
  supplierName?: string | null;
  recipientName?: string | null;
  locationName?: string | null;
  createdByName?: string | null;
  onClose: () => void;
}

function fmtVND(val: number | string | null | undefined) {
  if (val == null) return "0";
  const n = typeof val === "string" ? parseFloat(val) : val;
  return isNaN(n) ? "0" : n.toLocaleString("vi-VN");
}

function fmtDateLong(dateStr: string | null | undefined) {
  if (!dateStr) return "";
  const s = dateStr.includes("T") ? dateStr : dateStr + "T00:00:00";
  const d = new Date(s);
  return `Ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
}

function fmtDateFull(dateStr: string | null | undefined) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
}

export function StoreReceiptPrintDialog({
  type, id, warehouseName, supplierName, recipientName, locationName, createdByName, onClose,
}: PrintProps) {
  const apiPath = type === "import"
    ? `/api/store/receipts/${id}`
    : `/api/store/issue-receipts/${id}`;

  const { data: detail, isLoading } = useQuery({
    queryKey: ["print", apiPath],
    queryFn: () => apiRequest("GET", apiPath).then(r => r.json()),
    staleTime: 30000,
  });

  const items: any[] = detail?.items ?? [];
  const priceField = type === "import" ? "costPrice" : "salePrice";
  const title = type === "import" ? "Phiếu nhập kho" : "Phiếu xuất kho";

  const totalQty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const totalAmt = items.reduce((s, i) => {
    const price = parseFloat(i[priceField] ?? "0") || 0;
    return s + (Number(i.quantity) || 0) * price;
  }, 0);

  const sigLabels = type === "import"
    ? ["NGƯỜI LẬP PHIẾU", "KẾ TOÁN", "THỦ QUỸ", "CHỦ NHIỆM", "NGƯỜI CHUYỂN HÀNG"]
    : ["NGƯỜI LẬP PHIẾU", "KẾ TOÁN", "THỦ QUỸ", "CHỦ NHIỆM", "NGƯỜI NHẬN HÀNG"];

  function handlePrint() {
    const el = document.getElementById("store-print-area");
    if (!el) return;
    const w = window.open("", "_blank", "width=820,height=1000");
    if (!w) return;
    w.document.write(`
      <html><head><title>${title} - ${detail?.code ?? ""}</title>
      <style>
        body { font-family: 'Times New Roman', serif; font-size: 13px; color: #000; margin: 0; padding: 24px; }
        h1 { font-size: 22px; font-weight: bold; text-align: center; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px; }
        .subtitle { text-align: center; font-size: 12px; color: #555; margin-bottom: 16px; }
        .meta { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
        .receipt-no { border: 1px solid #666; padding: 3px 10px; font-family: monospace; font-size: 12px; }
        .info-row { display: flex; gap: 8px; margin-bottom: 6px; font-size: 13px; }
        .info-label { width: 140px; flex-shrink: 0; color: #444; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th, td { border: 1px solid #777; padding: 5px 10px; }
        th { font-weight: bold; background: #f5f5f5; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .font-mono { font-family: monospace; font-size: 11px; }
        .total-row td { font-weight: bold; }
        .sigs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; text-align: center; margin-top: 16px; }
        .sig-label { font-weight: bold; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
        .sig-space { height: 52px; }
        .sig-name { font-size: 11px; color: #555; }
        .date-line { text-align: right; margin-bottom: 14px; font-size: 12px; color: #555; }
      </style></head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 300);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-4">
      <div className="bg-background rounded-2xl shadow-2xl flex flex-col" style={{ width: 780, maxHeight: "95vh" }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <span className="text-sm font-semibold">Xem phiếu</span>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Đang tải...</div>
          ) : (
            <div id="store-print-area" className="p-8" style={{ fontFamily: "'Times New Roman', serif", fontSize: 13, color: "#000" }}>
              <div className="meta" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div style={{ maxWidth: "45%", fontSize: 12, color: "#555" }}>
                  {locationName && <p style={{ fontWeight: 600, margin: 0 }}>{locationName}</p>}
                </div>
                <div className="receipt-no" style={{ border: "1px solid #666", padding: "3px 12px", fontFamily: "monospace", fontSize: 12 }}>
                  Số phiếu: {detail?.code ?? ""}
                </div>
              </div>

              <h1 style={{ fontSize: 22, fontWeight: "bold", textAlign: "center", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 4px" }}>{title}</h1>
              <p className="subtitle" style={{ textAlign: "center", fontSize: 12, color: "#555", marginBottom: 20 }}>
                {fmtDateLong(detail?.date)}
              </p>

              <div style={{ marginBottom: 20 }}>
                <div className="info-row" style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <span className="info-label" style={{ width: 140, flexShrink: 0, color: "#444" }}>Tên phiếu:</span>
                  <span style={{ fontWeight: 600 }}>{detail?.name ?? ""}</span>
                </div>
                {type === "export" && recipientName && (
                  <div className="info-row" style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <span className="info-label" style={{ width: 140, flexShrink: 0, color: "#444" }}>Họ và tên:</span>
                    <span style={{ fontWeight: 600 }}>{recipientName}</span>
                  </div>
                )}
                <div className="info-row" style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <span className="info-label" style={{ width: 140, flexShrink: 0, color: "#444" }}>Kho:</span>
                  <span style={{ fontWeight: 600 }}>{warehouseName ?? "—"}</span>
                </div>
                {type === "import" && supplierName && (
                  <div className="info-row" style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <span className="info-label" style={{ width: 140, flexShrink: 0, color: "#444" }}>Nhà cung cấp:</span>
                    <span style={{ fontWeight: 600 }}>{supplierName}</span>
                  </div>
                )}
                {detail?.note && (
                  <div className="info-row" style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <span className="info-label" style={{ width: 140, flexShrink: 0, color: "#444" }}>Mô tả:</span>
                    <span>{detail.note}</span>
                  </div>
                )}
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
                <thead>
                  <tr>
                    <th style={{ border: "1px solid #777", padding: "5px 10px", fontWeight: "bold", background: "#f5f5f5", textAlign: "left" }}>Mã sản phẩm</th>
                    <th style={{ border: "1px solid #777", padding: "5px 10px", fontWeight: "bold", background: "#f5f5f5", textAlign: "left" }}>Tên sản phẩm</th>
                    <th style={{ border: "1px solid #777", padding: "5px 10px", fontWeight: "bold", background: "#f5f5f5", textAlign: "center" }}>Số lượng</th>
                    <th style={{ border: "1px solid #777", padding: "5px 10px", fontWeight: "bold", background: "#f5f5f5", textAlign: "right" }}>Giá</th>
                    <th style={{ border: "1px solid #777", padding: "5px 10px", fontWeight: "bold", background: "#f5f5f5", textAlign: "right" }}>Tổng tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const price = parseFloat(item[priceField] ?? "0") || 0;
                    const total = (Number(item.quantity) || 0) * price;
                    return (
                      <tr key={idx}>
                        <td style={{ border: "1px solid #aaa", padding: "5px 10px", fontFamily: "monospace", fontSize: 11 }}>{item.productCode}</td>
                        <td style={{ border: "1px solid #aaa", padding: "5px 10px" }}>{item.productName}</td>
                        <td style={{ border: "1px solid #aaa", padding: "5px 10px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{item.quantity}</td>
                        <td style={{ border: "1px solid #aaa", padding: "5px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtVND(price)}</td>
                        <td style={{ border: "1px solid #aaa", padding: "5px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtVND(total)}</td>
                      </tr>
                    );
                  })}
                  <tr className="total-row">
                    <td colSpan={2} style={{ border: "1px solid #777", padding: "5px 10px", fontWeight: "bold" }}></td>
                    <td style={{ border: "1px solid #777", padding: "5px 10px", textAlign: "center", fontWeight: "bold", fontVariantNumeric: "tabular-nums" }}>{totalQty}</td>
                    <td style={{ border: "1px solid #777", padding: "5px 10px" }}></td>
                    <td style={{ border: "1px solid #777", padding: "5px 10px", textAlign: "right", fontWeight: "bold", fontVariantNumeric: "tabular-nums" }}>{fmtVND(totalAmt)}</td>
                  </tr>
                </tbody>
              </table>

              <div style={{ textAlign: "right", marginBottom: 20, fontSize: 12, color: "#555" }}>
                {locationName ? locationName + ", " : ""}{fmtDateFull(detail?.createdAt ?? detail?.created_at)}
              </div>

              <div className="sigs" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, textAlign: "center" }}>
                {sigLabels.map(label => (
                  <div key={label}>
                    <p className="sig-label" style={{ fontWeight: "bold", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>{label}</p>
                    <div className="sig-space" style={{ height: 52 }} />
                    <p className="sig-name" style={{ fontSize: 11, color: "#555", margin: 0 }}>{createdByName ?? ""}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>Đóng</Button>
          <Button size="sm" onClick={handlePrint} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
            <Printer className="w-3.5 h-3.5" /> IN PHIẾU
          </Button>
        </div>
      </div>
    </div>
  );
}
