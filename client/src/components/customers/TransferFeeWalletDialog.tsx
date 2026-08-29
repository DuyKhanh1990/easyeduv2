import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Check, ChevronDown, Loader2, Search } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type WalletSummary = { hocPhi: number; datCoc: number; total: number };
type Recipient = {
  id: string;
  fullName: string;
  code: string;
  type: string | null;
};

function formatCurrency(value: number) {
  return value.toLocaleString("vi-VN") + " đ";
}

type Props = {
  open: boolean;
  onClose: () => void;
  studentId: string;
  summary: WalletSummary;
};

export function TransferFeeWalletDialog({ open, onClose, studentId, summary }: Props) {
  const { toast } = useToast();
  const [recipientId, setRecipientId] = useState("");
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [hocPhiAmount, setHocPhiAmount] = useState("");
  const [datCocAmount, setDatCocAmount] = useState("");
  const [description, setDescription] = useState("");

  const { data: recipientsData, isLoading: recipientsLoading } = useQuery<{ students: Recipient[] }>({
    queryKey: ["/api/students", "wallet-transfer-recipients"],
    queryFn: () => apiRequest("GET", "/api/students?minimal=true&limit=500").then(res => res.json()),
    enabled: open,
    staleTime: 30_000,
  });

  const recipients = useMemo(
    () => (recipientsData?.students ?? []).filter(recipient => recipient.id !== studentId),
    [recipientsData, studentId],
  );
  const selectedRecipient = useMemo(
    () => recipients.find(recipient => recipient.id === recipientId),
    [recipients, recipientId],
  );
  const filteredRecipients = useMemo(() => {
    const search = recipientSearch.trim().toLocaleLowerCase("vi-VN");
    if (!search) return recipients;
    return recipients.filter(recipient =>
      [recipient.fullName, recipient.code, recipient.type ?? ""]
        .join(" ")
        .toLocaleLowerCase("vi-VN")
        .includes(search),
    );
  }, [recipients, recipientSearch]);

  const availableHocPhi = Math.max(0, Number(summary.hocPhi) || 0);
  const availableDatCoc = Math.max(0, Number(summary.datCoc) || 0);
  const availableTotal = availableHocPhi + availableDatCoc;
  const hasAvailableBalance = availableTotal > 0;
  const hocPhi = Math.max(0, Number(hocPhiAmount) || 0);
  const datCoc = Math.max(0, Number(datCocAmount) || 0);
  const total = hocPhi + datCoc;
  const exceedsTotal = total > availableTotal;

  const handleAmountChange = (
    setter: (value: string) => void,
    value: string,
  ) => {
    // Amounts are whole positive VND values. Empty is allowed while editing,
    // but zero, negative values, decimals, and scientific notation are not.
    if (value === "") {
      setter("");
      return;
    }
    if (!/^\d+$/.test(value)) return;
    const normalized = value.replace(/^0+(?=\d)/, "");
    setter(normalized === "0" ? "" : normalized);
  };

  const transferMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/students/fee-wallet-transfer", {
      fromStudentId: studentId,
      toStudentId: recipientId,
      hocPhiAmount: hocPhi,
      datCocAmount: datCoc,
      description,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students", studentId, "fee-wallet"] });
      if (recipientId) {
        queryClient.invalidateQueries({ queryKey: ["/api/students", recipientId, "fee-wallet"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/students", "wallet-transfer-recipients"] });
      toast({ title: "Đã chuyển tiền thành công" });
      setRecipientId("");
      setHocPhiAmount("");
      setDatCocAmount("");
      setDescription("");
      onClose();
    },
    onError: (error: any) => {
      toast({ title: "Không thể chuyển tiền", description: error.message, variant: "destructive" });
    },
  });

  const close = () => {
    if (transferMutation.isPending) return;
    setRecipientId("");
    setRecipientPickerOpen(false);
    setRecipientSearch("");
    setHocPhiAmount("");
    setDatCocAmount("");
    setDescription("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) close(); }}>
      <DialogContent
        className="max-w-2xl z-[301]"
        overlayClassName="z-[300]"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Chuyển tiền ví học phí
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Người nhận <span className="text-red-500">*</span></label>
            <Popover
              open={recipientPickerOpen}
              onOpenChange={openState => {
                setRecipientPickerOpen(openState);
                if (!openState) setRecipientSearch("");
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  data-testid="select-wallet-recipient"
                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <span className={selectedRecipient ? "truncate" : "truncate text-muted-foreground"}>
                    {selectedRecipient
                      ? `${selectedRecipient.fullName} (${selectedRecipient.code}) — ${
                          selectedRecipient.type === "Phụ huynh" ? "Phụ huynh" : "Học viên"
                        }`
                      : recipientsLoading ? "Đang tải danh sách..." : "Chọn học viên/phụ huynh"}
                  </span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={5}
                className="z-[400] w-[--radix-popover-trigger-width] p-0"
              >
                <div className="flex items-center border-b px-3">
                  <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                  <input
                    autoFocus
                    value={recipientSearch}
                    onChange={event => setRecipientSearch(event.target.value)}
                    placeholder="Tìm theo tên hoặc mã..."
                    className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    data-testid="input-search-wallet-recipient"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto p-1">
                  {!recipientsLoading && filteredRecipients.length === 0 && (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                      {recipients.length === 0 ? "Không có người nhận phù hợp" : "Không tìm thấy người nhận"}
                    </p>
                  )}
                  {filteredRecipients.map(recipient => {
                    const isSelected = recipient.id === recipientId;
                    return (
                      <button
                        type="button"
                        key={recipient.id}
                        onClick={() => {
                          setRecipientId(recipient.id);
                          setRecipientPickerOpen(false);
                          setRecipientSearch("");
                        }}
                        className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                      >
                        <Check className={`h-4 w-4 shrink-0 ${isSelected ? "opacity-100" : "opacity-0"}`} />
                        <span className="min-w-0 flex-1 truncate">
                          {recipient.fullName} ({recipient.code})
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {recipient.type === "Phụ huynh" ? "Phụ huynh" : "Học viên"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
              <h3 className="font-semibold text-sm">Tài khoản ví hiện tại</h3>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Học phí</span>
                <span className="font-semibold text-green-700">{formatCurrency(summary.hocPhi)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Đặt cọc</span>
                <span className="font-semibold text-violet-700">{formatCurrency(summary.datCoc)}</span>
              </div>
              <div className="flex justify-between border-t pt-3 text-sm">
                <span className="font-semibold text-foreground">Tổng</span>
                <span className="font-bold text-primary">{formatCurrency(availableTotal)}</span>
              </div>
            </div>

            <div className="rounded-lg border bg-primary/5 p-4 space-y-3">
              <h3 className="font-semibold text-sm">Số tiền ví chuyển</h3>
              <p className="text-xs text-muted-foreground">
                Số tiền nhập là số tiền ví người nhận sẽ nhận. Hệ thống ưu tiên trừ ví cùng loại trước, sau đó bù từ ví còn lại nếu cần.
              </p>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Học phí</label>
                <Input
                  type="number"
                  min={1}
                  max={availableTotal}
                  step={1}
                  disabled={!hasAvailableBalance || transferMutation.isPending}
                  value={hocPhiAmount}
                  onChange={event => handleAmountChange(setHocPhiAmount, event.target.value)}
                  onBlur={() => {
                    if (hocPhi <= 0) setHocPhiAmount("");
                  }}
                  placeholder="Nhập số tiền chuyển"
                  data-testid="input-transfer-hoc-phi"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Đặt cọc</label>
                <Input
                  type="number"
                  min={1}
                  max={availableTotal}
                  step={1}
                  disabled={!hasAvailableBalance || transferMutation.isPending}
                  value={datCocAmount}
                  onChange={event => handleAmountChange(setDatCocAmount, event.target.value)}
                  onBlur={() => {
                    if (datCoc <= 0) setDatCocAmount("");
                  }}
                  placeholder="Nhập số tiền chuyển"
                  data-testid="input-transfer-dat-coc"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-3">
            <span className="font-semibold">Tổng cộng</span>
            <span className="text-lg font-bold text-primary">{formatCurrency(total)}</span>
          </div>
          {!hasAvailableBalance && (
            <p className="text-xs text-red-600">Không có số dư khả dụng để chuyển</p>
          )}
          {exceedsTotal && (
            <p className="text-xs text-red-600">
              Tổng tiền chuyển không được vượt quá {formatCurrency(availableTotal)}
            </p>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Mô tả</label>
            <Textarea
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder="Nhập mô tả chuyển tiền..."
              rows={3}
              data-testid="textarea-transfer-description"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={transferMutation.isPending}>Huỷ</Button>
          <Button
            onClick={() => transferMutation.mutate()}
            disabled={transferMutation.isPending || !recipientId || total <= 0 || exceedsTotal || !hasAvailableBalance}
            data-testid="button-confirm-wallet-transfer"
          >
            {transferMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Chuyển tiền
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}