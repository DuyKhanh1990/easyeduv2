import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, CheckCircle2, Building2, CreditCard, User, QrCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type InvoiceRow, STATUS_CONFIG, parseNum, fmtMoney, fmtDate } from "@/types/invoice-types";

interface InvoiceQRDialogProps {
  invoice: InvoiceRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InvoiceQRDialog({ invoice, open, onOpenChange }: InvoiceQRDialogProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: locationsData } = useQuery<any[]>({ queryKey: ["/api/locations"] });

  const location = locationsData?.find(
    (l) => l.name === invoice?.branch || (locationsData?.length === 1)
  ) ?? locationsData?.[0];

  const transferContent = invoice ? `HP_${invoice.code}` : "";
  const grandTotal = parseNum(invoice?.grandTotal);
  const status = invoice ? (STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG.unpaid) : null;

  const mainLocation = locationsData?.find((l) => l.isMain) ?? locationsData?.[0];
  const effectiveLoc = location ?? mainLocation;

  const parseBanks = (loc: any) => {
    if (!loc) return [];
    try { return loc.bankAccounts ? JSON.parse(loc.bankAccounts) : []; } catch { return []; }
  };

  const banks = parseBanks(effectiveLoc);
  const primaryBank = banks[0] ?? null;
  const bankName = primaryBank?.bankName || "—";
  const bankAccount = primaryBank?.bankAccount || "—";
  const accountHolder = primaryBank?.accountHolder || "—";

  const vietQrUrl = location?.paymentQrUrl
    ? location.paymentQrUrl
    : `https://img.vietqr.io/image/MB-${bankAccount}-compact2.png?amount=${Math.round(grandTotal)}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(accountHolder)}`;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(transferContent).then(() => {
      setCopied(true);
      toast({ title: "Đã sao chép", description: `Nội dung: ${transferContent}` });
      setTimeout(() => setCopied(false), 2000);
    });
  }, [transferContent, toast]);

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      setRefreshKey((k) => k + 1);
    }, 12000);
    return () => clearInterval(interval);
  }, [open]);

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-purple-600" />
            THANH TOÁN HÓA ĐƠN
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col md:flex-row gap-0 min-h-[420px]">
          {/* ===== LEFT: Payment info (60%) ===== */}
          <div className="flex-[3] px-6 py-5 space-y-4 border-r border-border">
            {/* Student & Invoice */}
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

            {/* Amount & Due */}
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

            {/* Bank info */}
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

            {/* Transfer content */}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Nội dung chuyển khoản:</p>
              <div className="flex items-center gap-2">
                <div
                  className="flex-1 bg-muted px-3 py-2 rounded-md font-bold font-mono text-sm tracking-wide select-all"
                  data-testid="text-transfer-content"
                >
                  {transferContent}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="h-9 gap-1.5 shrink-0"
                  data-testid="button-copy-content"
                >
                  {copied ? (
                    <><CheckCircle2 className="h-4 w-4 text-green-600" /> Đã copy</>
                  ) : (
                    <><Copy className="h-4 w-4" /> Copy</>
                  )}
                </Button>
              </div>
              <p className="text-xs text-amber-600 flex items-center gap-1">
                ⚠️ Chuyển đúng nội dung để hệ thống tự xác nhận
              </p>
            </div>

            <div className="h-px bg-border" />

            {/* Status */}
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

          {/* ===== RIGHT: QR Code (40%) ===== */}
          <div className="flex-[2] flex flex-col items-center justify-center gap-4 px-6 py-8 bg-muted/20">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground mb-1">
              <QrCode className="h-4 w-4" />
              Quét QR để thanh toán
            </div>

            <div
              className="border border-border bg-white rounded-xl p-3 shadow-sm"
              data-testid="qr-code-container"
            >
              <img
                key={refreshKey}
                src={vietQrUrl}
                alt="QR thanh toán"
                className="w-56 h-56 object-contain rounded"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>

            <p className="text-xs text-center text-muted-foreground">
              Quét bằng app ngân hàng để thanh toán
            </p>

            <div className="space-y-1 text-xs text-center">
              <p className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Tự động điền số tiền
              </p>
              <p className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Tự động điền nội dung
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
