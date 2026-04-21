import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useToast } from "@/hooks/use-toast";
import { useInvoiceSchedules } from "@/hooks/use-invoice-schedules";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Eye, Scissors, Pencil, Trash2, QrCode, Copy } from "lucide-react";
import { ScheduleStatusDropdown } from "./ScheduleStatusDropdown";
import { EditScheduleDialog } from "./EditScheduleDialog";
import { parseNum, fmtMoney, fmtDate, type ScheduleItem, STATUS_CONFIG } from "@/types/invoice-types";

interface ParentInvoice {
  id: string;
  code?: string;
  name?: string;
  branch?: string;
  dueDate?: string;
}

export function ScheduleRows({
  invoiceId,
  isExpanded,
  visibleColumns,
  onSplit,
  invoice,
}: {
  invoiceId: string;
  isExpanded: boolean;
  visibleColumns: { key: string; label: string }[];
  onSplit: (s: ScheduleItem) => void;
  invoice?: ParentInvoice;
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
  const visibleSchedules = isExpanded ? schedules : schedules.slice(0, 1);

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
      case "dueDate":
        return (
          <td key="dueDate" className="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">
            {fmtDate(s.dueDate)}
          </td>
        );
      default:
        return <td key={colKey} className="py-2 px-3" />;
    }
  };

  return (
    <>
      {visibleSchedules.map((s) => {
        const isPaid = s.status === "paid";
        const canDelete = !isPaid && totalSchedules > 1;

        return (
          <tr key={s.id} className="border-b bg-blue-50/40 dark:bg-blue-900/10 hover:bg-blue-100/40 transition-colors" data-testid={`row-schedule-${s.id}`}>
            <td className="p-0" />
            <td className="p-0" />
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
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem onClick={() => setViewTarget(s)} data-testid={`menu-view-schedule-${s.id}`}>
                    <Eye className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
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

/* ─── QR dialog ───────────────────────────────────────────── */
function ScheduleQRDialog({
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

  const { data: locationsData } = useQuery<any[]>({ queryKey: ["/api/locations"] });

  const location = locationsData?.find(
    (l) => l.name === invoice?.branch || (locationsData?.length === 1)
  ) ?? locationsData?.[0];

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
  const transferContent = invoice?.code ? `HP_${invoice.code}_${schedule.code ?? schedule.label}` : `HP_${schedule.code ?? schedule.label}`;

  const vietQrUrl = location?.paymentQrUrl
    ? location.paymentQrUrl
    : `https://img.vietqr.io/image/MB-${bankAccount}-compact2.png?amount=${Math.round(amount)}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(accountHolder)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(transferContent).then(() => {
      setCopied(true);
      toast({ title: "Đã sao chép", description: `Nội dung: ${transferContent}` });
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
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          {invoice?.name && (
            <p className="text-sm text-muted-foreground">Học viên: <span className="font-semibold text-foreground">{invoice.name}</span></p>
          )}
          <div className="rounded-xl border p-3 bg-white shadow-sm">
            <img
              src={vietQrUrl}
              alt="QR thanh toán"
              className="w-48 h-48 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
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
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCopy} data-testid="button-copy-transfer-content">
                  {copied ? <span className="text-[10px] text-green-600">✓</span> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>Đóng</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
