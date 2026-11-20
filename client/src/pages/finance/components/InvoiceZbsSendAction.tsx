import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileCheck2, Loader2, Send } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type Preview = {
  invoice: { id: string; code: string | null; studentId: string; studentName: string; amount: number };
  template: { id: string; name: string; data: Record<string, string | number> };
  recipients: {
    phones: { kind: "parent" | "student"; label: string; phone: string }[];
    uid: string | null;
  };
};

export function InvoiceZbsSendDialog({
  invoiceId,
  scheduleId,
  open,
  onOpenChange,
}: {
  invoiceId: string;
  scheduleId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [method, setMethod] = useState<"phone" | "uid">("phone");
  const [phoneKind, setPhoneKind] = useState("");
  const { toast } = useToast();
  const query = useQuery<Preview>({
    queryKey: ["/api/notification/zbs/invoices", invoiceId, "preview", scheduleId],
    enabled: open,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (scheduleId) params.set("scheduleId", scheduleId);
      const suffix = params.size ? `?${params.toString()}` : "";
      const response = await apiRequest("GET", `/api/notification/zbs/invoices/${invoiceId}/preview${suffix}`);
      return response.json();
    },
  });
  const preview = query.data;
  const phones = preview?.recipients.phones ?? [];
  const uidAvailable = !!preview?.recipients.uid;

  useEffect(() => {
    if (!preview) return;
    setPhoneKind(phones[0]?.kind ?? "");
    setMethod(phones.length > 0 ? "phone" : "uid");
  }, [preview?.invoice.id, scheduleId]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/notification/zbs/invoices/${invoiceId}/send`, {
        scheduleId,
        method,
        phoneKind: method === "phone" ? phoneKind : undefined,
      });
      return response.json() as Promise<{ success: boolean; recipientLabel: string }>;
    },
    onSuccess: (result) => {
      toast({ title: "Đã gửi Zalo ZBS", description: `Đã gửi ${preview?.template.name} đến ${result.recipientLabel}.` });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Chưa gửi được tin ZBS", description: error.message, variant: "destructive" });
    },
  });

  const hasRecipient = method === "phone" ? phones.some((item) => item.kind === phoneKind) : uidAvailable;

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !sendMutation.isPending && onOpenChange(next)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-emerald-600" />
              Gửi thông báo học phí qua ZBS
            </DialogTitle>
            <DialogDescription>
              Chỉ gửi hóa đơn này sau khi bạn xác nhận. Hệ thống không tự gửi khi tạo hóa đơn.
            </DialogDescription>
          </DialogHeader>

          {query.isLoading ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : query.error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Không thể chuẩn bị tin ZBS: {query.error instanceof Error ? query.error.message : "Lỗi không xác định"}
            </div>
          ) : preview ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-slate-50 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{preview.invoice.studentName}</span>
                  <Badge variant="outline">{preview.invoice.code || "Hóa đơn"}</Badge>
                </div>
                <div className="mt-1 text-slate-500">
                  Số tiền trong tin: {new Intl.NumberFormat("vi-VN").format(preview.invoice.amount)} ₫
                </div>
                <div className="mt-2 text-xs text-slate-500">Mẫu: {preview.template.name} · ID {preview.template.id}</div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Gửi tới</div>
                <Select value={method} onValueChange={(value: "phone" | "uid") => setMethod(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="phone" disabled={phones.length === 0}>Số điện thoại</SelectItem>
                    <SelectItem value="uid" disabled={!uidAvailable}>UID Zalo đã liên kết</SelectItem>
                  </SelectContent>
                </Select>
                {method === "phone" && phones.length > 0 && (
                  <Select value={phoneKind} onValueChange={setPhoneKind}>
                    <SelectTrigger><SelectValue placeholder="Chọn số điện thoại" /></SelectTrigger>
                    <SelectContent>
                      {phones.map((phone) => (
                        <SelectItem key={`${phone.kind}-${phone.phone}`} value={phone.kind}>
                          {phone.label}: {phone.phone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {method === "uid" && uidAvailable && (
                  <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    UID đã liên kết với học viên: <span className="font-mono">{preview.recipients.uid}</span>
                  </div>
                )}
                {!hasRecipient && (
                  <p className="text-xs text-amber-700">Học viên chưa có người nhận phù hợp cho cách gửi đã chọn.</p>
                )}
              </div>

              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                Đây là thao tác gửi thật qua OA; có thể sử dụng hạn mức hoặc phát sinh phí ZBS. Kiểm tra người nhận trước khi gửi.
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sendMutation.isPending}>Hủy</Button>
            <Button
              onClick={() => sendMutation.mutate()}
              disabled={!preview || !hasRecipient || query.isLoading || !!query.error || sendMutation.isPending}
              className="gap-2"
            >
              {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sendMutation.isPending ? "Đang gửi..." : "Xác nhận gửi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
