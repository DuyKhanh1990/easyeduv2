import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useToast } from "@/hooks/use-toast";
import { useInvoiceSchedules } from "@/hooks/use-invoice-schedules";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Eye, Scissors, Pencil, Trash2, QrCode, Copy, FileText, Download, Landmark } from "lucide-react";
import { ScheduleStatusDropdown } from "./ScheduleStatusDropdown";
import { EditScheduleDialog } from "./EditScheduleDialog";
import { parseNum, fmtMoney, fmtDate, type ScheduleItem, STATUS_CONFIG, EINVOICE_STATUS_CONFIG } from "@/types/invoice-types";
import { getBankCode, sanitizeForBank } from "./qr-utils";

interface ParentInvoice {
  id: string;
  code?: string;
  name?: string;
  branch?: string;
  dueDate?: string;
  description?: string | null;
  note?: string | null;
}

export function ScheduleRows({
  invoiceId,
  isExpanded,
  visibleColumns,
  onSplit,
  invoice,
  selectedScheduleIds,
  onToggleSchedule,
  canSelect = true,
  onViewPrint,
  payerNames = [],
}: {
  invoiceId: string;
  isExpanded: boolean;
  visibleColumns: { key: string; label: string }[];
  onSplit: (s: ScheduleItem) => void;
  invoice?: ParentInvoice;
  selectedScheduleIds?: Set<string>;
  onToggleSchedule?: (s: ScheduleItem) => void;
  canSelect?: boolean;
  onViewPrint?: (s: ScheduleItem) => void;
  payerNames?: string[];
}) {
  const { toast } = useToast();
  const [editTarget, setEditTarget] = useState<ScheduleItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ScheduleItem | null>(null);
  const [viewTarget, setViewTarget] = useState<ScheduleItem | null>(null);
  const [qrTarget, setQrTarget] = useState<ScheduleItem | null>(null);

  const { schedules, isLoading, deleteMutation, updateStatusMutation } = useInvoiceSchedules(invoiceId);

  const totalCols = visibleColumns.length + 3;

  if (isLoading) {
    return (
      <tr>
        <td colSpan={totalCols} className="bg-blue-50/30 dark:bg-blue-900/10 py-2 px-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground pl-10">
            <div className="h-3 w-3 animate-spin rounded-full border border-blue-500 border-t-transparent" />
            Đang tải đợt thanh toán...
          </div>
        </td>
      </tr>
    );
  }

  if (schedules.length === 0) {
    return (
      <tr>
        <td colSpan={totalCols} className="bg-blue-50/30 dark:bg-blue-900/10 py-2 px-6">
          <p className="text-xs text-muted-foreground pl-10">Chưa có đợt thanh toán nào.</p>
        </td>
      </tr>
    );
  }

  const totalSchedules = schedules.length;
  const hasPayerFilter = payerNames.length > 0;
  const visibleSchedules = hasPayerFilter
    ? schedules.filter(s => s.paidByName && payerNames.includes(s.paidByName))
    : schedules;

  if (!isExpanded) return null;

  if (hasPayerFilter && visibleSchedules.length === 0) {
    return (
      <tr>
        <td colSpan={totalCols} className="bg-blue-50/30 dark:bg-blue-900/10 py-2 px-6">
          <p className="text-xs text-muted-foreground pl-10">
            Không có đợt thanh toán phù hợp với người thanh toán đã chọn.
          </p>
        </td>
      </tr>
    );
  }

  const renderScheduleCell = (colKey: string, s: ScheduleItem) => {
    switch (colKey) {
      case "code":
        return (
          <td key="code" className="py-2 px-3 whitespace-nowrap">
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-medium text-blue-700">{s.code ?? s.label}</span>
              {s.code && <span className="text-[10px] text-muted-foreground">{s.label.toLowerCase()}</span>}
            </div>
          </td>
        );
      case "total":
        return (
          <td key="total" className="py-2 px-3 text-right whitespace-nowrap">
            <span className="text-xs font-semibold">{fmtMoney(parseNum(s.amount))}</span>
          </td>
        );
      case "status":
        return (
          <td key="status" className="py-2 px-3 whitespace-nowrap">
            <ScheduleStatusDropdown
              scheduleId={s.id}
              currentStatus={s.status}
              updateStatusMutation={updateStatusMutation}
            />
          </td>
        );
      case "einvoice": {
        if (s.status !== "paid") {
          return <td key="einvoice" className="py-2 px-3 whitespace-nowrap text-muted-foreground text-xs">—</td>;
        }
        const key = s.einvoiceStatus ?? "none";
        const st = EINVOICE_STATUS_CONFIG[key] ?? EINVOICE_STATUS_CONFIG.none;
        return (
          <td key="einvoice" className="py-2 px-3 whitespace-nowrap" data-testid={`einvoice-status-schedule-${s.id}`}>
            <span
              className={`inline-flex items-center text-xs px-2 py-0.5 rounded-md font-medium ${st.className}`}
              title={s.einvoiceMessage ?? undefined}
            >
              {st.label}
            </span>
          </td>
        );
      }
      case "dueDate":
        return (
          <td key="dueDate" className="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">
            {fmtDate(s.dueDate)}
          </td>
        );
      case "creator":
        return <td key="creator" className="py-2 px-3 whitespace-nowrap text-xs text-muted-foreground">{s.createdByName ?? "—"}</td>;
      case "createdAt":
        return <td key="createdAt" className="py-2 px-3 whitespace-nowrap text-xs text-muted-foreground">{fmtDate(s.createdAt)}</td>;
      case "paidBy":
        return <td key="paidBy" className="py-2 px-3 whitespace-nowrap text-xs text-muted-foreground">{s.paidByName ?? "—"}</td>;
      case "paidAt":
        return <td key="paidAt" className="py-2 px-3 whitespace-nowrap text-xs text-muted-foreground">{fmtDate(s.paidAt)}</td>;
      case "updater":
        return <td key="updater" className="py-2 px-3 whitespace-nowrap text-xs text-muted-foreground">{s.updatedByName ?? "—"}</td>;
      case "updatedAt":
        return <td key="updatedAt" className="py-2 px-3 whitespace-nowrap text-xs text-muted-foreground">{fmtDate(s.updatedAt)}</td>;
      default:
        return <td key={colKey} className="py-2 px-3" />;
    }
  };

  return (
    <>
      {visibleSchedules.map((s) => {
        const isPaid = s.status === "paid";
        const canDelete = !isPaid && totalSchedules > 1;
        const isSelected = selectedScheduleIds?.has(s.id) ?? false;
        const canSign = isPaid && s.einvoiceStatus !== "published";

        return (
          <tr key={s.id} className={`border-b transition-colors ${isSelected ? "bg-purple-50 dark:bg-purple-900/10" : "bg-blue-50/40 dark:bg-blue-900/10 hover:bg-blue-100/40"}`} data-testid={`row-schedule-${s.id}`}>
            <td className="p-0 w-8 sticky left-0 z-10 bg-white" />
            <td className="p-3 w-10 sticky left-8 z-10 bg-white">
              {canSelect && (
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggleSchedule?.(s)}
                  data-testid={`checkbox-schedule-${s.id}`}
                />
              )}
            </td>
            {visibleColumns.map(col => renderScheduleCell(col.key, s))}
            <td className="py-2 px-3 sticky right-0 bg-white dark:bg-background border-l">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                    data-testid={`button-menu-schedule-${s.id}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem
                    onClick={() => onViewPrint ? onViewPrint(s) : setViewTarget(s)}
                    data-testid={`menu-view-schedule-${s.id}`}
                  >
                    <Eye className="h-3.5 w-3.5 mr-2 text-blue-600" />
                    Xem
                  </DropdownMenuItem>
                  {!isPaid && (
                    <DropdownMenuItem onClick={() => onSplit(s)} data-testid={`menu-split-schedule-${s.id}`}>
                      <Scissors className="h-3.5 w-3.5 mr-2 text-blue-600" />
                      Tách
                    </DropdownMenuItem>
                  )}
                  {!isPaid && (
                    <DropdownMenuItem onClick={() => setEditTarget(s)} data-testid={`menu-edit-schedule-${s.id}`}>
                      <Pencil className="h-3.5 w-3.5 mr-2 text-gray-600" />
                      Sửa
                    </DropdownMenuItem>
                  )}
                  {s.einvoiceStatus === "draft" && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => window.open(`/api/einvoice/schedule-pdf/${s.id}`, "_blank", "noopener,noreferrer")}
                        data-testid={`menu-einvoice-preview-schedule-${s.id}`}
                      >
                        <FileText className="h-3.5 w-3.5 mr-2 text-indigo-600" />
                        Xem thử PDF
                      </DropdownMenuItem>
                    </>
                  )}
                  {s.einvoiceStatus === "published" && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => window.open(`/api/einvoice/schedule-pdf/${s.id}`, "_blank", "noopener,noreferrer")}
                        data-testid={`menu-einvoice-pdf-schedule-${s.id}`}
                      >
                        <Download className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                        Tải PDF hoá đơn
                      </DropdownMenuItem>
                    </>
                  )}
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setDeleteTarget(s)}
                        className="text-red-600 focus:text-red-600"
                        data-testid={`menu-delete-schedule-${s.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Xoá
                      </DropdownMenuItem>
                    </>
                  )}
                  {s.status !== "paid" && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setQrTarget(s)} data-testid={`menu-qr-schedule-${s.id}`}>
                        <QrCode className="h-3.5 w-3.5 mr-2 text-purple-600" />
                        Mã QR
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </td>
          </tr>
        );
      })}

      {/* View dialog */}
      {viewTarget && (
        <ScheduleViewDialog
          schedule={viewTarget}
          invoice={invoice}
          onClose={() => setViewTarget(null)}
        />
      )}

      {/* Edit dialog */}
      {editTarget && (
        <EditScheduleDialog
          schedule={editTarget}
          invoiceId={invoiceId}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* Delete confirm dialog */}
      {deleteTarget && (
        <Dialog open onOpenChange={() => setDeleteTarget(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-4 w-4" /> Xoá đợt thanh toán
              </DialogTitle>
            </DialogHeader>
            <div className="py-3 space-y-3">
              <p className="text-sm">Bạn chắc chắn muốn xoá đợt <span className="font-semibold">{deleteTarget.label}</span>?</p>
              <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-xs text-yellow-800 space-y-1">
                <p className="font-semibold">Lưu ý nghiệp vụ:</p>
                <p>Số tiền <span className="font-semibold">{fmtMoney(parseNum(deleteTarget.amount))}</span> sẽ được cộng vào đợt cuối cùng để đảm bảo tổng tiền không thay đổi.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>Huỷ</Button>
              <Button
                variant="destructive"
                onClick={() =>
                  deleteMutation.mutate(deleteTarget.id, {
                    onSuccess: () => {
                      setDeleteTarget(null);
                      toast({ title: "Đã xoá đợt thanh toán" });
                    },
                    onError: (err: any) => toast({ title: "Lỗi xoá", description: err.message, variant: "destructive" }),
                  })
                }
                disabled={deleteMutation.isPending}
                data-testid="button-confirm-delete-schedule"
              >
                {deleteMutation.isPending ? "Đang xoá..." : "Xác nhận xoá"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* QR dialog */}
      {qrTarget && (
        <ScheduleQRDialog
          schedule={qrTarget}
          invoice={invoice}
          onClose={() => setQrTarget(null)}
        />
      )}
    </>
  );
}

/* ─── View dialog ─────────────────────────────────────────── */
function ScheduleViewDialog({
  schedule,
  invoice,
  onClose,
}: {
  schedule: ScheduleItem;
  invoice?: ParentInvoice;
  onClose: () => void;
}) {
  const statusCfg = STATUS_CONFIG[schedule.status] ?? STATUS_CONFIG.unpaid;
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" />
            Chi tiết đợt thanh toán
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3 text-sm">
          {invoice?.code && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Hóa đơn</span>
              <span className="font-medium text-primary">{invoice.code}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Mã đợt</span>
            <span className="font-semibold text-blue-700">{schedule.code ?? schedule.label}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tên đợt</span>
            <span className="font-medium">{schedule.label}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Số tiền</span>
            <span className="font-bold text-base">{fmtMoney(parseNum(schedule.amount))}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Hạn thanh toán</span>
            <span>{fmtDate(schedule.dueDate)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Trạng thái</span>
            <Badge className={`text-xs ${statusCfg.className}`}>{statusCfg.label}</Badge>
          </div>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>Đóng</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface BidvVaInfo {
  vaCode: string;
  isNew: boolean;
  isEnabled: boolean;
  receiveAccount: string | null;
  accountName: string | null;
}

/* ─── QR dialog ───────────────────────────────────────────── */
export function ScheduleQRDialog({
  schedule,
  invoice,
  onClose,
}: {
  schedule: ScheduleItem;
  invoice?: ParentInvoice;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"standard" | "bidv">("standard");

  const { data: locationsData } = useQuery<any[]>({ queryKey: ["/api/locations"] });

  const location = locationsData?.find(
    (l) => l.name === invoice?.branch || (locationsData?.length === 1)
  ) ?? locationsData?.[0];

  // BIDV Virtual Account cho đợt thanh toán này
  const { data: bidvVa, isLoading: bidvLoading, isError: bidvError } = useQuery<BidvVaInfo>({
    queryKey: ["/api/bidv/virtual-account", "schedule", schedule.id],
    queryFn: async () => {
      const res = await fetch(`/api/bidv/virtual-account?scheduleId=${schedule.id}`);
      if (!res.ok) throw new Error("Không lấy được Virtual Account");
      return res.json();
    },
    enabled: !!schedule.id && tab === "bidv",
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const parseBanks = (loc: any) => {
    if (!loc) return [];
    try { return loc.bankAccounts ? JSON.parse(loc.bankAccounts) : []; } catch { return []; }
  };

  const banks = parseBanks(location);
  const primaryBank = banks[0] ?? null;
  const bankName = primaryBank?.bankName || "—";
  const bankAccount = primaryBank?.bankAccount || "—";
  const accountHolder = primaryBank?.accountHolder || "—";

  const amount = parseNum(schedule.amount);
  // Nội dung CK: ưu tiên mô tả hóa đơn gốc + label đợt, fallback về mã
  const parentDesc = invoice?.description?.trim() || invoice?.note?.trim() || "";
  const rawTransferContent = parentDesc
    ? `${schedule.label ?? schedule.code} ${parentDesc}`
    : invoice?.code
      ? `HP_${invoice.code}_${schedule.code ?? schedule.label}`
      : `HP_${schedule.code ?? schedule.label}`;
  const transferContent = sanitizeForBank(rawTransferContent);

  const resolvedBankCode = getBankCode(bankName);
  const vietQrUrl = location?.paymentQrUrl
    ? location.paymentQrUrl
    : `https://img.vietqr.io/image/${resolvedBankCode}-${bankAccount}-compact2.png?amount=${Math.round(amount)}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(accountHolder)}`;

  const bidvQrUrl = bidvVa?.vaCode
    ? `https://img.vietqr.io/image/BIDV-${bidvVa.vaCode}-compact2.png?amount=${Math.round(amount)}&addInfo=${encodeURIComponent(bidvVa.vaCode)}&accountName=${encodeURIComponent(bidvVa.accountName || "BIDV")}`
    : null;

  const handleCopy = (text: string, label?: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast({ title: "Đã sao chép", description: label ? `${label}: ${text}` : text });
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-purple-600" />
            Mã QR – {schedule.code ?? schedule.label}
          </DialogTitle>
          {/* Tab selector */}
          <div className="flex gap-1 mt-2 border-b border-border">
            <button
              onClick={() => setTab("standard")}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
                tab === "standard"
                  ? "border-purple-600 text-purple-600"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Chuyển khoản thường
            </button>
            <button
              onClick={() => setTab("bidv")}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 ${
                tab === "bidv"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Landmark className="h-3.5 w-3.5" />
              BIDV — Tự động
            </button>
          </div>
        </DialogHeader>

        {tab === "standard" && (
          <div className="flex flex-col items-center gap-4 py-2">
            {invoice?.name && (
              <p className="text-sm text-muted-foreground">Học viên: <span className="font-semibold text-foreground">{invoice.name}</span></p>
            )}
            <div className="rounded-xl border p-3 bg-white shadow-sm">
              <img
                src={vietQrUrl}
                alt="QR thanh toán"
                className="w-48 h-48 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
            <div className="w-full rounded-lg bg-muted/50 border p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ngân hàng</span>
                <span className="font-medium">{bankName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Số TK</span>
                <span className="font-medium font-mono">{bankAccount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Chủ TK</span>
                <span className="font-medium">{accountHolder}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Số tiền</span>
                <span className="font-bold text-red-600">{fmtMoney(amount)}</span>
              </div>
              <div className="h-px bg-border my-1" />
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Nội dung CK</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono font-semibold text-primary">{transferContent}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleCopy(transferContent, "Nội dung")} data-testid="button-copy-transfer-content">
                    {copied ? <span className="text-[10px] text-green-600">✓</span> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "bidv" && (
          <div className="flex flex-col items-center gap-4 py-2">
            {bidvLoading ? (
              <div className="text-sm text-muted-foreground py-8">Đang tải...</div>
            ) : bidvError ? (
              <div className="text-sm text-red-500 py-6 text-center px-4">
                Không thể tải thông tin BIDV.<br />
                Vui lòng thử lại sau.
              </div>
            ) : !bidvVa?.isEnabled ? (
              <div className="text-sm text-amber-600 py-6 text-center px-4">
                BIDV chưa được kích hoạt cho cơ sở này.<br />
                Vui lòng cấu hình trong Cài đặt → BIDV.
              </div>
            ) : (
              <>
                {invoice?.name && (
                  <p className="text-sm text-muted-foreground">Học viên: <span className="font-semibold text-foreground">{invoice.name}</span></p>
                )}
                <div className="rounded-xl border p-3 bg-white shadow-sm">
                  {bidvQrUrl ? (
                    <img
                      src={bidvQrUrl}
                      alt="QR BIDV"
                      className="w-48 h-48 object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="w-48 h-48 flex items-center justify-center text-muted-foreground text-sm">Không có QR</div>
                  )}
                </div>
                <div className="w-full rounded-lg bg-muted/50 border p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ngân hàng</span>
                    <span className="font-medium text-blue-600 font-semibold">BIDV</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">TK định danh</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono font-semibold">{bidvVa?.vaCode}</span>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleCopy(bidvVa?.vaCode ?? "", "TK định danh")}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {bidvVa?.accountName && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Người nhận</span>
                      <span className="font-medium">{bidvVa.accountName}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Số tiền</span>
                    <span className="font-bold text-red-600">{fmtMoney(amount)}</span>
                  </div>
                </div>
                <p className="text-xs text-green-600 flex items-center gap-1">
                  ✓ Tự động xác nhận sau khi nhận tiền
                </p>
              </>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>Đóng</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
