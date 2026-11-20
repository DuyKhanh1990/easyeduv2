import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { QrCode, ShieldCheck, ZoomIn } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface StudentAttendanceQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: {
    id: string;
    code?: string | null;
    fullName?: string | null;
  };
}

export interface StudentAttendanceQrData {
  enabled: boolean;
  token?: string;
  createdAt?: string;
}

export function useStudentAttendanceQr(studentId: string, enabled: boolean) {
  return useQuery<StudentAttendanceQrData>({
    queryKey: ["/api/attendance-qr/students", studentId],
    queryFn: () => apiRequest("GET", `/api/attendance-qr/students/${studentId}`).then((res) => res.json()),
    enabled: enabled && !!studentId,
    staleTime: 5 * 60_000,
  });
}

function getQrValue(token?: string) {
  if (!token || typeof window === "undefined") return "";
  return `${window.location.origin}/attendance/qr?token=${encodeURIComponent(token)}`;
}

export function StudentAttendanceQrDialog({
  open,
  onOpenChange,
  student,
}: StudentAttendanceQrDialogProps) {
  const qrQuery = useStudentAttendanceQr(student.id, open);
  const qrValue = useMemo(() => getQrValue(qrQuery.data?.token), [qrQuery.data?.token]);
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
              Không tải được mã QR mặc định
            </div>
          )}

          {qrQuery.isError && (
            <p className="w-full rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600">
              {(qrQuery.error as Error)?.message || "Không thể tải mã QR."}
            </p>
          )}

          <p className="text-center text-xs text-muted-foreground">
            Đây là mã QR mặc định của học viên. Có thể bấm vào mã QR bên dưới avatar để phóng to.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StudentAttendanceQrInline({
  student,
}: {
  student: { id: string; code?: string | null; fullName?: string | null };
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const qrQuery = useStudentAttendanceQr(student.id, true);
  const qrValue = useMemo(() => getQrValue(qrQuery.data?.token), [qrQuery.data?.token]);

  if (qrQuery.isLoading) {
    return <div className="h-[76px] w-[76px] animate-pulse rounded-lg bg-slate-100" aria-label="Đang tải mã QR" />;
  }

  if (qrQuery.isError || !qrValue) {
    return (
      <div className="flex h-[76px] w-[76px] items-center justify-center rounded-lg border border-dashed border-slate-200 text-center text-[9px] text-slate-400">
        QR chưa sẵn sàng
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="group rounded-lg border border-slate-200 bg-white p-1 shadow-sm transition hover:border-indigo-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1"
        title="Bấm để phóng to mã QR điểm danh"
        aria-label="Phóng to mã QR điểm danh"
      >
        <QRCodeSVG value={qrValue} size={68} level="M" includeMargin />
        <span className="flex items-center justify-center gap-0.5 pt-0.5 text-[9px] font-medium text-slate-400 group-hover:text-indigo-600">
          <ZoomIn className="h-2.5 w-2.5" />
          Phóng to
        </span>
      </button>
      <StudentAttendanceQrDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        student={student}
      />
    </>
  );
}