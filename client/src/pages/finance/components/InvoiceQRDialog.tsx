import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, CheckCircle2, Building2, CreditCard, User, QrCode, Landmark } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type InvoiceRow, STATUS_CONFIG, parseNum, fmtMoney, fmtDate } from "@/types/invoice-types";

interface InvoiceQRDialogProps {
  invoice: InvoiceRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Tab = "standard" | "bidv";

interface BidvVaInfo {
  vaCode: string;
  isNew: boolean;
  isEnabled: boolean;
  receiveAccount: string | null;
  accountName: string | null;
}

interface BidvQrStatus {
  isQrEnabled: boolean;
}

import { getBankCode, sanitizeForBank } from "./qr-utils";

export function InvoiceQRDialog({ invoice, open, onOpenChange }: InvoiceQRDialogProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState<Tab>("standard");

  const { data: locationsData } = useQuery<any[]>({ queryKey: ["/api/locations"] });

  const location = locationsData?.find(
    (l) => l.name === invoice?.branch || (locationsData?.length === 1)
  ) ?? locationsData?.[0];

  const grandTotal = parseNum(invoice?.grandTotal);
  const remainingAmount = parseNum(invoice?.remainingAmount);
  const payAmount = remainingAmount > 0 ? remainingAmount : grandTotal;
  const status = invoice ? (STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG.unpaid) : null;

  const mainLocation = locationsData?.find((l) => l.isMain) ?? locationsData?.[0];
  const effectiveLoc = location ?? mainLocation;
  const invoiceLocationId = invoice?.locationId || undefined;
  const effectiveLocationId = invoiceLocationId || effectiveLoc?.id;

  const { data: bidvQrStatus } = useQuery<BidvQrStatus>({
    queryKey: ["/api/bidv/location-qr-status", effectiveLocationId],
    queryFn: async () => {
      const res = await fetch(`/api/bidv/location-qr-status?locationId=${effectiveLocationId}`);
      if (!res.ok) throw new Error("Không lấy được trạng thái QR BIDV");
      return res.json();
    },
    enabled: !!effectiveLocationId && open,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  // Giữ hành vi hiện tại trong lúc tải hoặc khi cơ sở chưa có cấu hình.
  const isBidvQrEnabled = bidvQrStatus?.isQrEnabled ?? true;

  const parseBanks = (loc: any) => {
    if (!loc) return [];
    try { return loc.bankAccounts ? JSON.parse(loc.bankAccounts) : []; } catch { return []; }
  };

  const banks = parseBanks(effectiveLoc);
  const primaryBank = banks[0] ?? null;
  const bankName = primaryBank?.bankName || "—";
  const bankAccount = primaryBank?.bankAccount || "—";
  const accountHolder = primaryBank?.accountHolder || "—";

  // Nội dung CK: dùng mô tả hóa đơn nếu có, fallback về note, rồi mới fallback về mã hóa đơn
  // sanitizeForBank loại bỏ dấu tiếng Việt và ký tự đặc biệt — bắt buộc để ngân hàng chấp nhận
  const invoiceAny = invoice as any;
  const rawTransferContent = invoice?.description?.trim()
    ? invoice.description.trim()
    : invoiceAny?.note?.trim()
      ? invoiceAny.note.trim()
      : invoice ? `HP_${invoice.code}` : "";
  const transferContent = sanitizeForBank(rawTransferContent);
  const qrAddInfo = transferContent;

  const resolvedBankCode = getBankCode(bankName);
  const vietQrUrl = location?.paymentQrUrl
    ? location.paymentQrUrl
    : `https://img.vietqr.io/image/${resolvedBankCode}-${bankAccount}-compact2.png?amount=${Math.round(grandTotal)}&addInfo=${encodeURIComponent(qrAddInfo)}&accountName=${encodeURIComponent(accountHolder)}`;

  // BIDV Virtual Account
  // Với đợt con (scheduleId có), query bằng scheduleId để lấy đúng VA — giống ScheduleQRDialog
  const invoiceScheduleId = (invoice as any)?.scheduleId as string | undefined;
  const bidvQueryParam = invoiceScheduleId
    ? `scheduleId=${invoiceScheduleId}`
    : `invoiceId=${invoice?.id}`;
  const { data: bidvVa, isLoading: bidvLoading } = useQuery<BidvVaInfo>({
    queryKey: ["/api/bidv/virtual-account", invoiceScheduleId ?? invoice?.id],
    queryFn: async () => {
      const res = await fetch(`/api/bidv/virtual-account?${bidvQueryParam}`);
      if (!res.ok) throw new Error("Không lấy được Virtual Account");
      return res.json();
    },
    enabled: !!(invoiceScheduleId ?? invoice?.id) && open && tab === "bidv" && isBidvQrEnabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // QR dùng vaCode làm account number trong URL — app ngân hàng sẽ hiển thị TK định danh (ví dụ: V3EE2000128)
  // receiveAccount (TK chuyên thu) là nội bộ BIDV, không cần encode vào QR
  const descSuffix = invoice?.code ? ` ${invoice.code}` : "";
  const bidvAddInfo = bidvVa?.vaCode
    ? sanitizeForBank(`${bidvVa.vaCode}${descSuffix}`)
    : "";
  const bidvQrUrl = bidvVa?.vaCode
    ? `https://img.vietqr.io/image/BIDV-${bidvVa.vaCode}-compact2.png?amount=${Math.round(payAmount)}&addInfo=${encodeURIComponent(bidvAddInfo)}&accountName=${encodeURIComponent(bidvVa.accountName || "BIDV")}`
    : null;

  const handleCopy = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast({ title: "Đã sao chép", description: `${label}: ${text}` });
      setTimeout(() => setCopied(false), 2000);
    });
  }, [toast]);

  useEffect(() => {
    if (!open) { setTab("standard"); return; }
    const interval = setInterval(() => setRefreshKey((k) => k + 1), 12000);
    return () => clearInterval(interval);
  }, [open]);

  useEffect(() => {
    if (!isBidvQrEnabled && tab === "bidv") setTab("standard");
  }, [isBidvQrEnabled, tab]);

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-purple-600" />
            THANH TOÁN HÓA ĐƠN
          </DialogTitle>
          {/* Tab selector */}
          <div className="flex gap-1 mt-3 border-b border-border">
            <button
              onClick={() => setTab("standard")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === "standard"
                  ? "border-purple-600 text-purple-600"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Chuyển khoản thường
            </button>
            {isBidvQrEnabled && (
              <button
                onClick={() => setTab("bidv")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  tab === "bidv"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Landmark className="h-3.5 w-3.5" />
                BIDV — Thanh toán tự động
              </button>
            )}
          </div>
        </DialogHeader>

        {tab === "standard" && (
          <div className="flex flex-col md:flex-row gap-0 min-h-[420px]">
            {/* LEFT: Payment info */}
            <div className="flex-[3] px-6 py-5 space-y-4 border-r border-border">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-muted-foreground">Học viên:</span>
                  <span className="font-semibold">{invoice.name || "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CreditCard className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-muted-foreground">Mã hóa đơn:</span>
                  <span className="font-semibold text-primary">{invoice.code}</span>
                </div>
              </div>
              <div className="h-px bg-border" />
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-muted-foreground text-sm">Số tiền:</span>
                  <span className="text-xl font-bold text-red-600" data-testid="text-qr-amount">{fmtMoney(grandTotal)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Hạn thanh toán:</span>
                  <span className="font-medium">{fmtDate(invoice.dueDate)}</span>
                </div>
              </div>
              <div className="h-px bg-border" />
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-muted-foreground">Ngân hàng:</span>
                  <span className="font-semibold">{bankName}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground pl-6">Số tài khoản:</span>
                  <span className="font-semibold font-mono">{bankAccount}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground pl-6">Chủ tài khoản:</span>
                  <span className="font-semibold uppercase">{accountHolder}</span>
                </div>
              </div>
              <div className="h-px bg-border" />
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Nội dung chuyển khoản:</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted px-3 py-2 rounded-md font-bold font-mono text-sm tracking-wide select-all" data-testid="text-transfer-content">
                    {transferContent}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleCopy(transferContent, "Nội dung")} className="h-9 gap-1.5 shrink-0" data-testid="button-copy-content">
                    {copied ? <><CheckCircle2 className="h-4 w-4 text-green-600" /> Đã copy</> : <><Copy className="h-4 w-4" /> Copy</>}
                  </Button>
                </div>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Trạng thái:</span>
                {status && (
                  <Badge className={`text-xs font-medium ${status.className}`} data-testid="badge-qr-status">
                    {invoice.status === "unpaid" ? "⏳ " : invoice.status === "paid" ? "✅ " : ""}
                    {status.label}
                  </Badge>
                )}
              </div>
            </div>

            {/* RIGHT: QR */}
            <div className="flex-[2] flex flex-col items-center justify-center gap-4 px-6 py-8 bg-muted/20">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground mb-1">
                <QrCode className="h-4 w-4" />
                Quét QR để thanh toán
              </div>
              <div className="border border-border bg-white rounded-xl p-3 shadow-sm" data-testid="qr-code-container">
                <img key={refreshKey} src={vietQrUrl} alt="QR thanh toán" className="w-56 h-56 object-contain rounded"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </div>
              <p className="text-xs text-center text-muted-foreground">Quét bằng app ngân hàng để thanh toán</p>
              <div className="space-y-1 text-xs text-center">
                <p className="flex items-center gap-1 text-green-600"><CheckCircle2 className="h-3.5 w-3.5" />Tự động điền số tiền</p>
                <p className="flex items-center gap-1 text-green-600"><CheckCircle2 className="h-3.5 w-3.5" />Tự động điền nội dung</p>
              </div>
            </div>
          </div>
        )}

        {tab === "bidv" && (
          <div className="flex flex-col md:flex-row gap-0 min-h-[420px]">
            {/* LEFT: BIDV VA info */}
            <div className="flex-[3] px-6 py-5 space-y-4 border-r border-border">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-muted-foreground">Học viên:</span>
                  <span className="font-semibold">{invoice.name || "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CreditCard className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-muted-foreground">Mã hóa đơn:</span>
                  <span className="font-semibold text-primary">{invoice.code}</span>
                </div>
              </div>

              <div className="h-px bg-border" />

              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-muted-foreground text-sm">Số tiền cần thanh toán:</span>
                  <span className="text-xl font-bold text-red-600">{fmtMoney(payAmount)}</span>
                </div>
              </div>

              <div className="h-px bg-border" />

              {/* BIDV bank info */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <Landmark className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  <span className="text-muted-foreground">Ngân hàng:</span>
                  <span className="font-semibold text-blue-700">BIDV</span>
                </div>
                {bidvVa?.vaCode && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground pl-6">TK định danh:</span>
                    <span className="font-semibold font-mono text-blue-700">{bidvVa.vaCode}</span>
                  </div>
                )}
                {bidvVa?.accountName && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground pl-6">Người nhận:</span>
                    <span className="font-semibold uppercase tracking-wide">{bidvVa.accountName}</span>
                  </div>
                )}
              </div>

              <div className="h-px bg-border" />

              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Trạng thái:</span>
                {status && (
                  <Badge className={`text-xs font-medium ${status.className}`}>
                    {invoice.status === "unpaid" ? "⏳ " : invoice.status === "paid" ? "✅ " : ""}
                    {status.label}
                  </Badge>
                )}
                {bidvVa?.isEnabled === false && (
                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-400 ml-2">
                    BIDV chưa bật
                  </Badge>
                )}
              </div>

              {invoice.description && (
                <>
                  <div className="h-px bg-border" />
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Mô tả hoá đơn:</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{invoice.description}</p>
                  </div>
                </>
              )}
            </div>

            {/* RIGHT: BIDV QR */}
            <div className="flex-[2] flex flex-col items-center justify-center gap-4 px-6 py-8 bg-blue-50/30">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-blue-700 mb-1">
                <QrCode className="h-4 w-4" />
                QR BIDV — Quét để thanh toán
              </div>

              <div className="border border-blue-200 bg-white rounded-xl p-3 shadow-sm">
                {bidvLoading ? (
                  <div className="w-56 h-56 bg-muted animate-pulse rounded" />
                ) : bidvQrUrl ? (
                  <img
                    key={`bidv-${refreshKey}`}
                    src={bidvQrUrl}
                    alt="QR BIDV"
                    className="w-56 h-56 object-contain rounded"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="w-56 h-56 flex items-center justify-center text-center text-sm text-muted-foreground p-4">
                    {bidvVa === undefined && !bidvLoading
                      ? "Cấu hình BIDV chưa sẵn sàng"
                      : "Không tạo được QR"}
                  </div>
                )}
              </div>

              <p className="text-xs text-center text-muted-foreground">
                Quét bằng app BIDV SmartBanking hoặc bất kỳ app ngân hàng nào
              </p>
              {bidvVa?.vaCode && (
                <div className="space-y-1 text-xs text-center">
                  <p className="flex items-center gap-1 text-green-600"><CheckCircle2 className="h-3.5 w-3.5" />Tự động xác nhận sau khi nhận tiền</p>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
