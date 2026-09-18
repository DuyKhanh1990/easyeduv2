import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QrCode, RefreshCw, ShieldCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface StudentAttendanceQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: {
    id: string;
    code?: string | null;
    fullName?: string | null;
  };
}

export function StudentAttendanceQrDialog({
  open,
  onOpenChange,
  student,
}: StudentAttendanceQrDialogProps) {
  const queryClient = useQueryClient();
  const qrQuery = useQuery<{
    enabled: boolean;
    token?: string;
    createdAt?: string;
  }>({
    queryKey: ["/api/attendance-qr/students", student.id],
    queryFn: () => apiRequest("GET", `/api/attendance-qr/students/${student.id}`).then((res) => res.json()),
    enabled: open && !!student.id,
    staleTime: 0,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/attendance-qr/students/${student.id}`).then((res) => res.json()),
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/attendance-qr/students", student.id], data);
    },
  });

  const qrValue = useMemo(() => {
    if (!qrQuery.data?.token) return "";
    return `${window.location.origin}/attendance/qr?token=${encodeURIComponent(qrQuery.data.token)}`;
  }, [qrQuery.data?.token]);

  const isCreating = createMutation.isPending;
  const hasQr = !!qrQuery.data?.enabled && !!qrValue;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[300] sm:max-w-md" overlayClassName="z-[250]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-indigo-600" />
            QR điểm danh
          </DialogTitle>
          <DialogDescription>
            Mã QR cố định của học viên {student.fullName || student.code || ""}. Staff quét mã để xem lịch phù hợp và điểm danh nhanh.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {qrQuery.isLoading ? (
            <div className="flex h-64 w-64 items-center justify-center rounded-xl border bg-slate-50 text-sm text-muted-foreground">
              Đang tải mã QR...
            </div>
          ) : hasQr ? (
            <>
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <QRCodeSVG value={qrValue} size={240} level="M" includeMargin />
              </div>
              <div className="flex items-center gap-2 text-xs text-emerald-700">
                <ShieldCheck className="h-4 w-4" />
                Chỉ staff đã đăng nhập mới có thể sử dụng mã này
              </div>
            </>
          ) : (
            <div className="flex h-64 w-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-slate-50 px-6 text-center text-sm text-muted-foreground">
              <QrCode className="h-10 w-10 text-slate-300" />
              Chưa tạo mã QR cho học viên này
            </div>
          )}

          {(qrQuery.isError || createMutation.isError) && (
            <p className="w-full rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600">
              {((qrQuery.error || createMutation.error) as Error)?.message || "Không thể xử lý mã QR."}
            </p>
          )}

          <div className="flex w-full gap-2">
            <Button
              className="flex-1"
              variant={hasQr ? "outline" : "default"}
              onClick={() => createMutation.mutate()}
              disabled={isCreating}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isCreating ? "animate-spin" : ""}`} />
              {isCreating ? "Đang tạo..." : hasQr ? "Tạo lại mã QR" : "Tạo mã QR"}
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Tạo lại sẽ vô hiệu hóa mã QR cũ.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}